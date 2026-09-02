import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayWindow } from './day';

/** São Paulo has been at UTC-3 with no daylight saving since 2019. */
const SP = 'America/Sao_Paulo';

test('the day starts at midnight where the factory is, not at midnight in London', () => {
  // 03:00 UTC on the 1st is midnight in São Paulo - the very start of the 1st.
  const hoje = dayWindow('2026-09-01T12:00:00.000Z', SP);
  assert.equal(hoje.from, '2026-09-01T03:00:00.000Z');
  assert.equal(hoje.to, '2026-09-02T03:00:00.000Z');
});

test('a run at 23h50 local belongs to the day it happened', () => {
  // 23h50 in São Paulo on the 31st is 02:50 UTC on the 1st. Filtered by UTC
  // days it would fall on the 1st; filtered by the factory's day it is the
  // 31st, which is when somebody was standing at the kettle.
  const trintaEUm = dayWindow('2026-08-31T20:00:00.000Z', SP);
  const corrida = '2026-09-01T02:50:00.000Z';

  assert.ok(corrida >= trintaEUm.from && corrida < trintaEUm.to, 'the late run belongs to its own day');
});

test('yesterday and today meet without overlapping', () => {
  const hoje = dayWindow('2026-09-01T12:00:00.000Z', SP);
  const ontem = dayWindow('2026-09-01T12:00:00.000Z', SP, -1);

  // The seam: yesterday ends exactly where today starts, and the instant
  // itself belongs to today alone.
  assert.equal(ontem.to, hoje.from);
  assert.ok(hoje.from >= hoje.from && hoje.from < hoje.to);
  assert.ok(!(hoje.from >= ontem.from && hoje.from < ontem.to));
});

test('the same weekday a week back is seven days back, not five', () => {
  const semanaPassada = dayWindow('2026-09-01T12:00:00.000Z', SP, -7);
  assert.equal(semanaPassada.from, '2026-08-25T03:00:00.000Z');
  assert.equal(semanaPassada.to, '2026-08-26T03:00:00.000Z');
});

test('a zone that changes its clock still gets whole days', () => {
  // Lisbon moves to summer time on 29 March 2026 at 01:00 UTC. The day is 23
  // hours long, and arithmetic on 24-hour blocks would land an hour inside the
  // next day.
  const virada = dayWindow('2026-03-29T12:00:00.000Z', 'Europe/Lisbon');
  assert.equal(virada.from, '2026-03-29T00:00:00.000Z');
  assert.equal(virada.to, '2026-03-29T23:00:00.000Z');
});
