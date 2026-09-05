import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphAssistant } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { ask, knownSkills, type Answer, type Capability } from '@/assistant';
import { liveData } from '@/data/assistantData';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { capabilitiesFor } from '@/domain/access';
import { defaultLocale, fill } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
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
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`), e
 * o layout anterior saiu inteiro em vez de ganhar um caminho ao lado. O que saiu,
 * item por item, porque cada um era um dialeto próprio:
 *
 * - um `TextInput` cru com fundo, borda e canto desenhados à mão dentro do
 *   cartão — a única caixa de texto escrita na mão do aplicativo inteiro,
 *   enquanto vinte telas usam `Field`;
 * - os exemplos numa fita horizontal de pastilhas com `borderRadius: pill` e
 *   borda escritas na tela: dezesseis coisas que o assistente sabe responder,
 *   treze delas fora do quadro, na primeira tela que alguém abre sem saber o que
 *   perguntar;
 * - o `[por quê?]` e o `ABRIR A TELA` como duas pílulas de `StyleSheet` local —
 *   vocabulário do Orgânico chapado por cima do Papel, que não tem pílula;
 * - a conta do `[por quê?]` como uma grade de `View` com `flex: 1` e
 *   `tabular-nums` na mão, que é `ListRow` reescrito pela metade;
 * - e a tela sem desenho nenhum e sem entrada animada: uma coluna de retângulos
 *   que aparecia de uma vez.
 *
 * O que existe agora são as mesmas três coisas, na ordem em que se usa:
 * **perguntar** (o campo e a ação, no tom do assunto), **o que se pode perguntar**
 * (a lista tocável, que é o estado vazio desta tela — cada linha manda a própria
 * frase, então ninguém precisa digitar para descobrir) e **a resposta** (a
 * pergunta acima dela, a frase, a conta que abre e a ação provável).
 *
 * Nenhuma caixa é desenhada aqui: `Card`, `Button`, `Chip` e `ListRow` já sabem
 * virar régua no Papel e bloco no Orgânico. E o cartão de rascunho continua sendo
 * o único âmbar da tela — é ele que espera o sim.
 */
export default function AssistantScreen() {
  return (
    <AreaProvider area="sky">
      <Conversation />
    </AreaProvider>
  );
}

/**
 * Until sign-in lands, whoever holds this phone is the owner.
 *
 * The set comes from the role table rather than being typed out here, and that
 * is the point: the day this reads a real membership, only this line changes.
 * A hand-written list beside a role table is two answers to one question, and
 * the one written by hand was already missing three capabilities the owner has.
 */
const CAPABILITIES: ReadonlySet<Capability> = capabilitiesFor('owner');

type Turn = { question: string; answer: Answer; open: boolean; applied: boolean };

function Conversation() {
  const { color, space, type, palette , traco } = useTheme();
  // Named apart from the assistant's own `ask`, which answers questions rather
  // than asking them.
  const askConfirm = useConfirm();
  const { locale, t } = useLocale();
  const router = useRouter();

  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);

  const context = useMemo(
    () => ({
      data: liveData(LOCAL_COMPANY_ID, locale.timeZone),
      capabilities: CAPABILITIES,
      locale: defaultLocale,
    }),
    [locale.timeZone],
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
            answer: {
              text: fill(t.app.assistant.trouble, {
                error: e instanceof Error ? e.message : String(e),
              }),
            },
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

  const confirmDraft = async (index: number) => {
    const turn = turns[index];
    if (!turn.answer.draft || turn.applied) return;

    // The floor no autonomy level crosses: a price, an adjustment or a
    // financial entry is confirmed by a person, in words, every time.
    const go = await askConfirm({
      title: t.app.assistant.confirmTitle,
      message: turn.answer.draft.summary,
      cancelLabel: t.app.assistant.no,
    });
    if (!go) return;

    try {
      await turn.answer.draft.apply();
      setTurns((prev) => prev.map((t, i) => (i === index ? { ...t, applied: true } : t)));
    } catch (e) {
      await askConfirm({
        title: t.app.assistant.failed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    }
  };

  return (
    <CollapsingHeader title={t.app.assistant.title} overline={t.app.assistant.overline}>
      {/* PERGUNTAR. O balão de fala é o crachá do assunto e o único desenho da
          tela: ele diz "aqui se fala" antes de qualquer palavra ser lida. Sem
          título no cartão — o cabeçalho já diz "Pergunte", e repetir a palavra
          num crachá é rótulo inventado. */}
      <Reveal index={0}>
        <Card hue={palette.sky} icon={(c) => <GlyphAssistant size={26} color={c} weight={traco} />}>
          <Field
            label={t.app.assistant.inputLabel}
            value={question}
            onChangeText={setQuestion}
            placeholder={t.app.assistant.placeholder}
          />
          <Button
            label={thinking ? t.app.assistant.thinking : t.app.assistant.ask}
            onPress={() => send(question)}
            disabled={thinking || question.trim().length === 0}
            style={{ marginTop: space.md }}
          />
        </Card>
      </Reveal>

      {/* O QUE SE PODE PERGUNTAR — que é o estado vazio desta tela, e estado
          vazio aqui é a primeira coisa que todo mundo vê.
          Cada linha manda a própria frase, então a lista não ensina: ela
          responde. Sem crachá em cada linha (desenho em toda linha vira papel de
          parede) e sem crachá no cartão, que seria o segundo balão de fala
          seguido — a sobrelinha diz de que lista esta é. */}
      {turns.length === 0 ? (
        <Reveal index={1}>
          <Card>
            <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.xs }]}>
              {t.app.assistant.examplesTitle.toLocaleUpperCase(locale.formatting)}
            </Text>
            {examples.map((example) => (
              <ListRow key={example} label={example} onPress={() => send(example)} />
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* AS RESPOSTAS, da mais nova para a mais velha.
          A pergunta fica pequena e apagada em cima: ela é o contexto, não o
          conteúdo — quem acabou de digitar sabe o que perguntou. Âmbar quando a
          frase virou rascunho, porque é o único cartão da tela que espera uma
          decisão; azul quando é só resposta. */}
      {turns.map((turn, index) => (
        <Reveal key={`${turn.question}-${index}`} index={1 + index}>
          <Card
            hue={turn.answer.draft ? color.warning : palette.sky}
            icon={(c) => <GlyphAssistant size={26} color={c} weight={traco} />}
          >
            <Text style={[type.caption, { color: color.inkFaint }]}>{turn.question}</Text>
            <Text style={[type.cardTitle, { color: color.ink, marginTop: space.xs }]}>
              {turn.answer.text}
            </Text>

            {/* A lista, aberta: o que o aplicativo sabe fazer, as opções da
                pergunta de volta, os campos do rascunho. Nada disso é conta, e
                tudo isso estava atrás de um botão escrito "POR QUÊ?" — a frase
                terminava em dois-pontos prometendo a lista e o rótulo do botão
                afirmava que ali estava a aritmética de um número inexistente. */}
            {turn.answer.list ? (
              <View style={{ marginTop: space.sm }}>
                {turn.answer.list.map((line, i) => (
                  <ListRow
                    key={`${line.label}-${i}`}
                    label={line.label}
                    trailing={line.value}
                    trailingTone="muted"
                  />
                ))}
              </View>
            ) : null}

            {/* A conta aberta (Lei 6): cada parcela com o que ela vale, na régua
                da linha de lista em vez de numa grade escrita à mão. */}
            {turn.open && turn.answer.detail ? (
              <View style={{ marginTop: space.sm }}>
                {turn.answer.detail.map((line, i) => (
                  <ListRow
                    key={`${line.label}-${i}`}
                    label={line.label}
                    trailing={line.value}
                    trailingTone="muted"
                  />
                ))}
              </View>
            ) : null}

            {/* As duas ações da resposta, e as duas são fantasma: abrir a conta e
                abrir a tela não são o que se faz aqui — o que se faz aqui é
                perguntar de novo, e a única massa de cor da tela é o botão de
                cima. Quando a resposta trouxe rascunho, a massa é o sim dele. */}
            {turn.answer.detail || turn.answer.route ? (
              <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                {turn.answer.detail ? (
                  <Button
                    label={turn.open ? t.app.assistant.close : t.app.assistant.why}
                    variant="ghost"
                    onPress={() => toggleWhy(index)}
                    style={{ flex: 1 }}
                  />
                ) : null}

                {turn.answer.route ? (
                  <Button
                    label={t.app.assistant.openScreen}
                    variant="ghost"
                    onPress={() => router.push(turn.answer.route as never)}
                    style={{ flex: 1 }}
                  />
                ) : null}
              </View>
            ) : null}

            {/* O rascunho: o que vai ser gravado, escrito como se diria em voz
                alta, e o sim embaixo. Gravado vira etiqueta de estado, não
                parágrafo cinza — e a etiqueta some junto com o botão, porque
                confirmar duas vezes a mesma coisa é o que se está evitando. */}
            {turn.answer.draft ? (
              <View style={{ marginTop: space.md, gap: space.md }}>
                {turn.applied ? (
                  <Chip
                    signal="ok"
                    label={
                      turn.answer.draft.kind === 'item'
                        ? t.app.assistant.registered
                        : t.app.assistant.recorded
                    }
                  />
                ) : (
                  <>
                    <Text style={[type.body, { color: color.ink }]}>
                      {turn.answer.draft.summary}
                    </Text>
                    {/* Lançar é o que se faz com o que aconteceu, e o cadastro
                        de um insumo não aconteceu em lugar nenhum: `saveItem`
                        escreve a linha do item e nenhum movimento. O resumo duas
                        linhas acima já dizia "Cadastrar", e o botão embaixo dele
                        dizia "lançar" — o dicionário deste aplicativo separa as
                        duas palavras de propósito. */}
                    <Button
                      label={
                        turn.answer.draft.kind === 'item'
                          ? t.app.assistant.confirmAndRegister
                          : t.app.assistant.confirmAndRecord
                      }
                      onPress={() => void confirmDraft(index)}
                      weighty
                    />
                  </>
                )}
              </View>
            ) : null}
          </Card>
        </Reveal>
      ))}
    </CollapsingHeader>
  );
}
