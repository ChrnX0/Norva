import { empresaAdotada } from '@/data/empresa';
import { forgetSentBefore, markSent, pendingCount, pendingEntries, type OutboxEntry } from '@/data/outbox';

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
  /**
   * Presente quando a fila NEM FOI TENTADA, com o motivo — e é outra coisa que
   * `error`.
   *
   * "O servidor recusou" e "eu não tentei" chegavam indistinguíveis na mesma
   * cadeia de caracteres, e a diferença é o que a tela precisa dizer: uma pede
   * para tentar de novo, a outra pede uma decisão de quem está com o aparelho.
   */
  recusa?: 'semEmpresa';
};

export type SyncOptions = {
  batchSize?: number;
  maxAttempts?: number;
  /** Injected so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected so a test pode envelhecer a fila sem esperar uma semana. */
  now?: () => number;
  /**
   * Por quantos dias a fila guarda o que já subiu. Sete.
   *
   * O docblock do `forgetSentBefore` dizia as duas metades desde que foi escrito:
   * vale guardar "por alguns dias, para poder dizer a alguém o que subiu e o que
   * não subiu", e vale largar depois disso "para o celular de uma fábrica movimentada
   * não carregar um ano deles". A auditoria listou a função como sem chamador fora de
   * teste, e ela estava certa — mas o conserto não é apagar: é a limpeza acontecer,
   * porque sem ela a fila só cresce no dia em que a sincronia existir.
   *
   * Sete porque é a janela em que alguém ainda pergunta "aquilo de terça subiu?".
   */
  keepDays?: number;
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

  // Nada sobe antes de o aparelho saber de que empresa ele é.
  //
  // Cada linha daqui é carimbada com a empresa deste aparelho. Enquanto ela for a
  // semente — o id com que toda instalação nasce —, o servidor não conhece essa
  // empresa e a conta que empurra não é membro dela: a fila inteira é recusada
  // por chave estrangeira e por política, e o que aparece é um erro de banco.
  // Recusar aqui é a Lei 5: o erro impede, e diz o que falta.
  if (!empresaAdotada()) {
    return {
      sent: 0,
      remaining: await pendingCount(),
      batches: 0,
      attempts: 0,
      recusa: 'semEmpresa',
    };
  }

  let sent = 0;
  let batches = 0;
  let attempts = 0;
  let error: string | undefined;

  /**
   * **O orçamento de tentativa conta FALHA, não rodada.**
   *
   * `attempts` era o contador do laço e o orçamento ao mesmo tempo, e as duas coisas
   * são diferentes: com `maxAttempts` no padrão de três e `batchSize` em cem, uma
   * fila de mil linhas subia trezentas e parava — sem erro nenhum, com `error`
   * indefinido e novecentas linhas pendentes. Nada na tela dizia que faltou; a
   * corrida seguinte pegava mais trezentas. Uma fila que só anda em múltiplos de
   * trezentos por chamada é uma fila que nunca esvazia num aparelho movimentado.
   *
   * Falha volta a zero depois de uma fatia aceita inteira, que é o que "três
   * tentativas" quer dizer: três seguidas sem progresso, não três fatias na vida.
   */
  let falhas = 0;

  while (falhas < maxAttempts) {
    const batch = await pendingEntries(batchSize);
    if (batch.length === 0) break;

    attempts += 1;

    let result: PushResult;
    try {
      result = await transport.push(batch);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      falhas += 1;
      // Nothing is marked: the whole batch is still exactly where it was.
      if (falhas < maxAttempts) await sleep(backoffMs(falhas));
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
      falhas += 1;
      if (falhas < maxAttempts) await sleep(backoffMs(falhas));
      continue;
    }

    // Fatia inteira aceita: o orçamento de tentativa recomeça. Sem isto, uma falha
    // no começo de uma fila longa condenaria a corrida inteira duas fatias depois.
    falhas = 0;
    error = undefined;
    if (batch.length < batchSize) break;
  }

  /**
   * A faxina, e ela roda mesmo quando a corrida terminou torta.
   *
   * Só apaga linha que o SERVIDOR confirmou e que já passou da janela — as duas
   * condições no `WHERE`, não aqui. Então não há caso em que segurá-la proteja
   * alguém: o que está pendente fica, tenha a corrida ido bem ou mal, e é isso
   * que o teste do outbox cobra ("only what went up").
   *
   * A hora vem de uma subtração de INSTANTES, nunca de recortar texto de data: a
   * cicatriz do `dayWindow` é de um teste que carimbou `Z` numa data local e ficou
   * cego entre meia-noite e três da manhã.
   */
  const agora = options.now?.() ?? Date.now();
  const corte = new Date(agora - (options.keepDays ?? 7) * 86_400_000).toISOString();
  await forgetSentBefore(corte);

  return { sent, remaining: await pendingCount(), batches, attempts, error };
}
