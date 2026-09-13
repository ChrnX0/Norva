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

/**
 * Uma TAXA em centavos fracionários vira o número que a pessoa digita e lê.
 *
 * Par de `toDecimal`, e separado dela de propósito: `toDecimal` recebe `Cents` inteiro — o
 * valor que alguém paga — e esta recebe `Rate`, que é preço por unidade e nunca é inteiro.
 * Uma só função para os dois apagaria a distinção que a fundação desta casa existe para
 * guardar, e o tipo deixaria de reprovar quem trocar um pelo outro.
 *
 * Existe porque três telas dividiam por 100 na mão para mostrar a taxa, e dividir por 100
 * na mão é metade do erro que a capa deste projeto proíbe.
 *
 * *No lugar onde morava `multiplyCents`, apagada em 12 de setembro: zero chamadores, e a
 * justificativa escrita dela ("existe para ninguém escrever `Math.round(x * f)` inline")
 * era falsa duas vezes — o inline que de fato aconteceu, vinte e cinco vezes, é `Rate ×
 * quantidade`, que é trabalho do `amountOf`. Primitiva presente não impede inline nenhum;
 * quem impede é a guarda de fonte.*
 */
export function rateToDecimal(value: Rate): number {
  return value / 100;
}

export function rateFromCents(total: Cents, quantity: number): Rate {
  if (quantity <= 0) return 0 as Rate;
  return (total / quantity) as Rate;
}

/**
 * Splits a total across weighted parts without losing or inventing a cent.
 *
 * A repartição por PESO, que é a única que este produto precisa — a irmã de
 * partes iguais existiu até 7 de setembro sem nenhum chamador e saiu pelo P1.
 * It exists because of a real defect: a recipe's batch cost was the sum of its
 * lines *after each line had been rounded*, so ten ingredients at four tenths
 * of a cent each summed to nothing while the batch really cost four cents.
 * Every product built on that recipe was understated, and the arithmetic
 * looked perfectly reasonable at every step.
 *
 * Largest remainder: whatever is left after flooring goes to the parts that
 * lost the most in the floor. The result always sums to exactly `total`, which
 * is what lets a breakdown be shown next to a figure without the two
 * disagreeing.
 */
export function allocateByWeight(total: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) return [];

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => cents(0));

  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map((value) => Math.floor(value));
  const shortfall = total - floors.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  const out = [...floors];
  for (let k = 0; k < shortfall; k += 1) out[byRemainder[k].index] += 1;

  return out.map((value) => cents(value));
}
