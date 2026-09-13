import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { decidirVolta, porFora, type Volta } from './volta';

/**
 * A tecla voltar do aparelho tem três casos e só um deles é defeito.
 *
 * Esta guarda existe porque a medida do aparelho e a checagem de navegador discordaram
 * em 11 de setembro: o navegador CLICA na seta do cabeçalho (verde), e a tecla do
 * aparelho encerrava a Activity (vermelho). O `voltar()` nunca viu a tecla.
 *
 * E o caso que ela protege de verdade é o do meio — a grade de nomes. Consertar a
 * ligação profunda com "voltar sempre vai para a capa" abriria uma porta que o
 * `app/_layout.tsx` fecha por escrito: com o piso de capacidades, chegar à capa sem
 * dizer quem é deixa operar sem nome. Um teste que só cobrisse o defeito aprovaria
 * esse conserto.
 */

const base: Volta = { podeVoltar: false, noDestino: false, porFora: false };

test('quem entrou por fora e não tem pilha atrás vai ao destino, não sai', () => {
  assert.equal(decidirVolta({ ...base, porFora: true }), 'destino');
});

test('quem entrou pelo ícone SAI, mesmo sem pilha atrás — capa e grade de nomes', () => {
  // O caso legítimo que um conserto ingênuo quebraria. A grade (`app/who.tsx`) chega
  // por `replace` na abertura: pilha de um cartão, igualzinha à ligação profunda.
  assert.equal(decidirVolta({ ...base, porFora: false }), 'padrao');
});

test('com cartão atrás, a tecla é do padrão — inclusive vindo de fora', () => {
  assert.equal(decidirVolta({ ...base, podeVoltar: true, porFora: true }), 'padrao');
});

test('já no destino, voltar SAI — senão o aplicativo não fecha nunca', () => {
  // Segundo toque de quem entrou por fora: o primeiro o levou à capa. Sem esta
  // regra ele ficaria preso, que é o outro defeito com a mesma cara de conserto.
  assert.equal(decidirVolta({ ...base, noDestino: true, porFora: true }), 'padrao');
});

/**
 * O leitor da ligação de abertura, com as duas formas que o Android entrega.
 *
 * `norva://losses` põe a rota no HOST e `norva:///losses` no CAMINHO — as duas chegam
 * de intent, e um parser que entende uma só responde errado para a outra em silêncio.
 * É a regra desta casa: detector novo passa num caso verdadeiro e num falso antes de
 * reportar qualquer coisa.
 */
test('a ligação de abertura: por fora só quando ela aponta para dentro', () => {
  // Verdadeiros — as duas formas, com e sem consulta.
  assert.equal(porFora('norva://losses'), true, 'rota no host');
  assert.equal(porFora('norva:///losses'), true, 'rota no caminho');
  assert.equal(porFora('norva://scan?code=ABC'), true, 'com consulta');
  assert.equal(porFora('https://norva.app/losses'), true, 'ligação de web');
  assert.equal(porFora('norva://recipes/7'), true, 'rota com dois pedaços');

  // Falsos — nenhum destes cria tela atrás, então sair continua certo.
  assert.equal(porFora(null), false, 'tocou no ícone');
  assert.equal(porFora(undefined), false, 'ainda não foi lida');
  assert.equal(porFora(''), false, 'vazia');
  assert.equal(porFora('norva://'), false, 'só o esquema');
  assert.equal(porFora('norva:///'), false, 'só o esquema, na outra forma');
  assert.equal(porFora('https://norva.app/'), false, 'a raiz da web é a capa');
  assert.equal(porFora('https://norva.app'), false, 'o domínio pelado também é a capa');
  assert.equal(porFora('nao-e-ligacao'), false, 'sem esquema não é ligação');
});

/**
 * A metade de React desta regra tem de existir, e num lugar só.
 *
 * A decisão pura não conserta nada sozinha: sem um `BackHandler` registrado, a tecla
 * continua indo para o padrão da Activity — que foi o defeito. Esta linha é a que
 * fica vermelha se alguém apagar a ligação achando que o arquivo de cima basta, e é
 * barata porque o alvo é o casco, não uma tela.
 */
test('o casco registra a tecla do aparelho e consulta esta decisão', () => {
  const casco = readFileSync('app/_layout.tsx', 'utf8');
  assert.match(casco, /BackHandler/, 'sem BackHandler a tecla nunca chega ao aplicativo');
  assert.match(casco, /decidirVolta/, 'o casco decidiu por conta própria em vez de usar a regra');
  assert.match(casco, /hardwareBackPress/, 'o evento da tecla não foi escutado');
});
