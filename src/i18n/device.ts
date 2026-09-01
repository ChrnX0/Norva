import { getLocales } from 'expo-localization';
import type { LanguageTag } from './index';

/**
 * Which language the phone is asking for.
 *
 * Kept apart from the rest of i18n on purpose: formatting money and picking
 * words is arithmetic that runs anywhere, while reading the device's locale is
 * a native call. Separating them is what lets the domain, the assistant and
 * their tests use the formatters without dragging a native module in.
 */
export function detectLanguage(): LanguageTag {
  const tags = getLocales().map((l) => l.languageTag.toLowerCase());
  if (tags.some((t) => t.startsWith('pt'))) return 'pt-BR';
  if (tags.some((t) => t.startsWith('es'))) return 'es';
  return 'en';
}
