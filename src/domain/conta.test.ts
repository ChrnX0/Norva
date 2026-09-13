import assert from 'node:assert/strict';
import { test } from 'node:test';

import { comFatia, somaDe } from './conta';
import { nomeDoLugar } from './ledger';

/**
 * A conta de um número — e as asserções aqui são IGUALDADE contra outra fonte.
 *
 * A regra da casa nasceu de um extrato que mostrou R$ 625,27 para uma corrida que
 * fez R$ 323,84, com um `assert.ok(valor > 0)` verde ao lado e a explicação certa
 * escrita junto. Qualquer soma satisfaz "maior que zero". Então: a soma das fatias
 * é 1, e a soma das partes é o total — dois números que só batem se a conta estiver
 * certa.
 */
test('as fatias somam exatamente um', () => {
  const partes = [
    { de: 'câmara', valor: 193249 },
    { de: 'loja do centro', valor: 41200 },
    { de: 'carro', valor: 3051 },
  ];
  const somaDasFatias = comFatia(partes).reduce((n, p) => n + (p.fatia ?? 0), 0);
  assert.equal(Number(somaDasFatias.toFixed(10)), 1);
});

test('a soma das partes é o total, e não uma aproximação dele', () => {
  const partes = [
    { de: 'a', valor: 193249 },
    { de: 'b', valor: 41200 },
    { de: 'c', valor: 3051 },
  ];
  assert.equal(somaDe(partes), 193249 + 41200 + 3051);
  assert.equal(somaDe(partes), 237500);
});

test('a maior parte vem primeiro — a ordem é a pergunta de quem abre a conta', () => {
  const ordem = comFatia([
    { de: 'pequena', valor: 10 },
    { de: 'grande', valor: 90 },
    { de: 'média', valor: 50 },
  ]).map((p) => p.de);
  assert.deepEqual(ordem, ['grande', 'média', 'pequena']);
});

/**
 * Total zero não é fatia zero: é fatia NENHUMA.
 *
 * Uma barra vazia afirmaria "isto vale zero por cento", e uma barra cheia mentiria.
 * A ausência do dado é o próprio dado — é a mesma regra do saldo que não existe
 * contra o saldo que vale zero, e ela já custou uma tela neste projeto.
 */
test('sem total não há fatia, e isso não é a fatia zero', () => {
  const partes = comFatia([
    { de: 'a', valor: 0 },
    { de: 'b', valor: 0 },
  ]);
  assert.deepEqual(partes.map((p) => p.fatia), [undefined, undefined]);
  assert.notDeepEqual(partes.map((p) => p.fatia), [0, 0]);
});

test('uma parte só leva o todo', () => {
  assert.deepEqual(comFatia([{ de: 'única', valor: 42 }]).map((p) => p.fatia), [1]);
});

/**
 * O lugar padrão nasce sem nome, e um número sem rótulo é o que a Lei 3 proíbe.
 *
 * A foto da conta do estoque mostrou R$ 11.616,44 sozinho, sem dizer de onde — a
 * maior parcela do dinheiro parado da fábrica, anônima. `app/places.tsx` já tinha a
 * reserva certa; a segunda tela não. A régua vale porque distingue: nome de verdade
 * passa intacto, vazio e só-espaço caem na palavra de reserva.
 */
test('lugar sem nome recebe a palavra de reserva, e lugar com nome não', () => {
  assert.equal(nomeDoLugar('Loja Centro', 'Fábrica'), 'Loja Centro');
  assert.equal(nomeDoLugar('', 'Fábrica'), 'Fábrica');
  assert.equal(nomeDoLugar('   ', 'Fábrica'), 'Fábrica');
  assert.equal(nomeDoLugar(null, 'Fábrica'), 'Fábrica');
  assert.equal(nomeDoLugar(undefined, 'Fábrica'), 'Fábrica');
});
