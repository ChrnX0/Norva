import type { CostChange, ItemWithCost, Product } from '@/data/repository';
import type { Cents } from '@/domain/money';
import type { ItemCosts, Recipe } from '@/domain/recipe';

/**
 * The assistant, as a contract.
 *
 * Two rules shape everything in this folder, and both come from the same worry:
 * a wrong number about money destroys trust permanently, and it never comes
 * back.
 *
 *   1. **The assistant never produces a number.** It recognises what was asked,
 *      the deterministic engine computes, and the answer is phrased around the
 *      figure the engine returned. When a language model is added it will map
 *      wording to a skill and its slots - nothing else. It stays an interpreter,
 *      never an accountant.
 *
 *   2. **The assistant never writes to the ledger.** It fills a draft in plain
 *      language and a human confirms. If it misunderstood, that shows up before
 *      anything is recorded rather than months later in a report.
 */

/** The same enum the database declares. A role is a bundle of these. */
export type Capability =
  | 'view_cost'
  | 'view_sale_price'
  | 'record_production'
  | 'dispatch'
  | 'check_receipt'
  | 'record_loss'
  | 'place_order'
  | 'approve_order'
  | 'adjust_stock'
  | 'view_finance'
  | 'issue_invoice'
  | 'manage_company';

/**
 * Everything the assistant is allowed to reach, as functions rather than SQL.
 *
 * It is deliberately the same set the screens call. An assistant with a query
 * path of its own eventually reports a different number than the screen showing
 * the same thing, and the app loses its credibility in a single day.
 */
export type AssistantData = {
  listItems(): Promise<ItemWithCost[]>;
  listProducts(): Promise<Product[]>;
  loadRecipeGraph(): Promise<Record<string, Recipe>>;
  itemCosts(): Promise<ItemCosts>;
  labels(): Promise<Record<string, string>>;
  recentCostChanges(limit: number): Promise<CostChange[]>;
  recordPurchase(input: {
    itemId: string;
    purchaseQuantity: number;
    baseUnits: number;
    totalCents: Cents;
    supplierName?: string;
  }): Promise<unknown>;
};

/**
 * A filled form waiting for a human yes.
 *
 * `summary` is what the person reads before confirming, written the way they
 * would say it out loud - with the numbers spelled out, never as field labels.
 */
export type Draft = {
  kind: 'purchase';
  summary: string;
  apply: () => Promise<void>;
};

export type Answer = {
  /** One or two sentences. Plain words, verb first, no jargon. */
  text: string;
  /** What `[por quê?]` opens: the arithmetic behind the sentence. */
  detail?: { label: string; value: string }[];
  /** The screen that resolves this, when there is one. */
  route?: string;
  draft?: Draft;
};

export type SkillContext = {
  data: AssistantData;
  capabilities: ReadonlySet<Capability>;
  locale: import('@/i18n').LocaleSettings;
};

export type Skill = {
  id: string;
  /** Shown when the assistant has to say what it does know. */
  example: string;
  /**
   * The capability the answer requires. The check happens here, before the
   * query runs - the figure never enters the answer at all. A model told to
   * keep a secret eventually tells it; a query that never returned the number
   * cannot.
   */
  requires?: Capability;
  match(question: string): RegExpMatchArray | null;
  run(match: RegExpMatchArray, context: SkillContext): Promise<Answer>;
};
