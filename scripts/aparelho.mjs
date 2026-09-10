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
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
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
  //
  // **Quatro gigas e não três, e a razão honesta é "não custa" — 10 de setembro.**
  //
  // O que se sabe, medido: a instalação do APK de 29 MB deixou de funcionar no
  // meio do dia. O erro é `Failure calling service package: Broken pipe (32)` ou
  // `Can't find service: package`, e o `system_server` some junto — o serviço
  // respondia seis checagens seguidas antes da tentativa e nenhuma depois.
  //
  // O que se sabe que NÃO é, cada um derrubado por medida e não por opinião:
  //
  //   instantâneo degradado  -> boot com `-no-snapshot-load` falha igual
  //   memória do aparelho    -> subiu para 4096 e falha igual
  //   disco do hospedeiro    -> `dd` de 300 MB dentro do aparelho escreve liso
  //   APK corrompido         -> `unzip -t` sem erro, assinatura no lugar
  //
  // E o que o log mostra e explica o resto: `StartPackageManagerService took to
  // complete: 80126ms`. O emulador não está quebrado, está GLACIAL — oitenta
  // segundos para o serviço de pacotes subir —, e todo caminho de instalação
  // estoura antes disso.
  //
  // Então os 4096 ficam porque a máquina tem quinze gigas de MEMÓRIA e não custa
  // nada, **não porque foi provado que resolvem** — não foram.
  //
  // **E a linha do disco acima estava medindo a coisa errada — corrigido à tarde.**
  // "`dd` de 300 MB dentro do aparelho escreve liso" responde se o convidado grava;
  // não responde o que o emulador PEDE, que é 7,37 GB para criar a partição de dados
  // do zero. Com 7,4 GB livres no hospedeiro, um AVD novo morria antes de bootar
  // (`FATAL | Not enough space to create userdata partition`) — então "AVD novo
  // falha igual" foi escrito sobre uma partida que não aconteceu. Liberando 3,5 GB
  // de cache derivado o erro MUDOU de `Broken pipe` para o rastro inteiro do NPE
  // acima, que foi o que finalmente nomeou a causa.
  const filho = spawn(
    EMU,
    ['-avd', AVD, '-no-window', '-no-audio', '-no-boot-anim',
     '-accel', 'off', '-gpu', 'swiftshader_indirect', '-memory', '4096', '-cores', '3',
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
      /**
       * **`sys.boot_completed` MENTE depois de restaurar instantâneo — 10 de
       * setembro, e custou três instalações quebradas.**
       *
       * A propriedade faz parte do estado salvo: ela volta como `1` no instante
       * em que o instantâneo é carregado, enquanto o Zygote ainda está
       * pré-carregando recursos e o `system_server` ainda não registrou serviço
       * nenhum. Este laço dizia "de pé em 497s" e o `adb install` seguinte
       * respondia `cmd: Can't find service: package` — três vezes, com o
       * diagnóstico apontando para o lugar errado a cada uma.
       *
       * O sinal honesto é o serviço RESPONDER. `package` é quem instala e
       * `window` é quem desenha; medido aqui, `package` aparece primeiro e
       * `window` alguns segundos depois, com o mesmo PID de `system_server` —
       * ou seja, não é queda em laço, é registro que se arrasta num emulador
       * sem KVM.
       *
       * **E os dois serviços NÃO bastam — 10 de setembro, à tarde.** Numa partida
       * fria com os dados apagados, `package` e `window` responderam `found` e o
       * `adb install` seguinte devolveu isto:
       *
       * ```
       * NullPointerException: ... PackageManagerInternal.freeStorage(...) on a null
       *   at com.android.server.StorageManagerService.allocateBytes(...:3901)
       * ```
       *
       * O `StorageManagerService` só pega o `PackageManagerInternal` na fase
       * BOOT_COMPLETED do `system_server`, e ela chega **minutos** depois dos dois
       * serviços registrarem — aqui foram doze minutos, com o `dexopt` do sistema
       * inteiro no meio (`UpdatePackagesIfNeeded took to complete: 82284ms`).
       * Instalar nessa janela não é cedo demais por pouco: é instalar num sistema
       * que ainda não terminou de nascer.
       *
       * Então a condição é a **conjunção das três**, e a cicatriz de cima continua
       * valendo inteira: `sys.boot_completed` sozinho mente depois de restaurar
       * instantâneo, mas num instantâneo restaurado os três são verdadeiros juntos
       * — o estado salvo É um estado pronto. A propriedade só atrasa quem sobe a
       * frio, que é exatamente quem precisa esperar.
       */
      const respondendo = (nome) => {
        const dito = adb('shell', 'service', 'check', nome);
        return dito.includes('found') && !dito.includes('not found');
      };
      const bootou = () => adb('shell', 'getprop', 'sys.boot_completed') === '1';
      if (respondendo('package') && respondendo('window') && bootou()) {
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

async function instalar(apk) {
  const caminho = apk ?? APKS.find((c) => existsSync(c)) ?? APKS[0];
  if (!existsSync(caminho)) {
    throw new Error(
      `não achei ${caminho} — compile antes:\n` +
      '  node scripts/aparelho.mjs compilar',
    );
  }
  const inicio = Date.now();
  dizer(`instalando ${caminho}`);
  /**
   * ESPERA o aparelho assentar antes de instalar — e o empurrão é a sonda.
   *
   * **A instalação não morre pelo MÉTODO, morre por CARGA — e eu afirmei o contrário
   * antes de medir direito, em 10 de setembro.** A história inteira, porque ela é a
   * cicatriz mais cara deste arquivo:
   *
   * A instalação parou de funcionar no meio do dia com `Failure calling service
   * package: Broken pipe (32)` e `Can't find service: package`. O rastro real está no
   * log do convidado: `watchdog: Blocked in handler on foreground thread (android.fg)`
   * e, sessenta segundos depois, `DeadSystemException: The system died`. O `system_server`
   * desta imagem queima um núcleo inteiro com o aparelho PARADO (medido: 106%), então a
   * escrita da sessão de instalação não cabe na janela do Watchdog quando há mais
   * qualquer coisa acontecendo.
   *
   * Eu troquei `adb install` por `adb push` + `pm install`, deu `Success`, e escrevi aqui
   * que transmitido morre e empurrado vive. **Estava errado**: eu tinha mudado duas
   * variáveis — o método E o tempo de sossego do aparelho — e creditei a errada. Rodando
   * as duas com o aparelho assentado, as DUAS respondem `Success`; rodando o empurrado com
   * o aparelho ocupado, ele morre igual.
   *
   * O que ficou, então, é a medida que separa os casos, e ela vem de graça: **a velocidade
   * do próprio empurrão**. Três pontos medidos — 0,8 MB/s falhou, 3,6 MB/s passou, 23 MB/s
   * passou. O piso abaixo é calibrado nesses três, não é lei: é o melhor palpite honesto,
   * e ele fica escrito para quem tiver um quarto ponto poder corrigi-lo.
   *
   * `adb push` é escrita de arquivo e não passa pelo serviço de pacotes, então ele mede
   * sem arriscar nada — que é a única razão de o empurrão ter ficado.
   */
  const noAparelho = '/data/local/tmp/norva-instalar.apk';
  const megas = statSync(caminho).size / 1024 / 1024;
  /** MB/s abaixo dos quais o aparelho não tem folga para instalar. Ver o docblock. */
  const PISO = 2;
  let taxa = 0;
  for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
    const antes = Date.now();
    adb('push', caminho, noAparelho);
    taxa = megas / ((Date.now() - antes) / 1000);
    if (taxa >= PISO) break;
    dizer(`o aparelho está a ${taxa.toFixed(1)} MB/s — abaixo do piso de ${PISO}. Esperando assentar (${tentativa}/6)`);
    await dormir(60_000);
  }
  if (taxa < PISO) {
    throw new Error(
      `o aparelho não assentou: ${taxa.toFixed(1)} MB/s depois de seis minutos. Instalar ` +
      'assim mata o `system_server` no Watchdog, e o erro que chega é `Broken pipe`, que ' +
      'não diz nada sobre a causa. Espere ele sossegar em vez de repetir a tentativa.',
    );
  }
  dizer(`aparelho a ${taxa.toFixed(1)} MB/s — instalando`);
  const dito = adb('shell', 'pm', 'install', '-r', noAparelho);
  console.log(dito);
  // `pm install` SAI ZERO dizendo `Failure` — o veredito é a palavra, não o código.
  if (!/Success/.test(dito)) throw new Error(`a instalação não disse Success:\n${dito}`);
  adb('shell', 'rm', '-f', noAparelho);
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
/**
 * O quadro que o aparelho está mostrando agora, cru.
 *
 * Uma captura só, devolvida inteira, para quem quiser gravá-la E medi-la sem
 * tirar uma segunda — que é o defeito que este arquivo já pagou uma vez.
 */
function quadroCru() {
  const cru = adbBin('exec-out', 'screencap');
  const largura = cru.readUInt32LE(0);
  const altura = cru.readUInt32LE(4);
  if (!largura || !altura) return null;
  // O cabeçalho tem 12 bytes (largura, altura, formato) e ganhou um quarto campo
  // com o espaço de cor no Android 10. Qual dos dois é a conta que fecha.
  const inicio = cru.length - largura * altura * 4 === 16 ? 16 : 12;
  return cru.length - inicio === largura * altura * 4 ? { cru, largura, altura, inicio } : null;
}

/**
 * O quadro cru virado PNG — para a foto e a medida serem a MESMA captura.
 *
 * Antes eram duas: `screencap -p` gravava o arquivo e a régua tirava um segundo
 * quadro, segundos depois. Elas discordaram na primeira vez em que importou — o
 * PNG saiu com a tela de abertura e a medida veio da capa que já tinha aparecido,
 * e eu reportei `tinta 15,35:1` para uma imagem que não tinha aquela tinta.
 * Número que não descreve a imagem ao lado é pior que número nenhum: ele passa a
 * prova sem prová-la.
 *
 * Escrever PNG à mão parece exagero e é o contrário: são três blocos e um CRC, sem
 * dependência nova, e resolve a raiz em vez de tentar sincronizar duas capturas.
 */
function pngDoQuadro(cru, largura, altura, inicio) {
  const crcTabela = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTabela[n] = c;
  }
  const crc = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTabela[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const soma = Buffer.alloc(4);
    soma.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([tamanho, t, dados, soma]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  // Cada linha leva um byte de filtro na frente; zero é "sem filtro", que é o
  // suficiente — quem comprime é o deflate logo abaixo.
  const linhas = Buffer.alloc(altura * (1 + largura * 4));
  for (let y = 0; y < altura; y += 1) {
    const destino = y * (1 + largura * 4);
    linhas[destino] = 0;
    cru.copy(linhas, destino + 1, inicio + y * largura * 4, inicio + (y + 1) * largura * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 6 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Metade da página tem tinta de verdade? — lido do framebuffer CRU, sem
 * decodificar PNG e sem dependência nova.
 *
 * Isto existe por causa de 9 de setembro. A capa do primeiro dia foi fotografada
 * com a página inteira a 22% de opacidade — contraste de 1,56:1 num piso de
 * 4,5:1 — e a foto passou por `pareceViva` sem um pio, porque ela só olha
 * variedade de bytes: uma página desbotada tem tantas cores quanto uma legível.
 *
 * **A primeira versão desta régua não servia, e ela foi provada errada antes de
 * entrar.** Ela pegava o pixel mais escuro do miolo, e o mais escuro da tela
 * velada era a BARRA DE ABAS, que o aplicativo desenha com tinta cheia — a mesma
 * armadilha em que a minha primeira medição à mão caiu. A foto velada saía
 * 7,79:1 e passava.
 *
 * O que serve é a **mediana das faixas**: a tela é cortada em fitas de cem
 * pixels, cada fita rende o contraste da sua tinta mais escura contra o papel
 * mais claro da tela, e o veredito é a fita do meio. Uma barra de abas com tinta
 * cheia é uma fita; um véu são vinte. E o espaço em branco legítimo — uma lista
 * curta com meia tela vazia — continua passando, porque a metade de cima tem
 * tinta.
 *
 * O limiar é o piso de texto que a casa já tinha, não um número escolhido para
 * caber nos exemplos. Medido em doze fotos: as duas veladas em 1,55, e as dez
 * sãs de 5,91 (uma lista curta) a 15,35.
 *
 * O que ela NÃO é: uma auditoria de acessibilidade. Ela responde uma pergunta só
 * — *tem tinta de verdade nesta página?* Quem mede o contraste de um texto
 * específico é `src/theme/contrast.test.ts`, sobre as cores da paleta.
 */
function tintaDaPagina({ cru, largura, altura, inicio }) {
  const luz = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminancia = (x, y) => {
    const i = inicio + (y * largura + x) * 4;
    return 0.2126 * luz(cru[i]) + 0.7152 * luz(cru[i + 1]) + 0.0722 * luz(cru[i + 2]);
  };

  // Um décimo em cima e um décimo embaixo ficam de fora: as barras do sistema
  // (relógio, bateria, botões de navegação) são desenhadas pelo Android com
  // tinta cheia e não dizem nada sobre a página.
  const topo = Math.floor(altura * 0.05);
  const fim = Math.floor(altura * 0.95);
  let papel = 0;
  for (let y = topo; y < fim; y += 4) {
    for (let x = 0; x < largura; x += 4) papel = Math.max(papel, luminancia(x, y));
  }

  const fitas = [];
  for (let alto = topo; alto < fim; alto += 100) {
    const baixo = Math.min(alto + 100, fim);
    let tinta = 1;
    for (let y = alto; y < baixo; y += 2) {
      for (let x = 0; x < largura; x += 2) tinta = Math.min(tinta, luminancia(x, y));
    }
    fitas.push((papel + 0.05) / (tinta + 0.05));
  }
  if (fitas.length === 0) return null;
  const comTinta = fitas.filter((c) => c >= PISO_DE_TEXTO).length;
  fitas.sort((a, b) => a - b);
  const meio = Math.floor(fitas.length / 2);
  const mediana = fitas.length % 2 ? fitas[meio] : (fitas[meio - 1] + fitas[meio]) / 2;
  return { mediana, comTinta, fitas: fitas.length };
}

/** O piso de texto da casa, o mesmo de `src/theme/contrast.test.ts`. */
const PISO_DE_TEXTO = 4.5;

async function foto(nome, rota) {
  if (!nome) throw new Error('uso: node scripts/aparelho.mjs foto <nome> [rota]');
  if (rota) {
    await abrir(rota, { reiniciar: true, esperar: false });
    await esperarTelaParar();
    await esperarPaginaComTinta();
  }
  mkdirSync(SAIDA, { recursive: true });
  const destino = join(SAIDA, `${nome}.png`);

  // UMA captura, crua, que vira o arquivo E a medida.
  //
  // Eram duas — `screencap -p` para o arquivo e um segundo quadro para a régua —,
  // e elas discordaram na primeira vez em que importou: o PNG saiu com a tela de
  // abertura e a medida veio da capa que já tinha aparecido no meio do caminho.
  // Duas capturas nunca descrevem a mesma tela; esta descreve.
  //
  // Se a composição estiver do lado do host, o quadro vem morto — e aí a segunda
  // tentativa, pelo console do emulador, pega onde ele realmente está.
  let veredito;
  let tinta = null;
  try {
    const quadro = quadroCru();
    if (quadro) {
      writeFileSync(destino, pngDoQuadro(quadro.cru, quadro.largura, quadro.altura, quadro.inicio));
      tinta = tintaDaPagina(quadro);
    } else {
      writeFileSync(destino, adbBin('exec-out', 'screencap', '-p'));
    }
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
      // O arquivo passou a ser OUTRO quadro, tirado pelo console. A medida que
      // eu tenho descreve o quadro do convidado, que foi descartado — então ela
      // deixa de existir em vez de virar legenda de uma imagem que não é a dela.
      tinta = null;
    }
    rmSync(tmp, { recursive: true, force: true });
  }

  const largura = larguraEmDp();
  const emQue = largura
    ? ` — ${largura.dp} dp (${largura.px} px a ${largura.dpi} dpi)${largura.dp >= 600 ? ' ⚠ TABLET' : ''}`
    : '';
  // A tinta E a extensão dela, porque o número sozinho não diz QUE tela é esta.
  //
  // Cicatriz da mesma hora: fotografei a capa para provar um conserto, li
  // `tinta 15,35:1`, e era a TELA DE ABERTURA — a marca do aplicativo, tinta cheia
  // sobre papel, que satisfaz a régua com duas fitas de vinte e duas. A mediana
  // responde "tem tinta"; ela nunca respondeu "é a página certa", e eu li como se
  // respondesse.
  //
  // O sinal que separa as duas já estava calculado e jogado fora: quantas fitas têm
  // tinta. A abertura tem duas; qualquer tela do aplicativo tem quinze ou mais.
  // Sai de graça, não depende de janela ociosa — e o `uiautomator`, que responderia
  // a mesma pergunta melhor, leva até dois minutos nesta tela e às vezes devolve
  // `null root node`, porque a animação de ambiente nunca deixa a janela parar.
  const emTinta =
    tinta === null
      ? ', SEM medida (o quadro veio do console do emulador)'
      : `, tinta ${tinta.mediana.toFixed(2)}:1 em ${tinta.comTinta}/${tinta.fitas} fitas`;
  console.log(
    `${destino} — ${(veredito.bytes / 1024).toFixed(0)} KB, variação ${veredito.variacao}${emTinta}${emQue}`,
  );

  if (tinta !== null && tinta.mediana < PISO_DE_TEXTO) {
    dizer(
      `ATENÇÃO: metade da página está abaixo de ${tinta.mediana.toFixed(2)}:1, e o piso de texto ` +
        `da casa é ${PISO_DE_TEXTO}:1.\n` +
        'A página inteira pode estar sob um véu — foi assim que a capa do primeiro dia\n' +
        'passou minutos a 22% de opacidade com a foto saindo bonita no arquivo.',
    );
  }
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
/**
 * Abre uma rota por ligação profunda — e ESPERA a tela mudar, medindo quanto levou.
 *
 * **Ele voltava na hora, e isso fabricou um item de defeito que sobreviveu a duas
 * conferências — 10 de setembro.** Quem chamasse tinha de adivinhar o tempo de
 * espera, e a adivinhação era 6 ou 7 segundos. Neste emulador sem KVM uma navegação
 * leva de dez a vinte, e as telas pesadas passam disso: Ajustes roda meia dúzia de
 * `COUNT(*)` antes de desenhar.
 *
 * O resultado é a armadilha mais convincente que este projeto já produziu, porque
 * ela não parece erro de medida — parece o app ignorando o intent. Lendo a árvore
 * cedo demais você recebe a tela ANTERIOR, e `norva://settings` "não navegava"
 * enquanto `norva://recipes` "navegava": a diferença não era a rota, era o tempo de
 * desenho de cada uma. A leitura chegava a andar uma tela atrás por várias rodadas
 * seguidas, o que confirma o diagnóstico errado a cada repetição.
 *
 * Então a espera deixa de ser adivinhada: o comando lê o texto da tela ANTES, dispara
 * o intent, e volta a ler até o texto mudar — dizendo em quantos segundos mudou, que
 * é um número que ninguém tinha. Se não mudar dentro do teto, ele FALHA em vez de
 * seguir calado, porque "a tela não mudou" é exatamente a afirmação que se quer
 * provar e ela não pode passar por omissão.
 */
async function abrir(rota, { reiniciar = false, esperar = true } = {}) {
  if (!rota) return;
  const limpa = String(rota).replace(/^\/+/, '');
  const alvo = `${ESQUEMA}://${limpa}`;
  const antes = esperar ? oQueDizATela().join('\n') : null;
  // `am start` SAI ZERO quando o intent não resolve — ele imprime `Error:` e pronto.
  // É o mesmo modo de falha do `screencap` devolvendo retângulo preto: o comando
  // passa e a prova não existe. Então quem decide aqui é a saída, não o código.
  const saida = adb('shell', 'am', 'start', ...(reiniciar ? ['-S'] : []),
                    '-a', 'android.intent.action.VIEW', '-d', alvo, PACOTE);
  if (/Error:/.test(saida)) {
    throw new Error(`${alvo} não abriu:\n${saida}`);
  }
  if (!esperar) {
    dizer(`abrindo ${alvo}`);
    return;
  }
  const inicio = Date.now();
  const TETO = 150_000;
  while (Date.now() - inicio < TETO) {
    await dormir(2000);
    const agora = oQueDizATela().join('\n');
    // Lista vazia é o `uiautomator` não tendo lido, não é tela nova. Tratá-la como
    // mudança faria a espera terminar exatamente quando o instrumento falhou.
    if (agora && agora !== antes) {
      // **"em ATÉ", e não "em".** Cada volta do laço custa a leitura da árvore, que
      // neste emulador leva dezenas de segundos — então o número inclui o
      // instrumento. Dizer "a tela mudou em 42s" seria vender a granularidade da
      // sonda como tempo do app, que é o mesmo defeito que trouxe a gente aqui.
      dizer(`abrindo ${alvo} — a tela mudou em até ${Math.round((Date.now() - inicio) / 1000)}s`);
      return;
    }
  }
  throw new Error(
    `${alvo}: a tela não mudou em ${TETO / 1000}s. Ou a rota não navega, ou este ` +
    'aparelho está mais lento que isso — e as duas coisas precisam ser ditas, não supostas.',
  );
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
/**
 * Espera a PÁGINA aparecer — não o app abrir, não um quadro sair.
 *
 * `abrir` reinicia o aplicativo (`am start -S`), e neste emulador por software a
 * partida leva perto de um minuto. Nesse minuto a tela mostra a marca sobre papel:
 * um quadro legítimo, parado, com tinta cheia. Toda medida que eu tinha dava ela
 * por boa — o contador de quadros sobe, a mediana de contraste passa —, e foi assim
 * que duas fotos seguidas saíram da tela de abertura com o comando dizendo
 * `tinta 15,35:1` e saindo zero.
 *
 * O que separa as duas é a EXTENSÃO da tinta, não a força dela: a abertura tem três
 * fitas de vinte e duas, e a tela mais vazia do aplicativo tem treze. Abaixo de
 * cinco não é página, é marca.
 *
 * Ela não substitui `esperarTelaParar`: aquela espera parar de mudar, esta espera
 * ter conteúdo. As duas em sequência é o que faz a foto valer.
 */
async function esperarPaginaComTinta(minutos = 3) {
  const limite = Date.now() + minutos * 60_000;
  while (Date.now() < limite) {
    const quadro = quadroCru();
    const tinta = quadro && tintaDaPagina(quadro);
    if (tinta && tinta.comTinta > 4) return true;
    await dormir(4000);
  }
  dizer(`ATENÇÃO: em ${minutos} min a tela nunca passou de marca para página.`);
  return false;
}

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
      await abrir(rota, { reiniciar: true, esperar: false });
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
function compilar(arquitetura = 'x86_64') {
  /**
   * **E a arquitetura é ARGUMENTO, porque o padrão daqui não serve para o dono.**
   *
   * Em 10 de setembro eu mandei para ele o APK compilado por este verbo dizendo que
   * era para testar no tablet. Ele carrega `lib/x86_64/` e mais nada — não instala
   * num aparelho ARM, que é todo tablet Android. O padrão está certo para o
   * emulador e errado para qualquer outra pessoa, e um padrão certo que ninguém
   * pode mudar é uma armadilha com uma cara boa.
   *
   *   node scripts/aparelho.mjs compilar              → emulador (x86_64)
   *   node scripts/aparelho.mjs compilar arm64-v8a    → tablet e celular de verdade
   */
  dizer(`compilando o APK de entrega (${arquitetura}) — release, porque debug não traz o bundle`);
  execFileSync('./gradlew', ['assembleRelease', `-PreactNativeArchitectures=${arquitetura}`], {
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
  compilar: () => compilar(process.argv[3]),
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
