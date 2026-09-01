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

const AREAS: { area: EraseArea; label: string; hint: string }[] = [
  { area: 'purchases', label: 'Compras', hint: 'notas lançadas, custo médio e histórico de preço' },
  { area: 'recipes', label: 'Receitas', hint: 'fichas técnicas e todas as versões' },
  { area: 'products', label: 'Produtos', hint: 'o que sai para vender' },
  { area: 'inputs', label: 'Insumos', hint: 'almoxarifado, embalagem e material de loja' },
];

function Settings() {
  const { color, type, space } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const { data, loading, refresh } = useQuery(
    async () => ({
      counts: await countForErase(LOCAL_COMPANY_ID),
      seeded: await hasSeeded(),
    }),
    [],
  );

  const counts: EraseCounts | null = data?.counts ?? null;

  const run = async (area: EraseArea, label: string) => {
    if (!counts || busy) return;

    const blocker = blockerFor(area, counts);
    if (blocker) {
      // Law 5 again: this is not an error report after the fact - the button
      // was already disabled, and this explains the same thing on demand.
      await confirm({
        title: 'Ainda não dá',
        message: blocker,
        acknowledge: true,
        confirmLabel: 'Entendi',
      });
      return;
    }

    const go = await confirm({
      title: area === 'all' ? 'Apagar tudo?' : `Apagar ${label.toLowerCase()}?`,
      message: `${summaryFor(area, counts)}\n\nIsso não tem volta.`,
      confirmLabel: 'Apagar',
      destructive: true,
    });
    if (!go) return;

    setBusy(true);
    try {
      await eraseArea(LOCAL_COMPANY_ID, area);
      refresh();
    } catch (e) {
      await confirm({
        title: 'Não deu para apagar',
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: 'Entendi',
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;

    const go = await confirm({
      title: 'Trazer o exemplo de volta?',
      message:
        'Recoloca os insumos, a receita e o produto de demonstração, com as compras que dão o ' +
        'custo a eles. Só funciona se estiver vazio.',
      confirmLabel: 'Restaurar',
    });
    if (!go) return;

    setBusy(true);
    try {
      await restoreStarterData();
      refresh();
    } catch (e) {
      await confirm({
        title: 'Não deu para restaurar',
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: 'Entendi',
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
    <CollapsingHeader title="Ajustes" overline={`${brand.name} · versão ${Constants.expoConfig?.version ?? '—'}`}>
      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink }]}>O que está guardado</Text>
        {loading || !counts ? (
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            Conferindo…
          </Text>
        ) : (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Line label="Insumos" value={counts.inputs} />
            <Line label="Receitas" value={counts.recipes} />
            <Line label="Produtos" value={counts.products} />
            <Line label="Compras lançadas" value={counts.purchases} />
          </View>
        )}

        {!loading && data?.seeded ? (
          <View style={{ marginTop: space.md }}>
            <Chip
              signal="neutral"
              label={total > 0 ? 'Inclui os dados de exemplo' : 'Vazio, sem exemplo'}
            />
          </View>
        ) : null}
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          Limpar por área
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          Uma área de cada vez, quando você quiser refazer só uma parte.
        </Text>

        {AREAS.map((entry) => {
          const blocked = counts ? blockerFor(entry.area, counts) : 'Carregando…';
          return (
            <Pressable
              key={entry.area}
              onPress={() => void run(entry.area, entry.label)}
              disabled={busy || !counts}
              accessibilityRole="button"
              accessibilityLabel={`Apagar ${entry.label}`}
              accessibilityState={{ disabled: Boolean(blocked) }}
              style={[styles.row, { paddingVertical: space.md, gap: space.md }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: blocked ? color.inkFaint : color.ink }]}>
                  {entry.label}
                </Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {/* The reason replaces the hint rather than sitting beside a
                      dead button: the person needs the way out, not the label. */}
                  {blocked ?? entry.hint}
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
        <Text style={[type.cardTitle, { color: color.ink }]}>Começar do zero</Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
          Apaga tudo de uma vez, na ordem certa. Depois disso o aplicativo abre vazio e o exemplo
          não volta sozinho.
        </Text>

        <Pressable
          onPress={() => void run('all', 'tudo')}
          disabled={busy || !counts || total === 0}
          accessibilityRole="button"
          accessibilityLabel="Apagar tudo"
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
            {busy ? 'Apagando…' : 'Apagar tudo'}
          </Text>
        </Pressable>
      </Card>

      {total === 0 && !loading ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>Dados de exemplo</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            Está vazio. Se quiser ver o aplicativo funcionando antes de cadastrar o seu, dá para
            trazer o exemplo de volta.
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
              Restaurar dados de exemplo
            </Text>
          </Pressable>
        </Card>
      ) : null}

      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={[type.secondary, { color: color.inkFaint, textAlign: 'center' }]}>
          Voltar
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
