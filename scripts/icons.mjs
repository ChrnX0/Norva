#!/usr/bin/env node
/**
 * Os ícones do lançador, desenhados a partir da MESMA geometria da marca.
 *
 * O `src/config/brand.ts` promete, com todas as letras, que a marca é
 * *"rendered from this path on a 100x100 viewBox so every surface — splash,
 * icon, header, print — draws the exact same geometry"*. Era verdade em três
 * superfícies e mentira na quarta: `assets/icon.png` nunca foi trocado desde o
 * dia em que o projeto nasceu, e o celular do dono mostrava o **andaime do
 * Expo** — a seta azul com as linhas-guia de construção ainda desenhadas por
 * cima. O aplicativo inteiro numa língua visual, e o quadradinho pelo qual ele
 * é aberto falando outra.
 *
 * Nada de dependência nova: o desenho é um disco com uma cunha tirada, que se
 * rasteriza com aritmética, e o PNG sai do `zlib` que já vem no node. Uma
 * ferramenta de imagem a mais seria uma coisa a instalar em toda máquina e no
 * CI para desenhar dois círculos.
 *
 * **Ele recusa o que não entende.** O caminho é lido do `brand.ts` e conferido:
 * as duas pontas têm que estar à distância do raio declarado. Se alguém mudar a
 * marca para uma forma que este script não sabe desenhar, ele PARA — porque a
 * falha silenciosa aqui é desenhar um ícone errado com exit zero, e ninguém
 * confere um ícone que o script disse ter escrito.
 *
 *   node scripts/icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const marca = readFileSync('src/config/brand.ts', 'utf8');
const pega = (chave) => {
  const m = marca.match(new RegExp(`${chave}:\\s*'([^']+)'`));
  if (!m) throw new Error(`brand.ts não declara ${chave} — o gerador não inventa marca.`);
  return m[1];
};

const CAMINHO = pega('markPath');
const TINTA = pega('markColorLight');

// A única forma que este script sabe desenhar: centro, ponta, arco grande, ponta.
const F = String.raw`M([\d.]+),([\d.]+) L([\d.]+),([\d.]+) A([\d.]+),([\d.]+) 0 1,1 ([\d.]+),([\d.]+) Z`;
const p = CAMINHO.match(new RegExp(`^${F}$`));
if (!p) {
  throw new Error(
    `markPath mudou de forma e este gerador só sabe "disco com uma cunha":\n  ${CAMINHO}\n` +
      'Desenhar assim mesmo daria um ícone errado com exit zero, que é pior que não desenhar.',
  );
}
const [cx, cy, x1, y1, rx, ry, x2, y2] = p.slice(1).map(Number);
const dist = (x, y) => Math.hypot(x - cx, y - cy);
for (const [x, y, qual] of [[x1, y1, 'primeira'], [x2, y2, 'segunda']]) {
  if (Math.abs(dist(x, y) - rx) > 0.5) {
    throw new Error(`a ${qual} ponta do caminho está a ${dist(x, y).toFixed(2)} do centro, e o raio declarado é ${rx}.`);
  }
}
if (Math.abs(rx - ry) > 0.001) throw new Error('o arco não é circular — este gerador só desenha disco.');

// `sweep=1` é sentido horário no sistema do SVG (y para baixo), então o setor
// PRESERVADO vai da primeira ponta à segunda nesse sentido — 305 graus, com a
// cunha de 55 apontando para o norte.
const ang = (x, y) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
const de = ang(x1, y1);
const varredura = (ang(x2, y2) - de + 360) % 360;

/** O pixel está na tinta? Coordenadas no mesmo viewBox de 100 do caminho. */
function dentro(x, y) {
  if (dist(x, y) > rx) return false;
  return (ang(x, y) - de + 360) % 360 <= varredura;
}

const crc = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function png(lado, pixel) {
  // RGBA, uma linha por vez, com o byte de filtro zero na frente.
  const bruto = Buffer.alloc(lado * (lado * 4 + 1));
  let i = 0;
  for (let y = 0; y < lado; y++) {
    bruto[i++] = 0;
    for (let x = 0; x < lado; x++) {
      const [r, g, b, a] = pixel(x, y);
      bruto[i++] = r; bruto[i++] = g; bruto[i++] = b; bruto[i++] = a;
    }
  }
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const soma = Buffer.alloc(4); soma.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, soma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(bruto, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/**
 * Quanto da marca cobre este pixel, de 0 a 1.
 *
 * Quatro amostras por lado. Sem isso a borda do disco sai serrilhada, e um
 * ícone serrilhado é a primeira coisa que alguém nota num lançador — a tela do
 * celular mostra o quadradinho do lado de dezenas de ícones lisos.
 */
function cobertura(x, y, lado, fracao) {
  const N = 4;
  let acc = 0;
  for (let sy = 0; sy < N; sy++) {
    for (let sx = 0; sx < N; sx++) {
      const px = (x + (sx + 0.5) / N) / lado;
      const py = (y + (sy + 0.5) / N) / lado;
      // do quadrado unitário para o viewBox de 100, com a marca ocupando
      // `fracao` do lado e centrada.
      const u = 50 + ((px - 0.5) * 100) / fracao;
      const v = 50 + ((py - 0.5) * 100) / fracao;
      if (dentro(u, v)) acc++;
    }
  }
  return acc / (N * N);
}

const mistura = (fundo, tinta, a) => fundo.map((c, i) => Math.round(c * (1 - a) + tinta[i] * a));

/**
 * `fracao` é quanto do lado o DISCO ocupa, e cada superfície pede a sua.
 *
 * O ícone do lançador é recortado em círculo pelo sistema, então a marca respira
 * dentro dele. O primeiro plano adaptativo do Android é pior: o sistema mexe a
 * camada para o efeito de profundidade e só o miolo de 66% é garantido — uma
 * marca cheia perde a borda em aparelho nenhum e em outro perde inteira.
 */
const ALVOS = [
  { arquivo: 'assets/icon.png',                     lado: 1024, fracao: 0.62, fundo: '#FAF7F2' },
  { arquivo: 'assets/android-icon-foreground.png',  lado: 1024, fracao: 0.44, fundo: null },
  { arquivo: 'assets/android-icon-background.png',  lado: 1024, fracao: 0,    fundo: '#FAF7F2' },
  { arquivo: 'assets/android-icon-monochrome.png',  lado: 1024, fracao: 0.44, fundo: null, tinta: '#000000' },
  { arquivo: 'assets/splash-icon.png',              lado: 1024, fracao: 0.50, fundo: null },
  // A abertura tem duas luzes, como o resto do aplicativo.
  //
  // O `expo-splash-screen` não recolore a imagem: o modo escuro pede o SEU
  // arquivo (`dark: { image }`), e sem ele a marca de grafite abre sobre papel
  // carvão, quase invisível. É a mesma cicatriz do tema claro ilegível, na
  // primeira tela que alguém vê.
  { arquivo: 'assets/splash-icon-dark.png',         lado: 1024, fracao: 0.50, fundo: null,
    tinta: pega('markColorDark') },
  { arquivo: 'assets/favicon.png',                  lado: 96,   fracao: 0.72, fundo: '#FAF7F2' },
];

for (const alvo of ALVOS) {
  const tinta = hex(alvo.tinta ?? TINTA);
  const fundo = alvo.fundo ? hex(alvo.fundo) : null;
  const dados = png(alvo.lado, (x, y) => {
    const a = alvo.fracao > 0 ? cobertura(x, y, alvo.lado, alvo.fracao) : 0;
    if (fundo) return [...mistura(fundo, tinta, a), 255];
    return [...tinta, Math.round(a * 255)];
  });
  writeFileSync(alvo.arquivo, dados);
  console.log(`${alvo.arquivo}  ${alvo.lado}px  ${(dados.length / 1024).toFixed(0)} KB`);
}
console.log(`\nA cunha é de ${(360 - varredura).toFixed(1)}°, apontando para o norte, tirada do brand.ts.`);
