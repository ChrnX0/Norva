import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { bandSignal } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { ListRow } from '@/components/ListRow';
import {
  alertSettings,
  listPlaces,
  listItems,
  runningOut,
  type ItemKind,
  type ItemWithCost,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { volumeBand } from '@/domain/alerts';
import { nowIso } from '@/data/db';
import { dayWindow } from '@/domain/day';
import { fill, formatMoney, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Everything you buy.
 *
 * The list exists because a screen that can only create is a screen nobody can
 * use twice: the second question anybody has is "what did I already register",
 * and until now the answer was unreachable.
 *
 * Each row carries the number the person came for - what it costs per thousand
 * units of use - so the common case needs no tap at all. And the total at the
 * top is the one figure that answers "is my money tied up in the right things".
 */
export default function InputsListScreen() {
  return (
    <AreaProvider area="mist">
      <InputsList />
    </AreaProvider>
  );
}

/** The order of the tabs; their words come from the dictionary. */
const TABS: { kind: ItemKind; key: 'input' | 'packaging' | 'storeSupply' }[] = [
  { kind: 'input', key: 'input' },
  { kind: 'packaging', key: 'packaging' },
  { kind: 'store_supply', key: 'storeSupply' },
];

function InputsList() {
  const { color, space, type, accent } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();
  const [kind, setKind] = useState<ItemKind>('input');
  /**
   * A sala escolhida. Nula é "todos os lugares", e é o padrão.
   *
   * A pergunta "qual sala?" só existe onde existe mais de uma: numa fábrica de
   * um lugar só, oferecer o filtro é pedir o que o sistema já sabe.
   */
  const [place, setPlace] = useState<string | null>(null);

  const { data: places } = useQuery(() => listPlaces(LOCAL_COMPANY_ID));
  /** As faixas que a casa combinou. Sem elas, nenhuma linha ganha cor. */
  const { data: faixas } = useQuery(() => alertSettings());
  const { data, loading } = useQuery(
    () => listItems(LOCAL_COMPANY_ID, undefined, false, place ?? undefined),
    place ?? '',
  );

  /**
   * Quanto tempo o dinheiro do topo dura.
   *
   * Dinheiro parado sozinho não responde nada: R$ 1.500 é muito para uma
   * fábrica e pouco para outra. O que a Lei da Inteligência pede ao lado do
   * número é a comparação, e a comparação honesta aqui não é o mês passado — é
   * quanto tempo isso aguenta na saída que a própria fábrica registrou.
   *
   * O recorte é o mesmo do dinheiro: a aba escolhida e a sala escolhida. Uma
   * frase que fale de insumo debaixo do total de embalagem é pior que frase
   * nenhuma.
   */
  const { data: cover } = useQuery(() => {
    const today = dayWindow(nowIso(), locale.timeZone);
    const lastWeek = dayWindow(nowIso(), locale.timeZone, -7);
    return runningOut(
      LOCAL_COMPANY_ID,
      lastWeek.from,
      today.to,
      7,
      Number.POSITIVE_INFINITY,
      place ?? undefined,
      [kind],
    );
  }, `${kind}:${place ?? ''}`);
  const all = useMemo(() => data ?? [], [data]);
  const shown = all.filter((item) => item.kind === kind);

  /**
   * What is sitting in the storeroom, in money. Every rate is fractional cents
   * per base unit, so this is the one place they turn back into an amount.
   */
  const heldCents = shown.reduce(
    (total, item) => total + Math.round(item.averageRate * item.onHandBaseUnits),
    0,
  );

  const withoutPrice = shown.filter((item) => item.averageRate <= 0).length;
  const tab = TABS.find((entry) => entry.kind === kind);
  const empty = tab ? t.app.inputs.empty[tab.key] : '';

  return (
    <CollapsingHeader title={t.app.inputs.title} overline={t.app.inputs.overline}>
      <Card tone="area">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {TABS.map((entry) => {
              const active = entry.kind === kind;
              const count = all.filter((i) => i.kind === entry.kind).length;
              return (
                <Pressable
                  key={entry.kind}
                  onPress={() => setKind(entry.kind)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: active ? accent : color.line,
                    backgroundColor: active ? `${accent}18` : 'transparent',
                    borderRadius: 999,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                  }}
                >
                  <Text
                    style={[
                      type.secondary,
                      {
                        color: active ? color.ink : color.inkMuted,
                        fontWeight: active ? '600' : '400',
                      },
                    ]}
                  >
                    {t.app.inputs.tabs[entry.key]} {count > 0 ? `· ${count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Card>

      {/* O filtro de sala, e ele só aparece quando há sala para filtrar.
          Com a polpa dividida entre a fábrica e a câmara fria, o total da
          empresa continua certo e continua respondendo a pergunta errada para
          quem está no tacho: o que importa ali é o que tem NAQUELA sala. */}
      {(places ?? []).length > 1 ? (
        <Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[null, ...(places ?? []).map((p) => p.id)].map((id) => {
                const active = place === id;
                const lugar = (places ?? []).find((p) => p.id === id);
                return (
                  <Pressable
                    key={id ?? 'todos'}
                    onPress={() => setPlace(id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: active ? accent : color.line,
                      backgroundColor: active ? `${accent}18` : 'transparent',
                      borderRadius: 999,
                      paddingHorizontal: space.md,
                      paddingVertical: space.sm,
                    }}
                  >
                    <Text
                      style={[
                        type.secondary,
                        {
                          color: active ? color.ink : color.inkMuted,
                          fontWeight: active ? '600' : '400',
                        },
                      ]}
                    >
                      {id === null ? t.app.inputs.everywhere : (lugar?.name || t.app.places.factory)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Card>
      ) : null}

      {shown.length > 0 ? (
        <Card tone="area">
          <Text style={[type.overline, { color: color.inkFaint }]}>{t.app.inputs.heldTitle}</Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {formatMoney(heldCents, locale)}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {fill(t.app.inputs.heldDetail, {
              count: `${formatQuantity(shown.length, locale)} ${
                shown.length === 1 ? t.units.unit.one : t.units.unit.other
              }`,
            })}
          </Text>
          {/* A comparação. Sem saída registrada não existe conta, e dizer isso é
              mais honesto que inventar uma data de acabar. */}
          {cover ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {cover.length === 0
                ? t.app.inputs.coverUnknown
                : cover[0].daysLeft > 30
                  ? t.app.inputs.coverComfortable
                  : fill(t.app.inputs.shortestCover, {
                      item: cover[0].name,
                      days: plural(Math.floor(cover[0].daysLeft), t.app.home.dayCount),
                    })}
            </Text>
          ) : null}
          {withoutPrice > 0 ? (
            <Text style={[type.caption, { color: color.warning, marginTop: space.sm }]}>
              {fill(t.app.inputs.withoutPrice, {
                count: `${formatQuantity(withoutPrice, locale)} ${
                  withoutPrice === 1 ? t.units.unit.one : t.units.unit.other
                }`,
              })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        {loading ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.inputs.opening}</Text>
        ) : shown.length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>{empty}</Text>
        ) : (
          shown.map((item) => (
            <ListRow
              key={item.id}
              label={item.name}
              // A faixa de cor, quando o item tem régua cadastrada. Sem nível
              // cheio não há cor: pintar por conta própria seria inventar o que é
              // pouco, e a lista ensinaria a ignorar a cor.
              signal={faixas ? bandSignal(volumeBand(item.onHandBaseUnits, item.fullLevel, faixas.bands)) : undefined}
              detail={describe(item, t.app.inputs.inStock, locale.formatting, t.app.inputs.ofFull)}
              trailing={
                item.averageRate > 0
                  ? formatMoney(Math.round(item.averageRate * 1_000), locale)
                  : '—'
              }
              trailingTone={item.averageRate > 0 ? 'ink' : 'muted'}
              onPress={() => router.push(`/inputs/${item.id}`)}
            />
          ))
        )}
      </Card>

      {shown.length > 0 ? (
        <Text style={[type.caption, { color: color.inkFaint, textAlign: 'center' }]}>
          {fill(t.app.inputs.perThousand, { unit: shown[0].baseUnit })}
        </Text>
      ) : null}

      <Button label={t.app.inputs.addNew} onPress={() => router.push('/inputs/new')} weighty />
    </CollapsingHeader>
  );
}

/** What the row says under the name: how it is bought, and what is on hand. */
function describe(
  item: ItemWithCost,
  inStock: string,
  formatting: string,
  /** A frase da porcentagem, quando o item tem régua. Cor sozinha não é informação. */
  ofFull?: string,
): string {
  const parts: string[] = [];

  if (item.purchaseUnit && item.purchaseToBase) {
    parts.push(
      `${item.purchaseUnit} · ${item.purchaseToBase.toLocaleString(formatting)} ${item.baseUnit}`,
    );
  }
  if (item.onHandBaseUnits > 0) {
    parts.push(
      fill(inStock, {
        amount: `${item.onHandBaseUnits.toLocaleString(formatting)} ${item.baseUnit}`,
      }),
    );
  }

  // A porcentagem do cheio, que é o número que a cor representa.
  //
  // Sem ela o traço colorido seria a única informação — e cor sozinha não é
  // informação para quem não distingue verde de vermelho. Aqui a linha diz "9%
  // do cheio" e o traço é só o atalho de quem passa o olho.
  if (ofFull && item.fullLevel !== null && item.fullLevel > 0) {
    parts.push(
      fill(ofFull, {
        percent: `${Math.round((item.onHandBaseUnits / item.fullLevel) * 100)}%`,
      }),
    );
  }

  return parts.join('  ·  ');
}
