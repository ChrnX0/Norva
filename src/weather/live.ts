import { readJson, writeJson } from '@/data/meta';
import { currentForecast, type Forecast, type WeatherPlace } from './index';

/**
 * O clima ligado no aparelho de verdade: rede com prazo, cache no `app_meta`.
 *
 * Este arquivo existe para que `index.ts` continue sem saber o que é `fetch` e
 * o que é banco — é o que permite testar a regra inteira (validade, cache,
 * dedução da cidade, resposta torta) sem subir servidor nenhum.
 */

const PLACE_KEY = 'weather.place';
const CACHE_KEY = 'weather.forecast';

/** Oito segundos. Depois disso, o cache responde melhor que a espera. */
const TIMEOUT_MS = 8_000;

/**
 * Uma chamada de rede que sempre termina.
 *
 * Sem prazo, um celular na área ruim da fábrica fica com a promessa pendurada
 * até o sistema operacional desistir — e a tela, que espera por ela, some com o
 * cartão que já tinha. O `AbortController` é o que transforma "sem rede" em
 * "nada mudou na tela".
 */
async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function readPlace(): Promise<WeatherPlace | null> {
  return readJson<WeatherPlace>(PLACE_KEY);
}

export function writePlace(place: WeatherPlace): Promise<void> {
  return writeJson(PLACE_KEY, place);
}

export { fetchJson };

/** A previsão de hoje para a tela, com tudo que dá errado já absorvido. */
export function forecastForScreen(timeZone: string): Promise<Forecast | null> {
  return currentForecast({
    fetchJson,
    now: () => new Date().toISOString(),
    timeZone,
    readPlace,
    writePlace,
    readCache: () => readJson<Forecast>(CACHE_KEY),
    writeCache: (forecast) => writeJson(CACHE_KEY, forecast),
  });
}
