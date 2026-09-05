import { View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { hues } from '@/theme/tokens';
import { Vivo } from './Vivo';
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

  const chovendo = rainChance !== null && rainChance >= 30;
  const noite = scheme === 'dark';

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
      {/* O HORIZONTE estica, e só ele. */}
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
        <Path
          d="M0 182c80-16 130 12 206 4s130-22 206-6v34H0z"
          fill={noite ? noturno(paleta.hillNear, 0.58) : paleta.hillNear}
        />
      </Svg>

      {/* As COISAS mantêm a forma, e é por isso que elas moram noutra camada.
          Aqui `meet` escala tudo junto e `xMaxYMax` prende no canto de baixo à
          direita, que é onde a fábrica encosta na colina. */}
      <Svg
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        width="100%"
        height="100%"
        viewBox="0 0 412 210"
        preserveAspectRatio="xMaxYMax meet"
      >
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

        {/* O sol gira, com o mesmo `gira` do sol da cena do Papel: as duas caras
            têm cabeçalhos diferentes e o MESMO vocabulário de movimento. */}
        <Vivo vida={{ como: 'gira', cicloMs: 34000, centro: [343, 57] }}>
          <G x={304} y={18}>
            <Circle cx={39} cy={39} r={18} fill={noite ? '#F7E6B5' : '#FFD76A'} />
            <G stroke={noite ? '#F7E6B5' : '#FFD76A'} strokeWidth={4} strokeLinecap="round">
              <Path d="M39 6v8M39 64v8M6 39h8M64 39h8M15 15l6 6M57 57l6 6M63 15l-6 6M21 57l-6 6" />
            </G>
          </G>
        </Vivo>

        {/* A nuvem e a chuva, só quando a chance é de verdade. */}
        {chovendo ? (
          <>
            <Vivo vida={{ como: 'anda', cicloMs: 18000, passo: 6 }}>
              <G x={256} y={48}>
                <Path
                  d="M8 34a14 14 0 0 1 14-13 18 18 0 0 1 34 5 12 12 0 0 1-3 24H22a12 12 0 0 1-14-16z"
                  fill={noite ? color.sunken : '#FFFFFF'}
                />
              </G>
            </Vivo>
            {/* Chuva é a fumaça ao contrário: mesma subida-e-some, altura negativa.
                Um movimento novo para "cai" seria o mesmo mecanismo com outro nome,
                e a lista fechada só cresce quando o mecanismo muda. */}
            <Vivo vida={{ como: 'sobe', cicloMs: 2200, altura: -22 }}>
              <G x={272} y={92} fill="#8EC5FC">
                <Circle cx={10} cy={6} r={3.4} />
                <Circle cx={32} cy={10} r={3.4} />
                <Circle cx={54} cy={6} r={3.4} />
              </G>
            </Vivo>
          </>
        ) : null}

        {/* A fumaça da fábrica: só com tacho aberto. */}
        {running ? (
          <Vivo vida={{ como: 'sobe', cicloMs: 7000, altura: 20 }}>
            <G x={346} y={108} fill={noite ? color.inkFaint : '#FFFFFF'}>
              <Circle cx={9} cy={18} r={5} />
              <Circle cx={14} cy={10} r={4} />
            </G>
          </Vivo>
        ) : null}
      </Svg>
    </View>
  );
}
