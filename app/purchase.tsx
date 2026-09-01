import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, priceSignal } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  itemCosts,
  labels as loadLabels,
  listItems,
  listProducts,
  loadRecipeGraph,
  recordPurchase,
  type ItemWithCost,
  purchaseToBaseUnits,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fromDecimal, rate, type Rate } from '@/domain/money';
import { applyCostEvent, judgePriceChange } from '@/domain/cost';
import { costPerProductUnit, costRecipe } from '@/domain/recipe';
import { fill, formatMoney, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Entering an invoice - the most valuable screen in the app per keystroke.
 *
 * "Update the price of sugar" never becomes a task here. The buyer records what
 * they paid, and the same event moves the moving average, writes the price
 * history and recalculates every recipe that uses the item. One entry, five
 * consequences, none of them typed by anybody.
 *
 * The comparison against the last invoice shows up *while the decision is still
 * open* - standing in front of the supplier - not in a report next month. Law
 * 4: warn on the date of the decision, not on the date of the problem.
 */
export default function PurchaseScreen() {
  return (
    <AreaProvider area="sage">
      <PurchaseForm />
    </AreaProvider>
  );
}

/** What one recorded invoice did to the cost of the things made from it. */
type Impact = { name: string; before: number; after: number };

function PurchaseForm() {
  const { color, type, space, accent } = useTheme();
  const confirm = useConfirm();
  const { locale, t } = useLocale();

  const { data, loading, refresh } = useQuery(
    () => listItems(LOCAL_COMPANY_ID).then((all) => all.filter((i) => i.purchaseToBase !== null)),
  );

  // Arriving from an item opens on that item, so the buyer does not hunt for
  // what they were already looking at.
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(itemId ?? null);
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [total, setTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<Impact[] | null>(null);

  const items = data ?? [];
  const selected: ItemWithCost | null =
    items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

  const draft = useMemo(() => {
    if (!selected) return null;

    const packs = num(quantity);
    const paid = num(total);
    if (!Number.isFinite(packs) || packs <= 0) return null;
    if (!Number.isFinite(paid) || paid <= 0) return null;

    // The conversion lives in one place. This screen used to do its own
    // `Math.round(packs * factor)` while the repository exported the same rule
    // to nobody: two implementations that agree today and diverge the first
    // time one of them is corrected, with nothing to say which is right.
    const baseUnits = purchaseToBaseUnits(selected, packs);
    const totalCents = fromDecimal(paid);

    // What this invoice alone costs per base unit, and where it lands the
    // average once it blends with what is already on hand.
    const thisRate = rate(paid, baseUnits);
    const after = applyCostEvent(
      { baseUnits: selected.onHandBaseUnits, averageRate: selected.averageRate },
      { kind: 'purchase', baseUnits, totalCents, at: new Date().toISOString() },
    );

    const previous = selected.lastRate;
    const change = previous && previous > 0 ? (thisRate - previous) / previous : null;

    return {
      packs,
      paid,
      // Only for the sentence that spells the conversion out loud; the maths
      // above no longer touches it.
      factor: selected.purchaseToBase ?? 1,
      baseUnits,
      totalCents,
      thisRate,
      after,
      previous,
      change,
    };
  }, [selected, quantity, total]);

  // How this price should be read, decided in one place that has a test rather
  // than by three copies of the same threshold inside the markup below.
  const verdict = draft && draft.change !== null ? judgePriceChange(draft.change) : null;

  const perPackNow = draft ? draft.paid / draft.packs : 0;
  const perPackBefore =
    selected?.lastRate && selected.purchaseToBase
      ? (selected.lastRate * selected.purchaseToBase) / 100
      : null;

  const onSave = async () => {
    if (!selected || !draft) return;

    const go = await confirm({
      title: t.app.purchase.confirmTitle,
      message: fill(t.app.purchase.confirmBody, {
        packs: formatQuantity(draft.packs, locale),
        pack: selected.purchaseUnit ?? t.units.unit.one,
        name: selected.name,
        total: formatMoney(draft.totalCents, locale),
      }),
      confirmLabel: t.app.purchase.confirmAction,
      cancelLabel: t.app.confirm.adjust,
    });
    if (!go) return;

    setSaving(true);
    try {
      setImpact(await recordAndMeasure(selected, draft.packs, draft.baseUnits, draft.totalCents, supplier));
      setTotal('');
      setQuantity('1');
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.purchase.failed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <CollapsingHeader title={t.app.purchase.title} overline={t.app.purchase.overline}>
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {t.app.purchase.openingStoreroom}
          </Text>
        </Card>
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader title={t.app.purchase.title} overline={t.app.purchase.overline}>
      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.sm }]}>
          {t.app.purchase.whatYouBought}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {items.map((item) => {
              const active = item.id === selected?.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: active ? accent : color.line,
                    backgroundColor: active ? `${accent}18` : 'transparent',
                    borderRadius: 999,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                  }}
                >
                  <Text
                    style={[
                      type.secondary,
                      { color: active ? color.ink : color.inkMuted, fontWeight: active ? '600' : '400' },
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Card>

      {selected ? (
        <Card tone="area">
          <View style={{ gap: space.lg }}>
            <Field
              label={t.app.purchase.supplier}
              value={supplier}
              onChangeText={setSupplier}
              placeholder={t.app.purchase.supplierPlaceholder}
            />
            <Field
              label={fill(t.app.purchase.howMany, {
                pack: selected.purchaseUnit ?? t.units.unit.other,
              })}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              hint={
                draft
                  ? fill(t.app.purchase.conversion, {
                      packs: formatQuantity(draft.packs, locale),
                      factor: formatQuantity(draft.factor, locale),
                      baseUnits: formatQuantity(draft.baseUnits, locale),
                      unit: selected.baseUnit,
                    })
                  : undefined
              }
            />
            <Field
              label={t.app.purchase.total}
              value={total}
              onChangeText={setTotal}
              placeholder="118,00"
              suffix="R$"
              keyboardType="numeric"
              hint={
                draft
                  ? fill(t.app.purchase.perPack, {
                      price: formatMoney(fromDecimal(perPackNow), locale),
                      pack: selected.purchaseUnit ?? t.units.unit.one,
                    })
                  : undefined
              }
            />
          </View>
        </Card>
      ) : null}

      {draft && selected ? (
        <Card tone={verdict === 'wellAbove' ? 'warning' : 'area'}>
          <Text style={[type.overline, { color: color.inkFaint }]}>{t.app.purchase.beforeClosing}</Text>

          {draft.change === null || perPackBefore === null ? (
            <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
              {t.app.purchase.firstPurchase}
            </Text>
          ) : (
            <>
              <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
                {draft.change >= 0 ? '▲' : '▼'} {(Math.abs(draft.change) * 100).toFixed(1)}%
              </Text>
              <Text style={[type.secondary, { color: color.inkMuted }]}>
                {fill(t.app.purchase.nowVsBefore, {
                  now: formatMoney(fromDecimal(perPackNow), locale),
                  before: formatMoney(fromDecimal(perPackBefore), locale),
                })}
              </Text>
              <View style={{ marginTop: space.md }}>
                {/* The verdict names the key; the dictionary writes the words.
                    Three languages, one rule, and the rule is tested. */}
                <Chip
                  signal={priceSignal(verdict)}
                  label={verdict ? t.app.purchase[verdict] : t.app.purchase.smallChange}
                />
              </View>
            </>
          )}

          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
            {fill(t.app.purchase.averageMoves, {
              name: selected.name,
              from: formatMoney(Math.round(selected.averageRate * 1_000), locale),
              to: formatMoney(Math.round(draft.after.averageRate * 1_000), locale),
              unit: selected.baseUnit,
            })}
          </Text>
        </Card>
      ) : null}

      {impact && impact.length > 0 ? (
        <Card tone="area">
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.purchase.whatItMoved}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.purchase.nobodyUpdated}
          </Text>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {impact.map((row) => (
              <View key={row.name} style={styles.row}>
                <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text
                  style={[
                    type.secondary,
                    styles.number,
                    { color: row.after > row.before ? color.warning : color.ok },
                  ]}
                >
                  {formatMoney(row.before, locale)} → {formatMoney(row.after, locale)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Button
        label={saving ? t.app.purchase.recording : t.app.purchase.record}
        onPress={() => void onSave()}
        disabled={!draft || saving}
        weighty
      />
    </CollapsingHeader>
  );
}

/**
 * Records the invoice and then measures what it did.
 *
 * The measurement is taken by costing the products before and after with the
 * same engine the recipe screen uses - not by a second formula written here,
 * which would eventually disagree with the first one.
 */
async function recordAndMeasure(
  item: ItemWithCost,
  packs: number,
  baseUnits: number,
  totalCents: ReturnType<typeof fromDecimal>,
  supplier: string,
): Promise<Impact[]> {
  const [recipesBefore, costsBefore, products, names] = await Promise.all([
    loadRecipeGraph(LOCAL_COMPANY_ID),
    itemCosts(LOCAL_COMPANY_ID),
    listProducts(LOCAL_COMPANY_ID),
    loadLabels(LOCAL_COMPANY_ID),
  ]);

  const unitCost = (costs: Record<string, Rate>) =>
    products.map((product) => {
      if (!product.recipeId || !product.yieldPerUnit) return { name: product.name, value: 0 };
      const cost = costRecipe(product.recipeId, recipesBefore, costs, names);
      return {
        name: product.name,
        value: costPerProductUnit(cost, product.yieldPerUnit, product.unitPackagingCents),
      };
    });

  const before = unitCost(costsBefore);

  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: item.id,
    supplierName: supplier.trim() || undefined,
    purchaseQuantity: packs,
    baseUnits,
    totalCents,
  });

  const after = unitCost(await itemCosts(LOCAL_COMPANY_ID));

  return before
    .map((row, index) => ({ name: row.name, before: row.value, after: after[index].value }))
    .filter((row) => row.before !== row.after);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
