import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cents, type Rate } from './money';
import {
  applyCostEvent,
  foldCostEvents,
  observedLeadTimeDays,
  purchaseUnitCost,
  type CostEvent,
  blendRate,
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

test('a sequence of arrivals folds to the same average as posting them one by one', () => {
  const events: CostEvent[] = [
    { kind: 'purchase', baseUnits: 100_000, totalCents: cents(47_200), at: '2026-08-01T00:00:00Z' },
    { kind: 'purchase', baseUnits: 100_000, totalCents: cents(59_000), at: '2026-08-15T00:00:00Z' },
  ];

  const folded = foldCostEvents(events);
  const stepped = events.reduce(applyCostEvent, { baseUnits: 0, averageRate: 0 as Rate });

  assert.deepEqual(folded, stepped);
  // 472 + 590 reais over 200 kg: 0.531 cents per gram, the number db:verify
  // makes Postgres compute independently.
  assert.equal(Number(folded.averageRate.toFixed(4)), 0.531);
  assert.equal(folded.baseUnits, 200_000);
});

test('the unit price of one invoice is that invoice alone, not the average', () => {
  // The distinction the buyer needs while standing at the supplier: what THIS
  // load costs, not what it does to the blend once it lands.
  const dear = purchaseUnitCost({
    kind: 'purchase',
    baseUnits: 25_000,
    totalCents: cents(11_800),
    at: '2026-09-01T00:00:00Z',
  });

  assert.equal(Number(dear.toFixed(4)), 0.472);
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
