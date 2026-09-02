import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { nowIso } from '@/data/db';
import { lossesOn, type LossRow } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import { fill, formatDayMonth, formatMoney, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Onde o dinheiro que some está indo.
 *
 * A prancha desenha a linha "Perdas — quanto, onde e por quê", e ela ficou fora
 * do índice até agora porque nada escrevia perda. O motivo é o que faz esta
 * tela existir: "sumiram quatro quilos" não muda decisão nenhuma; "quatro
 * quilos venceram" muda a compra, e "derreteram" muda a manutenção do freezer.
 *
 * Ordenada por DINHEIRO, não por data. A pergunta não é "o que aconteceu
 * ontem" - é "o que está pesando", e uma caixa que derreteu pesa mais que
 * trinta picolés de cortesia.
 *
 * Trinta dias porque é a janela em que uma fábrica decide: menos que isso é
 * ruído de uma semana ruim, mais que isso já é história.
 */
export default function Losses() {
  return (
    <AreaProvider area="apricot">
      <WhatWasLost />
    </AreaProvider>
  );
}

function WhatWasLost() {
  const { color, type, space } = useTheme();
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<LossRow[]>(async () => {
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const inicio = dayWindow(nowIso(), locale.timeZone, -29);
    return lossesOn(LOCAL_COMPANY_ID, inicio.from, hoje.to);
  });

  const rows = data ?? [];
  const total = rows.reduce((n, r) => n + r.valueCents, 0);

  // Por motivo, para a tela dizer o que mais pesou em vez de listar e calar.
  const byReason = new Map<string, number>();
  for (const r of rows) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.valueCents);
  const worst = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <CollapsingHeader title={t.app.losses.title} overline={t.app.losses.window}>
      {rows.length > 0 ? (
        <Card tone="area">
          <Text style={[type.figure, { color: color.ink }]}>{formatMoney(total, locale)}</Text>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {fill(t.app.losses.total, {
              money: formatMoney(total, locale),
              count: plural(rows.length, t.app.losses.lossCount),
            })}
          </Text>
          {worst ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {fill(t.app.losses.worst, {
                reason: t.loss[worst[0] as keyof typeof t.loss].toLocaleLowerCase(locale.formatting),
                money: formatMoney(worst[1], locale),
              })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {rows.map((row) => (
        <Card key={`${row.itemId}-${row.occurredAt}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
              {row.name}
            </Text>
            <Text style={[type.cardTitle, { color: color.ink }]}>
              {formatMoney(row.valueCents, locale)}
            </Text>
          </View>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {formatQuantity(row.baseUnits, locale)} {row.baseUnit} ·{' '}
            {t.loss[row.reason].toLocaleLowerCase(locale.formatting)}
          </Text>
          <Text style={[type.caption, { color: color.inkFaint }]}>
            {row.locationName} · {formatDayMonth(row.occurredAt, locale)}
          </Text>
        </Card>
      ))}

      {!loading && rows.length === 0 ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.losses.empty}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.losses.emptyHint}
          </Text>
        </Card>
      ) : null}
    </CollapsingHeader>
  );
}
