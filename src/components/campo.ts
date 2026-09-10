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
