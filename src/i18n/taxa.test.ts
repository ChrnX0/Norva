import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultLocale, formatUnitRate } from '@/i18n';

test('a price under one cent is said per thousand, never with three decimals', () => {
  const porMil = 'a cada 1.000 unidades';
  // O rótulo do dono: R$ 0,004 por unidade não existe para pessoa nenhuma.
  assert.equal(formatUnitRate(0.4, defaultLocale, porMil), 'R$ 4,00 a cada 1.000 unidades');
  // De um centavo para cima, nada muda.
  assert.equal(formatUnitRate(5, defaultLocale, porMil), 'R$ 0,05');
  assert.equal(formatUnitRate(2.5, defaultLocale, porMil), 'R$ 0,03');
  // Zero é zero, sem escala.
  assert.equal(formatUnitRate(0, defaultLocale, porMil), 'R$ 0,00');
  // E nunca três casas.
  for (const r of [0.4, 0.05, 0.999]) {
    assert.doesNotMatch(formatUnitRate(r, defaultLocale, porMil), /,\d{3}/);
  }
});
