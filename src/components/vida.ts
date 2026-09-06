import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
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
export function useCiclo(
  duracaoMs: number,
  {
    feitio = 'volta',
    atrasoMs = 0,
    repouso = 0,
  }: { feitio?: Feitio; atrasoMs?: number; repouso?: number } = {},
): SharedValue<number> {
  const ciclo = useSharedValue(0);
  const reduzido = useReduzirMovimento();

  useEffect(() => {
    // Ainda não sei se posso mexer: fico no repouso, que é o desenho inteiro e no
    // lugar. Um desenho que aparece pela metade e depois se completa pisca.
    if (reduzido === null || reduzido) {
      ciclo.value = repouso;
      return;
    }

    const volta =
      feitio === 'volta'
        ? withTiming(1, { duration: duracaoMs, easing: Easing.linear })
        : withSequence(
            withTiming(1, { duration: duracaoMs / 2, easing: Easing.inOut(Easing.quad) }),
            withTiming(0, { duration: duracaoMs / 2, easing: Easing.inOut(Easing.quad) }),
          );

    ciclo.value = withDelay(atrasoMs, withRepeat(volta, -1, false));

    return () => {
      // Laço infinito que ninguém para continua na thread de UI depois de a tela
      // sair. Com trinta telas de navegação isso vira calor no bolso de quem
      // trabalha, sem nada na tela para justificar.
      cancelAnimation(ciclo);
    };
  }, [ciclo, duracaoMs, feitio, atrasoMs, repouso, reduzido]);

  return ciclo;
}
