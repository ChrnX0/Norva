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

/** Teto do ganho. Abaixo de 1 é estável; 0,8 deixa margem para o arredondamento. */
export const GANHO_MAX = 0.8;

/** A cena sai primeiro, e é a fração da faixa em que ela some. */
export const FRACAO_CENA = 0.6;

/** A linha de olho some no meio da faixa. */
export const FRACAO_OLHO = 0.5;

/**
 * A entrelinha que o texto ocupa além do corpo da fonte.
 *
 * Encolher o título de 34 para 22 não remove 12 dp de altura: remove 12 vezes a
 * entrelinha, porque a caixa do texto acompanha o corpo. Contar só o corpo subestima
 * o ganho, e subestimar ganho num laço é o erro que não se pode cometer aqui.
 */
export const ENTRELINHA = 1.25;

export type Colapso = {
  /** Altura da cena do cabeçalho, em dp — ela é quem manda no ganho. */
  alturaDaCena: number;
  /** Altura da linha de olho, em dp. */
  olho: number;
  /** Quanto o corpo do título encolhe, em dp. */
  titulo: number;
};

/**
 * A faixa de rolagem em que o cabeçalho encolhe, em dp.
 *
 * Sai da conta do ganho no trecho mais carregado — o começo, onde as três peças
 * encolhem ao mesmo tempo — e não de um número escolhido a olho.
 */
export function faixaDeColapso({ alturaDaCena, olho, titulo }: Colapso): number {
  const removidoPorFaixa =
    alturaDaCena / FRACAO_CENA + olho / FRACAO_OLHO + titulo * ENTRELINHA;
  return removidoPorFaixa / GANHO_MAX;
}
