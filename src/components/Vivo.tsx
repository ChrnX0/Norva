import type { ReactNode } from 'react';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { G, Rect } from 'react-native-svg';
import { useCiclo, type Feitio } from './vida';

const GrupoVivo = Animated.createAnimatedComponent(G);
const BarraViva = Animated.createAnimatedComponent(Rect);

/**
 * O vocabulário de movimento dos desenhos — um só, para os vinte e seis.
 *
 * Esta é a peça que impede a exigência do dono ("todos os iconezinhos animados,
 * sutil mas vivo") de virar vinte e seis animações escritas à mão, cada uma com
 * o seu jeito. Isso não seria uma assinatura: seriam vinte e seis. Aqui existe
 * uma lista fechada de movimentos, tirada do desenho aprovado, e cada glifo
 * ESCOLHE um — do mesmo jeito que escolhe uma cor da paleta em vez de inventar
 * um hexadecimal.
 *
 * Os movimentos são os que a cena da capa já fazia, nomeados:
 *
 * | movimento | o que faz | quem faz isso na cena |
 * |---|---|---|
 * | `gira`   | volta inteira em torno de um ponto | o sol (30s), o floco (48s) |
 * | `sobe`   | sobe e some, e recomeça embaixo    | a fumaça da chaminé (6s)   |
 * | `balanca`| inclina para um lado e volta       | — (novo, mesma família)    |
 * | `anda`   | desliza num eixo e volta ao lugar  | a caixa da expedição       |
 *
 * **Não existe "respira" aqui, de propósito.** Crescer e encolher um pouquinho é
 * exatamente o respiro genérico do `Alive` — o mesmo movimento para as vinte e
 * seis coisas —, e é ele que o dono recusou ao pedir que cada uma se mexesse como
 * ela mesma. Deixá-lo na lista seria oferecer a saída fácil para o próximo glifo
 * difícil, e a lista voltaria a ter um movimento só.
 *
 * **Nem "chega".** Entrada é trabalho do casco (`Reveal` e `Alive` já assentam o
 * cartão inteiro); um glifo que também "chega" briga com quem o carrega. O que
 * mora aqui é o que a coisa faz DEPOIS de estar na tela.
 *
 * **Por que um `<G>` animado e não uma `<View>` por cima.** A cena da fábrica
 * põe o sol e a caixa FORA do `<Svg>`, numa camada própria, e o comentário lá
 * explica: `transform` animado num `<Path>` não atravessava igual no Android, no
 * iOS e no navegador. Aqui é outra coisa — as props discretas do `<G>`
 * (`rotation`, `originX`, `originY`, `translateX`, `translateY`, `opacity`) são
 * a API que o `react-native-svg` expõe para isso, e elas animam por
 * `animatedProps`, que é o mesmo caminho já provado pelo picolé que enche.
 *
 * A diferença importa porque aqui o movimento é de uma PARTE do desenho: a
 * coluna do termômetro, a roda do caminhão, o floco dentro da câmara. Uma
 * `View` por cima não sabe onde essa parte está — teria que repetir a posição em
 * pixels e sair do lugar no dia em que alguém mexesse no traço.
 */
export type Vida =
  | { como: 'gira'; cicloMs: number; centro: readonly [number, number] }
  | { como: 'sobe'; cicloMs: number; altura: number; atrasoMs?: number }
  | { como: 'balanca'; cicloMs: number; graus: number; centro: readonly [number, number] }
  | { como: 'anda'; cicloMs: number; passo: number; eixo?: 'x' | 'y' }
  | { como: 'nenhum' };

/**
 * Envolve a PARTE do desenho que se mexe, dentro do `<Svg>`.
 *
 * As coordenadas de `centro` e de `passo` são as da prancheta do glifo (a grade
 * de 32×32), nunca pixels de tela: assim o movimento escala junto com o desenho,
 * de 26 px numa lista a 64 px num cartão.
 */
export function Vivo({ vida, children }: { vida: Vida; children: ReactNode }) {
  // O gancho roda sempre, com o mesmo número de chamadas em toda renderização —
  // 'nenhum' vira um ciclo parado em vez de um `if` antes do `useCiclo`, porque
  // gancho de React não pode entrar e sair conforme a escolha.
  const ciclo = useCiclo(vida.como === 'nenhum' ? 1000 : vida.cicloMs, {
    feitio: feitioDe(vida),
    atrasoMs: vida.como === 'sobe' ? (vida.atrasoMs ?? 0) : 0,
    // A fumaça em zero é invisível (a opacidade dela é um seno que começa em
    // zero); parada no meio da subida ela está opaca e no lugar. Os outros
    // repousam em zero, que já é o desenho direito.
    repouso: vida.como === 'sobe' ? 0.5 : 0,
  });

  const props = useAnimatedProps(() => desenhar(vida, ciclo.value));

  if (vida.como === 'nenhum') return <G>{children}</G>;
  return <GrupoVivo animatedProps={props}>{children}</GrupoVivo>;
}

/**
 * Todo movimento daqui percorre a volta inteira de zero a um, sem voltar pelo
 * caminho — o vai-e-vem de `balanca` e `anda` vem do SENO aplicado a essa volta,
 * não de o ciclo andar para trás. Assim `t=0` é sempre o repouso, e é isso que
 * faz "reduzir movimento" parar o desenho no lugar em vez de parar torto.
 */
function feitioDe(_vida: Vida): Feitio {
  return 'volta';
}

/**
 * O ciclo virado em atributos de SVG. Roda na thread de UI, então é worklet.
 *
 * Escrito num `switch` sem função auxiliar de propósito: worklet não chama
 * função comum de forma síncrona, e essa lição custou um app morto na abertura
 * nesta mesma sessão.
 */
function desenhar(vida: Vida, t: number): Record<string, number> {
  'worklet';
  switch (vida.como) {
    case 'gira':
      return { rotation: t * 360, originX: vida.centro[0], originY: vida.centro[1] };
    case 'sobe':
      // Sobe e some: opaca no meio do caminho, transparente nas duas pontas. É
      // a fumaça da chaminé, e é o que faz um ciclo que recomeça não dar solavanco.
      return { translateY: -t * vida.altura, opacity: Math.sin(t * Math.PI) };
    // Seno, e não uma rampa de -1 a +1. A diferença não é de estilo: com a rampa,
    // t=0 é o EXTREMO — a etiqueta nascia torta e, com "reduzir movimento"
    // ligado, ficava torta para sempre, porque o ciclo estaciona em zero. Com o
    // seno, zero é o repouso: o desenho nasce direito, oscila para os dois lados,
    // e quem desligou movimento vê o desenho no lugar dele.
    case 'balanca':
      return {
        rotation: Math.sin(t * 2 * Math.PI) * vida.graus,
        originX: vida.centro[0],
        originY: vida.centro[1],
      };
    case 'anda': {
      // O eixo é do objeto: caminhão anda de lado, barra de gráfico anda para
      // cima. Um só parâmetro em vez de um movimento novo — a lista fechada só
      // cresce quando o mecanismo é outro, não quando a direção é outra.
      const d = Math.sin(t * 2 * Math.PI) * vida.passo;
      return vida.eixo === 'y' ? { translateY: d } : { translateX: d };
    }
    default:
      return {};
  }
}

/**
 * A coluna que sobe e desce dentro de um desenho: mercúrio, líquido, nível.
 *
 * É o sexto movimento do vocabulário, e o único que não cabe num `<G>`: ele não
 * desloca o desenho, ele **muda o tamanho de uma parte dele**. O picolé da capa
 * já fazia isto — animando `y` e `height` de um `<Rect>` — e o caminho está
 * provado nas três plataformas. Aqui ele vira peça, para o termômetro da câmara
 * fria e para qualquer outro recipiente da família usarem o mesmo mecanismo em
 * vez de cada um reinventar o seu.
 *
 * A base fica presa embaixo e só o topo anda: líquido não flutua no meio do tubo.
 */
export function Coluna({
  x,
  largura,
  base,
  vaoDe,
  vaoAte,
  cor,
  cicloMs,
  opacidade = 0.22,
}: {
  /** Canto esquerdo, na prancheta do desenho. */
  x: number;
  largura: number;
  /** O fundo, que não se mexe. */
  base: number;
  /** A altura mínima e a máxima que o topo alcança, medidas a partir da base. */
  vaoDe: number;
  vaoAte: number;
  cor: string;
  cicloMs: number;
  /**
   * Vinte e dois por cento, como o picolé da cena aprovada — e é o único lugar
   * em que massa entra no tema Papel.
   *
   * A regra do `massIf` (Glyph.tsx) tira o preenchimento quando o traço é fino,
   * porque "a mancha pastel sob a linha delicada vira borrão". Ela vale para
   * massa DECORATIVA, que só engorda o símbolo. Aqui a massa é o conteúdo
   * medido dentro de uma forma fechada: é o que o desenho está dizendo, e sem
   * ela não há o que dizer. O desenho aprovado faz exatamente isto, no Papel,
   * com esta opacidade.
   */
  opacidade?: number;
}) {
  // Meia altura no repouso: uma coluna parada no fundo lê como termômetro
  // quebrado, e quem desligou movimento merece a leitura, não o defeito.
  const ciclo = useCiclo(cicloMs, { feitio: 'vaivem', repouso: 0.5 });
  const props = useAnimatedProps(() => {
    'worklet';
    const altura = vaoDe + (vaoAte - vaoDe) * ciclo.value;
    return { y: base - altura, height: altura };
  });
  return (
    <BarraViva
      animatedProps={props}
      x={x}
      width={largura}
      rx={largura / 2}
      fill={cor}
      fillOpacity={opacidade}
      stroke="none"
    />
  );
}
