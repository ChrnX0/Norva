import { markSent, pendingCount, pendingEntries, type OutboxEntry } from '@/data/outbox';

/**
 * Sending what the phone wrote while it was alone.
 *
 * The engine knows nothing about Supabase, or HTTP, or authentication. It
 * knows the queue and it knows a `Transport`, which is what makes the whole
 * thing testable today, before anyone has signed in: the rules that matter -
 * order, partial acceptance, retries, what may be marked sent - are decided
 * here and proved against a fake.
 *
 * Three rules, and each one is a way this goes wrong in the field:
 *
 *   - **Order is preserved and never skipped.** A recipe line that arrives
 *     before its recipe is a foreign key error. So a batch that is not fully
 *     accepted stops the run; the next attempt starts again from the oldest
 *     thing still pending, rather than pressing on past a hole.
 *
 *   - **Only what the server confirmed is marked sent.** Marking on "the call
 *     did not throw" is how data quietly disappears: the phone forgets, the
 *     server never had it, and nobody finds out until a count comes up short
 *     months later.
 *
 *   - **Failure is a delay, not a loss.** Anything unconfirmed stays in the
 *     queue exactly as it was. Sending it twice is harmless - ids come from
 *     the device and the server upserts on them - so the safe move is always
 *     to try again.
 */

export type PushResult = {
  /** The ids the server actually stored. Anything absent stays queued. */
  acceptedIds: string[];
};

export type Transport = {
  push(entries: readonly OutboxEntry[]): Promise<PushResult>;
};

export type SyncReport = {
  sent: number;
  /** Still queued when the run stopped. Zero means everything is up. */
  remaining: number;
  batches: number;
  attempts: number;
  /** Present when the run stopped early. The queue is intact either way. */
  error?: string;
};

export type SyncOptions = {
  batchSize?: number;
  maxAttempts?: number;
  /** Injected so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/**
 * Exponential backoff with a ceiling.
 *
 * The ceiling matters more than the growth: a phone that spent the night in a
 * freezer should retry a few times an hour, not once a week, and it should not
 * hammer a server that is already having a bad day either.
 */
export function backoffMs(attempt: number, base = 1_000, cap = 60_000): number {
  if (attempt <= 0) return 0;
  return Math.min(cap, base * 2 ** (attempt - 1));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Pushes the queue until it is empty, the server stops accepting, or the
 * attempts run out. Always safe to call again.
 */
export async function drain(
  transport: Transport,
  options: SyncOptions = {},
): Promise<SyncReport> {
  const batchSize = options.batchSize ?? 100;
  const maxAttempts = options.maxAttempts ?? 3;
  const sleep = options.sleep ?? defaultSleep;

  let sent = 0;
  let batches = 0;
  let attempts = 0;
  let error: string | undefined;

  while (attempts < maxAttempts) {
    const batch = await pendingEntries(batchSize);
    if (batch.length === 0) break;

    attempts += 1;

    let result: PushResult;
    try {
      result = await transport.push(batch);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      // Nothing is marked: the whole batch is still exactly where it was.
      if (attempts < maxAttempts) await sleep(backoffMs(attempts));
      continue;
    }

    const accepted = new Set(result.acceptedIds);
    const confirmed = batch.filter((entry) => accepted.has(entry.id));

    await markSent(confirmed.map((entry) => entry.id));
    sent += confirmed.length;
    batches += 1;

    if (confirmed.length < batch.length) {
      // A gap. Stopping here is deliberate: continuing would send rows whose
      // parents the server does not have, and turn one rejection into many.
      error = `O servidor aceitou ${confirmed.length} de ${batch.length} registros.`;
      if (attempts < maxAttempts) await sleep(backoffMs(attempts));
      continue;
    }

    error = undefined;
    if (batch.length < batchSize) break;
  }

  return { sent, remaining: await pendingCount(), batches, attempts, error };
}
