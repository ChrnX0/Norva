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
 * O canal, como o Android o quer — e ele tem de EXISTIR antes do primeiro aviso.
 *
 * `CANAL` era citado no gatilho desde que o gatilho nasceu, e ninguém nunca o criou.
 * No Android 8 e acima, notificação de canal inexistente não aparece: o sistema a
 * descarta e não diz nada a ninguém. Então o aviso agendado pela forma certa, na hora
 * certa, com a frase certa, chegava a lugar nenhum.
 *
 * `importance` é obrigatório no tipo da biblioteca (`NotificationChannelInput` exige
 * `name` e `importance`) e é o número que decide se o aviso interrompe. Fica `DEFAULT`
 * e não `HIGH`: o aviso desta fábrica é AGENDADO para a hora que a empresa escolheu —
 * ele não é uma interrupção, é a pauta da manhã. `HIGH` põe balão na frente do que a
 * pessoa está fazendo, e quem recebe balão por estoque três dias seguidos desliga o
 * canal inteiro — e canal desligado pelo usuário o aplicativo não religa.
 *
 * O nome entra por parâmetro porque quem fala português é a camada de idioma: este
 * módulo não sabe dizer "Avisos da fábrica" em três línguas, e o nome é o que a pessoa
 * lê nos ajustes do sistema quando vai decidir se aceita.
 */
export function canalDoAviso(
  lib: Pick<Notificacoes, 'AndroidImportance'>,
  nome: string,
): import('expo-notifications').NotificationChannelInput {
  return { name: nome, importance: lib.AndroidImportance.DEFAULT };
}

/**
 * O que o sistema faz com um aviso que chega com o aplicativo ABERTO.
 *
 * Sem isto, `expo-notifications` DESCARTA o aviso em primeiro plano — é o padrão da
 * biblioteca, e o efeito é o pior possível para quem confia no aparelho: o alarme
 * das sete da manhã não aparece exatamente para quem está com o aplicativo na mão às
 * sete da manhã.
 *
 * **E `shouldPlaySound: false` NÃO é a escolha calada que parece.** A própria
 * biblioteca declara, na documentação do tipo: *"On Android, setting
 * `shouldPlaySound: false` will result in the drop-down notification alert **not**
 * showing, no matter what the priority is."* Ou seja, desligar o som desliga o balão
 * junto — o aviso voltaria a não aparecer, agora por outro caminho, e a linha pareceria
 * correta. Este projeto vai para Android; o som fica ligado, e quem não quiser tem o
 * canal do sistema para silenciar (que é dele, não nosso).
 *
 * `shouldSetBadge` fica falso: contador na bolinha do ícone é número que ninguém
 * zera — não existe tela que "leia" avisos aqui —, e número que só sobe é o alerta
 * inventado com outro rosto.
 */
export function comportamentoDoAviso(): import('expo-notifications').NotificationBehavior {
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  };
}

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
