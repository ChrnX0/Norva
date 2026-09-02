import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { useQuery } from '@/data/useQuery';
import { searchPlaces, type WeatherPlace } from '@/weather';
import { fetchJson, readPlace, writePlace } from '@/weather/live';
import { fill } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Onde fica a fábrica — a única pergunta que o clima precisa fazer.
 *
 * E ela nasce respondida: o fuso do aparelho já diz a cidade, então esta tela
 * abre mostrando a que está valendo e existe para o caso em que o palpite está
 * errado — a fábrica no interior com o fuso da capital, que é o caso comum.
 *
 * A busca é a única coisa no aplicativo inteiro que exige internet, e ela diz
 * isso com todas as letras em vez de girar para sempre: quem está sem sinal
 * precisa saber que o problema não é o nome que digitou.
 */
export default function WeatherPlaceScreen() {
  return (
    <AreaProvider area="sky">
      <PickCity />
    </AreaProvider>
  );
}

function PickCity() {
  const { color, type, space, radius } = useTheme();
  const { t } = useLocale();
  const router = useRouter();
  const words = t.app.weatherPlace;

  const { data: current, refresh } = useQuery<WeatherPlace | null>(() => readPlace());

  const [term, setTerm] = useState('');
  const [found, setFound] = useState<WeatherPlace[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const search = async () => {
    if (searching || term.trim().length < 2) return;
    setSearching(true);
    setSaved(null);
    try {
      setFound(await searchPlaces(term, fetchJson));
    } finally {
      setSearching(false);
    }
  };

  const choose = async (place: WeatherPlace) => {
    await writePlace(place);
    setFound(null);
    setTerm('');
    setSaved(place.name);
    refresh();
  };

  const label = (place: WeatherPlace) =>
    place.region ? `${place.name} · ${place.region}` : place.name;

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      <Card tone="area">
        <Text style={[type.overline, { color: color.inkFaint }]}>{words.current.toUpperCase()}</Text>
        <Text style={[type.cardTitle, { color: color.ink, marginTop: space.xs }]}>
          {current ? label(current) : words.none}
        </Text>
        <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
          {words.why}
        </Text>
      </Card>

      {saved ? (
        <Card tone="area">
          <Text style={[type.body, { color: color.ink }]}>
            {fill(words.saved, { city: saved })}
          </Text>
        </Card>
      ) : null}

      <Card>
        <Field
          label={words.search}
          value={term}
          onChangeText={(next) => {
            setTerm(next);
            setFound(null);
          }}
          placeholder={words.search}
          hint={words.searchHint}
        />
        <View style={{ marginTop: space.md }}>
          <Button
            label={searching ? words.searching : words.search}
            onPress={search}
            style={{ borderRadius: radius.pill }}
          />
        </View>

        {found && found.length === 0 && !searching ? (
          // Sem resultado a causa é uma de duas, e as duas têm conserto
          // diferente: o nome está errado, ou não há rede. Dizer as duas é o
          // que a Lei 5 pede - o erro impede E diz o caminho.
          <View style={{ marginTop: space.md, gap: space.xs }}>
            <Text style={[type.body, { color: color.ink }]}>{words.noResults}</Text>
            <Text style={[type.caption, { color: color.inkMuted }]}>{words.offline}</Text>
          </View>
        ) : null}

        {found && found.length > 0 ? (
          <View style={{ marginTop: space.md }}>
            {found.map((place) => (
              <Pressable
                key={`${place.latitude},${place.longitude}`}
                onPress={() => choose(place)}
                accessibilityRole="button"
                accessibilityLabel={label(place)}
                style={[styles.row, { paddingVertical: space.md }]}
              >
                <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {label(place)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={[type.secondary, { color: color.inkFaint, textAlign: 'center' }]}>
          {words.back}
        </Text>
      </Pressable>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
