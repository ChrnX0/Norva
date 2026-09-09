import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { fromDecimal, rate, amountOf, type Rate} from '@/domain/money';
import { dayWindow, localDate } from '@/domain/day';
import { costRecipe } from '@/domain/recipe';
import { CARGO_PLACE_KINDS, INTERNAL_PLACE_KINDS, type ReturnReason } from '@/domain/ledger';
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
  listCarriers,
  saveCarrier,
  saveFlavor,
  saveLine,
  saveType,
  SemPermissaoError,
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
  consumoDaProducao,
  savePlace,
  setConsumoDaProducao,
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
  countMovements,
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
  setEraseGraceDays,
  setPurchaseSafetyDays,
  setOrdersNeedApproval,
} from './repository';
import { EraseBlockedError, tallyFor } from './erase';
import { markSent, pendingCount, pendingEntries, forgetSentBefore } from './outbox';
import { serialize } from '../sync/serialize';
import { ensureStarterData, exampleStillHere, hasSeeded } from './seed';
import { EMPRESA_SEMENTE } from './empresa';

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

const CO = EMPRESA_SEMENTE;

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
  /**
   * O custo da sub-receita entra pelo VALOR, e não só por existir.
   *
   * Aqui estava `assert.ok(cost.batchCents > 0, 'the sub-recipe carried its cost
   * up')` — e qualquer valor positivo satisfaz isso. Um defeito que trouxesse metade
   * do custo da Base passaria verde, com a mensagem certa escrita ao lado. É o mesmo
   * par explicação-certa-checagem-vazia que este repositório já pagou uma vez no
   * extrato, e a regra que saiu de lá é: **asserção sobre número calculado é
   * igualdade contra outra fonte.**
   *
   * A outra fonte aqui é a própria Base, custeada pelo mesmo motor: o Sabor usa
   * 10.000 dos 20.000 ml que ela rende, então carrega exatamente metade do lote dela.
   *
   * E a igualdade prova uma SEGUNDA coisa de graça: a perda de 5% do Sabor não
   * reduziu o custo do lote. Quem perde perde o que sobra — o lote é pago inteiro —,
   * e um motor que descontasse a perda aqui daria 672 em vez de 708.
   */
  const daBase = costRecipe(
    base.recipeId,
    await loadRecipeGraph(CO),
    await averageRatesForLedger(CO),
    await labels(CO),
  );
  assert.equal(cost.batchCents, daBase.batchCents / 2);
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

/**
 * O Reset é do dono — e antes de 9 de setembro não era de ninguém.
 *
 * A decisão de 7 de setembro restringe este ato por nome: *"obviamente q apenas o adm
 * pode fazer isso"*. O código não conferia nada, então o celular emprestado — que esta
 * mesma casa limita a produção e nada mais — apagava o livro inteiro em dois toques.
 * Três fatias independentes da auditoria acharam isto sozinhas.
 *
 * Os dois lados na mesma prova, que é a regra da casa para guarda nova: o operador é
 * recusado e NADA some; quem administra continua apagando.
 */
test('quem não administra a empresa não apaga o livro dela', async () => {
  await ensureStarterData(CO);
  const antes = (await listItems(CO)).length;
  assert.ok(antes > 0, 'o exemplo chega com insumo');

  const operador = (await listProfiles(CO)).find((p) => p.templateRole === 'operator');
  assert.ok(operador, 'o operador é um dos sete modelos');
  const ana = await savePerson(CO, { name: 'Ana', profileId: operador.id });
  await setCurrentOperator(ana.id);

  await assert.rejects(
    () => eraseArea(CO, 'all'),
    /sem manage_company/,
    'o celular emprestado não apaga o livro',
  );
  assert.equal(
    (await listItems(CO)).length,
    antes,
    'e a recusa não apagou nada — o portão vem antes da transação',
  );

  // O caso verdadeiro: quem administra continua apagando, senão a guarda estaria
  // medindo "eraseArea sempre falha" em vez de "eraseArea confere quem pede".
  await setCurrentOperator(null);
  await eraseArea(CO, 'all');
  assert.equal((await listItems(CO)).length, 0, 'quem administra apaga');
});

/**
 * Os cinco interruptores da empresa, e os DOIS que decidem o piso.
 *
 * `pisoDoAparelho` rebaixa o aparelho a `operator` quando a entrada é compartilhada e
 * o app nomeia quem gravou. Os dois interruptores que produzem esse estado não
 * conferiam nada: quem o piso rebaixava desligava o piso e voltava com o conjunto do
 * dono — durável, sem PIN e sem rastro. Dois toques.
 */
test('quem o piso rebaixa não mexe nos interruptores da empresa', async () => {
  await ensureStarterData(CO);

  const operador = (await listProfiles(CO)).find((p) => p.templateRole === 'operator');
  assert.ok(operador);
  const ana = await savePerson(CO, { name: 'Ana', profileId: operador.id });
  await setCurrentOperator(ana.id);

  for (const [nome, chamar] of [
    ['nomeia quem gravou', () => setNamesWhoRecorded(CO, true)],
    ['entrada do chão de fábrica', () => setFloorSignIn(CO, 'shared')],
    ['pedido espera aprovação', () => setOrdersNeedApproval(CO, true)],
    ['folga de compra', () => setPurchaseSafetyDays(CO, 9)],
    ['prazo de destruição', () => setEraseGraceDays(CO, 0)],
  ] as const) {
    await assert.rejects(chamar, /sem manage_company/, nome + ': o operador não muda');
  }
  assert.equal(await namesWhoRecorded(), false, 'e nenhuma recusa escreveu');
  assert.equal(await floorSignIn(), 'personal');

  // O caso verdadeiro, sem o qual a guarda mediria "estes setters sempre falham".
  await setCurrentOperator(null);
  await setOrdersNeedApproval(CO, true);
  assert.equal(await ordersNeedApproval(), true, 'quem administra muda');
});

/**
 * Anotar pedido não tinha portão no aparelho — e o servidor tem.
 *
 * As sete escritas do razão passam por `podeGravar` e cinco portas de cadastro
 * exigem `manage_company`; `saveOrder` e `setOrderStatus` não conferiam nada. A
 * política `orders_place` exige `place_order` desde a fundação: quem anotasse um
 * pedido num aparelho de operador via a tela dizer que deu certo, e a fila daquele
 * celular parava na linha recusada — calada, com tudo o que a fábrica gravasse
 * depois preso atrás. É o mesmo formato do estorno que custou a rodada de 9/9.
 *
 * A capacidade cobrada é a DO SERVIDOR, não uma escolhida aqui: duas listas para a
 * mesma pergunta é como duas verdades nascem.
 */
test('quem não pode pedir não anota pedido, e quem não aprova não tira do pendente', async () => {
  await ensureStarterData(CO);
  const loja = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const [item] = await listItems(CO);

  const operador = (await listProfiles(CO)).find((p) => p.templateRole === 'operator');
  assert.ok(operador, 'o operador é um dos sete modelos');
  assert.ok(
    !operador.capabilities.includes('place_order'),
    'e a decisão do dono sobre aparelho emprestado é "produção e nada mais"',
  );
  const ana = await savePerson(CO, { name: 'Ana', profileId: operador.id });
  await setCurrentOperator(ana.id);

  await assert.rejects(
    () =>
      saveOrder(CO, {
        placeId: loja.id,
        lines: [{ itemId: item.id, baseUnits: 100 }],
      }),
    /place_order/,
    'o aparelho recusa ANTES de a linha nascer — depois seria uma fila que não anda',
  );

  // O caso verdadeiro: quem administra pede, senão a guarda mediria "saveOrder
  // sempre falha" em vez de "saveOrder confere quem pede".
  await setCurrentOperator(null);
  await setOrdersNeedApproval(CO, true);
  const pedido = await saveOrder(CO, {
    placeId: loja.id,
    lines: [{ itemId: item.id, baseUnits: 100 }],
  });
  assert.equal(pedido.status, 'pending', 'a empresa pediu aprovação, então ele nasce pendente');

  // E aprovar é a outra pergunta: o operador não tira do pendente.
  await setCurrentOperator(ana.id);
  await assert.rejects(
    () => setOrderStatus(CO, pedido.id, 'open'),
    /approve_order/,
    'aprovar o próprio pedido seria furar a configuração que a empresa ligou',
  );

  await setCurrentOperator(null);
  await setOrderStatus(CO, pedido.id, 'open');
  const [depois] = (await listOrders(CO, ['open'])).filter((o) => o.id === pedido.id);
  assert.ok(depois, 'quem aprova, aprova');
});

/**
 * A corrida aberta nasce ONDE O TACHO ESTÁ — e nascia sempre na primeira unidade.
 *
 * `openProductionRun` carimbava `ensureLocation`, que devolve o lugar padrão da
 * empresa. Os três leitores recortam por unidade, então no celular da segunda
 * fábrica "Começar agora" abria uma corrida invisível: sem cartão no dia, sem
 * "Fechar", sem "Cancelar". E quem a fechasse do outro lado punha o picolé no
 * estoque da cidade errada, com o consumo saindo das salas de lá — `location_id`
 * de linha que já subiu não se corrige, porque o razão é imutável por gatilho.
 *
 * Os dois lados: a corrida aparece na unidade que a abriu, e NÃO aparece na outra.
 */
test('a corrida aberta nasce na unidade do aparelho, não na primeira da empresa', async () => {
  await ensureStarterData(CO);
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const primeira = defaultLocationId(CO);
  const segunda = await savePlace(CO, { name: 'Fábrica Marília', kind: 'factory' });

  const corrida = await openProductionRun(CO, {
    productId: produto.id,
    batches: 1,
    locationId: segunda.id,
  });
  assert.equal(corrida.locationId, segunda.id);

  const emMarilia = await openProductionRuns(CO, { unidade: segunda.id });
  assert.equal(emMarilia.length, 1, 'o celular que abriu a corrida enxerga a corrida');
  assert.equal(emMarilia[0].id, corrida.id);

  const naPrimeira = await openProductionRuns(CO, { unidade: primeira });
  assert.equal(naPrimeira.length, 0, 'e a outra unidade não vê o tacho da vizinha');

  // Sem dizer onde, continua caindo no padrão — que é o certo para a fábrica de
  // uma unidade só, e é o que impede esta guarda de medir "sempre usa o argumento".
  const semDizer = await openProductionRun(CO, { productId: produto.id, batches: 1 });
  assert.equal(semDizer.locationId, primeira);
});

/**
 * Duas notas no MESMO instante — e a última é a última, sempre.
 *
 * `recomputeItemCost` replaya o razão em ordem, e o último desempate era `m.id`: um
 * uuid. Enquanto ela só rodava no estorno isso quase nunca aparecia; desde que ela
 * virou a única autora de `item_costs`, ela decide o `last_rate` de toda compra, e
 * um teste de dinheiro passou a falhar uma vez a cada tantas — que é como um defeito
 * de ordenação se anuncia, e é a pior forma, porque parece flake.
 *
 * Vinte voltas: com o desempate por `rowid` (a ordem em que as linhas entraram neste
 * aparelho) a resposta é a mesma nas vinte. Com `id`, o sorteio aparece.
 */
test('duas notas no mesmo instante deixam a SEGUNDA como último preço, sempre', async () => {
  await ensureStarterData(CO);
  const instante = '2026-12-01T09:00:00.000Z';

  // Vinte itens, cada um com duas notas no MESMO instante. Vinte sorteios: com o
  // desempate por `rowid` a resposta é a segunda nota nas vinte; com `id`, o uuid
  // decide e a falha aparece uma vez a cada tantas — que é a pior forma de um
  // defeito de ordenação se anunciar, porque parece flake.
  for (let volta = 0; volta < 20; volta += 1) {
    const item = await saveItem(CO, {
      kind: 'input',
      name: `Insumo ${volta}`,
      purchaseUnit: 'saco',
      purchaseToBase: 10_000,
      baseUnit: 'g',
      packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
    });

    await recordPurchase(CO, {
      itemId: item,
      purchaseQuantity: 1,
      baseUnits: 10_000,
      totalCents: fromDecimal(100),
      occurredAt: instante,
    });
    await recordPurchase(CO, {
      itemId: item,
      purchaseQuantity: 1,
      baseUnits: 10_000,
      totalCents: fromDecimal(300),
      occurredAt: instante,
    });

    const [linha] = (await listItems(CO)).filter((i) => i.id === item);
    assert.ok(
      Math.abs((linha.lastRate ?? 0) - 3) < 1e-9,
      `volta ${volta}: o último preço veio ${linha.lastRate}, e a segunda nota é 3 centavos por grama`,
    );
  }
});

/**
 * A perda lançada NA LOJA aparece — e não aparecia em nenhuma das quatro leituras.
 *
 * `savePlace` deixa o pai nulo para loja e veículo por decisão escrita: uma loja não
 * fica *dentro* de uma fábrica. Todo recorte de unidade as deixa de fora, o que é o
 * certo para SALDO — mil picolés numa loja não atendem quem pediu na fábrica — e é
 * errado para perda.
 *
 * E a própria tela provocava o dado que depois escondia: a confirmação da venda
 * termina em *"Derreteu alguma parte? Lance a perda antes de contar"*. A pessoa
 * lançava, e a página de perdas dizia "Nenhuma perda registrada". Um dado que o app
 * pediu e depois some é o jeito mais rápido de ensinar a não registrar.
 *
 * Os dois lados: a perda da loja entra no recorte da perda, e NÃO entra no recorte
 * do saldo — senão o conserto teria trocado um defeito por outro.
 */
test('a perda lançada na loja entra na conta de perdas, e não na de saldo', async () => {
  await ensureStarterData(CO);
  const loja = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(CO);
  const [item] = (await listItems(CO)).filter((i) => /ú?car/i.test(i.name));

  await recordTransfer(CO, {
    itemId: item.id, fromLocationId: fabrica, toLocationId: loja.id,
    baseUnits: 2000, occurredAt: '2026-09-01T10:00:00.000Z',
  });
  await recordLoss(CO, {
    itemId: item.id,
    locationId: loja.id,
    baseUnits: 500,
    reason: 'melted',
    occurredAt: '2026-09-01T15:00:00.000Z',
  });

  const de = '2026-09-01T00:00:00.000Z';
  const ate = '2026-09-02T00:00:00.000Z';

  const soDaUnidade = await lossesOn(CO, de, ate, { unidade: fabrica });
  assert.deepEqual(
    soDaUnidade,
    [],
    'o recorte de unidade não alcança a loja — é isso que escondia a perda',
  );

  const comAsDeFora = await lossesOn(CO, de, ate, { unidade: fabrica, nossasDeFora: true });
  assert.equal(comAsDeFora.length, 1, 'a perda do balcão aparece');
  assert.equal(comAsDeFora[0].baseUnits, 500);

  // E o SALDO continua sem a loja: incluí-la aqui faria "quanto dá para prometer"
  // contar mercadoria que já está a dez quilômetros.
  const naUnidade = (await listItems(CO, undefined, false, { unidade: fabrica })).find(
    (i) => i.id === item.id,
  );
  const naEmpresa = (await listItems(CO)).find((i) => i.id === item.id);
  assert.ok(naUnidade && naEmpresa);
  assert.ok(
    naUnidade.onHandBaseUnits < naEmpresa.onHandBaseUnits,
    'o que está na loja não entra no saldo da unidade',
  );
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
  await ensureStarterData(EMPRESA_SEMENTE);

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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));

  await recordPurchase(EMPRESA_SEMENTE, {
    itemId: sugar.id,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
    assistantPhrase: 'comprei 1 saco de açúcar por 118',
  });
  await recordPurchase(EMPRESA_SEMENTE, {
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const graph = await loadRecipeGraph(EMPRESA_SEMENTE);
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const storeroom = defaultLocationId(EMPRESA_SEMENTE);

  // A second place, which is what the cold room will be.
  const coldRoom = 'cold-room-for-this-test';
  await live.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at) VALUES (?, ?, ?, 'cold_room', ?)`,
    [coldRoom, EMPRESA_SEMENTE, 'Câmara', '2026-09-01T00:00:00Z'],
  );
  await live.runAsync(
    `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                            quantity_base_units, location_id)
     VALUES ('m-cold', ?, 'transfer', ?, ?, ?, 4000, ?)`,
    [EMPRESA_SEMENTE, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', sugar.id, coldRoom],
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
  const counted = await recordCount(EMPRESA_SEMENTE, {
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const before = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === sugar.id);

  const cold = 'cold-room-split';
  await live.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at) VALUES (?, ?, 'Câmara', 'cold_room', ?)`,
    [cold, EMPRESA_SEMENTE, '2026-09-01T00:00:00Z'],
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
      EMPRESA_SEMENTE, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', sugar.id,
      defaultLocationId(EMPRESA_SEMENTE), cold,
      EMPRESA_SEMENTE, '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z', sugar.id,
      cold, defaultLocationId(EMPRESA_SEMENTE),
    ],
  );

  const places = await balanceByLocation(EMPRESA_SEMENTE, sugar.id);
  const inCold = places.find((p) => p.locationId === cold);
  const inStoreroom = places.find((p) => p.locationId === defaultLocationId(EMPRESA_SEMENTE));

  assert.equal(inCold?.baseUnits, 6000, 'the six kilos are in the cold room');
  assert.equal(inCold?.kind, 'cold_room');
  assert.ok(inStoreroom && inStoreroom.baseUnits > 0, 'the storeroom still holds the rest');

  // Two legs, one act: the company has exactly as much sugar as before.
  const after = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === sugar.id);
  assert.equal(after?.onHandBaseUnits, before?.onHandBaseUnits);
  assert.equal(
    (inCold?.baseUnits ?? 0) + (inStoreroom?.baseUnits ?? 0),
    after?.onHandBaseUnits,
    'the places add up to the company - that is what makes both queries one arithmetic',
  );
});

test('what went out is grouped by where it landed, in the units each item has', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Norte', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);

  const items = await listItems(EMPRESA_SEMENTE);
  const acucar = items.find((i) => i.name.includes('Açúcar'));
  const polpa = items.find((i) => i.name.includes('Polpa'));
  assert.ok(acucar && polpa, 'o exemplo semeado tem os dois insumos');

  const quando = '2026-09-01T14:00:00.000Z';
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 6000,
    occurredAt: quando,
  });
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: polpa.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 4000,
    occurredAt: quando,
  });
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: norte.id,
    baseUnits: 2000,
    occurredAt: quando,
  });

  const dia = await shipmentsOn(
    EMPRESA_SEMENTE,
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);
  const antes = acucar.onHandBaseUnits;

  const perdido = await recordLoss(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    baseUnits: 4000,
    reason: 'expired',
    occurredAt: '2026-09-01T10:00:00.000Z',
  });

  assert.equal(perdido.baseUnits, 4000);

  // Saiu do saldo, e a linha guarda o motivo - que é o que separa "sumiram
  // quatro quilos" de "quatro quilos venceram", e só a segunda muda uma
  // decisão.
  const depois = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === acucar.id);
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  // Mesmo piso da produção, no mesmo lugar: antes da escrita. Uma perda maior
  // que o saldo seria um saldo negativo que ninguém conseguiria explicar - e
  // corrigir isso num livro-razão append-only custa estorno.
  await assert.rejects(
    recordLoss(EMPRESA_SEMENTE, {
      itemId: acucar.id,
      baseUnits: acucar.onHandBaseUnits + 1,
      reason: 'melted',
    }),
    (e) => e instanceof NotEnoughStockError,
  );

  // E uma perda de nada não é uma perda.
  await assert.rejects(
    recordLoss(EMPRESA_SEMENTE, { itemId: acucar.id, baseUnits: 0, reason: 'broken' }),
  );
});

test('the lot says which sheet ran, and correcting the sheet later does not rewrite it', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  // A versão que estava valendo no dia da corrida.
  const antes = (await loadRecipeGraph(EMPRESA_SEMENTE))[product.recipeId!];
  assert.equal(antes.version, 1);

  const feito = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  const lote = await findLot(EMPRESA_SEMENTE, feito.lot.id);
  assert.equal(lote?.recipeVersion, 1, 'o lote carimba a versão que rodou');
  assert.equal(lote?.recipeName, 'Picolé de morango');

  // Agora a fórmula é corrigida: nasce a versão 2, e ela passa a ser a que a
  // fábrica usa daqui em diante.
  const corrigida = await saveRecipeVersion(EMPRESA_SEMENTE, {
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
  const depois = await findLot(EMPRESA_SEMENTE, feito.lot.id);
  assert.equal(depois?.recipeVersion, 1, 'a ficha de ontem não vira a de hoje');

  // E a corrida aberta grava a VERSÃO na coluna da versão, que é o que ela diz
  // guardar: aqui entrava o id da RECEITA, um uuid legítimo na coluna errada.
  const corrida = await openProductionRun(EMPRESA_SEMENTE, { productId: product.id, batches: 1 });
  assert.notEqual(corrida.recipeVersionId, product.recipeId, 'não é o id da receita');
  const agora = (await loadRecipeGraph(EMPRESA_SEMENTE))[product.recipeId!];
  assert.equal(corrida.recipeVersionId, agora.versionId, 'é o id da versão que está valendo');

  // E o que foi GRAVADO, lido de volta — não o que a função devolveu.
  //
  // **Esta é a diferença que deixou a mutação passar.** O teste acima confere o
  // objeto de retorno, que é montado à parte; a mutação trocava o parâmetro do
  // INSERT por \`product.recipeId\` e o retorno continuava certo. Um uuid legítimo
  // na coluna errada, invisível até o dia em que alguém perguntasse qual ficha
  // rodou — que é literalmente o defeito que esta linha existe para impedir.
  const gravada = (await openProductionRuns(EMPRESA_SEMENTE)).find((r) => r.id === corrida.id);
  assert.ok(gravada, 'a corrida aberta tem que ser encontrável de volta');
  assert.equal(
    gravada.recipeVersionId,
    agora.versionId,
    'a coluna recipe_version_id guarda a VERSÃO; o id da receita ali é a fórmula de hoje respondendo pela de ontem',
  );
  assert.notEqual(gravada.recipeVersionId, product.recipeId);
});

test('an open run is state: the ledger does not know it until it closes', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const antes = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');

  const corrida = await openProductionRun(EMPRESA_SEMENTE, { productId: product.id, batches: 1 });
  assert.equal((await openProductionRuns(EMPRESA_SEMENTE)).length, 1);

  // Abrir não move nada: nenhuma linha nova no razão, nenhum insumo baixado.
  const depoisDeAbrir = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');
  assert.equal(depoisDeAbrir?.n, antes?.n);

  const fechada = await closeProductionRun(EMPRESA_SEMENTE, {
    runId: corrida.id,
    unitsProduced: 480,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // Agora sim, e o id da corrida é o grupo das linhas: a corrida sai da tabela
  // e o nome dela fica no livro-razão.
  assert.equal((await openProductionRuns(EMPRESA_SEMENTE)).length, 0);
  const linhas = await live.getAllAsync<{ n: number }>(
    'SELECT id FROM movements WHERE movement_group_id = ?',
    [fechada.groupId],
  );
  assert.ok(linhas.length >= 3, 'produção mais consumo, no mesmo grupo');
});

test('a cancelled run leaves nothing to reverse', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const antes = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');

  const corrida = await openProductionRun(EMPRESA_SEMENTE, { productId: product.id, batches: 1 });
  await cancelProductionRun(EMPRESA_SEMENTE, corrida.id);

  // É a razão inteira de a corrida ser estado e não movimento: cancelar não
  // precisa de estorno porque nunca houve lançamento.
  assert.equal((await openProductionRuns(EMPRESA_SEMENTE)).length, 0);
  const depois = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movements');
  assert.equal(depois?.n, antes?.n);

  // E cancelar de novo não é erro: o pedido já estava cumprido.
  await cancelProductionRun(EMPRESA_SEMENTE, corrida.id);
});

test('two taps on close do not produce twice', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const corrida = await openProductionRun(EMPRESA_SEMENTE, { productId: product.id, batches: 1 });

  await closeProductionRun(EMPRESA_SEMENTE, { runId: corrida.id, unitsProduced: 480, producedOn: localDate(nowIso(), 'America/Sao_Paulo') });

  // Dedo tremido na doca, ou a tela que não atualizou: a segunda tentativa não
  // acha a corrida e para ANTES de escrever, em vez de baixar o insumo duas
  // vezes.
  await assert.rejects(
    closeProductionRun(EMPRESA_SEMENTE, { runId: corrida.id, unitsProduced: 480, producedOn: localDate(nowIso(), 'America/Sao_Paulo') }),
    (e) => e instanceof RunGoneError,
  );
});

test('a run that cannot close stays open, instead of being lost', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  // Vinte tachos contra o estoque de um exemplo: o razão recusa.
  const corrida = await openProductionRun(EMPRESA_SEMENTE, { productId: product.id, batches: 20 });
  await assert.rejects(
    closeProductionRun(EMPRESA_SEMENTE, { runId: corrida.id, unitsProduced: 9000, producedOn: localDate(nowIso(), 'America/Sao_Paulo') }),
    (e) => e instanceof NotEnoughStockError,
  );

  // E a corrida continua aberta: a pessoa lança a compra que chegou e fecha
  // depois. Perder o registro do tacho que rodou seria o pior dos dois mundos.
  assert.equal((await openProductionRuns(EMPRESA_SEMENTE)).length, 1);
});

test('a store that checked and a store that did not are different facts', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Norte', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const quando = '2026-09-01T14:00:00.000Z';
  const janela = ['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z'] as const;

  const paraCentro = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 6000, occurredAt: quando,
  });
  await recordTransfer(EMPRESA_SEMENTE, {
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
    (await shipmentsOn(EMPRESA_SEMENTE, ...janela)).filter((p) => !p.checked);
  assert.equal((await semConferir()).length, 2, 'nada conferido ainda');

  // A Loja Centro confere e bate. Diferença zero - a linha que o servidor
  // recusava antes da 0017, e que é a prova de que alguém abriu a caixa.
  // Sem lista: "chegou tudo", que é o caminho que a tela usa.
  const bateu = await recordCheck(EMPRESA_SEMENTE, {
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
  const depois = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === acucar.id);
  assert.equal(depois?.onHandBaseUnits, 50000);
  const porLugar = await balanceByLocation(EMPRESA_SEMENTE, acucar.id);
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const camara = await savePlace(EMPRESA_SEMENTE, { name: 'Câmara fria', kind: 'cold_room' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: camara.id,
    baseUnits: 6000,
    occurredAt: '2026-09-02T10:00:00.000Z',
  });

  // Três perguntas diferentes, três respostas diferentes - e é a diferença entre
  // elas que a tela precisava saber que existe.
  assert.equal((await findItem(EMPRESA_SEMENTE, acucar.id))?.onHandBaseUnits, 50000);
  assert.equal((await findItem(EMPRESA_SEMENTE, acucar.id, { sala: fabrica }))?.onHandBaseUnits, 44000);
  const naCamara = await findItem(EMPRESA_SEMENTE, acucar.id, { sala: camara.id });
  assert.equal(naCamara?.onHandBaseUnits, 6000);

  // Contando exatamente o que a tela da câmara mostrou, a diferença é zero.
  // Sob o defeito a tela mostrava 50.000 e a pessoa que contasse a câmara
  // digitaria 6.000 - e o sistema chamaria isso de falta de 44.000.
  const bateu = await recordCount(EMPRESA_SEMENTE, {
    locationId: camara.id,
    itemId: acucar.id,
    countedBaseUnits: naCamara?.onHandBaseUnits ?? 0,
  });
  assert.equal(bateu.expectedBaseUnits, 6000, 'o esperado é o da sala, não o da empresa');
  assert.equal(bateu.deltaBaseUnits, 0);
  assert.equal((await findItem(EMPRESA_SEMENTE, acucar.id, { sala: fabrica }))?.onHandBaseUnits, 44000);

  // E a câmara conferida não faz a fábrica parecer conferida. "Conferido em 2/9"
  // ao lado do saldo da fábrica seria dizer que alguém olhou uma prateleira que
  // ninguém olhou.
  const daCamara = await itemMovements(EMPRESA_SEMENTE, acucar.id, 20, { sala: camara.id });
  assert.ok(
    daCamara.some((m) => m.kind === 'adjustment'),
    'a conferência da câmara aparece na câmara',
  );
  const daFabrica = await itemMovements(EMPRESA_SEMENTE, acucar.id, 20, { sala: fabrica });
  assert.ok(
    !daFabrica.some((m) => m.kind === 'adjustment'),
    'e não aparece na fábrica, que ninguém conferiu',
  );
  // Sem sala continua sendo a lista da empresa, que é o que as outras telas leem.
  assert.ok((await itemMovements(EMPRESA_SEMENTE, acucar.id)).some((m) => m.kind === 'adjustment'));
});

test('places come out in the order somebody thinks about them, not in English', async () => {
  // `ORDER BY kind` ordenava pela palavra do ESQUEMA, que é inglesa. Em português a
  // lista saía "Câmara fria, Cliente, Fábrica, Loja própria, Almoxarifado, Veículo" —
  // com o almoxarifado da própria fábrica depois dos clientes, e sem nenhuma ordem
  // que alguém reconheça. Em espanhol sairia numa terceira ordem, pelo mesmo acidente.
  //
  // Os nomes são escolhidos ao contrário da ordem esperada de propósito: com nomes em
  // ordem alfabética o teste passaria mesmo se a ordenação fosse por nome, e não
  // distinguiria as duas coisas.
  await ensureStarterData(EMPRESA_SEMENTE);
  await savePlace(EMPRESA_SEMENTE, { name: 'Zulu cliente', kind: 'customer' });
  await savePlace(EMPRESA_SEMENTE, { name: 'Alfa loja', kind: 'own_store' });
  await savePlace(EMPRESA_SEMENTE, { name: 'Mike câmara', kind: 'cold_room' });
  await savePlace(EMPRESA_SEMENTE, { name: 'Bravo almoxarifado', kind: 'store_room' });

  const kinds = (await listPlaces(EMPRESA_SEMENTE)).map((p) => p.kind);
  assert.deepEqual(
    kinds,
    ['factory', 'cold_room', 'store_room', 'own_store', 'customer'],
    'a unidade primeiro, as salas dentro dela, depois quem recebe carga',
  );
});

test('a second delivery is still checkable after the first one was', async () => {
  // O defeito que a RECUSA quase criou, e que só apareceu ao olhar quem chama: a tela
  // conferia percorrendo as remessas do DIA, e a recusa de conferir duas vezes faria a
  // carga da tarde ficar presa atrás da recusa da carga da manhã. O toque não
  // conferiria nada, e a tela diria que não deu para gravar.
  //
  // Um conserto que cria o defeito oposto não é conserto. O que a tela percorre passou
  // a ser o que FALTA, e é isto que prova a diferença entre as duas listas.
  await ensureStarterData(EMPRESA_SEMENTE);
  const loja = await savePlace(EMPRESA_SEMENTE, { name: 'Loja da tarde', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const manha = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: loja.id,
    baseUnits: 1000, occurredAt: '2026-09-02T09:00:00.000Z',
  });
  const tarde = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: loja.id,
    baseUnits: 2000, occurredAt: '2026-09-02T15:00:00.000Z',
  });

  await recordCheck(EMPRESA_SEMENTE, { groupId: manha.groupId, occurredAt: '2026-09-02T10:00:00.000Z' });

  const dia = await shipmentsOn(EMPRESA_SEMENTE, '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z');
  const aqui = dia.find((d) => d.locationId === loja.id);
  assert.ok(aqui, 'o destino sumiu da lista do dia');
  assert.equal(aqui.groupIds.length, 2, 'as duas cargas do dia continuam listadas');
  assert.deepEqual(aqui.pendentes, [tarde.groupId], 'só a carga da tarde está pendente');
  assert.equal(aqui.checked, false, 'com uma carga por conferir o destino não está conferido');

  // E conferir o que falta funciona, sem esbarrar na que já foi.
  const conferida = await recordCheck(EMPRESA_SEMENTE, {
    groupId: aqui.pendentes[0],
    occurredAt: '2026-09-02T16:00:00.000Z',
  });
  assert.deepEqual(conferida.differences, [{ itemId: acucar.id, baseUnits: 0 }]);
});

test('what is missing at the door leaves the store balance short, by exactly what was missing', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const remessa = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 6000, occurredAt: '2026-09-01T14:00:00.000Z',
  });

  // Saíram 6.000 g e chegaram 5.500: faltaram 500 no caminho.
  const conferido = await recordCheck(EMPRESA_SEMENTE, {
    groupId: remessa.groupId,
    counted: [{ itemId: acucar.id, baseUnits: 5500 }],
    occurredAt: '2026-09-01T18:00:00.000Z',
  });
  assert.deepEqual(conferido.differences, [{ itemId: acucar.id, baseUnits: -500 }]);

  // **Conferir DUAS VEZES não confere duas vezes.** Sem esta recusa, a segunda
  // chamada lê as pernas positivas da remessa de novo, recalcula 5.500 - 6.000 e
  // grava outros -500: a prateleira tem 5.500 e o livro passa a dizer 5.000. Um
  // toque repetido na doca — que é onde o dedo está de luva — corrompe o saldo sem
  // nada acusar.
  //
  // E o pior não é a repetição: é que a consulta das pernas pega
  // `quantity_base_units > 0` do MESMO grupo, e uma sobra (a loja achou mais do que
  // veio) é positiva. Ela viraria perna de remessa na conferência seguinte, como se
  // uma carga fantasma tivesse chegado.
  //
  // O caminho para corrigir uma conferência é o mesmo de todo o resto desta casa:
  // estorno. A fundação diz que se corrige por estorno, nunca por sobrescrita.
  await assert.rejects(
    recordCheck(EMPRESA_SEMENTE, {
      groupId: remessa.groupId,
      counted: [{ itemId: acucar.id, baseUnits: 5500 }],
      occurredAt: '2026-09-01T19:00:00.000Z',
    }),
    /jaConferida/,
    'conferir a mesma remessa duas vezes gravou a diferença de novo',
  );

  // A loja fica com o que ela realmente tem, e a empresa perde os 500 - que é o
  // fato. Nada foi apagado: a remessa continua dizendo que 6.000 saíram.
  const naLoja = (await balanceByLocation(EMPRESA_SEMENTE, acucar.id)).find(
    (b) => b.locationId === centro.id,
  );
  assert.equal(naLoja?.baseUnits, 5500);

  const daEmpresa = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === acucar.id);
  assert.equal(daEmpresa?.onHandBaseUnits, 49500, 'os 500 que sumiram no caminho sumiram do total');
});

/**
 * Uma carga conferida com FALTA podia ser desfeita — e não podia.
 *
 * `planReversal` comparava cada perna negativa com o saldo do lugar, ISOLADAMENTE.
 * Uma carga que a loja conferiu e achou falta tem três linhas no grupo: sai N da
 * fábrica, entra N na loja, e a diferença negativa fica na loja. O estorno devolve
 * −N e +diferença NO MESMO lugar — mas, olhando só a perna negativa, ele parecia
 * pedir mais do que a loja tem, e a tela bloqueava mandando *"traga de volta 6.000"*
 * sobre uma mercadoria que está lá inteira.
 *
 * Uma carga lançada errada que já foi conferida não tinha conserto nenhum, e o
 * livro-razão desta casa promete que existe conserto: corrige-se por estorno.
 *
 * Os dois lados: a carga conferida com falta DESTRAVA, e o caso que o bloqueio
 * existe para pegar continua pego.
 */
test('uma carga conferida com falta pode ser desfeita, e a que já foi repassada não', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Norte', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const remessa = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 6000, occurredAt: '2026-09-01T14:00:00.000Z',
  });
  await recordCheck(EMPRESA_SEMENTE, {
    groupId: remessa.groupId,
    counted: [{ itemId: acucar.id, baseUnits: 5500 }],
    occurredAt: '2026-09-01T18:00:00.000Z',
  });

  const plano = await planReversal(EMPRESA_SEMENTE, remessa.groupId);
  assert.deepEqual(
    plano.blocked,
    [],
    'a loja tem 5.500 e o estorno pede 6.000 de volta devolvendo 500 no mesmo ato — a soma fecha',
  );
  await reverseGroup(EMPRESA_SEMENTE, { groupId: remessa.groupId });
  const naLoja = (await balanceByLocation(EMPRESA_SEMENTE, acucar.id)).find(
    (b) => b.locationId === centro.id,
  );
  assert.equal(naLoja?.baseUnits ?? 0, 0, 'a loja volta a zero, que é o que ela tinha antes');

  // E o caso VERDADEIRO do bloqueio: a loja repassou o que recebeu. Aí não há o que
  // trazer de volta, e a tela tem de dizer isso antes de o dedo tocar.
  const segunda = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 4000, occurredAt: '2026-09-02T14:00:00.000Z',
  });
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: centro.id, toLocationId: norte.id,
    baseUnits: 4000, occurredAt: '2026-09-02T16:00:00.000Z',
  });
  const travado = await planReversal(EMPRESA_SEMENTE, segunda.groupId);
  assert.equal(travado.blocked.length, 1, 'o que já saiu da loja não volta dela');
  assert.equal(travado.blocked[0].itemId, acucar.id);
});

test('a return on the same day does not quietly shrink what the store received', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const manha = '2026-09-01T11:00:00.000Z';
  const tarde = '2026-09-01T17:00:00.000Z';

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 6000,
    occurredAt: manha,
  });
  // A loja devolve parte à tarde - acontece, e é a razão de a devolução estar
  // no plano do mês.
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: centro.id,
    toLocationId: fabrica,
    baseUnits: 1000,
    occurredAt: tarde,
  });

  const dia = await shipmentsOn(
    EMPRESA_SEMENTE,
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  // Uma corrida às 23h50 de segunda, sincronizada só na terça de manhã. É o
  // caso normal de uma fábrica: a câmara fria é uma caixa de metal, o sinal
  // volta quando alguém sai de lá.
  const segundaTarde = '2026-08-31T23:50:00.000Z';
  const tercaCedo = '2026-09-01T08:00:00.000Z';

  await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 400,
    occurredAt: segundaTarde,
    producedOn: localDate(segundaTarde, 'America/Sao_Paulo'),
  });
  await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    occurredAt: tercaCedo,
    producedOn: localDate(tercaCedo, 'America/Sao_Paulo'),
  });

  const segunda = await productionOn(
    EMPRESA_SEMENTE,
    '2026-08-31T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z',
  );
  const terca = await productionOn(
    EMPRESA_SEMENTE,
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  // Três corridas pedem mais insumo do que o exemplo semeado tem: a fábrica
  // compra antes, como compraria de verdade.
  for (const insumo of (await listItems(EMPRESA_SEMENTE)).filter((i) => i.kind === 'input')) {
    await recordPurchase(EMPRESA_SEMENTE, {
      itemId: insumo.id,
      purchaseQuantity: 1,
      baseUnits: 60_000,
      totalCents: fromDecimal(300),
    });
  }

  // O prazo é do produto, respondido uma vez no cadastro.
  await saveProduct(EMPRESA_SEMENTE, {
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

  const primeira = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  assert.equal(primeira.lot.code, '20260902-01');
  assert.equal(primeira.lot.expiresOn, '2027-03-01');

  // A segunda corrida do MESMO dia é a segunda, e a de outro dia recomeça.
  const segunda = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 380,
    producedOn: '2026-09-02',
  });
  assert.equal(segunda.lot.code, '20260902-02');

  const outroDia = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const dia = { from: '2026-09-02T03:00:00.000Z', to: '2026-09-03T03:00:00.000Z' };

  // Nada produzido: lista vazia, não uma linha zerada.
  assert.deepEqual(await lotsOn(EMPRESA_SEMENTE, dia.from, dia.to), []);

  const manha = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
    occurredAt: '2026-09-02T13:00:00.000Z',
  });

  const lotes = await lotsOn(EMPRESA_SEMENTE, dia.from, dia.to);
  assert.equal(lotes.length, 1);
  assert.equal(lotes[0].code, manha.lot.code);
  assert.equal(lotes[0].name, product.name);

  // A quantidade vem do MOVIMENTO, não do lote: o lote é a identidade, e quem
  // sabe quanto saiu é o livro-razão.
  assert.equal(lotes[0].baseUnits, 400);

  // E o lote de outro dia não entra na janela de hoje, mesmo existindo.
  await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 300,
    producedOn: '2026-09-03',
    occurredAt: '2026-09-03T13:00:00.000Z',
  });
  assert.equal((await lotsOn(EMPRESA_SEMENTE, dia.from, dia.to)).length, 1);
});

test('a lot opens by its own id, and a lot that is gone says so', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 480,
    producedOn: '2026-09-02',
  });

  const lote = await findLot(EMPRESA_SEMENTE, corrida.lot.id);
  assert.equal(lote?.code, corrida.lot.code);
  assert.equal(lote?.name, product.name);
  assert.equal(lote?.baseUnits, 480);
  assert.equal(lote?.producedOn, '2026-09-02');

  // Etiqueta se abre por link, e link envelhece: alguém guarda o endereço, o
  // dado é apagado, e a tela precisa saber dizer isso em vez de quebrar.
  assert.equal(await findLot(EMPRESA_SEMENTE, 'lote-que-nao-existe'), null);

  // E o lote de outra empresa não vaza por id adivinhado.
  assert.equal(await findLot('outra-empresa', corrida.lot.id), null);

  // O CÓDIGO impresso abre o mesmo lote que o id.
  //
  // É ele que o QR carrega e é ele que alguém digita quando a etiqueta congela e
  // descasca - a própria tela promete isso por escrito. A consulta só conhecia o
  // id, então o código era um endereço que não levava a lugar nenhum: caixa
  // bipada, onze caracteres digitados, e nada abria.
  const pelaEtiqueta = await findLot(EMPRESA_SEMENTE, corrida.lot.code);
  assert.equal(pelaEtiqueta?.id, corrida.lot.id, 'o código impresso abre o lote');
  assert.equal(pelaEtiqueta?.baseUnits, 480);

  // E o código de outra empresa continua sem vazar: a régua é a empresa, não o
  // formato. Duas fábricas podem ter o mesmo `20260902-01` no mesmo dia.
  assert.equal(await findLot('outra-empresa', corrida.lot.code), null);
});

test('a product with no shelf life still gets a lot, without a date', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  // Nada de prazo cadastrado: o exemplo semeado nasce assim.
  assert.equal(product.shelfLifeDays, null);

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const { id: fria } = await savePlace(EMPRESA_SEMENTE, {
    name: 'Câmara fria',
    kind: 'cold_room',
  });

  const [insumo] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.onHandBaseUnits > 0);
  const total = insumo.onHandBaseUnits;
  const metade = Math.floor(total / 2);

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: insumo.id,
    baseUnits: metade,
    fromLocationId: fabrica,
    toLocationId: fria,
  });

  // Sem sala, a resposta é a empresa inteira - e ela não mudou, porque
  // transferir não cria nem destrói nada.
  const empresa = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === insumo.id);
  assert.equal(empresa?.onHandBaseUnits, total);

  // Com sala, a resposta é daquela sala. Era isto que faltava: com a polpa
  // dividida, o almoxarifado dizia 34 kg enquanto quem estava no tacho tinha 20
  // na mão. O número não estava errado - estava respondendo outra pergunta.
  const naFabrica = (await listItems(EMPRESA_SEMENTE, undefined, false, { sala: fabrica })).find(
    (i) => i.id === insumo.id,
  );
  const naFria = (await listItems(EMPRESA_SEMENTE, undefined, false, { sala: fria })).find(
    (i) => i.id === insumo.id,
  );
  assert.equal(naFria?.onHandBaseUnits, metade);
  assert.equal(naFabrica?.onHandBaseUnits, total - metade);

  // E as duas salas somam a empresa: se não somassem, uma das três contas
  // estaria mentindo.
  assert.equal((naFabrica?.onHandBaseUnits ?? 0) + (naFria?.onHandBaseUnits ?? 0), total);
});

test('the room says what was inside it AT THE READING, not what is inside now', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const { id: camara } = await savePlace(EMPRESA_SEMENTE, {
    name: 'Câmara fria',
    kind: 'cold_room',
  });
  const [produto] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  // Duas corridas na fábrica — é lá que estão os insumos, e o piso da produção é
  // o da sala em que o tacho está — e os dois lotes vão para a câmara de manhã.
  const manha = await recordProduction(EMPRESA_SEMENTE, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
    occurredAt: '2026-09-02T05:30:00.000Z',
  });
  const tambem = await recordProduction(EMPRESA_SEMENTE, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 200,
    producedOn: '2026-09-02',
    occurredAt: '2026-09-02T05:45:00.000Z',
  });

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: produto.itemId,
    fromLocationId: fabrica,
    toLocationId: camara,
    baseUnits: 400,
    lotId: manha.lot.id,
    occurredAt: '2026-09-02T06:00:00.000Z',
  });
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: produto.itemId,
    fromLocationId: fabrica,
    toLocationId: camara,
    baseUnits: 200,
    lotId: tambem.lot.id,
    occurredAt: '2026-09-02T06:30:00.000Z',
  });

  // A leitura ruim é das 07:20 — os dois lotes estavam lá.
  const naLeitura = await lotsInRoomAt(EMPRESA_SEMENTE, camara, '2026-09-02T07:20:00.000Z');
  assert.equal(naLeitura.length, 2, 'os dois lotes estavam na câmara quando a leitura foi tomada');
  assert.deepEqual(
    naLeitura.map((l) => l.code).sort(),
    [manha.lot.code, tambem.lot.code].sort(),
  );
  assert.equal(naLeitura[0].name, 'Picolé de morango', 'o código sozinho não manda ninguém a lugar nenhum');

  // Ao meio-dia um deles sai para a loja.
  const { id: loja } = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  await recordTransfer(EMPRESA_SEMENTE, {
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
  const agora = await lotsInRoomAt(EMPRESA_SEMENTE, camara, '2026-09-02T15:00:00.000Z');
  assert.equal(agora.length, 1, 'o que saiu ao meio-dia não está mais lá');
  assert.equal(agora[0].code, tambem.lot.code);

  const aindaNaLeitura = await lotsInRoomAt(EMPRESA_SEMENTE, camara, '2026-09-02T07:20:00.000Z');
  assert.equal(aindaNaLeitura.length, 2, 'e a resposta das 07:20 não muda por causa do que veio depois');
});

test('the picking list says what the store ordered and what the room has', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const { id: loja } = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const [produto] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  await recordProduction(EMPRESA_SEMENTE, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  await saveOrder(EMPRESA_SEMENTE, {
    placeId: loja,
    requestedFor: '2026-09-04',
    lines: [{ itemId: produto.itemId, baseUnits: 300 }],
  });
  await saveOrder(EMPRESA_SEMENTE, {
    placeId: loja,
    requestedFor: '2026-09-05',
    lines: [{ itemId: produto.itemId, baseUnits: 120 }],
  });

  // A janela do dia de quem carrega. Larga aqui de propósito: o que ela recorta
  // é medido logo abaixo, com uma janela que não alcança a carga.
  const DIA = ['2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z'] as const;

  const lista = await pickingFor(EMPRESA_SEMENTE, loja, fabrica, '2026-09-10', ...DIA);
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
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: produto.itemId,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: 100,
    occurredAt: '2026-09-02T14:00:00.000Z',
  });

  const segunda = await pickingFor(EMPRESA_SEMENTE, loja, fabrica, '2026-09-10', ...DIA);
  assert.equal(segunda[0].ordered, 420, 'o pedido não encolhe: ele continua sendo de 420');
  assert.equal(segunda[0].sentToday, 100, 'e o que já chegou lá hoje é fato ao lado dele');

  // A devolução volta a abrir espaço: 100 que foram e 40 que voltaram são 60
  // recebidos. Contar só a transferência diria que a loja tem o que ela devolveu.
  await recordReturn(EMPRESA_SEMENTE, {
    itemId: produto.itemId,
    fromLocationId: loja,
    toLocationId: fabrica,
    baseUnits: 40,
    occurredAt: '2026-09-02T16:00:00.000Z',
    returnReason: 'unsold',
  });
  const depoisDaVolta = await pickingFor(EMPRESA_SEMENTE, loja, fabrica, '2026-09-10', ...DIA);
  assert.equal(depoisDaVolta[0].sentToday, 60, 'o que voltou desconta do que chegou');

  // E a janela recorta mesmo: no dia anterior, nada tinha ido.
  const ontem = await pickingFor(
    EMPRESA_SEMENTE,
    loja,
    fabrica,
    '2026-09-10',
    '2026-09-01T00:00:00.000Z',
    '2026-09-02T00:00:00.000Z',
  );
  assert.equal(ontem[0].sentToday, 0, 'a carga de hoje não conta contra o pedido de ontem');

  // Pedido de outra loja não entra nesta lista - separar é por destino.
  const outra = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Norte', kind: 'own_store' });
  assert.deepEqual(
    await pickingFor(EMPRESA_SEMENTE, outra.id, fabrica, '2026-09-10', ...DIA),
    [],
  );

  // E o que ainda não chegou na janela também não: separar é para hoje, não
  // para o mês.
  assert.deepEqual(await pickingFor(EMPRESA_SEMENTE, loja, fabrica, '2026-09-03', ...DIA), []);
});

test('a return is a return, not a transfer running backwards', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const { id: loja } = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const [acucar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.onHandBaseUnits >= 6000);

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: 6000,
  });
  await recordReturn(EMPRESA_SEMENTE, {
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
      recordTransfer(EMPRESA_SEMENTE, {
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
  const naLoja = await balanceByLocation(EMPRESA_SEMENTE, acucar.id);
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
    EMPRESA_SEMENTE,
    dayWindow(nowIso(), 'America/Sao_Paulo').from,
    dayWindow(nowIso(), 'America/Sao_Paulo').to,
  );
  const paraLoja = dia.find((d) => d.locationId === loja);
  assert.equal(paraLoja?.items[0]?.baseUnits, 6000);
});

test('a kettle is refused when the sugar is in the store, not in the factory', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);

  // Uma segunda sala, e a fábrica manda TUDO para lá. É um caminho que a tela
  // de transferência já oferece hoje.
  const { id: loja } = await savePlace(EMPRESA_SEMENTE, {
    name: 'Loja Centro',
    kind: 'own_store',
  });
  const insumos = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.onHandBaseUnits > 0);
  assert.ok(insumos.length > 0, 'o exemplo semeado tem insumo com saldo');

  for (const insumo of insumos) {
    await recordTransfer(EMPRESA_SEMENTE, {
      itemId: insumo.id,
      baseUnits: insumo.onHandBaseUnits,
      fromLocationId: fabrica,
      toLocationId: loja,
    });
  }

  // A empresa continua com o mesmo açúcar - ele só está em outra sala. Uma
  // guarda que soma a empresa inteira não vê diferença nenhuma aqui, e é
  // exatamente por isso que ela autorizava o tacho.
  const total = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === insumos[0].id);
  assert.equal(total?.onHandBaseUnits, insumos[0].onHandBaseUnits);

  await assert.rejects(
    () =>
      recordProduction(EMPRESA_SEMENTE, {
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
  const depois = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === product.itemId);
  assert.equal(depois?.onHandBaseUnits ?? 0, 0);
});

/**
 * O tacho alcança a câmara fria da própria unidade — e a tela já dizia que sim.
 *
 * **A cicatriz é de 8 de setembro e é minha.** No dia em que o saldo passou a ter
 * escopo de unidade, `app/production/new.tsx` passou a ler
 * `listItems(..., { unidade: unidadeDaqui() })` — o piso da unidade INTEIRA, câmara
 * fria e almoxarifado incluídos — e a guarda de `recordProduction` continuou
 * conferindo `m.location_id = input.locationId`, que é UMA sala. A guarda de camadas
 * exigia um quarto argumento e ele estava lá, então nada acusou.
 *
 * O resultado é o defeito que a guarda irmã existe para impedir, uma casa mais
 * estreito: com a polpa na câmara fria, que é onde polpa mora numa fábrica de
 * picolés, a tela libera o botão e a escrita recusa com erro de programador em
 * inglês. E ele é PIOR que o original, porque agora a tela ainda diz em que sala a
 * polpa está — ou seja, ela sabe onde está e mesmo assim não deixa rodar.
 *
 * Duas coisas são provadas aqui, e a segunda é a que o livro-razão precisa: o tacho
 * roda, e o consumo sai **da sala onde o insumo estava de verdade**. Debitar tudo do
 * piso da unidade deixaria o piso negativo e a câmara cheia — soma certa por
 * unidade, mentira por sala, e é a sala que alguém confere com os olhos.
 */
test('a kettle reaches the cold room of its own unit, and the consumption leaves the room that had it', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const unidade = defaultLocationId(EMPRESA_SEMENTE);

  // A câmara fria DENTRO da unidade, que é o que `0046` passou a permitir dizer.
  const { id: camara } = await savePlace(EMPRESA_SEMENTE, {
    name: 'Câmara fria',
    kind: 'cold_room',
    parentLocationId: unidade,
  });

  const insumos = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.onHandBaseUnits > 0);
  assert.ok(insumos.length > 0, 'o exemplo semeado tem insumo com saldo');
  for (const insumo of insumos) {
    await recordTransfer(EMPRESA_SEMENTE, {
      itemId: insumo.id,
      baseUnits: insumo.onHandBaseUnits,
      fromLocationId: unidade,
      toLocationId: camara,
    });
  }

  // O que a TELA lê: o piso da unidade, e ele continua cheio — a câmara é dentro.
  const naUnidade = await listItems(EMPRESA_SEMENTE, undefined, false, { unidade });
  for (const antes of insumos) {
    const agora = naUnidade.find((i) => i.id === antes.id);
    assert.equal(
      agora?.onHandBaseUnits,
      antes.onHandBaseUnits,
      'mudar de sala dentro da unidade não muda o piso da unidade',
    );
  }

  // Então o tacho roda. Antes desta correção, aqui vinha `NotEnoughStockError`.
  const feito = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: unidade,
    batches: 1,
    unitsProduced: 400,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  assert.equal(feito.unitsProduced, 400);

  // E o consumo saiu DA CÂMARA, não do piso da unidade. Esta é a asserção que
  // separa "a soma fecha" de "cada sala diz a verdade": um insumo que estava na
  // câmara e some do piso da unidade deixaria a unidade negativa e a câmara cheia.
  const consumido = insumos[0];
  const naCamara = await listItems(EMPRESA_SEMENTE, undefined, false, { sala: camara });
  const noPiso = await listItems(EMPRESA_SEMENTE, undefined, false, { sala: unidade });
  const sobrouNaCamara = naCamara.find((i) => i.id === consumido.id)?.onHandBaseUnits ?? 0;
  const sobrouNoPiso = noPiso.find((i) => i.id === consumido.id)?.onHandBaseUnits ?? 0;

  assert.ok(
    sobrouNaCamara < consumido.onHandBaseUnits,
    `a câmara tinha ${consumido.onHandBaseUnits} e continua com ${sobrouNaCamara}: o consumo saiu de outro lugar`,
  );
  assert.equal(sobrouNoPiso, 0, 'o piso da unidade não tinha este insumo, e não pode ficar negativo');
});

test('the week the home screen draws carries the runs, and only the runs', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 400,
    occurredAt: '2026-08-31T13:00:00.000Z',
    producedOn: localDate('2026-08-31T13:00:00.000Z', 'America/Sao_Paulo'),
  });
  await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    occurredAt: '2026-09-02T14:00:00.000Z',
    producedOn: localDate('2026-09-02T14:00:00.000Z', 'America/Sao_Paulo'),
  });

  const semana = await productionBetween(
    EMPRESA_SEMENTE,
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
    EMPRESA_SEMENTE,
    '2026-08-31T13:00:00.000Z',
    '2026-09-02T14:00:00.000Z',
  );
  assert.equal(cortada.length, 1);
  assert.equal(cortada[0].baseUnits, 400);
});

test('a run exactly at midnight is counted once, not twice', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const meiaNoite = '2026-09-01T00:00:00.000Z';
  await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 300,
    occurredAt: meiaNoite,
    producedOn: localDate(meiaNoite, 'America/Sao_Paulo'),
  });

  const ontem = await productionOn(
    EMPRESA_SEMENTE,
    '2026-08-31T00:00:00.000Z',
    '2026-09-01T00:00:00.000Z',
  );
  const hoje = await productionOn(
    EMPRESA_SEMENTE,
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const run = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  // O que a tela grava quando alguém digita 0,004 no campo de embalagem.
  await saveProduct(EMPRESA_SEMENTE, {
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

  const salvo = (await listProductsForLedger(EMPRESA_SEMENTE)).find((p) => p.id === product.id);
  assert.equal(salvo?.unitPackagingRate, 0.4, 'a fração sobrevive à ida e volta do banco');

  const run = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    occurredAt: '2026-09-06T12:00:00.000Z',
    producedOn: '2026-09-06',
  });

  /**
   * A OUTRA fonte é a MESMA corrida com a embalagem zerada — e esta asserção
   * substitui uma que não podia falhar.
   *
   * Estava assim, com a frase certa ao lado:
   *
   *     const semEmbalagem = run.unitCostRate - 0.4;
   *     assert.ok(Math.abs(run.unitCostRate - (semEmbalagem + 0.4)) < 1e-9, ...)
   *
   * `semEmbalagem` é DEFINIDO como a taxa menos 0,4, então `semEmbalagem + 0,4` é a
   * própria taxa: a igualdade é circular e vale para qualquer número. O `mutate`
   * provou o custo disso — apagar `+ product.unitPackagingRate` do custo congelado
   * atravessou a suíte inteira, e nenhum `grep` acharia, porque a linha parece uma
   * comparação de verdade.
   *
   * Duas corridas idênticas congelam o mesmo consumo (a média só se move em COMPRA,
   * e não há compra entre elas), então a diferença entre as duas é a embalagem e
   * nada mais.
   */
  await saveProduct(EMPRESA_SEMENTE, {
    id: product.id,
    itemId: product.itemId,
    name: product.name,
    kind: 'product',
    recipeId: product.recipeId,
    yieldPerUnit: product.yieldPerUnit,
    unitPackagingRate: rate(0, 1),
    packagingItems: [],
    packaging: product.packaging,
    shelfLifeDays: product.shelfLifeDays,
    fullLevel: null,
  });
  const semTaxa = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    occurredAt: '2026-09-06T13:00:00.000Z',
    producedOn: '2026-09-06',
  });
  assert.equal(
    Number((run.unitCostRate - semTaxa.unitCostRate).toFixed(9)),
    0.4,
    'a diferença entre as duas corridas é a embalagem, e só ela',
  );

  // E o que isso vale na corrida: dois reais, que sob o defeito eram zero.
  assert.equal(amountOf(0.4 as Rate, 500), 200);
});

test('a production run writes one line per item, and freezes what each cost', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  const before = await listItems(EMPRESA_SEMENTE);
  const run = await recordProduction(EMPRESA_SEMENTE, {
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
    (await listItems(EMPRESA_SEMENTE)).filter((i) => i.kind === 'packaging').map((i) => i.id),
  );
  assert.ok(
    used.some((l) => daEmbalagem.has(l.item_id)),
    'a corrida gastou embalagem, ou este teste não prova o que diz provar',
  );
  assert.ok(Math.abs(run.unitCostRate - value / 500) < 1e-9);
  assert.ok(Math.abs((made[0].r ?? 0) - run.unitCostRate) < 1e-9);

  // And the stock moved both ways: ingredients down, product up.
  const after = await listItems(EMPRESA_SEMENTE);
  for (const line of used) {
    const was = before.find((i) => i.id === line.item_id)?.onHandBaseUnits ?? 0;
    const now = after.find((i) => i.id === line.item_id)?.onHandBaseUnits ?? 0;
    assert.equal(now, was + line.q, 'the ingredient came down by exactly what was used');
  }
});

test('a run that yielded less freezes the higher cost, because that is what happened', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  const full = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id, locationId: where, batches: 1, unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  const short = await recordProduction(EMPRESA_SEMENTE, {
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
  const embalagens = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.kind === 'packaging');
  const pack = embalagens.reduce((soma, i) => soma + (i.averageRate ?? 0), 0);
  assert.ok(pack > 0, 'o exemplo gasta embalagem, ou a proporção abaixo não prova nada');

  // Mistura se espalha, palito não: tirada a parte constante, o que sobra tem de
  // ficar mais caro por exatamente 500/400.
  assert.ok(Math.abs((short.unitCostRate - pack) / (full.unitCostRate - pack) - 500 / 400) < 1e-9);
});

test('what leaves the factory arrives at the store, and the company has the same', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(EMPRESA_SEMENTE);

  const store = 'loja-centro';
  await live.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at) VALUES (?, ?, 'Loja Centro', 'store_room', ?)`,
    [store, EMPRESA_SEMENTE, '2026-09-01T00:00:00Z'],
  );

  const before = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === sugar.id);
  const moved = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store,
    baseUnits: 5000,
  });

  const places = await balanceByLocation(EMPRESA_SEMENTE, sugar.id);
  assert.equal(places.find((p) => p.locationId === store)?.baseUnits, 5000);

  // The whole point of two legs: the sum over the company cannot notice that
  // anything happened, because nothing entered or left the business.
  const after = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === sugar.id);
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const here = defaultLocationId(EMPRESA_SEMENTE);

  // Both would append rows to a ledger that cannot be edited afterwards, and
  // neither describes anything that happened. The error is prevented.
  await assert.rejects(
    recordTransfer(EMPRESA_SEMENTE, {
      itemId: sugar.id, fromLocationId: here, toLocationId: here, baseUnits: 100,
    }),
    /mesmo lugar/,
  );
  await assert.rejects(
    recordTransfer(EMPRESA_SEMENTE, {
      itemId: sugar.id, fromLocationId: here, toLocationId: 'outro', baseUnits: 0,
    }),
    /move alguma coisa/,
  );
});

test('renaming a place moves no money, because no movement carries its name', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(EMPRESA_SEMENTE);

  const store = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 6000,
  });

  const before = await stockByPlace(EMPRESA_SEMENTE);
  await savePlace(EMPRESA_SEMENTE, { id: store.id, name: 'Loja da Praça', kind: 'own_store' });
  const after = await stockByPlace(EMPRESA_SEMENTE);

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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(EMPRESA_SEMENTE);
  const store = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 6000,
  });

  const places = await stockByPlace(EMPRESA_SEMENTE);
  const company = await listItems(EMPRESA_SEMENTE);

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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(EMPRESA_SEMENTE);
  const store = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });

  const there = { itemId: sugar.id, fromLocationId: factory, toLocationId: store.id, baseUnits: 6000 };
  await recordTransfer(EMPRESA_SEMENTE, there);
  await recordTransfer(EMPRESA_SEMENTE, {
    ...there,
    fromLocationId: store.id,
    toLocationId: factory,
  });

  // Four movements are on the ledger and none of them was deleted - the store
  // simply has nothing right now. A screen that printed "0 g" would be inviting
  // somebody to go and check a shelf that holds no sugar.
  const places = await stockByPlace(EMPRESA_SEMENTE);
  assert.equal(places.find((p) => p.locationId === store.id), undefined);

  const ledger = await live.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM movements WHERE location_id = ? OR counterpart_location_id = ?`,
    [store.id, store.id],
  );
  assert.equal(ledger?.n, 4, 'the history of the round trip is all still there');
});

test('the guess for the next load reads what arrived, not what left', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [sugar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.name.includes('Açúcar'));
  const factory = defaultLocationId(EMPRESA_SEMENTE);
  const store = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });

  // Nothing has ever gone there, and the honest answer is that there is no
  // guess. A field pre-filled with zero would be a lie dressed as helpfulness.
  assert.equal(await lastSentBaseUnits(EMPRESA_SEMENTE, sugar.id, store.id), null);

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 6000,
    occurredAt: '2026-08-01T10:00:00Z',
  });
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: sugar.id,
    fromLocationId: factory,
    toLocationId: store.id,
    baseUnits: 4000,
    occurredAt: '2026-08-20T10:00:00Z',
  });

  // The most recent one, and positive: a transfer writes two legs with the same
  // absolute value and opposite signs, so reading the leaving leg instead would
  // hand the screen a negative number that the button then refuses in silence.
  const guess = await lastSentBaseUnits(EMPRESA_SEMENTE, sugar.id, store.id);
  assert.equal(guess, 4000);

  // And it is per place: another store has its own history, or none.
  const other = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Norte', kind: 'own_store' });
  assert.equal(await lastSentBaseUnits(EMPRESA_SEMENTE, sugar.id, other.id), null);
});

test('half a kettle takes half the ingredients, so recording only what came out still moves the storeroom', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const antes = await listItems(EMPRESA_SEMENTE);
  const cheio = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 100,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const meio = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
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
  const depois = await listItems(EMPRESA_SEMENTE);
  const insumo = cheio.consumed[0].itemId;
  const saldoAntes = antes.find((i) => i.id === insumo)?.onHandBaseUnits ?? 0;
  const saldoDepois = depois.find((i) => i.id === insumo)?.onHandBaseUnits ?? 0;
  assert.ok(saldoDepois < saldoAntes, 'o insumo tem que ter baixado');
});

/**
 * O que foi DESFEITO não é consumo — e desfazer fabricava o alerta.
 *
 * `runningOut` e `dailyOutflowOf` somavam qualquer linha negativa que não fosse
 * transferência interna. A perna que ESTORNA nasce negativa, é da espécie `reversal`
 * e está datada de hoje: desfazer uma nota lançada errada punha 500 kg de "saída" na
 * janela e a capa passava a dizer *"acaba em 0,7 dia"* — a peça cuja única função é
 * dizer o que produzir amanhã.
 *
 * **Duas condições, não uma, e o teste prova as duas juntas.** Descartar só o
 * movimento estornado não bastaria: o original é POSITIVO e a soma de saída nem olha
 * para ele. Quem entra na soma é a perna que desfaz, e nada aponta para ela.
 *
 * A asserção é IGUALDADE contra um cenário de controle — a mesma janela sem a nota e
 * sem o estorno — porque "maior que zero" é satisfeito por qualquer soma.
 */
test('desfazer uma nota não conta como saída, nem a nota nem a perna que a desfaz', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [acucar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => /ú?car/i.test(i.name));
  const de = '2026-03-01T00:00:00.000Z';
  const ate = '2026-03-08T00:00:00.000Z';

  // O controle: a janela sem nenhuma nota e sem nenhum estorno.
  const controle = await dailyOutflowOf(EMPRESA_SEMENTE, acucar.id, de, ate, 7);
  const controleLista = await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650);

  await recordPurchase(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    purchaseQuantity: 1,
    baseUnits: 500_000,
    totalCents: fromDecimal(1000),
    occurredAt: '2026-03-02T08:00:00.000Z',
  });
  const nota = (await itemMovements(EMPRESA_SEMENTE, acucar.id)).find(
    (m) => m.kind === 'purchase' && m.occurredAt === '2026-03-02T08:00:00.000Z',
  );
  assert.ok(nota?.groupId, 'a compra carrega o ato de que faz parte');
  await reverseGroup(EMPRESA_SEMENTE, {
    groupId: nota.groupId,
    occurredAt: '2026-03-03T08:00:00.000Z',
  });

  assert.equal(
    await dailyOutflowOf(EMPRESA_SEMENTE, acucar.id, de, ate, 7),
    controle,
    'a nota desfeita e a perna que a desfaz somam zero de saída, como se nada tivesse acontecido',
  );
  assert.deepEqual(
    await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650),
    controleLista,
    'e a lista de quem está acabando é idêntica à do cenário sem nota nenhuma',
  );
});

test('what is running out comes from what actually left, and a still input never alarms', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const de = '2026-03-01T00:00:00.000Z';
  const ate = '2026-03-08T00:00:00.000Z';

  // Nada saiu na janela: ninguém está acabando, e o cartão fica vazio. Um
  // alerta inventado aqui ensina a fábrica a ignorar o alerta de verdade.
  assert.deepEqual(await runningOut(EMPRESA_SEMENTE, de, ate, 7), []);

  // Insumo suficiente para a semana - a trava de estoque é de verdade e
  // recusaria a terceira corrida, o que é o comportamento certo dela.
  for (const item of await listItems(EMPRESA_SEMENTE)) {
    if (item.kind !== 'input' && item.kind !== 'packaging') continue;
    await recordPurchase(EMPRESA_SEMENTE, {
      itemId: item.id,
      purchaseQuantity: 1,
      baseUnits: 500_000,
      totalCents: fromDecimal(1000),
      occurredAt: '2026-02-28T08:00:00.000Z',
    });
  }

  // Sete dias de consumo de verdade, e aí a conta existe.
  for (let d = 1; d <= 7; d += 1) {
    await recordProduction(EMPRESA_SEMENTE, {
      productId: product.id,
      locationId: defaultLocationId(EMPRESA_SEMENTE),
      batches: 1,
      unitsProduced: 100,
      occurredAt: `2026-03-0${d}T10:00:00.000Z`,
    producedOn: localDate(`2026-03-0${d}T10:00:00.000Z`, 'America/Sao_Paulo'),
  });
  }

  const apertados = await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650);
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [produto] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  // Validade cadastrada, senão nenhum lote vence e a segunda metade deste teste
  // mediria o vazio. O exemplo semeado não declara validade de propósito - é
  // campo opcional, e "não vence" é resposta legítima.
  await saveProduct(EMPRESA_SEMENTE, {
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
  for (const item of await listItems(EMPRESA_SEMENTE)) {
    if (item.kind !== 'input' && item.kind !== 'packaging') continue;
    await recordPurchase(EMPRESA_SEMENTE, {
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
    await recordProduction(EMPRESA_SEMENTE, {
      productId: produto.id,
      locationId: defaultLocationId(EMPRESA_SEMENTE),
      batches: 1,
      unitsProduced: quanto,
      occurredAt: `2026-03-01T1${i}:00:00.000Z`,
      producedOn: '2026-03-01',
    });
  }

  const corridas = await recentRuns(EMPRESA_SEMENTE, 6);
  assert.equal(corridas.length, 3, 'uma linha por corrida, não por dia');
  assert.deepEqual(
    corridas.map((c) => c.baseUnits),
    [120, 100, 80],
    'mais recente primeiro',
  );
  assert.ok(corridas[0].code, 'cada corrida traz o código do lote dela');
  assert.ok((corridas[0].unitCostRate ?? 0) > 0, 'e a taxa congelada daquela corrida');

  // O limite corta pelo fim, não pelo começo.
  assert.equal((await recentRuns(EMPRESA_SEMENTE, 2)).length, 2);
  assert.equal((await recentRuns(EMPRESA_SEMENTE, 2))[0].baseUnits, 120);

  // Validade: o produto semeado dura 180 dias, então nada vence esta semana.
  const semana = await expiringSoon(EMPRESA_SEMENTE, '2026-03-08');
  assert.deepEqual(semana, [], 'nada vencendo é resposta, não lista vazia por erro');

  const longe = await expiringSoon(EMPRESA_SEMENTE, '2027-01-01');
  assert.equal(longe.length, 3, 'os três lotes vencem dentro do ano');
  assert.ok(
    longe[0].expiresOn <= longe[1].expiresOn,
    'o que vence primeiro vem primeiro',
  );

  // E o lote que já foi embora não avisa mais. Mandar o lote inteiro para uma
  // loja tira ele da lista - avisar da validade de uma caixa que não está aqui é
  // exatamente o alerta que ensina a ignorar alerta.
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const primeiro = longe[0];
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: produto.itemId,
    fromLocationId: defaultLocationId(EMPRESA_SEMENTE),
    toLocationId: centro.id,
    baseUnits: primeiro.baseUnits,
    occurredAt: '2026-03-02T09:00:00.000Z',
    lotId: primeiro.lotId,
  });

  // Na empresa o lote continua existindo, e está certo: as caixas não sumiram,
  // mudaram de sala.
  const naEmpresa = await expiringSoon(EMPRESA_SEMENTE, '2027-01-01');
  assert.ok(
    naEmpresa.some((l) => l.lotId === primeiro.lotId),
    'o lote que viajou continua existindo na empresa',
  );

  // Na FÁBRICA ele não está mais, e é essa a pergunta da capa: o que vence
  // primeiro do que está aqui.
  const naFabrica = await expiringSoon(EMPRESA_SEMENTE, '2027-01-01', 5, {
    sala: defaultLocationId(EMPRESA_SEMENTE),
  });
  assert.ok(
    !naFabrica.some((l) => l.lotId === primeiro.lotId),
    'lote que saiu da fábrica não avisa mais na fábrica',
  );

  // E chegou na loja com o lote: sem isso o recall pararia na porta da fábrica.
  const naLoja = await expiringSoon(EMPRESA_SEMENTE, '2027-01-01', 5, { sala: centro.id });
  assert.ok(
    naLoja.some((l) => l.lotId === primeiro.lotId),
    'o lote chegou na loja identificado',
  );

  // --- e a UNIDADE, que é a granularidade que a capa passou a usar em 8 de setembro.
  //
  // As duas metades acima são as duas falhas que estavam documentadas e em
  // contradição: a SALA emudece o aviso quando o lote sai do pátio, a EMPRESA avisa
  // sobre lote que já foi entregue. Este pedaço prende a forma que serve às duas.
  const camara = await savePlace(EMPRESA_SEMENTE, {
    name: 'Câmara da unidade',
    kind: 'cold_room',
    parentLocationId: defaultLocationId(EMPRESA_SEMENTE),
  });
  const segundo = longe[1];
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: produto.itemId,
    fromLocationId: defaultLocationId(EMPRESA_SEMENTE),
    toLocationId: camara.id,
    baseUnits: segundo.baseUnits,
    occurredAt: '2026-03-03T09:00:00.000Z',
    lotId: segundo.lotId,
  });

  const daUnidade = await expiringSoon(EMPRESA_SEMENTE, '2027-01-01', 10, {
    unidade: defaultLocationId(EMPRESA_SEMENTE),
  });
  // O que foi para a câmara DA unidade continua avisando — e pela sala sozinha ele
  // teria emudecido, que é o defeito que a capa nomeou por escrito.
  assert.ok(
    daUnidade.some((l) => l.lotId === segundo.lotId),
    'o lote na câmara fria da própria unidade continua avisando',
  );
  // E o que foi ENTREGUE não avisa mais — pela empresa ele avisaria, que é o defeito
  // que o docblock da consulta nomeou por escrito.
  assert.ok(
    !daUnidade.some((l) => l.lotId === primeiro.lotId),
    'lote entregue na loja não avisa mais na unidade — avisar dele ensina a ignorar alerta',
  );
});

test('listed packaging leaves the storeroom, per unit, and lands in the frozen cost', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const items = await listItems(EMPRESA_SEMENTE);
  const palito = items.find((i) => i.name.includes('Palito'));
  const saquinho = items.find((i) => i.name.includes('Embalagem'));
  assert.ok(palito && saquinho, 'o exemplo semeado tem palito e saquinho');

  // O produto passa a listar palito e saquinho: um de cada por unidade.
  const [produto] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  await saveProduct(EMPRESA_SEMENTE, {
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

  const relido = (await listProductsForLedger(EMPRESA_SEMENTE)).find((p) => p.id === produto.id);
  assert.equal(relido?.packagingItems.length, 2);
  assert.ok(
    relido?.packagingItems.every((l) => l.name.length > 3),
    'o nome vem do catálogo, não do JSON',
  );

  const antes = await listItems(EMPRESA_SEMENTE);
  const saldoPalito = antes.find((i) => i.id === palito.id)?.onHandBaseUnits ?? 0;
  assert.ok(saldoPalito > 0, 'o exemplo semeado comprou palito');

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: produto.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 100,
    occurredAt: '2026-03-01T10:00:00.000Z',
    producedOn: '2026-03-01',
  });

  // O que este teste existe para provar: o palito DESCEU. Até aqui ele só subia,
  // corrida após corrida, e a fábrica descobria a diferença no inventário.
  const depois = await listItems(EMPRESA_SEMENTE);
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
  const taxaPalito = (await averageRatesForLedger(EMPRESA_SEMENTE))[palito.id] ?? 0;
  const taxaSaquinho = (await averageRatesForLedger(EMPRESA_SEMENTE))[saquinho.id] ?? 0;
  assert.ok(taxaPalito > 0 && taxaSaquinho > 0, 'as notas deram preço aos dois');

  const linhaProduto = await live.getFirstAsync<{ unit_cost_rate: number }>(
    `SELECT unit_cost_rate FROM movements
      WHERE company_id = ? AND kind = 'production' AND item_id = ?
      ORDER BY recorded_at DESC LIMIT 1`,
    [EMPRESA_SEMENTE, produto.itemId],
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const items = await listItems(EMPRESA_SEMENTE);
  const palito = items.find((i) => i.name.includes('Palito'));
  assert.ok(palito, 'o exemplo semeado tem palito');
  const [produto] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  // Um palito por unidade, e uma corrida maior do que o estoque de palito.
  await saveProduct(EMPRESA_SEMENTE, {
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

  const saldo = (await listItems(EMPRESA_SEMENTE)).find((i) => i.id === palito.id);
  const demais = saldo!.onHandBaseUnits + 1;

  // A trava é a mesma dos insumos, e é por isso que a embalagem entra em
  // `needed` em vez de num caminho paralelo: sem palito, a fábrica não roda.
  await assert.rejects(
    recordProduction(EMPRESA_SEMENTE, {
      productId: produto.id,
      locationId: defaultLocationId(EMPRESA_SEMENTE),
      batches: Math.ceil(demais / 133),
      unitsProduced: demais,
      occurredAt: '2026-03-02T10:00:00.000Z',
      producedOn: '2026-03-02',
    }),
    NotEnoughStockError,
  );
});

test('a reading is a fact with a place, an hour and a unit — typed today, sensor tomorrow', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const camara = await savePlace(EMPRESA_SEMENTE, { name: 'Câmara 1', kind: 'cold_room' });
  const outra = await savePlace(EMPRESA_SEMENTE, { name: 'Câmara 2', kind: 'cold_room' });

  // Digitada na conferência: é o caminho que funciona hoje, e é fato tanto quanto
  // leitura de sensor.
  await recordReading(EMPRESA_SEMENTE, {
    locationId: camara.id,
    kind: 'temperature',
    value: -18.4,
    unit: 'C',
    takenAt: '2026-09-03T08:00:00.000Z',
  });

  // Mais tarde, mais frio - e a mesma câmara.
  await recordReading(EMPRESA_SEMENTE, {
    locationId: camara.id,
    kind: 'temperature',
    value: -12.1,
    unit: 'C',
    takenAt: '2026-09-03T14:00:00.000Z',
  });

  // Outra câmara, e outra grandeza: as duas coisas que o dono levantou, e
  // nenhuma delas precisou de tabela nova.
  await recordReading(EMPRESA_SEMENTE, {
    locationId: outra.id,
    kind: 'temperature',
    value: -20,
    unit: 'C',
    takenAt: '2026-09-03T14:00:00.000Z',
    source: 'wifi',
  });
  await recordReading(EMPRESA_SEMENTE, {
    locationId: camara.id,
    kind: 'humidity',
    value: 62,
    unit: '%',
    takenAt: '2026-09-03T14:00:00.000Z',
    source: 'zigbee',
  });

  const ultimas = await lastReadings(EMPRESA_SEMENTE);
  assert.equal(ultimas.length, 3, 'uma última por lugar e por grandeza');

  const ultimaCamara = ultimas.find((r) => r.locationId === camara.id && r.kind === 'temperature');
  assert.equal(ultimaCamara?.value, -12.1, 'a última é a mais recente, não a primeira');

  const umidade = ultimas.find((r) => r.kind === 'humidity');
  assert.equal(umidade?.unit, '%');
  assert.equal(umidade?.source, 'zigbee', 'a origem viaja com a leitura');

  // A fração sobrevive: -18,4 arredondado para -18 é meio grau de freezer, e é
  // exatamente o tipo de perda que o projeto proíbe em dinheiro e vale aqui.
  const serie = await readingsBetween(
    EMPRESA_SEMENTE,
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
    recordReading(EMPRESA_SEMENTE, {
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
  const escrita = serialize(linha, bruta ?? null, { userId: 'quem-mediu' , companyId: EMPRESA_SEMENTE });
  assert.equal(escrita.kind, 'upsert');
  if (escrita.kind === 'upsert') {
    assert.equal(escrita.row.recorded_by, 'quem-mediu', 'leitura sem autor não existe');
    assert.equal(escrita.row.device_id, null, 'digitada não tem aparelho, e isso não é lacuna');
  }
});

test('the agreement sheet is kept, corrected and queued for the server', async () => {
  const loja = await savePlace(EMPRESA_SEMENTE, {
    name: 'Loja Centro',
    kind: 'own_store',
    contactPhone: '11 98888-7777',
    deliveryDays: 4 | 32, // terça e sexta
    agreementNote: 'descarregar pelos fundos',
  });
  assert.equal(loja.deliveryDays, 36);

  const lida = (await listPlaces(EMPRESA_SEMENTE)).find((p) => p.id === loja.id);
  assert.equal(lida?.contactPhone, '11 98888-7777');
  assert.equal(lida?.deliveryDays, 36);
  assert.equal(lida?.agreementNote, 'descarregar pelos fundos');

  // Renomear não apaga o acordo: quem corrige o nome não está desmarcando a
  // sexta-feira, e uma tela que só manda o nome não pode zerar o resto.
  await savePlace(EMPRESA_SEMENTE, { id: loja.id, name: 'Loja da Praça', kind: 'own_store' });
  const depois = (await listPlaces(EMPRESA_SEMENTE)).find((p) => p.id === loja.id);
  assert.equal(depois?.name, 'Loja da Praça');
  assert.equal(depois?.deliveryDays, 36, 'o acordo sobreviveu ao apelido');
  assert.equal(depois?.contactPhone, '11 98888-7777');

  // Uma semana impossível para antes de virar linha na fila: o servidor recusa
  // por restrição, e uma fila que morre lá é uma gravação que a pessoa achou
  // que aconteceu.
  await assert.rejects(
    savePlace(EMPRESA_SEMENTE, { id: loja.id, name: 'Loja da Praça', kind: 'own_store', deliveryDays: 200 }),
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
  const escrita = serialize(daLoja, linha ?? null, { userId: 'quem' , companyId: EMPRESA_SEMENTE });
  assert.equal(escrita.kind, 'upsert');
  if (escrita.kind === 'upsert') {
    assert.equal(escrita.row.contact_phone, '11 98888-7777');
    assert.equal(escrita.row.delivery_days, 36);
    assert.equal(escrita.row.agreement_note, 'descarregar pelos fundos');
  }
});

test('what is running out answers for the room you are looking at, and for the kind', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });

  for (const item of await listItems(EMPRESA_SEMENTE)) {
    if (item.kind !== 'input' && item.kind !== 'packaging') continue;
    await recordPurchase(EMPRESA_SEMENTE, {
      itemId: item.id,
      purchaseQuantity: 1,
      baseUnits: 500_000,
      totalCents: fromDecimal(1000),
      occurredAt: '2026-02-28T08:00:00.000Z',
    });
  }
  for (let d = 1; d <= 7; d += 1) {
    await recordProduction(EMPRESA_SEMENTE, {
      productId: product.id,
      locationId: fabrica,
      batches: 1,
      unitsProduced: 100,
      occurredAt: `2026-03-0${d}T10:00:00.000Z`,
      producedOn: localDate(`2026-03-0${d}T10:00:00.000Z`, 'America/Sao_Paulo'),
    });
  }
  // Uma parte do açúcar dorme na loja. Ele tem saldo lá e nenhuma saída lá.
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar, 'o exemplo semeado tem açúcar');
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 10_000,
    occurredAt: '2026-03-01T09:00:00.000Z',
  });

  const de = '2026-03-01T00:00:00.000Z';
  const ate = '2026-03-08T00:00:00.000Z';
  const empresa = await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650);
  assert.ok(
    empresa.some((r) => r.itemId === acucar.id),
    'na empresa inteira o açúcar sai, então ele tem data de acabar',
  );

  // Na loja o mesmo açúcar está parado: tem saldo, não tem saída. Uma data de
  // acabar aqui seria inventada, e é exatamente a que a fábrica aprende a ignorar.
  const naLoja = await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650, { sala: centro.id });
  assert.ok(
    !naLoja.some((r) => r.itemId === acucar.id),
    'o que não sai daquela sala não acaba naquela sala',
  );

  // E a fábrica, que é de onde ele saiu, continua respondendo.
  const naFabrica = await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650, { sala: fabrica });
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
  const palito = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Palito'));
  assert.ok(palito, 'o exemplo semeado tem palito');
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: palito.id,
    fromLocationId: fabrica,
    toLocationId: centro.id,
    baseUnits: 20_000,
    occurredAt: '2026-03-02T09:00:00.000Z',
  });

  const soEmbalagem = await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650, { sala: fabrica }, ['packaging']);
  assert.deepEqual(
    soEmbalagem.map((r) => r.itemId),
    [palito.id],
    'pedindo embalagem, só volta embalagem',
  );
  const soInsumo = await runningOut(EMPRESA_SEMENTE, de, ate, 7, 3650, { sala: fabrica }, ['input']);
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
test('the day\u2019s lots and the recent runs say WHICH unit produced them', async () => {
  // Estas duas não somavam errado: paravam de dizer ONDE. Com duas unidades, "os
  // lotes de hoje" e "as últimas corridas" misturam duas fábricas numa lista sem
  // coluna de lugar, e quem lê conclui que a própria unidade produziu o que a outra
  // produziu. Meia verdade num cartão, que esta casa já decidiu ser pior que
  // silêncio.
  //
  // E na aba de Produção isso era incoerência da própria tela: a régua de acabar já
  // se recortava pela unidade enquanto a lista de lotes era da empresa.
  await ensureStarterData(CO);
  const marilia = await savePlace(CO, { name: 'Marília', kind: 'factory' });
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const hoje = localDate(nowIso(), 'America/Sao_Paulo');

  await recordProduction(CO, {
    productId: produto.id,
    locationId: defaultLocationId(CO),
    batches: 1,
    unitsProduced: 100,
    producedOn: hoje,
  });
  // Marília precisa ter o insumo DELA: produção lê o piso da sala onde roda, que é
  // a regra escrita do razão. Contar em Marília é o caminho honesto — é o que uma
  // unidade nova faz no primeiro dia.
  for (const insumo of (await listItems(CO)).filter(
    (i) => i.kind === 'input' || i.kind === 'packaging',
  )) {
    await recordCount(CO, {
      locationId: marilia.id,
      itemId: insumo.id,
      countedBaseUnits: 1_000_000,
    });
  }
  await recordProduction(CO, {
    productId: produto.id,
    locationId: marilia.id,
    batches: 1,
    unitsProduced: 700,
    producedOn: hoje,
  });

  const janela = dayWindow(nowIso(), 'America/Sao_Paulo');

  const daqui = await lotsOn(CO, janela.from, janela.to, { unidade: defaultLocationId(CO) });
  const deMarilia = await lotsOn(CO, janela.from, janela.to, { unidade: marilia.id });
  const daEmpresa = await lotsOn(CO, janela.from, janela.to);

  // As três respostas têm de ser DIFERENTES — se fossem iguais, o recorte não faria
  // nada e o teste passaria por acidente.
  assert.equal(daqui.length, 1, 'a unidade daqui produziu um lote hoje');
  assert.equal(daqui[0].baseUnits, 100, 'e ele é o de 100, não o de 700');
  assert.equal(deMarilia.length, 1, 'Marília produziu o dela');
  assert.equal(deMarilia[0].baseUnits, 700);
  assert.equal(daEmpresa.length, 2, 'a empresa produziu os dois');

  // O mesmo para as corridas recentes.
  const corridasDaqui = await recentRuns(CO, 10, { unidade: defaultLocationId(CO) });
  const corridasDaEmpresa = await recentRuns(CO, 10);
  assert.equal(corridasDaqui.length, 1, 'a lista de corridas daqui traz só a daqui');
  assert.equal(corridasDaqui[0].baseUnits, 100);
  assert.equal(corridasDaEmpresa.length, 2, 'e a da empresa traz as duas');
});

test('moving inside the unit is not consumption; leaving it is', async () => {
  // A regra que substituiu "transferência nunca conta quando a pergunta é da
  // empresa". Aquela era grosseira e certa com uma unidade só: com duas, mandar
  // polpa de Bauru para Marília deixaria de contar como saída de Bauru, e a
  // cobertura de lá ficaria INFINITA com a câmara vazia — o pior conselho
  // possível, porque ele cala exatamente onde falta.
  const camaraDaqui = await savePlace(CO, {
    name: 'Câmara daqui',
    kind: 'cold_room',
    parentLocationId: defaultLocationId(CO),
  });
  const outraUnidade = await savePlace(CO, { name: 'Marília', kind: 'factory' });
  const acucar = await anInput('Açúcar da unidade', 1000);

  const de = '2026-09-01T00:00:00.000Z';
  const ate = '2026-09-08T00:00:00.000Z';
  await recordCount(CO, {
    locationId: defaultLocationId(CO),
    itemId: acucar,
    countedBaseUnits: 100_000,
    occurredAt: '2026-09-01T09:00:00.000Z',
  });

  // 1. Dentro da unidade: do pátio para a câmara da própria unidade.
  await recordTransfer(CO, {
    itemId: acucar,
    fromLocationId: defaultLocationId(CO),
    toLocationId: camaraDaqui.id,
    baseUnits: 30_000,
    occurredAt: '2026-09-02T09:00:00.000Z',
  });
  const soInterno = await dailyOutflowOf(CO, acucar, de, ate, 7, {
    unidade: defaultLocationId(CO),
  });
  assert.equal(
    soInterno,
    0,
    'andar de sala para sala DENTRO da unidade não é consumo — e contar isso inverte o conselho',
  );

  // 2. Saindo da unidade: para a outra unidade da mesma empresa.
  await recordTransfer(CO, {
    itemId: acucar,
    fromLocationId: defaultLocationId(CO),
    toLocationId: outraUnidade.id,
    baseUnits: 14_000,
    occurredAt: '2026-09-03T09:00:00.000Z',
  });
  const comSaida = await dailyOutflowOf(CO, acucar, de, ate, 7, {
    unidade: defaultLocationId(CO),
  });
  assert.equal(comSaida, 2_000, 'a carga que deixou a unidade saiu mesmo: 14 mil em sete dias');

  // 3. E a empresa inteira continua vendo zero, porque nada saiu DELA — que é o
  // comportamento de antes, preservado. Se este número mudasse, o conserto teria
  // trocado o defeito de lugar em vez de resolvê-lo.
  const daEmpresa = await dailyOutflowOf(CO, acucar, de, ate, 7);
  assert.equal(daEmpresa, 0, 'da empresa nada saiu: as duas transferências foram internas a ela');
});

test('the balance of a unit is the unit plus the rooms inside it', async () => {
  // O caminho `{ unidade }` de `listItems`, que é o que quase toda tela passou a
  // usar quando pergunta "quanto eu tenho AQUI". Ele soma a unidade E as salas
  // dentro dela — somar só o pátio seria o defeito de somar de MENOS, que é o mais
  // calado dos dois porque um número menor parece prudente.
  const camaraDaqui = await savePlace(CO, {
    name: 'Câmara daqui',
    kind: 'cold_room',
    parentLocationId: defaultLocationId(CO),
  });
  const outra = await savePlace(CO, { name: 'Unidade de fora', kind: 'factory' });
  const camaraDeFora = await savePlace(CO, {
    name: 'Câmara de fora',
    kind: 'cold_room',
    parentLocationId: outra.id,
  });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de uva',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingRate: rate(0, 1),
    packaging: loose,
  });

  await recordCount(CO, { locationId: defaultLocationId(CO), itemId, countedBaseUnits: 10 });
  await recordCount(CO, { locationId: camaraDaqui.id, itemId, countedBaseUnits: 200 });
  await recordCount(CO, { locationId: camaraDeFora.id, itemId, countedBaseUnits: 3000 });

  const aqui = (await listItems(CO, undefined, false, { unidade: defaultLocationId(CO) })).find(
    (i) => i.id === itemId,
  );
  const naSalaSo = (await listItems(CO, undefined, false, { sala: defaultLocationId(CO) })).find(
    (i) => i.id === itemId,
  );
  const daEmpresa = (await listItems(CO)).find((i) => i.id === itemId);

  // Três números diferentes, e é a diferença entre eles que prova a peça: a
  // unidade soma o pátio e a câmara dela (210), a SALA soma só o pátio (10), e a
  // empresa soma tudo (3210). Se os três fossem iguais, o parâmetro não faria nada.
  assert.equal(aqui?.onHandBaseUnits, 210, 'a unidade tem de somar as salas dentro dela');
  assert.equal(naSalaSo?.onHandBaseUnits, 10, 'sala é sala: não pode arrastar a câmara');
  assert.equal(daEmpresa?.onHandBaseUnits, 3210, 'sem escopo continua sendo a empresa inteira');
});

test('the freezer of one unit does not promise for the other', async () => {
  // O defeito que este teste existe para impedir: `stockAgainstOrders` somava
  // `kind in ('factory','cold_room','store_room')` sem recorte de lugar, e com uma
  // unidade acertava — todas as salas internas eram da única. Com duas, a pergunta
  // "dá para prometer este pedido?" contava o freezer da outra cidade. O cliente
  // ouve sim e a caixa não sai.
  const marilia = await savePlace(CO, { name: 'Unidade Marília', kind: 'factory' });
  const camaraDeMarilia = await savePlace(CO, {
    name: 'Câmara de Marília',
    kind: 'cold_room',
    parentLocationId: marilia.id,
  });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de coco',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingRate: rate(0, 1),
    packaging: loose,
  });

  // Cem na primeira unidade; quatrocentos na câmara da segunda.
  await recordCount(CO, { locationId: defaultLocationId(CO), itemId, countedBaseUnits: 100 });
  await recordCount(CO, { locationId: camaraDeMarilia.id, itemId, countedBaseUnits: 400 });

  const daPrimeira = (await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO))).find(
    (d) => d.itemId === itemId,
  );
  const deMarilia = (await stockAgainstOrders(CO, '2026-09-10', marilia.id)).find(
    (d) => d.itemId === itemId,
  );

  // As duas metades, e a primeira é a que pega o defeito: sem o recorte ela veria
  // 500. A segunda garante que o recorte não emudeceu a unidade nova.
  assert.equal(daPrimeira?.onHand, 100, 'a primeira unidade prometeu com o freezer da outra');
  assert.equal(deMarilia?.onHand, 400, 'a segunda unidade não vê o próprio freezer');

  // E a soma das duas é o total da empresa, que é a prova de que nada se perdeu no
  // caminho — um recorte que esquece uma sala dá dois números menores e ninguém nota.
  assert.equal((daPrimeira?.onHand ?? 0) + (deMarilia?.onHand ?? 0), 500);
});

test('a demanda de uma unidade é a das lojas que ELA atende', async () => {
  // A outra metade do defeito de cima, e ela sobreviveu ao conserto dele: o SALDO
  // passou a ser da unidade e o PEDIDO continuou sendo da empresa inteira. Com duas
  // fábricas, as duas leem "faltam 300" para o mesmo pedido, as duas produzem, e a
  // fábrica faz o dobro do que alguém pediu.
  //
  // Quem atende quem é configuração — a loja diz de que unidade ela vem —, e o
  // padrão para quem tem uma unidade só é invisível: a única atende todas.
  const marilia = await savePlace(CO, { name: 'Unidade Marília', kind: 'factory' });
  const daqui = await savePlace(CO, {
    name: 'Loja daqui',
    kind: 'own_store',
    servedByLocationId: defaultLocationId(CO),
  });
  const deLa = await savePlace(CO, {
    name: 'Loja de lá',
    kind: 'own_store',
    servedByLocationId: marilia.id,
  });
  const { itemId } = await saveProduct(CO, {
    name: 'Picolé de uva',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingRate: rate(0, 1),
    packaging: loose,
  });

  await saveOrder(CO, { placeId: daqui.id, lines: [{ itemId, baseUnits: 300 }] });
  await saveOrder(CO, { placeId: deLa.id, lines: [{ itemId, baseUnits: 500 }] });

  const aqui = (await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO))).find(
    (d) => d.itemId === itemId,
  );
  const la = (await stockAgainstOrders(CO, '2026-09-10', marilia.id)).find(
    (d) => d.itemId === itemId,
  );

  // Números DIFERENTES e desiguais de propósito: com 300 e 300 o defeito antigo
  // (somar tudo) daria 600 nos dois lados e um teste de igualdade não distinguiria
  // "somou os dois" de "somou o próprio".
  assert.equal(aqui?.requested, 300, 'a unidade daqui recebeu o pedido da loja de lá');
  assert.equal(la?.requested, 500, 'a unidade de lá não vê o pedido que ela atende');
  assert.equal(
    (aqui?.requested ?? 0) + (la?.requested ?? 0),
    800,
    'a soma das duas tem de ser o pedido da empresa: um recorte que perde uma loja dá dois números menores e ninguém nota',
  );
});

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

  const linha = (await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO))).find((d) => d.itemId === itemId);
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

  const [demand] = await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO));
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
  const [ainda] = await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO));
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
  const [depois] = await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO));
  assert.equal(depois.requested, 0, 'pedido entregue não é mais demanda');
  assert.equal(depois.onHand, 50, 'e o saldo continua sendo o da fábrica');

  // Quem lê isto para achar FALTA continua certo de graça: as duas telas
  // filtram por `requested - onHand > 0`, e a linha de zero nunca satisfaz.
  const faltando = (await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO))).filter(
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

  await setOrdersNeedApproval(EMPRESA_SEMENTE, true);
  const pedido = await saveOrder(CO, {
    placeId: centro.id,
    requestedFor: null,
    lines: [{ itemId, baseUnits: 40 }],
  });
  assert.equal(pedido.status, 'pending');

  // E pendente já conta como compromisso: quem espera aprovação para começar a
  // produzir descobre na sexta que devia ter começado na quarta.
  const [demand] = await stockAgainstOrders(CO, '2026-09-10', defaultLocationId(CO));
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  const antes = await balanceByLocation(EMPRESA_SEMENTE, product.itemId);
  const polpa = (await listItems(EMPRESA_SEMENTE)).find((i) => /polpa/i.test(i.name))!;
  const polpaAntes = (await balanceByLocation(EMPRESA_SEMENTE, polpa.id)).find(
    (b) => b.locationId === where,
  );

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const plano = await planReversal(EMPRESA_SEMENTE, corrida.groupId);
  assert.equal(plano.blocked.length, 0, 'nada saiu ainda, então nada bloqueia');
  assert.equal(plano.alreadyReversed, false);
  // A perna do produto sai NEGATIVA: o estorno tira do estoque o que a corrida
  // pôs. As dos insumos voltam positivas.
  const doProduto = plano.legs.find((l) => l.itemId === product.itemId)!;
  assert.equal(doProduto.baseUnits, -500);
  assert.ok(plano.legs.some((l) => l.itemId === polpa.id && l.baseUnits > 0));

  await reverseGroup(EMPRESA_SEMENTE, { groupId: corrida.groupId });

  const depois = (await balanceByLocation(EMPRESA_SEMENTE, product.itemId)).find(
    (b) => b.locationId === where,
  );
  const antesDoProduto = antes.find((b) => b.locationId === where)?.baseUnits ?? 0;
  assert.equal(
    depois?.baseUnits ?? 0,
    antesDoProduto,
    'o produto volta ao saldo que tinha antes da corrida',
  );

  const polpaDepois = (await balanceByLocation(EMPRESA_SEMENTE, polpa.id)).find(
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
  assert.ok(await findLot(EMPRESA_SEMENTE, corrida.lot.id), 'o lote não some no estorno');

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
  const produzido = await productionOn(EMPRESA_SEMENTE, janela.from, janela.to);
  const doProdutoHoje = produzido.find((l) => l.itemId === product.itemId);
  assert.equal(
    doProdutoHoje?.baseUnits ?? 0,
    0,
    'a corrida estornada não conta mais como produzida — senão o almoxarifado fica certo e a capa mente',
  );
});

test('a run whose product already shipped cannot be reversed, and the refusal names what left', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const loja = (await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' })).id;

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // O saldo da fábrica pode ter picolé de antes; o que interessa é mandar
  // embora mais do que sobraria depois do estorno.
  const naFabrica =
    (await balanceByLocation(EMPRESA_SEMENTE, product.itemId)).find(
      (b) => b.locationId === fabrica,
    )?.baseUnits ?? 0;
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: product.itemId,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: naFabrica - 100,
  });

  const plano = await planReversal(EMPRESA_SEMENTE, corrida.groupId);
  assert.equal(plano.blocked.length, 1, 'o produto que já viajou bloqueia o estorno');
  assert.equal(plano.blocked[0].name, product.name);
  assert.equal(plano.blocked[0].held, 100);
  assert.equal(plano.blocked[0].needed, 500);

  await assert.rejects(
    () => reverseGroup(EMPRESA_SEMENTE, { groupId: corrida.groupId }),
    (e: unknown) => e instanceof CannotReverseError && e.plan.blocked.length === 1,
    'o erro carrega o plano, porque a tela precisa dizer QUAL item já saiu',
  );

  // E a recusa é recusa: nada foi escrito pela metade.
  const naLoja = (await balanceByLocation(EMPRESA_SEMENTE, product.itemId)).find(
    (b) => b.locationId === loja,
  );
  assert.equal(naLoja?.baseUnits, naFabrica - 100, 'a loja continua com o que recebeu');
});

test('reversing twice would double the correction, so the second time is refused', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: where,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  await reverseGroup(EMPRESA_SEMENTE, { groupId: corrida.groupId });

  const depois = await planReversal(EMPRESA_SEMENTE, corrida.groupId);
  assert.equal(depois.alreadyReversed, true);

  const saldoDepoisDoPrimeiro = (
    await balanceByLocation(EMPRESA_SEMENTE, product.itemId)
  ).find((b) => b.locationId === where)?.baseUnits;

  await assert.rejects(
    () => reverseGroup(EMPRESA_SEMENTE, { groupId: corrida.groupId }),
    (e: unknown) => e instanceof CannotReverseError && e.plan.alreadyReversed,
  );

  const saldoFinal = (await balanceByLocation(EMPRESA_SEMENTE, product.itemId)).find(
    (b) => b.locationId === where,
  )?.baseUnits;
  assert.equal(saldoFinal, saldoDepoisDoPrimeiro, 'o segundo estorno não moveu nada');
});

test('a manufactured product is worth what it cost to make, everywhere it is', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const loja = (await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' })).id;

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 500,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  // O custo congelado da corrida é a verdade; a média do produto tem que ser
  // ela, porque não havia picolé nenhum antes.
  const custos = await averageRatesForLedger(EMPRESA_SEMENTE);
  assert.ok(
    Math.abs(custos[product.itemId] - corrida.unitCostRate) < 1e-9,
    `a média do produto é o custo da corrida (média ${custos[product.itemId]}, corrida ${corrida.unitCostRate})`,
  );

  // E o valor viaja com a mercadoria. Antes disto, mandar 500 picolés para a
  // loja fazia o dinheiro evaporar: o insumo saía valorado do almoxarifado e o
  // produto entrava valendo zero na loja.
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: product.itemId,
    fromLocationId: fabrica,
    toLocationId: loja,
    baseUnits: 500,
  });

  const lugares = await stockByPlace(EMPRESA_SEMENTE);
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const where = defaultLocationId(EMPRESA_SEMENTE);

  const primeira = await recordProduction(EMPRESA_SEMENTE, {
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
  const errada = await recordProduction(EMPRESA_SEMENTE, {
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

  await reverseGroup(EMPRESA_SEMENTE, { groupId: errada.groupId });

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
    [EMPRESA_SEMENTE, product.itemId],
  );
  assert.ok(historia.length >= 3, 'as duas corridas e o estorno deixam rastro no histórico de preço');

  // A primeira corrida continua de pé: estornar a segunda não pode levar a
  // primeira junto.
  assert.ok(await findLot(EMPRESA_SEMENTE, primeira.lot.id), 'o lote da corrida boa não some');
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const { id: fria } = await savePlace(EMPRESA_SEMENTE, { name: 'Câmara fria', kind: 'cold_room' });

  const [semPrazo] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  // A validade do lote vem do PRODUTO — perguntada uma vez no cadastro, nunca no
  // chão de fábrica. O exemplo semeado nasce sem prazo, então o prazo entra aqui.
  await saveProduct(EMPRESA_SEMENTE, {
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
  const product = (await listProductsForLedger(EMPRESA_SEMENTE)).find((p) => p.id === semPrazo.id)!;

  const corrida = await recordProduction(EMPRESA_SEMENTE, {
    productId: product.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  const trintaDias = '2026-10-02';

  // No almoxarifado, antes de sair: o aviso enxerga.
  const antes = await expiringSoon(EMPRESA_SEMENTE, trintaDias, 5);
  assert.ok(
    antes.some((l) => l.code === corrida.lot.code),
    'antes de sair, o lote é avisado',
  );

  // Vai para a câmara, que é o que uma fábrica de picolés faz com picolé.
  // Com o LOTE nomeado, que é o que a tela faz: `app/transfer.tsx` manda a
  // frente da fila (o lote mais antigo). Sem ele as duas pernas saem com
  // `lot_id` nulo e o lote nunca muda de sala — o que é outra pergunta, e não
  // esta.
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: product.itemId,
    baseUnits: 400,
    fromLocationId: fabrica,
    toLocationId: fria,
    lotId: corrida.lot.id,
  });

  const depois = await expiringSoon(EMPRESA_SEMENTE, trintaDias, 5);
  assert.ok(
    depois.some((l) => l.code === corrida.lot.code),
    'depois de ir para a câmara o lote CONTINUA sendo avisado — era aqui que o aviso emudecia',
  );

  // E a pergunta por sala continua respondendo por sala, para o conserto não ter
  // sido "tirar o filtro e esquecer que ele serve para alguma coisa".
  const soNoAlmoxarifado = await expiringSoon(EMPRESA_SEMENTE, trintaDias, 5, { sala: fabrica });
  assert.ok(
    !soNoAlmoxarifado.some((l) => l.code === corrida.lot.code),
    'perguntando pelo almoxarifado, o lote que saiu não está lá — o filtro continua servindo',
  );
});


test('the seven roles arrive as profiles with no name, because the name is the screen\'s', async () => {
  const perfis = await listProfiles(EMPRESA_SEMENTE);

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
  assert.equal((await listProfiles(EMPRESA_SEMENTE)).length, 7);
});


test('a person is registered, corrected, and leaves without being deleted', async () => {
  const perfis = await listProfiles(EMPRESA_SEMENTE);
  const entregador = perfis.find((p) => p.templateRole === 'driver')!;
  const operador = perfis.find((p) => p.templateRole === 'operator')!;

  const zeca = await savePerson(EMPRESA_SEMENTE, { name: '  Zeca  ', profileId: entregador.id });
  assert.equal(zeca.name, 'Zeca', 'o espaço em volta do nome não entra na grade');

  const lista = await listPeople(EMPRESA_SEMENTE);
  assert.deepEqual(lista.map((p) => p.name), ['Zeca']);
  assert.equal(lista[0].profileId, entregador.id);

  // O perfil passa a saber quantos o vestem - é o que responde "dá para mexer
  // neste?" antes de alguém tocar.
  const comGente = await listProfiles(EMPRESA_SEMENTE);
  assert.equal(comGente.find((p) => p.id === entregador.id)?.wearers, 1);

  // Corrigir troca o perfil sem criar uma segunda pessoa.
  await savePerson(EMPRESA_SEMENTE, { id: zeca.id, name: 'Zeca', profileId: operador.id });
  assert.equal((await listPeople(EMPRESA_SEMENTE)).length, 1);
  assert.equal((await listPeople(EMPRESA_SEMENTE))[0].profileId, operador.id);

  // E sair da empresa não apaga ninguém: gente some da grade e o histórico
  // continua apontando para ela. Movimento cujo operador sumiu é movimento que
  // não se pode explicar.
  await savePerson(EMPRESA_SEMENTE, {
    id: zeca.id,
    name: 'Zeca',
    profileId: operador.id,
    active: false,
  });
  const depois = await listPeople(EMPRESA_SEMENTE);
  assert.equal(depois.length, 1, 'a pessoa continua existindo');
  assert.equal(depois[0].active, false);

  // Quem saiu não conta como quem veste o perfil - senão o dono acha que não
  // pode mexer num perfil que ninguém usa.
  const semGente = await listProfiles(EMPRESA_SEMENTE);
  assert.equal(semGente.find((p) => p.id === operador.id)?.wearers, 0);
});


test('the PIN says who touched the name, and never leaves the database', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [perfil] = await listProfiles(EMPRESA_SEMENTE);

  const zeca = await savePerson(EMPRESA_SEMENTE, {
    name: 'Zeca',
    profileId: perfil.id,
    pin: '1234',
  });
  const ana = await savePerson(EMPRESA_SEMENTE, { name: 'Ana', profileId: perfil.id });

  // A grade sabe se abre o teclado; não sabe o número. Mandar a lista de PINs
  // para a tela desenhar seis nomes seria carregar o segredo de todo mundo para
  // não usar nenhum - e o tipo `Person` não tem onde guardá-lo.
  const lista = await listPeople(EMPRESA_SEMENTE);
  assert.deepEqual(
    lista.map((p) => [p.name, p.hasPin]),
    [
      ['Ana', false],
      ['Zeca', true],
    ],
  );
  assert.equal(JSON.stringify(lista).includes('1234'), false, 'o PIN não sai do banco');

  assert.equal(await matchPin(EMPRESA_SEMENTE, zeca.id, '1234'), true);
  assert.equal(await matchPin(EMPRESA_SEMENTE, zeca.id, '4321'), false);

  // Espaço de teclado numérico de celular não deve reprovar quem digitou certo.
  assert.equal(await matchPin(EMPRESA_SEMENTE, zeca.id, ' 1234 '), true);

  // Sem PIN passa com qualquer coisa, inclusive vazio: a fábrica que não quis
  // PIN escolhe com um toque, e é isso que ela pediu.
  assert.equal(await matchPin(EMPRESA_SEMENTE, ana.id, ''), true);
  assert.equal(await matchPin(EMPRESA_SEMENTE, ana.id, '9999'), true);

  // Quem saiu não se identifica mais, mesmo sabendo o número: `active = 0` é a
  // porta fechando, e o histórico dela continua de pé.
  await savePerson(EMPRESA_SEMENTE, {
    id: zeca.id,
    name: 'Zeca',
    profileId: perfil.id,
    active: false,
  });
  assert.equal(await matchPin(EMPRESA_SEMENTE, zeca.id, '1234'), false);

  // E a edição que não falou de PIN não apagou o PIN: `undefined` é "não mexi
  // nisso", que é diferente de `null`. Quem corrige um nome não deve deixar a
  // pessoa sem se identificar sem ter pedido isso.
  await savePerson(EMPRESA_SEMENTE, {
    id: zeca.id,
    name: 'Zeca',
    profileId: perfil.id,
    active: true,
  });
  assert.equal(await matchPin(EMPRESA_SEMENTE, zeca.id, '1234'), true);

  // Nulo é o pedido explícito de tirar.
  const semPin = await savePerson(EMPRESA_SEMENTE, {
    id: zeca.id,
    name: 'Zeca',
    profileId: perfil.id,
    pin: null,
  });
  assert.equal(semPin.hasPin, false);
  assert.equal(await matchPin(EMPRESA_SEMENTE, zeca.id, 'qualquer coisa'), true);

  // A forma é recusada AQUI, e não meses depois na primeira sincronia: o
  // servidor cobra a mesma coisa na 0036, e erro que impede vale mais que erro
  // que reclama.
  await assert.rejects(
    savePerson(EMPRESA_SEMENTE, { name: 'Bia', profileId: perfil.id, pin: '12' }),
    /pin/,
  );
  await assert.rejects(
    savePerson(EMPRESA_SEMENTE, { name: 'Bia', profileId: perfil.id, pin: 'abcd' }),
    /pin/,
  );
});


test('who is holding THIS phone is a fact of the phone, not of the company', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [perfil] = await listProfiles(EMPRESA_SEMENTE);
  const ana = await savePerson(EMPRESA_SEMENTE, { name: 'Ana', profileId: perfil.id });

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
  await ensureStarterData(EMPRESA_SEMENTE);

  // O padrão é o do servidor (0011): `personal`. E nomear quem gravou é
  // desligado, que é a decisão do dono - o relatório fala de onde, não de quem.
  assert.equal(await floorSignIn(), 'personal');
  assert.equal(await namesWhoRecorded(), false);

  await setFloorSignIn(EMPRESA_SEMENTE, 'shared');

  // Ligar o piso sem UMA pessoa que administre trancaria o aparelho para sempre: a
  // saída do piso é tocar o próprio nome na grade, e instalação nova não tem gente
  // nenhuma — a semente não cadastra ninguém. Lei 5: o erro impede.
  await assert.rejects(
    () => setNamesWhoRecorded(EMPRESA_SEMENTE, true),
    /piso/,
    'entrar num piso sem saída é recusado, não avisado',
  );
  assert.equal(await namesWhoRecorded(), false, 'e a recusa não escreveu nada');

  const dono = (await listProfiles(EMPRESA_SEMENTE)).find((p) =>
    p.capabilities.includes('manage_company'),
  );
  assert.ok(dono, 'a empresa nasce com um perfil que administra');
  const rita = await savePerson(EMPRESA_SEMENTE, { name: 'Rita', profileId: dono.id });

  await setNamesWhoRecorded(EMPRESA_SEMENTE, true);
  assert.equal(await floorSignIn(), 'shared');
  assert.equal(await namesWhoRecorded(), true);

  // E voltar atrás continua sendo uma escolha — de QUEM ADMINISTRA. Com o aparelho
  // largado o piso é `operator`, e desligar o piso pede a capacidade que o piso
  // tira: era por aqui que dois toques devolviam o conjunto do dono.
  await setCurrentOperator(null);
  await assert.rejects(
    () => setNamesWhoRecorded(EMPRESA_SEMENTE, false),
    /manage_company/,
    'quem o piso rebaixa não desliga o piso',
  );

  await setCurrentOperator(rita.id);
  await setNamesWhoRecorded(EMPRESA_SEMENTE, false);
  assert.equal(await namesWhoRecorded(), false);
  await setCurrentOperator(null);
});


test('a movement written on a shared phone says who was holding it, all the way to the server', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [perfil] = await listProfiles(EMPRESA_SEMENTE);
  const ana = await savePerson(EMPRESA_SEMENTE, { name: 'Ana', profileId: perfil.id });
  const [produto] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);

  const [acucar] = (await listItems(EMPRESA_SEMENTE)).filter((i) => /ú?car/i.test(i.name));

  // Ninguém se identificou: a linha nasce sem operador, e isso é resposta e não
  // lacuna — quer dizer "esta empresa não nomeia ninguém".
  await recordPurchase(EMPRESA_SEMENTE, {
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
  await recordProduction(EMPRESA_SEMENTE, {
    productId: produto.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
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
  const escrita = serialize(linha, bruta ?? null, { userId: 'a-conta-da-empresa' , companyId: EMPRESA_SEMENTE });
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
  await recordPurchase(EMPRESA_SEMENTE, {
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

    // A loja é criada ANTES de trocar de quem segura o aparelho, pelo mesmo
    // motivo que a pessoa: `savePlace` passou a exigir `manage_company` — o
    // servidor sempre exigiu, e o aparelho não conferia. É preparação do
    // cenário, não o que este teste mede; o que ele mede é a taxa congelada.
    const loja = (await savePlace(CO, { name: 'Loja Centro', kind: 'store' })).id;

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
  const perfilDono = (await listProfiles(CO)).find((p) =>
    p.capabilities.includes('manage_company'),
  );
  assert.ok(perfilDono);
  await savePerson(CO, { name: 'Rita', profileId: perfilDono.id });

  await setFloorSignIn(CO, 'shared');
  await setNamesWhoRecorded(CO, true);
  await setCurrentOperator(null);
  assert.ok(
    !(await currentCapabilities(CO)).has('view_cost'),
    'largar o aparelho compartilhado devolve o piso, não as chaves do dono',
  );

  // Compartilhado e NÃO nomeando: o aparelho nunca pergunta, então não existe
  // estado "ainda não respondeu" — e prender o dono no piso não teria saída.
  // E desligar de volta é ato de quem administra: no piso ninguém consegue, com a
  // dona escolhida na grade sim. Antes de 9 de setembro esta linha não pedia nada,
  // e era o caminho mais curto do aparelho até a margem.
  const [rita] = await listPeople(CO);
  await setCurrentOperator(rita.id);
  await setNamesWhoRecorded(CO, false);
  await setCurrentOperator(null);
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
    /sem manage_company/,
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Norte', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);

  const agora = '2026-09-30T12:00:00.000Z';
  const dentro = '2026-09-20T12:00:00.000Z';
  const anterior = '2026-08-20T12:00:00.000Z';

  const carga = (para: string, quanto: number, quando: string) =>
    recordTransfer(EMPRESA_SEMENTE, {
      itemId: acucar.id, fromLocationId: fabrica, toLocationId: para,
      baseUnits: quanto, occurredAt: quando,
    });
  // Nos lugares INVERTIDOS de propósito: a loja é de onde a mercadoria sai.
  const volta = (de: string, quanto: number, quando: string, reason: ReturnReason) =>
    recordReturn(EMPRESA_SEMENTE, {
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

  const espelho = await storeMirror(EMPRESA_SEMENTE, 30, agora);
  assert.equal(espelho.length, 2, 'as duas lojas, e nenhuma sala nossa');

  // **A carga desfeita não chegou.** A perna do estorno é da espécie `reversal`, então
  // ela não é subtraída de `received` nem somada a `returned` — sem descartar a carga
  // original, a mercadoria que voltou para a fábrica ficava no DENOMINADOR para
  // sempre. Medido: uma devolução de um terço virava 3%.
  //
  // A asserção é IGUALDADE contra este espelho, que é o cenário de controle: mesma
  // janela, mesma loja, sem a carga que foi desfeita.
  const engano = await carga(centro.id, 500, dentro);
  await reverseGroup(EMPRESA_SEMENTE, { groupId: engano.groupId, occurredAt: agora });
  assert.deepEqual(
    await storeMirror(EMPRESA_SEMENTE, 30, agora),
    espelho,
    'uma carga lançada errada e desfeita deixa o Espelho exatamente como estava',
  );

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
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const itens = await listItems(EMPRESA_SEMENTE);
  const acucar = itens.find((i) => i.name.includes('Açúcar'));
  const picole = itens.find((i) => i.name.includes('Picolé'));
  assert.ok(acucar && picole);
  const quando = '2026-09-20T12:00:00.000Z';

  // A fábrica PRODUZ antes de mandar. Este teste transferia dez picolés que
  // ninguém tinha feito — o exemplo semeado só tem compras de insumo — e passava
  // porque a fábrica podia ficar negativa. O piso da transferência (o mesmo da
  // produção) fechou essa porta, e o cenário passa a ser o de verdade.
  const produto = (await listProductsForLedger(EMPRESA_SEMENTE)).find((p) => p.itemId === picole.id);
  assert.ok(produto, 'o picolé semeado é um produto com ficha');
  await recordProduction(EMPRESA_SEMENTE, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-19',
  });

  for (const [item, quanto] of [[acucar, 1000], [picole, 10]] as const) {
    await recordTransfer(EMPRESA_SEMENTE, {
      itemId: item.id, fromLocationId: fabrica, toLocationId: centro.id,
      baseUnits: quanto, occurredAt: quando,
    });
  }
  // Metade dos picolés volta. Somada com o açúcar, essa metade viraria 0,5% da loja.
  await recordReturn(EMPRESA_SEMENTE, {
    itemId: picole.id, fromLocationId: centro.id, toLocationId: fabrica,
    baseUnits: 5, occurredAt: quando, returnReason: 'unsold',
  });

  const [loja] = await storeMirror(EMPRESA_SEMENTE, 30, '2026-09-30T12:00:00.000Z');
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
  await ensureStarterData(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const fabrica = defaultLocationId(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar);
  const quando = '2026-09-20T12:00:00.000Z';

  const cliente = await savePlace(EMPRESA_SEMENTE, { name: 'Padaria da Praça', kind: 'customer' });

  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: fabrica, toLocationId: centro.id,
    baseUnits: 5000, occurredAt: quando,
  });
  // A loja repassa parte para um cliente: as duas pernas caem em lugares que
  // recebem carga, e é aqui que o sinal é a única coisa que separa quem mandou de
  // quem recebeu.
  await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: centro.id, toLocationId: cliente.id,
    baseUnits: 2000, occurredAt: quando,
  });
  await recordReturn(EMPRESA_SEMENTE, {
    itemId: acucar.id, fromLocationId: centro.id, toLocationId: fabrica,
    baseUnits: 500, occurredAt: quando, returnReason: 'expired',
  });

  const espelho = await storeMirror(EMPRESA_SEMENTE, 30, '2026-09-30T12:00:00.000Z');
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

test('mudar de sala não é consumir, e perguntar de uma sala não mistura o consumo das outras', async () => {
  /**
   * Os DOIS defeitos que a ficha do insumo tinha, e nenhum teste pegava.
   *
   * `dailyOutflowOf` nasceu ao lado do `runningOut` e não herdou duas coisas que
   * ele tem, ambas medidas e escritas lá:
   *
   * **1. A perna da transferência.** Mandar mercadoria para a própria loja gera
   * uma linha negativa na origem e uma positiva no destino, e a soma só olha o
   * que é negativo — então mover estoque entre salas suas aparecia como consumo.
   * Medido em 7 de setembro no irmão: depois de mandar 400 para a própria loja, a
   * régua dizia "saída de 57 por dia" com a empresa tendo as mesmas quinhentas
   * unidades. O conselho saía invertido — "compre mais" porque você moveu.
   *
   * **2. O escopo de sala.** A ficha mostra o saldo da sala aberta e dividia por
   * um consumo da empresa inteira. Abrindo a câmara fria, "acaba em" saía menor
   * do que é, e é esse número que dispara o aviso de recompra.
   *
   * A régua é dos dois lados: da EMPRESA a transferência não conta, da SALA ela
   * conta — porque a carga que saiu dali saiu mesmo.
   */
  const acucar = await anInput('Açúcar da sala', 25_000);
  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(400),
    occurredAt: '2026-09-01T09:00:00.000Z',
  });

  const loja = (await savePlace(CO, { name: 'Loja da régua', kind: 'own_store' })).id;
  const fabrica = defaultLocationId(CO);

  // Consumo de verdade: sete mil somem da fábrica na janela.
  await recordCount(CO, {
    locationId: fabrica,
    itemId: acucar,
    countedBaseUnits: 93_000,
    occurredAt: '2026-09-04T09:00:00.000Z',
  });

  // E uma transferência de catorze mil da fábrica para a própria loja, que NÃO é
  // consumo da empresa: o mesmo estoque, noutra sala.
  await recordTransfer(CO, {
    itemId: acucar,
    baseUnits: 14_000,
    fromLocationId: fabrica,
    toLocationId: loja,
    occurredAt: '2026-09-05T09:00:00.000Z',
  });

  const de = '2026-09-01T00:00:00.000Z';
  const ate = '2026-09-08T00:00:00.000Z';

  // A empresa consumiu mil por dia — a transferência não entra.
  assert.equal(
    await dailyOutflowOf(CO, acucar, de, ate, 7),
    1_000,
    'mover para a própria loja não é consumo da empresa',
  );

  // Da FÁBRICA saíram os dois: sete mil consumidos e catorze mil mandados.
  assert.equal(
    await dailyOutflowOf(CO, acucar, de, ate, 7, { sala: fabrica }),
    3_000,
    'da sala, a carga que saiu dali saiu mesmo',
  );

  // E da LOJA não saiu nada: ela só recebeu.
  assert.equal(
    await dailyOutflowOf(CO, acucar, de, ate, 7, { sala: loja }),
    0,
    'quem só recebeu não consumiu',
  );

  // A régua é régua: os três números são diferentes entre si, senão o teste
  // passaria com a sala sendo ignorada.
  assert.notEqual(1_000, 3_000, 'empresa e fábrica têm de discordar, senão o escopo não faz nada');
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

  // A perna DAQUELE estorno, escolhida pelo que ela estorna — não pela ordem.
  //
  // A primeira versão pedia `ORDER BY recorded_at` e olhava a última. As duas
  // pernas são gravadas no MESMO milissegundo quando a máquina está sob carga, e
  // empate em `ORDER BY` é sorteio: o teste falhou uma vez em três com a máquina
  // ocupada, apontando a perna de hoje como se fosse a ditada. É a lição que este
  // arquivo já traz vinte linhas acima, sobre a compra de março — escolher pelo
  // fato que o teste afirma é o que o mantém dizendo a verdade.
  const [pernaDitada] = await conn.getAllAsync<{ occurred_at: string }>(
    `SELECT occurred_at FROM movements
      WHERE company_id = ? AND item_id = ?
        AND reverses_movement_id IN (
          SELECT id FROM movements WHERE company_id = ? AND movement_group_id = ?
        )`,
    [CO, acucar, CO, outra],
  );
  assert.ok(pernaDitada, 'o segundo estorno gravou a perna dele');
  assert.equal(
    pernaDitada.occurred_at,
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

/**
 * Mudar de sala não é consumir — e sem esta regra o conselho saía invertido.
 *
 * **Medido em 7 de setembro, construindo o "produza até".** Antes de qualquer
 * carga o picolé não aparecia acabando. Depois de mandar 400 para a **própria
 * loja**, a régua dizia *"saem 57 por dia, dura 8,8 dias"* — com a empresa tendo
 * exatamente as mesmas quinhentas unidades. A perna negativa da transferência
 * entrava como saída e a positiva não compensava, porque a soma só olha o que é
 * negativo.
 *
 * O resultado seria a tela mandando **produzir mais porque você moveu estoque de
 * uma sala sua para outra** — um aviso inventado, que é o que a Lei 7 proíbe, e
 * inventado com a aparência de aritmética.
 *
 * O defeito já existia para insumo e era raro; para produto, mandar para a própria
 * loja É o fluxo normal da fábrica, e por isso ele apareceu na primeira vez em que
 * alguém perguntou por produto.
 *
 * As duas pontas, porque a régua invertida seria igualmente errada: a EMPRESA não
 * perde nada numa mudança de sala, e a SALA perde — quem pergunta de um lugar
 * quer saber o que saiu dali.
 */
test('moving stock between your own rooms is not consumption, but leaving a room is', async () => {
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
    baseUnits: 400,
  });

  const hoje = dayWindow(nowIso(), 'America/Sao_Paulo');
  const semana = dayWindow(nowIso(), 'America/Sao_Paulo', -6);

  // A EMPRESA continua com as 500: nada saiu dela, e nada está acabando.
  const daEmpresa = await runningOut(CO, semana.from, hoje.to, 7, 9999, undefined, ['product']);
  assert.deepEqual(
    daEmpresa.map((r) => r.name),
    [],
    'a empresa não perde nada mudando de sala — dizer o contrário manda produzir ' +
      'por causa de um consumo que não aconteceu',
  );

  // A FÁBRICA perde: dali saíram 400 de verdade, e quem pergunta de um lugar quer
  // saber o que saiu dali.
  const daFabrica = await runningOut(CO, semana.from, hoje.to, 7, 9999, { sala: fabrica }, ['product']);
  const linha = daFabrica.find((r) => r.itemId === product.itemId);
  assert.ok(linha, 'a fábrica vê a saída dela');
  assert.ok(
    linha.dailyOutflow > 0,
    'a carga saiu da fábrica mesmo, e a régua da SALA tem de enxergar isso — ' +
      'senão o conserto acima vira o defeito virado do avesso',
  );
});

test('erasing products takes ledger with it, and the confirmation says how much', async () => {
  /**
   * A confirmação contava zero movimento e o razão perdia linhas — medido.
   *
   * **A cicatriz, e ela tem irmã.** Quando "apagar compras" levava o razão
   * inteiro sem avisar, o conserto foi acrescentar `EraseCounts.movements` e
   * dizer o número na tela. O mesmo buraco existia em "apagar produtos" por
   * outro caminho, e por isso escapou: ali o movimento não sai por `DELETE`
   * explícito, sai por **CASCADE** de `items` (`movements.item_id ... ON DELETE
   * CASCADE`, `db.ts`), e ninguém escreve a palavra `movements` em
   * `tablesFor('products')`.
   *
   * Pior: o teste de `tallyFor` afirmava por escrito que *"apagar receita ou
   * produto não apaga movimento nenhum"*. A crença errada estava fixada com
   * asserção — que é o motivo de ninguém ter olhado.
   *
   * Aqui a régua é o banco, não a leitura: conta antes, apaga, conta depois, e
   * exige que o número anunciado seja o número perdido.
   */
  await ensureStarterData(CO);

  // O exemplo semeado sozinho não serve de régua aqui: ele traz compras de
  // insumo e nenhuma produção, então NENHUM movimento aponta para um item de
  // produto e a medição passaria por vazio. Uma corrida de tacho é o que cria a
  // linha do razão que a área "produtos" leva embora por CASCADE.
  const [produto] = await listProductsForLedger(CO);
  await recordProduction(CO, {
    productId: produto.id,
    locationId: defaultLocationId(CO),
    batches: 1,
    unitsProduced: 400,
    producedOn: '2026-09-02',
  });

  const antes = await countMovements();
  const counts = await countForErase(CO);
  const doProduto = counts.movementsOfProducts;
  assert.ok(doProduto > 0, 'o exemplo tem movimento de produto — senão a medição seria de graça');
  assert.ok(antes > doProduto, 'e tem movimento que NÃO é de produto, senão não dá para separar');

  const anunciado = tallyFor('products', counts);

  await eraseArea(CO, 'products');
  const depois = await countMovements();

  assert.equal(
    antes - depois,
    doProduto,
    'apagar produtos leva exatamente os movimentos que apontam para produto',
  );
  assert.equal(
    anunciado.movements,
    antes - depois,
    'e a confirmação anuncia esse número, não zero — a regra da casa é que ela diga o que vai acontecer',
  );
});

test('quem não administra a empresa não cadastra lugar, e o aparelho recusa antes da fila', async () => {
  /**
   * A quinta aparição da fila travada — e desta vez o servidor já estava certo.
   *
   * A política `locations_manage` exige `manage_company` desde a fundação, e o
   * papel `operator` não a tem. O aparelho não conferia nada: o celular
   * emprestado cadastrava uma loja, a linha entrava na fila, e o servidor a
   * recusaria no dia da sincronia — travando tudo o que a fábrica gravasse
   * depois, com a causa três meses atrás.
   *
   * A checagem 11 do `db:verify` documenta a QUARTA aparição desta família e
   * abriu exceção para a linha de escrituração do próprio sistema (o lugar
   * padrão, que `ensureLocation` cria no primeiro movimento de qualquer
   * aparelho). O caso do meio ficou de fora: um lugar que uma PESSOA cadastra
   * sem poder.
   *
   * Aqui a régua é dos dois lados — o dono passa, o operador é recusado — porque
   * uma recusa que recusa todo mundo também passaria neste teste.
   */
  await ensureStarterData(CO);

  // O dono cadastra, que é o caminho normal.
  const centro = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });
  assert.equal(centro.name, 'Loja Centro');

  // E o aparelho emprestado é recusado, com a razão na mensagem.
  const perfis = await listProfiles(CO);
  const operador = perfis.find((p) => p.templateRole === 'operator');
  assert.ok(operador, 'os modelos são semeados, e um deles é o operador');
  const ana = await savePerson(CO, { name: 'Ana', profileId: operador.id });
  await setCurrentOperator(ana.id);

  await assert.rejects(
    () => savePlace(CO, { name: 'Loja Norte', kind: 'own_store' }),
    /sem manage_company/,
    'o operador não cadastra lugar',
  );

  // E renomear é a mesma porta: `savePlace` faz upsert pelo id.
  await assert.rejects(
    () => savePlace(CO, { id: centro.id, name: 'Loja do Centro', kind: 'own_store' }),
    /sem manage_company/,
    'nem renomeia o que já existe',
  );

  // A premissa, presa aqui: se um dia `operator` ganhar `manage_company`, este
  // teste passa a comparar o dono com o dono e não prova nada.
  const capacidades = await currentCapabilities(CO);
  assert.equal(capacidades.has('manage_company'), false, 'o operador não administra a empresa');
});

test('a sala que nasce sozinha é a FÁBRICA, e quem já instalou é corrigido', async () => {
  /**
   * O cartão dizia "Fábrica" e a sobrelinha dizia "ALMOXARIFADO".
   *
   * `ensureLocation` gravava `store_room`, e a tela titula a sala sem nome como
   * "Fábrica" (`nomeDoLugar`) lendo a espécie para a sobrelinha. A mesma linha
   * afirmava duas coisas, e é a primeira tela que alguém abre depois de instalar.
   *
   * A outra metade é a que importa mais: **`factory` é a primeira espécie de
   * `location_kind` desde a fundação do servidor e não tinha um único escritor no
   * sistema inteiro** — peça pronta que ninguém chama, que é o defeito exato que
   * o portão P1 desta casa persegue.
   *
   * A troca é segura por medida, não por opinião: `factory` e `store_room` são as
   * duas salas INTERNAS, então nenhuma regra de carga muda de resposta. Esta
   * asserção prende isso — se um dia `factory` sair de `INTERNAL_PLACE_KINDS`, a
   * separação passa a oferecer a fábrica como destino e este teste avisa antes.
   */
  await ensureStarterData(CO);

  const lugares = await listPlaces(CO);
  const padrao = lugares.find((p) => p.id === defaultLocationId(CO));
  assert.ok(padrao, 'a sala padrão existe depois do primeiro movimento');
  assert.equal(padrao.kind, 'factory', 'a sala que nasce sozinha é a fábrica');

  // A regra que a troca não pode ter quebrado, presa aqui.
  assert.ok(
    (INTERNAL_PLACE_KINDS as readonly string[]).includes('factory'),
    'a fábrica é sala interna: se sair daqui, ela vira destino de carga na separação',
  );
  assert.ok(
    !(CARGO_PLACE_KINDS as readonly string[]).includes('factory'),
    'e não recebe carga',
  );
});

test('a sala padrão nasce sem nome, e renomear é a porta por onde ela ganha um', async () => {
  /**
   * Nenhuma tela renomeava lugar — e a sala padrão é o caso que mais precisa.
   *
   * Ela nasce com o nome VAZIO de propósito (a palavra "Fábrica" é da tela, em
   * três idiomas, e não do banco). Só que `savePlace` recusa nome vazio, então
   * qualquer edição que passasse `name: place.name` para ela era recusada — a
   * sala padrão era a única que não se podia editar, e era a primeira que
   * alguém quer chamar de "Galpão 2".
   *
   * O que este teste prende: renomear muda SÓ o nome. A espécie fica (é a
   * fábrica), o acordo fica (ausente é "não mexa"), e o id fica — porque todo
   * movimento já gravado aponta para ele.
   */
  await ensureStarterData(CO);
  const id = defaultLocationId(CO);
  const antes = (await listPlaces(CO)).find((p) => p.id === id);
  assert.ok(antes, 'a sala padrão existe');
  assert.equal(antes.name, '', 'e nasce sem nome, por desenho');

  const depois = await savePlace(CO, { id, name: 'Galpão 2', kind: antes.kind });
  assert.equal(depois.id, id, 'renomear não troca o id — o razão aponta para ele');
  assert.equal(depois.name, 'Galpão 2');
  assert.equal(depois.kind, 'factory', 'renomear não muda a espécie');

  // E o nome vazio continua recusado: sem nome, dois lugares não se distinguem.
  await assert.rejects(
    () => savePlace(CO, { id, name: '   ', kind: antes.kind }),
    /sem nome/,
    'o vazio não volta pela porta do renomear',
  );
});

test('mandar mais do que a sala tem é recusado antes de escrever — pela camada de dados', async () => {
  /**
   * A separação mandava o que estava no carrinho, e a fábrica ficava NEGATIVA.
   *
   * `app/transfer.tsx` conferia o saldo; `app/picking.tsx` comparava o carrinho
   * com o PEDIDO e não lia `available` em lugar nenhum. Duas telas, duas
   * respostas para a mesma regra — então a regra sobe para `moveBetween`, que
   * as duas atravessam, como o piso da produção já faz.
   */
  await ensureStarterData(CO);
  const acucar = await anInput('Açúcar do piso', 25_000);
  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 2,
    baseUnits: 50_000,
    totalCents: fromDecimal(200),
    occurredAt: '2026-09-01T09:00:00.000Z',
  });
  const loja = (await savePlace(CO, { name: 'Loja do piso', kind: 'own_store' })).id;
  const fabrica = defaultLocationId(CO);

  await assert.rejects(
    () =>
      recordTransfer(CO, { itemId: acucar, baseUnits: 80_000, fromLocationId: fabrica, toLocationId: loja }),
    NotEnoughStockError,
    'oitenta mil não saem de uma sala que tem cinquenta mil',
  );
  // E nada foi escrito: o saldo da fábrica é o que era.
  assert.equal((await findItem(CO, acucar, { sala: fabrica }))?.onHandBaseUnits, 50_000, 'a recusa não mexe no razão');

  // O caso verdadeiro passa, e o saldo desce exatamente o que saiu.
  await recordTransfer(CO, { itemId: acucar, baseUnits: 30_000, fromLocationId: fabrica, toLocationId: loja });
  assert.equal((await findItem(CO, acucar, { sala: fabrica }))?.onHandBaseUnits, 20_000);
  assert.equal((await findItem(CO, acucar, { sala: loja }))?.onHandBaseUnits, 30_000);
});

test('apagar tudo solta o aparelho de quem estava com ele — senão ele tranca sem volta', async () => {
  await ensureStarterData(CO);
  const perfis = await listProfiles(CO);
  const dono = perfis.find((p) => p.templateRole === 'owner');
  assert.ok(dono, 'o modelo de dono é semeado');
  const eu = await savePerson(CO, { name: 'Eu', profileId: dono.id });
  await setCurrentOperator(eu.id);
  assert.ok((await currentCapabilities(CO)).has('manage_company'), 'o dono escolhido administra');

  await eraseArea(CO, 'all');

  // A pessoa sumiu E o ponteiro sumiu: o aparelho volta ao piso do dono, e o dono
  // consegue recomeçar — que é o que "começar do zero" promete.
  assert.equal(await currentOperatorId(), null, 'ninguém está com o aparelho depois de apagar tudo');
  assert.ok((await currentCapabilities(CO)).has('manage_company'), 'e quem recomeça consegue cadastrar');
  const denovo = await savePlace(CO, { name: 'Recomeço', kind: 'own_store' });
  assert.equal(denovo.name, 'Recomeço');
});

test('a carrier is who took it — and the load says so, in the report and in the queue', async () => {
  await ensureStarterData(CO);
  const [produto] = await listProductsForLedger(CO);
  const loja = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });

  // Produz antes de mandar: transferir o que ninguém fez é o teste que passava
  // pelo motivo errado, e o piso da transferência agora recusa.
  await recordProduction(CO, {
    productId: produto.id,
    locationId: defaultLocationId(CO),
    batches: 1,
    unitsProduced: 200,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });

  const transportes = await saveCarrier(CO, { name: '  Transportes Silva  ', phone: '11 90000-0000' });
  assert.equal(transportes.name, 'Transportes Silva', 'o espaço em volta não entra no nome');

  await recordTransfer(CO, {
    itemId: produto.itemId,
    fromLocationId: defaultLocationId(CO),
    toLocationId: loja.id,
    baseUnits: 50,
    carrierId: transportes.id,
  });
  // E uma carga no carro da fábrica, para o nulo continuar sendo resposta.
  const norte = await savePlace(CO, { name: 'Loja Norte', kind: 'own_store' });
  await recordTransfer(CO, {
    itemId: produto.itemId,
    fromLocationId: defaultLocationId(CO),
    toLocationId: norte.id,
    baseUnits: 30,
  });

  // AS DUAS PERNAS levam a transportadora: a que chega na loja é a que alguém lê
  // ao perguntar "quem trouxe isso?".
  const pernas = await live.getAllAsync<{ carrier_id: string | null; location_id: string }>(
    `SELECT carrier_id, location_id FROM movements
      WHERE company_id = ? AND kind = 'transfer' AND carrier_id IS NOT NULL`,
    [CO],
  );
  assert.equal(pernas.length, 2, 'a carga com transportadora grava as duas pernas com o nome dela');
  assert.deepEqual(
    [...new Set(pernas.map((l) => l.location_id))].sort(),
    [defaultLocationId(CO), loja.id].sort(),
    'uma perna na fábrica e uma na loja',
  );

  // O relatório do dia diz quem levou onde levou — e cala onde foi o carro da casa.
  const hoje = await shipmentsOn(CO, '2000-01-01T00:00:00.000Z', '2100-01-01T00:00:00.000Z');
  const paraLoja = hoje.find((r) => r.locationId === loja.id);
  const paraNorte = hoje.find((r) => r.locationId === norte.id);
  assert.equal(paraLoja?.carrierName, 'Transportes Silva');
  assert.equal(paraNorte?.carrierName, null, 'sem transportadora é nulo, não é uma frase');

  // Duas cargas para a MESMA loja, uma na transportadora e outra no carro da casa:
  // a tela cala em vez de dizer meia verdade. Foi o caso que a mordida não pegou,
  // e pensar nele mostrou que a regra estava errada — não o teste.
  await recordTransfer(CO, {
    itemId: produto.itemId,
    fromLocationId: defaultLocationId(CO),
    toLocationId: loja.id,
    baseUnits: 10,
  });
  const misturado = await shipmentsOn(CO, '2000-01-01T00:00:00.000Z', '2100-01-01T00:00:00.000Z');
  assert.equal(
    misturado.find((r) => r.locationId === loja.id)?.carrierName,
    null,
    'divergiu como foi, então a tela não nomeia ninguém',
  );

  // A fila leva o cadastro, senão o servidor recusa o movimento que aponta para ele.
  const naFila = await live.getAllAsync<{ row_id: string }>(
    `SELECT row_id FROM outbox WHERE table_name = 'carriers'`,
  );
  assert.deepEqual(naFila.map((l) => l.row_id), [transportes.id]);
});

test('a carrier leaves use without leaving the record, and only an admin registers one', async () => {
  await ensureStarterData(CO);
  const quem = await saveCarrier(CO, { name: 'Expresso Norte' });

  await saveCarrier(CO, { id: quem.id, name: 'Expresso Norte', active: false });
  const todas = await listCarriers(CO);
  assert.equal(todas.length, 1, 'tirar de uso não apaga');
  assert.equal(todas[0].active, false);

  // E o portão, nos dois sentidos: o operador não cadastra.
  const perfis = await listProfiles(CO);
  const operador = perfis.find((p) => p.templateRole === 'operator');
  assert.ok(operador, 'o exemplo semeia o perfil de operador');
  const pessoa = await savePerson(CO, { name: 'Zeca', profileId: operador.id });
  await setCurrentOperator(pessoa.id);
  await assert.rejects(
    () => saveCarrier(CO, { name: 'Fretes do Zeca' }),
    /transportadora/,
    'celular emprestado não cadastra transportadora — o servidor recusaria e a fila travaria',
  );
  await setCurrentOperator(null);
});

test('a conta do apagar enxerga as quatro coisas que sumiam sem número', async () => {
  /**
   * **Este teste existe por um buraco que eu abri e a suíte não viu.** Ao desfazer
   * uma mordida com `git checkout`, apaguei junto o SQL que conta a série da câmara,
   * a grade, o histórico de preço e os preços combinados — e os 503 testes ficaram
   * verdes. Contagem sem quem a confira é um número que ninguém garante.
   *
   * A asserção é igualdade contra outra fonte: o que a fábrica criou, contado à mão
   * aqui, contra o que a consulta devolve. A grade entra como UM número somando as
   * três tabelas — e é por isso que ela vale 3 com uma linha, um tipo e um sabor.
   */
  await ensureStarterData(CO);
  const [produto] = await listProductsForLedger(CO);
  const loja = await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' });

  const linha = await saveLine(CO, { name: 'Picolé' });
  const tipo = await saveType(CO, { lineId: linha, name: 'Tradicional' });
  const sabor = await saveFlavor(CO, { name: 'Uva' });
  assert.ok(linha && tipo && sabor, 'a grade foi criada');

  await recordReading(CO, {
    locationId: defaultLocationId(CO),
    kind: 'temperature',
    value: -18,
    unit: '°C',
  });

  // Dois preços de venda para o mesmo item: a tabela é append-only, então o
  // histórico fica com duas linhas e o combinado com uma.
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: null, rate: rate(2.5, 1) });
  await saveSalePrice(CO, { itemId: produto.itemId, placeId: loja.id, rate: rate(2.2, 1) });

  const conta = await countForErase(CO);

  const naMao = async (sql: string) =>
    (await live.getFirstAsync<{ n: number }>(sql, [CO]))?.n ?? 0;

  assert.equal(conta.readings, await naMao(`SELECT COUNT(*) AS n FROM readings WHERE company_id = ?`));
  assert.ok(conta.readings > 0, 'a leitura entrou — senão a igualdade acima seria 0 = 0');

  const grade =
    (await naMao(`SELECT COUNT(*) AS n FROM product_lines WHERE company_id = ?`)) +
    (await naMao(`SELECT COUNT(*) AS n FROM product_types WHERE company_id = ?`)) +
    (await naMao(`SELECT COUNT(*) AS n FROM flavors WHERE company_id = ?`));
  assert.equal(conta.grid, grade, 'a grade é a soma das três tabelas, e some inteira');
  assert.ok(grade >= 3, 'linha, tipo e sabor existem — senão a soma não prova a soma');

  assert.equal(
    conta.salePrices,
    await naMao(`SELECT COUNT(*) AS n FROM sale_price_history WHERE company_id = ?`),
  );
  assert.ok(conta.salePrices >= 2, 'o histórico guardou os dois preços');
  assert.equal(
    conta.agreedPrices,
    await naMao(`SELECT COUNT(*) AS n FROM location_prices WHERE company_id = ?`),
  );
  assert.ok(conta.agreedPrices >= 1, 'e o combinado com a loja está lá');
});

/**
 * A VENDA — o fato que faltava para a margem existir, e quem o descobre.
 *
 * `movement_kind` tem `sale` desde a `0001`, com a intenção escrita ao lado
 * (*"sold to a customer (revenue + margin)"*), e atravessou quarenta e seis migrações
 * **sem um único escritor**. O razão sabia o que a fábrica produziu e para que loja
 * mandou, e perdia o picolé de vista ali: vendido, derretido ou no freezer, o
 * aplicativo não tinha como saber. Com o custo congelado de um lado e o preço
 * combinado do outro, o que faltava entre os dois era este.
 *
 * Quem o descobre é a CONTAGEM, e não um ponto de venda — decisão de padrão, com o
 * ponto de venda ficando como configuração de quem o quiser. Os dois números que
 * importam neste bloco são conferidos à mão: 340 × 220 centavos = 74.800, e a taxa
 * não arredonda em lugar nenhum do caminho.
 */
async function umaLojaComPicole(): Promise<{ loja: string; produto: string; itemId: string }> {
  await ensureStarterData(CO);
  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(CO);
  const loja = (await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' })).id;

  await recordProduction(CO, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  await recordTransfer(CO, {
    itemId: produto.itemId,
    baseUnits: 400,
    fromLocationId: fabrica,
    toLocationId: loja,
  });
  return { loja, produto: produto.id, itemId: produto.itemId };
}

/**
 * Os DOIS mundos de onde a corrida consome — e é a existência dos dois que fecha a regra.
 *
 * O padrão (`unidade`) foi decidido sob defeito em 8 de setembro: a tela lia o piso da
 * unidade e a escrita conferia uma sala, então com a polpa na câmara fria nenhuma corrida
 * rodava. A saída era escolher, e escolher foi meu — a outra opção obrigaria a lançar
 * transferência antes de cada corrida.
 *
 * **Fixar o padrão fecha METADE da regra da casa.** *"Depende de quem usa"* vira
 * configuração, e o que se decide é o padrão, nunca o único. Este teste é o par: prova que
 * o mundo estrito existe de verdade e que ele muda a resposta — uma configuração que dá o
 * mesmo resultado nos dois valores não é configuração, é decoração com teste verde.
 */
test('the two worlds of where a run draws from both exist, and the setting is what picks', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const [product] = (await listProductsForLedger(EMPRESA_SEMENTE)).filter((p) => p.recipeId);
  const unidade = defaultLocationId(EMPRESA_SEMENTE);
  const { id: camara } = await savePlace(EMPRESA_SEMENTE, {
    name: 'Câmara fria',
    kind: 'cold_room',
    parentLocationId: unidade,
  });

  const insumos = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.onHandBaseUnits > 0);
  for (const insumo of insumos) {
    await recordTransfer(EMPRESA_SEMENTE, {
      itemId: insumo.id,
      baseUnits: insumo.onHandBaseUnits,
      fromLocationId: unidade,
      toLocationId: camara,
    });
  }

  const rodar = () =>
    recordProduction(EMPRESA_SEMENTE, {
      productId: product.id,
      locationId: unidade,
      batches: 1,
      unitsProduced: 400,
      producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
    });

  // Mundo estrito: o piso é a sala em que a corrida roda, e a polpa está na câmara.
  // A recusa aqui não é defeito — é a fábrica que quer saldo DECLARADO sendo atendida,
  // e o conserto dela é a transferência, que a tela passou a saber fazer.
  await setConsumoDaProducao('sala');
  await assert.rejects(rodar, (e: unknown) => e instanceof NotEnoughStockError);

  // Mundo padrão: a câmara fica a três metros e conta.
  await setConsumoDaProducao('unidade');
  const feito = await rodar();
  assert.equal(feito.unitsProduced, 400);

  // E a configuração é do APARELHO enquanto a sincronia for de mão única — está escrito
  // em `docs/roadmap.md` como dívida estrutural, e não se finge aqui que ela desce.
  assert.equal(await consumoDaProducao(), 'unidade');
});

test('a count at our own store books what left the shelf as a SALE, at the agreed price', async () => {
  const { loja, itemId } = await umaLojaComPicole();

  // Tabela 2,50 e o combinado com esta loja 2,20. O combinado tem de vencer: sem
  // isso a loja que negociou faturaria pelo catálogo e a margem dela sairia inflada
  // em treze por cento — para CIMA, que é o lado perigoso de errar dinheiro.
  await saveSalePrice(CO, { itemId, placeId: null, rate: rate(2.5, 1) });
  await saveSalePrice(CO, { itemId, placeId: loja, rate: rate(2.2, 1) });

  const r = await recordCount(CO, { itemId, countedBaseUnits: 60, locationId: loja });

  assert.equal(r.expectedBaseUnits, 400);
  assert.equal(r.deltaBaseUnits, -340);
  assert.ok(r.sold, 'a falta numa loja própria é venda, e o resultado tem de dizer isso');
  assert.equal(r.sold.baseUnits, 340);
  // A régua independente: 340 unidades a 220 centavos são 74.800 centavos. O número
  // não vem de nenhuma função do sistema — está multiplicado à mão aqui.
  assert.equal(r.sold.revenueCents, 74_800, 'R$ 748,00 — 340 × R$ 2,20, feito na mão');

  const linha = await live.getFirstAsync<{
    kind: string;
    quantity_base_units: number;
    unit_price_rate: number | null;
    unit_cost_rate: number | null;
  }>(
    `SELECT kind, quantity_base_units, unit_price_rate, unit_cost_rate
       FROM movements WHERE company_id = ? AND item_id = ? AND location_id = ? AND kind = 'sale'`,
    [CO, itemId, loja],
  );
  assert.ok(linha, 'e o razão guarda a venda, não uma correção');
  assert.equal(linha.quantity_base_units, -340);
  assert.ok(
    linha.unit_price_rate !== null && Math.abs(linha.unit_price_rate - 220) < 1e-9,
    `o preço fica congelado na linha: ${linha.unit_price_rate}`,
  );
  // O custo congelado continua ali, e é o que faz a margem ser uma subtração dentro
  // de uma linha em vez de uma junção com uma tabela que pode ser renegociada amanhã.
  assert.ok(
    linha.unit_cost_rate !== null && linha.unit_cost_rate > 0,
    'sem o custo na mesma linha, renegociar o preço em março reescreveria a margem de fevereiro',
  );

  /**
   * **E o EXTRATO diz o mesmo número que a confirmação prometeu.**
   *
   * Ele valorizava todo ato pelo custo congelado, inclusive as linhas de venda que a
   * contagem numa loja própria passou a gravar: a confirmação dizia R$ 748,00 e o
   * extrato mostrava o que aquilo custou para fazer, debaixo do rótulo "Venda".
   * Dois números para o mesmo ato, e o de baixo com a palavra do de cima.
   *
   * `unit_price_rate` tinha escritor e ZERO leitores no aplicativo inteiro.
   *
   * A régua é independente das duas: 74.800 está multiplicado à mão acima, e a
   * asserção compara o extrato com ELE, não com o que `recordCount` devolveu.
   */
  const extrato = await ledgerExtract(CO, {});
  const aVenda = extrato.find((a) => a.kind === 'sale');
  assert.ok(aVenda, 'a venda é um ato do extrato');
  assert.equal(
    aVenda.valueCents,
    74_800,
    'o extrato mostra o que a venda valeu, não o que ela custou para fazer',
  );
  assert.notEqual(
    aVenda.valueCents,
    Math.round((linha.unit_cost_rate ?? 0) * 340),
    'as duas réguas dão números diferentes — é por isso que escolher a errada aparecia',
  );
});

test('a count in our own cold room is an adjustment, and carries no price', async () => {
  await ensureStarterData(CO);
  const camara = (
    await savePlace(CO, {
      name: 'Câmara fria',
      kind: 'cold_room',
      parentLocationId: defaultLocationId(CO),
    })
  ).id;
  const insumo = (await listItems(CO)).find((i) => i.onHandBaseUnits > 0);
  assert.ok(insumo, 'o exemplo semeado tem insumo com saldo');
  await recordTransfer(CO, {
    itemId: insumo.id,
    baseUnits: insumo.onHandBaseUnits,
    fromLocationId: defaultLocationId(CO),
    toLocationId: camara,
  });

  const r = await recordCount(CO, {
    itemId: insumo.id,
    countedBaseUnits: insumo.onHandBaseUnits - 500,
    locationId: camara,
  });

  assert.equal(r.deltaBaseUnits, -500);
  assert.equal(r.sold, null, 'ninguém compra polpa da nossa câmara fria: falta é falta');
  const linha = await live.getFirstAsync<{ kind: string; unit_price_rate: number | null }>(
    `SELECT kind, unit_price_rate FROM movements
      WHERE company_id = ? AND item_id = ? AND location_id = ? AND quantity_base_units = -500`,
    [CO, insumo.id, camara],
  );
  assert.equal(linha?.kind, 'adjustment', 'o nome certo para "o mundo discordou do livro"');
  assert.equal(linha?.unit_price_rate, null, 'e uma correção não tem preço de venda');
});

test('more than expected at the store is an adjustment — nobody un-sells a popsicle', async () => {
  const { loja, itemId } = await umaLojaComPicole();
  await saveSalePrice(CO, { itemId, placeId: loja, rate: rate(2.2, 1) });

  const r = await recordCount(CO, { itemId, countedBaseUnits: 430, locationId: loja });

  assert.equal(r.deltaBaseUnits, 30);
  assert.equal(r.sold, null, 'achar MAIS do que o livro diz é erro de contagem, nunca receita');
  const linha = await live.getFirstAsync<{ kind: string }>(
    `SELECT kind FROM movements
      WHERE company_id = ? AND item_id = ? AND location_id = ? AND quantity_base_units = 30`,
    [CO, itemId, loja],
  );
  assert.equal(linha?.kind, 'adjustment', 'venda negativa poria receita inventada no razão');
});

test('with no price agreed the sale is still recorded, and the revenue is null instead of zero', async () => {
  const { loja, itemId } = await umaLojaComPicole();
  // Nenhum `saveSalePrice`: a fábrica nunca cadastrou preço deste produto.

  const r = await recordCount(CO, { itemId, countedBaseUnits: 100, locationId: loja });

  assert.ok(r.sold, 'a quantidade vendida é fato mesmo sem preço');
  assert.equal(r.sold.baseUnits, 300);
  assert.equal(r.sold.priceRate, null);
  assert.equal(
    r.sold.revenueCents,
    null,
    'zero diria "vendido de graça", que é uma afirmação sobre o mundo; nulo diz "ninguém disse por quanto"',
  );
  // E a contagem ACONTECEU: recusá-la por falta de preço seria deixar de proteger o
  // saldo por causa de um número que ninguém precisou digitar ainda.
  const saldo = (await listItems(CO, undefined, false, { sala: loja })).find((i) => i.id === itemId);
  assert.equal(saldo?.onHandBaseUnits, 100);
});

test('the loss goes in first and the count sells what is left — the order is the rule', async () => {
  const { loja, itemId } = await umaLojaComPicole();
  await saveSalePrice(CO, { itemId, placeId: loja, rate: rate(2.2, 1) });

  // Quarenta derreteram no freezer da loja, e isso tem tela própria e motivo
  // obrigatório. Lançado ANTES, ele já sai do saldo esperado.
  await recordLoss(CO, { itemId, baseUnits: 40, reason: 'melted', locationId: loja });

  const r = await recordCount(CO, { itemId, countedBaseUnits: 60, locationId: loja });

  // 400 - 40 = 360 esperados; 60 na prateleira; 300 vendidos. Se a perda não tivesse
  // sido lançada, o sistema chamaria os 340 de venda e a receita sairia 8.800
  // centavos a mais — inflada, que é a direção perigosa.
  assert.equal(r.expectedBaseUnits, 360, 'a perda já saiu do que o livro esperava');
  assert.ok(r.sold);
  assert.equal(r.sold.baseUnits, 300);
  assert.equal(r.sold.revenueCents, 66_000, 'R$ 660,00 — 300 × R$ 2,20, feito na mão');

  // E cada fato mantém o nome dele: a perda continua perda, com motivo.
  const perda = await live.getFirstAsync<{ kind: string; loss_reason: string | null }>(
    `SELECT kind, loss_reason FROM movements
      WHERE company_id = ? AND item_id = ? AND location_id = ? AND quantity_base_units = -40`,
    [CO, itemId, loja],
  );
  assert.equal(perda?.kind, 'loss');
  assert.equal(perda?.loss_reason, 'melted');
});

test('undoing a sale gives the shelf back, because a sale is a movement like any other', async () => {
  const { loja, itemId } = await umaLojaComPicole();
  await saveSalePrice(CO, { itemId, placeId: loja, rate: rate(2.2, 1) });
  await recordCount(CO, { itemId, countedBaseUnits: 60, locationId: loja });

  const venda = await live.getFirstAsync<{ movement_group_id: string }>(
    `SELECT movement_group_id FROM movements
      WHERE company_id = ? AND item_id = ? AND kind = 'sale'`,
    [CO, itemId],
  );
  assert.ok(venda?.movement_group_id, 'uma contagem é o próprio grupo, senão ela não se desfaz');

  const plano = await planReversal(CO, venda.movement_group_id);
  assert.equal(plano.blocked.length, 0, 'devolver picolé à prateleira não tira nada de ninguém');
  await reverseGroup(CO, { groupId: venda.movement_group_id });

  const saldo = (await listItems(CO, undefined, false, { sala: loja })).find((i) => i.id === itemId);
  assert.equal(saldo?.onHandBaseUnits, 400, 'o estorno é uma linha nova que nega a anterior');
});

/**
 * O entregador não trava a fila do celular inteiro com um toque.
 *
 * **Achado em 9 de setembro, e estava vivo.** Nenhuma das sete escritas conferia
 * capacidade, e o botão de desfazer do extrato não tinha portão nenhum. O SQLite aceita
 * qualquer linha — não tem política, papel nem capacidade —, o servidor tem
 * `movements_append` e recusa, e `drain` **para na primeira linha recusada**. Parar está
 * certo para uma lacuna de dependência, que a tentativa seguinte resolve; é fatal para
 * uma recusa por permissão, que nenhuma resolve.
 *
 * `driver` é `['dispatch','check_receipt','record_loss']` — sem `adjust_stock`. Um toque
 * em "Desfazer" e aquele celular nunca mais sincronizava, **sem erro na tela**, porque
 * no aparelho a linha entrava. A fábrica descobriria semanas depois, com tudo o que ela
 * gravou preso atrás de uma linha.
 *
 * As duas metades importam e as duas estão aqui: o que ele NÃO alcança é recusado antes
 * de nascer, e o que ele alcança continua passando — um portão que recusa tudo protege a
 * fila e mata o aplicativo.
 */
test('a driver cannot jam the queue with a row the server will refuse', async () => {
  await ensureStarterData(CO);
  const perfis = await listProfiles(CO);
  const entregador = perfis.find((p) => p.templateRole === 'driver')!;
  const zeca = await savePerson(CO, { name: 'Zeca', profileId: entregador.id });

  const [produto] = (await listProductsForLedger(CO)).filter((p) => p.recipeId);
  const fabrica = defaultLocationId(CO);
  const loja = (await savePlace(CO, { name: 'Loja Centro', kind: 'own_store' })).id;
  await recordProduction(CO, {
    productId: produto.id,
    locationId: fabrica,
    batches: 1,
    unitsProduced: 400,
    producedOn: localDate(nowIso(), 'America/Sao_Paulo'),
  });
  const carga = await recordTransfer(CO, {
    itemId: produto.itemId,
    baseUnits: 100,
    fromLocationId: fabrica,
    toLocationId: loja,
  });

  // Agora quem está com o celular é o entregador.
  await setCurrentOperator(zeca.id);

  // Desfazer escreve `reversal`, que o servidor dá a quem tem `adjust_stock`.
  await assert.rejects(
    () => reverseGroup(CO, { groupId: carga.groupId }),
    (e: unknown) => {
      assert.ok(e instanceof SemPermissaoError, `veio ${(e as Error)?.name}`);
      assert.equal(e.kind, 'reversal', 'a tela precisa da espécie para dizer o que não deu');
      return true;
    },
  );

  // Contar também: `adjustment` pede a mesma capacidade.
  await assert.rejects(
    () => recordCount(CO, { itemId: produto.itemId, countedBaseUnits: 10, locationId: loja }),
    (e: unknown) => e instanceof SemPermissaoError,
  );

  // E a outra metade, que é a que impede o portão de virar uma parede: o que o
  // entregador ALCANÇA continua passando. Ele tem `dispatch`, então carregar é dele.
  const outra = await recordTransfer(CO, {
    itemId: produto.itemId,
    baseUnits: 50,
    fromLocationId: fabrica,
    toLocationId: loja,
  });
  assert.ok(outra.groupId, 'quem entrega continua entregando');

  // E `record_loss` também é dele: a caixa quebrada no caminhão é notícia que ele dá.
  const perdeu = await recordLoss(CO, {
    itemId: produto.itemId,
    baseUnits: 10,
    reason: 'broken',
    locationId: loja,
  });
  assert.equal(perdeu.baseUnits, 10);
});
