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


/** OS INSUMOS — a prateleira e a balança, que pende com o que se pesa. */
function Insumos({ tinta, acento, frio }: Pincel) {
  const ciclo = useCiclo(6400, { feitio: 'vaivem', repouso: 0.5 });
  const prato = useAnimatedProps(() => ({ transform: [{ rotate: `${-3 + ciclo.value * 6}deg` }] }));
  return (
    <>
      {/* Três sacos de insumo, encostados — com a boca amarrada, que é o que
          diz "saco" e não "envelope". A costura é tinta rebaixada e não a cor
          fria: azul dentro de um saco de açúcar não significa nada, e cor que
          não significa nada é ruído numa cena que cabe em setenta e dois. */}
      <G stroke={tinta}>
        <Path d="M16 64V36c0-4 4-6 4-10h18c0 4 4 6 4 10v28z" />
        <Path d="M22 26c2-4 12-4 14 0" />
        <Path d="M20 46h18" opacity={0.35} />
        <Path d="M52 64V40c0-4 4-5 4-9h16c0 4 4 5 4 9v24z" />
        <Path d="M58 31c2-3 10-3 12 0" />
        <Path d="M56 50h16" opacity={0.35} />
        <Path d="M86 64V44c0-3 3-4 3-7h14c0 3 3 4 3 7v20z" />
        <Path d="M90 37c2-3 8-3 10 0" />
      </G>
      {/* A balança de dois pratos: o braço pende devagar, que é o que ela faz. */}
      <G stroke={tinta}>
        <Path d="M188 64V28" />
        <Path d="M176 64h24" />
        <AnimatedG animatedProps={prato} origin="188, 28">
          <Path d="M148 28h80" />
          <Path d="M148 28v8M228 28v8" />
          <Path d="M136 36h24l-6 10h-12z" stroke={acento} />
          <Path d="M216 36h24l-6 10h-12z" stroke={acento} />
        </AnimatedG>
      </G>
      {/* O pote de medida, no fim — com as marcas de graduação, que é o que
          diferencia um copo medidor de um balde. */}
      <G stroke={tinta}>
        <Path d="M300 32h44l-6 32h-32z" />
        <Path d="M303 42h10M305 52h8" opacity={0.5} />
        <Path d="M306 46h32" stroke={frio} opacity={0.7} />
      </G>
    </>
  );
}

/** AS RECEITAS — o caderno aberto, com a página que respira. */
function Receitas({ tinta, acento, frio }: Pincel) {
  const ciclo = useCiclo(7600, { feitio: 'vaivem', repouso: 0 });
  const folha = useAnimatedProps(() => ({ transform: [{ translateX: ciclo.value * 7 }] }));
  return (
    <>
      <G stroke={tinta}>
        <Path d="M20 64V22c22-6 44-6 62 4v38c-18-10-40-10-62 0z" />
        <AnimatedG animatedProps={folha} origin="82, 26">
          <Path d="M82 26c18-10 40-10 62-4v42c-22-6-44-6-62 4z" />
          <Path d="M96 38h34M96 48h34M96 58h20" stroke={frio} />
        </AnimatedG>
        <Path d="M82 26v38" />
      </G>
      {/* As colheres de medida, penduradas. */}
      <G stroke={tinta}>
        <Path d="M186 22v22" />
        <Path d="M178 44h16l-3 14h-10z" stroke={acento} />
        <Path d="M222 22v18" />
        <Path d="M214 40h16l-3 18h-10z" />
      </G>
      {/* O produto que sai da receita. */}
      <G stroke={acento}>
        <Rect x="288" y="26" width="20" height="30" rx="8" />
        <Path d="M298 56v8" />
      </G>
      <G stroke={tinta}>
        <Rect x="322" y="26" width="20" height="30" rx="8" />
        <Path d="M332 56v8" />
      </G>
    </>
  );
}

/** OS PRODUTOS — a prateleira cheia, e um deles enchendo. */
function Produtos({ tinta, acento }: Pincel) {
  return (
    <>
      <G stroke={tinta}>
        <Path d="M14 40h336" />
      </G>
      {[24, 68, 112, 156, 200, 244, 288].map((x, i) => (
        <Picole key={x} x={x} cor={i === 3 ? acento : tinta} atrasoMs={i * 420} />
      ))}
      <G stroke={tinta}>
        <Path d="M326 44h22v20h-22z" />
        <Path d="M326 52h22" />
      </G>
    </>
  );
}

function Picole({ x, cor, atrasoMs }: { x: number; cor: string; atrasoMs: number }) {
  const ciclo = useCiclo(6800, { feitio: 'vaivem', atrasoMs, repouso: 0.5 });
  // O picolé balança um grau no palito, como coisa pendurada em prateleira.
  const props = useAnimatedProps(() => ({ transform: [{ rotate: `${-1 + ciclo.value * 2}deg` }] }));
  return (
    <AnimatedG animatedProps={props} origin={`${x + 9}, 40`} stroke={cor}>
      <Rect x={x} y="44" width="18" height="26" rx="7" />
      <Path d={`M${x + 9} 40v4`} />
    </AnimatedG>
  );
}

/** AS LOJAS — a rua, com os toldos balançando. */
function Lojas({ tinta, acento, frio }: Pincel) {
  return (
    <>
      {/* Alturas diferentes de propósito: quatro fachadas idênticas lado a lado
          leem como padrão de papel de parede, não como rua. */}
      <Loja x={14} topo={30} cor={tinta} toldo={acento} atrasoMs={0} />
      <Loja x={102} topo={38} cor={tinta} toldo={frio} atrasoMs={900} />
      <Loja x={190} topo={26} cor={tinta} toldo={acento} atrasoMs={1800} />
      <Loja x={278} topo={36} cor={tinta} toldo={frio} atrasoMs={2700} />
    </>
  );
}

function Loja({
  x,
  topo,
  cor,
  toldo,
  atrasoMs,
}: {
  x: number;
  /** Onde a fachada começa. É o que dá relevo à rua. */
  topo: number;
  cor: string;
  toldo: string;
  atrasoMs: number;
}) {
  const ciclo = useCiclo(5800, { feitio: 'vaivem', atrasoMs, repouso: 0.5 });
  const pano = useAnimatedProps(() => ({ transform: [{ scaleY: 0.94 + ciclo.value * 0.12 }] }));
  return (
    <G stroke={cor}>
      <Path d={`M${x} 64V${topo + 4}h72v${60 - topo}`} />
      <Path d={`M${x + 12} 64V48h20v16`} />
      <Path d={`M${x + 44} 48h18v10h-18z`} />
      <AnimatedG animatedProps={pano} origin={`${x + 36}, ${topo}`}>
        <Path d={`M${x - 4} ${topo}h80l-8 10h-64z`} stroke={toldo} />
      </AnimatedG>
    </G>
  );
}

/** OS PEDIDOS — a prancheta, e o risco que se marca. */
function Pedidos({ tinta, acento, frio }: Pincel) {
  const ciclo = useCiclo(5000, { repouso: 1 });
  const risco = useAnimatedProps(() => ({ opacity: Math.min(1, ciclo.value * 2.4) }));
  return (
    <>
      <G stroke={tinta}>
        <Path d="M20 20h72v44H20z" />
        <Path d="M44 14h24v10H44z" />
        <Path d="M32 36h30M32 46h30M32 56h18" stroke={frio} />
      </G>
      <AnimatedG animatedProps={risco} stroke={acento}>
        <Path d="M70 34l5 5 9-11" />
      </AnimatedG>
      {/* As caixas do pedido, empilhadas à espera. */}
      <G stroke={tinta}>
        <Path d="M126 40h52v24h-52z" />
        <Path d="M126 48h52M152 40v24" />
        <Path d="M134 40l5-8h26l5 8" />
        <Path d="M196 46h44v18h-44z" />
        <Path d="M196 52h44M218 46v18" />
      </G>
      {/* A loja que pediu. */}
      <G stroke={tinta}>
        <Path d="M280 64V40h56v24M276 40l8-10h48l8 10" />
        <Path d="M296 64V50h14v14" />
      </G>
    </>
  );
}

/** A SEPARAÇÃO — o engradado que entra na pilha. */
function Separacao({ tinta, acento, frio }: Pincel) {
  const ciclo = useCiclo(5600, { repouso: 1 });
  const entra = useAnimatedProps(() => ({
    opacity: Math.min(1, ciclo.value * 3),
    transform: [{ translateX: (1 - Math.min(1, ciclo.value * 1.6)) * 34 }],
  }));
  return (
    <>
      <G stroke={tinta}>
        <Path d="M16 44h48v20H16zM16 52h48M40 44v20" />
        <Path d="M16 24h48v20H16zM16 32h48M40 24v20" />
        <Path d="M78 44h48v20H78zM78 52h48M102 44v20" />
      </G>
      <AnimatedG animatedProps={entra} stroke={acento}>
        <Path d="M142 44h48v20h-48zM142 52h48M166 44v20" />
      </AnimatedG>
      {/* A lista de conferência, ao lado. */}
      <G stroke={tinta}>
        <Path d="M232 18h56v46h-56z" />
        <Path d="M244 32h32M244 42h32M244 52h20" stroke={frio} />
      </G>
      <G stroke={tinta}>
        <Path d="M308 64V40h40v24M304 40l8-9h32l8 9" />
      </G>
    </>
  );
}

/**
 * AS PERDAS — a gota que cai, que é o que perda faz.
 *
 * A primeira versão tinha um vão de sessenta unidades entre os picolés e as
 * barras, e a gota nascia em y 56 com o picolé terminando em 64: ela caía já
 * dentro do palito e o olho não pegava nada. A foto mostrou os dois.
 */
function Perdas({ tinta, acento, frio }: Pincel) {
  return (
    <>
      {/* Dois picolés derretendo, pendurados. */}
      <G stroke={acento}>
        <Rect x="16" y="18" width="22" height="28" rx="8" />
        <Path d="M27 46v6" />
      </G>
      <Gota x={27} atrasoMs={0} cor={acento} />
      <G stroke={tinta}>
        <Rect x="70" y="18" width="22" height="28" rx="8" />
        <Path d="M81 46v6" />
      </G>
      <Gota x={81} atrasoMs={2100} cor={frio} />

      {/* O balde que apara: é para onde as gotas vão, e por isso está debaixo
          delas e não do outro lado da folha. */}
      <G stroke={tinta}>
        <Path d="M12 64h84" />
      </G>

      {/* O mês contra o mês passado — perda é comparação, nunca um número só. */}
      <G stroke={tinta}>
        <Rect x="150" y="30" width="34" height="34" stroke={frio} />
        <Rect x="200" y="42" width="34" height="22" stroke={acento} />
        <Path d="M140 64h104" />
      </G>

      {/* O balde do mês, com o nível do que se juntou. */}
      <G stroke={tinta}>
        <Path d="M282 30h64l-8 34h-48z" />
        <Path d="M288 50h52" stroke={frio} />
        <Path d="M292 58h44" stroke={frio} opacity={0.5} />
      </G>
    </>
  );
}

function Gota({ x, atrasoMs, cor }: { x: number; atrasoMs: number; cor: string }) {
  const ciclo = useCiclo(4200, { atrasoMs, repouso: 0 });
  // Some ao TOCAR o chão, e não no meio do ar: a gota desaparecendo a meio
  // caminho lê como falha de desenho. Ela nasce na ponta do palito (y 52) e
  // percorre os doze até a linha do balde.
  const props = useAnimatedProps(() => ({
    opacity: ciclo.value < 0.06 ? 0 : Math.min(1, (1 - ciclo.value) * 3),
    transform: [{ translateY: ciclo.value * 12 }],
  }));
  return (
    <AnimatedPath
      animatedProps={props}
      d={`M${x} 52c-3 4-4 6-4 8a4 4 0 0 0 8 0c0-2-1-4-4-8z`}
      stroke={cor}
    />
  );
}

/** OS LOTES — as caixas etiquetadas, e a etiqueta que balança. */
function Lotes({ tinta, acento, frio }: Pincel) {
  return (
    <>
      <G stroke={tinta}>
        <Path d="M16 38h64v26H16zM16 48h64M48 38v26" />
        <Path d="M26 38l6-9h32l6 9" />
      </G>
      <Etiqueta x={96} atrasoMs={0} cor={acento} />
      <G stroke={tinta}>
        <Path d="M132 38h64v26h-64zM132 48h64M164 38v26" />
        <Path d="M142 38l6-9h32l6 9" />
      </G>
      <Etiqueta x={212} atrasoMs={1400} cor={frio} />
      {/* O código, que é o que a etiqueta carrega. */}
      <G stroke={tinta}>
        <Path d="M262 28h4v28h-4zM272 28h2v28h-2zM280 28h5v28h-5zM291 28h2v28h-2zM299 28h4v28h-4zM309 28h2v28h-2zM317 28h5v28h-5zM328 28h2v28h-2zM336 28h4v28h-4z" />
        <Path d="M262 64h78" stroke={frio} />
      </G>
    </>
  );
}

function Etiqueta({ x, atrasoMs, cor }: { x: number; atrasoMs: number; cor: string }) {
  const ciclo = useCiclo(6600, { feitio: 'vaivem', atrasoMs, repouso: 0.5 });
  const props = useAnimatedProps(() => ({ transform: [{ rotate: `${-6 + ciclo.value * 12}deg` }] }));
  return (
    <AnimatedG animatedProps={props} origin={`${x}, 30`} stroke={cor}>
      <Path d={`M${x} 30v8`} />
      <Path d={`M${x - 10} 38h20l-4 16h-12z`} />
      <Circle cx={x} cy="44" r="2" />
    </AnimatedG>
  );
}

/** AS COMPRAS — a nota, e o preço que anda. */
function Compras({ tinta, acento, frio }: Pincel) {
  const ciclo = useCiclo(5400, { feitio: 'vaivem', repouso: 0.5 });
  const seta = useAnimatedProps(() => ({ transform: [{ translateY: -ciclo.value * 6 }] }));
  return (
    <>
      {/* A nota, com o rasgo embaixo. */}
      <G stroke={tinta}>
        <Path d="M18 18h68v40l-8 6-9-6-9 6-9-6-9 6-9-6-8 6h-7z" />
        <Path d="M30 30h44M30 40h44M30 50h26" stroke={frio} />
      </G>
      {/* O preço subindo. */}
      <AnimatedG animatedProps={seta} stroke={acento}>
        <Path d="M118 54V26M110 34l8-8 8 8" />
      </AnimatedG>
      <G stroke={tinta}>
        <Path d="M104 64h30" />
      </G>
      {/* O que a nota comprou. */}
      <G stroke={tinta}>
        <Path d="M166 64V38c0-4 4-6 4-10h20c0 4 4 6 4 10v26z" />
        <Path d="M170 46h20" stroke={frio} />
        <Path d="M212 64V42c0-3 3-5 3-8h18c0 3 3 5 3 8v22z" />
      </G>
      {/* As moedas que pagaram. */}
      <G stroke={acento}>
        <Circle cx="290" cy="52" r="12" />
        <Circle cx="318" cy="52" r="12" />
        <Circle cx="304" cy="30" r="12" />
      </G>
    </>
  );
}

/** A GENTE — quem trabalha aqui, e o aceno de quem chega. */
function Gente({ tinta, acento, frio }: Pincel) {
  return (
    <>
      <Pessoa x={30} cor={tinta} atrasoMs={0} />
      <Pessoa x={100} cor={acento} atrasoMs={1500} />
      <Pessoa x={170} cor={tinta} atrasoMs={3000} />
      <Pessoa x={240} cor={frio} atrasoMs={4500} />
      {/* O crachá que os identifica no aparelho. */}
      <G stroke={tinta}>
        <Path d="M298 26h50v34h-50z" />
        <Circle cx="312" cy="38" r="5" />
        <Path d="M324 36h16M324 44h16M306 52h34" stroke={frio} />
      </G>
    </>
  );
}

function Pessoa({ x, cor, atrasoMs }: { x: number; cor: string; atrasoMs: number }) {
  const ciclo = useCiclo(5200, { feitio: 'vaivem', atrasoMs, repouso: 0.5 });
  // A cabeça balança meio grau: gente parada não fica de pedra.
  const props = useAnimatedProps(() => ({ transform: [{ rotate: `${-1.5 + ciclo.value * 3}deg` }] }));
  return (
    <AnimatedG animatedProps={props} origin={`${x}, 64`} stroke={cor}>
      <Circle cx={x} cy="26" r="9" />
      <Path d={`M${x - 16} 64c0-14 7-21 16-21s16 7 16 21`} />
    </AnimatedG>
  );
}

/** OS AJUSTES — os cursores, e o que se move quando alguém escolhe. */
function Ajustes({ tinta, acento, frio }: Pincel) {
  return (
    <>
      <Cursor y={24} cor={acento} atrasoMs={0} />
      <Cursor y={44} cor={tinta} atrasoMs={1900} />
      <Cursor y={62} cor={frio} atrasoMs={3800} />
    </>
  );
}

function Cursor({ y, cor, atrasoMs }: { y: number; cor: string; atrasoMs: number }) {
  const ciclo = useCiclo(7200, { feitio: 'vaivem', atrasoMs, repouso: 0.5 });
  const botao = useAnimatedProps(() => ({ transform: [{ translateX: ciclo.value * 190 }] }));
  return (
    <>
      <Path d={`M20 ${y}h300`} stroke={cor} opacity={0.45} />
      <AnimatedG animatedProps={botao} stroke={cor}>
        <Circle cx="80" cy={y} r="7" />
      </AnimatedG>
    </>
  );
}

/** O ASSISTENTE — a pergunta, e a resposta que se acende. */
function Assistente({ tinta, acento, frio }: Pincel) {
  const ciclo = useCiclo(4800, { feitio: 'vaivem', repouso: 0.5 });
  const brilho = useAnimatedProps(() => ({ opacity: 0.35 + ciclo.value * 0.65 }));
  return (
    <>
      <G stroke={tinta}>
        <Path d="M18 20h108v30H18l-6 10v-10z" />
        <Path d="M32 30h72M32 40h50" stroke={frio} />
      </G>
      <AnimatedG animatedProps={brilho} stroke={acento}>
        <Path d="M172 22v20M162 32h20M168 26l8 12M176 26l-8 12" />
      </AnimatedG>
      <G stroke={tinta}>
        <Path d="M214 34h122v30H220l-6 10z" />
        <Path d="M230 44h92M230 54h64" stroke={frio} />
      </G>
    </>
  );
}

/** O ESPELHO DA LOJA — o que foi, e a caixa que volta. */
function Espelho({ tinta, acento, frio }: Pincel) {
  const ciclo = useCiclo(6000, { repouso: 0 });
  const volta = useAnimatedProps(() => ({
    opacity: Math.sin(Math.min(1, ciclo.value) * Math.PI),
    transform: [{ translateX: -ciclo.value * 76 }],
  }));
  return (
    <>
      {/* A fábrica, à esquerda. */}
      <G stroke={tinta}>
        <Path d="M14 64V32l12 10V32l12 10V32l12 10v22" />
        <Path d="M14 64h36M22 64v-9h9v9" />
      </G>
      {/* A prateleira da loja, à direita, com o que ficou. */}
      <G stroke={tinta}>
        <Path d="M256 30h94M256 64h94" />
        <Rect x="266" y="34" width="16" height="24" rx="6" stroke={acento} />
        <Rect x="292" y="34" width="16" height="24" rx="6" />
        <Rect x="318" y="34" width="16" height="24" rx="6" stroke={acento} />
      </G>
      {/* A caixa que volta, andando da loja para a fábrica. */}
      <AnimatedG animatedProps={volta} stroke={frio}>
        <Path d="M182 42h44v22h-44zM182 50h44M204 42v22" />
        <Path d="M190 42l5-7h26l5 7" />
      </AnimatedG>
      <G stroke={tinta} opacity={0.4}>
        <Path d="M96 64h140" />
      </G>
    </>
  );
}

const DESENHOS: Record<Cena, (p: Pincel) => React.ReactElement> = {
  producao: Producao,
  transporte: Transporte,
  relatorios: Relatorios,
  mais: Ajustes,
  insumos: Insumos,
  receitas: Receitas,
  produtos: Produtos,
  lojas: Lojas,
  pedidos: Pedidos,
  separacao: Separacao,
  perdas: Perdas,
  lotes: Lotes,
  compras: Compras,
  gente: Gente,
  ajustes: Ajustes,
  assistente: Assistente,
  espelho: Espelho,
};
