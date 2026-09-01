import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blockerFor,
  emptyCounts,
  itemKindsFor,
  summaryFor,
  tablesFor,
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
 * The schema's own `ON DELETE RESTRICT` edges, as child -> parents. Written out
 * here so the test fails if the delete order and the schema ever disagree.
 */
const DEPENDS_ON: Record<string, readonly string[]> = {
  purchase_lines: ['purchases', 'items'],
  purchases: [],
  products: ['items', 'recipes'],
  recipe_lines: ['recipe_versions', 'items', 'recipes'],
  recipe_versions: ['recipes'],
  recipes: [],
  item_cost_history: ['items'],
  item_costs: ['items'],
  items: [],
  outbox: [],
};

test('every area deletes children before the rows they point at', () => {
  const areas: EraseArea[] = ['purchases', 'recipes', 'products', 'inputs', 'all'];

  for (const area of areas) {
    const order = tablesFor(area);
    const gone = new Set<string>();

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
  for (const table of Object.keys(DEPENDS_ON)) {
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

test('a recipe standing on an input blocks the input, and says what to do', () => {
  const counts: EraseCounts = { ...emptyCounts, inputs: 6, recipes: 2, recipeLinesUsingInputs: 8 };
  const blocker = blockerFor('inputs', counts);

  assert.ok(blocker);
  assert.match(blocker, /2 receitas/);
  assert.match(blocker, /Apague as receitas primeiro/);
  // The way out is named, not just the obstacle.
  assert.equal(blockerFor('recipes', counts), null);
});

test('a purchase blocks the input it bought, once no recipe is in the way', () => {
  const counts: EraseCounts = {
    ...emptyCounts,
    inputs: 6,
    purchases: 1,
    purchaseLinesUsingItems: 6,
  };
  const blocker = blockerFor('inputs', counts);

  assert.ok(blocker);
  assert.match(blocker, /1 compra lançada/);
  assert.match(blocker, /Apague as compras primeiro/);
});

test('a product made from a recipe blocks the recipe', () => {
  const counts: EraseCounts = { ...emptyCounts, recipes: 2, products: 1, productsUsingRecipes: 1 };
  const blocker = blockerFor('recipes', counts);

  assert.ok(blocker);
  assert.match(blocker, /1 produto/);
});

test('erasing everything is never blocked - that is the point of it', () => {
  const tangled: EraseCounts = {
    inputs: 6,
    recipes: 2,
    products: 1,
    purchases: 6,
    recipeLinesUsingInputs: 8,
    purchaseLinesUsingItems: 6,
    productsUsingRecipes: 1,
    purchaseLinesUsingProducts: 2,
  };

  assert.equal(blockerFor('all', tangled), null);
});

test('the confirmation counts what disappears instead of asking for faith', () => {
  const counts: EraseCounts = { ...emptyCounts, inputs: 6, recipes: 2, products: 1, purchases: 6 };

  const all = summaryFor('all', counts);
  assert.match(all, /6 insumos, 2 receitas, 1 produto e 6 compras/);
  assert.match(all, /não voltam sozinhos/);

  // Erasing invoices also drops the average, and says so - a cost with no
  // invoice behind it is a number nobody can audit.
  assert.match(summaryFor('purchases', counts), /zera o custo médio/);

  assert.match(summaryFor('recipes', { ...emptyCounts, recipes: 1 }), /1 receita\b/);
  assert.match(summaryFor('inputs', emptyCounts), /Não há insumos/);
  assert.match(summaryFor('all', emptyCounts), /Já está tudo vazio/);
});
