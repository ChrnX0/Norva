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
 *
 * **O que saiu da cena, e por quê — 3 de setembro.** O dono abriu o aplicativo
 * instalado e a cena tinha oito grupos em trezentos pixels: fábrica, chaminé,
 * câmara, três picolés, morango, nuvem e sol. Duas coisas quebravam a
 * composição, e as duas eu só vi olhando a tela renderizada:
 *
 * - **o floco flutuava ACIMA da câmara**, e lia como um asterisco azul no céu —
 *   um símbolo sem dono. Ele entrou para dentro do retângulo, que é o que ele
 *   existe para nomear;
 * - **o morango e a nuvem não pousavam em nada**. Objeto solto no ar, sem linha
 *   de base e sem função, é o que transforma desenho em figurinha espalhada.
 *
 * Sobraram quatro grupos e o sol, todos na mesma linha de base, e cada um
 * dizendo alguma coisa: a fábrica trabalha, a câmara guarda, os picolés medem o
 * dia, a caixa sai.
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
          <Path d="M20 88l0-16 16 16 0-16 16 16 0-16 16 16 0-16 16 16" />
          <Path d="M20 88h64v45H20z" />
          <Path d="M28 98h9v9h-9zM42 98h9v9h-9zM56 98h9v9h-9zM28 113h9v9h-9z" />
          <Path d="M56 133v-23h12v23" />

          <Path d="M92 133V58h14v75M90 62h18" />

          <Path d="M124 76h54v57h-54z" />
          <Path d="M124 96h54M168 84v8M168 102v12" />
          {/* O floco fica DENTRO da câmara, e isso não é gosto: solto acima
              dela ele lia como um asterisco azul no céu — um símbolo sem dono.
              Dentro, ele diz o que aquele retângulo é. */}
          <G stroke={palette.sky}>
            <Path d="M151 105v18M143 109.5l16 9M143 118.5l16-9" />
          </G>

          {/* Picolé, e não arbusto.
              Com 20 de largura e canto 7 num traço fino, os três liam como uma
              moita — vinte pixels de altura de palito não bastam para o olho
              decidir o que é. Mais estreitos, mais altos e com o palito de 17
              eles viram o que são. */}
          <Rect x="194" y="78" width="15" height="38" rx="5" />
          <Path d="M201.5 116v17" />
          <Rect x="218" y="78" width="15" height="38" rx="5" stroke={palette.apricot} />
          <Path d="M225.5 116v17" stroke={palette.apricot} />
          <Fill progress={enche} color={palette.apricot} />
          <Rect x="242" y="78" width="15" height="38" rx="5" />
          <Path d="M249.5 116v17" />

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
  // As medidas seguem o picolé do meio; separadas, o preenchimento sai do lugar
  // no dia em que alguém mexer no desenho — e ninguém percebe, porque a cena
  // continua bonita com a barra fora do molde.
  const props = useAnimatedProps(() => ({
    y: 116 - 38 * progress.value,
    height: 38 * progress.value,
  }));
  return <AnimatedRect animatedProps={props} x={218} width={15} fill={color} fillOpacity={0.22} stroke="none" />;
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
