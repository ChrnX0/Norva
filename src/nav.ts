import { router } from 'expo-router';

/**
 * Voltar — e, quando não há para onde, ir para a capa em vez de sair do aplicativo.
 *
 * **O defeito:** quem entra por LIGAÇÃO PROFUNDA — o QR do engradado na doca, o aviso
 * de validade — chega numa tela com a pilha vazia atrás. `router.back()` ali não volta:
 * fecha o aplicativo. Medido no aparelho em 10 de setembro: partida fria em
 * `norva://losses`, um toque no voltar, e `mCurrentFocus` passa para o launcher.
 *
 * São exatamente as duas portas que este produto promete, e nas duas a pessoa aperta
 * voltar esperando o aplicativo, não a tela inicial do Android.
 *
 * **Este arquivo é uma extração, não uma invenção.** `app/who.tsx` e `app/scan.tsx` já
 * faziam isto, cada um com o seu destino, e o `who.tsx` traz até o registro de como foi
 * achado — *"por leitura, numa análise de olhos novos"*. O que faltava era ser de todo
 * mundo: dez das doze saídas do aplicativo continuavam chamando `back()` cru.
 *
 * **E por que NÃO a âncora de rota**, que parecia resolver tudo com uma linha:
 * `unstable_settings = { anchor: '(tabs)' }` conserta o aparelho e QUEBRA a web. Medido
 * com uma variável só — com a âncora, uma tela aberta por ligação profunda é montada
 * como o segundo cartão da pilha e fica deslocada uma largura inteira para o lado
 * (janela de 412 px, elemento em x = 607), e nunca desliza para o lugar. Quem abre um
 * link na web vê a capa. Perguntar "há para onde voltar?" resolve nos dois lugares e não
 * mexe em como a pilha é montada.
 */
export function voltar(destino: string = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(destino as never);
}
