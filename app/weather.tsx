import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphFactory, GlyphThermometer } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
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
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`),
 * e o layout anterior saiu inteiro em vez de ganhar um caminho ao lado: os
 * cartões sem crachá nem tom, a fileira de cidades feita à mão com `Pressable` e
 * `StyleSheet`, o link de voltar como texto cinza centralizado, e — a pior das
 * quatro — um `borderRadius: radius.pill` escrito na mão sobre o botão, que
 * punha uma pílula do Orgânico no meio de uma página do Papel. Nada aqui desenha
 * caixa: `Card`, `Button` e `ListRow` já sabem virar régua no Papel e bloco no
 * Orgânico, e é por isso que a mesma tela sai certa nas duas caras de graça.
 *
 * Dois assuntos, dois crachás: o **termômetro** é o clima, que é a razão da tela
 * existir numa fábrica de sorvete, e a **fábrica** é o lugar de onde ele é
 * medido. A cidade em vigor é o título do primeiro cartão em vez de um parágrafo
 * dentro dele — é a resposta, e resposta não se lê no meio do texto.
 *
 * O que esta tela NÃO desenha, e o motivo é escrito: a cena do céu e a régua de
 * temperatura (`src/components/Sky`) precisam de máxima, mínima e chance de
 * chuva, e a única consulta desta tela é a cidade guardada. Cena que não sai do
 * dado é enfeite, e enfeite ensina a ignorar — a semana desenhada mora na capa,
 * onde a previsão de verdade existe.
 */
export default function WeatherPlaceScreen() {
  return (
    <AreaProvider area="sky">
      <PickCity />
    </AreaProvider>
  );
}

function PickCity() {
  const { color, type, space, palette, traco } = useTheme();
  const { t } = useLocale();
  const router = useRouter();
  const words = t.app.weatherPlace;

  const { data: current, error, refresh } = useQuery<WeatherPlace | null>(() => readPlace());

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

  /** Duas "Santa Maria" existem: o que separa uma da outra é o estado. */
  const curta = (place: WeatherPlace) => `${place.latitude},${place.longitude}`;

  return (
    <CollapsingHeader
      cena="clima"
      title={words.title}
      overline={words.overline}
      erro={error}
      denovo={refresh}
    >
      {/* A cidade que está valendo, dita como título e não como parágrafo.
          É o que a tela responde, então é a primeira coisa grande do olho: o
          crachá diz que o assunto é o clima, o nome diz de onde, e a frase
          embaixo diz por que isto sequer é assunto numa fábrica de sorvete. */}
      <Reveal index={0}>
        <Card
          hue={palette.sky}
          icon={(c) => <GlyphThermometer size={26} color={c} weight={traco} />}
          title={current ? label(current) : undefined}
        >
          <Text style={[type.overline, { color: color.inkFaint }]}>
            {words.current.toUpperCase()}
          </Text>

          {/* Sem cidade ainda: desenho, uma frase, e a próxima ação no cartão
              de baixo. Estado vazio é estado válido, e não uma tela em branco. */}
          {current ? null : (
            <Text style={[type.body, { color: color.inkMuted, marginTop: space.xs }]}>
              {words.none}
            </Text>
          )}

          {/* O que está diferente agora. A confirmação diz o que já aconteceu e
              onde isso aparece — a capa —, com o nome por extenso. */}
          {saved ? (
            <Text style={[type.body, { color: color.ok, marginTop: space.sm }]}>
              {fill(words.saved, { city: saved })}
            </Text>
          ) : null}

          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
            {words.why}
          </Text>
        </Card>
      </Reveal>

      {/* Trocar a cidade: formulário continua formulário.
          O cartão não tem título escrito porque a etiqueta do campo já é o
          cabeçalho dele — repetir "Procurar cidade" três vezes na mesma altura
          da tela é o parágrafo cinza voltando por outra porta. O crachá da
          fábrica é o que diz o assunto: onde ela fica. */}
      <Reveal index={1}>
        <Card hue={palette.sky} icon={(c) => <GlyphFactory size={26} color={c} weight={traco} />}>
          <View style={{ gap: space.lg }}>
            <Field
              label={words.search}
              value={term}
              onChangeText={(next) => {
                setTerm(next);
                setFound(null);
              }}
              hint={words.searchHint}
            />

            {/* Lei 5: o erro impede em vez de reclamar. Com menos de duas
                letras a busca não sai — antes o botão aceitava o toque e não
                fazia nada, que num celular de fábrica se lê como "o aplicativo
                travou". A guarda de dentro de `search` continua onde estava. */}
            <Button
              label={searching ? words.searching : words.search}
              onPress={search}
              disabled={searching || term.trim().length < 2}
            />

            {/* Sem resultado a causa é uma de duas, e as duas têm conserto
                diferente: o nome está errado, ou não há rede. Dizer as duas é o
                que a Lei 5 pede - o erro impede E diz o caminho. */}
            {found && found.length === 0 && !searching ? (
              <View style={{ gap: space.xs }}>
                <Text style={[type.body, { color: color.ink }]}>{words.noResults}</Text>
                <Text style={[type.caption, { color: color.inkMuted }]}>{words.offline}</Text>
              </View>
            ) : null}

            {/* Uma linha por cidade, com o estado embaixo do nome — sem desenho
                em cada uma: ícone em toda linha de lista vira papel de parede e
                para de ser visto. O assunto é do cartão, não da linha. */}
            {found && found.length > 0 ? (
              <View>
                {found.map((place) => (
                  <ListRow
                    key={curta(place)}
                    label={place.name}
                    detail={place.region ?? undefined}
                    onPress={() => choose(place)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </Card>
      </Reveal>

      {/* Voltar é fantasma, e é a última coisa da pilha: ninguém deve ser
          convidado a sair antes de responder. */}
      <Reveal index={2}>
        <Button label={words.back} variant="ghost" onPress={() => router.back()} />
      </Reveal>
    </CollapsingHeader>
  );
}
