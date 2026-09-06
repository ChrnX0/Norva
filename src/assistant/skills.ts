import { nowIso } from '@/data/db';
import { dayWindow } from '@/domain/day';
import { packSize } from '@/domain/measure';
import { purchaseToBaseUnits } from '@/data/repository';
import { fromDecimal } from '@/domain/money';
import {
  costPerProductUnit,
  costRecipe,
  packagingRatePerUnit,
  shoppingList,
} from '@/domain/recipe';
import { formatDayMonth, formatMoney, formatPercent, formatQuantity } from '@/i18n';
import { findByName, movePhrase, namesakes, normalize, parseNumber } from './text';
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

/**
 * A resposta quando o termo alcança mais de um cadastro.
 *
 * Não é erro e não é "não existe": é a pergunta de volta, com os nomes que o
 * termo alcançou. Com a grade de linha × tipo × sabor, "morango" passa a
 * alcançar doze produtos, e escolher um deles calado grava a receita errada.
 */
function whichOne<T extends { name: string }>(matches: readonly T[], term: string): Answer {
  return {
    text: `"${term.trim()}" alcança ${matches.length} cadastros. Qual deles?`,
    // As opções da própria pergunta, e não a conta de nada.
    list: matches.slice(0, 8).map((m) => ({ label: m.name })),
  };
}

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
      const unit = costPerProductUnit(cost, product.yieldPerUnit, {
        typedRate: product.unitPackagingRate,
        itemsRate: packagingRatePerUnit(product.packagingItems, costs),
      });
      const mix = costPerProductUnit(cost, product.yieldPerUnit);

      return {
        text: `${product.name} custa ${formatMoney(unit, ctx.locale)} por unidade.`,
        detail: [
          { label: 'Massa', value: formatMoney(mix, ctx.locale) },
          { label: 'Embalagem', value: formatMoney(product.unitPackagingRate, ctx.locale) },
          { label: 'Custo do lote', value: formatMoney(cost.batchCents, ctx.locale) },
          {
            label: 'Perda prevista',
            value: formatPercent(cost.lossFraction, ctx.locale),
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

    const ambiguos = [...namesakes(products, term), ...namesakes(items, term)];
    if (ambiguos.length > 0) return whichOne(ambiguos, term);

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
        `O maior foi ${worst.name}, que ${movePhrase(change, ctx.locale)}.`,
      detail: moved.map((c) => ({
        label: c.name,
        value: movePhrase((c.newRate - (c.previousRate ?? 0)) / (c.previousRate || 1), ctx.locale),
      })),
      route: '/purchase',
    };
  },
};

/** "o que mais pesa no picolé de morango" - where the money actually goes. */
/** "quanto saiu hoje" - o que o tacho pôs para fora, e contra o que se compara. */
const producedToday: Skill = {
  id: 'produced_today',
  example: 'quanto saiu hoje',
  match: (q) =>
    normalize(q).match(
      /(?:quanto|quantos|o que).*(?:saiu|sa[ií]ram|produz(?:i|iu|imos)).*(?:hoje)?|produ[cç][aã]o de hoje/,
    ),
  run: async (_m, ctx) => {
    const hoje = dayWindow(nowIso(), ctx.locale.timeZone);
    const antes = dayWindow(nowIso(), ctx.locale.timeZone, -7);

    const [feito, comparado] = await Promise.all([
      ctx.data.productionOn(hoje.from, hoje.to),
      ctx.data.productionOn(antes.from, antes.to),
    ]);

    const total = feito.reduce((n, r) => n + r.baseUnits, 0);
    const entao = comparado.reduce((n, r) => n + r.baseUnits, 0);

    if (total === 0) {
      // Nada saiu ainda é resposta, e não falha. A tela da capa diz o mesmo.
      return { text: 'Nada saiu do tacho hoje ainda.', route: '/production' };
    }

    const diferenca = total - entao;
    const comparacao =
      entao === 0
        ? 'Não há semana passada para comparar.'
        : diferenca === 0
          ? 'O mesmo que no mesmo dia da semana passada.'
          : `${formatQuantity(Math.abs(diferenca), ctx.locale)} ${diferenca > 0 ? 'a mais' : 'a menos'} que no mesmo dia da semana passada.`;

    return {
      text: `Saíram ${formatQuantity(total, ctx.locale)} unidades hoje. ${comparacao}`,
      detail: feito.map((r) => ({
        label: r.name,
        value: `${formatQuantity(r.baseUnits, ctx.locale)} unidades`,
      })),
      route: '/production',
    };
  },
};

/**
 * As cinco palavras da perda, em português.
 *
 * Cravadas aqui de propósito, e a decisão está no topo de `index.ts`: este
 * assistente é honestamente monolíngue, porque casar frase por expressão
 * regular só funciona numa língua. Traduzir as respostas e deixar as perguntas
 * em português seria meio trabalho disfarçado de internacionalização - as telas
 * é que falam três idiomas.
 */
const MOTIVO: Record<string, string> = {
  expired: 'coisa vencida',
  melted: 'coisa derretida',
  broken: 'coisa quebrada',
  courtesy: 'cortesia',
  internal_use: 'consumo interno',
};

/** "o que a gente perdeu" - onde o dinheiro que some está indo. */
const whatWasLost: Skill = {
  id: 'what_was_lost',
  example: 'o que a gente perdeu esse mês',
  requires: 'view_cost',
  match: (q) =>
    normalize(q).match(/(?:o que|quanto).*(?:perde|perdi|perdeu|perdemos)|perdas?( do| deste| desse)? (?:mes|mês|periodo)/),
  run: async (_m, ctx) => {
    const hoje = dayWindow(nowIso(), ctx.locale.timeZone);
    const inicio = dayWindow(nowIso(), ctx.locale.timeZone, -29);
    const perdas = await ctx.data.lossesOn(inicio.from, hoje.to);

    if (perdas.length === 0) {
      // Nada perdido é resposta, e boa. Inventar um alerta aqui ensinaria a
      // ignorar o alerta de quando houver.
      return { text: 'Nenhuma perda registrada nos últimos 30 dias.', route: '/losses' };
    }

    const total = perdas.reduce((n, p) => n + p.valueCents, 0);

    // Por motivo, porque é o motivo que muda a decisão: derreteu manda olhar o
    // freezer, venceu manda olhar a compra.
    const porMotivo = new Map<string, number>();
    for (const p of perdas) porMotivo.set(p.reason, (porMotivo.get(p.reason) ?? 0) + p.valueCents);
    const pior = [...porMotivo.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      text:
        `Você perdeu ${formatMoney(total, ctx.locale)} em 30 dias. ` +
        `O que mais pesou foi ${MOTIVO[pior[0]] ?? pior[0]}, com ${formatMoney(pior[1], ctx.locale)}.`,
      detail: perdas.slice(0, 5).map((p) => ({
        label: p.name,
        value: `${formatMoney(p.valueCents, ctx.locale)} · ${MOTIVO[p.reason] ?? p.reason}`,
      })),
      route: '/losses',
    };
  },
};

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
    if (!product) {
      const ambiguos = namesakes(products, m[1]);
      if (ambiguos.length > 0) return whichOne(ambiguos, m[1]);
    }
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

    // The same conversion the purchase screen calls. It was typed by hand here
    // as well, which made three copies of one rule: screen, repository, and
    // assistant. Three copies agree until one is corrected, and then the
    // assistant answers a different number than the screen for the same
    // invoice - which is exactly the credibility this product cannot spend.
    const baseUnits = purchaseToBaseUnits(item, packs);
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
            assistantPhrase: ctx.question,
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
    // Instrução, não aritmética: fica na tela em vez de esperar um toque.
    list: [
      { label: 'Uma área', value: 'compras, receitas, produtos ou insumos' },
      { label: 'Tudo', value: 'e o exemplo não volta sozinho depois' },
      { label: 'Voltar atrás', value: 'não tem — por isso a confirmação é por extenso' },
    ],
    route: '/settings',
  }),
};

/** Skills are ordered: the most specific phrasing gets first refusal. */
/**
 * "quanto tem de açúcar" - the question the storeroom is for.
 *
 * The quantity is not money, so everyone may have it. What it is *worth* is,
 * so that line is assembled only for someone who may see cost - decided here,
 * before the sentence exists, rather than by leaving a figure out of the text
 * and hoping. Same principle as the capability gate on a whole skill, applied
 * to one line of an answer.
 *
 * Law 3: no number appears alone. A balance without the date it was last
 * checked is a number asking to be trusted, and this one says outright when
 * nobody has ever counted it.
 */
const stockOfInput: Skill = {
  id: 'stock_of_input',
  example: 'quanto tem de açúcar',
  match: (q) =>
    normalize(q).match(
      /(?:quantos?\s+(?:tem|tenho|resta|restam|sobra|sobrou|sobraram)|estoque\s+(?:de|do|da))\s+(?:de\s+)?(?:o |a |os |as )?(.+)/,
    ),
  run: async (m, ctx) => {
    const items = await ctx.data.listItems();
    const item = findByName(items, m[1]);
    if (!item) return { text: `Não encontrei "${m[1].trim()}" no almoxarifado.` };

    const held = `${formatQuantity(item.onHandBaseUnits, ctx.locale)} ${item.baseUnit}`;
    const movements = await ctx.data.itemMovements(item.id, 20);
    const counted = movements.find((mv) => mv.kind === 'adjustment');

    const detail = [{ label: 'Em estoque', value: held }];

    detail.push({
      label: 'Última conferência',
      value: counted
        ? formatDayMonth(counted.occurredAt, ctx.locale)
        : 'ninguém conferiu ainda',
    });

    if (ctx.capabilities.has('view_cost')) {
      detail.push({
        label: 'Valor parado',
        value: formatMoney(Math.round(item.averageRate * item.onHandBaseUnits), ctx.locale),
      });
    }

    if (item.purchaseUnit && item.purchaseToBase) {
      detail.push({
        label: 'Dá quantos ' + item.purchaseUnit,
        value: formatQuantity(item.onHandBaseUnits / item.purchaseToBase, ctx.locale),
      });
    }

    return {
      text: counted
        ? `Você tem ${held} de ${item.name}, conferido em ${formatDayMonth(counted.occurredAt, ctx.locale)}.`
        : `Você tem ${held} de ${item.name}, pelas notas lançadas. Ninguém conferiu a prateleira ainda.`,
      detail,
      route: `/inputs/${item.id}`,
    };
  },
};

/**
 * "contei 2 sacos de açúcar" - counting, out loud.
 *
 * The assistant fills the form and stops. A stock adjustment sits on the floor
 * no level of autonomy may cross on its own: the count is the moment the books
 * are made to agree with a shelf, and a wrong one is believed for months.
 *
 * The number is read as packages, the way a storeroom is actually counted, and
 * the draft spells the conversion out - "2 sacos = 50.000 g" - so a
 * misunderstanding is visible before it is written rather than after.
 */
const registerCount: Skill = {
  id: 'register_count',
  example: 'contei 2 sacos de açúcar',
  requires: 'adjust_stock',
  match: (q) =>
    normalize(q).match(
      /(?:contei|conferi|tem|sobrou|sobraram|restam)\s+([\d.,]+)\s*(?:\w+\s+)?(?:de\s+)?(.+)/,
    ),
  run: async (m, ctx) => {
    const packs = parseNumber(m[1]);
    const items = await ctx.data.listItems();
    const item = findByName(items, m[2]);

    if (!item) return { text: `Não encontrei "${m[2].trim()}" no almoxarifado.` };
    if (packs === null || packs < 0) {
      return { text: 'Não entendi a quantidade. Pode repetir com o número?' };
    }

    // Em que lugares este item está de verdade.
    //
    // A decisão registrada em `src/data/assistantData.ts` dizia que o
    // assistente conta o lugar padrão "enquanto houver um só, e quando existir
    // mais de um a habilidade passa a perguntar qual". A condição chegou: as
    // telas de almoxarifado já filtram por sala. Sem esta checagem o assistente
    // compara com o total da empresa e grava a diferença no almoxarifado - a
    // mesma teleportação que a tela de detalhe tinha.
    const holding = (await ctx.data.stockByPlace()).filter((place) =>
      place.lines.some((line) => line.itemId === item.id),
    );
    if (holding.length > 1) {
      const nomes = holding.map((place) => place.locationName.trim() || 'Fábrica').join(', ');
      return {
        text: `${item.name} está em ${holding.length} lugares: ${nomes}. Conte um lugar por vez - abra o item e escolha o lugar.`,
        route: `/inputs/${item.id}`,
      };
    }

    const factor = item.purchaseToBase ?? 1;
    const countedBaseUnits = Math.round(packs * factor);
    const expected = item.onHandBaseUnits;
    const delta = countedBaseUnits - expected;

    const asWords = (n: number) => `${formatQuantity(n, ctx.locale)} ${item.baseUnit}`;
    const difference =
      delta === 0
        ? 'Bate com o que o sistema esperava.'
        : delta < 0
          ? `Estão faltando ${asWords(-delta)}.`
          : `Estão sobrando ${asWords(delta)}.`;

    return {
      text: 'Preparei a contagem. Confira antes de eu gravar.',
      detail: [
        { label: 'Item', value: item.name },
        {
          label: 'Você contou',
          value: `${formatQuantity(packs, ctx.locale)} × ${item.purchaseUnit ?? 'unidade'} = ${asWords(countedBaseUnits)}`,
        },
        { label: 'O sistema esperava', value: asWords(expected) },
        { label: 'Diferença', value: difference },
      ],
      draft: {
        kind: 'count',
        summary:
          `Registrar que você contou ${asWords(countedBaseUnits)} de ${item.name}. ` +
          `${difference} A diferença fica registrada e nada é apagado.`,
        apply: async () => {
          await ctx.data.recordCount({
            itemId: item.id,
            countedBaseUnits,
            assistantPhrase: ctx.question,
          });
        },
      },
      route: `/inputs/${item.id}`,
    };
  },
};

/**
 * "cadastrar polpa de morango, balde 10 kg" - the first thing anybody has to do,
 * and the thing that stops them.
 *
 * Nobody sets up sixty inputs on a form before seeing the app do anything, and
 * the person this product is for is the least likely to try. The clause this
 * project set for itself says a module is only finished when the assistant can
 * both answer about it and fill it in; until now it could only answer.
 *
 * The package is read, not asked for: "balde 10 kg" is 10000 g, by the same
 * function the cadastro screen uses. When it cannot be read with certainty the
 * item is still created - a named input with no factor is useful and honest,
 * and the screen it routes to is where the number gets finished.
 */
const registerInput: Skill = {
  id: 'register_input',
  example: 'cadastrar polpa de morango, balde 10 kg',
  requires: 'manage_company',
  /**
   * Matched on the RAW question, unlike every other skill here, and the reason
   * is that this one stores what it captures.
   *
   * `normalize` strips accents so that "acai" finds "açaí" - exactly right when
   * the phrase MENTIONS something that already exists. Here the phrase names
   * something new, and the normalised capture would put "polpa de acai" in the
   * person's catalogue for good. The verbs carry no accents, so a raw
   * case-insensitive match costs nothing.
   */
  match: (q) => q.match(/(?:cadastrar|cadastre|criar|crie|novo)\s+(?:insumo\s+)?(.+?)\s*,\s*(.+)$/i),
  run: async (m, ctx) => {
    const name = m[1].trim();
    const pack = m[2].trim();
    if (name.length < 2) return { text: 'Não entendi o nome do insumo.' };

    // Exact match, deliberately - not `findByName`, which falls back to any
    // shared significant word. That fallback is right when somebody MENTIONS an
    // item and wrong when deciding a name is taken: "polpa de açaí" shares
    // "polpa" with "polpa de morango", and a factory has several of them.
    const items = await ctx.data.listItems();
    const existing = items.find((i) => normalize(i.name) === normalize(name));
    if (existing) {
      return {
        text: `"${existing.name}" já está cadastrado.`,
        route: `/inputs/${existing.id}`,
      };
    }

    const baseUnit = 'g';
    const perPack = packSize(pack, baseUnit);

    return {
      text: perPack
        ? 'Preparei o cadastro. Confira antes de eu gravar.'
        : 'Preparei o cadastro. Não consegui ler o tamanho da embalagem — dá para completar depois na tela.',
      // Os campos do rascunho ficam com o rascunho, abertos: são o que vai ser
      // gravado, não a conta de uma conclusão.
      list: [
        { label: 'Nome', value: name },
        { label: 'Embalagem', value: pack },
        {
          label: 'Quanto vem dentro',
          value: perPack ? `${formatQuantity(perPack, ctx.locale)} ${baseUnit}` : 'a completar',
        },
      ],
      draft: {
        kind: 'item',
        summary:
          `Cadastrar ${name}, comprado em ${pack}` +
          (perPack ? `, com ${formatQuantity(perPack, ctx.locale)} ${baseUnit} dentro. ` : '. ') +
          'O preço não entra aqui: ele vem da primeira nota de compra.',
        apply: async () => {
          await ctx.data.saveItem({
            kind: 'input',
            name,
            purchaseUnit: pack,
            purchaseToBase: perPack,
            baseUnit,
          });
        },
      },
      route: '/inputs',
    };
  },
};


/**
 * "o que tem na loja centro" — a pergunta que só existe depois de haver lugares.
 *
 * Vem antes de `stockOfInput` no registro, e a ordem não é estética: "quanto
 * tem na loja centro" casa com as duas, e a que responde certo é esta. Quem
 * pergunta por um lugar não está perguntando por um item chamado "na loja".
 */
const stockAtPlace: Skill = {
  id: 'stock_at_place',
  example: 'o que tem na loja centro',
  match: (q) =>
    normalize(q).match(/(?:o que|quanto|quantos|que)\s+(?:tem|tenho|ha|resta|restam)\s+(?:na|no|em)\s+(.+)/),
  run: async (m, ctx) => {
    const asked = m[1].trim();
    const places = await ctx.data.stockByPlace();
    const named = await ctx.data.listPlaces();

    // O padrão nasce sem nome. Quem pergunta pela fábrica está perguntando por
    // ele, e é aqui que a palavra existe.
    const nameOf = (id: string, raw: string) =>
      raw.trim() || (id === ctx.data.defaultPlaceId() ? 'Fábrica' : id);

    const place =
      places.find((p) => normalize(nameOf(p.locationId, p.locationName)).includes(normalize(asked))) ??
      (normalize(asked).match(/fabrica|almoxarifado|estoque/)
        ? places.find((p) => p.locationId === ctx.data.defaultPlaceId())
        : undefined);

    if (!place) {
      const exists = named.some((p) => normalize(nameOf(p.id, p.name)).includes(normalize(asked)));
      return {
        text: exists
          ? `Não tem nada em ${asked} agora.`
          : `Não encontrei um lugar chamado "${asked}".`,
        route: '/places',
      };
    }

    const where = nameOf(place.locationId, place.locationName);
    const detail = place.lines.map((l) => ({
      label: l.name,
      value: `${formatQuantity(l.baseUnits, ctx.locale)} ${l.baseUnit}`,
    }));

    if (ctx.capabilities.has('view_cost')) {
      detail.push({ label: 'Valor parado', value: formatMoney(place.valueCents, ctx.locale) });
    }

    const first = place.lines[0];
    return {
      text:
        place.lines.length === 1 && first
          ? `Em ${where} tem ${formatQuantity(first.baseUnits, ctx.locale)} ${first.baseUnit} de ${first.name}.`
          : `Em ${where} tem ${place.lines.length} itens.`,
      detail,
      route: '/places',
    };
  },
};

/**
 * "onde está o açúcar" — o mesmo saldo lido pelo outro eixo.
 *
 * Uma consulta só, dois eixos: se esta habilidade tivesse SQL próprio ela
 * acabaria discordando da tela na semana em que alguém mexesse numa das duas.
 */
const whereIsItem: Skill = {
  id: 'where_is_item',
  example: 'onde está o açúcar',
  match: (q) => normalize(q).match(/onde\s+(?:esta|estao|fica|ficam|tem)\s+(?:o |a |os |as )?(.+)/),
  run: async (m, ctx) => {
    const items = await ctx.data.listItems();
    const item = findByName(items, m[1]);
    if (!item) return { text: `Não encontrei "${m[1].trim()}" no almoxarifado.` };

    const places = await ctx.data.stockByPlace();
    const nameOf = (id: string, raw: string) =>
      raw.trim() || (id === ctx.data.defaultPlaceId() ? 'Fábrica' : id);

    const spread = places
      .map((p) => ({
        where: nameOf(p.locationId, p.locationName),
        line: p.lines.find((l) => l.itemId === item.id),
      }))
      .filter((r) => r.line != null);

    if (spread.length === 0) {
      return { text: `Não tem ${item.name} em lugar nenhum agora.`, route: '/places' };
    }

    const say = (n: number) => `${formatQuantity(n, ctx.locale)} ${item.baseUnit}`;
    return {
      text:
        spread.length === 1
          ? `Todo o ${item.name} está em ${spread[0].where}: ${say(spread[0].line!.baseUnits)}.`
          : `O ${item.name} está em ${spread.length} lugares.`,
      detail: spread.map((r) => ({ label: r.where, value: say(r.line!.baseUnits) })),
      route: '/places',
    };
  },
};

/**
 * "produzi 480 picolés de morango" — a corrida do tacho, dita em voz alta.
 *
 * O número de tachos não está na frase e não é dedutível dela: 480 unidades
 * podem ser um tacho que rendeu menos ou dois que renderam muito menos, e a
 * razão entre os dois **é** o rendimento real, que é metade do valor de
 * registrar produção. Então o assistente assume um, **diz que assumiu**, e
 * ensina a frase que corrige — a suposição aparece antes de gravar, nunca
 * depois. Quem disser "em 2 tachos" é obedecido ao pé da letra.
 */
const registerProduction: Skill = {
  id: 'register_production',
  example: 'produzi 480 picolés de morango',
  requires: 'record_production',
  match: (q) =>
    normalize(q).match(
      /(?:produzi|fiz|fabriquei|sairam|rodei)\s+([\d.,]+)\s+(?:\w+\s+)??(?:de\s+)?(.+?)(?:\s+em\s+([\d.,]+)\s+tachos?)?$/,
    ),
  run: async (m, ctx) => {
    const units = parseNumber(m[1]);
    const products = (await ctx.data.listProducts()).filter((p) => p.recipeId);
    const product = findByName(products, m[2]);

    if (!product) {
      const ambiguos = namesakes(products, m[2]);
      if (ambiguos.length > 0) return whichOne(ambiguos, m[2]);
      return { text: `Não encontrei um produto chamado "${m[2].trim()}" com ficha técnica.` };
    }
    if (units === null || units <= 0) {
      return { text: 'Não entendi quantas unidades saíram. Pode repetir com o número?' };
    }

    const declarados = m[3] ? parseNumber(m[3]) : null;
    if (m[3] && (declarados === null || declarados <= 0)) {
      return { text: 'Não entendi quantos tachos foram.' };
    }

    const graph = await ctx.data.loadRecipeGraph();
    const recipe = product.recipeId ? graph[product.recipeId] : undefined;
    if (!recipe) return { text: `A receita de ${product.name} não está neste aparelho.` };

    const perUnit = product.yieldPerUnit ?? 0;
    const porTacho =
      perUnit > 0 ? Math.floor((recipe.yieldAmount * (1 - recipe.lossFraction)) / perUnit) : 0;

    /**
     * Sem tacho dito, o consumo vem do que saiu — não de um tacho suposto.
     *
     * Isto assumia `1` calado, e um tacho suposto é polpa debitada que ninguém
     * declarou: três tachos rodados e um tacho baixado deixa dois tachos de
     * polpa na prateleira que não existem mais. É a mesma inversão que o dono
     * apontou na tela, e ela estava aqui também.
     */
    const batches = declarados ?? (porTacho > 0 ? units / porTacho : 0);
    if (batches <= 0) {
      return { text: `A ficha de ${product.name} não diz quanto rende um tacho.` };
    }

    const planned = Math.floor(porTacho * batches);

    const detail = [
      { label: 'Produto', value: product.name },
      { label: 'Tachos', value: m[3] ? String(batches) : `${batches.toFixed(2)} (pelo que saiu)` },
      { label: 'Saíram', value: `${formatQuantity(units, ctx.locale)} un` },
    ];
    if (planned > 0) {
      detail.push({
        label: 'A ficha previa',
        value: `${formatQuantity(planned, ctx.locale)} un`,
      });
    }

    const assumed = m[3]
      ? ''
      : ' Contei os insumos pelo que saiu; se rodou tacho cheio, diga "em 2 tachos" que eu refaço.';

    return {
      text: 'Preparei a produção. Confira antes de eu gravar.' + assumed,
      detail,
      draft: {
        kind: 'production',
        summary:
          `Registrar ${formatQuantity(units, ctx.locale)} unidades de ${product.name}, ` +
          `em ${batches === 1 ? 'um tacho' : `${Number(batches.toFixed(2))} tachos`}. ` +
          'Os insumos saem do almoxarifado e o custo por unidade fica congelado nesta corrida.',
        apply: async () => {
          await ctx.data.recordProduction({
            productId: product.id,
            batches,
            unitsProduced: units,
            assistantPhrase: ctx.question,
          });
        },
      },
      route: '/production',
    };
  },
};

/**
 * "mandei 6000 de açúcar para a loja centro" — a carga que sai da fábrica.
 *
 * Recusa cedo e por escrito: se o lugar não existe, se o item não existe, ou se
 * não tem tanto lá, nada é preparado. Um rascunho que só falha na hora de
 * gravar é pior que nenhum, porque a pessoa já confiou nele.
 */
const registerTransfer: Skill = {
  id: 'register_transfer',
  example: 'mandei 6000 de açúcar para a loja centro',
  requires: 'dispatch',
  match: (q) =>
    normalize(q).match(
      /(?:mandei|enviei|levei|transferi|mandar)\s+([\d.,]+)\s*(?:\w+\s+)??(?:de\s+)?(.+?)\s+(?:para|pra|pro)\s+(?:a |o |as |os )?(.+)/,
    ),
  run: async (m, ctx) => {
    const amount = parseNumber(m[1]);
    const items = await ctx.data.listItems();
    const item = findByName(items, m[2]);
    const places = await ctx.data.listPlaces();
    const from = ctx.data.defaultPlaceId();

    const nameOf = (id: string, raw: string) => raw.trim() || (id === from ? 'Fábrica' : id);
    const to = places
      .filter((p) => p.id !== from)
      .find((p) => normalize(nameOf(p.id, p.name)).includes(normalize(m[3])));

    if (!item) return { text: `Não encontrei "${m[2].trim()}" no almoxarifado.` };
    if (!to) {
      return {
        text: `Não encontrei um lugar chamado "${m[3].trim()}". Cadastre ele primeiro.`,
        route: '/places',
      };
    }
    if (amount === null || amount <= 0) {
      return { text: 'Não entendi a quantidade. Pode repetir com o número?' };
    }

    const here = (await ctx.data.stockByPlace()).find((p) => p.locationId === from);
    const held = here?.lines.find((l) => l.itemId === item.id)?.baseUnits ?? 0;
    const say = (n: number) => `${formatQuantity(n, ctx.locale)} ${item.baseUnit}`;

    if (amount > held) {
      return {
        text: `Tem só ${say(held)} de ${item.name} na fábrica, e você falou em ${say(amount)}.`,
        route: '/transfer',
      };
    }

    return {
      text: 'Preparei a transferência. Confira antes de eu gravar.',
      detail: [
        { label: 'O que vai', value: item.name },
        { label: 'Quanto', value: say(amount) },
        { label: 'De onde', value: nameOf(from, '') },
        { label: 'Para onde', value: nameOf(to.id, to.name) },
        { label: 'Fica na fábrica', value: say(held - amount) },
      ],
      draft: {
        kind: 'transfer',
        summary:
          `Mandar ${say(amount)} de ${item.name} da ${nameOf(from, '')} para ${nameOf(to.id, to.name)}. ` +
          'Loja própria é transferência, não venda: o saldo muda de sala e a empresa continua com a mesma coisa.',
        apply: async () => {
          await ctx.data.recordTransfer({
            itemId: item.id,
            toLocationId: to.id,
            baseUnits: amount,
            assistantPhrase: ctx.question,
          });
        },
      },
      route: '/transfer',
    };
  },
};

/**
 * "o que falta para 3 tachos de cada" — a pergunta de antes de ligar para o
 * fornecedor.
 *
 * O aplicativo já avisava o que está acabando pela cobertura observada, que
 * responde outra coisa: *quanto tempo dura no ritmo de sempre*. Esta responde
 * pelo PLANO — vários produtos somados num pedido de compra só — e vira a conta
 * do avesso: "precisa de 18.000 g de polpa" não decide nada para quem tem
 * 40.000 na prateleira; "faltam 6.000" decide.
 *
 * Ela não escreve no livro-razão e não reserva nada: é simulação sobre o saldo
 * de agora, e o saldo continua sendo o que os movimentos somam.
 *
 * "de cada" é o plano da fábrica inteira. Sem essa palavra, o nome do produto —
 * porque quem pergunta por um sabor está planejando aquele sabor.
 */
const whatToBuy: Skill = {
  id: 'what_to_buy',
  example: 'o que falta para 3 tachos de cada',
  requires: 'view_cost',
  match: (q) =>
    normalize(q).match(
      /(?:o que|quanto|do que)\s+(?:eu\s+)?(?:falta|preciso|precisa|tenho que|tem que)\s*(?:comprar)?[^\d]*([\d.,]+)\s*tachos?\s*(?:de\s+(.+))?$/,
    ),
  run: async (m, ctx) => {
    const batches = parseNumber(m[1]);
    if (batches === null || batches <= 0) {
      return { text: 'Não entendi quantos tachos. Pode repetir com o número?' };
    }

    const products = (await ctx.data.listProducts()).filter((p) => p.recipeId);
    if (products.length === 0) {
      return { text: 'Nenhum produto tem ficha técnica ainda.', route: '/products' };
    }

    const alvo = (m[2] ?? '').trim();
    const todos = alvo === '' || /^(cada|todos|todas|tudo|cada um)$/.test(normalize(alvo));

    let plano = products;
    if (!todos) {
      const um = findByName(products, alvo);
      if (!um) {
        const ambiguos = namesakes(products, alvo);
        if (ambiguos.length > 0) return whichOne(ambiguos, alvo);
        return { text: `Não encontrei um produto chamado "${alvo}" com ficha técnica.` };
      }
      plano = [um];
    }

    const [graph, items] = await Promise.all([ctx.data.loadRecipeGraph(), ctx.data.listItems()]);
    const prateleira = new Map(items.map((i) => [i.id, i.onHandBaseUnits]));
    const nome = new Map(items.map((i) => [i.id, i]));

    const lista = shoppingList(
      plano.map((p) => ({
        recipeId: p.recipeId!,
        batches,
        yieldPerUnit: p.yieldPerUnit,
        packaging: p.packagingItems,
      })),
      graph,
      prateleira,
    );

    const faltando = lista.filter((l) => l.missing > 0);
    const dizPlano = todos
      ? `${formatQuantity(batches, ctx.locale)} tachos de cada um dos ${plano.length} produtos`
      : `${formatQuantity(batches, ctx.locale)} tachos de ${plano[0].name}`;

    // "Está tudo bem" é estado válido: uma lista de compras vazia é a melhor
    // resposta possível, e ela é dita como resposta, não como silêncio.
    if (faltando.length === 0) {
      return {
        text: `Para ${dizPlano}, não falta nada: dá para começar com o que está na prateleira.`,
        detail: lista.map((line) => ({
          label: nome.get(line.itemId)?.name ?? line.itemId,
          value: `precisa ${formatQuantity(Math.round(line.needed), ctx.locale)} de ${formatQuantity(line.held, ctx.locale)} ${nome.get(line.itemId)?.baseUnit ?? ''}`,
        })),
        route: '/inputs',
      };
    }

    return {
      text:
        `Para ${dizPlano}, faltam ${faltando.length} ` +
        `${faltando.length === 1 ? 'insumo' : 'insumos'}.`,
      detail: faltando.map((line) => {
        const item = nome.get(line.itemId);
        const unidade = item?.baseUnit ?? '';
        return {
          label: item?.name ?? line.itemId,
          value:
            `faltam ${formatQuantity(Math.round(line.missing), ctx.locale)} ${unidade} ` +
            `(precisa ${formatQuantity(Math.round(line.needed), ctx.locale)}, tem ${formatQuantity(line.held, ctx.locale)})`,
        };
      }),
      route: '/purchase',
    };
  },
};

export const phase1Skills: Skill[] = [
  registerPurchase,
  // Before the questions: "cadastrar X, Y" is somebody creating, and no
  // question in this list starts with that verb.
  registerInput,
  // Before `stockOfInput`, which also answers to "tem": a phrase carrying a
  // number is somebody counting, not somebody asking.
  registerCount,
  registerProduction,
  registerTransfer,
  // Antes de `stockOfInput`: "quanto tem na loja centro" casa com as duas, e
  // quem pergunta por um lugar não está perguntando por um item chamado "na
  // loja". Ordem é semântica aqui, não arrumação.
  stockAtPlace,
  whereIsItem,
  stockOfInput,
  eraseHelp,
  // Antes de `listInputs`: as duas falam de insumo, e quem pergunta o que FALTA
  // para um plano não está pedindo a lista do almoxarifado.
  whatToBuy,
  listInputs,
  producedToday,
  whatWasLost,
  whatDominates,
  whatMoved,
  costOfProduct,
  priceOfInput,
];
