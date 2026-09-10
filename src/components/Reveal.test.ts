import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('a entrada que zera a opacidade tem rede que a traz de volta', () => {
  const fonte = readFileSync('src/components/Reveal.tsx', 'utf8');
  assert.ok(/shown\.value = 0;/.test(fonte), 'o caso a proteger sumiu do arquivo');
  assert.ok(
    /setTimeout\([\s\S]*?shown\.value = 1;/.test(fonte),
    'a entrada zera a opacidade e nada a traz de volta se a animação não chegar',
  );
  assert.ok(/clearTimeout\(/.test(fonte), 'a rede fica viva depois de a peça sair da tela');
});
