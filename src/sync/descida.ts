/**
 * A DESCIDA: o que o servidor já sabe, chegando neste aparelho.
 *
 * **Por que ela existia como buraco, e o tamanho do buraco.** Tudo neste projeto sobe:
 * `engine.ts` drena a fila e `transporte.ts` escreve linha por linha. Nada nunca descia — e
 * isso faz a fundação valer pela metade. O saldo é a soma dos movimentos, e cada aparelho
 * somava só os que ele mesmo gravou: a gerente conta a câmara pelo celular dela e o dono, no
 * dele, vê o estoque de antes da contagem. Os dois estão certos sobre livros-razão
 * diferentes, e nenhuma tela tem como avisar — porque nenhum dos dois está errado sobre o
 * que viu.
 *
 * E ela bloqueava uma decisão do dono, de 11 de setembro: *"assim que sincronizarem, uma
 * mensagem aparece dizendo que tem duplicação, mostra os dados para os DOIS celulares, e o
 * primeiro que aceitar fica."* Sem descida, o segundo celular não tem como ver o que o
 * primeiro gravou.
 *
 * ## As quatro decisões deste arquivo
 *
 * **1. O cursor é a hora do SERVIDOR, com o id desempatando.** `occurred_at` chega fora de
 * ordem de propósito (a nota de terça digitada na quinta) e `recorded_at` vem do aparelho —
 * dois celulares com relógios diferentes embaralham a ordem, e um relógio atrasado faz
 * linhas nascerem ANTES do cursor de quem já sincronizou, invisíveis para sempre. A `0061`
 * acrescentou `received_at default now()`, que é monótona dentro de um servidor só.
 *
 * O desempate pelo `id` não é preciosismo: uma fila subindo em lote entra na mesma transação
 * e recebe o mesmo `now()`. Sem o par, a segunda linha do lote fica do lado errado do "maior
 * que" e some.
 *
 * **2. Cadastro e razão descem por caminhos diferentes, porque são coisas diferentes.**
 * Cadastro se corrige — o item muda de nome, a receita ganha versão — e a última palavra
 * vence: `upsert` local. O razão é append-only e não se corrige: linha que já existe é a
 * MESMA linha, e reescrevê-la seria reescrever história. `INSERT OR IGNORE`, e não há
 * conflito possível por construção.
 *
 * **3. As colunas que descem são as mesmas que sobem.** `colunasQueSobem` devolve o `take`
 * do serializador; a descida lê exatamente ele de volta. A ida e a volta ficam simétricas por
 * construção, em vez de por duas listas escritas pela mesma mão que divergem no primeiro
 * `alter table` — a doença que este repositório já nomeou noutro lugar (*"guarda cuja lista
 * é derivada do que o código aceita não guarda o que ele deveria aceitar"*).
 *
 * **4. O que desce NÃO entra na fila.** É a regra que impede o laço: uma linha que desceu e
 * fosse enfileirada subiria de volta, o servidor a devolveria, e os dois aparelhos ficariam
 * conversando para sempre sobre a mesma linha. O escritor da descida é exceção registrada
 * nas guardas de camada, com a razão escrita lá.
 */
import { APENAS_INSERE, colunasQueSobem, type ServerTable } from './serialize';

/**
 * Onde este aparelho parou, por tabela.
 *
 * Nulo é "nunca desci desta tabela" e pede tudo desde o começo — que é o estado de um celular
 * novo entrando numa fábrica que já tem histórico, e é o caso que mais importa.
 */
export type Cursor = { recebidoEm: string; id: string } | null;

/**
 * A ordem em que as tabelas descem — e ela é a das CHAVES ESTRANGEIRAS, não alfabética.
 *
 * Um movimento aponta para item, lugar, lote e pessoa; uma linha de receita aponta para a
 * versão, que aponta para a receita. Descer o movimento antes do item que ele cita é gravar
 * referência quebrada — e o aparelho tem `foreign_keys` ligado (`PRAGMAS`, `db.ts`), então o
 * SQLite recusa a linha inteira. A fábrica perderia exatamente os movimentos mais novos,
 * calada.
 *
 * `erase_requests` fica de fora: o pedido de Reset é COMANDO e não fato — quem o lê decide se
 * destrói, e isso não é replicar.
 */
export const DESCEM: readonly ServerTable[] = [
  'carriers',
  'locations',
  'profiles',
  'people',
  'items',
  'flavors',
  'product_lines',
  'product_categories',
  'product_types',
  'products',
  'recipes',
  'recipe_versions',
  'recipe_lines',
  'lots',
  'location_prices',
  'purchases',
  'purchase_lines',
  'orders',
  'order_lines',
  'readings',
  'sale_price_history',
  'movements',
  // DEPOIS de `movements`, e a ordem aqui é o que faz a tela dizer a verdade na primeira
  // volta: a candidata é a que PERDEU, e `disputasAbertas` mostra a vencedora por um
  // `left join` no razão. Descendo antes, a primeira volta contaria a disputa sem o outro
  // lado — honesto, mas meia informação quando a informação inteira caberia na mesma rodada.
  // Não há FK para `movements` no aparelho (ver V35), então a ordem é escolha, não exigência.
  'check_candidates',
];

/**
 * A consulta que o servidor responde: o que chegou DEPOIS do que este aparelho já tem.
 *
 * Devolvida como dado e não como texto de SQL, porque quem fala com o Supabase é o cliente
 * dele. O que este arquivo decide é a REGRA — o par ordenado, o tamanho da página, as
 * colunas —, e o transporte obedece.
 */
export function pedido(
  tabela: ServerTable,
  cursor: Cursor,
  tamanhoDaPagina = 500,
): {
  tabela: ServerTable;
  colunas: readonly string[];
  depoisDe: Cursor;
  limite: number;
  apenasInsere: boolean;
} {
  return {
    tabela,
    colunas: [...colunasQueSobem(tabela), 'received_at'],
    depoisDe: cursor,
    limite: tamanhoDaPagina,
    apenasInsere: APENAS_INSERE.includes(tabela),
  };
}

/**
 * O cursor depois de gravar uma página — e ele sai da ÚLTIMA linha, não do relógio de agora.
 *
 * Usar a hora do aparelho como cursor perderia tudo o que o servidor recebeu entre a consulta
 * e a gravação. A última linha da página é o único ponto que o aparelho sabe ter visto
 * inteiro.
 *
 * Página vazia devolve o cursor de entrada: não há o que avançar, e avançar por conta própria
 * é como uma sincronia pula linha sem ninguém notar.
 */
export function proximoCursor(atual: Cursor, pagina: readonly Record<string, unknown>[]): Cursor {
  const ultima = pagina[pagina.length - 1];
  if (!ultima) return atual;
  const recebidoEm = ultima.received_at;
  const id = ultima.id;
  if (typeof recebidoEm !== 'string' || typeof id !== 'string') return atual;
  return { recebidoEm, id };
}

/**
 * O cursor como texto para o `app_meta`, e de volta.
 *
 * Separado por espaço, e isso é medida e não gosto: `received_at` é ISO-8601 e `id` é uuid —
 * nenhum dos dois contém espaço. Formato burro de propósito: se ele não ler, `cursorDeTexto`
 * devolve nulo e o aparelho recomeça do zero, que é lento e CORRETO. Um formato esperto que
 * lesse errado pularia linha, e linha pulada não volta.
 */
export function cursorParaTexto(cursor: Cursor): string {
  return cursor ? `${cursor.recebidoEm} ${cursor.id}` : '';
}

export function cursorDeTexto(texto: string | null): Cursor {
  if (!texto) return null;
  const partes = texto.split(' ');
  if (partes.length !== 2) return null;
  const [recebidoEm, id] = partes;
  return recebidoEm && id ? { recebidoEm, id } : null;
}

/** A chave do cursor desta tabela no `app_meta`. */
export function chaveDoCursor(tabela: ServerTable): string {
  return `descida.${tabela}`;
}
