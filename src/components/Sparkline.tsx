import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { tint } from '@/components/Card';
import { sparkArea, sparkPath, sparkPoints } from '@/domain/spark';
import { useTheme } from '@/theme/ThemeProvider';

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);

/**
 * A linha de uma série, desenhada como se alguém tivesse acabado de traçá-la.
 *
 * O dono pediu obra de arte, e a diferença entre um gráfico e um desenho é o
 * gesto: a linha ENTRA, da esquerda para a direita, no tempo que uma mão levaria
 * — e o último ponto ganha um pingo que assenta depois, que é onde o olho para.
 *
 * O desenho é `stroke-dasharray` com o traço inteiro escondido e revelado por
 * `dashoffset`, que é a única forma de "escrever" uma curva sem recalcular o
 * caminho quadro a quadro. O caminho em si vem do domínio, já conferido: aqui
 * dentro não há aritmética de dado nenhuma.
 *
 * E respeita quem desligou animação no aparelho: aí a linha já nasce inteira.
 * Movimento que a pessoa pediu para não existir não é charme, é desrespeito.
 */
export function Sparkline({
  values,
  hue,
  width = 220,
  height = 44,
  strokeWidth = 2,
}: {
  values: readonly number[];
  hue?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const { accent, motion } = useTheme();
  // O gesto tem a duração de um traço de mão: rápido o bastante para não atrasar
  // a leitura, lento o bastante para o olho ver a linha nascer.
  const desenho = motion.countMs;
  const cor = hue ?? accent;

  const points = sparkPoints(values, width, height, strokeWidth + 1);
  const line = sparkPath(points);
  const area = sparkArea(points, height);
  const last = points[points.length - 1];

  // O comprimento do traço não precisa ser exato: qualquer valor maior que a
  // curva esconde o traço inteiro, e a curva nunca passa da diagonal da caixa
  // vezes o número de segmentos.
  const length = Math.ceil(Math.hypot(width, height) * Math.max(1, points.length));

  const drawn = useSharedValue(0);
  const settled = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        drawn.value = 1;
        settled.value = 1;
        return;
      }
      drawn.value = withTiming(1, { duration: desenho });
      settled.value = withDelay(desenho, withSpring(1, { damping: 14, stiffness: 160 }));
    });
    return () => {
      cancelled = true;
    };
  }, [drawn, settled, desenho, line]);

  // `risco`, não `traco`: desde que a espessura virou `useTheme().traco`, a
  // palavra tem dono no projeto inteiro, e duas coisas com o mesmo nome no mesmo
  // vocabulário é como a divergência começa. Aqui é a linha sendo DESENHADA.
  const risco = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - drawn.value),
  }));
  const pingo = useAnimatedProps(() => ({
    r: 3.2 * settled.value,
    opacity: settled.value,
  }));

  if (points.length === 0) return null;

  return (
    <View style={{ width: '100%', height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cor} stopOpacity="0.28" />
            <Stop offset="1" stopColor={cor} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* O preenchimento aparece por baixo e sem gesto: ele é o peso da linha,
            não a linha. Animar os dois competindo deixa o cartão inquieto. */}
        {area ? <Path d={area} fill="url(#spark)" /> : null}

        <APath
          d={line}
          stroke={cor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={length}
          animatedProps={risco}
        />

        {last ? (
          <ACircle cx={last.x} cy={last.y} fill={cor} stroke={tint(cor, 0.35)} strokeWidth={3} animatedProps={pingo} />
        ) : null}
      </Svg>
    </View>
  );
}
