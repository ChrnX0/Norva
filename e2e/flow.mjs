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
const BROWSER = process.env.E2E_CHROMIUM;

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
  if (!existsSync(ROOT)) {
    console.log('› exportando a versão web');
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
  if (failures > 0) process.exitCode = 1;
} finally {
  server.close();
}
