import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysOfCover, diasAteProduzir, ordemDeCarga, tipoDaDiferenca } from './ledger';

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

/**
 * O que vai na frente da lista de carga.
 *
 * A tela de transferir listava os sete itens da fábrica em ordem alfabética e já
 * vinha com o primeiro escolhido — *Açúcar cristal* — com o destino sendo uma
 * LOJA. Nenhum número estava errado; o que faltava era a Lei: *"nunca peça o que o
 * sistema pode deduzir"*, e *"qual é a próxima ação provável"*. Ninguém manda
 * quarenta quilos de açúcar para uma loja.
 *
 * Prende as duas pontas, e a segunda é a que impede a régua de virar "produto
 * sempre primeiro": para um lugar que NÃO recebe carga — outra câmara, outro
 * almoxarifado — não há palpite honesto, e a ordem alfabética que veio é a certa.
 */
test('the load list puts the likely thing first, and only where that is deducible', () => {
  const estoque = [
    { itemId: 'a', name: 'Açúcar', kind: 'input' },
    { itemId: 'e', name: 'Embalagem', kind: 'packaging' },
    { itemId: 'p', name: 'Picolé', kind: 'product' },
    { itemId: 'z', name: 'Polpa', kind: 'input' },
  ];

  // Para uma loja: o produto na frente, e o resto na ordem em que veio.
  assert.deepEqual(
    ordemDeCarga(estoque, true).map((l) => l.itemId),
    ['p', 'a', 'e', 'z'],
    'quem recebe carga vende ao cliente final, e o que se vende é produto acabado',
  );

  // Para uma câmara fria: nada muda. Aqui qualquer item é plausível, e inventar
  // uma ordem seria um palpite sem fato embaixo.
  assert.deepEqual(
    ordemDeCarga(estoque, false).map((l) => l.itemId),
    ['a', 'e', 'p', 'z'],
    'sem destino que deduza, a ordem que veio é a certa — palpite sem fato é chute',
  );

  // A ordem DENTRO de cada grupo é preservada: lista que dança entre destinos é
  // lista que ninguém decora.
  const doisProdutos = [
    { itemId: 'a', kind: 'input' },
    { itemId: 'p1', kind: 'product' },
    { itemId: 'p2', kind: 'product' },
  ];
  assert.deepEqual(
    ordemDeCarga(doisProdutos, true).map((l) => l.itemId),
    ['p1', 'p2', 'a'],
  );

  // E não mexe na lista original: quem chama desenha, não muda o que recebeu.
  const original = [{ itemId: 'a', kind: 'input' }, { itemId: 'p', kind: 'product' }];
  ordemDeCarga(original, true);
  assert.deepEqual(original.map((l) => l.itemId), ['a', 'p'], 'a lista de quem chamou fica como estava');
});

/**
 * "Produza até segunda" contra "Estoque insuficiente": as duas dizem o mesmo fato
 * e só a primeira é acionável. A Lei 4 manda avisar na data da decisão.
 */
test('the production warning lands on the day you can still act, never in the past', () => {
  // Trunca: meio dia de cobertura não é um dia, e arredondar para cima daria o
  // aviso um dia depois de o estoque ter acabado — a data do problema.
  assert.equal(diasAteProduzir(3.9), 3);
  assert.equal(diasAteProduzir(1.0), 1);

  // Zero e negativo viram hoje. Não existe agir no passado, e uma data passada
  // numa tela faz a pessoa parar de acreditar no aviso inteiro.
  assert.equal(diasAteProduzir(0), 0);
  assert.equal(diasAteProduzir(-4), 0);
});

/**
 * As três respostas da diferença — e a do meio é a que costuma faltar.
 *
 * Uma conferência que bate exato é um FATO, não a ausência de uma falta. Sem o caso `exata` a
 * tela diria "faltaram 0 g", que é o alerta inventado; e sem a igualdade contra os três, a troca
 * do sinal (`< 0` por `> 0`) passa sem nada reprovar — foi para não repetir a cicatriz de
 * `app/purchase.tsx` que esta régua saiu da tela.
 */
test('a diferença da conferência tem três respostas, e zero é uma delas', () => {
  assert.equal(tipoDaDiferenca(-500), 'falta', 'contou menos do que veio: é falta');
  assert.equal(tipoDaDiferenca(500), 'sobra', 'contou mais do que veio: é sobra');
  assert.equal(tipoDaDiferenca(0), 'exata', 'bateu exato é um FATO, não a ausência de uma falta');
  // As bordas do sinal, porque é o sinal que a mutação troca.
  assert.equal(tipoDaDiferenca(-1), 'falta', 'uma unidade a menos ainda é falta');
  assert.equal(tipoDaDiferenca(1), 'sobra', 'uma unidade a mais ainda é sobra');
});
