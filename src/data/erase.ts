/**
 * Erasing data, as rules rather than as SQL.
 *
 * Two things make this worth its own file instead of a DELETE inside a screen.
 *
 * The first is order. The schema uses `ON DELETE RESTRICT` in the places where
 * losing a row would silently corrupt a cost - a recipe line pointing at an
 * input, a purchase line pointing at what was bought. That protection means
 * deletes only succeed in one order, and getting it wrong throws a foreign key
 * error at somebody who just wanted to clear a demo.
 *
 * The second is that "you can't" is an answer the person deserves to receive
 * *before* they press anything, with the reason attached. Law 5: the error is
 * prevented by the design, not complained about afterwards.
 *
 * Everything here is pure, so the rules are covered by tests that never open a
 * database.
 */

/**
 * As áreas, como LISTA — e o tipo sai dela, não o contrário.
 *
 * A ordem importa: um `type` puro some na compilação, e quem precisa perguntar
 * *"esta string é uma área?"* em tempo de execução fica sem régua. O `serialize`
 * ficava assim — ele aceitava `typeof area === 'string'` e mandava adiante
 * qualquer texto que chegasse pela fila, enquanto o tipo prometia cinco valores.
 *
 * É a forma de defeito que este repositório já pagou três vezes: a validação
 * existe no tipo e não existe na fronteira. O padrão do `capabilities` em
 * `src/domain/access.ts` é este — a lista é a fonte, o tipo é derivado dela — e
 * assim as duas não podem discordar.
 */
export const ERASE_AREAS = ['purchases', 'recipes', 'products', 'inputs', 'all'] as const;

export type EraseArea = (typeof ERASE_AREAS)[number];

/** Se este texto é uma área de verdade. A pergunta que a fronteira precisa fazer. */
export function isEraseArea(value: unknown): value is EraseArea {
  return typeof value === 'string' && (ERASE_AREAS as readonly string[]).includes(value);
}

/**
 * The tables an erase may touch, as a closed set.
 *
 * Deleting has to name its table, and a table name cannot be a bound parameter
 * in SQL. Typing the name instead of leaving it a string is what makes
 * `DELETE FROM ${table}` provably safe (proofgate-allow: this line is prose,
 * not SQL): nothing outside this union can reach the statement, and the
 * compiler enforces it rather than a
 * reviewer remembering to look.
 */
export type ErasableTable =
  | 'check_candidates'
  | 'movements'
  | 'carriers'
  | 'readings'
  | 'production_runs'
  | 'order_lines'
  | 'orders'
  | 'lots'
  | 'purchase_lines'
  | 'purchases'
  | 'products'
  | 'product_types'
  | 'product_categories'
  | 'product_lines'
  | 'flavors'
  | 'recipe_lines'
  | 'recipe_versions'
  | 'recipes'
  | 'item_cost_history'
  | 'item_costs'
  | 'sale_price_history'
  | 'location_prices'
  | 'items'
  | 'devices'
  | 'locations'
  | 'people'
  | 'profiles'
  | 'outbox';

/** What the screen counts up so the confirmation can speak in real numbers. */
export type EraseCounts = {
  inputs: number;
  /**
   * As seis que somiam sem número — registradas como DÍVIDA em 7 de setembro e
   * pagas em 8.
   *
   * A grade do catálogo é UM número somando linha, tipo e sabor: a pessoa não
   * cadastra "um tipo", ela monta a grade, e três números para uma coisa só é
   * ruído numa folha que já tem sete linhas. Os outros três são coisas que ela
   * reconhece pelo nome: a série da câmara, o histórico de quanto se vendia, e o
   * que está combinado com cada loja.
   */
  readings: number;
  grid: number;
  salePrices: number;
  agreedPrices: number;
  /** As transportadoras cadastradas. Só "apagar tudo" as leva. */
  carriers: number;
  /**
   * Os aparelhos matriculados. Só "apagar tudo" os leva.
   *
   * **Contado, e não dispensado como "configuração".** Depois de um Reset completo cada
   * celular volta a gravar sem dizer qual aparelho é — e quem matriculou três não tem como
   * descobrir isso olhando a tela: a matrícula simplesmente deixa de existir e nada
   * reclama. A segunda confirmação existe para dizer o que se perde e não volta, e uma
   * matrícula que ninguém refaz é uma coluna do razão que morre em silêncio.
   */
  devices: number;
  /**
   * Movimentos do livro-razão que a área leva junto.
   *
   * **A cicatriz.** `tablesFor('purchases')` começa com `movements`, e o
   * `DELETE` é por empresa — então apagar "compras" apagava TODO movimento da
   * fábrica: produção, contagem, perda, transferência, saída. A confirmação
   * dizia *"isso apaga as compras, e zera o custo médio"*. Não dizia que um
   * movimento ia.
   *
   * O dono que apaga as compras de exemplo para começar a escrituração de
   * verdade perdia tudo o que já tinha registrado, com a tela lhe dizendo outra
   * coisa. É irreversível pelo texto da própria confirmação, e não há cópia no
   * servidor: o comando de apagar não tem lado servidor.
   *
   * A regra da casa é essa mesma — a confirmação diz o que vai acontecer, com os
   * números por extenso. Faltava o número.
   */
  movements: number;
  /**
   * Os movimentos que **apagar produtos** leva junto, por CASCADE.
   *
   * **A cicatriz é irmã da de cima, e escapou por ser de outra forma.** Ali o
   * razão saía por um `DELETE FROM movements` escrito com todas as letras, e o
   * conserto foi contar. Aqui ele sai sem ninguém escrever a palavra: a área
   * apaga `items` de tipo produto, e `movements.item_id` referencia `items` com
   * `ON DELETE CASCADE`. A confirmação dizia *"isso apaga 1 produto"* e levava
   * produção, despacho, perda e contagem daquele produto com ela.
   *
   * Não é `movements` inteiro: só o que aponta para produto. Anunciar o total
   * seria a mentira oposta — dizer que a produção de insumo vai, quando ela
   * fica.
   *
   * E o que segurava isto de pé era um TESTE: a fixação do `tallyFor` afirmava,
   * por escrito, que *"apagar receita ou produto não apaga movimento nenhum"*.
   * Crença errada com asserção em volta é o motivo de ninguém olhar.
   */
  movementsOfProducts: number;
  /** Lugares que a pessoa cadastrou. O padrão, que nasce sem nome, não conta. */
  places: number;
  /**
   * Gente cadastrada — e é a ausência que mais custava.
   *
   * `tablesFor('all')` apaga `people` e `profiles`, e a confirmação contava
   * ZERO: a grade de nomes com PIN pela qual o chão de fábrica inteiro entra
   * sumia sem uma palavra. Quem aperta "começar do zero" para limpar o exemplo
   * não imagina que está apagando as seis pessoas que cadastrou.
   */
  people: number;
  /**
   * Lotes — rastreabilidade e validade.
   *
   * Some em "apagar tudo" e em "apagar produtos", e não era contado em nenhuma
   * das duas. É o que responde "de que ficha saiu esta caixa" e "quando vence".
   */
  lots: number;
  /** Pedidos de loja. Só "apagar tudo" os leva inteiros. */
  orders: number;
  recipes: number;
  products: number;
  purchases: number;
  /** Recipe lines that point at an input - these block erasing inputs. */
  recipeLinesUsingInputs: number;
  /** Purchase lines that point at any item - these block erasing inputs. */
  purchaseLinesUsingItems: number;
  /** Products made from a recipe - these block erasing recipes. */
  productsUsingRecipes: number;
  /** Purchase lines that point at a resale product - these block erasing it. */
  purchaseLinesUsingProducts: number;
};

export const emptyCounts: EraseCounts = {
  inputs: 0,
  readings: 0,
  grid: 0,
  salePrices: 0,
  agreedPrices: 0,
  carriers: 0,
  devices: 0,
  movements: 0,
  movementsOfProducts: 0,
  places: 0,
  people: 0,
  lots: 0,
  orders: 0,
  recipes: 0,
  products: 0,
  purchases: 0,
  recipeLinesUsingInputs: 0,
  purchaseLinesUsingItems: 0,
  productsUsingRecipes: 0,
  purchaseLinesUsingProducts: 0,
};

/**
 * The tables an area clears, children first.
 *
 * `purchases` takes `item_costs` with it on purpose. An average cost whose
 * invoices no longer exist is a number nobody can audit, and this app's whole
 * claim is that every figure can open its own arithmetic. Better an honest
 * zero than an orphan.
 *
 * It takes `movements` for the same reason, and the reason is worth stating
 * because the rule looks too broad at first glance. A count says "the shelf
 * held 300 g less than the ledger expected" - it stores the difference, not the
 * quantity. Delete the arrivals that difference was measured against and what
 * is left is arithmetic about nothing. An adjustment cannot outlive the
 * balance it adjusted.
 */
export function tablesFor(area: EraseArea): readonly ErasableTable[] {
  switch (area) {
    case 'purchases':
      return ['movements', 'purchase_lines', 'purchases', 'item_cost_history', 'item_costs'];
    case 'recipes':
      return ['recipe_lines', 'recipe_versions', 'recipes'];
    case 'products':
      // As três que travam: `lots.item_id` e `order_lines.item_id` apontam para
      // `items` com RESTRICT, e esta área apaga os itens de tipo produto logo
      // depois de `products`. `production_runs` sai por CASCADE do produto, e
      // está aqui escrita para a ordem ser legível em vez de implícita.
      return ['production_runs', 'order_lines', 'lots', 'products'];
    case 'inputs':
      return ['movements', 'item_cost_history', 'item_costs', 'items'];
    case 'all':
      // Filho antes de pai, e a ordem é a do esquema — não a de quem lembrou.
      //
      // Oito destas entraram em 4 de setembro, e a ausência delas não era
      // cosmética: cinco apontam para `items` ou `locations` com ON DELETE
      // RESTRICT, e é justamente `items` e `locations` que esta lista apaga.
      // Toda corrida de produção grava um `lots`, então A PARTIR DA PRIMEIRA
      // CORRIDA o SQLite levantava "FOREIGN KEY constraint failed", a transação
      // inteira voltava atrás, nada era apagado, e a tela mostrava o texto cru
      // do SQLite em inglês — num aplicativo que promete três idiomas, e depois
      // do toque em vez de o botão nascer desabilitado com o motivo.
      return [
        // Primeira, e sem chave estrangeira nenhuma: a candidata da conferência duplicada
        // não aponta para `movements` de propósito (a que perdeu não está no razão), então
        // ela não trava nada. Vem no começo porque a ordem desta lista é a do esquema, e
        // quem lê tem de conseguir seguir filho antes de pai sem procurar.
        'check_candidates',
        'movements',
        'readings',
        'production_runs',
        'order_lines',
        'orders',
        'lots',
        'purchase_lines',
        'purchases',
        'products',
        // A grade vem DEPOIS do produto: `products.line_id`, `category_id`,
        // `type_id` e `flavor_id` apontam para cá com RESTRICT.
        //
        // E DENTRO da grade a ordem também é de baixo para cima: o tipo aponta
        // para a categoria (`0057`) e a categoria aponta para o produto. Apagar a
        // categoria antes do tipo levanta chave estrangeira e a transação inteira
        // volta atrás — "apagar tudo" passa a não apagar nada.
        'product_types',
        'product_categories',
        'product_lines',
        'flavors',
        'recipe_lines',
        'recipe_versions',
        'recipes',
        'item_cost_history',
        'item_costs',
        // O acordo comercial e a história dele vêm ANTES de `items` e
        // `locations`: os dois apontam para os dois, e o SQLite dispara a chave
        // estrangeira linha por linha. É a mesma ordem, e o mesmo motivo, que
        // pôs `people` antes de `profiles`.
        'sale_price_history',
        'location_prices',
        'items',
        // O APARELHO antes do lugar e depois do razão, e as duas pontas importam:
        // `movements.device_id` aponta para `devices` com RESTRICT, e
        // `devices.location_id` aponta para `locations` com RESTRICT. Fora desta
        // posição o DELETE levanta chave estrangeira e "apagar tudo" volta a não
        // apagar nada — a cicatriz escrita no topo desta lista, agora com a
        // tabela que a estreou do outro lado.
        //
        // A matrícula deste celular volta a ser nula sozinha: `carregarAparelho`
        // confere se a linha existe, e a chave que aponta para nada é descartada
        // no boot seguinte em vez de fazer toda escrita falhar.
        'devices',
        // Depois de `movements`, que aponta para cá. O lugar padrão é recriado
        // sozinho por `ensureLocation` no primeiro movimento seguinte, então
        // apagar todos é seguro: o que some é o que a pessoa cadastrou.
        'locations',
        // Gente antes de perfil, que é a mesma regra de filho antes de pai:
        // `people.profile_id` aponta para cá com RESTRICT no servidor. Os sete
        // modelos voltam sozinhos na próxima abertura, como o lugar padrão volta
        // — o que some é quem a empresa cadastrou.
        'people',
        'profiles',
        // A transportadora vem depois de `movements`, que aponta para ela com
        // `carrier_id`. Mesmo sendo NULO na maioria das linhas, uma única carga
        // com transportadora faria o DELETE levantar chave estrangeira e "apagar
        // tudo" voltaria a não apagar nada — que é a cicatriz escrita acima.
        'carriers',
        'outbox',
      ];
  }
}

/** Which item kinds an area owns. `null` means the area does not touch items. */
export function itemKindsFor(area: EraseArea): readonly string[] | null {
  if (area === 'inputs') return ['input', 'packaging', 'store_supply'];
  if (area === 'products') return ['product', 'resale'];
  return null;
}

/**
 * Why an area cannot be erased yet - as a fact, not as a sentence.
 *
 * This used to return Portuguese prose, which put the interface's voice inside
 * the data layer and made the rule untranslatable. The reason and the number
 * are what this module knows; the wording belongs to whoever is speaking to the
 * person, and lives in the dictionary with every other phrase.
 */
export type EraseBlocker =
  | { reason: 'recipesUseInputs'; count: number }
  | { reason: 'purchasesUseInputs'; count: number }
  | { reason: 'productsUseRecipes'; count: number }
  | { reason: 'purchasesUseProducts'; count: number };

export function blockerFor(area: EraseArea, counts: EraseCounts): EraseBlocker | null {
  if (area === 'all') return null;

  if (area === 'inputs') {
    if (counts.recipeLinesUsingInputs > 0) {
      return { reason: 'recipesUseInputs', count: counts.recipes };
    }
    if (counts.purchaseLinesUsingItems > 0) {
      return { reason: 'purchasesUseInputs', count: counts.purchases };
    }
  }

  if (area === 'recipes' && counts.productsUsingRecipes > 0) {
    return { reason: 'productsUseRecipes', count: counts.productsUsingRecipes };
  }

  if (area === 'products' && counts.purchaseLinesUsingProducts > 0) {
    return { reason: 'purchasesUseProducts', count: counts.purchaseLinesUsingProducts };
  }

  return null;
}

/**
 * Refusing an erase, as an error that carries the reason rather than a
 * sentence. The screen that catches it is the one that speaks a language.
 */
export class EraseBlockedError extends Error {
  constructor(public readonly blocker: EraseBlocker) {
    super(`Erase blocked: ${blocker.reason}`);
    this.name = 'EraseBlockedError';
  }
}

/**
 * What an area takes with it when it goes, counted.
 *
 * The confirmation is built from this, so it can say "6 insumos, 2 receitas e
 * 1 produto" in whatever language is on screen instead of a number the person
 * has to take on trust.
 */
/**
 * O que a contagem de apagar tem — e a LISTA é a fonte, não o tipo.
 *
 * Escrita como constante e não como campos de tipo porque duas coisas precisam
 * PERCORRER estas chaves e as duas as escreviam à mão: `isEmpty`, que somava seis
 * das catorze, e a frase da tela, que imprimia dez. Gente, lotes, pedidos e
 * transportadoras eram contados pelo repositório, apagados pelo `tablesFor('all')`,
 * e não apareciam em nenhum dos dois — então a segunda confirmação de "apagar
 * tudo", que é o único lugar onde alguém lê o que vai perder, dizia **"Já está
 * tudo vazio"** com seis pessoas e quarenta lotes dentro.
 *
 * Uma confirmação que mente antes de um ato irreversível é o pior defeito que este
 * arquivo pode ter. Com a lista, quem acrescentar uma tabela nova ao apagar não
 * consegue esquecer nenhum dos dois lados: o tipo deriva daqui, e a tela percorre
 * a mesma lista.
 *
 * A ordem é a de impressão: o que a pessoa mais reconhece primeiro.
 */
export const TALLY_KEYS = [
  'inputs',
  'movements',
  'recipes',
  'products',
  'places',
  'purchases',
  'people',
  'lots',
  'orders',
  'carriers',
  'devices',
  'readings',
  'grid',
  'salePrices',
  'agreedPrices',
] as const;

export type EraseTally = { [K in (typeof TALLY_KEYS)[number]]: number };

export function tallyFor(area: EraseArea, counts: EraseCounts): EraseTally {
  const nothing: EraseTally = {
    inputs: 0,
    readings: 0,
    grid: 0,
    salePrices: 0,
    agreedPrices: 0,
    carriers: 0,
    devices: 0,
    movements: 0,
    recipes: 0,
    products: 0,
    purchases: 0,
    places: 0,
    people: 0,
    lots: 0,
    orders: 0,
  };

  switch (area) {
    case 'purchases':
      return { ...nothing, purchases: counts.purchases, movements: counts.movements };
    case 'recipes':
      return { ...nothing, recipes: counts.recipes };
    case 'products':
      // O movimento vai por CASCADE de `items`, e por muito tempo isto dizia
      // zero. Ver `EraseCounts.movementsOfProducts`.
      // Os lotes vão junto (`tablesFor('products')` os lista) e não eram
      // contados. Os PEDIDOS não: a área leva `order_lines` e deixa `orders`,
      // então o cabeçalho sobrevive apontando para nada — dito na prosa, não
      // contado aqui, porque contar o que fica seria mentir do outro lado.
      return {
        ...nothing,
        products: counts.products,
        movements: counts.movementsOfProducts,
        lots: counts.lots,
      };
    case 'inputs':
      return { ...nothing, inputs: counts.inputs, movements: counts.movements };
    case 'all':
      return {
        inputs: counts.inputs,
        movements: counts.movements,
        recipes: counts.recipes,
        products: counts.products,
        purchases: counts.purchases,
        places: counts.places,
        people: counts.people,
        lots: counts.lots,
        orders: counts.orders,
        carriers: counts.carriers,
        devices: counts.devices,
        readings: counts.readings,
        grid: counts.grid,
        salePrices: counts.salePrices,
        agreedPrices: counts.agreedPrices,
      };
  }
}

/**
 * Há alguma coisa para apagar nesta área?
 *
 * Somava SEIS das catorze chaves. Uma empresa com seis pessoas na grade, quarenta
 * lotes e pedidos abertos — e nada de insumo, receita ou movimento — respondia
 * "vazia", e a confirmação dizia isso na cara de quem ia apagar tudo.
 */
export function isEmpty(tally: EraseTally): boolean {
  return TALLY_KEYS.every((k) => tally[k] === 0);
}

