import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { marcarExportado, precisaLimpar } from '../scripts/manifesto.mjs';

/**
 * The app, driven the way a person drives it.
 *
 * This exists because an evening of unit tests said everything was fine while
 * the app in a browser was quietly refusing to save anything: `Alert` is a
 * no-op there, so every confirmation asked a question nobody saw. Two other
 * failures hid in the same blind spot - every route but the home screen opened
 * onto an unseeded database, and one screen mixed two languages.
 *
 * None of those are visible from inside a module. They are only visible from
 * the outside, with a real browser, real storage and real navigation. So the
 * check that found them is now the check that keeps finding them.
 *
 *   npm run e2e
 */

/**
 * O fuso da fábrica desta suíte — e a régua que TODA pergunta sobre "que dia é hoje" usa.
 *
 * Ele era literal dentro do `newContext` e mais nada, e por isso uma checagem perguntou o
 * dia da semana ao relógio do NODE — que neste container é UTC. Entre 00h e 03h UTC os dois
 * discordam: em 13 de setembro, 00h07 UTC, o Node dizia domingo e o navegador (com este fuso)
 * dizia sábado. A checagem cobrou a frase de domingo de uma capa que, certíssima, contava o
 * sábado — e o aplicativo tem essa lição escrita no próprio código, em
 * `app/(tabs)/index.tsx:138`: *"o dia da semana no fuso da FÁBRICA: ler o dia do relógio do
 * aparelho dá o dia errado"*. A checagem escrita para respeitar o domingo do simulador
 * quebrava justamente a regra que ela existe para honrar.
 *
 * Nomeado aqui para que não haja duas fontes: quem monta o navegador e quem pergunta o dia
 * leem a mesma palavra.
 */
const FUSO_DA_FABRICA = 'America/Sao_Paulo';

/**
 * Que dia da semana é hoje PARA A FÁBRICA — a mesma conta de `app/(tabs)/index.tsx`.
 *
 * `en-CA` devolve a data em `AAAA-MM-DD`, e lê-la de volta à meia-noite Z dá o dia da semana
 * daquela data de calendário sem a hora do relógio de ninguém no meio. É a forma exata que a
 * capa usa (`localDate(...)` + `T00:00:00Z` + `getUTCDay`), e é isso que faz as duas
 * concordarem em todas as vinte e quatro horas em vez de vinte e uma.
 */
function diaDaSemanaDaFabrica() {
  const data = new Date().toLocaleDateString('en-CA', { timeZone: FUSO_DA_FABRICA });
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

const PORT = Number(process.env.E2E_PORT ?? 4178);

/**
 * `--only <pedaço do nome>` roda um subconjunto das verificações.
 *
 * Existe porque consertar UMA verificação custava a suíte inteira: quatro
 * minutos de exportação e vinte e três navegações para ver uma linha mudar. O
 * ciclo longo é o que faz alguém "consertar" pelo raciocínio em vez de rodar.
 *
 * Com filtro, a linha final DIZ que foi filtrada, e um filtro que não casa com
 * nada falha em vez de imprimir "0/0 passaram" - que é a forma de todo defeito
 * silencioso deste arquivo: um mecanismo relatando sucesso sem ter trabalhado.
 */
const ONLY = (() => {
  const at = process.argv.indexOf('--only');
  return at >= 0 ? (process.argv[at + 1] ?? '').toLowerCase() : '';
})();

/**
 * Qual fatia das checagens este processo roda: `--shard 2/4`.
 *
 * Cada checagem já abre contexto novo do navegador — armazenamento separado,
 * primeira instalação — então elas são independentes por construção, e fatiar não
 * muda o que cada uma prova. O que muda é a espera: trinta checagens em série
 * custavam cinco minutos por rodada, e essa espera se paga em toda rodada.
 *
 * A fatia é por RESTO da divisão e não por bloco contíguo: as checagens têm
 * durações muito diferentes (a que cadastra produto e produz leva quinze vezes o
 * tempo da que só abre uma tela), e blocos contíguos deixariam uma fatia
 * terminando muito depois das outras.
 */
const SHARD = (() => {
  const at = process.argv.indexOf('--shard');
  if (at < 0) return null;
  const [i, n] = `${process.argv[at + 1] ?? ''}`.split('/').map(Number);
  if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 1 || i > n) {
    console.error('--shard pede i/N, com 1 <= i <= N');
    process.exit(2);
  }
  return { i: i - 1, n };
})();
const ROOT = join(process.cwd(), 'dist');
/**
 * Left undefined by default so Playwright finds its own Chromium, which is what
 * `npx playwright install chromium` provides on a fresh machine. Set
 * E2E_CHROMIUM to point at a browser that is already on disk.
 */
/**
 * Which Chromium to drive.
 *
 * `playwright-core` looks for the exact build its version pins, which is a
 * download this machine is not allowed to make. Every environment that runs
 * this suite already has a browser; it is just not the numbered one. So: the
 * env var wins, then the well-known symlink these images ship, and only then
 * Playwright's own guess. Without this the suite fails with a message about
 * installing browsers, which reads like a broken test rather than a missing
 * path - and a suite that looks broken is a suite people stop running.
 */
const BROWSER =
  process.env.E2E_CHROMIUM ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/**
 * Serves the export with the two headers the database needs.
 *
 * Without cross-origin isolation the browser refuses SharedArrayBuffer and the
 * WebAssembly build of SQLite cannot open anything - so a server that forgets
 * them fails in exactly the way this test is meant to catch.
 */
function serve() {
  return createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    let file = join(ROOT, path === '/' ? 'index.html' : path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(ROOT, 'index.html');

    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    response.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(response);
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} failed`))));
  });
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

/**
 * Everything on screen as one line, which is how these assertions read it.
 *
 * The non-breaking space matters: `Intl` puts one between "R$" and the number
 * in Portuguese, so an assertion typed with an ordinary space silently never
 * matches. Normalising here keeps that out of every regular expression below.
 */
/**
 * Espera a tela PARAR DE CRESCER, em vez de esperar um número de milissegundos.
 *
 * As checagens usavam `waitForTimeout(2500)`, e 2500 é um palpite sobre a
 * máquina: com quatro navegadores disputando quatro núcleos, a mesma checagem
 * reprovava numa fatia e passava três vezes seguidas quando rodada sozinha.
 * Trocar por `waitFor` de um elemento também não bastou — o elemento aparece
 * antes de o resto da tela montar, e a leitura vinha vazia.
 *
 * Isto mede o que interessa: o texto da tela deixou de mudar entre duas
 * amostras. É condição, não relógio, então máquina lenta espera mais e máquina
 * rápida segue adiante — e a checagem volta a reprovar só pelo motivo dela.
 */
const assentar = async (page, { limite = 20000, quieto = 400 } = {}) => {
  const ate = Date.now() + limite;
  let anterior = -1;
  let desde = Date.now();
  while (Date.now() < ate) {
    const agora = await page.evaluate(() => document.body.innerText.length);
    if (agora !== anterior) {
      anterior = agora;
      desde = Date.now();
    } else if (agora > 0 && Date.now() - desde >= quieto) {
      return;
    }
    await page.waitForTimeout(100);
  }
};

/**
 * O texto da tela — e o que ele NÃO contém é o que precisa estar escrito aqui.
 *
 * `innerText` é o texto do documento. O que está DENTRO de um campo é `value`, um
 * atributo, e não aparece aqui nunca. Então toda asserção sobre o que um campo
 * guarda, escrita com esta função, ou casa outra coisa na página ou não casa nada —
 * e a primeira é pior, porque fica verde.
 *
 * Não é hipótese: em 6 de setembro escrevi `assert.match(screen(page), /2,50/)` para
 * provar que um preço digitado voltava do banco. Passou de primeira. Com a gravação
 * DESLIGADA continuou passando — o que ela casava era `R$ 1.932,50`, o valor do
 * estoque num cartão mais abaixo da mesma página. Quem responde por campo é
 * `inputValue()`, e a checagem logo abaixo prende esta diferença.
 */
const leia = async (page) =>
  (await page.locator('body').innerText()).replace(/\u00a0/g, ' ').replace(/\n+/g, ' | ');

/**
 * Lê a tela DEPOIS que ela parou de mudar — e isto é o conserto de uma esteira.
 *
 * **A medida que obrigou.** O arquivo tem 420 esperas de relógio, e **cem** delas
 * são seguidas de uma leitura da tela. Toda consulta deste aplicativo é
 * assíncrona: com a máquina carregada, ela resolve DEPOIS do sono fixo e a
 * leitura pega a tela do jeito que ela estava antes de o dado chegar. Não é uma
 * checagem frágil, são cem — e qual delas fica vermelha é loteria, o que fez
 * cinco caírem juntas numa corrida e outra, diferente, na seguinte.
 *
 * Consertar a que caiu é esteira: a próxima corrida escolhe outra. Aumentar o
 * sono é a mesma armadilha com número maior, e volta na próxima máquina mais
 * lenta.
 *
 * O que conserta as cem de uma vez é a leitura esperar a tela ASSENTAR: lê,
 * espera um pouco, lê de novo, e só devolve quando as duas leituras batem. É o
 * que uma pessoa faz — ela não lê a tela no meio do carregamento, ela espera
 * parar de mexer.
 *
 * **E ela assenta de verdade**, que é o que torna isto possível: o movimento
 * deste aplicativo é de FORMA (entrada em cascata, engrenagem girando), não de
 * texto. A única peça que muda texto sozinha é o `CountUp`, e esperar por ele é
 * exatamente o certo — a leitura passa a ver o número final em vez de um do meio
 * do voo, que era a outra metade do mesmo defeito.
 *
 * O teto existe para o caso de uma tela que nunca para: aí devolve a última
 * leitura e a asserção reprova com a mensagem dela, que é melhor diagnóstico do
 * que um estouro de tempo genérico.
 */
/**
 * Nenhuma tela mostra `{{marcador}}` — conferido em TODA leitura, não numa asserção.
 *
 * **Acrescentado em 11 de setembro, quando um marcador cru chegou à tela do dono.**
 * `app/products/new.tsx` desenhava `t.app.catalog.flavors.toUpperCase()` e a chave é
 * `'Variações de {{type}}'`: a tela de cadastrar o primeiro produto mostrava
 * `VARIAÇÕES DE {{TYPE}}` desde 4 de setembro. Havia guarda para isso na suíte de unidade, e
 * ela era cega a `.toUpperCase()` — consertada no mesmo commit.
 *
 * Isto entra aqui porque é o lugar onde a checagem não precisa ser lembrada: as 58 checagens
 * desta suíte já leem a tela, então todas passam a conferir de graça. Uma asserção nova numa
 * checagem só cobriria a tela dela — e foi exatamente assim que este defeito atravessou uma
 * semana com a suíte verde: ninguém tinha escrito a asserção naquela tela.
 *
 * Ela reprova a LEITURA, e não a checagem, para a mensagem dizer o que aconteceu de verdade:
 * quem lê "a tela mostra um molde não preenchido" não vai procurar defeito no fluxo.
 */
const semMarcadorCru = (texto, page) => {
  const achado = /\{\{\s*\w+\s*\}\}/i.exec(texto);
  if (achado) {
    throw new Error(
      `a tela mostra um molde de i18n não preenchido — "${achado[0]}" em ${page.url()}. ` +
        'Alguma tela desenhou uma chave do dicionário sem passar por `fill(...)`. ' +
        'A pessoa que usa o aplicativo vê o marcador literal.',
    );
  }
  return texto;
};

const screen = async (page, { passo = 250, teto = 8_000 } = {}) => {
  let anterior = await leia(page);
  for (let esperou = 0; esperou < teto; esperou += passo) {
    await page.waitForTimeout(passo);
    const agora = await leia(page);
    if (agora === anterior) return semMarcadorCru(agora, page);
    anterior = agora;
  }
  return semMarcadorCru(anterior, page);
};

check('what is typed into a field is not text on the screen', async (page) => {
  /**
   * A checagem mais barata desta suíte, e ela existe para uma asserção minha que
   * ficou verde pelo motivo errado.
   *
   * Ela prende o comportamento de `screen()` em vez de confiar que alguém leia o
   * comentário: o dia em que `innerText` passar a incluir valor de campo — ou em que
   * alguém trocar o `screen()` por outra coisa —, esta reprova e conta o porquê.
   */
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);

  const nonce = 'Zzq7Nonce';
  await page.getByLabel('Como se chama').fill(nonce);
  await page.waitForTimeout(400);

  assert.equal(
    await page.getByLabel('Como se chama').inputValue(),
    nonce,
    'o campo guarda o que foi digitado',
  );
  assert.doesNotMatch(
    await screen(page),
    new RegExp(nonce),
    'e o texto da tela NÃO o contém: asserção sobre campo se faz com inputValue()',
  );
});

check('opens on the day, not on the price of a popsicle', async (page) => {
  // Esta checagem media o custo por unidade na capa até o dono abrir o
  // aplicativo publicado e dizer que aquele número não interessava ali. O que
  // ela mede agora é a capa que ele pediu - e o custo calculado pelo motor
  // continua exercitado onde ele mora: na receita, e na resposta do assistente
  // ("Picolé de morango custa R$ 0,64 por unidade", mais abaixo neste arquivo).
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const text = await screen(page);
  assert.match(text, /NORVA/);
  // Numa instalação virgem a manchete é o CONVITE, e não "0 unidades saíram
  // hoje". O dono abriu o aplicativo instalado e viu quatro cartões dizendo que
  // não havia nada — "0 unidades", "0 · nada saiu ainda", "nenhuma corrida
  // registrada", "sem saída registrada" — e nenhuma próxima ação em lugar
  // nenhum. Um convite responde por todos eles.
  assert.match(text, /ainda não produziu/, 'a capa de uma fábrica nova convida em vez de contar zeros');
  assert.match(text, /Lançar a primeira produção/, 'com a próxima ação, que é a Lei da Inteligência');
  assert.doesNotMatch(
    text,
    /Nenhuma corrida registrada ainda/,
    'e as peças vazias não empilham quatro nadas embaixo do convite',
  );

  // E o preço saiu de vez, dito como asserção para que ele não volte sozinho
  // numa refatoração futura.
  assert.doesNotMatch(text, /R\$ 0,64/, 'o custo por unidade não mora mais na capa');
  assert.doesNotMatch(text, /cada um/);

  // A first install has not updated anything, so it must not say it has.
  assert.doesNotMatch(text, /se atualizou sozinho/);
});

check('the storeroom is seeded on a deep link, not only from home', async (page) => {
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  /**
   * Espera o FATO, não o relógio — e esta linha é a cicatriz de 7 de setembro.
   *
   * O `CountUp` chegou a esta tela nesta madrugada, e com ele a figura passou a
   * subir de zero até o valor em 1250 ms. A consulta que traz `heldCents` é
   * assíncrona: com a máquina carregada (quatro fatias de navegador em quatro
   * núcleos), ela resolve DEPOIS do sono fixo, a animação começa depois disso, e
   * o `screen()` lê um número que está no meio do voo. A checagem ficou vermelha
   * nas quatro fatias e VERDE sozinha — que é a assinatura de tempo, não de
   * defeito.
   *
   * O conserto errado seria aumentar o sono: é a mesma armadilha com um número
   * maior, e ela volta na próxima máquina mais lenta. O certo é esperar pela
   * coisa — e a PRIMEIRA tentativa de esperar pela coisa também estava errada,
   * pelo motivo que vale escrever: eu esperei pelo RÓTULO ACESSÍVEL, que o
   * `CountUp` publica com o valor final desde o primeiro quadro. É exatamente a
   * propriedade cujo propósito é estar certa ANTES de a animação acabar, então
   * a espera devolvia na hora e a leitura seguia lendo o meio do voo.
   *
   * O que assenta é o TEXTO VISÍVEL: o Playwright reconsulta até ele bater, e
   * ele só bate quando a contagem chega. Sem sono novo e sem tolerância — se o
   * número estiver errado, isto não passa.
   */
  await page.getByText('R$ 1.552,50').first().waitFor({ timeout: 15_000 });

  const text = await screen(page);
  assert.match(text, /R\$ 1\.552,50/, 'the four inputs are worth this much at average cost');
  assert.match(text, /Polpa de morango/);
  assert.doesNotMatch(text, /Nada cadastrado ainda/);

  // Dinheiro parado sozinho não responde nada. No exemplo semeado nada saiu
  // ainda, então a frase honesta é a de que ninguém sabe quanto isso dura.
  assert.match(
    text,
    /sem saída registrada ainda|acaba em|antes de um mês/,
    'o dinheiro parado vem com quanto tempo ele dura',
  );
});

check('a product says how many units a batch makes, in one language', async (page) => {
  await page.goto(`http://localhost:${PORT}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const text = await screen(page);
  assert.match(text, /1 engradado, 4 caixas e 6 unidades/);
  assert.doesNotMatch(text, /\bcrate\b|\bboxes\b|\bunits\b/, 'no English leaking through');
});

check('the recipe list opens on a deep link and shows the seeded sheets', async (page) => {
  // Linked from home and never driven until now. The scar that created this
  // suite was routes that opened on an empty database - two were still
  // unexercised, and an unexercised route is the one that greets somebody with
  // "nothing here yet" the first time they tap it.
  await page.goto(`http://localhost:${PORT}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const text = await screen(page);
  assert.match(text, /Base de creme/, 'the sub-recipe is there');
  assert.match(text, /Picolé de morango/);
  assert.doesNotMatch(text, /Nada cadastrado ainda/);
});

check('a new sheet can use an existing sheet as an ingredient', async (page) => {
  // O caso da fábrica, dito pelo dono em 10 de setembro: o picolé de morango leva
  // "calda base de leite", e o pote de sorvete de ameixa leva a MESMA calda. O banco
  // guarda receita-dentro-de-receita desde a `0018` e o domínio explode a sub-receita
  // pelo rendimento líquido — o que não existia era a tela oferecer.
  //
  // Esta checagem anda o caminho inteiro dele: cria a ficha, e usa a que já existe
  // dentro dela. Sem ela, "a tela deixa aninhar" é afirmação sobre código que ninguém
  // tocou.
  const nome = `Massa de ameixa ${Date.now()}`;

  await page.goto(`http://localhost:${PORT}/recipes/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.getByRole('textbox', { name: 'Nome da ficha' }).fill(nome);
  await page.getByRole('textbox', { name: 'Rendimento' }).fill('40000');
  await page.getByRole('button', { name: 'Criar ficha' }).click();
  await page.waitForTimeout(1200);
  // A confirmação diz o que vai acontecer antes de acontecer — é a Lei 5 desta casa,
  // e por isso o salvamento tem dois toques e não um.
  await page.getByRole('button', { name: 'Criar ficha' }).last().click();
  await page.waitForTimeout(3000);

  const ficha = await screen(page);
  assert.match(ficha, new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'abriu na ficha nova');
  assert.match(ficha, /USAR UMA RECEITA/, 'a ficha nova pode usar outra ficha');
  assert.match(ficha, /Base de creme/, 'a calda que já existe é oferecida');

  await page.getByRole('button', { name: 'USAR UMA RECEITA Base de creme' }).click();
  await page.waitForTimeout(2000);

  const comCalda = await screen(page);
  assert.match(comCalda, /Base de creme.*sub-receita/s, 'a calda entrou como sub-receita');
});

check('a long screen can be scrolled to its end, and the header comes back', async (page) => {
  // **A suíte nunca rolou.** Zero ocorrências de `scroll` em 54 checagens, numa suíte que se
  // chama "o app dirigido como uma pessoa dirige" — e rolar é o gesto mais comum que existe
  // num telefone. Foi por isso que o defeito que o dono achou no tablet dele em 11 de
  // setembro não tinha como aparecer aqui.
  //
  // **A fronteira, escrita antes que alguém confie demais nisto:** esta checagem NÃO guarda
  // o tremor do item 35. Aquele laço depende de o dedo ser rastreado DENTRO da lista, e um
  // navegador rola por roda e por barra — mecanismo diferente. Quem guarda o tremor é a
  // régua geométrica (`src/components/cabecalho.test.ts`), que é matemática e roda em
  // qualquer lugar. O que ESTA cobra é outra coisa, e ninguém cobrava: que o fim da tela
  // seja alcançável, e que o cabeçalho volte quando se sobe.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const titulo = page.getByText('Ajustes', { exact: true }).first();
  await titulo.waitFor({ timeout: 10_000 });

  // **A roda precisa estar EM CIMA da lista.** `page.mouse.wheel` despacha na posição
  // atual do ponteiro, que começa em (0,0) — fora da área rolável. A primeira versão desta
  // checagem rolou 7.200 px e o fim da tela continuou em y=5195: nada tinha rolado, e a
  // asserção de então (`isVisible`) respondia "sim" mesmo assim. Duas cegueiras somadas
  // davam uma checagem verde que não tocava no assunto.
  const janela = page.viewportSize();
  await page.mouse.move(janela.width / 2, janela.height / 2);

  // Em passos, como um dedo: um salto único não dispara os mesmos eventos de rolagem e
  // mediria uma coisa que ninguém faz.
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
  }

  // O último bloco da tela tem de estar ALCANÇÁVEL — e alcançável é estar DENTRO da
  // janela, não existir no DOM.
  //
  // A primeira versão desta linha usava `isVisible()`, e ela passou com o fim da tela a
  // **y = 5195 numa janela de 915**: no Playwright, "visível" quer dizer que o elemento
  // tem caixa e não está oculto — não que dê para vê-lo. A checagem passava antes mesmo
  // de rolar, o que a tornava uma guarda que não pode falhar, que é o defeito que este
  // repositório proíbe em toda parte. Quem decide aqui é a caixa contra a altura da
  // janela.
  const fim = page.getByText('Voltar', { exact: true }).last();
  await fim.waitFor({ timeout: 15_000 });
  const caixa = await fim.boundingBox();
  assert.ok(caixa, 'o fim da tela existe');
  assert.ok(
    caixa.y >= 0 && caixa.y + caixa.height <= janela.height,
    `o fim da tela é alcançável rolando — ele parou em y=${Math.round(caixa.y)} ` +
      `numa janela de ${janela.height}`,
  );

  // E subir devolve o cabeçalho. Ele encolhe na descida de propósito; sumir para sempre
  // seria a tela perder o nome dela.
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  const doTitulo = await titulo.boundingBox();
  assert.ok(
    doTitulo && doTitulo.y >= 0 && doTitulo.y < janela.height,
    'o cabeçalho volta para a janela quando se sobe',
  );
});

check('the five tabs are there, and the old addresses still answer', async (page) => {
  // The screens moved into `app/(tabs)/`, a group whose name is in parentheses
  // and therefore NOT in the URL. This check is what proves that: twenty-six
  // `page.goto` calls in this file address `/`, `/production` and `/transfer`,
  // and a rename would have broken every one of them at once.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Pelo papel, não pelo texto: uma barra de abas que o leitor de tela não
  // enxerga é uma barra que não existe para quem usa luva e voz.
  for (const tab of ['Início', 'Produção', 'Transporte', 'Relatórios', 'Mais']) {
    await page.getByRole('tab', { name: tab }).waitFor({ timeout: 5000 });
  }

  // The two new addresses.
  await page.goto(`http://localhost:${PORT}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const reports = await screen(page);
  // Sem depender de caixa: o cabeçalho de hoje sobe a legenda para maiúsculas,
  // e o desenho a quer em caixa normal - isso é o passo do cabeçalho, não deste.
  assert.match(reports, /Cada um abre num resumo de uma tela/i);
  assert.match(reports, /Estoque/);
  assert.match(reports, /o que cada unidade custa/);
  // What the design draws but nothing answers yet must not be advertised.
  assert.match(reports, /Perdas/, 'a linha existe porque agora há quem escreva perda');
  // O Espelho deixou de ser promessa em 6 de setembro: a linha existe porque a tela
  // existe. `margem` continua fora pelo motivo original — anunciar o que não abre.
  assert.match(reports, /Espelho da Loja/, 'a porta do Espelho existe porque a tela existe');
  assert.doesNotMatch(reports, /margem/i, 'a row promising a screen that does not exist');

  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const more = await screen(page);
  assert.match(more, /Cadastros/);
  assert.match(more, /Onde fica o estoque/);
  // Compra escreve no livro-razão e pedido é livro de pedidos: nenhuma das duas
  // é cadastro, e a palavra promete a classe de risco errada — cadastro se
  // corrige editando, escrita no livro-razão só se corrige por estorno.
  assert.match(more, /Lançamentos/, 'o que se lança não fica sob Cadastros');
  assert.match(more, /Pergunte/, 'the assistant has a door');
  // "Pessoas" SAIU desta lista em 6 de setembro, e a saída é o registro de uma
  // dívida paga: a porta ficou fora da tela enquanto `operator_id` era coluna sem
  // tabela de gente atrás, e agora tem o que abrir. Financeiro e Notas fiscais
  // continuam aqui porque continuam sem nada atrás.
  //
  // A lição de processo fica junto: por um dia esta linha e a checagem que afirma
  // /Pessoas/ na mesma aba disseram coisas opostas sobre a mesma tela, e ninguém
  // notou porque eu rodei `--only` e não a suíte.
  assert.doesNotMatch(more, /Financeiro|Notas fiscais/, 'a drawer that opens onto nothing');

  // And the addresses that existed before still answer, unchanged.
  // O título de cada tela, não um botão: numa instalação virgem a transferência
  // não tem destino cadastrado, então o botão nem chega a existir - e isso é a
  // tela funcionando, não a rota sumindo.
  for (const [route, expected] of [
    ['/production', /Adicionar produção/i],
    ['/production/new', /Quantas unidades/i],
    ['/transfer', /Transferir/],
    ['/transport', /Para onde foi/],
  ]) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    assert.match(await screen(page), expected, `${route} stopped answering`);
  }
});

check('settings counts what erasing would take, in Portuguese', async (page) => {
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });

  // Espera a SOBRELINHA aparecer, não um número de milissegundos.
  //
  // Era `waitForTimeout(2500)`, e 2500 é um palpite sobre a máquina: com quatro
  // navegadores disputando quatro núcleos, esta checagem reprovou em uma fatia e
  // passou três vezes seguidas quando rodada sozinha. Espera fixa reprova pelo
  // motivo errado, e "é flake" não é causa — é o nome que se dá para parar de
  // procurar.
  //
  // O que se espera é o CONTINENTE ("NORVA ·"), e o que se afirma é o CONTEÚDO
  // (a versão). Assim a máquina lenta espera, e o manifesto velho reprova com a
  // frase certa — em vez de as duas coisas darem o mesmo tempo esgotado.
  await assentar(page);

  const text = await screen(page);

  // A versão da tela é a do `app.json`, e esta linha é a guarda do pacote.
  //
  // Ela apareceu dizendo 0.2.0 com o `app.json` em 0.7.0: o manifesto inteiro é
  // embutido na hora de transformar o `expo-constants`, e o cache do Metro não
  // vê o `app.json` mudar. Toda foto e toda execução desta suíte liam esse
  // manifesto — a versão é o único campo visível dele, então é por ela que se
  // percebe. Sem esta asserção, o próximo campo a envelhecer envelhece calado.
  const { version } = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  assert.match(text, new RegExp(version.replace(/\./g, '\\.')), 'o pacote traz o manifesto DESTA versão');
  // The confirmation has to say what disappears with the real count - "confirm
  // deletion?" is what a person clicks through without reading.
  assert.match(text, /O que está guardado/);
  assert.match(text, /Almoxarifado/);
  // A PRESENÇA do exemplo, não o histórico dele: a marca `seeded` nunca é
  // apagada, então esta linha era verdadeira em todo aparelho para sempre —
  // inclusive depois de apagar tudo e cadastrar o primeiro insumo próprio.
  // Agora ela lê os ids que a semeadura anotou.
  assert.match(text, /Inclui os dados de exemplo/);
  // E os lugares entram na contagem que decide "está vazio", como já entravam na
  // confirmação de apagar tudo.
  assert.match(text, /Onde fica o estoque/);
  assert.doesNotMatch(text, /\bDelete\b|\bSettings\b|\bErase\b/, 'no English leaking through');
});

check('typing the package fills in how much is inside it', async (page) => {
  // Law 1, in a real browser: somebody who buys sugar writes what is printed on
  // the sack. Asking them for 25000 afterwards is arithmetic the system can do,
  // and the person who should not have to do it is the one this product is for.
  await page.goto(`http://localhost:${PORT}/inputs/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Two controls answer to "Embalagem" on this screen - the kind of item and
  // the package it is bought in - so this asks for the text box by name.
  const pack = page.getByRole('textbox', { name: 'Embalagem' });
  const inside = page.getByRole('textbox', { name: 'Quanto vem dentro' });

  await pack.fill('saco 25 kg');
  await page.waitForTimeout(600);
  assert.equal(await inside.inputValue(), '25000');

  // And what cannot be read with certainty is left alone rather than guessed:
  // a bucket has no size printed on it.
  await pack.fill('balde');
  await page.waitForTimeout(600);
  assert.equal(
    await inside.inputValue(),
    '25000',
    'an unreadable package must not wipe what is already there',
  );
});

check('the weather screen answers with or without internet', async (page) => {
  // O clima é a primeira coisa deste aplicativo que depende de rede, e é
  // exatamente por isso que ele precisa ser dirigido num navegador de verdade:
  // "a busca falha" e "a tela trava esperando" são indistinguíveis de dentro de
  // um módulo. Aqui a máquina de teste pode ter internet ou não, e as duas
  // saídas são aceitas - o que NÃO é aceito é a tela ficar sem resposta ou o
  // console sujar, que é o que este arquivo checa em toda página.
  await page.goto(`http://localhost:${PORT}/weather`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const aberta = await screen(page);
  assert.match(aberta, /onde fica a fábrica/i);
  // A tela diz POR QUE o tempo está no aplicativo, e a frase não pode falar de
  // sorvete: a capa do projeto proíbe regra chumbada de sorvete, porque isto
  // vai para as lojas servir qualquer fábrica. O que ela afirma agora é
  // verdade em qualquer uma — calor muda o que sai e o que estraga.
  assert.match(aberta, /Calor muda o que sai e o que estraga/);
  assert.doesNotMatch(aberta, /[Ss]orvete/, 'nenhuma regra de sorvete chumbada na tela');

  await page.getByRole('textbox', { name: 'Procurar cidade' }).fill('Recife');
  await page.getByText('Procurar cidade', { exact: true }).last().click();

  // A espera é do tamanho do prazo da chamada, não de um palpite: a busca
  // desiste sozinha em oito segundos, e uma verificação que espera três
  // reprovaria a tela por ela estar fazendo exatamente o que prometeu.
  await page
    .getByText(/Recife|Nenhuma cidade com esse nome/)
    .first()
    .waitFor({ timeout: 20000 });

  // E a porta que não depende de rede continua no lugar: sem previsão guardada
  // não há cartão na capa, então trocar a cidade tem que caber no menu.
  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  assert.match(await screen(page), /Clima/);
});

check('an order is written, and the briefing turns it into what to make', async (page) => {
  // O caminho inteiro pelas mãos de uma pessoa: cadastra o cliente, anota o
  // pedido, e volta para a capa. Nada aqui é chamada de função - é a única
  // forma de ver que o cartão de "produza para os pedidos" aparece de verdade,
  // com o número certo, na tela que o dono abre de manhã.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // O cartão de quem recebe não diz "Cliente" com o ícone de pessoa sobre uma
  // lista que aceitava câmara fria e almoxarifado — e loja própria, que recebe
  // pedido, também não é cliente.
  const pedindo = await screen(page);
  assert.match(pedindo, /Loja ou cliente/);

  // E a dica do quanto aparece no PRIMEIRO pedido, que é quando ela decide.
  //
  // Ela vinha de uma consulta que partia da linha de pedido, então só existia
  // para produto que já tinha pedido — ou seja, nunca no primeiro. Aqui não há
  // nenhum pedido gravado ainda, e o campo tem que dizer quanto está livre.
  assert.match(pedindo, /livre para esta data/, 'a conta aparece antes do primeiro pedido');
  await page.getByLabel('Quantidade').fill('300');
  await page.waitForTimeout(300);
  await page.getByText('Adicionar ao pedido', { exact: true }).first().click();
  await page.waitForTimeout(500);

  const noPedido = await screen(page);
  assert.match(noPedido, /No pedido/, 'o que foi somado tem que aparecer antes de gravar');
  assert.match(noPedido, /300/);

  await page.getByText('Anotar pedido', { exact: true }).last().click();
  await page.waitForTimeout(900);
  await page.getByText('Anotar', { exact: true }).last().click();
  await page.waitForTimeout(2000);

  // **Perguntar pela LISTA, em vez de confiar no que `back` faz.**
  //
  // Esta linha lia a tela onde `router.back()` deixasse a pessoa, e no navegador
  // isso era o histórico: o `goto` de `/places` logo acima. Ela passava porque a
  // tela de lugares mostra "Loja Centro" — não porque o pedido existisse. Com a
  // âncora de rota (`app/_layout.tsx`), voltar de uma tela aberta por ligação
  // profunda passou a cair na capa, e a checagem ficou vermelha sem que nada do
  // que ela mede tivesse mudado. A forma que não depende disso é ir na lista.
  await page.goto(`http://localhost:${PORT}/orders`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const lista = await screen(page);
  assert.match(lista, /Loja Centro/, 'o pedido gravado aparece na lista de pedidos');

  // E a capa passa a dizer o que fazer com isso. A fábrica semeada nunca
  // produziu, então os 300 pedidos são 300 que faltam - e o cartão diz isso
  // sem que ninguém tenha somado nada na mão.
  //
  // **A peça NÃO é mais ligada aqui, e a história dessa linha é a lição.**
  //
  // Ela nasceu quando a capa trazia quinze peças por padrão e não precisava ligar nada.
  // A capa emagreceu para oito, esta checagem passou a medir "a peça vem ligada de
  // fábrica" em vez do que promete, e o conserto foi ligar a peça antes de cobrar a
  // frase. Em 9 de setembro o dono mandou `pedidos` para o padrão — e o CONSERTO
  // envelheceu junto: com a peça já ligada, "Colocar na capa" não existe, e a checagem
  // ficou trinta segundos esperando um botão que virou "Tirar da capa".
  //
  // Duas vezes o mesmo defeito na mesma linha, em direções opostas. O que sobra é a
  // forma que não depende do padrão de hoje: a checagem cobra a FRASE na capa e mais
  // nada. Se `pedidos` sair do padrão amanhã, ela fica vermelha — e estará certa, porque
  // aí a promessa "a capa diz o que fazer com o pedido" deixou de valer de fábrica.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const capa = await screen(page);
  assert.match(capa, /Produza para os pedidos/);
  assert.match(capa, /300/);

  // E com pedido em pé, a dica do campo aparece — dizendo a data que ela mede.
  // O horizonte era fixo em sete dias e a consulta não tinha chave, então
  // trocar o dia não movia o número e a frase dizia "para esta data" de
  // qualquer jeito. (O que esta linha prova é a frase; o horizonte é medido na
  // unidade, onde dá para escolher a data.)
  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /livre para esta data/);
});

check('the picking list beats the habit: the order wins over last time', async (page) => {
  // Esta checagem existe porque o mutante que inverte a ordem do palpite
  // sobreviveu duas vezes. Ele só morre com as duas fontes DISCORDANDO: um envio
  // anterior de 40 e um pedido de 300. Sem essa montagem, inverter a preferência
  // dá o mesmo número e o teste passa por acidente - que é a definição do teste
  // que este projeto caça.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('500');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Uma carga pequena primeiro: é ela que cria o palpite do hábito.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Quanto vai').fill('40');
  await page.waitForTimeout(500);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // E o pedido depois, com outro número.
  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Quantidade').fill('300');
  await page.waitForTimeout(400);
  await page.getByText('Adicionar ao pedido', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Anotar pedido', { exact: true }).last().click();
  await page.waitForTimeout(900);
  await page.getByText('Anotar', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(700);

  const separacao = await screen(page);
  assert.match(separacao, /pedido para/, 'a dica diz que o palpite veio do pedido');
  assert.match(separacao, /300/, 'e o número é o do pedido, não o dos 40 que foram antes');
});

check('the assistant answers with the number the engine computed', async (page) => {
  await page.goto(`http://localhost:${PORT}/assistant`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.getByLabel('Sua pergunta').fill('quanto custa o picolé de morango');
  await page.getByText('Perguntar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  assert.match(await screen(page), /Picolé de morango custa R\$ 0,64 por unidade/);
});

check('an invoice warns before it is committed, then moves everything', async (page) => {
  await page.goto(`http://localhost:${PORT}/purchase`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.getByText('Polpa de morango', { exact: true }).first().click();
  // O fornecedor é digitado UMA vez aqui, e é o que a asserção do fim cobra de volta: a
  // nota seguinte do mesmo insumo não pergunta de novo.
  await page.getByLabel('Fornecedor').fill('Distribuidora Aurora');

  /**
   * A quantidade que SOME no arredondamento, antes da nota de verdade.
   *
   * `purchaseToBaseUnits` faz `Math.round(quantidade × fator)`, e a tela exigia PACOTE maior
   * que zero — nunca unidade-base maior que zero. O balde é de 10.000 g, então `0,00001` balde
   * é 0,1 g e arredonda para **zero**: a nota entrava, e o Postgres recusava a linha e o
   * movimento para sempre com `23514`, que a fila trata como recusa passageira. Ela tentaria
   * de novo eternamente, com tudo o que viesse atrás preso, calado.
   *
   * As duas metades da Lei 5 aqui: o botão IMPEDE (fica desabilitado, porque o rascunho volta
   * nulo) e a linha DIZ o que fazer. Impedir calado seria a pessoa tocar e nada acontecer.
   *
   * **O TOTAL vai primeiro, e essa ordem é a asserção.** Escrita ao contrário, esta checagem
   * passou com o conserto REMOVIDO: sem a nota digitada o rascunho já é nulo e o botão já está
   * desabilitado, então ela media "falta o total" achando que media "some no arredondamento".
   * Com a nota preenchida, a única coisa que pode desabilitar o botão é a quantidade.
   */
  await page.getByLabel('Total da nota').fill('700');
  await page.getByLabel(/Quantidade, em/).fill('0,00001');
  await page.waitForTimeout(800);
  assert.match(
    await screen(page),
    /Aumente a quantidade/,
    'a tela diz o que fazer, em vez de só não reagir',
  );
  assert.ok(
    await page.getByText('Lançar compra').first().isDisabled(),
    'e o botão impede, com a nota já digitada — Lei 5: o erro impede, não reclama',
  );

  await page.getByLabel(/Quantidade, em/).fill('4');
  await page.getByLabel('Total da nota').fill('700');
  await page.waitForTimeout(800);

  // Law 4: the warning arrives on the date of the decision.
  //
  // E a vírgula é a coisa afirmada, não um detalhe da escrita: esta linha exigia
  // `41.1%` — o ponto decimal do JavaScript — e passou verde enquanto a tela mostrava
  // um número escrito em nenhum idioma para uma fábrica brasileira. A checagem
  // AFIRMAVA o defeito, que é a única maneira de um defeito de tela sobreviver a uma
  // suíte que roda no navegador.
  const preview = await screen(page);
  assert.match(preview, /41,1%/, 'a porcentagem se escreve com vírgula em português');
  assert.match(preview, /Subiu bem acima do normal/);
  assert.match(preview, /passa de R\$ 12,40 para R\$ 14,95/);

  await page.getByText('Lançar compra').first().click();
  await page.waitForTimeout(900);

  // The confirmation is the app's own, and spells the numbers out.
  const asking = await screen(page);
  assert.match(asking, /Lançar esta compra\?/, 'Alert would have shown nothing here');
  assert.match(asking, /4 × balde 10 kg de Polpa de morango, por R\$ 700,00/);

  await page.getByText('Lançar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // One entry, five consequences, none of them typed by anybody.
  const after = await screen(page);
  assert.match(after, /O que essa nota mexeu/);
  assert.match(after, /R\$ 0,64 → R\$ 0,73/);

  /**
   * A SEGUNDA nota do mesmo insumo abre sabendo de quem veio a primeira.
   *
   * Duas colunas tinham escritor e nenhum leitor até 11 de setembro —
   * `purchases.supplier_name` e `purchase_lines.purchase_quantity` —, e as duas guardavam
   * exatamente o que esta tela pedia em branco: ela abria com `useState('')` no fornecedor
   * e `useState('1')` na quantidade. A Lei 1 proíbe pedir o que o sistema pode deduzir, e a
   * Lei 2 proíbe campo vazio.
   *
   * A checagem de unidade prova a consulta. O que só o navegador prova é que o valor chega
   * ao CAMPO: o formulário tem estado próprio, a consulta é assíncrona, e semear campo
   * controlado depois de uma resposta que chega tarde é onde este tipo de conserto falha.
   */
  await page.goto(`http://localhost:${PORT}/purchase`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByText('Polpa de morango', { exact: true }).first().click();
  await assentar(page);
  assert.equal(
    await page.getByLabel('Fornecedor').inputValue(),
    'Distribuidora Aurora',
    'a nota seguinte não pergunta de quem veio a anterior — a resposta já estava no razão',
  );
  assert.equal(
    await page.getByLabel(/Quantidade, em/).inputValue(),
    '4',
    'e nem quantos pacotes: 4 baldes, como na nota passada — em vez do "1" chumbado',
  );
  // E dizendo de onde veio, senão é decidir calado. Campo preenchido sem explicação é o
  // sistema afirmando um fato que ninguém digitou.
  assert.match(
    await screen(page),
    /Da última nota/,
    'a sugestão se anuncia como sugestão — o sistema sugere, nunca decide calado',
  );

  /**
   * Apagar o sugerido, e o que esta asserção NÃO prova — medido, não suposto.
   *
   * Eu escrevi isto para prender "o campo apagado fica apagado", e plantei o defeito que
   * ela nomeia — `??` trocado por `||`, que faz a sugestão voltar por cima do campo vazio.
   * **Ela continuou verde.** O `input` controlado não repõe o texto que o Playwright apagou
   * quando o valor calculado não muda, então o navegador é cego para essa troca. No
   * `TextInput` do Android ele repõe, e `src/components/campo.ts` já contava essa história
   * do outro lado.
   *
   * A régua saiu daqui para lá por causa disso, e é `campo.test.ts` que prova as cinco
   * respostas — `undefined` vale a sugestão, vazio é uma digitação, e as outras três. O que
   * esta asserção prova é o que ela consegue: o campo ACEITA ficar vazio, e a dica embaixo
   * dele sai com o valor dele. Guardo-a por isso, e não como prova da distinção.
   */
  const dicas = (texto) => (texto.match(/Da última nota/g) ?? []).length;
  const antesDeApagar = dicas(await screen(page));
  assert.equal(antesDeApagar, 2, 'a dica está embaixo dos DOIS campos sugeridos');

  await page.getByLabel('Fornecedor').fill('');
  await page.waitForTimeout(600);
  assert.equal(
    await page.getByLabel('Fornecedor').inputValue(),
    '',
    'o campo aceita ficar vazio (a distinção vazio-vs-não-digitado é provada em campo.test.ts)',
  );
  // Contada, e não procurada: a MESMA frase fica embaixo da quantidade, que continua com o
  // valor sugerido. `doesNotMatch` na tela inteira reprovaria com o código certo — foi o
  // que aconteceu na primeira escrita desta linha, e a asserção era o defeito.
  assert.equal(
    dicas(await screen(page)),
    1,
    'a dica do fornecedor sai com o valor dele; a da quantidade fica, porque o valor dela ficou',
  );

  // And the briefing carries the consequence, not just the figure. Until now
  // the first card the owner saw was a bare unit cost - 55 cents, neither good
  // nor bad, with nothing beside it.
  //
  // A peça é ligada antes: "Preços que mexeram" saiu das sete que a capa traz por
  // padrão quando o dono mandou emagrecê-la, e cobrar a frase na capa padrão mediria
  // a preferência em vez da consequência da nota.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/^Colocar na capa: Preços que mexeram$/).first().click();
  await page.waitForTimeout(1200);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const briefing = await screen(page);
  // A capa não repete o custo por unidade - ela conta o que mudou. A nota
  // moveu a polpa, e é isso que aparece.
  assert.match(briefing, /Mudou desde a última vez/, 'the briefing carries the news');
  assert.match(briefing, /Polpa de morango/);
  // O tamanho da alta, em percentual: a capa conta a mudança da POLPA, que é o
  // insumo que a nota moveu, e não o custo do picolé que ela empurrou junto.
  assert.match(briefing, /▲ \d+,\d%/, 'and how much the invoice moved it');

  // And the history wrote itself on the way past. Same check, because it is
  // the same story: each context starts on an empty install, so the invoice
  // has to be entered here for the line to exist.
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByText('Polpa de morango').first().click();
  await page.waitForTimeout(2000);

  const history = await screen(page);
  assert.match(history, /R\$ 12,40 → R\$ 14,95/);
  assert.match(history, /20,6%/, 'a vírgula também aqui: é a mesma tela, no mesmo idioma');
  assert.match(history, /Picolé de morango/, 'and it says which recipe stands on it');
});

check('the briefing is up to date when you tap Back into it', async (page) => {
  // Every other check in this file re-navigates with `page.goto`, which remounts
  // the whole tree and hides the defect this one exists for: a person does not
  // reload, a person taps Back. The briefing is the root of the stack - it
  // mounts once per launch, and on a phone that is days - so it showed the cost
  // it read on the first frame and said "nothing changed in price" beside it,
  // with the invoice already in the ledger.
  //
  // A peça de preço é ligada LOGO NO COMEÇO, e não no meio: o que esta checagem
  // mede é a volta pelo botão Voltar, e passar pelos ajustes no meio do caminho
  // trocaria a navegação que está sendo testada por outra.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/^Colocar na capa: Preços que mexeram$/).first().click();
  await page.waitForTimeout(1200);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const before = await screen(page);
  // Instalação virgem: o exemplo nasce com um preço, nunca com uma mudança de
  // preço. A capa fica calada sobre isso em vez de ocupar a tela para dizer que
  // não há notícia.
  assert.doesNotMatch(before, /Mudou desde a última vez/);

  // Tapped, not typed: this is the route a person actually takes - e agora ela
  // passa pela barra de abas, porque a lista de nove linhas saiu da home. O
  // caminho é mais longo e é o verdadeiro: aba Mais, cartão Compras.
  await page.getByRole('tab', { name: 'Mais' }).click();
  await page.waitForTimeout(2000);
  await page.getByText('Compras', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.getByText('Polpa de morango', { exact: true }).first().click();
  await page.getByLabel(/Quantidade, em/).fill('4');
  await page.getByLabel('Total da nota').fill('700');
  await page.waitForTimeout(800);
  await page.getByText('Lançar compra').first().click();
  await page.waitForTimeout(900);
  await page.getByText('Lançar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // Compras é tela empilhada: ela cobre a barra, que é o que o desenho manda
  // para tela em que se entrou. Então o caminho de volta é o de verdade -
  // voltar para Mais, onde a barra existe, e daí tocar Início. Se `useQuery`
  // não relesse no foco, a home mostraria o custo de quando o app abriu.
  await page.goBack();
  await page.waitForTimeout(1500);
  await page.getByRole('tab', { name: 'Início' }).click();
  await page.waitForTimeout(2500);

  const after = await screen(page);
  // A prova de que a capa releu o livro-razão mudou de lugar junto com o
  // desenho: o custo por unidade saiu da capa a pedido do dono, e o que sobrou
  // é a NOTÍCIA - o insumo que mexeu, com quanto mexeu. A nota de R$ 15,50 num
  // saco que estava R$ 12,40 é uma alta de 25%, e ela só pode aparecer aqui se
  // a tela tiver lido o banco de novo ao voltar.
  assert.match(after, /Mudou desde a última vez/, 'the briefing re-read the ledger on the way back');
  assert.match(after, /▲ \d+,\d%/, 'a alta aparece em percentual, com a vírgula do idioma');
  // E o cartão de "nada aconteceu" não existe mais: ele ocupava a capa todo dia
  // para dizer que não havia notícia, que é o alerta que ensina a ignorar
  // alerta. Some junto a linha de estabilidade.
  assert.doesNotMatch(after, /estável há|nenhuma mudança de preço/);
  assert.doesNotMatch(after, /Nada mudou de preço/, 'it must not still say nothing moved');
});

check('what came out today reaches the briefing, with what it was to compare', async (page) => {
  // A primeira consulta com recorte de data deste repositório, vista da tela.
  //
  // O assunto da tela nunca some — o que mudou foi a FORMA dele numa fábrica
  // que ainda não trabalhou.
  //
  // Duas versões desta checagem já erraram, cada uma para um lado. A primeira
  // afirmava que o cartão do dia não aparecia numa instalação virgem: era a Lei
  // 7 lida errado, e a capa ficava com clima e preço e nada de trabalho. A
  // segunda cobrava "0 unidades saíram hoje" ao lado de ontem — e o dono abriu
  // o aplicativo instalado e viu QUATRO cartões dizendo que não havia nada.
  //
  // Zero dito é uma pergunta quando a fábrica já trabalhou. Antes disso ele é
  // só um zero, e o que responde à Lei da Inteligência é o convite com a
  // próxima ação. Cartão ausente continua sendo um buraco: por isso a asserção
  // é positiva, sobre o que a capa DIZ.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const virgem = await screen(page);
  // A pergunta é a mesma; as palavras mudaram com o desenho aprovado. O convite
  // era um cartão intitulado "Primeiro dia"; agora é a própria manchete da
  // página dizendo o que houve — "Hoje a fábrica / ainda não produziu" — com a
  // próxima ação embaixo. Asserção positiva de novo: sobre o que a capa DIZ.
  assert.match(virgem, /ainda não produziu/, 'a capa fala de trabalho antes de haver trabalho');
  assert.match(virgem, /Lançar a primeira produção/, 'e diz qual é a próxima ação');

  // Produz, e volta pela aba - o caminho de verdade.
  await page.getByRole('tab', { name: 'Produção' }).click();
  await page.waitForTimeout(2500);
  // A aba responde o dia; lançar é o botão. Esta é a mudança que o dono pediu
  // com todas as letras, e o caminho de verdade passa por ele.
  await page.getByText('Adicionar produção', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.getByLabel(/Quantas unidades/).fill('480');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // E o LOTE nasceu junto, com o código que alguém escreve na caixa. Ele
  // aparece na própria aba de produção, sem pedir toque nenhum: a primeira
  // versão disto era um diálogo depois de gravar, e esta checagem foi quem o
  // derrubou - ela não conseguia mais alcançar a barra de abas.
  // A cena da capa é viva porque a fábrica é: com corrida gravada, o desenho
  // tem o picolé enchendo e a caixa entrando. O que esta checagem alcança é a
  // existência do desenho - animação em si não se afirma num teste de texto,
  // mas um SVG que sumiu, sim.
  const capaViva = await page.locator('svg').count();
  assert.ok(capaViva > 0, 'a cena continua desenhada depois da produção');

  const aba = await screen(page);
  assert.match(aba, /Lotes de hoje/, 'a aba do dia mostra os lotes que nasceram');
  const codigo = aba.match(/\d{8}-\d\d/);
  assert.ok(codigo, 'com o código no formato AAAAMMDD-NN');

  // E o lote abre a etiqueta, que é a razão de ele existir: o quadrado que vai
  // colado na caixa. Esta checagem também é a única que prova que o codificador
  // de QR sobrevive ao empacotamento - ele é o primeiro pedaço de biblioteca de
  // terceiros que este app desenha na tela.
  await page.getByText(codigo[0], { exact: true }).first().click();
  await page.waitForTimeout(2500);

  const etiqueta = await screen(page);
  assert.match(etiqueta, /Etiqueta do lote/, 'a etiqueta abre pelo toque no lote');
  assert.match(etiqueta, new RegExp(codigo[0]), 'e carrega o código por extenso');
  assert.match(etiqueta, /produzido em/, 'com o dia da corrida');
  const quadrados = await page.locator('svg path').count();
  assert.ok(quadrados > 0, 'e o QR está desenhado, não é um espaço vazio');

  // E a tela diz de QUE FICHA aquele lote saiu — a resposta que não existia em
  // lugar nenhum, porque `production_runs` guardava a versão e é apagada ao
  // fechar. Fora do papel branco: a etiqueta só leva o que serve para achar e
  // recolher o produto.
  assert.match(etiqueta, /Saiu da ficha .*, versão \d+\./, 'o lote diz qual ficha rodou');

  await page.goBack();
  await page.waitForTimeout(1800);

  await page.getByRole('tab', { name: 'Início' }).click();
  await page.waitForTimeout(2500);

  const briefing = await screen(page);
  assert.match(briefing, /480/, 'o que saiu aparece na capa');
  assert.match(briefing, /fez [\d.]+ unidades/);
  // E nunca sozinho: sem semana passada com que comparar, a tela diz isso — na
  // legenda em itálico que abre a subtração, que é onde a conta mora agora.
  assert.match(briefing, /primeiro dia com produção registrada/);

  // Com corrida gravada, o histórico curto tem o que dizer - e ele diz corrida
  // por corrida, não o total do dia: 3x100 e 1x300 dão o mesmo total e são
  // semanas diferentes.
  //
  // A peça é ligada antes de ser cobrada: "Últimas corridas" saiu das sete que a
  // capa traz por padrão quando o dono mandou emagrecê-la, e cobrar a frase na capa
  // padrão mediria a preferência em vez do histórico.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/^Colocar na capa: Últimas corridas$/).first().click();
  await page.waitForTimeout(1200);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const comHistorico = await screen(page);
  assert.match(comHistorico, /Últimas corridas/);
  assert.match(comHistorico, /média das últimas/, 'a corrida vem com o normal dela ao lado');

  // E abre NO LUGAR, que é o que o dono pediu: o detalhe aparece sem sair da
  // capa, e o segundo toque fecha.
  await page.getByText('Últimas corridas', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const aberta = await screen(page);
  assert.match(aberta, /toque para fechar/, 'a peça aberta sabe se fechar');
  assert.match(aberta, /\d{8}-\d\d/, 'e mostra o lote da corrida por dentro');

  await page.getByText('Últimas corridas', { exact: true }).first().click();
  await page.waitForTimeout(900);
  assert.doesNotMatch(await screen(page), /toque para fechar/, 'o segundo toque fecha');
});

check('a production marked as under way pulses on the briefing, and closing it writes the ledger', async (page) => {
  // Fábrica parada não desenha nada: o pulso só existe quando há produção em
  // curso, porque pulso ao lado de número congelado é mentira visual.
  //
  // O vocabulário desta checagem mudou junto com o do aplicativo: "tacho" é
  // palavra de fábrica de sorvete, e o dono cobrou — a receita já declara o que
  // rende e em que unidade, então a tela fala disso e não de um recipiente.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /produção em curso|produções em curso/i);

  await page.getByRole('tab', { name: 'Produção' }).click();
  await page.waitForTimeout(2500);
  await page.getByText('Adicionar produção', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.getByText('Começar agora', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // A tela diz desde quando, e o botão principal muda de significado.
  const aberto = await screen(page);
  // Começar devolve para a aba do dia, e é lá que a produção em curso tem
  // cartão - quem marca sai andando, e ficar no formulário seria ficar parado
  // numa tela sem nada a dizer até a produção acabar.
  assert.match(aberto, /Produção em curso/);
  assert.match(aberto, /Picolé de morango/);

  // E a home passa a mostrar o que está acontecendo AGORA.
  await page.getByRole('tab', { name: 'Início' }).click();
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /uma produção em curso/, 'a peça ao vivo mostra o que está rodando');

  // Fechar escreve o razão, e o pulso some porque não há mais produção em curso.
  await page.getByRole('tab', { name: 'Produção' }).click();
  await page.waitForTimeout(2000);
  await page.getByText('Adicionar produção', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.getByLabel(/Quantas unidades/).fill('480');
  await page.waitForTimeout(600);
  await page.getByText('Fechar a produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.getByRole('tab', { name: 'Início' }).click();
  await page.waitForTimeout(2500);
  const depois = await screen(page);
  assert.doesNotMatch(depois, /produção em curso/i, 'a produção fechou');
  assert.match(depois, /480/, 'e o que saiu dela está na capa');
});

check('production pre-fills what the sheet promises, and records what happened', async (page) => {
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Law 2: no field is born empty. The sheet says 40 L, 5% loss, 75 ml a stick,
  // so one kettle promises 506 - and that number is typed by nobody.
  const opened = await screen(page);
  assert.match(opened, /Quantas unidades saíram/i);
  assert.match(opened, /A ficha prevê 506/);
  assert.match(opened, /Vai baixar do estoque/);
  assert.match(opened, /Polpa de morango/);

  // The kettle rendered less than the sheet promised. That correction is the
  // most valuable thing this screen collects, so it has to be visible before
  // anything is written.
  // A quebra é a diferença contra o que a receita PROMETEU para as vezes que ela
  // previsto é só o preenchimento sugerido, e o consumo acompanha o que saiu -
  // não há promessa a quebrar. Então o teste declara as vezes, que é a fábrica
  // que trabalha em corrida, e é dela que o rendimento real é a informação.
  await page.getByText('Informar pela receita', { exact: true }).first().click();
  await page.waitForTimeout(700);
  await page.getByLabel(/Quantas unidades/).fill('480');
  await page.waitForTimeout(700);

  const short = await screen(page);
  assert.match(short, /26 unidades a menos que o previsto/);

  // O que aquele número vira na prateleira - a linha que a prancha desenha
  // embaixo da quantidade. Quem produz conta unidades; quem recebe conta caixas.
  assert.match(short, /dá .*caixas?/i, 'a conversão para embalagem não apareceu');

  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);

  // The confirmation is the app's own and spells the act out in words, with the
  // frozen cost in it - the number every future margin will be measured against.
  const asking = await screen(page);
  assert.match(asking, /Confirmar a produção/, 'Alert would have shown nothing here');
  assert.match(asking, /Você produziu 480 unidades de Picolé de morango, rodando a receita uma vez/);
  assert.match(asking, /congela o custo em R\$ \d+,\d\d por unidade/);

  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // And the ledger moved: eighteen kilos of pulp left the storeroom, which is
  // the whole point of recording production at all.
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const stock = await screen(page);
  assert.match(stock, /22\.000 g/, 'the pulp came down by exactly one kettle');
});

check('a second unclassified product is refused with a sentence, not with SQLite', async (page) => {
  // O exemplo semeado tem um produto sem linha, tipo nem sabor. O índice único
  // da grade trata nulo como valor - decisão registrada na migração 0018, "o
  // mesmo produto não se cadastra duas vezes" -, então o segundo produto sem
  // classificação é recusado.
  //
  // Esta checagem existe porque a recusa chegava como "Error finalizing
  // statement" num diálogo, depois de a pessoa digitar tudo. Nenhuma checagem
  // cadastrava produto pela tela, então o caminho inteiro estava sem cobertura -
  // exatamente o buraco que o CLAUDE.md descreve: passa na unidade, quebra no
  // navegador.
  await page.goto(`http://localhost:${PORT}/products/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Nome').first().fill('Picolé sem classificação');
  await page.waitForTimeout(400);
  await page.getByText('Picolé de morango', { exact: true }).first().click();
  await page.waitForTimeout(700);

  const tela = await screen(page);
  assert.match(
    tela,
    /Já existe .* com essa classificação/,
    'a tela diz o que está ocupado antes de a pessoa tentar salvar',
  );
  assert.match(tela, /catálogo fica em Ajustes/, 'e diz onde é a saída');
  assert.doesNotMatch(tela, /finalizing statement/, 'sem jargão de driver na cara do dono');
});

check('a cold room reading becomes history today, sensor or no sensor', async (page) => {
  // O dono pediu alarme de temperatura e disse que vai arrumar um ESP32. Esta
  // checagem prova o caminho que funciona HOJE: a leitura digitada na conferência
  // é fato, entra na série, e quando o módulo existir ele escreve no mesmo lugar.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Como se chama').fill('Câmara 1');
  await page.waitForTimeout(300);
  // O tipo é um Text com marcador ("○ Câmara fria"), então quem responde pelo
  // clique é o rótulo de acessibilidade e não o texto inteiro.
  await page.getByLabel('Câmara fria', { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  // A câmara nasce sem leitura, e a tela diz isso em vez de mostrar zero grau.
  const nova = await screen(page);
  assert.match(nova, /Câmara 1/);
  assert.match(nova, /nenhuma leitura anotada ainda/);
  assert.match(nova, /Temperatura agora/i, 'e oferece anotar');

  // Almoxarifado não pergunta temperatura: a peça só existe onde decide algo.
  assert.doesNotMatch(nova, /nenhuma leitura anotada ainda[\s\S]*nenhuma leitura anotada ainda/);

  await page.getByLabel('Temperatura agora').first().fill('-18,4');
  await page.waitForTimeout(400);
  await page.getByText('Anotar leitura', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  const comLeitura = await screen(page);
  assert.match(
    comLeitura,
    /última: -18,4 °C/,
    'a fração sobrevive até a tela: meio grau de freezer importa',
  );
  // Sem faixa cadastrada, o app registra e NÃO julga — ele não sabe qual é a
  // temperatura boa da câmara de outra pessoa.
  assert.doesNotMatch(comLeitura, /fora da faixa|dentro da faixa/);

  // Com faixa, a mesma leitura ganha juízo. E a faixa é da CÂMARA: vale para toda
  // leitura que vier dela, inclusive a do sensor que ainda não existe.
  await page.getByText('Faixa aceitável', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('mínima').first().fill('-22');
  await page.getByLabel('máxima').first().fill('-16');
  await page.waitForTimeout(400);
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(2200);

  const comFaixa = await screen(page);
  assert.match(comFaixa, /dentro da faixa/, '-18,4 está entre -22 e -16');

  // E uma leitura fora dela é dita como fora, com a faixa dentro da frase: "fora
  // da faixa" sem dizer qual manda a pessoa procurar o número noutra tela.
  await page.getByLabel('Temperatura agora').first().fill('-8');
  await page.waitForTimeout(400);
  await page.getByText('Anotar leitura', { exact: true }).first().click();
  await page.waitForTimeout(2200);
  assert.match(await screen(page), /fora da faixa de -22 a -16/);

  // E o selo vermelho sozinho não decide nada.
  //
  // Ele responde "o que está diferente agora" e deixa "qual é a próxima ação
  // provável" no ar: quem lê -8 °C precisa saber QUAIS LOTES estavam lá para ir
  // olhar. Com a câmara vazia não há lista — alerta inventado ensina a ignorar.
  assert.doesNotMatch(await screen(page), /ESTAVA NA CÂMARA/, 'câmara vazia não lista lote nenhum');

  // Agora um lote entra nela, e a mesma leitura passa a dizer o que está em risco.
  // Por endereço, e não pela aba: `/places` é tela de pilha e não tem barra de
  // abas — o clique na aba esperaria trinta segundos por algo que não está lá.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('480');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Quanto vai').fill('300');
  await page.waitForTimeout(600);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // A leitura ruim é NOVA, depois da carga: o instante da medição é o que decide
  // quem estava lá, e é por isso que a lista não é o saldo de agora.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Temperatura agora').first().fill('-7');
  await page.waitForTimeout(400);
  await page.getByText('Anotar leitura', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  const exposto = await screen(page);
  assert.match(exposto, /ESTAVA NA CÂMARA ÀS \d\d:\d\d/, 'o alerta diz o que estava em risco');
  assert.match(exposto, /\d{8}-\d\d/, 'com o código do lote, que é o que está escrito na caixa');

  // E a SEMANA aparece desenhada, que é o que uma leitura sozinha não responde:
  // "-18,4 agora" não diz se o freezer está piorando; dois pontos já dizem.
  // Animação não se afirma num teste de texto, mas um desenho que sumiu, sim.
  const linhas = await page.locator('svg path').count();
  assert.ok(linhas > 0, 'a série da câmara está desenhada, não é um espaço vazio');
});

check('the colour bands only exist for an item with a ruler', async (page) => {
  // Desenho do dono: vermelho, amarelo, verde, azul, e zerado à parte. A régua é
  // o "quanto é cheio" do item — sem ela o aplicativo não sabe o que é pouco, e
  // não pinta nada. Esta checagem prova as duas metades: o item sem régua fica
  // sem cor, e o item com régua ganha a faixa certa pelo saldo que tem.
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /do cheio/, 'sem régua, nenhum item fala em porcentagem');

  // Cadastra a régua no açúcar: 46.000 g de saldo contra 500.000 de cheio é 9%,
  // que cai no vermelho.
  await page.getByText('Açúcar cristal').first().click();
  await page.waitForTimeout(2000);
  await page.getByText('Corrigir o cadastro', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.getByLabel(/Quanto é "cheio"/).fill('500000');
  await page.waitForTimeout(500);
  await page.getByText('Salvar correção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  // Corrigir cadastro pede confirmação: é o cadastro que todo custo usa.
  await page.getByText('Confirmar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // 50.000 g de saldo contra 500.000 de cheio é 10%, que cai no vermelho — e a
  // linha DIZ o número, porque cor sozinha não é informação.
  assert.match(await screen(page), /10% do cheio/);
});

check('a listed stick leaves the storeroom when the run is recorded', async (page) => {
  // O defeito que esta checagem prova consertado: o palito só subia. O custo já
  // somava a embalagem desde a correção da produção, mas nenhum movimento tirava
  // palito do almoxarifado - e isso só se vê ligando o cadastro do produto à
  // corrida, do navegador, como o dono faz.
  const naFabrica = async () => {
    await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const texto = await screen(page);
    const achado = texto.match(/Palito de picolé[\s\S]{0,80}?([\d.]+)\s*un/);
    assert.ok(achado, 'o palito tem que aparecer no estoque da fábrica');
    return Number(achado[1].replace(/\./g, ''));
  };

  const antes = await naFabrica();
  assert.ok(antes > 200, 'o exemplo semeado comprou palito');

  // A grade primeiro, porque o produto novo precisa de classificação própria - e
  // é o caminho que o dono percorre no primeiro dia.
  await page.goto(`http://localhost:${PORT}/catalog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Novo produto').first().fill('Picolé');
  await page.waitForTimeout(300);
  await page.getByText('Novo produto', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  // O TIPO entra no meio desde a `V30`: a variação é dele, e não da casa. O dono deu
  // o motivo com o exemplo — "morango leite" e "morango água" são coisas diferentes e
  // usam receitas diferentes, e com o nome único por empresa os dois nem cabiam.
  await page.getByLabel('Novo tipo').first().fill('Tradicional');
  await page.waitForTimeout(300);
  await page.getByText('Novo tipo', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByLabel('Nova variação').first().fill('Uva');
  await page.waitForTimeout(300);
  await page.getByText('Nova variação', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Um produto que declara o palito: um por unidade, escolhido na lista.
  await page.goto(`http://localhost:${PORT}/products/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Picolé', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Uva', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Picolé de morango', { exact: true }).first().click();
  await page.waitForTimeout(700);

  const cadastrando = await screen(page);
  assert.match(cadastrando, /O que sai do estoque por unidade/);
  assert.doesNotMatch(cadastrando, /Já existe .* com essa classificação/);

  await page.getByLabel('Palito de picolé', { exact: true }).first().click();
  await page.waitForTimeout(600);
  const listado = await screen(page);
  assert.match(listado, /Quanto de Palito de picolé por unidade/i);
  assert.match(
    listado,
    /a embalagem listada custa R\$ \d+,\d\d por unidade/,
    'o custo da embalagem listada sai das notas de compra, não de um valor digitado',
  );

  // E a conta aberta FECHA. Com a embalagem listada somando por fora, a tela
  // dizia "R$ 0,59 de massa + R$ 0,05 de embalagem" embaixo de R$ 0,66.
  const conta = listado.match(
    /R\$ ([\d,]+) \| R\$ ([\d,]+) de massa \+ R\$ ([\d,]+) de embalagem do estoque \+ R\$ ([\d,]+) digitado/,
  );
  assert.ok(conta, 'a conta do custo por unidade tem que estar aberta na tela');
  const centavos = (texto) => Math.round(Number(texto.replace(',', '.')) * 100);
  assert.equal(
    centavos(conta[1]),
    centavos(conta[2]) + centavos(conta[3]) + centavos(conta[4]),
    'a soma das partes tem que dar o total que a tela anuncia',
  );

  await page.getByText('Cadastrar produto', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const confirmando = await screen(page);
  assert.match(confirmando, /Cadastrar este produto\?/);
  await page.getByText('Cadastrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /Não deu para cadastrar/);

  // E a corrida gasta um palito por unidade.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Picolé de Uva', { exact: true }).first().click();
  await page.waitForTimeout(900);

  const produzindo = await screen(page);
  assert.match(produzindo, /Palito de picolé/, 'a tela avisa que a corrida vai pedir palito');

  await page.getByLabel(/Quantas unidades/).fill('100');
  await page.waitForTimeout(700);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  const depois = await naFabrica();
  assert.equal(depois, antes - 100, 'cem unidades gastam cem palitos');
});

check('a decimal typed with a dot is the same money as one typed with a comma', async (page) => {
  // Every number this suite ever typed was a whole one - `4`, `700`, `480`,
  // `46000` - so the separator was virgin territory while four screens deleted
  // the dot and four others choked on it. On Android it is not the person who
  // chooses: React Native replaces the platform's key listener with one that
  // "permits all keyboard input through", so whichever separator the keyboard
  // offers is the one that arrives.
  await page.goto(`http://localhost:${PORT}/purchase`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.getByText('Polpa de morango', { exact: true }).first().click();
  await page.getByLabel(/Quantidade, em/).fill('2');
  await page.getByLabel('Total da nota').fill('120.50');
  await page.waitForTimeout(800);

  await page.getByText('Lançar compra').first().click();
  await page.waitForTimeout(900);

  // R$ 120,50 for two buckets. Read the old way it was R$ 12.050,00 - a hundred
  // times the money, spelled out in a sentence the person is about to confirm.
  const asking = await screen(page);
  assert.match(asking, /por R\$ 120,50/, 'the dot was read as a decimal point');
  assert.doesNotMatch(asking, /R\$ 12\.050,00/);
});

check('opening a sheet and touching nothing does not change it', async (page) => {
  // The corruption that needed no phone and no keyboard: the screen wrote the
  // loss back into its own field with `String(2.5)`, read it with a parser that
  // deleted the dot, and 2,5% came back as 25% - with the save button lit and
  // nobody having typed anything.
  await page.goto(`http://localhost:${PORT}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Picolé de morango').first().click();
  await page.waitForTimeout(2500);

  await page.getByLabel('Perda esperada').fill('2,5');
  await page.waitForTimeout(600);
  await page.getByText(/Salvar como versão/).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Salvar', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  // Reopened from scratch, which is what happens when somebody taps in again.
  await page.goto(`http://localhost:${PORT}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByText('Picolé de morango').first().click();
  await page.waitForTimeout(2500);

  const reopened = await page.getByLabel('Perda esperada').inputValue();
  assert.equal(reopened, '2,5', 'the sheet came back saying what was saved');

  // And the screen did not decide, by itself, that there is something to save.
  const text = await screen(page);
  assert.doesNotMatch(text, /25,0%|25%/, 'the loss must not have been multiplied by ten');
});

check('counting is blind, and it is the only way stock goes down', async (page) => {
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Açúcar cristal').first().click();
  await page.waitForTimeout(2000);

  // Two sacks of 25 kg arrived on the first launch, and nothing has left.
  const before = await screen(page);
  assert.match(before, /50\.000 g/);

  await page.getByText('Conferir estoque', { exact: true }).first().click();
  await page.waitForTimeout(600);

  // The rule this app set itself: with the expected number on screen, the
  // person confirms the screen instead of the shelf.
  const blind = await screen(page);
  assert.ok(!/50\.000 g/.test(blind), 'the expected quantity was still visible while counting');
  assert.match(blind, /escondido enquanto você conta/);

  await page.getByLabel('Quanto tem de verdade').fill('46000');
  await page.getByText('Registrar a contagem', { exact: true }).first().click();
  await page.waitForTimeout(900);

  // The whole comparison, in words, before anything is written.
  const asking = await screen(page);
  assert.match(asking, /Você contou 46\.000 g/);
  assert.match(asking, /esperava 50\.000 g/);
  assert.match(asking, /faltando 4\.000 g, que valem R\$ 18,88/);
  assert.match(asking, /nada é apagado/);

  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  const after = await screen(page);
  assert.match(after, /46\.000 g/, 'the shelf and the ledger should now agree');
  assert.match(after, /conferido em/);
});

check('what went out today lands on the transport tab, by destination', async (page) => {
  // Sem saída nenhuma, a tela diz isso em vez de desenhar um zero.
  await page.goto(`http://localhost:${PORT}/transport`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /Nada saiu hoje ainda/);

  // Cria a loja e manda açúcar para lá, pelos mesmos passos que a verificação
  // da transferência já usa - rótulos de verdade, não adivinhados.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Açúcar cristal').first().click();
  await page.waitForTimeout(400);
  await page.getByLabel('Quanto vai').fill('6000');
  await page.waitForTimeout(500);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/transport`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // E a capa NÃO ganha manchete de caixa: açúcar não tem caixa, e "0 caixas"
  // seria número falso. A aba Transporte conta a história inteira.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /caixas? saíram hoje/);

  await page.goto(`http://localhost:${PORT}/transport`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const tela = await screen(page);
  assert.match(tela, /Loja Centro/);
  // Na unidade do item, e a UNIDADE dita: "6.000" sozinho lia-se como seis mil
  // açúcares numa lista que mistura grandezas de propósito. A asserção antiga
  // casava só o número, então passava sem a unidade existir.
  assert.match(tela, /6\.000 g/, 'a quantidade sai na unidade que a pessoa manuseia');
  assert.match(tela, /1 destino/i);
  // O aviso da prancha, agora com lastro: a caixa não foi aberta ainda.
  assert.match(tela, /Loja Centro ainda não conferiu o que chegou/);

  // E conferir é um toque, com a confirmação dizendo o que vai ser gravado.
  await page.getByText(/ainda não conferiu/).first().click();
  await page.waitForTimeout(900);
  const perguntando = await screen(page);
  assert.match(perguntando, /O que chegou em Loja Centro\?/);
  assert.match(perguntando, /6\.000 g/, 'a confirmação diz o que chegou, com a unidade');

  await page.getByText('Conferir chegada', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  const conferido = await screen(page);
  assert.doesNotMatch(conferido, /ainda não conferiu/, 'o aviso sai quando a caixa é aberta');
  assert.match(conferido, /Loja Centro/);

  /**
   * E DESFAZER a conferência, que o aplicativo mandava fazer e não dava como fazer.
   *
   * A recusa da segunda conferência diz, nos três idiomas, "desfaça a conferência no extrato e
   * confira de novo", e a dica da migração 0051 repete no servidor. Até 12 de setembro o único
   * desfazer era por ATO, e a conferência não tem ato próprio — ela mora no grupo da remessa,
   * de propósito, porque é essa chave que faz a trava do servidor reconhecer a mesma carga
   * conferida por dois celulares. Desfazer o ato estornava as pernas da transferência junto: a
   * carga voltava para a fábrica no papel e conferir de novo respondia "remessa não existe".
   *
   * Quatro coisas presas aqui, e nenhuma é visível de dentro de um módulo: a ação existe na
   * tela que a mensagem nomeia; o ato NÃO passa a se chamar "Desfeito" (o extrato dizia
   * "alguma perna estornada" e passaria a esconder o botão de trazer a carga de volta); a doca
   * volta a pedir a conferência (o predicado dela ignorava estorno e mentia para sempre); e
   * conferir de novo funciona, que é a frase inteira que a recusa promete.
   */
  await page.goto(`http://localhost:${PORT}/extrato`, { waitUntil: 'networkidle' });
  await assentar(page);
  const noExtrato = await screen(page);
  assert.match(noExtrato, /Desfazer só a conferência/, 'a ação existe na tela que a mensagem nomeia');
  assert.doesNotMatch(noExtrato, /Desfeito/, 'e o ato ainda não foi desfeito');

  await page.getByRole('button', { name: 'Desfazer só a conferência' }).first().click();
  await page.waitForTimeout(900);
  assert.match(await screen(page), /A carga fica onde está/, 'a confirmação diz que a carga não vai embora');

  await page.getByText('Desfazer só a conferência', { exact: true }).last().click();
  await assentar(page);

  const depois = await screen(page);
  assert.doesNotMatch(
    depois,
    /Desfeito/,
    'o ato NÃO vira "Desfeito": a carga continua de pé, e o botão de trazê-la de volta continua lá',
  );
  assert.doesNotMatch(
    depois,
    /Desfazer só a conferência/,
    'e a ação estreita sai, porque não há mais conferência de pé',
  );

  // A doca volta a pedir a conferência — era ela que ficava mentindo para sempre.
  await page.goto(`http://localhost:${PORT}/transport`, { waitUntil: 'networkidle' });
  await assentar(page);
  assert.match(
    await screen(page),
    /ainda não conferiu/,
    'a doca volta a dizer que falta conferir',
  );

  // E conferir de novo funciona — a frase inteira que a recusa promete.
  await page.getByText(/ainda não conferiu/).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Conferir chegada', { exact: true }).last().click();
  await assentar(page);
  assert.doesNotMatch(await screen(page), /ainda não conferiu/, 'conferida outra vez');

  // Lei 3 na aba também: "1 destino" não é muito nem pouco até estar ao lado do
  // que foi ontem. Esta aba dizia o número do dia sozinho, e num dia sem ontem
  // ela diz isso em vez de inventar uma variação.
  assert.match(
    await screen(page),
    /Ontem não saiu carga|Ontem (foram|foi)/,
    'o número do dia vem com a comparação',
  );

  // E a frase é o fato medido. "Primeira carga registrada" olhava só a janela de
  // ONTEM e nomeava o histórico inteiro: uma fábrica que entrega há dois anos e
  // não entregou no domingo lia isso na segunda-feira.
  assert.doesNotMatch(await screen(page), /[Pp]rimeira carga/);
});

check('the default room can be given a real name, and keeps being the factory', async (page) => {
  /**
   * Renomear não existia em tela nenhuma — e é a primeira coisa que quem instala
   * quer fazer. A sala padrão nasce com o nome VAZIO (a palavra "Fábrica" é da
   * tela), então esta checagem é a que prova a porta por onde ela ganha um nome
   * de verdade. Mudança no que a tela mostra por PADRÃO é mudança de que o
   * navegador faz parte, não do fechamento — regra da casa, com cinco cicatrizes.
   */
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const antes = await screen(page);
  assert.match(antes, /Fábrica/, 'a sala padrão está na tela com o nome que a tela lhe dá');
  assert.match(antes, /Renomear/, 'e o dono vê a porta de renomear');

  // O botão da FÁBRICA, achado pela posição — o primeiro "Renomear" abaixo do
  // título "Fábrica" —, e não por índice. A primeira versão contava dois cartões
  // (cliente semeado + fábrica) e o `e2e` semeia só o exemplo inicial, sem o
  // cliente que o `--com-dado` da foto acrescenta: havia UM cartão e o índice 1
  // não existia. Posição não depende do que está semeado nem da ordem da lista.
  const titulo = await page.getByText('Fábrica', { exact: true }).first().boundingBox();
  assert.ok(titulo, 'o título da fábrica tem posição na tela');
  const botoes = page.getByRole('button', { name: 'Renomear' });
  const total = await botoes.count();
  assert.ok(total >= 1, 'há pelo menos a fábrica para renomear');
  let alvo = null;
  for (let i = 0; i < total; i++) {
    const caixa = await botoes.nth(i).boundingBox();
    if (caixa && caixa.y > titulo.y) { alvo = botoes.nth(i); break; }
  }
  assert.ok(alvo, 'existe um "Renomear" abaixo do título da fábrica');
  await alvo.click();
  await page.waitForTimeout(600);

  await page.getByLabel('Como se chama').first().fill('Galpão 2');
  await page.getByRole('button', { name: 'Salvar lugar' }).first().click();
  await page.getByText('Galpão 2').first().waitFor({ timeout: 10_000 });

  const depois = await screen(page);
  assert.match(depois, /Galpão 2/, 'o nome novo está na tela');
  assert.match(depois, /FÁBRICA/, 'e a sala continua sendo a fábrica — renomear não muda a espécie');
  assert.doesNotMatch(depois, /Galpão 2[^|]*\| *Fábrica/, 'a palavra padrão sai quando há nome de verdade');
});

check('what is in the cold room can leave it, and leaving is a transfer and not a return', async (page) => {
  /**
   * O trajeto interno que não tinha tela — e a metade que faltava era a de SAIR.
   *
   * A câmara fria já podia RECEBER: ela entra na lista de destinos desde sempre. Sair
   * dela só existia marcando devolução, que grava `return` — notícia sobre uma loja,
   * não sobre a nossa câmara. Uma fábrica que guarda a polpa no freezer não tinha como
   * registrar polpa saindo dele, e é exatamente essa fábrica que o produto atende.
   *
   * A checagem é do navegador e não de módulo porque o que faltava era **a tela**: o
   * `recordTransfer` sempre aceitou as duas pontas. Regra da casa, com cinco cicatrizes:
   * mudança no que uma tela mostra por padrão é mudança de que o `e2e` faz parte.
   */
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Câmara 1');
  await page.getByLabel('Câmara fria').first().click();
  await page.waitForTimeout(300);
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Com DUAS salas nossas a pergunta nasce. Com uma só ela não existia, e não
  // existir era certo: a Lei 1 proíbe pedir o que o sistema deduz.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const comCamara = await screen(page);
  assert.match(comCamara, /De qual sala sai/, 'a pergunta aparece quando há mais de uma sala nossa');

  // Primeiro o açúcar entra na câmara — este caminho já existia.
  await page.getByLabel('Câmara 1', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Açúcar cristal').first().click();
  await page.waitForTimeout(400);
  await page.getByLabel('Quanto vai').fill('5000');
  await page.waitForTimeout(500);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // Agora o que não existia: SAIR da câmara. A ponta nossa passa a ser ela.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('De qual sala sai: Câmara 1').first().click();
  await page.waitForTimeout(700);

  const daCamara = await screen(page);
  assert.match(daCamara, /Açúcar cristal/, 'a lista passa a ser o estoque DA CÂMARA');

  // A câmara não se oferece como destino de si mesma — e a pergunta é feita ao
  // RÓTULO, não ao texto da tela. A primeira versão procurava "Câmara 1" seguido de
  // "Para onde vai" dentro de oitenta caracteres: isso mede ORDEM no texto, não
  // pertencimento à lista, e o nome continua na tela de qualquer jeito porque ele é a
  // origem escolhida. Régua que não distingue o caso verdadeiro do falso não responde
  // nada — a opção de destino tem o nome puro por rótulo, e é isso que se conta.
  const comoDestino = await page.getByLabel('Câmara 1', { exact: true }).count();
  assert.equal(comoDestino, 0, 'mandar de uma sala para ela mesma é um movimento que se anula');

  await page.getByLabel('Açúcar cristal').first().click();
  await page.waitForTimeout(400);
  await page.getByLabel('Quanto vai').fill('2000');
  await page.waitForTimeout(500);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);

  const perguntando = await screen(page);
  assert.match(perguntando, /de Câmara 1 para/, 'a confirmação diz que sai DA câmara');

  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // **A asserção que separa esta checagem de uma que só clica:** o razão guarda
  // TRANSFERÊNCIA. Se a única saída da câmara fosse a devolução, aqui estaria escrito
  // "devolução" — e o Espelho da Loja passaria a receber notícia sobre uma loja que
  // não participou de nada.
  await page.goto(`http://localhost:${PORT}/extrato`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const razao = await screen(page);
  assert.match(razao, /Câmara 1/, 'o extrato conhece a câmara');
  assert.doesNotMatch(
    razao,
    /Devolução[\s\S]{0,120}Câmara 1/,
    'sair da nossa câmara não é devolução: devolução é notícia sobre uma loja',
  );
});

check('a store is created, loaded, and the company still has the same sugar', async (page) => {
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // The default place is written with an empty name on purpose - the word is
  // this layer's, in three languages, never the database's.
  const opened = await screen(page);
  assert.match(opened, /Fábrica/);
  assert.match(opened, /Açúcar cristal/);
  assert.match(opened, /vale R\$/, 'a quantity never shows up alone');

  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Only what is actually in the factory is on offer: Law 5 written as design.
  // There is nowhere to pick a thing that is not there from.
  const loading = await screen(page);
  assert.match(loading, /Loja Centro/);
  assert.match(loading, /Açúcar cristal/);
  assert.match(loading, /transferência, não venda/);

  await page.getByLabel('Açúcar cristal').first().click();
  await page.waitForTimeout(400);
  await page.getByLabel('Quanto vai').fill('60000');
  await page.waitForTimeout(500);

  // More than the factory holds is refused before anything is written.
  const tooMuch = await screen(page);
  assert.match(tooMuch, /mais do que tem em Fábrica/);

  await page.getByLabel('Quanto vai').fill('6000');
  await page.waitForTimeout(500);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);

  const asking = await screen(page);
  assert.match(asking, /Você vai mandar 6\.000 g de Açúcar cristal de Fábrica para Loja Centro/);
  assert.match(asking, /a empresa continua com a mesma coisa/);

  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // Two legs, one act: the sugar is in two rooms and the company has all of it.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const after = await screen(page);
  assert.match(after, /Loja Centro/);
  assert.match(after, /6\.000 g/, 'what arrived at the store');
  assert.match(after, /44\.000 g/, 'and what stayed in the factory');

  // A loja nasce sem acordo, e a tela diz isso em vez de inventar um dia.
  assert.match(after, /sem acordo de dia/);

  // E o acordo se combina aqui. O dia é escolhido a QUATRO dias de hoje de
  // propósito: o pedido já oferece hoje, amanhã e depois, então só um dia fora
  // desses três prova que o acordo virou opção nova em vez de coincidir com uma
  // que já existia. Fixar "quinta" faria este teste passar ou falhar conforme o
  // dia em que ele roda.
  const diaAlvo = (new Date().getDay() + 4) % 7;
  const nomeDoDia = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 8, 6 + diaAlvo)));

  await page.getByText('Combinar entrega', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel(nomeDoDia, { exact: true }).first().click();
  await page.waitForTimeout(300);
  await page.getByLabel('Telefone de quem recebe').fill('11 98888-7777');
  await page.waitForTimeout(300);
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  const combinado = await screen(page);
  assert.ok(combinado.includes(`entrega ${nomeDoDia}`), 'o acordo aparece no cartão da loja');
  assert.match(combinado, /11 98888-7777/);
  assert.doesNotMatch(combinado, /sem acordo de dia/);

  // E o pedido para de perguntar o que já foi combinado: a quinta está lá como
  // opção, o que os três chips de hoje/amanhã/depois não davam.
  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const pedindo = await screen(page);
  assert.match(pedindo, /Loja Centro/);
  assert.ok(
    pedindo.includes(nomeDoDia),
    'o dia combinado vira opção no pedido — hoje, amanhã e depois não alcançam',
  );
});

check('a name can be corrected without moving the money', async (page) => {
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  await page.getByText('Glucose 38DE').first().click();
  await page.waitForTimeout(1800);
  await page.getByText('Corrigir o cadastro').first().click();
  await page.waitForTimeout(1800);

  // The price is deliberately not asked again: it belongs to the invoices.
  assert.match(await screen(page), /O preço não é perguntado aqui/);

  await page.getByLabel('Nome').fill('Glucose 38 DE');
  await page.getByText('Salvar correção').first().click();
  await page.waitForTimeout(800);
  await page.getByText('Confirmar', { exact: true }).first().click();
  await page.waitForTimeout(2200);

  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const list = await screen(page);
  assert.match(list, /Glucose 38 DE/, 'the correction stuck');
  assert.match(list, /R\$ 9,80/, 'and the average cost did not move');
});

check('an item can leave circulation without leaving history', async (page) => {
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Glucose 38DE').first().click();
  await page.waitForTimeout(1800);

  await page.getByText('Tirar de circulação').first().click();
  await page.waitForTimeout(800);
  await page.getByText('Tirar', { exact: true }).first().click();
  await page.waitForTimeout(1800);

  // Still itself, still costed - just not offered any more.
  const detail = await screen(page);
  assert.match(detail, /Fora de circulação/);
  assert.match(detail, /R\$ 9,80/);

  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  assert.doesNotMatch(await screen(page), /Glucose/, 'gone from the picker');
});

check('a loss is recorded with its reason, and the report says where the money went', async (page) => {
  // O índice tem a linha, e ela abre uma tela honesta mesmo sem perda nenhuma.
  await page.goto(`http://localhost:${PORT}/losses`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /Nenhuma perda registrada/);

  // Registra uma perda no insumo, com motivo.
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Açúcar cristal').first().click();
  await page.waitForTimeout(2000);

  await page.getByText('Registrar perda', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Quanto se perdeu').fill('4000');
  await page.getByText('Venceu', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText('Registrar a perda', { exact: true }).first().click();
  await page.waitForTimeout(900);

  // A confirmação diz o que vai sair, por que, e quanto vale - antes de gravar.
  const perguntando = await screen(page);
  assert.match(perguntando, /Você vai baixar 4\.000 g de Açúcar cristal: venceu/);
  assert.match(perguntando, /Vale R\$/, 'a perda é dita em dinheiro, não só em quantidade');

  await page.getByText('Registrar a perda', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  // O saldo caiu, e o relatório sabe dizer o que pesou.
  assert.match(await screen(page), /46\.000 g/, 'saiu do saldo do item');

  await page.goto(`http://localhost:${PORT}/losses`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const relatorio = await screen(page);
  assert.match(relatorio, /Açúcar cristal/);
  assert.match(relatorio, /4\.000 g · venceu/);
  assert.match(relatorio, /O que mais pesou: venceu/);

  // E o dinheiro vem com a janela anterior. Aqui não existe nenhuma, e a tela
  // diz isso em vez de fingir que a fábrica melhorou cem por cento.
  assert.match(
    relatorio,
    /primeira janela com perda registrada|nos 30 dias anteriores foram/,
    'a perda do mês vem com o mês anterior',
  );
});

check('three months can be planted from Ajustes, and the briefing changes because of it', async (page) => {
  // A capa de uma instalação virgem não tem com o que comparar, e diz isso.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /Mudou desde a última vez/);

  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const ajustes = await screen(page);
  assert.match(ajustes, /Plantar três meses de movimento/);
  // A confirmação diz o que vai escrever antes de escrever.
  assert.match(ajustes, /livro-razão fica com esses lançamentos/);

  await page.getByText('Plantar', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText('Plantar', { exact: true }).last().click();

  /**
   * Espera o AVISO de pronto, não um relógio — a mesma lição do `shot.mjs`.
   *
   * Eram nove segundos fixos, e bastavam. No dia em que a semeadura passou a
   * conferir a prateleira das lojas (mais de cem contagens além das corridas),
   * deixaram de bastar: a checagem lia a tela no meio da escrita e o `Entendi`
   * ainda não existia, então ela estourava esperando um botão que ia aparecer
   * dez segundos depois. Relógio fixo é uma afirmação sobre a máquina de quem
   * roda, e ela envelhece sozinha.
   */
  await page.getByText(/Pronto:.*corridas/).waitFor({ timeout: 240_000 });

  // E o resultado é dito em números, não em "pronto".
  const feito = await screen(page);
  assert.match(feito, /corridas/, 'o resumo conta o que foi escrito');

  await page.getByText('Entendi', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Agora a capa tem passado: o custo mexeu em algum momento das duas semanas,
  // então a linha de estabilidade some ou passa a contar dias.
  //
  // A peça de preço é ligada antes — ela saiu das sete que a capa traz por padrão, e
  // esta checagem é sobre o que as NOTAS causaram, não sobre qual peça vem de fábrica.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/^Colocar na capa: Preços que mexeram$/).first().click();
  await page.waitForTimeout(1200);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const capa = await screen(page);
  // Catorze dias de notas moveram o custo pelo menos uma vez, e a capa DIZ
  // isso. A asserção era negativa - "não fala mais em estabilidade" - e virou
  // tautologia no dia em que aquela linha saiu da tela: com o cartão removido,
  // ela passaria mesmo se a capa tivesse ficado muda. A positiva é a mesma
  // pergunta feita de um jeito que só o dado responde.
  assert.match(capa, /Mudou desde a última vez/, 'a capa conta a alta que as notas causaram');
  assert.match(capa, /▲ \d+,\d%|▼ \d+,\d%/, 'com o tamanho da mudança, em percentual');

  // E a régua da semana está lá: sete colunas de produção, que é o que o dono
  // pediu quando disse que o custo do morango não interessava.
  /**
   * A manchete é o que saiu do tacho HOJE — e no domingo não sai nada.
   *
   * Esta linha era `assert.match(capa, /fez N unidades/)` e passava seis dias por
   * semana. No domingo, 6 de setembro, ela ficou vermelha sozinha: o simulador
   * deixa o domingo quieto de propósito (`weekday === 0 -> continue` em
   * `simulate.ts`, "uma semana em que todo dia é igual ensina a comparar ruído
   * com ruído"), então a capa dizia a verdade e a checagem chamava de defeito.
   *
   * A correção não é afrouxar para "uma coisa ou outra" — isso passaria com o
   * aplicativo dizendo a frase errada no dia errado. A checagem passa a saber que
   * dia é, pela MESMA regra do simulador, e cobra a frase daquele dia: no domingo
   * a manchete tem que dizer que não produziu E a comparação tem que estar lá,
   * porque o zero de hoje sem "ontem" ao lado é a Lei 3 quebrada justamente no
   * dia em que ela mais importa.
   */
  const domingo = diaDaSemanaDaFabrica() === 0;
  if (domingo) {
    assert.match(capa, /ainda não produziu/, 'no domingo quieto, a capa diz que não produziu');
    // Sem distinguir maiúscula: o rótulo da comparação é desenhado em
    // versalete, e o texto que chega à checagem vem em caixa alta.
    assert.match(capa, /ontem/i, 'e diz contra o que o zero de hoje se compara');
    assert.match(capa, /[\d.]+ unidades|·\s*hoje/i, 'com o número do dia anterior por extenso');
    // E não chama de primeiro dia uma fábrica com três meses de razão: a conta
    // por extenso dizia "primeiro dia com produção registrada" ao lado das
    // quinhentas unidades de ontem, porque a condição olhava só o mesmo dia da
    // semana passada — que num domingo é zero por ser domingo.
    assert.doesNotMatch(capa, /primeiro dia com produção/, 'e não chama isso de primeiro dia');
  } else {
    assert.match(capa, /fez [\d.]+ unidades/, 'a manchete da capa é o que saiu do tacho');
  }
  // E o diagrama da conta desenhou: a subtração por extenso só existe quando as
  // duas referências e o número de hoje chegaram juntos. Sem esta linha, a
  // checagem passaria com a manchete sozinha — que é metade da Lei 3.
  assert.match(capa, /\d[\d.]* − \d[\d.]* = /, 'com a conta aberta embaixo dela');
});

check('a run recorded wrong is corrected by reversal, not by deleting it', async (page) => {
  // O primeiro escritor de estorno do aplicativo, dirigido como uma pessoa
  // dirige: produção → o lote do dia → corrigir. A fundação da capa deste
  // projeto diz que se corrige assim e nunca por exclusão, e até esta
  // checagem existir a promessa nunca tinha sido executada num navegador.
  // Uma corrida lançada de verdade, para ter o que corrigir. É o erro do
  // enunciado da fundação: alguém digita 500 onde eram 50.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('500');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/production`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const antes = await screen(page);
  const feitoAntes = Number((antes.match(/Produzido hoje \| ([\d.]+)/) ?? [])[1]?.replace(/\./g, '') ?? '0');
  assert.ok(feitoAntes >= 500, `a corrida entrou (produzido hoje: ${feitoAntes})`);

  // O lote é o caminho: é o código que alguém lê em voz alta.
  const codigo = (antes.match(/\d{8}-\d{2}/) ?? [])[0];
  assert.ok(codigo, 'a corrida gerou um lote com código');
  await page.getByText(/^\d{8}-\d{2}$/).first().click();
  await page.waitForTimeout(2000);
  // O endereço da etiqueta, guardado: depois da correção o lote sai da lista
  // do dia, e a única maneira de voltar nela é pelo endereço - que é o que o
  // QR da caixa faz.
  const enderecoDaEtiqueta = page.url();

  const etiqueta = await screen(page);
  assert.match(etiqueta, /Etiqueta do lote/);
  assert.match(etiqueta, /Corrigir esta corrida/, 'a etiqueta oferece o conserto');

  await page.getByText('Corrigir esta corrida', { exact: true }).first().click();
  await page.waitForTimeout(1200);

  // A confirmação diz o que vai acontecer, com os números por extenso e os
  // dois lados: o que sai do estoque e o que volta para o almoxarifado.
  const pergunta = await screen(page);
  assert.match(pergunta, /Sai do estoque/, 'a confirmação abre a conta antes de escrever');
  assert.match(pergunta, /Volta para o almoxarifado/);
  assert.match(pergunta, /nada é apagado/i, 'e diz que o registro original fica');

  await page.getByText('Corrigir', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  // O saldo do dia caiu pelo tamanho do lote. Não é o lote que sumiu: é um
  // lançamento novo, contrário, que o livro-razão somou.
  await page.goto(`http://localhost:${PORT}/production`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const depois = await screen(page);
  const feitoDepois = Number((depois.match(/Produzido hoje \| ([\d.]+)/) ?? [])[1]?.replace(/\./g, '') ?? '-1');
  assert.ok(
    feitoDepois < feitoAntes,
    `o estorno tinha de baixar o produzido de hoje (era ${feitoAntes}, ficou ${feitoDepois})`,
  );

  // E o lote sai da lista do dia: "lotes de hoje" responde o que foi produzido
  // hoje, e uma corrida corrigida não foi.
  assert.doesNotMatch(depois, new RegExp(codigo), 'o lote corrigido sai da lista do dia');

  // Mas ele NÃO foi apagado - a etiqueta pode já estar colada numa caixa, e
  // quem lê o QR precisa achar alguma coisa. O que ele acha é a verdade:
  // esta corrida já foi corrigida, e o botão de corrigir não está mais lá.
  await page.goto(enderecoDaEtiqueta, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const outraVez = await screen(page);
  assert.match(outraVez, /Etiqueta do lote/, 'o lote não foi apagado');
  assert.match(outraVez, /já foi corrigida/, 'e a etiqueta diz o que aconteceu com ela');
  assert.doesNotMatch(
    outraVez,
    /Corrigir esta corrida/,
    'estornar duas vezes dobraria a correção, então nem é oferecido',
  );
});

check('an entry recorded wrong is undone from the item, and the balance comes back', async (page) => {
  // A fundação diz que se corrige por estorno, nunca por exclusão — e até agora
  // só a corrida de produção tinha por onde. A nota digitada com dez sacos onde
  // era um, a perda de 40 onde era 4 e o zero contado com o dedo torto ficavam no
  // razão para sempre. Esta checagem dirige o caminho novo como uma pessoa
  // dirige: almoxarifado → o item → o lançamento → desfazer.
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await assentar(page);

  await page.getByText('Açúcar cristal', { exact: true }).first().click();
  await assentar(page);

  const antes = await screen(page);
  assert.match(antes, /Últimos lançamentos/, 'a tela do insumo mostra o que foi lançado');
  assert.match(antes, /Compra/, 'e a compra semeada está entre eles');
  const saldoAntes = Number(
    (antes.match(/Em estoque[\s\S]{0,80}?([\d.]+) g/) ?? [])[1]?.replace(/\./g, '') ?? '-1',
  );
  assert.ok(saldoAntes > 0, `o insumo tem saldo para conferir (leu ${saldoAntes})`);

  await page.getByText('Compra', { exact: true }).first().click();
  await assentar(page);

  // A confirmação abre a conta antes de escrever, com os dois lados e a promessa
  // de que o registro original fica.
  const pergunta = await screen(page);
  assert.match(pergunta, /Desfazer esta Compra\?/, 'a pergunta nomeia o ato');
  assert.match(pergunta, /Sai do estoque/, 'e diz o que sai');
  assert.match(pergunta, /nada é apagado/i, 'e que nada some do registro');

  await page.getByText('Desfazer', { exact: true }).last().click();
  await assentar(page);

  const depois = await screen(page);
  const saldoDepois = Number(
    (depois.match(/Em estoque[\s\S]{0,80}?([\d.]+) g/) ?? [])[1]?.replace(/\./g, '') ?? '-1',
  );
  assert.ok(
    saldoDepois < saldoAntes,
    `desfazer a compra tinha de baixar o saldo (era ${saldoAntes}, ficou ${saldoDepois})`,
  );

  // E o lançamento continua lá, dizendo o que aconteceu com ele: corrige-se por
  // estorno, e o estorno não apaga a linha que corrigiu.
  assert.match(depois, /já corrigido/, 'a linha original fica, marcada');
  assert.match(depois, /Correção/, 'e a correção aparece como lançamento novo');
});

check('the app speaks the three languages it was written in, and the money follows', async (page) => {
  // O dicionário tem os três idiomas desde a primeira tela — a compilação quebra se
  // alguém escrever texto em um só — e até 4 de setembro **nada levava ninguém até
  // dois deles**: `useLocale` devolvia uma constante. Esta checagem dirige o caminho
  // que passou a existir, e ela precisa do navegador por duas razões: trocar idioma é
  // um provedor no topo da árvore relido por 33 telas, e o PADRÃO vem do aparelho —
  // que nesta suíte é declarado como brasileiro, no contexto de cada checagem.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await assentar(page);

  // Primeiro dia, aparelho brasileiro: o aplicativo abre em português sem ninguém
  // escolher nada. É a regra escrita no provedor — o celular é o melhor palpite no
  // dia em que a empresa nasce, e nada mais depois disso.
  const portugues = await screen(page);
  assert.match(portugues, /Idioma e moeda/, 'a escolha existe na tela de Ajustes');
  assert.match(portugues, /Escolha da empresa/, 'e ela diz que é da empresa, não do aparelho');
  assert.match(portugues, /O que está guardado/, 'o aplicativo seguiu o idioma do aparelho');

  // A moeda é outra pergunta, e a lista mostra a mesma quantia escrita como cada
  // moeda escreve — que é a prova de que o formato acompanha a moeda.
  assert.match(portugues, /BRL · Real/);
  assert.match(portugues, /Peso mexicano/);

  await page.getByText('English', { exact: true }).first().click();
  await assentar(page);

  const ingles = await screen(page);
  assert.match(ingles, /Language and currency/, 'a seção trocou de idioma');
  assert.match(ingles, /What is stored/, 'e a tela INTEIRA trocou, não só o cartão');
  assert.doesNotMatch(ingles, /O que está guardado/, 'nada de duas línguas na mesma tela');
  assert.match(ingles, /Mexican peso/, 'a lista de moedas fala o idioma escolhido');

  // E a escolha sobrevive a sair da tela: ela está na gaveta da empresa, não no
  // estado de um componente.
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await assentar(page);
  const almoxarifado = await screen(page);
  assert.match(almoxarifado, /Storeroom/, 'a lista abriu no idioma escolhido');
  assert.doesNotMatch(almoxarifado, /Almoxarifado/, 'e não no do aparelho');

  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await assentar(page);
  assert.match(await screen(page), /Language and currency/, 'e continua em inglês ao voltar');
});

check('the app has two faces, and the choice survives leaving the screen', async (page) => {
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const ajustes = await screen(page);
  assert.match(ajustes, /A cara do aplicativo/, 'a escolha da identidade está nos ajustes');
  assert.match(ajustes, /Orgânico/);
  assert.match(ajustes, /Papel/);

  // Trocar para o Papel muda a cara, e a prova é o fundo: o Orgânico é
  // esverdeado, o Papel é creme. Cor de fundo é o que não dá para fingir.
  const fundo = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByText('Papel', { exact: true }).first().click();
  await page.waitForTimeout(1200);

  // E ela sobrevive a sair da tela: a escolha vai para a gaveta local, não para
  // o estado do componente. Sem isso, voltar à capa traria a cara antiga.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const depois = await screen(page);
  assert.match(depois, /A cara do aplicativo/, 'os ajustes continuam de pé depois da troca');
  assert.ok(await fundo(), 'a tela desenhou com alguma cor de fundo');

  // A paleta da paisagem só existe no Orgânico: o Papel tem uma cara só, e
  // oferecer cinco cores de capa para uma revista impressa seria oferecer o que
  // a identidade não tem.
  assert.doesNotMatch(depois, /A cor da paisagem/, 'o Papel não tem paleta para escolher');

  await page.getByText('Orgânico', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  const comPaleta = await screen(page);
  assert.match(comPaleta, /A cor da paisagem/, 'o Orgânico tem');
  assert.match(comPaleta, /Terracota/, 'com as cinco paletas por nome');
});

check('the app opens light even on a phone set to dark, and the light is switchable', async (page) => {
  // O celular está no escuro. Este é o ponto inteiro da checagem: o defeito que
  // o dono relatou era o aplicativo OBEDECER isto, sem controle nenhum na tela —
  // "nao consigo mudar o tema papel de dark para o light".
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // A luminância do fundo é o que não dá para fingir: um rótulo dizendo "Claro"
  // aceso ao lado de uma tela preta é exatamente o tipo de mentira que a
  // varredura de rótulos deste projeto passou o dia caçando.
  // Quem PINTA, e não o `body`.
  //
  // A primeira versão desta medida lia `document.body`, e ele é transparente
  // aqui: a luminância dava 0.00 nos dois temas, e a checagem teria reprovado
  // sempre — ou, pior, passado sempre se eu tivesse escrito a comparação ao
  // contrário. A checagem antiga da identidade só afirma que a cor de fundo
  // "existe", que é verdade de graça pelo mesmo motivo.
  //
  // Então: o maior elemento da tela que tem cor de fundo opaca, que é a chapa
  // sobre a qual tudo é desenhado.
  const luz = () =>
    page.evaluate(() => {
      let melhor = null;
      let area = 0;
      for (const el of document.querySelectorAll('*')) {
        const cor = getComputedStyle(el).backgroundColor;
        const n = cor.match(/[\d.]+/g);
        if (!n || n.length < 3) continue;
        if (n.length > 3 && Number(n[3]) < 0.9) continue;
        const r = el.getBoundingClientRect();
        const a = r.width * r.height;
        // `>=` e não `>`, e isto é a cicatriz desta checagem.
        //
        // O React Native Web põe uma chapa cinza fixa (rgb(242,242,242)) do
        // tamanho exato da janela, e a chapa do aplicativo tem a MESMA área. Com
        // `>` ficava a primeira em ordem de documento, que é a fixa — a medida
        // dava 0.95 nos dois temas, e a asserção de "abre claro" passava pelo
        // motivo errado, medindo uma coisa que nunca muda. Empate se resolve por
        // quem está por cima, que é quem vem depois no documento.
        if (a >= area) {
          area = a;
          melhor = n.slice(0, 3).map(Number);
        }
      }
      if (!melhor) return null;
      return (0.2126 * melhor[0] + 0.7152 * melhor[1] + 0.0722 * melhor[2]) / 255;
    });

  const inicial = await luz();
  assert.ok(
    inicial > 0.6,
    `o aplicativo abre CLARO mesmo com o aparelho no escuro (luminância ${inicial.toFixed(2)})`,
  );

  const ajustes = await screen(page);
  assert.match(ajustes, /A luz da tela/, 'a luz da tela se escolhe nos ajustes');
  assert.match(ajustes, /Claro/);
  assert.match(ajustes, /Escuro/);
  assert.match(ajustes, /Seguir o aparelho/);

  await page.getByText('Escuro', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  const escuro = await luz();
  assert.ok(escuro < 0.3, `escolher Escuro escurece a tela de verdade (luminância ${escuro.toFixed(2)})`);

  // E a escolha sobrevive a sair da tela: vai para a gaveta local do aparelho,
  // não para o estado do componente.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.ok((await luz()) < 0.3, 'e continua escura depois de sair e voltar');

  // O terceiro caminho existe de verdade: com o aparelho no escuro, seguir o
  // aparelho tem que dar escuro — senão "Seguir o aparelho" seria um rótulo que
  // não segue nada.
  await page.getByText('Claro', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  assert.ok((await luz()) > 0.6, 'voltar para Claro clareia, com o aparelho ainda no escuro');

  await page.getByText('Seguir o aparelho', { exact: true }).first().click();
  await page.waitForTimeout(1200);
  assert.ok((await luz()) < 0.3, 'e seguir o aparelho, que está no escuro, escurece');
});

check('the home is assembled from pieces the house chose', async (page) => {
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const ajustes = await screen(page);
  assert.match(ajustes, /O que aparece na tela inicial/, 'a capa é configurável nos ajustes');
  assert.match(ajustes, /Produção do dia/);
  assert.match(ajustes, /Tempo/);
  // A produção ao vivo nasce LIGADA, e é aqui que isso se prova: numa
  // instalação virgem a capa mostra o convite do primeiro dia no lugar das
  // peças vazias, então cobrar o nome dela na capa provaria o contrário do que
  // se quer — que a peça aparece sem ter o que dizer.
  assert.match(ajustes, /Produção ao vivo/, 'a produção ao vivo entra na capa por padrão');

  // Esconder o tempo neste aparelho tira o cartão da capa - e a ordem que a
  // casa combinou continua a mesma para todo mundo.
  const linhaDoTempo = page.getByLabel(/^Tempo: (Esconder|Mostrar)$/);
  await linhaDoTempo.first().click();
  await page.waitForTimeout(1200);
  assert.match(await screen(page), /escondido aqui/, 'a peça escondida diz que está escondida');

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const semTempo = await screen(page);
  assert.doesNotMatch(
    semTempo,
    /medido às|trocar a cidade/,
    'o cartão do tempo sai da capa deste aparelho',
  );
  // E o custo firme DIZ que está firme — depois de LIGAR a peça de preço.
  //
  // A peça de preço só existia quando algo mexia, então a capa de quem tem o custo
  // estável era igual à de quem instalou ontem — e "está tudo bem" é estado válido.
  // A frase é o chamador de produção de `lastCostMove`, que a auditoria tinha
  // marcado como implementada e sem chamador nenhum, nem de teste.
  //
  // **A checagem passou a ligar a peça antes de cobrar a frase, e isso é conserto de
  // uma afirmação que envelheceu.** Ela nasceu quando "Preços que mexeram" vinha na
  // capa por padrão; a capa emagreceu e a peça virou opcional, então o que a checagem
  // media deixou de ser "a frase existe" e passou a ser "a peça está ligada por
  // padrão" — que é outra coisa, e não é o que o comentário acima diz. Cobrar a frase
  // na capa padrão provaria o contrário do que se quer.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // Peça FORA da capa não tem "Esconder/Mostrar": ela tem "Colocar na capa", que é
  // outra lista e outro rótulo. Errar isso deu um `locator.click` esperando trinta
  // segundos por um alvo que não existe — e o erro dizia "timeout", não "rótulo
  // errado", que é a cara de toda espera por seletor inventado.
  await page.getByLabel(/^Colocar na capa: Preços que mexeram$/).first().click();
  await page.waitForTimeout(1200);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  assert.match(
    await screen(page),
    /Tudo estável/,
    'a capa diz que o custo está firme em vez de calar',
  );

  // E volta quando alguém quer de volta: esconder não é apagar.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/^Tempo: (Esconder|Mostrar)$/).first().click();
  await page.waitForTimeout(1200);
  assert.doesNotMatch(await screen(page), /Tempo · escondido aqui/);

  // O que nasce FORA da capa aparece para ser ligado, senão "quem quiser liga" é
  // uma frase sem botão. O tacho é o caso: o dono cortou ele da primeira tela.
  const ajustesComFora = await screen(page);
  assert.match(ajustesComFora, /FORA DA CAPA/);
  assert.match(
    ajustesComFora,
    /Custo por unidade|Dinheiro parado/,
    'o que nasce fora da capa aparece para ser ligado',
  );

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const capa = await screen(page);
  assert.match(capa, /ainda não produziu/, 'a capa virgem convida');
  // Numa instalação virgem nada foi produzido, e a peça diz isso em vez de
  // convidar para abrir o vazio - "ligar não é forçar" vale para o toque também.
  //
  // A afirmação é sobre ESTA peça, e não sobre a capa inteira: a primeira versão
  // cobrava que nenhuma peça convidasse, passou aqui e reprovou no CI. O tempo
  // convida com razão — ele tem a semana para mostrar —, e a diferença era só a
  // rede: a máquina de desenvolvimento não alcança a previsão, o runner alcança.
  // Teste que depende de haver internet é teste que mente num dos dois lugares.
  // A afirmação anterior era que a peça sem dado DIZIA estar vazia. O dono viu
  // o resultado disso empilhado quatro vezes e recusou; agora a peça sem dado
  // não aparece, e o convite responde por ela. A asserção é a mesma pergunta —
  // "a capa não engana quem não tem dado" — com a resposta que o dono escolheu.
  assert.doesNotMatch(
    capa,
    /Nenhuma corrida registrada ainda|nada saiu ainda|sem saída registrada/,
    'peça sem dado não aparece: o convite responde por todas elas',
  );
});

check('a return says why it came back, and the button does not obey until it does', async (page) => {
  /**
   * A regra do motivo tem três guardas — o tipo, o domínio e o Postgres — e
   * nenhum deles é a TELA. O que esta checagem prova é o único que os outros não
   * alcançam: que o botão **não obedece** enquanto a pergunta não foi
   * respondida (Lei 5, o erro impede em vez de reclamar), e que nenhuma opção
   * nasce marcada — porque um padrão aqui seria o aplicativo respondendo no
   * lugar de quem recebeu a carga de volta.
   */
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByLabel(/Quantas unidades/).fill('600');
  await page.waitForTimeout(600);

  // A EQUIVALÊNCIA à vista, que é o que o dono pediu ao descrever a fábrica do pai:
  // "o app sabe que em cada engradado cabem N unidades por causa dessa equivalência".
  // O produto semeado vai em engradado de 300, então 600 são dois engradados exatos —
  // e o eco tem de dizer isso ANTES de a pessoa gravar, que é onde erro de contagem
  // morre. Sem esta linha, "a tela conta em engradado" é afirmação sobre código.
  const comEco = await screen(page);
  assert.match(comEco, /2 engradados/i, 'a tela ecoa 600 unidades como 2 engradados');

  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // A carga sai primeiro, senão não há o que a loja devolva: em devolução a
  // lista de itens é a do estoque DA LOJA, e não a da fábrica.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Quanto vai').fill('400');
  await page.waitForTimeout(600);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // Agora a devolução. O alternador troca o FATO, não só a direção.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByLabel('A loja devolveu').first().click();
  await page.waitForTimeout(900);
  await page.getByLabel('Loja Centro').first().click();
  await page.waitForTimeout(900);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Quanto vai').fill('100');
  await page.waitForTimeout(900);

  const perguntando = await screen(page);
  assert.match(perguntando, /POR QUE VOLTOU/, 'a devolução pergunta por que voltou');
  assert.match(perguntando, /Não vendeu/, 'com as respostas que mandam fazer coisas diferentes');
  assert.match(perguntando, /Derreteu no caminho/, 'e a que acusa o transporte, não o freezer');

  /**
   * O botão não obedece: clicar sem motivo não abre confirmação nenhuma.
   *
   * `force: true` de propósito, e é ele que faz esta linha provar alguma coisa.
   * Sem ele o Playwright ESPERA o elemento ficar clicável e estoura em trinta
   * segundos — que é o comportamento certo dele e a prova errada: o teste
   * morreria por timeout em vez de afirmar. Forçando o clique, a pergunta passa
   * a ser a que interessa: **o toque chegou e nada aconteceu?**
   */
  await page.getByText('Registrar a devolução', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(900);
  const semMotivo = await screen(page);
  assert.doesNotMatch(
    semMotivo,
    /Registrar esta devolução\?/,
    'sem motivo, o botão não abre a confirmação — o erro impede em vez de reclamar',
  );

  // Com o motivo, o mesmo botão obedece e a devolução entra.
  await page.getByLabel('Não vendeu').first().click();
  await page.waitForTimeout(600);
  await page.getByText('Registrar a devolução', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Trazer de volta', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  /**
   * E o motivo NÃO fica pendurado para a próxima devolução.
   *
   * A pergunta continua na tela — quem devolveu uma vez costuma devolver de novo
   * na mesma visita —, mas a resposta anterior não vale para a carga seguinte:
   * herdar "não vendeu" numa devolução que derreteu é o aplicativo respondendo
   * no lugar da pessoa, e o Espelho da Loja lendo um motivo que ninguém disse.
   *
   * A prova reusa o mecanismo já provado acima: com a quantidade preenchida de
   * novo, a única coisa que falta é o motivo — e o botão continua não obedecendo.
   */
  const depois = await screen(page);
  assert.match(depois, /POR QUE VOLTOU/, 'a pergunta continua ali para a próxima carga');

  await page.getByLabel('Quanto vai').fill('50');
  await page.waitForTimeout(900);
  await page.getByText('Registrar a devolução', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(900);
  const segunda = await screen(page);
  assert.doesNotMatch(
    segunda,
    /Registrar esta devolução\?/,
    'a segunda devolução pergunta de novo: o motivo da anterior não ficou pendurado',
  );
});

check('the load says who else is waiting, and still lets the truck leave', async (page) => {
  // A reserva tinha metade: prometer descontava o que já tinha dono, despachar
  // não. Esta checagem monta exatamente o caso que se perdia — uma loja
  // esperando, a carga saindo para OUTRA — e prova as duas metades que o
  // desenho decide: a frase aparece contra outro destino e NÃO aparece contra
  // quem está esperando (senão ela avisaria contra a própria separação), e o
  // botão continua obedecendo, porque às vezes a loja está na porta.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('500');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // A loja que espera entra primeiro e sozinha: com uma só, o pedido não tem
  // como cair na loja errada e a montagem não depende da ordem da lista.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Quantidade').fill('300');
  await page.waitForTimeout(400);
  await page.getByText('Adicionar ao pedido', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Anotar pedido', { exact: true }).last().click();
  await page.waitForTimeout(900);
  await page.getByText('Anotar', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  // E a outra loja depois, que é para onde a carga vai.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Norte');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(700);

  // Destino é a Loja Centro, que é justamente quem espera: mandar para ela é o
  // que a promessa dela pede. Avisar aqui seria avisar contra a separação, em
  // toda carga legítima — e alerta que aparece sempre ensina a ignorar alerta.
  const paraQuemEspera = await screen(page);
  assert.doesNotMatch(
    paraQuemEspera,
    /já tem dono/,
    'o pedido do próprio destino não é concorrente da carga que vai atendê-lo',
  );

  await page.getByLabel('Loja Norte').first().click();
  await page.waitForTimeout(900);

  // Os MESMOS 500 em estoque, o MESMO pedido de 300: só mudou para onde vai, e
  // agora as 300 têm dono e a tela diz de quem e para quando.
  const paraOutra = await screen(page);
  assert.match(paraOutra, /já tem dono/, 'a carga para outra loja avisa que aquilo tem dono');
  assert.match(paraOutra, /Loja Centro/, 'e diz quem espera, não só quanto');

  // Mandando as 500 inteiras, faltam as 300 de quem esperava.
  await page.getByLabel('Quanto vai').fill('500');
  await page.waitForTimeout(900);
  assert.match(await screen(page), /faltam 300/, 'o aviso conta o que sobra para quem espera');

  // E o botão obedece. Sem `force`: se ele estivesse desligado, o clique
  // estouraria em vez de abrir a confirmação — que é como a devolução prova o
  // contrário, logo acima. Quem está com o caminhão aberto decide melhor que a
  // regra, e o aplicativo sugere, nunca decide calado.
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const dialogo = await screen(page);
  assert.match(dialogo, /Confirmar a transferência/, 'avisar não é impedir: a carga sai se quem está lá mandar');

  // E o diálogo repete a conta, com a frase que só ele tem. O cartão já disse,
  // mas o botão fica embaixo: num telefone a frase de cima pode ter saído da
  // tela quando o dedo chega nele, e este é o instante que vira livro-razão.
  assert.match(
    dialogo,
    /Depois desta carga faltam 300/,
    'a confirmação diz o que vai acontecer, no instante em que dá para desistir',
  );
});

check('a second trip to the freezer suggests what is LEFT of the order', async (page) => {
  // Quem carrega o caminhão faz duas viagens até o freezer - o `ordersCoveredBy`
  // já sabia disso e por isso fecha pedido pelo DIA, não pela carga. O palpite
  // não sabia: depois de mandar 300 de um pedido de 500, ele oferecia 500 de
  // novo, e quem confia no campo manda 800 contra um pedido de 500.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('800');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Quantidade').fill('500');
  await page.waitForTimeout(400);
  await page.getByText('Adicionar ao pedido', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Anotar pedido', { exact: true }).last().click();
  await page.waitForTimeout(900);
  await page.getByText('Anotar', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  // A primeira viagem: 300 dos 500. Carga parcial não fecha pedido, então ele
  // continua aberto - e é aí que a segunda viagem começa.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(700);
  assert.equal(
    await page.getByLabel('Quanto vai').inputValue(),
    '500',
    'na primeira viagem o palpite é o pedido inteiro',
  );
  await page.getByLabel('Quanto vai').fill('300');
  await page.waitForTimeout(500);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(900);

  // O que falta são 200. O tipo `PickLine` sempre disse "o que uma loja pediu e
  // ainda NÃO RECEBEU" - a conta é que não descontava o recebido.
  assert.equal(
    await page.getByLabel('Quanto vai').inputValue(),
    '200',
    'a segunda viagem sugere o que falta, não o pedido inteiro de novo',
  );
  assert.match(await screen(page), /pedido para/, 'e o palpite continua vindo do pedido');
});

check('the code printed on the box opens the label, days later', async (page) => {
  // A etiqueta promete por escrito que "alguém digita os onze caracteres e a
  // conferência segue" — e não havia onde digitar. O cartão de lotes lista o
  // DIA, e quem procura o lote de uma caixa procura horas ou dias depois; o
  // código impresso era um endereço que o aplicativo não sabia abrir.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('400');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/production`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const codigo = (await screen(page)).match(/\d{8}-\d{2}/);
  assert.ok(codigo, 'a produção do dia mostra o código do lote');

  // O caminho de quem está com a caixa na mão: digita o que está impresso.
  await page.getByLabel('Código do lote').fill(codigo[0]);
  await page.waitForTimeout(500);
  await page.getByText('Abrir a etiqueta', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  const etiqueta = await screen(page);
  assert.match(etiqueta, /Etiqueta do lote/, 'o código abre a etiqueta');
  assert.match(etiqueta, new RegExp(codigo[0]), 'e é a etiqueta DAQUELE lote');
  assert.doesNotMatch(
    etiqueta,
    /não está mais aqui/,
    'o código impresso é endereço de verdade, não um caminho para o vazio',
  );

  // E um código que ninguém imprimiu cai no estado vazio que a etiqueta já
  // sabia desenhar, com a porta de volta — em vez de quebrar a tela.
  await page.goto(`http://localhost:${PORT}/lots/99999999-99`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  assert.match(await screen(page), /não está mais aqui/, 'código que não existe diz isso');
});

check('a person is registered with a profile, and the profile says what she may do', async (page) => {
  // A porta "Pessoas" estava na prancha do dono e ficou fora com o motivo
  // escrito: `operator_id` era coluna sem tabela de gente atrás. Esta checagem
  // prova o caminho inteiro pelas mãos de alguém — inclusive que os sete papéis
  // chegam traduzidos, que é a metade que um teste de unidade não alcança.
  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /Pessoas/, 'a porta existe na aba Mais');

  await page.goto(`http://localhost:${PORT}/people`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const vazio = await screen(page);
  assert.match(vazio, /ainda não cadastrou ninguém/, 'nada cadastrado é estado válido e dito');

  // Os sete modelos chegam sozinhos, e chegam com PALAVRA: o banco guarda
  // `driver`, e quem escreve "Entregador" é a tela, em três idiomas.
  assert.match(vazio, /Entregador/, 'o papel semeado aparece traduzido, não como chave');
  assert.match(vazio, /ninguém ainda/, 'e ninguém veste nada antes de existir gente');

  await page.getByText('Cadastrar uma pessoa', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Como se chama').fill('Zeca');
  await page.waitForTimeout(300);
  await page.getByLabel('Entregador').first().click();
  await page.waitForTimeout(400);

  // O perfil escolhido diz o que libera, colado na escolha: sem isso a pessoa
  // escolhe uma palavra em vez de escolher um trabalho.
  const escolhendo = await screen(page);
  assert.match(escolhendo, /Despachar carga/, 'a permissão aparece por extenso');
  assert.doesNotMatch(escolhendo, /Ver custo/, 'e o entregador não vê custo — a ausência é a regra');

  await page.getByText('Salvar pessoa', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  const depois = await screen(page);
  assert.match(depois, /Zeca/, 'a pessoa entra na lista');
  assert.match(depois, /1 pessoa/, 'e o perfil passa a dizer quantos o vestem');
});

check('tapping a name on the grid leaves the grid, even when the grid is the only screen', async (page) => {
  /**
   * A grade chega pela abertura por `router.replace('/who')` — pilha de UMA
   * rota — e saía por `router.back()`, que sem rota atrás não faz nada. Achado
   * por leitura numa análise de olhos novos (E1); esta checagem é o E3: abre
   * `/who` DIRETO, que é a mesma pilha de uma rota, toca num nome e afirma que a
   * página mudou.
   */
  /**
   * **E esta checagem passou pelo motivo errado por um dia.** Ela pedia
   * `getByRole('button').first()` numa instalação virgem — e o exemplo semeado NÃO
   * cadastra gente, então o único botão da tela era o do estado vazio, que leva
   * para "Pessoas". A página mudava, a asserção passava, e nenhum nome tinha sido
   * tocado: o defeito que ela existe para pegar não era exercitado nunca. Agora ela
   * cadastra alguém primeiro e toca no NOME, pelo rótulo dele.
   */
  await page.goto(`http://localhost:${PORT}/people`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar uma pessoa', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Como se chama').fill('Dona Ana');
  await page.getByText('Salvar pessoa', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  await page.goto(`http://localhost:${PORT}/who`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const grade = await screen(page);
  assert.match(grade, /Dona Ana/, 'a grade mostra quem a empresa cadastrou');
  // Com um nome só, a busca NÃO existe: pedir uma caixa de busca para escolher
  // entre um nome é pedir o que a tela já mostra inteiro.
  assert.doesNotMatch(grade, /Procurar pelo nome/, 'com a grade curta não há busca');

  await page.getByLabel('Dona Ana').first().click();
  await page.waitForTimeout(1500);
  assert.doesNotMatch(
    page.url(),
    /\/who(\?|$)/,
    `tocar num nome tem que SAIR da grade; a página continuou em ${page.url()}`,
  );
});

check('the shared phone asks who is holding it, and only when the company names people', async (page) => {
  // A porta não pode existir antes de a empresa nomear: sem isso, "quem está com
  // o aparelho" é pergunta sem consequência — o movimento nasce sem operador de
  // qualquer jeito. Gaveta que abre no vazio é pior que gaveta não desenhada.
  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.doesNotMatch(
    await screen(page),
    /Trocar de pessoa/,
    'sem nomear ninguém, a grade não tem por que existir',
  );

  await page.goto(`http://localhost:${PORT}/people`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar uma pessoa', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Como se chama').fill('Ana');
  await page.waitForTimeout(300);
  await page.getByLabel('Operador').first().click();
  await page.waitForTimeout(400);
  await page.getByText('Salvar pessoa', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  // A empresa liga o nomear. O padrão é desligado por decisão do dono: o
  // relatório fala de onde, não de quem.
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const ajustes = await screen(page);
  assert.match(ajustes, /Nomear quem gravou/, 'a escolha é da empresa e mora nos ajustes');
  assert.doesNotMatch(
    ajustes,
    /Como se entra no chão de fábrica/,
    'e escolher entre dois nadas não aparece antes de haver o que nomear',
  );

  await page.getByLabel('Nomear quem gravou').click();
  await page.waitForTimeout(1200);
  assert.match(
    await screen(page),
    /Como se entra no chão de fábrica/,
    'ligado, a segunda escolha passa a ter sentido e aparece',
  );

  // E agora a porta existe.
  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /Trocar de pessoa/, 'ligado, a grade ganha porta');

  await page.goto(`http://localhost:${PORT}/who`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const grade = await screen(page);
  assert.match(grade, /Ninguém ainda/, 'ninguém se identificou, e isso é dito');
  assert.match(grade, /Ana/, 'e o nome está na grade');
  assert.match(grade, /nunca para cobrar/, 'a tela diz para que o nome serve, e para que não');

  // Sem PIN, um toque só — que é o que uma fábrica de seis pessoas quer.
  await page.getByLabel('Ana').first().click();
  await page.waitForTimeout(2000);

  await page.goto(`http://localhost:${PORT}/who`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /Agora é Ana/, 'a grade passa a dizer quem está com ele');

  /**
   * E AGORA o degrau que faltava: o relatório diz o nome.
   *
   * A chave promete, com estas palavras nos três idiomas: *"Desligado, o relatório fala
   * de onde — 'faltaram 3 caixas na conferência'. Ligado, o aparelho pergunta quem está
   * com ele e cada linha guarda o nome."* Até 11 de setembro ela cumpria a primeira
   * metade e a segunda não existia: sete `INSERT INTO movements` carimbavam
   * `operator_id`, `app/who.tsx` perguntava, o PIN atribuía — e nenhuma consulta lia a
   * coluna de volta. A pergunta era feita para ninguém.
   *
   * Esta checagem existe porque o caminho atravessa QUATRO telas e nenhuma delas sabe
   * das outras: ajustes liga, gente cadastra, a grade escolhe, o razão grava, o extrato
   * lê. Um teste de unidade prova a consulta; só andar o caminho prova que a chave que
   * uma pessoa toca chega no texto que ela depois lê.
   */
  await page.goto(`http://localhost:${PORT}/inputs`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByText('Açúcar cristal').first().click();
  await assentar(page);
  await page.getByText('Registrar perda', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Quanto se perdeu').fill('3000');
  await page.getByText('Venceu', { exact: true }).first().click();
  await page.waitForTimeout(400);
  await page.getByText('Registrar a perda', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar a perda', { exact: true }).last().click();
  await assentar(page);

  await page.goto(`http://localhost:${PORT}/extrato`, { waitUntil: 'networkidle' });
  await assentar(page);
  assert.match(
    await screen(page),
    /por Ana/,
    'ligada a chave, o extrato nomeia quem estava com o aparelho — era esta metade que ' +
      'não existia, com a coluna sendo gravada desde 6 de setembro',
  );

  // E dá para largar: sem isso o nome de quem saiu do turno carimba as caixas de
  // quem entrou, que é pior que não nomear ninguém. (De volta à grade: o bloco acima
  // deixou a página no extrato, e o botão de largar mora aqui.)
  await page.goto(`http://localhost:${PORT}/who`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByText('Largar o aparelho', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  assert.match(await screen(page), /Ninguém ainda/, 'largar o aparelho volta ao anônimo');

  // E largar não apaga o que ela fez: o razão continua dizendo quem era. É por isso que
  // a coluna existe — o turno acaba, o registro não.
  await page.goto(`http://localhost:${PORT}/extrato`, { waitUntil: 'networkidle' });
  await assentar(page);
  assert.match(await screen(page), /por Ana/, 'o turno acabou e o razão continua sabendo');

  /**
   * O outro sentido, e ele só cabe AQUI — o que a primeira tentativa me ensinou.
   *
   * Eu tinha posto este bloco logo depois do extrato, com a Ana ainda com o aparelho, e a
   * checagem reprovou com `getByLabel('Nomear quem gravou')` estourando o tempo. Não era
   * defeito: quem não tem `manage_company` **não vê os cartões da empresa**, por decisão
   * de 9 de setembro — a chave não está na tela para ser desligada. Largar o aparelho
   * devolve o alcance, e é depois disso que o sentido inverso existe.
   *
   * Sem ele a checagem mediria "o extrato diz por Ana", que uma frase cravada satisfaria.
   * Com ele ela mede o que importa: o extrato OBEDECE à chave.
   */
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await assentar(page);
  await page.getByLabel('Nomear quem gravou').click();
  await page.waitForTimeout(1200);
  await page.goto(`http://localhost:${PORT}/extrato`, { waitUntil: 'networkidle' });
  await assentar(page);
  const semNome = await screen(page);
  assert.doesNotMatch(semNome, /por Ana/, 'desligada, o relatório volta a falar só de ONDE');
  assert.match(semNome, /Perda/, 'e o ato continua no razão — a chave é de leitura, não de escrita');
});

check('a load that covers the order offers to close it, and closing it changes the list', async (page) => {
  // A regra do fechamento saiu da tela e foi para o repositório em 6 de setembro,
  // porque a separação passou a precisar da mesma resposta — e duas telas fazendo
  // a mesma conta é como duas verdades nascem. Nenhuma checagem de navegador
  // exercitava essa costura: o `ordersCoveredBy` tinha teste de unidade, e o
  // caminho da tela até o pedido fechado, nenhum.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('500');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Quantidade').fill('300');
  await page.waitForTimeout(400);
  await page.getByText('Adicionar ao pedido', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Anotar pedido', { exact: true }).last().click();
  await page.waitForTimeout(900);
  await page.getByText('Anotar', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  // A carga cobre o pedido inteiro — e o palpite já vem com o número dele.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(700);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // E aí a casa OFERECE fechar. Não fecha sozinha: o aplicativo sugere, nunca
  // decide calado — quem acabou de carregar o caminhão é quem sabe se acabou.
  const oferta = await screen(page);
  assert.match(oferta, /Fechar o pedido dessa loja\?/, 'a carga que cobre o pedido oferece fechá-lo');
  assert.match(oferta, /1 pedido/, 'e diz quantos, porque a loja pode ter mais de um');

  await page.getByText('Fechar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // Fechado, a separação para de pedir o que já saiu. Sem isto, a lista sugeriria
  // o pedido inteiro para sempre e a capa continuaria mandando produzir o que já
  // foi pela porta.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Picolé de morango/).first().click();
  await page.waitForTimeout(700);
  assert.match(
    await screen(page),
    /nenhum pedido em aberto para esta loja/,
    'o pedido fechado sai da lista de separação',
  );
});

check('the picking cart counts in crates, survives the screen, and becomes the load', async (page) => {
  // A separação não grava nada — a carga é um evento só, decisão do dono. Mas ela
  // GUARDA, e é isso que esta checagem prova: a conferência acontece a −18 °C, o
  // celular bloqueia, e uma lista que zera no meio é pior que não existir.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('900');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Quantidade').fill('600');
  await page.waitForTimeout(400);
  await page.getByText('Adicionar ao pedido', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Anotar pedido', { exact: true }).last().click();
  await page.waitForTimeout(900);
  await page.getByText('Anotar', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/picking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const lista = await screen(page);
  assert.match(lista, /0 de 1 itens contados/, 'a separação abre dizendo onde ela está');
  assert.match(lista, /pedido 600/, 'com o que o pedido diz');
  assert.match(lista, /faltam 600/, 'e o que falta, que é o número que decide');

  // A contagem é em ENGRADADO, não em picolé: ninguém na câmara pensa em 3.600
  // unidades. Um toque no mais soma um engradado inteiro — 300 — e o eco embaixo
  // faz a conta para a pessoa conferir a camada antes de gravar.
  await page.getByLabel('Aumentar').first().click();
  await page.waitForTimeout(900);
  const umEngradado = await screen(page);
  assert.match(umEngradado, /1 de 1 itens contados/, 'contou um item');
  assert.match(
    umEngradado,
    /1 engradado = 300 unidades/,
    'e o eco fecha a conta na unidade que o resto do app fala — sem isso, a pessoa na câmara precisa saber de cabeça que um engradado são 300',
  );

  await page.getByLabel('Aumentar').first().click();
  await page.waitForTimeout(900);

  // O carrinho sobrevive à tela: sair e voltar encontra o que foi contado. Sem
  // isto, quem é interrompido no meio da câmara recomeça sem saber onde parou.
  await page.goto(`http://localhost:${PORT}/transport`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.goto(`http://localhost:${PORT}/picking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(
    await screen(page),
    /1 de 1 itens contados/,
    'o carrinho fica guardado no aparelho até a carga sair',
  );

  // E terminar vira carga: uma transferência por item, e o pedido coberto oferece
  // fechar — a mesma regra da tela de transferir, que agora mora num lugar só.
  await page.getByText('Registrar a carga', { exact: true }).first().click();
  await page.waitForTimeout(900);
  const confirma = await screen(page);
  assert.match(confirma, /Mandar o carrinho para Loja Centro\?/);
  assert.match(confirma, /1 item/, 'a confirmação diz quantos itens vão de uma vez');
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(3000);

  assert.match(
    await screen(page),
    /Fechar o pedido dessa loja\?/,
    'a carga que cobre o pedido oferece fechá-lo, venha ela da separação ou da transferência',
  );
});

check('erasing refuses in an order, and explains the way out', async (page) => {
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const text = await screen(page);
  assert.match(text, /Não dá para apagar o almoxarifado enquanto 2 receitas usam o que está nele/);
  assert.match(text, /Não dá para apagar as receitas enquanto 1 produto é feito delas/);

  // Two rows say "Produtos" - one counts them, one erases them - so this
  // clicks the one a screen reader would announce as the action.
  await page.getByLabel('Apagar Produtos').click();
  await page.waitForTimeout(900);

  const asking = await screen(page);
  assert.match(asking, /Apagar produtos\?/);
  assert.match(asking, /Isso apaga 1 produto/);
  assert.match(asking, /Isso não tem volta/);
});

check('an agreed price is typed on the store card and comes back', async (page) => {
  /**
   * A costura que teste nenhum de repositório alcança: o que a TELA guarda no
   * estado, o que ela manda ao salvar, e o que ela lê de volta ao reabrir.
   *
   * `saveSalePrice` tem teste próprio e prova a regra — o combinado vence a tabela,
   * a história registra a mudança, salvar igual não vira linha. O que ele não prova
   * é que o campo da ficha da loja chega até ele: entre os dois há um `Record` de
   * texto digitado, um `parseTyped` que aceita vírgula, e a conversão de reais para
   * taxa. Três lugares onde a tela pode escrever certo e mandar errado.
   */
  // A loja primeiro: cada checagem abre uma instalação VIRGEM, como quem instalou
  // o aplicativo agora — e uma fábrica nova não tem lugar nenhum além do próprio
  // almoxarifado. É o mesmo caminho que a checagem da separação faz, e é ele que
  // torna a asserção uma prova: o lugar existe porque a tela o criou.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  await page.getByText('Combinar entrega', { exact: true }).first().click();
  await page.waitForTimeout(1200);

  const abriu = await screen(page);
  assert.match(abriu, /O QUE ELE PAGA/, 'a ficha do acordo abre com a seção de preço');
  assert.match(
    abriu,
    /Em branco vale o preço de tabela/,
    'e diz o que o vazio SIGNIFICA, que é a pergunta de quem está com o dedo no campo',
  );
  // Sem preço de tabela ainda, e a tela DIZ isso em vez de deixar o campo mudo.
  assert.match(abriu, /sem preço de tabela/);

  // O picolé de morango, a 2,50 — com vírgula, que é o que um teclado brasileiro
  // oferece e o que já quebrou a leitura de preço uma vez neste projeto.
  //
  // Pelo PAPEL, e não pelo rótulo: `getByLabel(/morango/i).first()` passou por
  // semanas e quebrou no dia em que o cartão do lugar ganhou a lista do que ele
  // guarda — a primeira coisa da página a falar de morango passou a ser a LINHA
  // da polpa, que não é campo nenhum. Selector que depende de `.first()` depende
  // da ordem do desenho, e ordem de desenho muda a cada tela nova.
  const campo = page.getByRole('textbox', { name: /morango/i }).first();
  await campo.fill('2,50');
  await page.waitForTimeout(400);
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(2000);

  // E de volta: reabrir é o que prova que foi GRAVADO, e não que ficou no estado
  // do componente. A tela some e volta do banco.
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Combinar entrega', { exact: true }).first().click();
  await page.waitForTimeout(1200);

  /**
   * O valor do CAMPO, e não o texto da tela — e esta linha é a checagem inteira.
   *
   * A primeira versão fazia `assert.match(screen(page), /2,50/)`, passou de
   * primeira, e eu ia entregá-la como prova. O teste de mordida derrubou: com a
   * gravação DESLIGADA ela continuava verde. O que ela casava era `R$ 1.932,50` —
   * o valor do estoque da fábrica, num cartão mais abaixo da mesma página.
   *
   * A causa é mecânica e vale para toda a suíte: `screen()` lê `body.innerText`, e
   * o que está DENTRO de um campo é `value`, que não é texto do documento. Qualquer
   * asserção sobre o que um campo guarda, escrita com `screen()`, ou casa outra
   * coisa ou não casa nada — nunca o campo. Quem responde é `inputValue()`.
   */
  const guardado = await page
    .getByRole('textbox', { name: /morango/i })
    .first()
    .inputValue();
  assert.equal(
    guardado,
    '2,50',
    'o preço combinado volta do banco, com a vírgula que foi digitada',
  );
});

check('the mirror says how much each store returns of what it received', async (page) => {
  /**
   * O Espelho da Loja, dirigido de ponta a ponta.
   *
   * A checagem existe porque a pergunta desta tela é uma FRAÇÃO, e fração é o tipo de
   * número que passa verde estando errado: somar as pernas erradas dá um total
   * plausível. Aqui a carga e a devolução são feitas pela tela, e o número lido de
   * volta é conferido contra a conta que a própria tela abre.
   */
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Sem carga nenhuma a tela diz o que falta acontecer, e não fica em branco — que
  // é a resposta que parece defeito.
  await page.goto(`http://localhost:${PORT}/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByText('Espelho da Loja', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /Nenhuma loja recebeu carga ainda/);

  // Mil gramas para a loja.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Açúcar cristal').first().click();
  await page.waitForTimeout(400);
  await page.getByLabel('Quanto vai').fill('1000');
  await page.waitForTimeout(500);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // E duzentos de volta: um quinto, que é 20,0% — um número que não sai de somar
  // errado por acaso.
  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('A loja devolveu').first().click();
  await page.waitForTimeout(900);
  await page.getByLabel('Loja Centro').first().click();
  await page.waitForTimeout(900);
  await page.getByLabel(/Açúcar cristal/).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Quanto vai').fill('200');
  await page.waitForTimeout(600);
  await page.getByLabel('Não vendeu').first().click();
  await page.waitForTimeout(600);
  await page.getByText('Registrar a devolução', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Trazer de volta', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/mirror`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const espelho = await screen(page);
  assert.match(espelho, /Loja Centro/);
  assert.match(espelho, /20,0% do que chegou voltou/, 'a manchete é a fração, não o total');
  // Lei 6: a conta que produziu a fração fica aberta na linha de baixo.
  assert.match(espelho, /200 g de 1\.000 g que chegaram/, 'a conta abre embaixo da conclusão');
  // Lei 3: e a comparação diz que não há com o que comparar ainda, em vez de
  // inventar uma direção na primeira leitura.
  assert.match(espelho, /primeira janela desta loja/);
  assert.match(espelho, /Não vendeu/, 'e o motivo, que é o que muda o que fazer');
});

check('at tablet width the two columns end level, not ragged', async (page) => {
  /**
   * A única checagem da suíte que abre a tela numa largura de tablet.
   *
   * Todas as outras rodam a 412 dp, onde `pares` nem liga — então o caminho de duas
   * colunas, que é metade do trabalho de layout desta semana, não tinha um único
   * exercício automático. O que provava era a foto, e foto ninguém roda no CI.
   *
   * Ela mede o que o olho mediu: com alternar, "Ajustes" cai debaixo de "Cadastros"
   * (que tem cinco portas) e o pé fica desigual por umas oitocentas unidades; medindo,
   * "Ajustes" se acomoda ao lado de "Lançamentos" e as duas colunas terminam juntas.
   */
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  /**
   * A caixa DEPOIS que ela parou de se mexer — o irmão geométrico do `screen()`.
   *
   * A leitura de texto já espera a tela assentar; a de posição não esperava, e
   * caiu pelo mesmo motivo: a grade de duas colunas é calculada a partir das
   * ALTURAS medidas, e medir antes de a última peça chegar dá um arranjo que
   * ainda vai mudar.
   */
  const caixa = async (texto) => {
    const alvo = page.getByText(texto, { exact: true }).first();
    let anterior = await alvo.boundingBox();
    for (let esperou = 0; esperou < 6_000; esperou += 250) {
      await page.waitForTimeout(250);
      const agora = await alvo.boundingBox();
      if (agora && anterior && agora.x === anterior.x && agora.y === anterior.y) return agora;
      anterior = agora;
    }
    return anterior;
  };
  const cadastros = await caixa('Cadastros');
  const lancamentos = await caixa('Lançamentos');
  const ajustes = await caixa('Ajustes');
  assert.ok(cadastros && lancamentos && ajustes, 'os três grupos têm que estar na tela');
  assert.ok(
    Math.abs(lancamentos.x - cadastros.x) > 100,
    'a 900 dp a gaveta tem que ter DUAS colunas — sem isso o resto não mede nada',
  );
  /**
   * A folga é de COLUNA, não de pixel — e o número tem de vir da distância real.
   *
   * Isto exigia menos de 1 px e reprovou com **2,2**, com o layout certo: as duas
   * colunas estão a mais de quatrocentos pixels uma da outra, e a diferença de
   * dois vinha de arredondamento de medida em ponto flutuante. Uma asserção que
   * distingue coluna não pode ser sensível a ruído de vírgula: o que ela mede é
   * "está na mesma coluna", e para isso a folga certa é uma fração da distância
   * entre elas, não um pixel.
   *
   * Não é afrouxar para ficar verde — é medir a coisa certa. Com 5 px, pôr
   * "Ajustes" na outra coluna continua reprovando por uma diferença 87 vezes
   * maior que a folga.
   */
  const entreColunas = Math.abs(lancamentos.x - cadastros.x);
  assert.ok(
    Math.abs(ajustes.x - lancamentos.x) < 5,
    `"Ajustes" tem que acompanhar "Lançamentos": alternar o poria debaixo de "Cadastros" (x=${ajustes.x} contra ${lancamentos.x} e ${cadastros.x}; as colunas distam ${entreColunas})`,
  );

  await page.setViewportSize({ width: 412, height: 915 });
});

check('a product is registered with what it sells for, and the list says so', async (page) => {
  /**
   * O portão P1 desta peça, exercitado por onde ele reprovou.
   *
   * O preço combinado entrou primeiro e a metade de TABELA ficou sem tela: o caminho
   * de gravação existia e só teste o chamava. Esta checagem é o chamador de produção
   * — cadastra um produto dizendo por quanto ele sai, e depois lê a lista.
   *
   * E ela cobre a divisão que o `access.ts` declara: o campo aparece para quem DEFINE
   * (a empresa decide quanto cobra) e o número aparece para quem VÊ preço de venda.
   * Aqui é o dono, que é os dois.
   *
   * A grade vem primeiro, e não é cerimônia: o índice único da `0018` é
   * `nulls not distinct`, então o exemplo semeado — que não tem classificação — ocupa
   * a casa vazia e o botão morre com "Já existe Picolé de morango com essa
   * classificação". Foi assim que esta checagem falhou três vezes antes de existir.
   */
  await page.goto(`http://localhost:${PORT}/catalog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Novo produto').first().fill('Picolé');
  await page.waitForTimeout(300);
  await page.getByText('Novo produto', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByLabel('Novo tipo').first().fill('Tradicional');
  await page.waitForTimeout(300);
  await page.getByText('Novo tipo', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByLabel('Nova variação').first().fill('Coco');
  await page.waitForTimeout(300);
  await page.getByText('Nova variação', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`http://localhost:${PORT}/products/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Picolé', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Coco', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Picolé de morango', { exact: true }).first().click();
  await page.waitForTimeout(700);

  // O que se digita num campo não é texto na tela — `screen()` lê `innerText`, e
  // `value` de input não mora lá. Por isso a leitura de volta é `inputValue()`.
  await page.getByLabel('Por quanto você vende').first().fill('2,50');
  await page.waitForTimeout(400);
  assert.equal(await page.getByLabel('Por quanto você vende').first().inputValue(), '2,50');

  await page.getByText('Cadastrar produto', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Cadastrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /Não deu para cadastrar/);

  await page.goto(`http://localhost:${PORT}/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const lista = await screen(page);
  assert.match(lista, /Picolé de Coco/, 'o produto entrou');
  // O preço ao lado do rendimento: é essa vizinhança que faz a coluna do custo,
  // à direita, decidir alguma coisa (Lei 3).
  assert.match(lista, /vende a R\$ 2,50/, 'e a lista diz por quanto ele sai');
});

const server = serve();

check('a carrier is registered, chosen on the load, and named on the day', async (page) => {
  /**
   * A transportadora de ponta a ponta — cadastro, escolha, e quem levou na tela.
   *
   * **A costura que teste de repositório nenhum alcança.** O `carrier_id` só vale
   * se três telas concordarem: a que cadastra, a que escolhe na hora da carga, e a
   * que conta o dia. E o caso que mais importa é o do MEIO — a escolha só existe
   * quando há transportadora cadastrada, então uma fábrica que entrega no carro
   * dela nunca vê a pergunta. Isso é decisão de desenho (Lei 1), e é exatamente o
   * tipo de coisa que um teste de módulo não sabe olhar.
   */
  // Sem transportadora nenhuma, a pergunta NÃO existe. Esta é a metade que
  // ninguém pensa em provar, e é a que protege a fábrica que entrega no carro dela.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('900');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja Centro');
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  /**
   * O PEDIDO vem antes, e sem ele esta checagem passaria pelo motivo errado.
   *
   * A lista da separação só existe quando há pedido aberto para a loja — sem
   * pedido, a tela diz "nada para separar" e a pergunta "quem leva" não está lá
   * **por outro motivo**. A primeira versão afirmava a ausência dela nesse estado e
   * passava verde sem provar nada; foi a metade POSITIVA que reprovou e me contou.
   */
  await page.goto(`http://localhost:${PORT}/orders/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel('Quantidade').fill('600');
  await page.waitForTimeout(400);
  await page.getByText('Adicionar ao pedido', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByText('Anotar pedido', { exact: true }).last().click();
  await page.waitForTimeout(900);
  await page.getByText('Anotar', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/picking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const semTransportadora = await screen(page);
  assert.match(
    semTransportadora,
    /0 de 1 itens contados/,
    'a separação tem de estar mostrando a lista — senão a ausência da pergunta não prova nada',
  );
  assert.doesNotMatch(
    semTransportadora,
    /QUEM LEVA|Quem leva/,
    'sem transportadora cadastrada a pergunta não aparece — Lei 1, não se pede o que se pode deduzir',
  );

  // Agora ela existe.
  await page.goto(`http://localhost:${PORT}/carriers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const vazia = await screen(page);
  assert.match(vazia, /Nenhuma cadastrada/, 'a tela diz o que a ausência SIGNIFICA');
  await page.getByText('Cadastrar transportadora', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByLabel('Nome').fill('Transportes Silva');
  await page.getByLabel('Telefone').fill('11 98888-0000');
  await page.getByText('Salvar transportadora', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  assert.match(
    await screen(page),
    /Transportes Silva/,
    'o cadastro volta do banco, com o telefone que alguém liga quando a carga não chega',
  );

  // E a separação passa a perguntar, com o carro da fábrica já marcado.
  await page.goto(`http://localhost:${PORT}/picking`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /Quem leva/, 'com transportadora cadastrada, a pergunta existe');

  await page.getByLabel('Aumentar').first().click();
  await page.waitForTimeout(900);
  await page.getByLabel('Transportes Silva').first().click();
  await page.waitForTimeout(600);
  await page.getByText('Registrar a carga', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Mandar', { exact: true }).first().click();
  await page.waitForTimeout(3000);

  // O dia diz quem levou. É o LEITOR que justifica a coluna existir.
  await page.goto(`http://localhost:${PORT}/transport`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.match(
    await screen(page),
    /levou Transportes Silva/,
    'o cartão do destino nomeia quem levou a carga do dia',
  );
});

check('o caminho de trás pergunta o que você fez e mostra quanto falta', async (page) => {
  /**
   * A checagem que o navegador PODE fazer sobre `app/fiz.tsx`, e a fronteira dita.
   *
   * O que ela prova: a tela monta, o dicionário tem as chaves nos três idiomas (texto em
   * falta apareceria como chave crua), a frase é aceita e guardada, a escada aparece, e o
   * degrau de AGORA é o primeiro que falta de verdade contra o banco semeado.
   *
   * O que ela NÃO prova, e é a regra desta casa desde 11 de setembro: o navegador não
   * prova gesto que o navegador não tem. A volta por tecla, a partida a frio por intent e
   * a foto do movimento continuam sendo do aparelho.
   */
  await page.goto(`http://localhost:${PORT}/fiz`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const entrada = await screen(page);
  assert.match(entrada, /O que você fez\?/, 'a tela abre pela pergunta, não por um formulário');
  // MAIÚSCULAS porque é assim que a tela escreve: `Field` desenha o rótulo com
  // `label.toUpperCase()`. Asserção que procura o que o dicionário diz em vez do que a
  // tela mostra reprova com a tela certa — foi o que aconteceu na primeira escrita desta
  // linha.
  assert.match(entrada, /O QUE SAIU/, 'e o campo da frase está lá');
  // A escada NÃO aparece antes da frase: mostrar o caminho antes de saber para onde se vai
  // é dar tarefa a quem não pediu.
  assert.doesNotMatch(entrada, /O caminho até lá/, 'sem frase não há escada');

  // A pessoa diz o que fez, com as palavras dela.
  await page.getByPlaceholder('picolé de morango').first().fill('200 picolés de morango');
  await page.getByText('Continuar', { exact: true }).first().click();
  await page.getByText('O caminho até lá').first().waitFor({ timeout: 15_000 });

  const depois = await screen(page);
  assert.match(depois, /Você disse: 200 picolés de morango/, 'a frase volta para quem a escreveu');
  assert.match(depois, /O caminho até lá/, 'e a escada aparece depois dela');
  // O banco semeado tem insumo, ficha e produto com ficha — então nada falta, e a tela diz
  // isso em vez de inventar um degrau. É o caso que separa "mostra a escada" de "mostra a
  // escada CERTA": uma tela que sempre pedisse cadastro passaria na asserção de cima.
  assert.match(
    depois,
    /Está tudo cadastrado|Registrar o que saiu/,
    'com a fábrica semeada a escada está fechada e o que resta é registrar',
  );
  assert.match(depois, /Não era isso/, 'a saída nunca é escondida');
});

check('a categoria nasce FECHADA, e abre num toque', async (page) => {
  /**
   * Decisão do dono, 11 de setembro. O cartão ficava de pé mesmo vazio, e na fábrica dele
   * isso era um cartão inteiro lendo "nenhuma categoria aqui — e tudo bem" para sempre.
   *
   * A metade que só uma checagem pega: **abrir**. Um convite que não abre é pior que o
   * cartão de antes — ele esconde o caminho em vez de cobrá-lo por um toque, e a diferença
   * entre os dois é invisível numa foto.
   */
  await page.goto(`http://localhost:${PORT}/catalog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const fechado = await screen(page);
  assert.match(fechado, /precisa de um corte a mais\?/, 'o convite de uma linha está lá');
  // E o cartão inteiro NÃO está: a dica da categoria só existe dentro dele.
  assert.doesNotMatch(fechado, /Muda a RECEITA/, 'fechado, a dica da categoria não ocupa a tela');

  /**
   * O produto primeiro, e não é rodeio: o semeado NÃO cria produto nenhum
   * (`src/data/seed.ts` semeia insumo e ficha), e sem produto o cartão da categoria diz —
   * com razão — "cadastre um produto primeiro". A primeira escrita desta checagem esperava
   * a dica da categoria num aplicativo sem produto: a asserção estava errada sobre o
   * ESTADO, não sobre a tela.
   */
  await page.getByPlaceholder('Nome').first().fill('Picolé da checagem');
  await page.getByRole('button', { name: 'Novo produto' }).first().click();
  await page.getByText('Picolé da checagem', { exact: false }).first().waitFor({ timeout: 15_000 });

  // Por PAPEL e não por texto: `Button` publica `accessibilityRole="button"` e
  // `accessibilityLabel`, que na web viram `role` e `aria-label`.
  await page.getByRole('button', { name: 'precisa de um corte a mais?' }).first().click();
  await page.getByText('Muda a RECEITA', { exact: false }).first().waitFor({ timeout: 15_000 });

  const aberto = await screen(page);
  assert.match(aberto, /Muda a RECEITA/, 'aberto, ele diz o que o nível MUDA');
  assert.match(aberto, /NOVA CATEGORIA/, 'e traz o campo de cadastrar');
  // A regra aprovada dita nos três níveis, na mesma forma — é ela que impede a mesma coisa
  // de ir para níveis diferentes em produtos diferentes.
  assert.match(aberto, /Muda o TAMANHO ou o FORMATO/, 'o tipo diz a natureza dele');
  assert.match(aberto, /Muda o SABOR/, 'e a variação a dela');
});

check('o caminho de trás não é o único: o passo a passo continua na frente', async (page) => {
  // A decisão do dono foi "os dois caminhos existem", e o passo a passo é o PADRÃO. Uma
  // porta que substituísse a outra cumpriria metade da decisão e pareceria pronta.
  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const texto = await screen(page);
  assert.match(texto, /O que você fez\?/, 'a porta permanente do caminho de trás está nos ajustes');
  // E as portas do passo a passo continuam onde estavam.
  assert.match(texto, /Almoxarifado/);
  assert.match(texto, /Receitas/);
  assert.match(texto, /Produtos/);
});

check('o que ficou de lado tem tela, e zero não vira frase nenhuma', async (page) => {
  /**
   * A metade que o navegador ALCANÇA, e é preciso dizer qual é a outra.
   *
   * Os quatro fatos de cada cartão — data, hora, lugar e quem operou — só existem depois de
   * um servidor recusar uma conferência, e `markRejected` não é alcançável por toque: quem
   * prova aquilo é a suíte de unidade, contra o livro-razão. O que o navegador prova aqui é o
   * que só ele prova: que a rota monta, que ela fala o idioma do dicionário, e que a porta
   * dos Ajustes NÃO aparece quando não há nada de lado.
   *
   * A segunda metade é a que tem história: "está tudo bem é estado válido, e alerta
   * inventado ensina a ignorar alerta". Uma porta permanente chamada "O que ficou de lado"
   * num aparelho que nunca teve recusa é exatamente o alerta inventado.
   */
  await page.goto(`http://localhost:${PORT}/de-lado`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const tela = await screen(page);
  assert.match(tela, /O que ficou de lado/, 'a rota monta com o título do dicionário');
  assert.match(tela, /Nada ficou de lado/, 'e sem recusa ela diz isso, em vez de uma lista vazia');

  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const ajustes = await screen(page);
  assert.ok(
    !/O que ficou de lado/.test(ajustes),
    'com a fila limpa a porta não é desenhada — zero não vira frase',
  );
});

check('a carga que ninguém escolheu sai COM lote — o item deduzido tem o dele', async (page) => {
  /**
   * O caminho mais comum era o que perdia o lote.
   *
   * `frente` — o lote que vai — perguntava pelo `itemId` do ESTADO, que só existe depois de
   * alguém tocar na lista. Mas a linha que a tela usa é `lines.find(… itemId) ?? lines[0]`:
   * quem não toca em nada carrega o primeiro, e `ordemDeCarga` põe o produto acabado na
   * frente quando o destino é loja. Então a carga saía com `lotId: null` exatamente no
   * caminho de quem confia na dedução da tela.
   *
   * O custo está escrito no molde de `app/picking.tsx`: lote da fábrica que só sobe — um
   * lote que já viajou continua parecendo estar aqui —, a carga seguinte estampando o código
   * errado na etiqueta, e num recall a diferença entre saber qual loja recebeu e não saber.
   *
   * Por que esta checagem é de NAVEGADOR: o que estava errado é a tela ligando o item
   * deduzido ao lote. `recordTransfer` sempre aceitou o `lotId`, e `lotsInStock` sempre
   * devolveu o lote — nenhum módulo estava com defeito. E a asserção é a CONFIRMAÇÃO, que é
   * onde a frase do lote aparece antes de o razão receber qualquer coisa.
   *
   * E o passo que a torna verdadeira: **não se toca no item**. Tocar preencheria `itemId` e
   * mediria o caminho que já funcionava.
   */
  await page.goto(`http://localhost:${PORT}/places`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByText('Cadastrar um lugar', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByLabel('Como se chama').fill('Loja do Lote');
  await page.waitForTimeout(300);
  await page.getByText('Salvar lugar', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Produzir é o que CRIA o lote — sem corrida não há lote para perder.
  await page.goto(`http://localhost:${PORT}/production/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.getByLabel(/Quantas unidades/).fill('480');
  await page.waitForTimeout(600);
  await page.getByText('Registrar produção', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.goto(`http://localhost:${PORT}/transfer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // O destino, sim: ele é o que a tela não tem como deduzir com duas lojas. O ITEM, não.
  await page.getByLabel('Loja do Lote').first().click();
  await page.waitForTimeout(700);
  await page.getByLabel('Quanto vai').fill('40');
  await page.waitForTimeout(600);
  await page.getByText('Registrar a transferência', { exact: true }).first().click();
  await page.waitForTimeout(1200);

  const confirmacao = await screen(page);
  assert.match(
    confirmacao,
    /Sai do lote/,
    'a carga do item DEDUZIDO diz de que lote sai: sem isso ela grava lotId nulo e o lote da ' +
      'fábrica só sobe, com a etiqueta da próxima carga saindo errada',
  );
});

try {
  // Rebuilt every run unless somebody explicitly asks to reuse the last one.
  //
  // This used to skip the export whenever `dist` existed, which meant a change
  // to a screen was tested against yesterday's bundle. The suite went green for
  // a screen that did not contain the change - the worst failure a test can
  // have, because it looks exactly like success. Reuse is now a choice made out
  // loud, for the case it was really for: iterating on the checks themselves.
  if (!existsSync(ROOT) || !process.env.E2E_REUSE_BUILD) {
    console.log('› exportando a versão web');
    // `--clear` só quando o `app.json` mudou, e essa condição é cicatriz.
    //
    // O comentário aqui dizia que limpar o cache do bundler "não compra nada",
    // porque `expo export` reescreve `dist` de qualquer jeito. Está errado, e o
    // erro custou uma sessão inteira de fotos e execuções lendo um pacote com o
    // MANIFESTO de cinco versões atrás: a tela de Ajustes dizia 0.2.0 com o
    // `app.json` em 0.7.0. O manifesto é embutido no `expo-constants` na hora de
    // transformar o módulo, e a chave do cache do Metro é o conteúdo desse
    // módulo — que não muda quando o `app.json` muda.
    //
    // Limpar sempre devolveria os dois ou três minutos que o comentário
    // defendia. Então a marca é o próprio `app.json`: mudou, limpa; não mudou,
    // o cache está certo.
    const limpar = precisaLimpar();
    if (limpar) console.log('› o app.json mudou: exportando com o cache limpo');
    await run('npx', ['expo', 'export', '--platform', 'web', ...(limpar ? ['--clear'] : [])]);
    marcarExportado();
  }

  await new Promise((resolve) => server.listen(PORT, resolve));

  const browser = await chromium.launch({
    ...(BROWSER ? { executablePath: BROWSER } : {}),
    args: ['--no-sandbox'],
  });
  let failures = 0;
  const filtradas = ONLY ? checks.filter((c) => c.name.toLowerCase().includes(ONLY)) : checks;
  const selected = SHARD
    ? filtradas.filter((_, at) => at % SHARD.n === SHARD.i)
    : filtradas;

  for (const { name, fn } of selected) {
    // A fresh context per check: separate storage, so each starts on a first
    // install exactly like a person opening the app for the first time.
    //
    // E o aparelho é BRASILEIRO, dito em vez de herdado. O navegador headless roda
    // em `en-US`, e desde que o idioma virou escolha da empresa — com o aparelho
    // como palpite do primeiro dia — isso fazia o aplicativo abrir em inglês. As
    // trinta e cinco checagens afirmam texto em português: elas passariam a reprovar
    // todas, e por um motivo que não é defeito nenhum. Declarando o fuso e o idioma
    // do aparelho, o mundo desta suíte é o que ela sempre descreveu: uma fábrica no
    // Brasil.
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      locale: 'pt-BR',
      timezoneId: FUSO_DA_FABRICA,
    });
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // O que o NAVEGADOR reclamou, guardado para o caso de a checagem falhar.
    //
    // Existe por causa de um erro real: o SQLite da web recusou uma gravação com
    // "Error finalizing statement" - a mensagem que o driver mostra depois de
    // perder a de verdade. A suíte de unidade usa outro SQLite e passava. Sem o
    // console do navegador na mão, o único caminho era adivinhar.
    const console_ = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') console_.push(`${m.type()}: ${m.text()}`);
    });

    try {
      await fn(page);
      assert.deepEqual(errors, [], 'the console must be clean');
      console.log(`  ok   ${name}`);
    } catch (error) {
      failures += 1;
      console.log(`  FAIL ${name}`);
      console.log(`       ${error.message.split('\n').slice(0, 6).join('\n       ')}`);
      for (const linha of console_.slice(-8)) console.log(`       browser ${linha}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log(
    `\n${selected.length - failures}/${selected.length} passaram` +
      (ONLY ? ` (filtrado por "${ONLY}" - não é a suíte inteira)` : '') +
      (SHARD ? ` (fatia ${SHARD.i + 1} de ${SHARD.n} - não é a suíte inteira)` : ''),
  );

  // A suite that registered nothing prints "0/0 passaram" and exits happy,
  // which is the same shape as every silent defect found today: a mechanism
  // reporting success without doing its work. If a syntax slip or a bad merge
  // ever drops the checks, this is what says so instead of a clean green.
  if (checks.length === 0) {
    console.log('NENHUMA checagem registrada - a suíte não exercitou nada.');
  }
  if (ONLY && selected.length === 0) {
    console.log(`NENHUMA checagem casa com "${ONLY}" - o filtro não exercitou nada.`);
  }
  if (failures > 0 || checks.length === 0 || selected.length === 0) process.exitCode = 1;
} finally {
  server.close();
}
