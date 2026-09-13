import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Cents, type Rate } from './money';
import {
  observedLeadTimeDays,
  prazoDoFornecedorAtual,
  blendRate,
  taxaDaMercadoria,
  intervaloEntreCompras,
  quantoComprar,
  pacotesAComprar,
  folgaQueAFabricaUsa,
  folgaOferecida,
  COMPRAS_PARA_SUGERIR,
} from './cost';

/**
 * The three exports the audit found with no caller and no test.
 *
 * They were not sloppy: each carries a decision this project already made -
 * folding a sequence of arrivals, the unit price of one invoice, and the lead
 * time a supplier actually keeps rather than the one they promise. What they
 * were was *unproven*, which is worse than absent, because an exported function
 * with a docblock reads like a capability. Whoever wires them to a screen
 * inherits an answer nobody has ever checked.
 */

/**
 * **O prazo é de UM fornecedor, e a média de dois é um número de ninguém.**
 *
 * Este é o número que a capa, o aviso e a ficha do insumo usam para dizer o dia de comprar
 * desde 13 de setembro. Numa fábrica que compra polpa de dois fornecedores — um da cidade que
 * entrega em dois dias, um de fora que leva dez — a média dá seis: cedo demais para um, tarde
 * demais para o outro, e errado para os dois.
 *
 * O recorte é o fornecedor da ÚLTIMA nota porque é o mesmo que a tela de compra sugere no
 * campo. A tela oferecer um fornecedor e o prazo ser de outro é o aplicativo discordando de si
 * mesmo — a doença que a régua única de compra veio curar.
 */
test('the lead time belongs to the supplier you are about to buy from', () => {
  const daCidade = 'f-cidade';
  const deFora = 'f-fora';

  // A última nota é do fornecedor da cidade: dois dias.
  const entregas = [
    { orderedAt: '2026-09-10T00:00:00Z', receivedAt: '2026-09-12T00:00:00Z', supplierId: daCidade },
    { orderedAt: '2026-09-01T00:00:00Z', receivedAt: '2026-09-11T00:00:00Z', supplierId: deFora },
    { orderedAt: '2026-08-20T00:00:00Z', receivedAt: '2026-08-22T00:00:00Z', supplierId: daCidade },
  ];

  assert.equal(
    prazoDoFornecedorAtual(entregas),
    2,
    'as duas entregas do fornecedor da cidade dão dois dias — a de fora não entra na conta',
  );

  // E a média de todas, que é o que o sistema fazia antes, é um número de ninguém.
  assert.equal(
    observedLeadTimeDays(entregas),
    14 / 3,
    'a média dos dois fornecedores não é o prazo de nenhum deles — é este número que decidia',
  );

  // Com um fornecedor só, nada muda: a fábrica que compra sempre no mesmo lugar vê o mesmo
  // número de antes, e é por isso que esta mudança não mexe com quem já usava o app.
  const umSo = entregas.filter((e) => e.supplierId === daCidade);
  assert.equal(prazoDoFornecedorAtual(umSo), observedLeadTimeDays(umSo));

  // Nota antiga não tem fornecedor cadastrado, e nulo não é um fornecedor: aí o prazo volta a
  // ser o de todas as entregas, que é a resposta honesta de quem não sabe de quem comprou.
  const semCadastro = entregas.map((e) => ({ ...e, supplierId: null }));
  assert.equal(prazoDoFornecedorAtual(semCadastro), observedLeadTimeDays(semCadastro));

  // Uma entrega nova SEM fornecedor na frente não apaga o recorte das outras: o que manda é
  // a primeira da lista, e se ela não sabe de quem é, ninguém sabe.
  assert.equal(prazoDoFornecedorAtual([]), null, 'sem entrega não há prazo, e não há palpite');
});

test('lead time is what the supplier did, not what they said', () => {
  // Three days promised, six delivered - and the reorder point built on the
  // promise is the one that stops the factory. The average is over what
  // happened, which the system holds and the person does not.
  const observed = observedLeadTimeDays([
    { orderedAt: '2026-08-01T00:00:00Z', receivedAt: '2026-08-07T00:00:00Z' },
    { orderedAt: '2026-08-10T00:00:00Z', receivedAt: '2026-08-16T00:00:00Z' },
    { orderedAt: '2026-08-20T00:00:00Z', receivedAt: '2026-08-23T00:00:00Z' },
  ]);

  assert.equal(observed, 5);
  // Nothing bought yet is not "zero days", which would read as instant delivery.
  assert.equal(observedLeadTimeDays([]), null);
});

/**
 * A média móvel do produto fabricado, que a mutação atravessava.
 *
 * **A cicatriz.** `blendRate` é o único autor da média do que sai do tacho, e
 * nenhum teste a chamava com estoque em mãos: os que a citam passam pelo caso em
 * que ela é a identidade (estoque zero, `total <= 0`, devolve a taxa que chega).
 * A mutação que troca o corpo inteiro por `return arriving.rate` atravessava a
 * suíte — e o que ela faz na fábrica é o estoque antigo passar a valer o preço da
 * corrida de hoje.
 *
 * Ela só apareceu quando a oficina do `mutate` voltou a rodar a suíte: por 66
 * commits o portão declarou todo defeito "pego" sem consultar nada.
 */
test('the manufactured average is a blend, not the last run', () => {
  // Mil unidades a 0,50 na câmara, e uma corrida de mil a 0,80.
  const depois = blendRate(
    { baseUnits: 1_000, averageRate: 0.5 as Rate },
    { baseUnits: 1_000, rate: 0.8 as Rate },
  );
  assert.ok(
    Math.abs(depois - 0.65) < 1e-9,
    `a média de 1000 a 0,50 com 1000 a 0,80 é 0,65, e saiu ${depois}. ` +
      'Devolver a taxa que chega faz o estoque antigo valer o preço de hoje.',
  );

  // E o peso conta: dez mil velhas contra cem novas quase não movem a média.
  const quaseIgual = blendRate(
    { baseUnits: 10_000, averageRate: 0.5 as Rate },
    { baseUnits: 100, rate: 0.8 as Rate },
  );
  assert.ok(
    quaseIgual > 0.5 && quaseIgual < 0.51,
    `cem unidades a 0,80 sobre dez mil a 0,50 mal movem a média, e saiu ${quaseIgual}`,
  );

  // A taxa NÃO passa por centavo inteiro no caminho — é a regra da capa do
  // projeto, e é o motivo de `blendRate` existir em vez de reusar o evento de
  // compra. Três décimos de milésimo têm que sobreviver.
  const fino = blendRate(
    { baseUnits: 3, averageRate: 0.001 as Rate },
    { baseUnits: 1, rate: 0.005 as Rate },
  );
  assert.ok(
    Math.abs(fino - 0.002) < 1e-12,
    `taxa fracionária tem que atravessar sem arredondar, e saiu ${fino}`,
  );
});

test('stock in the negative counts as zero, like the purchase event does', () => {
  // Recusar empurraria alguém a digitar mentira — a razão está no docblock.
  const comNegativo = blendRate(
    { baseUnits: -500, averageRate: 9 as Rate },
    { baseUnits: 200, rate: 0.8 as Rate },
  );
  assert.equal(comNegativo, 0.8, 'saldo negativo conta como zero, e a média vira a taxa que chega');

  // E o caso vazio continua sendo a identidade, que é o que os testes antigos
  // exercitavam — fica afirmado de propósito, para a diferença entre os dois
  // casos ficar visível a quem ler.
  assert.equal(
    blendRate({ baseUnits: 0, averageRate: 0 as Rate }, { baseUnits: 500, rate: 1.2 as Rate }),
    1.2,
  );
});

/**
 * **A régua que separa o PREÇO DO FORNECEDOR do que a carga custou para estar aqui.**
 *
 * Ela existe por um alarme que culpava quem não fez nada. A tela de compra soma o frete ao
 * total antes de gravar — e isso está certo, o razão guarda o pouso —, mas a comparação *"você
 * pagou X na última vez"* saía do mesmo número. O campo de frete diz de si mesmo que o valor
 * varia por ENTREGA (*"uma semana o fornecedor traz, na outra você busca"*), então buscar o
 * saco você mesmo numa semana e pagar entrega na outra fazia a tela anunciar alta de um
 * fornecedor que não mexeu no preço.
 *
 * A frase que essa tela existe para produzir está escrita no esquema desde a `0002`: *"R$ 118
 * here; R$ 112 last month at supplier B"*. Ela é dita ao fornecedor, então tem de falar do que
 * o fornecedor cobra.
 */
test('a taxa da mercadoria tira o frete, e o pouso continua sendo o pouso', () => {
  // 300 reais de manga mais 60 de entrega, em 20 kg: 1,5 centavo por grama de mercadoria.
  assert.equal(
    taxaDaMercadoria(36_000 as Cents, 6_000 as Cents, 20_000),
    1.5,
    'o frete sai da conta antes da divisão',
  );

  // O caso FALSO da mesma régua: sem frete a mercadoria É o pouso. Sem esta metade a asserção
  // acima passaria com uma subtração constante, ou com o total devolvido cru dividido errado.
  assert.equal(
    taxaDaMercadoria(30_000 as Cents, 0 as Cents, 20_000),
    1.5,
    'sem frete não há o que descontar',
  );
  assert.notEqual(
    taxaDaMercadoria(36_000 as Cents, 0 as Cents, 20_000),
    1.5,
    'e o pouso sem frete declarado continua alto — é ele que move a média',
  );
});

test('frete maior que o total é lido como frete nenhum, e nunca como preço negativo', () => {
  /**
   * A nota não fecha: alguém digitou o frete no campo do total. Subtrair devolveria taxa
   * NEGATIVA, e a tela anunciaria que o fornecedor está pagando para entregar — com o sinal
   * trocado atravessando até a cor do crachá. Cair no pouso é o pior caso aceitável: o número
   * fica alto, nunca invertido.
   */
  const taxa = taxaDaMercadoria(5_000 as Cents, 8_000 as Cents, 100);
  assert.ok(taxa > 0, 'preço de mercadoria nunca é negativo, nem numa nota que não fecha');
  assert.equal(taxa, 50, 'e o número que sobra é o do pouso, que é o que existia antes desta régua');

  // Frete IGUAL ao total atravessa, e ali zero é a resposta certa: a mercadoria veio de graça
  // e só a entrega foi paga. O fornecedor cobrou nada, e a comparação deve dizer isso.
  assert.equal(
    taxaDaMercadoria(3_000 as Cents, 3_000 as Cents, 100),
    0,
    'nota que é só entrega: o fornecedor cobrou nada pela mercadoria',
  );

  // Quantidade zero não divide: a resposta é zero e não infinito, como em todo o resto da casa.
  assert.equal(taxaDaMercadoria(3_000 as Cents, 0 as Cents, 0), 0);
});


/**
 * **O intervalo entre compras, e por que ele é do FORNECEDOR e não do item.**
 *
 * Numa fábrica que compra polpa de dois lugares — um da cidade toda semana e um de fora uma vez
 * por mês —, a média dos intervalos de todas as entregas não é o intervalo de nenhum dos dois. É o
 * mesmo recorte que `prazoDoFornecedorAtual` faz, e pela mesma razão: o número decide quanto pedir
 * A ESTE fornecedor.
 */
test('o intervalo entre compras é o do fornecedor da última nota', () => {
  const entregas = [
    // A mais nova primeiro, como `deliveriesOf` devolve.
    { receivedAt: '2026-09-12T00:00:00.000Z', supplierId: 'perto' },
    { receivedAt: '2026-09-05T00:00:00.000Z', supplierId: 'perto' },
    { receivedAt: '2026-08-29T00:00:00.000Z', supplierId: 'perto' },
    // O de fora entrega de mês em mês, e ele NÃO entra na conta desta compra.
    { receivedAt: '2026-07-01T00:00:00.000Z', supplierId: 'longe' },
    { receivedAt: '2026-06-01T00:00:00.000Z', supplierId: 'longe' },
  ];
  assert.equal(
    intervaloEntreCompras(entregas),
    7,
    'três entregas semanais do mesmo fornecedor dão sete dias — o de fora não dilui',
  );

  // O caso FALSO: sem o recorte a média das quatro janelas seria muito maior. Sem esta asserção
  // a de cima passaria com uma implementação que ignora o fornecedor e por acaso desse sete.
  assert.notEqual(
    intervaloEntreCompras(entregas.map((e) => ({ ...e, supplierId: null }))),
    7,
    'misturando os dois fornecedores o número deixa de ser sete — é isso que o recorte evita',
  );
});

test('uma entrega só não tem intervalo, e a resposta é nulo em vez de zero', () => {
  /**
   * É o estado normal do primeiro mês, não uma borda. Zero diria "compro de novo hoje" e faria o
   * pedido cobrir apenas prazo mais folga sem ninguém saber que o ciclo era desconhecido — e a
   * diferença entre "o ciclo é zero" e "não sei o ciclo" é a mesma que este projeto guarda em toda
   * parte: nulo é resposta, zero é número que alguém soma.
   */
  assert.equal(intervaloEntreCompras([{ receivedAt: '2026-09-12T00:00:00.000Z', supplierId: 'a' }]), null);
  assert.equal(intervaloEntreCompras([]), null);

  // E duas do MESMO fornecedor já têm intervalo: o nulo é sobre a contagem, não sobre o cadastro.
  assert.equal(
    intervaloEntreCompras([
      { receivedAt: '2026-09-12T00:00:00.000Z', supplierId: 'a' },
      { receivedAt: '2026-09-02T00:00:00.000Z', supplierId: 'a' },
    ]),
    10,
  );
});

test('a lista chegando ao contrário dá o mesmo intervalo, nunca um negativo', () => {
  // Intervalo negativo viraria um alvo menor e um pedido CURTO — o defeito silencioso desta
  // família, porque um pedido pequeno não parece errado até a fábrica parar.
  const crescente = [
    { receivedAt: '2026-09-01T00:00:00.000Z', supplierId: 'a' },
    { receivedAt: '2026-09-08T00:00:00.000Z', supplierId: 'a' },
  ];
  assert.equal(intervaloEntreCompras(crescente), 7);
  assert.ok((intervaloEntreCompras(crescente) ?? -1) > 0, 'nunca negativo');
});

/**
 * **QUANTO comprar, e as três parcelas do alvo.**
 *
 * `reorderPoint` responde *quando*. Esta responde *quanto*, e sem ela a tela só sabe dizer
 * "compre" — a metade que a Lei 1 proíbe deixar para a pessoa calcular de cabeça.
 */
test('o pedido cobre prazo, folga e o ciclo, e desconta a prateleira', () => {
  const conta = quantoComprar({
    dailyOutflow: 1_000,
    onHandBaseUnits: 4_000,
    leadTimeDays: 6,
    safetyDays: 2,
    cycleDays: 7,
    floorDays: 3,
  });
  // 1.000/dia × (6 + 2 + 7) = 15.000 de alvo, menos 4.000 na prateleira.
  assert.equal(conta, 11_000, 'o alvo é prazo + folga + ciclo, e o que já está em casa desconta');

  // O caso que mostra que o CICLO está na conta: sem ele o pedido chega e já é hora de pedir de novo.
  assert.equal(
    quantoComprar({
      dailyOutflow: 1_000,
      onHandBaseUnits: 4_000,
      leadTimeDays: 6,
      safetyDays: 2,
      cycleDays: null,
      floorDays: 3,
    }),
    4_000,
    'sem ciclo conhecido o pedido cobre prazo + folga e mais nada — curto, e honesto',
  );
});

test('prazo desconhecido usa o MESMO piso que decide o dia de comprar', () => {
  /**
   * A régua do *quando* (`precisaComprar`) cai em `settings.daysAhead.insumo` quando não há prazo
   * observado. Se o *quanto* usasse outro número, o aplicativo avisaria por uma conta e pediria por
   * outra — a doença que a régua única de compra veio curar em 6 de setembro.
   */
  assert.equal(
    quantoComprar({
      dailyOutflow: 500,
      onHandBaseUnits: 0,
      leadTimeDays: null,
      safetyDays: 2,
      cycleDays: null,
      floorDays: 3,
    }),
    2_500,
    'sem prazo observado o alvo é o piso configurado mais a folga: 500 × (3 + 2)',
  );
});

test('quem tem mais do que o alvo não compra, e insumo parado não se compra', () => {
  // Zero e não negativo: um número negativo atravessaria para a tela e viraria "compre -3 sacos".
  assert.equal(
    quantoComprar({
      dailyOutflow: 100,
      onHandBaseUnits: 999_999,
      leadTimeDays: 6,
      safetyDays: 2,
      cycleDays: 7,
      floorDays: 3,
    }),
    0,
    'prateleira acima do alvo devolve zero, nunca negativo',
  );

  // Sem saída não há data de acabar e não há quanto pedir — o mesmo raciocínio de `daysOfCover`
  // devolvendo nulo. Aqui zero é a resposta certa: não se compra o que não sai.
  assert.equal(
    quantoComprar({
      dailyOutflow: 0,
      onHandBaseUnits: 0,
      leadTimeDays: 6,
      safetyDays: 2,
      cycleDays: 7,
      floorDays: 3,
    }),
    0,
    'insumo parado não entra na lista de compras',
  );

  // E saldo NEGATIVO (contagem atrasada) não aumenta o pedido além do alvo: ele conta como zero,
  // como no evento de custo e no gatilho do servidor. Somar a falta pediria estoque que a
  // contagem vai corrigir.
  assert.equal(
    quantoComprar({
      dailyOutflow: 100,
      onHandBaseUnits: -5_000,
      leadTimeDays: 6,
      safetyDays: 2,
      cycleDays: 2,
      floorDays: 3,
    }),
    1_000,
    'saldo negativo conta como zero — a mesma regra do evento de custo',
  );
});

test('o pedido sai em EMBALAGENS inteiras, arredondando para cima', () => {
  /**
   * Ninguém pede dois terços de um saco. E para CIMA, não para baixo: arredondar para baixo
   * entrega um pedido que não cobre o alvo, e a fábrica para por falta — nunca por sobra.
   */
  assert.equal(pacotesAComprar(11_000, 25_000), 1, 'menos de um saco ainda é um saco');
  assert.equal(pacotesAComprar(26_000, 25_000), 2, 'um pouco mais que um saco são dois');
  assert.equal(pacotesAComprar(50_000, 25_000), 2, 'e o múltiplo exato não vira três');

  // O item comprado na própria unidade-base: o produto de revenda contado por unidade, que a tela
  // de compra já trata com `?? 1`.
  assert.equal(pacotesAComprar(44, null), 44, 'sem embalagem de compra, a conta é a quantidade');
  assert.equal(pacotesAComprar(0, 25_000), 0, 'nada a comprar não vira um saco');
});


/**
 * **A folga que a fábrica USA, contra a que ela CONFIGUROU.**
 *
 * A folga é configuração e nasce em dois. Se a fábrica sempre compra com quatro dias de sobra, o
 * aplicativo avisando em dois chega atrasado em toda compra — e ninguém vai aos ajustes trocar um
 * número que não sabe que está errado. Daí a sugestão; daí também a trava que a impede de mentir.
 */
test('a folga observada é a MEDIANA, para a compra de pânico não mandar no hábito', () => {
  const compras = [
    // Três compras normais com quatro dias de sobra...
    { diasDeCoberturaAoPedir: 10, prazoObservado: 6 },
    { diasDeCoberturaAoPedir: 10, prazoObservado: 6 },
    { diasDeCoberturaAoPedir: 10, prazoObservado: 6 },
    // ...e uma de pânico: pediu com o estoque no fim.
    { diasDeCoberturaAoPedir: 6, prazoObservado: 6 },
    // ...e uma de oportunidade: o preço caiu e comprou com um mês de sobra.
    { diasDeCoberturaAoPedir: 36, prazoObservado: 6 },
  ];
  assert.equal(
    folgaQueAFabricaUsa(compras),
    4,
    'a mediana devolve o hábito: quatro dias, que é o que três das cinco compras usaram',
  );

  // O caso FALSO da escolha, e é ele que justifica a mediana: a média das cinco é 6,8 — um número
  // que compra NENHUMA usou, puxado pela de oportunidade.
  const media = compras.reduce((n, c) => n + (c.diasDeCoberturaAoPedir - c.prazoObservado), 0) / 5;
  assert.notEqual(media, 4, 'a média discorda da mediana neste conjunto — é por isso que a escolha importa');
});

test('com poucas compras a sugestão NÃO existe, em vez de existir errada', () => {
  /**
   * Com uma compra na vida a tela diria "você sempre comprou com 0 dias de sobra" — uma afirmação
   * sobre hábito tirada de um evento. Nulo faz a peça desaparecer, que é a mesma regra do alerta
   * inventado: melhor calar que ensinar a ignorar.
   */
  const uma = [{ diasDeCoberturaAoPedir: 6, prazoObservado: 6 }];
  assert.equal(folgaQueAFabricaUsa(uma), null, 'uma compra não é hábito');
  assert.equal(folgaQueAFabricaUsa([]), null, 'nenhuma compra, nenhuma opinião');

  // E o caso VERDADEIRO do mesmo limiar: com o mínimo exato a sugestão aparece. Sem esta metade a
  // asserção acima passaria com uma função que devolve nulo para tudo.
  const tres = Array.from({ length: COMPRAS_PARA_SUGERIR }, () => ({
    diasDeCoberturaAoPedir: 9,
    prazoObservado: 6,
  }));
  assert.equal(folgaQueAFabricaUsa(tres), 3, 'no limiar exato ela passa a existir');
  assert.ok(COMPRAS_PARA_SUGERIR >= 3, 'duas compras dariam uma mediana que é a média de duas');
});

test('comprar com o estoque no negativo é folga ZERO, nunca negativa', () => {
  // Contagem atrasada ou compra de emergência: a cobertura ao pedir sai negativa, e uma folga
  // negativa atravessaria para a tela como sugestão impossível.
  const compras = [
    { diasDeCoberturaAoPedir: -3, prazoObservado: 6 },
    { diasDeCoberturaAoPedir: -3, prazoObservado: 6 },
    { diasDeCoberturaAoPedir: -3, prazoObservado: 6 },
  ];
  assert.equal(folgaQueAFabricaUsa(compras), 0, 'o piso é zero');
});

test('a sugestão cai numa das escolhas da tela, e o empate vai para o MAIOR', () => {
  const OPCOES = [0, 1, 2, 3, 5, 7, 14];
  assert.equal(folgaOferecida(3.2, OPCOES), 3, 'perto de três, três');
  assert.equal(folgaOferecida(6.1, OPCOES), 7, 'perto de sete, sete');

  /**
   * O empate é a asserção que importa, e ele é a mesma assimetria de `pacotesAComprar`: errar para
   * mais custa estoque parado, errar para menos custa a fábrica parada por falta. Quatro dias entre
   * 3 e 5 sugerem cinco.
   */
  assert.equal(folgaOferecida(4, OPCOES), 5, 'no empate, o maior — comprar cedo é o erro barato');

  // E a ordem da lista não decide: a mesma resposta com as escolhas ao contrário.
  assert.equal(folgaOferecida(4, [...OPCOES].reverse()), 5, 'a ordem das escolhas não muda a resposta');

  assert.equal(folgaOferecida(0, OPCOES), 0, 'zero é uma escolha, não ausência de escolha');
  assert.equal(folgaOferecida(3, []), null, 'sem escolhas não há o que sugerir');
});
