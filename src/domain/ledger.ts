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
 * Where a movement was recorded in the chain of custody. Comparing two posts
 * localizes a loss - picking error, route loss, or receiving error - without
 * accusing anyone.
 */
export type ControlPost = 'picked' | 'loaded' | 'delivered' | 'checked';

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

export type Balance = {
  itemId: string;
  locationId: string;
  baseUnits: number;
};

const key = (itemId: string, locationId: string) => `${itemId} ${locationId}`;

/**
 * Balance is a fold over movements. Reversals are applied as ordinary negations
 * so a reversed movement stays visible in the history while dropping out of the
 * total.
 */
export function balanceOf(movements: readonly Movement[]): Balance[] {
  const totals = new Map<string, Balance>();

  for (const m of movements) {
    const k = key(m.itemId, m.locationId);
    const current = totals.get(k) ?? {
      itemId: m.itemId,
      locationId: m.locationId,
      baseUnits: 0,
    };
    current.baseUnits += m.quantityBaseUnits;
    totals.set(k, current);
  }

  return [...totals.values()];
}

/**
 * Balance as it stood at a moment in time - the query behind cold-chain
 * forensics and any "as of" report.
 */
export function balanceAt(movements: readonly Movement[], instant: Date): Balance[] {
  const cutoff = instant.getTime();
  return balanceOf(movements.filter((m) => new Date(m.occurredAt).getTime() <= cutoff));
}

/**
 * Which lots sat in a location during a window. Feeds the temperature
 * excursion screen: the ledger already knew, nobody had to write it down.
 */
export function lotsPresentDuring(
  movements: readonly Movement[],
  locationId: string,
  from: Date,
  to: Date,
): string[] {
  const lots = new Set<string>();
  const fromMs = from.getTime();
  const toMs = to.getTime();

  for (const m of movements) {
    if (m.locationId !== locationId || !m.lotId) continue;
    const at = new Date(m.occurredAt).getTime();
    if (at <= toMs && m.quantityBaseUnits > 0) lots.add(m.lotId);
    if (at < fromMs && m.quantityBaseUnits < 0) lots.delete(m.lotId);
  }
  return [...lots];
}

/**
 * Builds the movement that cancels another one. The original is never mutated
 * and never deleted - this is the everyday correction tool, and it has to be so
 * easy that nobody ever asks to restore a backup to fix a typo.
 */
export function buildReversal(
  original: Movement,
  by: { id: string; movementId: string; at: string },
): Movement {
  return {
    ...original,
    id: by.movementId,
    kind: 'reversal',
    quantityBaseUnits: -original.quantityBaseUnits,
    reversesMovementId: original.id,
    recordedBy: by.id,
    recordedAt: by.at,
    occurredAt: by.at,
  };
}

/**
 * Days of stock cover - the number that tells someone to produce, which is
 * more actionable than a raw quantity ("Strawberry: 4 days").
 */
export function daysOfCover(baseUnits: number, dailyOutflow: number): number | null {
  if (dailyOutflow <= 0) return null;
  return baseUnits / dailyOutflow;
}
