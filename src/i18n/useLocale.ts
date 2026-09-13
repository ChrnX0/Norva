import { useLocaleChoice } from './Locale';
import type { Dictionary, LocaleSettings } from './index';

/**
 * One place that decides which language the interface speaks.
 *
 * It used to be two: screens wrote Portuguese directly, while the handful of
 * dictionary lookups asked the *device* what language it wanted. On a phone set
 * to English that produced a screen reading "Um tacho rende 506 — 1 crate e 4
 * boxes", which is worse than either language on its own.
 *
 * Language is a property of the company, not of the handset - a Brazilian
 * factory whose owner reads English still runs in Portuguese for everyone on
 * the floor. The device is the right default when a company is first created,
 * and nothing else.
 *
 * **E até 4 de setembro isto devolvia uma constante.** Os três dicionários
 * existiam completos e não havia caminho nenhum até dois deles: a escolha mora
 * agora em `./Locale`, gravada na gaveta da empresa e trocável nos Ajustes. Este
 * gancho continua sendo o que as 33 telas chamam — elas não precisaram saber.
 */
export function useLocale(): { locale: LocaleSettings; t: Dictionary } {
  const { locale, t } = useLocaleChoice();
  return { locale, t };
}
