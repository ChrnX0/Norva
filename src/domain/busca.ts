/**
 * Procurar um nome numa lista — de luva, e sem cobrar acento.
 *
 * **Por que isto é do domínio e não da tela.** A grade de nomes do chão de fábrica
 * é a primeira lista que cresce sem limite: o dono levantou o caso ao pensar em
 * porte — *"funciona com seis pessoas; com duzentas, uma grade de nomes é uma lista
 * telefônica"*. A REGRA de achar (ignorar acento, casar por trecho, e o corte a
 * partir do qual procurar ganha de rolar) é aritmética, e aritmética se mede. O que
 * fica na tela é o desenho do campo.
 *
 * A segunda lista que vai crescer é o catálogo, e a terceira são os lugares. Quando
 * chegarem, elas chamam isto em vez de escrever a quarta grafia da mesma regra.
 */

/** O texto sem acento e em minúsculas: quem digita com luva não vai atrás do til. */
export function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * A partir de quantos nomes procurar ganha de rolar.
 *
 * Doze, e não é gosto: a duas colunas com alvo grande — o alvo é grande porque a
 * mão está de luva a dezoito graus negativos — doze nomes são cerca de duas telas
 * num telefone de 360 dp. Abaixo disso a lista cabe inteira à vista, e oferecer uma
 * caixa de busca para escolher entre seis nomes é pedir o que a tela já mostra.
 */
export const PROCURA_A_PARTIR_DE = 12;

/** Vale a pena oferecer busca para esta lista? */
export function valeProcurar(quantos: number): boolean {
  return quantos > PROCURA_A_PARTIR_DE;
}

/**
 * Os que casam com o que foi digitado — todos, quando nada foi digitado.
 *
 * Casa por TRECHO e não por começo: numa fábrica onde três pessoas se chamam
 * "Maria", o que distingue é o sobrenome, e quem digita "silva" está procurando
 * exatamente por ele. Busca por prefixo devolveria as três Marias e nenhuma Silva.
 */
export function procurar<T>(itens: readonly T[], digitado: string, nomeDe: (item: T) => string): T[] {
  const alvo = semAcento(digitado.trim());
  if (!alvo) return [...itens];
  return itens.filter((item) => semAcento(nomeDe(item)).includes(alvo));
}
