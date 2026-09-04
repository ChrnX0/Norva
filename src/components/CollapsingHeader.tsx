import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { Children, useContext, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
  const { color, space, type, accent, skin } = useTheme();
  const insets = useSafeAreaInsets();

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
        style={{
          paddingTop: insets.top + space.sm,
          paddingHorizontal: space.lg,
          paddingBottom: space.md,
          backgroundColor: color.paper,
        }}
      >
        <View style={[styles.titleRow, { gap: space.sm + 1 }]}>
          {/* No Papel a marca fica na página, sem selo atrás — o dono circulou
              justamente as "caixinhas" e esta era uma delas. */}
          {skin === 'papel' ? (
            <Mark size={18} color={accent} />
          ) : (
            <View style={[styles.icon, { backgroundColor: `${accent}22`, borderRadius: 9 }]}>
              <Mark size={15} color={accent} />
            </View>
          )}
          <Animated.Text
            style={[
              { color: color.ink, fontWeight: '600', letterSpacing: -0.8 },
              titleStyle,
            ]}
            accessibilityRole="header"
          >
            {title}
          </Animated.Text>
        </View>

        {overline ? (
          <Animated.View style={overlineStyle}>
            <Text style={[type.overline, { color: color.inkFaint }]} numberOfLines={1}>
              {overline.toUpperCase()}
            </Text>
          </Animated.View>
        ) : null}
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
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + space.xxl + tabBar,
          gap: space.md,
        }}
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
