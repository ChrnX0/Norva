import type { ComponentType, ReactNode } from 'react';
import type { BriefingWidget, CoverState } from '@/domain/briefing';
import type { Skin } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import type { BriefingView } from '../types';
import { PAPEL } from './papel';
import { ORGANICO } from './organico';

/**
 * O que a capa sabe, entregue a uma peça que a pele desenha à sua maneira.
 *
 * É o `BriefingView` mais as três coisas que a capa já derivou uma vez: em que
 * estado ela está, qual peça está aberta e como abrir outra. Derivar de novo
 * dentro de cada peça seria barato e errado — duas contas do mesmo estado é uma
 * chance de as duas discordarem na tela.
 */
export type PecaDaCapa = BriefingView & {
  estado: CoverState;
  aberta: BriefingWidget | null;
  abrir: (id: BriefingWidget) => void;
  /**
   * O casco desta peça, para a peça vestir a si mesma.
   *
   * **É por aqui que a peça da pele pode dizer que não tem nada a dizer.** A
   * capa vestia as peças por fora, e por fora ela só enxerga um elemento React —
   * um componente que devolve `null` na hora de desenhar continua sendo um
   * elemento, então o casco saía desenhado em volta do nada. Na foto do
   * Orgânico isso é um cartão branco vazio no meio da capa, e ele estava lá.
   *
   * Com o casco na mão, `return null` é de novo o que ele diz que é.
   */
  Casca: ComponentType<{ children: ReactNode }>;
};

/**
 * A roupa de uma pele: o casco da página e o casco de cada peça.
 *
 * **Existe porque "aplicar um tema novo" não pode ser um `if` a mais.** O
 * Orgânico era o Papel com a cena trocada — duas linhas de `skin === 'papel' ?`
 * no meio de mil, e o resultado foi o dono olhar a foto e dizer que o tema que
 * ele aprovou *"NEM ORGÂNICO ERA"*. A diferença entre as duas caras aprovadas
 * não é de cor: o Papel é uma página impressa (linha de olho, régua, manchete em
 * serifa), o Orgânico é uma paisagem que sangra com cartões flutuando em cima.
 * Isso não cabe num ternário, e cada ternário novo é uma tela a mais que a
 * próxima pele vai ter que caçar.
 *
 * O contrato é curto de propósito. Uma pele nova precisa de duas coisas — como
 * a página se monta e como uma peça se veste — e ganha as catorze peças de
 * graça, funcionando, sem escrever nenhuma. O que ela quiser desenhar à sua
 * maneira entra em `pecas`, uma por uma, sem tocar em nenhuma outra.
 *
 * O `registro.test.ts` recusa pele sem roupa: acrescentar `Skin` sem entrada
 * aqui quebra o teste em vez de abrir o aplicativo sem capa.
 */
export type Vestimenta = {
  /**
   * O casco da página inteira: a barra de rolagem, a margem e a área segura.
   *
   * Recebe o herói já montado porque só o casco sabe onde ele mora — no Papel é
   * a primeira coisa do miolo, com a margem de todo mundo; no Orgânico sangra de
   * borda a borda, e a linha de olho vai por cima dele.
   *
   * A marca e o dia chegam SEPARADOS, e não numa frase pronta. O Papel os junta
   * com um ponto no meio de uma linha de versalete; o Orgânico empilha os dois
   * dentro da paisagem, em tamanhos diferentes. Uma frase pronta obrigaria a
   * segunda pele a desmontar a primeira com um `split`.
   */
  Casco: ComponentType<{
    /** O nome do produto. */
    marca: string;
    /** O dia por extenso, já no idioma da pessoa. */
    data: string;
    heroi: ReactNode;
    children: ReactNode;
  }>;
  /**
   * Como uma peça se veste nesta pele.
   *
   * Recebe o `id` porque uma pele pode querer tratar um assunto diferente dos
   * outros — não porque ela precise saber a ORDEM. Quem encosta na paisagem é o
   * miolo inteiro, subido pelo casco: amarrar a sobreposição à "primeira peça"
   * quebrava no dia em que a primeira peça não tivesse o que dizer.
   */
  Bloco: ComponentType<{ id: BriefingWidget; children: ReactNode }>;
  /**
   * A peça que SANGRA no topo, fora do miolo, e vira o herói da página.
   *
   * Nula quando a pele não tem herói — aí a página começa pela linha de olho,
   * que é o Papel. Se a pessoa esconder essa peça nos ajustes, não há herói e a
   * página volta a começar pela linha de olho sozinha: esconder uma peça não
   * pode apagar o topo da tela.
   */
  sangra?: BriefingWidget;
  /**
   * As peças que esta pele desenha à sua maneira. O que não estiver aqui vem do
   * padrão, inteiro e funcionando.
   */
  pecas?: Partial<Record<BriefingWidget, ComponentType<PecaDaCapa>>>;
};

/**
 * A roupa de cada pele. Uma entrada por `Skin`, e o tipo obriga.
 *
 * `Record<Skin, …>` não é enfeite: é o que faz uma pele nova sem roupa quebrar
 * a compilação em vez de abrir uma tela em branco no celular de alguém.
 */
export const VESTIMENTAS: Record<Skin, Vestimenta> = {
  papel: PAPEL,
  organico: ORGANICO,
};

export function useVestimenta(): Vestimenta {
  const { skin } = useTheme();
  // O padrão existe para a pele que ainda não tem roupa nesta versão do
  // aplicativo — gaveta gravada com uma pele que uma atualização removeu. A
  // capa aparece vestida de Papel em vez de não aparecer.
  return VESTIMENTAS[skin] ?? PAPEL;
}
