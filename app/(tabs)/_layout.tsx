import { Tabs } from 'expo-router/js-tabs';
import { Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconHome,
  IconMore,
  IconProduction,
  IconReports,
  IconTransport,
} from '@/components/icons';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { MEDIDA_EM_PARES, PARES_A_PARTIR_DE, type Ambient } from '@/theme/tokens';

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
  const { color, type, space, palette, tracos } = useTheme();
  const insets = useSafeAreaInsets();

  /**
   * No tablet, as cinco abas se juntam no meio em vez de se espalharem.
   *
   * A barra é da largura da tela, e está certo — é o rodapé da página. O que
   * não está certo é cada aba ocupar um quinto de 900 dp: cinco ícones de 24 dp
   * com 150 dp de nada entre eles, que foi a primeira coisa a saltar na foto do
   * tablet. A barra continua inteira (fundo e régua de borda a borda), e o que
   * se ajusta é o recheio: as abas ficam dentro da MESMA medida que o conteúdo
   * usa em duas colunas, alinhadas com ele. Abaixo de 840 dp nada muda.
   */
  const { width: larguraDaTela } = useWindowDimensions();
  const margemDasAbas =
    larguraDaTela >= PARES_A_PARTIR_DE ? Math.max(0, (larguraDaTela - MEDIDA_EM_PARES) / 2) : 0;
  const { t } = useLocale();

  /**
   * O rótulo da aba, e ele estava sendo CORTADO no celular do dono.
   *
   * A foto que ele mandou mostra "Transpo…" e "Relatóri…" na barra de baixo. Nenhuma
   * das minhas fotos jamais mostrou isso, e o motivo é que a ferramenta de olhar
   * fotografava 412 px e só: a 412 a palavra inteira cabe. A 360 — o Android comum,
   * o celular que uma fábrica de seis pessoas compra — ela não cabe, e o rótulo
   * perde letras.
   *
   * Rótulo cortado numa barra de navegação é pior que rótulo pequeno: quem lê de
   * luva, com a tela suja, reconhece a PALAVRA, não o prefixo dela. E o ícone
   * sozinho não resolve — foi por isso que o rótulo existe.
   *
   * Três coisas, e nenhuma delas encolhe o texto do aplicativo:
   *
   *   - `adjustsFontSizeToFit` com piso de 0,8: no aparelho, a palavra encolhe até
   *     caber em vez de perder letras. (Na web é ignorado — por isso o tamanho
   *     abaixo já cabe a 360 sem ele.)
   *   - Um ponto a menos SÓ NA BARRA (12 em vez de 13): a barra de abas é a única
   *     tipografia deste aplicativo que divide a largura da tela por cinco. O corpo
   *     continua em 17.
   *   - Teto de 1,15 no multiplicador do sistema: com a fonte grande do Android a
   *     palavra voltaria a estourar, e aqui o ícone carrega o significado junto.
   */
  const label = (title: string, focused: boolean) => (
    <Text
      style={[
        type.caption,
        {
          fontSize: 12,
          lineHeight: 16,
          color: focused ? color.ink : color.inkFaint,
          marginTop: 2,
          textAlign: 'center',
        },
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      maxFontSizeMultiplier={1.15}
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
        // A altura soma a faixa do sistema, e isso não é detalhe de acabamento.
        //
        // A foto do emulador mostrou a barra CORTADA: os cinco rótulos comidos
        // pela barra de três botões do Android, que mora por cima. A altura era
        // 74 fixos, e 74 é a altura da barra — não a altura da barra mais o que
        // o aparelho reserva embaixo dela. Num celular com gesto o `bottom` é
        // pequeno; num com três botões são 48 dp, e some uma linha inteira.
        tabBarStyle: {
          // A barra é do material da PELE, não uma cor fixa.
          //
          // Ela era `paper` nas duas, e no dia em que o chão do Orgânico ganhou
          // verde de verdade a barra virou a mesma cor da página com uma linha que
          // não se vê — cinco ícones flutuando no nada embaixo da tela. Numa pele
          // que separa assunto por SUPERFÍCIE, a barra é uma superfície: branca,
          // como os cartões que sobrevoam a paisagem. Numa pele de PÁGINA ela é o
          // papel com uma régua em cima, que é como o rodapé de uma página
          // impressa se separa do corpo.
          backgroundColor: tracos.genero === 'superficie' ? color.surface : color.paper,
          borderTopColor: tracos.genero === 'superficie' ? color.line : color.lineStrong,
          borderTopWidth: 1,
          height: 58 + space.lg + insets.bottom,
          paddingTop: space.sm,
          paddingBottom: insets.bottom,
          paddingHorizontal: margemDasAbas,
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
