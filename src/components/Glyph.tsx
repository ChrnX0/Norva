import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Coluna, Vivo } from './Vivo';

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
 *
 * **A família cresceu de seis para vinte em 3 de setembro**, e o motivo é uma
 * frase do dono: as vinte telas que não são a capa não tinham desenho nenhum,
 * *"sem ícone, sem faixa de cor, sem cena"*, e navegar da capa para elas parecia
 * dois aplicativos. Desenho que falta é tela que vira parágrafo cinza — então
 * cada assunto do aplicativo passou a ter o seu, e quem escrever uma tela nova
 * procura aqui antes de inventar.
 *
 * Cada um foi olhado impresso lado a lado, nos dois pesos e em 26 e 64 pixels,
 * antes de entrar. Dois voltaram para a prancheta na primeira olhada: a
 * embalagem tinha virado ampulheta e o palito perdia a haste do meio.
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

/**
 * Produção: as unidades prontas, empilhadas — o que saiu, seja o que for.
 *
 * **Era um picolé**, e isso contradizia a primeira linha do projeto: *"nasce numa
 * fábrica de picolés, mas será publicado nas lojas — nada de regra chumbada de
 * sorvete"*. O sorvete não estava numa regra, estava no lugar mais visível que
 * existe: a aba de baixo e o crachá do primeiro cartão da capa. Quem instala para
 * fabricar queijo, tinta ou cosmético abre o aplicativo e vê o produto de outra
 * pessoa.
 *
 * A unidade saindo pela esteira serve qualquer fábrica, e o desenho passou por três
 * versões antes desta — cada uma reprovada por uma FOTO da barra de abas, que é o
 * único lugar onde um ícone é julgado ao lado dos irmãos dele:
 *
 *   - **três unidades empilhadas** viraram irmãs do ícone de "Mais" (dois amontoados
 *     de quadradinhos na mesma barra), o que é pior que o picolé: confunde navegação
 *     em vez de só falar do produto errado;
 *   - **unidade sobre esteira com três roletes** virou irmã do caminhão — caixa com
 *     rodas, do lado de uma caixa com rodas.
 *
 * A seta resolve as duas: caminhão tem roda, isto tem SAÍDA.
 *
 * Esta silhueta não colide com nada do vocabulário: o saco e o balde são insumo, a
 * caixa é transporte, o tacho é o processo aberto, a etiqueta é o lote, a grade é
 * "Mais". Esta é a SAÍDA — a única coisa que toda fábrica deste produto tem em
 * comum, seja picolé, queijo, tinta ou cosmético.
 */
export function GlyphProduction({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Rect x="7" y="5" width="13" height="12" rx="3" {...massIf(weight, color)} />
      <Rect x="7" y="5" width="13" height="12" rx="3" {...line(color, weight)} />
      <Path d="M5.5 22h17" {...line(color, weight)} />
      <Path d="M22 18.5l3.5 3.5-3.5 3.5" {...line(color, weight)} />
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

/** Loja: a fachada com o toldo de bico — ponto de venda é o que se reconhece da calçada, pela frente. */
export function GlyphStore({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path
        d="M8 6h16l4 6a4 3 0 0 1-8 0a4 3 0 0 1-8 0a4 3 0 0 1-8 0z"
        {...massIf(weight, color)}
      />
      <Path
        d="M8 6h16l4 6a4 3 0 0 1-8 0a4 3 0 0 1-8 0a4 3 0 0 1-8 0z"
        {...line(color, weight)}
      />
      <Rect x="6" y="15" width="20" height="13" rx="1" {...massIf(weight, color)} />
      <Rect x="6" y="15" width="20" height="13" rx="1" {...line(color, weight)} />
      <Path d="M13 28v-6a3 3 0 0 1 6 0v6" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Fábrica: o galpão de telhado dente-de-serra com a chaminé na ponta — o prédio que produz, não o que vende. */
export function GlyphFactory({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M4 28V5h4v10l6 6v-6l6 6v-6l6 6v7z" {...massIf(weight, color)} />
      <Path d="M4 28V5h4v10l6 6v-6l6 6v-6l6 6v7z" {...line(color, weight)} />
    </Svg>
  );
}

/** Veículo: o caminhão de perfil, baú cheio e duas rodas — o que tira a carga daqui e põe lá. */
export function GlyphVehicle({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M3 21V7h15v5h6l3 4v5z" {...massIf(weight, color)} />
      <Path d="M3 21V7h15v5h6l3 4v5z" {...line(color, weight)} />
      <Circle cx="8.5" cy="23" r="2.6" {...line(color, weight)} />
      <Circle cx="22" cy="23" r="2.6" {...line(color, weight)} />
    </Svg>
  );
}

/** Cliente: a pessoa com a sacola ao lado, sem rosto porque é qualquer um — quem leva o produto embora. */
export function GlyphCustomer({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Circle cx="10" cy="8" r="4" {...massIf(weight, color)} />
      <Circle cx="10" cy="8" r="4" {...line(color, weight)} />
      <Path d="M3.5 27v-6a6.5 6.5 0 0 1 13 0v6z" {...massIf(weight, color)} />
      <Path d="M3.5 27v-6a6.5 6.5 0 0 1 13 0v6z" {...line(color, weight)} />
      <Rect x="20" y="18" width="8" height="9" rx="1" {...massIf(weight, color)} />
      <Rect x="20" y="18" width="8" height="9" rx="1" {...line(color, weight)} />
      <Path d="M21.5 18v-1a2.5 2.5 0 0 1 5 0v1" {...line(color, weight)} />
    </Svg>
  );
}

/** Um saco: pano recolhido acima do barbante, pescoço estrangulado e barriga cheia apoiada no chão — a unidade que chega no caminhão e se pesa, não o almoxarifado inteiro. */
export function GlyphSack({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path
        d="M13 12.5 C8.6 15.2 6.5 19.6 6.5 23.5 C6.5 26.3 8.2 28 11 28 H21 C23.8 28 25.5 26.3 25.5 23.5 C25.5 19.6 23.4 15.2 19 12.5 Z"
        {...massIf(weight, color)}
      />
      <Path
        d="M13 12.5 C8.6 15.2 6.5 19.6 6.5 23.5 C6.5 26.3 8.2 28 11 28 H21 C23.8 28 25.5 26.3 25.5 23.5 C25.5 19.6 23.4 15.2 19 12.5 Z"
        {...line(color, weight)}
      />
      <Path d="M13 12.5 L10.6 6.8 C12.4 7.8 14.2 8 16 7.4 C17.8 8 19.6 7.8 21.4 6.8 L19 12.5 Z" {...line(color, weight)} />
      <Path d="M10.4 12.5 H21.6" {...line(color, weight)} />
    </Svg>
  );
}

/** Um balde: aba de boca mais larga que o corpo, parede que afina até o fundo e a alça em arco — o recipiente que se carrega cheio, se despeja e volta vazio. */
export function GlyphBucket({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path
        d="M7.8 14.2 H24.2 L22.4 26.4 C22.2 27.5 21.3 28 20.2 28 H11.8 C10.7 28 9.8 27.5 9.6 26.4 Z"
        {...massIf(weight, color)}
      />
      <Path
        d="M7.8 14.2 H24.2 L22.4 26.4 C22.2 27.5 21.3 28 20.2 28 H11.8 C10.7 28 9.8 27.5 9.6 26.4 Z"
        {...line(color, weight)}
      />
      <Rect x="5.6" y="9.8" width="20.8" height="4.4" rx="2.2" {...line(color, weight)} />
      <Path d="M7.8 9.8 C8.2 5.4 11.4 3.6 16 3.6 C20.6 3.6 23.8 5.4 24.2 9.8" {...line(color, weight)} />
    </Svg>
  );
}

/** Uma embalagem: o saquinho de filme com as duas soldas serrilhadas — corpo liso no meio, e nada a ver com o saco de insumo, que é pano amarrado. */
export function GlyphPackaging({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const corpo = 'M8.5 8.5 H23.5 V23.5 H8.5 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={corpo} {...massIf(weight, color)} />
      <Path d={corpo} {...line(color, weight)} />
      {/* As duas soldas, serrilhadas: é o que diz "filme selado" e não "caixa". */}
      <Path d="M8.5 8.5 L11 5 L13.5 8.5 L16 5 L18.5 8.5 L21 5 L23.5 8.5" {...line(color, weight)} />
      <Path d="M8.5 23.5 L11 27 L13.5 23.5 L16 27 L18.5 23.5 L21 27 L23.5 23.5" {...line(color, weight)} />
      {/* O vinco do meio, que dá o volume sem precisar de sombra. */}
      <Path d="M16 10.5 v11" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Palitos: três hastes de ponta arredondada, abertas em leque — material que entra na conta por milheiro e não se come. */
export function GlyphStick({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const esquerda = 'M5.2 7.6 a2.3 2.3 0 0 1 4.4 -1.2 L14 24 a2.3 2.3 0 0 1 -4.4 1.2 Z';
  const meio = 'M13.8 6.3 a2.3 2.3 0 0 1 4.4 0 L18.2 25.1 a2.3 2.3 0 0 1 -4.4 0 Z';
  const direita = 'M22.4 6.4 a2.3 2.3 0 0 1 4.4 1.2 L22.4 25.2 a2.3 2.3 0 0 1 -4.4 -1.2 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={esquerda} {...massIf(weight, color)} />
      <Path d={meio} {...massIf(weight, color)} />
      <Path d={direita} {...massIf(weight, color)} />
      <Path d={esquerda} {...line(color, weight)} />
      <Path d={meio} {...line(color, weight)} />
      <Path d={direita} {...line(color, weight)} />
    </Svg>
  );
}

/** Ficha técnica: a folha com a lista do que entra — o papel que diz como se faz, não o que se vendeu. */
export function GlyphRecipe({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const folha = 'M7 3.5 h13.5 L25 8 v20.5 H7 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={folha} {...massIf(weight, color)} />
      <Path d={folha} {...line(color, weight)} />
      <Path d="M20.5 3.5 V8 H25" {...line(color, weight - 0.4)} />
      <Path d="M11 14h10M11 19h10M11 24h6" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Nota de compra: o recibo de borda picotada embaixo — o papel que chega com a mercadoria e com o preço. */
export function GlyphPurchase({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const nota =
    'M6.5 3.5 h19 V26 l-3.2 -2.2 -3.2 2.2 -3.1 -2.2 -3.2 2.2 -3.1 -2.2 L6.5 26 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={nota} {...massIf(weight, color)} />
      <Path d={nota} {...line(color, weight)} />
      <Path d="M10.5 10h11M10.5 15h7" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Etiqueta do lote: a tag furada com o quadrado de leitura — o que se cola na caixa e se lê com a câmera. */
export function GlyphLabel({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const tag = 'M4.5 13.5 L14.5 3.5 H27 v12.5 L17 26 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={tag} {...massIf(weight, color)} />
      <Path d={tag} {...line(color, weight)} />
      <Circle cx="22.4" cy="8.6" r="1.9" {...line(color, weight - 0.4)} />
      <Path d="M10.5 14.5 l4.5 4.5" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Dia combinado: a folhinha com o dia marcado — a entrega que a loja e a fábrica acertaram. */
export function GlyphCalendar({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const folhinha = 'M4.5 7.5 h23 v20 h-23 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={folhinha} {...massIf(weight, color)} />
      <Path d={folhinha} {...line(color, weight)} />
      <Path d="M4.5 13.5 h23" {...line(color, weight)} />
      <Path d="M10 3.5 v6M22 3.5 v6" {...line(color, weight)} />
      <Circle cx="16" cy="20.5" r="2.6" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Perda: a gota que escorreu — o que derreteu, vazou ou venceu, e não é culpa de ninguém na tela. */
export function GlyphLoss({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const gota = 'M16 4.5 C21.5 12 24.5 16 24.5 20 A8.5 8.5 0 0 1 7.5 20 C7.5 16 10.5 12 16 4.5 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={gota} {...massIf(weight, color)} />
      <Path d={gota} {...line(color, weight)} />
      <Path d="M12.6 19.5 a3.4 3.4 0 0 0 3.4 3.4" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Contagem: a lista com os tiques — alguém andou até a prateleira e conferiu o que estava lá. */
export function GlyphCount({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const prancheta = 'M6 5.5 h20 v23 H6 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={prancheta} {...massIf(weight, color)} />
      <Path d={prancheta} {...line(color, weight)} />
      <Path d="M9.5 11.5 l2.2 2.2 4-4.4" {...line(color, weight - 0.4)} />
      <Path d="M9.5 19 l2.2 2.2 4-4.4" {...line(color, weight - 0.4)} />
      <Path d="M18.5 12h4M18.5 19.5h4" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Relatório: as três barras que comparam — o desenho de "isto aqui é normal?". */
export function GlyphChart({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M5.5 27.5 h21" {...line(color, weight)} />
      <Path d="M8.5 22 h4 v5.5 h-4 Z" {...massIf(weight, color)} />
      <Path d="M8.5 22 h4 v5.5 h-4 Z" {...line(color, weight)} />
      <Path d="M14.5 13 h4 v14.5 h-4 Z" {...massIf(weight, color)} />
      <Path d="M14.5 13 h4 v14.5 h-4 Z" {...line(color, weight)} />
      <Path d="M20.5 18 h4 v9.5 h-4 Z" {...massIf(weight, color)} />
      <Path d="M20.5 18 h4 v9.5 h-4 Z" {...line(color, weight)} />
    </Svg>
  );
}

/**
 * Temperatura: o termômetro de bulbo — a grandeza que a câmara fria responde,
 * com sensor ou sem.
 *
 * **O que se mexe é a coluna, e só ela.** O tubo fica parado, o bulbo fica
 * parado, e o mercúrio sobe e desce devagar entre dois terços e quase o topo —
 * que é o que um termômetro faz numa câmara fria: a leitura anda dentro de uma
 * faixa o dia inteiro. Doze segundos de ciclo. Girar ou pulsar o desenho
 * inteiro seria movimento colado por cima; isto é o desenho fazendo o que ele
 * desenha.
 */
export function GlyphThermometer({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const haste = 'M13 18.5 V7 a3 3 0 0 1 6 0 v11.5 a5.5 5.5 0 1 1 -6 0 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={haste} {...massIf(weight, color)} />
      <Coluna x={14.4} largura={3.2} base={24} vaoDe={9} vaoAte={15.5} cor={color} cicloMs={12000} />
      <Path d={haste} {...line(color, weight)} />
      <Circle cx="16" cy="23" r="2.2" {...line(color, weight - 0.4)} />
      <Path d="M21.5 10h3M21.5 14h3" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/**
 * Ajustes: os controles deslizantes — o que se regula, e não a engrenagem, que
 * é vocabulário de programador.
 *
 * **Os botões deslizam nos trilhos**, cada um no seu tempo e em sentidos
 * opostos: é a única coisa que um controle deslizante faz. Nove e onze segundos
 * — números diferentes de propósito, para os dois nunca ficarem em sincronia,
 * que é o que faria os dois lerem como uma coisa só piscando.
 */
export function GlyphSettings({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M5 10h22M5 22h22" {...line(color, weight)} />
      <Vivo vida={{ como: 'anda', cicloMs: 9000, passo: 3 }}>
        <Circle cx="12" cy="10" r="3.4" {...massIf(weight, color)} />
        <Circle cx="12" cy="10" r="3.4" {...line(color, weight)} />
      </Vivo>
      <Vivo vida={{ como: 'anda', cicloMs: 11000, passo: -3 }}>
        <Circle cx="21" cy="22" r="3.4" {...massIf(weight, color)} />
        <Circle cx="21" cy="22" r="3.4" {...line(color, weight)} />
      </Vivo>
    </Svg>
  );
}

/** Assistente: o balão de fala — a pergunta escrita, respondida com o número que o motor calculou. */
export function GlyphAssistant({ size = 26, color, weight = 2.2 }: GlyphProps) {
  const balao = 'M5 8.5 a3 3 0 0 1 3 -3 h16 a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 H14 l-6 5.5 V21.5 h-0 a3 3 0 0 1 -3 -3 Z';
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d={balao} {...massIf(weight, color)} />
      <Path d={balao} {...line(color, weight)} />
      <Path d="M10.5 11h11M10.5 16h7" {...line(color, weight - 0.4)} />
    </Svg>
  );
}

/** Catálogo: a grade de produtos — o que a fábrica sabe fazer, um quadrado cada. */
export function GlyphCatalog({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Path d="M5 5 h9.5 v9.5 H5 Z" {...massIf(weight, color)} />
      <Path d="M5 5 h9.5 v9.5 H5 Z" {...line(color, weight)} />
      <Path d="M17.5 5 h9.5 v9.5 h-9.5 Z" {...line(color, weight)} />
      <Path d="M5 17.5 h9.5 V27 H5 Z" {...line(color, weight)} />
      <Path d="M17.5 17.5 h9.5 V27 h-9.5 Z" {...massIf(weight, color)} />
      <Path d="M17.5 17.5 h9.5 V27 h-9.5 Z" {...line(color, weight)} />
    </Svg>
  );
}

/** Acrescentar: o mais no círculo, no peso da família — o gesto de pôr uma coisa nova na lista. */
export function GlyphPlus({ size = 26, color, weight = 2.2 }: GlyphProps) {
  return (
    <Svg {...frame(size)} accessibilityRole="image">
      <Circle cx="16" cy="16" r="11.5" {...massIf(weight, color)} />
      <Circle cx="16" cy="16" r="11.5" {...line(color, weight)} />
      <Path d="M16 10.5 v11M10.5 16 h11" {...line(color, weight)} />
    </Svg>
  );
}
