import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { assentamentoMs, motion } from '@/theme/tokens';

/**
 * A rede embaixo da entrada, e a régua que diz quando ela pode agir.
 *
 * O defeito que trouxe este arquivo foi fotografado em 9 de setembro: a capa do
 * primeiro dia inteira a **22% de opacidade**, contraste de 1,56:1 num piso de
 * 4,5:1, parada assim por minutos e atravessando navegação. Não era cor — era a
 * animação de chegada congelada no meio, com a página deslocada 20 dp e reduzida
 * a 97%, exatamente o que `enterScale` faz com a mola em 0,217.
 *
 * Duas coisas se provam aqui, e elas provam coisas diferentes:
 *
 * 1. **A régua do assentamento.** `assentamentoMs` é uma fórmula fechada — o
 *    envelope de decaimento do oscilador. Conferi-la contra si mesma não prova
 *    nada, então a fonte de comparação é outra: a mola **integrada
 *    numericamente**, passo a passo, a partir da equação do movimento. As duas
 *    contas não compartilham uma linha de código.
 *
 * 2. **Que a rede continua existindo.** Isto é varredura de texto, e ela vale
 *    pelo que de fato protege: alguém apagar o `setTimeout` num arquivo cujo
 *    docblock já promete, desde antes do defeito, que a tela nunca fica em
 *    branco por causa de enfeite. **Ela não prova que a rede funciona** — o que
 *    prova isso é a foto do aparelho, medida: com a correção, a mesma capa mede
 *    tinta cheia (33,30,26) e a régua da página volta aos 948 px da coluna.
 */

/** A mola da casa, integrada passo a passo. Devolve a distância até o destino. */
function molaIntegrada(
  { damping, stiffness, mass }: { damping: number; stiffness: number; mass: number },
  segundos: number,
): number {
  const passo = 0.00002;
  let x = 0;
  let v = 0;
  for (let t = 0; t < segundos; t += passo) {
    const aceleracao = (stiffness * (1 - x) - damping * v) / mass;
    v += aceleracao * passo;
    x += v * passo;
  }
  return Math.abs(1 - x);
}

test('a régua do assentamento bate com a mola integrada passo a passo', () => {
  const previsto = assentamentoMs(motion.settle) / 1000;
  assert.ok(
    molaIntegrada(motion.settle, previsto) <= 0.01,
    `no tempo previsto (${(previsto * 1000).toFixed(0)} ms) a mola ainda estava a ` +
      `${molaIntegrada(motion.settle, previsto).toFixed(4)} do destino`,
  );
});

test('a régua distingue: na metade do tempo a mola AINDA não assentou', () => {
  const metade = assentamentoMs(motion.settle) / 2000;
  assert.ok(
    molaIntegrada(motion.settle, metade) > 0.01,
    'a régua daria assentada uma mola que ainda está a caminho — não distingue nada',
  );
});

test('a régua acompanha a mola, e vale para as molas que a casa não usa hoje', () => {
  // A mola dura é a que derrubou a primeira versão da fórmula: com amortecimento
  // de 0,82 o envelope tem 70% de folga, e o teto saía antes de a mola chegar.
  const molas = [
    { damping: 40, stiffness: 600, mass: 1 },
    { damping: 6, stiffness: 60, mass: 1 },
    // Crítica e supercrítica: o outro regime da fórmula, que a casa não usa hoje.
    { damping: 24.5, stiffness: 150, mass: 1 },
    { damping: 40, stiffness: 150, mass: 1 },
    { damping: 80, stiffness: 150, mass: 1 },
    motion.press,
  ];
  for (const mola of molas) {
    const teto = assentamentoMs(mola) / 1000;
    assert.ok(
      molaIntegrada(mola, teto) <= 0.01,
      `no teto de ${(teto * 1000).toFixed(0)} ms a mola ${JSON.stringify(mola)} ainda ` +
        `estava a ${molaIntegrada(mola, teto).toFixed(4)} do destino`,
    );
  }
  assert.ok(
    assentamentoMs({ damping: 40, stiffness: 600, mass: 1 }) <
      assentamentoMs({ damping: 6, stiffness: 60, mass: 1 }),
    'mola mais dura tem de assentar antes da mais frouxa',
  );
});

/**
 * TODA peça que entra tem rede — e a varredura é o ponto, não o arquivo.
 *
 * O primeiro conserto foi só no `Reveal`. Provei no aparelho, dei por fechado, e
 * meia hora depois a tela de Produção apareceu com o cartão e o botão desbotados:
 * `Alive` tinha as mesmas cinco linhas. E mais quatro atrás dele. A regra deste
 * projeto já dizia — *"conserto de pele não termina no arquivo que o mostrou"* —
 * e o que a faz valer não é lembrar dela: é uma guarda que olha todos.
 */
function entradasSemRede(): string[] {
  const suspeitos: string[] = [];
  const pastas = ['src/components', 'src/home'];
  for (const pasta of pastas) {
    for (const nome of readdirSync(pasta)) {
      if (!/\.tsx?$/.test(nome) || /\.test\.tsx?$/.test(nome)) continue;
      const caminho = join(pasta, nome);
      const fonte = readFileSync(caminho, 'utf8');
      // Quem entra é quem começa PARADO NO PONTO DE PARTIDA por causa do
      // movimento — `useSharedValue(reduzir === false ? 0 : 1)` — ou quem zera um
      // valor compartilhado para deixar a animação trazê-lo de volta.
      const entra =
        /useSharedValue\(\s*reduzi\w* === false \? 0 : 1\s*\)/.test(fonte) ||
        /withSpring\(\s*(aberta \? 1 : 0|destino)/.test(fonte);
      if (!entra) continue;
      if (!/redeDaEntrada\(/.test(fonte)) suspeitos.push(caminho);
    }
  }
  return suspeitos;
}

test('toda peça que entra tem a rede embaixo dela', () => {
  assert.deepEqual(
    entradasSemRede(),
    [],
    'estas peças zeram um valor e entregam a volta à animação, sem nada que as traga ' +
      'se ela não chegar — foi assim que a capa passou minutos a 22% de opacidade',
  );
});

test('a régua acha a peça sem rede quando ela existe', () => {
  // O caso falso: uma fonte com a entrada e SEM a rede tem de ser apontada.
  const comEntradaSemRede = 'const x = useSharedValue(reduzir === false ? 0 : 1);';
  const comEntradaComRede = comEntradaSemRede + '\nredeDaEntrada(() => {});';
  const entra = (fonte: string) =>
    /useSharedValue\(\s*reduzi\w* === false \? 0 : 1\s*\)/.test(fonte) &&
    !/redeDaEntrada\(/.test(fonte);
  assert.equal(entra(comEntradaSemRede), true, 'não acusa quem devia acusar');
  assert.equal(entra(comEntradaComRede), false, 'acusa quem já tem rede');
});
