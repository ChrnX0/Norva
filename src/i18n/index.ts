import { en } from './locales/en';
import { es } from './locales/es';
import { ptBR, type Dictionary } from './locales/pt-BR';
import { breakdown, type PackagingHierarchy } from '@/domain/units';

export type { Dictionary };

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
 * Singular and plural as whole sentences, never a number dropped into one.
 *
 * The verb has to agree, and it does not agree with a placeholder: Portuguese
 * needs "apaga 1 insumo" against "apaga 6 insumos", and a language that
 * inflects harder than that writes both halves itself instead of receiving a
 * count and a noun glued together. Both variants may carry `{{n}}`, so a locale
 * decides for itself whether the singular even shows the number.
 */
export function plural(
  n: number,
  variants: { one: string; other: string },
  /**
   * How the number should read, when the bare count is not how it reads. A
   * thousand units is "1.000" in Portuguese and "1,000" in English, and the
   * count that chooses the branch is not the string that goes in the sentence.
   */
  display?: string,
): string {
  const text = fill(n === 1 ? variants.one : variants.other, { n: display ?? n });

  /**
   * O número dito não some — mas "não tem onde caber" e "esta forma não o quer"
   * são coisas diferentes, e a primeira versão disto confundiu as duas.
   *
   * `units.unit` é só a palavra: `{one: 'unidade', other: 'unidades'}`, sem
   * `{{n}}` em lugar nenhum, porque metade das telas a usa ao lado de um número
   * que elas mesmas escrevem. Chamada com um número para mostrar, ela devolvia
   * a palavra sozinha, e o cartão da capa saiu anunciando uma falta sem dizer
   * de quanto — "Picolé de morango · unidades". Compilou, passou na suíte, e só
   * o navegador viu.
   *
   * `batchCount` é o contrário: `{one: 'um tacho', other: '{{n}} tachos'}`. O
   * singular escreve o número por extenso DE PROPÓSITO, e prefixar ali produziu
   * "em 1 um tacho" na confirmação de produção — o e2e pegou na mesma rodada.
   *
   * Então a regra olha a ENTRADA inteira, não a forma escolhida: quando nenhuma
   * das duas tem onde receber o número, ele vai na frente; quando alguma tem, a
   * língua já decidiu e ninguém corrige por cima dela.
   */
  const nowhereToPutIt = !variants.one.includes('{{n}}') && !variants.other.includes('{{n}}');
  if (display !== undefined && nowhereToPutIt) return `${display} ${text}`;
  return text;
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

/**
 * Só o símbolo da moeda — para o campo em que a pessoa digita o valor.
 *
 * `formatMoney` resolve o número já escrito; ele não serve para o sufixo de um
 * campo vazio, e por isso dois formulários escreveram `suffix="R$"` na mão: o
 * cadastro de insumo e a nota de compra. **Trinta linhas acima está escrito que
 * traduzir as palavras e continuar mostrando "R$" para um cliente mexicano não é
 * internacionalização** — e era exatamente o que estes dois campos faziam, desde
 * que a moeda virou escolha da empresa e passaram a existir oito.
 *
 * O símbolo sai do `Intl`, da mesma moeda que formata o resto: pedir a peça
 * `currency` de um valor formatado é o que garante que o campo e o número que
 * ele vira digam a mesma coisa. Sem a peça (moeda que o ambiente não conhece),
 * volta o código ISO, que é feio e verdadeiro — melhor que o símbolo de outro
 * país.
 */
/**
 * Um PREÇO POR UNIDADE, dito num número que uma pessoa lê.
 *
 * `formatMoney` recebe centavos inteiros e imprime duas casas — certo para uma
 * quantia que alguém paga. Uma taxa abaixo de um centavo não cabe ali: rótulo a
 * R$ 0,004 por unidade imprime **R$ 0,00**, que é a tela dizendo "de graça" para
 * uma coisa que o razão já parou de dar de graça.
 *
 * A primeira versão desta função mostrava R$ 0,004. O dono recusou na hora, e
 * com razão: *"0,004 não existe... mostrar esse valor para o usuário não faz
 * sentido"*. Preço com três casas é número de planilha, não de fábrica.
 *
 * A resposta certa **já era do aplicativo**, e eu não a tinha usado: a tela do
 * insumo mostra polpa a R$ 12,40 **a cada 1.000 gramas**, nunca 1,24 centavo por
 * grama. Então abaixo de um centavo a taxa sobe de escala — "R$ 4,00 a cada
 * 1.000 unidades" — e de um centavo para cima nada muda: duas casas, como no
 * resto. Quem monta a frase é quem chama, porque "a cada 1.000 unidades" é do
 * dicionário e este módulo não fala português.
 */
export function formatUnitRate(
  rateInCents: number,
  locale: LocaleSettings,
  /** "a cada 1.000 unidades", já preenchido pela tela. */
  perThousandOf: string,
): string {
  const subCentavo = rateInCents !== 0 && Math.abs(rateInCents) < 1;
  if (!subCentavo) return formatMoney(Math.round(rateInCents), locale);
  return `${formatMoney(Math.round(rateInCents * 1000), locale)} ${perThousandOf}`;
}

export function currencySymbol(locale: LocaleSettings): string {
  const partes = new Intl.NumberFormat(locale.formatting, {
    style: 'currency',
    currency: locale.currency,
  }).formatToParts(0);
  return partes.find((p) => p.type === 'currency')?.value ?? locale.currency;
}

export function formatQuantity(value: number, locale: LocaleSettings): string {
  return new Intl.NumberFormat(locale.formatting, {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: locale.timeZone,
  }).format(new Date(iso));
}

/**
 * The day, as the header of the briefing says it: "segunda, 1 de set".
 *
 * The weekday is there because a factory plans by it - "produza até segunda" is
 * an instruction, "produza até dia 7" is arithmetic. Short month, because the
 * line sits under the brand and must not wrap on a 390pt screen.
 */
/**
 * A quantity said in the packaging the person actually handles.
 *
 * "250" is a number; "5 caixas de 50" is something you can carry. The screens
 * that show a quantity in base units and the screens that show what it becomes
 * on a shelf were building this sentence separately - two copies today, a third
 * about to be written for the transport screen - and a phrase duplicated three
 * times is a phrase that will disagree with itself on the fourth.
 *
 * The largest layers come first and the remainder stays in units: 263 is "5
 * caixas · 13 unidades", never just "5 caixas", because thirteen popsicles that
 * exist would have vanished from the sentence.
 */
export function formatPacked(
  baseUnits: number,
  hierarchy: PackagingHierarchy,
  words: Record<string, { one: string; other: string } | undefined>,
  locale: LocaleSettings,
  and?: string,
): string {
  const parts = breakdown(baseUnits, hierarchy).map((part) => {
    const entry = words[part.tier.id];
    const word = entry ? (part.quantity === 1 ? entry.one : entry.other) : part.tier.id;
    return `${formatQuantity(part.quantity, locale)} ${word}`;
  });

  return and ? joinList(parts, and) : parts.join(' · ');
}

/** A hora do relógio da fábrica: "05:20", nunca "5:20 AM" num turno de -18°C. */
export function formatTime(iso: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: locale.timeZone,
  }).format(new Date(iso));
}

export function formatWeekday(iso: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: locale.timeZone,
  }).format(new Date(iso));
}

/**
 * Uma data de calendário (`YYYY-MM-DD`) dita sem passar por fuso nenhum.
 *
 * `formatDate` e `formatDayMonth` recebem um INSTANTE e o traduz para o fuso da fábrica, que é
 * certo para o que aconteceu às 14h32. Uma data combinada não tem hora: passada
 * pelo mesmo caminho, "2026-09-03" vira meia-noite em UTC e aparece como 02/09
 * para quem está em São Paulo. O dia do compromisso é o que foi escrito.
 */
export function formatCalendarDate(date: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * A inicial do dia da semana, para a régua de sete colunas da capa.
 *
 * Recebe data de calendário e não instante, pela mesma razão que
 * `formatCalendarDate`: a série de dias já foi calculada no fuso da fábrica, e
 * passá-la por um segundo fuso deslocaria a semana inteira em um dia.
 *
 * `narrow` e não `short` porque a coluna tem a largura de um sétimo da tela: em
 * português "seg." não cabe, e cortar no meio é pior que a inicial. Que dois
 * dias dividam a mesma letra (S de sábado e de segunda) não atrapalha aqui — a
 * régua é lida como forma, e a posição do dia de hoje é a âncora.
 */
/**
 * Uma fração dita em por cento, com a vírgula do idioma.
 *
 * Existia em três lugares como `(x * 100).toFixed(1)`, que é o ponto decimal
 * do JavaScript e não o separador de quem lê: a capa anunciava uma alta de
 * "9.0%" para uma fábrica brasileira, e a mesma tela em espanhol também. O erro
 * é pequeno na aparência e da mesma família do que já custou caro aqui - número
 * formatado à mão, fora do único lugar que sabe o idioma.
 */
export function formatPercent(fraction: number, locale: LocaleSettings, digits = 1): string {
  return new Intl.NumberFormat(locale.formatting, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);
}

/**
 * O nome curto de um dia da semana, a partir do número que `Date.getDay()` usa.
 *
 * Uma data de referência qualquer que caia num domingo serve: o que importa é
 * o dia da semana, não o mês. 2026-09-06 é domingo, e somar o índice anda a
 * semana inteira sem tocar em fuso — a data é usada só como calendário.
 */
/**
 * O nome curto do dia a partir de uma data de calendário: "qui", "sex", "sáb".
 *
 * A régua da semana usava a INICIAL (`narrow`), e em português isso dá q·s·s·d·s·t·q
 * — quatro esses e dois quês para sete colunas. O desenho aprovado escreve o dia,
 * e ele tem razão: a inicial só funciona em inglês, onde as sete primeiras letras
 * quase não se repetem.
 */
/**
 * A data da linha de olho: "quarta, 2 de setembro".
 *
 * Diferente de `formatWeekday`, que abrevia o mês ("2 de set.") — no topo da
 * capa a data é a única coisa escrita ao lado da marca, e ela tem espaço para
 * ser dita por inteiro.
 *
 * O `-feira` sai porque em português ele é ruído: ninguém fala "quarta-feira, 2
 * de setembro" ao dizer que dia é hoje. É recorte de idioma, e por isso mora
 * aqui, na camada que fala português — não na tela, que não deveria saber que
 * português tem feira.
 */
export function formatCoverDate(iso: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: locale.timeZone,
  })
    .format(new Date(iso))
    .replace('-feira', '');
}

export function formatWeekdayAbbrev(date: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    weekday: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(/\.$/, '');
}

export function formatWeekdayShort(weekday: number, locale: LocaleSettings): string {
  const domingo = Date.UTC(2026, 8, 6);
  return new Intl.DateTimeFormat(locale.formatting, {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(domingo + weekday * 86_400_000));
}

export function formatDayMonth(iso: string, locale: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale.formatting, {
    day: '2-digit',
    month: '2-digit',
    timeZone: locale.timeZone,
  }).format(new Date(iso));
}

/**
 * Joins a list the way a person says it: "6 insumos, 2 receitas e 1 produto".
 *
 * Commas everywhere reads like a form; a conjunction before the last item is
 * what makes a confirmation sound like a sentence somebody wrote.
 */
export function joinList(parts: readonly string[], and: string): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
}
