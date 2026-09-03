import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { tint } from '@/components/Card';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Quanto ainda resta, como uma barra que ENCHE até onde deveria estar.
 *
 * Serve para as duas perguntas que a capa faz sobre tempo: quantos dias o
 * estoque dura, e quantos dias faltam para um lote vencer. As duas têm a mesma
 * forma — uma fração de um horizonte — e nenhuma delas tem meta cadastrada, então
 * o horizonte é dito por quem chama, e a barra nunca inventa régua.
 *
 * A cor não é decoração: abaixo de um quinto do horizonte ela vira o tom de
 * alerta, porque é aí que a informação muda de "normal" para "decida hoje". Só
 * que a barra continua existindo cheia — sumir com o desenho no estado bom faria
 * o cartão pular de forma quando a fábrica está bem, que é justamente quando
 * ninguém quer susto.
 */
export function Drain({
  share,
  hue,
  height = 6,
}: {
  /** Quanto resta, de zero a um. Fora da faixa é preso na faixa. */
  share: number;
  hue?: string;
  height?: number;
}) {
  const { accent, color, motion } = useTheme();
  const preso = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  const cor = preso <= 0.2 ? color.warning : (hue ?? accent);

  const cheia = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      cheia.value = reduced ? 1 : withDelay(90, withSpring(1, motion.settle));
    });
    return () => {
      cancelled = true;
    };
  }, [cheia, motion.settle, preso]);

  const largura = useAnimatedStyle(() => ({
    width: `${Math.max(2, preso * 100 * cheia.value)}%`,
  }));

  return (
    <View
      style={{
        height,
        borderRadius: height,
        backgroundColor: tint(cor, 0.18),
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: cor }, largura]} />
    </View>
  );
}
