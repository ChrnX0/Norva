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

export type EraseArea = 'purchases' | 'recipes' | 'products' | 'inputs' | 'all';

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
  | 'movements'
  | 'readings'
  | 'production_runs'
  | 'order_lines'
  | 'orders'
  | 'lots'
  | 'purchase_lines'
  | 'purchases'
  | 'products'
  | 'product_types'
  | 'product_lines'
  | 'flavors'
  | 'recipe_lines'
  | 'recipe_versions'
  | 'recipes'
  | 'item_cost_history'
  | 'item_costs'
  | 'items'
  | 'locations'
  | 'people'
  | 'profiles'
  | 'outbox';

/** What the screen counts up so the confirmation can speak in real numbers. */
export type EraseCounts = {
  inputs: number;
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
  /** Lugares que a pessoa cadastrou. O padrão, que nasce sem nome, não conta. */
  places: number;
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
  movements: 0,
  places: 0,
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
        'movements',
        'readings',
        'production_runs',
        'order_lines',
        'orders',
        'lots',
        'purchase_lines',
        'purchases',
        'products',
        // A grade vem DEPOIS do produto: `products.line_id`, `type_id` e
        // `flavor_id` apontam para cá com RESTRICT.
        'product_types',
        'product_lines',
        'flavors',
        'recipe_lines',
        'recipe_versions',
        'recipes',
        'item_cost_history',
        'item_costs',
        'items',
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
export type EraseTally = {
  inputs: number;
  /** Movimentos do livro-razão. Ver `EraseCounts.movements`. */
  movements: number;
  recipes: number;
  products: number;
  purchases: number;
  /** Só "apagar tudo" leva os lugares; nenhuma área menor é dona deles. */
  places: number;
};

export function tallyFor(area: EraseArea, counts: EraseCounts): EraseTally {
  const nothing: EraseTally = { inputs: 0, movements: 0, recipes: 0, products: 0, purchases: 0, places: 0 };

  switch (area) {
    case 'purchases':
      return { ...nothing, purchases: counts.purchases, movements: counts.movements };
    case 'recipes':
      return { ...nothing, recipes: counts.recipes };
    case 'products':
      return { ...nothing, products: counts.products };
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
      };
  }
}

/** Whether there is anything at all to erase in this area. */
export function isEmpty(tally: EraseTally): boolean {
  return (
    tally.inputs + tally.movements + tally.recipes + tally.products + tally.purchases + tally.places ===
    0
  );
}

