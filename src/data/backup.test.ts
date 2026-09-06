import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, test } from 'node:test';
import { __setDb, migrate, nowIso, schemaVersion, type Db, type SqlParam } from './db';
import {
  gravarCopia,
  lerCopia,
  restaurar,
  CopiaRecusadaError,
  type MotivoDaCopia,
} from './backup';
import { listItems, recordPurchase, itemMovements } from './repository';
import { ensureStarterData, LOCAL_COMPANY_ID } from './seed';
import { fromDecimal } from '@/domain/money';

/**
 * A cópia do aparelho é a única peça do plano cujo prejuízo não tem conserto —
 * então ela é a que menos pode ser provada por dedução.
 *
 * O banco aqui é um ARQUIVO e não `:memory:`, porque `VACUUM INTO` e `ATTACH`
 * escrevem e leem arquivo de verdade. Provar cópia contra banco em memória seria
 * provar outra coisa.
 */
let pasta: string;
let vivo: DatabaseSync;

function ligar(caminho: string): Db {
  const sqlite = new DatabaseSync(caminho);
  vivo = sqlite;
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

beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'norva-copia-'));
  const conn = ligar(join(pasta, 'norva.db'));
  __setDb(conn);
  await migrate(conn);
});

afterEach(() => {
  __setDb(null);
  try {
    vivo.close();
  } catch {
    /* já fechado */
  }
  rmSync(pasta, { recursive: true, force: true });
});

async function motivoDe(acao: () => Promise<unknown>): Promise<MotivoDaCopia | 'nao recusou'> {
  try {
    await acao();
    return 'nao recusou';
  } catch (e) {
    if (e instanceof CopiaRecusadaError) return e.motivo;
    throw e;
  }
}

test('a copy holds the whole factory and gives it back', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.kind === 'input')!.id;
  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });

  const antes = (await itemMovements(LOCAL_COMPANY_ID, acucar)).length;
  assert.ok(antes > 0, 'havia movimento para copiar');

  const arquivo = join(pasta, 'copia.db');
  const feita = await gravarCopia(arquivo, nowIso());
  assert.ok(existsSync(arquivo), 'a cópia existe no disco');
  assert.ok(feita.bytes > 0, 'a cópia tem tamanho');
  assert.equal(feita.versaoDoEsquema, schemaVersion, 'a cópia carrega a versão do esquema');
  assert.ok(feita.movimentos > 0, 'a cópia levou os movimentos');

  // O estrago: mais uma compra depois da cópia. Ela NÃO pode sobreviver à volta,
  // senão a restauração é uma mistura e não uma volta.
  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: acucar,
    purchaseQuantity: 99,
    baseUnits: 1_000_000,
    totalCents: fromDecimal(9999),
  });
  assert.ok((await itemMovements(LOCAL_COMPANY_ID, acucar)).length > antes, 'o estrago entrou');

  const volta = await restaurar(arquivo);
  assert.ok(volta.tabelas > 10, `a volta tocou as tabelas da fábrica (${volta.tabelas})`);
  assert.equal(
    (await itemMovements(LOCAL_COMPANY_ID, acucar)).length,
    antes,
    'depois da volta o razão é o da cópia, sem a compra que veio depois',
  );
});

test('an old copy climbs the ladder: columns the copy never had take their default', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const arquivo = join(pasta, 'antiga.db');
  await gravarCopia(arquivo, nowIso());

  // Uma migração futura, encenada: a coluna existe AQUI e não na cópia. Se a
  // restauração usasse as colunas de agora, o INSERT falharia por contagem — e é
  // exatamente o que separa "restaura" de "restaura o que foi feito hoje".
  vivo.exec(`ALTER TABLE items ADD COLUMN futura TEXT DEFAULT 'padrao'`);

  const volta = await restaurar(arquivo);
  assert.ok(volta.linhas > 0, 'voltou linha');

  const linha = vivo.prepare(`SELECT futura FROM items LIMIT 1`).get() as { futura: string | null };
  assert.equal(linha?.futura, 'padrao', 'a coluna nova nasceu com o padrão dela, não nula à força');
});

test('a copy from a newer app is refused, not half-restored', async () => {
  const arquivo = join(pasta, 'do-futuro.db');
  await gravarCopia(arquivo, nowIso());

  // O aparelho de onde ela veio tinha mais migrações que este aplicativo.
  const dela = new DatabaseSync(arquivo);
  dela.exec(`PRAGMA user_version = ${schemaVersion + 5}`);
  dela.close();

  assert.equal(
    await motivoDe(() => lerCopia(arquivo)),
    'maisNovaQueOApp',
    'recusar é a única resposta honesta: o aplicativo velho não conhece o que o novo criou, ' +
      'e restaurar o que ele entende traria a fábrica sem uma parte dela, em silêncio',
  );
  assert.equal(await motivoDe(() => restaurar(arquivo)), 'maisNovaQueOApp', 'e a volta também recusa');
});

test('a file that is not a factory is refused', async () => {
  const estranho = join(pasta, 'outra-coisa.db');
  const d = new DatabaseSync(estranho);
  d.exec('CREATE TABLE fotos(a); INSERT INTO fotos VALUES (1);');
  d.close();
  assert.equal(await motivoDe(() => lerCopia(estranho)), 'naoEhNorva');

  const truncado = join(pasta, 'truncado.db');
  writeFileSync(truncado, 'isto nao e um banco');
  assert.equal(await motivoDe(() => lerCopia(truncado)), 'ilegivel');
});

test('the copy says when it was made, because the file date does not survive the trip', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const arquivo = join(pasta, 'selada.db');
  const quando = '2026-09-04T11:20:00.000Z';
  await gravarCopia(arquivo, quando);

  const lida = await lerCopia(arquivo);
  assert.equal(lida.feitoEm, quando, 'o selo viaja dentro da cópia — WhatsApp e Drive reescrevem a data do arquivo');
  assert.ok(lida.itens > 0, 'a leitura conta os itens sem restaurar nada');
  assert.ok(lida.tabelasEmComum > 10, 'a cópia e o aplicativo falam da mesma fábrica');
});

/**
 * A guarda que impede a doença conhecida deste repositório um nível acima.
 *
 * A coluna sem escritor apareceu três vezes em setembro. A **tabela sem
 * restaurador** seria a mesma coisa com consequência pior: a fábrica voltaria
 * quase inteira, o que parece certo. Por isso a lista de tabelas é lida do
 * `sqlite_master` e não escrita à mão — e este teste é o que cobra isso, porque
 * uma migração futura que crie tabela nova tem de entrar coberta sem ninguém
 * lembrar do `backup.ts`.
 */
test('no table is forgotten: everything the schema has is either restored or emptied', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const arquivo = join(pasta, 'inteira.db');
  await gravarCopia(arquivo, nowIso());

  const todas = vivo
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => (r as { name: string }).name);
  assert.ok(todas.length > 15, `o esquema tem tabelas de sobra para esquecer alguma (${todas.length})`);

  // Uma tabela que existe AQUI e não na cópia. Ela tem de ficar VAZIA e não
  // intacta: sobrar um pedaço do estado antigo grudado na fábrica restaurada é o
  // pior resultado possível, porque parece certo.
  vivo.exec(`CREATE TABLE recem_criada (id TEXT PRIMARY KEY)`);
  vivo.exec(`INSERT INTO recem_criada (id) VALUES ('do estado antigo')`);

  await restaurar(arquivo);

  const sobrou = vivo.prepare(`SELECT count(*) c FROM recem_criada`).get() as { c: number };
  assert.equal(
    sobrou.c,
    0,
    'tabela que a cópia não conhece fica vazia, nunca intacta — restauração é volta, não mistura',
  );

  const naVolta = vivo.prepare(`SELECT count(*) c FROM items`).get() as { c: number };
  assert.ok(naVolta.c > 0, 'e o que a cópia conhece voltou');
});

/**
 * Desligar a checagem de referência para poder escrever não é desistir dela.
 *
 * Sem o `foreign_key_check` no fim, a restauração entregaria uma fábrica com
 * órfãos e chamaria isso de sucesso — que é o modo de falhar mais caro que uma
 * cópia tem, porque o dono acredita que voltou.
 */
test('a copy with broken references is refused and nothing changed', async () => {
  await ensureStarterData(LOCAL_COMPANY_ID);
  const acucar = (await listItems(LOCAL_COMPANY_ID)).find((i) => i.kind === 'input')!.id;
  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });
  const arquivo = join(pasta, 'furada.db');
  await gravarCopia(arquivo, nowIso());

  // A cópia é adulterada: um movimento aponta para um item que não existe nela.
  const dela = new DatabaseSync(arquivo);
  dela.exec(`PRAGMA foreign_keys = OFF`);
  dela.exec(`UPDATE movements SET item_id = 'item-que-nao-existe'`);
  dela.close();

  const antesDaVolta = vivo.prepare(`SELECT count(*) c FROM movements`).get() as { c: number };
  assert.equal(
    await motivoDe(() => restaurar(arquivo)),
    'referenciasQuebradas',
    'a volta recusa em vez de entregar órfãos',
  );
  assert.equal(
    (vivo.prepare(`SELECT count(*) c FROM movements`).get() as { c: number }).c,
    antesDaVolta.c,
    'e a transação foi desfeita: o aparelho está como estava, não vazio',
  );
});
