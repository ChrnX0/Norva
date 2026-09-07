import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cenaParada } from './cena';
import { noTrilho } from './cenas/prancha';

/**
 * A cena parada — a regra que decide se a legenda explica o silêncio.
 *
 * Ela ganhou teste por um motivo concreto: o dono abriu o APK num domingo, viu
 * metade do desenho ausente e leu como aplicativo quebrado. A frase que conserta
 * isso só serve se disparar exatamente quando o desenho está mudo — uma frase
 * dizendo "parada agora" com a chaminé fumegando seria pior que o silêncio.
 */

test('parada é quando as três peças do dia estão fora', () => {
  assert.equal(cenaParada({ running: false, shipped: false, dayShare: null }), true);
  assert.equal(cenaParada({ running: false, shipped: false, dayShare: 0 }), true);
});

test('qualquer uma das três de pé já não é parada', () => {
  assert.equal(cenaParada({ running: true, shipped: false, dayShare: null }), false);
  assert.equal(cenaParada({ running: false, shipped: true, dayShare: null }), false);
  assert.equal(cenaParada({ running: false, shipped: false, dayShare: 0.01 }), false);
});

/**
 * Nulo e zero contam igual AQUI e por um motivo que não é preguiça: o picolé
 * desenha `dayShare ?? 0` — logo os dois deixam o desenho no mesmo lugar, vazio.
 * Quem separa "nunca produziu" de "hoje não produziu" é a manchete, que tem os
 * números; a legenda fala do desenho, e o desenho não distingue os dois.
 */
test('nulo e zero enchem o mesmo tanto, então a legenda os trata igual', () => {
  assert.equal(
    cenaParada({ running: false, shipped: false, dayShare: null }),
    cenaParada({ running: false, shipped: false, dayShare: 0 }),
  );
});

/**
 * O botão do cursor não sai do trilho — e este teste nasceu de uma foto.
 *
 * A cena dos ajustes escrevia centro 0,18 e curso 0,55: meio curso é 0,275, então
 * o botão ia a −0,095 e saía da prancheta pela esquerda. Verde em tudo, e no
 * emulador o trilho do meio aparecia vazio com um arco vermelho cortado na borda.
 *
 * A régua vale porque distingue: os valores de hoje passam, e o par que causou o
 * defeito reprova. Régua que só sabe aprovar não é régua.
 */
test('começo e fim dentro do trilho mantêm o botão no trilho', () => {
  for (const [de, ate] of [
    [0.47, 0.77],
    [0.08, 0.63],
    [0.22, 0.57],
  ]) {
    for (const ciclo of [0, 0.25, 0.5, 0.75, 1]) {
      const onde = noTrilho(de, ate, ciclo);
      assert.ok(onde >= 0 && onde <= 1, `${de}..${ate} em ${ciclo} deu ${onde}`);
    }
  }
});

test('o par que causou o defeito seria pego — a régua reprova o caso errado', () => {
  // O que a assinatura antiga permitia escrever: centro 0,18 com curso 0,55.
  const de = 0.18 - 0.55 / 2;
  const ate = 0.18 + 0.55 / 2;
  assert.ok(noTrilho(de, ate, 0) < 0, 'o começo desse par está fora do trilho');
  assert.equal(Number(noTrilho(de, ate, 0).toFixed(3)), -0.095);
});
