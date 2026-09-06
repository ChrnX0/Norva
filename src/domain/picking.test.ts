import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freeToShip, ordersCoveredBy, pickSuggestion } from './picking';

test('the order beats the habit, and the habit beats nothing', () => {
  // As duas fontes DISCORDANDO é o único caso que prova a ordem: com uma delas
  // vazia, qualquer ordem dá o mesmo número - e um teste assim passa por
  // acidente. Foi exatamente assim que este mutante sobreviveu duas vezes.
  assert.equal(pickSuggestion({ ordered: 300, lastSent: 40 }), 300);

  // Sem pedido, vale o hábito: é o palpite certo para quem repõe por rotina.
  assert.equal(pickSuggestion({ ordered: null, lastSent: 40 }), 40);

  // Sem pedido e sem histórico, não há palpite. Inventar um número seria pedir
  // para alguém conferir uma sugestão que não saiu de lugar nenhum.
  assert.equal(pickSuggestion({ ordered: null, lastSent: null }), null);

  // E zero pedido é um pedido de zero, não a ausência de pedido: a loja que
  // pediu e cancelou não deve receber o envio da semana passada de volta.
  assert.equal(pickSuggestion({ ordered: 0, lastSent: 40 }), 0);
});


test('only a load that covers the whole order can close it', () => {
  const pedidos = [
    { id: 'a', lines: [{ itemId: 'picole', baseUnits: 300 }] },
    { id: 'b', lines: [{ itemId: 'picole', baseUnits: 300 }, { itemId: 'pote', baseUnits: 20 }] },
  ];

  // Mandou 300 picolés: cobre o pedido A inteiro e o B só pela metade.
  const enviado = new Map([['picole', 300]]);
  assert.deepEqual(ordersCoveredBy(pedidos, enviado), ['a']);

  // Faltando um único item, o pedido não fecha. Dizer "entregue" quando faltaram
  // caixas transforma uma falta que a loja vai cobrar num pedido que o sistema
  // diz cumprido - e pedido não é livro-razão, então nada desmente depois.
  assert.deepEqual(ordersCoveredBy(pedidos, new Map([['picole', 299]])), []);

  // Mandar a mais fecha: quem mandou 320 entregou os 300 combinados.
  assert.deepEqual(
    ordersCoveredBy(pedidos, new Map([['picole', 320], ['pote', 25]])),
    ['a', 'b'],
  );

  // E carga de item nenhum não fecha pedido nenhum.
  assert.deepEqual(ordersCoveredBy(pedidos, new Map()), []);
});


test('two loads on the same day cover an order that one alone would not', () => {
  const pedido = [
    { id: 'a', lines: [{ itemId: 'picole', baseUnits: 300 }, { itemId: 'pote', baseUnits: 20 }] },
  ];

  // Cada viagem sozinha cobre um item e nenhuma cobre o pedido. Comparar a
  // cobertura só com a carga do instante fazia um pedido de dois itens NUNCA
  // fechar - e quem carrega o caminhão faz duas viagens até o freezer.
  assert.deepEqual(ordersCoveredBy(pedido, new Map([['picole', 300]])), []);
  assert.deepEqual(ordersCoveredBy(pedido, new Map([['pote', 20]])), []);

  // Somadas, fecham. O pedido é do dia, não da viagem.
  assert.deepEqual(
    ordersCoveredBy(pedido, new Map([['picole', 300], ['pote', 20]])),
    ['a'],
  );
});


test('the promise of the place you are shipping TO is not a competitor', () => {
  const pedidos = [
    {
      id: 'a',
      placeId: 'centro',
      requestedFor: '2026-09-11',
      lines: [{ itemId: 'picole', baseUnits: 500 }],
    },
  ];
  const base = { itemId: 'picole', onHand: 600, amount: 600, orders: pedidos, through: '2026-09-30' };

  // Mandando para a Loja Centro: as 500 dela são o MOTIVO da carga, não uma
  // promessa que a carga rouba. Contá-las aqui faria a tela avisar contra a
  // própria separação, em toda carga legítima - e alerta que aparece sempre
  // ensina a ignorar alerta.
  const paraCentro = freeToShip({ ...base, toPlaceId: 'centro' });
  assert.equal(paraCentro.promised, 0);
  assert.equal(paraCentro.free, 600);
  assert.deepEqual(paraCentro.queue, []);
  assert.equal(paraCentro.short, 0);

  // Os MESMOS dados, mandando para outra loja: agora as 500 têm dono, e as 600
  // que iam sair deixam 500 faltando para quem esperava sexta. Este é o defeito
  // que a tela de transferencia tinha: ela limitava pelo saldo fisico, e saldo
  // fisico nao sabe de promessa.
  const paraBairro = freeToShip({ ...base, toPlaceId: 'bairro' });
  assert.equal(paraBairro.promised, 500);
  assert.equal(paraBairro.free, 100);
  assert.equal(paraBairro.short, 500);
  assert.deepEqual(paraBairro.queue.map((w) => w.placeId), ['centro']);
});


test('what is short is what is missing AFTER the load, and it never goes below zero', () => {
  const pedidos = [
    {
      id: 'a',
      placeId: 'centro',
      requestedFor: '2026-09-11',
      lines: [{ itemId: 'picole', baseUnits: 500 }],
    },
  ];
  const base = { itemId: 'picole', toPlaceId: 'bairro', onHand: 600, orders: pedidos, through: '2026-09-30' };

  // Cabendo na folga, nada falta - e a tela não avisa. Estado bom é estado
  // válido: alerta inventado ensina a ignorar alerta.
  assert.equal(freeToShip({ ...base, amount: 100 }).short, 0);

  // Um a mais que a folga já tira de quem esperava, e é exatamente um.
  assert.equal(freeToShip({ ...base, amount: 101 }).short, 1);

  // Sobrando de mais, o resultado é zero e não um número negativo: "faltam -400"
  // é frase que nenhuma tela sabe dizer.
  assert.equal(freeToShip({ ...base, amount: 0 }).short, 0);
});


test('a factory that promised more than it has says so before the load exists', () => {
  const pedidos = [
    { id: 'a', placeId: 'centro', requestedFor: '2026-09-11', lines: [{ itemId: 'picole', baseUnits: 500 }] },
    { id: 'b', placeId: 'praia', requestedFor: '2026-09-09', lines: [{ itemId: 'picole', baseUnits: 400 }] },
  ];
  const conta = freeToShip({
    itemId: 'picole',
    toPlaceId: 'bairro',
    onHand: 600,
    amount: 0,
    orders: pedidos,
    through: '2026-09-30',
  });

  // Prometeu 900 e tem 600: a folga é NEGATIVA, e isso é notícia - não um zero
  // arredondado. Zerar aqui esconderia que a fábrica já está devendo 300 antes
  // de o caminhão abrir.
  assert.equal(conta.promised, 900);
  assert.equal(conta.free, -300);

  // A fila vem pela data, a mais cedo primeiro: quem carrega decide olhando
  // quem espera antes, não quem foi digitado antes.
  assert.deepEqual(conta.queue.map((w) => w.placeId), ['praia', 'centro']);
});


test('only the asked item counts, and a place waiting twice counts twice', () => {
  const pedidos = [
    {
      id: 'a',
      placeId: 'centro',
      requestedFor: '2026-09-11',
      lines: [{ itemId: 'picole', baseUnits: 300 }, { itemId: 'pote', baseUnits: 900 }],
    },
    {
      id: 'b',
      placeId: 'centro',
      requestedFor: null,
      lines: [{ itemId: 'picole', baseUnits: 200 }],
    },
  ];
  const conta = freeToShip({
    itemId: 'picole',
    toPlaceId: 'bairro',
    onHand: 600,
    amount: 600,
    orders: pedidos,
    through: '2026-09-30',
  });

  // As 900 de pote não reservam picolé nenhum: a promessa é por produto.
  assert.equal(conta.promised, 500);

  // Dois pedidos da mesma loja são duas promessas, e a soma é o que tem dono.
  // Sem dia marcado vai para o fim da fila - é o único que ninguém está
  // esperando numa data.
  assert.deepEqual(conta.queue.map((w) => w.baseUnits), [300, 200]);
  assert.equal(conta.queue[1].requestedFor, null);
});


test('an order for five weeks out does not fight over today truck', () => {
  const pedidos = [
    {
      id: 'perto',
      placeId: 'centro',
      requestedFor: '2026-09-08',
      lines: [{ itemId: 'picole', baseUnits: 300 }],
    },
    {
      id: 'longe',
      placeId: 'praia',
      requestedFor: '2026-10-15',
      lines: [{ itemId: 'picole', baseUnits: 500 }],
    },
    {
      id: 'semdia',
      placeId: 'norte',
      requestedFor: null,
      lines: [{ itemId: 'picole', baseUnits: 50 }],
    },
  ];
  const conta = freeToShip({
    itemId: 'picole',
    toPlaceId: 'bairro',
    onHand: 600,
    amount: 600,
    orders: pedidos,
    through: '2026-09-13',
  });

  // O pedido de outubro não disputa o caminhão de hoje: a fábrica produz de novo
  // antes disso, e avisar sobre ele seria alarme sem nada para evitar - que é
  // como se ensina alguém a ignorar alarme.
  assert.deepEqual(conta.queue.map((w) => w.orderId), ['perto', 'semdia']);
  assert.equal(conta.promised, 350);

  // Sem dia marcado conta SEMPRE. Ninguém sabe dizer que ele é distante, e o
  // corte é a mesma letra miúda do SQL que a tela de pedido já usava.
  assert.equal(conta.queue[1].requestedFor, null);

  // E o horizonte é do lado de dentro: no dia exato do corte o pedido ainda
  // disputa. Trocar `>` por `>=` some com quem espera justamente no dia em que
  // a carga sairia sem ele.
  const noDia = freeToShip({
    itemId: 'picole',
    toPlaceId: 'bairro',
    onHand: 600,
    amount: 600,
    orders: pedidos,
    through: '2026-10-15',
  });
  assert.equal(noDia.promised, 850);
});
