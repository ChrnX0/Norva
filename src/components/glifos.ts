import type { Ambient } from '@/theme/tokens';

/**
 * O que cada desenho É — dado puro, sem React.
 *
 * Mora fora do `Glyph.tsx` por um motivo prático que virou arquitetural: o
 * guarda que impede a divergência (`src/theme/assinatura.test.ts`) roda em Node,
 * e `Glyph.tsx` importa `react-native-svg`, que não carrega ali. Uma declaração
 * que o guarda não consegue ler é uma declaração que ninguém cobra.
 *
 * E há o ganho de fundo: a tabela é DADO, não desenho. Quem acrescenta um glifo
 * amanhã declara aqui de que assunto ele fala, antes de desenhar um traço.
 */

/**
 * De que ÁREA cada desenho é — e por que isto é uma tabela e não um costume.
 *
 * O dono olhou uma tela e disse: *"todo o app é um organismo só, tem que ser
 * tudo coerente e com a mesma assinatura, tanto lógica quanto visual"*. Uma
 * varredura das vinte e quatro telas achou **trinta pontos** em que a mesma
 * coisa saía de duas cores: o `GlyphPrice` pintado de azul de casa numa tela e
 * de areia noutra; a produção pintada com o tom do dinheiro e o dinheiro com o
 * tom da casa, no MESMO arquivo, com trezentas linhas de distância.
 *
 * A causa não é desatenção — é que a cor estava sendo escolhida **na tela**,
 * caso a caso, e cor escolhida caso a caso diverge sempre. A regra que faltava
 * cabe numa frase, e ela inverte quem decide:
 *
 * > **O desenho carrega o tom do ASSUNTO de que ele fala, não o da tela em que
 * > ele por acaso mora.**
 *
 * Uma etiqueta de preço é cor de dinheiro no relatório, na ficha do insumo e na
 * capa, porque ela fala de dinheiro nos três lugares. Quem vê areia sabe que é
 * dinheiro antes de ler — e é isso que a cor de área existe para fazer.
 *
 * **E há a segunda família, que o guarda descobriu.** Alguns desenhos não são um
 * assunto: são uma MEDIDA, e servem honestamente a mais de um. O termômetro é a
 * câmara fria nos Ajustes e é o clima na tela do tempo; o calendário é a data
 * combinada de um pedido e é o dia da semeadura; a loja é o destino de uma carga
 * no transporte e é o espelho dela mesma no relatório. Forçar um tom fixo nesses
 * seria mentir para a regra em vez de cumpri-la.
 *
 * Esses são `'anfitriao'`: tomam o tom da ÁREA DA TELA em que estão — e o guarda
 * continua cobrando, porque agora ele confere contra o `AreaProvider` do arquivo.
 * O que não existe mais é o terceiro caminho, que era o defeito: escolher uma cor
 * qualquer, caso a caso.
 *
 * `src/theme/assinatura.test.ts` compara esta tabela com o que as telas
 * realmente escrevem, e é ele que impede a divergência de voltar.
 */
/**
 * O tom de um desenho: um assunto fixo, o sinal de perda, ou o da tela que o hospeda.
 */
export type AreaDoGlifo = Ambient | 'danger' | 'anfitriao';

export const AREA_DO_GLIFO: Record<string, AreaDoGlifo> = {
  // Produção: o que sai do tacho, a ficha que manda nele, o lote que ele gera.
  GlyphProduction: 'apricot',
  GlyphKettle: 'apricot',
  GlyphRecipe: 'apricot',
  // A etiqueta é CARREGADORA, não assunto: ela nomeia o que estiver dentro dela.
  // No lote ela é produção; no catálogo ela é o nome composto do produto. Foi o
  // guarda que mostrou isso, ao reprovar o catálogo por usar a etiqueta de PREÇO
  // para dizer "o nome que vai no produto" — o comentário de lá já dizia que a
  // etiqueta era o desenho certo; errado era qual etiqueta.
  GlyphLabel: 'anfitriao',
  // A grade serve a dois: é o produto no catálogo e é o que está guardado nos
  // Ajustes. Toma o tom de quem hospeda.
  GlyphCatalog: 'anfitriao',

  // Estoque: o que você compra, guarda, conta e onde isso fica.
  GlyphStock: 'mint',
  GlyphSack: 'mint',
  GlyphBucket: 'mint',
  GlyphPackaging: 'mint',
  GlyphStick: 'mint',
  GlyphCount: 'mint',
  // A fábrica é um lugar no cadastro e é onde o clima acontece na tela do tempo.
  GlyphFactory: 'anfitriao',
  // Temperatura é medida, não assunto: câmara fria nos avisos, clima na tela do tempo.
  GlyphThermometer: 'anfitriao',

  // Transporte: o que sai daqui e vai para outro lugar.
  GlyphBox: 'lilac',
  GlyphVehicle: 'lilac',

  // Compra e pedido: o que alguém pede e o que a nota move.
  GlyphOrder: 'sage',
  GlyphPurchase: 'sage',

  // Dinheiro — e é AZUL, não areia.
  //
  // Eu tinha escrito areia aqui, e mudei cinco telas para combinar. Estava
  // errado: `docs/linguagem.md:89` decide `dinheiro, custo, preço = palette.sky`,
  // e o aplicativo já cumpria isso em quase todo lugar. Eu não abri o documento —
  // procurei no CLAUDE.md e no insights.md e parei ali —, então li conformidade
  // como defeito e "consertei" a decisão de alguém. É o erro que o CLAUDE.md
  // nomeia com todas as letras: **procure a decisão antes de chamar de defeito**.
  //
  // O que era deriva de verdade era o contrário: a peça de preços da capa saía em
  // areia contra o documento, e essa sim foi corrigida.
  GlyphPrice: 'sky',
  // Série é medida: preço no insumo, perda no mês, produção no relatório.
  GlyphChart: 'anfitriao',

  // A loja e o cliente: destino de carga no transporte, quem pediu no pedido,
  // espelho dela mesma no relatório. Medida de "para quem", não assunto.
  GlyphStore: 'anfitriao',
  GlyphCustomer: 'anfitriao',

  // A casa e o próprio aplicativo.
  GlyphAssistant: 'sky',
  GlyphSettings: 'mist',
  GlyphCalendar: 'anfitriao',

  // Perda é perda em qualquer tela: não é área, é sinal, e o sinal manda.
  GlyphLoss: 'danger',

  // Sem assunto próprio: acrescentar o quê depende de onde.
  GlyphPlus: 'anfitriao',
};

