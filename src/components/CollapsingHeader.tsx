import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mark } from './Mark';
import { useTheme } from '@/theme/ThemeProvider';

const EXPANDED = 34;
const COLLAPSED = 22;
const RANGE = 72;

/**
 * The large title that shrinks as you scroll - the most recognizable part of
 * the One UI signature, and the reason the top of every screen is breathing
 * room rather than a row of buttons.
 *
 * Actions live in the lower half of the screen, within thumb reach. Nothing
 * important ever sits up here.
 */
export function CollapsingHeader({
  title,
  overline,
  children,
}: {
  title: string;
  overline?: string;
  children: ReactNode;
}) {
  const { color, space, type, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const titleStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(scrollY.value, [0, RANGE], [EXPANDED, COLLAPSED], Extrapolation.CLAMP),
  }));

  const overlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, RANGE / 2], [1, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, RANGE / 2], [18, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <View
        style={{
          paddingTop: insets.top + space.sm,
          paddingHorizontal: space.lg,
          paddingBottom: space.md,
          backgroundColor: color.paper,
        }}
      >
        <View style={[styles.titleRow, { gap: space.sm + 1 }]}>
          <View
            style={[
              styles.icon,
              { backgroundColor: `${accent}22`, borderRadius: 9 },
            ]}
          >
            <Mark size={15} color={accent} />
          </View>
          <Animated.Text
            style={[
              { color: color.ink, fontWeight: '600', letterSpacing: -0.8 },
              titleStyle,
            ]}
            accessibilityRole="header"
          >
            {title}
          </Animated.Text>
        </View>

        {overline ? (
          <Animated.View style={overlineStyle}>
            <Text style={[type.overline, { color: color.inkFaint }]} numberOfLines={1}>
              {overline.toUpperCase()}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        // With the soft keyboard up, React Native's default (`never`) spends
        // the first tap dismissing it, so the confirm button only answers on
        // the second. On a factory floor that reads as "the app did not save"
        // - and the person taps again, or gives up. Invisible on the web and
        // to the e2e suite: a browser has no keyboard that rises.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + space.xxl,
          gap: space.md,
        }}
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
