/**
 * De onde vem o número que a tela de transferência já traz preenchido.
 *
 * A regra é curta e mora aqui, e não na tela, por uma razão que este projeto
 * aprendeu duas vezes no mesmo dia: **o `mutate` roda a suíte rápida**, e regra
 * dentro de componente de React não é alcançada por ela. A zona de silêncio do
 * QR sobreviveu a dois mutantes pelo mesmo motivo, e desceu para o domínio pela
 * mesma razão.
 *
 * A ordem de preferência é o conteúdo da regra:
 *
 * **O pedido ganha do hábito.** Quando existe pedido em aberto para aquela loja,
 * é ele que a separação deve sugerir — quem está com a lista na mão quer atender
 * o que foi combinado, não repetir a semana passada.
 *
 * **O hábito ganha do vazio.** Sem pedido, vale quanto foi da última vez: é o
 * palpite certo para a fábrica que repõe por rotina, e é melhor que zero.
 *
 * **E o vazio é resposta.** Sem os dois, não há palpite, e o campo nasce vazio —
 * inventar um número aqui seria pedir para alguém conferir uma sugestão que não
 * saiu de lugar nenhum.
 */
export function pickSuggestion(sources: {
  /** Quanto a loja pediu e ainda não recebeu. Nulo quando não há pedido. */
  ordered: number | null;
  /** Quanto foi para aquela loja da última vez. Nulo na primeira remessa. */
  lastSent: number | null;
}): number | null {
  return sources.ordered ?? sources.lastSent ?? null;
}


/**
 * Quais pedidos daquela loja o que SAIU HOJE cobre por inteiro.
 *
 * O nome do parâmetro é `sent` e o docblock dizia "a carga que acabou de sair" —
 * texto de antes de a cobertura passar a ser do dia. Quem carrega o caminhão faz
 * duas viagens até o freezer, e o pedido é do dia, não da viagem: comparar só
 * com a última carga fazia um pedido de dois itens nunca fechar. A frase da tela
 * ficou com a semântica antiga junto com esta, e as duas foram corrigidas.
 *
 * Existe porque o pedido só fecha se alguém lembrar de ir na tela de Pedidos —
 * e quem acabou de carregar o caminhão está com as mãos ocupadas. Sem fechar, a
 * separação continua sugerindo o pedido inteiro para sempre, e a capa continua
 * pedindo para produzir o que já saiu pela porta.
 *
 * **Só entra o pedido COBERTO.** Carga parcial não fecha nada: dizer "entregue"
 * quando faltaram quarenta caixas transforma uma falta que a loja vai cobrar num
 * pedido que o sistema diz cumprido — e o livro-razão, que é o único que não
 * mente, não tem como desmentir porque pedido não é livro-razão.
 *
 * E ela só SUGERE: quem fecha é a pessoa, no diálogo que diz o que vai
 * acontecer. O aplicativo sugere, nunca decide calado.
 */
export function ordersCoveredBy(
  orders: readonly { id: string; lines: readonly { itemId: string; baseUnits: number }[] }[],
  sent: ReadonlyMap<string, number>,
): string[] {
  return orders
    .filter((order) =>
      order.lines.every((line) => (sent.get(line.itemId) ?? 0) >= line.baseUnits),
    )
    .map((order) => order.id);
}


/** Uma promessa em pé: quem espera este item, quanto e para quando. */
export type Waiting = {
  orderId: string;
  placeId: string;
  /** Na unidade base do item. */
  baseUnits: number;
  /** `YYYY-MM-DD`, ou nulo quando o cliente não marcou dia. */
  requestedFor: string | null;
};

/** O que a carga digitada faz com o que já tinha dono. */
export type FreeToShip = {
  /** Soma do que as OUTRAS salas esperam deste item e ainda não receberam. */
  promised: number;
  /**
   * Saldo menos o que tem dono. **Pode ser negativo**, e negativo é notícia:
   * a fábrica já prometeu mais do que tem, antes desta carga existir.
   */
  free: number;
  /** Quem espera, o mais cedo primeiro. Vazio é o caso normal. */
  queue: Waiting[];
  /** Quanto faltaria para quem espera DEPOIS desta carga. Zero quando não falta. */
  short: number;
};

/**
 * Quanto dá para mandar sem quebrar uma promessa — e de quem é a promessa.
 *
 * **Existe porque a reserva tinha uma metade só.** A tela de anotar pedido já
 * subtraía o que outros pedidos reservaram (`livreDe`, em `app/orders/new.tsx`),
 * então prometer era seguro. Despachar não era: a transferência limitava pelo
 * saldo FÍSICO, e saldo físico não sabe de promessa. A Loja A pede 500 para
 * sexta, o freezer tem 600, e a carga de hoje para a Loja B podia levar as 600 —
 * o sistema disse "reservado" na hora de prometer e ficou calado na hora de
 * carregar o caminhão. Uma reserva que só uma tela honra não é reserva: é frase.
 *
 * **O pedido do DESTINO não é concorrente.** Mandar para a Loja A é exatamente o
 * que a promessa da Loja A pede: contá-la aqui faria a tela avisar contra a
 * própria separação, em toda carga legítima, e alerta que aparece sempre ensina
 * a ignorar alerta. Quem entra na fila é quem espera em OUTRO lugar.
 *
 * **E ela não impede.** Devolve fato — quanto tem dono, quem é o dono, quanto
 * faltaria depois desta carga — e a tela escreve a frase. Às vezes a loja está na
 * porta e a carga sai mesmo assim: quem decide é quem está lá, e o aplicativo
 * sugere, nunca decide calado. Bloquear aqui seria o sistema respondendo no lugar
 * de quem está com o caminhão aberto.
 *
 * A fila vem ordenada por data, sem dia marcado no fim — a mesma ordem do
 * `listOrders`, refeita aqui porque uma função pura que promete ordem não pode
 * depender de quem a chamou ter ordenado.
 *
 * **E ela tem horizonte, pelo mesmo motivo que o palpite tem.** Pedido para daqui
 * a cinco semanas não disputa o caminhão de hoje: a fábrica produz de novo antes
 * disso, e avisar sobre ele seria alarme que aparece sem ter o que evitar — que é
 * como se ensina alguém a ignorar alarme. O corte é o mesmo de `pickingFor` e do
 * `stockAgainstOrders`, inclusive na letra miúda: **pedido sem dia marcado conta
 * sempre**, porque ninguém sabe dizer que ele é distante.
 *
 * Sem isto a MESMA tela contava dois conjuntos de pedidos — um para sugerir o
 * número, outro para avisar sobre ele.
 */
export function freeToShip(input: {
  itemId: string;
  /** Para onde esta carga vai. */
  toPlaceId: string;
  /**
   * Até quando um pedido disputa esta carga, `YYYY-MM-DD`. Depois disso, a
   * fábrica produz de novo antes de a promessa vencer.
   */
  through: string;
  /** Saldo físico na sala de onde a carga sai. */
  onHand: number;
  /** Quanto a pessoa digitou, na unidade base. */
  amount: number;
  /**
   * Os pedidos em aberto da empresa. Os mesmos estados que a tela de pedido usa
   * para reservar (`pending` e `open`) — se as duas contarem pedidos diferentes,
   * volta a haver duas verdades, que é o defeito que isto conserta.
   */
  orders: readonly {
    id: string;
    placeId: string;
    requestedFor: string | null;
    lines: readonly { itemId: string; baseUnits: number }[];
  }[];
}): FreeToShip {
  const queue: Waiting[] = [];
  for (const order of input.orders) {
    if (order.placeId === input.toPlaceId) continue;
    if (order.requestedFor !== null && order.requestedFor > input.through) continue;
    const baseUnits = order.lines
      .filter((l) => l.itemId === input.itemId)
      .reduce((n, l) => n + l.baseUnits, 0);
    if (baseUnits <= 0) continue;
    queue.push({
      orderId: order.id,
      placeId: order.placeId,
      baseUnits,
      requestedFor: order.requestedFor,
    });
  }

  queue.sort((a, b) => {
    if (a.requestedFor === b.requestedFor) return 0;
    if (a.requestedFor === null) return 1;
    if (b.requestedFor === null) return -1;
    return a.requestedFor < b.requestedFor ? -1 : 1;
  });

  const promised = queue.reduce((n, w) => n + w.baseUnits, 0);
  return {
    promised,
    free: input.onHand - promised,
    queue,
    short: Math.max(0, promised - (input.onHand - input.amount)),
  };
}
