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
    recordCount: (input) => recordCount(companyId, input),
  };
}
