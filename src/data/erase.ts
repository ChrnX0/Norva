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

/** What the screen counts up so the confirmation can speak in real numbers. */
export type EraseCounts = {
  inputs: number;
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
 */
export function tablesFor(area: EraseArea): readonly string[] {
  switch (area) {
    case 'purchases':
      return ['purchase_lines', 'purchases', 'item_cost_history', 'item_costs'];
    case 'recipes':
      return ['recipe_lines', 'recipe_versions', 'recipes'];
    case 'products':
      return ['products'];
    case 'inputs':
      return ['item_cost_history', 'item_costs', 'items'];
    case 'all':
      return [
        'purchase_lines',
        'purchases',
        'products',
        'recipe_lines',
        'recipe_versions',
        'recipes',
        'item_cost_history',
        'item_costs',
        'items',
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
 * Why an area cannot be erased yet, in the words the person will read.
 *
 * It names what is in the way *and* what to do about it, because "operation
 * failed" teaches nothing and the dependency is not obvious from outside.
 */
export function blockerFor(area: EraseArea, counts: EraseCounts): string | null {
  if (area === 'all') return null;

  if (area === 'inputs') {
    if (counts.recipeLinesUsingInputs > 0) {
      return plural(
        counts.recipes,
        'Não dá para apagar os insumos enquanto 1 receita usa eles. Apague as receitas primeiro.',
        `Não dá para apagar os insumos enquanto ${counts.recipes} receitas usam eles. Apague as receitas primeiro.`,
      );
    }
    if (counts.purchaseLinesUsingItems > 0) {
      return plural(
        counts.purchases,
        'Não dá para apagar os insumos enquanto 1 compra lançada aponta para eles. Apague as compras primeiro.',
        `Não dá para apagar os insumos enquanto ${counts.purchases} compras lançadas apontam para eles. Apague as compras primeiro.`,
      );
    }
  }

  if (area === 'recipes' && counts.productsUsingRecipes > 0) {
    return plural(
      counts.productsUsingRecipes,
      'Não dá para apagar as receitas enquanto 1 produto é feito delas. Apague os produtos primeiro.',
      `Não dá para apagar as receitas enquanto ${counts.productsUsingRecipes} produtos são feitos delas. Apague os produtos primeiro.`,
    );
  }

  if (area === 'products' && counts.purchaseLinesUsingProducts > 0) {
    return 'Não dá para apagar os produtos enquanto há compras de revenda lançadas neles. Apague as compras primeiro.';
  }

  return null;
}

/** What disappears, spelled out, so the confirmation is not a blank cheque. */
export function summaryFor(area: EraseArea, counts: EraseCounts): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };

  switch (area) {
    case 'purchases':
      add(counts.purchases, 'compra lançada', 'compras lançadas');
      return parts.length > 0
        ? `Isso apaga ${list(parts)}, e zera o custo médio de todos os insumos — eles ficam sem preço até a próxima nota.`
        : 'Não há compras lançadas para apagar.';
    case 'recipes':
      add(counts.recipes, 'receita', 'receitas');
      return parts.length > 0
        ? `Isso apaga ${list(parts)}, com todas as versões e linhas delas. O histórico de versões vai junto.`
        : 'Não há receitas para apagar.';
    case 'products':
      add(counts.products, 'produto', 'produtos');
      return parts.length > 0 ? `Isso apaga ${list(parts)}.` : 'Não há produtos para apagar.';
    case 'inputs':
      add(counts.inputs, 'insumo', 'insumos');
      return parts.length > 0
        ? `Isso apaga ${list(parts)}, junto com o custo médio e o histórico de preço deles.`
        : 'Não há insumos para apagar.';
    case 'all':
      add(counts.inputs, 'insumo', 'insumos');
      add(counts.recipes, 'receita', 'receitas');
      add(counts.products, 'produto', 'produtos');
      add(counts.purchases, 'compra', 'compras');
      return parts.length > 0
        ? `Isso apaga ${list(parts)}. O aplicativo volta a abrir vazio, e os dados de exemplo não voltam sozinhos.`
        : 'Já está tudo vazio.';
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** "6 insumos, 2 receitas e 1 produto" - the way a person would say it. */
function list(parts: readonly string[]): string {
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}
