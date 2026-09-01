import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidHierarchy, type PackagingHierarchy } from './units';

/**
 * The packaging invariant, which was written down and never run.
 *
 * A hierarchy is what lets the app speak the operator's language - "1 crate, 4
 * boxes and 6 units" instead of 3,606. Every conversion in the product trusts
 * two things about it: the first tier is the base unit, and each tier is bigger
 * than the one before. Break either and the breakdown silently produces
 * nonsense that still looks like a quantity.
 */

const ok: PackagingHierarchy = {
  tiers: [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'box', perBaseUnit: 50 },
    { id: 'crate', perBaseUnit: 300 },
  ],
};

test('a hierarchy has to start at one and climb', () => {
  assert.equal(isValidHierarchy(ok), true);
});

test('a first tier that is not the base unit is refused', () => {
  // Everything downstream divides by the tier sizes assuming the smallest is 1.
  // Starting at 50 does not fail; it quietly multiplies every quantity by 50.
  assert.equal(
    isValidHierarchy({ tiers: [{ id: 'box', perBaseUnit: 50 }, { id: 'crate', perBaseUnit: 300 }] }),
    false,
  );
});

test('tiers out of order, or repeated, are refused', () => {
  assert.equal(
    isValidHierarchy({
      tiers: [
        { id: 'unit', perBaseUnit: 1 },
        { id: 'crate', perBaseUnit: 300 },
        { id: 'box', perBaseUnit: 50 },
      ],
    }),
    false,
  );

  // Equal is not "bigger than": two tiers of the same size make the breakdown
  // ambiguous, and it would pick one silently.
  assert.equal(
    isValidHierarchy({
      tiers: [
        { id: 'unit', perBaseUnit: 1 },
        { id: 'box', perBaseUnit: 50 },
        { id: 'pack', perBaseUnit: 50 },
      ],
    }),
    false,
  );
});

test('an empty hierarchy is refused rather than treated as "just units"', () => {
  // Defaulting to units here would let an item with no packaging answer
  // questions about boxes with a number that means nothing.
  assert.equal(isValidHierarchy({ tiers: [] }), false);
});
