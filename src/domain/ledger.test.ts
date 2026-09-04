import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysOfCover } from './ledger';

/**
 * A única conta deste módulo que o aplicativo roda.
 *
 * Aqui havia também os testes de `balanceAt` e `balanceOf`, escritos porque
 * "nada as chamava e nada as checava". Escrever teste não trouxe chamador: as
 * duas dobravam sobre `Movement[]`, e o aplicativo nunca tem os movimentos em
 * memória — ele tem SQLite, e a soma mora lá. As funções saíram; o motivo está
 * escrito no `ledger.ts`.
 */

test('days of cover turns a quantity into the sentence somebody can act on', () => {
  // "Strawberry: 4 days" tells the owner to produce. "Strawberry: 70,000 g"
  // does not, and that difference is the whole point of the briefing.
  assert.equal(daysOfCover(70_000, 10_000), 7);

  // Nothing going out is not "infinite days" and not zero: it is unanswerable,
  // and saying so beats printing a number that means nothing.
  assert.equal(daysOfCover(70_000, 0), null);
  assert.equal(daysOfCover(70_000, -5), null);
});
