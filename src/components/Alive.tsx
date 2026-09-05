import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O desenho ASSENTA quando chega — e só isso.
 *
 * Ele já fez duas coisas. A segunda era uma respiração: três centésimos de
 * escala, para sempre, igual nos vinte e seis desenhos do aplicativo. Ela nasceu
 * de um pedido do dono (*"quero todos eles com aquela animação bem suave que
 * aparece naquele desenho de fábrica"*) e **saiu por outro dele**, sobre a mesma
 * cena: *"sutil, mas vivo"*, com cada coisa se mexendo como ela mesma.
 *
 * A diferença entre os dois pedidos é a coisa inteira. Na cena da fábrica o sol
 * gira porque é sol e a fumaça sobe porque é fumaça; nenhum dos dois respira. Um
 * respiro único aplicado a tudo é o oposto de "cada um como ele mesmo" — é o
 * mesmo movimento com vinte e seis nomes. A vida foi para dentro dos desenhos
 * (`Vivo`, `Coluna`), onde ela pode ser o que cada um faz.
 *
 * O que ficou é a **chegada**: o desenho sobe da escala 0,84 na mola `settle`,
 * atrasado pelo mesmo escalonamento de quarenta milissegundos do `Reveal`. Isso
 * não é efeito — é a peça terminando de se montar, e sem ela um símbolo inerte
 * no meio de uma página que se monta lê como carimbo colado.
 *
 * **Reduzir movimento apaga a chegada e o desenho continua inteiro**, no tamanho
 * final, opaco. Quem liga a opção do sistema não recebe uma tela pela metade.
 */
export function Alive({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  /** A posição na cascata, para o crachá assentar junto com o cartão dele. */
  index?: number;
  style?: ViewStyle;
}) {
  const { motion } = useTheme();
  const entrada = useSharedValue(0);

  useEffect(() => {
    let cancelado = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduzido) => {
      if (cancelado) return;
      if (reduzido) {
        entrada.value = 1;
        return;
      }
      entrada.value = withDelay(index * motion.staggerMs, withSpring(1, motion.settle));
    });
    return () => {
      cancelado = true;
    };
  }, [entrada, index, motion.settle, motion.staggerMs]);

  const animado = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ scale: 0.84 + entrada.value * 0.16 }],
  }));

  return <Animated.View style={[style, animado]}>{children}</Animated.View>;
}
