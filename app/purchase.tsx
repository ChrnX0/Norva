import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
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
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fromDecimal, rate, type Rate } from '@/domain/money';
import { applyCostEvent } from '@/domain/cost';
import { costPerProductUnit, costRecipe } from '@/domain/recipe';
import { defaultLocale, formatMoney, formatQuantity } from '@/i18n';
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
  const locale = defaultLocale;

  const { data, loading, refresh } = useQuery(
    () => listItems(LOCAL_COMPANY_ID).then((all) => all.filter((i) => i.purchaseToBase !== null)),
    [],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    const factor = selected.purchaseToBase ?? 1;
    if (!Number.isFinite(packs) || packs <= 0) return null;
    if (!Number.isFinite(paid) || paid <= 0) return null;

    const baseUnits = Math.round(packs * factor);
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

    return { packs, paid, factor, baseUnits, totalCents, thisRate, after, previous, change };
  }, [selected, quantity, total]);

  const perPackNow = draft ? draft.paid / draft.packs : 0;
  const perPackBefore =
    selected?.lastRate && selected.purchaseToBase
      ? (selected.lastRate * selected.purchaseToBase) / 100
      : null;

  const onSave = () => {
    if (!selected || !draft) return;

    const words =
      `${formatQuantity(draft.packs, locale)} × ${selected.purchaseUnit ?? 'unidade'} de ` +
      `${selected.name}, por ${formatMoney(draft.totalCents, locale)}.`;

    Alert.alert('Lançar esta compra?', words, [
      { text: 'Ajustar', style: 'cancel' },
      {
        text: 'Lançar',
        onPress: () => {
          setSaving(true);
          void recordAndMeasure(selected, draft.packs, draft.baseUnits, draft.totalCents, supplier)
            .then((result) => {
              setImpact(result);
              setTotal('');
              setQuantity('1');
              refresh();
            })
            .catch((e: unknown) =>
              Alert.alert('Não deu para lançar', e instanceof Error ? e.message : String(e)),
            )
            .finally(() => setSaving(false));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <CollapsingHeader title="Nova compra" overline="compras">
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>Abrindo o almoxarifado…</Text>
        </Card>
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader title="Nova compra" overline="compras · a nota move o custo">
      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.sm }]}>
          O que você comprou
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
              label="Fornecedor"
              value={supplier}
              onChangeText={setSupplier}
              placeholder="quem vendeu"
            />
            <Field
              label={`Quantas ${selected.purchaseUnit ?? 'unidades'}`}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              hint={
                draft
                  ? `${formatQuantity(draft.packs, locale)} × ${formatQuantity(
                      draft.factor,
                      locale,
                    )} = ${formatQuantity(draft.baseUnits, locale)} ${selected.baseUnit} entrando no estoque.`
                  : undefined
              }
            />
            <Field
              label="Total da nota"
              value={total}
              onChangeText={setTotal}
              placeholder="118,00"
              suffix="R$"
              keyboardType="numeric"
              hint={
                draft
                  ? `${formatMoney(fromDecimal(perPackNow), locale)} por ${selected.purchaseUnit ?? 'unidade'}`
                  : undefined
              }
            />
          </View>
        </Card>
      ) : null}

      {draft && selected ? (
        <Card tone={draft.change !== null && draft.change > 0.05 ? 'warning' : 'area'}>
          <Text style={[type.overline, { color: color.inkFaint }]}>ANTES DE FECHAR</Text>

          {draft.change === null || perPackBefore === null ? (
            <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
              Primeira compra deste item. A próxima já vem com a comparação.
            </Text>
          ) : (
            <>
              <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
                {draft.change >= 0 ? '▲' : '▼'} {(Math.abs(draft.change) * 100).toFixed(1)}%
              </Text>
              <Text style={[type.secondary, { color: color.inkMuted }]}>
                {formatMoney(fromDecimal(perPackNow), locale)} agora ·{' '}
                {formatMoney(fromDecimal(perPackBefore), locale)} na compra anterior
              </Text>
              <View style={{ marginTop: space.md }}>
                <Chip
                  signal={draft.change > 0.05 ? 'warning' : draft.change < -0.02 ? 'ok' : 'neutral'}
                  label={
                    draft.change > 0.05
                      ? 'Subiu bem acima do normal'
                      : draft.change < -0.02
                        ? 'Está mais barato que da última vez'
                        : 'Variação pequena'
                  }
                />
              </View>
            </>
          )}

          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
            O custo médio de {selected.name} passa de{' '}
            {formatMoney(Math.round(selected.averageRate * 1_000), locale)} para{' '}
            {formatMoney(Math.round(draft.after.averageRate * 1_000), locale)} a cada 1.000{' '}
            {selected.baseUnit}.
          </Text>
        </Card>
      ) : null}

      {impact && impact.length > 0 ? (
        <Card tone="area">
          <Text style={[type.cardTitle, { color: color.ink }]}>O que essa nota mexeu</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            Ninguém precisou atualizar preço nenhum.
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
        label={saving ? 'Lançando…' : 'Lançar compra'}
        onPress={onSave}
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
