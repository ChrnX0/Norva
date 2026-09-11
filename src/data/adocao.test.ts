import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { __setDb, db, migrate, type Db, type SqlParam } from './db';
import {
  AdocaoRecusadaError,
  adotarEmpresa,
  colunasDeLugar,
  porQueNaoPodeAdotar,
  tabelasComEmpresa,
} from './adocao';
import {
  CHAVE_DA_EMPRESA,
  EMPRESA_SEMENTE,
  carregarEmpresa,
  empresaDaqui,
} from './empresa';
import { fromDecimal, rate } from '@/domain/money';
import {
  countMovements,
  defaultLocationId,
  eraseArea,
  listItems,
  listProfiles,
  recordPurchase,
  saveItem,
  savePerson,
  savePlace,
  saveSalePrice,
} from './repository';
import { ensureStarterData } from './seed';
import { forgetSentBefore, markSent, pendingEntries } from './outbox';

/**
 * A adoção, provada pelo que sobra no banco — não pelo que a função devolve.
 *
 * **Toda asserção aqui é uma igualdade contra outra fonte.** "Não sobrou nada com
 * o id velho" é uma varredura de TODAS as tabelas que carimbam empresa, derivada
 * do esquema; 'os preços não sumiram' é uma contagem antes e depois. `> 0` não
 * prova adoção: qualquer reescrita parcial satisfaz.
 */
const NOVA = '7c9e6a11-2b34-4d55-9f01-0000000000ee';

function ligar(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) =>
    params.map((p) => (p === undefined ? null : p));
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

/** Uma fábrica de verdade em miniatura, sem o exemplo semeado. */
async function fabricaDeVerdade(): Promise<{ acucar: string; loja: string }> {
  const co = empresaDaqui();
  const acucar = await saveItem(co, {
    kind: 'input',
    name: 'Açúcar',
    purchaseUnit: 'saco',
    purchaseToBase: 50_000,
    baseUnit: 'g',
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
  });
  await recordPurchase(co, {
    itemId: acucar,
    purchaseQuantity: 1,
    baseUnits: 50_000,
    totalCents: fromDecimal(200),
  });
  const loja = await savePlace(co, { name: 'Loja Centro', kind: 'own_store' });
  // Uma pessoa também, e não é enfeite: `people` e `profiles` carimbam empresa, e
  // uma varredura sobre tabela vazia passa verde sem varrer nada. O teste de
  // mordida provou isso — excluir `people` da régua não fez a asserção morder,
  // porque não havia linha lá para deixar para trás.
  const perfis = await listProfiles(co);
  const operador = perfis.find((perfil) => perfil.templateRole === 'operator');
  assert.ok(operador, 'a semeadura de perfis tem de existir para haver gente');
  await savePerson(co, { name: 'Dona Maria', profileId: operador.id });
  return { acucar, loja: loja.id };
}

beforeEach(async () => {
  const conn = ligar();
  await migrate(conn);
  __setDb(conn);
  await carregarEmpresa();
});

test('a adoção não deixa uma linha com o carimbo velho, em nenhuma tabela', async () => {
  const { acucar, loja } = await fabricaDeVerdade();
  await saveSalePrice(empresaDaqui(), {
    itemId: acucar,
    placeId: loja,
    rate: rate(0.5, 1),
  });
  const antesDosMovimentos = await countMovements();
  const conn = await db();
  // A varredura da verificação é FEITA AQUI, e não pela função que a adoção usa.
  //
  // A primeira versão chamava `tabelasComEmpresa` para conferir o resultado de
  // `tabelasComEmpresa`: no teste de mordida, excluir `people` da régua excluiu
  // `people` da conferência junto, e a asserção passou verde sobre uma tabela
  // esquecida. Guarda que compara duas coisas escritas pela mesma mão não guarda
  // nada — aqui a segunda fonte é o `sqlite_master` lido de novo.
  const todas = await conn.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  );
  const tabelas: string[] = [];
  for (const { name } of todas) {
    const cols = await conn.getAllAsync<{ name: string }>(
      `SELECT name FROM pragma_table_info(?)`,
      [name],
    );
    if (cols.some((c) => c.name === 'company_id')) tabelas.push(name);
  }
  assert.equal(
    tabelas.length,
    25,
    'o esquema do aparelho tem 25 tabelas que carimbam empresa',
  );

  await adotarEmpresa(NOVA);

  assert.equal(empresaDaqui(), NOVA);
  const sobrou: string[] = [];
  for (const t of tabelas) {
    const linha = await conn.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${t} WHERE company_id = ?`,
      [EMPRESA_SEMENTE],
    );
    if ((linha?.n ?? 0) > 0) sobrou.push(`${t}: ${linha?.n}`);
  }
  assert.deepEqual(sobrou, [], 'estas tabelas ficaram com o carimbo velho');

  // O que a fábrica tinha continua lá, com o mesmo número — adoção não é perda.
  assert.equal(await countMovements(), antesDosMovimentos);
  const itens = await listItems(NOVA);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].name, 'Açúcar');
});

test('o lugar padrão muda de id sem levar os preços combinados embora', async () => {
  const { acucar, loja } = await fabricaDeVerdade();
  await saveSalePrice(empresaDaqui(), {
    itemId: acucar,
    placeId: loja,
    rate: rate(0.5, 1),
  });
  const conn = await db();
  const antes = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM location_prices`,
  );

  await adotarEmpresa(NOVA);

  // O lugar padrão é o id da empresa, por decisão registrada — então ele andou.
  assert.equal(defaultLocationId(NOVA), NOVA);
  const velho = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM locations WHERE id = ?`,
    [EMPRESA_SEMENTE],
  );
  assert.equal(velho?.n, 0, 'a linha velha do lugar tem de sair');
  const novo = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM locations WHERE id = ?`,
    [NOVA],
  );
  assert.equal(novo?.n, 1, 'e a nova tem de estar lá, uma vez');

  // `location_prices.location_id` é ON DELETE CASCADE: apagar o pai antes de
  // repontar os filhos apagaria isto em silêncio.
  const depois = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM location_prices`,
  );
  assert.equal(
    depois?.n,
    antes?.n,
    'os preços combinados não podem ser levados pelo CASCADE',
  );

  const movimentos = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM movements WHERE location_id = ?`,
    [EMPRESA_SEMENTE],
  );
  assert.equal(
    movimentos?.n,
    0,
    'nenhum movimento pode ficar apontando para o lugar que saiu',
  );
});

test('a fila aponta para o lugar novo, senão ela nunca mais anda', async () => {
  await fabricaDeVerdade();
  await adotarEmpresa(NOVA);
  const conn = await db();
  const orfas = await conn.getAllAsync<{ row_id: string }>(
    `SELECT row_id FROM outbox WHERE table_name = 'locations' AND row_id = ?`,
    [EMPRESA_SEMENTE],
  );
  assert.deepEqual(
    orfas,
    [],
    'row_id órfão levanta no serializador e trava a fila inteira',
  );
  const pendentes = await pendingEntries(50);
  assert.ok(pendentes.length > 0, 'a fila desta fábrica não pode estar vazia');
});

test('o exemplo semeado impede a adoção — e sai do caminho quando o dono limpa', async () => {
  await ensureStarterData();
  assert.equal(await porQueNaoPodeAdotar(NOVA), 'exemploAqui');
  await assert.rejects(
    () => adotarEmpresa(NOVA),
    (erro: unknown) =>
      erro instanceof AdocaoRecusadaError && erro.motivo === 'exemploAqui',
    'noventa dias de nota inventada não podem virar fato no livro da fábrica',
  );
  assert.equal(
    empresaDaqui(),
    EMPRESA_SEMENTE,
    'recusar não pode ter mexido em nada',
  );

  await eraseArea(empresaDaqui(), 'all');
  assert.equal(await porQueNaoPodeAdotar(NOVA), null);
  await adotarEmpresa(NOVA);
  assert.equal(empresaDaqui(), NOVA);
});

test('linha que já subiu tranca a adoção para sempre', async () => {
  await fabricaDeVerdade();
  const [primeira] = await pendingEntries(1);
  assert.ok(primeira, 'a fábrica de verdade deixou fila para subir');
  await markSent([primeira.id]);
  assert.equal(await porQueNaoPodeAdotar(NOVA), 'jaSubiu');
});

/**
 * **"Para sempre" tinha prazo de sete dias.**
 *
 * O guarda perguntava à própria fila — `SELECT COUNT(*) FROM outbox WHERE sent_at IS
 * NOT NULL` — e a faxina apaga o que subiu há mais de sete dias. Com a última entrada
 * enviada indo embora, o guarda passava a responder "nunca subiu nada" e a janela da
 * adoção reabria sozinha, sobre um servidor que já tinha o carimbo antigo gravado em
 * linhas que não saem mais de lá.
 *
 * A prova é o mesmo cenário do teste acima, com a faxina no meio.
 */
test('a faxina da fila não reabre a janela da adoção', async () => {
  await fabricaDeVerdade();
  const [primeira] = await pendingEntries(1);
  assert.ok(primeira);
  await markSent([primeira.id]);

  await forgetSentBefore('2099-01-01T00:00:00.000Z');
  const conn = await db();
  const sobrou = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NOT NULL`,
  );
  assert.equal(sobrou?.n, 0, 'a faxina levou toda linha enviada — é o que ela faz');

  assert.equal(
    await porQueNaoPodeAdotar(NOVA),
    'jaSubiu',
    'e o aparelho continua sabendo que já falou com o servidor',
  );
});

test('id já ocupado é recusa, não colisão de índice no meio da transação', async () => {
  await fabricaDeVerdade();
  await savePlace(empresaDaqui(), {
    id: NOVA,
    name: 'Depósito',
    kind: 'store_room',
  });
  assert.equal(await porQueNaoPodeAdotar(NOVA), 'idOcupado');
});

test('adotar a mesma empresa duas vezes não faz nada na segunda', async () => {
  await fabricaDeVerdade();
  await adotarEmpresa(NOVA);
  const conn = await db();
  const antes = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM locations`,
  );
  await adotarEmpresa(NOVA);
  const depois = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM locations`,
  );
  assert.equal(
    depois?.n,
    antes?.n,
    'a segunda adoção não pode duplicar o lugar',
  );
  const guardado = await conn.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = ?`,
    [CHAVE_DA_EMPRESA],
  );
  assert.equal(guardado?.value, NOVA);
});

test('as duas réguas que a adoção usa leem o esquema, e distinguem caso verdadeiro de falso', async () => {
  const conn = await db();
  const tabelas = await tabelasComEmpresa(conn);
  assert.ok(tabelas.includes('movements'), 'movements carimba empresa');
  assert.ok(tabelas.includes('people'), 'people carimba empresa');
  assert.ok(!tabelas.includes('outbox'), 'outbox NÃO carimba empresa');
  assert.ok(!tabelas.includes('app_meta'), 'app_meta NÃO carimba empresa');

  const lugares = await colunasDeLugar(conn);
  const chaves = lugares.map((l) => `${l.tabela}.${l.coluna}`).sort();
  assert.ok(
    chaves.includes('movements.location_id'),
    'o razão aponta para lugar',
  );
  assert.ok(
    chaves.includes('movements.counterpart_location_id'),
    'a transferência aponta duas vezes, e a segunda foi acrescentada por ALTER TABLE',
  );
  assert.ok(
    chaves.includes('location_prices.location_id'),
    'o preço por lugar aponta para lugar',
  );
  assert.ok(!chaves.includes('items.company_id'), 'empresa não é lugar');
});
