import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * O número de garantias do banco, dito em três lugares, conferido contra um.
 *
 * **A cicatriz.** O `CLAUDE.md` é o arquivo que toda sessão lê primeiro, e o bloco
 * de comandos dele dizia *"Postgres descartável, **oito** garantias"* no dia em que
 * o `db:verify` passou a ter nove. Não é história datada — é referência, e quem
 * lesse aquilo começaria a sessão achando que a nona está sobrando ou faltando.
 *
 * O mesmo número aparece em três lugares, e os três são escritos à mão:
 *
 * 1. quantos blocos `==> check N:` o `scripts/verify-migrations.sh` tem;
 * 2. a frase que ele imprime no fim — *"all nine guarantees hold"*;
 * 3. o comentário do `CLAUDE.md`, por extenso e em português.
 *
 * Só o primeiro é fato: os outros dois são alguém lembrando. Este teste faz os
 * três baterem, e o lado que manda é a **estrutura do script** — que é a mesma
 * regra que o `erase.test.ts` aprendeu no mesmo dia: uma guarda que compara duas
 * coisas escritas pela mesma mão não guarda nada, e a pergunta certa é de onde vem
 * o outro lado da comparação.
 *
 * Ele NÃO roda o `db:verify` — isso custa um Postgres. Ele lê o arquivo, que é o
 * suficiente para pegar a única coisa que dá para errar aqui: acrescentar uma
 * checagem e esquecer de contar.
 */

const SCRIPT = readFileSync('scripts/verify-migrations.sh', 'utf8');
const CLAUDE = readFileSync('CLAUDE.md', 'utf8');

/** Português por extenso, que é como a prosa deste projeto escreve número. */
const POR_EXTENSO = [
  'zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito',
  'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis',
  'dezessete', 'dezoito', 'dezenove', 'vinte',
];
/** E em inglês, que é a língua da saída do script. */
const IN_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

/** O fato: quantos blocos de checagem o script tem de verdade. */
const QUANTAS = [...SCRIPT.matchAll(/^echo "==> check (\d+):/gm)].length;

test('the database checks are numbered without a gap', () => {
  assert.ok(QUANTAS > 5, `o script foi lido com ${QUANTAS} checagens — a comparação seria de graça`);

  const numeros = [...SCRIPT.matchAll(/^echo "==> check (\d+):/gm)].map((m) => Number(m[1]));
  assert.deepEqual(
    numeros,
    Array.from({ length: QUANTAS }, (_, i) => i + 1),
    'as checagens do db:verify pulam ou repetem um número — a saída fica impossível de acompanhar',
  );
});

test('the script says how many guarantees it actually has', () => {
  const dito = SCRIPT.match(/all (\w+) guarantees hold/);
  assert.ok(dito, 'a frase final do db:verify sumiu — é ela que anuncia o veredito');
  assert.equal(
    dito[1],
    IN_WORDS[QUANTAS],
    `o script tem ${QUANTAS} checagens e a frase final diz "${dito[1]}". ` +
      'Quem acrescenta uma checagem tem que mexer nos dois lugares, e o segundo é fácil de esquecer.',
  );
});

test('CLAUDE.md states the number of guarantees the script really has', () => {
  const dito = CLAUDE.match(/Postgres descartável, (\w+) garantias/);
  assert.ok(
    dito,
    'o bloco de comandos do CLAUDE.md deixou de nomear as garantias do db:verify — ' +
      'ele é o primeiro arquivo que toda sessão lê, e é por ele que se sabe o que a barra faz',
  );
  assert.equal(
    dito[1],
    POR_EXTENSO[QUANTAS],
    `o db:verify tem ${QUANTAS} garantias e o CLAUDE.md diz "${dito[1]}". ` +
      'Não é história datada, é referência: quem ler começa a sessão com o número errado na cabeça.',
  );
});
