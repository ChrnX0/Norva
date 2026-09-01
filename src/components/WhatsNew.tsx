import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brand } from '@/config/brand';
import { latestRelease, releaseLines } from '@/config/releases';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

const SEEN_KEY = `${brand.slug}:release-seen`;

/**
 * The honest half of a silent update.
 *
 * Updates install themselves, which is the only way this works for someone who
 * will never visit an app store. But an app that changes overnight without
 * saying so teaches people not to trust what they are looking at. So: it
 * updates on its own, and the first time you open it afterwards it tells you
 * what moved - once, in three lines, and never again.
 *
 * Storage failures are swallowed on purpose. If the key cannot be read the
 * worst case is showing the notice twice; refusing to open the app over a
 * missing preference would be far worse.
 */
export function WhatsNew() {
  const { color, radius, space, type, accent } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;

    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => {
        if (!alive || seen === latestRelease.version) return;

        // Nothing was updated on a first install, and saying so would be the
        // app's first sentence to somebody who has not decided to trust it yet.
        // So the current release is filed as already seen, silently, and the
        // sheet waits for a real update to have something true to report.
        if (seen === null) {
          void AsyncStorage.setItem(SEEN_KEY, latestRelease.version).catch(() => undefined);
          return;
        }

        setVisible(true);
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    AsyncStorage.setItem(SEEN_KEY, latestRelease.version).catch(() => undefined);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityLabel="Fechar" />

      <View
        style={{
          backgroundColor: color.paper,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.lg,
          paddingHorizontal: space.lg,
        }}
      >
        <View style={[styles.grabber, { backgroundColor: color.lineStrong }]} />

        <Text style={[type.section, { color: color.ink }]}>{t.app.whatsNew.title}</Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.whatsNew.subtitle}
        </Text>

        <View style={{ marginTop: space.lg, gap: space.md }}>
          {releaseLines().map((line) => (
            <View key={line} style={styles.line}>
              <View style={[styles.bullet, { backgroundColor: accent }]} />
              <Text style={[type.body, { color: color.ink, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          style={[
            styles.button,
            {
              backgroundColor: accent,
              borderRadius: radius.pill,
              marginTop: space.xl,
              paddingVertical: space.lg,
            },
          ]}
        >
          <Text style={[type.body, { color: color.onAccent, fontWeight: '600' }]}>
            {t.app.whatsNew.dismiss}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  button: { alignItems: 'center', justifyContent: 'center' },
});
