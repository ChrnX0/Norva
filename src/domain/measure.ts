/**
 * Reading a quantity out of the way somebody writes a package.
 *
 * A person who buys sugar writes "saco 25 kg", because that is what is printed
 * on the sack. The app then asked them how many grams that is - 25000 - which
 * is arithmetic the system can do and the person should not have to. Law 1 of
 * this project: never ask for what can be deduced.
 *
 * Deliberately tiny. It knows mass and volume in the two scales a factory
 * actually writes, and nothing else: no ounces, no cups, no guessing. Anything
 * it cannot read with certainty returns null, and the field stays empty for the
 * person to fill - a wrong guess in a conversion factor is worse than no guess,
 * because every cost in the product is built on it.
 */

/** How many base units one written unit is worth, per base unit. */
const SCALES: Record<string, Record<string, number>> = {
  g: { g: 1, grama: 1, gramas: 1, kg: 1000, quilo: 1000, quilos: 1000, kilo: 1000, kilos: 1000 },
  ml: { ml: 1, mililitro: 1, mililitros: 1, l: 1000, litro: 1000, litros: 1000, lt: 1000 },
  un: { un: 1, und: 1, unidade: 1, unidades: 1, pc: 1, peca: 1, pecas: 1 },
};

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * The base units inside a package name, or null when it cannot be read.
 *
 * `packSize('saco 25 kg', 'g')` is 25000. `packSize('balde', 'g')` is null,
 * because a bucket has no size written on it.
 */
export function packSize(packageName: string, baseUnit: string): number | null {
  const scale = SCALES[strip(baseUnit).trim()];
  if (!scale) return null;

  // A number, then optional space, then a word - "25kg", "25 kg", "1,5 L".
  const matches = [...strip(packageName).matchAll(/(\d+(?:[.,]\d+)?)\s*([a-z]+)/g)];
  if (matches.length !== 1) return null; // two numbers is ambiguous, not clever

  const [, digits, written] = matches[0];
  const factor = scale[written];
  if (factor === undefined) return null;

  const amount = Number(digits.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const total = amount * factor;
  // A fractional base unit means the base unit is wrong, not that the answer is
  // 2.5 grams of something. Refuse rather than round somebody's cost.
  return Number.isInteger(total) ? total : null;
}
