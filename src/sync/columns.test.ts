import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, before } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { CROSSINGS_FOR_TESTS_ONLY } from './serialize';

/**
 * Toda coluna do aparelho ou atravessa, ou está escrita como sendo só daqui.
 *
 * A cicatriz é de hoje e é minha: `items.full_level` — a régua das faixas de cor
 * que o dono digita — ficou fora do serializador. A coluna existia no aparelho, a
 * tela escrevia nela, o teste do repositório provava que ela persistia, e ela
 * simplesmente nunca chegaria ao servidor. Um celular novo da mesma fábrica
 * abriria sem faixa nenhuma, e ninguém saberia por quê.
 *
 * O guard da sessão do aparelho cobra TABELA sem escritor. Este cobra COLUNA sem
 * travessia, que é um andar abaixo e foi o andar onde o defeito estava.
 *
 * Registro em vez de heurística, pelo mesmo motivo do `law.test.ts`: existem
 * colunas que legitimamente não sobem, e a diferença entre "não sobe porque é do
 * aparelho" e "não sobe porque alguém esqueceu" não está no nome dela — está numa
 * decisão, que aqui fica escrita.
 */

/** O que fica no aparelho, e por quê. Cada linha é uma decisão, não um esquecimento. */
const SO_DO_APARELHO: Record<string, Record<string, string>> = {
  items: {
    // Derivado, e o servidor tem o dele: o aparelho calcula média local porque
    // precisa mostrar custo sem sinal, e mandar a cópia daria dois autores ao
    // mesmo número.
    // (nenhuma hoje — a lista existe para o dia em que houver)
  },
  movements: {
    // O servidor estampa o autor a partir da sessão autenticada, e é ele quem
    // manda: `recorded_by` vindo do aparelho seria assinatura cedível.
    recorded_by: 'o servidor estampa a partir da sessão; vindo do aparelho seria cedível',
  },
  readings: {
    recorded_by: 'o servidor estampa a partir da sessão; vindo do aparelho seria cedível',
  },
  purchases: {
    created_by: 'o servidor estampa a partir da sessão',
  },
  purchase_lines: {
    // O servidor NÃO tem esta coluna: a linha de compra herda a hora da nota, e a
    // pergunta que interessa ali é "pedido contra recebido", que mora em
    // `purchases.ordered_at` e `received_at`. Mandar seria a fila ser recusada.
    created_at: 'o servidor não tem a coluna; a hora que interessa é a da nota',
  },
  orders: {
    recorded_by: 'o servidor estampa a partir da sessão',
  },
  products: {
    // DORMENTE, e por isso não atravessa: quem manda agora é
    // `unit_packaging_rate`, que é o mesmo número sem o arredondamento que
    // transformava rótulo abaixo de meio centavo em zero (migração V18 /
    // servidor 0033). A coluna antiga fica porque migração é append-only nos
    // dois lados — apagá-la faria o banco divergir de qualquer aparelho que já
    // rodou a V13 —, e mandá-la seria dar dois autores ao mesmo número.
    unit_packaging_cents: 'dormente desde a V18; quem atravessa é unit_packaging_rate',
  },
};

let conn: Db;

function inMemoryDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
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

before(async () => {
  conn = inMemoryDb();
  await migrate(conn);
  __setDb(conn);
});

test('every device column either crosses to the server or says why it stays', async () => {
  const faltando: string[] = [];

  for (const [table, crossing] of Object.entries(CROSSINGS_FOR_TESTS_ONLY())) {
    // `erase` e os derivados não são tabelas do aparelho: são comandos e
    // decisões de não enviar, já explicadas no serializador.
    const colunas = await conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (colunas.length === 0) continue;

    const enviadas = new Set<string>(crossing.take ?? []);
    // O `build` acrescenta colunas convertidas ou estampadas, e o jeito honesto de
    // saber QUAIS é chamá-lo: uma lista escrita à mão ao lado dele seria a mesma
    // lista à mão que já deixou uma pasta fora da checagem de camadas.
    for (const nome of Object.keys(crossing.build?.({}, { userId: 'x' }) ?? {})) {
      enviadas.add(nome);
    }

    const declaradas = SO_DO_APARELHO[table] ?? {};

    for (const { name } of colunas) {
      if (enviadas.has(name)) continue;
      if (declaradas[name]) continue;
      faltando.push(`${table}.${name}`);
    }
  }

  assert.deepEqual(
    faltando,
    [],
    `estas colunas não atravessam e não estão declaradas como só do aparelho: ${faltando.join(', ')}. ` +
      'Ou acrescente a coluna ao `take`/`build` do serializador, ou escreva em SO_DO_APARELHO por que ' +
      'ela fica aqui. O defeito que este caso existe para pegar é silencioso: a tela escreve, o teste ' +
      'do repositório passa, e o dado nunca chega ao servidor.',
  );
});
