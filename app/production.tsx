import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import {
  defaultLocationId,
  labels as loadLabels,
  listItems,
  listProducts,
  loadRecipeGraph,
  recordProduction,
  type ItemWithCost,
  type Product,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { explodeRequirements, type Recipe } from '@/domain/recipe';
import { parseTyped } from '@/domain/number';
import { fill, formatMoney, formatQuantity, joinList, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Registrar o que saiu do tacho.
 *
 * A tela é desenhada em volta de uma frase do plano: teórico pré-preenchido,
 * digitação apenas do que fugiu do padrão. Quem está de luva confirma um número
 * que já está certo na maioria das vezes; quando o tacho rende menos, corrige um
 * campo — e é justamente essa correção que vira a informação mais valiosa aqui.
 *
 * Nenhum campo nasce vazio (Lei 2) e nenhum número aparece sozinho (Lei 3): as
 * unidades vêm preenchidas com o que a ficha prevê, e quando o que saiu difere,
 * a tela diz de quanto foi a diferença antes de qualquer confirmação.
 */
export default function ProductionScreen() {
  return (
    <AreaProvider area="apricot">
      <Production />
    </AreaProvider>
  );
}

type Loaded = {
  products: Product[];
  graph: Record<string, Recipe>;
  items: ItemWithCost[];
  names: Record<string, string>;
};

/** Quantas unidades um tacho promete, pela ficha. */
function plannedUnits(recipe: Recipe, product: Product, batches: number): number {
  const net = recipe.yieldAmount * (1 - recipe.lossFraction);
  const perUnit = product.yieldPerUnit ?? 0;
  if (perUnit <= 0) return 0;
  return Math.floor((net / perUnit) * batches);
}

function Production() {
  const { color, type, space } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();

  const { data, loading, refresh } = useQuery<Loaded>(async () => {
    const [products, graph, items, names] = await Promise.all([
      listProducts(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      listItems(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
    ]);
    return { products: products.filter((p) => p.recipeId), graph, items, names };
  });

  const [productId, setProductId] = useState<string | null>(null);
  const [batchText, setBatchText] = useState('1');
  const [unitsText, setUnitsText] = useState('');
  const [unitsTyped, setUnitsTyped] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = data?.products.find((p) => p.id === productId) ?? data?.products[0] ?? null;
  const recipe = selected?.recipeId ? data?.graph[selected.recipeId] : undefined;
  const batches = Math.max(0, (parseTyped(batchText) ?? 0) || 0);

  const planned = recipe && selected ? plannedUnits(recipe, selected, batches) : 0;

  // Lei 1: o que a ficha prevê não se pergunta. Só o que fugiu dela.
  const units = unitsTyped ? Math.max(0, (parseTyped(unitsText) ?? 0) || 0) : planned;

  const draft = useMemo(() => {
    if (!selected?.recipeId || !data || !recipe || batches <= 0 || units <= 0) return null;

    const needed = explodeRequirements(selected.recipeId, batches, data.graph);
    const lines = [...needed].map(([itemId, baseUnits]) => {
      const item = data.items.find((i) => i.id === itemId);
      return {
        itemId,
        name: data.names[itemId] ?? itemId,
        baseUnits,
        unit: item?.baseUnit ?? '',
        rate: item?.averageRate ?? 0,
        held: item?.onHandBaseUnits ?? 0,
      };
    });

    const value = lines.reduce((sum, l) => sum + l.rate * l.baseUnits, 0);
    const short = lines.filter((l) => l.held < l.baseUnits);

    // Mesmo número que o livro-razão vai congelar: receita mais embalagem.
    const packaging = selected.unitPackagingCents;
    return { lines, unitCostRate: value / units + packaging, short };
  }, [selected, recipe, data, batches, units]);

  const onRecord = async () => {
    if (!selected || !draft || saving) return;

    const go = await askConfirm({
      title: t.app.production.confirmTitle,
      confirmLabel: t.app.production.confirmAction,
      message: fill(t.app.production.confirmBody, {
        units: plural(units, t.app.production.unitCount, formatQuantity(units, locale)),
        product: selected.name,
        batches: plural(batches, t.app.production.batchCount, formatQuantity(batches, locale)),
        lines: joinList(
          draft.lines.map((l) => `${formatQuantity(l.baseUnits, locale)} ${l.unit} de ${l.name}`),
          t.common.and,
        ),
        cost: formatMoney(Math.round(draft.unitCostRate), locale),
      }),
    });
    if (!go) return;

    setSaving(true);
    try {
      await recordProduction(LOCAL_COMPANY_ID, {
        productId: selected.id,
        locationId: defaultLocationId(LOCAL_COMPANY_ID),
        batches,
        unitsProduced: units,
      });
      setUnitsTyped(false);
      setUnitsText('');
      refresh();
    } catch (e) {
      await askConfirm({
        title: t.app.production.failed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!loading && (!data || data.products.length === 0)) {
    return (
      <CollapsingHeader title={t.app.production.title} overline={t.app.production.overline}>
        <Card>
          <Text style={[type.body, { color: color.inkMuted }]}>{t.app.production.noRecipes}</Text>
        </Card>
      </CollapsingHeader>
    );
  }

  const missed = planned > 0 && units > 0 && units !== planned;

  return (
    <CollapsingHeader title={t.app.production.title} overline={t.app.production.overline}>
      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          {t.app.production.pick}
        </Text>
        {(data?.products ?? []).map((p) => {
          const active = p.id === selected?.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setProductId(p.id)}
              accessibilityRole="button"
              accessibilityLabel={p.name}
              style={[styles.row, { paddingVertical: space.sm }]}
            >
              <Text style={[type.body, { color: active ? color.ink : color.inkMuted, flex: 1 }]}>
                {active ? '● ' : '○ '}
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <View style={{ gap: space.lg }}>
          <Field
            label={t.app.production.batches}
            value={batchText}
            onChangeText={setBatchText}
            keyboardType="numeric"
            hint={t.app.production.batchesHint}
          />
          <Field
            label={t.app.production.units}
            value={unitsTyped ? unitsText : planned > 0 ? String(planned) : ''}
            onChangeText={(next) => {
              setUnitsTyped(true);
              setUnitsText(next);
            }}
            keyboardType="numeric"
            hint={
              planned > 0
                ? fill(t.app.production.expected, { units: formatQuantity(planned, locale) })
                : t.app.production.unitsHint
            }
          />
          {missed ? (
            <Chip
              signal={units < planned ? 'warning' : 'ok'}
              label={fill(
                units < planned ? t.app.production.shortfall : t.app.production.over,
                {
                  units: plural(
                    Math.abs(planned - units),
                    t.app.production.unitCount,
                    formatQuantity(Math.abs(planned - units), locale),
                  ),
                  percent: String(Math.round((Math.abs(planned - units) / planned) * 100)),
                },
              )}
            />
          ) : null}
        </View>
      </Card>

      {draft ? (
        <Card tone={draft.short.length > 0 ? 'warning' : 'area'}>
          <Text style={[type.cardTitle, { color: color.ink }]}>
            {t.app.production.willConsume}
          </Text>
          <View style={{ marginTop: space.md, gap: space.xs }}>
            {draft.lines.map((l) => (
              <View key={l.itemId} style={styles.row}>
                <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                  {formatQuantity(l.baseUnits, locale)} {l.unit}
                </Text>
              </View>
            ))}
          </View>

          {draft.short.length > 0 ? (
            <Text style={[type.caption, { color: color.warning, marginTop: space.md }]}>
              {fill(t.app.production.missingStock, {
                items: draft.short.map((l) => l.name).join(', '),
              })}
            </Text>
          ) : null}

          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.lg }]}>
            {t.app.production.unitCost}
          </Text>
          <Text style={[type.figure, { color: color.ink }]}>
            {formatMoney(Math.round(draft.unitCostRate), locale)}
          </Text>
        </Card>
      ) : null}

      <Button
        label={saving ? t.app.production.recording : t.app.production.record}
        onPress={onRecord}
        disabled={!draft || saving}
      />
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});
