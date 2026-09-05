import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { Children, useContext, type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reveal } from '@/components/Reveal';
import { Mark } from './Mark';
import { MEDIDA_DA_PAGINA } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const EXPANDED = 34;
const COLLAPSED = 22;
const RANGE = 72;


/**
 * The large title that shrinks as you scroll - the most recognizable part of
 * the One UI signature, and the reason the top of every screen is breathing
 * room rather than a row of buttons.
 *
 * Actions live in the lower half of the screen, within thumb reach. Nothing
 * important ever sits up here.
 */
export function CollapsingHeader({
  title,
  overline,
  children,
}: {
  title: string;
  overline?: string;
  children: ReactNode;
}) {
  const { color, space, type, accent, skin, titleFamily } = useTheme();
  const insets = useSafeAreaInsets();
  // Em dp, que é o que o layout enxerga — nunca pixel.
  const { width: larguraDaTela } = useWindowDimensions();
  const coluna = { width: '100%' as const, maxWidth: MEDIDA_DA_PAGINA, alignSelf: 'center' as const };
  const largo = larguraDaTela >= MEDIDA_DA_PAGINA;

  // How much of the screen the tab bar covers, or nothing when there is no bar.
  //
  // Read from the context and NOT from `useBottomTabBarHeight()`: that hook
  // throws outside a tab screen, and nine screens in this app - a recipe, an
  // input, a purchase - are pushed on top of the bar rather than being tabs. A
  // hook that throws would take all nine down to save one line here.
  const tabBar = useContext(BottomTabBarHeightContext) ?? 0;
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const titleStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(scrollY.value, [0, RANGE], [EXPANDED, COLLAPSED], Extrapolation.CLAMP),
  }));

  const overlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, RANGE / 2], [1, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, RANGE / 2], [18, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <View
        style={[
          {
            paddingTop: insets.top + space.sm,
            paddingHorizontal: space.lg,
            paddingBottom: space.md,
            backgroundColor: color.paper,
          },
          // O título anda junto com os cartões: cabeçalho colado na borda
          // esquerda de um tablet, com a coluna centralizada embaixo, lê como
          // duas telas empilhadas.
          largo ? coluna : null,
        ]}
      >
        {/* A linha de olho vem ANTES do título, e o título é serifado.
            É a mesma hierarquia da capa aprovada — "NORVA · sábado, 5 de
            setembro" e a manchete embaixo —, e ela vale para as vinte telas
            porque o dono disse "TODO o aplicativo tem q seguir esse padrão".
            Antes era o contrário: título grande em cima, olho embaixo, e um selo
            da marca ao lado repetindo em toda tela o nome de quem já abriu o
            aplicativo. */}
        {overline ? (
          <Animated.View style={overlineStyle}>
            <Text
              style={[type.overline, { color: color.inkFaint, letterSpacing: 2.4 }]}
              numberOfLines={1}
            >
              {overline.toUpperCase()}
            </Text>
          </Animated.View>
        ) : null}

        <View style={[styles.titleRow, { gap: space.sm + 1 }]}>
          {/* O selo só sobra no Orgânico, que é a identidade de curva e cor. No
              Papel a marca não entra na página: a página é tinta e régua. */}
          {skin === 'papel' ? null : (
            <View style={[styles.icon, { backgroundColor: `${accent}22`, borderRadius: 9 }]}>
              <Mark size={15} color={accent} />
            </View>
          )}
          <Animated.Text
            style={[
              {
                color: color.ink,
                fontFamily: titleFamily,
                fontWeight: skin === 'papel' ? '700' : '600',
                letterSpacing: skin === 'papel' ? -0.2 : -0.8,
              },
              titleStyle,
            ]}
            accessibilityRole="header"
          >
            {title}
          </Animated.Text>
        </View>
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        // With the soft keyboard up, React Native's default (`never`) spends
        // the first tap dismissing it, so the confirm button only answers on
        // the second. On a factory floor that reads as "the app did not save"
        // - and the person taps again, or gives up. Invisible on the web and
        // to the e2e suite: a browser has no keyboard that rises.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          {
            paddingHorizontal: space.lg,
            paddingBottom: insets.bottom + space.xxl + tabBar,
            gap: space.md,
          },
          largo ? coluna : null,
        ]}
      >
        {/* A entrada escalonada, dada a TODA tela de uma vez.
            O dono viu o movimento na capa e pediu em todas: "isso é lindo e
            preenche os olhos, claro que não é para tirar a atenção". Fazer isso
            tela por tela seria trinta arquivos e trinta chances de esquecer uma;
            aqui, é o casco por onde todas passam.

            `Children.toArray` é o que dá o índice do escalonamento e descarta os
            nulos que as telas devolvem quando um cartão não se aplica - sem
            isso, um cartão ausente contaria como posição e abriria um buraco de
            quarenta milissegundos no meio da sequência. */}
        {Children.toArray(children).map((filho, i) => (
          <Reveal key={i} index={i}>
            {filho}
          </Reveal>
        ))}
        {/* A capa é a exceção conhecida: os cartões dela moram DENTRO de um
            componente de layout, então o casco vê um filho só e o escalonamento
            de verdade continua lá dentro. Envolver de novo aqui não atrapalha -
            a mola de fora abre o bloco enquanto as de dentro abrem os cartões. */}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
