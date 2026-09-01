import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { ListRow } from '@/components/ListRow';
import {
  findItem,
  itemHistory,
  recipesUsingItem,
  type ItemWithCost,
  type PriceMoveRow,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { formatDayMonth, formatMoney, formatQuantity } from '@/i18n';
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
  const router = useRouter();
  const { locale } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, loading } = useQuery<Loaded>(async () => {
    if (!id) return { item: null, history: [], recipes: [] };
    const [item, history, recipes] = await Promise.all([
      findItem(LOCAL_COMPANY_ID, id),
      itemHistory(LOCAL_COMPANY_ID, id),
      recipesUsingItem(LOCAL_COMPANY_ID, id),
    ]);
    return { item, history, recipes };
  }, [id]);

  const item = data?.item ?? null;

  if (loading || !item) {
    return (
      <CollapsingHeader title="Insumo" overline="almoxarifado">
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {loading ? 'Abrindo…' : 'Esse item não está mais cadastrado.'}
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

  return (
    <CollapsingHeader title={item.name} overline="almoxarifado">
      <Card tone="area">
        <Text style={[type.overline, { color: color.inkFaint }]}>CUSTO ATUAL</Text>
        <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
          {item.averageRate > 0 ? formatMoney(perThousand, locale) : '—'}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted }]}>
          {item.averageRate > 0
            ? `a cada 1.000 ${item.baseUnit} · média das compras`
            : 'ainda sem nota lançada'}
        </Text>

        {latestChange !== null && Math.abs(latestChange) >= 0.001 ? (
          <View style={{ marginTop: space.md }}>
            <Chip
              signal={latestChange > 0.05 ? 'warning' : latestChange < 0 ? 'ok' : 'neutral'}
              label={`${latestChange > 0 ? 'Subiu' : 'Caiu'} ${(
                Math.abs(latestChange) * 100
              ).toFixed(1)}% na última compra`}
            />
          </View>
        ) : null}
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.sm }]}>
          Como você compra
        </Text>
        <ListRow label="Embalagem" trailing={item.purchaseUnit ?? '—'} />
        <ListRow
          label="Quanto vem dentro"
          trailing={
            item.purchaseToBase
              ? `${formatQuantity(item.purchaseToBase, locale)} ${item.baseUnit}`
              : '—'
          }
        />
        <ListRow
          label={`Preço por ${item.purchaseUnit ?? 'embalagem'}`}
          trailing={
            item.purchaseToBase && item.averageRate > 0
              ? formatMoney(Math.round(item.averageRate * item.purchaseToBase), locale)
              : '—'
          }
        />
        <ListRow
          label="Em estoque"
          detail={held > 0 ? `${formatMoney(held, locale)} parados aqui` : undefined}
          trailing={`${formatQuantity(item.onHandBaseUnits, locale)} ${item.baseUnit}`}
        />
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink }]}>Histórico de preço</Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
          Ninguém escreveu isto. Cada linha nasceu de uma nota lançada.
        </Text>

        <View style={{ marginTop: space.md }}>
          {moves.length === 0 ? (
            <Text style={[type.secondary, { color: color.inkFaint }]}>
              Só houve uma compra até agora, então ainda não há o que comparar.
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
          <Text style={[type.cardTitle, { color: color.ink }]}>Quem usa isto</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {data!.recipes.length === 1
              ? 'Uma receita depende deste item.'
              : `${data!.recipes.length} receitas dependem deste item — um aumento aqui move todas elas.`}
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
        label="Lançar uma compra deste item"
        onPress={() => router.push(`/purchase?itemId=${item.id}`)}
        weighty
      />
    </CollapsingHeader>
  );
}
