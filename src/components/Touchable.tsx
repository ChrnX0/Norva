import { type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
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
  onLongPress,
  longPressLabel,
  accessibilityLabel,
  children,
  style,
}: {
  onPress: () => void;
  /**
   * O toque LONGO, que é como a Lei 6 abre a conta de um número.
   *
   * Ele existe aqui e não como um segundo botão dentro do cartão por um motivo
   * de dedo: o cartão inteiro já é o alvo de "abrir a tela", e um alvo dentro de
   * outro alvo, com luva, erra. O gesto longo divide o mesmo alvo sem disputar
   * área com ele.
   */
  onLongPress?: () => void;
  /**
   * O que o gesto longo faz, dito em palavras — e isto NÃO é enfeite.
   *
   * Gesto que só existe no dedo é gesto que não existe para quem usa leitor de
   * tela: o TalkBack não segura o dedo, ele lista ações. Sem esta linha a conta
   * de um número ficaria alcançável só para quem enxerga, numa tela que este
   * projeto já prova que se anuncia inteira (`src/acessivel.test.ts`).
   */
  longPressLabel?: string;
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
      onLongPress={
        onLongPress
          ? () => {
              // O toque longo não tem resposta visual própria — o cartão já está
              // afundado desde o `onPressIn`. Sem o toque no pulso, a pessoa não
              // sabe se segurou o bastante e solta antes.
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLongPress();
            }
          : undefined
      }
      onPressIn={() => {
        held.value = withSpring(1, motion.press);
      }}
      onPressOut={() => {
        held.value = withSpring(0, motion.press);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={
        onLongPress && longPressLabel ? [{ name: 'longpress', label: longPressLabel }] : undefined
      }
      onAccessibilityAction={(evento) => {
        if (evento.nativeEvent.actionName === 'longpress') onLongPress?.();
      }}
      style={[style, squeeze]}
    >
      {children}
    </Springy>
  );
}
