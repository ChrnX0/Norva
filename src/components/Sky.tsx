import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O céu do dia, desenhado.
 *
 * O dono olhou a capa publicada e disse que o clima podia ficar muito mais
 * bonito. Ele estava certo, e o cartão de antes explica por quê: era um número
 * grande e quatro linhas de texto cinza, com a mesma cara do custo, do saldo e
 * de tudo o mais. Numa fábrica de sorvete o calor É o negócio — o cartão que
 * fala dele não pode ter a cara de uma linha de planilha.
 *
 * O que esta cena desenha vem do dado e só dele: a cor do fundo sai da máxima
 * do dia, o sol ou a nuvem saem da chance de chuva, e as gotas só caem quando a
 * chance é de verdade. Nada aqui é enfeite escolhido a dedo — trocar 31° por
 * 12° troca a cena inteira sem tocar no código.
 *
 * O traço obedece a regra que o resto do desenho segue: a cor mora no traço, e
 * o único preenchimento é a atmosfera atrás — que é fundo, não ícone.
 */

/** A faixa em que o calor deste negócio muda de assunto. */
function temperatureBand(maxC: number): 'cold' | 'mild' | 'warm' | 'hot' {
  if (maxC < 18) return 'cold';
  if (maxC < 26) return 'mild';
  if (maxC < 32) return 'warm';
  return 'hot';
}

export function SkyScene({
  maxC,
  rainChance,
  width = 320,
  height = 120,
}: {
  maxC: number;
  rainChance: number | null;
  width?: number;
  height?: number;
}) {
  const { palette, brand, skin } = useTheme();
  const band = temperatureBand(maxC);
  const raining = rainChance !== null && rainChance >= 30;

  // A atmosfera: duas paradas de cor tiradas da paleta do tema, nunca um
  // hexadecimal solto. Frio puxa para o azul da casa, calor para o âmbar.
  // A cor do céu sai da máxima do dia, como sempre — mas no Orgânico ela passa
  // primeiro pela paleta escolhida: quem trocou o verde por âmbar não quer um
  // céu verde no dia frio. No Papel a cena é de traço e a marca não entra aqui.
  const quente = skin === 'organico' ? brand : palette.apricot;
  const [top, bottom] =
    band === 'cold'
      ? [palette.sky, palette.mist]
      : band === 'mild'
        ? [skin === 'organico' ? brand : palette.sky, palette.mint]
        : band === 'warm'
          ? [palette.sand, quente]
          : [quente, palette.rose];

  const spin = useSharedValue(0);
  const drift = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      // Uma volta a cada quarenta segundos. É movimento que se percebe se você
      // olhar, e não se percebe se você estiver trabalhando - que é o único
      // tipo de animação que pode ficar numa tela o dia inteiro.
      spin.value = withRepeat(withTiming(1, { duration: 40000, easing: Easing.linear }), -1, false);
      drift.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
    });
    return () => {
      cancelled = true;
    };
  }, [spin, drift]);

  const sunTurn = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const cloudDrift = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.sin(drift.value * Math.PI * 2) * 6 }],
  }));

  const stroke = palette.onAccent;

  return (
    <View style={{ width, height, borderRadius: 18, overflow: 'hidden' }} pointerEvents="none">
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="atmosphere" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} stopOpacity="0.95" />
            <Stop offset="1" stopColor={bottom} stopOpacity="0.75" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#atmosphere)" />
      </Svg>

      {/* O sol, girando devagar atrás de tudo. Some quando chove de verdade -
          desenhar sol num dia de chuva é a mesma mentira do alerta inventado. */}
      {!raining ? (
        <Animated.View
          style={[
            { position: 'absolute', right: 22, top: height / 2 - 34 },
            sunTurn,
          ]}
        >
          <Svg width={68} height={68} viewBox="0 0 68 68">
            <Circle cx="34" cy="34" r="13" stroke={stroke} strokeWidth="2" fill="none" />
            {Array.from({ length: 8 }, (_, i) => {
              const angle = (i * Math.PI) / 4;
              return (
                <Line
                  key={i}
                  x1={34 + Math.cos(angle) * 20}
                  y1={34 + Math.sin(angle) * 20}
                  x2={34 + Math.cos(angle) * 27}
                  y2={34 + Math.sin(angle) * 27}
                  stroke={stroke}
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              );
            })}
          </Svg>
        </Animated.View>
      ) : null}

      {/* A nuvem e a chuva. A nuvem vagueia seis pixels para cada lado: é o
          bastante para a cena estar viva e pouco o bastante para ninguém
          reparar enquanto lança produção. */}
      {raining ? (
        <Animated.View style={[{ position: 'absolute', right: 18, top: 16 }, cloudDrift]}>
          <Svg width={92} height={82} viewBox="0 0 92 82">
            <Path
              d="M20 40 a14 14 0 0 1 14-14 a18 18 0 0 1 34 6 a12 12 0 0 1 -2 24 H26 a12 12 0 0 1 -6 -16 Z"
              stroke={stroke}
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
            />
            {[0, 1, 2].map((i) => (
              <Line
                key={i}
                x1={32 + i * 16}
                y1={62}
                x2={28 + i * 16}
                y2={74}
                stroke={stroke}
                strokeWidth="2"
                strokeLinecap="round"
                opacity={0.85 - i * 0.15}
              />
            ))}
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * A régua do dia: onde a mínima e a máxima caem dentro do dia inteiro.
 *
 * Lei 3 desenhada em vez de escrita — 21° sozinho não diz nada; 21° ocupando o
 * pedaço quente de uma barra que vai de 13° a 21° diz o dia inteiro num relance.
 */
export function TemperatureRange({ minC, maxC }: { minC: number; maxC: number }) {
  const { color, space, palette } = useTheme();
  const grown = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      grown.value = cancelled || reduced ? 1 : withTiming(1, { duration: 900 });
    });
    return () => {
      cancelled = true;
    };
  }, [grown]);

  // A escala é o dia de uma sorveteria: de zero a quarenta graus. Fixa de
  // propósito - uma régua que se estica para caber no dado faria 18° e 34°
  // desenharem a mesma barra, e a comparação entre dois dias morreria.
  const clamp = (c: number) => Math.max(0, Math.min(1, c / 40));
  const from = clamp(minC);
  const to = clamp(maxC);

  const bar = useAnimatedStyle(() => ({
    left: `${from * 100}%`,
    width: `${(to - from) * 100 * grown.value}%`,
  }));

  return (
    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: color.sunken,
        overflow: 'hidden',
        marginTop: space.sm,
      }}
    >
      <Animated.View
        style={[{ position: 'absolute', top: 0, bottom: 0, borderRadius: 3, backgroundColor: palette.apricot }, bar]}
      />
    </View>
  );
}
