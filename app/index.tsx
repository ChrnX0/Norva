import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { CountUp } from '@/components/CountUp';
import { PulseDot } from '@/components/PulseDot';
import { brand } from '@/config/brand';
import {
  itemCosts,
  labels as loadLabels,
  listProducts,
  loadRecipeGraph,
  recentCostChanges,
  type CostChange,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { costPerProductUnit, costRecipe } from '@/domain/recipe';
import { formatMoney } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { palettes, type Ambient } from '@/theme/tokens';
import type { Dictionary } from '@/i18n';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * The home screen.
 *
 * A dashboard shows totals; a briefing says what moved and what to do about it.
 * The owner already knows roughly how much stock is in the cold room - what
 * they cannot know without this app is that pulp went up 9% on Tuesday and took
 * three cents a unit with it.
 *
 * So nothing here is a bare number: every figure carries the consequence next
 * to it, and every line leads to the screen that resolves it. "Everything is
 * steady" is a valid, well-drawn state - invented alerts teach people to ignore
 * alerts.
 */
export default function Home() {
  return (
    <AreaProvider area="sky">
      <Briefing />
    </AreaProvider>
  );
}

type ProductCost = { id: string; name: string; recipeId: string | null; unitCents: number };

type Summary = { products: ProductCost[]; changes: CostChange[] };

/** The wording lives in the dictionary; only the colour and route are here. */
const AREAS: { area: Ambient; key: keyof Dictionary['app']['home']['nav']; route: string }[] = [
  { area: 'sky', key: 'ask', route: '/assistant' },
  { area: 'mist', key: 'inputs', route: '/inputs' },
  { area: 'apricot', key: 'recipes', route: '/recipes' },
  { area: 'mist', key: 'products', route: '/products' },
  { area: 'sage', key: 'purchases', route: '/purchase' },
  { area: 'mist', key: 'settings', route: '/settings' },
];

function Briefing() {
  const { color, scheme, type, space } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<Summary | null>(async () => {
    const [products, graph, costs, names, changes] = await Promise.all([
      listProducts(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
      recentCostChanges(LOCAL_COMPANY_ID, 4),
    ]);

    return {
      changes,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        recipeId: product.recipeId,
        unitCents:
          product.recipeId && product.yieldPerUnit
            ? costPerProductUnit(
                costRecipe(product.recipeId, graph, costs, names),
                product.yieldPerUnit,
                product.unitPackagingCents,
              )
            : 0,
      })),
    };
  });

  const palette = palettes[scheme];
  const moved = (data?.changes ?? []).filter(
    (c) => c.previousRate !== null && c.previousRate !== c.newRate,
  );

  return (
    <CollapsingHeader title={brand.name} overline={t.app.home.overline}>
      {data?.products.map((product) => (
        <Pressable
          key={product.id}
          onPress={() =>
            router.push(
              product.recipeId ? `/recipes/${product.recipeId}` : '/products',
            )
          }
          accessibilityRole="button"
        >
          <Card tone="area">
            <View style={[styles.row, { gap: space.sm }]}>
              <PulseDot />
              <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                {product.name}
              </Text>
            </View>
            <CountUp
              value={product.unitCents}
              format={(v) => formatMoney(Math.round(v), locale)}
              style={{ ...type.figure, color: color.ink, marginTop: space.xs }}
            />
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.home.unitCost}
            </Text>
          </Card>
        </Pressable>
      ))}

      <Card tone={moved.length > 0 ? 'warning' : 'area'}>
        <Text style={[type.cardTitle, { color: color.ink }]}>
          {moved.length > 0 ? t.app.home.changed : t.app.home.steady}
        </Text>

        {moved.length === 0 ? (
          <>
            <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
              {loading ? t.app.home.checking : t.app.home.steadyDetail}
            </Text>
            {!loading ? (
              <View style={{ marginTop: space.md }}>
                <Chip signal="ok" label={t.app.home.allSteady} />
              </View>
            ) : null}
          </>
        ) : (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {moved.map((change) => {
              const previous = change.previousRate ?? change.newRate;
              const delta = previous > 0 ? (change.newRate - previous) / previous : 0;
              return (
                <View key={`${change.itemId}-${change.observedAt}`} style={styles.row}>
                  <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {change.name}
                  </Text>
                  <Text
                    style={[
                      type.secondary,
                      styles.number,
                      { color: delta > 0 ? color.warning : color.ok },
                    ]}
                  >
                    {delta > 0 ? '▲' : '▼'} {(Math.abs(delta) * 100).toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card>
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          {t.app.home.whereTo}
        </Text>

        {AREAS.map((entry) => {
          const words = t.app.home.nav[entry.key];
          return (
          <Pressable
            key={entry.route}
            onPress={() => router.push(entry.route as never)}
            accessibilityRole="button"
            accessibilityLabel={`${words.label}: ${words.hint}`}
            style={[styles.navRow, { paddingVertical: space.md, gap: space.md }]}
          >
            {/* The area's colour arrives as a small mark, never as a surface -
                enough to make the screen recognisable before it is read. */}
            <View style={[styles.swatch, { backgroundColor: palette[entry.area] }]} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: color.ink }]}>{words.label}</Text>
              <Text style={[type.caption, { color: color.inkFaint }]}>{words.hint}</Text>
            </View>
            <Text style={[type.body, { color: color.inkFaint }]}>›</Text>
          </Pressable>
          );
        })}
      </Card>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  navRow: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  swatch: { width: 10, height: 10, borderRadius: 5 },
});
