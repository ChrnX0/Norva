## 12. A camada de dados — parte B (escrita: os atos que geram movimento)

### 12.1 O contrato que toda escrita cumpre

Todas as funções de escrita moram em `src/data/repository.ts` (4.525 linhas). Não existe
segundo caminho de escrita: o assistente grava pelas **mesmas** funções, via um binding que
só preenche o `companyId` (`src/data/assistantData.ts:33-72`), e a simulação também
(`src/data/simulate.ts:2-10`).

Quatro primitivas comuns:

| Primitiva | Origem | O que faz |
|---|---|---|
| `db()` | `src/data/db.ts` | devolve a conexão (`Db`), com `PRAGMA journal_mode = WAL` e `PRAGMA foreign_keys = ON` (`src/data/db.ts:24-26`, aplicadas em `src/data/db.ts:753`) |
| `newId()` | `src/data/db.ts:842-847` | uuid v4 gerado **no cliente**, com hex aleatório: `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`. Cliente-gerado para que reenviar a fila seja idempotente |
| `nowIso()` | `src/data/db.ts:849-851` | `new Date().toISOString()` |
| `enqueue(conn, writes)` | `src/data/outbox.ts:46-63` | insere uma linha em `outbox (id, table_name, row_id, op, payload, queued_at)` por escrita. `op` default `'upsert'`, `payload` default `'{}'`. Recebe a conexão em vez de abrir uma, **porque o chamador está dentro de uma transação e precisa entrar nela** |

O formato de uma escrita enfileirada é `PendingWrite = { table: string; rowId: string; op?: 'upsert' | 'delete'; payload?: Record<string, unknown> }` (`src/data/outbox.ts:35-40`). A fila
guarda **só tabela e id** — o conteúdo é lido do aparelho na hora de enviar
(`src/data/repository.test.ts:2735-2737`).

Transação: `conn.withTransactionAsync(async () => { ... })`. SQLite não tem transação
aninhada, então **a transação pertence à função pública e a privada entra nela** — é a razão
de `writeItem` existir separada de `saveItem` (`src/data/repository.ts:220-226`).

#### As colunas de `movements` no aparelho

DDL do aparelho (`src/data/db.ts:225-248`), mais as colunas acrescentadas por migração:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | TEXT PK | |
| `company_id` | TEXT NOT NULL | |
| `kind` | TEXT NOT NULL | sem CHECK no aparelho; o enum é do servidor |
| `occurred_at` | TEXT NOT NULL | quando aconteceu no mundo |
| `recorded_at` | TEXT NOT NULL | quando o aparelho soube |
| `item_id` | TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE | |
| `quantity_base_units` | **INTEGER** NOT NULL | assinado: positivo entra, negativo sai |
| `location_id` | TEXT NOT NULL REFERENCES locations(id) ON DELETE **RESTRICT** | |
| `lot_id` | TEXT | **sem** chave estrangeira no aparelho, de propósito (`src/data/db.ts:494`) |
| `loss_reason` | TEXT | |
| `unit_cost_rate` | REAL | centavos fracionários por unidade-base, congelados |
| `reverses_movement_id` | TEXT REFERENCES movements(id) **DEFERRABLE INITIALLY DEFERRED** | deferido para que apagar a tabela não tropece nas próprias linhas |
| `assistant_phrase` | TEXT | |
| `note` | TEXT | |
| `operator_id` | TEXT | V5 (`src/data/db.ts:322`) |
| `movement_group_id` | TEXT | V6 (`src/data/db.ts:344`) |
| `counterpart_location_id` | TEXT REFERENCES locations(id) | V6 (`src/data/db.ts:345`) |
| `post` | TEXT | V7 (`src/data/db.ts:366`) |

A V4 acrescentou `recorded_by` e a V5 **apagou** essa coluna (`src/data/db.ts:303`,
`src/data/db.ts:322-323`): no aparelho ela nunca teve valor próprio, e o autor é estampado
na saída pelo serializador.

Índices: `movements_balance_idx (company_id, item_id, location_id, occurred_at)`
(`src/data/db.ts:251-252`), `movements_group_idx (company_id, movement_group_id) WHERE
movement_group_id IS NOT NULL` (`src/data/db.ts:368-370`) e
`movements_reversal_idx (reverses_movement_id, company_id)` (`src/data/db.ts:671-672`).

#### Os enums que o servidor impõe (e o aparelho não)

```
movement_kind: 'production' | 'consumption' | 'transfer' | 'sale'
             | 'loss' | 'return' | 'adjustment' | 'discrepancy' | 'reversal'
loss_reason:  'melted' | 'broken' | 'expired' | 'courtesy' | 'internal_use'
control_post: 'picked' | 'loaded' | 'delivered' | 'checked'
location_kind:'factory' | 'cold_room' | 'store_room' | 'own_store' | 'customer' | 'vehicle'
```
(`supabase/migrations/0001_foundation.sql:172-179` e `:109`)

Restrições do servidor que o aparelho **não** replica:
- `quantity_base_units <> 0`, relaxada por
  `movement_moved_something: quantity_base_units <> 0 OR kind = 'adjustment' OR (kind = 'discrepancy' AND post IS NOT NULL)` (`supabase/migrations/0017_a_check_that_matched_is_a_fact.sql:20-26`)
- `loss_needs_reason: kind <> 'loss' OR loss_reason IS NOT NULL` (`supabase/migrations/0001_foundation.sql:220-221`)
- `reversal_points_somewhere: kind <> 'reversal' OR reverses_movement_id IS NOT NULL` (`supabase/migrations/0001_foundation.sql:222-223`)
- `recorded_by uuid NOT NULL REFERENCES auth.users(id)` (`supabase/migrations/0001_foundation.sql:191`), imposto pela política como `recorded_by = auth.uid()`

O serializador estampa o autor na travessia: `build: (_row, actor) => ({ recorded_by: actor.userId })` (`src/sync/serialize.ts:365`).

#### Inventário completo das escritas

Legenda de estado: **T** = implementado e chamado por tela; **A** = chamado pelo assistente;
**S** = chamado só pela simulação/semeadura; **X** = implementado sem chamador de produção.

| Função | linha | Linhas de `movements` | `kind` | `movement_group_id` | Enfileira | Estado |
|---|---|---|---|---|---|---|
| `recordPurchase` | 296 | 1 | `purchase`¹ | o id da **nota** (`purchases.id`) | `purchases`, `purchase_lines`, `movements` | T (`app/purchase.tsx`, `app/inputs/new.tsx`, `app/inputs/[id].tsx`), A |
| `recordCount` | 886 | 1 (pode ser quantidade 0) | `adjustment` | **o próprio id da linha** | `movements` | T (`app/inputs/[id].tsx`), A |
| `recordProduction` | 1311 | 1 + N (N = itens consumidos) | `production` + `consumption` | `newId()` novo | `lots`, depois cada `movements` | T (`app/production/new.tsx`), A, S |
| `recordTransfer` | 1749 | 2 | `transfer` | `newId()` novo | 2× `movements` | T (`app/transfer.tsx`), A, S |
| `recordReturn` | 1767 | 2 | `return` | `newId()` novo | 2× `movements` | T (`app/transfer.tsx`) |
| `recordLoss` | 2089 | 1 | `loss` | **o próprio id da linha** | `movements` | T (`app/inputs/[id].tsx`) |
| `recordCheck` | 2436 | 1 por perna de entrada da remessa | `discrepancy` (com `post = 'checked'`) | **o grupo da remessa conferida** | cada `movements` | T (`app/(tabs)/transport.tsx`) |
| `reverseGroup` | 4442 | 1 por linha do grupo original | `reversal` | `newId()` novo, comum às pernas | cada `movements` | T (`app/lots/[id].tsx`, `app/inputs/[id].tsx`) |
| `recordReading` | 2769 | 0 (grava em `readings`) | — | — | `readings` | T (`app/places.tsx`) |
| `openProductionRun` | 2260 | **0** | — | — | **nada** | T (`app/production/new.tsx`) |
| `cancelProductionRun` | 2349 | 0 (DELETE em `production_runs`) | — | — | nada | T (`app/production/new.tsx`) |
| `closeProductionRun` | 2365 | delega a `recordProduction` | idem | idem | idem | T (`app/production/new.tsx`) |
| `saveItem` / `writeItem` | 207 / 227 | 0 | — | — | `items` | T, A |
| `saveProduct` | 1894 | 0 | — | — | `items` (via `writeItem`) + `products` | T (`app/products/new.tsx`) |
| `saveRecipeVersion` | 1137 | 0 | — | — | `recipes`, `recipe_versions`, N× `recipe_lines` | T (`app/recipes/[id].tsx`) |
| `savePlace` | 630 | 0 | — | — | `locations` | T (`app/places.tsx`) |
| `ensureLocation` (privada) | 847 | 0 | — | — | `locations` | interna |
| `setItemActive` | 3608 | 0 | — | — | `items` | T (`app/inputs/[id].tsx`) |
| `saveLine` / `saveType` / `saveFlavor` | 3680 / 3698 / 3716 | 0 | — | — | `product_lines` / `product_types` / `flavors` | T (`app/catalog.tsx`) |
| `saveOrder` | 3986 | **0 — de propósito** | — | — | `orders`, N× `order_lines` | T (`app/orders/new.tsx`) |
| `setOrderStatus` | 4093 | 0 | — | — | `orders` | T (`app/orders/index.tsx`, `app/transfer.tsx`) |
| `recomputeItemCost` | 4344 | 0 (reescreve `item_costs` + histórico) | — | — | **nada** | interna a `reverseGroup`; sem chamador de tela |
| `eraseArea` | 3456 | apaga em massa | — | — | 1× `{table:'erase', op:'delete'}` | T (`app/settings.tsx`) |
| `setBriefingOrder` / `setBriefingHidden` / `setAlertSettings` / `setOrdersNeedApproval` | 3904 / 3920 / 3964 / 3982 | 0 (`app_meta`) | — | — | **nada** | T |

¹ `'purchase'` **não está** no enum `movement_kind` do servidor
(`supabase/migrations/0001_foundation.sql:172-175`), mas é escrito pelo aparelho
(`src/data/repository.ts:415`) e pelo backfill da migração V3 (`src/data/db.ts:266-270`).
Ver §12.17.

Duas tabelas **nunca** entram na fila, e as duas omissões são decisão escrita:
`item_costs` e `item_cost_history` (valor derivado tem um autor só — `src/sync/serialize.ts:44-59`;
o serializador devolve `{ kind: 'derived', table }` se algo as enfileirar,
`src/sync/serialize.ts:385-387`) e `production_runs` (estado, não fato do negócio —
`src/data/db.ts:373-392`; confirmado pela ausência dela na lista de `enqueue`).

---

### 12.2 Compra — `recordPurchase`

```ts
export async function recordPurchase(
  companyId: string,
  input: {
    itemId: string;
    supplierName?: string;
    purchaseQuantity: number;   // o que o comprador digitou: 8 sacos
    baseUnits: number;          // já convertido, o armazenamento só vê unidade-base
    totalCents: Cents;
    orderedAt?: string;
    occurredAt?: string;
    assistantPhrase?: string;
  },
): Promise<{ previousRate: Rate | null; newRate: Rate }>
```
(`src/data/repository.ts:296-320`)

**Antes da transação** (leituras, `src/data/repository.ts:378-403`):
1. `at = nowIso()`; `occurred = input.occurredAt ?? at`.
2. Lê `average_rate` de `item_costs WHERE item_id = ?`.
3. Lê o saldo do item na **empresa inteira**: `SELECT COALESCE(SUM(quantity_base_units),0) FROM movements WHERE company_id = ? AND item_id = ?` — de propósito, do livro-razão e nunca de um total armazenado.
4. Monta `before: StockCostState = { baseUnits, averageRate }` e chama
   `applyCostEvent(before, { kind: 'purchase', baseUnits, totalCents, at })`
   (`src/domain/cost.ts:59-74`), cuja aritmética é
   `heldValue = averageRate * max(0, baseUnits)`, `newUnits = max(0, baseUnits) + evento.baseUnits`,
   `newValue = heldValue + totalCents`, `averageRate = newValue / newUnits`.

**Ids gerados antes da transação:** `purchaseId = newId()` e `lineId = newId()`. **A linha da
nota e o movimento que ela causa compartilham um id**, porque são um fato visto duas vezes —
reproduzir a fila não pode lançar a chegada de novo (`src/data/repository.ts:359-361`).

**Dentro da transação** — cinco escritas (`src/data/repository.ts:363-459`):

| # | Tabela | Colunas |
|---|---|---|
| 0 | `locations` | via `ensureLocation` — dentro da transação, para que um lugar não sobre de uma compra que falhou |
| 1 | `purchases` | `id, company_id, supplier_name, ordered_at, received_at, created_at` — `received_at` e `created_at` recebem `at` |
| 2 | `purchase_lines` | `id, company_id, purchase_id, item_id, purchase_quantity, base_units, total_cents, created_at` |
| 3 | `movements` | `id = lineId`, `kind = 'purchase'`, `occurred_at = occurred`, `recorded_at = at`, `quantity_base_units = input.baseUnits` (positivo), `location_id` = o padrão, `unit_cost_rate = lineRate`, `movement_group_id = purchaseId`, `assistant_phrase` |
| 4 | `item_costs` | upsert por `item_id`: `average_rate = after.averageRate`, `last_rate = lineRate`, `updated_at = at` |
| 5 | `item_cost_history` | `id = newId(), company_id, item_id, previous_rate = before.averageRate \|\| null, new_rate = after.averageRate, observed_at = occurred` |

`lineRate = rate(input.totalCents / 100, input.baseUnits)` (`src/data/repository.ts:410`), e
`rate(preço, unidades) = (preço * 100) / unidades` (`src/domain/money.ts:52-55`) — ou seja
centavos por unidade-base, fracionário, jamais arredondado.

**O grupo é a NOTA, não a linha** (`src/data/repository.ts:426-429`): hoje entra uma linha por
chamada e os dois ids dariam no mesmo, mas no dia em que a nota tiver duas linhas, um grupo por
linha desfaria metade de uma nota. O teste prende isso:
`assert.notEqual(nota.groupId, nota.id, 'o grupo da compra é a nota, não a linha')`
(`src/data/repository.test.ts:194`).

**Fila:** exatamente três entradas, nesta ordem — `purchases`, `purchase_lines`, `movements`
(`src/data/repository.ts:455-459`). `item_costs` fica fora porque o gatilho
`apply_purchase_to_cost` do servidor deriva a média das próprias `purchase_lines`; mandar a
cópia do aparelho dá dois autores ao número, e a reprodução da fila já colocou o servidor em
0,5605 onde o telefone dizia 0,5310 (`src/data/repository.ts:437-454`).

**Retorno:** `{ previousRate: before.averageRate > 0 ? before.averageRate : null, newRate: after.averageRate }`.

**Validações:** NENHUMA. `recordPurchase` não recusa `baseUnits <= 0` nem `totalCents <= 0`.
Com `baseUnits = 0` ela grava um `movements` com `quantity_base_units = 0` que o aparelho
aceita e o servidor recusa por `movement_moved_something`. Ver §12.17.

Números provados: quatro sacos de 25 kg por R$ 472 → 0,472 centavo por grama; a segunda nota de
100.000 g por R$ 590 → média 0,531 e `last_rate` 0,59 (`src/data/repository.test.ts:270-297`).
Polpa a R$ 12,40/kg → 1,24 centavo por grama, guardado sem arredondar
(`src/data/repository.test.ts:305-318`).

---

### 12.3 O lugar — `defaultLocationId` e `ensureLocation`

```ts
export function defaultLocationId(companyId: string): string { return companyId; }
```
(`src/data/repository.ts:843-845`) — enquanto há um lugar só, **o id dele é o da própria
empresa**, e foi assim que todo movimento já gravado foi carimbado.

```ts
async function ensureLocation(conn: Db, companyId: string): Promise<string>
```
(`src/data/repository.ts:847-865`): procura `locations WHERE id = ?` com o `companyId`; se não
achar, insere `(id = companyId, company_id = companyId, name = '', kind = 'store_room',
created_at = nowIso())` e enfileira `{ table: 'locations', rowId: companyId }`.

Duas decisões dentro disso:
- **O nome nasce vazio** de propósito, e não escrito em português: toda palavra que uma pessoa
  lê está no dicionário, e um padrão que viesse com uma língua seria a única string que
  escapou (`src/data/db.ts:254-262`).
- **O lugar tem de chegar ao servidor antes do movimento que se apoia nele**, senão a primeira
  sincronização quebra uma chave estrangeira numa linha que ninguém sabia que faltava
  (`src/data/repository.ts:858-861`).

`savePlace` (`src/data/repository.ts:630-703`) cadastra ou renomeia:

```ts
savePlace(companyId, {
  id?: string; name: string; kind: string;
  contactPhone?: string; deliveryDays?: number; agreementNote?: string;
  sensorRanges?: Record<string, SensorRange>;
}): Promise<Place>
```

- `name.trim()` vazio → `throw new Error('um lugar sem nome não se distingue de outro')` (`:645`).
- `days = Math.trunc(input.deliveryDays ?? 0)`; `days < 0 || days > 127` →
  `throw new Error('a semana tem sete dias')` (`:654`). É bitmask de dias da semana: o teste
  passa `4 | 32` (terça e sexta) e lê 36 de volta (`src/data/repository.test.ts:2703-2707`).
- **Campo ausente é "não mexa no que já estava combinado"**: lê a linha anterior e reaproveita
  `contact_phone`, `delivery_days`, `agreement_note`, `sensor_ranges` quando o input não os
  traz (`:656-682`). `sensorRanges` vazio (`{}`) apaga; ausente preserva.
- Upsert em `locations` com `ON CONFLICT(id) DO UPDATE` de nome, tipo, telefone, dias, nota e
  faixas; enfileira `locations` (`:684-693`).
- Renomear é seguro sem cerimônia porque nenhum movimento carrega o nome do lugar — carrega o
  id (`src/data/repository.ts:622-629`), provado por
  `src/data/repository.test.ts:2156-2181` ("the money did not notice the new name").

---

### 12.4 Contagem — `recordCount`

```ts
export async function recordCount(
  companyId: string,
  input: {
    itemId: string;
    countedBaseUnits: number;
    note?: string;
    assistantPhrase?: string;
    occurredAt?: string;   // padrão: agora
    locationId: string;    // OBRIGATÓRIO, e sem valor padrão de propósito
  },
): Promise<CountResult>
```
(`src/data/repository.ts:886-914`)

```ts
export type CountResult = {
  expectedBaseUnits: number;   // o que o razão acreditava antes de alguém ir à prateleira
  countedBaseUnits: number;
  deltaBaseUnits: number;      // assinado; negativo = havia menos do que o razão pensava
  deltaCents: Cents;           // quanto vale essa diferença, ao custo médio
};
```
(`src/data/repository.ts:470-478`)

`locationId` é exigido sem padrão porque **uma contagem é a única cifra que vem de alguém
parado na frente da mercadoria**: com um padrão, contar a câmara fria sem dizer isso compararia
contra o saldo da empresa inteira e escreveria a diferença na câmara — estoque teleportado por
um operador que fez tudo certo (`src/data/repository.ts:895-908`).

Aritmética (`src/data/repository.ts:918-933`):
- `expected` = `SUM(quantity_base_units) FROM movements WHERE company_id = ? AND item_id = ? AND location_id = ?`
- `counted = Math.round(input.countedBaseUnits)`
- `averageRate` = `item_costs.average_rate` do item, ou 0
- `delta = counted - expected`
- `deltaCents = amountOf(averageRate, delta)`, e `amountOf(taxa, q) = Math.round(taxa * q)` (`src/domain/money.ts:58-60`) — **o único ponto de arredondamento**

Escrita, uma linha (`src/data/repository.ts:935-970`): `ensureLocation`, depois
`INSERT INTO movements` com `kind = 'adjustment'`, `quantity_base_units = delta`,
`location_id = input.locationId` (**não** o retorno de `ensureLocation`),
`unit_cost_rate = averageRate || null`, `movement_group_id = id` — **o grupo é a própria
linha**, porque sem grupo a contagem não teria como ser DESFEITA: `planReversal` procura pelo
grupo, e o que não tem grupo não existe para ele (`src/data/repository.ts:952-956`). Enfileira
`movements`.

**Contagem que bate é gravada também**, com diferença zero: alguém olhou, e a prateleira estava
certa — descartar isso deixaria uma prateleira não conferida há meses indistinguível de uma
verificada hoje de manhã (`src/data/repository.ts:881-885`,
`src/data/repository.test.ts:638-656`).

Números provados: 100.000 g esperados, 92.000 contados → `delta = -8.000`,
`deltaCents = -3.776` (8.000 × 0,472 centavo) — R$ 37,76 que saíram do almoxarifado sem nota
(`src/data/repository.test.ts:607-636`).

Guarda de fonte associada: `contagemCega` em `src/layers.test.ts:309-320` varre `app/` e falha
se alguma tela passar `locationId` como chamada de função, `LOCAL_COMPANY_ID` ou `companyId` —
os três jeitos de dizer "o almoxarifado, sempre" ao lado de um número que pode não ser dele
(`src/layers.test.ts:283-307`).

---

### 12.5 Produção — `recordProduction`

```ts
export async function recordProduction(
  companyId: string,
  input: {
    productId: string;
    locationId: string;     // onde foi feito, e onde o produto passa a estar
    batches: number;        // quantos tachos, é o que decide o consumo
    unitsProduced: number;  // quantas unidades saíram DE VERDADE
    producedOn: string;     // data de calendário local, OBRIGATÓRIA e sem padrão
    lotCode?: string;       // quando a fábrica tem padrão próprio
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<ProductionResult>
```
(`src/data/repository.ts:1311-1346`)

```ts
export type ProductionResult = {
  lot: { id: string; code: string; expiresOn: string | null };
  groupId: string;
  unitsProduced: number;
  unitCostRate: Rate;      // custo congelado do produto, por unidade, taxa fracionária
  consumed: { itemId: string; baseUnits: number; rate: Rate }[];
};
```
(`src/data/repository.ts:1246-1255`)

`producedOn` é obrigatório e **sem valor padrão de propósito**: o livro-razão guarda um
INSTANTE (`occurred_at`), a data do lote é o dia local, e transformar um no outro precisa do
fuso da fábrica, que esta camada não conhece — meia-noite de 3 de setembro em Madri é 2 de
setembro em UTC, e o lote nasceria com a data de ontem em metade do mundo
(`src/data/repository.ts:1325-1338`).

#### Validações, na ordem (todas antes de qualquer escrita)

| Condição | Erro |
|---|---|
| produto não existe | `Error(\`produto ${input.productId} não existe\`)` (`:1352`) |
| `product.recipeId` nulo | `Error(\`${product.name} é revenda: não se produz\`)` (`:1353`) |
| `input.batches <= 0` | `Error('uma corrida tem pelo menos um tacho')` (`:1354`) |
| `input.unitsProduced <= 0` | `Error('uma corrida que não rendeu nada é um erro, não um fato')` (`:1355`) |
| receita ausente do grafo | `Error(\`a receita de ${product.name} não está no aparelho\`)` (`:1359`) |
| saldo da SALA insuficiente | `NotEnoughStockError` (`:1462-1464`) |

```ts
export class NotEnoughStockError extends Error {
  constructor(
    public readonly missing: { itemId: string; name: string; needed: number; held: number }[],
  ) { super(`Not enough stock: ${missing.map((m) => m.name).join(', ')}`); this.name = 'NotEnoughStockError'; }
}
```
(`src/data/repository.ts:1302-1309`) — nomeado e com os itens dentro porque a tela precisa
dizer QUAIS faltaram; "faltou insumo" manda a pessoa procurar (`src/data/repository.ts:1295-1301`).

#### Como o consumo é calculado

1. `needed = explodeRequirements(product.recipeId, input.batches, graph)`
   (`src/domain/recipe.ts:278-307`). Item entra por `quantity * batches`; sub-receita converte
   pelo rendimento LÍQUIDO: `netYield = sub.yieldAmount * (1 - sub.lossFraction)` e
   `subBatches = (line.quantity * batches) / netYield`.
2. **A embalagem entra somada em `needed`, e conta por UNIDADE, não por tacho**
   (`src/data/repository.ts:1379-1382`):
   `needed[itemId] += linha.quantityPerUnit * input.unitsProduced`.
   Meio tacho gasta metade do açúcar, mas 400 unidades gastam 400 palitos — o tacho que rendeu
   menos não devolve palito (`src/data/repository.ts:1374-1378`). Entrar em `needed` em vez de
   num caminho paralelo é o que faz a embalagem atravessar a trava de estoque, o valor
   consumido e a taxa congelada (`src/data/repository.ts:1367-1372`).
3. Por item: `quantity = Math.round(baseUnits)` — **a quantidade arredonda aqui, uma vez, e a
   taxa não arredonda nunca** (`src/data/repository.ts:1406`). `quantity_base_units` é INTEGER
   no aparelho e `bigint` no servidor, e meio tacho de base de creme pede
   7.530,612244897959 g de açúcar: a afinidade de tipo do SQLite aceita esse REAL sem dizer
   nada e o Postgres arredondaria (`src/data/repository.ts:1392-1404`).
4. `consumedValue += rate * quantity` — soma sem arredondar em lugar nenhum
   (`src/data/repository.ts:1408`).

#### A trava de estoque

```sql
SELECT m.item_id, i.name, COALESCE(SUM(m.quantity_base_units), 0) AS on_hand
  FROM movements m JOIN items i ON i.id = m.item_id
 WHERE m.company_id = ? AND m.location_id = ?
 GROUP BY m.item_id, i.name
```
(`src/data/repository.ts:1436-1443`) — **o piso é o da SALA em que o tacho está, não o da
empresa** (`src/data/repository.ts:1424-1435`). Antes disso bastava a fábrica mandar um saco de
açúcar para a loja para a conta autorizar um tacho com o açúcar que estava a dez quilômetros.
A guarda mora aqui e não no botão porque o livro-razão recebe escrita de mais de um lugar — o
assistente, a simulação, e amanhã uma API; foi a simulação que encontrou o defeito: catorze
dias de fábrica levaram a polpa a MENOS 192.000 g sem uma reclamação
(`src/data/repository.ts:1411-1420`).

No caminho que já vai falhar, os nomes vêm do catálogo (`labels(companyId)`), porque um insumo
com zero linha naquela sala não aparece na consulta de saldo e a tela diria o uuid
(`src/data/repository.ts:1456-1464`).

#### A taxa congelada

```
unitCostRate = consumedValue / input.unitsProduced + product.unitPackagingCents
```
(`src/data/repository.ts:1481`) — o consumo real dividido pelas unidades que **de fato**
saíram, não pelo rendimento teórico; se o tacho rendeu 480 onde a ficha prometia 500, congelar
o teórico esconderia a perda no exato momento em que ela aconteceu
(`src/data/repository.ts:1267-1273`). A embalagem por unidade entra porque sete telas cotam o
custo de uma unidade como receita + embalagem: se o razão congelasse só a receita, toda margem
futura sairia inflada pelo palito e pelo saquinho (`src/data/repository.ts:1466-1480`).

#### O que a transação escreve

Ordem (`src/data/repository.ts:1487-1610`):

1. `ensureLocation`.
2. **O lote, ANTES das linhas que o citam.** Sequência do DIA:
   `SELECT COUNT(*) FROM lots WHERE company_id = ? AND produced_on = ?`, e
   `code = input.lotCode ?? lotCode(input.producedOn, n + 1)`
   (`src/data/repository.ts:1502-1506`).
   `lotCode(producedOn, sequence)` = `${producedOn sem hífens}-${String(sequence).padStart(2,'0')}`
   → `20260902-01` (`src/domain/lot.ts:33-36`).
   `expiresOn(producedOn, shelfLifeDays)` soma dias de calendário em UTC e devolve
   `YYYY-MM-DD`, ou **null** quando o produto não tem prazo (`src/domain/lot.ts:49-55`):
   `2026-09-02` + 180 = `2027-03-01`.
   `INSERT INTO lots (id, company_id, item_id, code, produced_on, expires_on,
   recipe_version_id, created_at)` — o `recipe_version_id` é o carimbo da ficha que rodou, e é
   o único lugar durável onde ela cabe, porque `production_runs` é apagada ao fechar
   (`src/data/repository.ts:1508-1522`). Enfileira `lots` imediatamente, para que ele suba
   antes do movimento (o servidor tem a FK que o SQLite daqui não tem —
   `src/data/repository.ts:1489-1497`, provado em `src/data/repository.test.ts:1508-1521`).
3. A média do PRODUTO, com o saldo de ANTES da corrida (`src/data/repository.ts:1555-1585`):
   lê `item_costs.average_rate` e `SUM(quantity_base_units)` do produto na empresa, e
   `mediaNova = blendRate(antes, { baseUnits: input.unitsProduced, rate: unitCostRate })`.
   `blendRate` (`src/domain/cost.ts:94-102`) mistura **taxa com taxa**, sem passar por dinheiro:
   `(held.averageRate * max(0,heldUnits) + arriving.rate * arriving.baseUnits) / total`.
   Forçar isso a centavos inteiros fazia a primeira corrida de 500 unidades sair com média
   64,996 contra custo congelado 64,99686 (`src/domain/cost.ts:84-89`).
   Upsert em `item_costs` (`average_rate = mediaNova`, `last_rate = unitCostRate`) e insert em
   `item_cost_history` (`previous_rate = antes.averageRate || null`, `new_rate = mediaNova`,
   `observed_at = occurred`).
4. As linhas de razão, pela função interna `write(id, kind, itemId, quantity, rate, lot)`
   (`src/data/repository.ts:1524-1553`), que insere em `movements` com
   `occurred_at = occurred`, `recorded_at = at`, `location_id = input.locationId`,
   `unit_cost_rate = rate || null`, `movement_group_id = groupId`, `lot_id`, `note`,
   `assistant_phrase`, e enfileira cada uma:
   - **uma** linha `production`: `item_id = product.itemId`,
     `quantity = +input.unitsProduced`, `rate = unitCostRate`, `lot_id = lotId` (`:1606`)
   - **N** linhas `consumption`, uma por item de `consumed`:
     `quantity = -line.baseUnits`, `rate = line.rate`, `lot_id = null` (`:1607-1609`)

**Só a linha de PRODUÇÃO aponta para o lote novo.** O lote do insumo é outro — é o da nota em
que ele entrou; carimbar o lote do picolé na saída da polpa diria que a polpa pertence ao
picolé, e o recall recolheria o saco de açúcar. Consumo por lote é PEPS de insumo, trabalho da
Fase 3 (`src/data/repository.ts:1598-1605`).

Sete linhas para uma corrida de seis insumos, e não uma: `movements` tem UM `item_id` e uma
quantidade assinada, e o saldo é `sum(...) group by empresa, item, local`. Sete itens numa
linha exigiriam um leitor que abre payload, e o saldo deixaria de ser uma soma. A política do
servidor concorda: `movements_append` é um CASE por `kind` sem ELSE, e uma linha não pode ser
dois tipos (`src/data/repository.ts:1258-1265`).

**A média do produto é escrita aqui e essa foi a metade que faltava**
(`src/data/repository.ts:1274-1293`): picolé nunca foi comprado, então nunca teve linha em
`item_costs`, então valia zero — e o zero não ficava numa tela só: `stockByPlace` valorava a
loja com 1.466 picolés em R$ 0,00, e `moveBetween`/`recordLoss` congelavam `unit_cost_rate`
NULO. O efeito somado era o pior: o insumo saía do saldo valorado e o produto entrava valendo
nada, então o dinheiro evaporava do balanço a cada corrida. O servidor tem o espelho na
migração `supabase/migrations/0025_what_the_kettle_makes_is_worth_something.sql`.

---

### 12.6 A corrida aberta — `openProductionRun`, `cancelProductionRun`, `closeProductionRun`

`production_runs` é a **primeira tabela do aparelho que não espelha o servidor**, e a razão está
escrita: uma corrida aberta não é fato do negócio, é a INTENÇÃO de um ato em curso
(`src/data/db.ts:373-392`). DDL (`src/data/db.ts:393-403`):
`id, company_id, product_id REFERENCES products(id) ON DELETE CASCADE, recipe_version_id,
batches REAL, location_id REFERENCES locations(id) ON DELETE RESTRICT, opened_at`.

```ts
openProductionRun(companyId, { productId: string; batches: number }): Promise<OpenRun>
```
(`src/data/repository.ts:2260-2306`)

- `!(batches > 0) || !Number.isFinite(batches)` → `Error('um tacho tem de ser mais que zero')` (`:2265`)
- produto inexistente → `Error(\`produto ${id} não existe\`)` (`:2269`)
- revenda → `Error(\`${name} é revenda: não se produz\`)` (`:2270`)
- receita ausente → `Error(\`a receita de ${name} não está no aparelho\`)` (`:2274`)
- **Não valida saldo, e isso é decisão e não esquecimento**: na abertura a falta é uma PREVISÃO,
  e recusar a abertura não impede o tacho de estar rodando — só deixa a corrida sem registro
  (`src/data/repository.ts:2252-2259`).
- Grava `recipe_version_id = recipe.versionId` — o id da VERSÃO na coluna da versão. Aqui
  entrava `product.recipeId`, um uuid legítimo na coluna errada, e não quebrava nada visível
  porque ninguém lia de volta (`src/data/repository.ts:2284-2291`).
- **Não abre transação e não enfileira nada.**

`cancelProductionRun(companyId, runId)` (`src/data/repository.ts:2349-2355`):
`DELETE FROM production_runs WHERE id = ? AND company_id = ?`. Nada no razão — é aqui que
"estado, não movimento" se paga: não existe estorno porque não existe lançamento. E não pergunta
motivo: o app não fiscaliza (`src/data/repository.ts:2342-2348`). Cancelar duas vezes não é erro
(`src/data/repository.test.ts:1170-1172`).

`closeProductionRun(companyId, { runId, unitsProduced, producedOn, note?, assistantPhrase? })`
(`src/data/repository.ts:2365-2408`):
1. Acha a corrida em `openProductionRuns`; se não achar, `throw new RunGoneError(runId)`
   (`src/data/repository.ts:2245-2250`, mensagem `corrida ${runId} não está aberta`) — **antes
   de escrever qualquer coisa**, que é o que torna impossível produzir duas vezes por toque
   repetido.
2. Chama `recordProduction` com `occurredAt: run.openedAt` — a corrida aberta às 23h de segunda
   e fechada à 1h de terça é produção de segunda.
3. **Só depois de o razão aceitar**, apaga a linha de `production_runs`. Se a produção falhar
   por falta de insumo, a corrida continua aberta e a pessoa pode lançar a compra e fechar de
   novo (`src/data/repository.ts:2400-2404`, provado em `src/data/repository.test.ts:1191-1205`).

**Contradição documentada:** o docblock afirma *"O id da corrida vira o `movement_group_id` das
linhas"* (`src/data/repository.ts:2360-2361`) e a migração V8 repete a afirmação
(`src/data/db.ts:378-380`). **Isso NÃO acontece no código**: `recordProduction` gera
`const groupId = newId()` (`src/data/repository.ts:1384`) e não aceita `groupId` no input, e
`closeProductionRun` não o passa. O grupo das linhas é um uuid novo, sem relação com `runId`.
O teste que parecia cobrir isso lê `fechada.groupId` — o valor devolvido — e não compara com
`corrida.id` (`src/data/repository.test.ts:1148-1154`).

---

### 12.7 Transferência e devolução — `moveBetween`, `recordTransfer`, `recordReturn`

```ts
type MoveInput = {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  baseUnits: number;      // sempre positivo: quanto sai de lá e chega aqui
  lotId?: string | null;  // ausente é legítimo: item sem lote (açúcar, palito)
  occurredAt?: string;
  note?: string;
  assistantPhrase?: string;
};
```
(`src/data/repository.ts:1645-1663`)

```ts
async function moveBetween(companyId, input: MoveInput, kind: 'transfer' | 'return'): Promise<TransferResult>
export async function recordTransfer(companyId, input: MoveInput): Promise<TransferResult>  // kind 'transfer'
export async function recordReturn(companyId, input: MoveInput): Promise<TransferResult>    // kind 'return'
```
(`src/data/repository.ts:1683-1772`)

```ts
export type TransferResult = { groupId: string; baseUnits: number; unitCostRate: Rate };
```
(`src/data/repository.ts:1621-1625`)

**Validações** (`src/data/repository.ts:1688-1693`):
- `fromLocationId === toLocationId` → `Error('origem e destino são o mesmo lugar')`
- `baseUnits <= 0` → `Error('uma transferência move alguma coisa; para o sentido inverso, troque os lugares')`
- **Não** existe trava de saldo aqui: uma transferência pode deixar a origem negativa. NÃO ESTÁ NO CÓDIGO nenhuma checagem de estoque em `moveBetween`.

`unitCostRate` = `item_costs.average_rate` do item, ou 0 — a carga leva o custo consigo,
congelado na média do instante em que saiu. Loja própria é transferência e não venda: não há
faturamento nem margem, e o valor apenas muda de sala (`src/data/repository.ts:1641-1643`).

**Duas linhas, um ato** (`src/data/repository.ts:1712-1743`), pela função interna `leg`:

| Perna | id | quantidade | `location_id` | `counterpart_location_id` |
|---|---|---|---|---|
| saída | `outId` | `-input.baseUnits` | `fromLocationId` | `toLocationId` |
| entrada | `inId` | `+input.baseUnits` | `toLocationId` | `fromLocationId` |

As duas com o mesmo `movement_group_id = groupId` (uuid novo), o mesmo `occurred_at`, o mesmo
`recorded_at = at`, a mesma `unit_cost_rate` e **as DUAS levam o `lot_id`** — só na de saída, o
lote sumiria do destino: a loja receberia caixas sem lote e o recall pararia na porta da fábrica
(`src/data/repository.ts:1734-1737`). Cada perna é enfileirada separadamente.

Duas e não uma, e o motivo é aritmético: o saldo agrupa por `location_id`; com uma linha só o
destino não existiria em consulta nenhuma, e fechar exigiria um UNION trocando `location_id` por
`counterpart_location_id` e invertendo o sinal, em cada lugar que soma. **A contraparte fica
como explicação, nunca como aritmética** (`src/data/repository.ts:1634-1639`).

Por que `return` tem tipo próprio: uma loja devolvendo mil gramas é notícia sobre o produto ou
sobre a loja; uma transferência é a fábrica movendo o que é dela. Gravar as duas como `transfer`
deixava as duas iguais no razão, e nenhum relatório conseguiria dizer *"a loja centro devolve 8%
do que recebe"* — que é exatamente a pergunta que o Espelho da Loja existe para responder. O
`movement_kind` tem `return` desde a primeira migração e ninguém escrevia nele
(`src/data/repository.ts:1665-1682`).

Em `recordReturn` **os lugares vêm invertidos de propósito na chamada**: `fromLocationId` é a
LOJA, porque é de lá que a mercadoria está saindo (`src/data/repository.ts:1764-1766`).

---

### 12.8 Perda — `recordLoss`

```ts
export async function recordLoss(
  companyId: string,
  input: {
    itemId: string;
    baseUnits: number;      // quanto se perdeu; SEMPRE positivo, o sinal é daqui
    reason: LossReason;
    lotId?: string | null;
    locationId?: string;
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<{ baseUnits: number; rate: Rate }>
```
(`src/data/repository.ts:2089-2103`)

`LossReason` vem de `src/domain/ledger.ts` e espelha o enum do servidor:
`'melted' | 'broken' | 'expired' | 'courtesy' | 'internal_use'`
(`supabase/migrations/0001_foundation.sql:177`).

Validações e leituras:
- `!(input.baseUnits > 0)` → `Error('uma perda de nada não é uma perda')` (`:2104`)
- `locationId = input.locationId ?? await ensureLocation(conn, companyId)` (`:2109`) — ao
  contrário da contagem, **aqui existe padrão**
- saldo da SALA: `SUM(quantity_base_units) WHERE company_id AND item_id AND location_id`; se
  `onHand < input.baseUnits` → `NotEnoughStockError([{ itemId, name, needed, held }])`, com o
  nome vindo de `labels(companyId)` (`:2111-2125`). **O piso é o mesmo da produção: não se
  perde o que não se tem**, e a checagem roda antes da escrita, por isso não existe linha errada
  para alguém estornar (`src/data/repository.ts:2086-2088`)
- `rate` = `itemCosts(companyId)[itemId] ?? 0` — a taxa é a que o item vale hoje, porque o
  relatório de perdas conta dinheiro, não só quantidade (`:2127-2129`)

Escrita, uma linha (`src/data/repository.ts:2132-2162`): `kind = 'loss'`,
`quantity_base_units = -Math.round(input.baseUnits)`, `location_id`,
`unit_cost_rate = rate || null`, `loss_reason = input.reason`,
`movement_group_id = id` (**o grupo é a própria linha**, pelo mesmo motivo da contagem: sem ele
"digitei 40 onde era 4" fica no razão para sempre, descontando trinta e seis quilos de dinheiro
que não sumiram — `src/data/repository.ts:2145-2149`), `lot_id = input.lotId ?? null`
("quatro caixas venceram" só muda a compra se alguém souber QUAL lote venceu —
`src/data/repository.ts:2150-2152`), `note`, `assistant_phrase`. Enfileira `movements`.

Retorno: `{ baseUnits: Math.round(input.baseUnits), rate }` — positivo, porque o sinal é da
função.

O motivo é obrigatório e não é burocracia: *"sumiram 200 picolés"* não muda decisão nenhuma,
*"derreteram 200 picolés na câmara"* muda a manutenção do freezer
(`src/data/repository.ts:2073-2081`). As palavras nos três idiomas existiam antes desta função,
sem tela que as usasse — esta é a primeira escritora
(`src/data/repository.ts:2082-2085`).

---

### 12.9 Conferência de chegada — `recordCheck`

```ts
export async function recordCheck(
  companyId: string,
  input: {
    groupId: string;   // a remessa conferida, pelo grupo das duas pernas
    counted?: { itemId: string; baseUnits: number }[];  // omitido = "chegou tudo"
    occurredAt?: string;
    note?: string;
    assistantPhrase?: string;
  },
): Promise<CheckResult>
```
(`src/data/repository.ts:2436-2454`)

```ts
export type CheckResult = {
  groupId: string;
  differences: { itemId: string; baseUnits: number }[];  // negativa quando faltou, zero quando bateu
};
```
(`src/data/repository.ts:2409-2415`)

Lê a remessa **pelas pernas de ENTRADA** (`quantity_base_units > 0`), que dizem o destino, a
origem, o que foi mandado e a que custo (`src/data/repository.ts:2459-2474`):
```sql
SELECT item_id, quantity_base_units AS quantity, location_id,
       counterpart_location_id AS counterpart, unit_cost_rate AS rate
  FROM movements
 WHERE company_id = ? AND movement_group_id = ? AND quantity_base_units > 0
```
`legs.length === 0` → `Error(\`remessa ${input.groupId} não existe\`)` (`:2476`).

Por perna, dentro de uma transação (`src/data/repository.ts:2480-2515`):
- Se `input.counted` foi passado e o item não está na lista → `continue`. **Item não mencionado
  é item que a pessoa não conferiu, e não item que chegou zerado. A ausência não vira acusação**
  (`src/data/repository.ts:2483-2486`).
- `difference = said ? Math.round(said.baseUnits) - leg.quantity : 0`
- `INSERT INTO movements` com `kind = 'discrepancy'`, `quantity_base_units = difference`,
  `location_id = leg.location_id` (o destino), `counterpart_location_id = leg.counterpart`,
  `unit_cost_rate = leg.rate`, `movement_group_id = input.groupId` (**o grupo da remessa
  conferida, não um novo**), `post = 'checked'` — literal na instrução.
- Enfileira cada `movements`.

Três decisões, todas escritas:
- **Escreve UMA LINHA NOVA por item, nunca um carimbo na remessa**: o gatilho
  `movements_are_immutable` do servidor recusa qualquer UPDATE em `movements`, sem exceção e sem
  olhar coluna (`src/data/repository.ts:2420-2423`).
- **A linha que BATEU tem quantidade zero**, e isso precisou da migração 0017 no servidor:
  "conferi e bateu" é justamente a conferência que mais vale — é a prova de que alguém abriu a
  caixa — e sem poder gravá-la o app não saberia distinguir "ainda não conferiu" de "conferiu e
  estava tudo certo" (`src/data/repository.ts:2425-2431`). O 0017 admite
  `discrepancy` com zero **só quando `post` não é nulo**
  (`supabase/migrations/0017_a_check_that_matched_is_a_fact.sql:20-26`).
- **A taxa gravada é a da perna de ENTRADA da remessa, não a média de hoje**: o que faltou foi a
  mercadoria que embarcou, ao custo com que embarcou. Ler o custo atual avaliaria a falta de
  setembro ao preço de outubro (`src/data/repository.ts:2432-2435`).

Provado: remessa de 6.000 g, loja conta 5.500 → diferença −500; a loja fica com 5.500 e a
empresa cai a 49.500. Nada foi apagado: a remessa continua dizendo que 6.000 saíram
(`src/data/repository.test.ts:1317-1346`).

A leitura irmã é `unchecked(companyId, fromIso, toIso)` (`src/data/repository.ts:2520-2546`),
que devolve os grupos de `transfer` da janela sem nenhuma linha com `post = 'checked'` e não
estornados.

---

### 12.10 Leitura de sensor — `recordReading`

```ts
export async function recordReading(
  companyId: string,
  input: {
    locationId: string; kind: string; value: number; unit: string;
    takenAt?: string; deviceId?: string | null; source?: string;
  },
): Promise<Reading>
```
(`src/data/repository.ts:2769-2782`)

- `!Number.isFinite(input.value)` → `Error('uma leitura que não é número não é leitura')` (`:2781`)
- `!input.unit.trim()` → `Error('uma grandeza sem unidade é um número solto')` (`:2782`) — 4 é
  geladeira boa em Celsius e freezer quebrado em Fahrenheit (`src/data/repository.test.ts:2664-2665`)

Escreve **zero linhas de razão**. Em transação: `ensureLocation`, depois
`INSERT INTO readings (id, company_id, location_id, device_id, kind, value, unit, taken_at,
recorded_at, source)` com `takenAt = input.takenAt ?? at`, `recorded_at = at`,
`source = input.source ?? 'typed'`, `unit` já com `.trim()`. Enfileira `readings`
(`src/data/repository.ts:2788-2810`).

`source` é texto aberto de propósito: quando o ESP32 existir, ele grava com `source: 'wifi'` e
nada mais muda aqui (`src/data/repository.ts:2762-2768`). Os valores vistos nos testes:
`'typed'` (padrão), `'wifi'`, `'zigbee'` (`src/data/repository.test.ts:2632-2646`).

A fração sobrevive: −18,4 não é arredondado para −18, porque meio grau de freezer é exatamente
o tipo de perda que o projeto proíbe em dinheiro (`src/data/repository.test.ts:2657-2662`).

---

### 12.11 Venda — NÃO IMPLEMENTADO

`movement_kind` tem `'sale'` (`supabase/migrations/0001_foundation.sql:173`) e `movements` do
servidor tem `unit_price_cents bigint` (`supabase/migrations/0001_foundation.sql:207`).
**Nenhuma função de `src/data/repository.ts` escreve `kind = 'sale'`**, e a coluna
`unit_price_cents` não existe no aparelho nem aparece na travessia do serializador
(`src/sync/serialize.ts:317-355`). Loja própria é transferência e não venda, por decisão escrita
(`src/data/repository.ts:1642-1643`).

---

### 12.12 Pedido — `saveOrder`, `setOrderStatus` (não é livro-razão)

```ts
export type OrderStatus = 'pending' | 'open' | 'delivered' | 'cancelled';
export type OrderLine = { itemId: string; name: string; baseUnits: number };
```
(`src/data/repository.ts:3871-3873`)

```ts
export async function saveOrder(
  companyId: string,
  input: {
    placeId: string; requestedFor?: string | null; note?: string | null;
    lines: readonly { itemId: string; baseUnits: number }[];
  },
): Promise<Order>
```
(`src/data/repository.ts:3986-4032`)

- Filtra `lines` por `baseUnits > 0`; lista vazia → `Error('um pedido sem item não é pedido')` (`:3996`)
- `id = newId()` — **não existe caminho de atualização**
- `status = (await ordersNeedApproval()) ? 'pending' : 'open'`, lido de `app_meta`
  (chave `'orders.needApproval'`, `src/data/repository.ts:3968-3984`). É "depende de quem usa"
  virando dado: uma fábrica quer que o dono veja cada pedido, outra tem três clientes e a
  aprovação só atrasa. **O padrão é sem aprovação** (`src/data/repository.ts:3970-3977`)
- Em transação: `INSERT INTO orders (id, company_id, place_id, status, requested_for, note,
  created_at)` e um `INSERT INTO order_lines (id, company_id, order_id, item_id, base_units)`
  por linha, com `base_units = Math.round(line.baseUnits)`. Enfileira `orders` e cada
  `order_lines` numa chamada só de `enqueue` (`:4020`)
- **Zero linhas em `movements`.** É a regra que o bloco de teste existe para segurar: se alguém
  "otimizar" isso gravando a demanda no razão, o saldo passa a mentir no instante em que um
  cliente liga (`src/data/repository.test.ts:2846-2851`, e a asserção
  `assert.equal(after?.n, before?.n)` em `:2877-2881`)

```ts
export async function setOrderStatus(companyId, orderId, status: OrderStatus): Promise<void>
```
(`src/data/repository.ts:4093-4106`): `UPDATE orders SET status = ?, decided_at = ? WHERE id = ?
AND company_id = ?` e enfileira `orders`. Não é o livro-razão: pedido muda de estado, e mudar de
estado aqui não move um grama. O que move estoque é a carga que sai, e ela é transferência
(`src/data/repository.ts:4086-4092`).

---

### 12.13 Cadastro — as escritas que não geram movimento

#### `writeItem` / `saveItem`

```ts
async function writeItem(conn: Db, companyId: string,
  item: Omit<Item,'id'|'fullLevel'> & { id?: string; fullLevel?: number | null }): Promise<string>
export async function saveItem(companyId: string, item: same): Promise<string>
```
(`src/data/repository.ts:227-274`, `:207-218`)

- `id = item.id ?? newId()`
- **`fullLevel` ausente preserva o que estava lá**: quando `item.id` existe e `fullLevel` é
  `undefined`, lê `SELECT full_level FROM items WHERE id = ?` e reaproveita. Um
  `excluded.full_level` nulo apagaria a régua de faixa de todos os itens da tela de produto em
  silêncio (`src/data/repository.ts:233-245`)
- `INSERT INTO items (id, company_id, kind, name, purchase_unit, purchase_to_base, base_unit,
  packaging, full_level, active, created_at) VALUES (..., 1, ?)` com
  `ON CONFLICT(id) DO UPDATE SET kind, name, purchase_unit, purchase_to_base, base_unit,
  packaging, full_level`. `packaging` é gravado como `JSON.stringify(item.packaging.tiers)`
- Enfileira `items`
- `ItemKind = 'input' | 'packaging' | 'product' | 'resale' | 'store_supply'` (`:32`)

#### `saveProduct`

```ts
export async function saveProduct(companyId: string, input: {
  id?: string; itemId?: string; name: string;
  kind: Extract<ItemKind,'product'|'resale'>;
  recipeId: string | null; yieldPerUnit: number | null; unitPackagingCents: Cents;
  packaging: PackagingHierarchy; shelfLifeDays?: number | null;
  packagingItems?: readonly { itemId: string; quantityPerUnit: number }[];
  fullLevel?: number | null;
  lineId?: string | null; typeId?: string | null; flavorId?: string | null;
}): Promise<{ productId: string; itemId: string }>
```
(`src/data/repository.ts:1894-1930`)

Três checagens **antes da transação**, porque recusar depois de gravar o item deixaria um item
órfão:
1. `assertTypeBelongsToLine(companyId, lineId, typeId)` (`:1931`, definida em
   `:3751-3764`) → `TypeIsFromAnotherLineError(typeId)` com mensagem
   `type ${typeId} belongs to another line` (`:3743-3749`). No servidor é chave estrangeira
   composta; o SQLite do aparelho não aceita chave composta em `ALTER TABLE ADD COLUMN`, então
   a garantia é imposta na escrita — e mora no repositório e não na tela porque **a tela é
   decoração, e o assistente grava pelo mesmo caminho sem passar por ela**
   (`src/data/repository.ts:3736-3742`)
2. `packagingItems` ausente é "não mexa no que já estava listado": lê
   `SELECT packaging_items FROM products WHERE id = ?` e reaproveita, senão
   `JSON.stringify(normalizePackagingItems(input.packagingItems))`. Lista vazia apaga. A tela
   que corrige o nome não manda embalagem, e um `excluded.packaging_items` com lista vazia
   desligaria em silêncio o consumo de palito de todas as corridas seguintes
   (`src/data/repository.ts:1938-1953`)
3. Colisão de classificação: procura outro produto ATIVO da mesma empresa com o mesmo trio
   `COALESCE(line_id,'') / COALESCE(type_id,'') / COALESCE(flavor_id,'')` e, se achar,
   `throw new GridTakenError(ocupada.name)` — mensagem `grid already taken by ${existing}`
   (`src/data/repository.ts:1887-1892`, checagem em `:1955-1975`). A regra é decisão registrada
   na migração `0018`; o defeito não era a regra, era ela falando SQLite: a recusa do índice
   chegava como *"Error finalizing statement"* (`src/data/repository.ts:1872-1886`)

Na transação (`src/data/repository.ts:1977-2024`): `writeItem` com
`purchaseUnit: null, purchaseToBase: null, baseUnit: 'un'` **chumbados**, `packaging` e
`fullLevel` do input; depois `INSERT INTO products (id, company_id, item_id, recipe_id,
yield_per_unit, unit_packaging_cents, packaging_items, shelf_life_days, active, line_id,
type_id, flavor_id) VALUES (..., 1, ?, ?, ?)` com `ON CONFLICT(id) DO UPDATE` de tudo menos
`item_id`. Enfileira **`products`** (o `items` já foi enfileirado por `writeItem`).

`normalizePackagingItems(lines)` (`src/data/repository.ts:91-103`): ignora `itemId` vazio, soma
o mesmo item repetido (dois palitos por picolé é toque duplo, não receita exótica) e lança
`Error('embalagem por unidade tem que ser mais que zero')` se `quantityPerUnit` não for finito
ou for `<= 0` (`:98`).

#### `saveRecipeVersion`

```ts
export async function saveRecipeVersion(companyId: string, input: {
  recipeId?: string; name: string; yieldAmount: number; yieldUnit: string;
  lossFraction: number; lines: RecipeLine[]; note?: string;
}): Promise<{ recipeId: string; version: number }>
```
(`src/data/repository.ts:1137-1156`)

Tudo em uma transação, porque **uma versão sem as linhas é uma receita que custa nada, que é
pior que nenhuma versão** (`src/data/repository.ts:1156-1158`):
1. Upsert em `recipes (id, company_id, name, yield_amount, yield_unit, active, created_at)`
   com `active = 1`, atualizando nome e rendimento no conflito
2. `version = (SELECT MAX(version) FROM recipe_versions WHERE recipe_id = ?) + 1` — **versões
   nunca são sobrescritas**, porque uma corrida registra qual versão usou e mudar a fórmula hoje
   não pode reescrever o que os lotes do ano passado custaram
   (`src/data/repository.ts:1130-1136`)
3. `INSERT INTO recipe_versions (id, company_id, recipe_id, version, effective_from,
   loss_fraction, note, created_at)` com `effective_from = at.slice(0, 10)`
4. Uma `INSERT INTO recipe_lines (id, company_id, recipe_version_id, item_id, sub_recipe_id,
   quantity, position)` por linha, com `item_id` ou `sub_recipe_id` conforme `line.kind` e
   `position` = índice
5. Enfileira, **nesta ordem**: `recipes`, `recipe_versions`, e cada `recipe_lines`
   (`src/data/repository.ts:1210-1218`)

#### `setItemActive`

```ts
export async function setItemActive(companyId, itemId, active: boolean): Promise<void>
```
(`src/data/repository.ts:3608-3622`): `UPDATE items SET active = ? WHERE id = ? AND company_id = ?`
com 1/0, em transação, enfileirando `items`. A linha fica, o passado fica intacto, e o item
para de aparecer nos seletores — reversível, porque nada foi destruído
(`src/data/repository.ts:3600-3607`).

#### `saveLine`, `saveType`, `saveFlavor`

(`src/data/repository.ts:3680-3696`, `:3698-3714`, `:3716-3731`) — os três são o mesmo molde:
`id = input.id ?? newId()`, transação, upsert em `product_lines` / `product_types` / `flavors`
com `(id, company_id, [line_id,] name, sort, active)` `VALUES (..., 1)` e
`ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`, `name` com `.trim()`,
`sort = input.sort ?? 0`, enfileirando a tabela correspondente. **Os três níveis são opcionais
de propósito**, e o sabor é da empresa e não do tipo: morango é o mesmo morango no picolé e no
pote (`src/data/repository.ts:3624-3636`).

#### As preferências em `app_meta`

`setBriefingOrder(order)` grava `order.join(',')` na chave `'briefing.order'`
(`src/data/repository.ts:3888`, `:3904-3906`) — texto separado por vírgula e não JSON, porque é
uma lista de palavras curtas que alguém pode precisar ler no banco durante um suporte, e
`producao,clima,insumos` se lê (`src/data/repository.ts:3891-3897`).
`setBriefingHidden(hidden)` grava na chave `'briefing.hidden'` (`:3889`, `:3920-3922`) — é
preferência **deste aparelho**, some da capa deste celular e continua na do escritório
(`:3906-3913`).
`setAlertSettings(settings)` grava `JSON.stringify` na chave `'alerts.settings'`
(`:3924`, `:3964-3966`); a leitura é tolerante de propósito — campo faltando cai no padrão,
campo estranho é ignorado, JSON quebrado devolve `DEFAULT_ALERTS` inteiro, `minuteOfDay` só
aceita 0–1439 e `weekdays` só 0–127 (`:3939-3962`).
`setOrdersNeedApproval(needed)` grava `'1'` ou `'0'` na chave `'orders.needApproval'`
(`:3968`, `:3982-3984`).

Nenhuma dessas quatro abre transação nem enfileira nada: `app_meta` não sobe para o servidor e
não é apagada por `eraseArea` (`src/data/erase.test.ts:85-89`).

---

### 12.14 Estorno — `planReversal`, `recomputeItemCost`, `reverseGroup`

#### A constante que define "não estornado"

```sql
NOT EXISTS (SELECT 1 FROM movements rev
             WHERE rev.reverses_movement_id = m.id
               AND rev.company_id = m.company_id)
```
(`src/data/repository.ts:750-752`, exportada como `const NAO_ESTORNADO`)

Usada por oito consultas, todas com a tabela apelidada de `m`. **O que foi estornado não
aconteceu — para quem pergunta o que aconteceu**: as duas linhas continuam no razão porque a
fundação exige, mas "quanto saiu do tacho hoje" é outra pergunta, e uma corrida corrigida
responde zero a ela. Sem este pedaço, o estorno acerta o SALDO (que é soma pura e não olha
`kind`) e deixa todas as telas de "o que aconteceu" dizendo o número velho: o almoxarifado certo
e a produção mentindo, no mesmo aplicativo (`src/data/repository.ts:735-749`).

#### `planReversal` — o que o estorno faria, sem fazer

```ts
export async function planReversal(companyId: string, groupId: string): Promise<ReversalPlan>
export type ReversalLeg = { itemId: string; name: string; baseUnits: number; baseUnit: string; locationId: string };
export type ReversalPlan = {
  groupId: string;
  legs: ReversalLeg[];
  blocked: { itemId: string; name: string; held: number; needed: number; baseUnit: string }[];
  alreadyReversed: boolean;
};
```
(`src/data/repository.ts:4245`, `:4192-4216`)

1. Lê as pernas do grupo com `kind <> 'reversal'`, ordenadas por
   `quantity_base_units DESC`, cada uma com um `EXISTS` que diz se já foi estornada
   (`:4247-4264`). `legs.length === 0` → `Error(\`grupo ${groupId} não existe\`)` (`:4266`)
2. `legs` do plano têm `baseUnits: -l.quantity_base_units` — **o CONTRÁRIO do que o movimento
   original fez**
3. `alreadyReversed = legs.some((l) => l.reversed === 1)`
4. Uma consulta só de saldos por `item_id, location_id` para todos os itens do grupo
   (`:4288-4297`), indexada como `` `${item_id}@${location_id}` ``
5. Para cada perna **negativa** do plano: se `tem + leg.baseUnits < 0`, entra em `blocked` com
   `held: tem` e `needed: -leg.baseUnits`. **O que o estorno TIRA precisa estar lá**: uma
   corrida cujos picolés já viajaram para a loja não volta atrás sozinha
   (`src/data/repository.ts:4280-4287`)

Existe separado da escrita **por uma razão de tom de voz, não de arquitetura**: a confirmação
deste aplicativo diz o que vai acontecer com os números por extenso, e para dizer isso a tela
precisa da conta antes do ato (`src/data/repository.ts:4237-4244`).

```ts
export class CannotReverseError extends Error {
  constructor(public readonly plan: ReversalPlan) {
    super(plan.alreadyReversed
      ? `grupo ${plan.groupId} já foi estornado`
      : `estorno de ${plan.groupId} deixaria saldo negativo`);
    this.name = 'CannotReverseError';
  }
}
```
(`src/data/repository.ts:4218-4234`) — carrega o plano inteiro porque a Lei 5 pede que o erro
IMPEÇA e mostre a saída no mesmo gesto.

#### `reverseGroup` — o contrário de um ato, lançado como fato novo

```ts
export async function reverseGroup(
  companyId: string,
  input: { groupId: string; occurredAt?: string; note?: string },
): Promise<{ groupId: string; legs: ReversalLeg[] }>
```
(`src/data/repository.ts:4442-4446`)

1. `plan = await planReversal(...)`; se `alreadyReversed` ou `blocked.length > 0` →
   `CannotReverseError(plan)` (`:4448`)
2. `newGroup = newId()`
3. **Dentro da transação, a checagem de novo** (`:4455-4457`): entre planejar e gravar cabe uma
   remessa de outro aparelho, e é exatamente o intervalo em que um saldo deixa de existir
4. Relê as linhas originais do grupo (`kind <> 'reversal'`) com `id, item_id,
   quantity_base_units, location_id, unit_cost_rate, lot_id, counterpart_location_id` (`:4459-4477`)
5. Uma linha nova por original (`:4479-4506`): `kind = 'reversal'`,
   `occurred_at = input.occurredAt ?? at`, `recorded_at = at`,
   `quantity_base_units = -o.quantity_base_units`, `location_id` igual ao original,
   **`unit_cost_rate = o.unit_cost_rate`** — a taxa é a do movimento original, congelada; ler a
   média de hoje avaliaria o erro de setembro ao preço de outubro (`:4492-4494`),
   `movement_group_id = newGroup` (um grupo NOVO comum a todas as pernas),
   `counterpart_location_id`, `lot_id`, **`reverses_movement_id = o.id`**, `note`. Enfileira cada
   uma
6. **Fora da transação, de propósito** (`:4519-4521`): para cada `itemId` distinto de
   `plan.legs`, chama `recomputeItemCost`. A recomposição lê o razão inteiro do item e precisa
   enxergar as pernas do estorno que acabaram de ser escritas. Se falhar aqui, o razão já está
   certo — que é o que a fundação protege — e a média é cache: a próxima entrada daquele item a
   recompõe

Estorna o **ATO, pelo grupo**, e não uma linha: desfazer só a linha da produção deixaria
picolés que não consumiram nada, que é pior que o erro original porque parece certo
(`src/data/repository.ts:4432-4436`).

**O lote continua existindo.** Ele é identidade, não quantidade: o saldo dele vai a zero pelo
movimento, e apagar a linha seria a exclusão que a fundação proíbe — além de quebrar o rastro
de uma etiqueta que talvez já esteja colada numa caixa
(`src/data/repository.ts:4437-4441`, provado em `src/data/repository.test.ts:3096`).

#### `recomputeItemCost` — a média refeita do zero

```ts
export async function recomputeItemCost(companyId: string, itemId: string): Promise<Rate>
```
(`src/data/repository.ts:4344`)

**Média móvel não se "desmistura": ela é dependente do caminho, a ordem das entradas decide o
resultado, e não existe operação inversa.** O que dá é replicar o caminho inteiro do zero — a
mesma coisa que a primeira fundação já diz do saldo. `item_costs` passa a ser cache de uma conta
que sempre pode ser refeita (`src/data/repository.ts:4321-4331`).

1. Lê `average_rate` anterior
2. Lê as linhas do item **excluindo `kind = 'reversal'` e excluindo tudo que satisfaz o
   contrário de `NAO_ESTORNADO`**, ordenadas por `occurred_at, recorded_at, id`
   (`:4383-4390`). O desempate pelo instante em que o aparelho soube existe porque duas entradas
   no mesmo momento têm de dobrar sempre igual, senão a média depende de qual linha o SQLite
   devolveu primeiro (`:4378-4381`)
3. A regra da dobra, **lida dos dois escritores existentes e não inventada**: entrada com taxa
   mistura; qualquer outra coisa só move a quantidade
   (`src/data/repository.ts:4334-4339`, código em `:4392-4407`):
   ```
   se quantity > 0 e unit_cost_rate != null:
     baseUnits += quantity
     averageRate = blendRate(estado, { baseUnits: quantity, rate: unit_cost_rate })
     ultima = unit_cost_rate
   senão:
     baseUnits += quantity          // a média não muda
   ```
4. Upsert em `item_costs` com `average_rate = estado.averageRate` e `last_rate = ultima`
5. Se `Math.abs(anterior - estado.averageRate) > 1e-12`, insere em `item_cost_history`
   (`previous_rate = anterior || null`, `new_rate`, `observed_at = at`) — **mudança calada de
   custo é a pior: ela reaparece semanas depois como margem errada, sem nada que a explique**
   (`src/data/repository.ts:4340-4342`)
6. **Não enfileira nada** (`item_costs` é derivado e tem um autor por lado)

A cicatriz que ela fecha (`src/data/repository.ts:4310-4319`): `reverseGroup` devolvia a
quantidade e deixava o dinheiro. Tratar a perna de estorno como saída comum é o que um sistema
contábil faz com uma devolução — 500 picolés a 64,99 mais 50 a 614 dá 114,08, e tirar os 50
depois devolve a quantidade e mantém os 114,08 (`src/data/repository.ts:4364-4372`).

**Estado:** `recomputeItemCost` é exportada e chamada por `reverseGroup` e pela suíte; **nenhuma
tela a chama** (grep em `app/`).

---

### 12.15 Contradições, lacunas e colunas sem escritor

Marcadas para quem vai reconstruir, e nenhuma delas é conjectura.

1. **`kind = 'purchase'` não existe no enum do servidor.** O aparelho escreve
   `'purchase'` (`src/data/repository.ts:415`), o backfill da V3 também
   (`src/data/db.ts:266-270`), o serializador leva `kind` como está
   (`src/sync/serialize.ts:321`) e `movement_kind` do Postgres não tem esse valor
   (`supabase/migrations/0001_foundation.sql:172-175`). Se alguma migração posterior o
   acrescentou, não está em `0001`; NÃO ESTÁ NO CÓDIGO que eu li nas migrações citadas.
2. **`closeProductionRun` não usa o `runId` como `movement_group_id`**, ao contrário do que dois
   docblocks afirmam (§12.6).
3. **`movements.operator_id` não tem escritor.** A coluna existe no aparelho
   (`src/data/db.ts:322`) e viaja no serializador (`src/sync/serialize.ts:351`), e nenhuma
   função de `repository.ts` a preenche. É a decisão do dono ("quem estava operando é anotação
   do registro") sem implementação.
4. **`movements.device_id` não existe no aparelho** e é listada na travessia
   (`src/sync/serialize.ts:341`); `nullable(row['device_id'])` devolve `null`
   (`src/sync/serialize.ts:92-94`, `:403`), então atravessa sempre nulo, como o comentário
   admite.
5. **`recordPurchase` não valida nada.** Ver §12.2.
6. **`moveBetween` não tem trava de saldo**, ao contrário de produção e perda. Ver §12.7.
7. **`recordProduction` não valida que `input.locationId` existe**: chama
   `ensureLocation(conn, companyId)`, que cria o lugar PADRÃO, e escreve em `input.locationId`.
   Com `PRAGMA foreign_keys = ON` (`src/data/db.ts:26`) a FK `location_id REFERENCES
   locations(id)` recusa, mas a mensagem é a do SQLite.
8. **`post` só é escrito por `recordCheck`** (valor `'checked'`). Os outros três postos de
   controle — `'picked'`, `'loaded'`, `'delivered'` — não têm escritor.
9. **`unit_price_cents` e `kind = 'sale'`**: sem escritor (§12.11).
10. **`simulateHistory` não tem chamador** fora de `simulate.ts` (grep em `app/` e `src/`); é a
    mesma função de `simulateFortnight` com outro horizonte (`src/data/simulate.ts:65-70`).

---

### 12.16 `src/data/simulate.ts` — catorze dias de fábrica pela porta da frente

200 linhas. O que ela é: *"Two weeks of a factory that exists, written through the real front
door"* (`src/data/simulate.ts:16`).

**Por que existe** (`src/data/simulate.ts:15-34`): o exemplo que o app traz tem um dia de idade
e nunca se moveu — o bastante para provar que uma tela renderiza, não para provar que ela diz
algo. Metade da capa só tem o que dizer quando existe passado: *"saíram 1.200 hoje, 200 a mais
que na segunda passada"* não se testa contra um banco cuja história inteira é esta manhã. E essa
lacuna não era hipotética: o ramo da comparação não tinha teste exercitando-o, por exatamente
essa razão.

**Ela nunca toca uma tabela direto.** Chama `recordProduction`, `recordTransfer` e
`recordPurchase` — do jeito que o app chama. Uma simulação que escrevesse SQL próprio estaria
provando que a simulação funciona (`src/data/simulate.ts:25-29`).

#### Assinatura e padrões

```ts
export async function simulateFortnight(
  companyId = LOCAL_COMPANY_ID,
  options: { days?: number; seed?: number; timeZone?: string; at?: string } = {},
): Promise<Simulation>

export type Simulation = { days: number; runs: number; deliveries: number; invoices: number };
```
(`src/data/simulate.ts:72-75`, `:46-51`)

| Opção | Padrão | Linha |
|---|---|---|
| `days` | `14` | `:76` |
| `seed` | `20260901` | `:77` |
| `timeZone` | `'America/Sao_Paulo'` | `:78` |
| `at` | `nowIso()` | `:86` |

`at` é parametrizado para que um teste possa fixá-lo: sem isso a simulação depende da hora em
que a suíte roda, e a mesma semente daria fábricas diferentes entre 23h59 e 00h01 — o oposto do
determinismo prometido (`src/data/simulate.ts:80-85`).

**Determinismo:** um LCG de três linhas (`src/data/simulate.ts:38-44`):
```ts
state = (state * 1_664_525 + 1_013_904_223) >>> 0;  return state / 0x1_0000_0000;
```
A mesma semente produz a mesma quinzena em qualquer máquina e em qualquer dia
(`src/data/simulate.ts:31-34`), provado por `assert.deepEqual(await rodar(), await rodar())`
(`src/data/simulate.test.ts:85-96`).

#### Preparação

- `products = (await listProducts(companyId)).filter((p) => p.recipeId)`; vazio →
  `Error('não há produto com receita para simular')` (`:88-89`)
- `factory = places.find((p) => p.isDefault) ?? places[0]` (`:94`)
- `store` = o primeiro lugar não-padrão; se não houver, cria com
  `savePlace(companyId, { name: 'Loja Centro', kind: 'own_store' })` (`:95-96`). **`'Loja Centro'`
  é uma string em português dentro do módulo de simulação** — é o único nome de lugar chumbado
  que este arquivo cria

#### O laço, dia a dia, do mais velho para o mais novo

`for (let back = days - 1; back >= 0; back -= 1)` (`:105`) — do mais antigo primeiro, para que
todo custo congelado seja o custo verdadeiro daquele dia; escrever de trás para frente
congelaria o preço de hoje na semana passada (`:103-104`).
`day = dayWindow(today, timeZone, -back)` (`src/domain/day.ts:49-68`) e
`at(hour) = new Date(new Date(day.from).getTime() + hour * 3_600_000).toISOString()` (`:107-108`).

**Domingo é parado**: `if (new Date(day.from).getUTCDay() === 0) continue` — uma semana em que
todo dia é igual ensina a capa a comparar ruído com ruído (`:110-113`).

1. **Compra, e vem primeiro porque o insumo está acabando, não por sorteio** (`:115-155`).
   `inputs` = itens com `kind === 'input'` e `purchaseToBase > 0`. Pula quem tem
   `onHandBaseUnits >= pack * 3`. `packs = 4 + Math.floor(next() * 3)` (4 a 6);
   `baseUnits = packs * pack`.
   **O preço oscila em volta de um PATAMAR, não em volta de si mesmo** (`:130-138`): a primeira
   versão multiplicava a média atual por um fator entre 0,92 e 1,12 — que compõe, e um ano de
   compras levou a polpa de 1,24 a 6,75 centavos por grama e o picolé de R$ 0,64 a R$ 2,64.
   *"Isso não é uma fábrica, é juros compostos."* A conta atual:
   ```
   base       = patamar[item.id] ?? (item.averageRate || 1)
   tendencia  = 1 + (0.12 * (days - 1 - back)) / max(days, 1)
   drift      = 0.93 + next() * 0.14
   totalCents = Math.round(baseUnits * base * tendencia * drift)
   ```
   (`:139-144`). `totalCents <= 0` → `continue`. Chama `recordPurchase` com `occurredAt: at(7)` e
   soma `tally.invoices`.
2. **Um ou dois tachos** (`:157-178`): `kettles = next() < 0.3 ? 2 : 1`; produto sorteado;
   `planned = 500`; `made = Math.round(planned * (0.9 + next() * 0.14))` — o que saiu nunca é
   exatamente o que a ficha prometeu, e essa razão é a razão inteira de registrar produção.
   `recordProduction` com `occurredAt: at(9 + k * 3)`, dentro de `try { } catch { }`: faltou
   insumo naquele dia — acontece numa fábrica, e a corrida simplesmente não aconteceu, não é erro
   da simulação (`:174-177`).
3. **À tarde, parte sai** (`:180-196`): com probabilidade 0,7, produto sorteado,
   `sent = Math.min(available, 100 + Math.floor(next() * 300))`; se `sent > 0`,
   `recordTransfer(factory → store, occurredAt: at(16))` e soma `tally.deliveries`.

**Defeito na linha 171:** `producedOn: localDate(at(9 + k * 3), 'America/Sao_Paulo')` usa o fuso
**chumbado** em vez de `timeZone`, que é a opção que a própria função aceita e usa em
`dayWindow` na linha 106. Uma simulação pedida com outro fuso data os lotes em São Paulo.

#### O que a suíte prova sobre ela

- `runs >= 8`, `deliveries >= 5`, `invoices >= 1` para catorze dias
  (`src/data/simulate.test.ts:69-71`)
- hoje **e** a semana passada têm produção — o par exato de que a capa precisa para dizer algo
  em vez de "primeira produção" (`src/data/simulate.test.ts:73-82`)
- **nenhum saldo negativo**, porque ela escreve pela porta da frente e `recordProduction` recusa
  consumir o que não tem: *"Se ela escrevesse SQL próprio, isto passaria e a fábrica simulada
  seria impossível"* (`src/data/simulate.test.ts:98-112`)
- o instante fixo do teste é `'2026-09-01T15:00:00.000Z'` (`src/data/simulate.test.ts:29`)

Chamador de produção: `app/settings.tsx` chama `simulateFortnight`. `simulateHistory` não tem
chamador.

---

### 12.17 `src/data/erase.ts` — apagar como regra, não como SQL

277 linhas, **tudo puro**: nenhuma função abre banco, então as regras são cobertas por testes
que nunca abrem um (`src/data/erase.ts:16-17`). Duas coisas justificam o arquivo separado
(`src/data/erase.ts:4-14`): a **ordem** (o esquema usa `ON DELETE RESTRICT` onde perder uma linha
corromperia um custo em silêncio, então DELETE só funciona numa ordem) e o fato de que
*"você não pode"* é uma resposta que a pessoa merece receber **antes** de apertar qualquer coisa,
com o motivo anexado — Lei 5.

#### Tipos

```ts
export type EraseArea = 'purchases' | 'recipes' | 'products' | 'inputs' | 'all';
```
(`src/data/erase.ts:20`)

```ts
export type ErasableTable =
  | 'movements' | 'readings' | 'production_runs' | 'order_lines' | 'orders' | 'lots'
  | 'purchase_lines' | 'purchases' | 'products' | 'product_types' | 'product_lines'
  | 'flavors' | 'recipe_lines' | 'recipe_versions' | 'recipes'
  | 'item_cost_history' | 'item_costs' | 'items' | 'locations' | 'outbox';
```
(`src/data/erase.ts:32-52`) — union fechado, porque nome de tabela não pode ser parâmetro ligado
em SQL, e tipar o nome é o que faz `DELETE FROM ${table}` provavelmente seguro: nada fora deste
union alcança a instrução, e é o compilador que impõe, não um revisor lembrando de olhar
(`src/data/erase.ts:22-30`).

```ts
export type EraseCounts = {
  inputs: number; movements: number; places: number; recipes: number;
  products: number; purchases: number;
  recipeLinesUsingInputs: number; purchaseLinesUsingItems: number;
  productsUsingRecipes: number; purchaseLinesUsingProducts: number;
};
export const emptyCounts: EraseCounts = { ...todos zero };
```
(`src/data/erase.ts:55-101`)

O campo `movements` carrega a cicatriz inteira escrita (`src/data/erase.ts:57-74`):
`tablesFor('purchases')` começa com `movements` e o DELETE é por empresa, então **apagar
"compras" apagava TODO movimento da fábrica** — produção, contagem, perda, transferência. A
confirmação dizia *"isso apaga as compras, e zera o custo médio"*; não dizia que um movimento
ia. O dono que apaga as compras de exemplo para começar a escrituração de verdade perdia tudo o
que já tinha registrado. *"É irreversível pelo texto da própria confirmação, e não há cópia no
servidor: o comando de apagar não tem lado servidor."* A regra da casa é a mesma — a confirmação
diz o que vai acontecer, com os números por extenso. Faltava o número.

#### `tablesFor(area)` — filhos primeiro

(`src/data/erase.ts:118-171`)

| área | tabelas, na ordem |
|---|---|
| `purchases` | `movements`, `purchase_lines`, `purchases`, `item_cost_history`, `item_costs` |
| `recipes` | `recipe_lines`, `recipe_versions`, `recipes` |
| `products` | `production_runs`, `order_lines`, `lots`, `products` |
| `inputs` | `movements`, `item_cost_history`, `item_costs`, `items` |
| `all` | `movements`, `readings`, `production_runs`, `order_lines`, `orders`, `lots`, `purchase_lines`, `purchases`, `products`, `product_types`, `product_lines`, `flavors`, `recipe_lines`, `recipe_versions`, `recipes`, `item_cost_history`, `item_costs`, `items`, `locations`, `outbox` |

Razões escritas:
- `purchases` leva `item_costs` **de propósito**: uma média cujas notas não existem mais é um
  número que ninguém pode auditar, e a promessa inteira do app é que toda cifra abre a própria
  aritmética. Melhor um zero honesto que um órfão (`src/data/erase.ts:106-110`)
- e leva `movements` porque **uma contagem guarda a diferença, não a quantidade**: apague as
  chegadas contra as quais ela foi medida e o que sobra é aritmética sobre nada. Um ajuste não
  pode sobreviver ao saldo que ele ajustou (`src/data/erase.ts:111-116`)
- em `products`, as três que travam: `lots.item_id` e `order_lines.item_id` apontam para `items`
  com RESTRICT, e a área apaga os itens de tipo produto logo depois de `products`;
  `production_runs` sai por CASCADE e está escrita para a ordem ser legível
  (`src/data/erase.ts:125-128`)
- em `all`, **oito destas entraram em 4 de setembro** e a ausência delas não era cosmética:
  cinco apontam para `items` ou `locations` com RESTRICT, e toda corrida de produção grava um
  `lots` — então **a partir da primeira corrida** o SQLite levantava
  `FOREIGN KEY constraint failed`, a transação voltava atrás, nada era apagado, e a tela mostrava
  o texto cru do SQLite em inglês, num app que promete três idiomas
  (`src/data/erase.ts:133-142`)
- a grade vem DEPOIS do produto: `products.line_id`, `type_id` e `flavor_id` apontam para lá com
  RESTRICT (`src/data/erase.ts:153-154`)
- `locations` vem depois de `movements`; **o lugar padrão é recriado sozinho por
  `ensureLocation`** no primeiro movimento seguinte, então apagar todos é seguro: o que some é o
  que a pessoa cadastrou (`src/data/erase.ts:164-166`)

#### `itemKindsFor(area)`

(`src/data/erase.ts:174-178`): `'inputs'` → `['input','packaging','store_supply']`;
`'products'` → `['product','resale']`; qualquer outra → `null` (a área não toca `items`). As
duas áreas nunca reivindicam os mesmos tipos (`src/data/erase.test.ts:191-200`).

#### `blockerFor(area, counts)`

```ts
export type EraseBlocker =
  | { reason: 'recipesUseInputs'; count: number }
  | { reason: 'purchasesUseInputs'; count: number }
  | { reason: 'productsUseRecipes'; count: number }
  | { reason: 'purchasesUseProducts'; count: number };
```
(`src/data/erase.ts:188-192`)

Lógica (`src/data/erase.ts:194-215`):
- `area === 'all'` → **sempre `null`**. Apagar tudo nunca é bloqueado — é o ponto dele
  (`src/data/erase.test.ts:231`)
- `inputs`: `recipeLinesUsingInputs > 0` → `{ reason: 'recipesUseInputs', count: counts.recipes }`;
  senão `purchaseLinesUsingItems > 0` → `{ reason: 'purchasesUseInputs', count: counts.purchases }`
- `recipes`: `productsUsingRecipes > 0` → `{ reason: 'productsUseRecipes', count: counts.productsUsingRecipes }`
- `products`: `purchaseLinesUsingProducts > 0` → `{ reason: 'purchasesUseProducts', count: counts.purchaseLinesUsingProducts }`

O tipo devolve **fato, não frase**. Isto devolvia prosa em português, o que punha a voz da
interface dentro da camada de dados e tornava a regra intraduzível: a razão e o número são o que
este módulo sabe; a redação é de quem fala com a pessoa (`src/data/erase.ts:180-186`).

```ts
export class EraseBlockedError extends Error {
  constructor(public readonly blocker: EraseBlocker) {
    super(`Erase blocked: ${blocker.reason}`); this.name = 'EraseBlockedError';
  }
}
```
(`src/data/erase.ts:217-226`)

#### `tallyFor(area, counts)` e `isEmpty(tally)`

```ts
export type EraseTally = { inputs; movements; recipes; products; purchases; places: number };
```
(`src/data/erase.ts:235-244`)

(`src/data/erase.ts:246-268`) — `purchases` → `{ purchases, movements }`;
`recipes` → `{ recipes }`; `products` → `{ products }`; `inputs` → `{ inputs, movements }`;
`all` → todos os seis. **Só "apagar tudo" leva os lugares; nenhuma área menor é dona deles**
(`src/data/erase.ts:242`). `isEmpty` soma os seis e compara com zero
(`src/data/erase.ts:271-276`).

#### `countForErase(companyId)` — uma consulta, dez números

(`src/data/repository.ts:3421-3454`) — uma ida ao banco em vez de dez, para a tela de ajustes
ficar instantânea num celular frio (`src/data/repository.ts:3413-3419`). Usa `?1` repetido:

| campo | subconsulta |
|---|---|
| `inputs` | `items WHERE kind IN ('input','packaging','store_supply')` |
| `movements` | `movements` (todos da empresa) |
| `recipes` | `recipes` |
| `products` | `products` |
| `places` | `locations WHERE id <> ?1` — **o padrão, que nasce sem nome, não conta** |
| `purchases` | `purchases` |
| `recipeLinesUsingInputs` | `recipe_lines WHERE item_id IS NOT NULL` |
| `purchaseLinesUsingItems` | `purchase_lines JOIN items WHERE i.kind IN ('input','packaging','store_supply')` |
| `productsUsingRecipes` | `products WHERE recipe_id IS NOT NULL` |
| `purchaseLinesUsingProducts` | `purchase_lines JOIN items WHERE i.kind IN ('product','resale')` |

Devolve `{ ...emptyCounts, ...(row ?? {}) }`.

#### `eraseArea(companyId, area)` — a única escrita destrutiva

(`src/data/repository.ts:3456-3509`)

1. `blocker = blockerFor(area, await countForErase(companyId))`; se houver →
   `throw new EraseBlockedError(blocker)` — **antes de qualquer coisa**
2. Uma transação só, para que uma interrupção não deixe uma receita cujos ingredientes se
   foram: *"Half-erased data is worse than either state"* (`src/data/repository.ts:3450-3455`)
3. Para cada `table` de `tablesFor(area)`:
   - `table === 'items'` **e** `kinds` não-nulo → `DELETE FROM items WHERE company_id = ? AND
     kind IN (?,?,...)`, com os tipos **ligados** e só as interrogações interpoladas
     (`:3470-3477`, marcado `// proofgate-allow`)
   - `table === 'products'` **e** `area === 'products'` → `DELETE FROM products WHERE
     company_id = ?` seguido de `DELETE FROM items WHERE company_id = ? AND kind IN
     ('product','resale')` (`:3478-3483`)
   - `table === 'outbox'` → `DELETE FROM outbox` **sem `company_id`** (`:3484-3485`)
   - qualquer outra → `DELETE FROM ${table} WHERE company_id = ?` — a interpolação é segura
     porque o nome vem de `ErasableTable`, union fechado (`:3486-3490`, `// proofgate-allow`)
4. `await forgetOrphans(conn)` (`src/data/outbox.ts:193-216`), **antes** do comando de apagar:
   varre `QUEUED_TABLES` e apaga as entradas de `outbox` ainda não enviadas cujo `row_id` não
   existe mais na tabela. Sem isto, apagar as compras de exemplo — que é o caso normal — deixava
   a fila apontando para movimentos inexistentes; órfã não é recusa: o serializador levanta
   exceção (*"Queued movements X but the row is gone from the device"*,
   `src/sync/serialize.ts:399`), o motor para no primeiro buraco de propósito, e tudo o que a
   fábrica gravar depois fica preso atrás dela para sempre (`src/data/repository.ts:3492-3499`)
5. `await enqueue(conn, [{ table: 'erase', rowId: area, op: 'delete', payload: { area } }])`,
   **depois** dos deletes, e essa ordem é o ponto todo: apagar tudo limpa `outbox` também, então
   um comando enfileirado antes do laço se apagava na passagem — o aparelho saía vazio, o
   servidor nunca ouvia, e a próxima descida restaurava exatamente o que a pessoa tinha pedido
   para destruir. **A área é a unidade, não a linha**: um apagamento é uma decisão, e reproduzi-lo
   linha por linha descreveria algo que a pessoa nunca fez (`src/data/repository.ts:3501-3507`)

O serializador trata esse comando à parte: `if (entry.table === 'erase') return { kind: 'erase',
area: ... }` (`src/sync/serialize.ts:389-392`).

#### O que fica preservado

- **`app_meta`**, e a renúncia é registrada com o motivo: *"a gaveta local do aparelho: a cara
  escolhida, a luz da tela, a cidade do tempo, o que a capa esconde. Não é dado do negócio, e
  apagá-la faria o aplicativo reabrir estranho para quem só queria limpar o exemplo."*
  (`src/data/erase.test.ts:85-89`). Por isso a marca `seeded` sobrevive a `eraseArea('all')` e o
  exemplo não volta amanhã de manhã (`src/data/repository.test.ts:390-421`)
- **O lugar padrão volta sozinho** no primeiro movimento seguinte, por `ensureLocation`
- `eraseArea('purchases')` deixa os itens de pé: seis insumos mais o picolé, que é item além de
  produto, dão sete (`src/data/repository.test.ts:514-539`)

#### A guarda que descobriu nove tabelas esquecidas

`src/data/erase.test.ts` **lê `db.ts` como texto** (`src/data/erase.test.ts:43-77`) e extrai
toda `CREATE TABLE IF NOT EXISTS (\w+)` e toda aresta `REFERENCES x(y) ON DELETE RESTRICT`
(inclusive as acrescentadas por `ALTER TABLE ... ADD COLUMN`, que são justamente as da grade do
produto). A cicatriz é da própria guarda (`src/data/erase.test.ts:22-41`): antes era um `Record`
escrito à mão com doze entradas, e o teste percorria as chaves desse mapa perguntando se cada
uma estava em `tablesFor('all')` — *"a lista conferida contra si mesma"*. Uma tabela fora do
union era **invisível para o teste, por construção**. Nove tabelas do aparelho nunca eram
apagadas, e cinco delas apontam para `items` ou `locations` com RESTRICT.

---

### 12.18 O que a suíte de escrita prova (`src/data/repository.test.ts`, 3.388 linhas, 74 testes de nível superior)

Não é teste de aritmética: é a camada de dados **contra um banco de verdade**. `node:sqlite`
(`DatabaseSync(':memory:')`) é embrulhado na mesma interface `Db` que o telefone usa
(`src/data/repository.test.ts:85-114`), e o `beforeEach` roda `migrate(conn)` — **o mesmo
executor que o telefone roda na abertura**, para que os testes exercitem o caminho de migração em
vez de um esquema escrito uma segunda vez (`src/data/repository.test.ts:119-126`). Chaves
estrangeiras estão ligadas por padrão ali, o que importa: a ordem do apagamento só tem sentido se
as referências forem realmente impostas (`src/data/repository.test.ts:86-88`).

Por que existe: *"arithmetic that is correct and then stored wrong is indistinguishable from
arithmetic that is wrong, and the SQL had no test at all: `expo-sqlite` only exists on a
device"* (`src/data/repository.test.ts:70-81`).

Amostra das afirmações que só este arquivo sustenta:
- a coluna `on_hand_base_units` **não existe mais** em `item_costs`, conferido por
  `PRAGMA table_info` — *"a mutable stock column is exactly what foundation 1 forbids"*
  (`src/data/repository.test.ts:596-604`)
- um telefone que já tem notas mantém o saldo pela migração, a linha `l1` mantém a identidade
  (para que uma reprodução não a dobre), e rodar `migrate` de novo é no-op — porque um telefone
  que morre no meio da atualização volta e tenta (`src/data/repository.test.ts:658-716`)
- `eraseArea('all')` deixa **só** a entrada `erase` na fila, com `op = 'delete'` e
  `rowId = 'all'` (`src/data/repository.test.ts:718-747`)
- a corrida estornada para de contar em `productionOn`: *"senão o almoxarifado fica certo e a
  capa mente"* — e a mutação que tira o `NAO_ESTORNADO` da cláusula atravessou a suíte inteira
  até a oficina do `mutate` voltar a rodar (`src/data/repository.test.ts:3098-3113`)
- estornar devolve o dinheiro e não só a quantidade, com a média voltando ao valor de antes da
  corrida errada dentro de `1e-9` (`src/data/repository.test.ts:3248-3315`)
- o lote sobe na fila **antes** do movimento que o cita, conferido por posição em `outbox`
  (`src/data/repository.test.ts:1508-1521`)
- a corrida aberta grava a VERSÃO na coluna da versão, lido **de volta do banco** e não do objeto
  de retorno — *"Esta é a diferença que deixou a mutação passar"*
  (`src/data/repository.test.ts:1112-1126`)
- toda `quantity_base_units` gravada é inteira, porque meio tacho de base de creme pede
  7.530,612244897959 g de açúcar (`src/data/repository.test.ts:1976-2009`)
- a corrida curta congela o custo mais alto, e a razão bate exatamente 500/400 **na parte da
  massa**, porque o palito não escala (`src/data/repository.test.ts:2063-2089`)
- o palito DESCE do estoque, cem unidades gastam cem palitos, e a taxa congelada é
  `receita/100 + taxaPalito + taxaSaquinho` dentro de `1e-9`
  (`src/data/repository.test.ts:2487-2565`)
