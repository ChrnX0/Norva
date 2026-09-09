/**
 * The movement ledger - the foundation everything else sits on.
 *
 * There is no `current_stock` column anywhere in this system. Stock is the sum
 * of an append-only list of movements. That single decision buys, for free:
 *
 *   - history and audit (the log IS the database)
 *   - correction by reversal instead of deletion, so nothing is ever falsified
 *   - reports that cannot disagree with the history, because they come from it
 *   - offline sync without conflicts: appends are commutative, and the id is
 *     generated on the device, so replaying a queue twice is harmless
 *   - the ability to answer "what was inside the freezer at 03:12?" - which is
 *     how a temperature excursion lists the exposed lots with nobody having
 *     written anything down
 */

import type { Rate } from './money';
import type { Capability } from './access';

export type MovementKind =
  | 'purchase' // arrived from a supplier against an invoice
  | 'production' // finished goods created
  | 'consumption' // inputs drawn by a production run
  | 'transfer' // moved between locations (own store: not revenue)
  | 'sale' // sold to a customer (revenue + margin)
  | 'loss' // melted, broken, expired, courtesy, internal use
  | 'return' // came back from a route or a store
  | 'adjustment' // physical count correction
  | 'discrepancy' // difference found at a control post
  | 'reversal'; // cancels an earlier movement, never deletes it

/**
 * Why a loss happened. Required - an easy, blame-free button for this is what
 * keeps legitimate losses from silently becoming "unexplained shrinkage".
 */
/**
 * Why something was thrown away.
 *
 * The values are the server's enum, spelled exactly as `loss_reason` in
 * `supabase/migrations/0001_foundation.sql` - `internal_use`, not
 * `internalUse`. The device wrote camelCase here for months; SQLite would have
 * taken it (the column is TEXT), the outbox would have queued it, and Postgres
 * would have refused the row with nobody watching. It cost nothing to fix
 * because no loss has ever been recorded - which is the only window where a
 * ledger's vocabulary is free to change.
 */
export type LossReason = 'melted' | 'broken' | 'expired' | 'courtesy' | 'internal_use';

/**
 * Por que a carga voltou — e por que isto NÃO é `LossReason`.
 *
 * Uma devolução não é uma perda: a mercadoria volta e entra no saldo de novo. E
 * a razão responde outra pergunta. A da perda é *"o que aconteceu com isto"*; a
 * da devolução é *"o que isto diz sobre aquela loja"* — que é exatamente a
 * pergunta que o Espelho da Loja existe para responder, e a única que faz a
 * devolução merecer tipo próprio no razão.
 *
 * Sem a razão, `recordReturn` grava aritmética sem notícia: mil gramas voltaram,
 * e "a loja não vendeu" fica idêntico a "a carga chegou derretida". A primeira
 * manda produzir menos para aquela loja; a segunda manda olhar o caminhão. Um
 * relatório que não distingue as duas dá o conselho errado com convicção.
 *
 * O vocabulário sai do docblock do `moveBetween`, que já o tinha escrito em
 * prosa antes de existir coluna: *"não vendeu, veio errado, chegou mole"*.
 *
 * Grafado como o enum do servidor (`return_reason` em
 * `supabase/migrations/0034_why_it_came_back.sql`), e pelo mesmo motivo que o
 * `LossReason`: o SQLite aceitaria camelCase, a fila enfileiraria, e o Postgres
 * recusaria a linha sem ninguém olhando.
 */
export type ReturnReason = 'unsold' | 'wrong_item' | 'melted' | 'expired';

/** Na ordem em que a tela oferece: a mais comum primeiro. */
export const RETURN_REASONS: readonly ReturnReason[] = [
  'unsold',
  'melted',
  'expired',
  'wrong_item',
];

/**
 * Where a movement was recorded in the chain of custody. Comparing two posts
 * localizes a loss - picking error, route loss, or receiving error - without
 * accusing anyone.
 */
export type ControlPost = 'picked' | 'loaded' | 'delivered' | 'checked';

/**
 * As salas da própria fábrica — os lugares de onde a carga SAI.
 *
 * O predicado estava escrito três vezes: em `app/places.tsx` (o tom e o ícone da
 * linha), em `app/orders/new.tsx` (quem pode ser destino de um pedido) e, a
 * partir da conta de quanto dá para prometer, também em SQL. Três grafias de uma
 * regra é a forma que produz divergência — e esta em particular decide se um
 * pedido pode ser aceito, então divergir aqui é prometer o que não existe.
 *
 * `vehicle` não está em nenhum dos dois lados de propósito: caminhão é caminho,
 * não é sala nem destino. Mercadoria em cima dele não está para carregar nem
 * chegou a ninguém.
 */
export const INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room'] as const;

/**
 * A espécie de lugar que é uma UNIDADE de fábrica — e a única régua para isso.
 *
 * Existe porque a pergunta *"quais são as fábricas"* tinha uma resposta errada
 * espalhada por quinze pontos: comparar o id do lugar com o id da empresa. Isso
 * acerta enquanto a fábrica tem uma unidade só e erra na segunda — a primeira
 * guarda o id da empresa para sempre (é o carimbo de todo movimento já gravado,
 * e o razão não se recarimba) e as seguintes nascem com uuid próprio. Um id não
 * diz o que a coisa é; a espécie diz.
 *
 * Uma espécie só, e a lista existe mesmo assim: `INTERNAL_PLACE_KINDS` também
 * nasceu de um predicado escrito três vezes, e o que ele custou foi divergência.
 */
export const UNIT_PLACE_KIND = 'factory';

/** Este lugar é uma unidade de fábrica? Pergunta-se à espécie, nunca ao id. */
export function ehUnidade(kind: string): boolean {
  return kind === UNIT_PLACE_KIND;
}

/**
 * As espécies que ficam DENTRO de uma unidade — e as que não ficam.
 *
 * Câmara fria e almoxarifado são partes de um prédio. Loja própria e cliente não:
 * ficam no mundo, e pôr uma delas dentro de uma unidade a tiraria do lugar certo
 * em toda consulta de carga. `vehicle` idem — caminhão é caminho.
 *
 * A régua existe porque a pergunta aparece em dois lugares que não se olham: o
 * `savePlace`, que decide se grava o pai, e o backfill das migrações 0046/V25,
 * que decidiu quais salas já existentes ganhavam um. Duas grafias de uma regra é
 * a forma que produz divergência, e aqui a divergência é saldo.
 */
export const UNIT_ROOM_KINDS = ['cold_room', 'store_room'] as const;

/** Esta espécie fica dentro de uma unidade? */
export function ehSalaDeUnidade(kind: string): boolean {
  return (UNIT_ROOM_KINDS as readonly string[]).includes(kind);
}

/**
 * Quem RECEBE carga: loja própria e cliente. O resto é sala interna ou caminho.
 *
 * Lista antes de predicado porque o SQL não importa função: o Espelho da Loja
 * pergunta *"quanto esta loja devolve do que recebe"*, e para isso precisa
 * FILTRAR por essas espécies dentro de uma consulta. Com a régua só no `if`, o
 * SQL escreveria a quarta grafia da mesma regra — que é exatamente o defeito que
 * `INTERNAL_PLACE_KINDS` existe para não repetir, do outro lado.
 */
export const CARGO_PLACE_KINDS = ['own_store', 'customer'] as const;

/** Quem RECEBE carga: loja própria e cliente. O resto é sala interna ou caminho. */
/**
 * A ordem em que o estoque de um lugar se oferece para carregar.
 *
 * **Existe por uma tela que estava certa e não era inteligente.** A transferência
 * listava os sete itens da fábrica em ordem alfabética e já vinha com o primeiro
 * escolhido — *Açúcar cristal* — com o destino sendo uma LOJA. Ninguém manda
 * quarenta quilos de açúcar e vinte e dois de polpa para uma loja; manda picolé.
 * Nenhum número estava errado e a Lei estava: *"nunca peça o que o sistema pode
 * deduzir"*, e *"qual é a próxima ação provável"*.
 *
 * A dedução é do DESTINO e não uma preferência: um lugar que recebe carga vende
 * ao cliente final, e o que se vende é produto acabado. Já uma câmara fria ou um
 * segundo almoxarifado recebem qualquer coisa — lá a ordem alfabética é a certa,
 * porque não há palpite honesto a fazer.
 *
 * Estável de propósito: dentro de cada grupo a ordem que veio é preservada, e ela
 * já é a ordem por nome. Reordenar por outro critério aqui faria a lista dançar
 * entre destinos, e lista que dança é lista que ninguém decora.
 */
/**
 * O último dia em que ainda dá para produzir — a data da DECISÃO, não a do problema.
 *
 * A Lei 4 desta casa manda avisar no dia em que dá para agir, e o `CLAUDE.md`
 * escolhe a frase como exemplo do tom: *"Produza até segunda", não "Estoque
 * insuficiente"*. As duas dizem o mesmo fato; só a primeira é acionável.
 *
 * A conta é a mais simples que é honesta: o saldo dura `daysLeft` dias, então ele
 * acaba no dia `hoje + daysLeft`, e produzir naquele dia ainda salva. Depois dele,
 * não. Trunca em vez de arredondar — meio dia de cobertura não é um dia, e um
 * aviso que chega um dia atrasado é o aviso na data do problema, que é exatamente
 * o que a Lei proíbe.
 *
 * **Zero e negativo devolvem hoje.** Já acabou ou acaba hoje; o aviso não vira
 * ontem, porque não existe agir no passado — e uma data no passado numa tela é a
 * coisa que faz alguém parar de acreditar no aviso inteiro.
 */
export function diasAteProduzir(daysLeft: number): number {
  return Math.max(0, Math.floor(daysLeft));
}

export function ordemDeCarga<T extends { kind: string }>(
  linhas: readonly T[],
  destinoRecebeCarga: boolean,
): T[] {
  if (!destinoRecebeCarga) return [...linhas];
  const produtos = linhas.filter((l) => l.kind === 'product');
  return [...produtos, ...linhas.filter((l) => l.kind !== 'product')];
}

export function receivesCargo(kind: string): boolean {
  return (CARGO_PLACE_KINDS as readonly string[]).includes(kind);
}

/**
 * Onde o consumidor final compra — e é isto que separa *"mudou de sala"* de
 * *"vendeu"*.
 *
 * **A falta que esta régua fecha.** `movement_kind` tem `sale` desde a `0001`, com a
 * intenção escrita ao lado (*"sold to a customer (revenue + margin)"*), e passou
 * quarenta e seis migrações **sem um único escritor**. Sem o fato da venda o razão
 * tem o custo congelado e o preço combinado, e não tem o que fica entre os dois: a
 * margem não existe, e o Espelho da Loja não tem contra o que calibrar.
 *
 * **Só `own_store`, e a ausência de `customer` é a decisão, não o esquecimento.** A
 * loja própria é o balcão: a carga chega por transferência (o `moveBetween` diz por
 * escrito que *"loja própria é transferência e não venda"*, e está certo — o picolé
 * continua sendo nosso), e quem compra é o consumidor, que não é um lugar no razão.
 * Então a venda ali é o que SAIU da prateleira, e é a contagem que a descobre. Na
 * loja de um cliente a venda já aconteceu na entrega: o dono do lugar é outro, a
 * prateleira não é nossa, e ninguém da fábrica vai contá-la. As duas são vendas e
 * são descobertas por caminhos diferentes; misturá-las numa lista faria a contagem
 * ir procurar a prateleira do Mercado do Zé.
 *
 * Lista antes de predicado pela mesma razão que `CARGO_PLACE_KINDS`: o SQL não
 * importa função, e a pergunta *"quanto esta loja vendeu"* precisa filtrar espécie
 * dentro de uma consulta.
 */
export const RETAIL_PLACE_KINDS = ['own_store'] as const;

/**
 * As espécies de movimento que provam que alguém ANDOU até a prateleira.
 *
 * `adjustment` sempre foi essa prova. `sale` entrou em 8 de setembro porque numa loja
 * própria a contagem VIRA uma venda: a falta encontrada foi comprada por alguém, e o
 * razão guarda o fato, não o gesto.
 *
 * **A régua existe porque o mesmo `if` já estava em dois lugares que não se olham** — a
 * ficha do insumo e o assistente —, e eu consertei um e não o outro. A ficha passou a
 * dizer *"conferido em"* certo enquanto o assistente respondia *"ninguém conferiu
 * ainda"* para a mesma prateleira contada no mesmo dia: duas verdades sobre um fato,
 * que é o defeito que este repositório já pagou em saldo e em custo.
 *
 * **E a fronteira, dita em vez de subentendida:** isto vale porque hoje toda venda nasce
 * de uma contagem. Uma venda de ponto de venda não prova que alguém andou até lá, e o
 * item do PDV em `docs/roadmap.md` carrega a obrigação de trazer um marcador de origem
 * no movimento. Sem ele, o *"conferido em"* de toda loja passa a mentir para cima —
 * dizendo que se conferiu hoje o que ninguém olha há um mês, que é pior que não dizer
 * nada, porque desliga a única pergunta que manda alguém contar.
 */
export const COUNT_KINDS = ['adjustment', 'sale'] as const;

/**
 * Qual capacidade o SERVIDOR exige para escrever cada espécie de movimento.
 *
 * **Esta tabela existe porque o aparelho não sabia, e não saber trava a fila para
 * sempre.** O SQLite não tem política, não tem papel e não tem capacidade: ele aceita
 * qualquer linha. O servidor tem `movements_append`, e ela recusa. E `drain` **para na
 * primeira linha recusada** — parar é deliberado e está certo para uma lacuna de
 * dependência (filho antes do pai, que a próxima tentativa resolve), e é fatal para uma
 * recusa por PERMISSÃO, que nenhuma tentativa resolve: a linha fica pendente, e tudo o
 * que a fábrica gravar depois fica preso atrás dela.
 *
 * O caso concreto, medido em 9 de setembro: `storeManager` e `driver` não têm
 * `adjust_stock`, e o botão de desfazer do extrato **não tem portão nenhum**. Um toque
 * do entregador e aquele celular nunca mais sincroniza — sem erro na tela, porque no
 * aparelho a linha entrou.
 *
 * **A tabela é derivada, não copiada.** `src/layers.test.ts` lê o `case kind` da
 * migração que define a política e compara com esta lista: duas fontes, e a que manda
 * não passou pela minha mão. Guarda que compara duas coisas escritas pela mesma mão não
 * guarda nada — regra desta casa, paga três vezes.
 *
 * A venda tem DUAS: despachar para um cliente, e contar a prateleira de uma loja
 * própria. É a `0047`, e a razão está escrita lá.
 */
export const QUEM_ESCREVE: Record<MovementKind, readonly Capability[]> = {
  purchase: ['check_receipt'],
  production: ['record_production'],
  consumption: ['record_production'],
  transfer: ['dispatch'],
  sale: ['dispatch', 'adjust_stock'],
  loss: ['record_loss'],
  return: ['check_receipt'],
  discrepancy: ['check_receipt'],
  adjustment: ['adjust_stock'],
  reversal: ['adjust_stock'],
};

/**
 * Este conjunto de capacidades alcança escrever esta espécie?
 *
 * QUALQUER uma das listadas basta — é `or` na política do servidor, e trocar por `and`
 * recusaria a venda de quem conta, que é o caso que a `0047` abriu de propósito.
 */
export function podeEscrever(kind: MovementKind, tem: ReadonlySet<string>): boolean {
  return QUEM_ESCREVE[kind].some((c) => tem.has(c));
}

/** Esta linha do razão prova que alguém conferiu a prateleira? */
export function ehConferencia(kind: string): boolean {
  return (COUNT_KINDS as readonly string[]).includes(kind);
}

/**
 * As espécies cujo dinheiro é o PREÇO DE VENDA, não o custo congelado.
 *
 * Toda linha do razão carrega os dois — `unit_cost_rate` e `unit_price_rate` — e é
 * essa dupla que faz a margem ser uma subtração dentro da linha em vez de uma junção
 * com uma tabela que pode ser renegociada amanhã. Mas quando alguém pergunta *"quanto
 * valeu este ato"*, cada espécie responde por uma régua só, e a venda responde pelo
 * preço.
 *
 * O extrato valorizava tudo pelo custo: a confirmação prometia R$ 748,00 e a lista
 * mostrava o que aquilo custou para FAZER, debaixo do rótulo "Venda". Dois números
 * para o mesmo ato, com a palavra de um sobre o número do outro.
 *
 * Mora aqui e não no repositório pelo mesmo motivo de `ehConferencia`: no dia em que
 * o ponto de venda chegar, a resposta muda — e tem de mudar em todos os leitores no
 * mesmo commit, não no que alguém lembrar.
 */
export const PRICED_KINDS = ['sale'] as const;

export function valePeloPreco(kind: string): boolean {
  return (PRICED_KINDS as readonly string[]).includes(kind);
}

/**
 * Nesta espécie de lugar, o que sai da prateleira foi VENDIDO?
 *
 * O nome diz o que a resposta DECIDE, não qual tela pergunta — regra desta casa
 * paga em `ehPapel`, que compilava e devolvia o mesmo defeito na pele seguinte.
 */
export function vendeAoConsumidor(kind: string): boolean {
  return (RETAIL_PLACE_KINDS as readonly string[]).includes(kind);
}

export type Movement = {
  /** Client-generated UUID: makes the append idempotent across retries. */
  id: string;
  /** Tenant stamp. Present on every row, enforced by RLS on the server. */
  companyId: string;

  kind: MovementKind;
  /** Occurred-at, not recorded-at. Offline entries keep their real time. */
  occurredAt: string;
  recordedAt: string;
  recordedBy: string;

  itemId: string;
  /** Always the smallest unit. Signed: negative leaves, positive arrives. */
  quantityBaseUnits: number;

  locationId: string;
  counterpartLocationId?: string;

  lotId?: string;
  post?: ControlPost;
  lossReason?: LossReason;

  /**
   * Cost frozen at the instant this movement happened. A sugar price change in
   * March must not rewrite January's margin.
   *
   * A `Rate`, not `Cents`, and the distinction is the headline rule of this
   * project rather than a detail. Pulp at R$ 12,40/kg is 1,24 cents per gram;
   * as an integer that is 1, and a fifth of the cost is gone before the first
   * multiplication. The migration that fixed this on the server said so in
   * writing - `0008_ledger_speaks_phase_one.sql` dropped `unit_cost_cents` and
   * added `unit_cost_rate double precision`, and the device followed with
   * `unit_cost_rate REAL`.
   *
   * This type did not follow, and nothing noticed for one reason: no line of
   * production code imports this module. The type that defines what a movement
   * IS was describing a schema neither database has had for days.
   */
  unitCostRate?: Rate;

  /** Set when this movement cancels another one. */
  reversesMovementId?: string;

  /**
   * Present when the movement was drafted by the assistant. Stores the phrase
   * the person actually typed, so "what did the assistant post this month?" is
   * always answerable. Autonomy without a trail is what breaks trust in data.
   */
  assistantPhrase?: string;

  note?: string;
};

/**
 * Por que este módulo não soma saldo — e onde a soma mora de verdade.
 *
 * Ele exportava quatro dobras sobre `Movement[]`: `balanceOf`, `balanceAt`,
 * `lotsPresentDuring` e `buildReversal`. Nenhuma tinha chamador, e a razão não é
 * esquecimento: **o aplicativo nunca tem os movimentos em memória.** Ele tem
 * SQLite, e cada uma dessas perguntas já é respondida em SQL, onde os dados
 * estão — `stockByPlace`, `balanceByLocation` e `lotsInStock` somam
 * `quantity_base_units`, e `reverseGroup` escreve o estorno negando a quantidade
 * na própria instrução. Carregar anos de movimento num celular para dobrar em
 * memória seria a forma errada mesmo se alguém quisesse.
 *
 * `buildReversal` era o caso mais caro: **dois autores para o que é um estorno**,
 * um em TypeScript que ninguém roda e um em SQL que roda. É a mesma doença que a
 * média derivada já teve aqui, e a mutação da suíte protege o que roda.
 *
 * A resposta anterior a esse mesmo achado foi escrever teste para elas. Os testes
 * eram bons e não tornaram nada alcançável: tornaram a morte mais difícil de ver
 * — e uma mutação curada chegou a prometer que quebrá-las faria "a excursão de
 * temperatura acusar o lote errado", numa tela que não existe.
 *
 * O que fica aqui é o que trabalha: o **vocabulário**, que
 * `src/sync/agreement.test.ts` confere nos dois sentidos contra o esquema do
 * servidor e o do aparelho, e a aritmética pura que não toca dado (`daysOfCover`).
 *
 * A pergunta do docblock lá em cima — "o que estava dentro da câmara às 03:12?" —
 * **passou a ter resposta no commit seguinte a este**, e não pela dobra que morreu:
 * `lotsInRoomAt` é SQL com `occurred_at <= ?`, ao lado das outras somas de saldo, e
 * a tela do lugar lista os lotes que estavam lá no instante DAQUELA leitura quando
 * ela sai da faixa.
 *
 * Este parágrafo dizia "continua sem tela" e mandava ler o `docs/roadmap.md` pelo
 * que faltava — um commit depois de a coisa existir. Fica registrado em vez de
 * apagado, porque é a família que dominou o dia: o texto ao lado do código
 * descrevendo um estado que o código não tem mais. Comentário que aponta para o
 * roadmap é o pior caso dela, porque manda a próxima pessoa construir de novo o
 * que está pronto — que é exatamente o que a regra 1 daquele arquivo proíbe.
 */

/**
 * Days of stock cover - the number that tells someone to produce, which is
 * more actionable than a raw quantity ("Strawberry: 4 days").
 */
export function daysOfCover(baseUnits: number, dailyOutflow: number): number | null {
  if (dailyOutflow <= 0) return null;
  return baseUnits / dailyOutflow;
}

/**
 * O nome de um lugar para MOSTRAR — e a palavra vem de quem chama, não daqui.
 *
 * O lugar padrão nasce sem nome: `ensureLocation` cria uma `location` cujo id é o
 * `company_id` e cuja coluna `name` fica vazia, porque a palavra "Fábrica" é do
 * idioma de quem olha e o banco não fala idioma nenhum.
 *
 * **Existe como função em 7 de setembro porque a regra estava numa tela só.**
 * `app/places.tsx` tinha o `nameOf` com a reserva escrita e certa; a conta do
 * dinheiro parado, na tela de relatórios, mostrou a maior parcela do estoque como
 * um número sem rótulo — R$ 11.616,44 sozinho, que é exatamente o que a Lei 3
 * proíbe. Copiar a reserva para a segunda tela seria a terceira divergência da
 * noite; a peça compartilhada é o conserto.
 */
export function nomeDoLugar(bruto: string | null | undefined, padrao: string): string {
  return (bruto ?? '').trim() || padrao;
}
