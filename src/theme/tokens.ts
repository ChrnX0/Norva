/**
 * Design tokens.
 *
 * Two color families that never mix, separated by saturation and role:
 *
 *   AMBIENT — desaturated, one per area of the app. Says WHERE you are.
 *             Appears in exactly four places: the 3px card rail, the header
 *             icon, the primary button, and a chart stroke. Never as a full
 *             surface: a fully colored card tires the eyes of someone staring
 *             at the screen for eight hours.
 *
 *   SIGNAL  — saturated, in small doses only. Says WHAT is happening.
 *             Never decorates. If green shows up in a chart because it looked
 *             nice, green stops meaning "checked" and the user stops trusting
 *             color at all.
 *
 * Color never travels alone: every state carries its word too, because some
 * people are colorblind and some screens are bad under warehouse lighting.
 */

export const ambient = [
  'sky',
  'apricot',
  'mint',
  'lilac',
  'rose',
  'sage',
  'sand',
  'mist',
] as const;

export type Ambient = (typeof ambient)[number];

/** Which area of the app each ambient hue belongs to. */
export const ambientArea: Record<Ambient, string> = {
  sky: 'home',
  apricot: 'production',
  mint: 'inventory',
  lilac: 'distribution',
  rose: 'storeMirror',
  sage: 'purchasing',
  sand: 'finance',
  mist: 'settings',
};

/**
 * As três camadas de tinta, e por que a mais fraca não é tão fraca quanto era.
 *
 * `inkFaint` pinta o rótulo que diz O QUE o número é — "por mil", "valor parado",
 * "conferido em 3/9" —, em 11 e 13 px, e a auditoria mediu **2,55:1** no tema que
 * sai da caixa. Isso é ilegível no corredor da câmara, com luva, tela suja e luz de
 * galpão, que é exatamente onde este aplicativo é usado. As seis paletas subiram
 * para 4,6:1 contra o fundo mais claro em que cada uma pinta, que é a régua da WCAG
 * para texto normal com uma casa de folga.
 *
 * A hierarquia continua: forte > média > fraca em toda paleta, e `src/theme/
 * contrast.test.ts` guarda as duas coisas — a régua e a hierarquia — lendo as cores
 * DESTE arquivo. Cor nova colada amanhã entra na medição sem ninguém acrescentar
 * nada.
 *
 * **E "maior que" não bastava.** Subir a tinta fraca até a régua da WCAG empurrou ela
 * para cima da MÉDIA nos dois temas claros: no Papel elas ficaram em 5,07 e 5,34
 * contra o papel — uma diferença de 5%, que existe na conta e não existe no olho.
 * Três camadas de tinta viraram duas, e a tela que depende delas para separar o
 * rótulo do corpo ficou plana. O dono viu antes de mim, olhando o aplicativo: *"cadê
 * o tema papel light"*.
 *
 * A guarda pedia ordem (`média > fraca`) e 5,34 > 5,07 passa. Ordem não é
 * hierarquia: agora ela pede **passo mínimo de 1,35×** entre camadas, que é o que
 * separa três tons de três nomes para o mesmo cinza. Os temas escuros já tinham
 * 1,5× — eles são a referência, e é por isso que o escuro parecia pronto e o claro
 * não.
 */
const lightPalette = {
  paper: '#F7F6F3',
  surface: '#FFFFFF',
  sunken: '#EFEDE8',
  ink: '#23211E',
  inkMuted: '#57534D',
  inkFaint: '#6D6963',
  line: '#E7E4DE',
  lineStrong: '#D7D3CA',
  onAccent: '#FFFFFF',

  sky: '#3F7096',
  apricot: '#A75F3A',
  mint: '#2F7D6B',
  lilac: '#67589C',
  rose: '#A3505C',
  sage: '#5A7B49',
  sand: '#9A7429',
  mist: '#6E6A64',

  ok: '#2F7D5A',
  warning: '#C7841E',
  danger: '#C0453C',
  neutral: '#6E6A65',
};

/**
 * Dark is neutral gray, not navy. Ambient hues brighten so they stay legible
 * on gray, and shrink further into accent-only duty: gray dominates, color
 * accents.
 */
const darkPalette: typeof lightPalette = {
  paper: '#141414',
  surface: '#1E1E1E',
  sunken: '#262626',
  ink: '#EDEBE7',
  inkMuted: '#ADA9A2',
  inkFaint: '#928D88',
  line: '#333130',
  lineStrong: '#454240',
  onAccent: '#141414',

  sky: '#8FB6D8',
  apricot: '#E2A283',
  mint: '#6FC4AE',
  lilac: '#AB9BDD',
  rose: '#DE97A2',
  sage: '#A2BE8C',
  sand: '#D9B76A',
  mist: '#A8A39B',

  ok: '#5DBF92',
  warning: '#E0AB53',
  danger: '#E0766D',
  neutral: '#A8A39B',
};

export const palettes = { light: lightPalette, dark: darkPalette };
export type Palette = typeof lightPalette;
export type ColorScheme = keyof typeof palettes;

/**
 * Type scale, deliberately one step larger than the market default. The people
 * using this app read it in a cold room, under bad light, sometimes with a
 * dirty screen. Body is 17, not the usual 14-16.
 */
export const type = {
  display: { fontSize: 34, lineHeight: 38, fontWeight: '600' as const, letterSpacing: -0.8 },
  displaySmall: { fontSize: 22, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.5 },
  section: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.3 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '400' as const },
  secondary: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  /** Numbers always use tabular figures so columns stop dancing on update. */
  figure: { fontSize: 28, lineHeight: 32, fontWeight: '600' as const, letterSpacing: -0.7 },
  /**
   * The one number a screen is about, read at arm's length.
   *
   * Fifty-six points is not decoration: the briefing exists to be answered from
   * the doorway, and a cost read at 28 has to be walked up to. One per screen -
   * a second hero is two heroes, which is none.
   */
  hero: { fontSize: 56, lineHeight: 58, fontWeight: '600' as const, letterSpacing: -1.5 },
  /** Codes (lot, label) use a monospaced face: 0/O and 1/l must not blur. */
  code: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const, letterSpacing: 0.4 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const, letterSpacing: 1.4 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 } as const;

/** Generous corners are the most recognizable part of the One UI signature. */
export const radius = { sm: 9, md: 14, lg: 19, xl: 24, pill: 999 } as const;

/**
 * Spring physics, never linear easing. This is where "breathing" comes from.
 * Five motion rules govern usage:
 *   1. Nothing blinks. Pulses run 2.6-3.2s.
 *   2. At most two pulsing elements per screen.
 *   3. Only what is actually live may pulse.
 *   4. Motion never delays information.
 *   5. Reduced-motion turns it all off, and the screen stays complete.
 */
export const motion = {
  settle: { damping: 18, stiffness: 140, mass: 1 },
  press: { damping: 20, stiffness: 400, mass: 0.6 },
  pressScale: 0.97,
  staggerMs: 40,
  pulseMs: 2600,
  breatheMs: 3200,
  countMs: 1250,
} as const;

/** The rail that carries an area's color on a card. */
export const RAIL_WIDTH = 3;

/**
 * As duas caras do produto.
 *
 * O dono viu quarenta esboços e escolheu duas identidades — **Papel** e
 * **Orgânico** — e decidiu que as duas ficam, com claro e escuro, trocáveis nos
 * ajustes. Não é indecisão: são dois negócios diferentes olhando a mesma tela.
 * A fábrica que mostra o app para o contador quer a página impressa; a que abre
 * o celular na doca às seis da manhã quer a paisagem.
 *
 * O que muda entre elas é o que muda numa identidade de verdade: a **paleta**,
 * a **família tipográfica**, o **raio dos cantos** e o **cabeçalho** (a linha de
 * traço fino contra a colina desenhada). O que NÃO muda é a escala de tamanhos:
 * corpo 17, herói 56 e figura 28 continuam iguais nas duas, porque essa escala
 * não é estilo — é o tamanho que se lê numa câmara fria, de luva, com a tela
 * suja, e trocar isso por gosto seria trocar legibilidade por decoração.
 */
export type Skin = 'papel' | 'organico';

/**
 * O Papel, com a cor que o dono cobrou.
 *
 * A primeira versão era terrosa e discreta — e discrição, na tela dele, virou
 * apagamento: *"está muito apagado, quero mais contraste entre os elementos
 * coloridos"*. O que mudou foi só a **saturação dos tons de área**; o creme, a
 * tinta e a serifa continuam iguais, porque o que ele gostou foi exatamente
 * isso.
 *
 * E a cor entra em traço, nunca em massa: quando o ícone virou selo cheio ele
 * recusou na hora. O motivo é o desenho do topo — a ilustração é monoline, e um
 * ícone maciço ao lado dela parece de outro aplicativo.
 */
const papelClaro: Palette = {
  paper: '#FAF7F2',
  surface: '#FFFFFF',
  sunken: '#F1EDE5',
  ink: '#221F1B',
  inkMuted: '#554D43',
  inkFaint: '#706960',
  line: '#DCD3C6',
  lineStrong: '#CBBEAC',
  onAccent: '#FFFFFF',

  // Tinta e terra, não cor de tela.
  //
  // O dono olhou a tela no Papel e disse que "as cores e todo o resto não
  // combinam". Ele estava certo por um motivo que dá para nomear: os tons eram
  // os do Orgânico com outra saturação — verde #15803D e lilás #5B4BA8 são
  // cores de interface, frias, e brigam com um creme quente do mesmo jeito que
  // um marcador fluorescente briga com papel de carta.
  //
  // Estes são de impressão: verde-garrafa, azul-tinta, roxo-tinta, ocre. A
  // família inteira puxa para o quente e nenhuma delas grita.
  sky: '#2C5A7A',
  apricot: '#A8371A',
  mint: '#3F6B4A',
  // Ameixa, não violeta: o violeta era a última cor de interface que sobrava na
  // família, e uma cor fria e saturada ao lado de creme quente é o que faz a
  // paleta inteira parecer emprestada de outro aplicativo.
  lilac: '#6A4A57',
  rose: '#8E3346',
  sage: '#5A7040',
  sand: '#8A6414',
  mist: '#6F6558',

  ok: '#3F6B4A',
  warning: '#8A6414',
  danger: '#9E2A2A',
  neutral: '#6F6558',
};

/**
 * O Papel no escuro é papel escuro, não um vazio.
 *
 * A pergunta do dono, olhando esta cara: *"esse é o tema dark?"* — e a resposta
 * honesta é que ele tinha virado um buraco preto. Enquanto os cartões tinham
 * fundo lavado, a massa deles separava a página do chão; no dia em que a caixa
 * saiu (que é o que este tema pede), sobrou tudo boiando num preto quase puro,
 * com réguas de #2F271F que ninguém enxerga.
 *
 * O chão sobe para um carvão QUENTE e as linhas sobem junto: é a diferença
 * entre uma página impressa em papel escuro e uma tela apagada. Tinta creme,
 * papel carvão, régua visível — as três coisas juntas, ou nenhuma funciona.
 */
const papelEscuro: Palette = {
  paper: '#1B1610',
  surface: '#241E17',
  sunken: '#2C251C',
  ink: '#F4ECE0',
  inkMuted: '#BCAE9A',
  inkFaint: '#998C7E',
  // A régua é o que estrutura esta cara. Fraca demais, a página se desmancha.
  line: '#4A3F33',
  lineStrong: '#5E5142',
  onAccent: '#1B1610',

  // A mesma família do claro, clareada para o papel escuro: continua sendo
  // tinta sobre papel, e não cor de interface sobre preto.
  sky: '#8FA3AE',
  apricot: '#E08A5A',
  mint: '#9AB294',
  lilac: '#BE9AA4',
  rose: '#C99098',
  sage: '#A8BC92',
  sand: '#D9B76A',
  mist: '#A8A39B',

  ok: '#93B79A',
  warning: '#D9B76A',
  danger: '#D08268',
  neutral: '#B6A894',
};

const organicoClaro: Palette = {
  paper: '#F3F7F3',
  surface: '#FFFFFF',
  sunken: '#E7EFE8',
  ink: '#16281D',
  inkMuted: '#425249',
  inkFaint: '#5F6D63',
  line: '#DDE9DF',
  lineStrong: '#C6D8CA',
  onAccent: '#FFFFFF',

  sky: '#5B8EC9',
  apricot: '#E29B52',
  mint: '#2F7D5C',
  lilac: '#6B7FD0',
  rose: '#C4677A',
  sage: '#5A7B49',
  sand: '#B28E42',
  mist: '#8BA192',

  ok: '#2F7D5C',
  warning: '#C2751F',
  danger: '#C0453C',
  neutral: '#4D6055',
};

const organicoEscuro: Palette = {
  paper: '#0C1512',
  surface: '#13201B',
  sunken: '#1A2B24',
  ink: '#EAF5EE',
  inkMuted: '#9DB8A9',
  inkFaint: '#80948A',
  line: '#1C2F27',
  lineStrong: '#2A443A',
  onAccent: '#0C1512',

  sky: '#7FB6E8',
  apricot: '#F0A868',
  mint: '#5EF2A8',
  lilac: '#A79BEA',
  rose: '#E58FA0',
  sage: '#A2BE8C',
  sand: '#E5C377',
  mist: '#7F9A8C',

  ok: '#5EF2A8',
  warning: '#F5A35E',
  danger: '#F5715E',
  neutral: '#9DB8A9',
};

/**
 * A família tipográfica de cada identidade.
 *
 * `serif` no Papel e nulo no Orgânico — nulo quer dizer "a fonte do sistema",
 * que é a certa para a identidade macia e é também a que existe em qualquer
 * aparelho. `serif` é o nome genérico que Android e iOS resolvem sozinhos, sem
 * embarcar arquivo de fonte: um aplicativo que abre offline numa câmara fria não
 * paga megabytes por uma família de texto.
 */
/**
 * As paletas do Orgânico.
 *
 * *"A paleta é bem verde; seria legal poder escolher"* — e a escolha não é um
 * botão de cor: ela move a **paisagem inteira**, porque no Orgânico o céu e a
 * colina são a identidade, não decoração de fundo. Trocar para âmbar é o fim de
 * tarde; para azul, a manhã fria.
 *
 * O que a escolha NÃO move são os sinais. Verde de "preço caiu" e vermelho de
 * "preço subiu" são leitura, não estilo: numa fábrica que escolhesse a paleta
 * terracota, uma alta de custo passaria a aparecer na cor do tema e deixaria de
 * gritar. Por isso `ok`, `warning` e `danger` ficam fora daqui.
 */
export type Hue = 'verde' | 'azul' | 'ambar' | 'terracota' | 'lavanda';

export const hues: Record<Hue, { brand: string; skyTop: string; skyBottom: string; hillFar: string; hillNear: string }> = {
  verde: { brand: '#2F7D5C', skyTop: '#DFF0E6', skyBottom: '#BFE3CF', hillFar: '#A9DCC0', hillNear: '#7CC9A6' },
  azul: { brand: '#2E6DA4', skyTop: '#DCEAFC', skyBottom: '#BCD8F7', hillFar: '#A9C8E8', hillNear: '#7BA9D6' },
  ambar: { brand: '#C2751F', skyTop: '#FDEEDA', skyBottom: '#FBDCB4', hillFar: '#F0CF9A', hillNear: '#E0B273' },
  terracota: { brand: '#B4552D', skyTop: '#FBE6DF', skyBottom: '#F6CDC0', hillFar: '#EEB9A6', hillNear: '#DD9781' },
  lavanda: { brand: '#6B5FA8', skyTop: '#E9E4F8', skyBottom: '#D4CBF0', hillFar: '#C3B9E6', hillNear: '#A396D4' },
};

/**
 * A MEDIDA da página: até onde a coluna de conteúdo cresce, em dp.
 *
 * O aplicativo inteiro não tinha nenhuma — zero `useWindowDimensions`, um único
 * `maxWidth` numa caixa de diálogo — e isso não aparece num telefone, porque num
 * telefone a largura é sempre a mesma. Aparece num tablet: **do telefone ao
 * tablet a largura dobra**, e a coluna que serve a 393 dp vira uma tira esticada
 * a 800, com linhas de texto que o olho perde no meio.
 *
 * Seiscentos é o ponto de quebra que o `CLAUDE.md` nomeia como tablet pequeno, e
 * a escolha é de propósito: **abaixo dele nada muda**, então nenhum telefone
 * corre risco por causa desta linha. Acima, a coluna para de crescer e se
 * centraliza.
 *
 * Não é a resposta inteira, e o arquivo diz qual é: a 840 o certo é *refluir em
 * colunas*, não centralizar uma. Mas qual cartão emparelha com qual é pergunta
 * de cada tela, e uma tira legível é melhor que uma tira esticada enquanto essa
 * pergunta não for respondida vinte vezes.
 */
export const MEDIDA_DA_PAGINA = 600;

export const skins = {
  papel: {
    light: papelClaro,
    dark: papelEscuro,
    /** Serifa nos títulos; o resto continua na fonte do sistema. */
    titleFamily: 'serif' as const,
    radius: { sm: 4, md: 6, lg: 8, xl: 10, pill: 999 },
    /**
     * A espessura do traço dos desenhos — fina, como bico de pena.
     *
     * Ela morava em vinte e seis lugares como `skin === 'papel' ? 1.7 : 2.2`,
     * repetida em vinte e cinco arquivos. Isso não é redundância inofensiva: é a
     * definição de uma decisão que ninguém consegue mudar. No dia em que o dono
     * pedir um traço mais fino no Papel, vinte e seis edições e uma esquecida — e
     * a tela esquecida fica com a espessura da OUTRA cara, que é a divergência
     * que o guarda da assinatura existe para impedir noutra dimensão.
     */
    traco: 1.7,
  },
  organico: {
    light: organicoClaro,
    dark: organicoEscuro,
    titleFamily: undefined,
    radius: { sm: 12, md: 18, lg: 22, xl: 28, pill: 999 },
    /** Mais cheio: o Orgânico é um tema de massa, não de linha. */
    traco: 2.2,
  },
} as const;
