import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { GlyphChart } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { CannotReverseError, ledgerExtract, planReversal, reverseGroup, type ExtractAct } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill, formatDayMonth, formatMoney, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O extrato: o livro-razão por ATO, e o caminho de volta de qualquer um deles.
 *
 * **Existe porque o conserto estava inalcançável.** Nove funções escrevem no razão
 * a partir de tela — compra, contagem, produção, transferência, devolução, perda,
 * conferência, leitura, e o próprio estorno — e o botão de desfazer existia em
 * DUAS (`app/lots/[id].tsx:133`, `app/inputs/[id].tsx:505`). A carga e a
 * transferência gravavam sem volta.
 *
 * A fundação promete *"corrige-se por estorno, nunca por exclusão"*, e ela estava
 * honrada no banco e fora do alcance de quem erra. Isso não é inconveniência: o
 * que uma pessoa faz numa fábrica quando não dá para consertar é **parar de
 * registrar**. Perde-se o dado, não o conserto — e todo o resto que este projeto
 * construiu para proteger um número só vale se alguém tocar na tela de manhã.
 *
 * **E é a mesma tela do extrato fiscal**, aprovada pelo dono em 6 de setembro:
 * uma lista de atos com data, o que mexeu e quanto valia. Uma tela, três
 * trabalhos — desfazer, conferir, e abrir a conta de qualquer saldo.
 *
 * **O dinheiro daqui não fecha com o saldo por lugar, e isso é de propósito.**
 * Aquela tela valoriza o estoque pelo custo médio de HOJE; esta soma o que cada
 * linha valia quando aconteceu. As duas estão certas e respondem perguntas
 * diferentes — e documento é o razão, porque a média muda e não assina nada. A
 * diferença aparece aqui, dita; escondê-la com um arredondamento conveniente
 * produziria o documento bonito, verde e falso que este repositório mais teme.
 *
 * A cena do cabeçalho é a de relatórios, e não uma nova: o extrato é o detalhe do
 * relatório, e a doutrina da assinatura desta casa diz que o mesmo assunto sai do
 * mesmo desenho.
 */
export default function ExtratoScreen() {
  const { t, locale } = useLocale();
  const { color, palette, space, type, traco } = useTheme();
  const confirm = useConfirm();
  const words = t.app.extract;

  const [recusa, setRecusa] = useState<string | null>(null);

  const dados = useQuery(useCallback(() => ledgerExtract(LOCAL_COMPANY_ID, { limit: 40 }), []));
  const atos = dados.data ?? [];

  const desfazer = useCallback(
    async (ato: ExtractAct) => {
      setRecusa(null);
      const plano = await planReversal(LOCAL_COMPANY_ID, ato.groupId);

      // Erro que IMPEDE, e diz o que fazer — não reclama depois do toque.
      if (plano.alreadyReversed) {
        setRecusa(words.alreadyUndone);
        return;
      }
      if (plano.blocked.length > 0) {
        setRecusa(
          fill(words.blocked, {
            items: plano.blocked
              .map((b) =>
                fill(words.blockedItem, {
                  name: b.name,
                  held: `${formatQuantity(b.held, locale)} ${b.baseUnit}`,
                  needed: `${formatQuantity(b.needed, locale)} ${b.baseUnit}`,
                }),
              )
              .join(' · '),
          }),
        );
        return;
      }

      // A confirmação diz o que vai acontecer com os números por extenso, e não
      // pergunta se tem certeza. Os dois lados: o que sai e o que volta.
      const sai = plano.legs.filter((l) => l.baseUnits < 0);
      const volta = plano.legs.filter((l) => l.baseUnits > 0);
      const diga = (l: { baseUnits: number; baseUnit: string; name: string }) =>
        fill(t.common.amountOf, {
          amount: `${formatQuantity(Math.abs(l.baseUnits), locale)} ${l.baseUnit}`,
          name: l.name,
        });

      const sim = await confirm({
        title: fill(words.undoTitle, { what: t.movement[ato.kind] }),
        message: fill(words.undoBody, {
          out: sai.map(diga).join(' · ') || words.nothing,
          back: volta.map(diga).join(' · ') || words.nothing,
        }),
        confirmLabel: words.undo,
        destructive: true,
      });
      if (!sim) return;

      try {
        await reverseGroup(LOCAL_COMPANY_ID, { groupId: ato.groupId });
        dados.refresh();
      } catch (e) {
        setRecusa(e instanceof CannotReverseError ? words.alreadyUndone : words.undoFailed);
      }
    },
    [confirm, dados, locale, t, words],
  );

  return (
    <CollapsingHeader cena="relatorios" title={words.title} overline={words.overline}>
      {recusa ? (
        <Reveal index={0}>
          <Card hue={color.danger}>
            <Text style={[type.body, { color: color.ink }]}>{recusa}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* "Está tudo bem" é estado válido: razão vazio é uma frase, não um vazio. */}
      {atos.length === 0 && !dados.loading ? (
        <Reveal index={1}>
          <Card icon={(c) => <GlyphChart size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.ink }]}>{words.empty}</Text>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {words.emptyHint}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {atos.map((ato, i) => (
        <Reveal key={ato.groupId} index={i + 2}>
          <Card
            hue={ato.isReversal ? palette.mist : undefined}
            icon={(c) => <GlyphChart size={26} color={c} weight={traco} />}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text style={[type.secondary, { color: color.ink, flex: 1 }]}>
                {ato.isReversal
                  ? fill(words.undoOf, { what: t.movement[ato.kind] })
                  : t.movement[ato.kind]}
              </Text>
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {formatDayMonth(ato.occurredAt, locale)}
              </Text>
            </View>

            {/* O que ele mexeu, dito por extenso — a linha não faz a pessoa adivinhar. */}
            {ato.items.length > 0 ? (
              <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
                {ato.items.join(' · ')}
                {ato.placeName ? ` — ${ato.placeName}` : ''}
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                marginTop: space.sm,
              }}
            >
              {/* O valor pela taxa CONGELADA. Sem o portão ele não existe — e não
                  existir é diferente de valer zero, que é um número que alguém soma. */}
              {ato.valueCents !== null ? (
                <Text style={[type.body, { color: color.ink }]}>
                  {formatMoney(ato.valueCents, locale)}
                </Text>
              ) : null}
              <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>
                {plural(ato.lines, words.lineCount)}
              </Text>

              {ato.reversed ? (
                <Chip label={words.undone} signal="neutral" />
              ) : ato.isReversal ? null : (
                <Touchable onPress={() => desfazer(ato)} accessibilityLabel={words.undo}>
                  <Text style={[type.caption, { color: color.danger, fontWeight: '600' }]}>
                    {words.undo}
                  </Text>
                </Touchable>
              )}
            </View>
          </Card>
        </Reveal>
      ))}
    </CollapsingHeader>
  );
}
