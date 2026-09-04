import type { LanguageTag, LocaleSettings } from './index';

/**
 * A moeda que a fábrica cobra, e o jeito de escrever número que vem com ela.
 *
 * **Por que a moeda decide o formato, e não o idioma.** Espanhol escreve
 * `1.234,56` na Espanha e `1,234.56` no México — o mesmo idioma, o ponto e a
 * vírgula trocados de lugar. Um número de dinheiro lido ao contrário é a pior
 * classe de erro que este aplicativo pode cometer, então quem manda no formato é
 * a REGIÃO, e a região vem da moeda: quem cobra em peso mexicano está no México.
 *
 * O idioma continua sendo escolha separada — alguém no México pode querer o
 * aplicativo em inglês e continuar cobrando em MXN.
 *
 * Guaraní e peso chileno não têm centavo, e o `Intl` sabe disso: o valor inteiro
 * que o livro-razão guarda continua sendo centésimo de unidade em toda moeda, e
 * só a escrita muda. É a mesma regra de sempre — arredonda no fim, uma vez.
 */
export const CURRENCIES = [
  { code: 'BRL', region: 'BR' },
  { code: 'USD', region: 'US' },
  { code: 'EUR', region: 'ES' },
  { code: 'MXN', region: 'MX' },
  { code: 'ARS', region: 'AR' },
  { code: 'CLP', region: 'CL' },
  { code: 'COP', region: 'CO' },
  { code: 'PYG', region: 'PY' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export function isCurrency(code: string): code is CurrencyCode {
  return CURRENCIES.some((c) => c.code === code);
}

/**
 * O par idioma + moeda, virado em tag de formatação.
 *
 * `pt-BR` já é uma tag completa e passa direto. Para `es` e `en` a região vem da
 * moeda, porque é ela que sabe onde a fábrica está. Moeda que não está na lista
 * cai no idioma sozinho, que é sempre uma tag válida — pior formato, nunca erro.
 */
export function formattingFor(language: LanguageTag, currency: string): string {
  if (language === 'pt-BR') return 'pt-BR';
  const region = CURRENCIES.find((c) => c.code === currency)?.region;
  return region ? `${language}-${region}` : language;
}

/**
 * O que a empresa escolheu, montado a partir do que está guardado.
 *
 * Cada peça cai para o padrão sozinha: idioma inválido na gaveta não derruba a
 * moeda, e vice-versa. A gaveta é local e pode vir de uma versão antiga do
 * aplicativo, então nada aqui confia no que leu.
 */
export function localeFrom(
  stored: { language?: string | null; currency?: string | null; timeZone?: string | null },
  padrao: LocaleSettings,
): LocaleSettings {
  const language = (
    stored.language === 'pt-BR' || stored.language === 'es' || stored.language === 'en'
      ? stored.language
      : padrao.language
  ) as LanguageTag;
  const currency = stored.currency && isCurrency(stored.currency) ? stored.currency : padrao.currency;
  const timeZone = stored.timeZone?.includes('/') ? stored.timeZone : padrao.timeZone;
  return { language, currency, timeZone, formatting: formattingFor(language, currency) };
}
