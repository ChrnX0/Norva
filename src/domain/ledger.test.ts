import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceAt, balanceOf, daysOfCover, type Movement } from './ledger';

/**
 * The two ledger queries nothing was calling and nothing was checking.
 *
 * Foundation 1 says the balance is the sum of the movements. Both of these are
 * that same sum asked a different question - one at a moment in time, one
 * turned into days - and both were exported with a docblock and never run.
 * An unexercised export reads like a capability: whoever wires it to a screen
 * inherits an answer nobody has ever seen come out.
 */

const move = (at: string, qty: number): Movement => ({
  id: at + qty,
  companyId: 'c1',
  kind: qty > 0 ? 'purchase' : 'consumption',
  occurredAt: at,
  recordedAt: at,
  recordedBy: 'u1',
  itemId: 'sugar',
  quantityBaseUnits: qty,
  locationId: 'store',
});

const ARRIVALS: Movement[] = [
  move('2026-08-01T08:00:00Z', 100_000),
  move('2026-08-10T08:00:00Z', -30_000),
  move('2026-08-20T08:00:00Z', 50_000),
];

test('the balance at a moment ignores what had not happened yet', () => {
  // This is the query cold-chain forensics runs: the ledger already knows what
  // sat in the room at 3am, because every row carries when it happened. Nobody
  // has to have written anything down.
  const midway = balanceAt(ARRIVALS, new Date('2026-08-15T00:00:00Z'));
  assert.deepEqual(midway, [{ itemId: 'sugar', locationId: 'store', baseUnits: 70_000 }]);

  // And asked after everything, it is the plain balance.
  const now = balanceAt(ARRIVALS, new Date('2026-09-01T00:00:00Z'));
  assert.deepEqual(now, balanceOf(ARRIVALS));
});

test('a movement exactly on the boundary is included, not skipped', () => {
  // Off-by-one here is a silent wrong number in an "as of" report, which is the
  // kind that gets believed.
  const onTheDot = balanceAt(ARRIVALS, new Date('2026-08-10T08:00:00Z'));
  assert.equal(onTheDot[0].baseUnits, 70_000);
});

test('days of cover turns a quantity into the sentence somebody can act on', () => {
  // "Strawberry: 4 days" tells the owner to produce. "Strawberry: 70,000 g"
  // does not, and that difference is the whole point of the briefing.
  assert.equal(daysOfCover(70_000, 10_000), 7);

  // Nothing going out is not "infinite days" and not zero: it is unanswerable,
  // and saying so beats printing a number that means nothing.
  assert.equal(daysOfCover(70_000, 0), null);
  assert.equal(daysOfCover(70_000, -5), null);
});
