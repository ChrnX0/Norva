/**
 * O que a cena da fábrica mostra do dia — e quando ela não mostra nada.
 *
 * Mora fora do componente por dois motivos, e o segundo é o que decidiu: um
 * módulo puro tem teste (a `.tsx` arrasta o React Native e nenhum `node --test`
 * a carrega), e a legenda debaixo do desenho precisa da MESMA resposta que o
 * desenho — enquanto fossem cálculos separados, nada impediria a frase de jurar
 * que a fábrica está parada com a chaminé fumegando ao lado.
 */

export type CenaDaFabrica = {
  /** Há tacho aberto agora. */
  running: boolean;
  /** O dia contra ontem, de 0 a 1. Nulo quando não há com o que comparar. */
  dayShare: number | null;
  /** Saiu carga hoje. */
  shipped: boolean;
};

/**
 * Nada do dia se mexe — as três peças que dependem de fato estão todas fora.
 *
 * Isto existe porque o dono abriu o aplicativo no tablet e leu o desenho parado
 * como defeito: *"faltam cores em alguns elementos e principalmente animações…
 * só o sol e o floco de neve se mexem"*. Ele estava vendo a cena funcionar
 * exatamente como escrito — fumaça só com tacho aberto, picolé só com produção
 * do dia, caixa só com carga que saiu — e mesmo assim leu quebrado, porque
 * metade do desenho tinha sumido sem uma palavra explicando.
 *
 * A decisão de que *a ausência é dado* continua de pé; o que faltava era a
 * segunda metade dela. Dado que ninguém consegue ler não é dado, é silêncio — e
 * a Lei da Inteligência já cobrava isso: toda conclusão abre a conta.
 */
export function cenaParada(c: CenaDaFabrica): boolean {
  return !c.running && !c.shipped && (c.dayShare ?? 0) === 0;
}
