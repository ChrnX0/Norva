import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { currencySymbol, defaultLocale, fill, formatMoney, formatWeekdayShort, plural } from './index';
import { CURRENCIES, formattingFor, isCurrency, localeFrom } from './company';
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

/**
 * Um marcador ERRADO é invisível para tudo — e foi por isso que doze frases chegaram
 * ao portão dizendo `v{version}` na tela.
 *
 * `fill` só conhece `{{palavra}}`, e ele deixa o que não conhece **intacto de
 * propósito** (o teste três abaixo cobra isso: buraco que ninguém preencheu continua
 * visível em vez de virar branco). Então `{version}` de chave única não é erro para
 * ninguém: o TypeScript vê uma string, o lint vê uma string, e a guarda de paridade
 * acima conta ZERO buracos nas três traduções e aprova — as três estavam erradas pela
 * mesma mão, que é a armadilha que este repositório já tem escrita.
 *
 * A régua não procura a chave única: ela **tira todo `{{palavra}}` bem-formado e vê se
 * sobrou chave**. Assim ela pega também `{{version}` sem o par, `{{ version }}` com
 * espaço e `{{}}` vazio — as formas que a paridade também não vê, porque nenhuma delas
 * é um buraco.
 *
 * Medida antes de entrar, contra o dicionário de verdade: acusou as **doze** frases da
 * rodada do carimbo e **nenhuma** das outras **3.577** — 3.589 frases nos três idiomas —, que é
 * o caso falso de que a régua precisa para valer, e ele é o corpo inteiro em vez de um exemplo
 * escrito por mim.
 */
test('todo marcador do dicionário é um marcador que `fill` preenche', () => {
  const soltas: string[] = [];
  for (const [language, dictionary] of [
    ['pt-BR', ptBR],
    ['en', en],
    ['es', es],
  ] as const) {
    for (const [path, frase] of leaves(dictionary as unknown as Node)) {
      const sobra = frase.replace(/\{\{\w+\}\}/g, '');
      if (sobra.includes('{') || sobra.includes('}')) {
        soltas.push(`${language}: "${path}" = "${frase}"`);
      }
    }
  }
  assert.deepEqual(
    soltas,
    [],
    'chave solta numa frase do dicionário: `fill` só troca {{palavra}}, então isto vai para a ' +
      'tela do jeito que está escrito. Se a chave é um marcador, ponha as duas chaves; se é ' +
      `texto de verdade, esta guarda é o lugar de dizer por quê.\n  ${soltas.join('\n  ')}`,
  );
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

  // E o singular que escreve o número por extenso de propósito continua dono da
  // própria frase: prefixar ali dá "em 1 um tacho", que foi o que o e2e pegou
  // quando esta regra olhava a forma escolhida em vez da entrada inteira.
  const tachos = { one: 'um tacho', other: '{{n}} tachos' };
  assert.equal(plural(1, tachos, '1'), 'um tacho');
  assert.equal(plural(2, tachos, '2'), '2 tachos');

  // Sem número para mostrar, nada muda.
  assert.equal(plural(2, { one: 'unidade', other: 'unidades' }), 'unidades');
});

test('a hole nobody filled stays visible instead of becoming a blank', () => {
  // Some com o valor e a frase vira "Ontem foram ." - um erro que parece texto.
  assert.equal(fill('Ontem foram {{amount}}.', {}), 'Ontem foram {{amount}}.');
  assert.equal(fill('Ontem foram {{amount}}.', { amount: '300' }), 'Ontem foram 300.');
  assert.equal(defaultLocale.language, 'pt-BR');
});

test('the weekday name matches the number the platform uses', () => {
  // Se esta tabela andar um dia, a loja de terça passa a receber na quarta e
  // nada mais no app acusa - o número vem de Date.getDay(), e a palavra tem
  // que vir do mesmo lugar.
  const domingo = new Date(Date.UTC(2026, 8, 6));
  assert.equal(domingo.getUTCDay(), 0, 'a data de referência é um domingo');

  for (let dia = 0; dia < 7; dia += 1) {
    const esperado = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 8, 6 + dia)));
    assert.equal(formatWeekdayShort(dia, defaultLocale), esperado);
  }
});


/**
 * A moeda decide o formato, e é por isso que ela é pergunta separada do idioma.
 *
 * Espanhol escreve `1.234,56` na Espanha e `1,234.56` no México — o mesmo idioma,
 * o ponto e a vírgula trocados de lugar. Um número de dinheiro lido ao contrário é a
 * pior classe de erro que este aplicativo pode cometer: mil e duzentos lidos como um
 * e vinte e três muda uma decisão de compra.
 */
test('the currency decides the region, so the same amount reads right in each place', () => {
  assert.equal(formattingFor('pt-BR', 'BRL'), 'pt-BR');
  // Português não muda de formato com a moeda: a fábrica que cobra em dólar e lê em
  // português continua escrevendo número como o Brasil escreve.
  assert.equal(formattingFor('pt-BR', 'USD'), 'pt-BR');
  assert.equal(formattingFor('es', 'MXN'), 'es-MX');
  assert.equal(formattingFor('es', 'EUR'), 'es-ES');
  assert.equal(formattingFor('en', 'USD'), 'en-US');
  // Moeda fora da lista cai no idioma sozinho, que é sempre uma tag válida: pior
  // formato, nunca erro.
  assert.equal(formattingFor('es', 'JPY'), 'es');

  // E a prova de que isso importa: a mesma quantia, duas escritas.
  //
  // Cinco dígitos de propósito: o espanhol da Espanha não agrupa milhar abaixo de
  // dez mil, então `1234,56` sai sem separador nenhum e as duas escritas só se
  // separam a partir de `12.345,67`. Uma asserção com quatro dígitos passaria a
  // dizer que o formato não muda — que é o contrário do que este teste existe para
  // provar.
  const mexico = formatMoney(1234567, {
    language: 'es',
    currency: 'MXN',
    formatting: 'es-MX',
    timeZone: 'America/Mexico_City',
  });
  const espanha = formatMoney(1234567, {
    language: 'es',
    currency: 'EUR',
    formatting: 'es-ES',
    timeZone: 'Europe/Madrid',
  });
  assert.match(mexico, /12,345\.67/, 'no México a vírgula agrupa e o ponto separa o centavo');
  assert.match(espanha, /12\.345,67/, 'na Espanha é o contrário');
});

test('what the drawer holds is never trusted, field by field', () => {
  const padrao = defaultLocale;

  // Vazia: vale o padrão inteiro.
  assert.deepEqual(localeFrom({}, padrao), padrao);

  // Idioma inválido não derruba a moeda, e vice-versa — a gaveta é local e pode
  // vir de uma versão antiga do aplicativo.
  const meio = localeFrom({ language: 'klingon', currency: 'MXN' }, padrao);
  assert.equal(meio.language, 'pt-BR');
  assert.equal(meio.currency, 'MXN');

  const outro = localeFrom({ language: 'es', currency: 'XXX' }, padrao);
  assert.equal(outro.language, 'es');
  assert.equal(outro.currency, 'BRL', 'moeda desconhecida cai no padrão');
  assert.equal(outro.formatting, 'es-BR', 'e o formato acompanha a moeda que valeu, não a pedida');

  // Fuso sem barra não é fuso: "GMT-3" não serve para `Intl`, e um fuso inválido
  // faria a data do lote estourar em vez de sair errada — pior, porque a tela quebra.
  assert.equal(localeFrom({ timeZone: 'GMT-3' }, padrao).timeZone, padrao.timeZone);
  assert.equal(localeFrom({ timeZone: 'America/Manaus' }, padrao).timeZone, 'America/Manaus');
});

test('every currency the app offers has a name in all three languages, and formats', () => {
  assert.ok(CURRENCIES.length >= 4, 'a lista de moedas veio vazia');
  for (const { code, region } of CURRENCIES) {
    assert.ok(isCurrency(code));
    assert.equal(region.length, 2, `${code} sem região de duas letras`);
    for (const [idioma, dicionario] of [['pt-BR', ptBR], ['es', es], ['en', en]] as const) {
      const nome = (dicionario.currency as Record<string, string>)[code];
      assert.ok(nome && nome.length > 2, `${code} sem nome em ${idioma}`);
    }
    // E formata sem estourar em toda combinação oferecida.
    for (const idioma of ['pt-BR', 'es', 'en'] as const) {
      const escrito = formatMoney(123456, {
        language: idioma,
        currency: code,
        formatting: formattingFor(idioma, code),
        timeZone: 'UTC',
      });
      assert.ok(escrito.length > 3, `${code} em ${idioma} saiu como "${escrito}"`);
    }
  }
});

test('the currency symbol comes from the company, never from the screen', () => {
  // Duas telas escreviam `suffix="R$"` na mão — o cadastro de insumo e a nota de
  // compra —, e as duas continuaram escrevendo depois que a moeda virou escolha
  // da empresa e passaram a existir oito. Uma fábrica no México digitava o preço
  // pago num campo marcado em reais.
  //
  // O que engana aqui é que não há erro: o campo aceita o número, a conta fecha,
  // o `formatMoney` do resto da tela sai em pesos. Só o rótulo mente — e rótulo
  // que mente sobre dinheiro é a categoria de defeito que este projeto trata como
  // fundação, não como enfeite.
  const SIMBOLOS = /(?:R\$|US\$|€|£|¥|₡|S\/\.)/;
  const erros: string[] = [];

  const varrer = (dir: string): string[] => {
    const out: string[] = [];
    for (const entrada of readdirSync(dir)) {
      if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) out.push(...varrer(caminho));
      else if (/\.tsx$/.test(entrada)) out.push(caminho);
    }
    return out;
  };

  for (const arquivo of ['app', 'src'].flatMap(varrer)) {
    const fonte = readFileSync(arquivo, 'utf8')
      // Comentário fala de "R$" à vontade: este arquivo mesmo faz isso. Só o que
      // roda conta, e o bloco vira as mesmas quebras de linha que tinha para a
      // contagem não escorregar.
      .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
      .replace(/^([ \t]*)\/\/.*$/gm, '$1');
    fonte.split('\n').forEach((linha, i) => {
      if (SIMBOLOS.test(linha)) {
        erros.push(
          `${arquivo}:${i + 1}: símbolo de moeda escrito na tela. ` +
            'Ele vem de `currencySymbol(locale)` — a moeda é escolha da empresa.',
        );
      }
    });
  }

  assert.deepEqual(erros, [], `\n${erros.join('\n')}\n`);
});

test('the symbol follows the company currency, not the language', () => {
  const peso = { language: 'pt-BR', currency: 'MXN', formatting: 'es-MX', timeZone: 'UTC' } as const;
  const real = { language: 'en', currency: 'BRL', formatting: 'pt-BR', timeZone: 'UTC' } as const;
  assert.notEqual(currencySymbol(peso), 'R$');
  assert.equal(currencySymbol(real), 'R$');
  // Moeda que o ambiente não conhece devolve o código, que é feio e verdadeiro.
  assert.ok(currencySymbol({ ...real, currency: 'XTS' }).length >= 3);
});
