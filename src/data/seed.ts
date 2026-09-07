import { fromDecimal, rate} from '@/domain/money';
import type { PackagingHierarchy } from '@/domain/units';
import { db } from './db';
import { empresaDaqui } from './empresa';
import { recordPurchase, saveItem, saveProduct, saveRecipeVersion } from './repository';

export const LOOSE: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };

export const STACKED: PackagingHierarchy = {
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
export async function ensureStarterData(companyId = empresaDaqui()): Promise<void> {
  if (await hasSeeded()) return;
  await writeStarterData(companyId);
}

/** Puts the example back on purpose, after somebody cleared it. */
export async function restoreStarterData(companyId = empresaDaqui()): Promise<void> {
  await writeStarterData(companyId);
}

/**
 * Se o exemplo AINDA está aqui — que é outra pergunta que `hasSeeded`.
 *
 * A tela de Ajustes acendia "Inclui os dados de exemplo" pela marca `seeded`, e
 * a marca nunca é apagada: `app_meta` não é tabela apagável. Então o selo era
 * verdadeiro em todo aparelho para sempre — apagava-se tudo, cadastrava-se o
 * primeiro insumo próprio, e a tela continuava dizendo que a lista incluía o
 * exemplo. Contava uma variável ("o exemplo já foi escrito alguma vez") e
 * nomeava outra ("o que está abaixo contém o exemplo").
 *
 * A presença se sabe porque a semeadura anota os ids que criou. Sem a anotação
 * — instalação que já tinha dado quando a marca foi posta — a resposta é não,
 * que é o certo: ali o exemplo de fato não foi escrito.
 */
export async function exampleStillHere(companyId = empresaDaqui()): Promise<boolean> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = 'seeded_items'`,
  );
  if (!row?.value) return false;

  let ids: unknown;
  try {
    ids = JSON.parse(row.value);
  } catch {
    return false;
  }
  if (!Array.isArray(ids) || ids.length === 0) return false;

  const marcas = ids.filter((id): id is string => typeof id === 'string');
  if (marcas.length === 0) return false;

  const found = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM items
      WHERE company_id = ? AND id IN (${marcas.map(() => '?').join(', ')})`,
    [companyId, ...marcas],
  );
  return (found?.n ?? 0) > 0;
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

  // Written one at a time, not with Promise.all. There is a single SQLite
  // connection behind all of this and each write opens a transaction, so
  // running them together is not faster - it is an error.
  const pulp = await input('Polpa de morango', 'balde 10 kg', 10_000, 'g');
  const sugar = await input('Açúcar cristal', 'saco 25 kg', 25_000, 'g');
  const milkPowder = await input('Leite em pó', 'saco 25 kg', 25_000, 'g');
  const glucose = await input('Glucose 38DE', 'balde 5 kg', 5_000, 'g');

  const stick = await packaging('Palito de picolé', 'caixa 5.000', 5_000);
  const wrapper = await packaging('Embalagem plástica', 'fardo 2.000', 2_000);

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
    /**
     * A embalagem por LISTA, e não por taxa fixa — e isto era um defeito do
     * próprio exemplo, medido em 6 de setembro.
     *
     * O seed comprava palito e embalagem, cobrava cinco centavos por unidade como
     * `unitPackagingRate`, e deixava `packagingItems` vazia. O dinheiro ficava
     * certo (a taxa congelada carregava a embalagem) e **o estoque mentia: o
     * palito só subia, corrida após corrida** — que é palavra por palavra a
     * cicatriz descrita em `repository.ts`, no laço que existe para consertá-la.
     * O exemplo demonstrava o defeito que o código conserta.
     *
     * Com a lista, tudo o que já existe atravessa: a trava de estoque recusa a
     * corrida sem palito, o valor consumido entra na taxa congelada pelo mesmo
     * caminho dos outros insumos, e o movimento sai com a mesma taxa deles.
     *
     * E a taxa fixa vai a ZERO junto, senão a embalagem entraria duas vezes no
     * custo — uma pelo consumo e outra pela taxa. Um picolé, um palito, uma
     * embalagem: rendimento não devolve palito, e é por isso que a lista conta
     * por unidade produzida e não por tacho.
     */
    packagingItems: [
      { itemId: stick, quantityPerUnit: 1 },
      { itemId: wrapper, quantityPerUnit: 1 },
    ],
    unitPackagingRate: rate(0, 1),
    packaging: STACKED,
  });

  // Os ids que esta semeadura criou, para a tela poder dizer se o exemplo AINDA
  // está aqui em vez de afirmar para sempre que está.
  await markSeededItems([pulp, sugar, milkPowder, glucose, stick, wrapper]);
  await markSeeded();
}

async function markSeededItems(ids: string[]): Promise<void> {
  const conn = await db();
  await conn.runAsync(
    `INSERT INTO app_meta (key, value) VALUES ('seeded_items', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(ids)],
  );
}

async function markSeeded(): Promise<void> {
  const conn = await db();
  await conn.runAsync(
    `INSERT INTO app_meta (key, value) VALUES ('seeded', '1')
     ON CONFLICT(key) DO UPDATE SET value = '1'`,
  );
}
