import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { markSent, pendingCount, pendingEntries, type OutboxEntry } from '@/data/outbox';
import { fromDecimal } from '@/domain/money';
import { recordPurchase, saveItem, saveRecipeVersion, eraseArea } from '@/data/repository';
import { ensureStarterData, LOCAL_COMPANY_ID } from '@/data/seed';
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

const CO = LOCAL_COMPANY_ID;

beforeEach(async () => {
  const conn = inMemoryDb();
  await migrate(conn);
  __setDb(conn);
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
  assert.ok(report.sent > 0);

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
  assert.match(report.error, /aceitou/);
  assert.equal(report.remaining, before - report.sent, 'the rest is still queued, to the row');
  assert.ok(report.remaining > 0);
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
  assert.match(report.error ?? '', /sem rede/);
  assert.deepEqual(waits, [1_000, 2_000], 'it waits longer each time, and not after the last');
});

test('sending the same queue twice is harmless', async () => {
  await ensureStarterData(CO);
  const server = acceptingServer();

  const first = await drain(server, { batchSize: 500 });
  const second = await drain(server, { batchSize: 500 });

  assert.ok(first.sent > 0);
  assert.equal(second.sent, 0, 'the second run finds nothing left to do');
  assert.equal(second.batches, 0);
  assert.equal(second.remaining, 0);
});

test('a queue longer than one batch goes up in order, batch after batch', async () => {
  await ensureStarterData(CO);
  const server = acceptingServer();

  const report = await drain(server, { batchSize: 3, maxAttempts: 50 });

  assert.equal(report.remaining, 0);
  assert.ok(server.received.length > 1, 'it really did take several batches');

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
