import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { brand } from '@/config/brand';
import { countForErase, eraseArea } from '@/data/repository';
import {
  blockerFor,
  summaryFor,
  type EraseArea,
  type EraseCounts,
} from '@/data/erase';
import { hasSeeded, LOCAL_COMPANY_ID, restoreStarterData } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Settings, which for now means one thing: getting your data back out.
 *
 * The app ships with an example so it does not open onto nothing, and that is
 * only defensible if wiping it is easy and obvious. Otherwise the first real
 * use happens on top of invented numbers, and the cadastro is dirty from the
 * first day.
 *
 * Two rules from the design system meet here:
 *   - destructive actions get a centred dialog, not a bottom sheet - the one
 *     deliberate exception to "everything rises from the bottom"
 *   - the confirmation says what disappears, counted, in words: "isso apaga 6
 *     insumos, 2 receitas e 1 produto", never "confirmar exclusão?"
 */
export default function SettingsScreen() {
  return (
    <AreaProvider area="mist">
      <Settings />
    </AreaProvider>
  );
}

const AREAS: { area: Exclude<EraseArea, 'all'> }[] = [
  { area: 'purchases' },
  { area: 'recipes' },
  { area: 'products' },
  { area: 'inputs' },
];

function Settings() {
  const { color, type, space } = useTheme();
  const { t } = useLocale();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const { data, loading, refresh } = useQuery(
    async () => ({
      counts: await countForErase(LOCAL_COMPANY_ID),
      seeded: await hasSeeded(),
    }),
  );

  const counts: EraseCounts | null = data?.counts ?? null;

  const run = async (area: EraseArea, label: string) => {
    if (!counts || busy) return;

    const blocker = blockerFor(area, counts);
    if (blocker) {
      // Law 5 again: this is not an error report after the fact - the button
      // was already disabled, and this explains the same thing on demand.
      await confirm({
        title: t.app.settings.cannotYet,
        message: blocker,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }

    const go = await confirm({
      title:
        area === 'all'
          ? t.app.settings.eraseAllTitle
          : fill(t.app.settings.eraseTitle, { area: label.toLowerCase() }),
      message: `${summaryFor(area, counts)}\n\n${t.app.settings.noUndo}`,
      confirmLabel: t.app.settings.erase,
      destructive: true,
    });
    if (!go) return;

    setBusy(true);
    try {
      await eraseArea(LOCAL_COMPANY_ID, area);
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.settings.failedToErase,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;

    const go = await confirm({
      title: t.app.settings.restoreTitle,
      message: t.app.settings.restoreBody,
      confirmLabel: t.app.settings.restoreConfirm,
    });
    if (!go) return;

    setBusy(true);
    try {
      await restoreStarterData();
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.settings.failedToRestore,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  const total =
    (counts?.inputs ?? 0) +
    (counts?.recipes ?? 0) +
    (counts?.products ?? 0) +
    (counts?.purchases ?? 0);

  return (
    <CollapsingHeader title={t.app.settings.title} overline={`${brand.name} · versão ${Constants.expoConfig?.version ?? '—'}`}>
      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.stored}</Text>
        {loading || !counts ? (
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.settings.checking}
          </Text>
        ) : (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Line label={t.app.settings.inputs} value={counts.inputs} />
            <Line label={t.app.settings.recipes} value={counts.recipes} />
            <Line label={t.app.settings.products} value={counts.products} />
            <Line label={t.app.settings.purchases} value={counts.purchases} />
          </View>
        )}

        {!loading && data?.seeded ? (
          <View style={{ marginTop: space.md }}>
            <Chip
              signal="neutral"
              label={total > 0 ? t.app.settings.hasExample : t.app.settings.emptyNoExample}
            />
          </View>
        ) : null}
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          {t.app.settings.clearByArea}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          {t.app.settings.clearByAreaHint}
        </Text>

        {AREAS.map((entry) => {
          const label = t.app.settings[entry.area];
          const blocked = counts ? blockerFor(entry.area, counts) : t.app.settings.checking;
          return (
            <Pressable
              key={entry.area}
              onPress={() => void run(entry.area, label)}
              disabled={busy || !counts}
              accessibilityRole="button"
              accessibilityLabel={`${t.app.settings.erase} ${label}`}
              accessibilityState={{ disabled: Boolean(blocked) }}
              style={[styles.row, { paddingVertical: space.md, gap: space.md }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: blocked ? color.inkFaint : color.ink }]}>
                  {label}
                </Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {/* The reason replaces the hint rather than sitting beside a
                      dead button: the person needs the way out, not the label. */}
                  {blocked ?? t.app.settings.areas[entry.area]}
                </Text>
              </View>
              <Text style={[type.body, { color: blocked ? color.inkFaint : color.inkMuted }]}>
                ›
              </Text>
            </Pressable>
          );
        })}
      </Card>

      <Card tone="danger">
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.startOver}</Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.settings.startOverHint}
        </Text>

        <Pressable
          onPress={() => void run('all', t.app.settings.eraseAll)}
          disabled={busy || !counts || total === 0}
          accessibilityRole="button"
          accessibilityLabel={t.app.settings.eraseAll}
          style={[
            styles.destructive,
            {
              borderColor: color.danger,
              marginTop: space.md,
              paddingVertical: space.md,
              opacity: busy || total === 0 ? 0.45 : 1,
            },
          ]}
        >
          <Text style={[type.body, { color: color.danger, fontWeight: '600' }]}>
            {busy ? t.app.settings.erasing : t.app.settings.eraseAll}
          </Text>
        </Pressable>
      </Card>

      {total === 0 && !loading ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.exampleTitle}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.settings.exampleEmpty}
          </Text>
          <Pressable
            onPress={() => void restore()}
            disabled={busy}
            accessibilityRole="button"
            style={[
              styles.destructive,
              { borderColor: color.lineStrong, marginTop: space.md, paddingVertical: space.md },
            ]}
          >
            <Text style={[type.body, { color: color.inkMuted, fontWeight: '600' }]}>
              {t.app.settings.restore}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={[type.secondary, { color: color.inkFaint, textAlign: 'center' }]}>
          {t.app.settings.back}
        </Text>
      </Pressable>
    </CollapsingHeader>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  const { color, type } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]}>{label}</Text>
      <Text style={[type.secondary, styles.number, { color: color.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  destructive: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
