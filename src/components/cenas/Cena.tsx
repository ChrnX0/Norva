import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { useCiclo } from '../vida';
import { CHAO, PRANCHA_DO_CABECALHO, type Cena } from './prancha';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * O cabeçalho vivo de uma tela.
 *
 * A capa tinha a fábrica em traço e o dono quis a mesma coisa em toda parte:
 * *"quero em TODAS as páginas um cabeçalho q fica animado tipo a da pagina home
 * com aquela fabricazinha e o sol se movendo"*.
 *
 * O que este arquivo NÃO faz, de propósito, é repetir um efeito genérico com
 * outro ícone dentro. A regra da casa é a da cena aprovada e vale aqui inteira:
 * **cada coisa se mexe como ela mesma** — o caminhão anda, a fumaça sobe, a
 * balança pende, a barra cresce. Um caminhão que respira igual a um termômetro
 * não está vivo, está tremendo, e essa versão já foi recusada uma vez.
 *
 * Três coisas que o casco resolve para todos os desenhos, e por isso eles são
 * curtos:
 *
 * 1. **A escala vem da largura real**, medida em dp — nunca porcentagem chutada.
 *    Do telefone de 360 dp ao tablet a cena dobra junto com o resto da página.
 * 2. **O relógio é o compartilhado** (`useCiclo`), então "reduzir movimento" é
 *    lido uma vez para o aplicativo todo e cada desenho estaciona no lugar certo.
 * 3. **A espessura é a da pele.** Chumbar 1,3 aqui deixaria a cena fina na pele
 *    de traço grosso — que é exatamente o defeito de "o Orgânico é o Papel com
 *    outro desenho".
 */
export function CenaDoCabecalho({ cena }: { cena: Cena }) {
  const { color, palette, traco } = useTheme();
  const { width } = useWindowDimensions();

  const Desenho = DESENHOS[cena];
  const altura = useMemo(
    () => (width / PRANCHA_DO_CABECALHO.largura) * PRANCHA_DO_CABECALHO.altura,
    [width],
  );

  return (
    <View style={{ width: '100%', height: altura }} pointerEvents="none" accessibilityRole="image">
      <Svg
        viewBox={`0 0 ${PRANCHA_DO_CABECALHO.largura} ${PRANCHA_DO_CABECALHO.altura}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <G
          fill="none"
          stroke={color.ink}
          strokeWidth={traco}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d={`M0 ${CHAO}h${PRANCHA_DO_CABECALHO.largura}`} stroke={color.line} />
          <Desenho tinta={color.ink} acento={palette.apricot} frio={palette.sky} traco={traco} />
        </G>
      </Svg>
    </View>
  );
}

type Pincel = { tinta: string; acento: string; frio: string; traco: number };

/**
 * Sobe e some — a mesma baforada da chaminé da capa, em escala de cabeçalho.
 *
 * Sai da altura da BOCA do tacho (y 36) e sobe dezoito. Na primeira versão ela
 * nascia em y 30 com o tacho começando em 40, e a foto mostrou três riscos
 * flutuando no ar acima de uma panela — fumaça que não sai de lugar nenhum.
 */
function Baforada({ atrasoMs, x }: { atrasoMs: number; x: number }) {
  const ciclo = useCiclo(6000, { atrasoMs, repouso: 0.35 });
  const props = useAnimatedProps(() => ({
    opacity: Math.sin(ciclo.value * Math.PI) * 0.85,
    transform: [{ translateY: -ciclo.value * 18 }],
  }));
  return <AnimatedPath animatedProps={props} d={`M${x} 36c-5-5 4-9-1-14c-4-4 2-7 0-11`} />;
}

/**
 * O TACHO — produção.
 *
 * A composição ocupa a prancheta INTEIRA, de 16 a 348, e isso não é gosto: a
 * primeira versão agrupou tudo entre 78 e 296 e a foto no aparelho mostrou um
 * terço esquerdo vazio com os objetos empurrados para a direita. A cena aprovada
 * da capa vai de 20 a 356 — é ela que define o enquadramento, e cena de
 * cabeçalho que não ocupa a folha lê como desenho torto, não como desenho
 * pequeno.
 *
 * A fumaça sai da BOCA do tacho e não do ar acima dele, que era o outro defeito
 * da foto. E ela sobe sempre: aqui não contradiz a capa, porque lá a fumaça é um
 * FATO (há tacho aberto agora) e aqui é o retrato do assunto da tela, como a
 * placa de uma oficina desenha uma chave inglesa sem afirmar que tem uma na
 * bancada.
 */
function Producao({ tinta, acento }: Pincel) {
  return (
    <>
      <G stroke={acento}>
        <Baforada atrasoMs={0} x={38} />
        <Baforada atrasoMs={2000} x={52} />
        <Baforada atrasoMs={4000} x={66} />
      </G>
      {/* O tacho: boca larga, bojo que afunila, e o tripé em que ele senta. */}
      <G stroke={tinta}>
        <Path d="M16 38h72l-10 20a8 8 0 0 1-7 4H33a8 8 0 0 1-7-4z" />
        <Path d="M12 38h80" />
        <Path d="M34 62l-6 2M70 62l6 2M52 62v2" />
      </G>
      {/* A pá: cabo comprido e a lâmina chata embaixo, encostada na parede. */}
      <G stroke={tinta}>
        <Path d="M112 20l14 34" />
        <Path d="M122 50h12l-4 14h-12z" />
      </G>
      {/* A grade dos picolés, que é para onde a massa vai. */}
      <G stroke={tinta}>
        <Path d="M158 30h108" />
        <Rect x="172" y="34" width="16" height="22" rx="6" />
        <Path d="M180 56v8" />
        <Rect x="204" y="34" width="16" height="22" rx="6" stroke={acento} />
        <Path d="M212 56v8" stroke={acento} />
        <Rect x="236" y="34" width="16" height="22" rx="6" />
        <Path d="M244 56v8" />
      </G>
      {/* A pilha do que já ficou pronto, no fim da linha. */}
      <G stroke={tinta}>
        <Path d="M288 44h60v20h-60z" />
        <Path d="M288 52h60M318 44v20" />
        <Path d="M296 44l5-8h34l5 8" />
      </G>
    </>
  );
}

/** O CAMINHÃO — transporte. A estrada corre, que é o que uma estrada faz. */
function Transporte({ tinta, acento }: Pincel) {
  const ciclo = useCiclo(4000, { repouso: 0 });
  const estrada = useAnimatedProps(() => ({ transform: [{ translateX: -ciclo.value * 24 }] }));
  const roda = useAnimatedProps(() => ({ transform: [{ rotate: `${ciclo.value * 360}deg` }] }));

  return (
    <>
      {/* Os tracejados da pista andam para trás; o caminhão fica onde está.
          Mover o caminhão faria ele sair da prancheta em quatro segundos. */}
      <AnimatedG animatedProps={estrada} stroke={tinta} opacity={0.4}>
        <Path d="M-16 68h14M8 68h14M32 68h14M56 68h14M80 68h14M104 68h14M128 68h14M152 68h14M176 68h14M200 68h14M224 68h14M248 68h14M272 68h14M296 68h14M320 68h14M344 68h14M368 68h14" />
      </AnimatedG>
      {/* A fábrica de onde ele saiu, na esquerda. */}
      <G stroke={tinta}>
        <Path d="M14 64V34l12 10V34l12 10V34l12 10v20" />
        <Path d="M14 64h36" />
        <Path d="M22 64v-8h8v8" />
      </G>
      <G stroke={tinta}>
        <Path d="M96 32h72v26H96z" />
        <Path d="M168 40h20l14 12v6h-34z" />
        <Path d="M172 42h13l9 8h-22z" stroke={acento} />
        <Path d="M96 58h106" />
      </G>
      <G stroke={tinta}>
        <AnimatedG animatedProps={roda} origin="118, 58">
          <Circle cx="118" cy="58" r="6" />
          <Path d="M118 52v12" opacity={0.5} />
        </AnimatedG>
        <AnimatedG animatedProps={roda} origin="186, 58">
          <Circle cx="186" cy="58" r="6" />
          <Path d="M186 52v12" opacity={0.5} />
        </AnimatedG>
      </G>
      {/* As duas lojas no fim da estrada. */}
      <G stroke={tinta}>
        <Path d="M240 64V42h40v22M236 42l8-10h32l8 10" />
        <Path d="M254 64V52h12v12" />
        <Path d="M304 64V46h44v18M300 46l7-9h38l7 9" stroke={acento} />
        <Path d="M320 64V54h12v10" stroke={acento} />
      </G>
    </>
  );
}

/** AS BARRAS — relatórios. Cada uma cresce no seu tempo, como dado chegando. */
function Relatorios({ tinta, acento, frio }: Pincel) {
  const alturas = [14, 24, 11, 30, 18, 34, 22, 28];
  return (
    <>
      {alturas.map((h, i) => (
        <Barra
          key={i}
          x={14 + i * 26}
          alturaCheia={h}
          cor={i === 5 ? acento : tinta}
          atrasoMs={i * 260}
        />
      ))}
      {/* A lupa: o que a tela faz com as barras. */}
      <G stroke={frio}>
        <Circle cx="248" cy="34" r="13" />
        <Path d="M258 44l10 10" />
      </G>
      {/* A folha do relatório, no fim: as barras viram página. */}
      <G stroke={tinta}>
        <Path d="M296 20h44v44h-44z" />
        <Path d="M306 32h24M306 42h24M306 52h14" stroke={acento} opacity={0.8} />
      </G>
    </>
  );
}

function Barra({
  x,
  alturaCheia,
  cor,
  atrasoMs,
}: {
  x: number;
  alturaCheia: number;
  cor: string;
  atrasoMs: number;
}) {
  const ciclo = useCiclo(5200, { feitio: 'vaivem', atrasoMs, repouso: 1 });
  // Oscila os últimos quinze por cento e nunca sai do chão: barra que desce até
  // zero lê como dado sumindo, e este desenho não afirma número nenhum.
  const props = useAnimatedProps(() => {
    const h = alturaCheia * (0.85 + 0.15 * ciclo.value);
    return { y: CHAO - h, height: h };
  });
  return <AnimatedRect animatedProps={props} x={x} width={16} fill="none" stroke={cor} />;
}

const DESENHOS: Record<Cena, (p: Pincel) => React.ReactElement> = {
  producao: Producao,
  transporte: Transporte,
  relatorios: Relatorios,
  mais: Relatorios,
  insumos: Producao,
  receitas: Producao,
  produtos: Producao,
  lojas: Transporte,
  pedidos: Transporte,
  separacao: Transporte,
  perdas: Relatorios,
  lotes: Producao,
  compras: Relatorios,
  gente: Relatorios,
  ajustes: Relatorios,
  assistente: Relatorios,
  espelho: Transporte,
};
