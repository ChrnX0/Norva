import { Pressable, StyleSheet, Text, View } from 'react-native';
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
export function ListRow({
  label,
  detail,
  trailing,
  trailingTone = 'ink',
  onPress,
}: {
  label: string;
  detail?: string;
  trailing?: string;
  trailingTone?: 'ink' | 'muted' | 'ok' | 'warning';
  onPress?: () => void;
}) {
  const { color, space, type } = useTheme();

  const tone =
    trailingTone === 'ok'
      ? color.ok
      : trailingTone === 'warning'
        ? color.warning
        : trailingTone === 'muted'
          ? color.inkMuted
          : color.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={[styles.row, { paddingVertical: space.md, gap: space.md }]}
    >
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  trailing: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});
