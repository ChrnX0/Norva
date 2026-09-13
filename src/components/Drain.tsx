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
 *
 * **E o quinto do horizonte é uma régua de DESENHO, não a decisão** — por isso quem
 * tem a decisão na mão passa `avisa`. O cartão de cobertura pintava de alerta a um
 * quinto de trinta dias, ou seja a seis dias de estoque, enquanto o dia de comprar
 * daquele insumo é o prazo do fornecedor mais a folga da empresa: com fornecedor de
 * seis dias, o aviso dizia "compre" a oito e a barra só ficava vermelha a seis. Quem
 * sabe o dia de comprar é o domínio (`precisaComprar`), e a cor passa a dizer a mesma
 * coisa que o número ao lado em vez de uma terceira régua escondida num componente.
 */
export function Drain({
  share,
  hue,
  height = 6,
  avisa,
}: {
  /** Quanto resta, de zero a um. Fora da faixa é preso na faixa. */
  share: number;
  hue?: string;
  height?: number;
  /**
   * Se ISTO é hora de decidir, quando quem chama sabe responder.
   *
   * Sem resposta vale o quinto do horizonte, que é a régua de desenho para as
   * perguntas sem decisão cadastrada (quantos dias faltam para o lote vencer).
   */
  avisa?: boolean;
}) {
  const { accent, color, motion } = useTheme();
  const preso = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  const cor = (avisa ?? preso <= 0.2) ? color.warning : (hue ?? accent);

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
    // `preso` NÃO está aqui de propósito: ele é derivado do dado, e com ele na lista toda
    // atualização de `share` zerava a barra e refazia a entrada inteira — 90 ms parada em
    // zero e uma mola por cima, num número que só mudou de 41% para 43%. A largura lê
    // `preso` dentro do estilo animado e acompanha o dado novo sem gesto nenhum.
  }, [cheia, motion.settle, reduzir]);

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
