import { assentamentoMs, motion } from '@/theme/tokens';

/**
 * A rede embaixo de toda entrada — uma só, para os seis lugares que entram.
 *
 * O defeito que a trouxe foi fotografado em 9 de setembro: a capa do primeiro
 * dia inteira a **22% de opacidade**, contraste de 1,56:1 num piso de 4,5:1,
 * parada assim por minutos. Não era cor — era a animação de chegada congelada no
 * meio, com a página deslocada 20 dp e reduzida a 97%, exatamente o que
 * `enterScale` faz com a mola em 0,217. A causa mora fora da peça: as animações
 * de ambiente saturam a thread de UI, que é a mesma que move estas molas.
 *
 * **E o primeiro conserto foi num arquivo só, que é o defeito irmão.** Este
 * projeto tem a regra escrita — *"conserto de pele não termina no arquivo que o
 * mostrou"* — e eu consertei o `Reveal`, provei no aparelho, e segui. Meia hora
 * depois a tela de Produção apareceu com o cartão inteiro e o botão desbotados:
 * `Alive` tem as mesmas cinco linhas, e `Sparkline`, `Bars`, `Drain`, `Sky` e a
 * peça da capa também. Seis cópias do mesmo raciocínio, e a que eu tinha olhado
 * era uma.
 *
 * O que cada uma esconde quando a mola não chega não é a mesma coisa, e por isso
 * nenhuma é enfeite:
 *
 * | quem | o que some |
 * |---|---|
 * | `Reveal` | a fila inteira da capa |
 * | `Alive` | o cartão e o botão da tela |
 * | `Sparkline` | a curva |
 * | `Bars` | a altura das colunas — o gráfico passa a MOSTRAR outro número |
 * | `Drain` | o quanto falta no tanque |
 * | `Peca` | o detalhe que a pessoa acabou de abrir |
 *
 * O teto é o dobro do que a animação leva para assentar, então numa entrada
 * saudável ele chega depois de ela ter terminado e não corta nada: atribuir o
 * valor de destino a quem já vale aquilo não se vê.
 *
 * @param chegar o que fazer quando o prazo vencer — pôr os valores no destino.
 * @param atrasoMs o atraso da própria animação, que o teto tem de respeitar.
 * @param duracaoMs quanto ela leva depois de começar. O padrão é a mola da casa.
 */
export function redeDaEntrada(
  chegar: () => void,
  atrasoMs = 0,
  duracaoMs = assentamentoMs(motion.settle),
): () => void {
  const teto = setTimeout(chegar, atrasoMs + duracaoMs * 2);
  return () => clearTimeout(teto);
}
