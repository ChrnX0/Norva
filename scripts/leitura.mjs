/**
 * O veredito das cinco larguras — e por que ele tem TRÊS respostas e não duas.
 *
 * **A guarda que este arquivo conserta não podia falhar, que é o defeito que o
 * `CLAUDE.md` proíbe duas seções depois de descrevê-la.** Ela vivia dentro do
 * `aparelho.mjs` assim:
 *
 * ```js
 * titulos.push(parou.diz[0] ?? '');                      // leitura falhada vira ''
 * const vistos = [...new Set(titulos.filter(Boolean))];  // e o '' é descartado
 * return { igual: vistos.length <= 1 };                  // cinco vazios => "iguais"
 * ```
 *
 * Com o movimento de ambiente rodando — que é o estado NORMAL deste aplicativo — o
 * `uiautomator` responde `could not get idle state`, o `try/catch` do
 * `oQueDizATela()` devolve lista vazia, e as cinco leituras viram `''`. O conjunto
 * fica vazio, `[].length <= 1` é verdadeiro, e o comando anuncia *"as cinco são a
 * mesma tela"* tendo lido **nenhuma**.
 *
 * Não é um caso improvável: é o caso comum. A guarda estava afirmando exatamente o
 * que não conseguiu medir, e o `CLAUDE.md` registrava isso em voz alta — *"o que NÃO
 * existe é a conferência automática de que ela pegou"* — enquanto o comando
 * continuava saindo zero sem dizer nada a quem o roda.
 *
 * **A correção não é achar um jeito de ler; é parar de responder o que não se sabe.**
 * Ler a tela com o movimento ligado continua sendo problema em aberto (ele depende do
 * orçamento de movimento, que é decisão do dono). O que não depende de decisão nenhuma
 * é a diferença entre *"são iguais"* e *"não consegui olhar"*, e a segunda resposta
 * manda quem roda fazer o que o `CLAUDE.md` já pede: olhar as cinco.
 */

/**
 * @param {string[]} titulos uma entrada por largura; vazia quando a leitura falhou
 * @returns {{ veredito: 'iguais'|'diferentes'|'nao-sei', vistos: string[], lidas: number, de: number }}
 */
export function mesmaTelaEmTodas(titulos) {
  const de = titulos.length;
  const legiveis = titulos.filter((t) => typeof t === 'string' && t.trim() !== '');
  const vistos = [...new Set(legiveis)];

  // Duas leituras é o mínimo para a palavra "iguais" querer dizer alguma coisa: uma
  // só não compara com nada, e zero é o caso que fabricava o verde.
  if (legiveis.length < 2) return { veredito: 'nao-sei', vistos, lidas: legiveis.length, de };

  // Uma que destoa é a assinatura do defeito — e ela vale mesmo se as outras não
  // foram lidas: duas telas diferentes entre as legíveis já derrubam a comparação.
  if (vistos.length > 1) return { veredito: 'diferentes', vistos, lidas: legiveis.length, de };

  // Iguais SÓ quando todas as larguras foram lidas. Quatro iguais e uma ilegível não
  // é "iguais": a ilegível pode ser justamente a que não navegou, e é para ela que a
  // guarda existe.
  if (legiveis.length < de) return { veredito: 'nao-sei', vistos, lidas: legiveis.length, de };
  return { veredito: 'iguais', vistos, lidas: legiveis.length, de };
}

/**
 * O que as três escalas de animação querem dizer — e elas NÃO querem dizer a mesma coisa.
 *
 * A leitura do aparelho fica no `aparelho.mjs`; a INTERPRETAÇÃO fica aqui, porque é ela
 * que erra em silêncio. Dois modos de errar, e os dois foram medidos em 11 de setembro:
 *
 * **1. `"null"` não é zero.** `settings get` responde a string `"null"` quando a chave
 * nunca foi mexida, e isso é o PADRÃO do sistema, que é 1. Lido como zero, o aviso sai
 * invertido — e aviso invertido é pior que nenhum, porque ensina a ignorar.
 *
 * **2. Só UMA das três chega ao aplicativo, e a primeira versão disto tratava as três
 * como iguais.** Conferido na fonte do React Native que está no disco
 * (`AccessibilityInfoModule.kt:100-115`): `isReduceMotionEnabled()` lê
 * `Settings.Global.TRANSITION_ANIMATION_SCALE` e mais nada — e devolve `false` quando ela
 * é nula. As outras duas param animação do ANDROID (transição de janela, duração de
 * animador) e não tocam no que `src/components/vida.ts` pergunta.
 *
 * A diferença importa porque as duas perguntas têm donos diferentes: *"o aplicativo está
 * vivo nesta foto?"* é do dono do produto, e responde só a `transition_animation_scale`;
 * *"a janela vai parar para o uiautomator ler?"* é do instrumento, e depende das três.
 * Uma função que devolvesse um booleano só estaria respondendo a pergunta errada para
 * uma das duas.
 */
export function interpretarMovimento(ditos) {
  const valores = ditos.map((d) => {
    const t = String(d ?? '').trim();
    if (t === 'null' || t === '') return 1;
    return Number(t);
  });
  if (valores.some((v) => Number.isNaN(v))) return null;
  return {
    /** O APLICATIVO anima? É o que `isReduceMotionEnabled()` responde, e é só a primeira. */
    appAnima: valores[0] > 0,
    /** O ANDROID anima? As três juntas — é isto que decide se a janela fica ociosa. */
    sistemaAnima: valores.every((v) => v > 0),
    valores,
  };
}
