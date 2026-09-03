/**
 * A linha de uma série, como caminho SVG — geometria pura, sem tela.
 *
 * Existe separada do componente pelo mesmo motivo que `qrPath`: desenho se
 * confere com aritmética, animação não. Um caminho que sai da caixa, uma curva
 * que estoura para cima num pico, uma série de um ponto só que virava `NaN` no
 * `d` e apagava o cartão inteiro — tudo isso é teste de unidade, e nenhum deles
 * apareceria numa suíte que só checa se o componente renderiza.
 *
 * A curva é Catmull-Rom convertida para Bézier cúbica, que é a curva que passa
 * POR todos os pontos. Uma Bézier de controle solto passa perto, e "perto" numa
 * linha de produção é um número que a tela mostra diferente do que o banco
 * guarda — o mesmo defeito de arredondar dinheiro cedo, agora em pixel.
 */

export type Point = { x: number; y: number };

/**
 * Os pontos de uma série dentro de uma caixa, o mais antigo à esquerda.
 *
 * A escala vertical é a da PRÓPRIA série, não uma meta: fábrica nenhuma tem meta
 * cadastrada aqui, e inventar uma régua para o desenho ficar bonito é número que
 * ninguém pode conferir.
 *
 * Série constante desenha no meio, não no chão nem no teto: uma fábrica que faz
 * 400 todo dia tem uma linha reta no meio da caixa, que é a leitura certa —
 * grudada embaixo, ela pareceria uma semana de fracasso.
 */
export function sparkPoints(
  values: readonly number[],
  width: number,
  height: number,
  padding = 2,
): Point[] {
  if (values.length === 0) return [];

  const top = padding;
  const bottom = Math.max(padding, height - padding);
  const usable = Math.max(0, bottom - top);

  if (values.length === 1) {
    return [{ x: width / 2, y: top + usable / 2 }];
  }

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;

  return values.map((value, i) => {
    const share = span === 0 ? 0.5 : (value - low) / span;
    return {
      x: (i / (values.length - 1)) * width,
      // Y cresce para baixo em SVG, então o maior valor fica no topo.
      y: bottom - share * usable,
    };
  });
}

/**
 * O caminho suave que passa por todos os pontos.
 *
 * A tensão de 1/6 é o Catmull-Rom uniforme; mais que isso e a curva passa a
 * inventar picos entre dois dias — a linha ficaria mais bonita e mentiria sobre
 * um dia que não existiu.
 */
export function sparkPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${round(points[0].x)} ${round(points[0].y)}`;

  let d = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(p2.x)} ${round(p2.y)}`;
  }
  return d;
}

/** O mesmo caminho fechado até o chão, para o preenchimento embaixo da linha. */
export function sparkArea(points: readonly Point[], height: number): string {
  if (points.length < 2) return '';
  const line = sparkPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${round(last.x)} ${round(height)} L ${round(first.x)} ${round(height)} Z`;
}

/** Duas casas: mais que isso engorda o caminho sem mudar um pixel na tela. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
