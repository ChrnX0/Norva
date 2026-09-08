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
    android: { allowBackup?: boolean };
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
 * **E o encolhimento de RECURSOS está fora de propósito, e o motivo é melhor que
 * o que eu escrevi primeiro.** Eu tinha medido 0,29 MB de diferença em `res/` e
 * na tabela de recursos entre o APK com e sem R8, e creditado ao encolhimento —
 * dois builds que diferiam em DUAS coisas, e eu atribuí o delta a uma. O relatório
 * do próprio shrinker desmente: `outputs/mapping/release/resources.txt` abre com
 * `Resources#getIdentifier present: true` e não tem uma linha de recurso removido.
 * Ele viu busca de recurso por nome, entrou em modo conservador e **não removeu
 * nada**. Os 0,29 MB são do R8 encurtando NOME de recurso, que acontece de
 * qualquer jeito.
 *
 * Ou seja: ligado, ele paga zero e mantém aberta a porta de remover calado um
 * recurso buscado por nome no dia em que o modo conservador não disparar. A
 * minificação de CÓDIGO fica porque paga 12,6 MB, medidos no dex do mesmo build.
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
