import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { parseTyped } from '@/domain/number';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import {
  defaultLocationId,
  lastSentBaseUnits,
  listPlaces,
  recordTransfer,
  stockByPlace,
  type Place,
  type PlaceStock,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * O que sai da fábrica e chega na loja.
 *
 * A tela só oferece o que existe onde a carga sai: a lista de itens vem do
 * saldo da origem, não do catálogo. Isso é a Lei 5 escrita como desenho e não
 * como validação — não dá para mandar o que não está lá porque nunca aparece
 * para escolher, em vez de aparecer e ser recusado depois de digitar.
 *
 * E a quantidade não nasce vazia da segunda vez em diante: `lastSentBaseUnits`
 * lê no livro-razão quanto foi para aquela loja da última vez. A primeira
 * remessa não tem palpite, e é honesto que não tenha.
 */
export default function TransferScreen() {
  return (
    <AreaProvider area="lilac">
      <Transfer />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; stock: PlaceStock[] };

function Transfer() {
  const { color, type, space } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const router = useRouter();
  const words = t.app.transfer;

  const { data, refresh } = useQuery<Loaded>(async () => {
    const [places, stock] = await Promise.all([
      listPlaces(LOCAL_COMPANY_ID),
      stockByPlace(LOCAL_COMPANY_ID),
    ]);
    return { places, stock };
  });

  const from = defaultLocationId(LOCAL_COMPANY_ID);
  const [toId, setToId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [typed, setTyped] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const nameOf = (id: string) => {
    const place = data?.places.find((p) => p.id === id);
    return place?.name.trim() || t.app.places.factory;
  };

  const destinations = (data?.places ?? []).filter((p) => p.id !== from);
  const to = destinations.find((p) => p.id === toId) ?? destinations[0] ?? null;

  const here = data?.stock.find((p) => p.locationId === from);
  const lines = here?.lines ?? [];
  const line = lines.find((l) => l.itemId === itemId) ?? lines[0] ?? null;

  // Lei 1 e Lei 2 juntas: o palpite vem do que já aconteceu, não de um zero.
  useEffect(() => {
    let alive = true;
    if (!line || !to) return;
    void lastSentBaseUnits(LOCAL_COMPANY_ID, line.itemId, to.id).then((n) => {
      if (alive) setLastSent(n);
    });
    return () => {
      alive = false;
    };
  }, [line, to]);

  const amount = typed ? Math.max(0, (parseTyped(amountText) ?? 0) || 0) : (lastSent ?? 0);
  const over = line != null && amount > line.baseUnits;

  const ready = line != null && to != null && amount > 0 && !over && !sending;

  const onSend = async () => {
    if (!ready || !line || !to) return;

    const go = await askConfirm({
      title: words.confirmTitle,
      confirmLabel: words.confirmAction,
      message: fill(words.confirmBody, {
        amount: `${formatQuantity(amount, locale)} ${line.baseUnit}`,
        item: line.name,
        from: nameOf(from),
        to: nameOf(to.id),
      }),
    });
    if (!go) return;

    setSending(true);
    try {
      await recordTransfer(LOCAL_COMPANY_ID, {
        itemId: line.itemId,
        fromLocationId: from,
        toLocationId: to.id,
        baseUnits: amount,
      });
      setTyped(false);
      setAmountText('');
      refresh();
    } catch (e) {
      await askConfirm({
        title: words.failed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
      });
    } finally {
      setSending(false);
    }
  };

  if (destinations.length === 0) {
    return (
      <CollapsingHeader title={words.title} overline={words.overline}>
        <Card>
          <Text style={[type.body, { color: color.ink }]}>{words.noPlaces}</Text>
        </Card>
        <Button label={words.createFirst} onPress={() => router.push('/places')} />
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          {words.to}
        </Text>
        {destinations.map((place) => (
          <Pressable
            key={place.id}
            onPress={() => setToId(place.id)}
            accessibilityRole="button"
            accessibilityLabel={place.name}
            style={[styles.row, { paddingVertical: space.sm }]}
          >
            <Text
              style={[type.body, { color: place.id === to?.id ? color.ink : color.inkMuted, flex: 1 }]}
            >
              {place.id === to?.id ? '● ' : '○ '}
              {place.name}
            </Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          {words.pick}
        </Text>
        {lines.length === 0 ? (
          <Text style={[type.body, { color: color.inkMuted }]}>
            {fill(words.nothingHere, { place: nameOf(from) })}
          </Text>
        ) : (
          lines.map((l) => (
            <Pressable
              key={l.itemId}
              onPress={() => {
                setItemId(l.itemId);
                setTyped(false);
                setAmountText('');
              }}
              accessibilityRole="button"
              accessibilityLabel={l.name}
              style={[styles.row, { paddingVertical: space.sm }]}
            >
              <Text
                style={[type.body, { color: l.itemId === line?.itemId ? color.ink : color.inkMuted, flex: 1 }]}
              >
                {l.itemId === line?.itemId ? '● ' : '○ '}
                {l.name}
              </Text>
              <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                {formatQuantity(l.baseUnits, locale)} {l.baseUnit}
              </Text>
            </Pressable>
          ))
        )}
      </Card>

      {line ? (
        <Card tone={over ? 'warning' : 'plain'}>
          <View style={{ gap: space.lg }}>
            <Field
              label={words.howMuch}
              value={typed ? amountText : lastSent != null ? String(lastSent) : ''}
              onChangeText={(next) => {
                setTyped(true);
                setAmountText(next);
              }}
              keyboardType="numeric"
              suffix={line.baseUnit}
              hint={
                lastSent != null
                  ? fill(words.lastTime, {
                      amount: `${formatQuantity(lastSent, locale)} ${line.baseUnit}`,
                    })
                  : fill(words.available, {
                      amount: `${formatQuantity(line.baseUnits, locale)} ${line.baseUnit}`,
                      place: nameOf(from),
                    })
              }
            />
            {over ? (
              <Chip signal="warning" label={fill(words.overBalance, { place: nameOf(from) })} />
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* A distinção que o produto faz desde o começo, dita onde ela decide. */}
      <Text
        style={[type.caption, { color: color.inkMuted, paddingHorizontal: space.lg }]}
      >
        {words.notASale}
      </Text>

      <Button
        label={sending ? words.sending : words.send}
        onPress={onSend}
        disabled={!ready}
      />
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});
