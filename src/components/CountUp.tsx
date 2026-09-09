import { useEffect, useRef, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useReduzirMovimento } from './vida';

/**
 * A number that counts up to its value instead of appearing finished.
 *
 * The rule this obeys is the one that keeps motion honest: animation never
 * delays information. The final value is reachable to a screen reader from the
 * first frame, and reduced-motion skips straight to it.
 *
 * Tabular figures are not optional here - without fixed-width digits the column
 * dances on every update and the eye loses its place.
 */
export function CountUp({
  value,
  format,
  style,
}: {
  value: number;
  format: (value: number) => string;
  style?: TextStyle;
}) {
  const { motion } = useTheme();
  /**
   * De onde a próxima corrida parte — e é DAQUI, não de zero.
   *
   * Partir de zero é certo uma vez: na chegada, o número subindo até o valor é o
   * gesto que o dono pediu. Em toda ATUALIZAÇÃO seguinte é defeito, e um defeito que
   * desfaz o cuidado da casa: `useQuery` foi feito para a tela não piscar ao voltar,
   * e o maior número dela descia a R$ 0,00 e subia de novo por mais de um segundo —
   * ao lado de uma comparação ("+22 que ontem") que continuava certa o tempo todo.
   * Ler um número que despenca é ler um susto.
   */
  const [shown, setShown] = useState(value);
  const frame = useRef<number | null>(null);
  const naTela = useRef(value);
  // Do cache do módulo, não uma ida à ponte por montagem — é para isso que
  // `vida.ts` existe, e onze leituras do pacote o furavam.
  const reduzir = useReduzirMovimento();

  useEffect(() => {
    // `null` é "ainda não sei": nele o número aparece pronto, que é o que quem
    // pediu menos movimento quer, e é o que a renderização abaixo faz sem estado.
    if (reduzir !== false) return;

    const from = naTela.current;
    if (from === value) return;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / motion.countMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const agora = Math.round(from + (value - from) * eased);
      naTela.current = agora;
      setShown(agora);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      // Interrompida no meio, a próxima parte de onde o olho parou — `naTela` já
      // guarda isso, e é por ele que a corrida seguinte não dá pulo.
    };
  }, [value, motion.countMs, reduzir]);

  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]} accessibilityLabel={format(value)}>
      {format(reduzir === false ? shown : value)}
    </Text>
  );
}
