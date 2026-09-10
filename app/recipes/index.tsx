import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphPlus, GlyphRecipe } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { IconChevron } from '@/components/icons';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import {
  itemCosts,
  labels as loadLabels,
  listProducts,
  listRecipes,
  loadRecipeGraph,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import {
  batchWithPackaging,
  costPerProductUnit,
  packagingRatePerUnit,
  costRecipe,
  RecipeCycleError,
} from '@/domain/recipe';
import { fill, formatMoney, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
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
 *
 * A cara desta tela foi reescrita, não remendada. O corpo anterior era **um
 * cartão cinza com a lista dentro** e uma legenda solta embaixo: a tela sabia
 * qual receita é a mais cara — ela ordena por isso — e desenhava essa resposta
 * como a primeira de N linhas iguais. Ordenar e não destacar é guardar a
 * conclusão dentro da conta.
 *
 * Agora a mais cara é o assunto do topo, com o número dela em figura e a conta
 * aberta ao lado (por unidade de qual produto, e quanto custa o lote inteiro);
 * a legenda da ordem virou a comparação dessa figura, porque é ela que diz o
 * que a posição significa — "é aqui que mexer rende mais" — e a coluna ranqueada
 * logo abaixo é onde o olho confere. O resto da estante continua em linha, com
 * o número na mesma régua da direita.
 *
 * O tom é `palette.sky`, que é o tom de dinheiro em todo o aplicativo: o que
 * esta tela entrega é custo, não produção. A área continua `apricot` para o
 * cabeçalho não trocar de cor no caminho até a ficha, que é da produção.
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
  /**
   * A receita não pôde ser custeada — ciclo, ou insumo sem preço.
   *
   * Marcada e não deduzida do custo zero: linha com defeito ganha faixa e fica
   * no fim da lista, e nunca vira o número grande do topo. Uma figura com um
   * travessão no lugar do valor é pior que figura nenhuma.
   */
  problema: boolean;
};

function RecipesList() {
  const { color, space, type, palette, traco } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<Row[]>(async () => {
    const [recipes, graph, custos, names, products] = await Promise.all([
      listRecipes(empresaDaqui()),
      loadRecipeGraph(empresaDaqui()),
      itemCosts(empresaDaqui()),
      loadLabels(empresaDaqui()),
      listProducts(empresaDaqui()),
    ]);

    // O portão é o próprio `itemCosts`: nulo é "não é seu para ver". O mapa vazio
    // continua servindo para a quantidade, que sai do grafo e não do custo.
    const dinheiro = custos !== null;
    const costs = custos ?? {};

    return recipes.map((recipe) => {
      /**
       * Sem custo a estante continua servindo: ela lista as receitas e diz o que
       * cada uma rende. O que falta é a coluna do dinheiro, e ela sai pelo mesmo
       * caminho que a tela já tem para "não dá para custear esta" — travessão com
       * o motivo ao lado. Aqui o motivo é outro, e é isso que a frase muda.
       */
      if (!dinheiro) {
        const product = products.find((p) => p.recipeId === recipe.id);
        return {
          id: recipe.id,
          name: recipe.name,
          figure: '—',
          detail: product?.yieldPerUnit
            ? fill(t.app.recipes.perUnitOfNoCost, { product: product.name })
            : t.common.moneyHidden,
          batchCents: 0,
          problema: false,
        };
      }
      try {
        const cost = costRecipe(recipe.id, graph, costs, names);
        const product = products.find((p) => p.recipeId === recipe.id);

        // A recipe that becomes a product is judged per unit; one that only
        // feeds other recipes has no unit, so it is judged per litre of mix.
        //
        // A embalagem entra nas DUAS pontas, e é isso que conserta 9 de setembro:
        // a figura sempre a somou, o lote ao lado não, e quem dividia um pelo
        // outro achava outro número. Agora as duas contas leem a mesma embalagem
        // da mesma variável — não há como uma envelhecer sem a outra.
        const embalagem = product
          ? {
              typedRate: product.unitPackagingRate ?? undefined,
              itemsRate: packagingRatePerUnit(product.packagingItems, costs),
            }
          : {};
        const figure =
          product?.yieldPerUnit
            ? formatMoney(costPerProductUnit(cost, product.yieldPerUnit, embalagem), locale)
            : formatMoney(Math.round(cost.perYieldUnit * 1_000), locale);

        const detail = product?.yieldPerUnit
          ? fill(t.app.recipes.perUnitOf, {
              product: product.name,
              batch: formatMoney(
                batchWithPackaging(cost, product.yieldPerUnit, embalagem),
                locale,
              ),
            })
          : fill(t.app.recipes.perBulk, {
              // Mil unidades-base do que a ficha rende: um litro em mililitro,
              // um quilo em grama, mil unidades em unidade. A frase única dizia
              // litro nos três, e a massa de pão saía cotada por litro.
              measure:
                t.app.recipes.bulkMeasures[
                  recipe.yieldUnit as keyof typeof t.app.recipes.bulkMeasures
                ] ?? t.app.recipes.bulkMeasures.ml,
            });

        return {
          id: recipe.id,
          name: recipe.name,
          figure,
          detail,
          batchCents: cost.batchCents,
          problema: false,
        };
      } catch (e) {
        // A cycle is a data problem the person has to see, not a blank row.
        return {
          id: recipe.id,
          name: recipe.name,
          figure: '—',
          detail:
            e instanceof RecipeCycleError ? t.app.recipes.cycle : t.app.recipes.missingPrice,
          batchCents: 0,
          problema: true,
        };
      }
    });
  });

  const rows = [...(data ?? [])].sort((a, b) => b.batchCents - a.batchCents);

  /**
   * A cabeça da estante: a receita mais cara, quando ela tem número.
   *
   * Só existe cartão quando existe valor. Numa fábrica em que nenhuma receita
   * fecha o custo — insumo sem nota, ciclo na ficha — a tela não inventa um
   * destaque: as linhas explicam o que falta, uma por uma.
   */
  const primeira = rows[0] && !rows[0].problema && rows[0].batchCents > 0 ? rows[0] : null;
  const restante = primeira ? rows.slice(1) : rows;

  /** O convite de abrir, dito uma vez e no lugar em que o dedo já está. */
  const abrir = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
      <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>{t.app.home.openScreen}</Text>
      <IconChevron size={16} color={color.inkFaint} />
    </View>
  );

  return (
    <CollapsingHeader cena="receitas" title={t.app.recipes.title} overline={t.app.recipes.overline}>
      {loading ? (
        <Reveal index={0}>
          <Card>
            <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.recipes.costing}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* Vazio não é frase cinza no meio da tela: é o desenho do assunto, uma
          frase, e a próxima ação — que aqui está dita na própria frase, porque
          cadastrar receita ainda não tem tela para onde mandar. */}
      {!loading && rows.length === 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}
            title={t.app.recipes.title}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{t.app.recipes.empty}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* A mais cara, que é a razão de a lista ser ordenada. O número é o custo
          da unidade (ou do litro de massa, quando a receita não vira produto), e
          ele nunca aparece sozinho: embaixo vem a conta que o formou — de qual
          produto é a unidade e quanto custa o lote inteiro — e a régua da ordem,
          que é o que diz o que estar em primeiro significa. */}
      {primeira ? (
        <Reveal index={0}>
          <Touchable
            onPress={() => router.push(`/recipes/${primeira.id}`)}
            accessibilityLabel={primeira.name}
          >
            <Card
              hue={palette.apricot}
              icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}
              title={primeira.name}
            >
              <Text style={[type.figure, { color: color.ink }]}>{primeira.figure}</Text>
              <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
                {primeira.detail}
              </Text>
              {rows.length > 1 ? (
                <Text
                  style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}
                  numberOfLines={2}
                >
                  {t.app.recipes.orderedByBatch}
                </Text>
              ) : null}
              {abrir}
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* O resto da estante, na mesma régua da direita: uma coluna de números
          comparáveis a olho é o que faz a maioria das visitas não precisar de
          toque nenhum. Faixa só na linha que não fechou o custo — o texto ao
          lado diz o que é, e o traço é o atalho de quem passa o olho. */}
      {!loading && restante.length > 0 ? (
        <Reveal index={primeira ? 1 : 0}>
          <Card>
            {/* Conta o que está NESTA lista, não a estante inteira.
                Contava `rows.length` e sentava em cima do resto: com duas
                receitas, "2 receitas" encabeçava uma lista de uma — a outra
                está no cartão acima. Rótulo que conta o que não está embaixo
                dele é a mesma mentira de um total que não fecha. */}
            <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.xs }]}>
              {plural(restante.length, t.app.settings.counted.recipes)}
            </Text>
            {restante.map((row) => (
              <ListRow
                key={row.id}
                label={row.name}
                detail={row.detail}
                trailing={row.figure}
                trailingTone={row.problema ? 'muted' : 'ink'}
                signal={row.problema ? 'warning' : undefined}
                onPress={() => router.push(`/recipes/${row.id}`)}
              />
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* A porta que faltava, no mesmo lugar em que Produtos e Insumos têm a delas.
          Três estados vazios mandavam cadastrar uma ficha e nenhuma tela criava —
          instrução sem destino, que é pior que nenhuma instrução. */}
      <Reveal index={3}>
        <Button
          label={t.app.recipes.addNew}
          onPress={() => router.push('/recipes/new')}
          icon={(c) => <GlyphPlus size={22} color={c} weight={traco} />}
          weighty
        />
      </Reveal>
    </CollapsingHeader>
  );
}
