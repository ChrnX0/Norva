import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cenaParada } from './cena';

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
