import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ptBR } from './i18n/locales/pt-BR';

/**
 * O e2e procura a tela pelo texto, e o texto vem do dicionário.
 *
 * **A cicatriz.** Um rótulo foi renomeado — `howMany` deixou de ser "Quantas
 * {{pack}}", que saía como "QUANTAS SACO 25 KG", e virou "Quantidade, em
 * {{pack}}" — e três checagens do e2e continuaram procurando `/Quantas/`. Elas
 * não falham na hora: esperam trinta segundos por um campo que não existe mais e
 * o CI fica vermelho vinte minutos depois, num navegador, por causa de uma
 * palavra trocada num arquivo de tradução.
 *
 * A distância entre a causa e o sintoma é o problema. Renomear um rótulo é uma
 * linha; descobrir por que o navegador não achou o campo é uma execução inteira
 * da suíte. E o portão de entrega não pega: o `verify.sh` roda tipo, lint e
 * unidade, e o e2e não está nele.
 *
 * Esta guarda fecha a distância. Ela lê os seletores do e2e e exige que cada um
 * ainda case com alguma frase do dicionário — em milissegundos, no `npm test`.
 * Não prova que a tela mostra aquele texto (isso é trabalho do navegador); prova
 * que o texto que o e2e procura **existe no aplicativo**, que é exatamente o que
 * deixa de ser verdade quando alguém renomeia uma chave.
 *
 * Só o pt-BR: é o idioma em que a suíte dirige o aplicativo.
 */

/** Toda frase que o dicionário pode pôr na tela, achatada. */
function frases(node: unknown, into: string[] = []): string[] {
  if (typeof node === 'string') into.push(node);
  else if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) frases(value, into);
  }
  return into;
}

const DICIONARIO = frases(ptBR);

// A contagem antes da comparação, e ela é cicatriz DESTA guarda.
//
// O import começou como `default`, o dicionário chegou indefinido, e a lista de
// frases ficou vazia — então toda comparação era falsa e o primeiro seletor da
// lista levava a culpa por um erro que não era dele. Uma guarda que reprova pelo
// motivo errado é pior que guarda nenhuma: manda consertar o lugar errado.
if (DICIONARIO.length < 100) {
  throw new Error(
    `o dicionário chegou com ${DICIONARIO.length} frases — esta guarda compara contra ele, ` +
      'e comparar contra uma lista vazia reprova tudo pelo motivo errado.',
  );
}

/**
 * O texto sem os marcadores de preenchimento.
 *
 * "Quantidade, em {{pack}}" chega na tela como "Quantidade, em saco 25 kg", e um
 * seletor que procura a parte fixa tem que casar. Trocar o marcador por vazio é
 * o suficiente: quem procura a parte variável já não estaria testando o
 * dicionário.
 */
const semMarcador = DICIONARIO.map((f) => f.replace(/\{\{\w+\}\}/g, ''));

const FONTE = readFileSync('e2e/flow.mjs', 'utf8');

/**
 * O que este arquivo NÃO pode conferir, dito por extenso em vez de omitido.
 *
 * Texto que a tela monta (nome de insumo semeado, código de lote, número) não
 * mora no dicionário e nunca vai casar. Cada linha aqui é uma renúncia
 * consciente, com o motivo — a alternativa é a guarda ficar vermelha por design
 * e alguém desligá-la.
 */
const NAO_E_DICIONARIO: Record<string, string> = {
  'Picolé de morango': 'nome de produto do exemplo semeado, não frase de tela',
  'Açúcar cristal': 'nome de insumo do exemplo semeado, não frase de tela',
  'Polpa de morango': 'nome de insumo do exemplo semeado, não frase de tela',
  'Apagar Produtos': 'rótulo de acessibilidade montado com o nome da área pela tela',
  'Loja Centro':
    'nome de loja que a própria checagem cadastra antes de tocar nele — como o sabor Uva acima. Nome de lugar é dado da fábrica, não frase de tela: traduzi-lo seria traduzir o nome do cliente de alguém',
  'Loja Norte':
    'a segunda loja da checagem de reserva — ela existe para a carga ter para onde ir que não seja quem espera',
  'Loja do Lote':
    'a loja que a checagem do lote deduzido cadastra antes de tocar nela — ela precisa de destino próprio porque o que se mede é a carga que NINGUÉM escolheu, e reusar uma loja com hábito já formado preencheria o item por palpite',
  Ana:
    'nome de pessoa que a própria checagem cadastra antes de tocar nele — nome de gente é dado da fábrica, não frase de tela, pelo mesmo motivo que nome de loja',
  Uva: 'sabor que a própria checagem cadastra antes de tocar nele',
  'Dona Ana':
    'nome de pessoa que a checagem da grade cadastra antes de tocar nele — e ela precisa cadastrar, porque o exemplo semeado NÃO semeia gente: era por isso que a versão anterior tocava no botão do estado vazio e passava sem tocar em nome nenhum',
  'Transportes Silva':
    'nome de transportadora que a própria checagem cadastra antes de tocar nele — nome de empresa de fora é dado da fábrica, não frase de tela, pelo mesmo motivo que nome de loja e de gente',
  Coco:
    'o sabor da checagem do preço de tabela — ela precisa de classificação PRÓPRIA, porque o índice único da grade é `nulls not distinct` e o exemplo semeado já ocupa a casa vazia',
  'Picolé de Uva': 'nome composto pela grade — linha, tipo e sabor — e não escrito em lugar nenhum',
  // As cinco abaixo escapavam da guarda até 8 de setembro: o extrator não enxergava
  // `getByLabel('X', { exact: true })`. Nenhuma é defeito — são dado do exemplo semeado,
  // nome que a própria checagem digita, e um número que a tela calcula. O que muda é que
  // agora elas estão DITAS, em vez de invisíveis.
  'Palito de picolé': 'nome de insumo do exemplo semeado, não frase de tela',
  'Glucose 38DE': 'nome de insumo do exemplo semeado, não frase de tela',
  'Galpão 2':
    'o nome que a checagem do renomear digita na sala padrão — nome de lugar é dado da fábrica, não frase de tela',
  'R$ 1.552,50':
    'valor CALCULADO pela tela a partir do razão. O dicionário tem o formato do dinheiro, nunca o número: uma frase que dissesse "R$ 1.552,50" seria um total chumbado, que é o defeito oposto',
  'De qual sala sai: Câmara 1':
    'rótulo de acessibilidade montado pela tela: a pergunta do dicionário mais o nome da sala. Ele existe justamente porque o nome sozinho aparecia DUAS vezes na mesma tela — na lista das nossas salas e na de destinos — e quem usa TalkBack ouviria dois botões idênticos sem saber o que cada um decide',
  'Câmara 1':
    'nome de sala que a própria checagem cadastra antes de tocar nele — nome de lugar é dado da fábrica, não frase de tela, pelo mesmo motivo que Loja Centro',
  máxima: 'metade de um rótulo composto na tela do lugar',
  mínima: 'metade de um rótulo composto na tela do lugar',
  '^\\d{8}-\\d{2}$': 'o formato do código do lote, gerado pelo domínio e não traduzido',
  '^Tempo: (Esconder|Mostrar)$':
    'rótulo de acessibilidade montado pela capa com o nome da peça mais a ação',
  // A entrada de `Pedidos dos clientes` saiu em 9 de setembro, e a saída dela é o que
  // esta guarda existe para forçar: o dono mandou a peça para o padrão, a checagem do
  // navegador parou de ligá-la, e a renúncia ficou aqui apontando para um seletor que
  // ninguém mais usa. Lista de exceção que só cresce vira lista que ninguém lê.
  '^Colocar na capa: Últimas corridas$':
    'idem — e vale notar que o `e2e` passa com estas duas: o rótulo existe na tela, montado pelo prefixo mais o nome da peça. Quem não o enxerga é esta guarda, que compara com frases INTEIRAS do dicionário; é exatamente para isso que esta lista existe',
  '^Colocar na capa: Preços que mexeram$':
    'o mesmo caso, do outro lado da lista: peça que está FORA da capa tem "Colocar na capa" e não "Esconder/Mostrar". As duas metades existem no dicionário e a tela as junta — e errar qual das duas listas a peça está custa trinta segundos de espera por um alvo que não existe, com o Playwright dizendo "timeout" em vez de "seletor inventado"',
  '^Colocar na capa: Insumo acabando$':
    'a terceira da mesma família, e ela entra porque a checagem da lista de comprar hoje PRECISA ligar esta peça: com a capa padrão a porta do insumo acabando não existe, e os dois plantios daquela checagem passaram justamente por isso — o ramo nunca rodava. Ligar a peça é a montagem do estado, não preferência medida',
  English:
    'nome de idioma escrito NA língua dele, de propósito: quem procura o próprio idioma numa lista o reconhece escrito como ele se escreve, e não precisa saber ler o idioma atual para achar o seu. Por isso não passa pelo dicionário — traduzir "English" para "Inglês" esconderia a palavra de quem só lê inglês',
};

/**
 * Os seletores literais: o texto tem que existir igual.
 *
 * **O `{ exact: true }` é opcional nas DUAS formas, e não era.** A versão anterior lia
 * `getByText('X', { exact: true })` e `getByLabel('X')`, e nada mais — então
 * `getByLabel('X', { exact: true })` passava invisível. Achado em 8 de setembro pela
 * guarda irmã: eu acrescentei uma renúncia para um texto que o `e2e` usa nessa forma, e
 * a guarda das renúncias disse que ninguém o usava. Uma delas estava errada, e era esta.
 *
 * O buraco importa porque `getByLabel` **sem** `exact` casa por substring: o dia em que
 * alguém precisar de exatidão num rótulo — que é justamente o dia em que dois rótulos se
 * parecem — o seletor sai do alcance da guarda, que é quando ela mais faria falta.
 */
const LITERAIS = [
  ...FONTE.matchAll(/getBy(?:Text|Label)\('((?:[^'\\]|\\.)+)'(?:, \{ exact: true \})?\)/g),
].map((m) => m[1].replace(/\\'/g, "'"));

/** Os seletores por expressão: alguma frase do dicionário tem que casar. */
const EXPRESSOES = [...FONTE.matchAll(/getBy(?:Label|Text)\(\/((?:[^/\\]|\\.)+)\/\)/g)].map(
  (m) => m[1],
);

/**
 * Todos de uma vez, e não o primeiro.
 *
 * `assert` para no primeiro, e quem renomeia uma chave costuma quebrar três
 * seletores juntos — foi exatamente o caso da cicatriz. Uma execução tem que
 * mostrar a lista inteira, senão o conserto vira três rodadas.
 */
test('every literal the e2e clicks on still exists in the dictionary', () => {
  assert.ok(LITERAIS.length > 20, 'o extrator de seletores parou de achar seletores');

  const orfaos = LITERAIS.filter(
    (texto) =>
      !NAO_E_DICIONARIO[texto] && !semMarcador.some((f) => f === texto || f.includes(texto)),
  );

  assert.deepEqual(
    orfaos,
    [],
    `o e2e toca nestes textos e nenhuma frase do dicionário diz isso: ${orfaos.join(' · ')}. ` +
      'Ou a chave foi renomeada e o seletor ficou para trás — que é o defeito que esta ' +
      'guarda existe para pegar, e que custou um CI vermelho de vinte minutos — ou o texto ' +
      'é montado pela tela, e aí a linha entra em NAO_E_DICIONARIO com o motivo.',
  );
});

test('every pattern the e2e searches for still matches something the app can say', () => {
  assert.ok(EXPRESSOES.length > 5, 'o extrator de expressões parou de achar expressões');

  const orfaos = EXPRESSOES.filter(
    (fonte) => !NAO_E_DICIONARIO[fonte] && !semMarcador.some((f) => new RegExp(fonte).test(f)),
  );

  assert.deepEqual(
    orfaos,
    [],
    `o e2e procura por estas expressões e nenhuma frase do dicionário casa: ` +
      `${orfaos.map((f) => `/${f}/`).join(' · ')}. Um seletor que não casa não falha rápido: ` +
      'ele espera trinta segundos e reprova no navegador, longe da linha que o quebrou.',
  );
});

test('the exceptions list only holds exceptions that are still used', () => {
  for (const texto of Object.keys(NAO_E_DICIONARIO)) {
    assert.ok(
      LITERAIS.includes(texto) || EXPRESSOES.includes(texto),
      `"${texto}" está na lista de renúncias e o e2e não o usa mais — tire a linha.`,
    );
    assert.ok(
      NAO_E_DICIONARIO[texto].length > 20,
      `"${texto}": a renúncia precisa de um motivo escrito, não de um lugar na lista.`,
    );
  }
});

/**
 * Espera longa de relógio, nos arquivos que dirigem o navegador.
 *
 * Duas vezes no mesmo dia a mesma linha me custou uma rodada: `waitForTimeout(9000)`
 * depois de clicar em "Plantar". Nove segundos bastavam quando a semeadura era uma
 * quinzena, e deixaram de bastar quando ela virou três meses — no `shot.mjs` isso
 * produziu a foto de uma fábrica pela metade que eu diagnostiquei como defeito da
 * simulação, e no `flow.mjs` a checagem estourou esperando um botão que ia aparecer
 * dez segundos depois.
 *
 * A régua é de cinco segundos porque ela separa duas coisas diferentes. Abaixo
 * disso é espera de QUADRO: a tela precisa de um instante para desenhar, e o número
 * é uma folga sobre uma animação cuja duração o próprio aplicativo escolhe. Acima,
 * é espera de TRABALHO — e a duração do trabalho depende da máquina de quem roda,
 * do tamanho do dado e do dia. Aí a espera tem de ser por um FATO na tela.
 *
 * Não vale para as ~250 esperas curtas: convertê-las todas seria uma reescrita de
 * risco alto para um defeito que nunca apareceu.
 */
test('the clock guard goes red with the defect in front of it', () => {
  // A régua conferida contra o defeito real, com a linha que ela existe para pegar.
  // Guarda que nunca ficou vermelha com o defeito na frente foi acreditada, não
  // verificada — é a lição da entrada de 5 de setembro do docs/insights.md.
  const achar = (texto: string) =>
    texto
      .split('\n')
      .filter((l) => {
        const m = /waitForTimeout\(\s*([\d_]+)/.exec(l);
        return m !== null && Number(m[1].replace(/_/g, '')) >= 5000;
      });
  assert.equal(achar('  await page.waitForTimeout(9000);').length, 1, 'o defeito real');
  assert.equal(achar('  await page.waitForTimeout(240_000);').length, 1, 'com sublinhado também');
  assert.equal(achar('  await page.waitForTimeout(3500);').length, 0, 'espera de quadro passa');
});

test('nothing waits on the clock for work whose length depends on the machine', () => {
  const arquivos = ['e2e/flow.mjs', 'scripts/shot.mjs'];
  const longas: string[] = [];
  for (const arquivo of arquivos) {
    readFileSync(arquivo, 'utf8')
      .split('\n')
      .forEach((linha, i) => {
        const m = /waitForTimeout\(\s*([\d_]+)/.exec(linha);
        if (m && Number(m[1].replace(/_/g, '')) >= 5000) {
          longas.push(`${arquivo}:${i + 1}: espera ${m[1]} ms de relógio`);
        }
      });
  }
  assert.deepEqual(
    longas,
    [],
    `estas esperas são de TRABALHO, não de quadro:\n  ${longas.join('\n  ')}\n` +
      'Espere o fato que a tela mostra quando termina (`getByText(...).waitFor({ timeout })`), ' +
      'não um número de segundos: o número é uma afirmação sobre a máquina de quem roda, e ' +
      'ela envelhece sozinha.',
  );
});

/**
 * Checagem registrada DEPOIS do corredor não existe — e o silêncio dela é total.
 *
 * **A cicatriz é de 7 de setembro, à noite.** Acrescentei a checagem da
 * transportadora no fim do `e2e/flow.mjs` e ela nunca rodou: o corredor é um bloco
 * `try` que fica ANTES do fim do arquivo, então `check()` chamado depois dele
 * registra numa lista que já foi percorrida. A suíte imprimiu `51/51` e ninguém
 * notou a 52ª faltando; com `--only` ela devolveu `0/0 passaram`, que é a guarda do
 * próprio arquivo falando — e foi ela que me contou.
 *
 * Aqui a régua é de POSIÇÃO: toda chamada de `check(` tem de estar antes da linha
 * onde o corredor começa. É a única forma de o arquivo não voltar a aceitar uma
 * checagem que não é checagem.
 */
test('nenhuma checagem do e2e é registrada depois do corredor', () => {
  const fonte = readFileSync('e2e/flow.mjs', 'utf8');
  const linhas = fonte.split('\n');
  const corredor = linhas.findIndex((l) => l.startsWith('try {'));
  assert.ok(corredor > 0, 'o corredor do e2e mudou de forma — a guarda deixou de olhar para ele');

  const tardias = linhas
    .map((linha, i) => ({ linha, i }))
    .filter(({ linha, i }) => i > corredor && /^check\(/.test(linha))
    .map(({ i }) => `e2e/flow.mjs:${i + 1}`);

  assert.deepEqual(
    tardias,
    [],
    `estas checagens são registradas depois do corredor e NUNCA rodam:\n  ${tardias.join('\n  ')}\n` +
      'A lista já foi percorrida quando elas chegam. Mova a chamada para antes do `try {`.',
  );
});
