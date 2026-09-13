/**
 * Moving weighted average cost.
 *
 * The elegant part of the whole system lives here: registering a purchase is
 * the same event that moves the cost. Nobody ever "updates the price of sugar"
 * as a task - they enter the invoice, every recipe that uses sugar recalculates,
 * and the price history writes itself.
 *
 * Moving average rather than last-purchase price, because last price makes
 * margin jump around on a single unlucky invoice. The last price stays visible
 * for negotiation ("R$ 118 here; you paid R$ 112 last month"), but the average
 * is what the cost of a batch is measured against.
 */

import { rateFromCents, type Cents, type Rate } from './money';

export type StockCostState = {
  /** On hand, in the item's base unit. */
  baseUnits: number;
  /**
   * Current moving average, per base unit, as a fractional rate. Sugar at
   * R$ 4.72/kg is 0.472 cents per gram - an integer would round it to zero.
   */
  averageRate: Rate;
};

export type PurchaseEvent = {
  kind: 'purchase';
  /** Quantity received, already converted to the item's base unit. */
  baseUnits: number;
  /** What was actually paid, including freight if it was apportioned. */
  totalCents: Cents;
  at: string;
};

export type ConsumptionEvent = {
  kind: 'consumption';
  baseUnits: number;
  at: string;
};

export type CostEvent = PurchaseEvent | ConsumptionEvent;

export const emptyStock: StockCostState = { baseUnits: 0, averageRate: 0 as Rate };

/**
 * Applies one event.
 *
 * A purchase blends into the average in proportion to what is already on hand.
 * A consumption removes quantity and leaves the average untouched - that is the
 * definition of the method, and it is what keeps the cost stable while stock
 * drains.
 *
 * Consuming more than is on hand is allowed rather than rejected: it happens in
 * real operations when a count is behind, and refusing it would push people to
 * enter something false. The average survives, and the physical count is what
 * corrects reality later.
 */
export function applyCostEvent(state: StockCostState, event: CostEvent): StockCostState {
  if (event.kind === 'purchase') {
    if (event.baseUnits <= 0) return state;

    const heldValue = state.averageRate * Math.max(0, state.baseUnits);
    const newUnits = Math.max(0, state.baseUnits) + event.baseUnits;
    const newValue = heldValue + event.totalCents;

    return {
      baseUnits: state.baseUnits + event.baseUnits,
      averageRate: rateFromCents(newValue as Cents, newUnits),
    };
  }

  return { baseUnits: state.baseUnits - event.baseUnits, averageRate: state.averageRate };
}

/**
 * A média móvel entre duas TAXAS, sem passar por dinheiro.
 *
 * `applyCostEvent` fala de nota: o que entrou custou tantos centavos inteiros,
 * porque foi isso que alguém pagou. Uma corrida de produção não tem nota — o
 * que ela tem é a taxa congelada (consumo mais embalagem, por unidade), e o
 * valor do lote é taxa vezes quantidade, que é fracionário por natureza.
 *
 * Forçar esse valor a centavos inteiros para reaproveitar o evento de compra
 * custou visivelmente: a primeira corrida de 500 unidades saía com média
 * 64,996 contra um custo congelado de 64,99686 — dois números para o mesmo
 * picolé, no dia em que ele nasceu. É a mesma perda que a capa deste projeto
 * proíbe, e a regra que resolve já estava escrita: **só o valor final
 * arredonda, uma vez, e taxa não é valor final.**
 *
 * Estoque negativo conta como zero, igual ao evento de compra e ao gatilho do
 * servidor: recusar empurraria alguém a digitar mentira.
 */
export function blendRate(
  held: { baseUnits: number; averageRate: Rate },
  arriving: { baseUnits: number; rate: Rate },
): Rate {
  const heldUnits = Math.max(0, held.baseUnits);
  const total = heldUnits + arriving.baseUnits;
  if (total <= 0) return arriving.rate;
  return ((held.averageRate * heldUnits + arriving.rate * arriving.baseUnits) / total) as Rate;
}

/**
 * Observed lead time, not the promised one. Suppliers say three days and
 * deliver in six; the reorder point has to be built on what actually happened,
 * which is a number the system already holds and the person does not.
 */
export function observedLeadTimeDays(
  deliveries: readonly { orderedAt: string; receivedAt: string }[],
): number | null {
  if (deliveries.length === 0) return null;

  const days = deliveries.map((d) => {
    const ordered = new Date(d.orderedAt).getTime();
    const received = new Date(d.receivedAt).getTime();
    return (received - ordered) / 86_400_000;
  });

  return days.reduce((a, b) => a + b, 0) / days.length;
}

/**
 * **O prazo do fornecedor de quem se vai comprar — não a média de todos eles.**
 *
 * `observedLeadTimeDays` acima faz a média das entregas que recebe, e por muito tempo quem
 * chamava passava TODAS as entregas do item. Numa fábrica que compra polpa de dois
 * fornecedores — um da cidade que entrega em dois dias e um de fora que leva dez — isso dá
 * seis, um número que não é de nenhum dos dois. E seis é o que a capa, o aviso e a ficha usam
 * para dizer o dia de comprar: cedo demais para um, tarde demais para o outro.
 *
 * O recorte é o fornecedor da ÚLTIMA nota, e isso não é arbitrário: é o mesmo que a tela de
 * compra sugere no campo (`lastPurchaseOf`). Assim a sugestão e o prazo falam do mesmo
 * fornecedor — se a tela oferece "Atacado São Jorge", o dia de comprar é o do Atacado São
 * Jorge. Discordar aí seria o aplicativo discordando de si mesmo, que é a doença que a régua
 * única de compra veio curar.
 *
 * **Entrega sem fornecedor cadastrado não estreita nada.** Nota antiga tem `supplier_id`
 * nulo, e nulo não é um fornecedor — quando a última nota é dessas, o prazo volta a ser o de
 * todas, que é a resposta honesta de quem não sabe de quem comprou.
 *
 * As entregas chegam da mais nova para a mais velha (é a ordem da consulta), e esta função
 * depende disso: quem a chamar com outra ordem recebe o prazo de outro fornecedor.
 */
export function prazoDoFornecedorAtual(
  deliveries: readonly { orderedAt: string; receivedAt: string; supplierId?: string | null }[],
): number | null {
  const atual = deliveries[0]?.supplierId ?? null;
  if (atual === null) return observedLeadTimeDays(deliveries);
  return observedLeadTimeDays(deliveries.filter((d) => d.supplierId === atual));
}

/**
 * Reorder point, calculated rather than typed. A hand-entered "minimum stock"
 * ages the moment consumption changes and nobody goes back to fix it.
 */
export function reorderPoint(dailyConsumption: number, leadTimeDays: number, safetyDays = 2): number {
  return Math.ceil(dailyConsumption * (leadTimeDays + safetyDays));
}

/**
 * **De quanto em quanto tempo esta fábrica compra deste fornecedor — observado, não perguntado.**
 *
 * `observedLeadTimeDays` responde quanto o fornecedor demora entre o pedido e a entrega.
 * Esta responde outra coisa: quanto tempo passa entre UMA entrega e a seguinte. As duas juntas
 * são o que decide QUANTO pedir — um pedido que cobre só o prazo obriga a comprar de novo no dia
 * em que a carga chega.
 *
 * O recorte é o mesmo de `prazoDoFornecedorAtual` e pela mesma razão: numa fábrica que compra de
 * dois fornecedores, o intervalo médio entre todas as entregas não é o intervalo de nenhum deles.
 * Sem fornecedor cadastrado na entrega mais nova, a conta volta a ser de todas — a resposta
 * honesta de quem não sabe de quem comprou.
 *
 * **Nulo com menos de duas entregas, e isso não é borda: é o estado normal do primeiro mês.** Uma
 * entrega só não tem intervalo, e devolver zero faria o pedido cobrir apenas prazo mais folga sem
 * ninguém saber que o ciclo era desconhecido. Quem chama decide o que fazer com o nulo, e a
 * decisão está escrita em `quantoComprar`.
 */
export function intervaloEntreCompras(
  deliveries: readonly { receivedAt: string; supplierId?: string | null }[],
): number | null {
  const atual = deliveries[0]?.supplierId ?? null;
  const recorte = atual === null ? deliveries : deliveries.filter((d) => d.supplierId === atual);
  if (recorte.length < 2) return null;

  // Ordenadas da mais nova para a mais velha por quem chama (`deliveriesOf` faz `ORDER BY
  // arrived_at DESC`), e a conta não depende disso: ela ordena o que recebeu. Uma lista chegando
  // ao contrário daria intervalos negativos, e um intervalo negativo viraria um pedido menor do
  // que o necessário — o defeito silencioso desta família.
  const dias = [...recorte]
    .map((d) => new Date(d.receivedAt).getTime())
    .sort((a, b) => a - b);
  const vaos: number[] = [];
  for (let i = 1; i < dias.length; i += 1) vaos.push((dias[i] - dias[i - 1]) / 86_400_000);
  return vaos.reduce((a, b) => a + b, 0) / vaos.length;
}

/**
 * **QUANTO comprar — e este número não existia em lugar nenhum do domínio.**
 *
 * `reorderPoint` responde *quando*: abaixo de X unidades, peça. A quantidade a PEDIR é outra
 * conta, e sem ela a tela de compras só consegue dizer "compre" sem dizer quanto — que é
 * exatamente a metade que a Lei 1 proíbe deixar para a pessoa calcular de cabeça.
 *
 * A conta é a mais simples que é honesta: o pedido cobre o que sai por dia durante o tempo até a
 * carga chegar (`prazo`), mais a folga que a empresa escolheu, mais o tempo até a compra SEGUINTE
 * (`ciclo`) — e desconta o que já está na prateleira. Sem o ciclo o pedido chega e já está na
 * hora de pedir de novo; com ele, a fábrica compra na frequência em que ela realmente compra.
 *
 * **As duas ausências têm respostas diferentes, e as duas são decisão escrita:**
 *
 * - **Prazo desconhecido** cai em `settings.daysAhead.insumo`, que é o mesmo piso que
 *   `precisaComprar` usa. Uma régua só para o *quando* e o *quanto*: se o aplicativo avisa hoje
 *   porque a cobertura encostou nesse piso, o pedido tem de cobrir esse mesmo piso. Dois números
 *   diferentes aqui seriam o aplicativo discordando de si mesmo, que é a doença que a régua única
 *   de compra veio curar.
 * - **Ciclo desconhecido** soma ZERO, e não um palpite. É o estado de quem tem uma entrega só, e
 *   um pedido que cobre prazo mais folga está certo e curto — enquanto um ciclo inventado de sete
 *   dias mandaria comprar o dobro do necessário na primeira compra da vida da fábrica.
 *
 * Nunca negativo: quem tem mais na prateleira do que o alvo não precisa comprar, e zero é a
 * resposta. E em unidade-base, porque quem sabe converter para saco é a tela — ela é que tem a
 * embalagem de compra, e ninguém pede 17.300 g de açúcar.
 */
export function quantoComprar(input: {
  /** Quanto sai por dia, do livro-razão. Zero devolve zero: insumo parado não se compra. */
  dailyOutflow: number;
  onHandBaseUnits: number;
  /** O prazo OBSERVADO do fornecedor de quem se vai comprar, ou nulo. */
  leadTimeDays: number | null;
  /** A folga da empresa, em dias. */
  safetyDays: number;
  /** O intervalo observado entre compras, ou nulo. Ver `intervaloEntreCompras`. */
  cycleDays: number | null;
  /** O piso de quando não se sabe o prazo — `settings.daysAhead.insumo`. */
  floorDays: number;
}): number {
  if (!(input.dailyOutflow > 0)) return 0;
  const prazo = input.leadTimeDays === null ? input.floorDays : input.leadTimeDays;
  const alvo = prazo + input.safetyDays + (input.cycleDays ?? 0);
  const precisa = input.dailyOutflow * alvo - Math.max(0, input.onHandBaseUnits);
  return Math.max(0, precisa);
}

/**
 * Quantas EMBALAGENS DE COMPRA cobrem o que falta — arredondando para cima, sempre.
 *
 * Ninguém pede dois terços de um saco: ou vem o saco ou não vem. Arredondar para baixo é entregar
 * um pedido que não cobre o alvo, que é pior que comprar um pouco mais — a fábrica para por falta,
 * não por sobra.
 *
 * `purchaseToBase` nulo é o item comprado na própria unidade-base (o produto de revenda contado
 * por unidade, que a tela de compra já trata com `?? 1`): aí a resposta é a própria quantidade,
 * arredondada para cima.
 */
export function pacotesAComprar(baseUnits: number, purchaseToBase: number | null): number {
  if (!(baseUnits > 0)) return 0;
  const fator = purchaseToBase && purchaseToBase > 0 ? purchaseToBase : 1;
  return Math.ceil(baseUnits / fator);
}

/**
 * Quantas compras observadas bastam para o aplicativo ter opinião sobre a folga.
 *
 * O nome diz o que o número DECIDE, e não quanto ele vale: quem quiser a sugestão mais cedo baixa
 * o número sabendo o que está comprando — uma opinião formada sobre menos hábito.
 *
 * **Três é um palpite declarado, e ele é o ponto que a fábrica de verdade vai calibrar.** Duas
 * compras dão uma mediana que é a média de duas — qualquer compra de pânico a domina. Com cinco a
 * sugestão só apareceria depois de meses, e a decisão do dono sobre compras inteligentes é
 * *construir agora, calibrar depois*. Então três, dito como palpite em vez de escondido como
 * constante.
 */
export const COMPRAS_PARA_SUGERIR = 3;

/**
 * **A folga com que a fábrica REALMENTE comprou — para o aplicativo sugerir em vez de só obedecer.**
 *
 * A folga de compra é configuração (F7: a que compra na mesma cidade quer dois dias, a que importa
 * essência quer duas semanas), e ela nasce em dois. Só que a fábrica não segue o número dos
 * ajustes: ela compra quando compra, e o razão sabe disso. Se ela sempre pede com quatro dias de
 * sobra, o aplicativo avisando em dois está atrasado dois dias em toda compra — e ninguém vai aos
 * ajustes trocar um número que não sabe que está errado.
 *
 * A conta por compra: a cobertura que havia no dia do PEDIDO, menos o prazo que o fornecedor
 * levou. O que sobra é a folga que aquela compra usou de fato.
 *
 * **Mediana e não média**, e é a mesma escolha que a régua de tinta das fotos fez por medida: uma
 * compra de pânico (zero de sobra, porque acabou) ou uma de oportunidade (trinta dias, porque o
 * preço caiu) puxa a média e não representa hábito nenhum. A mediana é o que a fábrica FAZ.
 *
 * **Nulo com menos de `COMPRAS_PARA_SUGERIR`, e é isto que impede a sugestão de mentir.** Com uma
 * compra na vida a tela diria *"você sempre comprou com 0 dias de sobra"* — uma afirmação sobre
 * hábito derivada de um evento, e pior que não sugerir nada. Nulo faz a peça DESAPARECER em vez de
 * aparecer com um número inventado, que é a mesma regra do alerta inventado.
 *
 * Nunca negativa: comprar com o estoque já no negativo (contagem atrasada, compra de emergência) é
 * folga zero, não folga negativa — um número negativo atravessaria para a tela e viraria uma
 * sugestão de folga impossível.
 */
export function folgaQueAFabricaUsa(
  compras: readonly { diasDeCoberturaAoPedir: number; prazoObservado: number }[],
  minimo: number = COMPRAS_PARA_SUGERIR,
): number | null {
  if (compras.length < minimo) return null;
  const folgas = compras
    .map((c) => Math.max(0, c.diasDeCoberturaAoPedir - c.prazoObservado))
    .sort((a, b) => a - b);
  const meio = Math.floor(folgas.length / 2);
  return folgas.length % 2 === 1 ? folgas[meio] : (folgas[meio - 1] + folgas[meio]) / 2;
}

/**
 * **A folga observada arredondada para uma das escolhas que a tela oferece.**
 *
 * A tela de ajustes oferece sete folgas e não um campo livre, com a razão escrita lá: *"quem está
 * de luva não digita, e a diferença entre 4 e 5 dias de folga não decide nada que 3 ou 7 já não
 * decidam"*. Uma sugestão de 4,5 dias contrariaria essa decisão de duas maneiras — precisão que
 * ninguém pediu, e um valor que nenhuma pastilha mostra selecionada.
 *
 * **O desempate vai para o MAIOR**, e a assimetria é a mesma de `pacotesAComprar`: errar para mais
 * custa um pouco de estoque parado, errar para menos custa a fábrica parada por falta. Quatro dias
 * observados entre as escolhas 3 e 5 sugerem **5**.
 */
export function folgaOferecida(observada: number, opcoes: readonly number[]): number | null {
  if (opcoes.length === 0) return null;
  let melhor = opcoes[0];
  for (const opcao of opcoes) {
    const distancia = Math.abs(opcao - observada);
    const atual = Math.abs(melhor - observada);
    // `>` no empate mantém o maior: distância igual não troca, e a ordem da lista deixa de decidir.
    if (distancia < atual || (distancia === atual && opcao > melhor)) melhor = opcao;
  }
  return melhor;
}

/** One move in what an item costs, as the price history records it. */
export type RateMove = {
  itemId: string;
  previousRate: Rate | null;
  observedAt: string;
};

/**
 * The rates as they stood before a run of recent moves.
 *
 * A unit cost on its own is a number somebody has to take on trust: 55 cents is
 * neither good nor bad without knowing it was 52 before the last invoices. The
 * comparison the Law of Intelligence asks for is already written down - every
 * purchase leaves a row saying what the rate was before it - so this is a fold
 * over history rather than a snapshot somebody has to remember to store.
 *
 * When an item moved more than once inside the window, the *earliest* of those
 * moves wins. The question a briefing answers is "what did this week do to my
 * costs", not "what did the last invoice do", and rolling back only the final
 * step would quietly under-report a run of rises.
 *
 * Items with no move keep their current rate, so a product built entirely from
 * things that did not change comes out identical - which is how "nothing moved"
 * stays a real answer instead of rounding noise.
 */
export function ratesBefore(
  current: Readonly<Record<string, Rate>>,
  moves: readonly RateMove[],
): Record<string, Rate> {
  const earliest = new Map<string, Rate>();

  for (const move of moves) {
    if (move.previousRate === null) continue;
    const seen = moves.find(
      (other) =>
        other.itemId === move.itemId &&
        other.previousRate !== null &&
        other.observedAt < move.observedAt,
    );
    if (!seen) earliest.set(move.itemId, move.previousRate);
  }

  return { ...current, ...Object.fromEntries(earliest) };
}

/**
 * De quanto o custo mudou — uma conta, num lugar só, com o caso da base ZERO decidido.
 *
 * **O que existia: cinco cópias e TRÊS respostas diferentes para a mesma pergunta.** Medido em
 * 13 de setembro, por `grep` na aritmética e não no nome:
 *
 *   `app/inputs/[id].tsx`            ternário exige anterior verdadeiro  ->  null
 *   `src/assistant/skills.ts` (x4)   `(agora - (ant ?? 0)) / (ant || 1)` ->  o próprio valor
 *   `src/home/Mosaic.tsx`            `ant > 0 ? … : 0`                   ->  zero
 *   `src/home/capas/organico.tsx`    idem                                ->  zero
 *
 * Nenhuma está *errada* sobre o caso comum: com anterior positivo as quatro dão o mesmo número.
 * A divergência mora na base ZERO — uma nota de brinde, uma amostra, uma correção —, e o razão
 * ACEITA isso: `recordPurchase` recusa só valor negativo.
 *
 * E o efeito medido é o pior dos três: a capa desenha **▼ 0,0%** para um insumo cujo custo subiu
 * de zero para alguma coisa. Uma queda afirmada onde houve alta, com a seta e tudo — e a linha
 * passa o filtro de cima (`previousRate !== newRate`), então ela chega à tela. O assistente, no
 * mesmo caso, anuncia um percentual igual à própria taxa: 0,55 centavo por grama sai como
 * *"+55%"*.
 *
 * **A decisão, tomada aqui uma vez: base zero não tem percentual, e `null` é a resposta.** Não é
 * timidez — é aritmética: o que era zero e passou a valer algo não subiu uma fração, subiu de
 * nada para algo, e nenhum percentual diz isso. `null` é o que a tela precisa para escrever a
 * frase certa em vez de desenhar uma seta inventada.
 *
 * Anterior NULO também é `null`, pela mesma régua: um insumo cuja primeira nota acabou de entrar
 * não mudou de preço, ele ganhou um. (As telas já filtram esse caso antes de chegar aqui; a
 * função não depende disso, porque depender de um filtro de chamador é como as cinco cópias
 * nasceram.)
 */
export function variacaoDoCusto(anterior: Rate | null, agora: Rate): number | null {
  if (anterior === null || anterior === 0) return null;
  return (agora - anterior) / anterior;
}

/**
 * **A taxa da MERCADORIA — o que o fornecedor cobrou, sem o frete.**
 *
 * Existem duas perguntas de dinheiro numa nota e por muito tempo um número só respondia as
 * duas. *Quanto este saco me custou para estar aqui* é o POUSO, com frete, e é ele que move a
 * média, decide margem e sai no extrato — `total_cents` é isso desde a primeira nota. *Quanto
 * o fornecedor está cobrando* é outra coisa, e é ela que a pessoa leva para a negociação: o
 * comentário de `item_costs` diz isso desde a `0002`, com a frase inteira — *"R$ 118 here;
 * R$ 112 last month at supplier B"*.
 *
 * Misturar as duas produz um alarme que culpa quem não fez nada. O campo de frete da tela de
 * compra diz de si mesmo que o valor varia por ENTREGA — *"uma semana o fornecedor traz, na
 * outra você busca"* —, então buscar o saco você mesmo na semana passada e pagar entrega nesta
 * fazia o aplicativo anunciar *"subiu bem acima do normal"* sobre um preço que não mudou uma
 * vírgula. É o alerta inventado com causa real e recorrente.
 *
 * **Frete maior que o total é lido como frete nenhum**, e isso é escolha em vez de descuido: a
 * nota não fecha (alguém digitou o frete no campo do total), e subtrair devolveria taxa
 * NEGATIVA — a comparação anunciaria que o fornecedor está pagando para entregar, e o sinal
 * trocado atravessaria daqui para a cor do chip. Cair no pouso é voltar ao número que existia
 * antes desta função, que é o pior caso aceitável: ele está alto, não invertido.
 *
 * Frete IGUAL ao total atravessa, e ali zero é a resposta certa e não um caso de borda: a
 * mercadoria veio de graça e só a entrega foi paga. O fornecedor cobrou nada, e a comparação
 * deve dizer isso.
 */
export function taxaDaMercadoria(totalCents: Cents, freightCents: Cents, baseUnits: number): Rate {
  const mercadoria = freightCents > 0 && freightCents <= totalCents ? totalCents - freightCents : totalCents;
  return rateFromCents(mercadoria as Cents, baseUnits);
}

/**
 * How a price change should be read. A verdict, not a sentence - the screen
 * owns the words, in three languages.
 */
export type PriceVerdict = 'wellAbove' | 'smallChange' | 'cheaper';

/**
 * Where "it went up" becomes "it went up enough to say something".
 *
 * The two numbers are deliberately not symmetric. It takes more than 5% to
 * raise an alarm and only 2% to call something cheaper, because the costs of
 * being wrong are not symmetric either: a false alarm teaches the person to
 * ignore alarms, and then the real one arrives and is ignored too. Good news
 * that turns out to be noise costs nothing.
 *
 * They live here rather than in the screen that draws them because they are a
 * business rule, not a style - and until now they were four magic numbers
 * inside JSX, deciding what a person is warned about before they spend money,
 * with no test anywhere.
 */
export const PRICE_ALARM = 0.05;
export const PRICE_RELIEF = -0.02;

export function judgePriceChange(change: number): PriceVerdict {
  if (change > PRICE_ALARM) return 'wellAbove';
  if (change < PRICE_RELIEF) return 'cheaper';
  return 'smallChange';
}
