import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addWidget, BRIEFING_WIDGETS, briefingLayout, moveWidget, widgetsOffCover } from './briefing';

test('the house decides the order and the phone decides what to hide', () => {
  const daCasa = ['clima', 'producao', 'insumos'];

  // A ordem da empresa manda, e o que ela não ordenou entra no fim - na ordem
  // do catálogo. É isso que permite acrescentar peça nova numa versão futura
  // sem que a fábrica inteira precise reconfigurar a capa.
  const capa = briefingLayout(daCasa, []);
  assert.deepEqual(capa.slice(0, 3), ['clima', 'producao', 'insumos']);

  // Peça nova entra sozinha, MENOS a que nasce fora da capa. A capa de fábrica
  // nova é menor que o catálogo de propósito: dado disponível não é motivo para
  // ocupar a tela que se olha de manhã.
  assert.ok(capa.length < BRIEFING_WIDGETS.length, 'o catálogo é maior que o padrão');
  assert.ok(!capa.includes('custo'), 'o custo por unidade não nasce na capa');

  // Mas continua no produto: pedido pela casa, ele entra como qualquer outro.
  assert.ok(briefingLayout([...daCasa, 'custo'], []).includes('custo'));

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

test('what is off the cover is offered, and putting it on is the house deciding', () => {
  const capa = briefingLayout([], []);
  const fora = widgetsOffCover(capa);

  // O que está fora é exatamente o que sobra do catálogo - a tela de Ajustes não
  // pode inventar nem esquecer peça nenhuma.
  assert.deepEqual(
    [...capa, ...fora].sort(),
    [...BRIEFING_WIDGETS].sort(),
    'capa mais fora dá o catálogo inteiro, sem repetição',
  );
  assert.ok(fora.includes('custo'));

  // Colocar na capa mexe na ordem da CASA: é o que todo mundo vai ver de manhã.
  const ligada = addWidget(['producao'], 'custo');
  assert.deepEqual(ligada, ['producao', 'custo']);
  assert.deepEqual(addWidget(ligada, 'custo'), ligada, 'ligar duas vezes não duplica');
  assert.ok(briefingLayout(ligada, []).includes('custo'));
});
