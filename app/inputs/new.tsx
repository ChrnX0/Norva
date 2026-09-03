import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { packSize } from '@/domain/measure';
import { findItem, recordPurchase, saveItem, type ItemKind } from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { fromDecimal, rate } from '@/domain/money';
import { parseTyped, formatTyped } from '@/domain/number';
import { fill, formatMoney } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Registering an input.
 *
 * The screen exists to capture one thing correctly that most systems get
 * quietly wrong: sugar is *bought* in a 25 kg sack and *used* in 350 g doses.
 * Without the conversion factor the cost is off by three orders of magnitude
 * and nothing on screen says so.
 *
 * So the person types what they actually hold - "25kg sack", "R$ 118" - and the
 * app does the division in front of them, in the hint, as they type. They
 * confirm a number instead of computing one (Law 1: never ask for what the
 * system can work out).
 */
export default function InputsScreen() {
  return (
    <AreaProvider area="mist">
      <InputForm />
    </AreaProvider>
  );
}

type Draft = {
  kind: Extract<ItemKind, 'input' | 'packaging' | 'store_supply'>;
  name: string;
  purchaseUnit: string;
  purchaseToBase: string;
  baseUnit: string;
  price: string;
  /** O nível cheio, que é a régua das faixas de cor. Vazio: o item não ganha faixa. */
  fullLevel: string;
};

/** Order only; the words are in the dictionary, keyed the same way. */
const KINDS: {
  kind: Extract<ItemKind, 'input' | 'packaging' | 'store_supply'>;
  key: 'input' | 'packaging' | 'storeSupply';
}[] = [
  { kind: 'input', key: 'input' },
  { kind: 'packaging', key: 'packaging' },
  { kind: 'store_supply', key: 'storeSupply' },
];

function InputForm() {
  const { color, type, space } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();

  /**
   * The same screen registers and corrects.
   *
   * A typo in a name used to be permanent: deleting is refused once a purchase
   * points at the row, and rightly so. One form with an id is a much smaller
   * thing to maintain than two that drift apart.
   */
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);

  const { data: existing } = useQuery(
    async () => (id ? findItem(LOCAL_COMPANY_ID, id) : null),
    id ?? '',
  );

  const [draft, setDraft] = useState<Partial<Draft> | null>(null);

  const form: Draft = {
    kind: 'input',
    name: '',
    purchaseUnit: '',
    purchaseToBase: '',
    baseUnit: 'g',
    price: '',
    fullLevel: '',
    ...(existing
      ? {
          kind: (existing.kind === 'input' ||
          existing.kind === 'packaging' ||
          existing.kind === 'store_supply'
            ? existing.kind
            : 'input') as Draft['kind'],
          name: existing.name,
          purchaseUnit: existing.purchaseUnit ?? '',
          purchaseToBase: existing.purchaseToBase
            ? formatTyped(existing.purchaseToBase, locale.formatting)
            : '',
          baseUnit: existing.baseUnit,
          fullLevel:
            existing.fullLevel !== null
              ? formatTyped(existing.fullLevel, locale.formatting)
              : '',
          // The price is not re-asked when correcting: it belongs to the
          // invoices, and re-entering it here would move the average by accident.
          //
          // And it is written with the locale's separator, because a price per
          // package is rarely round: `String(12.4)` is "12.4", which the reader
          // on this screen used to turn into 124.
          price:
            existing.averageRate > 0
              ? formatTyped(
                  (existing.averageRate * (existing.purchaseToBase ?? 1)) / 100,
                  locale.formatting,
                )
              : '',
        }
      : {}),
    ...draft,
  };

  const { kind, name, purchaseUnit, purchaseToBase, baseUnit, price, fullLevel } = form;
  const edit = (change: Partial<Draft>) => setDraft({ ...draft, ...change });

  const setKind = (next: Draft['kind']) => edit({ kind: next });
  const setName = (next: string) => edit({ name: next });
  /**
   * Typing the package fills in how much is inside it - Law 1, in the one place
   * it was most obviously broken.
   *
   * Somebody who buys sugar writes "saco 25 kg", because that is what is printed
   * on the sack, and the app then asked them for 25000. That is arithmetic the
   * system can do, and the person who should not have to do it is exactly the
   * person this product is for.
   *
   * Only ever fills a field the person has not touched, and only when the size
   * can be read with certainty: `packSize` returns null for "balde", for
   * "6 x 500 ml", and for any unit it does not know. A wrong factor here would
   * sit under every cost the item ever touches.
   */
  const [factorTyped, setFactorTyped] = useState(false);
  const setPurchaseUnit = (next: string) => {
    const deduced = factorTyped ? null : packSize(next, baseUnit);
    edit(deduced === null ? { purchaseUnit: next } : { purchaseUnit: next, purchaseToBase: String(deduced) });
  };
  const setPurchaseToBase = (next: string) => {
    setFactorTyped(true);
    edit({ purchaseToBase: next });
  };
  const setBaseUnit = (next: string) => edit({ baseUnit: next });
  const setPrice = (next: string) => edit({ price: next });
  const setFullLevel = (next: string) => edit({ fullLevel: next });

  const [saving, setSaving] = useState(false);

  // Two Number() calls: memoising them buys nothing, and hand-written memos are
  // what stop the React compiler from optimising the component at all.
  const parsed = (() => {
    // Accept both "4,72" and "4.72" - a Brazilian keyboard offers the comma.
    const num = (s: string) => parseTyped(s) ?? NaN;
    const factor = num(purchaseToBase);
    const paid = num(price);
    const valid = Number.isFinite(factor) && factor > 0 && Number.isFinite(paid) && paid > 0;
    return { factor, paid, valid, unitRate: valid ? rate(paid, factor) : null };
  })();

  /**
   * The hint that prevents the classic mistake. Showing the per-gram rate at
   * full precision is also the visible proof that the app is not rounding it
   * away - 0.472 cents per gram is a real number here, not zero.
   */
  const conversionHint = (() => {
    if (!parsed.valid || parsed.unitRate === null) return undefined;
    const perThousand = formatMoney(Math.round(parsed.unitRate * 1000), locale);
    return fill(t.app.inputForm.conversion, {
      paid: formatMoney(fromDecimal(parsed.paid), locale),
      factor: parsed.factor.toLocaleString(locale.formatting),
      perThousand,
      rate: parsed.unitRate.toFixed(4),
      unit: baseUnit,
    });
  })();

  // Correcting a name does not require re-entering a price: the price lives in
  // the invoices, and asking for it again here would move the average by accident.
  const canSave = name.trim().length > 0 && (editing ? parsed.factor > 0 : parsed.valid);

  // Not memoised: it is a click handler, and a hand-written memo here only
  // gives the compiler something it cannot preserve.
  const onSave = async () => {
    // Law 5: the error is prevented by the design, not complained about after.
    if (!canSave) return;

    const go = await confirm({
      title: editing ? t.app.inputForm.saveEdit : t.app.inputForm.confirmTitle,
      message: fill(editing ? t.app.inputForm.confirmEdit : t.app.inputForm.confirmNew, {
        name: name.trim(),
        pack: purchaseUnit || t.units.unit.one,
        factor: parsed.factor.toLocaleString(locale.formatting),
        unit: baseUnit,
        price: formatMoney(fromDecimal(parsed.paid), locale),
      }),
      cancelLabel: t.app.confirm.adjust,
    });
    if (!go) return;

    setSaving(true);
    try {
      await save();
      router.back();
    } catch (e) {
      await confirm({
        title: t.app.inputForm.failedToSave,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }

    /**
     * The price typed here is not a "price field" - it is the first invoice.
     * Recording it through the same purchase path every other purchase takes is
     * what keeps a single definition of what an item costs.
     */
    async function save() {
      const itemId = await saveItem(LOCAL_COMPANY_ID, {
        id,
        kind,
        name: name.trim(),
        purchaseUnit: purchaseUnit.trim() || null,
        purchaseToBase: parsed.factor,
        baseUnit: baseUnit.trim() || 'un',
        packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
        fullLevel: (parseTyped(fullLevel) ?? 0) > 0 ? (parseTyped(fullLevel) as number) : null,
      });

      // Only a new item carries a first invoice. Editing must never move the
      // average - that is what the purchase screen is for.
      if (editing) return;

      await recordPurchase(LOCAL_COMPANY_ID, {
        itemId,
        purchaseQuantity: 1,
        baseUnits: Math.round(parsed.factor),
        totalCents: fromDecimal(parsed.paid),
      });
    }
  };

  return (
    <CollapsingHeader
      title={editing ? name || t.app.inputForm.fallbackTitle : t.app.inputForm.newTitle}
      overline={editing ? t.app.inputForm.editOverline : t.app.inputForm.newOverline}
    >
      <Card tone="area">
        <Field
          label={t.app.inputForm.name}
          value={name}
          onChangeText={setName}
          placeholder={t.app.inputForm.namePlaceholder}
          autoFocus
        />

        <View style={{ marginTop: space.lg }}>
          <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.sm }]}>
            {t.app.inputForm.whatFor}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {KINDS.map((entry) => (
              <Button
                key={entry.kind}
                label={t.app.inputForm.kinds[entry.key]}
                variant={kind === entry.kind ? 'primary' : 'ghost'}
                onPress={() => setKind(entry.kind)}
                style={{ paddingVertical: space.sm, paddingHorizontal: space.md }}
              />
            ))}
          </View>
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
            {kind === 'input'
              ? t.app.inputForm.kindHint.input
              : kind === 'packaging'
                ? t.app.inputForm.kindHint.packaging
                : t.app.inputForm.kindHint.storeSupply}
          </Text>
        </View>
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          {t.app.inputForm.howYouBuy}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          {t.app.inputForm.howYouBuyHint}
        </Text>

        <View style={{ gap: space.lg }}>
          <Field
            label={t.app.inputForm.pack}
            value={purchaseUnit}
            onChangeText={setPurchaseUnit}
            placeholder={t.app.inputForm.packPlaceholder}
          />
          <Field
            label={t.app.inputForm.perPack}
            value={purchaseToBase}
            onChangeText={setPurchaseToBase}
            placeholder="25000"
            suffix={baseUnit}
            keyboardType="numeric"
          />
          <Field
            label={t.app.inputForm.useUnit}
            value={baseUnit}
            onChangeText={setBaseUnit}
            placeholder="g"
            hint={t.app.inputForm.useUnitHint}
          />
          {/* A régua das faixas de cor, e ela é opcional de propósito.
              Vazia, o item não ganha cor nem aviso de volume — porque sem
              referência "20%" seria um número que ninguém pode conferir. */}
          <Field
            label={t.app.inputForm.fullLevel}
            value={fullLevel}
            onChangeText={setFullLevel}
            placeholder="50000"
            suffix={baseUnit}
            keyboardType="numeric"
            hint={t.app.inputForm.fullLevelHint}
          />
          {editing ? (
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.inputForm.priceNotAsked}
            </Text>
          ) : (
            <Field
              label={t.app.inputForm.price}
              value={price}
              onChangeText={setPrice}
              placeholder="118,00"
              suffix="R$"
              keyboardType="numeric"
              hint={conversionHint}
            />
          )}
        </View>
      </Card>

      {parsed.valid && !editing ? (
        <Card tone="area">
          <Text style={[type.overline, { color: color.inkFaint }]}>{t.app.inputForm.entersAs}</Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {formatMoney(Math.round((parsed.unitRate ?? 0) * 1000), locale)}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {fill(t.app.inputForm.perThousandOf, { unit: baseUnit })}
          </Text>
          <View style={{ marginTop: space.md }}>
            <Chip signal="ok" label={t.app.inputForm.conversionOk} />
          </View>
        </Card>
      ) : (
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {t.app.inputForm.fillFirst}
          </Text>
        </Card>
      )}

      <Button
        label={
          saving
            ? t.app.inputForm.saving
            : editing
              ? t.app.inputForm.saveEdit
              : t.app.inputForm.save
        }
        onPress={() => void onSave()}
        disabled={!canSave || saving}
        weighty
      />
    </CollapsingHeader>
  );
}
