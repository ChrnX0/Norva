import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { brand } from '@/config/brand';
import { countForErase, eraseArea, ordersNeedApproval, setOrdersNeedApproval } from '@/data/repository';
import {
  blockerFor,
  EraseBlockedError,
  isEmpty,
  tallyFor,
  type EraseArea,
  type EraseBlocker,
  type EraseCounts,
  type EraseTally,
} from '@/data/erase';
import { hasSeeded, LOCAL_COMPANY_ID, restoreStarterData } from '@/data/seed';
import { simulateFortnight } from '@/data/simulate';
import { useQuery } from '@/data/useQuery';
import { fill, joinList, plural } from '@/i18n';
import type { Dictionary } from '@/i18n';
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

/** Puts the blocker into words - the reason and the count, in one sentence. */
function sayBlocker(blocker: EraseBlocker, t: Dictionary): string {
  const words = t.app.settings;

  const say = plural;

  switch (blocker.reason) {
    case 'recipesUseInputs':
      return say(blocker.count, words.blocked.recipesUseInputs);
    case 'purchasesUseInputs':
      return say(blocker.count, words.blocked.purchasesUseInputs);
    case 'productsUseRecipes':
      return say(blocker.count, words.blocked.productsUseRecipes);
    case 'purchasesUseProducts':
      return words.blocked.purchasesUseProducts;
  }
}

/** "Isso apaga 6 insumos, 2 receitas e 1 produto." plus what else goes with it. */
function sayTally(area: EraseArea, tally: EraseTally, t: Dictionary): string {
  const words = t.app.settings;
  if (isEmpty(tally)) return area === 'all' ? words.alreadyEmpty : words.nothingToErase;

  const parts: string[] = [];
  const add = (n: number, key: keyof Dictionary['app']['settings']['counted']) => {
    if (n > 0) parts.push(plural(n, words.counted[key]));
  };
  add(tally.inputs, 'inputs');
  add(tally.recipes, 'recipes');
  add(tally.products, 'products');
  add(tally.places, 'places');
  add(tally.purchases, 'purchases');

  const what = joinList(parts, t.common.and);
  const sentence =
    area === 'purchases'
      ? words.alsoPurchases
      : area === 'recipes'
        ? words.alsoRecipes
        : area === 'inputs'
          ? words.alsoInputs
          : area === 'all'
            ? words.alsoAll
            : words.erases;

  return fill(sentence, { what });
}

function Settings() {
  const { color, type, space } = useTheme();
  const { locale, t } = useLocale();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /**
   * A aprovação de pedido, que é preferência da empresa e não escolha nossa.
   *
   * Uma fábrica quer que o dono veja cada pedido antes de a produção começar;
   * outra tem três clientes e a aprovação só atrasa a entrega. Os dois caminhos
   * existem e a empresa liga o seu - é a mesma regra que decidiu a entrada no
   * chão de fábrica, e ela vale aqui pelo mesmo motivo.
   */
  const { data: approval, refresh: refreshApproval } = useQuery<boolean>(() => ordersNeedApproval());

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
        message: sayBlocker(blocker, t),
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
      message: `${sayTally(area, tallyFor(area, counts), t)}\n\n${t.app.settings.noUndo}`,
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
        title: e instanceof EraseBlockedError ? t.app.settings.cannotYet : t.app.settings.failedToErase,
        message:
          e instanceof EraseBlockedError
            ? sayBlocker(e.blocker, t)
            : e instanceof Error
              ? e.message
              : String(e),
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

  /**
   * Encher o app com movimento, para poder olhar as telas.
   *
   * O exemplo que vem de fábrica tem um dia de idade e nunca se moveu: prova
   * que a tela desenha, não que ela diz alguma coisa. Metade do briefing só
   * tem o que dizer quando existe passado - "saíram 480 hoje, 200 a mais que na
   * segunda passada" precisa de uma segunda passada.
   *
   * A confirmação diz o que vai ser escrito, como toda escrita deste app, e diz
   * também que o livro-razão fica com esses lançamentos: é dado de verdade num
   * banco de verdade, não um modo de demonstração que some ao fechar.
   */
  const onSimulate = async () => {
    if (busy) return;

    const go = await confirm({
      title: t.app.settings.simulateTitle,
      message: t.app.settings.simulateBody,
      confirmLabel: t.app.settings.simulateConfirm,
    });
    if (!go) return;

    setBusy(true);
    try {
      const feito = await simulateFortnight(LOCAL_COMPANY_ID, { timeZone: locale.timeZone });
      refresh();
      await confirm({
        title: t.app.settings.simulateConfirm,
        message: fill(t.app.settings.simulateDone, {
          runs: String(feito.runs),
          deliveries: String(feito.deliveries),
          invoices: String(feito.invoices),
        }),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } catch (e) {
      await confirm({
        title: t.app.settings.failedToSimulate,
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

      <Pressable
        onPress={async () => {
          await setOrdersNeedApproval(!approval);
          refreshApproval();
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: Boolean(approval) }}
        accessibilityLabel={t.app.settings.approval.label}
      >
        <Card>
          <View style={[styles.row, { gap: space.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[type.cardTitle, { color: color.ink }]}>
                {t.app.settings.approval.label}
              </Text>
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.settings.approval.hint}
              </Text>
            </View>
            <Chip
              signal={approval ? 'ok' : 'neutral'}
              label={approval ? t.app.settings.approval.on : t.app.settings.approval.off}
            />
          </View>
        </Card>
      </Pressable>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          {t.app.settings.clearByArea}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          {t.app.settings.clearByAreaHint}
        </Text>

        {AREAS.map((entry) => {
          const label =
            entry.area === 'purchases' ? t.app.settings.purchasesRow : t.app.settings[entry.area];
          const blocker = counts ? blockerFor(entry.area, counts) : null;
          const blocked = counts ? (blocker ? sayBlocker(blocker, t) : null) : t.app.settings.checking;
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

      {/* Ver o app com movimento, em vez do exemplo de um dia.
          Fica embaixo do que apaga e do que restaura, porque é da mesma
          família: mexe no que está guardado, e diz antes o que vai fazer. */}
      {total > 0 && !loading ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.simulate}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.settings.simulateBody}
          </Text>
          <Pressable
            onPress={() => void onSimulate()}
            disabled={busy}
            accessibilityRole="button"
            style={[
              styles.destructive,
              { borderColor: color.lineStrong, marginTop: space.md, paddingVertical: space.md },
            ]}
          >
            <Text style={[type.body, { color: color.inkMuted, fontWeight: '600' }]}>
              {t.app.settings.simulateConfirm}
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
