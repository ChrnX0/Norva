import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { CountUp } from '@/components/CountUp';
import { PulseDot } from '@/components/PulseDot';
import { IconCost, IconProduction } from '@/components/icons';
import {
  itemCosts,
  labels as loadLabels,
  lastCostMove,
  openProductionRuns,
  listProducts,
  loadRecipeGraph,
  productionOn,
  recentCostChanges,
  shipmentsOn,
  type CostChange,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { brand } from '@/config/brand';
import { useQuery } from '@/data/useQuery';
import { nowIso } from '@/data/db';
import { ratesBefore } from '@/domain/cost';
import { dayWindow, daysBetween } from '@/domain/day';
import { boxesOf } from '@/domain/units';
import { costPerProductUnit, costRecipe, explodeRequirements } from '@/domain/recipe';
import {
  fill,
  formatMoney,
  formatPacked,
  formatQuantity,
  formatTime,
  formatWeekday,
  joinList,
  plural,
} from '@/i18n';
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
  /** Quando o custo deste produto mexeu pela última vez. Null: nunca mexeu. */
  costMovedAt: string | null;
};

type Summary = {
  products: ProductCost[];
  changes: CostChange[];
  /** Units out of the kettle today, and on the same weekday a week back. */
  madeToday: number;
  madeThen: number;
  everMade: boolean;
  /** Volumes que saíram hoje, e o que saiu sem caber em volume nenhum. */
  boxes: number;
  loose: { name: string; said: string }[];
  /** Tachos rodando agora. Vazio é o estado normal de uma fábrica parada. */
  running: { id: string; productName: string; openedAt: string }[];
};

function Briefing() {
  const { color, scheme, type, space, radius } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();
  const palette = palettes[scheme];

  const { data, loading } = useQuery<Summary | null>(async () => {
    // The factory's day, not the phone's last 24 hours - and the comparison is
    // the same weekday a week back, because a Monday and a Saturday are
    // different businesses and comparing them teaches nothing.
    const today = dayWindow(nowIso(), locale.timeZone);
    const then = dayWindow(nowIso(), locale.timeZone, -7);

    const [products, graph, costs, names, changes, madeToday, madeThen, sent, running] =
      await Promise.all([
      listProducts(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
      recentCostChanges(LOCAL_COMPANY_ID, 4),
      productionOn(LOCAL_COMPANY_ID, today.from, today.to),
      productionOn(LOCAL_COMPANY_ID, then.from, then.to),
      shipmentsOn(LOCAL_COMPANY_ID, today.from, today.to),
      openProductionRuns(LOCAL_COMPANY_ID),
    ]);

    const sum = (rows: { baseUnits: number }[]) => rows.reduce((n, r) => n + r.baseUnits, 0);

    // Caixa é objeto: dezoito caixas são dezoito coisas que alguém empilha no
    // caminhão, tenham elas cinquenta picolés ou vinte e quatro. Somar isso
    // entre itens é honesto. O que NÃO é honesto é fingir que um saco de
    // açúcar é caixa porque o total ficava mais redondo - então o que não tem
    // camada acima da base sai da conta e é dito por nome.
    let boxes = 0;
    const loose: { name: string; said: string }[] = [];
    for (const place of sent) {
      for (const item of place.items) {
        const volume = boxesOf(item.baseUnits, item.packaging);
        if (volume) boxes += volume.boxes;
        else loose.push({ name: item.name, said: formatPacked(item.baseUnits, item.packaging, t.units, locale) });
      }
    }

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
      madeToday: sum(madeToday),
      madeThen: sum(madeThen),
      everMade: madeToday.length > 0 || madeThen.length > 0,
      boxes,
      loose,
      running: running.map((r) => ({
        id: r.id,
        productName: r.productName,
        openedAt: r.openedAt,
      })),
      products: await Promise.all(
        products.map(async (product) => ({
          id: product.id,
          name: product.name,
          recipeId: product.recipeId,
          unitCents: priced(product, costs),
          unitCentsBefore: changes.length > 0 ? priced(product, before) : null,
          // Os insumos que ESTE produto usa, não todos os da empresa: uma alta
          // na polpa não move o custo do picolé de coco, e dizer que moveu
          // seria alarme inventado.
          costMovedAt: product.recipeId
            ? await lastCostMove(LOCAL_COMPANY_ID, [
                ...explodeRequirements(product.recipeId, 1, graph).keys(),
              ])
            : null,
        })),
      ),
    };
  });

  /** The line under the count: what it was, said as a difference. */
  const comparison = (today: number, then: number) => {
    const day = t.app.home.lastWeekday;
    if (then === 0) return t.app.home.producedFirst;
    if (today === then) return fill(t.app.home.producedSame, { day });
    const amount = `${formatQuantity(Math.abs(today - then), locale)} ${plural(
      Math.abs(today - then),
      t.units.unit,
    )}`;
    return fill(today > then ? t.app.home.producedMore : t.app.home.producedLess, { amount, day });
  };

  const moved = (data?.changes ?? []).filter(
    (c) => c.previousRate !== null && c.previousRate !== c.newRate,
  );

  return (
    <CollapsingHeader title={brand.name} overline={formatWeekday(nowIso(), locale)}>
      {/* O que saiu hoje, e ele nunca aparece sozinho.
          A Lei 3 não abre exceção para a capa: 1.200 não é bom nem ruim até
          estar ao lado do que foi na segunda passada. Quando não há com o que
          comparar, a tela diz isso em vez de fingir uma variação. */}
      {data && data.everMade ? (
        <Card>
          <CountUp
            value={data.madeToday}
            format={(v) => formatQuantity(Math.round(v), locale)}
            style={{ ...type.figure, color: color.ink }}
          />
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {plural(data.madeToday, t.units.unit)} {t.app.home.producedToday}
          </Text>
          <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
            {comparison(data.madeToday, data.madeThen)}
          </Text>
        </Card>
      ) : null}

      {/* O tacho que está rodando agora.
          O pulso é a única coisa nesta tela que se move sozinha, e por isso ele
          só pode existir quando há um tacho de verdade: `PulseDot` exige `live`
          justamente para que ninguém pulse ao lado de número congelado. Fábrica
          parada não desenha nada aqui - "está tudo bem" é estado válido. */}
      {data?.running.map((run) => (
        <Pressable
          key={run.id}
          onPress={() => router.push('/production')}
          accessibilityRole="button"
          accessibilityLabel={`${t.app.home.running}: ${run.productName}`}
        >
          <Card tone="area">
            <View style={[styles.row, { gap: space.sm }]}>
              <PulseDot live />
              <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                {run.productName}
              </Text>
            </View>
            <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
              {t.app.home.running}
            </Text>
            <Text style={[type.caption, { color: color.inkFaint }]}>
              {fill(t.app.home.runningSince, { time: formatTime(run.openedAt, locale) })}
            </Text>
          </Card>
        </Pressable>
      ))}

      {/* O que saiu para as lojas hoje, em volume.
          O cartão só existe quando há caixa de verdade: se tudo que saiu foi
          granel, um "0 caixas" seria manchete falsa, e a aba Transporte conta a
          história inteira de qualquer jeito. E o que não tem caixa nunca some
          na soma - aparece pelo nome, embaixo. */}
      {data && data.boxes > 0 ? (
        <Card>
          <CountUp
            value={data.boxes}
            format={(v) => formatQuantity(Math.round(v), locale)}
            style={{ ...type.figure, color: color.ink }}
          />
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {plural(data.boxes, t.app.home.boxCount)} {t.app.home.boxesSent}
          </Text>
          {data.loose.length > 0 ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {fill(t.app.home.alsoSent, {
                items: joinList(
                  data.loose.map((l) =>
                    fill(t.app.home.alsoSentItem, {
                      amount: l.said,
                      name: l.name.toLocaleLowerCase(locale.formatting),
                    }),
                  ),
                  t.common.and,
                ),
              })}
            </Text>
          ) : null}
        </Card>
      ) : null}

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

              {/* Quanto tempo esse número está parado.
                  A prancha põe isso ao lado do `por quê?`, e é o que separa
                  "custa 64 centavos" de "custa 64 centavos e ninguém mexeu
                  nisso há doze dias" - a segunda é uma informação sobre o
                  negócio, a primeira é só um preço. Só aparece quando NÃO
                  houve mudança recente: com a comparação na tela, o tempo de
                  estabilidade seria ruído. */}
              <View style={[styles.row, { gap: space.sm, marginTop: space.sm }]}>
                {!costMoved ? (
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {product.costMovedAt
                      ? fill(t.app.home.stableFor, {
                          days: plural(
                            daysBetween(product.costMovedAt, nowIso(), locale.timeZone),
                            t.app.home.dayCount,
                          ),
                        })
                      : t.app.home.stableAlways}
                  </Text>
                ) : null}

                {/* Law 6: every conclusion opens its account. The sheet that
                    explains this cost lives one tap away, on the recipe. */}
                <Text style={[type.caption, { color: palette.sky }]}>{t.app.home.why}</Text>
              </View>
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
