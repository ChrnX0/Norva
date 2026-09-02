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
 * O nível de correção é o **M**: recupera 15% do código danificado. É o que
 * sobrevive a gelo, dedo sujo e uma dobra - sem crescer a grade como o Q e o H
 * fariam.
 */
export function qrModules(text: string): boolean[][] {
  const code = create(text, { errorCorrectionLevel: 'M' });
  const { size, data } = code.modules;

  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(data[y * size + x] === 1);
    rows.push(row);
  }
  return rows;
}
