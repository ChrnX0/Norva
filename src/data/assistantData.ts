import type { AssistantData } from '@/assistant/types';
import { nowIso } from '@/data/db';
import { localDate } from '@/domain/day';
import {
  itemCosts,
  itemMovements,
  labels,
  listItems,
  listProducts,
  loadRecipeGraph,
  recentCostChanges,
  productionOn,
  lossesOn,
  recordCount,
  listPlaces,
  recordProduction,
  recordPurchase,
  recordTransfer,
  saveItem,
  stockByPlace,
  defaultLocationId,
} from './repository';

/**
 * The assistant, wired to the real database.
 *
 * Note what this file is: a binding, not a query. Every function below is the
 * one the screens already call, with the company filled in. The assistant is
 * physically unable to ask the database anything the screens cannot ask, which
 * is what keeps the two from ever reporting different numbers for the same
 * thing.
 */
export function liveData(companyId: string, timeZone: string): AssistantData {
  return {
    listItems: () => listItems(companyId),
    listProducts: () => listProducts(companyId),
    loadRecipeGraph: () => loadRecipeGraph(companyId),
    itemCosts: () => itemCosts(companyId),
    labels: () => labels(companyId),
    recentCostChanges: (limit) => recentCostChanges(companyId, limit),
    itemMovements: (itemId, limit) => itemMovements(companyId, itemId, limit),
    productionOn: (from, to) => productionOn(companyId, from, to),
    lossesOn: (from, to) => lossesOn(companyId, from, to),
    recordPurchase: (input) => recordPurchase(companyId, input),
    // O assistente conta a prateleira do lugar padrão, e a habilidade só chega
    // aqui depois de conferir que o item está num lugar só - com o item em duas
    // salas ela para e diz quais (`src/assistant/skills.ts`, registerCount).
    // O local é exigido aqui, e não com padrão lá dentro, por isso mesmo: a
    // decisão de onde gravar mora em quem sabe fazer a pergunta.
    recordCount: (input) =>
      recordCount(companyId, { ...input, locationId: defaultLocationId(companyId) }),
    listPlaces: () => listPlaces(companyId),
    stockByPlace: () => stockByPlace(companyId),
    defaultPlaceId: () => defaultLocationId(companyId),
    // A produção sai no lugar padrão, pelo mesmo motivo da contagem: enquanto
    // há uma fábrica só, perguntar qual é pedir o que o sistema já sabe.
    //
    // O DIA, porém, não se adivinha: o lote nasce com a data de calendário da
    // fábrica, e transformar o instante em dia precisa do fuso. Ele entra por
    // aqui, vindo da tela, pelo mesmo motivo que o local: quem sabe o fato é
    // quem tem a pergunta na mão.
    recordProduction: (input) =>
      recordProduction(companyId, {
        ...input,
        locationId: defaultLocationId(companyId),
        producedOn: localDate(nowIso(), timeZone),
      }),
    recordTransfer: (input) =>
      recordTransfer(companyId, { ...input, fromLocationId: defaultLocationId(companyId) }),
    saveItem: (input) =>
      saveItem(companyId, { ...input, packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] } }),
  };
}
