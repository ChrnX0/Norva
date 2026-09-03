import { Platform } from 'react-native';
import { alertsDue, alertsRunToday, nextAlertAt, type Alert, type AlertFacts } from '@/domain/alerts';
import {
  alertSettings,
  defaultLocationId,
  expiringSoon,
  lastReadings,
  listItems,
  listPlaces,
  orderedDemand,
  runningOut,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { nowIso } from '@/data/db';
import { dayWindow, localDate } from '@/domain/day';

/**
 * O aviso saindo do aplicativo para o sistema operacional.
 *
 * Esta é a única camada do assunto que um teste desta máquina NÃO prova. A regra
 * — o que merece aviso, com que antecedência, em que hora e em que dias — mora em
 * `src/domain/alerts.ts` com teste e mutação. Aqui embaixo só sobra o que depende
 * de um celular de verdade: permissão, agendamento e a bandeja de notificação.
 *
 * A separação é deliberada e tem precedente nesta base: o `pickSuggestion` viveu
 * dentro de um componente e o `mutate` não alcançava a regra. Regra que mora no
 * adaptador é regra sem rede.
 *
 * **Nada aqui pode derrubar a tela.** Permissão negada, navegador sem suporte,
 * biblioteca ausente: tudo cai em silêncio e o aplicativo continua inteiro — a
 * capa faz as mesmas contas, com os mesmos números, sem nenhum aviso. Um app que
 * não abre porque a notificação falhou é infinitamente pior que um app sem
 * notificação.
 */

/** Um identificador estável, para reagendar sem duplicar. */
const CANAL = 'norva-avisos';

type Notificacoes = typeof import('expo-notifications');

/**
 * Carrega a biblioteca só quando ela é usada, e nunca no web.
 *
 * `expo-notifications` no navegador precisa de push com service worker, que é
 * outro produto — e o e2e roda no navegador. Importar no topo faria a suíte
 * inteira carregar um módulo que ela não pode exercitar.
 */
async function biblioteca(): Promise<Notificacoes | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/** Os fatos de hoje, lidos do livro-razão — a mesma aritmética que a capa mostra. */
export async function factsForAlerts(timeZone: string): Promise<AlertFacts> {
  const today = dayWindow(nowIso(), timeZone);
  const lastWeek = dayWindow(nowIso(), timeZone, -7);
  const through = localDate(nowIso(), timeZone, 7);
  const trinta = localDate(nowIso(), timeZone, 30);
  const agora = new Date(nowIso());

  const [cover, demand, expiring, items, places, readings] = await Promise.all([
    runningOut(LOCAL_COMPANY_ID, lastWeek.from, today.to, 7, Number.POSITIVE_INFINITY),
    orderedDemand(LOCAL_COMPANY_ID, through),
    expiringSoon(LOCAL_COMPANY_ID, trinta, 10, defaultLocationId(LOCAL_COMPANY_ID)),
    listItems(LOCAL_COMPANY_ID),
    listPlaces(LOCAL_COMPANY_ID),
    lastReadings(LOCAL_COMPANY_ID),
  ]);

  const hoje = localDate(nowIso(), timeZone);

  return {
    cover: cover.map((c) => ({ itemId: c.itemId, name: c.name, daysLeft: c.daysLeft })),
    orders: demand.map((d) => ({
      itemId: d.itemId,
      name: d.name,
      missing: Math.max(0, d.requested - d.onHand),
      // A demanda vem somada por item, sem data por linha: a janela da consulta é
      // a antecedência, então tudo o que ela devolve já está dentro do prazo.
      daysUntil: 0,
      placeId: d.itemId,
    })),
    volumes: items
      .filter((i) => i.kind === 'input' || i.kind === 'packaging')
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

/**
 * Reagenda o próximo aviso, se houver o que avisar.
 *
 * Chamada quando o aplicativo abre. Cancela o que estava agendado antes de
 * agendar de novo, porque o dado mudou: um aviso de polpa acabando que foi
 * agendado ontem e comprado hoje de manhã é exatamente o alerta que ensina a
 * ignorar alerta.
 */
export async function rescheduleAlerts(
  timeZone: string,
  /** A frase, escrita pela camada que fala português. */
  phrase: (alert: Alert) => { title: string; body: string },
): Promise<{ scheduled: boolean; reason?: string }> {
  const lib = await biblioteca();
  if (!lib) return { scheduled: false, reason: 'sem suporte nesta plataforma' };

  try {
    const permissao = await lib.getPermissionsAsync();
    const concedida =
      permissao.granted || (await lib.requestPermissionsAsync().then((p) => p.granted));
    if (!concedida) return { scheduled: false, reason: 'permissão negada' };

    const settings = await alertSettings();
    const facts = await factsForAlerts(timeZone);
    const avisos = alertsDue(facts, settings);

    await lib.cancelAllScheduledNotificationsAsync();
    if (avisos.length === 0) return { scheduled: false, reason: 'nada a avisar' };

    const quando = nextAlertAt(settings, new Date());
    if (!quando) return { scheduled: false, reason: 'nenhum dia combinado alcançável' };
    if (!alertsRunToday(settings, quando.getDay())) {
      return { scheduled: false, reason: 'hoje não é dia de avisar' };
    }

    // Um aviso, não sete: a bandeja com sete linhas do mesmo aplicativo é a
    // bandeja que a pessoa limpa sem ler. O mais urgente já vem primeiro do
    // domínio, e os outros continuam na capa, que é onde eles se comparam.
    const { title, body } = phrase(avisos[0]);
    await lib.scheduleNotificationAsync({
      content: { title, body, data: { kind: avisos[0].kind, subjectId: avisos[0].subjectId } },
      trigger: { channelId: CANAL, date: quando },
    });

    return { scheduled: true };
  } catch (e) {
    // Falhar aqui é perder um aviso; derrubar a tela é perder a fábrica.
    return { scheduled: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
