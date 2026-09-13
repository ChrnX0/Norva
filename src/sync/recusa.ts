/**
 * A recusa do servidor é para SEMPRE ou para AGORA — e o padrão é "agora".
 *
 * **O defeito que isto existe para consertar é o mais caro desta fila, e ele tem cara nova.**
 * Dois celulares na mesma doca, os dois offline, conferem a mesma carga. O primeiro sobe e
 * entra. O segundo sobe e o servidor recusa, com razão — a `0051` existe para o saldo não
 * dobrar. Só que a fila não sabe o que fazer com uma recusa CERTA: `drain` vê "entraram menos
 * do que eu mandei", chama isso de lacuna, espera, tenta de novo, desiste em três e **não
 * marca nada**. Na sincronia seguinte, a mesma parede — e tudo o que aquele aparelho gravou
 * depois (perdas, produção, transferência) fica preso atrás dela, para sempre, sem uma
 * palavra a quem conferiu.
 *
 * **A assimetria de custo é o que decide o padrão, e ela não é simétrica nem de longe:**
 *
 *   classificar passageira como PERMANENTE -> a linha sai da frente e nunca chega ao
 *                                             servidor: DADO PERDIDO em silêncio, que é o
 *                                             pior resultado que esta fila tem;
 *   classificar permanente como PASSAGEIRA  -> a fila trava, que é o comportamento de hoje:
 *                                             ruim, visível, e sem perda.
 *
 * Então o padrão é `passageira` para todo código desconhecido, e promover um código a
 * permanente exige certeza — não suspeita. Cada promoção entra com a medida ao lado.
 */

export type ClasseDaRecusa = 'permanente' | 'passageira';

/**
 * Os códigos que NUNCA vão entrar, por mais que se tente. `SQLSTATE` do Postgres, que é o
 * que o PostgREST devolve em `error.code`.
 *
 * `23505` (violação de unicidade) é certo, e a razão é a forma da nossa própria escrita: a
 * fila sobe por `upsert` com `onConflict: 'id'`, então um conflito de unicidade **não é o id**
 * — é outro índice, ou um gatilho nosso que escolheu esse código. A `0051` é exatamente isso:
 *
 *     raise exception using
 *       errcode = 'unique_violation',
 *       message = 'esta remessa já foi conferida';
 *
 * Mandar a MESMA linha de novo bate na mesma parede, sempre. Não é palpite sobre um servidor
 * que ninguém exercitou: o código foi escolhido por nós, na nossa migração.
 */
/**
 * O código da NOSSA `0051`, com nome — porque a TELA precisa fazer a pergunta.
 *
 * A frase que o aparelho mostra sobre uma linha posta de lado (*"o servidor já tinha o registro
 * da mesma carga"*) só é verdade para ESTE código. Escrever `'23505'` dentro da tela seria a
 * mesma constante em duas mãos, em dois arquivos, e é assim que uma promoção futura deixa a
 * tela afirmando com confiança uma causa que não é a dela.
 *
 * **E o literal está repetido na linha de baixo de propósito.** A garantia 32 do `db:verify`
 * PARSEIA `const PERMANENTES ... new Set([...])` para comparar a lista contra o `sqlstate` que
 * um Postgres de verdade devolve — trocar o literal por este nome faria aquela guarda ler
 * `CODIGO_JA_EXISTE` e reprovar dizendo que o aparelho não trata `23505`. A guarda que mede
 * contra o servidor vale mais que a elegância de uma referência, então a duplicação fica e
 * `src/sync/recusa.test.ts` amarra as duas pela porta pública: `classeDaRecusa(CODIGO_JA_EXISTE)`
 * tem de ser `permanente`.
 */
export const CODIGO_JA_EXISTE = '23505';

const PERMANENTES: ReadonlySet<string> = new Set(['23505']);

/**
 * O que NÃO está aqui, e por que cada um ficou de fora — porque a lista curta é a decisão.
 *
 * `23503` (chave estrangeira) seria permanente se acontecesse: filho antes do pai não se
 * resolve tentando de novo. Mas ele não acontece — `pendingEntries` manda na ordem de
 * escrita (`rowid`, não relógio), e a cicatriz está escrita lá. Promovê-lo seria pagar o
 * risco de perda por um caso que a ordenação já impede.
 *
 * `42501` (permissão negada) é a cicatriz do `grant` que falta, e ela é **consertável do
 * outro lado**: um `grant` amanhã faz a mesma linha entrar. Pôr de lado agora perderia dado
 * que o servidor vai querer.
 *
 * `23514` (violação de CHECK) tem cara de permanente e não é sempre: um CHECK novo pode
 * recusar hoje o que uma migração seguinte aceita. Fica fora até alguém medir um caso real.
 */
export function classeDaRecusa(codigo: string | null | undefined): ClasseDaRecusa {
  if (!codigo) return 'passageira';
  return PERMANENTES.has(codigo.trim()) ? 'permanente' : 'passageira';
}

/** Os códigos promovidos, para a guarda poder conferir a lista contra as migrações. */
export const CODIGOS_PERMANENTES: readonly string[] = [...PERMANENTES];

/**
 * Toda linha desta lista foi recusada por "já existe"? — e é a tela do que ficou de lado que
 * pergunta.
 *
 * Ela existe porque a resposta decide uma FRASE, e a frase afirma uma CAUSA. Hoje `23505` é o
 * único código promovido, então a resposta é sempre `true` e a tela estaria certa por
 * coincidência do tamanho de uma lista. No dia em que um segundo código for promovido — e o
 * docblock de `PERMANENTES` diz que isso acontece, com a medida ao lado —, a tela passaria a
 * explicar TODA recusa como duplicação, que é afirmar com confiança o que não se sabe.
 *
 * Lista vazia devolve `false`: não há o que explicar, e "todas" de nada não é afirmação sobre o
 * mundo. Código nulo também — o servidor recusou sem dizer o quê, e isso não é "já existe".
 *
 * Mora aqui e não na tela por duas razões: é este módulo que sabe o que um `SQLSTATE` quer
 * dizer, e regra de tela em módulo puro é regra que a suíte de unidade alcança — a oficina mede
 * a unidade, e a unidade não renderiza tela.
 */
export function todasJaExistem(codigos: readonly (string | null)[]): boolean {
  if (codigos.length === 0) return false;
  return codigos.every((c) => c !== null && c.trim() === CODIGO_JA_EXISTE);
}

/**
 * As duas formas de a fila falhar SEM o servidor ter sido consultado.
 *
 * Elas não têm código do Postgres porque não houve Postgres nenhum: a linha sumiu do aparelho
 * (um Reset, uma faxina) ou a tabela não tem travessia (defeito de programação). O transporte
 * as conhece — ele monta a linha antes de falar com a rede — e até 13 de setembro as engolia
 * num `catch { break; }` mudo.
 */
export type ClasseLocal = 'linhaSumiu' | 'tabelaDesconhecida';

/**
 * Esta recusa é definitiva? — e agora a pergunta tem DOIS lados.
 *
 * **O que acontecia.** `classeDaRecusa` decide pelo código do servidor, e o padrão dela é
 * `passageira` — certo, e a assimetria de custo acima explica por quê. Só que a falha LOCAL
 * chegava ao motor sem código nenhum, então caía nesse padrão: tentar de novo. E retentativa
 * não conserta linha que não existe nem tabela que ninguém ensinou a atravessar. A fila ficava
 * presa naquela entrada com espera exponencial, para sempre, e tudo o que o aparelho gravasse
 * depois ficava preso atrás — exatamente o defeito que este arquivo nasceu para consertar,
 * entrando pela porta que ele não olhava.
 *
 * **Por que definitiva é a resposta certa aqui, e não perda de dado.** A assimetria de cima
 * diz que promover passageira a permanente perde dado em silêncio. Isto não é o caso: a linha
 * posta de lado NÃO é apagada — ela fica no aparelho com o motivo ao lado e a tela a mostra.
 * O que se perde é a retentativa automática, que não tinha como funcionar. E o que se ganha é
 * a fila inteira voltar a andar em vez de a fábrica parar de sincronizar por uma linha.
 */
export function ehDefinitiva(recusada: {
  codigo: string | null;
  local?: ClasseLocal;
}): boolean {
  if (recusada.local) return true;
  return classeDaRecusa(recusada.codigo) === 'permanente';
}
