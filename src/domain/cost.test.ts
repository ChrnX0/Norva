import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Cents, type Rate } from './money';
import {
  observedLeadTimeDays,
  prazoDoFornecedorAtual,
  blendRate,
  taxaDaMercadoria,
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
