/**
 * Moving weighted average cost.
 *
 * The elegant part of the whole system lives here: registering a purchase is
 * the same event that moves the cost. Nobody ever "updates the price of sugar"
 * as a task - they enter the invoice, every recipe that uses sugar recalculates,
 * and the price history writes itself.
 *
 * Moving average rather than last-purchase price, because last price makes
 * margin jump around on a single unlucky invoice. The last price stays visible
 * for negotiation ("R$ 118 here; you paid R$ 112 last month"), but the average
 * is what the cost of a batch is measured against.
 */

import { rateFromCents, type Cents, type Rate } from './money';

export type StockCostState = {
  /** On hand, in the item's base unit. */
  baseUnits: number;
  /**
   * Current moving average, per base unit, as a fractional rate. Sugar at
   * R$ 4.72/kg is 0.472 cents per gram - an integer would round it to zero.
   */
  averageRate: Rate;
};

export type PurchaseEvent = {
  kind: 'purchase';
  /** Quantity received, already converted to the item's base unit. */
  baseUnits: number;
  /** What was actually paid, including freight if it was apportioned. */
  totalCents: Cents;
  at: string;
};

export type ConsumptionEvent = {
  kind: 'consumption';
  baseUnits: number;
  at: string;
};

export type CostEvent = PurchaseEvent | ConsumptionEvent;

export const emptyStock: StockCostState = { baseUnits: 0, averageRate: 0 as Rate };

/**
 * Applies one event.
 *
 * A purchase blends into the average in proportion to what is already on hand.
 * A consumption removes quantity and leaves the average untouched - that is the
 * definition of the method, and it is what keeps the cost stable while stock
 * drains.
 *
 * Consuming more than is on hand is allowed rather than rejected: it happens in
 * real operations when a count is behind, and refusing it would push people to
 * enter something false. The average survives, and the physical count is what
 * corrects reality later.
 */
export function applyCostEvent(state: StockCostState, event: CostEvent): StockCostState {
  if (event.kind === 'purchase') {
    if (event.baseUnits <= 0) return state;

    const heldValue = state.averageRate * Math.max(0, state.baseUnits);
    const newUnits = Math.max(0, state.baseUnits) + event.baseUnits;
    const newValue = heldValue + event.totalCents;

    return {
      baseUnits: state.baseUnits + event.baseUnits,
      averageRate: rateFromCents(newValue as Cents, newUnits),
    };
  }

  return { baseUnits: state.baseUnits - event.baseUnits, averageRate: state.averageRate };
}

/**
 * A média móvel entre duas TAXAS, sem passar por dinheiro.
 *
 * `applyCostEvent` fala de nota: o que entrou custou tantos centavos inteiros,
 * porque foi isso que alguém pagou. Uma corrida de produção não tem nota — o
 * que ela tem é a taxa congelada (consumo mais embalagem, por unidade), e o
 * valor do lote é taxa vezes quantidade, que é fracionário por natureza.
 *
 * Forçar esse valor a centavos inteiros para reaproveitar o evento de compra
 * custou visivelmente: a primeira corrida de 500 unidades saía com média
 * 64,996 contra um custo congelado de 64,99686 — dois números para o mesmo
 * picolé, no dia em que ele nasceu. É a mesma perda que a capa deste projeto
 * proíbe, e a regra que resolve já estava escrita: **só o valor final
 * arredonda, uma vez, e taxa não é valor final.**
 *
 * Estoque negativo conta como zero, igual ao evento de compra e ao gatilho do
 * servidor: recusar empurraria alguém a digitar mentira.
 */
export function blendRate(
  held: { baseUnits: number; averageRate: Rate },
  arriving: { baseUnits: number; rate: Rate },
): Rate {
  const heldUnits = Math.max(0, held.baseUnits);
  const total = heldUnits + arriving.baseUnits;
  if (total <= 0) return arriving.rate;
  return ((held.averageRate * heldUnits + arriving.rate * arriving.baseUnits) / total) as Rate;
}

/**
 * Observed lead time, not the promised one. Suppliers say three days and
 * deliver in six; the reorder point has to be built on what actually happened,
 * which is a number the system already holds and the person does not.
 */
export function observedLeadTimeDays(
  deliveries: readonly { orderedAt: string; receivedAt: string }[],
): number | null {
  if (deliveries.length === 0) return null;

  const days = deliveries.map((d) => {
    const ordered = new Date(d.orderedAt).getTime();
    const received = new Date(d.receivedAt).getTime();
    return (received - ordered) / 86_400_000;
  });

  return days.reduce((a, b) => a + b, 0) / days.length;
}

/**
 * Reorder point, calculated rather than typed. A hand-entered "minimum stock"
 * ages the moment consumption changes and nobody goes back to fix it.
 */
export function reorderPoint(dailyConsumption: number, leadTimeDays: number, safetyDays = 2): number {
  return Math.ceil(dailyConsumption * (leadTimeDays + safetyDays));
}

/** One move in what an item costs, as the price history records it. */
export type RateMove = {
  itemId: string;
  previousRate: Rate | null;
  observedAt: string;
};

/**
 * The rates as they stood before a run of recent moves.
 *
 * A unit cost on its own is a number somebody has to take on trust: 55 cents is
 * neither good nor bad without knowing it was 52 before the last invoices. The
 * comparison the Law of Intelligence asks for is already written down - every
 * purchase leaves a row saying what the rate was before it - so this is a fold
 * over history rather than a snapshot somebody has to remember to store.
 *
 * When an item moved more than once inside the window, the *earliest* of those
 * moves wins. The question a briefing answers is "what did this week do to my
 * costs", not "what did the last invoice do", and rolling back only the final
 * step would quietly under-report a run of rises.
 *
 * Items with no move keep their current rate, so a product built entirely from
 * things that did not change comes out identical - which is how "nothing moved"
 * stays a real answer instead of rounding noise.
 */
export function ratesBefore(
  current: Readonly<Record<string, Rate>>,
  moves: readonly RateMove[],
): Record<string, Rate> {
  const earliest = new Map<string, Rate>();

  for (const move of moves) {
    if (move.previousRate === null) continue;
    const seen = moves.find(
      (other) =>
        other.itemId === move.itemId &&
        other.previousRate !== null &&
        other.observedAt < move.observedAt,
    );
    if (!seen) earliest.set(move.itemId, move.previousRate);
  }

  return { ...current, ...Object.fromEntries(earliest) };
}

/**
 * De quanto o custo mudou — uma conta, num lugar só, com o caso da base ZERO decidido.
 *
 * **O que existia: cinco cópias e TRÊS respostas diferentes para a mesma pergunta.** Medido em
 * 13 de setembro, por `grep` na aritmética e não no nome:
 *
 *   `app/inputs/[id].tsx`            ternário exige anterior verdadeiro  ->  null
 *   `src/assistant/skills.ts` (x4)   `(agora - (ant ?? 0)) / (ant || 1)` ->  o próprio valor
 *   `src/home/Mosaic.tsx`            `ant > 0 ? … : 0`                   ->  zero
 *   `src/home/capas/organico.tsx`    idem                                ->  zero
 *
 * Nenhuma está *errada* sobre o caso comum: com anterior positivo as quatro dão o mesmo número.
 * A divergência mora na base ZERO — uma nota de brinde, uma amostra, uma correção —, e o razão
 * ACEITA isso: `recordPurchase` recusa só valor negativo.
 *
 * E o efeito medido é o pior dos três: a capa desenha **▼ 0,0%** para um insumo cujo custo subiu
 * de zero para alguma coisa. Uma queda afirmada onde houve alta, com a seta e tudo — e a linha
 * passa o filtro de cima (`previousRate !== newRate`), então ela chega à tela. O assistente, no
 * mesmo caso, anuncia um percentual igual à própria taxa: 0,55 centavo por grama sai como
 * *"+55%"*.
 *
 * **A decisão, tomada aqui uma vez: base zero não tem percentual, e `null` é a resposta.** Não é
 * timidez — é aritmética: o que era zero e passou a valer algo não subiu uma fração, subiu de
 * nada para algo, e nenhum percentual diz isso. `null` é o que a tela precisa para escrever a
 * frase certa em vez de desenhar uma seta inventada.
 *
 * Anterior NULO também é `null`, pela mesma régua: um insumo cuja primeira nota acabou de entrar
 * não mudou de preço, ele ganhou um. (As telas já filtram esse caso antes de chegar aqui; a
 * função não depende disso, porque depender de um filtro de chamador é como as cinco cópias
 * nasceram.)
 */
export function variacaoDoCusto(anterior: Rate | null, agora: Rate): number | null {
  if (anterior === null || anterior === 0) return null;
  return (agora - anterior) / anterior;
}

/**
 * How a price change should be read. A verdict, not a sentence - the screen
 * owns the words, in three languages.
 */
export type PriceVerdict = 'wellAbove' | 'smallChange' | 'cheaper';

/**
 * Where "it went up" becomes "it went up enough to say something".
 *
 * The two numbers are deliberately not symmetric. It takes more than 5% to
 * raise an alarm and only 2% to call something cheaper, because the costs of
 * being wrong are not symmetric either: a false alarm teaches the person to
 * ignore alarms, and then the real one arrives and is ignored too. Good news
 * that turns out to be noise costs nothing.
 *
 * They live here rather than in the screen that draws them because they are a
 * business rule, not a style - and until now they were four magic numbers
 * inside JSX, deciding what a person is warned about before they spend money,
 * with no test anywhere.
 */
export const PRICE_ALARM = 0.05;
export const PRICE_RELIEF = -0.02;

export function judgePriceChange(change: number): PriceVerdict {
  if (change > PRICE_ALARM) return 'wellAbove';
  if (change < PRICE_RELIEF) return 'cheaper';
  return 'smallChange';
}
