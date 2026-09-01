import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CostChange, ItemWithCost, MovementRow, Product } from '@/data/repository';
import { fromDecimal, rate, type Cents, type Rate } from '@/domain/money';
import type { ItemCosts, Recipe } from '@/domain/recipe';
import { defaultLocale } from '@/i18n';
import { ask } from './index';
import { findByName, parseNumber } from './text';
import type { AssistantData, Capability, SkillContext } from './types';

/**
 * The assistant is the part of this app most able to destroy trust, because it
 * speaks in sentences and sentences sound certain. These tests hold it to the
 * two promises that make it safe: it never invents a figure, and it never
 * writes anything a person did not confirm.
 */

const ITEMS: ItemWithCost[] = [
  {
    id: 'pulp',
    kind: 'input',
    name: 'Polpa de morango',
    purchaseUnit: 'balde 10 kg',
    purchaseToBase: 10_000,
    baseUnit: 'g',
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
    averageRate: rate(12.4, 1_000),
    lastRate: rate(12.4, 1_000),
    onHandBaseUnits: 40_000,
    active: true,
  },
  {
    id: 'sugar',
    kind: 'input',
    name: 'Açúcar cristal',
    purchaseUnit: 'saco 25 kg',
    purchaseToBase: 25_000,
    baseUnit: 'g',
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
    averageRate: rate(4.72, 1_000),
    lastRate: rate(4.72, 1_000),
    onHandBaseUnits: 50_000,
    active: true,
  },
];

const PRODUCTS: Product[] = [
  {
    id: 'p1',
    itemId: 'popsicleItem',
    name: 'Picolé de morango',
    recipeId: 'popsicle',
    yieldPerUnit: 75,
    unitPackagingCents: fromDecimal(0.05),
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
  },
];

const RECIPES: Record<string, Recipe> = {
  popsicle: {
    id: 'popsicle',
    version: 3,
    effectiveFrom: '2026-06-01',
    yieldAmount: 40_000,
    lossFraction: 0.05,
    lines: [
      { kind: 'item', itemId: 'pulp', quantity: 18_000 },
      { kind: 'item', itemId: 'sugar', quantity: 6_000 },
    ],
  },
};

const COSTS: ItemCosts = { pulp: rate(12.4, 1_000), sugar: rate(4.72, 1_000) };

const CHANGES: CostChange[] = [
  {
    itemId: 'pulp',
    name: 'Polpa de morango',
    previousRate: rate(11.5, 1_000),
    newRate: rate(12.4, 1_000),
    observedAt: '2026-08-30T10:00:00Z',
  },
  {
    itemId: 'sugar',
    name: 'Açúcar cristal',
    previousRate: rate(4.72, 1_000),
    newRate: rate(4.72, 1_000),
    observedAt: '2026-08-20T10:00:00Z',
  },
];

/**
 * Sugar was counted on the 20th; the pulp never has been. The difference is
 * what the answer has to say out loud - a balance nobody has ever checked
 * against a shelf is a different kind of number from one that was.
 */
const MOVEMENTS: (MovementRow & { itemId: string })[] = [
  {
    itemId: 'sugar',
    id: 'm1',
    kind: 'adjustment',
    baseUnits: -500,
    unitCostRate: 0.472 as Rate,
    note: null,
    occurredAt: '2026-08-20T09:00:00Z',
  },
  {
    itemId: 'sugar',
    id: 'm2',
    kind: 'purchase',
    baseUnits: 50_500,
    unitCostRate: 0.472 as Rate,
    note: null,
    occurredAt: '2026-08-01T09:00:00Z',
  },
];

/** Records what the assistant tried to do, so a silent write cannot hide. */
let recorded: unknown[] = [];

const data: AssistantData = {
  listItems: async () => ITEMS,
  listProducts: async () => PRODUCTS,
  loadRecipeGraph: async () => RECIPES,
  itemCosts: async () => COSTS,
  labels: async () => ({ pulp: 'Polpa de morango', sugar: 'Açúcar cristal' }),
  recentCostChanges: async () => CHANGES,
  itemMovements: async (itemId) => MOVEMENTS.filter((m) => m.itemId === itemId),
  recordPurchase: async (input) => {
    recorded.push(input);
    return undefined;
  },
  saveItem: async (input) => {
    recorded.push(input);
    return 'new-item';
  },
  recordCount: async (input) => {
    recorded.push(input);
    return undefined;
  },
};

const context = (...capabilities: Capability[]): SkillContext => ({
  data,
  capabilities: new Set(capabilities),
  locale: defaultLocale,
});

test('the number in the answer is the one the engine computed', async () => {
  const answer = await ask('quanto custa o picolé de morango', context('view_cost'));

  // 18,000 x 1.24 + 6,000 x 0.472 = 25,152 cents over 38,000 ml = 0.6619 / ml,
  // x 75 ml = 50 cents of mix, plus 5 cents of packaging.
  assert.match(answer.text, /R\$\s*0,55/);
  assert.ok(answer.detail?.some((d) => d.label === 'Massa'));
  assert.equal(answer.route, '/recipes/popsicle');
});

test('a role without view_cost cannot get a figure out of it', async () => {
  const answer = await ask('quanto custa o picolé de morango', context('record_production'));

  assert.match(answer.text, /acesso/);
  // Not "the answer was hidden" - no figure was ever computed to hide.
  assert.equal(answer.detail, undefined);
  assert.doesNotMatch(answer.text, /\d/);
});

test('registering by talking produces a draft, never a write', async () => {
  recorded = [];
  const answer = await ask('comprei 4 baldes de polpa de morango por 496', context('place_order'));

  assert.ok(answer.draft, 'the phrase should fill a form');
  assert.equal(recorded.length, 0, 'nothing may be recorded before a human confirms');
  assert.match(answer.draft.summary, /Polpa de morango/);
  assert.match(answer.draft.summary, /R\$\s*496,00/);

  await answer.draft.apply();
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    itemId: 'pulp',
    purchaseQuantity: 4,
    baseUnits: 40_000,
    totalCents: fromDecimal(496) as Cents,
    // The sentence travels with the movement. It is the plan's condition for
    // letting the assistant write at all: "o que o assistente lançou este mês?"
    // has to be answerable, and a movement that cannot say where it came from
    // makes autonomy unauditable.
    assistantPhrase: 'comprei 4 baldes de polpa de morango por 496',
  });
});

test('"nothing changed" is said plainly instead of dressed up as an alert', async () => {
  const quiet: AssistantData = { ...data, recentCostChanges: async () => [] };
  const answer = await ask('o que mudou de preço', { ...context('view_cost'), data: quiet });

  assert.match(answer.text, /estável/);
  assert.equal(answer.detail, undefined);
});

test('what moved is ranked by how much it moved', async () => {
  const answer = await ask('o que mudou de preço', context('view_cost'));

  assert.match(answer.text, /Polpa de morango/);
  assert.match(answer.text, /subiu 7,8%/);
  assert.equal(answer.detail?.length, 1, 'an unchanged price is not a change');
});

test('a question it cannot answer offers what it does know', async () => {
  const answer = await ask('qual a previsão do tempo', context('view_cost'));

  assert.match(answer.text, /ainda não sei/i);
  assert.ok((answer.detail?.length ?? 0) > 0);
});

test('the examples offered never include skills the role cannot use', async () => {
  const answer = await ask('me ajuda', context('record_production'));
  const offered = (answer.detail ?? []).map((d) => d.value).join(' ');

  assert.doesNotMatch(offered, /custa|preço/);
});

test('it lists what is in the storeroom, with the money that is sitting there', async () => {
  const answer = await ask('quais insumos eu tenho', context('view_cost'));

  // 40,000 g of pulp at 1.24 c/g is R$ 496,00; 50,000 g of sugar at 0.472 c/g
  // is R$ 236,00.
  assert.match(answer.text, /2 itens/);
  assert.match(answer.text, /R\$\s*732,00/);
  assert.equal(answer.route, '/inputs');
  assert.equal(answer.detail?.length, 2);
});

test('asking to erase gets directions, never an erasure', async () => {
  const answer = await ask('quero apagar tudo', context('manage_company'));

  assert.match(answer.text, /Ajustes/);
  assert.equal(answer.route, '/settings');
  // The skill has no way to act: it returns words and a route, and nothing else.
  assert.equal(answer.draft, undefined);
});

test('it says how much is there, and when anyone last checked', async () => {
  const answer = await ask('quanto tem de açúcar', context('view_cost'));

  assert.match(answer.text, /50\.000 g/);
  // Law 3: the balance never appears alone. The date it was verified is what
  // turns a stored number into one somebody stood in front of.
  assert.match(answer.text, /conferido em 20\/08/);
  assert.ok(
    answer.detail?.some((d) => d.label === 'Valor parado' && /R\$\s*236,00/.test(d.value)),
  );
});

test('a shelf nobody has ever counted says so, instead of sounding certain', async () => {
  const answer = await ask('quanto tem de polpa de morango', context('view_cost'));

  assert.match(answer.text, /40\.000 g/);
  assert.match(answer.text, /Ninguém conferiu a prateleira ainda/);
});

test('how much is there is not a secret; what it is worth is', async () => {
  // The quantity is not money, so an operator gets it. The value is money, and
  // that line is never assembled - there is no figure in the answer to leak.
  const answer = await ask('quanto tem de açúcar', context('record_production'));

  assert.match(answer.text, /50\.000 g/, 'the quantity belongs to whoever works there');
  assert.ok(
    !answer.detail?.some((d) => d.label === 'Valor parado'),
    'someone without view_cost was handed the money',
  );
});

test('counting by talking fills a form and stops, whatever the difference', async () => {
  recorded = [];

  // Two sacks of 25 kg is exactly what the ledger holds.
  const agrees = await ask('contei 2 sacos de açúcar', context('adjust_stock'));
  assert.ok(agrees.draft, 'the phrase should fill a form');
  assert.equal(recorded.length, 0, 'a stock adjustment may never be written unconfirmed');
  assert.match(agrees.draft.summary, /50\.000 g de Açúcar cristal/);
  assert.match(agrees.draft.summary, /Bate com o que o sistema esperava/);

  // One sack is 25 kg short, and the summary has to say so in words.
  const short = await ask('contei 1 saco de açúcar', context('adjust_stock'));
  assert.ok(short.draft);
  assert.match(short.draft.summary, /Estão faltando 25\.000 g/);
  assert.match(short.draft.summary, /nada é apagado/);
  assert.equal(recorded.length, 0);

  await short.draft.apply();
  assert.deepEqual(recorded, [
    {
      itemId: 'sugar',
      countedBaseUnits: 25_000,
      // A count corrected by talking carries the words that corrected it. The
      // difference the ledger keeps is only defensible if somebody can see
      // where it came from months later.
      assistantPhrase: 'contei 1 saco de açúcar',
    },
  ]);
});

test('counting is refused to a role that may not adjust stock', async () => {
  recorded = [];
  const answer = await ask('contei 2 sacos de açúcar', context('record_production'));

  assert.ok(!answer.draft, 'no form for someone who may not change a balance');
  assert.equal(recorded.length, 0);
});

test('it finds the item by the word people actually type', () => {
  assert.equal(findByName(ITEMS, 'morango')?.id, 'pulp');
  assert.equal(findByName(ITEMS, 'acucar')?.id, 'sugar', 'accents must not matter');
  assert.equal(findByName(ITEMS, 'AÇÚCAR CRISTAL')?.id, 'sugar');
  assert.equal(findByName(ITEMS, 'parafuso'), null);
});

test('it reads a number however it was typed', () => {
  assert.equal(parseNumber('1.250,40'), 1250.4);
  assert.equal(parseNumber('1250.40'), 1250.4);
  assert.equal(parseNumber('R$ 496'), 496);
  assert.equal(parseNumber('4'), 4);
  assert.equal(parseNumber('abc'), null);
});

/**
 * Registering an input by talking, which is the clause this project set for
 * itself: a module is finished when the assistant can answer about it AND fill
 * it in. Until now it could only answer, and the cadastro is precisely where
 * people give up - nobody types sixty inputs into a form before seeing the app
 * do anything, least of all the person this product is for.
 */

test('an input can be created by talking, and the package is read not asked', async () => {
  recorded = [];
  const answer = await ask('cadastrar polpa de açaí, balde 10 kg', context('manage_company'));

  assert.ok(answer.draft, 'the phrase should fill a form');
  assert.equal(recorded.length, 0, 'nothing may be created before a human confirms');
  assert.match(answer.draft.summary, /polpa de açaí/i);
  // 10 kg is 10000 g, worked out from what the person wrote on the sack.
  assert.match(answer.draft.summary, /10\.000 g/);

  await answer.draft.apply();
  assert.deepEqual(recorded[0], {
    kind: 'input',
    name: 'polpa de açaí',
    purchaseUnit: 'balde 10 kg',
    purchaseToBase: 10_000,
    baseUnit: 'g',
  });
});

test('a package with no size still creates the item, and says so', async () => {
  recorded = [];
  const answer = await ask('cadastrar essência de baunilha, frasco', context('manage_company'));

  assert.ok(answer.draft);
  // Honest rather than clever: a named input with no factor is useful, and
  // guessing a number that sits under every cost of that item is not.
  assert.match(answer.text, /não consegui ler o tamanho/i);
  await answer.draft.apply();
  assert.equal((recorded[0] as { purchaseToBase: number | null }).purchaseToBase, null);
});

test('creating something that already exists points at it instead', async () => {
  recorded = [];
  const answer = await ask('cadastrar polpa de morango, balde 10 kg', context('manage_company'));

  assert.equal(answer.draft, undefined, 'no draft for something that is already there');
  assert.match(answer.text, /já está cadastrado/);
  assert.equal(recorded.length, 0);
});

test('creating an input is a manage_company act, not something an operator does', async () => {
  const answer = await ask('cadastrar polpa de açaí, balde 10 kg', context('record_production'));
  assert.equal(answer.draft, undefined);
  assert.equal(recorded.length, 0);
});
