import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext } from 'react';
import { SkyMark } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import { MEDIDA_DA_PAGINA } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A capa como o dono a desenhou — uma PÁGINA, não uma pilha de cartões.
 *
 * O desenho aprovado (`docs/design/aprovados/papel.html` e os quatro JPEGs ao
 * lado) não é uma variação do que existia: é outra coisa. O que eu vinha
 * entregando era um cartão arredondado com um degradê dentro; o que ele aprovou
 * é uma página impressa — manchete em serifa, ilustração em traço, régua grossa,
 * o diagrama da conta e a régua da semana. Ele mandou a comparação lado a lado
 * duas vezes: *"a primeira imagem eh o q vc está me entregando e a segunda eh o
 * q tem q ser"*.
 *
 * Por isso as peças daqui não têm caixa. Contorno só onde o desenho contorna: as
 * duas caixas da comparação e o cartão do clima. O resto é tinta sobre papel,
 * separado por régua — que é o que faz a tela parecer uma página em vez de um
 * painel.
 */

/** A régua grossa que separa a manchete da conta. */
export function Regua({ forte = false }: { forte?: boolean }) {
  const { color, space } = useTheme();
  return (
    <View
      style={{
        height: forte ? 2.5 : StyleSheet.hairlineWidth * 2,
        backgroundColor: forte ? color.ink : color.line,
        marginVertical: forte ? space.xl : space.lg,
      }}
    />
  );
}

/** O rótulo em versalete que nomeia um bloco: A SEMANA, UNIDADES · HOJE. */
export function Versalete({ children, cor }: { children: ReactNode; cor?: string }) {
  const { color, type } = useTheme();
  return (
    <Text style={[type.overline, { color: cor ?? color.inkFaint, letterSpacing: 2.4 }]}>
      {String(children).toUpperCase()}
    </Text>
  );
}

/**
 * A legenda em itálico, que é onde a conta se abre.
 *
 * No desenho ela aparece duas vezes — sob a ilustração e sob o diagrama — e nas
 * duas ela faz a mesma coisa: diz em palavras o que o desenho acabou de dizer em
 * forma. É o `[por quê?]` da Lei 6 servido antes de alguém perguntar.
 */
/**
 * A PORTA — a peça da capa que leva para outra tela.
 *
 * Das quinze peças, nove ABREM no lugar e quatro LEVAM para outra tela. As nove
 * dizem "toque para ver mais" no rodapé; as quatro não diziam nada, e quem tocava
 * não tinha como saber qual das duas coisas ia acontecer. Isso não era decisão:
 * era herança, e o dono acertaria em chamar de defeito.
 *
 * O conserto não é escrever a frase em quatro lugares — é fazer a porta TRAZER o
 * rótulo, porque a frase escrita à mão some no quinto lugar que alguém
 * acrescentar. Aqui o toque e o aviso do toque são a mesma peça e não dá para ter
 * um sem o outro.
 *
 * A seta é a mesma do resto do aplicativo, e o rótulo é o mesmo `openScreen` que
 * as peças abertas já usam por dentro: quem toca duas peças diferentes lê a mesma
 * palavra para a mesma coisa.
 */
export function Porta({
  aoTocar,
  etiqueta,
  convite,
  children,
}: {
  aoTocar: () => void;
  /** O que o leitor de tela anuncia — o assunto, não "abrir". */
  etiqueta: string;
  /** "Abrir a tela", já traduzido: quem escreve português é a tela, não o desenho. */
  convite: string;
  children: ReactNode;
}) {
  const { type, space, accent } = useTheme();
  return (
    /**
     * **`etiqueta` chega até o leitor de tela — e por um tempo ela não chegava a lugar nenhum.**
     *
     * O prop existe desde que esta peça nasceu, com o docblock acima dizendo de si mesmo *"o que o
     * leitor de tela anuncia — o assunto, não 'abrir'"*, e o componente **não o usava**. As cinco
     * portas da capa eram alvos de toque cujo único texto anunciável era o convite: quem navega por
     * leitor de tela ouvia *"Abrir a tela"* cinco vezes, sem nunca saber qual tela.
     *
     * É o portão P1 dentro de um componente — prop com propósito escrito e nenhum consumidor —, e
     * ele é pior que a versão em função: aqui o compilador não reclama, o desenho fica idêntico, e
     * a única pessoa que percebe é justamente a que não vê a tela. Achado em 13 de setembro indo
     * escrever a checagem de navegador que procurava a etiqueta e não a achava — o instrumento foi
     * mais honesto que o código, e a tentação era consertar o instrumento.
     *
     * `accessibilityLabel` SUBSTITUI o texto que o leitor montaria dos filhos, e é isso que se
     * quer: o assunto, uma vez, em vez de "cheio, Polpa de morango, acaba em 1 dia, Abrir a tela".
     */
    <Touchable onPress={aoTocar} accessibilityLabel={etiqueta}>
      <View>
        {children}
        <Text style={[type.caption, { color: accent, marginTop: space.sm }]}>
          {`${convite} \u2192`}
        </Text>
      </View>
    </Touchable>
  );
}

export function Legenda({ children }: { children: ReactNode }) {
  const { color, type } = useTheme();
  return (
    <Text style={[type.caption, { color: color.inkFaint, fontStyle: 'italic', lineHeight: 19 }]}>
      {children}
    </Text>
  );
}

/**
 * A manchete: uma linha leve e uma pesada, em serifa.
 *
 * "Hoje a fábrica" / "**fez 500 unidades**" — o peso é que carrega o número, e
 * é por isso que a frase se quebra exatamente ali. Duas `Text` em vez de uma com
 * `<b>` dentro: aninhar peso dentro de texto serifado no Android reposiciona a
 * linha de base, e a manchete sai desalinhada num aparelho e certa no outro.
 */
export function Manchete({ leve, forte }: { leve: string; forte: string | null }) {
  const { color, titleFamily, space } = useTheme();
  const base = {
    fontFamily: titleFamily,
    fontSize: 29,
    lineHeight: 31,
    color: color.ink,
    letterSpacing: -0.2,
  };
  return (
    <View style={{ marginTop: space.sm }} accessibilityRole="header">
      <Text style={[base, { fontWeight: '400' as const }]} allowFontScaling maxFontSizeMultiplier={1.4}>
        {leve}
      </Text>
      {/* Linha reservada mesmo vazia: sem a altura, a ilustração pula para cima
          quando a resposta chega, e a página inteira dá um solavanco. */}
      <Text
        style={[base, { fontWeight: '700' as const, opacity: forte ? 1 : 0 }]}
        allowFontScaling
        maxFontSizeMultiplier={1.4}
      >
        {forte ?? '\u00a0'}
      </Text>
    </View>
  );
}

/**
 * O diagrama da conta: duas referências à esquerda, o número de hoje à direita,
 * e as duas flechas que mostram de onde ele veio.
 *
 * É a Lei 3 desenhada — *nenhum número aparece sozinho*. O 500 sozinho não diz
 * nada; 500 puxado de 478 e de 481 diz que o dia foi bom e por quanto. A flecha
 * existe porque a diferença é a informação, e uma tabela de três linhas esconde
 * isso onde o olho não vai.
 *
 * **Nada aqui tem largura fixa.** As caixas crescem com o número (uma fábrica
 * que faz 12.000 tem cinco dígitos, não três), a coluna das flechas é o que
 * sobra, e a curva é recalculada da largura medida — no telefone de 360 dp e no
 * tablet de 800 dp o desenho é o mesmo, esticado, e não um corte do outro.
 */
export function Comparativo({
  referencias,
  total,
  unidade,
}: {
  /** As duas referências, de cima para baixo. Cada uma com seu delta já pronto. */
  referencias: readonly { rotulo: string; valor: string; delta: string | null; acima: boolean }[];
  /** O número de hoje, já formatado. */
  total: string;
  /** O que ele conta: "unidades · hoje". */
  unidade: string;
}) {
  const { color, type, space, titleFamily, radius } = useTheme();
  const [meio, setMeio] = useState({ largura: 0, altura: 0 });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {/* A coluna das referências CEDE. Sem isto ela cresce com o rótulo mais
          longo e empurra o número de hoje para fora da tela — "UNIDADES · HOJE"
          saiu cortado em "HOJ" na primeira foto. Cedendo, o rótulo quebra em
          duas linhas dentro da caixa e o número, que é o assunto, fica inteiro. */}
      <View style={{ gap: space.xl, flexShrink: 1 }}>
        {referencias.map((r) => (
          <View
            key={r.rotulo}
            style={{
              borderWidth: 1.5,
              borderColor: color.ink,
              borderRadius: radius.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm + 2,
              alignSelf: 'flex-start',
            }}
          >
            <Versalete cor={color.inkMuted}>{r.rotulo}</Versalete>
            <Text
              style={{
                fontFamily: titleFamily,
                fontSize: 22,
                lineHeight: 27,
                fontWeight: '700',
                color: color.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {r.valor}
            </Text>
          </View>
        ))}
      </View>

      {/* A coluna das flechas: o que sobra entre as caixas e o número. */}
      <View
        style={{ flex: 1, alignSelf: 'stretch', minWidth: 56 }}
        onLayout={(e) =>
          setMeio({ largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height })
        }
      >
        {meio.largura > 0 ? <Flechas {...meio} deltas={referencias} /> : null}
      </View>

      <View style={{ alignItems: 'flex-start', flexShrink: 0 }}>
        {/* Parte de `type.figure` e cresce a partir dele — não é capricho de
            estilo. O guarda da Lei 3 (`src/law.test.ts`) acha os números de
            manchete procurando literalmente `type.figure` no código, e este é o
            MAIOR número do aplicativo. Escrito com tamanho solto, ele sairia do
            alcance do guarda: a capa continuaria verde enquanto o número mais
            importante da tela deixava de ser cobrado a mostrar contra o quê se
            compara. */}
        <Text
          style={[
            type.figure,
            {
              fontFamily: titleFamily,
              fontSize: 48,
              lineHeight: 52,
              fontWeight: '700',
              color: color.ink,
              letterSpacing: -1,
            },
          ]}
        >
          {total}
        </Text>
        <Text
          style={[type.overline, { color: color.inkMuted, letterSpacing: 2.4, marginTop: 2 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {unidade.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

/**
 * As duas curvas convergindo, desenhadas na largura que sobrou.
 *
 * A curva sai da altura de cada caixa e chega no meio, onde está o número. Em
 * vez de um `viewBox` fixo esticado (que deformaria a ponta da flecha), o
 * caminho é escrito nas coordenadas MEDIDAS: a curva estica, a ponta não.
 */
function Flechas({
  largura,
  altura,
  deltas,
}: {
  largura: number;
  altura: number;
  deltas: readonly { delta: string | null; acima: boolean }[];
}) {
  const { color, type } = useTheme();
  const meio = altura / 2;
  // A altura do centro de cada caixa: elas dividem a coluna em duas metades, e o
  // centro de cada metade é onde a curva nasce.
  const alturas = deltas.map((_, i) => altura * (i === 0 ? 0.24 : 0.76));
  const ponta = largura - 2;

  return (
    <View style={{ flex: 1 }}>
      <Svg width="100%" height="100%">
        {alturas.map((y, i) => (
          <Path
            key={i}
            d={`M0 ${y} Q ${largura * 0.62} ${y} ${ponta} ${meio}`}
            stroke={deltas[i].acima ? color.ok : color.danger}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        <Path
          d={`M${ponta - 8} ${meio - 5} L${ponta} ${meio} L${ponta - 8} ${meio + 5}`}
          stroke={deltas[0].acima ? color.ok : color.danger}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {/* Os rótulos da diferença, encostados na curva: em cima da primeira, embaixo
          da segunda — que é onde há espaço branco nas duas. */}
      {deltas.map((d, i) =>
        d.delta ? (
          <Text
            key={i}
            style={[
              type.secondary,
              {
                position: 'absolute',
                left: largura * 0.12,
                [i === 0 ? 'top' : 'bottom']: altura * 0.06,
                fontWeight: '700',
                color: d.acima ? color.ok : color.danger,
                fontVariant: ['tabular-nums'],
              },
            ]}
          >
            {d.delta}
          </Text>
        ) : null,
      )}
    </View>
  );
}

/**
 * A folha: o casco da capa, sem cabeçalho que encolhe e sem selo.
 *
 * O que existia aqui era o `CollapsingHeader` — título grande que diminui ao
 * rolar, com a marca num ícone ao lado. O desenho aprovado não tem isso: tem uma
 * **linha de olho** ("NORVA · quarta, 2 de setembro") do tamanho de uma legenda,
 * e a manchete logo abaixo é do DIA, não do aplicativo. Um cabeçalho que repete
 * o nome do produto em corpo 34 gasta o topo da tela dizendo o que a pessoa já
 * sabe.
 */
export function Folha({
  olho,
  topo,
  children,
}: {
  olho: string;
  /**
   * O que SANGRA no topo, de borda a borda, antes do miolo com margem.
   *
   * É o corpo do Orgânico: a paisagem com o número em cima não cabe numa
   * coluna com margem — o desenho aprovado a leva até as bordas da tela e põe
   * a linha de olho dentro dela, sobre o céu. Com `topo`, a folha não desenha
   * a própria linha de olho: quem desenha é a cena.
   */
  topo?: ReactNode;
  children: ReactNode;
}) {
  const { color, type, space } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBar = useContext(BottomTabBarHeightContext) ?? 0;
  // A mesma medida do casco das outras telas: a capa não pode ser a única página
  // que vira tira esticada num tablet. Em dp, nunca em pixel.
  const { width: larguraDaTela } = useWindowDimensions();
  const largo = larguraDaTela >= MEDIDA_DA_PAGINA;

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl + tabBar }}
      >
        {/* O que SANGRA sangra até a borda da TELA, e não até a borda da coluna.
            A largura máxima estava no contêiner inteiro, então num tablet a
            paisagem do Orgânico virava uma faixa de 600 dp com a cor da página
            sobrando dos dois lados — deixava de sangrar exatamente onde havia
            tela de sobra para ela. Quem se limita é o miolo: texto em linha de
            oitocentos dp não se lê, e é isso que a medida da página protege. */}
        {topo}
        <View
          style={{
            ...(largo ? { width: '100%', maxWidth: MEDIDA_DA_PAGINA, alignSelf: 'center' } : null),
            // Com sangria, o miolo começa COLADO na cena — quem dá o respiro é
            // o casco da peça, e é isso que faz a margem negativa do primeiro
            // cartão valer o que ela diz valer. Com um `paddingTop` aqui, ela
            // gastava metade do valor só para chegar de volta à borda da cena.
            paddingTop: topo ? 0 : insets.top + space.xl,
            paddingHorizontal: space.xl + 2,
          }}
        >
          {topo ? null : (
            <Text
              style={[type.overline, { color: color.inkFaint, letterSpacing: 2.4 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {olho.toUpperCase()}
            </Text>
          )}
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * O bloco do clima — a única coisa na capa que vem de FORA da fábrica.
 *
 * Ele fica aqui porque calor muda o que sai e o que estraga, não por enfeite: o
 * número grande vem com o de amanhã ao lado (Lei 3) e a barra é a chance de
 * chuva, que é o que muda a rota da entrega.
 *
 * **Ele era uma caixa nas duas peles, e o dono recusou** — *"dá uma melhorada no
 * widget do tempo… quero ele mais entrosado com o tema"*. O motivo é nomeável e
 * era meu: para dizer "isto não é seu" eu desenhei um contorno, e contorno é a
 * linguagem do Orgânico. Numa página impressa, que é o que o Papel é, não existe
 * caixa nenhuma — então o único bloco emoldurado da folha lia como um cartão de
 * outro aplicativo colado ali.
 *
 * Agora ele pergunta ao traço `genero`, como os outros oito componentes já
 * faziam, e diz a MESMA coisa no idioma de cada pele: no Orgânico, a superfície
 * com canto e fundo; no Papel, o que uma página usa para marcar matéria
 * emprestada — régua vertical de tinta na lateral, sem moldura e sem fundo. Não
 * é a mesma peça mais fraca: é a mesma frase noutra língua.
 */
export function CartaoClima({
  cidade,
  maxC,
  minima,
  chuva,
  amanha,
  rodape,
  children,
}: {
  /** "São Paulo · agora", já montado pela tela. */
  cidade: string;
  maxC: number;
  /** "mín 13°", já montado. */
  minima: string;
  /** O texto da chuva e a parcela de 0 a 1 que a barra preenche. */
  chuva: { texto: string; parcela: number } | null;
  /** "amanhã +4°", ou a frase de temperatura parecida. Nulo quando não se sabe. */
  amanha: string | null;
  /** A linha de rodapé: quando foi medido, e o convite de abrir. */
  rodape: string;
  /** A semana, quando aberta. */
  children?: ReactNode;
}) {
  const { color, type, space, radius, titleFamily, palette, tracos } = useTheme();
  const papel = tracos.genero === 'pagina';

  return (
    <View
      style={
        papel
          ? {
              // A régua vertical é o que uma página impressa usa para dizer que o
              // trecho veio de fora — citação, boxe, matéria de agência. Fica na
              // tinta azul porque é a cor do céu nesta família, e não porque
              // azul quer dizer alguma coisa.
              borderLeftWidth: 2,
              borderLeftColor: palette.sky,
              paddingLeft: space.lg,
              paddingVertical: space.xs,
            }
          : {
              borderWidth: 1,
              borderColor: color.line,
              borderRadius: radius.md,
              backgroundColor: color.surface,
              padding: space.lg,
            }
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        {/* O desenho que MUDA com o tempo, e não um sol pintado à mão.
            O desenho aprovado mostra sol porque a maquete é de um dia de sol —
            copiar o sol seria desenhar um sol fixo, e o cartão mostraria sol num
            dia de 80% de chuva. `SkyMark` já responde à temperatura e à chuva, e
            já gira devagar. Copiar a forma sem copiar o comportamento é a
            armadilha desta rodada inteira, invertida. */}
        <SkyMark maxC={maxC} rainChance={chuva ? chuva.parcela * 100 : null} size={56} />
        <View style={{ flex: 1 }}>
          <Versalete>{cidade}</Versalete>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Text
              style={[
                type.figure,
                { fontFamily: titleFamily, fontSize: 34, lineHeight: 42, color: color.ink },
              ]}
            >
              {`${Math.round(maxC)}°`}
            </Text>
            <Text style={[type.secondary, { color: color.inkMuted }]}>{minima}</Text>
          </View>
        </View>
      </View>

      {chuva ? (
        <View
          style={{
            height: 3,
            borderRadius: papel ? 0 : 2,
            // Na página o trilho é a régua da folha, não uma calha rebaixada:
            // `sunken` é um fundo, e a folha não tem fundo por baixo do fundo.
            backgroundColor: papel ? color.line : color.sunken,
            marginTop: space.md,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.max(0, Math.min(1, chuva.parcela)) * 100}%`,
              height: 3,
              borderRadius: papel ? 0 : 2,
              backgroundColor: palette.sky,
            }}
          />
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: space.sm,
          marginTop: space.sm,
        }}
      >
        <Text style={[type.caption, { color: color.inkMuted, flexShrink: 1 }]}>
          {chuva ? chuva.texto : ''}
        </Text>
        {amanha ? (
          <Text style={[type.caption, { color: palette.apricot, flexShrink: 1, textAlign: 'right' }]}>
            {amanha}
          </Text>
        ) : null}
      </View>

      {children}

      <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>{rodape}</Text>
    </View>
  );
}

/**
 * O nível de um insumo, desenhado como o recipiente que ele é.
 *
 * É a última peça visível do desenho aprovado: um pote alto em traço, com a
 * marca do cheio em cima, e o nome do insumo em serifa ao lado.
 *
 * Por que um pote e não a barrinha que já existia: a barra horizontal responde
 * "que fração", e a pergunta desta peça é outra — **quanto ainda tem ali**. Um
 * recipiente com líquido dentro é a única forma que uma pessoa lê sem legenda, e
 * este aplicativo é lido de luva, na câmara, por quem não vai parar para
 * interpretar gráfico.
 *
 * A régua é dita por quem chama e nunca inventada aqui. Fábrica nenhuma tem meta
 * de estoque cadastrada; o horizonte é o que a capa já usa para tudo que fala de
 * tempo, e a peça só desenha a fração que recebeu.
 */
export function Nivel({
  /** Quanto resta, de zero a um. Fora da faixa fica presa na faixa. */
  parcela,
  /** O nome do insumo, em serifa: é o assunto. */
  nome,
  /** A frase que diz quanto tempo aquilo dura. */
  prazo,
  /** A palavra que marca o topo — "cheio". */
  topo,
  /** Verdadeiro quando a peça deve gritar: aí a tinta vira a de alerta. */
  urgente = false,
}: {
  parcela: number;
  nome: string;
  prazo: string;
  topo: string;
  urgente?: boolean;
}) {
  const { color, type, space, titleFamily, palette } = useTheme();
  const presa = Math.max(0, Math.min(1, Number.isFinite(parcela) ? parcela : 0));
  const tinta = urgente ? color.warning : palette.apricot;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
      <View style={{ alignItems: 'center' }}>
        <Text style={[type.caption, { color: color.inkFaint, marginBottom: 2 }]}>{topo}</Text>
        {/* O pote: contorno inteiro, e o conteúdo subindo de baixo. `overflow`
            recortado para o líquido respeitar o canto arredondado — sem isso ele
            escapa pelos cantos e o desenho deixa de ser um recipiente. */}
        <View
          style={{
            width: 54,
            height: 92,
            borderWidth: 1.5,
            borderColor: color.ink,
            borderRadius: 10,
            overflow: 'hidden',
            justifyContent: 'flex-end',
          }}
        >
          <Liquido parcela={presa} cor={tinta} />
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: titleFamily,
            fontSize: 26,
            lineHeight: 32,
            color: color.ink,
          }}
        >
          {nome}
        </Text>
        <Text style={[type.secondary, { color: urgente ? color.warning : color.inkMuted, marginTop: 2 }]}>
          {prazo}
        </Text>
      </View>
    </View>
  );
}

/**
 * O líquido dentro do pote, assentando.
 *
 * Pedido do dono, 6 de setembro, apontando a semana, o pote e o sol: *"quero
 * todos eles seguindo o estilo de animação constante q a gente adotou para a
 * fábrica do topo. algo bem suave."*
 *
 * O que se mexe é o LÍQUIDO e não o pote, porque é assim que a regra da casa
 * funciona: cada coisa se mexe como ela mesma. Pote balançando é o desenho
 * inteiro tremendo; líquido subindo e descendo meio ponto percentual é uma
 * superfície que ainda não parou — que é o que se vê num balde que acabou de ser
 * carregado até a câmara.
 *
 * Sete segundos de volta, mais lento que a semana de propósito: dois ambientes
 * na mesma tela em ciclos parecidos entram em batimento, e o olho pega o
 * compasso. Em ciclos primos entre si nunca sincronizam, e nada nunca "pisca
 * junto".
 *
 * **A altura média do ciclo é exatamente `parcela`.** Ambiente que alterasse a
 * leitura seria pior que ambiente nenhum: um pote parecendo mais cheio às nove
 * da manhã e menos às nove e meia é um número mentindo devagar.
 */
function Liquido({ parcela, cor }: { parcela: number; cor: string }) {
  /**
   * Parado, de propósito — e o docblock acima já dizia por quê, só não tinha feito a conta.
   *
   * O respiro era `(ciclo - 0,5) × 1,1` por cento de um pote de 92 dp: **±0,5 dp**,
   * exatamente o que `vida.ts` chama de ausência (*"sub-pixel não é sutileza, é
   * ausência"*). Num telefone o olho não recebia nada e o Yoga refluía o nó a cada quadro
   * a troco de zero; num tablet de densidade 2 a 3 o meio dp caía em cima de uma fronteira
   * de pixel e a superfície do líquido pulava entre duas linhas — o que treme e o que não
   * se vê eram a mesma causa. E subir a amplitude não é opção: o nível é DADO, e um pote
   * que parece mais cheio às nove e menos às nove e meia é um número mentindo devagar.
   * Se este pote precisar de vida, ela vai ser outra coisa que não o nível.
   */
  return (
    <View
      style={{
        backgroundColor: cor,
        opacity: 0.22,
        height: `${Math.max(0, Math.min(100, parcela * 100))}%`,
      }}
    />
  );
}
