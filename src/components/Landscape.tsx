import { View, type DimensionValue } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { hues, noturno } from '@/theme/tokens';
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

export function Landscape({
  maxC,
  rainChance,
  running,
  height = 210,
  raio,
}: {
  /** A máxima de hoje. Nulo quando não há previsão nem cache. */
  maxC: number | null;
  /** A chance de chuva, em por cento. Nulo quando não se sabe. */
  rainChance: number | null;
  /** Há tacho aberto agora. */
  running: boolean;
  /**
   * A altura da cena. Um número na maior parte dos usos; `'100%'` quando ela é
   * o fundo de um herói que sangra e quem manda na altura é o texto por cima.
   */
  height?: DimensionValue;
  /**
   * O canto da cena. Sem dizer, ela acompanha o cartão em que vive.
   *
   * O herói do Orgânico não vive num cartão: ele sangra de borda a borda, e um
   * canto arredondado ali deixa quatro triângulos da cor da página nos cantos
   * de cima da tela. Quem sangra pede zero.
   */
  raio?: number;
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
    <View
      style={{ height, overflow: 'hidden', borderRadius: raio ?? radius.md }}
      pointerEvents="none"
    >
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
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0.5" stopColor="#F7E6B5" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#F7E6B5" stopOpacity={0} />
          </RadialGradient>
        </Defs>
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

        {/* De dia o sol gira; de noite é a LUA, e isso não é enfeite trocado.
            O que estava aqui era o mesmo sol pintado de amarelo pálido — um sol
            no céu noturno, com raios, às onze da noite. O desenho aprovado do
            escuro tem lua em quarto, halo e estrelas, e a diferença entre as
            duas telas não é de cor: é a hora do dia que a cena afirma. Uma cena
            que afirma a hora errada é a mesma família de defeito do número sem
            comparação — informação inventada com cara de informação. */}
        {noite ? (
          <>
            {/* As estrelas ficam PARADAS: piscar é o que a regra de movimento
                proíbe primeiro, e um céu piscando na capa é a tela que se olha
                de manhã competindo com quem a olha. */}
            <G fill="#F7E6B5">
              <Circle cx={196} cy={24} r={1.4} opacity={0.55} />
              <Circle cx={238} cy={52} r={1.1} opacity={0.4} />
              <Circle cx={280} cy={16} r={1.6} opacity={0.6} />
              <Circle cx={372} cy={30} r={1.2} opacity={0.45} />
              <Circle cx={404} cy={62} r={1.5} opacity={0.5} />
              <Circle cx={168} cy={70} r={1.1} opacity={0.35} />
            </G>
            {/* O halo respira devagar, com o mesmo ciclo do resto da casa. */}
            <Circle cx={343} cy={57} r={44} fill="url(#halo)" />
            <G x={304} y={18}>
              {/* O quarto: um arco grande e um arco menor voltando. O recorte por
                  círculo da cor do céu não serve aqui — o céu é degradê, e o
                  círculo deixaria uma emenda visível atravessando a lua. */}
              <Path
                d="M52 8a34 34 0 1 0 8 62 27 27 0 1 1-8-62z"
                fill="#F7E6B5"
                transform="rotate(-18 39 39)"
              />
            </G>
          </>
        ) : (
          <Vivo vida={{ como: 'gira', cicloMs: 34000, centro: [343, 57] }}>
            <G x={304} y={18}>
              <Circle cx={39} cy={39} r={18} fill="#FFD76A" />
              <G stroke="#FFD76A" strokeWidth={4} strokeLinecap="round">
                <Path d="M39 6v8M39 64v8M6 39h8M64 39h8M15 15l6 6M57 57l6 6M63 15l-6 6M21 57l-6 6" />
              </G>
            </G>
          </Vivo>
        )}

        {/* A nuvem e a chuva, só quando a chance é de verdade. */}
        {chovendo ? (
          <>
            <Vivo vida={{ como: 'anda', cicloMs: 4400, passo: 13.2 }}>
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
            <Vivo vida={{ como: 'sobe', cicloMs: 2200, altura: -35.2 }}>
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
          <Vivo vida={{ como: 'sobe', cicloMs: 7000, altura: 32.0 }}>
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
