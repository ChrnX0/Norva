import { defaultLocale, dictionary, type Dictionary, type LocaleSettings } from './index';

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
 * the floor. `detectLanguage()` from `./device` is the right default when a
 * company is first created, and nothing else.
 */
export function useLocale(): { locale: LocaleSettings; t: Dictionary } {
  return { locale: defaultLocale, t: dictionary(defaultLocale.language) };
}
