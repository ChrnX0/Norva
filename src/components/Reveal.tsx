import { type ReactNode, useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { useReduzirMovimento } from './vida';

/**
 * O cartão entra em cena em vez de já estar lá.
 *
 * O dono abriu o aplicativo publicado e disse a coisa mais difícil de responder
 * com teste: *"o app todo estático, sem animação e nem graça nenhuma"*. E ele
 * estava certo de um jeito que o repositório já sabia — `motion.settle`,
 * `motion.staggerMs` e `motion.pressScale` estão em `tokens.ts` desde o começo,
 * documentados com cinco regras, e **nada** os usava fora do `PulseDot`. O
 * sistema de movimento existia no papel.
 *
 * A entrada é curta e uma vez só: sobe catorze pixels e aparece, com a mola
 * `settle` que o resto do desenho já declarava. O escalonamento por índice é o
 * que faz a tela parecer montada em vez de piscada — quarenta milissegundos
 * entre um cartão e o próximo, que é abaixo do que se percebe como espera e
 * acima do que se percebe como simultâneo.
 *
 * Duas regras da casa mandam aqui, e as duas custam mais do que parecem:
 *
 * **Movimento nunca atrasa informação.** A leitura de tela recebe o conteúdo
 * montado desde o primeiro quadro; a animação é da caixa, não do texto.
 *
 * **Reduzir movimento apaga tudo e a tela continua inteira.** Quem liga a
 * opção do sistema não recebe uma versão pela metade: recebe a mesma tela,
 * parada.
 */
export function Reveal({
  index = 0,
  children,
  style,
  escala = true,
}: {
  /** A posição na pilha. É o que escalona a entrada. */
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Se a chegada CRESCE — e há um caso em que ela não pode.
   *
   * A peça que sangra de borda a borda (o herói da capa) entrando a 0,965 mostra a
   * cor da página nas laterais e no topo durante a animação: em vez de subir, ela
   * parece descolar do fundo. Para tudo o que tem margem, crescer é metade do que
   * faz a chegada parecer chegada, e o padrão continua sendo sim.
   */
  escala?: boolean;
}) {
  const { motion } = useTheme();

  // Começa em 1, não em 0, e isso é uma decisão de segurança, não de estilo.
  //
  // Se o valor inicial fosse invisível, qualquer falha no caminho da animação
  // — o plugin de worklets fora do babel, a biblioteca não carregando no
  // navegador — deixaria a capa em branco com o banco cheio de dado. Uma tela
  // vazia por causa de enfeite é o pior defeito possível numa fábrica.
  // Começando visível, o pior caso é a tela aparecer sem a entrada.
  // A resposta vem do cache do módulo, e é isso que tira o pulo para trás.
  //
  // Antes, cada `Reveal` perguntava ao sistema por conta própria: o cartão era
  // pintado no LUGAR DE CHEGADA, a promessa resolvia um quadro depois, e só então
  // ele saltava para o ponto de partida e subia. Vinte e seis dp de salto para
  // trás, em cada cartão, sempre — e o defeito piora exatamente na proporção em
  // que a amplitude sobe, que foi o que esta rodada fez.
  //
  // `useReduzirMovimento` guarda a resposta no módulo, então da segunda tela em
  // diante ela já está em memória no primeiro render e o valor inicial pode ser o
  // ponto de partida. Só a primeiríssima montagem do aplicativo ainda paga o
  // salto, e ela é a única em que ninguém está olhando um cartão específico.
  const reduzido = useReduzirMovimento();

  // Começa em 1 enquanto NÃO SE SABE, e isso continua sendo segurança e não
  // estilo: se o caminho da animação falhar — plugin de worklets fora do babel,
  // biblioteca não carregando no navegador — o pior caso é a tela aparecer sem a
  // entrada, e nunca uma tela em branco com o banco cheio de dado.
  const shown = useSharedValue(reduzido === false ? 0 : 1);

  useEffect(() => {
    if (reduzido !== false) {
      shown.value = 1;
      return;
    }
    shown.value = 0;
    shown.value = withDelay(index * motion.staggerMs, withSpring(1, motion.settle));
  }, [index, motion.settle, motion.staggerMs, reduzido, shown]);

  // Sobe, cresce e aparece. As três juntas porque uma só não é chegada: subir sem
  // crescer lê como rolagem, crescer sem subir lê como estouro, e a opacidade
  // sozinha é o cartão nascendo já no lugar — que é exatamente o "aparece pronto
  // e imóvel" que o dono recusou.
  const entrance = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateY: (1 - shown.value) * motion.riseDp },
      { scale: escala ? motion.enterScale + (1 - motion.enterScale) * shown.value : 1 },
    ],
  }));

  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
}
