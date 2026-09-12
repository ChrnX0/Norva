/**
 * O lote: o pedaço de produção que se rastreia junto.
 *
 * A Fase 2 pede lote e validade, e o servidor já tinha a tabela `lots` com
 * índice em `movements.lot_id` desde a primeira migração — sem nenhum escritor.
 * É a mesma doença do `assistant_phrase`: peça pronta esperando quem a use.
 *
 * Duas decisões que este arquivo carrega, e as duas são de negócio:
 *
 * **Um lote por corrida, não por dia nem por produto.** Se o tacho da manhã
 * derreteu e o da tarde não, o recall é do tacho da manhã. Agrupar o dia
 * inteiro obrigaria a recolher o dobro do que estragou; agrupar por produto,
 * a semana inteira.
 *
 * **A validade sai da produção, não da digitação.** Quem está de luva não sabe
 * de cabeça que picolé dura seis meses — o produto sabe. O aparelho pergunta
 * uma vez, no cadastro, e a partir daí toda corrida nasce com a data pronta.
 * Produto sem prazo cadastrado gera lote SEM validade, e isso é correto: o
 * lote ainda serve para rastrear, e uma data inventada seria pior que nenhuma.
 */

import { diasDeCalendario } from './day';

/**
 * O código que a etiqueta vai carregar.
 *
 * `AAAAMMDD-NN`: a data em que se produziu, e a ordem da corrida naquele dia.
 * Ordena sozinho, cabe num código de barras curto e uma pessoa lê em voz alta
 * pelo telefone sem soletrar — que é como um recall acontece de verdade.
 *
 * A fábrica que já tem padrão próprio vai poder trocar: a tela deixa editar, e
 * o servidor só exige que seja único dentro da empresa. Este é o padrão, não a
 * única forma.
 */
export function lotCode(producedOn: string, sequence: number): string {
  const day = producedOn.replaceAll('-', '');
  return `${day}-${String(sequence).padStart(2, '0')}`;
}

/**
 * Quando este lote vence.
 *
 * Soma dias de calendário sobre a data local de produção, sem passar por fuso
 * nenhum: validade é um dia combinado, como a data de um pedido, e não um
 * instante. `2026-09-02` mais 180 dias é `2027-03-01`, seja onde for que o
 * celular esteja.
 *
 * Nulo quando o produto não tem prazo cadastrado — e a ausência é dado, não
 * falha.
 */
export function expiresOn(producedOn: string, shelfLifeDays: number | null): string | null {
  if (shelfLifeDays === null || !Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0) return null;

  const [y, m, d] = producedOn.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + Math.floor(shelfLifeDays)));
  return at.toISOString().slice(0, 10);
}

/**
 * Quantos dias faltam para o lote vencer, contados em dias de calendário.
 *
 * Negativo quer dizer vencido, e essa é a razão de devolver número em vez de
 * booleano: "venceu ontem" e "vence em três dias" pedem tratamentos diferentes
 * na tela, e quem decide isso é a tela.
 */
/**
 * Duas assinaturas, de propósito: quem já tem a data — a lista do que vence primeiro só
 * traz lote datado — recebe número, e não precisa inventar um `?? 0` para satisfazer o
 * tipo. Zero como substituto de "não sei" seria dizer "vence hoje" de um lote sem prazo.
 */
export function daysUntilExpiry(expires: string, today: string): number;
export function daysUntilExpiry(expires: string | null, today: string): number | null;
export function daysUntilExpiry(expires: string | null, today: string): number | null {
  if (!expires) return null;
  return diasDeCalendario(today, expires);
}
