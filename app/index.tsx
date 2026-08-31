import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { CountUp } from '@/components/CountUp';
import { PulseDot } from '@/components/PulseDot';
import { UnitStepper } from '@/components/UnitStepper';
import { balanceOf, daysOfCover, type Movement } from '@/domain/ledger';
import { fromDecimal } from '@/domain/money';
import { roundUpToFullContainer, type PackagingHierarchy } from '@/domain/units';
import {
  defaultLocale,
  detectLanguage,
  dictionary,
  fill,
  formatMoney,
  formatQuantity,
} from '@/i18n';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Foundation smoke screen.
 *
 * Not a product screen - it exists so phase 0 can be seen working end to end:
 * the ledger folding into a balance, the packaging hierarchy speaking the
 * operator's language, the locale formatting money and quantities, and the
 * motion vocabulary running on a real device.
 */
export default function Home() {
  return (
    <AreaProvider area="mint">
      <Foundation />
    </AreaProvider>
  );
}

/** A packaging hierarchy exactly as a popsicle factory would configure it. */
const hierarchy: PackagingHierarchy = {
  tiers: [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'box', perBaseUnit: 50 },
    { id: 'crate', perBaseUnit: 300 },
  ],
};

/** A handful of movements. Balance is derived, never stored. */
const movements: Movement[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: 'demo',
    kind: 'production',
    occurredAt: '2026-08-28T11:00:00Z',
    recordedAt: '2026-08-28T11:04:00Z',
    recordedBy: 'operator',
    itemId: 'strawberry',
    quantityBaseUnits: 4800,
    locationId: 'coldRoom',
    lotId: 'L-2291',
    unitCostCents: fromDecimal(1.18),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    companyId: 'demo',
    kind: 'transfer',
    occurredAt: '2026-08-30T08:20:00Z',
    recordedAt: '2026-08-30T08:20:00Z',
    recordedBy: 'operator',
    itemId: 'strawberry',
    quantityBaseUnits: -1388,
    locationId: 'coldRoom',
    counterpartLocationId: 'storeCentro',
    lotId: 'L-2291',
    post: 'picked',
  },
];

function Foundation() {
  const { color, type, space } = useTheme();
  const t = dictionary(detectLanguage());
  const locale = defaultLocale;

  const [quantity, setQuantity] = useState(3600);

  const stock = useMemo(() => {
    const coldRoom = balanceOf(movements).find((b) => b.locationId === 'coldRoom');
    return coldRoom?.baseUnits ?? 0;
  }, []);

  const cover = daysOfCover(stock, 850);
  const rounding = roundUpToFullContainer(1599, hierarchy, 'box');

  const tierLabel = (tierId: string, count: number) => {
    const entry = t.units[tierId as keyof typeof t.units];
    if (!entry) return tierId;
    return count === 1 ? entry.one : entry.other;
  };

  return (
    <CollapsingHeader title={t.areas.inventory} overline="fundação · fase 0">
      <Card tone="area">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <PulseDot />
          <Text style={[type.cardTitle, { color: color.ink }]}>
            {t.areas.inventory}
          </Text>
        </View>
        <CountUp
          value={stock}
          format={(v) => formatQuantity(v, locale)}
          style={{ ...type.figure, color: color.ink, marginTop: space.sm }}
        />
        <Text style={[type.secondary, { color: color.inkMuted }]}>
          {cover === null
            ? '—'
            : `${cover.toFixed(0)} dias de cobertura · saldo somado do livro-razão`}
        </Text>
      </Card>

      <Card tone="warning">
        <Text style={[type.cardTitle, { color: color.ink }]}>Lote L-2291</Text>
        <View style={{ marginTop: space.sm }}>
          <Chip signal="warning" label={fill(t.signals.expiringIn, { days: 9 })} />
        </View>
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink }]}>
          {t.production.costOfRun}
        </Text>
        <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
          {formatMoney(118, locale)}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted }]}>
          {t.production.frozenAtRecord}
        </Text>
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink }]}>
          {fill(t.production.yields, {
            units: `${formatQuantity(rounding.rounded, locale)} un`,
          })}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
          {fill(t.production.roundedUp, {
            from: formatQuantity(1599, locale),
            boxes: formatQuantity(rounding.rounded / 50, locale),
          })}
        </Text>
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          Quantidade a enviar
        </Text>
        <UnitStepper
          hierarchy={hierarchy}
          locale={locale}
          tierLabel={tierLabel}
          value={quantity}
          onChange={setQuantity}
          labels={{ decrease: t.stepper.decrease, increase: t.stepper.increase }}
        />
      </Card>

      <Button label={t.production.register} weighty />
    </CollapsingHeader>
  );
}
