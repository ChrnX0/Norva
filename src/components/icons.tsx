import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Vivo } from './Vivo';

/**
 * The icons the design draws, and nothing else.
 *
 * Every shape here was traced from the artboards in the design canvas, not
 * picked from a library: the tab bar uses the same drawing at different sizes,
 * which is what makes the app feel like one hand drew it.
 *
 * **As linhas de relatório e a grade do "Mais" saíram daqui** — elas desenham com
 * `Glyph.tsx`, que é a família que a pele escolhe. Este arquivo guardava um
 * `IconStock`, um `IconCost` e um `IconLoss` que ninguém chamava mais: dois
 * desenhos da mesma coisa é a doença das duas grafias, em forma de traço. E a
 * frase acima afirmava o contrário até 6 de setembro — a varredura do P1 a
 * desmentiu, que é o motivo de o docblock ser conferível e não decorativo.
 *
 * Two rules the canvas states and this file obeys. The colour lives ONLY in the
 * stroke - no filled surfaces, ever - so an icon is a line drawing that carries
 * its area's colour and nothing more. And the stroke is 1.6px at 24px, scaled
 * with the size, so the weight reads the same at 26px in the bar and at 30px in
 * a list.
 */

type IconProps = {
  /** Side of the square box. The paths are drawn on a 24-unit grid. */
  size?: number;
  /** The area's colour. Never a fill - this is the stroke. */
  color: string;
};

const GRID = 24;

function frame(size: number) {
  return {
    width: size,
    height: size,
    viewBox: `0 0 ${GRID} ${GRID}`,
    fill: 'none' as const,
  };
}

/**
 * The stroke, in grid units.
 *
 * A constant, and that is the point: the viewBox does the scaling, so 1.6 units
 * on a 24-unit grid keeps the same apparent weight whether the icon is drawn at
 * 26px in the tab bar or at 30px in a list. Scaling it by hand would make the
 * line thicker as the icon grows, which is what makes an icon set look borrowed
 * from three places.
 */
const stroke = (color: string) => ({
  stroke: color,
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** Início — a house, because the briefing is where you come back to. */
export function IconHome({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      {/* Casa é alvenaria e não se mexe — este é AMBIENTE assumido, como o sol e
          o floco da cena aprovada, que giram sem nenhum fato por trás. Quarenta
          segundos e oito décimos de grau: no tamanho de uma aba isso é menos de
          um décimo de pixel de viagem. Está aqui porque o dono pediu a barra
          inteira viva, e o honesto é dizer qual movimento significa e qual não. */}
      <Vivo vida={{ como: 'balanca', cicloMs: 40000, graus: 0.8, centro: [12, 20] }}>
        <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" {...stroke(color)} />
      </Vivo>
    </Svg>
  );
}

/** Produção — a unidade saindo pela esteira: o que a fábrica pôs para fora. */
export function IconProduction({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      {/* A unidade anda na esteira, como no glifo grande do mesmo assunto: os
          dois desenhos são a mesma coisa em duas famílias, e a vida também. */}
      <Vivo vida={{ como: 'anda', cicloMs: 24000, passo: 1.2 }}>
        <Rect x="5" y="3.5" width="10" height="9" rx="2.2" {...stroke(color)} />
      </Vivo>
      <Path d="M4 16.5h13.5" {...stroke(color)} />
      <Path d="M17 13.8l2.7 2.7-2.7 2.7" {...stroke(color)} />
    </Svg>
  );
}

/** Transporte — a truck: what leaves the factory. */
export function IconTransport({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      {/* O caminhão anda, rodas junto. Vinte e seis segundos: mais devagar que o
          sol da cena, porque aqui ele fica na tela o dia inteiro. */}
      <Vivo vida={{ como: 'anda', cicloMs: 26000, passo: 1 }}>
        <Path d="M2 7.5h11v9H2z" {...stroke(color)} />
        <Path d="M13 11h4l3.5 3.5v2H13z" {...stroke(color)} />
        <Circle cx="6.5" cy="18.5" r="1.9" {...stroke(color)} />
        <Circle cx="16.5" cy="18.5" r="1.9" {...stroke(color)} />
      </Vivo>
    </Svg>
  );
}

/** Relatórios — bars on a baseline. */
export function IconReports({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M4 20h16" {...stroke(color)} />
      <Path d="M6.5 20v-6" {...stroke(color)} />
      {/* A barra do meio anda no eixo Y: um número que continua se mexendo é o
          que um relatório é. A linha de base e as vizinhas ficam — sem elas
          paradas, não haveria com o que comparar o movimento. */}
      <Vivo vida={{ como: 'anda', cicloMs: 22000, passo: 0.9, eixo: 'y' }}>
        <Path d="M12 20V5" {...stroke(color)} />
      </Vivo>
      <Path d="M17.5 20v-9" {...stroke(color)} />
    </Svg>
  );
}

/** Mais — a 2×2 grid: the drawers. */
export function IconMore({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      {/* As quatro gavetas respiram em torno do centro da grade — ambiente, como
          a casa. Trinta e seis segundos, o mais lento dos cinco: é a aba que se
          abre uma vez por mês, e o movimento acompanha a frequência. */}
      <Vivo vida={{ como: 'balanca', cicloMs: 36000, graus: 1, centro: [12, 12] }}>
        <Rect x="3.5" y="3.5" width="7" height="7" rx="2" {...stroke(color)} />
        <Rect x="13.5" y="3.5" width="7" height="7" rx="2" {...stroke(color)} />
        <Rect x="3.5" y="13.5" width="7" height="7" rx="2" {...stroke(color)} />
        <Rect x="13.5" y="13.5" width="7" height="7" rx="2" {...stroke(color)} />
      </Vivo>
    </Svg>
  );
}

export function IconChevron({ size = 24, color }: IconProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M9.5 5l7 7-7 7" {...stroke(color)} />
    </Svg>
  );
}
