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
  assert.match(text, /saíram hoje/, 'a manchete é o que saiu do tacho');

  // A régua de sete dias: as iniciais dos dias da semana, uma por coluna. É a
  // única coisa da tela que responde "isto aqui é normal?".
  assert.match(text, /(?:[A-Z] \| ){6}[A-Z]/, 'a semana está desenhada em sete colunas');

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
  // A versão anterior desta checagem afirmava o contrário: numa instalação
  // virgem o cartão do dia NÃO aparecia. Era a Lei 7 lida errado - "está tudo
  // bem é estado válido" fala de não inventar alerta, não de esconder o
  // assunto da tela. Escondendo, a capa de uma fábrica nova ficava com clima e
  // preço e nada de trabalho, que foi exatamente o que o dono viu e recusou.
  // Zero dito ao lado de ontem é uma pergunta; cartão ausente é um buraco.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const virgem = await screen(page);
  assert.match(virgem, /0 \| unidades saíram hoje|0\s*\|\s*unidades/, 'o dia zerado é dito, não escondido');
  assert.match(virgem, /Ontem não houve produção/, 'e nunca sozinho: ontem vem junto');

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
  assert.match(briefing, /480/, 'o que saiu do tacho aparece na capa');
  assert.match(briefing, /unidades saíram hoje/);
  // E nunca sozinho: sem semana passada com que comparar, a tela diz isso.
  assert.match(briefing, /primeira produção registrada/);
});

check('a kettle marked as running pulses on the briefing, and closing it writes the ledger', async (page) => {
  // Fábrica parada não desenha nada: o pulso só existe quando há tacho, porque
  // pulso ao lado de número congelado é mentira visual.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  assert.doesNotMatch(await screen(page), /tacho rodando/);

  await page.getByRole('tab', { name: 'Produção' }).click();
  await page.waitForTimeout(2500);
  await page.getByText('Adicionar produção', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.getByText('Abrir o tacho', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  // A tela diz desde quando, e o botão principal muda de significado.
  const aberto = await screen(page);
  // Abrir devolve para a aba do dia, e é lá que o tacho aberto tem cartão -
  // quem marca o tacho sai andando, e ficar no formulário seria ficar parado
  // numa tela sem nada a dizer até a corrida acabar.
  assert.match(aberto, /Tachos abertos/);
  assert.match(aberto, /Picolé de morango/);

  // E a home passa a mostrar o que está acontecendo AGORA.
  await page.getByRole('tab', { name: 'Início' }).click();
  await page.waitForTimeout(2500);
  assert.match(await screen(page), /tacho rodando/);

  // Fechar escreve o razão, e o pulso some porque não há mais tacho.
  await page.getByRole('tab', { name: 'Produção' }).click();
  await page.waitForTimeout(2000);
  await page.getByText('Adicionar produção', { exact: true }).first().click();
  await page.waitForTimeout(2000);
  await page.getByLabel(/Quantas unidades/).fill('480');
  await page.waitForTimeout(600);
  await page.getByText('Fechar o tacho', { exact: true }).first().click();
  await page.waitForTimeout(900);
  await page.getByText('Registrar', { exact: true }).first().click();
  await page.waitForTimeout(2500);

  await page.getByRole('tab', { name: 'Início' }).click();
  await page.waitForTimeout(2500);
  const depois = await screen(page);
  assert.doesNotMatch(depois, /tacho rodando/, 'o tacho fechou');
  assert.match(depois, /480/, 'e o que saiu dele está na capa');
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
  // A quebra é a diferença contra um tacho DECLARADO. Sem tacho declarado o
  // previsto é só o preenchimento sugerido, e o consumo acompanha o que saiu -
  // não há promessa a quebrar. Então o teste declara o tacho, que é a fábrica
  // que trabalha em corrida, e é dela que o rendimento real é a informação.
  await page.getByText('Lancei por tacho', { exact: true }).first().click();
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
  assert.match(asking, /Você produziu 480 unidades de Picolé de morango, em um tacho/);
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
  const selected = ONLY ? checks.filter((c) => c.name.toLowerCase().includes(ONLY)) : checks;

  for (const { name, fn } of selected) {
    // A fresh context per check: separate storage, so each starts on a first
    // install exactly like a person opening the app for the first time.
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    try {
      await fn(page);
      assert.deepEqual(errors, [], 'the console must be clean');
      console.log(`  ok   ${name}`);
    } catch (error) {
      failures += 1;
      console.log(`  FAIL ${name}`);
      console.log(`       ${error.message.split('\n').slice(0, 6).join('\n       ')}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log(
    `\n${selected.length - failures}/${selected.length} passaram` +
      (ONLY ? ` (filtrado por "${ONLY}" - não é a suíte inteira)` : ''),
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
