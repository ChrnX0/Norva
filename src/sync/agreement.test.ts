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
type Column = { notNull: boolean; hasDefault: boolean };

function serverColumns(sql: string): Map<string, Map<string, Column>> {
  const tables = new Map<string, Map<string, Column>>();

  const rule = (line: string): Column => ({
    notNull: /\bnot null\b/i.test(line),
    // A primary key with a generated id needs nothing from the device either.
    hasDefault: /\bdefault\b/i.test(line) || /\bprimary key\b/i.test(line),
  });

  for (const m of sql.matchAll(/create table (\w+) \(([\s\S]*?)\n\);/g)) {
    const columns = new Map<string, Column>();
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('--') || /^(constraint|check|unique|primary|foreign)\b/i.test(line)) {
        continue;
      }
      const name = line.split(/\s+/)[0];
      if (/^\w+$/.test(name)) columns.set(name, rule(line));
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

    for (const m of statement.matchAll(/add column (?:if not exists )?(\w+)([^,]*)/g)) {
      tables.get(table[1])?.set(m[1], rule(m[2]));
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

test('a check that matched is a row the server would accept', () => {
  const sql = serverSql();

  // A regra que quase impediu a conferência de existir: o servidor recusa linha
  // que não move nada. "Conferi e bateu" é diferença zero - e é a conferência
  // que mais vale, porque é a prova de que alguém abriu a caixa.
  const rule = sql.match(/constraint movement_moved_something\s+check \(([\s\S]*?)\);/g);
  assert.ok(rule, 'a restrição não está onde este teste a procura');

  // A ÚLTIMA definição é a que vale: a 0017 derruba e recria.
  const current = rule[rule.length - 1];
  assert.match(
    current,
    /kind = 'discrepancy' and post is not null/,
    'o servidor recusaria a conferência que bateu',
  );

  // E o aparelho escreve exatamente esse par - `discrepancy` com posto.
  const repository = readFileSync(join(DEVICE, 'repository.ts'), 'utf8');
  assert.match(
    repository,
    /VALUES \(\?, \?, 'discrepancy'[^)]*'checked'/,
    'a escrita da conferência não carimba o posto',
  );
});

test('the words the device has for a loss are words the server accepts', () => {
  const sql = serverSql();
  const server = enumValues(sql, 'loss_reason');

  // Read from the type rather than listed here: a reason added tomorrow is
  // checked without anybody remembering this file exists.
  const ledger = readFileSync(join(process.cwd(), 'src', 'domain', 'ledger.ts'), 'utf8');
  const declared = ledger.match(/export type LossReason =([^;]+);/);
  assert.ok(declared, 'the LossReason union is not where this test looks for it');
  const device = [...declared[1].matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]);

  assert.ok(device.length >= 4, 'no loss reasons found - the parse is looking in the wrong shape');

  // This is the mismatch this file was written for, and it slipped through
  // anyway because nobody checked THIS enum: the device said `internalUse` and
  // the server enum says `internal_use`. No loss has ever been written, so it
  // was free to fix - the first one would have been accepted by SQLite, queued,
  // and refused by Postgres with nobody watching.
  for (const reason of device) {
    assert.ok(
      server.has(reason),
      `the device can record a loss as "${reason}" and the server enum has no such value`,
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

test('nothing the server insists on is left for the device to forget', () => {
  const tables = serverColumns(serverSql());

  // The other direction of the same contract, and the one the replay found the
  // hard way: `purchases.freight_cents` is `not null default 0`, and an insert
  // that names its columns lets the default do its job - while one that sends
  // every column with NULL in the silent ones defeats it and is refused.
  //
  // So a column the server requires and gives no default for has to come from
  // here. There is nowhere else for it to come from.
  const forgotten: string[] = [];

  for (const table of sendableTables) {
    const columns = tables.get(table);
    assert.ok(columns, `the server has no ${table}`);

    const write = serialize(entry(table), {}, ACTOR);
    if (write.kind !== 'upsert') continue;
    const sent = new Set(Object.keys(write.row));

    for (const [name, rule] of columns) {
      if (rule.notNull && !rule.hasDefault && !sent.has(name)) {
        forgotten.push(`${table}.${name}`);
      }
    }
  }

  assert.deepEqual(
    forgotten,
    [],
    'the server requires these and the device never sends them, so every write is refused',
  );
});

test('the parser can tell a required column from a defaulted one', () => {
  const tables = serverColumns(serverSql());

  // Canaries again. Without these the test above is measuring the parser: a
  // rule that reads everything as "has a default" would report nothing missing
  // for ever.
  assert.equal(tables.get('movements')?.get('recorded_by')?.notNull, true);
  assert.equal(tables.get('movements')?.get('recorded_by')?.hasDefault, false);
  assert.equal(tables.get('purchases')?.get('freight_cents')?.hasDefault, true);
  assert.equal(tables.get('movements')?.get('note')?.notNull, false);
});

/**
 * The domain type and the schema it claims to describe.
 *
 * This one exists because the drift it catches survived for days in plain
 * sight. `0008` dropped `unit_cost_cents` on the server and added
 * `unit_cost_rate`; the device followed; and `src/domain/ledger.ts` went on
 * declaring `unitCostCents?: Cents` - the exact inversion of this project's
 * headline rule, sitting in the type that defines what a movement IS.
 *
 * Nothing caught it, and the reason is the finding: no line of production code
 * imports that module, so no test exercised it and no compile error could
 * arise. A type nobody uses is not harmless - it is a lie waiting for its
 * first caller, and the first caller here is the production screen.
 */
test('the movement type names only columns the ledger actually has', () => {
  const tables = serverColumns(serverSql());
  const movements = tables.get('movements');
  assert.ok(movements && movements.size > 10, 'the movements table did not parse');

  const domain = readFileSync('src/domain/ledger.ts', 'utf8');
  const body = domain.slice(domain.indexOf('export type Movement = {'));
  const fields = [...body.slice(0, body.indexOf('\n};')).matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map(
    (m) => m[1],
  );
  assert.ok(fields.length > 8, `parsed ${fields.length} fields - the parse itself is broken`);

  const snake = (f: string) => f.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  const invented = fields.filter((f) => !movements.has(snake(f)));

  assert.deepEqual(
    invented,
    [],
    `these fields name no column the server has: ${invented.map(snake).join(', ')}. ` +
      'The server is the authority on what a movement is - a field it does not have is ' +
      'either a schema that moved without the type, or something the type invented.',
  );
});

/**
 * And the other direction, which is a gap rather than a lie.
 *
 * The device is a partial local store: it does not keep `recorded_by` (the
 * serializer stamps it from whoever syncs) and has never needed the control
 * posts. That is fine, and listing it here is what keeps it deliberate - the
 * day a screen needs one of these, the missing column is named rather than
 * discovered by a foreign key failing at four in the morning.
 */
test('what the device does not keep is a list somebody wrote, not a surprise', () => {
  const device = readFileSync('src/data/db.ts', 'utf8');
  const table = device.slice(device.indexOf('CREATE TABLE IF NOT EXISTS movements'));
  const columns = new Set(
    [...table.slice(0, table.indexOf(');')).matchAll(/^\s{2}([a-z_]+)\s/gm)].map((m) => m[1]),
  );

  // The later steps count too. Reading only the CREATE was this check's own
  // blind spot, and it announced itself the first time a migration added a
  // column: the test reported a gap that had just been closed. The server side
  // of this file has handled creates-then-adds-then-drops from the start.
  for (const m of device.matchAll(/ALTER TABLE movements ADD COLUMN (\w+)/g)) columns.add(m[1]);
  for (const m of device.matchAll(/ALTER TABLE movements DROP COLUMN (\w+)/g)) columns.delete(m[1]);

  assert.ok(columns.size > 8, `parsed ${columns.size} columns - the parse itself is broken`);

  const domain = readFileSync('src/domain/ledger.ts', 'utf8');
  const body = domain.slice(domain.indexOf('export type Movement = {'));
  const fields = [...body.slice(0, body.indexOf('\n};')).matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map(
    (m) => m[1].replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
  );

  const known = [
    // Stamped by `serialize` from the account doing the sync; the server
    // enforces `recorded_by = auth.uid()` and no device value could be right.
    'recorded_by',
  ];

  const surprises = fields.filter((f) => !columns.has(f) && !known.includes(f));
  assert.deepEqual(surprises, [], `absent from the device and from the list: ${surprises.join(', ')}`);

  // And the list has to rot out loud. An entry claiming a gap that was closed
  // reads as deliberate absence for ever, which is the same defect as a
  // suppression marker that suppresses nothing.
  const stale = known.filter((f) => columns.has(f));
  assert.deepEqual(stale, [], `the device has these now - take them off the list: ${stale.join(', ')}`);
});

test('every table the device queues is a table something knows how to send', () => {
  // O guarda de acordo já olhava um lado: para cada tabela que o serializador
  // sabe mandar, o servidor tem as colunas. Faltava o inverso, e o inverso é o
  // que machuca — uma tabela que o repositório enfileira e ninguém sabe enviar
  // não é erro de compilação nem teste vermelho: é `UnknownTableError` no meio
  // da fila, e a fila é enviada em ordem. A linha recusada nunca sai da frente,
  // e TUDO que foi escrito depois dela fica preso atrás — inclusive movimento.
  //
  // Aconteceu de novo com `product_lines`, `product_types` e `flavors`: três
  // tabelas novas, três `enqueue`, nenhuma travessia. O achado de que "o guarda
  // só olhava para um lado" está em docs/insights.md desde antes; padrão que
  // aparece duas vezes é dívida, não coincidência.
  const repo = readFileSync(join(import.meta.dirname, '../data/repository.ts'), 'utf8');
  const enfileiradas = new Set(
    [...repo.matchAll(/\btable:\s*'([a-z_]+)'/g)].map((m) => m[1]),
  );

  assert.ok(enfileiradas.size > 5, 'a varredura não achou os enqueue do repositório');

  // `erase` não é tabela: é comando, e `serialize` o resolve antes de olhar a
  // travessia. A exceção está escrita aqui e não numa lista de nomes porque é
  // exatamente isso que o serializador faz — se um dia ele parar de tratar
  // comando, este teste tem que voltar a acusar.
  const comandos = new Set(
    [...readFileSync(join(import.meta.dirname, 'serialize.ts'), 'utf8').matchAll(
      /entry\.table === '([a-z_]+)'/g,
    )].map((m) => m[1]),
  );

  const orfas = [...enfileiradas].filter(
    (t) => !(sendableTables as readonly string[]).includes(t) && !comandos.has(t),
  );
  assert.deepEqual(
    orfas,
    [],
    `o repositório enfileira ${orfas.join(', ')} e nada sabe enviar — a fila trava na primeira`,
  );
});


test('the words the device has for a return are words the server accepts', () => {
  // Esta checagem NÃO existia quando `return_reason` entrou, em 6 de setembro —
  // e quem a escreveu fui eu, no mesmo dia, sem me lembrar deste arquivo. É
  // exatamente a forma do defeito que ele já pegou uma vez: `internalUse` contra
  // `internal_use`, aceito pelo SQLite, enfileirado, e recusado pelo Postgres com
  // ninguém olhando.
  //
  // A lição não é "prestar atenção": é que um vocabulário novo do razão precisa
  // entrar aqui no mesmo commit que o cria, e agora o vizinho de baixo cobra isso.
  const server = enumValues(serverSql(), 'return_reason');

  const ledger = readFileSync(join(process.cwd(), 'src', 'domain', 'ledger.ts'), 'utf8');
  const declared = ledger.match(/export type ReturnReason =([^;]+);/);
  assert.ok(declared, 'the ReturnReason union is not where this test looks for it');
  const device = [...declared[1].matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]);

  assert.ok(device.length >= 4, 'no return reasons found - the parse is looking in the wrong shape');
  for (const reason of device) {
    assert.ok(
      server.has(reason),
      `the device can record a return as "${reason}" and the server enum has no such value`,
    );
  }
});


test('the control post the device stamps is a post the server knows', () => {
  // `post` é TEXTO no aparelho e ENUM no servidor, e hoje só a conferência de
  // chegada o escreve — `recordCheck` grava 'checked'. Uma palavra nova aqui
  // (separado, carregado, entregue) sobe como texto e é recusada como enum, e a
  // recusa acontece na fila, meses depois, longe de quem a escreveu.
  const server = enumValues(serverSql(), 'control_post');

  const ledger = readFileSync(join(process.cwd(), 'src', 'domain', 'ledger.ts'), 'utf8');
  const declared = ledger.match(/export type ControlPost =([^;]+);/);
  assert.ok(declared, 'the ControlPost union is not where this test looks for it');
  const device = [...declared[1].matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]);

  assert.ok(device.length >= 4, 'no control posts found - the parse is looking in the wrong shape');
  for (const post of device) {
    assert.ok(
      server.has(post),
      `the device can stamp the post "${post}" and the server enum has no such value`,
    );
  }
});


test('the kind of thing the device registers is a kind the server knows', () => {
  // `items.kind` decide quase tudo o que a tela oferece — insumo, embalagem,
  // produto, revenda, material de loja. Uma palavra a mais aqui e o item inteiro
  // é recusado na primeira sincronia, com as receitas que dependem dele atrás.
  const server = enumValues(serverSql(), 'item_kind');

  const repo = readFileSync(join(process.cwd(), 'src', 'data', 'repository.ts'), 'utf8');
  const declared = repo.match(/export type ItemKind =([^;]+);/);
  assert.ok(declared, 'the ItemKind union is not where this test looks for it');
  const device = [...declared[1].matchAll(/'([a-z_]+)'/gi)].map((m) => m[1]);

  assert.ok(device.length >= 3, 'no item kinds found - the parse is looking in the wrong shape');
  for (const kind of device) {
    assert.ok(
      server.has(kind),
      `the device can register an item as "${kind}" and the server enum has no such value`,
    );
  }
});
