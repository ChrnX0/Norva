import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A resposta de "reduzir movimento" tem UM dono, e ele é `vida.ts`.
 *
 * O módulo existe com o motivo escrito no docblock dele — *"vinte e seis glifos
 * perguntando ao sistema, cada um na sua montagem, é vinte e seis idas ao módulo
 * nativo para responder a mesma coisa"* — e onze leituras em nove arquivos falavam
 * com a ponte direto. A auditoria de 9 de setembro contou.
 *
 * **E o custo não era o principal.** Quem furava o cache pintava a peça no ponto de
 * PARTIDA e só saía de lá quando a promessa voltasse: com "reduzir movimento" ligado,
 * o `Alive` ficava invisível, a `Sparkline` com a curva apagada, o `Bars` com sete
 * colunas no piso, o `Drain` com 2% de largura e a faixa de temperatura com zero. Um
 * desenho pela metade — para quem pediu justamente que nada se mexesse — e depois um
 * pulo. É o defeito que o `Reveal` documenta ter consertado, repetido em nove peças.
 *
 * A guarda tem o caso positivo e o negativo dentro: `vida.ts` PODE perguntar (é ele
 * quem guarda), e ninguém mais pode.
 */

function arquivos(dir: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivos(caminho));
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

export function perguntamAoSistema(fontes: readonly { arquivo: string; texto: string }[]): string[] {
  return fontes
    .filter(
      (f) =>
        !f.arquivo.endsWith('components/vida.ts') &&
        f.texto.includes('AccessibilityInfo.isReduceMotionEnabled'),
    )
    .map((f) => f.arquivo);
}

test('só o vida.ts pergunta ao sistema se o movimento está reduzido', () => {
  const fontes = [...arquivos('src'), ...arquivos('app')].map((arquivo) => ({
    arquivo,
    texto: readFileSync(arquivo, 'utf8'),
  }));

  assert.deepEqual(
    perguntamAoSistema(fontes),
    [],
    'estes furam o cache e pintam a peça no ponto de partida até a ponte responder',
  );

  // Positivo: o dono da resposta continua perguntando — senão a guarda estaria
  // medindo "ninguém pergunta", e o cache teria deixado de existir sem ninguém ver.
  const dono = readFileSync('src/components/vida.ts', 'utf8');
  assert.match(
    dono,
    /AccessibilityInfo\.isReduceMotionEnabled/,
    'o vida.ts é quem pergunta, uma vez, e guarda',
  );
});

test('a régua distingue quem pergunta de quem não pergunta', () => {
  // Positivo: um arquivo qualquer perguntando é achado.
  assert.deepEqual(
    perguntamAoSistema([
      { arquivo: 'src/components/Alive.tsx', texto: 'void AccessibilityInfo.isReduceMotionEnabled()' },
    ]),
    ['src/components/Alive.tsx'],
  );

  // Negativo 1: o dono da resposta não é achado, mesmo perguntando.
  assert.deepEqual(
    perguntamAoSistema([
      { arquivo: 'src/components/vida.ts', texto: 'AccessibilityInfo.isReduceMotionEnabled()' },
    ]),
    [],
  );

  // Negativo 2: usar o gancho não é perguntar.
  assert.deepEqual(
    perguntamAoSistema([
      { arquivo: 'src/components/Alive.tsx', texto: 'const reduzir = useReduzirMovimento();' },
    ]),
    [],
  );
});

/**
 * O relógio é UM — e a guarda existe porque o nome não bastou.
 *
 * Este módulo se chama "o relógio compartilhado dos desenhos vivos" desde que
 * nasceu, e por semanas cada `useCiclo` criou a própria animação infinita. O
 * nome prometia o compasso e o código entregava a permissão. Medido no aparelho
 * em 9 de setembro: trinta e oito voltas infinitas, 190% de CPU com a tela
 * parada, e a thread de UI tão ocupada que a ENTRADA das telas não chegava —
 * páginas pela metade, listas que não rolam, e o `uiautomator` recusando ler a
 * tela com `could not get idle state`.
 *
 * A régua olha o repositório inteiro, e não este arquivo: o defeito é um
 * raciocínio que se copia. Um caso é permitido e está nomeado — quem tiver outro
 * acrescenta o nome aqui com o motivo, ou usa o relógio.
 */
const RELOGIOS_PROPRIOS_PERMITIDOS = [
  // O halo do ponto vivo tem a curva `out(ease)`, que não é nenhum dos dois
  // feitios da casa, e ele só corre quando existe trabalho vivo para anunciar —
  // uma animação condicional, não um ambiente permanente.
  'src/components/PulseDot.tsx',
];

test('só o relógio da casa dá a volta infinita', () => {
  /**
   * As pastas INTEIRAS — e sem isto a guarda não tinha o que vigiar, medido em 11 de setembro.
   *
   * A varredura era `readdirSync` sem descer um nível, e `withRepeat(` aparece em exatamente
   * UM arquivo de produção do repositório: `PulseDot.tsx`, que está na lista de permitidos.
   * Ou seja, o conjunto de candidatos possíveis era **vazio** — a guarda passava por não ter
   * onde olhar, não por estar tudo certo.
   *
   * E o lugar onde animação de ambiente permanente de fato vive é `src/components/cenas/`,
   * um nível abaixo: a fumaça, o vapor, a onda. Era a única classe de arquivo que ela não
   * enxergava, e é a classe que criou o defeito — *"trinta e oito voltas infinitas, 190% de
   * CPU com a tela parada"*.
   *
   * A ajudante recursiva existia neste mesmo arquivo, noventa linhas acima, usada pelo teste
   * vizinho.
   */
  const olhados = ['src/components', 'src/home'].flatMap((pasta) => arquivos(pasta));
  assert.ok(olhados.length > 20, `a busca achou só ${olhados.length} arquivos — ela não olha`);

  const suspeitos: string[] = [];
  for (const caminho of olhados) {
    if (caminho === 'src/components/vida.ts') continue;
    if (RELOGIOS_PROPRIOS_PERMITIDOS.includes(caminho)) continue;
    if (/withRepeat\(/.test(readFileSync(caminho, 'utf8'))) suspeitos.push(caminho);
  }
  assert.deepEqual(
    suspeitos,
    [],
    'estes desenhos abrem a própria volta infinita em vez de derivar do relógio ' +
      'da casa — foi assim que trinta e oito voltas chegaram a 190% de CPU com a tela parada',
  );
});

test('a régua acha a volta própria quando ela existe', () => {
  const acusa = (fonte: string) => /withRepeat\(/.test(fonte);
  assert.equal(acusa('x.value = withRepeat(withTiming(1), -1);'), true, 'não acusa quem devia');
  assert.equal(acusa('const t = useCiclo(6000);'), false, 'acusa quem já usa o relógio');
});

/**
 * O compasso PARA quando a tela sai de vista.
 *
 * Numa navegação por abas as telas ficam montadas depois de visitadas, então o
 * `cancelAnimation` da saída nunca era chamado: a capa continuava animando
 * enquanto a pessoa estava em Relatórios, e toda tela já aberta continuava
 * desenhando para sempre. O custo multiplicava pelo número de telas visitadas.
 */
test('o ciclo pergunta se a tela está à vista', () => {
  const fonte = readFileSync('src/components/vida.ts', 'utf8');
  /**
   * **Ela cobrava o MECANISMO e não a propriedade — corrigido em 10 de setembro.**
   *
   * A linha exigia `useFocusEffect(` no arquivo. Quando `useNaTela` passou a usar
   * `useIsFocused()` — que responde o estado de AGORA, em vez de supor `true` até uma
   * limpeza que numa tela nunca focada jamais roda —, a guarda ficou vermelha por uma
   * troca que a torna MAIS verdadeira. É a mesma classe de defeito que o `CLAUDE.md`
   * nomeia: perguntar de qual recorte a derivação lê.
   *
   * O que ela tem de cobrar é que a decisão de mexer dependa do foco da navegação,
   * seja qual for o gancho que responde isso.
   */
  assert.ok(
    /useIsFocused\(|useFocusEffect\(/.test(fonte),
    'nada pausa quando a tela deixa de ser olhada',
  );
  assert.ok(
    /naTela/.test(fonte) && /reduzido === false && naTela/.test(fonte),
    'estar à vista tem de entrar na decisão de mexer, junto com reduzir movimento',
  );
});

/**
 * E a volta própria permitida PARA junto — cicatriz de 10 de setembro.
 *
 * O motivo escrito da exceção do `PulseDot` diz que ele *"só corre quando existe
 * trabalho vivo para anunciar"*. Isso fala do `live`, e não de estar À VISTA: o halo
 * seguia pulsando numa tela montada e nunca focada. Quem lê a exceção lê a promessa
 * de que ela é condicional; a condição que faltava era esta.
 */
test('a volta própria permitida também para quando a tela sai de vista', () => {
  const fonte = readFileSync('src/components/PulseDot.tsx', 'utf8');
  assert.ok(/useNaTela\(\)/.test(fonte), 'o halo não pergunta se a tela está à vista');
  assert.ok(
    /!live \|\| !naTela/.test(fonte),
    'estar à vista tem de entrar na mesma decisão que o `live`, e não ao lado dela',
  );
});
