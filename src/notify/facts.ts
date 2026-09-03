import {
  defaultLocationId,
  expiringSoon,
  lastReadings,
  listItems,
  listOrders,
  listPlaces,
  orderedDemand,
  runningOut,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { nowIso } from '@/data/db';
import { dayWindow, localDate } from '@/domain/day';
import type { AlertFacts } from '@/domain/alerts';

/**
 * Os fatos que alimentam o alarme, separados do adaptador de propósito.
 *
 * Estavam no mesmo arquivo do agendador, e o teste não conseguia alcançá-los: o
 * adaptador importa `react-native` para saber a plataforma, e um teste de Node
 * não transforma esse pacote. Fato é trabalho da camada de dados e se prova aqui;
 * plataforma é a única coisa que fica lá.
 *
 * Foi um defeito meu que forçou a separação — `placeId: d.itemId`, item passando
 * por loja — e ele existia justamente porque nada podia testar esta função.
 */

/** Os fatos de hoje, lidos do livro-razão — a mesma aritmética que a capa mostra. */
export async function factsForAlerts(timeZone: string): Promise<AlertFacts> {
  const today = dayWindow(nowIso(), timeZone);
  const lastWeek = dayWindow(nowIso(), timeZone, -7);
  const through = localDate(nowIso(), timeZone, 7);
  const trinta = localDate(nowIso(), timeZone, 30);
  const agora = new Date(nowIso());
  const hoje = localDate(nowIso(), timeZone);

  const [cover, demand, orders, expiring, items, places, readings] = await Promise.all([
    runningOut(LOCAL_COMPANY_ID, lastWeek.from, today.to, 7, Number.POSITIVE_INFINITY),
    orderedDemand(LOCAL_COMPANY_ID, through),
    // Os pedidos em aberto vêm além da demanda somada, e não é redundância: a
    // demanda agrupa por ITEM e o aviso conta LOJAS. Sem esta consulta eu estava
    // usando o id do item como id de loja — o aviso diria "quatro lojas
    // esperando" para quatro sabores pedidos pela mesma loja.
    listOrders(LOCAL_COMPANY_ID, ['pending', 'open']),
    expiringSoon(LOCAL_COMPANY_ID, trinta, 10, defaultLocationId(LOCAL_COMPANY_ID)),
    listItems(LOCAL_COMPANY_ID),
    listPlaces(LOCAL_COMPANY_ID),
    lastReadings(LOCAL_COMPANY_ID),
  ]);

  return {
    cover: cover.map((c) => ({ itemId: c.itemId, name: c.name, daysLeft: c.daysLeft })),
    // Uma linha por (item, loja) em falta: a falta é a da FÁBRICA, do item, e a
    // loja é quem está esperando por ela. É o que permite o aviso contar lojas
    // sem inventar rateio: se falta picolé, toda loja que pediu picolé espera.
    orders: demand.flatMap((d) => {
      const missing = Math.max(0, d.requested - d.onHand);
      if (missing <= 0) return [];
      const esperando = orders.filter((o) => o.lines.some((l) => l.itemId === d.itemId));
      return esperando.map((o) => ({
        itemId: d.itemId,
        name: d.name,
        missing,
        // Dias até o dia pedido. Sem dia marcado, é hoje: um pedido sem data é um
        // pedido para agora, e empurrá-lo para o fim da fila é o app decidindo
        // calado o que o cliente não disse.
        daysUntil: o.requestedFor
          ? Math.round(
              (new Date(`${o.requestedFor}T00:00:00.000Z`).getTime() -
                new Date(`${hoje}T00:00:00.000Z`).getTime()) /
                86_400_000,
            )
          : 0,
        placeId: o.placeId,
      }));
    }),
    // Qualquer item, e não só insumo.
    //
    // (A primeira versão deste comentário começava com "TODO item" — português
    // que o guard de pendências leu como marcador de tarefa, com razão: quem
    // busca TODO no repositório ia achar trabalho que não existe.)
    //
    // A primeira versão filtrava insumo e embalagem, copiando o recorte do
    // cartão de "dinheiro parado" — que é outra pergunta. A faixa azul do dono
    // ("80 a 100%") é justamente sobre a CÂMARA CHEIA de produto acabado: quem
    // enche a câmara para de produzir por falta de espaço, e isso não aparece
    // olhando insumo.
    //
    // Item sem régua continua fora por si mesmo, sem filtro nenhum: `fullLevel`
    // nulo não gera faixa.
    volumes: items
      .map((i) => ({
        itemId: i.id,
        name: i.name,
        onHand: i.onHandBaseUnits,
        fullLevel: i.fullLevel,
      })),
    expiring: expiring.map((l) => ({
      lotId: l.lotId,
      code: l.code,
      daysLeft: Math.round(
        (new Date(`${l.expiresOn}T00:00:00.000Z`).getTime() -
          new Date(`${hoje}T00:00:00.000Z`).getTime()) /
          86_400_000,
      ),
    })),
    ambient: readings.map((r) => {
      const lugar = places.find((p) => p.id === r.locationId);
      const faixa = lugar?.sensorRanges[r.kind];
      return {
        locationId: r.locationId,
        place: lugar?.name || '',
        kind: r.kind,
        value: r.value,
        unit: r.unit,
        min: faixa?.min ?? null,
        max: faixa?.max ?? null,
        hoursOld: Math.max(0, (agora.getTime() - new Date(r.takenAt).getTime()) / 3_600_000),
      };
    }),
  };
}

