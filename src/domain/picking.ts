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
