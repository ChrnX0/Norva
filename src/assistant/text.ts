/**
 * The small amount of language handling the offline assistant needs.
 *
 * It runs on the device with no network, because the cold room is a metal box
 * and a delivery route has no signal. Recognising the twenty questions people
 * actually repeat is arithmetic on strings, not intelligence - and it answers
 * instantly, which the network version never will.
 */

/** Lowercases and strips accents, so "açúcar" and "acucar" are one word. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads a number the way it was typed.
 *
 * One reader for the whole app, in `@/domain/number`: the screens that take
 * money used to have three different ones, and the assistant a fourth. Its old
 * rule read "1.500 picolés" as one and a half - the same ambiguity, answered
 * differently in the same app.
 */
export { parseTyped as parseNumber } from '@/domain/number';

/**
 * Finds the thing someone meant by name, tolerating how they actually type.
 *
 * "morango" has to find "Polpa de morango", because nobody types the full
 * registered name - and an assistant that answers "não encontrei" to a word
 * that is plainly in the list gets abandoned on the first try.
 */
export function findByName<T extends { name: string }>(
  candidates: readonly T[],
  term: string,
): T | null {
  const wanted = normalize(term);
  if (!wanted) return null;

  const exact = candidates.find((c) => normalize(c.name) === wanted);
  if (exact) return exact;

  const contains = candidates.filter((c) => normalize(c.name).includes(wanted));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) {
    // Vários batem: nenhum é a resposta.
    //
    // Isto devolvia o nome mais curto, com o argumento de que ele é o cadastro
    // menos específico. O argumento valia enquanto a fábrica tinha um produto
    // com "morango" no nome. Com a grade — linha × tipo × sabor — "morango"
    // casa com doze, e o mais curto é sorteio: "Pote 1 litro de morango" ganha
    // de "Picolé Tradicional de morango" por ter menos letras, e o assistente
    // gravaria a produção contra a receita errada sem dizer nada a ninguém.
    //
    // Devolver nulo aqui é o que faz a tela perguntar em vez de adivinhar. O
    // sistema sugere e nunca decide calado, e esta era a única linha do
    // assistente que decidia calada.
    return null;
  }

  // Last resort: any candidate sharing a significant word with the question.
  const words = wanted.split(' ').filter((w) => w.length > 3);
  return (
    candidates.find((c) => words.some((w) => normalize(c.name).includes(w))) ?? null
  );
}

/** Signed percentage as a phrase: "subiu 9,4%" / "caiu 3,1%" / "não mudou". */
export function movePhrase(change: number): string {
  const percent = Math.abs(change * 100);
  if (percent < 0.05) return 'não mudou';
  return `${change > 0 ? 'subiu' : 'caiu'} ${percent.toFixed(1).replace('.', ',')}%`;
}

/**
 * Os candidatos que um termo alcança, quando ele alcança mais de um.
 *
 * `findByName` devolve nulo no empate de propósito - decidir calado entre doze
 * picolés de morango é escolher a receita errada em silêncio. Mas dizer só "não
 * existe" para uma coisa que existe doze vezes é a Lei 5 ao contrário: o erro
 * tem que impedir E dizer o caminho. Esta função é o caminho.
 */
export function namesakes<T extends { name: string }>(
  candidates: readonly T[],
  term: string,
): T[] {
  const wanted = normalize(term);
  if (!wanted) return [];
  if (candidates.some((c) => normalize(c.name) === wanted)) return [];
  const contains = candidates.filter((c) => normalize(c.name).includes(wanted));
  return contains.length > 1 ? contains : [];
}
