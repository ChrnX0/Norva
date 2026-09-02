import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { IconChevron } from '@/components/icons';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';
import { type Ambient } from '@/theme/tokens';
import type { Dictionary } from '@/i18n';

/**
 * The drawers: what you open once a month, not once a shift.
 *
 * The canvas draws three groups - CADASTROS, DINHEIRO, CONFIGURAÇÕES. Only two
 * ship, and the missing one is deliberate: "Financeiro" and "Notas fiscais"
 * have nothing behind them. There is no sale price in this app, no account, no
 * fiscal service - that one is a separate .NET project with an A1 certificate
 * and a SEFAZ homologation, and the plan says nothing depends on it. A drawer
 * that opens onto nothing is worse than a drawer that is not drawn.
 *
 * "Pessoas" is missing for the same reason: `operator_id` is a column with no
 * table of people behind it yet.
 *
 * And one card here is NOT in the canvas: "Pergunte". The assistant exists,
 * answers fourteen questions offline, and the five artboards never drew it -
 * leaving it unreachable would have quietly deleted a finished feature, so it
 * sits at the top, full width. That placement is mine, and it is the one thing
 * on this screen the owner did not draw.
 */
export default function More() {
  return (
    <AreaProvider area="mist">
      <Drawers />
    </AreaProvider>
  );
}

type Row = { key: keyof Dictionary['app']['more']['rows']; area: Ambient; route: string };

const REGISTERS: Row[] = [
  { key: 'inputs', area: 'mist', route: '/inputs' },
  { key: 'recipes', area: 'apricot', route: '/recipes' },
  { key: 'products', area: 'mist', route: '/products' },
  { key: 'places', area: 'mint', route: '/places' },
  { key: 'orders', area: 'mint', route: '/orders' },
  { key: 'purchases', area: 'sage', route: '/purchase' },
];

const SETTINGS: Row[] = [
  // A porta que não depende de rede: o cartão do clima na capa só existe quando
  // há previsão guardada, e quem abre o app pela primeira vez dentro da câmara
  // fria não tem nenhuma. Sem esta linha, trocar a cidade dependeria de ter
  // internet - que é a única coisa que essa tela existe para consertar.
  { key: 'weather', area: 'sky', route: '/weather' },
  { key: 'settings', area: 'mist', route: '/settings' },
];

function Drawers() {
  const { color, type, space, palette } = useTheme();
  const { t } = useLocale();
  const router = useRouter();

  const group = (title: string, rows: Row[]) => (
    <Card>
      <Text
        style={[
          type.caption,
          { color: color.inkFaint, letterSpacing: 1, marginBottom: space.sm },
        ]}
      >
        {title}
      </Text>
      {rows.map((row) => (
        <Pressable
          key={row.route}
          onPress={() => router.push(row.route as never)}
          accessibilityRole="button"
          accessibilityLabel={t.app.more.rows[row.key]}
          style={[styles.row, { paddingVertical: space.md, gap: space.md }]}
        >
          <View style={[styles.swatch, { backgroundColor: palette[row.area] }]} />
          <Text style={[type.body, { color: color.ink, flex: 1 }]}>
            {t.app.more.rows[row.key]}
          </Text>
          <IconChevron size={18} color={color.inkFaint} />
        </Pressable>
      ))}
    </Card>
  );

  return (
    <CollapsingHeader title={t.app.more.title}>
      <Pressable onPress={() => router.push('/assistant')} accessibilityRole="button">
        <Card tone="area">
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.more.ask.label}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.more.ask.hint}
          </Text>
        </Card>
      </Pressable>

      {group(t.app.more.groups.registers, REGISTERS)}
      {group(t.app.more.groups.settings, SETTINGS)}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 10, height: 10, borderRadius: 5 },
});
