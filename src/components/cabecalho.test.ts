import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alturaDaCena } from './cenas/prancha';
import { readFileSync } from 'node:fs';
import { FRACAO_CENA, FRACAO_OLHO, faixaDeColapso, TAXA_MAX, type Colapso } from './cabecalho';

/**
 * O cabeçalho não pode encolher mais depressa do que a rolagem que o encolhe.
 *
 * **A frase é a mesma de 10 de setembro e o motivo dela mudou duas vezes** — a história dos
 * três atos está no docblock do `cabecalho.ts`. Em resumo: ela nasceu medindo
 * ESTABILIDADE, porque o cabeçalho era irmão da lista e a altura removida realimentava a
 * própria rolagem; hoje o cabeçalho está fora do fluxo, a realimentação é zero, e a mesma
 * derivada mede GEOMETRIA — taxa acima de 1 abre uma tira de papel vazio entre a base do
 * cabeçalho e o topo do conteúdo.
 *
 * A guarda continua valendo por onde nasceu: o número que estava lá era uma constante
 * (`72`) e o fenômeno depende da LARGURA — a cena cresce com a coluna. Quem escrever a
 * próxima cena, ou mexer numa fração, muda a taxa sem perceber.
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
      const taxa = ganhoMedido(colapso, faixaDeColapso(colapso));
      assert.ok(
        taxa <= TAXA_MAX + 1e-9,
        `a ${largura} dp com coluna de ${medida} a taxa é ${taxa.toFixed(2)} — ` +
          'acima de 1 o cabeçalho sobe mais que o conteúdo e abre papel vazio entre os dois',
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
    assert.ok(ganho <= TAXA_MAX + 1e-9, `paisagem a ${largura} dp: ganho ${ganho.toFixed(2)}`);
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

/**
 * **A guarda que impede o laço voltar, e ela é de FONTE porque a unidade não renderiza.**
 *
 * As duas guardas de cima medem a álgebra da faixa e continuam certas. Nenhuma delas vê a
 * coisa que de fato matou o tremor: o cabeçalho ter saído do fluxo. Pondo-o de volta como
 * irmão da lista — três linhas de JSX — a álgebra segue idêntica, as duas passam verdes, e
 * a realimentação volta inteira com o ganho 1,73 que a taxa de hoje permite (e permite por
 * estar medindo geometria, não estabilidade).
 *
 * É o padrão desta casa para regra de tela que o teste de unidade não alcança, o mesmo do
 * `purchaseToBaseUnits`: a invariante vira guarda de fonte. As três condições são as três
 * metades do desenho — sobreposto, `paddingTop` da lista vindo de valor simples, e nada
 * animando esse `paddingTop`.
 *
 * *Provada nos dois sentidos contra a árvore remendada, uma condição por vez, em 12 de
 * setembro — e a terceira só depois de a régua ser consertada: ver o comentário dela.
 * Cabeçalho devolvido ao fluxo reprova a primeira (7→6 passando); `paddingTop: 0` reprova a
 * segunda; um `useAnimatedStyle` devolvendo `paddingTop` reprova a terceira.*
 */
test('o cabeçalho mora FORA do fluxo, senão a realimentação volta', () => {
  const fonte = readFileSync(new URL('./CollapsingHeader.tsx', import.meta.url), 'utf8');

  assert.match(
    fonte,
    /cabecalhoSobreposto:\s*\{[^}]*position:\s*'absolute'/,
    'o cabeçalho voltou para o fluxo: irmão da lista, encolher um cresce o outro, e o dedo ' +
      'parado no vidro passa a estar mais embaixo dentro da lista — é o tremor de 10 de setembro',
  );

  assert.match(
    fonte,
    /paddingTop:\s*alturaDoCabecalho,/,
    'a lista perdeu o paddingTop do tamanho do cabeçalho: com o cabeçalho sobreposto e sem ' +
      'esse respiro, o primeiro cartão nasce debaixo do título',
  );

  /**
   * **Anda pelos parênteses, e a primeira versão disto media NADA.**
   *
   * Ela era `/useAnimatedStyle\([^)]*paddingTop/` — e `[^)]*` para no primeiro `)`, que é o
   * `()` da arrow function que todo `useAnimatedStyle` recebe. A régua nunca chegava ao
   * corpo do estilo. Plantado o defeito que ela NOMEIA (um `useAnimatedStyle` devolvendo
   * `paddingTop`), ela ficou **verde**: 7 passando, zero falhando. As duas irmãs de cima
   * pegaram os defeitos delas na primeira tentativa; esta sobreviveu ao próprio.
   */
  const estilosAnimados = (texto: string): string[] => {
    const marca = 'useAnimatedStyle(';
    const trechos: string[] = [];
    for (let i = texto.indexOf(marca); i !== -1; i = texto.indexOf(marca, i + 1)) {
      let nivel = 0;
      let j = i + marca.length - 1;
      do {
        if (texto[j] === '(') nivel += 1;
        else if (texto[j] === ')') nivel -= 1;
        j += 1;
      } while (nivel > 0 && j < texto.length);
      trechos.push(texto.slice(i, j));
    }
    return trechos;
  };

  const animamOPadding = estilosAnimados(fonte).filter((t) => t.includes('paddingTop'));
  assert.deepEqual(
    animamOPadding,
    [],
    'alguém animou o paddingTop: isso troca o laço de roupa e o traz de volta inteiro — ' +
      'a janela da lista volta a depender da altura do cabeçalho, quadro por quadro',
  );
});
