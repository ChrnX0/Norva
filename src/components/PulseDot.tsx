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
 *   - how many pulse at once is decided by how many things are actually
 *     happening, never by a quota; what bounds it in practice is the battery of
 *     a phone that stays on all shift, not a number somebody picked
 *   - it only goes next to a number that is genuinely updating - a pulse beside
 *     a frozen value is a visual lie, and people notice
 *   - reduced-motion turns it off and the dot stays, fully legible
 */
/**
 * `live` has no default, and that is the point.
 *
 * The third rule above was written here and broken by the first caller: the home
 * screen pulsed every product card, including the ones whose cost had not moved
 * in weeks. Nothing caught it because the component had no way to say "not
 * live" - honouring the rule meant remembering not to render it at all, and
 * remembering is not a mechanism.
 *
 * Required, the fact has to be stated at every call site, and a screen that
 * cannot say whether its number is moving fails to compile instead of lying
 * quietly to whoever is holding the phone.
 */
export function PulseDot({
  live,
  color,
  size = 10,
}: {
  live: boolean;
  color?: string;
  size?: number;
}) {
  const { accent, motion } = useTheme();
  const tint = color ?? accent;
  const progress = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;

    // Going still has to undo the animation, not just stop starting it: leaving
    // the halo wherever the last frame put it reads as a dot with a permanent
    // ring around it, which is the same lie in a different shape.
    if (!live) {
      progress.value = 0;
      return;
    }

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
  }, [live, motion.pulseMs, progress]);

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
