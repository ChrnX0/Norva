import type { OutboxEntry } from '@/data/outbox';

/**
 * The one place a device row becomes something the server accepts.
 *
 * This file exists because for a long time nothing did. The outbox queued
 * `{table, rowId}` and the send engine handed entries to an abstract transport,
 * so the step where SQLite's shapes meet Postgres's had no code in it at all -
 * which is exactly why six mismatches sat there unseen. There was nothing to be
 * wrong.
 *
 * Three kinds of difference have to be crossed here, and each one silently
 * corrupts or refuses a write if it is missed:
 *
 *   TYPE.  SQLite has no boolean. `active` is 0 or 1 on the phone and `true` or
 *          `false` on the server, and Postgres does not quietly cast one to the
 *          other - the insert fails outright.
 *
 *   SHAPE. Some columns exist on one side only. `purchase_lines.created_at` is
 *          the device's own bookkeeping and the server does not want it; a
 *          column sent that does not exist is an error, not an ignored field.
 *
 *   IDENTITY. `movements.recorded_by` and `purchases.created_by` are NOT NULL
 *          and reference a real user. The device has no user - it is one
 *          person's phone, working offline, and who they are is known only at
 *          the moment of sending. So the actor is stamped here, on the way out,
 *          rather than stored on every row from the start.
 *
 * Everything is explicit. There is no "send whatever columns the row has",
 * because that is how a device column added next month reaches the server as a
 * silent failure instead of a compile error.
 */

/** Who is sending. Known at sync time, never at write time. */
export type SyncActor = {
  /** The authenticated user's id, for the columns the server requires. */
  userId: string;
};

export type ServerWrite =
  | { kind: 'upsert'; table: ServerTable; row: Record<string, unknown> }
  /** Not a row: a command saying an area was cleared on the device. */
  | { kind: 'erase'; area: string }
  /**
   * Deliberately not sent.
   *
   * `item_costs` is a derived value, and derived values get exactly one owner.
   * The device computes an average locally because it must show a cost with no
   * signal; the server computes its own from the purchase lines, by the same
   * rule, in a trigger. Sending the device's copy gives the number two authors,
   * and the replay proved what that costs: the queue carries row *ids*, so it
   * resends whatever the row says now, and the server's trigger then blended a
   * new invoice against an average that only existed after it - arriving at
   * 0.5605 where the device said 0.5310.
   *
   * So the local average stays local. What travels is the invoice; the average
   * is what both sides conclude from it, and check 6 makes them agree.
   */
  | { kind: 'derived'; table: string };

export type ServerTable =
  | 'locations'
  | 'items'
  | 'recipes'
  | 'recipe_versions'
  | 'recipe_lines'
  | 'product_lines'
  | 'product_types'
  | 'flavors'
  | 'products'
  | 'lots'
  | 'purchases'
  | 'purchase_lines'
  | 'orders'
  | 'order_lines'
  | 'movements';

export class UnknownTableError extends Error {
  constructor(public readonly table: string) {
    super(`Nothing knows how to send rows of "${table}"`);
    this.name = 'UnknownTableError';
  }
}

/** SQLite's 0/1 as the server's boolean. Anything missing counts as true. */
function flag(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return value === 1 || value === '1' || value === true;
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * The packaging hierarchy as a structure, not as text.
 *
 * SQLite has no JSON column, so the device stores this as a string; the server
 * column is `jsonb`. Sent as it is stored, Postgres accepts it happily and
 * keeps a quoted *string* where an array belongs - the write succeeds, nothing
 * complains, and the packaging is unusable on the other side. The failures that
 * still look like successes are the ones worth writing a function for.
 */
function structure(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * How each table crosses. `take` lists the columns that travel unchanged;
 * `build` adds everything that is converted, renamed or stamped.
 *
 * A table absent from here cannot be sent, and that is deliberate: a new device
 * table is a decision about what the server should receive, not something to
 * infer at runtime.
 */
const CROSSINGS: Record<
  ServerTable,
  {
    take: readonly string[];
    build?: (row: Record<string, unknown>, actor: SyncActor) => Record<string, unknown>;
  }
> = {
  locations: {
    take: ['id', 'company_id', 'name', 'kind', 'created_at'],
  },

  items: {
    take: [
      'id',
      'company_id',
      'kind',
      'name',
      'purchase_unit',
      'purchase_to_base',
      'base_unit',
      'created_at',
    ],
    build: (row) => ({ active: flag(row.active), packaging: structure(row.packaging) }),
  },

  recipes: {
    take: ['id', 'company_id', 'name', 'yield_amount', 'yield_unit', 'created_at'],
    build: (row) => ({ active: flag(row.active) }),
  },

  recipe_versions: {
    take: [
      'id',
      'company_id',
      'recipe_id',
      'version',
      'effective_from',
      'loss_fraction',
      'note',
      'created_at',
    ],
  },

  recipe_lines: {
    // `position` only became a server column once this file existed to notice
    // it was missing: without it a synced recipe comes back with its
    // ingredients in an order nobody chose.
    take: [
      'id',
      'company_id',
      'recipe_version_id',
      'item_id',
      'sub_recipe_id',
      'quantity',
      'position',
    ],
  },

  // A grade tem que atravessar junto, e a ordem em que ela é enfileirada é a
  // ordem em que ela chega: linha antes do tipo, tipo antes do produto. A fila
  // é enviada da mais velha para a mais nova exatamente por isso.
  product_lines: {
    take: ['id', 'company_id', 'name', 'sort'],
    build: (row) => ({ active: flag(row.active) }),
  },

  product_types: {
    take: ['id', 'company_id', 'line_id', 'name', 'sort'],
    build: (row) => ({ active: flag(row.active) }),
  },

  flavors: {
    take: ['id', 'company_id', 'name', 'sort'],
    build: (row) => ({ active: flag(row.active) }),
  },

  products: {
    take: [
      'id',
      'company_id',
      'item_id',
      'recipe_id',
      'yield_per_unit',
      'unit_packaging_cents',
      'shelf_life_days',
      'line_id',
      'type_id',
      'flavor_id',
    ],
    build: (row) => ({ active: flag(row.active) }),
  },

  // O lote atravessa antes do movimento que o cita, e a fila cuida disso
  // sozinha: ela é enviada da escrita mais velha para a mais nova, e
  // `recordProduction` grava o lote antes das linhas. Fosse ao contrário, o
  // servidor recusaria o movimento por chave estrangeira - o aparelho não tem
  // essa FK, então é aqui que a ordem tem que estar certa.
  lots: {
    take: ['id', 'company_id', 'item_id', 'code', 'produced_on', 'expires_on', 'created_at'],
  },

  purchases: {
    take: ['id', 'company_id', 'supplier_name', 'ordered_at', 'received_at', 'created_at'],
    build: (_row, actor) => ({ created_by: actor.userId }),
  },

  purchase_lines: {
    // `created_at` stays behind: it is the device's own bookkeeping, and the
    // server has no column for it.
    take: [
      'id',
      'company_id',
      'purchase_id',
      'item_id',
      'purchase_quantity',
      'base_units',
      'total_cents',
    ],
  },

  // Pedido atravessa antes das linhas dele, e a fila é enviada da mais velha
  // para a mais nova - que é o que garante essa ordem sem ninguém ordenar nada.
  orders: {
    take: [
      'id',
      'company_id',
      'place_id',
      'status',
      'requested_for',
      'note',
      'created_at',
      'decided_at',
    ],
    // Qual CONTA anotou o pedido. Como em `purchases`, o aparelho não sabe quem
    // é enquanto está offline: o ator é carimbado na saída.
    build: (_row, actor) => ({ recorded_by: actor.userId }),
  },

  order_lines: {
    take: ['id', 'company_id', 'order_id', 'item_id', 'base_units'],
  },

  movements: {
    take: [
      'id',
      'company_id',
      'kind',
      'occurred_at',
      'recorded_at',
      'item_id',
      'quantity_base_units',
      'location_id',
      'lot_id',
      // Em qual dos quatro postos de controle a linha foi escrita. Nulo em
      // compra, produção e contagem: elas não acontecem num posto. Sem esta
      // linha o fato existiria só no celular - a lista é fechada de propósito,
      // e o que fica fora dela some em silêncio.
      'post',
      'loss_reason',
      'unit_cost_rate',
      // Nulo até o aparelho saber qual aparelho ele é.
      //
      // A coluna existe no servidor e é opcional, então nada quebra e nada
      // reclama - que é exatamente por que ela está listada aqui em vez de
      // esperar alguém lembrar. Quando a identidade chegar, o valor entra; o
      // lugar onde ele entra já está escrito.
      'device_id',
      // As duas colunas que um ato de mais de uma linha precisa: o grupo que
      // amarra as sete linhas de uma corrida, e para onde foi a outra metade de
      // uma transferência. Explícitas aqui de propósito - a lista é fechada
      // para que coluna nova não vire falha silenciosa.
      'movement_group_id',
      'counterpart_location_id',
      // Quem estava operando na hora, anotado no registro. Nulo quando a
      // empresa não quer nomear ninguém - e nulo é resposta, não ausência: a
      // linha continua respondendo pelo aparelho e pela conta.
      'operator_id',
      'reverses_movement_id',
      'assistant_phrase',
      'note',
    ],
    /**
     * A conta que escreveu, e ela não se cede.
     *
     * O servidor impõe `recorded_by = auth.uid()` na política de append, provado
     * contra o Postgres na `db:verify`: a mesma escrita é aceita nomeando o
     * próprio usuário da sessão e recusada nomeando qualquer outro. Como o login
     * é da empresa, essa conta É quem sincroniza - não há o que decidir aqui.
     *
     * Quem estava operando é outra pergunta, e viaja em `operator_id`.
     */
    build: (_row, actor) => ({ recorded_by: actor.userId }),
  },
};

/** Every table this device knows how to send, for tests and for guards. */
export const sendableTables = Object.keys(CROSSINGS) as ServerTable[];

/**
 * Turns one queued entry plus the row it names into what the server should get.
 *
 * `row` is null for a command like `erase`, which carries its own payload and
 * has no row behind it. A queued table nobody has taught this file about
 * throws rather than being skipped: a write that silently never arrives is the
 * worst outcome available.
 */
export function serialize(
  entry: OutboxEntry,
  row: Record<string, unknown> | null,
  actor: SyncActor,
): ServerWrite {
  if (entry.table === 'item_costs' || entry.table === 'item_cost_history') {
    return { kind: 'derived', table: entry.table };
  }

  if (entry.table === 'erase') {
    const area = entry.payload?.area;
    return { kind: 'erase', area: typeof area === 'string' ? area : entry.rowId };
  }

  const crossing = CROSSINGS[entry.table as ServerTable];
  if (!crossing) throw new UnknownTableError(entry.table);

  if (!row) {
    throw new Error(`Queued ${entry.table} ${entry.rowId} but the row is gone from the device`);
  }

  const out: Record<string, unknown> = {};
  for (const column of crossing.take) out[column] = nullable(row[column]);
  Object.assign(out, crossing.build?.(row, actor) ?? {});

  return { kind: 'upsert', table: entry.table as ServerTable, row: out };
}
