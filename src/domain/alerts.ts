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

export type AlertKind = 'insumo' | 'pedido' | 'volume' | 'validade';

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
  daysAhead: Record<Exclude<AlertKind, 'volume'>, number>;
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
  bands: { red: number; yellow: number; blue: number };
  /**
   * A hora local do aviso, 0 a 23.
   *
   * Sete da manhã como padrão porque o aviso serve para quem está começando o
   * turno. Notificação às três da manhã não é informação, é despertador — e
   * aparelho que acorda a pessoa de madrugada é aparelho que ela silencia para
   * sempre, junto com o aviso que importava.
   */
  hour: number;
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
  on: { insumo: true, pedido: true, volume: false, validade: true },
  daysAhead: { insumo: 3, pedido: 2, validade: 7 },
  bands: { red: 25, yellow: 40, blue: 80 },
  hour: 7,
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

export function volumeBand(
  onHand: number,
  fullLevel: number | null,
  bands: AlertSettings['bands'],
): VolumeBand | null {
  if (fullLevel === null || !(fullLevel > 0)) return null;
  if (onHand <= 0) return 'zerado';

  const share = (onHand / fullLevel) * 100;
  if (share <= bands.red) return 'vermelho';
  if (share <= bands.yellow) return 'amarelo';
  if (share >= bands.blue) return 'azul';
  return 'verde';
}

/**
 * As faixas que merecem NOTIFICAÇÃO. O verde pinta e não interrompe.
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
};

/** Os fatos de onde os avisos saem. Nada aqui fala português. */
export type AlertFacts = {
  /** Cobertura por item, em dias, pelo consumo que o livro-razão viu. */
  cover: readonly { itemId: string; name: string; daysLeft: number }[];
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
  /** Lotes com validade, e quantos dias faltam. */
  expiring: readonly { lotId: string; code: string; daysLeft: number }[];
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
      if (item.daysLeft > settings.daysAhead.insumo) continue;
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
      });
    }
  }

  if (settings.on.volume) {
    for (const v of facts.volumes) {
      // Item sem nível cheio não alarma: o nível é o que transforma um saldo em
      // juízo, e sem ele o aplicativo estaria inventando o que é pouco.
      const faixa = volumeBand(v.onHand, v.fullLevel, settings.bands);
      if (faixa === null || !FAIXAS_QUE_AVISAM.has(faixa)) continue;
      out.push({
        kind: 'volume',
        subjectId: v.itemId,
        subject: v.name,
        // A porcentagem, que é o número que a frase vai dizer: "20% do cheio" se
        // lê igual em qualquer item, e o saldo cru não.
        amount: Math.round((v.onHand / (v.fullLevel as number)) * 100),
        band: faixa,
      });
    }
  }

  if (settings.on.validade) {
    for (const lote of facts.expiring) {
      if (lote.daysLeft > settings.daysAhead.validade) continue;
      out.push({ kind: 'validade', subjectId: lote.lotId, subject: lote.code, amount: lote.daysLeft });
    }
  }

  const urgencia: Record<AlertKind, number> = { insumo: 0, pedido: 1, validade: 2, volume: 3 };
  return out.sort((a, b) => urgencia[a.kind] - urgencia[b.kind] || a.amount - b.amount);
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
    dia.setHours(settings.hour, 0, 0, 0);
    if (dia.getTime() <= now.getTime()) continue;
    if (!alertsRunToday(settings, dia.getDay())) continue;
    return dia;
  }
  return null;
}
