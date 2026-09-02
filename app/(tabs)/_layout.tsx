import { Tabs } from 'expo-router/js-tabs';
import { Text, View } from 'react-native';
import {
  IconHome,
  IconMore,
  IconProduction,
  IconReports,
  IconTransport,
} from '@/components/icons';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { palettes, type Ambient } from '@/theme/tokens';

/**
 * The five places the app has.
 *
 * It replaced a list of nine rows on the home screen - a menu the owner had to
 * read before doing anything. Five destinations that never move mean the thumb
 * learns where they are and stops reading. The order is the day's order: what
 * is happening now, what you made, what left, what it all added up to, and the
 * drawers you open once a month.
 *
 * Two rules from the design canvas, and both are about restraint. The colour
 * lives only in the icon's stroke - no coloured surface, no filled pill behind
 * the active tab. And the only signal of selection is the label's colour going
 * from faint to full: the icon keeps its area's colour whether the tab is
 * active or not, so the bar reads as five lit doors rather than one shouting.
 *
 * The detail screens - a recipe, an input, a purchase - live OUTSIDE this group
 * on purpose. Pushed from a tab, they cover the bar, which is what the canvas
 * draws: no artboard shows a tab bar on a screen you had to walk into.
 */
export default function TabsLayout() {
  const { color, scheme, type, space } = useTheme();
  const { t } = useLocale();
  const palette = palettes[scheme];

  const label = (title: string, focused: boolean) => (
    <Text
      style={[
        type.caption,
        { color: focused ? color.ink : color.inkFaint, marginTop: 2 },
      ]}
      numberOfLines={1}
    >
      {title}
    </Text>
  );

  // Named, because an anonymous arrow here is a component the React tooling
  // cannot label - and a tab bar that crashes reports five identical frames.
  const icon = (Icon: typeof IconHome, area: Ambient) => {
    function TabIcon() {
      return (
        <View style={{ height: 26, justifyContent: 'center' }}>
          <Icon size={24} color={palette[area]} />
        </View>
      );
    }
    return TabIcon;
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: color.paper,
          borderTopColor: color.line,
          borderTopWidth: 1,
          height: 58 + space.lg,
          paddingTop: space.sm,
        },
        // The label is drawn by hand so the active state is a colour change and
        // nothing else - no bold, no pill, no tint on the icon.
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: icon(IconHome, 'sky'),
          tabBarLabel: ({ focused }) => label(t.app.tabs.home, focused),
        }}
      />
      <Tabs.Screen
        name="production"
        options={{
          tabBarIcon: icon(IconProduction, 'apricot'),
          tabBarLabel: ({ focused }) => label(t.app.tabs.production, focused),
        }}
      />
      <Tabs.Screen
        name="transport"
        options={{
          tabBarIcon: icon(IconTransport, 'lilac'),
          tabBarLabel: ({ focused }) => label(t.app.tabs.transport, focused),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          tabBarIcon: icon(IconReports, 'sand'),
          tabBarLabel: ({ focused }) => label(t.app.tabs.reports, focused),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: icon(IconMore, 'mist'),
          tabBarLabel: ({ focused }) => label(t.app.tabs.more, focused),
        }}
      />
    </Tabs>
  );
}
