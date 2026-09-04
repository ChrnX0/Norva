import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readMeta, writeMeta } from '@/data/meta';
import { detectCurrency, detectLanguage, detectTimeZone } from './device';
import { localeFrom } from './company';
import { defaultLocale, dictionary, type Dictionary, type LanguageTag, type LocaleSettings } from './index';

const LANGUAGE_KEY = 'locale.language';
const CURRENCY_KEY = 'locale.currency';

/**
 * O idioma e a moeda da EMPRESA, escolhidos uma vez e obedecidos por toda tela.
 *
 * **A cicatriz.** O dicionário tem os três idiomas desde a primeira tela, com a
 * compilação quebrando se alguém escrever texto em um só — e **nada levava ninguém
 * até eles**. `useLocale()` devolvia uma constante: português, real, e o fuso de
 * São Paulo chumbados. `detectLanguage()` existia sem chamador desde que foi
 * escrita. Três dicionários completos, nos quais duas pessoas escreveram cada
 * palavra, alcançáveis só editando o código.
 *
 * **É fato da empresa, não do aparelho**, e a diferença é a mesma que separa a cara
 * da tela do que ela mostra: a fábrica brasileira cujo dono lê inglês roda em
 * português para todo mundo no chão de fábrica. Por isso o idioma e a moeda ficam
 * juntos numa escolha só de empresa, enquanto claro/escuro e as duas identidades
 * são preferência de quem segura o celular.
 *
 * **O aparelho é o primeiro palpite, e só.** No dia em que a empresa nasce, o
 * idioma vem do celular, a moeda vem do país do celular e o fuso vem do relógio
 * dele — porque nenhuma dessas três é uma pergunta que valha a pena fazer a quem
 * está cadastrando o primeiro insumo. Depois disso, quem manda é o que ficou
 * guardado.
 *
 * **O fuso não é pergunta em nenhum momento**: o celular está no galpão. Ele estava
 * chumbado em `America/Sao_Paulo`, e isso fazia uma fábrica em Manaus lançar o tacho
 * das 22h no dia seguinte — na data que vai impressa na etiqueta do lote.
 */
type LocaleChoice = {
  locale: LocaleSettings;
  t: Dictionary;
  setLanguage: (language: LanguageTag) => void;
  setCurrency: (currency: string) => void;
  /** Falso enquanto a gaveta ainda não respondeu. */
  ready: boolean;
};

const LocaleContext = createContext<LocaleChoice | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // O padrão do produto até a gaveta responder. O primeiro quadro do aplicativo
  // não pode esperar disco para escolher uma palavra.
  const [locale, setLocale] = useState<LocaleSettings>(defaultLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([readMeta(LANGUAGE_KEY), readMeta(CURRENCY_KEY)])
      .then(([language, currency]) => {
        if (cancelled) return;
        // O aparelho entra como PADRÃO, não como escolha: se a empresa já escolheu,
        // o que está guardado ganha; se não, o celular é o melhor palpite que existe.
        const doAparelho: LocaleSettings = {
          language: detectLanguage(),
          currency: detectCurrency(),
          timeZone: detectTimeZone(),
          formatting: defaultLocale.formatting,
        };
        setLocale(localeFrom({ language, currency, timeZone: doAparelho.timeZone }, doAparelho));
      })
      // Idioma é enfeite comparado a abrir: sem resposta da gaveta, vale o padrão.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((language: LanguageTag) => {
    // A tela troca na hora e a gravação vai atrás, como a cara do aplicativo:
    // esperar o disco para mudar uma palavra faria o toque parecer travado.
    setLocale((antes) => localeFrom({ language, currency: antes.currency, timeZone: antes.timeZone }, antes));
    void writeMeta(LANGUAGE_KEY, language).catch(() => undefined);
  }, []);

  const setCurrency = useCallback((currency: string) => {
    setLocale((antes) => localeFrom({ language: antes.language, currency, timeZone: antes.timeZone }, antes));
    void writeMeta(CURRENCY_KEY, currency).catch(() => undefined);
  }, []);

  const value = useMemo<LocaleChoice>(
    () => ({ locale, t: dictionary(locale.language), setLanguage, setCurrency, ready }),
    [locale, setLanguage, setCurrency, ready],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * O idioma escolhido, com um padrão que funciona fora do provedor.
 *
 * Fora dele — na tela de quebra, que sobe antes de tudo — a resposta é o padrão do
 * produto em vez de uma exceção: um aplicativo que quebra ao desenhar a tela de
 * quebra não tem como se explicar. É a mesma escolha que `useAppearance` faz, pelo
 * mesmo motivo.
 */
export function useLocaleChoice(): LocaleChoice {
  return (
    useContext(LocaleContext) ?? {
      locale: defaultLocale,
      t: dictionary(defaultLocale.language),
      setLanguage: () => undefined,
      setCurrency: () => undefined,
      ready: true,
    }
  );
}
