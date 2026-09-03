/**
 * Quais peças a capa mostra, e em que ordem.
 *
 * O dono pediu widgets na tela inicial, e a capa já era isso sem se chamar
 * assim: sete cartões independentes, cada um com a sua própria fonte de dado.
 * O que faltava era a preferência — e ela tem dois donos, o que é a decisão
 * mais importante deste arquivo.
 *
 * **A ordem é da EMPRESA.** Se o dono monta a capa que quer e o operador vê
 * outra, a frase mais comum de uma fábrica — *"olha lá na tela inicial"* —
 * deixa de funcionar. Combinar o que a casa olha de manhã é decisão de casa.
 *
 * **O silenciar é do APARELHO.** Quem está na câmara fria não quer o cartão de
 * preço no caminho, e isso não muda o que a casa combinou. Os dois caminhos
 * existem, que é o que a F7 manda quando a resposta certa é "depende de quem
 * usa".
 *
 * E uma regra que impede o painel bonito e inútil: **ligar não é forçar.** Peça
 * ligada que não tem o que dizer continua não aparecendo — o cartão de caixas
 * só existe quando saiu caixa. Sem isso a capa enche de "0 caixas hoje", que é
 * a definição do alerta que ensina a ignorar alerta.
 */
export const BRIEFING_WIDGETS = [
  'producao',
  'aoVivo',
  'historico',
  'insumos',
  'cobertura',
  'pedidos',
  'entregaHoje',
  'expedicao',
  'validade',
  'perdas',
  'custo',
  'precos',
  'clima',
  'parado',
  'tacho',
] as const;

export type BriefingWidget = (typeof BRIEFING_WIDGETS)[number];

/**
 * O que NÃO entra na capa de uma fábrica nova.
 *
 * Existe por uma correção do dono, e ela vale como regra geral: o "tacho
 * rodando" ganhou lugar na capa porque o dado existia, não porque alguém abre o
 * aplicativo de manhã para ver um tacho aberto. Dado disponível não é motivo
 * para ocupar a primeira tela — a capa é o que a casa olha de manhã, e cada
 * cartão a mais empurra o resto para baixo.
 *
 * Fora do padrão não é fora do produto: quem quiser liga em Ajustes, e aí ele
 * entra na ordem da casa como qualquer outro. É a mesma forma da F7 — os dois
 * caminhos existem, e o que se escolhe aqui é só o PADRÃO.
 */
const DEFAULT_OFF = new Set<BriefingWidget>(['tacho', 'custo', 'parado']);

/**
 * A ordem que a casa combinou, filtrada pelo que este aparelho quer ver.
 *
 * Guarda duas coisas de propósito: uma peça que a empresa nunca ordenou entra
 * no fim, na ordem do catálogo, e uma peça que saiu do catálogo some da
 * preferência sem quebrar nada. É o que permite acrescentar widget novo numa
 * versão futura sem que todo mundo precise reconfigurar a capa.
 */
export function briefingLayout(
  companyOrder: readonly string[],
  hiddenOnDevice: readonly string[],
): BriefingWidget[] {
  const known = new Set<string>(BRIEFING_WIDGETS);
  const escondidas = new Set(hiddenOnDevice);

  const ordenadas = companyOrder.filter((w): w is BriefingWidget => known.has(w));

  // Peça nova entra sozinha no fim — menos as que nascem fora da capa, que
  // esperam alguém pedir. Sem essa distinção, cada widget acrescentado numa
  // versão futura aparece na tela de todo mundo sem ninguém ter escolhido.
  const novas = BRIEFING_WIDGETS.filter(
    (w) => !ordenadas.includes(w) && !DEFAULT_OFF.has(w),
  );

  return [...ordenadas, ...novas].filter((w) => !escondidas.has(w));
}

/** O que existe e não está na capa: o que a tela de Ajustes oferece para ligar. */
export function widgetsOffCover(layout: readonly BriefingWidget[]): BriefingWidget[] {
  return BRIEFING_WIDGETS.filter((w) => !layout.includes(w));
}

/**
 * Coloca uma peça na capa, no fim da ordem da casa.
 *
 * Vai para a ordem da EMPRESA e não para a preferência do aparelho, porque
 * colocar um cartão na primeira tela é decisão de casa — é o que todo mundo vai
 * ver de manhã. Esconder continua sendo do aparelho.
 */
export function addWidget(
  order: readonly BriefingWidget[],
  widget: BriefingWidget,
): BriefingWidget[] {
  return order.includes(widget) ? [...order] : [...order, widget];
}

/**
 * Move uma peça uma posição para cima ou para baixo.
 *
 * Seta em vez de arrastar, e não é preguiça: arrastar numa lista precisa de
 * pressão longa e de precisão, que é o que menos existe numa mão de luva a
 * -18°C. Duas setas grandes resolvem o mesmo problema com o polegar.
 */
export function moveWidget(
  order: readonly BriefingWidget[],
  widget: BriefingWidget,
  direction: 'up' | 'down',
): BriefingWidget[] {
  const at = order.indexOf(widget);
  if (at < 0) return [...order];

  const to = direction === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= order.length) return [...order];

  const moved = [...order];
  [moved[at], moved[to]] = [moved[to], moved[at]];
  return moved;
}
