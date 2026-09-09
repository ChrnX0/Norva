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
  /**
   * A semana — o que é NORMAL aqui, que é a primeira das três perguntas da Lei.
   *
   * Ela nasceu grudada na produção do dia, dentro da mesma peça, e isso era uma
   * decisão escondida: quem quisesse a manchete sem as sete colunas não tinha
   * como, e quem quisesse as colunas no alto da capa também não. São dois
   * assuntos — o que aconteceu hoje e o que costuma acontecer — e o desenho
   * aprovado das duas peles desenha os dois separados, com régua entre eles no
   * Papel e em cartões diferentes no Orgânico.
   *
   * Entra depois da produção no catálogo porque é onde ela cai para quem nunca
   * mexeu na ordem; para quem já mexeu, `briefingLayout` a acrescenta no fim,
   * que é o combinado de toda peça nova.
   */
  'semana',
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
  /**
   * A cópia velha — e ela só aparece quando está velha.
   *
   * Entra porque o item 0 da fila fechou o risco de perder a fábrica e deixou um
   * buraco atrás dele: **cópia que ninguém faz é cópia que não existe.** A tela de
   * cópia diz há quantos dias foi a última, e ela só diz isso para quem a abre —
   * que é exatamente quem não precisa do lembrete.
   *
   * Fica FORA dos alertas de propósito. Aquilo são fatos da fábrica — insumo
   * acabando, lote vencendo, pedido atrasado — e enfiar um assunto do aplicativo
   * no meio deles é a forma mais rápida de ensinar alguém a ignorar a lista
   * inteira. Aqui é a capa, que é onde o que muda a decisão de hoje mora.
   *
   * E ela some quando a cópia está em dia: "está tudo bem" é estado válido, e
   * peça que aparece sempre é peça que ninguém lê.
   */
  'copia',
] as const;

export type BriefingWidget = (typeof BRIEFING_WIDGETS)[number];

/**
 * O que NÃO entra na capa de uma fábrica nova.
 *
 * Existe por uma correção do dono, e ela vale como regra geral: dado disponível
 * não é motivo para ocupar a primeira tela. A capa é o que a casa olha de manhã,
 * e cada cartão a mais empurra o resto para baixo.
 *
 * O primeiro caso foi o "tacho rodando", e ele acabou saindo do catálogo inteiro:
 * era o MESMO assunto da produção ao vivo, dito com uma palavra de fábrica de
 * sorvete num aplicativo que vai para qualquer fábrica. Duas peças para um
 * assunto é a capa competindo consigo mesma.
 *
 * Fora do padrão não é fora do produto: quem quiser liga em Ajustes, e aí ele
 * entra na ordem da casa como qualquer outro. É a mesma forma da F7 — os dois
 * caminhos existem, e o que se escolhe aqui é só o PADRÃO.
 */
/*
 * **O padrão encolheu em 6 de setembro, e a régua não é um número — é a Lei.**
 *
 * Eu tinha proposto "~5 peças" e o dono mandou fazer. Ao aplicar, o número
 * arredondado brigou com a doutrina e a doutrina ganhou: são **sete**, e a conta
 * de quais é esta.
 *
 * A capa responde três coisas — o que é normal, o que está diferente agora, e
 * qual é a próxima ação provável. Então o padrão leva o que **avisa** e o que
 * **decide**; o que só **conta** espera alguém pedir.
 *
 * Ficam: `producao` e `semana` (o que aconteceu e o que é normal), `aoVivo` (o
 * agora), `cobertura` e `validade` (os dois que avisam a tempo), `entregaHoje` (a
 * próxima ação), e `clima` — que parece enfeite e não é: calor muda produção, e o
 * dono investiu nessa peça de propósito.
 *
 * **`validade` e `cobertura` não desceram, e é aí que os ~5 morreram.** Peça que
 * avisa e que ninguém ligou é aviso que não existe — uma fábrica que nunca abre
 * Ajustes nunca descobriria que tem lote vencendo. Cortar um aviso para chegar
 * num número redondo seria servir a minha frase em vez de servir a tela.
 *
 * Saem sete, e todas por serem RELATÓRIO: histórico, insumos, expedição, perdas,
 * custo, preços e o que está parado. Nenhuma delas muda o que se faz hoje de manhã, e
 * todas continuam a um toque em Ajustes.
 *
 * **`pedidos` subiu para o padrão em 9 de setembro, e o critério acima é que a trouxe.**
 * Ela estava aqui embaixo com as outras sete, e não é relatório: ela mostra o que as
 * lojas pediram e **o que falta para atender**, item por item. "Produza para os pedidos"
 * é o aplicativo dizendo o que fazer amanhã — a coisa mais "decide" que existe nesta
 * tela. O critério mandava ligá-la desde que foi escrito; a lista a deixou de fora.
 *
 * São NOVE, e o número redondo perdeu para a Lei outra vez — como quando os "~5" que eu
 * propus viraram oito. Decisão do dono, 9 de setembro.
 *
 * Fora do padrão não é fora do produto — é a mesma forma da F7: os dois caminhos
 * existem, e o que se escolhe aqui é só o PADRÃO.
 */
const DEFAULT_OFF = new Set<BriefingWidget>([
  'historico',
  'insumos',
  'expedicao',
  'perdas',
  'custo',
  'precos',
  'parado',
]);

/**
 * A ordem que a casa combinou, filtrada pelo que este aparelho quer ver.
 *
 * Guarda duas coisas de propósito: uma peça que a empresa nunca ordenou entra
 * no fim, na ordem do catálogo, e uma peça que saiu do catálogo some da
 * preferência sem quebrar nada. É o que permite acrescentar widget novo numa
 * versão futura sem que todo mundo precise reconfigurar a capa.
 */
/**
 * Quais peças aceitam meia coluna.
 *
 * Pedido do dono, 6 de setembro: *"e o tamanho dos widgets, dá para alterar?
 * tipo meia coluna ou coluna inteira?"* — e a resposta não podia ser "escolha
 * livre para as quinze", por um motivo que é de desenho e não de código.
 *
 * **A manchete e a régua da semana SÃO a página.** Meia manchete quebra a capa
 * aprovada, e meia semana são três dias e meio de barra. Elas ficam de fora.
 *
 * **E o que sobra tem de caber em 168 dp**, que é metade do telefone de 360 com
 * as margens. Cabe um número com rótulo — caixas de hoje, perdas do mês, o preço
 * estável. Não cabe uma lista com nome de loja, nem o diagrama da conta. Por isso
 * quem declara é a PEÇA e não a pessoa: oferecer meia coluna para "saiu para as
 * lojas" seria oferecer uma escolha que só produz tela quebrada.
 */
const ACEITA_MEIA = new Set<BriefingWidget>([
  'aoVivo',
  'cobertura',
  'entregaHoje',
  'expedicao',
  'validade',
  'perdas',
  'custo',
  'precos',
  'clima',
  'parado',
]);

/**
 * O que a capa diz sobre a cópia — e a decisão mora AQUI, não dentro do JSX.
 *
 * A primeira versão tinha os catorze dias e as duas pontas escritos no meio do
 * componente, e isso deixava a regra sem teste: nada em `node --test` alcança um
 * ternário dentro de um `<Peca>`. É a mesma lição de `src/components/cena.ts`, que
 * nasceu porque a legenda e o desenho podiam discordar — o que decide vira módulo
 * puro, e a tela só desenha o que ele responde.
 *
 * E aqui isso pesa mais que o normal, porque a peça **não aparece no emulador no
 * dia em que se constrói**: a cópia é de hoje, e o aviso só existe quando ela
 * envelhece. Se a regra não estivesse provada, ela seria a única do aplicativo
 * cuja primeira verificação seria em fábrica de verdade, catorze dias depois.
 *
 * Três respostas, e cada uma tem um motivo diferente para existir:
 *
 * - `'nunca'` — não há cópia E a fábrica já tem o que perder. As duas metades são
 *   obrigatórias: pedir cópia de uma fábrica que ainda não produziu é o alerta
 *   inventado, e alerta inventado ensina a ignorar alerta.
 * - `'velha'` — passou de catorze dias. Menos que isso vira barulho semanal; mais
 *   que isso já é um mês de razão em risco.
 * - `null` — está em dia, e "está tudo bem" é estado válido e some da tela.
 */
export const DIAS_ATE_A_COPIA_ENVELHECER = 14;

export type AvisoDaCopia = 'nunca' | 'velha' | null;

export function avisoDaCopia(
  copia: { diasAtras: number } | null | undefined,
  temOQuePerder: boolean,
): AvisoDaCopia {
  if (copia === null || copia === undefined) return temOQuePerder ? 'nunca' : null;
  return copia.diasAtras >= DIAS_ATE_A_COPIA_ENVELHECER ? 'velha' : null;
}

export function aceitaMeia(w: BriefingWidget): boolean {
  return ACEITA_MEIA.has(w);
}

/**
 * A capa em FILAS, que é o que a tela desenha — uma peça inteira, ou duas meias
 * lado a lado.
 *
 * A regra que decide tudo aqui é uma só, e ela existe para não haver buraco:
 * **meia sozinha vira inteira.** Uma peça de meia largura com um vazio do lado é
 * pior que a inteira — a página fica com um dente faltando e a pessoa procura o
 * que sumiu. Então duas meias SEGUIDAS pareiam, e a meia órfã ocupa a fila.
 *
 * Consequência que parece defeito e é a regra funcionando: marcar uma peça como
 * meia pode não mudar nada na tela, se a vizinha dela for inteira. Quem quer o
 * par marca as duas — e é por isso que a tela de ajustes mostra o resultado, e
 * não só o interruptor.
 */
export function briefingFilas(
  layout: readonly BriefingWidget[],
  meias: readonly string[],
): BriefingWidget[][] {
  const querMeia = new Set(meias.filter((w): w is BriefingWidget => aceitaMeia(w as BriefingWidget)));
  const filas: BriefingWidget[][] = [];

  for (let i = 0; i < layout.length; i += 1) {
    const atual = layout[i];
    const proxima = layout[i + 1];
    if (querMeia.has(atual) && proxima !== undefined && querMeia.has(proxima)) {
      filas.push([atual, proxima]);
      i += 1;
      continue;
    }
    filas.push([atual]);
  }

  return filas;
}

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

/**
 * O que a capa pode AFIRMAR, e quando ela ainda não pode afirmar nada.
 *
 * Isto existe por um defeito que a foto pegou e o verde não pegaria. A capa
 * lia `data?.madeToday ?? 0` e, com o banco ainda respondendo, `data` é nulo —
 * então todos os zeros batiam e a tela dizia, em manchete de 29 pontos, **"Hoje
 * a fábrica ainda não produziu"** para uma fábrica que tinha acabado de lançar
 * 506 unidades. O livro-razão estava certo; a tela mentia enquanto esperava.
 *
 * Num aparelho rápido a janela é de milissegundos e ninguém vê. Num celular de
 * fábrica com o banco cheio, é o primeiro que a pessoa lê ao abrir o aplicativo
 * de manhã — e "não produziu" é a frase mais cara que esta tela pode dizer
 * errado.
 *
 * Três estados, e a diferença entre os dois últimos é a coisa toda: **não sei**
 * não é **nada**.
 */
export type CoverState = 'loading' | 'firstDay' | 'day';

export function coverState(
  /** Nulo enquanto a consulta não voltou. */
  data: {
    madeToday: number;
    runs: readonly unknown[];
    cover: readonly unknown[];
    boxes: number;
    orders: number;
    running: readonly unknown[];
    expiring: readonly unknown[];
    dueToday: readonly unknown[];
    lossesNow: number;
  } | null,
): CoverState {
  if (!data) return 'loading';
  // Comprar insumo não é trabalho da fábrica, é o estoque de partida — por isso
  // a compra não entra nesta conta. O que conta é o que saiu do tacho, o que foi
  // para a loja, o que alguém pediu, o que está aberto, o que venceu e o que se
  // perdeu.
  const trabalhou =
    data.madeToday !== 0 ||
    data.runs.length > 0 ||
    data.cover.length > 0 ||
    data.boxes !== 0 ||
    data.orders > 0 ||
    data.running.length > 0 ||
    data.expiring.length > 0 ||
    data.dueToday.length > 0 ||
    data.lossesNow !== 0;
  return trabalhou ? 'day' : 'firstDay';
}

/**
 * Em que posição o dia de hoje está na semana: 1 é o melhor, 7 o pior.
 *
 * É a frase do cartão da semana no Orgânico — *"hoje é o segundo melhor dia"* —,
 * e ela mora aqui porque é conta, não prosa: a tela recebe um número e escolhe
 * a palavra. Empate conta a favor de hoje (dois dias de 500 fazem hoje "o
 * melhor", não "o segundo"), porque a pergunta é "há dia melhor que este?" e a
 * resposta honesta para empate é não.
 *
 * Nulo quando a semana inteira é zero: não há ranking de nada, e "hoje é o
 * melhor dia" sobre sete zeros seria o alerta inventado ao contrário.
 */
export function todayRank(series: readonly { total: number }[]): number | null {
  if (series.length === 0) return null;
  const hoje = series[series.length - 1].total;
  /**
   * Dia sem produção não recebe colocação, e isso não é delicadeza.
   *
   * A foto do Orgânico numa manhã de domingo dizia "hoje é o sétimo melhor dia"
   * com a fábrica fechada e a manchete ao lado dizendo "ainda não produziu
   * hoje". As duas frases eram verdade e juntas eram um alerta inventado: o dia
   * não acabou, e classificar o que ainda não aconteceu em último lugar ensina
   * a ignorar a frase — que é o que a Lei 7 proíbe.
   *
   * Zero em todo mundo também não tem colocação: numa fábrica que não produziu
   * a semana inteira, "hoje empatou em primeiro" é a mesma mentira ao contrário.
   */
  if (hoje === 0) return null;
  return 1 + series.slice(0, -1).filter((d) => d.total > hoje).length;
}
