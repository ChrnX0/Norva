import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCostEvent, emptyStock, reorderPoint } from './cost';
import { amountOf, cents, fromDecimal, rate, type Rate } from './money';
import {
  compareVersions,
  costPerPack,
  costPerProductUnit,
  costRecipe,
  explodeRequirements,
  shoppingList,
  MissingRecipeError,
  packagingRatePerUnit,
  RecipeCycleError,
  unitsPerBatch,
  batchWithPackaging,
  wouldCycle,
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

const fichas: Record<string, Recipe> = {
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
      { kind: 'recipe', recipeId: 'creamBase', quantity: 10_000, subVersionId: null },
    ],
  },
};

/**
 * O grafo das duas chaves: estas fichas são as ATUAIS, e `versoes` nasce vazio.
 *
 * Vazio é o caso de quem não carimbou nada — a linha da base aqui tem `subVersionId: null`, que
 * o resolvedor lê como "a mais nova". Os testes que provam o CARIMBO montam `versoes` de
 * propósito, e é a diferença entre os dois que mede a coisa.
 */
const recipes = { atual: fichas, versoes: {} };

/** O mesmo grafo com UMA ficha trocada — o molde de "e se a perda fosse zero?". */
function comFicha(id: string, troca: Partial<Recipe>) {
  return { atual: { ...fichas, [id]: { ...fichas[id], ...troca } }, versoes: {} };
}

test('loss makes the unit cost go up, not down', () => {
  const withLoss = costRecipe('strawberry', recipes, itemCosts);
  const noLoss = costRecipe('strawberry', comFicha('strawberry', { lossFraction: 0 }), itemCosts, {}, new Map());

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
      lines: [{ kind: 'recipe', recipeId: 'b', quantity: 10, subVersionId: null }],
    },
    b: {
      id: 'b',
      versionId: 'b-v',
      version: 1,
      effectiveFrom: '2026-01-01',
      yieldAmount: 100,
      yieldUnit: 'ml',
      lossFraction: 0,
      lines: [{ kind: 'recipe', recipeId: 'a', quantity: 10, subVersionId: null }],
    },
  };

  assert.throws(() => costRecipe('a', { atual: looping, versoes: {} }, itemCosts), RecipeCycleError);
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
  assert.equal(costPerProductUnit(cost, 75, { itemsRate: 2 as Rate }) - soMassa, 2);

  // E as duas metades somam: o que sai do estoque mais o que foi digitado.
  assert.equal(costPerProductUnit(cost, 75, { itemsRate: 2 as Rate, typedRate: rate(0.03, 1) }) - soMassa, 5);

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
    comFicha('strawberry', { version: 3, lossFraction: 0.08 }),
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
  /**
   * A conta inteira na mão, porque as duas asserções daqui eram `>` — e `>` não mede a
   * travessia da sub-receita, mede que ela não deu zero.
   *
   * Três bateladas de morango:
   *   polpa      18.000 × 3                                    = 54.000 g
   *   açúcar     6.000 × 3 direto                              = 18.000 g
   *   a base     10.000 ml × 3 = 30.000 ml pedidos de base
   *   a base rende 20.000 ml sem perda, então são 1,5 bateladas de base
   *   açúcar     + 3.000 × 1,5 dentro da base                  =  4.500 g
   *   leite      2.000 × 1,5                                   =  3.000 g
   *
   * O açúcar chega pelos DOIS caminhos e a soma é 22.500 g. Com `> 18.000` a asserção passava
   * com qualquer grão a mais — inclusive com a base entrando uma vez em vez de uma e meia, que
   * é o defeito plausível de quem arredondar batelada para cima.
   */
  const needs = explodeRequirements('strawberry', 3, recipes);

  assert.equal(needs.get('strawberryPulp'), 54_000, '18.000 g de polpa por batelada, três bateladas');
  assert.equal(
    needs.get('sugar'),
    22_500,
    'o açúcar chega direto (18.000 g) e DENTRO da base (3.000 × 1,5 = 4.500 g): 22.500 g',
  );
  assert.equal(
    needs.get('milkPowder'),
    3_000,
    'o leite em pó só existe dentro da base: 2.000 g × 1,5 batelada de base',
  );
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

  const cost = costRecipe('tiny', { atual: graph, versoes: {} }, costs);

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

  const cost = costRecipe('odd', { atual: graph, versoes: {} }, costs);
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

  const cost = costRecipe('mix', { atual: graph, versoes: {} }, costs);
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
      lines: [{ kind: 'recipe', recipeId: 'creamBase', quantity: 4_000, subVersionId: null }],
    },
  };

  // Silence here is the failure that looks like success: the popsicle would
  // simply come out cheaper, and every product standing on it with it.
  assert.throws(
    () => costRecipe('popsicle', { atual: orphan, versoes: {} }, {}),
    (e: unknown) => e instanceof MissingRecipeError && String(e.message).includes('creamBase'),
  );
});

/**
 * E a ficha da RAIZ ausente, que é a outra metade e a oficina achou sozinha.
 *
 * O teste acima prova a SUB-receita que não está lá. Este prova a de cima: pedir o custo
 * de uma ficha que o grafo não tem. A diferença importa porque os dois caminhos são linhas
 * diferentes (`costRecipe` e `explodeRequirements` cada um com o seu `if (!recipe)`), e o
 * `mutate` mostrou que a segunda estava sem guarda: trocado o `throw` por um custo ZERO, a
 * suíte inteira ficou verde.
 *
 * O que isso deixa acontecer, e é por isso que a resposta certa é levantar: um semi-acabado
 * apagado faz todo sabor que o compõe ficar **mais barato**, calado, e o número errado vira
 * o denominador de toda margem. Devolver zero é pior que quebrar, porque zero parece resposta.
 *
 * Alcançável na prática: `products.recipe_id` aponta para a ficha, e a tela pede o custo pelo
 * id do produto — apagada a ficha, o grafo não a tem e o id continua no produto.
 */
test('a ficha que não está no grafo para a conta em vez de custar zero', () => {
  const vazio = { atual: {}, versoes: {} };

  assert.throws(
    () => costRecipe('ficha-apagada', vazio, {}),
    (e: unknown) => e instanceof MissingRecipeError && String(e.message).includes('ficha-apagada'),
    'pedir o custo de uma ficha ausente levanta e diz qual: zero custo faria todo sabor que a ' +
      'compõe ficar mais barato sem uma palavra',
  );

  assert.throws(
    () => explodeRequirements('ficha-apagada', 1, vazio),
    (e: unknown) => e instanceof MissingRecipeError && String(e.message).includes('ficha-apagada'),
    'explodir uma ficha ausente levanta e diz qual: lista de insumos vazia lê como "não precisa ' +
      'de nada" e libera a produção',
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
  const cost = costRecipe('base', { atual: priced, versoes: {} }, { sugar: 0.472 as Rate });
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
  const juntos = costPerProductUnit(cost, 75, { typedRate: rotulo, itemsRate: 0.5 as Rate });
  assert.equal(juntos - soMassa, 1, 'nove décimos arredondam para um centavo, uma vez');
});

test('os dois números da tela de Receitas fecham entre si', () => {
  // A tela mostra uma figura por unidade e, ao lado, o que o lote inteiro custa.
  // O docblock dela promete que a segunda é a conta que formou a primeira. Até
  // 9 de setembro não era: o lote saía só com a massa, e dividir um pelo outro
  // dava um número diferente do que estava escrito ao lado.
  const cost = costRecipe('strawberry', recipes, itemCosts);
  const embalagem = { typedRate: (itemCosts.stick + itemCosts.wrapper) as Rate };
  const porUnidade = costPerProductUnit(cost, 75, embalagem);
  const unidades = unitsPerBatch(cost, 75);
  const lote = batchWithPackaging(cost, 75, embalagem);

  assert.equal(
    Math.round(lote / unidades),
    porUnidade,
    `o lote de ${lote} dividido por ${unidades} unidades não devolve os ${porUnidade} ` +
      'centavos que a tela mostra na figura',
  );

  // E a régua distingue: o número ANTIGO (só a massa) não fecha.
  assert.notEqual(
    Math.round(cost.batchCents / unidades),
    porUnidade,
    'se a massa sozinha também fechasse, este teste não estaria medindo nada',
  );
});

test('o lote com embalagem é a massa mais a embalagem de cada unidade', () => {
  const cost = costRecipe('strawberry', recipes, itemCosts);
  const unidades = unitsPerBatch(cost, 75);
  assert.equal(batchWithPackaging(cost, 75), cost.batchCents, 'sem embalagem, é a massa');
  assert.equal(
    batchWithPackaging(cost, 75, { itemsRate: 2 as Rate }) - cost.batchCents,
    2 * unidades,
    'dois centavos por unidade custam dois centavos vezes as unidades da batelada',
  );
});

/**
 * A calda base do dono, e a única coisa que pode dar errado ao aninhar receita.
 *
 * O caso real veio dele em 10 de setembro: o picolé de morango usa a "calda base de
 * leite" como ingrediente, e o pote de sorvete de ameixa usa a mesma calda. Aninhar é o
 * normal da fábrica, não a exceção — o que não pode existir é o laço.
 */
const fichasDaCozinha: Record<string, Recipe> = {
  calda: {
    id: 'calda',
    versionId: 'calda-v',
    version: 1,
    effectiveFrom: '2026-01-01',
    yieldAmount: 50_000,
    yieldUnit: 'ml',
    lossFraction: 0,
    lines: [{ kind: 'item', itemId: 'leite', quantity: 40_000 }],
  },
  morango: {
    id: 'morango',
    versionId: 'morango-v',
    version: 1,
    effectiveFrom: '2026-01-01',
    yieldAmount: 264,
    yieldUnit: 'un',
    lossFraction: 0,
    lines: [
      { kind: 'recipe', recipeId: 'calda', quantity: 20_000, subVersionId: null },
      { kind: 'item', itemId: 'polpa', quantity: 5_000 },
    ],
  },
  ameixa: {
    id: 'ameixa',
    versionId: 'ameixa-v',
    version: 1,
    effectiveFrom: '2026-01-01',
    yieldAmount: 200,
    yieldUnit: 'un',
    lossFraction: 0,
    lines: [{ kind: 'recipe', recipeId: 'calda', quantity: 30_000, subVersionId: null }],
  },
};

const cozinha = { atual: fichasDaCozinha, versoes: {} };

test('a mesma calda serve duas receitas, e isso não é ciclo', () => {
  // O caso que a tela precisa OFERECER: aninhar de verdade tem de ser permitido,
  // senão a guarda vira "nunca deixa" e a fábrica não cadastra nada.
  assert.equal(wouldCycle('morango', 'calda', cozinha), false);
  assert.equal(wouldCycle('ameixa', 'calda', cozinha), false);
});

test('a receita não pode usar a si mesma, nem fechar laço por um caminho longo', () => {
  assert.equal(wouldCycle('calda', 'calda', cozinha), true, 'ela mesma');
  // A calda usando o morango fecharia calda → morango → calda. É o laço que a tela
  // tem de esconder ANTES de a pessoa escolher, não estourar depois de salvar.
  assert.equal(wouldCycle('calda', 'morango', cozinha), true, 'laço de dois passos');
});

test('grafo já quebrado não trava a tela que tenta não quebrá-lo mais', () => {
  // `seen` existe para isto: se duas OUTRAS receitas já estão em laço, perguntar
  // "posso usar esta?" tem de responder, não pendurar.
  const laco = (de: string, para: string): Recipe => ({
    ...fichasDaCozinha.calda,
    id: de,
    lines: [{ kind: 'recipe', recipeId: para, quantity: 1, subVersionId: null }],
  });
  const quebrado = {
    atual: { ...fichasDaCozinha, x: laco('x', 'y'), y: laco('y', 'x') },
    versoes: {},
  };
  assert.equal(wouldCycle('morango', 'x', quebrado), false);
});

test('receita que não existe no grafo não é ciclo, é ausência', () => {
  assert.equal(wouldCycle('morango', 'fantasma', cozinha), false);
});

/**
 * A caixa fechada arredonda UMA vez, no fim — e nada guardava isso.
 *
 * Achado pelo `mutate` em 11 de setembro, na primeira execução depois de a mutação existir:
 * embrulhar a soma em `cents(...)` ANTES de multiplicar por `unitsPerPack` passou pela
 * suíte inteira. `costPerPack` tinha **um chamador** (`app/products/new.tsx:316`) e **zero
 * testes**, com o defeito que ela conserta escrito no docblock dela.
 *
 * Os números aqui são os do defeito de verdade, copiados de lá: um picolé de **7,3265
 * centavos** numa caixa de **cinquenta**. Arredondando no fim dá R$ 3,66; arredondando
 * antes, o picolé vira 7 centavos inteiros e a caixa sai R$ 3,50 — *quatro e meio por
 * cento de margem evaporados no número que o dono usa para dar preço de caixa*, e foi
 * exatamente isso que a tela de cadastro de produto mostrou.
 *
 * A asserção é igualdade contra a conta feita à mão, não contra a função: comparar
 * `costPerPack` com qualquer coisa derivada dele seria verdadeiro para qualquer ordem de
 * arredondamento, que é o buraco que esta casa já documentou duas vezes.
 */
test('a caixa fechada arredonda uma vez, no fim — e não cinquenta vezes', () => {
  const custo = {
    recipeId: 'r1',
    version: 1,
    batchCents: cents(73_265),
    netYield: 10_000,
    // 7,3265 centavos por unidade de rendimento, com a unidade valendo um picolé.
    // Direto, e não por `rate()`: aquela função é preço-por-compra dividido por
    // unidades-por-compra, e chamá-la com um argumento só devolve NaN — o que este
    // teste acusou na primeira execução, antes de acusar qualquer coisa do código.
    perYieldUnit: 7.3265 as Rate,
    lines: [],
    lossFraction: 0,
  };

  // 7,3265 x 50 = 366,325 centavos -> 366, que é R$ 3,66.
  assert.equal(costPerPack(custo, 1, 50), 366, 'a caixa de cinquenta deixou de valer R$ 3,66');

  // E o que o defeito fazia: 7,3265 vira 7 e 7 x 50 = 350. Se um dia a função voltar a
  // arredondar antes, é ESTE número que ela devolve — a linha existe para nomeá-lo.
  assert.notEqual(costPerPack(custo, 1, 50), 350, 'voltou a arredondar o picolé antes de multiplicar: R$ 3,50 por uma caixa de R$ 3,66');

  // A embalagem da unidade entra antes da multiplicação pelo mesmo motivo: meio centavo
  // de palito por picolé é vinte e cinco centavos numa caixa de cinquenta, e some inteiro
  // se cada picolé arredondar sozinho.
  assert.equal(
    costPerPack(custo, 1, 50, { itemsRate: 0.5 as Rate }),
    391,
    'o palito de meio centavo sumiu na caixa: (7,3265 + 0,5) x 50 = 391,325',
  );
});
