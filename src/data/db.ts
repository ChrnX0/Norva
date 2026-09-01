import * as SQLite from 'expo-sqlite';

/**
 * The on-device database.
 *
 * It mirrors the server schema rather than inventing a second shape, because
 * the sync is an append-only replay of the same rows: a movement written in a
 * freezer with no signal has to be the same record the server will accept when
 * the phone finds a tower again.
 *
 * Two deliberate differences from `supabase/migrations`:
 *   - no RLS: the device already holds exactly one user's data, and the server
 *     is the boundary that matters
 *   - rates are REAL, amounts are INTEGER cents, matching the same split the
 *     domain enforces - a price per gram is not money and must not be rounded
 */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  kind              TEXT NOT NULL,
  name              TEXT NOT NULL,
  -- What the buyer holds in their hands: a 25kg sack, a 10kg bucket.
  purchase_unit     TEXT,
  -- How many base units are inside one purchase unit. Without this the cost is
  -- quietly wrong and nobody notices.
  purchase_to_base  REAL,
  base_unit         TEXT NOT NULL DEFAULT 'g',
  packaging         TEXT NOT NULL DEFAULT '[{"id":"unit","perBaseUnit":1}]',
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_costs (
  item_id            TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  company_id         TEXT NOT NULL,
  -- Fractional cents per base unit. Never rounded.
  average_rate       REAL NOT NULL DEFAULT 0,
  last_rate          REAL,
  on_hand_base_units INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_cost_history (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  previous_rate REAL,
  new_rate      REAL NOT NULL,
  observed_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  yield_amount REAL NOT NULL,
  yield_unit   TEXT NOT NULL DEFAULT 'ml',
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL,
  recipe_id      TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  loss_fraction  REAL NOT NULL DEFAULT 0,
  note           TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE (recipe_id, version)
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  item_id           TEXT REFERENCES items(id) ON DELETE RESTRICT,
  sub_recipe_id     TEXT REFERENCES recipes(id) ON DELETE RESTRICT,
  quantity          REAL NOT NULL,
  position          INTEGER NOT NULL DEFAULT 0,
  CHECK ((item_id IS NULL) <> (sub_recipe_id IS NULL))
);

CREATE TABLE IF NOT EXISTS products (
  id                   TEXT PRIMARY KEY,
  company_id           TEXT NOT NULL,
  item_id              TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  recipe_id            TEXT REFERENCES recipes(id) ON DELETE RESTRICT,
  yield_per_unit       REAL,
  unit_packaging_cents INTEGER NOT NULL DEFAULT 0,
  active               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  supplier_name TEXT,
  ordered_at    TEXT,
  received_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  purchase_id       TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_id           TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  purchase_quantity REAL NOT NULL,
  base_units        INTEGER NOT NULL,
  total_cents       INTEGER NOT NULL,
  created_at        TEXT NOT NULL
);

/**
 * Everything written offline queues here until the server accepts it. The row
 * carries its own id, so replaying the queue twice changes nothing - which is
 * what makes a flaky connection harmless instead of dangerous.
 */
CREATE TABLE IF NOT EXISTS outbox (
  id         TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  payload    TEXT NOT NULL,
  queued_at  TEXT NOT NULL,
  sent_at    TEXT
);

CREATE INDEX IF NOT EXISTS items_kind_idx ON items (company_id, kind) WHERE active = 1;
CREATE INDEX IF NOT EXISTS recipe_lines_version_idx ON recipe_lines (recipe_version_id);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (queued_at) WHERE sent_at IS NULL;
`;

let handle: SQLite.SQLiteDatabase | null = null;

export async function db(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return handle;
  handle = await SQLite.openDatabaseAsync('norva.db');
  await handle.execAsync(SCHEMA);
  return handle;
}

/** Test seam: lets a test point at a fresh in-memory database. */
export function __setDb(next: SQLite.SQLiteDatabase | null) {
  handle = next;
}

export function newId(): string {
  // Client-generated so an offline write is idempotent on replay.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
