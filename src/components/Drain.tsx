import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { tint } from '@/components/Card';
import { useTheme } from '@/theme/ThemeProvider';
import { useReduzirMovimento } from './vida';
import { redeDaEntrada } from './chegada';

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

  // Do cache do módulo — `vida.ts` existe para esta resposta não custar uma ida
  // à ponte por montagem, e onze leituras do pacote o furavam. `null` é "ainda não
  // sei", e nele o desenho fica no lugar de REPOUSO: quem pediu menos movimento
  // nunca vê a peça pela metade esperando a promessa voltar.
  const reduzir = useReduzirMovimento();

  const cheia = useSharedValue(reduzir === false ? 0 : 1);

  useEffect(() => {
    if (reduzir !== false) {
      cheia.value = 1;
      return;
    }
    cheia.value = 0;
    cheia.value = withDelay(90, withSpring(1, motion.settle));
    return redeDaEntrada(() => {
      cheia.value = 1;
    }, 90);
  }, [cheia, motion.settle, preso, reduzir]);

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
