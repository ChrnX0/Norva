import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { useNaTela, useReduzirMovimento } from './vida';

/**
 * The "this is live" pulse: a slow halo expanding out of a dot.
 *
 * Four rules govern it, and they matter more than the animation itself:
 *   - it never blinks; the cycle is 2.6s, because blinking is aggressive and
 *     users learn to tune it out
 *   - how many pulse at once is decided by how many things are actually
 *     happening, never by a quota; what bounds it in practice is the battery of
 *     a phone that stays on all shift, not a number somebody picked
 *   - it only goes next to a number that is genuinely updating - a pulse beside
 *     a frozen value is a visual lie, and people notice
 *   - reduced-motion turns it off and the dot stays, fully legible
 */
/**
 * `live` has no default, and that is the point.
 *
 * The third rule above was written here and broken by the first caller: the home
 * screen pulsed every product card, including the ones whose cost had not moved
 * in weeks. Nothing caught it because the component had no way to say "not
 * live" - honouring the rule meant remembering not to render it at all, and
 * remembering is not a mechanism.
 *
 * Required, the fact has to be stated at every call site, and a screen that
 * cannot say whether its number is moving fails to compile instead of lying
 * quietly to whoever is holding the phone.
 */
export function PulseDot({
  live,
  color,
  size = 10,
}: {
  live: boolean;
  color?: string;
  size?: number;
}) {
  const { accent, motion } = useTheme();
  const tint = color ?? accent;
  const progress = useSharedValue(0);

  // Do cache do módulo — `vida.ts` existe para esta resposta não custar uma ida
  // à ponte por montagem, e onze leituras do pacote o furavam. `null` é "ainda não
  // sei", e nele o desenho fica no lugar de REPOUSO: quem pediu menos movimento
  // nunca vê a peça pela metade esperando a promessa voltar.
  const reduzir = useReduzirMovimento();
  /**
   * **E ele para quando a tela sai de vista — cicatriz de 10 de setembro.**
   *
   * O motivo escrito da exceção deste arquivo diz que o halo *"só corre quando existe
   * trabalho vivo para anunciar"*. Isso fala do `live`, não de estar À VISTA — e a
   * diferença apareceu no dia de uma âncora de rota que montava a capa debaixo de toda
   * tela aberta por ligação profunda: o halo seguia pulsando numa tela que ninguém vê,
   * e o navegador nunca considerava a página estável. A medida foi de uma variável só:
   * com a âncora, a checagem da nota estourava o clique por 30 s com a máquina parada;
   * sem a âncora, passava.
   *
   * **A âncora não existe mais** (item 33 do `docs/roadmap.md`) e esta parada fica,
   * porque a navegação por abas deixa tela montada e sem foco sem precisar de âncora
   * nenhuma. O custo real nunca foi o teste — é CPU num aparelho que este projeto já
   * mediu saturando a thread de UI.
   */
  const naTela = useNaTela();

  useEffect(() => {

    // Going still has to undo the animation, not just stop starting it: leaving
    // the halo wherever the last frame put it reads as a dot with a permanent
    // ring around it, which is the same lie in a different shape.
    if (!live || !naTela) {
      progress.value = 0;
      return;
    }

    if (reduzir !== false) return;
    progress.value = withRepeat(
      withTiming(1, { duration: motion.pulseMs, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [live, naTela, motion.pulseMs, progress, reduzir]);

  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 1.9 }],
    opacity: 0.55 * (1 - Math.min(1, progress.value / 0.7)),
  }));

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, backgroundColor: tint },
          halo,
        ]}
      />
      <View
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: tint }]}
      />
    </View>
  );
}
