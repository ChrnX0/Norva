import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The app's own confirmation, replacing `Alert.alert`.
 *
 * It exists because `Alert` is a no-op on the web: every save in this app was
 * asking a question nobody was shown and waiting for an answer that never came,
 * so the whole thing was quietly read-only in a browser and nothing said so.
 *
 * Owning it also makes the confirmation what the design asks for rather than
 * whatever the platform provides. The confirmations here are not "are you
 * sure" - they spell out what is about to happen, in words, with the numbers
 * written out, which is the one thing standing between a tired person and a
 * wrong entry. That needs real typography and room to breathe.
 *
 * It rises from the bottom, except when it is destructive: a centred dialog is
 * reserved for the actions that cannot be undone, so the shape itself carries a
 * warning before the words are read.
 */

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Draws it as a centred dialog in the danger colour, and has no default. */
  destructive?: boolean;
  /** Drops the cancel button: for telling, not asking. */
  acknowledge?: boolean;
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const queue = useRef<Pending[]>([]);

  const ask = useCallback((request: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      const entry = { ...request, resolve };
      setPending((current) => {
        if (current) {
          // Two questions at once would stack invisibly; the second waits.
          queue.current.push(entry);
          return current;
        }
        return entry;
      });
    });
  }, []);

  const settle = (answer: boolean) => {
    setPending((current) => {
      current?.resolve(answer);
      return queue.current.shift() ?? null;
    });
  };

  const value = useMemo(() => ask, [ask]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? <ConfirmSurface request={pending} onAnswer={settle} /> : null}
    </ConfirmContext.Provider>
  );
}

/**
 * Asks, and resolves to what the person chose.
 *
 * Outside a provider it resolves to `false` rather than throwing: a screen that
 * cannot ask must not act, and refusing to act is always the safe direction.
 */
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const ask = useContext(ConfirmContext);
  return ask ?? (async () => false);
}

function ConfirmSurface({
  request,
  onAnswer,
}: {
  request: ConfirmRequest;
  onAnswer: (ok: boolean) => void;
}) {
  const { color, radius, space, type, accent } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  const destructive = request.destructive ?? false;
  const confirmColor = destructive ? color.danger : accent;

  const body = (
    <>
      <Text style={[type.section, { color: color.ink }]}>{request.title}</Text>

      <ScrollView style={{ maxHeight: 260 }}>
        <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
          {request.message}
        </Text>
      </ScrollView>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        <Pressable
          onPress={() => onAnswer(true)}
          accessibilityRole="button"
          style={[
            styles.action,
            {
              backgroundColor: confirmColor,
              borderRadius: radius.pill,
              paddingVertical: space.lg,
            },
          ]}
        >
          <Text style={[type.body, { color: color.onAccent, fontWeight: '600' }]}>
            {request.confirmLabel ?? t.app.confirm.confirm}
          </Text>
        </Pressable>

        {request.acknowledge ? null : (
          <Pressable
            onPress={() => onAnswer(false)}
            accessibilityRole="button"
            style={[
              styles.action,
              {
                borderColor: color.lineStrong,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderRadius: radius.pill,
                paddingVertical: space.lg,
              },
            ]}
          >
            <Text style={[type.body, { color: color.inkMuted, fontWeight: '600' }]}>
              {request.cancelLabel ?? t.app.confirm.cancel}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );

  return (
    <Modal
      visible
      transparent
      animationType={destructive ? 'fade' : 'slide'}
      onRequestClose={() => onAnswer(false)}
    >
      {destructive ? (
        <View style={[styles.centred, { backgroundColor: 'rgba(0,0,0,0.45)', padding: space.lg }]}>
          <View
            style={{
              backgroundColor: color.paper,
              borderRadius: radius.xl,
              padding: space.xl,
              width: '100%',
              maxWidth: 420,
            }}
          >
            {body}
          </View>
        </View>
      ) : (
        <>
          <Pressable
            style={styles.backdrop}
            onPress={() => onAnswer(false)}
            accessibilityLabel={request.cancelLabel ?? t.app.confirm.cancel}
          />
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
            {body}
          </View>
        </>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  action: { alignItems: 'center', justifyContent: 'center' },
});
