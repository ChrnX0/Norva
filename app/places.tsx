import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { listPlaces, savePlace, stockByPlace, type Place, type PlaceStock } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill, formatMoney, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Onde está o que você tem.
 *
 * Existe porque o saldo da empresa e o saldo de um lugar são perguntas
 * diferentes com a mesma resposta somada por eixos diferentes, e até aqui só a
 * primeira tinha tela. Uma fábrica que manda caixa para quatro lojas não decide
 * nada com o total — decide com "o que ainda tem na Loja Centro".
 *
 * O lugar padrão é gravado sem nome de propósito (`repository.listPlaces`), e é
 * aqui que ele ganha um: a camada de dados devolve string vazia, quem fala
 * português é a tela.
 */
export default function PlacesScreen() {
  return (
    <AreaProvider area="mint">
      <Places />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; stock: PlaceStock[] };

function Places() {
  const { color, type, space } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();
  const words = t.app.places;

  const { data, refresh } = useQuery<Loaded>(async () => {
    const [places, stock] = await Promise.all([
      listPlaces(LOCAL_COMPANY_ID),
      stockByPlace(LOCAL_COMPANY_ID),
    ]);
    return { places, stock };
  });

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('own_store');
  const [saving, setSaving] = useState(false);

  /** O padrão nasce sem nome; a palavra é desta camada, nunca do banco. */
  const nameOf = (place: { locationId?: string; id?: string; name?: string; locationName?: string }) => {
    const raw = place.name ?? place.locationName ?? '';
    return raw.trim() || words.factory;
  };

  const onSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await savePlace(LOCAL_COMPANY_ID, { name, kind });
      setName('');
      setAdding(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const KINDS = ['own_store', 'cold_room', 'store_room'] as const;

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      {(data?.stock.length ?? 0) === 0 ? (
        <Card>
          <Text style={[type.body, { color: color.inkMuted }]}>{words.empty}</Text>
        </Card>
      ) : null}

      {(data?.stock ?? []).map((place) => (
        <Card key={place.locationId} tone="area">
          <View style={styles.row}>
            <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]}>{nameOf(place)}</Text>
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {words.kinds[place.kind as keyof typeof words.kinds] ?? place.kind}
            </Text>
          </View>

          {/* Lei 3: nenhum número sozinho. A quantidade vem com o que ela vale. */}
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {plural(place.lines.length, words.itemCount)} ·{' '}
            {fill(words.worth, { amount: formatMoney(place.valueCents, locale) })}
          </Text>

          <View style={{ marginTop: space.md, gap: space.xs }}>
            {place.lines.map((line) => (
              <View key={line.itemId} style={styles.row}>
                <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {line.name}
                </Text>
                <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                  {formatQuantity(line.baseUnits, locale)} {line.baseUnit}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ))}

      {adding ? (
        <Card>
          <View style={{ gap: space.lg }}>
            <Field
              label={words.placeName}
              value={name}
              onChangeText={setName}
              hint={words.placeNameHint}
            />
            <View>
              <Text style={[type.caption, { color: color.inkMuted, marginBottom: space.sm }]}>
                {words.placeKind}
              </Text>
              <View style={{ gap: space.xs }}>
                {KINDS.map((k) => (
                  <Text
                    key={k}
                    accessibilityRole="button"
                    accessibilityLabel={words.kinds[k]}
                    onPress={() => setKind(k)}
                    style={[type.body, { color: k === kind ? color.ink : color.inkMuted }]}
                  >
                    {k === kind ? '● ' : '○ '}
                    {words.kinds[k]}
                  </Text>
                ))}
              </View>
            </View>
            <Button label={words.save} onPress={onSave} disabled={!name.trim() || saving} />
          </View>
        </Card>
      ) : (
        <Button label={words.newPlace} onPress={() => setAdding(true)} variant="ghost" />
      )}

      {/* A próxima ação provável, que é o terceiro dever de toda tela. */}
      {(data?.places.length ?? 0) > 1 ? (
        <Button label={words.goTransfer} onPress={() => router.push('/transfer')} variant="ghost" />
      ) : null}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});
