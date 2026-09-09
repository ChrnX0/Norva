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
 * 3. **Compilar é UMA arquitetura, e isso é cicatriz de 6 de setembro.** O
 *    `gradle.properties` pede as quatro (`armeabi-v7a,arm64-v8a,x86,x86_64`), que é o
 *    certo para o APK de entrega e é desperdício aqui: o emulador é x86_64 e as outras
 *    três só gastam. Duas compilações falharam seguidas com o `cmake` saindo 1, e a
 *    causa não era o `cmake` — era **disco**. O `.cxx` e o `build` do reanimated, do
 *    worklets e do expo-modules-core somavam **8 GB** de objeto nativo, quase todo de
 *    arquitetura que este emulador nunca vai executar. O verbo `compilar` passa
 *    `-PreactNativeArchitectures=x86_64` para não repetir isso.
 *
 * Uso:
 *   node scripts/aparelho.mjs subir [--avd norva-cheio]
 *   node scripts/aparelho.mjs compilar          — APK que roda sozinho, só x86_64
 *   node scripts/aparelho.mjs instalar [caminho.apk]
 *   node scripts/aparelho.mjs abrir <rota>    — navega sem toque (norva://<rota>)
 *   node scripts/aparelho.mjs foto <nome>     — uma foto na tela atual
 *   node scripts/aparelho.mjs fotos <nome> [rota] — a mesma tela em cinco larguras
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
/** O pacote e o esquema do app — os dois vêm do `app.json` e não se adivinham. */
const PACOTE = 'app.norva.mobile';
const ESQUEMA = 'norva';

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
  'telefone-pequeno': { px: '720x1440',  dpi: 320 },                  // 360 dp — o piso
  telefone:           { px: '1080x2340', dpi: 440 },                  // 393 dp — o comum
  'telefone-grande':  { px: '1440x3120', dpi: 560 },                  // 411 dp
  'tablet-7':         { px: '1200x1920', dpi: 240 },                  // 800 dp — reflui aqui
  'tablet-deitado':   { px: '1600x2560', dpi: 240, deitado: true },   // 1066 dp de altura
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

/**
 * O que `compilar` produz é o que `instalar` instala — e não era.
 *
 * `compilar` roda `assembleRelease` (é o único que empacota o JavaScript; ver o
 * docblock dele) e `instalar` procurava o `app-debug.apk`. Rodar os dois em sequência
 * dava "não achei … compile antes", mandando compilar o que tinha acabado de compilar.
 * Cicatriz de 9 de setembro, e é a mesma família do `fotos` que não alcançava a rota:
 * ferramenta que promete um par e entrega dois lados diferentes gasta a rodada de quem
 * confia nela.
 *
 * A ordem de procura tem o release na frente, e a mensagem de erro cita o verbo desta
 * ferramenta em vez de um comando do Gradle — quem chegou aqui já está usando ela.
 */
const APKS = [
  'android/app/build/outputs/apk/release/app-release.apk',
  'android/app/build/outputs/apk/debug/app-debug.apk',
];

function instalar(apk) {
  const caminho = apk ?? APKS.find((c) => existsSync(c)) ?? APKS[0];
  if (!existsSync(caminho)) {
    throw new Error(
      `não achei ${caminho} — compile antes:\n` +
      '  node scripts/aparelho.mjs compilar',
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

/**
 * Em quantos dp esta tela está AGORA — e por que toda foto diz isso.
 *
 * `wm density` é persistente: quem comparou larguras e não devolveu deixa o
 * aparelho preso. Em 7 de setembro o emulador estava em 240 dpi de um teste
 * antigo, e uma sessão inteira leu **720 dp — tablet** como se fosse telefone,
 * medindo margem e julgando composição na largura errada.
 *
 * A foto não avisa sozinha: ela sai 1080 px de qualquer jeito, e 1080 px é 393 dp
 * ou 720 dp conforme uma variável que não aparece no retrato. Então a legenda de
 * toda foto passa a trazer a conta. Regra escrita não impede; o que impede é o
 * número estar na frente de quem olha.
 */
function larguraEmDp() {
  try {
    const d = adbBin('shell', 'wm', 'density').toString();
    const t = adbBin('shell', 'wm', 'size').toString();
    const dpi = Number((d.match(/Override density:\s*(\d+)/) ?? d.match(/Physical density:\s*(\d+)/))?.[1]);
    const px = Number((t.match(/Override size:\s*(\d+)/) ?? t.match(/Physical size:\s*(\d+)/))?.[1]);
    if (!dpi || !px) return null;
    return { dp: Math.round(px / (dpi / 160)), px, dpi };
  } catch {
    return null;
  }
}

/**
 * Uma foto — e a ROTA é opcional aqui pelo mesmo motivo que é obrigatória no plural.
 *
 * **Cicatriz de 9 de setembro, e ela é a irmã pequena da de 9 de setembro.** O plural
 * ganhou rota quando as cinco fotos saíram todas da capa; o singular ficou como estava,
 * recebendo só o nome. Então `foto caderno recipes` fotografou o LANÇADOR do Android —
 * o segundo argumento caiu no chão, sem aviso, e o comando saiu zero. O mesmo defeito,
 * no verbo ao lado, sobrevivendo ao conserto do primeiro porque ninguém perguntou quem
 * MAIS fazia aquilo. O `CLAUDE.md` tem a regra escrita para peles; ela vale para
 * ferramenta igual.
 *
 * E abrir sem esperar não bastava: a captura logo depois do `am start` pega a tela de
 * abertura, que é uma marca preta num fundo claro — viva pela régua de variação, e
 * inútil. Com rota, espera a tela parar, como o plural faz.
 */
async function foto(nome, rota) {
  if (!nome) throw new Error('uso: node scripts/aparelho.mjs foto <nome> [rota]');
  if (rota) {
    abrir(rota, { reiniciar: true });
    esperarTelaParar();
  }
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

  const largura = larguraEmDp();
  const emQue = largura
    ? ` — ${largura.dp} dp (${largura.px} px a ${largura.dpi} dpi)${largura.dp >= 600 ? ' ⚠ TABLET' : ''}`
    : '';
  console.log(
    `${destino} — ${(veredito.bytes / 1024).toFixed(0)} KB, variação ${veredito.variacao}${emQue}`,
  );
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
  // Deitar não é trocar largura por altura: o framebuffer continua em retrato e a
  // captura sai com tarja preta. Quem deita a tela é a rotação.
  adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
  adb('shell', 'settings', 'put', 'system', 'user_rotation', t.deitado ? '1' : '0');
  dizer(`${nome}: ${t.px} a ${t.dpi} dpi = ${dp(t)} dp${t.deitado ? ', deitado' : ''}`);
}

/**
 * Abre uma ROTA do app, sem toque nenhum — e é isto que faz o `fotos` valer.
 *
 * O `CLAUDE.md` promete que `fotos <rota>` tira "a mesma tela em cinco larguras", e
 * até 9 de setembro ele não fazia isso para tela nenhuma que não fosse a inicial:
 * trocar `wm size` é mudança de configuração, o Android recria a Activity, e o app
 * volta para a capa. As cinco fotos saíam todas da mesma tela — cinco vezes a capa —
 * e a comparação que elas deveriam provar não existia. Foi assim que a primeira
 * tentativa de fotografar `recipes/new` em cinco larguras devolveu cinco capas.
 *
 * O conserto é a ligação profunda que o `app.json` já declarava (`scheme: norva`) e
 * ninguém usava. Navegar por toque em coordenada era o outro caminho, e ele é pior
 * em tudo: quebra quando o layout muda, que é exatamente o que se está medindo.
 */
function abrir(rota, { reiniciar = false } = {}) {
  if (!rota) return;
  const limpa = String(rota).replace(/^\/+/, '');
  const alvo = `${ESQUEMA}://${limpa}`;
  // `am start` SAI ZERO quando o intent não resolve — ele imprime `Error:` e pronto.
  // É o mesmo modo de falha do `screencap` devolvendo retângulo preto: o comando
  // passa e a prova não existe. Então quem decide aqui é a saída, não o código.
  const saida = adb('shell', 'am', 'start', ...(reiniciar ? ['-S'] : []),
                    '-a', 'android.intent.action.VIEW', '-d', alvo, PACOTE);
  if (/Error:/.test(saida)) {
    throw new Error(`${alvo} não abriu:\n${saida}`);
  }
  dizer(`abrindo ${alvo}`);
}

/**
 * O que a tela DIZ agora — o texto dela, lido do próprio Android.
 *
 * Existe porque `am start` responde "ok" para qualquer caminho: o Android entrega a
 * URL ao app em execução e vai embora, e quem decide se a rota existe é o roteador
 * lá dentro. Ou seja, a checagem de `Error:` no `abrir` pega esquema errado e pacote
 * errado — que são falhas reais, e as duas foram exercitadas — e NÃO pega caminho
 * errado. Este é o instrumento que pega: o texto da tela.
 *
 * Vale dizer o que ele não é: não substitui a foto. Ele responde "que tela é esta",
 * a foto responde "como ela está". As duas perguntas são diferentes e este projeto
 * já pagou caro por confundi-las.
 */
function oQueDizATela() {
  try {
    const bruto = adbBin('exec-out', 'uiautomator', 'dump', '/dev/tty').toString();
    return [...bruto.matchAll(/text="([^"]+)"/g)].map((m) => m[1]).filter((t) => t.trim());
  } catch {
    return [];
  }
}

/**
 * As cinco larguras estão na MESMA tela? — e é isto que o comando não sabia responder.
 *
 * A falha que motivou: a troca de largura recria a Activity, o app volta para a capa,
 * e as fotos saem todas da tela inicial com o comando saindo zero. Se a rota valeu em
 * todas, a primeira linha de texto (a sobrancelha do cabeçalho, ou o título) é a
 * mesma nas cinco. Se numa delas a navegação não pegou, ela destoa — e é exatamente
 * essa a assinatura do defeito.
 */
function mesmaTelaEmTodas(titulos) {
  const vistos = [...new Set(titulos.filter(Boolean))];
  return { igual: vistos.length <= 1, vistos };
}

/**
 * Espera o app DESENHAR de novo — não um tempo fixo.
 *
 * Trocar o tamanho da tela é mudança de configuração: o Android recria a Activity e o
 * app refaz a partida inteira, que aqui custa minutos porque a emulação é por software.
 * A primeira versão disto dormia seis segundos e fotografava a tela em branco — o mesmo
 * defeito de sempre, esperar um relógio em vez de esperar o fato.
 *
 * O fato observável é o contador de quadros do próprio app: se ele subiu depois do
 * relayout, a tela foi redesenhada.
 */
async function esperarDesenho(minutos = 8, pacote = PACOTE) {
  const quadros = () => {
    try {
      const saida = adb('shell', 'dumpsys', 'gfxinfo', pacote);
      const m = saida.match(/Total frames rendered:\s*(\d+)/);
      return m ? Number(m[1]) : 0;
    } catch {
      return 0;
    }
  };
  const antes = quadros();
  const limite = Date.now() + minutos * 60_000;
  while (Date.now() < limite) {
    await dormir(10_000);
    const agora = quadros();
    if (agora > antes + 20) {
      dizer(`redesenhou (${antes} → ${agora} quadros)`);
      await dormir(4000); // deixa a animação de entrada terminar
      return true;
    }
  }
  dizer(`ATENÇÃO: não redesenhou em ${minutos} min — a foto abaixo não vale`);
  return false;
}

/**
 * Espera a tela PARAR — e é medida direta, não proxy.
 *
 * O contador de quadros do `esperarDesenho` responde "desenhou desde que eu
 * olhei", e essa é a pergunta errada depois de uma ligação profunda: se o app já
 * estava na rota pedida, o intent é entregue e nada redesenha, então o proxy
 * grita "não redesenhou em 4 min — a foto não vale" para uma tela perfeitamente
 * pronta. Foi o que aconteceu na segunda largura de 9 de setembro.
 *
 * A pergunta certa é a que a foto faz: **a tela está desenhada e parada?** E há
 * instrumento direto para ela — o texto da própria tela. Duas leituras iguais e
 * não vazias, com cinco segundos entre elas, é tela pronta. Tela em branco nunca
 * devolve texto e nunca assenta; tela ainda montando muda entre as duas leituras.
 *
 * A entrada em cascata mexe a OPACIDADE, não o texto, então o assentamento vem
 * antes de a animação acabar — daí a pausa curta no fim, que é a mesma do laço
 * antigo e pela mesma razão.
 */
async function esperarTelaParar(minutos = 4) {
  let anterior = null;
  let mudas = 0;
  const limite = Date.now() + minutos * 60_000;
  while (Date.now() < limite) {
    await dormir(5000);
    const diz = oQueDizATela();
    const agora = diz.join('\u0001');

    // **O leitor de acessibilidade recusa tela que se mexe** — e neste aplicativo
    // toda tela se mexe, por exigência escrita do dono ("quero animação em todas
    // as telas"). O `uiautomator dump` responde *"could not get idle state"* e
    // volta vazio enquanto a cena do cabeçalho estiver no meio do ciclo dela.
    //
    // Isso não torna o instrumento inútil: em quase toda tela o dump pega uma
    // brecha entre ciclos. Mas quando não pega, esperar o texto assentar é
    // esperar para sempre — então depois de três leituras mudas o laço volta para
    // o contador de quadros, que é grosseiro e sempre responde. A foto sai; o que
    // se perde é a legenda dizendo QUE tela é, e a conferência das cinco larguras
    // passa a ignorar essa (ela filtra título vazio de propósito).
    if (!agora) {
      mudas += 1;
      if (mudas >= 3) {
        dizer('  a tela não fica quieta para ser lida (animação) — medindo por quadros');
        const desenhou = await esperarDesenho(Math.max(1, Math.round(minutos / 2)));
        return { parou: desenhou, diz: [] };
      }
      continue;
    }
    mudas = 0;

    if (agora === anterior) {
      await dormir(4000);
      return { parou: true, diz };
    }
    anterior = agora;
  }
  dizer(`ATENÇÃO: a tela não assentou em ${minutos} min — a foto abaixo não vale`);
  return { parou: false, diz: oQueDizATela() };
}

/**
 * A mesma tela do app em todas as larguras, uma foto cada.
 *
 * É este comando que responde "o layout se adapta?", e nenhuma foto sozinha responde.
 */
async function fotos(nome, rota) {
  if (!nome) throw new Error('uso: node scripts/aparelho.mjs fotos <nome> [rota]');
  const ruins = [];
  const titulos = [];
  process.on('exit', () => tela('original'));
  for (const chave of Object.keys(TELAS)) {
    tela(chave);
    // A rota vem LOGO depois de trocar a largura, e isso é medida, não gosto.
    //
    // Trocar `wm size` destrói a Activity e o Android **não a recria sozinha**: o
    // processo do app continua vivo com ZERO view anexada, e nesse estado o
    // `dumpsys gfxinfo` nem imprime a linha `Total frames rendered`. Ou seja,
    // esperar o redesenho antes de navegar é esperar um app que ninguém mandou
    // desenhar — oito minutos de espera por largura, quarenta na volta inteira,
    // medidos em 9 de setembro. Quem acorda a tela é o próprio `am start` da rota.
    //
    // Sem rota não há o que abrir, e aí a espera continua sendo a única saída: é o
    // laço antigo, que serve para a capa.
    let desenhou;
    if (rota) {
      // `-S` — partida FRIA, e é o que torna o laço determinístico.
      //
      // Depois de `wm size` o Android destrói a Activity e não a recria: o processo
      // continua vivo, `am start` responde *"delivered to currently running top-most
      // instance"*, e nada desenha — o `uiautomator dump` volta sem uma linha sequer.
      // Foi assim que a segunda largura ficou quatro minutos esperando uma tela que
      // ninguém tinha mandado montar. Parar o app antes de abrir custa a partida fria
      // e devolve a mesma tela em toda largura, que é o que a comparação exige.
      abrir(rota, { reiniciar: true });
      const parou = await esperarTelaParar();
      desenhou = parou.parou;
      titulos.push(parou.diz[0] ?? '');
      dizer(`  a tela diz: ${parou.diz.slice(0, 2).join(' · ') || '(nada legível)'}`);
    } else {
      desenhou = await esperarDesenho();
    }
    try {
      foto(`${nome}--${chave}`);
      if (!desenhou) ruins.push(chave);
    } catch (e) {
      ruins.push(chave);
      console.error(`  ${chave}: ${e.message.split('\n')[0]}`);
    }
  }
  // Devolver a tela é `finally` e não a última linha: uma exceção no meio do laço
  // deixava o aparelho preso na última largura, e a sessão seguinte fotografava
  // tablet sem saber. Ver `larguraEmDp`.
  tela('original');
  if (ruins.length) {
    throw new Error(
      `estas larguras não produziram foto confiável: ${ruins.join(', ')}.\n` +
      'Não use as imagens delas para julgar layout — elas não provam nada.',
    );
  }
  if (rota) {
    const veredito = mesmaTelaEmTodas(titulos);
    if (!veredito.igual) {
      throw new Error(
        'as cinco fotos NÃO são da mesma tela — a comparação não vale.\n' +
        `o que apareceu: ${veredito.vistos.join(' | ')}`,
      );
    }
  }
  dizer(`${Object.keys(TELAS).length} larguras fotografadas em .shots/${nome}--*.png`);
}

function derrubar() {
  try {
    adb('emu', 'kill');
    dizer('derrubado');
  } catch {
    dizer('nenhum emulador de pé');
  }
}

/**
 * O APK que RODA SOZINHO neste emulador — e é `release`, não `debug`.
 *
 * Duas coisas que custaram uma rodada cada:
 *
 * **`assembleDebug` não empacota o JavaScript.** O APK instala, abre, desenha o
 * splash e para em cinco quadros, e o `logcat` diz por quê: *"Make sure you're
 * running Metro"*. Sem `index.android.bundle` dentro, o aplicativo espera um
 * servidor que não existe aqui — e uma foto do splash não prova tela nenhuma.
 * O `release` empacota, e assina com a keystore de depuração
 * (`android/app/build.gradle:115`), então ele roda sem nada por trás.
 *
 * **Uma arquitetura em vez de quatro.** O `gradle.properties` pede as quatro, que é
 * o certo para a loja e desperdício aqui: o emulador é x86_64. As outras três
 * enchem o disco de objeto nativo que ele nunca vai executar — 8 GB medidos, e foi
 * o que derrubou duas compilações com o `cmake` saindo 1 por falta de espaço.
 */
function compilar() {
  dizer('compilando o APK de entrega (x86_64 apenas) — release, porque debug não traz o bundle');
  execFileSync('./gradlew', ['assembleRelease', '-PreactNativeArchitectures=x86_64'], {
    cwd: 'android',
    stdio: 'inherit',
    env: { ...process.env, ANDROID_HOME: SDK },
  });
  const apk = 'android/app/build/outputs/apk/release/app-release.apk';
  if (!existsSync(apk)) throw new Error(`gradle saiu 0 e o APK não está em ${apk}`);
  dizer(`${apk} — ${(statSync(apk).size / 1024 / 1024).toFixed(1)} MB`);
  return apk;
}

const verbo = process.argv[2];
const acoes = {
  subir,
  compilar,
  instalar: () => instalar(process.argv[3]?.startsWith('--') ? null : process.argv[3]),
  foto: () => foto(process.argv[3], process.argv[4]),
  fotos: () => fotos(process.argv[3], process.argv[4]),
  abrir: () => abrir(process.argv[3]),
  tela: () => tela(process.argv[3]),
  derrubar,
  // A régua descartável também passa por um caso verdadeiro e um falso — este
  // projeto já teve duas medidas de uma vez erradas por não fazer isso.
  autoteste: () => {
    const casos = [
      [['Receitas', 'Receitas', 'Receitas'], true],
      [['Receitas', 'Início', 'Receitas'], false],
      [['Receitas'], true],
      [[], true],
    ];
    let falhou = 0;
    for (const [entrada, esperado] of casos) {
      const { igual } = mesmaTelaEmTodas(entrada);
      const ok = igual === esperado;
      if (!ok) falhou += 1;
      console.log(`${ok ? 'ok  ' : 'FALHA'} mesmaTelaEmTodas(${JSON.stringify(entrada)}) = ${igual}`);
    }
    if (falhou) process.exit(1);
  },
};

if (!acoes[verbo]) {
  console.error(
    'verbos: subir | compilar | instalar [apk] | abrir <rota> | foto <nome> [rota] |\n' +
    '        fotos <nome> [rota] | tela <medida> | derrubar\n' +
    `medidas: ${Object.keys(TELAS).join(' | ')} | original`,
  );
  process.exit(1);
}
await acoes[verbo]();
