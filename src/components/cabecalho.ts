/**
 * Quanto de rolagem o cabeçalho leva para encolher — e a história de três atos que
 * explica por que o número mudou de SIGNIFICADO duas vezes.
 *
 * **Ato 1 — o defeito, achado pelo dono no tablet em 10 de setembro:** *"a tela fica
 * tremendo muito rápido para cima e para baixo quando eu tento rolar"*, em toda tela que
 * rola e em nenhuma que cabe inteira.
 *
 * O laço era este: o cabeçalho era IRMÃO da lista e os dois dividiam a altura (`flex: 1`).
 * Rolar encolhia o cabeçalho → a janela da lista crescia na mesma medida → a borda de cima
 * da lista subia → o dedo, parado no vidro, passava a estar mais embaixo DENTRO da lista →
 * o Android lia isso como rolagem para trás → o cabeçalho crescia → e voltava ao começo.
 * Realimentação com ganho acima de 1 não se acomoda: oscila na frequência do quadro.
 *
 * O ganho era `dAltura/dRolagem`, e ele PIORAVA com a largura, porque a cena cresce com a
 * coluna e a faixa era a constante `72`:
 *
 * | largura | cena | ganho |
 * |---|---|---|
 * | 360 dp | 64,9 | **2,17** |
 * | 393 dp | 71,4 | **2,32** |
 * | 800 dp | 112,4 | **3,27** |
 *
 * **Ato 2 — o amortecimento, e por que ele não bastou.** A faixa deixou de ser constante e
 * passou a sair da altura que se remove, com um teto de ganho de 0,8: abaixo de 1 o laço
 * não diverge. O travamento acabou — o dono confirmou. E em 12 de setembro ele voltou com
 * a metade que faltava: *"não chega a travar como antes, mas percebe-se uma
 * chacoalhadazinha"*.
 *
 * As duas coisas eram verdadeiras ao mesmo tempo, e a conta diz por quê: **um critério de
 * estabilidade responde SE o sistema se acomoda, nunca EM QUANTO TEMPO.** Realimentação de
 * ganho `g` decai como `g^n` por quadro, então 0,8 leva 18 quadros — 300 ms a 60 Hz — para
 * a oscilação sobrar 2%, e ela é re-excitada a cada quadro em que o dedo anda. Nunca trava
 * e nunca para. Baixar para 0,6 levou isso a 8 quadros e custou um terço mais de rolagem,
 * porque era o mesmo botão: `faixa = removido / ganho`.
 *
 * **Ato 3 — o conserto de raiz, e ele estava escrito aqui como "a prazo".** O laço só
 * existia porque a altura removida era altura de **layout**. Hoje o cabeçalho está
 * SOBREPOSTO (`position: absolute`) e a lista carrega um `paddingTop` **constante** do
 * tamanho dele: encolher o cabeçalho não muda mais o tamanho da janela da lista, então a
 * borda de cima dela não se move e o dedo continua onde estava. **O ganho da realimentação
 * é ZERO** — não pequeno, zero —, e com ele vai embora o teto, o tempo de acomodação e o
 * recálculo de layout da lista a cada quadro.
 *
 * **E a faixa continua existindo, com outro dono.** O número que a limita agora não é
 * estabilidade: é **não abrir buraco**. Com o `paddingTop` constante, o topo do conteúdo
 * está sempre em `alturaDoCabecalho - rolagem`, e a base do cabeçalho em
 * `alturaDoCabecalho - removidoAté(rolagem)`. Se o cabeçalho remover altura mais rápido do
 * que a rolagem consumiu — taxa acima de 1 — a base dele sobe mais que o conteúdo e **abre
 * uma tira de papel vazio** entre os dois. Taxa 1 é a borda exata: o primeiro cartão fica
 * colado embaixo do cabeçalho enquanto ele encolhe, e depois desliza por baixo.
 *
 * Então a mesma álgebra de antes vale com significado novo, e a guarda de
 * `cabecalho.test.ts` mede a mesma derivada — o que mudou é a frase que ela protege e o
 * fato de a taxa ser **derivada** (a geometria decide) em vez de **escolhida** (0,8 e 0,6
 * eram margens de engenharia).
 *
 * *O formato do movimento nunca mudou em nenhum dos três atos: a cena sai antes do título e
 * mais depressa que ele, nas mesmas frações.*
 */

/**
 * A taxa máxima de altura removida por dp de rolagem.
 *
 * **É 1 por geometria, não por gosto:** acima de 1 o cabeçalho sobe mais depressa que o
 * conteúdo e abre papel vazio entre os dois; abaixo de 1 o conteúdo desliza por baixo do
 * cabeçalho antes de ele terminar de encolher, o que é invisível e só alonga a faixa sem
 * comprar nada. Um é o único valor que encosta os dois sem sobrepor.
 *
 * **Medido, não deduzido** — varrendo dez larguras, as duas medidas de coluna e quatro mil
 * pontos de cada faixa, com a rampa remontada do jeito que a tela a desenha:
 *
 * | taxa | pior buraco |
 * |---|---|
 * | 1 | **0,000 dp** |
 * | 1,2 | **60,76 dp** (a 900 dp de largura, rolagem 321,8) |
 * | 0,8 | 0,000 dp |
 *
 * Sessenta dp de papel vazio no meio da tela não é sutileza de geometria: é a folha rasgada.
 * E o 0,8 na última linha é o caso falso da régua — ele também não abre buraco, então a taxa
 * é TETO e não igualdade; 1 é o teto que ainda encosta os dois.
 *
 * *Ela ocupa o lugar do antigo `GANHO_MAX` (0,8, depois 0,6), que era teto de ESTABILIDADE
 * de um laço que não existe mais. Nome trocado de propósito: o número que mede conforto e o
 * número que mede geometria não devem compartilhar identificador, senão a próxima pessoa a
 * mexer nele conserta a coisa errada.*
 */
export const TAXA_MAX = 1;

/** A cena sai primeiro, e é a fração da faixa em que ela some. */
export const FRACAO_CENA = 0.6;

/** A linha de olho some no meio da faixa. */
export const FRACAO_OLHO = 0.5;

export type Colapso = {
  /** Altura da cena do cabeçalho, em dp — ela é quem manda na taxa. */
  alturaDaCena: number;
  /** Altura da linha de olho, em dp. */
  olho: number;
};

/**
 * **O título NÃO entra nesta conta, e a razão é um segundo defeito.**
 *
 * Ele encolhia por `fontSize`, e isso reflui o texto: um título de duas linhas a 34 cabe em
 * uma a 22, e a passagem de duas para uma é uma queda de altura descontínua de uma linha
 * inteira. Um teto de taxa limita a derivada de rampas contínuas e não pode nada contra
 * descontinuidade — ali ela é infinita. Hoje o título encolhe por `scale`, que não reflui e
 * não passa pelo Yoga, então ele não muda a altura do cabeçalho e não pertence ao
 * orçamento.
 *
 * *E com o cabeçalho fora do fluxo isso deixou de ser sobre tremor e passou a ser sobre o
 * `paddingTop`: um título que reflui muda a altura MEDIDA do cabeçalho no meio da rolagem,
 * e a medida é o que a lista usa como piso. A regra é a mesma, o motivo é outro.*
 */

/**
 * A faixa de rolagem em que o cabeçalho encolhe, em dp.
 *
 * Sai da conta da taxa no trecho mais carregado — o começo, onde as duas peças encolhem ao
 * mesmo tempo — e não de um número escolhido a olho.
 */
export function faixaDeColapso({ alturaDaCena, olho }: Colapso): number {
  const removidoPorFaixa = alturaDaCena / FRACAO_CENA + olho / FRACAO_OLHO;
  return removidoPorFaixa / TAXA_MAX;
}

/**
 * Quanto o cabeçalho deve medir, antes de ele ter sido medido.
 *
 * **Existe por um quadro, e é o quadro que estraga a primeira impressão.** Com o cabeçalho
 * sobreposto, quem dá a posição do primeiro cartão é o `paddingTop` da lista, e ele vem da
 * medida do cabeçalho — que o `onLayout` só entrega DEPOIS do primeiro layout. Sem uma
 * estimativa, o primeiro quadro de toda tela desenha o conteúdo debaixo do título.
 *
 * **É piso, nunca teto**, e por isso pode errar para baixo sem consequência: o
 * `CollapsingHeader` usa o MAIOR entre isto e a medida real. O caso que ela erra é o título
 * de duas linhas — quatro em português, e a lista muda a cada idioma —, e é exatamente o
 * caso que a medida corrige um quadro depois.
 *
 * @param corpoDoTitulo o corpo da fonte do título, em dp. A entrelinha de 1,25 é a do
 *   React Native para texto sem `lineHeight` declarado; declarar um aqui só para a conta
 *   fechar seria acertar o número mudando o alvo.
 */
export function alturaEstimadaDoCabecalho({
  acimaDoTitulo,
  abaixoDaCena,
  olho,
  alturaDaCena,
  corpoDoTitulo,
}: Colapso & {
  /** Recorte do sistema mais o respiro de cima. */
  acimaDoTitulo: number;
  /** O respiro entre a cena e o primeiro cartão. */
  abaixoDaCena: number;
  corpoDoTitulo: number;
}): number {
  return acimaDoTitulo + olho + Math.round(corpoDoTitulo * 1.25) + alturaDaCena + abaixoDaCena;
}
