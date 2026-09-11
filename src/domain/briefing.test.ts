import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  avisoDaCopia,
  DIAS_ATE_A_COPIA_ENVELHECER,
  addWidget,
  degrausQueFaltam,
  primeiroPasso,
  briefingFilas,
  BRIEFING_WIDGETS,
  briefingLayout,
  coverState,
  moveWidget,
  todayRank,
  widgetsOffCover,
} from './briefing';

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

/**
 * A capa não pode afirmar enquanto não sabe.
 *
 * O caso que fez este teste existir: a foto do emulador mostrou "Hoje a fábrica
 * ainda não produziu" com 506 unidades gravadas no livro-razão — a consulta
 * ainda não tinha voltado, e nulo estava sendo lido como zero.
 */
test('the cover says nothing while the answer has not arrived', () => {
  assert.equal(coverState(null), 'loading');
});

const vazio = {
  madeToday: 0,
  runs: [],
  cover: [],
  boxes: 0,
  orders: 0,
  running: [],
  expiring: [],
  dueToday: [],
  lossesNow: 0,
};

test('an answered query with nothing in it is the first day, not loading', () => {
  assert.equal(coverState(vazio), 'firstDay');
});

/**
 * Falhou não é carregando — e a diferença é a frase mais cara da tela.
 *
 * Fotografado no aparelho em 9 de setembro: a capa com a linha de olho e mais
 * NADA, por minutos, sem erro no log e sem uma palavra na tela. A capa é uma
 * consulta só; quando ela falha o gancho devolve nulo, e nulo virava "carregando"
 * — a tela esperava para sempre. E antes de esvaziar, com metade da resposta, ela
 * escreveu "Parada agora: nada em produção, nada feito e nada saiu hoje":
 * afirmando sobre a fábrica sem ter conseguido lê-la.
 */
test('a query that FAILED is not a query that has not arrived', () => {
  const problema = new Error('database is locked');
  assert.equal(coverState(null, problema), 'falhou');
  // E a falha manda mesmo com resposta na mão: meia resposta que falhou continua
  // sendo falha, e foi meia resposta que produziu a frase errada.
  assert.equal(coverState(vazio, problema), 'falhou');
  assert.equal(coverState({ ...vazio, madeToday: 500 }, problema), 'falhou');
});

test('a régua distingue: sem erro, nada vira falha', () => {
  assert.equal(coverState(null, null), 'loading');
  assert.equal(coverState(vazio, null), 'firstDay');
  assert.equal(coverState({ ...vazio, madeToday: 500 }, null), 'day');
});

test('any sign of work makes it a day, one at a time', () => {
  const sinais = [
    { madeToday: 1 },
    { runs: [1] },
    { cover: [1] },
    { boxes: 1 },
    { orders: 1 },
    { running: [1] },
    { expiring: [1] },
    { dueToday: [1] },
    { lossesNow: 1 },
  ];
  for (const sinal of sinais) {
    assert.equal(
      coverState({ ...vazio, ...sinal }),
      'day',
      `${Object.keys(sinal)[0]} sozinho já é trabalho e a capa tem de mostrar o dia`,
    );
  }
});

test('today\'s place in the week is counted, and a tie goes to today', () => {
  const dia = (total: number) => ({ date: '', total });
  // 500 hoje contra 478, 481, 700, 300: só o 700 é maior → segundo melhor.
  assert.equal(todayRank([dia(478), dia(481), dia(700), dia(300), dia(500)]), 2);
  // O melhor da semana.
  assert.equal(todayRank([dia(478), dia(481), dia(500)]), 1);
  // Empate conta a favor de hoje: "há dia melhor que este?" — não.
  assert.equal(todayRank([dia(500), dia(500)]), 1);
  // O pior.
  assert.equal(todayRank([dia(10), dia(20), dia(30), dia(5)]), 4);
  // Semana inteira parada não tem ranking — e não tem "melhor dia".
  assert.equal(todayRank([dia(0), dia(0), dia(0)]), null);
  assert.equal(todayRank([]), null);

  // O dia que ainda não aconteceu não é o pior dia: a manhã de domingo com a
  // fábrica fechada dizia "hoje é o sétimo melhor dia" ao lado de "ainda não
  // produziu hoje". Verdade e alerta inventado ao mesmo tempo.
  assert.equal(todayRank([dia(400), dia(500), dia(300), dia(0)]), null);
});

/**
 * As filas da capa — meia coluna, e a regra que impede o buraco.
 *
 * Pedido do dono em 6 de setembro: *"e o tamanho dos widgets, dá para alterar?
 * tipo meia coluna ou coluna inteira?"*. O que estes exemplos protegem não é o
 * pareamento, que é fácil: é a regra de que **meia sozinha vira inteira**.
 */
test('duas meias seguidas viram um par', () => {
  assert.deepEqual(briefingFilas(['perdas', 'clima'], ['perdas', 'clima']), [['perdas', 'clima']]);
});

test('meia sozinha ocupa a fila inteira, porque vazio ao lado é pior', () => {
  assert.deepEqual(briefingFilas(['perdas', 'producao'], ['perdas']), [['perdas'], ['producao']]);
});

test('três meias seguidas viram um par e uma sozinha', () => {
  assert.deepEqual(briefingFilas(['perdas', 'clima', 'custo'], ['perdas', 'clima', 'custo']), [
    ['perdas', 'clima'],
    ['custo'],
  ]);
});

/**
 * A manchete e a semana SÃO a página: meia manchete quebra a capa aprovada e
 * meia semana são três dias e meio de barra. Marcar uma delas não faz nada — e o
 * teste existe porque o caminho fácil seria confiar em a tela não oferecer a
 * opção, o que deixa a regra dependendo de quem desenha o botão.
 */
test('peça que não aceita meia continua inteira mesmo se pedirem', () => {
  assert.deepEqual(briefingFilas(['producao', 'semana'], ['producao', 'semana']), [
    ['producao'],
    ['semana'],
  ]);
});

test('meia ao lado de uma que não aceita não pareia', () => {
  assert.deepEqual(briefingFilas(['clima', 'semana'], ['clima', 'semana']), [['clima'], ['semana']]);
});

/**
 * O aviso da cópia é a única regra da capa cuja primeira verificação em fábrica
 * seria catorze dias depois de ela ser escrita.
 *
 * A peça não aparece no emulador no dia em que se constrói — a cópia é de hoje, e
 * o aviso só existe quando ela envelhece. Sem teste, a regra ficaria sustentada
 * por leitura, e leitura é o que este projeto já provou não bastar: o tema claro
 * ilegível passou por 338 testes verdes porque nenhum deles olhava a coisa certa.
 */
test('the copy warning shows up when it should, and stays quiet when it should not', () => {
  // Em dia: some. "Está tudo bem" é estado válido e bonito, e peça que aparece
  // sempre é peça que ninguém lê.
  assert.equal(avisoDaCopia({ diasAtras: 0 }, true), null);
  assert.equal(avisoDaCopia({ diasAtras: DIAS_ATE_A_COPIA_ENVELHECER - 1 }, true), null);

  // O limite é INCLUSIVO: no décimo quarto dia já avisa. A borda escrita aqui
  // porque "quase catorze" e "catorze" é exatamente onde um >= vira > sem ninguém
  // perceber.
  assert.equal(avisoDaCopia({ diasAtras: DIAS_ATE_A_COPIA_ENVELHECER }, true), 'velha');
  assert.equal(avisoDaCopia({ diasAtras: 90 }, true), 'velha');

  // Sem cópia nenhuma E com o que perder: pede.
  assert.equal(avisoDaCopia(null, true), 'nunca');
  assert.equal(avisoDaCopia(undefined, true), 'nunca');

  // Sem cópia e sem nada a perder: CALA. Pedir cópia de uma fábrica que ainda não
  // produziu é o alerta inventado, e alerta inventado ensina a ignorar alerta —
  // que é a Lei 7 desta casa. Esta é a metade que uma implementação apressada
  // esquece, porque "sem cópia" parece resposta suficiente sozinha.
  assert.equal(avisoDaCopia(null, false), null);

  // E uma cópia velha continua velha mesmo numa fábrica parada: o razão que já
  // existe é o que se perde, e ele não deixa de existir porque hoje foi quieto.
  assert.equal(avisoDaCopia({ diasAtras: 30 }, false), 'velha');
});

test('a primeira ação da capa é o passo que a fábrica ainda não deu', () => {
  // A cadeia inteira, na ordem em que ela trava.
  assert.equal(primeiroPasso({ insumos: 0, fichas: 0, produtos: 0 }), 'insumo');
  assert.equal(primeiroPasso({ insumos: 3, fichas: 0, produtos: 0 }), 'ficha');
  assert.equal(primeiroPasso({ insumos: 3, fichas: 1, produtos: 0 }), 'produto');
  assert.equal(primeiroPasso({ insumos: 3, fichas: 1, produtos: 1 }), 'producao');
});

test('o passo olha o que FALTA, não o que já existe depois dele', () => {
  // O caso que separa esta régua de uma contagem qualquer: quem tem produto mas
  // perdeu o insumo continua tendo de produzir — o buraco está atrás, e voltar
  // para o cadastro de insumo por causa dele seria mandar refazer o feito.
  //
  // Esta é a fronteira e ela é deliberada: a régua responde "por onde começar",
  // e começar é sempre pelo elo que falta primeiro. Quem chega aqui com produto
  // e sem insumo não é fábrica nova — é fábrica que apagou o almoxarifado.
  assert.equal(primeiroPasso({ insumos: 0, fichas: 1, produtos: 1 }), 'insumo');
  assert.notEqual(primeiroPasso({ insumos: 1, fichas: 1, produtos: 1 }), 'insumo');
});

test('a corrente diz quantos degraus faltam, não só qual é o próximo', () => {
  // O caminho de trás (*"o que você fez?"*) mostra ONDE a pessoa está, e para isso a lista
  // inteira importa: metade do peso de *"sete cadastros antes do primeiro número útil"* é
  // não saber quantos são. Com o próximo só, a tela manda a pessoa a um lugar sem dizer
  // que ainda vêm dois.
  assert.deepEqual(degrausQueFaltam({ insumos: 0, fichas: 0, produtos: 0 }), [
    'insumo',
    'ficha',
    'produto',
  ]);
  assert.deepEqual(degrausQueFaltam({ insumos: 3, fichas: 0, produtos: 0 }), ['ficha', 'produto']);
  assert.deepEqual(degrausQueFaltam({ insumos: 3, fichas: 1, produtos: 0 }), ['produto']);
  assert.deepEqual(degrausQueFaltam({ insumos: 3, fichas: 1, produtos: 2 }), [], 'nada falta');
});

test('a corrente pula o degrau que já existe, sem reordenar os outros', () => {
  // O caso que uma leitura "para no primeiro zero" erra: quem cadastrou produto antes da
  // ficha — possível, porque a tela de produto aceita revenda sem receita. A lista tem de
  // dizer que a FICHA falta, e na posição dela, não empurrar tudo para baixo.
  assert.deepEqual(degrausQueFaltam({ insumos: 2, fichas: 0, produtos: 5 }), ['ficha']);
  assert.deepEqual(degrausQueFaltam({ insumos: 0, fichas: 4, produtos: 5 }), ['insumo']);
  assert.deepEqual(degrausQueFaltam({ insumos: 0, fichas: 0, produtos: 5 }), ['insumo', 'ficha']);
});

test('o próximo passo é o primeiro que falta, e as duas funções nunca discordam', () => {
  // A guarda que impede a ordem da corrente de existir escrita duas vezes. Ela morde de
  // verdade: antes de `primeiroPasso` derivar da lista, eram dois `if` encadeados e uma
  // lista literal, e mexer numa só deixava a tela mandando a pessoa a um degrau que a
  // própria tela dava como pronto.
  for (const insumos of [0, 3]) {
    for (const fichas of [0, 2]) {
      for (const produtos of [0, 5]) {
        const preparo = { insumos, fichas, produtos };
        assert.equal(
          primeiroPasso(preparo),
          degrausQueFaltam(preparo)[0] ?? 'producao',
          `discordam em ${JSON.stringify(preparo)}`,
        );
      }
    }
  }
});
