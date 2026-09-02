import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { QrCode } from '@/components/QrCode';
import { Reveal } from '@/components/Reveal';
import { findLot, type LotOfDay } from '@/data/repository';
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
 */
export default function LotLabel() {
  return (
    <AreaProvider area="apricot">
      <Label />
    </AreaProvider>
  );
}

function Label() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { color, type, space, radius } = useTheme();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<LotOfDay | null>(() => findLot(LOCAL_COMPANY_ID, id));

  if (!loading && !data) {
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
            {data?.name ?? ''}
          </Text>

          {data ? <QrCode text={data.code} size={200} /> : null}

          {/* O código por extenso, no maior corpo da etiqueta: é ele que
              salva a conferência quando o quadrado falha. */}
          <Text
            style={[
              type.figure,
              { color: '#111111', letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
            ]}
          >
            {data?.code ?? ''}
          </Text>

          <View style={{ alignItems: 'center' }}>
            {data?.producedOn ? (
              <Text style={[type.secondary, { color: '#333333' }]}>
                {fill(t.app.lotLabel.madeOn, { date: formatCalendarDate(data.producedOn, locale) })}
              </Text>
            ) : null}
            <Text style={[type.secondary, { color: '#333333' }]}>
              {data?.expiresOn
                ? fill(t.app.lotLabel.validUntil, {
                    date: formatCalendarDate(data.expiresOn, locale),
                  })
                : t.app.lotLabel.noExpiry}
            </Text>
            {data ? (
              <Text style={[type.secondary, { color: '#333333' }]}>
                {plural(data.baseUnits, t.units.unit, formatQuantity(data.baseUnits, locale))}
              </Text>
            ) : null}
          </View>
        </View>
      </Reveal>

      <Reveal index={1}>
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.lotLabel.why}</Text>
        </Card>
      </Reveal>
    </CollapsingHeader>
  );
}
