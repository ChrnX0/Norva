import { useEffect } from 'react';
import { View } from 'react-native';
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
import { useReduzirMovimento } from './vida';
import { redeDaEntrada } from './chegada';
import { assentamentoMs } from '@/theme/tokens';

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
}: {
  values: readonly number[];
  hue?: string;
  width?: number;
  height?: number;
}) {
  const { accent, motion, tracos, traco } = useTheme();
  // O gesto tem a duração de um traço de mão: rápido o bastante para não atrasar
  // a leitura, lento o bastante para o olho ver a linha nascer.
  const desenho = motion.countMs;
  const cor = hue ?? accent;

  const points = sparkPoints(values, width, height, traco + 1);
  const line = sparkPath(points);
  /**
   * O Papel não tem massa — nem aqui.
   *
   * O degradê sob a curva é vocabulário do Orgânico, e ele sobreviveu à
   * conversão da tela de Relatórios porque a `Sparkline` era um dos componentes
   * que não sabiam que o aplicativo tem duas caras. Na foto do Papel ele aparece
   * como uma mancha azul clara debaixo de uma linha fina, no meio de uma página
   * de serifa e régua: exatamente o "bloco pastel dentro do Papel" que o dono
   * circulou nos cartões.
   *
   * A regra do `Coluna` diz onde massa é legítima no Papel — quando ela é o
   * conteúdo MEDIDO dentro de uma forma fechada, como o líquido do termômetro.
   * A área sob uma curva não mede nada que a curva já não diga: é sombra.
   */
  const area = tracos.genero === 'pagina' ? null : sparkArea(points, height);
  const last = points[points.length - 1];

  // O comprimento do traço não precisa ser exato: qualquer valor maior que a
  // curva esconde o traço inteiro, e a curva nunca passa da diagonal da caixa
  // vezes o número de segmentos.
  const length = Math.ceil(Math.hypot(width, height) * Math.max(1, points.length));

  // Do cache do módulo — `vida.ts` existe para esta resposta não custar uma ida
  // à ponte por montagem, e onze leituras do pacote o furavam. `null` é "ainda não
  // sei", e nele o desenho fica no lugar de REPOUSO: quem pediu menos movimento
  // nunca vê a peça pela metade esperando a promessa voltar.
  const reduzir = useReduzirMovimento();

  const drawn = useSharedValue(reduzir === false ? 0 : 1);
  const settled = useSharedValue(reduzir === false ? 0 : 1);

  useEffect(() => {
    if (reduzir !== false) {
      drawn.value = 1;
      settled.value = 1;
      return;
    }
    drawn.value = 0;
    settled.value = 0;
    drawn.value = withTiming(1, { duration: desenho });
    settled.value = withDelay(desenho, withSpring(1, { damping: 14, stiffness: 160 }));
    return redeDaEntrada(
      () => {
        drawn.value = 1;
        settled.value = 1;
      },
      desenho,
      assentamentoMs({ damping: 14, stiffness: 160, mass: 1 }),
    );
  }, [drawn, settled, desenho, line, reduzir]);

  // `risco`, não `traco`: desde que a espessura virou `useTheme().traco`, a
  // palavra tem dono no projeto inteiro, e duas coisas com o mesmo nome no mesmo
  // vocabulário é como a divergência começa. Aqui é a linha sendo DESENHADA.
  const risco = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - drawn.value),
  }));
  /**
   * O pingo cresce, e NÃO desbota — a entrada mexe forma, nunca opacidade.
   *
   * `opacity: settled.value` estava aqui e é a regra que `Reveal.test.ts` existe para
   * impor, com a razão medida: em 10 de setembro o cabeçalho da ficha técnica abriu
   * como 170 dp de papel puro porque uma mola ficou em zero, **com a rede da entrada no
   * lugar**. Opacidade zero é o mesmo pixel que "não desenhado", e a rede não bastou.
   *
   * Tirar a opacidade não muda o que se vê: um círculo de raio zero já é invisível, e o
   * crescimento continua sendo a entrada. O que muda é a pior falha possível — um pingo
   * pequeno em vez de um pingo ausente.
   *
   * A guarda não via isto porque lia só o PRIMEIRO valor de entrada do arquivo, e aqui
   * são dois (`drawn` e `settled`). Consertada na mesma rodada.
   */
  const pingo = useAnimatedProps(() => ({
    r: 3.2 * settled.value,
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
          strokeWidth={traco}
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
