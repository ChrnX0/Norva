import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ordersCoveredBy, pickSuggestion } from './picking';

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


test('only a load that covers the whole order can close it', () => {
  const pedidos = [
    { id: 'a', lines: [{ itemId: 'picole', baseUnits: 300 }] },
    { id: 'b', lines: [{ itemId: 'picole', baseUnits: 300 }, { itemId: 'pote', baseUnits: 20 }] },
  ];

  // Mandou 300 picolés: cobre o pedido A inteiro e o B só pela metade.
  const enviado = new Map([['picole', 300]]);
  assert.deepEqual(ordersCoveredBy(pedidos, enviado), ['a']);

  // Faltando um único item, o pedido não fecha. Dizer "entregue" quando faltaram
  // caixas transforma uma falta que a loja vai cobrar num pedido que o sistema
  // diz cumprido - e pedido não é livro-razão, então nada desmente depois.
  assert.deepEqual(ordersCoveredBy(pedidos, new Map([['picole', 299]])), []);

  // Mandar a mais fecha: quem mandou 320 entregou os 300 combinados.
  assert.deepEqual(
    ordersCoveredBy(pedidos, new Map([['picole', 320], ['pote', 25]])),
    ['a', 'b'],
  );

  // E carga de item nenhum não fecha pedido nenhum.
  assert.deepEqual(ordersCoveredBy(pedidos, new Map()), []);
});
