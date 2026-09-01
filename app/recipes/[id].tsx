import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { WhySheet } from '@/components/WhySheet';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import {
  itemCosts,
  labels as loadLabels,
  listItems,
  listProducts,
  loadRecipeGraph,
  saveRecipeVersion,
} from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import type { Cents } from '@/domain/money';
import {
  compareVersions,
  costPerProductUnit,
  costRecipe,
  MissingRecipeError,
  RecipeCycleError,
  unitsPerBatch,
  type ItemCosts,
  type Recipe,
  type RecipeLine,
} from '@/domain/recipe';
import { roundUpToFullContainer } from '@/domain/units';
import { defaultLocale, formatMoney, formatQuantity } from '@/i18n';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * The recipe editor - the screen the whole product is built to make possible.
 *
 * Cost recalculates on every keystroke, because the question an owner actually
 * has is not "what did this cost" but "what happens if I change this". Making
 * that wait for a save button turns exploration into paperwork.
 *
 * Every number here is deterministic arithmetic over `src/domain/recipe.ts`,
 * which is what lets `[por quê?]` open the calculation instead of asserting it.
 */
export default function RecipeScreen() {
  return (
    <AreaProvider area="apricot">
      <RecipeEditor />
    </AreaProvider>
  );
}

/** The parts of the editor that come from the database and never change here. */
type Loaded = {
  recipes: Record<string, Recipe>;
  costs: ItemCosts;
  labels: Record<string, string>;
  items: { id: string; name: string; baseUnit: string }[];
  /** How much of the batch becomes one sellable unit, if a product says so. */
  yieldPerUnit: number | null;
  unitPackagingCents: Cents;
  packaging: { id: string; perBaseUnit: number }[];
};

/** The id the edited draft holds in the graph while it is being changed. */
const DRAFT = '__draft__';

/** An edit in progress, tied to the recipe it belongs to. */
type Draft = {
  recipeId: string;
  lines: RecipeLine[];
  lossPercent: string;
  yieldAmount: string;
  perUnit: string;
};

function RecipeEditor() {
  const { color, type, space, accent } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const locale = defaultLocale;
  const params = useLocalSearchParams<{ id?: string }>();

  const { data, loading } = useQuery<Loaded>(async () => {
    const [recipes, costs, labels, items, products] = await Promise.all([
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
      listItems(LOCAL_COMPANY_ID),
      listProducts(LOCAL_COMPANY_ID),
    ]);

    const recipeId = params.id ?? Object.keys(recipes)[0];
    const product = products.find((p) => p.recipeId === recipeId);

    return {
      recipes,
      costs,
      labels,
      items: items
        .filter((i) => i.kind === 'input' || i.kind === 'packaging')
        .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit })),
      yieldPerUnit: product?.yieldPerUnit ?? null,
      unitPackagingCents: (product?.unitPackagingCents ?? 0) as Cents,
      packaging: product?.packaging.tiers ?? [{ id: 'unit', perBaseUnit: 1 }],
    };
  }, params.id ?? '');

  const recipeId = params.id ?? (data ? Object.keys(data.recipes)[0] : undefined);
  const stored = recipeId && data ? data.recipes[recipeId] : undefined;

  const [whyOpen, setWhyOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * The form is derived from what is stored, not copied into state when the
   * screen mounts. An edit produces a draft that stands in front of it, and the
   * draft remembers which recipe it belongs to - so opening a different one
   * shows that recipe rather than the last one's numbers, which is what a
   * copy-on-mount quietly got wrong.
   *
   * Law 2 either way: no field is born empty.
   */
  const [draft, setDraft] = useState<Draft | null>(null);

  const form: Draft | null =
    draft && draft.recipeId === recipeId
      ? draft
      : stored && recipeId
        ? {
            recipeId,
            lines: stored.lines,
            // A percentage for a text field, not money. proofgate-allow
            lossPercent: String(Number((stored.lossFraction * 100).toFixed(2))),
            yieldAmount: String(stored.yieldAmount),
            perUnit: data?.yieldPerUnit ? String(data.yieldPerUnit) : '',
          }
        : null;

  const edit = (change: Partial<Omit<Draft, 'recipeId'>>) => {
    if (!form) return;
    setDraft({ ...form, ...change });
  };

  const lossPercent = form?.lossPercent ?? '';
  const yieldAmount = form?.yieldAmount ?? '';
  const perUnit = form?.perUnit ?? '';
  const lines = form?.lines ?? null;

  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

  const computed = useMemo(() => {
    if (!data || !stored || !lines) return null;

    const yieldValue = num(yieldAmount);
    const loss = num(lossPercent) / 100;
    const portion = num(perUnit);

    if (!Number.isFinite(yieldValue) || yieldValue <= 0) {
      return { error: 'Informe quanto o tacho rende.' as string, cost: null };
    }
    if (!Number.isFinite(loss) || loss < 0 || loss >= 1) {
      return { error: 'A perda tem de ficar entre 0% e 100%.' as string, cost: null };
    }

    // The draft is costed inside the real graph, so a sub-recipe of the recipe
    // being edited still resolves against what is actually saved.
    const graph: Record<string, Recipe> = {
      ...data.recipes,
      [DRAFT]: {
        id: DRAFT,
        version: stored.version + 1,
        effectiveFrom: stored.effectiveFrom,
        yieldAmount: yieldValue,
        lossFraction: loss,
        lines,
      },
    };

    try {
      const cost = costRecipe(DRAFT, graph, data.costs, data.labels);
      const before = costRecipe(recipeId!, data.recipes, data.costs, data.labels);

      const hasPortion = Number.isFinite(portion) && portion > 0;
      const unitCents = hasPortion
        ? costPerProductUnit(cost, portion, data.unitPackagingCents)
        : null;
      const units = hasPortion ? unitsPerBatch(cost, portion) : 0;
      const boxTier = data.packaging.find((t) => t.perBaseUnit > 1);
      const rounding =
        units > 0 && boxTier
          ? roundUpToFullContainer(units, { tiers: data.packaging }, boxTier.id)
          : null;

      // Law 3: no number appears alone. The comparison against what is saved is
      // the answer to "did my change help", asked while the change is still open.
      const delta = hasPortion ? compareVersions(before, cost, portion) : null;

      return { error: null, cost, before, unitCents, units, rounding, delta, boxTier };
    } catch (e) {
      if (e instanceof RecipeCycleError) {
        return { error: `Essa receita contém a si mesma: ${e.path.join(' → ')}`, cost: null };
      }
      if (e instanceof MissingRecipeError) {
        return { error: `Sub-receita não encontrada: ${e.recipeId}`, cost: null };
      }
      throw e;
    }
  }, [data, stored, lines, lossPercent, yieldAmount, perUnit, recipeId]);

  const changed = useMemo(() => {
    if (!stored || !lines) return false;
    return (
      JSON.stringify(lines) !== JSON.stringify(stored.lines) ||
      num(yieldAmount) !== stored.yieldAmount ||
      Math.abs(num(lossPercent) / 100 - stored.lossFraction) > 1e-9
    );
  }, [stored, lines, yieldAmount, lossPercent]);

  const onSave = async () => {
    if (!stored || !lines || !recipeId || computed?.error) return;

    const summary = computed?.delta
      ? computed.delta.deltaCents === 0
        ? 'O custo por unidade não muda.'
        : `${computed.delta.cheaper ? 'Fica' : 'Sobe'} ${formatMoney(
            Math.abs(computed.delta.deltaCents),
            locale,
          )} por unidade em relação à versão ${stored.version}.`
      : '';

    // Law 5: the confirmation spells out what is about to happen, in words.
    const go = await confirm({
      title: `Salvar versão ${stored.version + 1}?`,
      message: `A versão ${stored.version} continua guardada — as produções antigas mantêm o custo delas. ${summary}`,
      confirmLabel: 'Salvar',
      cancelLabel: 'Continuar editando',
    });
    if (!go) return;

    setSaving(true);
    try {
      await saveRecipeVersion(LOCAL_COMPANY_ID, {
        recipeId,
        name: data?.labels[recipeId] ?? 'Receita',
        yieldAmount: num(yieldAmount),
        yieldUnit: 'ml',
        lossFraction: num(lossPercent) / 100,
        lines,
      });
      router.back();
    } catch (e) {
      await confirm({
        title: 'Não deu para salvar',
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: 'Entendi',
      });
    } finally {
      setSaving(false);
    }
  };

  const setQuantity = (index: number, next: number) =>
    edit({
      lines: (lines ?? []).map((l, i) =>
        i === index ? { ...l, quantity: Math.max(0, Math.round(next)) } : l,
      ),
    });

  const removeLine = (index: number) => edit({ lines: (lines ?? []).filter((_, i) => i !== index) });

  const addItem = (itemId: string) =>
    edit({ lines: [...(lines ?? []), { kind: 'item', itemId, quantity: 1_000 }] });

  const title = recipeId && data ? (data.labels[recipeId] ?? 'Receita') : 'Receita';

  if (loading || !data || !stored || !lines) {
    return (
      <CollapsingHeader title="Receita" overline="ficha técnica">
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {loading ? 'Abrindo a ficha…' : 'Nenhuma receita cadastrada ainda.'}
          </Text>
        </Card>
      </CollapsingHeader>
    );
  }

  const inRecipe = new Set(lines.map((l) => (l.kind === 'item' ? l.itemId : l.recipeId)));
  const available = data.items.filter((i) => !inRecipe.has(i.id));

  return (
    <CollapsingHeader title={title} overline={`ficha técnica · versão ${stored.version}`}>
      {computed?.error ? (
        <Card tone="danger">
          <Text style={[type.cardTitle, { color: color.danger }]}>Falta um dado</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {computed.error}
          </Text>
        </Card>
      ) : null}

      {computed?.cost ? (
        <Card tone="area">
          <Text style={[type.overline, { color: color.inkFaint }]}>CUSTO POR UNIDADE</Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {computed.unitCents === null ? '—' : formatMoney(computed.unitCents, locale)}
          </Text>

          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {computed.unitCents === null
              ? 'Informe quantos ml vão em cada unidade.'
              : `${formatQuantity(computed.units, locale)} unidades por tacho · lote de ${formatMoney(
                  computed.cost.batchCents,
                  locale,
                )}`}
          </Text>

          {computed.delta && changed && computed.delta.deltaCents !== 0 ? (
            <Text
              style={[
                type.secondary,
                {
                  color: computed.delta.cheaper ? color.ok : color.warning,
                  marginTop: space.sm,
                  fontWeight: '600',
                },
              ]}
            >
              {computed.delta.cheaper ? '▼' : '▲'}{' '}
              {formatMoney(Math.abs(computed.delta.deltaCents), locale)} por unidade contra a versão{' '}
              {stored.version} ({(Math.abs(computed.delta.percent) * 100).toFixed(1)}%)
            </Text>
          ) : null}

          {computed.rounding && computed.rounding.addedUnits > 0 ? (
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
              Produza {formatQuantity(computed.rounding.rounded, locale)} para fechar caixa cheia —
              sobram {formatQuantity(computed.units % (computed.boxTier?.perBaseUnit ?? 1), locale)}{' '}
              soltas em {formatQuantity(computed.units, locale)}.
            </Text>
          ) : null}

          <Pressable
            onPress={() => setWhyOpen(true)}
            accessibilityRole="button"
            style={[styles.why, { borderColor: color.lineStrong, marginTop: space.md }]}
          >
            <Text style={[type.caption, { color: accent, letterSpacing: 0.6 }]}>POR QUÊ?</Text>
          </Pressable>
        </Card>
      ) : null}

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          O que entra no tacho
        </Text>

        {lines.map((line, index) => {
          const id = line.kind === 'item' ? line.itemId : line.recipeId;
          const label = data.labels[id] ?? id;
          const share = computed?.cost?.lines[index]?.share ?? 0;
          const lineCost = computed?.cost?.lines[index]?.totalCents ?? 0;

          return (
            <View key={`${id}-${index}`} style={{ marginBottom: space.lg }}>
              <View style={styles.lineRow}>
                <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {label}
                  {line.kind === 'recipe' ? ' ·  sub-receita' : ''}
                </Text>
                <Text style={[type.body, styles.number, { color: color.ink }]}>
                  {formatMoney(lineCost, locale)}
                </Text>
              </View>

              <View style={[styles.track, { backgroundColor: color.sunken }]}>
                <View
                  style={{
                    width: `${Math.max(1, Math.round(share * 100))}%`,
                    height: '100%',
                    backgroundColor: accent,
                    borderRadius: 99,
                  }}
                />
              </View>

              <View style={[styles.lineRow, { marginTop: space.sm, gap: space.sm }]}>
                <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>
                  {formatQuantity(line.quantity, locale)} · {Math.round(share * 100)}% do lote
                </Text>
                <Nudge label="−10%" onPress={() => setQuantity(index, line.quantity * 0.9)} />
                <Nudge label="+10%" onPress={() => setQuantity(index, line.quantity * 1.1)} />
                <Nudge label="tirar" onPress={() => removeLine(index)} />
              </View>
            </View>
          );
        })}

        {available.length > 0 ? (
          <>
            <Text style={[type.caption, { color: color.inkFaint, marginBottom: space.sm }]}>
              ACRESCENTAR
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {available.map((item) => (
                  <Nudge key={item.id} label={`+ ${item.name}`} onPress={() => addItem(item.id)} />
                ))}
              </View>
            </ScrollView>
          </>
        ) : null}
      </Card>

      <Card tone="area">
        <View style={{ gap: space.lg }}>
          <Field
            label="Rendimento do tacho"
            value={yieldAmount}
            onChangeText={(value) => edit({ yieldAmount: value })}
            suffix="ml"
            keyboardType="numeric"
          />
          <Field
            label="Perda esperada"
            value={lossPercent}
            onChangeText={(value) => edit({ lossPercent: value })}
            suffix="%"
            keyboardType="numeric"
            hint={
              computed?.cost
                ? `Sobram ${formatQuantity(computed.cost.netYield, locale)} ml de ${formatQuantity(
                    num(yieldAmount),
                    locale,
                  )}. O lote é pago inteiro, então a perda encarece o que sobra.`
                : undefined
            }
          />
          <Field
            label="Vai em cada unidade"
            value={perUnit}
            onChangeText={(value) => edit({ perUnit: value })}
            suffix="ml"
            keyboardType="numeric"
            hint={
              data.unitPackagingCents > 0
                ? `Mais ${formatMoney(data.unitPackagingCents, locale)} de palito e embalagem por unidade.`
                : undefined
            }
          />
        </View>
      </Card>

      <Button
        label={saving ? 'Salvando…' : `Salvar como versão ${stored.version + 1}`}
        onPress={() => void onSave()}
        disabled={!changed || saving || Boolean(computed?.error)}
        weighty
      />

      {computed?.cost ? (
        <WhySheet
          visible={whyOpen}
          onClose={() => setWhyOpen(false)}
          cost={computed.cost}
          locale={locale}
          title={title}
        />
      ) : null}
    </CollapsingHeader>
  );
}

function Nudge({ label, onPress }: { label: string; onPress: () => void }) {
  const { color, type, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: color.lineStrong,
        borderRadius: 999,
        paddingHorizontal: space.md,
        paddingVertical: space.sm - 2,
      }}
    >
      <Text style={[type.caption, { color: color.inkMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lineRow: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  track: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 6 },
  why: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
