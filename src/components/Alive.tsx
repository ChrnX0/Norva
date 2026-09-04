import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O desenho respira, como a cena da fábrica respira.
 *
 * O dono apontou o crachá de um cartão e pediu: *"quero todos eles com aquela
 * animação bem suave que aparece naquele desenho de fábrica do briefing. quero
 * esse padrão em todo o aplicativo"*. A cena da fábrica tem uma regra escrita —
 * **nada ali se move por decoração** — e duas exceções admitidas: o sol e o
 * floco giram devagar, porque um sol parado num desenho de céu lê como imagem
 * quebrada. Este componente é a generalização daquelas duas exceções: um
 * símbolo completamente inerte no meio de uma página que se monta lê como
 * carimbo colado, não como parte da tela.
 *
 * São dois movimentos, e os dois obedecem a mesma medida da casa:
 *
 * - **A chegada.** O desenho assenta junto com o cartão que o carrega: sobe da
 *   escala 0,84 na mola `settle`, atrasado pelo mesmo escalonamento de quarenta
 *   milissegundos do `Reveal`. É a peça terminando de se montar, não um efeito.
 * - **A respiração.** Depois disso ele oscila três centésimos e meio de escala
 *   em `motion.breatheMs` para cada lado — em vinte e seis pixels isso é menos
 *   de um pixel de viagem. É a mesma faixa dos ciclos da fábrica: percebe-se se
 *   você olhar e não se percebe se você estiver trabalhando.
 *
 * `breatheMs` estava em `tokens.ts` desde o começo do projeto e **nada o
 * chamava** — mais uma peça sem chamador, agora com um.
 *
 * **Reduzir movimento apaga os dois e o desenho continua inteiro**, no tamanho
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
  const folego = useSharedValue(0);

  useEffect(() => {
    let cancelado = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduzido) => {
      if (cancelado) return;
      if (reduzido) {
        entrada.value = 1;
        folego.value = 0;
        return;
      }
      entrada.value = withDelay(index * motion.staggerMs, withSpring(1, motion.settle));
      folego.value = withRepeat(
        withSequence(
          withTiming(1, { duration: motion.breatheMs, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: motion.breatheMs, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    });
    return () => {
      cancelado = true;
    };
  }, [entrada, folego, index, motion.breatheMs, motion.settle, motion.staggerMs]);

  const animado = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ scale: 0.84 + entrada.value * 0.16 + folego.value * 0.035 }],
  }));

  return <Animated.View style={[style, animado]}>{children}</Animated.View>;
}
