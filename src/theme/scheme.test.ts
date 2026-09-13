import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveScheme, SCHEMES, SCHEME_PADRAO } from './scheme';

/**
 * A luz da tela: o que a escolha decide e o que o aparelho decide.
 *
 * Estes testes existem porque a regra estava dentro do `ThemeProvider`, onde só
 * o navegador a alcançava — e a suíte de mutação roda a unidade. As duas
 * mutações que protegem esta regra sobreviveriam calmamente, com o e2e verde
 * dizendo que estava tudo bem.
 */

test('the default is light, which is the owner decision', () => {
  assert.equal(SCHEME_PADRAO, 'claro');
  assert.equal(
    resolveScheme(SCHEME_PADRAO, 'dark'),
    'light',
    'e o padrão vale mesmo com o aparelho no escuro — foi exatamente esse o defeito relatado',
  );
});

test('an explicit choice ignores the phone, in both directions', () => {
  for (const doAparelho of ['light', 'dark', 'unspecified', null, undefined] as const) {
    assert.equal(resolveScheme('claro', doAparelho), 'light');
    assert.equal(resolveScheme('escuro', doAparelho), 'dark');
  }
});

test('following the phone actually follows the phone', () => {
  assert.equal(resolveScheme('sistema', 'dark'), 'dark');
  assert.equal(resolveScheme('sistema', 'light'), 'light');
  // O que o aparelho responde de verdade não é só claro e escuro: o
  // `ColorSchemeName` do React Native também diz `unspecified`, e um navegador
  // pode não responder nada. Todas essas dão claro — só `dark` escurece.
  assert.equal(resolveScheme('sistema', 'unspecified'), 'light');
  assert.equal(resolveScheme('sistema', null), 'light');
  assert.equal(resolveScheme('sistema', undefined), 'light');
});

test('the three paths all exist, and none of them is dropped', () => {
  assert.deepEqual(SCHEMES, ['claro', 'escuro', 'sistema']);
  // A asserção de presença ao lado da de ausência: sem ela, "nenhuma escolha
  // some" seria verdade de graça numa lista vazia.
  assert.ok(SCHEMES.length === 3, 'as três escolhas continuam de pé');
  assert.ok(SCHEMES.includes(SCHEME_PADRAO), 'o padrão é uma das escolhas oferecidas');
});
