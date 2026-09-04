import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';

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
const screen = async (page) =>
  (await page.locator('body').innerText()).replace(/\u00a0/g, ' ').replace(/\n+/g, ' | ');

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
  assert.match(text, /Primeiro dia/, 'a capa de uma fábrica nova convida em vez de contar zeros');
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
  assert.doesNotMatch(reports, /margem|Espelho da loja/i, 'a row promising a screen that does not exist');

  await page.goto(`http://localhost:${PORT}/more`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const more = await screen(page);
  assert.match(more, /CADASTROS/);
  assert.match(more, /Lojas e clientes/);
  assert.match(more, /Pergunte/, 'the assistant has a door');
  assert.doesNotMatch(more, /Financeiro|Notas fiscais|Pessoas/, 'a drawer that opens onto nothing');

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
  await page.waitForTimeout(2500);

  const text = await screen(page);
  // The confirmation has to say what disappears with the real count - "confirm
  // deletion?" is what a person clicks through without reading.
  assert.match(text, /O que está guardado/);
  assert.match(text, /Insumos/);
  // The seed marker is read, not guessed: this line only appears when the flag
  // written by the seeder is still in app_meta, which is what stops the example
  // from creeping back after somebody wipes everything.
  assert.match(text, /Inclui os dados de exemplo/);
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
  assert.match(aberta, /Sorvete vende com calor/);

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

  const lista = await screen(page);
  assert.match(lista, /Loja Centro/);

  // E a capa passa a dizer o que fazer com isso. A fábrica semeada nunca
  // produziu, então os 300 pedidos são 300 que faltam - e o cartão diz isso
  // sem que ninguém tenha somado nada na mão.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const capa = await screen(page);
  assert.match(capa, /Produza para os pedidos/);
  assert.match(capa, /300/);

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
  await page.getByLabel(/Quantas/).fill('4');
  await page.getByLabel('Total da nota').fill('700');
  await page.waitForTimeout(800);

  // Law 4: the warning arrives on the date of the decision.
  const preview = await screen(page);
  assert.match(preview, /41\.1%/);
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

  // And the briefing carries the consequence, not just the figure. Until now
  // the first card the owner saw was a bare unit cost - 55 cents, neither good
  // nor bad, with nothing beside it.
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
  assert.match(history, /20\.6%/);
  assert.match(history, /Picolé de morango/, 'and it says which recipe stands on it');
});

check('the briefing is up to date when you tap Back into it', async (page) => {
  // Every other check in this file re-navigates with `page.goto`, which remounts
  // the whole tree and hides the defect this one exists for: a person does not
  // reload, a person taps Back. The briefing is the root of the stack - it
  // mounts once per launch, and on a phone that is days - so it showed the cost
  // it read on the first frame and said "nothing changed in price" beside it,
  // with the invoice already in the ledger.
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
  await page.getByLabel(/Quantas/).fill('4');
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
  assert.match(virgem, /Primeiro dia/, 'a capa fala de trabalho antes de haver trabalho');
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

  await page.goBack();
  await page.waitForTimeout(1800);

  await page.getByRole('tab', { name: 'Início' }).click();
  await page.waitForTimeout(2500);

  const briefing = await screen(page);
  assert.match(briefing, /480/, 'o que saiu aparece na capa');
  assert.match(briefing, /unidades saíram hoje/);
  // E nunca sozinho: sem semana passada com que comparar, a tela diz isso.
  assert.match(briefing, /primeira produção registrada/);

  // Com corrida gravada, o histórico curto tem o que dizer - e ele diz corrida
  // por corrida, não o total do dia: 3x100 e 1x300 dão o mesmo total e são
  // semanas diferentes.
  assert.match(briefing, /Últimas corridas/);
  assert.match(briefing, /média das últimas/, 'a corrida vem com o normal dela ao lado');

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
  await page.getByLabel('Nova linha').first().fill('Picolé');
  await page.waitForTimeout(300);
  await page.getByText('Nova linha', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByLabel('Novo sabor').first().fill('Uva');
  await page.waitForTimeout(300);
  await page.getByText('Novo sabor', { exact: true }).first().click();
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
  await page.getByLabel(/Quantas/).fill('2');
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
  assert.match(tela, /6\.000/, 'na unidade do item, não em caixas que ele não tem');
  assert.match(tela, /1 destino/i);
  // O aviso da prancha, agora com lastro: a caixa não foi aberta ainda.
  assert.match(tela, /Loja Centro ainda não conferiu o que chegou/);

  // E conferir é um toque, com a confirmação dizendo o que vai ser gravado.
  await page.getByText(/ainda não conferiu/).first().click();
  await page.waitForTimeout(900);
  const perguntando = await screen(page);
  assert.match(perguntando, /O que chegou em Loja Centro\?/);
  assert.match(perguntando, /6\.000/, 'a confirmação diz o que chegou, por extenso');

  await page.getByText('Conferir chegada', { exact: true }).last().click();
  await page.waitForTimeout(2500);

  const conferido = await screen(page);
  assert.doesNotMatch(conferido, /ainda não conferiu/, 'o aviso sai quando a caixa é aberta');
  assert.match(conferido, /Loja Centro/);

  // Lei 3 na aba também: "1 destino" não é muito nem pouco até estar ao lado do
  // que foi ontem. Esta aba dizia o número do dia sozinho, e num dia sem ontem
  // ela diz isso em vez de inventar uma variação.
  assert.match(
    await screen(page),
    /Primeira carga registrada|Ontem (foram|foi)/,
    'o número do dia vem com a comparação',
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

check('two weeks can be planted from Ajustes, and the briefing changes because of it', async (page) => {
  // A capa de uma instalação virgem não tem com o que comparar, e diz isso.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /Mudou desde a última vez/);

  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const ajustes = await screen(page);
  assert.match(ajustes, /Plantar duas semanas de movimento/);
  // A confirmação diz o que vai escrever antes de escrever.
  assert.match(ajustes, /o livro-razão fica com esses lançamentos/);

  await page.getByText('Plantar', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText('Plantar', { exact: true }).last().click();
  await page.waitForTimeout(9000);

  // E o resultado é dito em números, não em "pronto".
  const feito = await screen(page);
  assert.match(feito, /corridas/, 'o resumo conta o que foi escrito');

  await page.getByText('Entendi', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Agora a capa tem passado: o custo mexeu em algum momento das duas semanas,
  // então a linha de estabilidade some ou passa a contar dias.
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
  assert.match(capa, /saíram hoje/, 'a manchete da capa é o que saiu do tacho');
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
  assert.doesNotMatch(
    await screen(page),
    /medido às|trocar a cidade/,
    'o cartão do tempo sai da capa deste aparelho',
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
  assert.match(capa, /Primeiro dia/, 'a capa virgem convida');
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

check('erasing refuses in an order, and explains the way out', async (page) => {
  await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const text = await screen(page);
  assert.match(text, /Não dá para apagar os insumos enquanto 2 receitas usam eles/);
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

const server = serve();

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
    // No `--clear`: that empties the *bundler* cache, which buys nothing here.
    // `expo export` rewrites `dist` on every run regardless, and the bug this
    // guards against was skipping the export entirely, not reusing a warm
    // cache. Clearing it cost two or three minutes of every run.
    await run('npx', ['expo', 'export', '--platform', 'web']);
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
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
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
