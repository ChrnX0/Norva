import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { OutboxEntry } from '@/data/outbox';
import { capabilities } from '@/domain/access';
import { sendableTables, serialize, type SyncActor } from './serialize';

/**
 * The two schemas, checked against each other by reading both.
 *
 * `db:verify` proves this end to end - a real session's queue replayed into a
 * real Postgres - and it is the honest proof. It also needs a database and
 * half a minute, which means it runs once at the end rather than while
 * somebody is typing, and the mutation gate cannot reach it at all.
 *
 * So the same contract is checked here in milliseconds, by parsing the
 * migrations the server is actually built from. It cannot prove behaviour. It
 * can prove agreement, which is where every one of today's mismatches lived:
 * a column that exists on one side only, an enum value spelled `storeroom`
 * against the server's `store_room`, a kind the device writes and the server
 * has never heard of.
 *
 * Reading the SQL with regular expressions is crude and would be wrong for
 * arbitrary input. These are this repository's own migrations, append-only and
 * hand-written, and the parse asserts it found something before trusting
 * itself - a parser that quietly matches nothing would turn this whole file
 * into a test that always passes.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const DEVICE = join(process.cwd(), 'src', 'data');

function serverSql(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  assert.ok(files.length >= 8, 'the migrations went missing, and this file would pass anyway');
  return files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n');
}

/**
 * Every column each table has after all the migrations have run, in order.
 * Creates, then adds, then drops - because a column removed in a later step is
 * not there any more, and 0009 removes one this device used to send.
 */
function serverColumns(sql: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  for (const m of sql.matchAll(/create table (\w+) \(([\s\S]*?)\n\);/g)) {
    const columns = new Set<string>();
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--') || /^(constraint|check|unique|primary|foreign)\b/i.test(line)) {
        continue;
      }
      const name = line.split(/\s+/)[0];
      if (/^\w+$/.test(name)) columns.add(name);
    }
    tables.set(m[1], columns);
  }

  // Statement by statement, because an ALTER wraps across lines and carries an
  // optional `if not exists` - the first version of this parser read that `if`
  // as the column name and reported `items.base_unit` missing when the server
  // has had it since 0003. A parser that is wrong in this direction is loud;
  // one that is wrong the other way turns the whole file into a test that
  // always passes.
  for (const statement of sql.split(';')) {
    const table = statement.match(/alter table (\w+)/);
    if (!table) continue;

    for (const m of statement.matchAll(/add column (?:if not exists )?(\w+)/g)) {
      tables.get(table[1])?.add(m[1]);
    }
    for (const m of statement.matchAll(/drop column (?:if exists )?(\w+)/g)) {
      tables.get(table[1])?.delete(m[1]);
    }
  }

  return tables;
}

/** An enum's values, including anything a later migration added to it. */
function enumValues(sql: string, name: string): Set<string> {
  const created = sql.match(new RegExp(`create type ${name} as enum \\(([\\s\\S]*?)\\);`));
  assert.ok(created, `the ${name} enum is not where this test looks for it`);

  const values = new Set<string>();
  for (const m of created[1].matchAll(/'([\w]+)'/g)) values.add(m[1]);
  for (const m of sql.matchAll(new RegExp(`alter type ${name} add value[^']*'([\\w]+)'`, 'g'))) {
    values.add(m[1]);
  }
  return values;
}

const ACTOR: SyncActor = { userId: '00000000-0000-4000-8000-000000000001' };

function entry(table: string): OutboxEntry {
  return { id: 'q', table, rowId: 'r', op: 'upsert', payload: {}, queuedAt: '2026-09-01T00:00:00Z' };
}

test('every column this device sends exists on the server', () => {
  const tables = serverColumns(serverSql());
  assert.ok(tables.size >= 10, 'the parse found almost nothing, so it proves nothing');

  // Canaries for the parser itself, one per shape it has to understand: a
  // column from the original CREATE, one added by a later ALTER with
  // `if not exists`, and one an ALTER removed. Get any of these wrong and the
  // test below is measuring the parser, not the schema.
  assert.ok(tables.get('items')?.has('name'), 'parser missed a plain create-table column');
  assert.ok(tables.get('items')?.has('base_unit'), 'parser missed an added column');
  assert.ok(!tables.get('movements')?.has('unit_cost_cents'), 'parser missed a dropped column');

  const missing: string[] = [];

  for (const table of sendableTables) {
    const columns = tables.get(table);
    assert.ok(columns, `the server has no ${table} at all`);

    // An empty row still produces every key the crossing sends, which is
    // exactly the set that has to exist on the other side.
    const write = serialize(entry(table), {}, ACTOR);
    if (write.kind !== 'upsert') continue;

    for (const column of Object.keys(write.row)) {
      if (!columns.has(column)) missing.push(`${table}.${column}`);
    }
  }

  assert.deepEqual(
    missing,
    [],
    'the device would send columns the server does not have, and every one is a refused write',
  );
});

test('every movement kind the device writes is a kind the server knows', () => {
  const sql = serverSql();
  const kinds = enumValues(sql, 'movement_kind');

  // Read from the repository rather than listed here, so a kind added tomorrow
  // is checked without anybody remembering to update this test.
  const repository = readFileSync(join(DEVICE, 'repository.ts'), 'utf8');
  const written = [
    ...repository.matchAll(/INSERT INTO movements[\s\S]*?VALUES \(\?, \?, '(\w+)'/g),
  ].map((m) => m[1]);

  assert.ok(written.length >= 2, 'no movement writes found - the parse is looking in the wrong shape');

  for (const kind of written) {
    assert.ok(
      kinds.has(kind),
      `the device writes movements of kind "${kind}" and the server enum has no such value`,
    );
  }
});

test('the location this device creates is a kind the server knows', () => {
  const sql = serverSql();
  const kinds = enumValues(sql, 'location_kind');

  const repository = readFileSync(join(DEVICE, 'repository.ts'), 'utf8');
  const created = [
    ...repository.matchAll(/INSERT INTO locations[\s\S]*?VALUES \(\?, \?, '', '(\w+)'/g),
  ].map((m) => m[1]);

  assert.ok(created.length >= 1, 'no location writes found - the parse is looking in the wrong shape');

  for (const kind of created) {
    // This is the exact defect the replay caught: `storeroom` against the
    // server's `store_room`. The queue stops at a foreign-key gap, so that one
    // row would have blocked every write behind it.
    assert.ok(kinds.has(kind), `the device creates locations of kind "${kind}", unknown to the server`);
  }
});

test('the device schema does not carry a column the server dropped', () => {
  const tables = serverColumns(serverSql());

  // 0009 removed `on_hand_base_units` from the server for the same reason V3
  // removed it here: a stored stock total is a second answer to a question the
  // ledger already answers. Neither side may quietly grow it back.
  assert.ok(!tables.get('item_costs')?.has('on_hand_base_units'));

  const device = readFileSync(join(DEVICE, 'db.ts'), 'utf8');
  assert.ok(
    device.includes('ALTER TABLE item_costs DROP COLUMN on_hand_base_units'),
    'the device migration that removes the stored stock total has gone',
  );
});

test('the capability vocabulary is the same word list on both sides', () => {
  const server = enumValues(serverSql(), 'capability');

  // Permission is enforced in two places that must agree exactly: row level
  // security in Postgres, and the check this device runs before its own
  // queries. A capability the code knows and the server does not is a policy
  // that silently never matches; one the server knows and the code does not is
  // a door nobody on this side can open.
  assert.deepEqual(
    [...capabilities].sort(),
    [...server].sort(),
    'the device and the server disagree about what a permission even is',
  );
});
