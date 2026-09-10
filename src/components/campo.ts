/**
 * A régua que separa o eco do campo de uma decisão de quem o usa.
 *
 * Mora fora do `Field` porque `Field` importa `react-native`, e um módulo que
 * importa `react-native` não abre num teste de Node. A regra é aritmética de
 * texto e não precisa de tela para ser provada — então ela sai daqui e a tela a
 * chama.
 *
 * O problema que ela resolve está escrito no `Field`: `TextInput` controlado
 * repõe o texto nativo quando o `value` que volta do JS difere da caixa, e um
 * valor DERIVADO volta atrasado. Quem chega atrasado é sempre alguma coisa que
 * já subiu daqui — por isso o critério é memória, não comparação de conteúdo.
 */
export function ehEcoDoCampo(valorDoPai: string, enviados: readonly string[]): boolean {
  return enviados.includes(valorDoPai);
}

/** Quantos valores enviados a memória guarda — o bastante para uma rajada de digitação. */
export const MEMORIA_DO_CAMPO = 8;

/** A memória depois de mais uma tecla, sempre curta. */
export function lembrar(enviados: readonly string[], proximo: string): string[] {
  return [...enviados.slice(-MEMORIA_DO_CAMPO), proximo];
}
