import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allocateByWeight,
  amountOf,
  cents,
  fromDecimal,
  rate,
  rateFromCents,
  rateToDecimal,
  toDecimal,
  type Cents,
  type Rate,
} from './money';

/**
 * The one place rounding happens, pinned.
 *
 * This file exists because of a mutation check: `Math.round` in `amountOf` was
 * quietly changed to `Math.floor` and the entire suite - ninety-two tests -
 * stayed green. Every fixture happened to land on an exact cent, so the two
 * behaved identically and the project's headline rule ("only the final value
 * rounds, once") had nothing at all holding it in place.
 *
 * Which direction it rounds is not a detail. Flooring drops a fraction of a
 * cent on every single line, always downward, and that error compounds in one
 * direction across a recipe: cost comes out low, margin comes out high, and
 * somebody prices below cost without a single number ever looking wrong.
 */

test('the amount rounds to nearest, and not downward', () => {
  // Half a cent is the case the whole suite was missing: flooring turns this
  // into nothing at all.
  assert.equal(amountOf(0.5 as Rate, 1), 1);
  assert.equal(amountOf(0.125 as Rate, 5), 1, '0.625 of a cent is closer to one than to none');
  assert.equal(amountOf(0.4 as Rate, 1), 0, 'and it does not round up either');

  // A real one: sugar at 0.472 cents a gram, in a quantity that is not round.
  assert.equal(amountOf(0.472 as Rate, 1_233), 582, '582.0 rounds to 582');
  assert.equal(amountOf(0.472 as Rate, 1_235), 583, '583.0 stays exact');
});

test('rounding never accumulates in one direction across many lines', () => {
  // Ten lines, each just over half a cent. Rounded to nearest they come to ten
  // cents; floored they come to nothing, and the recipe that stands on them is
  // understated by its whole value.
  const lines = Array.from({ length: 10 }, () => amountOf(0.51 as Rate, 1));
  assert.equal(
    lines.reduce((a, b) => a + b, 0),
    10,
  );
});

test('a rate is fractional cents, and stays fractional', () => {
  // R$ 12,40 for a kilo is 1.24 cents per gram - not 1, and not 0.
  const pulp = rate(12.4, 1_000);
  assert.ok(Math.abs(pulp - 1.24) < 1e-12);

  // The bug this whole type split exists for: as money it would have been a
  // single cent, losing a fifth before the first multiplication.
  assert.notEqual(Math.round(pulp), pulp);
});

test('money in and money out are the same number', () => {
  const paid = fromDecimal(118.35);
  assert.equal(paid, 11_835);
  assert.equal(toDecimal(paid), 118.35);

  // And a rate derived from it comes back where it started.
  const perGram = rateFromCents(paid, 25_000);
  assert.equal(amountOf(perGram, 25_000), paid, 'the whole sack costs what was paid for it');
});

test('splitting a total never invents or loses a cent', () => {
  // A metade de partes IGUAIS saiu em 7 de setembro pelo portão P1: a função
  // existia, tinha teste e invariante certos, e nenhuma linha de produção a
  // chamava. Ela passou meses verde porque o único lugar que dizia o nome dela
  // era um comentário — e a guarda de órfãs lia comentário como chamada.
  //
  // O que a fábrica precisa é a repartição por PESO, e essa tem chamador.
  const weighted = allocateByWeight(cents(100), [1, 1, 1]);
  assert.equal(
    weighted.reduce((a, b) => a + b, 0),
    100,
  );

  const lopsided = allocateByWeight(cents(7), [90, 5, 5]);
  assert.equal(
    lopsided.reduce((a, b) => a + b, 0),
    7,
    'seven cents split ninety-five ways still adds to seven',
  );
});

test('nothing to split is nothing, not a crash', () => {
  assert.deepEqual(allocateByWeight(cents(0), [1, 2]), [0, 0]);
  assert.deepEqual(allocateByWeight(cents(10), []), []);
  assert.deepEqual(allocateByWeight(cents(10), [0, 0]), [0, 0]);
  assert.equal(rate(12.4, 0), 0, 'a pack with nothing in it has no price per unit');
  assert.equal(rateFromCents(cents(100), 0), 0);
});

test('a Cents value is always whole', () => {
  const half: Cents = cents(10.6);
  assert.equal(half, 11, 'cents is an integer type, and the constructor enforces it');
});

test('uma taxa volta para o número que a pessoa digita, e Cents e Rate não se misturam', () => {
  /**
   * `rateToDecimal` nasceu em 12 de setembro no lugar de `multiplyCents`, que foi apagada
   * por não ter chamador e por prometer o que não cumpria. Esta é a ida e a volta: a polpa
   * a R$ 12,40 o quilo é 1,24 centavo por grama, e 1,24 centavo por grama lido de volta é
   * R$ 0,0124 por grama.
   */
  const porGrama = rate(12.4, 1000);
  assert.equal(porGrama, 1.24, 'R$ 12,40 o quilo é 1,24 centavo por grama');
  assert.equal(rateToDecimal(porGrama), 0.0124, 'e a taxa lida de volta é R$ 0,0124 por grama');

  // O sub-centavo sobrevive à ida e à volta: é ele que o tipo `Rate` existe para proteger.
  const rotulo = rate(0.004, 1);
  assert.equal(rateToDecimal(rotulo), 0.004, 'um rótulo de quatro milésimos não vira zero');
});
