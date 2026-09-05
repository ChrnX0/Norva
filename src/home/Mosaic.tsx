import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bars } from '@/components/Bars';
import { Drain } from '@/components/Drain';
import { Sparkline } from '@/components/Sparkline';
import { Card } from '@/components/Card';
import { FactoryScene } from '@/components/FactoryScene';
import { Landscape } from '@/components/Landscape';
import { CountUp } from '@/components/CountUp';
import { GlyphBox, GlyphOrder, GlyphPrice, GlyphProduction, GlyphStock } from '@/components/Glyph';
import { PulseDot } from '@/components/PulseDot';
import { Reveal } from '@/components/Reveal';
import { TemperatureRange } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import {
  fill,
  formatCalendarDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatTime,
  formatWeekdayAbbrev,
  plural,
} from '@/i18n';
import type { Dictionary, LocaleSettings } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { nowIso } from '@/data/db';
import { coverState, type BriefingWidget } from '@/domain/briefing';
import { daysBetween, localDate } from '@/domain/day';
import type { Cents } from '@/domain/money';
import { CartaoClima, Comparativo, Legenda, Manchete, Nivel, Regua, Versalete } from './Capa';
import { Peca } from './Peca';
import type { BriefingView, Summary } from './types';

/**
 * Mosaico: uma manchete grande e peças pequenas embaixo.
 *
 * A ideia é que nem todo assunto merece a largura da tela. O que saiu do tacho
 * merece; uma caixa que foi para a loja não. Peças de meia largura lado a lado
 * fazem o olho entender a hierarquia sem ler uma palavra - e quebram a pilha de
 * retângulos iguais que o dono recusou.
 */
export function Mosaic({
  data,
  sky,
  weather,
  shortForOrders,
  moved,
  layout,
  go,
}: BriefingView) {
  const { color, type, space, palette, skin, accent, traco } = useTheme();
  const { locale, t } = useLocale();

  // A espessura do traço é da identidade: fino no Papel, cheio no Orgânico.


  /**
   * Há pedido em aberto — e não "há linha na consulta", que são coisas
   * diferentes desde que ela passou a partir do PRODUTO.
   *
   * `stockAgainstOrders` devolve uma linha por produto para a tela de anotar
   * pedido poder dizer quanto está livre antes do primeiro pedido existir.
   * Medindo o tamanho da lista, a capa de uma fábrica que nunca vendeu nada
   * passava a mostrar "Pedidos cobertos" — um cartão afirmando que está tudo
   * atendido quando não há nada para atender — e o convite do primeiro dia
   * sumia. Contar linha e nomear pedido é a mesma família de defeito que a
   * varredura de hoje caçou.
   */
  const temPedido = (data?.demand ?? []).some((d) => d.requested > 0);

  // A pergunta mora no domínio e tem teste — porque a resposta errada dela é a
  // frase mais cara desta tela. Ver `coverState`.
  const estado = coverState(
    data
      ? {
          madeToday: data.madeToday,
          runs: data.runs,
          cover: data.cover,
          boxes: data.boxes,
          orders: temPedido ? 1 : 0,
          running: data.running,
          expiring: data.expiring,
          dueToday: data.dueToday,
          lossesNow: data.lossesNow,
        }
      : null,
  );


  /**
   * Qual peça está aberta. Uma por vez, e o segundo toque fecha.
   *
   * Duas abertas empurram o resto para fora da tela e a capa deixa de ser capa —
   * então abrir uma fecha a outra sozinha, sem a pessoa precisar arrumar nada.
   */
  const [aberta, setAberta] = useState<BriefingWidget | null>(null);
  const abrir = (id: BriefingWidget) => setAberta((atual) => (atual === id ? null : id));

  /** As corridas que têm taxa congelada, que é o que a peça de custo compara. */
  const comCusto = (data?.runs ?? []).filter((r) => r.unitCostRate !== null);

  /**
   * As peças da capa, montadas na ordem que a casa combinou.
   *
   * Cada uma continua decidindo sozinha se tem o que dizer — ligar não é
   * forçar. O que a preferência decide é a ORDEM e a presença; o que decide se
   * a peça aparece é o dado dela.
   */
  const pecas: Record<BriefingWidget, ReactNode> = {
    /**
     * A manchete do dia — a capa aprovada, ao pé da letra.
     *
     * Ela não é um cartão. Era: título com ícone, borda arredondada e o número
     * em corpo 28 lá dentro. O dono mandou a foto do que chegava e a foto do que
     * tinha que ser, lado a lado, e a diferença não era de ajuste — era de
     * gênero. Página impressa: linha de olho, manchete em serifa, o desenho em
     * traço, régua grossa, o diagrama da conta e a régua da semana.
     *
     * A ordem das partes é a ordem da leitura: o que aconteceu (manchete), como
     * (a linha desenhada), contra o quê (o diagrama), e o que é normal aqui (a
     * semana). São as três perguntas da Lei da Inteligência numa tela só.
     */
    producao: (
      <Reveal index={0}>
        <View>
          {/* Nada de manchete enquanto a resposta não chegou: `forte` nulo
              deixa a linha de baixo em branco em vez de afirmar. É meio segundo
              num aparelho lento — e é exatamente o meio segundo em que a tela
              diria "ainda não produziu" para quem produziu. */}
          <Manchete
            leve={t.app.home.capaLead}
            forte={
              estado === 'loading'
                ? null
                : (data?.madeToday ?? 0) > 0
                  ? fill(t.app.home.capaMade, {
                      amount: `${formatQuantity(data?.madeToday ?? 0, locale)} ${plural(data?.madeToday ?? 0, t.units.unit)}`,
                    })
                  : t.app.home.capaQuiet
            }
          />

          {/* A cena é do Papel; no Orgânico a identidade é a paisagem, e trocar
              uma pela outra é a única coisa que a pele muda aqui. */}
          <View style={{ marginTop: space.md }}>
            {skin === 'papel' ? (
              <FactoryScene
                running={(data?.running.length ?? 0) > 0}
                shipped={(data?.boxes ?? 0) > 0}
                dayShare={
                  data && data.madeYesterday > 0
                    ? Math.min(1, data.madeToday / data.madeYesterday)
                    : data && data.madeToday > 0
                      ? 1
                      : null
                }
              />
            ) : (
              <Landscape
                maxC={sky ? sky.today.maxC : null}
                rainChance={sky ? sky.today.rainChance : null}
                running={(data?.running.length ?? 0) > 0}
                height={150}
              />
            )}
          </View>

          <Legenda>{t.app.home.capaLegend}</Legenda>

          {data && data.everMade ? (
            <>
              <Regua forte />
              <Comparativo
                referencias={[
                  {
                    rotulo: t.app.home.boxYesterday,
                    valor: formatQuantity(data.madeYesterday, locale),
                    delta: sinal(data.madeToday - data.madeYesterday, locale),
                    acima: data.madeToday >= data.madeYesterday,
                  },
                  {
                    // O dia de SETE atrás, não o da primeira coluna da semana.
                    //
                    // Estava lendo `series[0]`, que é seis dias atrás — a régua
                    // da semana tem sete colunas contando hoje. O rótulo dizia
                    // "DOM" ao lado do número de sábado passado: um número certo
                    // com um nome errado em cima, que é pior que número ausente.
                    // `madeThen` é `dayWindow(..., -7)`, então o dia é sempre o
                    // MESMO de hoje — e é por isso que o desenho aprovado diz
                    // "quarta passada" numa quarta.
                    rotulo: fill(t.app.home.boxLastWeek, {
                      weekday: formatWeekdayAbbrev(localDate(nowIso(), locale.timeZone, -7), locale),
                    }),
                    valor: formatQuantity(data.madeThen, locale),
                    delta: sinal(data.madeToday - data.madeThen, locale),
                    acima: data.madeToday >= data.madeThen,
                  },
                ]}
                total={formatQuantity(data.madeToday, locale)}
                unidade={fill(t.app.home.todayUnits, { unit: plural(data.madeToday, t.units.unit) })}
              />
              {/* A conta escrita por extenso: a Lei 6 pede que toda conclusão
                  abra a conta, e aqui ela cabe numa linha — então não precisa de
                  toque nenhum para abrir. */}
              <View style={{ marginTop: space.lg }}>
                <Legenda>{contaDoDia(data, locale, t)}</Legenda>
              </View>
            </>
          ) : null}

          {data && data.series.length > 0 ? (
            <>
              <Regua />
              <Versalete>{t.app.home.weekTitle}</Versalete>
              <Bars
                series={data.series}
                hue={palette.apricot}
                labels={data.series.map((d) => formatWeekdayAbbrev(d.date, locale))}
              />
            </>
          ) : null}
        </View>
      </Reveal>
    ),
    /**
     * O insumo que está acabando, desenhado como o pote que ele é.
     *
     * Era um cartão de meia largura com o número de dias em corpo 28 e o nome
     * abreviado embaixo. O desenho aprovado mostra outra coisa e a diferença não
     * é de estilo: um recipiente com nível é lido sem legenda, e este aplicativo
     * é lido de luva, na câmara fria, por quem não vai parar para interpretar
     * número. O nome do insumo passa a ser o assunto, em serifa, como manda a
     * página.
     *
     * A régua é a mesma que a capa usa para tudo que fala de tempo — trinta
     * dias —, e ela é dita aqui em vez de morar dentro do desenho: peça que
     * inventa régua é peça que mente com o gráfico bonito.
     */
    insumos: (
      <Reveal index={1}>
        <View style={{ gap: space.lg }}>
          {data && data.shortly.length > 0 ? (
            <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.runningOut}>
              <Nivel
                parcela={Math.min(1, data.shortly[0].daysLeft / 30)}
                nome={data.shortly[0].name}
                topo={t.app.home.levelFull}
                urgente
                prazo={fill(t.app.home.levelEndsIn, {
                  days: plural(Math.floor(data.shortly[0].daysLeft), t.app.home.dayCount),
                })}
              />
            </Touchable>
          ) : data?.everMade && data.cover.length > 0 ? (
            // Está tudo bem é estado válido — e aqui ele é MOSTRADO, não
            // afirmado: o pote do insumo mais curto aparece cheio, com quanto
            // ele dura. Uma frase dizendo "insumos em dia" pede confiança; o
            // desenho do nível entrega a prova junto.
            <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.inputsFine}>
              <Nivel
                parcela={Math.min(1, data.cover[0].daysLeft / 30)}
                nome={data.cover[0].name}
                topo={t.app.home.levelFull}
                prazo={fill(t.app.home.levelLasts, {
                  days: plural(Math.floor(data.cover[0].daysLeft), t.app.home.dayCount),
                })}
              />
            </Touchable>
          ) : null}

          {data && data.boxes > 0 ? (
            <Touchable onPress={() => go('/transport')} accessibilityLabel={t.app.home.boxesTitle}>
              <View>
                <Versalete>{t.app.home.boxesTitle}</Versalete>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                  <CountUp
                    value={data.boxes}
                    format={(v) => formatQuantity(Math.round(v), locale)}
                    style={{ ...type.figure, color: color.ink }}
                  />
                  <Text style={[type.secondary, { color: color.inkMuted }]}>
                    {plural(data.boxes, t.app.home.boxCount)} {plural(data.boxes, t.app.home.boxesSent)}
                  </Text>
                </View>
                {/*
                  Dezoito caixas é dia bom numa fábrica e dia fraco noutra: sem
                  ontem do lado, o número grande não decide nada (Lei 3). E o
                  que saiu sem caber em caixa — um saco, um balde — sai por
                  nome, porque somá-lo em "caixas" seria arredondar a verdade
                  para o total ficar mais bonito.
                */}
                <Legenda>
                  {data.boxesYesterday === 0
                    ? t.app.home.noBoxesYesterday
                    : fill(t.app.home.yesterdayWas, {
                        amount: plural(data.boxesYesterday, t.app.home.boxCount),
                      })}
                  {data.loose.length > 0
                    ? ` · ${fill(t.app.home.alsoSent, {
                        items: data.loose
                          .map((l) => fill(t.app.home.alsoSentItem, { amount: l.said, name: l.name }))
                          .join(', '),
                      })}`
                    : ''}
                </Legenda>
              </View>
            </Touchable>
          ) : null}
        </View>
      </Reveal>
    ),
    pedidos: (
      <>
      {temPedido ? (
        <Reveal index={2}>
          <Touchable
            onPress={() => go('/orders')}
            accessibilityLabel={shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
          >
            <Card
              hue={shortForOrders.length > 0 ? color.warning : palette.sage}
              icon={(c) => <GlyphOrder size={26} color={c} weight={traco} />}
              title={shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
            >
              {shortForOrders.length > 0 ? (
                <View style={{ gap: space.xs }}>
                  {shortForOrders.slice(0, 3).map((d) => (
                    <View key={d.itemId} style={styles.row}>
                      <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {d.name}
                      </Text>
                      <Text style={[type.body, styles.number, { color: color.ink }]}>
                        {plural(d.missing, t.units.unit, formatQuantity(d.missing, locale))}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {fill(t.app.home.ordersCoveredDetail, {
                    date: data ? formatCalendarDate(data.demandThrough, locale) : '',
                  })}
                </Text>
              )}
            </Card>
          </Touchable>
        </Reveal>
      ) : null}
      </>
    ),
    clima: (
      <>
      {sky ? (
        <Reveal index={3}>
          {/* O toque abre a SEMANA aqui, e não leva para outra tela.
              Pedido do dono com todas as letras, e ele tem razão sobre o motivo:
              a pergunta "vou vender mais sexta?" se responde olhando sete dias de
              uma vez, e a capa é onde ela nasce. A tela cheia continua a um toque
              de dentro da peça aberta. */}
          <Touchable
            onPress={() => abrir('clima')}
            accessibilityLabel={fill(t.app.weather.nowAt, { city: weather?.place.name ?? '' })}
          >
            <CartaoClima
              cidade={fill(t.app.weather.nowAt, { city: weather?.place.name ?? '' })}
              maxC={sky.today.maxC}
              minima={fill(t.app.weather.lowShort, {
                degrees: plural(Math.round(sky.today.minC), t.app.weather.degrees),
              })}
              chuva={
                sky.today.rainChance !== null
                  ? {
                      texto: fill(t.app.weather.rain, { percent: Math.round(sky.today.rainChance) }),
                      parcela: sky.today.rainChance / 100,
                    }
                  : null
              }
              amanha={
                sky.warmerBy === null
                  ? null
                  : sky.warmerBy === 0
                    ? t.app.weather.same
                    : fill(t.app.weather.tomorrowDelta, {
                        // O sinal por extenso, e o menos é o de verdade (U+2212):
                        // ao lado de "+4°" um hífen fica curto e alto, e a dupla
                        // deixa de ler como par.
                        delta: `${sky.warmerBy > 0 ? '+' : '\u2212'}${plural(Math.abs(sky.warmerBy), t.app.weather.degrees)}`,
                      })
              }
              rodape={
                weather
                  ? `${fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })} · ${aberta === 'clima' ? t.app.home.less : t.app.home.more}`
                  : ''
              }
            >
              {/* A semana, que é o que o toque abre. Uma linha por dia, com a
                  faixa de temperatura desenhada: sete números soltos não se
                  comparam de olho, sete barras se comparam. */}
              {aberta === 'clima' && weather ? (
                <Reveal index={0} style={{ marginTop: space.md }}>
                  <View style={{ gap: space.sm }}>
                    {weather.days.slice(0, 7).map((dia) => (
                      <View key={dia.date} style={[styles.row, { gap: space.sm }]}>
                        <Text style={[type.caption, { color: color.inkFaint, width: 34 }]}>
                          {formatWeekdayAbbrev(dia.date, locale)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <TemperatureRange minC={dia.minC} maxC={dia.maxC} />
                        </View>
                        <Text style={[type.caption, styles.number, { color: color.ink }]}>
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
                </Reveal>
              ) : null}
            </CartaoClima>
          </Touchable>
        </Reveal>
      ) : null}
      </>
    ),
    expedicao: null,
    precos: (
      <>
      {moved.length > 0 ? (
        <Reveal index={6}>
          <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.changed}>
            <Card hue={palette.sky} icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />} title={t.app.home.changed}>
              <View style={{ gap: space.sm }}>
                {moved.map((change) => {
                  const previous = change.previousRate ?? change.newRate;
                  const delta = previous > 0 ? (change.newRate - previous) / previous : 0;
                  return (
                    <View key={`${change.itemId}-${change.observedAt}`} style={styles.row}>
                      <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {change.name}
                      </Text>
                      <Text style={[type.secondary, styles.number, { color: delta > 0 ? color.warning : color.ok }]}>
                        {delta > 0 ? '▲' : '▼'} {formatPercent(Math.abs(delta), locale)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}
      </>
    ),

    // Produção ao vivo só existe quando há o que estar vivo.
    //
    // Ela nascia sempre, dizendo "0 · Nada saiu ainda hoje" — e ao lado de "Hoje
    // na fábrica: 0" e "Últimas corridas: nenhuma", virava a terceira maneira de
    // dizer o mesmo nada. Eu guardei a EXPANSÃO e esqueci a EXISTÊNCIA: "ligar
    // não é forçar" vale para o cartão, não só para o convite dentro dele.
    // Ao vivo é o que está ACONTECENDO, e só existe quando há.
    //
    // Ela mostrava o total do dia, que é o mesmo número da manchete: com 500
    // unidades produzidas, a capa dizia "500" duas vezes em dois cartões
    // seguidos. Duas peças para um número é a capa competindo consigo mesma — o
    // mesmo defeito do widget do tacho, que eu já tinha removido por isso.
    aoVivo:
      (data?.running ?? []).length === 0 ? null : (
      <Peca
        index={1}
        hue={palette.apricot}
        icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
        title={t.app.home.liveTitle}
        aberta={aberta === 'aoVivo'}
        onToggle={() => abrir('aoVivo')}
        mais={
          // Peça sem nada a dizer não convida: numa fábrica que não produziu
          // hoje nem tem tacho aberto, abrir mostraria uma linha vazia e um
          // link. Convite que não entrega nada é a mesma doença do alerta
          // inventado — ensina a ignorar o convite.
          (data?.running ?? []).length === 0 && (data?.madeToday ?? 0) === 0 ? undefined : (
          <>
            {(data?.running ?? []).map((r) => (
              <View key={r.id} style={[styles.row, { gap: space.sm }]}>
                <PulseDot live color={palette.apricot} />
                <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {r.productName}
                </Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {fill(t.app.home.liveOpened, { time: formatTime(r.openedAt, locale) })}
                </Text>
              </View>
            ))}
            <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
          </>
          )
        }
      >
        {/* O número é quantas corridas estão abertas, não quanto saiu hoje — esse
            já é a manchete logo acima. */}
        <CountUp
          value={(data?.running ?? []).length}
          format={(v) => formatQuantity(Math.round(v), locale)}
          style={{ ...type.figure, color: color.ink }}
        />
        <View style={[styles.row, { gap: space.sm }]}>
          {/* O pulso vive AQUI e não num cartão próprio.
              Ele era o widget "tacho", que dizia o mesmo assunto desta peça com
              uma palavra de fábrica de sorvete — duas peças para um assunto é a
              capa competindo consigo mesma. Pulsar só quando há produção em
              curso continua valendo: pulso ao lado de número parado é mentira
              visual. */}
          {(data?.running ?? []).length > 0 ? <PulseDot live color={palette.apricot} /> : null}
          <Text style={[type.caption, { color: color.inkMuted, flex: 1 }]} numberOfLines={2}>
            {fill(t.app.home.liveRuns, {
              count: plural((data?.running ?? []).length, t.app.home.runCount),
            })}
          </Text>
        </View>
      </Peca>
    ),

    // Histórico só existe quando há história.
    historico:
      (data?.runs ?? []).length === 0 ? null : (
      <Peca
        index={2}
        hue={palette.sand}
        icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
        title={t.app.home.historyTitle}
        aberta={aberta === 'historico'}
        onToggle={() => abrir('historico')}
        mais={
          (data?.runs ?? []).length > 0 ? (
            <>
              {(data?.runs ?? []).map((r) => (
                <View key={`${r.occurredAt}-${r.code ?? ''}`} style={[styles.row, { gap: space.sm }]}>
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {formatTime(r.occurredAt, locale)}
                  </Text>
                  <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={[type.secondary, styles.number, { color: color.ink }]}>
                    {formatQuantity(r.baseUnits, locale)}
                  </Text>
                </View>
              ))}
            </>
          ) : undefined
        }
      >
        {(data?.runs ?? []).length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.home.historyEmpty}</Text>
        ) : (
          <>
            <Text style={[type.cardTitle, { color: color.ink }]}>
              {fill(t.app.home.historyRun, {
                amount: `${formatQuantity(data!.runs[0].baseUnits, locale)} ${plural(data!.runs[0].baseUnits, t.units.unit)}`,
                code: data!.runs[0].code ?? '—',
              })}
            </Text>
            {/* A linha das corridas, do mais antigo para o mais novo.
                Ela entra sendo traçada: o gesto é o que faz uma sequência de
                números parecer o ritmo de uma semana em vez de uma tabela. */}
            {data!.runs.length > 1 ? (
              <Sparkline
                values={[...data!.runs].reverse().map((r) => r.baseUnits)}
                hue={palette.sand}
              />
            ) : null}
            {/* Lei 3: a última corrida sozinha não diz nada. A média das
                registradas é o normal contra o qual ela se lê. */}
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {fill(t.app.home.historyAverage, {
                amount: `${formatQuantity(
                  Math.round(
                    data!.runs.reduce((n, r) => n + r.baseUnits, 0) / data!.runs.length,
                  ),
                  locale,
                )} ${t.units.unit.other}`,
              })}
            </Text>
          </>
        )}
      </Peca>
    ),

    // Cobertura só existe quando o livro-razão viu saída.
    //
    // "sem saída registrada — ninguém sabe quanto dura" é uma frase honesta e
    // uma peça inútil: ela ocupa a capa para dizer que não tem resposta.
    cobertura:
      (data?.cover ?? []).length === 0 ? null : (
      <Peca
        index={3}
        hue={palette.mint}
        icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
        title={t.app.home.coverTitle}
        aberta={aberta === 'cobertura'}
        onToggle={() => abrir('cobertura')}
        mais={
          (data?.cover ?? []).length > 0 ? (
            <>
              {(data?.cover ?? []).slice(0, 6).map((item) => (
                <View key={item.itemId} style={[styles.row, { gap: space.sm }]}>
                  <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                    {plural(Math.floor(item.daysLeft), t.app.home.dayCount)}
                  </Text>
                </View>
              ))}
            </>
          ) : undefined
        }
      >
        {(data?.cover ?? []).length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.home.coverUnknown}</Text>
        ) : (
          <>
            <Text style={[type.figure, { color: color.ink }]}>
              {formatQuantity(Math.floor(data!.cover[0].daysLeft), locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {fill(t.app.home.coverDays, {
                days: plural(Math.floor(data!.cover[0].daysLeft), t.app.home.dayCount),
              })}
              {' · '}
              {fill(t.app.home.coverTightest, { item: data!.cover[0].name })}
            </Text>
            {/* O horizonte é um mês, que é a janela em que uma fábrica compra.
                A barra vira alerta sozinha embaixo de uma semana - a cor conta o
                que o número já disse, para quem passa o olho sem ler. */}
            <View style={{ marginTop: space.sm }}>
              <Drain share={Math.min(1, data!.cover[0].daysLeft / 30)} hue={palette.mint} />
            </View>
          </>
        )}
      </Peca>
    ),

    entregaHoje: (
      <>
        {(data?.dueToday ?? []).length > 0 ? (
          <Peca
            index={4}
            hue={palette.lilac}
            icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
            title={t.app.home.dueTitle}
            aberta={aberta === 'entregaHoje'}
            onToggle={() => abrir('entregaHoje')}
            mais={
              <>
                {(data?.dueToday ?? []).map((p) => (
                  <Text
                    key={p.id}
                    style={[type.secondary, { color: p.sent ? color.inkMuted : color.ink }]}
                    numberOfLines={1}
                  >
                    {fill(p.sent ? t.app.home.dueDone : t.app.home.duePending, {
                      name: p.name || t.app.places.factory,
                    })}
                  </Text>
                ))}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatQuantity((data?.dueToday ?? []).filter((p) => !p.sent).length, locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {fill(t.app.home.duePending, {
                name:
                  (data?.dueToday ?? []).find((p) => !p.sent)?.name ||
                  (data?.dueToday ?? [])[0].name ||
                  t.app.places.factory,
              })}
            </Text>
          </Peca>
        ) : null}
      </>
    ),

    validade: (
      <>
        {(data?.expiring ?? []).length > 0 ? (
          <Peca
            index={5}
            tone="warning"
            icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
            title={t.app.home.expiryTitle}
            aberta={aberta === 'validade'}
            onToggle={() => abrir('validade')}
            mais={
              <>
                {(data?.expiring ?? []).map((l) => (
                  <View key={l.lotId} style={[styles.row, { gap: space.sm }]}>
                    <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Text style={[type.caption, { color: color.inkMuted }]}>
                      {fill(t.app.home.expiryLot, {
                        code: l.code,
                        date: formatCalendarDate(l.expiresOn, locale),
                      })}
                    </Text>
                  </View>
                ))}
              </>
            }
          >
            <Text style={[type.cardTitle, { color: color.ink }]} numberOfLines={1}>
              {data!.expiring[0].name}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {fill(t.app.home.expiryLot, {
                code: data!.expiring[0].code,
                date: formatCalendarDate(data!.expiring[0].expiresOn, locale),
              })}
            </Text>
            {/* Quanto falta dos trinta dias que a peça olha. Sem o desenho, "12
                de setembro" pede que a pessoa faça a conta de cabeça. */}
            <View style={{ marginTop: space.sm }}>
              <Drain
                share={
                  Math.max(
                    0,
                    daysBetween(
                      nowIso(),
                      `${data!.expiring[0].expiresOn}T00:00:00.000Z`,
                      locale.timeZone,
                    ),
                  ) / 30
                }
              />
            </View>
          </Peca>
        ) : null}
      </>
    ),

    perdas: (
      <>
        {(data?.lossesNow ?? 0) > 0 || (data?.lossesBefore ?? 0) > 0 ? (
          <Peca
            index={6}
            hue={palette.apricot}
            icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
            title={t.app.home.lossTitle}
            aberta={aberta === 'perdas'}
            onToggle={() => abrir('perdas')}
            mais={
              <>
                {data?.lossesWorst ? (
                  <Text style={[type.secondary, { color: color.ink }]}>
                    {fill(t.app.home.lossWorst, {
                      reason: t.loss[
                        data.lossesWorst.reason as keyof typeof t.loss
                      ].toLocaleLowerCase(locale.formatting),
                    })}
                  </Text>
                ) : null}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatMoney((data?.lossesNow ?? 0) as Cents, locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {(data?.lossesBefore ?? 0) > 0
                ? fill(t.app.home.lossVsBefore, {
                    amount: formatMoney((data?.lossesBefore ?? 0) as Cents, locale),
                  })
                : t.app.home.lossFirst}
            </Text>
            {/* O mês contra o anterior, na mesma régua: a barra de baixo é o
                mês passado, e a de cima só passa dela se a fábrica piorou.
                Duas barras dizem em um relance o que dois números pedem para
                comparar de cabeça. */}
            {(data?.lossesBefore ?? 0) > 0 ? (
              <View style={{ marginTop: space.sm, gap: space.xs }}>
                <Drain
                  share={
                    (data?.lossesNow ?? 0) /
                    Math.max(data?.lossesNow ?? 0, data?.lossesBefore ?? 1)
                  }
                  hue={color.warning}
                />
                <Drain
                  share={
                    (data?.lossesBefore ?? 0) /
                    Math.max(data?.lossesNow ?? 0, data?.lossesBefore ?? 1)
                  }
                  hue={color.inkFaint}
                />
              </View>
            ) : null}
          </Peca>
        ) : null}
      </>
    ),

    custo: (
      <>
        {(data?.runs ?? []).some((r) => r.unitCostRate !== null) ? (
          <Peca
            index={7}
            hue={palette.sky}
            icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
            title={t.app.home.costTitle}
            aberta={aberta === 'custo'}
            onToggle={() => abrir('custo')}
            mais={
              <>
                {(data?.runs ?? [])
                  .filter((r) => r.unitCostRate !== null)
                  .slice(0, 5)
                  .map((r) => (
                    <View key={`${r.occurredAt}-c`} style={[styles.row, { gap: space.sm }]}>
                      <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {r.code ?? r.name}
                      </Text>
                      <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                        {formatMoney(Math.round(r.unitCostRate!) as Cents, locale)}
                      </Text>
                    </View>
                  ))}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatMoney(Math.round(comCusto[0]!.unitCostRate!) as Cents, locale)}
            </Text>
            {/* O custo congelado corrida a corrida. É a única peça em que a
                linha SUBINDO é notícia ruim, e por isso ela não muda de cor: a
                cor diria o que só o dono sabe - polpa mais cara por safra é
                normal, por desperdício não é. */}
            {comCusto.length > 1 ? (
              <Sparkline
                values={[...comCusto].reverse().map((r) => r.unitCostRate ?? 0)}
                hue={palette.sky}
              />
            ) : null}
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {comCusto.length > 1
                ? fill(t.app.home.costBefore, {
                    amount: formatMoney(Math.round(comCusto[1]!.unitCostRate!) as Cents, locale),
                  })
                : t.app.home.costOnlyOne}
            </Text>
          </Peca>
        ) : null}
      </>
    ),

    parado: (
      <>
        {(data?.heldCents ?? 0) > 0 ? (
          <Peca
            index={8}
            hue={palette.mint}
            icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
            title={t.app.home.heldTitle}
            aberta={aberta === 'parado'}
            onToggle={() => abrir('parado')}
            mais={
              <>
                {(data?.cover ?? []).slice(0, 5).map((item) => (
                  <View key={`${item.itemId}-p`} style={[styles.row, { gap: space.sm }]}>
                    <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                      {plural(Math.floor(item.daysLeft), t.app.home.dayCount)}
                    </Text>
                  </View>
                ))}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatMoney((data?.heldCents ?? 0) as Cents, locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {t.app.home.heldDetail}
              {(data?.cover ?? []).length > 0
                ? ` · ${fill(t.app.home.coverDays, {
                    days: plural(Math.floor(data!.cover[0].daysLeft), t.app.home.dayCount),
                  })}`
                : ''}
            </Text>
          </Peca>
        ) : null}
      </>
    ),
  };

  /**
   * O primeiro dia tem UMA peça, e ela é um convite — não quatro vazios.
   *
   * O dono abriu o aplicativo instalado e viu isto: "0 unidades", "0 · nada saiu
   * ainda", "nenhuma corrida registrada", "sem saída registrada". Quatro cartões
   * dizendo que não há nada, e nenhuma próxima ação em lugar nenhum — quando a
   * Lei da Inteligência exige justamente a próxima ação provável, e quando este
   * arquivo já dizia, em comentário, que peça sem o que dizer não aparece.
   *
   * Estado vazio bonito é estado válido; quatro estados vazios empilhados são
   * uma tela que ensina que a capa não serve para nada.
   */
  /**
   * "Ainda não trabalhou" — que não é a mesma coisa que "não existe nada".
   *
   * A primeira versão deste cartão substituía a capa INTEIRA, e o CI derrubou
   * por três caminhos no mesmo dia: nota de compra lançada, produção marcada em
   * curso, preço que mudou. Nos três a fábrica tinha notícia e a capa respondia
   * "primeiro dia". Esconder o que existe é pior que mostrar vazio — vazio é
   * uma tela que não serve, esconder é uma tela que MENTE.
   *
   * E a correção óbvia estava errada também: exigir que NADA exista nunca
   * fecharia o portão, porque a semeadura já compra insumo — a capa voltaria
   * aos quatro cartões vazios que o dono recusou.
   *
   * A pergunta certa é a do trabalho: saiu alguma coisa do tacho, foi para
   * alguma loja, alguém pediu, tem tacho aberto, venceu ou perdeu? Comprar
   * insumo não é trabalho da fábrica, é o estoque de partida. Então o cartão
   * entra no lugar das peças de trabalho vazias, e o preço, o dinheiro parado e
   * o tempo continuam dizendo o que sabem.
   */
  if (estado === 'firstDay') {
    // No lugar da peça do dia, não no lugar da capa: o que as outras peças
    // souberem dizer continua dito, na ordem que a empresa escolheu.
    pecas.producao = (
      <Reveal index={0}>
        <View>
          {/* O primeiro dia na mesma tipografia dos outros — e isso importa mais
              do que parece. O que o dono fotografou como "o que você está me
              entregando" era EXATAMENTE este estado: um cartão arredondado com
              um degradê dentro. Estado vazio não é uma tela à parte; é a mesma
              página com menos números. */}
          <Manchete leve={t.app.home.capaLead} forte={t.app.home.capaQuiet} />
          <View style={{ marginTop: space.md }}>
            {skin === 'papel' ? (
              <FactoryScene running={false} shipped={false} dayShare={null} />
            ) : (
              <Landscape
                maxC={sky ? sky.today.maxC : null}
                rainChance={sky ? sky.today.rainChance : null}
                running={false}
                height={150}
              />
            )}
          </View>
          <Legenda>{t.app.home.capaLegend}</Legenda>
          <Regua />
          <Text style={[type.body, { color: color.inkMuted }]}>{t.app.home.firstDayBody}</Text>
          <Touchable
            onPress={() => go('/production/new')}
            accessibilityLabel={t.app.home.firstDayAction}
          >
            <Text style={[type.body, { color: accent, marginTop: space.md, fontWeight: '600' }]}>
              {t.app.home.firstDayAction} →
            </Text>
          </Touchable>
        </View>
      </Reveal>
    );
    // As peças de trabalho vazias somem em vez de empilhar quatro zeros: cada
    // uma já devolve nulo sem dado, e o convite acima responde por todas.
  }

  // O espaço entre as peças é do casco, não de cada peça: a folha antiga dava
  // `gap` no ScrollView, e a capa agora é uma página com margem própria.
  return (
    <View style={{ gap: space.xl }}>
      {layout.map((id) => (
        <Fragment key={id}>{pecas[id]}</Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});

/**
 * A diferença dita com o sinal na frente: "+22", "−19", ou nada quando é zero.
 *
 * O menos é o SINAL de menos (U+2212), não o hífen: num número em figura
 * tabular o hífen fica curto e alto, e a coluna passa a parecer desalinhada.
 * Zero não vira "+0" — dia igual é dia igual, e um sinal ali sugere movimento
 * que não houve.
 */
function sinal(diferenca: number, locale: LocaleSettings): string | null {
  if (diferenca === 0) return null;
  const corpo = formatQuantity(Math.abs(diferenca), locale);
  return diferenca > 0 ? `+${corpo}` : `\u2212${corpo}`;
}

/**
 * A conta do dia por extenso, que é o `[por quê?]` da manchete servido de graça.
 *
 * "500 − 478 = +22 · quinta, há uma semana ficou 19 abaixo." Quem duvidar do
 * número grande tem a subtração na linha de baixo, com os dois operandos — e não
 * precisa tocar em nada para isso.
 */
function contaDoDia(
  data: Summary,
  locale: LocaleSettings,
  t: Dictionary,
): string {
  const q = (n: number) => formatQuantity(n, locale);
  const contra = fill(t.app.home.mathAgainst, {
    today: q(data.madeToday),
    base: q(data.madeYesterday),
    delta: sinal(data.madeToday - data.madeYesterday, locale) ?? q(0),
  });
  const quando = fill(t.app.home.boxLastWeek, {
    weekday: formatWeekdayAbbrev(localDate(nowIso(), locale.timeZone, -7), locale),
  });
  const vao = data.madeToday - data.madeThen;
  const semana =
    data.madeThen === 0
      ? t.app.home.mathNoBase
      : vao === 0
        ? fill(t.app.home.mathSame, { when: quando })
        : fill(vao > 0 ? t.app.home.mathAbove : t.app.home.mathBelow, {
            when: quando,
            gap: q(Math.abs(vao)),
          });
  return `${contra} · ${semana}`;
}
