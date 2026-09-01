import { applyCostEvent, type StockCostState } from '@/domain/cost';
import { amountOf, cents, rate, type Cents, type Rate } from '@/domain/money';
import type { ItemCosts, Recipe, RecipeLine } from '@/domain/recipe';
import type { PackagingHierarchy } from '@/domain/units';
import { db, newId, nowIso, type Db } from './db';
import { enqueue } from './outbox';
import {
  blockerFor,
  EraseBlockedError,
  emptyCounts,
  itemKindsFor,
  tablesFor,
  type EraseArea,
  type EraseCounts,
} from './erase';

/**
 * Every query the app needs, in one place.
 *
 * The screens call these functions, and when the assistant lands it will call
 * *these same functions* rather than writing SQL of its own. An assistant with
 * a second query path eventually reports a different number than the screen
 * showing the same thing, and the app loses its credibility in a single day.
 */

export type ItemKind = 'input' | 'packaging' | 'product' | 'resale' | 'store_supply';

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;
  /** What the buyer holds: "25kg sack". */
  purchaseUnit: string | null;
  /** Base units inside one purchase unit. 25000 g in a 25 kg sack. */
  purchaseToBase: number | null;
  baseUnit: string;
  packaging: PackagingHierarchy;
};

export type ItemWithCost = Item & {
  averageRate: Rate;
  lastRate: Rate | null;
  onHandBaseUnits: number;
  /** False once it is out of circulation: kept for history, hidden from pickers. */
  active: boolean;
};

const DEFAULT_PACKAGING: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };

function parsePackaging(json: string): PackagingHierarchy {
  try {
    const tiers = JSON.parse(json);
    return Array.isArray(tiers) && tiers.length > 0 ? { tiers } : DEFAULT_PACKAGING;
  } catch {
    return DEFAULT_PACKAGING;
  }
}

// --- items -----------------------------------------------------------------

export async function listItems(
  companyId: string,
  kind?: ItemKind,
  /** Deactivated items are excluded unless a screen is explicitly showing them. */
  includeInactive = false,
): Promise<ItemWithCost[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    kind: ItemKind;
    name: string;
    purchase_unit: string | null;
    purchase_to_base: number | null;
    base_unit: string;
    packaging: string;
    active: number;
    average_rate: number | null;
    last_rate: number | null;
    on_hand_base_units: number | null;
  }>(
    `SELECT i.id, i.kind, i.name, i.purchase_unit, i.purchase_to_base, i.base_unit, i.packaging,
            i.active, c.average_rate, c.last_rate,
            (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = i.company_id AND m.item_id = i.id)
              AS on_hand_base_units
       FROM items i
       LEFT JOIN item_costs c ON c.item_id = i.id
      WHERE i.company_id = ?
        AND (? = 1 OR i.active = 1)
        AND (? IS NULL OR i.kind = ?)
      ORDER BY i.name COLLATE NOCASE`,
    [companyId, includeInactive ? 1 : 0, kind ?? null, kind ?? null],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    purchaseUnit: r.purchase_unit,
    purchaseToBase: r.purchase_to_base,
    baseUnit: r.base_unit,
    packaging: parsePackaging(r.packaging),
    active: r.active === 1,
    averageRate: (r.average_rate ?? 0) as Rate,
    lastRate: r.last_rate === null || r.last_rate === undefined ? null : (r.last_rate as Rate),
    onHandBaseUnits: r.on_hand_base_units ?? 0,
  }));
}

export async function saveItem(
  companyId: string,
  item: Omit<Item, 'id'> & { id?: string },
): Promise<string> {
  const conn = await db();
  let id = '';
  await conn.withTransactionAsync(async () => {
    id = await writeItem(conn, companyId, item);
  });
  return id;
}

/**
 * The write itself, without opening a transaction.
 *
 * Split out because `saveProduct` writes an item and a product together and
 * they have to land as one thing. SQLite has no nested transactions, so the
 * transaction belongs to the public function and the private one joins it.
 */
async function writeItem(
  conn: Db,
  companyId: string,
  item: Omit<Item, 'id'> & { id?: string },
): Promise<string> {
  const id = item.id ?? newId();

  await conn.runAsync(
    `INSERT INTO items (id, company_id, kind, name, purchase_unit, purchase_to_base,
                        base_unit, packaging, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       name = excluded.name,
       purchase_unit = excluded.purchase_unit,
       purchase_to_base = excluded.purchase_to_base,
       base_unit = excluded.base_unit,
       packaging = excluded.packaging`,
    [
      id,
      companyId,
      item.kind,
      item.name,
      item.purchaseUnit,
      item.purchaseToBase,
      item.baseUnit,
      JSON.stringify(item.packaging.tiers),
      nowIso(),
    ],
  );

  await enqueue(conn, [{ table: 'items', rowId: id }]);

  return id;
}

/** Cost of every item, in the shape the recipe engine expects. */
export async function itemCosts(companyId: string): Promise<ItemCosts> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ item_id: string; average_rate: number }>(
    `SELECT item_id, average_rate FROM item_costs WHERE company_id = ?`,
    [companyId],
  );
  return Object.fromEntries(rows.map((r) => [r.item_id, r.average_rate as Rate]));
}

// --- purchases: the event that moves the cost -------------------------------

/**
 * Records a purchase line and moves the moving average in the same step.
 *
 * This is the whole point of the design: nobody "updates the price of sugar" as
 * a task. They enter what they paid, and every recipe using sugar recalculates
 * while the price history writes itself.
 */
export async function recordPurchase(
  companyId: string,
  input: {
    itemId: string;
    supplierName?: string;
    /** What the buyer typed: 8 sacks. */
    purchaseQuantity: number;
    /** Converted on the way in, so storage only ever sees base units. */
    baseUnits: number;
    totalCents: Cents;
    orderedAt?: string;
    /**
     * The phrase somebody said, when this came from the assistant.
     *
     * The plan's own condition for letting an assistant write at all: every
     * movement it creates is marked as such, with the words that created it. A
     * ledger that cannot say "this one came from a sentence" makes autonomy
     * unauditable, and unauditable autonomy is what people stop trusting.
     * Null when a person filled the screen themselves.
     */
    assistantPhrase?: string;
  },
): Promise<{ previousRate: Rate | null; newRate: Rate }> {
  const conn = await db();
  const at = nowIso();

  const current = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );

  // How much is on hand is a question for the ledger, never for a stored
  // total. The moving average needs the quantity it is averaging over, and
  // taking it from the movements is what keeps the cost and the balance
  // answering to one history instead of drifting apart.
  const held = await conn.getFirstAsync<{ base_units: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS base_units
       FROM movements WHERE company_id = ? AND item_id = ?`,
    [companyId, input.itemId],
  );

  const before: StockCostState = {
    baseUnits: held?.base_units ?? 0,
    averageRate: (current?.average_rate ?? 0) as Rate,
  };

  // The same function the tests cover and the assistant will call.
  const after = applyCostEvent(before, {
    kind: 'purchase',
    baseUnits: input.baseUnits,
    totalCents: input.totalCents,
    at,
  });

  // Five rows describe one event, so they land together or not at all. A
  // purchase that recorded its invoice and not its cost would leave a price
  // history with a hole in it that nothing could reconstruct.
  const purchaseId = newId();
  // The line and the movement it causes share one id, because they are one
  // fact seen twice. Replaying the queue cannot post the arrival again.
  const lineId = newId();

  await conn.withTransactionAsync(async () => {
    // Inside the transaction: a place that exists only because a purchase was
    // attempted, and the purchase then failed, would be a row nobody asked for.
    const locationId = await ensureLocation(conn, companyId);

    await conn.runAsync(
      `INSERT INTO purchases (id, company_id, supplier_name, ordered_at, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [purchaseId, companyId, input.supplierName ?? null, input.orderedAt ?? null, at, at],
    );

    await conn.runAsync(
      `INSERT INTO purchase_lines (id, company_id, purchase_id, item_id, purchase_quantity,
                                   base_units, total_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        companyId,
        purchaseId,
        input.itemId,
        input.purchaseQuantity,
        input.baseUnits,
        input.totalCents,
        at,
      ],
    );

    const lineRate = rate(input.totalCents / 100, input.baseUnits);

    // The arrival itself, in the ledger, with what it cost frozen onto it. A
    // sugar price change in March must not rewrite what January cost.
    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate, assistant_phrase)
       VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        companyId,
        at,
        at,
        input.itemId,
        input.baseUnits,
        locationId,
        lineRate,
        input.assistantPhrase ?? null,
      ],
    );

    await conn.runAsync(
      `INSERT INTO item_costs (item_id, company_id, average_rate, last_rate, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         average_rate = excluded.average_rate,
         last_rate = excluded.last_rate,
         updated_at = excluded.updated_at`,
      [input.itemId, companyId, after.averageRate, lineRate, at],
    );

    await conn.runAsync(
      `INSERT INTO item_cost_history (id, company_id, item_id, previous_rate, new_rate, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), companyId, input.itemId, before.averageRate || null, after.averageRate, at],
    );

    // The line matters as much as its header, and for a reason beyond
    // completeness: the server's `apply_purchase_to_cost` trigger fires on an
    // insert into `purchase_lines`. Without it the invoice replays as an empty
    // header, and the authoritative cost and price history are never written.
    // `item_costs` is not queued, and that omission is the design.
    //
    // The average is derived, and a derived number gets one author. This device
    // computes its own so it can show a cost with no signal; the server
    // computes its own from these very lines, by the same rule. Sending both
    // gives the figure two authors and they disagree - replaying the queue put
    // the server at 0.5605 where the phone said 0.5310, because the queue
    // carries row ids and resends whatever the row says *now*.
    //
    // What travels is the invoice. The average is what each side concludes.
    await enqueue(conn, [
      { table: 'purchases', rowId: purchaseId },
      { table: 'purchase_lines', rowId: lineId },
      { table: 'movements', rowId: lineId },
    ]);
  });

  return {
    previousRate: before.averageRate > 0 ? before.averageRate : null,
    newRate: after.averageRate,
  };
}

// --- counting what is really on the shelf ------------------------------------

export type CountResult = {
  /** What the ledger believed before anybody walked to the shelf. */
  expectedBaseUnits: number;
  countedBaseUnits: number;
  /** Signed. Negative means less was there than the ledger thought. */
  deltaBaseUnits: number;
  /** What that difference is worth, at the item's average cost. */
  deltaCents: Cents;
};

export type MovementRow = {
  id: string;
  kind: string;
  /** Signed, in base units: positive arrived, negative left. */
  baseUnits: number;
  /** What one base unit was worth when it moved, frozen. */
  unitCostRate: Rate | null;
  note: string | null;
  occurredAt: string;
};

/**
 * The company's one place to keep things, created the first time something
 * moves.
 *
 * A movement has to happen somewhere. That is not ceremony: it is what makes
 * "how much is in the cold room" answerable later without going back and
 * rewriting history that was recorded without a place. Phase 1 has a single
 * storeroom and no screen to name a second, so the default carries the
 * company's own id - deterministic, so two phones that create it in the same
 * minute create one row rather than two.
 */
/**
 * O lugar que existe desde sempre, nomeável pelo chamador.
 *
 * Enquanto há um lugar só, o id dele é o da própria empresa - foi assim que
 * todo movimento já gravado foi carimbado. Expor isto é o que permite exigir
 * `locationId` de quem conta sem obrigar cada tela a saber desse detalhe.
 */
export function defaultLocationId(companyId: string): string {
  return companyId;
}

async function ensureLocation(conn: Db, companyId: string): Promise<string> {
  const existing = await conn.getFirstAsync<{ id: string }>(
    `SELECT id FROM locations WHERE id = ?`,
    [companyId],
  );
  if (existing) return existing.id;

  await conn.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at)
     VALUES (?, ?, '', 'store_room', ?)`,
    [companyId, companyId, nowIso()],
  );
  // It has to reach the server before the movement that stands on it does, or
  // the first sync fails a foreign key on a row nobody knew was missing. It
  // queues once, on the day the first thing moves, and never again.
  await enqueue(conn, [{ table: 'locations', rowId: companyId }]);

  return companyId;
}

/**
 * Records a physical count.
 *
 * Until this existed a balance in this app could only rise. Purchases added and
 * nothing ever took away, so "how much sugar do I have" was right exactly once,
 * on the morning the sack arrived. A storeroom number that only grows is worse
 * than no number at all, because people believe it.
 *
 * The count does not overwrite the balance - nothing here overwrites a balance.
 * It appends the difference as its own movement, so the shelf and the ledger
 * agree from this moment on while the disagreement stays on the record. That is
 * what turns "we keep losing sugar" from a feeling into a question the data can
 * answer.
 *
 * A count that finds exactly what was expected is written too, with a
 * difference of zero. Somebody looked, and the storeroom was right: that is
 * information. Discarding it would leave a shelf nobody has checked in months
 * indistinguishable from one verified this morning.
 */
export async function recordCount(
  companyId: string,
  input: {
    itemId: string;
    countedBaseUnits: number;
    note?: string;
    /**
     * The phrase somebody said, when this came from the assistant.
     *
     * The plan's own condition for letting an assistant write at all: every
     * movement it creates is marked as such, with the words that created it. A
     * ledger that cannot say "this one came from a sentence" makes autonomy
     * unauditable, and unauditable autonomy is what people stop trusting.
     * Null when a person filled the screen themselves.
     */
    assistantPhrase?: string;

    /** Defaults to now. A count written on paper in a cold room keeps its hour. */
    occurredAt?: string;

    /**
     * Which shelf was counted. Required, and deliberately without a default.
     *
     * A count is the one figure that comes from somebody standing in front of
     * the goods, so it belongs to a place. With a default, counting the cold
     * room without saying so would compare against the company's whole balance
     * and write the difference into the cold room - stock teleported between
     * rooms by an operator who did everything right. The rule of this project
     * is that the error is prevented, not complained about: the caller says
     * where, or it does not compile.
     */
    locationId: string;
  },
): Promise<CountResult> {
  const conn = await db();
  const at = nowIso();

  const held = await conn.getFirstAsync<{ base_units: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS base_units
       FROM movements WHERE company_id = ? AND item_id = ? AND location_id = ?`,
    [companyId, input.itemId, input.locationId],
  );
  const cost = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );

  const expected = held?.base_units ?? 0;
  const counted = Math.round(input.countedBaseUnits);
  const averageRate = (cost?.average_rate ?? 0) as Rate;
  const delta = counted - expected;

  const id = newId();

  await conn.withTransactionAsync(async () => {
    // The place still has to exist as a row before a movement can point at it.
    await ensureLocation(conn, companyId);
    const locationId = input.locationId;

    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate, note,
                              assistant_phrase)
       VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        input.occurredAt ?? at,
        at,
        input.itemId,
        delta,
        locationId,
        averageRate || null,
        input.note ?? null,
        input.assistantPhrase ?? null,
      ],
    );
    await enqueue(conn, [{ table: 'movements', rowId: id }]);
  });

  return {
    expectedBaseUnits: expected,
    countedBaseUnits: counted,
    deltaBaseUnits: delta,
    deltaCents: amountOf(averageRate, delta),
  };
}

/**
 * The movements behind one item's balance, newest first.
 *
 * This is the `[por quê?]` of a stock figure. A number the person cannot open
 * is a number they have to take on faith, and faith is exactly what an app
 * asking someone to change how they run their factory has not earned yet.
 */
export async function itemMovements(
  companyId: string,
  itemId: string,
  limit = 20,
): Promise<MovementRow[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    kind: string;
    quantity_base_units: number;
    unit_cost_rate: number | null;
    note: string | null;
    occurred_at: string;
  }>(
    `SELECT id, kind, quantity_base_units, unit_cost_rate, note, occurred_at
       FROM movements
      WHERE company_id = ? AND item_id = ?
      ORDER BY occurred_at DESC, rowid DESC
      LIMIT ?`,
    [companyId, itemId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    baseUnits: r.quantity_base_units,
    unitCostRate: r.unit_cost_rate === null ? null : (r.unit_cost_rate as Rate),
    note: r.note,
    occurredAt: r.occurred_at,
  }));
}

// --- recipes ----------------------------------------------------------------

export type RecipeSummary = { id: string; name: string; yieldAmount: number; yieldUnit: string };

export async function listRecipes(companyId: string): Promise<RecipeSummary[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    name: string;
    yield_amount: number;
    yield_unit: string;
  }>(
    `SELECT id, name, yield_amount, yield_unit FROM recipes
      WHERE company_id = ? AND active = 1 ORDER BY name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    yieldAmount: r.yield_amount,
    yieldUnit: r.yield_unit,
  }));
}

/**
 * Loads every recipe at its newest version, keyed by id - the shape
 * `costRecipe` walks. Loading them all at once is what lets a sub-recipe
 * resolve without a second round trip mid-calculation.
 */
export async function loadRecipeGraph(companyId: string): Promise<Record<string, Recipe>> {
  const conn = await db();

  const versions = await conn.getAllAsync<{
    id: string;
    recipe_id: string;
    version: number;
    effective_from: string;
    loss_fraction: number;
    yield_amount: number;
  }>(
    `SELECT v.id, v.recipe_id, v.version, v.effective_from, v.loss_fraction, r.yield_amount
       FROM recipe_versions v
       JOIN recipes r ON r.id = v.recipe_id
      WHERE v.company_id = ?
        AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2 WHERE v2.recipe_id = v.recipe_id)`,
    [companyId],
  );

  if (versions.length === 0) return {};

  const lines = await conn.getAllAsync<{
    recipe_version_id: string;
    item_id: string | null;
    sub_recipe_id: string | null;
    quantity: number;
  }>(
    `SELECT recipe_version_id, item_id, sub_recipe_id, quantity
       FROM recipe_lines WHERE company_id = ? ORDER BY position`,
    [companyId],
  );

  const byVersion = new Map<string, RecipeLine[]>();
  for (const line of lines) {
    const list = byVersion.get(line.recipe_version_id) ?? [];
    list.push(
      line.item_id
        ? { kind: 'item', itemId: line.item_id, quantity: line.quantity }
        : { kind: 'recipe', recipeId: line.sub_recipe_id!, quantity: line.quantity },
    );
    byVersion.set(line.recipe_version_id, list);
  }

  return Object.fromEntries(
    versions.map((v) => [
      v.recipe_id,
      {
        id: v.recipe_id,
        versionId: v.id,
        version: v.version,
        effectiveFrom: v.effective_from,
        yieldAmount: v.yield_amount,
        lossFraction: v.loss_fraction,
        lines: byVersion.get(v.id) ?? [],
      } satisfies Recipe,
    ]),
  );
}

/**
 * Saves a recipe as a NEW version rather than editing the old one.
 *
 * Versions are never overwritten: a production run records which version it
 * used, so changing the formula today must not rewrite what last year's batches
 * cost.
 */
export async function saveRecipeVersion(
  companyId: string,
  input: {
    recipeId?: string;
    name: string;
    yieldAmount: number;
    yieldUnit: string;
    lossFraction: number;
    lines: RecipeLine[];
    note?: string;
  },
): Promise<{ recipeId: string; version: number }> {
  const conn = await db();
  const at = nowIso();
  const recipeId = input.recipeId ?? newId();
  const versionId = newId();
  const lineIds: string[] = [];
  let version = 1;

  // A version without its lines is a recipe that costs nothing, which is worse
  // than no version at all - so the whole thing is one transaction.
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO recipes (id, company_id, name, yield_amount, yield_unit, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         yield_amount = excluded.yield_amount,
         yield_unit = excluded.yield_unit`,
      [recipeId, companyId, input.name, input.yieldAmount, input.yieldUnit, at],
    );

    const previous = await conn.getFirstAsync<{ v: number }>(
      `SELECT MAX(version) AS v FROM recipe_versions WHERE recipe_id = ?`,
      [recipeId],
    );
    version = (previous?.v ?? 0) + 1;

    await conn.runAsync(
      `INSERT INTO recipe_versions (id, company_id, recipe_id, version, effective_from,
                                    loss_fraction, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        companyId,
        recipeId,
        version,
        at.slice(0, 10),
        input.lossFraction,
        input.note ?? null,
        at,
      ],
    );

    for (const [position, line] of input.lines.entries()) {
      const lineId = newId();
      lineIds.push(lineId);

      await conn.runAsync(
        `INSERT INTO recipe_lines (id, company_id, recipe_version_id, item_id, sub_recipe_id,
                                   quantity, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId,
          companyId,
          versionId,
          line.kind === 'item' ? line.itemId : null,
          line.kind === 'recipe' ? line.recipeId : null,
          line.quantity,
          position,
        ],
      );
    }

    // The lines go with the version, in order, after it. A version that
    // arrives without them is a recipe that costs nothing on the other device,
    // which is worse than one that has not arrived at all.
    await enqueue(conn, [
      { table: 'recipes', rowId: recipeId },
      { table: 'recipe_versions', rowId: versionId },
      ...lineIds.map((id) => ({ table: 'recipe_lines', rowId: id })),
    ]);
  });

  return { recipeId, version };
}

/** Names for every item and recipe, so a cost breakdown reads in words. */
export async function labels(companyId: string): Promise<Record<string, string>> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ id: string; name: string }>(
    `SELECT id, name FROM items WHERE company_id = ?
     UNION ALL
     SELECT id, name FROM recipes WHERE company_id = ?`,
    [companyId, companyId],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Converts what the buyer typed into base units, using the item's own factor. */
export function purchaseToBaseUnits(item: Item, purchaseQuantity: number): number {
  const factor = item.purchaseToBase ?? 1;
  return Math.round(purchaseQuantity * factor);
}

export { cents };

// --- products ---------------------------------------------------------------

export type Product = {
  id: string;
  itemId: string;
  name: string;
  /** `null` for resale: a resale product has no recipe, only a purchase cost. */
  recipeId: string | null;
  /** How much of the batch becomes one unit. 75 ml per popsicle. */
  yieldPerUnit: number | null;
  /** Stick, wrapper, label - packaging is a cost per unit, not per batch. */
  unitPackagingCents: Cents;
  packaging: PackagingHierarchy;
};

export async function listProducts(companyId: string): Promise<Product[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    item_id: string;
    name: string;
    recipe_id: string | null;
    yield_per_unit: number | null;
    unit_packaging_cents: number;
    packaging: string;
  }>(
    `SELECT p.id, p.item_id, i.name, p.recipe_id, p.yield_per_unit,
            p.unit_packaging_cents, i.packaging
       FROM products p
       JOIN items i ON i.id = p.item_id
      WHERE p.company_id = ? AND p.active = 1
      ORDER BY i.name COLLATE NOCASE`,
    [companyId],
  );

  return rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    name: r.name,
    recipeId: r.recipe_id,
    yieldPerUnit: r.yield_per_unit,
    unitPackagingCents: r.unit_packaging_cents as Cents,
    packaging: parsePackaging(r.packaging),
  }));
}

/**
 * Saves a product and the item behind it in one step.
 *
 * A product is an item that can also be made or resold, not a separate thing
 * living in a parallel table - which is what lets one ledger hold both the
 * sugar going in and the popsicle coming out.
 */
export async function saveProduct(
  companyId: string,
  input: {
    id?: string;
    itemId?: string;
    name: string;
    kind: Extract<ItemKind, 'product' | 'resale'>;
    recipeId: string | null;
    yieldPerUnit: number | null;
    unitPackagingCents: Cents;
    packaging: PackagingHierarchy;
  },
): Promise<{ productId: string; itemId: string }> {
  const conn = await db();
  let itemId = '';
  let productId = '';

  await conn.withTransactionAsync(async () => {
    itemId = await writeItem(conn, companyId, {
      id: input.itemId,
      kind: input.kind,
      name: input.name,
      purchaseUnit: null,
      purchaseToBase: null,
      baseUnit: 'un',
      packaging: input.packaging,
    });

    productId = input.id ?? newId();
    await conn.runAsync(
      `INSERT INTO products (id, company_id, item_id, recipe_id, yield_per_unit,
                             unit_packaging_cents, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         recipe_id = excluded.recipe_id,
         yield_per_unit = excluded.yield_per_unit,
         unit_packaging_cents = excluded.unit_packaging_cents`,
      [
        productId,
        companyId,
        itemId,
        input.recipeId,
        input.yieldPerUnit,
        input.unitPackagingCents,
      ],
    );

    await enqueue(conn, [{ table: 'products', rowId: productId }]);
  });

  return { productId, itemId };
}

// --- what changed -----------------------------------------------------------

export type CostChange = {
  itemId: string;
  name: string;
  previousRate: Rate | null;
  newRate: Rate;
  observedAt: string;
};

/**
 * The most recent moves in what things cost.
 *
 * This is the raw material of the briefing: a home screen that only shows
 * totals says nothing, because the owner already knows roughly what they are.
 * What they do not know is what moved since they last looked.
 */
export async function recentCostChanges(companyId: string, limit = 5): Promise<CostChange[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    previous_rate: number | null;
    new_rate: number;
    observed_at: string;
  }>(
    `SELECT h.item_id, i.name, h.previous_rate, h.new_rate, h.observed_at
       FROM item_cost_history h
       JOIN items i ON i.id = h.item_id
      WHERE h.company_id = ? AND h.previous_rate IS NOT NULL
      ORDER BY h.observed_at DESC
      LIMIT ?`,
    [companyId, limit],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    previousRate: r.previous_rate === null ? null : (r.previous_rate as Rate),
    newRate: r.new_rate as Rate,
    observedAt: r.observed_at,
  }));
}

// --- erasing -----------------------------------------------------------------

/**
 * Counts everything the confirmation dialog needs to speak in real numbers,
 * including the references that block an area from being cleared.
 *
 * One round trip per fact would be simpler to read and slower to run on a cold
 * phone; one query that returns them together keeps the settings screen instant.
 */
export async function countForErase(companyId: string): Promise<EraseCounts> {
  const conn = await db();
  const row = await conn.getFirstAsync<Record<keyof EraseCounts, number>>(
    `SELECT
       (SELECT COUNT(*) FROM items WHERE company_id = ?1
          AND kind IN ('input','packaging','store_supply')) AS inputs,
       (SELECT COUNT(*) FROM recipes   WHERE company_id = ?1) AS recipes,
       (SELECT COUNT(*) FROM products  WHERE company_id = ?1) AS products,
       (SELECT COUNT(*) FROM purchases WHERE company_id = ?1) AS purchases,
       (SELECT COUNT(*) FROM recipe_lines WHERE company_id = ?1
          AND item_id IS NOT NULL) AS recipeLinesUsingInputs,
       (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
          WHERE pl.company_id = ?1
            AND i.kind IN ('input','packaging','store_supply')) AS purchaseLinesUsingItems,
       (SELECT COUNT(*) FROM products WHERE company_id = ?1
          AND recipe_id IS NOT NULL) AS productsUsingRecipes,
       (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
          WHERE pl.company_id = ?1
            AND i.kind IN ('product','resale')) AS purchaseLinesUsingProducts`,
    [companyId],
  );

  return { ...emptyCounts, ...(row ?? {}) };
}

/**
 * Clears an area, in the only order the foreign keys allow.
 *
 * It refuses rather than half-succeeds: the blocker is checked first, and the
 * whole thing runs in one transaction, so an interruption cannot leave a recipe
 * whose ingredients are gone. Half-erased data is worse than either state.
 */
export async function eraseArea(companyId: string, area: EraseArea): Promise<void> {
  const blocker = blockerFor(area, await countForErase(companyId));
  if (blocker) throw new EraseBlockedError(blocker);

  const conn = await db();
  const kinds = itemKindsFor(area);

  await conn.withTransactionAsync(async () => {
    for (const table of tablesFor(area)) {
      // `items` is the one table shared by two areas, so it is the one place a
      // delete has to say which kinds it owns.
      if (table === 'items' && kinds) {
        // `marks` is only ever question marks; the kinds themselves are bound.
        const marks = kinds.map(() => '?').join(', ');  // proofgate-allow
        await conn.runAsync(
          `DELETE FROM items WHERE company_id = ? AND kind IN (${marks})`,
          [companyId, ...kinds],
        );
      } else if (table === 'products' && area === 'products') {
        await conn.runAsync(`DELETE FROM products WHERE company_id = ?`, [companyId]);
        await conn.runAsync(
          `DELETE FROM items WHERE company_id = ? AND kind IN ('product','resale')`,
          [companyId],
        );
      } else if (table === 'outbox') {
        await conn.runAsync(`DELETE FROM outbox`);
      } else {
        // The table name comes from `ErasableTable`, a closed union, so this
        // interpolation cannot carry anything a caller chose. proofgate-allow
        await conn.runAsync(`DELETE FROM ${table} WHERE company_id = ?`, [companyId]);
      }
    }

    // Enqueued *after* the deletes, and that order is the whole point.
    //
    // Erasing everything clears `outbox` too, so a command queued before the
    // loop deleted itself on the way past: the device came out empty and the
    // server never heard, so the next pull restored precisely what the person
    // had asked to destroy.
    //
    // The area is the unit rather than the row: a wipe is one decision, and
    // replaying it row by row would describe something the person never did.
    await enqueue(conn, [{ table: 'erase', rowId: area, op: 'delete', payload: { area } }]);
  });
}

// --- one item, in depth --------------------------------------------------------

export type PriceMoveRow = {
  previousRate: Rate | null;
  newRate: Rate;
  observedAt: string;
};

/**
 * Everything one input has been through.
 *
 * The price history is not a feature anybody maintains - it is the by-product
 * of buying, written by `recordPurchase` on the way past. This is the query
 * that finally shows it, which is what turns "trust me, it went up" into
 * something the person can look at.
 */
export async function itemHistory(
  companyId: string,
  itemId: string,
  limit = 24,
): Promise<PriceMoveRow[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    previous_rate: number | null;
    new_rate: number;
    observed_at: string;
  }>(
    `SELECT previous_rate, new_rate, observed_at
       FROM item_cost_history
      WHERE company_id = ? AND item_id = ?
      ORDER BY observed_at DESC
      LIMIT ?`,
    [companyId, itemId, limit],
  );

  return rows.map((r) => ({
    previousRate: r.previous_rate === null ? null : (r.previous_rate as Rate),
    newRate: r.new_rate as Rate,
    observedAt: r.observed_at,
  }));
}

/**
 * Which recipes stand on this item, at their newest version.
 *
 * It answers the question that decides whether a price move matters: sugar
 * going up 9% is a headline only if eight flavours use it.
 */
export async function recipesUsingItem(
  companyId: string,
  itemId: string,
): Promise<{ id: string; name: string; quantity: number }[]> {
  const conn = await db();
  return conn.getAllAsync<{ id: string; name: string; quantity: number }>(
    `SELECT r.id, r.name, l.quantity
       FROM recipe_lines l
       JOIN recipe_versions v ON v.id = l.recipe_version_id
       JOIN recipes r ON r.id = v.recipe_id
      WHERE l.company_id = ? AND l.item_id = ?
        AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2
                          WHERE v2.recipe_id = v.recipe_id)
      ORDER BY r.name COLLATE NOCASE`,
    [companyId, itemId],
  );
}

export async function findItem(companyId: string, itemId: string): Promise<ItemWithCost | null> {
  // Includes the inactive: the screen that offers to reactivate an item has to
  // be able to open it.
  const all = await listItems(companyId, undefined, true);
  return all.find((item) => item.id === itemId) ?? null;
}

/**
 * Takes an item out of circulation without taking it out of history.
 *
 * Deleting is often refused - a purchase or a recipe stands on the row - and
 * that refusal is correct: erasing an item that an invoice points at would
 * leave a cost nobody can explain. But "I typed the name wrong" and "we stopped
 * buying this" are ordinary things that must have an answer.
 *
 * So the row stays, the past stays intact, and the item stops appearing in the
 * places where you pick something. Reversible, because nothing was destroyed.
 */
export async function setItemActive(
  companyId: string,
  itemId: string,
  active: boolean,
): Promise<void> {
  const conn = await db();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(`UPDATE items SET active = ? WHERE id = ? AND company_id = ?`, [
      active ? 1 : 0,
      itemId,
      companyId,
    ]);
    await enqueue(conn, [{ table: 'items', rowId: itemId }]);
  });
}

