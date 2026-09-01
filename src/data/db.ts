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
 * Small facts about this installation that are not business data.
 *
 * It exists for one specific reason: the starter data must know it has already
 * run. Seeding on "the items table is empty" would put the demo back the next
 * morning after somebody deliberately wiped it, and an app that undoes your
 * deletions is one nobody trusts with anything else.
 */
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
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

export type SqlParam = string | number | null;

/**
 * The slice of the database the app actually uses.
 *
 * Naming it is what makes the data layer testable: `expo-sqlite` only exists on
 * a device, but any object with these five methods will do, so the tests drive
 * the real SQL against Node's own SQLite instead of mocking the queries and
 * proving nothing.
 */
export type Db = {
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, params?: SqlParam[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

let handle: Db | null = null;

export async function db(): Promise<Db> {
  if (handle) return handle;

  // Imported here rather than at the top of the file: `expo-sqlite` reaches
  // into React Native, which only exists on a device. Loading it lazily is what
  // lets the tests point `__setDb` at Node's own SQLite and run the real
  // queries, instead of mocking them and proving nothing.
  const SQLite = await import('expo-sqlite');

  const native = await SQLite.openDatabaseAsync('norva.db');
  await native.execAsync(SCHEMA);

  // A thin wrapper rather than the driver itself, so "no parameters" means the
  // same thing here as it does in Node's SQLite.
  handle = {
    getAllAsync: <T,>(sql: string, params: SqlParam[] = []) => native.getAllAsync<T>(sql, params),
    getFirstAsync: <T,>(sql: string, params: SqlParam[] = []) =>
      native.getFirstAsync<T>(sql, params),
    runAsync: (sql: string, params: SqlParam[] = []) => native.runAsync(sql, params),
    execAsync: (sql: string) => native.execAsync(sql),
    withTransactionAsync: (task: () => Promise<void>) => native.withTransactionAsync(task),
  };

  return handle;
}

/** The schema, so a test can stand up the same tables the device has. */
export const schemaSql = SCHEMA;

/** Test seam: lets a test point at a fresh in-memory database. */
export function __setDb(next: Db | null) {
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
