import { applyCostEvent, type StockCostState } from '@/domain/cost';
import { cents, rate, type Cents, type Rate } from '@/domain/money';
import type { ItemCosts, Recipe, RecipeLine } from '@/domain/recipe';
import type { PackagingHierarchy } from '@/domain/units';
import { db, newId, nowIso } from './db';

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

export async function listItems(companyId: string, kind?: ItemKind): Promise<ItemWithCost[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    kind: ItemKind;
    name: string;
    purchase_unit: string | null;
    purchase_to_base: number | null;
    base_unit: string;
    packaging: string;
    average_rate: number | null;
    last_rate: number | null;
    on_hand_base_units: number | null;
  }>(
    `SELECT i.id, i.kind, i.name, i.purchase_unit, i.purchase_to_base, i.base_unit, i.packaging,
            c.average_rate, c.last_rate, c.on_hand_base_units
       FROM items i
       LEFT JOIN item_costs c ON c.item_id = i.id
      WHERE i.company_id = ? AND i.active = 1
        AND (? IS NULL OR i.kind = ?)
      ORDER BY i.name COLLATE NOCASE`,
    [companyId, kind ?? null, kind ?? null],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    purchaseUnit: r.purchase_unit,
    purchaseToBase: r.purchase_to_base,
    baseUnit: r.base_unit,
    packaging: parsePackaging(r.packaging),
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
  },
): Promise<{ previousRate: Rate | null; newRate: Rate }> {
  const conn = await db();
  const at = nowIso();

  const current = await conn.getFirstAsync<{
    average_rate: number;
    on_hand_base_units: number;
  }>(`SELECT average_rate, on_hand_base_units FROM item_costs WHERE item_id = ?`, [input.itemId]);

  const before: StockCostState = {
    baseUnits: current?.on_hand_base_units ?? 0,
    averageRate: (current?.average_rate ?? 0) as Rate,
  };

  // The same function the tests cover and the assistant will call.
  const after = applyCostEvent(before, {
    kind: 'purchase',
    baseUnits: input.baseUnits,
    totalCents: input.totalCents,
    at,
  });

  const purchaseId = newId();
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
      newId(),
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

  await conn.runAsync(
    `INSERT INTO item_costs (item_id, company_id, average_rate, last_rate, on_hand_base_units, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       average_rate = excluded.average_rate,
       last_rate = excluded.last_rate,
       on_hand_base_units = excluded.on_hand_base_units,
       updated_at = excluded.updated_at`,
    [input.itemId, companyId, after.averageRate, lineRate, after.baseUnits, at],
  );

  await conn.runAsync(
    `INSERT INTO item_cost_history (id, company_id, item_id, previous_rate, new_rate, observed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [newId(), companyId, input.itemId, before.averageRate || null, after.averageRate, at],
  );

  return {
    previousRate: before.averageRate > 0 ? before.averageRate : null,
    newRate: after.averageRate,
  };
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
  const version = (previous?.v ?? 0) + 1;

  const versionId = newId();
  await conn.runAsync(
    `INSERT INTO recipe_versions (id, company_id, recipe_id, version, effective_from,
                                  loss_fraction, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [versionId, companyId, recipeId, version, at.slice(0, 10), input.lossFraction, input.note ?? null, at],
  );

  for (const [position, line] of input.lines.entries()) {
    await conn.runAsync(
      `INSERT INTO recipe_lines (id, company_id, recipe_version_id, item_id, sub_recipe_id,
                                 quantity, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        companyId,
        versionId,
        line.kind === 'item' ? line.itemId : null,
        line.kind === 'recipe' ? line.recipeId : null,
        line.quantity,
        position,
      ],
    );
  }

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

  const itemId = await saveItem(companyId, {
    id: input.itemId,
    kind: input.kind,
    name: input.name,
    purchaseUnit: null,
    purchaseToBase: null,
    baseUnit: 'un',
    packaging: input.packaging,
  });

  const productId = input.id ?? newId();
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
