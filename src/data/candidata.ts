/**
 * A conferência que o servidor recusou vira CANDIDATA, em vez de desaparecer.
 *
 * **O que acontecia até 12 de setembro.** Duas pessoas conferem a mesma carga na doca, as
 * duas sem sinal. As duas gravam. Quando sincronizam, a `0051` deixa uma entrar e recusa a
 * outra com `23505` — e faz certo, porque é ela que impede o saldo dobrar. Só que daí em
 * diante a recusada morria: `classeDaRecusa` a chama de permanente (com razão), `markRejected`
 * a põe de lado, e `src/data/outbox.ts` diz em prosa que o que sai de lado não volta.
 *
 * O aparelho que perdeu via a própria conferência sumir sem explicação. O que ganhou não via
 * nada. **Nenhum dos dois tinha o que aceitar** — e a decisão do dono, de 11 de setembro, é
 * exatamente sobre aceitar: *"mostra os dados para os dois celulares e o primeiro q aceitar
 * fica como permanente."*
 *
 * ## Por que aqui e não no motor da fila
 *
 * O motor (`src/sync/engine.ts`) sabe que uma linha foi recusada e com que código; ele não
 * sabe o que aquela linha É. Ler o movimento para saber se ele era uma `discrepancy` e montar
 * a candidata com os quatro fatos é trabalho de dados, e a guarda de camadas cobra isso: a
 * travessia manda o que está GRAVADO, e toda leitura que interpreta mora em `src/data`.
 *
 * ## Duas coisas que esta função deliberadamente NÃO faz
 *
 * **Não desfaz nada.** O movimento recusado continua no razão deste aparelho, de pé, e o
 * saldo local continua contando com ele. Isso é certo e é a única resposta honesta: até
 * alguém decidir, este aparelho tem uma conferência que ele fez e o servidor não aceitou.
 * Estornar por conta própria seria o aplicativo escolhendo o vencedor, que é o que a decisão
 * do dono tira das mãos dele.
 *
 * **Não decide.** `resolution` nasce nulo. Quem arbitra é a política do servidor
 * (`using (resolution is null)`, `0062`), e a razão está escrita lá: dois celulares aceitando
 * ao mesmo tempo pelo aplicativo gravariam os dois, e o último venceria.
 */
import { db, nowIso, type Db } from './db';
import { enqueue } from './outbox';
import { estornarConferenciaLocal } from './repository';

/** O que o aparelho guarda de uma candidata — os quatro fatos da decisão, mais a remessa. */
type LinhaDoRazao = {
  id: string;
  company_id: string;
  movement_group_id: string | null;
  item_id: string;
  location_id: string | null;
  operator_id: string | null;
  occurred_at: string;
  quantity_base_units: number;
  recorded_at: string;
};

/**
 * A conferência recusada vira candidata, e entra na fila para os dois celulares a verem.
 *
 * Devolve `true` quando gravou, e `false` quando a linha recusada não era uma conferência de
 * remessa — a maior parte das recusas permanentes não é, e chamar isto para todas é mais
 * barato que o motor ter de saber o que cada tabela significa.
 *
 * **E ela lia uma coluna que o aparelho não tem.** A primeira versão pedia `recorded_by` ao
 * razão local — coluna removida na V5 porque *"no aparelho ele nunca teve valor"*. O `SELECT`
 * quebrava, o `try/catch` do motor engolia, e a candidata nunca era gravada: a duplicação
 * sumia em silêncio, exatamente o que esta função existe para impedir. Quem carimba a conta é
 * o serializador na travessia, com o usuário da sessão.
 *
 * **Idempotente pelo `id`**: a candidata leva o MESMO id do movimento recusado. Uma
 * retentativa da fila chama isto de novo e o `INSERT OR IGNORE` não faz nada — e do lado do
 * servidor o `on conflict (id) do nothing` também não. Sem isso, cada tentativa criaria uma
 * candidata nova e a tela mostraria a mesma disputa cinco vezes.
 */
export async function candidatarConferencia(movementId: string): Promise<boolean> {
  const conn = await db();
  const linha = await conn.getFirstAsync<LinhaDoRazao>(
    `SELECT id, company_id, movement_group_id, item_id, location_id, operator_id,
            occurred_at, quantity_base_units, recorded_at
       FROM movements
      WHERE id = ? AND kind = 'discrepancy' AND movement_group_id IS NOT NULL`,
    [movementId],
  );
  if (!linha || !linha.movement_group_id) return false;

  await gravarCandidata(conn, {
    id: linha.id,
    company_id: linha.company_id,
    movement_group_id: linha.movement_group_id,
    item_id: linha.item_id,
    location_id: linha.location_id,
    operator_id: linha.operator_id,
    occurred_at: linha.occurred_at,
    quantity_base_units: linha.quantity_base_units,
    recorded_at: linha.recorded_at,
  });
  return true;
}

async function gravarCandidata(conn: Db, linha: Record<string, string | number | null>): Promise<void> {
  const colunas = Object.keys(linha);
  await conn.runAsync(
    `INSERT OR IGNORE INTO check_candidates (${colunas.join(', ')})
     VALUES (${colunas.map(() => '?').join(', ')})`,
    colunas.map((c) => linha[c] ?? null),
  );
  await enqueue(conn, [{ table: 'check_candidates', rowId: String(linha.id) }]);
}

/**
 * O que este aparelho tem esperando decisão, com o que ele sabe da conferência que venceu.
 *
 * A candidata é a que PERDEU; a vencedora está em `movements` e chega pela descida. O `left
 * join` é o que torna a tela honesta antes de a descida acontecer: sem a vencedora, a linha
 * ainda conta a disputa e diz que o outro lado não chegou — em vez de sumir e deixar a pessoa
 * sem saber que houve disputa nenhuma.
 */
export type Disputa = {
  candidataId: string;
  grupoId: string;
  itemId: string;
  quandoCandidata: string;
  quantoCandidata: number;
  resolucao: 'first' | 'second' | null;
  /** A que está de pé no razão, quando ela já desceu. */
  vencedoraId: string | null;
  quandoVencedora: string | null;
  quantoVencedora: number | null;
};

export async function disputasAbertas(companyId: string): Promise<Disputa[]> {
  const conn = await db();
  return conn.getAllAsync<Disputa>(
    `SELECT c.id                   AS candidataId,
            c.movement_group_id    AS grupoId,
            c.item_id              AS itemId,
            c.occurred_at          AS quandoCandidata,
            c.quantity_base_units  AS quantoCandidata,
            c.resolution           AS resolucao,
            m.id                   AS vencedoraId,
            m.occurred_at          AS quandoVencedora,
            m.quantity_base_units  AS quantoVencedora
       FROM check_candidates c
       LEFT JOIN movements m
              ON m.company_id = c.company_id
             AND m.movement_group_id = c.movement_group_id
             AND m.item_id = c.item_id
             AND m.kind = 'discrepancy'
             AND m.id <> c.id
      WHERE c.company_id = ? AND c.resolution IS NULL
      ORDER BY c.occurred_at DESC`,
    [companyId],
  );
}

/**
 * Uma pessoa decidiu. O aparelho grava e enfileira; quem ARBITRA é o servidor.
 *
 * A escrita local é otimista de propósito — a tela responde na hora, offline inclusive. Se
 * outra pessoa tiver decidido antes, a política do servidor recusa o `update` (ele alcança
 * zero linhas, que não é erro) e a descida traz a decisão de verdade por cima. É a mesma
 * forma que a fila inteira usa: o aparelho age, o servidor confirma, e o que ele devolve vale.
 */
export async function decidirDisputa(
  candidataId: string,
  resolucao: 'first' | 'second',
  quem: string,
): Promise<void> {
  const conn = await db();
  const at = nowIso();
  await conn.runAsync(
    `UPDATE check_candidates
        SET resolution = ?, resolved_at = ?, resolved_by = ?
      WHERE id = ? AND resolution IS NULL`,
    [resolucao, at, quem, candidataId],
  );
  await enqueue(conn, [{ table: 'check_candidates', rowId: candidataId, op: 'upsert' }]);
}

/**
 * A decisão VIRA razão neste aparelho — e o que ela faz aqui é o que o servidor não pode.
 *
 * O servidor faz a metade dele dentro da transação que ganha a arbitragem (`0063`): aceita a
 * candidata, estorna a conferência que estava de pé. Isso é exatamente-uma-vez porque a
 * política `using (resolution is null)` só deixa um `update` passar — e foi essa medida que
 * mandou o estorno para lá em vez de deixá-lo no aplicativo.
 *
 * Sobra uma coisa que só o aparelho alcança: **a conferência recusada, que nunca subiu.** Ela
 * está de pé no razão local de quem perdeu, contando no saldo daquele celular, e o servidor
 * não tem o que desfazer porque nunca a teve. Quem desfaz é este aparelho, sem enfileirar.
 *
 * ## As duas decisões, e o que cada uma pede daqui
 *
 * **`first` — a que o servidor guardou vale.** A candidata perdeu. Este aparelho estorna a
 * própria linha recusada e o saldo dele passa a bater com o do servidor.
 *
 * **`second` — a candidata vale.** O estorno da outra já foi escrito pelo servidor. O que
 * falta é a candidata CHEGAR lá: a fila a pôs de lado quando o `23505` veio, e o que sai de
 * lado não volta. Então ela volta para a fila aqui — e agora entra, porque a conferência que
 * a barrava está estornada.
 *
 * ## Por que ela só age sobre decisão CONFIRMADA
 *
 * `decidirDisputa` grava a escolha na hora, para a tela responder offline. Essa escolha pode
 * perder: outra pessoa decidiu primeiro e a política do servidor recusou. Agir pela escolha
 * local estornaria a conferência que, pela decisão de verdade, era a que ficava de pé — saldo
 * corrompido no celular de quem tocou o botão, e sem nada reclamar. Então a condição é
 * `confirmado_em`, a marca que a descida põe na linha que veio do servidor.
 *
 * ## Por que `honrado_em` existe
 *
 * Porque as duas ações acima têm um gatilho que não é um instante: a decisão chega pela
 * descida e continua lá para sempre. Sem uma marca, cada sincronia repetiria a leitura — e no
 * caso `second` enfileiraria a candidata de novo a cada volta. O estorno em si é idempotente
 * (`estornarConferenciaLocal` não escreve duas vezes), mas fila que cresce sozinha é a mesma
 * doença por outro nome.
 *
 * A coluna é só do aparelho e não atravessa: ela diz *"ESTE celular já tirou a consequência"*,
 * e mandá-la para o outro faria o outro pular a dele.
 */
export async function honrarDecisoes(companyId: string): Promise<number> {
  const conn = await db();
  const decididas = await conn.getAllAsync<{ id: string; resolution: 'first' | 'second' }>(
    `SELECT id, resolution FROM check_candidates
      WHERE company_id = ?
        AND resolution IS NOT NULL
        -- CONFIRMADA pelo servidor, nunca a escolha otimista deste celular: ver
        -- gravarPagina em src/data/descida.ts. Honrar o pedido em vez da decisao estornaria
        -- o movimento errado toda vez que a arbitragem fosse para o outro lado.
        AND confirmado_em IS NOT NULL
        AND honrado_em IS NULL`,
    [companyId],
  );

  let honradas = 0;
  for (const d of decididas) {
    /**
     * Este aparelho TEM a conferência da candidata?
     *
     * Quem não a tem não faz nada — e é isso que impede o estorno duplo pelo lado do
     * aplicativo. O celular que ganhou vê a mesma decisão descer, e a linha recusada não está
     * no razão dele: não há o que estornar, e ele não tenta. A posse local é a única coisa que
     * os dois celulares nunca discordam sobre.
     */
    const minha = await conn.getFirstAsync<{ id: string }>(
      `SELECT id FROM movements WHERE id = ? AND company_id = ? AND kind = 'discrepancy'`,
      [d.id, companyId],
    );

    if (minha) {
      if (d.resolution === 'first') await estornarConferenciaLocal(companyId, d.id);
      else await enqueue(conn, [{ table: 'movements', rowId: d.id }]);
    }

    await conn.runAsync(`UPDATE check_candidates SET honrado_em = ? WHERE id = ?`, [
      nowIso(),
      d.id,
    ]);
    honradas += 1;
  }
  return honradas;
}
