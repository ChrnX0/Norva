import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A prancha de uma cena, renderizada no navegador — em segundos, e ampliada.
 *
 * **Por que ela existe.** Olhar um desenho do cabeçalho custava compilar o APK (quatro
 * minutos), instalar (um) e esperar o aplicativo subir num emulador por software (mais
 * um). Seis minutos para responder "esse traço lê como o quê?". E a foto do aparelho
 * sai a 393 dp: a cena inteira ocupa uma faixa de 1080 por 210 pixels, onde uma colher
 * de doze unidades tem quatro pixels de largura. Foi ampliando que se viu que duas
 * colheres tinham virado funis pendurados em nada.
 *
 * A cena é **geometria pura** — comandos SVG numa função. Então ela se desenha fora do
 * aplicativo: lê-se a função, monta-se um `<svg>` do tamanho da prancha, e o Chromium
 * que já está instalado tira a foto. Cinco segundos, e no tamanho que se quiser.
 *
 * **O que ela NÃO prova, dito em vez de omitido.** Geometria e composição, e mais nada.
 * As cores aqui são uma amostra do Papel escritas neste arquivo, não as do tema no ar; o
 * encaixe no cabeçalho não existe; a animação não roda — o que se vê é o repouso. Quem
 * trocar esta foto pela do aparelho vai acertar o desenho e errar a tela. A regra da
 * casa continua sendo a de sempre: o que prova TELA é a foto do emulador.
 *
 * **E o buraco que ela tem, dito em voz alta E na saída.** A varredura lê os traços
 * ESCRITOS na cena. Peça que se desenha por dentro de um componente auto-fechado — a
 * `<Gota/>` das Perdas é a de hoje — não aparece, e uma cena com um buraco silencioso é
 * a foto que mente, que é o defeito que esta casa já pagou duas vezes. Então o comando
 * conta quantas dessas ele viu e diz na saída, pelo nome. Ver o aviso no fim.
 *
 *   node scripts/prancha.mjs receitas
 */

const FONTE = 'src/components/cenas/Cena.tsx';
const SAIDA = '.shots';

/** Uma amostra do Papel claro, só para o desenho ter contraste. Ver o docblock. */
const AMOSTRA = { papel: '#FAF7F2', tinta: '#221F1B', acento: '#B4451F', frio: '#4A7A9B', chao: '#B5A68F' };
const PRANCHA = { largura: 364, altura: 72, chao: 64 };

function corpoDaCena(nome) {
  const arquivo = readFileSync(FONTE, 'utf8');
  const alvo = nome[0].toUpperCase() + nome.slice(1);
  const inicio = arquivo.indexOf(`function ${alvo}(`);
  if (inicio < 0) {
    const cenas = [...arquivo.matchAll(/^function (\w+)\(\{[^}]*\}: Pincel\)/gm)].map((m) => m[1]);
    throw new Error(`não achei a cena "${alvo}". As que existem:\n  ${cenas.join(' · ')}`);
  }
  const fim = arquivo.indexOf('\nfunction ', inicio + 1);
  // O comentário do JSX é texto entre `{/*` e `*/}`, e ele carrega `d="…"` de exemplo
  // com frequência — tirar antes de procurar traço evita desenhar a explicação.
  return (fim > 0 ? arquivo.slice(inicio, fim) : arquivo.slice(inicio)).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

function svgDaCena(nome) {
  const corpo = corpoDaCena(nome);
  const tinta = (attrs) =>
    /acento/.test(attrs) ? AMOSTRA.acento : /frio/.test(attrs) ? AMOSTRA.frio : AMOSTRA.tinta;

  const pecas = [
    `<rect width="${PRANCHA.largura}" height="${PRANCHA.altura}" fill="${AMOSTRA.papel}"/>`,
    `<path d="M0 ${PRANCHA.chao}H${PRANCHA.largura}" stroke="${AMOSTRA.chao}" stroke-width="1"/>`,
  ];

  // A cor de um traço pode vir do que o EMBRULHA, e não dele. Duas formas existem no
  // arquivo e as duas contam: `<G stroke={acento}>` com filhos sem atributo, e um
  // componente da casa que recebe `cor={acento}` e repassa (`PecaDoCatalogo`). Sem a
  // segunda, o único produto colorido do catálogo saía preto — e o desenho contradizia o
  // docblock da própria cena, que promete "uma só com cor". Foi a ferramenta acusando a
  // si mesma na segunda cena em que rodou, que é o motivo de rodar numa segunda.
  let doGrupo = AMOSTRA.tinta;
  for (const m of corpo.matchAll(/<(\/?)([A-Z]\w*)([^>]*?)(\/?)>/g)) {
    const [, fecha, tag, attrs, auto] = m;
    const primitiva = tag === 'Path' || tag === 'Rect' || tag === 'Circle';
    if (!primitiva) {
      // Grupo ou componente que embrulha: abre uma cor, fecha voltando para a tinta.
      // Auto-fechado não embrulha nada, então não mexe na cor de ninguém.
      if (!auto) doGrupo = fecha ? AMOSTRA.tinta : tinta(attrs);
      continue;
    }
    const cor = /(?:stroke|fill|cor)=\{/.test(attrs) ? tinta(attrs) : doGrupo;
    const opacidade = attrs.match(/opacity=\{([\d.]+)\}/)?.[1] ?? '1';
    const comum = `fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="${opacidade}"`;
    if (tag === 'Path') pecas.push(`<path d="${attrs.match(/d="([^"]+)"/)?.[1] ?? ''}" ${comum}/>`);
    if (tag === 'Rect') pecas.push(`<rect ${attrs.replace(/\{[^}]*\}/g, '').replace(/\w+=(?!")\S*/g, '')} ${comum}/>`);
    if (tag === 'Circle') pecas.push(`<circle ${attrs.replace(/\{[^}]*\}/g, '').replace(/\w+=(?!")\S*/g, '')} ${comum}/>`);
  }

  const ESCALA = 4;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PRANCHA.largura} ${PRANCHA.altura}" ` +
    `width="${PRANCHA.largura * ESCALA}" height="${PRANCHA.altura * ESCALA}">${pecas.join('')}</svg>`
  );
}

const nome = process.argv[2];
if (!nome) {
  console.error('uso: node scripts/prancha.mjs <cena>   (ex.: receitas)');
  process.exit(1);
}

mkdirSync(SAIDA, { recursive: true });
const svg = join(SAIDA, `prancha-${nome}.svg`);
const png = join(SAIDA, `prancha-${nome}.png`);
const { writeFileSync } = await import('node:fs');
writeFileSync(svg, svgDaCena(nome));

const { chromium } = await import('playwright');
const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({
    viewport: { width: PRANCHA.largura * 4, height: PRANCHA.altura * 4 },
  });
  await pagina.goto(`file://${join(process.cwd(), svg)}`);
  await pagina.screenshot({ path: png });
} finally {
  await navegador.close();
}
console.log(`${png} — ${PRANCHA.largura * 4}×${PRANCHA.altura * 4}, quatro vezes o tamanho da prancha`);

// O que ficou de fora, pelo nome. Silêncio aqui seria uma cena com buraco parecendo
// inteira — e quem olhasse consertaria o vão que não existe.
const porDentro = [
  ...new Set(
    [...corpoDaCena(nome).matchAll(/<([A-Z]\w*)[^>]*\/>/g)]
      .map((m) => m[1])
      .filter((t) => !['Path', 'Rect', 'Circle', 'Line', 'Ellipse'].includes(t)),
  ),
];
if (porDentro.length) {
  console.log(
    `⚠ ${porDentro.join(', ')} se desenha${porDentro.length > 1 ? 'm' : ''} por dentro e NÃO está` +
    `${porDentro.length > 1 ? 'ão' : ''} nesta foto — a cena tem mais do que se vê aqui.`,
  );
}
console.log('lembre: isto prova GEOMETRIA. O que prova tela é a foto do emulador.');
