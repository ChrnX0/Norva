import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { fromDecimal, rate } from '@/domain/money';
import { localDate } from '@/domain/day';
import { costRecipe } from '@/domain/recipe';
import { __setDb, migrate, migrationSteps, nowIso, type Db, type SqlParam } from './db';
import {
  balanceByLocation,
  lastSentBaseUnits,
  recordProduction,
  runningOut,
  productionBetween,
  productionOn,
  shipmentsOn,
  recordCheck,
  recordLoss,
  openProductionRun,
  openProductionRuns,
  cancelProductionRun,
  closeProductionRun,
  RunGoneError,
  NotEnoughStockError,
  unchecked,
  savePlace,
  stockByPlace,
  recordTransfer,
  countForErase,
  eraseArea,
  itemCosts,
  labels,
  listItems,
  lotsOn,
  listProducts,
  itemMovements,
  listRecipes,
  loadRecipeGraph,
  recentCostChanges,
  recordCount,
  recordPurchase,
  saveItem,
  saveProduct,
  saveRecipeVersion,
  purchaseToBaseUnits,
  defaultLocationId,
  saveOrder,
  listOrders,
  setOrderStatus,
  orderedDemand,
  ordersNeedApproval,
  setOrdersNeedApproval,
} from './repository';
import { EraseBlockedError } from './erase';
import { markSent, pendingCount, pendingEntries, forgetSentBefore } from './outbox';
import { ensureStarterData, hasSeeded, LOCAL_COMPANY_ID } from './seed';

/**
 * The data layer against a real database.
 *
 * Everything else in this suite tests arithmetic, which is where the important
 * bugs have been. But arithmetic that is correct and then stored wrong is
 * indistinguishable from arithmetic that is wrong, and the SQL had no test at
 * all: `expo-sqlite` only exists on a device.
 *
 * Node ships its own SQLite, and `db()` was already written against a named
 * interface, so the real queries can run here - the same statements the phone
 * executes, against the same schema, including the foreign keys that decide
 * what erasing is allowed to do.
 */

/** Node's SQLite is synchronous; the app's is not. This bridges the two. */
function inMemoryDb(): Db {
  // Foreign keys are on by default here, which matters: the erase order is
  // only meaningful if the references are actually enforced.
  const sqlite = new DatabaseSync(':memory:');

  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));

  return {
    getAllAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      (sqlite.prepare(sql).get(...bind(params)) as T) ?? null,
    runAsync: async (sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).run(...bind(params)),
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const CO = LOCAL_COMPANY_ID;

/** Kept so a test can ask the schema about itself, not just the data. */
let live: Db;

beforeEach(async () => {
  const conn = inMemoryDb();
  // The same runner the phone uses on launch, so the tests exercise the
  // migration path rather than a schema written out a second time.
  await migrate(conn);
  __setDb(conn);
  live = conn;
});

const loose = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };

async function anInput(name: string, perPack: number) {
  return saveItem(CO, {
    kind: 'input',
    name,
    purchaseUnit: 'saco',
    purchaseToBase: perPack,
    baseUnit: 'g',
    packaging: loose,
  });
}

test('a purchase writes the invoice and moves the average in one step', async () => {
  const sugar = await anInput('Açúcar cristal', 25_000);

  const first = await recordPurchase(CO, {
    itemId: sugar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });

  assert.equal(first.previousRate, null, 'the first invoice has nothing to blend with');
  assert.ok(Math.abs(first.newRate - 0.472) < 1e-9);

  const second = await recordPurchase(CO, {
    itemId: sugar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(590),
  });

  // Equal quantities at 0.472 and 0.590 land at 0.531 - the same number the
  // Postgres trigger is checked against in scripts/verify-migrations.sh.
  assert.ok(Math.abs(second.newRate - 0.531) < 1e-9, `got ${second.newRate}`);

  const [item] = await listItems(CO);
  assert.ok(Math.abs(item.averageRate - 0.531) < 1e-9);
  assert.ok(Math.abs((item.lastRate ?? 0) - 0.59) < 1e-9, 'the last price stays visible');
  assert.equal(item.onHandBaseUnits, 200_000);

  // The price history wrote itself; nobody was asked to keep it.
  const history = await recentCostChanges(CO, 10);
  assert.equal(history.length, 1, 'only the move that had something to move from');
  assert.equal(history[0].name, 'Açúcar cristal');
});

test('the rate survives storage at full precision, not rounded to a cent', async () => {
  const pulp = await anInput('Polpa de morango', 10_000);
  await recordPurchase(CO, {
    itemId: pulp,
    purchaseQuantity: 1,
    baseUnits: 10_000,
    totalCents: fromDecimal(124),
  });

  const costs = await itemCosts(CO);
  // 1.24 cents per gram. Stored as an integer this is the bug that once cost
  // the engine 19% of the pulp and all of the mix.
  assert.ok(Math.abs(costs[pulp] - rate(12.4, 1_000)) < 1e-9, `got ${costs[pulp]}`);
});

test('saving a recipe twice keeps both versions and reads back the newest', async () => {
  const sugar = await anInput('Açúcar cristal', 25_000);

  const first = await saveRecipeVersion(CO, {
    name: 'Base de creme',
    yieldAmount: 20_000,
    yieldUnit: 'ml',
    lossFraction: 0.02,
    lines: [{ kind: 'item', itemId: sugar, quantity: 3_000 }],
  });
  assert.equal(first.version, 1);

  const second = await saveRecipeVersion(CO, {
    recipeId: first.recipeId,
    name: 'Base de creme',
    yieldAmount: 20_000,
    yieldUnit: 'ml',
    lossFraction: 0.04,
    lines: [{ kind: 'item', itemId: sugar, quantity: 3_500 }],
  });
  assert.equal(second.version, 2, 'a change is a new version, never an overwrite');

  const graph = await loadRecipeGraph(CO);
  const recipe = graph[first.recipeId];
  assert.equal(recipe.version, 2);
  assert.equal(recipe.lossFraction, 0.04);
  assert.equal(recipe.lines.length, 1);
  assert.equal(recipe.lines[0].kind === 'item' && recipe.lines[0].quantity, 3_500);

  assert.equal((await listRecipes(CO)).length, 1, 'two versions are still one recipe');
});

test('a sub-recipe survives the round trip through the database', async () => {
  const sugar = await anInput('Açúcar cristal', 25_000);
  await recordPurchase(CO, {
    itemId: sugar,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
  });

  const base = await saveRecipeVersion(CO, {
    name: 'Base',
    yieldAmount: 20_000,
    yieldUnit: 'ml',
    lossFraction: 0,
    lines: [{ kind: 'item', itemId: sugar, quantity: 3_000 }],
  });

  const flavour = await saveRecipeVersion(CO, {
    name: 'Sabor',
    yieldAmount: 40_000,
    yieldUnit: 'ml',
    lossFraction: 0.05,
    lines: [{ kind: 'recipe', recipeId: base.recipeId, quantity: 10_000 }],
  });

  // Loaded straight from SQLite and costed by the same engine the screens use.
  const cost = costRecipe(
    flavour.recipeId,
    await loadRecipeGraph(CO),
    await itemCosts(CO),
    await labels(CO),
  );

  assert.equal(cost.lines.length, 1);
  assert.equal(cost.lines[0].label, 'Base');
  assert.ok(cost.batchCents > 0, 'the sub-recipe carried its cost up');
});

test('the starter data lands, and does not come back after it is wiped', async () => {
  await ensureStarterData(CO);
  assert.equal(await hasSeeded(), true);

  const counts = await countForErase(CO);
  assert.equal(counts.inputs, 6);
  assert.equal(counts.recipes, 2);
  assert.equal(counts.products, 1);
  assert.equal(counts.purchases, 6);

  const products = await listProducts(CO);
  assert.equal(products[0].name, 'Picolé de morango');
  assert.ok(products[0].recipeId, 'the product knows its recipe');

  await eraseArea(CO, 'all');
  assert.deepEqual(await listItems(CO), []);

  // The mark is what stops the demo reappearing tomorrow morning.
  await ensureStarterData(CO);
  assert.deepEqual(await listItems(CO), [], 'the example must stay gone');
});

test('erasing an area is refused when another area stands on it', async () => {
  await ensureStarterData(CO);

  // The refusal carries the reason, not a sentence - the screen writes the
  // sentence, which is what lets the same rule speak three languages.
  await assert.rejects(
    () => eraseArea(CO, 'inputs'),
    (e: unknown) =>
      e instanceof EraseBlockedError && e.blocker.reason === 'recipesUseInputs',
    'inputs under a recipe cannot go first',
  );

  await assert.rejects(
    () => eraseArea(CO, 'recipes'),
    (e: unknown) =>
      e instanceof EraseBlockedError && e.blocker.reason === 'productsUseRecipes',
    'a recipe under a product cannot go first',
  );

  // Following the order the refusal named actually works, all the way down.
  await eraseArea(CO, 'products');
  await eraseArea(CO, 'recipes');
  await eraseArea(CO, 'purchases');
  await eraseArea(CO, 'inputs');

  const counts = await countForErase(CO);
  assert.deepEqual(
    [counts.inputs, counts.recipes, counts.products, counts.purchases],
    [0, 0, 0, 0],
  );
});

test('erasing one area leaves the others standing', async () => {
  await ensureStarterData(CO);

  await eraseArea(CO, 'products');

  assert.deepEqual(await listProducts(CO), []);
  assert.equal((await listRecipes(CO)).length, 2, 'the recipes are still there');
  assert.equal((await listItems(CO)).length, 6, 'so are the inputs');
});

test('erasing invoices drops the average with them', async () => {
  await ensureStarterData(CO);

  const before = await itemCosts(CO);
  assert.ok(Object.values(before).some((r) => r > 0), 'the example arrives with costs');

  const held = await listItems(CO);
  assert.ok(held.some((i) => i.onHandBaseUnits > 0), 'and it arrives with stock');

  await eraseArea(CO, 'purchases');

  assert.deepEqual(await itemCosts(CO), {}, 'no invoice, no average');

  // The stock goes with them, and the reason is worth pinning down because the
  // rule looks too broad at a glance. A count is stored as a difference from a
  // balance - delete the arrivals it was measured against and what is left is
  // arithmetic about nothing.
  assert.ok(
    (await listItems(CO)).every((i) => i.onHandBaseUnits === 0),
    'no invoice, no stock either',
  );

  // Six inputs plus the popsicle, which is an item as well as a product.
  assert.equal((await listItems(CO)).length, 7, 'the things themselves stay');
  assert.equal((await countForErase(CO)).inputs, 6);
});

test('a product is an item too, and saving one creates both', async () => {
  const recipe = await saveRecipeVersion(CO, {
    name: 'Massa',
    yieldAmount: 10_000,
    yieldUnit: 'ml',
    lossFraction: 0,
    lines: [],
  });

  const { productId, itemId } = await saveProduct(CO, {
    name: 'Picolé de teste',
    kind: 'product',
    recipeId: recipe.recipeId,
    yieldPerUnit: 75,
    unitPackagingCents: fromDecimal(0.05),
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }, { id: 'box', perBaseUnit: 50 }] },
  });

  assert.ok(productId && itemId);

  const [product] = await listProducts(CO);
  assert.equal(product.name, 'Picolé de teste');
  assert.equal(product.unitPackagingCents, 5);
  assert.equal(product.packaging.tiers.length, 2, 'the hierarchy round-trips as JSON');

  // It does not show up among the things you buy.
  const inputs = await listItems(CO, 'input');
  assert.equal(inputs.length, 0);
});

/**
 * The ledger, which is foundation 1 of this project and was for a while the one
 * foundation the device did not have.
 *
 * These tests exist because the violation was invisible: the arithmetic was
 * right, the screens showed sensible numbers, and every test passed. What was
 * missing could only be seen by asking where the number came from.
 */

test('the stock figure is the sum of movements, and the tempting column is gone', async () => {
  const sugar = await anInput('Açúcar cristal', 25_000);

  await recordPurchase(CO, {
    itemId: sugar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });

  const moves = await itemMovements(CO, sugar);
  assert.equal(moves.length, 1, 'the arrival is on the record, not only in a total');
  assert.equal(moves[0].kind, 'purchase');
  assert.equal(moves[0].baseUnits, 100_000);

  const [item] = await listItems(CO);
  assert.equal(item.onHandBaseUnits, 100_000);

  // The point of the whole change: there is no longer a stored total to drift
  // away from the history. If this column ever comes back, so does the bug.
  const columns = await live.getAllAsync<{ name: string }>('PRAGMA table_info(item_costs)');
  assert.ok(
    !columns.some((c) => c.name === 'on_hand_base_units'),
    'a mutable stock column is exactly what foundation 1 forbids',
  );
});

test('a count can take stock down - which nothing in this app could do before', async () => {
  const sugar = await anInput('Açúcar cristal', 25_000);
  await recordPurchase(CO, {
    itemId: sugar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });

  // Somebody walks to the shelf and finds 92 kg where the ledger expected 100.
  const result = await recordCount(CO, { locationId: defaultLocationId(CO), itemId: sugar, countedBaseUnits: 92_000 });

  assert.equal(result.expectedBaseUnits, 100_000);
  assert.equal(result.countedBaseUnits, 92_000);
  assert.equal(result.deltaBaseUnits, -8_000);
  // 8 kg missing, at 0,472 cents per gram: 8000 x 0.472 = 3776 cents, R$ 37,76
  // walked out of the storeroom without an invoice.
  assert.equal(result.deltaCents, -3_776);

  const [item] = await listItems(CO);
  assert.equal(item.onHandBaseUnits, 92_000, 'the shelf and the ledger now agree');

  // And the disagreement itself is still there to be asked about later.
  const moves = await itemMovements(CO, sugar);
  assert.equal(moves.length, 2);
  // 'adjustment' is the ledger's own word for a physical count correction, so
  // the count needs no column of its own to say what it was.
  assert.equal(moves[0].kind, 'adjustment');
  assert.equal(moves[0].baseUnits, -8_000);
});

test('a count that finds exactly what was expected is still written down', async () => {
  const sugar = await anInput('Açúcar cristal', 25_000);
  await recordPurchase(CO, {
    itemId: sugar,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
  });

  const result = await recordCount(CO, { locationId: defaultLocationId(CO), itemId: sugar, countedBaseUnits: 25_000 });
  assert.equal(result.deltaBaseUnits, 0);

  // A shelf nobody has looked at in months must not read the same as one
  // somebody verified this morning.
  const moves = await itemMovements(CO, sugar);
  assert.equal(moves.length, 2);
  assert.equal(moves[0].kind, 'adjustment');
  assert.equal(moves[0].baseUnits, 0, 'nothing moved, and that is the finding');
});

test('a phone that already holds invoices keeps its balance through the upgrade', async () => {
  const conn = inMemoryDb();

  // Stand the database up at the version before the ledger existed - the state
  // every phone already carrying data is in.
  await conn.execAsync(migrationSteps[0]);
  await conn.execAsync(migrationSteps[1]);
  await conn.execAsync('PRAGMA user_version = 2');

  await conn.runAsync(
    `INSERT INTO items (id, company_id, kind, name, base_unit, created_at)
     VALUES ('i1', ?, 'input', 'Açúcar cristal', 'g', '2026-01-01T00:00:00.000Z')`,
    [CO],
  );
  await conn.runAsync(
    `INSERT INTO purchases (id, company_id, created_at)
     VALUES ('p1', ?, '2026-01-02T00:00:00.000Z')`,
    [CO],
  );
  await conn.runAsync(
    `INSERT INTO purchase_lines (id, company_id, purchase_id, item_id, purchase_quantity,
                                 base_units, total_cents, created_at)
     VALUES ('l1', ?, 'p1', 'i1', 4, 100000, 47200, '2026-01-02T00:00:00.000Z')`,
    [CO],
  );
  await conn.runAsync(
    `INSERT INTO item_costs (item_id, company_id, average_rate, last_rate,
                             on_hand_base_units, updated_at)
     VALUES ('i1', ?, 0.472, 0.472, 100000, '2026-01-02T00:00:00.000Z')`,
    [CO],
  );

  await migrate(conn);

  const held = await conn.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS total
       FROM movements WHERE item_id = 'i1'`,
  );
  assert.equal(held?.total, 100_000, 'the balance survived the upgrade unchanged');

  const move = await conn.getFirstAsync<{ id: string; kind: string; unit_cost_rate: number }>(
    `SELECT id, kind, unit_cost_rate FROM movements WHERE item_id = 'i1'`,
  );
  assert.equal(move?.id, 'l1', 'the line keeps its identity, so a replay cannot double it');
  assert.equal(move?.kind, 'purchase');
  assert.ok(
    Math.abs((move?.unit_cost_rate ?? 0) - 0.472) < 1e-9,
    'and what it cost came with it',
  );

  // Running the whole thing again must be a no-op, because a phone that dies
  // mid-upgrade will come back and try.
  await migrate(conn);
  const again = await conn.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS total
       FROM movements WHERE item_id = 'i1'`,
  );
  assert.equal(again?.total, 100_000, 'the backfill did not run twice');
});

test('erasing everything leaves the order to erase, and nothing else', async () => {
  await ensureStarterData(CO);
  await eraseArea(CO, 'all');

  // "Apagar tudo" clears the outbox as well, so the command describing the
  // wipe used to delete itself on the way past: the device came out empty, the
  // server never heard, and the next sync restored exactly what the person had
  // asked to destroy.
  const queued = await pendingEntries();
  assert.deepEqual(
    queued.map((e) => e.table),
    ['erase'],
    'the order to erase has to survive the erase it describes',
  );
  assert.equal(queued[0].op, 'delete');
  assert.equal(queued[0].rowId, 'all');
});

/**
 * Two more the audit found exported with nobody calling them.
 *
 * `purchaseToBaseUnits` had a caller after all - it was just a second copy of
 * itself, typed by hand inside the purchase screen. Two implementations of one
 * rule agree until somebody corrects one of them, and then there is no way to
 * say which number is right. The screen now calls this; this is what checks it.
 *
 * `forgetSentBefore` is the outbox's own housekeeping, and the reason it needs
 * a test rather than a delete is what it must NOT do: dropping something that
 * has not gone up yet loses a write a person believes they made.
 */

test('what the buyer typed becomes base units through one rule, not two', () => {
  const sack = { purchaseToBase: 25_000 } as Parameters<typeof purchaseToBaseUnits>[0];
  assert.equal(purchaseToBaseUnits(sack, 4), 100_000);

  // A fractional pack is real - half a sack happens - and the base unit is the
  // smallest thing that exists, so it lands on a whole one.
  assert.equal(purchaseToBaseUnits(sack, 0.5), 12_500);

  // No factor means the purchase unit IS the base unit. Defaulting to zero here
  // would make an invoice arrive carrying nothing.
  const each = { purchaseToBase: null } as Parameters<typeof purchaseToBaseUnits>[0];
  assert.equal(purchaseToBaseUnits(each, 7), 7);
});

test('the outbox forgets what went up, and only what went up', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);

  const queued = await pendingEntries();
  assert.ok(queued.length > 2, 'the seed leaves a queue to work with');

  // Half of them have been accepted by the server; the rest have not.
  const sent = queued.slice(0, 2).map((e) => e.id);
  await markSent(sent);
  const stillWaiting = await pendingCount();

  await forgetSentBefore('2099-01-01T00:00:00Z');

  // Everything already accepted is gone, and nothing that is still waiting is -
  // a write dropped before it arrives is a write the person watched themselves
  // make and the factory will never see.
  assert.equal(await pendingCount(), stillWaiting);
  const rows = await live.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NOT NULL`,
  );
  assert.equal(rows?.n, 0);
});

test('a movement made by talking carries the sentence; one made by hand does not', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));

  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
    assistantPhrase: 'comprei 1 saco de açúcar por 118',
  });
  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
  });

  const rows = await live.getAllAsync<{ assistant_phrase: string | null }>(
    `SELECT assistant_phrase FROM movements WHERE item_id = ? AND kind = 'purchase'
     ORDER BY recorded_at, rowid`,
    [sugar.id],
  );

  // The condition the plan put on letting an assistant write: its writes stay
  // auditable. The column, its index and the crossing to the server were all in
  // place and nothing ever filled it - which made every assistant movement
  // indistinguishable from one a person typed.
  const phrases = rows.map((r) => r.assistant_phrase);
  assert.ok(phrases.includes('comprei 1 saco de açúcar por 118'), 'the sentence is kept');
  assert.ok(
    phrases.includes(null),
    'and a movement somebody typed themselves is not labelled as the assistant',
  );
});

test('a recipe carries the identity of the version it is, not just its number', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const graph = await loadRecipeGraph(LOCAL_COMPANY_ID);
  const recipes = Object.values(graph);
  assert.ok(recipes.length > 0, 'the seed should leave recipes to look at');

  for (const recipe of recipes) {
    assert.ok(recipe.versionId, `${recipe.id} came back with no version identity`);
    // The bug this replaced: the query selected `recipe_versions.id` and then
    // mapped `id: v.recipe_id`, so the version's own identity never left the
    // data layer. Everything still typechecked, every test still passed, and
    // recording which formula a production used was quietly impossible - the
    // one item the phase audit could only mark "ausente" without a reason.
    assert.notEqual(
      recipe.versionId,
      recipe.id,
      'versionId is the recipe id again - the version identity is still not coming out',
    );
  }

  // And it has to be the row that actually holds this version's lines.
  const first = recipes[0];
  const row = await live.getFirstAsync<{ recipe_id: string; version: number }>(
    `SELECT recipe_id, version FROM recipe_versions WHERE id = ?`,
    [first.versionId],
  );
  assert.equal(row?.recipe_id, first.id);
  assert.equal(row?.version, first.version);
});

test('counting a shelf compares against that shelf, not the whole company', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const storeroom = defaultLocationId(LOCAL_COMPANY_ID);

  // A second place, which is what the cold room will be.
  const coldRoom = 'cold-room-for-this-test';
  await live.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at) VALUES (?, ?, ?, 'cold_room', ?)`,
    [coldRoom, LOCAL_COMPANY_ID, 'Câmara', '2026-09-01T00:00:00Z'],
  );
  await live.runAsync(
    `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                            quantity_base_units, location_id)
     VALUES ('m-cold', ?, 'transfer', ?, ?, ?, 4000, ?)`,
    [LOCAL_COMPANY_ID, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', sugar.id, coldRoom],
  );

  const inStoreroom = await live.getFirstAsync<{ n: number }>(
    `SELECT COALESCE(SUM(quantity_base_units),0) AS n FROM movements
      WHERE item_id = ? AND location_id = ?`,
    [sugar.id, storeroom],
  );

  // Counting the cold room finds the 4 kg that are there. Before the location
  // filter, the expected figure was the company's whole balance, so this count
  // would have written a difference of minus everything in the storeroom -
  // into the cold room. Stock teleported between rooms by somebody who did the
  // job correctly.
  const counted = await recordCount(LOCAL_COMPANY_ID, {
    locationId: coldRoom,
    itemId: sugar.id,
    countedBaseUnits: 4000,
  });
  assert.equal(counted.deltaBaseUnits, 0, 'the cold room agreed with itself');

  // And the storeroom is untouched by a count taken somewhere else.
  const after = await live.getFirstAsync<{ n: number }>(
    `SELECT COALESCE(SUM(quantity_base_units),0) AS n FROM movements
      WHERE item_id = ? AND location_id = ?`,
    [sugar.id, storeroom],
  );
  assert.equal(after?.n, inStoreroom?.n);
});

test('the balance splits by place, and the company total does not move', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const before = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === sugar.id);

  const cold = 'cold-room-split';
  await live.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at) VALUES (?, ?, 'Câmara', 'cold_room', ?)`,
    [cold, LOCAL_COMPANY_ID, '2026-09-01T00:00:00Z'],
  );
  // Six kilos move out of the storeroom and into the cold room: two legs, one
  // act. The sum over the company cannot notice.
  await live.runAsync(
    `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                            quantity_base_units, location_id, counterpart_location_id,
                            movement_group_id)
     VALUES ('leg-out', ?, 'transfer', ?, ?, ?, -6000, ?, ?, 'grp-1'),
            ('leg-in',  ?, 'transfer', ?, ?, ?,  6000, ?, ?, 'grp-1')`,
    [
      LOCAL_COMPANY_ID, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', sugar.id,
      defaultLocationId(LOCAL_COMPANY_ID), cold,
      LOCAL_COMPANY_ID, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', sugar.id,
      cold, defaultLocationId(LOCAL_COMPANY_ID),
    ],
  );

  const places = await balanceByLocation(LOCAL_COMPANY_ID, sugar.id);
  const inCold = places.find((p) => p.locationId === cold);
  const inStoreroom = places.find((p) => p.locationId === defaultLocationId(LOCAL_COMPANY_ID));

  assert.equal(inCold?.baseUnits, 6000, 'the six kilos are in the cold room');
  assert.equal(inCold?.kind, 'cold_room');
  assert.ok(inStoreroom && inStoreroom.baseUnits > 0, 'the storeroom still holds the rest');

  // Two legs, one act: the company has exactly as much sugar as before.
  const after = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === sugar.id);
  assert.equal(after?.onHandBaseUnits, before?.onHandBaseUnits);
  assert.equal(
    (inCold?.baseUnits ?? 0) + (inStoreroom?.baseUnits ?? 0),
    after?.onHandBaseUnits,
    'the places add up to the company - that is what makes both queries one arithmetic',
  );
});

test('what went out is grouped by where it landed, in the units each item has', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Norte', kind: 'own_store' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);

  const items = await listItems(LOCAL_COMPANY_ID);
  const acucar = items.find((i) => i.name.includes('Açúcar'));
  const polpa = items.find((i) => i.name.includes('Polpa'));
  assert.ok(acucar && polpa, 'o exemplo semeado tem os dois insumos');

  const quando = '2026-09-01T14:00:00.000Z';
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 6000,
    occurredAt: quando,
  });
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: polpa.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 4000,
    occurredAt: quando,
  });
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: norte.id,
    baseUnits: 2000,
    occurredAt: quando,
  });

  const dia = await shipmentsOn(
    LOCAL_COMPANY_ID,
    '2026-09-01T00:00:00.000Z',
    '2026-09-02T00:00:00.000Z',
  );

  // Dois destinos, e a fábrica NÃO é um deles: ela é a origem, e a perna dela é
  // negativa. Se a consulta lesse as duas pernas, a fábrica apareceria como
  // destino de si mesma e o total do dia dobraria.
  assert.equal(dia.length, 2);
  assert.ok(!dia.some((d) => d.locationId === fabrica), 'a origem não é destino');

  const paraCentro = dia.find((d) => d.locationName === 'Loja Centro');
  assert.equal(paraCentro?.items.length, 2, 'dois itens diferentes no mesmo destino');
  assert.equal(paraCentro?.kind, 'own_store');
  assert.equal(paraCentro?.items.find((i) => i.itemId === acucar.id)?.baseUnits, 6000);

  // E o que volta é unidade-base, nunca "caixa": açúcar não tem camada de caixa,
  // e uma consulta que devolvesse "cx" teria inventado uma unidade para metade
  // das linhas.
  const total = dia.flatMap((d) => d.items).reduce((n, i) => n + i.baseUnits, 0);
  assert.equal(total, 12000);
});

test('a loss leaves the ledger, carrying the reason that makes it useful', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);
  const antes = acucar.onHandBaseUnits;

  const perdido = await recordLoss(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    baseUnits: 4000,
    reason: 'expired',
    occurredAt: '2026-09-01T10:00:00.000Z',
  });

  assert.equal(perdido.baseUnits, 4000);

  // Saiu do saldo, e a linha guarda o motivo - que é o que separa "sumiram
  // quatro quilos" de "quatro quilos venceram", e só a segunda muda uma
  // decisão.
  const depois = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === acucar.id);
  assert.equal(depois?.onHandBaseUnits, antes - 4000);

  const linha = await live.getFirstAsync<{ kind: string; q: number; reason: string }>(
    `SELECT kind, quantity_base_units AS q, loss_reason AS reason
       FROM movements WHERE kind = 'loss' AND item_id = ?`,
    [acucar.id],
  );
  assert.equal(linha?.kind, 'loss');
  assert.equal(linha?.q, -4000, 'o sinal é da função, não de quem chama');
  assert.equal(linha?.reason, 'expired');
});

test('nobody loses what they do not have', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  // Mesmo piso da produção, no mesmo lugar: antes da escrita. Uma perda maior
  // que o saldo seria um saldo negativo que ninguém conseguiria explicar - e
  // corrigir isso num livro-razão append-only custa estorno.
  await assert.rejects(
    recordLoss(LOCAL_COMPANY_ID, {
      itemId: acucar.id,
      baseUnits: acucar.onHandBaseUnits + 1,
      reason: 'melted',
    }),
    (e) => e instanceof NotEnoughStockError,
  );

  // E uma perda de nada não é uma perda.
  await assert.rejects(
    recordLoss(LOCAL_COMPANY_ID, { itemId: acucar.id, baseUnits: 0, reason: 'broken' }),
  );
});

test('an open run is state: the ledger does not know it until it closes', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const antes = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');

  const corrida = await openProductionRun(LOCAL_COMPANY_ID, { productId: product.id, batches: 1 });
  assert.equal((await openProductionRuns(LOCAL_COMPANY_ID)).length, 1);

  // Abrir não move nada: nenhuma linha nova no razão, nenhum insumo baixado.
  const depoisDeAbrir = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');
  assert.equal(depoisDeAbrir?.n, antes?.n);

  const fechada = await closeProductionRun(LOCAL_COMPANY_ID, {
    runId: corrida.id,
    unitsProduced: 480,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // Agora sim, e o id da corrida é o grupo das linhas: a corrida sai da tabela
  // e o nome dela fica no livro-razão.
  assert.equal((await openProductionRuns(LOCAL_COMPANY_ID)).length, 0);
  const linhas = await live.getAllAsync<{ n: number }>(
    'SELECT id FROM movements WHERE movement_group_id = ?',
    [fechada.groupId],
  );
  assert.ok(linhas.length >= 3, 'produção mais consumo, no mesmo grupo');
});

test('a cancelled run leaves nothing to reverse', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const antes = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');

  const corrida = await openProductionRun(LOCAL_COMPANY_ID, { productId: product.id, batches: 1 });
  await cancelProductionRun(LOCAL_COMPANY_ID, corrida.id);

  // É a razão inteira de a corrida ser estado e não movimento: cancelar não
  // precisa de estorno porque nunca houve lançamento.
  assert.equal((await openProductionRuns(LOCAL_COMPANY_ID)).length, 0);
  const depois = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');
  assert.equal(depois?.n, antes?.n);

  // E cancelar de novo não é erro: o pedido já estava cumprido.
  await cancelProductionRun(LOCAL_COMPANY_ID, corrida.id);
});

test('two taps on close do not produce twice', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const corrida = await openProductionRun(LOCAL_COMPANY_ID, { productId: product.id, batches: 1 });

  await closeProductionRun(LOCAL_COMPANY_ID, { runId: corrida.id, unitsProduced: 480, producedOn: localDate(nowIso(), 'America/Sao_Paulo') });

  // Dedo tremido na doca, ou a tela que não atualizou: a segunda tentativa não
  // acha a corrida e para ANTES de escrever, em vez de baixar o insumo duas
  // vezes.
  await assert.rejects(
    closeProductionRun(LOCAL_COMPANY_ID, { runId: corrida.id, unitsProduced: 480, producedOn: localDate(nowIso(), 'America/Sao_Paulo') }),
    (e) => e instanceof RunGoneError,
  );
});

test('a run that cannot close stays open, instead of being lost', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  // Vinte tachos contra o estoque de um exemplo: o razão recusa.
  const corrida = await openProductionRun(LOCAL_COMPANY_ID, { productId: product.id, batches: 20 });
  await assert.rejects(
    closeProductionRun(LOCAL_COMPANY_ID, { runId: corrida.id, unitsProduced: 9000, producedOn: localDate(nowIso(), 'America/Sao_Paulo') }),
    (e) => e instanceof NotEnoughStockError,
  );

  // E a corrida continua aberta: a pessoa lança a compra que chegou e fecha
  // depois. Perder o registro do tacho que rodou seria o pior dos dois mundos.
  assert.equal((await openProductionRuns(LOCAL_COMPANY_ID)).length, 1);
});

test('a store that checked and a store that did not are different facts', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Norte', kind: 'own_store' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const quando = '2026-09-01T14:00:00.000Z';
  const janela = ['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'] as const;

  const paraCentro = await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 6000, occurredAt: quando,
  });
  const paraNorte = await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: norte.id,
    baseUnits: 2000, occurredAt: quando,
  });

  assert.equal((await unchecked(LOCAL_COMPANY_ID, ...janela)).length, 2, 'nada conferido ainda');

  // A Loja Centro confere e bate. Diferença zero - a linha que o servidor
  // recusava antes da 0017, e que é a prova de que alguém abriu a caixa.
  // Sem lista: "chegou tudo", que é o caminho que a tela usa.
  const bateu = await recordCheck(LOCAL_COMPANY_ID, {
    groupId: paraCentro.groupId,
    occurredAt: quando,
  });
  assert.deepEqual(bateu.differences, [{ itemId: acucar.id, baseUnits: 0 }]);

  const faltando = await unchecked(LOCAL_COMPANY_ID, ...janela);
  assert.deepEqual(faltando, [paraNorte.groupId], 'só a Loja Norte continua sem conferir');

  // E o total da empresa não se moveu em nada disto: transferência tem duas
  // pernas que se anulam, e conferência que bateu não é movimento de
  // mercadoria. Os 50.000 g continuam existindo, agora em três lugares.
  const depois = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === acucar.id);
  assert.equal(depois?.onHandBaseUnits, 50000);
  const porLugar = await balanceByLocation(LOCAL_COMPANY_ID, acucar.id);
  assert.equal(porLugar.find((b) => b.locationId === centro.id)?.baseUnits, 6000);
  assert.equal(porLugar.find((b) => b.locationId === norte.id)?.baseUnits, 2000);
});

test('what is missing at the door leaves the store balance short, by exactly what was missing', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const remessa = await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 6000, occurredAt: '2026-09-01T14:00:00.000Z',
  });

  // Saíram 6.000 g e chegaram 5.500: faltaram 500 no caminho.
  const conferido = await recordCheck(LOCAL_COMPANY_ID, {
    groupId: remessa.groupId,
    counted: [{ itemId: acucar.id, baseUnits: 5500 }],
    occurredAt: '2026-09-01T18:00:00.000Z',
  });
  assert.deepEqual(conferido.differences, [{ itemId: acucar.id, baseUnits: -500 }]);

  // A loja fica com o que ela realmente tem, e a empresa perde os 500 - que é o
  // fato. Nada foi apagado: a remessa continua dizendo que 6.000 saíram.
  const naLoja = (await balanceByLocation(LOCAL_COMPANY_ID, acucar.id)).find(
    (b) => b.locationId === centro.id,
  );
  assert.equal(naLoja?.baseUnits, 5500);

  const daEmpresa = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === acucar.id);
  assert.equal(daEmpresa?.onHandBaseUnits, 49500, 'os 500 que sumiram no caminho sumiram do total');
});

test('a return on the same day does not quietly shrink what the store received', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const manha = '2026-09-01T11:00:00.000Z';
  const tarde = '2026-09-01T17:00:00.000Z';

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 6000,
    occurredAt: manha,
  });
  // A loja devolve parte à tarde - acontece, e é a razão de a devolução estar
  // no plano do mês.
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: centro.id,
    toLocationId: fabrica,
    baseUnits: 1000,
    occurredAt: tarde,
  });

  const dia = await shipmentsOn(
    LOCAL_COMPANY_ID,
    '2026-09-01T00:00:00.000Z',
    '2026-09-02T00:00:00.000Z',
  );

  // A loja RECEBEU 6.000 hoje. Somar as duas pernas dela daria 5.000 - e a tela
  // diria que saiu menos do que saiu, escondendo tanto a remessa quanto a
  // devolução. São dois fatos, não um saldo.
  const paraCentro = dia.find((d) => d.locationName === 'Loja Centro');
  assert.equal(paraCentro?.items[0]?.baseUnits, 6000, 'a devolução não pode abater a remessa');

  // E a devolução aparece como o que é: mil gramas que chegaram na fábrica.
  const paraFabrica = dia.find((d) => d.locationId === fabrica);
  assert.equal(paraFabrica?.items[0]?.baseUnits, 1000);
});

test('the day a run belongs to is when it happened, not when the phone told the server', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  // Uma corrida às 23h50 de segunda, sincronizada só na terça de manhã. É o
  // caso normal de uma fábrica: a câmara fria é uma caixa de metal, o sinal
  // volta quando alguém sai de lá.
  const segundaTarde = '2026-08-31T23:50:00.000Z';
  const tercaCedo = '2026-09-01T08:00:00.000Z';

  await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 400,
    occurredAt: segundaTarde,
    producedOn: localDate(segundaTarde, 'America/Sao_Paulo'),
  });
  await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    occurredAt: tercaCedo,
    producedOn: localDate(tercaCedo, 'America/Sao_Paulo'),
  });

  const segunda = await productionOn(
    LOCAL_COMPANY_ID,
    '2026-08-31T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z',
  );
  const terca = await productionOn(
    LOCAL_COMPANY_ID,
    '2026-09-01T00:00:00.000Z',
    '2026-09-02T00:00:00.000Z',
  );

  // Se a consulta filtrasse por `recorded_at` - que é agora, para as duas -
  // segunda teria zero e terça teria 900. O dado da capa da home diria que a
  // fábrica não produziu nada na segunda.
  assert.equal(segunda.find((r) => r.itemId === product.itemId)?.baseUnits, 400);
  assert.equal(terca.find((r) => r.itemId === product.itemId)?.baseUnits, 500);
});

test('a run becomes a lot, and the lot carries the day it dies', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  // Três corridas pedem mais insumo do que o exemplo semeado tem: a fábrica
  // compra antes, como compraria de verdade.
  for (const insumo of (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.kind === 'input')) {
    await recordPurchase(LOCAL_COMPANY_ID, {
      itemId: insumo.id,
      purchaseQuantity: 1,
      baseUnits: 60_000,
      totalCents: fromDecimal(300),
    });
  }

  // O prazo é do produto, respondido uma vez no cadastro.
  await saveProduct(LOCAL_COMPANY_ID, {
    id: product.id,
    itemId: product.itemId,
    name: product.name,
    kind: 'product',
    recipeId: product.recipeId,
    yieldPerUnit: product.yieldPerUnit,
    unitPackagingCents: product.unitPackagingCents,
    packaging: product.packaging,
    shelfLifeDays: 180,
  });

  const primeira = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  assert.equal(primeira.lot.code, '20260902-01');
  assert.equal(primeira.lot.expiresOn, '2027-03-01');

  // A segunda corrida do MESMO dia é a segunda, e a de outro dia recomeça.
  const segunda = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 380,
    producedOn: '2026-09-02',
  });
  assert.equal(segunda.lot.code, '20260902-02');

  const outroDia = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 200,
    producedOn: '2026-09-03',
  });
  assert.equal(outroDia.lot.code, '20260903-01');

  // A linha de PRODUÇÃO aponta para o lote; as de consumo, não. Carimbar o lote
  // do picolé na saída da polpa faria o recall recolher o saco de açúcar.
  const linhas = await live.getAllAsync<{ id: string; kind: string; lot_id: string | null }>(
    `SELECT id, kind, lot_id FROM movements WHERE movement_group_id = ?`,
    [primeira.groupId],
  );
  const producao = linhas.filter((l) => l.kind === 'production');
  const consumo = linhas.filter((l) => l.kind === 'consumption');
  assert.equal(producao.length, 1);
  assert.equal(producao[0].lot_id, primeira.lot.id);
  assert.ok(consumo.length > 0, 'a corrida consumiu insumo');
  assert.ok(
    consumo.every((l) => l.lot_id === null),
    'consumo não carrega o lote do que foi produzido',
  );

  // E o lote sobe ANTES do movimento que o cita. O servidor tem a chave
  // estrangeira que o SQLite daqui não tem: invertido, o aparelho aceitaria e o
  // servidor recusaria - defeito que só apareceria no primeiro celular offline.
  const fila = await live.getAllAsync<{ table_name: string; row_id: string }>(
    `SELECT table_name, row_id FROM outbox ORDER BY queued_at, rowid`,
  );
  const posicaoDoLote = fila.findIndex((f) => f.table_name === 'lots' && f.row_id === primeira.lot.id);
  const posicaoDaLinha = fila.findIndex(
    (f) => f.table_name === 'movements' && f.row_id === producao[0].id,
  );
  assert.ok(posicaoDoLote >= 0, 'o lote entrou na fila');
  assert.ok(posicaoDaLinha >= 0, 'a linha de produção entrou na fila');
  assert.ok(posicaoDoLote < posicaoDaLinha, 'o lote sobe antes do movimento que o cita');
});

test("the day's lots are listed by code, with what each one yielded", async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const dia = { from: '2026-09-02T03:00:00.000Z', to: '2026-09-03T03:00:00.000Z' };

  // Nada produzido: lista vazia, não uma linha zerada.
  assert.deepEqual(await lotsOn(LOCAL_COMPANY_ID, dia.from, dia.to), []);

  const manha = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
    occurredAt: '2026-09-02T13:00:00.000Z',
  });

  const lotes = await lotsOn(LOCAL_COMPANY_ID, dia.from, dia.to);
  assert.equal(lotes.length, 1);
  assert.equal(lotes[0].code, manha.lot.code);
  assert.equal(lotes[0].name, product.name);

  // A quantidade vem do MOVIMENTO, não do lote: o lote é a identidade, e quem
  // sabe quanto saiu é o livro-razão.
  assert.equal(lotes[0].baseUnits, 400);

  // E o lote de outro dia não entra na janela de hoje, mesmo existindo.
  await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 300,
    producedOn: '2026-09-03',
    occurredAt: '2026-09-03T13:00:00.000Z',
  });
  assert.equal((await lotsOn(LOCAL_COMPANY_ID, dia.from, dia.to)).length, 1);
});

test('a product with no shelf life still gets a lot, without a date', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  // Nada de prazo cadastrado: o exemplo semeado nasce assim.
  assert.equal(product.shelfLifeDays, null);

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 300,
    producedOn: '2026-09-02',
  });

  // O lote existe e rastreia; o que ele não carrega é uma data inventada, que
  // seria pior que nenhuma nos dois sentidos - descartar o que está bom, ou
  // vender o que já passou.
  assert.equal(corrida.lot.code, '20260902-01');
  assert.equal(corrida.lot.expiresOn, null);

  const gravado = await live.getFirstAsync<{ expires_on: string | null; produced_on: string }>(
    `SELECT expires_on, produced_on FROM lots WHERE id = ?`,
    [corrida.lot.id],
  );
  assert.equal(gravado?.expires_on, null);
  assert.equal(gravado?.produced_on, '2026-09-02');
});

test('a kettle is refused when the sugar is in the store, not in the factory', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);

  // Uma segunda sala, e a fábrica manda TUDO para lá. É um caminho que a tela
  // de transferência já oferece hoje.
  const { id: loja } = await savePlace(LOCAL_COMPANY_ID, {
    name: 'Loja Centro',
    kind: 'own_store',
  });
  const insumos = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.onHandBaseUnits > 0);
  assert.ok(insumos.length > 0, 'o exemplo semeado tem insumo com saldo');

  for (const insumo of insumos) {
    await recordTransfer(LOCAL_COMPANY_ID, {
      itemId: insumo.id,
      baseUnits: insumo.onHandBaseUnits,
      fromLocationId: fabrica,
      toLocationId: loja,
    });
  }

  // A empresa continua com o mesmo açúcar - ele só está em outra sala. Uma
  // guarda que soma a empresa inteira não vê diferença nenhuma aqui, e é
  // exatamente por isso que ela autorizava o tacho.
  const total = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === insumos[0].id);
  assert.equal(total?.onHandBaseUnits, insumos[0].onHandBaseUnits);

  await assert.rejects(
    () =>
      recordProduction(LOCAL_COMPANY_ID, {
        productId: product.id,
        locationId: fabrica,
        batches: 1,
        unitsProduced: 400,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  }),
    (error: unknown) => {
      assert.ok(error instanceof NotEnoughStockError);
      // E diz o nome do insumo, não o uuid: com zero naquela sala, ele não tem
      // uma linha sequer na consulta de saldo dali.
      assert.ok(
        error.missing.every((m) => !/^[0-9a-f-]{36}$/.test(m.name)),
        `a falta é dita por nome: ${error.missing.map((m) => m.name).join(', ')}`,
      );
      return true;
    },
  );

  // E o livro-razão não ficou com meia corrida: nada foi escrito.
  const depois = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === product.itemId);
  assert.equal(depois?.onHandBaseUnits ?? 0, 0);
});

test('the week the home screen draws carries the runs, and only the runs', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 400,
    occurredAt: '2026-08-31T13:00:00.000Z',
    producedOn: localDate('2026-08-31T13:00:00.000Z', 'America/Sao_Paulo'),
  });
  await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    occurredAt: '2026-09-02T14:00:00.000Z',
    producedOn: localDate('2026-09-02T14:00:00.000Z', 'America/Sao_Paulo'),
  });

  const semana = await productionBetween(
    LOCAL_COMPANY_ID,
    '2026-08-27T00:00:00.000Z',
    '2026-09-03T00:00:00.000Z',
  );

  // Duas corridas, dois fatos - e NADA além disso. Cada `recordProduction`
  // grava também as linhas de consumo, negativas, no mesmo grupo. Se a régua
  // de sete dias somasse o movimento inteiro em vez de filtrar por
  // `kind = 'production'`, a coluna do dia mostraria a produção menos os
  // insumos que ela comeu: um número que não é nem uma coisa nem outra, e que
  // fica NEGATIVO em qualquer receita que pese mais que rende.
  assert.equal(semana.length, 2);
  assert.deepEqual(
    semana.map((r) => r.baseUnits),
    [400, 500],
  );

  // Ordenada pelo que aconteceu, porque quem desenha a semana desenha da
  // esquerda para a direita.
  assert.ok(semana[0].occurredAt < semana[1].occurredAt);

  // E a janela é a mesma meio-aberta do resto: a corrida da ponta esquerda
  // entra, a do fim não.
  const cortada = await productionBetween(
    LOCAL_COMPANY_ID,
    '2026-08-31T13:00:00.000Z',
    '2026-09-02T14:00:00.000Z',
  );
  assert.equal(cortada.length, 1);
  assert.equal(cortada[0].baseUnits, 400);
});

test('a run exactly at midnight is counted once, not twice', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const meiaNoite = '2026-09-01T00:00:00.000Z';
  await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 300,
    occurredAt: meiaNoite,
    producedOn: localDate(meiaNoite, 'America/Sao_Paulo'),
  });

  const ontem = await productionOn(
    LOCAL_COMPANY_ID,
    '2026-08-31T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z',
  );
  const hoje = await productionOn(
    LOCAL_COMPANY_ID,
    '2026-09-01T00:00:00.000Z',
    '2026-09-02T00:00:00.000Z',
  );

  // A janela é meio-aberta: começa incluindo, termina excluindo. Com as duas
  // pontas fechadas, este movimento apareceria nos dois dias, e quem comparasse
  // hoje com ontem veria um número que ninguém produziu.
  assert.equal(ontem.find((r) => r.itemId === product.itemId), undefined);
  assert.equal(hoje.find((r) => r.itemId === product.itemId)?.baseUnits, 300);
});

test('what the ledger stores is whole base units, because the column is an integer', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const run = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const rows = await live.getAllAsync<{ q: number }>(
    'SELECT quantity_base_units AS q FROM movements WHERE movement_group_id = ?',
    [run.groupId],
  );

  // A sub-recipe divides: one kettle of this product asks for half a batch of
  // cream base, and half a batch is 7530.612244897959 g of sugar. SQLite's type
  // affinity takes that REAL into an INTEGER column without a word, Postgres
  // would round it, and the two sides of the same movement stop agreeing about
  // how much sugar left the storeroom. The screens showed it too: 34.938,776 g
  // on one and 34.939 g on the next, for one sack.
  assert.ok(rows.length >= 3, 'a run writes the product and its ingredients');
  for (const row of rows) {
    assert.ok(
      Number.isInteger(row.q),
      `the ledger stored ${row.q}, which is not a whole base unit`,
    );
  }

  // And the frozen rate is still the arithmetic of exactly those rows.
  assert.ok(Number.isFinite(run.unitCostRate) && run.unitCostRate > 0);
});

test('a production run writes one line per item, and freezes what each cost', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  const before = await listItems(LOCAL_COMPANY_ID);
  const run = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const lines = await live.getAllAsync<{ kind: string; item_id: string; q: number; r: number }>(
    `SELECT kind, item_id, quantity_base_units AS q, unit_cost_rate AS r
       FROM movements WHERE movement_group_id = ? ORDER BY kind`,
    [run.groupId],
  );

  // One production and one consumption per ingredient - never a single row
  // carrying a payload, because then the balance stops being a sum.
  const made = lines.filter((l) => l.kind === 'production');
  const used = lines.filter((l) => l.kind === 'consumption');
  assert.equal(made.length, 1);
  assert.ok(used.length >= 2, 'the seeded recipe has ingredients');
  assert.equal(made[0].item_id, product.itemId);
  assert.equal(made[0].q, 500);
  assert.ok(used.every((l) => l.q < 0), 'what is consumed leaves');

  // The frozen rate is the arithmetic of what actually happened: the value that
  // went in, over the units that actually came out. Not the recipe's promise.
  //
  // Plus the packaging, and that term is the whole point of this line. Seven
  // screens quote a unit's cost as recipe + packaging; if the ledger froze only
  // the recipe, every future margin would be overstated by the stick and the
  // wrapper. The number the screen promises and the number the ledger keeps are
  // one number, and this assertion is what keeps them one.
  const value = used.reduce((sum, l) => sum + Math.abs(l.q) * (l.r ?? 0), 0);
  assert.ok(product.unitPackagingCents > 0, 'the seeded product has packaging, or this proves nothing');
  assert.ok(Math.abs(run.unitCostRate - (value / 500 + product.unitPackagingCents)) < 1e-9);
  assert.ok(Math.abs((made[0].r ?? 0) - run.unitCostRate) < 1e-9);

  // And the stock moved both ways: ingredients down, product up.
  const after = await listItems(LOCAL_COMPANY_ID);
  for (const line of used) {
    const was = before.find((i) => i.id === line.item_id)?.onHandBaseUnits ?? 0;
    const now = after.find((i) => i.id === line.item_id)?.onHandBaseUnits ?? 0;
    assert.equal(now, was + line.q, 'the ingredient came down by exactly what was used');
  }
});

test('a run that yielded less freezes the higher cost, because that is what happened', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  const full = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id, locationId: where, batches: 1, unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  const short = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id, locationId: where, batches: 1, unitsProduced: 400,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // The same tub of mix over fewer popsicles is a dearer popsicle, and the
  // ledger says so. Freezing the recipe's theoretical yield instead would hide
  // the loss at the exact moment it happened - which is the number the owner
  // most needs to see.
  assert.ok(short.unitCostRate > full.unitCostRate);

  // And the two halves of the cost behave differently, which is why the ratio
  // is taken on the mix alone. Mix spreads over however many units came out, so
  // a short run makes each one dearer by exactly 500/400. A stick is a stick:
  // it costs the same whether the tub rendered 400 or 500, so it never scales.
  const pack = product.unitPackagingCents;
  assert.ok(Math.abs((short.unitCostRate - pack) / (full.unitCostRate - pack) - 500 / 400) < 1e-9);
});

test('what leaves the factory arrives at the store, and the company has the same', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(LOCAL_COMPANY_ID);

  const store = 'loja-centro';
  await live.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at) VALUES (?, ?, 'Loja Centro', 'store_room', ?)`,
    [store, LOCAL_COMPANY_ID, '2026-09-01T00:00:00Z'],
  );

  const before = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === sugar.id);
  const moved = await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store,
    baseUnits: 5000,
  });

  const places = await balanceByLocation(LOCAL_COMPANY_ID, sugar.id);
  assert.equal(places.find((p) => p.locationId === store)?.baseUnits, 5000);

  // The whole point of two legs: the sum over the company cannot notice that
  // anything happened, because nothing entered or left the business.
  const after = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === sugar.id);
  assert.equal(after?.onHandBaseUnits, before?.onHandBaseUnits);

  // Each leg says where its other half went. That is explanation, not
  // arithmetic - "how much is here" stays a plain sum with no special case.
  const legs = await live.getAllAsync<{ q: number; here: string; there: string }>(
    `SELECT quantity_base_units AS q, location_id AS here, counterpart_location_id AS there
       FROM movements WHERE movement_group_id = ? ORDER BY quantity_base_units`,
    [moved.groupId],
  );
  assert.equal(legs.length, 2);
  assert.deepEqual(
    legs.map((l) => [l.q, l.here, l.there]),
    [
      [-5000, factory, store],
      [5000, store, factory],
    ],
  );
});

test('a transfer to the same place, or of nothing, is refused rather than recorded', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const here = defaultLocationId(LOCAL_COMPANY_ID);

  // Both would append rows to a ledger that cannot be edited afterwards, and
  // neither describes anything that happened. The error is prevented.
  await assert.rejects(
    recordTransfer(LOCAL_COMPANY_ID, {
      itemId: sugar.id, fromLocationId: here, toLocationId: here, baseUnits: 100,
    }),
    /mesmo lugar/,
  );
  await assert.rejects(
    recordTransfer(LOCAL_COMPANY_ID, {
      itemId: sugar.id, fromLocationId: here, toLocationId: 'outro', baseUnits: 0,
    }),
    /move alguma coisa/,
  );
});

test('renaming a place moves no money, because no movement carries its name', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(LOCAL_COMPANY_ID);

  const store = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 6000,
  });

  const before = await stockByPlace(LOCAL_COMPANY_ID);
  await savePlace(LOCAL_COMPANY_ID, { id: store.id, name: 'Loja da Praça', kind: 'own_store' });
  const after = await stockByPlace(LOCAL_COMPANY_ID);

  const was = before.find((p) => p.locationId === store.id);
  const now = after.find((p) => p.locationId === store.id);
  assert.equal(now?.locationName, 'Loja da Praça');
  assert.equal(now?.valueCents, was?.valueCents, 'the money did not notice the new name');
  assert.deepEqual(
    now?.lines.map((l) => [l.itemId, l.baseUnits]),
    was?.lines.map((l) => [l.itemId, l.baseUnits]),
  );
});

test('the places add up to the company, in quantity and in money', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(LOCAL_COMPANY_ID);
  const store = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 6000,
  });

  const places = await stockByPlace(LOCAL_COMPANY_ID);
  const company = await listItems(LOCAL_COMPANY_ID);

  // Two screens, one arithmetic. "What is in the Centro store" and "how much
  // sugar does the company have" are the same sum read along two axes, and the
  // moment they stop agreeing one of the two is lying.
  for (const item of company.filter((i) => i.onHandBaseUnits !== 0)) {
    const spread = places
      .flatMap((p) => p.lines)
      .filter((l) => l.itemId === item.id)
      .reduce((sum, l) => sum + l.baseUnits, 0);
    assert.equal(spread, item.onHandBaseUnits, `${item.name} is in one piece across the places`);
  }

  const inStore = places.find((p) => p.locationId === store.id);
  assert.equal(inStore?.lines.length, 1, 'only the sugar ever went there');
  assert.equal(inStore?.lines[0].baseUnits, 6000);
});

test('a place that was emptied is absent, not zero', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(LOCAL_COMPANY_ID);
  const store = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });

  const there = { itemId: sugar.id, fromLocationId: factory, toLocationId: store.id, baseUnits: 6000 };
  await recordTransfer(LOCAL_COMPANY_ID, there);
  await recordTransfer(LOCAL_COMPANY_ID, {
    ...there,
    fromLocationId: store.id,
    toLocationId: factory,
  });

  // Four movements are on the ledger and none of them was deleted - the store
  // simply has nothing right now. A screen that printed "0 g" would be inviting
  // somebody to go and check a shelf that holds no sugar.
  const places = await stockByPlace(LOCAL_COMPANY_ID);
  assert.equal(places.find((p) => p.locationId === store.id), undefined);

  const ledger = await live.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM movements WHERE location_id = ? OR counterpart_location_id = ?`,
    [store.id, store.id],
  );
  assert.equal(ledger?.n, 4, 'the history of the round trip is all still there');
});

test('the guess for the next load reads what arrived, not what left', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [sugar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(LOCAL_COMPANY_ID);
  const store = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });

  // Nothing has ever gone there, and the honest answer is that there is no
  // guess. A field pre-filled with zero would be a lie dressed as helpfulness.
  assert.equal(await lastSentBaseUnits(LOCAL_COMPANY_ID, sugar.id, store.id), null);

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 6000,
    occurredAt: '2026-08-01T10:00:00Z',
  });
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 4000,
    occurredAt: '2026-08-20T10:00:00Z',
  });

  // The most recent one, and positive: a transfer writes two legs with the same
  // absolute value and opposite signs, so reading the leaving leg instead would
  // hand the screen a negative number that the button then refuses in silence.
  const guess = await lastSentBaseUnits(LOCAL_COMPANY_ID, sugar.id, store.id);
  assert.equal(guess, 4000);

  // And it is per place: another store has its own history, or none.
  const other = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Norte', kind: 'own_store' });
  assert.equal(await lastSentBaseUnits(LOCAL_COMPANY_ID, sugar.id, other.id), null);
});

test('half a kettle takes half the ingredients, so recording only what came out still moves the storeroom', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const antes = await listItems(LOCAL_COMPANY_ID);
  const cheio = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 100,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const meio = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 0.5,
    unitsProduced: 50,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // A tela sem tacho declarado manda a fração: 50 unidades de um tacho que
  // rende 100 é meio tacho, e meio tacho gasta metade da polpa. Antes disso o
  // rascunho nem existia sem tacho, e o estoque não se mexia - que é
  // exatamente a coisa que o dono viu quebrada.
  const gastoCheio = cheio.consumed.reduce((n, c) => n + c.baseUnits, 0);
  const gastoMeio = meio.consumed.reduce((n, c) => n + c.baseUnits, 0);
  assert.ok(gastoMeio > 0, 'meio tacho tem que consumir alguma coisa');
  assert.ok(
    Math.abs(gastoMeio * 2 - gastoCheio) <= meio.consumed.length,
    `meio tacho devia gastar metade: ${gastoMeio} contra ${gastoCheio}`,
  );

  // E o almoxarifado sentiu os dois.
  const depois = await listItems(LOCAL_COMPANY_ID);
  const insumo = cheio.consumed[0].itemId;
  const saldoAntes = antes.find((i) => i.id === insumo)?.onHandBaseUnits ?? 0;
  const saldoDepois = depois.find((i) => i.id === insumo)?.onHandBaseUnits ?? 0;
  assert.ok(saldoDepois < saldoAntes, 'o insumo tem que ter baixado');
});

test('what is running out comes from what actually left, and a still input never alarms', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProducts(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const de = '2026-03-01T00:00:00.000Z';
  const ate = '2026-03-08T00:00:00.000Z';

  // Nada saiu na janela: ninguém está acabando, e o cartão fica vazio. Um
  // alerta inventado aqui ensina a fábrica a ignorar o alerta de verdade.
  assert.deepEqual(await runningOut(LOCAL_COMPANY_ID, de, ate, 7), []);

  // Insumo suficiente para a semana - a trava de estoque é de verdade e
  // recusaria a terceira corrida, o que é o comportamento certo dela.
  for (const item of await listItems(LOCAL_COMPANY_ID)) {
    if (item.kind !== 'input' && item.kind !== 'packaging') continue;
    await recordPurchase(LOCAL_COMPANY_ID, {
      itemId: item.id,
      purchaseQuantity: 1,
      baseUnits: 500_000,
      totalCents: fromDecimal(1000),
      occurredAt: '2026-02-28T08:00:00.000Z',
    });
  }

  // Sete dias de consumo de verdade, e aí a conta existe.
  for (let d = 1; d <= 7; d += 1) {
    await recordProduction(LOCAL_COMPANY_ID, {
      productId: product.id,
      locationId: defaultLocationId(LOCAL_COMPANY_ID),
      batches: 1,
      unitsProduced: 100,
      occurredAt: `2026-03-0${d}T10:00:00.000Z`,
    producedOn: localDate(`2026-03-0${d}T10:00:00.000Z`, 'America/Sao_Paulo'),
  });
  }

  const apertados = await runningOut(LOCAL_COMPANY_ID, de, ate, 7, 3650);
  assert.ok(apertados.length > 0, 'sete dias de produção têm que consumir alguma coisa');

  // O horizonte corta, e corta pelo mais apertado primeiro.
  for (let i = 1; i < apertados.length; i += 1) {
    assert.ok(
      apertados[i - 1].daysLeft <= apertados[i].daysLeft,
      'o que acaba primeiro vem primeiro',
    );
  }

  // E a conta fecha: o que tem dividido pelo que sai por dia.
  const um = apertados[0];
  assert.ok(
    Math.abs(um.daysLeft - um.onHandBaseUnits / um.dailyOutflow) < 1e-9,
    'os dias são o saldo sobre a saída diária, e a tela pode abrir essa conta',
  );
});

/**
 * Pedidos: a regra que este bloco existe para segurar é uma só, e ela é a
 * fundação inteira em uma frase - pedido não é movimento. Se um dia alguém
 * "otimizar" isso gravando a demanda no livro-razão, o saldo passa a mentir no
 * instante em que um cliente liga, e nenhum outro teste deste arquivo acusa.
 */
test('an order is demand, and demand moves nothing', async () => {
  const centro = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de morango',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingCents: fromDecimal(0),
    packaging: loose,
  });

  const before = await live.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM movements`);
  const order = await saveOrder(CO, {
    placeId: centro.id,
    requestedFor: '2026-09-05',
    lines: [{ itemId, baseUnits: 300 }],
  });

  assert.equal(order.status, 'open', 'sem aprovação ligada, o pedido já nasce valendo');
  assert.equal(order.placeName, 'Loja Centro');
  assert.deepEqual(
    order.lines.map((l) => [l.name, l.baseUnits]),
    [['Picolé de morango', 300]],
  );

  const after = await live.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM movements`);
  assert.equal(
    after?.n,
    before?.n,
    'nada saiu do freezer porque alguém ligou, e o saldo tem que continuar dizendo isso',
  );

  const queued = (await pendingEntries()).map((e) => e.table);
  assert.ok(queued.includes('orders'), 'o pedido vai para a fila');
  assert.ok(queued.includes('order_lines'), 'e as linhas dele também');
});

test('what was ordered is measured against the factory shelf, not the company total', async () => {
  const centro = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de morango',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingCents: fromDecimal(0),
    packaging: loose,
  });

  // Duzentos na fábrica, cento e cinquenta mandados para a loja: a empresa tem
  // duzentos, e a fábrica tem cinquenta. Quem responde ao cliente é a fábrica.
  await recordCount(CO, { locationId: defaultLocationId(CO), itemId, countedBaseUnits: 200 });
  await recordTransfer(CO, {
    itemId,
    fromLocationId: defaultLocationId(CO),
    toLocationId: centro.id,
    baseUnits: 150,
  });

  await saveOrder(CO, {
    placeId: centro.id,
    requestedFor: '2026-09-05',
    lines: [{ itemId, baseUnits: 300 }],
  });

  const [demand] = await orderedDemand(CO, '2026-09-10');
  assert.equal(demand.requested, 300);
  assert.equal(
    demand.onHand,
    50,
    'o que já está numa loja não atende o cliente que pediu na fábrica',
  );

  // E o que está marcado para depois da janela não entra: um pedido de outubro
  // não é decisão de hoje.
  await saveOrder(CO, {
    placeId: centro.id,
    requestedFor: '2026-10-20',
    lines: [{ itemId, baseUnits: 999 }],
  });
  const [ainda] = await orderedDemand(CO, '2026-09-10');
  assert.equal(ainda.requested, 300, 'a janela é a da decisão, não a da lista inteira');

  // Entregue sai da conta: o compromisso acabou.
  const [aberto] = await listOrders(CO);
  await setOrderStatus(CO, aberto.id, 'delivered');
  const depois = await orderedDemand(CO, '2026-09-10');
  assert.equal(depois.length, 0, 'pedido entregue não é mais demanda');
});

test('approval is the company’s choice, and it decides where an order is born', async () => {
  const centro = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de morango',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingCents: fromDecimal(0),
    packaging: loose,
  });

  assert.equal(await ordersNeedApproval(), false, 'a fábrica de seis pessoas entrega antes');

  await setOrdersNeedApproval(true);
  const pedido = await saveOrder(CO, {
    placeId: centro.id,
    requestedFor: null,
    lines: [{ itemId, baseUnits: 40 }],
  });
  assert.equal(pedido.status, 'pending');

  // E pendente já conta como compromisso: quem espera aprovação para começar a
  // produzir descobre na sexta que devia ter começado na quarta.
  const [demand] = await orderedDemand(CO, '2026-09-10');
  assert.equal(demand.requested, 40);

  await setOrderStatus(CO, pedido.id, 'open');
  const [aprovado] = await listOrders(CO, ['open']);
  assert.equal(aprovado.id, pedido.id);
});
