import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useAppearance } from '@/theme/Appearance';
import { hues, noturno } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { useCiclo } from '../vida';
import { CHAO, PRANCHA_DO_CABECALHO, type Cena } from './prancha';

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * O cabeçalho vivo na língua do ORGÂNICO: céu, colina, e o assunto em silhueta.
 *
 * **Existe por uma correção do dono, em 7 de setembro** — *"o cabeçalho animado
 * pegou as animações do tema do Papel. pelo visto vc esqueceu de fazer para o
 * orgânico."* Ele estava certo, e o defeito era pior que esquecimento: a cena lia
 * a COR e a espessura da pele e desenhava **uma geometria só**, de traço fino e
 * canto duro. Isso é o *"o Orgânico é o Papel com outro desenho"* que este
 * projeto já recusou uma vez na capa — e a capa foi consertada movendo a peça
 * para `src/home/capas/`, enquanto as dezoito cenas de cabeçalho ficaram para trás.
 *
 * **O vocabulário não é novo, e isso é de propósito.** Céu em degradê, duas
 * colinas, coisas em massa cheia com janelas vazadas: é exatamente o que
 * `Landscape` desenha no herói da capa. Inventar uma terceira língua aqui faria o
 * cabeçalho pertencer a lugar nenhum; reusar faz o Orgânico parecer um produto em
 * vez de duas telas parecidas.
 *
 * **A prancheta é a MESMA** (364×72) e as coisas pousam no MESMO chão (`CHAO`, 64).
 * Não é economia de coordenada: no herói do Orgânico as coisas encostam na colina
 * a 186 de 210, e 64 de 72 é a mesma proporção — 88,6% contra 88,9%. As duas peles
 * têm horizontes diferentes na mesma altura, então trocar de pele muda o desenho e
 * não move a página.
 *
 * **E é UM sistema parametrizado, não dezoito desenhos.** Duas peles se pagam duas
 * vezes em tudo — está registrado no `CLAUDE.md`, com o preço medido — e trinta e
 * seis vinhetas sob medida seriam exatamente a dívida que aquela decisão manda
 * evitar. Aqui o que muda entre assuntos é a silhueta; o horizonte é o mesmo.
 */
export function CenaPaisagem({ cena }: { cena: Cena }) {
  const { color, scheme } = useTheme();
  const { hue } = useAppearance();
  const paleta = hues[hue];
  const noite = scheme === 'dark';
  const { width } = useWindowDimensions();
  const altura = useMemo(
    () => (width / PRANCHA_DO_CABECALHO.largura) * PRANCHA_DO_CABECALHO.altura,
    [width],
  );

  // A colina de trás anda devagar e a da frente um pouco mais, na direção
  // contrária: paralaxe é o que dá profundidade sem desenhar nada a mais. Vinte e
  // três segundos porque o cabeçalho fica aberto o dia todo, e movimento que se
  // percebe cansa. As duas passam do limite da prancheta de propósito — colina que
  // anda tem que ter sobra dos dois lados, senão aparece a borda.
  const longe = useCiclo(23_000, { feitio: 'vaivem', repouso: 0.5 });
  const perto = useCiclo(17_000, { feitio: 'vaivem', repouso: 0.5 });
  const arLonge = useAnimatedProps(() => ({ transform: [{ translateX: (longe.value - 0.5) * 9 }] }));
  const arPerto = useAnimatedProps(() => ({ transform: [{ translateX: (perto.value - 0.5) * -14 }] }));

  const Silhueta = SILHUETAS[cena];
  const pincel: Pincel = {
    // A silhueta é da cor da colina da frente, um tom mais fechada: é o que faz
    // uma coisa ler como recortada no horizonte em vez de colada em cima dele.
    massa: noite ? noturno(paleta.hillNear, 0.72) : paleta.hillNear,
    // O vão é a única coisa com cor quente na cena, e é assim que ele significa
    // "aceso". Cor alternando em todo elemento é cor que não quer dizer nada.
    vazio: noite ? '#F5C66A' : '#FFFFFF',
    longe: noite ? noturno(paleta.hillFar, 0.5) : paleta.hillFar,
  };

  return (
    <View style={{ width: '100%', height: altura }} pointerEvents="none" accessibilityRole="image">
      {/* Uma camada só, e sem `preserveAspectRatio="none"`: a altura sai da largura
          pela proporção da prancheta, então o encaixe é exato e nada estica. No
          herói da capa a altura é fixa e por isso lá o horizonte precisa esticar
          numa camada separada — aqui esse problema não existe. */}
      <Svg
        viewBox={`0 0 ${PRANCHA_DO_CABECALHO.largura} ${PRANCHA_DO_CABECALHO.altura}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <LinearGradient id="ceuDaFaixa" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={noite ? color.paper : paleta.skyTop} stopOpacity={0.92} />
            <Stop offset="1" stopColor={noite ? noturno(paleta.skyBottom, 0.3) : paleta.skyBottom} />
          </LinearGradient>
        </Defs>
        <Rect width={PRANCHA_DO_CABECALHO.largura} height={PRANCHA_DO_CABECALHO.altura} fill="url(#ceuDaFaixa)" />

        <AnimatedG animatedProps={arLonge}>
          <Path
            d="M-16 51c62-14 106 9 182 2s120-17 200-7v34H-16z"
            fill={noite ? noturno(paleta.hillFar, 0.42) : paleta.hillFar}
          />
        </AnimatedG>
        {/* O bosque mora ENTRE as colinas, e é isso que constrói a profundidade:
            atrás dele passa a colina de longe, na frente vem a de perto. */}
        <AnimatedG animatedProps={arLonge}>
          <Bosque {...pincel} />
        </AnimatedG>
        <AnimatedG animatedProps={arPerto}>
          <Path
            d="M-16 62c70-11 116 7 182 3s114-14 200-4v27H-16z"
            fill={noite ? noturno(paleta.hillNear, 0.58) : paleta.hillNear}
          />
        </AnimatedG>

        {/* O ASSUNTO não anda com a colina: ele é o que a tela é sobre, e coisa
            que desliza com o fundo lê como decoração de fundo. */}
        <Silhueta {...pincel} />
      </Svg>
    </View>
  );
}

type Pincel = {
  /** A massa da silhueta — colina da frente, um tom mais fechada. */
  massa: string;
  /** O vão aceso: janela, porta, visor. A única cor quente da cena. */
  vazio: string;
  /** A distância: o que está atrás do assunto usa a colina de longe. */
  longe: string;
};

/**
 * Três árvores à esquerda — e elas existem para a folha não ficar torta.
 *
 * A prancheta manda a cena ocupar a largura inteira (`prancha.ts` explica por quê:
 * uma composição apertada num terço lê como desenho torto, não como desenho
 * pequeno). Um assunto só não enche 364 sem virar gigante, então o resto da folha
 * é paisagem.
 *
 * E a regra que o dono deu com uma palavra — *"feio"*, sobre quatro lojas iguais em
 * fila — vale aqui inteira: **alturas diferentes, vãos desiguais, nenhuma com cor**.
 * Três árvores idênticas e igualmente espaçadas seriam papel de parede.
 */
function Bosque({ longe }: Pincel) {
  return (
    <G fill={longe}>
      <Path d="M22 62V46c-9-1-11-9-5-13s5-11 12-11 13 6 12 12 3 11-5 12v16z" />
      <Path d="M58 63V54c-6 0-8-6-4-9s3-8 8-8 9 4 8 8 2 9-4 9v9z" />
      <Path d="M96 62V49c-8-1-10-8-4-11s4-9 10-9 11 5 10 10 2 9-5 10v13z" />
    </G>
  );
}

/**
 * A FÁBRICA — produção, e o menu, que é o pátio de onde se vê tudo.
 *
 * Telhado dente-de-serra, chaminé e três janelas acesas: a mesma fábrica do herói
 * da capa, na escala da faixa. A fumaça sobe da BOCA da chaminé e não do ar acima
 * dela — foi um defeito real na vinheta do Papel e não se repete aqui.
 */
function Fabrica({ massa, vazio }: Pincel): ReactElement {
  const fumaca = useCiclo(9000, { repouso: 0.4 });
  const ar = useAnimatedProps(() => ({
    transform: [{ translateY: -14 * fumaca.value }],
    opacity: Math.sin(fumaca.value * Math.PI) * 0.6,
  }));
  return (
    <>
      <AnimatedG animatedProps={ar}>
        <Path d="M296 26a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" fill={massa} />
      </AnimatedG>
      <G fill={massa}>
        <Path d="M236 40h56v24h-56z" />
        <Path d="M236 40l9-12 9 12 10-12 9 12 10-12 9 12z" />
        <Rect x={294} y={24} width={9} height={40} />
      </G>
      <G fill={vazio}>
        <Rect x={243} y={48} width={8} height={8} />
        <Rect x={257} y={48} width={8} height={8} />
        <Rect x={271} y={48} width={8} height={8} />
      </G>
    </>
  );
}

/** O CAMINHÃO, e ele ANDA: o verbo do transporte é atravessar. */
function Caminhao({ massa, vazio }: Pincel): ReactElement {
  const passo = useCiclo(13_000, { repouso: 0.4 });
  const ar = useAnimatedProps(() => ({ transform: [{ translateX: 130 + passo.value * 200 }] }));
  return (
    <AnimatedG animatedProps={ar}>
      <G fill={massa}>
        <Path d="M0 42h52v22H0z" />
        <Path d="M52 48h16l10 16H52z" />
        <Path d="M6 64a6 6 0 1 1 13 0zM56 64a6 6 0 1 1 13 0z" />
      </G>
      <Rect x={56} y={51} width={10} height={8} fill={vazio} />
    </AnimatedG>
  );
}

/** As BARRAS do relatório: crescem uma depois da outra, alturas desiguais. */
function Barras({ massa }: Pincel): ReactElement {
  const sobe = useCiclo(10_400, { feitio: 'vaivem', repouso: 1 });
  const meia = useAnimatedProps(() => ({ transform: [{ scaleY: 0.55 + sobe.value * 0.45 }] }));
  const cheia = useAnimatedProps(() => ({ transform: [{ scaleY: 0.95 - sobe.value * 0.35 }] }));
  return (
    <G fill={massa}>
      <Rect x={214} y={44} width={15} height={20} />
      <AnimatedG animatedProps={meia} origin={`243, ${CHAO}`}>
        <Rect x={236} y={32} width={15} height={32} />
      </AnimatedG>
      <AnimatedG animatedProps={cheia} origin={`265, ${CHAO}`}>
        <Rect x={258} y={22} width={15} height={42} />
      </AnimatedG>
      <Rect x={280} y={38} width={15} height={26} />
      <Rect x={302} y={50} width={15} height={14} />
    </G>
  );
}

/** Os SACOS de insumo, encostados — tamanhos diferentes, vãos desiguais. */
function Sacos({ massa }: Pincel): ReactElement {
  return (
    <G fill={massa}>
      <Path d="M228 34c11-7 25-7 36 0l6 30h-48z" />
      <Path d="M276 44c9-5 20-5 29 0l5 20h-39z" />
      <Path d="M314 50c6-4 14-4 20 0l4 14h-28z" />
    </G>
  );
}

/** O TACHO da receita, com vapor saindo da boca. */
function Tacho({ massa }: Pincel): ReactElement {
  const vapor = useCiclo(7400, { repouso: 0.4 });
  const ar = useAnimatedProps(() => ({
    transform: [{ translateY: -16 * vapor.value }],
    opacity: Math.sin(vapor.value * Math.PI) * 0.55,
  }));
  return (
    <>
      <AnimatedG animatedProps={ar}>
        <Path d="M266 28a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" fill={massa} />
      </AnimatedG>
      <G fill={massa}>
        <Path d="M232 42h68l-9 22h-50z" />
        <Rect x={224} y={37} width={84} height={6} rx={3} />
      </G>
    </>
  );
}

/** As CAIXAS: o que a fábrica faz vira volume. A de cima assenta devagar. */
function Caixas({ massa, vazio }: Pincel): ReactElement {
  const assenta = useCiclo(8200, { feitio: 'vaivem', repouso: 0.4 });
  const ar = useAnimatedProps(() => ({ transform: [{ translateY: -3.5 * assenta.value }] }));
  return (
    <>
      <G fill={massa}>
        <Path d="M222 44h46v20h-46z" />
        <Path d="M274 50h38v14h-38z" />
      </G>
      <AnimatedG animatedProps={ar}>
        <Path d="M234 26h34v16h-34z" fill={massa} />
        <Rect x={247} y={26} width={8} height={16} fill={vazio} />
      </AnimatedG>
    </>
  );
}

/**
 * A caixa TOMBADA — perdas.
 *
 * Não é a mesma silhueta dos produtos, e não deveria ser: uma perda não é um
 * volume a mais na pilha. O que a distingue à distância é a inclinação e o que
 * caiu fora — e nada aqui se mexe, porque perda não tem verbo em curso.
 */
function Tombada({ massa }: Pincel): ReactElement {
  return (
    <G fill={massa}>
      <Path d="M232 40l34 12-8 22-34-12z" />
      <Path d="M276 58a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM294 60a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM308 62a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" />
    </G>
  );
}

/** A LOJA: toldo e porta. A luz da porta acende devagar — o verbo é estar aberta. */
function Loja({ massa, vazio }: Pincel): ReactElement {
  const luz = useCiclo(12_000, { feitio: 'vaivem', repouso: 1 });
  const ar = useAnimatedProps(() => ({ opacity: 0.5 + luz.value * 0.5 }));
  return (
    <>
      <G fill={massa}>
        <Path d="M234 40h74v24h-74z" />
        <Path d="M226 40c9-11 24-15 45-15s36 4 45 15z" />
      </G>
      <AnimatedG animatedProps={ar}>
        <Rect x={262} y={48} width={18} height={16} fill={vazio} />
      </AnimatedG>
    </>
  );
}

/** GENTE na colina: três alturas, e é só isso que impede a fila de virar padrão. */
function Gente({ massa }: Pincel): ReactElement {
  const balanco = useCiclo(9600, { feitio: 'vaivem', repouso: 0.5 });
  const um = useAnimatedProps(() => ({ transform: [{ translateY: -1.5 * balanco.value }] }));
  const dois = useAnimatedProps(() => ({ transform: [{ translateY: -2.5 * (1 - balanco.value) }] }));
  return (
    <G fill={massa}>
      <AnimatedG animatedProps={um}>
        <Path d="M234 40a6 6 0 1 1 12 0 6 6 0 0 1-12 0zM232 50c0-6 5-8 8-8s8 2 8 8v14h-16z" />
      </AnimatedG>
      <AnimatedG animatedProps={dois}>
        <Path d="M266 32a7 7 0 1 1 14 0 7 7 0 0 1-14 0zM264 45c0-7 6-9 9-9s9 2 9 9v19h-18z" />
      </AnimatedG>
      <Path d="M300 42a5 5 0 1 1 10 0 5 5 0 0 1-10 0zM298 51c0-5 4-7 7-7s7 2 7 7v13h-14z" />
    </G>
  );
}

/**
 * A ESCUTA — o assistente.
 *
 * Um poste e três arcos que saem dele, um depois do outro. O verbo é *ouvir*, e é
 * o desenho certo para o que o dono acabou de pedir: chamar a secretária por voz,
 * *"Hey, Norva"*. Uma silhueta de gente aqui diria que o assistente é uma pessoa,
 * e ele não é.
 */
function Escuta({ massa }: Pincel): ReactElement {
  // Os três arcos são o MESMO ciclo em três fases, e por isso a onda sai de dentro
  // para fora em vez de os três piscarem juntos. Um laço com `useAnimatedProps`
  // dentro seria hook em função que não é componente — três chamadas escritas é o
  // que o React garante.
  const onda = useCiclo(6800, { repouso: 0.5 });
  const perto = useAnimatedProps(() => ({ opacity: Math.sin(onda.value * Math.PI) * 0.9 }));
  const meio = useAnimatedProps(() => ({
    opacity: Math.sin(((onda.value + 0.33) % 1) * Math.PI) * 0.9,
  }));
  const longeDali = useAnimatedProps(() => ({
    opacity: Math.sin(((onda.value + 0.66) % 1) * Math.PI) * 0.9,
  }));
  return (
    <G fill={massa}>
      <Rect x={252} y={36} width={7} height={28} />
      <Path d="M248 30a12 12 0 0 1 15 0l-7 8z" />
      <AnimatedG animatedProps={perto}>
        <Path d="M272 30a20 20 0 0 1 0 24l-4-3a15 15 0 0 0 0-18z" />
      </AnimatedG>
      <AnimatedG animatedProps={meio}>
        <Path d="M284 22a34 34 0 0 1 0 40l-4-3a29 29 0 0 0 0-34z" />
      </AnimatedG>
      <AnimatedG animatedProps={longeDali}>
        <Path d="M296 14a48 48 0 0 1 0 56l-4-3a43 43 0 0 0 0-50z" />
      </AnimatedG>
    </G>
  );
}

/** A ENGRENAGEM — ajustes. Gira devagar, porque é o único verbo que ela tem. */
function Engrenagem({ massa, vazio }: Pincel): ReactElement {
  const giro = useCiclo(28_000, { repouso: 0 });
  const ar = useAnimatedProps(() => ({ transform: [{ rotate: `${giro.value * 360}deg` }] }));
  const dentes = Array.from({ length: 8 }, (_, i) => i);
  return (
    <>
      <AnimatedG animatedProps={ar} origin="272, 42">
        <G fill={massa}>
          <Path d="M272 20a22 22 0 1 1 0 44 22 22 0 0 1 0-44z" />
          {dentes.map((i) => (
            <Rect key={i} x={267} y={12} width={10} height={10} rx={2} origin="272, 42" rotation={i * 45} />
          ))}
        </G>
        <Path d="M272 34a8 8 0 1 1 0 16 8 8 0 0 1 0-16z" fill={vazio} />
      </AnimatedG>
      <Rect x={300} y={52} width={26} height={12} rx={5} fill={massa} />
    </>
  );
}

/** A ESTANTE da cópia: prateleiras de comprimentos diferentes, e uma pasta a guardar. */
function Estante({ massa, vazio }: Pincel): ReactElement {
  const guardar = useCiclo(11_000, { feitio: 'vaivem', repouso: 1 });
  const ar = useAnimatedProps(() => ({ transform: [{ translateX: -20 + guardar.value * 20 }] }));
  return (
    <>
      <G fill={massa}>
        <Rect x={228} y={26} width={78} height={5} rx={2} />
        <Rect x={238} y={44} width={62} height={5} rx={2} />
        <Rect x={228} y={59} width={88} height={5} rx={2} />
        <Rect x={246} y={33} width={24} height={11} rx={2} />
        <Rect x={276} y={51} width={30} height={8} rx={2} />
      </G>
      <AnimatedG animatedProps={ar}>
        <Rect x={252} y={49} width={18} height={10} rx={2} fill={massa} />
        <Rect x={258} y={49} width={5} height={10} fill={vazio} />
      </AnimatedG>
    </>
  );
}

/**
 * Qual silhueta cada assunto usa — e o compartilhamento é escolha, não preguiça.
 *
 * Na escala de uma silhueta no horizonte alguns assuntos SÃO a mesma coisa: um
 * pedido e uma loja são a mesma fachada, uma compra e um insumo são o mesmo saco,
 * um lote e um produto são a mesma caixa. Desenhar dois contornos que ninguém
 * distingue a essa distância seria pagar duas vezes por uma diferença que a tela
 * não mostra — e é a dívida das duas peles que o `CLAUDE.md` manda evitar.
 *
 * O que NÃO se compartilha é o verbo. Perdas ganhou caixa tombada em vez da pilha,
 * e o assistente ganhou a escuta em vez da gente, porque nos dois casos a silhueta
 * emprestada afirmaria a coisa errada: que uma perda é volume a mais no estoque, e
 * que o assistente é uma pessoa.
 */
const SILHUETAS: Record<Cena, (p: Pincel) => ReactElement> = {
  producao: Fabrica,
  mais: Fabrica,
  transporte: Caminhao,
  separacao: Caminhao,
  relatorios: Barras,
  espelho: Barras,
  insumos: Sacos,
  compras: Sacos,
  receitas: Tacho,
  produtos: Caixas,
  lotes: Caixas,
  perdas: Tombada,
  lojas: Loja,
  pedidos: Loja,
  gente: Gente,
  assistente: Escuta,
  ajustes: Engrenagem,
  copia: Estante,
};
