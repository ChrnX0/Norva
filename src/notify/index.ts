import { Platform } from 'react-native';
import { CANAL, canalDoAviso, comportamentoDoAviso, gatilhoDeData } from './gatilho';
import { alertsDue, proximosAvisos, type Alert } from '@/domain/alerts';
import { alertSettings } from '@/data/repository';
import { factsForAlerts } from './facts';
import { rotaDoAviso } from './rota';

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
  | 'falhou';

/**
 * **`'fora-dos-dias'` saiu daqui em 13 de setembro, porque era inalcançável.**
 *
 * O código conferia `alertsRunToday(settings, quando.getDay())` DEPOIS de `nextAlertAt`, e
 * `nextAlertAt` só devolve dia que a empresa escolheu — ele pula os outros no próprio laço.
 * Então a checagem era sempre verdadeira, o ramo nunca rodava, e o motivo nunca chegava a
 * ninguém. Peça sem caminho até ela, na forma mais barata de não notar: um `if` que parece
 * cuidado.
 */

/**
 * Quantos avisos ficam agendados à frente.
 *
 * **Era UM, e um aviso é silêncio a partir do dia seguinte.** A fila era recalculada só
 * quando alguém abria o aplicativo: telefone deixado na fábrica na sexta à noite recebia o
 * aviso de sábado e mais nada — nem domingo, nem segunda —, e ninguém tem como perceber
 * que parou, porque a ausência de notificação é idêntica a "está tudo bem".
 *
 * Três e não sete. O que está agendado é o fato de HOJE, e ele envelhece: a polpa que
 * acabava em dois dias já acabou. Três cobre o fim de semana com um feriado grudado, que é
 * a folga real de uma fábrica pequena; a partir daí o aviso estaria afirmando um número que
 * ninguém mediu, e repetir sete vezes a mesma frase é a definição do alerta que ensina a
 * ignorar alerta.
 */
const AVISOS_ADIANTADOS = 3;

/**
 * O comportamento em primeiro plano é declarado UMA vez por processo.
 *
 * A biblioteca guarda o manipulador num módulo; chamar de novo a cada abertura só troca o
 * mesmo objeto por outro igual. O sinalizador não é economia — é o que impede um
 * reagendamento de derrubar o manipulador no meio de um aviso chegando.
 */
let comportamentoDeclarado = false;


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
    const lib = await import('expo-notifications');
    if (!comportamentoDeclarado) {
      // **Sem isto a biblioteca DESCARTA o aviso com o aplicativo aberto**, que é o
      // pior caso possível: o alarme das sete não aparece justamente para quem está
      // com o aparelho na mão às sete. O porquê de cada campo está em `gatilho.ts`,
      // inclusive a armadilha de que desligar o som desliga o balão no Android.
      lib.setNotificationHandler({ handleNotification: async () => comportamentoDoAviso() });
      comportamentoDeclarado = true;
    }
    return lib;
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
  /**
   * O nome do canal, como a pessoa o vê nos ajustes do Android.
   *
   * Entra por parâmetro pela mesma razão da frase: quem fala português é a camada de
   * idioma. E o canal tem de ser criado antes do primeiro aviso — sem ele o Android
   * descarta a notificação sem dizer nada.
   */
  canal: string,
): Promise<{ scheduled: boolean; reason?: NotScheduled; detail?: string }> {
  const lib = await biblioteca();
  if (!lib) return { scheduled: false, reason: 'sem-suporte' };

  try {
    const permissao = await lib.getPermissionsAsync();
    const concedida =
      permissao.granted || (await lib.requestPermissionsAsync().then((p) => p.granted));
    if (!concedida) return { scheduled: false, reason: 'sem-permissao' };

    // O canal ANTES de qualquer agendamento, e só no Android — nas outras
    // plataformas a função não existe no módulo.
    if (Platform.OS === 'android') {
      await lib.setNotificationChannelAsync(CANAL, canalDoAviso(lib, canal));
    }

    const settings = await alertSettings();
    const facts = await factsForAlerts(timeZone);
    const avisos = alertsDue(facts, settings);

    await lib.cancelAllScheduledNotificationsAsync();
    if (avisos.length === 0) return { scheduled: false, reason: 'nada-a-avisar' };

    // Quantos dias à frente é REGRA, e mora no domínio com teste: ver `proximosAvisos`.
    const instantes = proximosAvisos(settings, new Date(), AVISOS_ADIANTADOS);
    if (instantes.length === 0) return { scheduled: false, reason: 'sem-dia-alcancavel' };

    // Um aviso, não sete: a bandeja com sete linhas do mesmo aplicativo é a
    // bandeja que a pessoa limpa sem ler. O mais urgente já vem primeiro do
    // domínio, e os outros continuam na capa, que é onde eles se comparam.
    const { title, body } = phrase(avisos[0]);
    const dado = {
      kind: avisos[0].kind,
      subjectId: avisos[0].subjectId,
      // O que o toque precisa saber e o `kind` não diz: lote vencido abre a tela de
      // perda, e não a do lote. Ver `src/notify/rota.ts`.
      venceu: avisos[0].kind === 'validade' && avisos[0].amount < 0,
    };
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
    for (const quando of instantes) {
      await lib.scheduleNotificationAsync({
        content: { title, body, data: dado },
        trigger: gatilhoDeData(lib, quando),
      });
    }

    return { scheduled: true };
  } catch (e) {
    // Falhar aqui é perder um aviso; derrubar a tela é perder a fábrica.
    return { scheduled: false, reason: 'falhou', detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * O toque no aviso abre a tela do assunto — as DUAS entradas do gesto.
 *
 * `getLastNotificationResponseAsync` responde pelo aplicativo que estava MORTO: o sistema
 * guarda o toque que o acordou, e sem esta chamada ele nasce na capa como se alguém tivesse
 * tocado no ícone. `addNotificationResponseReceivedListener` responde pelo aplicativo que
 * estava em segundo plano. São dois caminhos para o mesmo dedo, e atender um só deixa o
 * defeito inteiro de pé na metade das vezes — a mesma armadilha do `voltar()` que atendia a
 * seta do cabeçalho e não a tecla do aparelho, escrita no `CLAUDE.md`.
 *
 * Para onde ir é decisão de `./rota`, que é puro e tem teste; aqui só sobra o que precisa de
 * um celular. `ir` entra por parâmetro porque quem navega é a árvore de telas, e um
 * adaptador que importasse o roteador seria adaptador que nenhum teste carrega.
 *
 * Devolve a função de desligar. Nada aqui pode derrubar a tela: sem biblioteca, sem
 * permissão ou com dado estranho, o aplicativo abre onde abriria de qualquer jeito.
 */
export async function aoTocarNoAviso(ir: (rota: string) => void): Promise<() => void> {
  const lib = await biblioteca();
  if (!lib) return () => {};

  try {
    const frio = await lib.getLastNotificationResponseAsync();
    const rotaFria = rotaDoAviso(frio?.notification.request.content.data);
    if (rotaFria) ir(rotaFria);

    const inscricao = lib.addNotificationResponseReceivedListener((resposta) => {
      const rota = rotaDoAviso(resposta.notification.request.content.data);
      if (rota) ir(rota);
    });
    return () => inscricao.remove();
  } catch {
    return () => {};
  }
}
