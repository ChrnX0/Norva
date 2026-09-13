import { faltaProduzir } from '@/domain/picking';
import {
  expiringSoon,
  lastReadings,
  listItems,
  listOrders,
  listPlaces,
  stockAgainstOrders,
  deliveriesOf,
  runningOut,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { nowIso } from '@/data/db';
import { dayWindow, diasDeCalendario, localDate } from '@/domain/day';
import { daysUntilExpiry } from '@/domain/lot';
import { observedLeadTimeDays } from '@/domain/cost';
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
    // Da unidade, como o listItems logo abaixo: o aviso de acabar é para quem
    // entra NESTE prédio, e o insumo da outra cidade não o socorre.
    runningOut(empresaDaqui(), lastWeek.from, today.to, 7, Number.POSITIVE_INFINITY, {
      unidade: unidadeDaqui(),
    }),
    // A unidade deste aparelho, e não a empresa: o aviso "quatro lojas esperando" é
    // sobre o que ESTA unidade tem para carregar. Somar o freezer da outra cidade
    // faria o aviso calar justamente onde falta produto.
    stockAgainstOrders(empresaDaqui(), through, unidadeDaqui(), { from: today.from, to: today.to }),
    // Os pedidos em aberto vêm além da demanda somada, e não é redundância: a
    // demanda agrupa por ITEM e o aviso conta LOJAS. Sem esta consulta eu estava
    // usando o id do item como id de loja — o aviso diria "quatro lojas
    // esperando" para quatro sabores pedidos pela mesma loja.
    listOrders(empresaDaqui(), ['pending', 'open']),
    // Sem local, pela mesma razão da capa: o alarme é sobre o lote, não sobre a
    // prateleira. Filtrar pelo almoxarifado emudecia o aviso no dia em que o
    // picolé ia para a câmara fria — que é o dia seguinte ao de produzi-lo.
    // Da unidade: a câmara fria está dentro dela (então mandar o picolé para lá
    // não emudece o aviso, que era o defeito de filtrar por sala), e a loja do
    // cliente está fora (então lote entregue não avisa, que era o defeito de somar
    // a empresa).
    expiringSoon(empresaDaqui(), trinta, 10, { unidade: unidadeDaqui() }),
    // Da unidade: a régua de pote cheio é física — o pote está num prédio, e o
    // aviso é para quem entra nele.
    listItems(empresaDaqui(), undefined, false, { unidade: unidadeDaqui() }),
    listPlaces(empresaDaqui()),
    lastReadings(empresaDaqui()),
  ]);

  return {
    // O prazo do fornecedor entra POR ITEM, e é o que faz o aviso usar a mesma
    // régua da ficha do insumo. Uma consulta por item da cobertura: são poucos, e
    // isto roda no trabalho de fundo que decide os avisos do dia, não num desenho
    // de tela. Nulo quando ninguém anotou a data de um pedido — e aí o aviso cai
    // no piso configurado, que é a resposta honesta de quem ainda não sabe.
    cover: await Promise.all(
      cover.map(async (c) => ({
        itemId: c.itemId,
        name: c.name,
        daysLeft: c.daysLeft,
        leadTimeDays: observedLeadTimeDays(await deliveriesOf(empresaDaqui(), c.itemId)),
      })),
    ),
    // Uma linha por (item, loja) em falta: a falta é a da FÁBRICA, do item, e a
    // loja é quem está esperando por ela. É o que permite o aviso contar lojas
    // sem inventar rateio: se falta picolé, toda loja que pediu picolé espera.
    orders: demand.flatMap((d) => {
      const missing = faltaProduzir(d);
      if (missing <= 0) return [];
      const esperando = orders.filter((o) => o.lines.some((l) => l.itemId === d.itemId));
      return esperando.map((o) => ({
        itemId: d.itemId,
        name: d.name,
        missing,
        // Dias até o dia pedido. Sem dia marcado, é hoje: um pedido sem data é um
        // pedido para agora, e empurrá-lo para o fim da fila é o app decidindo
        // calado o que o cliente não disse.
        daysUntil: o.requestedFor ? diasDeCalendario(hoje, o.requestedFor) : 0,
        placeId: o.placeId,
      }));
    }),
    // Qualquer item, e não só insumo.
    //
    // (Este comentário começava com a palavra portuguesa para "qualquer" seguida
    // de "item" — que o guard de pendências leu como marcador de tarefa, com
    // razão: quem procura pendências no repositório acharia trabalho que não
    // existe. Escrever a palavra aqui para explicar teria o mesmo efeito.)
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
      // O nome do produto já vinha da consulta e era jogado fora aqui. A frase
      // dizia o código do lote e mais nada.
      name: l.name,
      // A função do domínio para ESTA pergunta. Ela ficou dois meses listada como "sem
      // chamador" com a justificativa de que ninguém contava dias — enquanto esta linha
      // contava, à mão, a mesma conta.
      daysLeft: daysUntilExpiry(l.expiresOn, hoje),
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

