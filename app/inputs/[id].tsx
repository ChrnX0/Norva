import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, priceSignal } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  GlyphChart,
  GlyphCount,
  GlyphLoss,
  GlyphPrice,
  GlyphPurchase,
  GlyphRecipe,
  GlyphSack,
} from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { Sparkline } from '@/components/Sparkline';
import { useConfirm } from '@/components/Confirm';
import {
  recordLoss,
  defaultLocationId,
  findItem,
  itemHistory,
  itemMovements,
  recipesUsingItem,
  recordCount,
  setItemActive,
  type ItemWithCost,
  type MovementRow,
  type PriceMoveRow,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { judgePriceChange } from '@/domain/cost';
import type { LossReason } from '@/domain/ledger';
import { parseTyped } from '@/domain/number';
import { useQuery } from '@/data/useQuery';
import { fill, formatDayMonth, formatMoney, formatQuantity } from '@/i18n';
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
 *
 * ---
 *
 * **A cara desta tela foi reescrita, não remendada.** O corpo anterior era
 * cartão cinza sem crachá nenhum — seis blocos com título escrito e nada
 * desenhado — e a escolha do motivo da perda era pílula feita à mão
 * (`borderWidth`, `borderRadius` e cor de borda próprios), que é vocabulário do
 * Orgânico chumbado numa tela que também tem que servir o Papel. Agora quem sabe
 * das duas caras são o `Card`, o `Button` e o `Chip`; aqui não se desenha caixa
 * nenhuma.
 *
 * Cada bloco carrega o tom do SEU assunto, que é o mesmo em todo o aplicativo:
 * o insumo e a prateleira em `mint`, o dinheiro em `sky`, a perda em `danger`, a
 * receita em `apricot`. Quem vê verde sabe que é almoxarifado antes de ler.
 *
 * A área passou de `mist` (que é a cor dos ajustes) para `mint`, que é o tom do
 * almoxarifado — o cabeçalho e o botão agora concordam com a lista de onde esta
 * tela é aberta.
 */
export default function InputDetailScreen() {
  return (
    <AreaProvider area="mint">
      <InputDetail />
    </AreaProvider>
  );
}

type Loaded = {
  item: ItemWithCost | null;
  history: PriceMoveRow[];
  recipes: { id: string; name: string; quantity: number }[];
  movements: MovementRow[];
};

function InputDetail() {
  const { color, space, type, palette, skin } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const traco = skin === 'papel' ? 1.7 : 2.2;

  // While a count is open the stock figure is deliberately hidden. This app's
  // own rule for counting says the expected number must not be on screen: a
  // person who can see it confirms the screen instead of the shelf, and the
  // check becomes theatre that nobody can tell apart from a real one.
  const [counting, setCounting] = useState(false);
  const [typed, setTyped] = useState('');

  const [losing, setLosing] = useState(false);
  const [lostText, setLostText] = useState('');
  const [reason, setReason] = useState<LossReason>('expired');

  const { data, loading, refresh } = useQuery<Loaded>(async () => {
    if (!id) return { item: null, history: [], recipes: [], movements: [] };
    const [item, history, recipes, movements] = await Promise.all([
      findItem(LOCAL_COMPANY_ID, id),
      itemHistory(LOCAL_COMPANY_ID, id),
      recipesUsingItem(LOCAL_COMPANY_ID, id),
      itemMovements(LOCAL_COMPANY_ID, id),
    ]);
    return { item, history, recipes, movements };
  }, id ?? '');

  const item = data?.item ?? null;

  if (loading || !item) {
    return (
      <CollapsingHeader title={t.app.inputForm.fallbackTitle} overline={t.app.inputDetail.overline}>
        <Reveal index={0}>
          <Card hue={palette.mint} icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.inkMuted }]}>
              {loading ? t.app.inputDetail.opening : t.app.inputDetail.gone}
            </Text>
          </Card>
        </Reveal>
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

  const lastCount = (data?.movements ?? []).find((m) => m.kind === 'adjustment');
  const lastCounted = lastCount
    ? fill(t.app.inputDetail.lastCounted, { date: formatDayMonth(lastCount.occurredAt, locale) })
    : null;
  const heldWorth =
    held > 0 ? fill(t.app.inputDetail.heldHere, { amount: formatMoney(held, locale) }) : undefined;

  /**
   * Counting, spelled out before anything is written.
   *
   * The confirmation carries the whole comparison in words - what was counted,
   * what was expected, the difference and what it is worth - because this is
   * the moment a tired person is one keystroke from writing a wrong number
   * into a ledger that never forgets.
   */
  /**
   * A perda, dita por extenso antes de virar linha.
   *
   * O motivo é obrigatório no servidor desde a primeira migração, e a razão é
   * de negócio, não de esquema: "sumiram quatro quilos" não muda decisão
   * nenhuma; "quatro quilos venceram" muda a compra, e "derreteram" muda a
   * manutenção do freezer.
   */
  const submitLoss = async () => {
    const lost = parseTyped(lostText) ?? NaN;
    if (!Number.isFinite(lost) || lost <= 0) return;

    const worth = Math.round(item.averageRate * lost);
    const go = await confirm({
      title: t.app.inputDetail.lossAsk,
      message: fill(t.app.inputDetail.lossBody, {
        amount: `${formatQuantity(Math.round(lost), locale)} ${item.baseUnit}`,
        item: item.name,
        reason: t.loss[reason].toLocaleLowerCase(locale.formatting),
        money: formatMoney(worth, locale),
      }),
      confirmLabel: t.app.inputDetail.lossConfirm,
    });
    if (!go) return;

    try {
      await recordLoss(LOCAL_COMPANY_ID, {
        itemId: item.id,
        baseUnits: Math.round(lost),
        reason,
      });
      setLosing(false);
      setLostText('');
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.inputDetail.lossFailed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    }
  };

  const submitCount = async () => {
    const counted = (parseTyped(typed) ?? NaN);
    if (!Number.isFinite(counted) || counted < 0) return;

    const expected = item.onHandBaseUnits;
    const delta = Math.round(counted) - expected;
    const worth = Math.abs(Math.round(item.averageRate * delta));

    const shown = {
      counted: `${formatQuantity(Math.round(counted), locale)} ${item.baseUnit}`,
      expected: `${formatQuantity(expected, locale)} ${item.baseUnit}`,
      diff: `${formatQuantity(Math.abs(delta), locale)} ${item.baseUnit}`,
      money: formatMoney(worth, locale),
    };

    const go = await confirm({
      title: t.app.inputDetail.countConfirmTitle,
      message: fill(
        delta === 0
          ? t.app.inputDetail.countConfirmExact
          : delta < 0
            ? t.app.inputDetail.countConfirmShort
            : t.app.inputDetail.countConfirmOver,
        shown,
      ),
      confirmLabel: t.app.inputDetail.countConfirmAction,
    });
    if (!go) return;

    await recordCount(LOCAL_COMPANY_ID, { locationId: defaultLocationId(LOCAL_COMPANY_ID), itemId: item.id, countedBaseUnits: Math.round(counted) });
    setCounting(false);
    setTyped('');
    await refresh();
  };

  const toggleActive = async () => {
    const go = await confirm({
      title: item.active ? t.app.inputDetail.retireTitle : t.app.inputDetail.bringBackTitle,
      message: fill(
        item.active ? t.app.inputDetail.retireBody : t.app.inputDetail.bringBackBody,
        { name: item.name },
      ),
      confirmLabel: item.active ? t.app.inputDetail.retireConfirm : t.app.inputDetail.bringBack,
      destructive: item.active,
    });
    if (!go) return;

    await setItemActive(LOCAL_COMPANY_ID, item.id, !item.active).then(refresh);
  };

  return (
    <CollapsingHeader
      title={item.name}
      overline={item.active ? t.app.inputDetail.overline : t.app.inputDetail.retiredOverline}
    >
      {/* Fora de circulação, dito antes de tudo — é o que muda o significado de
          todo número abaixo. Em âmbar, e não em vermelho: nada está errado,
          só parado. */}
      {item.active ? null : (
        <Reveal index={0}>
          <Card
            hue={color.warning}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.retiredTitle}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.inputDetail.retiredBody}
            </Text>
          </Card>
        </Reveal>
      )}

      {/* O custo, que é o único número grande da tela — e ele nunca aparece
          sozinho: embaixo vem de onde ele saiu, e ao lado o quanto mudou na
          última compra. Quando não houve segunda compra, o motivo de não haver
          comparação fica escrito em vez de o número ficar nu. */}
      <Reveal index={1}>
        <Card
          hue={palette.sky}
          icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
          title={t.app.reports.rows.cost.label}
        >
          <Text style={[type.overline, { color: color.inkFaint }]}>
            {t.app.inputDetail.currentCost}
          </Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {item.averageRate > 0 ? formatMoney(perThousand, locale) : '—'}
          </Text>
          <Text style={[type.caption, { color: color.inkMuted }]}>
            {item.averageRate > 0
              ? fill(t.app.inputDetail.averageOf, { unit: item.baseUnit })
              : t.app.inputDetail.noInvoiceYet}
          </Text>

          {latestChange !== null && Math.abs(latestChange) >= 0.001 ? (
            <View style={{ marginTop: space.md }}>
              <Chip
                signal={priceSignal(judgePriceChange(latestChange))}
                label={fill(
                  latestChange > 0 ? t.app.inputDetail.wentUp : t.app.inputDetail.wentDown,
                  { percent: `${(Math.abs(latestChange) * 100).toFixed(1)}%` },
                )}
              />
            </View>
          ) : moves.length === 0 && item.averageRate > 0 ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
              {t.app.inputDetail.historyEmpty}
            </Text>
          ) : null}
        </Card>
      </Reveal>

      {/* Como o item entra: a embalagem, o que vem dentro e o que a embalagem
          custa. É o que faz a régua do número de cima ser conferível — "por
          quilo" só quer dizer alguma coisa ao lado de "o saco tem 25 kg". */}
      <Reveal index={2}>
        <Card
          hue={palette.mint}
          icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
          title={t.app.inputDetail.howYouBuy}
        >
          <ListRow label={t.app.inputDetail.pack} trailing={item.purchaseUnit ?? '—'} />
          <ListRow
            label={t.app.inputDetail.perPack}
            trailing={
              item.purchaseToBase
                ? `${formatQuantity(item.purchaseToBase, locale)} ${item.baseUnit}`
                : '—'
            }
          />
          <ListRow
            label={fill(t.app.inputDetail.pricePer, {
              pack: item.purchaseUnit ?? t.app.inputDetail.pack.toLowerCase(),
            })}
            trailing={
              item.purchaseToBase && item.averageRate > 0
                ? formatMoney(Math.round(item.averageRate * item.purchaseToBase), locale)
                : '—'
            }
          />
        </Card>
      </Reveal>

      {/* O saldo e a conferência dele, no mesmo cartão porque são a mesma
          pergunta: quanto o sistema acha que tem, e quanto tem de verdade. O
          número desaparece enquanto a contagem está aberta — com ele na tela a
          conferência vira cópia, e uma cópia não se distingue de uma contagem. */}
      <Reveal index={3}>
        <Card
          hue={palette.mint}
          icon={(c) => <GlyphCount size={26} color={c} weight={traco} />}
          title={t.app.inputDetail.countTitle}
        >
          <ListRow
            label={t.app.inputDetail.inStock}
            detail={counting ? t.app.inputDetail.countHidden : lastCounted ?? heldWorth}
            trailing={
              counting ? '—' : `${formatQuantity(item.onHandBaseUnits, locale)} ${item.baseUnit}`
            }
          />
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.inputDetail.countHint}
          </Text>

          {counting ? (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Field
                label={t.app.inputDetail.countLabel}
                value={typed}
                onChangeText={setTyped}
                keyboardType="numeric"
                suffix={item.baseUnit}
                autoFocus
              />
              <Button label={t.app.inputDetail.countConfirm} onPress={submitCount} />
              <Button
                label={t.app.inputDetail.countCancel}
                variant="ghost"
                onPress={() => {
                  setCounting(false);
                  setTyped('');
                }}
              />
            </View>
          ) : (
            <View style={{ marginTop: space.md }}>
              <Button
                label={t.app.inputDetail.countStart}
                variant="ghost"
                onPress={() => setCounting(true)}
              />
            </View>
          )}
        </Card>
      </Reveal>

      {/* A perda, ao lado da contagem, porque são a mesma família: as duas
          dizem que a prateleira discorda do sistema. A diferença é que a
          contagem não sabe por quê e a perda sabe - e é o porquê que faz o
          relatório servir para decidir.

          O motivo é escolhido em palavra, sem pílula desenhada à mão: o
          escolhido muda de cor E de peso, porque cor sozinha não é informação
          para quem não distingue vermelho de cinza. */}
      <Reveal index={4}>
        <Card
          hue={color.danger}
          icon={(c) => <GlyphLoss size={26} color={c} weight={traco} />}
          title={t.app.inputDetail.lossTitle}
        >
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {t.app.inputDetail.lossHint}
          </Text>

          {losing ? (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Field
                label={t.app.inputDetail.lossAmount}
                value={lostText}
                onChangeText={setLostText}
                keyboardType="numeric"
                suffix={item.baseUnit}
                autoFocus
              />

              <Text style={[type.overline, { color: color.inkFaint }]}>
                {t.app.inputDetail.lossWhy.toUpperCase()}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {REASONS.map((r) => {
                  const chosen = reason === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setReason(r)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: chosen }}
                      accessibilityLabel={t.loss[r]}
                      style={{ paddingVertical: space.sm, paddingRight: space.md }}
                    >
                      <Text
                        style={[
                          type.body,
                          {
                            color: chosen ? color.danger : color.inkMuted,
                            fontWeight: chosen ? '600' : '400',
                          },
                        ]}
                      >
                        {t.loss[r]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Button label={t.app.inputDetail.lossConfirm} onPress={submitLoss} weighty />
              <Button
                label={t.app.inputDetail.lossCancel}
                variant="ghost"
                onPress={() => {
                  setLosing(false);
                  setLostText('');
                }}
              />
            </View>
          ) : (
            <View style={{ marginTop: space.md }}>
              <Button
                label={t.app.inputDetail.lossStart}
                variant="ghost"
                onPress={() => setLosing(true)}
              />
            </View>
          )}
        </Card>
      </Reveal>

      {/* O histórico, desenhado antes de ser lido: a linha diz se o preço sobe
          há três compras, e as linhas embaixo dizem de quanto para quanto.
          Sem segunda compra não há cartão — o motivo já está dito ao lado do
          número lá em cima. */}
      {moves.length > 0 ? (
        <Reveal index={5}>
          <Card
            hue={palette.sky}
            icon={(c) => <GlyphChart size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.history}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.inputDetail.historyHint}
            </Text>

            {(data?.history ?? []).length > 1 ? (
              <View style={{ marginTop: space.md }}>
                <Sparkline
                  values={[...(data?.history ?? [])].reverse().map((h) => h.newRate)}
                  hue={palette.sky}
                  strokeWidth={traco}
                />
              </View>
            ) : null}

            <View style={{ marginTop: space.sm }}>
              {moves.map((move) => {
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
              })}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* Quem se apoia neste item, em laranja porque receita é produção. É o
          que diz se um aumento aqui é nota de pé de página ou crise — e é a
          porta para a receita, que é onde se faz alguma coisa a respeito. */}
      {(data?.recipes.length ?? 0) > 0 ? (
        <Reveal index={6}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.usedBy}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {data!.recipes.length === 1
                ? t.app.inputDetail.usedByOne
                : fill(t.app.inputDetail.usedByMany, { count: data!.recipes.length })}
            </Text>
            <View style={{ marginTop: space.sm }}>
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
        </Reveal>
      ) : null}

      {/* A próxima ação provável, ao alcance do polegar: lançar a compra é o
          que quase sempre traz alguém a esta tela. Corrigir e tirar de
          circulação ficam fantasma — botão grande e colorido convida, e
          ninguém deve ser convidado a desfazer. */}
      <Reveal index={7}>
        <View style={{ gap: space.sm }}>
          <Button
            label={t.app.inputDetail.recordPurchase}
            onPress={() => router.push(`/purchase?itemId=${item.id}`)}
            icon={(c) => <GlyphPurchase size={22} color={c} weight={traco} />}
            weighty
          />
          <Button
            label={t.app.inputDetail.correct}
            variant="ghost"
            onPress={() => router.push(`/inputs/new?id=${item.id}`)}
          />
          <Button
            label={item.active ? t.app.inputDetail.retire : t.app.inputDetail.bringBack}
            variant="ghost"
            onPress={() => void toggleActive()}
          />
        </View>
      </Reveal>
    </CollapsingHeader>
  );
}

/** As cinco palavras que o servidor aceita, na ordem em que a fábrica as usa. */
const REASONS: LossReason[] = ['expired', 'melted', 'broken', 'courtesy', 'internal_use'];
