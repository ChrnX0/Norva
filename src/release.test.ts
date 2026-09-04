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
  expo: { version: string; android: { allowBackup?: boolean } };
};

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

  // E o número desta versão continua sendo o que já foi publicado com ela: a
  // fórmula nova concorda com a antiga em toda versão 0.x.0, e 0.10.0 — o APK que
  // está no celular do dono — segue valendo 100000.
  assert.equal(a * 1_000_000 + b * 10_000 + c * 100, 100_000);
});
