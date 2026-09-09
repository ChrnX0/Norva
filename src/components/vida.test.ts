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
