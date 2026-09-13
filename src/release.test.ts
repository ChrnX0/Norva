import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * O que sai no instalador, conferido aqui em vez de na memória de quem publica.
 *
 * A configuração de release é o único lugar do repositório onde um padrão do
 * Android decide sobre o livro-razão de uma fábrica, e o padrão dele não foi
 * escolhido pensando nisto. `npm test` roda em toda máquina e em todo commit; o
 * fluxo de build roda quando alguém publica. Então a intenção mora aqui, e a
 * prova do artefato mora lá — o `build-apk.yml` confere o manifesto GERADO, que
 * é o que instala no celular.
 */
const APP = JSON.parse(readFileSync('app.json', 'utf8')) as {
  expo: {
    version: string;
    android: { allowBackup?: boolean; versionCode?: number; blockedPermissions?: string[] };
    plugins: (string | [string, Record<string, unknown>])[];
  };
};

/** O ajuste de um plugin do `app.json`, ou `undefined` se ele não estiver lá. */
function ajusteDoPlugin(nome: string): Record<string, unknown> | undefined {
  const achado = APP.expo.plugins.find((p) => Array.isArray(p) && p[0] === nome);
  return Array.isArray(achado) ? achado[1] : undefined;
}

test('the ledger does not leave the phone through the Android backup', () => {
  // `allowBackup` é `true` por padrão no Android, e nesse estado o sistema copia
  // o banco do aplicativo para a conta Google do aparelho. O celular da fábrica é
  // compartilhado por decisão escrita do dono, e costuma estar logado na conta de
  // alguém: o livro-razão inteiro de uma empresa — custo, margem, cliente — sai
  // dali para a nuvem pessoal de um operador, sem ninguém pedir nada.
  //
  // Nada se perde desligando: o que o aplicativo grava vai para o servidor pela
  // fila, que é o backup de verdade, e é o único que a empresa controla.
  assert.equal(
    APP.expo.android.allowBackup,
    false,
    'o backup do Android está ligado: o banco do aplicativo vai para a conta Google de quem estiver no aparelho',
  );
});

/**
 * A última versão com APK publicado, escrita à mão e de propósito.
 *
 * Ela sobe quando um release sai, não quando o `app.json` muda: é o número que
 * está NO APARELHO de alguém, e o repositório não tem como descobri-lo sozinho.
 */
const ULTIMO_PUBLICADO = '0.11.0';

test('the version can always produce a build number that grows', () => {
  // O `versionCode` sai da versão (`build-apk.yml`), e a fórmula dá a cada parte
  // uma faixa própria: `a * 1.000.000 + b * 10.000 + c * 100`. Ela só é monótona
  // enquanto `b` e `c` cabem na faixa — 0.100.0 e 1.0.0 dariam o mesmo número, e
  // um APK com `versionCode` repetido não é atualização para o Android: é outra
  // build com o mesmo nome, e o aparelho não sabe qual é a nova.
  //
  // A fórmula anterior (`a * 100.000 + b * 10.000 + c`) já colidia dentro do
  // alcance de hoje: **0.10.0 e 1.0.0 davam 100000 os dois**, e o 0.10.0 está
  // publicado. Esta guarda existe para a próxima versão não repetir isso em
  // silêncio.
  const [a, b, c] = APP.expo.version.split('.').map(Number);
  assert.ok([a, b, c].every(Number.isInteger), `versão ilegível: ${APP.expo.version}`);
  assert.ok(b < 100, `menor ${b} não cabe: a faixa do menor vai até 99`);
  assert.ok(c < 100, `correção ${c} não cabe: a faixa da correção vai até 99`);

  const codigo = (v: string) => {
    const [x, y, z] = v.split('.').map(Number);
    return x * 1_000_000 + y * 10_000 + z * 100;
  };

  // O que já foi publicado não pode mudar de número: `0.10.0` é o APK que está
  // no celular do dono, e ele vale 100000. A fórmula nova concorda com a antiga
  // em toda versão 0.x.0, e é isso que esta linha guarda.
  assert.equal(codigo('0.10.0'), 100_000);

  /**
   * E a versão de agora tem que ser MAIOR que a última publicada.
   *
   * Esta linha era `assert.equal(codigo(versão atual), 100_000)` — ela fixava o
   * número da versão que estava no `app.json` no dia em que foi escrita, então
   * toda subida de versão a deixava vermelha e a correção óbvia era trocar o
   * número esperado. Um guarda que se atualiza junto com o que ele guarda não
   * guarda nada: a pergunta certa é se o número CRESCE, porque `versionCode`
   * repetido não é atualização para o Android — é outra build com o mesmo nome,
   * e o aparelho não sabe qual é a nova.
   */
  assert.ok(
    codigo(APP.expo.version) > codigo(ULTIMO_PUBLICADO),
    `${APP.expo.version} não passa de ${ULTIMO_PUBLICADO}: o Android não veria isso como atualização`,
  );
});

/**
 * O que o `prebuild` apaga toda vez, e por isso não pode morar em `android/`.
 *
 * Em 8 de setembro o APK saiu com 57,4 MB e não coube no canal de entrega, que
 * aceita 30. Eu culpei a câmera — o `expo-camera` de fato empacota os modelos do
 * ML Kit — e a conta fechava com o número errado: a câmera custou ~5,5 MB, e os
 * outros ~15 eram `expo.useLegacyPackaging`, que eu tinha ajustado à mão em
 * `android/gradle.properties` dois dias antes. `android/` é SAÍDA do `expo
 * prebuild`, ignorada pelo git: o ajuste foi reescrito pelo padrão e nada acusou.
 *
 * Sem compressão, cada biblioteca nativa ocupa no arquivo o tamanho que ocupa na
 * memória — `libreactnative.so` sozinha vai de 2,2 MB para 6,7 MB. O aparelho
 * ganha um pouco na instalação; quem recebe o APK paga o triplo. Numa fábrica que
 * instala o aplicativo por link, quem paga é o dono.
 *
 * **E o encolhimento de RECURSOS está fora, medido — depois de eu errar duas vezes
 * a mesma medida.** Ele paga 0,30 MB de 28: tira 94 arquivos de `res/` e 0,26 MB da
 * tabela de recursos. A minificação de CÓDIGO, no mesmo build, paga 12,6 MB. Um por
 * cento não compra o risco: o que ele remove são recursos que o compilador não viu
 * ninguém referenciar, recurso buscado por nome em runtime é invisível para ele, e o
 * modo de falha é o pior desta casa — some calado, compila, instala, quebra numa tela.
 *
 * **As duas medidas erradas, porque a lição é a régua e não o número.** A primeira
 * comparou o APK com R8 e encolhimento contra o APK com nenhum dos dois: dois builds
 * diferindo em DUAS coisas, e eu creditei o delta a uma. A segunda foi pior — eu
 * "corrigi" a primeira com um `grep` por *"Removed unused resource"* no `resources.txt`
 * do shrinker, ele voltou zero, e eu li zero como *"não removeu nada"*. Aquele arquivo
 * não é registro de remoção; é o modelo de uso. **Padrão que não casa nunca não prova
 * ausência — prova que ninguém conferiu o padrão**, e é a mesma família do
 * `assert.ok(x > 0)`.
 *
 * O que decidiu foi a comparação que isola UMA variável: com R8 e sem encolher, `res/`
 * tem os mesmos 1005 arquivos e a mesma tabela de 1,70 MB do build sem R8 nenhum. O R8
 * não toca em recurso. Quem tira é o encolhimento, e tirou 94.
 */
test('the build settings that survive a prebuild live in app.json', () => {
  const build = ajusteDoPlugin('expo-build-properties');
  assert.ok(
    build,
    'o `expo-build-properties` saiu do app.json: todo ajuste de compilação volta ao padrão no próximo prebuild',
  );
  const android = build.android as Record<string, unknown> | undefined;
  assert.equal(
    android?.useLegacyPackaging,
    true,
    'as bibliotecas nativas voltaram a ser guardadas sem compressão: o APK enviado triplica de tamanho',
  );
  assert.equal(
    android?.enableMinifyInReleaseBuilds,
    true,
    'o R8 está desligado: o dex sai inteiro, com todas as classes que ninguém chama',
  );
});

test('the plugin reader does not find what is not there', () => {
  // A metade negativa, que é o que separa leitor de otimista: um plugin que só
  // aparece como string simples (`"expo-router"`) não tem ajuste, e um nome que
  // não existe também não. Se as duas devolvessem objeto, o teste de cima
  // passaria por qualquer motivo.
  assert.equal(ajusteDoPlugin('expo-router'), undefined);
  assert.equal(ajusteDoPlugin('plugin-que-nao-existe'), undefined);
});

/**
 * O canal da atualização, declarado no `app.json` porque este APK não vem do EAS.
 *
 * **Cicatriz de 8 de setembro, e ela seria muda.** O manifesto gerado já tinha
 * `EXPO_UPDATE_URL` e `EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS`: o aparelho pergunta
 * por atualização em toda abertura. O que faltava era o CANAL, que o `eas build`
 * injeta a partir do `eas.json` e que um `gradlew assembleRelease` daqui não
 * injeta — decisão do dono é compilar neste container e não gastar crédito de
 * runner. Sem canal o servidor não sabe qual ramo mandar, responde que não há
 * nada, e o aplicativo fica para sempre na versão instalada **sem nenhum erro**.
 *
 * `requestHeaders` é o jeito documentado de dizer o canal fora do EAS. Vale para
 * qualquer binário, inclusive um do EAS — ali o cabeçalho do build ganha, então
 * declarar aqui não atrapalha aquele caminho.
 */
test('the update channel is declared in the app config, not left to the build service', () => {
  const updates = (APP.expo as { updates?: { requestHeaders?: Record<string, unknown> } }).updates;
  assert.ok(updates, 'sem bloco de updates não há atualização nenhuma');
  assert.equal(
    updates.requestHeaders?.['expo-channel-name'],
    'preview',
    'o APK compilado aqui não recebe canal do EAS: sem este cabeçalho ele pergunta por ' +
      'atualização a cada abertura, ouve "não há", e nunca mais atualiza — calado',
  );
});

test('the channel guard bites a config that leans on the build service', () => {
  // Os dois casos, como dado e não como fé: a forma que temos passa, e as duas
  // formas que o EAS teria de completar reprovam.
  const morde = (updates: { requestHeaders?: Record<string, unknown> }) =>
    updates.requestHeaders?.['expo-channel-name'] !== 'preview';
  assert.ok(!morde({ requestHeaders: { 'expo-channel-name': 'preview' } }));
  assert.ok(morde({}), 'config sem cabeçalho nenhum tinha de reprovar');
  assert.ok(
    morde({ requestHeaders: { 'expo-runtime-version': '1' } }),
    'cabeçalho de outra coisa não é canal',
  );
});

/**
 * Quem pergunta por atualização é o aplicativo, uma vez — não o nativo por baixo dele.
 *
 * **Medido no aparelho em 10 de setembro:** 21 linhas de `checkError={message=Failed
 * to download remote update}` numa janela de log, com `lastCheckForUpdateTime`
 * andando 08:40:14 → 08:41:07 → 08:47:02 → 08:48:07. Cada tentativa carrega aperto
 * de mão TLS e rastro de pilha inteiro. No celular da fábrica isso é bateria e dado
 * de plano, e o canal `preview` não tem nada publicado — então toda pergunta falha.
 *
 * A causa é que a pergunta acontecia DUAS vezes por abertura. O `expo-updates`
 * nativo checa sozinho com `checkAutomatically: "ON_LOAD"`, e `rodadaAutomatica`
 * (`src/nuvem/aparelho.ts`) checa de novo no boot e a cada volta ao primeiro plano —
 * esta segunda por decisão escrita do dono, 8 de setembro, e é a que trata a falha
 * como `Tentativa` em vez de rastro no log.
 *
 * Então quem sai é a nativa, não a nossa: `ON_ERROR_RECOVERY` deixa o nativo checar
 * só depois de uma queda, e o comportamento visível continua o mesmo — a nossa baixa
 * a atualização e a próxima abertura aplica, que é o que o docblock de
 * `buscarAtualizacao` já promete.
 *
 * **O que este teste NÃO resolve, para a promessa não crescer sozinha:** o canal
 * continua vazio, e enquanto estiver, uma pergunta por abertura continua falhando.
 * Publicar ali é decisão do dono — está em `docs/roadmap.md`.
 */
/**
 * Os valores em que o NATIVO pergunta sozinho na abertura, e por que são dois.
 *
 * **Estava `notEqual('ON_LOAD')`, e a regra é outra — cicatriz de 11 de setembro.** A
 * afirmação é *"o nativo não pergunta por conta própria"*, e `checkAutomatically` tem quatro
 * valores (`ON_ERROR_RECOVERY | ON_LOAD | WIFI_ONLY | NEVER`). `WIFI_ONLY` também pergunta na
 * abertura — só que apenas no Wi-Fi, que é a condição NORMAL do celular da fábrica. Com ele
 * no `app.json` as duas perguntas por abertura voltavam inteiras e o teste ficava verde.
 *
 * Um `notEqual` contra um valor onde a regra é uma lista é a forma errada de escrever a
 * afirmação: ela proíbe um caso e libera os outros três sem dizer.
 */
const PERGUNTAM_SOZINHOS = ['ON_LOAD', 'WIFI_ONLY'];

test('the phone asks for an update once per opening, not twice', () => {
  const updates = (APP.expo as { updates?: { checkAutomatically?: string } }).updates;
  assert.ok(updates, 'sem bloco de updates não há atualização nenhuma');
  assert.ok(
    !PERGUNTAM_SOZINHOS.includes(updates.checkAutomatically ?? ''),
    `\`checkAutomatically\` está em "${updates.checkAutomatically}", e o nativo passa a ` +
      'checar por conta própria na abertura enquanto a rodada do aplicativo checa de novo: ' +
      'duas perguntas por abertura, as duas falhando enquanto o canal estiver vazio',
  );
});

test('the double-ask guard tells the native check from the ones that stay quiet', () => {
  const morde = (c?: string) => PERGUNTAM_SOZINHOS.includes(c ?? '');
  assert.ok(morde('ON_LOAD'), 'é exatamente a forma que estava no app.json');
  assert.ok(
    morde('WIFI_ONLY'),
    'e este é o que a régua antiga deixava passar: pergunta sozinho no Wi-Fi, que é onde ' +
      'o celular da fábrica vive',
  );
  assert.ok(!morde('ON_ERROR_RECOVERY'));
  assert.ok(!morde('NEVER'));
  assert.ok(!morde(undefined), 'sem a chave o padrão do EAS decide, e isso é outro item');
});

/**
 * O aparelho não bate numa porta que não tem ninguém atrás — decisão do dono, 10 de setembro.
 *
 * O canal `preview` não tem nada publicado. Enquanto for assim, cada pergunta por
 * atualização é um aperto de mão TLS e um download que falha, na bateria e no dado de
 * um celular de fábrica — e nenhuma delas pode dar certo. Medido no aparelho: 21 falhas
 * numa janela de log.
 *
 * `enabled: false` desliga a pergunta dos DOIS lados de uma vez: o `expo-updates` nativo
 * para de checar, e `Updates.isEnabled` fica falso, então `buscarAtualizacao`
 * (`src/nuvem/aparelho.ts`) devolve `false` na primeira linha sem tocar a rede. A decisão
 * do dono de 8 de setembro — *"backup, sincronia e atualização são automáticos"* — continua
 * de pé: o que mudou é que não há o que buscar, e buscar assim mesmo não é automatismo, é
 * ruído.
 *
 * **A URL e o canal FICAM declarados de propósito.** Religar é apagar esta linha, e não
 * redescobrir qual era o canal — que é a cicatriz de 8 de setembro logo acima: sem o
 * cabeçalho do canal o servidor responde "não há nada" para sempre, calado.
 *
 * E este teste é a fronteira escrita: no dia em que houver versão publicada, ele fica
 * vermelho e obriga quem religar a corrigir a razão aqui em vez de deixá-la envelhecer.
 */
test('the phone does not knock on a channel with nobody behind it', () => {
  const updates = (APP.expo as { updates?: { enabled?: boolean; url?: string } }).updates;
  assert.ok(updates, 'sem bloco de updates não há atualização nenhuma');
  assert.equal(
    updates.enabled,
    false,
    'enquanto o canal estiver vazio, perguntar é bateria e dado gastos numa resposta que ' +
      'não existe. Ligou de volta? Então publique antes, e corrija a razão escrita aqui.',
  );
  assert.ok(
    updates.url,
    'a URL fica declarada mesmo desligada: religar é apagar uma linha, não redescobrir o canal',
  );
});

/**
 * O APK compilado AQUI carrega o mesmo número do compilado pela CI.
 *
 * **O defeito, medido em 13 de setembro.** A fórmula do `versionCode` vivia só no
 * `build-apk.yml`: a CI a calculava e passava ao gradle. O caminho local —
 * `node scripts/aparelho.mjs compilar`, que é o que produziu os dois APKs que foram para o
 * tablet do dono — não passava nada, e o `app.json` não declarava `android.versionCode`. O
 * padrão do Expo nesse caso é **1**.
 *
 * Dois APKs com o mesmo `versionCode` não são atualização para o Android: são duas builds com
 * o mesmo nome, e o aparelho não tem como saber qual é a nova. Quem instalar o segundo por cima
 * do primeiro depende de sorte de assinatura, e quem olhar "versão" no aparelho vê a mesma
 * coisa nos dois.
 *
 * Com o número no `app.json`, os dois caminhos leem a MESMA fonte — e esta guarda é o que
 * impede a fonte de divergir da versão outra vez.
 */
test('o versionCode do app.json é o que a versão manda', () => {
  const codigo = (v: string) => {
    const [x, y, z] = v.split('.').map(Number);
    return x * 1_000_000 + y * 10_000 + z * 100;
  };
  assert.equal(
    APP.expo.android?.versionCode,
    codigo(APP.expo.version),
    'o `versionCode` do app.json tem de sair da versão pela mesma fórmula da CI. Sem ele ' +
      'declarado, o Expo usa 1 — e o APK compilado aqui deixa de ser atualização de nada',
  );
});

/**
 * A versão é UMA, e os dois manifestos do projeto dizem a mesma.
 *
 * `package.json` dizia `0.1.0` enquanto `app.json` dizia `0.12.0` — onze versões de distância.
 * Nenhuma tela lê o `package.json`, então o número errado não aparecia em lugar nenhum, e é
 * exatamente por isso que ele ficou: campo sem leitor não é conferido por ninguém. Ele aparece
 * no `npm pack`, no relatório de dependência e em toda ferramenta que lê o pacote antes de ler
 * o aplicativo.
 */
test('as duas declarações de versão do projeto dizem a mesma coisa', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  assert.equal(
    pkg.version,
    APP.expo.version,
    'package.json e app.json têm de dizer a mesma versão — eram 0.1.0 e 0.12.0',
  );
});

/**
 * A permissão que ninguém usa não é declarada.
 *
 * `SYSTEM_ALERT_WINDOW` — desenhar sobre outros aplicativos — entrava pelo manifesto de um
 * pacote e não tem um uso no código: nenhuma linha de `src/` ou `app/` a menciona. Numa listagem
 * de loja ela é a permissão que mais assusta quem lê, e o dono deste app vai vendê-lo para
 * outras fábricas.
 *
 * As outras cinco ficam e cada uma tem dono, medido: `CAMERA` lê a etiqueta do lote
 * (`app/scan.tsx`), `VIBRATE` é o háptico do botão (`expo-haptics` em `Button` e
 * `UnitStepper`), `INTERNET` é a sincronia, e as duas de armazenamento vêm do `expo-sharing`
 * que a cópia de segurança usa. Bloquear o que se usa seria pior que declarar o que não se usa.
 */
test('nenhuma permissão sem uso é declarada', () => {
  const bloqueadas = new Set(APP.expo.android?.blockedPermissions ?? []);

  /**
   * **O manifesto que importa é o MESCLADO, e eu medi o errado antes de medir o certo.**
   *
   * `android/app/src/main/AndroidManifest.xml` lista SEIS permissões, e eu relatei seis. O APK
   * declara **trinta e uma**: a mesclagem puxa tudo o que as bibliotecas pedem — contador no
   * ícone para oito marcas de lançador, biometria, partida do sistema, FCM, referência de
   * instalação da Play. O manifesto de origem é ENTRADA da mesclagem, não a resposta.
   *
   * A régua certa é `aapt dump badging` no artefato, e é o que `conferirAPK` usa.
   *
   * Cada bloqueio abaixo tem ausência MEDIDA, não suposta:
   */
  for (const semUso of [
    // Desenhar sobre outros aplicativos: nenhuma linha do projeto o faz, e é a permissão que
    // mais assusta quem lê uma listagem de loja.
    'android.permission.SYSTEM_ALERT_WINDOW',
    // Biometria: não existe `LocalAuthentication` no projeto.
    'android.permission.USE_BIOMETRIC',
    'android.permission.USE_FINGERPRINT',
    // Push: não há `google-services.json`, então FCM não está configurado. As notificações deste
    // app são locais e agendadas, e não passam por aqui.
    'com.google.android.c2dm.permission.RECEIVE',
    // O contador no ícone: `setBadgeCountAsync` não é chamado em lugar nenhum — "badge" aparece
    // no código como nome de estilo de um cartão. São dezessete permissões de marca de lançador.
    'android.permission.READ_APP_BADGE',
    'com.sec.android.provider.badge.permission.WRITE',
    'me.everything.badger.permission.BADGE_COUNT_READ',
  ]) {
    assert.ok(bloqueadas.has(semUso), `${semUso} não tem um uso no código e continua declarada`);
  }

  /**
   * E o caso FALSO, que é o que impede esta guarda de virar uma varredura cega.
   *
   * Bloquear por higiene o que o aplicativo USA quebra o que o dono mais pediu depois do
   * movimento: o aviso de validade. `scheduleNotificationAsync` agenda notificação local, e
   * agendamento precisa sobreviver ao reinício do aparelho (`RECEIVE_BOOT_COMPLETED`) e acordar
   * para disparar (`WAKE_LOCK`). Uma lista de bloqueio que crescesse "para ficar limpa" levaria
   * as duas, e o alerta que salva mercadoria sumiria sem nada reclamar.
   */
  for (const emUso of [
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.WAKE_LOCK',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.CAMERA',
    'android.permission.VIBRATE',
    'android.permission.INTERNET',
  ]) {
    assert.equal(
      bloqueadas.has(emUso),
      false,
      `${emUso} está em uso — bloqueá-la quebra o aplicativo em silêncio`,
    );
  }
});

/**
 * Nome de passo do CI não carrega CONTAGEM — ela envelhece e ninguém a lê.
 *
 * O passo do banco chamava-se *"As treze garantias"* com **trinta e cinco** no script. Ninguém
 * mente de propósito: o nome foi escrito quando eram treze, e nome de passo não é derivado de
 * nada, então ele não tem como acompanhar. E o custo é maior que o de um comentário vencido —
 * quem abre a CI para ver se o banco foi provado lê um número que o desmente, e passa a não
 * confiar no painel.
 *
 * A saída não é acertar o número: é **não ter número**. O que a contagem afirma já é derivado
 * três vezes nesta suíte (`bar.test.ts` cobra o script, o `CLAUDE.md` e o plano), e lá ela é
 * conferida contra a fonte. Num nome de passo ela é só decoração que envelhece.
 */
/**
 * Contagem é número + substantivo no PLURAL — e a primeira versão desta régua não sabia disso.
 *
 * Ela procurava a palavra do número e nada mais, e acusou *"o app dirigido como uma pessoa
 * dirige"*: em português `uma` é artigo muito mais vezes do que é contagem. Falso positivo da
 * própria régua, achado por ela reprovando — que é o único jeito honesto de descobrir.
 *
 * O que distingue é o que vem depois: contagem conta COISAS, e coisas no plural. *"treze
 * garantias"* conta; *"uma pessoa"* não. É uma régua de duas palavras em vez de uma, e ela
 * separa os dois casos reais deste arquivo.
 */
export function contagemNoNome(linha: string): boolean {
  const nome = linha.replace(/^\s*-?\s*name:\s*/, '');
  const NUMERO =
    '(?:uma|duas|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|\\d+)';
  // O plural em português termina em `s`; `garantias`, `fatias`, `tabelas`. `pessoa` não.
  return new RegExp(`\\b${NUMERO}\\s+[a-zà-ú]+s\\b`, 'i').test(nome);
}

test('nenhum nome de passo do CI carrega uma contagem', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const comNumero = ci
    .split('\n')
    .filter((l) => /^\s*-?\s*name:/.test(l))
    .filter(contagemNoNome);
  assert.deepEqual(
    comNumero.map((l) => l.trim()),
    [],
    'estes nomes de passo trazem uma contagem, e contagem em nome envelhece sem ninguém notar:\n  ' +
      comNumero.join('\n  '),
  );
});

test('a régua da contagem separa o número que CONTA do artigo', () => {
  // Os dois casos reais deste repositório, palavra por palavra.
  assert.equal(contagemNoNome('      - name: As treze garantias'), true, 'o caso que envelheceu');
  assert.equal(
    contagemNoNome('      - name: o app dirigido como uma pessoa dirige'),
    false,
    '`uma pessoa` é artigo, e acusá-lo obrigaria a renomear um passo que está certo',
  );
  // E as bordas que a régua tem de acertar para valer alguma coisa.
  assert.equal(contagemNoNome('      - name: Tipos, testes e pacote'), false);
  assert.equal(contagemNoNome('      - name: 4 fatias no navegador'), true, 'dígito também conta');
  assert.equal(contagemNoNome('      - name: duas fatias'), true);
});

/**
 * A assinatura de entrega existe como PLUGIN, e é inócua sem a chave.
 *
 * **O que foi medido no artefato, em 13 de setembro:** o APK release saía assinado com
 * `CN=Android Debug`, a `debug.keystore` que vem em todo template do React Native. A chave
 * privada dela está no computador de qualquer pessoa. A Play recusar é o menor dos problemas: com
 * o mesmo pacote e a mesma assinatura, **qualquer um assina um APK que o Android aceita como
 * atualização deste**, e o substituto herda o banco — o livro-razão da fábrica.
 *
 * O conserto tem de ser plugin e não edição no `build.gradle`: `android/` é saída do prebuild e
 * está no `.gitignore`, então editar o arquivo gerado é escrever numa folha que o próximo
 * prebuild joga fora.
 *
 * **E ele NÃO PODE criar chave nenhuma.** Gerar e guardar a de entrega é ato do dono, e é
 * irreversível no pior sentido: perdê-la depois de publicar significa nunca mais atualizar o
 * aplicativo. Sem as quatro variáveis de ambiente, o plugin devolve o gradle intocado e a
 * compilação segue com a chave de depuração — dizendo isso em voz alta.
 */
test('a assinatura de entrega é um plugin registrado, e não faz nada sem a chave', () => {
  const plugins = (APP.expo.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
  assert.ok(
    plugins.includes('./plugins/assinatura-de-entrega'),
    'o plugin tem de estar no app.json — fora dele, o prebuild não o executa e o `build.gradle` ' +
      'gerado volta a assinar a entrega com a chave de depuração',
  );

  const fonte = readFileSync('plugins/assinatura-de-entrega.js', 'utf8');

  // Sem as quatro variáveis, ele devolve o `config` sem tocar em nada. Meia configuração seria
  // pior que nenhuma: o gradle falharia no fim de uma compilação de oito minutos.
  assert.match(
    fonte,
    /if \(!keystore \|\| !senhaArquivo \|\| !alias \|\| !senhaChave\) return cfg;/,
    'sem as quatro variáveis o plugin tem de ser inócuo',
  );

  // E a troca é a ÚLTIMA ocorrência, porque `debug { … }` também tem uma. Trocar a primeira
  // assinaria a build de depuração com a chave de entrega e a entrega com a de depuração —
  // invertido, e com a compilação saindo zero.
  assert.match(
    fonte,
    /lastIndexOf\(DEBUG_NO_RELEASE\)/,
    'a troca é a última ocorrência: a primeira é o bloco `debug`, onde `signingConfigs.debug` ' +
      'está certo',
  );

  // Nenhuma senha, caminho ou alias escrito no repositório. É o que separa "ler do ambiente" de
  // "guardar a chave no git".
  assert.equal(
    /storePassword\s+'(?!\$\{)[^']/.test(fonte.replace(/`[^`]*`/g, '')),
    false,
    'nenhuma senha literal no plugin',
  );
});

/**
 * A ferramenta sabe gerar o que a LOJA aceita.
 *
 * A Play recusa APK desde agosto de 2021: o que se sobe é um AAB. Nenhum verbo produzia um, então
 * o caminho de publicação não existia — e a ausência não estava escrita em lugar nenhum, o que a
 * torna pior que uma decisão de adiar.
 */
test('a ferramenta do aparelho tem verbo para o pacote da loja', () => {
  const script = readFileSync('scripts/aparelho.mjs', 'utf8');
  assert.match(script, /function empacotar\(\)/, 'o verbo existe');
  assert.match(script, /bundleRelease/, 'e ele chama o alvo que gera o AAB');
  assert.match(
    script,
    /verbos: subir \| compilar \| empacotar/,
    'e a ajuda o anuncia — verbo que existe e ninguém sabe é verbo que não existe',
  );
});
