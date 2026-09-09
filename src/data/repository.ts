import { applyCostEvent, blendRate, type StockCostState } from '@/domain/cost';
import { amountOf, cents, rate, type Cents, type Rate } from '@/domain/money';
import { isValidHierarchy } from '@/domain/units';
import { DEFAULT_ALERTS, type AlertSettings } from '@/domain/alerts';
import {
  UNIT_ROOM_KINDS,
  daysOfCover,
  ehSalaDeUnidade,
  podeEscrever,
  vendeAoConsumidor,
} from '@/domain/ledger';
import { ROLES, capabilitiesFor, type Capability, type Role } from '@/domain/access';
import { expiresOn, lotCode } from '@/domain/lot';
import type { LossReason, MovementKind, ReturnReason } from '@/domain/ledger';
import { explodeRequirements } from '@/domain/recipe';
import type { ItemCosts, Recipe, RecipeLine } from '@/domain/recipe';
import type { PackagingHierarchy } from '@/domain/units';
import { ordersCoveredBy } from '@/domain/picking';
import { db, newId, nowIso, type Db } from './db';
import { readJson, readMeta, writeJson, writeMeta } from './meta';
import { enqueue, forgetOrphans } from './outbox';
import {
  blockerFor,
  EraseBlockedError,
  emptyCounts,
  itemKindsFor,
  tablesFor,
  type EraseArea,
  type EraseCounts,
} from './erase';

/**
 * Every query the app needs, in one place.
 *
 * The screens call these functions, and when the assistant lands it will call
 * *these same functions* rather than writing SQL of its own. An assistant with
 * a second query path eventually reports a different number than the screen
 * showing the same thing, and the app loses its credibility in a single day.
 */

export type ItemKind = 'input' | 'packaging' | 'product' | 'resale' | 'store_supply';

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;
  /** What the buyer holds: "25kg sack". */
  purchaseUnit: string | null;
  /** Base units inside one purchase unit. 25000 g in a 25 kg sack. */
  purchaseToBase: number | null;
  baseUnit: string;
  packaging: PackagingHierarchy;
  /**
   * O que este item tem quando está cheio, em unidade-base. Nulo: não me pergunte.
   *
   * É a régua das faixas de volume. Sem ela o aplicativo não sabe o que é pouco,
   * e não pinta cor nenhuma — o que é a resposta certa, e não uma limitação.
   */
  fullLevel: number | null;
};

export type ItemWithCost = Item & {
  /**
   * O custo médio, e `null` é resposta — duas respostas, na verdade.
   *
   * Era `Rate` com zero fazendo as vezes de ausência, e zero é a única coisa que
   * este campo não pode significar: "nunca foi comprado" e "não é seu para ver"
   * são fatos diferentes, e a tela tem frase própria para cada um (`canSeeMoney`
   * responde qual). Como zero, os dois viravam a MESMA frase — *"3 sem preço,
   * lance a nota de compra"* — que para quem não pode ver custo é orientação
   * falsa: não há nota nenhuma a lançar. E pior, `null <= 0` é TRUE em
   * JavaScript, então a contagem de "sem preço" passaria a contar o almoxarifado
   * inteiro.
   *
   * Quem só quer aritmética escreve `?? 0` e acerta: dentro de uma habilidade do
   * assistente que declara `requires: 'view_cost'`, nulo só pode ser "sem custo",
   * que é exatamente o que zero significava antes.
   */
  averageRate: Rate | null;
  lastRate: Rate | null;
  onHandBaseUnits: number;
  /** False once it is out of circulation: kept for history, hidden from pickers. */
  active: boolean;
};

const DEFAULT_PACKAGING: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };

function parsePackaging(json: string): PackagingHierarchy {
  try {
    const tiers = JSON.parse(json);
    return Array.isArray(tiers) && tiers.length > 0 ? { tiers } : DEFAULT_PACKAGING;
  } catch {
    return DEFAULT_PACKAGING;
  }
}

/**
 * A embalagem por unidade, como estrutura e com nome de gente.
 *
 * Guarda só id e quantidade: o nome vem do catálogo a cada leitura, senão o JSON
 * passa a ser um segundo lugar onde o item se chama alguma coisa - e o dia em
 * que alguém corrigir "Palito de picolé" para "Palito", a tela de produção
 * continuaria dizendo o nome antigo.
 *
 * Linha quebrada é ignorada em vez de derrubar a tela. Uma corrida que não
 * consome o palito é um erro de inventário; uma tela de produção que não abre é
 * a fábrica parada.
 */
/**
 * A lista como ela é gravada: sem nome, sem repetição, sem zero.
 *
 * O mesmo item duas vezes é erro de digitação e não receita exótica - somar as
 * duas linhas é o que a tela de receita já faz com o mesmo insumo repetido, pelo
 * mesmo motivo: ninguém pediu dois palitos por picolé, alguém tocou duas vezes.
 */
export function normalizePackagingItems(
  lines: readonly { itemId: string; quantityPerUnit: number }[],
): { itemId: string; quantityPerUnit: number }[] {
  const somado = new Map<string, number>();
  for (const linha of lines) {
    if (!linha.itemId) continue;
    if (!Number.isFinite(linha.quantityPerUnit) || linha.quantityPerUnit <= 0) {
      throw new Error('embalagem por unidade tem que ser mais que zero');
    }
    somado.set(linha.itemId, (somado.get(linha.itemId) ?? 0) + linha.quantityPerUnit);
  }
  return [...somado].map(([itemId, quantityPerUnit]) => ({ itemId, quantityPerUnit }));
}

function parsePackagingItems(
  json: string,
  catalog: Record<string, string>,
): Product['packagingItems'] {
  let raw: unknown;
  try {
    raw = JSON.parse(json || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const out: Product['packagingItems'] = [];
  for (const linha of raw) {
    if (typeof linha !== 'object' || linha === null) continue;
    const { itemId, quantityPerUnit } = linha as { itemId?: unknown; quantityPerUnit?: unknown };
    if (typeof itemId !== 'string' || typeof quantityPerUnit !== 'number') continue;
    if (!Number.isFinite(quantityPerUnit) || quantityPerUnit <= 0) continue;
    out.push({ itemId, name: catalog[itemId] ?? itemId, quantityPerUnit });
  }
  return out;
}

// --- o recorte de lugar, numa grafia só -------------------------------------

/**
 * De onde é a pergunta: de uma SALA, de uma UNIDADE, ou da empresa inteira.
 *
 * Três respostas e não duas, porque são três perguntas de verdade. A sala é a
 * prateleira exata — o que a tela de um insumo mostra quando alguém abre a câmara
 * fria. A unidade é ela **mais as salas dentro dela**, que é o que "quanto eu tenho
 * aqui" quer dizer para quem está com o aparelho. E ausente é a empresa, que é a
 * resposta certa para catálogo, relatório e para o custo médio.
 *
 * Não é um campo só por um motivo medido: passar uma unidade num parâmetro que
 * significa "aquela prateleira" somaria apenas o pátio e deixaria a câmara fria de
 * fora. **Somar de menos é o erro mais silencioso dos dois** — um número menor lê
 * como prudência, e ninguém desconfia de um sistema que diz ter menos do que tem.
 */
export type Escopo = { sala: string } | { unidade: string };

/**
 * As colunas de lugar que o recorte aceita — e a lista é o que valida a
 * interpolação.
 *
 * O texto vai para dentro do SQL, então ele não pode vir de fora. Aqui quem
 * garante não é uma checagem em tempo de execução: é o TIPO, que só admite estes
 * quatro nomes escritos neste arquivo. Um nome novo não compila, e é isso que faz
 * a interpolação ser segura em vez de parecer segura.
 */
type ColunaDeLugar =
  | 'm.location_id'
  | 'm.counterpart_location_id'
  | 'location_id'
  | 'counterpart_location_id'
  /**
   * `production_runs r` — e ela entra na LISTA em vez de um `replace` no texto pronto.
   *
   * A primeira versão fazia `recorte.sql.replace(/location_id/g, 'r.location_id')`, o
   * que compila e produz SQL inválido: o texto de `noEscopo` também contém
   * `esc.parent_location_id`, que viraria `esc.parent_r.location_id`. O typecheck não
   * vê — é uma string — e a consulta só quebra no aparelho, na tela que ela alimenta.
   *
   * Nome novo aqui compila ou não compila, que é o ponto inteiro deste tipo.
   */
  | 'r.location_id';

/**
 * O recorte como texto de SQL e os parâmetros dele — escrito UMA vez.
 *
 * Ele nasceu depois de a mesma condição aparecer em quatro consultas em algumas
 * horas, e a regra da casa sobre isso já estava paga duas vezes: predicado escrito
 * três vezes é a forma que produz divergência, e aqui a divergência é saldo.
 *
 * `COALESCE(parent_location_id, company_id)` é a parte que protege quem já usa, e
 * ela diz o que o backfill da migração 0046 afirma: **sala sem pai pertence à
 * primeira unidade**, que é a que tem o id da empresa. Sem isso, uma câmara fria
 * que nunca ganhou pai — vinda de um aparelho com versão antiga, ou criada antes da
 * migração — sairia do saldo em silêncio.
 *
 * Devolve condição sempre verdadeira quando não há escopo, porque é isso que a
 * empresa inteira é. Os cinco parâmetros saem sempre, na ordem, mesmo nulos: o que
 * muda é o valor, nunca a aridade — comando com número de `?` variável é comando
 * que o ligador recusa numa das pontas.
 */
function noEscopo(
  coluna: ColunaDeLugar,
  onde?: Escopo,
): { sql: string; params: (string | null)[] } {
  const sala = onde && 'sala' in onde ? onde.sala : null;
  const unidade = onde && 'unidade' in onde ? onde.unidade : null;
  return {
    // O nome da coluna entra no texto do comando, e quem garante que ele é seguro
    // não é checagem em tempo de execução: é o TIPO `ColunaDeLugar`, que só admite
    // quatro nomes literais escritos neste arquivo. Nome novo não compila. Os
    // marcadores abaixo ficam NA LINHA de cada interpolação porque é só ali que
    // eles suprimem — marcador no comentário de cima não suprime nada e lê como se
    // suprimisse, que é o defeito que a própria proofgate chama de `dead-allow`.
    sql: `(? IS NULL OR ${coluna} = ?) -- proofgate-allow: coluna é do tipo ColunaDeLugar, nunca entrada
          AND (? IS NULL OR EXISTS (
                SELECT 1 FROM locations esc
                 WHERE esc.id = ${coluna} -- proofgate-allow: idem, ColunaDeLugar
                   AND (esc.id = ?
                        OR esc.parent_location_id = ?
                        -- O atalho de compatibilidade, e ele ESPELHA o WHERE do
                        -- backfill da migração 0046, exatamente. Sala interna sem
                        -- pai é da primeira unidade porque foi isso que o backfill
                        -- afirmou; loja, cliente, veículo e outra UNIDADE não
                        -- entram, porque o backfill não os tocou.
                        --
                        -- Duas vezes eu escrevi este atalho largo e duas vezes um
                        -- teste o pegou: primeiro a segunda unidade caindo dentro da
                        -- primeira, depois a loja do cliente. Atalho de
                        -- compatibilidade que não espelha o backfill inventa
                        -- pertencimento — e inventa para os dois lados.
                        OR (esc.parent_location_id IS NULL
                            AND esc.kind IN (${UNIT_ROOM_KINDS.map((k) => `'${k}'`).join(', ')}) -- proofgate-allow: lista de espécies do domínio, nunca entrada
                            AND esc.company_id = ?))))`,
    params: [sala, sala, unidade, unidade, unidade, unidade],
  };
}

/**
 * A unidade em que uma sala fica — e, para uma unidade, ela mesma.
 *
 * Espelha o WHERE do backfill da `0046` pelo mesmo motivo que `noEscopo` espelha:
 * sala interna sem pai pertence à primeira unidade, que é a que tem o id da
 * empresa. Loja, cliente e veículo não ficam dentro de unidade nenhuma e respondem
 * por si — quem pergunta pela unidade de uma loja está perguntando pelo pátio dela,
 * e a resposta certa é a loja.
 *
 * Sem linha em `locations` a resposta é o próprio id: é o aparelho novo, cujo lugar
 * padrão nasce dentro da transação mais abaixo, e ali o saldo é zero de qualquer
 * jeito.
 */
async function unidadeDaSala(conn: Db, companyId: string, locationId: string): Promise<string> {
  const linha = await conn.getFirstAsync<{ parent: string | null; kind: string }>(
    `SELECT parent_location_id AS parent, kind FROM locations WHERE company_id = ? AND id = ?`,
    [companyId, locationId],
  );
  if (!linha) return locationId;
  if (linha.parent) return linha.parent;
  return ehSalaDeUnidade(linha.kind) ? companyId : locationId;
}

// --- items -----------------------------------------------------------------

/**
 * O catálogo com o saldo de cada item — e a partir de agora, o saldo de ONDE.
 *
 * Sem `locationId`, a soma é da empresa inteira: é o que estava certo enquanto
 * havia uma sala só, e continua certo para a fábrica que tem uma. Com ele, a
 * soma é daquela sala.
 *
 * A generalização é a que o `CLAUDE.md` nomeia como o primeiro pedido da Fase 2,
 * e o defeito que ela fecha é este: com a polpa dividida entre a fábrica e a
 * câmara fria, o almoxarifado dizia "34 kg" enquanto quem estava no tacho tinha
 * 20 na mão. O número não estava errado — estava respondendo outra pergunta.
 *
 * O padrão continua sendo a empresa toda, e não é preguiça: quem tem um lugar só
 * nunca deve ver um filtro de lugar. A pergunta "qual sala?" só existe onde
 * existe mais de uma.
 */
export async function listItems(
  companyId: string,
  kind?: ItemKind,
  /** Deactivated items are excluded unless a screen is explicitly showing them. */
  includeInactive = false,
  /**
   * Onde somar — e são DUAS perguntas diferentes, por isso não é um campo só.
   *
   * `{ sala }` é o saldo daquela prateleira exata: é o que a tela de um insumo
   * mostra quando alguém abre a câmara fria. `{ unidade }` é o saldo da unidade de
   * fábrica INTEIRA — ela e as salas dentro dela —, que é o que "quanto eu tenho
   * aqui" quer dizer para quem está com o aparelho.
   *
   * Um campo só faria as duas colidirem: passar a unidade num parâmetro de sala
   * somaria apenas o pátio da unidade e deixaria a câmara fria de fora, que é
   * exatamente o defeito de somar de menos — o mais calado dos dois, porque um
   * número menor parece prudente.
   *
   * Ausente continua sendo a empresa inteira, e isso é resposta certa para tela de
   * catálogo e de relatório, onde a pergunta é sobre o que a EMPRESA tem.
   */
  onde?: { sala: string } | { unidade: string },
): Promise<ItemWithCost[]> {
  const conn = await db();
  /**
   * A checagem roda ANTES da consulta, e é essa ordem que é a fundação.
   *
   * O portão fechado não apaga o número depois de lê-lo: ele **não junta a tabela
   * de custo**, então o valor não chega a existir na resposta. É a mesma forma que
   * o servidor usa na sua própria view (`0008`, `case when has_capability(...) then
   * m.unit_cost_rate end`), e é o que o `CLAUDE.md` quer dizer com *"não existe
   * número para vazar"*.
   */
  const dinheiro = (await canSeeMoney(companyId)) ? 1 : 0;
  const recorte = noEscopo('m.location_id', onde);
  const rows = await conn.getAllAsync<{
    id: string;
    kind: ItemKind;
    name: string;
    purchase_unit: string | null;
    purchase_to_base: number | null;
    base_unit: string;
    packaging: string;
    active: number;
    average_rate: number | null;
    last_rate: number | null;
    on_hand_base_units: number | null;
    full_level: number | null;
  }>(
    `SELECT i.id, i.kind, i.name, i.purchase_unit, i.purchase_to_base, i.base_unit, i.packaging,
            i.active, i.full_level, c.average_rate, c.last_rate,
            (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = i.company_id AND m.item_id = i.id
                AND ${recorte.sql})
              AS on_hand_base_units
       FROM items i
       LEFT JOIN item_costs c ON c.item_id = i.id AND ? = 1
      WHERE i.company_id = ?
        AND (? = 1 OR i.active = 1)
        AND (? IS NULL OR i.kind = ?)
      ORDER BY i.name COLLATE NOCASE`,
    [
      ...recorte.params,
      dinheiro,
      companyId,
      includeInactive ? 1 : 0,
      kind ?? null,
      kind ?? null,
    ],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    purchaseUnit: r.purchase_unit,
    purchaseToBase: r.purchase_to_base,
    baseUnit: r.base_unit,
    packaging: parsePackaging(r.packaging),
    fullLevel: r.full_level,
    active: r.active === 1,
    averageRate: r.average_rate === null || r.average_rate === undefined ? null : (r.average_rate as Rate),
    lastRate: r.last_rate === null || r.last_rate === undefined ? null : (r.last_rate as Rate),
    onHandBaseUnits: r.on_hand_base_units ?? 0,
  }));
}

export async function saveItem(
  companyId: string,
  /** `fullLevel` ausente é "não mexa no que já estava" — como a ficha de acordo. */
  item: Omit<Item, 'id' | 'fullLevel'> & { id?: string; fullLevel?: number | null },
): Promise<string> {
  // A hierarquia é conferida ANTES de gravar, e a regra que confere já existia
  // sem ninguém chamar: `isValidHierarchy` estava no domínio desde o começo,
  // exercitada só por teste. Uma hierarquia inválida — o primeiro degrau
  // diferente de 1, ou um degrau que não cresce — faz o `UnitStepper` oferecer
  // conversão errada e a conta de caixa sair torta, sem nada acusando.
  if (!isValidHierarchy(item.packaging)) throw new Error('packaging: degraus fora de ordem');

  const conn = await db();
  let id = '';
  await conn.withTransactionAsync(async () => {
    id = await writeItem(conn, companyId, item);
  });
  return id;
}

/**
 * The write itself, without opening a transaction.
 *
 * Split out because `saveProduct` writes an item and a product together and
 * they have to land as one thing. SQLite has no nested transactions, so the
 * transaction belongs to the public function and the private one joins it.
 */
async function writeItem(
  conn: Db,
  companyId: string,
  item: Omit<Item, 'id' | 'fullLevel'> & { id?: string; fullLevel?: number | null },
): Promise<string> {
  const id = item.id ?? newId();

  // O nível cheio ausente preserva o que estava lá. A tela de produto não manda
  // nível nenhum, e um `excluded.full_level` nulo apagaria a régua de faixa de
  // todos os itens dela em silêncio — a mesma armadilha da ficha de acordo.
  const anterior =
    item.id !== undefined && item.fullLevel === undefined
      ? await conn.getFirstAsync<{ full_level: number | null }>(
          `SELECT full_level FROM items WHERE id = ?`,
          [item.id],
        )
      : null;
  const fullLevel = item.fullLevel === undefined ? (anterior?.full_level ?? null) : item.fullLevel;

  await conn.runAsync(
    `INSERT INTO items (id, company_id, kind, name, purchase_unit, purchase_to_base,
                        base_unit, packaging, full_level, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       name = excluded.name,
       purchase_unit = excluded.purchase_unit,
       purchase_to_base = excluded.purchase_to_base,
       base_unit = excluded.base_unit,
       packaging = excluded.packaging,
       full_level = excluded.full_level`,
    [
      id,
      companyId,
      item.kind,
      item.name,
      item.purchaseUnit,
      item.purchaseToBase,
      item.baseUnit,
      JSON.stringify(item.packaging.tiers),
      fullLevel,
      nowIso(),
    ],
  );

  await enqueue(conn, [{ table: 'items', rowId: id }]);

  return id;
}

/** Cost of every item, in the shape the recipe engine expects. */
/**
 * O custo de cada item para a TELA — e `null` é o portão, não um mapa vazio.
 *
 * Devolvia `{}` quando fechado, e isso furava o desenho inteiro num lugar onde o
 * compilador não podia cobrar nada: `ItemCosts` é `Record<string, Rate>`, e mapa
 * vazio tem o mesmo tipo que mapa cheio. O motor de receita faz `?? 0` por
 * contrato (`src/domain/recipe.ts`), então `costRecipe({})` devolvia `batchCents:
 * 0` — um número, nunca nulo — e **cinco telas imprimiam R$ 0,00 por unidade em
 * todo produto com receita**, que é exatamente a mentira que este portão existe
 * para impedir. Nulo devolve a cobrança ao compilador.
 */
export async function itemCosts(companyId: string): Promise<ItemCosts | null> {
  if (!(await canSeeMoney(companyId))) return null;
  return averageRatesForLedger(companyId);
}

/**
 * O custo médio SEM portão — para quem GRAVA, nunca para quem mostra.
 *
 * Existe porque congelar custo e ver custo são perguntas diferentes: uma corrida
 * lançada por quem não vê dinheiro tem que congelar o número CERTO, senão o
 * livro-razão fica errado para todo mundo, e conteúdo de livro-razão não se
 * corrige — se estorna.
 *
 * O nome é longo de propósito: quem escrever isto numa tela vai ler "for ledger"
 * antes de digitar o parêntese. E não é só o nome que impede —
 * `src/layers.test.ts` recusa qualquer arquivo fora de `src/data/` e `scripts/`
 * que a mencione, porque conselho eu esqueço na próxima sessão e guarda roda
 * sozinho.
 */
export async function averageRatesForLedger(companyId: string): Promise<ItemCosts> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ item_id: string; average_rate: number }>(
    `SELECT item_id, average_rate FROM item_costs WHERE company_id = ?`,
    [companyId],
  );
  return Object.fromEntries(rows.map((r) => [r.item_id, r.average_rate as Rate]));
}

// --- purchases: the event that moves the cost -------------------------------

/**
 * Records a purchase line and moves the moving average in the same step.
 *
 * This is the whole point of the design: nobody "updates the price of sugar" as
 * a task. They enter what they paid, and every recipe using sugar recalculates
 * while the price history writes itself.
 */
export async function recordPurchase(
  companyId: string,
  input: {
    itemId: string;
    supplierName?: string;
    /** What the buyer typed: 8 sacks. */
    purchaseQuantity: number;
    /** Converted on the way in, so storage only ever sees base units. */
    baseUnits: number;
    totalCents: Cents;
    orderedAt?: string;
    /**
     * Quando a nota entrou de verdade, se não foi agora.
     *
     * Nota de compra chega atrasada: o caminhão descarrega às sete e alguém
     * digita ao meio-dia, ou no dia seguinte. O livro-razão guarda os dois
     * fatos separados desde a V3 - `occurred_at` é quando aconteceu,
     * `recorded_at` é quando o aparelho soube -, e até agora esta função
     * escrevia o mesmo instante nos dois, o que fazia toda compra parecer ter
     * acontecido na hora da digitação. O histórico de custo herda a mesma data,
     * senão a alta apareceria no dia errado da home.
     */
    occurredAt?: string;
    /**
     * The phrase somebody said, when this came from the assistant.
     *
     * The plan's own condition for letting an assistant write at all: every
     * movement it creates is marked as such, with the words that created it. A
     * ledger that cannot say "this one came from a sentence" makes autonomy
     * unauditable, and unauditable autonomy is what people stop trusting.
     * Null when a person filled the screen themselves.
     */
    assistantPhrase?: string;
  },
): Promise<{ previousRate: Rate | null; newRate: Rate }> {
  // Receber nota é conferir recebimento, e é essa a capacidade dos dois lados.
  await podeGravar(companyId, 'purchase');
  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;

  const current = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );

  // How much is on hand is a question for the ledger, never for a stored
  // total. The moving average needs the quantity it is averaging over, and
  // taking it from the movements is what keeps the cost and the balance
  // answering to one history instead of drifting apart.
  const held = await conn.getFirstAsync<{ base_units: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS base_units
       FROM movements WHERE company_id = ? AND item_id = ?`,
    [companyId, input.itemId],
  );

  const before: StockCostState = {
    baseUnits: held?.base_units ?? 0,
    averageRate: (current?.average_rate ?? 0) as Rate,
  };

  // The same function the tests cover and the assistant will call.
  const after = applyCostEvent(before, {
    kind: 'purchase',
    baseUnits: input.baseUnits,
    totalCents: input.totalCents,
    at,
  });

  // Five rows describe one event, so they land together or not at all. A
  // purchase that recorded its invoice and not its cost would leave a price
  // history with a hole in it that nothing could reconstruct.
  const purchaseId = newId();
  // The line and the movement it causes share one id, because they are one
  // fact seen twice. Replaying the queue cannot post the arrival again.
  const lineId = newId();

  await conn.withTransactionAsync(async () => {
    // Inside the transaction: a place that exists only because a purchase was
    // attempted, and the purchase then failed, would be a row nobody asked for.
    const locationId = await ensureLocation(conn, companyId);

    // `received_at` é `occurred`, e não `at` — a mesma distinção que o razão faz.
    //
    // Escrevia o instante da DIGITAÇÃO nos dois campos, então a nota lançada ao
    // meio-dia de uma entrega da véspera dizia ter chegado ao meio-dia de hoje,
    // enquanto o movimento que ela criava dizia a data certa. A linha e o razão
    // discordavam sobre o mesmo fato, e ninguém via porque nada lia esta coluna.
    // Agora `deliveriesOf` lê, e o prazo do fornecedor sairia inflado por todo
    // atraso de digitação — que é medir a fábrica em vez de medir o fornecedor.
    await conn.runAsync(
      `INSERT INTO purchases (id, company_id, supplier_name, ordered_at, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [purchaseId, companyId, input.supplierName ?? null, input.orderedAt ?? null, occurred, at],
    );

    await conn.runAsync(
      `INSERT INTO purchase_lines (id, company_id, purchase_id, item_id, purchase_quantity,
                                   base_units, total_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        companyId,
        purchaseId,
        input.itemId,
        input.purchaseQuantity,
        input.baseUnits,
        input.totalCents,
        at,
      ],
    );

    const lineRate = rate(input.totalCents / 100, input.baseUnits);

    // The arrival itself, in the ledger, with what it cost frozen onto it. A
    // sugar price change in March must not rewrite what January cost.
    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate,
                              movement_group_id, assistant_phrase,
                              operator_id)
       VALUES (?, ?, 'purchase', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        companyId,
        occurred,
        at,
        input.itemId,
        input.baseUnits,
        locationId,
        lineRate,
        // O grupo é a NOTA, não a linha: desfazer uma nota desfaz as linhas dela.
        // Hoje entra uma linha por chamada e os dois dariam no mesmo; no dia em
        // que a nota tiver duas, o grupo por linha desfaria metade de uma nota,
        // que é a coisa que o estorno por ato existe para não deixar acontecer.
        purchaseId,
        input.assistantPhrase ?? null,
        await currentOperatorId(),
      ],
    );

    await conn.runAsync(
      `INSERT INTO item_costs (item_id, company_id, average_rate, last_rate, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         average_rate = excluded.average_rate,
         last_rate = excluded.last_rate,
         updated_at = excluded.updated_at`,
      [input.itemId, companyId, after.averageRate, lineRate, at],
    );

    await conn.runAsync(
      `INSERT INTO item_cost_history (id, company_id, item_id, previous_rate, new_rate, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), companyId, input.itemId, before.averageRate || null, after.averageRate, occurred],
    );

    // The line matters as much as its header, and for a reason beyond
    // completeness: the server's `apply_purchase_to_cost` trigger fires on an
    // insert into `purchase_lines`. Without it the invoice replays as an empty
    // header, and the authoritative cost and price history are never written.
    // `item_costs` is not queued, and that omission is the design.
    //
    // The average is derived, and a derived number gets one author. This device
    // computes its own so it can show a cost with no signal; the server
    // computes its own from these very lines, by the same rule. Sending both
    // gives the figure two authors and they disagree - replaying the queue put
    // the server at 0.5605 where the phone said 0.5310, because the queue
    // carries row ids and resends whatever the row says *now*.
    //
    // What travels is the invoice. The average is what each side concludes.
    await enqueue(conn, [
      { table: 'purchases', rowId: purchaseId },
      { table: 'purchase_lines', rowId: lineId },
      { table: 'movements', rowId: lineId },
    ]);
  });

  return {
    previousRate: before.averageRate > 0 ? before.averageRate : null,
    newRate: after.averageRate,
  };
}

// --- counting what is really on the shelf ------------------------------------

export type CountResult = {
  /** What the ledger believed before anybody walked to the shelf. */
  expectedBaseUnits: number;
  countedBaseUnits: number;
  /** Signed. Negative means less was there than the ledger thought. */
  deltaBaseUnits: number;
  /** What that difference is worth, at the item's average cost. */
  deltaCents: Cents;
  /**
   * O que a falta significa quando a prateleira é um BALCÃO: foi vendido.
   *
   * Nulo em toda sala nossa — câmara fria, almoxarifado, piso da fábrica —, porque
   * ali a falta é falta e o razão a chama de `adjustment`, que é o nome certo para
   * *"o mundo discordou do livro"*. Numa loja própria a falta tem nome: o que saiu
   * da prateleira foi comprado por alguém, e é este o fato que faltava para a margem
   * existir.
   *
   * `revenueCents` é nulo, e não zero, quando não há preço combinado nem de tabela.
   * Zero significaria *"vendido de graça"*, que é uma afirmação sobre o mundo; nulo
   * significa *"ninguém disse por quanto"*, que é a verdade. A quantidade vendida é
   * fato de qualquer jeito e vai para o razão — recusar a contagem por falta de preço
   * seria deixar de proteger o saldo por causa de um número que ninguém precisou.
   */
  sold: null | {
    baseUnits: number;
    priceRate: Rate | null;
    revenueCents: Cents | null;
  };
};

export type MovementRow = {
  id: string;
  kind: string;
  /** Signed, in base units: positive arrived, negative left. */
  baseUnits: number;
  /** What one base unit was worth when it moved, frozen. */
  unitCostRate: Rate | null;
  note: string | null;
  occurredAt: string;
  /**
   * O ATO de que esta linha faz parte, que é por onde se desfaz.
   *
   * Nulo em movimento antigo, gravado antes de a compra, a contagem e a perda
   * carregarem grupo. Nulo aqui quer dizer exatamente uma coisa na tela: esta
   * linha não tem como ser desfeita, e é melhor não oferecer do que oferecer e
   * falhar.
   */
  groupId: string | null;
  /** Verdadeiro quando alguém já desfez este ato. Estorno não se faz duas vezes. */
  reversed: boolean;
};

/**
 * The company's one place to keep things, created the first time something
 * moves.
 *
 * A movement has to happen somewhere. That is not ceremony: it is what makes
 * "how much is in the cold room" answerable later without going back and
 * rewriting history that was recorded without a place. Phase 1 has a single
 * storeroom and no screen to name a second, so the default carries the
 * company's own id - deterministic, so two phones that create it in the same
 * minute create one row rather than two.
 */
export type LocationBalance = {
  locationId: string;
  /** How the people there call it. Empty on the default place, which no screen names yet. */
  locationName: string;
  kind: string;
  baseUnits: number;
};

/**
 * Quanto tem de um item em cada lugar.
 *
 * A mesma aritmética da view `stock_balances` do servidor, de propósito
 * (`0001_foundation.sql:253-260`): as duas pontas respondem "quanto tem aqui"
 * pela mesma soma, que é o que a checagem 6 da `db:verify` compara.
 *
 * O total por empresa continua onde estava, em `listItems`, e não muda uma
 * linha: enquanto existe um lugar só, a soma de um é igual à soma de todos.
 * Local vira `GROUP BY`, nunca um `WHERE` obrigatório — a tela que quer o total
 * não passa a precisar saber de lugar nenhum.
 *
 * Devolve os lugares que têm movimento, e não todos os cadastrados: um lugar
 * onde nunca entrou nada não tem saldo zero, não tem saldo. A diferença
 * importa numa tela — "0 kg" convida a conferir, uma ausência não.
 */
export async function balanceByLocation(
  companyId: string,
  itemId: string,
): Promise<LocationBalance[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    location_id: string;
    name: string;
    kind: string;
    base_units: number;
  }>(
    `SELECT m.location_id, l.name, l.kind, SUM(m.quantity_base_units) AS base_units
       FROM movements m
       JOIN locations l ON l.id = m.location_id
      WHERE m.company_id = ? AND m.item_id = ?
      GROUP BY m.location_id, l.name, l.kind
      ORDER BY l.kind, l.name`,
    [companyId, itemId],
  );

  return rows.map((r) => ({
    locationId: r.location_id,
    locationName: r.name,
    kind: r.kind,
    baseUnits: r.base_units,
  }));
}

export type Place = {
  id: string;
  name: string;
  kind: string;
  /** Verdadeiro só para o lugar que nasceu junto com a empresa. */
  isDefault: boolean;
  /** O telefone de quem recebe. Vazio quando ninguém combinou nada. */
  contactPhone: string;
  /** Bitmask de dias, bit 0 no domingo (`src/domain/agreement`). Zero é sem acordo. */
  deliveryDays: number;
  /** O que ficou combinado em uma frase: onde descarregar, com quem falar. */
  agreementNote: string;
  /**
   * A faixa aceitável de cada grandeza medida aqui, por `kind`.
   *
   * Vazio é o caso normal: o lugar recebe leitura e não julga nada. O aplicativo
   * não sabe qual é a temperatura boa da câmara de outra pessoa, e chutar -18
   * porque é o número comum de freezer seria inventar o que ele não mediu.
   */
  sensorRanges: Record<string, SensorRange>;
};

/**
 * Os lugares cadastrados, incluindo o que nasceu sem nome.
 *
 * O padrão é gravado com `name` vazio de propósito, e continua assim: o nome
 * dele é uma palavra em três idiomas, e essa palavra é da tela. Aqui devolve-se
 * o fato — string vazia e `isDefault` — e quem fala português é quem desenha.
 */
/** Uma transportadora: nome, telefone, e se ainda está em uso. */
export type Carrier = {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  active: boolean;
};

/**
 * As transportadoras da empresa, as em uso primeiro.
 *
 * Sem portão de leitura: nome de transportadora não é dinheiro. Quem NÃO pode
 * cadastrar é outra pergunta, e ela é respondida no `saveCarrier` — do mesmo jeito
 * que o lugar.
 */
export async function listCarriers(companyId: string): Promise<Carrier[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    name: string;
    phone: string | null;
    note: string | null;
    active: number;
  }>(
    `SELECT id, name, phone, note, active FROM carriers
      WHERE company_id = ? ORDER BY active DESC, name`,
    [companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    note: r.note,
    active: r.active === 1,
  }));
}

/**
 * Cadastra ou corrige uma transportadora.
 *
 * **O portão é o mesmo do lugar, e pelo mesmo motivo.** A política
 * `carriers_manage` exige `manage_company` no servidor; sem a checagem aqui, o
 * celular emprestado cadastraria a transportadora, a linha entraria na fila, e o
 * servidor a recusaria — travando tudo o que viesse atrás. É a quinta aparição da
 * fila travada, e desta vez ela nem chega a acontecer.
 *
 * **Não apaga, inativa.** O que a transportadora levou continua no livro-razão, e
 * um `DELETE` levaria a chave estrangeira do movimento com ele. Sair de uso é
 * `active = 0`, e a lista de escolha só oferece as em uso.
 */
export async function saveCarrier(
  companyId: string,
  input: { id?: string; name: string; phone?: string; note?: string; active?: boolean },
): Promise<Carrier> {
  await exigirCapacidade(companyId, 'manage_company', 'cadastrar transportadora');
  const nome = input.name.trim();
  if (!nome) throw new Error('transportadora: sem nome não é transportadora');

  const conn = await db();
  const id = input.id ?? newId();
  const at = nowIso();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO carriers (id, company_id, name, phone, note, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         phone = excluded.phone,
         note = excluded.note,
         active = excluded.active`,
      [
        id,
        companyId,
        nome,
        input.phone?.trim() ? input.phone.trim() : null,
        input.note?.trim() ? input.note.trim() : null,
        input.active === false ? 0 : 1,
        at,
      ],
    );
    await enqueue(conn, [{ table: 'carriers', rowId: id }]);
  });

  return {
    id,
    name: nome,
    phone: input.phone?.trim() ? input.phone.trim() : null,
    note: input.note?.trim() ? input.note.trim() : null,
    active: input.active !== false,
  };
}

export async function listPlaces(companyId: string): Promise<Place[]> {
  const conn = await db();
  await ensureLocation(conn, companyId);
  const rows = await conn.getAllAsync<{
    id: string;
    name: string;
    kind: string;
    contact_phone: string | null;
    delivery_days: number | null;
    agreement_note: string | null;
    sensor_ranges: string;
  }>(
    `SELECT id, name, kind, contact_phone, delivery_days, agreement_note, sensor_ranges
       FROM locations WHERE company_id = ? ORDER BY kind, name`,
    [companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    isDefault: r.id === defaultLocationId(companyId),
    contactPhone: r.contact_phone ?? '',
    deliveryDays: r.delivery_days ?? 0,
    agreementNote: r.agreement_note ?? '',
    sensorRanges: parseSensorRanges(r.sensor_ranges),
  }));
}

/**
 * Cadastra ou renomeia um lugar.
 *
 * Renomear é seguro sem cerimônia nenhuma, e é por causa da fundação: o saldo é
 * a soma dos movimentos, e nenhum movimento carrega o nome do lugar - carrega o
 * id. Trocar "Loja Centro" por "Loja da Praça" não move um centavo, exatamente
 * como corrigir o nome de um insumo já não movia.
 */
/**
 * O que um lugar paga por cada coisa, e o que a fábrica pede por ela.
 *
 * Uma linha por item vendável — vendável é o item que TEM preço de tabela, e é o
 * nulo daquela coluna que define isso, não a tabela em que ela mora. O combinado
 * vence a tabela quando existe, e as duas vêm juntas porque a tela precisa mostrar
 * o combinado ao lado do que ele substitui: número sozinho não decide nada (Lei 3).
 */
export type SalePrice = {
  itemId: string;
  name: string;
  baseUnit: string;
  /** O preço de tabela. Nulo é "não vendemos isto". */
  listRate: Rate | null;
  /** O combinado com ESTE lugar. Nulo é "vale a tabela". */
  agreedRate: Rate | null;
  /** Quando o combinado mudou pela última vez, e de quanto veio. */
  previousRate: Rate | null;
  changedAt: string | null;
};

/**
 * O acordo comercial de um lugar — e o portão aqui é `manage_company`, não
 * `view_sale_price`.
 *
 * Parece o portão errado e é o certo, pelo motivo que o `access.ts` já escreve: a
 * capacidade diz O QUE se pode ver, nunca QUAIS LINHAS. Cinco dos sete papéis têm
 * `view_sale_price` — com ela como portão, o gerente de uma loja leria quanto a
 * outra paga. Custo não tem esse problema porque há UM custo; preço combinado é uma
 * linha por parte, e por isso precisa de escopo.
 *
 * Escopo de verdade pede uma coluna que amarre a conta a um lugar, e `memberships`
 * não tem nenhuma. Enquanto ela não existir, quem administra vê o acordo de todo
 * mundo e mais ninguém vê o de ninguém — mais estreito do que o produto quer, e
 * estreito é o lado seguro de errar. A política do servidor (`0037`) diz o mesmo.
 */
export async function salePricesFor(companyId: string, placeId: string): Promise<SalePrice[]> {
  if (!(await currentCapabilities(companyId)).has('manage_company')) return [];

  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    base_unit: string;
    list_rate: number | null;
    agreed_rate: number | null;
    previous_rate: number | null;
    changed_at: string | null;
  }>(
    `SELECT i.id AS item_id, i.name, i.base_unit,
            i.sale_price_rate AS list_rate,
            p.price_rate AS agreed_rate,
            -- rowid no desempate, e não é detalhe: dois acordos combinados no
            -- mesmo segundo empatam em observed_at, e aí "de quanto veio" sai pela
            -- ordem que o SQLite quiser. Foi o teste que pegou, e é a mesma forma
            -- que itemMovements já usa pelo mesmo motivo.
            (SELECT h.previous_rate FROM sale_price_history h
              WHERE h.company_id = i.company_id AND h.item_id = i.id
                AND h.location_id = ?
              ORDER BY h.observed_at DESC, h.rowid DESC LIMIT 1) AS previous_rate,
            (SELECT h.observed_at FROM sale_price_history h
              WHERE h.company_id = i.company_id AND h.item_id = i.id
                AND h.location_id = ?
              ORDER BY h.observed_at DESC, h.rowid DESC LIMIT 1) AS changed_at
       FROM items i
       LEFT JOIN location_prices p
              ON p.item_id = i.id AND p.company_id = i.company_id AND p.location_id = ?
      WHERE i.company_id = ?
        AND i.active = 1
        AND i.kind IN ('product', 'resale')
      ORDER BY i.name COLLATE NOCASE`,
    [placeId, placeId, placeId, companyId],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    baseUnit: r.base_unit,
    listRate: r.list_rate === null ? null : (r.list_rate as Rate),
    agreedRate: r.agreed_rate === null ? null : (r.agreed_rate as Rate),
    previousRate: r.previous_rate === null ? null : (r.previous_rate as Rate),
    changedAt: r.changed_at,
  }));
}

/**
 * Combina um preço — e escreve a HISTÓRIA no mesmo ato.
 *
 * As duas escritas numa transação só, porque separá-las é como o histórico deixa de
 * existir: a linha corrente é sobrescrita, o append falha, e "por quanto vendíamos
 * em março" some sem ninguém saber. Preço digitado à mão não tem nota atrás dele —
 * esta série é a ÚNICA fonte, e é por isso que ela não pode ser sobrescrita nem
 * perdida.
 *
 * `placeId` nulo é o preço de TABELA, no item. Uma função para as duas porque a
 * regra é uma só: o que muda vira linha na história, o que não muda não vira nada.
 *
 * `rate` nulo tira o preço. Tirar também é história — a loja que deixou de ter
 * acordo passa a pagar a tabela, e o dia em que isso mudou é a mesma pergunta.
 */
export async function saveSalePrice(
  companyId: string,
  input: { itemId: string; placeId: string | null; rate: Rate | null },
): Promise<void> {
  await exigirCapacidade(companyId, 'manage_company', 'combinar preço');
  // Zero não é preço, e a checagem impede aqui pelo mesmo motivo que o servidor
  // impede lá: mercadoria dada é movimento SEM preço, e um zero guardado viraria
  // "não havia acordo" na primeira leitura.
  if (input.rate !== null && !(input.rate > 0)) {
    throw new Error('preço: zero não é preço — mercadoria dada é carga sem preço');
  }

  const conn = await db();
  const at = nowIso();

  await conn.withTransactionAsync(async () => {
    const antes = input.placeId
      ? await conn.getFirstAsync<{ price_rate: number }>(
          `SELECT price_rate FROM location_prices
            WHERE company_id = ? AND location_id = ? AND item_id = ?`,
          [companyId, input.placeId, input.itemId],
        )
      : await conn.getFirstAsync<{ price_rate: number | null }>(
          `SELECT sale_price_rate AS price_rate FROM items WHERE id = ? AND company_id = ?`,
          [input.itemId, companyId],
        );
    const anterior = antes?.price_rate ?? null;

    // Salvar sem trocar o número não é história: é ruído com data. A mesma regra
    // que o razão tem para linha que não move nada.
    if (anterior === input.rate) return;

    if (input.placeId === null) {
      await conn.runAsync(`UPDATE items SET sale_price_rate = ? WHERE id = ? AND company_id = ?`, [
        input.rate,
        input.itemId,
        companyId,
      ]);
      await enqueue(conn, [{ table: 'items', rowId: input.itemId }]);
    } else if (input.rate === null) {
      const linha = await conn.getFirstAsync<{ id: string }>(
        `SELECT id FROM location_prices
          WHERE company_id = ? AND location_id = ? AND item_id = ?`,
        [companyId, input.placeId, input.itemId],
      );
      if (linha) {
        await conn.runAsync(`DELETE FROM location_prices WHERE id = ?`, [linha.id]);
        // A fila não sabe apagar linha: o servidor tem `erase` por ÁREA e upsert por
        // id, e nada entre os dois. Fica registrado como fronteira em vez de virar
        // uma linha que atravessa e não faz nada — quando o caminho de apagar
        // existir, é aqui que ele entra.
      }
    } else {
      const existente = await conn.getFirstAsync<{ id: string }>(
        `SELECT id FROM location_prices
          WHERE company_id = ? AND location_id = ? AND item_id = ?`,
        [companyId, input.placeId, input.itemId],
      );
      const id = existente?.id ?? newId();
      await conn.runAsync(
        `INSERT INTO location_prices (id, company_id, location_id, item_id, price_rate, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (company_id, location_id, item_id)
         DO UPDATE SET price_rate = excluded.price_rate`,
        [id, companyId, input.placeId, input.itemId, input.rate, at],
      );
      await enqueue(conn, [{ table: 'location_prices', rowId: id }]);
    }

    // E a história, sempre — inclusive quando o preço foi TIRADO. `new_rate` não
    // aceita nulo no esquema (preço que não é preço não entra), então tirar o
    // acordo é registrado como a volta ao preço de tabela, que é o que de fato
    // passa a valer.
    const novo = input.rate ?? (await precoDeTabela(conn, companyId, input.itemId));
    if (novo !== null && novo !== anterior) {
      const idH = newId();
      await conn.runAsync(
        `INSERT INTO sale_price_history
           (id, company_id, item_id, location_id, previous_rate, new_rate, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idH, companyId, input.itemId, input.placeId, anterior, novo, at],
      );
      await enqueue(conn, [{ table: 'sale_price_history', rowId: idH }]);
    }
  });
}

/** O preço de tabela cru, para a história saber ao que se volta. */
async function precoDeTabela(conn: Db, companyId: string, itemId: string): Promise<number | null> {
  const linha = await conn.getFirstAsync<{ sale_price_rate: number | null }>(
    `SELECT sale_price_rate FROM items WHERE id = ? AND company_id = ?`,
    [itemId, companyId],
  );
  return linha?.sale_price_rate ?? null;
}

export async function savePlace(
  companyId: string,
  input: {
    id?: string;
    name: string;
    kind: string;
    /** A ficha de acordo. Ausente é "não mexa no que já estava combinado". */
    contactPhone?: string;
    deliveryDays?: number;
    agreementNote?: string;
    /** A faixa de cada grandeza. Ausente é "não mexa"; objeto vazio apaga. */
    sensorRanges?: Record<string, SensorRange>;
    /**
     * Em que unidade de fábrica esta sala fica. Nulo é o nível da empresa.
     *
     * Vem de fora e não é deduzido aqui porque quem sabe onde o aparelho está é
     * `src/data/unidade.ts`, e esta camada não pode importá-lo — ele importa
     * daqui. A tela passa; a guarda `every screen that creates a room says which
     * unit` recusa quem esquecer, e esquecer é o defeito calado: sala sem pai fica
     * fora do saldo da unidade, e o número cai sem nada acusar.
     */
    parentLocationId?: string | null;
  },
): Promise<Place> {
  /**
   * Quem não administra a empresa não cadastra lugar — e o aparelho recusa ANTES.
   *
   * **A quinta aparição da fila travada, e desta vez o servidor já estava certo.**
   * A política `locations_manage` exige `manage_company` desde a fundação, e o
   * papel `operator` não a tem. O aparelho não conferia nada: o celular
   * emprestado cadastrava uma loja, a linha entrava na fila, e o servidor a
   * recusaria no dia em que a sincronia subisse — travando tudo o que a fábrica
   * gravasse depois, com a causa três meses atrás.
   *
   * O `db:verify` já documenta a quarta aparição desta família na checagem 11, e
   * a resposta dela foi abrir exceção para a linha de escrituração do próprio
   * sistema (o lugar padrão, que `ensureLocation` cria no primeiro movimento de
   * qualquer aparelho). O que ficou de fora foi o caso do meio: um lugar que uma
   * PESSOA cadastra sem poder.
   *
   * A recusa é a mesma forma do `savePerson`: capacidade conferida na camada de
   * dados, e a tela escrevendo a frase. Erro que IMPEDE, não que reclama.
   */
  await exigirCapacidade(companyId, 'manage_company', 'cadastrar ou renomear lugar');

  const name = input.name.trim();
  if (!name) throw new Error('um lugar sem nome não se distingue de outro');

  const conn = await db();
  const id = input.id ?? newId();

  // Um acordo fora da semana é erro de digitação, e o servidor recusa por
  // restrição. Recusar aqui também é o que impede a fila de sair para morrer
  // do outro lado, com a pessoa achando que gravou.
  const days = Math.trunc(input.deliveryDays ?? 0);
  if (days < 0 || days > 127) throw new Error('a semana tem sete dias');

  const anterior = input.id
    ? await conn.getFirstAsync<{
        contact_phone: string | null;
        delivery_days: number | null;
        agreement_note: string | null;
        sensor_ranges: string | null;
        parent_location_id: string | null;
      }>(
        `SELECT contact_phone, delivery_days, agreement_note, sensor_ranges, parent_location_id
           FROM locations WHERE id = ?`,
        [id],
      )
    : null;

  const phone = input.contactPhone ?? anterior?.contact_phone ?? '';
  const deliveryDays = input.deliveryDays === undefined ? (anterior?.delivery_days ?? 0) : days;
  const note = input.agreementNote ?? anterior?.agreement_note ?? '';
  const ranges =
    input.sensorRanges === undefined
      ? (anterior?.sensor_ranges ?? '{}')
      : JSON.stringify(input.sensorRanges);

  /**
   * O pai só existe para sala INTERNA, e nunca é a própria linha.
   *
   * Loja própria e cliente não ficam dentro de uma fábrica — ficam no mundo —, e
   * uma unidade não fica dentro de outra. Filtrar aqui em vez de confiar em quem
   * chama é o que impede um `own_store` de virar filho de uma unidade e sair do
   * lugar certo em toda consulta de carga.
   */
  /**
   * E ausente é "não mexa", como o telefone e a nota logo acima.
   *
   * **Sem esta linha o conserto viraria defeito:** três das quatro chamadas desta
   * tela ATUALIZAM um lugar — renomear, gravar acordo, gravar faixa de sensor — e
   * nenhuma delas fala de unidade. Com o `ON CONFLICT DO UPDATE` escrevendo o pai,
   * renomear uma câmara fria a tiraria da unidade, e o saldo dela sumiria do
   * pedido. Calado, e no ato mais inofensivo que a tela tem.
   */
  const paiPedido =
    input.parentLocationId === undefined
      ? (anterior?.parent_location_id ?? null)
      : input.parentLocationId;
  const pai =
    paiPedido && paiPedido !== id && ehSalaDeUnidade(input.kind) ? paiPedido : null;

  await conn.withTransactionAsync(async () => {
    // A unidade padrão pode ainda NÃO EXISTIR — ela nasce no primeiro movimento, e
    // cadastrar uma câmara fria antes de qualquer movimento é o caminho normal de
    // um aparelho novo. Sem esta linha a chave estrangeira recusa e a tela cai com
    // "FOREIGN KEY constraint failed", que não é frase para ninguém. Foi um teste
    // desta suíte que achou, no minuto seguinte a eu escrever o pai.
    if (pai === defaultLocationId(companyId)) await ensureLocation(conn, companyId);
    await conn.runAsync(
      `INSERT INTO locations
         (id, company_id, name, kind, created_at, contact_phone, delivery_days, agreement_note,
          sensor_ranges, parent_location_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         kind = excluded.kind,
         contact_phone = excluded.contact_phone,
         delivery_days = excluded.delivery_days,
         agreement_note = excluded.agreement_note,
         sensor_ranges = excluded.sensor_ranges,
         parent_location_id = excluded.parent_location_id`,
      [id, companyId, name, input.kind, nowIso(), phone, deliveryDays, note, ranges, pai],
    );
    await enqueue(conn, [{ table: 'locations', rowId: id }]);
  });

  return {
    id,
    name,
    kind: input.kind,
    isDefault: id === defaultLocationId(companyId),
    contactPhone: phone,
    deliveryDays,
    agreementNote: note,
    sensorRanges: parseSensorRanges(ranges),
  };
}

/**
 * Quanto foi da última vez, para o campo não nascer vazio.
 *
 * Lei 1: não se pergunta o que o sistema pode deduzir, e Lei 2: nenhum campo
 * nasce vazio. A primeira remessa de um produto para uma loja não tem palpite
 * nenhum, e é honesto que não tenha - mas da segunda em diante o livro-razão já
 * sabe, e quem carrega a caixa confirma em vez de digitar.
 *
 * Lê a perna de **entrada** no destino, e não a saída na origem, porque é a
 * quantidade que aquela loja recebeu que responde "quanto costuma ir para lá".
 */
export async function lastSentBaseUnits(
  companyId: string,
  itemId: string,
  toLocationId: string,
): Promise<number | null> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ q: number }>(
    `SELECT quantity_base_units AS q FROM movements m
      WHERE company_id = ? AND item_id = ? AND location_id = ?
        AND kind = 'transfer' AND quantity_base_units > 0
        AND ${NAO_ESTORNADO}
      ORDER BY occurred_at DESC, recorded_at DESC LIMIT 1`,
    [companyId, itemId, toLocationId],
  );
  return row?.q ?? null;
}

/**
 * O que foi estornado não aconteceu — para quem pergunta o que aconteceu.
 *
 * As duas linhas continuam no livro-razão, e é isso que a fundação exige: nada
 * é apagado, o histórico responde por si. Mas "quanto saiu do tacho hoje" é
 * outra pergunta, e uma corrida corrigida responde zero a ela. Sem este
 * pedaço, o estorno acerta o SALDO (que é soma pura e não olha `kind`) e deixa
 * todas as telas de "o que aconteceu" dizendo o número velho: o almoxarifado
 * certo e a produção mentindo, no mesmo aplicativo.
 *
 * Constante e não função de apelido: as oito consultas chamam a tabela de `m`,
 * e montar SQL por interpolação — mesmo com um apelido que nunca veio de fora —
 * é o padrão que a proofgate marca, com razão. Consulta que precisar de outro
 * apelido escreve a sua, à vista.
 */
/**
 * O filtro de estorno, para o apelido que a consulta usar.
 *
 * O `alias` é sempre um literal deste arquivo — `'m'` ou `'m2'` — e nunca chega
 * de fora: não há caminho da tela, da fila nem do servidor até aqui. A alternativa
 * era a que existia antes, `NAO_ESTORNADO.replaceAll('m.', 'm2.')`, que é
 * substituição cega de texto dentro de SQL e quebraria em silêncio no dia em que
 * uma coluna começasse com "m.".
 */
const naoEstornado = (alias: string) =>
  `NOT EXISTS (SELECT 1 FROM movements rev WHERE rev.reverses_movement_id = ${alias}.id AND rev.company_id = ${alias}.company_id)`; // proofgate-allow: `alias` é literal deste arquivo, nunca entrada

const NAO_ESTORNADO = naoEstornado('m');

export type PlaceStock = {
  locationId: string;
  locationName: string;
  kind: string;
  /**
   * Quanto vale tudo o que está ali, somado uma vez só, no fim — e `null` quando
   * quem está com o aparelho não vê dinheiro.
   *
   * Nulo e não zero porque a tela da loja decidia pela PRESENÇA do objeto, não
   * pelo número: com zero ela escrevia "vale R$ 0,00" embaixo de cada item de uma
   * loja cheia. O tipo é o que impede — quem quiser somar tem que dizer o que faz
   * com o nulo.
   */
  valueCents: Cents | null;
  lines: {
    itemId: string;
    name: string;
    /** A espécie, para quem desenha poder pôr o provável na frente. */
    kind: string;
    baseUnits: number;
    baseUnit: string;
    valueCents: Cents | null;
  }[];
};

/**
 * O saldo de cada lugar, item por item.
 *
 * A mesma soma de `balanceByLocation`, sem o `WHERE` do item: uma tela que
 * pergunta "o que tem na Loja Centro" e uma que pergunta "onde está o açúcar"
 * são a mesma aritmética lida por dois eixos, e ter duas aritméticas seria ter
 * duas verdades.
 *
 * Linha de saldo zero não aparece. Um item que entrou e saiu inteiro não está
 * ali, e listá-lo como "0 g" enche a tela de coisa que não está lá - o que é
 * pior que inútil numa tela cujo trabalho é dizer o que tem.
 */
export async function stockByPlace(companyId: string): Promise<PlaceStock[]> {
  const conn = await db();
  // A checagem antes da consulta: sem `view_cost` a tabela de custo não é
  // juntada, e a sala volta com quantidade e sem valor.
  const dinheiro = (await canSeeMoney(companyId)) ? 1 : 0;
  const rows = await conn.getAllAsync<{
    location_id: string;
    location_name: string;
    kind: string;
    item_id: string;
    item_name: string;
    item_kind: string;
    base_unit: string;
    base_units: number;
    rate: number | null;
  }>(
    `SELECT m.location_id, l.name AS location_name, l.kind,
            m.item_id, i.name AS item_name, i.kind AS item_kind, i.base_unit,
            SUM(m.quantity_base_units) AS base_units,
            c.average_rate AS rate
       FROM movements m
       JOIN locations l ON l.id = m.location_id
       JOIN items i ON i.id = m.item_id
       LEFT JOIN item_costs c ON c.item_id = m.item_id AND ? = 1
      WHERE m.company_id = ?
      GROUP BY m.location_id, l.name, l.kind, m.item_id, i.name, i.packaging, i.base_unit, c.average_rate
     HAVING SUM(m.quantity_base_units) <> 0
      ORDER BY l.kind, l.name, i.name`,
    [dinheiro, companyId],
  );

  const byPlace = new Map<string, PlaceStock>();
  for (const r of rows) {
    let place = byPlace.get(r.location_id);
    if (!place) {
      place = {
        locationId: r.location_id,
        locationName: r.location_name,
        kind: r.kind,
        valueCents: dinheiro === 1 ? cents(0) : null,
        lines: [],
      };
      byPlace.set(r.location_id, place);
    }
    // Quem arredonda é `amountOf`, e só ele.
    //
    // Este comentário dizia "arredondada aqui e só aqui" enquanto a linha
    // chamava `cents` — e `amountOf` está importado na primeira linha deste
    // arquivo, dizendo de si a mesma coisa. Dois autores do mesmo
    // arredondamento, com o mesmo resultado hoje, e é essa igualdade que
    // esconde o defeito: o risco não é o valor de agora, é existir um segundo
    // lugar para consertar quando a regra mudar. Neste projeto o `mutate` já
    // trocou o `Math.round` do `amountOf` por `Math.floor` e noventa e dois
    // testes seguiram verdes.
    //
    // Sem portão a taxa não veio, e o valor não existe — em vez de valer zero.
    const value = dinheiro === 1 ? amountOf((r.rate ?? 0) as Rate, r.base_units) : null;
    place.lines.push({
      itemId: r.item_id,
      name: r.item_name,
      /** A espécie, para quem desenha poder pôr o provável na frente. */
      kind: r.item_kind,
      baseUnits: r.base_units,
      baseUnit: r.base_unit,
      valueCents: value,
    });
    if (place.valueCents !== null && value !== null) {
      place.valueCents = cents(place.valueCents + value);
    }
  }

  return [...byPlace.values()];
}

/**
 * O lugar que existe desde sempre, nomeável pelo chamador.
 *
 * Enquanto há um lugar só, o id dele é o da própria empresa - foi assim que
 * todo movimento já gravado foi carimbado. Expor isto é o que permite exigir
 * `locationId` de quem conta sem obrigar cada tela a saber desse detalhe.
 */
export function defaultLocationId(companyId: string): string {
  return companyId;
}

async function ensureLocation(conn: Db, companyId: string): Promise<string> {
  const existing = await conn.getFirstAsync<{ id: string }>(
    `SELECT id FROM locations WHERE id = ?`,
    [companyId],
  );
  if (existing) return existing.id;

  await conn.runAsync(
    // FÁBRICA, e não almoxarifado: a tela titula esta sala como "Fábrica" desde
    // sempre, e lia `store_room` para a sobrelinha — um cartão dizendo as duas
    // coisas. Ver a V23 do esquema, que conserta quem já instalou.
    `INSERT INTO locations (id, company_id, name, kind, created_at)
     VALUES (?, ?, '', 'factory', ?)`,
    [companyId, companyId, nowIso()],
  );
  // It has to reach the server before the movement that stands on it does, or
  // the first sync fails a foreign key on a row nobody knew was missing. It
  // queues once, on the day the first thing moves, and never again.
  await enqueue(conn, [{ table: 'locations', rowId: companyId }]);

  return companyId;
}

/**
 * Records a physical count.
 *
 * Until this existed a balance in this app could only rise. Purchases added and
 * nothing ever took away, so "how much sugar do I have" was right exactly once,
 * on the morning the sack arrived. A storeroom number that only grows is worse
 * than no number at all, because people believe it.
 *
 * The count does not overwrite the balance - nothing here overwrites a balance.
 * It appends the difference as its own movement, so the shelf and the ledger
 * agree from this moment on while the disagreement stays on the record. That is
 * what turns "we keep losing sugar" from a feeling into a question the data can
 * answer.
 *
 * A count that finds exactly what was expected is written too, with a
 * difference of zero. Somebody looked, and the storeroom was right: that is
 * information. Discarding it would leave a shelf nobody has checked in months
 * indistinguishable from one verified this morning.
 */
export async function recordCount(
  companyId: string,
  input: {
    itemId: string;
    countedBaseUnits: number;
    note?: string;
    /**
     * The phrase somebody said, when this came from the assistant.
     *
     * The plan's own condition for letting an assistant write at all: every
     * movement it creates is marked as such, with the words that created it. A
     * ledger that cannot say "this one came from a sentence" makes autonomy
     * unauditable, and unauditable autonomy is what people stop trusting.
     * Null when a person filled the screen themselves.
     */
    assistantPhrase?: string;

    /** Defaults to now. A count written on paper in a cold room keeps its hour. */
    occurredAt?: string;

    /**
     * Which shelf was counted. Required, and deliberately without a default.
     *
     * A count is the one figure that comes from somebody standing in front of
     * the goods, so it belongs to a place. With a default, counting the cold
     * room without saying so would compare against the company's whole balance
     * and write the difference into the cold room - stock teleported between
     * rooms by an operator who did everything right. The rule of this project
     * is that the error is prevented, not complained about: the caller says
     * where, or it does not compile.
     */
    locationId: string;
  },
): Promise<CountResult> {
  // A contagem escreve `adjustment` OU `sale`, e as duas pedem `adjust_stock` — a
  // venda por causa da 0047, que abriu essa porta de propósito para quem conta.
  await podeGravar(companyId, 'adjustment');
  const conn = await db();
  const at = nowIso();

  const held = await conn.getFirstAsync<{ base_units: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS base_units
       FROM movements WHERE company_id = ? AND item_id = ? AND location_id = ?`,
    [companyId, input.itemId, input.locationId],
  );
  const cost = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );

  const expected = held?.base_units ?? 0;
  const counted = Math.round(input.countedBaseUnits);
  const averageRate = (cost?.average_rate ?? 0) as Rate;
  const delta = counted - expected;

  /**
   * O que a falta SIGNIFICA depende da espécie da prateleira — e é a espécie que
   * responde, nunca o id.
   *
   * **Esta é a peça que faltava para a margem existir, e ela não é um campo novo.**
   * `movement_kind` tem `sale` desde a `0001` com a intenção escrita ao lado, e
   * atravessou quarenta e seis migrações sem um único escritor. O razão sabia o que a
   * fábrica produziu e para que loja mandou, e perdia o picolé de vista ali: se ele
   * foi vendido, derreteu ou está no freezer, o aplicativo não tinha como saber. Sem
   * esse fato o custo congelado e o preço combinado existem, e o que fica entre os
   * dois não.
   *
   * **A contagem é o caminho mais barato para descobri-lo, e ele já estava
   * construído.** A alternativa é um ponto de venda na loja: um aparelho, uma tela e
   * uma pessoa tocando nela enquanto atende o cliente. Ele dá a venda no instante em
   * que acontece, e é o que uma rede grande quer. Numa fábrica de seis pessoas o que
   * acontece de verdade é a contagem — que já existe, já vira movimento e já é
   * perguntada toda vez. Então o padrão é este, e o ponto de venda entra depois como
   * configuração de quem o quiser, com a contagem seguindo como conferência em cima
   * dele. É a regra desta casa: *"depende de quem usa"* vira configuração, e o que se
   * decide é o PADRÃO.
   *
   * **E a ordem certa na loja é: lança a perda primeiro, conta depois.** O que
   * derreteu tem tela própria e motivo obrigatório; lançado antes, ele já saiu do
   * saldo esperado, e o que a contagem encontra de falta é o que foi comprado por
   * alguém. Assim o aplicativo não tem de adivinhar a diferença entre venda e perda —
   * quem estava lá já disse, e cada fato mantém o nome dele no razão.
   *
   * Sobra positiva continua sendo `adjustment`, e isso não é descuido: não se
   * desvende. Achar MAIS do que o livro diz é erro de contagem ou chegada não
   * lançada, e chamar isso de venda negativa poria receita inventada no razão.
   */
  const lugar = await conn.getFirstAsync<{ kind: string }>(
    `SELECT kind FROM locations WHERE company_id = ? AND id = ?`,
    [companyId, input.locationId],
  );
  const vendeu = delta < 0 && lugar !== null && vendeAoConsumidor(lugar.kind);

  /**
   * O preço vem SEM portão de permissão, e é a mesma decisão do custo na produção.
   *
   * `salePricesFor` é gateada por `manage_company` porque é uma LEITURA: quem não
   * pode ver o acordo não recebe o número. Aqui não se está mostrando nada — está-se
   * congelando um fato no livro-razão, e o fato não depende de quem estava com o
   * celular. Com o portão no caminho, a contagem feita pelo operador gravaria a venda
   * com preço nulo, a receita do mês sairia menor para quem conta e maior para quem
   * administra, e as duas passariam sem uma reclamação. É exatamente o defeito que
   * quase entrou em `recordProduction` com o custo, e a refutação que o pegou está
   * escrita lá.
   */
  const priceRate = vendeu
    ? await precoPraticado(conn, companyId, input.itemId, input.locationId)
    : null;

  const id = newId();

  await conn.withTransactionAsync(async () => {
    // The place still has to exist as a row before a movement can point at it.
    await ensureLocation(conn, companyId);
    const locationId = input.locationId;

    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate,
                              unit_price_rate,
                              movement_group_id, note, assistant_phrase,
                              operator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        // A espécie é o que muda entre "o mundo discordou do livro" e "alguém
        // comprou". As duas linhas são idênticas em quantidade e sinal, e é só o
        // nome que faz uma virar receita — por isso ele é decidido acima, com a
        // razão escrita, e não aqui no meio dos parâmetros.
        vendeu ? 'sale' : 'adjustment',
        input.occurredAt ?? at,
        at,
        input.itemId,
        delta,
        locationId,
        averageRate || null,
        // O custo congelado responde "quanto isto me custou" e o preço responde
        // "por quanto saiu". Guardar os dois na mesma linha é o que torna a margem
        // uma subtração em vez de uma junção entre o razão e uma tabela que pode
        // ser renegociada amanhã — e renegociar preço em março não pode reescrever
        // o que fevereiro faturou.
        priceRate ?? null,
        // O grupo é a própria linha. Uma contagem é um ato de uma perna, e sem
        // grupo ela não tem como ser DESFEITA: `planReversal` procura pelo grupo,
        // e o que não tem grupo não existe para ele. A fundação diz que se corrige
        // por estorno, nunca por exclusão — sem isto não havia nem uma coisa nem
        // outra, e um zero digitado com o dedo torto ficava no razão para sempre.
        id,
        input.note ?? null,
        input.assistantPhrase ?? null,
        await currentOperatorId(),
      ],
    );
    await enqueue(conn, [{ table: 'movements', rowId: id }]);
  });

  return {
    expectedBaseUnits: expected,
    countedBaseUnits: counted,
    deltaBaseUnits: delta,
    deltaCents: amountOf(averageRate, delta),
    sold: vendeu
      ? {
          baseUnits: -delta,
          priceRate,
          // Arredonda aqui, uma vez, e só o valor final: a taxa continua fracionária
          // na coluna. `amountOf` é o único ponto de arredondamento do sistema.
          revenueCents: priceRate === null ? null : amountOf(priceRate, -delta),
        }
      : null,
  };
}

/**
 * Por quanto este lugar vende este item — o combinado, e a tabela quando não houver.
 *
 * Duas fontes e uma ordem, e a ordem é a que a `0037` decidiu: o acordo por lugar
 * VENCE o preço de tabela. Sem isso a loja da esquina que negociou R$ 2,00 faturaria
 * pelos R$ 2,20 do catálogo, e a margem dela sairia inflada em dez por cento — para
 * cima, que é o lado perigoso de errar dinheiro.
 *
 * Nulo é resposta: uma fábrica que nunca cadastrou preço nenhum continua podendo
 * contar a prateleira, e a venda entra sem receita. A tela diz isso; o razão não
 * inventa um número.
 */
async function precoPraticado(
  conn: Db,
  companyId: string,
  itemId: string,
  locationId: string,
): Promise<Rate | null> {
  const acordo = await conn.getFirstAsync<{ price_rate: number }>(
    `SELECT price_rate FROM location_prices
      WHERE company_id = ? AND location_id = ? AND item_id = ?`,
    [companyId, locationId, itemId],
  );
  if (acordo) return acordo.price_rate as Rate;

  const tabela = await conn.getFirstAsync<{ sale_price_rate: number | null }>(
    `SELECT sale_price_rate FROM items WHERE company_id = ? AND id = ?`,
    [companyId, itemId],
  );
  const daTabela = tabela?.sale_price_rate;
  return daTabela === null || daTabela === undefined ? null : (daTabela as Rate);
}

/**
 * The movements behind one item's balance, newest first.
 *
 * This is the `[por quê?]` of a stock figure. A number the person cannot open
 * is a number they have to take on faith, and faith is exactly what an app
 * asking someone to change how they run their factory has not earned yet.
 */
export async function itemMovements(
  companyId: string,
  itemId: string,
  limit = 20,
  /**
   * A sala, quando a pergunta é de uma sala.
   *
   * Sem ela a lista é da empresa — e uma tela que mostra o saldo de uma sala
   * dizendo "conferido em 3/9" com a conferência de OUTRA sala está afirmando
   * que a prateleira daqui foi olhada quando ninguém a olhou.
   *
   * `{ unidade }` é a mesma frase um andar acima: o assistente, respondendo
   * *"quando o açúcar foi conferido?"* sem escopo, contaria a conferência da outra
   * cidade — e é pior que na tela, porque a resposta chega como uma frase afirmativa
   * sem nada dizendo de onde ela veio.
   */
  onde?: { sala: string } | { unidade: string },
): Promise<MovementRow[]> {
  const conn = await db();
  /**
   * A taxa congelada de cada linha do razão — e nenhuma tela a desenha hoje.
   *
   * O portão entra aqui de qualquer jeito, e é a fundação que manda: *"esconder
   * botão é decoração"*. O número CHEGAVA ao componente (`app/inputs/[id].tsx`
   * carrega estas linhas no estado) e o que impedia o vazamento era ninguém ter
   * escrito o `<Text>`. No dia em que alguém desenhar o `[por quê?]` do saldo — que é
   * literalmente o que este campo é — o vazamento nasceria pronto.
   */
  const dinheiro = (await canSeeMoney(companyId)) ? 1 : 0;
  const recorte = noEscopo('m.location_id', onde);
  const rows = await conn.getAllAsync<{
    id: string;
    kind: string;
    quantity_base_units: number;
    unit_cost_rate: number | null;
    note: string | null;
    occurred_at: string;
    movement_group_id: string | null;
    reversed: number;
  }>(
    // O `EXISTS` usa o índice parcial `movements_reversal_idx`, criado justo para
    // ele: sem índice, perguntar "isto foi estornado?" por linha é uma varredura
    // do razão inteiro por linha, e a capa abria em dez segundos com dois anos de
    // fábrica.
    `SELECT m.id, m.kind, m.quantity_base_units,
            CASE WHEN ? = 1 THEN m.unit_cost_rate END AS unit_cost_rate,
            m.note, m.occurred_at,
            m.movement_group_id,
            EXISTS (SELECT 1 FROM movements r
                     WHERE r.reverses_movement_id = m.id AND r.company_id = m.company_id) AS reversed
       FROM movements m
      WHERE m.company_id = ? AND m.item_id = ?
        AND ${recorte.sql}
      ORDER BY m.occurred_at DESC, m.rowid DESC
      LIMIT ?`,
    [dinheiro, companyId, itemId, ...recorte.params, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    baseUnits: r.quantity_base_units,
    unitCostRate: r.unit_cost_rate === null ? null : (r.unit_cost_rate as Rate),
    note: r.note,
    occurredAt: r.occurred_at,
    groupId: r.movement_group_id,
    reversed: r.reversed === 1,
  }));
}

// --- recipes ----------------------------------------------------------------

export type RecipeSummary = { id: string; name: string; yieldAmount: number; yieldUnit: string };

export async function listRecipes(companyId: string): Promise<RecipeSummary[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    name: string;
    yield_amount: number;
    yield_unit: string;
  }>(
    `SELECT id, name, yield_amount, yield_unit FROM recipes
      WHERE company_id = ? AND active = 1 ORDER BY name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    yieldAmount: r.yield_amount,
    yieldUnit: r.yield_unit,
  }));
}

/**
 * Loads every recipe at its newest version, keyed by id - the shape
 * `costRecipe` walks. Loading them all at once is what lets a sub-recipe
 * resolve without a second round trip mid-calculation.
 */
export async function loadRecipeGraph(companyId: string): Promise<Record<string, Recipe>> {
  const conn = await db();

  const versions = await conn.getAllAsync<{
    id: string;
    recipe_id: string;
    version: number;
    effective_from: string;
    loss_fraction: number;
    yield_amount: number;
    yield_unit: string;
  }>(
    `SELECT v.id, v.recipe_id, v.version, v.effective_from, v.loss_fraction, r.yield_amount,
            r.yield_unit
       FROM recipe_versions v
       JOIN recipes r ON r.id = v.recipe_id
      WHERE v.company_id = ?
        AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2 WHERE v2.recipe_id = v.recipe_id)`,
    [companyId],
  );

  if (versions.length === 0) return {};

  const lines = await conn.getAllAsync<{
    recipe_version_id: string;
    item_id: string | null;
    sub_recipe_id: string | null;
    quantity: number;
  }>(
    `SELECT recipe_version_id, item_id, sub_recipe_id, quantity
       FROM recipe_lines WHERE company_id = ? ORDER BY position`,
    [companyId],
  );

  const byVersion = new Map<string, RecipeLine[]>();
  for (const line of lines) {
    const list = byVersion.get(line.recipe_version_id) ?? [];
    list.push(
      line.item_id
        ? { kind: 'item', itemId: line.item_id, quantity: line.quantity }
        : { kind: 'recipe', recipeId: line.sub_recipe_id!, quantity: line.quantity },
    );
    byVersion.set(line.recipe_version_id, list);
  }

  return Object.fromEntries(
    versions.map((v) => [
      v.recipe_id,
      {
        id: v.recipe_id,
        versionId: v.id,
        version: v.version,
        effectiveFrom: v.effective_from,
        yieldAmount: v.yield_amount,
        yieldUnit: v.yield_unit,
        lossFraction: v.loss_fraction,
        lines: byVersion.get(v.id) ?? [],
      } satisfies Recipe,
    ]),
  );
}

/**
 * Saves a recipe as a NEW version rather than editing the old one.
 *
 * Versions are never overwritten: a production run records which version it
 * used, so changing the formula today must not rewrite what last year's batches
 * cost.
 */
export async function saveRecipeVersion(
  companyId: string,
  input: {
    recipeId?: string;
    name: string;
    yieldAmount: number;
    yieldUnit: string;
    lossFraction: number;
    lines: RecipeLine[];
    note?: string;
  },
): Promise<{ recipeId: string; version: number }> {
  const conn = await db();
  const at = nowIso();
  const recipeId = input.recipeId ?? newId();
  const versionId = newId();
  const lineIds: string[] = [];
  let version = 1;

  // A version without its lines is a recipe that costs nothing, which is worse
  // than no version at all - so the whole thing is one transaction.
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO recipes (id, company_id, name, yield_amount, yield_unit, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         yield_amount = excluded.yield_amount,
         yield_unit = excluded.yield_unit`,
      [recipeId, companyId, input.name, input.yieldAmount, input.yieldUnit, at],
    );

    const previous = await conn.getFirstAsync<{ v: number }>(
      `SELECT MAX(version) AS v FROM recipe_versions WHERE recipe_id = ?`,
      [recipeId],
    );
    version = (previous?.v ?? 0) + 1;

    await conn.runAsync(
      `INSERT INTO recipe_versions (id, company_id, recipe_id, version, effective_from,
                                    loss_fraction, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        versionId,
        companyId,
        recipeId,
        version,
        at.slice(0, 10),
        input.lossFraction,
        input.note ?? null,
        at,
      ],
    );

    for (const [position, line] of input.lines.entries()) {
      const lineId = newId();
      lineIds.push(lineId);

      await conn.runAsync(
        `INSERT INTO recipe_lines (id, company_id, recipe_version_id, item_id, sub_recipe_id,
                                   quantity, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          lineId,
          companyId,
          versionId,
          line.kind === 'item' ? line.itemId : null,
          line.kind === 'recipe' ? line.recipeId : null,
          line.quantity,
          position,
        ],
      );
    }

    // The lines go with the version, in order, after it. A version that
    // arrives without them is a recipe that costs nothing on the other device,
    // which is worse than one that has not arrived at all.
    await enqueue(conn, [
      { table: 'recipes', rowId: recipeId },
      { table: 'recipe_versions', rowId: versionId },
      ...lineIds.map((id) => ({ table: 'recipe_lines', rowId: id })),
    ]);
  });

  return { recipeId, version };
}

/** Names for every item and recipe, so a cost breakdown reads in words. */
export async function labels(companyId: string): Promise<Record<string, string>> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ id: string; name: string }>(
    `SELECT id, name FROM items WHERE company_id = ?
     UNION ALL
     SELECT id, name FROM recipes WHERE company_id = ?`,
    [companyId, companyId],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Converts what the buyer typed into base units, using the item's own factor. */
export function purchaseToBaseUnits(item: Item, purchaseQuantity: number): number {
  const factor = item.purchaseToBase ?? 1;
  return Math.round(purchaseQuantity * factor);
}

export { cents };

// --- products ---------------------------------------------------------------

export type ProductionResult = {
  /** O lote que esta corrida criou: o código que vai na etiqueta e a validade. */
  lot: { id: string; code: string; expiresOn: string | null };
  /** O que amarra as linhas deste ato. */
  groupId: string;
  unitsProduced: number;
  /** Custo congelado do produto, por unidade, em taxa fracionária. */
  unitCostRate: Rate;
  consumed: { itemId: string; baseUnits: number; rate: Rate }[];
};

/**
 * Uma corrida de produção: um movimento de entrada e um de saída por insumo.
 *
 * Sete linhas para uma corrida que faz 500 picolés com seis insumos, e não uma.
 * `movements` tem UM `item_id` e uma quantidade assinada, e o saldo é
 * `sum(...) group by empresa, item, local` — sete itens numa linha exigiriam um
 * leitor que abre payload, e o saldo deixaria de ser uma soma. A política do
 * servidor concorda: `movements_append` é um CASE por `kind` sem ELSE, e uma
 * linha não pode ser dois tipos.
 *
 * O custo congela aqui, linha por linha, e é a razão de a corrida existir como
 * evento. No consumo, a média móvel do insumo **naquele instante**. Na produção,
 * a soma exata dos consumos dividida pelas unidades que **de fato** saíram —
 * não pelo rendimento teórico. Se o tacho rendeu 480 onde a ficha prometia 500,
 * congelar o teórico esconderia a perda que acabou de acontecer, e ela é
 * exatamente o número que o dono precisa ver.
 *
 * **A média do PRODUTO é escrita aqui, e essa foi a metade que faltava.**
 *
 * O que este docblock dizia antes está certo no que afirma e errado no que
 * concluía: consumo à taxa média não move a média DO INSUMO, então a corrida
 * não precisa reescrever o custo da polpa. Só que o produto é outro `item_id`,
 * e para ele não existia autor nenhum — nem aqui nem no servidor, cujo gatilho
 * só derivava de `purchase_lines`. Picolé nunca foi comprado, então nunca teve
 * linha em `item_costs`, então valia zero.
 *
 * Zero não ficava numa tela só. `stockByPlace` valorava a loja com 1.466
 * picolés em "R$ 0,00"; a mesma junção valorava o estoque na tela de itens; e
 * `moveBetween` e `recordLoss` congelavam `unit_cost_rate` NULO nas pernas de
 * transferência e nas perdas de produto acabado. O efeito somado é o pior de
 * todos: o insumo SAI do saldo valorado e o produto entra valendo nada, então
 * o dinheiro evaporava do balanço a cada corrida.
 *
 * "Valor derivado tem um autor só" não estava sendo cumprido — estava sendo
 * dispensado. O autor é este, e o servidor tem o espelho dele na migração
 * 0025, pela mesma média móvel: os dois lados concluem, nada de `item_costs`
 * atravessa a fila.
 */
/**
 * Quem está com o aparelho não alcança escrever esta espécie de movimento.
 *
 * **Isto protege a FILA, e não o dado — e a diferença é o motivo de existir.** O
 * SQLite aceita qualquer linha: não tem política, não tem papel, não tem capacidade.
 * O servidor tem `movements_append` e recusa. E `drain` **para na primeira linha
 * recusada** — parar está certo para uma lacuna de dependência, que a tentativa
 * seguinte resolve, e é fatal para uma recusa por permissão, que nenhuma tentativa
 * resolve: a linha fica pendente e tudo o que a fábrica gravar depois fica preso
 * atrás dela.
 *
 * O caso medido em 9 de setembro: `storeManager` e `driver` não têm `adjust_stock`,
 * e o botão de desfazer do extrato não tinha portão nenhum. Um toque do entregador e
 * aquele celular nunca mais sincronizava — **sem erro na tela**, porque no aparelho a
 * linha entrava.
 *
 * A espécie vai dentro para a tela poder dizer o que não deu, em vez de "não foi
 * possível": a Lei 5 quer que o erro impeça e mostre a saída no mesmo gesto.
 */
export class SemPermissaoError extends Error {
  constructor(readonly kind: MovementKind) {
    super(`sem permissão para escrever ${kind}`);
    this.name = 'SemPermissaoError';
  }
}

/**
 * A recusa por capacidade que NÃO é escrita de movimento — cadastrar, configurar, apagar.
 *
 * `SemPermissaoError` responde pela espécie do movimento e não serve aqui: apagar o
 * livro, combinar preço e desligar a entrada compartilhada não são linhas do razão.
 * A capacidade vai dentro pelo mesmo motivo que a espécie vai lá — a tela precisa
 * dizer o que não deu, e a Lei 5 quer o erro impedindo e mostrando a saída no mesmo
 * gesto, em vez de "não foi possível".
 */
/**
 * O piso que não teria saída — e por que ele é recusado em vez de avisado.
 *
 * O piso de capacidade (`pisoDoAparelho`) só rebaixa quando a entrada é
 * compartilhada E o aparelho nomeia quem gravou: aí "ninguém escolhido" quer dizer
 * "ainda não disse quem é", e a saída é tocar o próprio nome na grade. Se não existe
 * uma única pessoa ativa cujo perfil administre a empresa, essa saída não existe: o
 * aparelho entra no piso e ninguém consegue tirá-lo de lá, porque desligar o piso
 * pede justamente a capacidade que o piso tira.
 *
 * Instalação nova tem zero pessoas — a semente não cadastra ninguém —, então o
 * caminho para o tijolo era dois toques em Ajustes. Lei 5: o erro IMPEDE.
 */
export class PisoSemSaidaError extends Error {
  constructor() {
    super('piso: ligar a entrada compartilhada sem ninguém que administre tranca o aparelho');
    this.name = 'PisoSemSaidaError';
  }
}

export class SemAcessoError extends Error {
  constructor(
    readonly capability: Capability,
    readonly assunto: string,
  ) {
    super(`sem ${capability}: ${assunto}`);
    this.name = 'SemAcessoError';
  }
}

/**
 * O portão de administração, e ele mora num lugar só.
 *
 * **Estava copiado em quatro portas e ausente em seis** — medido pela auditoria de 9
 * de setembro. As quatro que tinham (transportadora, preço combinado, lugar, gente)
 * escreviam a mesma linha com frases diferentes; as que não tinham incluíam o Reset,
 * que a decisão do dono de 7 de setembro restringe por nome (*"obviamente q apenas o
 * adm pode fazer isso"*), e os cinco interruptores da empresa — entre eles os DOIS que
 * decidem o piso de capacidade do aparelho. Com eles abertos, quem o piso rebaixava
 * desligava o piso: dois toques devolviam o conjunto do dono, de forma durável e sem
 * PIN.
 *
 * Uma porta só também é o que torna a promessa verificável: `grep exigirCapacidade`
 * responde quem administra o quê, e comentário que se declara único não é o mesmo que
 * ser único.
 */
/**
 * Existe alguém que possa administrar esta empresa pela grade de nomes?
 *
 * É a pergunta que decide se o piso tem saída. Lê o mesmo par de tabelas que
 * `operadorDaEmpresa` e filtra a capacidade em JS pelo mesmo motivo que ele:
 * `capabilities` é texto separado por vírgula, e um `LIKE '%manage_company%'`
 * casaria dentro de uma capacidade maior no dia em que uma nascer.
 */
async function alguemAdministra(companyId: string): Promise<boolean> {
  const conn = await db();
  const linhas = await conn.getAllAsync<{ capabilities: string }>(
    `SELECT p.capabilities
       FROM people g
       JOIN profiles p ON p.id = g.profile_id AND p.company_id = g.company_id
      WHERE g.company_id = ? AND g.active = 1`,
    [companyId],
  );
  return linhas.some((l) => l.capabilities.split(',').includes('manage_company'));
}

async function exigirCapacidade(
  companyId: string,
  capability: Capability,
  assunto: string,
): Promise<void> {
  if (!(await currentCapabilities(companyId)).has(capability)) {
    throw new SemAcessoError(capability, assunto);
  }
}

/**
 * O portão de escrita, e ele roda ANTES de qualquer linha nascer.
 *
 * Mesma forma da fundação de permissão desta casa, virada para a escrita: a checagem
 * vem antes, então não existe linha errada para alguém consertar depois — e aqui
 * "depois" seria uma fila que não anda mais.
 */
async function podeGravar(companyId: string, kind: MovementKind): Promise<void> {
  if (!podeEscrever(kind, await currentCapabilities(companyId))) {
    throw new SemPermissaoError(kind);
  }
}

/**
 * O que faltava quando alguém tentou produzir mais do que dá.
 *
 * Nomeado e com os itens dentro, porque a tela precisa dizer QUAIS faltaram -
 * "faltou insumo" manda a pessoa procurar, e a Lei 5 quer que o erro impeça e
 * mostre a saída no mesmo gesto.
 */
export class NotEnoughStockError extends Error {
  constructor(
    public readonly missing: { itemId: string; name: string; needed: number; held: number }[],
  ) {
    super(`Not enough stock: ${missing.map((m) => m.name).join(', ')}`);
    this.name = 'NotEnoughStockError';
  }
}

export async function recordProduction(
  companyId: string,
  input: {
    /** Qual produto saiu. A receita e o rendimento vêm dele. */
    productId: string;
    /** Onde foi feito, e onde o produto passa a estar. */
    locationId: string;
    /** Quantos tachos foram rodados. É o que decide o consumo. */
    batches: number;
    /**
     * Quantas unidades saíram de verdade.
     *
     * Fato separado do número de tachos, e não dedutível dele: a razão entre os
     * dois É o rendimento real, que é metade do valor de registrar produção.
     */
    unitsProduced: number;
    /**
     * O dia da fábrica em que a corrida aconteceu, como data de calendário.
     *
     * Obrigatório, e sem valor padrão de propósito. O livro-razão guarda um
     * INSTANTE (`occurred_at`); a data do lote é outra coisa - é o dia local, e
     * transformar um no outro precisa do fuso da fábrica, que esta camada não
     * conhece. Derivar aqui seria repetir o defeito que já custou uma rodada:
     * meia-noite de 3 de setembro em Madri é 2 de setembro em UTC, e o lote
     * nasceria com a data de ontem em metade do mundo.
     *
     * Como o `live` do `PulseDot`: exigido em toda chamada para que o fato seja
     * dito por quem o conhece, em vez de adivinhado aqui.
     */
    producedOn: string;
    /** O código do lote, quando a fábrica tem padrão próprio. Sem ele, o nosso. */
    lotCode?: string;
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<ProductionResult> {
  await podeGravar(companyId, 'production');
  const conn = await db();
  const at = nowIso();

  const product = (await listProductsForLedger(companyId)).find((p) => p.id === input.productId);
  if (!product) throw new Error(`produto ${input.productId} não existe`);
  if (!product.recipeId) throw new Error(`${product.name} é revenda: não se produz`);
  if (input.batches <= 0) throw new Error('uma corrida roda a receita pelo menos uma vez');
  if (input.unitsProduced <= 0) throw new Error('uma corrida que não rendeu nada é um erro, não um fato');

  const graph = await loadRecipeGraph(companyId);
  const recipe = graph[product.recipeId];
  if (!recipe) throw new Error(`a receita de ${product.name} não está no aparelho`);

  /**
   * As taxas vêm SEM portão, e este é o defeito que quase entrou.
   *
   * Duas refutações independentes mediram a mesma coisa rodando o código: com o
   * portão do dinheiro fechado, `itemCosts` devolvia mapa vazio, o `?? 0` de cada
   * linha dava zero, e a corrida congelava `unit_cost_rate` **nulo** em cada consumo
   * e 5 no produto onde o dono congelava 304,98 — sobrando só a embalagem. E não
   * fica nas duas funções: `item_costs` é reescrito a partir disso, então
   * transferência e contagem, que leem `item_costs` cru e estão certas, passam a
   * congelar fielmente o número errado. O servidor recalcula pela mesma coluna
   * (`0025`), concorda, e a checagem de divergência do `db:verify` PASSA.
   *
   * Conteúdo de livro-razão não se corrige: se estorna. Congelar custo e VER custo
   * são perguntas diferentes, e só a segunda tem portão.
   */
  const rates = await averageRatesForLedger(companyId);
  const needed = explodeRequirements(product.recipeId, input.batches, graph);

  // A embalagem entra no consumo, e ela conta por UNIDADE, não por tacho.
  //
  // Esta é a linha que faz o saldo de palito descer. Antes dela, o custo saía
  // certo (a embalagem sempre esteve na taxa congelada) e o estoque mentia: o
  // palito só subia, corrida após corrida, e a fábrica descobria a diferença no
  // inventário. Está escrito em `docs/insights.md` como "o que ficou aberto".
  //
  // Somada em `needed`, ela atravessa tudo o que já existe: a trava de estoque
  // da sala recusa a corrida sem palito, o valor consumido entra na taxa
  // congelada, e o movimento sai com a mesma taxa dos outros insumos. Um caminho
  // paralelo aqui seria um segundo lugar de onde o consumo pode divergir.
  //
  // Rendimento entra na conta pela quantidade PRODUZIDA, e é por isso que a
  // lista não é linha de receita: meio tacho gasta metade do açúcar, mas 400
  // unidades gastam 400 palitos - o tacho que rendeu menos não devolve palito.
  for (const linha of product.packagingItems) {
    const gasto = linha.quantityPerUnit * input.unitsProduced;
    needed.set(linha.itemId, (needed.get(linha.itemId) ?? 0) + gasto);
  }

  const groupId = newId();
  const occurred = input.occurredAt ?? at;

  // O valor total consumido, em taxa × quantidade, sem arredondar em lugar
  // nenhum: a taxa do produto sai daqui e continua fracionária.
  let consumedValue = 0;
  const consumed: { itemId: string; baseUnits: number; rate: Rate }[] = [];
  for (const [itemId, baseUnits] of needed) {
    const rate = (rates[itemId] ?? 0) as Rate;

    // A quantidade arredonda aqui, uma vez, e a taxa não arredonda nunca.
    //
    // `quantity_base_units` é inteiro nos dois lados - `INTEGER` no aparelho e
    // `bigint` no servidor - e uma sub-receita divide: meio tacho de base de
    // creme pede 7530,612244897959 g de açúcar. A afinidade de tipo do SQLite
    // aceita esse REAL sem dizer nada e o Postgres arredondaria, então o
    // aparelho e o servidor passariam a discordar de quanto açúcar saiu do
    // almoxarifado. A tela de insumos mostrava `34.938,776 g` enquanto a de
    // lugares mostrava `34.939 g`: dois números para o mesmo saco.
    //
    // E arredonda antes do valor, não depois: o custo congelado é a aritmética
    // do que o livro-razão guarda, não de um consumo que ninguém gravou.
    const quantity = Math.round(baseUnits);

    consumedValue += rate * quantity;
    consumed.push({ itemId, baseUnits: quantity, rate });
  }

  // A regra mora aqui, e não no botão.
  //
  // A tela de produção já impedia isso - mas o bloqueio numa tela protege quem
  // passa por aquela tela, e o livro-razão recebe escrita de mais de um lugar:
  // o assistente, a simulação, e amanhã uma API. Foi a simulação que encontrou:
  // catorze dias de fábrica levaram a polpa a MENOS 192.000 g sem uma
  // reclamação, porque nada no caminho de escrita conferia.
  //
  // É a mesma forma da fundação de permissão deste projeto: a checagem roda
  // ANTES da escrita, então não existe linha errada para alguém corrigir depois.
  //
  // **E o piso é o da UNIDADE.** Ele já foi as duas coisas erradas, em ordem, e
  // cada uma deixou cicatriz:
  //
  //   1. Somava a EMPRESA e escrevia numa sala — duas perguntas diferentes
  //      respondidas pela mesma consulta. Bastava a fábrica mandar um saco de
  //      açúcar para a loja, que a tela de transferência já faz, para a conta
  //      autorizar um tacho com o açúcar que está a dez quilômetros dali.
  //   2. Passou a conferir UMA sala — e em 8 de setembro a tela passou a ler a
  //      unidade. Com a polpa na câmara fria, que é onde polpa mora numa fábrica
  //      de picolés, a tela liberava o botão e a escrita recusava com erro de
  //      programador em inglês. É PIOR que o defeito original, porque a tela
  //      ainda dizia em que sala a polpa estava: sabia onde, e não deixava rodar.
  //      A guarda de camadas exigia um quarto argumento em `listItems` e ele
  //      estava lá, então nada acusou — guarda que confere a ARIDADE não confere
  //      o escopo.
  //
  // A unidade é a régua certa porque é ela que responde *"dá para ir buscar a
  // pé"*: a câmara fria fica a três metros, a loja fica a dez quilômetros, e a
  // fábrica da outra cidade não é uma caminhada. É a mesma régua da `0046`.
  //
  // **E o consumo sai da sala que TINHA o insumo.** Debitar tudo do piso do tacho
  // deixaria o piso negativo e a câmara cheia — soma certa por unidade, mentira
  // por sala, e é a sala que alguém confere com os olhos na segunda-feira. A
  // ordem é a sala do tacho primeiro e depois as outras por nome: primeiro o que
  // está à mão, e determinística para o mesmo ato produzir as mesmas linhas duas
  // vezes.
  //
  // **A alocação É a checagem**, e isso não é economia de linhas: o defeito 2
  // existiu porque a mesma pergunta era lida em dois lugares. Aqui o que falta é
  // o que a alocação não conseguiu tirar de sala nenhuma, então não há segundo
  // número para divergir do primeiro.
  const unidadeDoTacho = await unidadeDaSala(conn, companyId, input.locationId);
  // A régua vem da configuração da empresa, e a MESMA função responde à tela — é
  // isso que impede os dois lados de decidirem por caminhos diferentes o que a
  // mesma linha significa, que é o defeito que esta função já teve duas vezes.
  const escopoDoConsumo =
    (await consumoDaProducao()) === 'sala'
      ? ({ sala: input.locationId } as Escopo)
      : ({ unidade: unidadeDoTacho } as Escopo);
  const recorte = noEscopo('m.location_id', escopoDoConsumo);
  const porSala = await conn.getAllAsync<{
    item_id: string;
    name: string;
    location_id: string;
    location_name: string;
    on_hand: number;
  }>(
    `SELECT m.item_id, i.name, m.location_id, COALESCE(l.name, '') AS location_name,
            COALESCE(SUM(m.quantity_base_units), 0) AS on_hand
       FROM movements m
       JOIN items i ON i.id = m.item_id
       LEFT JOIN locations l ON l.id = m.location_id AND l.company_id = m.company_id
      WHERE m.company_id = ? AND ${recorte.sql}
      GROUP BY m.item_id, i.name, m.location_id, l.name
     HAVING SUM(m.quantity_base_units) > 0`,
    [companyId, ...recorte.params],
  );

  // Só sala com saldo POSITIVO fornece, e é o `HAVING` acima que garante. Uma sala
  // negativa entraria na soma da unidade como se tivesse a dever ao tacho, e a
  // alocação não teria de onde tirar o que ela "tem" — o piso passaria e a escrita
  // recusaria de novo, que é exatamente o defeito 2 com outra roupa.
  const nomeDaSala = new Map(porSala.map((l) => [l.location_id, l.location_name]));
  const salas = [...nomeDaSala.keys()].sort((a, b) => {
    if (a === b) return 0;
    if (a === input.locationId) return -1;
    if (b === input.locationId) return 1;
    return (nomeDaSala.get(a) ?? '').localeCompare(nomeDaSala.get(b) ?? '') || a.localeCompare(b);
  });

  const disponivel = new Map(porSala.map((l) => [`${l.item_id}@${l.location_id}`, l.on_hand]));
  const nomeDoItem = new Map(porSala.map((l) => [l.item_id, l.name]));

  const consumoPorSala: { itemId: string; locationId: string; baseUnits: number; rate: Rate }[] = [];
  const missing: { itemId: string; name: string; needed: number; held: number }[] = [];
  for (const linha of consumed) {
    let falta = linha.baseUnits;
    for (const sala of salas) {
      if (falta <= 0) break;
      const tem = disponivel.get(`${linha.itemId}@${sala}`) ?? 0;
      if (tem <= 0) continue;
      const tira = Math.min(tem, falta);
      consumoPorSala.push({
        itemId: linha.itemId,
        locationId: sala,
        baseUnits: tira,
        rate: linha.rate,
      });
      falta -= tira;
    }
    if (falta > 0) {
      missing.push({
        itemId: linha.itemId,
        name: nomeDoItem.get(linha.itemId) ?? linha.itemId,
        needed: linha.baseUnits,
        held: linha.baseUnits - falta,
      });
    }
  }

  if (missing.length > 0) {
    // O nome vem do catálogo, e a consulta extra só acontece no caminho que já
    // vai falhar. Com o piso sendo o da unidade, o insumo que falta pode ter ZERO
    // linha em `movements` em toda ela - some da consulta de saldo, e a tela diria
    // ao operador o uuid do item em vez de "Polpa de morango".
    const catalog = await labels(companyId);
    throw new NotEnoughStockError(
      missing.map((line) => ({ ...line, name: catalog[line.itemId] ?? line.name })),
    );
  }
  // A embalagem entra aqui, e não entrar era um defeito silencioso.
  //
  // Sete telas cotam o custo de uma unidade como `costPerProductUnit`, que soma
  // a embalagem por unidade. Se a produção congelasse só a receita, a margem de
  // toda venda futura sairia inflada exatamente pelo palito e pelo saquinho -
  // R$ 0,05 numa corrida de 500 unidades é R$ 25 que ninguém explicaria depois.
  // O número que a tela promete e o número que o livro-razão guarda passam a ser
  // um só.
  //
  // O que ainda falta, e está escrito para não se perder: a embalagem é um
  // valor digitado no produto, enquanto palito e saquinho são itens comprados
  // por nota. Ou seja, o custo sai certo, mas o estoque de palito só sobe.
  // Ligar os dois é mudança de esquema (produto -> itens de embalagem, com
  // quantidade por unidade), e vem separada desta.
  const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingRate) as Rate;
  const productionId = newId();

  const lotId = newId();
  const expires = expiresOn(input.producedOn, product.shelfLifeDays);
  let lotCodeWritten = '';

  await conn.withTransactionAsync(async () => {
    await ensureLocation(conn, companyId);

    // O lote nasce ANTES das linhas que o citam, e a ordem não é estética.
    //
    // A fila do aparelho sobe na ordem em que foi escrita, e o servidor tem
    // chave estrangeira de `movements.lot_id` para `lots` - que o SQLite daqui
    // não tem, porque não se acrescenta FK a coluna existente. Invertida, a
    // fila seria aceita aqui e recusada lá, e o defeito só apareceria no
    // primeiro celular sem sinal.
    //
    // A sequência conta os lotes DO DIA, não do banco inteiro: o código diz
    // "segunda corrida de 2 de setembro", que é o que alguém lê em voz alta no
    // telefone durante um recall.
    const runsToday = await conn.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM lots WHERE company_id = ? AND produced_on = ?`,
      [companyId, input.producedOn],
    );
    const code = input.lotCode ?? lotCode(input.producedOn, (runsToday?.n ?? 0) + 1);

    // A ficha que rodou vai no lote, e é o único lugar durável onde ela cabe.
    //
    // `production_runs` guardava isso e é apagada ao fechar ou cancelar; o
    // movimento congela a TAXA, que é o resultado da ficha, não a identidade
    // dela. Sem este carimbo, corrigir a fórmula em março reescreve o que
    // janeiro custou — a taxa continua certa e a pergunta "de que ficha veio?"
    // passa a responder a receita de hoje.
    await conn.runAsync(
      `INSERT INTO lots
         (id, company_id, item_id, code, produced_on, expires_on, recipe_version_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [lotId, companyId, product.itemId, code, input.producedOn, expires, recipe.versionId, at],
    );
    await enqueue(conn, [{ table: 'lots', rowId: lotId }]);
    lotCodeWritten = code;

    /**
     * `onde` tem valor padrão porque a linha de PRODUÇÃO nasce onde o tacho está —
     * é lá que o picolé passa a existir. Só o consumo escolhe sala, e escolhe a que
     * tinha o insumo.
     */
    const write = async (
      id: string,
      kind: 'production' | 'consumption',
      itemId: string,
      quantity: number,
      rate: number,
      lot: string | null,
      onde: string = input.locationId,
    ) => {
      await conn.runAsync(
        `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                                quantity_base_units, location_id, unit_cost_rate,
                                movement_group_id, lot_id, note, assistant_phrase,
                                operator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          companyId,
          kind,
          occurred,
          at,
          itemId,
          quantity,
          onde,
          rate || null,
          groupId,
          lot,
          input.note ?? null,
          input.assistantPhrase ?? null,
          await currentOperatorId(),
        ],
      );
      await enqueue(conn, [{ table: 'movements', rowId: id }]);
    };

    // A média do produto, calculada com o saldo de ANTES desta corrida.
    //
    // Mesma ordem de `recordPurchase`: o que havia em mãos é lido antes de a
    // entrada existir, senão a corrida entraria na média de si mesma. E o
    // valor é o consumo desta corrida, arredondado uma vez — a taxa que sai
    // daqui continua fracionária.
    const custoAtual = await conn.getFirstAsync<{ average_rate: number }>(
      `SELECT average_rate FROM item_costs WHERE item_id = ?`,
      [product.itemId],
    );
    const emMaos = await conn.getFirstAsync<{ base_units: number }>(
      `SELECT COALESCE(SUM(quantity_base_units), 0) AS base_units
         FROM movements WHERE company_id = ? AND item_id = ?`,
      [companyId, product.itemId],
    );
    const antes: StockCostState = {
      baseUnits: emMaos?.base_units ?? 0,
      averageRate: (custoAtual?.average_rate ?? 0) as Rate,
    };
    // A taxa CONGELADA entra na média, não a soma dos consumos: ela já carrega
    // a embalagem por unidade (`unitPackagingRate`), que é dinheiro do produto
    // e não sai de movimento nenhum. E entra como taxa, sem virar centavo
    // inteiro no caminho — `blendRate` existe por causa desses oito décimos de
    // milésimo.
    const mediaNova = blendRate(antes, {
      baseUnits: input.unitsProduced,
      rate: unitCostRate,
    });

    await conn.runAsync(
      `INSERT INTO item_costs (item_id, company_id, average_rate, last_rate, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         average_rate = excluded.average_rate,
         last_rate = excluded.last_rate,
         updated_at = excluded.updated_at`,
      [product.itemId, companyId, mediaNova, unitCostRate, at],
    );
    await conn.runAsync(
      `INSERT INTO item_cost_history (id, company_id, item_id, previous_rate, new_rate, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), companyId, product.itemId, antes.averageRate || null, mediaNova, occurred],
    );

    // Só a linha de PRODUÇÃO aponta para o lote novo.
    //
    // O consumo tira insumo do estoque, e o lote do insumo é outro - é o da
    // nota em que ele entrou. Carimbar o lote do picolé na saída da polpa diria
    // que a polpa pertence ao picolé, e o recall passaria a recolher o saco de
    // açúcar. Consumo por lote é PEPS de insumo, que é trabalho da Fase 3.
    await write(productionId, 'production', product.itemId, input.unitsProduced, unitCostRate, lotId);
    // Uma linha por (insumo, sala), e não uma por insumo: o razão passa a contar
    // *"seis quilos saíram da câmara e dois do piso"*, que é o que aconteceu. Quem
    // soma por unidade vê o mesmo total de antes; quem confere a câmara com os
    // olhos passa a ver o número que ele encontra na prateleira.
    for (const line of consumoPorSala) {
      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null, line.locationId);
    }
  });

  return {
    groupId,
    unitsProduced: input.unitsProduced,
    unitCostRate,
    consumed,
    lot: { id: lotId, code: lotCodeWritten, expiresOn: expires },
  };
}

export type TransferResult = {
  groupId: string;
  baseUnits: number;
  unitCostRate: Rate;
};

/**
 * O que sai da fábrica e chega na loja: duas linhas, um ato.
 *
 * Saída negativa na origem, entrada positiva no destino, as duas com o mesmo
 * `movement_group_id` e cada uma apontando para o outro lado em
 * `counterpart_location_id`.
 *
 * Duas e não uma, e o motivo é aritmético. O saldo agrupa por `location_id`;
 * com uma linha só o destino não existiria em consulta nenhuma, e fechar
 * exigiria um UNION trocando `location_id` por `counterpart_location_id` e
 * invertendo o sinal — em cada lugar que soma. A contraparte fica como
 * **explicação**, nunca como aritmética: ela responde "para onde foi", e quem
 * responde "quanto tem" é a soma, sozinha.
 *
 * A carga leva o custo consigo, congelado na média do instante em que saiu.
 * Loja própria é transferência e não venda: não há faturamento nem margem
 * aqui, e o valor apenas muda de sala.
 */
type MoveInput = {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  /** Sempre na menor unidade. Positivo: quanto sai de lá e chega aqui. */
  baseUnits: number;
  /**
   * De qual lote saiu. Ausente é legítimo: item sem lote (açúcar, palito).
   *
   * Sem isto o lote só existia na produção, e o saldo dele só subia. Uma
   * etiqueta que promete responder um recall — "digite os onze caracteres e a
   * conferência segue" — precisa saber PARA ONDE aquele lote foi, e a única
   * linha que sabia era a de entrada.
   */
  lotId?: string | null;
  occurredAt?: string;
  note?: string;
  assistantPhrase?: string;
  /**
   * Por que voltou. Obrigatório na devolução — `recordReturn` pede; a
   * transferência não aceita.
   */
  returnReason?: ReturnReason;
  /**
   * Quem LEVOU, quando não foi o carro da fábrica.
   *
   * Ausente é resposta e não esquecimento: a maioria das fábricas entrega com o
   * carro dela. Vai nas DUAS pernas pelo mesmo motivo do lote e do motivo de
   * devolução — a perna que chega na loja é a que alguém lê quando pergunta
   * *"quem trouxe isso?"*, e sem ela ali a metade que interessa fica muda.
   */
  carrierId?: string | null;
};

/**
 * Duas pernas, um ato — e o TIPO diz qual ato foi.
 *
 * A carga que sai e a devolução que volta têm a mesma aritmética: sai negativo
 * de um lado, entra positivo do outro, com o mesmo grupo e cada perna apontando
 * para a outra. Por isso a mecânica é uma só.
 *
 * O que não pode ser uma só é o **fato**. Uma loja devolvendo mil gramas é
 * notícia sobre o produto ou sobre a loja — não vendeu, veio errado, chegou
 * mole. Uma transferência é a fábrica movendo o que é dela. Gravar as duas como
 * `transfer` deixava as duas iguais no livro-razão, e nenhum relatório
 * conseguiria dizer *"a loja centro devolve 8% do que recebe"* — que é
 * exatamente a pergunta que o Espelho da Loja existe para responder.
 *
 * O `movement_kind` tem `return` desde a primeira migração, e ninguém escrevia
 * nele. É a mesma peça pronta e sem escritor que `lots` e `assistant_phrase`
 * eram.
 */
async function moveBetween(
  companyId: string,
  input: MoveInput,
  kind: 'transfer' | 'return',
): Promise<TransferResult> {
  // A espécie decide a capacidade: carga pede `dispatch`, devolução pede
  // `check_receipt`. Quem só entrega não confere o que voltou, e quem só confere não
  // carrega — as duas pontas do mesmo movimento têm dono diferente no servidor.
  await podeGravar(companyId, kind);
  if (input.fromLocationId === input.toLocationId) {
    throw new Error('origem e destino são o mesmo lugar');
  }
  if (input.baseUnits <= 0) {
    throw new Error('uma transferência move alguma coisa; para o sentido inverso, troque os lugares');
  }
  /**
   * A regra da razão, imposta ANTES da escrita — a mesma que o Postgres impõe.
   *
   * O erro IMPEDE em vez de reclamar (Lei 5): sem isto, a linha entraria no
   * SQLite (a coluna é TEXT solto), a fila a enfileiraria, e o servidor a
   * recusaria — travando a fila atrás dela, meses depois, longe da causa.
   */
  if (kind === 'return' && !input.returnReason) {
    throw new Error('uma devolução diz por que voltou');
  }
  if (kind !== 'return' && input.returnReason) {
    throw new Error('só devolução tem motivo de devolução');
  }

  /**
   * O piso da ORIGEM, imposto aqui e não na tela — porque havia duas telas e só
   * uma conferia.
   *
   * A transferência (`app/transfer.tsx`) recusava mandar mais do que a sala tem;
   * a separação (`app/picking.tsx`) comparava o carrinho com o PEDIDO e mandava
   * o que estivesse nele. Medido: açúcar com 50.000 g na fábrica, carrinho de
   * 80.000 → fábrica em **−30.000 g**, loja com 80.000, sem erro nenhum. É a
   * cicatriz exata que o piso da produção foi escrito para impedir, entrando
   * pela outra porta — e a corrida seguinte para com "falta açúcar" enquanto a
   * loja mostra estoque que nunca recebeu.
   *
   * A regra mora na camada de dados pelo mesmo motivo do piso da produção: uma
   * tela a mais amanhã não pode reabrir o buraco. `NotEnoughStockError` é o
   * mesmo erro, com os mesmos números, para a tela escrever a mesma frase.
   */
  const origem = await findItem(companyId, input.itemId, { sala: input.fromLocationId });
  if (!origem) throw new Error('o item desta transferência não existe');
  if (origem.onHandBaseUnits < input.baseUnits) {
    throw new NotEnoughStockError([
      { itemId: input.itemId, name: origem.name, needed: input.baseUnits, held: origem.onHandBaseUnits },
    ]);
  }

  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;

  const cost = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [input.itemId],
  );
  const unitCostRate = (cost?.average_rate ?? 0) as Rate;

  const groupId = newId();
  const outId = newId();
  const inId = newId();

  await conn.withTransactionAsync(async () => {
    await ensureLocation(conn, companyId);

    const leg = async (id: string, at_: string, quantity: number, here: string, there: string) => {
      await conn.runAsync(
        `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                                quantity_base_units, location_id, counterpart_location_id,
                                unit_cost_rate, movement_group_id, lot_id, note, assistant_phrase,
                                return_reason,
                                carrier_id,
                                operator_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          companyId,
          kind,
          occurred,
          at_,
          input.itemId,
          quantity,
          here,
          there,
          unitCostRate || null,
          groupId,
          // As DUAS pernas levam o lote. Só na de saída, o lote sumiria do
          // destino: a loja receberia caixas sem lote e o recall pararia na
          // porta da fábrica.
          input.lotId ?? null,
          input.note ?? null,
          input.assistantPhrase ?? null,
          // As DUAS pernas levam o motivo, pelo mesmo motivo do lote: a perna
          // que entra na fábrica é a que um relatório de devolução vai ler, e
          // sem o motivo nela a metade que interessa fica muda.
          input.returnReason ?? null,
          input.carrierId ?? null,
          await currentOperatorId(),
        ],
      );
      await enqueue(conn, [{ table: 'movements', rowId: id }]);
    };

    await leg(outId, at, -input.baseUnits, input.fromLocationId, input.toLocationId);
    await leg(inId, at, input.baseUnits, input.toLocationId, input.fromLocationId);
  });

  return { groupId, baseUnits: input.baseUnits, unitCostRate };
}

/** O que sai da fábrica e chega na loja. */
export async function recordTransfer(
  companyId: string,
  input: MoveInput,
): Promise<TransferResult> {
  return moveBetween(companyId, input, 'transfer');
}

/**
 * O que a loja mandou de volta.
 *
 * Mesma aritmética da carga, fato diferente — e é o fato que faz a devolução
 * merecer o próprio tipo. Sem ele, "mandei 6.000 e voltaram 1.000" e "mandei
 * 5.000" ficam idênticos no livro-razão, e a diferença entre os dois é a única
 * coisa que interessa a quem quer saber se aquele sabor vende naquela loja.
 *
 * Os lugares vêm invertidos de propósito na chamada: `fromLocationId` é a LOJA,
 * porque é de lá que a mercadoria está saindo. Quem escreve a frase é a tela.
 */
export async function recordReturn(
  companyId: string,
  /**
   * O motivo é obrigatório no TIPO, e não só na checagem de dentro.
   *
   * Assim quem esquecer não compila, em vez de descobrir com uma exceção na mão
   * de quem está na doca. É a mesma escolha do `recordLoss`, que pede `reason`
   * desde sempre — e o mesmo motivo pelo qual `LossReason` nunca virou string.
   */
  input: MoveInput & { returnReason: ReturnReason },
): Promise<TransferResult> {
  return moveBetween(companyId, input, 'return');
}

export type Product = {
  id: string;
  itemId: string;
  name: string;
  /** `null` for resale: a resale product has no recipe, only a purchase cost. */
  recipeId: string | null;
  /** How much of the batch becomes one unit. 75 ml per popsicle. */
  yieldPerUnit: number | null;
  /**
   * O que a embalagem custa por unidade e NÃO está listado em `packagingItems`.
   *
   * Continua existindo depois de a lista de itens entrar, e não é duplicidade:
   * uma fábrica que não quer contar palito no estoque digita o valor e segue.
   * Quem lista os itens vê o custo deles sair do próprio livro-razão, e usa este
   * campo só para o que sobrou de fora — rótulo, fita, o que nunca virou item.
   *
   * **É `Rate`, e já foi `Cents`.** Preço por unidade produzida é taxa — a mesma
   * espécie de número da polpa a 1,24 centavo por grama. Como inteiro, um rótulo
   * a R$ 0,004 por unidade virava zero na porta de entrada, e o zero ia para o
   * `unit_cost_rate` congelado de toda corrida, que não se corrige: se estorna.
   * A coluna antiga (`unit_packaging_cents`) continua no banco, dormente, porque
   * migração é append-only — quem lê é a nova (migração V18 / servidor 0033).
   */
  unitPackagingRate: Rate | null;
  /**
   * Por quanto isto SAI — o preço de tabela, e é o nulo dele que diz o vendável.
   *
   * Nulo tem as duas leituras de sempre, e quem separa é `listProducts`, não a tela:
   * "não vendemos isto" (o caso comum de quem só produz para as próprias lojas) e
   * "não é seu para ver". Para a tela as duas se desenham igual — sem preço —, e é
   * de propósito: dizer "existe um preço, mas não para você" já é contar o que o
   * portão nega. O acordo de uma loja vence este valor quando existe, e mora noutra
   * tabela — aqui está o número que vale para todo mundo.
   */
  salePriceRate: Rate | null;
  /**
   * A embalagem que sai do estoque, por unidade produzida.
   *
   * Vazia é o caso comum e legítimo. Cada linha vira consumo no livro-razão
   * quando a corrida é gravada, e é isso que faz o saldo de palito descer — até
   * aqui ele só subia.
   */
  packagingItems: { itemId: string; name: string; quantityPerUnit: number }[];
  /**
   * Quantos dias o produto dura depois de feito. Nulo: não vence.
   *
   * Mora no produto e não na corrida porque quem está de luva no tacho não sabe
   * de cabeça que o picolé dura seis meses e o pote três - o cadastro sabe,
   * respondeu uma vez, e toda corrida nasce com a data pronta.
   */
  shelfLifeDays: number | null;
  packaging: PackagingHierarchy;
  /**
   * A grade que compôs o nome, quando ele veio de uma. Nulo é caso legítimo, e
   * não migração pendente: um produto de revenda comprado pronto não tem linha
   * nem sabor, e uma fábrica de um doce só nunca cadastrou nenhum dos três.
   */
  lineId: string | null;
  typeId: string | null;
  flavorId: string | null;
};

export async function listProducts(companyId: string): Promise<Product[]> {
  const fichas = await listProductsForLedger(companyId);
  /**
   * A embalagem digitada é dinheiro, e é o pior dos três estados quando mente.
   *
   * Sem guarda, a tela de produção somava esta parcela ao custo congelado: o número
   * não sai de cena, **encolhe** — não é travessão, não é zero, é um custo plausível
   * e errado, que é a única coisa pior que nenhum número. Nulo obriga a tela a
   * decidir, e é isso que o tipo está fazendo.
   */
  // Dois portões e duas perguntas: quanto custa fazer, e por quanto sai. O
  // comprador vê a primeira e não a segunda, de propósito.
  const [custo, preco] = await Promise.all([canSeeMoney(companyId), canSeePrice(companyId)]);
  if (custo && preco) return fichas;
  return fichas.map((f) => ({
    ...f,
    unitPackagingRate: custo ? f.unitPackagingRate : null,
    salePriceRate: preco ? f.salePriceRate : null,
  }));
}

/**
 * As fichas SEM portão — para quem grava, nunca para quem mostra.
 *
 * Mesma convenção do `averageRatesForLedger`, e ela nasceu de um defeito de verdade
 * nesta mudança, achado pelo compilador: `recordProduction` lia a ficha por
 * `listProducts`, e no dia em que `unitPackagingRate` virou nulo para quem não vê
 * custo, a corrida lançada por quem está de luva na câmara congelaria o custo **sem
 * o palito e sem o saquinho**. Menor, plausível, e errado para sempre, porque
 * conteúdo de livro-razão não se corrige: se estorna.
 *
 * Congelar custo e VER custo são perguntas diferentes. Só a segunda tem portão, e o
 * sufixo `ForLedger` é o que diz de qual das duas se trata — com
 * `src/layers.test.ts` recusando qualquer tela que a mencione.
 */
export async function listProductsForLedger(
  companyId: string,
): Promise<(Product & { unitPackagingRate: Rate })[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    item_id: string;
    name: string;
    recipe_id: string | null;
    yield_per_unit: number | null;
    unit_packaging_rate: number;
    shelf_life_days: number | null;
    packaging: string;
    packaging_items: string;
    sale_price_rate: number | null;
    line_id: string | null;
    type_id: string | null;
    flavor_id: string | null;
  }>(
    `SELECT p.id, p.item_id, i.name, p.recipe_id, p.yield_per_unit,
            p.unit_packaging_rate, p.shelf_life_days, i.packaging, i.sale_price_rate,
            p.packaging_items, p.line_id, p.type_id, p.flavor_id
       FROM products p
       JOIN items i ON i.id = p.item_id
      WHERE p.company_id = ? AND p.active = 1
      ORDER BY i.name COLLATE NOCASE`,
    [companyId],
  );

  // O nome de cada embalagem vem do catálogo, não da lista: a lista guarda id e
  // quantidade, e quem fala português é a tela. Um nome copiado para dentro do
  // JSON viraria um segundo nome do mesmo item, desatualizado no dia seguinte.
  const catalogo = await labels(companyId);

  return rows.map((r) => ({
    id: r.id,
    itemId: r.item_id,
    name: r.name,
    recipeId: r.recipe_id,
    yieldPerUnit: r.yield_per_unit,
    unitPackagingRate: r.unit_packaging_rate as Rate,
    salePriceRate: r.sale_price_rate === null ? null : (r.sale_price_rate as Rate),
    shelfLifeDays: r.shelf_life_days,
    packaging: parsePackaging(r.packaging),
    lineId: r.line_id,
    typeId: r.type_id,
    flavorId: r.flavor_id,
    packagingItems: parsePackagingItems(r.packaging_items, catalogo),
  }));
}

/**
 * Saves a product and the item behind it in one step.
 *
 * A product is an item that can also be made or resold, not a separate thing
 * living in a parallel table - which is what lets one ledger hold both the
 * sugar going in and the popsicle coming out.
 */
/**
 * A classificação já está ocupada por outro produto.
 *
 * O banco recusa isso por índice único, e a recusa dele chega como "Error
 * finalizing statement" - jargão de driver, num diálogo que o dono lê e não
 * entende. Pior: a saída não aparece em lugar nenhum, e a saída existe (dar
 * linha, tipo ou sabor ao produto novo, ou ao antigo).
 *
 * Nomeado e com o nome do outro produto dentro, como o `NotEnoughStockError`:
 * quem escreve a frase é a tela, e ela precisa do fato para escrever.
 *
 * A regra em si é decisão registrada na migração `0018` - "o mesmo produto não
 * se cadastra duas vezes", com nulo valendo como valor. O defeito não era a
 * regra, era ela falando SQLite.
 */
export class GridTakenError extends Error {
  constructor(public readonly existing: string) {
    super(`grid already taken by ${existing}`);
    this.name = 'GridTakenError';
  }
}

export async function saveProduct(
  companyId: string,
  input: {
    id?: string;
    itemId?: string;
    name: string;
    kind: Extract<ItemKind, 'product' | 'resale'>;
    recipeId: string | null;
    yieldPerUnit: number | null;
    /** Preço por unidade produzida — taxa, não centavo inteiro. Ver o tipo `Product`. */
    unitPackagingRate: Rate;
    packaging: PackagingHierarchy;
    /**
     * Quantos dias este produto dura depois de feito. Nulo: não vence.
     *
     * Perguntado uma vez aqui, no cadastro, para nunca mais ser perguntado no
     * tacho: cada corrida nasce com a validade calculada. É a Lei 1 na forma
     * mais direta - o sistema já sabe, então não pergunta de novo.
     */
    shelfLifeDays?: number | null;
    /**
     * A embalagem que sai do estoque, por unidade produzida.
     *
     * Ausente é "não mexa no que já estava listado"; lista vazia apaga. A
     * diferença importa porque a tela de correção de nome não manda embalagem, e
     * uma lista tratada como vazia ali desligaria em silêncio o consumo de
     * palito de todas as corridas seguintes.
     */
    packagingItems?: readonly { itemId: string; quantityPerUnit: number }[];
    /**
     * Quanto é "cheio" deste produto, para a leitura por faixa de cor.
     *
     * Ausente é "não mexa": a tela que corrige a grade não manda régua, e
     * apagá-la em silêncio tiraria a cor da câmara sem ninguém pedir.
     */
    fullLevel?: number | null;
    lineId?: string | null;
    typeId?: string | null;
    flavorId?: string | null;
  },
): Promise<{ productId: string; itemId: string }> {
  // Antes de abrir a transação, porque recusar depois de gravar o item deixaria
  // um item órfão para trás - e a checagem lê, não escreve.
  await assertTypeBelongsToLine(companyId, input.lineId ?? null, input.typeId ?? null);
  const conn = await db();
  let itemId = '';
  let productId = '';

  // A lista de embalagem é resolvida ANTES da transação, e entra na mesma
  // instrução que grava o produto.
  //
  // Ausente é "não mexa no que já estava listado", e é por isso que o valor
  // anterior é lido aqui: a tela que corrige o nome não manda embalagem, e um
  // `excluded.packaging_items` com lista vazia desligaria em silêncio o consumo
  // de palito de todas as corridas seguintes.
  const anterior = input.id
    ? await conn.getFirstAsync<{ packaging_items: string }>(
        `SELECT packaging_items FROM products WHERE id = ?`,
        [input.id],
      )
    : null;
  const packagingItems = input.packagingItems
    ? JSON.stringify(normalizePackagingItems(input.packagingItems))
    : (anterior?.packaging_items ?? '[]');

  // A colisão de classificação é lida ANTES de escrever, pela mesma razão que a
  // trava de estoque: recusar depois de gravar o item deixaria um item órfão, e
  // recusar pelo índice devolve a mensagem do driver em vez de uma frase.
  const ocupada = await conn.getFirstAsync<{ name: string }>(
    `SELECT i.name FROM products p
       JOIN items i ON i.id = p.item_id
      WHERE p.company_id = ? AND p.active = 1 AND p.id <> ?
        AND COALESCE(p.line_id, '') = COALESCE(?, '')
        AND COALESCE(p.type_id, '') = COALESCE(?, '')
        AND COALESCE(p.flavor_id, '') = COALESCE(?, '')
      LIMIT 1`,
    [
      companyId,
      input.id ?? '',
      input.lineId ?? null,
      input.typeId ?? null,
      input.flavorId ?? null,
    ],
  );
  if (ocupada) throw new GridTakenError(ocupada.name);

  await conn.withTransactionAsync(async () => {
    itemId = await writeItem(conn, companyId, {
      id: input.itemId,
      kind: input.kind,
      name: input.name,
      purchaseUnit: null,
      purchaseToBase: null,
      baseUnit: 'un',
      packaging: input.packaging,
      // A régua mora no ITEM, e o produto tem um: é o mesmo campo que o insumo
      // usa, então a faixa de cor lê os dois com a mesma conta.
      fullLevel: input.fullLevel,
    });

    productId = input.id ?? newId();
    await conn.runAsync(
      `INSERT INTO products (id, company_id, item_id, recipe_id, yield_per_unit,
                             unit_packaging_rate, packaging_items, shelf_life_days, active,
                             line_id, type_id, flavor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         recipe_id = excluded.recipe_id,
         yield_per_unit = excluded.yield_per_unit,
         unit_packaging_rate = excluded.unit_packaging_rate,
         packaging_items = excluded.packaging_items,
         shelf_life_days = excluded.shelf_life_days,
         line_id = excluded.line_id,
         type_id = excluded.type_id,
         flavor_id = excluded.flavor_id`,
      [
        productId,
        companyId,
        itemId,
        input.recipeId,
        input.yieldPerUnit,
        input.unitPackagingRate,
        packagingItems,
        input.shelfLifeDays ?? null,
        input.lineId ?? null,
        input.typeId ?? null,
        input.flavorId ?? null,
      ],
    );

    await enqueue(conn, [{ table: 'products', rowId: productId }]);
  });

  return { productId, itemId };
}

// --- what changed -----------------------------------------------------------

export type CostChange = {
  itemId: string;
  name: string;
  previousRate: Rate | null;
  newRate: Rate;
  observedAt: string;
};

/**
 * The most recent moves in what things cost.
 *
 * This is the raw material of the briefing: a home screen that only shows
 * totals says nothing, because the owner already knows roughly what they are.
 * What they do not know is what moved since they last looked.
 */
export async function recentCostChanges(companyId: string, limit = 5): Promise<CostChange[]> {
  /**
   * Aqui a lista INTEIRA é dinheiro — "o preço era X e virou Y" não sobra nada
   * depois de tirar os dois números. Então o portão devolve lista vazia, que é a
   * resposta que a capa já trata: sem mudança de preço, a peça não é montada.
   *
   * Antes disto ela desaparecia por acidente feliz: com zero nos dois campos, o
   * filtro `previousRate !== newRate` da capa derrubava a linha. Acidente feliz não
   * é desenho — o dia em que alguém trocasse aquele filtro, a capa passaria a
   * anunciar "o preço mexeu de R$ 0,00 para R$ 0,00".
   */
  if (!(await canSeeMoney(companyId))) return [];
  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    previous_rate: number | null;
    new_rate: number;
    observed_at: string;
  }>(
    `SELECT h.item_id, i.name, h.previous_rate, h.new_rate, h.observed_at
       FROM item_cost_history h
       JOIN items i ON i.id = h.item_id
      WHERE h.company_id = ? AND h.previous_rate IS NOT NULL
      ORDER BY h.observed_at DESC
      LIMIT ?`,
    [companyId, limit],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    previousRate: r.previous_rate === null ? null : (r.previous_rate as Rate),
    newRate: r.new_rate as Rate,
    observedAt: r.observed_at,
  }));
}

/**
 * Alguma coisa se perdeu, e o motivo é obrigatório.
 *
 * Escreve um movimento negativo com `loss_reason` preenchido - o servidor tem
 * `check (kind <> 'loss' or loss_reason is not null)` desde a primeira migração,
 * então uma perda sem motivo é recusada lá mesmo que o aparelho a aceitasse. E
 * o motivo não é burocracia: "sumiram 200 picolés" não muda decisão nenhuma,
 * "derreteram 200 picolés na câmara" muda a manutenção do freezer.
 *
 * As palavras estão nos três idiomas desde antes desta função existir, sem tela
 * que as usasse - uma das dívidas que o próprio CLAUDE.md nomeia. Este é o
 * primeiro escritor.
 *
 * O piso é o mesmo da produção: não se perde o que não se tem. A checagem roda
 * antes da escrita, e por isso não existe linha errada para alguém estornar.
 */
export async function recordLoss(
  companyId: string,
  input: {
    itemId: string;
    /** Quanto se perdeu, em unidade-base. Sempre positivo: o sinal é daqui. */
    baseUnits: number;
    reason: LossReason;
    /** De qual lote se perdeu. Ausente é legítimo: insumo não tem lote. */
    lotId?: string | null;
    locationId?: string;
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<{ baseUnits: number; rate: Rate }> {
  if (!(input.baseUnits > 0)) throw new Error('uma perda de nada não é uma perda');
  await podeGravar(companyId, 'loss');

  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;
  const locationId = input.locationId ?? (await ensureLocation(conn, companyId));

  const held = await conn.getFirstAsync<{ on_hand: number }>(
    `SELECT COALESCE(SUM(quantity_base_units), 0) AS on_hand
       FROM movements
      WHERE company_id = ? AND item_id = ? AND location_id = ?`,
    [companyId, input.itemId, locationId],
  );

  const onHand = held?.on_hand ?? 0;
  if (onHand < input.baseUnits) {
    const name = (await labels(companyId))[input.itemId] ?? input.itemId;
    throw new NotEnoughStockError([
      { itemId: input.itemId, name, needed: input.baseUnits, held: onHand },
    ]);
  }

  // A taxa é a que o item vale hoje: o que se perdeu foi mercadoria comprada,
  // e o relatório de perdas conta dinheiro, não só quantidade.
  /**
   * As taxas vêm SEM portão, e este é o defeito que quase entrou.
   *
   * Duas refutações independentes mediram a mesma coisa rodando o código: com o
   * portão do dinheiro fechado, `itemCosts` devolvia mapa vazio, o `?? 0` de cada
   * linha dava zero, e a corrida congelava `unit_cost_rate` **nulo** em cada consumo
   * e 5 no produto onde o dono congelava 304,98 — sobrando só a embalagem. E não
   * fica nas duas funções: `item_costs` é reescrito a partir disso, então
   * transferência e contagem, que leem `item_costs` cru e estão certas, passam a
   * congelar fielmente o número errado. O servidor recalcula pela mesma coluna
   * (`0025`), concorda, e a checagem de divergência do `db:verify` PASSA.
   *
   * Conteúdo de livro-razão não se corrige: se estorna. Congelar custo e VER custo
   * são perguntas diferentes, e só a segunda tem portão.
   */
  const rates = await averageRatesForLedger(companyId);
  const rate = (rates[input.itemId] ?? 0) as Rate;

  const id = newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                              quantity_base_units, location_id, unit_cost_rate, loss_reason,
                              movement_group_id, lot_id, note, assistant_phrase,
                              operator_id)
       VALUES (?, ?, 'loss', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        occurred,
        at,
        input.itemId,
        -Math.round(input.baseUnits),
        locationId,
        rate || null,
        input.reason,
        // O grupo é a própria linha, pelo mesmo motivo da contagem: sem ele a
        // perda não tem como ser desfeita, e "digitei 40 onde era 4" fica no
        // razão para sempre — descontando trinta e seis quilos de dinheiro que
        // não sumiram.
        id,
        // "Quatro caixas venceram" só muda a compra se alguém souber QUAL lote
        // venceu: sem o lote, a perda por validade não fecha a conta do lote que
        // a etiqueta prometeu rastrear.
        input.lotId ?? null,
        input.note ?? null,
        input.assistantPhrase ?? null,
        await currentOperatorId(),
      ],
    );
    await enqueue(conn, [{ table: 'movements', rowId: id }]);
  });

  return { baseUnits: Math.round(input.baseUnits), rate };
}

/** Uma perda, como o relatório precisa dela: quanto, onde, por quê e quanto vale. */
export type LossRow = {
  itemId: string;
  name: string;
  baseUnits: number;
  baseUnit: string;
  reason: LossReason;
  locationName: string;
  /**
   * Quanto custou, pela taxa CONGELADA no movimento — e `null` sem `view_cost`.
   *
   * A tela de perdas decidia por contagem de linha, não por dinheiro: com zero ela
   * abria inteira dizendo "R$ 0,00" na figura, em cada linha e na comparação — uma
   * tela afirmando que a fábrica não perdeu nada. A quantidade perdida continua
   * aparecendo, porque perder três caixas é fato de chão de fábrica; quanto custou
   * é outra pergunta.
   */
  valueCents: Cents | null;
  occurredAt: string;
};

/**
 * O que se perdeu numa janela, do mais caro para o mais barato.
 *
 * Ordenado por dinheiro e não por data porque a pergunta que o relatório
 * responde não é "o que aconteceu ontem", é "onde está indo o dinheiro que
 * some". Uma caixa que derreteu vale mais que trinta picolés de cortesia, e é
 * ela que muda a manutenção do freezer.
 */

/** Quanto uma espécie de devolução pesou na janela. */
export type MirrorReason = { reason: ReturnReason; baseUnits: number };

/**
 * O que voltou de um ITEM naquela loja — e a fração só existe aqui, por dimensão.
 *
 * **A primeira versão somava a loja inteira, e isso era aritmética inválida.** O
 * razão conta em unidade-base, e unidade-base é grama para a polpa e unidade para o
 * picolé: mil gramas de açúcar mais trezentos picolés davam 1.300 de "recebido", um
 * número que não é de nada. Pior, o açúcar afogava o picolé — o item que interessa
 * some dentro do item pesado. Uma fração só se compara dentro da mesma régua, e a
 * régua é o item.
 *
 * Foi o `e2e` que obrigou a olhar: ao escrever a asserção da conta aberta, a linha
 * pedia a unidade ao lado do número, e não havia unidade para pôr — porque não havia
 * uma só. Número sem unidade é o sintoma; somar grandezas diferentes é a doença.
 */
export type MirrorItem = {
  itemId: string;
  name: string;
  /** A régua deste número. É o que impede a soma que não pode ser somada. */
  baseUnit: string;
  /** Unidades que CHEGARAM: a perna positiva de uma carga, no lugar do destino. */
  received: number;
  /** Unidades que VOLTARAM: a perna negativa de uma devolução, no mesmo lugar. */
  returned: number;
  /** Fração de 0 a 1, não porcentagem — quem multiplica por cem é a tela. */
  returnShare: number;
  /** Por que voltou, da espécie mais pesada para a mais leve. */
  reasons: MirrorReason[];
  /** A mesma janela, imediatamente antes. Zero em tudo é fato: não houve carga. */
  before: { received: number; returned: number; returnShare: number };
};

/**
 * O que uma loja fez com o que recebeu, numa janela — e na janela anterior.
 *
 * É a pergunta que o Espelho da Loja existe para responder: *"a loja centro devolve
 * 8% do que recebe"*. Ela só é possível porque a devolução tem TIPO próprio no razão
 * — gravadas como `transfer`, ida e volta ficariam idênticas e a diferença, que é a
 * única coisa que interessa, sumiria.
 *
 * **Fato, nunca frase, e nunca veredito.** A camada devolve unidade e fração; quem
 * escreve *"devolve mais que as outras"* é a tela, e quem decide se 8% é muito é uma
 * fábrica de verdade. A régua não está aqui de propósito: qualquer corte que eu
 * escolhesse agora seria calibrado contra um banco semeado, e padrão de banco semeado
 * é padrão que a semeadura plantou.
 *
 * **A janela anterior vem junto porque número sozinho não decide (Lei 3).** Oito por
 * cento é ótimo depois de doze e péssimo depois de três, e a tela não teria como
 * saber qual dos dois sem uma segunda consulta — que é como duas verdades nascem.
 */
export type MirrorRow = {
  placeId: string;
  placeName: string;
  /** Do que mais volta para o que menos volta: é a ordem que serve para decidir. */
  items: MirrorItem[];
};

/**
 * O Espelho da Loja, em números.
 *
 * Uma consulta só para as duas janelas, e não duas: a segunda leitura é o caminho
 * mais curto para as duas discordarem — basta o relógio virar entre elas.
 *
 * Sem portão de dinheiro, e isso é escolha: aqui não há cifra nenhuma. Unidade que
 * chegou e unidade que voltou é o que quem confere a doca já vê com os olhos, e
 * esconder isso do operador não deixa número nenhum mais seguro — deixa a conferência
 * sem acontecer, que é a mesma razão escrita da contagem de prateleira.
 */
export async function storeMirror(
  companyId: string,
  days = 30,
  now: string = nowIso(),
): Promise<MirrorRow[]> {
  const conn = await db();
  const fim = new Date(now);
  const inicio = new Date(fim.getTime() - days * 86400000).toISOString();
  const antes = new Date(fim.getTime() - 2 * days * 86400000).toISOString();

  const rows = await conn.getAllAsync<{
    location_id: string;
    place_name: string;
    item_id: string;
    item_name: string;
    base_unit: string;
    kind: string;
    return_reason: string | null;
    units: number;
    agora: number;
  }>(
    // As duas pernas de uma carga têm o mesmo grupo e sinais opostos; a que
    // interessa aqui é a do LADO DA LOJA — positiva na chegada, negativa na
    // devolução. O sinal só passa a decidir quando as DUAS pernas caem em lugares
    // que recebem carga (uma loja repassando para um cliente): sem ele, quem
    // despachou apareceria recebendo o que mandou embora.
    `SELECT m.location_id, l.name AS place_name,
            m.item_id, i.name AS item_name, i.base_unit,
            m.kind AS kind, m.return_reason,
            SUM(ABS(m.quantity_base_units)) AS units,
            CASE WHEN m.occurred_at >= ? THEN 1 ELSE 0 END AS agora
       FROM movements m
       JOIN locations l ON l.id = m.location_id
       JOIN items i ON i.id = m.item_id
       -- LEFT, e é a diferença entre mostrar quem levou e esconder a carga: a
       -- maioria das entregas é com o carro da fábrica, e um JOIN comum apagaria
       -- todas elas da tela.
       LEFT JOIN carriers t ON t.id = m.carrier_id
      WHERE m.company_id = ?
        AND l.kind IN ('own_store', 'customer')
        AND m.occurred_at >= ?
        AND ((m.kind = 'transfer' AND m.quantity_base_units > 0)
          OR (m.kind = 'return'   AND m.quantity_base_units < 0))
      GROUP BY m.location_id, l.name, m.item_id, i.name, i.base_unit, m.kind,
               m.return_reason, agora`,
    [inicio, companyId, antes],
  );

  const lugares = new Map<string, { placeId: string; placeName: string; itens: Map<string, MirrorItem> }>();

  for (const r of rows) {
    const lugar =
      lugares.get(r.location_id) ??
      { placeId: r.location_id, placeName: r.place_name, itens: new Map<string, MirrorItem>() };
    lugares.set(r.location_id, lugar);

    const item =
      lugar.itens.get(r.item_id) ??
      {
        itemId: r.item_id,
        name: r.item_name,
        baseUnit: r.base_unit,
        received: 0,
        returned: 0,
        returnShare: 0,
        reasons: [] as MirrorReason[],
        before: { received: 0, returned: 0, returnShare: 0 },
      };
    lugar.itens.set(r.item_id, item);

    const janela = r.agora === 1 ? item : item.before;
    if (r.kind === 'transfer') janela.received += r.units;
    else {
      janela.returned += r.units;
      // O motivo só é contado na janela de agora: a lista existe para dizer o que
      // está acontecendo, e uma lista que mistura dois meses não diz nem um.
      if (r.agora === 1 && r.return_reason) {
        const especie = r.return_reason as ReturnReason;
        const achado = item.reasons.find((x) => x.reason === especie);
        if (achado) achado.baseUnits += r.units;
        else item.reasons.push({ reason: especie, baseUnits: r.units });
      }
    }
  }

  // A fração é calculada no fim, sobre os totais do ITEM — e nunca somando frações,
  // que é como uma média de médias mente.
  const fracao = (recebido: number, devolvido: number) =>
    recebido > 0 ? devolvido / recebido : 0;

  return [...lugares.values()]
    .map((lugar) => ({
      placeId: lugar.placeId,
      placeName: lugar.placeName,
      items: [...lugar.itens.values()]
        .map((item) => ({
          ...item,
          returnShare: fracao(item.received, item.returned),
          reasons: [...item.reasons].sort((a, b) => b.baseUnits - a.baseUnits),
          before: {
            ...item.before,
            returnShare: fracao(item.before.received, item.before.returned),
          },
        }))
        // Empate desempata pelo nome, para a lista não trocar de ordem sozinha
        // entre duas leituras.
        .sort((a, b) => b.returnShare - a.returnShare || a.name.localeCompare(b.name)),
    }))
    // A loja com o item que mais volta vem primeiro: é o que se olha antes.
    .sort(
      (a, b) =>
        (b.items[0]?.returnShare ?? 0) - (a.items[0]?.returnShare ?? 0) ||
        a.placeName.localeCompare(b.placeName),
    );
}

export async function lossesOn(
  companyId: string,
  fromIso: string,
  toIso: string,
  /** Onde a perda aconteceu. Sem escopo, a empresa — e a tela de perdas é da unidade. */
  onde?: Escopo,
): Promise<LossRow[]> {
  const conn = await db();
  const recorteDaPerda = noEscopo('m.location_id', onde);
  /**
   * A ORDEM continua saindo do dinheiro, e isso é de propósito.
   *
   * "Da perda mais cara para a mais barata" é a ordem que serve para decidir, e ela
   * não revela cifra nenhuma: quem não vê custo recebe a lista na ordem certa e sem
   * os números. Apagar a ordem junto com os valores seria trocar uma lista útil por
   * uma lista alfabética para não vazar o que já não vaza.
   */
  const dinheiro = await canSeeMoney(companyId);
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    base_unit: string;
    quantity: number;
    reason: LossReason;
    location_name: string;
    rate: number | null;
    occurred_at: string;
  }>(
    `SELECT m.item_id, i.name, i.base_unit, m.quantity_base_units AS quantity,
            m.loss_reason AS reason, l.name AS location_name,
            m.unit_cost_rate AS rate, m.occurred_at
       FROM movements m
       JOIN items i ON i.id = m.item_id
       JOIN locations l ON l.id = m.location_id
      WHERE m.company_id = ?
        AND m.kind = 'loss'
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
        AND ${recorteDaPerda.sql}
        AND ${NAO_ESTORNADO}
      ORDER BY ABS(m.quantity_base_units * COALESCE(m.unit_cost_rate, 0)) DESC`,
    [companyId, fromIso, toIso, ...recorteDaPerda.params],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    baseUnits: Math.abs(r.quantity),
    baseUnit: r.base_unit,
    reason: r.reason,
    locationName: r.location_name,
    // Mesmo motivo do saldo por lugar: quem arredonda é `amountOf`.
    valueCents: dinheiro ? amountOf((r.rate ?? 0) as Rate, Math.abs(r.quantity)) : null,
    occurredAt: r.occurred_at,
  }));
}

/** Um tacho que está rodando agora. */
export type OpenRun = {
  id: string;
  productId: string;
  productName: string;
  recipeId: string;
  /** A ficha que estava valendo quando o tacho foi carregado. */
  recipeVersionId: string;
  batches: number;
  locationId: string;
  openedAt: string;
};

/** Uma corrida que o razão não conhece: some sem estorno. */
export class RunGoneError extends Error {
  constructor(public readonly runId: string) {
    super(`corrida ${runId} não está aberta`);
    this.name = 'RunGoneError';
  }
}

/**
 * O tacho começou a rodar.
 *
 * Não valida saldo, e isso é decisão e não esquecimento: na abertura a falta é
 * uma PREVISÃO, e recusar a abertura não impede o tacho de estar rodando - só
 * deixa a corrida sem registro. A tela avisa aqui; o razão impede no
 * fechamento, que é onde a escrita acontece.
 */
export async function openProductionRun(
  companyId: string,
  input: { productId: string; batches: number },
): Promise<OpenRun> {
  if (!(input.batches > 0) || !Number.isFinite(input.batches)) {
    throw new Error('a receita tem de rodar mais que zero vezes');
  }

  const product = (await listProductsForLedger(companyId)).find((p) => p.id === input.productId);
  if (!product) throw new Error(`produto ${input.productId} não existe`);
  if (!product.recipeId) throw new Error(`${product.name} é revenda: não se produz`);

  const graph = await loadRecipeGraph(companyId);
  const recipe = graph[product.recipeId];
  if (!recipe) throw new Error(`a receita de ${product.name} não está no aparelho`);

  const conn = await db();
  const at = nowIso();
  const id = newId();
  const locationId = await ensureLocation(conn, companyId);

  // O id da VERSÃO na coluna da versão.
  //
  // Aqui entrava `product.recipeId` — o id da receita —, e o nome da coluna
  // dizia outra coisa. Não quebrava nada visível porque ninguém lia de volta, e
  // é esse o tipo de erro que fica: a coluna existe, o valor é um uuid legítimo,
  // e o dia em que alguém for perguntar "qual ficha rodou?" a resposta vai ser
  // "a receita", que é a fórmula de hoje.
  await conn.runAsync(
    `INSERT INTO production_runs
       (id, company_id, product_id, recipe_version_id, batches, location_id, opened_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, product.id, recipe.versionId, input.batches, locationId, at],
  );

  return {
    id,
    productId: product.id,
    productName: product.name,
    recipeId: product.recipeId,
    recipeVersionId: recipe.versionId,
    batches: input.batches,
    locationId,
    openedAt: at,
  };
}

/** Os tachos rodando agora. Vazio é o estado normal de uma fábrica parada. */
export async function openProductionRuns(
  companyId: string,
  /**
   * Qual unidade tem corrida aberta — e o `ColunaDeLugar` sem prefixo é para esta.
   *
   * A tabela é `production_runs` e não `movements`, mas a pergunta é a mesma e a régua
   * também: um tacho aberto em Bauru não é notícia na capa de Marília, e a fumaça da
   * cena subiria na cidade errada.
   */
  onde?: Escopo,
): Promise<OpenRun[]> {
  const conn = await db();
  const recorte = noEscopo('r.location_id', onde);
  const rows = await conn.getAllAsync<{
    id: string;
    product_id: string;
    name: string;
    recipe_id: string;
    recipe_version_id: string;
    batches: number;
    location_id: string;
    opened_at: string;
  }>(
    `SELECT r.id, r.product_id, i.name, p.recipe_id, r.recipe_version_id,
            r.batches, r.location_id, r.opened_at
       FROM production_runs r
       JOIN products p ON p.id = r.product_id
       JOIN items i ON i.id = p.item_id
      WHERE r.company_id = ?
        AND ${recorte.sql}
      ORDER BY r.opened_at`,
    [companyId, ...recorte.params],
  );

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.name,
    recipeId: r.recipe_id,
    recipeVersionId: r.recipe_version_id,
    batches: r.batches,
    locationId: r.location_id,
    openedAt: r.opened_at,
  }));
}

/**
 * O tacho não virou produção.
 *
 * Apaga a linha e não escreve nada no razão - é aqui que "estado, não
 * movimento" se paga: não existe estorno porque não existe lançamento. E não
 * pergunta motivo: o app não fiscaliza.
 */
export async function cancelProductionRun(companyId: string, runId: string): Promise<void> {
  const conn = await db();
  await conn.runAsync(`DELETE FROM production_runs WHERE id = ? AND company_id = ?`, [
    runId,
    companyId,
  ]);
}

/**
 * O tacho virou produção: a corrida sai do estado e entra no razão.
 *
 * O id da corrida vira o `movement_group_id` das linhas - a linha some da
 * tabela, mas o nome dela fica no livro-razão, e é por ele que se volta.
 * Fechar duas vezes por toque repetido é impossível: a segunda não acha a
 * corrida e levanta `RunGoneError` antes de escrever qualquer coisa.
 */
export async function closeProductionRun(
  companyId: string,
  input: {
    runId: string;
    unitsProduced: number;
    /**
     * O dia da fábrica em que o TACHO FOI ABERTO, não o de agora.
     *
     * Uma corrida aberta às 23h de segunda e fechada à 1h de terça é produção
     * de segunda: foi o trabalho daquele turno, e é a data que a etiqueta do
     * lote precisa carregar. Quem sabe traduzir `openedAt` em dia local é a
     * tela, que tem o fuso.
     */
    producedOn: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<ProductionResult> {
  // SEM unidade: isto é busca por id, não listagem. A corrida chega pelo id que a tela
  // já obteve de uma lista recortada; recortar de novo aqui só criaria um caminho em
  // que fechar uma corrida falha por o aparelho ter trocado de unidade no meio.
  const run = (await openProductionRuns(companyId)).find((r) => r.id === input.runId);
  if (!run) throw new RunGoneError(input.runId);

  const result = await recordProduction(companyId, {
    productId: run.productId,
    locationId: run.locationId,
    batches: run.batches,
    unitsProduced: input.unitsProduced,
    occurredAt: run.openedAt,
    producedOn: input.producedOn,
    note: input.note,
    assistantPhrase: input.assistantPhrase,
  });

  // Só depois de o razão aceitar. Se a produção falhar por falta de insumo, a
  // corrida continua aberta e a pessoa pode lançar a compra e fechar de novo -
  // em vez de perder o registro do tacho que rodou.
  const conn = await db();
  await conn.runAsync(`DELETE FROM production_runs WHERE id = ? AND company_id = ?`, [
    input.runId,
    companyId,
  ]);

  return result;
}

/** O que a loja disse ao abrir a caixa. */
export type CheckResult = {
  /** O grupo da transferência conferida. */
  groupId: string;
  /** Diferença por item: negativa quando faltou, zero quando bateu. */
  differences: { itemId: string; baseUnits: number }[];
};

/**
 * A loja abriu o que chegou e contou.
 *
 * Escreve UMA LINHA NOVA por item, nunca um carimbo na remessa: o gatilho
 * `movements_are_immutable` do servidor recusa qualquer UPDATE em `movements`,
 * sem exceção e sem olhar coluna. Não é preferência de desenho - é o que o
 * esquema permite.
 *
 * A linha que BATEU tem quantidade zero, e isso precisou de migração no
 * servidor (0017): a restrição `movement_moved_something` recusava linha que
 * não move nada, com uma exceção só para contagem de prateleira. Mas
 * "conferi e bateu" é justamente a conferência que mais vale - é a prova de que
 * alguém abriu a caixa -, e sem poder gravá-la o app não saberia distinguir
 * "ainda não conferiu" de "conferiu e estava tudo certo".
 *
 * A taxa gravada é a da perna de ENTRADA da remessa, não a média de hoje: o que
 * faltou foi a mercadoria que embarcou, ao custo com que embarcou. Ler o custo
 * atual avaliaria a falta de setembro ao preço de outubro.
 */
export async function recordCheck(
  companyId: string,
  input: {
    /** A remessa conferida, pelo grupo das duas pernas. */
    groupId: string;
    /**
     * O que a loja contou de verdade, por item, em unidade-base.
     *
     * Omitido significa "chegou tudo": cada perna vira uma diferença de zero. É
     * o caso comum e o único que alguém preenche na doca - e evita o erro de
     * escrever uma contagem agregada contra cada remessa quando o mesmo destino
     * recebeu duas cargas no mesmo dia, que contaria a mesma mercadoria duas
     * vezes.
     */
    counted?: { itemId: string; baseUnits: number }[];
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<CheckResult> {
  // A conferência da doca escreve `discrepancy`, que o servidor dá a quem confere.
  await podeGravar(companyId, 'discrepancy');
  const conn = await db();
  const at = nowIso();
  const occurred = input.occurredAt ?? at;

  // A remessa, lida pelas pernas de entrada: elas dizem o destino, a origem, o
  // que foi mandado e a que custo.
  const legs = await conn.getAllAsync<{
    item_id: string;
    quantity: number;
    location_id: string;
    counterpart: string | null;
    rate: number | null;
  }>(
    `SELECT item_id, quantity_base_units AS quantity, location_id,
            counterpart_location_id AS counterpart, unit_cost_rate AS rate
       FROM movements
      WHERE company_id = ? AND movement_group_id = ? AND quantity_base_units > 0`,
    [companyId, input.groupId],
  );

  if (legs.length === 0) throw new Error(`remessa ${input.groupId} não existe`);

  const differences: { itemId: string; baseUnits: number }[] = [];

  await conn.withTransactionAsync(async () => {
    for (const leg of legs) {
      const said = input.counted?.find((c) => c.itemId === leg.item_id);
      // Sem lista, tudo bateu. Com lista, item não mencionado é item que a
      // pessoa não conferiu - e não item que chegou zerado. A ausência não vira
      // acusação.
      if (input.counted && !said) continue;

      const difference = said ? Math.round(said.baseUnits) - leg.quantity : 0;
      differences.push({ itemId: leg.item_id, baseUnits: difference });

      const id = newId();
      await conn.runAsync(
        `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                                quantity_base_units, location_id, counterpart_location_id,
                                unit_cost_rate, movement_group_id, post, note, assistant_phrase,
                                operator_id)
         VALUES (?, ?, 'discrepancy', ?, ?, ?, ?, ?, ?, ?, ?, 'checked', ?, ?, ?)`,
        [
          id,
          companyId,
          occurred,
          at,
          leg.item_id,
          difference,
          leg.location_id,
          leg.counterpart,
          leg.rate,
          input.groupId,
          input.note ?? null,
          input.assistantPhrase ?? null,
          await currentOperatorId(),
        ],
      );
      await enqueue(conn, [{ table: 'movements', rowId: id }]);
    }
  });

  return { groupId: input.groupId, differences };
}

/** What a product put out inside a window, in base units. */
export type ProducedInWindow = {
  itemId: string;
  name: string;
  baseUnits: number;
};

/**
 * What came out of the kettle between two instants.
 *
 * The first query in this repository with a date window, and the reason it
 * arrives so late is worth writing down: `occurred_at` appears nine times in
 * this file and, until now, never once in a WHERE. The briefing could say what
 * a unit costs but not what today made.
 *
 * The window is filtered on `occurred_at` and NEVER on `recorded_at`, and the
 * two are different facts on purpose. A run entered offline at 23h50 and
 * synced at 01h belongs to the day it happened, not to the day the phone found
 * signal. Sorting the ledger by when the server heard about it is how a factory
 * ends up with a Monday that produced nothing and a Tuesday that produced
 * double.
 *
 * Half-open on purpose: `from` is included, `to` is not. Two consecutive days
 * asked back to back then cover every movement exactly once - with both ends
 * closed, a run at exactly midnight would be counted twice, and the person
 * comparing today against yesterday would see a number nobody produced.
 */
export async function productionOn(
  companyId: string,
  fromIso: string,
  toIso: string,
  /**
   * De onde é a pergunta. Sem escopo, a empresa inteira — e é isso que estava errado.
   *
   * *"O que esta fábrica fez hoje"* TEM lugar, e o lugar é a unidade. Com duas
   * unidades a manchete da capa contava as duas cidades enquanto o conselho logo
   * abaixo dela contava uma só, lado a lado, sem ninguém dizer que a régua mudou no
   * meio. Rendimento é que não tem lugar — mas rendimento é do lote, e é outra
   * pergunta.
   */
  onde?: Escopo,
): Promise<ProducedInWindow[]> {
  const conn = await db();
  const recorte = noEscopo('m.location_id', onde);
  const rows = await conn.getAllAsync<{ item_id: string; name: string; total: number }>(
    `SELECT m.item_id, i.name, SUM(m.quantity_base_units) AS total
       FROM movements m
       JOIN items i ON i.id = m.item_id
      WHERE m.company_id = ?
        AND m.kind = 'production'
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
        AND ${recorte.sql}
        AND ${NAO_ESTORNADO}
      GROUP BY m.item_id, i.name
      HAVING total > 0
      ORDER BY total DESC`,
    [companyId, fromIso, toIso, ...recorte.params],
  );

  return rows.map((r) => ({ itemId: r.item_id, name: r.name, baseUnits: r.total }));
}

/**
 * Cada corrida de produção do intervalo, com a hora em que aconteceu.
 *
 * Irmã de `productionOn`, e a diferença é de propósito: aquela devolve o total
 * já somado da janela, esta devolve os fatos soltos para quem precisa
 * distribuí-los por dia. Sete chamadas de `productionOn` responderiam a mesma
 * pergunta com sete varreduras do livro-razão.
 *
 * E ela devolve o instante, não o dia. O dia é uma conta que depende do fuso da
 * fábrica, e esta camada devolve fato — quem fala em segunda-feira é a tela,
 * com `dailySeries` no meio.
 */
export async function productionBetween(
  companyId: string,
  fromIso: string,
  toIso: string,
  /** A mesma pergunta de `productionOn`, e por isso o mesmo escopo. */
  onde?: Escopo,
): Promise<{ occurredAt: string; baseUnits: number }[]> {
  const conn = await db();
  const recorte = noEscopo('m.location_id', onde);
  const rows = await conn.getAllAsync<{ occurred_at: string; quantity_base_units: number }>(
    `SELECT occurred_at, quantity_base_units
       FROM movements m
      WHERE company_id = ?
        AND kind = 'production'
        AND occurred_at >= ?
        AND occurred_at < ?
        AND ${recorte.sql}
        AND ${NAO_ESTORNADO}
      ORDER BY occurred_at`,
    [companyId, fromIso, toIso, ...recorte.params],
  );

  return rows.map((r) => ({ occurredAt: r.occurred_at, baseUnits: r.quantity_base_units }));
}

/** Um lote do dia: o que ele é, quanto rendeu e até quando vale. */
export type LotOfDay = {
  id: string;
  code: string;
  name: string;
  baseUnits: number;
  expiresOn: string | null;
  /** O dia em que a corrida aconteceu. Nulo só em lote vindo de importação. */
  producedOn?: string | null;
  /**
   * O ato que criou este lote, para quem precisa desfazê-lo.
   *
   * Nulo em lote sem corrida (importação) - e nulo é resposta: não há ato para
   * estornar, então a tela não oferece o conserto.
   */
  runGroupId?: string | null;
  /**
   * A ficha que rodou: o nome dela e o NÚMERO da versão que estava valendo.
   *
   * Fato, nunca frase - "Picolé de morango, versão 3" é a tela quem escreve. E
   * é a versão daquele dia, não a de hoje: é isso que faz uma fórmula corrigida
   * em março parar de reescrever o que janeiro custou.
   *
   * Nulo em lote de importação e em lote gravado antes desta coluna existir.
   */
  recipeName?: string | null;
  recipeVersion?: number | null;
};

/**
 * Os lotes que nasceram numa janela, com o que cada um rendeu.
 *
 * Existe porque o código do lote é o número que alguém escreve de caneta na
 * caixa antes de ela ir para a câmara fria — e a primeira versão disto era um
 * diálogo depois de gravar, que o e2e derrubou com razão: um toque a mais na
 * ação mais frequente do dia, todo dia, para informar o que a tela seguinte
 * podia mostrar sozinha. Aqui o lote aparece sem pedir nada, e continua
 * disponível depois, que é quando alguém realmente procura.
 *
 * A quantidade vem do movimento e não do lote, porque é o livro-razão que sabe
 * quanto saiu: o lote é a identidade, o movimento é o fato.
 */
export async function lotsOn(
  companyId: string,
  fromIso: string,
  toIso: string,
  /**
   * De qual unidade são os lotes — e ela recorta pela PRODUÇÃO, não pelo saldo.
   *
   * O lote não tem lugar: quem tem é o movimento que o criou. Então "os lotes de
   * hoje aqui" é "os lotes cuja produção aconteceu aqui", e é isso que este recorte
   * lê. Sem ele a aba de Produção de Marília lista os lotes de Bauru — e na MESMA
   * tela a régua de acabar já se recorta pela unidade, o que faz o cartão de cima e
   * o de baixo falarem de fábricas diferentes.
   */
  onde?: Escopo,
): Promise<LotOfDay[]> {
  const conn = await db();
  const recorte = noEscopo('m.location_id', onde);
  const rows = await conn.getAllAsync<{
    id: string;
    code: string;
    name: string;
    total: number;
    expires_on: string | null;
  }>(
    `SELECT l.id, l.code, i.name, l.expires_on,
            COALESCE(SUM(m.quantity_base_units), 0) AS total
       FROM lots l
       JOIN items i ON i.id = l.item_id
       JOIN movements m ON m.lot_id = l.id AND m.kind = 'production'
      WHERE l.company_id = ?
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
        AND ${recorte.sql}
        AND ${NAO_ESTORNADO}
      GROUP BY l.id, l.code, i.name, l.expires_on
      ORDER BY l.code DESC`,
    [companyId, fromIso, toIso, ...recorte.params],
  );

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    baseUnits: r.total,
    expiresOn: r.expires_on,
  }));
}

/**
 * A faixa aceitável de uma grandeza num lugar.
 *
 * Sem faixa, a leitura é registrada e não julga nada — que é a resposta certa: o
 * aplicativo não sabe qual é a temperatura boa da câmara de outra pessoa, e
 * chutar -18 porque é o número comum de freezer seria inventar o que ele não
 * mediu.
 */
export type SensorRange = { min: number | null; max: number | null; unit: string };

/**
 * As faixas como estrutura, tolerando o que o disco tiver.
 *
 * Texto escrito por uma versão anterior: chave estranha é ignorada, faixa quebrada
 * é ignorada, e JSON inválido devolve vazio. Faixa que não pôde ser lida vira
 * "não julgo" em vez de vira alarme aleatório — é a mesma escolha da leitura
 * tolerante da configuração de avisos.
 */
function parseSensorRanges(json: string): Record<string, SensorRange> {
  let raw: unknown;
  try {
    raw = JSON.parse(json || '{}');
  } catch {
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const out: Record<string, SensorRange> = {};
  for (const [kind, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof valor !== 'object' || valor === null) continue;
    const { min, max, unit } = valor as { min?: unknown; max?: unknown; unit?: unknown };
    if (typeof unit !== 'string' || !unit.trim()) continue;
    out[kind] = {
      min: typeof min === 'number' && Number.isFinite(min) ? min : null,
      max: typeof max === 'number' && Number.isFinite(max) ? max : null,
      unit,
    };
  }
  return out;
}

/** Uma leitura, como ela sai do banco. */
export type Reading = {
  id: string;
  locationId: string;
  kind: string;
  value: number;
  unit: string;
  takenAt: string;
  source: string;
};

/**
 * Anota uma leitura — digitada agora, ou vinda de um sensor depois.
 *
 * `source` é o que diferencia, e é texto aberto de propósito: quando o ESP32 do
 * dono existir, ele grava com `source: 'wifi'` e nada mais muda aqui. É a mesma
 * forma da entrada no chão de fábrica, que a F7 resolveu: os dois caminhos
 * existem, e quem escolhe é a fábrica.
 */
export async function recordReading(
  companyId: string,
  input: {
    locationId: string;
    kind: string;
    value: number;
    unit: string;
    takenAt?: string;
    deviceId?: string | null;
    source?: string;
  },
): Promise<Reading> {
  if (!Number.isFinite(input.value)) throw new Error('uma leitura que não é número não é leitura');
  if (!input.unit.trim()) throw new Error('uma grandeza sem unidade é um número solto');

  const conn = await db();
  const at = nowIso();
  const id = newId();
  const takenAt = input.takenAt ?? at;

  await conn.withTransactionAsync(async () => {
    await ensureLocation(conn, companyId);
    await conn.runAsync(
      `INSERT INTO readings
         (id, company_id, location_id, device_id, kind, value, unit, taken_at, recorded_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        input.locationId,
        input.deviceId ?? null,
        input.kind,
        input.value,
        input.unit.trim(),
        takenAt,
        at,
        input.source ?? 'typed',
      ],
    );
    await enqueue(conn, [{ table: 'readings', rowId: id }]);
  });

  return {
    id,
    locationId: input.locationId,
    kind: input.kind,
    value: input.value,
    unit: input.unit.trim(),
    takenAt,
    source: input.source ?? 'typed',
  };
}

/**
 * A última leitura de cada grandeza, por lugar.
 *
 * Uma consulta para todos os lugares em vez de uma por lugar: a tela mostra a
 * lista inteira, e é a mesma razão pela qual a lista de embalagem vem junta.
 */
export async function lastReadings(companyId: string): Promise<Reading[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    location_id: string;
    kind: string;
    value: number;
    unit: string;
    taken_at: string;
    source: string;
  }>(
    `SELECT r.id, r.location_id, r.kind, r.value, r.unit, r.taken_at, r.source
       FROM readings r
       JOIN (
         SELECT location_id, kind, MAX(taken_at) AS quando
           FROM readings
          WHERE company_id = ?
          GROUP BY location_id, kind
       ) ultima
         ON ultima.location_id = r.location_id
        AND ultima.kind = r.kind
        AND ultima.quando = r.taken_at
      WHERE r.company_id = ?
      ORDER BY r.location_id, r.kind`,
    [companyId, companyId],
  );

  return rows.map((r) => ({
    id: r.id,
    locationId: r.location_id,
    kind: r.kind,
    value: r.value,
    unit: r.unit,
    takenAt: r.taken_at,
    source: r.source,
  }));
}

/** A série de uma grandeza num lugar, do mais antigo para o mais novo. */
export async function readingsBetween(
  companyId: string,
  locationId: string,
  kind: string,
  fromIso: string,
  toIso: string,
): Promise<{ takenAt: string; value: number }[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ taken_at: string; value: number }>(
    `SELECT taken_at, value FROM readings
      WHERE company_id = ? AND location_id = ? AND kind = ?
        AND taken_at >= ? AND taken_at < ?
      ORDER BY taken_at ASC`,
    [companyId, locationId, kind, fromIso, toIso],
  );
  return rows.map((r) => ({ takenAt: r.taken_at, value: r.value }));
}

/** Uma corrida, do jeito que ela aparece num histórico curto. */
export type Run = {
  lotId: string | null;
  code: string | null;
  name: string;
  baseUnits: number;
  occurredAt: string;
  /** A taxa congelada daquela corrida, em centavos fracionários por unidade. */
  unitCostRate: number | null;
};

/**
 * As últimas corridas, mais recente primeiro.
 *
 * A capa mostrava só o total do dia, e total do dia não responde "como estamos
 * indo": três corridas de 100 e uma de 300 dão o mesmo número e são semanas
 * diferentes. O histórico curto é o que transforma um número em tendência sem
 * abrir relatório.
 *
 * Uma linha por movimento de produção, e não por lote: o lote é a identidade, o
 * movimento é o fato — e é o fato que tem hora e taxa congelada.
 */
export async function recentRuns(
  companyId: string,
  limit = 6,
  /**
   * De qual unidade são as corridas. Sem recorte, da empresa inteira.
   *
   * A lista não SOMA errado sem isto — ela para de dizer QUEM produziu. Com duas
   * unidades, "as últimas seis corridas" mistura duas fábricas numa lista sem
   * coluna de lugar, e quem lê conclui que a própria unidade produziu o que a outra
   * produziu. É meia verdade num cartão, que este projeto já decidiu ser pior que
   * silêncio.
   */
  onde?: Escopo,
): Promise<Run[]> {
  const conn = await db();
  const recorte = noEscopo('m.location_id', onde);
  /**
   * O único campo de dinheiro do app que já nascia podendo ser nulo — e as duas
   * telas que o leem já filtram por `!== null` antes de desenhar
   * (`app/(tabs)/reports.tsx`, `src/home/Mosaic.tsx`). Então o portão fechado aqui
   * não pede uma linha de tela: a peça do custo simplesmente não existe, que é o
   * mesmo que o servidor faz na sua view desde a `0008`.
   */
  const dinheiro = await canSeeMoney(companyId);
  const rows = await conn.getAllAsync<{
    lot_id: string | null;
    code: string | null;
    name: string;
    quantity_base_units: number;
    occurred_at: string;
    unit_cost_rate: number | null;
  }>(
    `SELECT m.lot_id, l.code, i.name, m.quantity_base_units, m.occurred_at, m.unit_cost_rate
       FROM movements m
       JOIN items i ON i.id = m.item_id
       LEFT JOIN lots l ON l.id = m.lot_id
      WHERE m.company_id = ? AND m.kind = 'production' AND m.quantity_base_units > 0
        AND ${recorte.sql}
        AND ${NAO_ESTORNADO}
      ORDER BY m.occurred_at DESC
      LIMIT ?`,
    [companyId, ...recorte.params, limit],
  );

  return rows.map((r) => ({
    lotId: r.lot_id,
    code: r.code,
    name: r.name,
    baseUnits: r.quantity_base_units,
    occurredAt: r.occurred_at,
    unitCostRate: dinheiro ? r.unit_cost_rate : null,
  }));
}

/** Um lote perto do fim da validade, com o que ainda existe dele. */
export type Expiring = {
  lotId: string;
  code: string;
  name: string;
  expiresOn: string;
  baseUnits: number;
};

/**
 * O que vence primeiro, do que ainda está em estoque.
 *
 * `lotsOn` responde "o que nasceu nesta janela", que é outra pergunta. Esta
 * responde a que decide: o que sai primeiro do freezer, e quanto disso ainda
 * existe. Lote já esgotado não aparece — avisar sobre a validade de uma caixa
 * que já foi embora é o alerta inventado que a fábrica aprende a ignorar.
 *
 * A soma é POR LUGAR, e essa é a decisão que faz a peça servir.
 *
 * A carga leva o lote nas duas pernas — sai da fábrica, chega na loja —, então o
 * saldo do lote na EMPRESA não muda quando ele viaja: as caixas continuam
 * existindo. Somar a empresa faria a fábrica continuar sendo avisada de um lote
 * que já foi embora, que é o alerta que ensina a ignorar alerta. Somando a sala,
 * a pergunta passa a ser a que decide: o que vence primeiro DO QUE ESTÁ AQUI.
 *
 * **E a UNIDADE é o que resolve uma contradição que estava escrita em dois lugares
 * — achada em 8 de setembro.** Este docblock dizia que somar a empresa está errado
 * (*"a fábrica continua sendo avisada de um lote que já foi embora"*) e que somar a
 * SALA é o certo. O chamador na capa dizia o contrário, com razão igual: filtrar
 * pelo almoxarifado **silenciava** o aviso no dia em que o picolé ia para a câmara
 * fria, que é o dia seguinte ao de produzi-lo — *"dali em diante este cartão nunca
 * mais avisava de nada, e o produto vencia dentro dela"*.
 *
 * Os dois estavam certos sobre a falha do outro, e nenhum dos dois tinha a forma:
 * a granularidade que serve não é sala nem empresa, é **a unidade e as salas dentro
 * dela**. O lote que foi para a câmara fria continua aqui; o que foi entregue numa
 * loja não está mais, e avisar sobre ele é o alerta que ensina a ignorar alerta.
 *
 * Sem escopo, a soma continua sendo da empresa — o que serve para uma tela que
 * pergunta pela empresa, e não é o caso de nenhuma hoje.
 */
export async function expiringSoon(
  companyId: string,
  throughDate: string,
  limit = 5,
  /** De onde é a pergunta: sala, unidade, ou a empresa inteira. Ver `Escopo`. */
  onde?: Escopo,
): Promise<Expiring[]> {
  const conn = await db();
  const recorte = noEscopo('m.location_id', onde);
  const rows = await conn.getAllAsync<{
    id: string;
    code: string;
    name: string;
    expires_on: string;
    total: number;
  }>(
    `SELECT l.id, l.code, i.name, l.expires_on,
            COALESCE(SUM(m.quantity_base_units), 0) AS total
       FROM lots l
       JOIN items i ON i.id = l.item_id
       JOIN movements m ON m.lot_id = l.id
      WHERE l.company_id = ?
        AND l.expires_on IS NOT NULL
        AND l.expires_on <= ?
        AND ${recorte.sql}
      GROUP BY l.id, l.code, i.name, l.expires_on
     HAVING SUM(m.quantity_base_units) > 0
      ORDER BY l.expires_on ASC
      LIMIT ?`,
    [companyId, throughDate, ...recorte.params, limit],
  );

  return rows.map((r) => ({
    lotId: r.id,
    code: r.code,
    name: r.name,
    expiresOn: r.expires_on,
    baseUnits: r.total,
  }));
}

/**
 * Os lotes de um item que ainda existem numa sala, o mais velho primeiro.
 *
 * É o que permite a carga sair sem perguntar de qual lote: quem despacha não
 * escolhe lote, despacha o que está na frente — e o que está na frente é o que
 * vence primeiro. A Lei 1 na forma mais direta: o sistema sabe, então não
 * pergunta.
 *
 * Lote sem validade vai para o fim, não para o começo: sem data não há pressa, e
 * mandar primeiro o que não vence deixaria o que vence envelhecendo na câmara.
 */
export async function lotsInStock(
  companyId: string,
  itemId: string,
  locationId: string,
): Promise<{ lotId: string; code: string; expiresOn: string | null; baseUnits: number }[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    code: string;
    expires_on: string | null;
    total: number;
  }>(
    `SELECT l.id, l.code, l.expires_on, COALESCE(SUM(m.quantity_base_units), 0) AS total
       FROM lots l
       JOIN movements m ON m.lot_id = l.id
      WHERE l.company_id = ? AND l.item_id = ? AND m.location_id = ?
      GROUP BY l.id, l.code, l.expires_on
     HAVING SUM(m.quantity_base_units) > 0
      ORDER BY l.expires_on IS NULL, l.expires_on ASC, l.code ASC`,
    [companyId, itemId, locationId],
  );

  return rows.map((r) => ({
    lotId: r.id,
    code: r.code,
    expiresOn: r.expires_on,
    baseUnits: r.total,
  }));
}

/** Um lote que estava numa sala num instante, com o que havia dele. */
export type LotInRoom = {
  lotId: string;
  code: string;
  /** O nome do produto, porque "20260902-01" sozinho não manda ninguém a lugar nenhum. */
  name: string;
  baseUnits: number;
  expiresOn: string | null;
};

/**
 * O que estava dentro de uma sala num instante — a pergunta que a fundação
 * promete desde a primeira linha e que nenhuma tela sabia fazer.
 *
 * O docblock do livro-razão diz, entre o que o modelo append-only compra de
 * graça: *"a habilidade de responder 'o que estava dentro do freezer às 03:12?'
 * — que é como uma excursão de temperatura lista os lotes expostos sem ninguém
 * ter anotado nada"*. O domínio chegou a ter a dobra em memória para isso, e ela
 * morreu por forma: o aplicativo não tem os movimentos em memória, tem SQLite. A
 * consulta é esta, e o corte no tempo é o que a torna a resposta certa.
 *
 * **Por que o instante importa, e não serve olhar o saldo de agora.** A leitura
 * ruim foi às 07:20 e alguém abre a tela às 15:00; entre as duas horas uma carga
 * pode ter saído. O que ficou exposto é o que estava lá NAQUELA hora, e é isso
 * que um recall precisa. `occurred_at <= ?` é a diferença inteira entre as duas
 * perguntas.
 *
 * Devolve fato: lote, produto, quantidade e validade. Quem escreve "três lotes
 * estavam na câmara" é a tela.
 */
export async function lotsInRoomAt(
  companyId: string,
  locationId: string,
  instantIso: string,
): Promise<LotInRoom[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    code: string;
    name: string;
    expires_on: string | null;
    total: number;
  }>(
    `SELECT l.id, l.code, i.name, l.expires_on,
            COALESCE(SUM(m.quantity_base_units), 0) AS total
       FROM lots l
       JOIN items i ON i.id = l.item_id
       JOIN movements m ON m.lot_id = l.id
      WHERE l.company_id = ?
        AND m.location_id = ?
        AND m.occurred_at <= ?
      GROUP BY l.id, l.code, i.name, l.expires_on
     HAVING SUM(m.quantity_base_units) > 0
      ORDER BY total DESC, l.code ASC`,
    [companyId, locationId, instantIso],
  );

  return rows.map((r) => ({
    lotId: r.id,
    code: r.code,
    name: r.name,
    baseUnits: r.total,
    expiresOn: r.expires_on,
  }));
}

/**
 * Um lote, com tudo o que a etiqueta dele precisa dizer.
 *
 * Devolve nulo quando o lote não existe - e não lança. Etiqueta se abre por
 * link, e link envelhece: alguém guarda o endereço, o dado é apagado, e a tela
 * tem que saber dizer "esse lote não está mais aqui" em vez de quebrar.
 *
 * **Aceita o id OU o código impresso**, e essa é a diferença entre uma etiqueta
 * bonita e uma etiqueta que serve. O QR carrega o CÓDIGO (`app/lots/[id].tsx`
 * imprime `lote.code`) e esta consulta só conhecia o id: quem bipasse a caixa —
 * ou digitasse os onze caracteres, como a própria tela promete para quando a
 * etiqueta congela e descasca — não chegava a lugar nenhum. O código era um
 * endereço que não existia.
 *
 * Os dois formatos não se confundem: id é uuid, código é `AAAAMMDD-NN`. Procurar
 * pelos dois na mesma consulta é uma comparação a mais e nenhuma ambiguidade.
 */
export async function findLot(companyId: string, lotId: string): Promise<LotOfDay | null> {
  const conn = await db();
  const row = await conn.getFirstAsync<{
    id: string;
    code: string;
    name: string;
    total: number;
    expires_on: string | null;
    produced_on: string | null;
    group_id: string | null;
    recipe_name: string | null;
    recipe_version: number | null;
  }>(
    // As duas juntas à esquerda de propósito: lote de importação não tem ficha,
    // e ele continua abrindo a tela inteira em vez de sumir da consulta.
    `SELECT l.id, l.code, i.name, l.expires_on, l.produced_on,
            r.name AS recipe_name, v.version AS recipe_version,
            COALESCE(SUM(m.quantity_base_units), 0) AS total,
            MAX(m.movement_group_id) AS group_id
       FROM lots l
       JOIN items i ON i.id = l.item_id
       LEFT JOIN recipe_versions v ON v.id = l.recipe_version_id
       LEFT JOIN recipes r ON r.id = v.recipe_id
       LEFT JOIN movements m ON m.lot_id = l.id AND m.kind = 'production'
      WHERE l.company_id = ? AND (l.id = ? OR l.code = ?)
      GROUP BY l.id, l.code, i.name, l.expires_on, l.produced_on, r.name, v.version`,
    [companyId, lotId, lotId],
  );

  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    baseUnits: row.total,
    expiresOn: row.expires_on,
    producedOn: row.produced_on,
    runGroupId: row.group_id,
    recipeName: row.recipe_name,
    recipeVersion: row.recipe_version,
  };
}

/** O que uma loja pediu e ainda não recebeu: a lista de separação. */
export type PickLine = {
  itemId: string;
  name: string;
  /** Quanto foi pedido, somando os pedidos em aberto daquela loja. */
  ordered: number;
  /**
   * Quantos pedidos entraram nessa soma.
   *
   * A tela dizia "pedido para 05/09: 800 un" — singular, com a data do primeiro
   * e a quantidade de todos. Uma loja com 500 para sexta e 300 para segunda lia
   * uma frase que afirmava um pedido só. Somar e rotular no singular é a única
   * combinação que mente, e a contagem é fato: a soma já estava aqui.
   */
  orders: number;
  /** Quanto disso a fábrica tem hoje, no lugar de onde a carga sai. */
  available: number;
  /**
   * Quanto já chegou nessa loja HOJE, deste item — líquido do que voltou.
   *
   * Fica ao lado de `ordered` em vez de descontado dele: a subtração é regra e
   * mora no domínio, e a tela precisa dos dois números para poder dizer "pedido
   * 500, já foram 300" em vez de mostrar 200 sem explicar de onde saiu.
   *
   * Conta transferência e devolução no mesmo saco porque as duas mexem no que a
   * loja tem em mãos: 300 que chegaram e 100 que voltaram são 200 recebidos. O
   * que NÃO entra é perda e contagem na loja — elas mudam o estoque de lá, não o
   * que a fábrica entregou.
   */
  sentToday: number;
  /** Para quando é o mais urgente dos pedidos. */
  dueOn: string | null;
};

/**
 * A separação: o que tirar do freezer para uma loja.
 *
 * A tela de transferência já sabia sugerir uma quantidade — a do último envio
 * para aquela loja. É um bom palpite quando a fábrica repõe por hábito, e é o
 * palpite errado quando existe um pedido: quem separa não quer repetir a semana
 * passada, quer atender o que foi combinado.
 *
 * A lista NÃO reserva nada e não escreve no livro-razão. Ela lê pedido, que é
 * demanda, e devolve fato: pedido, disponível e para quando. A carga continua
 * sendo o único evento que move estoque — e é ela, mais tarde, que fecha o
 * pedido.
 *
 * `available` sai da sala de onde a carga vai sair, não do total da empresa: de
 * nada adianta saber que a fábrica tem trezentos se eles estão na outra câmara.
 *
 * **E ela conta o que já foi hoje.** Quem carrega o caminhão faz duas viagens até
 * o freezer — o `ordersCoveredBy` já sabia disso e por isso fecha pedido pelo DIA
 * e não pela carga. A lista não sabia: depois de mandar 300 de um pedido de 500
 * ela devolvia 500 de novo, e o campo da tela oferecia mandar 800 contra um
 * pedido de 500. O tipo `PickLine` sempre disse "o que uma loja pediu e ainda NÃO
 * RECEBEU"; era a conta que não descontava o recebido.
 *
 * O recorte é o dia, o mesmo do fechamento, e a aproximação é a mesma que ele já
 * aceita: carga de hoje conta contra pedido aberto de hoje. Um pedido novo
 * anotado depois de a carga sair começa descontado — e isso se corrige sozinho
 * amanhã, que é mais barato do que a alternativa de mandar duas vezes.
 */
export async function pickingFor(
  companyId: string,
  placeId: string,
  fromLocationId: string,
  through: string,
  /** Começo do dia de quem carrega, no fuso dele (`dayWindow`). */
  sinceIso: string,
  /** Fim desse dia. */
  untilIso: string,
): Promise<PickLine[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    ordered: number;
    orders: number;
    available: number;
    sent_today: number;
    due_on: string | null;
  }>(
    `SELECT ol.item_id, i.name,
            SUM(ol.base_units) AS ordered,
            COUNT(DISTINCT o.id) AS orders,
            MIN(o.requested_for) AS due_on,
            (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = o.company_id
                AND m.item_id = ol.item_id
                AND m.location_id = ?) AS available,
            -- O que caiu na loja hoje, líquido: a transferência entra positiva
            -- lá e a devolução sai negativa, então somar as duas dá o recebido.
            (SELECT COALESCE(SUM(m2.quantity_base_units), 0) FROM movements m2
              WHERE m2.company_id = o.company_id
                AND m2.item_id = ol.item_id
                AND m2.location_id = o.place_id
                AND m2.kind IN ('transfer', 'return')
                AND m2.occurred_at >= ?
                AND m2.occurred_at < ?
                AND ${naoEstornado('m2')}) AS sent_today
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       JOIN items i ON i.id = ol.item_id
      WHERE o.company_id = ?
        AND o.place_id = ?
        AND o.status IN ('pending', 'open')
        AND (o.requested_for IS NULL OR o.requested_for <= ?)
      GROUP BY ol.item_id, i.name
      HAVING ordered > 0
      ORDER BY due_on, i.name COLLATE NOCASE`,
    [fromLocationId, sinceIso, untilIso, companyId, placeId, through],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    ordered: r.ordered,
    orders: r.orders,
    available: r.available,
    sentToday: r.sent_today,
    dueOn: r.due_on,
  }));
}

/** One destination's share of a day: who received it, and what. */
export type Shipment = {
  /**
   * Os grupos das remessas que caíram neste destino hoje.
   *
   * A tela fala por destino, como o desenho manda, mas a conferência é por
   * REMESSA - uma loja pode receber duas cargas no mesmo dia, e quem abre a
   * segunda caixa não está conferindo a primeira.
   */
  groupIds: string[];
  locationId: string;
  locationName: string;
  /** Mesmo tipo que `Place.kind`: texto, como o resto do repositório o trata. */
  kind: string;
  /**
   * Quem levou, quando não foi o carro da fábrica. Nulo é resposta.
   *
   * É o LEITOR que justifica a coluna existir: `suppliers` está no esquema desde
   * a fundação sem ninguém que a leia, e foi por isso que `carrier_id` não entrou
   * antes desta tela.
   */
  carrierName: string | null;
  /**
   * A embalagem vem junto porque toda tela que mostra isto precisa dizer a
   * quantidade na unidade que a pessoa manuseia - e porque é a única forma
   * honesta de saber quais itens TÊM caixa. Fato, não frase: a conversão em
   * palavras continua sendo da tela.
   */
  items: {
    itemId: string;
    name: string;
    baseUnits: number;
    /**
     * A unidade de uso, que é o que falta para o número ser dizível.
     *
     * A embalagem já vinha, e sozinha ela não resolve: item sem camada de caixa
     * — açúcar, polpa, palito — tem só a faixa `unit`, e mandá-la para
     * `formatPacked` faz o aplicativo chamar grama de "unidade". Foi o que
     * acontecia: a capa dizia "6.000 unidades de Açúcar cristal" para seis
     * quilos, e a aba de transporte imprimia "6.000" sem unidade nenhuma.
     */
    baseUnit: string;
    packaging: PackagingHierarchy;
  }[];
  /** Se alguém já abriu a caixa e contou. */
  checked: boolean;
};

/**
 * What left the factory between two instants, grouped by where it landed.
 *
 * A transfer writes two legs - one negative where it left, one positive where
 * it arrived - so "where did it go" reads the POSITIVE legs and groups by
 * `location_id`, which on that leg is the destination. `counterpart_location_id`
 * says where it came from; the V6 migration added it and, until this function,
 * no query in this repository had ever read it back.
 *
 * The result stays in base units on purpose. Turning grams and popsicles into
 * "caixas" is a sentence, not a fact, and it cannot be done here: `breakdown()`
 * works per item, and an item with no box layer - sugar, pulp - has no box to
 * be counted in. A repository that returned "18 cx" would have invented a unit
 * for half the rows.
 */
export async function shipmentsOn(
  companyId: string,
  fromIso: string,
  toIso: string,
  /**
   * De qual unidade saiu a carga — e o recorte é na CONTRAPARTE, não em `location_id`.
   *
   * **Isto é o oposto de todas as outras desta família, e recortar pela coluna de
   * sempre devolveria tela vazia.** A consulta escolhe a perna POSITIVA
   * (`quantity_base_units > 0`), que é a que chega — e ela está na LOJA. Quem responde
   * *"de onde isto saiu"* é `counterpart_location_id`, que `moveBetween` grava nas duas
   * pernas justamente para esta pergunta.
   *
   * Sem esta distinção o recorte por unidade pediria "cargas cujo destino é a nossa
   * unidade", que é o conjunto vazio: a capa da fábrica de Marília mostraria zero
   * entregas no dia em que ela entregou trinta.
   */
  onde?: Escopo,
): Promise<Shipment[]> {
  const conn = await db();
  const deOndeSaiu = noEscopo('m.counterpart_location_id', onde);
  const rows = await conn.getAllAsync<{
    location_id: string;
    location_name: string;
    kind: string;
    carrier_name: string | null;
    group_id: string;
    item_id: string;
    item_name: string;
    base_unit: string;
    packaging: string;
    total: number;
    checked: number;
  }>(
    `SELECT m.movement_group_id AS group_id, m.location_id, l.name AS location_name, l.kind,
            m.item_id, i.name AS item_name, i.base_unit, i.packaging,
            t.name AS carrier_name,
            SUM(m.quantity_base_units) AS total,
            EXISTS (
              SELECT 1 FROM movements c
               WHERE c.company_id = m.company_id
                 AND c.movement_group_id = m.movement_group_id
                 AND c.post = 'checked'
            ) AS checked
       FROM movements m
       JOIN locations l ON l.id = m.location_id
       JOIN items i ON i.id = m.item_id
       -- LEFT, e é a diferença entre mostrar quem levou e esconder a carga: a
       -- maioria das entregas é com o carro da fábrica, e um JOIN comum apagaria
       -- todas elas da tela.
       LEFT JOIN carriers t ON t.id = m.carrier_id
      WHERE m.company_id = ?
        AND m.kind = 'transfer'
        AND m.quantity_base_units > 0
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
        AND ${deOndeSaiu.sql}
        AND ${NAO_ESTORNADO}
      GROUP BY m.movement_group_id, m.location_id, l.name, l.kind, m.item_id, i.name, i.base_unit,
               i.packaging, t.name
      HAVING total > 0
      ORDER BY l.name, total DESC`,
    [companyId, fromIso, toIso, ...deOndeSaiu.params],
  );

  const byPlace = new Map<string, Shipment>();
  /** Por destino, os jeitos que a carga foi hoje. Um só nome vira frase. */
  const quemLevou = new Map<string, Set<string | null>>();
  for (const r of rows) {
    const place = byPlace.get(r.location_id) ?? {
      groupIds: [],
      locationId: r.location_id,
      locationName: r.location_name,
      kind: r.kind,
      carrierName: null,
      items: [],
      checked: true,
    };
    // Quem levou é dito só quando FOI UM SÓ.
    //
    // Duas cargas no mesmo dia para a mesma loja podem ter ido de jeitos
    // diferentes — uma na transportadora, outra no carro da casa. A primeira
    // versão mostrava a primeira que aparecesse, e o teste de mordida não a
    // pegou porque o exemplo tinha uma carga por destino; pensar no caso que
    // faltava mostrou que a regra estava errada, não o teste. Meia verdade num
    // cartão é pior que silêncio: quem lê "levou Transportes Silva" conclui que
    // tudo foi com eles. Divergiu, cala — e quem quiser as duas abre o destino.
    quemLevou.set(r.location_id, (quemLevou.get(r.location_id) ?? new Set()).add(r.carrier_name));

    // Conferido só quando TODAS as remessas do dia para lá foram conferidas: um
    // "conferido" que ignora a carga da tarde é pior que nenhum.
    if (!place.groupIds.includes(r.group_id)) {
      place.groupIds.push(r.group_id);
      if (r.checked !== 1) place.checked = false;
    }
    const existing = place.items.find((i) => i.itemId === r.item_id);
    if (existing) existing.baseUnits += r.total;
    else
      place.items.push({
        itemId: r.item_id,
        name: r.item_name,
        baseUnits: r.total,
        baseUnit: r.base_unit,
        packaging: parsePackaging(r.packaging),
      });
    byPlace.set(r.location_id, place);
  }


  for (const place of byPlace.values()) {
    const jeitos = [...(quemLevou.get(place.locationId) ?? new Set())];
    place.carrierName = jeitos.length === 1 && jeitos[0] ? jeitos[0] : null;
  }
  return [...byPlace.values()];
}

/**
 * When one of these items last actually changed price.
 *
 * "Estável há doze dias" is a conclusion, and this is the fact under it. Only a
 * row where the rate MOVED counts: `item_cost_history` also records the first
 * price an item ever had, and treating that as a change would say the cost
 * moved on the day the item was registered - which is the day nothing was known
 * yet, not the day something happened.
 *
 * Returns null when no item in the list has ever moved. The screen says that in
 * words; a repository does not invent a date to fill a sentence.
 */
export async function lastCostMove(
  companyId: string,
  itemIds: readonly string[],
): Promise<string | null> {
  if (itemIds.length === 0) return null;

  const conn = await db();
  const marks = itemIds.map(() => '?').join(', ');
  const row = await conn.getFirstAsync<{ observed_at: string }>(
    `SELECT observed_at
       FROM item_cost_history
      WHERE company_id = ?
        AND item_id IN (${marks})
        AND previous_rate IS NOT NULL
        AND previous_rate <> new_rate
      ORDER BY observed_at DESC
      LIMIT 1`,
    [companyId, ...itemIds],
  );

  return row?.observed_at ?? null;
}

// --- erasing -----------------------------------------------------------------

/**
 * Counts everything the confirmation dialog needs to speak in real numbers,
 * including the references that block an area from being cleared.
 *
 * One round trip per fact would be simpler to read and slower to run on a cold
 * phone; one query that returns them together keeps the settings screen instant.
 */
export async function countForErase(companyId: string): Promise<EraseCounts> {
  const conn = await db();
  const row = await conn.getFirstAsync<Record<keyof EraseCounts, number>>(
    `SELECT
       (SELECT COUNT(*) FROM items WHERE company_id = ?1
          AND kind IN ('input','packaging','store_supply')) AS inputs,
       (SELECT COUNT(*) FROM movements WHERE company_id = ?1) AS movements,
       (SELECT COUNT(*) FROM movements m JOIN items i ON i.id = m.item_id
          WHERE m.company_id = ?1
            AND i.kind IN ('product','resale')) AS movementsOfProducts,
       (SELECT COUNT(*) FROM recipes   WHERE company_id = ?1) AS recipes,
       (SELECT COUNT(*) FROM products  WHERE company_id = ?1) AS products,
       (SELECT COUNT(*) FROM locations WHERE company_id = ?1
          AND id <> ?1) AS places,
       (SELECT COUNT(*) FROM purchases WHERE company_id = ?1) AS purchases,
       (SELECT COUNT(*) FROM people    WHERE company_id = ?1) AS people,
       (SELECT COUNT(*) FROM carriers  WHERE company_id = ?1) AS carriers,
       (SELECT COUNT(*) FROM readings  WHERE company_id = ?1) AS readings,
       -- A grade é um número só: linha, tipo e sabor são três tabelas e uma coisa.
       (SELECT (SELECT COUNT(*) FROM product_lines WHERE company_id = ?1)
             + (SELECT COUNT(*) FROM product_types WHERE company_id = ?1)
             + (SELECT COUNT(*) FROM flavors       WHERE company_id = ?1)) AS grid,
       (SELECT COUNT(*) FROM sale_price_history WHERE company_id = ?1) AS salePrices,
       (SELECT COUNT(*) FROM location_prices    WHERE company_id = ?1) AS agreedPrices,
       (SELECT COUNT(*) FROM lots      WHERE company_id = ?1) AS lots,
       (SELECT COUNT(*) FROM orders    WHERE company_id = ?1) AS orders,
       (SELECT COUNT(*) FROM recipe_lines WHERE company_id = ?1
          AND item_id IS NOT NULL) AS recipeLinesUsingInputs,
       (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
          WHERE pl.company_id = ?1
            AND i.kind IN ('input','packaging','store_supply')) AS purchaseLinesUsingItems,
       (SELECT COUNT(*) FROM products WHERE company_id = ?1
          AND recipe_id IS NOT NULL) AS productsUsingRecipes,
       (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
          WHERE pl.company_id = ?1
            AND i.kind IN ('product','resale')) AS purchaseLinesUsingProducts`,
    [companyId],
  );

  return { ...emptyCounts, ...(row ?? {}) };
}

/**
 * Clears an area, in the only order the foreign keys allow.
 *
 * It refuses rather than half-succeeds: the blocker is checked first, and the
 * whole thing runs in one transaction, so an interruption cannot leave a recipe
 * whose ingredients are gone. Half-erased data is worse than either state.
 */
export async function eraseArea(companyId: string, area: EraseArea): Promise<void> {
  // A decisão do dono, 7 de setembro, restringe este ato por nome: *"obviamente q
  // apenas o adm pode fazer isso"*. Até 9 de setembro nada conferia — o celular
  // emprestado, que a mesma casa limita a produção e nada mais, apagava o livro
  // inteiro com dois toques. A checagem vem antes de `countForErase` porque quem não
  // pode apagar também não precisa saber quanto há para apagar.
  await exigirCapacidade(companyId, 'manage_company', 'apagar o livro da empresa');

  const blocker = blockerFor(area, await countForErase(companyId));
  if (blocker) throw new EraseBlockedError(blocker);

  const conn = await db();
  const kinds = itemKindsFor(area);

  await conn.withTransactionAsync(async () => {
    for (const table of tablesFor(area)) {
      // `items` is the one table shared by two areas, so it is the one place a
      // delete has to say which kinds it owns.
      if (table === 'items' && kinds) {
        // `marks` is only ever question marks; the kinds themselves are bound.
        const marks = kinds.map(() => '?').join(', ');
        await conn.runAsync(
          `DELETE FROM items WHERE company_id = ? AND kind IN (${marks})`, // proofgate-allow
          [companyId, ...kinds],
        );
      } else if (table === 'products' && area === 'products') {
        await conn.runAsync(`DELETE FROM products WHERE company_id = ?`, [companyId]);
        await conn.runAsync(
          `DELETE FROM items WHERE company_id = ? AND kind IN ('product','resale')`,
          [companyId],
        );
      } else if (table === 'outbox') {
        await conn.runAsync(`DELETE FROM outbox`);
      } else {
        // The table name comes from `ErasableTable`, a closed union, so this
        // interpolation cannot carry anything a caller chose.
        await conn.runAsync(`DELETE FROM ${table} WHERE company_id = ?`, [companyId]); // proofgate-allow
      }
    }

    // O que a fila ia mandar de uma linha que acabou de ser apagada é esquecido
    // aqui, antes do comando de apagar.
    //
    // Sem isto, apagar as compras de exemplo — que é o caso normal — deixava a
    // fila apontando para movimentos que não existem mais. Órfã não é recusa: o
    // serializador levanta exceção, o motor para no primeiro buraco de propósito,
    // e tudo o que a fábrica gravar depois fica preso atrás dela para sempre.
    await forgetOrphans(conn);

    /**
     * Apagar as pessoas apaga também QUEM ESTÁ COM O APARELHO — senão ele tranca.
     *
     * `people` sai em "apagar tudo", mas o ponteiro `operator.current` mora em
     * `app_meta`, que nenhuma área toca. Ficava apontando para uma pessoa que não
     * existe; `currentCapabilities` resolve isso como "sumiu" e devolve o
     * conjunto VAZIO — de propósito, para ninguém herdar poder de um fantasma.
     * Só que `savePerson` e `savePlace` exigem `manage_company`: o dono não
     * recadastrava ninguém, nem lugar, nem via dinheiro. Sem caminho de volta
     * na tela — a grade só oferece "largar o aparelho" quando a pessoa existe.
     *
     * Medido por um teste de fora: dono cadastrado e escolhido → apagar tudo →
     * zero capacidades, e as duas recusas. Irrecuperável sem reinstalar, na
     * mesma tela em que a segunda confirmação explica o registro e não diz isto.
     *
     * Dentro da transação e com esta conexão, pelo mesmo motivo do `enqueue`:
     * não pode existir instante em que a pessoa sumiu e o ponteiro ficou.
     */
    if (area === 'all') {
      await conn.runAsync(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, '')`, [OPERATOR_KEY]);
    }

    // Enqueued *after* the deletes, and that order is the whole point.
    //
    // Erasing everything clears `outbox` too, so a command queued before the
    // loop deleted itself on the way past: the device came out empty and the
    // server never heard, so the next pull restored precisely what the person
    // had asked to destroy.
    //
    // The area is the unit rather than the row: a wipe is one decision, and
    // replaying it row by row would describe something the person never did.
    // A empresa vai no payload, e é a única linha da fila que precisa disso.
    //
    // Toda outra entrada nomeia uma LINHA, e a linha carrega o `company_id`. O
    // apagamento não tem linha atrás dele: o pedido que sobe é montado pelo
    // `serialize`, e sem isto ele subiria sem empresa — recusado pela política do
    // servidor, que pergunta a capacidade DAQUELA empresa.
    await enqueue(conn, [
      { table: 'erase', rowId: area, op: 'delete', payload: { area, companyId } },
    ]);
  });
}

// --- one item, in depth --------------------------------------------------------

export type PriceMoveRow = {
  previousRate: Rate | null;
  newRate: Rate;
  observedAt: string;
};

/**
 * Everything one input has been through.
 *
 * The price history is not a feature anybody maintains - it is the by-product
 * of buying, written by `recordPurchase` on the way past. This is the query
 * that finally shows it, which is what turns "trust me, it went up" into
 * something the person can look at.
 */
/**
 * As entregas de um insumo que dizem quanto o fornecedor DEMOROU.
 *
 * Fato e só fato: o par de datas. Quem tira a média é `observedLeadTimeDays`, no
 * domínio, e quem escreve *"o fornecedor leva 6 dias"* é a tela — esta camada não
 * fala português e não faz conta de decisão.
 *
 * **Só as notas com data de pedido entram, e é isso que a torna honesta.** A
 * coluna nasceu com a fundação e ficou sem escritor até hoje; enquanto a fábrica
 * não anotar quando pediu, a lista volta vazia e a tela diz que ainda não sabe —
 * em vez de inventar um prazo a partir da data de recebimento sozinha, que seria
 * um número com cara de medição.
 *
 * Sem portão de dinheiro: aqui não há cifra, só dias.
 */
export type Delivery = { orderedAt: string; receivedAt: string };

export async function deliveriesOf(
  companyId: string,
  itemId: string,
  limit = 8,
): Promise<Delivery[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ ordered_at: string; received_at: string }>(
    `SELECT p.ordered_at, p.received_at
       FROM purchases p
       JOIN purchase_lines pl ON pl.purchase_id = p.id
      WHERE p.company_id = ?
        AND pl.item_id = ?
        AND p.ordered_at IS NOT NULL
        AND p.received_at IS NOT NULL
        AND p.received_at >= p.ordered_at
      GROUP BY p.id
      ORDER BY p.received_at DESC
      LIMIT ?`,
    [companyId, itemId, limit],
  );
  return rows.map((r) => ({ orderedAt: r.ordered_at, receivedAt: r.received_at }));
}

export async function itemHistory(
  companyId: string,
  itemId: string,
  limit = 24,
): Promise<PriceMoveRow[]> {
  // Mesmo caso do `recentCostChanges`: histórico de preço é dinheiro do começo ao
  // fim, e o que sobra depois de tirar os números é uma lista de datas. Era a
  // SEGUNDA porta para o mesmo dinheiro — a ficha do insumo dizia "ainda sem nota
  // lançada" em cima e listava quatro notas embaixo, na mesma rolagem.
  if (!(await canSeeMoney(companyId))) return [];
  const conn = await db();
  const rows = await conn.getAllAsync<{
    previous_rate: number | null;
    new_rate: number;
    observed_at: string;
  }>(
    `SELECT previous_rate, new_rate, observed_at
       FROM item_cost_history
      WHERE company_id = ? AND item_id = ?
      ORDER BY observed_at DESC
      LIMIT ?`,
    [companyId, itemId, limit],
  );

  return rows.map((r) => ({
    previousRate: r.previous_rate === null ? null : (r.previous_rate as Rate),
    newRate: r.new_rate as Rate,
    observedAt: r.observed_at,
  }));
}

/**
 * Which recipes stand on this item, at their newest version.
 *
 * It answers the question that decides whether a price move matters: sugar
 * going up 9% is a headline only if eight flavours use it.
 */
export async function recipesUsingItem(
  companyId: string,
  itemId: string,
): Promise<{ id: string; name: string; quantity: number }[]> {
  const conn = await db();
  return conn.getAllAsync<{ id: string; name: string; quantity: number }>(
    `SELECT r.id, r.name, l.quantity
       FROM recipe_lines l
       JOIN recipe_versions v ON v.id = l.recipe_version_id
       JOIN recipes r ON r.id = v.recipe_id
      WHERE l.company_id = ? AND l.item_id = ?
        AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2
                          WHERE v2.recipe_id = v.recipe_id)
      ORDER BY r.name COLLATE NOCASE`,
    [companyId, itemId],
  );
}

export async function findItem(
  companyId: string,
  itemId: string,
  /**
   * A sala, quando a pergunta é de uma sala.
   *
   * Sem ela o saldo é o da empresa — e era esse o defeito: a tela de detalhe
   * mostrava o total da empresa e a contagem escrevia a diferença contra o
   * almoxarifado. Com a polpa dividida entre a fábrica e a câmara fria, contar a
   * prateleira TELEPORTAVA estoque: a diferença saía de um número maior e era
   * gravada num lugar menor, com o operador tendo feito tudo certo.
   */
  onde?: { sala: string } | { unidade: string },
): Promise<ItemWithCost | null> {
  // Includes the inactive: the screen that offers to reactivate an item has to
  // be able to open it.
  const all = await listItems(companyId, undefined, true, onde);
  return all.find((item) => item.id === itemId) ?? null;
}

/**
 * Takes an item out of circulation without taking it out of history.
 *
 * Deleting is often refused - a purchase or a recipe stands on the row - and
 * that refusal is correct: erasing an item that an invoice points at would
 * leave a cost nobody can explain. But "I typed the name wrong" and "we stopped
 * buying this" are ordinary things that must have an answer.
 *
 * So the row stays, the past stays intact, and the item stops appearing in the
 * places where you pick something. Reversible, because nothing was destroyed.
 */
export async function setItemActive(
  companyId: string,
  itemId: string,
  active: boolean,
): Promise<void> {
  const conn = await db();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(`UPDATE items SET active = ? WHERE id = ? AND company_id = ?`, [
      active ? 1 : 0,
      itemId,
      companyId,
    ]);
    await enqueue(conn, [{ table: 'items', rowId: itemId }]);
  });
}


/**
 * A grade de cadastro de produto: linha, tipo e sabor.
 *
 * Os três níveis são opcionais de propósito. Uma fábrica que faz um doce só não
 * deve ser obrigada a inventar uma linha e um tipo para cadastrá-lo - é a mesma
 * regra do "depende vira dado": quem tem um nível só preenche um nível só, e a
 * tela some com as perguntas que não se aplicam.
 *
 * O sabor é da empresa e não do tipo. Morango é o mesmo morango no picolé e no
 * pote; amarrá-lo ao tipo faria o dono cadastrar morango uma vez por tipo, e na
 * primeira correção de nome ele teria seis morangos diferentes no relatório.
 */
export type ProductLine = { id: string; name: string; sort: number };
export type ProductType = { id: string; lineId: string; name: string; sort: number };
export type Flavor = { id: string; name: string; sort: number };

export async function listLines(companyId: string): Promise<ProductLine[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ id: string; name: string; sort: number }>(
    `SELECT id, name, sort FROM product_lines
      WHERE company_id = ? AND active = 1
      ORDER BY sort, name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, sort: r.sort }));
}

export async function listTypes(companyId: string, lineId?: string): Promise<ProductType[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    line_id: string;
    name: string;
    sort: number;
  }>(
    `SELECT id, line_id, name, sort FROM product_types
      WHERE company_id = ? AND active = 1${lineId ? ' AND line_id = ?' : ''}
      ORDER BY sort, name COLLATE NOCASE`,
    lineId ? [companyId, lineId] : [companyId],
  );
  return rows.map((r) => ({ id: r.id, lineId: r.line_id, name: r.name, sort: r.sort }));
}

export async function listFlavors(companyId: string): Promise<Flavor[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{ id: string; name: string; sort: number }>(
    `SELECT id, name, sort FROM flavors
      WHERE company_id = ? AND active = 1
      ORDER BY sort, name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, sort: r.sort }));
}

/** Uma linha nova, ou o nome de uma existente corrigido. */
export async function saveLine(
  companyId: string,
  input: { id?: string; name: string; sort?: number },
): Promise<string> {
  const conn = await db();
  const id = input.id ?? newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO product_lines (id, company_id, name, sort, active)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`,
      [id, companyId, input.name.trim(), input.sort ?? 0],
    );
    await enqueue(conn, [{ table: 'product_lines', rowId: id }]);
  });
  return id;
}

export async function saveType(
  companyId: string,
  input: { id?: string; lineId: string; name: string; sort?: number },
): Promise<string> {
  const conn = await db();
  const id = input.id ?? newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO product_types (id, company_id, line_id, name, sort, active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`,
      [id, companyId, input.lineId, input.name.trim(), input.sort ?? 0],
    );
    await enqueue(conn, [{ table: 'product_types', rowId: id }]);
  });
  return id;
}

export async function saveFlavor(
  companyId: string,
  input: { id?: string; name: string; sort?: number },
): Promise<string> {
  const conn = await db();
  const id = input.id ?? newId();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO flavors (id, company_id, name, sort, active)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`,
      [id, companyId, input.name.trim(), input.sort ?? 0],
    );
    await enqueue(conn, [{ table: 'flavors', rowId: id }]);
  });
  return id;
}

/**
 * Erro de cadastro: o tipo escolhido é de outra linha.
 *
 * No servidor isto é chave estrangeira composta - o Postgres recusa sozinho.
 * O SQLite do aparelho não aceita chave composta em `ALTER TABLE ADD COLUMN`,
 * então aqui a mesma garantia é imposta na escrita, e é por isso que ela mora
 * no repositório e não na tela: a tela é decoração, e o assistente grava pelo
 * mesmo caminho sem passar por ela.
 */
export class TypeIsFromAnotherLineError extends Error {
  constructor(readonly typeId: string) {
    super(`type ${typeId} belongs to another line`);
    this.name = 'TypeIsFromAnotherLineError';
  }
}

/** Recusa antes de gravar se o tipo não for da linha. */
export async function assertTypeBelongsToLine(
  companyId: string,
  lineId: string | null,
  typeId: string | null,
): Promise<void> {
  if (!typeId) return;
  const conn = await db();
  const row = await conn.getFirstAsync<{ line_id: string }>(
    'SELECT line_id FROM product_types WHERE id = ? AND company_id = ?',
    [typeId, companyId],
  );
  if (!row || row.line_id !== lineId) throw new TypeIsFromAnotherLineError(typeId);
}

/** Um insumo perto do fim, com o dado que faz a frase: quanto tem e quanto sai por dia. */
export type Running = {
  itemId: string;
  name: string;
  baseUnit: string;
  onHandBaseUnits: number;
  dailyOutflow: number;
  daysLeft: number;
};

/**
 * O que vai acabar antes de você comprar de novo.
 *
 * O consumo diário sai do próprio livro-razão — a média do que saiu nos últimos
 * `days` dias —, não de uma estimativa cadastrada. É a diferença entre um alerta
 * que a fábrica reconhece e um que ela aprende a ignorar: o número vem do que
 * ela fez, e por isso o `[por quê?]` é possível.
 *
 * Insumo parado não aparece. Sem saída não há data de acabar, e inventar uma
 * seria exatamente o alerta inventado que o briefing proíbe.
 *
 * Embalagem entra junto com insumo: palito e saquinho acabam no meio da corrida
 * exatamente como a polpa, e uma fábrica parada por falta de palito está tão
 * parada quanto uma sem morango.
 */
/**
 * Quanto deste insumo sai por dia — a média da janela pedida.
 *
 * Existe ao lado de `runningOut` e não dentro dela porque as duas respondem
 * perguntas diferentes: aquela lista **quem está acabando** e por isso descarta
 * quem tem folga; esta responde **quanto sai**, e a resposta vale igual para o
 * insumo que dura seis meses. Usar a primeira aqui daria `null` justamente para
 * os itens tranquilos, e o ponto de recompra deles é o que decide se hoje é o
 * dia — que é a Lei 4: avisar na data da DECISÃO, não na do problema.
 *
 * Zero é resposta legítima e não "não sei": insumo que ninguém consumiu na
 * janela sai zero por dia, e é isso que faz a cobertura dele ser infinita em vez
 * de desconhecida.
 */
export async function dailyOutflowOf(
  companyId: string,
  itemId: string,
  fromIso: string,
  toIso: string,
  days: number,
  /** De onde é a conta: sala, unidade, ou a empresa inteira. Ver `Escopo`. */
  onde?: Escopo,
): Promise<number> {
  const conn = await db();
  const recorte = noEscopo('location_id', onde);
  const parNoEscopo = noEscopo('counterpart_location_id', onde);
  const linha = await conn.getFirstAsync<{ out_units: number }>(
    `SELECT COALESCE(-SUM(quantity_base_units), 0) AS out_units
       FROM movements
      WHERE company_id = ? AND item_id = ?
        AND quantity_base_units < 0
        AND ${recorte.sql}
        -- Mudar de sala não é consumir, e sem esta linha era.
        --
        -- A regra é a MESMA do runningOut, e ela estava só lá. Esta função
        -- nasceu ao lado dele para responder por um item só, e não herdou nem o
        -- escopo de sala nem a correção da perna de transferência — que foi
        -- medida em 7 de setembro: depois de mandar 400 unidades para a PRÓPRIA
        -- loja, a régua dizia "saída de 57 por dia" com a empresa tendo as mesmas
        -- quinhentas. A perna negativa entra como saída e a positiva não
        -- compensa, porque a soma só olha o que é negativo.
        --
        -- E o que decide não é mais o TIPO sozinho: é para onde a carga foi.
        --
        -- Antes esta linha era "se a pergunta é da empresa, transferência não
        -- conta" — grosseira e certa enquanto havia uma unidade. Com duas, mandar
        -- polpa de Bauru para Marília deixaria de contar como saída de Bauru, e a
        -- cobertura de lá ficaria infinita com a câmara vazia.
        --
        -- O par do movimento já é gravado nas duas pernas (moveBetween), então
        -- "saiu do escopo" é DADO: transferência cujo par está dentro é interna e
        -- não conta; a que vai para loja, cliente ou outra unidade conta.
        --
        -- A lista de tipos FICA, e isso é medida, não gosto: discrepancy (a
        -- diferença achada num posto de controle) também carrega par, e caixa que
        -- saiu e não chegou é perda de verdade. Uma regra só de par a faria parar
        -- de contar como saída, calada.
        AND NOT (kind IN ('transfer', 'return') AND ${parNoEscopo.sql})
        AND occurred_at >= ? AND occurred_at < ?`,
    [companyId, itemId, ...recorte.params, ...parNoEscopo.params, fromIso, toIso],
  );
  const saiu = linha?.out_units ?? 0;
  return days > 0 ? saiu / days : 0;
}

export async function runningOut(
  companyId: string,
  fromIso: string,
  toIso: string,
  days: number,
  horizon = 7,
  /** De onde é a conta: sala, unidade, ou a empresa inteira. Ver `Escopo`. */
  onde?: Escopo,
  /**
   * Que tipo de item entra na conta.
   *
   * O padrão é o que a capa pergunta: insumo e embalagem acabam no meio da
   * corrida e param a fábrica. Uma tela que já está filtrando por tipo passa o
   * dela, senão o número do topo fala de um conjunto e a frase debaixo de outro.
   */
  kinds: readonly ItemKind[] = ['input', 'packaging'],
): Promise<Running[]> {
  const conn = await db();
  const recorte = noEscopo('m.location_id', onde);
  const parNoEscopo = noEscopo('m.counterpart_location_id', onde);
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    base_unit: string;
    on_hand: number;
    out_units: number;
  }>(
    `SELECT i.id AS item_id, i.name, i.base_unit,
            COALESCE((SELECT SUM(m.quantity_base_units) FROM movements m
                       WHERE m.company_id = i.company_id AND m.item_id = i.id
                         AND ${recorte.sql}), 0) AS on_hand,
            COALESCE((SELECT -SUM(m.quantity_base_units) FROM movements m
                       WHERE m.company_id = i.company_id AND m.item_id = i.id
                         AND m.quantity_base_units < 0
                         AND ${recorte.sql}
                         -- Mudar de lugar não é consumir, e o que decide não é o
                         -- TIPO sozinho: é para onde a carga foi. O par do
                         -- movimento é gravado nas duas pernas, então "saiu do
                         -- escopo" é dado.
                         --
                         -- Medido em 7 de setembro, antes de existir unidade:
                         -- depois de mandar 400 unidades para a PRÓPRIA loja, a
                         -- régua dizia "saída de 57 por dia, dura 8,8 dias" com a
                         -- empresa tendo exatamente as mesmas quinhentas. A perna
                         -- negativa entrava como saída e a positiva não compensava,
                         -- porque a soma só olha o que é negativo. O conselho saía
                         -- invertido: produza mais porque você moveu estoque de uma
                         -- sala sua para outra.
                         --
                         -- E a lista de tipos FICA: discrepancy (a diferença de um
                         -- posto de controle) também carrega par, e caixa que saiu
                         -- e não chegou é perda. Uma regra só de par a faria parar
                         -- de contar, calada.
                         AND NOT (m.kind IN ('transfer', 'return') AND ${parNoEscopo.sql})
                         AND m.occurred_at >= ? AND m.occurred_at < ?), 0) AS out_units
       FROM items i
      WHERE i.company_id = ? AND i.active = 1
        AND i.kind IN (${kinds.map(() => '?').join(', ')})`,
    [
      // Três recortes: o do saldo, o da saída, e o do PAR da saída.
      ...recorte.params,
      ...recorte.params,
      ...parNoEscopo.params,
      fromIso,
      toIso,
      companyId,
      ...kinds,
    ],
  );

  const out: Running[] = [];
  for (const r of rows) {
    const dailyOutflow = r.out_units / days;
    const daysLeft = daysOfCover(r.on_hand, dailyOutflow);
    if (daysLeft === null || daysLeft > horizon) continue;
    out.push({
      itemId: r.item_id,
      name: r.name,
      baseUnit: r.base_unit,
      onHandBaseUnits: r.on_hand,
      dailyOutflow,
      daysLeft,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

/* ---------------------------------------------------------------------------
 * Pedidos: o que os clientes pediram, e o que falta para atender.
 *
 * Pedido não é movimento, e essa é a decisão que segura o resto. Quando um
 * cliente liga, nada sai do freezer: as caixas continuam lá, e quem conferir a
 * prateleira encontra tudo o que o sistema disse que tem. Gravar demanda como
 * movimento faria o saldo mentir no dia da ligação — e como o livro-razão é
 * append-only, corrigir um pedido que mudou exigiria estornar uma saída que
 * nunca aconteceu.
 *
 * A ligação com o livro-razão acontece uma vez só, e mais tarde: quando a carga
 * sai de verdade, pela transferência, que existe desde a primeira migração.
 * ------------------------------------------------------------------------- */

export type OrderStatus = 'pending' | 'open' | 'delivered' | 'cancelled';

export type OrderLine = { itemId: string; name: string; baseUnits: number };

export type Order = {
  id: string;
  placeId: string;
  /** Vazio quando é o lugar padrão: a palavra dele é da tela, não do banco. */
  placeName: string;
  status: OrderStatus;
  /** `YYYY-MM-DD`, ou nulo quando o cliente não marcou dia. */
  requestedFor: string | null;
  note: string | null;
  createdAt: string;
  /**
   * Quando a decisão foi tomada, ou nulo enquanto não foi.
   *
   * A coluna existe desde sempre e `setOrderStatus` a escreve; **ninguém a lia**.
   * Ela passou a sair daqui porque a tela precisa de uma coisa que não tinha:
   * mostrar o que foi decidido HOJE, para poder desfazer. Entregar um pedido por
   * engano não tocava o razão e mesmo assim não tinha volta — não porque o dado
   * proíbe (o estado vai e volta), mas porque a lista só mostra pendente e
   * aberto, e o pedido decidido SUMIA da tela.
   */
  decidedAt: string | null;
  lines: OrderLine[];
};

const BRIEFING_ORDER_KEY = 'briefing.order';
const BRIEFING_HIDDEN_KEY = 'briefing.hidden';

/**
 * A ordem das peças da capa, combinada pela casa.
 *
 * Guardada como texto separado por vírgula, e não como JSON, por um motivo
 * prático: é uma lista de palavras curtas que alguém pode precisar ler no banco
 * durante um suporte, e `producao,clima,insumos` se lê. Vazio quer dizer "a
 * ordem que veio de fábrica" — e não uma capa vazia.
 */
export async function briefingOrder(): Promise<string[]> {
  const saved = await readMeta(BRIEFING_ORDER_KEY);
  return saved ? saved.split(',').filter(Boolean) : [];
}

export async function setBriefingOrder(order: readonly string[]): Promise<void> {
  await writeMeta(BRIEFING_ORDER_KEY, order.join(','));
}

/**
 * O que ESTE aparelho não quer ver, sem mexer no que a casa combinou.
 *
 * Some da capa deste celular e continua na do escritório. É a mesma família da
 * escolha de identidade: preferência de quem está segurando o aparelho, que
 * não é fato do negócio e não sobe para o servidor.
 */
export async function briefingHidden(): Promise<string[]> {
  const saved = await readMeta(BRIEFING_HIDDEN_KEY);
  return saved ? saved.split(',').filter(Boolean) : [];
}

export async function setBriefingHidden(hidden: readonly string[]): Promise<void> {
  await writeMeta(BRIEFING_HIDDEN_KEY, hidden.join(','));
}

const BRIEFING_HALF_KEY = 'briefing.half';

/**
 * Quais peças a casa quer em MEIA coluna.
 *
 * É da empresa e não do aparelho, pela mesma razão que a ordem é: se o dono monta
 * a capa e o operador vê outra, *"olha lá na tela inicial"* deixa de funcionar. E
 * é uma lista de nomes pelo mesmo motivo da ordem — `perdas,clima` se lê no banco
 * durante um suporte.
 *
 * Vazio quer dizer "tudo inteiro", que é como o produto sempre foi.
 */
export async function briefingHalf(): Promise<string[]> {
  const saved = await readMeta(BRIEFING_HALF_KEY);
  return saved ? saved.split(',').filter(Boolean) : [];
}

export async function setBriefingHalf(half: readonly string[]): Promise<void> {
  await writeMeta(BRIEFING_HALF_KEY, half.join(','));
}

const ALERTS_KEY = 'alerts.settings';

/**
 * O que a empresa combinou sobre os avisos.
 *
 * Guardado como JSON numa linha de meta, pelo mesmo motivo que a lista de
 * embalagem mora na linha do produto: é curto, é reescrito inteiro e não tem
 * histórico próprio. O histórico dos avisos é o livro-razão que os gerou.
 *
 * Leitura tolerante de propósito. Isto é texto vindo do disco, escrito por uma
 * versão anterior do aplicativo: campo faltando cai no padrão, campo estranho é
 * ignorado, e JSON quebrado devolve o padrão inteiro. Um aviso que deixa de sair
 * porque a configuração não pôde ser lida é o pior desfecho possível — o dono
 * descobre no dia em que faltar polpa.
 */
export async function alertSettings(): Promise<AlertSettings> {
  const raw = await readMeta(ALERTS_KEY);
  if (!raw) return DEFAULT_ALERTS;
  try {
    const lido = JSON.parse(raw) as Partial<AlertSettings>;
    return {
      on: { ...DEFAULT_ALERTS.on, ...(lido.on ?? {}) },
      daysAhead: { ...DEFAULT_ALERTS.daysAhead, ...(lido.daysAhead ?? {}) },
      bands: { ...DEFAULT_ALERTS.bands, ...(lido.bands ?? {}) },
      // A folga NÃO vem daqui: ela é configuração da empresa e mora na própria
      // chave, que a ponte com o servidor já carrega. Ler os dois lugares faria
      // duas verdades para o mesmo número — e quem lê o aviso passaria a receber
      // uma régua diferente da que a ficha do insumo mostra, que é exatamente a
      // contradição que esta mudança veio acabar.
      purchaseSafetyDays: await purchaseSafetyDays(),
      minuteOfDay:
        typeof lido.minuteOfDay === 'number' &&
        lido.minuteOfDay >= 0 &&
        lido.minuteOfDay <= 1439
          ? Math.trunc(lido.minuteOfDay)
          : DEFAULT_ALERTS.minuteOfDay,
      weekdays:
        typeof lido.weekdays === 'number' && lido.weekdays >= 0 && lido.weekdays <= 127
          ? Math.trunc(lido.weekdays)
          : DEFAULT_ALERTS.weekdays,
    };
  } catch {
    return DEFAULT_ALERTS;
  }
}

export async function setAlertSettings(settings: AlertSettings): Promise<void> {
  await writeMeta(ALERTS_KEY, JSON.stringify(settings));
}

/**
 * O carrinho da separação — o que já foi posto nele, por loja.
 *
 * **Mora no aparelho e não sobe para lugar nenhum**, e essa é a decisão inteira
 * deste assunto. Separar é montar um carrinho DENTRO da fábrica: nada saiu, nada
 * mudou de dono, e o livro-razão não tem o que registrar. Quem move estoque
 * continua sendo a carga — decisão do dono em 6 de setembro, que a carga é um
 * evento só.
 *
 * Mas guardar é obrigatório, e por um motivo físico: a conferência acontece na
 * câmara fria, item a item, e o celular bloqueia. Uma lista que zera no meio
 * disso é pior que não existir — a pessoa recomeça a contar sem saber onde
 * parou, ou pior, acha que sabe.
 *
 * Por loja, porque duas separações podem estar abertas ao mesmo tempo: quem
 * separa para a Loja Centro e é interrompido para atender a Loja Norte volta e
 * encontra as duas onde deixou.
 */
export async function pickingCart(placeId: string): Promise<Record<string, number>> {
  return (await readJson<Record<string, number>>(`picking.${placeId}`)) ?? {};
}

export async function setPickingCart(
  placeId: string,
  cart: Record<string, number>,
): Promise<void> {
  // Item zerado sai do carrinho em vez de ficar como zero: o que a pessoa
  // desfez não é a mesma coisa que o que ela contou como nenhum, e a lista de
  // "o que já entrou" tem que dizer só o que entrou.
  const limpo = Object.fromEntries(Object.entries(cart).filter(([, n]) => n > 0));
  await writeJson(`picking.${placeId}`, limpo);
}

const OPERATOR_KEY = 'operator.current';
const NAMES_KEY = 'company.namesWhoRecorded';
const SIGN_IN_KEY = 'company.floorSignIn';

/** Um celular por pessoa, ou um pendurado na câmara que passa de mão. */
export type FloorSignIn = 'personal' | 'shared';

/**
 * Quem está com ESTE aparelho agora.
 *
 * Mora no `app_meta` e **não atravessa a sincronia**, de propósito: a pergunta é
 * sobre o aparelho, não sobre a empresa. Dois celulares na mesma fábrica têm
 * respostas diferentes ao mesmo tempo, e é isso que se quer — o da câmara está
 * com a Ana, o da expedição com o Zeca.
 *
 * Nulo quer dizer "ninguém se identificou", e é o padrão de uma fábrica que não
 * nomeia ninguém. Nesse caso o movimento nasce sem operador, que é a resposta
 * honesta: `operator_id` nulo diz "não perguntamos", e não "não sabemos quem".
 */
export async function currentOperatorId(): Promise<string | null> {
  const lido = await readMeta(OPERATOR_KEY);
  return lido && lido.length > 0 ? lido : null;
}

export async function setCurrentOperator(personId: string | null): Promise<void> {
  await writeMeta(OPERATOR_KEY, personId ?? '');
}

/**
 * O operador escolhido, conferido contra a EMPRESA que está sendo perguntada.
 *
 * A chave do operador é do aparelho e não tem empresa dentro dela — o que é certo,
 * porque a pergunta "quem está com este celular" é do celular. Mas a capacidade é da
 * empresa, e a fundação é multi-empresa desde a primeira linha: com a Ana da empresa
 * A escolhida, perguntar pela empresa B não acha linha nenhuma. Sem esta distinção,
 * o dono abriria a empresa B e o dinheiro desapareceria de tudo em silêncio, pela
 * regra que existe para "pessoa apagada".
 *
 * Não é alcançável hoje (`empresaDaqui()` é a única empresa do app), e é de graça
 * agora: `'outra'` diz "existe alguém escolhido, e não é desta empresa", que é uma
 * terceira resposta e não a segunda.
 */
async function operadorDaEmpresa(
  conn: Db,
  companyId: string,
  personId: string,
): Promise<
  { estado: 'aqui'; capacidades: Capability[] } | { estado: 'sumiu' } | { estado: 'outra' }
> {
  const linha = await conn.getFirstAsync<{ capabilities: string; company_id: string }>(
    `SELECT p.capabilities, g.company_id
       FROM people g
       JOIN profiles p ON p.id = g.profile_id AND p.company_id = g.company_id
      WHERE g.id = ? AND g.active = 1`,
    [personId],
  );
  if (!linha) return { estado: 'sumiu' };
  if (linha.company_id !== companyId) return { estado: 'outra' };
  // O mesmo filtro do `listProfiles`: `''.split(',')` devolve `['']`, e uma
  // capacidade chamada "" passaria adiante como se existisse.
  return {
    estado: 'aqui',
    capacidades: linha.capabilities.split(',').filter(Boolean) as Capability[],
  };
}

/**
 * O que o aparelho vale quando ninguém se identificou — e são DUAS bandeiras.
 *
 * A primeira versão devolvia o dono aqui, e a refutação mostrou o buraco: no celular
 * pendurado na câmara, "largar o aparelho" (`app/who.tsx`) é um botão de um toque que
 * chama `setCurrentOperator(null)` — recusar-se a dizer quem você é passava a ser o
 * jeito mais curto de ver a margem. Isso contraria a decisão escrita do dono
 * exatamente na configuração que ela descreve: *"celular da empresa passa de mão;
 * quem está com ele usa o papel operator — sem custo, sem preço, sem dinheiro"*.
 *
 * A segunda versão olhava só `floorSignIn`, e a refutação achou a outra armadilha:
 * uma fábrica que marca `shared` e NÃO liga a nomeação nunca pergunta nada, então
 * ninguém pode se identificar — o piso viraria permanente, inclusive para o dono, sem
 * caminho de volta. Aparelho que não pergunta não tem estado "ainda não respondeu".
 *
 * Então nulo tem duas leituras, e as duas bandeiras que já existem decidem qual:
 * *"não perguntamos"* — e portanto o dono, que é a conta que entrou — quando a
 * empresa não pergunta; *"ninguém se identificou ainda"* quando ela pergunta e o
 * aparelho esqueceu de propósito (`app/_layout.tsx` limpa o operador a cada abertura
 * no compartilhado). O caminho de volta do dono é tocar no PRÓPRIO nome na grade, e
 * não largar o aparelho.
 *
 * A F7 em uma linha: os dois caminhos existem, o padrão é `personal`, e nada aqui
 * escolheu por nenhuma fábrica.
 *
 * **E o portão é por APARELHO, não por empresa — dito aqui porque é onde se nota.**
 * As duas bandeiras moram no `app_meta`, que não atravessa a sincronia; e a
 * sincronia, mesmo que atravessasse, só SOBE (`Transport` tem `push` e mais nada).
 * Então numa fábrica com dois celulares um pode esconder custo e o outro não, sem
 * ninguém ter escolhido isso. Não é conserto de tabela: o que falta é o caminho de
 * descida, que é decisão de desenho e está escrita em `docs/roadmap.md`.
 */
async function pisoDoAparelho(): Promise<ReadonlySet<Capability>> {
  const [entrada, nomeia] = await Promise.all([floorSignIn(), namesWhoRecorded()]);
  return entrada === 'shared' && nomeia ? capabilitiesFor('operator') : capabilitiesFor('owner');
}

/**
 * O que quem está com o aparelho pode ver — e é isto que os números obedecem.
 *
 * Existe uma decisão escrita do dono por trás desta função: *"aparelho emprestado
 * entra como produção e nada mais. Celular da empresa passa de mão; quem está com ele
 * usa o papel `operator` — sem custo, sem preço, sem dinheiro."* Até hoje o aparelho
 * não tinha como obedecer: `app/assistant.tsx` fixava `capabilitiesFor('owner')` com
 * o motivo escrito ao lado — *"until sign-in lands, whoever holds this phone is the
 * owner"*. A fronteira era verdadeira quando foi escrita e deixou de ser: a grade de
 * nomes existe, `people.profile_id` aponta para um perfil, e o perfil carrega as
 * capacidades. Quem está com o aparelho é uma pergunta que o aparelho já responde.
 *
 * **O que isto NÃO é.** Não é autenticação, e a promessa não pode ser maior que a
 * entrega: a grade de nomes é atribuição, o PIN tem quatro dígitos e é opcional, e
 * qualquer um pode tocar no nome do dono (`docs/estudo-entrada.md`). O que este
 * portão compra é exatamente o que o `access.ts` diz que se quer comprar — *"the
 * number is irrelevant to the job and its presence invites conversations about margin
 * on the factory floor"*. Tirar a margem da vista de quem está embalando é o
 * objetivo; deter um adversário é outro problema, e ele é do servidor, que já impõe o
 * mesmo portão de verdade (`0008`, `case when has_capability(...)`).
 *
 * **A terceira resposta é vazia, e é de propósito.** Alguém escolhido que não se
 * resolve mais — pessoa desativada depois de escolhida, perfil apagado — devolve
 * conjunto vazio, porque entregar as chaves do dono a quem saiu da lista é o pior
 * resultado disponível, e um app que responde menos é recuperável com um toque na
 * grade.
 */
export async function currentCapabilities(companyId: string): Promise<ReadonlySet<Capability>> {
  const quem = await currentOperatorId();
  if (!quem) return await pisoDoAparelho();

  const conn = await db();
  const achado = await operadorDaEmpresa(conn, companyId, quem);
  // Escolhido noutra empresa é o mesmo caso de ninguém escolhido NESTA: quem está
  // com o aparelho não disse quem é, aqui.
  if (achado.estado === 'outra') return await pisoDoAparelho();
  if (achado.estado === 'sumiu') return new Set();
  return new Set(achado.capacidades);
}

/**
 * O portão do dinheiro, numa pergunta só.
 *
 * Toda leitura que devolve dinheiro para uma tela chama isto **antes** de consultar, e
 * é essa ordem que é a fundação: quem não pode ver o número não recebe o número, então
 * não existe número para vazar. O que o portão fechado faz na consulta é não juntar a
 * tabela de custo — o valor não chega a existir na resposta, em vez de existir e ser
 * apagado depois.
 *
 * **Congelar custo não passa por aqui, de propósito.** Uma produção gravada por quem
 * não vê custo tem que congelar o custo CERTO: o livro-razão não se corrige, se
 * estorna. As escritas leem `item_costs` direto ou por `averageRatesForLedger`, e
 * devem continuar lendo.
 */
export async function canSeeMoney(companyId: string): Promise<boolean> {
  return (await currentCapabilities(companyId)).has('view_cost');
}

/**
 * O outro portão do dinheiro: por quanto a mercadoria SAI.
 *
 * Duas capacidades e não uma, e a diferença é do produto, não do esquema. O
 * `access.ts` escreve a assimetria nos dois sentidos: o VENDEDOR *"sells at the
 * customer's price table, and never sees what it cost to make"*, e o COMPRADOR vê os
 * dois porque *"buying is where money and cost meet"*. Custo é o que a fábrica paga;
 * preço é o que a loja paga; e há quem precise de um sem o outro.
 *
 * (Escrevi este parágrafo ao contrário na primeira versão — "o comprador vê custo e
 * não vê preço" —, e foi o teste que me corrigiu ao reprovar contra a tabela de
 * papéis. As ausências desse arquivo se leem com o mesmo cuidado que as presenças, e
 * é o próprio docblock dele que pede isso.)
 *
 * **E este portão vale para o preço de TABELA, não para o combinado.** O combinado é
 * uma linha por parte, e capacidade não diz quais linhas — por isso ele pede
 * `manage_company` (ver `salePricesFor`). O de tabela é um número só da empresa:
 * quem vende precisa saber por quanto, e é exatamente para isso que a capacidade
 * existe. Separar os dois é o que faz `view_sale_price` deixar de ser uma palavra
 * no vocabulário e passar a decidir alguma coisa.
 *
 * **Privada de propósito, e é o P1 que decide isso.** `canSeeMoney` é exportada
 * porque seis telas a chamam para decidir o que desenhar; esta não tem tela nenhuma
 * chamando, porque o portão dela já roda dentro de `listProducts` e o que chega à
 * tela é nulo. Exportar por simetria seria criar a superfície morta que o portão
 * existe para recusar — quando uma tela precisar, ela sai daqui junto com o
 * chamador.
 */
async function canSeePrice(companyId: string): Promise<boolean> {
  return (await currentCapabilities(companyId)).has('view_sale_price');
}

/**
 * Se o relatório nomeia quem gravou.
 *
 * Decisão do dono: *"o relatório fala de onde, não de quem"* é o padrão, e a
 * responsabilidade vem do aparelho ter responsável. Quem quiser nomear a cada
 * caixa liga isto — e é ligando isto que a grade de nomes passa a aparecer.
 *
 * **Guardado no aparelho, e o servidor tem a mesma coluna** (`companies`, 0012).
 * As duas não conversam hoje, porque não existe tabela `companies` no aparelho —
 * o mesmo já vale para `orders.needApproval` (0019). Isso está registrado como
 * dívida em `docs/roadmap.md`: configuração da empresa é a única coisa que dois
 * celulares da MESMA empresa não conseguem combinar entre si.
 */
/** Um ATO do livro-razão: o que uma pessoa fez, com todas as pernas que ele moveu. */
export type ExtractAct = {
  /** O grupo — ou a própria linha, quando ela não tem grupo. É por ele que se estorna. */
  groupId: string;
  kind: MovementKind;
  occurredAt: string;
  /** Quantas linhas do razão este ato escreveu. */
  lines: number;
  /**
   * O tamanho do ato em dinheiro, pela TAXA CONGELADA — e `null` sem o portão.
   *
   * **É UM LADO da transação, e isso foi um defeito visto na foto.** A primeira
   * versão somava todas as pernas em módulo, e uma corrida de 506 picolés apareceu
   * na tela por **R$ 625,27** quando o que saiu do tacho valia R$ 323,84. A conta
   * fechava e não queria dizer nada: produção CONVERTE insumo em produto, então o
   * mesmo dinheiro era contado duas vezes — uma saindo como polpa e açúcar, outra
   * entrando como picolé.
   *
   * A régua certa é somar as pernas que ENTRAM; e quando não entra nada — perda,
   * consumo solto — o módulo das que saem. Assim uma produção vale o que ela fez,
   * uma compra vale o que chegou, uma transferência vale a carga (e não o dobro
   * dela), e uma perda vale o que sumiu.
   *
   * Somada em JavaScript por `amountOf`, e não em SQL — de propósito. Um
   * `ROUND(rate * qty)` dentro da consulta seria um segundo autor do
   * arredondamento do sistema, que é exatamente o outro defeito consertado hoje em
   * `stockByPlace`. O SQL devolve as linhas; quem converte taxa em dinheiro é o
   * único lugar que faz isso.
   */
  valueCents: Cents | null;
  /** Já foi desfeito. */
  reversed: boolean;
  /** ELE é o desfazimento de outro. */
  isReversal: boolean;
  /**
   * A espécie do ato que este DESFAZ — e ela existe por uma foto.
   *
   * A tela mostrava **"Correção de Correção"**, porque a perna de estorno carrega a
   * espécie dela própria (`reversal`) e não a do ato original. O rótulo era
   * verdadeiro e inútil: dizia duas vezes que era uma correção e nunca dizia
   * correção do quê — que é a única coisa que alguém quer saber ao ver uma no
   * extrato.
   */
  reversesKind: MovementKind | null;
  /** Os nomes que ele mexeu, para a linha falar sem a tela adivinhar. */
  items: string[];
  placeName: string | null;
  note: string | null;
};

/**
 * O extrato: o livro-razão por ATO, e não por linha.
 *
 * **Existe porque o caminho de volta estava inalcançável.** Nove funções escrevem
 * no razão a partir de tela — compra, contagem, produção, transferência,
 * devolução, perda, conferência, leitura, e o próprio estorno — e o botão de
 * desfazer existia em DUAS (`app/lots/[id].tsx`, `app/inputs/[id].tsx`). A
 * fundação promete *"corrige-se por estorno, nunca por exclusão"* e ela estava
 * honrada no banco e fora do alcance de quem erra. O que uma pessoa faz numa
 * fábrica quando não dá para consertar é parar de registrar: perde-se o dado, não
 * o conserto.
 *
 * **Por ATO porque é assim que se desfaz.** `reverseGroup` recebe um grupo, e uma
 * corrida de produção são sete linhas amarradas: desfazer só a linha da produção
 * deixaria picolés que não consumiram nada — pior que o erro original, porque
 * parece certo. Movimento sem grupo é ato de si mesmo (`COALESCE`), e não uma
 * linha somada com as outras órfãs num ato que nunca existiu.
 *
 * **A régua do dinheiro aqui é a TAXA CONGELADA, e ela não fecha com
 * `stockByPlace` de propósito.** Aquela tela valoriza o saldo com o custo médio de
 * HOJE (`item_costs.average_rate`, sobrescrito no lugar a cada compra); esta soma
 * o que cada linha valia quando aconteceu. Compre polpa a 1,24 ¢/g em março e a
 * 1,60 em outubro: o saldo de março re-lido hoje vale 1,60, e a linha de março
 * continua valendo 1,24. **As duas estão certas e respondem perguntas
 * diferentes** — e documento é o razão, porque a média muda e não pode assinar
 * nada. Esconder essa diferença com um arredondamento conveniente produziria o
 * documento bonito, verde e falso que este repositório mais teme.
 *
 * **O portão roda ANTES da consulta**, como manda a fundação: sem permissão o
 * `unit_cost_rate` não é selecionado, então não existe número para vazar.
 */
export async function ledgerExtract(
  companyId: string,
  opts: {
    /** Do começo deste instante, inclusive. */
    from?: string;
    /** Até este instante, exclusive — é o corte de fechamento de período. */
    to?: string;
    /**
     * Só o que passou por ESTE lugar — e é o extrato do cliente.
     *
     * Uma remessa escreve duas pernas: negativa na origem, positiva no destino.
     * Filtrar pelo lugar da loja devolve **o lado dela** — o que chegou e o que
     * ela devolveu —, que é exatamente a pergunta de uma disputa: *"vocês mandaram
     * mesmo isso?"*. Sem o filtro, o mesmo ato apareceria com o valor da fábrica.
     *
     * O ATO continua sendo o do razão inteiro: as pernas do outro lado existem e
     * pertencem ao mesmo grupo. Recortar o ato pelo lugar mudaria a contagem de
     * linhas e o valor, e um extrato que muda de número conforme quem olha é a
     * coisa que ele existe para não ser. Então o filtro escolhe QUAIS atos
     * aparecem, e não o que cada ato é.
     */
    placeId?: string;
    /**
     * Quantos ATOS, não quantas linhas — e a tela CRESCE este número em vez de
     * paginar por cursor.
     *
     * Eu tinha construído um `before` aqui, para continuar da última data da
     * página anterior, e ele nasceu sem chamador — a doença que o portão P1
     * persegue, aninhada num parâmetro em vez de numa função. Pior: eu a
     * diagnostiquei por escrito na mensagem do commit e entreguei outra solução,
     * deixando o parâmetro morto no lugar.
     *
     * Ele saiu, e não por disciplina apenas: **crescer o limite é o desenho certo
     * aqui.** Depois de um estorno a lista precisa ser relida inteira de qualquer
     * jeito, e páginas acumuladas em estado teriam de ser refeitas uma a uma. Numa
     * fábrica o razão de um ano cabe em centenas de atos, não milhões. Cursor
     * seria generalidade especulativa pagando complexidade real.
     */
    limit?: number;
  } = {},
): Promise<ExtractAct[]> {
  const conn = await db();
  const dinheiro = (await canSeeMoney(companyId)) ? 1 : 0;
  const limite = opts.limit ?? 30;

  // Primeiro os ATOS da janela, e só depois as linhas deles. Paginar por linha
  // cortaria um ato ao meio — e um ato cortado ao meio na tela é um estorno que
  // devolve metade.
  const atos = await conn.getAllAsync<{ g: string; quando: string }>(
    `SELECT COALESCE(m.movement_group_id, m.id) AS g, MAX(m.occurred_at) AS quando
       FROM movements m
      WHERE m.company_id = ?
        AND (? IS NULL OR m.occurred_at >= ?)
        AND (? IS NULL OR m.occurred_at < ?)
        AND (? IS NULL OR m.location_id = ?)
      GROUP BY g
      ORDER BY quando DESC, g DESC
      LIMIT ?`,
    [
      companyId,
      opts.from ?? null, opts.from ?? null,
      opts.to ?? null, opts.to ?? null,
      opts.placeId ?? null, opts.placeId ?? null,
      limite,
    ],
  );
  if (atos.length === 0) return [];

  const marcas = atos.map(() => '?').join(', ');
  const linhas = await conn.getAllAsync<{
    g: string;
    id: string;
    kind: string;
    quantity_base_units: number;
    unit_cost_rate: number | null;
    occurred_at: string;
    note: string | null;
    item_name: string | null;
    place_name: string | null;
    reverses: string | null;
    reverses_kind: string | null;
    reversed: number;
  }>(
    `SELECT COALESCE(m.movement_group_id, m.id) AS g, m.id, m.kind,
            m.quantity_base_units,
            CASE WHEN ? = 1 THEN m.unit_cost_rate END AS unit_cost_rate,
            m.occurred_at, m.note,
            i.name AS item_name, l.name AS place_name,
            m.reverses_movement_id AS reverses,
            o.kind AS reverses_kind,
            EXISTS (SELECT 1 FROM movements r
                     WHERE r.reverses_movement_id = m.id AND r.company_id = m.company_id) AS reversed
       FROM movements m
       LEFT JOIN items i ON i.id = m.item_id
       LEFT JOIN locations l ON l.id = m.location_id
       -- A perna de origem, para o estorno poder dizer correção DE QUÊ.
       LEFT JOIN movements o ON o.id = m.reverses_movement_id
      WHERE m.company_id = ? AND COALESCE(m.movement_group_id, m.id) IN (${marcas})
      ORDER BY m.rowid ASC`,
    [dinheiro, companyId, ...atos.map((a) => a.g)],
  );

  /**
   * A PRIMEIRA linha escrita dá o nome ao ato, e isto é invariante e não sorte.
   *
   * A primeira versão ordenava por `occurred_at DESC, rowid DESC` e uma corrida de
   * produção aparecia no extrato como **"consumo"** — porque as pernas de consumo
   * são escritas depois e vinham primeiro na leitura. A pessoa leria o nome errado
   * do próprio ato dela.
   *
   * `rowid ASC` conserta porque todo `record*` deste arquivo escreve a perna que dá
   * NOME ao ato antes das que derivam dela: `recordProduction` grava `production` e
   * só então os `consumption` da receita. Não é ordem casual — é a ordem em que os
   * fatos existem, porque o consumo é consequência da produção.
   *
   * A invariante fica presa pelo teste *"the extract lists ACTS, not lines"*, que
   * exige `kind === 'production'`: quem escrever uma função nova com as pernas na
   * ordem trocada reprova ali, em vez de descobrir pelo nome errado numa tela.
   */
  const porAto = new Map<string, ExtractAct>();
  /** As duas somas de cada ato, para escolher a certa só no fim. */
  const lados = new Map<string, { entra: number; sai: number; temDinheiro: boolean }>();
  for (const l of linhas) {
    const ja = porAto.get(l.g);
    const valor =
      dinheiro === 1 && l.unit_cost_rate !== null
        ? amountOf(l.unit_cost_rate as Rate, Math.abs(l.quantity_base_units))
        : null;
    if (valor !== null) {
      const lado = lados.get(l.g) ?? { entra: 0, sai: 0, temDinheiro: false };
      if (l.quantity_base_units >= 0) lado.entra += valor;
      else lado.sai += valor;
      lado.temDinheiro = true;
      lados.set(l.g, lado);
    }
    if (!ja) {
      porAto.set(l.g, {
        groupId: l.g,
        kind: l.kind as MovementKind,
        occurredAt: l.occurred_at,
        lines: 1,
        valueCents: null,
        reversed: l.reversed === 1,
        isReversal: l.reverses !== null,
        reversesKind: (l.reverses_kind as MovementKind | null) ?? null,
        items: l.item_name ? [l.item_name] : [],
        placeName: l.place_name,
        note: l.note,
      });
      continue;
    }
    ja.lines += 1;
    // Basta UMA perna estornada: o estorno vem sempre inteiro, e meia é defeito.
    if (l.reversed === 1) ja.reversed = true;
    if (l.reverses !== null) ja.isReversal = true;
    if (!ja.reversesKind && l.reverses_kind) ja.reversesKind = l.reverses_kind as MovementKind;
    if (l.item_name && !ja.items.includes(l.item_name)) ja.items.push(l.item_name);
    if (!ja.placeName) ja.placeName = l.place_name;
    if (!ja.note) ja.note = l.note;
  }

  // UM LADO, escolhido agora que as duas somas existem: o que entrou, e o que saiu
  // só quando nada entrou. Decidir perna a perna não daria — a escolha depende do
  // ato inteiro.
  for (const [g, lado] of lados) {
    const ato = porAto.get(g);
    if (!ato || !lado.temDinheiro) continue;
    ato.valueCents = (lado.entra > 0 ? lado.entra : lado.sai) as Cents;
  }

  // A ordem da consulta dos atos manda: o `Map` guarda inserção, e a inserção
  // veio da segunda consulta, que ordena por linha e não por ato.
  return atos.map((a) => porAto.get(a.g)).filter((x): x is ExtractAct => x !== undefined);
}

/**
 * Quantos movimentos o aparelho tem — o número que a tela de cópia compara.
 *
 * Sem empresa no parâmetro de propósito: a pergunta é do APARELHO e não de uma
 * empresa. A cópia leva o arquivo inteiro, e um número filtrado por empresa
 * mentiria sobre o que ela guarda no dia em que houver duas.
 */
export async function countMovements(): Promise<number> {
  const conn = await db();
  const linha = await conn.getFirstAsync<{ c: number }>(
    `SELECT count(*) AS c FROM movements`,
    [],
  );
  return linha?.c ?? 0;
}

export async function namesWhoRecorded(): Promise<boolean> {
  return (await readMeta(NAMES_KEY)) === '1';
}

export async function setNamesWhoRecorded(companyId: string, on: boolean): Promise<void> {
  await exigirCapacidade(companyId, 'manage_company', 'mudar como a empresa registra quem gravou');
  // Esta bandeira é METADE do piso de capacidade: ligada junto com a entrada
  // compartilhada, ela rebaixa o aparelho a `operator`. Entrar nesse estado sem
  // ninguém que administre tranca o aparelho para sempre.
  if (on && (await floorSignIn()) === 'shared' && !(await alguemAdministra(companyId))) {
    throw new PisoSemSaidaError();
  }
  await writeMeta(NAMES_KEY, on ? '1' : '0');
}

/**
 * Como se entra no chão de fábrica.
 *
 * `personal` é o padrão e é o do servidor (0011): um celular por pessoa, escolhe
 * uma vez e fica. `shared` é o aparelho que passa de mão — e aí a pergunta volta
 * toda vez que o app abre, porque quem pegou o celular agora não é
 * necessariamente quem o largou.
 *
 * "Depende de quem usa" vira dado, e os dois caminhos existem.
 */
export async function floorSignIn(): Promise<FloorSignIn> {
  return (await readMeta(SIGN_IN_KEY)) === 'shared' ? 'shared' : 'personal';
}

export async function setFloorSignIn(companyId: string, how: FloorSignIn): Promise<void> {
  await exigirCapacidade(companyId, 'manage_company', 'mudar como se entra no chão de fábrica');
  // A outra metade do piso. Mesma recusa, mesmo motivo.
  if (how === 'shared' && (await namesWhoRecorded()) && !(await alguemAdministra(companyId))) {
    throw new PisoSemSaidaError();
  }
  await writeMeta(SIGN_IN_KEY, how);
}

const CONSUMO_KEY = 'production.consumeFrom';

/**
 * De onde uma corrida tira o insumo — e os dois caminhos existem, que é o ponto.
 *
 * **`unidade` é o padrão, e ele foi decidido sob defeito em 8 de setembro.** A tela
 * lia o piso da unidade e a escrita conferia uma sala; com a polpa na câmara fria,
 * que é onde polpa mora, nenhuma corrida rodava. Escolher a unidade foi a única saída
 * que não obrigava a lançar transferência antes de cada corrida — e a régua é *"dá
 * para ir buscar a pé"*: a câmara fica a três metros, a loja a dez quilômetros, a
 * fábrica da outra cidade não é caminhada.
 *
 * **`sala` é o outro mundo, e ele é legítimo.** Quem quer o saldo de cada prateleira
 * sempre DECLARADO, e não deduzido, aceita o lançamento a mais: o insumo entra no
 * almoxarifado e tirar da câmara é uma transferência registrada. O trajeto interno
 * que faltava para isso ser viável passou a existir na mesma noite.
 *
 * Fixar o padrão sem construir o outro caminho fecharia METADE da regra da casa —
 * *"depende de quem usa vira configuração, e o que se decide é o padrão"* — e foi
 * exatamente a dívida que este par de funções paga.
 */
export type ConsumoDaProducao = 'unidade' | 'sala';

export async function consumoDaProducao(): Promise<ConsumoDaProducao> {
  return (await readMeta(CONSUMO_KEY)) === 'sala' ? 'sala' : 'unidade';
}

export async function setConsumoDaProducao(de: ConsumoDaProducao): Promise<void> {
  await writeMeta(CONSUMO_KEY, de);
}

const SAFETY_KEY = 'purchase.safetyDays';

/**
 * Quantos dias de folga a empresa quer antes de o aplicativo dizer "compre".
 *
 * O padrão é dois porque é o que o domínio já escrevia (`safetyDays = 2` em
 * `reorderPoint`) — não um número novo inventado numa tela. E ele É
 * configuração e não constante pela doutrina F7: a fábrica que compra polpa na
 * mesma cidade quer dois dias, a que importa essência de outro estado quer duas
 * semanas. Não existe o corte certo, existe o corte dela.
 *
 * Zero é resposta válida e não "não respondeu": quem compra na esquina não quer
 * folga nenhuma. Por isso a leitura distingue vazio de zero.
 */
export async function purchaseSafetyDays(): Promise<number> {
  const lido = await readMeta(SAFETY_KEY);
  if (lido === null || lido === '') return 2;
  const n = Number(lido);
  return Number.isFinite(n) && n >= 0 && n <= 60 ? Math.round(n) : 2;
}

export async function setPurchaseSafetyDays(companyId: string, dias: number): Promise<void> {
  await exigirCapacidade(companyId, 'manage_company', 'mudar a folga de compra da empresa');
  await writeMeta(SAFETY_KEY, String(Math.max(0, Math.min(60, Math.round(dias)))));
}

const ERASE_GRACE_KEY = 'company.eraseGraceDays';

/**
 * Quantos dias o servidor guarda o livro depois de um Reset — e os três casos.
 *
 * **Decisão do dono, 7 de setembro:** *"podem ser 10 dias corridos."* O padrão é
 * dez; zero destrói no ato; e **nulo é "nunca destrói no servidor"** — o livro fica
 * fechado para sempre, que é o extremo oposto do zero e não uma ausência de
 * resposta.
 *
 * No aparelho o apagamento é imediato nos três casos. O prazo é do servidor, e a
 * coluna que manda de verdade é a de lá (`companies.erase_grace_days`): isto aqui é
 * a cópia que a tela lê para poder DIZER o que vai acontecer, com o número, na
 * segunda confirmação.
 */
export async function eraseGraceDays(): Promise<number | null> {
  const lido = await readMeta(ERASE_GRACE_KEY);
  if (lido === null || lido === '') return 10;
  if (lido === 'nunca') return null;
  const n = Number(lido);
  return Number.isFinite(n) && n >= 0 && n <= 365 ? Math.round(n) : 10;
}

export async function setEraseGraceDays(companyId: string, dias: number | null): Promise<void> {
  await exigirCapacidade(companyId, 'manage_company', 'mudar o prazo de destruição do servidor');
  await writeMeta(
    ERASE_GRACE_KEY,
    dias === null ? 'nunca' : String(Math.max(0, Math.min(365, Math.round(dias)))),
  );
}

/**
 * O SEGUNDO escritor da configuração — o que desce do servidor, e ele não é gateado.
 *
 * Os cinco `set*` acima são a porta de QUEM ADMINISTRA e cobram `manage_company`.
 * Esta é a porta do SERVIDOR: `guardarAqui` copia para o aparelho o que a política
 * do Postgres já autorizou lá, e cobrar capacidade aqui travaria exatamente o
 * aparelho de operador — que é quem mais precisa receber o piso correto.
 *
 * Dois escritores com dois direitos é a forma que esta casa já usa em
 * `itemCosts` × `averageRatesForLedger`. O que não pode existir é UMA porta
 * servindo aos dois, que foi o defeito: quem o piso rebaixava desligava o piso.
 *
 * E não há guarda de "piso sem saída" aqui de propósito: o servidor é a autoridade
 * sobre o que a empresa configurou, e recusar o que ele mandou deixaria os dois
 * lados divergindo em silêncio — pior que o estado que a guarda evita, porque a
 * grade de nomes deste aparelho é alimentada pelo mesmo servidor.
 */
export async function aplicarConfigDoServidor(v: {
  namesWhoRecorded: boolean;
  floorSignIn: FloorSignIn;
  ordersNeedApproval: boolean;
  purchaseSafetyDays: number;
  eraseGraceDays: number | null;
}): Promise<void> {
  await Promise.all([
    writeMeta(NAMES_KEY, v.namesWhoRecorded ? '1' : '0'),
    writeMeta(SIGN_IN_KEY, v.floorSignIn),
    writeMeta(APPROVAL_KEY, v.ordersNeedApproval ? '1' : '0'),
    writeMeta(SAFETY_KEY, String(Math.max(0, Math.min(60, Math.round(v.purchaseSafetyDays))))),
    writeMeta(
      ERASE_GRACE_KEY,
      v.eraseGraceDays === null
        ? 'nunca'
        : String(Math.max(0, Math.min(365, Math.round(v.eraseGraceDays)))),
    ),
  ]);
}

const APPROVAL_KEY = 'orders.needApproval';

/**
 * Se todo pedido nasce esperando aprovação.
 *
 * "Depende de quem usa" vira dado: uma fábrica quer que o dono veja cada pedido
 * antes de a produção começar, outra tem três clientes e a aprovação só atrasa a
 * entrega. Os dois caminhos existem, e o padrão é sem aprovação — a fábrica de
 * seis pessoas é o caso que este produto tem na mão.
 */
export async function ordersNeedApproval(): Promise<boolean> {
  return (await readMeta(APPROVAL_KEY)) === '1';
}

export async function setOrdersNeedApproval(companyId: string, needed: boolean): Promise<void> {
  await exigirCapacidade(companyId, 'manage_company', 'mudar se pedido espera aprovação');
  await writeMeta(APPROVAL_KEY, needed ? '1' : '0');
}

export async function saveOrder(
  companyId: string,
  input: {
    placeId: string;
    requestedFor?: string | null;
    note?: string | null;
    lines: readonly { itemId: string; baseUnits: number }[];
  },
): Promise<Order> {
  const lines = input.lines.filter((l) => l.baseUnits > 0);
  if (lines.length === 0) throw new Error('um pedido sem item não é pedido');

  const conn = await db();
  const id = newId();
  const status: OrderStatus = (await ordersNeedApproval()) ? 'pending' : 'open';
  const createdAt = nowIso();

  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `INSERT INTO orders (id, company_id, place_id, status, requested_for, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, input.placeId, status, input.requestedFor ?? null, input.note ?? null, createdAt],
    );

    const writes = [{ table: 'orders', rowId: id }];
    for (const line of lines) {
      const lineId = newId();
      await conn.runAsync(
        `INSERT INTO order_lines (id, company_id, order_id, item_id, base_units)
         VALUES (?, ?, ?, ?, ?)`,
        [lineId, companyId, id, line.itemId, Math.round(line.baseUnits)],
      );
      writes.push({ table: 'order_lines', rowId: lineId });
    }
    await enqueue(conn, writes);
  });

  const [saved] = await listOrders(companyId, [status], id);
  return saved;
}

/**
 * Os pedidos, com as linhas dentro.
 *
 * Duas consultas e não uma por pedido: uma fábrica com quarenta pedidos abertos
 * faria quarenta e uma idas ao banco na abertura da tela, e a lista é o primeiro
 * lugar em que alguém toca de manhã.
 */
export async function listOrders(
  companyId: string,
  statuses: readonly OrderStatus[] = ['pending', 'open'],
  onlyId?: string,
): Promise<Order[]> {
  const conn = await db();
  const marks = statuses.map(() => '?').join(', ');
  const rows = await conn.getAllAsync<{
    id: string;
    place_id: string;
    place_name: string;
    status: OrderStatus;
    requested_for: string | null;
    note: string | null;
    created_at: string;
    decided_at: string | null;
  }>(
    `SELECT o.id, o.place_id, l.name AS place_name, o.status, o.requested_for, o.note,
            o.created_at, o.decided_at
       FROM orders o
       JOIN locations l ON l.id = o.place_id
      WHERE o.company_id = ? AND o.status IN (${marks}) AND (? IS NULL OR o.id = ?)
      ORDER BY o.requested_for IS NULL, o.requested_for, o.created_at`,
    [companyId, ...statuses, onlyId ?? null, onlyId ?? null],
  );
  if (rows.length === 0) return [];

  const lines = await conn.getAllAsync<{
    order_id: string;
    item_id: string;
    name: string;
    base_units: number;
  }>(
    `SELECT ol.order_id, ol.item_id, i.name, ol.base_units
       FROM order_lines ol
       JOIN items i ON i.id = ol.item_id
      WHERE ol.company_id = ? AND ol.order_id IN (${rows.map(() => '?').join(', ')})
      ORDER BY i.name COLLATE NOCASE`,
    [companyId, ...rows.map((r) => r.id)],
  );

  return rows.map((r) => ({
    id: r.id,
    placeId: r.place_id,
    placeName: r.place_name,
    status: r.status,
    requestedFor: r.requested_for,
    note: r.note,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    lines: lines
      .filter((l) => l.order_id === r.id)
      .map((l) => ({ itemId: l.item_id, name: l.name, baseUnits: l.base_units })),
  }));
}

/**
 * Aprovar, entregar ou cancelar — a mesma escrita, três palavras diferentes.
 *
 * Não é o livro-razão: pedido muda de estado, e mudar de estado aqui não move
 * um grama de nada. O que move estoque é a carga que sai, e ela é transferência.
 */
export async function setOrderStatus(
  companyId: string,
  orderId: string,
  status: OrderStatus,
): Promise<void> {
  const conn = await db();
  await conn.withTransactionAsync(async () => {
    await conn.runAsync(
      `UPDATE orders SET status = ?, decided_at = ? WHERE id = ? AND company_id = ?`,
      [status, nowIso(), orderId, companyId],
    );
    await enqueue(conn, [{ table: 'orders', rowId: orderId }]);
  });
}

/**
 * Quais pedidos daquela loja o dia de hoje já cobre por inteiro.
 *
 * **Extraída da tela de transferência quando a separação passou a precisar da
 * mesma resposta.** Duas telas fazendo a mesma conta é a forma como duas
 * verdades nascem — e esta conta tem três decisões dentro, cada uma paga com um
 * defeito:
 *
 * 1. **A cobertura é do DIA, não da carga.** Quem carrega o caminhão faz duas
 *    viagens até o freezer; comparar só com a última fazia um pedido de dois
 *    itens nunca fechar.
 * 2. **Só o pedido COBERTO entra.** Carga parcial não fecha nada: dizer
 *    "entregue" faltando quarenta caixas transforma uma falta que a loja vai
 *    cobrar num pedido que o sistema diz cumprido.
 * 3. **Ela só RESPONDE.** Quem fecha é a pessoa, no diálogo — o aplicativo
 *    sugere, nunca decide calado.
 *
 * Devolve os ids; a frase e a pergunta são da tela.
 */
export async function ordersCoveredToday(
  companyId: string,
  placeId: string,
  dayFromIso: string,
  dayToIso: string,
): Promise<string[]> {
  const abertos = await listOrders(companyId, ['pending', 'open']);
  const daLoja = abertos.filter((o) => o.placeId === placeId);
  if (daLoja.length === 0) return [];

  // SEM unidade, e é decisão e não esquecimento: a pergunta é *"esta loja já recebeu
  // hoje?"*, e uma loja pode ser servida por qualquer unidade. Recortar por unidade
  // esconderia a carga que saiu da outra cidade e mandaria carregar de novo — o
  // defeito de somar de MENOS, que aqui vira mercadoria duplicada na prateleira.
  const remessas = await shipmentsOn(companyId, dayFromIso, dayToIso);
  const enviadoHoje = new Map<string, number>();
  for (const destino of remessas.filter((r) => r.locationId === placeId)) {
    for (const item of destino.items) {
      enviadoHoje.set(item.itemId, (enviadoHoje.get(item.itemId) ?? 0) + item.baseUnits);
    }
  }

  return ordersCoveredBy(daLoja, enviadoHoje);
}

export type Demand = {
  itemId: string;
  name: string;
  /** Quanto foi pedido e ainda não foi entregue, na unidade base do item. */
  requested: number;
  /** Quanto existe na fábrica agora. O que já está numa loja não conta. */
  onHand: number;
};

/**
 * O que tem na fábrica contra o que já foi prometido, produto por produto.
 *
 * O saldo lido é o das SALAS de onde a carga sai, não o da empresa: mil picolés
 * espalhados em quatro lojas não atendem o cliente que pediu mil na fábrica, e
 * somar tudo diria que está coberto quando não está.
 *
 * "As salas", no plural, e isso custou um achado de auditoria. A conta lia o
 * `defaultLocationId` — um lugar só, o que era certo enquanto havia um só. O dono
 * cadastra a câmara fria, manda o picolé para lá (que é o que uma fábrica de
 * picolés faz no dia seguinte ao de produzir), e a conta passa a dizer que não há
 * nada para prometer com o freezer cheio. A régua de quais salas são nossas mora
 * em `INTERNAL_PLACE_KINDS`, com as telas que separam sala de destino.
 *
 * **Parte do PRODUTO, e não da linha de pedido.** Ela se chamava `orderedDemand`
 * e montava as linhas a partir de `order_lines`, então respondia só sobre o que
 * alguém já tinha pedido — e quem pergunta "quanto ainda dá para prometer" está
 * quase sempre no caso oposto: o primeiro pedido do dia, de um produto que
 * ninguém pediu ainda. A tela de anotar pedido ficava sem dica nenhuma no campo
 * de quantidade, e o aviso de excesso não tinha como aparecer, exatamente
 * quando a conta mais decide.
 *
 * Produto sem pedido volta com `requested` zero, que é fato e não lacuna. As
 * duas telas que leem isto para achar FALTA continuam certas de graça: as duas
 * filtram por `requested - onHand > 0`, e a linha nova nunca satisfaz isso.
 *
 * Devolve fato — saldo e pedido, produto por produto. Quem faz a subtração e
 * escreve "falta produzir 300" é a tela, porque a frase é português e esta
 * camada não fala português.
 */
export async function stockAgainstOrders(
  companyId: string,
  throughDate: string,
  /**
   * De qual unidade de fábrica é o saldo — e é OBRIGATÓRIO de propósito.
   *
   * Esta consulta somava `kind in ('factory','cold_room','store_room')` sem
   * parâmetro de lugar nenhum, e com uma unidade ela acertava: todas as salas
   * internas eram da única. Com duas, ela responde *"dá para prometer este
   * pedido?"* contando o freezer da outra cidade — e o pedido é aceito contra
   * estoque que não pode ser carregado. O cliente ouve sim e a caixa não sai.
   *
   * Obrigatório e não opcional porque a lição de 8 de setembro é essa: leitor de
   * saldo com lugar opcional é leitor que erra calado, exatamente como
   * `recordLoss` errava com a sala opcional. Quem chama diz de onde, ou não
   * compila.
   *
   * A unidade conta a si mesma e as salas DENTRO dela (`parent_location_id`), que
   * é o que a migração 0046 passou a permitir e o backfill dela garantiu para
   * quem já tinha o aplicativo.
   */
  unitId: string,
): Promise<Demand[]> {
  const conn = await db();
  const recorte = noEscopo('m.location_id', { unidade: unitId });
  const rows = await conn.getAllAsync<{
    item_id: string;
    name: string;
    requested: number;
    on_hand: number;
  }>(
    // O filtro do pedido vive no ON, e não no WHERE, senão o LEFT JOIN vira
    // INNER: a condição eliminaria justamente a linha sem pedido que esta
    // consulta passou a existir para trazer.
    `SELECT p.item_id, i.name,
            COALESCE(SUM(ol.base_units), 0) AS requested,
            (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
               JOIN locations l ON l.id = m.location_id
              WHERE m.company_id = p.company_id
                AND m.item_id = p.item_id
                AND l.kind IN ('factory', 'cold_room', 'store_room')
                -- A unidade e o que está DENTRO dela, pela peça de noEscopo.
                -- Sem esta linha o freezer da outra cidade entra na conta do que
                -- dá para prometer aqui.
                AND ${recorte.sql}) AS on_hand
       FROM products p
       JOIN items i ON i.id = p.item_id
       LEFT JOIN order_lines ol ON ol.item_id = p.item_id
        AND ol.company_id = p.company_id
        AND EXISTS (SELECT 1 FROM orders o
                     WHERE o.id = ol.order_id
                       AND o.status IN ('pending', 'open')
                       AND (o.requested_for IS NULL OR o.requested_for <= ?))
      WHERE p.company_id = ?
      GROUP BY p.item_id, i.name
      ORDER BY i.name COLLATE NOCASE`,
    // A ordem dos parâmetros segue a ordem no texto: a subconsulta do saldo vem
    // ANTES do LEFT JOIN e do WHERE, então o recorte vem antes da data.
    [...recorte.params, throughDate, companyId],
  );

  return rows.map((r) => ({
    itemId: r.item_id,
    name: r.name,
    requested: r.requested,
    onHand: r.on_hand,
  }));
}

// --- estorno ------------------------------------------------------------------

/** Uma perna do estorno, como a tela precisa dizê-la antes de gravar. */
export type ReversalLeg = {
  itemId: string;
  name: string;
  /** Assinada, na unidade-base: o CONTRÁRIO do que o movimento original fez. */
  baseUnits: number;
  baseUnit: string;
  locationId: string;
};

/** O que o estorno vai escrever, e o que impede de escrever. */
export type ReversalPlan = {
  groupId: string;
  legs: ReversalLeg[];
  /**
   * O que já saiu e por isso não pode voltar.
   *
   * Vazio é o caso normal. Cheio significa que o estorno deixaria saldo
   * negativo em algum lugar, e saldo negativo é uma mentira que o livro-razão
   * não desfaz depois.
   */
  blocked: { itemId: string; name: string; held: number; needed: number; baseUnit: string }[];
  /** Já foi estornado antes. Estornar duas vezes dobraria a correção. */
  alreadyReversed: boolean;
};

/**
 * O erro de quem tenta estornar o que não dá para estornar.
 *
 * Carrega o plano inteiro porque a Lei 5 pede que o erro IMPEÇA e mostre a
 * saída no mesmo gesto: a tela precisa dizer QUAL item já saiu e quanto, não
 * "não foi possível".
 */
export class CannotReverseError extends Error {
  constructor(public readonly plan: ReversalPlan) {
    super(
      plan.alreadyReversed
        ? `grupo ${plan.groupId} já foi estornado`
        : `estorno de ${plan.groupId} deixaria saldo negativo`,
    );
    this.name = 'CannotReverseError';
  }
}

/**
 * O que o estorno faria, sem fazer.
 *
 * Existe separado da escrita por uma razão de tom de voz, não de arquitetura: a
 * confirmação deste aplicativo diz o que vai acontecer com os números por
 * extenso, e para dizer isso a tela precisa da conta antes do ato. A checagem
 * roda de novo dentro da transação de `reverseGroup` — esta aqui é para falar,
 * aquela é para valer.
 */
export async function planReversal(companyId: string, groupId: string): Promise<ReversalPlan> {
  const conn = await db();
  const legs = await conn.getAllAsync<{
    id: string;
    item_id: string;
    name: string;
    base_unit: string;
    quantity_base_units: number;
    location_id: string;
    reversed: number;
  }>(
    `SELECT m.id, m.item_id, i.name, i.base_unit, m.quantity_base_units, m.location_id,
            EXISTS (SELECT 1 FROM movements r
                     WHERE r.reverses_movement_id = m.id AND r.company_id = m.company_id) AS reversed
       FROM movements m
       JOIN items i ON i.id = m.item_id
      WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind <> 'reversal'
      ORDER BY m.quantity_base_units DESC`,
    [companyId, groupId],
  );

  if (legs.length === 0) throw new Error(`grupo ${groupId} não existe`);

  const plan: ReversalPlan = {
    groupId,
    legs: legs.map((l) => ({
      itemId: l.item_id,
      name: l.name,
      baseUnits: -l.quantity_base_units,
      baseUnit: l.base_unit,
      locationId: l.location_id,
    })),
    blocked: [],
    alreadyReversed: legs.some((l) => l.reversed === 1),
  };

  // O que o estorno TIRA precisa estar lá. Uma corrida cujos picolés já
  // viajaram para a loja não volta atrás sozinha: o conserto passa a ser
  // trazer a carga de volta primeiro, e é isso que a tela vai dizer.
  //
  // Uma consulta só para todas as pernas, e a soma é a mesma de
  // `balanceByLocation` - duas aritméticas para "quanto tem aqui" seriam duas
  // verdades.
  const saldos = await conn.getAllAsync<{ item_id: string; location_id: string; held: number }>(
    `SELECT item_id, location_id, SUM(quantity_base_units) AS held
       FROM movements
      WHERE company_id = ?
        AND item_id IN (SELECT item_id FROM movements
                         WHERE company_id = ? AND movement_group_id = ?)
      GROUP BY item_id, location_id`,
    [companyId, companyId, groupId],
  );
  const held = new Map(saldos.map((s) => [`${s.item_id}@${s.location_id}`, s.held]));

  for (const leg of plan.legs) {
    if (leg.baseUnits >= 0) continue;
    const tem = held.get(`${leg.itemId}@${leg.locationId}`) ?? 0;
    if (tem + leg.baseUnits < 0) {
      plan.blocked.push({
        itemId: leg.itemId,
        name: leg.name,
        held: tem,
        needed: -leg.baseUnits,
        baseUnit: leg.baseUnit,
      });
    }
  }

  return plan;
}

/**
 * O custo médio, recomposto a partir do livro-razão.
 *
 * **A cicatriz.** `reverseGroup` devolvia a quantidade e deixava o dinheiro. Quem
 * digitasse 50 onde saíram 500 corrigia o estoque e ficava com o custo dez vezes
 * alto embaixo de TODO número de dinheiro do aplicativo — "dinheiro parado" na
 * capa, o valor de cada lugar, o valor da carga que chega na loja. A confirmação
 * do estorno diz *"os dois lançamentos ficam no histórico — nada é apagado"*, e a
 * pessoa entende, com razão, que o erro foi desfeito.
 *
 * **Não dá para "desmisturar" uma média móvel.** Ela é dependente do caminho: a
 * ordem das entradas decide o resultado, e não existe operação inversa. O que dá,
 * e é o que esta função faz, é **replicar o caminho inteiro do zero** — que é a
 * mesma coisa que a primeira fundação deste projeto já diz do saldo. Saldo é a
 * soma dos movimentos; média é a dobra deles. `item_costs` passa a ser cache de
 * uma conta que sempre pode ser refeita, em vez de um número que só sabe andar
 * para a frente.
 *
 * A regra da dobra é a dos dois escritores existentes, lida deles e não inventada:
 * **entrada com taxa mistura; qualquer outra coisa só move a quantidade.** Uma
 * saída não mexe na média (ela leva unidades ao preço médio do momento), e uma
 * perna de estorno é uma saída — quantidade negativa —, então ela desfaz o efeito
 * da entrada que corrigiu sem precisar de aritmética inversa.
 *
 * Escreve uma linha no histórico de preço quando o número muda, porque mudança
 * calada de custo é a pior: ela reaparece semanas depois como margem errada, sem
 * nada que a explique.
 */
export async function recomputeItemCost(companyId: string, itemId: string): Promise<Rate> {
  const conn = await db();

  const antes = await conn.getFirstAsync<{ average_rate: number }>(
    `SELECT average_rate FROM item_costs WHERE item_id = ?`,
    [itemId],
  );

  // O que foi estornado NÃO ACONTECEU — e a média é uma pergunta sobre o que
  // aconteceu.
  //
  // Esta é a diferença entre consertar e maquiar, e eu errei nela primeiro.
  // Tratar a perna de estorno como uma saída comum é o que um sistema contábil
  // faz com uma devolução, e é consistente com média móvel — mas deixa o erro
  // dentro para sempre: 500 picolés a 64,99 mais 50 a 614 dá 114,08, e tirar os
  // 50 depois devolve a quantidade e mantém os 114,08. O dono corrigiu o estoque
  // e continua com o custo errado, que é exatamente a queixa.
  //
  // A regra certa já estava escrita neste arquivo, em `NAO_ESTORNADO`, e é usada
  // por oito consultas: as duas linhas ficam no razão porque a fundação exige,
  // e quem pergunta "o que aconteceu" não vê nenhuma das duas. A dobra do custo
  // é essa pergunta.
  //
  // A ordem desempata pelo instante em que o aparelho soube: duas entradas no
  // mesmo momento têm que dobrar sempre igual, senão a média depende de qual
  // linha o SQLite devolveu primeiro.
  const linhas = await conn.getAllAsync<{ quantity_base_units: number; unit_cost_rate: number | null }>(
    `SELECT m.quantity_base_units, m.unit_cost_rate
       FROM movements m
      WHERE m.company_id = ? AND m.item_id = ?
        AND m.kind <> 'reversal'
        AND ${NAO_ESTORNADO}
      ORDER BY m.occurred_at, m.recorded_at, m.id`,
    [companyId, itemId],
  );

  let estado: StockCostState = { baseUnits: 0, averageRate: 0 as Rate };
  let ultima: Rate | null = null;
  for (const l of linhas) {
    if (l.quantity_base_units > 0 && l.unit_cost_rate !== null) {
      estado = {
        baseUnits: estado.baseUnits + l.quantity_base_units,
        averageRate: blendRate(estado, {
          baseUnits: l.quantity_base_units,
          rate: l.unit_cost_rate as Rate,
        }),
      };
      ultima = l.unit_cost_rate as Rate;
    } else {
      estado = { ...estado, baseUnits: estado.baseUnits + l.quantity_base_units };
    }
  }

  const at = nowIso();
  await conn.runAsync(
    `INSERT INTO item_costs (item_id, company_id, average_rate, last_rate, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       average_rate = excluded.average_rate,
       last_rate = excluded.last_rate,
       updated_at = excluded.updated_at`,
    [itemId, companyId, estado.averageRate, ultima, at],
  );

  const anterior = (antes?.average_rate ?? 0) as Rate;
  if (Math.abs(anterior - estado.averageRate) > 1e-12) {
    await conn.runAsync(
      `INSERT INTO item_cost_history (id, company_id, item_id, previous_rate, new_rate, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), companyId, itemId, anterior || null, estado.averageRate, at],
    );
  }

  return estado.averageRate;
}

/**
 * O contrário de um ato, lançado como fato novo.
 *
 * **É a primeira fundação deste projeto virando código.** O livro-razão é
 * append-only por gatilho no banco, e a promessa que vem junto é que existe
 * conserto: uma corrida lançada com 500 onde eram 50 se corrige por estorno,
 * nunca por exclusão. Até aqui a promessa era só metade — esquema, restrição,
 * política de capacidade e o construtor de `src/domain/ledger.ts` existiam sem
 * um único escritor, e o operador que não consegue consertar aprende a não
 * registrar.
 *
 * Estorna o ATO, pelo grupo, e não uma linha. Uma corrida são sete movimentos
 * amarrados por `movement_group_id`; desfazer só a linha da produção deixaria
 * picolés que não consumiram nada, que é pior que o erro original porque parece
 * certo. As pernas do estorno compartilham um grupo NOVO entre si e cada uma
 * aponta para a sua origem por `reverses_movement_id`.
 *
 * O lote continua existindo. Ele é identidade, não quantidade: o saldo dele vai
 * a zero pelo movimento, e apagar a linha seria a exclusão que a fundação
 * proíbe — além de quebrar o rastro de uma etiqueta que talvez já esteja colada
 * numa caixa.
 *
 * ---
 *
 * **O estorno acontece HOJE, não na data do erro — e isto é regra, não detalhe.**
 *
 * `occurredAt` fica aberto no parâmetro porque a sincronia precisa reproduzir a
 * data de um estorno que já aconteceu noutro aparelho. Os dois chamadores de
 * produção o omitem de propósito (`app/inputs/[id].tsx`, `app/lots/[id].tsx`) e
 * a linha cai em `nowIso()`.
 *
 * Datar o estorno no dia do erro parece mais correto e é o contrário disso.
 * Todo saldo deste sistema é uma soma cortada por `occurred_at <= ?`
 * (`lotsInRoomAt` é o precedente). Se um erro de março for estornado em outubro
 * com a data de março, **o março que o contador já leu muda em outubro**, sem
 * erro, sem log e sem teste vermelho — o fechamento de período vira ficção
 * retroativa. Datando hoje, março fica como estava e o conserto aparece no mês
 * em que alguém o fez, que é também o mês em que se explica por quê.
 *
 * Isso é o que torna o fechamento de período estável de graça, e até 6 de
 * setembro de 2026 valia por acidente: nenhum comentário dizia, e nenhum teste
 * prendia. `repository.test.ts` prende agora, nas duas pontas — o padrão cai em
 * hoje, e o parâmetro explícito continua funcionando para a sincronia.
 */
export async function reverseGroup(
  companyId: string,
  input: { groupId: string; occurredAt?: string; note?: string },
): Promise<{ groupId: string; legs: ReversalLeg[] }> {
  // **Este é o caso que abriu a investigação toda.** O botão de desfazer do extrato não
  // tinha portão nenhum, e um estorno pede `adjust_stock` no servidor: o entregador
  // tocava, a linha entrava no aparelho, o servidor recusava, e a fila daquele celular
  // parava para sempre — sem nada na tela.
  await podeGravar(companyId, 'reversal');
  const conn = await db();
  const plan = await planReversal(companyId, input.groupId);
  if (plan.alreadyReversed || plan.blocked.length > 0) throw new CannotReverseError(plan);

  const at = nowIso();
  const occurred = input.occurredAt ?? at;
  const newGroup = newId();

  await conn.withTransactionAsync(async () => {
    // A checagem de novo, aqui dentro. Entre planejar e gravar cabe uma
    // remessa de outro aparelho, e é exatamente o intervalo em que um saldo
    // deixa de existir.
    const dentro = await planReversal(companyId, input.groupId);
    if (dentro.alreadyReversed || dentro.blocked.length > 0) throw new CannotReverseError(dentro);

    const originais = await conn.getAllAsync<{
      id: string;
      item_id: string;
      quantity_base_units: number;
      location_id: string;
      unit_cost_rate: number | null;
      lot_id: string | null;
      counterpart_location_id: string | null;
    }>(
      `SELECT id, item_id, quantity_base_units, location_id, unit_cost_rate, lot_id,
              counterpart_location_id
         FROM movements
        WHERE company_id = ? AND movement_group_id = ? AND kind <> 'reversal'`,
      [companyId, input.groupId],
    );

    for (const o of originais) {
      const id = newId();
      await conn.runAsync(
        `INSERT INTO movements (id, company_id, kind, occurred_at, recorded_at, item_id,
                                quantity_base_units, location_id, unit_cost_rate,
                                movement_group_id, counterpart_location_id, lot_id,
                                reverses_movement_id, note,
                                operator_id)
         VALUES (?, ?, 'reversal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          companyId,
          occurred,
          at,
          o.item_id,
          // A taxa é a do movimento original, congelada: o estorno desfaz o que
          // aconteceu pelo valor com que aconteceu. Ler a média de hoje
          // avaliaria o erro de setembro ao preço de outubro.
          -o.quantity_base_units,
          o.location_id,
          o.unit_cost_rate,
          newGroup,
          o.counterpart_location_id,
          o.lot_id,
          o.id,
          input.note ?? null,
          await currentOperatorId(),
        ],
      );
      await enqueue(conn, [{ table: 'movements', rowId: id }]);
    }
  });

  // E o dinheiro volta junto com a quantidade.
  //
  // Sem isto o estorno consertava metade: o saldo voltava certinho e o custo
  // médio ficava com o erro dentro para sempre. Quem digitou 50 onde saíram 500
  // corrigia o estoque e continuava com o custo dez vezes alto embaixo de todo
  // número de dinheiro do aplicativo — e a confirmação que ele leu dizia que os
  // dois lançamentos ficam no histórico, que nada é apagado.
  //
  // FORA da transação, de propósito. A recomposição lê o razão inteiro do item, e
  // ela precisa enxergar as pernas do estorno que acabaram de ser escritas. Se
  // falhar aqui, o razão já está certo — que é o que a fundação protege — e a
  // média é cache: a próxima entrada daquele item a recompõe.
  for (const itemId of new Set(plan.legs.map((l) => l.itemId))) {
    await recomputeItemCost(companyId, itemId);
  }

  return { groupId: newGroup, legs: plan.legs };
}


/* ---------------------------------------------------------------------------
 * Gente e perfil — a tabela que faltava atrás de `operator_id`.
 *
 * Duas perguntas que o esquema misturava, e a `0035` separa com o motivo
 * escrito: `membership` é uma CONTA (exige `auth.users`), e `people` é uma
 * PESSOA que trabalha ali. Quem entra pela grade de nomes com PIN não tem conta
 * nenhuma — o aparelho está logado com a conta da empresa, e quem está com ele
 * na mão é anotação do registro.
 * ------------------------------------------------------------------------- */

/** Um pacote de permissões com nome, que a empresa monta. */
export type Profile = {
  id: string;
  /**
   * Vazio quando é um dos sete modelos: a palavra dele é da TELA, em três
   * idiomas. Quem quiser nome próprio renomeia, e aí o nome vence.
   */
  name: string;
  /** Qual dos sete papéis do produto originou este perfil. Nulo no perfil da empresa. */
  templateRole: Role | null;
  capabilities: Capability[];
  /** Quantas pessoas ativas vestem este perfil — é o que impede apagar sem olhar. */
  wearers: number;
};

/** Alguém que trabalha na empresa. Não é conta, e pode nunca ter uma. */
export type Person = {
  id: string;
  name: string;
  profileId: string;
  active: boolean;
  /**
   * Se esta pessoa pede PIN ao ser escolhida — e não QUAL é o PIN.
   *
   * A grade precisa saber se abre o teclado; não precisa do número. Mandar a
   * lista de PINs para dentro da tela para desenhar seis nomes seria carregar o
   * segredo de todo mundo em memória para não usar nenhum. Quem confere é
   * `matchPin`, no banco.
   */
  hasPin: boolean;
};

/**
 * Os sete modelos entram na primeira vez que alguém abre a tela de gente.
 *
 * Semeados e não chumbados: a partir daqui são linhas como qualquer outra, que o
 * dono renomeia e remarca permissão por permissão — decisão registrada no
 * `CLAUDE.md`. O que o produto entrega é um ponto de partida, não uma gaiola.
 *
 * Nome VAZIO de propósito, como o lugar padrão: "Entregador" é palavra de tela.
 * A ordem de `ROLES` é a ordem em que eles nascem, e ela não é alfabética — é a
 * do organograma, do dono para fora.
 */
async function ensureProfiles(conn: Db, companyId: string): Promise<void> {
  const existing = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM profiles WHERE company_id = ?`,
    [companyId],
  );
  if ((existing?.n ?? 0) > 0) return;

  const at = nowIso();
  const ids: string[] = [];
  for (const [role, caps] of Object.entries(ROLES)) {
    const id = newId();
    ids.push(id);
    await conn.runAsync(
      `INSERT INTO profiles (id, company_id, name, template_role, capabilities, created_at)
       VALUES (?, ?, NULL, ?, ?, ?)`,
      [id, companyId, role, caps.join(','), at],
    );
  }
  // Eles têm que chegar ao servidor antes da pessoa que aponta para eles, senão
  // a primeira sincronia falha numa chave estrangeira de uma linha que ninguém
  // sabia que faltava.
  await enqueue(
    conn,
    ids.map((id) => ({ table: 'profiles', rowId: id })),
  );
}

/**
 * Os perfis da empresa, com quantas pessoas vestem cada um.
 *
 * A contagem vem junto porque é ela que responde a pergunta seguinte da tela —
 * "dá para mexer neste?" — sem uma segunda ida ao banco por linha.
 */
export async function listProfiles(companyId: string): Promise<Profile[]> {
  const conn = await db();
  await ensureProfiles(conn, companyId);

  const rows = await conn.getAllAsync<{
    id: string;
    name: string | null;
    template_role: string | null;
    capabilities: string;
    wearers: number;
  }>(
    `SELECT p.id, p.name, p.template_role, p.capabilities,
            (SELECT COUNT(*) FROM people g
              WHERE g.profile_id = p.id AND g.company_id = p.company_id AND g.active = 1) AS wearers
       FROM profiles p
      WHERE p.company_id = ?
      ORDER BY p.created_at, p.name COLLATE NOCASE`,
    [companyId],
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? '',
    templateRole: (r.template_role as Role | null) ?? null,
    // Split de string vazia devolve `['']`, e uma permissão chamada "" passaria
    // adiante como se existisse: o filtro é o que impede o perfil sem nenhuma
    // permissão de parecer ter uma.
    capabilities: r.capabilities.split(',').filter(Boolean) as Capability[],
    wearers: r.wearers,
  }));
}

/** Quem trabalha na empresa, os inativos por último. */
export async function listPeople(companyId: string): Promise<Person[]> {
  const conn = await db();
  const rows = await conn.getAllAsync<{
    id: string;
    name: string;
    profile_id: string;
    active: number;
    has_pin: number;
  }>(
    // O PIN não sai do banco: sai a resposta de se ele existe. A grade precisa
    // saber se abre o teclado, e não qual é o número de cada um.
    `SELECT id, name, profile_id, active, (pin IS NOT NULL) AS has_pin FROM people
      WHERE company_id = ?
      ORDER BY active DESC, name COLLATE NOCASE`,
    [companyId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    profileId: r.profile_id,
    active: r.active === 1,
    hasPin: r.has_pin === 1,
  }));
}

/**
 * O PIN bate?
 *
 * A comparação mora aqui e não na tela por dois motivos. O primeiro é que o PIN
 * nunca precisa atravessar para o React: `listPeople` devolve se existe, esta
 * função devolve se bate, e o número fica no banco. O segundo é que a regra do
 * "sem PIN passa direto" é uma só e tem que ser uma só — duas cópias divergem, e
 * a que diverge para o lado errado deixa entrar sem perguntar.
 *
 * Pessoa sem PIN devolve verdadeiro para qualquer coisa, inclusive vazio: a
 * fábrica que não quis PIN escolhe com um toque, e é isso que ela pediu.
 */
export async function matchPin(
  companyId: string,
  personId: string,
  typed: string,
): Promise<boolean> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ pin: string | null }>(
    `SELECT pin FROM people WHERE id = ? AND company_id = ? AND active = 1`,
    [personId, companyId],
  );
  if (!row) return false;
  if (row.pin === null) return true;
  return row.pin === typed.trim();
}

/**
 * Cadastra ou corrige uma pessoa.
 *
 * Sem `delete`: gente não se apaga, pelo mesmo motivo que aparelho não se apaga.
 * Some da grade com `active = 0` e o histórico continua apontando para ela —
 * movimento cujo operador sumiu é movimento que não se pode explicar.
 */
export async function savePerson(
  companyId: string,
  input: {
    id?: string;
    name: string;
    profileId: string;
    active?: boolean;
    /**
     * Quatro a oito dígitos, ou nulo para tirar o PIN. **Omitir não é nulo**:
     * quem edita o nome de alguém não deve apagar o PIN dessa pessoa sem ter
     * pedido isso, e `undefined` aqui quer dizer "não mexi nisso".
     */
    pin?: string | null;
  },
): Promise<Person> {
  /**
   * Quem decide quem vê o dinheiro é a mesma pergunta que o portão do dinheiro.
   *
   * Esta é a porta larga que a refutação achou: a tela de gente listava todos os
   * perfis, o do dono incluído, e não conferia nada. Quem estivesse com o aparelho
   * tocava no próprio nome, trocava o crachá para "Dono" e voltava para a grade com as
   * doze capacidades — de forma durável, sem PIN, porque editar pessoa não repergunta
   * PIN. O portão do custo ficava intacto e irrelevante.
   *
   * A checagem mora AQUI e não na tela, pelo mesmo motivo de sempre: esconder botão é
   * decoração. A tela também esconde, porque erro que impede é melhor que erro que
   * reclama — mas o que recusa é isto.
   */
  await exigirCapacidade(companyId, 'manage_company', 'mexer em quem trabalha na empresa');

  const conn = await db();
  const id = input.id ?? newId();
  const active = input.active === false ? 0 : 1;

  // A mesma forma que o servidor cobra na `0036`, para o erro IMPEDIR aqui em
  // vez de a linha ser recusada meses depois, na primeira sincronia.
  const pin = input.pin == null ? input.pin : input.pin.trim();
  if (pin != null && !/^[0-9]{4,8}$/.test(pin)) throw new Error('pin: 4 a 8 dígitos');

  await conn.withTransactionAsync(async () => {
    if (input.id) {
      await conn.runAsync(
        `UPDATE people SET name = ?, profile_id = ?, active = ? WHERE id = ? AND company_id = ?`,
        [input.name.trim(), input.profileId, active, id, companyId],
      );
      if (pin !== undefined) {
        await conn.runAsync(`UPDATE people SET pin = ? WHERE id = ? AND company_id = ?`, [
          pin,
          id,
          companyId,
        ]);
      }
    } else {
      await conn.runAsync(
        `INSERT INTO people (id, company_id, name, profile_id, active, created_at, pin)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, companyId, input.name.trim(), input.profileId, active, nowIso(), pin ?? null],
      );
    }
    await enqueue(conn, [{ table: 'people', rowId: id }]);
  });

  const atual = await conn.getFirstAsync<{ has_pin: number }>(
    `SELECT (pin IS NOT NULL) AS has_pin FROM people WHERE id = ? AND company_id = ?`,
    [id, companyId],
  );

  return {
    id,
    name: input.name.trim(),
    profileId: input.profileId,
    active: active === 1,
    hasPin: (atual?.has_pin ?? 0) === 1,
  };
}
