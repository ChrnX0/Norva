import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aceitaDoPai } from './campo';

/**
 * Provada contra o caso que ela deve pegar e o caso que ela não deve — o que o
 * `CLAUDE.md` exige de todo detector antes de ele reportar qualquer coisa. E o
 * caso falso aqui não é hipótese: é o defeito que a PRIMEIRA versão desta régua
 * tinha, achado lendo o conserto antes de ele chegar ao aparelho.
 */
test('com o dedo no campo, quem manda é quem digita', () => {
  // Verdadeiro: o pai devolveu "Pi" enquanto a pessoa já digitou "Pic" — uma
  // renderização atrasado. Obedecer isso apaga a letra que ela acabou de pôr.
  assert.equal(aceitaDoPai('Pi', 'Pic', true), false);
  // E vale mesmo quando o pai transforma de propósito: enquanto o dedo está ali,
  // nada de fora entra. O que ele decidiu chega ao sair.
  assert.equal(aceitaDoPai('PIC', 'Pic', true), false);
});

test('fora do campo, quem manda é o pai — inclusive para esvaziar', () => {
  // O caso que a régua com memória engolia: formulário que se limpa ao salvar,
  // com nome curto o bastante para ainda estar na janela de memória.
  assert.equal(aceitaDoPai('', 'Loja', false), true);
  // Transformação vinda do pai entra ao sair do campo.
  assert.equal(aceitaDoPai('LOJA', 'Loja', false), true);
  // E o que já está igual não vira renderização à toa.
  assert.equal(aceitaDoPai('Loja', 'Loja', false), false);
  assert.equal(aceitaDoPai('Loja', 'Loja', true), false);
});
