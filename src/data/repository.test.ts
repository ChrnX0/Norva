import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { fromDecimal, rate, amountOf, type Rate} from '@/domain/money';
import { dayWindow, localDate } from '@/domain/day';
import { costRecipe } from '@/domain/recipe';
import type { ReturnReason } from '@/domain/ledger';
import { __setDb, db, migrate, migrationSteps, nowIso, type Db, type SqlParam } from './db';
import {
  balanceByLocation,
  findLot,
  lotsInRoomAt,
  pickingFor,
  lastSentBaseUnits,
  listPeople,
  setNamesWhoRecorded,
  namesWhoRecorded,
  setFloorSignIn,
  floorSignIn,
  ledgerExtract,
  setCurrentOperator,
  currentOperatorId,
  currentCapabilities,
  matchPin,
  listProfiles,
  salePricesFor,
  savePerson,
  saveSalePrice,
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
  savePlace,
  listPlaces,
  recentRuns,
  expiringSoon,
  recordReading,
  lastReadings,
  readingsBetween,
  stockByPlace,
  recordTransfer,
  recordReturn,
  storeMirror,
  planReversal,
  lossesOn,
  reverseGroup,
  CannotReverseError,
  countForErase,
  eraseArea,
  averageRatesForLedger,
  itemCosts,
  itemHistory,
  listProducts,
  labels,
  listItems,
  lotsOn,
  listProductsForLedger,
  findItem,
  itemMovements,
  listRecipes,
  loadRecipeGraph,
  recentCostChanges,
  recordCount,
  lastCostMove,
  dailyOutflowOf,
  recordPurchase,
  saveItem,
  saveProduct,
  saveRecipeVersion,
  purchaseToBaseUnits,
  defaultLocationId,
  saveOrder,
  listOrders,
  setOrderStatus,
  stockAgainstOrders,
  ordersNeedApproval,
  setOrdersNeedApproval,
} from './repository';
import { EraseBlockedError } from './erase';
import { markSent, pendingCount, pendingEntries, forgetSentBefore } from './outbox';
import { serialize } from '../sync/serialize';
import { ensureStarterData, exampleStillHere, hasSeeded, LOCAL_COMPANY_ID } from './seed';

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

/** O custo médio do item, lido do cache que a recomposição escreve. */
async function custoDe(itemId: string): Promise<number> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [itemId],
  );
  return row?.average_rate ?? 0;
}

/**
 * A nota digitada errada, desfeita — quantidade E dinheiro.
 *
 * A primeira fundação do projeto diz que se corrige por estorno, nunca por
 * exclusão, e três dos sete caminhos de escrita não gravavam grupo nenhum: a
 * compra, a contagem e a perda. Sem grupo, `planReversal` não acha o ato, e o
 * que não é achado não é desfeito — **a nota com dez sacos onde era um ficava no
 * razão para sempre**, com a média envenenada embaixo de todo número de dinheiro
 * do aplicativo.
 */
test('an invoice typed wrong can be undone, and takes the average back with it', async () => {
  const acucar = await anInput('Açúcar cristal', 25_000);

  // A nota certa: quatro sacos de 25 kg por R$ 472.
  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });
  const custoCerto = await custoDe(acucar);
  // Centavo por grama: R$ 472 são 47.200 centavos em 100.000 g.
  assert.ok(Math.abs(custoCerto - 0.472) < 1e-9, 'R$ 4,72 o quilo');

  // E a errada, digitada por cima: dez sacos pelo preço de dez, quando chegou um.
  const errada = await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 10,
    baseUnits: 250_000,
    totalCents: fromDecimal(2360),
  });
  assert.ok(errada.newRate > 0);

  const lancamentos = await itemMovements(CO, acucar);
  const nota = lancamentos.find((m) => m.kind === 'purchase');
  assert.ok(nota?.groupId, 'a compra tem de carregar o ato de que faz parte');
  assert.equal(nota.reversed, false);

  // O grupo é a NOTA, não a linha: os dois ids diferem, e é isso que faz uma nota
  // de duas linhas voltar inteira.
  assert.notEqual(nota.groupId, nota.id, 'o grupo da compra é a nota, não a linha');

  const daNota = nota.groupId;
  await reverseGroup(CO, { groupId: daNota });

  const depois = (await listItems(CO)).find((i) => i.id === acucar);
  assert.equal(depois?.onHandBaseUnits, 100_000, 'a quantidade da nota errada voltou');
  assert.ok(
    Math.abs((await custoDe(acucar)) - custoCerto) < 1e-9,
    'e o custo médio voltou ao que era antes dela — quantidade sem dinheiro é maquiagem',
  );

  // E não se desfaz duas vezes.
  const denovo = (await itemMovements(CO, acucar)).find((m) => m.id === nota.id);
  assert.equal(denovo?.reversed, true, 'a linha passa a dizer que já foi corrigida');
  await assert.rejects(
    () => reverseGroup(CO, { groupId: daNota }),
    (e: unknown) => e instanceof CannotReverseError,
  );
});

/**
 * A contagem e a perda, desfeitas pelo mesmo caminho.
 *
 * As duas são atos de uma perna só, e o grupo delas é a própria linha. Sem ele o
 * zero digitado com o dedo torto e a perda de 40 onde era 4 ficavam no razão para
 * sempre — a segunda descontando trinta e seis quilos de dinheiro que não sumiram.
 */
test('a count and a loss can each be undone, and the balance comes back', async () => {
  const polpa = await anInput('Polpa de morango', 10_000);
  await recordPurchase(CO, {
    itemId: polpa,
    purchaseQuantity: 4,
    baseUnits: 40_000,
    totalCents: fromDecimal(496),
  });

  // A contagem errada: alguém digitou 4.000 onde eram 40.000.
  await recordCount(CO, {
    locationId: defaultLocationId(CO),
    itemId: polpa,
    countedBaseUnits: 4_000,
  });
  assert.equal((await listItems(CO)).find((i) => i.id === polpa)?.onHandBaseUnits, 4_000);

  const contagem = (await itemMovements(CO, polpa)).find((m) => m.kind === 'adjustment');
  assert.ok(contagem?.groupId, 'a contagem tem de ter por onde ser desfeita');
  assert.equal(contagem.groupId, contagem.id, 'ato de uma perna: o grupo é a própria linha');

  await reverseGroup(CO, { groupId: contagem.groupId });
  assert.equal(
    (await listItems(CO)).find((i) => i.id === polpa)?.onHandBaseUnits,
    40_000,
    'o saldo voltou ao que era antes da contagem errada',
  );

  // A perda errada: 40.000 g onde eram 4.000.
  await recordLoss(CO, { itemId: polpa, baseUnits: 40_000, reason: 'expired' });
  assert.equal((await listItems(CO)).find((i) => i.id === polpa)?.onHandBaseUnits, 0);

  const perda = (await itemMovements(CO, polpa)).find((m) => m.kind === 'loss');
  assert.ok(perda?.groupId);
  await reverseGroup(CO, { groupId: perda.groupId });
  assert.equal(
    (await listItems(CO)).find((i) => i.id === polpa)?.onHandBaseUnits,
    40_000,
    'a perda desfeita devolve o que ela tirou',
  );

  // E o relatório de perdas para de contar a perda desfeita, porque o que foi
  // estornado não aconteceu.
  const perdas = await lossesOn(CO, '2000-01-01T00:00:00.000Z', '2100-01-01T00:00:00.000Z');
  assert.deepEqual(perdas, [], 'perda desfeita não aparece no relatório');
});

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
  assert.ok(Math.abs((item.averageRate ?? 0) - 0.531) < 1e-9);
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

  const costs = await averageRatesForLedger(CO);
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
    await averageRatesForLedger(CO),
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

  const products = await listProductsForLedger(CO);
  assert.equal(products[0].name, 'Picolé de morango');
  assert.ok(products[0].recipeId, 'the product knows its recipe');

  // Enquanto o exemplo está aqui, as duas perguntas respondem a mesma coisa.
  assert.equal(await exampleStillHere(CO), true);

  await eraseArea(CO, 'all');
  assert.deepEqual(await listItems(CO), []);

  // The mark is what stops the demo reappearing tomorrow morning.
  await ensureStarterData(CO);
  assert.deepEqual(await listItems(CO), [], 'the example must stay gone');

  // E aqui as duas se separam, que é o ponto: a marca é PERMANENTE — `app_meta`
  // não é tabela apagável — e a presença não. A tela de Ajustes acendia "inclui
  // os dados de exemplo" pela marca, então dizia isso para sempre, em todo
  // aparelho, inclusive depois de apagar tudo e cadastrar o primeiro insumo
  // próprio: contava uma variável e nomeava outra.
  assert.equal(await hasSeeded(), true, 'a marca é o que impede o exemplo de voltar');
  assert.equal(await exampleStillHere(CO), false, 'e ela não é a presença do exemplo');
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

/**
 * A fila não fica apontando para o que a pessoa acabou de apagar.
 *
 * Órfã na fila não é recusa do servidor: o serializador levanta *"Queued
 * movements X but the row is gone from the device"*, e o motor para a fila no
 * primeiro buraco de propósito — então tudo o que a fábrica gravar depois fica
 * preso atrás dela. Apagar as compras de exemplo é o caso normal, descrito no
 * próprio código, e era ele que plantava a órfã.
 *
 * As duas metades importam igual: a órfã vai embora, e o que NÃO foi apagado
 * fica. Uma varredura que levasse a linha viva junto seria uma escrita que nunca
 * chega, em silêncio, que é o pior resultado disponível.
 */
test('erasing an area forgets what the queue was going to send about it', async () => {
  await ensureStarterData(CO);

  const antes = await pendingEntries(500);
  const doItem = antes.filter((e) => e.table === 'items').length;
  assert.ok(doItem > 0, 'o exemplo enfileira itens');
  assert.ok(
    antes.some((e) => e.table === 'movements'),
    'e enfileira os movimentos das compras dele',
  );

  await eraseArea(CO, 'purchases');

  const depois = await pendingEntries(500);
  for (const table of ['movements', 'purchases', 'purchase_lines']) {
    assert.equal(
      depois.filter((e) => e.table === table).length,
      0,
      `a fila continua apontando para ${table} que não existe mais`,
    );
  }

  // O que a área não apagou continua na fila, inteiro. Os itens seguem lá.
  assert.equal(
    depois.filter((e) => e.table === 'items').length,
    doItem,
    'a varredura levou uma escrita viva junto',
  );

  // E o comando de apagar viaja, que é como o servidor fica sabendo.
  assert.ok(
    depois.some((e) => e.table === 'erase' && e.rowId === 'purchases'),
    'o servidor precisa ouvir a decisão, não só o silêncio',
  );
});

test('erasing one area leaves the others standing', async () => {
  await ensureStarterData(CO);

  await eraseArea(CO, 'products');

  assert.deepEqual(await listProductsForLedger(CO), []);
  assert.equal((await listRecipes(CO)).length, 2, 'the recipes are still there');
  assert.equal((await listItems(CO)).length, 6, 'so are the inputs');
});

test('erasing invoices drops the average with them', async () => {
  await ensureStarterData(CO);

  const before = await averageRatesForLedger(CO);
  assert.ok(Object.values(before).some((r) => r > 0), 'the example arrives with costs');

  const held = await listItems(CO);
  assert.ok(held.some((i) => i.onHandBaseUnits > 0), 'and it arrives with stock');

  await eraseArea(CO, 'purchases');

  assert.deepEqual(await averageRatesForLedger(CO), {}, 'no invoice, no average');

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
    unitPackagingRate: rate(0.05, 1),
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }, { id: 'box', perBaseUnit: 50 }] },
  });

  assert.ok(productId && itemId);

  const [product] = await listProductsForLedger(CO);
  assert.equal(product.name, 'Picolé de teste');
  assert.equal(product.unitPackagingRate, 5);
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

  // A unidade de uso vem junto, e é ela que faltava — o título deste teste já
  // dizia "in the units each item has" e nada aqui conferia a unidade.
  //
  // A embalagem sozinha não resolve: item sem camada de caixa tem só a faixa
  // `unit`, e mandá-la para `formatPacked` fazia a capa chamar seis quilos de
  // açúcar de "6.000 unidades", enquanto a aba de transporte imprimia "6.000"
  // sem unidade nenhuma. Fato, não frase: a palavra continua sendo da tela.
  const acucarNoCentro = paraCentro?.items.find((i) => i.itemId === acucar.id);
  assert.equal(acucarNoCentro?.baseUnits, 6000);
  assert.equal(acucarNoCentro?.baseUnit, 'g', 'seis mil GRAMAS, e não seis mil açúcares');
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

test('the lot says which sheet ran, and correcting the sheet later does not rewrite it', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  // A versão que estava valendo no dia da corrida.
  const antes = (await loadRecipeGraph(LOCAL_COMPANY_ID))[product.recipeId!];
  assert.equal(antes.version, 1);

  const feito = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  const lote = await findLot(LOCAL_COMPANY_ID, feito.lot.id);
  assert.equal(lote?.recipeVersion, 1, 'o lote carimba a versão que rodou');
  assert.equal(lote?.recipeName, 'Picolé de morango');

  // Agora a fórmula é corrigida: nasce a versão 2, e ela passa a ser a que a
  // fábrica usa daqui em diante.
  const corrigida = await saveRecipeVersion(LOCAL_COMPANY_ID, {
    recipeId: product.recipeId!,
    name: 'Picolé de morango',
    yieldAmount: antes.yieldAmount,
    yieldUnit: antes.yieldUnit,
    lossFraction: antes.lossFraction,
    lines: antes.lines,
    note: 'menos açúcar',
  });
  assert.equal(corrigida.version, 2);

  // E o lote de ontem continua dizendo 1. É esta linha que separa um livro-razão
  // de uma planilha: sem o carimbo, a correção de hoje reescreveria de que
  // fórmula saiu o que foi produzido em setembro — e o custo histórico e o
  // recall passariam a apontar para a receita de agora.
  const depois = await findLot(LOCAL_COMPANY_ID, feito.lot.id);
  assert.equal(depois?.recipeVersion, 1, 'a ficha de ontem não vira a de hoje');

  // E a corrida aberta grava a VERSÃO na coluna da versão, que é o que ela diz
  // guardar: aqui entrava o id da RECEITA, um uuid legítimo na coluna errada.
  const corrida = await openProductionRun(LOCAL_COMPANY_ID, { productId: product.id, batches: 1 });
  assert.notEqual(corrida.recipeVersionId, product.recipeId, 'não é o id da receita');
  const agora = (await loadRecipeGraph(LOCAL_COMPANY_ID))[product.recipeId!];
  assert.equal(corrida.recipeVersionId, agora.versionId, 'é o id da versão que está valendo');

  // E o que foi GRAVADO, lido de volta — não o que a função devolveu.
  //
  // **Esta é a diferença que deixou a mutação passar.** O teste acima confere o
  // objeto de retorno, que é montado à parte; a mutação trocava o parâmetro do
  // INSERT por \`product.recipeId\` e o retorno continuava certo. Um uuid legítimo
  // na coluna errada, invisível até o dia em que alguém perguntasse qual ficha
  // rodou — que é literalmente o defeito que esta linha existe para impedir.
  const gravada = (await openProductionRuns(LOCAL_COMPANY_ID)).find((r) => r.id === corrida.id);
  assert.ok(gravada, 'a corrida aberta tem que ser encontrável de volta');
  assert.equal(
    gravada.recipeVersionId,
    agora.versionId,
    'a coluna recipe_version_id guarda a VERSÃO; o id da receita ali é a fórmula de hoje respondendo pela de ontem',
  );
  assert.notEqual(gravada.recipeVersionId, product.recipeId);
});

test('an open run is state: the ledger does not know it until it closes', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: norte.id,
    baseUnits: 2000, occurredAt: quando,
  });

  /**
   * A pergunta "quem ainda não conferiu" é lida por `shipmentsOn`, que é o que a
   * aba de Transporte usa.
   *
   * Ela era lida aqui por `unchecked`, uma segunda consulta com a MESMA regra —
   * mesmo `NAO_ESTORNADO`, mesmo `EXISTS post = 'checked'` — e sem nenhuma tela.
   * Duas grafias de uma regra é como duas verdades nascem, e esta nunca chegou a
   * divergir só porque ninguém a chamava. O teste passou a exercitar o caminho que
   * a fábrica percorre.
   */
  const semConferir = async () =>
    (await shipmentsOn(LOCAL_COMPANY_ID, ...janela)).filter((p) => !p.checked);
  assert.equal((await semConferir()).length, 2, 'nada conferido ainda');

  // A Loja Centro confere e bate. Diferença zero - a linha que o servidor
  // recusava antes da 0017, e que é a prova de que alguém abriu a caixa.
  // Sem lista: "chegou tudo", que é o caminho que a tela usa.
  const bateu = await recordCheck(LOCAL_COMPANY_ID, {
    groupId: paraCentro.groupId,
    occurredAt: quando,
  });
  assert.deepEqual(bateu.differences, [{ itemId: acucar.id, baseUnits: 0 }]);

  const faltando = await semConferir();
  assert.deepEqual(
    faltando.map((p) => p.locationName),
    ['Loja Norte'],
    'só a Loja Norte continua sem conferir',
  );

  // E o total da empresa não se moveu em nada disto: transferência tem duas
  // pernas que se anulam, e conferência que bateu não é movimento de
  // mercadoria. Os 50.000 g continuam existindo, agora em três lugares.
  const depois = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === acucar.id);
  assert.equal(depois?.onHandBaseUnits, 50000);
  const porLugar = await balanceByLocation(LOCAL_COMPANY_ID, acucar.id);
  assert.equal(porLugar.find((b) => b.locationId === centro.id)?.baseUnits, 6000);
  assert.equal(porLugar.find((b) => b.locationId === norte.id)?.baseUnits, 2000);
});

/**
 * O número que a tela mostra e o número contra o qual a contagem é comparada.
 *
 * `recordCount` sempre foi certa e o docblock dela já dizia por quê: ela exige o
 * local sem padrão porque comparar a prateleira de uma sala com o saldo da
 * empresa teleporta estoque. Quem violava isso era a TELA, que mostrava
 * `findItem` sem sala (o total da empresa) e gravava no almoxarifado. Com 44.000
 * na fábrica e 6.000 na câmara, alguém que contasse a câmara e digitasse 6.000
 * gravava −38.000 CONTRA A FÁBRICA: 38 quilos apagados de uma prateleira que
 * ninguém tinha olhado.
 *
 * Este teste prende as duas pontas: `findItem` com sala responde pela sala, e é
 * exatamente o número que `recordCount` daquela sala espera. A guarda de fonte em
 * `src/layers.test.ts` cobre a outra metade — que a tela passe a sala.
 */
test('the shelf a screen shows is the shelf a count is compared against', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const camara = await savePlace(LOCAL_COMPANY_ID, { name: 'Câmara fria', kind: 'cold_room' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: camara.id,
    baseUnits: 6000,
    occurredAt: '2026-09-02T10:00:00.000Z',
  });

  // Três perguntas diferentes, três respostas diferentes - e é a diferença entre
  // elas que a tela precisava saber que existe.
  assert.equal((await findItem(LOCAL_COMPANY_ID, acucar.id))?.onHandBaseUnits, 50000);
  assert.equal((await findItem(LOCAL_COMPANY_ID, acucar.id, fabrica))?.onHandBaseUnits, 44000);
  const naCamara = await findItem(LOCAL_COMPANY_ID, acucar.id, camara.id);
  assert.equal(naCamara?.onHandBaseUnits, 6000);

  // Contando exatamente o que a tela da câmara mostrou, a diferença é zero.
  // Sob o defeito a tela mostrava 50.000 e a pessoa que contasse a câmara
  // digitaria 6.000 - e o sistema chamaria isso de falta de 44.000.
  const bateu = await recordCount(LOCAL_COMPANY_ID, {
    locationId: camara.id,
    itemId: acucar.id,
    countedBaseUnits: naCamara?.onHandBaseUnits ?? 0,
  });
  assert.equal(bateu.expectedBaseUnits, 6000, 'o esperado é o da sala, não o da empresa');
  assert.equal(bateu.deltaBaseUnits, 0);
  assert.equal((await findItem(LOCAL_COMPANY_ID, acucar.id, fabrica))?.onHandBaseUnits, 44000);

  // E a câmara conferida não faz a fábrica parecer conferida. "Conferido em 2/9"
  // ao lado do saldo da fábrica seria dizer que alguém olhou uma prateleira que
  // ninguém olhou.
  const daCamara = await itemMovements(LOCAL_COMPANY_ID, acucar.id, 20, camara.id);
  assert.ok(
    daCamara.some((m) => m.kind === 'adjustment'),
    'a conferência da câmara aparece na câmara',
  );
  const daFabrica = await itemMovements(LOCAL_COMPANY_ID, acucar.id, 20, fabrica);
  assert.ok(
    !daFabrica.some((m) => m.kind === 'adjustment'),
    'e não aparece na fábrica, que ninguém conferiu',
  );
  // Sem sala continua sendo a lista da empresa, que é o que as outras telas leem.
  assert.ok((await itemMovements(LOCAL_COMPANY_ID, acucar.id)).some((m) => m.kind === 'adjustment'));
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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
    unitPackagingRate: product.unitPackagingRate,
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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

test('a lot opens by its own id, and a lot that is gone says so', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 480,
    producedOn: '2026-09-02',
  });

  const lote = await findLot(LOCAL_COMPANY_ID, corrida.lot.id);
  assert.equal(lote?.code, corrida.lot.code);
  assert.equal(lote?.name, product.name);
  assert.equal(lote?.baseUnits, 480);
  assert.equal(lote?.producedOn, '2026-09-02');

  // Etiqueta se abre por link, e link envelhece: alguém guarda o endereço, o
  // dado é apagado, e a tela precisa saber dizer isso em vez de quebrar.
  assert.equal(await findLot(LOCAL_COMPANY_ID, 'lote-que-nao-existe'), null);

  // E o lote de outra empresa não vaza por id adivinhado.
  assert.equal(await findLot('outra-empresa', corrida.lot.id), null);

  // O CÓDIGO impresso abre o mesmo lote que o id.
  //
  // É ele que o QR carrega e é ele que alguém digita quando a etiqueta congela e
  // descasca - a própria tela promete isso por escrito. A consulta só conhecia o
  // id, então o código era um endereço que não levava a lugar nenhum: caixa
  // bipada, onze caracteres digitados, e nada abria.
  const pelaEtiqueta = await findLot(LOCAL_COMPANY_ID, corrida.lot.code);
  assert.equal(pelaEtiqueta?.id, corrida.lot.id, 'o código impresso abre o lote');
  assert.equal(pelaEtiqueta?.baseUnits, 480);

  // E o código de outra empresa continua sem vazar: a régua é a empresa, não o
  // formato. Duas fábricas podem ter o mesmo `20260902-01` no mesmo dia.
  assert.equal(await findLot('outra-empresa', corrida.lot.code), null);
});

test('a product with no shelf life still gets a lot, without a date', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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

test('the storeroom answers for one room when asked, and for the company when not', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const { id: fria } = await savePlace(LOCAL_COMPANY_ID, {
    name: 'Câmara fria',
    kind: 'cold_room',
  });

  const [insumo] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.onHandBaseUnits > 0);
  const total = insumo.onHandBaseUnits;
  const metade = Math.floor(total / 2);

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: insumo.id,
    baseUnits: metade,
    fromLocationId: fabrica,
    toLocationId: fria,
  });

  // Sem sala, a resposta é a empresa inteira - e ela não mudou, porque
  // transferir não cria nem destrói nada.
  const empresa = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === insumo.id);
  assert.equal(empresa?.onHandBaseUnits, total);

  // Com sala, a resposta é daquela sala. Era isto que faltava: com a polpa
  // dividida, o almoxarifado dizia 34 kg enquanto quem estava no tacho tinha 20
  // na mão. O número não estava errado - estava respondendo outra pergunta.
  const naFabrica = (await listItems(LOCAL_COMPANY_ID, undefined, false, fabrica)).find(
    (i) => i.id === insumo.id,
  );
  const naFria = (await listItems(LOCAL_COMPANY_ID, undefined, false, fria)).find(
    (i) => i.id === insumo.id,
  );
  assert.equal(naFria?.onHandBaseUnits, metade);
  assert.equal(naFabrica?.onHandBaseUnits, total - metade);

  // E as duas salas somam a empresa: se não somassem, uma das três contas
  // estaria mentindo.
  assert.equal((naFabrica?.onHandBaseUnits ?? 0) + (naFria?.onHandBaseUnits ?? 0), total);
});

test('the room says what was inside it AT THE READING, not what is inside now', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const { id: camara } = await savePlace(LOCAL_COMPANY_ID, {
    name: 'Câmara fria',
    kind: 'cold_room',
  });
  const [produto] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  // Duas corridas na fábrica — é lá que estão os insumos, e o piso da produção é
  // o da sala em que o tacho está — e os dois lotes vão para a câmara de manhã.
  const manha = await recordProduction(LOCAL_COMPANY_ID, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
    occurredAt: '2026-09-02T05:30:00.000Z',
  });
  const tambem = await recordProduction(LOCAL_COMPANY_ID, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 200,
    producedOn: '2026-09-02',
    occurredAt: '2026-09-02T05:45:00.000Z',
  });

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: produto.itemId,
    fromLocationId: fabrica,
    toLocationId: camara,
    baseUnits: 400,
    lotId: manha.lot.id,
    occurredAt: '2026-09-02T06:00:00.000Z',
  });
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: produto.itemId,
    fromLocationId: fabrica,
    toLocationId: camara,
    baseUnits: 200,
    lotId: tambem.lot.id,
    occurredAt: '2026-09-02T06:30:00.000Z',
  });

  // A leitura ruim é das 07:20 — os dois lotes estavam lá.
  const naLeitura = await lotsInRoomAt(LOCAL_COMPANY_ID, camara, '2026-09-02T07:20:00.000Z');
  assert.equal(naLeitura.length, 2, 'os dois lotes estavam na câmara quando a leitura foi tomada');
  assert.deepEqual(
    naLeitura.map((l) => l.code).sort(),
    [manha.lot.code, tambem.lot.code].sort(),
  );
  assert.equal(naLeitura[0].name, 'Picolé de morango', 'o código sozinho não manda ninguém a lugar nenhum');

  // Ao meio-dia um deles sai para a loja.
  const { id: loja } = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: produto.itemId,
    fromLocationId: camara,
    toLocationId: loja,
    baseUnits: 400,
    lotId: manha.lot.id,
    occurredAt: '2026-09-02T12:00:00.000Z',
  });

  // E aqui está a diferença inteira entre a pergunta certa e o saldo de agora:
  // quem abre a tela às 15:00 vê UM lote na câmara, e o que ficou exposto às
  // 07:20 foram DOIS. Sem o corte no tempo, o recall perderia justamente o lote
  // que já viajou — que é o que mais importa achar.
  const agora = await lotsInRoomAt(LOCAL_COMPANY_ID, camara, '2026-09-02T15:00:00.000Z');
  assert.equal(agora.length, 1, 'o que saiu ao meio-dia não está mais lá');
  assert.equal(agora[0].code, tambem.lot.code);

  const aindaNaLeitura = await lotsInRoomAt(LOCAL_COMPANY_ID, camara, '2026-09-02T07:20:00.000Z');
  assert.equal(aindaNaLeitura.length, 2, 'e a resposta das 07:20 não muda por causa do que veio depois');
});

test('the picking list says what the store ordered and what the room has', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const { id: loja } = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const [produto] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  await recordProduction(LOCAL_COMPANY_ID, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  await saveOrder(LOCAL_COMPANY_ID, {
    placeId: loja,
    requestedFor: '2026-09-04',
    lines: [{ itemId: produto.itemId, baseUnits: 300 }],
  });
  await saveOrder(LOCAL_COMPANY_ID, {
    placeId: loja,
    requestedFor: '2026-09-05',
    lines: [{ itemId: produto.itemId, baseUnits: 120 }],
  });

  // A janela do dia de quem carrega. Larga aqui de propósito: o que ela recorta
  // é medido logo abaixo, com uma janela que não alcança a carga.
  const DIA = ['2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z'] as const;

  const lista = await pickingFor(LOCAL_COMPANY_ID, loja, fabrica, '2026-09-10', ...DIA);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].ordered, 420, 'os dois pedidos da loja somam');
  assert.equal(lista[0].available, 400, 'e o disponível é o da SALA de onde a carga sai');
  assert.equal(lista[0].sentToday, 0, 'antes da primeira viagem nada foi hoje');

  // A data é a do pedido mais urgente: é ela que decide o que separar primeiro.
  assert.equal(lista[0].dueOn, '2026-09-04');

  // E QUANTOS pedidos entraram na soma, que é o que a frase da tela precisa para
  // não mentir. Ela dizia "pedido para 04/09: 420 un" — singular, com a data do
  // primeiro e a quantidade dos dois. Somar e rotular no singular é a única
  // combinação que mente, e a contagem é fato.
  assert.equal(lista[0].orders, 2, 'a soma diz de quantos pedidos ela é');

  // A primeira viagem sai, e é PARCIAL: 100 de 420. O pedido continua aberto.
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: produto.itemId,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: 100,
    occurredAt: '2026-09-02T14:00:00.000Z',
  });

  const segunda = await pickingFor(LOCAL_COMPANY_ID, loja, fabrica, '2026-09-10', ...DIA);
  assert.equal(segunda[0].ordered, 420, 'o pedido não encolhe: ele continua sendo de 420');
  assert.equal(segunda[0].sentToday, 100, 'e o que já chegou lá hoje é fato ao lado dele');

  // A devolução volta a abrir espaço: 100 que foram e 40 que voltaram são 60
  // recebidos. Contar só a transferência diria que a loja tem o que ela devolveu.
  await recordReturn(LOCAL_COMPANY_ID, {
    itemId: produto.itemId,
    fromLocationId: loja,
    toLocationId: fabrica,
    baseUnits: 40,
    occurredAt: '2026-09-02T16:00:00.000Z',
    returnReason: 'unsold',
  });
  const depoisDaVolta = await pickingFor(LOCAL_COMPANY_ID, loja, fabrica, '2026-09-10', ...DIA);
  assert.equal(depoisDaVolta[0].sentToday, 60, 'o que voltou desconta do que chegou');

  // E a janela recorta mesmo: no dia anterior, nada tinha ido.
  const ontem = await pickingFor(
    LOCAL_COMPANY_ID,
    loja,
    fabrica,
    '2026-09-10',
    '2026-09-01T00:00:00.000Z',
    '2026-09-02T00:00:00.000Z',
  );
  assert.equal(ontem[0].sentToday, 0, 'a carga de hoje não conta contra o pedido de ontem');

  // Pedido de outra loja não entra nesta lista - separar é por destino.
  const outra = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Norte', kind: 'own_store' });
  assert.deepEqual(
    await pickingFor(LOCAL_COMPANY_ID, outra.id, fabrica, '2026-09-10', ...DIA),
    [],
  );

  // E o que ainda não chegou na janela também não: separar é para hoje, não
  // para o mês.
  assert.deepEqual(await pickingFor(LOCAL_COMPANY_ID, loja, fabrica, '2026-09-03', ...DIA), []);
});

test('a return is a return, not a transfer running backwards', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const { id: loja } = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const [acucar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.onHandBaseUnits >= 6000);

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: 6000,
  });
  await recordReturn(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: loja,
    toLocationId: fabrica,
    baseUnits: 1000,
    returnReason: 'unsold',
  });

  // E o MOTIVO desceu junto, nas duas pernas.
  //
  // Sem ele o razão grava aritmética sem notícia: "a loja não vendeu" fica
  // idêntico a "a carga chegou derretida", e as duas mandam fazer coisas
  // opostas. A perna que entra na fábrica é a que um relatório de devolução vai
  // ler, então é nela que a ausência doeria.
  const pernas = await (
    await db()
  ).getAllAsync<{ return_reason: string | null; quantity_base_units: number }>(
    `SELECT return_reason, quantity_base_units FROM movements WHERE kind = 'return' ORDER BY quantity_base_units`,
  );
  assert.equal(pernas.length, 2, 'a devolução tem duas pernas');
  assert.deepEqual(
    pernas.map((l) => l.return_reason),
    ['unsold', 'unsold'],
    'as duas pernas dizem por que voltou',
  );

  // E a regra IMPEDE em vez de reclamar: sem motivo não escreve, e motivo fora
  // da devolução também não. A segunda metade é a que costuma faltar — uma
  // transferência com motivo de devolução é dado errado com cara de dado certo,
  // e o servidor a recusa (`movements_return_says_why`).
  await assert.rejects(
    () =>
      recordTransfer(LOCAL_COMPANY_ID, {
        itemId: acucar.id,
        fromLocationId: fabrica,
        toLocationId: loja,
        baseUnits: 10,
        returnReason: 'unsold',
      }),
    /motivo de devolução/,
    'transferência não aceita motivo de devolução',
  );

  // A aritmética é a mesma de sempre: a loja fica com 5.000 e a empresa não
  // muda, porque nada foi criado nem destruído.
  const naLoja = await balanceByLocation(LOCAL_COMPANY_ID, acucar.id);
  assert.equal(naLoja.find((b) => b.locationId === loja)?.baseUnits, 5000);

  // O que muda é o FATO. Sem tipo próprio, "mandei 6.000 e voltaram 1.000" e
  // "mandei 5.000" ficariam idênticos no livro-razão - e a diferença entre os
  // dois é a única coisa que interessa a quem quer saber se aquele sabor vende
  // naquela loja.
  const tipos = await live.getAllAsync<{ kind: string; n: number }>(
    `SELECT kind, COUNT(*) AS n FROM movements WHERE item_id = ? GROUP BY kind`,
    [acucar.id],
  );
  const devolucoes = tipos.find((t) => t.kind === 'return');
  assert.equal(devolucoes?.n, 2, 'a devolução tem as duas pernas, e as duas são devolução');
  assert.equal(tipos.find((t) => t.kind === 'transfer')?.n, 2, 'e a carga continua sendo carga');

  // E a remessa do dia não encolhe por causa da devolução: são dois fatos, não
  // um saldo. Quem recebeu 6.000 recebeu 6.000, mesmo tendo devolvido depois.
  const dia = await shipmentsOn(
    LOCAL_COMPANY_ID,
    dayWindow(nowIso(), 'America/Sao_Paulo').from,
    dayWindow(nowIso(), 'America/Sao_Paulo').to,
  );
  const paraLoja = dia.find((d) => d.locationId === loja);
  assert.equal(paraLoja?.items[0]?.baseUnits, 6000);
});

test('a kettle is refused when the sugar is in the store, not in the factory', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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

/**
 * O rótulo de quatro décimos de centavo chega ao razão, e fica lá.
 *
 * Este é o caso que a migração V18 existe para servir, e ele é invisível com o
 * valor comum: uma embalagem de cinco centavos atravessava certo mesmo quando a
 * coluna era `Cents` inteiro. O defeito só nasce abaixo de meio centavo, e some
 * exatamente ali — `Math.round(0,4)` é zero, e zero não parece errado.
 *
 * O que ele custa: quinhentas unidades por corrida a R$ 0,004 são R$ 2,00 que o
 * `unit_cost_rate` **congelado** nunca viu. Congelado não se corrige, se estorna —
 * então cada corrida gravada sob o defeito ficaria errada para sempre.
 *
 * A asserção é sobre a TAXA, não sobre o custo arredondado da unidade: somados a
 * meio real, quatro décimos de centavo podem cair no mesmo centavo, e cair no
 * mesmo centavo está certo. O dinheiro está na multiplicação.
 */
test('packaging under half a cent reaches the frozen rate, and stays there', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  // O que a tela grava quando alguém digita 0,004 no campo de embalagem.
  await saveProduct(LOCAL_COMPANY_ID, {
    id: product.id,
    itemId: product.itemId,
    name: product.name,
    kind: 'product',
    recipeId: product.recipeId,
    yieldPerUnit: product.yieldPerUnit,
    unitPackagingRate: rate(0.004, 1),
    packagingItems: [],
    packaging: product.packaging,
    shelfLifeDays: product.shelfLifeDays,
    fullLevel: null,
  });

  const salvo = (await listProductsForLedger(LOCAL_COMPANY_ID)).find((p) => p.id === product.id);
  assert.equal(salvo?.unitPackagingRate, 0.4, 'a fração sobrevive à ida e volta do banco');

  const run = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    occurredAt: '2026-09-06T12:00:00.000Z',
    producedOn: '2026-09-06',
  });

  const semEmbalagem = run.unitCostRate - 0.4;
  assert.ok(
    Math.abs(run.unitCostRate - (semEmbalagem + 0.4)) < 1e-9,
    'a taxa congelada carrega os quatro décimos',
  );
  // E o que isso vale na corrida: dois reais, que sob o defeito eram zero.
  assert.equal(amountOf(0.4 as Rate, 500), 200);
});

test('a production run writes one line per item, and freezes what each cost', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
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

  /**
   * A embalagem entra por CONSUMO e não por taxa fixa — mudou em 6 de setembro, e
   * a asserção mudou com ela sem perder o que provava.
   *
   * Antes o exemplo carregava `unitPackagingRate` e não gastava palito nenhum: o
   * dinheiro fechava e o estoque mentia, com o palito subindo corrida após
   * corrida. Agora a embalagem está entre as linhas consumidas, então ela já vive
   * dentro de `value` — e somá-la de novo aqui a cobraria duas vezes.
   *
   * O que este trecho prova continua sendo o mesmo, e é a frase acima: o número
   * que a tela promete e o número que o razão guarda são UM número. O que mudou é
   * por onde a embalagem chega até ele.
   */
  const daEmbalagem = new Set(
    (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.kind === 'packaging').map((i) => i.id),
  );
  assert.ok(
    used.some((l) => daEmbalagem.has(l.item_id)),
    'a corrida gastou embalagem, ou este teste não prova o que diz provar',
  );
  assert.ok(Math.abs(run.unitCostRate - value / 500) < 1e-9);
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
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
  /**
   * A parte da embalagem por unidade — e ela deixou de vir de um campo digitado.
   *
   * Era `product.unitPackagingRate`, um valor à mão. Desde 6 de setembro a
   * embalagem é CONSUMO: um palito e uma embalagem por picolé, saindo do estoque
   * como qualquer insumo. O conceito que este teste usa continua existindo — "a
   * parte que não se espalha" — e o que mudou é de onde ele vem.
   *
   * Derivado das taxas dos próprios itens de embalagem, e não de uma constante
   * escrita aqui: uma constante passaria a mentir no dia em que o exemplo mudasse
   * de fornecedor, e o teste continuaria verde afirmando uma proporção falsa.
   */
  const embalagens = (await listItems(LOCAL_COMPANY_ID)).filter((i) => i.kind === 'packaging');
  const pack = embalagens.reduce((soma, i) => soma + (i.averageRate ?? 0), 0);
  assert.ok(pack > 0, 'o exemplo gasta embalagem, ou a proporção abaixo não prova nada');

  // Mistura se espalha, palito não: tirada a parte constante, o que sobra tem de
  // ficar mais caro por exatamente 500/400.
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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

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

test('the short history is runs, not days, and expiry only warns about what is still there', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [produto] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  // Validade cadastrada, senão nenhum lote vence e a segunda metade deste teste
  // mediria o vazio. O exemplo semeado não declara validade de propósito - é
  // campo opcional, e "não vence" é resposta legítima.
  await saveProduct(LOCAL_COMPANY_ID, {
    id: produto.id,
    itemId: produto.itemId,
    name: produto.name,
    kind: 'product',
    recipeId: produto.recipeId,
    yieldPerUnit: produto.yieldPerUnit,
    unitPackagingRate: produto.unitPackagingRate,
    shelfLifeDays: 180,
    packaging: produto.packaging,
  });

  // Insumo para três tachos: o exemplo semeado tem um dia de polpa, e o que este
  // teste mede é o histórico, não a trava de estoque.
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

  // Três corridas no mesmo dia. O total do dia não distingue isto de uma corrida
  // só de 300 - e são semanas diferentes.
  for (const [i, quanto] of [80, 100, 120].entries()) {
    await recordProduction(LOCAL_COMPANY_ID, {
      productId: produto.id,
      locationId: defaultLocationId(LOCAL_COMPANY_ID),
      batches: 1,
      unitsProduced: quanto,
      occurredAt: `2026-03-01T1${i}:00:00.000Z`,
      producedOn: '2026-03-01',
    });
  }

  const corridas = await recentRuns(LOCAL_COMPANY_ID, 6);
  assert.equal(corridas.length, 3, 'uma linha por corrida, não por dia');
  assert.deepEqual(
    corridas.map((c) => c.baseUnits),
    [120, 100, 80],
    'mais recente primeiro',
  );
  assert.ok(corridas[0].code, 'cada corrida traz o código do lote dela');
  assert.ok((corridas[0].unitCostRate ?? 0) > 0, 'e a taxa congelada daquela corrida');

  // O limite corta pelo fim, não pelo começo.
  assert.equal((await recentRuns(LOCAL_COMPANY_ID, 2)).length, 2);
  assert.equal((await recentRuns(LOCAL_COMPANY_ID, 2))[0].baseUnits, 120);

  // Validade: o produto semeado dura 180 dias, então nada vence esta semana.
  const semana = await expiringSoon(LOCAL_COMPANY_ID, '2026-03-08');
  assert.deepEqual(semana, [], 'nada vencendo é resposta, não lista vazia por erro');

  const longe = await expiringSoon(LOCAL_COMPANY_ID, '2027-01-01');
  assert.equal(longe.length, 3, 'os três lotes vencem dentro do ano');
  assert.ok(
    longe[0].expiresOn <= longe[1].expiresOn,
    'o que vence primeiro vem primeiro',
  );

  // E o lote que já foi embora não avisa mais. Mandar o lote inteiro para uma
  // loja tira ele da lista - avisar da validade de uma caixa que não está aqui é
  // exatamente o alerta que ensina a ignorar alerta.
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const primeiro = longe[0];
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: produto.itemId,
    fromLocationId: defaultLocationId(LOCAL_COMPANY_ID),
    toLocationId: centro.id,
    baseUnits: primeiro.baseUnits,
    occurredAt: '2026-03-02T09:00:00.000Z',
    lotId: primeiro.lotId,
  });

  // Na empresa o lote continua existindo, e está certo: as caixas não sumiram,
  // mudaram de sala.
  const naEmpresa = await expiringSoon(LOCAL_COMPANY_ID, '2027-01-01');
  assert.ok(
    naEmpresa.some((l) => l.lotId === primeiro.lotId),
    'o lote que viajou continua existindo na empresa',
  );

  // Na FÁBRICA ele não está mais, e é essa a pergunta da capa: o que vence
  // primeiro do que está aqui.
  const naFabrica = await expiringSoon(
    LOCAL_COMPANY_ID,
    '2027-01-01',
    5,
    defaultLocationId(LOCAL_COMPANY_ID),
  );
  assert.ok(
    !naFabrica.some((l) => l.lotId === primeiro.lotId),
    'lote que saiu da fábrica não avisa mais na fábrica',
  );

  // E chegou na loja com o lote: sem isso o recall pararia na porta da fábrica.
  const naLoja = await expiringSoon(LOCAL_COMPANY_ID, '2027-01-01', 5, centro.id);
  assert.ok(
    naLoja.some((l) => l.lotId === primeiro.lotId),
    'o lote chegou na loja identificado',
  );
});

test('listed packaging leaves the storeroom, per unit, and lands in the frozen cost', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const items = await listItems(LOCAL_COMPANY_ID);
  const palito = items.find((i) => i.name.includes('Palito'));
  const saquinho = items.find((i) => i.name.includes('Embalagem'));
  assert.ok(palito && saquinho, 'o exemplo semeado tem palito e saquinho');

  // O produto passa a listar palito e saquinho: um de cada por unidade.
  const [produto] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  await saveProduct(LOCAL_COMPANY_ID, {
    id: produto.id,
    itemId: produto.itemId,
    name: produto.name,
    kind: 'product',
    recipeId: produto.recipeId,
    yieldPerUnit: produto.yieldPerUnit,
    unitPackagingRate: rate(0, 1),
    packagingItems: [
      { itemId: palito.id, quantityPerUnit: 1 },
      { itemId: saquinho.id, quantityPerUnit: 1 },
    ],
    packaging: produto.packaging,
  });

  const relido = (await listProductsForLedger(LOCAL_COMPANY_ID)).find((p) => p.id === produto.id);
  assert.equal(relido?.packagingItems.length, 2);
  assert.ok(
    relido?.packagingItems.every((l) => l.name.length > 3),
    'o nome vem do catálogo, não do JSON',
  );

  const antes = await listItems(LOCAL_COMPANY_ID);
  const saldoPalito = antes.find((i) => i.id === palito.id)?.onHandBaseUnits ?? 0;
  assert.ok(saldoPalito > 0, 'o exemplo semeado comprou palito');

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: produto.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 100,
    occurredAt: '2026-03-01T10:00:00.000Z',
    producedOn: '2026-03-01',
  });

  // O que este teste existe para provar: o palito DESCEU. Até aqui ele só subia,
  // corrida após corrida, e a fábrica descobria a diferença no inventário.
  const depois = await listItems(LOCAL_COMPANY_ID);
  assert.equal(
    depois.find((i) => i.id === palito.id)?.onHandBaseUnits,
    saldoPalito - 100,
    'cem unidades gastam cem palitos',
  );

  // E gastam por UNIDADE, não por tacho: é isso que separa a lista de embalagem
  // de uma linha de receita.
  const consumoPalito = corrida.consumed.find((c) => c.itemId === palito.id);
  assert.equal(consumoPalito?.baseUnits, 100);

  // O custo congelado inclui o palito, e inclui pela taxa das notas de compra -
  // não por um valor digitado à mão.
  const taxaPalito = (await averageRatesForLedger(LOCAL_COMPANY_ID))[palito.id] ?? 0;
  const taxaSaquinho = (await averageRatesForLedger(LOCAL_COMPANY_ID))[saquinho.id] ?? 0;
  assert.ok(taxaPalito > 0 && taxaSaquinho > 0, 'as notas deram preço aos dois');

  const linhaProduto = await live.getFirstAsync<{ unit_cost_rate: number }>(
    `SELECT unit_cost_rate FROM movements
      WHERE company_id = ? AND kind = 'production' AND item_id = ?
      ORDER BY recorded_at DESC LIMIT 1`,
    [LOCAL_COMPANY_ID, produto.itemId],
  );
  const semEmbalagem = corrida.consumed
    .filter((c) => c.itemId !== palito.id && c.itemId !== saquinho.id)
    .reduce((n, c) => n + c.rate * c.baseUnits, 0);
  assert.ok(
    Math.abs((linhaProduto?.unit_cost_rate ?? 0) - (semEmbalagem / 100 + taxaPalito + taxaSaquinho)) <
      1e-9,
    'a taxa congelada é a receita mais a embalagem que saiu do estoque',
  );
});

test('a run without packaging in stock is refused before anything is written', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const items = await listItems(LOCAL_COMPANY_ID);
  const palito = items.find((i) => i.name.includes('Palito'));
  assert.ok(palito, 'o exemplo semeado tem palito');
  const [produto] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  // Um palito por unidade, e uma corrida maior do que o estoque de palito.
  await saveProduct(LOCAL_COMPANY_ID, {
    id: produto.id,
    itemId: produto.itemId,
    name: produto.name,
    kind: 'product',
    recipeId: produto.recipeId,
    yieldPerUnit: produto.yieldPerUnit,
    unitPackagingRate: rate(0, 1),
    packagingItems: [{ itemId: palito.id, quantityPerUnit: 1 }],
    packaging: produto.packaging,
  });

  const saldo = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.id === palito.id);
  const demais = saldo!.onHandBaseUnits + 1;

  // A trava é a mesma dos insumos, e é por isso que a embalagem entra em
  // `needed` em vez de num caminho paralelo: sem palito, a fábrica não roda.
  await assert.rejects(
    recordProduction(LOCAL_COMPANY_ID, {
      productId: produto.id,
      locationId: defaultLocationId(LOCAL_COMPANY_ID),
      batches: Math.ceil(demais / 133),
      unitsProduced: demais,
      occurredAt: '2026-03-02T10:00:00.000Z',
      producedOn: '2026-03-02',
    }),
    NotEnoughStockError,
  );
});

test('a reading is a fact with a place, an hour and a unit — typed today, sensor tomorrow', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const camara = await savePlace(LOCAL_COMPANY_ID, { name: 'Câmara 1', kind: 'cold_room' });
  const outra = await savePlace(LOCAL_COMPANY_ID, { name: 'Câmara 2', kind: 'cold_room' });

  // Digitada na conferência: é o caminho que funciona hoje, e é fato tanto quanto
  // leitura de sensor.
  await recordReading(LOCAL_COMPANY_ID, {
    locationId: camara.id,
    kind: 'temperature',
    value: -18.4,
    unit: 'C',
    takenAt: '2026-09-03T08:00:00.000Z',
  });

  // Mais tarde, mais frio - e a mesma câmara.
  await recordReading(LOCAL_COMPANY_ID, {
    locationId: camara.id,
    kind: 'temperature',
    value: -12.1,
    unit: 'C',
    takenAt: '2026-09-03T14:00:00.000Z',
  });

  // Outra câmara, e outra grandeza: as duas coisas que o dono levantou, e
  // nenhuma delas precisou de tabela nova.
  await recordReading(LOCAL_COMPANY_ID, {
    locationId: outra.id,
    kind: 'temperature',
    value: -20,
    unit: 'C',
    takenAt: '2026-09-03T14:00:00.000Z',
    source: 'wifi',
  });
  await recordReading(LOCAL_COMPANY_ID, {
    locationId: camara.id,
    kind: 'humidity',
    value: 62,
    unit: '%',
    takenAt: '2026-09-03T14:00:00.000Z',
    source: 'zigbee',
  });

  const ultimas = await lastReadings(LOCAL_COMPANY_ID);
  assert.equal(ultimas.length, 3, 'uma última por lugar e por grandeza');

  const ultimaCamara = ultimas.find((r) => r.locationId === camara.id && r.kind === 'temperature');
  assert.equal(ultimaCamara?.value, -12.1, 'a última é a mais recente, não a primeira');

  const umidade = ultimas.find((r) => r.kind === 'humidity');
  assert.equal(umidade?.unit, '%');
  assert.equal(umidade?.source, 'zigbee', 'a origem viaja com a leitura');

  // A fração sobrevive: -18,4 arredondado para -18 é meio grau de freezer, e é
  // exatamente o tipo de perda que o projeto proíbe em dinheiro e vale aqui.
  const serie = await readingsBetween(
    LOCAL_COMPANY_ID,
    camara.id,
    'temperature',
    '2026-09-03T00:00:00.000Z',
    '2026-09-04T00:00:00.000Z',
  );
  assert.deepEqual(
    serie.map((r) => r.value),
    [-18.4, -12.1],
    'a série vem em ordem de quando foi medida, com a fração inteira',
  );

  // Leitura sem unidade é número solto: 4 é geladeira boa em Celsius e freezer
  // quebrado em Fahrenheit.
  await assert.rejects(
    recordReading(LOCAL_COMPANY_ID, {
      locationId: camara.id,
      kind: 'temperature',
      value: 4,
      unit: '  ',
    }),
    /unidade/,
  );

  // E atravessa para o servidor com o autor que a política exige.
  const fila = await pendingEntries();
  const linha = fila.find((e) => e.table === 'readings');
  assert.ok(linha, 'a leitura entra na fila do aparelho');
  const bruta = await live.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM readings WHERE id = ?`,
    [linha.rowId],
  );
  const escrita = serialize(linha, bruta ?? null, { userId: 'quem-mediu' });
  assert.equal(escrita.kind, 'upsert');
  if (escrita.kind === 'upsert') {
    assert.equal(escrita.row.recorded_by, 'quem-mediu', 'leitura sem autor não existe');
    assert.equal(escrita.row.device_id, null, 'digitada não tem aparelho, e isso não é lacuna');
  }
});

test('the agreement sheet is kept, corrected and queued for the server', async () => {
  const loja = await savePlace(LOCAL_COMPANY_ID, {
    name: 'Loja Centro',
    kind: 'own_store',
    contactPhone: '11 98888-7777',
    deliveryDays: 4 | 32, // terça e sexta
    agreementNote: 'descarregar pelos fundos',
  });
  assert.equal(loja.deliveryDays, 36);

  const lida = (await listPlaces(LOCAL_COMPANY_ID)).find((p) => p.id === loja.id);
  assert.equal(lida?.contactPhone, '11 98888-7777');
  assert.equal(lida?.deliveryDays, 36);
  assert.equal(lida?.agreementNote, 'descarregar pelos fundos');

  // Renomear não apaga o acordo: quem corrige o nome não está desmarcando a
  // sexta-feira, e uma tela que só manda o nome não pode zerar o resto.
  await savePlace(LOCAL_COMPANY_ID, { id: loja.id, name: 'Loja da Praça', kind: 'own_store' });
  const depois = (await listPlaces(LOCAL_COMPANY_ID)).find((p) => p.id === loja.id);
  assert.equal(depois?.name, 'Loja da Praça');
  assert.equal(depois?.deliveryDays, 36, 'o acordo sobreviveu ao apelido');
  assert.equal(depois?.contactPhone, '11 98888-7777');

  // Uma semana impossível para antes de virar linha na fila: o servidor recusa
  // por restrição, e uma fila que morre lá é uma gravação que a pessoa achou
  // que aconteceu.
  await assert.rejects(
    savePlace(LOCAL_COMPANY_ID, { id: loja.id, name: 'Loja da Praça', kind: 'own_store', deliveryDays: 200 }),
    /semana/,
  );

  // E o acordo atravessa. A fila guarda só a tabela e o id - o conteúdo é lido
  // do aparelho na hora de enviar -, então o que prova a travessia é o que o
  // serializador leva. Sem essas colunas, o telefone morre junto com o aparelho.
  const fila = await pendingEntries();
  const daLoja = fila.find((linha) => linha.table === 'locations' && linha.rowId === loja.id);
  assert.ok(daLoja, 'salvar um lugar enfileira o lugar');

  const linha = await live.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM locations WHERE id = ?`,
    [loja.id],
  );
  const escrita = serialize(daLoja, linha ?? null, { userId: 'quem' });
  assert.equal(escrita.kind, 'upsert');
  if (escrita.kind === 'upsert') {
    assert.equal(escrita.row.contact_phone, '11 98888-7777');
    assert.equal(escrita.row.delivery_days, 36);
    assert.equal(escrita.row.agreement_note, 'descarregar pelos fundos');
  }
});

test('what is running out answers for the room you are looking at, and for the kind', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });

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
  for (let d = 1; d <= 7; d += 1) {
    await recordProduction(LOCAL_COMPANY_ID, {
      productId: product.id,
      locationId: fabrica,
      batches: 1,
      unitsProduced: 100,
      occurredAt: `2026-03-0${d}T10:00:00.000Z`,
      producedOn: localDate(`2026-03-0${d}T10:00:00.000Z`, 'America/Sao_Paulo'),
    });
  }
  // Uma parte do açúcar dorme na loja. Ele tem saldo lá e nenhuma saída lá.
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar, 'o exemplo semeado tem açúcar');
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 10_000,
    occurredAt: '2026-03-01T09:00:00.000Z',
  });

  const de = '2026-03-01T00:00:00.000Z';
  const ate = '2026-03-08T00:00:00.000Z';
  const empresa = await runningOut(LOCAL_COMPANY_ID, de, ate, 7, 3650);
  assert.ok(
    empresa.some((r) => r.itemId === acucar.id),
    'na empresa inteira o açúcar sai, então ele tem data de acabar',
  );

  // Na loja o mesmo açúcar está parado: tem saldo, não tem saída. Uma data de
  // acabar aqui seria inventada, e é exatamente a que a fábrica aprende a ignorar.
  const naLoja = await runningOut(LOCAL_COMPANY_ID, de, ate, 7, 3650, centro.id);
  assert.ok(
    !naLoja.some((r) => r.itemId === acucar.id),
    'o que não sai daquela sala não acaba naquela sala',
  );

  // E a fábrica, que é de onde ele saiu, continua respondendo.
  const naFabrica = await runningOut(LOCAL_COMPANY_ID, de, ate, 7, 3650, fabrica);
  const laFora = naFabrica.find((r) => r.itemId === acucar.id);
  const total = empresa.find((r) => r.itemId === acucar.id);
  assert.ok(laFora && total, 'o açúcar acaba nos dois recortes');
  assert.ok(
    laFora.onHandBaseUnits < total.onHandBaseUnits,
    'o saldo da sala é menor que o da empresa — o que foi para a loja não está no tacho',
  );

  // O tipo também é recorte: uma tela que mostra só embalagem não pode receber
  // a frase de um insumo debaixo do dinheiro dela.
  //
  // A produção não consome embalagem em movimento — ela cobra centavos por
  // unidade, e o saldo de palito só sobe. É fronteira registrada
  // (`docs/insights.md`, "o custo que sete telas prometiam"), não defeito, e o
  // que faz palito sair hoje é ele ir para outro lugar. Sem essa saída, pedir
  // 'packaging' voltaria vazio e o teste passaria sem tocar no filtro.
  const palito = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Palito'));
  assert.ok(palito, 'o exemplo semeado tem palito');
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: palito.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 20_000,
    occurredAt: '2026-03-02T09:00:00.000Z',
  });

  const soEmbalagem = await runningOut(LOCAL_COMPANY_ID, de, ate, 7, 3650, fabrica, ['packaging']);
  assert.deepEqual(
    soEmbalagem.map((r) => r.itemId),
    [palito.id],
    'pedindo embalagem, só volta embalagem',
  );
  const soInsumo = await runningOut(LOCAL_COMPANY_ID, de, ate, 7, 3650, fabrica, ['input']);
  assert.ok(soInsumo.length > 0, 'sete dias de produção consomem insumo');
  assert.ok(
    !soInsumo.some((r) => r.itemId === palito.id),
    'pedindo insumo, o palito não entra',
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
    unitPackagingRate: rate(0, 1),
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

/**
 * O que dá para prometer conta a câmara fria, porque é lá que o picolé dorme.
 *
 * A decisão escrita continua valendo e não é o que estava errado: o saldo lido é
 * o de onde a CARGA SAI, não o da empresa - mil picolés em quatro lojas não
 * atendem quem pediu mil na fábrica. O defeito era o plural: a conta lia um lugar
 * só, o `defaultLocationId`. Numa fábrica de picolés o produto vai para a câmara
 * no dia seguinte ao de produzir, então a conta dizia "não há nada para prometer"
 * com o freezer cheio - e a tela de anotar pedido não avisava excesso nenhum
 * justamente quando a conta mais decide.
 */
test('what can be promised counts every room of ours, and no store', async () => {
  const camara = await savePlace(CO, { name: 'Câmara fria', kind: 'cold_room' });
  const centro = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de limão',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingRate: rate(0, 1),
    packaging: loose,
  });

  // Duzentos produzidos; cento e cinquenta vão para a câmara e trinta para a
  // loja. Nossas salas ficam com 170, e a loja com 30.
  await recordCount(CO, { locationId: defaultLocationId(CO), itemId, countedBaseUnits: 200 });
  await recordTransfer(CO, {
    itemId,
    fromLocationId: defaultLocationId(CO),
    toLocationId: camara.id,
    baseUnits: 150,
  });
  await recordTransfer(CO, {
    itemId,
    fromLocationId: defaultLocationId(CO),
    toLocationId: centro.id,
    baseUnits: 30,
  });

  const linha = (await stockAgainstOrders(CO, '2026-09-10')).find((d) => d.itemId === itemId);
  assert.equal(
    linha?.onHand,
    170,
    'a câmara é nossa e conta; a loja já foi entregue e não conta',
  );
});

test('what was ordered is measured against the factory shelf, not the company total', async () => {
  const centro = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de morango',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingRate: rate(0, 1),
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

  const [demand] = await stockAgainstOrders(CO, '2026-09-10');
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
  const [ainda] = await stockAgainstOrders(CO, '2026-09-10');
  assert.equal(ainda.requested, 300, 'a janela é a da decisão, não a da lista inteira');

  // Entregue sai da conta: o compromisso acabou.
  //
  // E a LINHA continua — é a diferença que fez esta consulta partir do produto
  // em vez da linha de pedido. Zero prometido é fato sobre um produto que
  // existe e tem saldo; ausência de linha era a tela de anotar pedido ficando
  // sem dica nenhuma no campo de quantidade, justamente no primeiro pedido do
  // dia, que é quando a conta mais decide.
  const [aberto] = await listOrders(CO);
  await setOrderStatus(CO, aberto.id, 'delivered');
  const [depois] = await stockAgainstOrders(CO, '2026-09-10');
  assert.equal(depois.requested, 0, 'pedido entregue não é mais demanda');
  assert.equal(depois.onHand, 50, 'e o saldo continua sendo o da fábrica');

  // Quem lê isto para achar FALTA continua certo de graça: as duas telas
  // filtram por `requested - onHand > 0`, e a linha de zero nunca satisfaz.
  const faltando = (await stockAgainstOrders(CO, '2026-09-10')).filter(
    (d) => d.requested - d.onHand > 0,
  );
  assert.equal(faltando.length, 0, 'produto sem pedido não vira "produza para os pedidos"');
});

test('approval is the company’s choice, and it decides where an order is born', async () => {
  const centro = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de morango',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingRate: rate(0, 1),
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
  const [demand] = await stockAgainstOrders(CO, '2026-09-10');
  assert.equal(demand.requested, 40);

  await setOrderStatus(CO, pedido.id, 'open');
  const [aprovado] = await listOrders(CO, ['open']);
  assert.equal(aprovado.id, pedido.id);
});

/**
 * O estorno, que é a primeira fundação do projeto e não tinha escritor.
 *
 * Três coisas que ele precisa fazer, e cada uma corresponde a um jeito de
 * corromper o livro-razão se estiver errada: desfazer o ATO inteiro e não uma
 * linha, recusar o que deixaria saldo negativo, e não desfazer duas vezes.
 */
test('reversing a run puts back every leg of it, and leaves both records standing', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  const antes = await balanceByLocation(LOCAL_COMPANY_ID, product.itemId);
  const polpa = (await listItems(LOCAL_COMPANY_ID)).find((i) => /polpa/i.test(i.name))!;
  const polpaAntes = (await balanceByLocation(LOCAL_COMPANY_ID, polpa.id)).find(
    (b) => b.locationId === where,
  );

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const plano = await planReversal(LOCAL_COMPANY_ID, corrida.groupId);
  assert.equal(plano.blocked.length, 0, 'nada saiu ainda, então nada bloqueia');
  assert.equal(plano.alreadyReversed, false);
  // A perna do produto sai NEGATIVA: o estorno tira do estoque o que a corrida
  // pôs. As dos insumos voltam positivas.
  const doProduto = plano.legs.find((l) => l.itemId === product.itemId)!;
  assert.equal(doProduto.baseUnits, -500);
  assert.ok(plano.legs.some((l) => l.itemId === polpa.id && l.baseUnits > 0));

  await reverseGroup(LOCAL_COMPANY_ID, { groupId: corrida.groupId });

  const depois = (await balanceByLocation(LOCAL_COMPANY_ID, product.itemId)).find(
    (b) => b.locationId === where,
  );
  const antesDoProduto = antes.find((b) => b.locationId === where)?.baseUnits ?? 0;
  assert.equal(
    depois?.baseUnits ?? 0,
    antesDoProduto,
    'o produto volta ao saldo que tinha antes da corrida',
  );

  const polpaDepois = (await balanceByLocation(LOCAL_COMPANY_ID, polpa.id)).find(
    (b) => b.locationId === where,
  );
  assert.equal(
    polpaDepois?.baseUnits,
    polpaAntes?.baseUnits,
    'o insumo consumido volta inteiro - estornar só a produção deixaria picolé que não consumiu nada',
  );

  // E o lote continua existindo. Ele é identidade, não quantidade: a etiqueta
  // pode já estar colada numa caixa, e apagar a linha seria a exclusão que a
  // fundação proíbe.
  assert.ok(await findLot(LOCAL_COMPANY_ID, corrida.lot.id), 'o lote não some no estorno');

  // E "produzido hoje" para de contar a corrida corrigida.
  //
  // **É a cicatriz que este teste existia sem cobrir.** O saldo é soma pura e se
  // conserta sozinho — as asserções acima provam isso. Mas as consultas de "o que
  // aconteceu" filtram por `kind`, e `reversal` não é `production`: sem o
  // `NAO_ESTORNADO` na cláusula, o almoxarifado fica certo e a capa continua
  // dizendo que a fábrica produziu 500 picolés que foram desfeitos.
  //
  // A mutação que tira esse filtro atravessou a suíte inteira, e só apareceu
  // quando a oficina do `mutate` voltou a rodar de verdade.
  //
  // **E atravessou uma segunda vez, com esta asserção já escrita.** A janela era
  // montada à mão: `localDate(...,'America/Sao_Paulo')` seguido de `T00:00:00.000Z`
  // — a data local de São Paulo carimbada com o fuso de Greenwich. `occurred_at`
  // da corrida é `nowIso()`, em UTC. Entre 00h e 03h UTC os dois discordam de um
  // dia, a janela não contém o movimento, `productionOn` volta vazia, e a
  // asserção `?? 0 === 0` passa com o filtro e sem ele. O teste só matava o
  // mutante depois das 3h UTC, e o CI rodou à 1h.
  //
  // `dayWindow` é a função que existe justamente para isso: ela pergunta ao
  // `Intl` que dia local é aquele instante e devolve as duas bordas como
  // instantes UTC, meia-noite a meia-noite, meio-aberto como a consulta espera.
  const janela = dayWindow(nowIso(), 'America/Sao_Paulo');
  const produzido = await productionOn(LOCAL_COMPANY_ID, janela.from, janela.to);
  const doProdutoHoje = produzido.find((l) => l.itemId === product.itemId);
  assert.equal(
    doProdutoHoje?.baseUnits ?? 0,
    0,
    'a corrida estornada não conta mais como produzida — senão o almoxarifado fica certo e a capa mente',
  );
});

test('a run whose product already shipped cannot be reversed, and the refusal names what left', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const loja = (await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' })).id;

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // O saldo da fábrica pode ter picolé de antes; o que interessa é mandar
  // embora mais do que sobraria depois do estorno.
  const naFabrica =
    (await balanceByLocation(LOCAL_COMPANY_ID, product.itemId)).find(
      (b) => b.locationId === fabrica,
    )?.baseUnits ?? 0;
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: product.itemId,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: naFabrica - 100,
  });

  const plano = await planReversal(LOCAL_COMPANY_ID, corrida.groupId);
  assert.equal(plano.blocked.length, 1, 'o produto que já viajou bloqueia o estorno');
  assert.equal(plano.blocked[0].name, product.name);
  assert.equal(plano.blocked[0].held, 100);
  assert.equal(plano.blocked[0].needed, 500);

  await assert.rejects(
    () => reverseGroup(LOCAL_COMPANY_ID, { groupId: corrida.groupId }),
    (e: unknown) => e instanceof CannotReverseError && e.plan.blocked.length === 1,
    'o erro carrega o plano, porque a tela precisa dizer QUAL item já saiu',
  );

  // E a recusa é recusa: nada foi escrito pela metade.
  const naLoja = (await balanceByLocation(LOCAL_COMPANY_ID, product.itemId)).find(
    (b) => b.locationId === loja,
  );
  assert.equal(naLoja?.baseUnits, naFabrica - 100, 'a loja continua com o que recebeu');
});

test('reversing twice would double the correction, so the second time is refused', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  await reverseGroup(LOCAL_COMPANY_ID, { groupId: corrida.groupId });

  const depois = await planReversal(LOCAL_COMPANY_ID, corrida.groupId);
  assert.equal(depois.alreadyReversed, true);

  const saldoDepoisDoPrimeiro = (
    await balanceByLocation(LOCAL_COMPANY_ID, product.itemId)
  ).find((b) => b.locationId === where)?.baseUnits;

  await assert.rejects(
    () => reverseGroup(LOCAL_COMPANY_ID, { groupId: corrida.groupId }),
    (e: unknown) => e instanceof CannotReverseError && e.plan.alreadyReversed,
  );

  const saldoFinal = (await balanceByLocation(LOCAL_COMPANY_ID, product.itemId)).find(
    (b) => b.locationId === where,
  )?.baseUnits;
  assert.equal(saldoFinal, saldoDepoisDoPrimeiro, 'o segundo estorno não moveu nada');
});

test('a manufactured product is worth what it cost to make, everywhere it is', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const loja = (await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' })).id;

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // O custo congelado da corrida é a verdade; a média do produto tem que ser
  // ela, porque não havia picolé nenhum antes.
  const custos = await averageRatesForLedger(LOCAL_COMPANY_ID);
  assert.ok(
    Math.abs(custos[product.itemId] - corrida.unitCostRate) < 1e-9,
    `a média do produto é o custo da corrida (média ${custos[product.itemId]}, corrida ${corrida.unitCostRate})`,
  );

  // E o valor viaja com a mercadoria. Antes disto, mandar 500 picolés para a
  // loja fazia o dinheiro evaporar: o insumo saía valorado do almoxarifado e o
  // produto entrava valendo zero na loja.
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: product.itemId,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: 500,
  });

  const lugares = await stockByPlace(LOCAL_COMPANY_ID);
  const naLoja = lugares.find((l) => l.locationId === loja);
  const esperado = Math.round(corrida.unitCostRate * 500);
  assert.equal(
    naLoja?.valueCents,
    esperado,
    'a loja vale o que a carga custou para fazer, não R$ 0,00',
  );
  assert.ok(esperado > 0, 'e o custo de fazer não é zero');
});

/**
 * Estornar devolve o dinheiro, não só a quantidade.
 *
 * **A cicatriz.** O saldo voltava certinho — o teste acima prova isso desde 3 de
 * setembro — e o custo médio ficava com o erro dentro para sempre. A confirmação
 * que a pessoa lê diz *"os dois lançamentos ficam no histórico — nada é
 * apagado"*, e ela entende que o erro foi desfeito. Metade dele era.
 *
 * Média móvel não se desfaz por aritmética inversa: ela depende do caminho. O
 * que se faz é replicar o caminho, que é a mesma coisa que a fundação já diz do
 * saldo — e é isso que `recomputeItemCost` faz.
 */
test('reversing a run gives the money back, not only the quantity', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [product] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  const where = defaultLocationId(LOCAL_COMPANY_ID);

  const primeira = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  const depoisDaPrimeira = await custoDe(product.itemId);
  assert.ok(depoisDaPrimeira > 0, 'a primeira corrida deu preço ao produto');

  // A segunda com um DÉCIMO das unidades: a mesma receita dividida por menos
  // picolés faz a taxa congelada subir, e a média sobe junto.
  const errada = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 50,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  const envenenada = await custoDe(product.itemId);
  assert.ok(
    envenenada > depoisDaPrimeira,
    `a corrida errada tinha que puxar a média para cima (${depoisDaPrimeira} -> ${envenenada})`,
  );

  await reverseGroup(LOCAL_COMPANY_ID, { groupId: errada.groupId });

  const consertada = await custoDe(product.itemId);
  assert.ok(
    Math.abs(consertada - depoisDaPrimeira) < 1e-9,
    `depois do estorno a média volta ao que era antes da corrida errada: ` +
      `esperado ${depoisDaPrimeira}, veio ${consertada}. Sem isso o dono corrige o estoque ` +
      `e fica com o custo errado embaixo de todo número de dinheiro do aplicativo.`,
  );

  // E o histórico diz que mudou, porque mudança calada de custo reaparece
  // semanas depois como margem errada, sem nada que a explique.
  const conn = await db();
  const historia = await conn.getAllAsync<{ new_rate: number }>(
    `SELECT new_rate FROM item_cost_history WHERE company_id = ? AND item_id = ? ORDER BY observed_at`,
    [LOCAL_COMPANY_ID, product.itemId],
  );
  assert.ok(historia.length >= 3, 'as duas corridas e o estorno deixam rastro no histórico de preço');

  // A primeira corrida continua de pé: estornar a segunda não pode levar a
  // primeira junto.
  assert.ok(await findLot(LOCAL_COMPANY_ID, primeira.lot.id), 'o lote da corrida boa não some');
});

/**
 * O aviso de validade segue o LOTE, não a prateleira.
 *
 * **A cicatriz.** A capa e o alarme do celular pediam `expiringSoon` com o
 * almoxarifado como filtro. A soma por local de um lote que saiu do almoxarifado
 * dá zero ali, e o `HAVING SUM(...) > 0` o descarta — então o filtro silenciava o
 * aviso EXATAMENTE no dia em que o picolé ia para a câmara fria, que é o dia
 * seguinte ao de produzi-lo. Uma fábrica de picolés manda picolé para a câmara:
 * dali em diante o cartão de validade nunca mais avisava de nada, e o produto
 * vencia dentro dela.
 *
 * A câmara fria como lugar é entrega da Fase 2. Este teste é a metade que faltou:
 * a tela passou a existir e as leituras que dependiam dela continuaram fixadas no
 * almoxarifado.
 */
test('a lot warns about expiry from wherever it is, not only from the storeroom', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const { id: fria } = await savePlace(LOCAL_COMPANY_ID, { name: 'Câmara fria', kind: 'cold_room' });

  const [semPrazo] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);
  // A validade do lote vem do PRODUTO — perguntada uma vez no cadastro, nunca no
  // chão de fábrica. O exemplo semeado nasce sem prazo, então o prazo entra aqui.
  await saveProduct(LOCAL_COMPANY_ID, {
    id: semPrazo.id,
    itemId: semPrazo.itemId,
    name: semPrazo.name,
    kind: 'product',
    recipeId: semPrazo.recipeId,
    yieldPerUnit: semPrazo.yieldPerUnit,
    unitPackagingRate: semPrazo.unitPackagingRate,
    packaging: semPrazo.packaging,
    shelfLifeDays: 18,
  });
  const product = (await listProductsForLedger(LOCAL_COMPANY_ID)).find((p) => p.id === semPrazo.id)!;

  const corrida = await recordProduction(LOCAL_COMPANY_ID, {
    productId: product.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  const trintaDias = '2026-10-02';

  // No almoxarifado, antes de sair: o aviso enxerga.
  const antes = await expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5);
  assert.ok(
    antes.some((l) => l.code === corrida.lot.code),
    'antes de sair, o lote é avisado',
  );

  // Vai para a câmara, que é o que uma fábrica de picolés faz com picolé.
  // Com o LOTE nomeado, que é o que a tela faz: `app/transfer.tsx` manda a
  // frente da fila (o lote mais antigo). Sem ele as duas pernas saem com
  // `lot_id` nulo e o lote nunca muda de sala — o que é outra pergunta, e não
  // esta.
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: product.itemId,
    baseUnits: 400,
    fromLocationId: fabrica,
    toLocationId: fria,
    lotId: corrida.lot.id,
  });

  const depois = await expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5);
  assert.ok(
    depois.some((l) => l.code === corrida.lot.code),
    'depois de ir para a câmara o lote CONTINUA sendo avisado — era aqui que o aviso emudecia',
  );

  // E a pergunta por sala continua respondendo por sala, para o conserto não ter
  // sido "tirar o filtro e esquecer que ele serve para alguma coisa".
  const soNoAlmoxarifado = await expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5, fabrica);
  assert.ok(
    !soNoAlmoxarifado.some((l) => l.code === corrida.lot.code),
    'perguntando pelo almoxarifado, o lote que saiu não está lá — o filtro continua servindo',
  );
});


test('the seven roles arrive as profiles with no name, because the name is the screen\'s', async () => {
  const perfis = await listProfiles(LOCAL_COMPANY_ID);

  // Sete modelos, e nenhum deles carrega uma palavra: "Entregador" é texto de
  // tela em três idiomas. Guardar a palavra aqui seria traduzir depois o nome
  // que alguém digitou.
  assert.equal(perfis.length, 7);
  assert.deepEqual(
    perfis.map((p) => p.templateRole),
    ['owner', 'operator', 'storeManager', 'driver', 'buyer', 'customer', 'salesperson'],
  );
  assert.deepEqual(new Set(perfis.map((p) => p.name)), new Set(['']));

  // E cada um chega com as permissões do papel, não vazio: o entregador
  // despacha, confere chegada e registra perda - e não vê custo nenhum.
  const entregador = perfis.find((p) => p.templateRole === 'driver');
  assert.deepEqual([...(entregador?.capabilities ?? [])].sort(), [
    'check_receipt',
    'dispatch',
    'record_loss',
  ]);
  assert.equal(entregador?.wearers, 0, 'ninguém veste nada antes de existir gente');

  // Semear é uma vez só. Abrir a tela de novo não duplica os sete.
  assert.equal((await listProfiles(LOCAL_COMPANY_ID)).length, 7);
});


test('a person is registered, corrected, and leaves without being deleted', async () => {
  const perfis = await listProfiles(LOCAL_COMPANY_ID);
  const entregador = perfis.find((p) => p.templateRole === 'driver')!;
  const operador = perfis.find((p) => p.templateRole === 'operator')!;

  const zeca = await savePerson(LOCAL_COMPANY_ID, { name: '  Zeca  ', profileId: entregador.id });
  assert.equal(zeca.name, 'Zeca', 'o espaço em volta do nome não entra na grade');

  const lista = await listPeople(LOCAL_COMPANY_ID);
  assert.deepEqual(lista.map((p) => p.name), ['Zeca']);
  assert.equal(lista[0].profileId, entregador.id);

  // O perfil passa a saber quantos o vestem - é o que responde "dá para mexer
  // neste?" antes de alguém tocar.
  const comGente = await listProfiles(LOCAL_COMPANY_ID);
  assert.equal(comGente.find((p) => p.id === entregador.id)?.wearers, 1);

  // Corrigir troca o perfil sem criar uma segunda pessoa.
  await savePerson(LOCAL_COMPANY_ID, { id: zeca.id, name: 'Zeca', profileId: operador.id });
  assert.equal((await listPeople(LOCAL_COMPANY_ID)).length, 1);
  assert.equal((await listPeople(LOCAL_COMPANY_ID))[0].profileId, operador.id);

  // E sair da empresa não apaga ninguém: gente some da grade e o histórico
  // continua apontando para ela. Movimento cujo operador sumiu é movimento que
  // não se pode explicar.
  await savePerson(LOCAL_COMPANY_ID, {
    id: zeca.id,
    name: 'Zeca',
    profileId: operador.id,
    active: false,
  });
  const depois = await listPeople(LOCAL_COMPANY_ID);
  assert.equal(depois.length, 1, 'a pessoa continua existindo');
  assert.equal(depois[0].active, false);

  // Quem saiu não conta como quem veste o perfil - senão o dono acha que não
  // pode mexer num perfil que ninguém usa.
  const semGente = await listProfiles(LOCAL_COMPANY_ID);
  assert.equal(semGente.find((p) => p.id === operador.id)?.wearers, 0);
});


test('the PIN says who touched the name, and never leaves the database', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [perfil] = await listProfiles(LOCAL_COMPANY_ID);

  const zeca = await savePerson(LOCAL_COMPANY_ID, {
    name: 'Zeca',
    profileId: perfil.id,
    pin: '1234',
  });
  const ana = await savePerson(LOCAL_COMPANY_ID, { name: 'Ana', profileId: perfil.id });

  // A grade sabe se abre o teclado; não sabe o número. Mandar a lista de PINs
  // para a tela desenhar seis nomes seria carregar o segredo de todo mundo para
  // não usar nenhum - e o tipo `Person` não tem onde guardá-lo.
  const lista = await listPeople(LOCAL_COMPANY_ID);
  assert.deepEqual(
    lista.map((p) => [p.name, p.hasPin]),
    [
      ['Ana', false],
      ['Zeca', true],
    ],
  );
  assert.equal(JSON.stringify(lista).includes('1234'), false, 'o PIN não sai do banco');

  assert.equal(await matchPin(LOCAL_COMPANY_ID, zeca.id, '1234'), true);
  assert.equal(await matchPin(LOCAL_COMPANY_ID, zeca.id, '4321'), false);

  // Espaço de teclado numérico de celular não deve reprovar quem digitou certo.
  assert.equal(await matchPin(LOCAL_COMPANY_ID, zeca.id, ' 1234 '), true);

  // Sem PIN passa com qualquer coisa, inclusive vazio: a fábrica que não quis
  // PIN escolhe com um toque, e é isso que ela pediu.
  assert.equal(await matchPin(LOCAL_COMPANY_ID, ana.id, ''), true);
  assert.equal(await matchPin(LOCAL_COMPANY_ID, ana.id, '9999'), true);

  // Quem saiu não se identifica mais, mesmo sabendo o número: `active = 0` é a
  // porta fechando, e o histórico dela continua de pé.
  await savePerson(LOCAL_COMPANY_ID, {
    id: zeca.id,
    name: 'Zeca',
    profileId: perfil.id,
    active: false,
  });
  assert.equal(await matchPin(LOCAL_COMPANY_ID, zeca.id, '1234'), false);

  // E a edição que não falou de PIN não apagou o PIN: `undefined` é "não mexi
  // nisso", que é diferente de `null`. Quem corrige um nome não deve deixar a
  // pessoa sem se identificar sem ter pedido isso.
  await savePerson(LOCAL_COMPANY_ID, {
    id: zeca.id,
    name: 'Zeca',
    profileId: perfil.id,
    active: true,
  });
  assert.equal(await matchPin(LOCAL_COMPANY_ID, zeca.id, '1234'), true);

  // Nulo é o pedido explícito de tirar.
  const semPin = await savePerson(LOCAL_COMPANY_ID, {
    id: zeca.id,
    name: 'Zeca',
    profileId: perfil.id,
    pin: null,
  });
  assert.equal(semPin.hasPin, false);
  assert.equal(await matchPin(LOCAL_COMPANY_ID, zeca.id, 'qualquer coisa'), true);

  // A forma é recusada AQUI, e não meses depois na primeira sincronia: o
  // servidor cobra a mesma coisa na 0036, e erro que impede vale mais que erro
  // que reclama.
  await assert.rejects(
    savePerson(LOCAL_COMPANY_ID, { name: 'Bia', profileId: perfil.id, pin: '12' }),
    /pin/,
  );
  await assert.rejects(
    savePerson(LOCAL_COMPANY_ID, { name: 'Bia', profileId: perfil.id, pin: 'abcd' }),
    /pin/,
  );
});


test('who is holding THIS phone is a fact of the phone, not of the company', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [perfil] = await listProfiles(LOCAL_COMPANY_ID);
  const ana = await savePerson(LOCAL_COMPANY_ID, { name: 'Ana', profileId: perfil.id });

  // Ninguém se identificou ainda, e nulo é a resposta honesta: quer dizer "não
  // perguntamos", não "não sabemos quem".
  assert.equal(await currentOperatorId(), null);

  await setCurrentOperator(ana.id);
  assert.equal(await currentOperatorId(), ana.id);

  // E largar o aparelho volta ao estado de ninguém - o celular da câmara passa
  // de mão, e quem pegou agora não é quem o largou.
  await setCurrentOperator(null);
  assert.equal(await currentOperatorId(), null);
});


test('the company chooses how the floor signs in, and the default is one phone per person', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);

  // O padrão é o do servidor (0011): `personal`. E nomear quem gravou é
  // desligado, que é a decisão do dono - o relatório fala de onde, não de quem.
  assert.equal(await floorSignIn(), 'personal');
  assert.equal(await namesWhoRecorded(), false);

  await setFloorSignIn('shared');
  await setNamesWhoRecorded(true);
  assert.equal(await floorSignIn(), 'shared');
  assert.equal(await namesWhoRecorded(), true);

  // E voltar atrás é uma escolha como qualquer outra: a fábrica que experimentou
  // nomear e achou fiscalização demais desliga sem perder nada.
  await setNamesWhoRecorded(false);
  assert.equal(await namesWhoRecorded(), false);
});


test('a movement written on a shared phone says who was holding it, all the way to the server', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const [perfil] = await listProfiles(LOCAL_COMPANY_ID);
  const ana = await savePerson(LOCAL_COMPANY_ID, { name: 'Ana', profileId: perfil.id });
  const [produto] = (await listProductsForLedger(LOCAL_COMPANY_ID)).filter((p) => p.recipeId);

  const [acucar] = (await listItems(LOCAL_COMPANY_ID)).filter((i) => /ú?car/i.test(i.name));

  // Ninguém se identificou: a linha nasce sem operador, e isso é resposta e não
  // lacuna — quer dizer "esta empresa não nomeia ninguém".
  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
  });
  const anonima = await live.getFirstAsync<{ operator_id: string | null }>(
    `SELECT operator_id FROM movements WHERE kind = 'purchase' ORDER BY recorded_at DESC LIMIT 1`,
  );
  assert.equal(anonima?.operator_id, null);

  // A Ana pega o aparelho.
  await setCurrentOperator(ana.id);
  await recordProduction(LOCAL_COMPANY_ID, {
    productId: produto.id,
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    batches: 1,
    unitsProduced: 100,
    producedOn: '2026-09-02',
  });

  // As DUAS pernas da corrida — o que saiu do almoxarifado e o que entrou no
  // estoque — carregam o operador. Um insert que esquecesse deixaria metade do
  // ato anônima, e o razão não tem UPDATE que conserte depois.
  const daAna = await live.getAllAsync<{ kind: string; operator_id: string | null }>(
    `SELECT kind, operator_id FROM movements WHERE operator_id IS NOT NULL`,
  );
  assert.ok(daAna.length >= 2, 'produção escreve consumo e produção, e as duas são da Ana');
  assert.deepEqual([...new Set(daAna.map((m) => m.operator_id))], [ana.id]);

  // E atravessa para o servidor, onde `operator_id` aponta para uma PESSOA sem
  // conta desde a 0035 — que é o nó inteiro deste assunto, desfeito.
  const fila = await pendingEntries();
  const linha = fila.filter((e) => e.table === 'movements').at(-1);
  assert.ok(linha, 'o movimento entra na fila');
  const bruta = await live.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM movements WHERE id = ?`,
    [linha.rowId],
  );
  const escrita = serialize(linha, bruta ?? null, { userId: 'a-conta-da-empresa' });
  assert.equal(escrita.kind, 'upsert');
  if (escrita.kind === 'upsert') {
    // A conta que escreveu e a pessoa que operava são duas perguntas, e é por
    // isso que existem duas colunas. Confundi-las já custou uma rodada inteira.
    assert.equal(escrita.row.recorded_by, 'a-conta-da-empresa');
    assert.equal(escrita.row.operator_id, ana.id);
  }

  // Largar o aparelho volta ao anônimo: quem pegar depois não herda o nome de
  // quem largou.
  await setCurrentOperator(null);
  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: acucar.id,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
  });
  const depois = await live.getAllAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM movements WHERE operator_id IS NOT NULL`,
  );
  assert.equal(depois[0].n, daAna.length, 'nada novo ganhou o nome da Ana');
});

/**
 * O livro-razão congela o MESMO número, esteja quem estiver com o aparelho.
 *
 * Este é o teste que teria pegado o defeito que o portão do dinheiro quase
 * entregou. Quando `itemCosts` ganhou portão, `recordProduction` e `recordLoss`
 * continuaram lendo por ela: com o portão fechado o mapa vinha vazio, o `?? 0` de
 * cada linha dava zero, e a corrida congelava `unit_cost_rate` NULO em cada
 * consumo e 5 no produto onde o dono congelava 304,98 — sobrando só a embalagem.
 *
 * Duas refutações independentes mediram isso rodando o código, e a segunda achou o
 * que é pior: a contaminação não fica nas duas funções. `item_costs` é reescrito a
 * partir do que elas gravam, então transferência e contagem — que leem
 * `item_costs` cru e estão CERTAS — passam a congelar fielmente o número errado. E
 * o servidor recalcula pela mesma coluna (`0025`), concorda, e a checagem de
 * divergência do `db:verify` passa. Os dois lados de acordo sobre o número errado.
 *
 * **Por que a asserção é igualdade e não "não é nulo".** A primeira versão que eu
 * ia escrever afirmava que a taxa existe. `unitCostRate = 5` existe: passa por
 * qualquer checagem de nulo, passa pelos filtros `!== null` que as telas já têm, e
 * chega à capa do dono como figura plausível. O que morde é comparar número por
 * número com o que o dono grava na mesma entrada.
 */
test('the ledger freezes the same rate whoever is holding the phone', async () => {
  const congelar = async (comOperador: boolean) => {
    // Um banco limpo por rodada: as duas passagens têm de partir do mesmo estado,
    // senão a segunda herda a média que a primeira moveu.
    const conn = inMemoryDb();
    await migrate(conn);
    __setDb(conn);
    live = conn;
    await ensureStarterData(CO);

    if (comOperador) {
      // A pessoa é criada ANTES de ser escolhida: `savePerson` exige
      // `manage_company`, e sem ninguém escolhido num aparelho pessoal quem está
      // com ele é o dono — que é o caminho de uma fábrica de verdade também.
      const perfis = await listProfiles(CO);
      const operador = perfis.find((p) => p.templateRole === 'operator');
      assert.ok(operador, 'os sete modelos são semeados, e um deles é o operador');
      const ana = await savePerson(CO, { name: 'Ana', profileId: operador.id });
      await setCurrentOperator(ana.id);
      // A premissa deste teste, presa aqui: se um dia `operator` ganhar
      // `view_cost`, o teste passa a comparar o dono com o dono e prova nada.
      assert.ok(
        !(await currentCapabilities(CO)).has('view_cost'),
        'o operador não vê custo, ou este teste não exercita portão nenhum',
      );
    }

    const onde = defaultLocationId(CO);
    const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
    const insumos = (await listItems(CO)).filter((i) => i.kind === 'input');
    const acucar = insumos[0];

    // Os cinco caminhos que congelam taxa. Produção e perda eram os quebrados;
    // compra, contagem e transferência entram porque foi por elas que a
    // contaminação se espalhou.
    await recordPurchase(CO, {
      itemId: acucar.id,
      purchaseQuantity: 2,
      baseUnits: (acucar.purchaseToBase ?? 1) * 2,
      totalCents: fromDecimal(240),
    });
    await recordProduction(CO, {
      productId: produto.id,
      locationId: onde,
      batches: 1,
      unitsProduced: 500,
      producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
    });
    await recordLoss(CO, { itemId: acucar.id, baseUnits: 500, reason: 'broken' });
    await recordCount(CO, {
      locationId: onde,
      itemId: acucar.id,
      countedBaseUnits: 1_000,
    });
    const loja = (await savePlace(CO, { name: 'Loja Centro', kind: 'store' })).id;
    await recordTransfer(CO, {
      itemId: produto.itemId,
      baseUnits: 100,
      fromLocationId: onde,
      toLocationId: loja,
    });

    // A ordem é determinística porque é a mesma sequência de escritas nas duas
    // passagens: `rowid` é a ordem em que o razão foi escrito.
    return conn.getAllAsync<{ kind: string; r: number | null }>(
      `SELECT kind, unit_cost_rate AS r FROM movements WHERE company_id = ? ORDER BY rowid`,
      [CO],
    );
  };

  const dono = await congelar(false);
  const ana = await congelar(true);

  assert.equal(ana.length, dono.length, 'as duas passagens escrevem as mesmas linhas');
  assert.deepEqual(
    ana,
    dono,
    'quem grava não muda o que o livro-razão congela — só muda o que a tela mostra',
  );
  // E a premissa do teste: alguma dessas linhas tem taxa, senão ele compara nada
  // com nada e passaria com o razão inteiro nulo.
  assert.ok(
    dono.some((l) => l.r !== null && l.r > 0),
    'o razão do dono tem taxa congelada, ou a comparação acima é vazia',
  );
});

/**
 * E a outra direção: quem não vê dinheiro não recebe dinheiro de nenhuma leitura.
 *
 * O teste de cima prova que o razão não muda; este prova que a TELA muda. Os dois
 * juntos são o desenho inteiro — sem o de cima, este passaria com o razão
 * apodrecido, que foi exatamente o que aconteceu.
 *
 * A varredura pergunta a cada leitura de dinheiro que existe, e não a uma lista
 * escolhida: leitura nova que esqueça o portão entra aqui só se alguém a
 * acrescentar, e é por isso que a lista está escrita com o nome de cada função e o
 * campo que ela devolve — quem ler o vermelho sabe qual das oito falhou.
 */
test('whoever cannot see money gets no money out of any read', async () => {
  await ensureStarterData(CO);
  const onde = defaultLocationId(CO);
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const acucar = (await listItems(CO)).filter((i) => i.kind === 'input')[0];

  // Um razão com dinheiro dentro, gravado pelo dono, para haver o que esconder.
  await recordProduction(CO, {
    productId: produto.id,
    locationId: onde,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  await recordLoss(CO, { itemId: acucar.id, baseUnits: 500, reason: 'broken' });
  const janela = dayWindow(nowIso(), 'America/Sao_Paulo');

  // A premissa, presa aqui: com o dono, TODAS estas leituras têm número. Sem esta
  // metade, o teste abaixo passaria numa fábrica vazia.
  assert.ok((await listItems(CO)).some((i) => (i.averageRate ?? 0) > 0), 'o dono vê custo médio');
  assert.ok(Object.keys((await itemCosts(CO)) ?? {}).length > 0, 'o dono vê o mapa de custo');
  assert.ok((await stockByPlace(CO)).some((p) => (p.valueCents ?? 0) > 0), 'o dono vê valor por sala');
  assert.ok(
    (await lossesOn(CO, janela.from, janela.to)).some((l) => (l.valueCents ?? 0) > 0),
    'o dono vê quanto a perda custou',
  );
  assert.ok((await recentRuns(CO)).some((r) => r.unitCostRate !== null), 'o dono vê a taxa da corrida');
  assert.ok(
    (await listProducts(CO)).some((p) => p.unitPackagingRate !== null),
    'o dono vê a embalagem digitada',
  );
  assert.ok(
    (await itemMovements(CO, acucar.id)).some((m) => m.unitCostRate !== null),
    'o dono vê a taxa congelada de cada linha',
  );

  // Agora a Ana, com o perfil de produção.
  const perfis = await listProfiles(CO);
  const operador = perfis.find((p) => p.templateRole === 'operator');
  assert.ok(operador, 'os sete modelos são semeados');
  const ana = await savePerson(CO, { name: 'Ana', profileId: operador.id });
  await setCurrentOperator(ana.id);

  assert.ok(
    (await listItems(CO)).every((i) => i.averageRate === null && i.lastRate === null),
    'nem o custo médio nem o preço da última nota chegam',
  );
  assert.equal(await itemCosts(CO), null, 'o mapa de custo não é mapa vazio: é nulo');
  assert.ok(
    (await stockByPlace(CO)).every(
      (p) => p.valueCents === null && p.lines.every((l) => l.valueCents === null),
    ),
    'nem o total da sala nem a linha de cada item carregam valor',
  );
  assert.ok(
    (await lossesOn(CO, janela.from, janela.to)).every((l) => l.valueCents === null),
    'a perda continua sendo listada, e sem o quanto custou',
  );
  assert.ok(
    (await lossesOn(CO, janela.from, janela.to)).length > 0,
    'e a lista NÃO fica vazia: perder é fato de chão de fábrica',
  );
  assert.ok((await recentRuns(CO)).every((r) => r.unitCostRate === null), 'a corrida vem sem taxa');
  assert.ok(
    (await listProducts(CO)).every((p) => p.unitPackagingRate === null),
    'a embalagem digitada é dinheiro como qualquer outro',
  );
  assert.ok(
    (await itemMovements(CO, acucar.id)).every((m) => m.unitCostRate === null),
    'e a taxa congelada não atravessa a borda só porque nenhuma tela a desenha hoje',
  );
  assert.deepEqual(await recentCostChanges(CO), [], 'histórico de preço é dinheiro do começo ao fim');
  assert.deepEqual(await itemHistory(CO, acucar.id), [], 'e o histórico de um item também');
});

/**
 * O piso do aparelho compartilhado — as duas bandeiras, e por que são duas.
 *
 * Sem isto, "largar o aparelho" na grade de nomes era o caminho mais curto para
 * ver a margem: um toque, sem PIN, devolvendo o conjunto do dono. E com uma
 * bandeira só, a fábrica que marca compartilhado e não nomeia ninguém prenderia o
 * próprio dono no piso, sem caminho de volta.
 */
test('a shared phone with nobody named is the floor, and a phone that never asks is not', async () => {
  await ensureStarterData(CO);

  // Padrão: pessoal, ninguém nomeado. É a conta que entrou, e ela é do dono.
  assert.ok((await currentCapabilities(CO)).has('view_cost'), 'o padrão de hoje não muda');

  // Compartilhado E nomeando: ninguém escolhido é "ainda não disse quem é".
  await setFloorSignIn('shared');
  await setNamesWhoRecorded(true);
  await setCurrentOperator(null);
  assert.ok(
    !(await currentCapabilities(CO)).has('view_cost'),
    'largar o aparelho compartilhado devolve o piso, não as chaves do dono',
  );

  // Compartilhado e NÃO nomeando: o aparelho nunca pergunta, então não existe
  // estado "ainda não respondeu" — e prender o dono no piso não teria saída.
  await setNamesWhoRecorded(false);
  assert.ok(
    (await currentCapabilities(CO)).has('view_cost'),
    'aparelho que não pergunta não tem como alguém se identificar',
  );
});

/**
 * O preço combinado, e a história que é a única fonte dele.
 *
 * A refutação da forma derrubou a versão sem história com um cenário concreto:
 * combinado a 14,50 em janeiro, renegociado a 15,80 em março, e janeiro deixa de
 * existir em qualquer tabela. A assimetria com o custo é o ponto — `item_costs`
 * pode ser sobrescrito porque as notas reconstroem a série; **preço digitado à mão
 * não tem nota atrás dele**. O esquema se re-chaveia por migração; os meses
 * perdidos não voltam por nenhuma.
 */
test('an agreed price beats the list price, and how it changed is kept', async () => {
  await ensureStarterData(CO);
  const loja = (await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' })).id;
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);

  // O preço de tabela: 2,50 por picolé.
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: null, rate: rate(2.5, 1) });
  let linhas = await salePricesFor(CO, loja);
  let linha = linhas.find((l) => l.itemId === produto.itemId);
  assert.ok(linha, 'o produto entra na lista do que se vende');
  // `perto` e não `equal`: taxa é FRACIONÁRIA por fundação, e `2,20 * 100` em
  // ponto flutuante é 220.00000000000003. Arredondar aqui para o teste passar seria
  // o teste pedindo à fundação que ela se dobrasse — só o valor final arredonda, e
  // quem arredonda é `amountOf`, uma vez.
  const perto = (a: number | null, b: number, o: string) =>
    assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${o}: ${a} não é ${b}`);
  perto(linha.listRate, 250, 'R$ 2,50 por unidade são 250 centavos por unidade');
  assert.equal(linha.agreedRate, null, 'sem acordo, vale a tabela');

  // E o combinado com esta loja: 2,20.
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: loja, rate: rate(2.2, 1) });
  linha = (await salePricesFor(CO, loja)).find((l) => l.itemId === produto.itemId);
  perto(linha?.agreedRate ?? null, 220, 'o combinado vence a tabela');
  perto(linha?.listRate ?? null, 250, 'e a tabela continua ao lado, para a tela comparar');

  // A renegociação, que é o caso que a história existe para responder.
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: loja, rate: rate(2.4, 1) });
  linha = (await salePricesFor(CO, loja)).find((l) => l.itemId === produto.itemId);
  perto(linha?.agreedRate ?? null, 240, 'o novo acordo');
  perto(linha?.previousRate ?? null, 220, 'de quanto veio, que some se a linha for sobrescrita sozinha');

  const serie = await live.getAllAsync<{ previous_rate: number | null; new_rate: number }>(
    `SELECT previous_rate, new_rate FROM sale_price_history
      WHERE company_id = ? AND location_id = ? ORDER BY observed_at, rowid`,
    [CO, loja],
  );
  assert.equal(serie.length, 2, 'a série guarda cada acordo, e não só o último');
  assert.equal(serie[0].previous_rate, null, 'o primeiro acordo não tem anterior');
  perto(serie[0].new_rate, 220, 'o primeiro acordo');
  perto(serie[1].previous_rate, 220, 'e o segundo diz de onde veio');
  perto(serie[1].new_rate, 240, 'o segundo acordo');
});

test('saving the same price twice is not history, and removing the agreement is', async () => {
  await ensureStarterData(CO);
  const loja = (await savePlace(CO, { name: 'Loja Norte', kind: 'own_store' })).id;
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);

  await saveSalePrice(CO, { itemId: produto.itemId, placeId: null, rate: rate(2.5, 1) });
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: loja, rate: rate(2.2, 1) });
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: loja, rate: rate(2.2, 1) });

  const contar = async () =>
    (
      await live.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM sale_price_history WHERE company_id = ? AND location_id = ?`,
        [CO, loja],
      )
    )?.n ?? 0;
  assert.equal(await contar(), 1, 'salvar sem trocar o número é ruído com data, não história');

  // Tirar o acordo: a loja volta a pagar a tabela, e o dia em que isso mudou é a
  // mesma pergunta que qualquer outra mudança de preço.
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: loja, rate: null });
  const linha = (await salePricesFor(CO, loja)).find((l) => l.itemId === produto.itemId);
  assert.equal(linha?.agreedRate, null, 'sem acordo de novo');
  assert.ok(
    linha?.listRate !== null && Math.abs((linha?.listRate ?? 0) - 250) < 1e-9,
    'e a tabela é o que passa a valer',
  );

  const ultima = await live.getFirstAsync<{ previous_rate: number; new_rate: number }>(
    `SELECT previous_rate, new_rate FROM sale_price_history
      WHERE company_id = ? AND location_id = ? ORDER BY observed_at DESC, rowid DESC LIMIT 1`,
    [CO, loja],
  );
  assert.ok(
    ultima && Math.abs(ultima.previous_rate - 220) < 1e-9 && Math.abs(ultima.new_rate - 250) < 1e-9,
    `tirar o acordo é a volta à tabela, e isso é história como qualquer outra: ${JSON.stringify(ultima)}`,
  );
});

test('zero is not a price, and whoever does not run the company does not set one', async () => {
  await ensureStarterData(CO);
  const loja = (await savePlace(CO, { name: 'Loja Sul', kind: 'customer' })).id;
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);

  // Zero congelaria como nulo no razão — indistinguível de "não havia acordo".
  // Mercadoria dada é carga SEM preço, e é assim que ela se diz.
  await assert.rejects(
    () => saveSalePrice(CO, { itemId: produto.itemId, placeId: loja, rate: 0 as Rate }),
    /zero não é preço/,
  );

  // E o portão, que aqui é `manage_company` e não `view_sale_price` — a capacidade
  // diz O QUE se pode ver, nunca QUAIS LINHAS, e preço combinado é uma linha por
  // parte. Sem escopo de conta, quem administra vê o acordo de todos e mais
  // ninguém vê o de ninguém.
  const perfis = await listProfiles(CO);
  const vendedor = perfis.find((p) => p.templateRole === 'salesperson');
  assert.ok(vendedor, 'o vendedor é um dos sete modelos');
  assert.ok(
    vendedor.capabilities.includes('view_sale_price'),
    'e ele TEM view_sale_price — é isso que torna a capacidade o portão errado aqui',
  );
  const zeca = await savePerson(CO, { name: 'Zeca', profileId: vendedor.id });
  await setCurrentOperator(zeca.id);

  assert.deepEqual(await salePricesFor(CO, loja), [], 'a consulta não devolve acordo de ninguém');
  await assert.rejects(
    () => saveSalePrice(CO, { itemId: produto.itemId, placeId: loja, rate: rate(2, 1) }),
    /não administra a empresa/,
  );
});

/**
 * O preço de TABELA tem portão próprio, e não é o mesmo do custo.
 *
 * `view_sale_price` existia no vocabulário desde a fundação, em cinco dos sete
 * papéis, e não decidia nada em lugar nenhum — nem depois de o preço combinado
 * entrar, porque aquele pede `manage_company` (é uma linha por parte, e capacidade
 * não diz quais linhas). O de tabela é um número só da empresa: quem vende precisa
 * saber por quanto, e é para isso que a capacidade existe.
 *
 * As duas metades juntas são o desenho: o comprador vê CUSTO e não vê PREÇO — está
 * escrito no `access.ts` e não é desconfiança, é que o número não é do trabalho dele.
 */
test('the list price answers to view_sale_price, and cost answers to view_cost', async () => {
  await ensureStarterData(CO);
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: null, rate: rate(2.5, 1) });

  // O dono vê os dois.
  let ficha = (await listProducts(CO)).find((p) => p.id === produto.id);
  assert.ok((ficha?.salePriceRate ?? 0) > 0, 'o dono vê por quanto sai');
  assert.ok(ficha?.unitPackagingRate !== null, 'e quanto custa a embalagem');

  const perfis = await listProfiles(CO);
  const vestir = async (papel: string) => {
    const perfil = perfis.find((p) => p.templateRole === papel);
    assert.ok(perfil, `${papel} é um dos sete modelos`);
    const quem = await savePerson(CO, { name: `Quem ${papel}`, profileId: perfil.id });
    await setCurrentOperator(quem.id);
  };

  /**
   * O comprador vê os DOIS, e essa era a minha primeira versão ao contrário.
   *
   * Eu tinha escrito que ele vê custo e não vê preço; o teste reprovou contra a
   * tabela de papéis, que diz o oposto com todas as letras — *"buying is where money
   * and cost meet, so this role sees both"*. Fica preso aqui porque a asserção que
   * eu ia escrever teria passado a impressão de uma regra que o produto não tem.
   */
  await vestir('buyer');
  ficha = (await listProducts(CO)).find((p) => p.id === produto.id);
  assert.ok(ficha?.unitPackagingRate !== null, 'o comprador vê custo');
  assert.ok((ficha?.salePriceRate ?? 0) > 0, 'e preço também: comprar é onde os dois se encontram');

  /**
   * O VENDEDOR é a assimetria: preço sim, custo não — *"sells at the customer's price
   * table, and never sees what it cost to make"*. É ele que prova que são dois
   * portões e não um com dois nomes.
   *
   * `savePerson` exige `manage_company`, e o comprador não tem: volta ao dono para
   * cadastrar, que é o caminho de uma fábrica de verdade também.
   */
  await setCurrentOperator(null);
  await vestir('salesperson');
  ficha = (await listProducts(CO)).find((p) => p.id === produto.id);
  assert.ok((ficha?.salePriceRate ?? 0) > 0, 'o vendedor vê por quanto sai');
  assert.equal(ficha?.unitPackagingRate, null, 'e não vê o que custa fazer');

  // E o operador, que não vê nenhum dos dois: o número não é do trabalho dele, e a
  // presença dele convida conversa sobre margem no chão de fábrica.
  await setCurrentOperator(null);
  await vestir('operator');
  ficha = (await listProducts(CO)).find((p) => p.id === produto.id);
  assert.equal(ficha?.salePriceRate, null, 'quem embala não vê preço');
  assert.equal(ficha?.unitPackagingRate, null, 'nem custo');

  // E o caminho do livro-razão ignora os dois, como tem de ser: congelar custo e
  // ver custo são perguntas diferentes.
  const paraGravar = (await listProductsForLedger(CO)).find((p) => p.id === produto.id);
  // `!== null` e não `> 0`, e a diferença é a lição do dia: o que este teste
  // afirma é que o PORTÃO não apaga o número no caminho do razão, não que o
  // número seja positivo. Escrito com `> 0`, ele reprovou no dia em que a
  // embalagem virou consumo e a taxa foi legitimamente a zero — reclamando de uma
  // mudança correta, que é o que uma asserção mal escrita faz quando não estraga
  // pior: passar por engano.
  assert.ok(paraGravar, 'o produto existe no caminho do razão');
  assert.notEqual(
    paraGravar.unitPackagingRate,
    null,
    'o razão continua vendo o número, seja ele qual for — congelar custo e ver ' +
      'custo são perguntas diferentes, e só a segunda passa pelo portão',
  );
});

test('the mirror says how much of what a store received came back, against last month', async () => {
  /**
   * A pergunta do Espelho, exercitada por onde ela decide.
   *
   * Duas lojas com o MESMO número de devolução e recebimentos diferentes: sem a
   * fração, as duas parecem iguais e a que devolve um terço passa despercebida ao
   * lado da que devolve um vigésimo. É por isso que a camada devolve a fração e não
   * só o par de totais.
   */
  await ensureStarterData(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Norte', kind: 'own_store' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const agora = '2026-09-30T12:00:00.000Z';
  const dentro = '2026-09-20T12:00:00.000Z';
  const anterior = '2026-08-20T12:00:00.000Z';

  const carga = (para: string, quanto: number, quando: string) =>
    recordTransfer(LOCAL_COMPANY_ID, {
      itemId: acucar.id, fromLocationId: fabrica, toLocationId: para,
      baseUnits: quanto, occurredAt: quando,
    });
  // Nos lugares INVERTIDOS de propósito: a loja é de onde a mercadoria sai.
  const volta = (de: string, quanto: number, quando: string, reason: ReturnReason) =>
    recordReturn(LOCAL_COMPANY_ID, {
      itemId: acucar.id, fromLocationId: de, toLocationId: fabrica,
      baseUnits: quanto, occurredAt: quando, returnReason: reason,
    });

  await carga(centro.id, 3000, dentro);
  await volta(centro.id, 1000, dentro, 'unsold');
  await carga(norte.id, 20000, dentro);
  await volta(norte.id, 1000, dentro, 'melted');

  // O mês anterior, que é o que faz o número de hoje querer dizer alguma coisa.
  await carga(centro.id, 4000, anterior);
  await volta(centro.id, 200, anterior, 'unsold');

  const espelho = await storeMirror(LOCAL_COMPANY_ID, 30, agora);
  assert.equal(espelho.length, 2, 'as duas lojas, e nenhuma sala nossa');

  // A ordem serve para decidir: quem tem o item que mais devolve vem primeiro.
  assert.equal(espelho[0].placeName, 'Loja Centro');
  const centroAcucar = espelho[0].items[0];
  assert.equal(centroAcucar.received, 3000);
  assert.equal(centroAcucar.returned, 1000);
  assert.equal(centroAcucar.baseUnit, 'g', 'a régua vem junto: fração sem régua não se compara');
  assert.ok(Math.abs(centroAcucar.returnShare - 1 / 3) < 1e-9);
  assert.deepEqual(centroAcucar.reasons, [{ reason: 'unsold', baseUnits: 1000 }]);
  // A janela anterior: 200 de 4000, que é 5% — piorou seis vezes, e é ESSA a
  // notícia. Sem a comparação, um terço é só um número grande.
  assert.equal(centroAcucar.before.received, 4000);
  assert.equal(centroAcucar.before.returned, 200);
  assert.ok(Math.abs(centroAcucar.before.returnShare - 0.05) < 1e-9);

  // Mesmo mil de volta, vinte vezes mais recebido: a fração é o que separa as duas.
  assert.equal(espelho[1].placeName, 'Loja Norte');
  const norteAcucar = espelho[1].items[0];
  assert.equal(norteAcucar.returned, 1000);
  assert.ok(Math.abs(norteAcucar.returnShare - 0.05) < 1e-9);
  assert.deepEqual(norteAcucar.before, { received: 0, returned: 0, returnShare: 0 });
});

test('a store that received two rulers keeps two fractions, and never one sum', async () => {
  /**
   * A aritmética que a primeira versão fazia e não podia fazer.
   *
   * O razão conta em unidade-base, e unidade-base é grama para o açúcar e unidade
   * para o picolé. Somar as duas dava um "recebido" que não é de nada — e, pior, o
   * item pesado afogava o leve: mil gramas ao lado de dez picolés faziam a devolução
   * de metade dos picolés aparecer como meio por cento da loja.
   */
  await ensureStarterData(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const itens = await listItems(LOCAL_COMPANY_ID);
  const acucar = itens.find((i) => i.name.includes('Açúcar'));
  const picole = itens.find((i) => i.name.includes('Picolé'));
  assert.ok(acucar && picole);
  const quando = '2026-09-20T12:00:00.000Z';

  for (const [item, quanto] of [[acucar, 1000], [picole, 10]] as const) {
    await recordTransfer(LOCAL_COMPANY_ID, {
      itemId: item.id, fromLocationId: fabrica, toLocationId: centro.id,
      baseUnits: quanto, occurredAt: quando,
    });
  }
  // Metade dos picolés volta. Somada com o açúcar, essa metade viraria 0,5% da loja.
  await recordReturn(LOCAL_COMPANY_ID, {
    itemId: picole.id, fromLocationId: centro.id, toLocationId: fabrica,
    baseUnits: 5, occurredAt: quando, returnReason: 'unsold',
  });

  const [loja] = await storeMirror(LOCAL_COMPANY_ID, 30, '2026-09-30T12:00:00.000Z');
  assert.equal(loja.items.length, 2, 'duas réguas, duas linhas');
  const doce = loja.items.find((x) => x.itemId === picole.id);
  const cristal = loja.items.find((x) => x.itemId === acucar.id);
  assert.ok(doce && cristal);
  assert.ok(Math.abs(doce.returnShare - 0.5) < 1e-9, 'metade continua sendo metade');
  assert.equal(cristal.returnShare, 0, 'e o açúcar não empresta peso a ela');
  assert.equal(loja.items[0].itemId, picole.id, 'o que mais volta vem primeiro');
});

test('a load from one store to another does not count as received on both sides', async () => {
  /**
   * Onde o filtro por SINAL decide, e é o único lugar onde ele decide.
   *
   * Fui escrever que ele separa a perna da fábrica da perna da loja, e isso é falso:
   * a perna da fábrica já sai pela espécie do lugar. O sinal só passa a valer quando
   * as DUAS pernas caem em lugares que recebem carga — uma loja própria mandando para
   * um cliente. Sem ele, a loja que despachou apareceria "recebendo" o que mandou
   * embora, e o Espelho diria que ela recebeu duas vezes o que recebeu.
   *
   * Escrevi a justificativa errada primeiro e só descobri ao perguntar o que uma
   * mutação quebraria. É a regra do dia, de novo: propriedade afirmada é asserção sem
   * teste até o teste existir.
   */
  await ensureStarterData(LOCAL_COMPANY_ID);
  const centro = await savePlace(LOCAL_COMPANY_ID, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);
  const quando = '2026-09-20T12:00:00.000Z';

  const cliente = await savePlace(LOCAL_COMPANY_ID, { name: 'Padaria da Praça', kind: 'customer' });

  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 5000, occurredAt: quando,
  });
  // A loja repassa parte para um cliente: as duas pernas caem em lugares que
  // recebem carga, e é aqui que o sinal é a única coisa que separa quem mandou de
  // quem recebeu.
  await recordTransfer(LOCAL_COMPANY_ID, {
    itemId: acucar.id, fromLocationId: centro.id, toLocationId: cliente.id,
    baseUnits: 2000, occurredAt: quando,
  });
  await recordReturn(LOCAL_COMPANY_ID, {
    itemId: acucar.id, fromLocationId: centro.id, toLocationId: fabrica,
    baseUnits: 500, occurredAt: quando, returnReason: 'expired',
  });

  const espelho = await storeMirror(LOCAL_COMPANY_ID, 30, '2026-09-30T12:00:00.000Z');
  const loja = espelho.find((l) => l.placeId === centro.id);
  const padaria = espelho.find((l) => l.placeId === cliente.id);
  assert.ok(loja && padaria);
  assert.equal(loja.items[0].received, 5000, 'o que ela despachou não é o que ela recebeu');
  assert.equal(loja.items[0].returned, 500);
  assert.equal(padaria.items[0].received, 2000);
  assert.equal(padaria.items[0].returned, 0);
});

test('the first price of an item is not a change, and the second one is', async () => {
  /**
   * A regra que fazia esta função existir, e que nunca tinha sido exercitada.
   *
   * `item_cost_history` grava também o PRIMEIRO preço que um insumo teve. Contar
   * isso como mudança faria a capa dizer que o custo mexeu no dia em que o item foi
   * cadastrado — o dia em que ainda não se sabia nada, não o dia em que algo
   * aconteceu. O docblock dizia isso desde sempre; nenhum teste cobrava.
   *
   * A função estava marcada `Z` na auditoria — *"nenhuma chamadora, nem teste"* —, e
   * é ela que responde "estável há doze dias" na capa. Sem esta linha, a frase mais
   * calma do aplicativo se apoiava em código que ninguém nunca tinha rodado.
   */
  const acucar = await anInput('Açúcar cristal', 25_000);
  assert.equal(
    await lastCostMove(CO, [acucar]),
    null,
    'item recém-cadastrado não teve mudança nenhuma',
  );

  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
    occurredAt: '2026-08-01T12:00:00.000Z',
  });
  assert.equal(
    await lastCostMove(CO, [acucar]),
    null,
    'a PRIMEIRA nota estabelece o preço; ela não o move',
  );

  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(600),
    occurredAt: '2026-08-20T12:00:00.000Z',
  });
  const mexeu = await lastCostMove(CO, [acucar]);
  assert.ok(mexeu, 'a segunda nota com outro preço é uma mudança');

  // E a data é a da NOTA, não a da digitação — `observed_at` segue o `occurredAt`.
  //
  // Escrevi o contrário aqui primeiro, com um comentário inteiro explicando que o
  // relógio era o de "quando se soube". Era falso, e nasceu de um erro meu: eu tinha
  // passado `receivedAt`, campo que não existe. O `tsx` ignora propriedade
  // desconhecida em silêncio, o teste passou, e eu quase registrei como achado uma
  // consequência do meu próprio erro de digitação. Quem desmentiu foi o `typecheck`.
  assert.match(mexeu, /^2026-08-20/, 'a mudança tem a data da nota que a causou');

  // Lista vazia não é "nunca mudou": é pergunta sem sujeito, e a resposta é a mesma
  // sem ir ao banco.
  assert.equal(await lastCostMove(CO, []), null);
});

/**
 * O consumo diário — a metade que faltava para o ponto de recompra existir.
 *
 * `dailyOutflowOf` nasceu ao lado de `runningOut` e não dentro dela, e a
 * diferença é toda a razão de este teste existir: aquela lista **quem está
 * acabando** e por isso DESCARTA quem tem folga. Se a ficha do insumo usasse a
 * primeira, o insumo tranquilo voltaria sem consumo — e é justamente o ponto de
 * recompra DELE que decide se hoje é o dia de comprar. A Lei 4 desta casa manda
 * avisar na data da decisão, e a data da decisão de um item folgado é a única que
 * dá tempo de agir.
 */
test('daily outflow answers for the calm item too, not only the one running out', async () => {
  const acucar = await anInput('Açúcar de teste', 25_000);

  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(400),
    occurredAt: '2026-09-01T09:00:00.000Z',
  });

  // Saíram sete mil ao longo da janela: mil por dia em sete dias.
  await recordCount(CO, {
    locationId: defaultLocationId(CO),
    itemId: acucar,
    countedBaseUnits: 93_000,
    occurredAt: '2026-09-04T09:00:00.000Z',
  });

  const porDia = await dailyOutflowOf(
    CO,
    acucar,
    '2026-09-01T00:00:00.000Z',
    '2026-09-08T00:00:00.000Z',
    7,
  );
  assert.equal(porDia, 1_000, 'sete mil na janela de sete dias é mil por dia');

  /**
   * E zero é resposta LEGÍTIMA, não "não sei".
   *
   * Insumo que ninguém consumiu na janela sai zero por dia, e é isso que faz a
   * cobertura dele ser infinita em vez de desconhecida. A diferença decide a
   * tela: desconhecida se cala, infinita diz "não precisa comprar ainda".
   */
  const parado = await anInput('Insumo parado', 1_000);
  await recordPurchase(CO, {
    itemId: parado,
    purchaseQuantity: 1,
    baseUnits: 1_000,
    totalCents: fromDecimal(10),
    occurredAt: '2026-09-01T09:00:00.000Z',
  });
  assert.equal(
    await dailyOutflowOf(CO, parado, '2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z', 7),
    0,
    'sem saída na janela, o consumo é zero e não nulo',
  );
});

/**
 * O fechamento de período estava correto por acidente — este teste é o que o
 * transforma em regra.
 *
 * Todo saldo deste sistema é uma soma cortada por `occurred_at <= ?`. Então a
 * data que o estorno escreve decide se um mês já lido pode mudar depois. Datar
 * o estorno no dia do erro parece mais correto e é o contrário: o março que o
 * contador leu mudaria em outubro, sem erro, sem log e sem teste vermelho.
 *
 * `reverseGroup` já datava em hoje, porque `occurredAt` é opcional e os dois
 * chamadores de tela o omitem. Nada dizia que era de propósito, e nada
 * reprovava quem "consertasse" isso passando a data original — o defeito mais
 * caro deste repositório é justamente o que compila, passa e mente.
 *
 * Duas pontas, porque só a primeira metade viraria uma regra falsa: o padrão
 * cai em hoje, E o parâmetro explícito continua funcionando, que é como a
 * sincronia reproduz um estorno vindo de outro aparelho.
 */
test('a reversal is dated today, so a closed month stays closed', async () => {
  await ensureStarterData(CO);
  const acucar = (await listItems(CO)).find((i) => i.kind === 'input')!.id;
  const conn = await db();

  const MARCO = '2026-03-10T13:00:00.000Z';
  const FIM_DE_MARCO = '2026-04-01T00:00:00.000Z';

  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
    occurredAt: MARCO,
  });
  // A compra DE MARÇO, escolhida pela data e não pela ordem da lista.
  //
  // A primeira versão pegava "a primeira compra que aparecer", e `itemMovements`
  // devolve do mais novo para o mais velho — então ela pegava uma compra da
  // semeadura, feita hoje, e o teste passava por coincidência de haver poucas.
  // Quando a semeadura ganhou consumo de embalagem a coincidência se desfez.
  // Escolher pelo fato que o teste afirma é o que o mantém dizendo a verdade.
  const grupoDeMarco = (await itemMovements(CO, acucar)).find(
    (m) => m.kind === 'purchase' && m.occurredAt.startsWith('2026-03-10'),
  )?.groupId;
  assert.ok(grupoDeMarco, 'a compra de março carrega o ato de que faz parte');

  const saldoDeMarco = async () => {
    const [linha] = await conn.getAllAsync<{ total: number }>(
      `SELECT COALESCE(SUM(quantity_base_units), 0) AS total FROM movements
        WHERE company_id = ? AND item_id = ? AND occurred_at < ?`,
      [CO, acucar, FIM_DE_MARCO],
    );
    return linha.total;
  };

  const antes = await saldoDeMarco();
  assert.equal(antes, 100_000, 'a compra de março entrou no saldo de março');

  await reverseGroup(CO, { groupId: grupoDeMarco });

  // A ponta que importa: março não se move. O estorno existe, o saldo de hoje
  // já está sem o açúcar, e o número que alguém leu em março continua o mesmo.
  assert.equal(
    await saldoDeMarco(),
    antes,
    'estornar hoje um erro de março não pode mexer no saldo de março — ' +
      'se mexer, todo fechamento de período que alguém já leu é retroativo',
  );

  const [perna] = await conn.getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM movements
      WHERE company_id = ? AND reverses_movement_id IS NOT NULL AND item_id = ?`,
    [CO, acucar],
  );
  assert.ok(perna, 'o estorno gravou uma perna');
  assert.ok(
    perna.occurred_at > FIM_DE_MARCO,
    `a perna do estorno cai em hoje e não na data do erro (veio ${perna.occurred_at})`,
  );

  // E a outra ponta, senão a regra acima viraria "estorno não aceita data" —
  // que é falso e quebraria a sincronia, que reproduz o estorno de outro
  // aparelho com a data em que ele de fato aconteceu lá.
  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 50_000,
    totalCents: fromDecimal(200),
    occurredAt: MARCO,
  });
  const outra = (await itemMovements(CO, acucar)).find(
    (m) => m.kind === 'purchase' && !m.reversed && m.occurredAt.startsWith('2026-03-10'),
  )?.groupId;
  assert.ok(outra, 'a segunda compra ainda não estornada é a que se estorna agora');
  const DITADO = '2026-05-20T09:30:00.000Z';
  await reverseGroup(CO, { groupId: outra, occurredAt: DITADO });

  const pernas = await conn.getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM movements
      WHERE company_id = ? AND reverses_movement_id IS NOT NULL AND item_id = ?
      ORDER BY recorded_at`,
    [CO, acucar],
  );
  assert.equal(
    pernas[pernas.length - 1].occurred_at,
    DITADO,
    'quem passa a data explícita continua sendo obedecido — é o caminho da sincronia',
  );
});

/**
 * O extrato existe porque o caminho de volta estava inalcançável.
 *
 * Nove funções escrevem no razão a partir de tela e o botão de desfazer existia em
 * DUAS. A fundação promete conserto por estorno e nunca por exclusão, e ela estava
 * honrada no banco e fora do alcance de quem erra — e o que uma pessoa faz numa
 * fábrica quando não dá para consertar é parar de registrar.
 *
 * O que este teste prende são as três coisas que fazem o extrato servir para
 * desfazer, e cada uma delas errada produz um defeito diferente:
 *
 * 1. **Um ato é uma linha da tela, não sete.** Uma corrida de produção move sete
 *    movimentos amarrados pelo grupo. Sete linhas na tela seriam sete botões de
 *    estornar para um ato só, e seis deles fariam a coisa errada.
 * 2. **O dinheiro do ato é a soma em MÓDULO.** Somar as sete pernas com sinal daria
 *    quase zero — verdade contábil e mentira na tela, porque o que a pessoa quer
 *    saber é o tamanho do que ela fez.
 * 3. **O estorno aparece, dos dois lados.** O ato desfeito diz que foi, e o
 *    desfazimento aparece como ato próprio — senão o extrato esconde metade da
 *    história, que é a metade que explica a outra.
 */
test('the extract lists ACTS, not lines, and says which ones were undone', async () => {
  await ensureStarterData(CO);
  const [product] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const where = defaultLocationId(CO);

  const corrida = await recordProduction(CO, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const extrato = await ledgerExtract(CO);
  const ato = extrato.find((a) => a.groupId === corrida.groupId);
  assert.ok(ato, 'a corrida aparece no extrato como UM ato');
  assert.ok(
    ato.lines > 1,
    `a corrida amarrou ${ato.lines} linha(s) — se for uma, o grupo não está sendo lido`,
  );
  assert.equal(ato.kind, 'production');
  assert.equal(ato.reversed, false, 'ainda não foi desfeita');
  assert.equal(ato.isReversal, false, 'ela não desfaz ninguém');
  /**
   * O dinheiro do ato é UM LADO, e este número foi visto errado numa foto.
   *
   * A primeira versão somava todas as pernas em módulo e uma corrida de 506
   * picolés apareceu na tela por R$ 625,27, quando o que saiu do tacho valia
   * R$ 323,84. A conta fechava e não queria dizer nada: produção CONVERTE insumo
   * em produto, então o mesmo dinheiro era contado duas vezes — uma saindo como
   * polpa e açúcar, outra entrando como picolé.
   *
   * Somar com sinal daria quase zero (verdade contábil, mentira na tela). Somar em
   * módulo dobra. O que sobra e é honesto: as pernas que ENTRAM.
   */
  // Uma corrida só: a média do item É a taxa congelada dela.
  const custoUnitario = await custoDe(product.itemId);
  assert.ok(custoUnitario > 0, 'a corrida congelou um custo por unidade');
  const oQueSaiuDoTacho = amountOf(custoUnitario as Rate, 500);
  assert.equal(
    ato.valueCents,
    oQueSaiuDoTacho,
    `o ato vale o que ele PRODUZIU (${oQueSaiuDoTacho}), não a produção mais o ` +
      `consumo (${ato.valueCents}) — o mesmo dinheiro contado duas vezes`,
  );

  // E ela aparece UMA vez, não uma por perna.
  assert.equal(
    extrato.filter((a) => a.groupId === corrida.groupId).length,
    1,
    'sete linhas viram um ato; sete atos seriam sete botões de estornar para um ato só',
  );

  await reverseGroup(CO, { groupId: corrida.groupId });

  const depois = await ledgerExtract(CO);
  const desfeita = depois.find((a) => a.groupId === corrida.groupId);
  assert.equal(desfeita?.reversed, true, 'o ato desfeito diz que foi');
  const correcao = depois.find((a) => a.isReversal);
  assert.ok(
    correcao,
    'e o desfazimento aparece como ato próprio — sem ele o extrato esconde a metade que explica a outra',
  );

  /**
   * O estorno diz correção DE QUÊ, e este é o defeito que a tela mostrou.
   *
   * A perna de estorno carrega a espécie dela própria — `reversal` — e a tela
   * escrevia "Correção de Correção": verdadeiro e inútil, dizendo duas vezes que
   * era uma correção e nunca dizendo de quê, que é a única coisa que alguém quer
   * saber ao ver uma no extrato.
   *
   * O teste prende porque a asserção óbvia (`isReversal === true`) já passava com
   * o defeito na tela: o dado estava certo e a leitura dele é que faltava.
   */
  assert.equal(
    correcao.reversesKind,
    'production',
    'o estorno de uma corrida sabe que corrige uma PRODUÇÃO — sem isso a tela ' +
      'escreve "Correção de Correção", que é verdade e não informa nada',
  );
});

/**
 * O corte por data é o fechamento de período, e ele tem de valer nas duas pontas.
 *
 * `to` é EXCLUSIVO de propósito: um período fecha em "antes de 1º de abril", não em
 * "até 31 de março às 23:59:59,999" — a segunda forma perde o que aconteceu no
 * último milésimo do mês, e ninguém descobre.
 */
test('the extract cuts by date on both ends, and the end is exclusive', async () => {
  await ensureStarterData(CO);
  const acucar = (await listItems(CO)).find((i) => i.kind === 'input')!.id;

  await recordPurchase(CO, {
    itemId: acucar, purchaseQuantity: 1, baseUnits: 1000,
    totalCents: fromDecimal(10), occurredAt: '2026-03-10T12:00:00.000Z',
  });
  await recordPurchase(CO, {
    itemId: acucar, purchaseQuantity: 1, baseUnits: 2000,
    totalCents: fromDecimal(20), occurredAt: '2026-04-01T00:00:00.000Z',
  });

  const marco = await ledgerExtract(CO, {
    from: '2026-03-01T00:00:00.000Z',
    to: '2026-04-01T00:00:00.000Z',
  });
  const datas = marco.map((a) => a.occurredAt);
  assert.ok(
    datas.some((d) => d.startsWith('2026-03-10')),
    'o que aconteceu dentro do período está lá',
  );
  assert.ok(
    !datas.some((d) => d.startsWith('2026-04-01')),
    'e o que aconteceu no instante do corte NÃO está: o fim é exclusivo, senão um ' +
      'período fecha em 23:59:59,999 e perde o último milésimo sem ninguém descobrir',
  );
});

/**
 * O dinheiro não existe sem o portão — e não existe mesmo, não vem zerado.
 *
 * A fundação é *"permissão mora na consulta, nunca numa instrução"*: a checagem roda
 * ANTES do SELECT, então a taxa nem é selecionada. Zero seria pior que nulo, porque
 * zero é um número e alguém somaria.
 */
test('without the money gate the extract has no money at all, not zero', async () => {
  await ensureStarterData(CO);
  const [product] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  await recordProduction(CO, {
    productId: product.id,
    locationId: defaultLocationId(CO),
    batches: 1,
    unitsProduced: 100,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // Vestir o operador é escolher uma PESSOA com o perfil dele — o portão lê quem
  // está com o aparelho, não um papel global. É o mesmo caminho que a tela usa.
  const perfis = await listProfiles(CO);
  const operador = perfis.find((p) => p.templateRole === 'operator');
  assert.ok(operador, 'operator é um dos modelos prontos');
  const quem = await savePerson(CO, { name: 'Quem opera', profileId: operador.id });
  await setCurrentOperator(quem.id);

  const semDinheiro = await ledgerExtract(CO);
  assert.ok(semDinheiro.length > 0, 'o operador vê os atos');
  assert.ok(
    semDinheiro.every((a) => a.valueCents === null),
    'e não vê valor nenhum — nulo, não zero: zero é um número, e número alguém soma',
  );

  await setCurrentOperator(null);
});

/**
 * O palito sai do estoque quando o picolé sai do tacho.
 *
 * **O exemplo semeado demonstrava o defeito que o código conserta.** O seed
 * comprava palito e embalagem, cobrava cinco centavos por unidade como
 * `unitPackagingRate`, e deixava `packagingItems` vazia — então o dinheiro ficava
 * certo (a taxa congelada carrega a embalagem) e o estoque mentia: **o palito só
 * subia, corrida após corrida.** É palavra por palavra a cicatriz escrita no laço
 * de `recordProduction` que existe para consertá-la.
 *
 * Ninguém viu porque nenhum teste olhava. A conta do dinheiro fechava, a produção
 * gravava, o saldo dos insumos baixava — e uma fábrica de verdade só descobriria
 * no inventário, ao achar dez mil palitos onde deviam estar nove mil e poucos.
 *
 * O teste prende as DUAS coisas, e a segunda é a que garante que o conserto não
 * cobrou duas vezes: a embalagem sai do estoque, **e o custo por unidade não
 * mudou** — porque ela sempre esteve na taxa congelada, agora pelo caminho do
 * consumo em vez do da taxa fixa.
 */
test('a run takes the stick out of stock, and the unit cost does not move', async () => {
  await ensureStarterData(CO);
  const conn = await db();
  const embalagens = await conn.getAllAsync<{ id: string; name: string }>(
    `SELECT id, name FROM items WHERE company_id = ? AND kind = 'packaging' ORDER BY name`,
    [CO],
  );
  assert.ok(embalagens.length >= 2, 'o exemplo tem palito e embalagem');

  const saldo = async (itemId: string) => {
    const l = await conn.getFirstAsync<{ s: number }>(
      `SELECT COALESCE(SUM(quantity_base_units), 0) AS s FROM movements WHERE company_id = ? AND item_id = ?`,
      [CO, itemId],
    );
    return l?.s ?? 0;
  };

  const antes = new Map<string, number>();
  for (const e of embalagens) antes.set(e.id, await saldo(e.id));

  const [product] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const UNIDADES = 506;
  await recordProduction(CO, {
    productId: product.id,
    locationId: defaultLocationId(CO),
    batches: 1,
    unitsProduced: UNIDADES,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  for (const e of embalagens) {
    assert.equal(
      await saldo(e.id),
      (antes.get(e.id) ?? 0) - UNIDADES,
      `${e.name}: um picolé gasta uma unidade, e rendimento não devolve palito — ` +
        'sem isto o estoque de embalagem só cresce e a fábrica descobre no inventário',
    );
  }

  // E o dinheiro não se mexeu: a embalagem sempre esteve na taxa congelada, e o
  // conserto trocou o CAMINHO dela, não o valor. Se tivesse cobrado duas vezes,
  // este número teria subido.
  const custo = await custoDe(product.itemId);
  const [ato] = await ledgerExtract(CO, { limit: 1 });
  assert.equal(
    ato.valueCents,
    amountOf(custo as Rate, UNIDADES),
    'o valor do ato continua sendo o que saiu do tacho pela taxa congelada — ' +
      'embalagem contada uma vez, pelo consumo',
  );
});

/**
 * O extrato do cliente: o que a loja recebeu e devolveu, e nada mais.
 *
 * É o mesmo extrato virado para fora, e ele existe porque disputa de loja se
 * resolve com fato: *"vocês mandaram mesmo isso?"* tem resposta no razão, e ela
 * hoje só era alcançável rolando o extrato inteiro da fábrica.
 *
 * **A decisão fina está na segunda metade deste teste.** Uma remessa escreve duas
 * pernas — negativa na fábrica, positiva na loja — e seria tentador recortar o ato
 * pelo lugar, mostrando só a perna dela. Isso mudaria a contagem de linhas e o
 * valor conforme quem olha, e um extrato que muda de número dependendo de quem
 * abre é exatamente a coisa que ele existe para não ser. Então o lugar escolhe
 * QUAIS atos aparecem; cada ato continua sendo o do razão inteiro.
 */
test('the customer extract shows that place, and the act keeps its own numbers', async () => {
  await ensureStarterData(CO);
  const [product] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(CO);
  await recordProduction(CO, {
    productId: product.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const loja = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  await recordTransfer(CO, {
    itemId: product.itemId,
    fromLocationId: fabrica,
    toLocationId: loja.id,
    baseUnits: 200,
  });

  const daLoja = await ledgerExtract(CO, { placeId: loja.id });
  assert.equal(daLoja.length, 1, 'a loja viu UM ato: a carga que chegou nela');
  assert.equal(daLoja[0].kind, 'transfer');

  // A produção e as compras não são dela, e não aparecem. Sem isto o "extrato do
  // cliente" seria o extrato da fábrica com outro título.
  const daFabrica = await ledgerExtract(CO, { placeId: fabrica });
  assert.ok(
    daFabrica.length > daLoja.length,
    `a fábrica tem mais atos que a loja (${daFabrica.length} contra ${daLoja.length})`,
  );
  assert.ok(
    daFabrica.some((a) => a.kind === 'production'),
    'a produção é da fábrica',
  );

  // E o ato é O MESMO dos dois lados: mesmas linhas, mesmo valor. Recortar pelo
  // lugar faria a loja e a fábrica lerem números diferentes do mesmo fato, e é
  // isso que transforma um extrato em objeto de disputa em vez de prova dela.
  const daquiTambem = (await ledgerExtract(CO)).find((a) => a.groupId === daLoja[0].groupId);
  assert.ok(daquiTambem);
  assert.equal(daLoja[0].lines, daquiTambem.lines, 'o mesmo ato tem as mesmas linhas dos dois lados');
  assert.equal(daLoja[0].valueCents, daquiTambem.valueCents, 'e o mesmo valor');
});
