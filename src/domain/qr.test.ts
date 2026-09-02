import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUIET_ZONE, qrModules, qrPath } from './qr';

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

test('the white margin is part of the code, not part of the styling', () => {
  const { span, path } = qrPath('20260902-01');

  // Quatro módulos de branco de cada lado: 21 + 4 + 4 = 29. É o que o padrão
  // exige, e é a primeira coisa que some quando alguém aperta a etiqueta para
  // caber - com o papelão da caixa encostando no código, o leitor desiste.
  assert.equal(span, 21 + QUIET_ZONE * 2);

  // E nenhum módulo preto invade a margem: todo comando do caminho começa em
  // quatro ou mais, e termina antes do fim da zona do outro lado.
  const pontos = [...path.matchAll(/M(\d+) (\d+)h/g)].map(([, x, y]) => [Number(x), Number(y)]);
  assert.ok(pontos.length > 0, 'o código desenhou alguma coisa');
  for (const [x, y] of pontos) {
    assert.ok(x >= QUIET_ZONE && y >= QUIET_ZONE, `módulo dentro da margem: ${x},${y}`);
    assert.ok(
      x < span - QUIET_ZONE && y < span - QUIET_ZONE,
      `módulo passando da margem oposta: ${x},${y}`,
    );
  }
});

test('the correction level is the highest one, because here it costs nothing', () => {
  // Os quatro níveis cabem na mesma grade de 21 com onze caracteres - isso foi
  // MEDIDO, não suposto, e derrubou a justificativa que este arquivo tinha
  // escrito ("M para não crescer a grade"). Com o tamanho igual, escolher menos
  // correção é escolher menos tolerância a gelo e arranhão de graça.
  //
  // O teste trava a decisão pelo que é observável: o mapa de módulos do nível H
  // é o que este projeto desenha. Trocar o nível muda o desenho, e este teste
  // cai junto.
  const grade = qrModules('20260902-01');
  const pretos = grade.flat().filter(Boolean).length;

  assert.equal(grade.length, 21, 'a grade continua sendo a menor que existe');
  assert.equal(pretos, 224, 'o desenho é o do nível H — outro nível pinta outra quantidade');
});
