import { db, newId, nowIso, type Db } from './db';

/**
 * The queue that makes a phone with no signal safe to write to.
 *
 * A cold room is a metal box and a delivery route has no towers, so every
 * write has to succeed locally and reach the server later. That only works if
 * two things are true, and both are the reason this file exists rather than a
 * `fetch` next to each save:
 *
 *   - **Nothing is written without being queued.** The enqueue happens inside
 *     the same transaction as the row it describes, so there is no instant
 *     where the data exists and the intent to sync it does not. A crash lands
 *     on one side of that line or the other, never between.
 *
 *   - **Replaying is harmless.** Ids are generated on the device, and the
 *     server upserts by id, so sending the same entry twice changes nothing.
 *     That is what turns a flaky connection from a danger into a delay.
 *
 * Entries are kept after they are sent, briefly, so "did that go up?" is a
 * question with an answer.
 */

export type OutboxOp = 'upsert' | 'delete';

export type OutboxEntry = {
  id: string;
  table: string;
  rowId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  queuedAt: string;
};

export type PendingWrite = {
  table: string;
  rowId: string;
  op?: OutboxOp;
  payload?: Record<string, unknown>;
};

/**
 * Queues writes. Takes the connection rather than opening one, because the
 * caller is inside a transaction and this has to join it.
 */
export async function enqueue(conn: Db, writes: readonly PendingWrite[]): Promise<void> {
  const at = nowIso();

  for (const write of writes) {
    await conn.runAsync(
      `INSERT INTO outbox (id, table_name, row_id, op, payload, queued_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        write.table,
        write.rowId,
        write.op ?? 'upsert',
        JSON.stringify(write.payload ?? {}),
        at,
      ],
    );
  }
}

/**
 * The next entries to send, oldest first.
 *
 * Order is the point. A recipe line that arrives before its recipe is a
 * foreign key error on the server, and the only thing that reliably prevents
 * it is sending in the order the device wrote.
 */
export async function pendingEntries(limit = 100): Promise<OutboxEntry[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    table_name: string;
    row_id: string;
    op: OutboxOp;
    payload: string;
    queued_at: string;
  }>(
    `SELECT id, table_name, row_id, op, payload, queued_at
       FROM outbox WHERE sent_at IS NULL
      ORDER BY queued_at, rowid
      LIMIT ?`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    table: r.table_name,
    rowId: r.row_id,
    op: r.op,
    queuedAt: r.queued_at,
    payload: parsePayload(r.payload),
  }));
}

function parsePayload(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    // A payload that will not parse is a bug, not a reason to stall the queue
    // behind it forever. The row id is still there, so the server can be asked
    // to fetch the current state instead.
    return {};
  }
}

export async function pendingCount(): Promise<number> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NULL`,
  );
  return row?.n ?? 0;
}

/** Marks exactly what the server accepted, and nothing else. */
export async function markSent(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;

  const conn = await db();
  const at = nowIso();
  // Question marks only - every id below is bound, never interpolated.
  const marks = ids.map(() => '?').join(', ');  // proofgate-allow

  await conn.runAsync(
    `UPDATE outbox SET sent_at = ? WHERE id IN (${marks}) AND sent_at IS NULL`,
    [at, ...ids],
  );
}

/**
 * Drops entries that went up a while ago. They are worth keeping for a few
 * days so a person can be told what has and has not synced, and worth dropping
 * after that so a busy factory's phone does not carry a year of them.
 */
export async function forgetSentBefore(iso: string): Promise<void> {
  const conn = await db();
  await conn.runAsync(`DELETE FROM outbox WHERE sent_at IS NOT NULL AND sent_at < ?`, [iso]);
}

/**
 * As tabelas que a fila envia, cada uma com `id` próprio.
 *
 * Escrita à mão aqui e conferida contra o código em `src/data/outbox.test.ts`: a
 * guarda lê todo `enqueue` de `repository.ts` e reprova se alguém enfileirar uma
 * tabela que não está nesta lista. Lista escrita à mão que se confere consigo
 * mesma não guarda nada — foi a cicatriz do `erase.test.ts`, em 4 de setembro.
 *
 * `erase` não está aqui de propósito: é comando, não linha. Ele não tem linha
 * nenhuma atrás dele, e é justamente o que a varredura abaixo não pode confundir
 * com órfã.
 */
export const QUEUED_TABLES = [
  'items',
  'locations',
  'movements',
  'lots',
  'products',
  'purchases',
  'purchase_lines',
  'recipes',
  'recipe_versions',
  'recipe_lines',
  'readings',
  'orders',
  'order_lines',
  'product_lines',
  'product_types',
  'flavors',
  'profiles',
  'people',
  // A transportadora entra na varredura mesmo não sendo apagada por área nenhuma
  // menor: "apagar tudo" a leva, e a entrada órfã dela travaria a fila inteira
  // atrás de um cadastro que não existe mais.
  'carriers',
  // O acordo comercial e a série dele. `location_prices` é a única deste conjunto
  // que o aplicativo APAGA — tirar o acordo de uma loja é apagar a linha —, e é
  // exatamente por isso que ela precisa estar aqui: sem a varredura, a entrada da
  // fila apontaria para uma linha que não existe mais e o motor pararia na primeira
  // subida, com a fila travada atrás de um acordo desfeito.
  'location_prices',
  'sale_price_history',
] as const;

/**
 * Esquece o que a fila ia mandar de uma linha que não existe mais.
 *
 * **A cicatriz.** Apagar uma área — as compras de exemplo, que é o caso normal e
 * está descrito no próprio código — deixa na fila entradas apontando para linhas
 * que acabaram de ser apagadas. Órfã não é recusa do servidor: o serializador
 * levanta *"Queued movements X but the row is gone from the device"*, e o motor
 * para a fila no primeiro buraco de propósito. Uma exceção que repete, e tudo o
 * que a fábrica gravar depois fica preso atrás dela.
 *
 * Apagar é a resposta certa, e não é perda: a entrada nunca subiu (`sent_at` é
 * nulo), então o servidor nunca soube da linha. O que subiu tem `sent_at` e não é
 * tocado aqui — para aquele lado quem fala é o comando `erase`, que viaja depois
 * dos deletes e diz ao servidor o que a pessoa decidiu.
 *
 * Roda dentro da transação de quem apagou, pelo mesmo motivo do `enqueue`: não
 * pode existir instante em que a linha sumiu e a intenção de enviá-la continua.
 */
export async function forgetOrphans(conn: Db): Promise<number> {
  let esquecidas = 0;

  for (const table of QUEUED_TABLES) {
    // O nome vem de `QUEUED_TABLES`, uma lista fechada deste arquivo, então esta
    // interpolação não carrega nada que um chamador escolheu.
    const órfãs = await conn.getAllAsync<{ id: string }>(
      `SELECT o.id FROM outbox o
        WHERE o.sent_at IS NULL AND o.table_name = ?
          AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.id = o.row_id)`, // proofgate-allow
      [table],
    );
    if (órfãs.length === 0) continue;

    // Uma por uma, com o id ligado: a lista pode ser grande e um `IN` montado
    // seria a única interpolação de VALOR neste arquivo.
    for (const linha of órfãs) {
      await conn.runAsync(`DELETE FROM outbox WHERE id = ?`, [linha.id]);
    }
    esquecidas += órfãs.length;
  }

  return esquecidas;
}

/**
 * A linha que uma entrada da fila nomeia, lida CRUA.
 *
 * **Ela mora aqui por duas guardas que se cruzam.** Uma proíbe qualquer coisa fora
 * de `src/data` de escrever SQL — consulta escrita noutro lugar é a segunda
 * implementação de uma regra que já existe aqui. A outra proíbe a travessia de ler
 * pelo repositório, porque toda leitura de repositório filtra, arredonda ou esconde
 * algo para uma tela, inclusive o portão do dinheiro: o que atravessa não pode
 * depender de quem estava com o aparelho na hora de sincronizar.
 *
 * O encontro das duas é exatamente isto — uma leitura sem portão, sem filtro e sem
 * frase, que devolve a linha como ela está gravada. Nenhuma tela a chama.
 *
 * O nome da tabela vem da fila deste aplicativo e mesmo assim é conferido: *"a fila
 * é escrita por este aplicativo, então não devia acontecer"* é o argumento que a
 * travessia inteira existe para recusar.
 */
export async function linhaDaFila(
  entry: Pick<OutboxEntry, 'table' | 'rowId'>,
): Promise<Record<string, unknown> | null> {
  // O comando de apagar não nomeia linha nenhuma: ele É o pedido.
  if (entry.table === 'erase') return null;
  if (!/^[a-z_][a-z0-9_]*$/.test(entry.table)) {
    throw new Error(`fila: nome de tabela que eu não escrevo em SQL: ${entry.table}`);
  }
  const conn = await db();
  return await conn.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM ${entry.table} WHERE id = ?`, // proofgate-allow
    [entry.rowId],
  );
}
