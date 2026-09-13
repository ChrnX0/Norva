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
/**
 * **E o TEXTO não mora aqui — achado em 11 de setembro, e era a fundação do i18n furada.**
 *
 * As três linhas eram português cravado neste arquivo, desenhadas direto pelo `WhatsNew`.
 * O título, o subtítulo e o botão da mesma folha vinham do dicionário; as três linhas do
 * meio, não. Uma fábrica no México abria o aplicativo depois de uma atualização automática
 * e recebia a moldura em espanhol com o miolo em português — na PRIMEIRA tela que alguém vê
 * depois de o app se atualizar sozinho.
 *
 * A guarda de frases (`src/layers.test.ts`) não via: ela varre `app`, `src/components`,
 * `src/home` e `src/notify`, e as frases moravam uma pasta ao lado de quem as desenha.
 * Corrigida na mesma rodada.
 *
 * O que este arquivo guarda é o que decide se o aviso APARECE — a versão dele. A palavra é
 * do dicionário, como toda palavra deste aplicativo.
 */
export type Release = {
  /** Not the app version - the version of *this notice*. */
  version: string;
  date: string;
};

export const latestRelease: Release = {
  version: '2026.09.01',
  date: '2026-09-01',
};

/**
 * No máximo três, e a regra é imposta aqui em vez de ficar com quem edita o dicionário.
 *
 * A quarta linha nunca é lida — é o orçamento do briefing de desenho. Cortar aqui vale para
 * os três idiomas de uma vez, e é por isso que a tela chama esta função em vez de ler a
 * lista direto.
 */
export function releaseLines(linhas: readonly string[]): string[] {
  return linhas.slice(0, 3);
}
