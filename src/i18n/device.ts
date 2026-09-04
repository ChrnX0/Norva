import { getCalendars, getLocales } from 'expo-localization';
import { isCurrency } from './company';
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

/**
 * A moeda que o aparelho diz que o país usa — o primeiro palpite, nada mais.
 *
 * Moeda é fato da EMPRESA: a fábrica brasileira cujo dono lê em inglês continua
 * cobrando em real. O aparelho é só o melhor chute no dia em que a empresa nasce,
 * e a partir daí quem manda é o que ela escolheu nos Ajustes.
 *
 * Fora da lista que o aplicativo oferece, cai no real — que é o padrão do produto
 * e a moeda da fábrica onde ele nasceu.
 */
export function detectCurrency(): string {
  for (const l of getLocales()) {
    const code = l.currencyCode ?? '';
    if (isCurrency(code)) return code;
  }
  return 'BRL';
}

/**
 * O fuso do aparelho, que é o fuso da fábrica.
 *
 * Não é preferência e não vira pergunta: o celular está no galpão. Isto decide
 * qual DIA um tacho fechado às 22h pertence, e o padrão chumbado em
 * `America/Sao_Paulo` fazia uma fábrica em Manaus lançar produção no dia errado —
 * uma hora de diferença, todos os dias, no número que vai na etiqueta.
 */
export function detectTimeZone(): string {
  const zone = getCalendars()[0]?.timeZone ?? '';
  return zone.includes('/') ? zone : 'America/Sao_Paulo';
}
