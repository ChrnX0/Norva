import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  motion,
  palettes,
  radius,
  space,
  type,
  type Ambient,
  type ColorScheme,
  type Palette,
} from './tokens';

type Theme = {
  scheme: ColorScheme;
  color: Palette;
  /** The ambient hue of the area the user is currently in. */
  accent: string;
  type: typeof type;
  space: typeof space;
  radius: typeof radius;
  motion: typeof motion;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  children,
  area = 'sky',
}: {
  children: ReactNode;
  area?: Ambient;
}) {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const value = useMemo<Theme>(() => {
    const color = palettes[scheme];
    return { scheme, color, accent: color[area], type, space, radius, motion };
  }, [scheme, area]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside a ThemeProvider');
  return theme;
}

/**
 * Screens declare which area they belong to; every component below picks the
 * accent up from context. No screen ever passes a color down by hand.
 */
export function AreaProvider({ area, children }: { area: Ambient; children: ReactNode }) {
  return <ThemeProvider area={area}>{children}</ThemeProvider>;
}
