import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIEFING_WIDGETS, briefingLayout, moveWidget } from './briefing';

test('the house decides the order and the phone decides what to hide', () => {
  const daCasa = ['clima', 'producao', 'insumos'];

  // A ordem da empresa manda, e o que ela não ordenou entra no fim - na ordem
  // do catálogo. É isso que permite acrescentar peça nova numa versão futura
  // sem que a fábrica inteira precise reconfigurar a capa.
  const capa = briefingLayout(daCasa, []);
  assert.deepEqual(capa.slice(0, 3), ['clima', 'producao', 'insumos']);
  assert.equal(capa.length, BRIEFING_WIDGETS.length);

  // O aparelho esconde sem mexer no que a casa combinou: quem está na câmara
  // fria tira o preço do caminho, e a capa do escritório continua igual.
  const naCamara = briefingLayout(daCasa, ['precos', 'clima']);
  assert.ok(!naCamara.includes('precos'));
  assert.ok(!naCamara.includes('clima'));
  assert.deepEqual(capa.filter((w) => w !== 'precos' && w !== 'clima'), naCamara);
});

test('a widget that no longer exists disappears without breaking the rest', () => {
  // A preferência guardada é texto vindo do disco, e disco guarda o que a
  // versão anterior escreveu. Uma peça que saiu do catálogo tem que sumir
  // sozinha - senão a capa quebra na atualização, no aparelho de quem já usava.
  const comLixo = briefingLayout(['producao', 'peca-que-nao-existe-mais', 'clima'], []);
  assert.ok(!comLixo.includes('peca-que-nao-existe-mais' as never));
  assert.deepEqual(comLixo.slice(0, 2), ['producao', 'clima']);
});

test('moving a widget stops at the ends instead of wrapping', () => {
  const ordem = ['producao', 'insumos', 'clima'] as const;

  assert.deepEqual(moveWidget(ordem, 'insumos', 'up'), ['insumos', 'producao', 'clima']);
  assert.deepEqual(moveWidget(ordem, 'insumos', 'down'), ['producao', 'clima', 'insumos']);

  // Subir a primeira não a manda para o fim: dar a volta faria a peça sumir do
  // topo da tela num toque que a pessoa deu esperando não acontecer nada.
  assert.deepEqual(moveWidget(ordem, 'producao', 'up'), ['producao', 'insumos', 'clima']);
  assert.deepEqual(moveWidget(ordem, 'clima', 'down'), ['producao', 'insumos', 'clima']);
});
