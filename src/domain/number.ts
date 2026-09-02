/**
 * Reading a number the way a person typed it, and writing one back so that
 * reading it again returns the same number.
 *
 * The app had three different readers. Four screens did
 * `s.replace(/\./g, '').replace(',', '.')`, which treats every dot as a
 * thousands separator: `118.50` became `11850`. Four others did
 * `s.replace(',', '.')`, which treats every dot as decimal: `46.000` became
 * `46`, and `1.000,00` became `NaN`. Both are defensible in Portuguese and both
 * are wrong half the time, because the phone decides which separator the person
 * can even type: React Native replaces Android's own key listener with one that
 * "permits all keyboard input through" (`ReactEditText.kt`), so `.` and `,`
 * both arrive whatever the keyboard and whatever the locale.
 *
 * Worse, the app fed itself the ambiguity. `String(2.5)` is always `"2.5"` in
 * JavaScript, so a 2,5% loss written to the recipe screen came back as 25%,
 * with the save button lit and nobody having touched a key.
 *
 * So there is one reader and one writer here, and they are inverses.
 */

/**
 * The last separator is the decimal one; the others group digits.
 *
 * Where it loses, said out loud: a lone dot with exactly three digits after it
 * is read as grouping, so `1.250` is one thousand two hundred and fifty, not
 * one and a quarter. That is the right call in this app - base units are grams,
 * millilitres and whole units, money has two decimals, and nothing here is
 * quoted to three - but a three-decimal scale reading would lose. `0.500` keeps
 * its decimal, because an integer part of zero cannot be grouping.
 */
export function parseTyped(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const commas = (cleaned.match(/,/g) ?? []).length;
  const dots = (cleaned.match(/\./g) ?? []).length;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let decimal: ',' | '.' | null;
  if (commas > 0 && dots > 0) {
    // Both present: no ambiguity left, the last one is the decimal point.
    decimal = lastComma > lastDot ? ',' : '.';
  } else if (commas > 0) {
    // The comma is Portuguese for "decimal point". Repeated, it can only be
    // grouping - nobody writes two decimal points.
    decimal = commas > 1 ? null : ',';
  } else if (dots > 0) {
    decimal = dots > 1 ? null : '.';
  } else {
    decimal = null;
  }

  // A lone dot with exactly three digits behind it and something other than a
  // bare zero in front is how Portuguese writes a thousand. The same test is
  // deliberately NOT applied to the comma: a comma typed here is a decimal
  // point, and treating "1,500" as fifteen hundred would break the language
  // this app is written in to rescue the one it is not.
  if (decimal === '.' && dots === 1) {
    const fraction = cleaned.slice(lastDot + 1);
    if (fraction.length === 3 && Number(cleaned.slice(0, lastDot)) !== 0) decimal = null;
  }

  const digitsOnly = (part: string) => part.replace(/[.,]/g, '');
  const normalized =
    decimal === null
      ? digitsOnly(cleaned)
      : `${digitsOnly(cleaned.slice(0, decimal === ',' ? lastComma : lastDot))}.${cleaned.slice(
          (decimal === ',' ? lastComma : lastDot) + 1,
        )}`;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * The same number, as text a field can hold without lying to `parseTyped`.
 *
 * No grouping separator, ever: grouping is exactly the ambiguity this module
 * exists to remove, and a field is not a report. The decimal separator is the
 * one the person's language uses, so a Brazilian sees `2,5` and an American
 * sees `2.5` - and both come back as 2.5.
 */
export function formatTyped(value: number, formatting: string, maxDecimals = 4): string {
  return new Intl.NumberFormat(formatting, {
    useGrouping: false,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}
