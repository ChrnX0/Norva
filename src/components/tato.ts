import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * **A confirmação pelo TATO — o canal que funciona de luva grossa e no escuro.**
 *
 * Pedido do dono em 6 de setembro, com a razão que é de fábrica e não de conforto: *"uma
 * piscada… cor de confirmação e cor de erro… ou até um aviso sonoro"*. Cada canal falha num
 * ambiente diferente — o galpão barulhento mata o som, a luva mata a precisão do toque, e
 * quem está com a mão na massa não olha a tela. Então a confirmação não escolhe um canal:
 * acende o que tiver, e quem estiver disponível entrega a mensagem.
 *
 * O toque já vibrava (`Touchable`, `Button`, `UnitStepper`), e essa é a vibração do DEDO —
 * "o aplicativo recebeu". O que não existia é a do RESULTADO: gravei, ou não deu. São
 * padrões diferentes da biblioteca de propósito (`notificationAsync`, e não `impactAsync`),
 * porque o mesmo tremor para duas respostas opostas é pior que nenhum.
 *
 * **O que este módulo NÃO faz:** decidir quando. Isso é da tela, e a fronteira está escrita
 * em `tatoDeSucesso`.
 */

/**
 * O tremor de "não deu" — e ele mora num lugar só.
 *
 * Toda recusa deste aplicativo chega à pessoa pela folha de confirmação com `acknowledge`:
 * `avisoDeFalha` monta a frase e a folha a mostra sem botão de cancelar, porque não há o
 * que escolher. Então o tato entra ali, uma vez, e vale para as nove telas que gravam —
 * inclusive as que ainda não existem.
 */
export function tatoDeFalha(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

/**
 * O tremor de "gravei" — e ele é chamado pelas telas, uma por uma, de propósito.
 *
 * Não existe um lugar único por onde toda gravação bem-sucedida passe, e inventar um seria
 * pior que a repetição: a camada de dados não vibra (ela devolve fato, não sensação), e um
 * envelope em volta de `record*` só para pendurar o tato faria uma camada nova para
 * explicar. Então cada tela chama, e a fronteira é escrita aqui em vez de ficar na cabeça
 * de quem lê o próximo arquivo:
 *
 * **Chamam os caminhos do CHÃO DE FÁBRICA** — produção, carga, separação, despacho e nota
 * de compra. Ali a pessoa está de luva, no frio, ou com as duas mãos ocupadas, e o
 * resultado tem de chegar sem depender de olhar a tela.
 *
 * **Não chamam os cadastros** — receita, produto, pessoa, transportadora, lugar. Ali quem
 * salva está olhando o formulário que acabou de preencher, e a resposta já é a tela mudando
 * na frente dele. Vibrar também seria barulho sem canal novo: o mesmo defeito do alerta
 * inventado, aplicado ao tato.
 *
 * A fronteira é uma escolha, e ela está medida numa guarda de fonte (`src/tato.test.ts`)
 * para não virar "esqueci deste aqui".
 */
export function tatoDeSucesso(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
