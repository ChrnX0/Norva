import { type ReactNode } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

const Springy = Animated.createAnimatedComponent(Pressable);

/**
 * O cartão que responde ao dedo.
 *
 * Um toque sem resposta visual é a diferença entre um aplicativo e uma foto de
 * um aplicativo — e num celular de fábrica, com luva e tela suja, é também a
 * única confirmação de que o toque pegou. A escala de 0,97 e a mola `press`
 * estavam em `tokens.ts` sem um único chamador.
 *
 * Fica sobre `Pressable`, e não sobre o `Card`, porque nem todo cartão é
 * tocável: cartão que não leva a lugar nenhum não deve afundar como se
 * levasse.
 */
export function Touchable({
  onPress,
  accessibilityLabel,
  children,
  style,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { motion } = useTheme();
  const held = useSharedValue(0);

  const squeeze = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - held.value * (1 - motion.pressScale) }],
  }));

  return (
    <Springy
      onPress={onPress}
      onPressIn={() => {
        held.value = withSpring(1, motion.press);
      }}
      onPressOut={() => {
        held.value = withSpring(0, motion.press);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[style, squeeze]}
    >
      {children}
    </Springy>
  );
}
