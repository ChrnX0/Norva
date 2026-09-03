import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { QrCode } from '@/components/QrCode';
import { Reveal } from '@/components/Reveal';
import {
  findLot,
  planReversal,
  reverseGroup,
  type LotOfDay,
  type ReversalPlan,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill, formatCalendarDate, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * A etiqueta do lote, na tela, do tamanho em que ela vai para o papel.
 *
 * Esta tela é a **prova visual** da etiqueta antes de existir impressora. A
 * escolha de qual impressora a fábrica compra é do dono, e ela muda o formato
 * do papel, não o conteúdo - então o conteúdo entra primeiro, conferido no
 * aparelho, e a impressão vem quando o modelo estiver decidido.
 *
 * O que ela mostra é exatamente o que o padrão de rastreio pede e nada além:
 * **o que é**, **de que lote**, **quando foi feito**, **até quando vale** e
 * **quanto rendeu**. Cada linha que não serve para achar ou recolher o produto
 * fica fora - etiqueta cheia é etiqueta que ninguém lê.
 *
 * O código aparece duas vezes de propósito: no quadrado e escrito por extenso,
 * grande, embaixo dele. Etiqueta que congela, descola ou é arranhada por caixa
 * empilhada é semana normal numa fábrica, e quando o quadrado falha alguém
 * digita os onze caracteres e segue.
 *
 * **E é daqui que se conserta a corrida.** O lote é a única coisa que aponta
 * para um ato de produção com um nome que alguém lê em voz alta, então quem
 * lançou 500 onde eram 50 chega aqui pelo código. A ação fica FORA do papel
 * branco - a etiqueta é o que sai da impressora, e botão nenhum sai impresso.
 */
export default function LotLabel() {
  return (
    <AreaProvider area="apricot">
      <Label />
    </AreaProvider>
  );
}

type Loaded = { lot: LotOfDay | null; plan: ReversalPlan | null };

function Label() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { color, type, space, radius } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();
  const confirm = useConfirm();

  // O plano vem JUNTO com o lote, e não no toque do botão.
  //
  // A Lei 5 pede que o erro impeça em vez de reclamar: se a carga já saiu, a
  // tela diz isso antes, com o item pelo nome, em vez de deixar a pessoa tocar
  // e receber "não foi possível".
  const { data, loading, refresh } = useQuery<Loaded>(async () => {
    const lot = await findLot(LOCAL_COMPANY_ID, id);
    if (!lot?.runGroupId) return { lot, plan: null };
    return { lot, plan: await planReversal(LOCAL_COMPANY_ID, lot.runGroupId) };
  });

  const lote = data?.lot ?? null;
  const plano = data?.plan ?? null;

  /**
   * A quantidade como a tela de lugares já diz: "28.000 g", "500 un".
   *
   * Mesmo formato de lá de propósito - duas maneiras de escrever a mesma
   * grandeza fazem a pessoa conferir se são a mesma coisa.
   */
  const diga = (baseUnits: number, unit: string) =>
    `${formatQuantity(Math.abs(baseUnits), locale)} ${unit}`;

  /** "28.000 g de Polpa de morango" - e o "de" vem do dicionário, que em inglês é "of". */
  const nomeada = (l: { baseUnits: number; baseUnit: string; name: string }) =>
    fill(t.common.amountOf, { amount: diga(l.baseUnits, l.baseUnit), name: l.name });

  const corrigir = async () => {
    if (!lote?.runGroupId || !plano) return;
    const sai = plano.legs.filter((l) => l.baseUnits < 0);
    const volta = plano.legs.filter((l) => l.baseUnits > 0);

    const yes = await confirm({
      title: fill(t.app.lotLabel.reverseTitle, { code: lote.code }),
      // Os números por extenso, os dois lados. A confirmação deste aplicativo
      // diz o que vai acontecer, não pergunta se tem certeza.
      message: fill(t.app.lotLabel.reverseBody, {
        out: sai.map(nomeada).join(' · '),
        back: volta.map(nomeada).join(' · '),
      }),
      confirmLabel: t.app.lotLabel.reverseConfirm,
      destructive: true,
    });
    if (!yes) return;

    await reverseGroup(LOCAL_COMPANY_ID, { groupId: lote.runGroupId });
    refresh();
    router.back();
  };

  if (!loading && !lote) {
    return (
      <CollapsingHeader title={t.app.lotLabel.title} overline={t.app.lotLabel.overline}>
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.lotLabel.gone}</Text>
        </Card>
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader title={t.app.lotLabel.title} overline={t.app.lotLabel.overline}>
      <Reveal index={0}>
        {/* O papel: branco sempre, mesmo no tema escuro. Uma etiqueta é uma
            etiqueta - o que se vê aqui é o que sai da impressora, e o tema da
            tela não tem nada a ver com a tinta. */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: radius.md,
            padding: space.xl,
            alignItems: 'center',
            gap: space.md,
          }}
        >
          <Text style={[type.cardTitle, { color: '#111111', textAlign: 'center' }]}>
            {lote?.name ?? ''}
          </Text>

          {lote ? <QrCode text={lote.code} size={200} /> : null}

          {/* O código por extenso, no maior corpo da etiqueta: é ele que
              salva a conferência quando o quadrado falha. */}
          <Text
            style={[
              type.figure,
              { color: '#111111', letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
            ]}
          >
            {lote?.code ?? ''}
          </Text>

          <View style={{ alignItems: 'center' }}>
            {lote?.producedOn ? (

              <Text style={[type.secondary, { color: '#333333' }]}>
                {fill(t.app.lotLabel.madeOn, { date: formatCalendarDate(lote.producedOn, locale) })}
              </Text>
            ) : null}
            <Text style={[type.secondary, { color: '#333333' }]}>
              {lote?.expiresOn
                ? fill(t.app.lotLabel.validUntil, {
                    date: formatCalendarDate(lote.expiresOn, locale),
                  })
                : t.app.lotLabel.noExpiry}
            </Text>
            {lote ? (
              <Text style={[type.secondary, { color: '#333333' }]}>
                {plural(lote.baseUnits, t.units.unit, formatQuantity(lote.baseUnits, locale))}
              </Text>
            ) : null}
          </View>
        </View>
      </Reveal>

      {/* O conserto. Só aparece quando há corrida para desfazer, e quando não
          dá ele diz por que em vez de ficar apagado esperando o toque. */}
      {plano ? (
        <Reveal index={1}>
          {plano.alreadyReversed ? (
            <Card tone="warning">
              <Text style={[type.secondary, { color: color.ink }]}>
                {t.app.lotLabel.reverseAlready}
              </Text>
            </Card>
          ) : plano.blocked.length > 0 ? (
            <Card tone="warning">
              <Text style={[type.secondary, { color: color.ink }]}>
                {fill(t.app.lotLabel.reverseBlocked, {
                  items: plano.blocked
                    .map((b) =>
                      fill(t.app.lotLabel.reverseBlockedItem, {
                        name: b.name,
                        held: diga(b.held, b.baseUnit),
                        needed: diga(b.needed, b.baseUnit),
                      }),
                    )
                    .join(' · '),
                })}
              </Text>
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.lotLabel.reverseBlockedHint}
              </Text>
            </Card>
          ) : (
            // Fantasma, não primário: corrigir é o caminho raro. Botão grande
            // e colorido convida, e ninguém deve ser convidado a estornar.
            <Button label={t.app.lotLabel.reverse} variant="ghost" onPress={corrigir} />
          )}
        </Reveal>
      ) : null}

      <Reveal index={2}>
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.lotLabel.why}</Text>
        </Card>
      </Reveal>
    </CollapsingHeader>
  );
}
