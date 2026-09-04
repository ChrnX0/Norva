import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * O texto pequeno tem de ser legível no corredor da câmara, com luva e
 * condensação — e isso é um número, não uma opinião.
 *
 * **A cicatriz.** A auditoria mediu `inkFaint` em **2,55:1** no tema que sai da
 * caixa, com 124 corridas de texto de 11 e 13 px pintadas com ele. O rótulo que diz
 * O QUE o número é ("valor parado", "por mil", "conferido em") ficava ilegível
 * exatamente onde o aplicativo é usado: tela suja, luz de galpão, luva de frio. O
 * número aparecia sozinho, o que é o oposto da Lei 3.
 *
 * A régua é a da WCAG para texto normal: **4,5:1**. Este projeto não tem texto
 * grande o bastante para a régua de 3:1 valer — a maior fonte de corpo é 15 px, e
 * as três camadas de tinta são usadas em 11, 13 e 15.
 *
 * **Por que ler o arquivo em vez de importar os tokens.** Importar traria os
 * objetos já montados, e o `Palette` do Papel herda campos do Orgânico por
 * espalhamento: o teste passaria a medir o que a herança produziu, não o que está
 * escrito. Lendo o texto, cada paleta é medida com a cor que alguém digitou ali —
 * e uma cor nova, colada amanhã, entra na medição sem ninguém acrescentar nada.
 */
const FONTE = readFileSync('src/theme/tokens.ts', 'utf8');

/** As camadas de tinta que pintam TEXTO, na ordem em que somem. */
const TINTAS = ['ink', 'inkMuted', 'inkFaint'] as const;
/** Os fundos em que uma tela deste aplicativo pinta texto. */
const FUNDOS = ['paper', 'surface', 'sunken'] as const;
/** WCAG AA para texto normal. */
const MINIMO = 4.5;

const luminancia = (hex: string): number => {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
};

export const contraste = (a: string, b: string): number => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
};

/** Cada paleta escrita no arquivo, com as cores que alguém digitou nela. */
function paletas(): { nome: string; cores: Record<string, string> }[] {
  const achadas: { nome: string; cores: Record<string, string> }[] = [];
  for (const m of FONTE.matchAll(/const (\w*[Pp]alette|\w*(?:Claro|Escuro))[^=]*= \{/g)) {
    const inicio = m.index ?? 0;
    const corpo = FONTE.slice(inicio, FONTE.indexOf('\n};', inicio));
    // Se dentro do corpo há outra declaração, o bloco não fechou onde eu pensei —
    // foi o caso de `const palettes = { light, dark }`, que não tem cor nenhuma e
    // engoliu a paleta escrita abaixo dela, medindo a mesma coisa duas vezes com o
    // nome errado.
    if (/\n(?:export )?(?:const|type|function) /.test(corpo)) continue;

    const cores: Record<string, string> = {};
    for (const c of corpo.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) cores[c[1]] = c[2];
    // Só o que é paleta de verdade: tem fundo e tem tinta.
    if (cores.paper && cores.ink) achadas.push({ nome: m[1], cores });
  }
  return achadas;
}

test('every ink the app writes text with is legible on every ground it writes on', () => {
  const todas = paletas();
  assert.ok(todas.length >= 4, `a leitura das paletas veio com ${todas.length} — a comparação seria de graça`);

  const fracas: string[] = [];
  for (const { nome, cores } of todas) {
    for (const tinta of TINTAS) {
      for (const fundo of FUNDOS) {
        if (!cores[tinta] || !cores[fundo]) continue;
        const razao = contraste(cores[tinta], cores[fundo]);
        if (razao < MINIMO) {
          fracas.push(`${nome}.${tinta} sobre ${fundo}: ${razao.toFixed(2)}:1 (${cores[tinta]} / ${cores[fundo]})`);
        }
      }
    }
  }

  assert.deepEqual(
    fracas,
    [],
    `estas combinações reprovam a régua de ${MINIMO}:1 da WCAG:\n  ${fracas.join('\n  ')}\n` +
      'Texto de 11 e 13 px pintado assim é ilegível no corredor da câmara, com luva e ' +
      'condensação — e é justamente o rótulo que diz O QUE o número é.',
  );
});

test('the ruler is a ruler: black on white passes, gray on gray does not', () => {
  // A régua conferida com dois casos que não dependem de nenhuma paleta.
  assert.ok(contraste('#000000', '#FFFFFF') > 20, 'preto no branco é 21:1');
  assert.ok(contraste('#777777', '#888888') < 1.5, 'cinza em cinza não passa');
  // E ela é simétrica: contraste não tem ordem.
  assert.equal(contraste('#123456', '#FEDCBA'), contraste('#FEDCBA', '#123456'));
});

test('the three inks stay a hierarchy, not three names for one gray', () => {
  // Legível não pode virar "tudo igual": a tela tem três camadas de tinta porque
  // o rótulo, o corpo e o dado têm pesos diferentes. Se `inkFaint` subisse até
  // encostar em `inkMuted`, a hierarquia sumiria e a tela ficaria plana.
  for (const { nome, cores } of paletas()) {
    const forte = contraste(cores.ink, cores.paper);
    const medio = contraste(cores.inkMuted, cores.paper);
    const fraco = contraste(cores.inkFaint, cores.paper);
    assert.ok(forte > medio, `${nome}: a tinta forte tem de ser mais forte que a média`);
    assert.ok(medio > fraco, `${nome}: a média tem de ser mais forte que a fraca`);
  }
});
