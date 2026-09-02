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

check('opens on the briefing, with a cost the engine worked out', async (page) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const text = await screen(page);
  assert.match(text, /NORVA/);
  assert.match(text, /Picolé de morango/);
  assert.match(text, /R\$ 0,64/, 'the seeded popsicle costs 64 cents a unit');
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
  assert.match(briefing, /R\$ 0,73/, 'the new unit cost');
  assert.match(briefing, /▲ R\$ 0,09/, 'and what the invoice added to it');
  assert.match(briefing, /custava R\$ 0,64 antes das últimas compras/);

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

check('production pre-fills what the sheet promises, and records what happened', async (page) => {
  await page.goto(`http://localhost:${PORT}/production`, { waitUntil: 'networkidle' });
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
  await page.getByLabel(/Quantas unidades/).fill('480');
  await page.waitForTimeout(700);

  const short = await screen(page);
  assert.match(short, /26 unidades a menos que o previsto/);

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

  for (const { name, fn } of checks) {
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
  console.log(`\n${checks.length - failures}/${checks.length} passaram`);

  // A suite that registered nothing prints "0/0 passaram" and exits happy,
  // which is the same shape as every silent defect found today: a mechanism
  // reporting success without doing its work. If a syntax slip or a bad merge
  // ever drops the checks, this is what says so instead of a clean green.
  if (checks.length === 0) {
    console.log('NENHUMA checagem registrada - a suíte não exercitou nada.');
  }
  if (failures > 0 || checks.length === 0) process.exitCode = 1;
} finally {
  server.close();
}
