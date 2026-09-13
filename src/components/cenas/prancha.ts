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
  'copia',
  'assistente',
  'espelho',
  'clima',
] as const;

export type Cena = (typeof CENAS)[number];

/**
 * Onde o botão está no trilho, de 0 (começo) a 1 (fim).
 *
 * **Existe porque a assinatura anterior deixava escrever um botão que não cabe.**
 * `Cursor` recebia o CENTRO do percurso e o CURSO, e a cena dos ajustes pedia
 * centro 0,18 com curso 0,55 — meio curso é 0,275, então o botão ia até −0,095 do
 * trilho e saía da prancheta. Na foto do emulador ele aparece como um arco
 * vermelho cortado na borda esquerda da faixa, com o trilho do meio vazio.
 *
 * Nada disso é visível de dentro de um módulo: `typecheck`, `lint` e a suíte
 * inteira ficam verdes com a peça fora da tela. **O que pegou foi olhar a foto.**
 *
 * Com começo e fim, qualquer par dentro de 0 e 1 mantém o botão no trilho — o
 * estado inválido deixa de ser escrevível em vez de depender de quem calcula
 * certo na hora de escrever a cena.
 */
export function noTrilho(de: number, ate: number, ciclo: number): number {
  'worklet';
  return de + (ate - de) * ciclo;
}

/**
 * Quanto o cabeçalho reserva para a cena, numa largura de tela.
 *
 * Fora do componente porque é a única coisa aqui que se pode PROVAR sem montar
 * nada — e porque nada provava. Havia três lugares fazendo esta conta e os três
 * liam a largura da JANELA, enquanto o desenho vive dentro de uma coluna que trava
 * em `maxWidth`. Acima de 600 dp a reserva continuava crescendo e o desenho não:
 * a diferença virava banda vazia, centralizada, com cor de página aparecendo acima
 * do céu — até 75 dp num tablet deitado, mais que a altura do próprio desenho.
 *
 * A vinheta perde o padding da página; a paisagem o recupera sangrando para as
 * bordas. É essa a única diferença entre as duas.
 */
export function alturaDaCena(entrada: {
  larguraDaTela: number;
  medidaDaColuna: number;
  padding: number;
  cabecalho: 'paisagem' | 'vinheta';
}): number {
  const coluna = Math.min(entrada.larguraDaTela, entrada.medidaDaColuna);
  const cena = entrada.cabecalho === 'paisagem' ? coluna : coluna - entrada.padding * 2;
  return (cena / PRANCHA_DO_CABECALHO.largura) * PRANCHA_DO_CABECALHO.altura;
}
