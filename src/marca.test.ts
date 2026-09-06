import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Toda superfície que o gerador desenha tem que ser CITADA por alguém.
 *
 * `scripts/icons.mjs` desenha sete arquivos a partir do caminho da marca em
 * `src/config/brand.ts` — ícone, primeiro plano adaptativo, fundo, monocromático,
 * abertura clara, abertura escura, favicon. Um deles, `splash-icon.png`, foi
 * desenhado com cuidado e **nunca citado**: o `app.json` não tinha
 * `expo-splash-screen`, então o aplicativo abria na tela padrão da Expo — branca,
 * sem marca — com a marca dele existindo no disco ao lado.
 *
 * É o P1 desta casa ("quem chama isto no mesmo commit?") numa forma que o P1 não
 * pega: não é código sem chamador, é **arquivo sem citação**, e nenhuma
 * ferramenta de código enxerga um caminho dentro de um JSON de configuração.
 * Aqui a ponte é conferida nos dois sentidos — o gerador desenhou, a configuração
 * usa.
 *
 * A recíproca não é cobrada de propósito: o `app.json` pode citar imagem que não
 * vem do gerador (uma foto, um asset de terceiro), e proibir isso seria inventar
 * regra para um caso que não existe.
 */
test('every surface the mark generator draws is named by the app config', () => {
  const gerador = readFileSync('scripts/icons.mjs', 'utf8');
  const config = readFileSync('app.json', 'utf8');

  const desenhados = [...gerador.matchAll(/arquivo: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(
    desenhados.length >= 6,
    `o extrator achou ${desenhados.length} superfícies — a leitura do gerador quebrou`,
  );

  const orfaos = desenhados.filter((caminho) => !config.includes(caminho.replace('assets/', '')));
  assert.deepEqual(
    orfaos,
    [],
    `o gerador desenha estes arquivos e o app.json não cita nenhum deles:\n  ${orfaos.join('\n  ')}\n` +
      'Ou a configuração ficou para trás, ou a superfície deixou de existir e o gerador ' +
      'continua desenhando para o disco. Nos dois casos alguém vai olhar uma tela padrão ' +
      'achando que está olhando a marca.',
  );
});

test('the two openings are drawn in opposite inks, so neither is invisible', () => {
  // A abertura escura existe porque o `expo-splash-screen` NÃO recolore a imagem:
  // o modo escuro pede o seu arquivo. Sem ela, a marca de grafite abriria sobre
  // papel carvão — a mesma cicatriz do tema claro ilegível, na primeira tela.
  const gerador = readFileSync('scripts/icons.mjs', 'utf8');
  const clara = /arquivo: 'assets\/splash-icon\.png'[^}]*\}/.exec(gerador)?.[0] ?? '';
  const escura = /arquivo: 'assets\/splash-icon-dark\.png'[\s\S]{0,200}?\}/.exec(gerador)?.[0] ?? '';
  assert.ok(clara, 'a abertura clara sumiu do gerador');
  assert.ok(escura, 'a abertura escura sumiu do gerador');
  assert.ok(!clara.includes('tinta:'), 'a clara usa a tinta padrão, que é a do claro');
  assert.match(escura, /tinta: pega\('markColorDark'\)/, 'a escura tem que sair na tinta do escuro');

  // E as duas cores de fundo do app.json são os papéis das duas caras do Papel.
  const config = JSON.parse(readFileSync('app.json', 'utf8')) as {
    expo: { plugins: (string | [string, Record<string, unknown>])[] };
  };
  const splash = config.expo.plugins.find(
    (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === 'expo-splash-screen',
  );
  assert.ok(splash, 'o app.json não configura a abertura');
  assert.equal(splash[1].backgroundColor, '#FAF7F2', 'o papel claro');
  assert.deepEqual(splash[1].dark, {
    backgroundColor: '#1B1610',
    image: './assets/splash-icon-dark.png',
  });
});
