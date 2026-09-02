import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  itemCosts,
  labels as loadLabels,
  listRecipes,
  loadRecipeGraph,
  saveProduct,
  type RecipeSummary,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fromDecimal } from '@/domain/money';
import { costPerProductUnit, costRecipe, unitsPerBatch, type ItemCosts, type Recipe } from '@/domain/recipe';
import { type PackagingHierarchy } from '@/domain/units';
import { parseTyped } from '@/domain/number';
import { fill, formatMoney, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Registering a product.
 *
 * Two things separate this from a plain "name and price" form, and both come
 * from the research into where the category leader loses its users:
 *
 *   - batch yield is not the product. A recipe yields 40 litres of mix; the
 *     product is 75 ml of it. Keeping the two apart is what lets the same mix
 *     become a popsicle, a 2L tub and a small cup without a second recipe.
 *   - the packaging hierarchy is the customer's, not ours. Unit -> box -> crate
 *     here; the next customer stacks unit -> pack -> bale. So it is typed, not
 *     hardcoded, and the app echoes the arithmetic back in words.
 */
export default function ProductsScreen() {
  return (
    <AreaProvider area="mist">
      <ProductForm />
    </AreaProvider>
  );
}

type Kind = 'product' | 'resale';

type Loaded = {
  recipes: RecipeSummary[];
  graph: Record<string, Recipe>;
  costs: ItemCosts;
  labels: Record<string, string>;
};

function ProductForm() {
  const { color, type, space } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<Loaded>(async () => {
    const [recipes, graph, costs, labels] = await Promise.all([
      listRecipes(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
    ]);
    return { recipes, graph, costs, labels };
  });

  const [kind, setKind] = useState<Kind>('product');
  const [name, setName] = useState('');
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [perUnit, setPerUnit] = useState('75');
  const [packagingCost, setPackagingCost] = useState('0,05');
  const [perBox, setPerBox] = useState('50');
  const [perCrate, setPerCrate] = useState('6');
  const [saving, setSaving] = useState(false);

  const num = (s: string) => parseTyped(s) ?? NaN;

  const chosenRecipe = recipeId ?? data?.recipes[0]?.id ?? null;

  const hierarchy = useMemo<PackagingHierarchy>(() => {
    const box = Math.round(num(perBox));
    const crate = Math.round(num(perCrate));
    const tiers = [{ id: 'unit', perBaseUnit: 1 }];
    if (Number.isFinite(box) && box > 1) tiers.push({ id: 'box', perBaseUnit: box });
    if (Number.isFinite(crate) && crate > 1 && tiers.length > 1) {
      tiers.push({ id: 'crate', perBaseUnit: box * crate });
    }
    return { tiers };
  }, [perBox, perCrate]);

  /**
   * The echo that removes the mental arithmetic: "1 engradado = 6 caixas =
   * 300 unidades". Miscounts in a cold room come from doing this in the head.
   */
  const packagingEcho = useMemo(() => {
    const top = hierarchy.tiers[hierarchy.tiers.length - 1];
    if (top.perBaseUnit <= 1) return t.app.productForm.looseOnly;

    // One of the largest tier, expressed at every level below it.
    return [...hierarchy.tiers]
      .reverse()
      .map((tier) => {
        const count = top.perBaseUnit / tier.perBaseUnit;
        const entry = t.units[tier.id as keyof typeof t.units];
        const word = entry ? (count === 1 ? entry.one : entry.other) : tier.id;
        return `${formatQuantity(count, locale)} ${word}`;
      })
      .join(' = ');
  }, [hierarchy, locale, t]);

  const costing = useMemo(() => {
    if (kind === 'resale' || !data || !chosenRecipe) return null;

    const portion = num(perUnit);
    if (!Number.isFinite(portion) || portion <= 0) return null;

    const packagingCents = fromDecimal(num(packagingCost) || 0);
    const cost = costRecipe(chosenRecipe, data.graph, data.costs, data.labels);
    const unit = costPerProductUnit(cost, portion, packagingCents);
    const units = unitsPerBatch(cost, portion);

    return { cost, unit, units, packagingCents, mixOnly: costPerProductUnit(cost, portion) };
  }, [kind, data, chosenRecipe, perUnit, packagingCost]);

  const canSave =
    name.trim().length > 0 && (kind === 'resale' || (chosenRecipe !== null && num(perUnit) > 0));

  const onSave = async () => {
    if (!canSave) return;

    const words = fill(
      kind === 'product' ? t.app.productForm.confirmMade : t.app.productForm.confirmResale,
      {
        name: name.trim(),
        recipe: data?.recipes.find((r) => r.id === chosenRecipe)?.name ?? '',
        perUnit: formatQuantity(num(perUnit), locale),
        packaging: packagingEcho,
      },
    );

    const go = await confirm({
      title: t.app.productForm.confirmTitle,
      message: words,
      confirmLabel: t.app.productForm.confirmAction,
      cancelLabel: t.app.confirm.adjust,
    });
    if (!go) return;

    setSaving(true);
    try {
      await saveProduct(LOCAL_COMPANY_ID, {
        name: name.trim(),
        kind,
        recipeId: kind === 'product' ? chosenRecipe : null,
        yieldPerUnit: kind === 'product' ? num(perUnit) : null,
        unitPackagingCents: fromDecimal(num(packagingCost) || 0),
        packaging: hierarchy,
      });
      router.back();
    } catch (e) {
      await confirm({
        title: t.app.productForm.failed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsingHeader title={t.app.productForm.title} overline={t.app.productForm.overline}>
      <Card tone="area">
        <Field
          label={t.app.productForm.name}
          value={name}
          onChangeText={setName}
          placeholder={t.app.productForm.namePlaceholder}
        />

        <View style={{ marginTop: space.lg }}>
          <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.sm }]}>
            {t.app.productForm.whereFrom}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Segment
              label={t.app.productForm.made}
              active={kind === 'product'}
              onPress={() => setKind('product')}
            />
            <Segment
              label={t.app.productForm.resale}
              active={kind === 'resale'}
              onPress={() => setKind('resale')}
            />
          </View>
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
            {kind === 'product' ? t.app.productForm.madeHint : t.app.productForm.resaleHint}
          </Text>
        </View>
      </Card>

      {kind === 'product' ? (
        <Card tone="area">
          <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.sm }]}>
            {t.app.productForm.whichRecipe}
          </Text>

          {loading ? (
            <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.productForm.loading}</Text>
          ) : data && data.recipes.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {data.recipes.map((recipe) => (
                  <Segment
                    key={recipe.id}
                    label={recipe.name}
                    active={recipe.id === chosenRecipe}
                    onPress={() => setRecipeId(recipe.id)}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.productForm.noRecipes}
            </Text>
          )}

          <View style={{ gap: space.lg, marginTop: space.lg }}>
            <Field
              label={t.app.productForm.perUnit}
              value={perUnit}
              onChangeText={setPerUnit}
              suffix="ml"
              keyboardType="numeric"
              hint={
                costing
                  ? fill(t.app.productForm.perUnitHint, {
                      units: formatQuantity(costing.units, locale),
                    })
                  : undefined
              }
            />
            <Field
              label={t.app.productForm.packagingCost}
              value={packagingCost}
              onChangeText={setPackagingCost}
              suffix="R$ / un"
              keyboardType="numeric"
              hint={t.app.productForm.packagingHint}
            />
          </View>
        </Card>
      ) : null}

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          {t.app.productForm.howPacked}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          {t.app.productForm.howPackedHint}
        </Text>

        <View style={{ gap: space.lg }}>
          <Field
            label={t.app.productForm.perBox}
            value={perBox}
            onChangeText={setPerBox}
            keyboardType="numeric"
          />
          <Field
            label={t.app.productForm.perCrate}
            value={perCrate}
            onChangeText={setPerCrate}
            keyboardType="numeric"
            hint={packagingEcho}
          />
        </View>
      </Card>

      {costing ? (
        <Card tone="area">
          <Text style={[type.overline, { color: color.inkFaint }]}>{t.app.productForm.unitCost}</Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {formatMoney(costing.unit, locale)}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {fill(t.app.productForm.mixPlusPackaging, {
              mix: formatMoney(costing.mixOnly, locale),
              packaging: formatMoney(costing.packagingCents, locale),
            })}
          </Text>
          <View style={{ marginTop: space.md }}>
            <Chip
              signal="neutral"
              label={fill(t.app.productForm.fullBox, {
                amount: formatMoney(
                  costing.unit * (hierarchy.tiers.find((t2) => t2.id === 'box')?.perBaseUnit ?? 1),
                  locale,
                ),
              })}
            />
          </View>
        </Card>
      ) : null}

      <Button
        label={saving ? t.app.productForm.saving : t.app.productForm.save}
        onPress={() => void onSave()}
        disabled={!canSave || saving}
        weighty
      />
    </CollapsingHeader>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { color, type, space, accent } = useTheme();
  return (
    <Pressable
      onPress={onPress}
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
        {label}
      </Text>
    </Pressable>
  );
}
