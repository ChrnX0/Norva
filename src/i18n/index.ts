import { getLocales } from 'expo-localization';
import { en } from './locales/en';
import { es } from './locales/es';
import { ptBR, type Dictionary } from './locales/pt-BR';

export type LanguageTag = 'pt-BR' | 'es' | 'en';

const dictionaries: Record<LanguageTag, Dictionary> = { 'pt-BR': ptBR, es, en };

/**
 * Currency is a property of the company, not of the phone. A Brazilian factory
 * whose owner reads the app in English still bills in BRL.
 */
export type LocaleSettings = {
  language: LanguageTag;
  /** BCP 47 tag used for number and date formatting. */
  formatting: string;
  /** ISO 4217. */
  currency: string;
  timeZone: string;
};

export const defaultLocale: LocaleSettings = {
  language: 'pt-BR',
  formatting: 'pt-BR',
  currency: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

export function detectLanguage(): LanguageTag {
  const tags = getLocales().map((l) => l.languageTag.toLowerCase());
  if (tags.some((t) => t.startsWith('pt'))) return 'pt-BR';
  if (tags.some((t) => t.startsWith('es'))) return 'es';
  return 'en';
}

export function dictionary(language: LanguageTag): Dictionary {
  return dictionaries[language];
}

/**
 * Interpolates `{{name}}` placeholders. Deliberately tiny: this app has no need
 * for a full i18n runtime, and a dependency here would be weight for nothing.
 */
export function fill(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Real internationalisation: money, dates and the decimal separator move with
 * the language. Translating the words and still showing "R$" to a Mexican
 * customer is not internationalisation.
 */
export function formatMoney(cents: number, locale: LocaleSettings): string {
  return new Intl.NumberFormat(locale.formatting, {
    style: 'currency',
    currency: locale.currency,
  }).format(cents / 100);
}

export function formatQuantity(value: number, locale: LocaleSettings): string {
  return new Intl.NumberFormat(locale.formatting, {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatWeight(grams: number, locale: LocaleSettings): string {
  const kg = grams / 1000;
  const formatted = new Intl.NumberFormat(locale.formatting, {
    maximumFractionDigits: kg >= 10 ? 0 : 1,
  }).format(kg);
  return `${formatted} kg`;
}

export function formatDate(iso: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: locale.timeZone,
  }).format(new Date(iso));
}

export function formatDayMonth(iso: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    day: '2-digit',
    month: '2-digit',
    timeZone: locale.timeZone,
  }).format(new Date(iso));
}
