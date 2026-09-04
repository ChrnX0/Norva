import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The icons the design draws, and nothing else.
 *
 * Every shape here was traced from the artboards in the design canvas, not
 * picked from a library: the tab bar, the report rows and the "Mais" grid use
 * the same drawing at different sizes, which is what makes the app feel like
 * one hand drew it.
 *
 * Two rules the canvas states and this file obeys. The colour lives ONLY in the
 * stroke - no filled surfaces, ever - so an icon is a line drawing that carries
 * its area's colour and nothing more. And the stroke is 1.6px at 24px, scaled
 * with the size, so the weight reads the same at 26px in the bar and at 30px in
 * a list.
 */

type IconProps = {
  /** Side of the square box. The paths are drawn on a 24-unit grid. */
  size?: number;
  /** The area's colour. Never a fill - this is the stroke. */
  color: string;
};

const GRID = 24;

function frame(size: number) {
  return {
    width: size,
    height: size,
    viewBox: `0 0 ${GRID} ${GRID}`,
    fill: 'none' as const,
  };
}

/**
 * The stroke, in grid units.
 *
 * A constant, and that is the point: the viewBox does the scaling, so 1.6 units
 * on a 24-unit grid keeps the same apparent weight whether the icon is drawn at
 * 26px in the tab bar or at 30px in a list. Scaling it by hand would make the
 * line thicker as the icon grows, which is what makes an icon set look borrowed
 * from three places.
 */
const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Início — a house, because the briefing is where you come back to. */
export function IconHome({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" {...stroke(color)} />
    </Svg>
  );
}

/** Produção — a unidade saindo pela esteira: o que a fábrica pôs para fora. */
export function IconProduction({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Rect x="5" y="3.5" width="10" height="9" rx="2.2" {...stroke(color)} />
      <Path d="M4 16.5h13.5" {...stroke(color)} />
      <Path d="M17 13.8l2.7 2.7-2.7 2.7" {...stroke(color)} />
    </Svg>
  );
}

/** Transporte — a truck: what leaves the factory. */
export function IconTransport({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M2 7.5h11v9H2z" {...stroke(color)} />
      <Path d="M13 11h4l3.5 3.5v2H13z" {...stroke(color)} />
      <Circle cx="6.5" cy="18.5" r="1.9" {...stroke(color)} />
      <Circle cx="16.5" cy="18.5" r="1.9" {...stroke(color)} />
    </Svg>
  );
}

/** Relatórios — bars on a baseline. */
export function IconReports({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M4 20h16" {...stroke(color)} />
      <Path d="M6.5 20v-6" {...stroke(color)} />
      <Path d="M12 20V5" {...stroke(color)} />
      <Path d="M17.5 20v-9" {...stroke(color)} />
    </Svg>
  );
}

/** Mais — a 2×2 grid: the drawers. */
export function IconMore({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Rect x="3.5" y="3.5" width="7" height="7" rx="2" {...stroke(color)} />
      <Rect x="13.5" y="3.5" width="7" height="7" rx="2" {...stroke(color)} />
      <Rect x="3.5" y="13.5" width="7" height="7" rx="2" {...stroke(color)} />
      <Rect x="13.5" y="13.5" width="7" height="7" rx="2" {...stroke(color)} />
    </Svg>
  );
}

/** A cube: what is held somewhere. Used by the Estoque report row. */
export function IconStock({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" {...stroke(color)} />
      <Path d="M4 7.5l8 4.5 8-4.5" {...stroke(color)} />
      <Path d="M12 12v9" {...stroke(color)} />
    </Svg>
  );
}

/** Money: what a unit costs. */
export function IconCost({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M12 3v18" {...stroke(color)} />
      <Path d="M16 7.5a3.5 3.5 0 0 0-3.5-2.5h-1a3.5 3.5 0 0 0 0 7h1a3.5 3.5 0 0 1 0 7h-1A3.5 3.5 0 0 1 8 16.5" {...stroke(color)} />
    </Svg>
  );
}

/** A chevron, for a row that opens something. */
export function IconChevron({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M9.5 5l7 7-7 7" {...stroke(color)} />
    </Svg>
  );
}

/** A triangle with a bang: what was lost, and why the report exists. */
export function IconLoss({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M12 3.5l9 16H3z" {...stroke(color)} />
      <Path d="M12 9.5v5" {...stroke(color)} />
      <Path d="M12 17.2v.1" {...stroke(color)} />
    </Svg>
  );
}
