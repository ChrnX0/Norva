import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { ask, knownSkills, type Answer, type Capability } from '@/assistant';
import { liveData } from '@/data/assistantData';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { defaultLocale } from '@/i18n';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Modo Conversa.
 *
 * Not a reduced version of the app - another door into the same house, with the
 * same data, the same permissions and the same actions. It exists because the
 * person who owns the factory should not have to learn to navigate: they ask.
 *
 * Three rules hold it together, and they are visible in this screen:
 *   - every figure shown here was computed by the engine, and `[por quê?]`
 *     opens the arithmetic that produced it
 *   - a phrase that would record something fills a card and waits; nothing
 *     reaches the ledger without a human yes
 *   - what the person may not see is never fetched, so there is nothing to leak
 */
export default function AssistantScreen() {
  return (
    <AreaProvider area="sky">
      <Conversation />
    </AreaProvider>
  );
}

/** Until sign-in lands, the local user is the owner. */
const CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'view_cost',
  'view_sale_price',
  'record_production',
  'place_order',
  'view_finance',
]);

type Turn = { question: string; answer: Answer; open: boolean; applied: boolean };

function Conversation() {
  const { color, radius, space, type, accent } = useTheme();
  const router = useRouter();

  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);

  const context = useMemo(
    () => ({
      data: liveData(LOCAL_COMPANY_ID),
      capabilities: CAPABILITIES,
      locale: defaultLocale,
    }),
    [],
  );

  const examples = useMemo(() => knownSkills(CAPABILITIES).map((s) => s.example), []);

  const send = (text: string) => {
    const asked = text.trim();
    if (!asked || thinking) return;

    setQuestion('');
    setThinking(true);

    ask(asked, context)
      .then((answer) =>
        setTurns((prev) => [{ question: asked, answer, open: false, applied: false }, ...prev]),
      )
      .catch((e: unknown) =>
        setTurns((prev) => [
          {
            question: asked,
            answer: { text: `Deu problema aqui: ${e instanceof Error ? e.message : String(e)}` },
            open: false,
            applied: false,
          },
          ...prev,
        ]),
      )
      .finally(() => setThinking(false));
  };

  const toggleWhy = (index: number) =>
    setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, open: !t.open } : t)));

  const confirm = (index: number) => {
    const turn = turns[index];
    if (!turn.answer.draft || turn.applied) return;

    // The floor no autonomy level crosses: a price, an adjustment or a
    // financial entry is confirmed by a person, in words, every time.
    Alert.alert('Confirma?', turn.answer.draft.summary, [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: () => {
          void turn.answer
            .draft!.apply()
            .then(() =>
              setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, applied: true } : t))),
            )
            .catch((e: unknown) =>
              Alert.alert('Não deu para gravar', e instanceof Error ? e.message : String(e)),
            );
        },
      },
    ]);
  };

  return (
    <CollapsingHeader title="Pergunte" overline="modo conversa">
      <Card tone="area">
        <TextInput
          value={question}
          onChangeText={setQuestion}
          onSubmitEditing={() => send(question)}
          placeholder="quanto custa o picolé de morango"
          placeholderTextColor={color.inkFaint}
          returnKeyType="send"
          accessibilityLabel="Sua pergunta"
          selectionColor={accent}
          multiline
          style={[
            type.body,
            {
              color: color.ink,
              backgroundColor: color.surface,
              borderColor: color.line,
              borderRadius: radius.md,
              borderWidth: StyleSheet.hairlineWidth,
              padding: space.md,
              minHeight: 60,
            },
          ]}
        />

        <Button
          label={thinking ? 'Vendo…' : 'Perguntar'}
          onPress={() => send(question)}
          disabled={thinking || question.trim().length === 0}
          style={{ marginTop: space.md }}
        />
      </Card>

      {turns.length === 0 ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.sm }]}>
            Eu sei responder, por exemplo
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {examples.map((example) => (
                <Pressable
                  key={example}
                  onPress={() => send(example)}
                  accessibilityRole="button"
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: color.lineStrong,
                    borderRadius: radius.pill,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                  }}
                >
                  <Text style={[type.caption, { color: color.inkMuted }]}>{example}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Card>
      ) : null}

      {turns.map((turn, index) => (
        <Card key={`${turn.question}-${index}`} tone={turn.answer.draft ? 'warning' : 'area'}>
          <Text style={[type.caption, { color: color.inkFaint }]}>{turn.question}</Text>
          <Text style={[type.cardTitle, { color: color.ink, marginTop: space.xs }]}>
            {turn.answer.text}
          </Text>

          {turn.open && turn.answer.detail ? (
            <View style={{ marginTop: space.md, gap: space.xs }}>
              {turn.answer.detail.map((line, i) => (
                <View key={`${line.label}-${i}`} style={styles.row}>
                  <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]}>
                    {line.label}
                  </Text>
                  <Text style={[type.secondary, styles.number, { color: color.ink }]}>
                    {line.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.row, { marginTop: space.md, gap: space.sm }]}>
            {turn.answer.detail ? (
              <Pressable
                onPress={() => toggleWhy(index)}
                accessibilityRole="button"
                style={[styles.pill, { borderColor: color.lineStrong }]}
              >
                <Text style={[type.caption, { color: accent, letterSpacing: 0.6 }]}>
                  {turn.open ? 'FECHAR' : 'POR QUÊ?'}
                </Text>
              </Pressable>
            ) : null}

            {turn.answer.route ? (
              <Pressable
                onPress={() => router.push(turn.answer.route as never)}
                accessibilityRole="button"
                style={[styles.pill, { borderColor: color.lineStrong }]}
              >
                <Text style={[type.caption, { color: color.inkMuted, letterSpacing: 0.6 }]}>
                  ABRIR A TELA
                </Text>
              </Pressable>
            ) : null}
          </View>

          {turn.answer.draft ? (
            <View style={{ marginTop: space.md }}>
              <Text style={[type.secondary, { color: color.inkMuted }]}>
                {turn.applied ? 'Lançado.' : turn.answer.draft.summary}
              </Text>
              {!turn.applied ? (
                <Button
                  label="Confirmar e lançar"
                  onPress={() => confirm(index)}
                  weighty
                  style={{ marginTop: space.md }}
                />
              ) : null}
            </View>
          ) : null}
        </Card>
      ))}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
