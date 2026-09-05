/**
 * O laço de trabalho no aparelho: subir, instalar, fotografar, derrubar.
 *
 * Existe porque o defeito mais caro deste projeto não foi de lógica: um tema claro
 * ilegível chegou na tela do dono depois de passar por 338 testes verdes e 36 checagens
 * de navegador. Nada disso olha pixel. **A foto é que prova tela.**
 *
 * Duas coisas aqui não são detalhe:
 *
 * 1. **A máquina não tem virtualização** (`/dev/kvm` não existe), então o emulador roda
 *    por software (`-accel off`). Boot de imagem completa leva mais de dez minutos na
 *    primeira vez — por isso este script salva instantâneo ao sair e reaproveita depois.
 *
 * 2. **A foto é conferida antes de ser aceita.** Uma captura de cor única é o modo de
 *    falha silencioso desta montagem: com o gráfico errado, `screencap` devolve um
 *    retângulo preto e o comando sai com código zero. Aqui, imagem sem variação é
 *    ERRO — porque "o comando passou" já foi confundido com "a tela está certa" uma
 *    vez, e foi essa confusão que gerou o retrabalho da semana.
 *
 * Uso:
 *   node scripts/aparelho.mjs subir [--avd norva-cheio]
 *   node scripts/aparelho.mjs instalar [caminho.apk]
 *   node scripts/aparelho.mjs foto <nome>     — uma foto na tela atual
 *   node scripts/aparelho.mjs fotos <nome>    — a mesma tela em cinco larguras
 *   node scripts/aparelho.mjs tela <medida>   — troca a tela sem reiniciar
 *   node scripts/aparelho.mjs derrubar
 */
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SDK = process.env.ANDROID_HOME ?? '/opt/android-sdk';
const ADB = join(SDK, 'platform-tools/adb');
const EMU = join(SDK, 'emulator/emulator');
const SAIDA = '.shots';
const AVD = arg('--avd') ?? 'norva-cheio';

/**
 * As telas em que o app tem de caber — e por que são medidas em dp, não em pixel.
 *
 * O dono cortou isto na raiz: fixar a resolução do emulador e ajustar o layout até
 * ficar bonito nela é repetir, noutra dimensão, o erro que gerou o retrabalho.
 * O que o layout enxerga não é pixel, é **densidade independente**: largura em
 * pixels dividida por (densidade/160). O mesmo "1080 de largura" é 393 dp num
 * telefone de 440 dpi e 720 dp num tablet de 240 dpi.
 *
 * Do telefone ao tablet a largura DOBRA. Uma coluna que serve a 393 dp vira uma
 * tira esticada a 800 dp — lá o certo é refluir em colunas, não escalar. Por isso
 * a foto não é uma: é a mesma tela em cinco larguras, e o defeito aparece na
 * comparação, não na imagem isolada.
 *
 * Trocar tela por `wm size`/`wm density` custa segundos; subir outro emulador custa
 * minutos. Um aparelho só, cinco medidas.
 */
const TELAS = {
  'telefone-pequeno': { px: '720x1440',  dpi: 320 },   // 360 dp — o piso do Android
  telefone:           { px: '1080x2340', dpi: 440 },   // 393 dp — o mais comum hoje
  'telefone-grande':  { px: '1440x3120', dpi: 560 },   // 411 dp
  'tablet-7':         { px: '1200x1920', dpi: 240 },   // 800 dp — aqui tem de refluir
  'tablet-deitado':   { px: '2560x1600', dpi: 240 },   // 1706 dp
};

const dp = (t) => Math.round(Number(t.px.split('x')[0]) / (t.dpi / 160));

function arg(nome) {
  const i = process.argv.indexOf(nome);
  return i > -1 ? process.argv[i + 1] : null;
}

function adb(...args) {
  return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function adbBin(...args) {
  return execFileSync(ADB, args, { maxBuffer: 256 * 1024 * 1024 });
}

const dizer = (...m) => console.log('›', ...m);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function subir() {
  try {
    if (adb('shell', 'getprop', 'sys.boot_completed') === '1') {
      dizer('já está de pé');
      return;
    }
  } catch {
    /* nenhum aparelho: é o caso normal aqui */
  }

  dizer(`subindo ${AVD} — sem KVM, então é emulação por software`);
  // Sem `-no-snapshot`: a primeira subida é cara (oito minutos a frio), e o
  // instantâneo salvo na saída faz as seguintes custarem segundos. Três núcleos e não
  // quatro: o quarto fica para o Metro e o resto, senão o System UI leva ANR.
  const filho = spawn(
    EMU,
    ['-avd', AVD, '-no-window', '-no-audio', '-no-boot-anim',
     '-accel', 'off', '-gpu', 'swiftshader_indirect', '-memory', '3072', '-cores', '3',
     // O idioma do aparelho decide o idioma do app. Sem isto, a foto sai em inglês e
     // mente sobre o produto — foi exatamente o erro cometido antes com o navegador,
     // que fotografou o app em inglês e passou por conferência.
     '-prop', 'persist.sys.locale=pt-BR',
     '-timezone', 'America/Sao_Paulo'],
    { detached: true, stdio: 'ignore' },
  );
  filho.unref();

  const inicio = Date.now();
  for (let i = 0; i < 180; i += 1) {
    await dormir(10_000);
    try {
      if (adb('shell', 'getprop', 'sys.boot_completed') === '1') {
        dizer(`de pé em ${Math.round((Date.now() - inicio) / 1000)}s`);
        return;
      }
    } catch {
      /* ainda não respondeu */
    }
  }
  throw new Error('o emulador não terminou de subir em 30 minutos');
}

function instalar(apk) {
  const caminho = apk ?? 'android/app/build/outputs/apk/debug/app-debug.apk';
  if (!existsSync(caminho)) {
    throw new Error(
      `não achei ${caminho} — compile antes:\n` +
      '  cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64',
    );
  }
  const inicio = Date.now();
  dizer(`instalando ${caminho}`);
  console.log(adb('install', '-r', caminho));
  dizer(`instalou em ${Math.round((Date.now() - inicio) / 1000)}s`);
}

/**
 * Quantas cores distintas a imagem tem, por amostragem dos bytes do PNG.
 *
 * Não decodifica o PNG: compara o tamanho do arquivo e a entropia grosseira dos bytes.
 * Uma tela de cor única comprime para quase nada — o preto de 1080×2340 saía com 15 KB,
 * contra 165 KB de uma tela com conteúdo. O limiar é generoso de propósito: aqui o
 * objetivo é pegar a captura MORTA, não julgar o desenho.
 */
function pareceViva(caminho) {
  const bytes = statSync(caminho).size;
  const dados = readFileSync(caminho);
  const vistos = new Set();
  for (let i = 0; i < dados.length; i += 97) vistos.add(dados[i]);
  return { bytes, variacao: vistos.size, viva: bytes > 40_000 && vistos.size > 60 };
}

function foto(nome) {
  if (!nome) throw new Error('uso: node scripts/aparelho.mjs foto <nome>');
  mkdirSync(SAIDA, { recursive: true });
  const destino = join(SAIDA, `${nome}.png`);

  // Primeiro pelo convidado. Se a composição estiver do lado do host, isto devolve
  // um retângulo morto — e aí a segunda tentativa, pelo console do emulador, pega
  // o quadro onde ele realmente está.
  let veredito;
  try {
    const png = adbBin('exec-out', 'screencap', '-p');
    writeFileSync(destino, png);
    veredito = pareceViva(destino);
  } catch {
    veredito = { bytes: 0, variacao: 0, viva: false };
  }

  if (!veredito.viva) {
    dizer('a captura do convidado veio morta; tentando pelo console do emulador');
    const tmp = join(SAIDA, '.console');
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    adb('emu', 'screenrecord', 'screenshot', tmp);
    const arquivo = readdirSync(tmp).find((f) => f.endsWith('.png'));
    if (arquivo) {
      copyFileSync(join(tmp, arquivo), destino);
      veredito = pareceViva(destino);
    }
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`${destino} — ${(veredito.bytes / 1024).toFixed(0)} KB, variação ${veredito.variacao}`);
  if (!veredito.viva) {
    throw new Error(
      'a foto saiu morta (cor única). Isso NÃO é sucesso: o comando sairia zero e a tela\n' +
      'continuaria sem prova. Confira se o app desenhou:\n' +
      `  ${ADB} shell dumpsys gfxinfo <pacote> | grep "Total frames rendered"`,
    );
  }
}

/** Troca a tela do aparelho em execução. Volta ao natural com `tela original`. */
function tela(nome) {
  if (nome === 'original') {
    adb('shell', 'wm', 'size', 'reset');
    adb('shell', 'wm', 'density', 'reset');
    dizer('tela de volta ao natural');
    return;
  }
  const t = TELAS[nome];
  if (!t) throw new Error(`tela desconhecida: ${nome}. Há: ${Object.keys(TELAS).join(', ')}`);
  adb('shell', 'wm', 'size', t.px);
  adb('shell', 'wm', 'density', String(t.dpi));
  dizer(`${nome}: ${t.px} a ${t.dpi} dpi = ${dp(t)} dp de largura`);
}

/**
 * A mesma tela do app em todas as larguras, uma foto cada.
 *
 * É este comando que responde "o layout se adapta?", e nenhuma foto sozinha responde.
 */
async function fotos(nome) {
  if (!nome) throw new Error('uso: node scripts/aparelho.mjs fotos <nome-da-rota>');
  for (const chave of Object.keys(TELAS)) {
    tela(chave);
    await dormir(6000); // o app precisa de um instante para refazer o layout
    foto(`${nome}--${chave}`);
  }
  tela('original');
}

function derrubar() {
  try {
    adb('emu', 'kill');
    dizer('derrubado');
  } catch {
    dizer('nenhum emulador de pé');
  }
}

const verbo = process.argv[2];
const acoes = {
  subir,
  instalar: () => instalar(process.argv[3]?.startsWith('--') ? null : process.argv[3]),
  foto: () => foto(process.argv[3]),
  fotos: () => fotos(process.argv[3]),
  tela: () => tela(process.argv[3]),
  derrubar,
};

if (!acoes[verbo]) {
  console.error(
    'verbos: subir | instalar [apk] | foto <nome> | fotos <nome> | tela <medida> | derrubar\n' +
    `medidas: ${Object.keys(TELAS).join(' | ')} | original`,
  );
  process.exit(1);
}
await acoes[verbo]();
