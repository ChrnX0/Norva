import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { __setDb, db, migrate, type Db, type SqlParam } from './db';
import { dayWindow } from '@/domain/day';
import { listItems, productionOn, shipmentsOn } from './repository';
import { ensureStarterData } from './seed';
import { EMPRESA_SEMENTE } from './empresa';
import { HORIZONTE_DE_TESTE, simulateFortnight } from './simulate';

/**
 * A quinzena simulada, conferida como fato e não como enfeite.
 *
 * Ela existe porque metade do briefing só tem o que dizer quando há passado:
 * "saíram 480 hoje, 200 a mais que na segunda passada" não se testa contra um
 * banco cuja história inteira é esta manhã. O ramo da comparação estava sem
 * nenhum teste por essa razão exata - o mesmo defeito que este projeto já
 * documentou uma vez, agora no código novo.
 */

const SP = 'America/Sao_Paulo';

/**
 * Um instante fixo, e não o relógio da máquina.
 *
 * A proofgate pegou isto e tinha razão: teste que lê a hora de verdade roda
 * diferente às 23h59 e à 00h01, e a promessa de determinismo desta simulação
 * não valia enquanto "hoje" fosse o dia em que a suíte por acaso rodou.
 */
const AGORA = '2026-09-01T15:00:00.000Z';

async function bancoLimpo(): Promise<Db> {
  const conn = memoria();
  await migrate(conn);
  __setDb(conn);
  return conn;
}

function memoria(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));
  return {
    getAllAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      (sqlite.prepare(sql).get(...bind(params)) as T) ?? null,
    runAsync: async (sql: string, params: SqlParam[] = []) => sqlite.prepare(sql).run(...bind(params)),
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

test('a fortnight of operation lands in the ledger, spread over its days', async () => {
  await bancoLimpo();
  await ensureStarterData(EMPRESA_SEMENTE);

  const feito = await simulateFortnight(EMPRESA_SEMENTE, { timeZone: SP, at: AGORA });

  assert.ok(feito.runs >= 8, `poucas corridas para catorze dias: ${feito.runs}`);
  assert.ok(feito.deliveries >= 5, `poucas entregas: ${feito.deliveries}`);
  assert.ok(feito.invoices >= 1, 'nenhuma nota de compra entrou');
  /**
   * E ALGUMA COISA voltou.
   *
   * Sem esta linha a semeadura escrevia catorze dias de fábrica sem uma única
   * devolução, e o Espelho da Loja — a tela que existe para responder quanto volta
   * de cada loja — nascia com nada a dizer em toda instalação semeada. Semeadura
   * que não exercita uma tela responde "está tudo bem" sobre o que ela não simulou.
   */
  assert.ok(feito.returns >= 1, `nenhuma devolução em catorze dias: ${feito.returns}`);

  // E o passado é passado: hoje e a semana passada têm produção, que é o par
  // exato de que a home precisa para dizer algo em vez de "primeira produção".
  const hoje = dayWindow(AGORA, SP);
  const semanaPassada = dayWindow(AGORA, SP, -7);

  const deHoje = await productionOn(EMPRESA_SEMENTE, hoje.from, hoje.to);
  const deEntao = await productionOn(EMPRESA_SEMENTE, semanaPassada.from, semanaPassada.to);

  assert.ok(deEntao.length > 0, 'a semana passada ficou vazia - não há com o que comparar');
  assert.ok(deHoje.length + deEntao.length > 0);
});

test('the same seed writes the same fortnight, twice', async () => {
  const rodar = async () => {
    await bancoLimpo();
    await ensureStarterData(EMPRESA_SEMENTE);
    return simulateFortnight(EMPRESA_SEMENTE, { seed: 7, timeZone: SP, at: AGORA });
  };

  // Determinismo não é preciosismo: um teste que falha tem de falhar de novo
  // igual, e o dono olhando a tela e a suíte olhando a asserção têm de estar
  // vendo a mesma fábrica.
  assert.deepEqual(await rodar(), await rodar());
});

test('the simulation writes through the front door, so the balance survives it', async () => {
  await bancoLimpo();
  await ensureStarterData(EMPRESA_SEMENTE);
  await simulateFortnight(EMPRESA_SEMENTE, { timeZone: SP, at: AGORA });

  // Nada de saldo negativo: a simulação chama `recordProduction`, que hoje
  // recusa consumir o que não tem. Se ela escrevesse SQL próprio, isto passaria
  // e a fábrica simulada seria impossível.
  const itens = await listItems(EMPRESA_SEMENTE);
  for (const item of itens) {
    assert.ok(
      item.onHandBaseUnits >= 0,
      `${item.name} ficou com saldo negativo: ${item.onHandBaseUnits}`,
    );
  }

  // E o que saiu chegou em algum lugar.
  const hoje = dayWindow(AGORA, SP);
  const ontem = dayWindow(AGORA, SP, -1);
  const remessas = [
    ...(await shipmentsOn(EMPRESA_SEMENTE, ontem.from, ontem.to)),
    ...(await shipmentsOn(EMPRESA_SEMENTE, hoje.from, hoje.to)),
  ];
  assert.ok(remessas.length > 0, 'nenhuma remessa nos dois últimos dias');
});

/**
 * Os noventa dias — e a fábrica que eles plantavam era impossível.
 *
 * `HORIZONTE_DE_TESTE` é o que o botão "plantar três meses" dos Ajustes roda, e é
 * a fábrica que o dono olha para decidir se o aplicativo serve. Ela tinha dois
 * defeitos que se somavam:
 *
 * - Dois dos três produtos nasciam com `unitPackagingRate` e `packagingItems`
 *   VAZIA — a combinação que o docblock do `seed.ts` declara defeito e diz ter
 *   consertado no exemplo. Eles fabricavam sem gastar palito nem embalagem.
 * - O reabastecimento filtrava só `kind === 'input'`, e palito e saquinho são
 *   `packaging`: nunca eram comprados. Com o produto do exemplo consumindo os dois
 *   e ninguém repondo, a fábrica parava no dia 33 — com a câmara cheia de polpa.
 *
 * As duas asserções são sobre o MUNDO que a simulação deixa: todo produto que roda
 * consome embalagem, e a fábrica continua produzindo no fim do trimestre.
 */
test('os três meses plantados gastam embalagem e continuam produzindo no fim', async () => {
  await bancoLimpo();
  await ensureStarterData(EMPRESA_SEMENTE);
  await simulateFortnight(EMPRESA_SEMENTE, {
    days: HORIZONTE_DE_TESTE,
    timeZone: SP,
    at: AGORA,
  });

  // 1. A embalagem foi CONSUMIDA, não só comprada. Sem os `packagingItems` o palito
  //    só sobe — e "só sobe" é indistinguível de "foi comprado" sem olhar a espécie.
  const embalagens = (await listItems(EMPRESA_SEMENTE)).filter((i) => i.kind === 'packaging');
  assert.ok(embalagens.length > 0, 'o exemplo semeia palito e saquinho');
  for (const item of embalagens) {
    const gasto = await consumoDe(item.id);
    assert.ok(gasto > 0, `${item.name} nunca foi gasto em noventa dias de fábrica`);
  }

  // 2. E a fábrica não morreu no meio: houve produção na última semana da janela.
  const fim = dayWindow(AGORA, SP);
  const seteDiasAntes = dayWindow(AGORA, SP, -7);
  const ultimas = await productionOn(EMPRESA_SEMENTE, seteDiasAntes.from, fim.to);
  assert.ok(
    ultimas.length > 0,
    'a fábrica plantada parou antes do fim do trimestre — era o palito acabando',
  );
});

/** Quanto deste item SAIU como consumo, no razão inteiro. */
async function consumoDe(itemId: string): Promise<number> {
  const conn = await db();
  const linha = await conn.getFirstAsync<{ n: number }>(
    `SELECT COALESCE(-SUM(quantity_base_units), 0) AS n
       FROM movements
      WHERE item_id = ? AND kind = 'consumption'`,
    [itemId],
  );
  return linha?.n ?? 0;
}
