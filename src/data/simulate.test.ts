import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from './db';
import { dayWindow } from '@/domain/day';
import { listItems, productionOn, shipmentsOn } from './repository';
import { ensureStarterData, LOCAL_COMPANY_ID } from './seed';
import { simulateFortnight } from './simulate';

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
  await ensureStarterData(LOCAL_COMPANY_ID);

  const feito = await simulateFortnight(LOCAL_COMPANY_ID, { timeZone: SP });

  assert.ok(feito.runs >= 8, `poucas corridas para catorze dias: ${feito.runs}`);
  assert.ok(feito.deliveries >= 5, `poucas entregas: ${feito.deliveries}`);
  assert.ok(feito.invoices >= 1, 'nenhuma nota de compra entrou');

  // E o passado é passado: hoje e a semana passada têm produção, que é o par
  // exato de que a home precisa para dizer algo em vez de "primeira produção".
  const hoje = dayWindow(new Date().toISOString(), SP);
  const semanaPassada = dayWindow(new Date().toISOString(), SP, -7);

  const deHoje = await productionOn(LOCAL_COMPANY_ID, hoje.from, hoje.to);
  const deEntao = await productionOn(LOCAL_COMPANY_ID, semanaPassada.from, semanaPassada.to);

  assert.ok(deEntao.length > 0, 'a semana passada ficou vazia - não há com o que comparar');
  assert.ok(deHoje.length + deEntao.length > 0);
});

test('the same seed writes the same fortnight, twice', async () => {
  const rodar = async () => {
    await bancoLimpo();
    await ensureStarterData(LOCAL_COMPANY_ID);
    return simulateFortnight(LOCAL_COMPANY_ID, { seed: 7, timeZone: SP });
  };

  // Determinismo não é preciosismo: um teste que falha tem de falhar de novo
  // igual, e o dono olhando a tela e a suíte olhando a asserção têm de estar
  // vendo a mesma fábrica.
  assert.deepEqual(await rodar(), await rodar());
});

test('the simulation writes through the front door, so the balance survives it', async () => {
  await bancoLimpo();
  await ensureStarterData(LOCAL_COMPANY_ID);
  await simulateFortnight(LOCAL_COMPANY_ID, { timeZone: SP });

  // Nada de saldo negativo: a simulação chama `recordProduction`, que hoje
  // recusa consumir o que não tem. Se ela escrevesse SQL próprio, isto passaria
  // e a fábrica simulada seria impossível.
  const itens = await listItems(LOCAL_COMPANY_ID);
  for (const item of itens) {
    assert.ok(
      item.onHandBaseUnits >= 0,
      `${item.name} ficou com saldo negativo: ${item.onHandBaseUnits}`,
    );
  }

  // E o que saiu chegou em algum lugar.
  const hoje = dayWindow(new Date().toISOString(), SP);
  const ontem = dayWindow(new Date().toISOString(), SP, -1);
  const remessas = [
    ...(await shipmentsOn(LOCAL_COMPANY_ID, ontem.from, ontem.to)),
    ...(await shipmentsOn(LOCAL_COMPANY_ID, hoje.from, hoje.to)),
  ];
  assert.ok(remessas.length > 0, 'nenhuma remessa nos dois últimos dias');
});
