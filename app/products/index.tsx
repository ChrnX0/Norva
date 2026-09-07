import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphCatalog, GlyphProduction } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { IconChevron } from '@/components/icons';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import {
  itemCosts,
  labels as loadLabels,
  listProducts,
  loadRecipeGraph,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import { costPerProductUnit, packagingRatePerUnit, costRecipe, unitsPerBatch } from '@/domain/recipe';
import { fill, formatMoney, formatPacked, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * O que sai da fábrica para vender.
 *
 * A linha diz as duas coisas que ninguém faz de cabeça: quanto custa uma
 * unidade, e quantas unidades cada vez rende. A segunda é o que transforma uma
 * receita em ordem de produção, e é o número que decide se o dia fecha as
 * caixas ou deixa 33 soltas. Isso não mudou — é a razão de a linha existir.
 *
 * **O corpo anterior era um retângulo cinza com a lista dentro** e dois botões
 * empilhados embaixo, um deles fantasma. Nenhum crachá, nenhum tom, nenhuma
 * entrada: a tela da produção parecendo a tela de ajustes, que é exatamente a
 * costura que o dono apontou entre a capa nova e as antigas. E a área declarada
 * era `mist`, o cinza dos ajustes — quem chegava aqui pela produção via o
 * cabeçalho trocar de cor no caminho.
 *
 * Agora o assunto tem cara: `apricot` em tudo, que é o tom da produção no
 * aplicativo inteiro, e o cabeçalho do cartão diz quantos produtos existem em
 * vez de repetir a palavra que já está no título da tela. A grade continua
 * embaixo e continua por decisão registrada — quem cadastra do zero começa nela,
 * mas quem volta aqui volta para ver produto, não grade —, só que virou porta
 * desenhada com o convite de abrir em vez de um botão fantasma, que é o que uma
 * navegação para outra tela é.
 *
 * Nenhum número grande aqui, e é de propósito: o que esta tela entrega é uma
 * coluna de custos comparáveis a olho, um por produto. Promover um deles a
 * figura seria repetir a estante de receitas, que já ordena por custo por
 * unidade — e figura sem comparação ao lado é o que a Lei 3 proíbe.
 */
export default function ProductsListScreen() {
  return (
    <AreaProvider area="apricot">
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
  const { color, type, space, palette, traco } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<{ rows: Row[]; dinheiro: boolean }>(async () => {
    const [products, graph, custos, names] = await Promise.all([
      listProducts(empresaDaqui()),
      loadRecipeGraph(empresaDaqui()),
      itemCosts(empresaDaqui()),
      loadLabels(empresaDaqui()),
    ]);

    /**
     * O portão é o próprio `itemCosts`: nulo quer dizer "não é seu para ver".
     *
     * Uma pergunta a menos e uma fonte de verdade só — perguntar `canSeeMoney`
     * ao lado seria abrir espaço para as duas respostas discordarem. O mapa vazio
     * continua servindo para a ARITMÉTICA de quantidade: quanto a receita rende
     * sai do grafo, não do custo, então "rende 7 caixas" continua verdade.
     */
    const dinheiro = custos !== null;
    const costs = custos ?? {};

    const rows = products.map((product) => {
      if (!product.recipeId || !product.yieldPerUnit) {
        return {
          id: product.id,
          name: product.name,
          recipeId: null,
          unitCents: null,
          detail: t.app.products.resale,
        };
      }

      const cost = costRecipe(product.recipeId, graph, costs, names);
      const units = unitsPerBatch(cost, product.yieldPerUnit);

      // Said in the operator's packaging, not in a bare number: "7 caixas e 6
      // soltas" is what somebody stacking a cold room can actually act on.
      const packed = formatPacked(units, product.packaging, t.units, locale, t.common.and);

      return {
        id: product.id,
        name: product.name,
        recipeId: product.recipeId,
        /**
         * Nulo já era o estado "não dá para custear" desta linha, e a tela já o
         * desenha como travessão — então o portão fechado entra pelo caminho que
         * a tela conhece, em vez de somar zero e imprimir R$ 0,00 em todo
         * produto. Sem a parcela digitada a conta não fecha, e uma conta que não
         * fecha não vira número.
         */
        unitCents:
          dinheiro && product.unitPackagingRate !== null
            ? costPerProductUnit(cost, product.yieldPerUnit, {
                typedRate: product.unitPackagingRate,
                itemsRate: packagingRatePerUnit(product.packagingItems, costs),
              })
            : null,
        /**
         * O que rende, e por quanto sai — nesta ordem e nesta linha.
         *
         * O preço ao lado do rendimento é o que faz a coluna do custo, à direita,
         * decidir alguma coisa: R$ 0,66 por unidade não diz nada sozinho, e diz tudo
         * ao lado de "vende a R$ 2,50". É a Lei 3 numa linha de lista, sem inventar
         * uma tela de margem que ninguém pediu.
         */
        detail: [
          fill(t.app.products.batchYields, {
            units: formatQuantity(units, locale),
            packed,
          }),
          product.salePriceRate === null
            ? null
            : fill(t.app.products.sellsFor, {
                amount: formatMoney(Math.round(product.salePriceRate), locale),
              }),
        ]
          .filter(Boolean)
          .join(' · '),
      };
    });

    return { rows, dinheiro };
  });

  const rows = data?.rows ?? [];
  const dinheiro = data?.dinheiro === true;

  /** O convite de abrir, no lugar em que o dedo já está. */
  const abrir = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
      <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>{t.app.home.openScreen}</Text>
      <IconChevron size={16} color={color.inkFaint} />
    </View>
  );

  return (
    <CollapsingHeader cena="produtos" title={t.app.products.title} overline={t.app.products.overline}>
      {loading ? (
        <Reveal index={0}>
          <Card>
            <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.products.opening}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* Vazio não é frase cinza no meio da tela: é o desenho do assunto, uma
          frase e a próxima ação — que é o botão logo abaixo, o mesmo em todos os
          estados. Primeiro dia de instalação é a tela que mais gente vê. */}
      {!loading && rows.length === 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
            title={t.app.products.title}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{t.app.products.empty}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* A coluna: nome, o que cada vez rende, e o custo da unidade na mesma
          régua da direita, que é o que faz a maioria das visitas não precisar de
          toque nenhum. Revenda não tem custo nosso — o travessão diz isso na
          coluna, e o texto ao lado diz de onde o custo dela vem.

          O ícone é do cartão, não da linha: desenho em toda linha vira papel de
          parede e some. */}
      {!loading && rows.length > 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
            title={plural(rows.length, t.app.settings.counted.products)}
          >
            {rows.map((row) => (
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
            ))}
            {/* Uma vez, embaixo da coluna que ela explica: sem isto a coluna de
                travessões lê como "nenhum produto tem custo calculado". */}
            {dinheiro ? null : (
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
                {t.common.moneyHidden}
              </Text>
            )}
          </Card>
        </Reveal>
      ) : null}

      <Reveal index={1}>
        <Button label={t.app.products.addNew} onPress={() => router.push('/products/new')} weighty />
      </Reveal>

      {/* A grade vem antes do produto na ordem de quem cadastra do zero: linha,
          tipo e sabor primeiro, e aí o produto é a combinação. Fica embaixo
          porque quem já cadastrou volta aqui para ver produto, não grade.

          E é porta, não ação: cartão com o desenho da grade e o convite de
          abrir, do mesmo jeito que os relatórios abrem os deles. Botão fantasma
          escondia o que a grade é para quem nunca entrou nela. */}
      <Reveal index={2}>
        <Touchable onPress={() => router.push('/catalog')} accessibilityLabel={t.app.catalog.title}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
            title={t.app.catalog.title}
          >
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {t.app.catalog.overline}
            </Text>
            {abrir}
          </Card>
        </Touchable>
      </Reveal>
    </CollapsingHeader>
  );
}
