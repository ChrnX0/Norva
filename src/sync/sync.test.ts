import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { __setDb, db, migrate, type Db, type SqlParam } from '@/data/db';
import { markSent, pendingCount, pendingEntries, type OutboxEntry } from '@/data/outbox';
import { fromDecimal } from '@/domain/money';
import { recordPurchase, saveItem, saveRecipeVersion, eraseArea } from '@/data/repository';
import { ensureStarterData } from '@/data/seed';
import { CHAVE_DA_EMPRESA, EMPRESA_SEMENTE, carregarEmpresa } from '@/data/empresa';
import { writeMeta } from '@/data/meta';
import { backoffMs, drain, type PushResult, type Transport } from './engine';

/**
 * The queue and the engine, against a real database and a fake server.
 *
 * The failures worth catching here are the quiet ones: a write that never got
 * queued and so never syncs, and an entry marked sent that the server never
 * actually stored. Neither shows up as an error - both show up months later as
 * a number that does not match.
 */

function inMemoryDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  return {
    getAllAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      (sqlite.prepare(sql).get(...params) as T) ?? null,
    runAsync: async (sql: string, params: SqlParam[] = []) => sqlite.prepare(sql).run(...params),
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

/**
 * A empresa destes testes NÃO é a semente — e isso é a metade que faltava.
 *
 * Enquanto `CO` era a semente, estes testes provavam que a fila sobe **de um
 * aparelho que não sabe de que empresa é** — exatamente o caso que o servidor
 * recusa em bloco. O `drain` agora recusa antes de tentar, e é por isso que aqui
 * a empresa é um uuid de verdade e o aparelho a adota no `beforeEach`: um teste
 * de sincronia tem de partir do estado em que sincronizar é legítimo.
 */
const CO = 'b7d41e02-5a63-4c88-9f2a-0000000000d1';

/** Guardada para um teste poder perguntar ao ESQUEMA, e não só ao dado. */
let live: Db;

beforeEach(async () => {
  const conn = inMemoryDb();
  await migrate(conn);
  __setDb(conn);
  live = conn;
  // O aparelho sabe de que empresa é — o fato, não a semente.
  await writeMeta(CHAVE_DA_EMPRESA, CO);
  await carregarEmpresa();
});

/** Accepts everything, and remembers what it was handed. */
function acceptingServer(): Transport & { received: OutboxEntry[][] } {
  const received: OutboxEntry[][] = [];
  return {
    received,
    push: async (entries) => {
      received.push([...entries]);
      return { acceptedIds: entries.map((e) => e.id) };
    },
  };
}

test('every write queues itself, and nothing writes without queueing', async () => {
  const sugar = await saveItem(CO, {
    kind: 'input',
    name: 'Açúcar',
    purchaseUnit: 'saco',
    purchaseToBase: 25_000,
    baseUnit: 'g',
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
  });

  await recordPurchase(CO, {
    itemId: sugar,
    purchaseQuantity: 1,
    baseUnits: 25_000,
    totalCents: fromDecimal(118),
  });

  await saveRecipeVersion(CO, {
    name: 'Base',
    yieldAmount: 10_000,
    yieldUnit: 'ml',
    lossFraction: 0,
    lines: [{ kind: 'item', itemId: sugar, quantity: 1_000 }],
  });

  const queued = await pendingEntries();
  const tables = queued.map((e) => e.table);

  assert.deepEqual(tables, [
    'items',
    // The place the stock arrives at, queued the one time it is created - and
    // ahead of the movement that stands on it, which is what stops the first
    // sync failing a foreign key.
    'locations',
    'purchases',
    // The line, not only its header: the server's costing trigger fires on an
    // insert into `purchase_lines`, so a header alone replays as an invoice
    // that moved no cost and wrote no history.
    'purchase_lines',
    // The arrival in the ledger. It queues beside the invoice rather than being
    // recomputed on the server: a movement written in a freezer with no signal
    // has to reach the server as the record it already is.
    'movements',
    // `item_costs` is deliberately absent. The average is derived, and a
    // derived number gets one author: this device computes its own to survive
    // offline, the server computes its own from these same lines. Sending both
    // gave the figure two authors and they disagreed on the first real replay.
    'recipes',
    'recipe_versions',
    // And its lines. A version that lands without them is a recipe that costs
    // nothing on the other device.
    'recipe_lines',
  ]);
  assert.ok(queued.every((e) => e.op === 'upsert'));
  assert.equal(queued[0].rowId, sugar);
});

test('a failed write leaves nothing behind, in the data or in the queue', async () => {
  // A recipe line pointing at an item that does not exist trips a foreign key
  // halfway through, after the recipe row has already been inserted.
  await assert.rejects(() =>
    saveRecipeVersion(CO, {
      name: 'Impossível',
      yieldAmount: 1_000,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [{ kind: 'item', itemId: 'nao-existe', quantity: 1 }],
    }),
  );

  assert.equal(await pendingCount(), 0, 'a rolled back write must not leave a queued one');
});

test('erasing queues the decision, so the server does not send it all back', async () => {
  await ensureStarterData(CO);
  await markSent((await pendingEntries(500)).map((e) => e.id));

  await eraseArea(CO, 'products');

  const queued = await pendingEntries();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].op, 'delete');
  assert.equal(queued[0].rowId, 'products');
});

test('the queue goes up in the order it was written', async () => {
  await ensureStarterData(CO);
  const server = acceptingServer();

  const report = await drain(server, { batchSize: 500 });

  assert.equal(report.remaining, 0);
  assert.ok(report.sent > 0, 'a fila desta fábrica não pode subir vazia — senão a ordem abaixo mede nada');

  const order = server.received[0].map((e) => e.table);
  // Items before the purchases that reference them, recipes before versions.
  assert.ok(order.indexOf('items') < order.indexOf('purchases'));
  assert.ok(order.indexOf('recipes') < order.indexOf('recipe_versions'));
});

test('only what the server confirmed is marked sent', async () => {
  await ensureStarterData(CO);

  // Accepts the first half of whatever it is given, drops the rest.
  const half: Transport = {
    push: async (entries): Promise<PushResult> => ({
      acceptedIds: entries.slice(0, Math.floor(entries.length / 2)).map((e) => e.id),
    }),
  };

  const before = await pendingCount();
  const report = await drain(half, { batchSize: 500, maxAttempts: 1, sleep: async () => {} });

  assert.ok(report.error, 'a partial acceptance is reported, not swallowed');
  // O FATO, não a frase. Era `assert.match(report.error, /aceitou/)` — casando uma palavra
  // portuguesa que o motor montava, e que a tela imprimia crua. A asserção passava por estar
  // certa sobre o texto e por isso protegia o defeito: quem lesse o verde concluiria que a
  // parada estava bem relatada.
  assert.equal(report.error.motivo, 'servidorRecusou', 'o servidor respondeu e disse não');
  assert.equal(report.error.de, before, 'a fatia oferecida inteira');
  assert.equal(report.error.aceitos, report.sent, 'e o que dela entrou');
  assert.equal(report.remaining, before - report.sent, 'the rest is still queued, to the row');
  assert.ok(report.remaining > 0, 'sobrou fila: a aceitação foi parcial de verdade');
});

test('a server that throws loses nothing and retries with backoff', async () => {
  await ensureStarterData(CO);
  const before = await pendingCount();

  const waits: number[] = [];
  const broken: Transport = {
    push: async () => {
      throw new Error('sem rede');
    },
  };

  const report = await drain(broken, {
    maxAttempts: 3,
    sleep: async (ms) => {
      waits.push(ms);
    },
  });

  assert.equal(report.sent, 0);
  assert.equal(report.remaining, before, 'nothing was marked, nothing was lost');
  assert.equal(report.attempts, 3);
  // A chamada NÃO VOLTOU, que é outra coisa que o servidor recusar — e a frase da biblioteca
  // fica no `cru`, guardada para um suporte e nunca mostrada a quem está de luva.
  assert.equal(report.error?.motivo, 'transporteCaiu', 'ninguém recusou: não deu para falar');
  assert.match(report.error?.cru ?? '', /sem rede/, 'e a frase do programador fica guardada');
  assert.deepEqual(waits, [1_000, 2_000], 'it waits longer each time, and not after the last');
});

test('sending the same queue twice is harmless', async () => {
  await ensureStarterData(CO);
  const server = acceptingServer();

  const first = await drain(server, { batchSize: 500 });
  const second = await drain(server, { batchSize: 500 });

  assert.ok(first.sent > 0, 'a primeira corrida subiu algo — senão a segunda não prova nada');
  assert.equal(second.sent, 0, 'the second run finds nothing left to do');
  assert.equal(second.batches, 0);
  assert.equal(second.remaining, 0);
});

test('a queue longer than one batch goes up in order, batch after batch', async () => {
  await ensureStarterData(CO);
  const server = acceptingServer();

  // **Sem `maxAttempts` inflado, e é isso que o teste passou a medir.**
  //
  // Ele carregava `maxAttempts: 50` para conseguir esvaziar uma fila de mais de três
  // fatias — um contorno que escondia o defeito em vez de mostrá-lo: o orçamento de
  // TENTATIVA era o contador de RODADA, então com o padrão de três, uma fila longa
  // parava depois de três fatias, sem erro nenhum e sem nada na tela. Com o
  // orçamento contando falha, o padrão esvazia a fila inteira.
  const report = await drain(server, { batchSize: 3 });

  assert.equal(report.remaining, 0, 'a fila esvazia com as opções padrão, sem contorno');
  assert.ok(server.received.length > 3, 'e foram mais fatias que o orçamento de tentativa');

  const flat = server.received.flat().map((e) => e.id);
  assert.equal(new Set(flat).size, flat.length, 'no entry was sent twice');
});

test('backoff grows and then stops growing', () => {
  assert.equal(backoffMs(0), 0);
  assert.equal(backoffMs(1), 1_000);
  assert.equal(backoffMs(2), 2_000);
  assert.equal(backoffMs(3), 4_000);
  // A phone that spent the night in a freezer should retry hourly, not weekly.
  assert.equal(backoffMs(99), 60_000);
});

/**
 * A fila para de crescer quando a sincronia existir — e só o que subiu sai.
 *
 * `forgetSentBefore` estava na auditoria como "sem chamador fora de teste", e
 * estava certo: o motor mandava e nunca varria. O conserto não é apagar a função,
 * é a faxina acontecer, senão o celular de uma fábrica movimentada carrega um ano
 * de linhas já entregues — que é exatamente o que o docblock dela diz que não pode
 * acontecer.
 *
 * O que este teste protege é a metade perigosa: **o que ainda não subiu nunca sai.**
 * Uma linha apagada antes de chegar é uma escrita que a pessoa viu acontecer e a
 * fábrica nunca vai ver.
 */
test('the drain sweeps what the server took long ago, and never what is still waiting', async () => {
  await ensureStarterData(CO);

  const fila = await pendingEntries();
  assert.ok(fila.length > 2, 'a semente deixa fila com que trabalhar');

  // O servidor aceita metade; a outra metade continua esperando.
  const primeiros = fila.slice(0, 2).map((e) => e.id);
  const transporte: Transport = {
    push: async (entries): Promise<PushResult> => ({
      acceptedIds: entries.filter((e) => primeiros.includes(e.id)).map((e) => e.id),
    }),
  };

  const aindaEsperando = fila.length - primeiros.length;

  // Agora + trinta dias: o que acabou de subir já passou da janela de sete.
  const trintaDiasAdiante = Date.now() + 30 * 86_400_000;
  await drain(transporte, {
    sleep: async () => undefined,
    maxAttempts: 1,
    now: () => trintaDiasAdiante,
  });

  // Contando LINHAS da tabela, não pendências.
  //
  // A primeira versão deste teste media `pendingCount()`, que conta
  // `sent_at IS NULL` — ou seja, media o MARCAR, não o varrer, e passava verde com
  // a faxina comentada. Descobri comentando a linha, que é a única prova que vale:
  // guarda que nunca ficou vermelha com o defeito na frente foi acreditada.
  const linhas = await live.getAllAsync<{ id: string }>('SELECT id FROM outbox');
  assert.equal(linhas.length, aindaEsperando, 'só sobram as que ainda não subiram');
  assert.ok(
    primeiros.every((id) => !linhas.some((l) => l.id === id)),
    'e nenhuma das entregues sobrou na tabela',
  );
  assert.equal(await pendingCount(), aindaEsperando, 'e nenhuma pendente foi varrida junto');
});

test('the sweep spares what went up inside the window', async () => {
  await ensureStarterData(CO);
  const fila = await pendingEntries();
  const ids = fila.map((e) => e.id);
  await markSent(ids);

  // Sem avançar o relógio: subiu agora, e sete dias ainda não passaram.
  await drain({ push: async () => ({ acceptedIds: [] }) }, { sleep: async () => undefined, maxAttempts: 1 });

  const sobrando = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  assert.equal(sobrando?.n, ids.length, 'quem subiu hoje continua guardado, para poder ser dito');

  // E a mesma fila, com o relógio trinta dias à frente, é varrida — o que prova
  // que a janela é o que separa os dois casos, e não o acaso.
  await drain({ push: async () => ({ acceptedIds: [] }) }, {
    sleep: async () => undefined,
    maxAttempts: 1,
    now: () => Date.now() + 30 * 86_400_000,
  });
  const depois = await live.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  assert.equal(depois?.n, 0, 'passada a janela, o que subiu sai');
});

test('um aparelho que não sabe de que empresa é não sobe nada — e a fila fica intacta', async () => {
  // A fila cheia, mas o aparelho é uma instalação nova: nunca criou empresa nem
  // teve associação aprovada.
  await ensureStarterData(EMPRESA_SEMENTE);
  await esquecerParaEsteTeste();
  const antes = await pendingCount();
  assert.ok(antes > 0, 'a fila desta fábrica não pode estar vazia — a asserção seria de graça');

  let tentou = 0;
  const transporte: Transport = {
    push: async (entries) => {
      tentou += 1;
      return { acceptedIds: entries.map((e) => e.id) };
    },
  };

  const relatorio = await drain(transporte);

  assert.equal(tentou, 0, 'nem uma tentativa: recusar é ANTES de falar com o servidor');
  assert.equal(relatorio.recusa, 'semEmpresa');
  assert.equal(relatorio.sent, 0);
  assert.equal(relatorio.remaining, antes, 'a fila tem de continuar exatamente onde estava');
  assert.equal(relatorio.error, undefined, '"eu não tentei" não é "o servidor recusou"');
});

/** Apaga o fato guardado, como numa instalação que nunca criou empresa. */
async function esquecerParaEsteTeste(): Promise<void> {
  const conn = await db();
  await conn.runAsync(`DELETE FROM app_meta WHERE key = ?`, [CHAVE_DA_EMPRESA]);
  await carregarEmpresa();
}
