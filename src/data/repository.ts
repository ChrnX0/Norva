import { applyCostEvent, type StockCostState } from '@/domain/cost';
import { amountOf, cents, rate, type Cents, type Rate } from '@/domain/money';
import { daysOfCover } from '@/domain/ledger';
import { expiresOn, lotCode } from '@/domain/lot';
import type { LossReason } from '@/domain/ledger';
import { explodeRequirements } from '@/domain/recipe';
import type { ItemCosts, Recipe, RecipeLine } from '@/domain/recipe';
import type { PackagingHierarchy } from '@/domain/units';
import { db, newId, nowIso, type Db } from './db';
import { readMeta, writeMeta } from './meta';
import { enqueue } from './outbox';
import {
  blockerFor,
  EraseBlockedError,
  emptyCounts,
  itemKindsFor,
  tablesFor,
  type EraseArea,
  type EraseCounts,
} from './erase';

/**
 * Every query the app needs, in one place.
 *
 * The screens call these functions, and when the assistant lands it will call
 * *these same functions* rather than writing SQL of its own. An assistant with
 * a second query path eventually reports a different number than the screen
 * showing the same thing, and the app loses its credibility in a single day.
 */

export type ItemKind = 'input' | 'packaging' | 'product' | 'resale' | 'store_supply';

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;
  /** What the buyer holds: "25kg sack". */
  purchaseUnit: string | null;
  /** Base units inside one purchase unit. 25000 g in a 25 kg sack. */
  purchaseToBase: number | null;
  baseUnit: string;
  packaging: PackagingHierarchy;
};

export type ItemWithCost = Item & {
  averageRate: Rate;
  lastRate: Rate | null;
  onHandBaseUnits: number;
  /** False once it is out of circulation: kept for history, hidden from pickers. */
  active: boolean;
};

const DEFAULT_PACKAGING: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };

function parsePackaging(json: string): PackagingHierarchy {
  try {
    const tiers = JSON.parse(json);
    return Array.isArray(tiers) && tiers.length > 0 ? { tiers } : DEFAULT_PACKAGING;
  } catch {
    return DEFAULT_PACKAGING;
  }
}

// --- items -----------------------------------------------------------------

export async function listItems(
  companyId: string,
  kind?: ItemKind,
  /** Deactivated items are excluded unless a screen is explicitly showing them. */
  includeInactive = false,
): Promise<ItemWithCost[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    kind: ItemKind;
    name: string;
    purchase_unit: string | null;
    purchase_to_base: number | null;
    base_unit: string;
    packaging: string;
    active: number;
    average_rate: number | null;
    last_rate: number | null;
    on_hand_base_units: number | null;
  }>(
    `SELECT i.id, i.kind, i.name, i.purchase_unit, i.purchase_to_base, i.base_unit, i.packaging,
            i.active, c.average_rate, c.last_rate,
            (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = i.company_id AND m.item_id = i.id)
              AS on_hand_base_units
       FROM items i
       LEFT JOIN item_costs c ON c.item_id = i.id
      WHERE i.company_id = ?
        AND (? = 1 OR i.active = 1)
        AND (? IS NULL OR i.kind = ?)
      ORDER BY i.name COLLATE NOCASE`,
    [companyId, includeInactive ? 1 : 0, kind ?? null, kind ?? null],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    purchaseUnit: r.purchase_unit,
    purchaseToBase: r.purchase_to_base,
    baseUnit: r.base_unit,
    packaging: parsePackaging(r.packaging),
    active: r.active === 1,
    averageRate: (r.average_rate ?? 0) as Rate,
    lastRate: r.last_rate === null || r.last_rate === undefined ? null : (r.last_rate as Rate),
    onHandBaseUnits: r.on_hand_base_units ?? 0,
  }));
}

export async function saveItem(
  companyId: string,
  item: Omit<Item, 'id'> & { id?: string },
): Promise<string> {
  const conn = await db();
  let id = '';
  await conn.withTransactionAsync(async () => {
    id = await writeItem(conn, companyId, item);
  });
  return id;
}

/**
 * The write itself, without opening a transaction.
 *
 * Split out because `saveProduct` writes an item and a product together and
 * they have to land as one thing. SQLite has no nested transactions, so the
 * transaction belongs to the public function and the private one joins it.
 */
async function writeItem(
  conn: Db,
  companyId: string,
  item: Omit<Item, 'id'> & { id?: string },
): Promise<string> {
  const id = item.id ?? newId();

  await conn.runAsync(
    `INSERT INTO items (id, company_id, kind, name, purchase_unit, purchase_to_base,
                        base_unit, packaging, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       name = excluded.name,
       purchase_unit = excluded.purchase_unit,
       purchase_to_base = excluded.purchase_to_base,
       base_unit = excluded.base_unit,
       packaging = excluded.packaging`,
    [
      id,
      companyId,
      item.kind,
      item.name,
      item.purchaseUnit,
      item.purchaseToBase,
      item.baseUnit,
      JSON.stringify(item.packaging.tiers),
      nowIso(),
    ],
  );

  await enqueue(conn, [{ table: 'items', rowId: id }]);

  return id;
}

/** Cost of every item, in the shape the recipe engine expects. */
export async function itemCosts(companyId: string): Promise<ItemCosts> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ item_id: string; average_rate: number }>(
    `SELECT item_id, average_rate FROM item_costs WHERE company_id = ?`,
    [companyId],
  );
  return Object.fromEntries(rows.map((r) => [r.item_id, r.average_rate as Rate]));
}

// --- purchases: the event that moves the cost -------------------------------

/**
 * Records a purchase line and moves the moving average in the same step.
 *
 * This is the whole point of the design: nobody "updates the price of sugar" as
 * a task. They enter what they paid, and every recipe using sugar recalculates
 * while the price history writes itself.
 */
export async function recordPurchase(
  companyId: string,
  input: {
    itemId: string;
    supplierName?: string;
    /** What the buyer typed: 8 sacks. */
    purchaseQuantity: number;
    /** Converted on the way in, so storage only ever sees base units. */
    baseUnits: number;
    totalCents: Cents;
    orderedAt?: string;
    /**
     * Quando a nota entrou de verdade, se não foi agora.
     *
     * Nota de compra chega atrasada: o caminhão descarrega às sete e alguém
     * digita ao meio-dia, ou no dia seguinte. O livro-razão guarda os dois
     * fatos separados desde a V3 - `occurred_at` é quando aconteceu,
     * `recorded_at` é quando o aparelho soube -, e até agora esta função
     * escrevia o mesmo instante nos dois, o que fazia toda compra parecer ter
     * acontecido na hora da digitação. O histórico de custo herda a mesma data,
     * senão a alta apareceria no dia errado da home.
     */
    occurredAt?: string;
    /**
     * The phrase somebody said, when this came from the assistant.
     *
     * The plan's own condition for letting an assistant write at all: every
     * movement it creates is marked as such, with the words that created it. A
     * ledger that cannot say "this one came from a sentence" makes autonomy
     * unauditable, and unauditable autonomy is what people stop trusting.
     * Null when a person filled the screen themselves.
     */
    assistantPhrase?: string;
  },
): Promise<{ previousRate: Rate | null; newRate: Rate }> {
  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;

  const current = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );

  // How much is on hand is a question for the ledger, never for a stored
  // total. The moving average needs the quantity it is averaging over, and
  // taking it from the movements is what keeps the cost and the balance
  // answering to one history instead of drifting apart.
  const held = await conn.getFirstAsync<{ base_units: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS base_units
       FROM movements WHERE company_id = ? AND item_id = ?`,
    [companyId, input.itemId],
  );

  const before: StockCostState = {
    baseUnits: held?.base_units ?? 0,
    averageRate: (current?.average_rate ?? 0) as Rate,
  };

  // The same function the tests cover and the assistant will call.
  const after = applyCostEvent(before, {
    kind: 'purchase',
    baseUnits: input.baseUnits,
    totalCents: input.totalCents,
    at,
  });

  // Five rows describe one event, so they land together or not at all. A
  // purchase that recorded its invoice and not its cost would leave a price
  // history with a hole in it that nothing could reconstruct.
  const purchaseId = newId();
  // The line and the movement it causes share one id, because they are one
  // fact seen twice. Replaying the queue cannot post the arrival again.
  const lineId = newId();

  await conn.withTransactionAsync(async () => {
    // Inside the transaction: a place that exists only because a purchase was
    // attempted, and the purchase then failed, would be a row nobody asked for.
    const locationId = await ensureLocation(conn, companyId);

    await conn.runAsync(
      `INSERT INTO purchases (id, company_id, supplier_name, ordered_at, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [purchaseId, companyId, input.supplierName ?? null, input.orderedAt ?? null, at, at],
    );

    await conn.runAsync(
      `INSERT INTO purchase_lines (id, company_id, purchase_id, item_id, purchase_quantity,
                                   base_units, total_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        companyId,
        purchaseId,
        input.itemId,
        input.purchaseQuantity,
        input.baseUnits,
        input.totalCents,
        at,
      ],
    );

    const lineRate = rate(input.totalCents / 100, input.baseUnits);

    // The arrival itself, in the ledger, with what it cost frozen onto it. A
    // sugar price change in March must not rewrite what January cost.
    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate, assistant_phrase)
       VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        companyId,
        occurred,
        at,
        input.itemId,
        input.baseUnits,
        locationId,
        lineRate,
        input.assistantPhrase ?? null,
      ],
    );

    await conn.runAsync(
      `INSERT INTO item_costs (item_id, company_id, average_rate, last_rate, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         average_rate = excluded.average_rate,
         last_rate = excluded.last_rate,
         updated_at = excluded.updated_at`,
      [input.itemId, companyId, after.averageRate, lineRate, at],
    );

    await conn.runAsync(
      `INSERT INTO item_cost_history (id, company_id, item_id, previous_rate, new_rate, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), companyId, input.itemId, before.averageRate || null, after.averageRate, occurred],
    );

    // The line matters as much as its header, and for a reason beyond
    // completeness: the server's `apply_purchase_to_cost` trigger fires on an
    // insert into `purchase_lines`. Without it the invoice replays as an empty
    // header, and the authoritative cost and price history are never written.
    // `item_costs` is not queued, and that omission is the design.
    //
    // The average is derived, and a derived number gets one author. This device
    // computes its own so it can show a cost with no signal; the server
    // computes its own from these very lines, by the same rule. Sending both
    // gives the figure two authors and they disagree - replaying the queue put
    // the server at 0.5605 where the phone said 0.5310, because the queue
    // carries row ids and resends whatever the row says *now*.
    //
    // What travels is the invoice. The average is what each side concludes.
    await enqueue(conn, [
      { table: 'purchases', rowId: purchaseId },
      { table: 'purchase_lines', rowId: lineId },
      { table: 'movements', rowId: lineId },
    ]);
  });

  return {
    previousRate: before.averageRate > 0 ? before.averageRate : null,
    newRate: after.averageRate,
  };
}

// --- counting what is really on the shelf ------------------------------------

export type CountResult = {
  /** What the ledger believed before anybody walked to the shelf. */
  expectedBaseUnits: number;
  countedBaseUnits: number;
  /** Signed. Negative means less was there than the ledger thought. */
  deltaBaseUnits: number;
  /** What that difference is worth, at the item's average cost. */
  deltaCents: Cents;
};

export type MovementRow = {
  id: string;
  kind: string;
  /** Signed, in base units: positive arrived, negative left. */
  baseUnits: number;
  /** What one base unit was worth when it moved, frozen. */
  unitCostRate: Rate | null;
  note: string | null;
  occurredAt: string;
};

/**
 * The company's one place to keep things, created the first time something
 * moves.
 *
 * A movement has to happen somewhere. That is not ceremony: it is what makes
 * "how much is in the cold room" answerable later without going back and
 * rewriting history that was recorded without a place. Phase 1 has a single
 * storeroom and no screen to name a second, so the default carries the
 * company's own id - deterministic, so two phones that create it in the same
 * minute create one row rather than two.
 */
export type LocationBalance = {
  locationId: string;
  /** How the people there call it. Empty on the default place, which no screen names yet. */
  locationName: string;
  kind: string;
  baseUnits: number;
};

/**
 * Quanto tem de um item em cada lugar.
 *
 * A mesma aritmética da view `stock_balances` do servidor, de propósito
 * (`0001_foundation.sql:253-260`): as duas pontas respondem "quanto tem aqui"
 * pela mesma soma, que é o que a checagem 6 da `db:verify` compara.
 *
 * O total por empresa continua onde estava, em `listItems`, e não muda uma
 * linha: enquanto existe um lugar só, a soma de um é igual à soma de todos.
 * Local vira `GROUP BY`, nunca um `WHERE` obrigatório — a tela que quer o total
 * não passa a precisar saber de lugar nenhum.
 *
 * Devolve os lugares que têm movimento, e não todos os cadastrados: um lugar
 * onde nunca entrou nada não tem saldo zero, não tem saldo. A diferença
 * importa numa tela — "0 kg" convida a conferir, uma ausência não.
 */
export async function balanceByLocation(
  companyId: string,
  itemId: string,
): Promise<LocationBalance[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    location_id: string;
    name: string;
    kind: string;
    base_units: number;
  }>(
    `SELECT m.location_id, l.name, l.kind, SUM(m.quantity_base_units) AS base_units
       FROM movements m
       JOIN locations l ON l.id = m.location_id
      WHERE m.company_id = ? AND m.item_id = ?
      GROUP BY m.location_id, l.name, l.kind
      ORDER BY l.kind, l.name`,
    [companyId, itemId],
  );

  return rows.map((r) => ({
    locationId: r.location_id,
    locationName: r.name,
    kind: r.kind,
    baseUnits: r.base_units,
  }));
}

export type Place = {
  id: string;
  name: string;
  kind: string;
  /** Verdadeiro só para o lugar que nasceu junto com a empresa. */
  isDefault: boolean;
};

/**
 * Os lugares cadastrados, incluindo o que nasceu sem nome.
 *
 * O padrão é gravado com `name` vazio de propósito, e continua assim: o nome
 * dele é uma palavra em três idiomas, e essa palavra é da tela. Aqui devolve-se
 * o fato — string vazia e `isDefault` — e quem fala português é quem desenha.
 */
export async function listPlaces(companyId: string): Promise<Place[]> {
  const conn = await db();
  await ensureLocation(conn, companyId);
  const rows = await conn.getAllAsync<{ id: string; name: string; kind: string }>(
    `SELECT id, name, kind FROM locations WHERE company_id = ? ORDER BY kind, name`,
    [companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    isDefault: r.id === defaultLocationId(companyId),
  }));
}

/**
 * Cadastra ou renomeia um lugar.
 *
 * Renomear é seguro sem cerimônia nenhuma, e é por causa da fundação: o saldo é
 * a soma dos movimentos, e nenhum movimento carrega o nome do lugar - carrega o
 * id. Trocar "Loja Centro" por "Loja da Praça" não move um centavo, exatamente
 * como corrigir o nome de um insumo já não movia.
 */
export async function savePlace(
  companyId: string,
  input: { id?: string; name: string; kind: string },
): Promise<Place> {
  const name = input.name.trim();
  if (!name) throw new Error('um lugar sem nome não se distingue de outro');

  const conn = await db();
  const id = input.id ?? newId();

  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO locations (id, company_id, name, kind, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind`,
      [id, companyId, name, input.kind, nowIso()],
    );
    await enqueue(conn, [{ table: 'locations', rowId: id }]);
  });

  return { id, name, kind: input.kind, isDefault: id === defaultLocationId(companyId) };
}

/**
 * Quanto foi da última vez, para o campo não nascer vazio.
 *
 * Lei 1: não se pergunta o que o sistema pode deduzir, e Lei 2: nenhum campo
 * nasce vazio. A primeira remessa de um produto para uma loja não tem palpite
 * nenhum, e é honesto que não tenha - mas da segunda em diante o livro-razão já
 * sabe, e quem carrega a caixa confirma em vez de digitar.
 *
 * Lê a perna de **entrada** no destino, e não a saída na origem, porque é a
 * quantidade que aquela loja recebeu que responde "quanto costuma ir para lá".
 */
export async function lastSentBaseUnits(
  companyId: string,
  itemId: string,
  toLocationId: string,
): Promise<number | null> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ q: number }>(
    `SELECT quantity_base_units AS q FROM movements
      WHERE company_id = ? AND item_id = ? AND location_id = ?
        AND kind = 'transfer' AND quantity_base_units > 0
      ORDER BY occurred_at DESC, recorded_at DESC LIMIT 1`,
    [companyId, itemId, toLocationId],
  );
  return row?.q ?? null;
}

export type PlaceStock = {
  locationId: string;
  locationName: string;
  kind: string;
  /** Quanto vale tudo o que está ali, somado uma vez só, no fim. */
  valueCents: Cents;
  lines: {
    itemId: string;
    name: string;
    baseUnits: number;
    baseUnit: string;
    valueCents: Cents;
  }[];
};

/**
 * O saldo de cada lugar, item por item.
 *
 * A mesma soma de `balanceByLocation`, sem o `WHERE` do item: uma tela que
 * pergunta "o que tem na Loja Centro" e uma que pergunta "onde está o açúcar"
 * são a mesma aritmética lida por dois eixos, e ter duas aritméticas seria ter
 * duas verdades.
 *
 * Linha de saldo zero não aparece. Um item que entrou e saiu inteiro não está
 * ali, e listá-lo como "0 g" enche a tela de coisa que não está lá - o que é
 * pior que inútil numa tela cujo trabalho é dizer o que tem.
 */
export async function stockByPlace(companyId: string): Promise<PlaceStock[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    location_id: string;
    location_name: string;
    kind: string;
    item_id: string;
    item_name: string;
    base_unit: string;
    base_units: number;
    rate: number | null;
  }>(
    `SELECT m.location_id, l.name AS location_name, l.kind,
            m.item_id, i.name AS item_name, i.base_unit,
            SUM(m.quantity_base_units) AS base_units,
            c.average_rate AS rate
       FROM movements m
       JOIN locations l ON l.id = m.location_id
       JOIN items i ON i.id = m.item_id
       LEFT JOIN item_costs c ON c.item_id = m.item_id
      WHERE m.company_id = ?
      GROUP BY m.location_id, l.name, l.kind, m.item_id, i.name, i.packaging, i.base_unit, c.average_rate
     HAVING SUM(m.quantity_base_units) <> 0
      ORDER BY l.kind, l.name, i.name`,
    [companyId],
  );

  const byPlace = new Map<string, PlaceStock>();
  for (const r of rows) {
    let place = byPlace.get(r.location_id);
    if (!place) {
      place = {
        locationId: r.location_id,
        locationName: r.location_name,
        kind: r.kind,
        valueCents: cents(0),
        lines: [],
      };
      byPlace.set(r.location_id, place);
    }
    // Taxa fracionária vezes quantidade, arredondada aqui e só aqui.
    const value = cents((r.rate ?? 0) * r.base_units);
    place.lines.push({
      itemId: r.item_id,
      name: r.item_name,
      baseUnits: r.base_units,
      baseUnit: r.base_unit,
      valueCents: value,
    });
    place.valueCents = cents(place.valueCents + value);
  }

  return [...byPlace.values()];
}

/**
 * O lugar que existe desde sempre, nomeável pelo chamador.
 *
 * Enquanto há um lugar só, o id dele é o da própria empresa - foi assim que
 * todo movimento já gravado foi carimbado. Expor isto é o que permite exigir
 * `locationId` de quem conta sem obrigar cada tela a saber desse detalhe.
 */
export function defaultLocationId(companyId: string): string {
  return companyId;
}

async function ensureLocation(conn: Db, companyId: string): Promise<string> {
  const existing = await conn.getFirstAsync<{ id: string }>(
    `SELECT id FROM locations WHERE id = ?`,
    [companyId],
  );
  if (existing) return existing.id;

  await conn.runAsync(
    `INSERT INTO locations (id, company_id, name, kind, created_at)
     VALUES (?, ?, '', 'store_room', ?)`,
    [companyId, companyId, nowIso()],
  );
  // It has to reach the server before the movement that stands on it does, or
  // the first sync fails a foreign key on a row nobody knew was missing. It
  // queues once, on the day the first thing moves, and never again.
  await enqueue(conn, [{ table: 'locations', rowId: companyId }]);

  return companyId;
}

/**
 * Records a physical count.
 *
 * Until this existed a balance in this app could only rise. Purchases added and
 * nothing ever took away, so "how much sugar do I have" was right exactly once,
 * on the morning the sack arrived. A storeroom number that only grows is worse
 * than no number at all, because people believe it.
 *
 * The count does not overwrite the balance - nothing here overwrites a balance.
 * It appends the difference as its own movement, so the shelf and the ledger
 * agree from this moment on while the disagreement stays on the record. That is
 * what turns "we keep losing sugar" from a feeling into a question the data can
 * answer.
 *
 * A count that finds exactly what was expected is written too, with a
 * difference of zero. Somebody looked, and the storeroom was right: that is
 * information. Discarding it would leave a shelf nobody has checked in months
 * indistinguishable from one verified this morning.
 */
export async function recordCount(
  companyId: string,
  input: {
    itemId: string;
    countedBaseUnits: number;
    note?: string;
    /**
     * The phrase somebody said, when this came from the assistant.
     *
     * The plan's own condition for letting an assistant write at all: every
     * movement it creates is marked as such, with the words that created it. A
     * ledger that cannot say "this one came from a sentence" makes autonomy
     * unauditable, and unauditable autonomy is what people stop trusting.
     * Null when a person filled the screen themselves.
     */
    assistantPhrase?: string;

    /** Defaults to now. A count written on paper in a cold room keeps its hour. */
    occurredAt?: string;

    /**
     * Which shelf was counted. Required, and deliberately without a default.
     *
     * A count is the one figure that comes from somebody standing in front of
     * the goods, so it belongs to a place. With a default, counting the cold
     * room without saying so would compare against the company's whole balance
     * and write the difference into the cold room - stock teleported between
     * rooms by an operator who did everything right. The rule of this project
     * is that the error is prevented, not complained about: the caller says
     * where, or it does not compile.
     */
    locationId: string;
  },
): Promise<CountResult> {
  const conn = await db();
  const at = nowIso();

  const held = await conn.getFirstAsync<{ base_units: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS base_units
       FROM movements WHERE company_id = ? AND item_id = ? AND location_id = ?`,
    [companyId, input.itemId, input.locationId],
  );
  const cost = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );

  const expected = held?.base_units ?? 0;
  const counted = Math.round(input.countedBaseUnits);
  const averageRate = (cost?.average_rate ?? 0) as Rate;
  const delta = counted - expected;

  const id = newId();

  await conn.withTransactionAsync(async () => {
    // The place still has to exist as a row before a movement can point at it.
    await ensureLocation(conn, companyId);
    const locationId = input.locationId;

    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate, note,
                              assistant_phrase)
       VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        input.occurredAt ?? at,
        at,
        input.itemId,
        delta,
        locationId,
        averageRate || null,
        input.note ?? null,
        input.assistantPhrase ?? null,
      ],
    );
    await enqueue(conn, [{ table: 'movements', rowId: id }]);
  });

  return {
    expectedBaseUnits: expected,
    countedBaseUnits: counted,
    deltaBaseUnits: delta,
    deltaCents: amountOf(averageRate, delta),
  };
}

/**
 * The movements behind one item's balance, newest first.
 *
 * This is the `[por quê?]` of a stock figure. A number the person cannot open
 * is a number they have to take on faith, and faith is exactly what an app
 * asking someone to change how they run their factory has not earned yet.
 */
export async function itemMovements(
  companyId: string,
  itemId: string,
  limit = 20,
): Promise<MovementRow[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    kind: string;
    quantity_base_units: number;
    unit_cost_rate: number | null;
    note: string | null;
    occurred_at: string;
  }>(
    `SELECT id, kind, quantity_base_units, unit_cost_rate, note, occurred_at
       FROM movements
      WHERE company_id = ? AND item_id = ?
      ORDER BY occurred_at DESC, rowid DESC
      LIMIT ?`,
    [companyId, itemId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    baseUnits: r.quantity_base_units,
    unitCostRate: r.unit_cost_rate === null ? null : (r.unit_cost_rate as Rate),
    note: r.note,
    occurredAt: r.occurred_at,
  }));
}

// --- recipes ----------------------------------------------------------------

export type RecipeSummary = { id: string; name: string; yieldAmount: number; yieldUnit: string };

export async function listRecipes(companyId: string): Promise<RecipeSummary[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    name: string;
    yield_amount: number;
    yield_unit: string;
  }>(
    `SELECT id, name, yield_amount, yield_unit FROM recipes
      WHERE company_id = ? AND active = 1 ORDER BY name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    yieldAmount: r.yield_amount,
    yieldUnit: r.yield_unit,
  }));
}

/**
 * Loads every recipe at its newest version, keyed by id - the shape
 * `costRecipe` walks. Loading them all at once is what lets a sub-recipe
 * resolve without a second round trip mid-calculation.
 */
export async function loadRecipeGraph(companyId: string): Promise<Record<string, Recipe>> {
  const conn = await db();

  const versions = await conn.getAllAsync<{
    id: string;
    recipe_id: string;
    version: number;
    effective_from: string;
    loss_fraction: number;
    yield_amount: number;
  }>(
    `SELECT v.id, v.recipe_id, v.version, v.effective_from, v.loss_fraction, r.yield_amount
       FROM recipe_versions v
       JOIN recipes r ON r.id = v.recipe_id
      WHERE v.company_id = ?
        AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2 WHERE v2.recipe_id = v.recipe_id)`,
    [companyId],
  );

  if (versions.length === 0) return {};

  const lines = await conn.getAllAsync<{
    recipe_version_id: string;
    item_id: string | null;
    sub_recipe_id: string | null;
    quantity: number;
  }>(
    `SELECT recipe_version_id, item_id, sub_recipe_id, quantity
       FROM recipe_lines WHERE company_id = ? ORDER BY position`,
    [companyId],
  );

  const byVersion = new Map<string, RecipeLine[]>();
  for (const line of lines) {
    const list = byVersion.get(line.recipe_version_id) ?? [];
    list.push(
      line.item_id
        ? { kind: 'item', itemId: line.item_id, quantity: line.quantity }
        : { kind: 'recipe', recipeId: line.sub_recipe_id!, quantity: line.quantity },
    );
    byVersion.set(line.recipe_version_id, list);
  }

  return Object.fromEntries(
    versions.map((v) => [
      v.recipe_id,
      {
        id: v.recipe_id,
        versionId: v.id,
        version: v.version,
        effectiveFrom: v.effective_from,
        yieldAmount: v.yield_amount,
        lossFraction: v.loss_fraction,
        lines: byVersion.get(v.id) ?? [],
      } satisfies Recipe,
    ]),
  );
}

/**
 * Saves a recipe as a NEW version rather than editing the old one.
 *
 * Versions are never overwritten: a production run records which version it
 * used, so changing the formula today must not rewrite what last year's batches
 * cost.
 */
export async function saveRecipeVersion(
  companyId: string,
  input: {
    recipeId?: string;
    name: string;
    yieldAmount: number;
    yieldUnit: string;
    lossFraction: number;
    lines: RecipeLine[];
    note?: string;
  },
): Promise<{ recipeId: string; version: number }> {
  const conn = await db();
  const at = nowIso();
  const recipeId = input.recipeId ?? newId();
  const versionId = newId();
  const lineIds: string[] = [];
  let version = 1;

  // A version without its lines is a recipe that costs nothing, which is worse
  // than no version at all - so the whole thing is one transaction.
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO recipes (id, company_id, name, yield_amount, yield_unit, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         yield_amount = excluded.yield_amount,
         yield_unit = excluded.yield_unit`,
      [recipeId, companyId, input.name, input.yieldAmount, input.yieldUnit, at],
    );

    const previous = await conn.getFirstAsync<{ v: number }>(
      `SELECT MAX(version) AS v FROM recipe_versions WHERE recipe_id = ?`,
      [recipeId],
    );
    version = (previous?.v ?? 0) + 1;

    await conn.runAsync(
      `INSERT INTO recipe_versions (id, company_id, recipe_id, version, effective_from,
                                    loss_fraction, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        companyId,
        recipeId,
        version,
        at.slice(0, 10),
        input.lossFraction,
        input.note ?? null,
        at,
      ],
    );

    for (const [position, line] of input.lines.entries()) {
      const lineId = newId();
      lineIds.push(lineId);

      await conn.runAsync(
        `INSERT INTO recipe_lines (id, company_id, recipe_version_id, item_id, sub_recipe_id,
                                   quantity, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId,
          companyId,
          versionId,
          line.kind === 'item' ? line.itemId : null,
          line.kind === 'recipe' ? line.recipeId : null,
          line.quantity,
          position,
        ],
      );
    }

    // The lines go with the version, in order, after it. A version that
    // arrives without them is a recipe that costs nothing on the other device,
    // which is worse than one that has not arrived at all.
    await enqueue(conn, [
      { table: 'recipes', rowId: recipeId },
      { table: 'recipe_versions', rowId: versionId },
      ...lineIds.map((id) => ({ table: 'recipe_lines', rowId: id })),
    ]);
  });

  return { recipeId, version };
}

/** Names for every item and recipe, so a cost breakdown reads in words. */
export async function labels(companyId: string): Promise<Record<string, string>> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ id: string; name: string }>(
    `SELECT id, name FROM items WHERE company_id = ?
     UNION ALL
     SELECT id, name FROM recipes WHERE company_id = ?`,
    [companyId, companyId],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Converts what the buyer typed into base units, using the item's own factor. */
export function purchaseToBaseUnits(item: Item, purchaseQuantity: number): number {
  const factor = item.purchaseToBase ?? 1;
  return Math.round(purchaseQuantity * factor);
}

export { cents };

// --- products ---------------------------------------------------------------

export type ProductionResult = {
  /** O lote que esta corrida criou: o código que vai na etiqueta e a validade. */
  lot: { id: string; code: string; expiresOn: string | null };
  /** O que amarra as linhas deste ato. */
  groupId: string;
  unitsProduced: number;
  /** Custo congelado do produto, por unidade, em taxa fracionária. */
  unitCostRate: Rate;
  consumed: { itemId: string; baseUnits: number; rate: Rate }[];
};

/**
 * Uma corrida de produção: um movimento de entrada e um de saída por insumo.
 *
 * Sete linhas para uma corrida que faz 500 picolés com seis insumos, e não uma.
 * `movements` tem UM `item_id` e uma quantidade assinada, e o saldo é
 * `sum(...) group by empresa, item, local` — sete itens numa linha exigiriam um
 * leitor que abre payload, e o saldo deixaria de ser uma soma. A política do
 * servidor concorda: `movements_append` é um CASE por `kind` sem ELSE, e uma
 * linha não pode ser dois tipos.
 *
 * O custo congela aqui, linha por linha, e é a razão de a corrida existir como
 * evento. No consumo, a média móvel do insumo **naquele instante**. Na produção,
 * a soma exata dos consumos dividida pelas unidades que **de fato** saíram —
 * não pelo rendimento teórico. Se o tacho rendeu 480 onde a ficha prometia 500,
 * congelar o teórico esconderia a perda que acabou de acontecer, e ela é
 * exatamente o número que o dono precisa ver.
 *
 * Nada é escrito em `item_costs`. Valor derivado tem um autor só, e a média já
 * responde sozinha: consumo à taxa média não move a média (`applyCostEvent`),
 * então valor do razão dividido por quantidade do razão continua sendo ela.
 */
/**
 * O que faltava quando alguém tentou produzir mais do que dá.
 *
 * Nomeado e com os itens dentro, porque a tela precisa dizer QUAIS faltaram -
 * "faltou insumo" manda a pessoa procurar, e a Lei 5 quer que o erro impeça e
 * mostre a saída no mesmo gesto.
 */
export class NotEnoughStockError extends Error {
  constructor(
    public readonly missing: { itemId: string; name: string; needed: number; held: number }[],
  ) {
    super(`Not enough stock: ${missing.map((m) => m.name).join(', ')}`);
    this.name = 'NotEnoughStockError';
  }
}

export async function recordProduction(
  companyId: string,
  input: {
    /** Qual produto saiu. A receita e o rendimento vêm dele. */
    productId: string;
    /** Onde foi feito, e onde o produto passa a estar. */
    locationId: string;
    /** Quantos tachos foram rodados. É o que decide o consumo. */
    batches: number;
    /**
     * Quantas unidades saíram de verdade.
     *
     * Fato separado do número de tachos, e não dedutível dele: a razão entre os
     * dois É o rendimento real, que é metade do valor de registrar produção.
     */
    unitsProduced: number;
    /**
     * O dia da fábrica em que a corrida aconteceu, como data de calendário.
     *
     * Obrigatório, e sem valor padrão de propósito. O livro-razão guarda um
     * INSTANTE (`occurred_at`); a data do lote é outra coisa - é o dia local, e
     * transformar um no outro precisa do fuso da fábrica, que esta camada não
     * conhece. Derivar aqui seria repetir o defeito que já custou uma rodada:
     * meia-noite de 3 de setembro em Madri é 2 de setembro em UTC, e o lote
     * nasceria com a data de ontem em metade do mundo.
     *
     * Como o `live` do `PulseDot`: exigido em toda chamada para que o fato seja
     * dito por quem o conhece, em vez de adivinhado aqui.
     */
    producedOn: string;
    /** O código do lote, quando a fábrica tem padrão próprio. Sem ele, o nosso. */
    lotCode?: string;
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<ProductionResult> {
  const conn = await db();
  const at = nowIso();

  const product = (await listProducts(companyId)).find((p) => p.id === input.productId);
  if (!product) throw new Error(`produto ${input.productId} não existe`);
  if (!product.recipeId) throw new Error(`${product.name} é revenda: não se produz`);
  if (input.batches <= 0) throw new Error('uma corrida tem pelo menos um tacho');
  if (input.unitsProduced <= 0) throw new Error('uma corrida que não rendeu nada é um erro, não um fato');

  const graph = await loadRecipeGraph(companyId);
  const recipe = graph[product.recipeId];
  if (!recipe) throw new Error(`a receita de ${product.name} não está no aparelho`);

  const rates = await itemCosts(companyId);
  const needed = explodeRequirements(product.recipeId, input.batches, graph);

  const groupId = newId();
  const occurred = input.occurredAt ?? at;

  // O valor total consumido, em taxa × quantidade, sem arredondar em lugar
  // nenhum: a taxa do produto sai daqui e continua fracionária.
  let consumedValue = 0;
  const consumed: { itemId: string; baseUnits: number; rate: Rate }[] = [];
  for (const [itemId, baseUnits] of needed) {
    const rate = (rates[itemId] ?? 0) as Rate;

    // A quantidade arredonda aqui, uma vez, e a taxa não arredonda nunca.
    //
    // `quantity_base_units` é inteiro nos dois lados - `INTEGER` no aparelho e
    // `bigint` no servidor - e uma sub-receita divide: meio tacho de base de
    // creme pede 7530,612244897959 g de açúcar. A afinidade de tipo do SQLite
    // aceita esse REAL sem dizer nada e o Postgres arredondaria, então o
    // aparelho e o servidor passariam a discordar de quanto açúcar saiu do
    // almoxarifado. A tela de insumos mostrava `34.938,776 g` enquanto a de
    // lugares mostrava `34.939 g`: dois números para o mesmo saco.
    //
    // E arredonda antes do valor, não depois: o custo congelado é a aritmética
    // do que o livro-razão guarda, não de um consumo que ninguém gravou.
    const quantity = Math.round(baseUnits);

    consumedValue += rate * quantity;
    consumed.push({ itemId, baseUnits: quantity, rate });
  }

  // A regra mora aqui, e não no botão.
  //
  // A tela de produção já impedia isso - mas o bloqueio numa tela protege quem
  // passa por aquela tela, e o livro-razão recebe escrita de mais de um lugar:
  // o assistente, a simulação, e amanhã uma API. Foi a simulação que encontrou:
  // catorze dias de fábrica levaram a polpa a MENOS 192.000 g sem uma
  // reclamação, porque nada no caminho de escrita conferia.
  //
  // É a mesma forma da fundação de permissão deste projeto: a checagem roda
  // ANTES da escrita, então não existe linha errada para alguém corrigir depois.
  //
  // E o piso é o da SALA em que o tacho está, não o da empresa.
  //
  // A guarda somava o saldo de todos os lugares e escrevia o consumo em
  // `input.locationId` - duas perguntas diferentes respondidas pela mesma
  // consulta. Basta a fábrica mandar um saco de açúcar para a loja, que o
  // aplicativo já faz pela tela de transferência, para a conta autorizar um
  // tacho com o açúcar que está a dez quilômetros dali: a produção passa, o
  // consumo entra na fábrica, e a fábrica fica negativa - o exato estado que
  // esta guarda existe para impedir.
  //
  // É a mesma correção que a contagem já tinha ("contar a prateleira compara
  // com aquela prateleira, não com a empresa inteira") e que a perda herdou.
  // Enquanto houver um lugar só as duas contas dão igual, e é por isso que isto
  // atravessou até aqui sem quebrar nada.
  const held = await conn.getAllAsync<{ item_id: string; name: string; on_hand: number }>(
    `SELECT m.item_id, i.name, COALESCE(SUM(m.quantity_base_units), 0) AS on_hand
       FROM movements m
       JOIN items i ON i.id = m.item_id
      WHERE m.company_id = ? AND m.location_id = ?
      GROUP BY m.item_id, i.name`,
    [companyId, input.locationId],
  );
  const onHand = new Map(held.map((h) => [h.item_id, h.on_hand]));

  const missing = consumed
    .map((line) => ({
      itemId: line.itemId,
      name: held.find((h) => h.item_id === line.itemId)?.name ?? line.itemId,
      needed: line.baseUnits,
      held: onHand.get(line.itemId) ?? 0,
    }))
    .filter((line) => line.held < line.needed);

  if (missing.length > 0) {
    // O nome vem do catálogo, e a consulta extra só acontece no caminho que já
    // vai falhar. Com o piso agora sendo o da sala, o insumo que falta pode ter
    // ZERO linha em `movements` ali - some da consulta de saldo, e a tela diria
    // ao operador o uuid do item em vez de "Polpa de morango".
    const catalog = await labels(companyId);
    throw new NotEnoughStockError(
      missing.map((line) => ({ ...line, name: catalog[line.itemId] ?? line.name })),
    );
  }

  // A embalagem entra aqui, e não entrar era um defeito silencioso.
  //
  // Sete telas cotam o custo de uma unidade como `costPerProductUnit`, que soma
  // a embalagem por unidade. Se a produção congelasse só a receita, a margem de
  // toda venda futura sairia inflada exatamente pelo palito e pelo saquinho -
  // R$ 0,05 numa corrida de 500 unidades é R$ 25 que ninguém explicaria depois.
  // O número que a tela promete e o número que o livro-razão guarda passam a ser
  // um só.
  //
  // O que ainda falta, e está escrito para não se perder: a embalagem é um
  // valor digitado no produto, enquanto palito e saquinho são itens comprados
  // por nota. Ou seja, o custo sai certo, mas o estoque de palito só sobe.
  // Ligar os dois é mudança de esquema (produto -> itens de embalagem, com
  // quantidade por unidade), e vem separada desta.
  const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingCents) as Rate;
  const productionId = newId();

  const lotId = newId();
  const expires = expiresOn(input.producedOn, product.shelfLifeDays);
  let lotCodeWritten = '';

  await conn.withTransactionAsync(async () => {
    await ensureLocation(conn, companyId);

    // O lote nasce ANTES das linhas que o citam, e a ordem não é estética.
    //
    // A fila do aparelho sobe na ordem em que foi escrita, e o servidor tem
    // chave estrangeira de `movements.lot_id` para `lots` - que o SQLite daqui
    // não tem, porque não se acrescenta FK a coluna existente. Invertida, a
    // fila seria aceita aqui e recusada lá, e o defeito só apareceria no
    // primeiro celular sem sinal.
    //
    // A sequência conta os lotes DO DIA, não do banco inteiro: o código diz
    // "segunda corrida de 2 de setembro", que é o que alguém lê em voz alta no
    // telefone durante um recall.
    const runsToday = await conn.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM lots WHERE company_id = ? AND produced_on = ?`,
      [companyId, input.producedOn],
    );
    const code = input.lotCode ?? lotCode(input.producedOn, (runsToday?.n ?? 0) + 1);

    await conn.runAsync(
      `INSERT INTO lots (id, company_id, item_id, code, produced_on, expires_on, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [lotId, companyId, product.itemId, code, input.producedOn, expires, at],
    );
    await enqueue(conn, [{ table: 'lots', rowId: lotId }]);
    lotCodeWritten = code;

    const write = async (
      id: string,
      kind: 'production' | 'consumption',
      itemId: string,
      quantity: number,
      rate: number,
      lot: string | null,
    ) => {
      await conn.runAsync(
        `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                                quantity_base_units, location_id, unit_cost_rate,
                                movement_group_id, lot_id, note, assistant_phrase)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          companyId,
          kind,
          occurred,
          at,
          itemId,
          quantity,
          input.locationId,
          rate || null,
          groupId,
          lot,
          input.note ?? null,
          input.assistantPhrase ?? null,
        ],
      );
      await enqueue(conn, [{ table: 'movements', rowId: id }]);
    };

    // Só a linha de PRODUÇÃO aponta para o lote novo.
    //
    // O consumo tira insumo do estoque, e o lote do insumo é outro - é o da
    // nota em que ele entrou. Carimbar o lote do picolé na saída da polpa diria
    // que a polpa pertence ao picolé, e o recall passaria a recolher o saco de
    // açúcar. Consumo por lote é PEPS de insumo, que é trabalho da Fase 3.
    await write(productionId, 'production', product.itemId, input.unitsProduced, unitCostRate, lotId);
    for (const line of consumed) {
      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null);
    }
  });

  return {
    groupId,
    unitsProduced: input.unitsProduced,
    unitCostRate,
    consumed,
    lot: { id: lotId, code: lotCodeWritten, expiresOn: expires },
  };
}

export type TransferResult = {
  groupId: string;
  baseUnits: number;
  unitCostRate: Rate;
};

/**
 * O que sai da fábrica e chega na loja: duas linhas, um ato.
 *
 * Saída negativa na origem, entrada positiva no destino, as duas com o mesmo
 * `movement_group_id` e cada uma apontando para o outro lado em
 * `counterpart_location_id`.
 *
 * Duas e não uma, e o motivo é aritmético. O saldo agrupa por `location_id`;
 * com uma linha só o destino não existiria em consulta nenhuma, e fechar
 * exigiria um UNION trocando `location_id` por `counterpart_location_id` e
 * invertendo o sinal — em cada lugar que soma. A contraparte fica como
 * **explicação**, nunca como aritmética: ela responde "para onde foi", e quem
 * responde "quanto tem" é a soma, sozinha.
 *
 * A carga leva o custo consigo, congelado na média do instante em que saiu.
 * Loja própria é transferência e não venda: não há faturamento nem margem
 * aqui, e o valor apenas muda de sala.
 */
export async function recordTransfer(
  companyId: string,
  input: {
    itemId: string;
    fromLocationId: string;
    toLocationId: string;
    /** Sempre na menor unidade. Positivo: quanto sai de lá e chega aqui. */
    baseUnits: number;
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<TransferResult> {
  if (input.fromLocationId === input.toLocationId) {
    throw new Error('origem e destino são o mesmo lugar');
  }
  if (input.baseUnits <= 0) {
    throw new Error('uma transferência move alguma coisa; para o sentido inverso, troque os lugares');
  }

  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;

  const cost = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );
  const unitCostRate = (cost?.average_rate ?? 0) as Rate;

  const groupId = newId();
  const outId = newId();
  const inId = newId();

  await conn.withTransactionAsync(async () => {
    await ensureLocation(conn, companyId);

    const leg = async (id: string, at_: string, quantity: number, here: string, there: string) => {
      await conn.runAsync(
        `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                                quantity_base_units, location_id, counterpart_location_id,
                                unit_cost_rate, movement_group_id, note, assistant_phrase)
         VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          companyId,
          occurred,
          at_,
          input.itemId,
          quantity,
          here,
          there,
          unitCostRate || null,
          groupId,
          input.note ?? null,
          input.assistantPhrase ?? null,
        ],
      );
      await enqueue(conn, [{ table: 'movements', rowId: id }]);
    };

    await leg(outId, at, -input.baseUnits, input.fromLocationId, input.toLocationId);
    await leg(inId, at, input.baseUnits, input.toLocationId, input.fromLocationId);
  });

  return { groupId, baseUnits: input.baseUnits, unitCostRate };
}

export type Product = {
  id: string;
  itemId: string;
  name: string;
  /** `null` for resale: a resale product has no recipe, only a purchase cost. */
  recipeId: string | null;
  /** How much of the batch becomes one unit. 75 ml per popsicle. */
  yieldPerUnit: number | null;
  /** Stick, wrapper, label - packaging is a cost per unit, not per batch. */
  unitPackagingCents: Cents;
  /**
   * Quantos dias o produto dura depois de feito. Nulo: não vence.
   *
   * Mora no produto e não na corrida porque quem está de luva no tacho não sabe
   * de cabeça que o picolé dura seis meses e o pote três - o cadastro sabe,
   * respondeu uma vez, e toda corrida nasce com a data pronta.
   */
  shelfLifeDays: number | null;
  packaging: PackagingHierarchy;
  /**
   * A grade que compôs o nome, quando ele veio de uma. Nulo é caso legítimo, e
   * não migração pendente: um produto de revenda comprado pronto não tem linha
   * nem sabor, e uma fábrica de um doce só nunca cadastrou nenhum dos três.
   */
  lineId: string | null;
  typeId: string | null;
  flavorId: string | null;
};

export async function listProducts(companyId: string): Promise<Product[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    item_id: string;
    name: string;
    recipe_id: string | null;
    yield_per_unit: number | null;
    unit_packaging_cents: number;
    shelf_life_days: number | null;
    packaging: string;
    line_id: string | null;
    type_id: string | null;
    flavor_id: string | null;
  }>(
    `SELECT p.id, p.item_id, i.name, p.recipe_id, p.yield_per_unit,
            p.unit_packaging_cents, p.shelf_life_days, i.packaging,
            p.line_id, p.type_id, p.flavor_id
       FROM products p
       JOIN items i ON i.id = p.item_id
      WHERE p.company_id = ? AND p.active = 1
      ORDER BY i.name COLLATE NOCASE`,
    [companyId],
  );

  return rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    name: r.name,
    recipeId: r.recipe_id,
    yieldPerUnit: r.yield_per_unit,
    unitPackagingCents: r.unit_packaging_cents as Cents,
    shelfLifeDays: r.shelf_life_days,
    packaging: parsePackaging(r.packaging),
    lineId: r.line_id,
    typeId: r.type_id,
    flavorId: r.flavor_id,
  }));
}

/**
 * Saves a product and the item behind it in one step.
 *
 * A product is an item that can also be made or resold, not a separate thing
 * living in a parallel table - which is what lets one ledger hold both the
 * sugar going in and the popsicle coming out.
 */
export async function saveProduct(
  companyId: string,
  input: {
    id?: string;
    itemId?: string;
    name: string;
    kind: Extract<ItemKind, 'product' | 'resale'>;
    recipeId: string | null;
    yieldPerUnit: number | null;
    unitPackagingCents: Cents;
    packaging: PackagingHierarchy;
    /**
     * Quantos dias este produto dura depois de feito. Nulo: não vence.
     *
     * Perguntado uma vez aqui, no cadastro, para nunca mais ser perguntado no
     * tacho: cada corrida nasce com a validade calculada. É a Lei 1 na forma
     * mais direta - o sistema já sabe, então não pergunta de novo.
     */
    shelfLifeDays?: number | null;
    lineId?: string | null;
    typeId?: string | null;
    flavorId?: string | null;
  },
): Promise<{ productId: string; itemId: string }> {
  // Antes de abrir a transação, porque recusar depois de gravar o item deixaria
  // um item órfão para trás - e a checagem lê, não escreve.
  await assertTypeBelongsToLine(companyId, input.lineId ?? null, input.typeId ?? null);
  const conn = await db();
  let itemId = '';
  let productId = '';

  await conn.withTransactionAsync(async () => {
    itemId = await writeItem(conn, companyId, {
      id: input.itemId,
      kind: input.kind,
      name: input.name,
      purchaseUnit: null,
      purchaseToBase: null,
      baseUnit: 'un',
      packaging: input.packaging,
    });

    productId = input.id ?? newId();
    await conn.runAsync(
      `INSERT INTO products (id, company_id, item_id, recipe_id, yield_per_unit,
                             unit_packaging_cents, shelf_life_days, active,
                             line_id, type_id, flavor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         recipe_id = excluded.recipe_id,
         yield_per_unit = excluded.yield_per_unit,
         unit_packaging_cents = excluded.unit_packaging_cents,
         shelf_life_days = excluded.shelf_life_days,
         line_id = excluded.line_id,
         type_id = excluded.type_id,
         flavor_id = excluded.flavor_id`,
      [
        productId,
        companyId,
        itemId,
        input.recipeId,
        input.yieldPerUnit,
        input.unitPackagingCents,
        input.shelfLifeDays ?? null,
        input.lineId ?? null,
        input.typeId ?? null,
        input.flavorId ?? null,
      ],
    );

    await enqueue(conn, [{ table: 'products', rowId: productId }]);
  });

  return { productId, itemId };
}

// --- what changed -----------------------------------------------------------

export type CostChange = {
  itemId: string;
  name: string;
  previousRate: Rate | null;
  newRate: Rate;
  observedAt: string;
};

/**
 * The most recent moves in what things cost.
 *
 * This is the raw material of the briefing: a home screen that only shows
 * totals says nothing, because the owner already knows roughly what they are.
 * What they do not know is what moved since they last looked.
 */
export async function recentCostChanges(companyId: string, limit = 5): Promise<CostChange[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    previous_rate: number | null;
    new_rate: number;
    observed_at: string;
  }>(
    `SELECT h.item_id, i.name, h.previous_rate, h.new_rate, h.observed_at
       FROM item_cost_history h
       JOIN items i ON i.id = h.item_id
      WHERE h.company_id = ? AND h.previous_rate IS NOT NULL
      ORDER BY h.observed_at DESC
      LIMIT ?`,
    [companyId, limit],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    previousRate: r.previous_rate === null ? null : (r.previous_rate as Rate),
    newRate: r.new_rate as Rate,
    observedAt: r.observed_at,
  }));
}

/**
 * Alguma coisa se perdeu, e o motivo é obrigatório.
 *
 * Escreve um movimento negativo com `loss_reason` preenchido - o servidor tem
 * `check (kind <> 'loss' or loss_reason is not null)` desde a primeira migração,
 * então uma perda sem motivo é recusada lá mesmo que o aparelho a aceitasse. E
 * o motivo não é burocracia: "sumiram 200 picolés" não muda decisão nenhuma,
 * "derreteram 200 picolés na câmara" muda a manutenção do freezer.
 *
 * As palavras estão nos três idiomas desde antes desta função existir, sem tela
 * que as usasse - uma das dívidas que o próprio CLAUDE.md nomeia. Este é o
 * primeiro escritor.
 *
 * O piso é o mesmo da produção: não se perde o que não se tem. A checagem roda
 * antes da escrita, e por isso não existe linha errada para alguém estornar.
 */
export async function recordLoss(
  companyId: string,
  input: {
    itemId: string;
    /** Quanto se perdeu, em unidade-base. Sempre positivo: o sinal é daqui. */
    baseUnits: number;
    reason: LossReason;
    locationId?: string;
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<{ baseUnits: number; rate: Rate }> {
  if (!(input.baseUnits > 0)) throw new Error('uma perda de nada não é uma perda');

  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;
  const locationId = input.locationId ?? (await ensureLocation(conn, companyId));

  const held = await conn.getFirstAsync<{ on_hand: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS on_hand
       FROM movements
      WHERE company_id = ? AND item_id = ? AND location_id = ?`,
    [companyId, input.itemId, locationId],
  );

  const onHand = held?.on_hand ?? 0;
  if (onHand < input.baseUnits) {
    const name = (await labels(companyId))[input.itemId] ?? input.itemId;
    throw new NotEnoughStockError([
      { itemId: input.itemId, name, needed: input.baseUnits, held: onHand },
    ]);
  }

  // A taxa é a que o item vale hoje: o que se perdeu foi mercadoria comprada,
  // e o relatório de perdas conta dinheiro, não só quantidade.
  const rates = await itemCosts(companyId);
  const rate = (rates[input.itemId] ?? 0) as Rate;

  const id = newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate, loss_reason,
                              note, assistant_phrase)
       VALUES (?, ?, 'loss', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        occurred,
        at,
        input.itemId,
        -Math.round(input.baseUnits),
        locationId,
        rate || null,
        input.reason,
        input.note ?? null,
        input.assistantPhrase ?? null,
      ],
    );
    await enqueue(conn, [{ table: 'movements', rowId: id }]);
  });

  return { baseUnits: Math.round(input.baseUnits), rate };
}

/** Uma perda, como o relatório precisa dela: quanto, onde, por quê e quanto vale. */
export type LossRow = {
  itemId: string;
  name: string;
  baseUnits: number;
  baseUnit: string;
  reason: LossReason;
  locationName: string;
  valueCents: Cents;
  occurredAt: string;
};

/**
 * O que se perdeu numa janela, do mais caro para o mais barato.
 *
 * Ordenado por dinheiro e não por data porque a pergunta que o relatório
 * responde não é "o que aconteceu ontem", é "onde está indo o dinheiro que
 * some". Uma caixa que derreteu vale mais que trinta picolés de cortesia, e é
 * ela que muda a manutenção do freezer.
 */
export async function lossesOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<LossRow[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    base_unit: string;
    quantity: number;
    reason: LossReason;
    location_name: string;
    rate: number | null;
    occurred_at: string;
  }>(
    `SELECT m.item_id, i.name, i.base_unit, m.quantity_base_units AS quantity,
            m.loss_reason AS reason, l.name AS location_name,
            m.unit_cost_rate AS rate, m.occurred_at
       FROM movements m
       JOIN items i ON i.id = m.item_id
       JOIN locations l ON l.id = m.location_id
      WHERE m.company_id = ?
        AND m.kind = 'loss'
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
      ORDER BY ABS(m.quantity_base_units * COALESCE(m.unit_cost_rate, 0)) DESC`,
    [companyId, fromIso, toIso],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    baseUnits: Math.abs(r.quantity),
    baseUnit: r.base_unit,
    reason: r.reason,
    locationName: r.location_name,
    // Taxa fracionária vezes quantidade, arredondada aqui e só aqui.
    valueCents: cents(Math.abs(r.quantity) * (r.rate ?? 0)),
    occurredAt: r.occurred_at,
  }));
}

/** Um tacho que está rodando agora. */
export type OpenRun = {
  id: string;
  productId: string;
  productName: string;
  recipeId: string;
  /** A ficha que estava valendo quando o tacho foi carregado. */
  recipeVersionId: string;
  batches: number;
  locationId: string;
  openedAt: string;
};

/** Uma corrida que o razão não conhece: some sem estorno. */
export class RunGoneError extends Error {
  constructor(public readonly runId: string) {
    super(`corrida ${runId} não está aberta`);
    this.name = 'RunGoneError';
  }
}

/**
 * O tacho começou a rodar.
 *
 * Não valida saldo, e isso é decisão e não esquecimento: na abertura a falta é
 * uma PREVISÃO, e recusar a abertura não impede o tacho de estar rodando - só
 * deixa a corrida sem registro. A tela avisa aqui; o razão impede no
 * fechamento, que é onde a escrita acontece.
 */
export async function openProductionRun(
  companyId: string,
  input: { productId: string; batches: number },
): Promise<OpenRun> {
  if (!(input.batches > 0) || !Number.isFinite(input.batches)) {
    throw new Error('um tacho tem de ser mais que zero');
  }

  const product = (await listProducts(companyId)).find((p) => p.id === input.productId);
  if (!product) throw new Error(`produto ${input.productId} não existe`);
  if (!product.recipeId) throw new Error(`${product.name} é revenda: não se produz`);

  const graph = await loadRecipeGraph(companyId);
  const recipe = graph[product.recipeId];
  if (!recipe) throw new Error(`a receita de ${product.name} não está no aparelho`);

  const conn = await db();
  const at = nowIso();
  const id = newId();
  const locationId = await ensureLocation(conn, companyId);

  await conn.runAsync(
    `INSERT INTO production_runs
       (id, company_id, product_id, recipe_version_id, batches, location_id, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, product.id, product.recipeId, input.batches, locationId, at],
  );

  return {
    id,
    productId: product.id,
    productName: product.name,
    recipeId: product.recipeId,
    recipeVersionId: product.recipeId,
    batches: input.batches,
    locationId,
    openedAt: at,
  };
}

/** Os tachos rodando agora. Vazio é o estado normal de uma fábrica parada. */
export async function openProductionRuns(companyId: string): Promise<OpenRun[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    product_id: string;
    name: string;
    recipe_id: string;
    recipe_version_id: string;
    batches: number;
    location_id: string;
    opened_at: string;
  }>(
    `SELECT r.id, r.product_id, i.name, p.recipe_id, r.recipe_version_id,
            r.batches, r.location_id, r.opened_at
       FROM production_runs r
       JOIN products p ON p.id = r.product_id
       JOIN items i ON i.id = p.item_id
      WHERE r.company_id = ?
      ORDER BY r.opened_at`,
    [companyId],
  );

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.name,
    recipeId: r.recipe_id,
    recipeVersionId: r.recipe_version_id,
    batches: r.batches,
    locationId: r.location_id,
    openedAt: r.opened_at,
  }));
}

/**
 * O tacho não virou produção.
 *
 * Apaga a linha e não escreve nada no razão - é aqui que "estado, não
 * movimento" se paga: não existe estorno porque não existe lançamento. E não
 * pergunta motivo: o app não fiscaliza.
 */
export async function cancelProductionRun(companyId: string, runId: string): Promise<void> {
  const conn = await db();
  await conn.runAsync(`DELETE FROM production_runs WHERE id = ? AND company_id = ?`, [
    runId,
    companyId,
  ]);
}

/**
 * O tacho virou produção: a corrida sai do estado e entra no razão.
 *
 * O id da corrida vira o `movement_group_id` das linhas - a linha some da
 * tabela, mas o nome dela fica no livro-razão, e é por ele que se volta.
 * Fechar duas vezes por toque repetido é impossível: a segunda não acha a
 * corrida e levanta `RunGoneError` antes de escrever qualquer coisa.
 */
export async function closeProductionRun(
  companyId: string,
  input: {
    runId: string;
    unitsProduced: number;
    /**
     * O dia da fábrica em que o TACHO FOI ABERTO, não o de agora.
     *
     * Uma corrida aberta às 23h de segunda e fechada à 1h de terça é produção
     * de segunda: foi o trabalho daquele turno, e é a data que a etiqueta do
     * lote precisa carregar. Quem sabe traduzir `openedAt` em dia local é a
     * tela, que tem o fuso.
     */
    producedOn: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<ProductionResult> {
  const run = (await openProductionRuns(companyId)).find((r) => r.id === input.runId);
  if (!run) throw new RunGoneError(input.runId);

  const result = await recordProduction(companyId, {
    productId: run.productId,
    locationId: run.locationId,
    batches: run.batches,
    unitsProduced: input.unitsProduced,
    occurredAt: run.openedAt,
    producedOn: input.producedOn,
    note: input.note,
    assistantPhrase: input.assistantPhrase,
  });

  // Só depois de o razão aceitar. Se a produção falhar por falta de insumo, a
  // corrida continua aberta e a pessoa pode lançar a compra e fechar de novo -
  // em vez de perder o registro do tacho que rodou.
  const conn = await db();
  await conn.runAsync(`DELETE FROM production_runs WHERE id = ? AND company_id = ?`, [
    input.runId,
    companyId,
  ]);

  return result;
}

/** O que a loja disse ao abrir a caixa. */
export type CheckResult = {
  /** O grupo da transferência conferida. */
  groupId: string;
  /** Diferença por item: negativa quando faltou, zero quando bateu. */
  differences: { itemId: string; baseUnits: number }[];
};

/**
 * A loja abriu o que chegou e contou.
 *
 * Escreve UMA LINHA NOVA por item, nunca um carimbo na remessa: o gatilho
 * `movements_are_immutable` do servidor recusa qualquer UPDATE em `movements`,
 * sem exceção e sem olhar coluna. Não é preferência de desenho - é o que o
 * esquema permite.
 *
 * A linha que BATEU tem quantidade zero, e isso precisou de migração no
 * servidor (0017): a restrição `movement_moved_something` recusava linha que
 * não move nada, com uma exceção só para contagem de prateleira. Mas
 * "conferi e bateu" é justamente a conferência que mais vale - é a prova de que
 * alguém abriu a caixa -, e sem poder gravá-la o app não saberia distinguir
 * "ainda não conferiu" de "conferiu e estava tudo certo".
 *
 * A taxa gravada é a da perna de ENTRADA da remessa, não a média de hoje: o que
 * faltou foi a mercadoria que embarcou, ao custo com que embarcou. Ler o custo
 * atual avaliaria a falta de setembro ao preço de outubro.
 */
export async function recordCheck(
  companyId: string,
  input: {
    /** A remessa conferida, pelo grupo das duas pernas. */
    groupId: string;
    /**
     * O que a loja contou de verdade, por item, em unidade-base.
     *
     * Omitido significa "chegou tudo": cada perna vira uma diferença de zero. É
     * o caso comum e o único que alguém preenche na doca - e evita o erro de
     * escrever uma contagem agregada contra cada remessa quando o mesmo destino
     * recebeu duas cargas no mesmo dia, que contaria a mesma mercadoria duas
     * vezes.
     */
    counted?: { itemId: string; baseUnits: number }[];
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<CheckResult> {
  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;

  // A remessa, lida pelas pernas de entrada: elas dizem o destino, a origem, o
  // que foi mandado e a que custo.
  const legs = await conn.getAllAsync<{
    item_id: string;
    quantity: number;
    location_id: string;
    counterpart: string | null;
    rate: number | null;
  }>(
    `SELECT item_id, quantity_base_units AS quantity, location_id,
            counterpart_location_id AS counterpart, unit_cost_rate AS rate
       FROM movements
      WHERE company_id = ? AND movement_group_id = ? AND quantity_base_units > 0`,
    [companyId, input.groupId],
  );

  if (legs.length === 0) throw new Error(`remessa ${input.groupId} não existe`);

  const differences: { itemId: string; baseUnits: number }[] = [];

  await conn.withTransactionAsync(async () => {
    for (const leg of legs) {
      const said = input.counted?.find((c) => c.itemId === leg.item_id);
      // Sem lista, tudo bateu. Com lista, item não mencionado é item que a
      // pessoa não conferiu - e não item que chegou zerado. A ausência não vira
      // acusação.
      if (input.counted && !said) continue;

      const difference = said ? Math.round(said.baseUnits) - leg.quantity : 0;
      differences.push({ itemId: leg.item_id, baseUnits: difference });

      const id = newId();
      await conn.runAsync(
        `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                                quantity_base_units, location_id, counterpart_location_id,
                                unit_cost_rate, movement_group_id, post, note, assistant_phrase)
         VALUES (?, ?, 'discrepancy', ?, ?, ?, ?, ?, ?, ?, ?, 'checked', ?, ?)`,
        [
          id,
          companyId,
          occurred,
          at,
          leg.item_id,
          difference,
          leg.location_id,
          leg.counterpart,
          leg.rate,
          input.groupId,
          input.note ?? null,
          input.assistantPhrase ?? null,
        ],
      );
      await enqueue(conn, [{ table: 'movements', rowId: id }]);
    }
  });

  return { groupId: input.groupId, differences };
}

/** Remessas de um dia que ninguém conferiu ainda. */
export async function unchecked(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<string[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ movement_group_id: string }>(
    `SELECT DISTINCT m.movement_group_id
       FROM movements m
      WHERE m.company_id = ?
        AND m.kind = 'transfer'
        AND m.quantity_base_units > 0
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
        AND m.movement_group_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM movements c
           WHERE c.company_id = m.company_id
             AND c.movement_group_id = m.movement_group_id
             AND c.post = 'checked'
        )`,
    [companyId, fromIso, toIso],
  );
  return rows.map((r) => r.movement_group_id);
}

/** What a product put out inside a window, in base units. */
export type ProducedInWindow = {
  itemId: string;
  name: string;
  baseUnits: number;
};

/**
 * What came out of the kettle between two instants.
 *
 * The first query in this repository with a date window, and the reason it
 * arrives so late is worth writing down: `occurred_at` appears nine times in
 * this file and, until now, never once in a WHERE. The briefing could say what
 * a unit costs but not what today made.
 *
 * The window is filtered on `occurred_at` and NEVER on `recorded_at`, and the
 * two are different facts on purpose. A run entered offline at 23h50 and
 * synced at 01h belongs to the day it happened, not to the day the phone found
 * signal. Sorting the ledger by when the server heard about it is how a factory
 * ends up with a Monday that produced nothing and a Tuesday that produced
 * double.
 *
 * Half-open on purpose: `from` is included, `to` is not. Two consecutive days
 * asked back to back then cover every movement exactly once - with both ends
 * closed, a run at exactly midnight would be counted twice, and the person
 * comparing today against yesterday would see a number nobody produced.
 */
export async function productionOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<ProducedInWindow[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ item_id: string; name: string; total: number }>(
    `SELECT m.item_id, i.name, SUM(m.quantity_base_units) AS total
       FROM movements m
       JOIN items i ON i.id = m.item_id
      WHERE m.company_id = ?
        AND m.kind = 'production'
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
      GROUP BY m.item_id, i.name
      HAVING total > 0
      ORDER BY total DESC`,
    [companyId, fromIso, toIso],
  );

  return rows.map((r) => ({ itemId: r.item_id, name: r.name, baseUnits: r.total }));
}

/**
 * Cada corrida de produção do intervalo, com a hora em que aconteceu.
 *
 * Irmã de `productionOn`, e a diferença é de propósito: aquela devolve o total
 * já somado da janela, esta devolve os fatos soltos para quem precisa
 * distribuí-los por dia. Sete chamadas de `productionOn` responderiam a mesma
 * pergunta com sete varreduras do livro-razão.
 *
 * E ela devolve o instante, não o dia. O dia é uma conta que depende do fuso da
 * fábrica, e esta camada devolve fato — quem fala em segunda-feira é a tela,
 * com `dailySeries` no meio.
 */
export async function productionBetween(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<{ occurredAt: string; baseUnits: number }[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ occurred_at: string; quantity_base_units: number }>(
    `SELECT occurred_at, quantity_base_units
       FROM movements
      WHERE company_id = ?
        AND kind = 'production'
        AND occurred_at >= ?
        AND occurred_at < ?
      ORDER BY occurred_at`,
    [companyId, fromIso, toIso],
  );

  return rows.map((r) => ({ occurredAt: r.occurred_at, baseUnits: r.quantity_base_units }));
}

/** Um lote do dia: o que ele é, quanto rendeu e até quando vale. */
export type LotOfDay = {
  id: string;
  code: string;
  name: string;
  baseUnits: number;
  expiresOn: string | null;
};

/**
 * Os lotes que nasceram numa janela, com o que cada um rendeu.
 *
 * Existe porque o código do lote é o número que alguém escreve de caneta na
 * caixa antes de ela ir para a câmara fria — e a primeira versão disto era um
 * diálogo depois de gravar, que o e2e derrubou com razão: um toque a mais na
 * ação mais frequente do dia, todo dia, para informar o que a tela seguinte
 * podia mostrar sozinha. Aqui o lote aparece sem pedir nada, e continua
 * disponível depois, que é quando alguém realmente procura.
 *
 * A quantidade vem do movimento e não do lote, porque é o livro-razão que sabe
 * quanto saiu: o lote é a identidade, o movimento é o fato.
 */
export async function lotsOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<LotOfDay[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    code: string;
    name: string;
    total: number;
    expires_on: string | null;
  }>(
    `SELECT l.id, l.code, i.name, l.expires_on,
            COALESCE(SUM(m.quantity_base_units), 0) AS total
       FROM lots l
       JOIN items i ON i.id = l.item_id
       JOIN movements m ON m.lot_id = l.id AND m.kind = 'production'
      WHERE l.company_id = ?
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
      GROUP BY l.id, l.code, i.name, l.expires_on
      ORDER BY l.code DESC`,
    [companyId, fromIso, toIso],
  );

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    baseUnits: r.total,
    expiresOn: r.expires_on,
  }));
}

/** One destination's share of a day: who received it, and what. */
export type Shipment = {
  /**
   * Os grupos das remessas que caíram neste destino hoje.
   *
   * A tela fala por destino, como o desenho manda, mas a conferência é por
   * REMESSA - uma loja pode receber duas cargas no mesmo dia, e quem abre a
   * segunda caixa não está conferindo a primeira.
   */
  groupIds: string[];
  locationId: string;
  locationName: string;
  /** Mesmo tipo que `Place.kind`: texto, como o resto do repositório o trata. */
  kind: string;
  /**
   * A embalagem vem junto porque toda tela que mostra isto precisa dizer a
   * quantidade na unidade que a pessoa manuseia - e porque é a única forma
   * honesta de saber quais itens TÊM caixa. Fato, não frase: a conversão em
   * palavras continua sendo da tela.
   */
  items: { itemId: string; name: string; baseUnits: number; packaging: PackagingHierarchy }[];
  /** Se alguém já abriu a caixa e contou. */
  checked: boolean;
};

/**
 * What left the factory between two instants, grouped by where it landed.
 *
 * A transfer writes two legs - one negative where it left, one positive where
 * it arrived - so "where did it go" reads the POSITIVE legs and groups by
 * `location_id`, which on that leg is the destination. `counterpart_location_id`
 * says where it came from; the V6 migration added it and, until this function,
 * no query in this repository had ever read it back.
 *
 * The result stays in base units on purpose. Turning grams and popsicles into
 * "caixas" is a sentence, not a fact, and it cannot be done here: `breakdown()`
 * works per item, and an item with no box layer - sugar, pulp - has no box to
 * be counted in. A repository that returned "18 cx" would have invented a unit
 * for half the rows.
 */
export async function shipmentsOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<Shipment[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    location_id: string;
    location_name: string;
    kind: string;
    group_id: string;
    item_id: string;
    item_name: string;
    packaging: string;
    total: number;
    checked: number;
  }>(
    `SELECT m.movement_group_id AS group_id, m.location_id, l.name AS location_name, l.kind,
            m.item_id, i.name AS item_name, i.packaging,
            SUM(m.quantity_base_units) AS total,
            EXISTS (
              SELECT 1 FROM movements c
               WHERE c.company_id = m.company_id
                 AND c.movement_group_id = m.movement_group_id
                 AND c.post = 'checked'
            ) AS checked
       FROM movements m
       JOIN locations l ON l.id = m.location_id
       JOIN items i ON i.id = m.item_id
      WHERE m.company_id = ?
        AND m.kind = 'transfer'
        AND m.quantity_base_units > 0
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
      GROUP BY m.movement_group_id, m.location_id, l.name, l.kind, m.item_id, i.name, i.packaging
      HAVING total > 0
      ORDER BY l.name, total DESC`,
    [companyId, fromIso, toIso],
  );

  const byPlace = new Map<string, Shipment>();
  for (const r of rows) {
    const place = byPlace.get(r.location_id) ?? {
      groupIds: [],
      locationId: r.location_id,
      locationName: r.location_name,
      kind: r.kind,
      items: [],
      checked: true,
    };

    // Conferido só quando TODAS as remessas do dia para lá foram conferidas: um
    // "conferido" que ignora a carga da tarde é pior que nenhum.
    if (!place.groupIds.includes(r.group_id)) {
      place.groupIds.push(r.group_id);
      if (r.checked !== 1) place.checked = false;
    }
    const existing = place.items.find((i) => i.itemId === r.item_id);
    if (existing) existing.baseUnits += r.total;
    else
      place.items.push({
        itemId: r.item_id,
        name: r.item_name,
        baseUnits: r.total,
        packaging: parsePackaging(r.packaging),
      });
    byPlace.set(r.location_id, place);
  }

  return [...byPlace.values()];
}

/**
 * When one of these items last actually changed price.
 *
 * "Estável há doze dias" is a conclusion, and this is the fact under it. Only a
 * row where the rate MOVED counts: `item_cost_history` also records the first
 * price an item ever had, and treating that as a change would say the cost
 * moved on the day the item was registered - which is the day nothing was known
 * yet, not the day something happened.
 *
 * Returns null when no item in the list has ever moved. The screen says that in
 * words; a repository does not invent a date to fill a sentence.
 */
export async function lastCostMove(
  companyId: string,
  itemIds: readonly string[],
): Promise<string | null> {
  if (itemIds.length === 0) return null;

  const conn = await db();
  const marks = itemIds.map(() => '?').join(', ');
  const row = await conn.getFirstAsync<{ observed_at: string }>(
    `SELECT observed_at
       FROM item_cost_history
      WHERE company_id = ?
        AND item_id IN (${marks})
        AND previous_rate IS NOT NULL
        AND previous_rate <> new_rate
      ORDER BY observed_at DESC
      LIMIT 1`,
    [companyId, ...itemIds],
  );

  return row?.observed_at ?? null;
}

// --- erasing -----------------------------------------------------------------

/**
 * Counts everything the confirmation dialog needs to speak in real numbers,
 * including the references that block an area from being cleared.
 *
 * One round trip per fact would be simpler to read and slower to run on a cold
 * phone; one query that returns them together keeps the settings screen instant.
 */
export async function countForErase(companyId: string): Promise<EraseCounts> {
  const conn = await db();
  const row = await conn.getFirstAsync<Record<keyof EraseCounts, number>>(
    `SELECT
       (SELECT COUNT(*) FROM items WHERE company_id = ?1
          AND kind IN ('input','packaging','store_supply')) AS inputs,
       (SELECT COUNT(*) FROM recipes   WHERE company_id = ?1) AS recipes,
       (SELECT COUNT(*) FROM products  WHERE company_id = ?1) AS products,
       (SELECT COUNT(*) FROM locations WHERE company_id = ?1
          AND id <> ?1) AS places,
       (SELECT COUNT(*) FROM purchases WHERE company_id = ?1) AS purchases,
       (SELECT COUNT(*) FROM recipe_lines WHERE company_id = ?1
          AND item_id IS NOT NULL) AS recipeLinesUsingInputs,
       (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
          WHERE pl.company_id = ?1
            AND i.kind IN ('input','packaging','store_supply')) AS purchaseLinesUsingItems,
       (SELECT COUNT(*) FROM products WHERE company_id = ?1
          AND recipe_id IS NOT NULL) AS productsUsingRecipes,
       (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
          WHERE pl.company_id = ?1
            AND i.kind IN ('product','resale')) AS purchaseLinesUsingProducts`,
    [companyId],
  );

  return { ...emptyCounts, ...(row ?? {}) };
}

/**
 * Clears an area, in the only order the foreign keys allow.
 *
 * It refuses rather than half-succeeds: the blocker is checked first, and the
 * whole thing runs in one transaction, so an interruption cannot leave a recipe
 * whose ingredients are gone. Half-erased data is worse than either state.
 */
export async function eraseArea(companyId: string, area: EraseArea): Promise<void> {
  const blocker = blockerFor(area, await countForErase(companyId));
  if (blocker) throw new EraseBlockedError(blocker);

  const conn = await db();
  const kinds = itemKindsFor(area);

  await conn.withTransactionAsync(async () => {
    for (const table of tablesFor(area)) {
      // `items` is the one table shared by two areas, so it is the one place a
      // delete has to say which kinds it owns.
      if (table === 'items' && kinds) {
        // `marks` is only ever question marks; the kinds themselves are bound.
        const marks = kinds.map(() => '?').join(', ');  // proofgate-allow
        await conn.runAsync(
          `DELETE FROM items WHERE company_id = ? AND kind IN (${marks})`,
          [companyId, ...kinds],
        );
      } else if (table === 'products' && area === 'products') {
        await conn.runAsync(`DELETE FROM products WHERE company_id = ?`, [companyId]);
        await conn.runAsync(
          `DELETE FROM items WHERE company_id = ? AND kind IN ('product','resale')`,
          [companyId],
        );
      } else if (table === 'outbox') {
        await conn.runAsync(`DELETE FROM outbox`);
      } else {
        // The table name comes from `ErasableTable`, a closed union, so this
        // interpolation cannot carry anything a caller chose. proofgate-allow
        await conn.runAsync(`DELETE FROM ${table} WHERE company_id = ?`, [companyId]);
      }
    }

    // Enqueued *after* the deletes, and that order is the whole point.
    //
    // Erasing everything clears `outbox` too, so a command queued before the
    // loop deleted itself on the way past: the device came out empty and the
    // server never heard, so the next pull restored precisely what the person
    // had asked to destroy.
    //
    // The area is the unit rather than the row: a wipe is one decision, and
    // replaying it row by row would describe something the person never did.
    await enqueue(conn, [{ table: 'erase', rowId: area, op: 'delete', payload: { area } }]);
  });
}

// --- one item, in depth --------------------------------------------------------

export type PriceMoveRow = {
  previousRate: Rate | null;
  newRate: Rate;
  observedAt: string;
};

/**
 * Everything one input has been through.
 *
 * The price history is not a feature anybody maintains - it is the by-product
 * of buying, written by `recordPurchase` on the way past. This is the query
 * that finally shows it, which is what turns "trust me, it went up" into
 * something the person can look at.
 */
export async function itemHistory(
  companyId: string,
  itemId: string,
  limit = 24,
): Promise<PriceMoveRow[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    previous_rate: number | null;
    new_rate: number;
    observed_at: string;
  }>(
    `SELECT previous_rate, new_rate, observed_at
       FROM item_cost_history
      WHERE company_id = ? AND item_id = ?
      ORDER BY observed_at DESC
      LIMIT ?`,
    [companyId, itemId, limit],
  );

  return rows.map((r) => ({
    previousRate: r.previous_rate === null ? null : (r.previous_rate as Rate),
    newRate: r.new_rate as Rate,
    observedAt: r.observed_at,
  }));
}

/**
 * Which recipes stand on this item, at their newest version.
 *
 * It answers the question that decides whether a price move matters: sugar
 * going up 9% is a headline only if eight flavours use it.
 */
export async function recipesUsingItem(
  companyId: string,
  itemId: string,
): Promise<{ id: string; name: string; quantity: number }[]> {
  const conn = await db();
  return conn.getAllAsync<{ id: string; name: string; quantity: number }>(
    `SELECT r.id, r.name, l.quantity
       FROM recipe_lines l
       JOIN recipe_versions v ON v.id = l.recipe_version_id
       JOIN recipes r ON r.id = v.recipe_id
      WHERE l.company_id = ? AND l.item_id = ?
        AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2
                          WHERE v2.recipe_id = v.recipe_id)
      ORDER BY r.name COLLATE NOCASE`,
    [companyId, itemId],
  );
}

export async function findItem(companyId: string, itemId: string): Promise<ItemWithCost | null> {
  // Includes the inactive: the screen that offers to reactivate an item has to
  // be able to open it.
  const all = await listItems(companyId, undefined, true);
  return all.find((item) => item.id === itemId) ?? null;
}

/**
 * Takes an item out of circulation without taking it out of history.
 *
 * Deleting is often refused - a purchase or a recipe stands on the row - and
 * that refusal is correct: erasing an item that an invoice points at would
 * leave a cost nobody can explain. But "I typed the name wrong" and "we stopped
 * buying this" are ordinary things that must have an answer.
 *
 * So the row stays, the past stays intact, and the item stops appearing in the
 * places where you pick something. Reversible, because nothing was destroyed.
 */
export async function setItemActive(
  companyId: string,
  itemId: string,
  active: boolean,
): Promise<void> {
  const conn = await db();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(`UPDATE items SET active = ? WHERE id = ? AND company_id = ?`, [
      active ? 1 : 0,
      itemId,
      companyId,
    ]);
    await enqueue(conn, [{ table: 'items', rowId: itemId }]);
  });
}


/**
 * A grade de cadastro de produto: linha, tipo e sabor.
 *
 * Os três níveis são opcionais de propósito. Uma fábrica que faz um doce só não
 * deve ser obrigada a inventar uma linha e um tipo para cadastrá-lo - é a mesma
 * regra do "depende vira dado": quem tem um nível só preenche um nível só, e a
 * tela some com as perguntas que não se aplicam.
 *
 * O sabor é da empresa e não do tipo. Morango é o mesmo morango no picolé e no
 * pote; amarrá-lo ao tipo faria o dono cadastrar morango uma vez por tipo, e na
 * primeira correção de nome ele teria seis morangos diferentes no relatório.
 */
export type ProductLine = { id: string; name: string; sort: number };
export type ProductType = { id: string; lineId: string; name: string; sort: number };
export type Flavor = { id: string; name: string; sort: number };

export async function listLines(companyId: string): Promise<ProductLine[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ id: string; name: string; sort: number }>(
    `SELECT id, name, sort FROM product_lines
      WHERE company_id = ? AND active = 1
      ORDER BY sort, name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, sort: r.sort }));
}

export async function listTypes(companyId: string, lineId?: string): Promise<ProductType[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    line_id: string;
    name: string;
    sort: number;
  }>(
    `SELECT id, line_id, name, sort FROM product_types
      WHERE company_id = ? AND active = 1${lineId ? ' AND line_id = ?' : ''}
      ORDER BY sort, name COLLATE NOCASE`,
    lineId ? [companyId, lineId] : [companyId],
  );
  return rows.map((r) => ({ id: r.id, lineId: r.line_id, name: r.name, sort: r.sort }));
}

export async function listFlavors(companyId: string): Promise<Flavor[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ id: string; name: string; sort: number }>(
    `SELECT id, name, sort FROM flavors
      WHERE company_id = ? AND active = 1
      ORDER BY sort, name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, sort: r.sort }));
}

/** Uma linha nova, ou o nome de uma existente corrigido. */
export async function saveLine(
  companyId: string,
  input: { id?: string; name: string; sort?: number },
): Promise<string> {
  const conn = await db();
  const id = input.id ?? newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO product_lines (id, company_id, name, sort, active)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`,
      [id, companyId, input.name.trim(), input.sort ?? 0],
    );
    await enqueue(conn, [{ table: 'product_lines', rowId: id }]);
  });
  return id;
}

export async function saveType(
  companyId: string,
  input: { id?: string; lineId: string; name: string; sort?: number },
): Promise<string> {
  const conn = await db();
  const id = input.id ?? newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO product_types (id, company_id, line_id, name, sort, active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`,
      [id, companyId, input.lineId, input.name.trim(), input.sort ?? 0],
    );
    await enqueue(conn, [{ table: 'product_types', rowId: id }]);
  });
  return id;
}

export async function saveFlavor(
  companyId: string,
  input: { id?: string; name: string; sort?: number },
): Promise<string> {
  const conn = await db();
  const id = input.id ?? newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO flavors (id, company_id, name, sort, active)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`,
      [id, companyId, input.name.trim(), input.sort ?? 0],
    );
    await enqueue(conn, [{ table: 'flavors', rowId: id }]);
  });
  return id;
}

/**
 * Erro de cadastro: o tipo escolhido é de outra linha.
 *
 * No servidor isto é chave estrangeira composta - o Postgres recusa sozinho.
 * O SQLite do aparelho não aceita chave composta em `ALTER TABLE ADD COLUMN`,
 * então aqui a mesma garantia é imposta na escrita, e é por isso que ela mora
 * no repositório e não na tela: a tela é decoração, e o assistente grava pelo
 * mesmo caminho sem passar por ela.
 */
export class TypeIsFromAnotherLineError extends Error {
  constructor(readonly typeId: string) {
    super(`type ${typeId} belongs to another line`);
    this.name = 'TypeIsFromAnotherLineError';
  }
}

/** Recusa antes de gravar se o tipo não for da linha. */
export async function assertTypeBelongsToLine(
  companyId: string,
  lineId: string | null,
  typeId: string | null,
): Promise<void> {
  if (!typeId) return;
  const conn = await db();
  const row = await conn.getFirstAsync<{ line_id: string }>(
    'SELECT line_id FROM product_types WHERE id = ? AND company_id = ?',
    [typeId, companyId],
  );
  if (!row || row.line_id !== lineId) throw new TypeIsFromAnotherLineError(typeId);
}

/** Um insumo perto do fim, com o dado que faz a frase: quanto tem e quanto sai por dia. */
export type Running = {
  itemId: string;
  name: string;
  baseUnit: string;
  onHandBaseUnits: number;
  dailyOutflow: number;
  daysLeft: number;
};

/**
 * O que vai acabar antes de você comprar de novo.
 *
 * O consumo diário sai do próprio livro-razão — a média do que saiu nos últimos
 * `days` dias —, não de uma estimativa cadastrada. É a diferença entre um alerta
 * que a fábrica reconhece e um que ela aprende a ignorar: o número vem do que
 * ela fez, e por isso o `[por quê?]` é possível.
 *
 * Insumo parado não aparece. Sem saída não há data de acabar, e inventar uma
 * seria exatamente o alerta inventado que o briefing proíbe.
 *
 * Embalagem entra junto com insumo: palito e saquinho acabam no meio da corrida
 * exatamente como a polpa, e uma fábrica parada por falta de palito está tão
 * parada quanto uma sem morango.
 */
export async function runningOut(
  companyId: string,
  fromIso: string,
  toIso: string,
  days: number,
  horizon = 7,
): Promise<Running[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    base_unit: string;
    on_hand: number;
    out_units: number;
  }>(
    `SELECT i.id AS item_id, i.name, i.base_unit,
            COALESCE((SELECT SUM(m.quantity_base_units) FROM movements m
                       WHERE m.company_id = i.company_id AND m.item_id = i.id), 0) AS on_hand,
            COALESCE((SELECT -SUM(m.quantity_base_units) FROM movements m
                       WHERE m.company_id = i.company_id AND m.item_id = i.id
                         AND m.quantity_base_units < 0
                         AND m.occurred_at >= ? AND m.occurred_at < ?), 0) AS out_units
       FROM items i
      WHERE i.company_id = ? AND i.active = 1 AND i.kind IN ('input', 'packaging')`,
    [fromIso, toIso, companyId],
  );

  const out: Running[] = [];
  for (const r of rows) {
    const dailyOutflow = r.out_units / days;
    const daysLeft = daysOfCover(r.on_hand, dailyOutflow);
    if (daysLeft === null || daysLeft > horizon) continue;
    out.push({
      itemId: r.item_id,
      name: r.name,
      baseUnit: r.base_unit,
      onHandBaseUnits: r.on_hand,
      dailyOutflow,
      daysLeft,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/* ---------------------------------------------------------------------------
 * Pedidos: o que os clientes pediram, e o que falta para atender.
 *
 * Pedido não é movimento, e essa é a decisão que segura o resto. Quando um
 * cliente liga, nada sai do freezer: as caixas continuam lá, e quem conferir a
 * prateleira encontra tudo o que o sistema disse que tem. Gravar demanda como
 * movimento faria o saldo mentir no dia da ligação — e como o livro-razão é
 * append-only, corrigir um pedido que mudou exigiria estornar uma saída que
 * nunca aconteceu.
 *
 * A ligação com o livro-razão acontece uma vez só, e mais tarde: quando a carga
 * sai de verdade, pela transferência, que existe desde a primeira migração.
 * ------------------------------------------------------------------------- */

export type OrderStatus = 'pending' | 'open' | 'delivered' | 'cancelled';

export type OrderLine = { itemId: string; name: string; baseUnits: number };

export type Order = {
  id: string;
  placeId: string;
  /** Vazio quando é o lugar padrão: a palavra dele é da tela, não do banco. */
  placeName: string;
  status: OrderStatus;
  /** `YYYY-MM-DD`, ou nulo quando o cliente não marcou dia. */
  requestedFor: string | null;
  note: string | null;
  createdAt: string;
  lines: OrderLine[];
};

const APPROVAL_KEY = 'orders.needApproval';

/**
 * Se todo pedido nasce esperando aprovação.
 *
 * "Depende de quem usa" vira dado: uma fábrica quer que o dono veja cada pedido
 * antes de a produção começar, outra tem três clientes e a aprovação só atrasa a
 * entrega. Os dois caminhos existem, e o padrão é sem aprovação — a fábrica de
 * seis pessoas é o caso que este produto tem na mão.
 */
export async function ordersNeedApproval(): Promise<boolean> {
  return (await readMeta(APPROVAL_KEY)) === '1';
}

export async function setOrdersNeedApproval(needed: boolean): Promise<void> {
  await writeMeta(APPROVAL_KEY, needed ? '1' : '0');
}

export async function saveOrder(
  companyId: string,
  input: {
    placeId: string;
    requestedFor?: string | null;
    note?: string | null;
    lines: readonly { itemId: string; baseUnits: number }[];
  },
): Promise<Order> {
  const lines = input.lines.filter((l) => l.baseUnits > 0);
  if (lines.length === 0) throw new Error('um pedido sem item não é pedido');

  const conn = await db();
  const id = newId();
  const status: OrderStatus = (await ordersNeedApproval()) ? 'pending' : 'open';
  const createdAt = nowIso();

  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO orders (id, company_id, place_id, status, requested_for, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, input.placeId, status, input.requestedFor ?? null, input.note ?? null, createdAt],
    );

    const writes = [{ table: 'orders', rowId: id }];
    for (const line of lines) {
      const lineId = newId();
      await conn.runAsync(
        `INSERT INTO order_lines (id, company_id, order_id, item_id, base_units)
         VALUES (?, ?, ?, ?, ?)`,
        [lineId, companyId, id, line.itemId, Math.round(line.baseUnits)],
      );
      writes.push({ table: 'order_lines', rowId: lineId });
    }
    await enqueue(conn, writes);
  });

  const [saved] = await listOrders(companyId, [status], id);
  return saved;
}

/**
 * Os pedidos, com as linhas dentro.
 *
 * Duas consultas e não uma por pedido: uma fábrica com quarenta pedidos abertos
 * faria quarenta e uma idas ao banco na abertura da tela, e a lista é o primeiro
 * lugar em que alguém toca de manhã.
 */
export async function listOrders(
  companyId: string,
  statuses: readonly OrderStatus[] = ['pending', 'open'],
  onlyId?: string,
): Promise<Order[]> {
  const conn = await db();
  const marks = statuses.map(() => '?').join(', ');
  const rows = await conn.getAllAsync<{
    id: string;
    place_id: string;
    place_name: string;
    status: OrderStatus;
    requested_for: string | null;
    note: string | null;
    created_at: string;
  }>(
    `SELECT o.id, o.place_id, l.name AS place_name, o.status, o.requested_for, o.note, o.created_at
       FROM orders o
       JOIN locations l ON l.id = o.place_id
      WHERE o.company_id = ? AND o.status IN (${marks}) AND (? IS NULL OR o.id = ?)
      ORDER BY o.requested_for IS NULL, o.requested_for, o.created_at`,
    [companyId, ...statuses, onlyId ?? null, onlyId ?? null],
  );
  if (rows.length === 0) return [];

  const lines = await conn.getAllAsync<{
    order_id: string;
    item_id: string;
    name: string;
    base_units: number;
  }>(
    `SELECT ol.order_id, ol.item_id, i.name, ol.base_units
       FROM order_lines ol
       JOIN items i ON i.id = ol.item_id
      WHERE ol.company_id = ? AND ol.order_id IN (${rows.map(() => '?').join(', ')})
      ORDER BY i.name COLLATE NOCASE`,
    [companyId, ...rows.map((r) => r.id)],
  );

  return rows.map((r) => ({
    id: r.id,
    placeId: r.place_id,
    placeName: r.place_name,
    status: r.status,
    requestedFor: r.requested_for,
    note: r.note,
    createdAt: r.created_at,
    lines: lines
      .filter((l) => l.order_id === r.id)
      .map((l) => ({ itemId: l.item_id, name: l.name, baseUnits: l.base_units })),
  }));
}

/**
 * Aprovar, entregar ou cancelar — a mesma escrita, três palavras diferentes.
 *
 * Não é o livro-razão: pedido muda de estado, e mudar de estado aqui não move
 * um grama de nada. O que move estoque é a carga que sai, e ela é transferência.
 */
export async function setOrderStatus(
  companyId: string,
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const conn = await db();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `UPDATE orders SET status = ?, decided_at = ? WHERE id = ? AND company_id = ?`,
      [status, nowIso(), orderId, companyId],
    );
    await enqueue(conn, [{ table: 'orders', rowId: orderId }]);
  });
}

export type Demand = {
  itemId: string;
  name: string;
  /** Quanto foi pedido e ainda não foi entregue, na unidade base do item. */
  requested: number;
  /** Quanto existe na fábrica agora. O que já está numa loja não conta. */
  onHand: number;
};

/**
 * O que foi pedido contra o que tem na fábrica.
 *
 * O saldo lido é o do LUGAR de onde a carga sai, não o da empresa: mil picolés
 * espalhados em quatro lojas não atendem o cliente que pediu mil na fábrica, e
 * somar tudo diria que está coberto quando não está.
 *
 * Devolve fato — pedido e saldo, item por item. Quem faz a subtração e escreve
 * "falta produzir 300" é a tela, porque a frase é português e esta camada não
 * fala português.
 */
export async function orderedDemand(
  companyId: string,
  throughDate: string,
): Promise<Demand[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    requested: number;
    on_hand: number;
  }>(
    `SELECT ol.item_id, i.name,
            SUM(ol.base_units) AS requested,
            (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = o.company_id
                AND m.item_id = ol.item_id
                AND m.location_id = ?) AS on_hand
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       JOIN items i ON i.id = ol.item_id
      WHERE o.company_id = ?
        AND o.status IN ('pending', 'open')
        AND (o.requested_for IS NULL OR o.requested_for <= ?)
      GROUP BY ol.item_id, i.name
      ORDER BY i.name COLLATE NOCASE`,
    [defaultLocationId(companyId), companyId, throughDate],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    requested: r.requested,
    onHand: r.on_hand,
  }));
}
