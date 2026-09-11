import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { voltar } from '@/nav';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { UnitStepper } from '@/components/UnitStepper';
import { ProductPicker } from '@/components/ProductPicker';
import type { Escolha } from '@/components/grade';
import { GlyphKettle, GlyphProduction, GlyphSack } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import {
  NotEnoughStockError,
  openProductionRun,
  openProductionRuns,
  cancelProductionRun,
  closeProductionRun,
  type OpenRun,
  labels as loadLabels,
  consumoDaProducao,
  listItems,
  listProducts,
  loadRecipeGraph,
  recordProduction,
  stockByPlace,
  type ItemWithCost,
  type PlaceStock,
  type Product,
} from '@/data/repository';
import { nowIso } from '@/data/db';
import { localDate } from '@/domain/day';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { useQuery } from '@/data/useQuery';
import { INTERNAL_PLACE_KINDS } from '@/domain/ledger';
import { explodeRequirements, type Recipe } from '@/domain/recipe';
import { parseTyped } from '@/domain/number';
import {
  fill,
  formatMoney,
  formatPacked,
  formatQuantity,
  formatTime,
  joinList,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Lançar o que foi produzido.
 *
 * A ordem dos campos foi invertida, e a razão é a única que importa: o dono
 * olhou a tela e disse que o tacho de morango não faz sentido. Ele estava
 * certo. "Produzi 480 picolés" é o fato; "rodei um tacho" é a conta que leva
 * até ele. Perguntar a conta antes do fato obriga quem está de luva a
 * responder uma pergunta que só o sistema deveria fazer a si mesmo.
 *
 * Então a unidade vem primeiro e o tacho vira detalhe: quem trabalha por tacho
 * abre o detalhe e ganha o pré-preenchido da ficha de volta; quem só conta
 * caixa nunca o abre. Os dois caminhos existem, e nenhum dos dois foi
 * escolhido por nós.
 *
 * O que se manteve: nenhum campo nasce vazio (Lei 2) e nenhum número aparece
 * sozinho (Lei 3) — quando o tacho está declarado e o que saiu difere do que a
 * ficha prevê, a tela diz de quanto foi a diferença antes de confirmar.
 *
 * **O corpo foi reescrito na língua da capa** (`docs/linguagem.md`), e o layout
 * anterior saiu inteiro em vez de ganhar um caminho ao lado — era ele que
 * fazia esta tela parecer de outro aplicativo no toque seguinte:
 *
 * - a grade de sabores era um retângulo desenhado à mão por produto, com
 *   `borderWidth`, `borderRadius` e `backgroundColor` próprios. Isso é
 *   vocabulário do Orgânico chumbado numa tela que também abre no Papel, onde
 *   caixa nenhuma existe. Agora o sabor se escolhe tocando a etiqueta, que é o
 *   mesmo gesto do tipo de lugar em `app/places.tsx`, e as duas caras saem
 *   certas de graça;
 * - o crachá era `IconProduction`, traço fino de barra de abas, que some dentro
 *   do círculo pastel. Assunto é `Glyph*`, e o tom é o da produção em todo o
 *   aplicativo: quem vê laranja sabe que é produção antes de ler. O que vai
 *   baixar do almoxarifado é do assunto insumo, e vem em `mint` com o saco —
 *   duas cores porque são duas perguntas, e a segunda vira âmbar quando falta;
 * - "vai baixar do estoque" era uma tabela de linhas montada à mão, com o nome
 *   à esquerda e o número à direita; agora é `ListRow`, que já alinha o número
 *   em figura tabular e não repete desenho em cada linha.
 *
 * Nada aqui decide diferente: consulta, conta, confirmação e gravação são as
 * mesmas linhas de antes.
 */
export default function ProductionScreen() {
  return (
    <AreaProvider area="apricot">
      <Production />
    </AreaProvider>
  );
}

type Loaded = {
  products: Product[];
  graph: Record<string, Recipe>;
  /** O saldo da SALA em que o tacho roda, que é o piso que o livro-razão confere. */
  items: ItemWithCost[];
  names: Record<string, string>;
  runs: OpenRun[];
  /** O que tem em cada lugar, para dizer onde está o que falta aqui. */
  stock: PlaceStock[];
};

/** Quantas unidades um tacho promete, pela ficha. */
function plannedUnits(recipe: Recipe, product: Product, batches: number): number {
  const net = recipe.yieldAmount * (1 - recipe.lossFraction);
  const perUnit = product.yieldPerUnit ?? 0;
  if (perUnit <= 0) return 0;
  return Math.floor((net / perUnit) * batches);
}

function Production() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const words = t.app.production;

  const { data, loading, error, refresh } = useQuery<Loaded>(async () => {
    // O saldo lido é o da SALA em que o tacho roda — a mesma que a corrida grava,
    // logo abaixo. Ler o total da empresa aqui era a Lei 5 ao contrário: a tela
    // dizia que havia polpa, liberava o botão, e o piso do livro-razão (que conta
    // a sala, com razão escrita) recusava a corrida com um erro em inglês. Com a
    // polpa na câmara fria, TODA corrida batia nessa parede.
    const [products, graph, items, names, runs, stock] = await Promise.all([
      listProducts(empresaDaqui()),
      loadRecipeGraph(empresaDaqui()),
      // A MESMA pergunta que a escrita faz. Ler um escopo mais largo aqui libera um
      // botão que `recordProduction` vai recusar; ler um mais estreito esconde uma
      // corrida que rodaria. As duas metades já aconteceram neste arquivo, e é por
      // isso que a régua é uma função e não uma palavra escrita dos dois lados.
      consumoDaProducao().then((de) =>
        listItems(
          empresaDaqui(),
          undefined,
          false,
          de === 'sala' ? { sala: unidadeDaqui() } : { unidade: unidadeDaqui() },
        ),
      ),
      loadLabels(empresaDaqui()),
      openProductionRuns(empresaDaqui(), { unidade: unidadeDaqui() }),
      stockByPlace(empresaDaqui()),
    ]);
    return { products: products.filter((p) => p.recipeId), graph, items, names, runs, stock };
  });

  const [productId, setProductId] = useState<string | null>(null);
  const [batchText, setBatchText] = useState('');
  const [showBatches, setShowBatches] = useState(false);
  const [unitsText, setUnitsText] = useState('');
  /** Onde a pessoa está na grade: a linha e o tipo escolhidos até agora. */
  const [naGrade, setNaGrade] = useState<Escolha>({ lineId: null, categoryId: null, typeId: null });
  const [unitsTyped, setUnitsTyped] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = data?.products.find((p) => p.id === productId) ?? data?.products[0] ?? null;
  const recipe = selected?.recipeId ? data?.graph[selected.recipeId] : undefined;

  /**
   * **Quantas vezes — e quando há corrida aberta, quem responde é ELA.**
   *
   * O campo digitado é a resposta só no caminho direto. Ao FECHAR uma corrida, o
   * número que manda é o que a corrida declarou quando foi aberta: é ele que
   * `closeProductionRun` passa a `recordProduction`, e é dele que sai o consumo
   * gravado no razão.
   *
   * A tela lia o campo — que nasce vazio, porque abrir volta para o dia e desmonta o
   * formulário — e caía no ramo proporcional `units / perBatch`. Então a prévia, o
   * custo por unidade, a confirmação por extenso e o portão do botão falavam de um
   * número, e o razão gravava outro: no exemplo semeado, 17.075 g de polpa a R$ 0,64
   * na tela contra 18.000 g a R$ 0,67 no livro — R$ 15,40 por corrida, num custo
   * congelado que não se corrige, só se estorna.
   *
   * E o portão invertia a Lei 5 junto: calculando a falta sobre uma fração de tacho,
   * `short` saía vazio, o botão ficava liberado, e a escrita recusava com
   * `NotEnoughStockError`. O erro reclamava em vez de impedir.
   */
  const vezesDaCorrida =
    (data?.runs ?? []).find((r) => r.productId === selected?.id)?.batches ?? null;
  const batches = vezesDaCorrida ?? Math.max(0, (parseTyped(batchText) ?? 0) || 0);

  /**
   * O que a ficha prevê — e por que ela prevê um tacho quando ninguém disse.
   *
   * Lei 2, nenhum campo nasce vazio: tirar o campo de tacho da frente não pode
   * significar abrir a tela sem número nenhum. Então o previsto é o rendimento
   * de UM tacho enquanto ninguém declarar outro, e a dica diz de onde ele veio.
   *
   * Isto não é a suposição que o dono derrubou. Aquela decidia o CONSUMO por um
   * tacho suposto; esta preenche o campo do FATO com o valor mais provável, e o
   * consumo segue o número que ficar ali — inclusive se a pessoa apagar e
   * escrever 480.
   */
  const planned = recipe && selected ? plannedUnits(recipe, selected, batches > 0 ? batches : 1) : 0;

  // Lei 1: o que a ficha prevê não se pergunta. Só o que fugiu dela.
  const units = unitsTyped ? Math.max(0, (parseTyped(unitsText) ?? 0) || 0) : planned;

  /** O que um tacho cheio renderia deste produto. Zero se a ficha não fecha. */
  const perBatch = recipe && selected ? plannedUnits(recipe, selected, 1) : 0;

  /**
   * Quantos tachos o consumo vai debitar — e as duas respostas certas.
   *
   * Com tacho declarado, o consumo é do tacho: quem rodou um tacho e tirou 400
   * em vez de 480 gastou a polpa inteira, e a diferença é rendimento perdido,
   * que é exatamente o número que vale a pena registrar.
   *
   * Sem tacho declarado, o consumo é proporcional ao que saiu: quem só conta
   * caixa não está afirmando que gastou um tacho inteiro, e debitar um seria
   * inventar consumo que ninguém declarou. Antes disto o rascunho simplesmente
   * não existia sem tacho, e nada baixava do almoxarifado — o dono viu isso
   * antes de mim.
   *
   * Os dois caminhos existem e nenhum é configuração: caem do que a pessoa
   * digitou.
   */
  const consumedBatches = batches > 0 ? batches : perBatch > 0 ? units / perBatch : 0;

  const draft = useMemo(() => {
    if (!selected?.recipeId || !data || !recipe || consumedBatches <= 0 || units <= 0) return null;

    const needed = explodeRequirements(selected.recipeId, consumedBatches, data.graph);

    // A embalagem listada entra na prévia pela mesma conta que o livro-razão vai
    // fazer: por unidade, não por tacho.
    //
    // Sem isto a tela mentiria duas vezes na mesma corrida - "vai baixar do
    // estoque" esconderia o palito, e o custo previsto sairia menor que o
    // congelado. Quem opera compara os dois números; quem confere, um mês depois,
    // acha a diferença sem explicação.
    for (const linha of selected.packagingItems) {
      needed.set(linha.itemId, (needed.get(linha.itemId) ?? 0) + linha.quantityPerUnit * units);
    }

    // Onde mais está o insumo que falta aqui.
    //
    // Sem isto a tela vira parede: "falta polpa" com dezoito quilos de polpa na
    // câmara fria a três metros de distância. A frase que diz ONDE está é a
    // diferença entre um erro e uma instrução — e é só a sala nossa que conta:
    // o que já foi entregue numa loja não volta para o tacho.
    const salaDoTacho = unidadeDaqui();
    const nossasSalas = data.stock.filter(
      (place) =>
        place.locationId !== salaDoTacho &&
        (INTERNAL_PLACE_KINDS as readonly string[]).includes(place.kind),
    );

    const lines = [...needed].map(([itemId, baseUnits]) => {
      const item = data.items.find((i) => i.id === itemId);
      return {
        itemId,
        name: data.names[itemId] ?? itemId,
        baseUnits,
        unit: item?.baseUnit ?? '',
        rate: item?.averageRate ?? 0,
        held: item?.onHandBaseUnits ?? 0,
        elsewhere: nossasSalas
          .map((place) => ({
            room: place.locationName.trim() || t.app.places.factory,
            baseUnits: place.lines.find((l) => l.itemId === itemId)?.baseUnits ?? 0,
          }))
          .filter((where) => where.baseUnits > 0),
      };
    });

    const value = lines.reduce((sum, l) => sum + l.rate * l.baseUnits, 0);
    const short = lines.filter((l) => l.held < l.baseUnits);

    /**
     * Mesmo número que o livro-razão vai congelar — ou `null`, e nunca menor.
     *
     * O consumo (que já inclui a embalagem que sai do estoque) mais o que foi
     * digitado à mão. Quando o portão do dinheiro está fechado, a parcela digitada
     * vem nula, e somar zero no lugar dela seria o pior dos três estados: o
     * número não sai de cena, **encolhe** — não é travessão, não é zero, é um
     * custo plausível e errado. Então a conta inteira vira nula e a tela cala.
     *
     * O livro-razão continua congelando o custo CERTO, com a embalagem inteira:
     * ele lê a ficha por `listProductsForLedger`, que não tem portão.
     */
    const packaging = selected.unitPackagingRate;
    return {
      lines,
      unitCostRate: packaging === null ? null : value / units + packaging,
      short,
    };
  }, [selected, recipe, data, consumedBatches, units, t.app.places.factory]);

  // A corrida aberta deste produto, se houver.
  const aberta = (data?.runs ?? []).find((r) => r.productId === selected?.id);

  const onOpen = async () => {
    if (!selected) return;
    // Abrir tacho é ato de tacho: quem toca aqui está declarando um, e o campo
    // aparece para quem for rodar mais. Mandar zero abriria uma corrida que não
    // consome nada e mentiria no fechamento.
    const quantos = batches > 0 ? batches : 1;
    if (!showBatches) {
      setShowBatches(true);
      setBatchText(String(quantos));
    }
    await openProductionRun(empresaDaqui(), {
      productId: selected.id,
      batches: quantos,
      // A unidade DESTE aparelho, como o lançamento direto já manda. Sem ela a
      // corrida nascia sempre na primeira unidade e ficava invisível no celular
      // que a abriu: sem cartão, sem "Fechar", sem "Cancelar" — e o picolé
      // entrava no estoque da outra cidade.
      locationId: unidadeDaqui(),
    });
    // E volta para o dia, onde o tacho aberto tem cartão. Quem marca o tacho
    // marca e sai andando; ficar no formulário depois de abrir é ficar parado
    // numa tela que só terá o que dizer quando a corrida acabar.
    voltar();
  };

  const onCancel = async () => {
    if (!aberta) return;
    const yes = await askConfirm({
      title: words.cancelTitle,
      message: words.cancelBody,
      confirmLabel: words.cancel,
    });
    if (!yes) return;
    await cancelProductionRun(empresaDaqui(), aberta.id);
    refresh();
  };

  const onRecord = async () => {
    if (!selected || !draft || saving) return;

    const go = await askConfirm({
      title: words.confirmTitle,
      confirmLabel: words.confirmAction,
      // Sem tacho declarado a frase não fala em tacho: dizer "em 0 tachos"
      // seria confirmar uma coisa que a pessoa não disse.
      message: fill(
        draft.unitCostRate === null
          ? batches > 0
            ? words.confirmBodyNoCost
            : words.confirmBodyNoBatchNoCost
          : batches > 0
            ? words.confirmBody
            : words.confirmBodyNoBatch,
        {
        units: plural(units, words.unitCount, formatQuantity(units, locale)),
        product: selected.name,
        batches: plural(batches, words.batchCount, formatQuantity(batches, locale)),
        lines: joinList(
          // O "de" saiu do template e foi para o dicionário: em inglês a frase é
          // "18.000 g OF pulp", e cravado aqui ela sairia em português no meio de
          // uma interface traduzida. Foi o guard de frase que achou.
          draft.lines.map((l) =>
            fill(t.common.amountOf, {
              amount: `${formatQuantity(l.baseUnits, locale)} ${l.unit}`,
              name: l.name,
            }),
          ),
          t.common.and,
        ),
          cost: formatMoney(Math.round(draft.unitCostRate ?? 0), locale),
        },
      ),
    });
    if (!go) return;

    setSaving(true);
    try {
      // Com tacho aberto, fechar é o caminho: as linhas nascem com o id da
      // corrida como grupo e com a hora em que ela COMEÇOU, não a de agora.
      // Sem tacho aberto, é o lançamento direto de sempre - quem trabalha
      // assim nunca toca no outro botão.
      if (aberta) {
        await closeProductionRun(empresaDaqui(), {
          runId: aberta.id,
          unitsProduced: units,
          // O dia em que o tacho foi ABERTO, no fuso da fábrica: uma corrida
          // que começou às 23h de segunda e fechou à 1h de terça é produção de
          // segunda, e é essa data que vai na etiqueta.
          producedOn: localDate(aberta.openedAt, locale.timeZone),
        });
      } else {
        await recordProduction(empresaDaqui(), {
          productId: selected.id,
          locationId: unidadeDaqui(),
          batches: consumedBatches,
          unitsProduced: units,
          // O dia da FÁBRICA, não o do relógio universal: um tacho fechado às
          // 22h em Manaus pertence ao dia que a equipe viveu, e é essa data que
          // vai impressa na etiqueta do lote.
          producedOn: localDate(nowIso(), locale.timeZone),
        });
      }
      // Volta para a aba do dia. Antes esta tela era a própria aba e ficar
      // nela fazia sentido; agora ela é um formulário, e ficar num formulário
      // já gravado deixa a pessoa sem barra de abas e sem ver o total do dia
      // se mexer por causa do que ela acabou de lançar.
      voltar();
    } catch (e) {
      // A frase é da tela, não do erro.
      //
      // `NotEnoughStockError.message` é inglês de programador ("Not enough stock:
      // Polpa de morango") e chegava cru no diálogo, num aplicativo que não guarda
      // uma palavra em tela nenhuma. O erro carrega FATO — o que falta, quanto
      // precisa, quanto tem — e quem escreve português é aqui.
      const dito =
        e instanceof NotEnoughStockError
          ? fill(words.missingStock, { items: e.missing.map((m) => m.name).join(', ') })
          : e instanceof Error
            ? e.message
            : String(e);
      await askConfirm({
        title: e instanceof NotEnoughStockError ? words.missingTitle : words.failed,
        message: dito,
        acknowledge: true,
      });
    } finally {
      setSaving(false);
    }
  };

  // As camadas maiores primeiro, com o resto na unidade: 250 é "5 caixas de
  // 50", e 263 é "5 caixas de 50 e 13 unidades" - dizer só as caixas esconderia
  // treze picolés que existem.
  const packed = useMemo(
    () => (selected && units > 0 ? formatPacked(units, selected.packaging, t.units, locale) : ''),
    [selected, units, locale, t.units],
  );

  if (!loading && (!data || data.products.length === 0)) {
    return (
      <CollapsingHeader
        cena="producao"
        title={words.formTitle}
        overline={words.formOverline}
        erro={error}
        denovo={refresh}
      >
        {/* Estado vazio é desenho, uma frase e a saída — e a saída aqui é a
            receita, que se cadastra noutra tela e não se navega daqui: esta é
            uma tela empilhada, e o caminho de volta é o de sempre. */}
        <Reveal index={0}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{words.noRecipes}</Text>
          </Card>
        </Reveal>
      </CollapsingHeader>
    );
  }

  // A quebra só existe contra um tacho declarado. Sem ele, o "previsto" é uma
  // sugestão de preenchimento, e comparar o que saiu contra a própria sugestão
  // inventaria uma diferença que ninguém prometeu.
  const missed = batches > 0 && planned > 0 && units > 0 && units !== planned;

  /** A cascata não pula número: sem rascunho, a ação sobe uma posição. */
  const indiceAcao = draft ? 2 : 1;

  // O cabeçalho é do FORMULÁRIO, não da aba. Ele dizia "Produção · o que saiu
  // hoje" — o título do relato do dia — numa tela onde ninguém relatou nada
  // ainda. Rótulo que discorda do que está embaixo dele foi o defeito mais
  // repetido desta rodada.
  return (
    <CollapsingHeader cena="producao" title={words.formTitle} overline={words.formOverline}>
      {/* O que você produziu: o sabor, o número e — para quem trabalha assim —
          a receita que rodou. É um assunto só, porque é um ato só, e por isso é
          um cartão só: escolher o sabor sem dizer quanto saiu não lança nada.

          O sabor se escolhe tocando o nome, e a etiqueta acesa é a escolhida.
          Nunca cor sozinha: a palavra continua dita por extenso, que é o que
          serve de luva e sob luz ruim. */}
      <Reveal index={0}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
          title={words.pick}
        >
          <View style={{ gap: space.lg }}>
            {/* A GRADE, e não uma fileira. O aplicativo obriga a montar linha, tipo e
                variação no cadastro e entregava tudo achatado aqui: numa fábrica de
                três tipos de picolé, dois volumes de pote e um revendido, isso é
                dezenas de etiquetas lado a lado. A mesma peça serve o transporte, que
                é o pedido de coerência do dono — "a diferença é que numa entra e na
                outra sai".

                Ela some sozinha onde não há o que escolher: com uma linha só, ou com o
                exemplo semeado que não tem grade nenhuma, sobra a fileira de sempre. */}
            <ProductPicker
              produtos={(data?.products ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                lineId: p.lineId,
                categoryId: p.categoryId,
                typeId: p.typeId,
                flavorId: p.flavorId,
              }))}
              nome={(id) => data?.names[id] ?? id}
              escolha={naGrade}
              onEscolha={setNaGrade}
              escolhido={selected?.id ?? null}
              onEscolher={setProductId}
            />

            {/* O fato primeiro. Este é o número que a pessoa acabou de contar, e
                é o único campo obrigatório da tela.

                **E ele se conta na embalagem da fábrica, não só em unidade solta.**
                O dono descreveu a conta da casa dele — 44 picolés por caixa, 6 caixas
                por engradado, 264 no total — e pediu que a pessoa escolha em que
                camada digita. A peça que faz isso existe desde sempre (`UnitStepper`)
                e o docblock dela já previa ESTA tela: "o tacho rendeu 250 unidades, e
                os engradados são a consequência, ecoada embaixo". Ela só nunca tinha
                sido chamada aqui, e o teclado que a produção precisa foi acrescentado
                nela em vez de virar uma segunda peça ao lado.

                Começa na unidade de propósito: quem acabou de bater um tacho conta o
                que saiu, e a caixa é consequência. Na separação é o contrário, e lá a
                mesma peça começa no maior. */}
            <Text style={[type.overline, { color: color.inkFaint }]}>{words.units}</Text>
            <UnitStepper
              hierarchy={selected?.packaging ?? { tiers: [{ id: 'unit', perBaseUnit: 1 }] }}
              locale={locale}
              tierLabel={(id, n) => plural(n, t.units[id as keyof typeof t.units] ?? t.units.unit)}
              value={units}
              onChange={(n) => {
                setUnitsTyped(true);
                setUnitsText(String(n));
              }}
              labels={t.stepper}
              initialTierId="unit"
              digitavel
              rotulo={words.units}
            />
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {planned > 0
                ? fill(words.expected, { units: formatQuantity(planned, locale) })
                : words.unitsHint}
            </Text>

            {/* A conta do meio, atrás de um toque. Quem trabalha por tacho abre
                uma vez e ganha o pré-preenchido da ficha; quem conta caixa nunca
                abre, e a tela não pergunta. O tacho no botão é o que diz do que
                se trata antes de a frase ser lida. */}
            {showBatches ? (
              <Field
                label={words.batches}
                value={batchText}
                onChangeText={setBatchText}
                keyboardType="numeric"
                // A dica fala na unidade que o DONO escolheu na receita: "cada vez
                // rende 40 L". Antes ela dizia "quantos tachos", que é palavra de
                // fábrica de sorvete num aplicativo que vai para qualquer fábrica.
                hint={
                  recipe
                    ? fill(words.batchesHint, {
                        yield: `${formatQuantity(recipe.yieldAmount, locale)} ${recipe.yieldUnit}`,
                      })
                    : undefined
                }
              />
            ) : (
              <Button
                label={words.byBatch}
                variant="ghost"
                icon={(c) => <GlyphKettle size={22} color={c} weight={traco} />}
                onPress={() => {
                  setShowBatches(true);
                  if (!batchText) setBatchText('1');
                }}
                style={{
                  alignSelf: 'flex-start',
                  paddingVertical: space.sm,
                  paddingHorizontal: space.lg,
                }}
              />
            )}

            {/* O tacho que já está rodando: fato, não alerta. Ele é o que
                explica o botão dizer "fechar" em vez de "registrar". */}
            {aberta ? (
              <Chip
                signal="neutral"
                label={fill(words.running, { time: formatTime(aberta.openedAt, locale) })}
              />
            ) : null}

            {/* O que aquele número vira na prateleira.
                "Dá 5 caixas de 50" é aritmética que o operador não deveria ter de
                fazer de cabeça: ele conta unidades, a loja recebe caixas. */}
            {selected && units > 0 && packed ? (
              <Text style={[type.secondary, { color: color.inkMuted }]}>
                {fill(words.packedAs, { packed })}
              </Text>
            ) : null}

            {missed ? (
              <Chip
                signal={units < planned ? 'warning' : 'ok'}
                label={fill(units < planned ? words.shortfall : words.over, {
                  units: plural(
                    Math.abs(planned - units),
                    words.unitCount,
                    formatQuantity(Math.abs(planned - units), locale),
                  ),
                  percent: String(Math.round((Math.abs(planned - units) / planned) * 100)),
                })}
              />
            ) : null}
          </View>
        </Card>
      </Reveal>

      {/* O que sai do almoxarifado, que é outra pergunta e por isso outro
          cartão: assunto insumo, tom do insumo, o saco no crachá. Ele vira âmbar
          quando falta alguma coisa — e aí o cartão inteiro muda de cor, porque a
          falta não é detalhe de uma linha, é o motivo de a corrida não passar.

          Peça sem dado não vira cartão: sem sabor, sem número ou sem ficha que
          feche não existe rascunho, e um cartão dizendo zero baixaria nada. */}
      {draft ? (
        <Reveal index={1}>
          <Card
            hue={draft.short.length > 0 ? color.warning : palette.mint}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={words.willConsume}
          >
            {/* Uma linha por insumo, com o quanto à direita em figura tabular:
                uma coluna de números que se compara de olho. A faixa marca a
                linha que não tem o que sair — a falta é de um item, e dizer
                qual poupa a busca no almoxarifado. */}
            {draft.lines.map((l) => (
              <ListRow
                key={l.itemId}
                label={l.name}
                trailing={`${formatQuantity(l.baseUnits, locale)} ${l.unit}`}
                trailingTone="muted"
                signal={l.held < l.baseUnits ? 'warning' : undefined}
              />
            ))}

            {draft.short.length > 0 ? (
              <Text style={[type.caption, { color: color.warning, marginTop: space.sm }]}>
                {fill(words.missingStock, {
                  items: draft.short.map((l) => l.name).join(', '),
                })}
              </Text>
            ) : null}

            {/* E onde está o que falta, quando está numa sala nossa. Uma parede
                que diz "falta polpa" com dezoito quilos de polpa na câmara a três
                metros é a Lei 5 pela metade: impede, e não orienta. */}
            {draft.short.map((l) =>
              l.elsewhere.length > 0 ? (
                <Text
                  key={`onde-${l.itemId}`}
                  style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}
                >
                  {fill(words.missingElsewhere, {
                    item: l.name,
                    where: l.elsewhere
                      .map(
                        (onde) =>
                          `${formatQuantity(onde.baseUnits, locale)} ${l.unit} ${words.missingIn} ${onde.room}`,
                      )
                      .join(', '),
                  })}
                </Text>
              ) : null,
            )}

            {/* O número que a corrida vai congelar. Ele fecha o cartão porque é
                a conclusão do que está acima: as linhas são a conta aberta
                (Lei 6), e o custo é o que elas somam por unidade. */}
            {draft.unitCostRate === null ? (
              /* A conta aberta continua em cima (Lei 6: as linhas do consumo).
                 O que falta é a conclusão em dinheiro, e a frase diz onde ela
                 mora em vez de deixar o cartão terminar no meio. */
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.lg }]}>
                {t.common.moneyHidden}
              </Text>
            ) : (
              <>
                <Text style={[type.overline, { color: color.inkFaint, marginTop: space.lg }]}>
                  {words.unitCost.toUpperCase()}
                </Text>
                <Text style={[type.figure, { color: color.ink }]}>
                  {formatMoney(Math.round(draft.unitCostRate), locale)}
                </Text>
              </>
            )}
          </Card>
        </Reveal>
      ) : null}

      {/* Law 5: an error stops the thing, it does not complain about it.
          This screen computed the shortfall, printed it in orange, and left the
          button live - so a run of ten kettles against four kilos of pulp went
          in, and the storeroom went to MINUS 140.000 g with a headline reading
          "PARADO NO ESTOQUE -R$ 1.447,44". A negative physical balance is not a
          number anyone can act on; it means the count is wrong, and the way out
          is to count or to enter the invoice, which the message now says. */}
      <Reveal index={indiceAcao}>
        <Button
          label={saving ? words.recording : aberta ? words.close : words.record}
          icon={(c) => <GlyphProduction size={22} color={c} weight={traco} />}
          onPress={onRecord}
          weighty
          disabled={!draft || saving || draft.short.length > 0}
        />
      </Reveal>

      {/* Marcar o tacho agora e fechar quando sair, ou lançar tudo de uma vez.
          Os dois caminhos existem porque a fábrica escolhe: quem trabalha em
          corrida aberta marca na hora de carregar; quem lança no fim do turno
          nunca toca neste botão, e a tela é a mesma. A frase que explica os dois
          estava só no comentário e existia no dicionário nos três idiomas sem
          uma tela lendo — agora ela é dita para quem decide. */}
      <Reveal index={indiceAcao + 1}>
        {!aberta ? (
          <View style={{ gap: space.sm }}>
            <Button
              label={words.open}
              variant="ghost"
              onPress={onOpen}
              disabled={!selected || saving}
            />
            <Text style={[type.caption, styles.hint, { color: color.inkFaint }]}>
              {words.openHint}
            </Text>
          </View>
        ) : (
          <Button label={words.cancel} variant="ghost" onPress={onCancel} />
        )}
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  hint: { textAlign: 'center' },
});
