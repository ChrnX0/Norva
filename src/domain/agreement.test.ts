import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agreedOn, daysUntilNextDelivery, toggleDay, WEEK_BITS } from './agreement';

test('the agreed days use the same weekday numbering as the platform', () => {
  // Um domingo qualquer, pedido ao Date: se esta conta e a do JavaScript
  // discordarem, toda entrega sai um dia fora e nada mais no app acusa.
  const domingo = new Date('2026-09-06T12:00:00.000Z').getUTCDay();
  assert.equal(domingo, 0);
  assert.equal(WEEK_BITS[0], 1);
  assert.ok(agreedOn(WEEK_BITS[0], 0));
  assert.ok(!agreedOn(WEEK_BITS[0], 1));
});

test('a day goes in and comes out without disturbing the others', () => {
  const tercaESexta = toggleDay(toggleDay(0, 2), 5);
  assert.ok(agreedOn(tercaESexta, 2) && agreedOn(tercaESexta, 5));
  assert.ok(!agreedOn(tercaESexta, 3));

  const soTerca = toggleDay(tercaESexta, 5);
  assert.ok(agreedOn(soTerca, 2), 'tirar a sexta não pode tirar a terça');
  assert.ok(!agreedOn(soTerca, 5));
});

test('today counts as the next delivery, and no agreement invents none', () => {
  const quinta = toggleDay(0, 4);

  // Pedindo na própria quinta, o próximo dia é hoje - o sistema não corrige
  // quem está pedindo no dia certo.
  assert.equal(daysUntilNextDelivery(quinta, 4), 0);
  // Pedindo na sexta, a próxima quinta é daqui a seis dias: a semana fecha.
  assert.equal(daysUntilNextDelivery(quinta, 5), 6);
  assert.equal(daysUntilNextDelivery(quinta, 3), 1);

  // Sem acordo não há atalho, e essa é a diferença entre não saber e chutar.
  assert.equal(daysUntilNextDelivery(0, 3), null);
});

test('with two agreed days the nearest one wins', () => {
  const tercaESexta = toggleDay(toggleDay(0, 2), 5);
  assert.equal(daysUntilNextDelivery(tercaESexta, 0), 2, 'de domingo, a terça');
  assert.equal(daysUntilNextDelivery(tercaESexta, 3), 2, 'de quarta, a sexta');
  assert.equal(daysUntilNextDelivery(tercaESexta, 6), 3, 'de sábado, a terça');
});

test('a weekday outside the week is refused instead of answering politely', () => {
  const todaSemana = 127;

  // Um "não" para o oitavo dia parece resposta e não é: quem passou 7 tem um
  // bug, e devolver false esconde o bug atrás de uma frase plausível na tela.
  assert.throws(() => agreedOn(todaSemana, 7), RangeError);
  assert.throws(() => agreedOn(todaSemana, -1), RangeError);
  assert.throws(() => toggleDay(todaSemana, 9), RangeError);
  assert.throws(() => agreedOn(todaSemana, 1.5), RangeError);

  // E a semana inteira continua respondendo, dia a dia.
  for (let dia = 0; dia < 7; dia += 1) assert.ok(agreedOn(todaSemana, dia));
});
