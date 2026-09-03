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
  const words = t.alertText[alert.kind];

  /**
   * O número, na unidade que aquele aviso mede.
   *
   * Cada caso tem a sua, e foi correção do dono: dias para insumo e validade,
   * porcentagem para volume, lojas para pedido, grandeza física para ambiente.
   * Um número solto sem a unidade dele é a mesma coisa que nenhum número.
   */
  const amount =
    alert.kind === 'insumo' || alert.kind === 'validade'
      ? plural(Math.max(0, Math.floor(alert.amount)), t.app.home.dayCount)
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
  };

  return { title: fill(words.title, valores), body: fill(words.body, valores) };
}
