import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { RAIL_WIDTH } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Tone = 'plain' | 'area' | 'danger' | 'warning';

/**
 * The card the whole app is built from.
 *
 * Color arrives as a 3px rail on the left edge and nowhere else. A fully
 * colored card tires the eyes of someone who stares at this screen for eight
 * hours; the rail is enough to say which area you are in while the surface
 * stays neutral.
 */
export function Card({
  children,
  tone = 'plain',
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  style?: ViewStyle;
}) {
  const { color, radius, space, accent } = useTheme();

  const railColor =
    tone === 'area'
      ? accent
      : tone === 'danger'
        ? color.danger
        : tone === 'warning'
          ? color.warning
          : null;

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: color.surface,
          borderColor: color.line,
          borderRadius: radius.lg,
          padding: space.lg,
          borderLeftWidth: railColor ? RAIL_WIDTH : StyleSheet.hairlineWidth,
          borderLeftColor: railColor ?? color.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
