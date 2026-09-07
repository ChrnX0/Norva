import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useAppearance } from '@/theme/Appearance';
import { escurecer, hues } from '@/theme/tokens';
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
  const { color, scheme, accent } = useTheme();
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
    /**
     * O ASSUNTO carrega a cor da ÁREA, e não a da colina.
     *
     * **Cobrado pelo dono em 7 de setembro, em três palavras: "porque é tudo
     * verde?"** — e ele estava olhando o defeito certo. As cinco camadas da faixa
     * saíam todas da mesma matiz: céu, colina de longe, colina de perto, pátio e a
     * silhueta. Cinco tons de uma cor só é o *"apagado"* que ele já tinha recusado
     * no Papel, escrito na outra pele.
     *
     * O conserto não é clarear nem inventar uma cor bonita: é a silhueta usar o
     * acento da ÁREA, que é um sistema que o aplicativo já tem e que já pinta a
     * régua e o crachá do cartão logo abaixo. Aí a cor **diz** alguma coisa —
     * produção é terracota, transporte é lavanda, relatório é ocre — em vez de
     * enfeitar. É a mesma regra do `tintaCheia: 'area'` desta pele: aqui a cor é o
     * assunto.
     *
     * O pátio NÃO acompanha: ele é cenário, fica na cor da colina, e é esse
     * contraste que separa o que a tela é do que está em volta.
     */
    massa: accent,
    // O vão é a única coisa com cor quente na cena, e é assim que ele significa
    // "aceso". Cor alternando em todo elemento é cor que não quer dizer nada.
    vazio: noite ? '#F5C66A' : '#FFFFFF',
    longe: noite ? escurecer(paleta.hillFar, 0.5) : escurecer(paleta.hillFar, 0.93),
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
            <Stop offset="0" stopColor={noite ? color.paper : paleta.skyTop} />
            <Stop offset="1" stopColor={noite ? escurecer(paleta.skyBottom, 0.3) : paleta.skyBottom} />
          </LinearGradient>
        </Defs>
        <Rect width={PRANCHA_DO_CABECALHO.largura} height={PRANCHA_DO_CABECALHO.altura} fill="url(#ceuDaFaixa)" />

        <Ceu noite={noite} />
        <AnimatedG animatedProps={arLonge}>
          <Path
            d="M-16 51c62-14 106 9 182 2s120-17 200-7v34H-16z"
            fill={noite ? escurecer(paleta.hillFar, 0.42) : paleta.hillFar}
          />
        </AnimatedG>
        {/* O bosque mora ENTRE as colinas, e é isso que constrói a profundidade:
            atrás dele passa a colina de longe, na frente vem a de perto. */}
        {/* O desvio do trecho vai NUM GRUPO DE DENTRO, nunca ao lado do `transform`
            animado do pai: `animatedProps` substitui o `transform` declarado, e foi
            assim que a engrenagem sumiu da faixa algumas horas atrás. */}
        <AnimatedG animatedProps={arLonge}>
          <G transform={`translate(${desvioDoTrecho(cena)} 0)`}>
            <Patio {...pincel} noite={noite} />
          </G>
        </AnimatedG>
        <AnimatedG animatedProps={arPerto}>
          <Path
            d="M-16 62c70-11 116 7 182 3s114-14 200-4v27H-16z"
            fill={noite ? escurecer(paleta.hillNear, 0.58) : paleta.hillNear}
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
 * O CÉU: sol de dia, lua e estrelas à noite — e é o vocabulário da capa, não um novo.
 *
 * **Cobrado pelo dono em 7 de setembro:** *"não falta um poste? uma lua? estrelas?...
 * no light um solzinho como na home..."*. O céu da faixa estava vazio, e vazio numa
 * faixa baixa é o que faz o meio dela ler como desligado — o mesmo defeito que as
 * árvores tentaram consertar pelo caminho errado.
 *
 * O que muda desta vez é de onde a coisa vem: sol, lua e estrelas já existem no herói
 * da capa que ele aprovou. Não é encher espaço, é a faixa falar a língua da própria
 * pele — e um céu tem sol ou lua em qualquer mundo, inclusive no de uma fábrica.
 *
 * **As estrelas ficam PARADAS**, pela mesma regra que a capa já escreve: piscar é o
 * primeiro movimento que a casa proíbe, e um céu piscando compete com quem trabalha.
 */
function Ceu({ noite }: { noite: boolean }) {
  // O giro do sol é o mesmo da capa em compasso de faixa: devagar o bastante para
  // não chamar, vivo o bastante para o céu não ser um retângulo de cor.
  const giro = useCiclo(90_000, { repouso: 0 });
  const ar = useAnimatedProps(() => ({
    transform: [
      { translateX: 150 },
      { translateY: 22 },
      { rotate: `${giro.value * 360}deg` },
      { translateX: -150 },
      { translateY: -22 },
    ],
  }));

  if (noite) {
    return (
      <G>
        <G fill="#F7E6B5">
          <Circle cx={96} cy={14} r={0.9} opacity={0.5} />
          <Circle cx={124} cy={26} r={0.7} opacity={0.38} />
          <Circle cx={168} cy={10} r={1} opacity={0.55} />
          <Circle cx={196} cy={30} r={0.8} opacity={0.42} />
          <Circle cx={214} cy={16} r={0.6} opacity={0.32} />
        </G>
        {/* O quarto: um arco grande e um menor voltando, como no herói. Recortar por
            círculo da cor do céu não serve — o céu é degradê, e a emenda apareceria. */}
        <Path
          d="M144 12a11 11 0 1 0 3 20 9 9 0 1 1-3-20z"
          fill="#F7E6B5"
          opacity={0.9}
        />
      </G>
    );
  }

  return (
    <AnimatedG animatedProps={ar}>
      <Circle cx={150} cy={22} r={7} fill="#FFD76A" />
      <G stroke="#FFD76A" strokeWidth={1.6} strokeLinecap="round">
        <Path d="M150 9v3M150 32v3M137 22h3M160 22h3M141 13l2 2M157 29l2 2M159 13l-2 2M143 29l-2 2" />
      </G>
    </AnimatedG>
  );
}

/**
 * O PÁTIO à esquerda: dois silos, um galpão e uma LUMINÁRIA.
 *
 * **A primeira versão eram três árvores, e o dono as recusou com a pergunta certa:**
 * *"o q são essas árvores esquisitas aí? suponho q sejam fungos... mas o q q isso
 * tem a ver com 'ajustes'? o app nao é aplicativo de biologia. é produção,
 * controle, transporte, financeiro..."*
 *
 * Ele está certo e o defeito não é o desenho ser feio: é ser **decoração**. Eu
 * tinha um vão de trinta por cento de céu vazio e o enchi com a primeira coisa que
 * cabia num horizonte, em vez de com a coisa que pertence a ESTE horizonte. É o
 * mesmo defeito do alerta inventado, virado para o desenho — encher espaço com o
 * que não afirma nada ensina a não olhar.
 *
 * O que pertence é o mundo em que o assunto vive: silo, galpão, poste. A leitura
 * fica "o pátio, e nele a coisa de que esta tela fala" em vez de "a natureza, e nela
 * um caminhão".
 *
 * E a regra do *"feio"* continua valendo por cima: **alturas diferentes, vãos
 * desiguais, nenhum com cor.** Dois silos idênticos lado a lado seriam papel de
 * parede com outro contorno.
 */
function Patio({ longe, vazio, noite }: Pincel & { noite: boolean }) {
  return (
    <>
      <G fill={longe}>
      {/* O silo alto: cilindro com tampa cônica. */}
      <Path d="M16 62V34a10 10 0 0 1 20 0v28z" />
      <Path d="M14 34l12-11 12 11z" />
      {/* O galpão baixo, de telhado de duas águas — mais largo que alto. */}
      <Path d="M44 62V48h34v14z" />
      <Path d="M41 48l20-9 20 9z" />
      {/* O silo menor, encostado, e o poste fino que fecha o grupo. */}
      <Path d="M86 62V44a7 7 0 0 1 14 0v18z" />
      <Path d="M85 44l8-7 8 7z" />
      {/* O mastro e a HASTE que sai dele para o lado. A primeira versão punha uma
          travessa simétrica no topo e uma cabeça embaixo dela: lia como antena
          parabólica, não como luminária. O que faz um poste de luz é o braço em
          balanço, com a lâmpada pendurada na ponta. */}
      <Path d="M111 62V29h3v33z" />
      <Path d="M99 27h14v3H99z" />
      </G>
      {/* A lâmpada acende à noite e apaga de dia — é a única coisa do pátio que muda
          com a hora, e é ela que dá a hora sem escrever a hora. */}
      <Path d="M96 29h9l-2 5h-5z" fill={noite ? vazio : longe} />
    </>
  );
}

/**
 * O mesmo horizonte, outro trecho da estrada — e isto é conserto de folha de contato.
 *
 * Vendo as telas lado a lado (e só lado a lado), o bosque estava no MESMO pixel em
 * todas as dezoito. Um horizonte comum é o que faz as telas serem um lugar só; três
 * arbustos idênticos na mesma coordenada é o *"feio"* que o dono nomeou numa fileira
 * de quatro lojas iguais — repetição regular lê como padrão de papel de parede, não
 * como coisa.
 *
 * O desvio sai do NOME da cena e não de sorteio: sorteio muda a cada abertura, e uma
 * paisagem que se rearranja sozinha entre duas visitas à mesma tela é pior que a
 * repetição. Mesma tela, mesmo trecho, sempre.
 */
function desvioDoTrecho(cena: Cena): number {
  let soma = 0;
  for (let i = 0; i < cena.length; i++) soma += cena.charCodeAt(i) * (i + 1);
  return (soma % 9) * 6 - 24;
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

/**
 * O CAMINHÃO, e ele ANDA: o verbo do transporte é atravessar.
 *
 * **As rodas ficam FORA do corpo, e isso não é detalhe.** A primeira versão as
 * desenhava como meias-luas encostadas na barriga da carroceria, e no render em
 * escala de faixa o conjunto lia como um bloco com um degrau — um borrão, não um
 * caminhão. Roda que não se destaca do corpo não é roda: é sombra.
 *
 * O corpo para em 58 e as rodas ficam centradas em 61, então elas sobram por baixo
 * e por cima do contorno. O miolo vazado é o que fecha a leitura a três metros.
 */
function Caminhao({ massa, vazio }: Pincel): ReactElement {
  // Entra por fora da folha e sai por fora dela: um caminhão que nasce no meio do
  // quadro não está atravessando, está aparecendo.
  const passo = useCiclo(13_000, { repouso: 0.45 });
  const ar = useAnimatedProps(() => ({ transform: [{ translateX: -96 + passo.value * 470 }] }));
  return (
    <AnimatedG animatedProps={ar}>
      <G fill={massa}>
        {/* A carroceria, e a cabine mais baixa com o pára-brisa inclinado. */}
        <Path d="M0 36h52v22H0z" />
        <Path d="M52 43h13l9 15H52z" />
        <Path d="M8 61a6 6 0 1 1 12 0 6 6 0 0 1-12 0zM52 61a6 6 0 1 1 12 0 6 6 0 0 1-12 0z" />
      </G>
      <G fill={vazio}>
        <Path d="M55 46h8l5 8h-13z" />
        <Path d="M11.5 61a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0zM55.5 61a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z" />
      </G>
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

/**
 * A ENGRENAGEM — ajustes. Duas, de tamanhos diferentes, girando em sentidos opostos.
 *
 * **O giro NÃO usa a propriedade `origin`, e isso é cicatriz de foto.** A primeira
 * versão era um `<G origin="272, 42">` com `transform: [{ rotate }]` vindo de
 * `animatedProps` — e na foto do emulador a engrenagem aparecia no primeiro quadro
 * e **sumia** depois, sobrando um calço solto no horizonte. O `transform` animado
 * substitui o eixo declarado em `origin`, então a peça passa a girar em torno do
 * canto (0,0) do quadro e sai de vista em poucos graus.
 *
 * O eixo entra na própria lista de transformações — ir até o centro, girar, voltar
 * —, que não depende de propriedade nenhuma. Vale a pena repetir por que isto não
 * apareceu antes: `typecheck`, `lint` e a suíte inteira ficam verdes com a peça
 * fora da tela. **O que pegou foi olhar a foto.**
 */
function Engrenagem({ massa, vazio }: Pincel): ReactElement {
  const giro = useCiclo(34_000, { repouso: 0 });
  const grande = useAnimatedProps(() => ({
    transform: [
      { translateX: 258 },
      { translateY: 40 },
      { rotate: `${giro.value * 360}deg` },
      { translateX: -258 },
      { translateY: -40 },
    ],
  }));
  const pequena = useAnimatedProps(() => ({
    transform: [
      { translateX: 316 },
      { translateY: 52 },
      { rotate: `${-giro.value * 360}deg` },
      { translateX: -316 },
      { translateY: -52 },
    ],
  }));
  return (
    <>
      <AnimatedG animatedProps={grande}>
        <G fill={massa}>
          <Path d="M258 16a24 24 0 1 1 0 48 24 24 0 0 1 0-48z" />
          {DENTES.map((a) => (
            <Rect key={a} x={252} y={8} width={12} height={12} rx={2} transform={`rotate(${a} 258 40)`} />
          ))}
        </G>
        <Path d="M258 31a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" fill={vazio} />
      </AnimatedG>
      <AnimatedG animatedProps={pequena}>
        <G fill={massa}>
          <Path d="M316 38a14 14 0 1 1 0 28 14 14 0 0 1 0-28z" />
          {DENTES.map((a) => (
            <Rect key={a} x={312} y={34} width={8} height={8} rx={2} transform={`rotate(${a} 316 52)`} />
          ))}
        </G>
        <Path d="M316 47a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" fill={vazio} />
      </AnimatedG>
    </>
  );
}

/** Oito dentes, de quarenta e cinco em quarenta e cinco graus. */
const DENTES = [0, 45, 90, 135, 180, 225, 270, 315];

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
 * O CATA-VENTO — o clima.
 *
 * A tela do clima desenhava o gráfico de barras dos relatórios: ela não tinha cena
 * própria e pegou emprestada a mais próxima. Isso afirma "relatório" numa tela que
 * pergunta onde a fábrica fica — a mesma família de erro que pôs três árvores e dois
 * pássaros num cabeçalho de Ajustes, e que o dono nomeou: *"o app nao é aplicativo de
 * biologia"*. O desenho tem de ser do mundo da tela.
 *
 * Um cata-vento é objeto de pátio, tem verbo próprio (vira com o vento) e diz "tempo"
 * sem virar nuvem de desenho animado. E ele NÃO afirma o tempo de hoje: é a placa da
 * oficina, não o termômetro.
 */
function CataVento({ massa }: Pincel): ReactElement {
  const vento = useCiclo(12_000, { feitio: 'vaivem', repouso: 0.5 });
  const ar = useAnimatedProps(() => ({
    transform: [
      { translateX: 272 },
      { translateY: 24 },
      { rotate: `${-22 + vento.value * 44}deg` },
      { translateX: -272 },
      { translateY: -24 },
    ],
  }));
  return (
    <G fill={massa}>
      <Path d="M270 64V26h5v38z" />
      {/* A cruz dos rumos, que é o que faz ler cata-vento e não antena. */}
      <Path d="M254 38h37v4h-37z" />
      <Path d="M270 34h5v12h-5z" />
      <AnimatedG animatedProps={ar}>
        <Path d="M258 20h20v-6l14 10-14 10v-6h-20z" />
      </AnimatedG>
    </G>
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
  clima: CataVento,
};
