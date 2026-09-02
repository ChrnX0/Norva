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

/**
 * Connection settings, applied on open and never inside a transaction.
 *
 * `foreign_keys` has to live here rather than in a migration: SQLite ignores
 * the pragma while a transaction is open, and every migration step runs in
 * one. A silently ignored pragma would leave the references unenforced, which
 * is precisely the protection the erase order depends on.
 */
const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`;

const V1 = `
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

/**
 * Every change to the on-device schema, in order, forever.
 *
 * The device holds the only copy of anything written in a cold room with no
 * signal, so a schema change here can never be "drop it and recreate". Adding
 * a step to this list is the only way the tables change, and SQLite's own
 * `user_version` records how far a given phone has got.
 *
 * Never edit a step that has shipped. A phone that already ran it will not run
 * it again, so the edit reaches new installations only, and the two diverge
 * silently - which is the same reason the SQL migrations on the server are
 * append-only.
 */
/**
 * Adds the operation to a queued write.
 *
 * The first version of the outbox could only say "this row changed", which is
 * enough for a create or an update and useless for a delete: there is nothing
 * left on the device to send. Carrying the verb makes the queue able to
 * describe everything the app actually does.
 */
const V2 = `
ALTER TABLE outbox ADD COLUMN op TEXT NOT NULL DEFAULT 'upsert';
`;

/**
 * The ledger arrives on the device, where it should have been from the start.
 *
 * Foundation 1 of this project says there is no `estoque_atual` column and that
 * a balance is the sum of its movements. The server schema honoured that; this
 * database did not. It carried `item_costs.on_hand_base_units`, an integer
 * updated in place by every purchase - which is precisely the column the
 * foundation forbids, wearing a longer name. Nothing was wrong with the
 * arithmetic. What was wrong is that the number had no history, so it could
 * never be audited, corrected by reversal, or replayed after a sync - and those
 * three properties are the entire reason the rule exists.
 *
 * The backfill matters as much as the table. A phone already holding invoices
 * must come out of this migration with the same balance it went in with, so
 * every purchase line becomes the movement that line always was, keeping its
 * own id: replaying the step twice cannot double a balance.
 *
 * Only then does the column go. Leaving it would leave the trap - a tempting,
 * cheap-looking number sitting one autocomplete away from the correct one.
 *
 * The column names are the server's, down to `quantity_base_units`, because
 * this file's first promise is that the device mirrors the server rather than
 * inventing a second shape. The first draft of this table did invent one -
 * shorter names, an extra column - which reads as tidier and would have meant
 * a translation layer between two schemas that must stay identical for an
 * offline queue to replay at all.
 *
 * A purchase movement keeps its purchase line's id. They are one fact seen
 * twice, so sharing the id makes the link free and makes a replay idempotent
 * without a column to hold it.
 */
const V3 = `
CREATE TABLE IF NOT EXISTS locations (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'store_room',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
  id                   TEXT PRIMARY KEY,
  company_id           TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  -- When it happened in the world, not when it reached the server.
  occurred_at          TEXT NOT NULL,
  recorded_at          TEXT NOT NULL,
  item_id              TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  -- Signed, always the smallest unit: positive arrives, negative leaves.
  quantity_base_units  INTEGER NOT NULL,
  location_id          TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  lot_id               TEXT,
  loss_reason          TEXT,
  -- Fractional cents per base unit, frozen at this instant. A sugar price
  -- change in March must not rewrite what January cost. A rate, never money,
  -- so it is never rounded.
  unit_cost_rate       REAL,
  -- Deferred on purpose. RESTRICT fires row by row, so wiping the table would
  -- trip over its own rows: the reversal is still there when the movement it
  -- cancels goes. Checked at commit instead, the pair leaves together or the
  -- whole erase rolls back.
  reverses_movement_id TEXT REFERENCES movements(id) DEFERRABLE INITIALLY DEFERRED,
  assistant_phrase     TEXT,
  note                 TEXT
);

CREATE INDEX IF NOT EXISTS movements_balance_idx
  ON movements (company_id, item_id, location_id, occurred_at);

-- One place to keep things, for a company that has not been asked to name any.
-- Its id is the company's own: deterministic, so two phones creating the
-- default at the same moment create the same row instead of two.
--
-- The name is left empty on purpose rather than written here in Portuguese.
-- This app puts every word a person reads in the dictionary, and a default
-- that ships as one language would be the single string that escaped. An
-- unnamed location means "the one place", and the interface is what names it.
INSERT OR IGNORE INTO locations (id, company_id, name, kind, created_at)
SELECT company_id, company_id, '', 'store_room', MIN(created_at)
  FROM items GROUP BY company_id;

INSERT OR IGNORE INTO movements
  (id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units,
   location_id, unit_cost_rate)
SELECT l.id, l.company_id, 'purchase', l.created_at, l.created_at, l.item_id, l.base_units,
       l.company_id,
       -- The same arithmetic rateFromCents does: cents over base units. Both
       -- sides are already in their smallest unit, so nothing is converted and
       -- nothing is rounded - a rate is not money.
       CASE WHEN l.base_units > 0
            THEN CAST(l.total_cents AS REAL) / l.base_units
       END
  FROM purchase_lines l;

ALTER TABLE item_costs DROP COLUMN on_hand_base_units;
`;

/**
 * Quem estava operando, gravado na hora — não na hora de sincronizar.
 *
 * O `recorded_by` do servidor era carimbado pelo serializador com o usuário da
 * sincronização, e isso é uma mentira num aparelho compartilhado: o celular da
 * câmara fria passa de mão, e quem sincroniza à noite pode não ser quem
 * registrou de manhã. O livro-razão responderia "quem" com o nome errado, que é
 * pior do que não responder.
 *
 * Então a pessoa entra na linha no instante em que o movimento é escrito. Nulo
 * enquanto não existe sessão com dono — e nulo é honesto: significa que o
 * aparelho não sabia, não que ninguém fez.
 *
 * E a coluna diz mais do que quem gravou: diz **por qual sessão esta linha pode
 * subir**. A política do servidor é `recorded_by = auth.uid()`, provada contra
 * o Postgres na `db:verify` — a mesma escrita é aceita nomeando o próprio
 * usuário da sessão e recusada nomeando qualquer outro. Ninguém assina no nome
 * de ninguém, nem o dono. É por isso que um celular que passa de mão carrega
 * uma sessão por pessoa, em vez de uma conta só carimbando todo mundo.
 */
const V4 = `
ALTER TABLE movements ADD COLUMN recorded_by TEXT;
`;

/**
 * Quem gravou e quem estava operando são duas perguntas, não uma.
 *
 * A V4 tentou fazer uma coluna responder as duas e estava errada. O login
 * autentica **o sistema**: a conta é da empresa, e ela distribui acesso criando
 * outros e-mails ou mandando código de convite por perfil — não é o e-mail
 * pessoal do operador que entra no app. Então a conta que escreve é uma coisa
 * (e o servidor impõe `recorded_by = auth.uid()`, provado na `db:verify`), e
 * quem estava com o aparelho na hora é outra: anotada no momento do registro.
 *
 * Com as duas separadas, o celular compartilhado para de ser um problema de
 * autenticação e vira uma pergunta a mais na tela — para a empresa que quiser
 * fazê-la. `recorded_by` sai daqui porque no aparelho ele nunca teve valor
 * próprio: é sempre a conta que sincroniza, e o serializador já sabe qual é.
 */
const V5 = `
ALTER TABLE movements ADD COLUMN operator_id TEXT;
ALTER TABLE movements DROP COLUMN recorded_by;
`;

/**
 * As colunas que um ato de mais de uma linha precisa.
 *
 * `movement_group_id` amarra as sete linhas de uma corrida de produção e as
 * duas pernas de uma transferência. Sem ela, o estorno de uma corrida inteira
 * não se diz atômico e "explique este número" vira arqueologia por horário.
 *
 * `counterpart_location_id` existe no servidor desde a 0001 e nunca existiu
 * aqui. A transferência escreve duas linhas — saída e entrada — e cada uma
 * precisa dizer para onde foi a outra metade; sem a coluna, a perna sobe muda e
 * o servidor recebe metade da explicação. Um guarda em `agreement.test.ts`
 * listava esta ausência de propósito, para ela ser deliberada em vez de
 * descoberta por uma chave estrangeira falhando de madrugada.
 *
 * As duas são nulas nas linhas antigas: compra e contagem são atos de uma linha
 * só, sem grupo e sem contraparte.
 */
const V6 = `
ALTER TABLE movements ADD COLUMN movement_group_id TEXT;
ALTER TABLE movements ADD COLUMN counterpart_location_id TEXT REFERENCES locations(id);
`;

/**
 * O posto de controle chega ao aparelho, com o primeiro ato que o escreve.
 *
 * `control_post` existe no servidor desde a primeira migração e o aparelho
 * nunca teve a coluna. Ela entra agora porque a conferência de chegada é o
 * primeiro dos quatro postos a ganhar tela - e não antes, porque coluna sem
 * escritor é a doença que este repositório já documentou.
 *
 * Nula nas linhas antigas, e nulo é a resposta certa: compra, produção e
 * contagem não acontecem em posto de controle nenhum. `ADD COLUMN` sem
 * `NOT NULL` e sem `DEFAULT` não reescreve uma linha sequer.
 *
 * O índice de grupo vem junto e não é enfeite. O servidor o tem; o aparelho
 * recebeu `movement_group_id` na V6 e ficou sem ele, e é por essa coluna que a
 * conferência acha a remessa e que a tela pergunta "quais ainda não
 * conferiram". Sem índice, as duas varrem a tabela inteira.
 */
const V7 = `
ALTER TABLE movements ADD COLUMN post TEXT;

CREATE INDEX IF NOT EXISTS movements_group_idx
  ON movements (company_id, movement_group_id)
  WHERE movement_group_id IS NOT NULL;
`;

const MIGRATIONS: readonly string[] = [V1, V2, V3, V4, V5, V6, V7];

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

/**
 * Opening the file. A seam, because this is the one line of this module that
 * cannot run outside a phone - and the tests need to arrive at everything
 * behind it.
 *
 * Imported inside the function rather than at the top of the file: `expo-sqlite`
 * reaches into React Native, which only exists on a device. Loading it lazily
 * is what lets the tests point `__setDb` at Node's own SQLite and run the real
 * queries, instead of mocking them and proving nothing.
 */
type NativeDb = {
  getAllAsync<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, params: SqlParam[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

type Opener = () => Promise<NativeDb>;

let openNative: Opener = async () => {
  const SQLite = await import('expo-sqlite');
  return SQLite.openDatabaseAsync('norva.db');
};

/**
 * The opening in flight, so two callers arriving together share one.
 *
 * `handle` was only assigned after `migrate` resolved, and the home screen asks
 * five questions in a single `Promise.all`. Each one that arrived before the
 * first finished opened **another** connection to `norva.db` and started
 * **another** migration on it - and V2, V4, V5 and V6 are `ALTER TABLE ... ADD
 * COLUMN`, which throws `duplicate column name` when it runs twice. It stayed
 * invisible only because the seed in `_layout` happened to finish first, and
 * that await was wrapped in a `catch` that said nothing.
 */
let opening: Promise<Db> | null = null;

export async function db(): Promise<Db> {
  if (handle) return handle;

  // Cleared when it settles: on success `handle` answers from here on, and on
  // failure the next caller is allowed to try again instead of being handed
  // the same rejection forever.
  opening ??= openAndMigrate().finally(() => {
    opening = null;
  });

  return opening;
}

async function openAndMigrate(): Promise<Db> {
  const native = await openNative();
  await native.execAsync(PRAGMAS);
  await migrate({
    getAllAsync: <T,>(sql: string, params: SqlParam[] = []) => native.getAllAsync<T>(sql, params),
    getFirstAsync: <T,>(sql: string, params: SqlParam[] = []) =>
      native.getFirstAsync<T>(sql, params),
    runAsync: (sql: string, params: SqlParam[] = []) => native.runAsync(sql, params),
    execAsync: (sql: string) => native.execAsync(sql),
    withTransactionAsync: (task: () => Promise<void>) => native.withTransactionAsync(task),
  });

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

/**
 * Brings a database up to the current schema, and says nothing if it is
 * already there. Safe to call on every launch - that is when it runs.
 *
 * Each step is applied inside its own transaction, so a phone that dies
 * mid-upgrade comes back on the last version that completed rather than on
 * half of the next one.
 */
export async function migrate(conn: Db): Promise<number> {
  const row = await conn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    const step = MIGRATIONS[version];
    await conn.withTransactionAsync(async () => {
      await conn.execAsync(step);
      // Inside the transaction, and that is the whole point.
      //
      // Written after the commit, this line was a way to brick a phone. A
      // process killed in the gap between the two would come back believing
      // the step had not run, and re-run it - and a step like V2's
      // `ALTER TABLE ... ADD COLUMN` fails on a column that already exists.
      // Not once: on every launch, for ever, with no way in.
      //
      // `PRAGMA user_version` participates in the transaction like any other
      // write, so the schema change and the record of it now land together or
      // not at all. PRAGMA takes no bound parameter, and the value is an index
      // into a constant list rather than anything a caller can reach.
      // proofgate-allow
      await conn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }

  return MIGRATIONS.length;
}

/**
 * Test seam: lets a test stand a database up at an older version deliberately,
 * so the upgrade path is exercised rather than assumed. A migration is only
 * ever run once on a real phone, which makes it the one piece of code where a
 * mistake is unreachable by every other test.
 */
export const migrationSteps: readonly string[] = MIGRATIONS;

/** How many steps exist, so a test can assert it moved. */
export const schemaVersion = MIGRATIONS.length;

/** The pragmas a connection needs before anything else touches it. */
/** Test seam: lets a test point at a fresh in-memory database. */
export function __setDb(next: Db | null) {
  handle = next;
  opening = null;
}

/**
 * Points the opening at something a test can run. Only the tests call this -
 * and the reason it exists is that the path behind it, the one every phone
 * takes on first launch, had no way of being exercised at all.
 */
export function __setOpener(next: Opener) {
  openNative = next;
  handle = null;
  opening = null;
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
