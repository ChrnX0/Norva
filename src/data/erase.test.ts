import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  blockerFor,
  emptyCounts,
  isEmpty,
  itemKindsFor,
  tablesFor,
  tallyFor,
  type EraseArea,
  type EraseCounts,
} from './erase';

/**
 * Erasing is the one operation with no undo, so its rules are worth pinning
 * down harder than the rest. Two failure modes matter: an order that trips a
 * foreign key halfway through and leaves a recipe whose ingredients are gone,
 * and a refusal that says nothing useful about how to proceed.
 */

/**
 * O esquema do aparelho, LIDO de `db.ts` — nunca copiado para cá.
 *
 * **A cicatriz, e ela é da própria guarda.** Isto era um `Record` escrito à mão
 * com doze entradas, e o teste de cobertura percorria as chaves desse mapa
 * perguntando se cada uma estava em `tablesFor('all')`. Como o mapa tinha
 * exatamente os membros do union `ErasableTable`, a asserção era *"todo membro
 * do conjunto fechado está na lista do conjunto fechado"* — a lista conferida
 * contra si mesma. Uma tabela que não estivesse no union era **invisível para o
 * teste, por construção**.
 *
 * Nove tabelas do aparelho nunca eram apagadas, e cinco delas apontam para
 * `items` ou `locations` com RESTRICT. Depois da primeira corrida de produção,
 * "Apagar tudo" levantava FOREIGN KEY constraint failed e não apagava nada. O
 * teste passava verde o tempo todo, porque o autor do mapa e o autor da lista
 * eram a mesma pessoa lembrando das mesmas doze tabelas.
 *
 * É o mesmo conserto que o `db:verify` já tinha feito quando parou de rodar como
 * superusuário: a verificação passa a perguntar ao SISTEMA em vez de perguntar à
 * lembrança de quem a escreveu.
 */
const ESQUEMA = readFileSync(new URL('./db.ts', import.meta.url), 'utf8');

/** Toda tabela que o aparelho cria. */
const NO_APARELHO: string[] = [...ESQUEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
  (m) => m[1],
);

/**
 * As arestas de chave estrangeira, também lidas do esquema.
 *
 * Só as de RESTRICT importam para a ordem: CASCADE some sozinho e não trava
 * nada. Mas as duas são lidas, porque uma aresta que muda de CASCADE para
 * RESTRICT numa migração futura precisa aparecer aqui sem ninguém lembrar de
 * atualizar coisa nenhuma.
 */
function arestas(): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const [, tabela, corpo] of ESQUEMA.matchAll(
    /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\s*\)/g,
  )) {
    const pais = [...corpo.matchAll(/REFERENCES (\w+)\(\w+\)\s+ON DELETE RESTRICT/g)]
      .map((m) => m[1])
      .filter((pai) => pai !== tabela);
    mapa.set(tabela, pais);
  }
  // As colunas acrescentadas por ALTER em migrações posteriores não estão no
  // corpo do CREATE, e são justamente as da grade do produto — que apontam para
  // `product_lines`, `product_types` e `flavors` com RESTRICT.
  for (const [, tabela, pai] of ESQUEMA.matchAll(
    /ALTER TABLE (\w+) ADD COLUMN \w+ TEXT REFERENCES (\w+)\(\w+\) ON DELETE RESTRICT/g,
  )) {
    mapa.set(tabela, [...(mapa.get(tabela) ?? []), pai]);
  }
  return mapa;
}

const DEPENDE_DE = arestas();

/**
 * O que "apagar tudo" pode legitimamente deixar para trás, com o motivo.
 *
 * Uma linha aqui é uma renúncia consciente. Sem a lista, a guarda ficaria
 * vermelha por desenho e alguém a desligaria — que é como uma guarda morre.
 */
const FICA_DE_PROPOSITO: Record<string, string> = {
  app_meta:
    'a gaveta local do aparelho: a cara escolhida, a luz da tela, a cidade do tempo, o que a capa esconde. Não é dado do negócio, e apagá-la faria o aplicativo reabrir estranho para quem só queria limpar o exemplo.',
};

test('erasing everything reaches every table the device actually creates', () => {
  assert.ok(
    NO_APARELHO.length > 15,
    `o esquema foi lido com ${NO_APARELHO.length} tabelas — a comparação abaixo seria de graça`,
  );

  const apagadas = new Set<string>(tablesFor('all'));
  const esquecidas = NO_APARELHO.filter((t) => !apagadas.has(t) && !FICA_DE_PROPOSITO[t]);

  assert.deepEqual(
    esquecidas,
    [],
    `"apagar tudo" nunca toca nestas tabelas do aparelho: ${esquecidas.join(' · ')}. ` +
      'Se alguma delas apontar para `items` ou `locations` com RESTRICT, o DELETE inteiro ' +
      'levanta FOREIGN KEY e a transação volta atrás — "apagar tudo" passa a não apagar ' +
      'NADA. Traga a tabela para `tablesFor("all")` na posição certa, ou registre a ' +
      'renúncia em FICA_DE_PROPOSITO com o motivo.',
  );
});

test('the deliberate leftovers list only holds tables that still exist', () => {
  for (const [tabela, motivo] of Object.entries(FICA_DE_PROPOSITO)) {
    assert.ok(NO_APARELHO.includes(tabela), `"${tabela}" não existe mais no esquema — tire a linha.`);
    assert.ok(motivo.length > 40, `"${tabela}": a renúncia precisa do motivo escrito, não do lugar na lista.`);
  }
});

test('every area deletes children before the rows they point at', () => {
  assert.ok(DEPENDE_DE.size > 15, 'as arestas foram lidas vazias — a ordem não estaria sendo conferida');

  const areas: EraseArea[] = ['purchases', 'recipes', 'products', 'inputs', 'all'];

  for (const area of areas) {
    const ordem = tablesFor(area);
    const foram = new Set<string>();

    for (const tabela of ordem) {
      for (const pai of DEPENDE_DE.get(tabela) ?? []) {
        assert.ok(
          !foram.has(pai),
          `${area}: ${tabela} é apagada depois de ${pai}, para onde as linhas dela apontam`,
        );
      }
      foram.add(tabela);
    }
  }
});

/**
 * "Apagar tudo" não pode deixar de pé quem aponta para `items` com RESTRICT.
 *
 * **Só o "tudo", e a razão é literal:** `blockerFor` devolve `null` para `all`
 * (erase.ts:176). Nada recusa esse caminho antes do toque, então tudo o que
 * travaria o `DELETE FROM items` TEM que estar na lista — não há segunda rede.
 *
 * As áreas menores têm a rede: `apagar insumos` é recusada por
 * `recipeLinesUsingInputs` e `purchaseLinesUsingItems`, e `apagar produtos` por
 * `purchaseLinesUsingProducts`. Ali a resposta chega ANTES de a pessoa apertar,
 * com o número junto, que é a Lei 5 — erro se impede, não se reclama. Cobrar
 * delas a mesma regra do `all` acusaria um defeito que não existe, e alarme
 * inventado ensina a ignorar alarme.
 *
 * **O que esta guarda NÃO cobre, dito em vez de omitido:** uma linha de receita
 * que aponte para um item de tipo PRODUTO — um picolé usado dentro de outro
 * produto. `recipe_lines.item_id` é RESTRICT, e `purchaseLinesUsingProducts` não
 * conta esse caso. É estreito e nunca aconteceu, e a checagem honesta dele é
 * executável (montar o banco e rodar a área), não estática. Fica escrito aqui
 * para não ser descoberto por um erro de SQLite na tela de alguém.
 */
test('erasing everything takes everything that RESTRICT-points at items', () => {
  const filhosDeItem = [...DEPENDE_DE.entries()]
    .filter(([, pais]) => pais.includes('items'))
    .map(([t]) => t);
  assert.ok(filhosDeItem.length > 3, 'nenhum filho de `items` foi lido — a regra abaixo seria vazia');
  // A premissa da regra, presa: mesmo com TODAS as contagens que barram as outras
  // áreas, o "tudo" passa. Com `emptyCounts` esta linha seria verdade de graça —
  // com zero, toda área devolve `null`.
  assert.equal(
    blockerFor('all', {
      ...emptyCounts,
      recipeLinesUsingInputs: 9,
      purchaseLinesUsingItems: 9,
      productsUsingRecipes: 9,
      purchaseLinesUsingProducts: 9,
    }),
    null,
    'o "tudo" ganhou bloqueador: se agora ele recusa antes do toque, esta regra muda de forma',
  );

  const apagadas = new Set<string>(tablesFor('all'));
  const travam = filhosDeItem.filter((t) => !apagadas.has(t));
  assert.deepEqual(
    travam,
    [],
    `"apagar tudo" some com items e deixa de pé ${travam.join(' · ')}, que apontam para lá com ` +
      'RESTRICT — o DELETE levanta FOREIGN KEY, a transação inteira volta atrás, e nada é apagado.',
  );
});

test('the two areas that own items never claim the same kinds', () => {
  const inputs = new Set(itemKindsFor('inputs') ?? []);
  const products = itemKindsFor('products') ?? [];

  assert.ok(products.length > 0);
  for (const kind of products) {
    assert.ok(!inputs.has(kind), `${kind} would be deleted by two different areas`);
  }
  assert.equal(itemKindsFor('purchases'), null);
});

test('a recipe standing on an input blocks the input, and names the count', () => {
  const counts: EraseCounts = { ...emptyCounts, inputs: 6, recipes: 2, recipeLinesUsingInputs: 8 };
  const blocker = blockerFor('inputs', counts);

  // The reason is a fact, not a sentence: the wording belongs to the screen,
  // which is what makes the same rule speak three languages.
  assert.deepEqual(blocker, { reason: 'recipesUseInputs', count: 2 });
  // The way out is real: the recipes themselves are free to go.
  assert.equal(blockerFor('recipes', counts), null);
});

test('a purchase blocks the input it bought, once no recipe is in the way', () => {
  const counts: EraseCounts = {
    ...emptyCounts,
    inputs: 6,
    movements: 0,
    purchases: 1,
    purchaseLinesUsingItems: 6,
  };

  assert.deepEqual(blockerFor('inputs', counts), { reason: 'purchasesUseInputs', count: 1 });
});

test('a product made from a recipe blocks the recipe', () => {
  const counts: EraseCounts = { ...emptyCounts, recipes: 2, products: 1, productsUsingRecipes: 1 };

  assert.deepEqual(blockerFor('recipes', counts), { reason: 'productsUseRecipes', count: 1 });
});

test('erasing everything is never blocked - that is the point of it', () => {
  const tangled: EraseCounts = {
    inputs: 6,
    movements: 0,
    recipes: 2,
    products: 1,
    purchases: 6,
    places: 3,
    recipeLinesUsingInputs: 8,
    purchaseLinesUsingItems: 6,
    productsUsingRecipes: 1,
    purchaseLinesUsingProducts: 2,
  };

  assert.equal(blockerFor('all', tangled), null);
});

test('the confirmation is told exactly what disappears, so it can count it', () => {
  const counts: EraseCounts = {
    ...emptyCounts,
    inputs: 6,
    movements: 0,
    recipes: 2,
    products: 1,
    purchases: 6,
    places: 3,
  };

  assert.deepEqual(tallyFor('all', counts), {
    inputs: 6,
    movements: 0,
    recipes: 2,
    products: 1,
    purchases: 6,
    places: 3,
  });

  // One area takes only its own with it. Places are the sharpest case: a store
  // is not an input, a recipe, a product or an invoice, so no smaller area is
  // allowed to carry it off - only "erase everything" is.
  assert.deepEqual(tallyFor('purchases', counts), {
    inputs: 0,
    movements: 0,
    recipes: 0,
    products: 0,
    purchases: 6,
    places: 0,
  });
  assert.deepEqual(tallyFor('inputs', counts), {
    inputs: 6,
    movements: 0,
    recipes: 0,
    products: 0,
    purchases: 0,
    places: 0,
  });

  assert.equal(isEmpty(tallyFor('all', emptyCounts)), true);
  assert.equal(isEmpty(tallyFor('all', counts)), false);
});
