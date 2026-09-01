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

/**
 * A unit rate: fractional cents per base unit.
 *
 * This is NOT money and must never be rounded to an integer. Strawberry pulp at
 * R$ 12.40/kg is 1.24 cents per gram; forcing that into a whole cent loses 19%
 * of it, and the error then multiplies through every recipe in the system. Cost
 * per millilitre of mix is smaller still and rounds straight to zero.
 *
 * The rule: `Cents` is an amount somebody pays. `Rate` is a price per unit.
 * Rates stay fractional all the way through the calculation, and only the final
 * amount is rounded - once.
 */
export type Rate = number & { readonly __brand: 'Rate' };

/** R$ 12.40 per kilo, with 1000 g per kilo, is `rate(12.40, 1000)`. */
export function rate(pricePerPurchaseUnit: number, baseUnitsPerPurchaseUnit: number): Rate {
  if (baseUnitsPerPurchaseUnit <= 0) return 0 as Rate;
  return ((pricePerPurchaseUnit * 100) / baseUnitsPerPurchaseUnit) as Rate;
}

/** Turns a rate and a quantity into an amount - the one place rounding happens. */
export function amountOf(unitRate: Rate, quantity: number): Cents {
  return Math.round(unitRate * quantity) as Cents;
}

export function rateFromCents(total: Cents, quantity: number): Rate {
  if (quantity <= 0) return 0 as Rate;
  return (total / quantity) as Rate;
}
