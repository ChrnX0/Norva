import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext } from 'react';
import { SkyMark } from '@/components/Sky';
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
export function Folha({ olho, children }: { olho: string; children: ReactNode }) {
  const { color, type, space } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBar = useContext(BottomTabBarHeightContext) ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + space.xl,
          paddingHorizontal: space.xl + 2,
          paddingBottom: insets.bottom + space.xxl + tabBar,
        }}
      >
        <Text
          style={[type.overline, { color: color.inkFaint, letterSpacing: 2.4 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {olho.toUpperCase()}
        </Text>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * O cartão do clima — o único bloco da capa que o desenho aprovado CONTORNA.
 *
 * Isso não é acaso de composição: tudo o mais na página é a fábrica falando dos
 * próprios números, e o tempo é a única coisa ali que vem de fora. O contorno é
 * o que diz "isto não é seu" sem escrever a frase.
 *
 * E ele fica na capa porque calor muda o que sai e o que estraga — não é enfeite
 * de aplicativo de celular. Por isso o número grande vem com o de amanhã ao lado
 * (Lei 3), e a barra é a chance de chuva, que é o que muda a rota da entrega.
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
  const { color, type, space, radius, titleFamily, palette } = useTheme();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: color.line,
        borderRadius: radius.md,
        backgroundColor: color.surface,
        padding: space.lg,
      }}
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
            borderRadius: 2,
            backgroundColor: color.sunken,
            marginTop: space.md,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.max(0, Math.min(1, chuva.parcela)) * 100}%`,
              height: 3,
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

