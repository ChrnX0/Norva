import type { AssistantData } from '@/assistant/types';
import { unidadeDaqui } from './unidade';
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
    // Da UNIDADE deste aparelho: o assistente responde por frase, e uma frase
    // afirmativa não tem como dizer de onde veio. "Conferido em 3/9" com a
    // conferência da outra cidade é pior aqui que numa tela.
    itemMovements: (itemId, limit) =>
      itemMovements(companyId, itemId, limit, { unidade: unidadeDaqui() }),
    // A unidade deste aparelho, como as telas. O assistente responde por FRASE, e
    // frase afirmativa não tem como dizer de onde o número veio: *"a fábrica fez 900
    // hoje"* com as duas cidades somadas passa como fato, e quem ouve decide com ele.
    productionOn: (from, to) => productionOn(companyId, from, to, { unidade: unidadeDaqui() }),
    lossesOn: (from, to) => lossesOn(companyId, from, to, { unidade: unidadeDaqui() }),
    recordPurchase: (input) => recordPurchase(companyId, input),
    // O assistente conta a prateleira do lugar padrão, e a habilidade só chega
    // aqui depois de conferir que o item está num lugar só - com o item em duas
    // salas ela para e diz quais (`src/assistant/skills.ts`, registerCount).
    // O local é exigido aqui, e não com padrão lá dentro, por isso mesmo: a
    // decisão de onde gravar mora em quem sabe fazer a pergunta.
    recordCount: (input) =>
      recordCount(companyId, { ...input, locationId: unidadeDaqui() }),
    listPlaces: () => listPlaces(companyId),
    stockByPlace: () => stockByPlace(companyId),
    defaultPlaceId: () => unidadeDaqui(),
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
        locationId: unidadeDaqui(),
        producedOn: localDate(nowIso(), timeZone),
      }),
    recordTransfer: (input) =>
      recordTransfer(companyId, { ...input, fromLocationId: unidadeDaqui() }),
    saveItem: (input) =>
      saveItem(companyId, { ...input, packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] } }),
  };
}
