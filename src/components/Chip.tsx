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
