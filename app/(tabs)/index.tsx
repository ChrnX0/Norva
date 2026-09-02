import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { CountUp } from '@/components/CountUp';
import { IconCost, IconProduction } from '@/components/icons';
import {
  itemCosts,
  labels as loadLabels,
  listProducts,
  loadRecipeGraph,
  recentCostChanges,
  type CostChange,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { brand } from '@/config/brand';
import { useQuery } from '@/data/useQuery';
import { nowIso } from '@/data/db';
import { ratesBefore } from '@/domain/cost';
import { costPerProductUnit, costRecipe } from '@/domain/recipe';
import { fill, formatMoney, formatWeekday } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { palettes } from '@/theme/tokens';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * The briefing, as the design canvas draws it.
 *
 * A dashboard shows totals; a briefing says what moved and what to do about it.
 * The owner already knows roughly how much stock is in the cold room - what
 * they cannot know without this app is that pulp went up 9% on Tuesday and took
 * three cents a unit with it.
 *
 * The canvas puts one number at fifty-six points and everything else around it:
 * what a unit costs, whether that moved, and the single action of the day. The
 * nine-row menu that used to live at the bottom of this screen is gone - the
 * tab bar and the "Mais" drawers reach every one of those routes, and a list
 * you must read before acting is the opposite of a briefing.
 *
 * TWO THINGS THE CANVAS DRAWS AND THIS SCREEN DOES NOT SHOW, deliberately:
 *
 *  - "1.200 picolés hoje" and "18 caixas enviadas". Both need a query with a
 *    date window, and this repository has never had one: `occurred_at` appears
 *    nine times in `repository.ts` and not once as a filter. They arrive with
 *    `productionOn()` and `shipmentsOn()`, each with the comparison Law 3
 *    demands - a bare count teaches nothing.
 *  - "estável há 12 dias". `item_cost_history` holds what it needs, and the
 *    query that reads it does not exist yet.
 *
 * Inventing any of the three would have been a number nobody could check on a
 * screen used to decide where money goes.
 */
export default function Home() {
  return (
    <AreaProvider area="sky">
      <Briefing />
    </AreaProvider>
  );
}

type ProductCost = {
  id: string;
  name: string;
  recipeId: string | null;
  unitCents: number;
  /** The same unit, priced before the recent invoices. Null when nothing moved. */
  unitCentsBefore: number | null;
};

type Summary = { products: ProductCost[]; changes: CostChange[] };

function Briefing() {
  const { color, scheme, type, space, radius } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();
  const palette = palettes[scheme];

  const { data, loading } = useQuery<Summary | null>(async () => {
    const [products, graph, costs, names, changes] = await Promise.all([
      listProducts(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
      recentCostChanges(LOCAL_COMPANY_ID, 4),
    ]);

    // The same products, priced twice: with today's costs and with the costs
    // as they stood before the recent invoices. The second pass is what lets a
    // figure arrive with its comparison instead of asking to be trusted.
    const before = ratesBefore(costs, changes);

    const priced = (product: (typeof products)[number], rates: typeof costs) =>
      product.recipeId && product.yieldPerUnit
        ? costPerProductUnit(
            costRecipe(product.recipeId, graph, rates, names),
            product.yieldPerUnit,
            product.unitPackagingCents,
          )
        : 0;

    return {
      changes,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        recipeId: product.recipeId,
        unitCents: priced(product, costs),
        unitCentsBefore: changes.length > 0 ? priced(product, before) : null,
      })),
    };
  });

  const moved = (data?.changes ?? []).filter(
    (c) => c.previousRate !== null && c.previousRate !== c.newRate,
  );

  return (
    <CollapsingHeader title={brand.name} overline={formatWeekday(nowIso(), locale)}>
      {data?.products.map((product) => {
        const before = product.unitCentsBefore;
        const costMoved = before !== null && before !== product.unitCents;
        return (
          <Pressable
            key={product.id}
            onPress={() =>
              router.push(product.recipeId ? `/recipes/${product.recipeId}` : '/products')
            }
            accessibilityRole="button"
            accessibilityLabel={`${product.name}: ${formatMoney(product.unitCents, locale)}`}
          >
            <Card tone="area">
              <View style={[styles.row, { gap: space.md }]}>
                <IconCost size={32} color={palette.sky} />
                <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {product.name}
                </Text>
              </View>

              {/* The one number this screen is about. */}
              <CountUp
                value={product.unitCents}
                format={(v) => formatMoney(Math.round(v), locale)}
                style={{ ...type.hero, color: color.ink, marginTop: space.sm }}
              />
              <Text style={[type.body, { color: color.inkMuted }]}>{t.app.home.each}</Text>

              {/* Law 3: no number appears alone. 64 cents is neither good nor
                  bad until it sits beside what it was - and the history that
                  answers that was already being written by every invoice. */}
              {costMoved ? (
                <View style={{ marginTop: space.md, gap: space.xs }}>
                  <Chip
                    signal={product.unitCents > before ? 'warning' : 'ok'}
                    label={`${product.unitCents > before ? '▲' : '▼'} ${formatMoney(
                      Math.abs(product.unitCents - before),
                      locale,
                    )}`}
                  />
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {fill(t.app.home.costWas, { before: formatMoney(before, locale) })}
                  </Text>
                </View>
              ) : null}

              {/* Law 6: every conclusion opens its account. The sheet that
                  explains this cost lives one tap away, on the recipe. */}
              <Text style={[type.caption, { color: palette.sky, marginTop: space.sm }]}>
                {t.app.home.why}
              </Text>
            </Card>
          </Pressable>
        );
      })}

      <Card tone={moved.length > 0 ? 'warning' : 'plain'}>
        <Text style={[type.cardTitle, { color: color.ink }]}>
          {moved.length > 0 ? t.app.home.changed : t.app.home.steady}
        </Text>

        {moved.length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {loading ? t.app.home.checking : t.app.home.steadyDetail}
          </Text>
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

      {/* The day's single action, within thumb reach and carrying its own mark. */}
      <Button
        label={t.app.home.record}
        onPress={() => router.push('/production')}
        icon={(c) => <IconProduction size={24} color={c} />}
        style={{ borderRadius: radius.pill }}
      />
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
