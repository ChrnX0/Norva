import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Uma parcela da conta: o que entrou, quanto, e que fatia do todo é.
 *
 * `parte` é opcional porque nem toda conta tem fatia — a soma de três lugares
 * tem, a diferença entre duas datas não tem. Sem ela a barra some, e some por
 * ausência de fato, não por decisão de layout.
 */
export type Parcela = { rotulo: string; valor: string; parte?: number; nota?: string };

/** O fecho: o que a conta conclui, linha a linha. O último costuma ser o forte. */
export type Fecho = { rotulo: string; valor: string; forte?: boolean };

/**
 * A CONTA por trás de um número — e ela é fato, nunca frase pronta.
 *
 * Quem escreve português é a tela, que é a fundação da casa: o mesmo `WhySheet`
 * serve o custo de uma receita e o valor parado no estoque sem saber o que
 * nenhum dos dois significa. O que ele sabe é desenhar parcelas e fechos.
 */
export type Conta = {
  /** De onde o número vem, em uma frase. */
  origem: string;
  parcelas: Parcela[];
  fechos: Fecho[];
  /** O rodapé, quando a conta precisa dizer o que ela NÃO afirma. */
  nota?: string;
};

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
 *
 * **Ele deixou de conhecer receita em 7 de setembro.** Estava tipado em
 * `RecipeCost`, e por isso a Lei 6 valia numa tela só: qualquer outro número que
 * quisesse abrir a conta teria de reescrever a folha inteira. Agora recebe uma
 * `Conta` — parcelas e fechos —, e quem sabe o que os números significam é quem
 * os produziu. A ORDEM também é de quem chama: "o que domina" é pergunta da
 * receita, e ordenar aqui imporia essa pergunta a contas que não a têm.
 */
export function WhySheet({
  visible,
  onClose,
  conta,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  conta: Conta;
  title: string;
}) {
  const { color, radius, space, type, accent } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.whySheet.close} />

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
          {conta.origem}
        </Text>

        <ScrollView>
          {conta.parcelas.map((parcela) => (
            <View key={parcela.rotulo} style={{ marginBottom: space.md }}>
              <View style={styles.row}>
                <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {parcela.rotulo}
                </Text>
                <Text
                  style={[type.body, { color: color.ink, fontVariant: ['tabular-nums'], fontWeight: '600' }]}
                >
                  {parcela.valor}
                </Text>
              </View>

              {/* The bar is the point: it shows what dominates the cost at a
                  glance, which is the question behind opening this sheet. Sem
                  fatia não há barra — e a ausência é fato, não falta de capricho. */}
              {parcela.parte === undefined ? null : (
                <View style={[styles.track, { backgroundColor: color.sunken }]}>
                  <View
                    style={{
                      width: `${Math.max(1, Math.round(parcela.parte * 100))}%`,
                      height: '100%',
                      backgroundColor: accent,
                      borderRadius: 99,
                    }}
                  />
                </View>
              )}
              {parcela.nota ? (
                <Text style={[type.caption, { color: color.inkFaint, marginTop: 3 }]}>
                  {parcela.nota}
                </Text>
              ) : null}
            </View>
          ))}

          <View style={[styles.divider, { backgroundColor: color.line }]} />

          {conta.fechos.map((fecho) => (
            <Summary key={fecho.rotulo} label={fecho.rotulo} value={fecho.valor} strong={fecho.forte} />
          ))}

          {conta.nota ? (
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
              {conta.nota}
            </Text>
          ) : null}
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
