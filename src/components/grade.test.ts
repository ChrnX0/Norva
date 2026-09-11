import assert from 'node:assert/strict';
import { test } from 'node:test';
import { degraus, type NaGrade } from './grade';

/**
 * A grade só pergunta o que é pergunta.
 *
 * O dono disse *"o app está complicadíssimo de se usar"* olhando para uma fileira plana
 * com um produto por etiqueta. A árvore conserta isso — e erra de volta se ela aparecer
 * onde não há o que escolher: quem tem um produto só não pode ganhar três toques para
 * chegar nele. Esta guarda é a que separa os dois casos.
 */
const nome = (id: string) => ({ picole: 'Picolé', pote: 'Pote', leite: 'Leite', agua: 'Água', ml250: '250 ml' })[id] ?? id;

const fabrica: NaGrade[] = [
  { id: 'p1', name: 'Picolé de Leite de morango', lineId: 'picole', typeId: 'leite', flavorId: 'morango' },
  { id: 'p2', name: 'Picolé de Leite de chocolate', lineId: 'picole', typeId: 'leite', flavorId: 'choc' },
  { id: 'p3', name: 'Picolé de Água de limão', lineId: 'picole', typeId: 'agua', flavorId: 'limao' },
  { id: 'p4', name: 'Pote 250 de ameixa', lineId: 'pote', typeId: 'ml250', flavorId: 'ameixa' },
];

test('com duas linhas, a primeira pergunta é a linha — e nada mais aparece antes dela', () => {
  const d = degraus(fabrica, { lineId: null, typeId: null }, nome);
  assert.deepEqual(
    d.linhas.map((l) => l.name),
    ['Picolé', 'Pote'],
  );
  // Sem linha escolhida, os tipos ainda não são pergunta: Leite, Água e 250 ml juntos
  // seriam a mesma fileira plana com outro nome.
  assert.deepEqual(d.tipos.map((t) => t.name), ['250 ml', 'Água', 'Leite']);
});

test('escolhida a linha, o tipo é o da linha — e o de outra linha some', () => {
  const d = degraus(fabrica, { lineId: 'picole', typeId: null }, nome);
  assert.deepEqual(d.tipos.map((t) => t.name), ['Água', 'Leite'], '250 ml é do pote, não aparece');
  assert.equal(d.restantes.length, 3, 'sem tipo escolhido, os três picolés seguem à vista');
});

test('escolhido o tipo, sobram as variações dele — que é o fim da árvore', () => {
  const d = degraus(fabrica, { lineId: 'picole', typeId: 'leite' }, nome);
  assert.deepEqual(d.restantes.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(d.tipos.map((t) => t.name), ['Água', 'Leite'], 'a escolha continua trocável');
});

test('nível com UMA opção não é pergunta, e a grade some', () => {
  // A fábrica de uma linha e um tipo: três toques para chegar num produto seria
  // cerimônia. O dono já tem motivo para achar o app complicado sem eu inventar mais.
  const soPote = fabrica.filter((p) => p.lineId === 'pote');
  const d = degraus(soPote, { lineId: null, typeId: null }, nome);
  assert.deepEqual(d.linhas, [], 'uma linha só não se escolhe');
  assert.deepEqual(d.tipos, [], 'um tipo só não se escolhe');
  assert.deepEqual(d.restantes.map((p) => p.id), ['p4'], 'e o produto continua alcançável');
});

test('produto SEM grade continua alcançável — o exemplo semeado é assim', () => {
  // `e2e/flow.mjs` diz, desde antes disto: "o exemplo semeado tem um produto sem linha,
  // tipo nem sabor". Se a árvore o escondesse, a primeira tela que alguém abre ficaria
  // vazia — e nove checagens de navegador morreriam junto.
  const solto: NaGrade[] = [
    { id: 'x', name: 'Picolé de morango', lineId: null, typeId: null, flavorId: null },
  ];
  const d = degraus(solto, { lineId: null, typeId: null }, nome);
  assert.deepEqual(d.linhas, []);
  assert.deepEqual(d.tipos, []);
  assert.deepEqual(d.restantes.map((p) => p.id), ['x']);
});

test('a grade mistura classificado e solto sem esconder nenhum dos dois', () => {
  // O estado real de quem começou a cadastrar a grade depois de já ter produtos.
  const misto: NaGrade[] = [
    ...fabrica,
    { id: 'velho', name: 'Produto antigo', lineId: null, typeId: null, flavorId: null },
  ];
  const d = degraus(misto, { lineId: null, typeId: null }, nome);
  assert.deepEqual(d.linhas.map((l) => l.id), ['picole', 'pote'], 'o solto não inventa linha');
  assert.ok(
    d.restantes.some((p) => p.id === 'velho'),
    'e ele continua na lista, porque esconder dado de alguém é pior que mostrá-lo fora de lugar',
  );
});
