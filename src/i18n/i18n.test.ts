import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultLocale, fill, plural } from './index';
import { en } from './locales/en';
import { es } from './locales/es';
import { ptBR } from './locales/pt-BR';

/**
 * Os três dicionários, conferidos um contra o outro.
 *
 * `Widen<T>` já obriga a CHAVE: uma entrada nova em português quebra a
 * compilação das outras duas até serem escritas. O que ele não vê é o buraco
 * dentro da frase. "Ontem foram {{amount}}." traduzido como "Yesterday." compila
 * limpo, e a tela imprime uma frase sem o número - que é a Lei 3 desligada em
 * silêncio, no idioma que ninguém desta sala lê para conferir.
 */

type Node = string | { [key: string]: Node };

/** Todas as folhas, com o caminho até elas: `app.home.costWas`. */
function leaves(node: Node, path: string[] = []): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof node === 'string') {
    out.set(path.join('.'), node);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    for (const [k, v] of leaves(value, [...path, key])) out.set(k, v);
  }
  return out;
}

function holes(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

test('a translation keeps every hole the original has', () => {
  const base = leaves(ptBR as unknown as Node);
  assert.ok(base.size > 300, `o dicionário encolheu para ${base.size} frases - este teste passaria à toa`);

  for (const [language, dictionary] of [
    ['en', en],
    ['es', es],
  ] as const) {
    const other = leaves(dictionary as unknown as Node);
    for (const [path, original] of base) {
      const translated = other.get(path);
      assert.ok(translated !== undefined, `${language}: falta ${path}`);
      assert.deepEqual(
        holes(translated),
        holes(original),
        `${language}: "${path}" mudou os buracos da frase - "${translated}" contra "${original}"`,
      );
    }
  }
});

test('a number handed to a sentence with nowhere to put it still gets said', () => {
  // A entrada com buraco recebe o número no lugar certo.
  assert.equal(plural(3, { one: '1 caixa', other: '{{n}} caixas' }, '1.200'), '1.200 caixas');

  // A entrada SEM buraco é só a palavra - e metade das telas a usa ao lado de um
  // número que elas mesmas escrevem. Chamada com um número, ela devolvia a
  // palavra sozinha, e o cartão da capa saiu dizendo "unidades" sem quantidade
  // nenhuma num aviso cujo assunto inteiro é a quantidade.
  assert.equal(plural(300, { one: 'unidade', other: 'unidades' }, '300'), '300 unidades');
  assert.equal(plural(1, { one: 'unidade', other: 'unidades' }, '1'), '1 unidade');

  // Sem número para mostrar, nada muda.
  assert.equal(plural(2, { one: 'unidade', other: 'unidades' }), 'unidades');
});

test('a hole nobody filled stays visible instead of becoming a blank', () => {
  // Some com o valor e a frase vira "Ontem foram ." - um erro que parece texto.
  assert.equal(fill('Ontem foram {{amount}}.', {}), 'Ontem foram {{amount}}.');
  assert.equal(fill('Ontem foram {{amount}}.', { amount: '300' }), 'Ontem foram 300.');
  assert.equal(defaultLocale.language, 'pt-BR');
});
