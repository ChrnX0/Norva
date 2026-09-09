import { useLocalSearchParams, useRouter } from 'expo-router';
import { avisoDeFalha } from '@/i18n/falha';
import { ERROS } from '@/data/erros';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { GlyphPrice, GlyphRecipe, GlyphSack } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { WhySheet, type Conta } from '@/components/WhySheet';
import { empresaDaqui } from '@/data/empresa';
import {
  itemCosts,
  labels as loadLabels,
  listItems,
  listProducts,
  loadRecipeGraph,
  saveRecipeVersion,
} from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import type { Rate } from '@/domain/money';
import {
  compareVersions,
  costPerProductUnit,
  costRecipe,
  MissingRecipeError,
  packagingRatePerUnit,
  RecipeCycleError,
  unitsPerBatch,
  type ItemCosts,
  type Recipe,
  type RecipeCost,
  type RecipeLine,
} from '@/domain/recipe';
import { roundUpToFullContainer } from '@/domain/units';
import { parseTyped, formatTyped } from '@/domain/number';
import { fill, formatMoney, formatUnitRate, formatPercent, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import type { Dictionary, LocaleSettings } from '@/i18n';
import { ALVO } from '@/theme/tokens';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * The recipe editor - the screen the whole product is built to make possible.
 *
 * Cost recalculates on every keystroke, because the question an owner actually
 * has is not "what did this cost" but "what happens if I change this". Making
 * that wait for a save button turns exploration into paperwork.
 *
 * Every number here is deterministic arithmetic over `src/domain/recipe.ts`,
 * which is what lets `[por quê?]` open the calculation instead of asserting it.
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`),
 * e o layout anterior saiu inteiro em vez de ganhar um caminho ao lado. O que
 * havia: três retângulos no tom da área, sem crachá e sem tom de assunto; a
 * barra de proporção de cada ingrediente desenhada à mão (`backgroundColor`,
 * `borderRadius`) e por isso um bloco do Orgânico dentro do Papel; o `[por quê?]`
 * como pílula de borda própria; e as pílulas `−10% / +10% / tirar` de um
 * componente local (`Nudge`) que era caixa à mão em vinte e uma linhas. Nada
 * entrava em cena — a tela aparecia de uma vez, ao lado de uma capa que entra em
 * cascata.
 *
 * O que existe agora são três leituras da ficha, na ordem em que se decide:
 * **quanto custa** (a figura com a conta ao lado, a diferença contra a versão
 * salva e a conta que abre no `[por quê?]`), **o que entra** (cada linha com a
 * quantidade, o quanto ela pesa no lote e o dinheiro na mesma régua da direita) e
 * **a ficha em si** (rendimento, perda e porção). Nenhuma caixa é desenhada aqui:
 * `Card`, `ListRow` e `Button` já sabem virar régua no Papel e bloco no Orgânico.
 *
 * Dois tons, e cada um é do assunto do cartão, não da tela: custo é
 * `palette.sky`, que é o tom de dinheiro em todo o aplicativo, e o que entra é
 * `palette.mint`, que é o tom de insumo — quem vê verde sabe que aquilo sai do
 * almoxarifado antes de ler o nome. A área continua `apricot` pelo motivo já
 * registrado em `app/recipes/index.tsx`: o cabeçalho não troca de cor no caminho
 * da produção até a ficha.
 *
 * A barra de proporção não voltou porque não existe componente de proporção na
 * língua — `Bars` é série de dias e `Sparkline` é série no tempo. A porcentagem
 * continua dita por extenso na linha, e a coluna de dinheiro à direita, em
 * figuras tabulares, é o que se compara de olho.
 */
/**
 * A conta de uma receita, escrita pela TELA da receita.
 *
 * A folha do `[por quê?]` não conhece receita nenhuma desde 7 de setembro — ela
 * desenha parcelas e fechos. Quem sabe que "fatia do lote" e "perda esperada"
 * querem dizer alguma coisa é esta tela, e é aqui que o fato vira frase. É a
 * fundação da casa aplicada a uma folha: a camada de dados devolve fato, quem
 * escreve português é a tela.
 *
 * A ORDEM também mora aqui, e não na folha: "o que domina o custo" é a pergunta
 * de quem abre a conta de uma receita, e ordenar por fatia dentro da folha
 * imporia essa pergunta a contas que não a têm.
 */
function contaDaReceita(
  cost: RecipeCost,
  locale: LocaleSettings,
  t: Dictionary,
): Conta {
  const linhas = [...cost.lines].sort((a, b) => b.share - a.share);
  return {
    origem: t.whySheet.where,
    parcelas: linhas.map((linha) => ({
      rotulo: linha.label,
      valor: formatMoney(linha.totalCents, locale),
      parte: linha.share,
      nota: fill(t.whySheet.shareOfBatch, { percent: formatPercent(linha.share, locale, 0) }),
    })),
    fechos: [
      { rotulo: t.whySheet.batchCost, valor: formatMoney(cost.batchCents, locale) },
      {
        rotulo: fill(t.whySheet.expectedLoss, {
          percent: formatPercent(cost.lossFraction, locale),
        }),
        valor: fill(t.whySheet.remains, { amount: formatQuantity(cost.netYield, locale) }),
      },
      {
        rotulo: t.whySheet.perMassUnit,
        // Mil unidades-base, escritas pelo formatador e não à mão: "1.000" cravado
        // na string é o ponto de milhar do português dentro de uma tela que também
        // abre em inglês, onde o mesmo mil é "1,000".
        valor: fill(t.whySheet.perAmount, {
          money: formatMoney(Math.round(cost.perYieldUnit * 1000), locale),
          amount: formatQuantity(1000, locale),
        }),
        forte: true,
      },
    ],
    nota: t.whySheet.lossNote,
  };
}

export default function RecipeScreen() {
  return (
    <AreaProvider area="apricot">
      <RecipeEditor />
    </AreaProvider>
  );
}

/** The parts of the editor that come from the database and never change here. */
type Loaded = {
  recipes: Record<string, Recipe>;
  costs: ItemCosts;
  /**
   * Se o custo é desta pessoa para ver. Nulo em `itemCosts` é o portão, e a ficha
   * guarda a resposta separada do mapa porque o mapa vazio ainda serve para a
   * QUANTIDADE — quanto a receita rende sai do grafo, não do custo.
   */
  dinheiro: boolean;
  labels: Record<string, string>;
  items: { id: string; name: string; baseUnit: string }[];
  /** How much of the batch becomes one sellable unit, if a product says so. */
  yieldPerUnit: number | null;
  unitPackagingRate: Rate;
  /** A embalagem que sai do estoque, para o custo cotado bater com o congelado. */
  packagingItems: { itemId: string; name: string; quantityPerUnit: number }[];
  packaging: { id: string; perBaseUnit: number }[];
};

/** The id the edited draft holds in the graph while it is being changed. */
const DRAFT = '__draft__';

/** An edit in progress, tied to the recipe it belongs to. */
type Draft = {
  recipeId: string;
  lines: RecipeLine[];
  lossPercent: string;
  yieldAmount: string;
  perUnit: string;
};

function RecipeEditor() {
  const { color, type, space, palette, traco } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();
  const params = useLocalSearchParams<{ id?: string }>();

  const { data, loading } = useQuery<Loaded>(async () => {
    const [recipes, costs, labels, items, products] = await Promise.all([
      loadRecipeGraph(empresaDaqui()),
      itemCosts(empresaDaqui()),
      loadLabels(empresaDaqui()),
      listItems(empresaDaqui()),
      listProducts(empresaDaqui()),
    ]);

    const recipeId = params.id ?? Object.keys(recipes)[0];
    const product = products.find((p) => p.recipeId === recipeId);

    return {
      recipes,
      dinheiro: costs !== null,
      costs: costs ?? {},
      labels,
      items: items
        .filter((i) => i.kind === 'input' || i.kind === 'packaging')
        .map((i) => ({ id: i.id, name: i.name, baseUnit: i.baseUnit })),
      yieldPerUnit: product?.yieldPerUnit ?? null,
      unitPackagingRate: (product?.unitPackagingRate ?? 0) as Rate,
      packagingItems: product?.packagingItems ?? [],
      packaging: product?.packaging.tiers ?? [{ id: 'unit', perBaseUnit: 1 }],
    };
  }, params.id ?? '');

  const recipeId = params.id ?? (data ? Object.keys(data.recipes)[0] : undefined);
  const stored = recipeId && data ? data.recipes[recipeId] : undefined;

  const [whyOpen, setWhyOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * The form is derived from what is stored, not copied into state when the
   * screen mounts. An edit produces a draft that stands in front of it, and the
   * draft remembers which recipe it belongs to - so opening a different one
   * shows that recipe rather than the last one's numbers, which is what a
   * copy-on-mount quietly got wrong.
   *
   * Law 2 either way: no field is born empty.
   */
  const [draft, setDraft] = useState<Draft | null>(null);

  const form: Draft | null =
    draft && draft.recipeId === recipeId
      ? draft
      : stored && recipeId
        ? {
            recipeId,
            lines: stored.lines,
            // A percentage for a text field, not money. proofgate-allow
            //
            // Written with the same separator the field is read with, which is
            // not a detail: `String(2.5)` is always "2.5", the reader here used
            // to delete the dot, and a 2,5% loss came back as 25% - with the
            // save button lit and nobody having touched a key. The screen was
            // corrupting the sheet by opening it.
            lossPercent: formatTyped(Number((stored.lossFraction * 100).toFixed(2)), locale.formatting),
            yieldAmount: formatTyped(stored.yieldAmount, locale.formatting),
            perUnit: data?.yieldPerUnit ? formatTyped(data.yieldPerUnit, locale.formatting) : '',
          }
        : null;

  const edit = (change: Partial<Omit<Draft, 'recipeId'>>) => {
    if (!form) return;
    setDraft({ ...form, ...change });
  };

  const lossPercent = form?.lossPercent ?? '';
  const yieldAmount = form?.yieldAmount ?? '';
  const perUnit = form?.perUnit ?? '';
  const lines = form?.lines ?? null;

  const num = (s: string) => parseTyped(s) ?? NaN;

  const computed = useMemo(() => {
    if (!data || !stored || !lines) return null;

    const yieldValue = num(yieldAmount);
    const loss = num(lossPercent) / 100;
    const portion = num(perUnit);

    if (!Number.isFinite(yieldValue) || yieldValue <= 0) {
      return { error: t.app.recipe.needYield as string, cost: null };
    }
    if (!Number.isFinite(loss) || loss < 0 || loss >= 1) {
      return { error: t.app.recipe.lossRange as string, cost: null };
    }

    // The draft is costed inside the real graph, so a sub-recipe of the recipe
    // being edited still resolves against what is actually saved.
    const graph: Record<string, Recipe> = {
      ...data.recipes,
      [DRAFT]: {
        id: DRAFT,
        // Um rascunho ainda não é uma versão: ele não foi salvo, então não tem
        // identidade que uma produção pudesse gravar. O DRAFT diz isso em vez
        // de emprestar o id da versão anterior, que apontaria uma corrida para
        // uma fórmula que não é a que ela usou.
        yieldUnit: stored.yieldUnit,
        versionId: DRAFT,
        version: stored.version + 1,
        effectiveFrom: stored.effectiveFrom,
        yieldAmount: yieldValue,
        lossFraction: loss,
        lines,
      },
    };

    try {
      const cost = costRecipe(DRAFT, graph, data.costs, data.labels);
      const before = costRecipe(recipeId!, data.recipes, data.costs, data.labels);

      // Nulo já era o estado "falta dizer a porção" desta figura, e a tela já o
      // desenha como travessão com o motivo ao lado — então o portão fechado entra
      // pelo caminho que a tela conhece, em vez de somar zero e imprimir R$ 0,00.
      const hasPortion = Number.isFinite(portion) && portion > 0;
      const unitCents =
        hasPortion && data.dinheiro
          ? costPerProductUnit(cost, portion, {
              typedRate: data.unitPackagingRate,
              itemsRate: packagingRatePerUnit(data.packagingItems, data.costs),
            })
          : null;
      const units = hasPortion ? unitsPerBatch(cost, portion) : 0;
      const boxTier = data.packaging.find((t) => t.perBaseUnit > 1);
      const rounding =
        units > 0 && boxTier
          ? roundUpToFullContainer(units, { tiers: data.packaging }, boxTier.id)
          : null;

      // Law 3: no number appears alone. The comparison against what is saved is
      // the answer to "did my change help", asked while the change is still open.
      const delta = hasPortion ? compareVersions(before, cost, portion) : null;

      return { error: null, cost, before, unitCents, units, rounding, delta, boxTier };
    } catch (e) {
      if (e instanceof RecipeCycleError) {
        return {
          error: fill(t.app.recipe.containsItself, { path: e.path.join(' → ') }),
          cost: null,
        };
      }
      if (e instanceof MissingRecipeError) {
        return { error: fill(t.app.recipe.subRecipeMissing, { id: e.recipeId }), cost: null };
      }
      throw e;
    }
    // `t` is the same frozen object every render, so listing it costs nothing
    // and keeps the messages honest if the language ever changes at runtime.
  }, [data, stored, lines, lossPercent, yieldAmount, perUnit, recipeId, t]);

  const changed = useMemo(() => {
    if (!stored || !lines) return false;
    return (
      JSON.stringify(lines) !== JSON.stringify(stored.lines) ||
      num(yieldAmount) !== stored.yieldAmount ||
      Math.abs(num(lossPercent) / 100 - stored.lossFraction) > 1e-9
    );
  }, [stored, lines, yieldAmount, lossPercent]);

  const onSave = async () => {
    if (!stored || !lines || !recipeId || computed?.error) return;

    const summary = computed?.delta
      ? computed.delta.deltaCents === 0
        ? t.app.recipe.summarySame
        : fill(
            computed.delta.cheaper ? t.app.recipe.summaryCheaper : t.app.recipe.summaryDearer,
            {
              amount: formatMoney(Math.abs(computed.delta.deltaCents), locale),
              version: stored.version,
            },
          )
      : '';

    // Law 5: the confirmation spells out what is about to happen, in words.
    const go = await confirm({
      title: fill(t.app.recipe.saveTitle, { version: stored.version + 1 }),
      message: fill(t.app.recipe.saveBody, { previous: stored.version, summary }),
      confirmLabel: t.app.recipe.save,
      cancelLabel: t.app.recipe.keepEditing,
    });
    if (!go) return;

    setSaving(true);
    try {
      await saveRecipeVersion(empresaDaqui(), {
        recipeId,
        name: data?.labels[recipeId] ?? 'Receita',
        yieldAmount: num(yieldAmount),
        yieldUnit: 'ml',
        lossFraction: num(lossPercent) / 100,
        lines,
      });
      router.back();
    } catch (e) {
      await confirm({
        title: t.app.recipe.failedToSave,
        message: avisoDeFalha(e, t, ERROS).message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }
  };

  const setQuantity = (index: number, next: number) =>
    edit({
      lines: (lines ?? []).map((l, i) =>
        i === index ? { ...l, quantity: Math.max(0, Math.round(next)) } : l,
      ),
    });

  const removeLine = (index: number) => edit({ lines: (lines ?? []).filter((_, i) => i !== index) });

  const addItem = (itemId: string) =>
    edit({ lines: [...(lines ?? []), { kind: 'item', itemId, quantity: 1_000 }] });

  const title =
    recipeId && data ? (data.labels[recipeId] ?? t.app.recipe.fallbackTitle) : t.app.recipe.fallbackTitle;

  /**
   * Abrindo, ou nenhuma ficha cadastrada.
   *
   * Também entra em cena e também tem desenho: "está tudo bem" é estado válido e
   * bonito, e uma frase cinza sozinha no meio da tela é a versão que ensina a
   * ignorar. A próxima ação não está aqui porque cadastrar receita ainda não tem
   * tela para onde mandar - o mesmo registro que `app/recipes/index.tsx` já faz.
   */
  if (loading || !data || !stored || !lines) {
    return (
      <CollapsingHeader cena="receitas" title={t.app.recipe.fallbackTitle} overline={t.app.recipe.overline}>
        <Reveal index={0}>
          <Card hue={palette.apricot} icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.inkMuted }]}>
              {loading ? t.app.recipe.opening : t.app.recipe.none}
            </Text>
          </Card>
        </Reveal>
      </CollapsingHeader>
    );
  }

  const inRecipe = new Set(lines.map((l) => (l.kind === 'item' ? l.itemId : l.recipeId)));
  const available = data.items.filter((i) => !inRecipe.has(i.id));

  /**
   * A cascata não pula número.
   *
   * O topo é um cartão só - ou o custo, ou o dado que falta para ele existir -
   * porque os dois são a mesma pergunta respondida de dois jeitos. Quando nem um
   * nem outro aparece, o que entra assume o índice 0 em vez de deixar um buraco
   * na entrada.
   */
  const cabeca = computed?.error || computed?.cost ? 1 : 0;

  return (
    <CollapsingHeader
      cena="receitas"
      title={title}
      overline={fill(t.app.recipe.overlineVersion, { version: stored.version })}
    >
      {/* Falta um dado, e o erro IMPEDE em vez de reclamar: sem rendimento não
          há custo, então o cartão do custo não aparece dizendo zero - este toma
          o lugar dele e diz o que preencher. */}
      {computed?.error ? (
        <Reveal index={0}>
          {/* sinal — falta o rendimento e o custo não existe: o cartão É o impedimento (Lei 5) */}
          <Card
            hue={color.danger}
            icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}
            title={t.app.recipe.missingData}
          >
            <Text style={[type.body, { color: color.ink }]}>{computed.error}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* QUANTO CUSTA. A única figura da tela, e ela nunca aparece sozinha: ao
          lado vem quantas unidades saem de cada vez e quanto custa o lote
          inteiro, embaixo a diferença contra a versão salva - a resposta de "meu
          ajuste ajudou", feita enquanto o ajuste está aberto - e no fim a conta,
          que abre por inteiro no `[por quê?]`. */}
      {computed?.cost ? (
        <Reveal index={0}>
          <Card
            hue={palette.sky}
            icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
            title={t.app.recipe.unitCost}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
              <Text style={[type.figure, { color: color.ink }]}>
                {computed.unitCents === null ? '—' : formatMoney(computed.unitCents, locale)}
              </Text>
              <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]}>
                {computed.unitCents === null
                  ? data.dinheiro
                    ? t.app.recipe.needPortion
                    : t.common.moneyHidden
                  : fill(t.app.recipe.unitsPerBatch, {
                      units: formatQuantity(computed.units, locale),
                      batch: formatMoney(computed.cost.batchCents, locale),
                    })}
              </Text>
            </View>

            {/* A seta carrega a direção porque a frase não carrega: cor sozinha
                não é informação para quem não distingue verde de âmbar. */}
            {computed.delta && changed && computed.delta.deltaCents !== 0 ? (
              <Text
                style={[
                  type.secondary,
                  {
                    color: computed.delta.cheaper ? color.ok : color.warning,
                    marginTop: space.sm,
                    fontWeight: '600',
                  },
                ]}
              >
                {computed.delta.cheaper ? '▼' : '▲'}{' '}
                {fill(t.app.recipe.cheaperThan, {
                  amount: formatMoney(Math.abs(computed.delta.deltaCents), locale),
                  version: stored.version,
                  percent: formatPercent(Math.abs(computed.delta.percent), locale),
                })}
              </Text>
            ) : null}

            {computed.rounding && computed.rounding.addedUnits > 0 ? (
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
                {fill(t.app.recipe.roundUp, {
                  rounded: formatQuantity(computed.rounding.rounded, locale),
                  loose: formatQuantity(
                    computed.units % (computed.boxTier?.perBaseUnit ?? 1),
                    locale,
                  ),
                  units: formatQuantity(computed.units, locale),
                })}
              </Text>
            ) : null}

            {/* Lei 6: toda conclusão abre a conta. Fantasma, porque a ação desta
                tela é salvar - abrir a conta não compete com ela. */}
            <Button
              label={t.app.recipe.why}
              variant="ghost"
              onPress={() => setWhyOpen(true)}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}

      {/* O QUE ENTRA. Cada linha diz quanto vai, o quanto ela pesa no lote e o
          que ela custa, na régua da direita - é a conta do cartão de cima, item
          por item. Sem desenho nas linhas: ícone em toda linha vira papel de
          parede e para de ser visto; o crachá é do assunto, uma vez. Os três
          ajustes são fantasma, porque corrigir nunca se convida. */}
      <Reveal index={cabeca}>
        <Card
          hue={palette.mint}
          icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
          title={t.app.recipe.whatGoesIn}
        >
          {lines.map((line, index) => {
            const id = line.kind === 'item' ? line.itemId : line.recipeId;
            const label = data.labels[id] ?? id;
            const share = computed?.cost?.lines[index]?.share ?? 0;
            const lineCost = computed?.cost?.lines[index]?.totalCents ?? 0;
            // "18.000" de quê? A unidade estava faltando desde antes desta
            // reescrita, e sem ela o número não decide nada — dezoito mil
            // gramas e dezoito mil unidades são coisas diferentes na mesma
            // ficha. Item usa a unidade-base dele; sub-receita, a do rendimento.
            const unidade =
              line.kind === 'item'
                ? (data.items.find((i) => i.id === line.itemId)?.baseUnit ?? '')
                : (stored?.yieldUnit ?? "");

            return (
              <View key={`${id}-${index}`} style={{ marginBottom: space.sm }}>
                <ListRow
                  label={line.kind === 'recipe' ? `${label} · ${t.app.recipe.subRecipe}` : label}
                  detail={fill(t.app.recipe.shareOfBatch, {
                    quantity: `${formatQuantity(line.quantity, locale)} ${unidade}`.trim(),
                    percent: formatPercent(share, locale, 0),
                  })}
                  trailing={formatMoney(lineCost, locale)}
                />
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    label={t.app.recipe.lessTen}
                    variant="ghost"
                    onPress={() => setQuantity(index, line.quantity * 0.9)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t.app.recipe.moreTen}
                    variant="ghost"
                    onPress={() => setQuantity(index, line.quantity * 1.1)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t.app.recipe.remove}
                    variant="ghost"
                    onPress={() => removeLine(index)}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            );
          })}

          {/* O que ainda não está na ficha, em texto e sem caixa - a mesma forma
              que o almoxarifado usa para escolher, e a que sobrevive nas duas
              caras porque não desenha nada. */}
          {available.length > 0 ? (
            <>
              <Text style={[type.overline, { color: color.inkFaint, marginTop: space.md }]}>
                {t.app.recipe.add}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: space.lg }}>
                  {available.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => addItem(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.app.recipe.add} ${item.name}`}
                      style={{ paddingVertical: space.sm, minHeight: ALVO, justifyContent: 'center' }}
                    >
                      <Text
                        style={[type.secondary, { color: palette.mint, fontWeight: '600' }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}
        </Card>
      </Reveal>

      {/* A FICHA EM SI: o que ela rende, o que se perde no caminho e quanto vai
          em cada unidade. Formulário continua formulário - `Field` nos campos,
          com a dica que devolve a conta a cada tecla. Sem título: o cabeçalho já
          diz "ficha técnica · versão N", e repetir a palavra num crachá seria
          rótulo inventado. */}
      <Reveal index={cabeca + 1}>
        <Card hue={palette.apricot} icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}>
          <View style={{ gap: space.lg }}>
            <Field
              label={t.app.recipe.batchYield}
              value={yieldAmount}
              onChangeText={(value) => edit({ yieldAmount: value })}
              suffix="ml"
              keyboardType="numeric"
            />
            <Field
              label={t.app.recipe.expectedLoss}
              value={lossPercent}
              onChangeText={(value) => edit({ lossPercent: value })}
              suffix="%"
              keyboardType="numeric"
              hint={
                computed?.cost
                  ? fill(t.app.recipe.lossHint, {
                      net: formatQuantity(computed.cost.netYield, locale),
                      gross: formatQuantity(num(yieldAmount), locale),
                    })
                  : undefined
              }
            />
            <Field
              label={t.app.recipe.perUnit}
              value={perUnit}
              onChangeText={(value) => edit({ perUnit: value })}
              suffix="ml"
              keyboardType="numeric"
              hint={
                data.unitPackagingRate > 0
                  ? fill(t.app.recipe.packagingHint, {
                      amount: formatUnitRate(data.unitPackagingRate, locale, fill(t.app.inputForm.perThousandOf, { unit: t.units.unit.other })),
                    })
                  : undefined
              }
            />
          </View>
        </Card>
      </Reveal>

      {/* A ação provável, uma só e embaixo, ao alcance do dedo. */}
      <Reveal index={cabeca + 2}>
        <Button
          label={
            saving
              ? t.app.recipe.saving
              : fill(t.app.recipe.saveAs, { version: stored.version + 1 })
          }
          onPress={() => void onSave()}
          disabled={!changed || saving || Boolean(computed?.error)}
          weighty
        />
      </Reveal>

      {computed?.cost ? (
        <WhySheet
          visible={whyOpen}
          onClose={() => setWhyOpen(false)}
          conta={contaDaReceita(computed.cost, locale, t)}
          title={title}
        />
      ) : null}
    </CollapsingHeader>
  );
}
