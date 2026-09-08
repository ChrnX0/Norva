import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CountUp } from '@/components/CountUp';
import { Button } from '@/components/Button';
import { Alive } from '@/components/Alive';
import { Card } from '@/components/Card';
import { bandSignal } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphBucket, GlyphPackaging, GlyphPlus, GlyphSack, GlyphStock } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import {
  alertSettings,
  canSeeMoney,
  listPlaces,
  listItems,
  runningOut,
  type ItemKind,
  type ItemWithCost,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { useQuery } from '@/data/useQuery';
import type { Cents } from '@/domain/money';
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
 *
 * A cara desta tela foi reescrita, não remendada: o corpo anterior era pílula
 * desenhada à mão (`borderRadius`, `backgroundColor` e `borderWidth` próprios)
 * dentro de cartão cinza, que é o vocabulário do Orgânico chumbado numa tela que
 * também tem que servir o Papel. Agora quem sabe das duas caras são o `Card`, o
 * `Button` e o `Reveal`, e aqui não se desenha caixa nenhuma.
 *
 * A área passou de `mist` (que é a cor dos ajustes) para `mint`, que é o tom do
 * almoxarifado em todo o aplicativo — o cabeçalho, o filtro e o cartão do total
 * agora concordam com a régua da tabela de tons.
 */
export default function InputsListScreen() {
  return (
    <AreaProvider area="mint">
      <InputsList />
    </AreaProvider>
  );
}

/**
 * A ordem das abas; as palavras vêm do dicionário e o desenho vem do tipo.
 *
 * O glifo é do ASSUNTO: saco é o que se compra a granel, embalagem é o que veste
 * o produto, balde é o que vai para o balcão da loja. Numa fábrica onde nem todo
 * mundo lê rápido, o desenho é o que separa as três antes da palavra.
 */
const TABS: {
  kind: ItemKind;
  key: 'input' | 'packaging' | 'storeSupply';
  desenho: (cor: string, traco: number) => ReactNode;
}[] = [
  { kind: 'input', key: 'input', desenho: (c, w) => <GlyphSack size={26} color={c} weight={w} /> },
  {
    kind: 'packaging',
    key: 'packaging',
    desenho: (c, w) => <GlyphPackaging size={26} color={c} weight={w} />,
  },
  {
    kind: 'store_supply',
    key: 'storeSupply',
    desenho: (c, w) => <GlyphBucket size={26} color={c} weight={w} />,
  },
];

function InputsList() {
  const { color, space, type, palette, traco } = useTheme();
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

  const { data: places } = useQuery(() => listPlaces(empresaDaqui()));
  /** As faixas que a casa combinou. Sem elas, nenhuma linha ganha cor. */
  const { data: faixas } = useQuery(() => alertSettings());
  /**
   * Os itens e o portão do dinheiro na MESMA consulta, de propósito.
   *
   * Duas consultas separadas dariam dois estados de carregamento, e entre eles
   * existe um instante em que a tela já tem os números e ainda não sabe se pode
   * mostrá-los. Piscar a cifra e apagar depois é vazar devagar.
   */
  const { data: carregado, loading } = useQuery(
    async () => ({
      itens: await listItems(empresaDaqui(), undefined, false, place ? { sala: place } : { unidade: unidadeDaqui() }),
      dinheiro: await canSeeMoney(empresaDaqui()),
    }),
    place ?? '',
  );
  const data = carregado?.itens;
  const dinheiro = carregado?.dinheiro === true;

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
      empresaDaqui(),
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
  const heldCents = dinheiro
    ? shown.reduce((total, item) => total + Math.round((item.averageRate ?? 0) * item.onHandBaseUnits), 0)
    : null;

  /**
   * Quantos ainda não têm preço — e `null <= 0` é TRUE em JavaScript.
   *
   * Sem o `!== null` a contagem passaria a ser a de TODOS os itens no dia em que
   * o portão fecha, e a tela escreveria em âmbar *"12 itens sem preço — lance a
   * nota de compra"* para um almoxarifado inteiramente precificado. Ação
   * inventada é pior que número ausente: manda alguém lançar nota que já existe.
   */
  const withoutPrice = shown.filter((item) => item.averageRate !== null && item.averageRate <= 0).length;
  const tab = TABS.find((entry) => entry.kind === kind);
  const empty = tab ? t.app.inputs.empty[tab.key] : '';
  const assunto = tab ? t.app.inputs.tabs[tab.key] : t.app.inputs.title;
  const salas = places ?? [];

  return (
    <CollapsingHeader cena="insumos" title={t.app.inputs.title} overline={t.app.inputs.overline}>
      {/* O recorte, e ele vem antes de tudo porque é ele que muda todo número
          abaixo: que tipo de coisa, e de que sala. As duas perguntas moram no
          mesmo bloco porque são a mesma pergunta — qual pedaço do almoxarifado
          estou olhando. */}
      <Reveal index={0}>
        <Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: space.xl }}>
              {TABS.map((entry, i) => {
                const active = entry.kind === kind;
                const count = all.filter((i) => i.kind === entry.kind).length;
                return (
                  <Pressable
                    key={entry.kind}
                    onPress={() => setKind(entry.kind)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t.app.inputs.tabs[entry.key]}
                    style={{
                      alignItems: 'center',
                      gap: space.xs,
                      minWidth: 76,
                      paddingVertical: space.sm,
                    }}
                  >
                    {/* O filtro respira como todo desenho do aplicativo: o
                        crachá do cartão faz isso pelo `Card`, e aqui o glifo
                        está solto, então o `Alive` entra na mão. */}
                    <Alive index={i}>
                      {entry.desenho(active ? palette.mint : color.inkFaint, traco)}
                    </Alive>
                    <Text
                      style={[
                        type.secondary,
                        {
                          color: active ? palette.mint : color.inkMuted,
                          fontWeight: active ? '600' : '400',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {t.app.inputs.tabs[entry.key]}
                      {count > 0 ? ` · ${formatQuantity(count, locale)}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* O filtro de sala, e ele só aparece quando há sala para filtrar.
              Com a polpa dividida entre a fábrica e a câmara fria, o total da
              empresa continua certo e continua respondendo a pergunta errada
              para quem está no tacho: o que importa ali é o que tem NAQUELA
              sala. */}
          {salas.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: space.sm }}
            >
              <View style={{ flexDirection: 'row', gap: space.lg }}>
                {[null, ...salas.map((p) => p.id)].map((id) => {
                  const active = place === id;
                  const lugar = salas.find((p) => p.id === id);
                  const nome =
                    id === null ? t.app.inputs.everywhere : lugar?.name || t.app.places.factory;
                  return (
                    <Pressable
                      key={id ?? 'todos'}
                      onPress={() => setPlace(id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={nome}
                      style={{ paddingVertical: space.sm }}
                    >
                      <Text
                        style={[
                          type.secondary,
                          {
                            color: active ? palette.mint : color.inkMuted,
                            fontWeight: active ? '600' : '400',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {nome}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : null}
        </Card>
      </Reveal>

      {/* O dinheiro parado, que é a única figura desta tela — e ela nunca
          aparece sozinha: embaixo vem quanto tempo isso dura na saída que a
          própria fábrica registrou. Sem item no recorte não há cartão: um total
          de zero é um alerta inventado. */}
      {shown.length > 0 ? (
        <Reveal index={1}>
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
            title={assunto}
          >
            {heldCents === null ? null : (
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {t.app.inputs.heldTitle}
              </Text>
            )}
            {heldCents === null ? (
              /* O lugar da figura, dizendo onde o número mora em vez de deixar
                 um travessão sem explicação. Uma vez por tela, no cartão de
                 cima — a coluna da direita continua muda, porque vinte linhas
                 repetindo a mesma frase é castigo, não informação. */
              <Text style={[type.body, { color: color.inkMuted, marginBottom: space.xs }]}>
                {t.common.moneyHidden}
              </Text>
            ) : (
              <CountUp
                value={heldCents}
                format={(v) => formatMoney(v as Cents, locale)}
                style={{ ...type.figure, color: color.ink, marginTop: space.xs }}
              />
            )}
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {/* "4 itens", não "4 unidades".
                  Contava a LISTA e rotulava com a unidade-base de um produto
                  contável, então quatro insumos apareciam como "4 unidades" ao
                  lado de um saco com 69.566 g dentro. Número que mente é pior
                  que número ausente: este dizia que a fábrica tem quatro de
                  alguma coisa. */}
              {/* "ao custo médio de cada um" é frase sobre dinheiro: sem o
                  custo ela afirmaria o que a tela não mostrou. Sobra a contagem,
                  que é fato e continua servindo. */}
              {dinheiro
                ? fill(t.app.inputs.heldDetail, {
                    count: plural(shown.length, t.app.inputs.itemCount, formatQuantity(shown.length, locale)),
                  })
                : plural(shown.length, t.app.inputs.itemCount, formatQuantity(shown.length, locale))}
              {place ? ` · ${t.app.inputs.inRoom}` : ''}
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
        </Reveal>
      ) : null}

      {/* A lista, e o vazio dela. Vazio não é frase cinza no meio da tela: é o
          desenho do assunto, uma frase, e a ação logo abaixo — é a primeira
          coisa que todo mundo vê no primeiro dia. */}
      <Reveal index={2}>
        {loading ? (
          <Card>
            <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.inputs.opening}</Text>
          </Card>
        ) : shown.length === 0 ? (
          <Card
            hue={palette.mint}
            icon={(c) =>
              tab ? tab.desenho(c, traco) : <GlyphStock size={26} color={c} weight={traco} />
            }
            title={assunto}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{empty}</Text>
          </Card>
        ) : (
          <Card>
            {shown.map((item) => (
              <ListRow
                key={item.id}
                label={item.name}
                // A faixa de cor, quando o item tem régua cadastrada. Sem nível
                // cheio não há cor: pintar por conta própria seria inventar o que é
                // pouco, e a lista ensinaria a ignorar a cor.
                signal={
                  faixas
                    ? bandSignal(volumeBand(item.onHandBaseUnits, item.fullLevel, faixas.bands))
                    : undefined
                }
                detail={describe(
                  item,
                  t.app.inputs.inStock,
                  locale.formatting,
                  t.app.inputs.ofFull,
                )}
                trailing={
                  item.averageRate !== null && item.averageRate > 0
                    ? formatMoney(Math.round(item.averageRate * 1_000), locale)
                    : '—'
                }
                trailingTone={
                  item.averageRate !== null && item.averageRate > 0 ? 'ink' : 'muted'
                }
                onPress={() =>
                  // A sala vai junto, e ela não é enfeite: sem ela a tela de
                  // detalhe abre no total da empresa e a contagem grava a
                  // diferença contra o almoxarifado. Com a polpa dividida entre
                  // a fábrica e a câmara fria, isso TELEPORTA estoque.
                  router.push(`/inputs/${item.id}${place ? `?sala=${place}` : ''}`)
                }
              />
            ))}
            {/* A régua da coluna da direita, colada na coluna que ela explica —
                e ela só existe se houver coluna: sem custo, a régua explicaria
                uma coluna inteira de travessões. */}
            {dinheiro ? (
              <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
                {fill(t.app.inputs.perThousand, { unit: shown[0].baseUnit })}
              </Text>
            ) : null}
          </Card>
        )}
      </Reveal>

      <Reveal index={3}>
        <Button
          label={t.app.inputs.addNew}
          onPress={() => router.push('/inputs/new')}
          icon={(c) => <GlyphPlus size={22} color={c} weight={traco} />}
          weighty
        />
      </Reveal>
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
