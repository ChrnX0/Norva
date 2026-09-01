import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A labelled input.
 *
 * `hint` is where the intelligence shows up: the field explains what the system
 * already worked out from what was typed ("R$ 4,72 per kilo becomes 0.472
 * cents per gram"), so the person confirms an answer instead of computing one.
 *
 * The label is always visible - never a placeholder that vanishes the moment
 * someone starts typing and leaves them guessing what the box was for.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  suffix,
  keyboardType = 'default',
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  hint?: string;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
}) {
  const { color, radius, space, type, accent } = useTheme();

  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.overline, { color: color.inkFaint }]}>{label.toUpperCase()}</Text>

      <View
        style={[
          styles.box,
          {
            backgroundColor: color.surface,
            borderColor: color.line,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            gap: space.sm,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.inkFaint}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          selectionColor={accent}
          style={[
            type.body,
            styles.input,
            { color: color.ink, fontVariant: keyboardType === 'default' ? [] : ['tabular-nums'] },
          ]}
        />
        {suffix ? (
          <Text style={[type.secondary, { color: color.inkFaint }]}>{suffix}</Text>
        ) : null}
      </View>

      {hint ? (
        <Text style={[type.caption, { color: color.inkMuted }]} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  input: { flex: 1, paddingVertical: 12 },
});
