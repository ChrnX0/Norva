import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate, schemaVersion, type Db, type SqlParam } from './db';

/**
 * The guard for the one architectural mistake this project has actually made.
 *
 * Foundation 1 says a balance is the sum of its movements and that no column
 * stores a running total. The device schema broke that rule for months while
 * every test passed, because the arithmetic was right - the defect was only
 * ever visible by asking where a number came from, and nothing asks that
 * automatically.
 *
 * Fixing it once is worth less than making it hard to undo. A stored total is
 * always the cheaper-looking option at the moment somebody adds it: one column,
 * one UPDATE, no join. This test is what makes that moment loud.
 *
 * It is deliberately a name check rather than anything cleverer. The mistake
 * announces itself in the name every time - `on_hand`, `current_stock`,
 * `estoque_atual` - because whoever writes it is describing exactly what it is.
 */

/**
 * Names that mean "a quantity somebody keeps up to date".
 *
 * Kept narrow on purpose. A guard that fires on anything containing "total"
 * would be turned off within a week, and a guard people turn off protects
 * nothing.
 */
function looksLikeStoredStock(column: string): boolean {
  return /(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)/i.test(
    column,
  );
}

function inMemoryDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));
  return {
    getAllAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      (sqlite.prepare(sql).get(...bind(params)) as T) ?? null,
    runAsync: async (sql: string, params: SqlParam[] = []) => sqlite.prepare(sql).run(...bind(params)),
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

test('the guard recognises the column this project actually shipped', () => {
  // A guard nobody has watched bite is not a guard. This is the real name of
  // the real column that really existed, in `item_costs`, until it was removed.
  assert.equal(looksLikeStoredStock('on_hand_base_units'), true);
  assert.equal(looksLikeStoredStock('estoque_atual'), true);
  assert.equal(looksLikeStoredStock('current_stock'), true);

  // And it leaves the ledger's own column alone, which is what stops the guard
  // from being disabled the first time it cries wolf.
  assert.equal(looksLikeStoredStock('quantity_base_units'), false);
  assert.equal(looksLikeStoredStock('purchase_to_base'), false);
  assert.equal(looksLikeStoredStock('total_cents'), false);
});

test('no table on the device stores a stock total', async () => {
  const conn = inMemoryDb();
  await migrate(conn);

  const tables = await conn.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );

  assert.ok(
    tables.some((t) => t.name === 'movements'),
    'the ledger has to exist for anything else here to mean something',
  );

  const offenders: string[] = [];
  for (const table of tables) {
    // The name comes from `sqlite_master` in a database this test just built,
    // and PRAGMA takes no bound parameters.
    const columns = await conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${table.name})`);
    for (const column of columns) {
      if (looksLikeStoredStock(column.name)) offenders.push(`${table.name}.${column.name}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a balance is the sum of its movements; this column would become a second answer',
  );
});

test('a phone that dies mid-upgrade comes back on the version it finished', async () => {
  const real = inMemoryDb();

  // The cut lands exactly where the danger was: between applying a step and
  // recording that it was applied. Written outside the transaction, that gap
  // was a way to brick an installation - the next launch would re-run a step
  // like `ALTER TABLE ... ADD COLUMN`, fail on the column already being there,
  // and fail again on every launch after that, with no way in.
  let powerCut = true;
  const flaky: Db = {
    ...real,
    execAsync: async (sql: string) => {
      if (powerCut && sql.trimStart().startsWith('PRAGMA user_version')) {
        throw new Error('power cut');
      }
      return real.execAsync(sql);
    },
  };

  await assert.rejects(() => migrate(flaky), /power cut/);

  const stopped = await real.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(stopped?.user_version, 0, 'a step that did not finish is not recorded as done');

  const tables = await real.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  assert.deepEqual(tables, [], 'and it left no half-built schema behind');

  // The next launch, with power, gets all the way there.
  powerCut = false;
  await migrate(flaky);

  const done = await real.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  assert.equal(done?.user_version, schemaVersion);
});
