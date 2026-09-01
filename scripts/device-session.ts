/**
 * Runs a real session on a real device database, then prints its outbox as SQL
 * the server would receive.
 *
 * This is the half of the verification bar that was missing, and the reason six
 * defects lived in plain sight: everything else exercises a module or drives the
 * app, and neither can see the seam where SQLite's shapes meet Postgres's. That
 * seam only exists when a queue is actually replayed.
 *
 * Nothing here is mocked. The session calls the same repository functions the
 * screens call, the queue is the one the app really builds, and the SQL comes
 * out of `serialize` - the code that will run when sync is switched on.
 *
 * Output goes to stdout for `scripts/verify-sync.sh` to feed into a throwaway
 * Postgres. The device's own figures are printed as comments at the end, so the
 * shell can check that both sides agree on the number.
 */

import { DatabaseSync } from 'node:sqlite';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { pendingEntries } from '@/data/outbox';
import {
  defaultLocationId,
  listItems,
  recordCount,
  recordPurchase,
  saveRecipeVersion,
  itemCosts,
} from '@/data/repository';
import { ensureStarterData, LOCAL_COMPANY_ID } from '@/data/seed';
import { fromDecimal } from '@/domain/money';
import { sendableTables, serialize, type SyncActor } from '@/sync/serialize';

/** Stands in for whoever is signed in when the phone finally finds a tower. */
const ACTOR: SyncActor = { userId: '00000000-0000-4000-8000-000000000001' };

/**
 * An identifier on its way into SQL, checked instead of trusted.
 *
 * Table and column names cannot be bound parameters - Postgres takes an
 * identifier only as text in the statement - so the usual defence is not
 * available here and prose is what is left. Prose is not a defence: a comment
 * saying "these come from a closed list" stays on the page after somebody
 * widens the list. This does the same argument as a check, so widening it
 * wrongly stops the script instead of building the statement.
 */
function ident(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`refusing to build SQL around an identifier like "${name}"`);
  }
  return name;
}

function connect(): { db: Db; raw: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));

  return {
    raw: sqlite,
    db: {
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
    },
  };
}

async function main() {
  const { db, raw } = connect();
  await migrate(db);
  __setDb(db);

  // A day in the factory, in the order it really happens.
  await ensureStarterData(LOCAL_COMPANY_ID);

  const items = await listItems(LOCAL_COMPANY_ID);
  const sugar = items.find((i) => i.name.startsWith('Açúcar'));
  const pulp = items.find((i) => i.name.startsWith('Polpa'));
  if (!sugar || !pulp) throw new Error('the starter data did not arrive');

  // A second invoice, so the moving average has something to move.
  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: sugar.id,
    supplierName: 'Fornecedor Silva',
    purchaseQuantity: 2,
    baseUnits: 50_000,
    totalCents: fromDecimal(295),
  });

  // Somebody walks to the shelf and finds less than the books expected.
  await recordCount(LOCAL_COMPANY_ID, {
    locationId: defaultLocationId(LOCAL_COMPANY_ID),
    itemId: sugar.id,
    countedBaseUnits: 92_000,
  });

  // And a recipe, whose lines carry an order somebody chose.
  await saveRecipeVersion(LOCAL_COMPANY_ID, {
    name: 'Base de creme',
    yieldAmount: 10_000,
    yieldUnit: 'ml',
    lossFraction: 0.04,
    lines: [
      { kind: 'item', itemId: pulp.id, quantity: 3_000 },
      { kind: 'item', itemId: sugar.id, quantity: 1_500 },
    ],
  });

  // --- and now, exactly what the server would receive -----------------------

  const queue = await pendingEntries(500);
  const out: string[] = [];
  const exercised = new Set<string>();

  out.push('-- Gerado por scripts/device-session.ts. Não editar à mão.');
  out.push(`-- ${queue.length} escritas na fila, na ordem em que o aparelho gravou.`);
  out.push('');

  for (const entry of queue) {
    if (entry.table === 'erase') {
      out.push(`-- erase ${entry.rowId}: comando, não linha; o servidor ainda não o recebe`);
      continue;
    }

    // The table name comes from the device's own outbox, and the row from the
    // database this script just built in memory, and `ident` refuses anything
    // that is not a plain identifier.
    const row = raw
      .prepare(`SELECT * FROM ${ident(entry.table)} WHERE id = ?`) // proofgate-allow: ident() above
      .get(entry.rowId) as Record<string, unknown> | undefined;

    const write = serialize(entry, row ?? null, ACTOR);
    if (write.kind === 'derived') {
      out.push(`-- ${write.table} não viaja: valor derivado tem um dono só, e é o servidor`);
      continue;
    }
    if (write.kind !== 'upsert') continue;

    const json = JSON.stringify(write.row);
    if (json.includes('$sync$')) throw new Error('a value collided with the quoting tag');

    // How a repeat is handled is not a detail - it is the contract.
    //
    // The queue replays the same row many times: `item_costs` is rewritten by
    // every invoice, so the server has to take the newest and overwrite. The
    // ledger is the exact opposite: `movements` is append-only and the database
    // refuses an UPDATE outright, so a movement arriving twice has to be a
    // nothing. That is what the shared id between a purchase line and its
    // movement was always for.
    const keys = Object.keys(write.row);
    const conflict = ['id'];
    const settled = keys.filter((k) => !conflict.includes(k));

    const onConflict =
      write.table === 'movements'
        ? 'do nothing'
        : `do update set ${settled.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;

    // The columns are named, and that is not cosmetic.
    //
    // `select *` off `jsonb_populate_record` hands the insert every column the
    // table has, with NULL wherever the JSON was silent - which quietly defeats
    // the server's own defaults and turns `freight_cents not null default 0`
    // into a rejected write. A real client sends the fields it has and lets the
    // server fill the rest, so that is what this does. It also makes a field the
    // table does not have fail on the column list, loudly, which is the entire
    // point of running this. Every name here comes from `serialize`'s own closed
    // list, never from outside, and `ident` enforces that rather than asserting it.
    exercised.add(write.table);

    const columns = keys.map(ident).join(', ');
    out.push(
      `insert into ${ident(write.table)} (${columns}) select ${columns} from ` + // proofgate-allow: ident() above
        `jsonb_populate_record(null::${write.table}, $sync$${json}$sync$::jsonb) ` +
        `on conflict (${conflict.join(', ')}) ${onConflict};`,
    );
  }

  // The guard checks itself.
  //
  // Every table `serialize` claims it can send has to actually appear in this
  // session, or the sixth guarantee quietly covers nine tables out of ten and
  // reads exactly the same. A table added tomorrow that nothing here exercises
  // stops the run rather than passing.
  const untouched = sendableTables.filter((table) => !exercised.has(table));
  if (untouched.length > 0) {
    throw new Error(
      `a sessão não exercita ${untouched.join(', ')} — a checagem 6 cobriria menos do que promete`,
    );
  }

  // What the device believes, for the shell to check the server against.
  const after = await listItems(LOCAL_COMPANY_ID);
  const heldSugar = after.find((i) => i.id === sugar.id);
  const costs = await itemCosts(LOCAL_COMPANY_ID);

  out.push('');
  out.push(`-- DEVICE_SUGAR_ID=${sugar.id}`);
  out.push(`-- DEVICE_SUGAR_BALANCE=${heldSugar?.onHandBaseUnits ?? 0}`);
  // A Rate, not money: fractional by foundation, and printed here only so the
  // server's own average can be compared against it.
  out.push(`-- DEVICE_SUGAR_AVERAGE=${(costs[sugar.id] ?? 0).toFixed(4)}`); // proofgate-allow
  out.push(`-- DEVICE_QUEUE_LENGTH=${queue.length}`);

  process.stdout.write(out.join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
