import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { IconChevron, IconTransport } from '@/components/icons';
import { nowIso } from '@/data/db';
import { recordCheck, shipmentsOn, type Shipment } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import { fill, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Where today's load went, and whether anybody opened it.
 *
 * The canvas draws one line per destination, with what each received underneath
 * and the day's total on top. Everything on this screen is read from the
 * positive legs of today's transfers - nothing here is typed, and nothing is
 * summed across items that do not share a unit.
 *
 * The canvas's warning - "A Loja Norte ainda não conferiu o que chegou" - is on
 * the screen now, and it is the absence of a fact rather than an accusation:
 * nobody is late, nobody is blamed, the box simply has not been opened. Tapping
 * it records what the store counted.
 *
 * A destination reads as checked only when EVERY shipment that landed there
 * today was checked. A store that received the morning load and the afternoon
 * one has opened one box; saying "conferido" would be telling the owner
 * something nobody verified.
 */
export default function Transport() {
  return (
    <AreaProvider area="lilac">
      <WhereItWent />
    </AreaProvider>
  );
}

function WhereItWent() {
  const { color, type, space, palette } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();

  const confirm = useConfirm();

  const { data, loading, refresh } = useQuery<{ hoje: Shipment[]; ontem: Shipment[] }>(async () => {
    const today = dayWindow(nowIso(), locale.timeZone);
    const yesterday = dayWindow(nowIso(), locale.timeZone, -1);
    const [hoje, ontem] = await Promise.all([
      shipmentsOn(LOCAL_COMPANY_ID, today.from, today.to),
      // Ontem entra pela Lei 3: "3 destinos" não é muito nem pouco até estar ao
      // lado do que foi ontem. Esta aba dizia o número sozinho.
      shipmentsOn(LOCAL_COMPANY_ID, yesterday.from, yesterday.to),
    ]);
    return { hoje, ontem };
  });

  const places = data?.hoje ?? [];
  const ontem = new Set((data?.ontem ?? []).map((p) => p.locationId)).size;

  // O resumo do dia conta DESTINOS, não caixas.
  //
  // A prancha escreve "18 caixas em 3 destinos", e a metade das caixas é o que
  // este app não pode dizer: açúcar e polpa não têm camada de caixa, então
  // somar tudo numa unidade só inventaria um número que ninguém consegue contar
  // na doca. Destino é contável sempre, e é o que a linha diz.
  /**
   * Conferir é dizer que a caixa foi aberta e o que havia dentro.
   *
   * A confirmação spelling out what will be written, como toda escrita deste
   * app: o padrão é "chegou tudo", porque é o que acontece na maioria das
   * vezes e porque um formulário de contagem por item, no celular, na doca,
   * ninguém preenche. Quem achou diferença corrige na tela do lugar, que já
   * sabe registrar contagem cega.
   */
  const ask = async (place: Shipment) => {
    const said = place.items
      .map((i) => `${formatQuantity(i.baseUnits, locale)} ${i.name.toLocaleLowerCase(locale.formatting)}`)
      .join(' · ');

    const yes = await confirm({
      title: fill(t.app.transport.checkTitle, { place: place.locationName }),
      message: said,
      confirmLabel: t.app.transport.check,
    });
    if (!yes) return;

    // Sem lista de contagem: "chegou tudo" é a resposta, e cada remessa é
    // conferida contra as próprias pernas. Mandar a soma do destino para cada
    // remessa contaria a mesma mercadoria duas vezes quando a loja recebeu duas
    // cargas no mesmo dia.
    for (const groupId of place.groupIds) {
      await recordCheck(LOCAL_COMPANY_ID, { groupId });
    }
    refresh();
  };

  const summary = plural(places.length, t.app.transport.destinations, formatQuantity(places.length, locale));

  return (
    <CollapsingHeader
      title={t.app.transport.title}
      overline={places.length > 0 ? fill(t.app.transport.today, { summary }) : undefined}
    >
      {/* Lei 3: "3 destinos" não é muito nem pouco até estar ao lado de ontem.
          A comparação NÃO cabe no overline - ele é maiúsculo e truncado em uma
          linha, então num celular estreito a metade que importa seria cortada. */}
      {places.length > 0 ? (
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.xs }]}>
          {ontem === 0
            ? t.app.transport.firstDay
            : fill(t.app.transport.vsYesterday, {
                count: plural(ontem, t.app.transport.destinations, formatQuantity(ontem, locale)),
              })}
        </Text>
      ) : null}

      {places.map((place) => (
        <Pressable
          key={place.locationId}
          onPress={() => (place.checked ? router.push('/places') : void ask(place))}
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

            {/* O que o desenho pede, e o que ele significa: a caixa ainda não
                foi aberta. Orienta, não fiscaliza - a frase fala do que chegou,
                nunca de quem deveria ter conferido. */}
            {!place.checked ? (
              <View style={{ marginTop: space.sm }}>
                <Chip
                  signal="warning"
                  label={fill(t.app.transport.notChecked, { place: place.locationName })}
                />
              </View>
            ) : null}

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
