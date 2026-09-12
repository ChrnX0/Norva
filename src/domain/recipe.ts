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

  const batch = cents(batchExact);

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
  const netYield = netYieldOf(recipe);
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
/**
 * O que de fato SAI do tacho, descontada a perda.
 *
 * A conta é uma linha e estava escrita em quatro lugares — o custo da ficha, a explosão
 * das sub-receitas, a previsão de embalagem e a tela do cadastro. Quatro cópias da mesma
 * multiplicação é a forma como um número diverge em silêncio: quem mexer no significado
 * de `lossFraction` num lugar deixa os outros três dizendo outra coisa. É a mesma doença
 * que a conta de dias teve, e o conserto é o mesmo — a aritmética mora no domínio, uma
 * vez, e quem precisa dela chama.
 *
 * A perda SOBE o custo unitário: o tacho é pago inteiro e menos dele chega ao cliente.
 */
export function netYieldOf(recipe: { yieldAmount: number; lossFraction: number }): number {
  return recipe.yieldAmount * (1 - recipe.lossFraction);
}

export function packagingRatePerUnit(
  items: readonly { itemId: string; quantityPerUnit: number }[],
  rates: Readonly<Record<string, number>>,
): Rate {
  let total = 0;
  for (const linha of items) total += (rates[linha.itemId] ?? 0) * linha.quantityPerUnit;
  return total as Rate;
}

/**
 * Cost of one finished unit, given how much of the batch it takes.
 *
 * Packaging that belongs to the individual unit rather than to the batch (the
 * stick, the wrapper) is added here, per unit - which is exactly why it must be
 * possible to say so, instead of smearing it across the mix.
 *
 * Ela chega em duas metades, e as duas existem de propósito: `itemsRate` é a
 * embalagem que SAI DO ESTOQUE, cotada pelas notas de compra, e `typedRate` é o
 * que ninguém quis transformar em item — rótulo, fita, o valor que a fábrica
 * digita e segue. Somar as duas é o número que a produção congela, e é por isso
 * que este parâmetro é um objeto: um terceiro argumento solto seria esquecido
 * numa das cinco telas que cotam custo, e a tela passaria a prometer menos do
 * que o livro-razão guarda. Foi nesse buraco, na direção contrária, que a
 * embalagem já ficou fora do custo congelado uma vez.
 *
 * **As duas são TAXAS, e a segunda nem sempre foi.** `typedRate` se chamava
 * `cents` e era `Cents` inteiro: um rótulo a R$ 0,004 por unidade virava zero na
 * porta de entrada, e o zero ia para o custo congelado de toda corrida. A
 * distinção que este objeto guarda é de **procedência** — de onde o número veio,
 * do estoque ou do dedo de alguém —, nunca de tipo; as duas sempre foram preço
 * por unidade, que é a definição de taxa nesta casa. Fundir as duas num
 * argumento só arrumaria o tipo e jogaria fora a procedência, que é o que o
 * parágrafo acima existe para proteger.
 */
export function costPerProductUnit(
  recipeCost: RecipeCost,
  yieldPerUnit: number,
  unitPackaging: { typedRate?: Rate; itemsRate?: Rate } = {},
): Cents {
  return cents(taxaPorUnidade(recipeCost, yieldPerUnit, unitPackaging));
}

/**
 * O custo de uma unidade ANTES de arredondar — a taxa, em centavos fracionários.
 *
 * Existe para quem precisa comparar duas unidades entre si: subtrair dois valores já
 * arredondados soma dois erros de meio centavo, e uma diferença de três décimos de
 * centavo desaparece inteira. Quem quer o valor que alguém paga chama
 * `costPerProductUnit`, que arredonda uma vez; quem quer comparar chama esta.
 */
export function taxaPorUnidade(
  recipeCost: RecipeCost,
  yieldPerUnit: number,
  unitPackaging: { typedRate?: Rate; itemsRate?: Rate } = {},
): Rate {
  return (recipeCost.perYieldUnit * yieldPerUnit +
    (unitPackaging.itemsRate ?? 0) +
    (unitPackaging.typedRate ?? 0)) as Rate;
}

/**
 * O que uma embalagem FECHADA custa — e por que ela não é o custo da unidade
 * vezes o número de unidades.
 *
 * `costPerProductUnit` devolve `Cents`, que é inteiro: um picolé de 7,3265
 * centavos vira 7. Multiplicar esse 7 por cinquenta dá R$ 3,50 onde a conta é
 * R$ 3,66 — quatro e meio por cento de margem evaporados no arredondamento, no
 * número que o dono usa para dar preço de caixa. Foi assim que a tela de
 * cadastro de produto mostrou "Caixa fechada: R$ 3,50" para uma caixa de
 * R$ 3,66.
 *
 * A regra da casa já dizia o que fazer: *só o valor final arredonda, uma vez*.
 * Então a multiplicação entra ANTES do arredondamento, e é por isso que esta
 * função existe em vez de a tela multiplicar o retorno da outra.
 */
export function costPerPack(
  recipeCost: RecipeCost,
  yieldPerUnit: number,
  unitsPerPack: number,
  unitPackaging: { typedRate?: Rate; itemsRate?: Rate } = {},
): Cents {
  return cents(
    (recipeCost.perYieldUnit * yieldPerUnit +
      (unitPackaging.itemsRate ?? 0) +
      (unitPackaging.typedRate ?? 0)) *
      unitsPerPack,
  );
}

/** How many finished units one batch produces, before rounding to full boxes. */
export function unitsPerBatch(recipeCost: RecipeCost, yieldPerUnit: number): number {
  if (yieldPerUnit <= 0) return 0;
  return Math.floor(recipeCost.netYield / yieldPerUnit);
}

/**
 * O que a batelada inteira custa — a massa MAIS a embalagem que ela consome.
 *
 * Existe porque a tela de Receitas mostrava dois números que não fechavam, e o
 * docblock dela prometia o contrário: *"o número dela em figura e a conta aberta
 * ao lado (por unidade de qual produto, e quanto custa o lote inteiro)"*. A
 * figura era o custo por unidade COM embalagem (R$ 0,64 no picolé de morango) e
 * o lote ao lado era `batchCents`, que é só a massa (R$ 299,99). Quem fizesse a
 * conta na mão — e a regra da casa manda fazer — achava 0,59 e concluía que uma
 * das duas estava errada. Nenhuma estava: eram contas de coisas diferentes com
 * nomes que prometiam ser a mesma.
 *
 * O conserto certo é este e não abaixar a figura: quem paga a batelada paga o
 * palito e o saco junto, então o número maior é também o verdadeiro. E ele
 * reconcilia — 325,29 dividido por 506 dá 0,6429, que é a figura na tela.
 *
 * As unidades são as do `unitsPerBatch`, que arredonda para baixo: meia unidade
 * não recebe embalagem porque meia unidade não sai da fábrica.
 */
export function batchWithPackaging(
  recipeCost: RecipeCost,
  yieldPerUnit: number,
  unitPackaging: { typedRate?: Rate; itemsRate?: Rate } = {},
): Cents {
  const porUnidade = (unitPackaging.itemsRate ?? 0) + (unitPackaging.typedRate ?? 0);
  return cents(recipeCost.batchCents + porUnidade * unitsPerBatch(recipeCost, yieldPerUnit));
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
): { deltaCents: Cents; cheaper: boolean; percent: number | null } {
  /**
   * **A diferença sai das TAXAS, e arredonda uma vez.**
   *
   * Antes ela era `cents(depois) - cents(antes)`: dois arredondamentos entrando numa
   * subtração, e o erro de cada um vale meio centavo. Uma ficha que passou de 7,3265 para
   * 7,0 centavos por unidade — três décimos mais barata — saía com `delta = 0` porque as
   * duas viravam 7, e a tela dizia "não mudou" de uma mudança real. Pior: o sinal do
   * `cheaper` e o `percent` herdavam o zero, então a pessoa lia que a decisão dela não
   * teve efeito nenhum.
   *
   * Arredondar a DIFERENÇA em vez da diferença dos arredondados é a mesma regra da capa
   * deste projeto — só o valor final arredonda, uma vez — aplicada onde o valor final é o
   * delta, não as parcelas. `cheaper` e `percent` passam a sair da conta exata.
   */
  const beforeUnit = taxaPorUnidade(before, yieldPerUnit);
  const afterUnit = taxaPorUnidade(after, yieldPerUnit);
  const delta = cents(afterUnit - beforeUnit);
  return {
    deltaCents: delta,
    cheaper: delta < 0,
    /**
     * **Nulo é "não há com o que comparar", e ele não é zero.** A versão anterior
     * de uma ficha recém-criada não custa nada — ela nasce sem linha —, e este
     * campo devolvia `0` nesse caso. A tela imprimia a frase inteira com os dois
     * números juntos: *"▲ R$ 0,02 por unidade contra a versão 1 (0,0%)"*. Subiu
     * dois centavos e não mudou nada por cento, na mesma linha.
     *
     * Zero é um fato — "não mudou" —, e usá-lo para dizer "não sei" é a camada de
     * dados devolvendo frase em vez de fato. Quem não tem base devolve nulo, e a
     * tela escolhe outra frase.
     */
    percent: beforeUnit > 0 ? (afterUnit - beforeUnit) / beforeUnit : null,
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
      const netYield = netYieldOf(sub);
      const subBatches = netYield > 0 ? (line.quantity * batches) / netYield : 0;
      explodeRequirements(line.recipeId, subBatches, recipes, into, nextStack);
    }
  }

  return into;
}


/** Uma linha do plano: uma receita, quantos tachos, e o que a embalagem pede. */
export type PlanLine = {
  recipeId: string;
  batches: number;
  /**
   * Quanto de embalagem cada UNIDADE leva, e o rendimento que converte tacho em
   * unidade.
   *
   * Sem os dois, o palito e o saquinho somem da lista de compras — que é o mesmo
   * defeito que a produção já teve no custo congelado: a conta saía certa para
   * o que a receita pede e errada para o que a fábrica gasta. Aqui a unidade é
   * PREVISTA (rendimento líquido do tacho dividido pelo que cada unidade leva),
   * e prever é legítimo numa simulação — o custo congelado é que não pode
   * prever, porque ele grava o que aconteceu.
   */
  packaging?: readonly { itemId: string; quantityPerUnit: number }[];
  yieldPerUnit?: number | null;
};

/** O que um plano pede, contra o que já está na prateleira. */
export type ShoppingLine = {
  itemId: string;
  /** Quanto o plano inteiro consome deste item. */
  needed: number;
  /** Quanto existe agora, no lugar de onde a produção sai. */
  held: number;
  /** O que falta comprar. Zero quando dá para fazer sem comprar nada. */
  missing: number;
};

/**
 * A lista de compras de um plano — a conta virada do avesso.
 *
 * `explodeRequirements` responde "posso fazer isto?" para UMA corrida. Esta
 * responde a pergunta que o dono faz antes de ligar para o fornecedor: *"se eu
 * fizer três tachos de cada, o que falta?"* — vários produtos num plano só, e o
 * resultado dito como o que falta comprar em vez de o que a receita pede.
 *
 * Os dois deltas em relação ao que já existia são exatamente esses, e o segundo
 * é o que muda a decisão: "precisa de 18.000 g de polpa" não decide nada para
 * quem tem 40.000 na prateleira.
 *
 * Devolve fato, nunca frase: quantidade pedida, quantidade em casa e a
 * diferença. Quem escreve "compre dois sacos de açúcar" é a tela, que sabe a
 * embalagem de compra e fala português.
 *
 * Item que sobra continua na lista com `missing` zero — quem quer só o que falta
 * filtra, e quem quer mostrar o plano inteiro tem tudo. Esconder aqui seria a
 * camada de dados decidindo o que a tela pode dizer.
 */
export function shoppingList(
  plan: readonly PlanLine[],
  recipes: Readonly<Record<string, Recipe>>,
  onHand: ReadonlyMap<string, number>,
): ShoppingLine[] {
  // Um mapa só para o plano inteiro: é isto que soma vários produtos sem
  // inventar nada — `explodeRequirements` já acumula no mapa que recebe.
  const needed = new Map<string, number>();

  for (const line of plan) {
    if (!(line.batches > 0)) continue;
    explodeRequirements(line.recipeId, line.batches, recipes, needed);

    const recipe = recipes[line.recipeId];
    const perUnit = line.yieldPerUnit ?? 0;
    if (!recipe || perUnit <= 0 || !line.packaging?.length) continue;

    // A unidade prevista do tacho: rendimento líquido dividido pelo que cada
    // unidade leva. Meio tacho gasta metade do açúcar, mas 400 unidades gastam
    // 400 palitos — por isso a embalagem conta por unidade e não por tacho.
    const units = (netYieldOf(recipe) * line.batches) / perUnit;
    for (const wrap of line.packaging) {
      needed.set(wrap.itemId, (needed.get(wrap.itemId) ?? 0) + wrap.quantityPerUnit * units);
    }
  }

  return [...needed.entries()]
    .map(([itemId, amount]) => {
      const held = onHand.get(itemId) ?? 0;
      return { itemId, needed: amount, held, missing: Math.max(0, amount - held) };
    })
    .sort((a, b) => b.missing - a.missing);
}

/**
 * Would using `child` inside `parent` create a loop?
 *
 * `explodeRequirements` already refuses a cycle — it throws `RecipeCycleError`
 * when the stack repeats. That is the right net and the wrong moment: by then
 * the person has already saved a recipe that cannot be costed, and the screen
 * has to explain a failure instead of never offering the option. This project's
 * fifth law says an error PREVENTS rather than complains, and prevention needs
 * the question asked before the choice is shown, not after it is made.
 *
 * The walk is over the child's own subtree: if the parent is reachable from the
 * child, adding the child to the parent closes the loop. `seen` makes it safe on
 * a graph that is already broken — a cycle among OTHER recipes must not hang the
 * screen that is trying to avoid making a new one.
 */
export function wouldCycle(
  parentId: string,
  childId: string,
  recipes: Record<string, Recipe>,
  seen: Set<string> = new Set(),
): boolean {
  if (childId === parentId) return true;
  if (seen.has(childId)) return false;
  seen.add(childId);
  const child = recipes[childId];
  if (!child) return false;
  return child.lines.some(
    (line) => line.kind === 'recipe' && wouldCycle(parentId, line.recipeId, recipes, seen),
  );
}
