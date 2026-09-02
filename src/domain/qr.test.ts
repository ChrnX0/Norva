import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qrModules } from './qr';

test('the lot code fits the smallest grid there is, and that is the whole point', () => {
  const grade = qrModules('20260902-01');

  // Versão 1: 21 por 21, a menor grade que o padrão define. Numa etiqueta de
  // quatro centímetros isso dá 1,9mm por módulo - o que faz a leitura a um
  // braço de distância, de luva, ser possível.
  assert.equal(grade.length, 21);
  assert.equal(grade[0].length, 21);

  // O uuid do mesmo lote NÃO caberia: trinta e seis caracteres empurram para a
  // versão 3, e o módulo encolhe um quarto exatamente onde já é difícil ler.
  const comUuid = qrModules('7b1f6b8e-2c4a-4f11-9a3d-0c5e8a2b6d90');
  assert.ok(
    comUuid.length > grade.length,
    `o uuid pede uma grade maior: ${comUuid.length} contra ${grade.length}`,
  );
});

test('the three finder squares are where a reader looks for them', () => {
  const grade = qrModules('20260902-01');
  const size = grade.length;

  // Os três olhos do QR: 7x7 nos cantos superior-esquerdo, superior-direito e
  // inferior-esquerdo. Se eles não estiverem lá, não é um QR - é um desenho.
  const olho = (top: number, left: number) =>
    grade[top][left] &&
    grade[top][left + 6] &&
    grade[top + 6][left] &&
    !grade[top + 1][left + 1] &&
    grade[top + 2][left + 2];

  assert.ok(olho(0, 0), 'olho superior esquerdo');
  assert.ok(olho(0, size - 7), 'olho superior direito');
  assert.ok(olho(size - 7, 0), 'olho inferior esquerdo');
});

test('the same code always draws the same square', () => {
  // Determinismo não é detalhe: a etiqueta impressa hoje e a conferência de
  // amanhã leem o mesmo lote, e uma máscara escolhida ao acaso a cada chamada
  // faria duas impressões do mesmo lote não baterem entre si.
  const uma = qrModules('20260902-01');
  const outra = qrModules('20260902-01');
  assert.deepEqual(uma, outra);

  // E códigos diferentes desenham quadrados diferentes.
  assert.notDeepEqual(qrModules('20260902-01'), qrModules('20260902-02'));
});
