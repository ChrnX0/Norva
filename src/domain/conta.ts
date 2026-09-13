/**
 * As parcelas de uma conta — a parte que é FATO, sem uma palavra dentro.
 *
 * A folha do `[por quê?]` desenha parcelas e fechos; a tela escreve o português.
 * O que sobra no meio é aritmética, e é isto: dado um conjunto de partes, qual a
 * fatia de cada uma no todo.
 *
 * **Existe separado porque é o pedaço que se prova.** A soma das fatias é 1, e a
 * soma das partes é o total — duas igualdades contra outra fonte, que é o que a
 * casa exige de asserção sobre número calculado. Um `assert.ok(fatia > 0)` diria
 * que a função devolveu alguma coisa, e isso o typecheck já dá de graça.
 */
export type Parte<T> = { de: T; valor: number };

export type ParteComFatia<T> = { de: T; valor: number; fatia: number | undefined };

/**
 * A fatia de cada parte no total, da maior para a menor.
 *
 * `fatia` é `undefined` — e não zero — quando o total é zero: uma barra cheia
 * para um lugar que não vale nada seria informação inventada, e uma barra vazia
 * afirmaria "vale zero por cento do nada", que não quer dizer coisa nenhuma.
 * Ausência é ausência.
 */
export function comFatia<T>(partes: readonly Parte<T>[]): ParteComFatia<T>[] {
  const total = partes.reduce((n, p) => n + p.valor, 0);
  return [...partes]
    .sort((a, b) => b.valor - a.valor)
    .map((p) => ({ ...p, fatia: total > 0 ? p.valor / total : undefined }));
}

/** O total, que é o fecho de qualquer conta de soma. */
export function somaDe<T>(partes: readonly Parte<T>[]): number {
  return partes.reduce((n, p) => n + p.valor, 0);
}
