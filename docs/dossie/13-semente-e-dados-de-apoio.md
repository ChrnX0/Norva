## 13. Semente, dados do assistente e primeiro dia

### 13.1 A cadeia de arranque, na ordem exata em que roda

O primeiro dia do aplicativo tem um único ponto de entrada, e ele é o layout raiz
do Expo Router — não a tela inicial.

`app/_layout.tsx`, componente `RootLayout` (`app/_layout.tsx:37`), mantém dois
estados de React:

```ts
const [state, setState] = useState<{ ready: boolean; error: Error | null }>({
  ready: false,
  error: null,
});
const [attempt, setAttempt] = useState(0);
```
(`app/_layout.tsx:50-54`)

Dentro de um `useEffect` com dependência `[attempt]`, chama
`ensureStarterData()` **sem argumento** — portanto com `companyId =
LOCAL_COMPANY_ID` (`app/_layout.tsx:56-71`). Não há `try/catch` que engula: o
ramo de rejeição grava o erro em `state.error`, e a tela desenhada nesse caso é
`<Crash error={state.error} retry={retry} />` (`app/_layout.tsx:83-95`).
Enquanto `!state.ready`, desenha `<View style={{ flex: 1 }} />`
(`app/_layout.tsx:97`). O `retry` zera o estado e incrementa `attempt`, o que
faz o efeito rodar de novo e **reabrir o banco**, não apenas redesenhar
(`app/_layout.tsx:75-78`).

O comentário no próprio arquivo registra por que a semeadura foi movida para cá:
antes acontecia na tela inicial, e “todo outro ponto de entrada — um link
profundo, um endereço compartilhado — abria num aplicativo vazio e dizia que não
havia nada cadastrado” (`app/_layout.tsx:38-49`). O `catch` que existia antes
“engolia a falha e deixava o aplicativo desenhar de qualquer jeito: sem banco,
toda tela responde ‘nada cadastrado ainda’ e o briefing escreve ‘tudo estável’”.

O que `ensureStarterData` provoca antes de escrever qualquer linha:

| passo | onde | o que faz |
|---|---|---|
| 1 | `src/data/seed.ts:39` chama `hasSeeded()` | `hasSeeded` chama `db()` |
| 2 | `src/data/db.ts:738` `db()` | se `handle` existe devolve; senão `opening ??= openAndMigrate()` |
| 3 | `src/data/db.ts:751-753` `openAndMigrate()` | `openNative()` → `SQLite.openDatabaseAsync('norva.db')` (`src/data/db.ts:720-723`) |
| 4 | `src/data/db.ts:753` | executa `PRAGMAS`: `PRAGMA journal_mode = WAL;` e `PRAGMA foreign_keys = ON;` (`src/data/db.ts:24-27`) |
| 5 | `src/data/db.ts:754` | `migrate(...)` |
| 6 | `src/data/db.ts:785-810` | lê `PRAGMA user_version`, aplica cada passo faltante numa transação própria, e grava `PRAGMA user_version = <n+1>` **dentro da mesma transação** |

`MIGRATIONS` é a lista `[V1 … V17]` (`src/data/db.ts:676-678`) e
`schemaVersion = MIGRATIONS.length` (`src/data/db.ts:822`) — **17** na versão
documentada (verificado: probe imprimiu `schemaVersion 17`).

O nome do arquivo no aparelho é `norva.db` (`src/data/db.ts:722`).

`opening` existe por uma cicatriz nomeada no código: `handle` só era atribuído
depois de `migrate` resolver, e a tela inicial faz cinco perguntas num
`Promise.all` — cada uma que chegava antes da primeira terminar abria **outra**
conexão e começava **outra** migração, e `V2`, `V4`, `V5` e `V6` são
`ALTER TABLE … ADD COLUMN`, que levanta `duplicate column name` na segunda vez
(`src/data/db.ts:726-736`).

### 13.2 `LOCAL_COMPANY_ID` — a empresa deste aparelho

```ts
export const LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001';
```
(`src/data/seed.ts:12`)

O docblock diz o motivo: “uma empresa local até o login chegar; toda linha já
está carimbada com ela, então multi-empresa deixa de ser uma migração depois e
passa a ser um login” (`src/data/seed.ts:6-11`).

Ele é importado direto por **22 telas e três módulos**, sempre como constante e
nunca por parâmetro de rota (lista completa, obtida por `grep`):

`app/(tabs)/index.tsx:20` · `app/(tabs)/production.tsx:21` ·
`app/(tabs)/reports.tsx:22` · `app/(tabs)/transport.tsx:14` ·
`app/assistant.tsx:15` · `app/catalog.tsx:21` · `app/inputs/[id].tsx:41` ·
`app/inputs/index.tsx:20` · `app/inputs/new.tsx:16` · `app/losses.tsx:11` ·
`app/lots/[id].tsx:17` · `app/orders/index.tsx:12` · `app/orders/new.tsx:21` ·
`app/places.tsx:35` · `app/production/new.tsx:34` · `app/products/index.tsx:17` ·
`app/products/new.tsx:39` · `app/purchase.tsx:23` · `app/recipes/[id].tsx:13` ·
`app/recipes/index.tsx:17` · `app/settings.tsx:59` · `app/transfer.tsx:33` ·
`src/notify/facts.ts:10` · `src/data/simulate.ts:11` ·
`scripts/device-session.ts:42`.

Consequência ligada a ele, no mesmo arquivo de dados: o **local padrão** tem o
id da própria empresa.

```ts
export function defaultLocationId(companyId: string): string {
  return companyId;
}
```
(`src/data/repository.ts:843-845`)

E o local só nasce quando algo se move, dentro da transação de quem move:

```ts
async function ensureLocation(conn: Db, companyId: string): Promise<string> {
  // SELECT id FROM locations WHERE id = ?  → se existe, devolve
  // INSERT INTO locations (id, company_id, name, kind, created_at)
  //   VALUES (?, ?, '', 'store_room', ?)
  // enqueue([{ table: 'locations', rowId: companyId }])
}
```
(`src/data/repository.ts:847-865`, SQL transcrito de `:854-857`)

O `name` é string vazia **de propósito**: “o nome dele é uma palavra em três
idiomas, e essa palavra é da tela” (`src/data/repository.ts:587-593`). O `kind`
é `'store_room'`, que é também o `DEFAULT` da coluna no esquema
(`src/data/db.ts:221`).

### 13.3 As quatro funções públicas de `src/data/seed.ts`

| função | assinatura | quem chama | estado |
|---|---|---|---|
| `ensureStarterData` | `(companyId = LOCAL_COMPANY_ID): Promise<void>` | `app/_layout.tsx:58` (tela) · `scripts/device-session.ts:102` · 60+ testes | **implementado e chamado por tela** |
| `restoreStarterData` | `(companyId = LOCAL_COMPANY_ID): Promise<void>` | `app/settings.tsx:333` (tela) | **implementado e chamado por tela** |
| `exampleStillHere` | `(companyId = LOCAL_COMPANY_ID): Promise<boolean>` | `app/settings.tsx:267` (tela) | **implementado e chamado por tela** |
| `hasSeeded` | `(): Promise<boolean>` | `src/data/seed.ts:39` (interno) · `src/data/repository.test.ts:392,419` | implementado; **nenhuma tela chama** |

Privadas: `writeStarterData(companyId)` (`src/data/seed.ts:96`),
`markSeededItems(ids)` (`:203`), `markSeeded()` (`:212`).

Corpos, transcritos:

```ts
export async function ensureStarterData(companyId = LOCAL_COMPANY_ID): Promise<void> {
  if (await hasSeeded()) return;
  await writeStarterData(companyId);
}

/** Puts the example back on purpose, after somebody cleared it. */
export async function restoreStarterData(companyId = LOCAL_COMPANY_ID): Promise<void> {
  await writeStarterData(companyId);
}
```
(`src/data/seed.ts:38-46`)

A diferença é uma linha e é a regra inteira: `ensureStarterData` respeita a
marca, `restoreStarterData` a ignora — mas as duas caem na mesma guarda de
“nunca escrever sobre dado que já está lá” (§13.5).

`restoreStarterData` está na lista de escritores que o guarda de confirmação
vigia: `src/components/confirm.test.ts:48` exige que toda tela que chame
`saveItem|saveProduct|saveRecipeVersion|recordPurchase|eraseArea|restoreStarterData`
contenha `useConfirm()`.

### 13.4 As duas marcas em `app_meta`, e por que são duas

A tabela é chave/valor e existe **por causa da semente**:

```sql
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
(`src/data/db.ts:136-139`; docblock em `:128-135`: “existe por uma razão
específica: os dados iniciais precisam saber que já rodaram”)

| chave | valor | escrita por | lida por |
|---|---|---|---|
| `seeded` | `'1'` | `markSeeded()` (`src/data/seed.ts:212-218`) | `hasSeeded()` (`:88-94`) |
| `seeded_items` | JSON: array com os **6 ids** de insumo/embalagem que a semeadura criou | `markSeededItems()` (`:203-210`) | `exampleStillHere()` (`:62-86`) |

Ambas usam `INSERT … ON CONFLICT(key) DO UPDATE`.

`app_meta` **não é apagável**: está registrada como renúncia consciente no
guarda de apagamento, com o motivo escrito —

> `app_meta`: 'a gaveta local do aparelho: a cara escolhida, a luz da tela, a
> cidade do tempo, o que a capa esconde. Não é dado do negócio, e apagá-la faria
> o aplicativo reabrir estranho para quem só queria limpar o exemplo.'

(`src/data/erase.test.ts:87-89`)

Depois da semente, `app_meta` guarda também preferências e cache via
`readMeta`/`writeMeta`/`readJson`/`writeJson` (`src/data/meta.ts:15-53`), cujo
docblock proíbe explicitamente guardar ali qualquer coisa somável: “uma
chave/valor é exatamente o formato em que um `estoque_atual` renasceria — sem
trigger, sem histórico e sem ninguém notando” (`src/data/meta.ts:10-13`).

#### A cicatriz que criou `exampleStillHere`

O docblock está escrito em português no próprio arquivo
(`src/data/seed.ts:48-61`) e diz: a tela de Ajustes acendia “Inclui os dados de
exemplo” pela marca `seeded`, e a marca nunca é apagada. Então o selo era
verdadeiro em todo aparelho para sempre — apagava-se tudo, cadastrava-se o
primeiro insumo próprio, e a tela continuava dizendo que a lista incluía o
exemplo. “Contava uma variável (‘o exemplo já foi escrito alguma vez’) e nomeava
outra (‘o que está abaixo contém o exemplo’).”

Algoritmo de `exampleStillHere`, passo por passo (`src/data/seed.ts:62-86`):

1. `SELECT value FROM app_meta WHERE key = 'seeded_items'`.
2. Sem linha ou valor vazio → `false`.
3. `JSON.parse` num `try/catch`; parse quebrado → `false`.
4. Não é array, ou array vazio → `false`.
5. Filtra só as entradas `typeof id === 'string'`; nenhuma sobra → `false`.
6. `SELECT COUNT(*) AS n FROM items WHERE company_id = ? AND id IN (?, ?, …)` com
   um marcador por id.
7. Devolve `(found?.n ?? 0) > 0`.

Duas propriedades que caem disso e importam para reconstruir:

- **Instalação antiga sem a anotação responde `false`**, e o docblock diz que
  esse é o resultado certo: “ali o exemplo de fato não foi escrito”
  (`src/data/seed.ts:58-60`).
- **Basta UM dos seis ids existir** para a resposta ser sim. A consulta não olha
  `kind`, não olha receita nem produto, e não olha o item do produto — o produto
  **não** entra em `seeded_items`.

Prova em teste (`src/data/repository.test.ts:390-421`), com as duas metades:

```
await ensureStarterData(CO);            // hasSeeded() === true
                                        // exampleStillHere(CO) === true
await eraseArea(CO, 'all');             // listItems(CO) === []
await ensureStarterData(CO);            // listItems(CO) === []  ← a marca impede o retorno
hasSeeded(CO)        === true    'a marca é o que impede o exemplo de voltar'
exampleStillHere(CO) === false   'e ela não é a presença do exemplo'
```

### 13.5 `writeStarterData` — a ordem exata da escrita

Assinatura: `async function writeStarterData(companyId: string): Promise<void>`
(`src/data/seed.ts:96`).

**Guarda de abertura** (`src/data/seed.ts:99-107`), com o comentário “Never write
over data that is already there, whatever the mark says”:

```sql
SELECT COUNT(*) AS n FROM items WHERE company_id = ?
```

Se `n > 0`: chama `markSeeded()` e **retorna sem escrever nada**. É por isso que
o texto de produto de restaurar diz “Só funciona se estiver vazio”
(`src/i18n/locales/pt-BR.ts:371`). A guarda conta **todos** os itens da empresa,
inclusive o item do produto e itens que a pessoa cadastrou sozinha.

**Duas fábricas de item**, para não repetir os campos fixos:

```ts
const input = (name: string, purchaseUnit: string, purchaseToBase: number, baseUnit: string) =>
  saveItem(companyId, { kind: 'input', name, purchaseUnit, purchaseToBase, baseUnit,
                        packaging: LOOSE });

const packaging = (name: string, purchaseUnit: string, perPack: number) =>
  saveItem(companyId, { kind: 'packaging', name, purchaseUnit, purchaseToBase: perPack,
                        baseUnit: 'un', packaging: LOOSE });
```
(`src/data/seed.ts:109-132`)

**As duas hierarquias de embalagem** que a semente usa:

```ts
const LOOSE: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };

const STACKED: PackagingHierarchy = {
  tiers: [
    { id: 'unit',  perBaseUnit: 1 },
    { id: 'box',   perBaseUnit: 50 },
    { id: 'crate', perBaseUnit: 300 },
  ],
};
```
(`src/data/seed.ts:14-22`)

`LOOSE` vai em todo insumo e embalagem; `STACKED` vai só no produto.
`isValidHierarchy` exige primeiro degrau `perBaseUnit === 1` e crescimento
estrito (`src/domain/units.ts:26-32`) — as duas satisfazem.

**Escrita em série, nunca `Promise.all`.** O comentário no código é explícito:
“There is a single SQLite connection behind all of this and each write opens a
transaction, so running them together is not faster — it is an error”
(`src/data/seed.ts:134-136`).

**Ordem completa de escrita** (`src/data/seed.ts:137-200`):

1. 4 insumos (`input(...)`), um `await` por vez;
2. 2 embalagens (`packaging(...)`);
3. 6 compras (`buy(...)`) — a primeira delas é o que cria a `location` padrão;
4. receita `Base de creme`;
5. receita `Picolé de morango`, que referencia a base como sub-receita;
6. produto `Picolé de morango`;
7. `markSeededItems([pulp, sugar, milkPowder, glucose, stick, wrapper])`;
8. `markSeeded()`.

**A fábrica de compras**, e o motivo dela:

```ts
// Invoices, not typed-in prices. The average falls out of these.
const buy = (itemId: string, packs: number, perPack: number, priceReais: number) =>
  recordPurchase(companyId, {
    itemId,
    supplierName: 'Fornecedor inicial',
    purchaseQuantity: packs,
    baseUnits: packs * perPack,
    totalCents: fromDecimal(priceReais),
  });
```
(`src/data/seed.ts:145-153`)

`fromDecimal(v) = Math.round(v * 100) as Cents` (`src/domain/money.ts:11-13`).
Nenhuma compra passa `occurredAt`, então `recordPurchase` usa
`input.occurredAt ?? at` com `at = nowIso()` — as seis compras ficam com
`occurred_at === recorded_at === o instante da primeira abertura`
(`src/data/repository.ts:331-333`).

O docblock de `ensureStarterData` diz por que o exemplo entra por essa porta:
“Every number here arrives the way a real one would — through `recordPurchase`,
the same event that moves the moving average — so nothing in the app is looking
at figures that could not have come from an invoice” (`src/data/seed.ts:24-37`).
E diz por que a marca é fato guardado e não emptiness: “Inferring it from
emptiness would put the demo back the morning after somebody deliberately wiped
it, and an app that undoes your deletions is one nobody trusts with anything
else.”

### 13.6 Os dados semeados, transcritos

#### 13.6.1 Os seis itens

| ordem de escrita | `kind` | `name` | `purchase_unit` | `purchase_to_base` | `base_unit` | `packaging` |
|---|---|---|---|---|---|---|
| 1 | `input` | `Polpa de morango` | `balde 10 kg` | 10 000 | `g` | LOOSE |
| 2 | `input` | `Açúcar cristal` | `saco 25 kg` | 25 000 | `g` | LOOSE |
| 3 | `input` | `Leite em pó` | `saco 25 kg` | 25 000 | `g` | LOOSE |
| 4 | `input` | `Glucose 38DE` | `balde 5 kg` | 5 000 | `g` | LOOSE |
| 5 | `packaging` | `Palito de picolé` | `caixa 5.000` | 5 000 | `un` | LOOSE |
| 6 | `packaging` | `Embalagem plástica` | `fardo 2.000` | 2 000 | `un` | LOOSE |

(`src/data/seed.ts:137-143`)

Todos entram com `active = 1` (literal na instrução de `writeItem`,
`src/data/repository.ts:249`), `full_level = null` (a semente não manda
`fullLevel`, e sem `item.id` anterior o valor resolvido é `null`,
`src/data/repository.ts:237-244`) e `created_at = nowIso()`.

Os ids são UUIDs gerados por `newId()` (`src/data/db.ts:842-847`) — **não** são
constantes. Portanto o exemplo não tem id previsível, e é exatamente por isso que
`seeded_items` precisa ser gravado.

#### 13.6.2 As seis compras, e a taxa que cada uma congela

`buy(itemId, packs, perPack, priceReais)`:

| item | `packs` | `perPack` | `baseUnits` | `priceReais` | `totalCents` | taxa resultante |
|---|---|---|---|---|---|---|
| Polpa de morango | 4 | 10 000 | 40 000 g | 496 | 49 600 | **1,24** c/g (R$ 12,40/kg) |
| Açúcar cristal | 2 | 25 000 | 50 000 g | 236 | 23 600 | **0,472** c/g (R$ 4,72/kg) |
| Leite em pó | 1 | 25 000 | 25 000 g | 722,5 | 72 250 | **2,89** c/g (R$ 28,90/kg) |
| Glucose 38DE | 2 | 5 000 | 10 000 g | 98 | 9 800 | **0,98** c/g (R$ 9,80/kg) |
| Palito de picolé | 2 | 5 000 | 10 000 un | 200 | 20 000 | **2** c/un (R$ 0,02) |
| Embalagem plástica | 3 | 2 000 | 6 000 un | 180 | 18 000 | **3** c/un (R$ 0,03) |

(`src/data/seed.ts:155-160`; taxas verificadas com uma execução real do
`ensureStarterData` contra SQLite em memória)

A taxa por linha é `rate(totalCents / 100, baseUnits)`
(`src/data/repository.ts:398`), e `rate(p, n) = (p * 100) / n`
(`src/domain/money.ts:52-55`) — ou seja, `totalCents / baseUnits`.

Como cada item recebe **exatamente uma** compra, `average_rate === last_rate ===
a taxa da linha`. O `applyCostEvent` com estoque zero devolve
`rateFromCents(0 + totalCents, 0 + baseUnits)` (`src/domain/cost.ts:60-72`).

Os números de `1,24` e `0,472` não são coincidência: são os dois exemplos
escritos nos docblocks de `Rate` (`src/domain/money.ts:40-43`) e de
`StockCostState.averageRate` (`src/domain/cost.ts:20-23`). O exemplo semeado
**é** a demonstração da fundação de tipos.

Cada compra escreve cinco linhas numa transação — `purchases`,
`purchase_lines`, `movements` (kind `'purchase'`), `item_costs`,
`item_cost_history` — mais `locations` na primeira
(`src/data/repository.ts:369-455`). O `movement_group_id` é o id da **nota**
(`purchaseId`), não da linha, e a linha e o movimento **compartilham o mesmo id**
(`lineId`), porque “são um fato visto duas vezes” (`src/data/repository.ts:366-369`).

`item_cost_history` grava `previous_rate = before.averageRate || null` — para as
seis compras da semente isso é `null`, porque não havia média antes. Consequência
direta: `recentCostChanges` filtra `WHERE h.previous_rate IS NOT NULL`
(`src/data/repository.ts:2046-2071`, filtro na linha `:2058`), então **o exemplo semeado nasce com zero
mudanças de custo** para o briefing contar.

#### 13.6.3 As duas receitas

```ts
const base = await saveRecipeVersion(companyId, {
  name: 'Base de creme',
  yieldAmount: 20_000,
  yieldUnit: 'ml',
  lossFraction: 0.02,
  lines: [
    { kind: 'item', itemId: milkPowder, quantity: 2_000 },
    { kind: 'item', itemId: sugar,      quantity: 3_000 },
  ],
  note: 'Base compartilhada pelos sabores de creme.',
});
```
(`src/data/seed.ts:162-172`)

```ts
const strawberry = await saveRecipeVersion(companyId, {
  name: 'Picolé de morango',
  yieldAmount: 40_000,
  yieldUnit: 'ml',
  lossFraction: 0.05,
  lines: [
    { kind: 'item',   itemId: pulp,           quantity: 18_000 },
    { kind: 'item',   itemId: sugar,          quantity: 6_000 },
    { kind: 'item',   itemId: glucose,        quantity: 1_200 },
    { kind: 'recipe', recipeId: base.recipeId, quantity: 10_000 },
  ],
});
```
(`src/data/seed.ts:174-185`)

Notas de forma:

- `Picolé de morango` **não** tem `note` — o campo grava `null`
  (`src/data/repository.ts:1181`).
- As duas nascem `version = 1`, com `effective_from = at.slice(0, 10)` — a data
  UTC do instante da semeadura (`src/data/repository.ts:1173` e `:1184`). Verificado:
  `effectiveFrom` saiu `'2026-09-04'` numa execução de 4 de setembro de 2026.
- `recipes.active = 1` é literal na instrução (`src/data/repository.ts:1160-1161`).
- A linha de sub-receita grava `item_id = NULL` e `sub_recipe_id = <recipeId>`;
  a de item, o contrário (`src/data/repository.ts:1196-1206`). `position` é o
  índice na lista.
- A quantidade da sub-receita, `10 000`, está na **unidade de rendimento da
  base** (ml), não em gramas de insumo.

Por que o exemplo tem sub-receita: é a única forma de o `costRecipe` provar
recursão com memoização e detecção de ciclo em cima de dado real
(`src/domain/recipe.ts:125-190`), e há um teste que confere que “a sub-receita
carregou o custo para cima” (`src/data/repository.test.ts:378-388`).

#### 13.6.4 O produto

```ts
await saveProduct(companyId, {
  name: 'Picolé de morango',
  kind: 'product',
  recipeId: strawberry.recipeId,
  yieldPerUnit: 75,
  // Stick plus wrapper: packaging is a cost per unit, never per batch.
  unitPackagingCents: fromDecimal(0.05),
  packaging: STACKED,
});
```
(`src/data/seed.ts:187-195`)

| campo | valor semeado | como chega no banco |
|---|---|---|
| `name` | `Picolé de morango` | grava um **item** de `kind = 'product'`, `base_unit = 'un'`, `purchase_unit = null`, `purchase_to_base = null` (`src/data/repository.ts:1980-1991`) |
| `recipe_id` | id da receita de morango | — |
| `yield_per_unit` | `75` | 75 ml de calda por picolé |
| `unit_packaging_cents` | `5` | `fromDecimal(0.05)` |
| `packaging` | STACKED | no **item**, não no produto |
| `packaging_items` | `'[]'` | a semente não passa `packagingItems`; sem `input.id` anterior, o valor resolvido é `'[]'` (`src/data/repository.ts:1954-1956`) |
| `shelf_life_days` | `null` | não passado → `input.shelfLifeDays ?? null` |
| `full_level` | `null` | não passado |
| `line_id`, `type_id`, `flavor_id` | `null`, `null`, `null` | não passados |
| `active` | `1` | literal na instrução |

**O detalhe de produto mais importante aqui**: os cinco centavos de
`unitPackagingCents` são exatamente a soma das duas taxas de embalagem
compradas — palito 2 c/un + embalagem plástica 3 c/un. Ou seja, o exemplo
semeia o palito e a embalagem como **itens com estoque e custo**, mas o produto
não os declara em `packagingItems`: ele digita o valor. As duas metades de
`costPerProductUnit` existem de propósito (`itemsRate` = embalagem que sai do
estoque; `cents` = o que ninguém quis transformar em item,
`src/domain/recipe.ts:216-234`), e o exemplo usa a segunda.

Consequência verificável: uma corrida de produção do produto semeado **não
consome palito**. É por isso que o `e2e` cadastra um segundo produto, com
`packagingItems: [{ itemId: palito, quantityPerUnit: 1 }]`, para provar que o
saldo de palito desce (`e2e/flow.mjs:1053` e seguintes: `assert.ok(antes > 200,
'o exemplo semeado comprou palito')`), e por que `scripts/device-session.ts:121-138`
faz o mesmo contra o Postgres.

Também: o produto semeado é o único do exemplo e nasce **sem linha, tipo nem
sabor** — o que o `e2e` usa para exercitar o índice único da grade
(`e2e/flow.mjs:868`).

#### 13.6.5 O estado do banco no fim da semeadura

Verificado executando `ensureStarterData` contra `node:sqlite` em memória:

**Itens, na ordem em que `listItems` devolve** (`ORDER BY i.name COLLATE NOCASE`,
`src/data/repository.ts:180`):

| nome | `kind` | saldo | `averageRate` | `lastRate` | valor |
|---|---|---|---|---|---|
| Açúcar cristal | input | 50 000 g | 0,472 | 0,472 | R$ 236,00 |
| Embalagem plástica | packaging | 6 000 un | 3 | 3 | R$ 180,00 |
| Glucose 38DE | input | 10 000 g | 0,98 | 0,98 | R$ 98,00 |
| Leite em pó | input | 25 000 g | 2,89 | 2,89 | R$ 722,50 |
| Palito de picolé | packaging | 10 000 un | 2 | 2 | R$ 200,00 |
| Picolé de morango | product | 0 un | 0 | `null` | R$ 0,00 |
| Polpa de morango | input | 40 000 g | 1,24 | 1,24 | R$ 496,00 |

**Lugares** (`listPlaces`): um só —
`{ id: '00000000-0000-4000-8000-000000000001', name: '', kind: 'store_room',
isDefault: true, contactPhone: '', deliveryDays: 0, agreementNote: '',
sensorRanges: {} }`.

**`stockByPlace`**: um lugar, `valueCents = 193250` (**R$ 1.932,50**), com seis
linhas — o produto não aparece porque linha de saldo zero é omitida
(`src/data/repository.ts:777-779`).

**Contagens para apagar** (`countForErase`, e asserção em
`src/data/repository.test.ts:394-398`): `inputs = 6`, `recipes = 2`,
`products = 1`, `purchases = 6`. `places = 0`, porque a consulta exclui
`id = companyId` (`src/data/repository.ts:3430-3431`).

**`app_meta`** ao fim: `seeded = '1'` e `seeded_items` com os seis UUIDs na ordem
`[polpa, açúcar, leite em pó, glucose, palito, embalagem]`.

### 13.7 O que o exemplo demonstra em números — a conta inteira

Todos os valores abaixo foram obtidos executando `costRecipe`,
`unitsPerBatch` e `costPerProductUnit` sobre o banco semeado.

**`Base de creme`** (`costRecipe`):

| linha | quantidade | taxa | exato | `totalCents` mostrado | `share` |
|---|---|---|---|---|---|
| Leite em pó | 2 000 g | 2,89 | 5 780 | 5 780 | 0,80322401 |
| Açúcar cristal | 3 000 g | 0,472 | 1 416 | 1 416 | 0,19677599 |

- `batchCents = 7196` (R$ 71,96)
- `lossFraction = 0.02` → `netYield = 20 000 × 0,98 = 19 600 ml`
- `perYieldUnit = 7196 / 19600 = 0,36714285714285716` c/ml

**`Picolé de morango`** (`costRecipe`):

| linha | quantidade | taxa | `totalCents` mostrado | `share` |
|---|---|---|---|---|
| Polpa de morango | 18 000 g | 1,24 | 22 320 | 0,74401417 |
| Açúcar cristal | 6 000 g | 0,472 | 2 832 | 0,09440180 |
| Glucose 38DE | 1 200 g | 0,98 | 1 176 | 0,03920075 |
| Base de creme | 10 000 ml | 0,36714285714 (`perYieldUnit` da base) | 3 671 | 0,12238328 |

- soma exata fracionária = 29 999,42857…; `batchCents = cents(...) = 29999`
  (**R$ 299,99**)
- `lossFraction = 0.05` → `netYield = 40 000 × 0,95 = 38 000 ml`
- `perYieldUnit = 29999 / 38000 = 0,7894473684210527` c/ml
- as quatro linhas mostradas somam 22 320 + 2 832 + 1 176 + 3 671 = **29 999**,
  exatamente o `batchCents` — é `allocateByWeight` fazendo o resto de maior
  remanescente (`src/domain/money.ts:82-99`, chamado em
  `src/domain/recipe.ts:177`)

**Do lote ao picolé:**

- `unitsPerBatch(rc, 75) = Math.floor(38 000 / 75) = Math.floor(506,666…) = **506**`
  (`src/domain/recipe.ts:248-251`)
- `costPerProductUnit(rc, 75, { cents: 5 }) = cents(0,7894473684 × 75 + 0 + 5) =
  cents(59,2085… + 5) = **64** centavos` (`src/domain/recipe.ts:235-246`)

Essas duas saídas são o que o `e2e` verifica no navegador:

- `assert.match(text, /1 engradado, 4 caixas e 6 unidades/)` na tela de produtos
  (`e2e/flow.mjs:228`) — que é `breakdown(506, STACKED)`: 1×300 + 4×50 + 6×1
  (`src/domain/units.ts:46-58`);
- `assert.match(text, /R\$ 1\.552,50/, 'the four inputs are worth this much at
  average cost')` na tela de insumos (`e2e/flow.mjs:210`) — 496,00 + 236,00 +
  722,50 + 98,00 = **R$ 1.552,50**, os quatro `input` sem as duas embalagens;
- `assert.doesNotMatch(text, /R\$ 0,64/, 'o custo por unidade não mora mais na
  capa')` (`e2e/flow.mjs:197`) — R$ 0,64 é justamente o custo por unidade
  calculado acima, e a asserção é negativa: o número existe, mas saiu da tela
  inicial de propósito.

Outras asserções do `e2e` que dependem só do exemplo semeado:

| asserção | onde | o que ela prova sobre a semente |
|---|---|---|
| `/Polpa de morango/` e `!/Nada cadastrado ainda/` em `/inputs` | `e2e/flow.mjs:211-212` | o link profundo abre num banco semeado, não vazio |
| `/sem saída registrada ainda\|acaba em\|antes de um mês/` | `e2e/flow.mjs:214-220` | o exemplo **nunca teve saída**, então a frase honesta é a de que ninguém sabe quanto dura |
| `/Base de creme/` e `/Picolé de morango/` em `/recipes` | `e2e/flow.mjs:239-241` | as duas receitas e a sub-receita chegam |
| `/Inclui os dados de exemplo/` em Ajustes | `e2e/flow.mjs:335` | `exampleStillHere` acende o selo |
| `/Produza para os pedidos/` e `/300/` na capa | `e2e/flow.mjs:456-458` | “a fábrica semeada nunca produziu, então os 300 pedidos são 300 que faltam” |
| `/Compra/` entre os movimentos | `e2e/flow.mjs:1634` | “a compra semeada está entre eles” |

E uma guarda de i18n: os nomes semeados são **português chumbado de propósito**, e
isso está registrado como renúncia consciente na lista `NAO_E_DICIONARIO` —
`'Picolé de morango': 'nome de produto do exemplo semeado, não frase de tela'`,
`'Açúcar cristal'` e `'Polpa de morango'` com o mesmo motivo
(`src/selectors.test.ts:74-76`). Os nomes do exemplo **não são traduzidos** nos
três idiomas.

### 13.8 A fila de saída que a semente produz

`enqueue(conn, writes)` insere uma linha em `outbox` por escrita, com
`op = 'upsert'` por padrão e `payload = '{}'` (`src/data/outbox.ts:46-63`). A
fila carrega **id de linha, não conteúdo** — o serializador lê a linha na hora de
enviar.

Verificado por execução: a semente deixa **37 entradas pendentes**, assim
distribuídas —

| tabela | entradas |
|---|---|
| `items` | 7 (6 insumos/embalagens + o item do produto) |
| `locations` | 1 |
| `purchases` | 6 |
| `purchase_lines` | 6 |
| `movements` | 6 |
| `recipes` | 2 |
| `recipe_versions` | 2 |
| `recipe_lines` | 6 (2 da base + 4 do morango) |
| `products` | 1 |

Ordem exata em que ficam na fila (é ela que vai para o servidor, e a ordem é o
ponto — `src/data/outbox.ts:65-71`):

```
items ×6,
locations, (purchases, purchase_lines, movements) ×6,
recipes, recipe_versions, recipe_lines ×2,      ← Base de creme
recipes, recipe_versions, recipe_lines ×4,      ← Picolé de morango
items, products                                 ← o item do produto e o produto
```

`item_costs` **não** é enfileirado, e a omissão é o desenho: “a média é derivada,
e número derivado tem um autor” — o aparelho calcula a sua para poder mostrar
custo sem sinal, e o servidor calcula a dele a partir das mesmas linhas, pelo
gatilho `apply_purchase_to_cost` que dispara em `purchase_lines`
(`src/data/repository.ts:441-455`).

Dois testes se apoiam nessa fila da semente:

- `src/sync/sync.test.ts:149-162`: depois de `ensureStarterData`, `drain` envia
  tudo e a ordem recebida tem `items` antes de `purchases` e `recipes` antes de
  `recipe_versions`.
- `src/data/repository.test.ts:465-500`: apagar as compras do exemplo é o caso
  normal que plantava órfã na fila; depois de `eraseArea(CO, 'purchases')` não
  sobra entrada de `movements`, `purchases` nem `purchase_lines`, as de `items`
  ficam intactas, e entra uma entrada `{ table: 'erase', rowId: 'purchases' }`.

### 13.9 O que a semente **não** cria

Fatos, não suposições — cada um verificado no banco semeado:

- **Nenhum lugar cadastrado.** Só a `location` padrão, criada por
  `ensureLocation` dentro da primeira compra, com `name = ''`. `countForErase`
  devolve `places = 0`.
- **Nenhuma produção, nenhum lote, nenhuma validade.** O produto tem
  `shelf_life_days = null` e saldo 0.
- **Nenhuma perda, nenhuma transferência, nenhuma remessa, nenhuma contagem.**
- **Nenhum pedido, nenhuma leitura de sensor, nenhuma linha/tipo/sabor.**
- **Nenhuma mudança de custo contável** — todas as seis compras gravam
  `previous_rate = null` (§13.6.2).
- **Nenhum passado.** As seis compras acontecem no instante da primeira
  abertura. É esse buraco que `src/data/simulate.ts` existe para preencher, e o
  docblock dele diz isso na primeira linha: “O exemplo que este app traz tem um
  dia de idade e nunca se moveu: o bastante para provar que uma tela desenha,
  não o bastante para provar que ela diz alguma coisa”
  (`src/data/simulate.ts:15-35`).

### 13.10 Os textos de produto ligados ao exemplo, nos três idiomas

São decisões de produto e estão no dicionário, não na tela.

| chave (`app.settings.*`) | pt-BR | en | es |
|---|---|---|---|
| `hasExample` | `Inclui os dados de exemplo` | `Includes the example data` | `Incluye los datos de ejemplo` |
| `exampleTitle` | `Dados de exemplo` | `Example data` | `Datos de ejemplo` |
| `exampleEmpty` | `Está vazio. Se quiser ver o aplicativo funcionando antes de cadastrar o seu, dá para trazer o exemplo de volta.` | `It is empty. If you want to see the app working before entering your own, you can bring the example back.` | `Está vacío. Si quieres ver la aplicación funcionando antes de cargar lo tuyo, puedes traer el ejemplo de vuelta.` |
| `restore` | `Restaurar dados de exemplo` | `Restore the example data` | `Restaurar datos de ejemplo` |
| `restoreTitle` | `Trazer o exemplo de volta?` | `Bring the example back?` | `¿Traer el ejemplo de vuelta?` |
| `restoreBody` | `Recoloca os insumos, a receita e o produto de demonstração, com as compras que dão o custo a eles. Só funciona se estiver vazio.` | `Puts back the demonstration inputs, recipe and product, with the purchases that give them their cost. Only works if it is empty.` | `Repone los insumos, la receta y el producto de demostración, con las compras que les dan su costo. Solo funciona si está vacío.` |
| `restoreConfirm` | `Restaurar` | `Restore` | `Restaurar` |
| `failedToRestore` | `Não deu para restaurar` | `Could not restore` | `No se pudo restaurar` |
| `simulate` | `Plantar duas semanas de movimento` | `Plant two weeks of movement` | `Sembrar dos semanas de movimiento` |
| `simulateTitle` | `Encher o app com duas semanas?` | `Fill the app with two weeks?` | `¿Llenar la app con dos semanas?` |
| `simulateBody` | `Escreve catorze dias de fábrica em cima do que já existe: produção quase todo dia, entregas para a loja, e notas de compra com o preço variando. Serve para ver as telas com movimento — o livro-razão fica com esses lançamentos, e apagar tudo continua sendo em Ajustes.` | (mesma frase em inglês, `src/i18n/locales/en.ts:322`) | (mesma frase em espanhol, `src/i18n/locales/es.ts:327`) |
| `simulateConfirm` | `Plantar` | `Plant` | `Sembrar` |
| `simulateDone` | `Pronto: {{runs}} corridas, {{deliveries}} entregas e {{invoices}} notas.` | `Done: {{runs}} runs, {{deliveries}} deliveries and {{invoices}} invoices.` | `Listo: {{runs}} corridas, {{deliveries}} entregas y {{invoices}} facturas.` |
| `failedToSimulate` | `Não deu para plantar o movimento` | `Could not plant the movement` | `No se pudo sembrar el movimiento` |

(`src/i18n/locales/pt-BR.ts:335,358-373`; `src/i18n/locales/en.ts:292,315-330`;
`src/i18n/locales/es.ts:297,320-335`)

Como a tela usa: `restoreStarterData()` só roda depois de `confirm({ title:
t.app.settings.restoreTitle, message: t.app.settings.restoreBody, confirmLabel:
t.app.settings.restoreConfirm })` devolver verdadeiro (`app/settings.tsx:321-343`);
`exampleStillHere` alimenta `data.example`, lido junto com `countForErase` numa
`useQuery` (`app/settings.tsx:260-268`).

### 13.11 `src/data/assistantData.ts` — o que ele é

**Um arquivo, uma função exportada.** Nada mais.

```ts
export function liveData(companyId: string, timeZone: string): AssistantData
```
(`src/data/assistantData.ts:33`)

O docblock diz o que ele **não** é: “Note what this file is: a binding, not a
query. Every function below is the one the screens already call, with the company
filled in. The assistant is physically unable to ask the database anything the
screens cannot ask, which is what keeps the two from ever reporting different
numbers for the same thing” (`src/data/assistantData.ts:24-32`).

Estado: **implementado e chamado por tela** — `app/assistant.tsx:98`, dentro de
um `useMemo` com dependência `[locale.timeZone]`:

```ts
const context = useMemo(
  () => ({
    data: liveData(LOCAL_COMPANY_ID, locale.timeZone),
    capabilities: CAPABILITIES,
    locale: defaultLocale,
  }),
  [locale.timeZone],
);
```
(`app/assistant.tsx:95-102`)

`CAPABILITIES = capabilitiesFor('owner')` (`app/assistant.tsx:80`) — “até o login
chegar, quem tem o telefone é o dono”.

Nota factual: o `data` recebe `locale.timeZone` (o fuso escolhido pela empresa),
mas o campo `locale` do contexto recebe `defaultLocale`, não `locale`
(`app/assistant.tsx:98-100`). São duas fontes diferentes no mesmo objeto.

#### 13.11.1 Os dezessete membros, um por um

`liveData` devolve um objeto literal. Coluna “injeta” = o que `liveData` preenche
que o chamador não passa.

| membro | mapeia para | injeta |
|---|---|---|
| `listItems()` | `listItems(companyId)` | `companyId`; deixa `kind`, `includeInactive`, `locationId` nos padrões (`undefined`, `false`, `undefined`) |
| `listProducts()` | `listProducts(companyId)` | `companyId` |
| `loadRecipeGraph()` | `loadRecipeGraph(companyId)` | `companyId` |
| `itemCosts()` | `itemCosts(companyId)` | `companyId` |
| `labels()` | `labels(companyId)` | `companyId` |
| `recentCostChanges(limit)` | `recentCostChanges(companyId, limit)` | `companyId` |
| `itemMovements(itemId, limit)` | `itemMovements(companyId, itemId, limit)` | `companyId`; **não** passa `locationId` |
| `productionOn(from, to)` | `productionOn(companyId, from, to)` | `companyId` |
| `lossesOn(from, to)` | `lossesOn(companyId, from, to)` | `companyId` |
| `recordPurchase(input)` | `recordPurchase(companyId, input)` | `companyId` |
| `recordCount(input)` | `recordCount(companyId, { ...input, locationId: defaultLocationId(companyId) })` | `companyId` **e o local padrão** |
| `listPlaces()` | `listPlaces(companyId)` | `companyId` |
| `stockByPlace()` | `stockByPlace(companyId)` | `companyId` |
| `defaultPlaceId()` | `defaultLocationId(companyId)` — síncrono | — |
| `recordProduction(input)` | `recordProduction(companyId, { ...input, locationId: defaultLocationId(companyId), producedOn: localDate(nowIso(), timeZone) })` | `companyId`, **local padrão e o DIA local** |
| `recordTransfer(input)` | `recordTransfer(companyId, { ...input, fromLocationId: defaultLocationId(companyId) })` | `companyId` **e a origem** |
| `saveItem(input)` | `saveItem(companyId, { ...input, packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] } })` | `companyId` **e a hierarquia solta** |

(`src/data/assistantData.ts:34-72`; são 17 chaves contando `defaultPlaceId`)

#### 13.11.2 As quatro injeções, e o raciocínio escrito de cada uma

**1. `recordCount` — o local é exigido lá em cima, e preenchido aqui.**
`recordCount` no repositório declara `locationId: string` **obrigatório e sem
padrão de propósito**: “Com um padrão, contar a câmara fria sem dizer compararia
contra o saldo da empresa inteira e escreveria a diferença na câmara fria —
estoque teleportado entre salas por um operador que fez tudo certo. A regra
deste projeto é que o erro é impedido, não reclamado: quem chama diz onde, ou não
compila” (`src/data/repository.ts:906-917`).

O comentário em `assistantData.ts:45-49` explica a ponte: “O assistente conta a
prateleira do lugar padrão, e a habilidade só chega aqui depois de conferir que o
item está num lugar só — com o item em duas salas ela para e diz quais
(`src/assistant/skills.ts`, registerCount). O local é exigido aqui, e não com
padrão lá dentro, por isso mesmo: a decisão de onde gravar mora em quem sabe
fazer a pergunta.”

E a habilidade cumpre: `register_count` chama `ctx.data.stockByPlace()`, filtra
os lugares que têm o item, e se `holding.length > 1` **não grava** — devolve
`${item.name} está em ${holding.length} lugares: ${nomes}. Conte um lugar por
vez - abra o item e escolha o lugar.` com `route: /inputs/${item.id}`
(`src/assistant/skills.ts:555-564`). O comentário em `src/assistant/skills.ts:547-553` registra que a
condição da decisão original já chegou: “as telas de almoxarifado já filtram por
sala. Sem esta checagem o assistente compara com o total da empresa e grava a
diferença no almoxarifado — a mesma teleportação que a tela de detalhe tinha.”

**2. `recordProduction` — o local sai daqui, o dia também, e por razões
diferentes.** Comentário transcrito (`src/data/assistantData.ts:55-61`): “A
produção sai no lugar padrão, pelo mesmo motivo da contagem: enquanto há uma
fábrica só, perguntar qual é pedir o que o sistema já sabe. O DIA, porém, não se
adivinha: o lote nasce com a data de calendário da fábrica, e transformar o
instante em dia precisa do fuso. Ele entra por aqui, vindo da tela, pelo mesmo
motivo que o local: quem sabe o fato é quem tem a pergunta na mão.”

`producedOn = localDate(nowIso(), timeZone)` — `localDate` devolve `YYYY-MM-DD`
calculado com `Intl.DateTimeFormat('en-CA', { timeZone, … })`, nunca por corte de
string do instante (`src/domain/day.ts:37-47`). O docblock dessa função avisa o
atalho errado: `dayWindow(...).from.slice(0, 10)` erra onde o fuso é positivo,
porque a meia-noite local de 3 de setembro em Madri é 2 de setembro às 22h em
UTC (`src/domain/day.ts:32-35`).

**3. `recordTransfer` — a origem é sempre a fábrica.** O tipo do contrato só
pede `toLocationId` (`src/assistant/types.ts:81-86`), e o docblock em
`AssistantData.defaultPlaceId` diz por quê: “Onde fica a fábrica, que é a origem
de toda saída até existir uma segunda” (`src/assistant/types.ts:73`).

**4. `saveItem` — hierarquia solta chumbada.** O assistente cria item sem
perguntar embalagem: `{ tiers: [{ id: 'unit', perBaseUnit: 1 }] }`
(`src/data/assistantData.ts:70-71`). É o mesmo literal de `LOOSE` em `seed.ts` e
de `DEFAULT_PACKAGING` em `repository.ts:76` — **três cópias do mesmo objeto em
três arquivos**, não uma constante compartilhada. Fato, não recomendação.

#### 13.11.3 O contrato `AssistantData`, transcrito

Vive em `src/assistant/types.ts:49-108`, não em `assistantData.ts` — e o
docblock diz: “It is deliberately the same set the screens call. An assistant
with a query path of its own eventually reports a different number than the
screen showing the same thing, and the app loses its credibility in a single
day” (`src/assistant/types.ts:42-48`).

| membro | assinatura declarada |
|---|---|
| `listItems` | `(): Promise<ItemWithCost[]>` |
| `listProducts` | `(): Promise<Product[]>` |
| `loadRecipeGraph` | `(): Promise<Record<string, Recipe>>` |
| `itemCosts` | `(): Promise<ItemCosts>` |
| `labels` | `(): Promise<Record<string, string>>` |
| `recentCostChanges` | `(limit: number): Promise<CostChange[]>` |
| `itemMovements` | `(itemId: string, limit?: number): Promise<MovementRow[]>` |
| `productionOn` | `(fromIso: string, toIso: string): Promise<ProducedInWindow[]>` |
| `lossesOn` | `(fromIso: string, toIso: string): Promise<LossRow[]>` |
| `listPlaces` | `(): Promise<Place[]>` |
| `stockByPlace` | `(): Promise<PlaceStock[]>` |
| `defaultPlaceId` | `(): string` |
| `recordProduction` | `(input: { productId: string; batches: number; unitsProduced: number; assistantPhrase?: string }): Promise<unknown>` |
| `recordTransfer` | `(input: { itemId: string; toLocationId: string; baseUnits: number; assistantPhrase?: string }): Promise<unknown>` |
| `recordCount` | `(input: { itemId: string; countedBaseUnits: number; assistantPhrase?: string }): Promise<unknown>` |
| `saveItem` | `(input: { kind: 'input' \| 'packaging' \| 'store_supply'; name: string; purchaseUnit: string \| null; purchaseToBase: number \| null; baseUnit: string }): Promise<string>` |
| `recordPurchase` | `(input: { itemId: string; purchaseQuantity: number; baseUnits: number; totalCents: Cents; supplierName?: string; assistantPhrase?: string }): Promise<unknown>` |

O que **não** está no contrato, e portanto o assistente não pode alcançar: perda
(`recordLoss`), devolução (`recordReturn`), estorno (`planReversal`,
`reverseGroup`), pedido (`saveOrder`, `listOrders`), lote (`lotsOn`, `findLot`),
leitura de sensor (`recordReading`), grade (`saveLine`/`saveType`/`saveFlavor`),
lugar novo (`savePlace`), receita (`saveRecipeVersion`), produto
(`saveProduct`), apagar (`eraseArea`). Ele **lê** perdas (`lossesOn`) mas não as
grava.

Cada um dos três `record*` de escrita aceita `assistantPhrase`, e o motivo está
escrito em três lugares idênticos no repositório: “The plan's own condition for
letting an assistant write at all: every movement it creates is marked as such,
with the words that created it” (`src/data/repository.ts:318-326`,
`:892-900`, e no `SkillContext.question`, `src/assistant/types.ts:148-157`).
`liveData` **não** injeta a frase — ela vem no `input` de quem chama.

**Nota factual sobre o rastro**: `liveData` repassa `assistantPhrase` porque usa
spread (`...input`) nos três casos que o injetam, e passa `input` inteiro nos
outros. Nenhum membro é filtrado.

### 13.12 `src/data/schema.test.ts` — as três garantias

141 linhas, três testes, um harness. Roda por `npm test`
(`tsx --test 'src/**/*.test.ts'`, `package.json`).

O docblock (`src/data/schema.test.ts:6-22`) declara o alvo: “The guard for the
one architectural mistake this project has actually made.” E o motivo de ser uma
checagem de **nome**: “It is deliberately a name check rather than anything
cleverer. The mistake announces itself in the name every time — `on_hand`,
`current_stock`, `estoque_atual` — because whoever writes it is describing
exactly what it is.”

#### 13.12.1 O detector

```ts
function looksLikeStoredStock(column: string): boolean {
  return /(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)/i.test(
    column,
  );
}
```
(`src/data/schema.test.ts:31-35`)

Seis alternativas, âncora `(^|_)` — o nome tem que começar a palavra —, sem
âncora no fim (então `on_hand_base_units` casa), `i` para maiúsculas. O comentário
diz por que é estreito: “Kept narrow on purpose. A guard that fires on anything
containing ‘total’ would be turned off within a week, and a guard people turn off
protects nothing” (`:24-30`).

#### 13.12.2 O harness

`inMemoryDb(): Db` (`src/data/schema.test.ts:37-60`) monta um `Db` sobre
`new DatabaseSync(':memory:')` do `node:sqlite`, com os cinco métodos:

- `bind` converte `undefined` em `null` antes de passar ao driver (`:39`);
- `withTransactionAsync` faz `BEGIN` / `COMMIT`, e `ROLLBACK` + `throw` no
  `catch` (`:49-58`).

O mesmo harness aparece copiado em `src/data/simulate.test.ts:38-61` (com o nome
`memoria`), em `src/sync/sync.test.ts:20+` e em `scripts/device-session.ts`.

#### 13.12.3 Teste 1 — `the guard recognises the column this project actually shipped`

(`src/data/schema.test.ts:62-74`) Seis asserções, sem banco:

| entrada | esperado | comentário no código |
|---|---|---|
| `on_hand_base_units` | `true` | “o nome real da coluna real que realmente existiu, em `item_costs`, até ser removida” |
| `estoque_atual` | `true` | — |
| `current_stock` | `true` | — |
| `quantity_base_units` | `false` | é a coluna do próprio livro-razão |
| `purchase_to_base` | `false` | — |
| `total_cents` | `false` | — |

O motivo dos três negativos está escrito: “é o que impede o guarda de ser
desligado na primeira vez que ele grita lobo” (`:69-70`).

#### 13.12.4 Teste 2 — `no table on the device stores a stock total`

(`src/data/schema.test.ts:76-104`) Passos:

1. `inMemoryDb()` + `await migrate(conn)` — constrói o esquema real do aparelho,
   os 17 passos.
2. `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE
   'sqlite_%'`.
3. `assert.ok(tables.some((t) => t.name === 'movements'), 'the ledger has to
   exist for anything else here to mean something')` — a guarda contra a guarda
   passar num banco vazio.
4. Para cada tabela: `PRAGMA table_info(<nome>)`, interpolado e não vinculado,
   com o comentário justificando (“The name comes from `sqlite_master` in a
   database this test just built, and PRAGMA takes no bound parameters”, `:91-92`).
5. Cada coluna que casar entra em `offenders` como `` `${table}.${column}` ``.
6. `assert.deepEqual(offenders, [], 'a balance is the sum of its movements; this
   column would become a second answer')`.

O que este teste **não** cobre: não olha o esquema do servidor
(`supabase/migrations/`), não olha gatilho, não olha tipo de coluna, e não impede
que um total seja guardado sob outro nome (por exemplo `held`, `balance`,
`qty`).

#### 13.12.5 Teste 3 — `a phone that dies mid-upgrade comes back on the version it finished`

(`src/data/schema.test.ts:106-141`) É o único teste do arquivo que não fala de
estoque; ele exercita `migrate`.

Montagem: um `Db` `flaky` que herda o real por spread e substitui `execAsync`
para **lançar** enquanto `powerCut` for verdadeiro e o SQL, com `trimStart`,
começar por `PRAGMA user_version` (`:114-123`). O comentário nomeia o perigo: o
corte cai “exactly where the danger was: between applying a step and recording
that it was applied. Written outside the transaction, that gap was a way to brick
an installation — the next launch would re-run a step like `ALTER TABLE … ADD
COLUMN`, fail on the column already being there, and fail again on every launch
after that, with no way in.”

Asserções, em ordem:

1. `await assert.rejects(() => migrate(flaky), /power cut/)`;
2. `PRAGMA user_version` no banco real vale **0** — “a step that did not finish
   is not recorded as done”;
3. `sqlite_master` sem tabela nenhuma — “and it left no half-built schema
   behind”;
4. `powerCut = false`; `await migrate(flaky)`;
5. `PRAGMA user_version === schemaVersion` (17).

Isto é a prova de que o `PRAGMA user_version` **participa da transação**
(`src/data/db.ts:790-807`).

### 13.13 `src/data/simulate.test.ts` — a quinzena conferida como fato

122 linhas, três testes. O docblock (`:10-18`) diz por que existe: “metade do
briefing só tem o que dizer quando há passado: ‘saíram 480 hoje, 200 a mais que
na segunda passada’ não se testa contra um banco cuja história inteira é esta
manhã. O ramo da comparação estava sem nenhum teste por essa razão exata.”

Duas constantes, ambas cicatriz:

```ts
const SP = 'America/Sao_Paulo';                    // :20
const AGORA = '2026-09-01T15:00:00.000Z';          // :29
```

O comentário de `AGORA` (`:22-28`): “A proofgate pegou isto e tinha razão: teste
que lê a hora de verdade roda diferente às 23h59 e à 00h01, e a promessa de
determinismo desta simulação não valia enquanto ‘hoje’ fosse o dia em que a
suíte por acaso rodou.”

`bancoLimpo()` (`:31-36`): `memoria()` → `migrate(conn)` → `__setDb(conn)`.

#### Teste 1 — `a fortnight of operation lands in the ledger, spread over its days` (`:63-83`)

```
await bancoLimpo();
await ensureStarterData(LOCAL_COMPANY_ID);
const feito = await simulateFortnight(LOCAL_COMPANY_ID, { timeZone: SP, at: AGORA });

feito.runs       >= 8   `poucas corridas para catorze dias: ${feito.runs}`
feito.deliveries >= 5   `poucas entregas: ${feito.deliveries}`
feito.invoices   >= 1   'nenhuma nota de compra entrou'
```

Depois compara passado com presente, que é o par que a capa precisa:

```
const hoje          = dayWindow(AGORA, SP);
const semanaPassada = dayWindow(AGORA, SP, -7);
const deHoje  = await productionOn(LOCAL_COMPANY_ID, hoje.from, hoje.to);
const deEntao = await productionOn(LOCAL_COMPANY_ID, semanaPassada.from, semanaPassada.to);
deEntao.length > 0   'a semana passada ficou vazia - não há com o que comparar'
deHoje.length + deEntao.length > 0
```

Valores reais com a semente padrão e `at = AGORA`, verificados por execução:
`{ days: 14, runs: 14, deliveries: 6, invoices: 8 }`. As três cotas (8, 5, 1)
têm folga.

#### Teste 2 — `the same seed writes the same fortnight, twice` (`:85-96`)

Roda duas vezes a sequência inteira (banco novo, semente, simulação com
`seed: 7`) e faz `assert.deepEqual(await rodar(), await rodar())`. O comentário:
“Determinismo não é preciosismo: um teste que falha tem de falhar de novo igual, e
o dono olhando a tela e a suíte olhando a asserção têm de estar vendo a mesma
fábrica.”

Com `seed: 7` e o mesmo `at`, a saída verificada é
`{ days: 14, runs: 14, deliveries: 4, invoices: 9 }` — note que **4 entregas**
não passaria a cota `>= 5` do teste 1; o teste 2 só compara duas execuções entre
si, não com um piso.

#### Teste 3 — `the simulation writes through the front door, so the balance survives it` (`:98-122`)

Duas metades:

```
for (const item of await listItems(LOCAL_COMPANY_ID))
  item.onHandBaseUnits >= 0   `${item.name} ficou com saldo negativo: ${item.onHandBaseUnits}`
```

com o motivo escrito: “a simulação chama `recordProduction`, que hoje recusa
consumir o que não tem. Se ela escrevesse SQL próprio, isto passaria e a fábrica
simulada seria impossível” (`:103-105`).

E:

```
const remessas = [ ...shipmentsOn(ontem), ...shipmentsOn(hoje) ];
remessas.length > 0   'nenhuma remessa nos dois últimos dias'
```

#### 13.13.1 `src/data/simulate.ts`, o que os testes exercitam

Duas exportações:

| função | assinatura | chamador | estado |
|---|---|---|---|
| `simulateFortnight` | `(companyId = LOCAL_COMPANY_ID, options: { days?: number; seed?: number; timeZone?: string; at?: string } = {}): Promise<Simulation>` | `app/settings.tsx:371` (tela) e `simulate.test.ts` | **implementado e chamado por tela** |
| `simulateHistory` | mesma assinatura; corpo é `return simulateFortnight(companyId, options)` (`src/data/simulate.ts:65-70`) | **nenhum** — `grep` acha só a definição | **implementado, sem chamador** |

`Simulation = { days: number; runs: number; deliveries: number; invoices: number }`
(`src/data/simulate.ts:46-51`).

Padrões: `days = 14`, `seed = 20260901`, `timeZone = 'America/Sao_Paulo'`,
`at = nowIso()` (`:76-86`).

Gerador determinístico — um LCG de três linhas:

```ts
function rolls(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
```
(`src/data/simulate.ts:38-44`)

Preparação (`:88-98`): `listProducts` filtrado por `p.recipeId`; se vazio,
`throw new Error('não há produto com receita para simular')`. `listPlaces`;
`factory = places.find(p => p.isDefault) ?? places[0]`;
`store = places.find(p => !p.isDefault)` e, se não houver,
`savePlace(companyId, { name: 'Loja Centro', kind: 'own_store' })`. **É essa
linha que cria a única loja do banco de teste**, e é dela que vem o
`assert.match(lista, /Loja Centro/)` do `e2e`.

Laço, do dia mais antigo para o mais novo (`for (let back = days - 1; back >= 0;
back -= 1)`), com o motivo escrito: “Oldest first, so every cost the ledger
freezes is the cost that was true on that day — writing backwards would freeze
today's price onto last week” (`:103-105`).

Por dia:

1. `day = dayWindow(today, timeZone, -back)`; `at(hour) = day.from + hour ×
   3 600 000`, em ISO.
2. `weekday = new Date(day.from).getUTCDay()`; se `0`, `continue` — “Sunday is
   quiet. A week where every day looks the same teaches the briefing to compare
   noise with noise” (`:110-113`).
3. **Compras**: todo `item.kind === 'input'` com `purchaseToBase > 0` e
   `onHandBaseUnits < pack * 3` recebe nota. `packs = 4 + floor(next() * 3)`
   (4, 5 ou 6). O preço oscila em torno de um **patamar** guardado uma vez por
   item (`patamar` é um `Map`, inicializado com `item.averageRate || 1`):
   `tendencia = 1 + (0.12 * (days - 1 - back)) / max(days, 1)`;
   `drift = 0.93 + next() * 0.14`;
   `totalCents = Math.round(baseUnits * base * tendencia * drift)`; se `<= 0`,
   pula. Grava com `occurredAt: at(7)`.
   O comentário registra a versão anterior e o defeito: multiplicar a média
   **atual** por 0,92–1,12 compõe, e “um ano de compras levou a polpa de 1,24 a
   6,75 centavos por grama, e o picolé de R$ 0,64 a R$ 2,64. Isso não é uma
   fábrica, é juros compostos” (`:130-138`).
4. **Produção**: `kettles = next() < 0.3 ? 2 : 1`; para cada uma, produto
   sorteado, `planned = 500`, `made = Math.round(500 × (0.9 + next() × 0.14))`,
   `batches: 1`, `locationId: factory.id`, `occurredAt: at(9 + k * 3)`. Envolvida
   em `try/catch` vazio, com o motivo: “Faltou insumo naquele dia: acontece numa
   fábrica, e a corrida simplesmente não aconteceu. Não é erro da simulação”
   (`:174-177`).
5. **Entrega**: com probabilidade `next() < 0.7`, produto sorteado,
   `sent = min(saldo, 100 + floor(next() * 300))`; se `> 0`, `recordTransfer`
   de `factory.id` para `store.id` com `occurredAt: at(16)`.

**Dois fatos verificados sobre o fuso nesse laço**, ambos discrepâncias reais
entre o parâmetro `timeZone` e o que o código usa:

- `producedOn: localDate(at(9 + k * 3), 'America/Sao_Paulo')`
  (`src/data/simulate.ts:171`) — o fuso está **chumbado no literal**, e ignora
  `options.timeZone`, que é usado em toda a linha acima (`dayWindow(today,
  timeZone, -back)`).
- `new Date(day.from).getUTCDay()` (`:112`) lê o dia da semana do **instante UTC
  da meia-noite local**. Verificado com `dayWindow('2026-09-06T12:00:00.000Z',
  tz)`, sendo 6 de setembro de 2026 um domingo:

  | fuso | `from` | `getUTCDay()` |
  |---|---|---|
  | `America/Sao_Paulo` | `2026-09-06T03:00:00.000Z` | 0 (domingo) |
  | `UTC` | `2026-09-06T00:00:00.000Z` | 0 (domingo) |
  | `Asia/Tokyo` | `2026-09-05T15:00:00.000Z` | **6** (sábado) |
  | `Europe/Madrid` | `2026-09-05T22:00:00.000Z` | **6** (sábado) |

  Em fuso de deslocamento positivo, o dia “quieto” da simulação cai no sábado, e
  o domingo produz. NÃO ESTÁ NO CÓDIGO nenhuma decisão registrada sobre isso, e
  nenhum teste cobre um fuso positivo — os três testes usam só
  `America/Sao_Paulo`.

### 13.14 O outro lugar em que a semente é o ponto de partida

`scripts/device-session.ts` é o insumo do `npm run db:verify`: “Runs a real
session on a real device database, then prints its outbox as SQL the server would
receive” (`scripts/device-session.ts:1-17`). Ele começa exatamente como o
aplicativo:

```ts
const { db, raw } = connect();
await migrate(db);
__setDb(db);
// A day in the factory, in the order it really happens.
await ensureStarterData(LOCAL_COMPANY_ID);
```
(`scripts/device-session.ts:97-102`)

E depois localiza os itens semeados **por prefixo de nome**, não por id:

```ts
const items = await listItems(LOCAL_COMPANY_ID);
const sugar = items.find((i) => i.name.startsWith('Açúcar'));
const pulp  = items.find((i) => i.name.startsWith('Polpa'));
if (!sugar || !pulp) throw new Error('the starter data did not arrive');
…
const palito = items.find((i) => i.name.includes('Palito'));
if (!palito) throw new Error('the starter data has no stick');
```
(`scripts/device-session.ts:104-118`)

Consequência a registrar para quem reconstruir: **renomear `Açúcar cristal`,
`Polpa de morango` ou `Palito de picolé` quebra o `db:verify`.** Os nomes
semeados são, de fato, interface de programa.

Esse script também cria, em cima do exemplo, a grade `Picolé` →
`Tradicional` → `Morango` e um segundo produto,
`Picolé Tradicional de Morango`, com `unitPackagingCents: fromDecimal(0.05)`,
`packagingItems: [{ itemId: palito.id, quantityPerUnit: 1 }]`, `recipeId: null` e
`yieldPerUnit: null` (`scripts/device-session.ts:114-138`) — a lista de embalagem
existe ali para provar que ela atravessa a fila como `jsonb`, e não como string
entre aspas.

`src/notify/facts.ts:10` importa `LOCAL_COMPANY_ID` e o usa direto em sete
consultas dentro de `factsForAlerts(timeZone)` (`:37-50`) — a função **não**
recebe `companyId`. É outro ponto em que a empresa local está costurada no
código, não passada como argumento.

### 13.15 Estados, declarados

**Implementado e chamado por tela**

| coisa | tela |
|---|---|
| `ensureStarterData` | `app/_layout.tsx:58` |
| `restoreStarterData` | `app/settings.tsx:333` |
| `exampleStillHere` | `app/settings.tsx:267` |
| `liveData` | `app/assistant.tsx:98` |
| `simulateFortnight` | `app/settings.tsx:371` |

**Implementado, sem chamador de tela**

| coisa | quem chama |
|---|---|
| `hasSeeded` | só `ensureStarterData` e testes |
| `simulateHistory` | **ninguém** (`src/data/simulate.ts:65`) |
| `markSeededItems`, `markSeeded`, `writeStarterData` | internos de `seed.ts` |

**Planejado / apenas comentado**

- A frase do assistente no livro-razão: `assistantPhrase` existe em
  `recordPurchase`, `recordCount` e no contrato, e **`liveData` não a preenche** —
  quem preenche é a habilidade. As habilidades que escrevem recebem
  `SkillContext.question` para isso (`src/assistant/types.ts:148-157`).
- Login / multi-empresa: `LOCAL_COMPANY_ID` é declarado como ponte “até o login
  chegar” (`src/data/seed.ts:6-11`). Não há tela de login neste código.
- Setup guiado: o docblock de `ensureStarterData` diz que a semente existe
  “because the guided setup is a later phase” (`src/data/seed.ts:27`). O setup
  guiado **NÃO ESTÁ NO CÓDIGO**.

### 13.16 O que não está no código, e eu não vou preencher

- **Nenhuma constante de id para os itens semeados.** Os UUIDs são gerados por
  `newId()` a cada semeadura, inclusive em `restoreStarterData`, que reescreve
  `seeded_items` com ids novos. Não existe id estável do exemplo.
- **Nenhuma versão da semente.** `app_meta` guarda `seeded = '1'` e nada mais:
  não há como saber qual conjunto de dados de exemplo um aparelho recebeu, nem
  migrar de um exemplo antigo para um novo.
- **Nenhuma validação dos números semeados.** Nada no código afirma que
  R$ 496,00 por 40 kg de polpa é um preço plausível; os valores são literais em
  `seed.ts:155-160` sem fonte citada.
- **Nenhuma tradução dos nomes do exemplo.** Registrado como renúncia em
  `src/selectors.test.ts:74-76`; um aparelho em inglês ou espanhol vê
  `Polpa de morango`.
- **Nenhuma semente para o servidor.** `supabase/migrations/` não contém dados
  de exemplo — a semente é só do aparelho, e chega ao servidor pela fila de
  saída como escrita normal.
- **Por que 75 ml por picolé, 2 % de perda na base e 5 % no morango:** os números
  estão em `src/data/seed.ts:191` (`yieldPerUnit: 75`), `:166` (`lossFraction: 0.02`) e
  `:178` (`lossFraction: 0.05`), sem justificativa escrita. NÃO ESTÁ NO CÓDIGO.
- **Por que `Glucose 38DE`:** o `38DE` (dextrose equivalent) não é explicado em
  lugar nenhum do repositório. NÃO ESTÁ NO CÓDIGO.
