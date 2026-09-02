import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The primary action.
 *
 * One per screen, labelled with a verb, sitting within thumb reach. Press
 * responds with a 0.97 spring and, for weighty actions, a short haptic - the
 * motion confirms what happened rather than decorating the wait.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  weighty = false,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  /**
   * Drawn to the left of the label, in the label's own colour.
   *
   * The design puts the area's mark inside its action - a popsicle on "Lançar
   * produção" - so the button says what it is about before it is read. It
   * receives the colour so the icon can never disagree with the text it sits
   * beside.
   */
  icon?: (color: string) => ReactNode;
  /** Weighty actions (committing stock, dispatching a load) also vibrate. */
  weighty?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { color, radius, type, space, accent, motion } = useTheme();
  const [pressed, setPressed] = useState(false);

  // The spring is driven by state rather than by writing to a shared value in
  // the handler. Same physics, and it keeps the press readable from React -
  // mutating a shared value inside a callback is invisible to everything else.
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed ? motion.pressScale : 1, motion.press) }],
  }));

  const isPrimary = variant === 'primary';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (weighty) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
      style={[
        styles.base,
        {
          backgroundColor: isPrimary ? accent : 'transparent',
          borderColor: isPrimary ? 'transparent' : color.lineStrong,
          borderRadius: radius.pill,
          paddingVertical: space.lg,
          paddingHorizontal: space.xl,
          opacity: disabled ? 0.45 : 1,
        },
        animated,
        style,
      ]}
    >
      {icon?.(isPrimary ? color.onAccent : color.inkMuted)}
      <Text
        style={[
          type.body,
          { fontWeight: '600', color: isPrimary ? color.onAccent : color.inkMuted },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
