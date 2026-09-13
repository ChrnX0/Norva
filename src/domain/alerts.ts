/**
 * Quando o aplicativo avisa, e quando ele cala.
 *
 * O dono pediu notificação de insumo acabando, de pedido de cliente e de volume
 * de estoque — e perguntou se dá para configurar a hora. Dá, e não é enfeite: é
 * a F7 do projeto na forma mais literal. Uma fábrica que compra toda segunda
 * quer o aviso no domingo à noite; outra que compra na feira da manhã quer às
 * cinco. Escolher um dos dois seria escolher para o cliente errado.
 *
 * Três leis decidem a forma deste módulo:
 *
 * **Lei 4 — avise na data da DECISÃO, não na do problema.** Insumo que acaba
 * quinta com dois dias de compra tem que avisar terça. É por isso que o piso é
 * em DIAS DE ANTECEDÊNCIA e não em quantidade: quantidade não sabe quanto tempo
 * leva para chegar.
 *
 * **Lei 7 — alerta inventado ensina a ignorar alerta.** Sem consumo registrado
 * não existe data de acabar, então não existe aviso. Item sem faixa cadastrada
 * não alarma. Pedido já coberto não alarma.
 *
 * **O sistema sugere, nunca decide calado.** Cada alarme carrega o número que o
 * gerou, para a notificação dizer o fato em vez de "confira o estoque".
 *
 * E o que este módulo NÃO faz: falar português e falar com o sistema operacional.
 * Ele devolve fato — que alarme, de qual item, com qual número, e o instante em
 * que deveria chegar. Quem escreve a frase é a tela, e quem agenda é o adaptador
 * do aparelho, que é a única parte que só um celular na mão prova.
 */

export type AlertKind = 'insumo' | 'pedido' | 'volume' | 'validade' | 'ambiente';

/** O que a empresa combinou sobre cada alarme. */
export type AlertSettings = {
  /** Ligado por alarme. Desligado é escolha legítima e frequente. */
  on: Record<AlertKind, boolean>;
  /**
   * Dias de antecedência de cada aviso.
   *
   * `insumo`: quantos dias antes de o estoque acabar.
   * `pedido`: quantos dias antes da data pedida pelo cliente.
   * `validade`: quantos dias antes de o lote vencer.
   * `volume` não usa dia: ele compara com as faixas abaixo.
   */
  daysAhead: Record<Exclude<AlertKind, 'volume' | 'ambiente'>, number>;
  /**
   * A folga que a empresa quer antes de comprar, somada ao prazo OBSERVADO do
   * fornecedor.
   *
   * Entrou aqui em 6 de setembro para acabar com uma contradição que ninguém
   * tinha visto: o aplicativo tinha DUAS RÉGUAS para a mesma decisão de compra.
   * A ficha do insumo dizia "compre" quando a cobertura chegava ao prazo do
   * fornecedor mais a folga; o aviso ficava calado até `daysAhead.insumo`, que é
   * um número fixo sem prazo nenhum dentro. Com fornecedor de seis dias e folga
   * de dois, a tela pedia para comprar a oito dias de cobertura e a notificação
   * só falava a três — cinco dias em que o app discordava de si mesmo.
   *
   * `daysAhead.insumo` não morreu: virou o PISO de quando não se sabe o prazo,
   * que é o caso de quem nunca anotou a data de um pedido. O aviso é tão
   * inteligente quanto o dado permite, e nunca mais burro que a configuração.
   */
  purchaseSafetyDays: number;
  /**
   * As faixas de volume, em porcentagem do nível cheio do item.
   *
   * Desenho do dono, e ele é melhor que piso e teto: "amarelo entre 30 e 40,
   * vermelho até 25, azul acima de 80, e zerado". A diferença é que porcentagem
   * se lê igual em qualquer item — 20% de polpa e 20% de palito significam a
   * mesma coisa para quem passa o olho, e dois números absolutos não.
   *
   * `red` e `yellow` são tetos: até `red` é vermelho, até `yellow` é amarelo.
   * `blue` é piso: acima dele é azul, que NÃO é erro — é câmara cheia e dinheiro
   * parado, que é uma decisão diferente da de comprar.
   *
   * Entre `yellow` e `blue` não existe faixa, e é de propósito: é o estado
   * normal, e estado normal é calado. "Está tudo bem" é resposta válida.
   */
  bands: {
    red: number;
    yellow: number;
    blue: number;
    /**
     * Se a faixa azul INTERROMPE, e não apenas pinta.
     *
     * Desligado por padrão, e essa é a única decisão deste módulo que contraria a
     * leitura literal do que o dono pediu — então ela vem escrita. Ele desenhou
     * quatro faixas, e faixa é cor; nada nisso dizia que todas as quatro devem
     * acordar alguém.
     *
     * Almoxarifado cheio depois de uma compra é estado DESEJADO, e um aviso
     * diário sobre estado desejado é exatamente o alerta que ensina a ignorar
     * alerta — a Lei 7, aplicada ao caso em que o app está certo e chato ao mesmo
     * tempo. A câmara que enche até parar a produção é o caso em que ele importa,
     * e é por isso que o caminho existe em vez de eu escolher pelos dois.
     */
    notifyFull: boolean;
  };
  /**
   * O minuto do dia em que o aviso chega, 0 a 1439 — hora E minuto.
   *
   * Era uma lista de seis horas que eu escolhi (5, 6, 7, 8, 12, 18), e o dono
   * cortou com razão: "nem toda fábrica funciona igual". Oferecer seis opções não
   * é configurar, é um menu disfarçado de escolha — e a fábrica que começa às
   * 5h30 não estava em nenhuma delas.
   *
   * Minuto do dia e não hora+minuto separados porque é UM fato: "às 5h30". Dois
   * campos no tipo abrem a porta para um estado impossível (hora 5, minuto 90),
   * e a tela que os coleta já os junta antes de gravar.
   *
   * O padrão continua sendo sete da manhã, e o padrão tem motivo: o aviso serve
   * para quem está começando o turno, e notificação de madrugada é despertador —
   * aparelho que acorda a pessoa é aparelho silenciado para sempre, junto com o
   * aviso que importava. Mas padrão é ponto de partida, não regra.
   */
  minuteOfDay: number;
  /**
   * Em que dias da semana avisar, bit 0 no domingo (`src/domain/agreement`).
   *
   * Zero significa TODOS os dias, e não nenhum: uma configuração vazia que
   * silenciasse tudo seria a forma mais fácil de o aplicativo emudecer sem
   * ninguém ter pedido.
   */
  weekdays: number;
};

export const DEFAULT_ALERTS: AlertSettings = {
  // O ambiente nasce LIGADO, ao contrário do volume, e a diferença é o custo do
  // erro: câmara fora de faixa estraga o estoque inteiro em uma noite, e o
  // aviso não depende de nenhuma régua que alguém precise cadastrar antes — a
  // faixa vem do lugar, e sem lugar medido não existe aviso nenhum de qualquer
  // forma.
  on: { insumo: true, pedido: true, volume: false, validade: true, ambiente: true },
  daysAhead: { insumo: 3, pedido: 2, validade: 7 },
  purchaseSafetyDays: 2,
  bands: { red: 25, yellow: 40, blue: 80, notifyFull: false },
  minuteOfDay: 7 * 60,
  weekdays: 0,
};

/**
 * Em que faixa um saldo está, contra o nível cheio daquele item.
 *
 * Nulo quando o item não tem nível cheio cadastrado, e isso é o ponto: sem
 * referência o aplicativo não sabe o que é pouco, e inventar uma régua para
 * poder pintar a linha seria número que ninguém pode conferir.
 *
 * `zerado` é faixa própria e não "vermelho extremo": acabou é outro fato — não
 * dá para produzir, e a decisão não é comprar mais cedo, é parar de prometer.
 */
export type VolumeBand = 'zerado' | 'vermelho' | 'amarelo' | 'verde' | 'azul';

/**
 * Quanto do cheio está ali, em por cento — a conta que a faixa e a frase compartilham.
 *
 * Ela estava escrita três vezes: a faixa do alerta, o número que a frase diz, e a linha
 * embaixo do item no almoxarifado. Três cópias da mesma divisão é como a faixa e a frase
 * passam a discordar sem ninguém notar — a faixa dizendo vermelho e o texto dizendo 21%,
 * porque uma arredondou e a outra não.
 *
 * Não arredonda: quem precisa de inteiro arredonda no fim, uma vez. A faixa compara
 * contra os limites com a fração inteira, que é o que evita 20,4% cair em vermelho num
 * lugar e amarelo no outro.
 */
export function parcelaDoCheio(onHand: number, fullLevel: number): number {
  return fullLevel > 0 ? (onHand / fullLevel) * 100 : 0;
}

export function volumeBand(
  onHand: number,
  fullLevel: number | null,
  bands: AlertSettings['bands'],
): VolumeBand | null {
  if (fullLevel === null || !(fullLevel > 0)) return null;
  if (onHand <= 0) return 'zerado';

  const share = parcelaDoCheio(onHand, fullLevel);
  if (share <= bands.red) return 'vermelho';
  if (share <= bands.yellow) return 'amarelo';
  if (share >= bands.blue) return 'azul';
  return 'verde';
}

/**
 * As faixas que PODEM notificar. O verde pinta e nunca interrompe; o azul
 * interrompe só quando a casa liga.
 *
 * Esta é a linha onde a Lei 7 vive neste módulo: um aviso de que está tudo bem
 * chega uma vez, e a partir da segunda ele ensina a ignorar o aviso de que não
 * está.
 */
const FAIXAS_QUE_AVISAM = new Set<VolumeBand>(['zerado', 'vermelho', 'amarelo', 'azul']);

/** Um aviso pronto para virar frase: o fato, e o número que o gerou. */
export type Alert = {
  kind: AlertKind;
  /** O que o aviso é sobre. Item, produto ou lugar, conforme o alarme. */
  subjectId: string;
  subject: string;
  /** O número que decidiu o aviso: dias que faltam, unidades que faltam, ou % do cheio. */
  amount: number;
  /** Só no aviso de volume: em que faixa o saldo caiu. */
  band?: VolumeBand;
  /**
   * Quantas LOJAS estão esperando, no aviso de pedido.
   *
   * Cada aviso tem a unidade dele — dias para insumo e validade, porcentagem
   * para volume, lojas para pedido —, e é isso que faz a frase decidir alguma
   * coisa em vez de informar um número solto.
   */
  places?: number;
  /** A unidade do número, quando ele não é dia nem porcentagem: °C, %, dB. */
  unit?: string;
  /** Qual grandeza saiu da faixa: `temperature`, `humidity`, o que vier. */
  quantity?: string;
  /** O código do lote, no aviso de validade — o que está escrito no saco. */
  code?: string;
  /**
   * A faixa que o lugar tem cadastrada, no aviso de ambiente.
   *
   * Lei 3 — nenhum número aparece sozinho, sempre com a comparação. `-8 °C` não
   * decide nada; `-8 °C, e a faixa é de -22 a -16` diz que a porta ficou aberta.
   * E é a mesma faixa que ORDENA: um freezer a -8 num limite de -16 está oito
   * graus fora, e a -14 está dois — quem decide primeiro é o de oito.
   */
  min?: number | null;
  max?: number | null;
  /**
   * Dias até a data pedida, no aviso de pedido. Negativo é pedido ATRASADO.
   *
   * Ele é o que ordena: o `amount` do pedido é quanto falta produzir, e faltar
   * 50 para amanhã decide antes de faltar 300 para a semana que vem.
   */
  daysUntil?: number;
};

/** Os fatos de onde os avisos saem. Nada aqui fala português. */
export type AlertFacts = {
  /** Cobertura por item, em dias, pelo consumo que o livro-razão viu. */
  cover: readonly {
    itemId: string;
    name: string;
    daysLeft: number;
    /**
     * Quantos dias o fornecedor deste item leva, pela média das notas.
     *
     * Nulo é "ninguém anotou quando pediu", e é um caso diferente de zero: sem
     * ele o aviso cai no piso configurado em vez de inventar um prazo.
     */
    leadTimeDays: number | null;
  }[];
  /** Pedidos com o que falta produzir, para quando, e de quem. */
  orders: readonly {
    itemId: string;
    name: string;
    missing: number;
    /** Dias entre hoje e o dia pedido. Negativo é pedido atrasado. */
    daysUntil: number;
    /**
     * A loja que pediu. É o que permite o aviso contar LOJAS e não itens.
     *
     * Pedido do dono, e a razão é a decisão que ele toma: "faltam 300 picolés"
     * não diz se é uma loja para ligar ou quatro para reorganizar o dia.
     */
    placeId: string;
  }[];
  /** Saldo contra o nível cheio do item. Sem nível, o item não alarma. */
  volumes: readonly {
    itemId: string;
    name: string;
    onHand: number;
    fullLevel: number | null;
  }[];
  /**
   * Lotes com validade, e quantos dias faltam. Negativo é lote JÁ VENCIDO.
   *
   * O `name` é o do produto, e ele entrou porque a notificação dizia só o código:
   * *"Lote 20260903-01 vence em 3 dias"* na tela de bloqueio não diz o que é, e
   * quem lê não vai ao aplicativo descobrir — o código é para o rótulo na câmara,
   * onde ele está escrito no saco.
   */
  expiring: readonly { lotId: string; code: string; name: string; daysLeft: number }[];
  /**
   * A última leitura de cada grandeza medida, contra a faixa do lugar.
   *
   * Uma câmara sem faixa cadastrada não entra: o aplicativo não sabe qual é a
   * temperatura boa da câmara de outra pessoa, e -18 é o número comum de freezer,
   * não uma verdade.
   */
  ambient: readonly {
    locationId: string;
    place: string;
    kind: string;
    value: number;
    unit: string;
    min: number | null;
    max: number | null;
    /** Quantas horas desde a medição. É o que separa "está quente" de "parou de medir". */
    hoursOld: number;
  }[];
};

/**
 * O que merece aviso hoje.
 *
 * Ordenado por urgência dentro de cada tipo — o mais apertado primeiro —, porque
 * uma notificação cabe uma frase e a frase tem que ser sobre o que decide.
 */
export function alertsDue(facts: AlertFacts, settings: AlertSettings): Alert[] {
  const out: Alert[] = [];

  if (settings.on.insumo) {
    for (const item of facts.cover) {
      // UMA régua, a mesma da ficha do insumo: o dia da decisão é o dia em que a
      // cobertura encosta no prazo do fornecedor mais a folga da empresa. Sem
      // prazo observado, o piso configurado — que é a resposta honesta de quem
      // ainda não anotou nenhuma data de pedido.
      const limite =
        item.leadTimeDays === null
          ? settings.daysAhead.insumo
          : item.leadTimeDays + settings.purchaseSafetyDays;
      if (item.daysLeft > limite) continue;
      out.push({ kind: 'insumo', subjectId: item.itemId, subject: item.name, amount: item.daysLeft });
    }
  }

  if (settings.on.pedido) {
    const emFalta = facts.orders.filter(
      (o) => o.missing > 0 && o.daysUntil <= settings.daysAhead.pedido,
    );
    // As lojas contam UMA VEZ, mesmo esperando três itens cada: o aviso é sobre
    // quantos telefonemas o dia vai ter, não sobre quantas linhas de pedido.
    const lojas = new Set(emFalta.map((o) => o.placeId)).size;
    for (const order of emFalta) {
      out.push({
        kind: 'pedido',
        subjectId: order.itemId,
        subject: order.name,
        amount: order.missing,
        places: lojas,
        daysUntil: order.daysUntil,
      });
    }
  }

  if (settings.on.volume) {
    for (const v of facts.volumes) {
      // Item sem nível cheio não alarma: o nível é o que transforma um saldo em
      // juízo, e sem ele o aplicativo estaria inventando o que é pouco.
      const faixa = volumeBand(v.onHand, v.fullLevel, settings.bands);
      if (faixa === null || !FAIXAS_QUE_AVISAM.has(faixa)) continue;
      // O azul pinta sempre e só interrompe se a casa pediu.
      if (faixa === 'azul' && !settings.bands.notifyFull) continue;
      out.push({
        kind: 'volume',
        subjectId: v.itemId,
        subject: v.name,
        // A porcentagem, que é o número que a frase vai dizer: "20% do cheio" se
        // lê igual em qualquer item, e o saldo cru não.
        amount: Math.round(parcelaDoCheio(v.onHand, v.fullLevel as number)),
        band: faixa,
      });
    }
  }

  if (settings.on.validade) {
    for (const lote of facts.expiring) {
      if (lote.daysLeft > settings.daysAhead.validade) continue;
      out.push({
        kind: 'validade',
        subjectId: lote.lotId,
        // O PRODUTO é o assunto, e o código é o endereço dele na câmara. Era o
        // contrário, e a notificação chegava dizendo um número de série.
        subject: lote.name,
        code: lote.code,
        amount: lote.daysLeft,
      });
    }
  }

  if (settings.on.ambiente) {
    for (const leitura of facts.ambient) {
      const abaixo = leitura.min !== null && leitura.value < leitura.min;
      const acima = leitura.max !== null && leitura.value > leitura.max;
      if (!abaixo && !acima) continue;
      out.push({
        kind: 'ambiente',
        subjectId: leitura.locationId,
        subject: leitura.place,
        amount: leitura.value,
        unit: leitura.unit,
        quantity: leitura.kind,
        min: leitura.min,
        max: leitura.max,
      });
    }
  }

  // O ambiente vem PRIMEIRO, e a ordem é o custo do erro: insumo que acaba custa
  // uma compra atrasada; câmara fora de faixa custa o estoque inteiro numa noite.
  const urgencia: Record<AlertKind, number> = {
    ambiente: 0,
    insumo: 1,
    pedido: 2,
    validade: 3,
    volume: 4,
  };
  return out.sort((a, b) => {
    if (urgencia[a.kind] !== urgencia[b.kind]) return urgencia[a.kind] - urgencia[b.kind];
    const ca = ordemDentroDoTipo(a);
    const cb = ordemDentroDoTipo(b);
    return ca[0] - cb[0] || ca[1] - cb[1];
  });
}

/**
 * A chave que ordena dois avisos DO MESMO TIPO — menor decide primeiro.
 *
 * Ela existe porque a ordenação usava `amount` para os cinco, e `amount` não é a
 * mesma grandeza em cinco tipos. Em dois deles a comparação estava invertida, e
 * as duas erram no aviso que CHEGA — o `index.ts` manda `avisos[0]` e só ele:
 *
 *  - **pedido**: `amount` é quanto FALTA produzir, e ordenar por ele crescente
 *    punha na frente o pedido de que falta menos. Faltar 50 caixas para ontem
 *    decide hoje; faltar 300 para a semana que vem decide semana que vem. Então
 *    ordena por `daysUntil` (negativo é atrasado, e atrasado vem primeiro), e o
 *    desempate é quanto falta, do maior para o menor.
 *  - **ambiente**: `amount` é a temperatura MEDIDA, e ordenar por ela crescente
 *    punha o freezer mais frio na frente — o de -25 antes do de -8, quando a
 *    faixa é -22 a -16. O que decide é a distância PARA FORA da faixa, do maior
 *    para o menor: oito graus acima do teto é estoque derretendo, dois graus é
 *    porta mal fechada.
 *
 * Nos outros três `amount` já era a régua certa e continua: dias que faltam para
 * o insumo acabar e para o lote vencer, e parcela do cheio no volume — nos três,
 * menor é mais apertado.
 *
 * A devolução é PAR para o desempate ficar aqui, e não espalhado no `sort`: quem
 * acrescentar um tipo escreve as duas metades da régua dele num lugar só.
 */
export function ordemDentroDoTipo(alert: Alert): readonly [number, number] {
  if (alert.kind === 'pedido') {
    // Sem `daysUntil` o pedido não perde a vez: ele cai para o fim do próprio
    // tipo, que é o que um fato incompleto merece — nunca para a frente do
    // atrasado de verdade.
    return [alert.daysUntil ?? Number.POSITIVE_INFINITY, -alert.amount];
  }
  if (alert.kind === 'ambiente') {
    const abaixo = alert.min === null || alert.min === undefined ? 0 : alert.min - alert.amount;
    const acima = alert.max === null || alert.max === undefined ? 0 : alert.amount - alert.max;
    // Só um dos dois pode ser positivo — não existe faixa em que o valor esteja
    // abaixo do piso e acima do teto ao mesmo tempo.
    return [-Math.max(abaixo, acima), 0];
  }
  return [alert.amount, 0];
}

/**
 * Se hoje é dia de avisar, pelos dias que a empresa escolheu.
 *
 * Zero é todos os dias, e essa é a decisão que impede o silêncio acidental.
 */
export function alertsRunToday(settings: AlertSettings, weekday: number): boolean {
  if (settings.weekdays === 0) return true;
  if (weekday < 0 || weekday > 6) return false;
  return (settings.weekdays & (1 << weekday)) !== 0;
}

/**
 * O próximo instante de aviso, a partir de agora.
 *
 * Devolve o mesmo dia quando a hora ainda não passou, e o próximo dia válido
 * quando já passou. Nunca devolve um instante no passado: notificação agendada
 * para trás não dispara, e o aviso desaparece sem ninguém saber.
 */
export function nextAlertAt(
  settings: AlertSettings,
  now: Date,
  /** Quantos dias à frente procurar. Uma semana cobre qualquer configuração. */
  horizon = 8,
): Date | null {
  for (let ahead = 0; ahead < horizon; ahead += 1) {
    const dia = new Date(now);
    dia.setDate(dia.getDate() + ahead);
    dia.setHours(Math.floor(settings.minuteOfDay / 60), settings.minuteOfDay % 60, 0, 0);
    if (dia.getTime() <= now.getTime()) continue;
    if (!alertsRunToday(settings, dia.getDay())) continue;
    return dia;
  }
  return null;
}
