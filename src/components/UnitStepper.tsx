import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { formatQuantity, type LocaleSettings } from '@/i18n';
import { breakdown, toBaseUnits, type PackagingHierarchy, type PackagingTier } from '@/domain/units';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Quantity entry, in the operator's own words.
 *
 * Nobody in a cold room thinks in "3,600 popsicles" - they think in "12
 * crates". So the tier is picked first, the amount is stepped with large
 * targets rather than typed on a keyboard, and the arithmetic is echoed back
 * in full underneath.
 *
 * The echo is the whole point: it removes mental math, which is where miscounts
 * come from, and it lets the person catch a wrong tier before committing.
 */
export function UnitStepper({
  hierarchy,
  locale,
  tierLabel,
  value,
  onChange,
  labels,
}: {
  hierarchy: PackagingHierarchy;
  locale: LocaleSettings;
  /** Resolves a tier id to a plural-aware noun in the current language. */
  tierLabel: (tierId: string, count: number) => string;
  /** Current amount, always in base units - storage never sees a tier. */
  value: number;
  onChange: (baseUnits: number) => void;
  labels: { decrease: string; increase: string };
}) {
  const { color, radius, space, type, accent } = useTheme();
  const [tier, setTier] = useState<PackagingTier>(
    () => [...hierarchy.tiers].reverse()[0] ?? hierarchy.tiers[0],
  );

  const countInTier = Math.round(value / tier.perBaseUnit);

  const echo = useMemo(() => {
    const parts = breakdown(value, hierarchy).map(
      (part) =>
        `${formatQuantity(part.quantity, locale)} ${tierLabel(part.tier.id, part.quantity)}`,
    );
    if (parts.length === 0) return tierLabel(hierarchy.tiers[0].id, 0);
    return parts.join(' · ');
  }, [value, hierarchy, locale, tierLabel]);

  const step = (delta: number) => {
    const next = Math.max(0, countInTier + delta);
    void Haptics.selectionAsync();
    onChange(toBaseUnits(next, tier));
  };

  return (
    <View style={{ gap: space.md }}>
      <View
        style={[
          styles.segment,
          { backgroundColor: color.sunken, borderRadius: radius.pill, padding: space.xs },
        ]}
        accessibilityRole="radiogroup"
      >
        {hierarchy.tiers.map((option) => {
          const selected = option.id === tier.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={tierLabel(option.id, 2)}
              onPress={() => setTier(option)}
              style={[
                styles.segmentItem,
                {
                  borderRadius: radius.pill,
                  paddingVertical: space.sm + 2,
                  backgroundColor: selected ? color.surface : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  type.secondary,
                  { color: selected ? color.ink : color.inkMuted, fontWeight: '500' },
                ]}
              >
                {tierLabel(option.id, 2)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.row, { gap: space.md }]}>
        <StepButton label={labels.decrease} symbol="−" onPress={() => step(-1)} />
        <Text
          style={[type.display, styles.value, { color: color.ink }]}
          accessibilityLiveRegion="polite"
        >
          {formatQuantity(countInTier, locale)}
        </Text>
        <StepButton label={labels.increase} symbol="+" onPress={() => step(1)} />
      </View>

      <Text style={[type.secondary, styles.echo, { color: color.inkMuted }]}>
        = {echo}
      </Text>

      <View style={[styles.underline, { backgroundColor: accent }]} />
    </View>
  );
}

function StepButton({
  label,
  symbol,
  onPress,
}: {
  label: string;
  symbol: string;
  onPress: () => void;
}) {
  const { color, space, motion } = useTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => {
        scale.value = withSpring(0.92, motion.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.press);
      }}
      onPress={onPress}
      style={[
        styles.stepButton,
        { backgroundColor: color.sunken, borderColor: color.lineStrong },
        animated,
      ]}
    >
      <Text style={{ fontSize: 26, lineHeight: 30, color: color.ink }}>{symbol}</Text>
      <View style={{ width: space.xs }} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 4 },
  segmentItem: { flex: 1, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  value: { flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] },
  echo: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  /** 48dp minimum: this is pressed with gloves on, in the cold. */
  stepButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  underline: { height: 2, borderRadius: 2, alignSelf: 'center', width: 32, opacity: 0.4 },
});
