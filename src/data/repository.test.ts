import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { fromDecimal, rate } from '@/domain/money';
import { costRecipe } from '@/domain/recipe';
import { __setDb, migrate, migrationSteps, type Db, type SqlParam } from './db';
import {
  balanceByLocation,
  recordProduction,
  recordTransfer,
  countForErase,
  eraseArea,
  itemCosts,
  labels,
  listItems,
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
  });
  const short = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id, locationId: where, batches: 1, unitsProduced: 400,
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
