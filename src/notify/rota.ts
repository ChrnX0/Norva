import type { AlertKind } from '@/domain/alerts';

/**
 * Para onde o toque no aviso leva — e por que isto é um módulo puro.
 *
 * O aviso carregava `{ kind, subjectId }` desde que foi escrito e **ninguém lia**: tocar
 * na notificação abria o aplicativo na capa, como um toque no ícone. O dado estava ali,
 * a pergunta estava respondida, e a última perna faltava — a mesma doença que o P1 do
 * `CLAUDE.md` descreve, com o agravante de que aqui ela é invisível: quem toca não sabe
 * que devia ter ido para algum lugar, só sente que o aplicativo é burro.
 *
 * O caminho é escolhido aqui, fora do adaptador, porque é a única parte deste assunto
 * que uma máquina sem celular consegue medir. E o que chega é dado do SISTEMA
 * OPERACIONAL: pode vir de uma versão anterior do aplicativo, pode vir truncado, pode
 * vir de um aviso que o dono mandou por outro canal. Então nada é assumido — `unknown`
 * na entrada, e `null` quer dizer "abre onde abriria de qualquer jeito", que é a direção
 * segura. Navegar para uma tela errada por causa de um campo estranho seria pior que não
 * navegar.
 */

/** As telas que cada tipo de aviso abre, quando o aviso traz o assunto. */
const DESTINO: Record<AlertKind, (id: string) => string> = {
  // A ficha do item: é ela que tem o saldo, a cobertura e o botão de comprar.
  insumo: (id) => `/inputs/${id}`,
  // Volume é de qualquer item — insumo, embalagem ou produto acabado —, e a ficha
  // atende os três desde que os botões passaram a sair da espécie.
  volume: (id) => `/inputs/${id}`,
  // O lote, com o que ainda existe dele e onde está.
  validade: (id) => `/lots/${id}`,
  // Pedido não abre UM pedido: quem recebeu o aviso vai decidir o dia, e a decisão
  // é sobre a fila inteira. O assunto do aviso é um item entre vários.
  pedido: () => '/orders',
  // O lugar é onde a faixa mora e onde a leitura nova se registra.
  ambiente: () => '/places',
  // Mesma tela, e pela mesma razão: quem recebeu "a câmara parou de medir" vai
  // registrar uma leitura ou olhar o sensor, e as duas coisas moram no lugar.
  semMedida: () => '/places',
};

export function rotaDoAviso(dado: unknown): string | null {
  if (dado === null || typeof dado !== 'object') return null;
  const { kind, subjectId, venceu } = dado as Record<string, unknown>;
  if (typeof kind !== 'string' || !(kind in DESTINO)) return null;

  /**
   * Lote VENCIDO abre a tela de perda, e não a do lote.
   *
   * É a mesma distinção da frase: o que vai vencer se despacha primeiro, o que venceu
   * se registra como perda. Mandar quem tocou para a ficha do lote seria mostrar o
   * saldo de um lote que não pode sair — e o próximo toque dele seria procurar onde
   * se dá baixa.
   */
  if (kind === 'validade' && venceu === true) return '/losses';

  const semAssunto = typeof subjectId !== 'string' || subjectId.length === 0;
  // Sem assunto não há ficha para abrir, e montar `/inputs/` sem id abriria uma rota
  // que não existe. Os dois destinos de LISTA não usam o id e continuam certos.
  if (semAssunto && PRECISA_DE_ID.has(kind as AlertKind)) return null;

  return DESTINO[kind as AlertKind](semAssunto ? '' : (subjectId as string));
}

/** Os tipos cujo destino é a ficha de um assunto, e não uma lista. */
const PRECISA_DE_ID = new Set<AlertKind>(['insumo', 'volume', 'validade']);
