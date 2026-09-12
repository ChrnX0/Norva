## 5. Custo, receita e lote

### 5.1 Os dois tipos de número que esta seção inteira depende

Toda aritmética descrita abaixo obedece a uma separação de tipos que existe no
código como *branded types*:

| Tipo | Declaração | Significado | Arredonda? |
|---|---|---|---|
| `Cents` | `number & { readonly __brand: 'Cents' }` (`src/domain/money.ts:5`) | Um valor que alguém paga. Inteiro. | Sim, uma vez, no fim |
| `Rate` | `number & { readonly __brand: 'Rate' }` (`src/domain/money.ts:49`) | Preço por unidade-base, em **centavos fracionários** | **Nunca** |

Funções construtoras e conversoras, com o corpo literal:

| Função | Corpo | Fonte |
|---|---|---|
| `cents(value: number): Cents` | `Math.round(value) as Cents` | `src/domain/money.ts:7-9` |
| `fromDecimal(value: number): Cents` | `Math.round(value * 100) as Cents` | `src/domain/money.ts:11-13` |
| `toDecimal(value: Cents): number` | `value / 100` | `src/domain/money.ts:15-17` |
| `multiplyCents(value, factor)` | `Math.round(value * factor) as Cents` | `src/domain/money.ts:19-21` |
| `rate(pricePerPurchaseUnit, baseUnitsPerPurchaseUnit): Rate` | `if (baseUnitsPerPurchaseUnit <= 0) return 0 as Rate;` então `((pricePerPurchaseUnit * 100) / baseUnitsPerPurchaseUnit) as Rate` | `src/domain/money.ts:52-55` |
| `amountOf(unitRate: Rate, quantity: number): Cents` | `Math.round(unitRate * quantity) as Cents` | `src/domain/money.ts:58-60` |
| `rateFromCents(total: Cents, quantity: number): Rate` | `if (quantity <= 0) return 0 as Rate;` então `(total / quantity) as Rate` | `src/domain/money.ts:62-65` |

O exemplo canônico, transcrito do docblock: *"Strawberry pulp at R$ 12.40/kg is
1.24 cents per gram; forcing that into a whole cent loses 19% of it"*
(`src/domain/money.ts:37-48`). E: `rate(12.40, 1000)` é a forma escrita
(`src/domain/money.ts:51`).

**`allocateCents(total: Cents, parts: number): Cents[]`**
(`src/domain/money.ts:28-35`) — divide em partes iguais sem perder nem inventar
centavo: `base = Math.floor(total / parts)`, `remainder = total - base * parts`,
e o resto é distribuído **um centavo por vez nas primeiras partes**
(`base + (i < remainder ? 1 : 0)`). Teste: `allocateCents(cents(1000), 3)` é
exatamente `[334, 333, 333]` (`src/domain/recipe.test.ts:22-29`).

**`allocateByWeight(total: Cents, weights: readonly number[]): Cents[]`**
(`src/domain/money.ts:82-99`) — é o irmão para partes desiguais, e é o que faz o
detalhamento do `[por quê?]` fechar com o número que ele explica. Algoritmo
literal, **maior resto**:

```
if (weights.length === 0) return [];
sum = Σ weights
if (sum <= 0 || total <= 0) return weights.map(() => cents(0));
exact[i]  = (weights[i] / sum) * total
floors[i] = Math.floor(exact[i])
shortfall = total - Σ floors
byRemainder = índices ordenados por (exact[i] - floor(exact[i])) DESC
para k de 0 até shortfall-1: out[byRemainder[k].index] += 1
```

O docblock diz por que existe: *"a recipe's batch cost was the sum of its lines
after each line had been rounded, so ten ingredients at four tenths of a cent
each summed to nothing while the batch really cost four cents"*
(`src/domain/money.ts:67-81`).

---

### 5.2 O custo médio: média móvel ponderada sobre o livro-razão

Arquivo: `src/domain/cost.ts`. A tese, transcrita do topo do arquivo: *"registering
a purchase is the same event that moves the cost. Nobody ever 'updates the price
of sugar' as a task — they enter the invoice, every recipe that uses sugar
recalculates, and the price history writes itself"* (`src/domain/cost.ts:1-13`).
E a escolha de método, também literal: *"Moving average rather than
last-purchase price, because last price makes margin jump around on a single
unlucky invoice"* (`src/domain/cost.ts:9-12`).

#### 5.2.1 O estado e os eventos

```ts
type StockCostState = {
  baseUnits: number;   // em mãos, na unidade-base do item
  averageRate: Rate;   // média móvel atual, por unidade-base, fracionária
};
```
(`src/domain/cost.ts:17-25`)

```ts
type PurchaseEvent = {
  kind: 'purchase';
  baseUnits: number;    // já convertido para a unidade-base
  totalCents: Cents;    // o que foi pago de fato, com frete se rateado
  at: string;
};
type ConsumptionEvent = { kind: 'consumption'; baseUnits: number; at: string };
type CostEvent = PurchaseEvent | ConsumptionEvent;
const emptyStock: StockCostState = { baseUnits: 0, averageRate: 0 as Rate };
```
(`src/domain/cost.ts:27-44`)

#### 5.2.2 `applyCostEvent` — a fórmula literal

```ts
export function applyCostEvent(state: StockCostState, event: CostEvent): StockCostState {
  if (event.kind === 'purchase') {
    if (event.baseUnits <= 0) return state;

    const heldValue = state.averageRate * Math.max(0, state.baseUnits);
    const newUnits  = Math.max(0, state.baseUnits) + event.baseUnits;
    const newValue  = heldValue + event.totalCents;

    return {
      baseUnits: state.baseUnits + event.baseUnits,
      averageRate: rateFromCents(newValue as Cents, newUnits),
    };
  }
  return { baseUnits: state.baseUnits - event.baseUnits, averageRate: state.averageRate };
}
```
(`src/domain/cost.ts:59-74`)

Três regras que caem daí, cada uma escrita no docblock (`src/domain/cost.ts:46-58`):

1. **Compra mistura na proporção do que já existe.** `média' = (média × em_mãos +
   total_pago) ÷ (em_mãos + quantidade_que_chegou)`.
2. **Consumo NÃO move a média** — só a quantidade. *"that is the definition of the
   method, and it is what keeps the cost stable while stock drains."*
3. **Saldo negativo conta como zero** nos dois termos do numerador e do
   denominador (`Math.max(0, state.baseUnits)`), mas o `baseUnits` devolvido é a
   soma crua (pode continuar negativo). Motivo escrito: *"Consuming more than is
   on hand is allowed rather than rejected: it happens in real operations when a
   count is behind, and refusing it would push people to enter something false."*

Observação de precisão: `newValue` é declarado `as Cents` mas **não é
arredondado** — é `heldValue + totalCents`, onde `heldValue` é fracionário. O
arredondamento só aparece quando alguém chama `amountOf`/`cents`.

#### 5.2.3 `blendRate` — a média entre duas TAXAS, sem passar por dinheiro

```ts
export function blendRate(
  held: { baseUnits: number; averageRate: Rate },
  arriving: { baseUnits: number; rate: Rate },
): Rate {
  const heldUnits = Math.max(0, held.baseUnits);
  const total = heldUnits + arriving.baseUnits;
  if (total <= 0) return arriving.rate;
  return ((held.averageRate * heldUnits + arriving.rate * arriving.baseUnits) / total) as Rate;
}
```
(`src/domain/cost.ts:94-102`)

Por que existe em vez de reusar `applyCostEvent`, transcrito do docblock
(`src/domain/cost.ts:76-93`): *"`applyCostEvent` fala de nota: o que entrou custou
tantos centavos inteiros, porque foi isso que alguém pagou. Uma corrida de
produção não tem nota — o que ela tem é a taxa congelada (consumo mais embalagem,
por unidade), e o valor do lote é taxa vezes quantidade, que é fracionário por
natureza. Forçar esse valor a centavos inteiros para reaproveitar o evento de
compra custou visivelmente: a primeira corrida de 500 unidades saía com média
64,996 contra um custo congelado de 64,99686 — dois números para o mesmo picolé,
no dia em que ele nasceu."*

Casos exercitados (`src/domain/cost.test.ts:81-131`):
- 1.000 a 0,50 misturado com 1.000 a 0,80 → **0,65** (tolerância 1e-9).
- 10.000 a 0,50 com 100 a 0,80 → estritamente entre 0,50 e 0,51.
- 3 unidades a 0,001 com 1 a 0,005 → **0,002** (tolerância 1e-12): *"taxa
  fracionária tem que atravessar sem arredondar"*.
- `baseUnits: -500` com 200 a 0,80 → **0,8** (negativo conta como zero).
- estoque zero com 500 a 1,2 → **1,2** (identidade).

A cicatriz registrada no teste: *"a mutação que troca o corpo inteiro por
`return arriving.rate` atravessava a suíte — e o que ela faz na fábrica é o
estoque antigo passar a valer o preço da corrida de hoje"*
(`src/domain/cost.test.ts:68-80`).

#### 5.2.4 Dobra e preço unitário de uma nota

```ts
export function foldCostEvents(events, from = emptyStock) { return events.reduce(applyCostEvent, from); }
export function purchaseUnitCost(event: PurchaseEvent): Rate { return rateFromCents(event.totalCents, event.baseUnits); }
```
(`src/domain/cost.ts:104-114`)

Teste com números: duas compras de 100.000 g por 47.200 e 59.000 centavos dobram
para `averageRate = 0.531` (4 casas) e `baseUnits = 200_000`
(`src/domain/cost.test.ts:24-38`). Uma nota isolada de 25.000 g por 11.800
centavos dá `0.472` (`src/domain/cost.test.ts:40-51`).

#### 5.2.5 Onde o custo mora no banco

**Aparelho (SQLite, `src/data/db.ts`):**

```sql
CREATE TABLE IF NOT EXISTS item_costs (
  item_id            TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  company_id         TEXT NOT NULL,
  average_rate       REAL NOT NULL DEFAULT 0,   -- centavos fracionários. Nunca arredondado.
  last_rate          REAL,
  on_hand_base_units INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS item_cost_history (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  previous_rate REAL,
  new_rate      REAL NOT NULL,
  observed_at   TEXT NOT NULL
);
```
(`src/data/db.ts:46-63`)

`on_hand_base_units` foi **removida** por migração posterior:
`ALTER TABLE item_costs DROP COLUMN on_hand_base_units;` (`src/data/db.ts:279`).
O motivo está no comentário: a coluna duplicava o que o livro-razão já responde
(`src/data/db.ts:188-192`).

**Servidor (Postgres, `supabase/migrations/0002_recipes.sql:73-96`):**

```sql
create table item_costs (
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  average_rate  numeric(18,8) not null default 0,   -- centavos fracionários
  last_rate     numeric(18,8),
  on_hand_base_units bigint not null default 0,     -- removida na 0009
  updated_at    timestamptz not null default now(),
  primary key (company_id, item_id)
);
create table item_cost_history (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  purchase_line_id uuid references purchase_lines(id) on delete set null,
  previous_rate numeric(18,8),
  new_rate      numeric(18,8) not null,
  observed_at   timestamptz not null default now()
);
create index item_cost_history_idx on item_cost_history (company_id, item_id, observed_at desc);
```

`alter table item_costs drop column on_hand_base_units;`
(`supabase/migrations/0009_average_asks_the_ledger.sql:75`).

**Permissão mora na consulta** (`supabase/migrations/0002_recipes.sql:198-207`):

```sql
create policy item_costs_read on item_costs
  for select using (has_capability(company_id, 'view_cost'));
create policy item_cost_history_read on item_cost_history
  for select using (has_capability(company_id, 'view_cost'));
create policy purchases_read on purchases
  for select using (has_capability(company_id, 'view_cost'));
create policy purchase_lines_read on purchase_lines
  for select using (has_capability(company_id, 'view_cost'));
```

Leitura no aparelho, sem juízo nenhum:

```ts
export async function itemCosts(companyId: string): Promise<ItemCosts> {
  // SELECT item_id, average_rate FROM item_costs WHERE company_id = ?
  return Object.fromEntries(rows.map((r) => [r.item_id, r.average_rate as Rate]));
}
```
(`src/data/repository.ts:278-285`)

#### 5.2.6 O caminho da compra: `recordPurchase`

Assinatura (`src/data/repository.ts:296-329`):

```ts
recordPurchase(companyId: string, input: {
  itemId: string;
  supplierName?: string;
  purchaseQuantity: number;   // o que o comprador digitou: 8 sacos
  baseUnits: number;          // já convertido
  totalCents: Cents;
  orderedAt?: string;
  occurredAt?: string;        // quando a nota entrou de verdade — ver a nota abaixo
  assistantPhrase?: string;
}): Promise<{ previousRate: Rate | null; newRate: Rate }>
```

**`occurredAt` existe por uma cicatriz, e ela amarra dois passos desta lista**
(`src/data/repository.ts:307-317`): *"Nota de compra chega atrasada: o caminhão
descarrega às sete e alguém digita ao meio-dia, ou no dia seguinte. O livro-razão
guarda os dois fatos separados desde a V3 — `occurred_at` é quando aconteceu,
`recorded_at` é quando o aparelho soube —, e até agora esta função escrevia o mesmo
instante nos dois, o que fazia toda compra parecer ter acontecido na hora da
digitação. O histórico de custo herda a mesma data, senão a alta apareceria no dia
errado da home."*

As duas datas são um par. É por isso que o passo 7 grava `observed_at = occurred` e
não `nowIso()`: separar o movimento sem separar o histórico devolve o defeito pela
metade — o saldo passa a cair no dia certo e a capa continua anunciando a alta no dia
da digitação.

Ordem exata dos passos (`src/data/repository.ts:330-462`):

1. Lê `average_rate` de `item_costs` do item.
2. Lê **o saldo do livro-razão**, não um total guardado:
   `SELECT COALESCE(SUM(quantity_base_units), 0) FROM movements WHERE company_id = ? AND item_id = ?`.
3. Monta `before: StockCostState` com esses dois números.
4. `after = applyCostEvent(before, { kind: 'purchase', baseUnits, totalCents, at })`.
5. **Cinco linhas numa transação só**: `purchases`, `purchase_lines`, `movements`
   (kind `'purchase'`), `item_costs` (upsert), `item_cost_history`.
6. `lineRate = rate(input.totalCents / 100, input.baseUnits)` — a taxa **desta
   nota**, congelada em `movements.unit_cost_rate` (`src/data/repository.ts:393`).
7. `item_cost_history` grava `previous_rate = before.averageRate || null` e
   `new_rate = after.averageRate`, com `observed_at = occurred` (a data do fato,
   não a da digitação).
8. Enfileira para o servidor **apenas** `purchases`, `purchase_lines` e
   `movements`. `item_costs` **não é enfileirada**, e a omissão é o desenho.

O comentário que explica a omissão, transcrito (`src/data/repository.ts:435-450`):
*"O average é derivado, e um número derivado tem um autor. Este aparelho computa
o dele para poder mostrar custo sem sinal; o servidor computa o dele a partir
destas mesmas linhas, pela mesma regra. Mandar os dois dá dois autores à figura e
eles discordam — replaying the queue put the server at 0.5605 where the phone
said 0.5310."*

O `id` da linha de compra e o do movimento são **o mesmo**: *"The line and the
movement it causes share one id, because they are one fact seen twice"*
(`src/data/repository.ts:365-367`). E o `movement_group_id` é o **id da nota**
(`purchaseId`), não o da linha (`src/data/repository.ts:404-408`).

#### 5.2.7 O caminho da produção: a média do produto fabricado

`recordProduction` (`src/data/repository.ts:1311-1620`) é o segundo escritor de
`item_costs`. A taxa congelada da corrida:

```ts
const unitCostRate =
  (consumedValue / input.unitsProduced + product.unitPackagingCents) as Rate;
```
(`src/data/repository.ts:1477`)

onde `consumedValue = Σ (rate_do_insumo × quantidade_arredondada)`
(`src/data/repository.ts:1400-1417`), e a quantidade arredonda **uma vez**:
`const quantity = Math.round(baseUnits);` (`src/data/repository.ts:1414`) — porque
`quantity_base_units` é `INTEGER` no aparelho e `bigint` no servidor, e uma
sub-receita divide (o comentário cita `7530,612244897959 g` de açúcar em meio
tacho, `src/data/repository.ts:1402-1413`).

Três decisões literais:

- **Divide pelas unidades que SAÍRAM, não pelo rendimento da ficha.** *"Se o
  tacho rendeu 480 onde a ficha prometia 500, congelar o teórico esconderia a
  perda que acabou de acontecer"* (`src/data/repository.ts:1268-1273`).
- **A embalagem por unidade entra na taxa congelada.** Sem ela, *"a margem de
  toda venda futura sairia inflada exatamente pelo palito e pelo saquinho — R$
  0,05 numa corrida de 500 unidades é R$ 25 que ninguém explicaria depois"*
  (`src/data/repository.ts:1461-1476`).
- **A média do produto usa o saldo de ANTES da corrida**, lido antes de a entrada
  existir, *"senão a corrida entraria na média de si mesma"*
  (`src/data/repository.ts:1564-1584`):

```ts
const mediaNova = blendRate(antes, {
  baseUnits: input.unitsProduced,
  rate: unitCostRate,          // a taxa CONGELADA, já com a embalagem
});
```

Escrita seguinte: upsert em `item_costs` com `average_rate = mediaNova` e
`last_rate = unitCostRate`, mais uma linha em `item_cost_history`
(`src/data/repository.ts:1586-1603`).

O que este caminho conserta, transcrito do docblock
(`src/data/repository.ts:1280-1296`): *"o produto é outro `item_id`, e para ele
não existia autor nenhum… Picolé nunca foi comprado, então nunca teve linha em
`item_costs`, então valia zero. Zero não ficava numa tela só: `stockByPlace`
valorava a loja com 1.466 picolés em 'R$ 0,00'… o insumo SAI do saldo valorado e
o produto entra valendo nada, então o dinheiro evaporava do balanço a cada
corrida."*

Prova numérica no teste (`src/data/repository.test.ts:2062-2088`): uma corrida de
500 e outra de 400 do mesmo tacho, e
`(short.unitCostRate − pack) / (full.unitCostRate − pack) = 500/400`, com
tolerância 1e-9. Comentário: *"A stick is a stick: it costs the same whether the
tub rendered 400 or 500, so it never scales."*

#### 5.2.8 O espelho da regra no servidor

Dois gatilhos, um por origem, e nenhum dos dois recebe `item_costs` pela fila.

**`apply_purchase_to_cost`** — `after insert on purchase_lines`
(`supabase/migrations/0009_average_asks_the_ledger.sql:22-73`; a versão original
está em `supabase/migrations/0002_recipes.sql:224-273`):

```sql
line_rate := new.total_cents::numeric / new.base_units;

select coalesce(sum(quantity_base_units), 0) into held_units
  from movements
 where company_id = new.company_id and item_id = new.item_id and id <> new.id;

select average_rate into held_rate from item_costs
 where company_id = new.company_id and item_id = new.item_id;
if held_rate is null then held_rate := 0; end if;

held_units := greatest(held_units, 0);
new_rate := ((held_rate * held_units) + new.total_cents) / (held_units + new.base_units);
```

O `id <> new.id` funciona porque linha de nota e movimento compartilham o id — *"No
ordering to depend on, and a replay cannot double it"*
(`supabase/migrations/0009_average_asks_the_ledger.sql:15-20`).

**`apply_production_to_cost`** — `after insert on movements`
(`supabase/migrations/0025_what_the_kettle_makes_is_worth_something.sql:26-86`):

```sql
if new.kind <> 'production' or new.quantity_base_units <= 0 or new.unit_cost_rate is null then
  return new;
end if;
-- mesmo "antes" excluindo a própria linha por id
new_rate := ((held_rate * held_units) + (new.unit_cost_rate * new.quantity_base_units))
            / (held_units + new.quantity_base_units);
```

E a linha de histórico do produto entra com `purchase_line_id = null`, *"porque
não houve compra"*
(`supabase/migrations/0025_what_the_kettle_makes_is_worth_something.sql:72-76`).

A fonte é a taxa congelada, não um recálculo da receita: *"Não se recalcula a
receita no servidor — recalcular é convidar os dois lados a divergirem por
arredondamento"*
(`supabase/migrations/0025_what_the_kettle_makes_is_worth_something.sql:18-21`).

#### 5.2.9 `recomputeItemCost` — a dobra completa, para o estorno

`src/data/repository.ts:4344-4416`. Refaz a média do zero, dobrando o livro-razão:

```sql
SELECT m.quantity_base_units, m.unit_cost_rate
  FROM movements m
 WHERE m.company_id = ? AND m.item_id = ?
   AND m.kind <> 'reversal'
   AND <NAO_ESTORNADO>
 ORDER BY m.occurred_at, m.recorded_at, m.id
```

Regra da dobra, lida dos dois escritores e não inventada
(`src/data/repository.ts:4333-4340`): **entrada com taxa mistura; qualquer outra
coisa só move a quantidade.**

```ts
if (l.quantity_base_units > 0 && l.unit_cost_rate !== null) {
  estado = {
    baseUnits: estado.baseUnits + l.quantity_base_units,
    averageRate: blendRate(estado, { baseUnits: l.quantity_base_units, rate: l.unit_cost_rate }),
  };
  ultima = l.unit_cost_rate;
} else {
  estado = { ...estado, baseUnits: estado.baseUnits + l.quantity_base_units };
}
```

`NAO_ESTORNADO` é a cláusula compartilhada por oito consultas
(`src/data/repository.ts:750`):

```sql
NOT EXISTS (SELECT 1 FROM movements rev ... )   -- "o que foi estornado não aconteceu"
```

Escreve `item_cost_history` **só quando o número muda**:
`if (Math.abs(anterior - estado.averageRate) > 1e-12)`
(`src/data/repository.ts:4409-4415`).

O erro que este corpo evita está escrito (`src/data/repository.ts:4353-4362`):
tratar a perna de estorno como saída comum *"deixa o erro dentro para sempre: 500
picolés a 64,99 mais 50 a 614 dá 114,08, e tirar os 50 depois devolve a
quantidade e mantém os 114,08."*

#### 5.2.10 O movimento de preço e o veredito

```ts
export type PriceMove = {
  previousRate: Rate;
  currentRate: Rate;
  change: number;   // fração com sinal: 0.08 é alta de 8%
};

export function priceMove(purchases: readonly PurchaseEvent[]): PriceMove | null {
  if (purchases.length < 2) return null;
  const ordered = [...purchases].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const current  = purchaseUnitCost(ordered[ordered.length - 1]);
  const previous = purchaseUnitCost(ordered[ordered.length - 2]);
  if (previous === 0) return null;
  return { previousRate: previous, currentRate: current, change: (current - previous) / previous };
}
```
(`src/domain/cost.ts:116-139`)

Compara **a última nota contra a anterior**, não contra a média — *"the
comparison the buyer needs at the moment of deciding, standing in front of the
supplier"* (`src/domain/cost.ts:123-127`). Teste com R$ 118 e R$ 124 por 25 kg:
`change = 6/118` ≈ 5,1%, e o comentário registra que *"a média teria dito 2,5%"*
(`src/domain/pipeline.test.ts:96-118`).

**Os dois limiares, e a assimetria deliberada** (`src/domain/cost.ts:219-240`):

```ts
export type PriceVerdict = 'wellAbove' | 'smallChange' | 'cheaper';
export const PRICE_ALARM  = 0.05;
export const PRICE_RELIEF = -0.02;

export function judgePriceChange(change: number): PriceVerdict {
  if (change > PRICE_ALARM)  return 'wellAbove';
  if (change < PRICE_RELIEF) return 'cheaper';
  return 'smallChange';
}
```

Motivo transcrito: *"It takes more than 5% to raise an alarm and only 2% to call
something cheaper, because the costs of being wrong are not symmetric either: a
false alarm teaches the person to ignore alarms, and then the real one arrives
and is ignored too. Good news that turns out to be noise costs nothing."*
(`src/domain/cost.ts:219-232`)

Fronteiras exercitadas com sinal exato (`src/domain/pipeline.test.ts:265-288`):
`judgePriceChange(PRICE_ALARM) === 'smallChange'`,
`judgePriceChange(PRICE_ALARM + 1e-9) === 'wellAbove'`,
`judgePriceChange(PRICE_RELIEF) === 'smallChange'`,
`judgePriceChange(PRICE_RELIEF - 1e-9) === 'cheaper'`;
`judgePriceChange(0.04) === 'smallChange'` e `judgePriceChange(-0.04) === 'cheaper'`.

A cor **não** mora no domínio (`src/components/Chip.tsx:55-68`):

```ts
export function priceSignal(verdict: PriceVerdict | null): Signal {
  if (verdict === 'wellAbove') return 'warning';
  if (verdict === 'cheaper')   return 'ok';
  return 'neutral';
}
```

#### 5.2.11 `ratesBefore` — a comparação que a Lei 3 exige

```ts
export type RateMove = { itemId: string; previousRate: Rate | null; observedAt: string };

export function ratesBefore(
  current: Readonly<Record<string, Rate>>,
  moves: readonly RateMove[],
): Record<string, Rate> {
  const earliest = new Map<string, Rate>();
  for (const move of moves) {
    if (move.previousRate === null) continue;
    const seen = moves.find(
      (other) =>
        other.itemId === move.itemId &&
        other.previousRate !== null &&
        other.observedAt < move.observedAt,
    );
    if (!seen) earliest.set(move.itemId, move.previousRate);
  }
  return { ...current, ...Object.fromEntries(earliest) };
}
```
(`src/domain/cost.ts:169-211`)

Regra explícita: quando um item mexeu mais de uma vez na janela, **vence o mais
antigo**, porque *"The question a briefing answers is 'what did this week do to my
costs', not 'what did the last invoice do', and rolling back only the final step
would quietly under-report a run of rises"* (`src/domain/cost.ts:184-188`). Item
que não mexeu volta idêntico (`src/domain/pipeline.test.ts:190-215` e `256-260`).

**Estado: implementado, sem chamador de tela.** Aparece apenas em
`src/domain/pipeline.test.ts:10,208,244,259`.

#### 5.2.12 Prazo observado e ponto de pedido

```ts
export function observedLeadTimeDays(
  deliveries: readonly { orderedAt: string; receivedAt: string }[],
): number | null {
  if (deliveries.length === 0) return null;
  const days = deliveries.map((d) => (new Date(d.receivedAt).getTime() - new Date(d.orderedAt).getTime()) / 86_400_000);
  return days.reduce((a, b) => a + b, 0) / days.length;
}

export function reorderPoint(dailyConsumption: number, leadTimeDays: number, safetyDays = 2): number {
  return Math.ceil(dailyConsumption * (leadTimeDays + safetyDays));
}
```
(`src/domain/cost.ts:141-166`)

`safetyDays` tem padrão **2**. `Math.ceil` é decisão escrita: *"3.2 sacks of cover
is four sacks to order. Rounding down orders less than the consumption it was
calculated from"* (`src/domain/pipeline.test.ts:290-296`). Valores exercitados:
`reorderPoint(50, 6, 2) === 400`, `reorderPoint(1.6, 1, 1) === 4`,
`reorderPoint(10, 3, 2) === 50`, `reorderPoint(0.1, 1, 0) === 1`.
`observedLeadTimeDays([])` devolve `null`, *"Nothing bought yet is not 'zero
days', which would read as instant delivery"* (`src/domain/cost.test.ts:64-65`).

**Estado das duas: implementadas, sem chamador de tela.** Só testes
(`src/domain/cost.test.ts:53-66`, `src/domain/recipe.test.ts:360-364`,
`src/domain/pipeline.test.ts:290-296`).

---

### 5.3 A receita

Arquivo: `src/domain/recipe.ts`. As quatro coisas que o topo do arquivo declara
como o que o mercado deixa de fora (`src/domain/recipe.ts:1-21`), transcritas:

1. *"Packaging is an ingredient. The stick, the wrapper, the label and the box
   cost real money per unit."*
2. *"Loss is a first-class number. A real ice cream operation loses 3-8% between
   leftover mix, breakage and freezer burn."*
3. *"Sub-recipes cascade. A cream base used by eight flavours must be an
   ingredient of eight recipes."*
4. *"Batch yield is separate from the product conversion. A recipe yields mix (40
   L); a product is a portion of that mix (75 ml)."*

#### 5.3.1 O modelo

```ts
type RecipeLine =
  | { kind: 'item';   itemId: string;   quantity: number }
  | { kind: 'recipe'; recipeId: string; quantity: number };

type Recipe = {
  id: string;
  versionId: string;      // a identidade DESTA versão, não da receita
  version: number;
  effectiveFrom: string;
  lines: RecipeLine[];
  yieldAmount: number;    // o que uma rodada rende, na medida da receita
  yieldUnit: string;      // ml, g, un — escolha do dono no cadastro
  lossFraction: number;   // 0.05 é 5%
};

type ItemCosts = Readonly<Record<string, Rate>>;
```
(`src/domain/recipe.ts:25-70`)

O docblock de `versionId` conta a história do campo que não existia
(`src/domain/recipe.ts:32-41`): *"The line below has promised since the beginning
that production records which version it used — and it was impossible: the query
selected `recipe_versions.id` and then mapped `id: v.recipe_id`, so the version's
own identity never left the data layer and this type had nowhere to put it. A
promise in a doc comment with no field behind it."*

O docblock de `yieldUnit` (`src/domain/recipe.ts:49-57`) explica a palavra
inventada: *"Estava no banco e não chegava até aqui, e a falta dela é a razão de o
aplicativo ter inventado a palavra 'tacho'."*

**Saída da conta:**

```ts
type CostLine = {
  label: string;
  quantity: number;      // quanto um lote usa
  totalCents: Cents;
  share: number;         // fatia do custo do lote, 0..1
};

type RecipeCost = {
  recipeId: string;
  version: number;
  batchCents: Cents;     // custo de um lote inteiro, ANTES da perda
  netYield: number;      // rendimento depois de tirada a perda
  perYieldUnit: Rate;    // custo por unidade de rendimento líquido — fracionário
  lines: CostLine[];
  lossFraction: number;
};
```
(`src/domain/recipe.ts:72-102`)

Sobre `perYieldUnit`, literal: *"A millilitre of mix costs a small fraction of a
cent — rounding here would collapse it to zero and quietly zero out every product
cost in the system"* (`src/domain/recipe.ts:88-93`).

**Esquema no servidor** (`supabase/migrations/0002_recipes.sql:102-146`):

```sql
create table recipes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  yield_amount numeric(14,4) not null check (yield_amount > 0),
  yield_unit text not null default 'ml',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index recipes_company_idx on recipes (company_id) where active;

create table recipe_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  recipe_id uuid not null references recipes(id) on delete cascade,
  version integer not null,
  effective_from date not null default current_date,
  loss_fraction numeric(5,4) not null default 0 check (loss_fraction >= 0 and loss_fraction < 1),
  note text,
  created_at timestamptz not null default now(),
  unique (recipe_id, version)
);

create table recipe_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  recipe_version_id uuid not null references recipe_versions(id) on delete cascade,
  item_id uuid references items(id) on delete restrict,
  sub_recipe_id uuid references recipes(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  constraint one_source check (num_nonnulls(item_id, sub_recipe_id) = 1)
);
create index recipe_lines_version_idx on recipe_lines (recipe_version_id);
```

`recipe_lines.position` **não existe** na 0002 — é acrescentada na
`supabase/migrations/0010_what_the_device_actually_sends.sql:14-16`:
`alter table recipe_lines add column position integer not null default 0;` mais
`create index recipe_lines_order_idx on recipe_lines (recipe_version_id, position);`

A prevenção de ciclo **não** está no banco, por decisão escrita
(`supabase/migrations/0002_recipes.sql:148-151`): *"Cycle prevention lives in the
application… Enforcing it here would need a recursive trigger on every insert;
the app catches it earlier and can tell the user which recipes form the loop."*

**Esquema no aparelho** (`src/data/db.ts:65-96`) espelha os três, com `CHECK
((item_id IS NULL) <> (sub_recipe_id IS NULL))` e `position INTEGER NOT NULL
DEFAULT 0` já na V1.

#### 5.3.2 Versão: como se escreve, e o que ela guarda de verdade

`saveRecipeVersion` (`src/data/repository.ts:1137-1220`), tudo numa transação:

1. Upsert em `recipes`:
   `ON CONFLICT(id) DO UPDATE SET name = excluded.name, yield_amount = excluded.yield_amount, yield_unit = excluded.yield_unit`
   (`src/data/repository.ts:1159-1167`).
2. `SELECT MAX(version) AS v FROM recipe_versions WHERE recipe_id = ?`, então
   `version = (previous?.v ?? 0) + 1` (`src/data/repository.ts:1169-1173`).
3. Insere `recipe_versions` com `effective_from = at.slice(0, 10)` — a data local
   do relógio do aparelho em formato ISO curto (`src/data/repository.ts:1175-1189`).
4. Insere cada `recipe_lines` com `position` = índice na lista
   (`src/data/repository.ts:1191-1209`).
5. Enfileira nesta ordem: `recipes`, `recipe_versions`, depois cada `recipe_lines`
   (`src/data/repository.ts:1214-1219`).

`loadRecipeGraph` (`src/data/repository.ts:1068-1126`) carrega **todas as receitas
na versão mais nova**, com a consulta:

```sql
SELECT v.id, v.recipe_id, v.version, v.effective_from, v.loss_fraction,
       r.yield_amount, r.yield_unit
  FROM recipe_versions v
  JOIN recipes r ON r.id = v.recipe_id
 WHERE v.company_id = ?
   AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2 WHERE v2.recipe_id = v.recipe_id)
```

e as linhas com `SELECT recipe_version_id, item_id, sub_recipe_id, quantity FROM
recipe_lines WHERE company_id = ? ORDER BY position`. O mapeamento devolve
`versionId: v.id` e `id: v.recipe_id` (`src/data/repository.ts:1112-1125`).
Carregar tudo de uma vez é decisão: *"Loading them all at once is what lets a
sub-recipe resolve without a second round trip mid-calculation"*
(`src/data/repository.ts:1063-1066`).

`listRecipes` devolve `RecipeSummary = { id, name, yieldAmount, yieldUnit }`
filtrando `active = 1` e ordenando `name COLLATE NOCASE`
(`src/data/repository.ts:1041-1061`).

`labels(companyId)` junta nomes de `items` e `recipes` num só dicionário, *"so a
cost breakdown reads in words"* (`src/data/repository.ts:1224-1235`).

**LACUNA VERIFICADA — rendimento e unidade NÃO são versionados.** `yield_amount`
e `yield_unit` moram em `recipes`, não em `recipe_versions`
(`supabase/migrations/0002_recipes.sql:102-132`, `src/data/db.ts:65-85`), e
`saveRecipeVersion` os **sobrescreve** a cada nova versão
(`src/data/repository.ts:1162-1165`). `loss_fraction` e as linhas são por versão;
o rendimento não é. Consequência factual: mudar de "rende 40 L" para "rende 45 L"
altera a leitura de **todas** as versões anteriores da mesma receita, inclusive as
que lotes antigos apontam. Não encontrei decisão escrita sobre isso em
`CLAUDE.md`, `docs/insights.md`, `docs/roadmap.md` nem `docs/auditoria.md`.

#### 5.3.3 `costRecipe` — a fórmula literal e o ponto único de arredondamento

```ts
export function costRecipe(
  recipeId: string,
  recipes: Readonly<Record<string, Recipe>>,
  itemCosts: ItemCosts,
  labels: Readonly<Record<string, string>> = {},
  memo: Map<string, RecipeCost> = new Map(),
  stack: string[] = [],
): RecipeCost
```
(`src/domain/recipe.ts:125-132`)

Passo a passo, transcrito do corpo (`src/domain/recipe.ts:133-199`):

```
1. cached = memo.get(recipeId); se existir, devolve.
2. se stack.includes(recipeId) -> throw new RecipeCycleError([...stack, recipeId])
3. recipe = recipes[recipeId]; se não existir -> throw new MissingRecipeError(recipeId)
4. para cada linha:
     se kind === 'item':
        unitRate = itemCosts[line.itemId] ?? 0        // item sem nota vale ZERO
        label    = labels[line.itemId] ?? line.itemId
     se kind === 'recipe':
        sub      = costRecipe(line.recipeId, ..., memo, [...stack, recipeId])
        unitRate = sub.perYieldUnit                    // a taxa líquida da sub-receita
        label    = labels[line.recipeId] ?? line.recipeId
     exact = unitRate * line.quantity                  // NÃO arredonda aqui
     exactTotals.push(exact); batchExact += exact
     lines.push({ label, quantity: line.quantity, totalCents: cents(0), share: 0 })
5. batch = cents(Math.round(batchExact))                // O ÚNICO arredondamento
6. shown = allocateByWeight(batch, exactTotals)
   line.totalCents = shown[i]
   line.share      = batchExact > 0 ? exactTotals[i] / batchExact : 0
7. netYield     = recipe.yieldAmount * (1 - recipe.lossFraction)
8. perYieldUnit = netYield > 0 ? rateFromCents(batch, netYield) : 0
9. memo.set(recipeId, result)
```

O comentário no ponto 4, literal (`src/domain/recipe.ts:160-165`): *"Deliberately
not rounded here. Rounding each line and summing afterwards was the mistake: ten
ingredients at four tenths of a cent each summed to nothing while the batch
really cost four cents… This project's rule is that only the final value rounds,
and the batch is the final value."*

E no ponto 6 (`src/domain/recipe.ts:174-177`): *"The lines shown under the figure
add up to it exactly, because a breakdown that disagrees with the number it
explains is worse than no breakdown at all."*

E no ponto 7 (`src/domain/recipe.ts:184-185`): *"Loss raises the unit cost: the
batch is paid for in full, but less of it reaches a customer."*

**Casos de arredondamento exercitados:**

| Cenário | Entrada | Resultado | Fonte |
|---|---|---|---|
| Dez linhas de 0,4 centavo cada | 10 itens, `quantity: 1`, rate `0.4` | `batchCents === 4` (não zero), e as linhas somam 4 | `src/domain/recipe.test.ts:376-407` |
| Três linhas de 3 × 0,3333 | 2,9997 centavos | `batchCents === 3`, linhas `[1, 1, 1]` | `src/domain/recipe.test.ts:409-433` |
| Linha que arredonda para nada | `big: 1000×1`, `small: 1×0.4` | `lines[1].share > 0` mesmo com `totalCents` zero; as duas fatias somam 1 | `src/domain/recipe.test.ts:435-458` |
| Fatias sempre somam 1 | receita semeada | `Math.abs(Σ share − 1) < 1e-9` | `src/domain/recipe.test.ts:141-145` |

#### 5.3.4 Os dois erros, e por que são tratados de forma diferente

```ts
export class RecipeCycleError extends Error {
  constructor(public readonly path: string[]) {
    super(`Recipe cycle: ${path.join(' -> ')}`);
    this.name = 'RecipeCycleError';
  }
}
export class MissingRecipeError extends Error {
  constructor(public readonly recipeId: string) {
    super(`Recipe not found: ${recipeId}`);
    this.name = 'MissingRecipeError';
  }
}
```
(`src/domain/recipe.ts:104-116`)

- **Sub-receita ausente lança.** *"Silence here is the failure that looks like
  success: the popsicle would simply come out cheaper, and every product standing
  on it with it"* (`src/domain/recipe.test.ts:471-491`).
- **Item sem nota vale zero e NÃO lança.** A assimetria é deliberada: *"A missing
  recipe is structural… An item nobody has bought yet genuinely has no cost, and
  the storeroom screen already says so in words: 'ainda sem nota lançada'.
  Refusing to cost the recipe would make the app unusable on the first day"*
  (`src/domain/recipe.test.ts:493-518`). Números do teste: açúcar a `0.472` ×
  500 g + item sem preço × 500 g → `batchCents === 236`, `lines[1].totalCents === 0`.
- Ciclo lança em vez de travar: *"a recipe that contains itself is a data error
  the user must see, not a spinner that never stops"* (`src/domain/recipe.ts:118-124`);
  teste com `a → b → a` (`src/domain/recipe.test.ts:147-172`).

Frases de tela nos três idiomas (pt-BR em `src/i18n/locales/pt-BR.ts:907-908`):

- `containsItself`: `'Essa receita contém a si mesma: {{path}}'`
- `subRecipeMissing`: `'Sub-receita não encontrada: {{id}}'`

Na lista de receitas, o ciclo vira linha com figura `'—'` e o texto
`t.app.recipes.cycle`, e qualquer outro erro vira `t.app.recipes.missingPrice`
(`app/recipes/index.tsx:124-135`).

#### 5.3.5 A embalagem: as duas metades, e por que são duas

```ts
export function packagingRatePerUnit(
  items: readonly { itemId: string; quantityPerUnit: number }[],
  rates: Readonly<Record<string, number>>,
): number {
  let total = 0;
  for (const linha of items) total += (rates[linha.itemId] ?? 0) * linha.quantityPerUnit;
  return total;
}
```
(`src/domain/recipe.ts:210-217`)

**Nunca arredonda**, e a razão está escrita (`src/domain/recipe.ts:202-209`): *"um
palito a R$ 0,012 arredondado para inteiro é um palito de graça ou um palito pela
metade, e a corrida de quinhentas unidades erra por R$ 6."* Item sem preço vale
zero em vez de derrubar a conta (`src/domain/recipe.test.ts:202-206`).

As duas metades no produto (`src/data/repository.ts:1774-1816`):

| Campo | Tipo | O que é |
|---|---|---|
| `unitPackagingCents` | `Cents` | O que a fábrica **digita**: rótulo, fita, o que nunca virou item |
| `packagingItems` | `{ itemId, name, quantityPerUnit }[]` | Embalagem que **sai do estoque**, cotada pelas notas |

Transcrito: *"uma fábrica que não quer contar palito no estoque digita o valor e
segue. Quem lista os itens vê o custo deles sair do próprio livro-razão, e usa
este campo só para o que sobrou de fora"* (`src/data/repository.ts:1783-1790`).

Normalização na escrita (`src/data/repository.ts:91-103`):

```ts
export function normalizePackagingItems(lines) {
  const somado = new Map<string, number>();
  for (const linha of lines) {
    if (!linha.itemId) continue;
    if (!Number.isFinite(linha.quantityPerUnit) || linha.quantityPerUnit <= 0)
      throw new Error('embalagem por unidade tem que ser mais que zero');
    somado.set(linha.itemId, (somado.get(linha.itemId) ?? 0) + linha.quantityPerUnit);
  }
  return [...somado].map(([itemId, quantityPerUnit]) => ({ itemId, quantityPerUnit }));
}
```

O mesmo item duas vezes **soma**, e o motivo é escrito: *"ninguém pediu dois
palitos por picolé, alguém tocou duas vezes"* (`src/data/repository.ts:85-90`).
A leitura (`parsePackagingItems`, `src/data/repository.ts:105-127`) é defensiva:
JSON inválido vira `[]`, linha sem `itemId` string ou sem `quantityPerUnit`
numérico finito e positivo é descartada.

Persistência: coluna `products.packaging_items TEXT NOT NULL DEFAULT '[]'`
(`src/data/db.ts:560`) — JSON no aparelho.

#### 5.3.6 O custo de uma unidade acabada

```ts
export function costPerProductUnit(
  recipeCost: RecipeCost,
  yieldPerUnit: number,
  unitPackaging: { cents?: Cents; itemsRate?: number } = {},
): Cents {
  return cents(
    recipeCost.perYieldUnit * yieldPerUnit +
      (unitPackaging.itemsRate ?? 0) +
      (unitPackaging.cents ?? 0),
  );
}
```
(`src/domain/recipe.ts:235-245`)

Um `Math.round` só, no fim. O terceiro parâmetro é **objeto** de propósito: *"um
terceiro argumento solto seria esquecido numa das cinco telas que cotam custo, e
a tela passaria a prometer menos do que o livro-razão guarda"*
(`src/domain/recipe.ts:219-234`).

```ts
export function unitsPerBatch(recipeCost: RecipeCost, yieldPerUnit: number): number {
  if (yieldPerUnit <= 0) return 0;
  return Math.floor(recipeCost.netYield / yieldPerUnit);
}
```
(`src/domain/recipe.ts:248-251`) — **`Math.floor`**, sobre o rendimento **líquido**.

```ts
export function compareVersions(
  before: RecipeCost, after: RecipeCost, yieldPerUnit: number,
): { deltaCents: Cents; cheaper: boolean; percent: number } {
  const beforeUnit = costPerProductUnit(before, yieldPerUnit);
  const afterUnit  = costPerProductUnit(after,  yieldPerUnit);
  const delta = cents(afterUnit - beforeUnit);
  return { deltaCents: delta, cheaper: delta < 0, percent: beforeUnit > 0 ? delta / beforeUnit : 0 };
}
```
(`src/domain/recipe.ts:253-271`)

Nota factual: `compareVersions` chama `costPerProductUnit` **sem** o terceiro
argumento, ou seja, compara **só a massa** — embalagem não entra na diferença
entre versões (`src/domain/recipe.ts:263-264`).

#### 5.3.7 O que é "escalar uma receita": `explodeRequirements`

```ts
export function explodeRequirements(
  recipeId: string,
  batches: number,
  recipes: Readonly<Record<string, Recipe>>,
  into: Map<string, number> = new Map(),
  stack: string[] = [],
): Map<string, number> {
  if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);
  const recipe = recipes[recipeId];
  if (!recipe) throw new MissingRecipeError(recipeId);
  const nextStack = [...stack, recipeId];

  for (const line of recipe.lines) {
    if (line.kind === 'item') {
      into.set(line.itemId, (into.get(line.itemId) ?? 0) + line.quantity * batches);
    } else {
      const sub = recipes[line.recipeId];
      if (!sub) throw new MissingRecipeError(line.recipeId);
      const netYield   = sub.yieldAmount * (1 - sub.lossFraction);
      const subBatches = netYield > 0 ? (line.quantity * batches) / netYield : 0;
      explodeRequirements(line.recipeId, subBatches, recipes, into, nextStack);
    }
  }
  return into;
}
```
(`src/domain/recipe.ts:273-307`)

**A conversão que define o escalonamento**, transcrita do comentário
(`src/domain/recipe.ts:298-300`): *"The parent asks for `quantity` units of the
sub-recipe's **net** yield, so convert that into how many sub-batches must
actually be made."* Ou seja:

```
sub_tachos = (quantidade_pedida_da_sub × tachos_do_pai) ÷ (rendimento_da_sub × (1 − perda_da_sub))
```

`batches` é **fracionário por natureza** — o consumo de meio tacho é metade dos
insumos. A tela de produção deduz esse número quando ninguém declara tacho:
`consumedBatches = batches > 0 ? batches : perBatch > 0 ? units / perBatch : 0`
(`app/production/new.tsx:189`), com `perBatch = plannedUnits(recipe, selected, 1)`.

`plannedUnits`, que é a conversão tacho→unidade da tela
(`app/production/new.tsx:111-117`):

```ts
function plannedUnits(recipe: Recipe, product: Product, batches: number): number {
  const net = recipe.yieldAmount * (1 - recipe.lossFraction);
  const perUnit = product.yieldPerUnit ?? 0;
  if (perUnit <= 0) return 0;
  return Math.floor((net / perUnit) * batches);
}
```

Comprovações numéricas (`src/domain/recipe.test.ts:234-245`): três tachos de
morango pedem exatamente `54_000` g de polpa (18 kg × 3), e o açúcar chega
**maior** que os 18.000 g diretos porque a base de creme também usa açúcar.

**A embalagem NÃO entra em `explodeRequirements`.** Ela é somada por fora, por
unidade, tanto na escrita quanto na simulação:

- no livro-razão (`src/data/repository.ts:1379-1382`):
  `for (const linha of product.packagingItems) needed.set(linha.itemId, (needed.get(linha.itemId) ?? 0) + linha.quantityPerUnit * input.unitsProduced)`
- na prévia da tela (`app/production/new.tsx:203-205`), com a mesma conta.

O comentário do repositório é explícito (`src/data/repository.ts:1373-1378`):
*"Rendimento entra na conta pela quantidade PRODUZIDA… meio tacho gasta metade do
açúcar, mas 400 unidades gastam 400 palitos — o tacho que rendeu menos não
devolve palito."*

#### 5.3.8 `shoppingList` — a conta virada do avesso

```ts
type PlanLine = {
  recipeId: string;
  batches: number;
  packaging?: readonly { itemId: string; quantityPerUnit: number }[];
  yieldPerUnit?: number | null;
};
type ShoppingLine = { itemId: string; needed: number; held: number; missing: number };
```
(`src/domain/recipe.ts:310-338`)

```ts
export function shoppingList(plan, recipes, onHand): ShoppingLine[] {
  const needed = new Map<string, number>();
  for (const line of plan) {
    if (!(line.batches > 0)) continue;
    explodeRequirements(line.recipeId, line.batches, recipes, needed);

    const recipe = recipes[line.recipeId];
    const perUnit = line.yieldPerUnit ?? 0;
    if (!recipe || perUnit <= 0 || !line.packaging?.length) continue;

    const units = (recipe.yieldAmount * (1 - recipe.lossFraction) * line.batches) / perUnit;
    for (const wrap of line.packaging)
      needed.set(wrap.itemId, (needed.get(wrap.itemId) ?? 0) + wrap.quantityPerUnit * units);
  }

  return [...needed.entries()]
    .map(([itemId, amount]) => {
      const held = onHand.get(itemId) ?? 0;
      return { itemId, needed: amount, held, missing: Math.max(0, amount - held) };
    })
    .sort((a, b) => b.missing - a.missing);
}
```
(`src/domain/recipe.ts:360-392`)

Decisões escritas (`src/domain/recipe.ts:340-359`):

- Um mapa só para o plano inteiro — vários produtos **somam** no mesmo item.
- Aqui a unidade é **prevista** (rendimento líquido ÷ porção); prever é legítimo
  numa simulação, *"o custo congelado é que não pode prever, porque ele grava o
  que aconteceu."*
- **Devolve fato, nunca frase**: quantidade pedida, quantidade em casa e a
  diferença.
- **Item que sobra continua na lista com `missing` zero.** *"Esconder aqui seria a
  camada de dados decidindo o que a tela pode dizer."*
- Ordem: **o que mais falta primeiro** (`b.missing - a.missing`).

Testes (`src/domain/recipe.test.ts:247-310`): plano de 3 tachos com 60.000 g de
polpa na prateleira → `needed = 54_000`, `missing = 0`; plano com palito por
unidade → `Math.round(needed) === Math.round((40_000 × 0.95)/75)`; plano de zero
tachos devolve `[]`.

#### 5.3.9 Quem chama o motor de receita — estado por chamador

| Chamador | Funções usadas | Fonte |
|---|---|---|
| Lista de receitas | `costRecipe`, `costPerProductUnit`, `packagingRatePerUnit`, `RecipeCycleError` | `app/recipes/index.tsx:19,95,103-105,133` |
| Editor de receita | `costRecipe`, `costPerProductUnit`, `packagingRatePerUnit`, `unitsPerBatch`, `compareVersions`, os dois erros | `app/recipes/[id].tsx:25-31,233-262` |
| Lista de produtos | `costRecipe`, `unitsPerBatch`, `costPerProductUnit`, `packagingRatePerUnit` | `app/products/index.tsx:19,93-106` |
| Cadastro de produto | idem + prévia `mixOnly` | `app/products/new.tsx:43-46,226-241` |
| Compra | `costRecipe`, `costPerProductUnit`, `packagingRatePerUnit`, `applyCostEvent`, `judgePriceChange` | `app/purchase.tsx:26-27,136,161,470-475` |
| Nova produção | `explodeRequirements` | `app/production/new.tsx:37,194` |
| Detalhe do insumo | `judgePriceChange` | `app/inputs/[id].tsx:42,469` |
| Assistente | `costRecipe`, `costPerProductUnit`, `packagingRatePerUnit`, `shoppingList` | `src/assistant/skills.ts:7-10,63-68,302,1025` |
| `WhySheet` (`[por quê?]`) | consome `RecipeCost` | `src/components/WhySheet.tsx:6,30` |
| Repositório | `explodeRequirements` (produção), `applyCostEvent`, `blendRate` | `src/data/repository.ts:1,7,356,1370,1580,4386` |

O editor custeia o **rascunho dentro do grafo real**, com `versionId: DRAFT` e
`version: stored.version + 1` (`app/recipes/[id].tsx:105,211-230`); a constante é
`const DRAFT = '__draft__'` (`app/recipes/[id].tsx:105`). O comentário registra por
que o rascunho não empresta o id da versão anterior: *"apontar uma corrida para
uma fórmula que não é a que ela usou é pior que não apontar"*
(`app/recipes/[id].tsx:214-218`).

Na lista, uma receita que **não** vira produto é cotada **por litro de massa**:
`formatMoney(Math.round(cost.perYieldUnit * 1_000), locale)`
(`app/recipes/index.tsx:108`), com o texto
`perLitre: 'por litro de massa · usada dentro de outras receitas'`
(`src/i18n/locales/pt-BR.ts:892`).

O `[por quê?]` (`src/components/WhySheet.tsx`) mostra, nesta ordem: cada linha
ordenada por `share` decrescente com o dinheiro e a barra da fatia, `Custo do
lote` (`cost.batchCents`), `Perda prevista ({{percent}})` com `sobram {{amount}}`
(`cost.netYield`), e `Custo por unidade de massa`
(`src/components/WhySheet.tsx:37-110`; textos em `src/i18n/locales/pt-BR.ts:1068-1079`).

Textos de produto do editor de receita (`src/i18n/locales/pt-BR.ts:898-939`), que
são decisões de produto e não decoração:

| Chave | Texto pt-BR |
|---|---|
| `overlineVersion` | `ficha técnica · versão {{version}}` |
| `needYield` | `Informe quanto a receita rende de cada vez.` |
| `lossRange` | `A perda tem de ficar entre 0% e 100%.` |
| `unitsPerBatch` | `{{units}} unidades de cada vez · lote de {{batch}}` |
| `cheaperThan` | `{{amount}} por unidade contra a versão {{version}} ({{percent}})` |
| `roundUp` | `Produza {{rounded}} para fechar caixa cheia — sobram {{loose}} soltas em {{units}}.` |
| `lossHint` | `Sobram {{net}} ml de {{gross}}. O lote é pago inteiro, então a perda encarece o que sobra.` |
| `packagingHint` | `Mais {{amount}} de palito e embalagem por unidade.` |
| `saveTitle` | `Salvar versão {{version}}?` |
| `saveBody` | `A versão {{previous}} continua guardada — as produções antigas mantêm o custo delas. {{summary}}` |
| `summaryCheaper` | `Fica {{amount}} por unidade em relação à versão {{version}}.` |
| `summaryDearer` | `Sobe {{amount}} por unidade em relação à versão {{version}}.` |
| `summarySame` | `O custo por unidade não muda.` |

E a conta aberta do cadastro de produto (`src/i18n/locales/pt-BR.ts:1015-1016`):

- `mixPlusBoth`: `{{mix}} de massa + {{stock}} de embalagem do estoque + {{packaging}} digitado`
- `mixPlusPackaging`: `{{mix}} de massa + {{packaging}} de embalagem`

---

### 5.4 O lote

Arquivo: `src/domain/lot.ts` — 72 linhas, três funções, nenhuma dependência.

Duas decisões de negócio no topo do arquivo, transcritas (`src/domain/lot.ts:1-20`):

- **"Um lote por corrida, não por dia nem por produto.** Se o tacho da manhã
  derreteu e o da tarde não, o recall é do tacho da manhã. Agrupar o dia inteiro
  obrigaria a recolher o dobro do que estragou; agrupar por produto, a semana
  inteira."
- **"A validade sai da produção, não da digitação.** Quem está de luva não sabe de
  cabeça que picolé dura seis meses — o produto sabe. O aparelho pergunta uma
  vez, no cadastro, e a partir daí toda corrida nasce com a data pronta. Produto
  sem prazo cadastrado gera lote SEM validade, e isso é correto."

#### 5.4.1 `lotCode` — como o lote é identificado

```ts
export function lotCode(producedOn: string, sequence: number): string {
  const day = producedOn.replaceAll('-', '');
  return `${day}-${String(sequence).padStart(2, '0')}`;
}
```
(`src/domain/lot.ts:33-36`)

Formato: **`AAAAMMDD-NN`** — a data em que se produziu e a ordem da corrida naquele
dia. Onze caracteres. Propriedades declaradas (`src/domain/lot.ts:22-32`): *"Ordena
sozinho, cabe num código de barras curto e uma pessoa lê em voz alta pelo telefone
sem soletrar — que é como um recall acontece de verdade."* E o padrão não é a
única forma: *"A fábrica que já tem padrão próprio vai poder trocar: a tela deixa
editar, e o servidor só exige que seja único dentro da empresa."*

Testes (`src/domain/lot.test.ts:5-13`): `lotCode('2026-09-02', 1) === '20260902-01'`;
`lotCode('2026-09-02', 12) === '20260902-12'`; e ordenar como texto dá a ordem do
tempo: `['20260831-09', '20260902-03', '20260910-01']`.

A sequência conta os lotes **DO DIA**, não do banco inteiro
(`src/data/repository.ts:1500-1506`):

```sql
SELECT COUNT(*) AS n FROM lots WHERE company_id = ? AND produced_on = ?
```
```ts
const code = input.lotCode ?? lotCode(input.producedOn, (runsToday?.n ?? 0) + 1);
```

Comprovado por três corridas seguidas: `20260902-01`, `20260902-02`, e no dia
seguinte `20260903-01` (`src/data/repository.test.ts:1466-1512`).

#### 5.4.2 `expiresOn` — a validade

```ts
export function expiresOn(producedOn: string, shelfLifeDays: number | null): string | null {
  if (shelfLifeDays === null || !Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0) return null;
  const [y, m, d] = producedOn.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + Math.floor(shelfLifeDays)));
  return at.toISOString().slice(0, 10);
}
```
(`src/domain/lot.ts:49-55`)

Regra literal (`src/domain/lot.ts:38-48`): *"Soma dias de calendário sobre a data
local de produção, sem passar por fuso nenhum: validade é um dia combinado, como
a data de um pedido, e não um instante. `2026-09-02` mais 180 dias é
`2027-03-01`, seja onde for que o celular esteja. Nulo quando o produto não tem
prazo cadastrado — e a ausência é dado, não falha."*

Casos exercitados (`src/domain/lot.test.ts:15-29`):

| Entrada | Saída |
|---|---|
| `('2026-09-02', 180)` | `'2027-03-01'` |
| `('2026-09-02', 1)` | `'2026-09-03'` |
| `('2026-12-30', 5)` | `'2027-01-04'` (vira o ano) |
| `('2028-02-27', 3)` | `'2028-03-01'` (ano bissexto) |
| `('2026-09-02', null)` | `null` |
| `('2026-09-02', 0)` | `null` |
| `('2026-09-02', -30)` | `null` |

O prazo mora no **produto**: `products.shelf_life_days`, com
`check (shelf_life_days is null or shelf_life_days > 0)`
(`supabase/migrations/0020_a_lot_and_the_day_it_dies.sql:20-25`) e
`ALTER TABLE products ADD COLUMN shelf_life_days INTEGER;` no aparelho
(`src/data/db.ts:515`). Comentário da coluna, literal: *"Quantos dias o produto
dura depois de feito. Nulo: não vence."*

#### 5.4.3 `daysUntilExpiry` — implementada, SEM CHAMADOR

```ts
export function daysUntilExpiry(expires: string | null, today: string): number | null {
  if (!expires) return null;
  const at = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(expires) - at(today)) / 86_400_000);
}
```
(`src/domain/lot.ts:64-72`)

Devolve **número, não booleano**, e o docblock diz por quê (`src/domain/lot.ts:57-63`):
*"Negativo quer dizer vencido, e essa é a razão de devolver número em vez de
booleano: 'venceu ontem' e 'vence em três dias' pedem tratamentos diferentes na
tela, e quem decide isso é a tela."*

Testes (`src/domain/lot.test.ts:31-42`): `('2026-09-05','2026-09-02') === 3`;
`('2026-09-02','2026-09-02') === 0`; `('2026-09-01','2026-09-02') === -1`;
`(null, '2026-09-02') === null`; `('2027-03-01','2026-09-02') === 180`.

**Estado: implementada, sem nenhum chamador fora do próprio teste.** Busca em
todo o repositório (excluindo `node_modules`, `dist` e `.mutate`) devolve apenas
`src/domain/lot.ts:64` e `src/domain/lot.test.ts:3,32,33,37,38,41`. Os dois
lugares que precisam do número **refazem a conta à mão**:

- `src/notify/facts.ts:103-108`:
  `daysLeft: Math.round((new Date(`${l.expiresOn}T00:00:00.000Z`).getTime() − new Date(`${hoje}T00:00:00.000Z`).getTime()) / 86_400_000)`
- `src/home/Mosaic.tsx:660-670`: usa `daysBetween(nowIso(), `${expiresOn}T00:00:00.000Z`, locale.timeZone)` dividido por 30 para desenhar o `Drain`.

#### 5.4.4 O lote no esquema

**Servidor** (`supabase/migrations/0001_foundation.sql:155-166`):

```sql
create table lots (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete restrict,
  code          text not null,
  produced_on   date,
  expires_on    date,
  created_at    timestamptz not null default now(),
  unique (company_id, code)
);
create index lots_expiry_idx on lots (company_id, expires_on) where expires_on is not null;
```

Mais, por migrações posteriores:
- `create policy lots_resend on lots for update using (private.has_capability(company_id, 'record_production')) with check (...)`
  (`supabase/migrations/0020_a_lot_and_the_day_it_dies.sql:40-42`) — sem ela, *"a
  segunda tentativa é recusada e a fila trava atrás dela"*.
- `alter table lots add column recipe_version_id uuid references recipe_versions(id);`
  e `create index lots_recipe_version_idx on lots (company_id, recipe_version_id) where recipe_version_id is not null;`
  (`supabase/migrations/0026_which_sheet_made_this_one.sql:27-30`).

`movements.lot_id uuid references lots(id) on delete restrict`
(`supabase/migrations/0001_foundation.sql:200`).

**Aparelho** (`src/data/db.ts:499-515`, migração `V11`):

```sql
CREATE TABLE IF NOT EXISTS lots (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  code        TEXT NOT NULL,
  produced_on TEXT,
  expires_on  TEXT,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS lots_code_idx ON lots (company_id, code);
CREATE INDEX IF NOT EXISTS lots_expiry_idx ON lots (company_id, expires_on) WHERE expires_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS lots_item_idx ON lots (company_id, item_id);
ALTER TABLE products ADD COLUMN shelf_life_days INTEGER;
```

E `ALTER TABLE lots ADD COLUMN recipe_version_id TEXT;` na migração `V16`
(`src/data/db.ts:642`).

Diferença conhecida entre os dois lados, escrita (`src/data/db.ts:495-498`):
*"`movements.lot_id` continua sem chave estrangeira aqui, e não por descuido — o
SQLite não acrescenta FK a coluna que já existe. Quem recusa lote fantasma é o
servidor, e a `db:verify` reproduz a fila contra ele."*

#### 5.4.5 Como o lote nasce

Dentro de `recordProduction` (`src/data/repository.ts:1484-1522`), na transação:

```ts
const lotId = newId();
const expires = expiresOn(input.producedOn, product.shelfLifeDays);
// ...
const runsToday = await conn.getFirstAsync(
  `SELECT COUNT(*) AS n FROM lots WHERE company_id = ? AND produced_on = ?`, [companyId, input.producedOn]);
const code = input.lotCode ?? lotCode(input.producedOn, (runsToday?.n ?? 0) + 1);

INSERT INTO lots (id, company_id, item_id, code, produced_on, expires_on, recipe_version_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  -- [lotId, companyId, product.itemId, code, input.producedOn, expires, recipe.versionId, at]
await enqueue(conn, [{ table: 'lots', rowId: lotId }]);
```

**A ordem não é estética** (`src/data/repository.ts:1489-1499`): *"O lote nasce
ANTES das linhas que o citam… o servidor tem chave estrangeira de
`movements.lot_id` para `lots` — que o SQLite daqui não tem… Invertida, a fila
seria aceita aqui e recusada lá, e o defeito só apareceria no primeiro celular
sem sinal."*

**`producedOn` é obrigatório e sem padrão**, por decisão escrita
(`src/data/repository.ts:1329-1341`): *"O livro-razão guarda um INSTANTE
(`occurred_at`); a data do lote é outra coisa — é o dia local, e transformar um no
outro precisa do fuso da fábrica, que esta camada não conhece… meia-noite de 3 de
setembro em Madri é 2 de setembro em UTC, e o lote nasceria com a data de ontem
em metade do mundo."*

**Só a linha de PRODUÇÃO aponta para o lote** (`src/data/repository.ts:1605-1613`):

```ts
await write(productionId, 'production', product.itemId, input.unitsProduced, unitCostRate, lotId);
for (const line of consumed) await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null);
```

Motivo transcrito: *"O consumo tira insumo do estoque, e o lote do insumo é outro
— é o da nota em que ele entrou. Carimbar o lote do picolé na saída da polpa
diria que a polpa pertence ao picolé, e o recall passaria a recolher o saco de
açúcar. **Consumo por lote é PEPS de insumo, que é trabalho da Fase 3.**"*

Retorno da função (`src/data/repository.ts:1246-1255`):

```ts
type ProductionResult = {
  lot: { id: string; code: string; expiresOn: string | null };
  groupId: string;
  unitsProduced: number;
  unitCostRate: Rate;
  consumed: { itemId: string; baseUnits: number; rate: Rate }[];
};
```

Produto sem prazo cadastrado: o lote existe e a validade é `null`, confirmado por
teste (`src/data/repository.test.ts:1592-1620`): `corrida.lot.code === '20260902-01'`,
`corrida.lot.expiresOn === null`, e no banco `expires_on` nulo com `produced_on`
`'2026-09-02'`.

#### 5.4.6 As cinco consultas de lote

| Função | Pergunta que responde | Filtro decisivo | Fonte |
|---|---|---|---|
| `lotsOn(companyId, fromIso, toIso)` | O que **nasceu** numa janela, com o que rendeu | `m.kind = 'production'` + `NAO_ESTORNADO`, `ORDER BY l.code DESC` | `src/data/repository.ts:2673-2712` |
| `expiringSoon(companyId, throughDate, limit = 5, locationId?)` | O que **vence primeiro do que ainda existe** | `expires_on IS NOT NULL AND expires_on <= ?`, `HAVING SUM(...) > 0`, `ORDER BY expires_on ASC` | `src/data/repository.ts:2967-3006` |
| `lotsInStock(companyId, itemId, locationId)` | Os lotes de um item numa sala, **o mais velho primeiro** | `HAVING SUM(...) > 0`, `ORDER BY l.expires_on IS NULL, l.expires_on ASC, l.code ASC` | `src/data/repository.ts:3017-3046` |
| `lotsInRoomAt(companyId, locationId, instantIso)` | O que estava dentro de uma sala **num instante** | `m.occurred_at <= ?` + `HAVING SUM(...) > 0` | `src/data/repository.ts:3077-3113` |
| `findLot(companyId, lotId)` | Um lote, com tudo o que a etiqueta precisa dizer | `LEFT JOIN recipe_versions` e `LEFT JOIN recipes`; devolve `null` se não existir | `src/data/repository.ts:3120-3162` |

Decisões escritas em cada uma:

- **`lotsOn`**: *"A quantidade vem do movimento e não do lote, porque é o
  livro-razão que sabe quanto saiu: o lote é a identidade, o movimento é o fato"*
  (`src/data/repository.ts:2670-2672`).
- **`expiringSoon`**: a soma é **por lugar** quando `locationId` é dado, e da
  empresa quando não é. Motivo: *"A carga leva o lote nas duas pernas… então o
  saldo do lote na EMPRESA não muda quando ele viaja… Somar a empresa faria a
  fábrica continuar sendo avisada de um lote que já foi embora"*
  (`src/data/repository.ts:2955-2966`). Lote esgotado **não aparece**:
  *"avisar sobre a validade de uma caixa que já foi embora é o alerta inventado
  que a fábrica aprende a ignorar."*
- **`lotsInStock`**: *"Lote sem validade vai para o fim, não para o começo: sem
  data não há pressa, e mandar primeiro o que não vence deixaria o que vence
  envelhecendo na câmara"* (`src/data/repository.ts:3014-3016`). É o que permite a
  carga sair sem perguntar de qual lote.
- **`lotsInRoomAt`**: *"A leitura ruim foi às 07:20 e alguém abre a tela às 15:00;
  entre as duas horas uma carga pode ter saído… `occurred_at <= ?` é a diferença
  inteira entre as duas perguntas"* (`src/data/repository.ts:3061-3073`).
- **`findLot`**: devolve `null` em vez de lançar, *"Etiqueta se abre por link, e
  link envelhece"* (`src/data/repository.ts:3115-3119`). As junções da ficha são
  `LEFT` de propósito: *"lote de importação não tem ficha, e ele continua abrindo
  a tela inteira em vez de sumir da consulta"* (`src/data/repository.ts:3131-3132`).

Tipos devolvidos:

```ts
type LotOfDay = {
  id: string; code: string; name: string; baseUnits: number;
  expiresOn: string | null;
  producedOn?: string | null;      // nulo só em lote vindo de importação
  runGroupId?: string | null;      // o ato que criou o lote, para desfazê-lo
  recipeName?: string | null;      // a ficha que rodou
  recipeVersion?: number | null;   // o NÚMERO da versão daquele dia
};
type Expiring = { lotId: string; code: string; name: string; expiresOn: string; baseUnits: number };
type LotInRoom = { lotId: string; code: string; name: string; baseUnits: number; expiresOn: string | null };
```
(`src/data/repository.ts:2632-2658`, `2939-2945`, `3048-3055`)

Sobre `recipeName`/`recipeVersion`, literal (`src/data/repository.ts:2648-2657`):
*"Fato, nunca frase — 'Picolé de morango, versão 3' é a tela quem escreve. E é a
versão daquele dia, não a de hoje: é isso que faz uma fórmula corrigida em março
parar de reescrever o que janeiro custou."*

Chamadores em tela:

| Consulta | Chamador |
|---|---|
| `lotsOn` | `app/(tabs)/production.tsx:15,88` |
| `expiringSoon` | `app/(tabs)/index.tsx:4,183` (capa) e `src/notify/facts.ts:2,47` (alarme) |
| `lotsInStock` | `app/transfer.tsx:22,166` |
| `lotsInRoomAt` | `app/places.tsx:24,485` |
| `findLot` | `app/lots/[id].tsx:11,95` |

Há uma **guarda de fonte** que reprova qualquer tela que prenda o aviso de
validade a uma sala: `src/layers.test.ts:233-269` varre as chamadas com
`/(?<!function )expiringSoon\(([^)]*)\)/g` e acusa toda chamada com quatro
argumentos. A cicatriz está escrita: o filtro por almoxarifado *"silenciava o
aviso EXATAMENTE quando o lote saía"* (`app/(tabs)/index.tsx:176-183`).

#### 5.4.7 O que decide se um lote está vencendo

Não existe um predicado único. A decisão está partida em três camadas, e cada uma
tem seu número:

1. **A janela da consulta.** `expiringSoon(companyId, throughDate, limit)` só
   devolve lotes com `expires_on <= throughDate`.
   - Capa: `const trintaDias = localDate(nowIso(), locale.timeZone, 30);` e
     `expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5)` — **30 dias, 5 lotes**
     (`app/(tabs)/index.tsx:140,183`).
   - Alarme: `const trinta = localDate(nowIso(), timeZone, 30);` e
     `expiringSoon(LOCAL_COMPANY_ID, trinta, 10)` — **30 dias, 10 lotes**
     (`src/notify/facts.ts:32,47`).
   - Motivo do 30 escrito na capa: *"trinta para validade (o que vence depois
     disso não é…"* (`app/(tabs)/index.tsx:136`).
2. **O saldo.** `HAVING SUM(m.quantity_base_units) > 0` — lote esgotado não vence,
   porque não existe mais (`src/data/repository.ts:2991`).
3. **O limiar do alarme.** Em `src/domain/alerts.ts`:

```ts
export type AlertKind = 'insumo' | 'pedido' | 'volume' | 'validade' | 'ambiente';

export const DEFAULT_ALERTS: AlertSettings = {
  on: { insumo: true, pedido: true, volume: false, validade: true, ambiente: true },
  daysAhead: { insumo: 3, pedido: 2, validade: 7 },
  bands: { red: 25, yellow: 40, blue: 80, notifyFull: false },
  minuteOfDay: 7 * 60,
  weekdays: 0,
};
```
(`src/domain/alerts.ts:30`, `106-116`)

```ts
if (settings.on.validade) {
  for (const lote of facts.expiring) {
    if (lote.daysLeft > settings.daysAhead.validade) continue;
    out.push({ kind: 'validade', subjectId: lote.lotId, subject: lote.code, amount: lote.daysLeft });
  }
}
```
(`src/domain/alerts.ts:284-290`)

Ou seja: **o alarme dispara quando `daysLeft <= daysAhead.validade`, e o padrão
desse número é 7** — configurável pela empresa. `daysLeft` pode ser negativo
(vencido) e continua entrando, porque a comparação é `>`.

A ordem de urgência entre alarmes é fixa e o comentário explica
(`src/domain/alerts.ts:305-316`):

```ts
const urgencia: Record<AlertKind, number> = { ambiente: 0, insumo: 1, pedido: 2, validade: 3, volume: 4 };
return out.sort((a, b) => urgencia[a.kind] - urgencia[b.kind] || a.amount - b.amount);
```

*"O ambiente vem PRIMEIRO, e a ordem é o custo do erro: insumo que acaba custa uma
compra atrasada; câmara fora de faixa custa o estoque inteiro numa noite."*

`facts.expiring` é montado em `src/notify/facts.ts:101-108` e traz só
`{ lotId, code, daysLeft }` — o tipo em `src/domain/alerts.ts:208-209` é
`readonly { lotId: string; code: string; daysLeft: number }[]`.

Na capa, os textos (`src/i18n/locales/pt-BR.ts:123-126`):

| Chave | Texto |
|---|---|
| `expiryTitle` | `Vence primeiro` |
| `expiryNone` | `nada vencendo nos próximos 30 dias` |
| `expiryLot` | `{{code}} vence {{date}}` |
| `expiryDays` | `em {{days}}` |

E o desenho `Drain` recebe `share = max(0, dias_restantes) / 30`
(`src/home/Mosaic.tsx:660-672`), com o comentário: *"Quanto falta dos trinta dias
que a peça olha. Sem o desenho, '12 de setembro' pede que a pessoa faça a conta
de cabeça."*

#### 5.4.8 A etiqueta e o QR

`src/domain/qr.ts` — o QR carrega **o código do lote**, não o uuid, e a conta está
escrita (`src/domain/qr.ts:3-36`): *"o código cabe na versão 1, que é uma grade de
21 por 21 — a menor que existe. O uuid, com trinta e seis caracteres, exigiria a
versão 3, 29 por 29: numa etiqueta de quatro centímetros, o módulo cai de 1,9mm
para 1,4mm."* Segundo motivo: *"o código do lote é legível por gente."*

Nível de correção **`'H'`** (30% de recuperação), e a escolha foi medida: *"com
onze caracteres, os quatro níveis — L, M, Q e H — cabem na mesma grade de 21 por
21"* (`src/domain/qr.ts:27-36`). `QUIET_ZONE = 4` módulos, exigidos pelo padrão
(`src/domain/qr.ts:51`). `qrPath` devolve **um caminho SVG só**, porque *"441 nós
de SVG custam a cada quadro num celular barato — que é o que a fábrica compra"*
(`src/domain/qr.ts:53-76`).

A tela da etiqueta (`app/lots/[id].tsx`) mostra o QR com `text={lote.code}`
(`app/lots/[id].tsx:209`), o código em figura grande **duas vezes**, a data de
produção, a validade ou `não vence`, a quantidade, e a ficha que rodou. Textos
(`src/i18n/locales/pt-BR.ts:181-204`):

| Chave | Texto |
|---|---|
| `title` | `Etiqueta do lote` |
| `overline` | `para colar na caixa` |
| `runTitle` | `A corrida` |
| `fromSheet` | `Saiu da ficha {{recipe}}, versão {{version}}.` |
| `fromSheetWhy` | `Corrigir a ficha depois não muda este lote: ele guarda a versão que estava valendo no dia.` |
| `madeOn` | `produzido em {{date}}` |
| `validUntil` | `válido até {{date}}` |
| `noExpiry` | `não vence` |
| `gone` | `Esse lote não está mais aqui.` |
| `why` | `O código aparece duas vezes de propósito: quando a etiqueta congela ou descasca, alguém digita os onze caracteres e a conferência segue.` |
| `reverse` | `Corrigir esta corrida` |
| `reverseTitle` | `Corrigir a corrida {{code}}?` |
| `reverseBody` | `Sai do estoque {{out}}. Volta para o almoxarifado {{back}}. Os dois lançamentos ficam no histórico — nada é apagado.` |

O estorno **não apaga o lote** (`src/data/repository.ts:4436-4441`): *"O lote
continua existindo. Ele é identidade, não quantidade: o saldo dele vai a zero pelo
movimento, e apagar a linha seria a exclusão que a fundação proíbe — além de
quebrar o rastro de uma etiqueta que talvez já esteja colada numa caixa."*
Confirmado por teste (`src/data/repository.test.ts:3093,3299`).

Na transferência, a frase muda conforme o lote tenha ou não validade
(`src/i18n/locales/pt-BR.ts:748-750`):

- `fromLot`: `Sai do lote {{code}}, que vence primeiro.`
- `fromLotNoDate`: `Sai do lote {{code}}.`

---

### 5.5 A versão de receita que a auditoria marcou como ausente

**Estado hoje: FECHADO, nos dois lados, com prova.**

A auditoria de fases mediu na Fase 1 **6 prontos, 9 parciais e 1 ausente**, e o
único ausente era *"a produção gravar a versão de receita que usou"*
(`CLAUDE.md`, seção Faseamento; `docs/roadmap.md:82-83`).

A causa raiz, registrada em `docs/insights.md:1130-1155`: *"O tipo `Recipe` diz,
desde o começo: 'Versions are numbered and kept. Production records which one it
used…'. Era impossível. A consulta `loadRecipeGraph` **seleciona** `v.id` — o id da
versão — e depois mapeia `id: v.recipe_id`. A identidade da versão nunca saía da
camada de dados, e o tipo não tinha onde guardá-la… A auditoria das fases marcou
'a produção grava a versão de receita que usou' como **ausente** e não achou o
motivo — porque o motivo não era uma funcionalidade faltando, era um campo que
sumia no meio do caminho."*

O que fechou, em quatro peças:

1. **O campo.** `Recipe.versionId`, mapeado de `v.id` (`src/domain/recipe.ts:41`,
   `src/data/repository.ts:1116`). O compilador achou os cinco lugares que
   constroem uma receita, inclusive o rascunho da tela
   (`docs/insights.md:1143-1147`).
2. **A coluna durável.** `lots.recipe_version_id`, anulável, com chave estrangeira
   de verdade (`supabase/migrations/0026_which_sheet_made_this_one.sql:27`,
   `src/data/db.ts:642`). O motivo de morar no LOTE e não na corrida
   (`supabase/migrations/0026_which_sheet_made_this_one.sql:14-15`): *"o lote é o
   que sobrevive: ele não é apagado, é o que a etiqueta nomeia, e é por ele que um
   recall começa."* `production_runs` é apagada ao fechar ou cancelar
   (`src/data/repository.ts:2349-2360`, `2400-2405`).
3. **A escrita.** `recordProduction` grava `recipe.versionId`
   (`src/data/repository.ts:1519`), e `openProductionRun` corrigiu o id que
   gravava — *"Aqui entrava `product.recipeId` — o id da receita —, e o nome da
   coluna dizia outra coisa"* (`src/data/repository.ts:2286-2296`).
4. **A leitura.** `findLot` traz `recipeName` e `recipeVersion` por `LEFT JOIN`
   (`src/data/repository.ts:3131-3141`), e a etiqueta escreve
   `Saiu da ficha {{recipe}}, versão {{version}}.` (`app/lots/[id].tsx:259-269`).

**Guardas que impedem a volta:**

- Duas mutações curadas em `scripts/mutate.mjs:198-210`, uma por escritor, com o
  dano por extenso: *"o lote volta a carimbar o id da RECEITA onde vai o da
  versao: corrigir a formula em marco reescreve de que ficha saiu o que janeiro
  produziu"* e *"a corrida aberta grava o id da receita na coluna da versao — um
  uuid legitimo no lugar errado."*
- `db:verify` confere no Postgres de verdade que a coluna atravessou a fila
  (`scripts/verify-migrations.sh:546-553`):
  `select count(*) from lots l join recipe_versions v on v.id = l.recipe_version_id;`
  com a justificativa escrita: *"'Sem uma recusa' não prova que a coluna
  atravessou: uma coluna que o serializador esquecesse de mandar entraria como
  nula e a fila passaria verde."*
- `e2e/flow.mjs:732`: `assert.match(etiqueta, /Saiu da ficha .*, versão \d+\./)`.

**O que continua NÃO IMPLEMENTADO nesta frente, e é verificável:**

- ~~**A versão gravada é a do FECHAMENTO, não a da abertura.**~~ — **CONSERTADO em 12 de
  setembro, e a leitura acima estava certa em cada linha.** `closeProductionRun` não
  repassava o `recipe_version_id` que a abertura já guardava, e `recordProduction`
  recarregava o grafo com `MAX(version)`: quem salvasse a fórmula nova entre abrir e fechar
  fazia o lote carimbar a ficha nova **e congelar a taxa dela**, para um tacho que rodou a
  antiga. Hoje `recordProduction` aceita `fichaCravada` e `loadRecipeGraph` aceita
  `fixar: { recipeId, versionId }`; `closeProductionRun` passa `run.recipeVersionId`.

  **A prova está nos dois sentidos, e a conta é de cabeça:** a ficha de abertura gasta
  1.000 g para 10.000 ml, o produto rende 100 ml por unidade e o açúcar entrou a 0,4 centavo
  por grama — 4 centavos por picolé. Tirando a linha do conserto, o teste reprova dizendo
  *"esperava 4 centavos por unidade, veio 8"*, que é a fórmula nova. A asserção do dinheiro
  vem ANTES da do carimbo de propósito: com o defeito plantado as duas reprovam, e só a
  primeira é lida.

  **Por que uma versão cravada e não um corte por tempo**, que é o que parecia mais geral:
  `recipe_versions.effective_from` é gravado como DATA (`at.slice(0, 10)`), então ele não
  responde "qual fórmula estava em vigor às 23h40"; `created_at` é instante e empata no
  mesmo milissegundo; e derivar o corte de `occurredAt` quebraria o caminho de *"começar
  pelo fim"* — registrar hoje a produção de ontem com a ficha cadastrada hoje passaria a ser
  recusado por não haver versão anterior ao fato. Id é exato e não empata.

  **E a metade que FICA aberta, medida — e ela tem dinheiro dentro, ao contrário do que eu
  escrevi na primeira versão desta nota:** o que se crava é a receita RAIZ, porque é a única
  que a corrida anota. Para linha de ITEM, `explodeRequirements` usa `quantity × batches` e o
  rendimento não entra — então para a ficha PLANA o conserto é completo. Para linha de
  SUB-receita ela usa `sub.yieldAmount * (1 - sub.lossFraction)` para converter *"preciso de
  10.000 ml de base"* em quantas bateladas de base fazer: editar a base entre abrir e fechar
  muda o consumo, e o consumo é a taxa congelada.

  Fechar isso pede um carimbo por sub-receita na abertura — a corrida guarda uma versão só —
  ou a regra de tempo com os três furos acima. E a coluna que esse carimbo leria **já existe**:
  a `V28` versionou `yield_amount`, `yield_unit` e `yield_per_unit` em `recipe_versions`
  dizendo por escrito que entrava *"sem leitor"*, esperando a tela de histórico da ficha. O
  segundo leitor nomeado dela é este.
- **Custear uma versão antiga é impossível pelo caminho existente.**
  `loadRecipeGraph` só carrega a versão mais nova de cada receita
  (`src/data/repository.ts:1081-1085`); não existe carregador por `versionId` nem
  por data. `costRecipe` recebe um grafo, então a função aceitaria — o que falta é
  a consulta. **NÃO IMPLEMENTADO.**
- **`Recipe.effectiveFrom` não é lido por ninguém para escolher versão.** É
  gravado (`src/data/repository.ts:1184`), carregado
  (`src/data/repository.ts:1119`) e exibido em nenhum lugar que eu tenha
  encontrado; nenhuma consulta filtra por ele.
- **Rendimento e unidade não são versionados** — ver 5.3.2.

---

### 5.6 Estado de cada export desta seção

Legenda: **T** = implementado e chamado por tela/repositório; **S** = implementado,
sem chamador fora de teste; **P** = planejado/comentado apenas.

| Export | Arquivo | Estado | Chamador principal |
|---|---|---|---|
| `StockCostState`, `PurchaseEvent`, `ConsumptionEvent`, `CostEvent`, `emptyStock` | `cost.ts:17-44` | T (tipos) | `src/data/repository.ts:1` |
| `applyCostEvent` | `cost.ts:59` | **T** | `src/data/repository.ts:356`, `app/purchase.tsx:136` |
| `blendRate` | `cost.ts:94` | **T** | `src/data/repository.ts:1580`, `4386` |
| `foldCostEvents` | `cost.ts:104` | **S** | só `src/domain/cost.test.ts:30` |
| `purchaseUnitCost` | `cost.ts:112` | **S** (usada internamente por `priceMove`) | `src/domain/cost.test.ts:43` |
| `PriceMove` / `priceMove` | `cost.ts:116-139` | **S** | `src/domain/recipe.test.ts:351`, `src/domain/pipeline.test.ts:115` |
| `observedLeadTimeDays` | `cost.ts:146` | **S** | `src/domain/cost.test.ts:57` |
| `reorderPoint` | `cost.ts:164` | **S** | `src/domain/recipe.test.ts:362`, `pipeline.test.ts:294` |
| `RateMove` / `ratesBefore` | `cost.ts:169-211` | **S** | `src/domain/pipeline.test.ts:208` |
| `PriceVerdict`, `PRICE_ALARM`, `PRICE_RELIEF`, `judgePriceChange` | `cost.ts:217-240` | **T** | `app/purchase.tsx:161`, `app/inputs/[id].tsx:469`, `src/components/Chip.tsx:2` |
| `RecipeLine`, `Recipe`, `ItemCosts`, `CostLine`, `RecipeCost` | `recipe.ts:25-102` | T (tipos) | grafo, telas, `WhySheet` |
| `RecipeCycleError` | `recipe.ts:104` | **T** | `app/recipes/index.tsx:133`, `app/recipes/[id].tsx:256` |
| `MissingRecipeError` | `recipe.ts:111` | **T** | `app/recipes/[id].tsx:262` |
| `costRecipe` | `recipe.ts:125` | **T** | 6 telas + assistente |
| `packagingRatePerUnit` | `recipe.ts:210` | **T** | 5 telas + assistente |
| `costPerProductUnit` | `recipe.ts:235` | **T** | 5 telas + assistente |
| `unitsPerBatch` | `recipe.ts:248` | **T** | `app/products/index.tsx:94`, `app/products/new.tsx:233`, `app/recipes/[id].tsx:243` |
| `compareVersions` | `recipe.ts:258` | **T** | `app/recipes/[id].tsx:252` |
| `explodeRequirements` | `recipe.ts:278` | **T** | `src/data/repository.ts:1370`, `app/production/new.tsx:194` |
| `PlanLine`, `ShoppingLine`, `shoppingList` | `recipe.ts:310-392` | **T** (só assistente) | `src/assistant/skills.ts:1025` |
| `lotCode` | `lot.ts:33` | **T** | `src/data/repository.ts:1506` |
| `expiresOn` | `lot.ts:49` | **T** | `src/data/repository.ts:1485` |
| `daysUntilExpiry` | `lot.ts:64` | **S — sem chamador nenhum** | só `src/domain/lot.test.ts` |
| `qrModules`, `QUIET_ZONE`, `qrPath` | `qr.ts:37-76` | **T** | componente `QrCode` em `app/lots/[id].tsx:209` |

Anotação de fronteira registrada, para não confundir com defeito: o leitor de QR
(seção `scan` do dicionário) existe nos três idiomas **esperando a tela**, e está
declarado como F3 item 1 em `docs/roadmap.md:246-248`.

---

### 5.7 Os números do exemplo semeado — a conta inteira, refeita

Insumos e notas iniciais (`src/data/seed.ts:134-159`):

| Item | Unidade de compra | Base por unidade | Compra semeada | Taxa resultante |
|---|---|---|---|---|
| Polpa de morango | `balde 10 kg` | 10.000 g | 4 baldes por R$ 496 | 1,24 centavo/g |
| Açúcar cristal | `saco 25 kg` | 25.000 g | 2 sacos por R$ 236 | 0,472 centavo/g |
| Leite em pó | `saco 25 kg` | 25.000 g | 1 saco por R$ 722,50 | 2,89 centavos/g |
| Glucose 38DE | `balde 5 kg` | 5.000 g | 2 baldes por R$ 98 | 0,98 centavo/g |
| Palito de picolé | `caixa 5.000` | 5.000 un | 2 caixas por R$ 200 | 2 centavos/un |
| Embalagem plástica | `fardo 2.000` | 2.000 un | 3 fardos por R$ 180 | 3 centavos/un |

(A taxa é `totalCents / baseUnits`, por `recordPurchase`,
`src/data/repository.ts:393`.)

Receitas semeadas (`src/data/seed.ts:160-183`):

```
Base de creme:   yieldAmount 20.000 ml, yieldUnit 'ml', lossFraction 0.02
                 2.000 g leite em pó + 3.000 g açúcar
                 note: 'Base compartilhada pelos sabores de creme.'

Picolé de morango: yieldAmount 40.000 ml, yieldUnit 'ml', lossFraction 0.05
                 18.000 g polpa + 6.000 g açúcar + 1.200 g glucose
                 + 10.000 (ml de rendimento líquido) da Base de creme
```

Produto (`src/data/seed.ts:185-195`): `yieldPerUnit: 75`,
`unitPackagingCents: fromDecimal(0.05)` = **5 centavos**, `packaging: STACKED`,
`shelfLifeDays` não informado (portanto `null`, confirmado em
`src/data/repository.test.ts:1595`).

A conta que o motor faz com esses números:

```
Base de creme
  2.000 × 2,89  = 5.780,0
  3.000 × 0,472 = 1.416,0
  batchExact    = 7.196,0        -> batchCents = 7196
  netYield      = 20.000 × 0,98  = 19.600 ml
  perYieldUnit  = 7196 / 19600   = 0,367142857… centavo/ml

Picolé de morango
  18.000 × 1,24              = 22.320,0
   6.000 × 0,472             =  2.832,0
   1.200 × 0,98              =  1.176,0
  10.000 × 0,367142857…      =  3.671,428571…
  batchExact                 = 29.999,428571…  -> batchCents = 29999
  netYield                   = 40.000 × 0,95   = 38.000 ml
  perYieldUnit               = 29999 / 38000   = 0,789447368… centavo/ml
  massa por unidade          = × 75            = 59,2085…   -> 59 centavos
  + embalagem digitada       = + 5                          -> 64,2085…
  costPerProductUnit         = round(64,2085)               = 64 centavos
  unitsPerBatch              = floor(38.000 / 75)           = 506
```

O `R$ 0,64` é o número que o e2e exige do assistente
(`e2e/flow.mjs:536`: `assert.match(await screen(page), /Picolé de morango custa R\$ 0,64 por unidade/)`)
e que ele exige que a **capa não** mostre mais
(`e2e/flow.mjs:198`: `assert.doesNotMatch(text, /R\$ 0,64/, 'o custo por unidade não mora mais na capa')`).

Com um palito listado em `packagingItems` (`itemsRate = 2`), a mesma unidade sai a
`round(59,2085 + 2 + 5) = 66` — que é o `R$ 0,66` citado no e2e
(`e2e/flow.mjs:1093`).

---

### 5.8 As mutações que guardam esta seção

`npm run mutate` copia o código para `.mutate/` e sabota a cópia
(`CLAUDE.md`, barra de verificação). As mutações que tocam custo, receita e lote,
com o dano escrito por extenso:

| Alvo | Sabotagem | Dano declarado |
|---|---|---|
| `money.ts:59` | `Math.round` → `Math.floor` em `amountOf` | *"todo custo sai um pouco baixo, sempre para o mesmo lado, e a margem sai alta"* (`scripts/mutate.mjs:531-534`) |
| `money.ts:54` | tira o `* 100` de `rate` | *"preço por unidade fica cem vezes menor: o picolé custa quase nada"* (`scripts/mutate.mjs:537-540`) |
| `money.ts:90` | `shortfall = 0` | *"o detalhamento do [por quê?] deixa de somar o número que ele explica"* (`scripts/mutate.mjs:543-546`) |
| `recipe.ts:185` | `(1 - lossFraction)` → `(1 + lossFraction)` | *"a perda barateia o produto em vez de encarecer"* (`scripts/mutate.mjs:549-552`) |
| `recipe.ts:136` | `if (false) throw new RecipeCycleError` | *"receita que se referencia trava o aplicativo em vez de recusar"* (`scripts/mutate.mjs:555-563`) |
| `recipe.ts:139` | `MissingRecipeError` vira `RecipeCost` zerado | *"semi-acabado que sumiu deixa todos os sabores dele mais baratos, calado"* (`scripts/mutate.mjs:565-579`) |
| `recipe.ts:242` | `(unitPackaging.itemsRate ?? 0)` → `0 * (...)` | *"as telas cotam o custo sem a embalagem que sai do estoque"* (`scripts/mutate.mjs:344-350`) |
| `recipe.ts:389` | `missing: Math.max(0, amount - held)` → `missing: amount` | *"a lista de compras volta a dizer o que a receita pede em vez do que falta"* (`scripts/mutate.mjs:175-180`) |
| `recipe.ts:380` | `units = line.batches` | *"o palito e o saquinho entram na lista de compras por TACHO em vez de por unidade"* (`scripts/mutate.mjs:182-187`) |
| `cost.ts:237` | `PRICE_ALARM` → `PRICE_ALARM * 10` | *"a compradora deixa de ser avisada de um aumento de 40%"* (`scripts/mutate.mjs:581-585`) |
| `cost.ts:165` | `Math.ceil` → `Math.floor` em `reorderPoint` | *"o ponto de pedido pede menos do que o consumo, e a fábrica para"* (`scripts/mutate.mjs:587-591`) |
| `cost.ts:101` | corpo de `blendRate` → `return arriving.rate` | *"a media do produto vira o custo da ULTIMA corrida… e o estoque antigo passa a valer o preco de hoje"* (`scripts/mutate.mjs:272-277`) |
| `repository.ts:1580` | `mediaNova = antes.averageRate` | *"o produto fabricado volta a valer o que valia antes da corrida — zero, na primeira — e o dinheiro evapora do balanco a cada tacho"* (`scripts/mutate.mjs:263-271`) |
| `repository.ts:1477` | divide por `input.batches * 500` | *"o custo congela pelo rendimento prometido em vez do que saiu do tacho"* (`scripts/mutate.mjs:718-724`) |
| `repository.ts:1477` | tira `+ product.unitPackagingCents` | *"o palito e o saquinho somem do custo congelado, e toda margem futura sai inflada"* (`scripts/mutate.mjs:725-732`) |
| `repository.ts:1519` | `recipe.versionId` → `product.recipeId` | *"o lote volta a carimbar o id da RECEITA onde vai o da versao"* (`scripts/mutate.mjs:198-204`) |
| `repository.ts:2311` | idem em `production_runs` | *"a corrida aberta grava o id da receita na coluna da versao"* (`scripts/mutate.mjs:205-210`) |
| `repository.ts:1506` | `lotCode(producedOn, 1)` fixo | *"as duas corridas do mesmo dia recebem o mesmo codigo, e recolher uma passa a significar recolher as duas"* (`scripts/mutate.mjs:453-458`) |
| `lot.ts:50` | guarda vira só `!Number.isFinite` | *"produto sem prazo cadastrado passa a vencer no dia em que foi feito, e a camara fria descarta mercadoria boa"* (`scripts/mutate.mjs:460-466`) |
| `repository.ts:1613` | consumo passa a carimbar `lotId` | (linha `scripts/mutate.mjs:447-450`) |
| `repository.ts:1609` | produção deixa de carimbar o lote | (linha `scripts/mutate.mjs:441-444`) |

O que essa lista prova sobre a suíte, registrado em `CLAUDE.md`: na primeira
execução o `mutate` trocou o `Math.round` do `amountOf` por `Math.floor` — *o*
ponto de arredondamento do sistema — e **noventa e dois testes continuaram
verdes**.

---

### 5.9 O que `db:verify` e o `e2e` provam desta seção

**`bash scripts/verify-migrations.sh`** (Postgres descartável):

- **Média móvel, contra o gatilho de verdade** (`scripts/verify-migrations.sh:136-172`):
  duas notas de 100 kg (47.200 e 59.000 centavos) e o Postgres conclui sozinho
  `average_rate` **0.531**, `last_rate` **0.590**, e **2** linhas de
  `item_cost_history` escritas por conta própria.
- **A média do aparelho contra a do servidor** (`scripts/verify-migrations.sh:523-535`):
  a fila do aparelho sobe e o script compara `DEVICE_SUGAR_AVERAGE` com
  `select round(new_rate, 4) from item_cost_history … order by observed_at desc, ctid desc limit 1`.
  O comentário diz o que isso é: *"é a única checagem do projeto que compara duas
  implementações independentes da mesma regra."*
- **A média do PRODUTO** (`scripts/verify-migrations.sh:537-545`):
  `select round(average_rate, 4) from item_costs where item_id = '$PRODUCT'` tem de
  bater com `DEVICE_PRODUCT_AVERAGE`, e falha com *"o servidor não sabe quanto vale
  o que o tacho fez"* se vier vazio.
- **O lote com a ficha** (`scripts/verify-migrations.sh:546-553`), já transcrito em 5.5.
- **Reenvio idempotente** (`scripts/verify-migrations.sh:503-512`): a fila inteira
  sobe duas vezes e o saldo não pode mudar.

**`npm run e2e:fast`** (navegador de verdade), pontos desta seção:

- `e2e/flow.mjs:536` — o assistente diz `Picolé de morango custa R$ 0,64 por unidade`.
- `e2e/flow.mjs:574` — `R$ 0,64 → R$ 0,73` depois de uma nota mais cara.
- `e2e/flow.mjs:710` — a aba do dia mostra `Lotes de hoje`.
- `e2e/flow.mjs:722` — o toque no lote abre `Etiqueta do lote`.
- `e2e/flow.mjs:732` — a etiqueta diz `Saiu da ficha …, versão N.`.
- `e2e/flow.mjs:758` — a corrida aberta mostra o lote com `/\d{8}-\d\d/`.
- `e2e/flow.mjs:963-999` — câmara vazia não lista lote; com lote, a leitura mostra
  o código.
- `e2e/flow.mjs:1085-1104` — a **conta aberta fecha**: a expressão
  `/R\$ ([\d,]+) \| R\$ ([\d,]+) de massa \+ R\$ ([\d,]+) de embalagem do estoque \+ R\$ ([\d,]+) digitado/`
  é lida da tela e o teste exige `total === massa + estoque + digitado` em centavos.

---

### 5.10 Divergências e lacunas achadas na leitura desta seção

Todas verificadas no código, com a linha. Nenhuma é conjectura sobre intenção.

1. **`daysUntilExpiry` não tem chamador**, e a conta que ela faz está duplicada à
   mão em dois lugares (`src/notify/facts.ts:103-108`, `src/home/Mosaic.tsx:660-670`).
   Ver 5.4.3.
2. **Rendimento (`yield_amount`) e unidade (`yield_unit`) não são versionados** e
   são sobrescritos a cada `saveRecipeVersion` (`src/data/repository.ts:1162-1165`).
   O docblock de `Recipe.version` promete que *"historical cost stays correct
   after the formula changes"* (`src/domain/recipe.ts:42-44`) — a promessa vale
   para linhas e perda, não para rendimento. Ver 5.3.2.
3. ~~**`closeProductionRun` descarta `run.recipeVersionId`**~~ — **CONSERTADO em 12 de
   setembro.** Ele passa `fichaCravada: run.recipeVersionId`, e `loadRecipeGraph` aceita a
   versão escolhida. A raiz está cravada; a sub-receita editada no meio continua entrando
   pela mais nova, e o porquê está em 5.4.3. Ver 5.5.
4. **O detalhamento de custo do assistente não fecha quando há embalagem
   listada.** `unit` inclui `itemsRate`, mas o `detail` só lista `Massa`
   (`mix`, sem embalagem) e `Embalagem` (`product.unitPackagingCents`)
   — `src/assistant/skills.ts:63-78`. É a mesma classe de defeito que o e2e
   fecha na tela de cadastro de produto (`e2e/flow.mjs:1091-1104`), sem guarda
   equivalente no assistente.
5. **`compareVersions` compara só a massa**, sem embalagem
   (`src/domain/recipe.ts:263-264`), enquanto a tela que a chama exibe o custo por
   unidade **com** embalagem (`app/recipes/[id].tsx:238-252`). Os dois números da
   mesma tela têm bases diferentes.
6. **`priceMove` não é o que as telas usam.** A tela de compra calcula
   `change = (thisRate − selected.lastRate) / selected.lastRate`
   (`app/purchase.tsx:135-142`) e a de insumo usa
   `(latest.newRate − latest.previousRate) / latest.previousRate` sobre
   `item_cost_history` (`app/inputs/[id].tsx:172-177`). São três definições de
   "quanto mudou" no repositório; só uma delas (`priceMove`) tem teste próprio de
   domínio, e ela é a que ninguém chama.
7. **A subconsulta de versão máxima em `loadRecipeGraph` não filtra
   `company_id`**: `(SELECT MAX(v2.version) FROM recipe_versions v2 WHERE v2.recipe_id = v.recipe_id)`
   (`src/data/repository.ts:1085`). A consulta externa filtra. Não há teste que
   exercite duas empresas com o mesmo `recipe_id`.
8. **`item_costs.on_hand_base_units` ainda existe no `CREATE TABLE` inicial do
   aparelho** (`src/data/db.ts:51`) e é removida por uma migração posterior
   (`src/data/db.ts:279`) — o esquema só é correto depois de aplicada a cadeia
   inteira. Mesma forma no servidor (`supabase/migrations/0002_recipes.sql:79` e
   `0009_average_asks_the_ledger.sql:75`).
9. **Achado ainda aberto da auditoria, dentro deste escopo**: *"a embalagem abaixo
   de meio centavo virando de graça"*, listado entre os treze médios
   (`docs/auditoria.md:224-230`). `packagingRatePerUnit` não arredonda
   (`src/domain/recipe.ts:210-217`) e `costPerProductUnit` arredonda uma vez só
   (`src/domain/recipe.ts:240`), com teste afirmando que meio centavo sobrevive
   (`src/domain/recipe.test.ts:193-206`) — não localizei registro escrito de que o
   achado tenha sido fechado nem de que tenha sido recusado.
10. **Consumo por lote (PEPS de insumo) NÃO IMPLEMENTADO**, e é decisão registrada
    como trabalho da Fase 3 (`src/data/repository.ts:1605-1611`). O lote só é
    carimbado na perna de produção.
