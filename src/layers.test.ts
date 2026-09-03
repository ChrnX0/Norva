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

/**
 * Frase de tela não se escreve na tela — nem uma.
 *
 * A cicatriz: `WhySheet` — a folha que abre a conta de toda conclusão do
 * aplicativo, a Lei 6 em pessoa — tinha "Custo do lote", "Perda prevista" e
 * "Fechar" cravados em português. Uma fábrica em espanhol via a interface
 * traduzida e, no instante em que pedia a prova do número, recebia português. O
 * `Widen<T>` não pega isso: ele obriga a CHAVE a existir nos três dicionários e
 * não obriga a tela a usá-la.
 *
 * A régua é a PALAVRA FUNCIONAL, não o acento — e essa correção tem história de
 * cinco minutos: a primeira versão deste caso procurava acento e se dizia capaz de
 * ter pegado o `WhySheet`. "Custo do lote" não tem acento nenhum. O guard passaria
 * verde na própria cicatriz que ele cita, o que é pior que não existir: ele
 * anunciaria uma proteção que não estava lá.
 *
 * Palavra funcional ("do", "da", "de", "para", "que"…) num literal de duas
 * palavras ou mais é o que distingue frase de identificador, e é o que sobrou
 * depois de tentar as duas alternativas mais óbvias: acento erra por falta, e
 * "qualquer literal com espaço" erra por excesso — 'America/Sao_Paulo' e
 * 'svg path' não são frases.
 */
const PALAVRAS = ['do', 'da', 'de', 'no', 'na', 'em', 'para', 'por', 'com', 'que'];

/**
 * Um literal é frase quando tem palavra funcional E espaço, e não é caminho.
 *
 * As três condições saíram de alarmes falsos, um por um, e cada uma custou uma
 * rodada: `'as'` na lista acusava `as Draft['kind']`, porque `as` é palavra-chave
 * do TypeScript; sem exigir espaço, `'input'` casava; e sem excluir caminho,
 * `'@/domain/day'` casava com "do".
 *
 * A interpolação sai antes da conta: `${formatQuantity(...)}` é composição de
 * pedaço já traduzido, não texto cravado.
 */
function pareceFrase(linha: string): boolean {
  const literais = linha.match(/(['"`])[^'"`]{4,}\1/g) ?? [];
  return literais.some((bruto) => {
    const texto = bruto.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
    if (!texto.includes(' ')) return false;
    if (texto.includes('/') || texto.includes('=')) return false;
    return new RegExp(`\\b(${PALAVRAS.join('|')})\\b`, 'i').test(texto);
  });
}

/** As pastas que desenham. `src/data` semeia exemplo, e exemplo é dado. */
function screenLayers(): string[] {
  const inSrc = readdirSync('src')
    .filter((entry) => ['components', 'home', 'notify'].includes(entry))
    .map((entry) => join('src', entry));
  return ['app', ...inSrc];
}

test('no screen writes a sentence of its own', () => {
  const offenders: string[] = [];

  for (const dir of screenLayers()) {
    for (const file of sourcesUnder(dir)) {
      // Comentário fala português à vontade — é para humano, não para tela. O
      // mesmo `code()` que a checagem de SQL usa, pelo mesmo motivo.
      const source = code(readFileSync(file, 'utf8'));
      for (const linha of source.split('\n')) {
        // Caminho de importação e rota não são frase: `@/domain/day` e
        // `/inputs/new` casariam com "do" e "in" sem ser texto de tela.
        if (/^\s*import |from '@?[./]|router\.(push|replace)|getByLabel|goto\(/.test(linha)) continue;
        if (pareceFrase(linha)) offenders.push(`${file}: ${linha.trim().slice(0, 70)}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `estas linhas escrevem frase na tela em vez de no dicionário:\n${offenders.join('\n')}\n` +
      'A interface inteira fica traduzida e a frase cravada aparece em português no meio dela — ' +
      'foi o que aconteceu com a folha do [por quê?].',
  );
});

test('the sentence guard bites the real scar, and leaves identifiers alone', () => {
  // O caso que a primeira versão deste guard NÃO pegava, e que é a cicatriz
  // inteira: nenhum acento, e frase mesmo assim.
  assert.ok(pareceFrase("<Text>{'Custo do lote'}</Text>"), 'a cicatriz tem que reprovar');
  assert.ok(pareceFrase('const titulo = "Perda prevista no lote";'));

  // Comentário é para humano.
  assert.ok(!pareceFrase(code('// isto é um comentário que fala do lote')));

  // E os três alarmes falsos que a régua anterior deu, cada um por um motivo
  // diferente: palavra-chave da linguagem, literal de uma palavra, e caminho.
  assert.ok(!pareceFrase(": 'input') as Draft['kind'],"), 'as é palavra-chave, não frase');
  assert.ok(!pareceFrase("const kind = 'temperature';"));
  assert.ok(!pareceFrase("import { dayWindow } from '@/domain/day';"), 'caminho não é frase');
  assert.ok(
    !pareceFrase('`${formatQuantity(l.baseUnits, locale)} ${l.unit}`'),
    'interpolação é composição de pedaço já traduzido',
  );
});
