import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { listPlaces, listProducts, saveOrder, type Place, type Product } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { nowIso } from '@/data/db';
import { useQuery } from '@/data/useQuery';
import { localDate } from '@/domain/day';
import { parseTyped } from '@/domain/number';
import { fill, formatQuantity, joinList, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Anotar o que um cliente pediu.
 *
 * A tela é curta de propósito: quem anota pedido costuma estar no telefone com
 * o cliente falando. Cliente, dia e itens — e o dia nasce preenchido em amanhã,
 * que é o que a fábrica combina na maioria das ligações (Lei 2).
 *
 * O pedido NÃO mexe em estoque, e é por isso que ele não pergunta nada sobre
 * saldo: nada saiu do freezer porque alguém ligou. Quem transforma pedido em
 * movimento é a carga que sai, mais tarde, na transferência.
 */
export default function NewOrderScreen() {
  return (
    <AreaProvider area="mint">
      <NewOrder />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; products: Product[] };
type Draft = { itemId: string; name: string; baseUnits: number };

function NewOrder() {
  const { color, type, space, radius } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const words = t.app.newOrder;

  const { data } = useQuery<Loaded>(async () => {
    const [places, products] = await Promise.all([
      listPlaces(LOCAL_COMPANY_ID),
      listProducts(LOCAL_COMPANY_ID),
    ]);
    // A fábrica não pede para si mesma: o lugar padrão é de onde a carga sai.
    return { places: places.filter((p) => !p.isDefault), products };
  });

  const [placeId, setPlaceId] = useState<string | null>(null);
  const [whenDays, setWhenDays] = useState(1);
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [lines, setLines] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const place = data?.places.find((p) => p.id === placeId) ?? data?.places[0] ?? null;
  const product = data?.products.find((p) => p.id === productId) ?? data?.products[0] ?? null;
  const units = Math.max(0, parseTyped(quantity) ?? 0);

  /** O dia pedido, como data local: hoje, amanhã ou depois. */
  const requestedFor = useMemo(
    () => localDate(nowIso(), locale.timeZone, whenDays),
    [whenDays, locale.timeZone],
  );

  const addLine = () => {
    if (!product || units <= 0) return;
    setErro(null);
    setLines((current) => {
      const existing = current.find((l) => l.itemId === product.itemId);
      // O mesmo produto duas vezes é erro de digitação, não pedido duplo: soma.
      if (existing) {
        return current.map((l) =>
          l.itemId === product.itemId ? { ...l, baseUnits: l.baseUnits + units } : l,
        );
      }
      return [...current, { itemId: product.itemId, name: product.name, baseUnits: units }];
    });
    setQuantity('');
  };

  const save = async () => {
    if (saving) return;
    if (!place) return setErro(words.needsCustomer);
    if (lines.length === 0) return setErro(words.needsLine);

    const yes = await askConfirm({
      title: words.confirmTitle,
      confirmLabel: words.confirmAction,
      message: fill(words.confirmBody, {
        items: joinList(
          lines.map((l) =>
            fill(words.confirmItem, {
              amount: plural(l.baseUnits, t.units.unit, formatQuantity(l.baseUnits, locale)),
              name: l.name,
            }),
          ),
          t.common.and,
        ),
        place: place.name,
        when: WHEN_KEYS[whenDays] ? words[WHEN_KEYS[whenDays]] : '',
      }),
    });
    if (!yes) return;

    setSaving(true);
    try {
      await saveOrder(LOCAL_COMPANY_ID, {
        placeId: place.id,
        requestedFor,
        lines: lines.map((l) => ({ itemId: l.itemId, baseUnits: l.baseUnits })),
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          borderColor: active ? color.ink : color.line,
          backgroundColor: active ? color.ink : 'transparent',
          borderRadius: radius.pill,
          paddingVertical: space.sm,
          paddingHorizontal: space.md,
        },
      ]}
    >
      <Text style={[type.secondary, { color: active ? color.paper : color.ink }]}>{label}</Text>
    </Pressable>
  );

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      <Card>
        <Text style={[type.overline, { color: color.inkFaint }]}>{words.customer.toUpperCase()}</Text>
        <View style={[styles.wrap, { marginTop: space.sm, gap: space.sm }]}>
          {(data?.places ?? []).map((p) => chip(p.name, p.id === place?.id, () => setPlaceId(p.id), p.id))}
        </View>
        {data && data.places.length === 0 ? (
          <Pressable onPress={() => router.push('/places')} accessibilityRole="button">
            <Text style={[type.body, { color: color.ink, marginTop: space.sm }]}>
              {words.noCustomers}
            </Text>
          </Pressable>
        ) : null}

        <Text style={[type.overline, { color: color.inkFaint, marginTop: space.lg }]}>
          {words.when.toUpperCase()}
        </Text>
        <View style={[styles.wrap, { marginTop: space.sm, gap: space.sm }]}>
          {WHEN.map(({ days, key }) => chip(words[key], days === whenDays, () => setWhenDays(days), key))}
        </View>
      </Card>

      <Card>
        <Text style={[type.overline, { color: color.inkFaint }]}>{words.product.toUpperCase()}</Text>
        <View style={[styles.wrap, { marginTop: space.sm, gap: space.sm }]}>
          {(data?.products ?? []).map((p) =>
            chip(p.name, p.id === product?.id, () => setProductId(p.id), p.id),
          )}
        </View>

        {data && data.products.length === 0 ? (
          <Pressable onPress={() => router.push('/products/new')} accessibilityRole="button">
            <Text style={[type.body, { color: color.ink, marginTop: space.sm }]}>
              {words.noProducts}
            </Text>
          </Pressable>
        ) : null}

        <View style={{ marginTop: space.md }}>
          <Field
            label={words.quantity}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            placeholder="0"
          />
        </View>

        <View style={{ marginTop: space.md }}>
          <Button label={words.addLine} onPress={addLine} style={{ borderRadius: radius.pill }} />
        </View>
      </Card>

      {lines.length > 0 ? (
        <Card tone="area">
          <Text style={[type.cardTitle, { color: color.ink }]}>{words.listed}</Text>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {lines.map((l) => (
              <View key={l.itemId} style={styles.row}>
                <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {l.name}
                </Text>
                <Text style={[type.body, styles.number, { color: color.ink }]}>
                  {formatQuantity(l.baseUnits, locale)}
                </Text>
                <Pressable
                  onPress={() => setLines((c) => c.filter((x) => x.itemId !== l.itemId))}
                  accessibilityRole="button"
                  accessibilityLabel={`${words.remove}: ${l.name}`}
                  style={{ paddingHorizontal: space.sm }}
                >
                  <Text style={[type.secondary, { color: color.inkFaint }]}>{words.remove}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {erro ? (
        <Card tone="warning">
          <Text style={[type.body, { color: color.ink }]}>{erro}</Text>
        </Card>
      ) : null}

      <Button label={words.save} onPress={save} style={{ borderRadius: radius.pill }} />
      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={[type.secondary, { color: color.inkFaint, textAlign: 'center' }]}>
          {words.back}
        </Text>
      </Pressable>
    </CollapsingHeader>
  );
}

const WHEN = [
  { days: 0, key: 'today' as const },
  { days: 1, key: 'tomorrow' as const },
  { days: 2, key: 'dayAfter' as const },
];

const WHEN_KEYS: Record<number, 'today' | 'tomorrow' | 'dayAfter'> = {
  0: 'today',
  1: 'tomorrow',
  2: 'dayAfter',
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1 },
  number: { fontVariant: ['tabular-nums'] },
});
