import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { RAIL_WIDTH } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { useSuperficie } from './Superficie';

type Tone = 'plain' | 'area' | 'danger' | 'warning';

/**
 * Transparência em cima de uma cor sólida, escrita como o RN entende.
 *
 * As cores do tema são hexadecimais de seis dígitos; os dois dígitos a mais são
 * o alfa. Fazer isso aqui, e não com `rgba(...)` na mão, é o que permite a
 * mesma linha funcionar nos dois esquemas: o tom sai da paleta, e só a força
 * muda.
 */
export function tint(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  return `${hex}${Math.round(clamped * 255).toString(16).padStart(2, '0')}`;
}

/**
 * O cartão de que o aplicativo inteiro é feito.
 *
 * **A regra anterior era o trilho de 3px e mais nada**, e ela tinha um motivo
 * escrito: cartão inteiro colorido cansa quem olha a tela oito horas. O dono
 * olhou o resultado e disse o que ela custou — *"por que tudo esse tipo de
 * card? tem que ter um pouco de fofura"*. Ele está certo, e a regra estava
 * defendendo o olho de um problema que a tela dele não tem: uma capa de sete
 * retângulos cinzas iguais não cansa, ela **entedia**, e um aplicativo que
 * entedia é um aplicativo que ninguém abre para conferir nada.
 *
 * O acordo: a cor entra como **fundo lavado** — oito a doze por cento do tom da
 * área — em vez de superfície chapada. É cor bastante para o olho separar um
 * assunto do outro num relance e pouca o bastante para o texto continuar preto
 * no branco. O trilho fica, agora como borda inteira na mesma cor, mais forte:
 * é o que segura a identidade quando dois cartões vizinhos são do mesmo tom.
 *
 * E o cartão passa a poder ter cara: um `icon` num crachá redondo com o
 * `title` do lado. Ícone é a coisa mais barata que existe para uma tela deixar
 * de ser uma lista de parágrafos.
 */
export function Card({
  children,
  tone = 'plain',
  hue,
  icon,
  title,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  /**
   * A cor deste cartão, quando ela não é a da área nem a de um alerta.
   *
   * A capa põe assuntos diferentes um embaixo do outro - o que saiu do tacho, o
   * que foi para a loja, o que mudou de preço - e com um tom só eles viram a
   * mesma coisa repetida. Cada assunto carrega o tom da SUA área, que é o mesmo
   * da aba correspondente: quem vê laranja sabe que é produção antes de ler.
   */
  hue?: string;
  style?: ViewStyle;
} & (
  | {
      /** O desenho do assunto, num crachá redondo. Recebe a cor já resolvida. */
      icon: (color: string) => ReactNode;
      /** O título, ao lado do crachá. */
      title?: string;
    }
  | {
      /**
       * Cartão com título e SEM crachá — e isto passou a ser permitido por uma
       * repetição que o dono viu antes de mim.
       *
       * A regra era que `title` sem `icon` não compilava, porque o cabeçalho só
       * era desenhado quando havia crachá e um título sozinho sumia em silêncio.
       * Ela protegia de verdade — até a gaveta do "Mais" dar desenho a cada
       * LINHA. Aí o cabeçalho "Lançamentos" e a linha "Compras" apareceram com o
       * mesmo desenho, um debaixo do outro: *"melhorou, mas alguns lugares ainda
       * ficaram repetidos"*.
       *
       * O grupo não precisa de desenho quando cada porta dele tem o seu. O que
       * ele precisa é da régua colorida em cima e do nome — que é exatamente a
       * forma editorial do Papel. Então o título sozinho passa a ser desenhado,
       * em vez de recusado.
       */
      icon?: undefined;
      title?: string;
    }
)) {
  const { color, scheme, radius, space, type, accent, tracos } = useTheme();

  const toneColor =
    hue ??
    (tone === 'area'
      ? accent
      : tone === 'danger'
        ? color.danger
        : tone === 'warning'
          ? color.warning
          : null);

  // O escuro aguenta mais cor que o claro: sobre papel quase branco, doze por
  // cento de âmbar já vira um cartão amarelo.
  const wash = scheme === 'dark' ? 0.13 : 0.08;
  const edge = scheme === 'dark' ? 0.34 : 0.24;

  /**
   * O Papel não tem caixa. Esta é a segunda vez que isso é dito no código.
   *
   * O dono olhou a tela no Papel e circulou o que restava do outro tema:
   * *"as cores e todo o resto não combinam. como é que essas 'caixas'
   * continuam aí?"*. E ele estava apontando para três coisas de uma vez — o
   * retângulo de canto arredondado, o fundo lavado de cor e o crachá
   * preenchido atrás do ícone. As três são vocabulário do Orgânico, que é um
   * tema de blocos e curvas; o Papel é serifa, traço fino e canto reto, e um
   * bloco pastel dentro dele é objeto de outro aplicativo.
   *
   * A forma do Papel é editorial: **régua em cima, sem fundo, sem borda em
   * volta, sem crachá.** A cor mora no traço do desenho e na régua, nunca em
   * massa. O que separa um assunto do outro é o espaço e a linha, que é como
   * uma página impressa separa — e foi exatamente isso que ele escolheu quando
   * escolheu esta cara.
   */
  const papel = tracos.genero === 'pagina';

  // Já sobre uma superfície, o cartão desenha o CONTEÚDO e não a moldura: o
  // casco de peça do Orgânico é o cartão, e um segundo cartão dentro dele é a
  // caixa dentro da caixa que o dono recusou. Ver `Superficie`.
  const jaEmSuperficie = useSuperficie();

  return (
    <View
      style={[
        styles.base,
        papel && !jaEmSuperficie
          ? {
              backgroundColor: 'transparent',
              borderRadius: 0,
              // A caixa inteira sai: o `styles.base` desenha um contorno fino
              // nos quatro lados, e sobra ele se só o esquerdo for zerado.
              borderLeftWidth: 0,
              borderRightWidth: 0,
              borderBottomWidth: 0,
              // A régua: fina no cinza do papel, mais forte e na cor do assunto
              // quando há um. É a única linha do cartão.
              borderTopWidth: toneColor ? 1.5 : StyleSheet.hairlineWidth,
              borderTopColor: toneColor ?? color.line,
              paddingTop: space.md,
              paddingBottom: space.lg,
              paddingHorizontal: 0,
            }
          : jaEmSuperficie
            ? {
                // Sobre uma superfície sobra a RÉGUA da cor do assunto, que é o
                // que responde "de que isto fala" — e ela é a única coisa do
                // casco que não é moldura.
                backgroundColor: 'transparent',
                borderRadius: 0,
                borderTopWidth: 0,
                borderRightWidth: 0,
                borderBottomWidth: 0,
                borderLeftWidth: toneColor ? RAIL_WIDTH : 0,
                borderLeftColor: toneColor ?? 'transparent',
                paddingLeft: toneColor ? space.lg : 0,
              }
            : {
                backgroundColor: toneColor ? tint(toneColor, wash) : color.surface,
                borderColor: toneColor ? tint(toneColor, edge) : color.line,
                borderRadius: radius.xl,
                padding: space.lg,
                borderLeftWidth: toneColor ? RAIL_WIDTH : StyleSheet.hairlineWidth,
                borderLeftColor: toneColor ?? color.line,
              },
        style,
      ]}
    >
      {icon || title ? (
        <View style={[styles.head, { gap: space.sm, marginBottom: space.sm }]}>
          {/* O desenho NÃO respira mais aqui — e essa é uma reversão consciente.

              O `Alive` embrulhava todo crachá numa oscilação de escala de três
              centésimos, igual para os vinte e seis desenhos. Ele nasceu de um
              pedido do dono ("quero todos eles com aquela animação bem suave do
              desenho de fábrica"), e o pedido estava certo — a leitura dele é que
              estava errada. Na cena da fábrica o sol GIRA e a fumaça SOBE: cada
              coisa faz o que ela faz. Um respiro só, aplicado a tudo, é o
              contrário disso, e foi o que o dono recusou ao voltar ao assunto:
              *"sutil, mas vivo"*, apontando a mesma cena de novo.

              A chegada continua: o `Reveal` do casco assenta cada cartão. O que
              saiu foi o laço perpétuo genérico — a vida agora mora DENTRO de cada
              desenho, no `Vivo`, e só onde ela tem o que dizer. */}
          {!icon ? null : papel ? (
            // Sem crachá: o desenho fica na página, do tamanho do texto ao lado.
            icon(toneColor ?? accent)
          ) : (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: tint(toneColor ?? accent, scheme === 'dark' ? 0.22 : 0.14),
                  borderRadius: radius.lg,
                },
              ]}
            >
              {icon(toneColor ?? accent)}
            </View>
          )}
          {title ? (
            <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  badge: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
