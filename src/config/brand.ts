/**
 * Single source of truth for the product's brand identity.
 *
 * The brand name is still pending a trademark clearance search (INPI classes 9
 * and 42), which cannot be automated: INPI requires a gov.br login and WIPO's
 * Global Brand Database is behind a CAPTCHA. To keep that uncertainty from
 * blocking engineering, nothing else in the codebase hardcodes the name.
 * Changing brands is an edit to this file plus `app.json`.
 */
export const brand = {
  /** Display name. Shown to users, never translated. */
  name: 'NORVA',

  /** Lowercase identifier used for storage keys, deep links and analytics. */
  slug: 'norva',

  /** Deep link scheme. Must match `expo.scheme` in app.json. */
  scheme: 'norva',

  /**
   * The mark: a solid disc with a 55-degree notch pointing north.
   * Rendered from this path on a 100x100 viewBox so every surface — splash,
   * icon, header, print — draws the exact same geometry.
   */
  markPath: 'M50,50 L70.3,11 A44,44 0 1,1 29.7,11 Z',

  /**
   * Graphite, not a hue. The interface carries eight ambient colors, one per
   * area; a colored mark would fight all of them. Graphite sits on any of them,
   * and prints on a monochrome thermal label — the printer on the factory floor.
   */
  markColorLight: '#2E2B27',
  markColorDark: '#EDEBE7',
} as const;

export type Brand = typeof brand;
