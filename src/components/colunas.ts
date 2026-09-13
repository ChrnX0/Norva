/**
 * Qual coluna recebe cada peça, quando a tela vira duas.
 *
 * Separado do casco por um motivo só: aqui não há tela nenhuma, então a regra
 * pode ser exercitada com número em vez de foto. O `CollapsingHeader` mede as
 * alturas e pergunta; quem decide é isto.
 *
 * **O defeito que isto conserta.** A primeira versão alternava — primeiro à
 * esquerda, segundo à direita — e alternar ignora altura: duas peças altas caem
 * do mesmo lado e o pé das colunas fica desigual pela soma da diferença. Estava
 * escrito como limitação conhecida no `docs/roadmap.md` (*"empacotar sem medir
 * altura só é justo por cima"*), e é o último resto do layout do tablet.
 *
 * **E a regra gulosa sozinha NÃO era melhor que alternar — o teste provou o
 * contrário do que eu tinha escrito aqui.** Guloso na ordem da leitura põe cada
 * peça na coluna mais baixa do momento, e isso é uma decisão local: com as
 * alturas `290, 229, 119, 384, 236` ele fecha com 90 de desnível e alternar
 * fecha com 32, porque o 384 chega quando a escolha certa já passou. Eu tinha
 * escrito "melhor que alternar em todo caso" no docblock, em cem sorteios um
 * caso caiu, e a frase era minha — não do código.
 *
 * Então a regra é: **calcula as duas e fica com o pé menor.** As duas preservam
 * a ordem da leitura, as duas custam uma passada, e escolher entre elas é a
 * única forma de a promessa "nunca pior que antes" ser verdade em vez de
 * plausível. Empate fica com alternar, que é o desenho que o dono já viu.
 */
export function distribuir(alturas: readonly number[]): (0 | 1)[] {
  const guloso = gulosamente(alturas);
  const alterna = alternando(alturas);
  return desnivel(alturas, guloso) < desnivel(alturas, alterna) ? guloso : alterna;
}

/** Cada peça na coluna mais baixa do momento em que ela chega. */
function gulosamente(alturas: readonly number[]): (0 | 1)[] {
  const soma = [0, 0];
  return alturas.map((altura) => {
    // Empate à esquerda: é o que mantém a leitura começando onde ela sempre
    // começou, e o que faz uma peça só ficar do lado esquerdo.
    const lado: 0 | 1 = soma[0] <= soma[1] ? 0 : 1;
    soma[lado] += altura;
    return lado;
  });
}

/**
 * Como a versão anterior distribuía — e ela continua no páreo, não como
 * referência histórica: em parte das formas de cartão ela ganha.
 */
export function alternando(alturas: readonly number[]): (0 | 1)[] {
  return alturas.map((_, i) => ((i % 2) as 0 | 1));
}

/**
 * O desnível do pé, em dp — o número que esta peça existe para diminuir.
 *
 * Serve à escolha acima e ao teste, e é o que torna "melhor" conferível em vez
 * de argumentado.
 */
export function desnivel(alturas: readonly number[], lados: readonly (0 | 1)[]): number {
  const soma = [0, 0];
  alturas.forEach((altura, i) => {
    soma[lados[i] ?? 0] += altura;
  });
  return Math.abs(soma[0] - soma[1]);
}
