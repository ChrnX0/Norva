import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCostEvent, emptyStock, reorderPoint } from './cost';
import { amountOf, cents, fromDecimal, rate, type Rate } from './money';
import {
  compareVersions,
  costPerProductUnit,
  costRecipe,
  explodeRequirements,
  shoppingList,
  MissingRecipeError,
  packagingRatePerUnit,
  RecipeCycleError,
  unitsPerBatch,
  type ItemCosts,
  type Recipe,
} from './recipe';
import { breakdown, roundUpToFullContainer, type PackagingHierarchy } from './units';

// --- money -----------------------------------------------------------------

// --- packaging -------------------------------------------------------------

const hierarchy: PackagingHierarchy = {
  tiers: [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'box', perBaseUnit: 50 },
    { id: 'crate', perBaseUnit: 300 },
  ],
};

test('breakdown speaks in crates and boxes, not raw units', () => {
  assert.deepEqual(
    breakdown(3658, hierarchy).map((p) => [p.tier.id, p.quantity]),
    [
      ['crate', 12],
      ['box', 1],
      ['unit', 8],
    ],
  );
});

test('rounding up fills the box instead of leaving loose units', () => {
  const result = roundUpToFullContainer(1599, hierarchy, 'box');
  assert.equal(result.rounded, 1600);
  assert.equal(result.addedUnits, 1);
  assert.equal(1600 % 50, 0);
});

// --- recipe cost -----------------------------------------------------------

// Rates, not amounts: price per purchase unit divided by base units in it.
const itemCosts = {
  strawberryPulp: rate(12.4, 1000), // R$ 12.40 per kg -> 1.24 cents per gram
  sugar: rate(4.72, 1000), // R$ 4.72 per kg
  milkPowder: rate(28.9, 1000),
  stick: rate(0.02, 1), // R$ 0.02 each
  wrapper: rate(0.03, 1),
};

const recipes: Record<string, Recipe> = {
  creamBase: {
    id: 'creamBase',
    versionId: 'creamBase-v',
    version: 1,
    effectiveFrom: '2026-01-01',
    // 20,000 ml of base
    yieldAmount: 20_000,
    yieldUnit: 'ml',
    lossFraction: 0,
    lines: [
      { kind: 'item', itemId: 'milkPowder', quantity: 2_000 },
      { kind: 'item', itemId: 'sugar', quantity: 3_000 },
    ],
  },
  strawberry: {
    id: 'strawberry',
    versionId: 'strawberry-v',
    version: 4,
    effectiveFrom: '2026-06-01',
    yieldAmount: 40_000,
    yieldUnit: 'ml', // 40 L of mix
    lossFraction: 0.05, // 5% real loss
    lines: [
      { kind: 'item', itemId: 'strawberryPulp', quantity: 18_000 },
      { kind: 'item', itemId: 'sugar', quantity: 6_000 },
      { kind: 'recipe', recipeId: 'creamBase', quantity: 10_000 },
    ],
  },
};

test('loss makes the unit cost go up, not down', () => {
  const withLoss = costRecipe('strawberry', recipes, itemCosts);
  const noLoss = costRecipe('strawberry', { ...recipes, strawberry: { ...recipes.strawberry, lossFraction: 0 } }, itemCosts, {}, new Map());

  assert.equal(withLoss.netYield, 38_000);
  assert.ok(
    withLoss.perYieldUnit > noLoss.perYieldUnit,
    'a batch that loses 5% must cost more per surviving unit',
  );
});

test('a sub-recipe cascades into the parent cost', () => {
  const base = costRecipe('creamBase', recipes, itemCosts);
  const parent = costRecipe('strawberry', recipes, itemCosts);

  // creamBase: 2000g milk powder + 3000g sugar
  const expectedBaseBatch = 2_000 * itemCosts.milkPowder + 3_000 * itemCosts.sugar;
  assert.equal(base.batchCents, Math.round(expectedBaseBatch));

  const subLine = parent.lines.find((l) => l.label === 'creamBase');
  assert.ok(subLine, 'the sub-recipe must appear as its own cost line');
  assert.equal(subLine!.totalCents, Math.round(base.perYieldUnit * 10_000));
});

test('a more expensive input moves every product that uses it', () => {
  const before = costRecipe('strawberry', recipes, itemCosts);
  const after = costRecipe(
    'strawberry',
    recipes,
    { ...itemCosts, sugar: rate(9.44, 1000) }, // sugar doubles
    {},
    new Map(),
  );

  assert.ok(
    after.perYieldUnit > before.perYieldUnit,
    'sugar is used directly and through the cream base; both must move',
  );
});

test('cost lines carry their share, so the app can say what dominates', () => {
  const cost = costRecipe('strawberry', recipes, itemCosts);
  const total = cost.lines.reduce((sum, l) => sum + l.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, 'shares must add up to the whole batch');
});

test('a recipe that contains itself raises instead of hanging', () => {
  const looping: Record<string, Recipe> = {
    a: {
      id: 'a',
      versionId: 'a-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 100,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [{ kind: 'recipe', recipeId: 'b', quantity: 10 }],
    },
    b: {
      id: 'b',
      versionId: 'b-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 100,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [{ kind: 'recipe', recipeId: 'a', quantity: 10 }],
    },
  };

  assert.throws(() => costRecipe('a', looping, itemCosts), RecipeCycleError);
});

test('the packaging that leaves stock is inside the quoted unit cost', () => {
  // O `mutate` zerou `itemsRate` e a suíte inteira continuou verde: a regra só
  // era exercitada por tela, e o `mutate` roda a suíte rápida. Sem este teste, a
  // embalagem que sai do estoque volta a ficar fora do custo cotado - e a
  // produção congela um número maior que o que sete telas prometeram, que é
  // exatamente a divergência que já custou uma rodada aqui.
  const cost = costRecipe('strawberry', recipes, itemCosts);
  const soMassa = costPerProductUnit(cost, 75);

  // Dois centavos de palito são dois centavos no custo da unidade.
  assert.equal(costPerProductUnit(cost, 75, { itemsRate: 2 }) - soMassa, 2);

  // E as duas metades somam: o que sai do estoque mais o que foi digitado.
  assert.equal(costPerProductUnit(cost, 75, { itemsRate: 2, typedRate: rate(0.03, 1) }) - soMassa, 5);

  // A fração não se perde no caminho, e é por isso que a taxa entra fracionária:
  // meio centavo somado dez vezes é cinco centavos, não zero e não dez. Onde
  // isso se prova é na própria taxa - o arredondamento do total depende da massa
  // da receita, e um teste que dependesse dela estaria medindo outra coisa.
  const meio = packagingRatePerUnit([{ itemId: 'stick', quantityPerUnit: 1 }], { stick: 0.5 });
  assert.equal(meio, 0.5, 'meio centavo continua meio centavo');
  assert.equal(meio * 10, 5);

  assert.equal(
    packagingRatePerUnit([{ itemId: 'stick', quantityPerUnit: 2 }], { stick: 1.25 }),
    2.5,
    'a taxa é quantidade x preço, sem arredondar no caminho',
  );
  assert.equal(
    packagingRatePerUnit([{ itemId: 'fantasma', quantityPerUnit: 3 }], {}),
    0,
    'item sem preço vale zero em vez de derrubar a conta',
  );
});

test('product cost adds per-unit packaging on top of the mix', () => {
  const cost = costRecipe('strawberry', recipes, itemCosts);
  const packaging = (itemCosts.stick + itemCosts.wrapper) as Rate;
  const perUnit = costPerProductUnit(cost, 75, { typedRate: packaging });
  const mixOnly = costPerProductUnit(cost, 75);

  assert.equal(perUnit - mixOnly, packaging);
  assert.equal(unitsPerBatch(cost, 75), Math.floor(38_000 / 75));
});

test('comparing versions reports the change in plain numbers', () => {
  const v3 = costRecipe(
    'strawberry',
    { ...recipes, strawberry: { ...recipes.strawberry, version: 3, lossFraction: 0.08 } },
    itemCosts,
    {},
    new Map(),
  );
  const v4 = costRecipe('strawberry', recipes, itemCosts, {}, new Map());

  const diff = compareVersions(v3, v4, 75);
  assert.ok(diff.cheaper, 'cutting loss from 8% to 5% must make the unit cheaper');
  assert.ok(diff.deltaCents < 0);
});

test('exploding a plan reaches raw items through sub-recipes', () => {
  const needs = explodeRequirements('strawberry', 3, recipes);

  assert.equal(needs.get('strawberryPulp'), 54_000); // 18kg x 3
  // Sugar arrives twice: directly, and through the cream base.
  const directSugar = 6_000 * 3;
  assert.ok(
    (needs.get('sugar') ?? 0) > directSugar,
    'sugar inside the cream base must be counted too',
  );
  assert.ok((needs.get('milkPowder') ?? 0) > 0);
});

test('the shopping list answers what is missing, not what the recipe asks for', () => {
  // "Se eu fizer 3 tachos de morango, o que falta?" — a pergunta que o dono faz
  // antes de ligar para o fornecedor. A prateleira tem polpa de sobra e açúcar
  // pela metade.
  const prateleira = new Map([
    ['strawberryPulp', 60_000],
    ['sugar', 10_000],
    ['milkPowder', 0],
    ['stick', 500],
  ]);

  const lista = shoppingList(
    [{ recipeId: 'strawberry', batches: 3 }],
    recipes,
    prateleira,
  );

  const polpa = lista.find((l) => l.itemId === 'strawberryPulp');
  assert.equal(polpa?.needed, 54_000, '18 kg por tacho, três tachos');
  assert.equal(polpa?.missing, 0, 'o que sobra na prateleira não entra na compra');

  // O açúcar chega por dois caminhos — direto e pela base de creme —, e é a soma
  // que decide a compra: 18.000 direto mais o da base, contra 10.000 em casa.
  const acucar = lista.find((l) => l.itemId === 'sugar');
  assert.ok((acucar?.needed ?? 0) > 18_000, 'o açúcar da sub-receita conta');
  assert.equal(acucar?.missing, (acucar?.needed ?? 0) - 10_000);

  // E a ordem é a da decisão: o que mais falta vem primeiro.
  assert.ok(lista[0].missing >= lista[lista.length - 1].missing);
});

test('a plan sums several products into one shopping list, with the packaging', () => {
  // Dois produtos no mesmo plano, e a embalagem entra por UNIDADE prevista: o
  // tacho que rende 38.000 ml a 75 ml por unidade faz uns 506 picolés, e cada
  // um leva um palito. Sem esta parte, a lista de compras esquece o palito -
  // que é o mesmo defeito que o custo congelado já teve.
  const plano = [
    {
      recipeId: 'strawberry',
      batches: 1,
      yieldPerUnit: 75,
      packaging: [{ itemId: 'stick', quantityPerUnit: 1 }],
    },
    { recipeId: 'creamBase', batches: 2 },
  ];

  const lista = shoppingList(plano, recipes, new Map([['stick', 100]]));

  const palito = lista.find((l) => l.itemId === 'stick');
  const unidades = (40_000 * 0.95) / 75;
  assert.ok(palito, 'o palito entra pela embalagem, não pela receita');
  assert.equal(Math.round(palito!.needed), Math.round(unidades));
  assert.equal(Math.round(palito!.missing), Math.round(unidades) - 100);

  // O leite em pó vem só da base — uma vez pela sub-receita do morango e outra
  // pelos dois tachos pedidos direto. Um plano é uma soma, não uma lista de
  // listas.
  const leite = lista.find((l) => l.itemId === 'milkPowder');
  assert.ok((leite?.needed ?? 0) > 2_000 * 2, 'os dois caminhos somam no mesmo item');
});

test('a plan of zero batches asks for nothing', () => {
  assert.deepEqual(shoppingList([{ recipeId: 'strawberry', batches: 0 }], recipes, new Map()), []);
});

// --- moving average cost ---------------------------------------------------

test('a purchase blends into the average in proportion to what is on hand', () => {
  let state = emptyStock;

  state = applyCostEvent(state, {
    kind: 'purchase',
    baseUnits: 100_000, // 100 kg
    totalCents: fromDecimal(472), // R$ 4.72/kg
    at: '2026-07-01',
  });
  // R$ 4.72/kg is 0.472 cents per gram - the value an integer type destroys.
  assert.ok(Math.abs(state.averageRate - 0.472) < 1e-9);

  state = applyCostEvent(state, {
    kind: 'purchase',
    baseUnits: 100_000,
    totalCents: fromDecimal(590), // R$ 5.90/kg
    at: '2026-08-01',
  });

  // Equal quantities, so the average lands exactly between the two.
  assert.ok(Math.abs(state.averageRate - (0.472 + 0.59) / 2) < 1e-9);
});

test('consuming stock leaves the average alone', () => {
  const bought = applyCostEvent(emptyStock, {
    kind: 'purchase',
    baseUnits: 1_000,
    totalCents: cents(10_000),
    at: '2026-07-01',
  });
  const after = applyCostEvent(bought, { kind: 'consumption', baseUnits: 400, at: '2026-07-02' });

  assert.equal(after.averageRate, bought.averageRate);
  assert.equal(after.baseUnits, 600);
});

test('the reorder point uses the observed lead time, not the promised one', () => {
  // Supplier says three days; six is what actually happens.
  assert.equal(reorderPoint(50, 6, 2), 400);
  assert.ok(reorderPoint(50, 6) > reorderPoint(50, 3));
});

/**
 * The rounding defect, and the rule it broke.
 *
 * `Cents` is an integer and `Rate` is fractional, and only the final value
 * rounds - once. The batch cost was rounding every line first and summing the
 * results, which is the same mistake in a different coat: cheap lines vanished
 * one by one and the recipe came out understated with every intermediate step
 * looking perfectly sane.
 */

test('cheap lines add up instead of each rounding away to nothing', () => {
  // Ten ingredients at four tenths of a cent apiece. Rounded line by line they
  // are all zero; together they are four cents.
  const graph: Record<string, Recipe> = {
    tiny: {
      id: 'tiny',
      versionId: 'tiny-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 1_000,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: Array.from({ length: 10 }, (_, i) => ({
        kind: 'item' as const,
        itemId: `i${i}`,
        quantity: 1,
      })),
    },
  };
  const costs: ItemCosts = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`i${i}`, 0.4 as Rate]),
  );

  const cost = costRecipe('tiny', graph, costs);

  assert.equal(cost.batchCents, 4, 'ten times four tenths is four cents, not zero');

  // And the breakdown adds up to the figure it explains. A `[por quê?]` whose
  // lines do not sum to the number above them is worse than none.
  const shown = cost.lines.reduce((a, l) => a + l.totalCents, 0);
  assert.equal(shown, cost.batchCents);
});

test('the breakdown always sums to the figure, however the cents fall', () => {
  const graph: Record<string, Recipe> = {
    odd: {
      id: 'odd',
      versionId: 'odd-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 1_000,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [
        { kind: 'item', itemId: 'a', quantity: 3 },
        { kind: 'item', itemId: 'b', quantity: 3 },
        { kind: 'item', itemId: 'c', quantity: 3 },
      ],
    },
  };
  // 3 x 0.3333 three times: 2.9997 cents, which is 3 after one rounding.
  const costs: ItemCosts = { a: 0.3333 as Rate, b: 0.3333 as Rate, c: 0.3333 as Rate };

  const cost = costRecipe('odd', graph, costs);
  assert.equal(cost.batchCents, 3);
  assert.equal(cost.lines.reduce((a, l) => a + l.totalCents, 0), 3);
  assert.deepEqual(cost.lines.map((l) => l.totalCents), [1, 1, 1]);
});

test('a share is the line\'s real weight, not its rounded one', () => {
  const graph: Record<string, Recipe> = {
    mix: {
      id: 'mix',
      versionId: 'mix-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 1_000,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [
        { kind: 'item', itemId: 'big', quantity: 1_000 },
        { kind: 'item', itemId: 'small', quantity: 1 },
      ],
    },
  };
  const costs: ItemCosts = { big: 1 as Rate, small: 0.4 as Rate };

  const cost = costRecipe('mix', graph, costs);
  // The tiny line still rounds to nothing on screen, and must still carry its
  // real weight - otherwise "what dominates this recipe" answers with noise.
  assert.ok(cost.lines[1].share > 0, 'a line worth less than a cent is not weightless');
  assert.ok(Math.abs(cost.lines[0].share + cost.lines[1].share - 1) < 1e-9);
});

/**
 * The two ways a recipe can point at something that is not there, and why they
 * are answered differently.
 *
 * A mutation check turned the missing-recipe throw into a zero-cost result and
 * the whole suite stayed green - the error class existed and nothing ever
 * proved it fired. That is the dangerous half: a semi-finished base that has
 * gone missing would make every flavour standing on it quietly cheaper, with
 * no number ever looking wrong.
 */

test('a sub-recipe that is not there stops the costing, and names itself', () => {
  const orphan: Record<string, Recipe> = {
    popsicle: {
      id: 'popsicle',
      versionId: 'popsicle-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 10_000,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [{ kind: 'recipe', recipeId: 'creamBase', quantity: 4_000 }],
    },
  };

  // Silence here is the failure that looks like success: the popsicle would
  // simply come out cheaper, and every product standing on it with it.
  assert.throws(
    () => costRecipe('popsicle', orphan, {}),
    (e: unknown) => e instanceof MissingRecipeError && String(e.message).includes('creamBase'),
  );
});

test('an item with no invoice yet is free, and that is not the same thing', () => {
  const priced: Record<string, Recipe> = {
    base: {
      id: 'base',
      versionId: 'base-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 1_000,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [
        { kind: 'item', itemId: 'sugar', quantity: 500 },
        { kind: 'item', itemId: 'brandNew', quantity: 500 },
      ],
    },
  };

  // Deliberately asymmetric. A missing recipe is structural - something was
  // deleted or never arrived. An item nobody has bought yet genuinely has no
  // cost, and the storeroom screen already says so in words: "ainda sem nota
  // lançada". Refusing to cost the recipe would make the app unusable on the
  // first day, before any invoice exists.
  const cost = costRecipe('base', priced, { sugar: 0.472 as Rate });
  assert.equal(cost.batchCents, 236);
  assert.equal(cost.lines[1].totalCents, 0);
});

/**
 * O rótulo de quatro décimos de centavo, que entrava de graça.
 *
 * Este é o caso que a migração V18 existe para servir, e ele é invisível com o
 * valor padrão: uma embalagem de cinco centavos atravessava certo mesmo quando o
 * campo era `Cents` inteiro. O defeito só nasce abaixo de meio centavo — e é
 * justamente aí que ele some, porque `Math.round(0,4)` é zero e zero não parece
 * errado.
 *
 * Quinhentas unidades a R$ 0,004 são R$ 2,00 por corrida. Num ano de produção
 * diária, mil e quinhentos reais que o custo congelado nunca viu — e custo
 * congelado não se corrige, se estorna.
 */
test('packaging under half a cent is charged, not rounded away', () => {
  const cost = costRecipe('strawberry', recipes, itemCosts);

  // O que a tela produz a partir do que a pessoa digitou: R$ 0,004 por unidade.
  const rotulo = rate(0.004, 1);
  assert.equal(rotulo, 0.4, 'quatro décimos de centavo continuam quatro décimos');

  // O que a porta de entrada fazia antes, dito como aritmética: o mesmo valor
  // digitado virava ZERO, e zero não parece errado em lugar nenhum.
  assert.equal(fromDecimal(0.004), 0, 'era isto que a tela gravava');

  // **Onde ele aparece é na escala, não na unidade** — e essa é a parte que
  // engana. `costPerProductUnit` arredonda UMA vez, no fim: quatro décimos de
  // centavo somados a um custo de meio real podem cair no mesmo centavo, e cair
  // no mesmo centavo está certo. O dinheiro está na multiplicação: quinhentas
  // unidades por corrida, todo dia.
  assert.equal(amountOf(rotulo, 1000), 400, 'mil rótulos são quatro reais, não zero');
  assert.equal(amountOf(fromDecimal(0.004) as unknown as Rate, 1000), 0, 'e antes eram zero');

  // E as duas metades somam ANTES de arredondar, que é a regra da casa: meio
  // centavo de palito mais quatro décimos de rótulo é quase um centavo inteiro, e
  // nenhum dos dois vira zero no caminho.
  const soMassa = costPerProductUnit(cost, 75);
  const juntos = costPerProductUnit(cost, 75, { typedRate: rotulo, itemsRate: 0.5 });
  assert.equal(juntos - soMassa, 1, 'nove décimos arredondam para um centavo, uma vez');
});
