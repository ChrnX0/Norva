import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCostEvent,
  emptyStock,
  judgePriceChange,
  PRICE_ALARM,
  PRICE_RELIEF,
  priceMove,
  ratesBefore,
  type PurchaseEvent,
} from './cost';
import { fromDecimal, rate, type Cents, type Rate } from './money';
import {
  compareVersions,
  costPerProductUnit,
  costRecipe,
  unitsPerBatch,
  type ItemCosts,
  type Recipe,
} from './recipe';

/**
 * The chain the whole product rests on: an invoice moves the average, the
 * average moves the recipe, the recipe moves the price of one popsicle.
 *
 * The unit tests next door prove each link on its own. These prove the links
 * hold *together*, because that end-to-end claim - "you never update a price,
 * you just enter what you paid" - is the one the app makes on its home screen.
 */

const PULP = 'pulp';
const SUGAR = 'sugar';

const recipes: Record<string, Recipe> = {
  base: {
    id: 'base',
    version: 1,
    effectiveFrom: '2026-01-01',
    yieldAmount: 20_000,
    lossFraction: 0,
    lines: [{ kind: 'item', itemId: SUGAR, quantity: 3_000 }],
  },
  popsicle: {
    id: 'popsicle',
    version: 3,
    effectiveFrom: '2026-06-01',
    yieldAmount: 40_000,
    lossFraction: 0.05,
    lines: [
      { kind: 'item', itemId: PULP, quantity: 18_000 },
      { kind: 'recipe', recipeId: 'base', quantity: 10_000 },
    ],
  },
};

/** Sugar at R$ 4.72/kg and pulp at R$ 12.40/kg, per gram. */
const costs: ItemCosts = { [PULP]: rate(12.4, 1_000), [SUGAR]: rate(4.72, 1_000) };

test('a purchase at a higher price raises the cost of the finished unit', () => {
  const before = costPerProductUnit(costRecipe('popsicle', recipes, costs), 75);

  // 40 kg of pulp bought at R$ 14.88/kg - 20% above the standing average, which
  // was itself set by 40 kg at R$ 12.40.
  const held = { baseUnits: 40_000, averageRate: costs[PULP] };
  const after = applyCostEvent(held, {
    kind: 'purchase',
    baseUnits: 40_000,
    totalCents: fromDecimal(595.2),
    at: '2026-08-30T10:00:00Z',
  });

  // Equal quantities at 12.40 and 14.88 average to 13.64/kg.
  assert.ok(Math.abs(after.averageRate - rate(13.64, 1_000)) < 1e-9);

  const raised = costPerProductUnit(
    costRecipe('popsicle', recipes, { ...costs, [PULP]: after.averageRate }),
    75,
  );

  assert.ok(raised > before, 'the unit cost has to follow the invoice');

  // Worked by hand, so the test fails if the engine ever drifts:
  //   base    3,000 g sugar x 0.472 = 1,416 cents over 20,000 ml = 0.0708 / ml
  //   before  18,000 x 1.240 + 10,000 x 0.0708 = 23,028 cents
  //           over the 38,000 ml that survive the 5% loss = 0.6060 / ml
  //           x 75 ml = 45 cents
  //   after   18,000 x 1.364 + 708 = 25,260 cents / 38,000 = 0.6647 / ml
  //           x 75 ml = 50 cents
  assert.equal(before, 45);
  assert.equal(raised, 50);
});

test('the buyer sees the move against the last invoice, not against the average', () => {
  const purchases: PurchaseEvent[] = [
    {
      kind: 'purchase',
      baseUnits: 25_000,
      totalCents: fromDecimal(118),
      at: '2026-07-02T09:00:00Z',
    },
    {
      kind: 'purchase',
      baseUnits: 25_000,
      totalCents: fromDecimal(124),
      at: '2026-08-14T09:00:00Z',
    },
  ];

  const move = priceMove(purchases);
  assert.ok(move);
  // The average would have said 2.5%; what the buyer needs to hear is 5.1%.
  assert.ok(Math.abs(move.change - 6 / 118) < 1e-9);
});

test('packaging is charged per unit, never smeared across the batch', () => {
  const cost = costRecipe('popsicle', recipes, costs);
  const bare = costPerProductUnit(cost, 75);
  const wrapped = costPerProductUnit(cost, 75, fromDecimal(0.05) as Cents);

  assert.equal(wrapped - bare, 5);

  // The same 5 cents on every one of the units a batch makes - which is the
  // whole reason it cannot live in the recipe's batch total.
  const units = unitsPerBatch(cost, 75);
  assert.equal(units, Math.floor(38_000 / 75));
});

test('a version comparison answers "did my change help" in cents per unit', () => {
  const before = costRecipe('popsicle', recipes, costs);

  const cheaper: Record<string, Recipe> = {
    ...recipes,
    popsicle: {
      ...recipes.popsicle,
      version: 4,
      lines: [
        { kind: 'item', itemId: PULP, quantity: 16_000 },
        { kind: 'recipe', recipeId: 'base', quantity: 12_000 },
      ],
    },
  };

  const after = costRecipe('popsicle', cheaper, costs);
  const delta = compareVersions(before, after, 75);

  assert.equal(delta.cheaper, true);
  assert.ok(delta.deltaCents < 0);
  assert.ok(delta.percent < 0);
});

test('an item with no purchase yet costs nothing rather than crashing a screen', () => {
  const withUnknown: Record<string, Recipe> = {
    ...recipes,
    popsicle: {
      ...recipes.popsicle,
      lines: [...recipes.popsicle.lines, { kind: 'item', itemId: 'glucose', quantity: 1_200 }],
    },
  };

  const cost = costRecipe('popsicle', withUnknown, costs, { glucose: 'Glucose' });
  const line = cost.lines.find((l) => l.label === 'Glucose');

  assert.ok(line);
  assert.equal(line.totalCents, 0);
  assert.equal(line.share, 0);
});

test('an empty stock takes the first invoice as the whole average', () => {
  const after = applyCostEvent(emptyStock, {
    kind: 'purchase',
    baseUnits: 10_000,
    totalCents: fromDecimal(124),
    at: '2026-08-01T08:00:00Z',
  });

  assert.equal(after.baseUnits, 10_000);
  assert.ok(Math.abs(after.averageRate - (1.24 as Rate)) < 1e-9);
});

/**
 * The comparison the home screen owes every figure it shows.
 *
 * Law 3 of this project: no number appears alone. A unit cost of 55 cents is
 * neither good nor bad on its own, and the briefing was showing exactly that -
 * the first card the owner sees, with nothing beside it.
 */

test('rolling the price history back gives the cost before the recent invoices', () => {
  const now: ItemCosts = {
    pulp: rate(14.95, 1_000),
    sugar: rate(5.9, 1_000),
    stick: rate(0.04, 1),
  };

  // Pulp moved twice this week, sugar once, the stick not at all.
  const moves = [
    { itemId: 'pulp', previousRate: rate(13.6, 1_000), observedAt: '2026-08-30T10:00:00Z' },
    { itemId: 'sugar', previousRate: rate(4.72, 1_000), observedAt: '2026-08-28T10:00:00Z' },
    { itemId: 'pulp', previousRate: rate(12.4, 1_000), observedAt: '2026-08-26T10:00:00Z' },
  ];

  const before = ratesBefore(now, moves);

  // The earliest of the two pulp moves wins. Rolling back only the last step
  // would report a 9% rise as if it were 2% - which is how a run of increases
  // hides in plain sight.
  assert.ok(Math.abs(before.pulp - rate(12.4, 1_000)) < 1e-9);
  assert.ok(Math.abs(before.sugar - rate(4.72, 1_000)) < 1e-9);
  assert.equal(before.stick, now.stick, 'what did not move must come back identical');
});

test('the price moves land on the finished unit, in reais', () => {
  const graph: Record<string, Recipe> = {
    base: {
      id: 'base',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 10_000,
      lossFraction: 0,
      lines: [
        { kind: 'item', itemId: 'pulp', quantity: 3_000 },
        { kind: 'item', itemId: 'sugar', quantity: 1_500 },
      ],
    },
  };
  const names = { pulp: 'Polpa', sugar: 'Açúcar' };

  const now: ItemCosts = { pulp: rate(14.95, 1_000), sugar: rate(5.9, 1_000) };
  const moves = [
    { itemId: 'pulp', previousRate: rate(12.4, 1_000), observedAt: '2026-08-26T10:00:00Z' },
    { itemId: 'sugar', previousRate: rate(4.72, 1_000), observedAt: '2026-08-28T10:00:00Z' },
  ];

  const unitNow = costPerProductUnit(costRecipe('base', graph, now, names), 75, 0 as Cents);
  const unitBefore = costPerProductUnit(
    costRecipe('base', graph, ratesBefore(now, moves), names),
    75,
    0 as Cents,
  );

  // Now:    3000 x 1.495 + 1500 x 0.590 = 4485 + 885 = 5370 cents per 10 L
  //         5370 / 10000 x 75 = 40.275 -> 40 cents a unit
  // Before: 3000 x 1.240 + 1500 x 0.472 = 3720 + 708 = 4428 cents per 10 L
  //         4428 / 10000 x 75 = 33.21  -> 33 cents a unit
  assert.equal(unitNow, 40);
  assert.equal(unitBefore, 33);
  assert.equal(unitNow - unitBefore, 7, 'seven cents a unit, and nobody typed a price');
});

test('nothing moved means the comparison says nothing, not zero-ish noise', () => {
  const now: ItemCosts = { pulp: rate(12.4, 1_000) };
  assert.deepEqual(ratesBefore(now, []), { pulp: now.pulp });
});

/**
 * The verdict that decides what somebody is warned about before they spend
 * money. It lived as four magic numbers inside JSX, written three different
 * ways on the same card, and nothing tested it.
 */

test('the price verdict names its buckets, and the boundaries are exact', () => {
  assert.equal(judgePriceChange(0.41), 'wellAbove');
  assert.equal(judgePriceChange(0.02), 'smallChange');
  assert.equal(judgePriceChange(0), 'smallChange');
  assert.equal(judgePriceChange(-0.05), 'cheaper');

  // Exactly at a threshold is not past it. Both are written down so a later
  // change to either one is a decision somebody made, not a drift.
  assert.equal(judgePriceChange(PRICE_ALARM), 'smallChange');
  assert.equal(judgePriceChange(PRICE_RELIEF), 'smallChange');
  assert.equal(judgePriceChange(PRICE_ALARM + 1e-9), 'wellAbove');
  assert.equal(judgePriceChange(PRICE_RELIEF - 1e-9), 'cheaper');
});

test('it takes more to raise an alarm than to call something cheaper', () => {
  // Deliberately not symmetric: a false alarm teaches people to ignore alarms,
  // and then the real one arrives and is ignored too.
  assert.ok(PRICE_ALARM > Math.abs(PRICE_RELIEF));
  assert.equal(judgePriceChange(0.04), 'smallChange', 'four percent up is noise');
  assert.equal(judgePriceChange(-0.04), 'cheaper', 'four percent down is worth saying');
});
