import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DIAS_DE_VALIDADE,
  escreverIntencao,
  lerIntencao,
  venceu,
  type Intencao,
} from './intencao';

const AGORA = '2026-09-11T12:00:00.000Z';

test('a frase da pessoa volta como ela a escreveu, aparada', () => {
  const guardado = escreverIntencao({ oQue: '  200 picolés de morango  ', quanto: 200, quando: AGORA });
  const lida = lerIntencao(guardado, AGORA);
  assert.deepEqual(lida, { oQue: '200 picolés de morango', quanto: 200, quando: AGORA });
});

test('quanto é opcional, porque a pessoa pode só dizer o que fez', () => {
  // Lei 2 diz que nenhum campo nasce vazio, e Lei 1 que não se pergunta o que se deduz —
  // mas a quantidade aqui NÃO se deduz, e exigi-la na porta transformaria a frase de
  // entrada em formulário. O número tem lugar certo para aparecer: a tela de produção.
  const lida = lerIntencao(escreverIntencao({ oQue: 'picolé', quanto: null, quando: AGORA }), AGORA);
  assert.equal(lida?.quanto, null);
  assert.equal(lida?.oQue, 'picolé');
});

test('número que não é quantidade vira nulo, e não derruba a frase', () => {
  // Zero, negativo e NaN não são "quantas unidades saíram" — e perder a FRASE por causa de
  // um número ruim seria jogar fora a parte que a pessoa digitou com cuidado.
  for (const ruim of ['0', '-5', 'null', '"200"', 'true']) {
    const bruto = `{"oQue":"picolé","quanto":${ruim},"quando":"${AGORA}"}`;
    const lida = lerIntencao(bruto, AGORA);
    assert.equal(lida?.oQue, 'picolé', `a frase sobreviveu a quanto=${ruim}`);
    assert.equal(lida?.quanto, null, `quanto=${ruim} não é quantidade`);
  }
  // E `NaN` não entra nesta lista porque ele NÃO CABE no armazenamento: não é JSON válido,
  // então a frase inteira cai — que é o certo, e é outro caso, não este. Escrevi-o na
  // lista primeiro e o teste me corrigiu: um valor que o canal não transporta não é um
  // valor a tolerar.
  assert.equal(lerIntencao(`{"oQue":"picolé","quanto":NaN,"quando":"${AGORA}"}`, AGORA), null);
});

test('o que não é intenção volta nulo em vez de quebrar a tela', () => {
  // Os casos FALSOS, e eles são o motivo de esta função existir em vez de um `JSON.parse`
  // na tela: o armazenamento do aparelho guarda o que uma versão antiga escreveu, e uma
  // tela que estoura ao abrir é pior que uma tela sem a frase.
  assert.equal(lerIntencao(null, AGORA), null, 'nunca escreveram nada');
  assert.equal(lerIntencao('', AGORA), null, 'texto vazio');
  assert.equal(lerIntencao('não é json', AGORA), null, 'lixo');
  assert.equal(lerIntencao('42', AGORA), null, 'json que não é objeto');
  assert.equal(lerIntencao('{"quanto":200}', AGORA), null, 'sem a frase não há intenção');
  assert.equal(lerIntencao('{"oQue":"   "}', AGORA), null, 'espaço não é frase');
  assert.equal(lerIntencao('{"oQue":"picolé"}', AGORA), null, 'sem quando não se sabe se vale');
  assert.equal(lerIntencao('{"oQue":"picolé","quando":"ontem"}', AGORA), null, 'quando ilegível');
});

test('a intenção vence, e a de amanhã NÃO vence', () => {
  const dia = 24 * 60 * 60 * 1000;
  const seteDias = new Date(Date.parse(AGORA) - DIAS_DE_VALIDADE * dia).toISOString();
  const oitoDias = new Date(Date.parse(AGORA) - (DIAS_DE_VALIDADE + 1) * dia).toISOString();

  assert.equal(venceu(seteDias, AGORA), false, 'no limite ela ainda vale');
  assert.equal(venceu(oitoDias, AGORA), true, 'passado o prazo, a frase não é mais o agora');
  assert.equal(
    lerIntencao(escreverIntencao({ oQue: 'picolé', quanto: 1, quando: oitoDias }), AGORA),
    null,
    'a leitura aplica o prazo — senão o aplicativo abre com a intenção da semana passada',
  );

  // O caso falso que importa mais que o verdadeiro: relógio do aparelho andando para trás.
  // Fuso trocado, hora corrigida na mão, aparelho sem bateria — e apagar o trabalho da
  // pessoa por causa disso é perder dado dela por um defeito que não é dela.
  const amanha = new Date(Date.parse(AGORA) + dia).toISOString();
  assert.equal(venceu(amanha, AGORA), false, 'data no futuro não vence');
  assert.equal(
    lerIntencao(escreverIntencao({ oQue: 'picolé', quanto: 1, quando: amanha }), AGORA)?.oQue,
    'picolé',
  );
});

test('ida e volta não muda nada — a frase guardada é a frase lida', () => {
  const original: Intencao = { oQue: 'pote de 500 de ameixa', quanto: 12, quando: AGORA };
  const daVolta = lerIntencao(escreverIntencao(original), AGORA);
  assert.deepEqual(daVolta, original, 'guardar e ler é identidade para intenção válida');
});
