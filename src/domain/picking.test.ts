import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faltaProduzir, freeToShip, ordersCoveredBy, pickSuggestion } from './picking';

test('the order beats the habit, and the habit beats nothing', () => {
  // As duas fontes DISCORDANDO é o único caso que prova a ordem: com uma delas
  // vazia, qualquer ordem dá o mesmo número - e um teste assim passa por
  // acidente. Foi exatamente assim que este mutante sobreviveu duas vezes.
  assert.equal(pickSuggestion({ ordered: 300, alreadySent: 0, lastSent: 40 }), 300);

  // Sem pedido, vale o hábito: é o palpite certo para quem repõe por rotina.
  assert.equal(pickSuggestion({ ordered: null, alreadySent: 0, lastSent: 40 }), 40);

  // Sem pedido e sem histórico, não há palpite. Inventar um número seria pedir
  // para alguém conferir uma sugestão que não saiu de lugar nenhum.
  assert.equal(pickSuggestion({ ordered: null, alreadySent: 0, lastSent: null }), null);

  // E zero pedido é um pedido de zero, não a ausência de pedido: a loja que
  // pediu e cancelou não deve receber o envio da semana passada de volta.
  assert.equal(pickSuggestion({ ordered: 0, alreadySent: 0, lastSent: 40 }), 0);

  // A segunda viagem ao freezer sugere o que FALTA. Sem isto, quem confia no
  // campo manda 800 contra um pedido de 500 - e o `ordersCoveredBy` já contava
  // pelo dia justamente porque as duas viagens existem.
  assert.equal(pickSuggestion({ ordered: 500, alreadySent: 300, lastSent: 40 }), 200);

  // Coberto é zero, não "sem palpite": não falta nada daquele pedido hoje, e
  // cair no hábito aqui ofereceria mandar de novo o que já foi.
  assert.equal(pickSuggestion({ ordered: 500, alreadySent: 500, lastSent: 40 }), 0);

  // E mandaram a mais: o palpite é zero, nunca negativo. "Mande menos cem" não
  // é frase que uma tela saiba dizer.
  assert.equal(pickSuggestion({ ordered: 500, alreadySent: 600, lastSent: 40 }), 0);

  // O desconto é do PEDIDO, não do hábito: sem pedido, o que já foi hoje não
  // muda quanto a fábrica costuma repor.
  assert.equal(pickSuggestion({ ordered: null, alreadySent: 300, lastSent: 40 }), 40);
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

  // Mandar a mais fecha o PRIMEIRO: quem mandou 320 entregou os 300 do pedido A.
  // O B pede outros 300 e sobraram 20 — a carga é uma só e ela se gasta.
  //
  // **Esta linha afirmava `['a', 'b']`, e era o defeito escrito como verdade.** A
  // função oferecia o mesmo mapa a cada pedido sem consumir nada, então uma carga
  // de 320 picolés "cobria" 600: a loja recebia metade do que o app deu como
  // entregue, e pedido é justamente a peça que o livro-razão não desmente.
  assert.deepEqual(
    ordersCoveredBy(pedidos, new Map([['picole', 320], ['pote', 25]])),
    ['a'],
  );

  // E com carga para os dois, os dois fecham — senão a guarda estaria medindo
  // "nunca fecha mais de um" em vez de "a carga se gasta".
  assert.deepEqual(
    ordersCoveredBy(pedidos, new Map([['picole', 600], ['pote', 20]])),
    ['a', 'b'],
  );

  // E carga de item nenhum não fecha pedido nenhum.
  assert.deepEqual(ordersCoveredBy(pedidos, new Map()), []);
});

/**
 * Dois pedidos iguais e uma carga que só dá para um: fecha UM.
 *
 * O caso mais simples do defeito, isolado — a loja pede 300 na segunda e 300 na
 * quarta, o caminhão leva 300, e o app dava os dois por entregues. A ordem em que a
 * carga se gasta é a que chega (`listOrders` já ordena por data pedida e depois por
 * criação), que é o que qualquer pessoa da doca faria com o caminhão à frente.
 */
test('uma carga que dá para um pedido não fecha dois', () => {
  const dois = [
    { id: 'segunda', lines: [{ itemId: 'picole', baseUnits: 300 }] },
    { id: 'quarta', lines: [{ itemId: 'picole', baseUnits: 300 }] },
  ];

  assert.deepEqual(ordersCoveredBy(dois, new Map([['picole', 300]])), ['segunda']);
  assert.deepEqual(ordersCoveredBy(dois, new Map([['picole', 599]])), ['segunda']);
  assert.deepEqual(ordersCoveredBy(dois, new Map([['picole', 600]])), ['segunda', 'quarta']);
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

/**
 * A carga que saiu de manhã deixava de ser promessa — e não deixava.
 *
 * `requested` é a soma bruta das linhas dos pedidos abertos, e a conta que a capa
 * fazia era `requested - onHand`. O `onHand` CAI quando a carga sai da sala; o
 * pedido não descia junto. Então depois de entregar 300 de 500 a diferença crescia
 * em 300 — a capa mandava produzir exatamente o que o caminhão levou, o aviso no
 * celular repetia, e a tela de anotar pedido avisava contra um estoque que já
 * tinha ido.
 *
 * A régua é uma só, aqui, e a conta é feita à mão em cada asserção.
 */
test('o que já chegou na loja hoje sai da conta do que falta produzir', () => {
  // Pediram 500, já foram 300, e a fábrica tem 100. Falta produzir 100: dos 500
  // prometidos sobram 200, e 100 já estão na câmara.
  assert.equal(faltaProduzir({ requested: 500, sentToday: 300, onHand: 100 }), 100);

  // O caso que o defeito produzia: entregou tudo, e a fábrica ficou sem nada. Sem
  // descontar, a conta dava 500 — "produza quinhentos" no dia em que os quinhentos
  // saíram pela porta.
  assert.equal(faltaProduzir({ requested: 500, sentToday: 500, onHand: 0 }), 0);

  // Nada entregue: a conta antiga e a nova concordam, e é isso que impede a régua
  // de trocar um defeito por outro.
  assert.equal(faltaProduzir({ requested: 500, sentToday: 0, onHand: 200 }), 300);

  // Entregou MAIS do que foi pedido: não é falta negativa, é zero. Sobra é outra
  // pergunta, e um número negativo aqui viraria "produza menos que nada" na tela.
  assert.equal(faltaProduzir({ requested: 500, sentToday: 700, onHand: 0 }), 0);

  // E estoque de sobra também não vira falta negativa.
  assert.equal(faltaProduzir({ requested: 100, sentToday: 0, onHand: 900 }), 0);
});
