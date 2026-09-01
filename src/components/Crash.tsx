import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand } from '@/config/brand';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * What the person sees when something breaks.
 *
 * Without this they get a blank screen, and a blank screen is the worst thing
 * this app can do to someone who was already unsure about trusting software
 * with their money. They cannot tell a crash from a bug from their own mistake,
 * so they assume it was theirs and stop using it.
 *
 * Three rules, all of them about that person rather than about the error:
 *
 *   - **Say nothing was lost, first**, because it is the only question they
 *     actually have. It is true by construction: every write is committed
 *     locally in a transaction before any screen draws it.
 *   - **Give them one button that works.** "Tentar de novo" gets them back to
 *     a working screen; a stack trace does not.
 *   - **Keep the technical detail, folded away.** It is the only description of
 *     the failure that will ever exist, since nobody is going to reproduce this
 *     on a phone in a cold room.
 */
export function Crash({ error, retry }: { error: Error; retry: () => void }) {
  const { color, radius, space, type } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: color.paper,
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.xl,
          paddingHorizontal: space.lg,
        },
      ]}
    >
      <Text style={[type.section, { color: color.ink }]}>Alguma coisa travou aqui</Text>

      <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
        Nada do que você registrou se perdeu. O aplicativo guarda cada lançamento no aparelho no
        momento em que você confirma, então é só voltar e continuar de onde parou.
      </Text>

      <Pressable
        onPress={retry}
        accessibilityRole="button"
        style={[
          styles.button,
          {
            backgroundColor: color.ink,
            borderRadius: radius.pill,
            marginTop: space.xl,
            paddingVertical: space.lg,
          },
        ]}
      >
        <Text style={[type.body, { color: color.paper, fontWeight: '600' }]}>Tentar de novo</Text>
      </Pressable>

      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.sm }]}>
          DETALHE TÉCNICO
        </Text>
        <ScrollView
          style={[
            styles.detail,
            {
              backgroundColor: color.sunken,
              borderRadius: radius.md,
              padding: space.md,
              maxHeight: 180,
            },
          ]}
        >
          <Text style={[type.code, { color: color.inkMuted }]}>
            {brand.name} · {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  button: { alignItems: 'center', justifyContent: 'center' },
  detail: { width: '100%' },
});
