import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CODIGOS_PERMANENTES, classeDaRecusa } from './recusa';

test('o código que a NOSSA migração escolheu é permanente', () => {
  // `23505` é certo porque a fila sobe por `upsert` com `onConflict: 'id'`: um conflito de
  // unicidade não é o id, é outro índice ou um gatilho nosso. Mandar a mesma linha de novo
  // bate na mesma parede.
  assert.equal(classeDaRecusa('23505'), 'permanente');
});

test('todo código desconhecido é PASSAGEIRO, e é a assimetria que manda', () => {
  // O caso falso, e ele vale mais que o verdadeiro. Chamar passageira de permanente tira a
  // linha da frente e ela nunca chega ao servidor — dado perdido em silêncio. O contrário
  // trava a fila, que é o de hoje: ruim, visível, sem perda.
  for (const codigo of ['23503', '42501', '23514', '40001', '08006', '', 'PGRST301', 'xyz']) {
    assert.equal(classeDaRecusa(codigo), 'passageira', `${codigo} não pode sair da frente`);
  }
  assert.equal(classeDaRecusa(null), 'passageira', 'sem código, tenta de novo');
  assert.equal(classeDaRecusa(undefined), 'passageira');
});

test('espaço em volta do código não muda a classe', () => {
  // O código chega de um JSON de outro processo; espaço é acidente de transporte, e um
  // `23505 ` tratado como desconhecido devolveria a fila travada que isto existe para abrir.
  assert.equal(classeDaRecusa(' 23505 '), 'permanente');
  assert.equal(classeDaRecusa('\n23505'), 'permanente');
});

test('cada código promovido tem uma migração que o escolhe', () => {
  /**
   * A guarda que impede a lista de crescer por palpite.
   *
   * Promover um código é aceitar o risco de perder dado, e este projeto só aceita esse risco
   * quando a certeza vem da NOSSA escrita — um gatilho que escolheu o código de propósito.
   * Então cada entrada da lista tem de aparecer, por nome, em `supabase/migrations/`.
   *
   * Ela lê as migrações e não o comentário do arquivo ao lado: duas coisas escritas pela
   * mesma mão não guardam nada, e a regra está no `CLAUDE.md`.
   */
  const NOME_DO_CODIGO: Record<string, string> = { '23505': 'unique_violation' };

  const pasta = new URL('../../supabase/migrations/', import.meta.url);
  const sql = readdirSync(pasta)
    .filter((nome) => nome.endsWith('.sql'))
    .map((nome) => readFileSync(new URL(nome, pasta), 'utf8'))
    .join('\n');

  // A leitura primeiro: régua que não acha nada concorda com qualquer coisa.
  assert.ok(sql.length > 10_000, `as migrações não foram lidas (${sql.length} bytes)`);
  assert.ok(/errcode/.test(sql), 'e nenhuma escolhe errcode — a leitura está no lugar errado');

  const semMigracao = CODIGOS_PERMANENTES.filter((codigo) => {
    const nome = NOME_DO_CODIGO[codigo];
    return !nome || !new RegExp(`errcode\\s*=\\s*'${nome}'`).test(sql);
  });
  assert.deepEqual(
    semMigracao,
    [],
    `estes códigos foram promovidos a permanentes sem uma migração nossa que os escolha: ` +
      `${semMigracao.join(', ')}. Promover é aceitar o risco de perder dado, e a certeza só ` +
      'vem de a recusa ser NOSSA — um gatilho com `errcode` escrito. Palpite sobre o servidor ' +
      'de alguém entra como passageiro, que é o padrão.',
  );
});
