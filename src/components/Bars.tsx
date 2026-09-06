import { useEffect } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { tint } from '@/components/Card';
import { useTheme } from '@/theme/ThemeProvider';

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
  const grown = useSharedValue(0);

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
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      grown.value = reduced ? 1 : withDelay(120, withSpring(1, { damping: 16, stiffness: 120 }));
    });
    return () => {
      cancelled = true;
    };
  }, [grown]);

  const peak = Math.max(...series.map((d) => d.total), 1);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, marginTop: space.md }}>
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
            <View
              style={[
                { height, justifyContent: 'flex-end', width: '100%' },
                // A faixa de base do Orgânico: a colina em que as colunas pisam.
                organico
                  ? {
                      borderBottomWidth: 6,
                      borderBottomColor: tint(hue ?? accent, scheme === 'dark' ? 0.16 : 0.22),
                    }
                  : null,
              ]}
            >
              <Column
                share={share}
                grown={grown}
                height={organico ? height - 6 : height}
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
  );
}

function Column({
  share,
  grown,
  height,
  color,
  raio = 4,
  brilho = null,
}: {
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
  // O piso de três pixels é o que faz um dia parado continuar sendo um dia:
  // sem ele a coluna zerada desaparece e a semana ganha um buraco que ninguém
  // sabe ler.
  const grow = useAnimatedStyle(() => ({
    height: Math.max(3, share * height * grown.value),
  }));

  // A auréola cresce junto com a coluna, e o gancho dela mora AQUI, incondicional.
  // Estava dentro do `brilho ? ... : null` do desenho — um gancho que entra e sai
  // conforme a cor, que é a ordem de ganchos mudando entre renderizações. No
  // claro (sem auréola) para o escuro (com) o React perde o alinhamento da lista
  // e o que quebra não é esta coluna: é o estado da tela inteira.
  const auréola = useAnimatedStyle(() => ({
    height: Math.max(3, share * height * grown.value) + 8,
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
