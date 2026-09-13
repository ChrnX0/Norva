import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  blockerFor,
  emptyCounts,
  ERASE_AREAS,
  isEmpty,
  itemKindsFor,
  tablesFor,
  tallyFor,
  TALLY_KEYS,
  type EraseArea,
  type EraseCounts,
  type EraseTally,
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
    carriers: 0,
    devices: 0,
    readings: 0,
    grid: 0,
    salePrices: 0,
    agreedPrices: 0,
    movements: 0,
    movementsOfProducts: 0,
    people: 0,
    lots: 0,
    orders: 0,
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
  // O movimento entra com número DIFERENTE de zero, e isso é cicatriz.
  //
  // Ele entrou nesta fixação como `movements: 0` quando o campo nasceu, e zero
  // faz a asserção passar com ou sem o campo sendo carregado — a mutação que
  // tirava `movements` de `tallyFor('purchases')` atravessou a suíte por causa
  // desta linha. É a mesma família que a proofgate já guarda: afirmar sobre um
  // sujeito vazio é verdade de graça, e é VERDE.
  const counts: EraseCounts = {
    ...emptyCounts,
    inputs: 6,
    movements: 412,
    recipes: 2,
    products: 1,
    purchases: 6,
    places: 3,
    // As três que a confirmação não contava até 7 de setembro. Entram com número
    // DIFERENTE de zero pela mesma razão da cicatriz de cima: zero faz a
    // asserção passar com ou sem o campo ser carregado.
    people: 6,
    lots: 9,
    orders: 4,
    // E a transportadora, com número diferente de zero pelo mesmo motivo das
    // outras: zero satisfaz a asserção com ou sem o campo ser carregado.
    carriers: 2,
    // O aparelho matriculado, com três pela mesma razão: zero aqui deixaria passar
    // uma contagem que não carrega o campo, que é a cicatriz escrita no topo.
    devices: 3,
    // As quatro que somiam sem número, idem.
    readings: 48,
    grid: 7,
    salePrices: 5,
    agreedPrices: 3,
  };

  assert.deepEqual(tallyFor('all', counts), {
    inputs: 6,
    movements: 412,
    recipes: 2,
    products: 1,
    purchases: 6,
    places: 3,
    people: 6,
    lots: 9,
    orders: 4,
    carriers: 2,
    devices: 3,
    readings: 48,
    grid: 7,
    salePrices: 5,
    agreedPrices: 3,
  });

  // One area takes only its own with it. Places are the sharpest case: a store
  // is not an input, a recipe, a product or an invoice, so no smaller area is
  // allowed to carry it off - only "erase everything" is.
  //
  // O movimento é a exceção, e é a razão de ele estar contado: as três áreas que
  // apagam `movements` levam o livro-razão inteiro da empresa junto, não só os
  // movimentos daquela área. A confirmação tem que dizer o número.
  assert.deepEqual(tallyFor('purchases', counts), {
    inputs: 0,
    movements: 412,
    recipes: 0,
    products: 0,
    purchases: 6,
    places: 0,
    people: 0,
    lots: 0,
    orders: 0,
    // Nenhuma área menor leva transportadora: ela é da empresa, como o lugar. Nem
    // o aparelho matriculado, pela mesma razão — ele é do celular, e só o Reset
    // completo o desfaz.
    carriers: 0,
    devices: 0,
    // Nem a série da câmara, nem a grade, nem os dois preços: só "apagar tudo".
    readings: 0,
    grid: 0,
    salePrices: 0,
    agreedPrices: 0,
  });
  assert.deepEqual(tallyFor('inputs', counts), {
    inputs: 6,
    movements: 412,
    recipes: 0,
    products: 0,
    purchases: 0,
    places: 0,
    people: 0,
    lots: 0,
    orders: 0,
    // Nenhuma área menor leva transportadora: ela é da empresa, como o lugar. Nem
    // o aparelho matriculado, pela mesma razão — ele é do celular, e só o Reset
    // completo o desfaz.
    carriers: 0,
    devices: 0,
    // Nem a série da câmara, nem a grade, nem os dois preços: só "apagar tudo".
    readings: 0,
    grid: 0,
    salePrices: 0,
    agreedPrices: 0,
  });

  // Só "apagar tudo" leva GENTE. Nenhuma área menor pode dizer que leva — e
  // nenhuma pode CALAR que leva, que era o defeito: a grade de nomes com PIN
  // sumia contada como zero.
  assert.equal(tallyFor('all', counts).people, 6);
  for (const area of ['purchases', 'recipes', 'products', 'inputs'] as const) {
    assert.equal(tallyFor(area, counts).people, 0, `${area} não apaga gente`);
  }

  // Os lotes vão em "apagar tudo" E em "apagar produtos" — `tablesFor` lista os
  // dois —, e não iam contados em nenhum.
  assert.equal(tallyFor('products', counts).lots, 9, 'apagar produtos leva os lotes junto');
  assert.equal(tallyFor('recipes', counts).lots, 0, 'apagar receitas não leva lote');

  // A receita não toca o livro-razão, e não pode dizer que toca: anunciar 412
  // movimentos ali seria assustar quem não precisa.
  assert.equal(tallyFor('recipes', counts).movements, 0);

  // **O produto toca, e esta linha afirmava o contrário por escrito.**
  //
  // Ela dizia *"apagar receita ou produto não apaga movimento nenhum"* e travava
  // o zero com uma asserção. Era falso: a área apaga `items` de tipo produto, e
  // `movements.item_id` referencia `items` com `ON DELETE CASCADE` — produção,
  // despacho, perda e contagem daquele produto iam junto, com a confirmação
  // dizendo "isso apaga 1 produto".
  //
  // Crença errada com asserção em volta é pior que crença errada solta: ela
  // convence quem passa a não olhar. A medida contra o BANCO está em
  // `repository.test.ts` ("erasing products takes ledger with it").
  //
  // E o número é o dos movimentos DE PRODUTO, não o total: dizer 412 aqui seria
  // a mentira oposta — anunciar que a compra de açúcar vai embora, quando ela
  // fica.
  assert.equal(tallyFor('products', { ...counts, movementsOfProducts: 37 }).movements, 37);
  assert.equal(tallyFor('products', counts).movements, 0, 'sem movimento de produto, não assusta ninguém');

  assert.equal(isEmpty(tallyFor('all', emptyCounts)), true);
  assert.equal(isEmpty(tallyFor('all', counts)), false);
});

/**
 * A lista do que se APAGA e a lista do que se CONTA, comparadas por máquina.
 *
 * **Três vezes esta tela contou menos do que destruiu**, e sempre pelo mesmo
 * motivo estrutural: `tablesFor` diz o que sai e `tallyFor` diz o que a pessoa
 * vai ler, e as duas são escritas em lugares diferentes por mãos diferentes.
 * Ninguém as compara.
 *
 *   1. "apagar compras" começava em `movements` e levava o razão INTEIRO da
 *      fábrica; a confirmação falava de custo médio.
 *   2. "apagar produtos" levava o razão por CASCADE de `items`, e a confirmação
 *      dizia "isso apaga 1 produto".
 *   3. "apagar tudo" levava `people` — a grade de nomes com PIN pela qual o chão
 *      de fábrica entra — contada como zero.
 *
 * A regra da casa é uma frase só: *a confirmação diz o que vai acontecer, com os
 * números por extenso.* Conselho não a fez valer três vezes; esta guarda faz.
 *
 * Toda tabela que uma área apaga precisa de UMA das duas coisas: um campo da
 * contagem que a represente, ou uma razão escrita para não ser contada. Tabela
 * nova sem nenhuma das duas reprova aqui — e é isso que impede a quarta vez.
 */
const NAO_CONTADA: Record<string, string> = {
  check_candidates:
    'a conferência duplicada esperando decisão. O FATO que a pessoa reconhece é a conferência, ' +
    'e ela é contada como movimento — a candidata é a MESMA conferência esperando alguém ' +
    'escolher qual das duas vale, não um segundo fato. Contá-la faria a confirmação do Reset ' +
    'dizer um número maior do que o que a fábrica registrou, que é a pior forma de errar numa ' +
    'tela que existe para a pessoa entender o que vai perder',
  production_runs:
    'escrituração da corrida; o FATO que a pessoa reconhece é o movimento, e ele é contado',
  order_lines: 'as linhas de um pedido; quem a pessoa conta é o pedido',
  purchase_lines: 'as linhas de uma nota; quem a pessoa conta é a compra',
  recipe_lines: 'os ingredientes de uma ficha; quem a pessoa conta é a receita',
  recipe_versions: 'as versões de uma ficha; idem',
  item_cost_history: 'derivado — o custo médio é recomposto do razão, não digitado',
  item_costs: 'derivado, pelo mesmo motivo',
  items: 'contados como `inputs` e `products`, que é como a pessoa os chama',
  locations: 'contados como `places`',
  profiles: 'os perfis vão junto com a gente, e é a gente que a pessoa reconhece',
  outbox: 'a fila de sincronia; é máquina, não coisa da fábrica',
  // As quatro abaixo são coisas que a pessoa RECONHECE e que hoje somem sem
  // número. Ficam registradas com a dívida escrita em vez de com uma desculpa —
  // a razão aqui não é "não precisa contar", é "ainda não conta".
  product_types: 'contados junto com `product_lines`, `product_categories` e `flavors` como a GRADE, que é um número só: a pessoa monta a grade, não cadastra "um tipo"',
  product_lines: 'idem — a grade é uma coisa com QUATRO tabelas desde a `0057`',
  product_categories: 'idem — o nível que entrou entre o produto e o tipo',
  flavors: 'idem',
};

/** Que campo da contagem representa cada tabela apagada. */
const CONTADA: Record<string, keyof EraseTally> = {
  movements: 'movements',
  purchases: 'purchases',
  products: 'products',
  recipes: 'recipes',
  lots: 'lots',
  orders: 'orders',
  people: 'people',
  carriers: 'carriers',
  devices: 'devices',
  readings: 'readings',
  sale_price_history: 'salePrices',
  location_prices: 'agreedPrices',
};

test('toda tabela que uma área apaga é contada, ou tem razão escrita para não ser', () => {
  const semResposta: string[] = [];
  for (const area of ERASE_AREAS) {
    for (const tabela of tablesFor(area)) {
      if (CONTADA[tabela] || NAO_CONTADA[tabela]) continue;
      semResposta.push(`${area}: ${tabela}`);
    }
  }

  assert.deepEqual(
    semResposta,
    [],
    `estas tabelas somem sem a confirmação dizer nada e sem razão escrita:\n  ${semResposta.join('\n  ')}\n` +
      'Conte a tabela em `EraseTally`, ou escreva em NAO_CONTADA por que a pessoa não precisa do número. ' +
      'Três vezes esta tela contou menos do que destruiu.',
  );

  // E o outro sentido: razão escrita para tabela que nenhuma área apaga é
  // registro que virou mentira, do mesmo jeito que a lista de órfãs.
  const todasApagadas = new Set(ERASE_AREAS.flatMap((a) => [...tablesFor(a)]));
  const registroVelho = [...Object.keys(NAO_CONTADA), ...Object.keys(CONTADA)].filter(
    (t) => !todasApagadas.has(t as never),
  );
  assert.deepEqual(registroVelho, [], `estas entradas falam de tabela que nenhuma área apaga: ${registroVelho.join(' · ')}`);
});

test('a régua da contagem é régua: pega a tabela nova e deixa a registrada passar', () => {
  // O caso verdadeiro e o falso, sem depender do estado real das duas listas.
  assert.ok(!CONTADA['tabela_nova'] && !NAO_CONTADA['tabela_nova'], 'tabela desconhecida não tem resposta');
  assert.ok(CONTADA['people'] === 'people', 'gente é contada, e a guarda enxerga isso');
  assert.ok(NAO_CONTADA['outbox']?.length > 20, 'a fila tem razão escrita, e a razão é uma frase');
});

/**
 * A guarda que parava UMA LINHA antes da tela.
 *
 * A de cima prova que toda tabela apagada tem um CAMPO no `EraseTally`. Ela estava
 * verde enquanto a segunda confirmação de "apagar tudo" dizia **"Já está tudo
 * vazio"** com seis pessoas na grade e quarenta lotes dentro: `isEmpty` somava seis
 * das catorze chaves e a frase imprimia dez. Ter campo não é ser DITO.
 *
 * O docblock da guarda irmã promete que *"três vezes esta tela contou menos do que
 * destruiu"* não se repete. Esta fecha a terceira volta: todo campo do tally é
 * percorrido pela lista que a tela imprime, e `isEmpty` olha a lista inteira.
 */
test('todo campo contado aparece na lista que a tela percorre', () => {
  const contados = new Set(Object.values(CONTADA));
  const impressos = new Set<string>(TALLY_KEYS);

  const mudos = [...contados].filter((k) => !impressos.has(k));
  assert.deepEqual(
    mudos,
    [],
    `estes campos são contados e a frase nunca os diz:\n  ${mudos.join('\n  ')}`,
  );
});

test('vazio quer dizer vazio — todas as catorze chaves, não seis', () => {
  const zerado = Object.fromEntries(TALLY_KEYS.map((k) => [k, 0])) as EraseTally;
  assert.equal(isEmpty(zerado), true, 'nada em lugar nenhum é vazio');

  // Uma chave de cada vez: qualquer uma sozinha já torna a área NÃO vazia. Sem
  // isto a guarda mediria "isEmpty existe" em vez de "isEmpty olha tudo" — e era
  // exatamente por olhar seis que ela dizia vazio com a grade de nomes cheia.
  for (const chave of TALLY_KEYS) {
    assert.equal(
      isEmpty({ ...zerado, [chave]: 1 }),
      false,
      `${chave} sozinha tem de impedir a frase "já está tudo vazio"`,
    );
  }
});
