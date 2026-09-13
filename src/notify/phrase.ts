import { fill, plural, type Dictionary } from '@/i18n';
import type { Alert } from '@/domain/alerts';

/**
 * A frase de um aviso, como função pura.
 *
 * Ela nasceu dentro do componente que agenda, e isso é a cicatriz do
 * `pickSuggestion` se repetindo: regra que mora em componente é regra que o
 * `mutate` não alcança e que nenhum teste importa. Aqui fora, três coisas passam
 * a ser conferíveis — e todas as três já falharam em algum lugar deste projeto:
 *
 *  1. **Nenhum buraco sobra.** `{{subject}}` vazando para a tela de bloqueio é
 *     um defeito que ninguém vê numa suíte, porque notificação não se lê num
 *     teste de navegador.
 *  2. **A unidade acompanha o número.** "12" numa notificação de câmara não diz
 *     nada; "12 °C" diz que alguém deixou a porta aberta.
 *  3. **Os três idiomas respondem.** `Widen<T>` obriga a chave a existir nos
 *     três, e não obriga a frase a estar completa em nenhum.
 */
export function alertPhrase(
  alert: Alert,
  t: Dictionary,
): { title: string; body: string } {
  /**
   * O limite que o valor CRUZOU, e por que ele é um só.
   *
   * O aviso de ambiente só existe porque a leitura saiu da faixa por um dos dois
   * lados — não há faixa em que o valor esteja abaixo do piso e acima do teto ao
   * mesmo tempo. Então a frase diz o limite cruzado em vez dos dois: notificação
   * cabe uma frase, e "está a -8 e o teto é -16" decide; "a faixa é de -22 a -16"
   * manda quem lê fazer a conta na tela de bloqueio.
   *
   * É a Lei 3 no lugar mais barato de cumprir: o número já estava ali sozinho.
   */
  const abaixo =
    alert.kind === 'ambiente' &&
    alert.min !== null &&
    alert.min !== undefined &&
    alert.amount < alert.min;
  const limite = abaixo ? alert.min : alert.max;
  /**
   * **Lote já vencido é outro FATO, não o mesmo com zero dias.**
   *
   * O número saía por `Math.max(0, …)`, então um lote vencido há três dias chegava
   * como *"vence em 0 dias — mande esse primeiro"*: o aplicativo pedindo para
   * despachar picolé vencido para a loja. Um aviso que manda fazer a coisa errada é
   * pior que nenhum aviso, porque ele tem a autoridade do sistema por trás.
   *
   * A ação também é outra: o que se faz com lote vencido é registrar a perda, e o
   * razão tem o caminho para isso.
   */
  const venceu = alert.kind === 'validade' && alert.amount < 0;

  /**
   * O número, na unidade que aquele aviso mede.
   *
   * Cada caso tem a sua, e foi correção do dono: dias para insumo e validade,
   * porcentagem para volume, lojas para pedido, grandeza física para ambiente.
   * Um número solto sem a unidade dele é a mesma coisa que nenhum número.
   */
  const amount =
    alert.kind === 'insumo' || alert.kind === 'validade'
      ? // O módulo, e não o corte em zero: a distância até o dia é a mesma contada
        // para os dois lados, e quem diz o lado é a frase, não o sinal do número.
        plural(Math.max(0, Math.floor(Math.abs(alert.amount))), t.app.home.dayCount)
      : alert.kind === 'ambiente'
        ? // Grandeza física guarda a fração: meio grau de freezer é diferença
          // real, e arredondar aqui repetiria o defeito que a tela de leitura já
          // teve.
          String(Math.round(alert.amount * 10) / 10)
        : String(Math.round(alert.amount));

  const valores = {
    subject: alert.subject,
    amount,
    unit: alert.unit ?? '',
    places: alert.places === undefined ? '' : plural(alert.places, t.app.home.placeCount),
    limit: limite === null || limite === undefined ? '' : decimo(limite),
    code: alert.code ?? '',
  };

  const molde = moldes(alert, t, abaixo, venceu);
  return { title: fill(molde.title, valores), body: fill(molde.body, valores) };
}

/** Uma casa decimal, que é a régua de grandeza física deste módulo. */
function decimo(valor: number): string {
  return String(Math.round(valor * 10) / 10);
}

/**
 * Os MOLDES daquele aviso — texto com buraco, nunca frase pronta.
 *
 * O nome é a metade que importa: o que sai daqui ainda tem `{{amount}}` dentro, e
 * quem preenche é o único chamador, logo acima, nas duas pontas. Uma função que
 * devolvesse frase pronta poderia devolvê-la pela metade; esta não sabe preencher
 * nada, então não tem como entregar um buraco à tela sozinha. O que PROVA isso é o
 * caso de `phrase.test.ts` que varre os cinco tipos, os dois lados da faixa e o
 * lote vencido nos três idiomas procurando `{{` — e não a forma desta função.
 *
 * Dois tipos têm dois pares. Não existe corpo genérico de ambiente: ele seria texto
 * que nenhum caso alcança, porque todo aviso de ambiente cruzou um limite. E
 * validade tem dois porque tem dois FATOS — o que vai vencer, que se despacha
 * primeiro, e o que venceu, que se registra como perda. Chave de dicionário sem
 * caminho até ela é o mesmo defeito que a peça sem chamador.
 *
 * O dicionário é lido por índice (`t.alertText[alert.kind]`) e não por caminho
 * escrito, que é o idioma deste arquivo desde a primeira versão: o tipo do aviso
 * escolhe a seção, e escrever `alertText.validade` aqui seria repetir em prosa o que
 * o `kind` já diz.
 */
function moldes(
  alert: Alert,
  t: Dictionary,
  abaixo: boolean,
  venceu: boolean,
): { title: string; body: string } {
  if (alert.kind === 'ambiente') {
    const w = t.alertText[alert.kind];
    return { title: w.title, body: abaixo ? w.belowMin : w.aboveMax };
  }
  if (alert.kind === 'validade') {
    const w = t.alertText[alert.kind];
    return venceu
      ? { title: w.titleExpired, body: w.expiredBody }
      : { title: w.title, body: w.body };
  }
  const w = t.alertText[alert.kind];
  return { title: w.title, body: w.body };
}
