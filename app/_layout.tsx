import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Crash } from '@/components/Crash';
import { WhatsNew } from '@/components/WhatsNew';
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
