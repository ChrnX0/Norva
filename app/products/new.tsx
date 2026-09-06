import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  GlyphBox,
  GlyphCatalog,
  GlyphPackaging,
  GlyphPlus,
  GlyphPrice,
  GlyphProduction,
} from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import {
  GridTakenError,
  itemCosts,
  listProducts,
  labels as loadLabels,
  listItems,
  listRecipes,
  loadRecipeGraph,
  listLines,
  listTypes,
  listFlavors,
  type Flavor,
  type ProductLine,
  type ProductType,
  type ItemWithCost,
  type Product,
  saveProduct,
  type RecipeSummary,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { rate } from '@/domain/money';
import {
  costPerProductUnit,
  costRecipe,
  packagingRatePerUnit,
  unitsPerBatch,
  type ItemCosts,
  type Recipe,
} from '@/domain/recipe';
import { type PackagingHierarchy } from '@/domain/units';
import { parseTyped } from '@/domain/number';
import { currencySymbol, fill, formatMoney, formatUnitRate, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Registering a product.
 *
 * Two things separate this from a plain "name and price" form, and both come
 * from the research into where the category leader loses its users:
 *
 *   - batch yield is not the product. A recipe yields 40 litres of mix; the
 *     product is 75 ml of it. Keeping the two apart is what lets the same mix
 *     become a popsicle, a 2L tub and a small cup without a second recipe.
 *   - the packaging hierarchy is the customer's, not ours. Unit -> box -> crate
 *     here; the next customer stacks unit -> pack -> bale. So it is typed, not
 *     hardcoded, and the app echoes the arithmetic back in words.
 *
 * **O corpo foi reescrito na língua da capa** (`docs/linguagem.md`), e o layout
 * anterior saiu inteiro em vez de ganhar um caminho ao lado — era ele que fazia
 * esta tela parecer de outro aplicativo no toque seguinte:
 *
 * - a grade tinha DOIS jeitos de escolher desenhados à mão, e nenhum dos dois
 *   era do tema: um `chip()` local com `borderWidth`, `borderRadius` e
 *   `backgroundColor` próprios para linha, tipo e sabor, e um `Segment` com
 *   `borderRadius: 999` e transparência montada na mão para "de onde ele vem" e
 *   para a receita. Isso é vocabulário do Orgânico chumbado numa tela que
 *   também abre no Papel, onde caixa nenhuma existe. Agora a escolha é sempre a
 *   mesma: toca-se a etiqueta, e a acesa é a escolhida — o mesmo gesto do sabor
 *   em `app/production/new.tsx` e do tipo de item em `app/inputs/new.tsx`;
 * - a lista da embalagem que sai do estoque marcava a escolha com `●` e `○`
 *   escritos no código. Bolinha de texto não é desenho do sistema, não muda com
 *   o tema e não tem tamanho de alvo de dedo com luva;
 * - a tela não tinha desenho nenhum: seis blocos de parágrafo cinza, sem crachá,
 *   sem tom por assunto e sem entrada. Cada assunto agora carrega o tom que ele
 *   tem no aplicativo inteiro — a grade e a receita em âmbar de produção, o que
 *   desce do almoxarifado em verde de insumo, a caixa em lilás de transporte, o
 *   custo em azul de dinheiro — porque quem vê a cor sabe do que é antes de ler;
 * - a área era `mist`, o cinza dos Ajustes, numa tela que se abre a partir da
 *   lista de produtos, que é âmbar. Cabeçalho e botão discordavam do que estava
 *   embaixo deles.
 *
 * Nada aqui decide diferente: consulta, conta, confirmação e gravação são as
 * mesmas linhas de antes.
 */
export default function ProductsScreen() {
  return (
    <AreaProvider area="apricot">
      <ProductForm />
    </AreaProvider>
  );
}

type Kind = 'product' | 'resale';

type Loaded = {
  recipes: RecipeSummary[];
  graph: Record<string, Recipe>;
  costs: ItemCosts;
  labels: Record<string, string>;
  /** Palito, saquinho, caixa: o que pode sair do estoque por unidade. */
  wrappings: ItemWithCost[];
  /** O que já existe, para a tela impedir a classificação ocupada em vez de reclamar. */
  products: Product[];
  lines: ProductLine[];
  types: ProductType[];
  flavors: Flavor[];
};

function ProductForm() {
  const { color, type, space, palette, traco } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<Loaded>(async () => {
    const [recipes, graph, costs, labels, lines, types, flavors, items, products] =
      await Promise.all([
      listRecipes(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      itemCosts(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
      listLines(LOCAL_COMPANY_ID),
      listTypes(LOCAL_COMPANY_ID),
      listFlavors(LOCAL_COMPANY_ID),
      listItems(LOCAL_COMPANY_ID),
      listProducts(LOCAL_COMPANY_ID),
    ]);
    const wrappings = items.filter((i) => i.kind === 'packaging');
    return { recipes, graph, costs, labels, lines, types, flavors, wrappings, products };
  });

  const [kind, setKind] = useState<Kind>('product');
  const [name, setName] = useState('');
  const [nameTyped, setNameTyped] = useState(false);
  const [lineId, setLineId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [flavorId, setFlavorId] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [perUnit, setPerUnit] = useState('75');
  const [packagingCost, setPackagingCost] = useState('0,05');
  /**
   * A embalagem que sai do estoque, por unidade.
   *
   * Vazia é o padrão e é legítima: quem não quer contar palito digita o valor
   * acima e segue. Quem lista, vê o palito descer do almoxarifado a cada corrida
   * — que é o defeito que esta lista existe para consertar.
   */
  const [wrappings, setWrappings] = useState<{ itemId: string; quantityPerUnit: string }[]>([]);
  const [perBox, setPerBox] = useState('50');
  const [perCrate, setPerCrate] = useState('6');
  const [shelfLife, setShelfLife] = useState('');
  /** Quanto é "cheio" deste produto, para a leitura por faixa de cor. */
  const [fullLevel, setFullLevel] = useState('');
  const [saving, setSaving] = useState(false);

  const num = (s: string) => parseTyped(s) ?? NaN;

  const chosenRecipe = recipeId ?? data?.recipes[0]?.id ?? null;

  const hierarchy = useMemo<PackagingHierarchy>(() => {
    const box = Math.round(num(perBox));
    const crate = Math.round(num(perCrate));
    const tiers = [{ id: 'unit', perBaseUnit: 1 }];
    if (Number.isFinite(box) && box > 1) tiers.push({ id: 'box', perBaseUnit: box });
    if (Number.isFinite(crate) && crate > 1 && tiers.length > 1) {
      tiers.push({ id: 'crate', perBaseUnit: box * crate });
    }
    return { tiers };
  }, [perBox, perCrate]);

  /**
   * The echo that removes the mental arithmetic: "1 engradado = 6 caixas =
   * 300 unidades". Miscounts in a cold room come from doing this in the head.
   */
  const packagingEcho = useMemo(() => {
    const top = hierarchy.tiers[hierarchy.tiers.length - 1];
    if (top.perBaseUnit <= 1) return t.app.productForm.looseOnly;

    // One of the largest tier, expressed at every level below it.
    return [...hierarchy.tiers]
      .reverse()
      .map((tier) => {
        const count = top.perBaseUnit / tier.perBaseUnit;
        const entry = t.units[tier.id as keyof typeof t.units];
        const word = entry ? (count === 1 ? entry.one : entry.other) : tier.id;
        return `${formatQuantity(count, locale)} ${word}`;
      })
      .join(' = ');
  }, [hierarchy, locale, t]);

  /**
   * A lista pronta para a conta e para gravar.
   *
   * Linha sem número ainda não é linha: quem acabou de tocar em "palito" e não
   * digitou a quantidade não quer consumir zero palito, quer terminar de
   * digitar. Deixar a linha fora até ela ter número é o que evita a corrida
   * gravar consumo de nada.
   */
  const chosenWrappings = useMemo(
    () =>
      wrappings
        .map((linha) => ({ itemId: linha.itemId, quantityPerUnit: num(linha.quantityPerUnit) }))
        .filter((linha) => Number.isFinite(linha.quantityPerUnit) && linha.quantityPerUnit > 0),
    [wrappings],
  );

  // "a cada 1.000 unidades": a escala em que um preço abaixo de um centavo vira
  // número de gente, e é a mesma que a tela do insumo já usa para a polpa.
  const porMil = fill(t.app.inputForm.perThousandOf, { unit: t.units.unit.other });

  const costing = useMemo(() => {
    if (kind === 'resale' || !data || !chosenRecipe) return null;

    const portion = num(perUnit);
    if (!Number.isFinite(portion) || portion <= 0) return null;

    /**
     * A embalagem digitada é TAXA, não centavo inteiro.
     *
     * Era `fromDecimal(...)`, que arredonda: um rótulo a R$ 0,004 por unidade
     * virava zero aqui, entrava de graça na conta e ia para o `unit_cost_rate`
     * congelado de toda corrida — que não se corrige, se estorna. `rate(x, 1)` é
     * "x reais por UMA unidade produzida", e é a mesma espécie de número da polpa
     * a R$ 12,40/kg. Só o valor final arredonda, e quem arredonda é
     * `costPerProductUnit`, uma vez, no fim.
     */
    const packagingRate = rate(num(packagingCost) || 0, 1);
    const cost = costRecipe(chosenRecipe, data.graph, data.costs, data.labels);

    // O que a lista de embalagem custa, cotada pelas notas de compra. Some junto
    // com o valor digitado porque as duas metades são reais: uma sai do estoque,
    // a outra é o que ninguém quis transformar em item.
    const itemsRate = packagingRatePerUnit(chosenWrappings, data.costs);
    const unit = costPerProductUnit(cost, portion, { typedRate: packagingRate, itemsRate });
    const units = unitsPerBatch(cost, portion);

    return {
      cost,
      unit,
      units,
      packagingRate,
      itemsRate,
      mixOnly: costPerProductUnit(cost, portion),
    };
  }, [kind, data, chosenRecipe, perUnit, packagingCost, chosenWrappings]);

  /**
   * O nome que a grade escreve, e quem manda quando os dois existem.
   *
   * Lei 1: o que o sistema pode deduzir não se pergunta. Escolhida a grade, o
   * nome sai dela — "Picolé Tradicional de morango" é a linha, o tipo e o sabor
   * grudados pela frase do dicionário, que é a única parte disto que muda de
   * idioma. Quem digitou um nome à mão continua com o nome que digitou: a
   * dedução sugere, não sobrescreve.
   */
  const linha = data?.lines.find((l) => l.id === lineId) ?? null;
  const tipo = data?.types.find((x) => x.id === typeId) ?? null;
  const sabor = data?.flavors.find((f) => f.id === flavorId) ?? null;
  /** A faixa da caixa, quando ela existe — é ela que dá sentido ao selo. */
  const caixa = hierarchy.tiers.find((t2) => t2.id === 'box') ?? null;

  const composed = (() => {
    if (nameTyped && name.trim()) return name;
    if (!linha) return name;
    const chave =
      tipo && sabor
        ? t.app.catalog.composed
        : sabor
          ? t.app.catalog.composedNoType
          : tipo
            ? t.app.catalog.composedNoFlavor
            : '';
    if (!chave) return linha.name;
    return fill(chave, { line: linha.name, type: tipo?.name ?? '', flavor: sabor?.name ?? '' });
  })();

  /**
   * O produto que já ocupa esta classificação, se houver.
   *
   * Lei 5: o erro impede, não reclama. O banco recusa isto por índice único - e
   * a recusa dele chega como jargão de driver depois de a pessoa ter digitado
   * tudo. Saber aqui é o que transforma um diálogo de erro numa frase antes do
   * gesto. A regra continua no caminho de escrita, porque tela é decoração.
   */
  const ocupada = (data?.products ?? []).find(
    (p) =>
      (p.lineId ?? '') === (lineId ?? '') &&
      (p.typeId ?? '') === (typeId ?? '') &&
      (p.flavorId ?? '') === (flavorId ?? ''),
  );

  // O nome que vale é o COMPOSTO, que é o que a tela mostra no campo.
  //
  // Olhando o nome digitado, um produto classificado só pela grade - linha,
  // tipo, sabor, sem ninguém digitar nada - mostrava "Picolé de Uva" no campo e
  // deixava o botão morto. Botão que não obedece é pior que botão ausente: a
  // pessoa toca, nada acontece, e não há frase nenhuma para ler.
  const canSave =
    composed.trim().length > 0 &&
    ocupada === undefined &&
    (kind === 'resale' || (chosenRecipe !== null && num(perUnit) > 0));

  const onSave = async () => {
    if (!canSave) return;

    const words = fill(
      kind === 'product' ? t.app.productForm.confirmMade : t.app.productForm.confirmResale,
      {
        // O nome é o COMPOSTO, que é o que o campo mostra e o que a gravação usa.
        //
        // Com `name.trim()` a frase omitia justamente o nome: quem classifica só
        // pela grade — toca "Picolé", "Uva" e não digita nada — via o campo
        // escrito "Picolé de Uva" e a confirmação começando em vírgula. É o
        // caminho que o e2e percorre, e a frase existe para dizer o que vai
        // acontecer por extenso.
        name: composed.trim(),
        recipe: data?.recipes.find((r) => r.id === chosenRecipe)?.name ?? '',
        perUnit: formatQuantity(num(perUnit), locale),
        packaging: packagingEcho,
      },
    );

    const go = await confirm({
      title: t.app.productForm.confirmTitle,
      message: words,
      confirmLabel: t.app.productForm.confirmAction,
      cancelLabel: t.app.confirm.adjust,
    });
    if (!go) return;

    setSaving(true);
    try {
      await saveProduct(LOCAL_COMPANY_ID, {
        name: composed.trim(),
        lineId,
        typeId,
        flavorId,
        kind,
        recipeId: kind === 'product' ? chosenRecipe : null,
        yieldPerUnit: kind === 'product' ? num(perUnit) : null,
        unitPackagingRate: rate(num(packagingCost) || 0, 1),
        packagingItems: chosenWrappings,
        shelfLifeDays: num(shelfLife) || null,
        fullLevel: num(fullLevel) > 0 ? num(fullLevel) : null,
        packaging: hierarchy,
      });
      router.back();
    } catch (e) {
      await confirm({
        title: t.app.productForm.failed,
        // A recusa por classificação ocupada tem frase própria, com a saída
        // dentro. Sem isto o dono lê "Error finalizing statement" e desiste.
        message:
          e instanceof GridTakenError
            ? fill(t.app.productForm.gridTaken, { name: e.existing })
            : e instanceof Error
              ? e.message
              : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }
  };

  const tiposDaLinha = (data?.types ?? []).filter((x) => x.lineId === lineId);

  /** As embalagens escolhidas, na ordem do almoxarifado e não na de toque. */
  const escolhidas = (data?.wrappings ?? []).filter((item) =>
    wrappings.some((w) => w.itemId === item.id),
  );

  const temGrade = (data?.lines ?? []).length > 0;
  const feito = kind === 'product';

  /**
   * A cascata não pula número.
   *
   * Metade dos blocos daqui é condicional — sem linha cadastrada não há grade,
   * na revenda não há receita nem embalagem, sem receita que feche não há custo
   * — e índice fixo abriria um buraco de quarenta milissegundos no meio da fila
   * a cada bloco que não se aplica.
   */
  let ordem = 0;
  const iGrade = temGrade ? ordem++ : 0;
  const iProduto = ordem++;
  const iReceita = feito ? ordem++ : 0;
  const iEmbalagem = feito ? ordem++ : 0;
  const iEmpacotado = ordem++;
  const iCusto = costing ? ordem++ : 0;
  const iTravado = ocupada ? ordem++ : 0;
  const iAcao = ordem++;

  return (
    <CollapsingHeader title={t.app.productForm.title} overline={t.app.productForm.overline}>
      {/* A grade, que é o que escreve o nome.
          Ela vem primeiro porque é a única parte da tela que o sistema usa para
          preencher outra: tocada a linha, o tipo e o sabor, o campo de nome
          nasce escrito (Lei 1 e Lei 2). O nível com uma resposta só continua
          fora — mostrar um tipo único como escolha é pedir o que já se sabe.

          Sem linha cadastrada não há cartão: uma grade vazia não é escolha, e a
          tela continua inteira pelo nome digitado à mão. */}
      {temGrade ? (
        <Reveal index={iGrade}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
            title={t.app.catalog.title}
          >
            <View style={{ gap: space.lg }}>
              <View style={{ gap: space.sm }}>
                <Text style={[type.overline, { color: color.inkFaint }]}>
                  {t.app.catalog.lines.toUpperCase()}
                </Text>
                {/* A etiqueta acesa é a escolhida, e nunca por cor sozinha: a
                    palavra continua dita por extenso, que é o que serve de luva
                    e sob luz ruim. A folga em volta é o alvo do dedo. */}
                <View style={[styles.wrap, { gap: space.sm }]}>
                  {(data?.lines ?? []).map((l) => (
                    <Touchable
                      key={l.id}
                      accessibilityLabel={l.name}
                      onPress={() => {
                        setLineId(l.id === lineId ? null : l.id);
                        setTypeId(null);
                      }}
                      style={{ paddingVertical: space.xs }}
                    >
                      <Chip signal={l.id === lineId ? 'ok' : 'neutral'} label={l.name} />
                    </Touchable>
                  ))}
                </View>
              </View>

              {tiposDaLinha.length > 1 ? (
                <View style={{ gap: space.sm }}>
                  <Text style={[type.overline, { color: color.inkFaint }]}>
                    {fill(t.app.catalog.types, { line: linha?.name ?? '' }).toUpperCase()}
                  </Text>
                  <View style={[styles.wrap, { gap: space.sm }]}>
                    {tiposDaLinha.map((x) => (
                      <Touchable
                        key={x.id}
                        accessibilityLabel={x.name}
                        onPress={() => setTypeId(x.id === typeId ? null : x.id)}
                        style={{ paddingVertical: space.xs }}
                      >
                        <Chip signal={x.id === typeId ? 'ok' : 'neutral'} label={x.name} />
                      </Touchable>
                    ))}
                  </View>
                </View>
              ) : null}

              {(data?.flavors ?? []).length > 0 ? (
                <View style={{ gap: space.sm }}>
                  <Text style={[type.overline, { color: color.inkFaint }]}>
                    {t.app.catalog.flavors.toUpperCase()}
                  </Text>
                  <View style={[styles.wrap, { gap: space.sm }]}>
                    {(data?.flavors ?? []).map((f) => (
                      <Touchable
                        key={f.id}
                        accessibilityLabel={f.name}
                        onPress={() => setFlavorId(f.id === flavorId ? null : f.id)}
                        style={{ paddingVertical: space.xs }}
                      >
                        <Chip signal={f.id === flavorId ? 'ok' : 'neutral'} label={f.name} />
                      </Touchable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* O que ele é: o nome e de onde ele vem. Uma pergunta só, e o título do
          cartão é a resposta que está dada agora — ele muda no toque da
          etiqueta, que é o mesmo gesto da grade de cima. */}
      <Reveal index={iProduto}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphPlus size={26} color={c} weight={traco} />}
          title={feito ? t.app.productForm.made : t.app.productForm.resale}
        >
          <View style={{ gap: space.lg }}>
            <Field
              label={t.app.productForm.name}
              value={composed}
              onChangeText={(next) => {
                setNameTyped(true);
                setName(next);
              }}
              placeholder={t.app.productForm.namePlaceholder}
            />

            <View style={{ gap: space.sm }}>
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {t.app.productForm.whereFrom}
              </Text>
              <View style={[styles.wrap, { gap: space.sm }]}>
                <Touchable
                  accessibilityLabel={t.app.productForm.made}
                  onPress={() => setKind('product')}
                  style={{ paddingVertical: space.xs }}
                >
                  <Chip signal={feito ? 'ok' : 'neutral'} label={t.app.productForm.made} />
                </Touchable>
                <Touchable
                  accessibilityLabel={t.app.productForm.resale}
                  onPress={() => setKind('resale')}
                  style={{ paddingVertical: space.xs }}
                >
                  <Chip signal={feito ? 'neutral' : 'ok'} label={t.app.productForm.resale} />
                </Touchable>
              </View>
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {feito ? t.app.productForm.madeHint : t.app.productForm.resaleHint}
              </Text>
            </View>
          </View>
        </Card>
      </Reveal>

      {/* A receita e o quanto vai em cada unidade — o par que separa o
          rendimento do tacho do tamanho do produto, que é a razão desta tela
          existir. Assunto de produção, no âmbar de produção.

          Na revenda o cartão não existe: o custo vem da nota, e perguntar
          receita a quem revende é pedir o que não há. */}
      {feito ? (
        <Reveal index={iReceita}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
            title={t.app.productForm.whichRecipe}
          >
            <View style={{ gap: space.lg }}>
              {loading ? (
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {t.app.productForm.loading}
                </Text>
              ) : data && data.recipes.length > 0 ? (
                <View style={[styles.wrap, { gap: space.sm }]}>
                  {data.recipes.map((recipe) => (
                    <Touchable
                      key={recipe.id}
                      accessibilityLabel={recipe.name}
                      onPress={() => setRecipeId(recipe.id)}
                      style={{ paddingVertical: space.xs }}
                    >
                      <Chip
                        signal={recipe.id === chosenRecipe ? 'ok' : 'neutral'}
                        label={recipe.name}
                      />
                    </Touchable>
                  ))}
                </View>
              ) : (
                /* Estado vazio com a saída dentro da frase: a ficha técnica se
                   cadastra noutra tela, e esta é empilhada — o caminho de volta
                   é o de sempre. */
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {t.app.productForm.noRecipes}
                </Text>
              )}

              <Field
                label={t.app.productForm.perUnit}
                value={perUnit}
                onChangeText={setPerUnit}
                suffix="ml"
                keyboardType="numeric"
                hint={
                  costing
                    ? fill(t.app.productForm.perUnitHint, {
                        units: formatQuantity(costing.units, locale),
                      })
                    : undefined
                }
              />
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* A embalagem por unidade, e ela tem DUAS metades reais: o que ninguém
          quis transformar em item (o valor digitado) e o que sai do
          almoxarifado a cada unidade produzida (o palito que desce do estoque).
          Assunto de insumo, no verde do insumo — duas cores porque são duas
          perguntas, e é a segunda que faz o palito aparecer na corrida. */}
      {feito ? (
        <Reveal index={iEmbalagem}>
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphPackaging size={26} color={c} weight={traco} />}
            title={t.app.productForm.packagingCost}
          >
            <View style={{ gap: space.lg }}>
              <Field
                label={t.app.productForm.packagingCost}
                value={packagingCost}
                onChangeText={setPackagingCost}
                suffix={`${currencySymbol(locale)} ${t.app.productForm.perUnitShort}`}
                keyboardType="numeric"
                hint={t.app.productForm.packagingHint}
              />

              {/* Só aparece quando existe embalagem cadastrada: oferecer a lista
                  numa fábrica que não cadastrou palito é pedir o que o sistema
                  sabe que não existe. */}
              {(data?.wrappings ?? []).length > 0 ? (
                <View style={{ gap: space.sm }}>
                  {/* Frase, e por isso não vira caixa alta: as etiquetas curtas
                      da grade são rótulo e sobem para overline, esta é uma
                      pergunta inteira. Caixa alta numa linha de seis palavras
                      lê-se mais devagar, e o e2e confere a frase como ela é. */}
                  <Text style={[type.caption, { color: color.inkMuted }]}>
                    {t.app.productForm.fromStock}
                  </Text>
                  <View style={[styles.wrap, { gap: space.sm }]}>
                    {(data?.wrappings ?? []).map((item) => {
                      const on = wrappings.some((w) => w.itemId === item.id);
                      return (
                        <Touchable
                          key={item.id}
                          accessibilityLabel={item.name}
                          onPress={() =>
                            setWrappings((atual) =>
                              on
                                ? atual.filter((w) => w.itemId !== item.id)
                                : [...atual, { itemId: item.id, quantityPerUnit: '1' }],
                            )
                          }
                          style={{ paddingVertical: space.xs }}
                        >
                          <Chip signal={on ? 'ok' : 'neutral'} label={item.name} />
                        </Touchable>
                      );
                    })}
                  </View>

                  {/* Um campo por embalagem escolhida, e o rótulo diz de qual —
                      quantidade sem nome do item é número órfão. */}
                  {escolhidas.map((item) => (
                    <Field
                      key={item.id}
                      label={fill(t.app.productForm.perUnitOf, { item: item.name })}
                      value={
                        wrappings.find((w) => w.itemId === item.id)?.quantityPerUnit ?? ''
                      }
                      onChangeText={(texto) =>
                        setWrappings((atual) =>
                          atual.map((w) =>
                            w.itemId === item.id ? { ...w, quantityPerUnit: texto } : w,
                          ),
                        )
                      }
                      suffix={item.baseUnit}
                      keyboardType="numeric"
                    />
                  ))}

                  {costing && costing.itemsRate > 0 ? (
                    <Text style={[type.caption, { color: color.inkMuted }]}>
                      {fill(t.app.productForm.fromStockCost, {
                        amount: formatMoney(Math.round(costing.itemsRate), locale),
                      })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* Como ele fica na prateleira: caixa, engradado, quanto tempo dura e
          quanto é "cheio". Assunto de caixa, no lilás do transporte — é esta a
          embalagem de que a loja fala quando pede.

          A validade é perguntada UMA vez, aqui, para nunca mais ser perguntada
          no tacho: cada corrida nasce com a data calculada. Vazio é resposta
          legítima e quer dizer "não vence" — o lote continua existindo e
          continua rastreando. */}
      <Reveal index={iEmpacotado}>
        <Card
          hue={palette.lilac}
          icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
          title={t.app.productForm.howPacked}
        >
          <View style={{ gap: space.lg }}>
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.productForm.howPackedHint}
            </Text>

            <Field
              label={t.app.productForm.perBox}
              value={perBox}
              onChangeText={setPerBox}
              keyboardType="numeric"
            />
            <Field
              label={t.app.productForm.perCrate}
              value={perCrate}
              onChangeText={setPerCrate}
              keyboardType="numeric"
              hint={packagingEcho}
            />
            <Field
              label={t.app.productForm.shelfLife}
              value={shelfLife}
              onChangeText={setShelfLife}
              keyboardType="numeric"
              hint={t.app.productForm.shelfLifeHint}
            />

            {/* A régua das faixas de cor, aqui também.
                Ela existia só para insumo, e a faixa azul do dono — "80 a 100%"
                — é justamente sobre a câmara cheia de produto acabado: quem
                enche a câmara para de produzir por falta de espaço, e isso não
                aparece olhando insumo. Vazio continua sendo resposta: sem
                régua, o produto não ganha cor nem aviso. */}
            <Field
              label={t.app.inputForm.fullLevel}
              value={fullLevel}
              onChangeText={setFullLevel}
              keyboardType="numeric"
              suffix="un"
              hint={t.app.inputForm.fullLevelHint}
            />
          </View>
        </Card>
      </Reveal>

      {/* A conclusão de tudo o que está acima, no azul do dinheiro.
          Lei 6: toda conclusão abre a conta - e a conta tem que FECHAR. Com a
          embalagem listada somando por fora, "massa + digitado" deixou de dar o
          total: R$ 0,59 + R$ 0,05 contra R$ 0,66 na mesma tela. Foi o e2e que
          pegou, porque só somando os três números da tela aberta é que a
          diferença aparece. */}
      {costing ? (
        <Reveal index={iCusto}>
          <Card hue={palette.sky} icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}>
            <Text style={[type.overline, { color: color.inkFaint }]}>
              {t.app.productForm.unitCost}
            </Text>
            <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
              {formatMoney(costing.unit, locale)}
            </Text>
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {fill(
                costing.itemsRate > 0
                  ? t.app.productForm.mixPlusBoth
                  : t.app.productForm.mixPlusPackaging,
                {
                  mix: formatMoney(costing.mixOnly, locale),
                  // As duas metades são TAXAS: preço por unidade produzida. Com
                  // `formatMoney` (e, no caso do estoque, com um `Math.round`
                  // antes), qualquer embalagem abaixo de meio centavo aparecia
                  // como R$ 0,00 — a tela dizendo de graça o que o razão já tinha
                  // parado de dar de graça.
                  packaging: formatUnitRate(costing.packagingRate, locale, porMil),
                  stock: formatUnitRate(costing.itemsRate, locale, porMil),
                },
              )}
            </Text>
            {/* Sem caixa cadastrada, o selo não existe.
                O `?? 1` fazia o multiplicador ser um, então o selo mostrava o
                custo de UMA unidade — o mesmo número da figura logo acima —
                batizado de "Caixa fechada". E na mesma rolagem o campo de
                engradado já dizia "só unidade solta, sem caixa nem engradado":
                a tela se contradizia duas vezes com a mesma entrada. */}
            {caixa ? (
              <View style={{ marginTop: space.md }}>
                <Chip
                  signal="neutral"
                  label={fill(t.app.productForm.fullBox, {
                    amount: formatMoney(costing.unit * caixa.perBaseUnit, locale),
                  })}
                />
              </View>
            ) : null}
          </Card>
        </Reveal>
      ) : null}

      {/* A frase vem ANTES do botão, e o botão fica travado: impedir e mostrar a
          saída no mesmo gesto. Botão escondido sem explicação é a mesma coisa
          que erro sem saída - a pessoa fica olhando um botão que não obedece.

          Em cartão âmbar de aviso, com o desenho da grade: o que está ocupado é
          a classificação, e é na grade que se desocupa. */}
      {ocupada ? (
        <Reveal index={iTravado}>
          <Card
            tone="warning"
            icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
          >
            <Text style={[type.secondary, { color: color.ink }]}>
              {fill(t.app.productForm.gridTaken, { name: ocupada.name })}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {/* A ação, uma só, com o desenho do que ela faz dentro dela. Desabilitada
          enquanto a grade estiver ocupada ou a conta não fechar — Lei 5: o erro
          se impede, não se reclama. */}
      <Reveal index={iAcao}>
        <Button
          label={saving ? t.app.productForm.saving : t.app.productForm.save}
          icon={(c) => <GlyphPlus size={22} color={c} weight={traco} />}
          onPress={() => void onSave()}
          disabled={!canSave || saving}
          weighty
        />
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
