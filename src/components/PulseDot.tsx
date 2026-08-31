import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The "this is live" pulse: a slow halo expanding out of a dot.
 *
 * Four rules govern it, and they matter more than the animation itself:
 *   - it never blinks; the cycle is 2.6s, because blinking is aggressive and
 *     users learn to tune it out
 *   - at most two pulsing elements per screen; if everything moves, nothing
 *     draws attention
 *   - it only goes next to a number that is genuinely updating - a pulse beside
 *     a frozen value is a visual lie, and people notice
 *   - reduced-motion turns it off and the dot stays, fully legible
 */
export function PulseDot({ color, size = 10 }: { color?: string; size?: number }) {
  const { accent, motion } = useTheme();
  const tint = color ?? accent;
  const progress = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      progress.value = withRepeat(
        withTiming(1, { duration: motion.pulseMs, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [motion.pulseMs, progress]);

  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 1.9 }],
    opacity: 0.55 * (1 - Math.min(1, progress.value / 0.7)),
  }));

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, backgroundColor: tint },
          halo,
        ]}
      />
      <View
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: tint }]}
      />
    </View>
  );
}
