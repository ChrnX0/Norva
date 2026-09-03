import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickSuggestion } from './picking';

test('the order beats the habit, and the habit beats nothing', () => {
  // As duas fontes DISCORDANDO é o único caso que prova a ordem: com uma delas
  // vazia, qualquer ordem dá o mesmo número - e um teste assim passa por
  // acidente. Foi exatamente assim que este mutante sobreviveu duas vezes.
  assert.equal(pickSuggestion({ ordered: 300, lastSent: 40 }), 300);

  // Sem pedido, vale o hábito: é o palpite certo para quem repõe por rotina.
  assert.equal(pickSuggestion({ ordered: null, lastSent: 40 }), 40);

  // Sem pedido e sem histórico, não há palpite. Inventar um número seria pedir
  // para alguém conferir uma sugestão que não saiu de lugar nenhum.
  assert.equal(pickSuggestion({ ordered: null, lastSent: null }), null);

  // E zero pedido é um pedido de zero, não a ausência de pedido: a loja que
  // pediu e cancelou não deve receber o envio da semana passada de volta.
  assert.equal(pickSuggestion({ ordered: 0, lastSent: 40 }), 0);
});
