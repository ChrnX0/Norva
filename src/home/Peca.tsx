import { useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useReduzirMovimento } from '@/components/vida';
import { Card } from '@/components/Card';
import { Touchable } from '@/components/Touchable';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { redeDaEntrada } from '@/components/chegada';
import { assentamentoMs } from '@/theme/tokens';

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

  // A resposta vem do CACHE do módulo, não de uma ida à ponte por montagem.
  //
  // `vida.ts` existe para isso e o docblock dele diz por quê — *"vinte e seis glifos
  // perguntando ao sistema, cada um na sua montagem, é vinte e seis idas ao módulo
  // nativo para responder a mesma coisa"*. Onze leituras no pacote furavam o cache; a
  // auditoria de 9 de setembro contou. Aqui o `null` é o "ainda não sei", e nele a
  // gaveta assume o estado final sem gesto — que é o que quem pediu menos movimento
  // quer de qualquer jeito.
  const reduzir = useReduzirMovimento();

  useEffect(() => {
    const destino = aberta ? 1 : 0;
    if (reduzir !== false) {
      aberto.value = destino;
      return;
    }
    aberto.value = withSpring(destino, { damping: 18, stiffness: 180 });
    return redeDaEntrada(
      () => {
        aberto.value = destino;
      },
      0,
      assentamentoMs({ damping: 18, stiffness: 180, mass: 1 }),
    );
  }, [aberta, aberto, reduzir]);

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

  // Sem entrada própria: quem escalona é a FILA da capa (`src/home/Mosaic.tsx`), com
  // o índice sendo a posição de leitura. Havia aqui uma cópia privada do `Reveal`,
  // parada na amplitude de antes de 6 de setembro — 14 dp contra 26, sem a mola nem
  // a escala de entrada, com o escalonamento na DURAÇÃO em vez do atraso (todas as
  // peças partindo juntas e só terminando em tempos diferentes), e perguntando ao
  // sistema por reduzir-movimento em cada montagem em vez de usar o cache. O pior
  // dela era o que o próprio `Reveal` documenta ter consertado: pintava o cartão no
  // lugar de chegada, resolvia a promessa um quadro depois, e só então saltava para
  // trás para subir. Cinco das oito peças da capa faziam isso.
  if (!mais) return corpo;

  return (
    <Touchable onPress={onToggle}>
      {corpo}
    </Touchable>
  );
}

