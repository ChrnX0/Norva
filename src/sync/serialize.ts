import type { OutboxEntry } from '@/data/outbox';
import { isEraseArea } from '@/data/erase';

/**
 * The one place a device row becomes something the server accepts.
 *
 * This file exists because for a long time nothing did. The outbox queued
 * `{table, rowId}` and the send engine handed entries to an abstract transport,
 * so the step where SQLite's shapes meet Postgres's had no code in it at all -
 * which is exactly why six mismatches sat there unseen. There was nothing to be
 * wrong.
 *
 * Three kinds of difference have to be crossed here, and each one silently
 * corrupts or refuses a write if it is missed:
 *
 *   TYPE.  SQLite has no boolean. `active` is 0 or 1 on the phone and `true` or
 *          `false` on the server, and Postgres does not quietly cast one to the
 *          other - the insert fails outright.
 *
 *   SHAPE. Some columns exist on one side only. `purchase_lines.created_at` is
 *          the device's own bookkeeping and the server does not want it; a
 *          column sent that does not exist is an error, not an ignored field.
 *
 *   IDENTITY. `movements.recorded_by` and `purchases.created_by` are NOT NULL
 *          and reference a real user. The device has no user - it is one
 *          person's phone, working offline, and who they are is known only at
 *          the moment of sending. So the actor is stamped here, on the way out,
 *          rather than stored on every row from the start.
 *
 * Everything is explicit. There is no "send whatever columns the row has",
 * because that is how a device column added next month reaches the server as a
 * silent failure instead of a compile error.
 */

/** Who is sending. Known at sync time, never at write time. */
export type SyncActor = {
  /** The authenticated user's id, for the columns the server requires. */
  userId: string;
  /**
   * Qual empresa este aparelho é, AGORA — não a que estava carimbada quando a
   * linha entrou na fila.
   *
   * O pedido de Reset era a única entrada que carregava o `company_id` congelado
   * dentro do próprio corpo, e por isso era a única que a adoção de empresa não
   * alcançava: o aparelho trocava de empresa, o pedido continuava dizendo a
   * empresa-semente, e o servidor — que nunca ouviu falar dela — recusava a linha
   * por chave estrangeira. Recusa por chave estrangeira é permanente, então a fila
   * daquele celular parava na PRIMEIRA sincronização, para sempre, calada.
   *
   * A empresa é conhecida na hora de enviar, exatamente como o `recorded_by`. Vinda
   * daqui, nenhum id de empresa volta a viajar congelado num payload.
   */
  companyId: string;
};

export type ServerWrite =
  | { kind: 'upsert'; table: ServerTable; row: Record<string, unknown> }
  /**
   * Not a row: a command saying an area was cleared on the device.
   *
   * **Ele continua existindo, e agora tem para onde ir.** Até 7 de setembro o
   * servidor não tinha nada que o recebesse; a `0045` criou `erase_requests`, e é
   * ela que o `upsert` abaixo escreve. Este ramo fica porque quem consome a fila
   * ainda pode querer saber que a linha É um apagamento — e porque apagar a forma
   * antes de existir transporte seria trocar uma fronteira registrada por uma
   * suposição.
   */
  | { kind: 'erase'; area: string }
  /**
   * Deliberately not sent.
   *
   * `item_costs` is a derived value, and derived values get exactly one owner.
   * The device computes an average locally because it must show a cost with no
   * signal; the server computes its own from the purchase lines, by the same
   * rule, in a trigger. Sending the device's copy gives the number two authors,
   * and the replay proved what that costs: the queue carries row *ids*, so it
   * resends whatever the row says now, and the server's trigger then blended a
   * new invoice against an average that only existed after it - arriving at
   * 0.5605 where the device said 0.5310.
   *
   * So the local average stays local. What travels is the invoice; the average
   * is what both sides conclude from it, and check 6 makes them agree.
   */
  | { kind: 'derived'; table: string };

export type ServerTable =
  | 'erase_requests'
  | 'carriers'
  | 'locations'
  | 'profiles'
  | 'people'
  | 'readings'
  | 'items'
  | 'recipes'
  | 'recipe_versions'
  | 'recipe_lines'
  | 'product_lines'
  | 'product_categories'
  | 'product_types'
  | 'flavors'
  | 'products'
  | 'lots'
  | 'purchases'
  | 'purchase_lines'
  | 'orders'
  | 'order_lines'
  | 'location_prices'
  | 'sale_price_history'
  | 'check_candidates'
  | 'movements';

export class UnknownTableError extends Error {
  constructor(public readonly table: string) {
    super(`Nothing knows how to send rows of "${table}"`);
    this.name = 'UnknownTableError';
  }
}

/**
 * A linha que a fila nomeia e o aparelho não tem mais.
 *
 * Era um `Error` genérico, e a diferença custava caro: quem apanha a exceção não tinha como
 * separar *"esta tabela não sabe atravessar"* (defeito de programação) de *"a linha sumiu do
 * aparelho"* (um Reset, uma faxina), e as duas eram relatadas ao motor da fila como se o
 * SERVIDOR tivesse recusado. Erro nomeado é a única forma de classificar sem casar texto — e
 * casar texto de mensagem é o que `motivoDe` já paga em `src/sync/conta.ts`.
 */
export class LinhaSumiuError extends Error {
  constructor(
    public readonly table: string,
    public readonly rowId: string,
  ) {
    super(`Queued ${table} ${rowId} but the row is gone from the device`);
    this.name = 'LinhaSumiuError';
  }
}

/** Uma área que a fila carrega e o produto não tem. Ver o ramo do `erase`. */
export class UnknownAreaError extends Error {
  constructor(public readonly area: string) {
    super(`"${area}" is not an area this app can erase`);
    this.name = 'UnknownAreaError';
  }
}

/** SQLite's 0/1 as the server's boolean. Anything missing counts as true. */
function flag(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return value === 1 || value === '1' || value === true;
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * The packaging hierarchy as a structure, not as text.
 *
 * SQLite has no JSON column, so the device stores this as a string; the server
 * column is `jsonb`. Sent as it is stored, Postgres accepts it happily and
 * keeps a quoted *string* where an array belongs - the write succeeds, nothing
 * complains, and the packaging is unusable on the other side. The failures that
 * still look like successes are the ones worth writing a function for.
 */
function structure(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * How each table crosses. `take` lists the columns that travel unchanged;
 * `build` adds everything that is converted, renamed or stamped.
 *
 * A table absent from here cannot be sent, and that is deliberate: a new device
 * table is a decision about what the server should receive, not something to
 * infer at runtime.
 */
export const CROSSINGS_FOR_TESTS_ONLY = () => CROSSINGS;

const CROSSINGS: Record<
  ServerTable,
  {
    take: readonly string[];
    build?: (row: Record<string, unknown>, actor: SyncActor) => Record<string, unknown>;
  }
> = {
  readings: {
    // `device_id` nulo é a leitura digitada, e atravessa como nulo mesmo: no
    // servidor a coluna aceita nulo de propósito, porque pessoa não é aparelho.
    take: [
      'id',
      'company_id',
      'location_id',
      'device_id',
      'kind',
      'value',
      'unit',
      'taken_at',
      'recorded_at',
      'source',
    ],
    build: (_row, actor) => ({ recorded_by: actor.userId }),
  },

  /**
   * O perfil, com a lista de permissões virando array de verdade.
   *
   * No aparelho `capabilities` é texto separado por vírgula — legível num
   * suporte, e o SQLite não tem array. No servidor é `capability[]`, um enum, e
   * mandar a string crua faria o Postgres guardar uma palavra só chamada
   * "dispatch,check_receipt" e recusar a fila inteira.
   *
   * Vazio vira array vazio e não `['']`: um perfil sem permissão nenhuma existe
   * (é o ponto de partida de quem monta o dele), e uma permissão chamada "" não.
   */
  profiles: {
    take: ['id', 'company_id', 'name', 'template_role', 'created_at'],
    build: (row) => ({
      capabilities: String(row.capabilities ?? '')
        .split(',')
        .filter(Boolean),
    }),
  },

  /**
   * A pessoa. Nada a converter: ela é nome, perfil e se ainda trabalha aqui.
   *
   * `active` é inteiro no aparelho e booleano no servidor, e o Postgres aceita
   * 0/1 em coluna `boolean` — é a mesma travessia que as outras bandeiras deste
   * arquivo já fazem.
   */
  people: {
    // O PIN atravessa porque a grade tem que funcionar no segundo aparelho: uma
    // fábrica com dois celulares na câmara não pode ter metade da equipe sem
    // conseguir se identificar num deles. Ele é atribuição e não senha — o
    // raciocínio inteiro está na `0036` e em `docs/estudo-entrada.md`.
    take: ['id', 'company_id', 'name', 'profile_id', 'active', 'created_at', 'pin'],
  },

  erase_requests: {
    // O pedido de Reset. `company_id` entra como em toda linha; `effective_at` e
    // `done_at` são do servidor e por isso NÃO estão aqui — mandar o prazo daqui
    // seria deixar o aparelho decidir quando o livro dele morre.
    take: ['id', 'company_id', 'area', 'requested_by'],
  },

  carriers: {
    // A transportadora atravessa inteira porque ela é cadastro: nome e telefone
    // que só existem num aparelho somem com o aparelho, e o telefone dela é o
    // número que alguém liga quando a carga não chegou.
    take: ['id', 'company_id', 'name', 'phone', 'note', 'active', 'created_at'],
  },

  locations: {
    // A ficha de acordo atravessa junto: um telefone que fica só no aparelho
    // some quando o aparelho some, e é o número que alguém liga para avisar
    // que a carga atrasou.
    take: [
      'id',
      'company_id',
      'name',
      'kind',
      'created_at',
      'contact_phone',
      'delivery_days',
      'agreement_note',
      // A unidade em que a sala fica. Atravessa porque é ela que decide de qual
      // saldo a sala faz parte — uma câmara fria sem pai no servidor volta a ser
      // "da empresa" na primeira restauração, e o pedido passa a ser prometido
      // contra o freezer da outra cidade. Ver a migração 0046.
      'parent_location_id',
      // E quem ATENDE, que é outra relação: a sala fica DENTRO da unidade, a loja é
      // atendida por ela. Sem esta linha a resposta ficaria só no aparelho, e na
      // primeira restauração as duas unidades voltariam a ler o mesmo pedido — o
      // defeito da 0050 de volta, silencioso, num banco que já tinha a coluna.
      'served_by_location_id',
    ],
    // A faixa dos sensores é `jsonb` do outro lado e texto aqui, como a lista de
    // embalagem: mandada crua, o Postgres guarda uma string entre aspas onde
    // deveria haver objeto e a restrição do lugar recusa a fila inteira.
    build: (row) => ({ sensor_ranges: structure(row.sensor_ranges) }),
  },

  items: {
    take: [
      'id',
      'company_id',
      'kind',
      'name',
      'purchase_unit',
      'purchase_to_base',
      'base_unit',
      'created_at',
      'full_level',
      // Por quanto isto SAI, quando sai. Nulo é "não vendemos isto", e o nulo é o
      // que define o vendável — não a tabela em que a coluna mora.
      'sale_price_rate',
    ],
    build: (row) => ({ active: flag(row.active), packaging: structure(row.packaging) }),
  },

  /**
   * O acordo comercial e a história dele.
   *
   * A linha corrente é sobrescrita a cada renegociação — `upsert` por id, como
   * qualquer cadastro. A HISTÓRIA não: ela é append-only dos dois lados, e a
   * política do servidor só tem `for insert` de propósito. O que corrige uma linha
   * errada é outra linha, nunca a borracha, e é a mesma forma de `movements`.
   */
  location_prices: {
    take: ['id', 'company_id', 'location_id', 'item_id', 'price_rate', 'created_at'],
  },

  sale_price_history: {
    take: [
      'id',
      'company_id',
      'item_id',
      // Nulo é a mudança do preço de TABELA, e não uma linha incompleta.
      'location_id',
      'previous_rate',
      'new_rate',
      'observed_at',
    ],
    /**
     * A conta que combinou o preço, imposta pelo servidor como em `movements`.
     *
     * E aqui não há a segunda pergunta que o razão tem: quem estava com o aparelho
     * não pertence a um acordo comercial. Preço se combina no escritório, não na
     * doca — por isso não existe `operator_id` nesta travessia.
     */
    build: (_row, actor) => ({ recorded_by: actor.userId }),
  },

  recipes: {
    take: ['id', 'company_id', 'name', 'yield_amount', 'yield_unit', 'created_at'],
    build: (row) => ({ active: flag(row.active) }),
  },

  recipe_versions: {
    take: [
      'id',
      'company_id',
      'recipe_id',
      'version',
      'effective_from',
      'loss_fraction',
      // Os rendimentos da VERSÃO (0052 / V28). Eles atravessam porque a pergunta que
      // respondem — "quanto esta ficha rendia quando foi usada?" — é do servidor tanto
      // quanto do aparelho: o lote carimba a versão, e o lote sobe.
      'yield_amount',
      'yield_unit',
      'yield_per_unit',
      'note',
      'created_at',
    ],
  },

  recipe_lines: {
    // `position` only became a server column once this file existed to notice
    // it was missing: without it a synced recipe comes back with its
    // ingredients in an order nobody chose.
    take: [
      'id',
      'company_id',
      'recipe_version_id',
      'item_id',
      'sub_recipe_id',
      /**
       * QUAL versão da sub-receita esta linha compôs — e a ORDEM de implantação é o que importa
       * aqui, não a coluna.
       *
       * A `0066` do servidor tem de estar aplicada antes de um APK com este nome na lista mandar
       * a coluna: contra um servidor sem ela o PostgREST responde `PGRST204` ("column not
       * found"), que não é `SQLSTATE` de recusa permanente. `classeDaRecusa` o trata como
       * PASSAGEIRO — com razão, e é essa razão que faz o estrago: a fila retenta para sempre e
       * tudo o que a fábrica gravar depois fica preso atrás daquela linha.
       */
      'sub_recipe_version_id',
      'quantity',
      'position',
    ],
  },

  // A grade tem que atravessar junto, e a ordem em que ela é enfileirada é a
  // ordem em que ela chega: linha antes do tipo, tipo antes do produto. A fila
  // é enviada da mais velha para a mais nova exatamente por isso.
  product_lines: {
    take: ['id', 'company_id', 'name', 'sort'],
    // A embalagem da família atravessa como ESTRUTURA, pelo mesmo motivo que a
    // do item: o aparelho guarda texto, o servidor guarda `jsonb`, e mandar o
    // texto cru faz o Postgres aceitar uma string onde vai uma lista — a escrita
    // passa, ninguém reclama, e a régua fica inútil do outro lado.
    //
    // Nulo continua nulo: família sem embalagem definida não afirma nada, e
    // `structure` devolve `null` para o que não é texto.
    build: (row) => ({ active: flag(row.active), packaging: structure(row.packaging) }),
  },

  // A categoria entra entre o produto e o tipo (`0057`), e por isso atravessa
  // DEPOIS da linha e ANTES do tipo — a fila vai da mais velha para a mais nova, e
  // categoria que chega depois do tipo que a aponta é chave estrangeira quebrada.
  product_categories: {
    take: ['id', 'company_id', 'line_id', 'name', 'sort'],
    build: (row) => ({ active: flag(row.active) }),
  },

  product_types: {
    // `category_id` é anulável e atravessa mesmo assim: nulo aqui QUER DIZER
    // alguma coisa — o tipo é do produto direto, que é o caso da fábrica do dono.
    take: ['id', 'company_id', 'line_id', 'category_id', 'name', 'sort'],
    build: (row) => ({ active: flag(row.active) }),
  },

  flavors: {
    // `category_id` (`0059`) atravessa pela mesma razão do `product_types`: nulo aqui
    // QUER DIZER alguma coisa — a variação vale no produto inteiro, ou no tipo, e não
    // naquela categoria. Perdê-lo no caminho faria o servidor oferecer morango de água
    // no de leite, que é exatamente a trava que a coluna existe para dar.
    take: ['id', 'company_id', 'line_id', 'category_id', 'type_id', 'name', 'sort'],
    build: (row) => ({ active: flag(row.active) }),
  },

  products: {
    take: [
      'id',
      'company_id',
      'item_id',
      'recipe_id',
      'yield_per_unit',
      'unit_packaging_rate',
      'shelf_life_days',
      'line_id',
      'category_id',
      'type_id',
      'flavor_id',
    ],
    // A lista de embalagem é `jsonb` do outro lado e texto aqui, como a
    // hierarquia de `items`: mandada crua, o Postgres guarda uma string entre
    // aspas onde deveria haver lista, aceita sem reclamar, e o consumo do outro
    // lado passa a somar nada.
    build: (row) => ({ active: flag(row.active), packaging_items: structure(row.packaging_items) }),
  },

  // O lote atravessa antes do movimento que o cita, e a fila cuida disso
  // sozinha: ela é enviada da escrita mais velha para a mais nova, e
  // `recordProduction` grava o lote antes das linhas. Fosse ao contrário, o
  // servidor recusaria o movimento por chave estrangeira - o aparelho não tem
  // essa FK, então é aqui que a ordem tem que estar certa.
  lots: {
    // `recipe_version_id` atravessa junto, e a dependência dele já está resolvida
    // pela mesma ordem: a versão da receita é gravada quando a ficha é salva,
    // muito antes da corrida que a usa.
    take: [
      'id',
      'company_id',
      'item_id',
      'code',
      'produced_on',
      'expires_on',
      'recipe_version_id',
      'created_at',
    ],
  },

  purchases: {
    take: ['id', 'company_id', 'supplier_name', 'ordered_at', 'arrived_at', 'created_at'],
    build: (_row, actor) => ({ created_by: actor.userId }),
  },

  purchase_lines: {
    // `created_at` stays behind: it is the device's own bookkeeping, and the
    // server has no column for it.
    take: [
      'id',
      'company_id',
      'purchase_id',
      'item_id',
      'purchase_quantity',
      'base_units',
      'total_cents',
    ],
  },

  // Pedido atravessa antes das linhas dele, e a fila é enviada da mais velha
  // para a mais nova - que é o que garante essa ordem sem ninguém ordenar nada.
  orders: {
    take: [
      'id',
      'company_id',
      'place_id',
      'status',
      'requested_for',
      'note',
      'created_at',
      'decided_at',
    ],
    // Qual CONTA anotou o pedido. Como em `purchases`, o aparelho não sabe quem
    // é enquanto está offline: o ator é carimbado na saída.
    build: (_row, actor) => ({ recorded_by: actor.userId }),
  },

  order_lines: {
    take: ['id', 'company_id', 'order_id', 'item_id', 'base_units'],
  },

  /**
   * A conferência que perdeu, e a decisão sobre ela.
   *
   * **Esta entrada faltava, e sem ela a fila INTEIRA morria.** `candidatarConferencia`
   * enfileirava `check_candidates` e `serialize` lança `UnknownTableError` para tabela que
   * ninguém lhe ensinou — de propósito, porque *"uma escrita que nunca chega em silêncio é o
   * pior resultado disponível"*. O resultado era pior que o defeito que a rodada consertava:
   * a primeira duplicação parava a sincronia daquele celular para sempre.
   *
   * `recorded_by` NÃO está na lista e vem do `build`, como em `movements`: no aparelho a
   * coluna não existe (saiu na V5, e o docblock de lá diz por quê), e a conta que escreveu é
   * a da sessão que sincroniza.
   *
   * `honrado_em` também não está, e por outra razão: ele é a anotação deste celular de que a
   * consequência da decisão já foi tirada no razão LOCAL. Cada aparelho tira a sua uma vez, e
   * mandar a anotação de um para o outro faria o segundo pular a dele.
   */
  check_candidates: {
    take: [
      'id',
      'company_id',
      'movement_group_id',
      'item_id',
      'location_id',
      'operator_id',
      'occurred_at',
      'quantity_base_units',
      'recorded_at',
      // A decisão sobe junto porque é ela que o servidor arbitra: a política
      // `using (resolution is null)` recusa a segunda, e é isso que faz o
      // PRIMEIRO que aceitar ficar. Sem estas três a aceitação não sairia do
      // celular — a tela responderia e o servidor nunca saberia.
      'resolution',
      'resolved_at',
      'resolved_by',
    ],
    build: (_row, actor) => ({ recorded_by: actor.userId }),
  },

  movements: {
    take: [
      'id',
      'company_id',
      'kind',
      'occurred_at',
      'recorded_at',
      'item_id',
      'quantity_base_units',
      'location_id',
      'lot_id',
      // Em qual dos quatro postos de controle a linha foi escrita. Nulo em
      // compra, produção e contagem: elas não acontecem num posto. Sem esta
      // linha o fato existiria só no celular - a lista é fechada de propósito,
      // e o que fica fora dela some em silêncio.
      'post',
      'loss_reason',
      'unit_cost_rate',
      // Por quanto saiu, quando saiu vendido. Nulo em tudo que não é venda, e nulo
      // é resposta: uma transferência para a loja própria não fatura nada, e um
      // consumo não tem preço. A coluna existe no servidor desde a `0008` e é
      // opcional, então sem esta linha a venda subiria SEM o preço — a fila seria
      // aceita, o razão do servidor teria a quantidade e não a receita, e a margem
      // divergiria entre o celular e o servidor sem uma reclamação.
      'unit_price_rate',
      // Nulo até o aparelho saber qual aparelho ele é.
      //
      // A coluna existe no servidor e é opcional, então nada quebra e nada
      // reclama - que é exatamente por que ela está listada aqui em vez de
      // esperar alguém lembrar. Quando a identidade chegar, o valor entra; o
      // lugar onde ele entra já está escrito.
      'device_id',
      // As duas colunas que um ato de mais de uma linha precisa: o grupo que
      // amarra as sete linhas de uma corrida, e para onde foi a outra metade de
      // uma transferência. Explícitas aqui de propósito - a lista é fechada
      // para que coluna nova não vire falha silenciosa.
      'movement_group_id',
      'counterpart_location_id',
      // Quem estava operando na hora, anotado no registro. Nulo quando a
      // empresa não quer nomear ninguém - e nulo é resposta, não ausência: a
      // linha continua respondendo pelo aparelho e pela conta.
      'operator_id',
      // Por que a carga voltou. O servidor exige na devolução e proíbe fora
      // dela, então a coluna tem que atravessar: sem ela na lista, toda
      // devolução seria recusada por restrição, com a fila parando atrás.
      'return_reason',
      // Quem LEVOU a carga, quando não foi o carro da fábrica. Nulo é resposta e
      // não ausência: a maioria das fábricas entrega com o carro dela, e um nome
      // obrigatório ali seria fato inventado.
      'carrier_id',
      'reverses_movement_id',
      'assistant_phrase',
      'note',
    ],
    /**
     * A conta que escreveu, e ela não se cede.
     *
     * O servidor impõe `recorded_by = auth.uid()` na política de append, provado
     * contra o Postgres na `db:verify`: a mesma escrita é aceita nomeando o
     * próprio usuário da sessão e recusada nomeando qualquer outro. Como o login
     * é da empresa, essa conta É quem sincroniza - não há o que decidir aqui.
     *
     * Quem estava operando é outra pergunta, e viaja em `operator_id`.
     */
    build: (_row, actor) => ({ recorded_by: actor.userId }),
  },
};

/**
 * As tabelas que o servidor NÃO deixa corrigir — sobem uma vez e só.
 *
 * **Ela mora aqui porque quem sabe o que atravessa é este arquivo.** A mesma lista
 * estava escrita à mão dentro do `scripts/device-session.ts`, e duas listas da
 * mesma regra são duas verdades esperando divergir: a primeira vez que uma tabela
 * append-only nova entrasse na travessia sem entrar lá, a fila subiria com `on
 * conflict do update` e o Postgres responderia `permission denied` sem dizer qual
 * das duas permissões falta. Isso já me custou uma execução da barra.
 *
 * O critério não é gosto: é a política do servidor. Onde não há `for update`, o que
 * corrige uma linha errada é outra linha — o razão por estorno, a leitura de sensor
 * medindo de novo, o preço combinando de novo, e o pedido de Reset por outro pedido.
 */
export const APENAS_INSERE: readonly ServerTable[] = [
  'movements',
  'readings',
  'sale_price_history',
  'erase_requests',
];

/** Every table this device knows how to send, for tests and for guards. */
export const sendableTables = Object.keys(CROSSINGS) as ServerTable[];

/**
 * As colunas que esta tabela manda para cima — e é por elas que a DESCIDA lê de volta.
 *
 * Exportada em 12 de setembro, quando a sincronia deixou de ser de mão única. A alternativa
 * era `src/sync/descida.ts` manter a própria lista de colunas por tabela, e essa é a doença
 * que este repositório já nomeou três vezes num dia: duas listas escritas pela mesma mão
 * concordam no dia em que nascem e divergem no primeiro `alter table`. Aqui a ida e a volta
 * são simétricas por CONSTRUÇÃO — uma coluna nova sobe e desce junto, ou não faz nem uma
 * coisa nem outra.
 *
 * O que `build` acrescenta fica de fora de propósito: são campos que o SERVIDOR precisa e o
 * aparelho não guarda (`recorded_by`, que é a conta que escreveu). Descer o que o aparelho
 * não tem onde pôr seria inventar coluna.
 */
export function colunasQueSobem(tabela: ServerTable): readonly string[] {
  return CROSSINGS[tabela].take;
}

/**
 * Turns one queued entry plus the row it names into what the server should get.
 *
 * `row` is null for a command like `erase`, which carries its own payload and
 * has no row behind it. A queued table nobody has taught this file about
 * throws rather than being skipped: a write that silently never arrives is the
 * worst outcome available.
 */
export function serialize(
  entry: OutboxEntry,
  row: Record<string, unknown> | null,
  actor: SyncActor,
): ServerWrite {
  if (entry.table === 'item_costs' || entry.table === 'item_cost_history') {
    return { kind: 'derived', table: entry.table };
  }

  if (entry.table === 'erase') {
    /**
     * A área é conferida contra a lista, e não contra `typeof string`.
     *
     * Isto aceitava qualquer texto que a fila carregasse e o mandava adiante
     * como área. Não fazia dano hoje porque nada consome o comando ainda — e é
     * exatamente por isso que era perigoso: a primeira implementação de
     * `Transport` herdaria uma fronteira aberta sem ninguém ter decidido abri-la,
     * e o servidor receberia uma palavra que ele não conhece.
     *
     * A fila é escrita por este aplicativo, então "não devia acontecer". O
     * arquivo inteiro existe porque "não devia acontecer" já aconteceu seis
     * vezes entre o SQLite e o Postgres.
     */
    const area = entry.payload?.area ?? entry.rowId;
    if (!isEraseArea(area)) throw new UnknownAreaError(String(area));

    /**
     * O apagamento sobe como PEDIDO, não como comando.
     *
     * A fila carrega fato — é a fundação dela, e é por isso que ela é
     * append-only. Um comando solto seria a única coisa nela que manda em vez de
     * contar, e o servidor teria de confiar num verbo que chegou pela rede.
     *
     * O pedido é linha em `erase_requests` (`0045`): quem pediu, o que pediu, e
     * quando. **O PRAZO não vai** — o gatilho `erase_requests_deadline` o calcula
     * do lado de lá, porque um aparelho com a data adiantada destruiria no ato o
     * que a empresa combinou guardar por dez dias. E `requested_by` vai do ator
     * autenticado, como `recorded_by` do razão: uma conta não pede em nome de
     * outra, e a política do servidor recusa se tentar.
     */
    // A empresa vem do ATOR, não do payload — a mesma fonte do `requested_by`.
    //
    // Vinha do corpo da entrada, congelado no instante em que alguém tocou em
    // apagar. Entre esse instante e o envio cabe a adoção de empresa, que é o
    // caminho normal de toda instalação nova: o aparelho passa a ser outra empresa
    // e o pedido continua nomeando a semente, que o servidor não conhece.
    const empresa = actor.companyId;
    if (!empresa) throw new UnknownAreaError(`${area} sem empresa`);

    return {
      kind: 'upsert',
      table: 'erase_requests',
      row: {
        id: entry.id,
        company_id: empresa,
        area,
        requested_by: actor.userId,
      },
    };
  }

  const crossing = CROSSINGS[entry.table as ServerTable];
  if (!crossing) throw new UnknownTableError(entry.table);

  if (!row) throw new LinhaSumiuError(entry.table, entry.rowId);

  const out: Record<string, unknown> = {};
  for (const column of crossing.take) out[column] = nullable(row[column]);
  Object.assign(out, crossing.build?.(row, actor) ?? {});

  return { kind: 'upsert', table: entry.table as ServerTable, row: out };
}
