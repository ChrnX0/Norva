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
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { marcarExportado, marcarPacote, pacoteServe, precisaLimpar } from './manifesto.mjs';

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
/**
 * Bandeira que não existe reprova, em vez de virar a foto da capa.
 *
 * Escrevi `--todas` em vez de `--tudo` e a ferramenta rodou feliz: caiu no padrão
 * do `--rota`, fotografou a capa quatro vezes e disse "fotos em .shots/". Levei
 * dois minutos e uma leitura de log para entender que as vinte telas que eu tinha
 * pedido não existiam em lugar nenhum.
 *
 * É a mesma família do defeito de cima — a ferramenta seguindo em frente com um
 * padrão quando a intenção era outra. Padrão silencioso é confortável exatamente
 * até ser errado.
 */
const CONHECIDAS = new Set([
  '--tudo', '--com-dado', '--escuro', '--claro', '--rota', '--largura',
]);
const desconhecidas = process.argv
  .slice(2)
  .filter((a) => a.startsWith('--') && !CONHECIDAS.has(a));
if (desconhecidas.length > 0) {
  console.error(
    `✗ não conheço ${desconhecidas.join(', ')}.\n  Bandeiras: ${[...CONHECIDAS].join(' ')}`,
  );
  process.exit(1);
}

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
/** Só o claro, para quando a pergunta é de uma luz só. */
const claro = tem('--claro');
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
/**
 * As duas luzes por padrão, e uma só quando alguém pede uma.
 *
 * Antes era o claro, e o escuro só com `--escuro`: ver as quatro combinações
 * custava DUAS exportações, e por isso eu olhava duas e afirmava quatro. O
 * aplicativo tem duas caras e duas luzes; olhar é olhar as quatro.
 */
const esquemas = escuro ? ['dark'] : claro ? ['light'] : ['light', 'dark'];

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

// Exporta quando o CÓDIGO mudou — e "porque existia" continua não valendo.
//
// A exportação custa perto de um minuto e meio, e refazer um desenho pede dez
// olhadas. Cobrar quinze minutos de espera por quinze segundos de conserto é o que
// faz ninguém olhar — e é assim que uma capa vai para o ar com um degradê cor de
// lama. A soma em `manifesto.mjs` cobre tudo o que entra no pacote: qualquer
// arquivo diferente e ele é refeito.
if (!limpar && pacoteServe()) {
  console.log('› o código não mudou desde a última exportação: reusando o pacote');
} else {
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
  marcarPacote();
}

mkdirSync(SAIDA, { recursive: true });
const server = serve();
await new Promise((ok) => server.listen(PORT, ok));

/**
 * O que foi fotografado, para a ferramenta poder se desmentir no fim.
 *
 * Cada entrada guarda a soma da imagem. Duas caras diferentes com a MESMA soma
 * não são duas caras — são a mesma foto com dois nomes, e é exatamente isso que
 * aconteceu por um dia inteiro sem ninguém notar.
 */
const tiradas = [];

/** As telas que não abriram, para reprovar no fim em vez de derrubar no meio. */
const faltaram = [];

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

      /**
       * Espera o AVISO de pronto, não um relógio.
       *
       * Eram nove segundos fixos, e nove segundos bastavam para a quinzena. No
       * dia 5 a semeadura virou noventa dias (pedido do dono) e nove segundos
       * passaram a cortá-la no meio: o SQLite em WebAssembly não termina, a
       * ferramenta segue em frente, e a foto sai de uma fábrica que produziu até
       * 8 de julho e parou. Eu li isso na capa como "a simulação para de produzir
       * no dia 59" e fui procurar o defeito na simulação, que estava certa — 98
       * corridas em 90 dias, conferido fora do navegador.
       *
       * A tela já diz quando acabou ("Pronto: N corridas, M entregas e K notas"),
       * e é isso que se espera. Relógio é palpite sobre a máquina de quem roda;
       * o aviso é o fato.
       */
      await page.getByText(/^Pronto: \d+ corridas/).waitFor({ timeout: 240000 });
      await page.getByText('Entendi', { exact: true }).last().click();
      await page.waitForTimeout(1500);
    }

    // A cara e a LUZ, as duas escolhidas dentro do aplicativo — SEMPRE as duas,
    // nunca uma delas por omissão.
    //
    // `colorScheme` no contexto do navegador parou de valer no dia em que claro e
    // escuro viraram escolha da empresa com padrão claro (decisão do dono, 4 de
    // setembro): a foto do escuro saía IGUAL à do claro, e eu teria olhado duas
    // vezes a mesma tela dizendo que vi as duas.
    //
    // E a MESMA armadilha me pegou de novo, um dia depois, na outra dimensão. O
    // laço só clicava quando a cara era Papel; o Orgânico vinha "de graça", por
    // ser o padrão de um contexto novo. No dia 5 o padrão virou Papel (decisão do
    // dono, escrita em `src/theme/Appearance.tsx`) e o clique nunca foi escrito —
    // então **toda foto chamada `-organico-` era Papel**. Conferido por pixel:
    // `more-papel-claro` e `more-organico-claro` eram o MESMO arquivo, zero
    // pixels de diferença, e eu tinha mostrado as duas ao dono como duas caras.
    //
    // A lição não é "lembrar do padrão": é que **padrão não é escolha**. A
    // ferramenta que fotografa uma escolha tem de fazer a escolha, sempre e toda
    // vez, mesmo quando ela coincide com o que já está lá. Herdar é o que mente.
    await page.goto(`http://localhost:${PORT}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.getByText(esquema === 'dark' ? 'Escuro' : 'Claro', { exact: true }).first().click();
    await page.waitForTimeout(1200);
    await page.getByText(cara === 'papel' ? 'Papel' : 'Orgânico', { exact: true }).first().click();
    await page.waitForTimeout(1500);

    for (const rota of rotas) {
      /**
       * Uma tela que não abre não leva as outras oitenta junto.
       *
       * O laço estourava na primeira rota inalcançável e a execução inteira
       * morria: pedi vinte e uma telas nas quatro caras, o `lote` não abriu na
       * terceira, e eu fiquei com duas fotos e um rastro de pilha. Isso é o
       * contrário do que a ferramenta serve — olhar o aplicativo TODO é
       * justamente o caso em que uma peça quebrada não pode esconder o resto.
       *
       * A falha não some: ela é anotada e reprovada no fim, junto com as fotos
       * iguais. Continuar em silêncio seria o defeito que este arquivo já teve
       * três vezes.
       */
      try {
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
      const imagem = await page.screenshot({ path: join(SAIDA, nome), fullPage: true });
      tiradas.push({ nome, rota, cara, esquema, soma: createHash('sha1').update(imagem).digest('hex') });
      console.log(`  ${nome}`);
      } catch (erro) {
        const motivo = erro instanceof Error ? erro.message.split('\n')[0] : String(erro);
        console.error(`  ✗ ${rota} (${cara}/${esquema}): ${motivo}`);
        faltaram.push(`${rota} · ${cara} · ${esquema}: ${motivo}`);
      }
    }
    await context.close();
  }
  }
} finally {
  await browser.close();
  server.close();
}

/**
 * O desmentido: duas fotos iguais com nomes diferentes reprovam a execução.
 *
 * "Clicar sempre" conserta o defeito de hoje e não impede o de amanhã — um
 * seletor que deixa de casar, um botão renomeado, e a ferramenta volta a
 * fotografar a mesma tela duas vezes calada. O que impede é ela CONFERIR: se
 * duas fotos da mesma rota saem byte a byte idênticas, ou a escolha não pegou ou
 * as duas caras são a mesma coisa, e os dois casos são notícia.
 *
 * Sai por código 1 de propósito. Uma ferramenta de olhar que erra tem de doer.
 */
if (faltaram.length > 0) {
  console.error(`\n✗ ${faltaram.length} tela(s) não abriram:`);
  for (const f of faltaram) console.error(`  ${f}`);
  process.exitCode = 1;
}

const porSoma = new Map();
for (const t of tiradas) {
  const par = porSoma.get(t.soma);
  if (par) {
    console.error(
      `\n✗ ${t.nome} e ${par.nome} são a MESMA imagem, byte a byte.\n` +
        '  Ou a escolha da cara/luz não pegou nos Ajustes, ou esta tela não distingue as duas.\n' +
        '  Nos dois casos a foto não prova o que o nome diz.',
    );
    process.exitCode = 1;
  } else {
    porSoma.set(t.soma, t);
  }
}

console.log(`\nfotos em .shots/ — olhe antes de dizer que está pronto`);
