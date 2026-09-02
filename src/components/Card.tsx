import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { RAIL_WIDTH } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

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
  icon,
  title,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  /** O desenho do assunto, num crachá redondo. Recebe a cor já resolvida. */
  icon?: (color: string) => ReactNode;
  /** O título, que fica ao lado do crachá. Sem ícone ele não aparece. */
  title?: string;
  style?: ViewStyle;
}) {
  const { color, scheme, radius, space, type, accent } = useTheme();

  const toneColor =
    tone === 'area'
      ? accent
      : tone === 'danger'
        ? color.danger
        : tone === 'warning'
          ? color.warning
          : null;

  // O escuro aguenta mais cor que o claro: sobre papel quase branco, doze por
  // cento de âmbar já vira um cartão amarelo.
  const wash = scheme === 'dark' ? 0.13 : 0.08;
  const edge = scheme === 'dark' ? 0.34 : 0.24;

  return (
    <View
      style={[
        styles.base,
        {
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
      {icon ? (
        <View style={[styles.head, { gap: space.sm, marginBottom: space.sm }]}>
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
