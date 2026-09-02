import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayWindow, daysBetween, localDate } from './day';

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

test('days are counted between local midnights, not by dividing milliseconds', () => {
  // Doze dias, e o meio deles atravessa a virada de horário de Lisboa - a
  // divisão crua daria 11,96 e arredondaria para 12 por sorte; num intervalo
  // com duas viradas ela erraria.
  assert.equal(daysBetween('2026-08-20T10:00:00.000Z', '2026-09-01T10:00:00.000Z', SP), 12);
  assert.equal(daysBetween('2026-03-25T23:00:00.000Z', '2026-04-02T01:00:00.000Z', 'Europe/Lisbon'), 8);

  // Mesmo dia, horas diferentes: zero dias, não "quase um".
  assert.equal(daysBetween('2026-09-01T03:30:00.000Z', '2026-09-02T02:00:00.000Z', SP), 0);
});

test('a calendar date is not an instant, and the difference is a whole day', () => {
  // Madri é UTC+2 no verão: a meia-noite local de 3 de setembro é 2 de setembro
  // às 22h em UTC. O atalho `dayWindow(...).from.slice(0, 10)` devolve o dia
  // ANTERIOR ali - e um pedido combinado para quinta apareceria como quarta
  // para metade do mundo.
  const madrugada = '2026-09-03T05:00:00Z';
  assert.equal(dayWindow(madrugada, 'Europe/Madrid').from.slice(0, 10), '2026-09-02');
  assert.equal(localDate(madrugada, 'Europe/Madrid'), '2026-09-03');

  // E do lado negativo, onde o atalho acerta por acaso, o resultado é o mesmo.
  assert.equal(localDate('2026-09-03T05:00:00Z', 'America/Sao_Paulo'), '2026-09-03');

  // Antes da meia-noite local, o dia ainda é o de ontem lá.
  assert.equal(localDate('2026-09-03T02:00:00Z', 'America/Sao_Paulo'), '2026-09-02');

  // Deslocamento vira mês novo sem aritmética manual.
  assert.equal(localDate('2026-09-28T15:00:00Z', 'America/Sao_Paulo', 7), '2026-10-05');
  assert.equal(localDate('2026-01-01T15:00:00Z', 'America/Sao_Paulo', -1), '2025-12-31');
});
