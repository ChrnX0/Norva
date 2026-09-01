import { fromDecimal } from '@/domain/money';
import type { PackagingHierarchy } from '@/domain/units';
import { db } from './db';
import { recordPurchase, saveItem, saveProduct, saveRecipeVersion } from './repository';

/**
 * The company this device belongs to.
 *
 * One local company until sign-in lands; every row is already stamped with it,
 * so multi-company stops being a migration later and becomes a login.
 */
export const LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

const LOOSE: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };

const STACKED: PackagingHierarchy = {
  tiers: [
    { id: 'unit', perBaseUnit: 1 },
    { id: 'box', perBaseUnit: 50 },
    { id: 'crate', perBaseUnit: 300 },
  ],
};

/**
 * Starter data, written once into an empty database.
 *
 * It exists because the guided setup is a later phase, and an app that opens
 * onto nothing gives no one a reason to type the first sixty inputs. Every
 * number here arrives the way a real one would - through `recordPurchase`, the
 * same event that moves the moving average - so nothing in the app is looking
 * at figures that could not have come from an invoice.
 *
 * The "already ran" mark is a stored fact, not "the items table is empty".
 * Inferring it from emptiness would put the demo back the morning after
 * somebody deliberately wiped it, and an app that undoes your deletions is one
 * nobody trusts with anything else.
 */
export async function ensureStarterData(companyId = LOCAL_COMPANY_ID): Promise<void> {
  if (await hasSeeded()) return;
  await writeStarterData(companyId);
}

/** Puts the example back on purpose, after somebody cleared it. */
export async function restoreStarterData(companyId = LOCAL_COMPANY_ID): Promise<void> {
  await writeStarterData(companyId);
}

export async function hasSeeded(): Promise<boolean> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = 'seeded'`,
  );
  return row?.value === '1';
}

async function writeStarterData(companyId: string): Promise<void> {
  const conn = await db();

  // Never write over data that is already there, whatever the mark says.
  const existing = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM items WHERE company_id = ?`,
    [companyId],
  );
  if ((existing?.n ?? 0) > 0) {
    await markSeeded();
    return;
  }

  const input = (
    name: string,
    purchaseUnit: string,
    purchaseToBase: number,
    baseUnit: string,
  ) =>
    saveItem(companyId, {
      kind: 'input',
      name,
      purchaseUnit,
      purchaseToBase,
      baseUnit,
      packaging: LOOSE,
    });

  const packaging = (name: string, purchaseUnit: string, perPack: number) =>
    saveItem(companyId, {
      kind: 'packaging',
      name,
      purchaseUnit,
      purchaseToBase: perPack,
      baseUnit: 'un',
      packaging: LOOSE,
    });

  const [pulp, sugar, milkPowder, glucose] = await Promise.all([
    input('Polpa de morango', 'balde 10 kg', 10_000, 'g'),
    input('Açúcar cristal', 'saco 25 kg', 25_000, 'g'),
    input('Leite em pó', 'saco 25 kg', 25_000, 'g'),
    input('Glucose 38DE', 'balde 5 kg', 5_000, 'g'),
  ]);

  const [stick, wrapper] = await Promise.all([
    packaging('Palito de picolé', 'caixa 5.000', 5_000),
    packaging('Embalagem plástica', 'fardo 2.000', 2_000),
  ]);

  // Invoices, not typed-in prices. The average falls out of these.
  const buy = (itemId: string, packs: number, perPack: number, priceReais: number) =>
    recordPurchase(companyId, {
      itemId,
      supplierName: 'Fornecedor inicial',
      purchaseQuantity: packs,
      baseUnits: packs * perPack,
      totalCents: fromDecimal(priceReais),
    });

  await buy(pulp, 4, 10_000, 496);
  await buy(sugar, 2, 25_000, 236);
  await buy(milkPowder, 1, 25_000, 722.5);
  await buy(glucose, 2, 5_000, 98);
  await buy(stick, 2, 5_000, 200);
  await buy(wrapper, 3, 2_000, 180);

  const base = await saveRecipeVersion(companyId, {
    name: 'Base de creme',
    yieldAmount: 20_000,
    yieldUnit: 'ml',
    lossFraction: 0.02,
    lines: [
      { kind: 'item', itemId: milkPowder, quantity: 2_000 },
      { kind: 'item', itemId: sugar, quantity: 3_000 },
    ],
    note: 'Base compartilhada pelos sabores de creme.',
  });

  const strawberry = await saveRecipeVersion(companyId, {
    name: 'Picolé de morango',
    yieldAmount: 40_000,
    yieldUnit: 'ml',
    lossFraction: 0.05,
    lines: [
      { kind: 'item', itemId: pulp, quantity: 18_000 },
      { kind: 'item', itemId: sugar, quantity: 6_000 },
      { kind: 'item', itemId: glucose, quantity: 1_200 },
      { kind: 'recipe', recipeId: base.recipeId, quantity: 10_000 },
    ],
  });

  await saveProduct(companyId, {
    name: 'Picolé de morango',
    kind: 'product',
    recipeId: strawberry.recipeId,
    yieldPerUnit: 75,
    // Stick plus wrapper: packaging is a cost per unit, never per batch.
    unitPackagingCents: fromDecimal(0.05),
    packaging: STACKED,
  });

  await markSeeded();
}

async function markSeeded(): Promise<void> {
  const conn = await db();
  await conn.runAsync(
    `INSERT INTO app_meta (key, value) VALUES ('seeded', '1')
     ON CONFLICT(key) DO UPDATE SET value = '1'`,
  );
}
