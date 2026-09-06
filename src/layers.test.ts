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

/**
 * Nenhum por cento montado à mão.
 *
 * **A cicatriz, e ela é de conserto pela metade.** `formatPercent` existe desde o dia
 * em que alguém notou que a capa anunciava "9.0%" para uma fábrica brasileira — o
 * ponto decimal do JavaScript no lugar da vírgula de quem lê. O docblock dela diz
 * *"existia em três lugares como `(x * 100).toFixed(1)`"*, no passado. E três lugares
 * continuavam assim: a tela do insumo (duas vezes), a tela da compra, e o assistente
 * — este último com `.replace('.', ',')`, que acerta em português e erra no espanhol
 * do México, onde o separador decimal É o ponto.
 *
 * O ajudante foi escrito e os chamadores não foram trocados. É a forma de defeito
 * mais barata de produzir e a mais difícil de notar: o repositório PARECE consertado,
 * porque a função certa existe e tem chamadores — só não todos.
 *
 * A régua é a multiplicação por cem seguida de `toFixed`, que é a assinatura de
 * "porcentagem à mão". `toFixed` sozinho é legítimo: valor inicial de campo, taxa de
 * quatro casas, contagem de tachos.
 */
export function porCentoNaMao(texto: string): string[] {
  // Linha por linha, e a linha tem de trazer o `%` junto.
  //
  // Sem isso a régua acusa dois inocentes: o próprio docblock de `formatPercent`,
  // que CITA o padrão em prosa, e a tela da receita, que arredonda para duas casas
  // e entrega o número ao `formatTyped` — que sabe o idioma. O que faz do trecho um
  // defeito não é a multiplicação: é a porcentagem SAINDO como texto ali mesmo.
  return texto
    .split('\n')
    .filter((linha) => /\*\s*100\s*\)?\s*\.toFixed\(/.test(linha) && linha.includes('%'))
    .map((linha) => linha.trim().slice(0, 80));
}

test('no screen builds a percentage by hand', () => {
  const fontes = [...sourcesUnder('app'), ...sourcesUnder('src')];
  assert.ok(fontes.length > 20, 'a varredura de fontes veio vazia — a comparação seria de graça');

  const naMao: string[] = [];
  for (const f of fontes) {
    for (const achado of porCentoNaMao(readFileSync(f, 'utf8'))) naMao.push(`${f}: ${achado}`);
  }

  assert.deepEqual(
    naMao,
    [],
    `estes lugares montam porcentagem à mão:\n  ${naMao.join('\n  ')}\n` +
      '`formatPercent` existe e sabe o idioma. Ponto decimal do JavaScript numa tela ' +
      'brasileira é "9.0%" onde se lê "9,0%", e trocar por vírgula à mão erra no ' +
      'espanhol do México, onde o separador é o ponto.',
  );
});

test('the percentage guard bites the real scar, and leaves honest toFixed alone', () => {
  assert.equal(porCentoNaMao('`${(Math.abs(change) * 100).toFixed(1)}%`').length, 1);
  assert.equal(
    porCentoNaMao("`${(cost.lossFraction * 100).toFixed(1).replace('.', ',')}%`").length,
    1,
    'a cicatriz do assistente também',
  );

  // E os três inocentes, cada um por um motivo diferente.
  assert.deepEqual(porCentoNaMao('rate: parsed.unitRate.toFixed(4),'), [], 'taxa não é porcentagem');
  assert.deepEqual(porCentoNaMao('`${batches.toFixed(2)} (pelo que saiu)`'), [], 'tacho não é porcentagem');
  assert.deepEqual(
    porCentoNaMao('lossPercent: formatTyped(Number((stored.lossFraction * 100).toFixed(2)), locale.formatting),'),
    [],
    'valor de campo entregue a um formatador que sabe o idioma',
  );
  assert.deepEqual(
    porCentoNaMao(' * Existia em três lugares como `(x * 100).toFixed(1)`, que é o ponto decimal'),
    [],
    'prosa que cita o padrão não é o padrão',
  );
});


test('every line the ledger gets says who was holding the phone', () => {
  // A coluna existiu por semanas sem escritor — `movements.operator_id` entrou na
  // 0014, atravessava a sincronia, e nenhum dos SETE `INSERT INTO movements` a
  // preenchia. `app/(tabs)/more.tsx` registrava a lacuna com todas as letras.
  //
  // Agora todos preenchem, e este guarda existe porque o oitavo é o problema:
  // quem acrescentar um tipo de movimento amanhã copia um `INSERT` vizinho, e o
  // que ele copiar decide se a linha nasce sem operador para sempre. Livro-razão
  // não se corrige por UPDATE — se nascer sem, nasceu sem.
  const fonte = readFileSync(join(process.cwd(), 'src/data/repository.ts'), 'utf8');

  const inserts = fonte.split('INSERT INTO movements').slice(1);
  assert.ok(inserts.length >= 7, `o arquivo tem ${inserts.length} inserts de movimento`);

  const semOperador = inserts
    .map((trecho, i) => ({ i, colunas: trecho.slice(0, trecho.indexOf('VALUES')) }))
    .filter(({ colunas }) => !colunas.includes('operator_id'))
    .map(({ i }) => `o ${i + 1}º INSERT INTO movements`);

  assert.deepEqual(
    semOperador,
    [],
    `${semOperador.join(' · ')} não grava \`operator_id\`. A linha nasce anônima e o ` +
      'razão é append-only: não há UPDATE que conserte depois. Acrescente a coluna e ' +
      '`await currentOperatorId()` no fim dos parâmetros, como os vizinhos.',
  );
});


/**
 * As funções do domínio que nenhum código de produção chama — e por quê.
 *
 * O portão P1 deste projeto pergunta *quem chama isto no mesmo commit*, e a
 * doença que ele existe para pegar já foi documentada quatro vezes:
 * `assistant_phrase` com índice e nenhum escritor, `Draft.kind` sem leitor,
 * `balanceAt` e `daysOfCover` chamados só por teste. O dicionário ganhou guarda
 * para isso (`src/dictionary.test.ts`); o domínio não tinha, e a medição de 6 de
 * setembro achou **dez** funções nessa situação.
 *
 * Quatro saíram no mesmo dia, porque o servidor passou a fazer o que elas faziam:
 * `foldCostEvents` (um `reduce` de uma linha), `purchaseUnitCost` e `priceMove`
 * (a comparação entre as duas últimas compras, que `item_cost_history` e
 * `recentCostChanges` respondem em SQL). Uma ganhou chamador: `isValidHierarchy`
 * passou a ser conferida em `saveItem`, e com isso hierarquia torta deixa de
 * entrar em silêncio.
 *
 * As que ficam estão abaixo, cada uma com a razão. **"Ainda não tem tela" é razão
 * válida quando a regra existe e a tela é escopo escrito** — e é o que separa
 * fronteira registrada de código morto com desculpa.
 */
const DOMINIO_SEM_CHAMADOR: Record<string, string> = {
  needsHumanYes:
    'o piso de atos que sempre pedem um humano é promessa feita ANTES das funcionalidades existirem — o docblock diz isso por extenso, e quem construir preço ou lançamento financeiro herda a regra em vez de decidir de novo',
  observedLeadTimeDays:
    'compras inteligentes, F4 — precisa do prazo observado de cada fornecedor, que só existe depois de meses de nota. Cortada do mês por decisão do dono',
  reorderPoint:
    'mesma família: o ponto de recompra usa o prazo observado, e sem ele é adivinhação com cara de matemática',
  ratesBefore:
    'o custo de hoje contra o de ANTES de uma sequência de movimentos. O SQL (`recentCostChanges`) mostra a última mudança por item, que é outra pergunta — e a regra daqui é a que impede uma alta de 9% em dois passos aparecer como 2%',
  daysUntilExpiry:
    'a tela que trata "venceu ontem" diferente de "vence em três dias" não existe: hoje `expiringSoon` filtra por data e não conta dias',
  toDecimal:
    'primitiva da fundação do dinheiro, par de `fromDecimal`. Existe para ninguém dividir por 100 na mão, que é metade do erro que a capa deste projeto proíbe',
  multiplyCents:
    'a outra metade: existe para ninguém escrever `Math.round(x * f)` inline. Só o valor final arredonda, uma vez, e a primitiva certa presente é o que impede a errada de nascer',
};

test('every domain function has a caller in production, or a written reason', () => {
  const dominio = readdirSync(join(process.cwd(), 'src/domain'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join('src/domain', f));

  const producao = [...sourcesUnder('src'), ...sourcesUnder('app')].filter(
    (f) => !f.endsWith('.test.ts'),
  );
  const codigoDeProducao = producao.map((f) => readFileSync(f, 'utf8'));

  const orfas: string[] = [];
  const registroVelho: string[] = [];

  for (const arquivo of dominio) {
    const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8');
    for (const [, nome] of fonte.matchAll(/^export (?:async )?function (\w+)/gm)) {
      const usos = producao.filter(
        (f, i) => f !== arquivo && new RegExp(`\\b${nome}\\b`).test(codigoDeProducao[i]),
      );
      // Chamada de dentro do próprio arquivo também é chamada: `qrModules` é viva
      // porque `qrPath` a usa, e `qrPath` está numa tela.
      const daCasa = (fonte.match(new RegExp(`\\b${nome}\\b`, 'g')) ?? []).length > 1;

      if (usos.length === 0 && !daCasa) {
        if (!DOMINIO_SEM_CHAMADOR[nome]) orfas.push(`${arquivo}: ${nome}`);
      } else if (DOMINIO_SEM_CHAMADOR[nome]) {
        registroVelho.push(nome);
      }
    }
  }

  assert.deepEqual(
    orfas,
    [],
    `estas funções do domínio nenhum código de produção chama: ${orfas.join(' · ')}. ` +
      'Traga o chamador no mesmo commit, apague, ou registre a fronteira com a razão — ' +
      'que é o portão P1 deste projeto, e a doença que ele pega já apareceu quatro vezes.',
  );
  assert.deepEqual(
    registroVelho,
    [],
    `${registroVelho.join(' · ')} ganhou chamador e continua na lista de fronteiras. ` +
      'Tire a linha: registro que virou mentira é pior que registro nenhum.',
  );
});

/**
 * As leituras SEM portão são do livro-razão, e tela nenhuma as chama.
 *
 * Existem duas — `averageRatesForLedger` e `listProductsForLedger` — e elas são
 * públicas porque a semeadura e um script de verificação moram noutros arquivos.
 * O sufixo diz para que servem, mas nome não impede nada: os docblocks das duas
 * afirmavam, com estas palavras, que este guarda já existia, e ele não existia.
 * Docblock que promete uma rede que não está lá é pior que docblock nenhum — foi a
 * refutação desta mudança que apontou, e é o padrão que o `CLAUDE.md` nomeia:
 * regra escrita como feita não impede coisa alguma.
 *
 * Por que a rede é load-bearing: o portão do dinheiro vale por um passo só, e a
 * porta dos fundos dele é uma tela digitar o nome comprido. Congelar custo e VER
 * custo são perguntas diferentes; só a segunda tem portão, e só a camada de dados
 * (mais os scripts, que não são aplicativo) faz a primeira.
 */
const SEM_PORTAO = /\b(averageRatesForLedger|listProductsForLedger)\b/;

/** Onde o razão é escrito. Fora daqui, dinheiro se lê pelo caminho com portão. */
function podeLerSemPortao(path: string): boolean {
  return path.startsWith('src/data/') || path.startsWith('scripts/');
}

test('only the ledger reads money without the gate', () => {
  const culpados: string[] = [];
  for (const layer of ['app', ...readdirSync('src')
    .filter((entry) => statSync(join('src', entry)).isDirectory())
    .map((entry) => join('src', entry))]) {
    for (const file of sourcesUnder(layer)) {
      if (podeLerSemPortao(file)) continue;
      const linhas = code(readFileSync(file, 'utf8')).split('\n');
      linhas.forEach((linha, i) => {
        if (SEM_PORTAO.test(linha)) culpados.push(`${file}:${i + 1}`);
      });
    }
  }

  assert.deepEqual(
    culpados,
    [],
    `estes arquivos leem dinheiro pelo caminho SEM portão:\n  ${culpados.join('\n  ')}\n` +
      'Fora de src/data/ e scripts/, custo se lê por `itemCosts`, `listItems` ou ' +
      '`listProducts` — que perguntam antes de consultar. O caminho sem portão existe ' +
      'para CONGELAR taxa no livro-razão, e livro-razão não se corrige: se estorna.',
  );
});

test('the ledger-read guard bites a screen, and leaves the data layer alone', () => {
  // Positivo: a chamada de verdade, dentro da camada de dados, passa.
  assert.ok(
    podeLerSemPortao('src/data/simulate.ts'),
    'a semeadura escreve razão e tem de poder ler sem portão',
  );
  assert.ok(
    podeLerSemPortao('scripts/device-session.ts'),
    'o script que compara o aparelho com o Postgres compara verdade de razão',
  );
  // Negativo: a mesma linha numa tela é recusada.
  assert.ok(!podeLerSemPortao('app/inputs/index.tsx'), 'tela nenhuma lê sem portão');
  assert.ok(!podeLerSemPortao('src/home/Mosaic.tsx'), 'a capa é tela');
  assert.ok(!podeLerSemPortao('src/assistant/skills.ts'), 'o assistente responde por tela');
  assert.ok(
    SEM_PORTAO.test('const c = await averageRatesForLedger(companyId);'),
    'o padrão pega a chamada que importa',
  );
  assert.ok(
    !SEM_PORTAO.test('const c = await itemCosts(companyId);'),
    'e deixa em paz o caminho com portão',
  );
});

/**
 * A fila lê a LINHA, nunca uma função de leitura — e este guarda fecha um buraco
 * que o portão do dinheiro acabou de abrir.
 *
 * O `serialize.ts` já diz a regra na primeira página: *"Everything is explicit.
 * There is no 'send whatever columns the row has', because that is how a device
 * column added next month reaches the server as a silent failure instead of a
 * compile error."* A lista `take` é fechada, e quem monta a linha lê o registro
 * cru.
 *
 * O buraco: o guarda de cima proíbe `src/sync/` de usar as leituras SEM portão, e
 * `src/sync/` não é `src/data/`. Quem for escrever o transporte amanhã, obedecendo
 * àquele guarda, seria empurrado para a leitura COM portão — e aí o celular de
 * quem não vê custo subiria a fila com `unit_cost_rate` nulo, apagando dinheiro do
 * que ATRAVESSA em vez de do que se mostra. Seria a versão da corrupção do razão
 * que nenhum teste de tela pega, porque o número certo está gravado no aparelho: o
 * errado é o que viaja.
 *
 * Então a regra é mais estreita que "sem portão": a travessia não chama leitura
 * nenhuma do repositório. Ela lê a linha que o `outbox` nomeia.
 */
test('the crossing reads the stored row, never a repository read', () => {
  const culpados = sourcesUnder('src/sync').filter((file) =>
    /from '@\/data\/repository'/.test(readFileSync(file, 'utf8')),
  );

  assert.deepEqual(
    culpados,
    [],
    `estes arquivos da travessia leem pelo repositório:\n  ${culpados.join('\n  ')}\n` +
      'A fila envia o que está GRAVADO. Toda leitura do repositório filtra, arredonda ou ' +
      'esconde alguma coisa para uma tela — inclusive o portão do dinheiro —, e o que ' +
      'atravessa não pode depender de quem estava com o aparelho na hora de sincronizar.',
  );
});

test('the crossing guard bites the real risk, and leaves the tests alone', () => {
  // `sourcesUnder` já descarta `*.test.ts`, e é isso que permite ao teste da
  // sincronia gravar com o repositório para depois olhar a fila — ele imita o
  // aplicativo, não faz parte da travessia.
  const arquivos = sourcesUnder('src/sync');
  assert.ok(arquivos.length >= 2, 'a travessia tem engine e serialize');
  assert.ok(
    !arquivos.some((f) => f.endsWith('.test.ts')),
    'teste de sincronia pode chamar o repositório: ele é o aplicativo imitado, não a travessia',
  );
  // E o padrão pega o que tem de pegar.
  assert.ok(/from '@\/data\/repository'/.test("import { listItems } from '@/data/repository';"));
  assert.ok(!/from '@\/data\/repository'/.test("import type { OutboxEntry } from '@/data/outbox';"));
});

/**
 * O cadastro oferece as espécies de lugar que o razão conhece, menos as que têm
 * motivo escrito para ficar de fora.
 *
 * O defeito que este guarda existe para impedir foi achado por uma FOTO, e é da
 * espécie que nenhum teste vê: `location_kind` tem `customer` desde a `0001`, o
 * dicionário tem a palavra nos três idiomas, a tela desenha o glifo e o rótulo — e o
 * formulário oferecia só lugares nossos. A fábrica de exemplo criava um cliente e o
 * dono via na tela uma coisa que o aplicativo dele não sabia fazer.
 *
 * A lista de fora é registro com razão, e não uma lista de conveniência: quem tirar
 * uma espécie do formulário tem de escrever por quê, aqui, e quem acrescentar uma
 * espécie ao servidor descobre no vermelho que a tela não a oferece.
 */
const ESPECIE_FORA_DO_CADASTRO: Record<string, string> = {
  factory:
    'nasce sozinha com a empresa (`ensureLocation`), com o id da própria empresa — não há o que cadastrar',
  vehicle:
    'é a viagem com linha do tempo, adiada por decisão do dono em 6 de setembro: a carga é UM evento, e o veículo só passa a existir quando houver entregador que não é quem carregou',
};

test('the place form offers every kind the ledger knows, or says why not', () => {
  const enums = readFileSync('supabase/migrations/0001_foundation.sql', 'utf8');
  const linha = enums.match(/create type location_kind as enum \(([^)]*)\)/);
  assert.ok(linha, 'a migração da fundação declara location_kind');
  const doServidor = [...linha[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(doServidor.length >= 5, `o enum tem ${doServidor.length} espécies`);

  const tela = readFileSync('app/places.tsx', 'utf8');
  const oferta = tela.match(/const KINDS = \[([^\]]*)\]/);
  assert.ok(oferta, 'o formulário declara as espécies numa lista só');
  const oferecidas = new Set([...oferta[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

  const semExplicacao = doServidor.filter(
    (k) => !oferecidas.has(k) && !(k in ESPECIE_FORA_DO_CADASTRO),
  );
  assert.deepEqual(
    semExplicacao,
    [],
    `o servidor conhece estas espécies e o cadastro não as oferece: ${semExplicacao.join(', ')}.\n` +
      'Ou entram no formulário, ou entram em ESPECIE_FORA_DO_CADASTRO com o motivo — ' +
      'espécie que existe no razão e não existe na tela é o dono vendo dado que ele não consegue criar.',
  );

  // E a outra direção, que é a que envelhece calada: registro que virou mentira.
  const registroVelho = Object.keys(ESPECIE_FORA_DO_CADASTRO).filter((k) => oferecidas.has(k));
  assert.deepEqual(
    registroVelho,
    [],
    `estas espécies estão registradas como fora e o formulário já as oferece: ${registroVelho.join(', ')}`,
  );
});
