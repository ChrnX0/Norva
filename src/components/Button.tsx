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
  const { color, radius, type, space, accent, brand, motion, skin } = useTheme();

  /**
   * A pílula é do Orgânico. No Papel, retângulo.
   *
   * O dono circulou as "caixas" do outro tema e o botão era a última: um
   * comprimido de canto totalmente arredondado no meio de uma página de réguas
   * retas e serifa. Canto reto não deixa o botão menos achável — o que o torna
   * achável é ser a única massa de cor da tela, e isso continua.
   */
  const papel = skin === 'papel';

  /**
   * A cor da AÇÃO é do aplicativo, não da seção.
   *
   * O botão pintava com o acento da área, e numa folha de contato as quatro
   * telas apareceram com quatro botões de cores diferentes — laranja na
   * produção, rosa no transporte. Cor de seção mora na régua e no desenho, que
   * é onde ela responde "que assunto é este"; no botão ela responde outra
   * pergunta, e responde errado: "registrar uma saída" não é uma coisa
   * diferente de "adicionar produção" só porque a aba é outra.
   *
   * Vale no Papel, onde a família é de tinta e um preenchimento claro vira
   * mancha. No Orgânico o acento por área continua — lá a cor é o assunto, e
   * foi assim que o dono escolheu.
   */
  const preenchimento = papel ? brand : accent;
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
          backgroundColor: isPrimary ? preenchimento : 'transparent',
          borderColor: isPrimary ? 'transparent' : color.lineStrong,
          borderRadius: papel ? radius.sm : radius.pill,
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
