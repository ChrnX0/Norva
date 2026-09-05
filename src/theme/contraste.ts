/**
 * A régua de contraste, e a escolha da tinta que passa nela.
 *
 * Ela morava dentro de `contrast.test.ts`, e isso não era arrumação: era o
 * motivo de o defeito existir. A guarda media `ink`, `inkMuted` e `inkFaint`
 * contra `paper`, `surface` e `sunken` — as tintas de TEXTO sobre os fundos de
 * PÁGINA — e nunca contra a cor de um botão, que é a única massa de cor forte de
 * uma tela e onde a palavra tem de ser lida de luva, no corredor da câmara.
 *
 * O resultado apareceu na foto do Papel escuro: "Procurar cidade" escrito em
 * tinta escura sobre um marrom médio, quase ilegível. O `onAccent` da paleta é
 * escolhido para o ACENTO DA ÁREA, e no Papel o botão é pintado com a marca —
 * duas cores diferentes, uma tinta só, decidida uma vez para a errada.
 *
 * Aqui a tinta não é declarada: é **medida**. `tintaSobre` compara as duas
 * candidatas com o fundo real e devolve a que ganha, o que não tem como
 * divergir no dia em que alguém acrescentar uma paleta.
 *
 * **E as candidatas são o branco e o quase-preto, não as tintas da paleta.** A
 * primeira versão passou `color.ink`, que num tema ESCURO é claro — então as duas
 * candidatas eram claras e a medida escolhia entre duas derrotas. A guarda pegou
 * na primeira execução, com vinte e cinco combinações reprovadas, e o defeito era
 * dela e não das paletas.
 */

/** As duas únicas candidatas: só elas alcançam os dois extremos de fundo. */
export const TINTA_CLARA = '#FFFFFF';
export const TINTA_ESCURA = '#141414';

/** Luminância relativa da WCAG, de 0 (preto) a 1 (branco). */
function luminancia(hex: string): number {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/** A razão de contraste entre duas cores, de 1:1 a 21:1. Não tem ordem. */
export function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * A tinta que se lê sobre este fundo: a que tiver mais contraste com ele.
 *
 * Duas candidatas e não um cálculo de luminância com corte em 0,5, porque o
 * corte erra na faixa média — que é justamente onde moram os acentos deste
 * aplicativo. Comparar as duas razões acerta sempre, e custa duas contas.
 */
export function tintaSobre(fundo: string, clara: string, escura: string): string {
  return contraste(clara, fundo) >= contraste(escura, fundo) ? clara : escura;
}
