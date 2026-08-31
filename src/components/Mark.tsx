import Svg, { Path } from 'react-native-svg';
import { brand } from '@/config/brand';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The mark: a solid disc with a 55-degree notch pointing north.
 *
 * It is the compass *dial*, not the needle - the body that rotates while the
 * reference settles. That reading is what makes the motion work with a single
 * piece: a needle spinning needs a dial behind it to mean anything, and this
 * shape already is the dial.
 *
 * One color, never two: with two tones the disc reads as a pie slice. Solid
 * mass with a single cut is also what survives 16px and prints on a monochrome
 * thermal label.
 */
export function Mark({ size = 24, color }: { size?: number; color?: string }) {
  const { scheme } = useTheme();
  const fill =
    color ?? (scheme === 'dark' ? brand.markColorDark : brand.markColorLight);

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image">
      <Path d={brand.markPath} fill={fill} />
    </Svg>
  );
}
