/**
 * The movement ledger - the foundation everything else sits on.
 *
 * There is no `current_stock` column anywhere in this system. Stock is the sum
 * of an append-only list of movements. That single decision buys, for free:
 *
 *   - history and audit (the log IS the database)
 *   - correction by reversal instead of deletion, so nothing is ever falsified
 *   - reports that cannot disagree with the history, because they come from it
 *   - offline sync without conflicts: appends are commutative, and the id is
 *     generated on the device, so replaying a queue twice is harmless
 *   - the ability to answer "what was inside the freezer at 03:12?" - which is
 *     how a temperature excursion lists the exposed lots with nobody having
 *     written anything down
 */

import type { Rate } from './money';

export type MovementKind =
  | 'purchase' // arrived from a supplier against an invoice
  | 'production' // finished goods created
  | 'consumption' // inputs drawn by a production run
  | 'transfer' // moved between locations (own store: not revenue)
  | 'sale' // sold to a customer (revenue + margin)
  | 'loss' // melted, broken, expired, courtesy, internal use
  | 'return' // came back from a route or a store
  | 'adjustment' // physical count correction
  | 'discrepancy' // difference found at a control post
  | 'reversal'; // cancels an earlier movement, never deletes it

/**
 * Why a loss happened. Required - an easy, blame-free button for this is what
 * keeps legitimate losses from silently becoming "unexplained shrinkage".
 */
/**
 * Why something was thrown away.
 *
 * The values are the server's enum, spelled exactly as `loss_reason` in
 * `supabase/migrations/0001_foundation.sql` - `internal_use`, not
 * `internalUse`. The device wrote camelCase here for months; SQLite would have
 * taken it (the column is TEXT), the outbox would have queued it, and Postgres
 * would have refused the row with nobody watching. It cost nothing to fix
 * because no loss has ever been recorded - which is the only window where a
 * ledger's vocabulary is free to change.
 */
export type LossReason = 'melted' | 'broken' | 'expired' | 'courtesy' | 'internal_use';

/**
 * Por que a carga voltou — e por que isto NÃO é `LossReason`.
 *
 * Uma devolução não é uma perda: a mercadoria volta e entra no saldo de novo. E
 * a razão responde outra pergunta. A da perda é *"o que aconteceu com isto"*; a
 * da devolução é *"o que isto diz sobre aquela loja"* — que é exatamente a
 * pergunta que o Espelho da Loja existe para responder, e a única que faz a
 * devolução merecer tipo próprio no razão.
 *
 * Sem a razão, `recordReturn` grava aritmética sem notícia: mil gramas voltaram,
 * e "a loja não vendeu" fica idêntico a "a carga chegou derretida". A primeira
 * manda produzir menos para aquela loja; a segunda manda olhar o caminhão. Um
 * relatório que não distingue as duas dá o conselho errado com convicção.
 *
 * O vocabulário sai do docblock do `moveBetween`, que já o tinha escrito em
 * prosa antes de existir coluna: *"não vendeu, veio errado, chegou mole"*.
 *
 * Grafado como o enum do servidor (`return_reason` em
 * `supabase/migrations/0034_why_it_came_back.sql`), e pelo mesmo motivo que o
 * `LossReason`: o SQLite aceitaria camelCase, a fila enfileiraria, e o Postgres
 * recusaria a linha sem ninguém olhando.
 */
export type ReturnReason = 'unsold' | 'wrong_item' | 'melted' | 'expired';

/** Na ordem em que a tela oferece: a mais comum primeiro. */
export const RETURN_REASONS: readonly ReturnReason[] = [
  'unsold',
  'melted',
  'expired',
  'wrong_item',
];

/**
 * Where a movement was recorded in the chain of custody. Comparing two posts
 * localizes a loss - picking error, route loss, or receiving error - without
 * accusing anyone.
 */
export type ControlPost = 'picked' | 'loaded' | 'delivered' | 'checked';

/**
 * As salas da própria fábrica — os lugares de onde a carga SAI.
 *
 * O predicado estava escrito três vezes: em `app/places.tsx` (o tom e o ícone da
 * linha), em `app/orders/new.tsx` (quem pode ser destino de um pedido) e, a
 * partir da conta de quanto dá para prometer, também em SQL. Três grafias de uma
 * regra é a forma que produz divergência — e esta em particular decide se um
 * pedido pode ser aceito, então divergir aqui é prometer o que não existe.
 *
 * `vehicle` não está em nenhum dos dois lados de propósito: caminhão é caminho,
 * não é sala nem destino. Mercadoria em cima dele não está para carregar nem
 * chegou a ninguém.
 */
export const INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room'] as const;

/**
 * Quem RECEBE carga: loja própria e cliente. O resto é sala interna ou caminho.
 *
 * Lista antes de predicado porque o SQL não importa função: o Espelho da Loja
 * pergunta *"quanto esta loja devolve do que recebe"*, e para isso precisa
 * FILTRAR por essas espécies dentro de uma consulta. Com a régua só no `if`, o
 * SQL escreveria a quarta grafia da mesma regra — que é exatamente o defeito que
 * `INTERNAL_PLACE_KINDS` existe para não repetir, do outro lado.
 */
export const CARGO_PLACE_KINDS = ['own_store', 'customer'] as const;

/** Quem RECEBE carga: loja própria e cliente. O resto é sala interna ou caminho. */
export function receivesCargo(kind: string): boolean {
  return (CARGO_PLACE_KINDS as readonly string[]).includes(kind);
}

export type Movement = {
  /** Client-generated UUID: makes the append idempotent across retries. */
  id: string;
  /** Tenant stamp. Present on every row, enforced by RLS on the server. */
  companyId: string;

  kind: MovementKind;
  /** Occurred-at, not recorded-at. Offline entries keep their real time. */
  occurredAt: string;
  recordedAt: string;
  recordedBy: string;

  itemId: string;
  /** Always the smallest unit. Signed: negative leaves, positive arrives. */
  quantityBaseUnits: number;

  locationId: string;
  counterpartLocationId?: string;

  lotId?: string;
  post?: ControlPost;
  lossReason?: LossReason;

  /**
   * Cost frozen at the instant this movement happened. A sugar price change in
   * March must not rewrite January's margin.
   *
   * A `Rate`, not `Cents`, and the distinction is the headline rule of this
   * project rather than a detail. Pulp at R$ 12,40/kg is 1,24 cents per gram;
   * as an integer that is 1, and a fifth of the cost is gone before the first
   * multiplication. The migration that fixed this on the server said so in
   * writing - `0008_ledger_speaks_phase_one.sql` dropped `unit_cost_cents` and
   * added `unit_cost_rate double precision`, and the device followed with
   * `unit_cost_rate REAL`.
   *
   * This type did not follow, and nothing noticed for one reason: no line of
   * production code imports this module. The type that defines what a movement
   * IS was describing a schema neither database has had for days.
   */
  unitCostRate?: Rate;

  /** Set when this movement cancels another one. */
  reversesMovementId?: string;

  /**
   * Present when the movement was drafted by the assistant. Stores the phrase
   * the person actually typed, so "what did the assistant post this month?" is
   * always answerable. Autonomy without a trail is what breaks trust in data.
   */
  assistantPhrase?: string;

  note?: string;
};

/**
 * Por que este módulo não soma saldo — e onde a soma mora de verdade.
 *
 * Ele exportava quatro dobras sobre `Movement[]`: `balanceOf`, `balanceAt`,
 * `lotsPresentDuring` e `buildReversal`. Nenhuma tinha chamador, e a razão não é
 * esquecimento: **o aplicativo nunca tem os movimentos em memória.** Ele tem
 * SQLite, e cada uma dessas perguntas já é respondida em SQL, onde os dados
 * estão — `stockByPlace`, `balanceByLocation` e `lotsInStock` somam
 * `quantity_base_units`, e `reverseGroup` escreve o estorno negando a quantidade
 * na própria instrução. Carregar anos de movimento num celular para dobrar em
 * memória seria a forma errada mesmo se alguém quisesse.
 *
 * `buildReversal` era o caso mais caro: **dois autores para o que é um estorno**,
 * um em TypeScript que ninguém roda e um em SQL que roda. É a mesma doença que a
 * média derivada já teve aqui, e a mutação da suíte protege o que roda.
 *
 * A resposta anterior a esse mesmo achado foi escrever teste para elas. Os testes
 * eram bons e não tornaram nada alcançável: tornaram a morte mais difícil de ver
 * — e uma mutação curada chegou a prometer que quebrá-las faria "a excursão de
 * temperatura acusar o lote errado", numa tela que não existe.
 *
 * O que fica aqui é o que trabalha: o **vocabulário**, que
 * `src/sync/agreement.test.ts` confere nos dois sentidos contra o esquema do
 * servidor e o do aparelho, e a aritmética pura que não toca dado (`daysOfCover`).
 *
 * A pergunta do docblock lá em cima — "o que estava dentro da câmara às 03:12?" —
 * **passou a ter resposta no commit seguinte a este**, e não pela dobra que morreu:
 * `lotsInRoomAt` é SQL com `occurred_at <= ?`, ao lado das outras somas de saldo, e
 * a tela do lugar lista os lotes que estavam lá no instante DAQUELA leitura quando
 * ela sai da faixa.
 *
 * Este parágrafo dizia "continua sem tela" e mandava ler o `docs/roadmap.md` pelo
 * que faltava — um commit depois de a coisa existir. Fica registrado em vez de
 * apagado, porque é a família que dominou o dia: o texto ao lado do código
 * descrevendo um estado que o código não tem mais. Comentário que aponta para o
 * roadmap é o pior caso dela, porque manda a próxima pessoa construir de novo o
 * que está pronto — que é exatamente o que a regra 1 daquele arquivo proíbe.
 */

/**
 * Days of stock cover - the number that tells someone to produce, which is
 * more actionable than a raw quantity ("Strawberry: 4 days").
 */
export function daysOfCover(baseUnits: number, dailyOutflow: number): number | null {
  if (dailyOutflow <= 0) return null;
  return baseUnits / dailyOutflow;
}
