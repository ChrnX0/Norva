import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import {
  openProductionRuns,
  productionOn,
  type OpenRun,
  type ProducedInWindow,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { nowIso } from '@/data/db';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import { fill, formatQuantity, formatTime, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { palettes } from '@/theme/tokens';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * O dia de produção — e o botão que o alimenta.
 *
 * Esta aba era o formulário, e o formulário abria pedindo tachos. Duas coisas
 * erradas de uma vez: a primeira pergunta era a conta do meio, não o fato
 * ("produzi 480 picolés" é o que aconteceu; "rodei um tacho" é como se chega
 * nele), e uma aba que é só formulário não responde nenhuma das três perguntas
 * da Lei da Inteligência. Ela não dizia o que é normal, nem o que mudou hoje.
 *
 * Agora responde: o total do dia contra o de ontem (Lei 3 — nenhum número
 * aparece sozinho), o que já entrou, os tachos ainda abertos, e a próxima ação
 * provável num botão só. O formulário mudou de endereço, não de dono.
 */
export default function ProductionScreen() {
  return (
    <AreaProvider area="apricot">
      <ProductionDay />
    </AreaProvider>
  );
}

type Loaded = {
  today: ProducedInWindow[];
  yesterday: ProducedInWindow[];
  runs: OpenRun[];
};

function ProductionDay() {
  const { color, scheme, type, space } = useTheme();
  const palette = palettes[scheme];
  const { locale, t } = useLocale();

  const { data, loading } = useQuery<Loaded>(async () => {
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const ontem = dayWindow(nowIso(), locale.timeZone, -1);
    const [today, yesterday, runs] = await Promise.all([
      productionOn(LOCAL_COMPANY_ID, hoje.from, hoje.to),
      productionOn(LOCAL_COMPANY_ID, ontem.from, ontem.to),
      openProductionRuns(LOCAL_COMPANY_ID),
    ]);
    return { today, yesterday, runs };
  });

  const totals = useMemo(() => {
    const soma = (rows: ProducedInWindow[]) => rows.reduce((n, r) => n + r.baseUnits, 0);
    const hoje = soma(data?.today ?? []);
    const ontem = soma(data?.yesterday ?? []);
    return { hoje, ontem, delta: hoje - ontem };
  }, [data]);

  return (
    <CollapsingHeader title={t.app.production.title} overline={t.app.production.overline}>
      {/* O que é normal ali, e o que está diferente agora. Ontem é a comparação
          honesta para uma fábrica que produz todo dia: a média da semana
          esconde o feriado, e o mês esconde a sazonalidade que o dono conhece
          de cabeça. */}
      <Card tone="area">
        <Text style={[type.secondary, { color: color.inkMuted }]}>
          {t.app.production.todayTotal}
        </Text>
        <Text style={[type.figure, { color: color.ink }]}>
          {loading ? '—' : formatQuantity(totals.hoje, locale)}
        </Text>
        {!loading ? (
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {totals.ontem === 0
              ? t.app.production.noYesterday
              : fill(t.app.production.vsYesterday, {
                  units: formatQuantity(totals.ontem, locale),
                })}
          </Text>
        ) : null}
      </Card>

      {/* A próxima ação provável, e o botão que o dono pediu com todas as
          letras: adicionar o que foi produzido. Ele vem antes da lista porque
          quem abre esta aba no meio do turno vem para lançar, não para ler. */}
      <Button label={t.app.production.add} onPress={() => router.push('/production/new')} />

      {data && data.runs.length > 0 ? (
        <Card tone="warning">
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.production.openRuns}</Text>
          <View style={{ marginTop: space.md, gap: space.xs }}>
            {data.runs.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {r.productName}
                </Text>
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {formatTime(r.openedAt, locale)}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.production.whatCameOut}</Text>
        {loading ? (
          <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
            {t.app.products.opening}
          </Text>
        ) : (data?.today ?? []).length === 0 ? (
          // "Está tudo bem" é estado válido, e nada produzido ainda também é.
          // Nem alerta, nem culpa: a frase diz o que fazer, não o que faltou.
          <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
            {t.app.production.nothingYet}
          </Text>
        ) : (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {(data?.today ?? []).map((r) => (
              <View key={r.itemId} style={styles.row}>
                <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[type.body, styles.number, { color: color.ink }]}>
                  {plural(
                    r.baseUnits,
                    t.app.production.unitCount,
                    formatQuantity(r.baseUnits, locale),
                  )}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {!loading && totals.ontem > 0 && totals.hoje > 0 ? (
        <Chip
          signal={totals.delta >= 0 ? 'ok' : 'warning'}
          label={fill(
            totals.delta >= 0 ? t.app.production.aboveYesterday : t.app.production.belowYesterday,
            {
              percent: String(Math.round((Math.abs(totals.delta) / totals.ontem) * 100)),
            },
          )}
        />
      ) : null}
      <View style={{ height: space.lg }} />
      <Text style={[type.caption, { color: palette.apricot }]} />
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});
