import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { hues } from '@/theme/tokens';
import { useAppearance } from '@/theme/Appearance';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A paisagem do Orgânico — e ela é a previsão, não um desenho bonito.
 *
 * Irmã da `FactoryScene` do Papel: cada identidade tem o seu cabeçalho vivo, e
 * as duas obedecem a mesma regra — **nada se move por decoração**.
 *
 * - O **céu** sai da paleta que a empresa escolheu nos ajustes. Quem trocou o
 *   verde por âmbar não quer um céu verde.
 * - A **nuvem e a chuva** só existem quando a chance de chuva passa de trinta
 *   por cento, que é o mesmo corte que o cartão do clima usa para decidir se
 *   fala de chuva. Abaixo disso é ruído, e ruído todo dia ensina a não olhar.
 * - A **fumaça** da fábrica sobe quando há tacho aberto.
 * - O **sol** gira devagar, e é o único decorativo: sol parado num céu desenhado
 *   lê como imagem quebrada.
 *
 * Sem previsão — sem rede e sem cache — a paisagem existe **sem tempo**: colina,
 * fábrica e sol, e nenhuma nuvem. É a mesma decisão do cartão do clima, que
 * some em vez de mostrar um "--°" que ninguém pode conferir.
 */
/**
 * A mesma cor, à noite — e não um cinza no lugar dela.
 *
 * No escuro a paisagem pintava `sunken` sobre `surface` sobre `paper`: três
 * cinzas separados por dezoito unidades de brilho. O desenho existia e não se
 * via — o dono abriu o aplicativo e mandou a foto de uma caixa preta com um sol
 * dentro, que é exatamente o que estava lá.
 *
 * A regra do tema ("escuro é cinza neutro, cor só de acento") vale para
 * SUPERFÍCIE, não para cena: uma colina não é fundo de cartão, é a figura. Aqui
 * a matiz escolhida continua, escurecida — que é o que uma colina faz à noite.
 */
function noturno(hex: string, fator: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * fator);
  const g = Math.round(((n >> 8) & 255) * fator);
  const b = Math.round((n & 255) * fator);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function Landscape({
  maxC,
  rainChance,
  running,
  height = 210,
}: {
  /** A máxima de hoje. Nulo quando não há previsão nem cache. */
  maxC: number | null;
  /** A chance de chuva, em por cento. Nulo quando não se sabe. */
  rainChance: number | null;
  /** Há tacho aberto agora. */
  running: boolean;
  height?: number;
}) {
  const { color, scheme, radius } = useTheme();
  const { hue } = useAppearance();
  const paleta = hues[hue];

  const giro = useSharedValue(0);
  const deriva = useSharedValue(0);
  const gota = useSharedValue(0);
  const fumaca = useSharedValue(0);

  const chovendo = rainChance !== null && rainChance >= 30;
  const noite = scheme === 'dark';

  useEffect(() => {
    let cancelado = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduzido) => {
      if (cancelado || reduzido) return;
      giro.value = withRepeat(withTiming(1, { duration: 34000, easing: Easing.linear }), -1, false);
      deriva.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1, true);
      if (chovendo) {
        gota.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1, false);
      }
      if (running) {
        fumaca.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [chovendo, running, giro, deriva, gota, fumaca]);

  const sol = useAnimatedStyle(() => ({ transform: [{ rotate: `${giro.value * 360}deg` }] }));
  const nuvem = useAnimatedStyle(() => ({ transform: [{ translateX: (deriva.value - 0.5) * 12 }] }));
  const chuva = useAnimatedStyle(() => ({
    opacity: Math.sin(gota.value * Math.PI) * 0.9,
    transform: [{ translateY: gota.value * 22 }],
  }));
  const fumo = useAnimatedStyle(() => ({
    opacity: fumaca.value === 0 ? 0 : Math.sin(fumaca.value * Math.PI) * 0.55,
    transform: [{ translateY: -fumaca.value * 20 }, { scale: 0.9 + fumaca.value * 0.3 }],
  }));

  // O calor muda a saturação do céu, não a paleta: quem escolheu âmbar continua
  // no âmbar num dia frio, só que mais lavado.
  const quente = maxC !== null && maxC >= 26;

  return (
    // O canto acompanha o cartão em que a cena vive.
    //
    // Ela era um retângulo de canto reto dentro de um cartão de canto arredondado:
    // um bloco de outro vocabulário colado no meio do Orgânico, que é um tema de
    // curvas. Aparece na foto como uma quina dura no meio de tudo o que é redondo —
    // e o Orgânico é a cara que o dono escolheu como padrão.
    <View style={{ height, overflow: 'hidden', borderRadius: radius.md }} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 412 210" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="ceu" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={noite ? color.paper : paleta.skyTop} stopOpacity={quente ? 1 : 0.85} />
            <Stop offset="1" stopColor={noite ? noturno(paleta.skyBottom, 0.3) : paleta.skyBottom} />
          </LinearGradient>
        </Defs>
        <Rect width={412} height={210} fill="url(#ceu)" />

        <Path
          d="M0 150c70-22 120 14 206 2s136-30 206-12v70H0z"
          fill={noite ? noturno(paleta.hillFar, 0.42) : paleta.hillFar}
        />
        <G fill={noite ? noturno(paleta.hillNear, 0.72) : paleta.hillNear}>
          <Path d="M282 156h60v30h-60z" />
          <Path d="M282 156l10-15 10 15 10-15 10 15 10-15 10 15" />
          <Rect x={348} y={132} width={9} height={54} />
        </G>
        <G fill={noite ? '#F5C66A' : '#FFFFFF'}>
          <Rect x={290} y={166} width={8} height={8} />
          <Rect x={304} y={166} width={8} height={8} />
          <Rect x={318} y={166} width={8} height={8} />
        </G>
        <Path
          d="M0 182c80-16 130 12 206 4s130-22 206-6v34H0z"
          fill={noite ? noturno(paleta.hillNear, 0.58) : paleta.hillNear}
        />
      </Svg>

      {/* O sol, girando devagar. */}
      <Animated.View style={[{ position: 'absolute', right: 30, top: 18, width: 78, height: 78 }, sol]}>
        <Svg viewBox="0 0 78 78" width="100%" height="100%">
          <Circle cx="39" cy="39" r="18" fill={noite ? '#F7E6B5' : '#FFD76A'} />
          <G stroke={noite ? '#F7E6B5' : '#FFD76A'} strokeWidth={4} strokeLinecap="round">
            <Path d="M39 6v8M39 64v8M6 39h8M64 39h8M15 15l6 6M57 57l6 6M63 15l-6 6M21 57l-6 6" />
          </G>
        </Svg>
      </Animated.View>

      {/* A nuvem e a chuva, só quando a chance é de verdade. */}
      {chovendo ? (
        <>
          <Animated.View style={[{ position: 'absolute', right: 60, top: 48, width: 96, height: 46 }, nuvem]}>
            <Svg viewBox="0 0 96 46" width="100%" height="100%">
              <Path
                d="M8 34a14 14 0 0 1 14-13 18 18 0 0 1 34 5 12 12 0 0 1-3 24H22a12 12 0 0 1-14-16z"
                fill={noite ? color.sunken : '#FFFFFF'}
              />
            </Svg>
          </Animated.View>
          <Animated.View style={[{ position: 'absolute', right: 76, top: 92, width: 64, height: 22 }, chuva]}>
            <Svg viewBox="0 0 64 22" width="100%" height="100%">
              <G fill="#8EC5FC">
                <Circle cx="10" cy="6" r="3.4" />
                <Circle cx="32" cy="10" r="3.4" />
                <Circle cx="54" cy="6" r="3.4" />
              </G>
            </Svg>
          </Animated.View>
        </>
      ) : null}

      {/* A fumaça da fábrica: só com tacho aberto. */}
      <Animated.View style={[{ position: 'absolute', right: 44, top: 108, width: 22, height: 26 }, fumo]}>
        <Svg viewBox="0 0 22 26" width="100%" height="100%">
          <G fill={noite ? color.inkFaint : '#FFFFFF'}>
            <Circle cx="9" cy="18" r="5" />
            <Circle cx="14" cy="10" r="4" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}
