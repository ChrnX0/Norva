import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OutboxEntry } from '@/data/outbox';
import { serialize, sendableTables, UnknownTableError, type SyncActor } from './serialize';

/**
 * The crossing between SQLite and Postgres, checked without either.
 *
 * `db:verify` replays a whole session against a real server and is the honest
 * end of this - but it takes half a minute and runs a database. These are the
 * same rules at the speed of a unit test, so a mistake is caught while it is
 * being typed rather than at the end of a suite.
 */

const ACTOR: SyncActor = { userId: '00000000-0000-4000-8000-000000000009' };

function queued(table: string, rowId = 'r1'): OutboxEntry {
  return { id: 'q1', table, rowId, op: 'upsert', payload: {}, queuedAt: '2026-09-01T10:00:00Z' };
}

test('SQLite has no boolean, and Postgres will not pretend otherwise', () => {
  const on = serialize(queued('items'), { id: 'i1', active: 1 }, ACTOR);
  const off = serialize(queued('items'), { id: 'i1', active: 0 }, ACTOR);

  assert.equal(on.kind, 'upsert');
  assert.equal(off.kind, 'upsert');
  if (on.kind !== 'upsert' || off.kind !== 'upsert') return;

  // Sent as 1, Postgres refuses the insert outright - it does not cast.
  assert.equal(on.row.active, true);
  assert.equal(off.row.active, false);
});

test('the packaging travels as a structure, not as the text it is stored in', () => {
  const write = serialize(
    queued('items'),
    { id: 'i1', packaging: '[{"id":"unit","perBaseUnit":1},{"id":"box","perBaseUnit":50}]' },
    ACTOR,
  );
  if (write.kind !== 'upsert') throw new Error('expected an upsert');

  // The failure this prevents still looks like a success: Postgres happily
  // stores a quoted string in a jsonb column, and the packaging is then
  // unusable on the other side with nothing complaining.
  assert.deepEqual(write.row.packaging, [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'box', perBaseUnit: 50 },
  ]);
});

test('a column the server does not have stays behind', () => {
  const write = serialize(
    queued('purchase_lines'),
    { id: 'l1', company_id: 'c1', purchase_id: 'p1', item_id: 'i1', created_at: '2026-09-01' },
    ACTOR,
  );
  if (write.kind !== 'upsert') throw new Error('expected an upsert');

  // `created_at` is this device's own bookkeeping. Sent, it is an error - a
  // column that does not exist is refused, not ignored.
  assert.ok(!('created_at' in write.row));
  assert.equal(write.row.purchase_id, 'p1');
});

test('who wrote it and who was holding it are two answers', () => {
  // The login authenticates the SYSTEM: the account belongs to the company,
  // which hands out access by creating other emails or sending an invite code
  // per role. So `recorded_by` is that account - the server enforces
  // `recorded_by = auth.uid()` and nobody signs in anybody else's name - while
  // who was actually operating is noted at the moment of the record.
  //
  // One column answering both was the mistake this replaced. Separated, a
  // shared phone stops being an authentication problem and becomes one more
  // question on the screen, for the company that wants to ask it.
  const write = serialize(
    queued('movements'),
    { id: 'm1', kind: 'production', operator_id: 'the-one-holding-the-phone' },
    ACTOR,
  );
  if (write.kind !== 'upsert') throw new Error('expected an upsert');

  assert.equal(write.row.recorded_by, ACTOR.userId);
  assert.equal(write.row.operator_id, 'the-one-holding-the-phone');
});

test('a company that names nobody still records the movement', () => {
  // Null is an answer, not a gap: the line still answers through the device and
  // the account. Naming is `companies.names_who_recorded`, off by default.
  const write = serialize(queued('movements'), { id: 'm1', kind: 'production' }, ACTOR);
  if (write.kind !== 'upsert') throw new Error('expected an upsert');
  // Nulo explícito, não coluna ausente: a travessia nomeia o que ela promete
  // atravessar, e uma coluna que sumisse do payload seria indistinguível de uma
  // que ninguém ensinou a mandar.
  assert.equal(write.row.operator_id, null);
  assert.equal(write.row.recorded_by, ACTOR.userId);
});

test('who did it is stamped on the way out, because the device has no user', () => {
  const movement = serialize(queued('movements'), { id: 'm1', kind: 'purchase' }, ACTOR);
  const purchase = serialize(queued('purchases'), { id: 'p1' }, ACTOR);
  if (movement.kind !== 'upsert' || purchase.kind !== 'upsert') throw new Error('expected upserts');

  // Both columns are NOT NULL on the server and reference a real user. The
  // phone works offline, alone: who is signing in is known at sync time.
  assert.equal(movement.row.recorded_by, ACTOR.userId);
  assert.equal(purchase.row.created_by, ACTOR.userId);
});

test('the order somebody put the ingredients in goes with them', () => {
  const write = serialize(
    queued('recipe_lines'),
    { id: 'rl1', recipe_version_id: 'v1', item_id: 'i1', quantity: 1500, position: 2 },
    ACTOR,
  );
  if (write.kind !== 'upsert') throw new Error('expected an upsert');

  // A technical sheet is read top to bottom while somebody is working, and the
  // person who wrote it put the base first on purpose.
  assert.equal(write.row.position, 2);
});

test('a derived number does not travel, and says so instead of being dropped', () => {
  const write = serialize(queued('item_costs', 'i1'), { item_id: 'i1' }, ACTOR);

  // Not silence: silence is how a write that never arrives looks exactly like
  // one that did.
  assert.equal(write.kind, 'derived');
  assert.ok(!sendableTables.includes('item_costs' as never));
});

test('a table nobody taught this file about is a refusal, never a skip', () => {
  assert.throws(
    () => serialize(queued('lots'), { id: 'x' }, ACTOR),
    (e: unknown) => e instanceof UnknownTableError && e.table === 'lots',
  );
});

test('a queued row that has gone missing is loud', () => {
  assert.throws(() => serialize(queued('items'), null, ACTOR), /gone from the device/);
});

test('the erase command carries its area, not a row', () => {
  const entry: OutboxEntry = {
    id: 'q9',
    table: 'erase',
    rowId: 'all',
    op: 'delete',
    payload: { area: 'all' },
    queuedAt: '2026-09-01T10:00:00Z',
  };

  const write = serialize(entry, null, ACTOR);
  assert.deepEqual(write, { kind: 'erase', area: 'all' });
});
