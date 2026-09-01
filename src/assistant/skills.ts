import { fromDecimal } from '@/domain/money';
import { costPerProductUnit, costRecipe } from '@/domain/recipe';
import { formatMoney, formatQuantity } from '@/i18n';
import { findByName, movePhrase, normalize, parseNumber } from './text';
import type { Answer, Skill, SkillContext } from './types';

/**
 * What the assistant knows in phase 1.
 *
 * A module is only finished when the assistant can answer about it and fill its
 * records - otherwise the assistant is born good and drifts into being a liar
 * as the app grows past it. So these skills ship with the screens they mirror,
 * and they call the same repository functions those screens call.
 *
 * Every skill here is deterministic: the phrase selects the skill, the engine
 * computes, and the sentence is assembled around what the engine returned.
 */

/** "quanto custa o picolé de morango" - the question the owner opens with. */
const costOfProduct: Skill = {
  id: 'cost_of_product',
  example: 'quanto custa o picolé de morango',
  requires: 'view_cost',
  match: (q) =>
    normalize(q).match(
      /(?:quanto custa|custo (?:do|da|de)|qual o custo (?:do|da|de))\s+(?:o |a |os |as )?(.+)/,
    ),
  run: async (m, ctx) => {
    const term = m[1];
    const [products, graph, costs, names] = await Promise.all([
      ctx.data.listProducts(),
      ctx.data.loadRecipeGraph(),
      ctx.data.itemCosts(),
      ctx.data.labels(),
    ]);

    const product = findByName(products, term);
    if (product?.recipeId && product.yieldPerUnit) {
      const cost = costRecipe(product.recipeId, graph, costs, names);
      const unit = costPerProductUnit(cost, product.yieldPerUnit, product.unitPackagingCents);
      const mix = costPerProductUnit(cost, product.yieldPerUnit);

      return {
        text: `${product.name} custa ${formatMoney(unit, ctx.locale)} por unidade.`,
        detail: [
          { label: 'Massa', value: formatMoney(mix, ctx.locale) },
          { label: 'Embalagem', value: formatMoney(product.unitPackagingCents, ctx.locale) },
          { label: 'Custo do lote', value: formatMoney(cost.batchCents, ctx.locale) },
          {
            label: 'Perda prevista',
            value: `${(cost.lossFraction * 100).toFixed(1).replace('.', ',')}%`,
          },
        ],
        route: `/recipes/${product.recipeId}`,
      };
    }

    // Not a product - it may still be an input, and answering the nearby
    // question is better than a shrug.
    const items = await ctx.data.listItems();
    const item = findByName(items, term);
    if (item) return rateAnswer(item, ctx);

    return { text: `Não encontrei nada chamado "${term.trim()}" no cadastro.` };
  },
};

/** "quanto está o açúcar" - the price of an input, per unit of use. */
const priceOfInput: Skill = {
  id: 'price_of_input',
  example: 'quanto está o açúcar',
  requires: 'view_cost',
  match: (q) =>
    normalize(q).match(
      /(?:quanto (?:esta|ta|custa)|pre[cç]o (?:do|da|de))\s+(?:o |a |os |as )?(.+)/,
    ),
  run: async (m, ctx) => {
    const items = await ctx.data.listItems();
    const item = findByName(items, m[1]);
    if (!item) return { text: `Não encontrei "${m[1].trim()}" no almoxarifado.` };
    return rateAnswer(item, ctx);
  },
};

function rateAnswer(
  item: Awaited<ReturnType<SkillContext['data']['listItems']>>[number],
  ctx: SkillContext,
): Answer {
  const perThousand = formatMoney(Math.round(item.averageRate * 1_000), ctx.locale);
  const detail = [
    { label: 'Custo médio', value: `${perThousand} a cada 1.000 ${item.baseUnit}` },
  ];

  if (item.lastRate !== null) {
    detail.push({
      label: 'Última compra',
      value: `${formatMoney(Math.round(item.lastRate * 1_000), ctx.locale)} a cada 1.000 ${item.baseUnit}`,
    });
  }
  if (item.purchaseUnit && item.purchaseToBase) {
    detail.push({
      label: item.purchaseUnit,
      value: formatMoney(Math.round(item.averageRate * item.purchaseToBase), ctx.locale),
    });
  }

  return {
    text: `${item.name} está em ${perThousand} a cada 1.000 ${item.baseUnit}.`,
    detail,
  };
}

/** "o que mudou de preço" - the one thing the owner cannot know on their own. */
const whatMoved: Skill = {
  id: 'what_moved',
  example: 'o que mudou de preço',
  requires: 'view_cost',
  match: (q) => normalize(q).match(/(?:o que|oq) (?:mudou|subiu|caiu|aumentou)|mudan[cç]a de pre[cç]o/),
  run: async (_m, ctx) => {
    const changes = await ctx.data.recentCostChanges(5);
    const moved = changes.filter((c) => c.previousRate !== null && c.previousRate !== c.newRate);

    if (moved.length === 0) {
      // "Nothing happened" is a real answer and gets said plainly. Inventing an
      // alert to look useful teaches people to ignore the real ones.
      return { text: 'Nenhum preço mudou desde a última vez. Está tudo estável.' };
    }

    const worst = [...moved].sort((a, b) => {
      const da = Math.abs((b.newRate - (b.previousRate ?? 0)) / (b.previousRate || 1));
      const db = Math.abs((a.newRate - (a.previousRate ?? 0)) / (a.previousRate || 1));
      return da - db;
    })[0];

    const change = (worst.newRate - (worst.previousRate ?? 0)) / (worst.previousRate || 1);

    return {
      text:
        `${moved.length} ${moved.length === 1 ? 'item mudou' : 'itens mudaram'} de preço. ` +
        `O maior foi ${worst.name}, que ${movePhrase(change)}.`,
      detail: moved.map((c) => ({
        label: c.name,
        value: movePhrase((c.newRate - (c.previousRate ?? 0)) / (c.previousRate || 1)),
      })),
      route: '/purchase',
    };
  },
};

/** "o que mais pesa no picolé de morango" - where the money actually goes. */
const whatDominates: Skill = {
  id: 'what_dominates',
  example: 'o que mais pesa no picolé de morango',
  requires: 'view_cost',
  match: (q) =>
    normalize(q).match(/(?:o que mais pesa|o que pesa mais|maior custo)\s+(?:no|na|em|de|do|da)?\s*(.+)/),
  run: async (m, ctx) => {
    const [products, graph, costs, names] = await Promise.all([
      ctx.data.listProducts(),
      ctx.data.loadRecipeGraph(),
      ctx.data.itemCosts(),
      ctx.data.labels(),
    ]);

    const product = findByName(products, m[1]);
    if (!product?.recipeId) return { text: `Não encontrei a receita de "${m[1].trim()}".` };

    const cost = costRecipe(product.recipeId, graph, costs, names);
    const sorted = [...cost.lines].sort((a, b) => b.share - a.share);
    if (sorted.length === 0) return { text: `${product.name} ainda não tem ingredientes.` };

    const top = sorted[0];
    return {
      text: `${top.label} responde por ${Math.round(top.share * 100)}% do custo de ${product.name}.`,
      detail: sorted.map((line) => ({
        label: line.label,
        value: `${formatMoney(line.totalCents, ctx.locale)} · ${Math.round(line.share * 100)}%`,
      })),
      route: `/recipes/${product.recipeId}`,
    };
  },
};

/**
 * "comprei 4 baldes de polpa por 496" - registering by talking.
 *
 * The assistant fills the form; it does not record anything. Price changes are
 * on the floor no level of autonomy may cross on its own, because a wrong one
 * only surfaces months later, in a margin nobody can explain any more.
 */
const registerPurchase: Skill = {
  id: 'register_purchase',
  example: 'comprei 4 sacos de açúcar por 236',
  requires: 'place_order',
  match: (q) =>
    normalize(q).match(
      /(?:comprei|compramos|chegou|recebi)\s+([\d.,]+)\s*(?:\w+\s+)?(?:de\s+)?(.+?)\s+por\s+(?:r\$\s*)?([\d.,]+)/,
    ),
  run: async (m, ctx) => {
    const packs = parseNumber(m[1]);
    const paid = parseNumber(m[3]);
    const items = await ctx.data.listItems();
    const item = findByName(items, m[2]);

    if (!item) return { text: `Não encontrei "${m[2].trim()}" no almoxarifado.` };
    if (packs === null || packs <= 0 || paid === null || paid <= 0) {
      return { text: 'Não entendi a quantidade ou o valor. Pode repetir com os números?' };
    }

    const factor = item.purchaseToBase ?? 1;
    const baseUnits = Math.round(packs * factor);
    const totalCents = fromDecimal(paid);

    return {
      text: `Preparei o lançamento. Confira antes de eu gravar.`,
      detail: [
        { label: 'Item', value: item.name },
        {
          label: 'Quantidade',
          value: `${formatQuantity(packs, ctx.locale)} × ${item.purchaseUnit ?? 'unidade'} = ${formatQuantity(
            baseUnits,
            ctx.locale,
          )} ${item.baseUnit}`,
        },
        { label: 'Total', value: formatMoney(totalCents, ctx.locale) },
      ],
      draft: {
        kind: 'purchase',
        summary:
          `Lançar ${formatQuantity(packs, ctx.locale)} ${item.purchaseUnit ?? 'unidade'} de ` +
          `${item.name} por ${formatMoney(totalCents, ctx.locale)}. ` +
          `Isso move o custo médio e recalcula as receitas que usam esse item.`,
        apply: async () => {
          await ctx.data.recordPurchase({
            itemId: item.id,
            purchaseQuantity: packs,
            baseUnits,
            totalCents,
          });
        },
      },
      route: '/purchase',
    };
  },
};

/** "quais insumos eu tenho" - the second question anybody asks. */
const listInputs: Skill = {
  id: 'list_inputs',
  example: 'quais insumos eu tenho',
  requires: 'view_cost',
  match: (q) =>
    normalize(q).match(
      /(?:quais|quantos|liste?|lista de|meus|minhas)\s+(?:os |as )?(?:insumos|ingredientes|materiais|itens)/,
    ),
  run: async (_m, ctx) => {
    const items = await ctx.data.listItems();
    const stock = items.filter((i) => i.kind === 'input' || i.kind === 'packaging');

    if (stock.length === 0) {
      return { text: 'Ainda não há nenhum insumo cadastrado.', route: '/inputs' };
    }

    const held = stock.reduce(
      (total, item) => total + Math.round(item.averageRate * item.onHandBaseUnits),
      0,
    );
    const unpriced = stock.filter((i) => i.averageRate <= 0);

    return {
      text:
        `Você tem ${stock.length} itens cadastrados, com ${formatMoney(held, ctx.locale)} ` +
        `parado no almoxarifado.` +
        (unpriced.length > 0
          ? ` ${unpriced.length} ainda sem preço — lance a nota e o custo aparece sozinho.`
          : ''),
      detail: stock.map((item) => ({
        label: item.name,
        value:
          item.averageRate > 0
            ? `${formatMoney(Math.round(item.averageRate * 1_000), ctx.locale)} / 1.000 ${item.baseUnit}`
            : 'sem preço',
      })),
      route: '/inputs',
    };
  },
};

/**
 * "quero apagar tudo" - answered with directions, never with an action.
 *
 * Erasing sits on the floor no autonomy level crosses: it is irreversible and
 * it is exactly the kind of thing a misread sentence would do catastrophically
 * well. So the assistant explains where the button is and what it will say.
 */
const eraseHelp: Skill = {
  id: 'erase_help',
  example: 'como apago os dados de exemplo',
  requires: 'manage_company',
  match: (q) =>
    normalize(q).match(/(?:apagar|apago|limpar|limpo|zerar|zero|excluir)\s+(?:os |as |o |a )?(?:dados|tudo|exemplo|cadastro|banco)/),
  run: async (_m, _ctx) => ({
    text:
      'Isso fica em Ajustes. Dá para limpar uma área de cada vez ou tudo de uma vez, e antes de ' +
      'apagar o aplicativo conta exatamente quantos insumos, receitas e produtos vão embora.',
    detail: [
      { label: 'Uma área', value: 'compras, receitas, produtos ou insumos' },
      { label: 'Tudo', value: 'e o exemplo não volta sozinho depois' },
      { label: 'Voltar atrás', value: 'não tem — por isso a confirmação é por extenso' },
    ],
    route: '/settings',
  }),
};

/** Skills are ordered: the most specific phrasing gets first refusal. */
export const phase1Skills: Skill[] = [
  registerPurchase,
  eraseHelp,
  listInputs,
  whatDominates,
  whatMoved,
  costOfProduct,
  priceOfInput,
];
