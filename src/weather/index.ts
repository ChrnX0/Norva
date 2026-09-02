/**
 * O clima — que numa fábrica de sorvete é informação de negócio, não enfeite.
 *
 * O dono pediu com todas as letras: "como uma sorveteria essa informação é
 * relevante por ser algo sazonal". Ele está certo, e por isso o cuidado aqui é
 * o oposto do que um widget de tempo costuma ter: este arquivo só devolve FATO
 * medido. Ele não diz "produza mais amanhã" e não estima demanda a partir de
 * temperatura, porque a relação entre calor e venda desta fábrica não está no
 * livro-razão ainda — ela precisa de meses de saída observada, que é a mesma
 * razão pela qual o Espelho da Loja ficou fora do mês. Prometer a conclusão
 * antes do dado seria o alerta inventado da Lei 7, com um número em cima.
 *
 * O que ele entrega: a máxima de hoje, a de amanhã, e a diferença entre as
 * duas — que é a Lei 3 aplicada ao termômetro. Trinta e um graus não é quente
 * nem frio até estar ao lado de outro dia.
 *
 * TRÊS DECISÕES QUE VALEM SER LIDAS ANTES DE MEXER AQUI:
 *
 *  - **A rede é opcional, sempre.** Este app grava a produção de dentro de uma
 *    câmara fria; se o clima precisar de internet para a tela abrir, a tela não
 *    abre. Então tudo passa pelo cache: sem resposta, vale o que foi guardado;
 *    sem cache, o cartão simplesmente não existe. Nada aqui lança.
 *  - **A cidade se deduz, não se pergunta** (Lei 1). O fuso do aparelho carrega
 *    o nome de uma cidade — `America/Sao_Paulo` — e ele é o palpite inicial. O
 *    cartão mostra o nome, então o palpite errado é visível e trocável num
 *    toque. Perguntar a cidade na primeira abertura seria cobrar do dono uma
 *    coisa que o sistema já sabe.
 *  - **A previsão vem com a hora em que foi perguntada.** Um número de clima
 *    sem hora é um número que pode ser de anteontem, e quem olha não tem como
 *    saber.
 */

/** Um lugar no mapa, com nome que uma pessoa reconhece. */
export type WeatherPlace = {
  name: string;
  /** Estado ou província, quando a fonte diz. Duas "Santa Maria" existem. */
  region: string | null;
  latitude: number;
  longitude: number;
};

/** Um dia de previsão, na data local do lugar. */
export type ForecastDay = {
  /** `YYYY-MM-DD`, no fuso do lugar — não no do aparelho. */
  date: string;
  maxC: number;
  minC: number;
  /** Chance de chuva em %, quando a fonte diz. */
  rainChance: number | null;
};

export type Forecast = {
  place: WeatherPlace;
  /** Quando o aparelho perguntou. Não é quando o tempo acontece. */
  fetchedAt: string;
  days: ForecastDay[];
};

/**
 * O que a tela desenha: hoje, amanhã, e a diferença entre os dois.
 *
 * `warmerBy` é calculado sobre os graus JÁ ARREDONDADOS. Parece detalhe e não
 * é: 30,4 e 32,4 aparecem como 30 e 32 na tela, e uma diferença calculada
 * antes do arredondamento diria "2°" para números que o olho lê como 2 — mas
 * 30,6 e 32,4 dariam "1,8 → 2°" ao lado de 31 e 32. O número dito tem que ser
 * a subtração dos números mostrados, ou a tela mente por um grau.
 */
export type Reading = {
  today: ForecastDay;
  tomorrow: ForecastDay | null;
  /** Positivo: amanhã esquenta. Negativo: esfria. Null: não há amanhã. */
  warmerBy: number | null;
};

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/** Quanto tempo uma previsão continua valendo antes de perguntar de novo. */
export const FRESH_FOR_MINUTES = 180;

/**
 * A cidade que o fuso do aparelho carrega no nome.
 *
 * `America/Sao_Paulo` é São Paulo; `America/Argentina/Buenos_Aires` é Buenos
 * Aires. Fusos sem cidade — `UTC`, `GMT`, `Etc/GMT-3` — não deduzem nada, e
 * devolver "GMT-3" para o geocoder acharia qualquer coisa. Nulo aqui significa
 * "pergunte", e é a única situação em que se pergunta.
 */
export function cityFromTimeZone(timeZone: string): string | null {
  if (!timeZone.includes('/')) return null;
  const parts = timeZone.split('/');
  if (parts[0] === 'Etc') return null;
  const last = parts[parts.length - 1];
  if (!last || /[0-9+]/.test(last)) return null;
  return last.replace(/_/g, ' ');
}

/** Lê a lista do geocoder, ignorando o que não tem coordenada. */
export function parsePlaces(json: unknown): WeatherPlace[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const places: WeatherPlace[] = [];
  for (const row of results) {
    const r = row as Record<string, unknown>;
    if (typeof r.name !== 'string') continue;
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue;
    places.push({
      name: r.name,
      region: typeof r.admin1 === 'string' ? r.admin1 : null,
      latitude: r.latitude,
      longitude: r.longitude,
    });
  }
  return places;
}

/**
 * Lê os dias da previsão.
 *
 * Um dia sem máxima ou sem mínima é descartado inteiro em vez de entrar com
 * zero: 0° num dia de setembro em São Paulo não é um dado faltando, é um dado
 * errado, e o cartão o desenharia com a mesma confiança dos outros.
 */
export function parseDays(json: unknown): ForecastDay[] {
  const daily = (json as { daily?: Record<string, unknown> })?.daily;
  if (!daily) return [];
  const dates = daily.time;
  const max = daily.temperature_2m_max;
  const min = daily.temperature_2m_min;
  const rain = daily.precipitation_probability_max;
  if (!Array.isArray(dates) || !Array.isArray(max) || !Array.isArray(min)) return [];

  const days: ForecastDay[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (typeof date !== 'string') continue;
    if (typeof max[i] !== 'number' || typeof min[i] !== 'number') continue;
    const chance = Array.isArray(rain) && typeof rain[i] === 'number' ? (rain[i] as number) : null;
    days.push({ date, maxC: max[i] as number, minC: min[i] as number, rainChance: chance });
  }
  return days;
}

/** Passou da validade? Então vale perguntar de novo — se houver rede. */
export function isStale(forecast: Forecast, nowIso: string, freshForMinutes = FRESH_FOR_MINUTES): boolean {
  const age = Date.parse(nowIso) - Date.parse(forecast.fetchedAt);
  return !(age >= 0) || age > freshForMinutes * 60_000;
}

/**
 * O que ainda vale de uma previsão guardada, contra a data de hoje.
 *
 * Guardar previsão e desenhá-la sem olhar a data é como um cartão de estoque
 * congelado: o aparelho que ficou dois dias sem rede mostraria a máxima de
 * anteontem como se fosse a de hoje. Então o dia de hoje é PROCURADO na lista,
 * e uma previsão inteiramente vencida não devolve nada — é melhor não ter
 * cartão que ter um cartão errado.
 */
export function reading(forecast: Forecast, today: string): Reading | null {
  const from = forecast.days.findIndex((d) => d.date >= today);
  if (from < 0) return null;
  const hoje = forecast.days[from];
  const amanha = forecast.days[from + 1] ?? null;
  return {
    today: hoje,
    tomorrow: amanha,
    warmerBy: amanha ? Math.round(amanha.maxC) - Math.round(hoje.maxC) : null,
  };
}

/** Busca lugares pelo nome. Lista vazia quando não há rede ou não há resposta. */
export async function searchPlaces(
  term: string,
  fetchJson: (url: string) => Promise<unknown>,
): Promise<WeatherPlace[]> {
  const wanted = term.trim();
  if (wanted.length < 2) return [];
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(wanted)}&count=6&format=json`;
  try {
    return parsePlaces(await fetchJson(url));
  } catch {
    return [];
  }
}

/** A previsão de dois dias para um lugar. Nulo quando a rede não respondeu. */
export async function fetchForecast(
  place: WeatherPlace,
  fetchJson: (url: string) => Promise<unknown>,
  nowIso: string,
): Promise<Forecast | null> {
  const url =
    `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=2';
  try {
    const days = parseDays(await fetchJson(url));
    if (days.length === 0) return null;
    return { place, fetchedAt: nowIso, days };
  } catch {
    return null;
  }
}

/** O mesmo lugar? Coordenada guardada contra coordenada pedida. */
function samePlace(a: WeatherPlace, b: WeatherPlace): boolean {
  return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;
}

export type WeatherDeps = {
  fetchJson: (url: string) => Promise<unknown>;
  now: () => string;
  timeZone: string;
  readPlace: () => Promise<WeatherPlace | null>;
  writePlace: (place: WeatherPlace) => Promise<void>;
  readCache: () => Promise<Forecast | null>;
  writeCache: (forecast: Forecast) => Promise<void>;
};

/**
 * A previsão que a tela desenha — cache primeiro, rede depois, nunca exceção.
 *
 * A ordem importa e é a mesma de todo o resto do app: o que está no aparelho
 * responde na hora, e a rede só melhora o que já apareceu. Uma fábrica com
 * internet ruim vê a previsão das seis da manhã com a hora dela do lado, que é
 * honesto; ela não vê uma engrenagem girando.
 */
export async function currentForecast(deps: WeatherDeps): Promise<Forecast | null> {
  const cached = await deps.readCache();
  let place = await deps.readPlace();

  // Sem cidade escolhida, o fuso é o palpite — e ele só custa uma chamada, uma
  // vez. Falhou? O cartão não aparece hoje e tenta de novo amanhã: melhor que
  // uma cidade errada gravada para sempre.
  if (!place) {
    const guess = cityFromTimeZone(deps.timeZone);
    if (!guess) return cached;
    const found = await searchPlaces(guess, deps.fetchJson);
    if (found.length === 0) return cached;
    place = found[0];
    await deps.writePlace(place);
  }

  const usable = cached && samePlace(cached.place, place) ? cached : null;
  if (usable && !isStale(usable, deps.now())) return usable;

  const fresh = await fetchForecast(place, deps.fetchJson, deps.now());
  if (!fresh) return usable;
  await deps.writeCache(fresh);
  return fresh;
}
