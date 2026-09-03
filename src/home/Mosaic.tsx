import { Fragment, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bars } from '@/components/Bars';
import { Drain } from '@/components/Drain';
import { Sparkline } from '@/components/Sparkline';
import { Card } from '@/components/Card';
import { FactoryScene } from '@/components/FactoryScene';
import { Landscape } from '@/components/Landscape';
import { CountUp } from '@/components/CountUp';
import { GlyphBox, GlyphKettle, GlyphOrder, GlyphPrice, GlyphProduction, GlyphStock } from '@/components/Glyph';
import { PulseDot } from '@/components/PulseDot';
import { Reveal } from '@/components/Reveal';
import { SkyScene, TemperatureRange } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import {
  fill,
  formatCalendarDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatTime,
  formatWeekdayInitial,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { nowIso } from '@/data/db';
import type { BriefingWidget } from '@/domain/briefing';
import { daysBetween } from '@/domain/day';
import type { Cents } from '@/domain/money';
import { Peca } from './Peca';
import type { BriefingView } from './types';

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
  comparison,
  layout,
  go,
}: BriefingView) {
  const { color, type, space, palette, skin } = useTheme();
  const { locale, t } = useLocale();

  // A espessura do traço é da identidade: fino no Papel, cheio no Orgânico.
  const traco = skin === 'papel' ? 1.7 : 2.2;

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
    producao: (
      <>
      <Reveal index={0}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
          title={t.app.home.today}
        >
          {/* Cada identidade tem a sua cena viva, e as duas obedecem a mesma
              regra: nada se move por decoração. O Papel desenha a linha de
              produção em traço; o Orgânico desenha a paisagem, que é a previsão
              de verdade. */}
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
          <CountUp
            value={data?.madeToday ?? 0}
            format={(v) => formatQuantity(Math.round(v), locale)}
            style={{ ...type.figure, color: color.ink }}
          />
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {plural(data?.madeToday ?? 0, t.units.unit)}{' '}
            {plural(data?.madeToday ?? 0, t.app.home.producedToday)}
          </Text>
          {data && data.series.length > 0 ? (
            <Bars
              series={data.series}
              hue={palette.apricot}
              labels={data.series.map((d) => formatWeekdayInitial(d.date, locale))}
            />
          ) : null}
          {data ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.md }]}>
              {data.madeYesterday === 0
                ? t.app.home.noYesterday
                : fill(t.app.home.yesterdayWas, {
                    amount: `${formatQuantity(data.madeYesterday, locale)} ${plural(data.madeYesterday, t.units.unit)}`,
                  })}
              {' · '}
              {comparison(data.madeToday, data.madeThen)}
            </Text>
          ) : null}
        </Card>
      </Reveal>
      </>
    ),
    insumos: (
      <>
      {/* A fileira de peças: o que não é manchete divide a linha. */}
      <Reveal index={1}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {data && data.shortly.length > 0 ? (
            <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.runningOut} style={{ flex: 1 }}>
              <Card tone="warning" icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}>
                <Text style={[type.figure, { color: color.ink }]}>
                  {formatQuantity(Math.floor(data.shortly[0].daysLeft), locale)}
                </Text>
                <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
                  {plural(Math.floor(data.shortly[0].daysLeft), t.app.home.dayCount)} ·{' '}
                  {data.shortly[0].name}
                </Text>
              </Card>
            </Touchable>
          ) : data?.everMade ? (
            <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.inputsFine} style={{ flex: 1 }}>
              <Card hue={palette.mint} icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}>
                <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.home.inputsFine}</Text>
                <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]} numberOfLines={2}>
                  {t.app.home.inputsFineDetail}
                </Text>
              </Card>
            </Touchable>
          ) : null}

          {data && data.boxes > 0 ? (
            <Touchable onPress={() => go('/transport')} accessibilityLabel={t.app.home.boxesTitle} style={{ flex: 1 }}>
              <Card hue={palette.lilac} icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}>
                <CountUp
                  value={data.boxes}
                  format={(v) => formatQuantity(Math.round(v), locale)}
                  style={{ ...type.figure, color: color.ink }}
                />
                <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
                  {plural(data.boxes, t.app.home.boxCount)} {plural(data.boxes, t.app.home.boxesSent)}
                </Text>
              </Card>
            </Touchable>
          ) : null}
        </View>
      </Reveal>
      </>
    ),
    pedidos: (
      <>
      {data && data.demand.length > 0 ? (
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
                  {fill(t.app.home.ordersCoveredDetail, { date: formatCalendarDate(data.demandThrough, locale) })}
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
            accessibilityLabel={fill(t.app.weather.overline, { city: weather?.place.name ?? '' })}
          >
            <Card hue={palette.sky} style={{ padding: 0, overflow: 'hidden' }}>
              <SkyScene maxC={sky.today.maxC} rainChance={sky.today.rainChance} height={140} />
              <View style={{ padding: space.lg }}>
                <Text style={[type.overline, { color: color.inkFaint }]}>
                  {fill(t.app.weather.overline, { city: weather?.place.name ?? '' }).toUpperCase()}
                </Text>
                <View style={[styles.row, { gap: space.md, marginTop: space.xs }]}>
                  <Text style={[type.figure, { color: color.ink }]}>{`${Math.round(sky.today.maxC)}°`}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.weather.today}</Text>
                    <Text style={[type.caption, { color: color.inkFaint }]}>
                      {fill(t.app.weather.low, { degrees: plural(Math.round(sky.today.minC), t.app.weather.degrees) })}
                    </Text>
                  </View>
                </View>
                <TemperatureRange minC={sky.today.minC} maxC={sky.today.maxC} />
                {sky.warmerBy !== null ? (
                  <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
                    {sky.warmerBy === 0
                      ? t.app.weather.same
                      : fill(sky.warmerBy > 0 ? t.app.weather.warmer : t.app.weather.cooler, {
                          degrees: plural(Math.abs(sky.warmerBy), t.app.weather.degrees),
                        })}
                  </Text>
                ) : null}
                {/* A semana, que é o que o toque abre. Uma linha por dia, com a
                    faixa de temperatura desenhada: sete números soltos não se
                    comparam de olho, sete barras se comparam. */}
                {aberta === 'clima' && weather ? (
                  <Reveal index={0} style={{ marginTop: space.md }}>
                    <View style={{ gap: space.sm }}>
                      {weather.days.slice(0, 7).map((dia) => (
                        <View key={dia.date} style={[styles.row, { gap: space.sm }]}>
                          <Text style={[type.caption, { color: color.inkFaint, width: 28 }]}>
                            {formatWeekdayInitial(dia.date, locale)}
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
                <Text style={[type.caption, { color: palette.sky, marginTop: space.sm }]}>
                  {weather
                    ? `${fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })} · ${aberta === 'clima' ? t.app.home.less : t.app.home.more}`
                    : ''}
                </Text>
              </View>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}
      </>
    ),
    tacho: (
      <>
      {data?.running.map((run, i) => (
        <Reveal key={run.id} index={4 + i}>
          <Touchable onPress={() => go('/production')} accessibilityLabel={`${t.app.home.running}: ${run.productName}`}>
            <Card hue={palette.apricot} icon={(c) => <GlyphKettle size={26} color={c} weight={traco} />}>
              <View style={[styles.row, { gap: space.sm }]}>
                <PulseDot live />
                <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {run.productName}
                </Text>
              </View>
              <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>{t.app.home.running}</Text>
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {fill(t.app.home.runningSince, { time: formatTime(run.openedAt, locale) })}
              </Text>
            </Card>
          </Touchable>
        </Reveal>
      ))}
      </>
    ),
    expedicao: null,
    precos: (
      <>
      {moved.length > 0 ? (
        <Reveal index={6}>
          <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.changed}>
            <Card hue={palette.sand} icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />} title={t.app.home.changed}>
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

    aoVivo: (
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
        <CountUp
          value={data?.madeToday ?? 0}
          format={(v) => formatQuantity(Math.round(v), locale)}
          style={{ ...type.figure, color: color.ink }}
        />
        <Text style={[type.caption, { color: color.inkMuted }]}>
          {(data?.running ?? []).length > 0
            ? fill(t.app.home.liveRuns, {
                count: plural((data?.running ?? []).length, t.app.production.batchCount),
              })
            : (data?.madeToday ?? 0) === 0
              ? t.app.home.liveNothing
              : comparison(data?.madeToday ?? 0, data?.madeThen ?? 0)}
        </Text>
      </Peca>
    ),

    historico: (
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
                strokeWidth={traco}
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

    cobertura: (
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
                strokeWidth={traco}
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

  return <>{layout.map((id) => <Fragment key={id}>{pecas[id]}</Fragment>)}</>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
