import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cents, type Rate } from './money';
import {
  applyCostEvent,
  foldCostEvents,
  observedLeadTimeDays,
  purchaseUnitCost,
  type CostEvent,
} from './cost';

/**
 * The three exports the audit found with no caller and no test.
 *
 * They were not sloppy: each carries a decision this project already made -
 * folding a sequence of arrivals, the unit price of one invoice, and the lead
 * time a supplier actually keeps rather than the one they promise. What they
 * were was *unproven*, which is worse than absent, because an exported function
 * with a docblock reads like a capability. Whoever wires them to a screen
 * inherits an answer nobody has ever checked.
 */

test('a sequence of arrivals folds to the same average as posting them one by one', () => {
  const events: CostEvent[] = [
    { kind: 'purchase', baseUnits: 100_000, totalCents: cents(47_200), at: '2026-08-01T00:00:00Z' },
    { kind: 'purchase', baseUnits: 100_000, totalCents: cents(59_000), at: '2026-08-15T00:00:00Z' },
  ];

  const folded = foldCostEvents(events);
  const stepped = events.reduce(applyCostEvent, { baseUnits: 0, averageRate: 0 as Rate });

  assert.deepEqual(folded, stepped);
  // 472 + 590 reais over 200 kg: 0.531 cents per gram, the number db:verify
  // makes Postgres compute independently.
  assert.equal(Number(folded.averageRate.toFixed(4)), 0.531);
  assert.equal(folded.baseUnits, 200_000);
});

test('the unit price of one invoice is that invoice alone, not the average', () => {
  // The distinction the buyer needs while standing at the supplier: what THIS
  // load costs, not what it does to the blend once it lands.
  const dear = purchaseUnitCost({
    kind: 'purchase',
    baseUnits: 25_000,
    totalCents: cents(11_800),
    at: '2026-09-01T00:00:00Z',
  });

  assert.equal(Number(dear.toFixed(4)), 0.472);
});

test('lead time is what the supplier did, not what they said', () => {
  // Three days promised, six delivered - and the reorder point built on the
  // promise is the one that stops the factory. The average is over what
  // happened, which the system holds and the person does not.
  const observed = observedLeadTimeDays([
    { orderedAt: '2026-08-01T00:00:00Z', receivedAt: '2026-08-07T00:00:00Z' },
    { orderedAt: '2026-08-10T00:00:00Z', receivedAt: '2026-08-16T00:00:00Z' },
    { orderedAt: '2026-08-20T00:00:00Z', receivedAt: '2026-08-23T00:00:00Z' },
  ]);

  assert.equal(observed, 5);
  // Nothing bought yet is not "zero days", which would read as instant delivery.
  assert.equal(observedLeadTimeDays([]), null);
});
