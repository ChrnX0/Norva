import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { INTERNAL_PLACE_KINDS } from './domain/ledger';

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

/**
 * O aviso de validade nunca é preso a uma sala.
 *
 * **A cicatriz, e ela é sobre ONDE o defeito mora.** `expiringSoon` estava certa:
 * ela aceita a sala como parâmetro opcional e, sem ele, responde pela empresa
 * inteira. Quem errava eram os dois pontos de chamada — a capa e o alarme do
 * celular — que passavam o almoxarifado.
 *
 * A soma por local de um lote que saiu do almoxarifado dá zero ali, e o
 * `HAVING SUM(...) > 0` o descarta. Então o filtro silenciava o aviso EXATAMENTE
 * no dia em que o picolé ia para a câmara fria — que, numa fábrica de picolés, é
 * o dia seguinte ao de produzi-lo. O produto vencia dentro dela e o cartão nunca
 * tocava.
 *
 * **Por que isto é guarda de fonte e não teste de unidade.** O defeito não está
 * em nenhuma função: está no argumento que uma tela passa. Um teste de unidade
 * chamando `expiringSoon` diretamente passa nos dois mundos — foi o que aconteceu:
 * escrevi o teste da regra, ele passou, e a mutação que devolvia o filtro à capa
 * ATRAVESSOU a suíte inteira. Só o navegador provaria de verdade, e o caminho
 * completo (cadastrar prazo, produzir, criar câmara, transferir com lote, voltar
 * à capa) é longo demais para o que se ganha. Isto fica no meio: barato, preciso,
 * e cobre o chamador que alguém acrescentar amanhã.
 *
 * O que ele NÃO prova, dito em vez de omitido: que a capa DESENHA o aviso. Prova
 * que ela não o restringe a uma sala.
 */
test('no screen scopes the expiry warning to a single room', () => {
  const fontes = [...sourcesUnder('app'), ...sourcesUnder('src')];
  assert.ok(fontes.length > 20, 'a varredura de fontes veio vazia — a comparação seria de graça');

  const chamadas: string[] = [];
  for (const f of fontes) {
    const texto = readFileSync(f, 'utf8');
    // `(?<!function )` tira a DECLARAÇÃO: a assinatura em `repository.ts` também
    // casa com "expiringSoon(" e tem quatro parâmetros, então sem isto a guarda
    // acusa a própria função que ela existe para proteger.
    for (const m of texto.matchAll(/(?<!function )expiringSoon\(([^)]*)\)/g)) {
      const args = m[1].split(',').map((a) => a.trim()).filter(Boolean);
      // companyId, data limite, limite — o quarto é a sala.
      if (args.length >= 4) chamadas.push(`${f}: expiringSoon(..., ${args[3]})`);
    }
  }

  assert.deepEqual(
    chamadas,
    [],
    `estas telas prendem o aviso de validade a uma sala:\n  ${chamadas.join('\n  ')}\n` +
      'A soma por local de um lote que saiu daquela sala dá zero, e o aviso emudece — ' +
      'justamente quando o produto está longe dos olhos, prestes a vencer. O aviso é sobre ' +
      'o LOTE, onde quer que ele esteja.',
  );
});

/**
 * A sala que a contagem grava é a sala que a tela mostrou.
 *
 * **A cicatriz.** `app/inputs/[id].tsx` mostrava `item.onHandBaseUnits` — o
 * total da EMPRESA, porque `findItem` era chamada sem sala — e gravava a
 * diferença com `locationId: defaultLocationId(...)`, o almoxarifado. Com a
 * polpa dividida entre a fábrica e a câmara fria, contar a prateleira da fábrica
 * "encontrava" uma falta do tamanho exato do que estava na câmara, e gravava essa
 * falta contra a fábrica. O saldo da fábrica caía, o da câmara não subia: estoque
 * teleportado, com o operador tendo feito tudo certo e o livro-razão guardando a
 * mentira para sempre — contagem não se apaga, se estorna.
 *
 * **Por que guarda de fonte.** O defeito não está em função nenhuma:
 * `recordCount` faz exatamente o que lhe pedem, e `findItem` aceita a sala desde
 * que alguém a passe. Está na combinação de duas linhas a duzentas linhas de
 * distância dentro de uma tela — e tela não tem teste de unidade aqui. Um teste
 * de `recordCount` passa nos dois mundos.
 *
 * **A régua.** Numa tela, o local de uma contagem tem de ser um valor que a tela
 * calculou (a sala da rota, ou o único lugar em que o item está). Chamada de
 * função no lugar do local é o padrão do defeito: `defaultLocationId(...)` e a
 * constante da empresa são as duas formas de dizer "o almoxarifado, sempre",
 * escritas ao lado de um número que pode não ser dele.
 *
 * O que ele NÃO prova: que a tela escolheu a sala CERTA. Prova que ela escolheu.
 */
export function contagemCega(texto: string): string[] {
  const achados: string[] = [];
  // Até o `);` que fecha a chamada. O preguiçoso não para dentro de
  // `defaultLocationId(...)` porque ali o `)` é seguido de vírgula, não de `;`.
  for (const m of texto.matchAll(/recordCount\(([\s\S]{0,400}?)\)\s*;/g)) {
    const local = m[1].match(/locationId:\s*([^,\n]+)/);
    if (!local) continue;
    const valor = local[1].trim();
    if (/\w\(|LOCAL_COMPANY_ID|companyId/.test(valor)) achados.push(valor);
  }
  return achados;
}

test('no screen counts a room it did not show', () => {
  const telas = sourcesUnder('app');
  assert.ok(telas.length > 10, 'a varredura de telas veio vazia — a comparação seria de graça');

  const cegas: string[] = [];
  for (const f of telas) {
    for (const valor of contagemCega(readFileSync(f, 'utf8'))) cegas.push(`${f}: ${valor}`);
  }

  assert.deepEqual(
    cegas,
    [],
    `estas telas gravam a contagem num lugar fixo:\n  ${cegas.join('\n  ')}\n` +
      'A diferença de uma contagem só é verdade contra o saldo que estava na tela. ' +
      'Lugar fixo ao lado de um saldo que pode ser de outra sala teleporta estoque, ' +
      'e contagem não se apaga — se estorna.',
  );
});

test('the counting guard bites the real scar, and leaves the fix alone', () => {
  // A linha exata que existia em `app/inputs/[id].tsx`, numa linha só.
  assert.deepEqual(
    contagemCega(
      `await recordCount(LOCAL_COMPANY_ID, { locationId: defaultLocationId(LOCAL_COMPANY_ID), itemId: item.id, countedBaseUnits: 1 });`,
    ),
    ['defaultLocationId(LOCAL_COMPANY_ID)'],
    'a cicatriz tem que reprovar',
  );

  // E a outra forma de dizer a mesma coisa.
  assert.deepEqual(
    contagemCega(`recordCount(LOCAL_COMPANY_ID, {\n  locationId: LOCAL_COMPANY_ID,\n});`),
    ['LOCAL_COMPANY_ID'],
  );

  // O conserto passa: o local é um valor que a tela calculou.
  assert.deepEqual(
    contagemCega(
      `await recordCount(LOCAL_COMPANY_ID, {\n      locationId: contarEm,\n      itemId: item.id,\n      countedBaseUnits: Math.round(counted),\n    });`,
    ),
    [],
  );

  // E uma chamada sem local nenhum não é assunto desta guarda — quem exige o
  // campo é o tipo, e ele já reprova na compilação.
  assert.deepEqual(contagemCega(`recordCount(companyId, { ...input });`), []);
});

/**
 * A lista de salas nossas é uma só, e o SQL não tem como importá-la.
 *
 * `INTERNAL_PLACE_KINDS` é lida por duas telas (o tom da linha em `app/places.tsx`
 * e o destino possível de um pedido em `app/orders/new.tsx`, pelo `receivesCargo`)
 * e por uma consulta — a de quanto dá para prometer, que decide se um pedido pode
 * ser aceito. Dentro de uma string de SQL a constante não entra: interpolar valor
 * em SQL é o padrão que a proofgate marca, com razão.
 *
 * Então a régua é lida dos dois lados e comparada. Divergir aqui é prometer
 * mercadoria que está numa loja, ou esconder a que está na câmara.
 */
test('the rooms SQL calls ours are the rooms the domain calls ours', () => {
  const fonte = readFileSync('src/data/repository.ts', 'utf8');
  const noSql = [...fonte.matchAll(/l\.kind IN \(([^)]*)\)/g)].map((m) =>
    m[1]
      .split(',')
      .map((k) => k.trim().replace(/^'|'$/g, ''))
      .sort(),
  );
  assert.ok(noSql.length > 0, 'nenhuma consulta filtra por tipo de lugar — a comparação seria de graça');

  for (const lista of noSql) {
    assert.deepEqual(
      lista,
      [...INTERNAL_PLACE_KINDS].sort(),
      'o SQL e `INTERNAL_PLACE_KINDS` discordam sobre quais salas são nossas',
    );
  }
});

/**
 * A tela que produz lê o piso da sala em que o tacho roda.
 *
 * **A cicatriz.** `recordProduction` confere o piso da SALA e tem a razão escrita
 * ao lado: a guarda somava o saldo de todos os lugares e escrevia o consumo num,
 * então bastava mandar um saco de açúcar para a loja para autorizar um tacho com o
 * açúcar que está a dez quilômetros. A tela, porém, continuou lendo
 * `listItems(LOCAL_COMPANY_ID)` — o total da empresa — para decidir se libera o
 * botão. Com a polpa na câmara fria, que é onde polpa mora numa fábrica de picolés,
 * a tela dizia que havia polpa, liberava o botão, e **toda** corrida batia no piso
 * do livro-razão com um erro de programador em inglês.
 *
 * É a mesma forma do defeito da contagem, e por isso a mesma forma de guarda: o
 * defeito não está em função nenhuma, está em duas leituras diferentes da mesma
 * pergunta dentro de uma tela.
 */
export function pisoDeOutraSala(texto: string): string[] {
  if (!/recordProduction\(/.test(texto)) return [];
  const achados: string[] = [];
  for (const m of texto.matchAll(/listItems\(([^)]*)\)/g)) {
    const args = m[1]
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    // companyId, tipo, inativos, sala — sem o quarto, o saldo é o da empresa.
    if (args.length < 4) achados.push(`listItems(${args.join(', ')})`);
  }
  return achados;
}

test('a screen that produces reads the floor of the room the kettle is in', () => {
  const telas = sourcesUnder('app');
  assert.ok(telas.length > 10, 'a varredura de telas veio vazia — a comparação seria de graça');

  const cegas: string[] = [];
  for (const f of telas) {
    for (const chamada of pisoDeOutraSala(readFileSync(f, 'utf8'))) cegas.push(`${f}: ${chamada}`);
  }

  assert.deepEqual(
    cegas,
    [],
    `estas telas de produção leem o saldo da empresa:\n  ${cegas.join('\n  ')}\n` +
      'O piso que o livro-razão confere é o da sala em que o tacho roda, com razão escrita. ' +
      'Ler o total aqui libera um botão que a escrita vai recusar — e a Lei 5 diz que o erro ' +
      'impede, não reclama.',
  );
});

test('the production floor guard bites the real scar, and leaves the fix alone', () => {
  const comProducao = (corpo: string) => `await recordProduction(LOCAL_COMPANY_ID, {});\n${corpo}`;

  assert.deepEqual(
    pisoDeOutraSala(comProducao('listItems(LOCAL_COMPANY_ID),')),
    ['listItems(LOCAL_COMPANY_ID)'],
    'a cicatriz tem que reprovar',
  );
  assert.deepEqual(
    pisoDeOutraSala(
      comProducao('listItems(LOCAL_COMPANY_ID, undefined, false, defaultLocationId(LOCAL_COMPANY_ID)),'),
    ),
    [],
    'o conserto passa',
  );
  // E a régua não fala com quem não produz: a lista do almoxarifado lê a empresa
  // inteira de propósito, e está certa.
  assert.deepEqual(pisoDeOutraSala('listItems(LOCAL_COMPANY_ID),'), []);
});
