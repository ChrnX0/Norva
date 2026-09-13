import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * **Crase dentro de SQL que o SHELL lê é comando, e esta é a SÉTIMA vez.**
 *
 * O provador de migrações é prosa técnica dentro de strings de shell, e em duas das três
 * linguagens que ele atravessa a crase não é marcação:
 *
 *  - num heredoc NÃO citado (`<<SQL`, sem aspas no delimitador) o shell expande o conteúdo;
 *  - dentro de `psql -c "…"` a crase é substituição de comando, e uma aspa dupla FECHA a
 *    string, depois do que o shell executa as linhas de SQL.
 *
 * O custo não é a falha: é o SUCESSO sujo. A execução sai verde com
 * `verify-migrations.sh: line 551: 0062: command not found` no meio, e ninguém olha duas
 * vezes uma linha de ruído dentro de um relatório que termina em OK. Foi assim que duas
 * mensagens dessas viveram na saída da garantia 34 desde que ela foi escrita — e a sétima
 * ocorrência apareceu num comentário que eu mesmo acabei de escrever, explicando a segunda.
 *
 * A régua é estreita de propósito: ela só olha as regiões onde o shell de fato lê. Crase em
 * comentário de shell (fora de string) é inofensiva e este projeto usa muitas — acusá-las
 * seria a guarda que ensina a ignorar guarda.
 */

/** As linhas que o shell vai expandir, com o número de cada uma. */
function regioesQueOShellLe(fonte: string): { linha: number; texto: string }[] {
  const dentro: { linha: number; texto: string }[] = [];
  let heredoc: string | null = null;
  let emString = false;

  fonte.split('\n').forEach((texto, i) => {
    const numero = i + 1;

    if (heredoc !== null) {
      if (texto.trim() === heredoc) heredoc = null;
      else dentro.push({ linha: numero, texto });
      return;
    }

    // Heredoc: `<<SQL` expande, `<<'SQL'` não. É a única diferença, e ela é uma aspa.
    const abre = /<<\s*('?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(texto);
    if (abre) {
      if (abre[1] === '') heredoc = abre[2];
      return;
    }

    if (emString) {
      if (texto.includes('"')) {
        emString = false;
        dentro.push({ linha: numero, texto: texto.slice(0, texto.indexOf('"')) });
      } else {
        dentro.push({ linha: numero, texto });
      }
      return;
    }

    // `psql … -c "` que não fecha na mesma linha abre uma string multilinha.
    const aspas = (texto.match(/"/g) ?? []).length;
    if (/-c\s+"/.test(texto) && aspas % 2 === 1) {
      emString = true;
      dentro.push({ linha: numero, texto: texto.slice(texto.indexOf('-c')) });
    }
  });

  return dentro;
}

test('nenhuma crase mora onde o shell do provador vai executá-la', () => {
  const fonte = readFileSync('scripts/verify-migrations.sh', 'utf8');
  const regioes = regioesQueOShellLe(fonte);

  // A guarda tem de ter LIDO alguma coisa: se a leitura devolvesse vazio ela aprovaria
  // para sempre sem olhar nada, que é o defeito que este repositório mais persegue.
  assert.ok(
    regioes.length > 200,
    `só ${regioes.length} linhas lidas como expandidas pelo shell — a régua não está lendo o arquivo`,
  );

  const acusadas = regioes
    .filter(({ texto }) => texto.includes('`'))
    .map(({ linha, texto }) => `scripts/verify-migrations.sh:${linha}: ${texto.trim().slice(0, 70)}`);

  assert.deepEqual(
    acusadas,
    [],
    'crase aqui é substituição de comando: a execução sai VERDE com um "command not found" ' +
      'no meio, e ninguém lê ruído dentro de um relatório que termina em OK. Escreva o nome ' +
      'sem marcação — foi a sétima ocorrência desta cicatriz.',
  );
});

test('a régua separa o heredoc que expande do que não expande', () => {
  // O caso VERDADEIRO: heredoc sem aspas no delimitador.
  const expande = regioesQueOShellLe(['psql -q <<SQL', '-- a `0062` diz isso', 'SQL'].join('\n'));
  assert.deepEqual(
    expande.map((r) => r.linha),
    [2],
    'heredoc sem aspas é expandido pelo shell, e a linha de dentro tem de entrar na régua',
  );

  // O FALSO: com aspas, o shell não toca em nada lá dentro.
  const naoExpande = regioesQueOShellLe(["psql -q <<'SQL'", '-- a `0062` diz isso', 'SQL'].join('\n'));
  assert.deepEqual(naoExpande, [], 'heredoc citado não expande — acusar aqui seria falso positivo');

  // E o `-c "…"` multilinha, que é a outra porta.
  const string = regioesQueOShellLe(['psql -d "$DB" -c "', '  -- a `0062` diz isso', '  select 1;"'].join('\n'));
  assert.ok(
    string.some((r) => r.texto.includes('`')),
    'a string de psql aberta numa linha e fechada noutra é lida pelo shell inteira',
  );

  // Comentário de shell FORA de string não é acusado: o arquivo está cheio deles.
  assert.deepEqual(regioesQueOShellLe('# a `0062` diz isso'), [], 'crase em comentário de shell é inofensiva');
});
