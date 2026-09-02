/**
 * Design tokens.
 *
 * Two color families that never mix, separated by saturation and role:
 *
 *   AMBIENT — desaturated, one per area of the app. Says WHERE you are.
 *             Appears in exactly four places: the 3px card rail, the header
 *             icon, the primary button, and a chart stroke. Never as a full
 *             surface: a fully colored card tires the eyes of someone staring
 *             at the screen for eight hours.
 *
 *   SIGNAL  — saturated, in small doses only. Says WHAT is happening.
 *             Never decorates. If green shows up in a chart because it looked
 *             nice, green stops meaning "checked" and the user stops trusting
 *             color at all.
 *
 * Color never travels alone: every state carries its word too, because some
 * people are colorblind and some screens are bad under warehouse lighting.
 */

export const ambient = [
  'sky',
  'apricot',
  'mint',
  'lilac',
  'rose',
  'sage',
  'sand',
  'mist',
] as const;

export type Ambient = (typeof ambient)[number];

/** Which area of the app each ambient hue belongs to. */
export const ambientArea: Record<Ambient, string> = {
  sky: 'home',
  apricot: 'production',
  mint: 'inventory',
  lilac: 'distribution',
  rose: 'storeMirror',
  sage: 'purchasing',
  sand: 'finance',
  mist: 'settings',
};

const lightPalette = {
  paper: '#F7F6F3',
  surface: '#FFFFFF',
  sunken: '#EFEDE8',
  ink: '#23211E',
  inkMuted: '#57534D',
  inkFaint: '#8A857D',
  line: '#E7E4DE',
  lineStrong: '#D7D3CA',
  onAccent: '#FFFFFF',

  sky: '#3F7096',
  apricot: '#A75F3A',
  mint: '#2F7D6B',
  lilac: '#67589C',
  rose: '#A3505C',
  sage: '#5A7B49',
  sand: '#9A7429',
  mist: '#6E6A64',

  ok: '#2F7D5A',
  warning: '#C7841E',
  danger: '#C0453C',
  neutral: '#6E6A65',
};

/**
 * Dark is neutral gray, not navy. Ambient hues brighten so they stay legible
 * on gray, and shrink further into accent-only duty: gray dominates, color
 * accents.
 */
const darkPalette: typeof lightPalette = {
  paper: '#141414',
  surface: '#1E1E1E',
  sunken: '#262626',
  ink: '#EDEBE7',
  inkMuted: '#ADA9A2',
  inkFaint: '#7A756E',
  line: '#333130',
  lineStrong: '#454240',
  onAccent: '#141414',

  sky: '#8FB6D8',
  apricot: '#E2A283',
  mint: '#6FC4AE',
  lilac: '#AB9BDD',
  rose: '#DE97A2',
  sage: '#A2BE8C',
  sand: '#D9B76A',
  mist: '#A8A39B',

  ok: '#5DBF92',
  warning: '#E0AB53',
  danger: '#E0766D',
  neutral: '#A8A39B',
};

export const palettes = { light: lightPalette, dark: darkPalette };
export type Palette = typeof lightPalette;
export type ColorScheme = keyof typeof palettes;

/**
 * Type scale, deliberately one step larger than the market default. The people
 * using this app read it in a cold room, under bad light, sometimes with a
 * dirty screen. Body is 17, not the usual 14-16.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 38, fontWeight: '600' as const, letterSpacing: -0.8 },
  displaySmall: { fontSize: 22, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.5 },
  section: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.3 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '400' as const },
  secondary: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  /** Numbers always use tabular figures so columns stop dancing on update. */
  figure: { fontSize: 28, lineHeight: 32, fontWeight: '600' as const, letterSpacing: -0.7 },
  /**
   * The one number a screen is about, read at arm's length.
   *
   * Fifty-six points is not decoration: the briefing exists to be answered from
   * the doorway, and a cost read at 28 has to be walked up to. One per screen -
   * a second hero is two heroes, which is none.
   */
  hero: { fontSize: 56, lineHeight: 58, fontWeight: '600' as const, letterSpacing: -1.5 },
  /** Codes (lot, label) use a monospaced face: 0/O and 1/l must not blur. */
  code: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const, letterSpacing: 0.4 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const, letterSpacing: 1.4 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 } as const;

/** Generous corners are the most recognizable part of the One UI signature. */
export const radius = { sm: 9, md: 14, lg: 19, xl: 24, pill: 999 } as const;

/**
 * Spring physics, never linear easing. This is where "breathing" comes from.
 * Five motion rules govern usage:
 *   1. Nothing blinks. Pulses run 2.6-3.2s.
 *   2. At most two pulsing elements per screen.
 *   3. Only what is actually live may pulse.
 *   4. Motion never delays information.
 *   5. Reduced-motion turns it all off, and the screen stays complete.
 */
export const motion = {
  settle: { damping: 18, stiffness: 140, mass: 1 },
  press: { damping: 20, stiffness: 400, mass: 0.6 },
  pressScale: 0.97,
  staggerMs: 40,
  pulseMs: 2600,
  breatheMs: 3200,
  countMs: 1250,
} as const;

/** The rail that carries an area's color on a card. */
export const RAIL_WIDTH = 3;
