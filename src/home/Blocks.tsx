import { Text, View } from 'react-native';
import { Bars } from '@/components/Bars';
import { Button } from '@/components/Button';
import { tint } from '@/components/Card';
import { CountUp } from '@/components/CountUp';
import { GlyphBox, GlyphKettle, GlyphOrder, GlyphPrice, GlyphProduction, GlyphStock } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { SkyScene } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import { IconProduction } from '@/components/icons';
import { fill, formatPercent, formatQuantity, formatTime, formatWeekdayInitial, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { palettes } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import type { BriefingView } from './types';

/**
 * Blocos: cor de verdade, cantos bem redondos, número gordo.
 *
 * A direção mais longe do "sistema" e mais perto de aplicativo de consumo. A cor
 * deixa de ser lavada e vira o próprio bloco; o glifo cresce e vai para o canto,
 * grande e apagado, funcionando como textura em vez de crachá; o número ocupa a
 * altura toda e o rótulo vira uma linha pequena em caixa alta embaixo dele.
 *
 * O que ela cobra: com o bloco colorido, texto secundário some. Então cada bloco
 * diz UMA coisa - um número e o nome dele - e o detalhe fica na tela de dentro.
 */
export function Blocks({ data, sky, weather, shortForOrders, moved, comparison, go }: BriefingView) {
  const { color, scheme, type, space, radius } = useTheme();
  const { locale, t } = useLocale();
  const palette = palettes[scheme];

  return (
    <>
      <Reveal index={0}>
        <View
          style={{
            backgroundColor: tint(palette.apricot, scheme === 'dark' ? 0.22 : 0.16),
            borderRadius: 30,
            padding: space.xl,
            overflow: 'hidden',
          }}
        >
          <View style={{ position: 'absolute', right: -10, top: -10, opacity: 0.5 }}>
            <GlyphProduction size={110} color={palette.apricot} />
          </View>
          <CountUp
            value={data?.madeToday ?? 0}
            format={(v) => formatQuantity(Math.round(v), locale)}
            style={{ ...type.display, color: color.ink }}
          />
          <Text style={[type.overline, { color: color.inkMuted }]}>
            {`${plural(data?.madeToday ?? 0, t.units.unit)} ${plural(data?.madeToday ?? 0, t.app.home.producedToday)}`.toUpperCase()}
          </Text>
          {data && data.series.length > 0 ? (
            <Bars
              series={data.series}
              hue={palette.apricot}
              labels={data.series.map((d) => formatWeekdayInitial(d.date, locale))}
              height={44}
            />
          ) : null}
          {data ? (
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
              {data.madeYesterday === 0
                ? t.app.home.noYesterday
                : fill(t.app.home.yesterdayWas, {
                    amount: `${formatQuantity(data.madeYesterday, locale)} ${plural(data.madeYesterday, t.units.unit)}`,
                  })}
              {' · '}
              {comparison(data.madeToday, data.madeThen)}
            </Text>
          ) : null}
        </View>
      </Reveal>

      <Reveal index={1}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {data && data.shortly.length > 0 ? (
            <Block
              hue={color.warning}
              wide={false}
              glyph={(c) => <GlyphStock size={72} color={c} />}
              figure={plural(
                Math.floor(data.shortly[0].daysLeft),
                t.app.home.dayCount,
                formatQuantity(Math.floor(data.shortly[0].daysLeft), locale),
              )}
              label={t.app.home.runningOut}
              detail={data.shortly[0].name}
              onPress={() => go('/inputs')}
            />
          ) : data?.everMade ? (
            <Block
              hue={palette.mint}
              wide={false}
              glyph={(c) => <GlyphStock size={72} color={c} />}
              figure="✓"
              label={t.app.home.inputsFine}
              onPress={() => go('/inputs')}
            />
          ) : null}

          {data && data.boxes > 0 ? (
            <Block
              hue={palette.lilac}
              wide={false}
              glyph={(c) => <GlyphBox size={72} color={c} />}
              figure={formatQuantity(data.boxes, locale)}
              label={plural(data.boxes, t.app.home.boxCount)}
              onPress={() => go('/transport')}
            />
          ) : null}
        </View>
      </Reveal>

      {sky ? (
        <Reveal index={2}>
          <Touchable onPress={() => go('/weather')} accessibilityLabel={fill(t.app.weather.overline, { city: weather?.place.name ?? '' })}>
            <View style={{ borderRadius: 30, overflow: 'hidden' }}>
              <SkyScene maxC={sky.today.maxC} rainChance={sky.today.rainChance} height={150} />
              <View
                style={{
                  position: 'absolute',
                  left: space.xl,
                  bottom: space.lg,
                }}
              >
                <Text style={[type.display, { color: palette.onAccent }]}>{`${Math.round(sky.today.maxC)}°`}</Text>
                <Text style={[type.overline, { color: palette.onAccent, opacity: 0.9 }]}>
                  {fill(t.app.weather.overline, { city: weather?.place.name ?? '' }).toUpperCase()}
                </Text>
              </View>
            </View>
          </Touchable>
        </Reveal>
      ) : null}

      {data && data.demand.length > 0 ? (
        <Reveal index={3}>
          <Block
            hue={shortForOrders.length > 0 ? color.warning : palette.sage}
            glyph={(c) => <GlyphOrder size={78} color={c} />}
            figure={
              shortForOrders.length > 0
                ? formatQuantity(shortForOrders.reduce((n, d) => n + d.missing, 0), locale)
                : '✓'
            }
            label={shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
            detail={shortForOrders.length > 0 ? shortForOrders.map((d) => d.name).join(' · ') : undefined}
            onPress={() => go('/orders')}
          />
        </Reveal>
      ) : null}

      {data?.running.map((run, i) => (
        <Reveal key={run.id} index={4 + i}>
          <Block
            hue={palette.apricot}
            glyph={(c) => <GlyphKettle size={78} color={c} />}
            figure={formatTime(run.openedAt, locale)}
            label={t.app.home.running}
            detail={run.productName}
            onPress={() => go('/production')}
          />
        </Reveal>
      ))}

      {moved.length > 0 ? (
        <Reveal index={6}>
          <Block
            hue={palette.sand}
            glyph={(c) => <GlyphPrice size={78} color={c} />}
            figure={(() => {
              const first = moved[0];
              const previous = first.previousRate ?? first.newRate;
              const delta = previous > 0 ? (first.newRate - previous) / previous : 0;
              return `${delta > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(delta), locale)}`;
            })()}
            label={t.app.home.changed}
            detail={moved.map((c) => c.name).join(' · ')}
            onPress={() => go('/inputs')}
          />
        </Reveal>
      ) : null}

      <Reveal index={7}>
        <Button
          label={t.app.home.record}
          onPress={() => go('/production')}
          icon={(c) => <IconProduction size={24} color={c} />}
          style={{ borderRadius: radius.pill }}
        />
      </Reveal>
    </>
  );
}

/**
 * O bloco: um número gordo, um rótulo, e o glifo grande como textura.
 *
 * Mora fora do componente de propósito. Definido lá dentro, ele seria um tipo de
 * componente NOVO a cada render - o React desmonta e remonta a subárvore inteira,
 * e a animação de entrada recomeça a cada vez que o dado chega. A regra do lint
 * aqui está protegendo exatamente a fofura que este layout tenta ter.
 */
function Block({
  hue,
  glyph,
  figure,
  label,
  detail,
  onPress,
  wide = true,
}: {
  hue: string;
  glyph: (c: string) => React.ReactNode;
  figure: string;
  label: string;
  detail?: string;
  onPress: () => void;
  wide?: boolean;
}) {
  const { color, scheme, type, space } = useTheme();
  return (
    <Touchable onPress={onPress} accessibilityLabel={`${label}: ${figure}`} style={wide ? undefined : { flex: 1 }}>
      <View
        style={{
          backgroundColor: tint(hue, scheme === 'dark' ? 0.22 : 0.16),
          borderRadius: 30,
          padding: space.xl,
          overflow: 'hidden',
          minHeight: 130,
          justifyContent: 'flex-end',
        }}
      >
        <View style={{ position: 'absolute', right: -6, top: -6, opacity: 0.55 }}>{glyph(hue)}</View>
        <Text style={[type.hero, { color: color.ink }]}>{figure}</Text>
        <Text style={[type.overline, { color: color.inkMuted, marginTop: space.xs }]}>
          {label.toUpperCase()}
        </Text>
        {detail ? (
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
}

