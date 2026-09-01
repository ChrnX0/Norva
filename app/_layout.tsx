import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Crash } from '@/components/Crash';
import { WhatsNew } from '@/components/WhatsNew';
import { ensureStarterData } from '@/data/seed';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * Expo Router renders this instead of the screen when a render throws.
 *
 * Without it the person gets a blank screen, which for someone still deciding
 * whether to trust software with their money is the worst possible answer: they
 * cannot tell a bug from their own mistake, so they assume it was theirs.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Crash error={error} retry={() => void retry()} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  // The database is opened, migrated and seeded once, here, before any screen
  // asks it anything. It used to happen on the home screen, which meant every
  // other entry point - a deep link, a shared address - opened onto an empty
  // app and said there was nothing registered.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureStarterData()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <View style={{ flex: 1 }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
          {/* Sits above every screen: the update may land on any of them. */}
          <WhatsNew />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
