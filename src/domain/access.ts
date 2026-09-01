/**
 * Who may do what.
 *
 * Foundation 6 of this project: permission is a CAPABILITY, never a screen.
 * Every buying company has a different org chart - one has a buyer who also
 * approves, another splits it in two - and with capabilities that is
 * configuration, while with screens it is new code every time.
 *
 * Two things this file deliberately does not do.
 *
 * It does not enforce anything. Enforcement lives where the data is: row level
 * security in Postgres, and the check that runs *before* the query on this
 * device. Hiding a control is decoration - the figure has to never arrive.
 *
 * And it does not say WHICH ROWS. A store manager sees the sale price "of their
 * store", a driver signs for deliveries "on their route": the capability says
 * what kind of thing they may do, the scope says which rows they may do it to.
 * Scope is the customer's own agreement record and the tenant policy on the
 * server, not a list in here.
 */

/**
 * The complete vocabulary, matching the server's `capability` enum value for
 * value - `agreement.test.ts` fails if the two ever drift.
 */
export const capabilities = [
  'view_cost',
  'view_sale_price',
  'record_production',
  'dispatch',
  'check_receipt',
  'record_loss',
  'place_order',
  'approve_order',
  'adjust_stock',
  'view_finance',
  'issue_invoice',
  'manage_company',
] as const;

export type Capability = (typeof capabilities)[number];

/**
 * The roles this product ships with, as a starting point rather than a cage.
 *
 * A role is a named bundle, and a company that needs a different bundle edits
 * the capabilities rather than waiting for a release. These seven come from the
 * product's own role table; the last two are outward-facing and only mean
 * something once orders exist.
 */
export type Role =
  | 'owner'
  | 'operator'
  | 'storeManager'
  | 'driver'
  | 'buyer'
  | 'customer'
  | 'salesperson';

/**
 * What each role can do.
 *
 * Read the absences as carefully as the presences. The factory operator has no
 * `view_cost` and no `view_sale_price`, and that is not distrust - it is that
 * the number is irrelevant to the job and its presence invites conversations
 * about margin on the factory floor. The driver may record a loss because a
 * pallet does fall off a truck, and refusing them the button is what turns a
 * real loss into unexplained shrinkage.
 */
export const ROLES: Record<Role, readonly Capability[]> = {
  /** Everything. There is always exactly one person who can do anything. */
  owner: capabilities,

  operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss'],

  storeManager: ['view_sale_price', 'check_receipt', 'record_loss', 'place_order'],

  driver: ['dispatch', 'check_receipt', 'record_loss'],

  /**
   * Buying is where money and cost meet, so this role sees both. It does not
   * produce, and it cannot change who works here.
   */
  buyer: [
    'view_cost',
    'view_sale_price',
    'check_receipt',
    'place_order',
    'approve_order',
    'adjust_stock',
    'view_finance',
  ],

  /** A customer of the factory, seeing only their own side of the deal. */
  customer: ['view_sale_price', 'check_receipt', 'place_order', 'view_finance'],

  /** Sells at the customer's price table, and never sees what it cost to make. */
  salesperson: ['view_sale_price', 'place_order', 'view_finance'],
};

export function capabilitiesFor(role: Role): ReadonlySet<Capability> {
  return new Set(ROLES[role]);
}

/**
 * The five acts no level of assistant autonomy performs without a person
 * saying yes - and a note about why they are listed as acts, not capabilities.
 *
 * The floor is: an inventory adjustment, a price change, a reversal, a
 * financial entry, and issuing an invoice. Only two of those have a capability
 * of their own today (`adjust_stock`, `issue_invoice`); a price change, a
 * reversal and a financial entry are things the app cannot yet do at all, so
 * naming a capability for them now would be inventing vocabulary for absent
 * features.
 *
 * They are written down anyway, because the floor is a promise made before the
 * features exist: whoever builds them inherits the rule rather than deciding it
 * again. Someone may hold `adjust_stock` and still be asked every single time -
 * this is not permission, it is the class of mistake that surfaces months later
 * in a margin nobody can explain.
 */
export const ALWAYS_CONFIRMED = [
  'adjustStock',
  'changePrice',
  'reverseMovement',
  'recordFinance',
  'issueInvoice',
] as const;

export type ConfirmedAct = (typeof ALWAYS_CONFIRMED)[number];

/** Whether an act may ever happen without a human saying yes. It may not. */
export function needsHumanYes(act: ConfirmedAct): boolean {
  return ALWAYS_CONFIRMED.includes(act);
}
