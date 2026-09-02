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

/**
 * As duas caras do produto.
 *
 * O dono viu quarenta esboços e escolheu duas identidades — **Papel** e
 * **Orgânico** — e decidiu que as duas ficam, com claro e escuro, trocáveis nos
 * ajustes. Não é indecisão: são dois negócios diferentes olhando a mesma tela.
 * A fábrica que mostra o app para o contador quer a página impressa; a que abre
 * o celular na doca às seis da manhã quer a paisagem.
 *
 * O que muda entre elas é o que muda numa identidade de verdade: a **paleta**,
 * a **família tipográfica**, o **raio dos cantos** e o **cabeçalho** (a linha de
 * traço fino contra a colina desenhada). O que NÃO muda é a escala de tamanhos:
 * corpo 17, herói 56 e figura 28 continuam iguais nas duas, porque essa escala
 * não é estilo — é o tamanho que se lê numa câmara fria, de luva, com a tela
 * suja, e trocar isso por gosto seria trocar legibilidade por decoração.
 */
export type Skin = 'papel' | 'organico';

const papelClaro: Palette = {
  paper: '#FAF7F2',
  surface: '#FFFFFF',
  sunken: '#F1EDE5',
  ink: '#221F1B',
  inkMuted: '#6F6558',
  inkFaint: '#A2988A',
  line: '#E2DBD0',
  lineStrong: '#D5CABB',
  onAccent: '#FFFFFF',

  sky: '#6F8188',
  apricot: '#B4552D',
  mint: '#3D7A53',
  lilac: '#6D5F86',
  rose: '#A3505C',
  sage: '#5A7B49',
  sand: '#B28E42',
  mist: '#9A9083',

  ok: '#3D7A53',
  warning: '#B4552D',
  danger: '#A8442A',
  neutral: '#6F6558',
};

const papelEscuro: Palette = {
  paper: '#15110D',
  surface: '#1E1915',
  sunken: '#262019',
  ink: '#F4ECE0',
  inkMuted: '#B6A894',
  inkFaint: '#7E7161',
  line: '#2F271F',
  lineStrong: '#42392E',
  onAccent: '#15110D',

  sky: '#8FA8B0',
  apricot: '#E08A5A',
  mint: '#6FBF8F',
  lilac: '#B0A0CC',
  rose: '#DE97A2',
  sage: '#A2BE8C',
  sand: '#D9B76A',
  mist: '#A8A39B',

  ok: '#6FBF8F',
  warning: '#E08A5A',
  danger: '#E8785F',
  neutral: '#B6A894',
};

const organicoClaro: Palette = {
  paper: '#F3F7F3',
  surface: '#FFFFFF',
  sunken: '#E7EFE8',
  ink: '#16281D',
  inkMuted: '#4D6055',
  inkFaint: '#8BA192',
  line: '#DDE9DF',
  lineStrong: '#C6D8CA',
  onAccent: '#FFFFFF',

  sky: '#5B8EC9',
  apricot: '#E29B52',
  mint: '#2F7D5C',
  lilac: '#6B7FD0',
  rose: '#C4677A',
  sage: '#5A7B49',
  sand: '#B28E42',
  mist: '#8BA192',

  ok: '#2F7D5C',
  warning: '#C2751F',
  danger: '#C0453C',
  neutral: '#4D6055',
};

const organicoEscuro: Palette = {
  paper: '#0C1512',
  surface: '#13201B',
  sunken: '#1A2B24',
  ink: '#EAF5EE',
  inkMuted: '#9DB8A9',
  inkFaint: '#6B8377',
  line: '#1C2F27',
  lineStrong: '#2A443A',
  onAccent: '#0C1512',

  sky: '#7FB6E8',
  apricot: '#F0A868',
  mint: '#5EF2A8',
  lilac: '#A79BEA',
  rose: '#E58FA0',
  sage: '#A2BE8C',
  sand: '#E5C377',
  mist: '#7F9A8C',

  ok: '#5EF2A8',
  warning: '#F5A35E',
  danger: '#F5715E',
  neutral: '#9DB8A9',
};

/**
 * A família tipográfica de cada identidade.
 *
 * `serif` no Papel e nulo no Orgânico — nulo quer dizer "a fonte do sistema",
 * que é a certa para a identidade macia e é também a que existe em qualquer
 * aparelho. `serif` é o nome genérico que Android e iOS resolvem sozinhos, sem
 * embarcar arquivo de fonte: um aplicativo que abre offline numa câmara fria não
 * paga megabytes por uma família de texto.
 */
export const skins = {
  papel: {
    light: papelClaro,
    dark: papelEscuro,
    /** Serifa nos títulos; o resto continua na fonte do sistema. */
    titleFamily: 'serif' as const,
    radius: { sm: 4, md: 6, lg: 8, xl: 10, pill: 999 },
  },
  organico: {
    light: organicoClaro,
    dark: organicoEscuro,
    titleFamily: undefined,
    radius: { sm: 12, md: 18, lg: 22, xl: 28, pill: 999 },
  },
} as const;
