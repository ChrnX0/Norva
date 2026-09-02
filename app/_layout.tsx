import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmProvider } from '@/components/Confirm';
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
  //
  // What happens when that fails is half of this component's job. The `catch`
  // that used to be here swallowed the failure and let the app draw anyway:
  // with no database every screen answers "nothing registered yet" and the
  // briefing writes "everything steady" - the app lying calmly, which is the
  // worst possible state for somebody still deciding whether to trust it with
  // their money. The law says the opposite: an error stops the thing, it does
  // not complain about it, and "all is well" only counts when it is true.
  const [state, setState] = useState<{ ready: boolean; error: Error | null }>({
    ready: false,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    ensureStarterData().then(
      () => {
        if (alive) setState({ ready: true, error: null });
      },
      (e: unknown) => {
        if (alive) {
          setState({ ready: true, error: e instanceof Error ? e : new Error(String(e)) });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Retrying means opening the database again, not redrawing the screen: the
  // disk may have room now, the file may have been released.
  const retry = () => {
    setState({ ready: false, error: null });
    setAttempt((a) => a + 1);
  };

  // The same screen the ErrorBoundary uses, because to the person holding the
  // phone it is the same event: it stopped, nothing was lost, it can be tried
  // again.
  if (state.error) {
    return (
      <SafeAreaProvider>
        <ThemeProvider>
          <Crash error={state.error} retry={retry} />
        </ThemeProvider>
      </SafeAreaProvider>
    );
  }

  if (!state.ready) return <View style={{ flex: 1 }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ConfirmProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
            {/* Sits above every screen: the update may land on any of them. */}
            <WhatsNew />
          </ConfirmProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
