import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { IconChevron, IconCost, IconStock } from '@/components/icons';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';
import { palettes, type Ambient } from '@/theme/tokens';
import type { Dictionary } from '@/i18n';

/**
 * The index of one-screen summaries.
 *
 * The design canvas draws five rows: production by flavour, cost and margin,
 * stock, the store mirror, losses. Two of them ship here, and the three that do
 * not are the point of this file.
 *
 * A row that opens an empty screen teaches people to ignore the index - the
 * same defect as an invented alert, one level up. So a row exists only when the
 * screen behind it answers with real movements:
 *
 *  - "Margem" is not here because no sale price exists anywhere in this app:
 *    no column, no movement kind, no screen. Half of that arithmetic is
 *    missing, and a row promising it would be a lie with a chevron.
 *  - "Espelho da loja" is not here by the owner's own decision of 1 September:
 *    the capture ships, the report does not, because it lies with two weeks of
 *    data.
 *  - "Perdas" is not here because nothing writes a loss yet.
 *
 * They come back as their screens do, and the index grows honestly.
 */
export default function Reports() {
  return (
    <AreaProvider area="sand">
      <ReportIndex />
    </AreaProvider>
  );
}

const ROWS: {
  key: keyof Dictionary['app']['reports']['rows'];
  area: Ambient;
  route: string;
  Icon: typeof IconStock;
}[] = [
  { key: 'stock', area: 'mint', route: '/places', Icon: IconStock },
  { key: 'cost', area: 'sky', route: '/recipes', Icon: IconCost },
];

function ReportIndex() {
  const { color, scheme, type, space } = useTheme();
  const { t } = useLocale();
  const router = useRouter();
  const palette = palettes[scheme];

  return (
    <CollapsingHeader title={t.app.reports.title} overline={t.app.reports.subtitle}>
      <Card>
        {ROWS.map(({ key, area, route, Icon }) => {
          const words = t.app.reports.rows[key];
          return (
            <Pressable
              key={route}
              onPress={() => router.push(route as never)}
              accessibilityRole="button"
              accessibilityLabel={`${words.label}: ${words.detail}`}
              style={[styles.row, { paddingVertical: space.md, gap: space.md }]}
            >
              <Icon size={26} color={palette[area]} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: color.ink }]}>{words.label}</Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>{words.detail}</Text>
              </View>
              <IconChevron size={18} color={color.inkFaint} />
            </Pressable>
          );
        })}
      </Card>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
