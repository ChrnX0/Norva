/**
 * Quanto de rolagem o cabeçalho leva para encolher — e por que isso não é gosto.
 *
 * **O defeito, achado pelo dono no tablet dele em 10 de setembro:** *"a tela fica
 * tremendo muito rápido para cima e para baixo quando eu tento rolar"*, em toda tela
 * que rola e em nenhuma que cabe inteira.
 *
 * **O laço.** O cabeçalho é IRMÃO da lista de rolagem e os dois dividem a altura
 * (`flex: 1`). Então: rolar encolhe o cabeçalho → a janela da lista cresce na mesma
 * medida → a borda de cima da lista sobe → o dedo, parado no vidro, passa a estar mais
 * embaixo DENTRO da lista → o Android lê isso como rolagem para trás → o cabeçalho
 * cresce → e volta ao começo. É realimentação negativa, e realimentação negativa com
 * ganho acima de 1 não se acomoda: ela oscila, na frequência do quadro.
 *
 * **O ganho é `dAltura/dRolagem`**, e ele era muito maior que 1 porque a cena encolhia
 * inteira num pedaço de rolagem menor que a própria cena — 72 px de faixa fixa para
 * uma cena que tem 65 a 112 dp conforme a largura:
 *
 * | largura | cena | ganho (cena + olho + título) |
 * |---|---|---|
 * | 360 dp | 64,9 | 1,50 + 0,50 + 0,17 = **2,17** |
 * | 393 dp | 71,4 | 1,65 + 0,50 + 0,17 = **2,32** |
 * | 800 dp | 112,4 | 2,60 + 0,50 + 0,17 = **3,27** |
 *
 * Repare que ele PIORA com a largura: quanto maior a tela, mais alta a cena, e a faixa
 * continuava 72. Por isso o defeito é mais violento em tablet que em telefone — e por
 * isso quem olhou só no emulador a 393 dp viu tremer menos.
 *
 * **O conserto é a faixa deixar de ser constante.** Ela passa a sair da altura que se
 * quer remover, de forma que o ganho instantâneo fique num teto abaixo de 1. O formato
 * do movimento não muda em nada — a cena continua saindo antes do título e mais
 * depressa que ele, nas mesmas frações — só o comprimento da faixa é que passa a
 * respeitar a física do laço.
 *
 * A alternativa era tirar o cabeçalho do fluxo (sobreposto, com `paddingTop` fixo na
 * lista e só `translateY`), que mata o laço pela raiz e ainda tira o recálculo de
 * layout por quadro. É o conserto certo a prazo e mexe em como as 27 telas empilham;
 * este aqui é uma linha de geometria e resolve o que treme hoje.
 */

/**
 * Teto do ganho — e **0,8 estava do lado certo da estabilidade e do lado errado do
 * conforto**, medido pelo dono em 12 de setembro: *"tem algumas animações que ainda
 * dão uma tremida. Não chega a travar como antes, mas percebe-se uma
 * chacoalhadazinha."*
 *
 * Abaixo de 1 o laço não diverge — o travamento acabou, e isso é o que ele confirmou.
 * O que a conta anterior parou de perguntar é **quanto tempo** ele leva para se
 * acomodar. Realimentação de ganho `g` decai como `g^n` a cada quadro, então:
 *
 * | ganho | quadros até sobrar 2% | a 60 Hz |
 * |---|---|---|
 * | 0,8 | 18 | **300 ms** |
 * | 0,6 | 8 | 130 ms |
 * | 0,5 | 6 | 100 ms |
 *
 * Trezentos milissegundos de oscilação decrescente, **re-excitada a cada quadro em que
 * o dedo anda**, é exatamente uma chacoalhada: nunca chega a travar e nunca para.
 * Estabilidade era o piso, não o alvo.
 *
 * **O preço é o comprimento da faixa, e é o mesmo botão.** `faixa = removido / ganho`:
 * a 393 dp são 155 dp de altura removida, então 0,8 dava 194 dp de rolagem para o
 * cabeçalho encolher inteiro e 0,6 dá 258 dp — um terço mais de rolagem, num movimento
 * que fica mais calmo. Abaixo de 0,5 a faixa passa de 310 dp e o cabeçalho deixa de
 * encolher em página curta, que é perder a função para ganhar conforto.
 *
 * **E isto continua sendo amortecimento, não conserto de raiz.** O laço existe porque a
 * altura removida é altura de LAYOUT — o cabeçalho é irmão da lista. Tirá-lo do fluxo
 * (sobreposto, `paddingTop` constante na lista, só `translateY`) põe o ganho em ZERO e
 * dispensa este teto inteiro. É o item de raiz do `docs/roadmap.md`, e ele mexe em como
 * as 27 telas empilham: pede o tablet do dono na mesma rodada, porque nenhum
 * instrumento deste container vê composição.
 */
export const GANHO_MAX = 0.6;

/** A cena sai primeiro, e é a fração da faixa em que ela some. */
export const FRACAO_CENA = 0.6;

/** A linha de olho some no meio da faixa. */
export const FRACAO_OLHO = 0.5;

export type Colapso = {
  /** Altura da cena do cabeçalho, em dp — ela é quem manda no ganho. */
  alturaDaCena: number;
  /** Altura da linha de olho, em dp. */
  olho: number;
};

/**
 * **O título NÃO entra nesta conta, e a razão é um segundo defeito.**
 *
 * Ele encolhia por `fontSize`, e isso reflui o texto: um título de duas linhas a 34
 * cabe em uma a 22, e a passagem de duas para uma é uma queda de altura descontínua de
 * uma linha inteira. Um teto de ganho limita a derivada de rampas contínuas e não pode
 * nada contra descontinuidade — ali ela é infinita. Hoje o título encolhe por `scale`,
 * que não reflui e não passa pelo Yoga, então ele não muda a altura do cabeçalho e não
 * pertence ao orçamento.
 */

/**
 * A faixa de rolagem em que o cabeçalho encolhe, em dp.
 *
 * Sai da conta do ganho no trecho mais carregado — o começo, onde as três peças
 * encolhem ao mesmo tempo — e não de um número escolhido a olho.
 */
export function faixaDeColapso({ alturaDaCena, olho }: Colapso): number {
  const removidoPorFaixa = alturaDaCena / FRACAO_CENA + olho / FRACAO_OLHO;
  return removidoPorFaixa / GANHO_MAX;
}
