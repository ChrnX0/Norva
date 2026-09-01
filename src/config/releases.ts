/**
 * What changed, in the words of someone who runs a factory.
 *
 * The rule from the design brief: at most three lines, never shown twice. An
 * update that arrives silently is good engineering; an update that arrives
 * silently and changes what a button does is a betrayal. Three lines is the
 * budget because the fourth never gets read.
 *
 * Bump `version` when a release is worth mentioning. Leaving it alone means the
 * update ships without a notice, which is the right answer for a bug fix
 * nobody was waiting for.
 */
export type Release = {
  /** Not the app version - the version of *this notice*. */
  version: string;
  date: string;
  lines: string[];
};

export const latestRelease: Release = {
  version: '2026.09.01',
  date: '2026-09-01',
  lines: [
    'O custo de cada produto agora se recalcula sozinho quando você lança uma nota de compra.',
    'Você pode perguntar em português: toque em "Pergunte" e escreva o que quer saber.',
    'Em Ajustes dá para apagar os dados de exemplo, por área ou de uma vez.',
  ],
};

/** The rule is enforced here, not left to whoever edits the list next. */
export function releaseLines(release: Release = latestRelease): string[] {
  return release.lines.slice(0, 3);
}
