import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packSize } from './measure';

test('the size printed on the sack is read, not asked for', () => {
  assert.equal(packSize('saco 25 kg', 'g'), 25_000);
  assert.equal(packSize('balde 10kg', 'g'), 10_000);
  assert.equal(packSize('caixa 1,5 L', 'ml'), 1_500);
  assert.equal(packSize('garrafa 500 ml', 'ml'), 500);
  assert.equal(packSize('pacote 12 unidades', 'un'), 12);
});

test('what cannot be read with certainty is left for the person', () => {
  // A bucket has no size printed on it.
  assert.equal(packSize('balde', 'g'), null);
  // Two numbers is ambiguous - "caixa 6 x 500 ml" is not this function's job.
  assert.equal(packSize('caixa 6 x 500 ml', 'ml'), null);
  // A unit it does not know is not a unit it should guess.
  assert.equal(packSize('saco 25 lb', 'g'), null);
  assert.equal(packSize('saco 25 kg', 'oz'), null);
  // Volume written against a mass base unit is a mistake worth refusing.
  assert.equal(packSize('garrafa 2 L', 'g'), null);
});

test('a fraction of a base unit is refused rather than rounded', () => {
  // 0,0025 kg is 2,5 g. Rounding that quietly puts a wrong factor under every
  // cost the item ever touches, and nobody would ever find it.
  assert.equal(packSize('ampola 0,0025 kg', 'g'), null);
  assert.equal(packSize('frasco 0,5 kg', 'g'), 500);
});
