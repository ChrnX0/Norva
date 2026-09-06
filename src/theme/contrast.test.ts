import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TINTA_CLARA, TINTA_ESCURA, contraste, tintaSobre } from './contraste';
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

// A régua mora em `contraste.ts` agora, porque o aplicativo também precisa dela
// em tempo de execução: o botão escolhe a tinta dele medindo, não declarando.

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

/**
 * O passo mínimo entre as três tintas — e por que "maior que" não bastava.
 *
 * **A cicatriz é de horas atrás e é minha.** Subir `inkFaint` até a régua da WCAG
 * empurrou ela para cima de `inkMuted` nos dois temas CLAROS: no Papel ficaram 5,07
 * e 5,34 contra o papel — 5% de diferença, que existe na conta e não existe no olho.
 * A guarda pedia ordem, e 5,34 > 5,07 passa. Três camadas viraram duas, a tela que
 * separa rótulo de corpo por tom ficou plana, e quem viu foi o dono abrindo o
 * aplicativo: *"cadê o tema papel light"*.
 *
 * 1,35× é o piso, e ele não é gosto: os dois temas ESCUROS, que estavam prontos,
 * medem 1,5× entre camadas. Eles são a referência que o claro perdeu.
 */
const PASSO = 1.35;

test('the three inks stay a hierarchy, not three names for one gray', () => {
  const frouxas: string[] = [];
  for (const { nome, cores } of paletas()) {
    const forte = contraste(cores.ink, cores.paper);
    const medio = contraste(cores.inkMuted, cores.paper);
    const fraco = contraste(cores.inkFaint, cores.paper);
    if (forte / medio < PASSO) frouxas.push(`${nome}: forte/média = ${(forte / medio).toFixed(2)}`);
    if (medio / fraco < PASSO) frouxas.push(`${nome}: média/fraca = ${(medio / fraco).toFixed(2)}`);
  }

  assert.deepEqual(
    frouxas,
    [],
    `estas camadas de tinta estão perto demais para o olho separar:\n  ${frouxas.join('\n  ')}\n` +
      `O piso é ${PASSO}× de razão de contraste entre camadas. Ordem não é hierarquia: ` +
      'duas tintas a 5% de distância passam em "maior que" e desenham a mesma tela plana.',
  );
});

/**
 * A palavra do botão, sobre a cor com que ele é de fato pintado.
 *
 * A guarda de cima mede as tintas de TEXTO sobre os fundos de PÁGINA, e passou
 * verde durante todo o tempo em que o botão primário do Papel escuro escrevia em
 * tinta escura sobre marrom médio. Ela não estava errada: estava medindo outra
 * coisa — o vizinho da propriedade, de novo, que é a família de defeito que este
 * repositório já registrou quatro vezes.
 *
 * O botão é a **única massa de cor forte** de uma tela e carrega a ação; se há um
 * texto neste aplicativo que não pode ficar ilegível, é esse. Aqui se mede o par
 * de verdade: cada cor com que um botão pode ser preenchido — os oito acentos de
 * área de cada paleta e a marca de cada paisagem — contra a tinta que o
 * `tintaSobre` escolheria para ela.
 */
test('the word on a button is legible on every colour a button is painted with', () => {
  const AREAS = ['apricot', 'mint', 'lilac', 'sage', 'sky', 'mist', 'danger', 'warning'] as const;
  const fracas: string[] = [];

  for (const { nome, cores } of paletas()) {
    const fundos = new Set<string>();
    for (const area of AREAS) if (cores[area]) fundos.add(cores[area]);
    for (const fundo of fundos) {
      const tinta = tintaSobre(fundo, TINTA_CLARA, TINTA_ESCURA);
      const razao = contraste(tinta, fundo);
      if (razao < MINIMO) fracas.push(`${nome}: ${tinta} sobre ${fundo} dá ${razao.toFixed(2)}:1`);
    }
  }

  // E as cinco paisagens do Orgânico, que pintam o botão pela `brand`.
  for (const m of FONTE.matchAll(/(\w+): \{ brand: '(#[0-9A-Fa-f]{6})'/g)) {
    const fundo = m[2];
    const tinta = tintaSobre(fundo, TINTA_CLARA, TINTA_ESCURA);
    const razao = contraste(tinta, fundo);
    if (razao < MINIMO) fracas.push(`paisagem ${m[1]}: ${tinta} sobre ${fundo} dá ${razao.toFixed(2)}:1`);
  }

  assert.deepEqual(
    fracas,
    [],
    `a palavra do botão reprova a régua de ${MINIMO}:1 nestas cores:\n  ${fracas.join('\n  ')}\n` +
      'Botão é a ação da tela: ilegível ali não é um detalhe de estilo.',
  );
});

/**
 * Os pontos de quebra são coerentes entre si, ou o telefone paga.
 *
 * Três números decidem a largura da página, e eles têm uma ordem obrigatória:
 * a medida de uma coluna (600), o ponto em que a página vira duas (840) e a
 * medida das duas juntas (900). Um dedo errado em qualquer um faz a grade de duas
 * colunas descer para o telefone — 393 dp partidos ao meio são duas tiras de 190,
 * que é menos que a largura de um botão.
 *
 * Isto é barato de conferir e caro de descobrir na tela de alguém.
 */
test('the width breakpoints keep the phone out of the two-column grid', async () => {
  const { MEDIDA_DA_PAGINA, MEDIDA_EM_PARES, PARES_A_PARTIR_DE } = await import('./tokens');

  // O piso do Android é 360 e o telefone comum é ~400 (CLAUDE.md). Nenhum dos
  // dois pode alcançar o ponto de parear.
  assert.ok(PARES_A_PARTIR_DE > 412, `${PARES_A_PARTIR_DE} deixaria um telefone parear`);

  // Parear só faz sentido depois que uma coluna já parou de crescer.
  assert.ok(
    PARES_A_PARTIR_DE > MEDIDA_DA_PAGINA,
    'a página vira duas colunas antes de a primeira parar de crescer',
  );

  // E as duas colunas precisam caber, com folga para o vão: cada uma tem de sair
  // mais larga que o telefone em que os cartões foram desenhados.
  assert.ok(
    MEDIDA_EM_PARES / 2 > 412,
    `cada coluna sairia com ${MEDIDA_EM_PARES / 2} dp, mais estreita que um telefone`,
  );
  assert.ok(MEDIDA_EM_PARES >= PARES_A_PARTIR_DE, 'a medida em pares não pode ser menor que o ponto de quebra');
});
