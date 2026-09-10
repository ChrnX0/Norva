import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { useReduzirMovimento } from './vida';
import type { Palette, Tracos } from '@/theme/tokens';
import { redeDaEntrada } from './chegada';

/**
 * O dia, desenhado — e por que ele deixou de ser um bloco.
 *
 * O dono olhou a capa publicada e disse que o clima podia ficar muito mais bonito.
 * A primeira resposta foi uma FAIXA de céu: um retângulo de 140 px com degradê
 * entre duas cores da paleta, o sol por cima, e o texto embaixo. Ela nasceu do
 * argumento certo — numa fábrica de sorvete o calor É o negócio, e o cartão que
 * fala dele não pode ter a cara de uma linha de planilha — e resolveu o problema
 * errado.
 *
 * **O que as fotos mostraram**, nas três combinações, no dia em que alguém
 * finalmente olhou:
 *
 *   - **Orgânico claro, 33°:** o degradê ia do verde da marca ao rosa. Duas cores
 *     de matiz distante interpoladas em sRGB passam por LAMA no meio: o cartão
 *     ficou um hematoma de 140 px no alto da capa.
 *   - **Orgânico escuro:** o mesmo bloco pastel, agora aceso numa tela preta, com
 *     o sol desenhado em `onAccent` — que no escuro é quase preto. Um adesivo de
 *     outro aplicativo colado na tela.
 *   - **Papel:** sem degradê (a identidade dele é traço), sobrava um VAZIO de 92 px
 *     com um sol no canto direito. O comentário de então já dizia que 140 px em
 *     volta de um sol viram bloco vazio; a correção diminuiu o bloco em vez de
 *     tirá-lo.
 *
 * O defeito comum não é a cor escolhida: é a **área**. As cores desta paleta são
 * tinta e traço — feitas para desenhar sobre um fundo claro ou escuro, não para
 * PREENCHER um terço da tela. Ampliar uma cor de acento até virar fundo é o mesmo
 * erro que ampliar `inkFaint` até virar texto de corpo: ela não foi medida para
 * isso.
 *
 * **O que ficou:** o desenho, do tamanho de um desenho, ao lado do número — como a
 * ilustração da fábrica no cartão de primeiro dia, que é a única peça desta capa
 * que ficou bonita nas três fotos. A temperatura continua mandando na cena, que era
 * a promessa boa da versão anterior: ela decide a COR DO TRAÇO e o halo atrás dele.
 * Trocar 31° por 12° troca o desenho inteiro sem tocar no código, e agora sem
 * pintar um terço da capa.
 */

/** A faixa em que o calor deste negócio muda de assunto. */
export function temperatureBand(maxC: number): 'cold' | 'mild' | 'warm' | 'hot' {
  if (maxC < 18) return 'cold';
  if (maxC < 26) return 'mild';
  if (maxC < 32) return 'warm';
  return 'hot';
}

/**
 * A cor do dia, uma por faixa.
 *
 * A rampa é fria → morna → quente, e ela para no terracota: `rose` era o topo e
 * saiu ROSA na foto, que nesta paleta é a cor do Espelho da Loja e vizinha do
 * vermelho de perigo. Trinta e três graus numa fábrica de sorvete não é perigo, é
 * o melhor dia do mês — pintá-lo de alerta ensina a ler alerta como enfeite, que é
 * o mesmo defeito do alerta inventado, pelo lado da cor.
 *
 * Exportada porque o cartão inteiro usa: o filete da borda, o traço do desenho e a
 * régua do dia são a mesma cor, e um cartão com a borda azul e um sol rosa dentro
 * é duas coisas na mesma peça.
 */
export function skyInk(
  maxC: number,
  { palette, brand, tracos }: { palette: Palette; brand: string; tracos: Tracos },
): string {
  const band = temperatureBand(maxC);
  if (band === 'cold') return palette.sky;
  // Numa pele com tom escolhido, o morno É esse tom: quem trocou o verde por
  // âmbar não quer um dia morno verde. Numa pele de cara única o morno é o
  // verde da paleta — e a pergunta é da PELE, não do nome dela.
  if (band === 'mild') return tracos.marcaVemDoTom ? brand : palette.mint;
  return band === 'warm' ? palette.sand : palette.apricot;
}

/**
 * O selo do dia: sol ou nuvem, na cor do calor.
 *
 * Uma cor só por faixa, e ela é da paleta do tema — nunca um hexadecimal solto e
 * nunca duas cores interpoladas. O halo atrás existe para o cartão respirar a
 * temperatura sem virar bloco: ele é a MESMA cor do traço, some antes da borda, e
 * não existe no Papel, cuja identidade é traço sobre papel.
 */
export function SkyMark({
  maxC,
  rainChance,
  size = 76,
}: {
  maxC: number;
  rainChance: number | null;
  size?: number;
}) {
  const { palette, brand, tracos, traco } = useTheme();
  const raining = rainChance !== null && rainChance >= 30;
  const papel = tracos.genero === 'pagina';
  const tinta = skyInk(maxC, { palette, brand, tracos });

  const spin = useSharedValue(0);
  const drift = useSharedValue(0);
  // Do cache do módulo: `vida.ts` existe para esta resposta não custar uma ida à
  // ponte por montagem, e onze leituras do pacote a furavam.
  const reduzir = useReduzirMovimento();

  useEffect(() => {
    if (reduzir !== false) return;
    // Uma volta a cada quarenta segundos. É movimento que se percebe se você
    // olhar, e não se percebe se você estiver trabalhando - que é o único
    // tipo de animação que pode ficar numa tela o dia inteiro.
    spin.value = withRepeat(withTiming(1, { duration: 40000, easing: Easing.linear }), -1, false);
    drift.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
  }, [spin, drift, reduzir]);

  const sunTurn = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const cloudDrift = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.sin(drift.value * Math.PI * 2) * 4 }],
  }));


  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* O halo: a temperatura sentida antes de lida, e some antes de virar bloco.
          Raio inteiro, opacidade que cai a zero na borda — assim ele não tem
          contorno, que é o que faria dele mais um retângulo colorido. */}
      {papel ? null : (
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tinta} stopOpacity="0.30" />
              <Stop offset="0.65" stopColor={tinta} stopOpacity="0.10" />
              <Stop offset="1" stopColor={tinta} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#halo)" />
        </Svg>
      )}

      {/* O sol, girando devagar. Some quando chove de verdade — desenhar sol num
          dia de chuva é a mesma mentira do alerta inventado. */}
      {!raining ? (
        <Animated.View style={sunTurn}>
          <Svg width={size} height={size} viewBox="0 0 68 68">
            <Circle cx="34" cy="34" r="13" stroke={tinta} strokeWidth={traco} fill="none" />
            {Array.from({ length: 8 }, (_, i) => {
              const angle = (i * Math.PI) / 4;
              return (
                <Line
                  key={i}
                  x1={34 + Math.cos(angle) * 20}
                  y1={34 + Math.sin(angle) * 20}
                  x2={34 + Math.cos(angle) * 27}
                  y2={34 + Math.sin(angle) * 27}
                  stroke={tinta}
                  strokeWidth={traco}
                  strokeLinecap="round"
                />
              );
            })}
          </Svg>
        </Animated.View>
      ) : (
        /* A nuvem vagueia quatro pixels para cada lado: o bastante para a cena
           estar viva, pouco o bastante para ninguém reparar enquanto lança
           produção. A chuva é azul mesmo no dia quente — quem olha quer saber se
           molha, e a temperatura já está dita no número ao lado. */
        <Animated.View style={cloudDrift}>
          <Svg width={size} height={size} viewBox="0 0 68 68">
            <Path
              d="M14 34 a11 11 0 0 1 11 -11 a14 14 0 0 1 27 5 a9 9 0 0 1 -2 19 H19 a9 9 0 0 1 -5 -13 Z"
              stroke={tinta}
              strokeWidth={traco}
              fill="none"
              strokeLinejoin="round"
            />
            {[0, 1, 2].map((i) => (
              <Line
                key={i}
                x1={24 + i * 12}
                y1={52}
                x2={21 + i * 12}
                y2={62}
                stroke={palette.sky}
                strokeWidth={traco}
                strokeLinecap="round"
                opacity={0.9 - i * 0.15}
              />
            ))}
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * A régua do dia: onde a mínima e a máxima caem dentro do dia inteiro.
 *
 * Lei 3 desenhada em vez de escrita — 21° sozinho não diz nada; 21° ocupando o
 * pedaço quente de uma barra que vai de 13° a 21° diz o dia inteiro num relance.
 */
export function TemperatureRange({
  minC,
  maxC,
  ink,
}: {
  minC: number;
  maxC: number;
  /** A cor do dia. Sem ela, a régua é o âmbar da casa — que é o caso da semana. */
  ink?: string;
}) {
  const { color, space, palette } = useTheme();
  // `null` é "ainda não sei", e nele a faixa nasce INTEIRA: antes ela ficava com
  // largura zero — a temperatura do dia invisível — até a promessa voltar.
  const reduzir = useReduzirMovimento();
  const grown = useSharedValue(reduzir === false ? 0 : 1);

  useEffect(() => {
    if (reduzir !== false) {
      grown.value = 1;
      return;
    }
    grown.value = 0;
    grown.value = withTiming(1, { duration: 900 });
    return redeDaEntrada(
      () => {
        grown.value = 1;
      },
      0,
      900,
    );
  }, [grown, reduzir]);

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
        style={[{ position: 'absolute', top: 0, bottom: 0, borderRadius: 3, backgroundColor: ink ?? palette.apricot }, bar]}
      />
    </View>
  );
}
