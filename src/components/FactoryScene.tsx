import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * A fábrica desenhada — e viva porque a fábrica está viva.
 *
 * O dono viu a cena animada e disse *"isso é lindo e preenche os olhos; claro
 * que não é para tirar a atenção"*. A diferença entre enfeite e informação está
 * inteira nessa frase, e é o que este componente resolve: **nada aqui se move
 * por decoração**.
 *
 * - A **fumaça** sobe quando há tacho aberto. Fábrica parada, chaminé parada —
 *   é a mesma regra do `PulseDot`, que exige `live` para não pulsar ao lado de
 *   número congelado.
 * - O **picolé do meio** enche na proporção do dia contra ontem. Cheio é dia
 *   igual ou melhor; pela metade, metade. Ninguém precisa ler o número para
 *   saber como está indo.
 * - A **caixa** entra pela direita quando saiu carga hoje, e some quando não
 *   saiu nada — a ausência é dado.
 * - O **sol** e o **floco** giram devagar, e esses dois são os únicos
 *   decorativos: um sol parado num desenho de céu lê como imagem quebrada.
 *
 * Os ciclos são longos de propósito (seis a quarenta e oito segundos): é
 * movimento que se percebe se você olhar e não se percebe se você estiver
 * trabalhando. E `reduzir movimento` desliga tudo com a cena inteira de pé.
 */
export function FactoryScene({
  running,
  dayShare,
  shipped,
  height = 132,
}: {
  /** Há tacho aberto agora. */
  running: boolean;
  /** O dia contra ontem, de 0 a 1. Nulo quando não há com o que comparar. */
  dayShare: number | null;
  /** Saiu carga hoje. */
  shipped: boolean;
  height?: number;
}) {
  const { color, palette } = useTheme();
  const fumaca = useSharedValue(0);
  const giro = useSharedValue(0);
  const enche = useSharedValue(0);
  const caixa = useSharedValue(shipped ? 1 : 0);

  useEffect(() => {
    let cancelado = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduzido) => {
      if (cancelado) return;
      if (reduzido) {
        // Parado, mas completo: quem desligou movimento vê a mesma cena, com o
        // picolé no nível certo e a caixa no lugar.
        enche.value = dayShare ?? 0;
        caixa.value = shipped ? 1 : 0;
        return;
      }
      if (running) {
        fumaca.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
      } else {
        fumaca.value = 0;
      }
      giro.value = withRepeat(withTiming(1, { duration: 30000, easing: Easing.linear }), -1, false);
      enche.value = withTiming(dayShare ?? 0, { duration: 2600, easing: Easing.out(Easing.cubic) });
      caixa.value = withSequence(
        withTiming(shipped ? 1 : 0, { duration: 900, easing: Easing.out(Easing.cubic) }),
      );
    });
    return () => {
      cancelado = true;
    };
  }, [running, dayShare, shipped, fumaca, giro, enche, caixa]);

  const sol = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value * 360}deg` }] }));

  return (
    <View style={{ height }} pointerEvents="none">
      <Svg viewBox="0 0 364 150" width="100%" height="100%" accessibilityRole="image">
        <G fill="none" stroke={color.ink} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M0 133h364" stroke={color.line} />
          <Path
            d="M28 34c-5 0-8-3-8-7s4-7 8-6c1-6 8-8 12-3 5-2 10 2 9 8"
            stroke={color.inkFaint}
          />

          <Path d="M20 88l0-16 16 16 0-16 16 16 0-16 16 16 0-16 16 16" />
          <Path d="M20 88h64v45H20z" />
          <Path d="M28 98h9v9h-9zM42 98h9v9h-9zM56 98h9v9h-9zM28 113h9v9h-9z" />
          <Path d="M56 133v-23h12v23" />

          <Path d="M92 133V58h14v75M90 62h18" />

          <Path d="M124 76h54v57h-54z" />
          <Path d="M124 96h54M168 84v8M168 102v12" />
          <G stroke={palette.sky}>
            <Path d="M151 49v18M143 53.5l16 9M143 62.5l16-9" />
          </G>

          <Rect x="192" y="82" width="20" height="34" rx="7" />
          <Path d="M202 116v14" />
          <Rect x="216" y="82" width="20" height="34" rx="7" stroke={palette.apricot} />
          <Path d="M226 116v14" stroke={palette.apricot} />
          <Fill progress={enche} color={palette.apricot} />
          <Rect x="240" y="82" width="20" height="34" rx="7" />
          <Path d="M250 116v14" />

          <G stroke={palette.apricot}>
            <Path d="M290 122c-14-9-18-22-9-27 4-2.5 7-1 9 1 2-2 5-3.5 9-1 9 5 5 18-9 27z" />
            <Path d="M290 96l-9-6M290 96l9-6M290 96v-9" />
          </G>

        </G>
      </Svg>

      {/* A fumaça e a caixa moram FORA do SVG, em camadas próprias.
          Dentro dele, `transform` animado em `<Path>` não atravessa igual nas
          três plataformas que este app abre - iOS, Android e o navegador do
          preview. Uma View posicionada por cima anima do mesmo jeito nos três, e
          é o mesmo caminho que o sol já usa.

          O preço é ter que repetir a posição em porcentagem; o ganho é a cena
          se mexer igual em todo lugar. */}
      <Smoke progress={fumaca} color={color.inkFaint} />
      <Box progress={caixa} color={color.ink} />

      {/* O sol gira fora do SVG: rotação em volta de um ponto é mais barata
          numa View do que num nó de SVG, e num celular de fábrica isso conta. */}
      <Animated.View
        style={[{ position: 'absolute', right: '5%', top: '4%', width: 62, height: 62 }, sol]}
      >
        <Svg viewBox="0 0 62 62" width="100%" height="100%">
          <Circle cx="31" cy="31" r="11" stroke={palette.apricot} strokeWidth={1.3} fill="none" />
          <G stroke={palette.apricot} strokeWidth={1.3} strokeLinecap="round">
            <Path d="M31 12v6M31 44v6M12 31h6M44 31h6M18 18l4 4M40 40l4 4M44 18l-4 4M22 40l-4 4" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

/** A fumaça: sobe vinte e dois pixels e some, seis segundos por ciclo. */
function Smoke({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value === 0 ? 0 : Math.sin(progress.value * Math.PI) * 0.9,
    transform: [{ translateY: 6 - progress.value * 22 }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: '24%', top: '12%', width: 30, height: 40 }, style]}
    >
      <Svg viewBox="0 0 30 40" width="100%" height="100%">
        <Path
          d="M15 38c-7-5 5-11-2-17c-5-5 3-9 0-13"
          stroke={color}
          strokeWidth={1.3}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/** O picolé enchendo: a altura do preenchimento é o dia contra ontem. */
function Fill({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const props = useAnimatedProps(() => ({
    y: 116 - 34 * progress.value,
    height: 34 * progress.value,
  }));
  return <AnimatedRect animatedProps={props} x={216} width={20} fill={color} fillOpacity={0.22} stroke="none" />;
}

/** A caixa da expedição, entrando pela direita quando saiu carga. */
function Box({ progress, color }: { progress: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * 46 }],
  }));
  return (
    <Animated.View
      style={[{ position: 'absolute', left: '85%', top: '64%', width: 50, height: 36 }, style]}
    >
      <Svg viewBox="0 0 50 36" width="100%" height="100%">
        <Path
          d="M2 8h44v26H2zM2 17h44M24 8v26M8 8l6-7h26l6 7"
          stroke={color}
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}
