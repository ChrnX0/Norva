import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROCURA_A_PARTIR_DE, procurar, semAcento, valeProcurar } from './busca';

const gente = [
  { name: 'Maria Aparecida' },
  { name: 'Maria da Silva' },
  { name: 'José Antônio' },
  { name: 'Ângela Rocha' },
];
const nome = (p: { name: string }) => p.name;

test('acento não é cobrado de quem está de luva', () => {
  assert.equal(semAcento('Ângela'), 'angela');
  assert.equal(semAcento('JOSÉ ANTÔNIO'), 'jose antonio');
  // E o contrário também: digitar COM acento acha quem está escrito sem.
  assert.deepEqual(
    procurar([{ name: 'Angela Rocha' }], 'Ângela', nome).map(nome),
    ['Angela Rocha'],
  );
});

test('procura por trecho, porque o que distingue três Marias é o sobrenome', () => {
  assert.deepEqual(procurar(gente, 'silva', nome).map(nome), ['Maria da Silva']);
  // Por prefixo, "silva" não acharia ninguém — e é esse o defeito que a regra evita.
  assert.deepEqual(procurar(gente, 'maria', nome).map(nome), [
    'Maria Aparecida',
    'Maria da Silva',
  ]);
  assert.deepEqual(procurar(gente, 'angela', nome).map(nome), ['Ângela Rocha']);
});

test('sem nada digitado, a lista inteira — e a original não é mexida', () => {
  const tudo = procurar(gente, '   ', nome);
  assert.equal(tudo.length, gente.length);
  tudo.pop();
  assert.equal(gente.length, 4, 'a lista de fora não pode ser alterada pela busca');
});

test('o corte da busca é uma lista longa, não uma fábrica pequena', () => {
  assert.equal(valeProcurar(6), false, 'seis nomes cabem à vista — pedir busca seria pedir o óbvio');
  assert.equal(valeProcurar(PROCURA_A_PARTIR_DE), false, 'no corte exato ainda cabe');
  assert.equal(valeProcurar(PROCURA_A_PARTIR_DE + 1), true, 'acima dele, rolar começa a doer');
  assert.equal(valeProcurar(200), true, 'e com duzentos a grade é uma lista telefônica');
});
