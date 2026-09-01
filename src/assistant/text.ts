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
 * Reads a number the way it was typed in Portuguese: "1.250,40" and "1250.40"
 * and "1250,4" all mean the same thing, and people use all three.
 */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  // Whichever separator comes last is the decimal one; the other groups digits.
  const decimal = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : null;
  const normalized =
    decimal === null
      ? cleaned.replace(/[.,]/g, '')
      : cleaned
          .split(decimal)
          .map((part, i, all) => (i === all.length - 1 ? part : part.replace(/[.,]/g, '')))
          .join('.');

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

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
    // Several match: prefer the shortest name, which is the least specific
    // registration and usually what a short word meant.
    return [...contains].sort((a, b) => a.name.length - b.name.length)[0];
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
