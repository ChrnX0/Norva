import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALWAYS_CONFIRMED,
  capabilities,
  capabilitiesFor,
  needsHumanYes,
  ROLES,
  type Capability,
  type Role,
} from './access';

/**
 * The role table, pinned - because the absences are the product decision.
 *
 * Anyone can add a capability to a role by accident and nothing will look
 * wrong: the app simply shows one more number to one more person. These tests
 * exist so that widening a role is a deliberate act with a red suite in front
 * of it.
 */

const everyRole = Object.keys(ROLES) as Role[];

test('no role holds a permission the vocabulary does not have', () => {
  const known = new Set<string>(capabilities);
  for (const role of everyRole) {
    for (const capability of ROLES[role]) {
      assert.ok(known.has(capability), `${role} holds "${capability}", which is not a capability`);
    }
  }
});

test('every capability belongs to somebody', () => {
  // A permission no role can hold is a door with no key: it looks like a
  // feature in the enum and cannot be reached by any person in the product.
  const held = new Set<Capability>(everyRole.flatMap((role) => [...ROLES[role]]));
  const orphans = capabilities.filter((c) => !held.has(c));
  assert.deepEqual(orphans, []);
});

test('the factory floor never sees money', () => {
  // Not distrust. The number is irrelevant to making a popsicle, and its
  // presence starts conversations about margin on the factory floor. The
  // driver and the operator are the two roles that work inside the product all
  // day, and neither has a reason to know what anything costs.
  for (const role of ['operator', 'driver'] as Role[]) {
    const has = capabilitiesFor(role);
    assert.ok(!has.has('view_cost'), `${role} can see cost`);
    assert.ok(!has.has('view_sale_price'), `${role} can see the sale price`);
    assert.ok(!has.has('view_finance'), `${role} can see the money`);
  }
});

test('only the owner can change who works here', () => {
  const managers = everyRole.filter((role) => capabilitiesFor(role).has('manage_company'));
  assert.deepEqual(managers, ['owner']);
});

test('nobody outside the company sees what anything costs', () => {
  // A customer and an outside salesperson both see prices - the ones they pay
  // or sell at. Neither ever sees the cost, and for the salesperson that is
  // the whole design: commission is paid on margin and shown in reais, so the
  // discount hurts their own pocket without the cost ever being on screen.
  for (const role of ['customer', 'salesperson'] as Role[]) {
    assert.ok(!capabilitiesFor(role).has('view_cost'));
    assert.ok(capabilitiesFor(role).has('view_sale_price'));
  }
});

test('the owner can do everything, and is the only one who can', () => {
  assert.equal(capabilitiesFor('owner').size, capabilities.length);

  const others = everyRole.filter((r) => r !== 'owner');
  for (const role of others) {
    assert.ok(
      capabilitiesFor(role).size < capabilities.length,
      `${role} is a second owner by another name`,
    );
  }
});

test('the floor stands apart from permission, and stays whole', () => {
  // Holding `adjust_stock` does not mean adjusting stock silently. These five
  // acts are asked about every time, at any level of assistant autonomy,
  // because they are the mistakes that surface months later in a margin nobody
  // can explain.
  assert.equal(ALWAYS_CONFIRMED.length, 5);
  for (const act of ALWAYS_CONFIRMED) {
    assert.equal(needsHumanYes(act), true);
  }

  // And the buyer, who may adjust stock, is still asked.
  assert.ok(capabilitiesFor('buyer').has('adjust_stock'));
  assert.equal(needsHumanYes('adjustStock'), true);
});
