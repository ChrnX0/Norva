import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { interpretarMovimento, mesmaTelaEmTodas } from '../scripts/leitura.mjs';

/**
 * A guarda das cinco larguras não pode responder o que não conseguiu medir.
 *
 * O `CLAUDE.md` descreve esta guarda como o que pega *"a navegação não pegou numa das
 * cinco larguras"* e, duas seções depois, proíbe guarda que não pode falhar. Ela era as
 * duas coisas ao mesmo tempo: com o movimento de ambiente ligado — o estado normal do
 * aplicativo — o `uiautomator` não lê nada, as cinco leituras viravam `''`, o
 * `.filter(Boolean)` as descartava, e `[].length <= 1` anunciava "as cinco são a mesma
 * tela".
 *
 * O caso que este arquivo protege é o do meio, e é ele que faz a diferença valer: quatro
 * larguras lidas e iguais, uma ilegível, **não** é "iguais" — a ilegível pode ser
 * exatamente a que não navegou.
 */

const CINCO = (...t: string[]) => t;

test('cinco leituras falhadas NÃO são "a mesma tela" — é "não sei"', () => {
  const r = mesmaTelaEmTodas(CINCO('', '', '', '', ''));
  assert.equal(r.veredito, 'nao-sei', 'a guarda voltou a afirmar o que não mediu');
  assert.equal(r.lidas, 0);
  assert.equal(r.de, 5);
});

test('as cinco lidas e iguais são "iguais"', () => {
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', 'Nova ficha', 'Nova ficha', 'Nova ficha', 'Nova ficha'));
  assert.equal(r.veredito, 'iguais');
  assert.equal(r.lidas, 5);
});

test('uma que destoa é "diferentes" — a assinatura do defeito', () => {
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', 'Nova ficha', 'Hoje a fábrica', 'Nova ficha', 'Nova ficha'));
  assert.equal(r.veredito, 'diferentes');
  assert.deepEqual(r.vistos.sort(), ['Hoje a fábrica', 'Nova ficha']);
});

test('quatro iguais e uma ILEGÍVEL não é "iguais" — a ilegível pode ser a que falhou', () => {
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', 'Nova ficha', '', 'Nova ficha', 'Nova ficha'));
  assert.equal(r.veredito, 'nao-sei', 'a leitura que faltou era justamente a que a guarda existe para olhar');
  assert.equal(r.lidas, 4);
  assert.equal(r.de, 5);
});

test('duas lidas e diferentes JÁ derrubam, mesmo com as outras ilegíveis', () => {
  // Diferença achada é fato; ausência de diferença entre duas de cinco não é.
  const r = mesmaTelaEmTodas(CINCO('Nova ficha', '', 'Hoje a fábrica', '', ''));
  assert.equal(r.veredito, 'diferentes');
});

test('uma leitura só não compara com nada', () => {
  assert.equal(mesmaTelaEmTodas(CINCO('Nova ficha', '', '', '', '')).veredito, 'nao-sei');
});

test('espaço em branco é leitura falhada, não título', () => {
  assert.equal(mesmaTelaEmTodas(CINCO('   ', '\t', '', '', '')).veredito, 'nao-sei');
});

/**
 * E o chamador tem de tratar as três — senão a correção morre na volta.
 *
 * Um `if (!veredito.igual)` sobre a forma nova daria sempre `true` (`igual` não existe
 * mais) e o comando passaria a falhar em toda execução. Esta linha lê o `aparelho.mjs`
 * e cobra que ele cite as três respostas pelo nome.
 */
test('o comando das cinco larguras trata as três respostas', () => {
  const fonte = readFileSync('scripts/aparelho.mjs', 'utf8');
  assert.match(fonte, /mesmaTelaEmTodas/, 'o comando deixou de perguntar');
  for (const resposta of ['iguais', 'diferentes', 'nao-sei']) {
    assert.match(
      fonte,
      new RegExp(`'${resposta}'`),
      `o comando não trata a resposta '${resposta}' — a guarda voltou a ter duas saídas`,
    );
  }
});

/**
 * O estado de movimento do aparelho, lido de três escalas — e `"null"` não é zero.
 *
 * O emulador deste projeto estava com as três em `0` e ninguém sabia: `0` em
 * `transition_animation_scale` é o que o React Native devolve como
 * `isReduceMotionEnabled()`, que `src/components/vida.ts` lê para PARAR as animações. As
 * fotos eram do aplicativo desligado, e o dono exige o contrário.
 *
 * O caso que engana é `"null"`: `settings get` responde isso quando a chave nunca foi
 * mexida, e o padrão do sistema é **1**. Lido como zero, o aviso sairia invertido — e um
 * aviso invertido é pior que nenhum, porque ensina a ignorar.
 */
test('"null" é "nunca mexido", e o padrão do sistema é movimento LIGADO', () => {
  const r = interpretarMovimento(['null', 'null', 'null']);
  assert.equal(r?.appAnima, true, 'chave nunca mexida virou "sem movimento" — o aviso sai invertido');
  assert.equal(r?.sistemaAnima, true);
});

test('as três em zero são o aparelho em "reduzir movimento"', () => {
  const r = interpretarMovimento(['0', '0', '0']);
  assert.equal(r?.appAnima, false);
  assert.equal(r?.sistemaAnima, false);
});

test('as três em um são o aparelho como o dono recebe', () => {
  const r = interpretarMovimento(['1', '1', '1']);
  assert.equal(r?.appAnima, true);
  assert.equal(r?.sistemaAnima, true);
});

/**
 * A que separa as duas perguntas — e a primeira versão desta régua errava aqui.
 *
 * Conferido na fonte que está no disco (`AccessibilityInfoModule.kt:100-115`): o React
 * Native lê SÓ `TRANSITION_ANIMATION_SCALE` para `isReduceMotionEnabled()`. Então
 * `window_animation_scale = 0` para a transição do ANDROID e não toca no aplicativo:
 * dizer "esta foto é do aplicativo parado" aí seria mentira.
 */
test('só a PRIMEIRA escala chega ao aplicativo — as outras são do Android', () => {
  const r = interpretarMovimento(['1', '0', '1']);
  assert.equal(r?.appAnima, true, 'a foto continua sendo do aplicativo vivo');
  assert.equal(r?.sistemaAnima, false, 'mas a janela do Android não vai ficar ociosa');
});

test('a primeira em zero é o aplicativo parado, mesmo com as outras ligadas', () => {
  const r = interpretarMovimento(['0', '1', '1']);
  assert.equal(r?.appAnima, false);
  assert.equal(r?.sistemaAnima, false, 'sistemaAnima exige as três');
});

test('fração é movimento, e mais lento não é parado', () => {
  assert.equal(interpretarMovimento(['0.5', '1', '1'])?.appAnima, true);
});

test('resposta que não é número vira "não sei", nunca um palpite', () => {
  // `settings` respondendo `cmd: Can't find service: settings` durante a partida é o
  // caso real: o instrumento tem de dizer que não sabe, e não inventar "tem movimento".
  assert.equal(interpretarMovimento(["cmd: Can't find service: settings", '1', '1']), null);
});

/**
 * A conferência das cinco larguras só confere se a tela puder ser LIDA — e medido em
 * 11 de setembro, com uma variável só e a mesma tela:
 *
 * | movimento | leituras |
 * |---|---|
 * | desligado | 3 de 3, 13–14 s |
 * | ligado | **0 de 3**, desistindo em 21–23 s |
 *
 * Por isso o `fotos` desliga o movimento de propósito. Estas linhas prendem as duas
 * metades que, separadas, não valem nada: desligar sem devolver envenena a próxima
 * sessão (já aconteceu, e por um dia inteiro), e devolver sem desligar deixa a
 * conferência cega de novo.
 */
test('o comando das cinco larguras desliga o movimento para poder ler', () => {
  const fonte = readFileSync('scripts/aparelho.mjs', 'utf8');
  assert.match(fonte, /semMovimento\(\(\) => fotosEm\(/, 'o fotos com rota deixou de desligar o movimento');
});

test('quem desliga o movimento devolve num finally, não no caminho feliz', () => {
  const fonte = readFileSync('scripts/aparelho.mjs', 'utf8');
  const corpo = fonte.slice(fonte.indexOf('async function semMovimento'));
  const ate = corpo.slice(0, corpo.indexOf('\n}\n'));
  assert.match(ate, /finally\s*\{/, 'sem finally, uma exceção no meio deixa o aparelho em "reduzir movimento"');
  // E o que se devolve tem de ser o que estava, não um chute — com o padrão do
  // sistema como saída quando não deu para ler.
  assert.match(ate, /antes\?\.\[i\]/, 'deixou de devolver o valor que estava antes');
});

/**
 * Aviso deliberado não é aviso — a Lei 7 aplicada à legenda da foto.
 *
 * O `fotos` desliga o movimento de propósito, então o aparelho FICA em "reduzir
 * movimento" durante as cinco fotos. Uma legenda que gritasse `⚠ SEM MOVIMENTO` nas cinco,
 * toda vez, é alerta inventado: sai sempre, vira ruído, e ensina a ignorar justamente o
 * caso que importa — o aparelho estar parado **sem ninguém ter pedido**, que foi o defeito
 * de 10 de setembro e durou um dia.
 *
 * Então a legenda distingue os dois. Esta linha existe porque a distinção é fácil de
 * perder num refactor: apagar o ramo deliberado devolve o ruído, e apagar o outro devolve
 * o silêncio.
 */
test('a legenda separa "desliguei eu" de "estava parado e ninguém pediu"', () => {
  const fonte = readFileSync('scripts/aparelho.mjs', 'utf8');
  assert.match(fonte, /desligamosOMovimento/, 'o comando deixou de saber se foi ele quem desligou');
  assert.match(
    fonte,
    /ESTE comando desligou o movimento/,
    'o caso deliberado perdeu a legenda própria e volta a gritar nas cinco fotos',
  );
  assert.match(
    fonte,
    /⚠ SEM MOVIMENTO \(o app lê "reduzir movimento" e ninguém pediu/,
    'o caso que importa — parado sem ninguém pedir — perdeu o grito',
  );
});
