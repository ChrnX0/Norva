import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { IconChevron, IconTransport } from '@/components/icons';
import { nowIso } from '@/data/db';
import { shipmentsOn, type Shipment } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import { fill, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { palettes } from '@/theme/tokens';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Where today's load went.
 *
 * The canvas draws one line per destination, with what each received underneath
 * and the day's total on top. Everything on this screen is read from the
 * positive legs of today's transfers - nothing here is typed, and nothing is
 * summed across items that do not share a unit.
 *
 * WHAT THE CANVAS DRAWS AND THIS SCREEN DOES NOT: "A Loja Norte ainda não
 * conferiu o que chegou". That warning is the absence of a fact, and the fact
 * has nowhere to be written yet - the server has had a `control_post` column
 * since the first migration and the device schema has never had one. It arrives
 * with the check-in screen, not with a sentence the app cannot back up.
 */
export default function Transport() {
  return (
    <AreaProvider area="lilac">
      <WhereItWent />
    </AreaProvider>
  );
}

function WhereItWent() {
  const { color, scheme, type, space } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();
  const palette = palettes[scheme];

  const { data, loading } = useQuery<Shipment[]>(async () => {
    const today = dayWindow(nowIso(), locale.timeZone);
    return shipmentsOn(LOCAL_COMPANY_ID, today.from, today.to);
  });

  const places = data ?? [];

  // O resumo do dia conta DESTINOS, não caixas.
  //
  // A prancha escreve "18 caixas em 3 destinos", e a metade das caixas é o que
  // este app não pode dizer: açúcar e polpa não têm camada de caixa, então
  // somar tudo numa unidade só inventaria um número que ninguém consegue contar
  // na doca. Destino é contável sempre, e é o que a linha diz.
  const summary = plural(places.length, t.app.transport.destinations, formatQuantity(places.length, locale));

  return (
    <CollapsingHeader
      title={t.app.transport.title}
      overline={places.length > 0 ? fill(t.app.transport.today, { summary }) : undefined}
    >
      {places.map((place) => (
        <Pressable
          key={place.locationId}
          onPress={() => router.push('/places')}
          accessibilityRole="button"
          accessibilityLabel={place.locationName}
        >
          <Card>
            <View style={[styles.row, { gap: space.md }]}>
              <IconTransport size={26} color={palette.lilac} />
              <View style={{ flex: 1 }}>
                <Text style={[type.cardTitle, { color: color.ink }]} numberOfLines={1}>
                  {place.locationName}
                </Text>
              </View>
              <IconChevron size={18} color={color.inkFaint} />
            </View>

            {/* Cada item na unidade que ele tem. Nada é convertido para caber
                numa coluna só. */}
            <View style={{ marginTop: space.sm, gap: space.xs }}>
              {place.items.map((item) => (
                <View key={item.itemId} style={styles.row}>
                  <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[type.secondary, styles.number, { color: color.ink }]}>
                    {formatQuantity(item.baseUnits, locale)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </Pressable>
      ))}

      {!loading && places.length === 0 ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.transport.empty}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.transport.emptyHint}
          </Text>
        </Card>
      ) : null}

      <Button
        label={t.app.transport.send}
        onPress={() => router.push('/transfer')}
        icon={(c) => <IconTransport size={24} color={c} />}
      />
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
