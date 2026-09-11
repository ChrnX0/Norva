/**
 * A recusa do servidor é para SEMPRE ou para AGORA — e o padrão é "agora".
 *
 * **O defeito que isto existe para consertar é o mais caro desta fila, e ele tem cara nova.**
 * Dois celulares na mesma doca, os dois offline, conferem a mesma carga. O primeiro sobe e
 * entra. O segundo sobe e o servidor recusa, com razão — a `0051` existe para o saldo não
 * dobrar. Só que a fila não sabe o que fazer com uma recusa CERTA: `drain` vê "entraram menos
 * do que eu mandei", chama isso de lacuna, espera, tenta de novo, desiste em três e **não
 * marca nada**. Na sincronia seguinte, a mesma parede — e tudo o que aquele aparelho gravou
 * depois (perdas, produção, transferência) fica preso atrás dela, para sempre, sem uma
 * palavra a quem conferiu.
 *
 * **A assimetria de custo é o que decide o padrão, e ela não é simétrica nem de longe:**
 *
 *   classificar passageira como PERMANENTE -> a linha sai da frente e nunca chega ao
 *                                             servidor: DADO PERDIDO em silêncio, que é o
 *                                             pior resultado que esta fila tem;
 *   classificar permanente como PASSAGEIRA  -> a fila trava, que é o comportamento de hoje:
 *                                             ruim, visível, e sem perda.
 *
 * Então o padrão é `passageira` para todo código desconhecido, e promover um código a
 * permanente exige certeza — não suspeita. Cada promoção entra com a medida ao lado.
 */

export type ClasseDaRecusa = 'permanente' | 'passageira';

/**
 * Os códigos que NUNCA vão entrar, por mais que se tente. `SQLSTATE` do Postgres, que é o
 * que o PostgREST devolve em `error.code`.
 *
 * `23505` (violação de unicidade) é certo, e a razão é a forma da nossa própria escrita: a
 * fila sobe por `upsert` com `onConflict: 'id'`, então um conflito de unicidade **não é o id**
 * — é outro índice, ou um gatilho nosso que escolheu esse código. A `0051` é exatamente isso:
 *
 *     raise exception using
 *       errcode = 'unique_violation',
 *       message = 'esta remessa já foi conferida';
 *
 * Mandar a MESMA linha de novo bate na mesma parede, sempre. Não é palpite sobre um servidor
 * que ninguém exercitou: o código foi escolhido por nós, na nossa migração.
 */
const PERMANENTES: ReadonlySet<string> = new Set(['23505']);

/**
 * O que NÃO está aqui, e por que cada um ficou de fora — porque a lista curta é a decisão.
 *
 * `23503` (chave estrangeira) seria permanente se acontecesse: filho antes do pai não se
 * resolve tentando de novo. Mas ele não acontece — `pendingEntries` manda na ordem de
 * escrita (`rowid`, não relógio), e a cicatriz está escrita lá. Promovê-lo seria pagar o
 * risco de perda por um caso que a ordenação já impede.
 *
 * `42501` (permissão negada) é a cicatriz do `grant` que falta, e ela é **consertável do
 * outro lado**: um `grant` amanhã faz a mesma linha entrar. Pôr de lado agora perderia dado
 * que o servidor vai querer.
 *
 * `23514` (violação de CHECK) tem cara de permanente e não é sempre: um CHECK novo pode
 * recusar hoje o que uma migração seguinte aceita. Fica fora até alguém medir um caso real.
 */
export function classeDaRecusa(codigo: string | null | undefined): ClasseDaRecusa {
  if (!codigo) return 'passageira';
  return PERMANENTES.has(codigo.trim()) ? 'permanente' : 'passageira';
}

/** Os códigos promovidos, para a guarda poder conferir a lista contra as migrações. */
export const CODIGOS_PERMANENTES: readonly string[] = [...PERMANENTES];
