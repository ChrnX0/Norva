import { db, newId, nowIso, type Db } from './db';
import { readMeta, writeMeta } from './meta';

/**
 * Que este aparelho já entregou alguma linha ao servidor — fato, não linha de fila.
 *
 * Mora em `app_meta` porque `app_meta` não é varrido por nada: a faxina da fila
 * apaga o que subiu há mais de sete dias, e era da fila que a adoção lia a resposta.
 */
const CHAVE_PRIMEIRA_SUBIDA = 'sync.primeiraSubida';

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
    // **A ordem é a da ESCRITA, não a do relógio.**
    //
    // Ordenar por `queued_at` primeiro parece o mesmo e não é: o relógio do aparelho
    // anda para trás (fuso corrigido, hora automática ligada depois de dias errada,
    // troca de horário de verão) e aí uma linha gravada DEPOIS carrega um instante
    // ANTERIOR. A fila então oferece o filho antes do pai, o servidor recusa por
    // chave estrangeira, e nada resolve isso na tentativa seguinte: a recusa é
    // permanente e tudo o que vier atrás fica preso.
    //
    // `rowid` é o contador implícito do SQLite e cresce a cada inserção. A faxina só
    // apaga entradas ENVIADAS — que são sempre o prefixo mais antigo —, então não há
    // reuso de `rowid` que passe à frente de uma pendente.
    //
    // `queued_at` continua sendo o que a tela conta ("aquilo de terça subiu?") e o
    // que a faxina compara. Ele só deixa de decidir a ordem.
    // `recusada_em IS NULL` é o que faz o terceiro estado valer alguma coisa: sem ele a
    // linha posta de lado continuaria a ser oferecida, e a fila continuaria presa nela.
    `SELECT id, table_name, row_id, op, payload, queued_at
       FROM outbox WHERE sent_at IS NULL AND recusada_em IS NULL
      ORDER BY rowid
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

/**
 * Quantas ainda VÃO subir — e a recusada definitiva não é uma delas.
 *
 * Contá-la aqui seria a mentira simétrica à de carimbá-la como enviada: a tela diria
 * *"faltam 3"* para sempre, com três linhas que nunca vão faltar menos. Quem conta o que
 * ficou de lado é `rejectedCount`, logo abaixo, e a tela diz as duas coisas com palavras
 * diferentes. (Esta linha dizia `rejectedEntries` — a função que LISTARIA as recusadas, escrita
 * e apagada no mesmo commit porque o portão P1 a recusou sem chamador. **Ela nasceu em 12 de
 * setembro**, com a tela que mostra cada uma: `app/de-lado.tsx`, por `checksSetAside`.)
 */
export async function pendingCount(): Promise<number> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NULL AND recusada_em IS NULL`,
  );
  return row?.n ?? 0;
}

/** Quantas ficaram de lado por recusa definitiva. Zero é o caso normal. */
export async function rejectedCount(): Promise<number> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE recusada_em IS NOT NULL`,
  );
  return row?.n ?? 0;
}

/** Uma entrada que a fila pôs de lado: o que era, quando saiu da frente, e o código que decidiu. */
export type RejectedEntry = {
  id: string;
  table: string;
  rowId: string;
  /** Quando a FILA pôs de lado — não quando o fato aconteceu no mundo. */
  setAsideAt: string;
  /** O `SQLSTATE` que decidiu. Nulo quando o servidor recusou sem código. */
  codigo: string | null;
};

/**
 * As entradas postas de lado, uma por uma — a lista que `rejectedCount` só sabia contar.
 *
 * **Por que ela existe agora e não antes.** Escrita e apagada no mesmo commit em 11 de
 * setembro, porque o portão P1 recusa função sem chamador: contar bastava para a frase dos
 * Ajustes, e listar não servia a tela nenhuma. Hoje serve — o texto daquela frase promete
 * *"diz o que ficou, onde ver, e segue"*, e o "onde ver" não existia: a pessoa lia
 * *"3 não sobem"* sem ter como saber QUAIS três.
 *
 * Ela devolve a entrada da fila e mais nada. Quem transforma `row_id` no fato que a doca
 * conferiu — item, lugar, hora, quem operou — é `checksSetAside` no `repository.ts`, porque
 * esse é o módulo que sabe ler o livro-razão e aplicar o portão de quem pode ver o quê. A
 * fila não deve saber o que é uma conferência.
 *
 * **Sem empresa no filtro, e é de propósito.** A `outbox` é do APARELHO: ela não tem
 * `company_id` e nunca teve — a adoção (`src/data/adocao.ts`) proíbe trocar de empresa depois
 * da primeira linha subir, então toda entrada daqui é da mesma empresa. Filtrar por algo que
 * a tabela não tem seria inventar uma coluna para parecer cuidadoso.
 */
export async function rejectedEntries(): Promise<RejectedEntry[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    table_name: string;
    row_id: string;
    recusada_em: string;
    recusa_codigo: string | null;
  }>(
    // A mais recente primeiro: quem abre esta tela abre por causa do que acabou de acontecer.
    `SELECT id, table_name, row_id, recusada_em, recusa_codigo
       FROM outbox WHERE recusada_em IS NOT NULL
      ORDER BY recusada_em DESC, rowid DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    table: r.table_name,
    rowId: r.row_id,
    setAsideAt: r.recusada_em,
    codigo: r.recusa_codigo,
  }));
}

/** Marks exactly what the server accepted, and nothing else. */
/**
 * A linha que o servidor NUNCA vai aceitar sai da frente — e não é marcada como enviada.
 *
 * A diferença entre os dois carimbos é a mentira mais cara que esta fila pode contar. `sent_at`
 * quer dizer *"o servidor tem isto"*, e o razão do dono depende dessa frase ser verdade:
 * `adocao.ts` proíbe trocar de empresa depois de a primeira linha subir, e a faxina apaga o que
 * está enviado. Carimbar uma recusa como envio apagaria dado que nunca chegou a lugar nenhum.
 *
 * `recusada_em` diz outra coisa: *"esta não entra nunca, e está tudo bem"*. A entrada continua
 * no aparelho, com o `SQLSTATE` que decidiu ao lado, e a faxina não a toca — quem conferiu vai
 * querer saber por que ela não subiu, e a resposta tem de estar na linha.
 *
 * Quem decide se a recusa é definitiva é `classeDaRecusa` (`src/sync/recusa.ts`), e o padrão
 * dela é "passageira". Aqui não há decisão: só o carimbo.
 *
 * **E a fronteira, dita antes de alguém achar que é defeito: o que sai de lado NÃO volta.**
 * A `0051` preserva um caminho legítimo — *"desfaça a conferência anterior antes de conferir
 * de novo"* —, e no dia em que alguém desfizer a primeira, a linha que este carimbo pôs de
 * lado no segundo aparelho continua de lado, para sempre. O livro-razão fica certo mesmo
 * assim: quem desfez confere de novo no aparelho dele, e isso gera entrada nova na fila
 * dele. A linha velha vira lápide de um ato que foi superado, não dado perdido.
 *
 * Ressuscitar automaticamente seria pior: o aparelho teria de adivinhar que a recusa de
 * ontem deixou de valer, e adivinhar errado é mandar de novo a conferência que o dono já
 * decidiu descartar.
 */
export async function markRejected(id: string, codigo: string | null): Promise<void> {
  const conn = await db();
  await conn.runAsync(
    `UPDATE outbox SET recusada_em = ?, recusa_codigo = ?
      WHERE id = ? AND sent_at IS NULL AND recusada_em IS NULL`,
    [nowIso(), codigo, id],
  );
}

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

  // **O fato de que este aparelho já falou com o servidor, escrito onde a faxina não
  // alcança.** A adoção de empresa é irreversível justamente porque uma linha que já
  // subiu carrega o carimbo velho lá, para sempre — e o guarda que impede adotar
  // depois disso perguntava à própria fila: `SELECT COUNT(*) FROM outbox WHERE
  // sent_at IS NOT NULL`. A faxina apaga entradas enviadas há mais de sete dias, e
  // com a última delas o guarda passava a responder "nunca subiu nada": a janela da
  // adoção reabria sozinha, uma semana depois, sobre um servidor que já tinha o
  // carimbo antigo.
  //
  // Prova de fato tem de ser durável. `app_meta` não é varrido por nada.
  await writeMeta(CHAVE_PRIMEIRA_SUBIDA, at);
}

/**
 * Este aparelho já entregou alguma linha ao servidor, alguma vez?
 *
 * Pergunta durável, e é a que a adoção precisa: a fila responde "o que ainda está
 * aqui", que é outra coisa — e que a faxina muda por baixo.
 */
export async function jaFalouComOServidor(): Promise<boolean> {
  return (await readMeta(CHAVE_PRIMEIRA_SUBIDA)) !== null;
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
  'product_categories',
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
      // A recusada fica FORA da faxina de órfãs: ela é o registro de por que uma linha não
      // subiu, e quem conferiu vai perguntar. Esquecê-la porque a linha de origem foi
      // apagada depois trocaria a resposta por silêncio.
      `SELECT o.id FROM outbox o
        WHERE o.sent_at IS NULL AND o.recusada_em IS NULL AND o.table_name = ?
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
