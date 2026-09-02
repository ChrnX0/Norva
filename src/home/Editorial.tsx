import { StyleSheet, Text, View } from 'react-native';
import { Bars } from '@/components/Bars';
import { CountUp } from '@/components/CountUp';
import { GlyphBox, GlyphKettle, GlyphOrder, GlyphPrice, GlyphStock } from '@/components/Glyph';
import { PulseDot } from '@/components/PulseDot';
import { Reveal } from '@/components/Reveal';
import { SkyScene } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import { IconChevron } from '@/components/icons';
import { tint } from '@/components/Card';
import {
  fill,
  formatPercent,
  formatQuantity,
  formatTime,
  formatWeekdayInitial,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { palettes } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import type { BriefingView } from './types';

/**
 * Editorial: um herói ilustrado, e o resto em linhas.
 *
 * A aposta oposta à do Mosaico. Em vez de muitos cartões pequenos, UM cartão
 * grande com o céu desenhado atrás do número do dia - e todo o resto perde a
 * moldura: vira linha com ícone, valor e uma seta, separada por um fio. Uma
 * moldura por assunto é o que faz a tela parecer um formulário; sem elas, ela
 * lê como uma página.
 *
 * O risco desta direção é o inverso do da outra: sem moldura, o alerta perde
 * força. Por isso o insumo acabando é a única linha que continua com fundo.
 */
export function Editorial({ data, sky, weather, shortForOrders, moved, comparison, go }: BriefingView) {
  const { color, scheme, type, space, radius } = useTheme();
  const { locale, t } = useLocale();
  const palette = palettes[scheme];

  return (
    <>
      {/* O herói: o céu atrás, o dia na frente. */}
      <Reveal index={0}>
        <View style={{ borderRadius: radius.xl, overflow: 'hidden', backgroundColor: color.surface }}>
          {sky ? <SkyScene maxC={sky.today.maxC} rainChance={sky.today.rainChance} height={132} /> : null}
          <View style={{ padding: space.lg }}>
            <Text style={[type.overline, { color: color.inkFaint }]}>
              {t.app.home.today.toUpperCase()}
            </Text>
            <CountUp
              value={data?.madeToday ?? 0}
              format={(v) => formatQuantity(Math.round(v), locale)}
              style={{ ...type.hero, color: color.ink }}
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
            {sky ? (
              <Text style={[type.caption, { color: palette.sky, marginTop: space.sm }]}>
                {`${Math.round(sky.today.maxC)}° ${t.app.weather.today}`}
                {weather ? ` · ${fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })}` : ''}
              </Text>
            ) : null}
          </View>
        </View>
      </Reveal>

      {/* O alerta é o único que mantém moldura: sem ela, some. */}
      {data && data.shortly.length > 0 ? (
        <Reveal index={1}>
          <Touchable onPress={() => go('/inputs')} accessibilityLabel={t.app.home.runningOut}>
            <View
              style={{
                backgroundColor: tint(color.warning, scheme === 'dark' ? 0.16 : 0.1),
                borderRadius: radius.xl,
                padding: space.lg,
                gap: space.sm,
              }}
            >
              <View style={[styles.row, { gap: space.sm }]}>
                <GlyphStock size={24} color={color.warning} />
                <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]}>{t.app.home.runningOut}</Text>
              </View>
              {data.shortly.slice(0, 3).map((r) => (
                <View key={r.itemId} style={styles.row}>
                  <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={[type.body, styles.number, { color: color.ink }]}>
                    {plural(Math.floor(r.daysLeft), t.app.home.dayCount, formatQuantity(Math.floor(r.daysLeft), locale))}
                  </Text>
                </View>
              ))}
            </View>
          </Touchable>
        </Reveal>
      ) : null}

      {/* E o resto vira lista. */}
      <Reveal index={2}>
        <View style={{ backgroundColor: color.surface, borderRadius: radius.xl, paddingHorizontal: space.lg }}>
          {data && data.boxes > 0 ? (
            <Row
              glyph={(c) => <GlyphBox size={24} color={c} />}
              label={t.app.home.boxesTitle}
              value={`${plural(data.boxes, t.app.home.boxCount)} ${plural(data.boxes, t.app.home.boxesSent)}`}
              onPress={() => go('/transport')}
              accent={palette.lilac}
            />
          ) : null}

          {data && data.demand.length > 0 ? (
            <Row
              glyph={(c) => <GlyphOrder size={24} color={c} />}
              label={shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
              value={
                shortForOrders.length > 0
                  ? shortForOrders
                      .slice(0, 2)
                      .map((d) => `${d.name}: ${formatQuantity(d.missing, locale)}`)
                      .join(' · ')
                  : t.app.home.inputsFineDetail
              }
              onPress={() => go('/orders')}
              accent={shortForOrders.length > 0 ? color.warning : palette.sage}
            />
          ) : null}

          {data?.running.map((run) => (
            <Row
              key={run.id}
              glyph={(c) => <GlyphKettle size={24} color={c} />}
              label={run.productName}
              value={fill(t.app.home.runningSince, { time: formatTime(run.openedAt, locale) })}
              onPress={() => go('/production')}
              accent={palette.apricot}
            />
          ))}

          {moved.map((change) => {
            const previous = change.previousRate ?? change.newRate;
            const delta = previous > 0 ? (change.newRate - previous) / previous : 0;
            return (
              <Row
                key={`${change.itemId}-${change.observedAt}`}
                glyph={(c) => <GlyphPrice size={24} color={c} />}
                label={change.name}
                value={`${delta > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(delta), locale)}`}
                onPress={() => go('/inputs')}
                accent={palette.sand}
              />
            );
          })}
        </View>
      </Reveal>

      {data?.running.length ? (
        <View style={[styles.row, { gap: space.sm, paddingHorizontal: space.lg }]}>
          <PulseDot live />
          <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.running}</Text>
        </View>
      ) : null}

    </>
  );
}

/**
 * A linha: ícone, nome, valor e a seta. Sem moldura.
 *
 * Fora do componente pela mesma razão do `Block` vizinho: componente criado
 * durante o render é um tipo novo a cada vez, e a lista inteira remonta quando o
 * dado chega.
 */
function Row({
  glyph,
  label,
  value,
  onPress,
  accent,
}: {
  glyph: (c: string) => React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
  accent: string;
}) {
  const { color, scheme, type, space, radius } = useTheme();
  return (
    <Touchable onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
      <View style={[styles.row, { paddingVertical: space.lg, gap: space.md }]}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.lg,
            backgroundColor: tint(accent, scheme === 'dark' ? 0.2 : 0.13),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {glyph(accent)}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: color.ink }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={1}>
            {value}
          </Text>
        </View>
        <IconChevron size={20} color={color.inkFaint} />
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.line }} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
