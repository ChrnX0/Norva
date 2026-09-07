import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useAppearance } from './Appearance';
import { resolveScheme } from './scheme';
import {
  hues,
  motion,
  skins,
  space,
  type as typeBase,
  type Ambient,
  type ColorScheme,
  type Palette,
  type Skin,
  type Tracos,
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
  /**
   * A cor da identidade: a paisagem no Orgânico, a tinta de acento no Papel.
   *
   * Diferente de `accent`, que é o tom da ÁREA em que a pessoa está (produção é
   * laranja, transporte é roxo, e isso não muda com o gosto de ninguém). A marca
   * é a escolha; a área é o significado.
   */
  brand: string;
  /** The ambient hue of the area the user is currently in. */
  accent: string;
  /**
   * Qual área, e não só a cor dela.
   *
   * Existe porque uma peça montada FORA da tela — a folha de confirmação, que
   * mora na raiz — precisa vestir a área de quem a chamou, e cor passada na mão
   * é exatamente o que a regra de baixo proíbe: *"No screen ever passes a color
   * down by hand"*. Com o nome da área, a peça abre um `AreaProvider` e tudo lá
   * dentro (botão, régua, crachá) acerta sozinho.
   */
  area: Ambient;
  type: typeof typeBase;
  space: typeof space;
  /** Os cantos são da identidade: retos no Papel, generosos no Orgânico. */
  radius: { sm: number; md: number; lg: number; xl: number; pill: number; controle: number };
  /**
   * O que esta pele decide, dito por ela em vez de adivinhado por cada tela.
   *
   * Ver `Tracos` em `./tokens`: é o que impede que a terceira pele nasça caindo
   * no ramo `else` de oito componentes que ninguém lembrou de abrir.
   */
  tracos: Tracos;
  /**
   * A família dos títulos — serifa no Papel, a do sistema no Orgânico.
   *
   * Ela já entrava sozinha nos estilos de `type`, e isso bastava enquanto todo
   * título saía de lá. A capa aprovada tem duas tipografias que `type` não
   * cobre: a manchete de 29 e o número de 48, ambos serifados e ambos com peso
   * próprio. Sem expor a família, a capa teria que repetir a palavra `'serif'`
   * — e no dia em que o Papel trocasse de fonte, a capa continuaria na antiga.
   */
  titleFamily: string | undefined;
  /**
   * A espessura do traço de um desenho nesta cara.
   *
   * Todo `Glyph` recebe `weight`, e o valor certo depende da identidade: fino no
   * Papel, cheio no Orgânico. Ele vem daqui em vez de ser recalculado na tela
   * porque já foi recalculado em vinte e seis lugares, e vinte e seis cópias de
   * uma decisão são vinte e seis chances de uma delas ficar para trás.
   */
  traco: number;
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
  const { skin, hue, scheme: escolha } = useAppearance();
  const doAparelho = useColorScheme();

  // A regra mora em `./scheme`, e não aqui: dentro do componente só o navegador
  // a alcançava, e a suíte de mutação roda a unidade. O gancho do aparelho é
  // chamado em toda renderização, sem condicional, porque gancho de React não
  // pode entrar e sair conforme a escolha.
  const scheme: ColorScheme = resolveScheme(escolha, doAparelho);

  const value = useMemo<Theme>(() => {
    const chosen = skins[skin];
    const color = chosen[scheme];

    // A serifa entra nos títulos E NOS NÚMEROS. No corpo, nunca.
    //
    // O "nunca no número" durou até a foto: o desenho aprovado escreve 500, 478
    // e 481 em serifa, e é isso que faz a página parecer impressa em vez de
    // parecer um painel. Com a manchete serifada e o número ao lado em sans, a
    // tela ficava com duas tipografias brigando na mesma linha de leitura.
    //
    // A objeção antiga era a figura tabular — coluna que dança a cada
    // atualização. Ela continua de pé e continua atendida: `fontVariant:
    // ['tabular-nums']` está em cada número que se empilha, e a serifa do
    // sistema no Android traz `tnum`. O que muda é a família, não a métrica.
    //
    // O corpo fica fora de propósito: parágrafo em serifa, num celular de
    // fábrica com a tela suja e luz de galpão, é o que faz alguém parar de ler.
    const familia = chosen.titleFamily;
    const type = familia
      ? {
          ...typeBase,
          display: { ...typeBase.display, fontFamily: familia },
          displaySmall: { ...typeBase.displaySmall, fontFamily: familia },
          section: { ...typeBase.section, fontFamily: familia },
          cardTitle: { ...typeBase.cardTitle, fontFamily: familia },
          figure: { ...typeBase.figure, fontFamily: familia },
          hero: { ...typeBase.hero, fontFamily: familia },
        }
      : typeBase;

    return {
      scheme,
      color,
      palette: color,
      skin,
      // A marca sai do tom escolhido só na pele que tem tom escolhido. A
      // pergunta é da PELE — perguntar `skin === 'organico'` aqui era a mesma
      // resposta escrita no lugar errado, e a terceira pele herdaria o tom sem
      // ninguém decidir isso.
      brand: chosen.tracos.marcaVemDoTom ? hues[hue].brand : color.apricot,
      accent: color[area],
      area,
      type,
      space,
      radius: chosen.radius,
      tracos: chosen.tracos,
      titleFamily: familia,
      traco: chosen.traco,
      motion,
    };
  }, [scheme, area, skin, hue]);

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
