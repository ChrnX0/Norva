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
  { id: 'p1', name: 'Picolé de Leite de morango', lineId: 'picole', categoryId: null, typeId: 'leite', flavorId: 'morango' },
  { id: 'p2', name: 'Picolé de Leite de chocolate', lineId: 'picole', categoryId: null, typeId: 'leite', flavorId: 'choc' },
  { id: 'p3', name: 'Picolé de Água de limão', lineId: 'picole', categoryId: null, typeId: 'agua', flavorId: 'limao' },
  { id: 'p4', name: 'Pote 250 de ameixa', lineId: 'pote', categoryId: null, typeId: 'ml250', flavorId: 'ameixa' },
];

test('com duas linhas, a primeira pergunta é a linha — e nada mais aparece antes dela', () => {
  const d = degraus(fabrica, { lineId: null, categoryId: null, typeId: null }, nome);
  assert.deepEqual(
    d.linhas.map((l) => l.name),
    ['Picolé', 'Pote'],
  );
  // Sem linha escolhida, os tipos ainda não são pergunta: Leite, Água e 250 ml juntos
  // seriam a mesma fileira plana com outro nome.
  assert.deepEqual(d.tipos.map((t) => t.name), ['250 ml', 'Água', 'Leite']);
});

test('escolhida a linha, o tipo é o da linha — e o de outra linha some', () => {
  const d = degraus(fabrica, { lineId: 'picole', categoryId: null, typeId: null }, nome);
  assert.deepEqual(d.tipos.map((t) => t.name), ['Água', 'Leite'], '250 ml é do pote, não aparece');
  assert.equal(d.restantes.length, 3, 'sem tipo escolhido, os três picolés seguem à vista');
});

test('escolhido o tipo, sobram as variações dele — que é o fim da árvore', () => {
  const d = degraus(fabrica, { lineId: 'picole', categoryId: null, typeId: 'leite' }, nome);
  assert.deepEqual(d.restantes.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(d.tipos.map((t) => t.name), ['Água', 'Leite'], 'a escolha continua trocável');
});

test('nível com UMA opção não é pergunta, e a grade some', () => {
  // A fábrica de uma linha e um tipo: três toques para chegar num produto seria
  // cerimônia. O dono já tem motivo para achar o app complicado sem eu inventar mais.
  const soPote = fabrica.filter((p) => p.lineId === 'pote');
  const d = degraus(soPote, { lineId: null, categoryId: null, typeId: null }, nome);
  assert.deepEqual(d.linhas, [], 'uma linha só não se escolhe');
  assert.deepEqual(d.tipos, [], 'um tipo só não se escolhe');
  assert.deepEqual(d.restantes.map((p) => p.id), ['p4'], 'e o produto continua alcançável');
});

test('produto SEM grade continua alcançável — o exemplo semeado é assim', () => {
  // `e2e/flow.mjs` diz, desde antes disto: "o exemplo semeado tem um produto sem linha,
  // tipo nem sabor". Se a árvore o escondesse, a primeira tela que alguém abre ficaria
  // vazia — e nove checagens de navegador morreriam junto.
  const solto: NaGrade[] = [
    { id: 'x', name: 'Picolé de morango', lineId: null, categoryId: null, typeId: null, flavorId: null },
  ];
  const d = degraus(solto, { lineId: null, categoryId: null, typeId: null }, nome);
  assert.deepEqual(d.linhas, []);
  assert.deepEqual(d.tipos, []);
  assert.deepEqual(d.restantes.map((p) => p.id), ['x']);
});

test('a grade mistura classificado e solto sem esconder nenhum dos dois', () => {
  // O estado real de quem começou a cadastrar a grade depois de já ter produtos.
  const misto: NaGrade[] = [
    ...fabrica,
    { id: 'velho', name: 'Produto antigo', lineId: null, categoryId: null, typeId: null, flavorId: null },
  ];
  const d = degraus(misto, { lineId: null, categoryId: null, typeId: null }, nome);
  assert.deepEqual(d.linhas.map((l) => l.id), ['picole', 'pote'], 'o solto não inventa linha');
  assert.ok(
    d.restantes.some((p) => p.id === 'velho'),
    'e ele continua na lista, porque esconder dado de alguém é pior que mostrá-lo fora de lugar',
  );
});

/**
 * A categoria, que é o nível que só aparece para quem o usa.
 *
 * Decisão do dono, 11 de setembro: *"o produto nao necessariamente requeira todas as
 * subclasses"*. E a migração `0018` tinha recusado um quarto nível justamente por temer
 * *"a tela com uma pergunta que não se aplica"* — estes casos são a resposta a ela, e o
 * primeiro é o mais importante: a fábrica do dono não usa categoria nenhuma, e para ela
 * a grade tem de continuar com os degraus de antes.
 */
const semCategoria = (id: string, lineId: string, typeId: string): NaGrade => ({
  id,
  name: id,
  lineId,
  categoryId: null,
  typeId,
  flavorId: null,
});

test('sem categoria nenhuma, a grade não ganha degrau — é a fábrica do dono', () => {
  const r = degraus(
    [semCategoria('a', 'picole', 'leite'), semCategoria('b', 'picole', 'agua')],
    { lineId: null, categoryId: null, typeId: null },
    (id) => id,
  );
  assert.deepEqual(r.categorias, [], 'a categoria virou pergunta para quem não a usa');
  assert.equal(r.tipos.length, 2, 'os tipos continuam sendo a escolha');
});

test('com UMA categoria só ela também não é pergunta, e ainda assim filtra', () => {
  const produtos: NaGrade[] = [
    { id: 'a', name: 'a', lineId: 'pote', categoryId: 'premium', typeId: '250', flavorId: null },
    { id: 'b', name: 'b', lineId: 'pote', categoryId: 'premium', typeId: '500', flavorId: null },
  ];
  const r = degraus(produtos, { lineId: null, categoryId: null, typeId: null }, (id) => id);
  assert.deepEqual(r.categorias, [], 'uma opção só não é escolha');
  assert.equal(r.restantes.length, 2, 'e nada foi filtrado fora à toa');
});

test('com DUAS categorias ela vira pergunta, e escolher uma estreita os tipos', () => {
  const produtos: NaGrade[] = [
    { id: 'a', name: 'a', lineId: 'pote', categoryId: 'premium', typeId: '250', flavorId: null },
    { id: 'b', name: 'b', lineId: 'pote', categoryId: 'comum', typeId: '500', flavorId: null },
  ];
  const aberta = degraus(produtos, { lineId: null, categoryId: null, typeId: null }, (id) => id);
  assert.equal(aberta.categorias.length, 2, 'duas categorias são uma escolha de verdade');

  const escolhida = degraus(
    produtos,
    { lineId: null, categoryId: 'premium', typeId: null },
    (id) => id,
  );
  assert.deepEqual(
    escolhida.restantes.map((p) => p.id),
    ['a'],
    'escolher a categoria não estreitou o que sobra',
  );
  assert.deepEqual(escolhida.tipos, [], 'com um tipo só na categoria, o tipo deixa de ser pergunta');
});

test('um produto SEM categoria não some quando outra categoria está escolhida', () => {
  // O caso que o filtro ingênuo quebra: a fábrica que começou sem categoria e passou a
  // usar. O que já existia continua sendo do produto inteiro — sumir com ele seria
  // esconder dado de alguém, que esta casa recusa em toda tela.
  const produtos: NaGrade[] = [
    { id: 'velho', name: 'velho', lineId: 'pote', categoryId: null, typeId: '250', flavorId: null },
    { id: 'novo', name: 'novo', lineId: 'pote', categoryId: 'premium', typeId: '500', flavorId: null },
    { id: 'outro', name: 'outro', lineId: 'pote', categoryId: 'comum', typeId: '1l', flavorId: null },
  ];
  const r = degraus(produtos, { lineId: null, categoryId: 'premium', typeId: null }, (id) => id);
  assert.deepEqual(
    r.restantes.map((p) => p.id),
    ['novo'],
    'a grade filtra pela categoria escolhida',
  );
  // E a régua da tela é outra: `tiposDaLinha` em `app/catalog.tsx` mostra os tipos SEM
  // categoria junto com os da escolhida, porque tipo sem categoria vale no produto
  // inteiro. Aqui o filtro é do que se PRODUZ, e ali o de o que se CADASTRA — são duas
  // perguntas, e confundi-las foi o que fez a variação sumir uma vez.
});
