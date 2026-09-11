import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { mesmaTelaEmTodas } from '../scripts/leitura.mjs';

/**
 * A guarda das cinco larguras não pode responder o que não conseguiu medir.
 *
 * O `CLAUDE.md` descreve esta guarda como o que pega *"a navegação não pegou numa das
 * cinco larguras"* e, duas seções depois, proíbe guarda que não pode falhar. Ela era as
 * duas coisas ao mesmo tempo: com o movimento de ambiente ligado — o estado normal do
 * aplicativo — o `uiautomator` não lê nada, as cinco leituras viravam `''`, o
 * `.filter(Boolean)` as descartava, e `[].length <= 1` anunciava "as cinco são a mesma
 * tela".
 *
 * O caso que este arquivo protege é o do meio, e é ele que faz a diferença valer: quatro
 * larguras lidas e iguais, uma ilegível, **não** é "iguais" — a ilegível pode ser
 * exatamente a que não navegou.
 */

const CINCO = (...t: string[]) => t;

test('cinco leituras falhadas NÃO são "a mesma tela" — é "não sei"', () => {
  const r = mesmaTelaEmTodas(CINCO('', '', '', '', ''));
  assert.equal(r.veredito, 'nao-sei', 'a guarda voltou a afirmar o que não mediu');
  assert.equal(r.lidas, 0);
  assert.equal(r.de, 5);
});

test('as cinco lidas e iguais são "iguais"', () => {
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', 'Nova ficha', 'Nova ficha', 'Nova ficha', 'Nova ficha'));
  assert.equal(r.veredito, 'iguais');
  assert.equal(r.lidas, 5);
});

test('uma que destoa é "diferentes" — a assinatura do defeito', () => {
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', 'Nova ficha', 'Hoje a fábrica', 'Nova ficha', 'Nova ficha'));
  assert.equal(r.veredito, 'diferentes');
  assert.deepEqual(r.vistos.sort(), ['Hoje a fábrica', 'Nova ficha']);
});

test('quatro iguais e uma ILEGÍVEL não é "iguais" — a ilegível pode ser a que falhou', () => {
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', 'Nova ficha', '', 'Nova ficha', 'Nova ficha'));
  assert.equal(r.veredito, 'nao-sei', 'a leitura que faltou era justamente a que a guarda existe para olhar');
  assert.equal(r.lidas, 4);
  assert.equal(r.de, 5);
});

test('duas lidas e diferentes JÁ derrubam, mesmo com as outras ilegíveis', () => {
  // Diferença achada é fato; ausência de diferença entre duas de cinco não é.
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', '', 'Hoje a fábrica', '', ''));
  assert.equal(r.veredito, 'diferentes');
});

test('uma leitura só não compara com nada', () => {
  assert.equal(mesmaTelaEmTodas(CINCO('Nova ficha', '', '', '', '')).veredito, 'nao-sei');
});

test('espaço em branco é leitura falhada, não título', () => {
  assert.equal(mesmaTelaEmTodas(CINCO('   ', '\t', '', '', '')).veredito, 'nao-sei');
});

/**
 * E o chamador tem de tratar as três — senão a correção morre na volta.
 *
 * Um `if (!veredito.igual)` sobre a forma nova daria sempre `true` (`igual` não existe
 * mais) e o comando passaria a falhar em toda execução. Esta linha lê o `aparelho.mjs`
 * e cobra que ele cite as três respostas pelo nome.
 */
test('o comando das cinco larguras trata as três respostas', () => {
  const fonte = readFileSync('scripts/aparelho.mjs', 'utf8');
  assert.match(fonte, /mesmaTelaEmTodas/, 'o comando deixou de perguntar');
  for (const resposta of ['iguais', 'diferentes', 'nao-sei']) {
    assert.match(
      fonte,
      new RegExp(`'${resposta}'`),
      `o comando não trata a resposta '${resposta}' — a guarda voltou a ter duas saídas`,
    );
  }
});
