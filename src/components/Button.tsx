import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { TINTA_CLARA, TINTA_ESCURA, mistura, tintaSobre } from '@/theme/contraste';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The primary action.
 *
 * One per screen, labelled with a verb, sitting within thumb reach. Press
 * responds with a 0.97 spring and, for weighty actions, a short haptic - the
 * motion confirms what happened rather than decorating the wait.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  weighty = false,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  /**
   * `'danger'` é `'primary'` pintado com o vermelho do tema — apagar, estornar,
   * começar do zero. Existe aqui e não como cor solta no lugar da chamada porque
   * a tinta do rótulo é MEDIDA contra o preenchimento (ver abaixo), e uma cópia
   * do botão lá fora perde a medida junto com o resto da regra.
   */
  variant?: 'primary' | 'ghost' | 'danger';
  /**
   * Drawn to the left of the label, in the label's own colour.
   *
   * The design puts the area's mark inside its action - a popsicle on "Lançar
   * produção" - so the button says what it is about before it is read. It
   * receives the colour so the icon can never disagree with the text it sits
   * beside.
   */
  icon?: (color: string) => ReactNode;
  /** Weighty actions (committing stock, dispatching a load) also vibrate. */
  weighty?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { color, radius, type, space, accent, brand, motion, tracos } = useTheme();

  /**
   * A pílula é do Orgânico. No Papel, retângulo.
   *
   * O dono circulou as "caixas" do outro tema e o botão era a última: um
   * comprimido de canto totalmente arredondado no meio de uma página de réguas
   * retas e serifa. Canto reto não deixa o botão menos achável — o que o torna
   * achável é ser a única massa de cor da tela, e isso continua.
   */
  const papel = tracos.genero === 'pagina';

  /**
   * A cor da AÇÃO é do aplicativo, não da seção.
   *
   * O botão pintava com o acento da área, e numa folha de contato as quatro
   * telas apareceram com quatro botões de cores diferentes — laranja na
   * produção, rosa no transporte. Cor de seção mora na régua e no desenho, que
   * é onde ela responde "que assunto é este"; no botão ela responde outra
   * pergunta, e responde errado: "registrar uma saída" não é uma coisa
   * diferente de "adicionar produção" só porque a aba é outra.
   *
   * Vale no Papel, onde a família é de tinta e um preenchimento claro vira
   * mancha. No Orgânico o acento por área continua — lá a cor é o assunto, e
   * foi assim que o dono escolheu.
   */
  const preenchimento =
    variant === 'danger' ? color.danger : tracos.tintaCheia === 'marca' ? brand : accent;

  /**
   * A tinta do rótulo é MEDIDA contra o preenchimento, não declarada.
   *
   * `color.onAccent` é a tinta escolhida para o ACENTO DA ÁREA. No Papel o botão
   * é pintado com a MARCA, que é outra cor — e a foto do Papel escuro mostrou o
   * resultado: "Procurar cidade" em tinta escura sobre marrom médio, que ninguém
   * lê de luva no corredor da câmara.
   *
   * Uma tinta declarada erra sempre que o fundo muda sem ela; medir não erra, e
   * continua certo no dia em que alguém acrescentar uma paleta. O par de
   * candidatas é o branco e o quase-preto — os dois extremos —, porque num tema
   * escuro a tinta da paleta é CLARA, e medir entre duas claras é escolher a menos
   * ruim de duas derrotas.
   */
  /**
   * O preenchimento que a tela MOSTRA — e num botão desligado ele não é este.
   *
   * A versão anterior desbotava o botão inteiro (`opacity: 0.45`), o que compõe
   * fundo E rótulo sobre a página: os dois caminham juntos na direção da cor de
   * fundo, e o contraste entre eles desaba. A foto de 9 de setembro mostrou
   * "Criar ficha" em branco sobre bege claro — um botão que só estava
   * desabilitado e que ninguém conseguia ler.
   *
   * Agora quem desbota é só o preenchimento, e a tinta é medida contra o que
   * sobrou. É a mesma doutrina do bloco acima, levada até o estado desligado:
   * tinta declarada erra sempre que o fundo muda sem ela.
   */
  const DESBOTADO = 0.35;
  const fundoDaAcao = disabled ? mistura(preenchimento, color.paper, DESBOTADO) : preenchimento;
  const tintaDaAcao = tintaSobre(fundoDaAcao, TINTA_CLARA, TINTA_ESCURA);
  const [pressed, setPressed] = useState(false);

  // The spring is driven by state rather than by writing to a shared value in
  // the handler. Same physics, and it keeps the press readable from React -
  // mutating a shared value inside a callback is invisible to everything else.
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed ? motion.pressScale : 1, motion.press) }],
  }));

  const isPrimary = variant !== 'ghost';

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        if (weighty) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
      style={[
        styles.base,
        {
          backgroundColor: isPrimary ? fundoDaAcao : 'transparent',
          borderRadius: radius.controle,
          paddingVertical: space.lg,
          paddingHorizontal: space.xl,
        },
        // A ação secundária no Papel é palavra sublinhada, não bloco.
        //
        // A moldura em volta é o vocabulário do Orgânico, e ela se multiplica:
        // a ficha de uma receita com quatro linhas tem doze ações secundárias,
        // e doze molduras empilhadas são doze caixas — exatamente o que o dono
        // circulou. Sublinhado dá a mesma pista de "isto se toca" ocupando uma
        // linha em vez de um retângulo.
        papel && !isPrimary
          ? {
              borderWidth: 0,
              borderBottomWidth: StyleSheet.hairlineWidth * 2,
              borderBottomColor: color.lineStrong,
              borderRadius: 0,
              paddingVertical: space.md,
              paddingHorizontal: space.sm,
            }
          : { borderColor: isPrimary ? 'transparent' : color.lineStrong },
        animated,
        style,
      ]}
    >
      {icon?.(isPrimary ? tintaDaAcao : color.inkMuted)}
      <Text
        style={[
          type.body,
          {
            fontWeight: '600',
            // A secundária não tem massa de cor para desbotar, então o desligado
            // dela é a tinta mais fraca — que continua sendo tinta de TEXTO
            // medida contra a página, não um branco sobre nada.
            color: isPrimary ? tintaDaAcao : disabled ? color.inkFaint : color.inkMuted,
          },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
