import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Os desenhos gordos — os que aguentam ser o assunto do cartão.
 *
 * Os ícones de `icons.tsx` são traço de 1,6px numa grade de 24: eles foram
 * desenhados para a barra de abas e para linha de lista, e ali estão certos. No
 * momento em que viraram o crachá de um cartão, o dono disse o que eles fazem:
 * *"faltam ícones"* — porque um traço fino dentro de um círculo pastel some, e
 * o cartão volta a ser um retângulo com texto.
 *
 * Estes são a outra família: **duas camadas**. Uma massa preenchida em opacidade
 * baixa, que é o que dá corpo ao símbolo de longe, e o traço por cima, mais
 * grosso, que é o que dá o nome dele de perto. A cor entra nas duas, então um
 * único parâmetro continua carregando a área.
 *
 * Não substituem os antigos e não devem: a barra de abas com estes ícones vira
 * uma fileira de manchas.
 */

type GlyphProps = {
  size?: number;
  color: string;
  /**
   * A espessura do traço, que é da IDENTIDADE e não do ícone.
   *
   * O dono escolheu **fino** para o Papel, olhando as três espessuras lado a
   * lado: a ilustração do topo é desenhada com 1,3, e um ícone gordo ao lado
   * dela se separa da cena em vez de conversar com ela. O Orgânico fica com o
   * traço cheio, que é o que casa com a curva e o bloco de cor.
   *
   * Sem valor, cada glifo usa o gordo — que era o único que existia quando esta
   * família nasceu.
   */
  weight?: number;
};

function frame(size: number) {
  return { width: size, height: size, viewBox: '0 0 32 32' };
}

const line = (color: string, width = 2.2) => ({
  stroke: color,
  strokeWidth: width,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
});

const mass = (color: string, opacity = 0.24) => ({ fill: color, opacity });

/**
 * A massa some quando o traço é fino.
 *
 * As duas camadas — massa preenchida e traço por cima — existem para o glifo ter
 * corpo de longe. No traço fino do Papel elas brigam: a mancha pastel sob a
 * linha delicada vira borrão, e foi exatamente o que o dono recusou quando o
 * ícone virou selo cheio. Abaixo de 2, o glifo é só linha.
 */
const massIf = (weight: number, color: string, opacity = 0.24) =>
  weight >= 2 ? mass(color, opacity) : { fill: 'none' as const };

/** Produção: o picolé, que é o que sai do tacho. */
export function GlyphProduction({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Rect x="9" y="3" width="14" height="18" rx="7" {...massIf(weight, color)} />
      <Rect x="9" y="3" width="14" height="18" rx="7" {...line(color, weight)} />
      <Path d="M16 21v7" {...line(color, weight)} />
      <Path d="M13 8.5c1.6 1.4 4.8 1.4 6.4 0" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Almoxarifado: o saco de insumo, que enche e esvazia. */
export function GlyphStock({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M8 12h16l-1.6 15H9.6z" {...massIf(weight, color)} />
      <Path d="M8 12h16l-1.6 15H9.6z" {...line(color, weight)} />
      <Path d="M11.5 12V8a4.5 4.5 0 0 1 9 0v4" {...line(color, weight)} />
    </Svg>
  );
}

/** Transporte: a caixa que vai para a loja. */
export function GlyphBox({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M16 4l11 6v12l-11 6-11-6V10z" {...massIf(weight, color)} />
      <Path d="M16 4l11 6v12l-11 6-11-6V10z" {...line(color, weight)} />
      <Path d="M5 10l11 6 11-6M16 16v12" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Dinheiro: a etiqueta de preço, que é o que muda quando a nota chega. */
export function GlyphPrice({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M4 16.5V6a2 2 0 0 1 2-2h10.5L28 15.5 17 27z" {...massIf(weight, color)} />
      <Path d="M4 16.5V6a2 2 0 0 1 2-2h10.5L28 15.5 17 27z" {...line(color, weight)} />
      <Circle cx="10" cy="10" r="2.2" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Pedido: a prancheta do que os clientes combinaram. */
export function GlyphOrder({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Rect x="6" y="5" width="20" height="24" rx="4" {...massIf(weight, color)} />
      <Rect x="6" y="5" width="20" height="24" rx="4" {...line(color, weight)} />
      <Rect x="12" y="2" width="8" height="6" rx="2" {...line(color, weight)} />
      <Path d="M11 16h10M11 22h6" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Tacho rodando: a panela no fogo. */
export function GlyphKettle({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M5 13h22v7a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7z" {...massIf(weight, color)} />
      <Path d="M5 13h22v7a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7z" {...line(color, weight)} />
      <Path d="M12 8.5c0-2 2-2 2-4M18 8.5c0-2 2-2 2-4" {...line(color, weight - 0.4)} />
    </Svg>
  );
}
