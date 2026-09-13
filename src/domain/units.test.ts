import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidHierarchy, type PackagingHierarchy, boxesOf, tiersFromCounts, toBaseUnits, countsFromTiers } from './units';

/**
 * The packaging invariant, which was written down and never run.
 *
 * A hierarchy is what lets the app speak the operator's language - "1 crate, 4
 * boxes and 6 units" instead of 3,606. Every conversion in the product trusts
 * two things about it: the first tier is the base unit, and each tier is bigger
 * than the one before. Break either and the breakdown silently produces
 * nonsense that still looks like a quantity.
 */

const ok: PackagingHierarchy = {
  tiers: [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'box', perBaseUnit: 50 },
    { id: 'crate', perBaseUnit: 300 },
  ],
};

test('a hierarchy has to start at one and climb', () => {
  assert.equal(isValidHierarchy(ok), true);
});

test('a first tier that is not the base unit is refused', () => {
  // Everything downstream divides by the tier sizes assuming the smallest is 1.
  // Starting at 50 does not fail; it quietly multiplies every quantity by 50.
  assert.equal(
    isValidHierarchy({ tiers: [{ id: 'box', perBaseUnit: 50 }, { id: 'crate', perBaseUnit: 300 }] }),
    false,
  );
});

test('tiers out of order, or repeated, are refused', () => {
  assert.equal(
    isValidHierarchy({
      tiers: [
        { id: 'unit', perBaseUnit: 1 },
        { id: 'crate', perBaseUnit: 300 },
        { id: 'box', perBaseUnit: 50 },
      ],
    }),
    false,
  );

  // Equal is not "bigger than": two tiers of the same size make the breakdown
  // ambiguous, and it would pick one silently.
  assert.equal(
    isValidHierarchy({
      tiers: [
        { id: 'unit', perBaseUnit: 1 },
        { id: 'box', perBaseUnit: 50 },
        { id: 'pack', perBaseUnit: 50 },
      ],
    }),
    false,
  );
});

test('an empty hierarchy is refused rather than treated as "just units"', () => {
  // Defaulting to units here would let an item with no packaging answer
  // questions about boxes with a number that means nothing.
  assert.equal(isValidHierarchy({ tiers: [] }), false);
});

test('a box is an object, and something with no box is never counted as one', () => {
  const comCaixa: PackagingHierarchy = {
    tiers: [
      { id: 'unit', perBaseUnit: 1 },
      { id: 'box', perBaseUnit: 50 },
      { id: 'crate', perBaseUnit: 600 },
    ],
  };
  const semCaixa: PackagingHierarchy = { tiers: [{ id: 'g', perBaseUnit: 1 }] };

  // A camada MAIOR é a que conta como volume: um engradado é um objeto só.
  assert.deepEqual(boxesOf(1300, comCaixa), { boxes: 2, loose: 100 });

  // E o que não tem camada acima da base não vira caixa nenhuma - devolve null
  // para a tela dizer em grama, em vez de somar um volume que não existe.
  assert.equal(boxesOf(6000, semCaixa), null);

  // Menos que um volume: zero caixas e tudo solto, nunca "1 caixa" arredondada.
  assert.deepEqual(boxesOf(430, comCaixa), { boxes: 0, loose: 430 });
});

test('a família com três degraus é a do picolé: unidade, caixa de 44, engradado de 264', () => {
  // Os números são os da fábrica que o dono descreveu, e a conta é dele: 6 caixas de 44.
  const h = tiersFromCounts(44, 6);
  assert.deepEqual(
    h.tiers,
    [
      { id: 'unit', perBaseUnit: 1 },
      { id: 'box', perBaseUnit: 44 },
      { id: 'crate', perBaseUnit: 264 },
    ],
    'o engradado é caixas × unidades por caixa quando existe caixa',
  );
  assert.ok(isValidHierarchy(h));
});

test('a família com DOIS degraus é a do pote: unidade e engradado, sem caixa no meio', () => {
  // O caso que a tela descartava calada. Sem caixa, o segundo número é unidades por
  // engradado — não caixas —, e é por isso que o rótulo do campo muda junto.
  const h = tiersFromCounts(NaN, 20);
  assert.deepEqual(h.tiers, [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'crate', perBaseUnit: 20 },
  ]);
  assert.ok(isValidHierarchy(h));
  // E a conversão passa a valer: 200 potes viram 10 engradados.
  assert.equal(toBaseUnits(10, h.tiers[1]), 200);
});

test('quem vende solto digita nada e recebe um degrau só, que é o certo para ele', () => {
  const h = tiersFromCounts(NaN, NaN);
  assert.deepEqual(h.tiers, [{ id: 'unit', perBaseUnit: 1 }]);
  assert.ok(isValidHierarchy(h), 'um degrau só continua sendo hierarquia válida');
});

test('degrau que não sobe não entra, senão a hierarquia nasce inválida', () => {
  // Uma "caixa de 1" não é degrau: ela empataria com a unidade, e `isValidHierarchy`
  // exige estritamente crescente. Recusar na entrada é melhor que gravar e quebrar.
  assert.deepEqual(tiersFromCounts(1, 6).tiers, [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'crate', perBaseUnit: 6 },
  ]);
  assert.ok(isValidHierarchy(tiersFromCounts(1, 6)));
  assert.ok(isValidHierarchy(tiersFromCounts(0, 0)));
});

test('a hierarquia vai e volta, inclusive na família de DOIS degraus', () => {
  /**
   * A ida e a volta moram no mesmo arquivo porque a armadilha é a mesma nas duas direções:
   * o segundo número significa CAIXAS por engradado quando há caixa, e UNIDADES por
   * engradado quando não há. Duas telas reconstruíam isso na mão exigindo as duas, e o
   * engradado do pote — a família de dois degraus descrita pelo dono — reabria vazio.
   */
  const picole = tiersFromCounts(44, 6);
  assert.deepEqual(
    countsFromTiers(picole),
    { perBox: 44, perCrate: 6 },
    'picolé: 44 por caixa, 6 caixas por engradado — os dois números voltam como foram digitados',
  );

  const pote = tiersFromCounts(0, 12);
  assert.deepEqual(
    countsFromTiers(pote),
    { perBox: 0, perCrate: 12 },
    'pote: sem caixa, o 12 conta UNIDADES por engradado e volta como 12, não dividido por um degrau que não existe',
  );

  const solto = tiersFromCounts(0, 0);
  assert.deepEqual(
    countsFromTiers(solto),
    { perBox: 0, perCrate: 0 },
    'quem vende unidade solta digitou nada e recebe nada de volta — vazio é resposta',
  );
});
