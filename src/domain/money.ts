/**
 * Money is integer cents. Never a float — 0.1 + 0.2 is not 0.3, and a system
 * whose whole point is that the numbers are trustworthy cannot afford that.
 */
export type Cents = number & { readonly __brand: 'Cents' };

export function cents(value: number): Cents {
  return Math.round(value) as Cents;
}

export function fromDecimal(value: number): Cents {
  return Math.round(value * 100) as Cents;
}

export function toDecimal(value: Cents): number {
  return value / 100;
}

export function addCents(a: Cents, b: Cents): Cents {
  return (a + b) as Cents;
}

export function multiplyCents(value: Cents, factor: number): Cents {
  return Math.round(value * factor) as Cents;
}

/**
 * Splits an amount across n parts without losing or inventing a cent. The
 * remainder is spread one cent at a time over the first parts, so the sum of
 * the result always equals the input exactly.
 */
export function allocateCents(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    (base + (i < remainder ? 1 : 0)) as Cents,
  );
}
