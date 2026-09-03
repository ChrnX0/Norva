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
