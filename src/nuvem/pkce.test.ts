import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesParaUrl } from './drive';

/**
 * O único pedaço de `aparelho.ts` que se prova sem aparelho — e ele existe porque
 * a primeira versão dependia de `Buffer`.
 *
 * `Buffer.from(bytes).toString('base64')` compila neste projeto: `@types/node`
 * está instalado, então o tipo existe. **`Buffer` não é global no React Native.**
 * Seria o defeito da câmera de horas antes com outro sujeito — tipo presente,
 * implementação ausente na plataforma, falha só no primeiro toque em "ligar o
 * Drive", no aparelho do dono.
 *
 * A segunda fonte aqui é o `Buffer` do Node: ele é a régua independente para
 * conferir a conta feita à mão, e é justamente por não estar disponível no
 * aparelho que ele só aparece no teste.
 */

/** A régua: base64url pela biblioteca do Node, que não é o código testado. */
function pelaRegua(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

test('o base64url à mão dá o mesmo que a régua, em todos os restos de três', () => {
  // Os três comprimentos possíveis módulo 3 são os três caminhos do laço, e é
  // onde um `break` no lugar errado perde um caractere sem quebrar nada visível.
  for (const n of [0, 1, 2, 3, 4, 5, 6, 31, 32, 33]) {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) bytes[i] = (i * 37 + 11) % 256;
    assert.equal(bytesParaUrl(bytes), pelaRegua(bytes), `falhou com ${n} bytes`);
  }
});

test('nenhum caractere que a URL rejeita sai daqui', () => {
  // 0xFB..0xFF são os bytes que produzem `+` e `/` no base64 comum — o par que
  // quebra uma query string e faz o Google recusar o pedido com uma tela em
  // inglês no meio do fluxo.
  const bytes = new Uint8Array([0xfb, 0xff, 0xbf, 0x00, 0x10, 0x83]);
  const saiu = bytesParaUrl(bytes);
  assert.ok(!/[+/=]/.test(saiu), `saiu com caractere proibido: ${saiu}`);
  assert.equal(saiu, pelaRegua(bytes));
});
