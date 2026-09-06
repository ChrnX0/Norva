import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { Children, isValidElement, useContext, type ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reveal } from '@/components/Reveal';
import { Mark } from './Mark';
import { MEDIDA_DA_PAGINA, MEDIDA_EM_PARES, PARES_A_PARTIR_DE } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const EXPANDED = 34;
const COLLAPSED = 22;
const RANGE = 72;


/**
 * Marca um filho que ocupa a largura INTEIRA mesmo quando a tela pareia.
 *
 * A gaveta do "Mais" tem quatro peças, e uma delas não é grupo: "Pergunte" é
 * uma chamada só, curta. Emparelhada com "Cadastros" — quatro portas de altura —
 * ela deixava um buraco do tamanho de três portas embaixo de si, e foi
 * exatamente esse buraco que o dono apontou: *"só pode ser brincadeira que você
 * ainda tem esse layout fora de padrão"*. Grade é para irmãos; o que não é irmão
 * fica inteiro, em cima, e a grade começa depois dele.
 */
export function Inteiro({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * The large title that shrinks as you scroll - the most recognizable part of
 * the One UI signature, and the reason the top of every screen is breathing
 * room rather than a row of buttons.
 *
 * Actions live in the lower half of the screen, within thumb reach. Nothing
 * important ever sits up here.
 */
export function CollapsingHeader({
  title,
  overline,
  pares = false,
  children,
}: {
  title: string;
  overline?: string;
  /**
   * Esta tela é feita de cartões IRMÃOS, e pode virar duas colunas no tablet.
   *
   * Escolha de quem chama, e não do casco, porque a resposta é de cada tela. A
   * capa é uma página editorial que lê de cima para baixo — parti-la em duas
   * destrói a ordem que o dono aprovou. Formulário em duas colunas num aparelho
   * de toque é pior que em uma: o dedo volta para cima. Quem pareia é a tela cujo
   * conteúdo é uma lista de peças do mesmo tamanho e da mesma importância.
   *
   * Abaixo de 840 dp não muda nada, então nenhum telefone corre risco por causa
   * disto.
   */
  pares?: boolean;
  children: ReactNode;
}) {
  const { color, space, type, accent, tracos, titleFamily } = useTheme();
  const insets = useSafeAreaInsets();
  // Em dp, que é o que o layout enxerga — nunca pixel.
  const { width: larguraDaTela } = useWindowDimensions();
  const emPares = pares && larguraDaTela >= PARES_A_PARTIR_DE;
  const medida = emPares ? MEDIDA_EM_PARES : MEDIDA_DA_PAGINA;
  const coluna = { width: '100%' as const, maxWidth: medida, alignSelf: 'center' as const };
  const largo = larguraDaTela >= MEDIDA_DA_PAGINA;

  // How much of the screen the tab bar covers, or nothing when there is no bar.
  //
  // Read from the context and NOT from `useBottomTabBarHeight()`: that hook
  // throws outside a tab screen, and nine screens in this app - a recipe, an
  // input, a purchase - are pushed on top of the bar rather than being tabs. A
  // hook that throws would take all nine down to save one line here.
  const tabBar = useContext(BottomTabBarHeightContext) ?? 0;
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const titleStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(scrollY.value, [0, RANGE], [EXPANDED, COLLAPSED], Extrapolation.CLAMP),
  }));

  const overlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, RANGE / 2], [1, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, RANGE / 2], [18, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <View
        style={[
          {
            paddingTop: insets.top + space.sm,
            paddingHorizontal: space.lg,
            paddingBottom: space.md,
            backgroundColor: color.paper,
          },
          // O título anda junto com os cartões: cabeçalho colado na borda
          // esquerda de um tablet, com a coluna centralizada embaixo, lê como
          // duas telas empilhadas.
          largo ? coluna : null,
        ]}
      >
        {/* A linha de olho vem ANTES do título, e o título é serifado.
            É a mesma hierarquia da capa aprovada — "NORVA · sábado, 5 de
            setembro" e a manchete embaixo —, e ela vale para as vinte telas
            porque o dono disse "TODO o aplicativo tem q seguir esse padrão".
            Antes era o contrário: título grande em cima, olho embaixo, e um selo
            da marca ao lado repetindo em toda tela o nome de quem já abriu o
            aplicativo. */}
        {overline ? (
          <Animated.View style={overlineStyle}>
            <Text
              style={[type.overline, { color: color.inkFaint, letterSpacing: 2.4 }]}
              numberOfLines={1}
            >
              {overline.toUpperCase()}
            </Text>
          </Animated.View>
        ) : null}

        <View style={[styles.titleRow, { gap: space.sm + 1 }]}>
          {/* O selo só sobra no Orgânico, que é a identidade de curva e cor. No
              Papel a marca não entra na página: a página é tinta e régua. */}
          {tracos.genero === 'pagina' ? null : (
            <View style={[styles.icon, { backgroundColor: `${accent}22`, borderRadius: 9 }]}>
              <Mark size={15} color={accent} />
            </View>
          )}
          <Animated.Text
            style={[
              {
                color: color.ink,
                fontFamily: titleFamily,
                fontWeight: tracos.titulo.peso,
                letterSpacing: tracos.titulo.aperto,
              },
              titleStyle,
            ]}
            accessibilityRole="header"
          >
            {title}
          </Animated.Text>
        </View>
      </View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        // With the soft keyboard up, React Native's default (`never`) spends
        // the first tap dismissing it, so the confirm button only answers on
        // the second. On a factory floor that reads as "the app did not save"
        // - and the person taps again, or gives up. Invisible on the web and
        // to the e2e suite: a browser has no keyboard that rises.
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          {
            paddingHorizontal: space.lg,
            paddingBottom: insets.bottom + space.xxl + tabBar,
            gap: space.md,
          },
          largo ? coluna : null,
        ]}
      >
        {/* A entrada escalonada, dada a TODA tela de uma vez.
            O dono viu o movimento na capa e pediu em todas: "isso é lindo e
            preenche os olhos, claro que não é para tirar a atenção". Fazer isso
            tela por tela seria trinta arquivos e trinta chances de esquecer uma;
            aqui, é o casco por onde todas passam.

            `Children.toArray` é o que dá o índice do escalonamento e descarta os
            nulos que as telas devolvem quando um cartão não se aplica - sem
            isso, um cartão ausente contaria como posição e abriria um buraco de
            quarenta milissegundos no meio da sequência. */}
        {emPares
          ? emColunas(Children.toArray(children), space.md)
          : Children.toArray(children).map((filho, i) => (
              <Reveal key={i} index={i}>
                {filho}
              </Reveal>
            ))}
        {/* A capa é a exceção conhecida: os cartões dela moram DENTRO de um
            componente de layout, então o casco vê um filho só e o escalonamento
            de verdade continua lá dentro. Envolver de novo aqui não atrapalha -
            a mola de fora abre o bloco enquanto as de dentro abrem os cartões. */}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * Duas colunas que EMPACOTAM, em vez de uma grade que deixa buraco.
 *
 * A primeira versão era `flexWrap`: cada linha da grade tinha a altura do
 * cartão mais alto dela, e um cartão curto ao lado de um alto deixava um vazio
 * do tamanho da diferença. Na gaveta do "Mais" isso era um buraco de três portas
 * debaixo de "Pergunte", e o dono viu antes de mim.
 *
 * Aqui os filhos são distribuídos em duas pilhas, alternando — o primeiro vai
 * para a esquerda, o segundo para a direita, o terceiro para a esquerda —, e
 * cada pilha empacota os seus sem olhar para a outra. O único desnível que
 * sobra é o do pé das duas colunas, que é como uma página de revista termina.
 *
 * Um filho marcado com `Inteiro` interrompe as pilhas: ele sai na largura toda,
 * e a grade recomeça depois dele. O índice do `Reveal` continua sendo a ordem
 * em que a pessoa lê, para o escalonamento da entrada não pular.
 */
function emColunas(filhos: ReactNode[], vao: number): ReactNode[] {
  const saida: ReactNode[] = [];
  let esquerda: ReactNode[] = [];
  let direita: ReactNode[] = [];
  let lado = 0;

  const fechar = (chave: string) => {
    if (esquerda.length === 0 && direita.length === 0) return;
    saida.push(
      <View key={chave} style={{ flexDirection: 'row', gap: vao, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: vao }}>{esquerda}</View>
        <View style={{ flex: 1, gap: vao }}>{direita}</View>
      </View>,
    );
    esquerda = [];
    direita = [];
    lado = 0;
  };

  filhos.forEach((filho, i) => {
    const inteiro = isValidElement(filho) && filho.type === Inteiro;
    if (inteiro) {
      fechar(`pares-${i}`);
      saida.push(
        <Reveal key={i} index={i}>
          {filho}
        </Reveal>,
      );
      return;
    }
    const peca = (
      <Reveal key={i} index={i}>
        {filho}
      </Reveal>
    );
    if (lado === 0) esquerda.push(peca);
    else direita.push(peca);
    lado = 1 - lado;
  });
  fechar('pares-fim');
  return saida;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
