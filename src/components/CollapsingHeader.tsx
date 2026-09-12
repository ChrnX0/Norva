import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reveal } from '@/components/Reveal';
import { Card } from './Card';
import { Touchable } from './Touchable';
import { useLocale } from '@/i18n/useLocale';
import { CenaDoCabecalho } from './cenas/Cena';
import type { Cena } from './cenas/prancha';
import { alternando, distribuir } from './colunas';
import { Mark } from './Mark';
import { MEDIDA_DA_PAGINA, MEDIDA_EM_PARES, PARES_A_PARTIR_DE } from '@/theme/tokens';
import { alturaDaCena as calcularAlturaDaCena } from './cenas/prancha';
import { alturaEstimadaDoCabecalho, faixaDeColapso, FRACAO_CENA, FRACAO_OLHO } from './cabecalho';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O que a página desenha quando a leitura dela falhou.
 *
 * Diz três coisas, nesta ordem, porque é nesta ordem que a pessoa precisa
 * delas: que não deu para ler, que nada se perdeu, e como tentar de novo. A
 * mensagem crua do erro fica por último, em corpo de legenda — ela não serve
 * para quem opera, serve para quem for perguntar o que aconteceu.
 *
 * O tom segue o da casa: orienta, não fiscaliza, e não culpa ninguém. "Não deu
 * para ler esta tela" é o aplicativo falando de si.
 */
function PaginaQueNaoLeu({ erro, denovo }: { erro: Error; denovo?: () => void }) {
  const { color, type, space, palette } = useTheme();
  const { t } = useLocale();
  return (
    <Reveal index={0}>
      <Card hue={palette.apricot} title={t.common.readFailed}>
        <Text style={[type.body, { color: color.inkMuted }]}>{t.common.readFailedBody}</Text>
        {denovo ? (
          <Touchable onPress={denovo} accessibilityLabel={t.common.readFailedAction}>
            <Text style={[type.body, { color: color.ink, marginTop: space.md, fontWeight: '600' }]}>
              {t.common.readFailedAction} →
            </Text>
          </Touchable>
        ) : null}
        <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
          {erro.message}
        </Text>
      </Card>
    </Reveal>
  );
}

const EXPANDED = 34;
const COLLAPSED = 22;

/** A altura da linha de olho, que some junto com a cena. */
const OLHO = 18;


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
  cena,
  pares = false,
  erro,
  denovo,
  children,
}: {
  title: string;
  overline?: string;
  /**
   * A leitura desta tela falhou, e é isto que a página desenha em vez do
   * conteúdo.
   *
   * **Existe porque falha calada vira fato.** Uma consulta que quebrou deixa a
   * tela com o mesmo desenho de um estado vazio — e vazio, neste aplicativo, é
   * uma AFIRMAÇÃO: "não saiu nada hoje", "não há saldo", "não há ficha". Medido
   * em 10 de setembro: 32 telas chamavam `useQuery` e UMA olhava o `error`.
   *
   * Mora no casco pelo mesmo motivo que a entrada em cascata mora — e o
   * comentário que justifica aquela, poucas linhas abaixo, serve palavra por
   * palavra aqui: *"fazer isso tela por tela seria trinta arquivos e trinta
   * chances de esquecer uma"*. A diferença é que isto é DADO e não
   * comportamento, então a tela precisa entregá-lo; quem cobra a entrega é
   * `src/casco.test.ts`, que recusa tela com `useQuery` e sem `erro`.
   */
  erro?: Error | null;
  /** Ler de novo. Sem ela a página de falha informa e não oferece saída. */
  denovo?: () => void;
  /**
   * O desenho vivo desta tela.
   *
   * Decisão do dono, 6 de setembro: *"quero em TODAS as páginas um cabeçalho q
   * fica animado tipo a da pagina home"*. Quem escolhe é a tela, porque só ela
   * sabe do que trata — e é por isso que não há um mapa de rota para cena
   * escondido aqui dentro: rota é endereço, não assunto, e duas rotas do mesmo
   * assunto (a lista e a ficha) querem o mesmo desenho.
   *
   * Ele recolhe junto com a rolagem, como o título e a linha de olho. Cena que
   * ficasse fixa comeria um terço da tela de quem está lendo uma lista longa —
   * e a Lei manda que movimento nunca atrapalhe informação.
   */
  cena?: Cena;
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

  /**
   * A altura reservada para a cena — e ela sai da largura do CONTÊINER, não da tela.
   *
   * **Eram duas contas diferentes para a mesma coisa, e as duas liam a janela.**
   * Aqui se reservava `(larguraDaTela - padding) × proporção` para uma fatia com
   * `overflow: hidden`; lá dentro a cena pedia `larguraDaTela × proporção`. Dois
   * erros independentes saíam disso:
   *
   * - **Corte de 6,33 dp em toda largura, no Orgânico.** A paisagem sangra
   *   (`marginHorizontal: -space.lg`), devolvendo os 32 dp que esta conta tinha
   *   descontado — então o desenho era sempre 32 × 72/364 mais alto que a fatia que o
   *   recorta, e o pé da cena era comido em todo aparelho.
   * - **Vão crescente a partir de 600 dp.** Acima disso a coluna trava em `maxWidth`
   *   e o desenho para de crescer, enquanto a reserva continuava seguindo a janela:
   *   a 800 dp sobravam ~40 dp de banda vazia, a 900 dp ~59, e num tablet deitado em
   *   pares ~75 — mais que a altura do próprio desenho, com cor de página aparecendo
   *   acima do céu.
   *
   * O conserto é uma fonte só: a largura que a peça de fato recebe. A coluna limita
   * pelo `maxWidth`; a vinheta perde o padding e a paisagem o recupera sangrando. A
   * cena lá dentro deixou de fazer conta nenhuma — ela usa `aspectRatio` e herda a
   * largura real —, então aqui basta reservar o que ela vai ocupar.
   */
  const alturaDaCena = calcularAlturaDaCena({
    larguraDaTela,
    medidaDaColuna: medida,
    padding: space.lg,
    cabecalho: tracos.cabecalho === 'paisagem' ? 'paisagem' : 'vinheta',
  });
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

  /**
   * Quanto de rolagem o cabeçalho leva para encolher — calculado, não escolhido.
   *
   * Era a constante `72`, e ela é a causa do tremor que o dono achou no tablet dele:
   * cabeçalho e lista dividem a altura, então encolher um cresce o outro e isso
   * realimenta a rolagem. Com 72 fixos e uma cena de 112 dp, o cabeçalho encolhia mais
   * de três vezes mais rápido que a rolagem que o encolhia — e realimentação com ganho
   * acima de 1 oscila em vez de acomodar. `src/components/cabecalho.ts` tem a conta e
   * a tabela por largura; `cabecalho.test.ts` cobra o teto em dez larguras.
   *
   * **Sem cena o colapso é outro**, e por isso ela entra como zero: reservar faixa para
   * uma peça que não está na tela alongaria a rolagem à toa nas telas sem ilustração.
   */
  const faixa = faixaDeColapso({
    alturaDaCena: cena ? alturaDaCena : 0,
    olho: overline ? OLHO : 0,
  });

  /**
   * **A altura do cabeçalho, medida uma vez — e é ela que tira o laço do circuito.**
   *
   * O cabeçalho não é mais irmão da lista: ele está SOBREPOSTO (`position: absolute`) e a
   * lista carrega um `paddingTop` **constante** do tamanho dele. Isso muda o laço de
   * lugar, não de grau: antes, encolher o cabeçalho crescia a janela da lista, o dedo
   * parado passava a estar mais embaixo dentro dela, e o Android lia rolagem para trás —
   * realimentação. Agora a janela da lista **não muda de tamanho quando o cabeçalho
   * encolhe**, porque o cabeçalho saiu do fluxo. Ganho zero, não ganho pequeno.
   *
   * Por que MEDIR em vez de calcular: a altura depende do título, e título quebra em duas
   * linhas a 34 dp — quatro títulos em português, e a lista muda a cada idioma. Conta feita
   * na mão erraria por uma linha inteira exatamente nos casos que importam.
   *
   * Por que a estimativa existe ao lado: `onLayout` responde DEPOIS do primeiro layout, e
   * um quadro com `paddingTop: 0` põe o primeiro cartão debaixo do cabeçalho. A estimativa
   * sai das mesmas constantes desta tela — não é número mágico — e é piso, nunca teto: a
   * medida só é usada quando é MAIOR, que é o caso do título de duas linhas.
   *
   * E ela guarda a largura junto porque o cabeçalho encolhe: `onLayout` dispara outra vez
   * com a altura já reduzida, e guardar isso encurtaria o `paddingTop` no meio da rolagem —
   * que é o buraco que este desenho existe para não ter. Mantém-se o MAIOR visto naquela
   * largura; largura nova recomeça, porque a cena tem altura própria por largura.
   */
  const alturaEstimada = alturaEstimadaDoCabecalho({
    acimaDoTitulo: insets.top + space.sm,
    abaixoDaCena: space.md,
    olho: overline ? OLHO : 0,
    alturaDaCena: cena ? alturaDaCena : 0,
    corpoDoTitulo: EXPANDED,
  });
  const [medido, setMedido] = useState<{ largura: number; altura: number } | null>(null);
  const medirCabecalho = useCallback(
    (evento: LayoutChangeEvent) => {
      const altura = evento.nativeEvent.layout.height;
      setMedido((antes) =>
        antes && antes.largura === larguraDaTela && antes.altura >= altura
          ? antes
          : { largura: larguraDaTela, altura },
      );
    },
    [larguraDaTela],
  );
  const alturaDoCabecalho = Math.max(
    alturaEstimada,
    medido && medido.largura === larguraDaTela ? medido.altura : 0,
  );

  /**
   * O título encolhe por ESCALA, não por corpo de fonte — e a diferença é um defeito.
   *
   * Animar `fontSize` reflui o texto. Um título que ocupa duas linhas a 34 cabe em uma a
   * 22, e a passagem de duas para uma linha é uma queda de altura DESCONTÍNUA de uma
   * linha inteira, num único ponto da rolagem. O teto de ganho do `cabecalho.ts` limita
   * a derivada de rampas contínuas; contra descontinuidade ele não pode nada — ali a
   * derivada é infinita, e o laço oscila por mais folga que a faixa tenha.
   *
   * Foi o que sobrou depois do primeiro conserto, e o dono achou de novo: parou de tremer
   * em toda tela e continuou tremendo nas de TÍTULO LONGO. São quatro em português —
   * "Linhas, tipos e sabores", "Quem está com o aparelho", "O que vence antes de sair",
   * "Alguma coisa travou aqui" —, e a lista muda com o idioma, o que torna isto
   * impossível de guardar por inspeção de texto.
   *
   * `transform` não reflui e não passa pelo Yoga: a caixa do texto fica do tamanho de 34
   * e o desenho encolhe dentro dela. A origem é a esquerda para o título não escorregar
   * para o meio enquanto diminui.
   */
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          scrollY.value,
          [0, faixa],
          [1, COLLAPSED / EXPANDED],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const overlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, faixa * FRACAO_OLHO], [1, 0], Extrapolation.CLAMP),
    height: interpolate(scrollY.value, [0, faixa * FRACAO_OLHO], [OLHO, 0], Extrapolation.CLAMP),
  }));

  // A cena sai antes do título e mais depressa que ele: quem rolou já decidiu
  // que quer o conteúdo, e a ilustração é a boa-vinda, não a matéria.
  const cenaStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, faixa * FRACAO_CENA], [1, 0], Extrapolation.CLAMP),
    height: interpolate(
      scrollY.value,
      [0, faixa * FRACAO_CENA],
      [alturaDaCena, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      {/* **O cabeçalho vem PRIMEIRO na árvore e por CIMA na pintura, e as duas coisas são
          de propósito.** Primeiro na árvore é a ordem em que o leitor de tela anuncia — e
          cabeçalho anunciado depois do conteúdo é a tela lida de trás para frente. Por cima
          na pintura é o `zIndex`, porque irmão declarado antes pinta embaixo: sem ele o
          conteúdo rolaria SOBRE o título em vez de passar debaixo dele.

          A tinta da página vai no casco de fora, de borda a borda, e não na coluna: numa
          largura de tablet a coluna é centralizada, e uma faixa opaca só no meio deixaria o
          conteúdo aparecer pelos lados do cabeçalho enquanto sobe. */}
      <View
        onLayout={medirCabecalho}
        style={[styles.cabecalhoSobreposto, { backgroundColor: color.paper }]}
      >
        <View
          style={[
            {
              paddingTop: insets.top + space.sm,
              paddingHorizontal: space.lg,
              paddingBottom: space.md,
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
          {/* O cabeçalho CHEGA, e não estava lá.
              Ele já respondia à rolagem — o título encolhe, a linha de olho some —
              e isso é reação, não chegada: aberta a tela, o topo aparecia pronto e
              imóvel enquanto os cartões debaixo entravam em cascata. A linha de
              olho e a manchete entram em dois tempos, na ordem em que se lê, e
              como isto está em vinte e sete das vinte e oito telas, é a mudança de
              um arquivo só que faz o aplicativo inteiro começar vivo. */}
          {overline ? (
            <Reveal index={0}>
              <Animated.View style={overlineStyle}>
                <Text
                  style={[type.overline, { color: color.inkFaint, letterSpacing: 2.4 }]}
                  numberOfLines={1}
                >
                  {overline.toUpperCase()}
                </Text>
              </Animated.View>
            </Reveal>
          ) : null}

          <Reveal index={1} style={[styles.titleRow, { gap: space.sm + 1 }]}>
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
                  fontSize: EXPANDED,
                  transformOrigin: 'left center',
                },
                titleStyle,
              ]}
              accessibilityRole="header"
            >
              {title}
            </Animated.Text>
          </Reveal>

          {cena ? (
            <Reveal index={2}>
              {/* A cena SANGRA quando a pele desenha paisagem, e é margem quando ela
                  desenha vinheta — decidido pelo traço, nunca pelo nome da pele.

                  Não é gosto: é a diferença entre uma janela e uma foto colada. Na
                  capa do Orgânico a paisagem vai de borda a borda, e nas outras vinte
                  telas ela era um retângulo com margem dos dois lados — o mesmo
                  desenho parecendo um recorte no meio da folha. A vinheta do Papel é o
                  contrário: ela é um desenho NA página impressa, e desenho que
                  encosta na borda do papel é desenho torto. */}
              <Animated.View
                style={[
                  cenaStyle,
                  { overflow: 'hidden' },
                  tracos.cabecalho === 'paisagem' ? { marginHorizontal: -space.lg } : null,
                ]}
              >
                <CenaDoCabecalho cena={cena} />
              </Animated.View>
            </Reveal>
          ) : null}
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
            // Constante, e é ISTO que mata a realimentação: a janela da lista deixa de
            // depender da altura do cabeçalho. Animar este número trocaria o laço de
            // roupa e o traria de volta inteiro.
            paddingTop: alturaDoCabecalho,
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
        {erro ? (
          <PaginaQueNaoLeu erro={erro} denovo={denovo} />
        ) : emPares
          ? emColunas(Children.toArray(children), space.md)
          : Children.toArray(children).map((filho, i) =>
              // Quem JÁ é uma entrada não ganha outra por cima.
              //
              // O casco embrulhava todo filho, e as telas embrulham os deles: são
              // 141 `<Reveal>` em `app/` contra 27 telas que usam este casco. Com
              // a subida de catorze para vinte e seis dp isso deixou de ser
              // inofensivo — o cartão passou a subir 52 dp e a crescer 6,9% em
              // vez de 3,5%, com DUAS molas de atrasos diferentes na mesma
              // subárvore. E os índices divergem: `Children.toArray` descarta os
              // nulos, então um cartão condicional ausente faz a posição do casco
              // e o `index=` da tela discordarem, e o cartão entra em dois tempos.
              //
              // O comentário antigo aqui dizia que envolver de novo "não
              // atrapalha". Era verdade na amplitude antiga, e é a forma mais
              // cara de estar certo: a afirmação envelheceu em silêncio no dia em
              // que o número mudou.
              jaEntra(filho) ? (
                filho
              ) : (
                <Reveal key={i} index={i}>
                  {filho}
                </Reveal>
              ),
            )}
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
 * A segunda alternava — primeiro à esquerda, segundo à direita — e resolvia o
 * buraco do MEIO deixando o do PÉ: alternar não olha altura, então dois cartões
 * altos caem do mesmo lado e a página termina desigual. Estava escrito como
 * limitação conhecida, e é o último resto do layout do tablet.
 *
 * Agora as peças são medidas e a distribuição escolhida por `distribuir`
 * (`colunas.ts`, com o teste que corrigiu o que eu tinha afirmado sobre ela).
 * Um filho marcado com `Inteiro` interrompe as pilhas: ele sai na largura toda,
 * e a grade recomeça depois dele. O índice do `Reveal` continua sendo a ordem
 * em que a pessoa lê, para o escalonamento da entrada não pular.
 */
/**
 * Este filho JÁ é uma entrada?
 *
 * Um `Reveal` direto, ou um `Inteiro` cujo único conteúdo é um `Reveal` — que é a forma
 * que `app/(tabs)/more.tsx` usa. Envolver qualquer um dos dois de novo compõe DUAS molas
 * defasadas na mesma subárvore: 52 dp de subida em dois tempos, escala passando por
 * 0,965 × 0,965, e as duas ultrapassagens de 9% chegando em instantes diferentes. O
 * `translateY` do filho é multiplicado pela escala do pai, que está variando — a
 * velocidade vertical ganha um termo a mais, e é isso que o olho lê como sacudida.
 */
function jaEntra(no: ReactNode): boolean {
  if (!isValidElement(no)) return false;
  if (no.type === Reveal) return true;
  if (no.type === Inteiro) {
    const dentro = (no.props as { children?: ReactNode }).children;
    return isValidElement(dentro) && dentro.type === Reveal;
  }
  return false;
}

function emColunas(filhos: ReactNode[], vao: number): ReactNode[] {
  const saida: ReactNode[] = [];
  let grupo: { no: ReactNode; i: number }[] = [];

  const fechar = (chave: string) => {
    if (grupo.length === 0) return;
    saida.push(<Grupo key={chave} pecas={grupo} vao={vao} />);
    grupo = [];
  };

  filhos.forEach((filho, i) => {
    if (isValidElement(filho) && filho.type === Inteiro) {
      fechar(`pares-${i}`);
      // A mesma guarda do caminho simples, que faltava aqui e no `Grupo`: o docblock lá
      // embaixo declara o embrulho duplo defeito e o código o cometia em dois dos três
      // caminhos — e as duas únicas telas que pedem pares (Relatórios e Mais) passam
      // filhos que JÁ entram.
      saida.push(
        jaEntra(filho) ? (
          <Fragment key={i}>{filho}</Fragment>
        ) : (
          <Reveal key={i} index={i}>
            {filho}
          </Reveal>
        ),
      );
      return;
    }
    grupo.push({ no: filho, i });
  });
  fechar('pares-fim');
  return saida;
}

/**
 * Um trecho de duas colunas, com as peças medidas.
 *
 * **Por que medir é seguro aqui, e seria um laço em quase todo outro lugar.** A
 * largura de uma peça não muda com a coluna que a recebe — as duas são `flex: 1`
 * da mesma linha —, então a altura medida continua valendo depois de a peça
 * trocar de lado. Sem essa propriedade, mudar de coluna mudaria a altura, que
 * mudaria a distribuição, que mudaria a coluna: o laço clássico de quem mede
 * para decidir o que a medida depende.
 *
 * **A primeira pintura é a de antes.** Enquanto falta medida, distribui-se
 * alternando — que é exatamente o que a tela fazia — e a troca acontece no
 * quadro seguinte, dentro da janela em que o `Reveal` ainda está abrindo os
 * cartões. Quem desligou movimento no sistema vê um reposicionamento de um
 * quadro; é o preço, e ele é menor que a página terminar torta em todo tablet.
 */
function Grupo({ pecas, vao }: { pecas: { no: ReactNode; i: number }[]; vao: number }) {
  const [alturas, setAlturas] = useState<Record<number, number>>({});

  // Só grava quando muda de verdade: `onLayout` dispara em toda rolagem que
  // remonta a linha, e `setState` com o mesmo número em cada disparo é um
  // re-render por quadro que não muda nada na tela e some no perfil.
  const medir = useCallback((chave: number, altura: number) => {
    setAlturas((antes) =>
      Math.abs((antes[chave] ?? -1) - altura) < 1 ? antes : { ...antes, [chave]: altura },
    );
  }, []);

  const medidas = pecas.map((p) => alturas[p.i]);
  const todas = medidas.every((h) => typeof h === 'number' && h > 0);

  /**
   * **O lado é decidido UMA vez por largura, e depois não muda.**
   *
   * As duas colunas são dois `View` irmãos, então trocar uma peça de lado é tirá-la da
   * lista de filhos de um pai e pô-la na de outro — chave igual em pai diferente não
   * preserva identidade, o React desmonta e remonta, e o `Reveal` de dentro refaz a
   * entrada do chão. O docblock acima cobre a troca do primeiro quadro (a mola mal saiu
   * de zero). O que ele não cobria é o caso TARDIO: em Relatórios e em Mais a altura dos
   * cartões muda quando a consulta responde — contagem, legenda de duas linhas, cartão
   * condicional —, e `distribuir` podia mandar uma peça assentada há segundos para a
   * outra coluna. Um cartão caindo 26 dp e reentrando sozinho, fora de qualquer cascata.
   *
   * Congelar a distribuição na primeira medida completa fecha isso; largura nova
   * recomeça, porque rotação refaz a página inteira de qualquer jeito e aí a remontagem
   * é invisível. Fica escrito o preço: se um cartão crescer muito depois de medido, a
   * página pode ficar mais torta do que `distribuir` faria — trocado por não sacudir.
   */
  const { width: larguraDaTela } = useWindowDimensions();
  const [decidido, setDecidido] = useState<{ largura: number; lados: number[] } | null>(null);
  if (todas && (!decidido || decidido.largura !== larguraDaTela)) {
    setDecidido({ largura: larguraDaTela, lados: distribuir(medidas as number[]) });
  }
  const lados =
    decidido && decidido.largura === larguraDaTela
      ? decidido.lados
      : todas
        ? distribuir(medidas as number[])
        : alternando(pecas.map(() => 0));

  const colunas: ReactNode[][] = [[], []];
  pecas.forEach((peca, k) => {
    colunas[lados[k] ?? 0].push(
      <View key={peca.i} onLayout={(e) => medir(peca.i, e.nativeEvent.layout.height)}>
        {jaEntra(peca.no) ? peca.no : <Reveal index={peca.i}>{peca.no}</Reveal>}
      </View>,
    );
  });

  return (
    <View style={{ flexDirection: 'row', gap: vao, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, gap: vao }}>{colunas[0]}</View>
      <View style={{ flex: 1, gap: vao }}>{colunas[1]}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * O cabeçalho fora do fluxo.
   *
   * `left`/`right` em zero e não uma largura: a regra da casa proíbe medida de tela em
   * pixel fixo, e aqui não há nenhuma — o casco toma a largura do pai e a coluna de dentro
   * é que se limita.
   */
  cabecalhoSobreposto: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
