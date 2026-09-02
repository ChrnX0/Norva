import { nowIso } from './db';
import {
  listItems,
  listPlaces,
  listProducts,
  recordProduction,
  recordPurchase,
  recordTransfer,
  savePlace,
} from './repository';
import { LOCAL_COMPANY_ID } from './seed';
import { dayWindow } from '@/domain/day';
import { cents } from '@/domain/money';

/**
 * Two weeks of a factory that exists, written through the real front door.
 *
 * The example this app ships with is one day old and has never moved: enough to
 * prove a screen renders, not enough to prove it says anything. Half the
 * briefing only has something to say when there IS a past - "saíram 1.200 hoje,
 * 200 a mais que na segunda passada" cannot be tested against a database whose
 * whole history is this morning. That gap is not hypothetical: the comparison
 * this screen makes had no test exercising it, for exactly this reason.
 *
 * So this writes days of operation - production runs, deliveries to stores,
 * invoices that move the average cost - and it writes them the way the app
 * does, calling `recordProduction`, `recordTransfer` and `recordPurchase`. It
 * never touches a table directly. A simulation that wrote SQL of its own would
 * be proving that the simulation works.
 *
 * Deterministic on purpose. The same call produces the same fortnight, so a
 * test that fails can be run again and fail the same way - and so the owner
 * looking at the screen and the suite looking at the assertion are looking at
 * one factory, not two.
 */

/** A tiny LCG. Same seed, same fortnight, on any machine and any day. */
function rolls(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export type Simulation = {
  days: number;
  runs: number;
  deliveries: number;
  invoices: number;
};

export async function simulateFortnight(
  companyId = LOCAL_COMPANY_ID,
  options: { days?: number; seed?: number; timeZone?: string } = {},
): Promise<Simulation> {
  const days = options.days ?? 14;
  const next = rolls(options.seed ?? 20260901);
  const timeZone = options.timeZone ?? 'America/Sao_Paulo';

  const products = (await listProducts(companyId)).filter((p) => p.recipeId);
  if (products.length === 0) throw new Error('não há produto com receita para simular');

  // Somewhere for the load to go. A factory with no store never ships anything,
  // and the transport screen would stay as empty as it is today.
  const places = await listPlaces(companyId);
  const factory = places.find((p) => p.isDefault) ?? places[0];
  let store = places.find((p) => !p.isDefault);
  if (!store) store = await savePlace(companyId, { name: 'Loja Centro', kind: 'own_store' });

  const tally: Simulation = { days, runs: 0, deliveries: 0, invoices: 0 };

  // Oldest first, so every cost the ledger freezes is the cost that was true on
  // that day - writing backwards would freeze today's price onto last week.
  for (let back = days - 1; back >= 0; back -= 1) {
    const day = dayWindow(nowIso(), timeZone, -back);
    const at = (hour: number) =>
      new Date(new Date(day.from).getTime() + hour * 3_600_000).toISOString();

    // Sunday is quiet. A week where every day looks the same teaches the
    // briefing to compare noise with noise.
    const weekday = new Date(day.from).getUTCDay();
    if (weekday === 0) continue;

    // A compra vem primeiro, e vem porque o insumo está acabando - não por
    // sorteio. Uma fábrica compra quando falta, e uma simulação que compra ao
    // acaso fica sem polpa no quarto dia e depois só mostra tela vazia. A nota
    // entrando antes do tacho também importa: nota que chega depois congelaria
    // no custo um preço que a fábrica não pagou naquela manhã.
    const inputs = (await listItems(companyId)).filter(
      (i) => i.kind === 'input' && (i.purchaseToBase ?? 0) > 0,
    );
    for (const item of inputs) {
      const pack = item.purchaseToBase ?? 1;
      if (item.onHandBaseUnits >= pack * 3) continue;

      const packs = 4 + Math.floor(next() * 3);
      const baseUnits = packs * pack;
      // O preço anda de -8% a +12% entre compras: é isso que dá à home o que
      // dizer, e é o que uma fábrica vive.
      const drift = 0.92 + next() * 0.2;
      const totalCents = Math.round(baseUnits * (item.averageRate || 1) * drift);
      if (totalCents <= 0) continue;

      await recordPurchase(companyId, {
        itemId: item.id,
        purchaseQuantity: packs,
        baseUnits,
        totalCents: cents(totalCents),
        occurredAt: at(7),
      });
      tally.invoices += 1;
    }

    // One or two kettles, and what came out is never exactly what the sheet
    // promised - that ratio is the whole reason production is recorded.
    const kettles = next() < 0.3 ? 2 : 1;
    for (let k = 0; k < kettles; k += 1) {
      const product = products[Math.floor(next() * products.length)];
      const planned = 500;
      const made = Math.round(planned * (0.9 + next() * 0.14));
      try {
        await recordProduction(companyId, {
          productId: product.id,
          locationId: factory.id,
          batches: 1,
          unitsProduced: made,
          occurredAt: at(9 + k * 3),
        });
        tally.runs += 1;
      } catch {
        // Faltou insumo naquele dia: acontece numa fábrica, e a corrida
        // simplesmente não aconteceu. Não é erro da simulação.
      }
    }

    // And in the afternoon, part of it leaves.
    if (next() < 0.7) {
      const product = products[Math.floor(next() * products.length)];
      const held = (await listItems(companyId)).find((i) => i.id === product.itemId);
      const available = held?.onHandBaseUnits ?? 0;
      const sent = Math.min(available, 100 + Math.floor(next() * 300));
      if (sent > 0) {
        await recordTransfer(companyId, {
          itemId: product.itemId,
          fromLocationId: factory.id,
          toLocationId: store.id,
          baseUnits: sent,
          occurredAt: at(16),
        });
        tally.deliveries += 1;
      }
    }
  }

  return tally;
}
