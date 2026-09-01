import type { AssistantData } from '@/assistant/types';
import {
  itemCosts,
  itemMovements,
  labels,
  listItems,
  listProducts,
  loadRecipeGraph,
  recentCostChanges,
  recordCount,
  recordPurchase,
  saveItem,
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
export function liveData(companyId: string): AssistantData {
  return {
    listItems: () => listItems(companyId),
    listProducts: () => listProducts(companyId),
    loadRecipeGraph: () => loadRecipeGraph(companyId),
    itemCosts: () => itemCosts(companyId),
    labels: () => labels(companyId),
    recentCostChanges: (limit) => recentCostChanges(companyId, limit),
    itemMovements: (itemId, limit) => itemMovements(companyId, itemId, limit),
    recordPurchase: (input) => recordPurchase(companyId, input),
    // O assistente conta a prateleira do lugar padrão. Quando existir mais de
    // um, a habilidade passa a perguntar qual - e é por isso que o local é
    // exigido aqui em vez de ter padrão lá dentro: a pergunta aparece na tela
    // que sabe fazê-la, não escondida numa função de dados.
    recordCount: (input) =>
      recordCount(companyId, { ...input, locationId: defaultLocationId(companyId) }),
    saveItem: (input) =>
      saveItem(companyId, { ...input, packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] } }),
  };
}
