import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { before, test } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { ensureStarterData, LOCAL_COMPANY_ID as CO } from '@/data/seed';

/**
 * Insumo que se compra e que nada consome é um número que só sobe.
 *
 * **A cicatriz, e ela ficou meio consertada por semanas.** O `docs/insights.md`
 * registrou em agosto que o palito não saía do estoque, com a cura prescrita:
 * ligar produto a itens de embalagem com quantidade por unidade. A cura foi
 * construída — `products.packaging_items` existe e `recordProduction` a consome —
 * e **o exemplo nunca foi migrado para ela**. O código sabia fazer, o teste do
 * código estava verde, e o comportamento que qualquer pessoa via ao abrir o
 * aplicativo continuava sendo o antigo: palito comprado, palito nunca gasto.
 *
 * Nenhuma guarda daqui pegava, porque nenhuma comparava **o que o código sabe
 * fazer** com **o que o exemplo faz**. Esta compara, no ponto em que a diferença
 * é verificável sem rodar nada: um item comprado tem de ser alcançável por
 * alguma coisa que o gaste.
 *
 * **Por que a checagem é estrutural e não de saldo.** Olhar o saldo exigiria
 * simular um dia de trabalho, e aí a guarda passaria a depender de qual dia se
 * simula. A pergunta estrutural é mais forte e mais barata: existe caminho? Um
 * insumo que nenhuma receita pede e que nenhuma lista de embalagem cita **não
 * tem como sair**, hoje nem nunca — não é um saldo que ainda não desceu, é um
 * saldo que não desce.
 *
 * **E a lista de exceções é o que impede a guarda de virar mentira.** Existem
 * itens legitimamente sem consumidor: um produto acabado sai por venda e carga,
 * não por receita. Por isso a régua olha só o que a fábrica COMPRA para
 * transformar — `input` e `packaging` —, que é onde o acúmulo silencioso mora.
 */
let sq: DatabaseSync;

before(async () => {
  sq = new DatabaseSync(':memory:');
  const bind = (p: SqlParam[]) => p.map((x) => (x === undefined ? null : x));
  const conn: Db = {
    getAllAsync: async <T,>(s: string, p: SqlParam[] = []) => sq.prepare(s).all(...bind(p)) as T[],
    getFirstAsync: async <T,>(s: string, p: SqlParam[] = []) =>
      (sq.prepare(s).get(...bind(p)) as T) ?? null,
    runAsync: async (s: string, p: SqlParam[] = []) => sq.prepare(s).run(...bind(p)),
    execAsync: async (s: string) => {
      sq.exec(s);
    },
    withTransactionAsync: async (t: () => Promise<void>) => {
      sq.exec('BEGIN');
      try {
        await t();
        sq.exec('COMMIT');
      } catch (e) {
        sq.exec('ROLLBACK');
        throw e;
      }
    },
  };
  __setDb(conn);
  await migrate(conn);
  await ensureStarterData(CO);
});

/** Quem consome o quê, lido do exemplo: linhas de receita e listas de embalagem. */
function consumidores(): Set<string> {
  const alcancaveis = new Set<string>();
  for (const r of sq.prepare(`SELECT item_id FROM recipe_lines`).all() as { item_id: string }[]) {
    alcancaveis.add(r.item_id);
  }
  for (const p of sq.prepare(`SELECT packaging_items FROM products`).all() as {
    packaging_items: string | null;
  }[]) {
    if (!p.packaging_items) continue;
    try {
      for (const linha of JSON.parse(p.packaging_items) as { itemId?: string }[]) {
        if (linha?.itemId) alcancaveis.add(linha.itemId);
      }
    } catch {
      /* lista ilegível é outro assunto, e o parser do repositório já a ignora */
    }
  }
  return alcancaveis;
}

test('every input the example buys has something that consumes it', () => {
  const alcancaveis = consumidores();
  const comprados = sq
    .prepare(
      `SELECT DISTINCT i.id, i.name, i.kind
         FROM items i
         JOIN movements m ON m.item_id = i.id AND m.kind = 'purchase'
        WHERE i.company_id = ? AND i.kind IN ('input', 'packaging')
        ORDER BY i.name`,
    )
    .all(CO) as { id: string; name: string; kind: string }[];

  assert.ok(
    comprados.length >= 4,
    `o exemplo compra ${comprados.length} insumos — com menos que isso a régua não mede nada`,
  );

  const semSaida = comprados.filter((i) => !alcancaveis.has(i.id)).map((i) => `${i.name} (${i.kind})`);
  assert.deepEqual(
    semSaida,
    [],
    `${semSaida.join(' · ')}: o exemplo COMPRA estes e nada os consome — nenhuma linha de ` +
      'receita, nenhuma lista de embalagem. O saldo deles só sobe, que é o cheiro que o ' +
      'CLAUDE.md manda procurar, e uma fábrica de verdade descobriria no inventário. ' +
      'Foi assim que o palito passou semanas sendo comprado e nunca gasto, com a máquina ' +
      'de consumir já construída e o exemplo não migrado para ela.',
  );
});

/**
 * A régua reprova quando deve — senão ela é decoração verde.
 *
 * Este projeto exige teste positivo e negativo de todo guard, e a exigência nasceu
 * de guardas que passavam por não medir nada. Aqui a prova é direta: some com a
 * lista de embalagem, e o palito tem de reaparecer como órfão.
 */
test('the ruler fails when it should: drop the packaging list and the stick is orphaned', () => {
  const antes = sq.prepare(`SELECT id, packaging_items FROM products`).all() as {
    id: string;
    packaging_items: string | null;
  }[];
  try {
    sq.prepare(`UPDATE products SET packaging_items = '[]'`).run();

    const alcancaveis = consumidores();
    const orfaos = (
      sq
        .prepare(
          `SELECT DISTINCT i.id, i.name FROM items i
             JOIN movements m ON m.item_id = i.id AND m.kind = 'purchase'
            WHERE i.company_id = ? AND i.kind = 'packaging'`,
        )
        .all(CO) as { id: string; name: string }[]
    ).filter((i) => !alcancaveis.has(i.id));

    assert.ok(
      orfaos.length >= 2,
      'sem a lista de embalagem, palito e saquinho ficam sem consumidor — se esta ' +
        'régua não os vê aqui, ela não veria o defeito original tampouco',
    );
  } finally {
    for (const p of antes) {
      sq.prepare(`UPDATE products SET packaging_items = ? WHERE id = ?`).run(p.packaging_items, p.id);
    }
  }
});
