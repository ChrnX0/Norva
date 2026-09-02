import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useAppearance } from './Appearance';
import {
  motion,
  skins,
  space,
  type as typeBase,
  type Ambient,
  type ColorScheme,
  type Palette,
  type Skin,
} from './tokens';

type Theme = {
  scheme: ColorScheme;
  color: Palette;
  /**
   * A paleta inteira, para quem precisa de um tom que não é o da área.
   *
   * Existia como `palettes[scheme]` importado direto do arquivo de tokens em
   * doze telas - o que funcionava enquanto havia uma paleta só. Com duas
   * identidades, ler a paleta pelo esquema ignora qual cara está no ar, e a
   * tela desenha metade de uma e metade da outra.
   */
  palette: Palette;
  /** Qual das duas caras está no ar. */
  skin: Skin;
  /** The ambient hue of the area the user is currently in. */
  accent: string;
  type: typeof typeBase;
  space: typeof space;
  /** Os cantos são da identidade: retos no Papel, generosos no Orgânico. */
  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
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
  const { skin } = useAppearance();

  const value = useMemo<Theme>(() => {
    const chosen = skins[skin];
    const color = chosen[scheme];

    // A serifa entra só nos títulos, e nunca no corpo nem no número.
    //
    // Título em serifa é o que dá a cara de página impressa ao Papel. Corpo em
    // serifa, num celular de fábrica com a tela suja, é o que faz alguém parar
    // de ler - e o número em serifa perde a figura tabular, que é o que impede
    // a coluna de dançar a cada atualização.
    const familia = chosen.titleFamily;
    const type = familia
      ? {
          ...typeBase,
          display: { ...typeBase.display, fontFamily: familia },
          displaySmall: { ...typeBase.displaySmall, fontFamily: familia },
          section: { ...typeBase.section, fontFamily: familia },
          cardTitle: { ...typeBase.cardTitle, fontFamily: familia },
        }
      : typeBase;

    return {
      scheme,
      color,
      palette: color,
      skin,
      accent: color[area],
      type,
      space,
      radius: chosen.radius,
      motion,
    };
  }, [scheme, area, skin]);

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
