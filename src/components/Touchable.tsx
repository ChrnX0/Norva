import { type ReactNode } from 'react';
import * as Haptics from 'expo-haptics';
import { Pressable, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ALVO } from '@/theme/tokens';
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
  /**
   * O nome do alvo, quando ele PRECISA de um — e ele quase nunca precisa.
   *
   * Opcional desde 9 de setembro, e a mudança é de acessibilidade e não de estilo:
   * `accessibilityLabel` SUBSTITUI o texto que o leitor de tela montaria a partir dos
   * filhos. Num chip ou numa opção de lista, onde o filho é a própria palavra, isso
   * não custa nada. Num CARTÃO — a linha de Relatórios, o Espelho da Loja, a peça da
   * capa — custa tudo: o número, a comparação e o convite desapareciam, e quem usa
   * TalkBack ouvia "Custo por unidade, botão" numa tela que dizia "Custo por unidade
   * · R$ 0,64 · +3 centavos que a semana passada · Abrir a tela".
   *
   * Então: nome curto quando o alvo não tem texto próprio; ausente quando o conteúdo
   * já se anuncia melhor do que qualquer resumo.
   */
  accessibilityLabel?: string;
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
      // O PISO do alvo vem antes do estilo de quem chama, então continua sendo
      // possível dizer outra coisa — e ninguém precisa lembrar de dizer o piso. Era
      // aqui que faltava: nove etiquetas tocáveis tinham vinte e oito dp de alvo,
      // porque o `Chip` é um desenho e o toque mora no envoltório.
      //
      // `justifyContent` só faz diferença quando o piso de fato estica a caixa; para
      // um cartão, que já é mais alto que isso, as duas linhas são inertes.
      style={[{ minHeight: ALVO, justifyContent: 'center' }, style, squeeze]}
    >
      {children}
    </Springy>
  );
}
