import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, priceSignal } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { GlyphPrice, GlyphPurchase, GlyphSack } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import {
  itemCosts,
  labels as loadLabels,
  listItems,
  listProducts,
  loadRecipeGraph,
  recordPurchase,
  type ItemWithCost,
  purchaseToBaseUnits,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fromDecimal, rate, type Rate } from '@/domain/money';
import { applyCostEvent, judgePriceChange } from '@/domain/cost';
import { costPerProductUnit, packagingRatePerUnit, costRecipe } from '@/domain/recipe';
import { parseTyped } from '@/domain/number';
import { localDate } from '@/domain/day';
import { nowIso } from '@/data/db';

import { currencySymbol, fill, formatMoney, formatPercent, formatQuantity, plural } from '@/i18n';
import type { Dictionary, LocaleSettings } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * As respostas para "quando você pediu", em dias atrás.
 *
 * `null` é "não sei" e vem primeiro porque é o padrão. O resto cobre o que uma
 * fábrica lembra sem olhar papel: hoje, ontem, anteontem, três dias, uma semana.
 * Mais que isso ninguém responde de cabeça, e um campo de data aberto seria o
 * teclado que esta casa evita no chão de fábrica.
 */
const QUANDO_PEDIU: readonly (number | null)[] = [null, 0, 1, 2, 3, 7];

/**
 * Entering an invoice - the most valuable screen in the app per keystroke.
 *
 * "Update the price of sugar" never becomes a task here. The buyer records what
 * they paid, and the same event moves the moving average, writes the price
 * history and recalculates every recipe that uses the item. One entry, five
 * consequences, none of them typed by anybody.
 *
 * The comparison against the last invoice shows up *while the decision is still
 * open* - standing in front of the supplier - not in a report next month. Law
 * 4: warn on the date of the decision, not on the date of the problem.
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`), e
 * o layout anterior saiu inteiro em vez de ganhar um caminho ao lado. O que saiu,
 * item por item, porque cada peça era vocabulário de outro aplicativo: uma fita
 * de pastilhas desenhada à mão — `borderWidth`, `borderRadius: 999` e um
 * `${accent}18` de fundo — que no Papel virava justamente a "caixa" que o dono
 * circulou; quatro `Card tone="area"` sem crachá nenhum, então a tela inteira era
 * parágrafo cinza sem um desenho para dizer de que assunto se falava; e a lista
 * do impacto montada linha por linha com `StyleSheet` local, que é o `ListRow`
 * reimplementado pior.
 *
 * O que existe agora são três leituras, na ordem em que a compra se decide:
 * **o que chegou** (qual insumo, quantos e por quanto — o saco), **antes de
 * fechar** (a nota contra a anterior, enquanto o fornecedor ainda está na porta)
 * e **o que a nota mexeu** (o custo por unidade de cada produto, depois de
 * gravar). Nenhuma caixa é desenhada aqui: `Card`, `Field`, `Chip`, `Button` e
 * `ListRow` já viram régua no Papel e bloco no Orgânico.
 *
 * O tom é `palette.sky` porque o assunto é dinheiro — a nota move o custo, e é
 * isso que a tela existe para fazer. A área continua `sage`, que é compras: o
 * acento do cabeçalho responde "onde estou", o tom do cartão responde "do que se
 * fala aqui", e as duas perguntas são diferentes.
 */
export default function PurchaseScreen() {
  return (
    <AreaProvider area="sage">
      <PurchaseForm />
    </AreaProvider>
  );
}

/** What one recorded invoice did to the cost of the things made from it. */
type Impact = { name: string; before: number; after: number };

function PurchaseForm() {
  const { color, type, space, palette, traco } = useTheme();
  const confirm = useConfirm();
  const { locale, t } = useLocale();
  const router = useRouter();

  /**
   * O que dá para comprar, e quantos itens existem — que são duas perguntas.
   *
   * A consulta devolvia só a lista filtrada, e o estado vazio dizia "Nada
   * cadastrado ainda." Com um insumo cadastrado sem `purchaseToBase`, a frase
   * era falsa: existe o insumo, ele só não tem como entrar numa nota ainda. E o
   * caminho é o que o próprio aplicativo oferece — o assistente cria o item
   * quando não consegue ler o tamanho da embalagem e diz "dá para completar
   * depois na tela".
   */
  const { data, loading, refresh } = useQuery(() =>
    listItems(LOCAL_COMPANY_ID).then((all) => ({
      compraveis: all.filter((i) => i.purchaseToBase !== null),
      cadastrados: all.length,
    })),
  );

  // Arriving from an item opens on that item, so the buyer does not hunt for
  // what they were already looking at.
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(itemId ?? null);
  const [supplier, setSupplier] = useState('');
  /**
   * Há quantos dias o pedido foi feito — `null` é "não sei", que é o padrão.
   *
   * Em dias e não em data porque o teclado de data não existe nesta casa: as
   * telas perguntam "amanhã, +2, +7" e a pessoa toca. Aqui é o espelho disso,
   * para trás, e o que o banco recebe é a data calculada.
   */
  const [pedidoHaDias, setPedidoHaDias] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [total, setTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<Impact[] | null>(null);

  const items = data?.compraveis ?? [];
  const selected: ItemWithCost | null =
    items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const num = (s: string) => parseTyped(s) ?? NaN;

  const draft = useMemo(() => {
    if (!selected) return null;

    const packs = num(quantity);
    const paid = num(total);
    if (!Number.isFinite(packs) || packs <= 0) return null;
    if (!Number.isFinite(paid) || paid <= 0) return null;

    // The conversion lives in one place. This screen used to do its own
    // `Math.round(packs * factor)` while the repository exported the same rule
    // to nobody: two implementations that agree today and diverge the first
    // time one of them is corrected, with nothing to say which is right.
    const baseUnits = purchaseToBaseUnits(selected, packs);
    const totalCents = fromDecimal(paid);

    // What this invoice alone costs per base unit, and where it lands the
    // average once it blends with what is already on hand.
    const thisRate = rate(paid, baseUnits);
    /**
     * A média de partida — e `?? 0` aqui é a mesma coisa que "insumo sem nota".
     *
     * Esta tela é a única em que o dinheiro é DIGITADO pela pessoa: a nota é dela
     * e não há o que esconder do que ela mesma escreveu. O que vem do banco é a
     * média anterior, e é só ela que o portão esconde — a frase que a anuncia sai
     * mais abaixo. Não existe capacidade própria de "lançar compra" no vocabulário
     * (`src/domain/access.ts` tem doze valores e nenhum deles é isso), então quem
     * compra é quem vê custo, por construção; se um dia houver, o enum do servidor
     * muda junto e o `agreement.test.ts` cobra as duas metades.
     */
    const after = applyCostEvent(
      { baseUnits: selected.onHandBaseUnits, averageRate: selected.averageRate ?? rate(0, 1) },
      { kind: 'purchase', baseUnits, totalCents, at: new Date().toISOString() },
    );

    const previous = selected.lastRate;
    const change = previous && previous > 0 ? (thisRate - previous) / previous : null;

    return {
      packs,
      paid,
      // Only for the sentence that spells the conversion out loud; the maths
      // above no longer touches it.
      factor: selected.purchaseToBase ?? 1,
      baseUnits,
      totalCents,
      thisRate,
      after,
      previous,
      change,
    };
  }, [selected, quantity, total]);

  // How this price should be read, decided in one place that has a test rather
  // than by three copies of the same threshold inside the markup below.
  const verdict = draft && draft.change !== null ? judgePriceChange(draft.change) : null;

  const perPackNow = draft ? draft.paid / draft.packs : 0;
  const perPackBefore =
    selected?.lastRate && selected.purchaseToBase
      ? (selected.lastRate * selected.purchaseToBase) / 100
      : null;

  const onSave = async () => {
    if (!selected || !draft) return;

    const go = await confirm({
      title: t.app.purchase.confirmTitle,
      message: fill(t.app.purchase.confirmBody, {
        packs: formatQuantity(draft.packs, locale),
        pack: selected.purchaseUnit ?? t.units.unit.one,
        name: selected.name,
        total: formatMoney(draft.totalCents, locale),
      }),
      confirmLabel: t.app.purchase.confirmAction,
      cancelLabel: t.app.confirm.adjust,
    });
    if (!go) return;

    setSaving(true);
    try {
      setImpact(
        await recordAndMeasure(
          selected,
          draft.packs,
          draft.baseUnits,
          draft.totalCents,
          supplier,
          pedidoHaDias,
          locale.timeZone,
        ),
      );
      setTotal('');
      setQuantity('1');
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.purchase.failed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * A cascata não pula número, e dois dos três blocos são condicionais.
   *
   * O juízo do preço só existe depois de a pessoa digitar quanto pagou, e o
   * impacto só existe depois de gravar. Índice fixo deixaria um vão de quarenta
   * milissegundos no meio da entrada — a tela montaria com um degrau que não
   * corresponde a bloco nenhum.
   */
  const mostraJuizo = Boolean(draft && selected);
  const mostraImpacto = Boolean(impact && impact.length > 0);
  const indiceImpacto = mostraJuizo ? 2 : 1;
  const indiceAcao = indiceImpacto + (mostraImpacto ? 1 : 0);

  if (loading) {
    return (
      <CollapsingHeader cena="compras" title={t.app.purchase.title} overline={t.app.purchase.overline}>
        <Reveal index={0}>
          <Card hue={palette.mint} icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}>
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.purchase.openingStoreroom}
            </Text>
          </Card>
        </Reveal>
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader title={t.app.purchase.title} overline={t.app.purchase.overline}>
      {/* O QUE CHEGOU. Um assunto só, num cartão só: qual insumo, quantos e por
          quanto são as três linhas da mesma linha da nota, e separá-las em dois
          cartões fazia a pessoa olhar duas caixas para escrever uma frase.
          A fita de escolha é palavra, não pastilha — o nome do insumo acende no
          tom do assunto e engorda; o resto do desenho é espaço, que é como uma
          página impressa separa. */}
      <Reveal index={0}>
        {selected ? (
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={t.app.purchase.whatYouBought}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: space.lg }}>
                {items.map((item) => {
                  const active = item.id === selected.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSelectedId(item.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={item.name}
                      style={{ paddingVertical: space.sm }}
                    >
                      <Text
                        style={[
                          type.secondary,
                          {
                            color: active ? palette.sky : color.inkMuted,
                            fontWeight: active ? '600' : '400',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Os campos, na ordem em que a nota é lida: de quem, quanto veio,
                quanto deu. Formulário continua formulário — cada `Field` explica
                embaixo o que o sistema já deduziu do que foi digitado, que é onde
                a inteligência aparece sem pedir nada a mais. */}
            <View style={{ gap: space.lg, marginTop: space.md }}>
              <Field
                label={t.app.purchase.supplier}
                value={supplier}
                onChangeText={setSupplier}
                placeholder={t.app.purchase.supplierPlaceholder}
              />

              {/* Quando o pedido foi feito.
                  A única pergunta desta tela que o sistema não pode deduzir — a data
                  do telefonema para o fornecedor não está no razão —, e é por isso
                  que perguntar aqui não fere a Lei 1. "Não sei" nasce marcado: é o
                  estado de hoje, e obrigar resposta trocaria uma lacuna honesta por um
                  número inventado. */}
              <View style={{ gap: space.sm }}>
                <Text style={[type.overline, { color: color.inkFaint }]}>
                  {t.app.purchase.orderedWhen.toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {QUANDO_PEDIU.map((dias) => {
                    const rotulo = rotuloDoPedido(dias, t, locale);
                    return (
                      <Pressable
                        key={String(dias)}
                        onPress={() => setPedidoHaDias(dias)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: pedidoHaDias === dias }}
                        accessibilityLabel={rotulo}
                      >
                        <Chip signal={pedidoHaDias === dias ? 'ok' : 'neutral'} label={rotulo} />
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {t.app.purchase.orderedWhenHint}
                </Text>
              </View>
              <Field
                label={fill(t.app.purchase.howMany, {
                  pack: selected.purchaseUnit ?? t.units.unit.other,
                })}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                hint={
                  draft
                    ? fill(t.app.purchase.conversion, {
                        packs: formatQuantity(draft.packs, locale),
                        factor: formatQuantity(draft.factor, locale),
                        baseUnits: formatQuantity(draft.baseUnits, locale),
                        unit: selected.baseUnit,
                      })
                    : undefined
                }
              />
              <Field
                label={t.app.purchase.total}
                value={total}
                onChangeText={setTotal}
                placeholder="118,00"
                suffix={currencySymbol(locale)}
                keyboardType="numeric"
                hint={
                  draft
                    ? fill(t.app.purchase.perPack, {
                        price: formatMoney(fromDecimal(perPackNow), locale),
                        pack: selected.purchaseUnit ?? t.units.unit.one,
                      })
                    : undefined
                }
              />
            </View>
          </Card>
        ) : (
          /* Nada para comprar ainda, e isso é estado válido: o desenho do
             assunto e a frase, sem tom de alerta. Um cartão vermelho no primeiro
             dia de uso é alerta inventado. */
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={t.app.purchase.whatYouBought}
          >
            <Text style={[type.body, { color: color.ink }]}>
              {(data?.cadastrados ?? 0) > 0
                ? t.app.purchase.noneBuyable
                : t.app.inputs.empty.input}
            </Text>
            {/* E a próxima ação, porque estado vazio é desenho, frase e saída —
                nos dois casos o caminho é o mesmo cadastro. */}
            <View style={{ marginTop: space.md }}>
              <Button
                label={t.app.inputs.addNew}
                variant="ghost"
                onPress={() => router.push('/inputs')}
              />
            </View>
          </Card>
        )}
      </Reveal>

      {/* ANTES DE FECHAR. O único número grande da tela, e ele nunca aparece
          sozinho: a linha de baixo diz quanto é agora e quanto era na compra
          anterior, e o crachá diz como ler isso em uma frase. O cartão vira
          âmbar quando subiu bem acima do normal — a cor é o aviso na data da
          decisão, com o fornecedor ainda na porta. */}
      {draft && selected ? (
        <Reveal index={1}>
          <Card
            hue={verdict === 'wellAbove' ? color.warning : palette.sage}
            icon={(c) => <GlyphPurchase size={26} color={c} weight={traco} />}
          >
            <Text style={[type.overline, { color: color.inkFaint }]}>
              {t.app.purchase.beforeClosing}
            </Text>

            {draft.change === null || perPackBefore === null ? (
              <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.purchase.firstPurchase}
              </Text>
            ) : (
              <>
                <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
                  {draft.change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(draft.change), locale)}
                </Text>
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {fill(t.app.purchase.nowVsBefore, {
                    now: formatMoney(fromDecimal(perPackNow), locale),
                    before: formatMoney(fromDecimal(perPackBefore), locale),
                  })}
                </Text>
                <View style={{ marginTop: space.md }}>
                  {/* The verdict names the key; the dictionary writes the words.
                      Three languages, one rule, and the rule is tested. */}
                  <Chip
                    signal={priceSignal(verdict)}
                    label={verdict ? t.app.purchase[verdict] : t.app.purchase.smallChange}
                  />
                </View>
              </>
            )}

            {/* Para onde a média anda — e ela vem do banco, não do teclado.
                Sem custo a frase sai inteira: dizer "de R$ 0,00 para R$ 0,00"
                seria anunciar que a nota não move nada. */}
            {selected.averageRate === null ? null : (
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
                {fill(t.app.purchase.averageMoves, {
                  name: selected.name,
                  from: formatMoney(Math.round(selected.averageRate * 1_000), locale),
                  to: formatMoney(Math.round(draft.after.averageRate * 1_000), locale),
                  unit: selected.baseUnit,
                })}
              </Text>
            )}
          </Card>
        </Reveal>
      ) : null}

      {/* O QUE A NOTA MEXEU. A conta que abre a conclusão de cima (Lei 6): cada
          produto com o que a unidade dele custava e o que passou a custar. É
          `ListRow` e não linha montada à mão — a coluna da direita já vem em
          algarismo tabular, que é o que permite comparar quatro produtos de
          relance. Sem desenho por linha: ícone em toda linha vira papel de
          parede e para de ser visto. */}
      {impact && impact.length > 0 ? (
        <Reveal index={indiceImpacto}>
          <Card
            hue={palette.sky}
            icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
            title={t.app.purchase.whatItMoved}
          >
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.purchase.nobodyUpdated}
            </Text>
            {impact.map((row) => (
              <ListRow
                key={row.name}
                label={row.name}
                trailing={`${formatMoney(row.before, locale)} → ${formatMoney(row.after, locale)}`}
                trailingTone={row.after > row.before ? 'warning' : 'ok'}
              />
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* A ação provável, embaixo e uma só, com a marca do assunto dentro dela:
          o botão diz de que se trata antes de ser lido. */}
      <Reveal index={indiceAcao}>
        <Button
          label={saving ? t.app.purchase.recording : t.app.purchase.record}
          onPress={() => void onSave()}
          disabled={!draft || saving}
          icon={(c) => <GlyphPurchase size={22} color={c} weight={traco} />}
          weighty
        />
      </Reveal>
    </CollapsingHeader>
  );
}

/**
 * Records the invoice and then measures what it did.
 *
 * The measurement is taken by costing the products before and after with the
 * same engine the recipe screen uses - not by a second formula written here,
 * which would eventually disagree with the first one.
 */
async function recordAndMeasure(
  item: ItemWithCost,
  packs: number,
  baseUnits: number,
  totalCents: ReturnType<typeof fromDecimal>,
  supplier: string,
  /** Há quantos dias o pedido foi feito; `null` quando ninguém sabe. */
  pedidoHaDias: number | null,
  timeZone: string,
): Promise<Impact[]> {
  const [recipesBefore, costsBefore, products, names] = await Promise.all([
    loadRecipeGraph(LOCAL_COMPANY_ID),
    itemCosts(LOCAL_COMPANY_ID),
    listProducts(LOCAL_COMPANY_ID),
    loadLabels(LOCAL_COMPANY_ID),
  ]);

  const unitCost = (costs: Record<string, Rate>) =>
    products.map((product) => {
      if (!product.recipeId || !product.yieldPerUnit) return { name: product.name, value: 0 };
      const cost = costRecipe(product.recipeId, recipesBefore, costs, names);
      return {
        name: product.name,
        value: costPerProductUnit(cost, product.yieldPerUnit, {
          typedRate: product.unitPackagingRate ?? undefined,
          itemsRate: packagingRatePerUnit(product.packagingItems, costs),
        }),
      };
    });

  /**
   * O impacto é dinheiro do começo ao fim — "o picolé passou de X para Y".
   *
   * Sem o portão aberto não sobra nada dele, então a lista volta vazia e a tela
   * segue sem a seção. A NOTA continua sendo lançada e a média continua andando
   * certo: o que fica de fora é só a medição, que é o que a pessoa não pode ver.
   */
  const before = costsBefore === null ? [] : unitCost(costsBefore);

  await recordPurchase(LOCAL_COMPANY_ID, {
    itemId: item.id,
    supplierName: supplier.trim() || undefined,
    purchaseQuantity: packs,
    baseUnits,
    totalCents,
    // Sem resposta, nada é gravado: `ordered_at` continua nulo e `deliveriesOf`
    // ignora a nota. Uma lacuna vazia é mais honesta que um palpite.
    orderedAt:
      pedidoHaDias === null
        ? undefined
        : `${localDate(nowIso(), timeZone, -pedidoHaDias)}T00:00:00.000Z`,
  });

  if (costsBefore === null) return [];
  const after = unitCost((await itemCosts(LOCAL_COMPANY_ID)) ?? {});

  return before
    .map((row, index) => ({ name: row.name, before: row.value, after: after[index].value }))
    .filter((row) => row.before !== row.after);
}

/** A palavra de cada resposta. Quem escreve português é a tela, e é aqui. */
function rotuloDoPedido(
  dias: number | null,
  t: Dictionary,
  locale: LocaleSettings,
): string {
  if (dias === null) return t.app.purchase.orderedUnknown;
  if (dias === 0) return t.app.purchase.orderedToday;
  // "Ontem" e não "Há 1 dia": a foto mostrou a diferença entre a palavra da
  // pessoa e a do sistema, e esta tela é lida por quem está com a nota na mão.
  if (dias === 1) return t.app.purchase.orderedYesterday;
  return fill(t.app.purchase.orderedDaysAgo, {
    days: plural(dias, t.app.home.dayCount, formatQuantity(dias, locale)),
  });
}
