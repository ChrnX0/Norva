/**
 * Tira foto da tela, para alguém poder OLHAR.
 *
 * Existe por uma cicatriz de 3 de setembro: entreguei uma capa com cinco cartões
 * dos quais quatro não diziam nada, e um desenho com a fábrica, a geladeira e o
 * morango em linhas de base diferentes. A suíte inteira estava verde — 283
 * testes, 70 mutações, 32 checagens no navegador — porque **nenhuma delas olha
 * para como fica**. Texto passando não é tela pronta, e eu afirmei que estava.
 *
 * Uso:
 *   npm run shot                    # capa nas duas caras, instalação virgem
 *   npm run shot -- --com-dado      # depois de plantar duas semanas de movimento
 *   npm run shot -- --rota /inputs  # qualquer tela
 *
 * As fotos saem em `.shots/`, que o git ignora: elas são para olhar agora, não
 * para versionar.
 */
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { marcarExportado, precisaLimpar } from './manifesto.mjs';

const PORT = Number(process.env.SHOT_PORT ?? 4321);
const ROOT = join(process.cwd(), 'dist');
const SAIDA = join(process.cwd(), '.shots');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

const arg = (nome, padrao) => {
  const at = process.argv.indexOf(nome);
  return at >= 0 ? (process.argv[at + 1] ?? padrao) : padrao;
};
const tem = (nome) => process.argv.includes(nome);

/**
 * Uma ou várias rotas, separadas por vírgula.
 *
 * A semeadura e a escolha de cidade levam dois minutos; repetir isso por tela
 * transformava "olhar o aplicativo" em meia hora, e meia hora é o que faz
 * ninguém olhar. Uma sessão, muitas fotos.
 */
/** Toda tela que o aplicativo tem, na ordem em que alguém as encontra. */
const TODAS = [
  '/', '/production', 'lote', '/production/new', '/transport', '/transfer',
  '/reports', '/places', '/inputs', '/inputs/new', '/purchase',
  '/products', '/products/new', '/recipes', '/catalog',
  '/orders', '/orders/new', '/losses', '/weather', '/assistant', '/settings',
];

/**
 * `--tudo` fotografa o aplicativo inteiro: toda tela, nas duas caras e nos dois
 * esquemas, com dado.
 *
 * Existe porque a revisão de uma reescrita larga é diferente da de uma tela: o
 * defeito que importa é a INCOERÊNCIA entre telas, e ela não aparece olhando
 * uma de cada vez. Duas caras vezes dois esquemas vezes vinte e uma telas é o
 * que o dono vai ver navegando.
 */
const tudo = tem('--tudo');
const rotas = tudo
  ? TODAS
  : arg('--rota', '/').split(',').map((r) => r.trim()).filter(Boolean);
const comDado = tem('--com-dado') || tudo;
/**
 * O tema escuro, que é onde o dono abriu o aplicativo.
 *
 * A primeira versão desta ferramenta só fotografava o claro — e o defeito que
 * ele viu era do ESCURO: a paisagem do Orgânico sumia e sobrava um sol numa
 * caixa preta. Ferramenta de olhar que só olha metade dos casos é a mesma
 * cegueira, com mais passos.
 */
const escuro = tem('--escuro');
/**
 * A largura do aparelho, e ela não era escolha até hoje.
 *
 * Esta ferramenta fotografava 412 px e só. O dono mandou uma foto da capa DELE com
 * "Transpo…" e "Relatóri…" na barra de abas — rótulo cortado, num aplicativo que se
 * lê de luva —, e nenhuma das minhas fotos jamais mostrou isso: 412 é largo o
 * bastante para caber a palavra inteira. Ferramenta que olha uma largura só é cega
 * para todo defeito que depende de largura, que é metade dos defeitos de tela.
 *
 * 360 é o Android comum (Moto G, Galaxy A da linha de entrada) — o celular que uma
 * fábrica de seis pessoas compra.
 */
const largura = Number(arg('--largura', '412'));
/** Os esquemas desta execução. `--tudo` quer os dois; o resto, o que se pediu. */
const esquemas = tudo ? ['light', 'dark'] : [escuro ? 'dark' : 'light'];

function serve() {
  return createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    let file = join(ROOT, path === '/' ? 'index.html' : path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(ROOT, 'index.html');

    // Os mesmos dois cabeçalhos do e2e: sem isolamento de origem o navegador
    // recusa SharedArrayBuffer e o SQLite em WebAssembly não abre nada.
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

/**
 * O pacote é sempre o desta execução.
 *
 * Reusar `dist` porque ele existia já fez uma suíte passar verde para uma tela
 * que não tinha a mudança — e numa ferramenta de OLHAR isso é pior ainda: eu
 * olharia a versão anterior e diria que está pronta.
 */
const limpar = precisaLimpar();
if (limpar) console.log('› o app.json mudou: exportando com o cache limpo');
await run('npx', [
  'expo',
  'export',
  '--platform',
  'web',
  '--output-dir',
  'dist',
  ...(limpar ? ['--clear'] : []),
]);
marcarExportado();

mkdirSync(SAIDA, { recursive: true });
const server = serve();
await new Promise((ok) => server.listen(PORT, ok));

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox'],
});

try {
  for (const esquema of esquemas) {
  for (const cara of ['organico', 'papel']) {
    const context = await browser.newContext({
      viewport: { width: largura, height: 915 },
      deviceScaleFactor: 2,
      colorScheme: esquema,
      // O aparelho é BRASILEIRO, dito em vez de herdado.
      //
      // Desde que o idioma virou escolha da empresa — com o aparelho como palpite
      // do primeiro dia —, o navegador headless (`en-US`) abria o aplicativo em
      // inglês, e esta ferramenta parou de achar "Procurar cidade". A foto que o
      // dono olha é de uma fábrica no Brasil; o contexto tem de dizer isso.
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const page = await context.newPage();

    /**
     * A previsão, servida por esta máquina.
     *
     * Sem isto o cartão do tempo NUNCA aparece nas fotos — a máquina de
     * desenvolvimento não alcança a Open-Meteo —, e foi por isso que o defeito
     * que o dono viu passou por mim: o bloco degradê do Orgânico aparecendo no
     * meio da capa de traço do Papel. Eu fotografava uma capa sem a peça que
     * estava errada.
     *
     * Um dia quente e seco de propósito: é o caso que desenha sol, que é a forma
     * mais visível da cena.
     */
    await page.route('**/api.open-meteo.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          daily: {
            time: ['2026-09-03', '2026-09-04', '2026-09-05'],
            temperature_2m_max: [31, 33, 29],
            temperature_2m_min: [19, 20, 18],
            precipitation_probability_max: [10, 5, 20],
          },
        }),
      }),
    );

    // A busca de cidade também é servida daqui: sem cidade escolhida o cartão do
    // tempo não existe, e era justamente ele que estava com a cara errada.
    await page.route('**/geocoding-api.open-meteo.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [{ name: 'São Paulo', admin1: 'São Paulo', latitude: -23.55, longitude: -46.63 }],
        }),
      }),
    );

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Escolhe a cidade, como o dono escolheu no aparelho dele.
    await page.goto(`http://localhost:${PORT}/weather`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.getByRole('textbox', { name: 'Procurar cidade' }).fill('São Paulo');
    await page.getByText('Procurar cidade', { exact: true }).last().click();
    await page.waitForTimeout(2500);
    await page.getByText('São Paulo', { exact: false }).first().click();
    await page.waitForTimeout(2500);

    if (comDado) {
      await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      // Plantar pede confirmação — a primeira versão desta ferramenta clicava uma
      // vez só e fotografava a capa VIRGEM achando que era a capa com dado.
      // Ferramenta de olhar que mente sobre o que está olhando é pior que não ter.
      await page.getByText('Plantar', { exact: true }).first().click();
      await page.waitForTimeout(900);
      await page.getByText('Plantar', { exact: true }).last().click();
      await page.waitForTimeout(9000);
    }

    // A cara e a LUZ, as duas escolhidas dentro do aplicativo.
    //
    // `colorScheme` no contexto do navegador parou de valer no dia em que claro e
    // escuro viraram escolha da empresa com padrão claro (decisão do dono, 4 de
    // setembro): a foto do escuro saía IGUAL à do claro, e eu teria olhado duas
    // vezes a mesma tela dizendo que vi as duas. Ferramenta de olhar que mente
    // sobre o que está olhando é pior que não ter — está escrito aqui em cima, e
    // esta é a segunda vez que a mesma frase cobra a conta.
    if (cara === 'papel' || esquema === 'dark') {
      await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      if (esquema === 'dark') {
        await page.getByText('Escuro', { exact: true }).first().click();
        await page.waitForTimeout(1200);
      }
      if (cara === 'papel') {
        await page.getByText('Papel', { exact: true }).first().click();
        await page.waitForTimeout(1500);
      }
    }

    for (const rota of rotas) {
      // Telas cujo endereço tem id gerado não se alcançam por URL: chega-se
      // nelas como uma pessoa chega, tocando. `lote` é a etiqueta do primeiro
      // lote do dia, aberta pela lista da produção.
      // `receita` é a primeira ficha da estante, aberta pela lista — outro
      // endereço com id gerado, que só se alcança tocando.
      if (rota === 'receita') {
        await page.goto(`http://localhost:${PORT}/recipes`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        await page.getByText('Abrir a tela', { exact: true }).first().click();
      } else if (rota === 'lote') {
        await page.goto(`http://localhost:${PORT}/production`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        await page.getByText(/^\d{8}-\d{2}$/).first().click();
      } else {
        await page.goto(`http://localhost:${PORT}${rota}`, { waitUntil: 'networkidle' });
      }
      // A capa tem animação de entrada; a foto tem de ser depois dela.
      await page.waitForTimeout(3500);

      // A largura entra no nome quando não é a padrão: sem isso a foto estreita
      // sobrescreve a larga, e a comparação entre as duas — que é o motivo de a
      // largura existir — deixa de ser possível.
      const nome = `${rota.replace(/\W+/g, '') || 'capa'}-${cara}-${esquema === 'dark' ? 'escuro' : 'claro'}${comDado ? '-com-dado' : '-virgem'}${largura === 412 ? '' : `-${largura}`}.png`;
      await page.screenshot({ path: join(SAIDA, nome), fullPage: true });
      console.log(`  ${nome}`);
    }
    await context.close();
  }
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\nfotos em .shots/ — olhe antes de dizer que está pronto`);
