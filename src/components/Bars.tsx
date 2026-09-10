import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { tint } from '@/components/Card';
import { useTheme } from '@/theme/ThemeProvider';
import { useCiclo, useReduzirMovimento } from './vida';
import { redeDaEntrada } from './chegada';
import { assentamentoMs } from '@/theme/tokens';

/**
 * O ritmo da semana, em sete colunas.
 *
 * É a primeira coisa que a capa passa a responder e nunca respondia: **o que é
 * normal aqui**. O número de hoje sozinho não diz se o dia foi bom — 400
 * picolés numa fábrica que faz 380 todo dia é rotina, e numa que faz 1.200 é
 * uma parada de manutenção que ninguém avisou.
 *
 * A altura é relativa ao maior dia da própria semana, não a uma meta: fábrica
 * nenhuma tem meta cadastrada aqui, e inventar uma régua para o desenho ficar
 * bonito seria número que ninguém pode conferir. O dia de hoje leva a cor da
 * área; os outros ficam em traço neutro, para o olho achar o presente sem ler
 * nada.
 *
 * Coluna de dia parado é um risco, não um vazio: zero é um fato sobre a
 * fábrica, e some-lo do desenho contaria uma semana que não aconteceu.
 */
/** A espessura da faixa de base do Orgânico — o chão das colunas. */
const FAIXA = 6;

export function Bars({
  series,
  labels,
  hue,
  height = 56,
}: {
  /** Sete dias, do mais antigo para hoje. */
  series: readonly { date: string; total: number }[];
  /** A inicial de cada dia da semana, já no idioma da tela. */
  labels: readonly string[];
  /** A cor do dia de hoje. Sem ela, a da área. */
  hue?: string;
  height?: number;
}) {
  const { color, accent, space, type, tracos, scheme } = useTheme();
  // Do cache do módulo — `vida.ts` existe para esta resposta não custar uma ida
  // à ponte por montagem, e onze leituras do pacote o furavam. `null` é "ainda não
  // sei", e nele o desenho fica no lugar de REPOUSO: quem pediu menos movimento
  // nunca vê a peça pela metade esperando a promessa voltar.
  const reduzir = useReduzirMovimento();

  const grown = useSharedValue(reduzir === false ? 0 : 1);

  /**
   * As duas caras da mesma semana.
   *
   * Numa pele de página a coluna é um bloco de canto quase reto, como
   * tipografia. Numa pele de superfície — o Orgânico aprovado
   * (docs/design/aprovados/organico-*.jpg) — ela é um comprimido
   * de canto largo sobre uma faixa de base, e a coluna de HOJE carrega um ponto
   * em cima — o sol de dia, a lua à noite — que é o mesmo astro da paisagem
   * acima dela. Não é enfeite: é o que faz o olho achar hoje sem ler o rótulo,
   * e é a mesma marca nos dois lugares em que "hoje" aparece na capa.
   */
  const organico = tracos.genero === 'superficie';
  const astro = scheme === 'dark' ? '#F7E6B5' : '#FFD76A';

  useEffect(() => {
    if (reduzir !== false) {
      grown.value = 1;
      return;
    }
    grown.value = 0;
    grown.value = withDelay(120, withSpring(1, { damping: 16, stiffness: 120 }));
    return redeDaEntrada(
      () => {
        grown.value = 1;
      },
      120,
      assentamentoMs({ damping: 16, stiffness: 120, mass: 1 }),
    );
  }, [grown, reduzir]);

  const peak = Math.max(...series.map((d) => d.total), 1);

  return (
    <View style={{ marginTop: space.md }}>
      {/* A faixa de base é UMA, atrás das sete colunas — a colina em que elas
          pisam. Ela era um `borderBottom` por coluna, e o `gap` entre elas a
          picava em sete pedaços: na foto sai uma linha tracejada onde o desenho
          aprovado tem um chão. Coisa contínua não se desenha em pedaços que o
          espaçamento separa. */}
      {organico ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            // No pé das COLUNAS: o rótulo do dia fica abaixo dela.
            bottom: type.caption.lineHeight + space.xs,
            height: FAIXA,
            borderRadius: FAIXA / 2,
            backgroundColor: tint(hue ?? accent, scheme === 'dark' ? 0.16 : 0.22),
          }}
        />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs }}>
      {series.map((day, i) => {
        const share = day.total / peak;
        const today = i === series.length - 1;
        return (
          <View key={day.date} style={{ flex: 1, alignItems: 'center', gap: space.xs }}>
            {/* O astro sobre a coluna de hoje. Espaço reservado nas outras, para
                as sete colunas nascerem da mesma linha de base. */}
            {organico ? (
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: today ? astro : 'transparent',
                }}
              />
            ) : null}
            <View style={{ height, justifyContent: 'flex-end', width: '100%' }}>
              <Column
                index={i}
                share={share}
                grown={grown}
                height={organico ? height - FAIXA : height}
                color={today ? (hue ?? accent) : tint(hue ?? accent, organico ? 0.22 : 0.28)}
                raio={organico ? 10 : 4}
                brilho={organico && today && scheme === 'dark' ? hue ?? accent : null}
              />
            </View>
            <Text
              style={[
                type.caption,
                { color: today ? color.ink : color.inkFaint, fontVariant: ['tabular-nums'] },
              ]}
            >
              {labels[i]}
            </Text>
          </View>
        );
      })}
      </View>
    </View>
  );
}

function Column({
  index,
  share,
  grown,
  height,
  color,
  raio = 4,
  brilho = null,
}: {
  /** A posição na semana — é ela que defasa a respiração de uma coluna para a outra. */
  index: number;
  share: number;
  grown: SharedValue<number>;
  height: number;
  color: string;
  /** O canto: reto no Papel, comprimido no Orgânico. */
  raio?: number;
  /**
   * A auréola da coluna de hoje no escuro — o desenho aprovado a faz brilhar.
   * Uma segunda caixa translúcida por trás, e não sombra: sombra no Android é
   * `elevation`, que é cinza e cai para baixo, e o que se quer é luz em volta.
   */
  brilho?: string | null;
}) {
  /**
   * A respiração da coluna — pedido do dono, 6 de setembro, apontando a semana,
   * o pote e o sol: *"quero todos eles seguindo o estilo de animação constante q
   * a gente adotou para a fábrica do topo. algo bem suave."*
   *
   * Dois por cento de amplitude e cinco segundos e meio de volta, defasados de
   * 340 ms entre colunas vizinhas — o que faz a semana ondular como uma coisa só
   * em vez de sete retângulos pulsando juntos, que é a diferença entre respirar
   * e piscar.
   *
   * **E ela nunca mexe no que o número diz.** A altura verdadeira é `share`; a
   * respiração multiplica em volta de 1 e a média do ciclo é exatamente 1. Um
   * ambiente que alterasse a leitura seria a pior coisa que esta tela poderia
   * fazer — a coluna de terça ficaria maior que a de quinta por estar no tempo
   * certo do ciclo.
   */
  const respiro = useCiclo(5400, { feitio: 'vaivem', atrasoMs: index * 340, repouso: 0.5 });

  // O piso de três pixels é o que faz um dia parado continuar sendo um dia:
  // sem ele a coluna zerada desaparece e a semana ganha um buraco que ninguém
  // sabe ler.
  const grow = useAnimatedStyle(() => ({
    height: Math.max(3, share * height * grown.value * (0.98 + 0.04 * respiro.value)),
  }));

  // A auréola cresce junto com a coluna, e o gancho dela mora AQUI, incondicional.
  // Estava dentro do `brilho ? ... : null` do desenho — um gancho que entra e sai
  // conforme a cor, que é a ordem de ganchos mudando entre renderizações. No
  // claro (sem auréola) para o escuro (com) o React perde o alinhamento da lista
  // e o que quebra não é esta coluna: é o estado da tela inteira.
  const auréola = useAnimatedStyle(() => ({
    height: Math.max(3, share * height * grown.value * (0.98 + 0.04 * respiro.value)) + 8,
  }));

  return (
    <View style={{ width: '100%', justifyContent: 'flex-end' }}>
      {brilho ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: -4,
              right: -4,
              bottom: -4,
              borderRadius: raio + 4,
              backgroundColor: tint(brilho, 0.22),
            },
            auréola,
          ]}
        />
      ) : null}
      <Animated.View style={[{ width: '100%', borderRadius: raio, backgroundColor: color }, grow]} />
    </View>
  );
}
