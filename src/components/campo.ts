/**
 * Quando o campo aceita o valor que vem de quem o usa — e quando ele ignora.
 *
 * Mora fora do `Field` porque `Field` importa `react-native`, e um módulo que
 * importa `react-native` não abre num teste de Node. A regra não precisa de tela
 * para ser provada.
 *
 * **O problema:** `TextInput` controlado no Android repõe o texto nativo sempre
 * que o `value` que volta do JS difere da caixa. Com valor DERIVADO — o nome do
 * produto sai de `composed`, que junta linha, tipo e sabor quando ninguém
 * digitou — esse valor volta uma renderização atrasada, e o que foi digitado no
 * meio some. Medido: as mesmas dezessete letras ficaram inteiras no campo de eco
 * puro e viraram "Picole de moran", "Picole de mor" e "Picole " no derivado.
 *
 * **A primeira régua que escrevi para isto tinha memória** — ignorava o que já
 * tivesse subido do campo — e ela engolia um caso legítimo: o formulário que se
 * esvazia depois de salvar. `setNome('')` com um nome de oito letras ou menos
 * ainda estava na janela de memória, então o campo continuaria mostrando o texto
 * de antes com o pai achando que limpou. Achado lendo o próprio conserto, antes
 * de ele chegar ao aparelho.
 *
 * **A régua que ficou não guarda nada:** com o dedo no campo, quem manda é quem
 * digita; fora dele, quem manda é o pai. Não há janela para acertar, não há
 * comprimento que mude o resultado, e o valor do pai nunca se perde — na pior
 * hipótese ele entra ao sair do campo.
 */
export function aceitaDoPai(valorDoPai: string, textoNaTela: string, dedoNoCampo: boolean): boolean {
  if (dedoNoCampo) return false;
  return valorDoPai !== textoNaTela;
}

/**
 * Campo que nasce com o palpite do sistema, e quem digita manda.
 *
 * **Mora aqui, e não na tela, porque o navegador não consegue provar.** A tela da compra
 * passou a sugerir o fornecedor e a contagem de pacotes da última nota daquele insumo, e a
 * checagem de navegador que eu escrevi para "apagar o sugerido fica apagado" **passou com o
 * defeito plantado**: trocando o `??` por `||`, o campo apagado recebe a sugestão de volta,
 * e a asserção continuou verde. A causa é do `input` controlado — o `value` que o React
 * calcula é o mesmo antes e depois, então ele não repõe o texto que o Playwright apagou.
 *
 * No APARELHO não é assim, e o docblock de cima desta mesma casa já conta por quê: o
 * `TextInput` do Android repõe o texto nativo quando o valor derivado difere da caixa. O
 * defeito que o navegador não vê chega ao dedo de quem usa.
 *
 * **A régua é uma distinção, e é ela que o `||` apaga:** `undefined` quer dizer *ninguém
 * digitou neste campo*, e aí vale a sugestão; **string vazia é uma digitação** — quem apagou
 * o nome quer o campo vazio. As duas são falsas em JavaScript, e é por isso que a diferença
 * entre `??` e `||` aqui não é estilo: é a tela brigando ou não com quem usa.
 *
 * Devolve as duas respostas porque a tela precisa das duas: o valor, e se ele ainda é o
 * palpite — que é quando a dica "da última nota" tem o que explicar. *"O sistema sugere,
 * nunca decide calado"*: campo preenchido sem dizer de onde veio é decidir calado.
 */
export function campoComSugestao(
  digitado: string | undefined,
  sugerido: string | null,
  padrao = '',
): { valor: string; ehSugestao: boolean } {
  if (digitado !== undefined) return { valor: digitado, ehSugestao: false };
  if (sugerido !== null && sugerido !== '') return { valor: sugerido, ehSugestao: true };
  return { valor: padrao, ehSugestao: false };
}
