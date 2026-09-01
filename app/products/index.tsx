import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { ListRow } from '@/components/ListRow';
import {
  itemCosts,
  labels as loadLabels,
  listProducts,
  loadRecipeGraph,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { costPerProductUnit, costRecipe, unitsPerBatch } from '@/domain/recipe';
import { breakdown } from '@/domain/units';
import { formatMoney, formatQuantity, joinList } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * What leaves the factory.
 *
 * The row says the two things nobody can work out in their head: what one unit
 * costs, and how many units a batch makes. The second is what turns a recipe
 * into a production order, and it is the number that decides whether a day's
 * run fills the boxes or leaves 33 loose.
 */
export default function ProductsListScreen() {
  return (
    <AreaProvider area="mist">
      <ProductsList />
    </AreaProvider>
  );
}

type Row = {
  id: string;
  name: string;
  recipeId: string | null;
  unitCents: number | null;
  detail: string;
};

function ProductsList() {
  const { color, type } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<Row[]>(async () => {
    const [products, graph, costs, names] = await Promise.all([
      listProducts(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
    ]);

    return products.map((product) => {
      if (!product.recipeId || !product.yieldPerUnit) {
        return {
          id: product.id,
          name: product.name,
          recipeId: null,
          unitCents: null,
          detail: 'Revenda — o custo vem da nota de compra.',
        };
      }

      const cost = costRecipe(product.recipeId, graph, costs, names);
      const units = unitsPerBatch(cost, product.yieldPerUnit);

      // Said in the operator's packaging, not in a bare number: "7 caixas e 6
      // soltas" is what somebody stacking a cold room can actually act on.
      const packed = joinList(
        breakdown(units, product.packaging).map((part) => {
          const entry = t.units[part.tier.id as keyof typeof t.units];
          const word = entry ? (part.quantity === 1 ? entry.one : entry.other) : part.tier.id;
          return `${formatQuantity(part.quantity, locale)} ${word}`;
        }),
        t.common.and,
      );

      return {
        id: product.id,
        name: product.name,
        recipeId: product.recipeId,
        unitCents: costPerProductUnit(cost, product.yieldPerUnit, product.unitPackagingCents),
        detail: `Um tacho rende ${formatQuantity(units, locale)} — ${packed}`,
      };
    });
  }, []);

  const rows = data ?? [];

  return (
    <CollapsingHeader title="Produtos" overline="o que sai para vender">
      <Card>
        {loading ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>Abrindo…</Text>
        ) : rows.length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            Nenhum produto ainda. Um produto fabricado precisa de uma receita e de quanto vai em
            cada unidade.
          </Text>
        ) : (
          rows.map((row) => (
            <ListRow
              key={row.id}
              label={row.name}
              detail={row.detail}
              trailing={row.unitCents === null ? '—' : formatMoney(row.unitCents, locale)}
              trailingTone={row.unitCents === null ? 'muted' : 'ink'}
              onPress={
                row.recipeId ? () => router.push(`/recipes/${row.recipeId}`) : undefined
              }
            />
          ))
        )}
      </Card>

      <Button label="Cadastrar novo" onPress={() => router.push('/products/new')} weighty />
    </CollapsingHeader>
  );
}
