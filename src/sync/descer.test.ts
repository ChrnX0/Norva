import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, before } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { gravarPagina } from '@/data/descida';
import { recomputeItemCost } from '@/data/repository';
import { EMPRESA_SEMENTE } from '@/data/empresa';
import { descer } from './descer';
import { pedido } from './descida';
import type { PedidoDeDescida, Transport } from './engine';

/**
 * A DESCIDA exercitada no aparelho — e ela não tinha uma linha de teste.
 *
 * `descer.ts`, `gravarPagina`, `proximoCursor` e `pedido` entraram em 12 de setembro com
 * `typecheck` limpo e a suíte verde, e nenhum arquivo de teste os importava. A garantia 33 do
 * `db:verify` prova a ARITMÉTICA do cursor em SQL — que a ordem do par não pula nem repete —, e
 * essa é outra pergunta: ela não executa uma linha deste código.
 *
 * É a segunda metade do portão P1 deste projeto, a que eu descobri por fora: *quem EXERCITA
 * isto?* Uma peça pode ter chamador e nunca ter sido percorrida, e aí ela é promessa com cara de
 * código.
 */

let sqlite: DatabaseSync;

function inMemoryDb(): Db {
  sqlite = new DatabaseSync(':memory:');
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

const CO = EMPRESA_SEMENTE;
const ITEM = '11111111-1111-4111-8111-111111111111';

let conn: Db;

before(async () => {
  conn = inMemoryDb();
  await migrate(conn);
  __setDb(conn);
  // O aparelho não tem tabela de empresas: a empresa dele é uma só, e mora no `app_meta`.
  await conn.runAsync(
    `INSERT INTO items (id, company_id, kind, name, purchase_unit, purchase_to_base, base_unit, created_at)
     VALUES (?, ?, 'input', 'Polpa', 'kg', 1000, 'g', ?)`,
    [ITEM, CO, '2026-09-01T00:00:00.000Z'],
  );
  await conn.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at) VALUES (?, ?, ?, 'unit', ?)`,
    [CO, CO, 'Fábrica', '2026-09-01T00:00:00.000Z'],
  );
});

/** Duas compras do mesmo item, como o servidor as devolveria. */
function duasCompras(taxas: readonly (number | null)[]): Record<string, unknown>[] {
  return taxas.map((taxa, i) => ({
    id: `22222222-2222-4222-8222-00000000000${i + 1}`,
    company_id: CO,
    kind: 'purchase',
    occurred_at: `2026-09-0${i + 1}T10:00:00.000Z`,
    recorded_at: `2026-09-0${i + 1}T10:00:00.000Z`,
    item_id: ITEM,
    quantity_base_units: 1000,
    location_id: CO,
    unit_cost_rate: taxa,
    received_at: `2026-09-0${i + 1}T11:00:00.000Z`,
  }));
}

async function mediaDepoisDeDescer(taxas: readonly (number | null)[]): Promise<number> {
  await conn.runAsync(`DELETE FROM movements WHERE company_id = ?`, [CO]);
  await conn.runAsync(`DELETE FROM item_costs WHERE company_id = ?`, [CO]);
  const p = pedido('movements', null);
  await gravarPagina('movements', p.colunas, duasCompras(taxas));
  await recomputeItemCost(CO, ITEM);
  const linha = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE company_id = ? AND item_id = ?`,
    [CO, ITEM],
  );
  return linha?.average_rate ?? 0;
}

test('a ledger that descends through the READ gate poisons the average, and the number says so', async () => {
  /**
   * O defeito, e ele é de dinheiro.
   *
   * `transporte.ts` fazia a descida do razão ler `movements_visible` — a view que põe
   * `has_capability(company_id, 'view_cost')` na frente do custo congelado. Para uma conta SEM
   * `view_cost` isso devolve a linha com `unit_cost_rate` nulo, e a docblock de lá chamava isso
   * de acerto: *"em vez de recebê-lo e esconder na tela"*.
   *
   * Só que a descida não é uma tela: ela ESCREVE o razão local, e `descer.ts` chama
   * `recomporCustos` no fim da rodada. `recomputeItemCost` mistura só as linhas com taxa não
   * nula — nulo não entra como zero, ele SAI DA CONTA —, então a média local passa a ser a
   * média de um razão com buracos. E toda produção que aquele aparelho registrar depois congela
   * custo a partir dela: `recordProduction` soma `consumedValue` (que vem da média) com a
   * embalagem, e conteúdo de livro-razão não se corrige, se estorna.
   *
   * Este projeto já decidiu esta pergunta DUAS VEZES, nas duas direções certas: a `0047`
   * escreveu *"o Conferente congela um preço que ele não pode ver… com o portão no caminho da
   * escrita, a contagem do operador gravaria venda sem preço"*, e `listProductsForLedger` diz
   * *"congelar custo e VER custo são perguntas diferentes; só a segunda tem portão"*. A descida
   * é caminho de ESCRITA do razão local, e estava do lado errado das duas.
   */
  const verdade = await mediaDepoisDeDescer([0.472, 0.59]);
  const pelaView = await mediaDepoisDeDescer([null, null]);

  assert.equal(
    verdade.toFixed(4),
    '0.5310',
    'a média das duas compras deixou de ser a mistura delas — o exemplo perdeu o sentido',
  );
  assert.notEqual(
    pelaView.toFixed(4),
    verdade.toFixed(4),
    'as duas médias ficaram iguais: o exemplo não separa mais o razão inteiro do mutilado',
  );
  assert.equal(
    pelaView.toFixed(4),
    '0.0000',
    `o razão que desceu pelo portão de leitura deu média ${pelaView.toFixed(4)} contra ` +
      `${verdade.toFixed(4)} do razão inteiro. Nulo não entra como zero: ele sai da conta, e ` +
      'a média local vira a média de um razão com buracos — embaixo de todo custo congelado ' +
      'que este aparelho gravar depois.',
  );
});

test('the descent writes the page, remembers where it stopped, and asks from there next round', async () => {
  await conn.runAsync(`DELETE FROM movements WHERE company_id = ?`, [CO]);
  await conn.runAsync(`DELETE FROM app_meta WHERE key LIKE 'descida%'`, []);

  const pedidos: PedidoDeDescida[] = [];
  const porRodada = [duasCompras([0.472, 0.59]), []];

  const transporte: Transport = {
    push: async () => ({ enviados: 0, rejeitadas: [] }) as never,
    pull: async (p) => {
      pedidos.push(p);
      if (p.tabela !== 'movements') return { linhas: [] };
      return { linhas: porRodada.shift() ?? [] };
    },
  };

  const relatorio = await descer(transporte, CO);

  assert.equal(relatorio.linhas, 2, 'as duas linhas do razão não entraram no aparelho');
  assert.equal(relatorio.tabelas, 1, 'só o razão trouxe linha, e o relatório não contou uma tabela');
  assert.equal(relatorio.erro, undefined, `a rodada parou: ${relatorio.erro}`);

  const guardadas = await conn.getAllAsync<{ id: string; unit_cost_rate: number | null }>(
    `SELECT id, unit_cost_rate FROM movements WHERE company_id = ? ORDER BY occurred_at`,
    [CO],
  );
  assert.equal(guardadas.length, 2, 'a página foi relatada e não gravada');
  assert.equal(
    guardadas[0].unit_cost_rate,
    0.472,
    'a taxa congelada não chegou ao razão local — e é dela que sai a média do aparelho',
  );

  // A página CURTA é o fim da tabela: pedir outra seria uma viagem para nada. O que prova o
  // cursor é a rodada SEGUINTE, que tem de começar de onde esta parou — e isso exige que ele
  // tenha sido gravado no `app_meta`, não guardado numa variável que a rodada leva embora.
  const primeiraDoRazao = pedidos.filter((p) => p.tabela === 'movements');
  assert.equal(primeiraDoRazao.length, 1, 'a página curta é o fim da tabela: não se pede outra');
  assert.equal(
    primeiraDoRazao[0].depoisDe,
    null,
    'a primeira página pediu a partir de um cursor — um aparelho novo tem de pedir tudo',
  );

  pedidos.length = 0;
  await descer(transporte, CO);
  const segunda = pedidos.filter((p) => p.tabela === 'movements');
  assert.equal(segunda.length, 1, 'a segunda rodada não pediu o razão');
  assert.deepEqual(
    segunda[0].depoisDe,
    { recebidoEm: '2026-09-02T11:00:00.000Z', id: '22222222-2222-4222-8222-000000000002' },
    'a segunda rodada não pediu DEPOIS da última linha da primeira: a descida repetiria o ' +
      'trabalho inteiro a cada sincronia, ou pularia a linha seguinte para sempre',
  );
});

test('an error on one table stops the round instead of skipping to the next', async () => {
  await conn.runAsync(`DELETE FROM app_meta WHERE key LIKE 'descida%'`, []);

  /**
   * Parar a rodada é a resposta certa, e é o que fez o defeito de 13 de setembro doer tanto:
   * `carriers` é a PRIMEIRA tabela de `DESCEM` e não tinha a coluna do cursor, então a rodada
   * morria antes de qualquer coisa. Seguir para a próxima seria pior — o movimento desce depois
   * do item que ele cita, e o SQLite recusaria a linha calado.
   */
  const vistas: string[] = [];
  const transporte: Transport = {
    push: async () => ({ enviados: 0, rejeitadas: [] }) as never,
    pull: async (p) => {
      vistas.push(p.tabela);
      if (p.tabela === 'locations') {
        return { linhas: [], erro: { codigo: '42703', mensagem: 'column locations.received_at does not exist' } };
      }
      return { linhas: [] };
    },
  };

  const relatorio = await descer(transporte, CO);

  assert.match(
    relatorio.erro ?? '',
    /received_at/,
    'a rodada não devolveu o problema do servidor: a tela diria "sincronizado" sobre nada',
  );
  assert.equal(
    vistas.includes('items'),
    false,
    'a rodada seguiu para `items` depois do erro em `locations` — descer o movimento antes do ' +
      'item que ele cita grava referência quebrada, e o SQLite recusa a linha calado',
  );
});
