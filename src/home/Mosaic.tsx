import { StyleSheet, Text, View } from 'react-native';
import { Bars } from '@/components/Bars';
import { Card } from '@/components/Card';
import { FactoryScene } from '@/components/FactoryScene';
import { CountUp } from '@/components/CountUp';
import { GlyphBox, GlyphKettle, GlyphOrder, GlyphPrice, GlyphProduction, GlyphStock } from '@/components/Glyph';
import { PulseDot } from '@/components/PulseDot';
import { Reveal } from '@/components/Reveal';
import { SkyScene, TemperatureRange } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import {
  fill,
  formatCalendarDate,
  formatPercent,
  formatQuantity,
  formatTime,
  formatWeekdayInitial,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import type { BriefingView } from './types';

/**
 * Mosaico: uma manchete grande e peças pequenas embaixo.
 *
 * A ideia é que nem todo assunto merece a largura da tela. O que saiu do tacho
 * merece; uma caixa que foi para a loja não. Peças de meia largura lado a lado
 * fazem o olho entender a hierarquia sem ler uma palavra - e quebram a pilha de
 * retângulos iguais que o dono recusou.
 */
export function Mosaic({ data, sky, weather, shortForOrders, moved, comparison, go }: BriefingView) {
  const { color, type, space, palette } = useTheme();
  const { locale, t } = useLocale();

  return (
    <>
      {/* A cena viva abre a capa, e cada coisa que se mexe nela é um fato:
          fumaça só com tacho aberto, picolé enchendo na proporção do dia contra
          ontem, caixa entrando quando saiu carga. */}
      <Reveal index={0}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphProduction size={26} color={c} />}
          title={t.app.home.today}
        >
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

      {/* A fileira de peças: o que não é manchete divide a linha. */}
      <Reveal index={1}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {data && data.shortly.length > 0 ? (
            <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.runningOut} style={{ flex: 1 }}>
              <Card tone="warning" icon={(c) => <GlyphStock size={26} color={c} />}>
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
              <Card hue={palette.mint} icon={(c) => <GlyphStock size={26} color={c} />}>
                <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.home.inputsFine}</Text>
                <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]} numberOfLines={2}>
                  {t.app.home.inputsFineDetail}
                </Text>
              </Card>
            </Touchable>
          ) : null}

          {data && data.boxes > 0 ? (
            <Touchable onPress={() => go('/transport')} accessibilityLabel={t.app.home.boxesTitle} style={{ flex: 1 }}>
              <Card hue={palette.lilac} icon={(c) => <GlyphBox size={26} color={c} />}>
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

      {data && data.demand.length > 0 ? (
        <Reveal index={2}>
          <Touchable
            onPress={() => go('/orders')}
            accessibilityLabel={shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
          >
            <Card
              hue={shortForOrders.length > 0 ? color.warning : palette.sage}
              icon={(c) => <GlyphOrder size={26} color={c} />}
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

      {sky ? (
        <Reveal index={3}>
          <Touchable onPress={() => go('/weather')} accessibilityLabel={fill(t.app.weather.overline, { city: weather?.place.name ?? '' })}>
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
                <Text style={[type.caption, { color: palette.sky, marginTop: space.sm }]}>
                  {weather ? `${fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })} · ${t.app.weather.change}` : ''}
                </Text>
              </View>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {data?.running.map((run, i) => (
        <Reveal key={run.id} index={4 + i}>
          <Touchable onPress={() => go('/production')} accessibilityLabel={`${t.app.home.running}: ${run.productName}`}>
            <Card hue={palette.apricot} icon={(c) => <GlyphKettle size={26} color={c} />}>
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

      {moved.length > 0 ? (
        <Reveal index={6}>
          <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.changed}>
            <Card hue={palette.sand} icon={(c) => <GlyphPrice size={26} color={c} />} title={t.app.home.changed}>
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
