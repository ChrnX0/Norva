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

export function foldCostEvents(
  events: readonly CostEvent[],
  from: StockCostState = emptyStock,
): StockCostState {
  return events.reduce(applyCostEvent, from);
}

/** Unit price of a single purchase - what the buyer typed, per base unit. */
export function purchaseUnitCost(event: PurchaseEvent): Rate {
  return rateFromCents(event.totalCents, event.baseUnits);
}

export type PriceMove = {
  previousRate: Rate;
  currentRate: Rate;
  /** Signed fraction: 0.08 means it went up 8%. */
  change: number;
};

/**
 * Compares the newest purchase against the one before it, which is the
 * comparison the buyer needs *at the moment of deciding*, standing in front of
 * the supplier - not in a report next month.
 */
export function priceMove(purchases: readonly PurchaseEvent[]): PriceMove | null {
  if (purchases.length < 2) return null;

  const ordered = [...purchases].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const current = purchaseUnitCost(ordered[ordered.length - 1]);
  const previous = purchaseUnitCost(ordered[ordered.length - 2]);
  if (previous === 0) return null;

  return { previousRate: previous, currentRate: current, change: (current - previous) / previous };
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
