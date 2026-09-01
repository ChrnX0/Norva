import type { PriceVerdict } from '@/domain/cost';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export type Signal = 'ok' | 'warning' | 'danger' | 'neutral';

/**
 * A state chip.
 *
 * `label` is required and there is no icon-only variant on purpose. Color never
 * travels alone: some people are colorblind, and a phone screen under warehouse
 * lighting loses hue long before it loses text.
 *
 * Signal colors are saturated and appear only in small doses like this one.
 * They never become a surface, and they never decorate a chart - the moment
 * green shows up because it looked nice, green stops meaning "checked".
 */
export function Chip({ signal, label }: { signal: Signal; label: string }) {
  const { color, radius, type, space } = useTheme();
  const tint = color[signal];

  return (
    <View
      style={[
        styles.chip,
        {
          borderColor: tint,
          borderRadius: radius.pill,
          paddingVertical: space.xs + 1,
          paddingHorizontal: space.md,
          gap: space.sm - 1,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[type.caption, { color: tint, fontWeight: '500' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

/**
 * The colour a price change is drawn in.
 *
 * It lives beside the chip rather than in the domain because a signal name is a
 * fact about the interface, not about money. What it must not be is written
 * twice: the storeroom screen and the purchase screen were colouring the same
 * change differently - a 1% fall read as "cheaper" in one and "no real change"
 * in the other - which is two answers to one question, drawn in two colours.
 */
export function priceSignal(verdict: PriceVerdict | null): Signal {
  if (verdict === 'wellAbove') return 'warning';
  if (verdict === 'cheaper') return 'ok';
  return 'neutral';
}
