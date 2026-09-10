import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alturaDaCena } from './cenas/prancha';
import { readFileSync } from 'node:fs';
import { FRACAO_CENA, FRACAO_OLHO, faixaDeColapso, GANHO_MAX, type Colapso } from './cabecalho';

/**
 * O cabeçalho não pode encolher mais depressa do que a rolagem que o encolhe.
 *
 * Achado no tablet do dono em 10 de setembro: a tela treme para cima e para baixo em
 * toda tela que rola. A causa está no docblock do `cabecalho.ts` — cabeçalho e lista
 * dividem a altura, encolher um cresce o outro, e isso realimenta a própria rolagem.
 * O que decide se aquilo se acomoda ou oscila é UM número: `dAltura/dRolagem`.
 *
 * Esta guarda existe porque o número que estava lá era uma constante (`72`) e o
 * fenômeno depende da LARGURA da tela — a cena cresce com a coluna e a faixa não
 * crescia junto. Quem escrever a próxima cena, ou mexer numa fração, muda o ganho sem
 * perceber, e o defeito volta calado num aparelho que ninguém tem na mesa.
 */

/**
 * A altura do cabeçalho a uma dada rolagem, REMONTADA a partir do que a tela desenha.
 *
 * Esta função é de propósito uma segunda fonte: ela não pergunta nada ao
 * `faixaDeColapso` além da faixa, e refaz as três rampas do jeito que o
 * `CollapsingHeader` as escreve — `interpolate(scrollY, [0, faixa * fração], [alto, 0])`
 * com `CLAMP`. Se a álgebra da faixa estiver errada, a derivada medida aqui denuncia;
 * uma segunda função escrita pela mesma mão, com a mesma conta ao contrário, não
 * denunciaria nada — que é a regra desta casa sobre asserção com fonte derivada.
 */
function alturaEm(s: number, c: Colapso, faixa: number): number {
  const rampa = (alto: number, ate: number) =>
    ate <= 0 ? 0 : alto * (1 - Math.min(1, Math.max(0, s / ate)));
  return rampa(c.alturaDaCena, faixa * FRACAO_CENA) + rampa(c.olho, faixa * FRACAO_OLHO);
}

/** O maior `|dAltura/dRolagem|` que a tela chega a ter, medido por amostragem. */
function ganhoMedido(c: Colapso, faixa: number): number {
  if (faixa <= 0) return Infinity;
  const passo = faixa / 2000;
  let pior = 0;
  for (let s = 0; s < faixa; s += passo) {
    const d = Math.abs(alturaEm(s + passo, c, faixa) - alturaEm(s, c, faixa)) / passo;
    if (d > pior) pior = d;
  }
  return pior;
}

/** As larguras que este projeto exige medir, mais os extremos. */
const LARGURAS = [320, 360, 393, 430, 600, 720, 800, 900, 1024, 1280];

/** O que o `CollapsingHeader` remove, com as medidas de lá. */
function colapsoEm(largura: number, medida = 600): Colapso {
  return {
    alturaDaCena: alturaDaCena({
      larguraDaTela: largura,
      medidaDaColuna: medida,
      padding: 16,
      cabecalho: 'vinheta',
    }),
    olho: 18,
  };
}

test('o cabeçalho nunca encolhe mais rápido que a rolagem, em nenhuma largura', () => {
  for (const largura of LARGURAS) {
    for (const medida of [600, 900]) {
      const colapso = colapsoEm(largura, medida);
      const ganho = ganhoMedido(colapso, faixaDeColapso(colapso));
      assert.ok(
        ganho <= GANHO_MAX + 1e-9,
        `a ${largura} dp com coluna de ${medida} o ganho é ${ganho.toFixed(2)} — ` +
          'acima de 1 a tela treme, e foi assim que ela chegou no tablet do dono',
      );
    }
  }
});

test('a paisagem, que é mais alta que a vinheta, também fica abaixo do teto', () => {
  // A pele Orgânico sangra a cena de borda a borda: a mesma largura devolve uma cena
  // mais alta, e é justamente a que mais empurra o ganho para cima.
  for (const largura of LARGURAS) {
    const colapso: Colapso = {
      alturaDaCena: alturaDaCena({
        larguraDaTela: largura,
        medidaDaColuna: 900,
        padding: 16,
        cabecalho: 'paisagem',
      }),
      olho: 18,
    };
    const ganho = ganhoMedido(colapso, faixaDeColapso(colapso));
    assert.ok(ganho <= GANHO_MAX + 1e-9, `paisagem a ${largura} dp: ganho ${ganho.toFixed(2)}`);
  }
});

test('a régua acusa o ganho que o aplicativo TINHA, senão ela não guarda nada', () => {
  // O caso verdadeiro: a faixa constante de 72 que estava no código até hoje. Se esta
  // linha passar, a guarda não sabe distinguir o defeito do conserto.
  const noTablet = colapsoEm(800);
  assert.ok(
    ganhoMedido(noTablet, 72) > 3,
    'com a faixa velha de 72 o ganho no tablet passava de 3 — a guarda precisa ver isso',
  );
  const noTelefone = colapsoEm(393);
  assert.ok(ganhoMedido(noTelefone, 72) > 2, 'e passava de 2 no telefone comum');

  // E o caso falso, do outro lado: faixa generosa é estável, não é "sempre reprova".
  assert.ok(ganhoMedido(noTablet, 1000) < 0.5);
});

test('a faixa cresce com a tela, que é a metade que a constante não fazia', () => {
  const faixaTelefone = faixaDeColapso(colapsoEm(393));
  const faixaTablet = faixaDeColapso(colapsoEm(800));
  assert.ok(
    faixaTablet > faixaTelefone,
    'a cena é mais alta no tablet, então a faixa tem de ser mais longa — era 72 nos dois',
  );
});

test('o título encolhe por escala, e nunca por corpo de fonte', () => {
  /**
   * O segundo mecanismo do tremor, e o que o teto de ganho NÃO pega.
   *
   * `fontSize` reflui o texto. Um título de duas linhas a 34 cabe em uma a 22, e a
   * passagem de duas para uma é uma queda de altura descontínua de uma linha inteira —
   * derivada infinita num ponto, que nenhuma folga de faixa segura. Quatro títulos em
   * português caem nessa faixa hoje, e a lista muda a cada idioma e a cada tradução:
   * é por isso que a guarda mira o MECANISMO e não a lista.
   */
  const fonte = readFileSync('src/components/CollapsingHeader.tsx', 'utf8');
  const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const animado = semComentario.slice(semComentario.indexOf('const titleStyle'));
  const corpo = animado.slice(0, animado.indexOf('const overlineStyle'));

  assert.equal(
    /fontSize\s*:/.test(corpo),
    false,
    'animar fontSize reflui o título e o refluxo é descontínuo — encolha por transform',
  );
  assert.ok(/transform\s*:/.test(corpo), 'o título encolhe por transform');
  assert.ok(
    /transformOrigin/.test(semComentario),
    'sem origem à esquerda o título escorrega para o meio enquanto diminui',
  );
});

test('a régua do título vê a diferença entre encolher e reflui', () => {
  const comFonte = 'const titleStyle = x(() => ({ fontSize: i(s) })); const overlineStyle';
  const corpo = comFonte.slice(0, comFonte.indexOf('const overlineStyle'));
  assert.equal(/fontSize\s*:/.test(corpo), true, 'o caso verdadeiro tem de ser visto');
  const comEscala = 'const titleStyle = x(() => ({ transform: [{ scale: i(s) }] })); const overlineStyle';
  assert.equal(/fontSize\s*:/.test(comEscala.slice(0, comEscala.indexOf('const overlineStyle'))), false);
});
