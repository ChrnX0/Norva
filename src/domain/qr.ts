import { create } from 'qrcode/lib/core/qrcode.js';

/**
 * O quadrado preto e branco que a câmara fria precisa ler.
 *
 * **O que vai dentro dele é a decisão que importa aqui, e ela é ergonômica.**
 * O `CLAUDE.md` nomeia o risco da Fase 3 com todas as letras: *"tela capacitiva
 * a -18°C, luva, QR a um braço de distância"*. Ler a um braço de distância não
 * é questão de câmera - é questão de **tamanho do módulo**, o quadradinho
 * elementar do código. Quanto menos informação, menos módulos; menos módulos,
 * cada um maior no mesmo pedaço de papel.
 *
 * Por isso o QR carrega o **código do lote** (`20260902-01`, onze caracteres) e
 * não o uuid dele. A conta é direta e foi conferida antes de escrever esta
 * linha: o código cabe na versão 1, que é uma grade de 21 por 21 - a menor que
 * existe. O uuid, com trinta e seis caracteres, exigiria a versão 3, 29 por 29:
 * numa etiqueta de quatro centímetros, o módulo cai de 1,9mm para 1,4mm, e
 * perde-se um quarto do tamanho justamente na distância em que a leitura já é
 * difícil.
 *
 * E há o segundo motivo, que vale mais que o primeiro: **o código do lote é
 * legível por gente.** Etiqueta que congela, descola ou é arranhada por caixa
 * empilhada acontece toda semana numa fábrica; com o código impresso ao lado do
 * quadrado, quem está lá digita os onze caracteres e segue. Com o uuid, não
 * segue.
 *
 * O nível de correção é o **H**, o mais alto: recupera 30% do código
 * danificado. E ele é de graça aqui, o que só se soube medindo: com onze
 * caracteres, os quatro níveis - L, M, Q e H - cabem na mesma grade de 21 por
 * 21. A primeira versão deste arquivo escolhia M "para não crescer a grade", e
 * essa frase estava errada; a mutação que trocava M por H sobreviveu à suíte
 * inteira justamente porque não era defeito nenhum, era melhoria.
 *
 * Num código que vai congelar, descascar e levar caixa empilhada em cima, o
 * dobro de tolerância a dano pelo mesmo tamanho não se recusa.
 */
export function qrModules(text: string): boolean[][] {
  const code = create(text, { errorCorrectionLevel: 'H' });
  const { size, data } = code.modules;

  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(data[y * size + x] === 1);
    rows.push(row);
  }
  return rows;
}

/** Quantos módulos de branco cercam o código. O padrão exige quatro. */
export const QUIET_ZONE = 4;

/**
 * O código como um caminho SVG só, com a zona de silêncio em volta.
 *
 * Mora aqui, e não no componente, porque é **regra** e não desenho: a margem
 * branca de quatro módulos é exigida pelo padrão, e sem ela o papelão da caixa
 * encosta no código e o leitor desiste. É a parte que todo mundo corta para
 * caber, é a que faz falta, e no componente ela não tinha como ser testada.
 *
 * Um caminho só, e não um retângulo por módulo: a grade tem 441 módulos, e 441
 * nós de SVG custam a cada quadro num celular barato - que é o que a fábrica
 * compra.
 */
export function qrPath(text: string): { path: string; span: number } {
  const modules = qrModules(text);
  const span = modules.length + QUIET_ZONE * 2;

  let path = '';
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (modules[y][x]) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { path, span };
}
