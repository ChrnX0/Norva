import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cityFromTimeZone,
  currentForecast,
  isStale,
  parseDays,
  parsePlaces,
  reading,
  type Forecast,
  type WeatherPlace,
} from './index';

/**
 * O clima é a primeira coisa neste aplicativo que depende de rede, e é por isso
 * que ele tem teste próprio: tudo o mais responde do aparelho em milissegundos.
 * As regras que estes testes seguram são as três que decidem se um cartão de
 * clima ajuda ou atrapalha — não desenhar dado vencido, não pedir o que o fuso
 * já diz, e nunca deixar a falta de internet virar tela quebrada.
 */

const SAO_PAULO: WeatherPlace = {
  name: 'São Paulo',
  region: 'São Paulo',
  latitude: -23.55,
  longitude: -46.63,
};

const RESPOSTA = {
  daily: {
    time: ['2026-09-02', '2026-09-03'],
    temperature_2m_max: [30.6, 32.4],
    temperature_2m_min: [19.1, 20.2],
    precipitation_probability_max: [10, 60],
  },
};

const forecast = (fetchedAt: string, days = parseDays(RESPOSTA)): Forecast => ({
  place: SAO_PAULO,
  fetchedAt,
  days,
});

test('the phone already knows the city, so nobody is asked for it', () => {
  assert.equal(cityFromTimeZone('America/Sao_Paulo'), 'Sao Paulo');
  assert.equal(cityFromTimeZone('America/Argentina/Buenos_Aires'), 'Buenos Aires');
  assert.equal(cityFromTimeZone('Europe/Madrid'), 'Madrid');

  // E o fuso que não carrega cidade nenhuma não inventa uma: procurar "GMT-3"
  // no geocoder acha qualquer coisa, e uma cidade errada gravada calada é pior
  // que cartão nenhum.
  assert.equal(cityFromTimeZone('UTC'), null);
  assert.equal(cityFromTimeZone('Etc/GMT-3'), null);
});

test('a day without a temperature is dropped, never zeroed', () => {
  const days = parseDays(RESPOSTA);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0], { date: '2026-09-02', maxC: 30.6, minC: 19.1, rainChance: 10 });

  // Zero grau em setembro não é dado faltando, é dado errado - e o cartão o
  // desenharia com a mesma confiança dos outros.
  const furado = parseDays({
    daily: {
      time: ['2026-09-02', '2026-09-03'],
      temperature_2m_max: [30.6, null],
      temperature_2m_min: [19.1, 20.2],
    },
  });
  assert.deepEqual(
    furado.map((d) => d.date),
    ['2026-09-02'],
  );
  assert.equal(furado[0].rainChance, null, 'sem chance de chuva na resposta, sem chance na tela');
  assert.deepEqual(parseDays({}), []);
  assert.deepEqual(parseDays(null), []);
});

test('a place without coordinates is not a place', () => {
  const places = parsePlaces({
    results: [
      { name: 'Santa Maria', admin1: 'Rio Grande do Sul', latitude: -29.68, longitude: -53.8 },
      { name: 'Lugar sem mapa' },
    ],
  });
  assert.equal(places.length, 1);
  assert.equal(places[0].region, 'Rio Grande do Sul', 'duas Santa Maria existem');
  assert.deepEqual(parsePlaces({}), []);
});

test('the difference said is the subtraction of the numbers shown', () => {
  // 30,6 e 32,4 aparecem como 31 e 32. A diferença crua é 1,8, que arredonda
  // para 2 - e a tela mostraria "31, amanhã 2° mais quente, 32". O grau dito
  // tem que sair dos graus mostrados.
  const r = reading(forecast('2026-09-02T09:00:00Z'), '2026-09-02');
  assert.ok(r);
  assert.equal(Math.round(r.today.maxC), 31);
  assert.equal(Math.round(r.tomorrow?.maxC ?? 0), 32);
  assert.equal(r.warmerBy, 1);
});

test('a forecast that is entirely in the past draws nothing', () => {
  // O aparelho que passou dois dias sem rede tem previsão guardada, e ela é de
  // anteontem. Desenhá-la é a mesma doença do saldo congelado: o número está
  // ali, com a confiança de sempre, e não é mais verdade.
  assert.equal(reading(forecast('2026-09-02T09:00:00Z'), '2026-09-05'), null);

  // Um dia vencido no meio não atrapalha: hoje é procurado, não assumido.
  const r = reading(forecast('2026-09-02T09:00:00Z'), '2026-09-03');
  assert.equal(r?.today.date, '2026-09-03');
  assert.equal(r?.tomorrow, null, 'sem amanhã na lista, sem comparação inventada');
  assert.equal(r?.warmerBy, null);
});

test('freshness is measured from when the phone asked', () => {
  const f = forecast('2026-09-02T09:00:00Z');
  assert.equal(isStale(f, '2026-09-02T11:00:00Z'), false);
  assert.equal(isStale(f, '2026-09-02T13:00:00Z'), true);

  // Relógio do aparelho andou para trás - fuso, viagem, ajuste manual. Uma
  // idade negativa não é "fresquíssima", é motivo para perguntar de novo.
  assert.equal(isStale(f, '2026-09-02T08:00:00Z'), true);
});

/** Um aparelho de mentira: memória no lugar do banco, e a rede sob controle. */
function device(options: {
  place?: WeatherPlace | null;
  cache?: Forecast | null;
  answer?: (url: string) => unknown;
}) {
  const chamadas: string[] = [];
  const state = { place: options.place ?? null, cache: options.cache ?? null };
  return {
    chamadas,
    state,
    deps: {
      fetchJson: async (url: string) => {
        chamadas.push(url);
        if (!options.answer) throw new Error('sem rede');
        return options.answer(url);
      },
      now: () => '2026-09-02T12:00:00Z',
      timeZone: 'America/Sao_Paulo',
      readPlace: async () => state.place,
      writePlace: async (p: WeatherPlace) => {
        state.place = p;
      },
      readCache: async () => state.cache,
      writeCache: async (f: Forecast) => {
        state.cache = f;
      },
    },
  };
}

test('a fresh answer on the phone never touches the network', async () => {
  const d = device({ place: SAO_PAULO, cache: forecast('2026-09-02T11:00:00Z') });
  const got = await currentForecast(d.deps);
  assert.equal(got?.fetchedAt, '2026-09-02T11:00:00Z');
  assert.deepEqual(d.chamadas, [], 'perguntar de novo a cada abertura gasta a bateria de quem trabalha');
});

test('no network means the last answer, not an empty screen', async () => {
  const d = device({ place: SAO_PAULO, cache: forecast('2026-09-02T06:00:00Z') });
  const got = await currentForecast(d.deps);

  assert.equal(d.chamadas.length, 1, 'venceu, então tentou');
  assert.equal(got?.fetchedAt, '2026-09-02T06:00:00Z', 'e o que já estava aqui continua valendo');
});

test('nothing on the phone and nothing on the network is a card that does not exist', async () => {
  const d = device({ place: SAO_PAULO });
  assert.equal(await currentForecast(d.deps), null);
});

test('the city is deduced once and then it is on the screen to be corrected', async () => {
  const d = device({
    answer: (url) =>
      url.includes('geocoding')
        ? { results: [{ name: 'São Paulo', admin1: 'São Paulo', latitude: -23.55, longitude: -46.63 }] }
        : RESPOSTA,
  });

  const got = await currentForecast(d.deps);
  assert.equal(got?.place.name, 'São Paulo');
  assert.equal(d.state.place?.name, 'São Paulo', 'deduzida uma vez, guardada');
  assert.equal(d.chamadas.length, 2, 'geocoder e previsão, nesta ordem');
  assert.ok(d.chamadas[0].includes('geocoding'));

  // E a segunda abertura já não procura cidade nenhuma.
  d.chamadas.length = 0;
  await currentForecast(d.deps);
  assert.equal(d.chamadas.length, 0, 'a previsão guardada ainda está fresca');
});

test('changing the city throws away the other city answer', async () => {
  // Trocar a cidade e ver a máxima da cidade anterior por três horas é o tipo
  // de erro que faz alguém desligar a informação inteira.
  const outra: WeatherPlace = { name: 'Recife', region: 'Pernambuco', latitude: -8.05, longitude: -34.9 };
  const d = device({
    place: outra,
    cache: forecast('2026-09-02T11:59:00Z'),
    answer: () => RESPOSTA,
  });

  const got = await currentForecast(d.deps);
  assert.equal(d.chamadas.length, 1, 'cache de outro lugar não é cache');
  assert.equal(got?.place.name, 'Recife');
  assert.equal(got?.fetchedAt, '2026-09-02T12:00:00Z');
});
