import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A row in a list of things.
 *
 * `detail` is not decoration and it is not optional in spirit: a list where
 * every row is just a name makes the person open each one to find out anything,
 * which is the slowest possible way to use a phone. The row carries the number
 * they came looking for - what the sugar costs, how many units a batch makes -
 * so most of the time they never have to tap at all.
 *
 * `trailing` is for the one figure that dominates, kept right-aligned and in
 * tabular figures so a column of them can be compared by eye.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ListRow({
  label,
  detail,
  trailing,
  trailingTone = 'ink',
  signal,
  onPress,
}: {
  label: string;
  detail?: string;
  trailing?: string;
  trailingTone?: 'ink' | 'muted' | 'ok' | 'warning';
  /**
   * A cor da faixa desta linha, quando ela tem uma.
   *
   * Desenhada como um traço vertical na borda e NÃO como texto colorido: cor
   * sozinha não é informação para quem não distingue verde de vermelho, então a
   * linha continua dizendo o número por extenso e o traço é o atalho para quem
   * passa o olho. Ausente é o caso normal — item sem régua cadastrada não ganha
   * cor, porque o aplicativo não sabe o que é pouco para ele.
   */
  signal?: 'ok' | 'warning' | 'danger' | 'neutral';
  onPress?: () => void;
}) {
  const { color, space, type, motion } = useTheme();

  const tone =
    trailingTone === 'ok'
      ? color.ok
      : trailingTone === 'warning'
        ? color.warning
        : trailingTone === 'muted'
          ? color.inkMuted
          : color.ink;

  // A linha afunda quando o dedo encosta - e só quando ela leva a algum lugar.
  //
  // Linha sem destino que afunda promete uma navegação que não existe, e num
  // celular de fábrica, de luva, o afundar é também a única confirmação de que
  // o toque pegou.
  const held = useSharedValue(0);
  const squeeze = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - held.value * (1 - motion.pressScale) }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        if (onPress) held.value = withSpring(1, motion.press);
      }}
      onPressOut={() => {
        held.value = withSpring(0, motion.press);
      }}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={[styles.row, { paddingVertical: space.md, gap: space.md }, squeeze]}
    >
      {signal ? (
        <View
          style={{
            width: 3,
            alignSelf: 'stretch',
            borderRadius: 2,
            backgroundColor:
              signal === 'danger'
                ? color.danger
                : signal === 'warning'
                  ? color.warning
                  : signal === 'ok'
                    ? color.ok
                    : color.line,
          }}
        />
      ) : null}

      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: color.ink }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[type.caption, { color: color.inkFaint }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>

      {trailing ? (
        <Text style={[type.body, styles.trailing, { color: tone }]}>{trailing}</Text>
      ) : null}

      {onPress ? <Text style={[type.body, { color: color.inkFaint }]}>›</Text> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  trailing: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
