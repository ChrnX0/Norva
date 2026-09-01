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
