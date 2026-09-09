import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CARGO_PLACE_KINDS, INTERNAL_PLACE_KINDS, QUEM_ESCREVE } from './domain/ledger';
import { APENAS_INSERE, sendableTables } from './sync/serialize';

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

/**
 * Os arquivos de teste, que o `sourcesUnder` descarta de propósito.
 *
 * Duas varreduras diferentes porque as perguntas são diferentes: quase toda
 * regra de camada é sobre o que EMBARCA, e teste não embarca. A do dinheiro sem
 * portão é sobre quem CHAMA, e teste chama.
 */
function testesUnder(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) testesUnder(path, into);
    else if (/\.test\.tsx?$/.test(entry)) into.push(path);
  }
  return into;
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
    if (/\w\(|EMPRESA_SEMENTE|companyId/.test(valor)) achados.push(valor);
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
      `await recordCount(EMPRESA_SEMENTE, { locationId: defaultLocationId(EMPRESA_SEMENTE), itemId: item.id, countedBaseUnits: 1 });`,
    ),
    ['defaultLocationId(EMPRESA_SEMENTE)'],
    'a cicatriz tem que reprovar',
  );

  // E a outra forma de dizer a mesma coisa.
  assert.deepEqual(
    contagemCega(`recordCount(EMPRESA_SEMENTE, {\n  locationId: EMPRESA_SEMENTE,\n});`),
    ['EMPRESA_SEMENTE'],
  );

  // O conserto passa: o local é um valor que a tela calculou.
  assert.deepEqual(
    contagemCega(
      `await recordCount(EMPRESA_SEMENTE, {\n      locationId: contarEm,\n      itemId: item.id,\n      countedBaseUnits: Math.round(counted),\n    });`,
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
 *
 * **São DUAS réguas desde o Espelho da Loja, e a guarda passou a conhecer as duas.**
 * `INTERNAL_PLACE_KINDS` é de onde a carga sai; `CARGO_PLACE_KINDS` é quem a recebe,
 * e o Espelho filtra por ela para perguntar quanto uma loja devolve do que recebe. O
 * que a guarda continua recusando é o que ela sempre recusou: uma lista escrita à mão
 * no SQL que não é nenhuma das duas — a quarta grafia da regra.
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

  const REGUAS = [
    { nome: 'INTERNAL_PLACE_KINDS', lista: [...INTERNAL_PLACE_KINDS].sort() },
    { nome: 'CARGO_PLACE_KINDS', lista: [...CARGO_PLACE_KINDS].sort() },
  ];

  for (const lista of noSql) {
    assert.ok(
      REGUAS.some((r) => r.lista.length === lista.length && r.lista.every((k, i) => k === lista[i])),
      `o SQL escreve \`l.kind IN (${lista.join(', ')})\`, que não é nenhuma das duas réguas do domínio (${REGUAS.map((r) => r.nome).join(', ')})`,
    );
  }
});

test('the rooms guard still bites a list that is neither ruler', () => {
  // A guarda ficou mais larga ao aprender a segunda régua, e larga demais não
  // guarda nada. Isto fixa o que ela continua recusando: uma lista à mão.
  const inventada = ['factory', 'own_store'].sort();
  const REGUAS = [[...INTERNAL_PLACE_KINDS].sort(), [...CARGO_PLACE_KINDS].sort()];
  assert.ok(
    !REGUAS.some((r) => r.length === inventada.length && r.every((k, i) => k === inventada[i])),
    'uma lista que mistura sala nossa com destino tem que continuar reprovando',
  );
});

/**
 * O escopo que a ESCRITA confere, lido de `repository.ts` em vez de escrito aqui.
 *
 * Isto existe por causa da regra desta casa que já se pagou duas vezes: *uma guarda
 * que compara duas coisas escritas pela mesma mão não guarda nada*. A versão
 * anterior conferia a ARIDADE de `listItems` — "tem quarto argumento?" — e a tela
 * consertada tinha. Em 8 de setembro o quarto argumento passou a ser
 * `{ unidade: ... }` enquanto a escrita continuava conferindo UMA sala, e a guarda
 * não viu nada porque ela nunca soube o que a escrita confere. Aridade não é escopo.
 *
 * Agora a resposta vem do corpo de `recordProduction`, entre a assinatura dela e o
 * `NotEnoughStockError` que ela levanta — o trecho onde o piso é conferido, e o
 * único lugar onde essa verdade mora.
 */
export type EscopoDaEscrita = 'sala' | 'unidade' | 'empresa' | 'configurado';

export function escopoQueAEscritaConfere(fonte: string): EscopoDaEscrita | null {
  const inicio = fonte.indexOf('export async function recordProduction');
  if (inicio < 0) return null;
  const fim = fonte.indexOf('NotEnoughStockError(', inicio);
  if (fim < 0) return null;
  const corpo = fonte.slice(inicio, fim);
  // **`configurado` vem primeiro, e a ordem é a regra.** No dia em que a empresa passou
  // a escolher de onde a corrida consome, a palavra literal saiu do corpo da escrita — e
  // a versão anterior, que procurava `{ unidade`, caiu no ramo da igualdade crua e
  // respondeu `empresa`. Ela então acusou a tela CONSERTADA, que é o pior jeito de uma
  // guarda falhar: ela reprova quem obedeceu. Quando a resposta é dado, o que as duas
  // pontas têm de combinar não é a palavra — é a FONTE.
  if (/consumoDaProducao\(/.test(corpo)) return 'configurado';
  const recorte = corpo.match(/noEscopo\(\s*'m?\.?location_id'\s*,\s*\{\s*(sala|unidade)\b/);
  if (recorte) return recorte[1] as 'sala' | 'unidade';
  // Sem recorte nomeado sobram os dois extremos, e a igualdade crua distingue:
  // `location_id = ?` é uma sala, e a ausência dela é a empresa inteira.
  return /location_id\s*=\s*\?/.test(corpo) ? 'sala' : 'empresa';
}

/**
 * A tela que produz lê o piso que a ESCRITA vai conferir — o mesmo, não outro.
 *
 * **A primeira cicatriz.** `recordProduction` confere um piso e tem a razão escrita
 * ao lado: a guarda somava o saldo de todos os lugares e escrevia o consumo num,
 * então bastava mandar um saco de açúcar para a loja para autorizar um tacho com o
 * açúcar que está a dez quilômetros. A tela, porém, continuou lendo
 * `listItems(EMPRESA_SEMENTE)` — o total da empresa — para decidir se libera o
 * botão. Com a polpa na câmara fria, que é onde polpa mora numa fábrica de picolés,
 * a tela dizia que havia polpa, liberava o botão, e **toda** corrida batia no piso
 * do livro-razão com um erro de programador em inglês.
 *
 * **A segunda, que esta guarda deixou passar.** Em 8 de setembro a tela passou a ler
 * `{ unidade: unidadeDaqui() }` e a escrita continuou conferindo UMA sala. O mesmo
 * defeito, uma casa mais estreito, e desta vez PIOR: a tela já dizia em que sala a
 * polpa estava, ou seja, sabia onde estava e não deixava rodar. A guarda contou
 * quatro argumentos, achou quatro, e passou.
 *
 * É a mesma forma do defeito da contagem, e por isso a mesma forma de guarda: o
 * defeito não está em função nenhuma, está em duas leituras diferentes da mesma
 * pergunta — e o que a guarda tem de comparar é o ESCOPO das duas, nunca a forma
 * de uma delas.
 */
export function pisoDeOutraSala(texto: string, escopoDaEscrita: EscopoDaEscrita): string[] {
  if (!/recordProduction\(/.test(texto)) return [];
  // Com a resposta virando dado, o acordo deixa de ser sobre a PALAVRA e passa a ser
  // sobre a FONTE: a tela tem de perguntar à mesma função que a escrita pergunta.
  // Comparar palavra aqui seria exigir que a tela chumbasse um dos dois mundos, que é o
  // oposto do que a configuração existe para permitir.
  if (escopoDaEscrita === 'configurado') {
    // **Perguntar não é usar, e a mutação provou que eu estava conferindo só a
    // pergunta.** A primeira versão exigia só a chamada a `consumoDaProducao(`, e um
    // defeito plantado trocou o ARGUMENTO de `listItems` por `undefined` deixando a
    // chamada no lugar: a tela voltava a ler a empresa inteira, o botão liberava o que
    // a escrita recusa, e as 569 asserções continuaram verdes. Guarda que confere o
    // gesto e não o efeito é a irmã da que conferia a aridade em vez do escopo — o
    // mesmo defeito, duas semanas de código depois.
    const achados: string[] = [];
    if (!/consumoDaProducao\(/.test(texto)) {
      achados.push('a escrita pergunta `consumoDaProducao()` e esta tela decide sozinha');
    }
    for (const m of texto.matchAll(/listItems\(/g)) {
      const args = argumentos(texto, (m.index ?? 0) + 'listItems('.length);
      if (args === null) continue;
      // O quarto argumento tem de CARREGAR a resposta. `undefined` ali é a empresa
      // inteira com a pergunta feita e jogada fora.
      if (args.length < 4 || !/\b(sala|unidade)\b/.test(args[3])) {
        achados.push(`listItems(${args.join(', ')})`);
      }
    }
    return achados;
  }
  const achados: string[] = [];
  for (const m of texto.matchAll(/listItems\(/g)) {
    const args = argumentos(texto, (m.index ?? 0) + 'listItems('.length);
    if (args === null) continue;
    const chamada = `listItems(${args.join(', ')})`;
    // companyId, tipo, inativos, escopo — sem o quarto, o saldo é o da empresa.
    if (args.length < 4) {
      if (escopoDaEscrita !== 'empresa') achados.push(chamada);
      continue;
    }
    const diz = args[3].match(/\b(sala|unidade)\s*:/);
    // Escopo que não se lê na chamada é escopo que ninguém confere. A tela que
    // produz é uma, e ela pode dizer inteiro o que está perguntando.
    if (!diz || diz[1] !== escopoDaEscrita) achados.push(chamada);
  }
  return achados;
}

/**
 * Os argumentos de uma chamada, contando parêntese em vez de parar no primeiro.
 *
 * **A cicatriz é do mesmo dia em que a empresa virou pergunta.** A versão anterior
 * era `/listItems\(([^)]*)\)/` — e no dia em que o argumento deixou de ser uma
 * constante e passou a ser `empresaDaqui()`, `[^)]*` casou `empresaDaqui(` e o `)`
 * da PRÓPRIA pergunta fechou a conta: um argumento onde havia quatro, e a guarda
 * acusou a tela consertada. Detector que conta separador sem contar aninhamento
 * acusa quem ele existe para proteger — é a irmã da contagem de chaves que o
 * `confirm.test.ts` já precisou fazer.
 */
function argumentos(texto: string, comeco: number): string[] | null {
  let nivel = 1;
  let atual = '';
  const args: string[] = [];
  for (let i = comeco; i < texto.length; i++) {
    const c = texto[i];
    if (c === '(' || c === '[' || c === '{') nivel += 1;
    else if (c === ')' || c === ']' || c === '}') {
      nivel -= 1;
      if (nivel === 0) {
        if (atual.trim()) args.push(atual.trim());
        return args;
      }
    }
    if (c === ',' && nivel === 1) {
      if (atual.trim()) args.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  return null;
}

test('a screen that produces reads the same floor the write will check', () => {
  const telas = sourcesUnder('app');
  assert.ok(telas.length > 10, 'a varredura de telas veio vazia — a comparação seria de graça');

  // A segunda fonte, e ela não passou por esta mão: o escopo sai do corpo de
  // `recordProduction`. Se alguém estreitar ou alargar o piso lá, este teste
  // passa a exigir a mesma coisa das telas no mesmo commit.
  const escopo = escopoQueAEscritaConfere(readFileSync('src/data/repository.ts', 'utf8'));
  assert.ok(escopo, 'não achei o piso dentro de recordProduction — a guarda ficaria de graça');

  const cegas: string[] = [];
  for (const f of telas) {
    for (const chamada of pisoDeOutraSala(readFileSync(f, 'utf8'), escopo)) cegas.push(`${f}: ${chamada}`);
  }

  assert.deepEqual(
    cegas,
    [],
    `estas telas de produção leem um piso que não é o da escrita (que confere \`${escopo}\`):\n  ${cegas.join('\n  ')}\n` +
      'Ler um escopo mais largo aqui libera um botão que a escrita vai recusar, e ler um mais ' +
      'estreito esconde uma corrida que rodaria — a Lei 5 diz que o erro impede, não reclama.',
  );
});

/**
 * O aviso de validade da capa nunca pergunta por uma SALA.
 *
 * **Ele perguntava pela empresa, e passou a perguntar pela UNIDADE em 8 de
 * setembro** — a granularidade que resolve a contradição que estava escrita em dois
 * lugares do repositório. O docblock de `expiringSoon` dizia que somar a empresa
 * avisa sobre lote que já foi ENTREGUE (*"o alerta que ensina a ignorar"*); o
 * comentário da capa dizia que filtrar por sala EMUDECE o aviso quando o picolé vai
 * para a câmara fria. Os dois certos sobre a falha do outro. A câmara fria está
 * dentro da unidade; a loja do cliente não.
 *
 * O que esta guarda protege continua sendo o mesmo e é o que a mutação achou: **a
 * SALA**. Unidade passa, sala reprova.
 *
 * **A mutação que sobreviveu à suíte inteira.** Trocar
 * `expiringSoon(empresa, trintaDias, 5)` por
 * `expiringSoon(empresa, trintaDias, 5, empresa)` — acrescentando o lugar padrão
 * como filtro — passou por 487 testes, 51 checagens de navegador e 19 garantias de
 * banco sem que nada reclamasse. E o dano é o pior tipo: **silêncio**. O picolé
 * pronto sai do almoxarifado no mesmo dia em que nasce; ele vence na câmara fria
 * ou na loja, longe dos olhos. Com o filtro, o cartão emudece exatamente onde a
 * validade importa, e um alerta que nunca toca é indistinguível de "está tudo
 * bem".
 *
 * O repositório TEM teste de sala, e é ele que engana: prova que filtrar funciona
 * e não diz nada sobre quem deve filtrar. A pergunta da capa é *"o que vence do
 * que é meu"*; a pergunta da tela de uma sala é *"o que vence aqui"*. Duas
 * perguntas, e só a segunda leva lugar.
 */
export function validadeDeUmaSalaSo(texto: string): string[] {
  const achados: string[] = [];
  for (const m of texto.matchAll(/expiringSoon\(/g)) {
    const args = argumentos(texto, (m.index ?? 0) + 'expiringSoon('.length);
    if (args === null) continue;
    // empresa, data, quantos, escopo — o quarto é o recorte. `{ unidade }` é o que
    // a capa quer; qualquer outra coisa ali é sala, e sala emudece o aviso.
    const escopo = args[3];
    if (escopo !== undefined && !/\bunidade\s*:/.test(escopo)) {
      achados.push(`expiringSoon(${args.join(', ')})`);
    }
  }
  return achados;
}

test('the home expiry card never asks one room', () => {
  const capa = 'app/(tabs)/index.tsx';
  const fonte = readFileSync(capa, 'utf8');
  assert.match(fonte, /expiringSoon\(/, 'a capa tem de continuar perguntando validade');
  assert.deepEqual(
    validadeDeUmaSalaSo(fonte),
    [],
    `${capa} filtra a validade por um lugar. O picolé vence na câmara fria e na loja, ` +
      'longe dos olhos: com filtro de sala o cartão emudece justamente onde a validade ' +
      'importa, e alerta que nunca toca ensina a ignorar alerta.',
  );
});

test('the expiry guard bites the surviving mutation, and leaves the room screens alone', () => {
  // A mutação, letra por letra, como o `mutate` a escreve.
  assert.deepEqual(
    validadeDeUmaSalaSo('      expiringSoon(empresaDaqui(), trintaDias, 5, empresaDaqui()),'),
    ['expiringSoon(empresaDaqui(), trintaDias, 5, empresaDaqui())'],
    'a mutação que atravessou a suíte tem de reprovar aqui',
  );
  // E as duas formas legítimas passam: a da empresa, e a da unidade que a capa usa.
  assert.deepEqual(
    validadeDeUmaSalaSo('      expiringSoon(empresaDaqui(), trintaDias, 5),'),
    [],
    'a pergunta da empresa passa',
  );
  assert.deepEqual(
    validadeDeUmaSalaSo(
      '      expiringSoon(empresaDaqui(), trintaDias, 5, { unidade: unidadeDaqui() }),',
    ),
    [],
    'a pergunta da unidade é a da capa desde 8 de setembro, e ela não pode reprovar',
  );
  // E a sala escrita na forma nova continua reprovando — senão a guarda teria sido
  // afrouxada junto com o conserto, que é como guarda morre sem ninguém notar.
  assert.deepEqual(
    validadeDeUmaSalaSo('      expiringSoon(empresaDaqui(), trintaDias, 5, { sala: aberta }),'),
    ['expiringSoon(empresaDaqui(), trintaDias, 5, { sala: aberta })'],
    'a sala na forma nova é o mesmo defeito com outra roupa',
  );
  // A tela de UMA SALA continua livre para perguntar da sala dela: a guarda olha
  // a capa, não o arquivo que contém a palavra.
  const deSala = 'const aqui = await expiringSoon(co, ate, 5, sala);';
  assert.deepEqual(
    validadeDeUmaSalaSo(deSala),
    ['expiringSoon(co, ate, 5, sala)'],
    'a régua acha o filtro onde ele está — quem decide se ele é defeito é o teste, pelo arquivo',
  );
});

test('the production floor guard bites both scars, and leaves the fix alone', () => {
  const comProducao = (corpo: string) => `await recordProduction(EMPRESA_SEMENTE, {});\n${corpo}`;

  // Primeira cicatriz: nenhum escopo, o saldo é o da empresa.
  assert.deepEqual(
    pisoDeOutraSala(comProducao('listItems(EMPRESA_SEMENTE),'), 'unidade'),
    ['listItems(EMPRESA_SEMENTE)'],
    'a cicatriz da empresa tem que reprovar',
  );
  // Segunda cicatriz, a que a versão de aridade deixou passar: escopo LEGÍVEL,
  // quatro argumentos, e o escopo errado.
  assert.deepEqual(
    pisoDeOutraSala(comProducao('listItems(co, undefined, false, { unidade: unidadeDaqui() }),'), 'sala'),
    ['listItems(co, undefined, false, { unidade: unidadeDaqui() })'],
    'unidade na tela com sala na escrita é o defeito de 8 de setembro, e tem que reprovar',
  );
  // E o inverso, porque somar de menos é o mais silencioso dos dois: sala na tela
  // com unidade na escrita esconde um tacho que rodaria.
  assert.deepEqual(
    pisoDeOutraSala(comProducao('listItems(co, undefined, false, { sala: aqui }),'), 'unidade'),
    ['listItems(co, undefined, false, { sala: aqui })'],
    'sala na tela com unidade na escrita esconde estoque que existe',
  );
  // O conserto passa: os dois lados dizem a mesma palavra.
  assert.deepEqual(
    pisoDeOutraSala(comProducao('listItems(empresaDaqui(), undefined, false, { unidade: unidadeDaqui() }),'), 'unidade'),
    [],
    'o conserto passa',
  );
  // O caso que derrubou uma versão anterior: o argumento é uma PERGUNTA, e o
  // parêntese dela fechava a conta antes da vírgula.
  assert.deepEqual(
    pisoDeOutraSala(
      comProducao('listItems(empresaDaqui(), undefined, false, { unidade: unidadeDaqui() }),'),
      'unidade',
    ),
    [],
    'a tela consertada continua passando quando a empresa é lida em vez de constante',
  );
  // E a régua não fala com quem não produz: a lista do almoxarifado lê a empresa
  // inteira de propósito, e está certa.
  assert.deepEqual(pisoDeOutraSala('listItems(EMPRESA_SEMENTE),', 'unidade'), []);

  // O caso configurado: o acordo deixa de ser sobre a palavra e passa a ser sobre a
  // FONTE. Uma tela que decide sozinha reprova mesmo escrevendo a palavra "certa" —
  // porque no dia em que a empresa virar a chave ela continuaria mostrando o mundo
  // antigo, com o botão liberando o que a escrita vai recusar.
  assert.deepEqual(
    pisoDeOutraSala(comProducao('listItems(co, undefined, false, { unidade: unidadeDaqui() }),'), 'configurado'),
    ['a escrita pergunta `consumoDaProducao()` e esta tela decide sozinha'],
    'palavra chumbada não serve quando a resposta é configuração',
  );
  assert.deepEqual(
    pisoDeOutraSala(
      comProducao(
        'const de = await consumoDaProducao();\nlistItems(co, undefined, false, de === "sala" ? { sala: x } : { unidade: y }),',
      ),
      'configurado',
    ),
    [],
    'a tela que pergunta à mesma função passa',
  );

  // **E perguntar não basta: a resposta tem de chegar na consulta.** Este é o defeito
  // que a mutação achou vivo — a chamada a `consumoDaProducao()` fica no lugar e o
  // argumento de `listItems` vira `undefined`, então a tela lê a empresa inteira com a
  // pergunta feita e jogada fora. A guarda anterior passava.
  assert.deepEqual(
    pisoDeOutraSala(
      comProducao('const de = await consumoDaProducao();\nlistItems(co, undefined, false, undefined),'),
      'configurado',
    ),
    ['listItems(co, undefined, false, undefined)'],
    'perguntar e ignorar a resposta é ler a empresa inteira com um álibi',
  );
});

test('the derivation of the write scope reads the write, and says which of the three it is', () => {
  // Positivo e negativo do DETECTOR, não da regra: uma régua que responde a
  // mesma coisa para as três formas não distingue nada, e é assim que um número
  // inventado entra num documento.
  const comRecorte = (chave: string) =>
    `export async function recordProduction(a) {\n  const r = noEscopo('m.location_id', { ${chave}: x });\n  throw new NotEnoughStockError([]);\n}`;
  assert.equal(escopoQueAEscritaConfere(comRecorte('unidade')), 'unidade');
  assert.equal(escopoQueAEscritaConfere(comRecorte('sala')), 'sala');
  assert.equal(
    escopoQueAEscritaConfere(
      'export async function recordProduction(a) {\n  WHERE m.company_id = ? AND m.location_id = ?\n  throw new NotEnoughStockError([]);\n}',
    ),
    'sala',
    'igualdade crua é uma sala — é a forma exata do defeito de 8 de setembro',
  );
  assert.equal(
    escopoQueAEscritaConfere(
      'export async function recordProduction(a) {\n  WHERE m.company_id = ?\n  throw new NotEnoughStockError([]);\n}',
    ),
    'empresa',
    'sem lugar nenhum na condição, o piso é a empresa inteira',
  );

  // E a quarta resposta, que nasceu no dia em que a empresa passou a escolher: a
  // escrita pergunta a uma FUNÇÃO, e aí não há palavra literal para comparar. Ela vem
  // ANTES das outras três de propósito — a versão sem ela caía no ramo da igualdade
  // crua, respondia `empresa`, e acusava a tela consertada.
  assert.equal(
    escopoQueAEscritaConfere(
      "export async function recordProduction(a) {\n  const de = await consumoDaProducao();\n  const r = noEscopo('m.location_id', escopo);\n  throw new NotEnoughStockError([]);\n}",
    ),
    'configurado',
    'resposta que é dado não se compara por palavra',
  );
  // E ela não inventa resposta para um arquivo que não tem a função: nulo faz o
  // teste de cima falhar em voz alta em vez de comparar contra o vazio.
  assert.equal(escopoQueAEscritaConfere('export async function recordPurchase() {}'), null);
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
const SEM_CHAMADOR: Record<string, string> = {
  needsHumanYes:
    'o piso de atos que sempre pedem um humano é promessa feita ANTES das funcionalidades existirem — o docblock diz isso por extenso, e quem construir preço ou lançamento financeiro herda a regra em vez de decidir de novo',
  ratesBefore:
    'o custo de hoje contra o de ANTES de uma sequência de movimentos. O SQL (`recentCostChanges`) mostra a última mudança por item, que é outra pergunta — e a regra daqui é a que impede uma alta de 9% em dois passos aparecer como 2%',
  daysUntilExpiry:
    'a tela que trata "venceu ontem" diferente de "vence em três dias" não existe: hoje `expiringSoon` filtra por data e não conta dias',
  toDecimal:
    'primitiva da fundação do dinheiro, par de `fromDecimal`. Existe para ninguém dividir por 100 na mão, que é metade do erro que a capa deste projeto proíbe',
  multiplyCents:
    'a outra metade: existe para ninguém escrever `Math.round(x * f)` inline. Só o valor final arredonda, uma vez, e a primitiva certa presente é o que impede a errada de nascer',

  // ---- Fora do domínio, desde que a guarda passou a olhar o `src` inteiro ----
  /**
   * O gancho que troca a conexão do banco por uma de teste.
   *
   * Mesmo caso do `__setOpener`, e apareceu pelo mesmo motivo: quando a guarda
   * parou de ler comentário como chamada, ele deixou de ter "chamador". Três
   * arquivos de teste o usam; produção nenhuma, e é essa a intenção — o prefixo
   * `__` diz isso.
   */
  __setDb:
    'gancho de teste: troca a conexão do banco. Chamado só por *.test.ts, e o `__` diz que é assim',
  __setOpener:
    'gancho de teste, e o sublinhado duplo diz isso na assinatura: ele troca quem ABRE o banco, para a suíte rodar contra o SQLite do node em vez do do aparelho. Par de `__setDb`, que a suíte usa em todo arquivo de dado',
  // `drain` e `serialize` estiveram aqui por dias, com a razão certa: *"sem caminho
  // de escrita não há quem os chame, e inventar um chamador agora seria construir a
  // metade que não fecha"*. Em 8 de setembro a metade fechou — `src/sync/transporte.ts`
  // existe e Ajustes o chama —, então as duas linhas saíram. Quem tirou não foi
  // atenção: foi a outra metade desta guarda, que reprova registro que virou mentira.
};

test('every exported function has a caller in production, or a written reason', () => {
  // Todo o `src`, e não só o domínio.
  //
  // A guarda nasceu olhando `src/domain` porque foi ali que a medição de 6 de
  // setembro achou dez órfãs. Uma varredura mais larga no mesmo dia achou sete
  // FORA dele — um ponto de extensão do assistente que nada estende, três ícones
  // substituídos pelos glifos, dois formatadores e um mapa de cores. A doença não
  // conhecia a fronteira da pasta; a guarda também não conhece mais.
  const dominio = sourcesUnder('src').filter((f) => !/\.test\.tsx?$/.test(f));

  const producao = [...sourcesUnder('src'), ...sourcesUnder('app')].filter(
    (f) => !/\.test\.tsx?$/.test(f),
  );
  /**
   * Sem comentário — e esta linha é a cicatriz de 7 de setembro.
   *
   * A busca era sobre o arquivo cru, então **prosa contava como chamada**. Um
   * docblock em `src/data/erase.ts` que dizia *"o `serialize` ficava assim"* deu
   * chamador ao `serialize`, e a guarda passou a acusar o registro de fronteira
   * dele de estar velho — quando o motor de sincronia continua exatamente sem
   * chamador, esperando o transporte.
   *
   * É a família que este repositório já nomeou: régua que lê comentário como
   * código. A pior forma dela é esta, virada para dentro — a guarda que reclama
   * de uma verdade porque alguém a EXPLICOU por escrito, o que ensina a não
   * escrever a explicação.
   *
   * O `code()` deste mesmo arquivo já existia para o guarda do SQL. Faltava aqui.
   */
  const codigoDeProducao = producao.map((f) => code(readFileSync(f, 'utf8')));

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
      const daCasa = (code(fonte).match(new RegExp(`\\b${nome}\\b`, 'g')) ?? []).length > 1;

      if (usos.length === 0 && !daCasa) {
        if (!SEM_CHAMADOR[nome]) orfas.push(`${arquivo}: ${nome}`);
      } else if (SEM_CHAMADOR[nome]) {
        registroVelho.push(nome);
      }
    }
  }

  assert.deepEqual(
    orfas,
    [],
    `estas funções exportadas nenhum código de produção chama: ${orfas.join(' · ')}. ` +
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

/**
 * Os testes que leem sem portão, cada um com a razão escrita.
 *
 * **Buraco medido em 7 de setembro, e ele era do coletor.** `sourcesUnder`
 * descarta `*.test.ts` — o que está certo para quase tudo, porque um teste que
 * fala de SQL não é uma tela que faz SQL. Só que este guarda não é sobre falar:
 * é sobre CHAMAR, e o docblock dele prometia *"tela nenhuma as chama"* enquanto
 * o roadmap prometia mais ainda — *"recusa qualquer arquivo fora de `src/data/`
 * e `scripts/`"*. Com os testes fora do coletor, "qualquer arquivo" era metade
 * dos arquivos, e havia um chamador de verdade lá dentro.
 *
 * É a mesma família que este arquivo já registrou duas vezes: **o vizinho da
 * propriedade** — a guarda mede uma coisa parecida com a que promete, e passa
 * verde por não ter olhado.
 */
const TESTE_PODE_LER = new Map<string, string>([
  [
    join('src', 'notify', 'facts.test.ts'),
    'semeia um produto para exercitar o aviso, e a semeadura é escrita de razão: ' +
      'o portão aqui esconderia a taxa do próprio dado que o teste acabou de plantar',
  ],
]);

/** Onde o razão é escrito. Fora daqui, dinheiro se lê pelo caminho com portão. */
function podeLerSemPortao(path: string): boolean {
  return path.startsWith('src/data/') || path.startsWith('scripts/') || TESTE_PODE_LER.has(path);
}

test('only the ledger reads money without the gate', () => {
  const culpados: string[] = [];
  for (const layer of ['app', ...readdirSync('src')
    .filter((entry) => statSync(join('src', entry)).isDirectory())
    .map((entry) => join('src', entry))]) {
    for (const file of [...sourcesUnder(layer), ...testesUnder(layer)]) {
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

  // E o buraco do coletor, provado nos dois sentidos: um teste fora da camada de
  // dados É varrido agora, e o único que pode ler tem a razão escrita.
  assert.ok(
    testesUnder('src/notify').includes(join('src', 'notify', 'facts.test.ts')),
    'o coletor de testes tem de enxergar o arquivo que o guarda deixou passar por semanas',
  );
  assert.ok(!podeLerSemPortao(join('src', 'notify', 'alerts.test.ts')), 'teste não vira passe livre');
  for (const [arquivo, razao] of TESTE_PODE_LER) {
    assert.ok(razao.length > 40, `${arquivo} está dispensado sem razão escrita`);
  }
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
  // `factory` esteve aqui até 8 de setembro, com a razão *"nasce sozinha com a
  // empresa e não há o que cadastrar"* — verdadeira para a PRIMEIRA unidade e só
  // para ela. O dono levantou que podem existir mais, e a segunda não nasce de
  // nada: nasce do formulário. A primeira continua nascendo sozinha, com o id da
  // empresa, e isso é permanente — é o carimbo de todo movimento já gravado.
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

/**
 * Docblock que nomeia um guarda tem de nomear UM guarda.
 *
 * **A cicatriz é de 7 de setembro e é minha, inteira.** O docblock do
 * `capabilities` dizia *"`agreement.test.ts` fails if the two ever drift"*.
 * Existem **dois** arquivos com esse nome — `src/domain/agreement.test.ts` e
 * `src/sync/agreement.test.ts` — e eu grepei o primeiro, achei zero ocorrências
 * de `capability`, e conclui que a rede não existia. Escrevi a rede, escrevi o
 * achado, escrevi o commit. A rede existia no outro arquivo desde sempre, fazendo
 * exatamente o que eu tinha acabado de duplicar: lê o enum das migrações e
 * compara nos dois sentidos.
 *
 * O `CLAUDE.md` já tem a regra que eu quebrei — *"contradição achada é suspeita de
 * leitura errada, até virar prova"* —, e ela não me salvou porque eu **tinha**
 * uma prova: um `grep` que devolveu zero. O que faltava era saber que o alvo era
 * ambíguo.
 *
 * Então o conserto não é lembrar melhor: é o nome deixar de ser ambíguo. Um
 * docblock que aponta para um guarda por nome de arquivo só pode fazer isso
 * quando o nome resolve para um arquivo só; havendo dois, escreve-se o caminho.
 *
 * A varredura é do código que EMBARCA, não dos testes, e a fronteira é
 * deliberada: a armadilha é para quem segue um ponteiro a partir do arquivo que
 * está lendo, e o lugar de explicar a armadilha citando o nome pelado é
 * justamente aqui.
 */
test('a docblock naming a test file names exactly one', () => {
  const testes = (dir: string, into: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) testes(path, into);
      else if (/\.test\.tsx?$/.test(entry)) into.push(path);
    }
    return into;
  };

  const porNome = new Map<string, string[]>();
  for (const arquivo of ['src', 'app', 'e2e', 'scripts'].flatMap((d) => testes(d))) {
    const base = arquivo.slice(arquivo.lastIndexOf('/') + 1);
    porNome.set(base, [...(porNome.get(base) ?? []), arquivo]);
  }
  const ambiguos = [...porNome].filter(([, onde]) => onde.length > 1).map(([base]) => base);

  // A régua provada: hoje `agreement.test.ts` é o único nome repetido, e um nome
  // que só existe uma vez não pode entrar nesta lista.
  assert.ok(ambiguos.includes('agreement.test.ts'), 'a leitura de nomes repetidos quebrou');
  assert.ok(!ambiguos.includes('layers.test.ts'), 'nome único não é ambíguo');

  const soltos: string[] = [];
  for (const arquivo of ['src', 'app'].flatMap((d) => sourcesUnder(d))) {
    const linhas = readFileSync(arquivo, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      for (const base of ambiguos) {
        // Citação com caminho está certa; o que se recusa é o nome pelado.
        const semCaminho = new RegExp(`(^|[^/\\w])${base.replace(/\./g, '\\.')}`);
        if (semCaminho.test(linha)) soltos.push(`${arquivo}:${i + 1} — \`${base}\` sem caminho`);
      }
    });
  }

  assert.deepEqual(
    soltos,
    [],
    `estes docblocks apontam para um guarda por um nome que existe em mais de um lugar:\n  ${soltos.join('\n  ')}\n` +
      'Quem for conferir a promessa vai abrir o arquivo errado, não achar nada, e concluir ' +
      'que a rede não existe — que foi exatamente o que aconteceu. Escreva o caminho inteiro.',
  );
});

/**
 * Módulo que importa o cliente do servidor no TOPO não pode ser testado.
 *
 * **A cicatriz apareceu duas vezes no mesmo dia, e a segunda foi meia hora depois da
 * primeira.** `src/data/configuracao.ts` ficou dias sem uma linha de teste — sendo um
 * arquivo inteiro sobre comportamento de rede — porque importar `@/sync/supabase` no
 * topo arrasta o `@supabase/supabase-js` e, por baixo dele, o React Native, que o
 * transformador da suíte não atravessa: o teste morre em `Unexpected "typeof"` antes
 * de rodar a primeira asserção. Meia hora depois eu escrevi `src/sync/transporte.ts`
 * com o mesmo import no topo e caí no mesmo erro.
 *
 * O conserto é o mesmo nos dois: o import vira `await import(...)` dentro da função
 * que precisa do cliente. Quem chama passa a casa por parâmetro nos testes, e a
 * produção deixa o padrão acontecer.
 *
 * A guarda olha só o TOPO do arquivo — `import ... from` estático. O `await import`
 * dentro de função é exatamente o que ela existe para permitir.
 */
test('nenhum módulo importa o cliente do servidor no topo — senão ele não tem teste', () => {
  const suspeitos = [...sourcesUnder('src/sync'), ...sourcesUnder('src/data')].filter((f) => {
    if (f.endsWith('src/sync/supabase.ts')) return false;
    return /^\s*import\s[^;]*from\s+'(\.\/supabase|@\/sync\/supabase)'/m.test(
      readFileSync(f, 'utf8'),
    );
  });

  assert.deepEqual(
    suspeitos,
    [],
    `estes módulos importam o cliente do servidor no topo:\n  ${suspeitos.join('\n  ')}\n` +
      'O cliente arrasta o React Native, que não atravessa o transformador da suíte — o ' +
      'arquivo inteiro fica sem teste possível, e são justamente os arquivos de rede. ' +
      'Use `await import()` dentro da função e aceite a casa por parâmetro.',
  );
});

test('a guarda do cliente distingue o import do topo do import preguiçoso', () => {
  // O caso que ela DEVE pegar, e o que ela deve deixar passar — escritos como texto,
  // porque uma guarda de posição sem os dois casos é uma guarda que ninguém conferiu.
  const noTopo = /^\s*import\s[^;]*from\s+'(\.\/supabase|@\/sync\/supabase)'/m;
  assert.ok(noTopo.test("import { supabase } from './supabase';"), 'o import do topo reprova');
  assert.ok(
    noTopo.test("import { supabase } from '@/sync/supabase';"),
    'inclusive pelo caminho absoluto',
  );
  assert.ok(
    !noTopo.test("  const { supabase } = await import('./supabase');"),
    'o import preguiçoso passa — é ele que torna o arquivo testável',
  );
});

/**
 * A câmera é um ATALHO para a etiqueta, não um segundo caminho até ela.
 *
 * **A afirmação está no commit e precisa de quem a cobre.** Quem digita os onze
 * caracteres do código abre `/lots/<código>`; quem aponta a câmera abre a MESMA
 * rota. Dois caminhos que fazem a mesma coisa envelhecem em velocidades diferentes
 * — o dia em que a etiqueta ganhar uma checagem nova, um dos dois fica sem ela, e é
 * sempre o menos usado, que aqui é a câmera.
 *
 * Então a guarda tem duas metades: a tela do leitor **vai** para a rota do lote, e
 * ela **não** consulta o repositório. Uma busca própria ali seria a segunda
 * implementação de *"esse lote existe?"* — e a etiqueta já sabe dizer *"esse lote
 * não está mais aqui"*, com a porta de volta.
 */
test('a câmera abre a mesma rota que o código digitado, e não consulta nada por fora', () => {
  const leitor = readFileSync('app/scan.tsx', 'utf8');
  const producao = readFileSync('app/(tabs)/production.tsx', 'utf8');

  assert.match(
    leitor,
    /router\.replace\(`\/lots\/\$\{[^}]+\}`/,
    'o leitor tem de abrir a rota do lote — se ele parar de navegar, a câmera lê e não faz nada',
  );
  assert.match(
    producao,
    /router\.push\(`\/lots\/\$\{[^}]+\}`\)/,
    'e o campo de digitar tem de continuar abrindo a mesma',
  );
  assert.doesNotMatch(
    leitor,
    /from '@\/data\/repository'/,
    'o leitor não consulta o repositório: "esse lote existe?" é pergunta da etiqueta, e ' +
      'duplicá-la aqui é a segunda implementação que envelhece sozinha',
  );
});

test('a guarda do atalho distingue navegar de consultar', () => {
  // Os dois casos, escritos como texto — guarda sem caso falso é guarda que
  // ninguém conferiu.
  const naRota = /router\.replace\(`\/lots\/\$\{[^}]+\}`/;
  assert.ok(naRota.test('router.replace(`/lots/${codigo}` as never);'), 'navegar reprova nada');
  assert.ok(
    !naRota.test('router.replace(`/lots` as never);'),
    'e uma rota sem o código não conta como abrir o lote',
  );
});

/**
 * O que o pacote promete em JS e o módulo Android não cumpre.
 *
 * **Cicatriz de 8 de setembro, e ela passou por tudo.** `app/(tabs)/production.tsx`
 * chamava `CameraView.isAvailableAsync()` para só oferecer a leitura de etiqueta em
 * aparelho com câmera — intenção certa, Lei 5. Só que essa função é implementada no
 * expo-camera **da web**; `CameraViewModule.kt` não a declara. No Android o JS lança
 * `UnavailabilityError`, o `.catch` lia isso como *"não tem câmera"*, e o botão **nunca
 * apareceu em nenhum aparelho**. Typecheck verde (o tipo existe), 508 testes verdes,
 * portão verde, e a funcionalidade não existia.
 *
 * A régua lê a lista do KOTLIN, não uma lista escrita aqui: guarda que compara duas
 * coisas escritas pela mesma mão não guarda nada. A fonte é
 * `CameraViewModule.kt`, que é quem o aparelho executa.
 *
 * A licença é `Platform.OS`: chamar uma função que só a web tem é legítimo desde que
 * o arquivo pergunte em que plataforma está. Grosso de propósito — a guarda não lê
 * fluxo, e uma que tentasse ler daria falso negativo na primeira reescrita.
 */
test('no screen calls an expo-camera function the Android module does not have', () => {
  const kotlin = readFileSync(
    'node_modules/expo-camera/android/src/main/java/expo/modules/camera/CameraViewModule.kt',
    'utf8',
  );
  const noAndroid = new Set(
    [...kotlin.matchAll(/\b(?:Async)?Function\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
  );
  assert.ok(
    noAndroid.has('getCameraPermissionsAsync'),
    'a leitura do Kotlin não achou nem a função que sabemos existir — a régua quebrou, não o app',
  );

  const faltando: string[] = [];
  for (const arquivo of [...sourcesUnder('app'), ...sourcesUnder('src')]) {
    const texto = readFileSync(arquivo, 'utf8');
    if (!texto.includes('expo-camera')) continue;
    for (const m of texto.matchAll(/\bCameraView\.([A-Za-z0-9_]+)\(/g)) {
      if (noAndroid.has(m[1])) continue;
      if (texto.includes('Platform.OS')) continue;
      faltando.push(`${arquivo}: CameraView.${m[1]}()`);
    }
  }
  assert.deepEqual(
    faltando,
    [],
    'estas chamadas não existem no módulo Android do expo-camera, e o aparelho vai lançar ' +
      'UnavailabilityError em runtime — sem nada ficar vermelho antes:\n  ' +
      faltando.join('\n  '),
  );
});

test('the camera-API guard bites the real scar, and leaves the fix alone', () => {
  const kotlin = readFileSync(
    'node_modules/expo-camera/android/src/main/java/expo/modules/camera/CameraViewModule.kt',
    'utf8',
  );
  const noAndroid = new Set(
    [...kotlin.matchAll(/\b(?:Async)?Function\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]),
  );
  const morde = (texto: string) =>
    [...texto.matchAll(/\bCameraView\.([A-Za-z0-9_]+)\(/g)].some(
      (m) => !noAndroid.has(m[1]) && !texto.includes('Platform.OS'),
    );

  // O caso verdadeiro: o código exato que foi para o aparelho e não funcionou.
  assert.ok(
    morde("import { CameraView } from 'expo-camera';\nvoid CameraView.isAvailableAsync()"),
    'a guarda não pega a chamada que quebrou de verdade',
  );
  // E os dois falsos, que separam "guarda" de "proibição": uma função que o Android
  // tem, e a mesma chamada de antes agora perguntando em que plataforma está.
  assert.ok(
    !morde("import { CameraView } from 'expo-camera';\nvoid CameraView.getCameraPermissionsAsync()"),
    'uma função que o Android tem não pode reprovar',
  );
  assert.ok(
    !morde(
      "import { Platform } from 'react-native';\nif (Platform.OS === 'web') void CameraView.isAvailableAsync();",
    ),
    'perguntar a plataforma é a licença — se ela não vale, a guarda vira proibição',
  );
});

/**
 * Nenhuma tela pergunta "qual é o lugar padrão" — telas perguntam "onde eu estou".
 *
 * As duas devolvem o mesmo id enquanto a fábrica tem uma unidade só, e param de
 * devolver no dia em que ela tiver duas. `defaultLocationId` é o id da PRIMEIRA
 * unidade, e ele é permanente por um motivo que não se contorna: é o carimbo de
 * todo movimento já gravado, e `movements_are_immutable` é `before update or
 * delete` — `location_id` de linha que já subiu não se corrige nunca, nem por
 * migração, nem por estorno. Então a primeira unidade guarda o id da empresa
 * para sempre e as seguintes nascem com uuid.
 *
 * Daí a regra: **nenhum código lê significado no id de um lugar.** Uma tela que
 * usa o lugar padrão para dizer "aqui" está certa hoje e errada na segunda
 * unidade — gravando a produção de uma cidade no saldo da outra, calada, porque
 * as duas somam na mesma empresa. Quem quer saber onde o aparelho está pergunta
 * a `unidadeDaqui()`; quem quer saber quais são as fábricas pergunta pela
 * ESPÉCIE, nunca pelo id.
 */
test('no screen asks for the default place when it means "here"', () => {
  const culpados: string[] = [];
  for (const arquivo of sourcesUnder('app')) {
    const texto = code(readFileSync(arquivo, 'utf8'));
    if (/\bdefaultLocationId\s*\(/.test(texto)) culpados.push(arquivo);
  }
  assert.deepEqual(
    culpados,
    [],
    'estas telas usam o lugar padrão como se fosse "aqui" — na segunda unidade elas gravam ' +
      'na fábrica errada, sem nada acusar:\n  ' + culpados.join('\n  '),
  );
});

test('the here guard bites the real scar, and leaves the fix alone', () => {
  const morde = (texto: string) => /\bdefaultLocationId\s*\(/.test(code(texto));
  // O caso verdadeiro: a linha exata que estava em quatro telas até 8 de setembro.
  assert.ok(morde('const fabrica = defaultLocationId(empresaDaqui());'), 'não pega a linha que existia');
  // E os falsos: o conserto, e a MENÇÃO ao nome num comentário, que não é chamada.
  assert.ok(!morde('const fabrica = unidadeDaqui();'), 'o conserto não pode reprovar');
  assert.ok(
    !morde('// ver defaultLocationId(companyId), que devolve o id da primeira unidade'),
    'comentário não é chamada — a guarda que não distingue os dois vira proibição de falar',
  );
});

/**
 * Quem grava num lugar diz QUAL lugar — a sala não se herda de um padrão.
 *
 * **Cicatriz de 8 de setembro, e ela estava ativa com uma unidade só.**
 * `recordLoss` tem `locationId` opcional e cai em `ensureLocation` quando ele
 * falta (`repository.ts:2711`). `app/inputs/[id].tsx` não o passava. Com a tela
 * aberta em `?sala=<câmara fria>` o número mostrado é o da câmara — `findItem`
 * recebe a sala —, a perda saía do almoxarifado, e os DOIS saldos ficavam errados
 * de uma vez: o da câmara alto, o do almoxarifado baixo, e **a soma da empresa
 * certa**. É essa última parte que faz ninguém notar.
 *
 * A régua é a forma, não a linha: escritor de razão com sala opcional é escritor
 * que erra calado. Quem chama de tela diz onde, ou o número de dois lugares
 * mente junto.
 */
const ESCRITORES_COM_SALA = ['recordLoss', 'recordCount', 'recordProduction'] as const;

test('every screen that writes to a room names the room', () => {
  const mudos: string[] = [];
  for (const arquivo of sourcesUnder('app')) {
    const texto = code(readFileSync(arquivo, 'utf8'));
    for (const escritor of ESCRITORES_COM_SALA) {
      const re = new RegExp(`\\b${escritor}\\s*\\(`, 'g');
      for (const m of texto.matchAll(re)) {
        const args = argumentos(texto, m.index + m[0].length);
        if (!args) continue;
        if (!args.some((a) => /locationId/.test(a))) {
          mudos.push(`${arquivo}: ${escritor}()`);
        }
      }
    }
  }
  assert.deepEqual(
    mudos,
    [],
    'estas telas gravam no razão sem dizer em que lugar, e o padrão vai decidir por elas:\n  ' +
      mudos.join('\n  '),
  );
});

test('the room guard bites the real scar, and reads a nested call correctly', () => {
  const morde = (texto: string) => {
    const m = /\brecordLoss\s*\(/.exec(code(texto));
    if (!m) return false;
    const args = argumentos(code(texto), m.index + m[0].length);
    return !args?.some((a) => /locationId/.test(a));
  };
  // O caso verdadeiro: a chamada exata que estava na tela.
  assert.ok(
    morde('await recordLoss(empresaDaqui(), { itemId: item.id, baseUnits: 3, reason });'),
    'não pega a chamada que estava errada',
  );
  // O conserto passa.
  assert.ok(
    !morde('await recordLoss(empresaDaqui(), { locationId: contarEm ?? undefined, itemId: i });'),
    'o conserto não pode reprovar',
  );
  // E a metade que separa contador de parênteses de `indexOf(',')`: a sala vem
  // dentro de um objeto aninhado, depois de uma chamada com vírgula dentro.
  assert.ok(
    !morde('await recordLoss(empresaDaqui(), { itemId: f(a, b), locationId: salaDe(x, y) });'),
    'chamada aninhada com vírgula não pode esconder a sala do leitor',
  );
});

/**
 * Quem CRIA uma sala diz em que unidade ela fica.
 *
 * A sala nasce sem pai se ninguém disser, e sala sem pai fica fora do saldo da
 * unidade: o pedido deixa de contar o que está no freezer, e nada acusa. É a mesma
 * família de `recordLoss` sem sala — o padrão decidindo por quem esqueceu.
 *
 * **Só a criação, e é essa a fronteira.** Atualizar um lugar (renomear, gravar
 * acordo, gravar faixa de sensor) não fala de unidade de propósito: `savePlace`
 * trata ausente como "não mexa" e preserva o pai que já estava. Cobrar
 * `parentLocationId` numa atualização faria a tela repetir um fato que ela não
 * precisa saber — e foi justamente ao escrever isto que apareceu que o `ON
 * CONFLICT` apagaria o pai num rename.
 *
 * A criação se reconhece por NÃO passar `id`, que é o que `savePlace` usa para
 * decidir entre inserir e atualizar.
 */
test('every screen that creates a room says which unit', () => {
  const mudos: string[] = [];
  for (const arquivo of sourcesUnder('app')) {
    const texto = code(readFileSync(arquivo, 'utf8'));
    for (const m of texto.matchAll(/\bsavePlace\s*\(/g)) {
      const args = argumentos(texto, m.index + m[0].length);
      if (!args) continue;
      const corpo = args.join(' , ');
      const cria = !/\bid\s*:/.test(corpo);
      if (cria && !/parentLocationId/.test(corpo)) mudos.push(`${arquivo}: savePlace()`);
    }
  }
  assert.deepEqual(
    mudos,
    [],
    'estas telas criam sala sem dizer a unidade — a sala nasce sem pai e sai do saldo:\n  ' +
      mudos.join('\n  '),
  );
});

test('the unit-on-create guard tells creating from updating', () => {
  const morde = (texto: string) => {
    const m = /\bsavePlace\s*\(/.exec(code(texto));
    if (!m) return false;
    const args = argumentos(code(texto), m.index + m[0].length);
    const corpo = (args ?? []).join(' , ');
    return !/\bid\s*:/.test(corpo) && !/parentLocationId/.test(corpo);
  };
  // O caso verdadeiro: a criação como ela estava antes de 8 de setembro.
  assert.ok(morde('await savePlace(empresaDaqui(), { name, kind });'), 'não pega a criação muda');
  // O conserto.
  assert.ok(
    !morde('await savePlace(empresaDaqui(), { name, kind, parentLocationId: unidadeDaqui() });'),
    'o conserto não pode reprovar',
  );
  // E a metade que separa esta guarda de uma proibição: ATUALIZAR não precisa dizer
  // a unidade, porque ausente é "não mexa" e o pai que já estava é preservado.
  assert.ok(
    !morde('await savePlace(empresaDaqui(), { id: place.id, name: nome, kind: place.kind });'),
    'atualizar não é criar — cobrar a unidade aqui faria a tela repetir o que já está gravado',
  );
});

/**
 * *"Quando foi conferido?"* tem UMA régua, e ela mora no domínio.
 *
 * **A cicatriz é de 8 de setembro e é de dez minutos depois da anterior.** Ao dar
 * escritor a `sale`, a contagem de uma loja própria passou a gravar venda em vez de
 * correção — e o *"conferido em"* da ficha do insumo, que procurava `adjustment`,
 * congelaria no dia em que a loja bateu exato. Eu consertei a ficha, e **não o
 * assistente**, que tinha o mesmo `if` escrito com outras palavras: a ficha passou a
 * dizer *"conferido em 8/9"* enquanto o assistente respondia *"ninguém conferiu ainda"*
 * para a mesma prateleira, no mesmo dia.
 *
 * Duas verdades sobre um fato é o defeito que este repositório já pagou em saldo, em
 * custo e em piso de produção. A regra que ele já tinha escrita — *"conserto de pele não
 * termina no arquivo que o mostrou"* — vale igual para régua de razão, e esta guarda é
 * o `grep` daquela regra virando teste.
 */
export function conferenciaEscritaAMao(texto: string): string[] {
  const achados: string[] = [];
  for (const m of texto.matchAll(/\bkind\s*===?\s*'(adjustment|sale)'/g)) {
    achados.push(m[0]);
  }
  return achados;
}

test('nothing outside the domain decides for itself what proves a shelf was counted', () => {
  const fontes = [...sourcesUnder('app'), ...sourcesUnder('src')].filter(
    (f) => !f.endsWith('/ledger.ts') && !/\.test\.tsx?$/.test(f),
  );
  assert.ok(fontes.length > 50, 'a varredura veio vazia — a comparação seria de graça');

  const soltos: string[] = [];
  for (const f of fontes) {
    for (const achado of conferenciaEscritaAMao(readFileSync(f, 'utf8'))) soltos.push(`${f}: ${achado}`);
  }

  assert.deepEqual(
    soltos,
    [],
    `estes lugares decidem sozinhos o que é uma conferência:\n  ${soltos.join('\n  ')}\n` +
      'A régua é `ehConferencia` em `src/domain/ledger.ts`, e ela é uma porque no dia em ' +
      'que o ponto de venda chegar a resposta muda — e tem de mudar em todos os leitores ' +
      'no mesmo commit, não no que alguém lembrar.',
  );
});

test('the counted-kind guard bites a hand-written check and spares the ruler being used', () => {
  // Positivo: as duas formas que o defeito teve, e a de igualdade frouxa.
  assert.deepEqual(conferenciaEscritaAMao("movements.find((m) => m.kind === 'adjustment')"), [
    "kind === 'adjustment'",
  ]);
  assert.deepEqual(
    conferenciaEscritaAMao("(m) => m.kind === 'adjustment' || m.kind === 'sale'"),
    ["kind === 'adjustment'", "kind === 'sale'"],
    'o conserto pela metade — a régua copiada para dentro da tela — também reprova',
  );
  assert.deepEqual(conferenciaEscritaAMao("if (mv.kind == 'sale') {"), ["kind == 'sale'"]);

  // Negativos: quem PERGUNTA à régua passa, e as outras espécies não são assunto desta
  // guarda — uma perda é uma perda, e comparar com ela não decide conferência nenhuma.
  assert.deepEqual(conferenciaEscritaAMao('movements.find((m) => ehConferencia(m.kind))'), []);
  assert.deepEqual(conferenciaEscritaAMao("if (m.kind === 'loss') return null;"), []);
  assert.deepEqual(
    conferenciaEscritaAMao("t.movement[ato.reversesKind ?? 'adjustment']"),
    [],
    'um rótulo com valor padrão não está decidindo o que prova uma conferência',
  );
});

/**
 * Uma tela que recorta uma consulta recorta as IRMÃS dela.
 *
 * **A cicatriz é de 9 de setembro e ela sobreviveu a um recorte inteiro.** Em 8 de
 * setembro dez consultas ganharam escopo, uma a uma, e o trabalho foi conferido
 * consulta a consulta. No dia seguinte, ao medir se a lista ainda valia, o defeito
 * apareceu num bloco só de `app/(tabs)/index.tsx`: `runningOut`, `stockAgainstOrders` e
 * `recentRuns` pediam `{ unidade }`, e `productionOn`, `shipmentsOn`, `productionBetween`
 * e `openProductionRuns` — vizinhas no mesmo `Promise.all` — não pediam nada.
 *
 * Com duas unidades **a manchete da capa contava as duas cidades e o conselho embaixo
 * dela contava uma**, lado a lado, sem ninguém dizer que a régua mudou no meio. É a mesma
 * incoerência que a aba de Produção já teve, e ela sobreviveu porque o recorte foi feito
 * CONSULTA a consulta em vez de TELA a tela.
 *
 * A lista das consultas que aceitam escopo é **derivada de `repository.ts`**, e não
 * escrita aqui: guarda que compara duas coisas escritas pela mesma mão não guarda nada, e
 * o dia em que a décima primeira nascer ela entra sozinha.
 */
export function consultasComEscopo(fonte: string): string[] {
  const nomes: string[] = [];
  for (const m of fonte.matchAll(/export async function (\w+)\(/g)) {
    const i = m.index ?? 0;
    const j = fonte.indexOf('):', i);
    if (j > i && fonte.slice(i, j).includes('onde?: Escopo')) nomes.push(m[1]);
  }
  return nomes;
}

/**
 * O código sem a prosa — porque comentário não é chamada, e a guarda já caiu nisso.
 *
 * Na primeira execução ela acusou `app/(tabs)/index.tsx` por `productionOn()` e
 * `shipmentsOn()` que estavam num DOCBLOCK explicando a tela, com as duas já
 * recortadas dez linhas abaixo. Guarda que acusa quem obedeceu ensina a desligá-la — e
 * é o terceiro detector desta casa a tropeçar na mesma pedra em dois dias.
 */
function semProsa(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** As chamadas desta tela que NÃO dizem de onde, quando as irmãs dizem. */
export function granularidadeMisturada(fonte: string, comEscopo: string[]): string[] {
  const texto = semProsa(fonte);
  const chamadas: { nome: string; diz: boolean }[] = [];
  for (const nome of comEscopo) {
    for (const m of texto.matchAll(new RegExp(`\\b${nome}\\(`, 'g'))) {
      const args = argumentos(texto, (m.index ?? 0) + nome.length + 1);
      if (args === null) continue;
      // A palavra `unidade` como PREFIXO, não como palavra inteira: o recorte pode
      // vir de uma ajudante nomeada — `unidadeDaqui()`, `unidadeEAsNossasDeFora()` —
      // e exigir a palavra isolada faria a guarda acusar quem obedeceu com um nome
      // mais longo. O que ela mede continua sendo "esta chamada DIZ de onde".
      chamadas.push({ nome, diz: args.some((a) => /\b(sala|unidade)/i.test(a)) });
    }
  }
  // Uma tela que não recorta NADA está noutro assunto — a lista do almoxarifado lê a
  // empresa de propósito, e cobrar escopo dela seria inventar defeito. O que esta
  // guarda pega é a MISTURA: metade recortada, metade não, na mesma tela.
  if (!chamadas.some((c) => c.diz)) return [];
  return chamadas.filter((c) => !c.diz).map((c) => `${c.nome}(...)`);
}

test('a screen that scopes one query scopes its siblings too', () => {
  const comEscopo = consultasComEscopo(readFileSync('src/data/repository.ts', 'utf8'));
  assert.ok(comEscopo.length >= 8, `a derivação achou ${comEscopo.length} consultas com escopo`);

  // **`src/` também, e é onde a mistura viva estava.**
  //
  // A varredura olhava só `app/`, e a ligação do assistente (`src/data/assistantData.ts`)
  // é um chamador como qualquer tela — só que sem tela. Ela recortava `itemMovements`,
  // `productionOn` e `lossesOn` pela unidade e deixava `listItems` na empresa: o
  // assistente respondia 50.000 g onde a tela irmã dizia 20.000, e a contagem falada
  // comparava com esse total e gravava a diferença numa sala. A guarda existia, a
  // regra estava escrita, e o arquivo não era lido.
  const misturadas: string[] = [];
  for (const f of [...sourcesUnder('app'), ...sourcesUnder('src')]) {
    // O arquivo onde as consultas MORAM não é chamador delas: ele as declara, as
    // chama entre si, e o recorte de cada uma é o assunto dele. Cobrar coerência de
    // escopo aqui é acusar quem obedeceu — o mesmo defeito que a prosa já causou
    // nesta guarda uma vez.
    if (f.endsWith('src/data/repository.ts')) continue;
    for (const chamada of granularidadeMisturada(readFileSync(f, 'utf8'), comEscopo)) {
      misturadas.push(`${f}: ${chamada}`);
    }
  }

  assert.deepEqual(
    misturadas,
    [],
    `estas telas recortam parte das consultas e a outra parte não:\n  ${misturadas.join('\n  ')}\n` +
      'A manchete passa a contar as duas cidades enquanto o conselho embaixo dela conta ' +
      'uma — lado a lado, e sem ninguém dizer que a régua mudou no meio.',
  );
});

test('the mixed-granularity guard bites a half-scoped screen and leaves the other two alone', () => {
  const lista = ['runningOut', 'productionOn'];

  // Positivo: metade recortada, metade não. É o defeito exato de 9 de setembro.
  assert.deepEqual(
    granularidadeMisturada(
      'runningOut(co, a, b, 7, 7, { unidade: u });\nproductionOn(co, a, b);',
      lista,
    ),
    ['productionOn(...)'],
    'a irmã sem escopo tem que reprovar',
  );

  // Negativo 1: as duas recortadas — o conserto passa.
  assert.deepEqual(
    granularidadeMisturada(
      'runningOut(co, a, b, 7, 7, { unidade: u });\nproductionOn(co, a, b, { unidade: u });',
      lista,
    ),
    [],
  );

  // Negativo 2, e é ele que impede a guarda de inventar defeito: uma tela que não
  // recorta NADA está noutro assunto. A lista do almoxarifado lê a empresa de
  // propósito, e cobrar escopo dela seria alerta inventado — o que ensina a ignorar.
  assert.deepEqual(granularidadeMisturada('productionOn(co, a, b);', lista), []);

  // Negativo 3: a PROSA. Um docblock que cita as duas não é chamada de nenhuma — e foi
  // exatamente assim que esta guarda acusou a tela consertada na primeira execução.
  assert.deepEqual(
    granularidadeMisturada(
      '/**\n * Ela junta `productionOn()` e `shipmentsOn()`.\n */\nrunningOut(co, a, b, 7, 7, { unidade: u });',
      [...lista, 'shipmentsOn'],
    ),
    [],
    'comentário não é chamada',
  );

  // Negativo 4-bis: o recorte vindo de uma AJUDANTE nomeada. A perda tem recorte
  // próprio — a unidade mais as prateleiras nossas de fora dela —, e ele mora numa
  // função para os quatro leitores concordarem. Exigir a palavra isolada acusaria
  // justamente o conserto.
  assert.deepEqual(
    granularidadeMisturada(
      'runningOut(co, a, b, 7, 7, { unidade: u });\nproductionOn(co, a, b, unidadeEAsNossasDeFora());',
      lista,
    ),
    [],
    'ajudante que nomeia o recorte diz de onde',
  );

  // Negativo 4: a forma condicional, que é como as telas de sala escrevem. Sem isto a
  // guarda acusaria a ficha do insumo, que está certa.
  assert.deepEqual(
    granularidadeMisturada(
      'runningOut(co, a, b, 7, 7, { unidade: u });\nproductionOn(co, a, b, sala ? { sala } : { unidade: u });',
      lista,
    ),
    [],
  );
});

/**
 * A tabela de quem escreve o quê é a MESMA dos dois lados — e o servidor manda.
 *
 * **Achado em 9 de setembro, e ele estava vivo.** Nenhuma das sete escritas do
 * `repository.ts` confere capacidade, e o botão de desfazer do extrato não tem portão
 * nenhum. O SQLite aceita qualquer linha — não tem política, não tem papel, não tem
 * capacidade —, o servidor recusa, e `drain` **para na primeira linha recusada**.
 * Parar é deliberado e certo para uma lacuna de dependência, que a próxima tentativa
 * resolve; é fatal para uma recusa por permissão, que nenhuma tentativa resolve.
 * `storeManager` e `driver` não têm `adjust_stock`: um toque em "Desfazer" e aquele
 * celular nunca mais sincroniza, sem erro na tela, porque no aparelho a linha entrou.
 *
 * A guarda lê o `case kind` da política **na migração** e compara com `QUEM_ESCREVE`.
 * Duas fontes, e a que manda não passou pela minha mão — que é a única forma de esta
 * tabela não envelhecer no dia em que a política mudar.
 */
export function politicaDoServidor(sql: string): Record<string, string[]> | null {
  /**
   * A prosa sai ANTES de qualquer coisa — e o motivo aqui é bom demais para resumir.
   *
   * A primeira versão procurava o fim do `case` com `indexOf('end')`, sobre o SQL com
   * comentários. A `0047` explica as duas origens da venda num comentário entre os
   * casos, e **`indexOf('end')` casou com o miolo de "v-end-a"**: o leitor parou dentro
   * da palavra `venda`, no comentário que explica a venda. Ele leu quatro espécies, deu
   * as outras seis como ausentes do servidor, e acusou a tabela CERTA de divergir de
   * uma política que ele não tinha terminado de ler.
   *
   * Duas coisas consertam, e as duas são a mesma lição: comentário não é código, e
   * palavra-chave se procura como PALAVRA. É a quarta régua desta casa a tropeçar em
   * prosa em dois dias.
   */
  const limpo = sql.replace(/^\s*--.*$/gm, '');
  const caso = limpo.lastIndexOf('and case kind');
  if (caso < 0) return null;
  const depois = limpo.slice(caso);
  const fecha = depois.match(/\bend\b/);
  if (!fecha) return null;
  const corpo = depois.slice(0, fecha.index);
  const pedacos = corpo.split(/when '/).slice(1);
  const mapa: Record<string, string[]> = {};
  for (const pedaco of pedacos) {
    const nome = pedaco.match(/^(\w+)'/);
    if (!nome) continue;
    const caps = [...pedaco.matchAll(/has_capability\(company_id, '(\w+)'\)/g)].map((c) => c[1]);
    if (caps.length > 0) mapa[nome[1]] = caps;
  }
  return Object.keys(mapa).length > 0 ? mapa : null;
}

test('the device knows exactly which capability the server demands for each kind', () => {
  // A migração mais nova que define a política — e não a 0001, que já foi reescrita
  // duas vezes. Ler a antiga daria uma tabela que o servidor não usa mais.
  const migracoes = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  const comPolitica = migracoes.find((f) =>
    readFileSync(join('supabase/migrations', f), 'utf8').includes('create policy movements_append'),
  );
  assert.ok(comPolitica, 'nenhuma migração define movements_append — a comparação seria de graça');

  const doServidor = politicaDoServidor(
    readFileSync(join('supabase/migrations', comPolitica), 'utf8'),
  );
  assert.ok(doServidor, `não consegui ler o case kind de ${comPolitica}`);

  const divergem: string[] = [];
  for (const [kind, caps] of Object.entries(doServidor)) {
    const nossa = (QUEM_ESCREVE as Record<string, readonly string[]>)[kind];
    if (!nossa) {
      divergem.push(`${kind}: o servidor exige ${caps.join(' ou ')} e o aparelho não sabe`);
      continue;
    }
    const a = [...caps].sort().join(',');
    const b = [...nossa].sort().join(',');
    if (a !== b) divergem.push(`${kind}: servidor ${a}, aparelho ${b}`);
  }
  for (const kind of Object.keys(QUEM_ESCREVE)) {
    if (!doServidor[kind]) divergem.push(`${kind}: o aparelho tem regra e o servidor não`);
  }

  assert.deepEqual(
    divergem,
    [],
    `a tabela do aparelho discorda da política do servidor (${comPolitica}):\n  ${divergem.join('\n  ')}\n` +
      'Quem manda é o servidor: uma linha que ele recusa fica pendente para sempre, e ' +
      '`drain` para na primeira — tudo o que a fábrica gravar depois fica preso atrás dela.',
  );
});

test('the policy reader tells a real case from prose that mentions one', () => {
  const politica = `
create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'purchase'    then private.has_capability(company_id, 'check_receipt')
      -- As duas origens de uma venda.
      when 'sale'        then private.has_capability(company_id, 'dispatch')
                           or private.has_capability(company_id, 'adjust_stock')
      when 'adjustment'  then private.has_capability(company_id, 'adjust_stock')
    end
  );`;
  assert.deepEqual(politicaDoServidor(politica), {
    purchase: ['check_receipt'],
    sale: ['dispatch', 'adjust_stock'],
    adjustment: ['adjust_stock'],
  });

  // Negativos: um arquivo sem política nenhuma, e um que só FALA dela num comentário.
  assert.equal(politicaDoServidor('alter table movements add column x int;'), null);
  assert.equal(
    politicaDoServidor("-- a política diz when 'sale' then has_capability(company_id, 'dispatch')"),
    null,
    'comentário citando a política não é a política — o terceiro detector desta casa a tropeçar nisso',
  );
});

/**
 * O que o servidor não deixa REESCREVER, a fila não tenta reescrever.
 *
 * **A fila sobe com `on conflict do update`, e é isso que torna esta lista obrigatória.**
 * Onde o servidor tem `for update`, reenviar uma linha corrige — é o que salva a fila de
 * um envio parcial. Onde ele NÃO tem, o mesmo reenvio é recusado por política, e
 * `drain` para na primeira recusa: a fila daquele aparelho não anda mais.
 *
 * Hoje as duas listas concordam, e foi por isso que este defeito nunca apareceu. O que
 * faltava é a coisa que impede a próxima: `APENAS_INSERE` é escrita à mão, e uma tabela
 * append-only nova entra no servidor sem ninguém lembrar dela aqui. O sintoma seria em
 * produção, meses depois, e a causa estaria a quatro arquivos de distância.
 *
 * A lista do servidor é **derivada das migrações**, com `drop policy` respeitado — a
 * `0008` e a `0047` derrubam e recriam a de `movements`, e um leitor que só somasse
 * `create` daria por viva uma política revogada.
 */
export function reescrevePermitida(sql: string): Set<string> {
  const limpo = sql.replace(/^\s*--.*$/gm, '');
  // Ordem importa: create e drop se alternam ao longo das migrações, e quem vale é o
  // último. Um leitor que só conta `create` acha que a forma da `0001` ainda vale.
  const eventos: { pos: number; tipo: 'cria' | 'derruba'; nome: string; tabela: string; escreve: boolean }[] = [];
  for (const m of limpo.matchAll(/create policy\s+(\w+)\s+on\s+(\w+)([\s\S]{0,200}?)(?:using|with check|\()/g)) {
    const cmd = /\bfor\s+(all|update)\b/.test(m[3]);
    eventos.push({ pos: m.index ?? 0, tipo: 'cria', nome: m[1], tabela: m[2], escreve: cmd });
  }
  for (const m of limpo.matchAll(/drop policy\s+(?:if exists\s+)?(\w+)\s+on\s+(\w+)/g)) {
    eventos.push({ pos: m.index ?? 0, tipo: 'derruba', nome: m[1], tabela: m[2], escreve: false });
  }
  eventos.sort((a, b) => a.pos - b.pos);

  const vivas = new Map<string, { tabela: string; escreve: boolean }>();
  for (const e of eventos) {
    if (e.tipo === 'cria') vivas.set(`${e.tabela}.${e.nome}`, { tabela: e.tabela, escreve: e.escreve });
    else vivas.delete(`${e.tabela}.${e.nome}`);
  }
  const podem = new Set<string>();
  for (const v of vivas.values()) if (v.escreve) podem.add(v.tabela);
  return podem;
}

/**
 * As que a fila trata como append-only e o servidor deixaria reescrever.
 *
 * Não é defeito — é o lado seguro de errar, e cada uma precisa da razão escrita. A
 * lista existe para a exceção ser uma decisão em vez de um esquecimento.
 */
const CONSERVADORAS: Record<string, string> = {
  readings: 'uma medida é um fato num instante: corrigir uma leitura de sensor seria reescrever o que o termômetro disse às 3h. O servidor permite e o aparelho não usa, de propósito',
};

test('what the server refuses to rewrite, the queue never tries to rewrite', () => {
  const sql = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join('supabase/migrations', f), 'utf8'))
    .join('\n');
  const podemReescrever = reescrevePermitida(sql);
  assert.ok(podemReescrever.size > 5, `a derivação achou ${podemReescrever.size} tabelas reescrevíveis`);

  const naLista = new Set<string>(APENAS_INSERE as readonly string[]);
  const problemas: string[] = [];

  for (const tabela of sendableTables) {
    const reescreve = podemReescrever.has(tabela);
    if (!reescreve && !naLista.has(tabela)) {
      problemas.push(
        `${tabela}: o servidor não tem política de UPDATE e a fila manda \`on conflict do update\` — ` +
          'o reenvio é recusado, e `drain` para na primeira recusa',
      );
    }
    if (reescreve && naLista.has(tabela) && !CONSERVADORAS[tabela]) {
      problemas.push(
        `${tabela}: a fila trata como append-only e o servidor deixaria corrigir — ` +
          'ou entra em CONSERVADORAS com a razão, ou sai de APENAS_INSERE',
      );
    }
  }

  assert.deepEqual(problemas, [], `a fila e a política do servidor discordam:\n  ${problemas.join('\n  ')}`);
});

test('the rewrite reader respects drop policy, and does not read a revoked one as live', () => {
  // Positivo: uma política de update viva.
  assert.deepEqual(
    [...reescrevePermitida("create policy p on orders for update using (true);")],
    ['orders'],
  );
  // `for all` também escreve.
  assert.deepEqual([...reescrevePermitida("create policy p on items for all using (true);")], ['items']);

  // O caso que importa: criada e DERRUBADA depois. Um leitor que só conta `create`
  // daria por viva a forma da 0001 — e a 0008 e a 0047 derrubam e recriam justamente
  // a política de `movements`.
  assert.deepEqual(
    [
      ...reescrevePermitida(
        'create policy p on lots for update using (true);\ndrop policy p on lots;',
      ),
    ],
    [],
    'política revogada não vale',
  );

  // E a prosa não conta, pela quarta vez em dois dias.
  assert.deepEqual(
    [...reescrevePermitida("-- create policy p on movements for update using (true);")],
    [],
    'comentário citando uma política não é a política',
  );
});

/**
 * O selo da última cópia tem UM escritor.
 *
 * Ele estava escrito à mão em dois lugares da tela e em nenhum lugar do caminho
 * automático — e é ele que a régua de frequência lê. Sem o selo, `horaDeCopiar`
 * respondia "sim" para sempre: o Drive recebia o razão inteiro a cada volta ao
 * primeiro plano — banda, bateria e cota da conta dele — e a capa continuava
 * cobrando um backup que já tinha subido.
 *
 * Três escritores de um dado que tem de ter um só é como duas verdades nascem, e
 * esta casa já pagou isso no `item_costs`. A guarda tem o positivo junto: o dono
 * do selo PRECISA escrevê-lo.
 */
export function escrevemOSelo(fontes: readonly { arquivo: string; texto: string }[]): string[] {
  return fontes
    .filter(
      (f) =>
        !f.arquivo.endsWith('data/backup.ts') &&
        /writeJson\(\s*ULTIMA_COPIA/.test(semProsa(f.texto)),
    )
    .map((f) => f.arquivo);
}

test('só o backup.ts grava o selo da última cópia', () => {
  const fontes = [...sourcesUnder('app'), ...sourcesUnder('src')].map((arquivo) => ({
    arquivo,
    texto: readFileSync(arquivo, 'utf8'),
  }));

  assert.deepEqual(
    escrevemOSelo(fontes),
    [],
    'estes escrevem o selo por conta própria, e um dado com três autores diverge',
  );

  // Positivo: o dono continua escrevendo. Se ele parar, o selo deixou de existir e
  // a régua de frequência volta a responder "sempre" sem ninguém ver.
  assert.match(
    readFileSync('src/data/backup.ts', 'utf8'),
    /writeJson\(ULTIMA_COPIA/,
    'registrarCopia é quem grava o selo',
  );

  // E o caminho AUTOMÁTICO tem de anotar: era ele que não anotava.
  assert.match(
    readFileSync('src/nuvem/aparelho.ts', 'utf8'),
    /registrarCopia\(/,
    'a cópia automática anota que aconteceu',
  );
});

test('a régua do selo distingue quem grava de quem só menciona', () => {
  assert.deepEqual(
    escrevemOSelo([{ arquivo: 'app/backup.tsx', texto: 'await writeJson(ULTIMA_COPIA, {' }]),
    ['app/backup.tsx'],
  );
  assert.deepEqual(
    escrevemOSelo([{ arquivo: 'src/data/backup.ts', texto: 'await writeJson(ULTIMA_COPIA, {' }]),
    [],
    'o dono do selo não é achado',
  );
  // A prosa não é escrita — a mesma pedra em que três detectores desta casa já
  // tropeçaram, e o comentário sobre `ULTIMA_COPIA` continua vivo em app/backup.tsx.
  assert.deepEqual(
    escrevemOSelo([
      { arquivo: 'app/backup.tsx', texto: '// `ULTIMA_COPIA` mora no aparelho, e writeJson(ULTIMA_COPIA) seria mentira' },
    ]),
    [],
  );
});

/**
 * Toda escrita no razão que uma tela dispara tem `catch` — e a frase é da CASA.
 *
 * Duas metades do mesmo defeito, contadas pela auditoria de 9 de setembro. Três
 * escritas não tinham `catch` nenhum: o toque não gravava e a tela ficava igual, e a
 * pessoa toca de novo e depois desiste. Nove imprimiam `e.message` — a frase do
 * programador, em inglês, sobre um banco de dados, para quem está de luva na câmara
 * fria.
 *
 * As duas pioraram no mesmo dia em que os sete escritores ganharam portão: agora
 * QUALQUER escrita pode recusar por permissão, e uma recusa que chega como
 * `sem manage_company: apagar o livro da empresa` é uma recusa que ninguém entende.
 */
export function frasesCruas(fontes: readonly { arquivo: string; texto: string }[]): string[] {
  return fontes
    .filter((f) => /instanceof Error \? \w+\.message :/.test(semProsa(f.texto)))
    .map((f) => f.arquivo);
}

test('nenhuma tela imprime a mensagem do erro', () => {
  const fontes = sourcesUnder('app').map((arquivo) => ({
    arquivo,
    texto: readFileSync(arquivo, 'utf8'),
  }));

  assert.deepEqual(
    frasesCruas(fontes),
    [],
    'estas telas mostram a frase do programador — `avisoDeFalha` existe para isso',
  );
});

test('a régua da frase crua distingue mostrar de registrar', () => {
  // Positivo: a forma exata que estava em nove telas.
  assert.deepEqual(
    frasesCruas([
      { arquivo: 'app/purchase.tsx', texto: 'message: e instanceof Error ? e.message : String(e),' },
    ]),
    ['app/purchase.tsx'],
  );

  // Negativo 1: o conserto.
  assert.deepEqual(
    frasesCruas([{ arquivo: 'app/purchase.tsx', texto: 'message: avisoDeFalha(e, t, ERROS).message,' }]),
    [],
  );

  // Negativo 2: a prosa. Um comentário citando a forma não é a forma — e três
  // detectores desta casa já tropeçaram exatamente nisso.
  assert.deepEqual(
    frasesCruas([
      { arquivo: 'app/x.tsx', texto: '// antes: e instanceof Error ? e.message : String(e)' },
    ]),
    [],
  );
});

/**
 * Toda carga diz de QUAL LOTE ela sai.
 *
 * A transferência deduzia o lote desde 3 de setembro — quem despacha não escolhe,
 * despacha o que vence primeiro — e a separação, que nasceu depois e é a porta que a
 * aba de transporte oferece primeiro, mandava nulo. O saldo de lote da fábrica então
 * só sobe: um lote que já viajou continua parecendo estar aqui, e a carga seguinte
 * estampa o código errado na etiqueta. Num recall isso é a diferença entre saber
 * qual loja recebeu e não saber.
 *
 * Nulo continua sendo resposta válida e frequente — açúcar e palito não têm lote —,
 * então o que a guarda cobra é a PERGUNTA, não um valor.
 */
export function cargaSemLote(fontes: readonly { arquivo: string; texto: string }[]): string[] {
  const achados: string[] = [];
  for (const f of fontes) {
    const texto = semProsa(f.texto);
    for (const m of texto.matchAll(/\brecordTransfer\(/g)) {
      const args = argumentos(texto, (m.index ?? 0) + 'recordTransfer('.length);
      if (args === null) continue;
      if (args.some((a) => /\blotId\b/.test(a))) continue;

      // O objeto pode chegar por VARIÁVEL — é o que a tela de transferência faz, e
      // exigir o literal acusaria quem obedeceu. Então segue-se o nome: se ele é
      // montado neste arquivo e a montagem diz `lotId`, a pergunta foi feita.
      const nome = args[args.length - 1]?.trim();
      if (nome && /^[A-Za-z_$][\w$]*$/.test(nome)) {
        const montagem = new RegExp(`\\b(?:const|let|var)\\s+${nome}\\s*=\\s*\\{[^}]*\\blotId\\b`, 's');
        if (montagem.test(texto)) continue;
      }
      achados.push(f.arquivo);
    }
  }
  return achados;
}

test('nenhuma tela manda carga sem dizer de qual lote', () => {
  const fontes = sourcesUnder('app').map((arquivo) => ({
    arquivo,
    texto: readFileSync(arquivo, 'utf8'),
  }));

  assert.deepEqual(
    cargaSemLote(fontes),
    [],
    'estas telas despacham sem lote, e o saldo de lote da fábrica passa a só subir',
  );
});

test('a régua do lote distingue quem pergunta de quem não pergunta', () => {
  assert.deepEqual(
    cargaSemLote([
      { arquivo: 'app/picking.tsx', texto: 'recordTransfer(co, { itemId, baseUnits, carrierId })' },
    ]),
    ['app/picking.tsx'],
  );
  assert.deepEqual(
    cargaSemLote([
      {
        arquivo: 'app/picking.tsx',
        texto: 'recordTransfer(co, { itemId, baseUnits, lotId: lotes[0]?.lotId ?? null })',
      },
    ]),
    [],
    'nulo é resposta — o que se cobra é a pergunta',
  );
  assert.deepEqual(
    cargaSemLote([{ arquivo: 'app/x.tsx', texto: '// recordTransfer(co, { itemId })' }]),
    [],
    'comentário não é chamada',
  );

  // E a forma por VARIÁVEL, que é como a tela de transferência escreve. Sem isto a
  // guarda acusaria quem obedeceu — o defeito que já ensinou esta casa a desligar
  // guarda uma vez.
  assert.deepEqual(
    cargaSemLote([
      {
        arquivo: 'app/transfer.tsx',
        texto: 'const comum = { itemId, lotId: frente?.lotId ?? null };\nrecordTransfer(co, comum);',
      },
    ]),
    [],
    'o objeto montado com lotId conta, venha ele por literal ou por nome',
  );
  assert.deepEqual(
    cargaSemLote([
      { arquivo: 'app/transfer.tsx', texto: 'const comum = { itemId };\nrecordTransfer(co, comum);' },
    ]),
    ['app/transfer.tsx'],
    'e a variável SEM lote continua sendo achado',
  );
});

/**
 * Nenhum componente desbota a MASSA e a TINTA juntas — e o botão era o culpado.
 *
 * `opacity` num controle preenchido compõe o fundo e o rótulo sobre a página ao
 * mesmo tempo: os dois caminham na direção da cor de fundo e o contraste entre
 * eles desaba, enquanto a régua de contraste continua verde porque mede a cor
 * CHEIA, que não está na tela. A foto de 9 de setembro pegou: "Criar ficha" em
 * branco sobre bege claro, num botão que só estava desabilitado.
 *
 * A régua de `contrast.test.ts` mede a aritmética do conserto e passaria igual
 * com o `Button` revertido — duas coisas escritas pela mesma mão. Esta amarra as
 * duas: quem desliga um controle desbota o PREENCHIMENTO (`mistura`) e mede a
 * tinta depois; ninguém volta a desbotar o conjunto.
 */
export function desbotamOConjunto(fontes: readonly { arquivo: string; texto: string }[]): string[] {
  return fontes
    .filter((f) => /opacity:\s*disabled/.test(semProsa(f.texto)))
    .map((f) => f.arquivo);
}

test('nenhum controle desliga desbotando a massa e a tinta juntas', () => {
  const fontes = [...sourcesUnder('app'), ...sourcesUnder('src')].map((arquivo) => ({
    arquivo,
    texto: readFileSync(arquivo, 'utf8'),
  }));

  assert.deepEqual(
    desbotamOConjunto(fontes),
    [],
    'estes desbotam o controle inteiro: o rótulo some junto com a cor, e a régua de\n' +
      'contraste não vê porque mede a cor cheia. Desbote o preenchimento e meça a tinta.',
  );

  // Positivo: o botão PRECISA continuar medindo a tinta contra o fundo desbotado.
  // Sem isto, apagar o conserto deixaria a guarda de cima verde por vacuidade.
  const botao = readFileSync('src/components/Button.tsx', 'utf8');
  assert.match(botao, /mistura\(preenchimento/, 'o preenchimento desligado é uma mistura');
  assert.match(botao, /tintaSobre\(fundoDaAcao/, 'a tinta é medida contra o fundo que aparece');
});

test('a régua do desbotamento distingue quem apaga o rótulo de quem desbota a cor', () => {
  assert.deepEqual(
    desbotamOConjunto([{ arquivo: 'src/components/X.tsx', texto: 'style={{ opacity: disabled ? 0.45 : 1 }}' }]),
    ['src/components/X.tsx'],
    'desbotar o conjunto tem de ser pego',
  );
  assert.deepEqual(
    desbotamOConjunto([
      { arquivo: 'src/components/Y.tsx', texto: 'const fundo = disabled ? mistura(cheio, paper, 0.35) : cheio;' },
    ]),
    [],
    'desbotar só o preenchimento é o jeito certo e não pode ser acusado',
  );
});

/**
 * TODA espécie de item tem uma porta de toque — e faltava uma.
 *
 * `recordLoss` e `recordCount` têm um chamador de tela cada, `app/inputs/[id].tsx`,
 * e por muito tempo a única porta para lá foi a lista do almoxarifado, cujas abas
 * são insumo, embalagem e material de loja. **Produto acabado e revenda não
 * tinham porta nenhuma**: a linha da lista de produtos abria a RECEITA — o como se
 * faz, não o quanto tem — e a de revenda não abria nada. Três dos cinco motivos de
 * perda (derreteu, quebrou, cortesia) existem só para o picolé pronto, e não havia
 * por onde lançá-los. O dicionário e a lista de permissões descreviam uma tela que
 * ninguém alcançava.
 *
 * A guarda deriva as espécies de DUAS fontes que não são esta edição: a união
 * `ItemKind` do `repository.ts` e as abas declaradas na lista do almoxarifado. Se
 * amanhã nascer uma sexta espécie, ela fica vermelha até alguém dizer por onde se
 * chega nela.
 */
function especiesDoTipo(): string[] {
  const fonte = readFileSync('src/data/repository.ts', 'utf8');
  const m = fonte.match(/export type ItemKind =([^;]+);/);
  assert.ok(m, 'a união ItemKind mudou de forma — a derivação precisa acompanhar');
  return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

function especiesDoAlmoxarifado(): string[] {
  const fonte = readFileSync('app/inputs/index.tsx', 'utf8');
  const m = fonte.match(/const TABS:[\s\S]*?\n\];/);
  assert.ok(m, 'as abas do almoxarifado mudaram de forma');
  return [...m![0].matchAll(/kind: '([a-z_]+)'/g)].map((x) => x[1]);
}

test('toda espécie de item tem por onde ser contada e ter perda lançada', () => {
  const todas = especiesDoTipo();
  const noAlmoxarifado = especiesDoAlmoxarifado();
  // O que sobra tem de ser exatamente o que a lista de PRODUTOS cobre.
  const sobra = todas.filter((k) => !noAlmoxarifado.includes(k));
  assert.deepEqual(
    sobra.sort(),
    ['product', 'resale'],
    'espécie sem lista: ela não aparece no almoxarifado nem em produtos, então\n' +
      'ninguém consegue contá-la nem lançar perda dela.',
  );

  // E as duas listas abrem a MESMA tela, que é a que grava.
  for (const arquivo of ['app/inputs/index.tsx', 'app/products/index.tsx']) {
    assert.match(
      semProsa(readFileSync(arquivo, 'utf8')),
      /router\.push\(\s*`\/inputs\/\$\{/,
      `${arquivo} tem de abrir a ficha do item — é lá que a contagem e a perda são gravadas`,
    );
  }

  const tela = readFileSync('app/inputs/[id].tsx', 'utf8');
  assert.match(tela, /await recordCount\(/, 'a ficha do item grava a contagem');
  assert.match(tela, /await recordLoss\(/, 'a ficha do item grava a perda');
});

test('a régua da cobertura lê as duas fontes e não uma lista escrita à mão', () => {
  // Caso verdadeiro: as cinco espécies do tipo aparecem, e três vêm das abas.
  assert.deepEqual(especiesDoTipo().sort(), ['input', 'packaging', 'product', 'resale', 'store_supply']);
  assert.deepEqual(especiesDoAlmoxarifado().sort(), ['input', 'packaging', 'store_supply']);
  // Caso falso: as duas derivações não podem devolver a mesma coisa, senão a
  // subtração acima seria vazia e o teste passaria sem medir nada.
  assert.notDeepEqual(especiesDoTipo().sort(), especiesDoAlmoxarifado().sort());
});

/**
 * Quem CRIA uma loja diz que unidade a atende.
 *
 * Irmã da guarda "every screen that creates a room says which unit", e nasceu do
 * mesmo defeito visto do outro lado: a sala sem pai sai do SALDO da unidade; a loja
 * sem quem a atenda entra na DEMANDA de todas elas. Com duas fábricas, as duas leem
 * "faltam 300" para o mesmo pedido, as duas produzem, e a fábrica faz o dobro.
 *
 * As duas relações são diferentes e por isso são duas colunas — a sala fica DENTRO
 * da unidade, a loja é ATENDIDA por ela — e por isso são duas guardas: uma tela que
 * passa `parentLocationId` e esquece `servedByLocationId` cria uma loja muda com o
 * compilador verde, porque `savePlace` aceita os dois como opcionais e trata ausente
 * como "não mexa".
 *
 * A fronteira é a mesma da irmã: só a CRIAÇÃO, reconhecida por não passar `id`.
 * Renomear uma loja não pode exigir repetir de quem ela vem — e não pode apagar a
 * resposta, que é o que o `ON CONFLICT` faria se `savePlace` não tratasse ausente
 * como preservação.
 */
export function criamLojaSemQuemAtende(
  fontes: readonly { arquivo: string; texto: string }[],
): string[] {
  const mudos: string[] = [];
  for (const f of fontes) {
    const texto = code(f.texto);
    for (const m of texto.matchAll(/\bsavePlace\s*\(/g)) {
      const args = argumentos(texto, m.index + m[0].length);
      if (!args) continue;
      const corpo = args.join(' , ');
      const cria = !/\bid\s*:/.test(corpo);
      if (cria && !/servedByLocationId/.test(corpo)) mudos.push(`${f.arquivo}: savePlace()`);
    }
  }
  return mudos;
}

test('every screen that creates a store says which unit serves it', () => {
  const fontes = sourcesUnder('app').map((arquivo) => ({
    arquivo,
    texto: readFileSync(arquivo, 'utf8'),
  }));
  assert.deepEqual(
    criamLojaSemQuemAtende(fontes),
    [],
    'estas telas criam lugar sem dizer quem o atende — com duas unidades, as duas leem\n' +
      'o mesmo pedido e as duas produzem.',
  );
});

test('the served-by guard tells creating from updating', () => {
  // O caso verdadeiro: a criação como ela estava antes da 0050.
  assert.deepEqual(
    criamLojaSemQuemAtende([
      { arquivo: 'app/x.tsx', texto: 'await savePlace(empresaDaqui(), { name, kind, parentLocationId: unidadeDaqui() });' },
    ]),
    ['app/x.tsx: savePlace()'],
    'a criação muda tem de ser pega mesmo com o pai declarado',
  );
  // E os dois que não podem ser acusados: o conserto, e a ATUALIZAÇÃO.
  assert.deepEqual(
    criamLojaSemQuemAtende([
      { arquivo: 'app/y.tsx', texto: 'await savePlace(co, { name, kind, parentLocationId: u, servedByLocationId: a });' },
      { arquivo: 'app/z.tsx', texto: 'await savePlace(co, { id: place.id, name, kind });' },
    ]),
    [],
    'o conserto e a atualização não podem reprovar',
  );
});
