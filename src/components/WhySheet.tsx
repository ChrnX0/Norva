import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LocaleSettings } from '@/i18n';
import { formatMoney } from '@/i18n';
import type { RecipeCost } from '@/domain/recipe';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The sheet behind every `[por quê?]`.
 *
 * The law it serves: no conclusion in this app is unauditable. For someone who
 * does not yet trust software with their money, being able to open the
 * arithmetic is what turns "the app said so" into "the app is right" - and it
 * is only possible because the number came from deterministic math over the
 * ledger rather than from a guess.
 *
 * It rises from the bottom, as every choice in this app does; a centred dialog
 * is reserved for destructive actions.
 */
export function WhySheet({
  visible,
  onClose,
  cost,
  locale,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  cost: RecipeCost;
  locale: LocaleSettings;
  title: string;
}) {
  const { color, radius, space, type, accent } = useTheme();
  const insets = useSafeAreaInsets();

  const sorted = [...cost.lines].sort((a, b) => b.share - a.share);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />

      <View
        style={{
          backgroundColor: color.paper,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.lg,
          paddingHorizontal: space.lg,
          maxHeight: '80%',
        }}
      >
        <View style={[styles.grabber, { backgroundColor: color.lineStrong }]} />

        <Text style={[type.section, { color: color.ink, marginBottom: space.xs }]}>{title}</Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.lg }]}>
          De onde sai esse número
        </Text>

        <ScrollView>
          {sorted.map((line) => (
            <View key={line.label} style={{ marginBottom: space.md }}>
              <View style={styles.row}>
                <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {line.label}
                </Text>
                <Text
                  style={[type.body, { color: color.ink, fontVariant: ['tabular-nums'], fontWeight: '600' }]}
                >
                  {formatMoney(line.totalCents, locale)}
                </Text>
              </View>

              {/* The bar is the point: it shows what dominates the cost at a
                  glance, which is the question behind opening this sheet. */}
              <View style={[styles.track, { backgroundColor: color.sunken }]}>
                <View
                  style={{
                    width: `${Math.max(1, Math.round(line.share * 100))}%`,
                    height: '100%',
                    backgroundColor: accent,
                    borderRadius: 99,
                  }}
                />
              </View>
              <Text style={[type.caption, { color: color.inkFaint, marginTop: 3 }]}>
                {Math.round(line.share * 100)}% do lote
              </Text>
            </View>
          ))}

          <View style={[styles.divider, { backgroundColor: color.line }]} />

          <Summary label="Custo do lote" value={formatMoney(cost.batchCents, locale)} />
          <Summary
            label={`Perda prevista (${(cost.lossFraction * 100).toFixed(1)}%)`}
            value={`sobram ${cost.netYield.toLocaleString(locale.formatting)}`}
          />
          <Summary
            label="Custo por unidade de massa"
            value={formatMoney(Math.round(cost.perYieldUnit * 1000), locale) + ' / 1.000'}
            strong
          />

          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
            A perda encarece o que sobra: o lote é pago inteiro, mas só parte dele chega ao cliente.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { color, type, space } = useTheme();
  return (
    <View style={[styles.row, { paddingVertical: space.xs }]}>
      <Text style={[type.secondary, { color: strong ? color.ink : color.inkMuted, flex: 1 }]}>
        {label}
      </Text>
      <Text
        style={[
          type.secondary,
          {
            color: color.ink,
            fontWeight: strong ? '600' : '400',
            fontVariant: ['tabular-nums'],
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  track: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 6 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
});
