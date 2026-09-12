import assert from 'node:assert/strict';
import { fromDecimal, type Cents } from '@/domain/money';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { __setDb, db, migrate, type Db, type SqlParam } from './db';
import { EMPRESA_SEMENTE, carregarEmpresa, empresaDaqui } from './empresa';
import { readMeta, writeMeta } from './meta';
import { defaultLocationId, recordCount, stockByPlace, recordPurchase } from './repository';
import { ensureStarterData } from './seed';
import {
  CHAVE_DA_UNIDADE,
  carregarUnidade,
  escolherUnidade,
  unidadeDaqui,
} from './unidade';

/**
 * Em qual unidade este aparelho trabalha — e a prova é onde o movimento cai.
 *
 * **A asserção que interessa não é o que a função devolve.** `unidadeDaqui()`
 * responder o que `app_meta` guarda é a parte fácil e um teste disso compara a
 * função com ela mesma. O que quebra numa fábrica de duas unidades é o
 * `location_id` GRAVADO: a produção de Marília entrando no saldo de Bauru, sem
 * nada acusar, porque as duas somam na mesma empresa. Então a segunda fonte
 * destes testes é o saldo POR LUGAR, calculado por `stockByPlace`, que não sabe
 * que este módulo existe.
 */
function ligar(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));
  return {
    getAllAsync: async <T>(sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T>(sql: string, params: SqlParam[] = []) =>
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
      } catch (erro) {
        sqlite.exec('ROLLBACK');
        throw erro;
      }
    },
  };
}

beforeEach(async () => {
  const conn = ligar();
  await migrate(conn);
  __setDb(conn);
  await carregarEmpresa();
  await carregarUnidade();
});

test('aparelho recém-instalado trabalha na primeira unidade, sem ninguém ter escolhido', async () => {
  assert.equal(empresaDaqui(), EMPRESA_SEMENTE);
  assert.equal(unidadeDaqui(), defaultLocationId(EMPRESA_SEMENTE));
  // A segunda fonte: o disco. Instalação nova não guardou unidade nenhuma, e a
  // resposta acima veio do padrão — não de alguém ter escolhido a primeira.
  assert.equal(await readMeta(CHAVE_DA_UNIDADE), null);
});

test('a unidade guardada no disco vence o padrão, e só depois de ler o disco', async () => {
  const outra = '7c2b91d4-5e60-4a3f-9c81-000000000fed';
  const conn = await db();
  await conn.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at)
     VALUES (?, ?, 'Marília', 'factory', ?)`,
    [outra, EMPRESA_SEMENTE, '2026-09-01T00:00:00.000Z'],
  );
  await writeMeta(CHAVE_DA_UNIDADE, outra);
  assert.equal(
    unidadeDaqui(),
    defaultLocationId(EMPRESA_SEMENTE),
    'escrever no disco não muda a memória sozinho — quem lê é o boot',
  );

  assert.equal(await carregarUnidade(), outra);
  assert.equal(unidadeDaqui(), outra);
});

/**
 * O id guardado que deixou de existir — e este é o caso que de fato ocorre.
 *
 * A adoção da empresa APAGA o lugar velho (`adocao.ts`, passo 3), e uma cópia
 * restaurada de outro aparelho traz uma unidade que este banco não tem. Nos dois, o
 * `unit.id` do disco aponta para nada, e toda escrita passa a falhar com `FOREIGN KEY
 * constraint failed` — texto cru de SQLite na tela de quem acabou de criar a conta.
 *
 * A tolerância já existia para chave vazia; ela vale igual para chave que envelheceu.
 */
test('unidade que deixou de existir cai no padrão em vez de travar toda escrita', async () => {
  await writeMeta(CHAVE_DA_UNIDADE, 'e9c1d3b7-0000-4000-8000-000000000bad');
  assert.equal(
    await carregarUnidade(),
    defaultLocationId(EMPRESA_SEMENTE),
    'id que não existe em locations não carimba nada',
  );
  assert.equal(unidadeDaqui(), defaultLocationId(EMPRESA_SEMENTE));
});

test('chave vazia no disco cai no padrão em vez de carimbar um id inventado', async () => {
  await writeMeta(CHAVE_DA_UNIDADE, '   ');
  await carregarUnidade();
  assert.equal(unidadeDaqui(), defaultLocationId(EMPRESA_SEMENTE));
  await assert.rejects(() => escolherUnidade('  '), /unidade sem id/);
});

test('o que se grava depois de trocar de unidade cai NA outra, e o saldo da primeira não se mexe', async () => {
  await ensureStarterData();
  const conn = await db();
  const empresa = empresaDaqui();
  const primeira = defaultLocationId(empresa);

  // Uma segunda unidade, do jeito que ela vai nascer: uuid próprio, espécie
  // `factory`, mesma empresa. Nada no esquema impede — o que impedia era a tela.
  const segunda = '3f9a0c17-8b24-4d55-9e63-0000000000aa';
  await conn.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at)
     VALUES (?, ?, 'Marília', 'factory', ?)`,
    [segunda, empresa, new Date().toISOString()],
  );

  const item = await conn.getFirstAsync<{ id: string }>(
    `SELECT id FROM items WHERE company_id = ? LIMIT 1`,
    [empresa],
  );
  assert.ok(item, 'o exemplo semeado tem de ter pelo menos um item');

  const antes = await stockByPlace(empresa);
  const naPrimeiraAntes =
    antes.find((p) => p.locationId === primeira)?.lines.find((i) => i.itemId === item.id)
      ?.baseUnits ?? 0;

  await escolherUnidade(segunda);
  assert.equal(
    await readMeta(CHAVE_DA_UNIDADE),
    segunda,
    'escolher tem de GRAVAR: aparelho que esquece a unidade no reinício grava na errada amanhã',
  );
  await recordCount(empresa, {
    itemId: item.id,
    countedBaseUnits: 4000,
    locationId: unidadeDaqui(),
  });

  const depois = await stockByPlace(empresa);
  const naSegunda =
    depois.find((p) => p.locationId === segunda)?.lines.find((i) => i.itemId === item.id)
      ?.baseUnits ?? 0;
  const naPrimeiraDepois =
    depois.find((p) => p.locationId === primeira)?.lines.find((i) => i.itemId === item.id)
      ?.baseUnits ?? 0;

  // A pré-condição, sem a qual a asserção de baixo compara zero com zero e passa
  // por acidente: o exemplo semeado põe 40 kg deste item na primeira unidade. Se
  // a contagem tivesse caído lá, `recordCount` gravaria a diferença e o saldo
  // viraria 4000 — então a segunda metade só é uma régua porque este número não
  // é zero nem 4000.
  assert.equal(
    naPrimeiraAntes,
    40000,
    'mudou o exemplo semeado: sem saldo na primeira unidade a asserção de baixo não prova nada',
  );

  // As duas metades, e a segunda é a que pega o defeito de verdade: uma unidade
  // que some no saldo da outra passa despercebida se só se olhar o destino.
  assert.equal(naSegunda, 4000, 'a contagem tinha de cair na unidade escolhida');
  assert.equal(
    naPrimeiraDepois,
    naPrimeiraAntes,
    'o saldo da primeira unidade não pode ter se mexido — foi contagem na outra',
  );
});

test('a nota lançada na segunda unidade entra NA segunda, e não no almoxarifado da primeira', async () => {
  /**
   * `recordPurchase` era o único dos quatro escritores do razão que não aceitava sala, e a
   * guarda `ESCRITORES_COM_SALA` não o cobrava — a lista e o defeito concordavam. A carga
   * caía sempre em `ensureLocation(companyId)`, o almoxarifado da PRIMEIRA unidade.
   *
   * Numa fábrica de uma unidade só os dois ids são o mesmo e nada aparece. Na segunda, a
   * nota digitada lá dentro some: o saldo cresce a centenas de quilômetros de onde o
   * caminhão descarregou, e quem está com o saco na mão conta falta.
   */
  await ensureStarterData();
  const conn = await db();
  const empresa = empresaDaqui();
  const primeira = defaultLocationId(empresa);

  const segunda = '3f9a0c17-8b24-4d55-9e63-0000000000bb';
  await conn.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at)
     VALUES (?, ?, 'Marília', 'factory', ?)`,
    [segunda, empresa, new Date().toISOString()],
  );

  const item = await conn.getFirstAsync<{ id: string }>(
    `SELECT id FROM items WHERE company_id = ? AND kind = 'input' LIMIT 1`,
    [empresa],
  );
  assert.ok(item, 'o exemplo semeado tem de ter pelo menos um insumo');

  const saldo = async (lugar: string) =>
    (await stockByPlace(empresa))
      .find((p) => p.locationId === lugar)
      ?.lines.find((i) => i.itemId === item.id)?.baseUnits ?? 0;

  const primeiraAntes = await saldo(primeira);
  const segundaAntes = await saldo(segunda);

  await escolherUnidade(segunda);
  await recordPurchase(empresa, {
    itemId: item.id,
    purchaseQuantity: 1,
    baseUnits: 5_000,
    totalCents: fromDecimal(62) as Cents,
    locationId: unidadeDaqui(),
  });

  assert.equal(
    await saldo(segunda),
    segundaAntes + 5_000,
    'os cinco quilos entraram onde o caminhão descarregou',
  );
  assert.equal(
    await saldo(primeira),
    primeiraAntes,
    'e o almoxarifado da primeira unidade não se mexeu — era para lá que a carga ia antes',
  );
});
