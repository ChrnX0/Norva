/**
 * A folha de contato das telas: muitas fotos numa imagem só, para comparar.
 *
 * `npm run shot` responde "esta tela está certa?". Esta responde outra coisa, e
 * é a que faltou quando o dono navegou da capa redesenhada para as vinte que não
 * tinham sido: **as telas parecem do mesmo aplicativo?** Incoerência não aparece
 * olhando uma de cada vez — aparece quando elas estão lado a lado.
 *
 * Uso:
 *   npm run folha                 # tudo o que houver em .shots/
 *   npm run folha -- organico-escuro   # só o que casar com o filtro
 *
 * Sai em `.shots/folha-<filtro>.png`.
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const SHOTS = join(process.cwd(), '.shots');
const filtro = process.argv[2] ?? '';

if (!existsSync(SHOTS)) {
  console.error('não há .shots/ — rode `npm run shot -- --tudo` primeiro');
  process.exit(1);
}

const fotos = readdirSync(SHOTS)
  .filter((f) => f.endsWith('.png') && !f.startsWith('folha-'))
  .filter((f) => f.includes(filtro))
  .sort();

if (fotos.length === 0) {
  console.error(`nenhuma foto casa com "${filtro}"`);
  process.exit(1);
}

// Seis por linha, cada uma com o nome embaixo: é o que cabe legível na largura
// de uma imagem que ainda dá para ler os títulos das telas.
const html = `<!doctype html><meta charset="utf-8">
<style>
  body { background:#1A1A1A; margin:0; padding:16px; font:11px system-ui; color:#DDD; }
  .grade { display:grid; grid-template-columns:repeat(6, 1fr); gap:12px; }
  figure { margin:0; }
  /* Inteira, não cortada.
     A primeira versão cortava em 420px "porque o topo identifica a tela" — e
     numa folha cujo trabalho é caçar defeito, cortar embaixo é escolher onde
     não olhar. A grade fica desalinhada e tudo bem: desalinhada e completa é
     melhor que arrumada e cega. */
  img { width:100%; display:block; border:1px solid #333; background:#000; height:auto; }
  .grade { align-items:start; }
  figcaption { margin-top:4px; color:#9A9A9A; word-break:break-all; }
</style>
<div class="grade">
${fotos
  .map((f) => `  <figure><img src="${f}" /><figcaption>${f.replace('.png', '')}</figcaption></figure>`)
  .join('\n')}
</div>`;

const arquivo = join(SHOTS, `_folha${filtro ? `-${filtro}` : ''}.html`);
writeFileSync(arquivo, html, 'utf8');

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(`file://${arquivo}`, { waitUntil: 'load' });
const saida = join(SHOTS, `folha-${filtro || 'tudo'}.png`);
await page.screenshot({ path: saida, fullPage: true });
await browser.close();

console.log(`${fotos.length} telas em ${saida}`);
