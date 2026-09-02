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
  const { color, accent, space, type } = useTheme();
  const grown = useSharedValue(0);

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
            <View style={{ height, justifyContent: 'flex-end', width: '100%' }}>
              <Column
                share={share}
                grown={grown}
                height={height}
                color={today ? (hue ?? accent) : tint(hue ?? accent, 0.28)}
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
}: {
  share: number;
  grown: SharedValue<number>;
  height: number;
  color: string;
}) {
  // O piso de três pixels é o que faz um dia parado continuar sendo um dia:
  // sem ele a coluna zerada desaparece e a semana ganha um buraco que ninguém
  // sabe ler.
  const grow = useAnimatedStyle(() => ({
    height: Math.max(3, share * height * grown.value),
  }));

  return <Animated.View style={[{ width: '100%', borderRadius: 4, backgroundColor: color }, grow]} />;
}
