import { Platform } from 'react-native';
import { gatilhoDeData } from './gatilho';
import { alertsDue, alertsRunToday, nextAlertAt, type Alert } from '@/domain/alerts';
import { alertSettings } from '@/data/repository';
import { factsForAlerts } from './facts';

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

/**
 * Por que não agendou — CÓDIGO, não frase.
 *
 * A primeira versão devolvia português ("permissão negada"), e o guard de frase na
 * tela pegou com razão, por um motivo melhor que idioma: isto é diagnóstico, e a
 * camada de dados devolve fato, não frase. Se um dia isso precisar aparecer para
 * alguém, quem escreve a frase é a tela — que é a mesma fundação que impede o
 * repositório de falar português.
 */
export type NotScheduled =
  | 'sem-suporte'
  | 'sem-permissao'
  | 'nada-a-avisar'
  | 'sem-dia-alcancavel'
  | 'fora-dos-dias'
  | 'falhou';

/** Um identificador estável, para reagendar sem duplicar. */


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
): Promise<{ scheduled: boolean; reason?: NotScheduled; detail?: string }> {
  const lib = await biblioteca();
  if (!lib) return { scheduled: false, reason: 'sem-suporte' };

  try {
    const permissao = await lib.getPermissionsAsync();
    const concedida =
      permissao.granted || (await lib.requestPermissionsAsync().then((p) => p.granted));
    if (!concedida) return { scheduled: false, reason: 'sem-permissao' };

    const settings = await alertSettings();
    const facts = await factsForAlerts(timeZone);
    const avisos = alertsDue(facts, settings);

    await lib.cancelAllScheduledNotificationsAsync();
    if (avisos.length === 0) return { scheduled: false, reason: 'nada-a-avisar' };

    const quando = nextAlertAt(settings, new Date());
    if (!quando) return { scheduled: false, reason: 'sem-dia-alcancavel' };
    if (!alertsRunToday(settings, quando.getDay())) {
      return { scheduled: false, reason: 'fora-dos-dias' };
    }

    // Um aviso, não sete: a bandeja com sete linhas do mesmo aplicativo é a
    // bandeja que a pessoa limpa sem ler. O mais urgente já vem primeiro do
    // domínio, e os outros continuam na capa, que é onde eles se comparam.
    const { title, body } = phrase(avisos[0]);
    // **O `type` é o que faz o instante existir — sem ele o aviso sai AGORA.**
    //
    // `NotificationTriggerInput` é uma união, e `{ channelId, date }` sem `type` casa
    // com o membro errado: o `ChannelAwareTriggerInput`, cujo docblock na própria
    // biblioteca diz *"A trigger that will cause the notification to be delivered
    // immediately"*. O `date` atravessa o typecheck porque é propriedade conhecida de
    // OUTRO membro da união, e em execução o parser descarta o que não sabe ler.
    //
    // O efeito: toda vez que o aplicativo abre, ele cancela o agendado e dispara o
    // aviso no mesmo segundo — o alarme das 7h da manhã tocando às 15h porque alguém
    // abriu o app. Isso é exatamente o alerta que ensina a ignorar alerta, e a Lei 4
    // (avise na data da DECISÃO) deixa de valer sem nada na tela dizer.
    //
    // O enum vem de `lib` porque a biblioteca entra por `await import` — não existe
    // símbolo dela no topo deste arquivo, por decisão registrada logo acima.
    await lib.scheduleNotificationAsync({
      content: { title, body, data: { kind: avisos[0].kind, subjectId: avisos[0].subjectId } },
      trigger: gatilhoDeData(lib, quando),
    });

    return { scheduled: true };
  } catch (e) {
    // Falhar aqui é perder um aviso; derrubar a tela é perder a fábrica.
    return { scheduled: false, reason: 'falhou', detail: e instanceof Error ? e.message : String(e) };
  }
}
