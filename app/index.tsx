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
import { defaultLocale, formatMoney } from '@/i18n';
import { palettes, type Ambient } from '@/theme/tokens';
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

const AREAS: { area: Ambient; label: string; hint: string; route: string }[] = [
  { area: 'sky', label: 'Pergunte', hint: 'escreva o que quer saber', route: '/assistant' },
  { area: 'mist', label: 'Insumos', hint: 'o que você compra', route: '/inputs' },
  { area: 'apricot', label: 'Receitas', hint: 'o que entra no tacho', route: '/recipes' },
  { area: 'mist', label: 'Produtos', hint: 'o que sai para vender', route: '/products' },
  { area: 'sage', label: 'Compras', hint: 'a nota que move o custo', route: '/purchase' },
  { area: 'mist', label: 'Ajustes', hint: 'limpar dados e recomeçar', route: '/settings' },
];

function Briefing() {
  const { color, scheme, type, space } = useTheme();
  const router = useRouter();
  const locale = defaultLocale;

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
  }, []);

  const palette = palettes[scheme];
  const moved = (data?.changes ?? []).filter(
    (c) => c.previousRate !== null && c.previousRate !== c.newRate,
  );

  return (
    <CollapsingHeader title={brand.name} overline="hoje na fábrica">
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
              custo por unidade · calculado da receita e das notas de compra
            </Text>
          </Card>
        </Pressable>
      ))}

      <Card tone={moved.length > 0 ? 'warning' : 'area'}>
        <Text style={[type.cardTitle, { color: color.ink }]}>
          {moved.length > 0 ? 'Mudou desde a última vez' : 'Nada mudou de preço'}
        </Text>

        {moved.length === 0 ? (
          <>
            <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
              {loading ? 'Conferindo…' : 'Os custos estão estáveis. Não há nada para decidir hoje.'}
            </Text>
            {!loading ? (
              <View style={{ marginTop: space.md }}>
                <Chip signal="ok" label="Tudo estável" />
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
          Onde você quer ir
        </Text>

        {AREAS.map((entry) => (
          <Pressable
            key={entry.route}
            onPress={() => router.push(entry.route as never)}
            accessibilityRole="button"
            accessibilityLabel={`${entry.label}: ${entry.hint}`}
            style={[styles.navRow, { paddingVertical: space.md, gap: space.md }]}
          >
            {/* The area's colour arrives as a small mark, never as a surface -
                enough to make the screen recognisable before it is read. */}
            <View style={[styles.swatch, { backgroundColor: palette[entry.area] }]} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: color.ink }]}>{entry.label}</Text>
              <Text style={[type.caption, { color: color.inkFaint }]}>{entry.hint}</Text>
            </View>
            <Text style={[type.body, { color: color.inkFaint }]}>›</Text>
          </Pressable>
        ))}
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
