/**
 * The factory's day, as a window the ledger can be asked about.
 *
 * A day is not 24 hours from now: it is midnight to midnight where the factory
 * stands. The device clock is in the operator's timezone and the ledger stores
 * UTC instants, so the conversion has to happen somewhere - and doing it in the
 * screen, by hand, is how one screen ends up disagreeing with the next about
 * what "today" means.
 *
 * Half-open on purpose - `[from, to)`. Two consecutive days asked back to back
 * cover every movement exactly once, and a run at exactly midnight lands in one
 * of them, never in both.
 */
export type DayWindow = { from: string; to: string };

/**
 * Midnight-to-midnight around `at`, in the given timezone, shifted by `days`.
 *
 * `dayWindow(now, tz, 0)` is today; `-7` is the same weekday a week ago, which
 * is the comparison a factory actually makes: Monday against Monday, because a
 * Monday and a Saturday are different businesses.
 */
/**
 * A data de calendário local, `YYYY-MM-DD`.
 *
 * Existe porque o dia que um cliente combina NÃO é um instante. O livro-razão
 * grava instantes - "às 14h32 saíram 40 caixas" - e a janela do dia converte
 * isso para o fuso da fábrica. Um pedido "para quinta" não tem hora nenhuma:
 * é uma data de calendário, e tratá-la como instante desloca o dia inteiro em
 * metade dos fusos do mundo.
 *
 * O atalho tentador é `dayWindow(...).from.slice(0, 10)`, e ele está errado
 * onde o fuso é positivo: a meia-noite local de 3 de setembro em Madri é
 * 2 de setembro às 22h em UTC, e o corte devolve o dia anterior. Aqui a conta
 * é feita sobre a data local, nunca sobre o instante.
 */
export function localDate(atIso: string, timeZone: string, days = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(atIso));

  const [y, m, d] = parts.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dayWindow(atIso: string, timeZone: string, days = 0): DayWindow {
  const at = new Date(atIso);

  // What calendar day this instant falls on, over there. Asking Intl rather
  // than doing arithmetic is what makes this correct across a daylight-saving
  // change, where a "day" is 23 or 25 hours long.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

  const [y, m, d] = parts.split('-').map(Number);

  return {
    from: localMidnight(y, m - 1, d + days, timeZone),
    to: localMidnight(y, m - 1, d + days + 1, timeZone),
  };
}

/**
 * The instant at which a given local midnight happens, as UTC.
 *
 * Each end measures its own offset, and that is not fussiness: on the day a
 * zone moves its clock the day is 23 or 25 hours long, and one offset applied
 * to both ends puts the boundary an hour inside the neighbouring day. A run
 * recorded in that hour would be counted twice, or not at all.
 *
 * Two passes because the offset has to be measured somewhere, and the only
 * instant available before knowing it is the UTC guess. The second pass reads
 * the offset at the answer the first pass gave, which is the correct side of a
 * transition.
 */
function localMidnight(year: number, month: number, day: number, timeZone: string): string {
  const guess = Date.UTC(year, month, day);
  const first = offsetMinutes(new Date(guess), timeZone);
  const once = guess + first * 60_000;
  const second = offsetMinutes(new Date(once), timeZone);

  return new Date(second === first ? once : guess + second * 60_000).toISOString();
}

/** How far the zone is from UTC at that instant, in minutes to ADD to UTC. */
function offsetMinutes(at: Date, timeZone: string): number {
  const there = new Date(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(at)
      .replace(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6Z'),
  );
  return (at.getTime() - there.getTime()) / 60_000;
}

/**
 * Whole days between two instants, counted as the factory counts them.
 *
 * Not `(a - b) / 86_400_000`: on the day a zone moves its clock that division
 * gives 0.96 of a day and rounds to the wrong number. Both ends are reduced to
 * their local midnight first, so "yesterday" is one day away whether yesterday
 * had 23 hours, 24, or 25.
 */
export function daysBetween(fromIso: string, toIso: string, timeZone: string): number {
  const from = new Date(dayWindow(fromIso, timeZone).from).getTime();
  const to = new Date(dayWindow(toIso, timeZone).from).getTime();
  return Math.round((to - from) / 86_400_000);
}

/**
 * Uma sequência de dias com o que caiu em cada um.
 *
 * A capa precisa responder "o que é normal aqui" e não só "quanto foi hoje" — a
 * primeira lei da tela, que até agora nenhuma respondia. Sete colunas dizem
 * isso sem uma frase: quem produz de segunda a sexta vê duas falhas no fim de
 * semana e entende o próprio ritmo num relance.
 *
 * O agrupamento é por dia LOCAL e por isso mora aqui, não no SQL. O SQLite do
 * aparelho não sabe fuso: `substr(occurred_at, 1, 10)` corta o dia em UTC, e um
 * tacho fechado às 22h de Manaus entraria no dia seguinte — a mesma família de
 * erro que já custou uma rodada quando a data combinada saía de um instante.
 *
 * Dias sem nada entram com zero em vez de sumirem. Uma série que pula o dia
 * parado desenha uma fábrica que trabalha todo dia, que é justamente a mentira
 * que a coluna vazia desmente.
 */
export function dailySeries(
  events: readonly { occurredAt: string; baseUnits: number }[],
  timeZone: string,
  atIso: string,
  days: number,
): { date: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const event of events) {
    const day = localDate(event.occurredAt, timeZone);
    totals.set(day, (totals.get(day) ?? 0) + event.baseUnits);
  }

  const series: { date: string; total: number }[] = [];
  for (let back = days - 1; back >= 0; back--) {
    const date = localDate(atIso, timeZone, -back);
    series.push({ date, total: totals.get(date) ?? 0 });
  }
  return series;
}
