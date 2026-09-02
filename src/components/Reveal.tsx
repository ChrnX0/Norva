import { type ReactNode, useEffect } from 'react';
import { AccessibilityInfo, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O cartão entra em cena em vez de já estar lá.
 *
 * O dono abriu o aplicativo publicado e disse a coisa mais difícil de responder
 * com teste: *"o app todo estático, sem animação e nem graça nenhuma"*. E ele
 * estava certo de um jeito que o repositório já sabia — `motion.settle`,
 * `motion.staggerMs` e `motion.pressScale` estão em `tokens.ts` desde o começo,
 * documentados com cinco regras, e **nada** os usava fora do `PulseDot`. O
 * sistema de movimento existia no papel.
 *
 * A entrada é curta e uma vez só: sobe catorze pixels e aparece, com a mola
 * `settle` que o resto do desenho já declarava. O escalonamento por índice é o
 * que faz a tela parecer montada em vez de piscada — quarenta milissegundos
 * entre um cartão e o próximo, que é abaixo do que se percebe como espera e
 * acima do que se percebe como simultâneo.
 *
 * Duas regras da casa mandam aqui, e as duas custam mais do que parecem:
 *
 * **Movimento nunca atrasa informação.** A leitura de tela recebe o conteúdo
 * montado desde o primeiro quadro; a animação é da caixa, não do texto.
 *
 * **Reduzir movimento apaga tudo e a tela continua inteira.** Quem liga a
 * opção do sistema não recebe uma versão pela metade: recebe a mesma tela,
 * parada.
 */
export function Reveal({
  index = 0,
  children,
  style,
}: {
  /** A posição na pilha. É o que escalona a entrada. */
  index?: number;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { motion } = useTheme();

  // Começa em 1, não em 0, e isso é uma decisão de segurança, não de estilo.
  //
  // Se o valor inicial fosse invisível, qualquer falha no caminho da animação
  // — o plugin de worklets fora do babel, a biblioteca não carregando no
  // navegador — deixaria a capa em branco com o banco cheio de dado. Uma tela
  // vazia por causa de enfeite é o pior defeito possível numa fábrica.
  // Começando visível, o pior caso é a tela aparecer sem a entrada.
  const shown = useSharedValue(1);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      shown.value = 0;
      shown.value = withDelay(index * motion.staggerMs, withSpring(1, motion.settle));
    });

    return () => {
      cancelled = true;
    };
  }, [index, motion.settle, motion.staggerMs, shown]);

  const entrance = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 14 }],
  }));

  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
}
