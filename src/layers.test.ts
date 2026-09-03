import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Where SQL is allowed to live, pinned.
 *
 * Two foundations meet here. The data layer returns facts, not sentences - a
 * module that knows what depends on what has no business speaking Portuguese.
 * And the assistant never writes a query of its own: it calls the same
 * functions the screens call, because an assistant with its own SQL produces a
 * second number for the same question and destroys the app's credibility in a
 * single afternoon.
 *
 * Both were true when this was written and neither was enforced by anything.
 * Convention survives until somebody is in a hurry.
 */

const SQL = /\b(SELECT\s+[\s\S]*?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+[\s\S]*?\bSET\b|DELETE\s+FROM\b)/i;

/** Comments talk about SQL all the time; only code counts. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourcesUnder(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Toda pasta que não é a camada de dados — descoberta, não listada.
 *
 * A lista era escrita à mão, e uma lista escrita à mão significa que a pasta
 * NOVA nasce fora da regra: `src/weather` foi criada e a checagem continuou
 * verde sem nunca ter olhado para ela. Uma regra que só vale para o que já
 * existia protege o código velho, que não é o que quebra.
 */
function layersOutsideData(): string[] {
  const inSrc = readdirSync('src')
    .filter((entry) => entry !== 'data' && statSync(join('src', entry)).isDirectory())
    .map((entry) => join('src', entry));
  return ['app', ...inSrc];
}

/**
 * O dicionário fica fora, e o motivo é um alarme falso que aconteceu.
 *
 * O padrão de `UPDATE ... SET` atravessa linhas de propósito — SQL de verdade
 * neste repositório é escrito em várias —, e um arquivo de idioma é prosa em três
 * línguas. A palavra "update" numa frase e "set" vinte linhas depois casaram, e a
 * checagem acusou o dicionário de conter consulta.
 *
 * Estreitar o padrão para uma linha enfraqueceria a checagem justamente onde ela
 * importa. Tirar a prosa não enfraquece nada: um dicionário com SQL dentro não
 * seria uma violação de camada, seria uma frase sem sentido em três idiomas — e a
 * fundação de i18n já garante que ali só existe texto de tela.
 *
 * Alarme falso num guard é pior que guard ausente: ensina a ignorar a saída dele.
 */
const PROSA = /^src\/i18n\/locales\//;

test('only the data layer speaks SQL', () => {
  const offenders: string[] = [];
  for (const dir of layersOutsideData()) {
    for (const file of sourcesUnder(dir)) {
      if (PROSA.test(file)) continue;
      if (SQL.test(code(readFileSync(file, 'utf8')))) offenders.push(file);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these reach past the data layer: ${offenders.join(', ')}. A query written here is a ` +
      'second implementation of a rule that already exists in src/data, and the two answers ' +
      'diverge the first time one of them is corrected.',
  );
});

test('the data layer is where SQL actually is, so the test above means something', () => {
  // A rule that would pass on an empty repository proves nothing. This is the
  // control: if the queries ever move somewhere else, the check above stops
  // being a check and this one says so.
  const withSql = sourcesUnder('src/data').filter((f) => SQL.test(code(readFileSync(f, 'utf8'))));
  assert.ok(withSql.length >= 3, `expected the data layer to hold the queries, found ${withSql.length}`);
});

test('the suite runs every test file, whatever folder it lands in', () => {
  // This file is the one that found it: `src/**/*.test.ts` UNQUOTED is expanded
  // by the shell, which without globstar reads `**` as a single level. Sitting
  // at the root of src/, this file was silently never executed - and a test
  // that never runs is indistinguishable from a test that passes.
  //
  // Quoted, the pattern reaches node's own runner, which understands `**` at
  // any depth. The pin is on the quotes because that is the whole defect.
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts.test as string;
  assert.match(
    script,
    /'src\/\*\*\/\*\.test\.ts'|"src\/\*\*\/\*\.test\.ts"/,
    'the test glob must be quoted, or the shell flattens ** to one directory level',
  );
});

test('the prose exclusion is narrow, and the guard still bites next door', () => {
  // A exceção precisa ser do tamanho exato do problema. Se ela crescer para
  // `src/i18n` inteiro, uma consulta escrita no formatador passaria — e o
  // formatador é código, não prosa.
  assert.ok(PROSA.test('src/i18n/locales/pt-BR.ts'));
  assert.ok(!PROSA.test('src/i18n/index.ts'), 'o código do i18n continua coberto');
  assert.ok(!PROSA.test('src/home/Mosaic.tsx'));

  // E o padrão continua achando SQL de verdade, que é o que ele existe para
  // achar: sem isto, a exceção poderia ter quebrado a checagem inteira sem
  // ninguém notar.
  assert.ok(SQL.test('const q = `SELECT id\n FROM items`;'));
  assert.ok(SQL.test('await conn.runAsync(`UPDATE products\n SET name = ?`);'));
  assert.ok(!SQL.test('a frase diz que o app se atualiza sozinho e o campo fica set'));
});
