import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  cancelAnimation,
  makeMutable,
  useDerivedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * O relógio compartilhado dos desenhos vivos.
 *
 * O dono olhou os ícones do aplicativo e pediu movimento em todos, apontando a
 * cena da capa como o exemplo: *"sutil, mas vivo"*. O que existia era um respiro
 * genérico — a mesma oscilação de escala para os vinte e seis desenhos —, e é
 * exatamente isso que ele recusou: um termômetro que respira igual a um caminhão
 * não está vivo, está tremendo.
 *
 * A cena aprovada faz o contrário e é ela que manda: **cada coisa se mexe como
 * ela mesma**. O sol gira porque é sol, a fumaça sobe porque é fumaça, o floco
 * gira mais devagar porque é floco. Este módulo é o mecanismo dessa regra: um
 * ciclo, e cada desenho escolhe o que fazer com ele.
 *
 * Três coisas que estão aqui e não em cada glifo, de propósito:
 *
 * 1. **A leitura de "reduzir movimento" acontece UMA vez.** Vinte e seis glifos
 *    perguntando ao sistema, cada um na sua montagem, é vinte e seis idas ao
 *    módulo nativo para responder a mesma coisa — e numa tela com oito ícones o
 *    atraso aparece como uma cascata de desenhos aparecendo fora de hora.
 * 2. **O ciclo é longo, mas a faixa mudou em 6 de setembro.** O que estava
 *    escrito aqui — *"de três a quarenta e oito segundos: percebe-se se você
 *    olhar, não se percebe se você estiver trabalhando"* — caiu junto com a
 *    doutrina do `tokens.ts`, e este arquivo não tinha sabido. A faixa de
 *    trabalho da casa agora é **4 a 12 segundos**, que é onde as quinze cenas de
 *    cabeçalho foram construídas, com piso de 2,6 s porque abaixo disso deixa de
 *    ser ambiente e passa a chamar atenção.
 *
 *    E a frase que faltava, porque é ela que impede o defeito voltar: **ciclo
 *    acima de vinte segundos num desenho de 24 dp é sub-pixel, e sub-pixel não é
 *    sutileza, é ausência.** Um glifo de 26 px oscilando 1,5° em 40 s desloca
 *    menos de meio pixel — a bateria é gasta e o olho não recebe nada.
 *
 *    A frase antiga tinha origem: é cópia literal do comentário do SOL no desenho
 *    aprovado (`docs/design/aprovados/papel.html`), onde ela descreve uma volta
 *    inteira de 360° em trinta segundos. Foi generalizada de um giro completo
 *    para uma oscilação de um grau e meio, e nessa viagem virou o contrário do
 *    que dizia. No próprio arquivo aprovado, tudo que NÃO é rotação roda entre
 *    1,4 e 6 segundos.
 * 3. **Parar é parte do contrato.** `cancelAnimation` na saída, senão um laço
 *    infinito continua rodando na thread de UI depois de a tela sumir — trinta
 *    telas de navegação e o celular da fábrica fica quente sem nada na tela.
 */

/**
 * O aparelho pediu para reduzir movimento?
 *
 * Cacheado no módulo: a resposta não muda no meio da sessão, e a primeira
 * leitura é assíncrona. Enquanto ela não volta, `null` — e quem usa trata isso
 * como "ainda não sei" em vez de "pode mexer", para o desenho não dar um pulo
 * quando a resposta chegar.
 */
let reduzidoCache: boolean | null = null;
let perguntando: Promise<boolean> | null = null;

function perguntar(): Promise<boolean> {
  if (reduzidoCache !== null) return Promise.resolve(reduzidoCache);
  perguntando ??= AccessibilityInfo.isReduceMotionEnabled()
    .then((r) => {
      reduzidoCache = r;
      return r;
    })
    .catch(() => {
      // Plataforma que não responde: o movimento fica ligado, que é o padrão do
      // produto. Falhar para o lado do silêncio esconderia a identidade inteira
      // por causa de um módulo nativo ausente.
      reduzidoCache = false;
      return false;
    });
  return perguntando;
}

export function useReduzirMovimento(): boolean | null {
  const [reduzido, setReduzido] = useState<boolean | null>(reduzidoCache);
  useEffect(() => {
    if (reduzidoCache !== null) return;
    let vivo = true;
    void perguntar().then((r) => {
      if (vivo) setReduzido(r);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return reduzido;
}

/** Como o ciclo anda dentro de uma volta. */
export type Feitio =
  /** Zero a um, e recomeça do zero. Para o que dá a volta: girar, subir e sumir. */
  | 'volta'
  /** Zero a um e de volta a zero, suave nas pontas. Para o que vai e vem. */
  | 'vaivem';

/**
 * Um ciclo de zero a um, no compasso da casa.
 *
 * @param duracaoMs uma volta inteira. Três segundos é o piso; abaixo disso o
 *   movimento deixa de ser ambiente e passa a chamar atenção.
 * @param feitio 'volta' recomeça do zero (giro, fumaça); 'vaivem' volta pelo
 *   mesmo caminho (respiração, balanço).
 * @param atrasoMs para escalonar irmãos — as três baforadas da chaminé são o
 *   mesmo ciclo defasado de dois segundos.
 * @param repouso onde o ciclo ESTACIONA quando o aparelho pede para reduzir
 *   movimento. Zero não serve para todo mundo: a fumaça em zero está invisível e
 *   a coluna em zero está no fundo. Quem desliga movimento tem de ver o desenho
 *   INTEIRO, no lugar dele — foi por não ter este parâmetro que a primeira versão
 *   deixava a etiqueta permanentemente torta.
 */
/**
 * O relógio de verdade — UM, para o aplicativo inteiro.
 *
 * Este módulo se chama "o relógio compartilhado dos desenhos vivos" desde que
 * nasceu, e até 9 de setembro ele não compartilhava relógio nenhum: cada
 * `useCiclo` criava o próprio valor e a própria animação infinita. O que ele
 * compartilhava era a RESPOSTA de "reduzir movimento" — que é útil e é outra
 * coisa. O nome prometia o compasso; o código entregava a permissão.
 *
 * O preço apareceu ao usar o aplicativo: com a tela parada, 190% de CPU, 1,7
 * quadro por segundo desenhado, e a thread de UI tão ocupada que a animação de
 * ENTRADA das telas não chegava — páginas apareciam pela metade, listas não
 * rolavam, e o `uiautomator` recusava ler a tela com `could not get idle state`.
 * Trinta e oito animações infinitas, cada uma pedindo quadro por conta própria.
 *
 * Agora é uma só: um tempo linear que sobe por onze dias sem voltar, e cada
 * desenho calcula a fase dele em cima dela. Sem volta não há salto — um relógio
 * que reinicia faria todos os desenhos pularem juntos na virada.
 */
const relogio = makeMutable(0);

/** Onze dias e meio de tempo linear. Ninguém deixa uma tela aberta tanto tempo. */
const HORIZONTE_MS = 1_000_000_000;

/** Quantos desenhos estão pedindo compasso agora. Zero para o relógio. */
let pedindo = 0;

function ligarRelogio(): void {
  if (pedindo > 0) return;
  relogio.value = 0;
  relogio.value = withTiming(HORIZONTE_MS, {
    duration: HORIZONTE_MS,
    easing: Easing.linear,
  });
}

function pararRelogio(): void {
  cancelAnimation(relogio);
}

/**
 * Esta tela está à vista?
 *
 * Numa navegação por abas as telas ficam MONTADAS depois de visitadas — então,
 * sem isto, a capa continuava animando enquanto a pessoa estava em Relatórios, e
 * toda tela já aberta continuava desenhando para sempre. O `cancelAnimation` da
 * saída existia e nunca era chamado, porque a peça não saía: ela só deixava de
 * ser olhada.
 */
/**
 * Esta tela está à vista AGORA — e não só "o aplicativo está aberto".
 *
 * Exportada em 10 de setembro. Quem a expôs foi uma âncora de rota que montava a capa
 * DEBAIXO de toda tela aberta por ligação profunda — **essa âncora não existe mais**
 * (`docs/roadmap.md`, item 33; hoje quem volta é `src/nav.ts`), e a necessidade não foi
 * embora com ela: a navegação por ABAS deixa tela montada e sem foco o tempo todo, que
 * é o parágrafo logo acima. A âncora só tornou o caso constante e visível.
 *
 * O relógio da casa já parava aqui; quem não parava era a única volta própria
 * permitida, o halo do `PulseDot` — e ele ficou pulsando numa tela que ninguém vê.
 */
export function useNaTela(): boolean {
  /**
   * **Começava supondo `true`, e a suposição virou falsa em 10 de setembro.**
   *
   * A versão anterior era `useState(true)` mais um `useFocusEffect` que só punha
   * `false` na LIMPEZA. Numa tela que foca e desfoca, isso funciona. Numa tela
   * MONTADA E NUNCA FOCADA, a limpeza nunca roda e o valor fica `true` para
   * sempre. O caso extremo veio da âncora de rota que existiu por algumas horas —
   * `(tabs)` montada debaixo de toda tela aberta por ligação profunda, sem nunca
   * receber foco — e a medida daquele dia foi de uma variável só: com a âncora, o
   * clique de uma checagem estourava 30 s esperando a página ficar estável, com a
   * máquina parada; sem a âncora, passava.
   *
   * **A âncora saiu** (item 33 do `docs/roadmap.md`) e esta linha continua sendo a
   * certa, porque a suposição era falsa antes dela e seguiria falsa depois: montada
   * e nunca focada é o estado de qualquer tela empilhada atrás de outra. O custo real
   * nunca foi o navegador — é CPU num aparelho que este projeto já mediu saturando a
   * thread de UI com o movimento ligado.
   *
   * `useIsFocused` responde o estado de AGORA e é reativo, então não há suposição
   * nenhuma para envelhecer.
   */
  return useIsFocused();
}

/** Entra e sai suave nas pontas — o `inOut(quad)` do vai-e-vem, como worklet. */
function suave(u: number): number {
  'worklet';
  return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
}

/**
 * Um ciclo de zero a um, no compasso da casa.
 *
 * @param duracaoMs uma volta inteira. Três segundos é o piso; abaixo disso o
 *   movimento deixa de ser ambiente e passa a chamar atenção.
 * @param feitio 'volta' recomeça do zero (giro, fumaça); 'vaivem' volta pelo
 *   mesmo caminho (respiração, balanço).
 * @param atrasoMs para escalonar irmãos — as três baforadas da chaminé são o
 *   mesmo ciclo defasado de dois segundos. Hoje isso é FASE, não espera: o
 *   desenho já nasce no ponto certo da volta em vez de ficar parado no zero
 *   durante o primeiro ciclo inteiro.
 * @param ligado o movimento tem MOTIVO agora? A fumaça da chaminé só sobe com o
 *   tacho ligado — e um gancho não pode entrar e sair conforme o dado, então
 *   quem decide isso é este interruptor, não um `if` antes da chamada. Desligado
 *   o desenho fica no `repouso` e não pede quadro nenhum.
 * @param repouso onde o ciclo ESTACIONA quando o movimento não corre — porque o
 *   aparelho pediu para reduzir, ou porque esta tela não está à vista. Zero não
 *   serve para todo mundo: a fumaça em zero está invisível e a coluna em zero
 *   está no fundo. Quem desliga movimento tem de ver o desenho INTEIRO, no lugar
 *   dele — foi por não ter este parâmetro que a primeira versão deixava a
 *   etiqueta permanentemente torta.
 */
export function useCiclo(
  duracaoMs: number,
  {
    feitio = 'volta',
    atrasoMs = 0,
    repouso = 0,
    ligado = true,
  }: { feitio?: Feitio; atrasoMs?: number; repouso?: number; ligado?: boolean } = {},
): SharedValue<number> {
  const reduzido = useReduzirMovimento();
  const naTela = useNaTela();
  // Ainda não sei se posso mexer: fico no repouso, que é o desenho inteiro e no
  // lugar. Um desenho que aparece pela metade e depois se completa pisca.
  const mexendo = reduzido === false && naTela && ligado;

  useEffect(() => {
    if (!mexendo) return;
    ligarRelogio();
    pedindo += 1;
    return () => {
      pedindo -= 1;
      if (pedindo === 0) pararRelogio();
    };
  }, [mexendo]);

  return useDerivedValue(() => {
    if (!mexendo) return repouso;
    const t = ((relogio.value + atrasoMs) % duracaoMs) / duracaoMs;
    return feitio === 'volta' ? t : t < 0.5 ? suave(t * 2) : 1 - suave(t * 2 - 1);
  }, [mexendo, duracaoMs, atrasoMs, repouso, feitio]);
}
