import assert from 'node:assert/strict';
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
  type ErasableTable,
} from './erase';

/**
 * Erasing is the one operation with no undo, so its rules are worth pinning
 * down harder than the rest. Two failure modes matter: an order that trips a
 * foreign key halfway through and leaves a recipe whose ingredients are gone,
 * and a refusal that says nothing useful about how to proceed.
 */

/**
 * The schema's own `ON DELETE RESTRICT` edges, as child -> parents. Written out
 * here so the test fails if the delete order and the schema ever disagree.
 */
const DEPENDS_ON: Record<ErasableTable, readonly ErasableTable[]> = {
  movements: ['items', 'locations'],
  purchase_lines: ['purchases', 'items'],
  purchases: [],
  products: ['items', 'recipes'],
  recipe_lines: ['recipe_versions', 'items', 'recipes'],
  recipe_versions: ['recipes'],
  recipes: [],
  item_cost_history: ['items'],
  item_costs: ['items'],
  items: [],
  locations: [],
  outbox: [],
};

test('every area deletes children before the rows they point at', () => {
  const areas: EraseArea[] = ['purchases', 'recipes', 'products', 'inputs', 'all'];

  for (const area of areas) {
    const order = tablesFor(area);
    const gone = new Set<ErasableTable>();

    for (const table of order) {
      for (const parent of DEPENDS_ON[table] ?? []) {
        assert.ok(
          !gone.has(parent),
          `${area}: ${table} is deleted after ${parent}, which its rows point at`,
        );
      }
      gone.add(table);
    }
  }
});

test('erasing everything reaches every table that holds business data', () => {
  const all = new Set(tablesFor('all'));
  for (const table of Object.keys(DEPENDS_ON) as ErasableTable[]) {
    assert.ok(all.has(table), `"apagar tudo" leaves ${table} behind`);
  }
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
    recipes: 2,
    products: 1,
    purchases: 6,
    places: 3,
  };

  assert.deepEqual(tallyFor('all', counts), {
    inputs: 6,
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
    recipes: 0,
    products: 0,
    purchases: 6,
    places: 0,
  });
  assert.deepEqual(tallyFor('inputs', counts), {
    inputs: 6,
    recipes: 0,
    products: 0,
    purchases: 0,
    places: 0,
  });

  assert.equal(isEmpty(tallyFor('all', emptyCounts)), true);
  assert.equal(isEmpty(tallyFor('all', counts)), false);
});
