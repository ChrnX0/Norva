import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { ListRow } from '@/components/ListRow';
import { listItems, type ItemKind, type ItemWithCost } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { defaultLocale, formatMoney } from '@/i18n';
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

const TABS: { kind: ItemKind; label: string; empty: string }[] = [
  { kind: 'input', label: 'Insumos', empty: 'Nada cadastrado ainda.' },
  { kind: 'packaging', label: 'Embalagem', empty: 'Palito, saquinho, rótulo — nada ainda.' },
  { kind: 'store_supply', label: 'Material de loja', empty: 'Copo, colher, guardanapo — nada ainda.' },
];

function InputsList() {
  const { color, space, type, accent } = useTheme();
  const router = useRouter();
  const locale = defaultLocale;
  const [kind, setKind] = useState<ItemKind>('input');

  const { data, loading } = useQuery(() => listItems(LOCAL_COMPANY_ID));
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
  const tab = TABS.find((t) => t.kind === kind);

  return (
    <CollapsingHeader title="Almoxarifado" overline="o que você compra">
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
                    {entry.label} {count > 0 ? `· ${count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Card>

      {shown.length > 0 ? (
        <Card tone="area">
          <Text style={[type.overline, { color: color.inkFaint }]}>PARADO NO ESTOQUE</Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {formatMoney(heldCents, locale)}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {shown.length} {shown.length === 1 ? 'item' : 'itens'} ·  ao custo médio de cada um
          </Text>
          {withoutPrice > 0 ? (
            <Text style={[type.caption, { color: color.warning, marginTop: space.sm }]}>
              {withoutPrice} {withoutPrice === 1 ? 'item ainda não tem' : 'itens ainda não têm'}{' '}
              preço — lance a nota de compra e o custo aparece sozinho.
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        {loading ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>Abrindo…</Text>
        ) : shown.length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>{tab?.empty}</Text>
        ) : (
          shown.map((item) => (
            <ListRow
              key={item.id}
              label={item.name}
              detail={describe(item)}
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
          O valor à direita é o custo a cada 1.000 {shown[0].baseUnit}.
        </Text>
      ) : null}

      <Button label="Cadastrar novo" onPress={() => router.push('/inputs/new')} weighty />
    </CollapsingHeader>
  );
}

/** What the row says under the name: how it is bought, and what is on hand. */
function describe(item: ItemWithCost): string {
  const parts: string[] = [];

  if (item.purchaseUnit && item.purchaseToBase) {
    parts.push(`${item.purchaseUnit} · ${item.purchaseToBase.toLocaleString('pt-BR')} ${item.baseUnit}`);
  }
  if (item.onHandBaseUnits > 0) {
    parts.push(`${item.onHandBaseUnits.toLocaleString('pt-BR')} ${item.baseUnit} em estoque`);
  }

  return parts.join('  ·  ');
}
