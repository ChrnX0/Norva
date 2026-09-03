/**
 * O que foi combinado com uma loja, na parte que o sistema consegue usar.
 *
 * Uma fábrica não entrega em qualquer dia: combina "terça e sexta" com uma loja
 * e "sábado" com outra, e depois carrega essa tabela na cabeça. Enquanto ela
 * mora na cabeça de alguém, o pedido nasce com a data errada e a carga sai no
 * dia em que a loja está fechada.
 *
 * Os dias moram num inteiro, um bit por dia da semana, com o bit 0 no domingo -
 * a mesma numeração de `Date.getDay()`, para nunca existir uma segunda
 * convenção competindo com a da plataforma. Zero é "não combinamos dia", que é
 * diferente de "nenhum dia": a loja sem acordo recebe quando dá, e o sistema
 * não inventa um dia para ela.
 */

/** Domingo é o bit 0, como em `Date.getDay()`. */
export const WEEK_BITS = [1, 2, 4, 8, 16, 32, 64] as const;

/** Um dia da semana entra no acordo? */
export function agreedOn(days: number, weekday: number): boolean {
  if (weekday < 0 || weekday > 6) return false;
  return (days & WEEK_BITS[weekday]) !== 0;
}

/** Liga ou desliga um dia, devolvendo o acordo novo. */
export function toggleDay(days: number, weekday: number): number {
  if (weekday < 0 || weekday > 6) return days;
  return days ^ WEEK_BITS[weekday];
}

/**
 * Quantos dias faltam até a próxima entrega combinada.
 *
 * Zero quando hoje é dia de entrega — e isso é de propósito: quem faz o pedido
 * de manhã no dia da loja está pedindo para hoje, e empurrar para a semana que
 * vem seria o sistema corrigindo a pessoa. Nulo quando não há acordo, e aí a
 * tela não oferece o atalho em vez de oferecer um atalho inventado.
 *
 * O limite é sete e não seis porque a semana que fecha é a resposta certa para
 * quem só recebe num dia: pedindo na quinta para uma loja de quinta, o próximo
 * é hoje; pedindo na sexta, é daqui a seis.
 */
export function daysUntilNextDelivery(days: number, todayWeekday: number): number | null {
  if (days === 0) return null;
  for (let ahead = 0; ahead < 7; ahead += 1) {
    if (agreedOn(days, (todayWeekday + ahead) % 7)) return ahead;
  }
  return null;
}
