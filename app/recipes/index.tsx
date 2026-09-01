import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { ListRow } from '@/components/ListRow';
import {
  itemCosts,
  labels as loadLabels,
  listProducts,
  listRecipes,
  loadRecipeGraph,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { costPerProductUnit, costRecipe, RecipeCycleError } from '@/domain/recipe';
import { defaultLocale, formatMoney } from '@/i18n';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * The recipe book.
 *
 * Every row is costed before it is drawn, because a list of recipe names is a
 * list of things you have to open one by one to learn anything. Costed, it
 * answers the question that made the person open the app - which flavour is
 * expensive - in one glance, and ranks them by it.
 *
 * A recipe that a product is made from shows its cost per unit; one that is
 * only used inside others shows its cost per litre of mix, since it never
 * becomes a unit of anything on its own.
 */
export default function RecipesListScreen() {
  return (
    <AreaProvider area="apricot">
      <RecipesList />
    </AreaProvider>
  );
}

type Row = {
  id: string;
  name: string;
  figure: string;
  detail: string;
  /** Sorted by what a batch costs, so the expensive ones surface. */
  batchCents: number;
};

function RecipesList() {
  const { color, space, type } = useTheme();
  const router = useRouter();
  const locale = defaultLocale;

  const { data, loading } = useQuery<Row[]>(async () => {
    const [recipes, graph, costs, names, products] = await Promise.all([
      listRecipes(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
      listProducts(LOCAL_COMPANY_ID),
    ]);

    return recipes.map((recipe) => {
      try {
        const cost = costRecipe(recipe.id, graph, costs, names);
        const product = products.find((p) => p.recipeId === recipe.id);

        // A recipe that becomes a product is judged per unit; one that only
        // feeds other recipes has no unit, so it is judged per litre of mix.
        const figure =
          product?.yieldPerUnit
            ? formatMoney(
                costPerProductUnit(cost, product.yieldPerUnit, product.unitPackagingCents),
                locale,
              )
            : formatMoney(Math.round(cost.perYieldUnit * 1_000), locale);

        const detail = product?.yieldPerUnit
          ? `por unidade de ${product.name} · lote de ${formatMoney(cost.batchCents, locale)}`
          : `por litro de massa · usada dentro de outras receitas`;

        return { id: recipe.id, name: recipe.name, figure, detail, batchCents: cost.batchCents };
      } catch (e) {
        // A cycle is a data problem the person has to see, not a blank row.
        return {
          id: recipe.id,
          name: recipe.name,
          figure: '—',
          detail:
            e instanceof RecipeCycleError
              ? 'Esta receita contém a si mesma — abra para corrigir.'
              : 'Falta preço em algum insumo.',
          batchCents: 0,
        };
      }
    });
  });

  const rows = [...(data ?? [])].sort((a, b) => b.batchCents - a.batchCents);

  return (
    <CollapsingHeader title="Receitas" overline="o que entra no tacho">
      <Card>
        {loading ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>Calculando os custos…</Text>
        ) : rows.length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            Nenhuma ficha técnica ainda. Cadastre os insumos primeiro, depois a receita que os usa.
          </Text>
        ) : (
          rows.map((row) => (
            <ListRow
              key={row.id}
              label={row.name}
              detail={row.detail}
              trailing={row.figure}
              onPress={() => router.push(`/recipes/${row.id}`)}
            />
          ))
        )}
      </Card>

      {rows.length > 1 ? (
        <Text
          style={[
            type.caption,
            { color: color.inkFaint, textAlign: 'center', paddingHorizontal: space.lg },
          ]}
        >
          Em ordem de quanto custa o lote — a mais cara primeiro, que é onde mexer rende mais.
        </Text>
      ) : null}
    </CollapsingHeader>
  );
}
