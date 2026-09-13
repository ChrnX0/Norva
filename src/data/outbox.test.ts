import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { QUEUED_TABLES } from './outbox';

/**
 * A lista de tabelas da fila, conferida contra o código e contra o esquema.
 *
 * `forgetOrphans` percorre `QUEUED_TABLES` e pergunta, para cada entrada da fila,
 * se a linha ainda existe. Isso dá duas formas de errar, e nenhuma delas aparece
 * em tempo de compilação:
 *
 *   - **Tabela enfileirada que não está na lista.** A órfã dela sobrevive, e o
 *     motor volta a parar na primeira que aparecer. É o defeito de novo, e
 *     silencioso: quem acrescenta um \`enqueue\` amanhã não tem por que abrir este
 *     arquivo.
 *   - **Tabela na lista que não existe no esquema.** O \`SELECT ... FROM <tabela>\`
 *     levanta erro de SQLite dentro da transação de apagar, e apagar deixa de
 *     funcionar.
 *
 * As duas são pegas lendo o sistema — o \`repository.ts\` e o \`db.ts\` — em vez de
 * comparar esta lista com ela mesma. Foi a cicatriz do \`erase.test.ts\`: um mapa
 * escrito à mão conferido contra o union que tinha os mesmos membros, e nove
 * tabelas invisíveis por construção.
 */
const REPOSITORY = readFileSync('src/data/repository.ts', 'utf8');
const DB = readFileSync('src/data/db.ts', 'utf8');

/** Toda tabela que aparece num `enqueue` do repositório. */
function enfileiradas(): string[] {
  return [...new Set([...REPOSITORY.matchAll(/table: '([a-z_]+)'/g)].map((m) => m[1]))].sort();
}

test('every table the code queues is a table the orphan sweep knows', () => {
  const noCodigo = enfileiradas();
  assert.ok(noCodigo.length > 10, 'a leitura do repositório veio vazia — a comparação seria de graça');

  const conhecidas = new Set<string>([
    ...QUEUED_TABLES,
    // Comando, não linha: `erase` não tem linha atrás dele, e é exatamente o que a
    // varredura não pode confundir com órfã.
    'erase',
  ]);
  const fora = noCodigo.filter((t) => !conhecidas.has(t));

  assert.deepEqual(
    fora,
    [],
    `estas tabelas são enfileiradas e a varredura de órfãs não olha para elas:\n  ${fora.join('\n  ')}\n` +
      'A entrada órfã delas sobrevive ao apagar, e o motor da fila para no primeiro ' +
      'buraco de propósito — uma exceção que repete, com tudo o que a fábrica gravar ' +
      'depois preso atrás dela.',
  );
});

test('every table the sweep visits exists, with the id column it asks for', () => {
  const criadas = new Set(
    [...DB.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]),
  );
  assert.ok(criadas.size > 15, 'a leitura do esquema veio vazia');

  for (const table of QUEUED_TABLES) {
    assert.ok(criadas.has(table), `\`${table}\` está na lista da fila e não existe no esquema`);

    // A varredura compara `t.id = o.row_id`. Tabela sem `id` levantaria erro de
    // SQLite dentro da transação de apagar.
    const corpo = DB.slice(DB.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`));
    const ate = corpo.slice(0, corpo.indexOf(');'));
    assert.match(ate, /^\s*id\s/m, `\`${table}\` não tem coluna \`id\` para a varredura comparar`);
  }
});
