import type { CostChange, ItemWithCost, MovementRow, Product } from '@/data/repository';
import type { Capability } from '@/domain/access';
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

/**
 * Re-exported, never redefined.
 *
 * The vocabulary lives in the domain because three different things speak it:
 * the server's row level security, this assistant, and the screens. A second
 * copy here would drift from the first the week somebody adds a capability.
 */
export type { Capability } from '@/domain/access';

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
  /** The movements behind one item's balance - what `[por quê?]` opens. */
  itemMovements(itemId: string, limit?: number): Promise<MovementRow[]>;
  recordCount(input: {
    itemId: string;
    countedBaseUnits: number;
    assistantPhrase?: string;
  }): Promise<unknown>;
  /** Creates an input from a conversation. Same function the cadastro screen calls. */
  saveItem(input: {
    kind: 'input' | 'packaging' | 'store_supply';
    name: string;
    purchaseUnit: string | null;
    purchaseToBase: number | null;
    baseUnit: string;
  }): Promise<string>;
  recordPurchase(input: {
    itemId: string;
    purchaseQuantity: number;
    baseUnits: number;
    totalCents: Cents;
    supplierName?: string;
    assistantPhrase?: string;
  }): Promise<unknown>;
};

/**
 * A filled form waiting for a human yes.
 *
 * `summary` is what the person reads before confirming, written the way they
 * would say it out loud - with the numbers spelled out, never as field labels.
 */
export type Draft = {
  kind: 'purchase' | 'count' | 'item';
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
  /**
   * What the person actually said, filled in by `ask`.
   *
   * Only the skills that WRITE use it, and they use it for one thing: stamping
   * the movement with the sentence that created it. The plan's condition for
   * letting an assistant write at all is that its writes stay auditable, and a
   * movement that cannot say where it came from is not.
   */
  question?: string;
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
