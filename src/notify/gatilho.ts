/**
 * O canal e o gatilho — a parte do aviso que se pode PROVAR.
 *
 * Separado do `index.ts` porque ele importa `Platform` do react-native, e nada que
 * puxa a plataforma roda na suíte: `src/notify/` só tinha teste do que era puro, e
 * por isso a forma do gatilho — que é aritmética sobre um objeto — nunca foi medida.
 * Ficou um ano entregando o aviso na hora errada.
 */

type Notificacoes = typeof import('expo-notifications');

/**
 * O gatilho de data, como a biblioteca o declara.
 *
 * `import type` não carrega módulo nenhum em execução — ele some na compilação —,
 * então a decisão de só tocar `expo-notifications` por `await import` continua
 * valendo, e o tipo aqui é o mesmo que a biblioteca vai conferir.
 */
type GatilhoDeData = import('expo-notifications').DateTriggerInput;

/** O canal do Android por onde os avisos desta fábrica chegam. */
export const CANAL = 'norva-avisos';

/**
 * O gatilho de DATA — e o `type` é o que faz o instante existir.
 *
 * `NotificationTriggerInput` é uma união, e `{ channelId, date }` sem `type` casa com
 * o membro errado: o `ChannelAwareTriggerInput`, cujo docblock na própria biblioteca
 * diz *"A trigger that will cause the notification to be delivered immediately"*. O
 * `date` atravessa o typecheck porque é propriedade conhecida de OUTRO membro da
 * união, e em execução o `parseTrigger` desce a lista inteira e cai no gatilho de
 * canal, que entrega na hora.
 *
 * O efeito: toda vez que o aplicativo abria, ele cancelava o agendado e disparava o
 * aviso no mesmo segundo — o alarme das sete da manhã tocando às três da tarde. É
 * exatamente o alerta que ensina a ignorar alerta, e a Lei 4 (avise na data da
 * DECISÃO) deixava de valer sem nada na tela dizer.
 *
 * `lib` entra por parâmetro porque a biblioteca só existe depois do `await import` —
 * e é isso que torna esta função mensurável sem um aparelho na mão.
 */
export function gatilhoDeData(
  lib: Pick<Notificacoes, 'SchedulableTriggerInputTypes'>,
  quando: Date,
): GatilhoDeData {
  return {
    type: lib.SchedulableTriggerInputTypes.DATE,
    channelId: CANAL,
    date: quando,
  };
}
