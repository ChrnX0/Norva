import { db, newId, nowIso, type Db } from './db';

/**
 * The queue that makes a phone with no signal safe to write to.
 *
 * A cold room is a metal box and a delivery route has no towers, so every
 * write has to succeed locally and reach the server later. That only works if
 * two things are true, and both are the reason this file exists rather than a
 * `fetch` next to each save:
 *
 *   - **Nothing is written without being queued.** The enqueue happens inside
 *     the same transaction as the row it describes, so there is no instant
 *     where the data exists and the intent to sync it does not. A crash lands
 *     on one side of that line or the other, never between.
 *
 *   - **Replaying is harmless.** Ids are generated on the device, and the
 *     server upserts by id, so sending the same entry twice changes nothing.
 *     That is what turns a flaky connection from a danger into a delay.
 *
 * Entries are kept after they are sent, briefly, so "did that go up?" is a
 * question with an answer.
 */

export type OutboxOp = 'upsert' | 'delete';

export type OutboxEntry = {
  id: string;
  table: string;
  rowId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  queuedAt: string;
};

export type PendingWrite = {
  table: string;
  rowId: string;
  op?: OutboxOp;
  payload?: Record<string, unknown>;
};

/**
 * Queues writes. Takes the connection rather than opening one, because the
 * caller is inside a transaction and this has to join it.
 */
export async function enqueue(conn: Db, writes: readonly PendingWrite[]): Promise<void> {
  const at = nowIso();

  for (const write of writes) {
    await conn.runAsync(
      `INSERT INTO outbox (id, table_name, row_id, op, payload, queued_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        write.table,
        write.rowId,
        write.op ?? 'upsert',
        JSON.stringify(write.payload ?? {}),
        at,
      ],
    );
  }
}

/**
 * The next entries to send, oldest first.
 *
 * Order is the point. A recipe line that arrives before its recipe is a
 * foreign key error on the server, and the only thing that reliably prevents
 * it is sending in the order the device wrote.
 */
export async function pendingEntries(limit = 100): Promise<OutboxEntry[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    table_name: string;
    row_id: string;
    op: OutboxOp;
    payload: string;
    queued_at: string;
  }>(
    `SELECT id, table_name, row_id, op, payload, queued_at
       FROM outbox WHERE sent_at IS NULL
      ORDER BY queued_at, rowid
      LIMIT ?`,
    [limit],
  );

  return rows.map((r) => ({
    id: r.id,
    table: r.table_name,
    rowId: r.row_id,
    op: r.op,
    queuedAt: r.queued_at,
    payload: parsePayload(r.payload),
  }));
}

function parsePayload(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    // A payload that will not parse is a bug, not a reason to stall the queue
    // behind it forever. The row id is still there, so the server can be asked
    // to fetch the current state instead.
    return {};
  }
}

export async function pendingCount(): Promise<number> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NULL`,
  );
  return row?.n ?? 0;
}

/** Marks exactly what the server accepted, and nothing else. */
export async function markSent(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;

  const conn = await db();
  const at = nowIso();
  const marks = ids.map(() => '?').join(', ');

  await conn.runAsync(
    `UPDATE outbox SET sent_at = ? WHERE id IN (${marks}) AND sent_at IS NULL`,
    [at, ...ids],
  );
}

/**
 * Drops entries that went up a while ago. They are worth keeping for a few
 * days so a person can be told what has and has not synced, and worth dropping
 * after that so a busy factory's phone does not carry a year of them.
 */
export async function forgetSentBefore(iso: string): Promise<void> {
  const conn = await db();
  await conn.runAsync(`DELETE FROM outbox WHERE sent_at IS NOT NULL AND sent_at < ?`, [iso]);
}
