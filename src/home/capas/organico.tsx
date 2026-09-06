import type { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bars } from '@/components/Bars';
import { CountUp } from '@/components/CountUp';
import { GlyphPrice, GlyphStock, GlyphVehicle } from '@/components/Glyph';
import { Landscape } from '@/components/Landscape';
import { Superficie } from '@/components/Superficie';
import { Touchable } from '@/components/Touchable';
import { brand } from '@/config/brand';
import { SkyMark, TemperatureRange } from '@/components/Sky';
import {
  fill,
  formatCoverDate,
  formatPercent,
  formatQuantity,
  formatTime,
  formatWeekdayAbbrev,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { nowIso } from '@/data/db';
import { todayRank } from '@/domain/briefing';
import { localDate } from '@/domain/day';
import { Folha } from '../Capa';
import type { PecaDaCapa, Vestimenta } from './vestimenta';

/**
 * Quanto o primeiro cartão sobe por cima da paisagem.
 *
 * É a assinatura da capa aprovada do Orgânico: a cena não termina numa linha
 * reta, ela some por baixo de um cartão que flutua. Vinte e oito é o raio do
 * canto — o cartão encosta na cena por mais ou menos um canto inteiro, que é o
 * que faz a sobreposição parecer proposital em vez de erro de margem.
 */
const SOBREPOSICAO = 34;

/**
 * A página do Orgânico: uma paisagem que sangra, e cartões flutuando nela.
 *
 * A linha de olho não fica acima da cena — ela mora DENTRO dela, sobre o céu, e
 * é por isso que a `Folha` recebe `topo` em vez de `olho`: com `topo`, ela não
 * desenha a própria linha, e quem a desenha é o herói.
 *
 * Sem herói (a pessoa escondeu a produção do dia nos ajustes) a página volta a
 * começar pela linha de olho da `Folha`, com a marca e o dia juntos. Esconder
 * uma peça não pode apagar o topo da tela.
 */
function CascoOrganico({
  marca,
  data,
  heroi,
  children,
}: {
  marca: string;
  data: string;
  heroi: ReactNode;
  children: ReactNode;
}) {
  return (
    <Folha olho={`${marca} · ${data}`} topo={heroi ?? undefined}>
      {/* O MIOLO INTEIRO sobe por cima da cena, e não o primeiro cartão.
          Amarrar a sobreposição à primeira peça parece igual e não é: peça é
          quem tem o que dizer, e a de cima pode não ter num dia qualquer — aí a
          cena terminaria numa borda reta e o cartão seguinte flutuaria solto,
          num dia sim e noutro não. Subindo o miolo, quem estiver em cima
          encosta, seja quem for. */}
      <View style={{ marginTop: heroi ? -SOBREPOSICAO : 0 }}>{children}</View>
    </Folha>
  );
}

/**
 * O casco de uma peça no Orgânico: um cartão branco de canto generoso.
 *
 * É a diferença de gênero entre as duas caras aprovadas, e ela não é enfeite. O
 * Papel é uma página impressa — régua horizontal e espaço em branco, sem caixa
 * em volta de nada. O Orgânico é o oposto: **nenhuma peça encosta no fundo**,
 * cada assunto vive numa superfície própria que flutua sobre a página. Enquanto
 * as duas peles usavam o mesmo casco (o nada), a foto do Orgânico era a foto do
 * Papel com outra cor — que foi exatamente o que o dono recusou.
 *
 * A sombra é só no claro. No escuro, sombra preta sobre fundo preto não existe;
 * o que separa o cartão da página lá é a superfície ser mais clara que o fundo,
 * com um fio de contorno para o olho achar a borda.
 */
function BlocoOrganico({ children }: { children: ReactNode }) {
  const { color, space, radius, scheme } = useTheme();
  const noite = scheme === 'dark';

  return (
    <View
      style={[
        {
          backgroundColor: color.surface,
          borderRadius: radius.xl,
          paddingVertical: space.xl,
          paddingHorizontal: space.xl,
        },
        noite
          ? { borderWidth: StyleSheet.hairlineWidth, borderColor: color.lineStrong }
          : {
              shadowColor: '#0B1F14',
              shadowOpacity: 0.07,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
              elevation: 2,
            },
      ]}
    >
      {/* O cartão AVISA que É superfície: um `Card` aqui dentro desenha o
          conteúdo e larga a moldura, senão a foto sai com caixa dentro de
          caixa — que é o que o dono circulou quando recusou a pilha de
          retângulos. Ver `components/Superficie`. */}
      <Superficie>{children}</Superficie>
    </View>
  );
}

/**
 * Um selo: o par "rótulo + número" que o desenho aprovado põe sobre a cena.
 *
 * Ele existe porque a comparação não pode virar cartão aqui. No Papel a
 * comparação é o diagrama com as duas caixas e as setas; no Orgânico ela é
 * miúda e mora colada no número, porque a cena já ocupa a metade de cima da
 * tela e um segundo bloco ali empurraria a semana para fora do primeiro olhar.
 * Mesma informação, mesmo lugar na leitura, outro peso.
 */
function Selo({ children }: { children: ReactNode }) {
  const { space, radius, scheme, color } = useTheme();
  const noite = scheme === 'dark';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: 7,
        borderRadius: radius.pill,
        // Translúcido de propósito: o céu tem que continuar visível por baixo,
        // senão o selo lê como um retângulo colado na paisagem.
        backgroundColor: noite ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.80)',
        borderWidth: noite ? StyleSheet.hairlineWidth : 0,
        borderColor: color.lineStrong,
      }}
    >
      {children}
    </View>
  );
}

/**
 * O herói do Orgânico: a paisagem inteira, com o número do dia dentro dela.
 *
 * O desenho aprovado (`docs/design/aprovados/organico-claro.jpg`) não tem
 * manchete escrita: tem o NÚMERO em corpo de herói e a unidade embaixo dele. A
 * frase "Hoje a fábrica fez 500 unidades" é do Papel, que é uma página de
 * revista; aqui a fábrica fala pelo número.
 *
 * A cena fica atrás, esticada de borda a borda, e o texto por cima com margem à
 * direita para não encostar no sol nem na fábrica. A margem é percentual porque
 * a cena se ancora no canto direito: em qualquer largura, do telefone pequeno ao
 * tablet, a mesma fração de tela fica com o desenho.
 */
function HeroiOrganico({ data, sky, estado, go }: PecaDaCapa) {
  const { color, type, space, palette } = useTheme();
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const { height: altura } = useWindowDimensions();

  const feito = data?.madeToday ?? 0;
  const carregando = estado === 'loading';
  const contraSemana = data ? data.madeToday - data.madeThen : 0;

  return (
    <Touchable onPress={() => go('/production')} accessibilityLabel={t.app.home.capaLead}>
      <View>
        {/* A cena por baixo de tudo, sem canto: ela é o topo da TELA, e um raio
            aqui deixaria dois triângulos da cor da página nos cantos de cima. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Landscape
            maxC={sky ? sky.today.maxC : null}
            rainChance={sky ? sky.today.rainChance : null}
            running={(data?.running.length ?? 0) > 0}
            height="100%"
            raio={0}
          />
        </View>

        <View
          style={{
            /**
             * O herói ocupa uma FRAÇÃO da tela, não uma altura em pixel.
             *
             * Sem piso ele encolhe até a altura do próprio texto, e num dia sem
             * produção — quando não há os dois selos de comparação — a cena
             * perde a parte de cima: o sol sai pequeno e alto, a nuvem some, e
             * o que sobra é uma tarja verde. A cena É a identidade desta pele;
             * ela não pode depender de quanto texto o dia teve.
             *
             * Trinta por cento é o que o desenho aprovado usa, e em fração ele
             * vale igual no telefone de 360 dp e no tablet de 800 — que é a
             * regra da casa: nada de medida de tela em pixel fixo.
             */
            minHeight: Math.round(altura * 0.3),
            // O texto começa EM CIMA e a altura que sobra vai para a cena. Com
            // o texto no pé, o céu vazio ficava acima dele e a colina espremida
            // embaixo — o contrário do desenho aprovado, em que o número está no
            // primeiro terço e a paisagem ocupa o que vem depois dele.
            paddingTop: insets.top + space.xl,
            paddingHorizontal: space.xl + 2,
            // O rodapé conta a sobreposição: o primeiro cartão do miolo sobe por
            // cima daqui, e sem esta folga ele cobriria os selos.
            paddingBottom: space.xl + SOBREPOSICAO,
          }}
        >
          {/* A marca e o dia, do tamanho de legenda. O nome do produto em corpo
              grande gastaria o topo da tela dizendo o que a pessoa já sabe. */}
          <Text
            style={[type.overline, { color: color.inkMuted, letterSpacing: 3.2 }]}
            numberOfLines={1}
          >
            {brand.name.toUpperCase()}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: 2 }]} numberOfLines={1}>
            {formatCoverDate(nowIso(), locale)}
          </Text>

          {/* O número, e nada de "0" enquanto a resposta não chegou: meio segundo
              de zero num aparelho lento é meio segundo dizendo que a fábrica não
              produziu, para quem produziu. */}
          <View style={{ minHeight: type.hero.lineHeight + 4, justifyContent: 'flex-end' }}>
            {carregando ? null : (
              <CountUp
                value={feito}
                format={(v) => formatQuantity(Math.round(v), locale)}
                style={{ ...type.hero, color: color.ink }}
              />
            )}
          </View>
          <Text style={[type.body, { color: color.inkMuted }]}>
            {carregando
              ? ''
              : feito > 0
                ? fill(t.app.home.organico.producedToday, {
                    unit: plural(feito, t.units.unit),
                  })
                : t.app.home.organico.quietToday}
          </Text>

          {data && data.everMade ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space.sm,
                marginTop: space.lg,
              }}
            >
              <Selo>
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {t.app.home.boxYesterday.toLowerCase()}
                </Text>
                <Text style={[type.secondary, estilos.numero, { color: color.ink }]}>
                  {formatQuantity(data.madeYesterday, locale)}
                </Text>
              </Selo>

              {/* A comparação com o MESMO dia da semana passada, que é a que
                  responde "isto é normal numa quarta?". O rótulo diz o dia por
                  extenso porque "há uma semana" numa quarta é a quarta passada,
                  e a pessoa pensa no nome do dia, não no número de dias. */}
              <Selo>
                <Text
                  style={[
                    type.secondary,
                    estilos.numero,
                    { color: contraSemana >= 0 ? palette.mint : palette.rose },
                  ]}
                >
                  {`${contraSemana >= 0 ? '↑' : '↓'} ${contraSemana >= 0 ? '+' : '\u2212'}${formatQuantity(Math.abs(contraSemana), locale)}`}
                </Text>
                <Text style={[type.secondary, { color: color.inkMuted }]} numberOfLines={1}>
                  {fill(t.app.home.organico.vsWeekdayPill, {
                    weekday: formatWeekdayAbbrev(localDate(nowIso(), locale.timeZone, -7), locale),
                  })}
                </Text>
              </Selo>
            </View>
          ) : null}
        </View>
      </View>
    </Touchable>
  );
}

/**
 * A semana no Orgânico: as sete colunas com a posição de hoje dita por extenso.
 *
 * O desenho aprovado escreve "hoje é o segundo melhor dia" ao lado do título, e
 * essa frase é a Lei 3 servida de graça — as colunas mostram a forma, a frase
 * responde a pergunta. Sem ela o cartão exige que alguém compare sete alturas de
 * olho, que é justamente o trabalho que a capa existe para não pedir.
 */
function SemanaOrganico({ data, go, Casca }: PecaDaCapa) {
  const { color, type, space, palette } = useTheme();
  const { locale, t } = useLocale();
  if (!data || data.series.length === 0) return null;

  const posicao = todayRank(data.series);
  const ordinais = t.app.home.organico.ordinals;
  const frase =
    posicao === null
      ? null
      : posicao === 1
        ? t.app.home.organico.weekBest
        : // Do segundo ao sétimo: a lista tem seis palavras e a semana tem sete
          // dias. Fora da lista não se inventa ordinal — some a frase, que é
          // melhor que "hoje é o 8º melhor dia" numa régua de sete.
          posicao - 2 < ordinais.length
          ? fill(t.app.home.organico.weekRank, { rank: ordinais[posicao - 2] })
          : null;

  return (
    <Casca>
      <Touchable onPress={() => go('/reports')} accessibilityLabel={t.app.home.weekTitle}>
        <View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: space.md,
            }}
          >
            <Text style={[type.section, { color: color.ink }]}>{t.app.home.weekTitle}</Text>
            {frase ? (
              <Text
                style={[type.secondary, { color: color.inkFaint, flexShrink: 1, textAlign: 'right' }]}
                numberOfLines={1}
              >
                {frase}
              </Text>
            ) : null}
          </View>
          <Bars
            series={data.series}
            hue={palette.mint}
            labels={data.series.map((d) => formatWeekdayAbbrev(d.date, locale))}
          />
        </View>
      </Touchable>
    </Casca>
  );
}

/**
 * O crachá redondo do Orgânico: o desenho do assunto dentro de um disco de cor.
 *
 * É o oposto do que o Papel faz com o mesmo ícone — lá ele é traço solto sobre o
 * creme, porque a página é monoline e um selo maciço ali parece de outro
 * aplicativo. Aqui é massa, porque o Orgânico é um tema de massa. Mesmo desenho,
 * mesmo tamanho, e a pele decide se ele mora num disco.
 */
function Cracha({ cor, children }: { cor: string; children: (tinta: string) => ReactNode }) {
  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tingir(cor, 0.16),
      }}
    >
      {children(cor)}
    </View>
  );
}

/**
 * A mesma cor, lavada, para virar fundo de crachá ou de bloco.
 *
 * Sem alfa de verdade: o disco vive sobre um cartão branco no claro e sobre uma
 * superfície escura no escuro, e uma cor translúcida ficaria diferente em cada
 * um. O que se quer é a cor DA ÁREA presente e discreta nos dois.
 */
function tingir(hex: string, forca: number): string {
  return `${hex}${Math.round(forca * 255).toString(16).padStart(2, '0')}`;
}

/**
 * Uma linha de assunto: crachá, o que é, e o número à direita.
 *
 * Duas dessas empilhadas são o segundo cartão do desenho aprovado — o insumo
 * mais curto e o que saiu para as lojas. A forma é a mesma nas duas porque são a
 * mesma pergunta com dois sujeitos: quanto ainda tem, quanto já foi.
 */
function Linha({
  cor,
  icone,
  titulo,
  legenda,
  valor,
  unidade,
  tinta,
  onPress,
  rotulo,
}: {
  cor: string;
  icone: (tinta: string) => ReactNode;
  titulo: string;
  legenda: string;
  valor: string;
  unidade: string;
  tinta: string;
  onPress: () => void;
  rotulo: string;
}) {
  const { color, type, space } = useTheme();
  return (
    <Touchable onPress={onPress} accessibilityLabel={rotulo}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <Cracha cor={cor}>{icone}</Cracha>
        <View style={{ flex: 1 }}>
          <Text style={[type.section, { color: color.ink }]} numberOfLines={1}>
            {titulo}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted }]} numberOfLines={2}>
            {legenda}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type.figure, estilos.numero, { color: tinta, fontSize: 24, lineHeight: 28 }]}>
            {valor}
          </Text>
          <Text style={[type.caption, { color: color.inkFaint }]}>{unidade}</Text>
        </View>
      </View>
    </Touchable>
  );
}

/**
 * O insumo mais curto e a carga do dia, um em cima do outro.
 *
 * O Papel desenha o pote com o nível dentro, porque a página é ilustrada. Aqui
 * são duas linhas com crachá, que é o que o desenho aprovado mostra — e a
 * diferença não é gosto: no Orgânico o cartão já é a moldura, e um pote alto
 * dentro dele empilharia duas molduras no mesmo assunto.
 */
function InsumosOrganico({ data, go, Casca }: PecaDaCapa) {
  const { color, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  if (!data) return null;

  const curto = data.shortly[0] ?? null;
  const folgado = !curto && data.everMade ? (data.cover[0] ?? null) : null;
  const nivel = curto ?? folgado;
  const temCaixas = data.boxes > 0;
  if (!nivel && !temCaixas) return null;

  return (
    <Casca>
      <View style={{ gap: space.xl }}>
        {nivel ? (
          <Linha
            cor={curto ? color.warning : palette.apricot}
            icone={(tinta) => <GlyphStock size={24} color={tinta} weight={traco} />}
            titulo={nivel.name}
            legenda={t.app.home.organico.shortestInput}
            valor={plural(Math.floor(nivel.daysLeft), t.app.home.dayCount)}
            unidade={t.app.home.organico.runsOutIn}
            tinta={curto ? color.warning : color.ink}
            onPress={() => go('/inputs')}
            rotulo={curto ? t.app.home.runningOut : t.app.home.inputsFine}
          />
        ) : null}

        {nivel && temCaixas ? (
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.line }} />
        ) : null}

        {temCaixas ? (
          <Linha
            cor={palette.lilac}
            icone={(tinta) => <GlyphVehicle size={24} color={tinta} weight={traco} />}
            titulo={t.app.home.boxesTitle}
            legenda={t.app.home.organico.shipmentToday}
            valor={formatQuantity(data.boxes, locale)}
            unidade={plural(data.boxes, t.app.home.boxCount)}
            tinta={color.ink}
            onPress={() => go('/transport')}
            rotulo={t.app.home.boxesTitle}
          />
        ) : null}
      </View>
    </Casca>
  );
}

/**
 * Os preços que mexeram, em ladrilhos — um por insumo, três de cada vez.
 *
 * Em lista vertical eles competiam com o resto do cartão pela altura; em
 * ladrilho a comparação é lateral e o olho lê os três de uma vez, que é a
 * pergunta ("o que mudou?") respondida numa olhada. O que sobra fica na ficha
 * do insumo, que é onde alguém confere.
 */
function PrecosOrganico({ moved, go, Casca }: PecaDaCapa) {
  const { color, type, space, palette, radius, traco } = useTheme();
  const { locale, t } = useLocale();
  if (moved.length === 0) return null;

  const tres = moved.slice(0, 3);

  return (
    <Casca>
      <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.changed}>
        <View style={{ gap: space.lg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: space.md,
            }}
          >
            <Text style={[type.section, { color: color.ink }]}>{t.app.home.changed}</Text>
            <Text
              style={[type.secondary, { color: color.inkFaint, flexShrink: 1, textAlign: 'right' }]}
              numberOfLines={1}
            >
              {fill(t.app.home.organico.movedSince, {
                count: plural(tres.length, t.app.home.organico.movedCount, formatQuantity(tres.length, locale)),
              })}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {tres.map((mudanca) => {
              const antes = mudanca.previousRate ?? mudanca.newRate;
              const delta = antes > 0 ? (mudanca.newRate - antes) / antes : 0;
              const subiu = delta > 0;
              const tinta = subiu ? color.warning : color.ok;
              return (
                <View
                  key={`${mudanca.itemId}-${mudanca.observedAt}`}
                  style={{
                    flex: 1,
                    gap: space.sm,
                    padding: space.md,
                    borderRadius: radius.lg,
                    backgroundColor: color.sunken,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: tingir(palette.sky, 0.18),
                      }}
                    >
                      <GlyphPrice size={16} color={palette.sky} weight={traco} />
                    </View>
                    <Text style={[type.secondary, estilos.numero, { color: tinta }]} numberOfLines={1}>
                      {`${subiu ? '▲' : '▼'} ${formatPercent(Math.abs(delta), locale)}`}
                    </Text>
                  </View>
                  <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
                    {mudanca.name}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </Touchable>
    </Casca>
  );
}

/**
 * O tempo no Orgânico — o cartão que encosta na paisagem.
 *
 * É o único bloco da capa que fala de algo que não é da fábrica, e no Papel isso
 * se diz com um contorno. Aqui não precisa: ele já é o cartão que sobe por cima
 * da cena, e a cena é o céu de que ele fala. A moldura seria repetir com linha o
 * que a composição já disse.
 */
function ClimaOrganico({ sky, weather, abrir, aberta, Casca }: PecaDaCapa) {
  const { color, type, space, palette } = useTheme();
  const { locale, t } = useLocale();
  if (!sky) return null;

  const chuva = sky.today.rainChance;
  const cidade = fill(t.app.weather.nowAt, { city: weather?.place.name ?? '' });
  const amanha =
    sky.warmerBy === null
      ? null
      : sky.warmerBy === 0
        ? t.app.weather.same
        : fill(t.app.weather.tomorrowDelta, {
            delta: `${sky.warmerBy > 0 ? '+' : '\u2212'}${plural(Math.abs(sky.warmerBy), t.app.weather.degrees)}`,
          });

  return (
    <Casca>
      <Touchable onPress={() => abrir('clima')} accessibilityLabel={cidade}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <SkyMark maxC={sky.today.maxC} rainChance={chuva} size={62} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={[type.overline, { color: color.inkFaint, letterSpacing: 2.4 }]}
                numberOfLines={1}
              >
                {cidade.toUpperCase()}
              </Text>
              <Text
                style={[type.figure, estilos.numero, { color: color.ink, fontSize: 34, lineHeight: 40 }]}
              >
                {`${Math.round(sky.today.maxC)}°`}
              </Text>
              <Text style={[type.secondary, { color: color.inkMuted }]} numberOfLines={2}>
                {fill(t.app.weather.lowShort, {
                  degrees: plural(Math.round(sky.today.minC), t.app.weather.degrees),
                })}
                {chuva === null
                  ? ''
                  : ` · ${fill(t.app.weather.rain, { percent: Math.round(chuva) })}`}
              </Text>
              {amanha === null ? null : (
                // O de amanhã num selo, e não numa terceira linha de texto: é a
                // única informação do cartão que fala do FUTURO, e a Lei 4 manda
                // avisar na data da decisão. Quem produz hoje para vender amanhã
                // decide por este número.
                <View style={{ flexDirection: 'row', marginTop: space.xs }}>
                  <View
                    style={{
                      paddingHorizontal: space.md,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: tingir(palette.apricot, 0.16),
                    }}
                  >
                    <Text style={[type.caption, estilos.numero, { color: palette.apricot }]}>
                      {`↑ ${amanha}`}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* A semana do tempo, que é o que o toque abre — pedido do dono, e o
              motivo dele: "vou vender mais sexta?" se responde com sete dias de
              uma vez. A pele muda o casco do cartão, nunca o que ele faz. */}
          {aberta === 'clima' && weather ? (
            <View style={{ gap: space.sm, marginTop: space.lg }}>
              {weather.days.slice(0, 7).map((dia) => (
                <View
                  key={dia.date}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}
                >
                  <Text style={[type.caption, { color: color.inkFaint, width: 34 }]}>
                    {formatWeekdayAbbrev(dia.date, locale)}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <TemperatureRange minC={dia.minC} maxC={dia.maxC} />
                  </View>
                  <Text style={[type.caption, estilos.numero, { color: color.ink }]}>
                    {`${Math.round(dia.maxC)}°`}
                  </Text>
                  {dia.rainChance !== null && dia.rainChance >= 30 ? (
                    <Text style={[type.caption, { color: palette.sky }]}>
                      {`${Math.round(dia.rainChance)}%`}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <Text style={[type.caption, { color: color.inkFaint, marginTop: space.md }]}>
            {weather
              ? `${fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })} · ${aberta === 'clima' ? t.app.home.less : t.app.home.more}`
              : ''}
          </Text>
        </View>
      </Touchable>
    </Casca>
  );
}

const estilos = StyleSheet.create({
  numero: { fontVariant: ['tabular-nums'], fontWeight: '700' },
});

export const ORGANICO: Vestimenta = {
  Casco: CascoOrganico,
  Bloco: BlocoOrganico,
  sangra: 'producao',
  pecas: {
    producao: HeroiOrganico,
    semana: SemanaOrganico,
    insumos: InsumosOrganico,
    precos: PrecosOrganico,
    clima: ClimaOrganico,
  },
};
