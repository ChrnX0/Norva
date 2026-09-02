import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { __setDb, __setOpener, db, type SqlParam } from './db';

/**
 * The one path every phone takes on first launch, and the one no test touched.
 *
 * Every other test in this folder injects a finished database through
 * `__setDb`, which is what makes the SQL real - and it also means `db()` itself,
 * the function that opens the file and migrates it, was believed rather than
 * exercised. The first thing that turned up when it finally was: two callers
 * arriving together opened two connections and ran two migrations on the same
 * file. The home screen asks five questions in one `Promise.all`.
 */

/** A driver over Node's SQLite, standing in for the one the phone opens. */
function nativeLike() {
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

test('five questions at once open the file once, not five times', async () => {
  let opened = 0;
  __setOpener(async () => {
    opened += 1;
    // The real driver does not answer instantly, and the race only exists in
    // the window while it is still answering.
    await new Promise((resolve) => setTimeout(resolve, 5));
    return nativeLike();
  });

  // Exactly what `app/index.tsx` does on the first frame.
  const handles = await Promise.all([db(), db(), db(), db(), db()]);

  assert.equal(opened, 1, 'one connection, one migration');
  assert.ok(
    handles.every((h) => h === handles[0]),
    'and everybody got the same database back',
  );

  __setDb(null);
});

test('a launch that fails to open lets the next attempt try again', async () => {
  let attempts = 0;
  __setOpener(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('disco cheio');
    return nativeLike();
  });

  // A failure that is remembered forever would turn one bad launch into an app
  // that never opens again until it is reinstalled.
  await assert.rejects(db(), /disco cheio/);
  const handle = await db();

  assert.equal(attempts, 2);
  assert.ok(handle, 'the second attempt got a working database');

  __setDb(null);
});

test('the migration behind it really ran', async () => {
  __setOpener(async () => nativeLike());

  const handle = await db();
  const version = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version');

  // Believing the schema is there is how the untested path stayed untested.
  assert.ok((version?.user_version ?? 0) > 0, 'the file came back migrated');
  const tables = await handle.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  assert.ok(
    tables.some((t) => t.name === 'movements'),
    'including the ledger',
  );

  __setDb(null);
});
