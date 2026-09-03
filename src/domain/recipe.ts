/**
 * The recipe engine - where the product's central promise lives.
 *
 * Four things are modelled here that recipe software commonly leaves out, and
 * each of them makes the cost wrong in a way nobody notices:
 *
 *   1. Packaging is an ingredient. The stick, the wrapper, the label and the
 *      box cost real money per unit. A recipe that ignores them reports a
 *      margin that does not exist.
 *   2. Loss is a first-class number. A real ice cream operation loses 3-8%
 *      between leftover mix, breakage and freezer burn. Without it the
 *      theoretical cost is always optimistic.
 *   3. Sub-recipes cascade. A cream base used by eight flavours must be an
 *      ingredient of eight recipes, so that when milk goes up, all eight
 *      recalculate on their own.
 *   4. Batch yield is separate from the product conversion. A recipe yields
 *      *mix* (40 L); a product is a portion of that mix (75 ml). Keeping them
 *      apart is what lets the same batch become a popsicle, a 2L tub and a
 *      small cup - and it is precisely where the category leader stumbles,
 *      according to its own users' reviews about liquid inputs.
 */

import { allocateByWeight, cents, rateFromCents, type Cents, type Rate } from './money';

/** A line of a recipe: either a raw item or another recipe. */
export type RecipeLine =
  | { kind: 'item'; itemId: string; quantity: number }
  | { kind: 'recipe'; recipeId: string; quantity: number };

export type Recipe = {
  id: string;
  /**
   * The identity of THIS version, not of the recipe.
   *
   * The line below has promised since the beginning that production records
   * which version it used - and it was impossible: the query selected
   * `recipe_versions.id` and then mapped `id: v.recipe_id`, so the version's
   * own identity never left the data layer and this type had nowhere to put
   * it. A promise in a doc comment with no field behind it.
   */
  versionId: string;
  /** Versions are numbered and kept. Production records which one it used, so
   *  historical cost stays correct after the formula changes. */
  version: number;
  effectiveFrom: string;
  lines: RecipeLine[];
  /** What one run yields, in the recipe's own measure (millilitres, grams). */
  yieldAmount: number;
  /**
   * A unidade que o dono escolheu ao cadastrar: ml, g, un.
   *
   * Estava no banco e não chegava até aqui, e a falta dela é a razão de o
   * aplicativo ter inventado a palavra "tacho": sem saber a unidade, a tela não
   * tinha como dizer "cada vez rende 40 L" e passou a contar um recipiente que
   * nenhuma fábrica cadastrou. A unidade é decisão do dono, e agora ela viaja com
   * a receita.
   */
  yieldUnit: string;
  /** Expected loss as a fraction of the yield. 0.05 means 5%. */
  lossFraction: number;
};

/**
 * Cost per base unit of a raw item, as a fractional rate.
 *
 * Deliberately NOT `Cents`: pulp at R$ 12.40/kg is 1.24 cents per gram, and
 * rounding that to a whole cent loses a fifth of it before the first
 * multiplication. Rates stay fractional; only amounts get rounded.
 */
export type ItemCosts = Readonly<Record<string, Rate>>;

export type CostLine = {
  label: string;
  /** How much of it one batch uses. */
  quantity: number;
  totalCents: Cents;
  /** Share of the batch cost, 0..1. Drives "milk is 38% of this flavour". */
  share: number;
};

export type RecipeCost = {
  recipeId: string;
  version: number;
  /** Cost of one whole batch, before loss. */
  batchCents: Cents;
  /** Yield actually expected once loss is taken out. */
  netYield: number;
  /**
   * Cost per unit of net yield, as a fractional rate. A millilitre of mix costs
   * a small fraction of a cent - rounding here would collapse it to zero and
   * quietly zero out every product cost in the system.
   */
  perYieldUnit: Rate;
  /**
   * The arithmetic, kept alongside the answer. Every intelligent statement in
   * this app must be able to open its own calculation - that is what turns
   * "the app said so" into "the app is right" for someone who does not trust
   * software yet.
   */
  lines: CostLine[];
  lossFraction: number;
};

export class RecipeCycleError extends Error {
  constructor(public readonly path: string[]) {
    super(`Recipe cycle: ${path.join(' -> ')}`);
    this.name = 'RecipeCycleError';
  }
}

export class MissingRecipeError extends Error {
  constructor(public readonly recipeId: string) {
    super(`Recipe not found: ${recipeId}`);
    this.name = 'MissingRecipeError';
  }
}

/**
 * Cost of one batch and of one unit of yield.
 *
 * Sub-recipes are resolved depth-first with memoisation, and a cycle raises
 * rather than hanging - a recipe that contains itself is a data error the user
 * must see, not a spinner that never stops.
 */
export function costRecipe(
  recipeId: string,
  recipes: Readonly<Record<string, Recipe>>,
  itemCosts: ItemCosts,
  labels: Readonly<Record<string, string>> = {},
  memo: Map<string, RecipeCost> = new Map(),
  stack: string[] = [],
): RecipeCost {
  const cached = memo.get(recipeId);
  if (cached) return cached;

  if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);

  const recipe = recipes[recipeId];
  if (!recipe) throw new MissingRecipeError(recipeId);

  const nextStack = [...stack, recipeId];
  const lines: CostLine[] = [];
  /** Fractional cents per line, kept fractional until the batch is settled. */
  const exactTotals: number[] = [];
  let batchExact = 0;

  for (const line of recipe.lines) {
    let unitRate: Rate;
    let label: string;

    if (line.kind === 'item') {
      unitRate = itemCosts[line.itemId] ?? (0 as Rate);
      label = labels[line.itemId] ?? line.itemId;
    } else {
      const sub = costRecipe(line.recipeId, recipes, itemCosts, labels, memo, nextStack);
      unitRate = sub.perYieldUnit;
      label = labels[line.recipeId] ?? line.recipeId;
    }

    // Deliberately not rounded here. Rounding each line and summing afterwards
    // was the mistake: ten ingredients at four tenths of a cent each summed to
    // nothing while the batch really cost four cents, and every product built
    // on the recipe came out understated with the arithmetic looking sane at
    // every step. This project's rule is that only the final value rounds, and
    // the batch is the final value.
    const exact = unitRate * line.quantity;
    exactTotals.push(exact);
    batchExact += exact;
    lines.push({ label, quantity: line.quantity, totalCents: cents(0), share: 0 });
  }

  const batch = cents(Math.round(batchExact));

  // The lines shown under the figure add up to it exactly, because a
  // breakdown that disagrees with the number it explains is worse than no
  // breakdown at all.
  const shown = allocateByWeight(batch, exactTotals);
  lines.forEach((line, index) => {
    line.totalCents = shown[index];
    line.share = batchExact > 0 ? exactTotals[index] / batchExact : 0;
  });

  // Loss raises the unit cost: the batch is paid for in full, but less of it
  // reaches a customer.
  const netYield = recipe.yieldAmount * (1 - recipe.lossFraction);
  const perYieldUnit = netYield > 0 ? rateFromCents(batch, netYield) : (0 as Rate);

  const result: RecipeCost = {
    recipeId,
    version: recipe.version,
    batchCents: batch,
    netYield,
    perYieldUnit,
    lines,
    lossFraction: recipe.lossFraction,
  };

  memo.set(recipeId, result);
  return result;
}

/**
 * O que a embalagem listada custa por unidade produzida, em centavos fracionários.
 *
 * Nunca arredonda: um palito a R$ 0,012 arredondado para inteiro é um palito de
 * graça ou um palito pela metade, e a corrida de quinhentas unidades erra por R$
 * 6 — o mesmo defeito que a polpa a R$ 12,40/kg já custou aqui. Quem arredonda é
 * `costPerProductUnit`, uma vez, no fim.
 */
export function packagingRatePerUnit(
  items: readonly { itemId: string; quantityPerUnit: number }[],
  rates: Readonly<Record<string, number>>,
): number {
  let total = 0;
  for (const linha of items) total += (rates[linha.itemId] ?? 0) * linha.quantityPerUnit;
  return total;
}

/**
 * Cost of one finished unit, given how much of the batch it takes.
 *
 * Packaging that belongs to the individual unit rather than to the batch (the
 * stick, the wrapper) is added here, per unit - which is exactly why it must be
 * possible to say so, instead of smearing it across the mix.
 *
 * Ela chega em duas metades, e as duas existem de propósito: `itemsRate` é a
 * embalagem que SAI DO ESTOQUE, cotada pelas notas de compra, e `cents` é o que
 * ninguém quis transformar em item — rótulo, fita, o valor que a fábrica digita
 * e segue. Somar as duas é o número que a produção congela, e é por isso que
 * este parâmetro é um objeto: um terceiro argumento solto seria esquecido numa
 * das cinco telas que cotam custo, e a tela passaria a prometer menos do que o
 * livro-razão guarda. Foi nesse buraco, na direção contrária, que a embalagem já
 * ficou fora do custo congelado uma vez.
 */
export function costPerProductUnit(
  recipeCost: RecipeCost,
  yieldPerUnit: number,
  unitPackaging: { cents?: Cents; itemsRate?: number } = {},
): Cents {
  return cents(
    recipeCost.perYieldUnit * yieldPerUnit +
      (unitPackaging.itemsRate ?? 0) +
      (unitPackaging.cents ?? 0),
  );
}

/** How many finished units one batch produces, before rounding to full boxes. */
export function unitsPerBatch(recipeCost: RecipeCost, yieldPerUnit: number): number {
  if (yieldPerUnit <= 0) return 0;
  return Math.floor(recipeCost.netYield / yieldPerUnit);
}

/**
 * Compares two versions of the same recipe so the app can say what changed in
 * plain language: "v4 came out R$ 0.03 cheaper per unit than v3". The user sees
 * the effect of their own decision, with a number attached.
 */
export function compareVersions(
  before: RecipeCost,
  after: RecipeCost,
  yieldPerUnit: number,
): { deltaCents: Cents; cheaper: boolean; percent: number } {
  const beforeUnit = costPerProductUnit(before, yieldPerUnit);
  const afterUnit = costPerProductUnit(after, yieldPerUnit);
  const delta = cents(afterUnit - beforeUnit);
  return {
    deltaCents: delta,
    cheaper: delta < 0,
    percent: beforeUnit > 0 ? delta / beforeUnit : 0,
  };
}

/**
 * Explodes a production plan into raw item requirements, walking through
 * sub-recipes. This is the query behind the shopping list that writes itself,
 * and behind the warning that arrives before a run starts rather than after.
 */
export function explodeRequirements(
  recipeId: string,
  batches: number,
  recipes: Readonly<Record<string, Recipe>>,
  into: Map<string, number> = new Map(),
  stack: string[] = [],
): Map<string, number> {
  if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);

  const recipe = recipes[recipeId];
  if (!recipe) throw new MissingRecipeError(recipeId);

  const nextStack = [...stack, recipeId];

  for (const line of recipe.lines) {
    if (line.kind === 'item') {
      into.set(line.itemId, (into.get(line.itemId) ?? 0) + line.quantity * batches);
    } else {
      const sub = recipes[line.recipeId];
      if (!sub) throw new MissingRecipeError(line.recipeId);
      // The parent asks for `quantity` units of the sub-recipe's *net* yield,
      // so convert that into how many sub-batches must actually be made.
      const netYield = sub.yieldAmount * (1 - sub.lossFraction);
      const subBatches = netYield > 0 ? (line.quantity * batches) / netYield : 0;
      explodeRequirements(line.recipeId, subBatches, recipes, into, nextStack);
    }
  }

  return into;
}
