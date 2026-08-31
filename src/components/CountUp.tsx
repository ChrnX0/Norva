import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A number that counts up to its value instead of appearing finished.
 *
 * The rule this obeys is the one that keeps motion honest: animation never
 * delays information. The final value is reachable to a screen reader from the
 * first frame, and reduced-motion skips straight to it.
 *
 * Tabular figures are not optional here - without fixed-width digits the column
 * dances on every update and the eye loses its place.
 */
export function CountUp({
  value,
  format,
  style,
}: {
  value: number;
  format: (value: number) => string;
  style?: TextStyle;
}) {
  const { motion } = useTheme();
  const [shown, setShown] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        setShown(value);
        return;
      }

      const from = 0;
      const start = Date.now();

      const tick = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(1, elapsed / motion.countMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        setShown(Math.round(from + (value - from) * eased));
        if (progress < 1) frame.current = requestAnimationFrame(tick);
      };

      frame.current = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, motion.countMs]);

  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]} accessibilityLabel={format(value)}>
      {format(shown)}
    </Text>
  );
}
