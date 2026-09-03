import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { IconProduction } from '@/components/icons';
import {
  NotEnoughStockError,
  openProductionRun,
  openProductionRuns,
  cancelProductionRun,
  closeProductionRun,
  type OpenRun,
  defaultLocationId,
  labels as loadLabels,
  listItems,
  listProducts,
  loadRecipeGraph,
  recordProduction,
  type ItemWithCost,
  type Product,
} from '@/data/repository';
import { nowIso } from '@/data/db';
import { localDate } from '@/domain/day';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
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
  items: ItemWithCost[];
  names: Record<string, string>;
  runs: OpenRun[];
};

/** Quantas unidades um tacho promete, pela ficha. */
function plannedUnits(recipe: Recipe, product: Product, batches: number): number {
  const net = recipe.yieldAmount * (1 - recipe.lossFraction);
  const perUnit = product.yieldPerUnit ?? 0;
  if (perUnit <= 0) return 0;
  return Math.floor((net / perUnit) * batches);
}

function Production() {
  const { color, type, space, radius, palette } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();

  const { data, loading, refresh } = useQuery<Loaded>(async () => {
    const [products, graph, items, names, runs] = await Promise.all([
      listProducts(LOCAL_COMPANY_ID),
      loadRecipeGraph(LOCAL_COMPANY_ID),
      listItems(LOCAL_COMPANY_ID),
      loadLabels(LOCAL_COMPANY_ID),
      openProductionRuns(LOCAL_COMPANY_ID),
    ]);
    return { products: products.filter((p) => p.recipeId), graph, items, names, runs };
  });

  const [productId, setProductId] = useState<string | null>(null);
  const [batchText, setBatchText] = useState('');
  const [showBatches, setShowBatches] = useState(false);
  const [unitsText, setUnitsText] = useState('');
  const [unitsTyped, setUnitsTyped] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = data?.products.find((p) => p.id === productId) ?? data?.products[0] ?? null;
  const recipe = selected?.recipeId ? data?.graph[selected.recipeId] : undefined;
  const batches = Math.max(0, (parseTyped(batchText) ?? 0) || 0);

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

    const lines = [...needed].map(([itemId, baseUnits]) => {
      const item = data.items.find((i) => i.id === itemId);
      return {
        itemId,
        name: data.names[itemId] ?? itemId,
        baseUnits,
        unit: item?.baseUnit ?? '',
        rate: item?.averageRate ?? 0,
        held: item?.onHandBaseUnits ?? 0,
      };
    });

    const value = lines.reduce((sum, l) => sum + l.rate * l.baseUnits, 0);
    const short = lines.filter((l) => l.held < l.baseUnits);

    // Mesmo número que o livro-razão vai congelar: o consumo (que agora inclui a
    // embalagem que sai do estoque) mais o que foi digitado à mão.
    const packaging = selected.unitPackagingCents;
    return { lines, unitCostRate: value / units + packaging, short };
  }, [selected, recipe, data, consumedBatches, units]);

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
    await openProductionRun(LOCAL_COMPANY_ID, { productId: selected.id, batches: quantos });
    // E volta para o dia, onde o tacho aberto tem cartão. Quem marca o tacho
    // marca e sai andando; ficar no formulário depois de abrir é ficar parado
    // numa tela que só terá o que dizer quando a corrida acabar.
    router.back();
  };

  const onCancel = async () => {
    if (!aberta) return;
    const yes = await askConfirm({
      title: t.app.production.cancelTitle,
      message: t.app.production.cancelBody,
      confirmLabel: t.app.production.cancel,
    });
    if (!yes) return;
    await cancelProductionRun(LOCAL_COMPANY_ID, aberta.id);
    refresh();
  };

  const onRecord = async () => {
    if (!selected || !draft || saving) return;

    const go = await askConfirm({
      title: t.app.production.confirmTitle,
      confirmLabel: t.app.production.confirmAction,
      // Sem tacho declarado a frase não fala em tacho: dizer "em 0 tachos"
      // seria confirmar uma coisa que a pessoa não disse.
      message: fill(batches > 0 ? t.app.production.confirmBody : t.app.production.confirmBodyNoBatch, {
        units: plural(units, t.app.production.unitCount, formatQuantity(units, locale)),
        product: selected.name,
        batches: plural(batches, t.app.production.batchCount, formatQuantity(batches, locale)),
        lines: joinList(
          draft.lines.map((l) => `${formatQuantity(l.baseUnits, locale)} ${l.unit} de ${l.name}`),
          t.common.and,
        ),
        cost: formatMoney(Math.round(draft.unitCostRate), locale),
      }),
    });
    if (!go) return;

    setSaving(true);
    try {
      // Com tacho aberto, fechar é o caminho: as linhas nascem com o id da
      // corrida como grupo e com a hora em que ela COMEÇOU, não a de agora.
      // Sem tacho aberto, é o lançamento direto de sempre - quem trabalha
      // assim nunca toca no outro botão.
      if (aberta) {
        await closeProductionRun(LOCAL_COMPANY_ID, {
          runId: aberta.id,
          unitsProduced: units,
          // O dia em que o tacho foi ABERTO, no fuso da fábrica: uma corrida
          // que começou às 23h de segunda e fechou à 1h de terça é produção de
          // segunda, e é essa data que vai na etiqueta.
          producedOn: localDate(aberta.openedAt, locale.timeZone),
        });
      } else {
        await recordProduction(LOCAL_COMPANY_ID, {
          productId: selected.id,
          locationId: defaultLocationId(LOCAL_COMPANY_ID),
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
      router.back();
    } catch (e) {
      await askConfirm({
        title:
          e instanceof NotEnoughStockError
            ? t.app.production.missingTitle
            : t.app.production.failed,
        message: e instanceof Error ? e.message : String(e),
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
      <CollapsingHeader title={t.app.production.title} overline={t.app.production.overline}>
        <Card>
          <Text style={[type.body, { color: color.inkMuted }]}>{t.app.production.noRecipes}</Text>
        </Card>
      </CollapsingHeader>
    );
  }

  // A quebra só existe contra um tacho declarado. Sem ele, o "previsto" é uma
  // sugestão de preenchimento, e comparar o que saiu contra a própria sugestão
  // inventaria uma diferença que ninguém prometeu.
  const missed = batches > 0 && planned > 0 && units > 0 && units !== planned;


  return (
    <CollapsingHeader title={t.app.production.title} overline={t.app.production.overline}>
      {/* Os sabores como cartões, não como lista de rádio.
          A prancha os desenha numa grade de dois: quem está de luva escolhe por
          alvo grande e por posição, não lendo uma bolinha. O selecionado ganha
          um anel na cor da área - nunca um fundo cheio, que é a regra de cor
          deste desenho. */}
      <View style={[styles.grid, { gap: space.md }]}>
        {(data?.products ?? []).map((p) => {
          const active = p.id === selected?.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setProductId(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={p.name}
              style={[
                styles.tile,
                {
                  borderColor: active ? palette.apricot : color.line,
                  borderWidth: active ? 2 : 1,
                  borderRadius: radius.lg,
                  backgroundColor: color.surface,
                  padding: space.md,
                  gap: space.sm,
                },
              ]}
            >
              <IconProduction size={26} color={active ? palette.apricot : color.inkFaint} />
              <Text
                style={[type.body, { color: active ? color.ink : color.inkMuted }]}
                numberOfLines={2}
              >
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <View style={{ gap: space.lg }}>
          {/* O fato primeiro. Este é o número que a pessoa acabou de contar, e
              é o único campo obrigatório da tela. */}
          <Field
            label={t.app.production.units}
            value={unitsTyped ? unitsText : planned > 0 ? String(planned) : ''}
            onChangeText={(next) => {
              setUnitsTyped(true);
              setUnitsText(next);
            }}
            keyboardType="numeric"
            hint={
              planned > 0
                ? fill(t.app.production.expected, { units: formatQuantity(planned, locale) })
                : t.app.production.unitsHint
            }
          />

          {/* A conta do meio, atrás de um toque. Quem trabalha por tacho abre
              uma vez e ganha o pré-preenchido da ficha; quem conta caixa nunca
              abre, e a tela não pergunta. */}
          {showBatches ? (
            <Field
              label={t.app.production.batches}
              value={batchText}
              onChangeText={setBatchText}
              keyboardType="numeric"
              // A dica fala na unidade que o DONO escolheu na receita: "cada vez
              // rende 40 L". Antes ela dizia "quantos tachos", que é palavra de
              // fábrica de sorvete num aplicativo que vai para qualquer fábrica.
              hint={
                recipe
                  ? fill(t.app.production.batchesHint, {
                      yield: `${formatQuantity(recipe.yieldAmount, locale)} ${recipe.yieldUnit}`,
                    })
                  : undefined
              }
            />
          ) : (
            <Pressable
              onPress={() => {
                setShowBatches(true);
                if (!batchText) setBatchText('1');
              }}
              accessibilityRole="button"
              accessibilityLabel={t.app.production.byBatch}
            >
              <Text style={[type.secondary, { color: palette.apricot }]}>
                {t.app.production.byBatch}
              </Text>
            </Pressable>
          )}
          {aberta ? (
            <Text style={[type.secondary, { color: palette.apricot }]}>
              {fill(t.app.production.running, { time: formatTime(aberta.openedAt, locale) })}
            </Text>
          ) : null}

          {/* O que aquele número vira na prateleira.
              A prancha escreve "dá 5 caixas de 50" embaixo da quantidade, e é
              aritmética que o operador não deveria ter de fazer de cabeça: ele
              conta unidades, a loja recebe caixas. `breakdown()` já existia e
              nunca tinha sido chamado aqui. */}
          {selected && units > 0 && packed ? (
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {fill(t.app.production.packedAs, { packed })}
            </Text>
          ) : null}

          {missed ? (
            <Chip
              signal={units < planned ? 'warning' : 'ok'}
              label={fill(
                units < planned ? t.app.production.shortfall : t.app.production.over,
                {
                  units: plural(
                    Math.abs(planned - units),
                    t.app.production.unitCount,
                    formatQuantity(Math.abs(planned - units), locale),
                  ),
                  percent: String(Math.round((Math.abs(planned - units) / planned) * 100)),
                },
              )}
            />
          ) : null}
        </View>
      </Card>

      {draft ? (
        <Card tone={draft.short.length > 0 ? 'warning' : 'area'}>
          <Text style={[type.cardTitle, { color: color.ink }]}>
            {t.app.production.willConsume}
          </Text>
          <View style={{ marginTop: space.md, gap: space.xs }}>
            {draft.lines.map((l) => (
              <View key={l.itemId} style={styles.row}>
                <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                  {formatQuantity(l.baseUnits, locale)} {l.unit}
                </Text>
              </View>
            ))}
          </View>

          {draft.short.length > 0 ? (
            <Text style={[type.caption, { color: color.warning, marginTop: space.md }]}>
              {fill(t.app.production.missingStock, {
                items: draft.short.map((l) => l.name).join(', '),
              })}
            </Text>
          ) : null}

          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.lg }]}>
            {t.app.production.unitCost}
          </Text>
          <Text style={[type.figure, { color: color.ink }]}>
            {formatMoney(Math.round(draft.unitCostRate), locale)}
          </Text>
        </Card>
      ) : null}

      {/* Law 5: an error stops the thing, it does not complain about it.
          This screen computed the shortfall, printed it in orange, and left the
          button live - so a run of ten kettles against four kilos of pulp went
          in, and the storeroom went to MINUS 140.000 g with a headline reading
          "PARADO NO ESTOQUE -R$ 1.447,44". A negative physical balance is not a
          number anyone can act on; it means the count is wrong, and the way out
          is to count or to enter the invoice, which the message now says. */}
      <Button
        label={
          saving
            ? t.app.production.recording
            : aberta
              ? t.app.production.close
              : t.app.production.record
        }
        onPress={onRecord}
        disabled={!draft || saving || draft.short.length > 0}
      />

      {/* Marcar o tacho agora e fechar quando sair, ou lançar tudo de uma vez.
          Os dois caminhos existem porque a fábrica escolhe: quem trabalha em
          corrida aberta marca na hora de carregar; quem lança no fim do turno
          nunca toca neste botão, e a tela é a mesma. */}
      {!aberta ? (
        <Button
          label={t.app.production.open}
          variant="ghost"
          onPress={onOpen}
          disabled={!selected || saving}
        />
      ) : (
        <Button label={t.app.production.cancel} variant="ghost" onPress={onCancel} />
      )}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { flexGrow: 1, flexBasis: '46%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});
