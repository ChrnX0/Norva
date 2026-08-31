/**
 * Packaging hierarchy.
 *
 * Stock is always stored in the smallest unit. The interface, however, speaks
 * the operator's language: nobody in a cold room thinks in "3,600 popsicles",
 * they think in "12 crates". So the UI lets them pick the tier they actually
 * use, and echoes the arithmetic back in full — eliminating mental math, which
 * is where miscounts come from.
 *
 * The hierarchy is generic on purpose. This app is meant to be sold: the next
 * customer may stack Unit -> Pack -> Bale instead of Unit -> Box -> Crate.
 */

export type PackagingTier = {
  /** Stable key. Labels come from i18n or from the customer's own wording. */
  id: string;
  /** How many of the *smallest* unit fit in one of this tier. */
  perBaseUnit: number;
};

export type PackagingHierarchy = {
  /** Ordered smallest-first. The first tier must always be 1. */
  tiers: PackagingTier[];
};

export function baseUnitTier(): PackagingTier {
  return { id: 'unit', perBaseUnit: 1 };
}

export function isValidHierarchy(h: PackagingHierarchy): boolean {
  if (h.tiers.length === 0) return false;
  if (h.tiers[0].perBaseUnit !== 1) return false;
  return h.tiers.every(
    (tier, i) => i === 0 || tier.perBaseUnit > h.tiers[i - 1].perBaseUnit,
  );
}

/** Converts a quantity expressed in a tier into base units. */
export function toBaseUnits(quantity: number, tier: PackagingTier): number {
  return Math.round(quantity * tier.perBaseUnit);
}

export type Breakdown = { tier: PackagingTier; quantity: number }[];

/**
 * Expresses a base-unit amount across the hierarchy, largest tier first, so the
 * UI can say "12 crates, 3 boxes and 8 loose" instead of a bare number.
 * Tiers that come out at zero are dropped.
 */
export function breakdown(baseUnits: number, h: PackagingHierarchy): Breakdown {
  let remaining = Math.max(0, Math.round(baseUnits));
  const out: Breakdown = [];

  for (const tier of [...h.tiers].reverse()) {
    const quantity = Math.floor(remaining / tier.perBaseUnit);
    if (quantity > 0) {
      out.push({ tier, quantity });
      remaining -= quantity * tier.perBaseUnit;
    }
  }
  return out;
}

/**
 * Rounds a production run up to fill whole containers.
 *
 * Producing 1,599 popsicles when a box holds 50 leaves 49 loose units that
 * nobody can ship cleanly. The system suggests 1,600 instead — the kind of
 * arithmetic the app should do so the operator never has to.
 */
export function roundUpToFullContainer(
  baseUnits: number,
  h: PackagingHierarchy,
  tierId?: string,
): { rounded: number; addedUnits: number; tier: PackagingTier | null } {
  const tier = tierId
    ? h.tiers.find((t) => t.id === tierId)
    : [...h.tiers].reverse().find((t) => t.perBaseUnit > 1);

  if (!tier || tier.perBaseUnit <= 1) {
    return { rounded: baseUnits, addedUnits: 0, tier: null };
  }

  const remainder = baseUnits % tier.perBaseUnit;
  if (remainder === 0) return { rounded: baseUnits, addedUnits: 0, tier };

  const addedUnits = tier.perBaseUnit - remainder;
  return { rounded: baseUnits + addedUnits, addedUnits, tier };
}
