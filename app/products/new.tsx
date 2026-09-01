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
import { formatMoney, formatQuantity } from '@/i18n';
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

  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

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
    if (top.perBaseUnit <= 1) return 'Só unidade solta, sem caixa nem engradado.';

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

    const words =
      kind === 'product'
        ? `${name.trim()}, feito da receita ${
            data?.recipes.find((r) => r.id === chosenRecipe)?.name ?? ''
          }, ${formatQuantity(num(perUnit), locale)} ml por unidade. ${packagingEcho}`
        : `${name.trim()}, produto de revenda. ${packagingEcho}`;

    const go = await confirm({
      title: 'Cadastrar este produto?',
      message: words,
      confirmLabel: 'Cadastrar',
      cancelLabel: 'Ajustar',
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
        title: 'Não deu para cadastrar',
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: 'Entendi',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsingHeader title="Novo produto" overline="cadastro">
      <Card tone="area">
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Picolé de morango" />

        <View style={{ marginTop: space.lg }}>
          <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.sm }]}>
            DE ONDE ELE VEM
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Segment
              label="Fabricado"
              active={kind === 'product'}
              onPress={() => setKind('product')}
            />
            <Segment
              label="Revenda"
              active={kind === 'resale'}
              onPress={() => setKind('resale')}
            />
          </View>
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
            {kind === 'product'
              ? 'O custo vem da receita e se atualiza sozinho quando um insumo muda de preço.'
              : 'O custo vem da nota de compra, pelo custo médio dos fornecedores.'}
          </Text>
        </View>
      </Card>

      {kind === 'product' ? (
        <Card tone="area">
          <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.sm }]}>
            Feito com qual receita
          </Text>

          {loading ? (
            <Text style={[type.secondary, { color: color.inkMuted }]}>Carregando…</Text>
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
              Nenhuma receita cadastrada ainda — cadastre a ficha técnica antes.
            </Text>
          )}

          <View style={{ gap: space.lg, marginTop: space.lg }}>
            <Field
              label="Quanto vai em cada unidade"
              value={perUnit}
              onChangeText={setPerUnit}
              suffix="ml"
              keyboardType="numeric"
              hint={
                costing
                  ? `Um tacho rende ${formatQuantity(costing.units, locale)} unidades.`
                  : undefined
              }
            />
            <Field
              label="Palito, embalagem e rótulo"
              value={packagingCost}
              onChangeText={setPackagingCost}
              suffix="R$ / un"
              keyboardType="numeric"
              hint="Embalagem custa por unidade, não por tacho — diluir no lote esconde a margem."
            />
          </View>
        </Card>
      ) : null}

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          Como ele é empacotado
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          O estoque conta sempre em unidade; as telas falam na sua embalagem.
        </Text>

        <View style={{ gap: space.lg }}>
          <Field
            label="Unidades por caixa"
            value={perBox}
            onChangeText={setPerBox}
            keyboardType="numeric"
          />
          <Field
            label="Caixas por engradado"
            value={perCrate}
            onChangeText={setPerCrate}
            keyboardType="numeric"
            hint={packagingEcho}
          />
        </View>
      </Card>

      {costing ? (
        <Card tone="area">
          <Text style={[type.overline, { color: color.inkFaint }]}>CUSTO POR UNIDADE</Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {formatMoney(costing.unit, locale)}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {formatMoney(costing.mixOnly, locale)} de massa +{' '}
            {formatMoney(costing.packagingCents, locale)} de embalagem
          </Text>
          <View style={{ marginTop: space.md }}>
            <Chip
              signal="neutral"
              label={`Caixa fechada: ${formatMoney(
                costing.unit * (hierarchy.tiers.find((t2) => t2.id === 'box')?.perBaseUnit ?? 1),
                locale,
              )}`}
            />
          </View>
        </Card>
      ) : null}

      <Button
        label={saving ? 'Cadastrando…' : 'Cadastrar produto'}
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
