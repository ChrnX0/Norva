import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysUntilExpiry, expiresOn, lotCode } from './lot';

test('the lot code says the day and the run, and sorts by itself', () => {
  assert.equal(lotCode('2026-09-02', 1), '20260902-01');
  assert.equal(lotCode('2026-09-02', 12), '20260902-12');

  // Ordenar como texto tem que dar a ordem do tempo: é assim que a lista de
  // lotes de uma câmara fria fica legível sem ninguém escrever ORDER BY data.
  const dia = [lotCode('2026-09-10', 1), lotCode('2026-09-02', 3), lotCode('2026-08-31', 9)];
  assert.deepEqual([...dia].sort(), ['20260831-09', '20260902-03', '20260910-01']);
});

test('validity is calendar days over the local date, never an instant', () => {
  assert.equal(expiresOn('2026-09-02', 180), '2027-03-01');
  assert.equal(expiresOn('2026-09-02', 1), '2026-09-03');

  // Vira o ano sem aritmética manual, e o ano bissexto entra sozinho.
  assert.equal(expiresOn('2026-12-30', 5), '2027-01-04');
  assert.equal(expiresOn('2028-02-27', 3), '2028-03-01');

  // Produto sem prazo cadastrado gera lote SEM validade - e isso é um fato
  // sobre o produto, não uma falha. Uma data inventada seria pior: ela vira
  // descarte de mercadoria boa, ou venda de mercadoria vencida.
  assert.equal(expiresOn('2026-09-02', null), null);
  assert.equal(expiresOn('2026-09-02', 0), null);
  assert.equal(expiresOn('2026-09-02', -30), null);
});

test('what is left of a lot is counted in days, and it goes negative', () => {
  assert.equal(daysUntilExpiry('2026-09-05', '2026-09-02'), 3);
  assert.equal(daysUntilExpiry('2026-09-02', '2026-09-02'), 0);

  // Negativo é o caso que importa: "venceu ontem" e "vence em três dias" são
  // decisões diferentes, e quem escolhe a frase é a tela.
  assert.equal(daysUntilExpiry('2026-09-01', '2026-09-02'), -1);
  assert.equal(daysUntilExpiry(null, '2026-09-02'), null);

  // Atravessa mês e ano contando dias de verdade, não trinta por mês.
  assert.equal(daysUntilExpiry('2027-03-01', '2026-09-02'), 180);
});
