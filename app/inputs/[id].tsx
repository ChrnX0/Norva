import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { ListRow } from '@/components/ListRow';
import { useConfirm } from '@/components/Confirm';
import {
  findItem,
  itemHistory,
  recipesUsingItem,
  setItemActive,
  type ItemWithCost,
  type PriceMoveRow,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill, formatDayMonth, formatMoney, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * One input, and everything the ledger already knows about it.
 *
 * The price history is the point. It is written by `recordPurchase` on the way
 * past, as a by-product of entering an invoice - nobody maintains it, and until
 * now nobody could see it either. Showing it is what turns "the cost went up"
 * from a claim into something the person can check, which is the difference
 * between an app they believe and an app they argue with.
 *
 * The recipes standing on the item are here for the same reason. A 9% rise on
 * sugar is a footnote or a crisis depending entirely on how many flavours use
 * it, and that is a question only the system can answer quickly.
 */
export default function InputDetailScreen() {
  return (
    <AreaProvider area="mist">
      <InputDetail />
    </AreaProvider>
  );
}

type Loaded = {
  item: ItemWithCost | null;
  history: PriceMoveRow[];
  recipes: { id: string; name: string; quantity: number }[];
};

function InputDetail() {
  const { color, space, type } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, loading, refresh } = useQuery<Loaded>(async () => {
    if (!id) return { item: null, history: [], recipes: [] };
    const [item, history, recipes] = await Promise.all([
      findItem(LOCAL_COMPANY_ID, id),
      itemHistory(LOCAL_COMPANY_ID, id),
      recipesUsingItem(LOCAL_COMPANY_ID, id),
    ]);
    return { item, history, recipes };
  }, id ?? '');

  const item = data?.item ?? null;

  if (loading || !item) {
    return (
      <CollapsingHeader title={t.app.inputForm.fallbackTitle} overline={t.app.inputDetail.overline}>
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {loading ? t.app.inputDetail.opening : t.app.inputDetail.gone}
          </Text>
        </Card>
      </CollapsingHeader>
    );
  }

  const perThousand = Math.round(item.averageRate * 1_000);
  const held = Math.round(item.averageRate * item.onHandBaseUnits);
  const moves = (data?.history ?? []).filter((h) => h.previousRate !== null);

  // The last real move, which is the only one anybody asks about.
  const latest = moves[0];
  const latestChange =
    latest && latest.previousRate
      ? (latest.newRate - latest.previousRate) / latest.previousRate
      : null;

  const toggleActive = async () => {
    const go = await confirm({
      title: item.active ? t.app.inputDetail.retireTitle : t.app.inputDetail.bringBackTitle,
      message: fill(
        item.active ? t.app.inputDetail.retireBody : t.app.inputDetail.bringBackBody,
        { name: item.name },
      ),
      confirmLabel: item.active ? t.app.inputDetail.retireConfirm : t.app.inputDetail.bringBack,
      destructive: item.active,
    });
    if (!go) return;

    await setItemActive(LOCAL_COMPANY_ID, item.id, !item.active).then(refresh);
  };

  return (
    <CollapsingHeader
      title={item.name}
      overline={item.active ? t.app.inputDetail.overline : t.app.inputDetail.retiredOverline}
    >
      {item.active ? null : (
        <Card tone="warning">
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.inputDetail.retiredTitle}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.inputDetail.retiredBody}
          </Text>
        </Card>
      )}
      <Card tone="area">
        <Text style={[type.overline, { color: color.inkFaint }]}>{t.app.inputDetail.currentCost}</Text>
        <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
          {item.averageRate > 0 ? formatMoney(perThousand, locale) : '—'}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted }]}>
          {item.averageRate > 0
            ? fill(t.app.inputDetail.averageOf, { unit: item.baseUnit })
            : t.app.inputDetail.noInvoiceYet}
        </Text>

        {latestChange !== null && Math.abs(latestChange) >= 0.001 ? (
          <View style={{ marginTop: space.md }}>
            <Chip
              signal={latestChange > 0.05 ? 'warning' : latestChange < 0 ? 'ok' : 'neutral'}
              label={fill(
                latestChange > 0 ? t.app.inputDetail.wentUp : t.app.inputDetail.wentDown,
                { percent: `${(Math.abs(latestChange) * 100).toFixed(1)}%` },
              )}
            />
          </View>
        ) : null}
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.sm }]}>
          {t.app.inputDetail.howYouBuy}
        </Text>
        <ListRow label={t.app.inputDetail.pack} trailing={item.purchaseUnit ?? '—'} />
        <ListRow
          label={t.app.inputDetail.perPack}
          trailing={
            item.purchaseToBase
              ? `${formatQuantity(item.purchaseToBase, locale)} ${item.baseUnit}`
              : '—'
          }
        />
        <ListRow
          label={fill(t.app.inputDetail.pricePer, {
            pack: item.purchaseUnit ?? t.app.inputDetail.pack.toLowerCase(),
          })}
          trailing={
            item.purchaseToBase && item.averageRate > 0
              ? formatMoney(Math.round(item.averageRate * item.purchaseToBase), locale)
              : '—'
          }
        />
        <ListRow
          label={t.app.inputDetail.inStock}
          detail={
            held > 0
              ? fill(t.app.inputDetail.heldHere, { amount: formatMoney(held, locale) })
              : undefined
          }
          trailing={`${formatQuantity(item.onHandBaseUnits, locale)} ${item.baseUnit}`}
        />
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.inputDetail.history}</Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.inputDetail.historyHint}
        </Text>

        <View style={{ marginTop: space.md }}>
          {moves.length === 0 ? (
            <Text style={[type.secondary, { color: color.inkFaint }]}>
              {t.app.inputDetail.historyEmpty}
            </Text>
          ) : (
            moves.map((move) => {
              const previous = move.previousRate ?? move.newRate;
              const change = previous > 0 ? (move.newRate - previous) / previous : 0;
              return (
                <ListRow
                  key={move.observedAt}
                  label={formatDayMonth(move.observedAt, locale)}
                  detail={`${formatMoney(Math.round(previous * 1_000), locale)} → ${formatMoney(
                    Math.round(move.newRate * 1_000),
                    locale,
                  )}`}
                  trailing={`${change > 0 ? '▲' : '▼'} ${(Math.abs(change) * 100).toFixed(1)}%`}
                  trailingTone={change > 0 ? 'warning' : 'ok'}
                />
              );
            })
          )}
        </View>
      </Card>

      {(data?.recipes.length ?? 0) > 0 ? (
        <Card tone="area">
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.inputDetail.usedBy}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {data!.recipes.length === 1
              ? t.app.inputDetail.usedByOne
              : fill(t.app.inputDetail.usedByMany, { count: data!.recipes.length })}
          </Text>
          <View style={{ marginTop: space.md }}>
            {data!.recipes.map((recipe) => (
              <ListRow
                key={recipe.id}
                label={recipe.name}
                trailing={`${formatQuantity(recipe.quantity, locale)} ${item.baseUnit}`}
                onPress={() => router.push(`/recipes/${recipe.id}`)}
              />
            ))}
          </View>
        </Card>
      ) : null}

      <Button
        label={t.app.inputDetail.recordPurchase}
        onPress={() => router.push(`/purchase?itemId=${item.id}`)}
        weighty
      />

      <Button
        label={t.app.inputDetail.correct}
        variant="ghost"
        onPress={() => router.push(`/inputs/new?id=${item.id}`)}
      />

      <Button
        label={item.active ? t.app.inputDetail.retire : t.app.inputDetail.bringBack}
        variant="ghost"
        onPress={() => void toggleActive()}
      />
    </CollapsingHeader>
  );
}
