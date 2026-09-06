/**
 * A prancheta das cenas de cabeçalho.
 *
 * O dono pediu, em 6 de setembro, que **toda tela** tenha um cabeçalho vivo como
 * o da capa: *"quero em TODAS as páginas um cabeçalho q fica animado tipo a da
 * pagina home com aquela fabricazinha e o sol se movendo"*.
 *
 * Uma prancheta só para todas elas, e não uma por desenho, porque é isso que faz
 * quinze cenas parecerem a mesma mão. Três medidas, e as três saem do desenho
 * aprovado da capa em vez de serem inventadas aqui:
 *
 *  - **A largura é a mesma, 364.** Assim uma cena pode ser recortada da capa sem
 *    reconverter coordenada nenhuma.
 *  - **A altura é 72 e não 150.** O cabeçalho divide a tela com o título e com o
 *    conteúdo; metade da altura da capa é o que cabe sem empurrar a primeira
 *    linha de informação para fora.
 *  - **A linha do chão fica a 89% da altura**, que é onde ela está na capa
 *    (133 de 150). É ela que faz objetos soltos lerem como uma linha, e trocar
 *    essa proporção entre telas seria o mesmo desenho pousando em alturas
 *    diferentes.
 */
export const PRANCHA_DO_CABECALHO = { largura: 364, altura: 72 } as const;

/** Onde tudo pousa. Mesma proporção da capa. */
export const CHAO = 64;

/**
 * A espessura do traço não mora aqui: ela vem da pele (`traco` em `tokens.ts`),
 * porque é uma das quatro coisas que separam o Papel do Orgânico. Uma cena que
 * chumbasse 1.3 ficaria fina demais na pele de traço grosso, e o dono já recusou
 * exatamente esse defeito quando o Orgânico era "o Papel com outro desenho".
 */

/** As cenas que existem. Uma rota escolhe a sua pelo nome. */
export const CENAS = [
  'producao',
  'transporte',
  'relatorios',
  'mais',
  'insumos',
  'receitas',
  'produtos',
  'lojas',
  'pedidos',
  'separacao',
  'perdas',
  'lotes',
  'compras',
  'gente',
  'ajustes',
  'assistente',
  'espelho',
] as const;

export type Cena = (typeof CENAS)[number];
