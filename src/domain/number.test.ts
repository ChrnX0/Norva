import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTyped, parseTyped } from './number';

test('the same typing means the same number, whichever separator the phone gave', () => {
  // The invoice that started this: four buckets of pulp, R$ 118,50 apiece. On
  // Android the keyboard decides which separator the person can type, so both
  // spellings have to arrive at the same money.
  assert.equal(parseTyped('118,50'), 118.5);
  assert.equal(parseTyped('118.50'), 118.5);
  assert.equal(parseTyped('1.000,00'), 1000);
  assert.equal(parseTyped('1000.00'), 1000);
});

test('a thousand grams is a thousand, not one', () => {
  // The other half of the old bug: the reader that only swapped the comma made
  // 46.000 g of sugar into 46 g, and wrote that to the ledger without a word.
  assert.equal(parseTyped('46.000'), 46000);
  assert.equal(parseTyped('1.500'), 1500);
  assert.equal(parseTyped('25.000'), 25000);
  assert.equal(parseTyped('1.250.400'), 1250400);
});

test('half of something keeps its half', () => {
  // Three digits after the dot read as grouping - unless there is nothing to
  // group, which is what a leading zero means.
  assert.equal(parseTyped('0.500'), 0.5);
  assert.equal(parseTyped('0,500'), 0.5);
  assert.equal(parseTyped('1.5'), 1.5);
  assert.equal(parseTyped('2,5'), 2.5);
});

test('what is not a number is refused, not guessed', () => {
  assert.equal(parseTyped(''), null);
  assert.equal(parseTyped('abc'), null);
  assert.equal(parseTyped('kg'), null);
  assert.equal(parseTyped('-3'), -3);
});

test('writing a number back and reading it returns the same number', () => {
  // The property that closes the loop. A recipe screen wrote `String(2.5)`,
  // read it with a parser that deleted the dot, and turned a 2,5% loss into
  // 25% with nobody touching the field.
  for (const formatting of ['pt-BR', 'en-US', 'es-MX']) {
    for (const value of [2.5, 0.5, 7.5, 12.4, 1250, 46000, 1.25, 506, 0.075]) {
      assert.equal(
        parseTyped(formatTyped(value, formatting)),
        value,
        `${value} did not survive ${formatting}`,
      );
    }
  }
});

test('a field never receives a grouping separator', () => {
  // Grouping in a field is the ambiguity itself: "1.500" cannot be read back
  // with certainty by anyone, including us.
  assert.equal(formatTyped(1500, 'pt-BR'), '1500');
  assert.equal(formatTyped(46000, 'pt-BR'), '46000');
  assert.equal(formatTyped(2.5, 'pt-BR'), '2,5');
  assert.equal(formatTyped(2.5, 'en-US'), '2.5');
});
