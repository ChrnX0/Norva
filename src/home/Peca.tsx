import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Card } from '@/components/Card';
import { Touchable } from '@/components/Touchable';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Um widget da capa que abre no lugar.
 *
 * O dono pediu widgets "dinâmicos e clicáveis", e a primeira versão da capa
 * respondia isso com navegação: tocar levava para outra tela. Não é a mesma
 * coisa e ele estava certo — sair da capa custa a capa. Uma pergunta como
 * "quanto saiu hoje?" tem uma resposta curta que cabe no cartão e uma resposta
 * longa que cabe embaixo dela; navegar para a segunda joga a primeira fora.
 *
 * Então o toque abre, e a tela cheia continua a um toque de distância DENTRO da
 * peça aberta. Duas coisas seguem disso, e as duas são de propósito:
 *
 *   - **Uma peça aberta por vez.** Duas abertas empurram o resto para fora da
 *     tela, e a capa deixa de ser capa. Abrir uma fecha a outra sozinha.
 *   - **Peça sem mais nada a dizer não convida.** Sem `mais`, não há seta e o
 *     toque não faz nada — botão que não obedece é pior que botão ausente.
 */
export function Peca({
  index,
  hue,
  tone,
  icon,
  title,
  aberta,
  onToggle,
  children,
  mais,
}: {
  index?: number;
  hue?: string;
  tone?: 'plain' | 'area' | 'warning';
  /**
   * O crachá do assunto. Obrigatório, ao contrário do `Card`.
   *
   * Peça é sempre um assunto da capa — "as perdas", "o dinheiro parado" — e um
   * assunto sem desenho vira mais um parágrafo cinza, que é o que o dono
   * recusou. O cartão cru continua podendo não ter ícone; a peça, não.
   */
  icon: (color: string) => ReactNode;
  title?: string;
  aberta: boolean;
  onToggle: () => void;
  /** O resumo, que é o que a capa mostra fechada. */
  children: ReactNode;
  /** O detalhe, que só existe depois do toque. Ausente: a peça não abre. */
  mais?: ReactNode;
}) {
  const { color, type, space } = useTheme();
  const { t } = useLocale();

  /**
   * A abertura, como um gesto e não como um pulo.
   *
   * O detalhe sobe de baixo e assenta, e a seta gira junto — as duas coisas na
   * mesma mola, para o olho entender que são o mesmo movimento. Sem isso o
   * conteúdo aparece de uma vez e a tela dá um salto: funciona e parece defeito.
   *
   * `aberto` vale 0 fechado e 1 aberto; toda a animação sai dele, então não
   * existe estado intermediário inventado em lugar nenhum.
   */
  const aberto = useSharedValue(aberta ? 1 : 0);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      aberto.value = reduced
        ? aberta
          ? 1
          : 0
        : withSpring(aberta ? 1 : 0, { damping: 18, stiffness: 180 });
    });
    return () => {
      cancelled = true;
    };
  }, [aberta, aberto]);

  const detalhe = useAnimatedStyle(() => ({
    opacity: aberto.value,
    transform: [{ translateY: (1 - aberto.value) * -10 }],
  }));
  const seta = useAnimatedStyle(() => ({
    transform: [{ rotate: `${aberto.value * 180}deg` }],
  }));

  const corpo = (
    <Card hue={hue} tone={tone} icon={icon} title={title}>
      {children}
      {mais && aberta ? (
        <Animated.View style={[{ marginTop: space.md, gap: space.sm }, detalhe]}>{mais}</Animated.View>
      ) : null}
      {mais ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
          {/* A seta gira na mesma mola do detalhe: é o mesmo gesto, dito duas
              vezes, e é o que faz a peça parecer uma coisa em vez de duas. */}
          <Animated.Text style={[type.caption, { color: color.inkFaint }, seta]}>▾</Animated.Text>
          <Text style={[type.caption, { color: color.inkFaint }]}>
            {aberta ? t.app.home.less : t.app.home.more}
          </Text>
        </View>
      ) : null}
    </Card>
  );

  if (!mais) return <Entrada index={index}>{corpo}</Entrada>;

  return (
    <Entrada index={index}>
      <Touchable onPress={onToggle} accessibilityLabel={title ?? ''}>
        {corpo}
      </Touchable>
    </Entrada>
  );
}

/**
 * A entrada escalonada da peça na capa.
 *
 * Começa VISÍVEL e sobe para o lugar, nunca em opacidade zero: se o caminho da
 * animação falhar — plugin de worklets fora do babel, biblioteca não carregando
 * no navegador —, o pior caso é a peça aparecer sem o gesto. Uma capa em branco
 * com o banco cheio é o pior defeito possível numa fábrica, e já foi a razão de
 * o `Reveal` nascer assim.
 */
function Entrada({ index = 0, children }: { index?: number; children: ReactNode }) {
  const { motion } = useTheme();
  const chegou = useSharedValue(1);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      chegou.value = 0;
      chegou.value = withTiming(1, { duration: 320 + index * motion.staggerMs });
    });
    return () => {
      cancelled = true;
    };
  }, [chegou, index, motion.staggerMs]);

  const estilo = useAnimatedStyle(() => ({
    opacity: 0.2 + chegou.value * 0.8,
    transform: [{ translateY: (1 - chegou.value) * 14 }],
  }));

  return <Animated.View style={estilo}>{children}</Animated.View>;
}
