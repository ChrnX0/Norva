## 3. Tipos fundamentais: dinheiro, medida, unidade e número

Quatro módulos, 353 linhas de código somadas, sem nenhuma dependência externa. Todos
os quatro são funções puras: nenhum lê banco, nenhum lança exceção, nenhum escreve
texto para humano.

| arquivo | linhas | responsabilidade | teste | estado |
|---|---|---|---|---|
| `src/domain/money.ts` | 100 | `Cents`, `Rate`, o ponto único de arredondamento, repartição sem perder centavo | `src/domain/money.test.ts` (121 linhas, 8 testes) | 6 de 9 exportações têm chamador de produção |
| `src/domain/measure.ts` | 54 | ler quanto vem dentro de uma embalagem escrita à mão | `src/domain/measure.test.ts` (33 linhas, 3 testes) | 1 exportação, chamada por tela e pelo assistente |
| `src/domain/units.ts` | 109 | hierarquia de embalagem (unidade → caixa → engradado) genérica | `src/domain/units.test.ts` (87 linhas, 5 testes) | 3 de 5 funções com chamador de produção |
| `src/domain/number.ts` | 90 | ler o que a pessoa digitou e escrever de volta sem mentir | `src/domain/number.test.ts` (62 linhas, 6 testes) | 2 exportações, 10 telas chamando |

Nenhum dos quatro importa qualquer outro. `money.ts` não sabe de unidades, `units.ts`
não sabe de dinheiro, `number.ts` não sabe de nada — é a razão pela qual os quatro
rodam sob `node --test` sem mock (`package.json`: `"test": "tsx --test 'src/**/*.test.ts'"`).

---

### 3.1 `src/domain/money.ts` — dinheiro é inteiro, taxa é fracionária

#### 3.1.1 O docblock de abertura, transcrito

> "Money is integer cents. Never a float — 0.1 + 0.2 is not 0.3, and a system whose
> whole point is that the numbers are trustworthy cannot afford that."
> (`src/domain/money.ts:1-4`)

#### 3.1.2 `Cents`

```ts
export type Cents = number & { readonly __brand: 'Cents' };
```
(`src/domain/money.ts:5`)

É um *branded type*: em tempo de execução é um `number` comum, e a marca existe só
para o compilador. Consequências que o leitor precisa saber antes de reconstruir:

- `Cents + Cents` devolve `number`, não `Cents` — a marca se perde em qualquer
  aritmética. O código de tela re-marca com `as Cents` em vez de passar pelo
  construtor: `(data?.lugares ?? []).reduce((n, l) => n + l.valueCents, 0) as Cents`
  (`app/(tabs)/reports.tsx:88`), e o mesmo padrão em `src/home/Mosaic.tsx:704`,
  `src/home/Mosaic.tsx:822`.
- Um `as Cents` **não** arredonda. Só `cents()`, `fromDecimal()`, `multiplyCents()`,
  `amountOf()` e `allocateByWeight()` garantem inteiro.
- `Cents` e `Rate` têm marcas diferentes (`'Cents'` vs `'Rate'`), então passar um no
  lugar do outro não compila. É a única proteção estrutural entre os dois tipos, e
  ela é de compilação, não de execução.

#### 3.1.3 `Rate`

```ts
export type Rate = number & { readonly __brand: 'Rate' };
```
(`src/domain/money.ts:49`)

O docblock inteiro (`src/domain/money.ts:37-48`) é a justificativa de existir do tipo,
e é uma decisão de produto:

> "A unit rate: fractional cents per base unit. This is NOT money and must never be
> rounded to an integer. Strawberry pulp at R$ 12.40/kg is 1.24 cents per gram;
> forcing that into a whole cent loses 19% of it, and the error then multiplies
> through every recipe in the system. Cost per millilitre of mix is smaller still and
> rounds straight to zero. The rule: `Cents` is an amount somebody pays. `Rate` is a
> price per unit. Rates stay fractional all the way through the calculation, and only
> the final amount is rounded - once."

#### 3.1.4 Todas as nove exportações, com assinatura e corpo

| # | assinatura | corpo | arredonda? | linha |
|---|---|---|---|---|
| 1 | `cents(value: number): Cents` | `Math.round(value) as Cents` | sim, meio para cima | `src/domain/money.ts:7-9` |
| 2 | `fromDecimal(value: number): Cents` | `Math.round(value * 100) as Cents` | sim | `src/domain/money.ts:11-13` |
| 3 | `toDecimal(value: Cents): number` | `value / 100` | não | `src/domain/money.ts:15-17` |
| 4 | `multiplyCents(value: Cents, factor: number): Cents` | `Math.round(value * factor) as Cents` | sim | `src/domain/money.ts:19-21` |
| 5 | `allocateCents(total: Cents, parts: number): Cents[]` | piso + resto distribuído 1 a 1 nas primeiras partes | usa `Math.floor` | `src/domain/money.ts:28-35` |
| 6 | `rate(pricePerPurchaseUnit: number, baseUnitsPerPurchaseUnit: number): Rate` | `(price * 100) / baseUnits` | **não** | `src/domain/money.ts:52-55` |
| 7 | `amountOf(unitRate: Rate, quantity: number): Cents` | `Math.round(unitRate * quantity) as Cents` | **sim — este é *o* ponto** | `src/domain/money.ts:58-60` |
| 8 | `rateFromCents(total: Cents, quantity: number): Rate` | `total / quantity` | **não** | `src/domain/money.ts:62-65` |
| 9 | `allocateByWeight(total: Cents, weights: readonly number[]): Cents[]` | maior resto | usa `Math.floor` + distribuição | `src/domain/money.ts:82-99` |

#### 3.1.5 `rate` — a única multiplicação por 100 do módulo

```ts
export function rate(pricePerPurchaseUnit: number, baseUnitsPerPurchaseUnit: number): Rate {
  if (baseUnitsPerPurchaseUnit <= 0) return 0 as Rate;
  return ((pricePerPurchaseUnit * 100) / baseUnitsPerPurchaseUnit) as Rate;
}
```
(`src/domain/money.ts:52-55`)

O primeiro argumento é **reais** (decimal, como a pessoa digita), não centavos: o
comentário canônico é `/** R$ 12.40 per kilo, with 1000 g per kilo, is rate(12.40, 1000). */`
(`src/domain/money.ts:51`). `rate(12.40, 1000)` = 1.24 centavo por grama (verificado:
`rate(12.4, 1000) => 1.24`).

Divisor zero ou negativo devolve `0 as Rate` em vez de `Infinity`/`NaN`
(`src/domain/money.ts:53`) — "a pack with nothing in it has no price per unit"
(`src/domain/money.test.ts:103`). Preço negativo **não** é barrado:
`rate(-5, 1000)` devolve `-0.5` (verificado).

#### 3.1.6 `amountOf` — o ponto único de arredondamento

```ts
/** Turns a rate and a quantity into an amount - the one place rounding happens. */
export function amountOf(unitRate: Rate, quantity: number): Cents {
  return Math.round(unitRate * quantity) as Cents;
}
```
(`src/domain/money.ts:57-60`)

`Math.round` em JavaScript arredonda meio **para +∞**, não para longe do zero. Isso
produz uma assimetria verificada:

| chamada | resultado | por quê |
|---|---|---|
| `amountOf(0.5, 1)` | `1` | meio centavo positivo sobe |
| `amountOf(-0.5, 1)` | `0` | meio centavo negativo vai para zero (`Math.round(-0.5) === -0`) |
| `amountOf(1.5, 1)` | `2` | |
| `amountOf(2.5, 1)` | `3` | não é "banker's rounding" |
| `amountOf(0.4, 1)` | `0` | "and it does not round up either" (`src/domain/money.test.ts:37`) |
| `cents(-10.5)` | `-10` | mesma assimetria em `cents()` |
| `cents(10.5)` | `11` | |

A assimetria em valores negativos **NÃO ESTÁ COBERTA POR TESTE**: `money.test.ts` só
exercita meio centavo positivo (`src/domain/money.test.ts:35`, `src/domain/money.test.ts:119`).

**A cicatriz que criou este teste.** O docblock do arquivo de teste conta o episódio
inteiro (`src/domain/money.test.ts:17-30`):

> "This file exists because of a mutation check: `Math.round` in `amountOf` was
> quietly changed to `Math.floor` and the entire suite - ninety-two tests - stayed
> green. Every fixture happened to land on an exact cent, so the two behaved
> identically and the project's headline rule ("only the final value rounds, once")
> had nothing at all holding it in place. Which direction it rounds is not a detail.
> Flooring drops a fraction of a cent on every single line, always downward, and that
> error compounds in one direction across a recipe: cost comes out low, margin comes
> out high, and somebody prices below cost without a single number ever looking wrong."

O mesmo episódio está registrado em `docs/insights.md:320-360`.

#### 3.1.7 `allocateCents` — repartição em partes iguais

```ts
export function allocateCents(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    (base + (i < remainder ? 1 : 0)) as Cents,
  );
}
```
(`src/domain/money.ts:28-35`)

Docblock (`src/domain/money.ts:23-27`): "Splits an amount across n parts without losing
or inventing a cent. The remainder is spread one cent at a time over the first parts,
so the sum of the result always equals the input exactly."

Comportamento verificado:

| chamada | resultado | soma |
|---|---|---|
| `allocateCents(cents(100), 3)` | `[34, 33, 33]` | 100 |
| `allocateCents(cents(-100), 3)` | `[-33, -33, -34]` | -100 (a sobra cai nas ÚLTIMAS partes quando o total é negativo, porque `Math.floor` desce) |
| `allocateCents(cents(100), 0)` | `[]` | — |

O caso negativo **não tem teste**. `allocateCents` **não tem chamador de produção**:
os únicos usos são `src/domain/money.test.ts:77` e `src/domain/recipe.test.ts:23`
(varredura em todo o repositório, incluindo `app/` e `scripts/`).

#### 3.1.8 `allocateByWeight` — repartição por maior resto

```ts
export function allocateByWeight(total: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) return [];

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => cents(0));

  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map((value) => Math.floor(value));
  const shortfall = total - floors.reduce((a, b) => a + b, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  const out = [...floors];
  for (let k = 0; k < shortfall; k += 1) out[byRemainder[k].index] += 1;

  return out.map((value) => cents(value));
}
```
(`src/domain/money.ts:82-99`)

O docblock é a história do defeito que a criou (`src/domain/money.ts:67-81`):

> "Splits a total across weighted parts without losing or inventing a cent. The
> sibling of `allocateCents`, for the case where the parts are not equal. It exists
> because of a real defect: a recipe's batch cost was the sum of its lines *after each
> line had been rounded*, so ten ingredients at four tenths of a cent each summed to
> nothing while the batch really cost four cents. Every product built on that recipe
> was understated, and the arithmetic looked perfectly reasonable at every step.
> Largest remainder: whatever is left after flooring goes to the parts that lost the
> most in the floor. The result always sums to exactly `total`, which is what lets a
> breakdown be shown next to a figure without the two disagreeing."

Comportamento verificado nas bordas:

| chamada | resultado |
|---|---|
| `allocateByWeight(cents(100), [1,1,1])` | `[34, 33, 33]` |
| `allocateByWeight(cents(7), [90,5,5])` | `[6, 1, 0]` (soma 7) |
| `allocateByWeight(cents(0), [1,2])` | `[0, 0]` |
| `allocateByWeight(cents(10), [])` | `[]` |
| `allocateByWeight(cents(10), [0,0])` | `[0, 0]` |
| `allocateByWeight(cents(-100), [1,1])` | `[0, 0]` — **o total negativo é engolido** por `total <= 0` (`src/domain/money.ts:86`) |
| `allocateByWeight(cents(10), [1,-1])` | `[0, 0]` — soma de pesos zero cai no mesmo guarda |

O caso do total negativo perder o valor **NÃO ESTÁ COBERTO POR TESTE** e não está
comentado no código. Hoje não é alcançável: o único chamador de produção é o custo do
tacho, que é `cents(Math.round(batchExact))` com taxas não negativas
(`src/domain/recipe.ts:177`).

**Único chamador de produção:** `src/domain/recipe.ts:177` — `const shown = allocateByWeight(batch, exactTotals);`,
dentro de `costRecipe`. O comentário ali (`src/domain/recipe.ts:174-176`) é a razão de
ser: "The lines shown under the figure add up to it exactly, because a breakdown that
disagrees with the number it explains is worse than no breakdown at all."

#### 3.1.9 O pipeline de arredondamento do custo de receita, transcrito

É o único lugar do sistema onde a regra "só o valor final arredonda, uma vez" é
exercida de ponta a ponta (`src/domain/recipe.ts:141-186`):

1. `const exactTotals: number[] = []` — "Fractional cents per line, kept fractional
   until the batch is settled" (`src/domain/recipe.ts:143`).
2. Por linha: `const exact = unitRate * line.quantity;` **sem arredondar**
   (`src/domain/recipe.ts:168`). O comentário acima é explícito
   (`src/domain/recipe.ts:161-166`): "Deliberately not rounded here. Rounding each line
   and summing afterwards was the mistake."
3. `lines.push({ ..., totalCents: cents(0), share: 0 })` — a linha nasce com zero e é
   preenchida depois (`src/domain/recipe.ts:169`).
4. `const batch = cents(Math.round(batchExact));` — **o arredondamento único**
   (`src/domain/recipe.ts:172`).
5. `allocateByWeight(batch, exactTotals)` reparte o inteiro pelas linhas
   (`src/domain/recipe.ts:177`).
6. `share` é fracionário e vem do exato, não do repartido:
   `line.share = batchExact > 0 ? exactTotals[index] / batchExact : 0`
   (`src/domain/recipe.ts:180`).
7. O custo por unidade volta a ser `Rate`:
   `const perYieldUnit = netYield > 0 ? rateFromCents(batch, netYield) : (0 as Rate);`
   (`src/domain/recipe.ts:186`).

#### 3.1.10 `Cents` e `Rate` no banco — aparelho e servidor

O contrato é declarado no cabeçalho do esquema local (`src/data/db.ts:12-13`):
"rates are REAL, amounts are INTEGER cents, matching the same split the domain
enforces - a price per gram is not money and must not be rounded".

| coluna | aparelho (SQLite) | servidor (Postgres) | é |
|---|---|---|---|
| `items.purchase_to_base` | `REAL` (`src/data/db.ts:39`) | `numeric(14,4)` (`supabase/migrations/0001_foundation.sql:149`) | fator, fracionário |
| `items.base_unit` | `TEXT NOT NULL DEFAULT 'g'` (`src/data/db.ts:40`) | `text not null default 'un'` (`supabase/migrations/0003_base_unit.sql:19`) | palavra |
| `items.packaging` | `TEXT NOT NULL DEFAULT '[{"id":"unit","perBaseUnit":1}]'` (`src/data/db.ts:41`) | `jsonb not null default '[{"id":"unit","perBaseUnit":1}]'::jsonb` (`supabase/migrations/0001_foundation.sql:144`) | hierarquia |
| `item_costs.average_rate` | `REAL NOT NULL DEFAULT 0` (`src/data/db.ts:50`) | `numeric(18,8) not null default 0` (`supabase/migrations/0002_recipes.sql:61`) | `Rate` |
| `item_costs.last_rate` | `REAL` (`src/data/db.ts:51`) | `numeric(18,8)` (`supabase/migrations/0002_recipes.sql:62`) | `Rate` |
| `item_cost_history.previous_rate` / `new_rate` | `REAL` / `REAL NOT NULL` (`src/data/db.ts:60-61`) | `numeric(18,8)` / `numeric(18,8) not null` (`supabase/migrations/0002_recipes.sql:91-92`) | `Rate` |
| `purchase_lines.total_cents` | `INTEGER NOT NULL` (`src/data/db.ts:124`) | `bigint not null check (total_cents >= 0)` (`supabase/migrations/0002_recipes.sql:53`) | `Cents` |
| `purchase_lines.base_units` | `INTEGER NOT NULL` (`src/data/db.ts:123`) | `bigint not null check (base_units > 0)` (`supabase/migrations/0002_recipes.sql:52`) | quantidade |
| `movements.quantity_base_units` | `INTEGER NOT NULL` (`src/data/db.ts:234`) | `bigint not null` (`supabase/migrations/0001_foundation.sql:195`) | quantidade |
| `movements.unit_cost_rate` | `REAL` (`src/data/db.ts:241`) | `double precision` (`supabase/migrations/0008_ledger_speaks_phase_one.sql:79`) | `Rate` |
| `movements.unit_price_rate` | NÃO ESTÁ NO ESQUEMA LOCAL | `double precision` (`supabase/migrations/0008_ledger_speaks_phase_one.sql:80`) | `Rate` |
| `products.unit_packaging_cents` | `INTEGER NOT NULL DEFAULT 0` (`src/data/db.ts:104`) | `bigint not null default 0` (`supabase/migrations/0002_recipes.sql:166`) | `Cents` |

A nota de precisão do servidor está escrita no topo da migração
(`supabase/migrations/0002_recipes.sql:9-12`):

> "Note on precision: unit costs are numeric, not bigint. Money paid is integer cents,
> but a *rate* is not money - strawberry pulp at R$ 12.40/kg is 1.24 cents per gram,
> and forcing that into a whole cent loses a fifth of it before the first
> multiplication. A millilitre of mix rounds straight to zero."

**A migração 0008 é a cicatriz correspondente.** Ela derrubou `unit_cost_cents bigint`
e `unit_price_cents bigint` e pôs as duas taxas em `double precision`
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:77-80`), com a justificativa
escrita (`supabase/migrations/0008_ledger_speaks_phase_one.sql:60-66`): "`unit_cost_cents
bigint` is a rate stored as money, and a sack of sugar at R$ 118 for 25 kg is 0.472
cents per gram, which as a bigint is 0. Every cheap input would have frozen its cost as
nothing, and margin reports built on it would have looked plausible."

O tipo do domínio levou dias para acompanhar: `src/domain/ledger.ts` declarava
`unitCostCents?: Cents` depois de a 0008 já ter rodado, e sobreviveu porque nenhuma
linha de produção importa o módulo (`docs/insights.md:1080-1099`). Hoje diz
`unitCostRate?: Rate` (`src/domain/ledger.ts:114`), com o docblock explicando por quê
(`src/domain/ledger.ts:98-113`).

**A mesma aritmética escrita três vezes, de propósito, e as três iguais:**

| onde | expressão |
|---|---|
| domínio | `rateFromCents(total, quantity)` = `total / quantity` (`src/domain/money.ts:64`) |
| aparelho, migração de retrofit | `CASE WHEN l.base_units > 0 THEN CAST(l.total_cents AS REAL) / l.base_units END` (`src/data/db.ts:274-276`) |
| servidor, gatilho | `line_rate := new.total_cents::numeric / new.base_units;` (`supabase/migrations/0002_recipes.sql:236`, repetido em `supabase/migrations/0009_average_asks_the_ledger.sql:34`) |

O comentário do retrofit diz isso em voz alta (`src/data/db.ts:271-273`): "The same
arithmetic rateFromCents does: cents over base units. Both sides are already in their
smallest unit, so nothing is converted and nothing is rounded - a rate is not money."

A média móvel também existe duas vezes, e as duas fórmulas são idênticas:
`((held_rate * held_units) + new.total_cents) / (held_units + new.base_units)` no
servidor (`supabase/migrations/0002_recipes.sql:253`) contra
`rateFromCents((averageRate * heldUnits + totalCents) as Cents, heldUnits + baseUnits)`
no domínio (`src/domain/cost.ts:63-69`). Ambas tratam estoque negativo como zero:
`held_units := greatest(held_units, 0)` (`supabase/migrations/0002_recipes.sql:252`) e
`Math.max(0, state.baseUnits)` (`src/domain/cost.ts:63-64`).

#### 3.1.11 Quem chama cada função de `money.ts`

| função | chamador de produção | estado |
|---|---|---|
| `cents` | `src/data/repository.ts:822`, `src/data/repository.ts:830`, `src/data/repository.ts:2226`, `src/domain/recipe.ts:169`, `src/domain/recipe.ts:172`, `src/data/simulate.ts:151`; re-exportado em `src/data/repository.ts:1242` | **implementado e alcançado por tela** |
| `fromDecimal` | `app/inputs/new.tsx:17`, `app/products/new.tsx:41`, `app/purchase.tsx:131`, `src/assistant/skills.ts:350`, `src/data/seed.ts:10` | **implementado e chamado por tela** |
| `toDecimal` | nenhum | **implementado, sem chamador** (só `src/domain/money.test.ts:68`) |
| `multiplyCents` | nenhum | **implementado, sem chamador** (só `src/domain/money.test.ts:117-120`) |
| `allocateCents` | nenhum | **implementado, sem chamador** (só testes) |
| `rate` | `src/data/repository.ts:398`, `app/inputs/new.tsx:202`, `app/purchase.tsx:135` | **implementado e chamado por tela** |
| `amountOf` | `src/data/repository.ts:976` (`deltaCents` da contagem) | **implementado e alcançado por tela** |
| `rateFromCents` | `src/domain/cost.ts:69`, `src/domain/cost.ts:113`, `src/domain/recipe.ts:186` | **implementado e alcançado por tela** |
| `allocateByWeight` | `src/domain/recipe.ts:177` | **implementado e alcançado por tela** |
| tipo `Cents` | `src/assistant/types.ts:104`, `src/home/Mosaic.tsx:30`, `app/(tabs)/reports.tsx:25`, `app/recipes/[id].tsx:97` | em uso |
| tipo `Rate` | `src/domain/ledger.ts:114`, `src/domain/cost.ts:24`, `src/data/repository.ts:54`, `src/data/repository.ts:1253` | em uso |

Curiosidade de arquitetura: `src/data/repository.ts:398` faz
`rate(input.totalCents / 100, input.baseUnits)` — divide por 100 para depois `rate()`
multiplicar por 100 de novo. O resultado é exatamente `totalCents / baseUnits`, ou
seja, `rateFromCents`. **Duas rotas para o mesmo número**, e nenhum comentário
registrando a escolha.

#### 3.1.12 O que morde `money.ts` no `npm run mutate`

São 107 mutações curadas no total (`scripts/mutate.mjs`), quatro delas em `money.ts`:

| mutação | `hurts` (a frase da fábrica) | linha |
|---|---|---|
| `Math.round(unitRate * quantity)` → `Math.floor(...)` | "todo custo sai um pouco baixo, sempre para o mesmo lado, e a margem sai alta" | `scripts/mutate.mjs:531-535` |
| `((price * 100) / baseUnits)` → `(price / baseUnits)` | "preço por unidade fica cem vezes menor: o picolé custa quase nada" | `scripts/mutate.mjs:537-541` |
| `const shortfall = total - floors.reduce(...)` → `const shortfall = 0` | "o detalhamento do [por quê?] deixa de somar o número que ele explica" | `scripts/mutate.mjs:543-547` |
| `Math.round(value * factor)` → `Math.trunc(value * factor)` (em `multiplyCents`) | "multiplicar dinheiro passa a cortar em vez de arredondar, sempre para baixo" | `scripts/mutate.mjs:671-675` |

Uma mutação do SQL de retrofit também guarda a fronteira taxa/dinheiro:
`CAST(l.total_cents AS REAL) / l.base_units` → `CAST(l.total_cents AS REAL) / 100.0 / l.base_units`
(`scripts/mutate.mjs:616-617`).

#### 3.1.13 Os casos de teste mais reveladores de `money.test.ts`

| teste | asserção-chave | o que ela pega |
|---|---|---|
| "the amount rounds to nearest, and not downward" | `amountOf(0.5, 1) === 1`; `amountOf(0.125, 5) === 1`; `amountOf(0.4, 1) === 0` | direção do arredondamento nos dois sentidos (`src/domain/money.test.ts:32-42`) |
| idem | `amountOf(0.472, 1_233) === 582` e `amountOf(0.472, 1_235) === 583` | açúcar real a 0,472 c/g em quantidade não redonda (`src/domain/money.test.ts:40-41`) |
| "rounding never accumulates in one direction across many lines" | dez linhas de `amountOf(0.51, 1)` somam `10` | com piso somariam zero (`src/domain/money.test.ts:44-53`) |
| "a rate is fractional cents, and stays fractional" | `Math.abs(rate(12.4, 1000) - 1.24) < 1e-12` **e** `Math.round(pulp) !== pulp` | a segunda asserção é a que impede o tipo de virar inteiro (`src/domain/money.test.ts:55-63`) |
| "money in and money out are the same number" | `fromDecimal(118.35) === 11_835`; `toDecimal(...) === 118.35`; `amountOf(rateFromCents(11835, 25000), 25000) === 11835` | ida e volta pela taxa: "the whole sack costs what was paid for it" (`src/domain/money.test.ts:65-73`) |
| "splitting a total never invents or loses a cent" | `allocateCents(100, 3)` é exatamente `[34,33,33]`; `allocateByWeight(7, [90,5,5])` soma 7 | forma **e** soma (`src/domain/money.test.ts:75-97`) |
| "nothing to split is nothing, not a crash" | `rate(12.4, 0) === 0`; `rateFromCents(100, 0) === 0` | divisão por zero devolve zero, não `Infinity` (`src/domain/money.test.ts:99-105`) |
| "a Cents value is always whole" | `cents(10.6) === 11` | o construtor impõe o inteiro (`src/domain/money.test.ts:107-110`) |
| "multiplying money rounds once, at the end, and never drifts" | `multiplyCents(1000, 0.333) === 333`; `multiplyCents(1000, 1/3) === 333`; `multiplyCents(5, 0.5) === 3` | "half of five cents rounds up, once" (`src/domain/money.test.ts:112-121`) |

---

### 3.2 `src/domain/measure.ts` — ler quanto vem dentro da embalagem

#### 3.2.1 Por que o módulo existe (docblock transcrito)

`src/domain/measure.ts:1-14`:

> "Reading a quantity out of the way somebody writes a package. A person who buys
> sugar writes "saco 25 kg", because that is what is printed on the sack. The app then
> asked them how many grams that is - 25000 - which is arithmetic the system can do
> and the person should not have to. Law 1 of this project: never ask for what can be
> deduced. Deliberately tiny. It knows mass and volume in the two scales a factory
> actually writes, and nothing else: no ounces, no cups, no guessing. Anything it
> cannot read with certainty returns null, and the field stays empty for the person to
> fill - a wrong guess in a conversion factor is worse than no guess, because every
> cost in the product is built on it."

A mesma história em `docs/insights.md:850-877`. O campo "quanto vem dentro" ainda
carrega `placeholder="25000"` como dica (`app/inputs/new.tsx:424`); o que mudou foi ele
deixar de ser a única fonte do número.

#### 3.2.2 A tabela `SCALES` inteira, transcrita literalmente

```ts
/** How many base units one written unit is worth, per base unit. */
const SCALES: Record<string, Record<string, number>> = {
  g: { g: 1, grama: 1, gramas: 1, kg: 1000, quilo: 1000, quilos: 1000, kilo: 1000, kilos: 1000 },
  ml: { ml: 1, mililitro: 1, mililitros: 1, l: 1000, litro: 1000, litros: 1000, lt: 1000 },
  un: { un: 1, und: 1, unidade: 1, unidades: 1, pc: 1, peca: 1, pecas: 1 },
};
```
(`src/domain/measure.ts:16-21`)

Desdobrada, é a lista completa de unidades que o sistema sabe ler:

| família (unidade base aceita) | palavra escrita | fator (em unidades base) |
|---|---|---|
| `g` (massa, base = grama) | `g` | 1 |
| `g` | `grama` | 1 |
| `g` | `gramas` | 1 |
| `g` | `kg` | 1000 |
| `g` | `quilo` | 1000 |
| `g` | `quilos` | 1000 |
| `g` | `kilo` | 1000 |
| `g` | `kilos` | 1000 |
| `ml` (volume, base = mililitro) | `ml` | 1 |
| `ml` | `mililitro` | 1 |
| `ml` | `mililitros` | 1 |
| `ml` | `l` | 1000 |
| `ml` | `litro` | 1000 |
| `ml` | `litros` | 1000 |
| `ml` | `lt` | 1000 |
| `un` (contagem, base = unidade) | `un` | 1 |
| `un` | `und` | 1 |
| `un` | `unidade` | 1 |
| `un` | `unidades` | 1 |
| `un` | `pc` | 1 |
| `un` | `peca` | 1 |
| `un` | `pecas` | 1 |

Três famílias, 22 grafias. **Não existe conversão entre famílias** — não há
massa↔volume (nem com densidade), e a chave da família é a unidade base do item.
Unidades imperiais, `oz`, `lb`, copos e colheres: **NÃO ESTÃO NO CÓDIGO**, por decisão
escrita (`src/domain/measure.ts:10-11`).

Só `g`, `ml` e `un` são unidades base válidas. Verificado: `packSize('saco 25 kg', 'kg')`
é `null`, e `packSize('saco 25 kg', 'unidade')` é `null` — `kg` e `unidade` são
*grafias* dentro de uma família, não *chaves* de família.

#### 3.2.3 `strip` — a normalização

```ts
const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
```
(`src/domain/measure.ts:23-27`)

No arquivo, a faixa de acentos combinantes está escrita com os **caracteres literais**
U+0300 a U+036F, não com escapes `\u` (verificado por `od -c`: bytes `314 200` a
`315 257`). Em `src/assistant/text.ts:17` a mesma faixa aparece escapada — duas
grafias do mesmo intervalo no repositório.

Efeito: `packSize('peça 3 un', 'un')` é `3`, `packSize('SACO 25 KG', 'g')` é `25000`,
`packSize('saco 25kg', 'G')` é `25000` (verificados).

#### 3.2.4 `packSize` — a única exportação, linha por linha

```ts
export function packSize(packageName: string, baseUnit: string): number | null {
  const scale = SCALES[strip(baseUnit).trim()];
  if (!scale) return null;

  // A number, then optional space, then a word - "25kg", "25 kg", "1,5 L".
  const matches = [...strip(packageName).matchAll(/(\d+(?:[.,]\d+)?)\s*([a-z]+)/g)];
  if (matches.length !== 1) return null; // two numbers is ambiguous, not clever

  const [, digits, written] = matches[0];
  const factor = scale[written];
  if (factor === undefined) return null;

  const amount = Number(digits.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const total = amount * factor;
  // A fractional base unit means the base unit is wrong, not that the answer is
  // 2.5 grams of something. Refuse rather than round somebody's cost.
  return Number.isInteger(total) ? total : null;
}
```
(`src/domain/measure.ts:35-53`, docblock em `src/domain/measure.ts:29-34`)

Os cinco portões de recusa, em ordem:

| # | condição | linha | devolve |
|---|---|---|---|
| 1 | unidade base fora de `g`/`ml`/`un` | `src/domain/measure.ts:36-37` | `null` |
| 2 | número de casamentos "dígitos + palavra" diferente de exatamente 1 | `src/domain/measure.ts:40-41` | `null` |
| 3 | palavra não está na família daquela unidade base | `src/domain/measure.ts:44-45` | `null` |
| 4 | quantidade não finita ou ≤ 0 | `src/domain/measure.ts:47-48` | `null` |
| 5 | total não é inteiro | `src/domain/measure.ts:50-53` | `null` |

Observações que só aparecem executando (verificadas):

- A regex `(\d+(?:[.,]\d+)?)` **não captura sinal**, então `packSize('saco -25 kg', 'g')`
  devolve `25000`: o menos é ignorado em silêncio. Sem teste, sem comentário.
- O separador decimal aqui é **sempre decimal**, vírgula ou ponto:
  `packSize('1,5 kg', 'g') === 1500` e `packSize('1.5 kg', 'g') === 1500`.
  Por consequência, `packSize('caixa 1.500 ml', 'ml')` é `null` (leu 1,5 ml, que não é
  inteiro) enquanto `parseTyped('1.500')` é `1500`. **Os dois leitores de número do app
  discordam sobre a mesma grafia**, e a divergência não tem teste nem comentário.
  Ela não é alcançável hoje pelo caminho da tela: `packSize` lê o *nome da embalagem*
  e `parseTyped` lê *campos numéricos*.
- `Number(digits.replace(',', '.'))` troca só a **primeira** vírgula; a regex não
  admite duas, então não há caso alcançável.
- Nome de embalagem sem letra depois do número não casa: `packSize('fardo 2.000', 'un')`
  e `packSize('caixa 5.000', 'un')` são `null` — e esses são exatamente os nomes de
  embalagem que o `seed.ts` usa (`src/data/seed.ts:142-143`), então o campo nasce vazio
  para eles.
- `packSize('', 'g')` é `null`; a função nunca lança.

#### 3.2.5 Os dois chamadores

**Tela (implementado e chamado por tela):** `app/inputs/new.tsx` usa `packSize` duas
vezes, para dois papéis diferentes.

1. **Preenchimento** (`app/inputs/new.tsx:181`):
   `const deduced = factorTyped ? null : packSize(next, baseUnit);` — só preenche o
   campo "quanto vem dentro" se a pessoa ainda **não** o digitou (flag `factorTyped`,
   `app/inputs/new.tsx:180`, `app/inputs/new.tsx:184-187`). O valor entra no campo como
   `String(deduced)` (`app/inputs/new.tsx:182`).
2. **Conferência** (`app/inputs/new.tsx:238-250`): a mesma função relê a embalagem e
   compara com o que está no campo, com tolerância de meia unidade base
   (`Math.abs(lido - parsed.factor) < 0.5`, `app/inputs/new.tsx:240`). Três estados,
   com texto de produto:
   - ilegível → `mathCloses`: pt-BR "A conta fecha" (`src/i18n/locales/pt-BR.ts:572`),
     en "The math adds up" (`src/i18n/locales/en.ts:513`), es "La cuenta cierra"
     (`src/i18n/locales/es.ts:518`);
   - legível e igual → `conversionOk`: "Conversão confere" / "The conversion checks
     out" / "La conversión cuadra" (`src/i18n/locales/pt-BR.ts:570`,
     `src/i18n/locales/en.ts:512`, `src/i18n/locales/es.ts:517`);
   - legível e diferente → `conversionDiffers`, um **aviso, não um bloqueio**:
     "A embalagem diz {{pack}} {{unit}}, o campo diz {{typed}}. Confira."
     (`src/i18n/locales/pt-BR.ts:573`); en "The pack says {{pack}} {{unit}}, the field
     says {{typed}}. Check it." (`src/i18n/locales/en.ts:514`); es "El empaque dice
     {{pack}} {{unit}} y el campo dice {{typed}}. Revísalo."
     (`src/i18n/locales/es.ts:519`). O comentário explica por que não trava
     (`app/inputs/new.tsx:234-237`): "o nome da embalagem pode estar abreviado e quem
     está com o saco na mão é quem sabe."

**Assistente (implementado, alcançado por texto digitado):** `src/assistant/skills.ts:656`
— `const perPack = packSize(pack, baseUnit);` com `const baseUnit = 'g'` **chumbado**
uma linha antes (`src/assistant/skills.ts:655`). Quando não lê, a frase muda:
"Preparei o cadastro. Não consegui ler o tamanho da embalagem — dá para completar
depois na tela." (`src/assistant/skills.ts:661`), e o campo vira `'a completar'`
(`src/assistant/skills.ts:669`). Só em português: o assistente é monolíngue por decisão
registrada no topo de `src/assistant/index.ts`.

#### 3.2.6 Mutações e testes

Duas mutações guardam `measure.ts`:

| mutação | `hurts` | linha |
|---|---|---|
| `return Number.isInteger(total) ? total : null;` → `return Math.round(total);` | "uma embalagem de 2,5 g vira 3 g calado, e o fator errado fica embaixo de todo custo daquele insumo" | `scripts/mutate.mjs:677-681` |
| `if (matches.length !== 1) return null;` → `if (matches.length === 0) return null;` | "\"caixa 6 x 500 ml\" é lido como 6 ml, e o custo do insumo sai cem vezes errado" | `scripts/mutate.mjs:683-687` |

Casos de teste reveladores (`src/domain/measure.test.ts`):

| entrada | esperado | por que é revelador |
|---|---|---|
| `packSize('saco 25 kg', 'g')` | `25_000` | o caso canônico (`src/domain/measure.test.ts:6`) |
| `packSize('caixa 1,5 L', 'ml')` | `1_500` | vírgula decimal + maiúscula + família volume (`src/domain/measure.test.ts:8`) |
| `packSize('balde', 'g')` | `null` | "A bucket has no size printed on it" (`src/domain/measure.test.ts:15`) |
| `packSize('pacote 500 g 12 unidades', 'g')` | `null` | **o caso perigoso**: os dois números são legíveis, e sem o portão a função pegaria o primeiro (`src/domain/measure.test.ts:19`, comentário em `src/domain/measure.test.ts:16-18`) |
| `packSize('caixa 6 x 500 ml', 'ml')` | `null` | ambiguidade "6 x" (`src/domain/measure.test.ts:20`) |
| `packSize('saco 25 lb', 'g')` | `null` | unidade desconhecida não é chute (`src/domain/measure.test.ts:22`) |
| `packSize('saco 25 kg', 'oz')` | `null` | unidade base desconhecida (`src/domain/measure.test.ts:23`) |
| `packSize('garrafa 2 L', 'g')` | `null` | volume contra base de massa é recusa deliberada (`src/domain/measure.test.ts:25`) |
| `packSize('ampola 0,0025 kg', 'g')` | `null` | 2,5 g não arredonda para 3 (`src/domain/measure.test.ts:31`) |
| `packSize('frasco 0,5 kg', 'g')` | `500` | fração que dá inteiro passa (`src/domain/measure.test.ts:32`) |

O `docs/insights.md:867-873` registra que a **primeira** versão do teste de
ambiguidade era falsa: "caixa 6 x 500 ml" caía em nulo pelo caminho errado (o "x" não
é unidade conhecida), e a mutação sobreviveu até o caso "pacote 500 g 12 unidades" ser
escrito.

---

### 3.3 `src/domain/units.ts` — hierarquia de embalagem

#### 3.3.1 Docblock de abertura, transcrito

`src/domain/units.ts:1-12`:

> "Packaging hierarchy. Stock is always stored in the smallest unit. The interface,
> however, speaks the operator's language: nobody in a cold room thinks in "3,600
> popsicles", they think in "12 crates". So the UI lets them pick the tier they
> actually use, and echoes the arithmetic back in full — eliminating mental math, which
> is where miscounts come from. The hierarchy is generic on purpose. This app is meant
> to be sold: the next customer may stack Unit -> Pack -> Bale instead of Unit -> Box
> -> Crate."

#### 3.3.2 Tipos

```ts
export type PackagingTier = {
  /** Stable key. Labels come from i18n or from the customer's own wording. */
  id: string;
  /** How many of the *smallest* unit fit in one of this tier. */
  perBaseUnit: number;
};

export type PackagingHierarchy = {
  /** Ordered smallest-first. The first tier must always be 1. */
  tiers: PackagingTier[];
};

export type Breakdown = { tier: PackagingTier; quantity: number }[];
```
(`src/domain/units.ts:14-24`, `src/domain/units.ts:39`)

`perBaseUnit` é sempre contado **na unidade base**, nunca na faixa de baixo. Um
engradado de 6 caixas de 50 tem `perBaseUnit: 300`, não `6` — e é por isso que a tela
de produto multiplica: `tiers.push({ id: 'crate', perBaseUnit: box * crate })`
(`app/products/new.tsx:178`).

#### 3.3.3 As cinco funções

| função | assinatura | corpo | onde arredonda | linha |
|---|---|---|---|---|
| `isValidHierarchy` | `(h: PackagingHierarchy) => boolean` | lista não vazia, primeira faixa `=== 1`, cada faixa estritamente maior que a anterior | — | `src/domain/units.ts:26-32` |
| `toBaseUnits` | `(quantity: number, tier: PackagingTier) => number` | `Math.round(quantity * tier.perBaseUnit)` | sim | `src/domain/units.ts:35-37` |
| `breakdown` | `(baseUnits: number, h: PackagingHierarchy) => Breakdown` | maior faixa primeiro, `Math.floor` por faixa, faixas em zero saem | `Math.max(0, Math.round(baseUnits))` na entrada | `src/domain/units.ts:46-58` |
| `roundUpToFullContainer` | `(baseUnits: number, h: PackagingHierarchy, tierId?: string) => { rounded: number; addedUnits: number; tier: PackagingTier \| null }` | resto por `%`, completa o contêiner | não arredonda, só soma o que falta | `src/domain/units.ts:67-85` |
| `boxesOf` | `(baseUnits: number, h: PackagingHierarchy) => { boxes: number; loose: number } \| null` | `Math.floor` sobre a **maior** faixa acima de 1; `null` se não houver | `Math.max(0, baseUnits)` | `src/domain/units.ts:100-109` |

#### 3.3.4 `isValidHierarchy` — o invariante que tudo o resto pressupõe

```ts
export function isValidHierarchy(h: PackagingHierarchy): boolean {
  if (h.tiers.length === 0) return false;
  if (h.tiers[0].perBaseUnit !== 1) return false;
  return h.tiers.every(
    (tier, i) => i === 0 || tier.perBaseUnit > h.tiers[i - 1].perBaseUnit,
  );
}
```
(`src/domain/units.ts:26-32`)

Três regras: lista não vazia, primeira faixa exatamente 1, ordem estritamente
crescente (igual é recusado). O docblock do teste explica o custo de quebrar cada uma
(`src/domain/units.test.ts:5-13`): "Every conversion in the product trusts two things
about it: the first tier is the base unit, and each tier is bigger than the one before.
Break either and the breakdown silently produces nonsense that still looks like a
quantity."

**Estado: implementado, sem chamador de produção.** Varredura em todo o repositório:
os únicos usos são `src/domain/units.test.ts:24`, `:31`, `:38`, `:51`, `:65`.
`parsePackaging` (`src/data/repository.ts:63-70`) aceita qualquer array não vazio do
JSON sem validar; e `breakdown` com uma hierarquia inválida produz número em silêncio
— verificado: `breakdown(120, { tiers: [{ id: 'box', perBaseUnit: 50 }] })` devolve
`[['box', 2]]` sem reclamar dos 20 restantes.

Há uma mutação guardando a função mesmo sem chamador:
`if (h.tiers[0].perBaseUnit !== 1) return false;` → `if (false) return false;`, com
`hurts`: "hierarquia que começa na caixa passa a valer, e toda quantidade sai
multiplicada por cinquenta" (`scripts/mutate.mjs:664-669`).

#### 3.3.5 `breakdown` — a frase que a tela precisa

```ts
export function breakdown(baseUnits: number, h: PackagingHierarchy): Breakdown {
  let remaining = Math.max(0, Math.round(baseUnits));
  const out: Breakdown = [];

  for (const tier of [...h.tiers].reverse()) {
    const quantity = Math.floor(remaining / tier.perBaseUnit);
    if (quantity > 0) {
      out.push({ tier, quantity });
      remaining -= quantity * tier.perBaseUnit;
    }
  }
  return out;
}
```
(`src/domain/units.ts:46-58`, docblock `src/domain/units.ts:41-45`)

Verificado, com `tiers = [unit:1, box:50, crate:300]`:

| entrada | saída |
|---|---|
| `3658` | `[crate×12, box×1, unit×8]` |
| `3658.6` | `[crate×12, box×1, unit×9]` (arredonda a entrada para 3659 antes de repartir) |
| `0` | `[]` |
| `-5` | `[]` (negativo é tratado como zero) |

Sobra sempre volta na faixa base porque a primeira faixa é 1 — se ela não for, o resto
desaparece sem aviso (ver 3.3.4). Lista vazia significa "zero", e é o chamador que
decide o que dizer: `UnitStepper` devolve a palavra da faixa base com contagem zero
(`src/components/UnitStepper.tsx:65`).

#### 3.3.6 `roundUpToFullContainer`

```ts
export function roundUpToFullContainer(
  baseUnits: number,
  h: PackagingHierarchy,
  tierId?: string,
): { rounded: number; addedUnits: number; tier: PackagingTier | null } {
  const tier = tierId
    ? h.tiers.find((t) => t.id === tierId)
    : [...h.tiers].reverse().find((t) => t.perBaseUnit > 1);

  if (!tier || tier.perBaseUnit <= 1) {
    return { rounded: baseUnits, addedUnits: 0, tier: null };
  }

  const remainder = baseUnits % tier.perBaseUnit;
  if (remainder === 0) return { rounded: baseUnits, addedUnits: 0, tier };

  const addedUnits = tier.perBaseUnit - remainder;
  return { rounded: baseUnits + addedUnits, addedUnits, tier };
}
```
(`src/domain/units.ts:67-85`, docblock `src/domain/units.ts:60-66`: "Producing 1,599
popsicles when a box holds 50 leaves 49 loose units that nobody can ship cleanly. The
system suggests 1,600 instead")

Verificado, com `tiers = [unit:1, box:50, crate:300]`:

| chamada | `rounded` | `addedUnits` | `tier` |
|---|---|---|---|
| `(1599, h, 'box')` | `1600` | `1` | `box` |
| `(1599, h)` — sem `tierId` | `1800` | `201` | `crate` (**a maior** faixa acima de 1, não a menor) |
| `(1599, h, 'nope')` | `1599` | `0` | `null` (id inexistente **não** cai para o padrão) |
| `(0, h, 'box')` | `0` | `0` | `box` |

**Estado: implementado e chamado por tela.** `app/recipes/[id].tsx:245-248` chama
sempre com id explícito, escolhendo a primeira faixa acima de 1
(`const boxTier = data.packaging.find((t) => t.perBaseUnit > 1);`,
`app/recipes/[id].tsx:244`) — ou seja, a tela evita o padrão "maior faixa" de propósito,
sem comentário registrando isso.

#### 3.3.7 `boxesOf` — "caixa é objeto"

```ts
export function boxesOf(
  baseUnits: number,
  h: PackagingHierarchy,
): { boxes: number; loose: number } | null {
  const above = [...h.tiers].reverse().find((t) => t.perBaseUnit > 1);
  if (!above) return null;

  const boxes = Math.floor(Math.max(0, baseUnits) / above.perBaseUnit);
  return { boxes, loose: Math.max(0, baseUnits) - boxes * above.perBaseUnit };
}
```
(`src/domain/units.ts:100-109`)

Docblock, que é a regra de produto (`src/domain/units.ts:87-99`):

> "How many physical boxes a quantity makes, and what will not fit in one. A box is an
> object: eighteen boxes are eighteen things somebody stacks on a truck, whether they
> hold fifty popsicles or twenty-four. Summing them across items of different box sizes
> is therefore honest - what is NOT honest is pretending a sack of sugar is a box
> because the total needed a single unit. So the count only includes items that HAVE a
> layer above the base one, and everything else comes back untouched, in its own
> units, for the caller to say out loud. Hiding it in the total is the invented number
> this project spends its whole verification bar trying to prevent."

Cuidado de nomenclatura: a função se chama `boxesOf` mas conta a **maior** faixa, não a
faixa `box`. O teste diz isso em português (`src/domain/units.test.ts:78`): "A camada
MAIOR é a que conta como volume: um engradado é um objeto só." Verificado: com
`crate:300`, `boxesOf(1300, h)` é `{ boxes: 4, loose: 100 }`; com `crate:600` (o
fixture do teste), é `{ boxes: 2, loose: 100 }` (`src/domain/units.test.ts:79`).
`boxesOf(-10, h)` é `{ boxes: 0, loose: 0 }` (verificado, sem teste).

**Estado: implementado e chamado por tela**, e o seu `null` é usado como pergunta
("este item tem caixa?"):

- `app/(tabs)/transport.tsx:96-99` — se tem caixa, `formatPacked`; se não,
  `formatQuantity(baseUnits) + ' ' + baseUnit`. O comentário
  (`app/(tabs)/transport.tsx:91-95`) diz por que: "`formatPacked` sozinho chamaria
  grama de 'unidade', porque a faixa `unit` é a única que o item solto tem".
- `app/(tabs)/index.tsx:197-217` — soma volumes entre itens e joga o que não tem caixa
  numa lista dita por nome. O comentário (`app/(tabs)/index.tsx:192-196`) repete a
  regra do docblock quase palavra por palavra.
- `src/data/repository.ts:3295-3300` registra por que a camada de dados **não** faz
  isso: "Turning grams and popsicles into 'caixas' is a sentence, not a fact, and it
  cannot be done here".

#### 3.3.8 `toBaseUnits`

```ts
/** Converts a quantity expressed in a tier into base units. */
export function toBaseUnits(quantity: number, tier: PackagingTier): number {
  return Math.round(quantity * tier.perBaseUnit);
}
```
(`src/domain/units.ts:34-37`)

Verificado: `toBaseUnits(2.4, { id: 'box', perBaseUnit: 50 })` = `120` — arredonda o
produto, não a contagem.

**Estado: implementado, sem chamador de produção alcançável.** O único uso é
`src/components/UnitStepper.tsx:72`, e o `UnitStepper` **não é importado por nenhuma
tela** (varredura em `app/` e `src/`): a única menção fora do próprio arquivo é
`src/dictionary.test.ts:45`, que registra a fronteira: "o UnitStepper, componente da
Fase 2 — decisão registrada no CLAUDE.md, e apontá-lo como defeito já custou uma
rodada". A seção `stepper` do dicionário está na lista `ESCRITAS_ADIANTADO`
(`src/dictionary.test.ts:39-48`), que é um teste que **reprova** se uma seção sem
leitor não tiver justificativa escrita.

#### 3.3.9 Onde a hierarquia mora e como nasce

| origem | valor | linha |
|---|---|---|
| padrão do esquema local | `'[{"id":"unit","perBaseUnit":1}]'` | `src/data/db.ts:41` |
| padrão do servidor | `'[{"id":"unit","perBaseUnit":1}]'::jsonb` | `supabase/migrations/0001_foundation.sql:144` |
| padrão em memória | `const DEFAULT_PACKAGING: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };` | `src/data/repository.ts:61` |
| leitura | `parsePackaging(json)`: `JSON.parse`, aceita array não vazio, cai no padrão em erro ou vazio | `src/data/repository.ts:63-70` |
| escrita | `JSON.stringify(item.packaging.tiers)` — grava **só o array**, não o objeto | `src/data/repository.ts:266` |
| semente "solto" | `const LOOSE: PackagingHierarchy = { tiers: [{ id: 'unit', perBaseUnit: 1 }] };` | `src/data/seed.ts:14` |
| semente "empilhado" | `unit:1`, `box:50`, `crate:300` | `src/data/seed.ts:16-22` |
| cadastro de insumo | sempre `{ tiers: [{ id: 'unit', perBaseUnit: 1 }] }` — a tela de insumo **não** oferece faixas | `app/inputs/new.tsx:319` |
| cadastro de produto | monta de dois campos: `perBox` (padrão `'50'`) e `perCrate` (padrão `'6'`) | `app/products/new.tsx:161-181` |

A montagem do produto, transcrita (`app/products/new.tsx:172-181`):

```ts
const hierarchy = useMemo<PackagingHierarchy>(() => {
  const box = Math.round(num(perBox));
  const crate = Math.round(num(perCrate));
  const tiers = [{ id: 'unit', perBaseUnit: 1 }];
  if (Number.isFinite(box) && box > 1) tiers.push({ id: 'box', perBaseUnit: box });
  if (Number.isFinite(crate) && crate > 1 && tiers.length > 1) {
    tiers.push({ id: 'crate', perBaseUnit: box * crate });
  }
  return { tiers };
}, [perBox, perCrate]);
```

Ela satisfaz `isValidHierarchy` por construção (base 1; `box > 1`; `crate` só entra se
houver caixa e `box * crate > box`), mas **ninguém verifica** — a função não é chamada.

Os ids de faixa em uso no aplicativo são exatamente três: `unit`, `box`, `crate`. As
palavras vivem no dicionário, nos três idiomas:

| id | pt-BR | es | en |
|---|---|---|---|
| `unit` | `unidade` / `unidades` (`src/i18n/locales/pt-BR.ts:28`) | `unidad` / `unidades` (`src/i18n/locales/es.ts:24`) | `unit` / `units` (`src/i18n/locales/en.ts:19`) |
| `box` | `caixa` / `caixas` (`src/i18n/locales/pt-BR.ts:29`) | `caja` / `cajas` (`src/i18n/locales/es.ts:25`) | `box` / `boxes` (`src/i18n/locales/en.ts:20`) |
| `crate` | `engradado` / `engradados` (`src/i18n/locales/pt-BR.ts:30`) | `jaba` / `jabas` (`src/i18n/locales/es.ts:26`) | `crate` / `crates` (`src/i18n/locales/en.ts:21`) |

`formatPacked` cai no próprio `tier.id` quando a palavra não existe
(`src/i18n/index.ts:155`), o que é a válvula que faz a hierarquia genérica funcionar
para um cliente que empilhe `Unit → Pack → Bale`.

#### 3.3.10 Casos de teste reveladores de `units.test.ts`

| teste | asserção | o que pega |
|---|---|---|
| "a hierarchy has to start at one and climb" | `isValidHierarchy(ok) === true` | o caminho felizmente válido (`src/domain/units.test.ts:23-25`) |
| "a first tier that is not the base unit is refused" | `[box:50, crate:300]` → `false` | "Starting at 50 does not fail; it quietly multiplies every quantity by 50" (`src/domain/units.test.ts:27-34`) |
| "tiers out of order, or repeated, are refused" | `[unit:1, crate:300, box:50]` → `false`; `[unit:1, box:50, pack:50]` → `false` | igual **não** é "maior que": duas faixas do mesmo tamanho deixariam o breakdown ambíguo (`src/domain/units.test.ts:36-60`) |
| "an empty hierarchy is refused rather than treated as 'just units'" | `{ tiers: [] }` → `false` | "Defaulting to units here would let an item with no packaging answer questions about boxes" (`src/domain/units.test.ts:62-66`) |
| "a box is an object, and something with no box is never counted as one" | `boxesOf(1300, [1,50,600])` = `{2, 100}`; `boxesOf(6000, [g:1])` = `null`; `boxesOf(430, ...)` = `{0, 430}` | a maior faixa conta; sem faixa devolve `null`; menos que um volume é zero caixas e tudo solto, "nunca '1 caixa' arredondada" (`src/domain/units.test.ts:68-87`) |

`breakdown` e `roundUpToFullContainer` **não são testados em `units.test.ts`** — estão
em `src/domain/recipe.test.ts:43` (`breakdown(3658, hierarchy)`) e
`src/domain/recipe.test.ts:53` (`roundUpToFullContainer(1599, hierarchy, 'box')`).

---

### 3.4 `src/domain/number.ts` — ler o que a pessoa digitou

#### 3.4.1 O docblock, que é a história completa do defeito

`src/domain/number.ts:1-20`, transcrito:

> "Reading a number the way a person typed it, and writing one back so that reading it
> again returns the same number. The app had three different readers. Four screens did
> `s.replace(/\./g, '').replace(',', '.')`, which treats every dot as a thousands
> separator: `118.50` became `11850`. Four others did `s.replace(',', '.')`, which
> treats every dot as decimal: `46.000` became `46`, and `1.000,00` became `NaN`. Both
> are defensible in Portuguese and both are wrong half the time, because the phone
> decides which separator the person can even type: React Native replaces Android's own
> key listener with one that "permits all keyboard input through" (`ReactEditText.kt`),
> so `.` and `,` both arrive whatever the keyboard and whatever the locale. Worse, the
> app fed itself the ambiguity. `String(2.5)` is always `"2.5"` in JavaScript, so a
> 2,5% loss written to the recipe screen came back as 25%, with the save button lit and
> nobody having touched a key. So there is one reader and one writer here, and they are
> inverses."

O mesmo episódio, com o custo medido, em `docs/insights.md:1478-1501`. Detalhe
importante para quem vai reconstruir: a suíte estava **verde por coincidência de
fixture** — o `seed.ts` semeia perdas de 0.02, 0.04, 0.05 e 0.08 (percentuais
inteiros) e o e2e só digitava `4`, `700`, `480`, `46000`, todos inteiros
(`docs/insights.md:1488-1493`).

#### 3.4.2 `parseTyped` — o algoritmo, passo a passo

```ts
export function parseTyped(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const commas = (cleaned.match(/,/g) ?? []).length;
  const dots = (cleaned.match(/\./g) ?? []).length;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let decimal: ',' | '.' | null;
  if (commas > 0 && dots > 0) {
    decimal = lastComma > lastDot ? ',' : '.';
  } else if (commas > 0) {
    decimal = commas > 1 ? null : ',';
  } else if (dots > 0) {
    decimal = dots > 1 ? null : '.';
  } else {
    decimal = null;
  }

  if (decimal === '.' && dots === 1) {
    const fraction = cleaned.slice(lastDot + 1);
    if (fraction.length === 3 && Number(cleaned.slice(0, lastDot)) !== 0) decimal = null;
  }

  const digitsOnly = (part: string) => part.replace(/[.,]/g, '');
  const normalized =
    decimal === null
      ? digitsOnly(cleaned)
      : `${digitsOnly(cleaned.slice(0, decimal === ',' ? lastComma : lastDot))}.${cleaned.slice(
          (decimal === ',' ? lastComma : lastDot) + 1,
        )}`;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
```
(`src/domain/number.ts:32-75`)

As decisões, em tabela:

| situação | separador decimal escolhido | linha |
|---|---|---|
| vírgula e ponto presentes | o **último** dos dois | `src/domain/number.ts:42-45` |
| só vírgulas, uma | vírgula | `src/domain/number.ts:46-48` |
| só vírgulas, duas ou mais | nenhum (tudo é agrupamento) | `src/domain/number.ts:48` |
| só pontos, um | ponto | `src/domain/number.ts:49-50` |
| só pontos, dois ou mais | nenhum | `src/domain/number.ts:50` |
| nenhum separador | nenhum | `src/domain/number.ts:51-52` |
| **exceção**: um ponto só, exatamente 3 dígitos depois, e parte inteira ≠ 0 | nenhum — é milhar português | `src/domain/number.ts:60-63` |

A exceção do ponto tem comentário explicando por que **não** se aplica à vírgula
(`src/domain/number.ts:55-59`): "a comma typed here is a decimal point, and treating
'1,500' as fifteen hundred would break the language this app is written in to rescue
the one it is not."

E o docblock nomeia o caso em que a regra perde (`src/domain/number.ts:22-31`): "a lone
dot with exactly three digits after it is read as grouping, so `1.250` is one thousand
two hundred and fifty, not one and a quarter. That is the right call in this app - base
units are grams, millilitres and whole units, money has two decimals, and nothing here
is quoted to three - but a three-decimal scale reading would lose. `0.500` keeps its
decimal, because an integer part of zero cannot be grouping."

#### 3.4.3 Tabela de comportamento verificada, entrada por entrada

Todos executados contra o código atual:

| entrada | saída | regra que decidiu |
|---|---|---|
| `'118,50'` | `118.5` | vírgula única = decimal |
| `'118.50'` | `118.5` | ponto único, 2 dígitos |
| `'1.000,00'` | `1000` | os dois presentes, vírgula é a última |
| `'1000.00'` | `1000` | ponto único, 2 dígitos |
| `'46.000'` | `46000` | ponto único, 3 dígitos, inteiro ≠ 0 → agrupamento |
| `'1.500'` | `1500` | idem |
| `'25.000'` | `25000` | idem |
| `'1.250.400'` | `1250400` | dois pontos → tudo agrupamento |
| `'10.500'` | `10500` | idem, com dois dígitos antes |
| `'-1.500'` | `-1500` | `Number('-1') !== 0` → agrupamento |
| `'0.500'` | `0.5` | inteiro é 0 → não pode ser agrupamento |
| `'00.500'` | `0.5` | `Number('00') === 0` |
| `'0.000'` | `0` | mesma regra, resultado zero |
| `'0,500'` | `0.5` | vírgula é sempre decimal |
| `'1.5'` | `1.5` | ponto único, 1 dígito |
| `'2,5'` | `2.5` | |
| `'1.2345'` | `1.2345` | ponto único, 4 dígitos |
| `'1.2.3'` | `123` | dois pontos → agrupamento |
| `'1,2,3'` | `123` | duas vírgulas → agrupamento |
| `'12,34,56'` | `123456` | idem |
| `'.5'` | `0.5` | `Number('.5')` = 0.5 |
| `',5'` | `0.5` | parte inteira vazia → `Number('.5')` |
| `'-3'` | `-3` | sinal preservado |
| `'-18,4'` | `-18.4` | leitura de temperatura |
| `'R$ 1.234,56'` | `1234.56` | a limpeza `[^\d.,-]` come "R$" e o espaço |
| `''` | `null` | vazio |
| `'abc'` | `null` | sem dígito |
| `'kg'` | `null` | sem dígito |
| `'NaN'` | `null` | sem dígito |
| `'3-'` | `null` | `Number('3-')` é `NaN` |

Note o que a limpeza `raw.replace(/[^\d.,-]/g, '')` (`src/domain/number.ts:33`)
implica: a função aceita prefixo de moeda, espaços e qualquer texto ao redor, e o
assistente depende disso — `parseNumber('R$ 496')` = `496`
(`src/assistant/assistant.test.ts:557`).

#### 3.4.4 `formatTyped` — o escritor inverso

```ts
export function formatTyped(value: number, formatting: string, maxDecimals = 4): string {
  return new Intl.NumberFormat(formatting, {
    useGrouping: false,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}
```
(`src/domain/number.ts:85-90`, docblock `src/domain/number.ts:77-84`)

Duas decisões, ambas escritas: **nunca** agrupa ("grouping is exactly the ambiguity
this module exists to remove, and a field is not a report") e o separador decimal é o
do idioma da pessoa ("so a Brazilian sees `2,5` and an American sees `2.5` - and both
come back as 2.5").

Comportamento verificado:

| chamada | saída |
|---|---|
| `formatTyped(1500, 'pt-BR')` | `'1500'` |
| `formatTyped(46000, 'pt-BR')` | `'46000'` |
| `formatTyped(2.5, 'pt-BR')` | `'2,5'` |
| `formatTyped(2.5, 'en-US')` | `'2.5'` |
| `formatTyped(2.5, 'es-MX')` | `'2.5'` |
| `formatTyped(-18.4, 'pt-BR', 1)` | `'-18,4'` |
| `formatTyped(1234.56789, 'pt-BR')` | `'1234,5679'` (corta em 4 casas) |
| `formatTyped(0.00001, 'pt-BR')` | `'0'` — **o valor se perde** |
| `formatTyped(1e21, 'pt-BR')` | `'1000000000000000000000'` |
| `formatTyped(NaN, 'pt-BR')` | `'NaN'` (e `parseTyped('NaN')` é `null`) |
| `formatTyped(2.5, 'ar-EG')` | `'٢٫٥'` — e `parseTyped` disso é `null` |

**Limites da propriedade de ida e volta**, medidos:

- vale para valores com até `maxDecimals` casas (padrão 4);
- **não** vale acima disso: `parseTyped(formatTyped(0.00001, 'pt-BR'))` é `0`;
- **não** vale para `NaN`;
- **não** vale em locale com dígitos não latinos — nenhum dos que o app oferece usa
  (as tags saem de `formattingFor`, e todas as regiões da lista são de dígito latino:
  `src/i18n/company.ts:19-28`).

#### 3.4.5 O teste de propriedade, que é a única garantia da inversão

```ts
for (const formatting of ['pt-BR', 'en-US', 'es-MX']) {
  for (const value of [2.5, 0.5, 7.5, 12.4, 1250, 46000, 1.25, 506, 0.075]) {
    assert.equal(parseTyped(formatTyped(value, formatting)), value, ...);
  }
}
```
(`src/domain/number.test.ts:40-53`)

27 combinações. O comentário registra a regra que nasceu daí
(`docs/insights.md:1495-1501`): "ida e volta é obrigação de quem escreve no próprio
campo. Se uma tela pré-preenche um campo que ela mesma vai reler, o escritor e o leitor
têm de ser inversos comprovados — não duas funções que por acaso combinam nos números
do exemplo."

Casos reveladores dos outros testes:

| asserção | por que revela |
|---|---|
| `parseTyped('118,50') === parseTyped('118.50')` | o telefone escolhe o separador, não a pessoa (`src/domain/number.test.ts:9-10`) |
| `parseTyped('46.000') === 46000` | "the reader that only swapped the comma made 46.000 g of sugar into 46 g, and wrote that to the ledger without a word" (`src/domain/number.test.ts:15-18`) |
| `parseTyped('0.500') === 0.5` **e** `parseTyped('1.500') === 1500` | as duas metades da regra dos três dígitos, lado a lado (`src/domain/number.test.ts:19`, `src/domain/number.test.ts:27`) |
| `formatTyped(1500, 'pt-BR') === '1500'` | campo nunca recebe agrupamento: "'1.500' cannot be read back with certainty by anyone, including us" (`src/domain/number.test.ts:55-59`) |
| `parseTyped('-3') === -3` | negativo passa; é o que faz a leitura de temperatura funcionar (`src/domain/number.test.ts:37`) |

#### 3.4.6 Quem chama, e o padrão de uso

`parseTyped` é chamado por dez telas e, com o alias `parseNumber`, pelo assistente:

| chamador | uso |
|---|---|
| `app/inputs/new.tsx:198` | `const num = (s: string) => parseTyped(s) ?? NaN;` — o padrão dominante |
| `app/inputs/[id].tsx:239`, `:275` | perda declarada e contagem cega |
| `app/orders/new.tsx:144` | `Math.max(0, parseTyped(quantity) ?? 0)` |
| `app/places.tsx:442-443`, `:490`, `:583` | faixa de temperatura (min/max) e leitura |
| `app/production/new.tsx:151`, `:168` | tachos e unidades produzidas |
| `app/products/new.tsx:168` | `num` local |
| `app/purchase.tsx:116` | `num` local |
| `app/recipes/[id].tsx:196` | `num` local |
| `app/settings.tsx:959`, `:974` | hora e minuto do aviso |
| `app/transfer.tsx:193` | quantidade transferida |
| `src/assistant/text.ts:30` | `export { parseTyped as parseNumber } from '@/domain/number';` — reexportação, com docblock explicando que o assistente tinha um quarto leitor (`src/assistant/text.ts:22-29`) |
| `src/assistant/skills.ts:334`, `:335`, `:538`, `:815`, `:828`, `:911`, `:997` | quantidades e valores ditos em frase |

Os dois padrões de defesa a jusante, ambos presentes:

- `parseTyped(s) ?? NaN` seguido de `Number.isFinite(...) && ... > 0`
  (`app/inputs/new.tsx:198-202`, `app/purchase.tsx:116-123`);
- `Math.max(0, (parseTyped(s) ?? 0) || 0)` — o `|| 0` neutraliza `NaN`
  (`app/production/new.tsx:151`, `app/transfer.tsx:193`).

`formatTyped` é chamado por três telas, sempre para **pré-preencher um campo que a
mesma tela vai reler**:

| chamador | campo |
|---|---|
| `app/inputs/new.tsx:134`, `:139`, `:149` | fator de conversão, nível cheio, e o preço por embalagem reconstruído de `(averageRate * purchaseToBase) / 100` |
| `app/places.tsx:424`, `:427`, `:516`, `:542-543` | mínimo e máximo da faixa (1 casa) e a última leitura de temperatura |
| `app/recipes/[id].tsx:180-182` | perda em por cento (2 casas), rendimento, rendimento por unidade |

**Nenhuma mutação em `scripts/mutate.mjs` aponta para `src/domain/number.ts`**
(verificado: `grep -n "file: 'src/domain/number" scripts/mutate.mjs` não retorna nada).
A proteção do módulo é o teste de propriedade mais duas verificações e2e (3.4.7).

#### 3.4.7 As duas verificações e2e que cobram o módulo no navegador

1. `check('a decimal typed with a dot is the same money as one typed with a comma')`
   (`e2e/flow.mjs:1133-1156`): digita `120.50` no total da nota e exige
   `assert.match(asking, /por R\$ 120,50/)` e
   `assert.doesNotMatch(asking, /R\$ 12\.050,00/)` (`e2e/flow.mjs:1154-1155`) — cem
   vezes o dinheiro, na frase que a pessoa está a um toque de confirmar.
2. `check('opening a sheet and touching nothing does not change it')`
   (`e2e/flow.mjs:1158-1187`): salva perda `2,5`, reabre a ficha e exige
   `assert.equal(reopened, '2,5')` (`e2e/flow.mjs:1182`) e que a tela não diga
   `25,0%` nem `25%`.

Há ainda o guarda de porcentagem à mão em `src/layers.test.ts:489-521`, que é onde
`formatTyped` aparece como o **inocente** de uma régua: a linha
`lossPercent: formatTyped(Number((stored.lossFraction * 100).toFixed(2)), locale.formatting)`
é explicitamente permitida, com a razão escrita — "valor de campo entregue a um
formatador que sabe o idioma" (`src/layers.test.ts:532-536`).

---

### 3.5 Formatação por locale — a camada que escreve o número na tela

`src/domain/number.ts` escreve para **campo**; `src/i18n/index.ts` escreve para
**leitura**. São funções diferentes e a confusão entre as duas já custou um defeito
(3.5.4).

#### 3.5.1 `LocaleSettings`

```ts
export type LocaleSettings = {
  language: LanguageTag;
  /** BCP 47 tag used for number and date formatting. */
  formatting: string;
  /** ISO 4217. */
  currency: string;
  timeZone: string;
};
```
(`src/i18n/index.ts:16-23`, com `LanguageTag = 'pt-BR' | 'es' | 'en'` em
`src/i18n/index.ts:8`)

Docblock (`src/i18n/index.ts:12-15`): "Currency is a property of the company, not of
the phone. A Brazilian factory whose owner reads the app in English still bills in BRL."

Padrão (`src/i18n/index.ts:25-30`):

```ts
export const defaultLocale: LocaleSettings = {
  language: 'pt-BR',
  formatting: 'pt-BR',
  currency: 'BRL',
  timeZone: 'America/Sao_Paulo',
};
```

#### 3.5.2 A tabela de moedas inteira

```ts
export const CURRENCIES = [
  { code: 'BRL', region: 'BR' },
  { code: 'USD', region: 'US' },
  { code: 'EUR', region: 'ES' },
  { code: 'MXN', region: 'MX' },
  { code: 'ARS', region: 'AR' },
  { code: 'CLP', region: 'CL' },
  { code: 'COP', region: 'CO' },
  { code: 'PYG', region: 'PY' },
] as const;
```
(`src/i18n/company.ts:19-28`)

| código | região | observação |
|---|---|---|
| `BRL` | `BR` | padrão |
| `USD` | `US` | |
| `EUR` | `ES` | a região escolhida para o euro é a Espanha |
| `MXN` | `MX` | |
| `ARS` | `AR` | |
| `CLP` | `CL` | moeda sem centavo |
| `COP` | `CO` | |
| `PYG` | `PY` | moeda sem centavo |

A regra: **a moeda decide a região, e a região decide o formato do número**
(`src/i18n/company.ts:6-10`): "Espanhol escreve `1.234,56` na Espanha e `1,234.56` no
México — o mesmo idioma, o ponto e a vírgula trocados de lugar."

```ts
export function formattingFor(language: LanguageTag, currency: string): string {
  if (language === 'pt-BR') return 'pt-BR';
  const region = CURRENCIES.find((c) => c.code === currency)?.region;
  return region ? `${language}-${region}` : language;
}
```
(`src/i18n/company.ts:43-47`)

Português nunca muda de formato com a moeda (`src/i18n/company.ts:44`); moeda fora da
lista cai no idioma sozinho — "pior formato, nunca erro" (`src/i18n/company.ts:41`).
Provado em `src/i18n/i18n.test.ts:113-146`, com o par que importa:
`formatMoney(1234567, es-MX/MXN)` casa `/12,345\.67/` e o mesmo valor em `es-ES/EUR`
casa `/12\.345,67/`.

Sobre moeda sem centavo (`src/i18n/company.ts:15-17`): "Guaraní e peso chileno não têm
centavo, e o `Intl` sabe disso: o valor inteiro que o livro-razão guarda continua sendo
centésimo de unidade em toda moeda, e só a escrita muda. É a mesma regra de sempre —
arredonda no fim, uma vez."

`localeFrom` (`src/i18n/company.ts:56-68`) reconstrói o objeto da gaveta local peça por
peça, cada uma caindo no padrão sozinha; o fuso só é aceito se contiver `/`
(`src/i18n/company.ts:66`).

#### 3.5.3 Os seis formatadores de número

| função | assinatura | corpo | precisão | linha |
|---|---|---|---|---|
| `formatMoney` | `(cents: number, locale: LocaleSettings) => string` | `Intl.NumberFormat(locale.formatting, { style: 'currency', currency: locale.currency }).format(cents / 100)` | a da moeda (2 casas em BRL, 0 em CLP/PYG) | `src/i18n/index.ts:96-101` |
| `formatQuantity` | `(value: number, locale) => string` | `Intl.NumberFormat(..., { maximumFractionDigits: 0 })` | **inteiro** | `src/i18n/index.ts:103-107` |
| `formatWeight` | `(grams: number, locale) => string` | `grams / 1000` com `maximumFractionDigits: kg >= 10 ? 0 : 1`, sufixo `' kg'` chumbado | 0 ou 1 casa | `src/i18n/index.ts:109-115` |
| `formatPercent` | `(fraction: number, locale, digits = 1) => string` | `Intl.NumberFormat(..., { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits })` | `digits` | `src/i18n/index.ts:217-223` |
| `formatPacked` | `(baseUnits, hierarchy, words, locale, and?) => string` | `breakdown` + palavra por faixa, junta com `' · '` ou com `joinList(parts, and)` | inteira | `src/i18n/index.ts:146-160` |
| `formatTyped` | `(value, formatting: string, maxDecimals = 4) => string` | ver 3.4.4 — **recebe a tag, não o `LocaleSettings`** | `maxDecimals` | `src/domain/number.ts:85-90` |

Notas de assinatura que importam na reconstrução:

- `formatMoney` recebe `number`, não `Cents` — daí os `as Cents` das telas serem
  cosméticos (`app/(tabs)/reports.tsx:88`).
- `formatTyped` é o único que recebe a **string** da tag (`locale.formatting`) em vez do
  objeto; todos os outros recebem `LocaleSettings`.
- `formatPercent` recebe **fração** (0.08 = 8%), não porcentagem.
- `formatWeight` **não tem nenhum chamador** (varredura em `src/` e `app/`): a única
  ocorrência é a própria definição (`src/i18n/index.ts:109`). **Implementado, sem
  chamador.** O sufixo `kg` chumbado ali também contraria a regra de i18n do projeto.

`formatPacked` merece o docblock transcrito (`src/i18n/index.ts:133-145`): "The largest
layers come first and the remainder stays in units: 263 is '5 caixas · 13 unidades',
never just '5 caixas', because thirteen popsicles that exist would have vanished from
the sentence."

#### 3.5.4 As duas cicatrizes de precisão de exibição

1. **`formatQuantity` matou a fração de um grau** (`docs/insights.md:2003-2017`): a
   primeira leitura de temperatura gravou -18,4 e a tela mostrou -18, porque
   `formatQuantity` tem `maximumFractionDigits: 0` — escrito para quantidade, onde
   inteiro é o certo. O conserto foi trocar por `formatTyped` com uma decimal
   (`app/places.tsx:516`), e o e2e passou a cobrar `-18,4` na tela
   (`e2e/flow.mjs:922`, `e2e/flow.mjs:930`). A lição registrada: "todo formatador
   carrega uma suposição sobre o que é precisão suficiente, e ela é invisível até um
   dado novo passar por ele" (`docs/insights.md:2014-2017`).
2. **Porcentagem montada à mão** (`src/i18n/index.ts:208-216`): "Existia em três
   lugares como `(x * 100).toFixed(1)`, que é o ponto decimal do JavaScript e não o
   separador de quem lê: a capa anunciava uma alta de '9.0%' para uma fábrica
   brasileira". O guarda que impede a recaída é `porCentoNaMao`
   (`src/layers.test.ts:489-500`): pega linha que tenha `* 100` seguido de `.toFixed(`
   **e** o caractere `%` na mesma linha. O docblock dele nomeia o defeito de família:
   "O ajudante foi escrito e os chamadores não foram trocados... o repositório PARECE
   consertado, porque a função certa existe e tem chamadores — só não todos"
   (`src/layers.test.ts:481-484`).

#### 3.5.5 A taxa exibida como dinheiro — o padrão dos "1.000"

Uma `Rate` é centavo fracionário por unidade base; para virar dinheiro legível ela é
multiplicada pela quantidade que a pessoa pensa e arredondada **na hora de exibir**:

| tela | expressão | frase |
|---|---|---|
| cadastro de insumo | `formatMoney(Math.round(parsed.unitRate * 1000), locale)` (`app/inputs/new.tsx:212`) | pt-BR: `'{{paid}} ÷ {{factor}} = {{perThousand}} a cada 1.000 {{unit}} · {{rate}} centavos por {{unit}}'` (`src/i18n/locales/pt-BR.ts:564-565`) |
| compra | `formatMoney(Math.round(selected.averageRate * 1_000), locale)` e o mesmo para a média depois (`app/purchase.tsx:394-395`) | — |
| capa | `formatMoney(Math.round(r.unitCostRate!) as Cents, locale)` (`src/home/Mosaic.tsx:761`, `:770`, `:786`) | custo por unidade de produto |
| relatórios | `formatMoney(Math.round(comCusto[0]!.unitCostRate!) as Cents, locale)` (`app/(tabs)/reports.tsx:153`) | idem |

A mesma frase nos outros dois idiomas:
en `'{{paid}} ÷ {{factor}} = {{perThousand}} per 1,000 {{unit}} · {{rate}} cents per {{unit}}'`
(`src/i18n/locales/en.ts:507-508`); es `'{{paid}} ÷ {{factor}} = {{perThousand}} por cada 1.000 {{unit}} · {{rate}} centavos por {{unit}}'`
(`src/i18n/locales/es.ts:512-513`).

O `{{rate}}` é a **prova visível de que o app não arredondou a taxa**:
`rate: parsed.unitRate.toFixed(4)` (`app/inputs/new.tsx:217`), com o comentário
(`app/inputs/new.tsx:205-208`): "Showing the per-gram rate at full precision is also
the visible proof that the app is not rounding it away - 0.472 cents per gram is a real
number here, not zero." Esse `toFixed(4)` é o caso que o guarda de porcentagem
explicitamente absolve — "taxa não é porcentagem" (`src/layers.test.ts:530`).

#### 3.5.6 A unidade base não é traduzida

`items.base_unit` é uma string livre, gravada como `baseUnit.trim() || 'un'`
(`app/inputs/new.tsx:318`), com `'g'` como valor inicial do formulário
(`app/inputs/new.tsx:122`). Não existe seletor com opções fechadas: o campo é texto
(`app/inputs/new.tsx:188`, `app/inputs/new.tsx:425-430`). E ela é impressa **crua** nas
telas, sem passar por dicionário:

- `` `${formatQuantity(line.baseUnits, locale)} ${line.baseUnit}` `` (`app/places.tsx:234`)
- `` `${formatQuantity(row.baseUnits, locale)} ${row.baseUnit}` `` (`app/losses.tsx:178`)
- `` `${formatQuantity(amount, locale)} ${line.baseUnit}` `` (`app/transfer.tsx:206`)
- `` `${formatQuantity(item.baseUnits, locale)} ${item.baseUnit}` `` (`app/(tabs)/transport.tsx:99`)
- `const diga = (baseUnits, unit) => ...` (`app/lots/[id].tsx:109-110`)

Ou seja: `g`, `ml` e `un` aparecem iguais nos três idiomas. Não há chave de dicionário
para unidade base (**NÃO ESTÁ NO CÓDIGO**) — o dicionário só tem palavras para as
faixas de embalagem (`unit`/`box`/`crate`, 3.3.9). Se isso é decisão ou lacuna: **NÃO
ESTÁ REGISTRADO** em `docs/insights.md` nem no `CLAUDE.md`.

---

### 3.6 O caminho completo de um número, duas vezes

#### 3.6.1 Da tecla ao livro-razão: o cadastro de um insumo com a primeira nota

1. A pessoa escreve `saco 25 kg` em EMBALAGEM. `packSize('saco 25 kg', 'g')` devolve
   `25000` e preenche QUANTO VEM DENTRO com `String(25000)`
   (`app/inputs/new.tsx:181-182`).
2. Escreve `118` em PREÇO PAGO. `num` = `parseTyped` → `118`
   (`app/inputs/new.tsx:198-201`).
3. `rate(118, 25000)` = `0.472` centavo por grama (`app/inputs/new.tsx:202`).
4. A dica mostra `formatMoney(Math.round(0.472 * 1000))` = `R$ 4,72` a cada 1.000 g, e
   `0.4720` centavos por g (`app/inputs/new.tsx:212-218`).
5. A conferência relê `packSize` e compara com o campo: `|25000 - 25000| < 0.5` →
   "Conversão confere" (`app/inputs/new.tsx:238-242`).
6. Confirmação com o número por extenso, usando `formatMoney(fromDecimal(118))` =
   `R$ 118,00` (`app/inputs/new.tsx:278-288`).
7. `saveItem` grava `purchaseToBase: 25000`, `baseUnit: 'g'`,
   `packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] }`
   (`app/inputs/new.tsx:312-321`).
8. `recordPurchase` recebe `baseUnits: Math.round(25000)` e
   `totalCents: fromDecimal(118)` = `11800` (`app/inputs/new.tsx:327-332`).
9. Dentro dele: `lineRate = rate(11800 / 100, 25000)` = `0.472`
   (`src/data/repository.ts:398`), gravado em `movements.unit_cost_rate` (REAL) e em
   `item_costs.last_rate`; a média vai para `item_costs.average_rate` via
   `applyCostEvent` (`src/data/repository.ts:356-360`, `src/data/repository.ts:420-432`).
10. Sobe para o servidor apenas a nota (`purchases`, `purchase_lines`, `movements`) —
    `item_costs` **não** é enfileirado, de propósito: "The average is derived, and a
    derived number gets one author" (`src/data/repository.ts:441-453`, com o `enqueue` em `src/data/repository.ts:455-459`). O servidor
    recalcula a mesma taxa pelo gatilho `purchase_moves_cost`
    (`supabase/migrations/0002_recipes.sql:267-269`).

#### 3.6.2 De volta: a contagem que vale R$ 18,88

Este é o único caminho de produção que passa por `amountOf`, e o e2e cobra o número
exato:

1. Duas sacas de 25 kg entraram a R$ 118 cada → saldo 50.000 g, `average_rate` 0,472.
2. A pessoa conta 46.000 g. `parseTyped('46000')` = `46000` (`app/inputs/[id].tsx:275`).
3. `recordCount` calcula `delta = counted - expected` = `-4000` e
   `deltaCents: amountOf(0.472, -4000)` = `-1888` (`src/data/repository.ts:976`).
4. A confirmação diz, em português, com os números por extenso:
   `Você contou 46.000 g`, `esperava 50.000 g`,
   `faltando 4.000 g, que valem R$ 18,88`, `nada é apagado`
   (`e2e/flow.mjs:1214-1217`).
5. O ajuste entra como movimento `adjustment` com `unit_cost_rate = averageRate`
   (`src/data/repository.ts:945-958`), e o grupo do movimento é a própria linha para
   que o estorno o encontre (`src/data/repository.ts:959-965`).

`4000 × 0,472 = 1888` centavos. É o número que amarra `rate`, `Rate` fracionária,
`amountOf` e o arredondamento único num só teste de navegador.

---

### 3.7 Invariantes, e exatamente o que os prende

| invariante | onde vive | o que o prende hoje |
|---|---|---|
| dinheiro é inteiro | `Cents` (`src/domain/money.ts:5`), `INTEGER`/`bigint` no esquema | `cents()`/`fromDecimal()` arredondam; `check (total_cents >= 0)` (`supabase/migrations/0002_recipes.sql:53`); teste `src/domain/money.test.ts:107-110`; mutação `scripts/mutate.mjs:671-675` |
| taxa é fracionária | `Rate` (`src/domain/money.ts:49`), `REAL`/`numeric(18,8)`/`double precision` | `assert.notEqual(Math.round(pulp), pulp)` (`src/domain/money.test.ts:62`); migração 0008; mutação `scripts/mutate.mjs:537-541` |
| só o valor final arredonda, uma vez | `amountOf` (`src/domain/money.ts:58-60`) e o pipeline de `costRecipe` (`src/domain/recipe.ts:161-186`) | `src/domain/money.test.ts:32-53`; mutação `scripts/mutate.mjs:531-535` |
| a direção do arredondamento é "para o mais próximo" | `Math.round` em `cents`, `fromDecimal`, `multiplyCents`, `amountOf`, `toBaseUnits`, `breakdown` | `src/domain/money.test.ts:35-41`; duas mutações (`floor` e `trunc`) |
| repartição nunca perde nem inventa centavo | `allocateCents`, `allocateByWeight` (`src/domain/money.ts:28-35`, `:82-99`) | `src/domain/money.test.ts:75-97`; mutação `scripts/mutate.mjs:543-547` |
| detalhamento soma o número que explica | `allocateByWeight` chamado em `src/domain/recipe.ts:177` | mesma mutação acima |
| fator de conversão nunca é chute | `packSize` devolve `null` em 5 situações (`src/domain/measure.ts:35-53`) | `src/domain/measure.test.ts` (13 asserções); 2 mutações |
| fração de unidade base é recusada, não arredondada | `Number.isInteger(total) ? total : null` (`src/domain/measure.ts:53`) | `src/domain/measure.test.ts:31`; mutação `scripts/mutate.mjs:677-681` |
| hierarquia começa em 1 e cresce | `isValidHierarchy` (`src/domain/units.ts:26-32`) | só `src/domain/units.test.ts` + mutação `scripts/mutate.mjs:664-669` — **nenhum chamador de produção verifica** |
| caixa é objeto: item sem faixa acima da base não vira caixa | `boxesOf` devolve `null` (`src/domain/units.ts:104-105`) | `src/domain/units.test.ts:83`; `app/(tabs)/index.tsx:204-217`; `app/(tabs)/transport.tsx:96-99` |
| um leitor e um escritor de número, inversos | `parseTyped` / `formatTyped` (`src/domain/number.ts`) | teste de propriedade `src/domain/number.test.ts:40-53`; e2e `e2e/flow.mjs:1133`, `e2e/flow.mjs:1158` |
| campo nunca recebe separador de agrupamento | `useGrouping: false` (`src/domain/number.ts:87`) | `src/domain/number.test.ts:55-61` |
| número na tela sai pelo formatador que sabe o idioma | `src/i18n/index.ts` | guarda `porCentoNaMao` (`src/layers.test.ts:502-519`) |

---

### 3.8 Limites, erros e o que não existe

#### 3.8.1 Nenhuma exceção; o erro é valor de retorno

Nenhuma das 17 funções dos quatro módulos lança. As convenções de falha:

| módulo | falha devolve | exemplo |
|---|---|---|
| `money.ts` | `0` para divisor não positivo; `[]` para lista vazia; zeros para total/peso não positivo | `src/domain/money.ts:29`, `:53`, `:63`, `:83`, `:86` |
| `measure.ts` | `null` sempre | `src/domain/measure.ts:37`, `:41`, `:45`, `:48`, `:53` |
| `units.ts` | `[]`, `null`, ou o valor de entrada intacto | `src/domain/units.ts:57`, `:77`, `:105` |
| `number.ts` | `null` para o que não é número | `src/domain/number.ts:34`, `:74` |

Nenhuma mensagem de erro para humano nasce nesses módulos — é a fundação "a camada de
dados devolve fato, não frase". As frases de recusa que o usuário lê estão no
dicionário e são escritas pela tela (3.2.5).

#### 3.8.2 Estado de cada exportação, em uma tabela só

| exportação | módulo | estado |
|---|---|---|
| `Cents` | money | tipo em uso por 4 arquivos de tela/assistente |
| `cents` | money | implementado, alcançado por tela |
| `fromDecimal` | money | implementado, chamado por tela |
| `toDecimal` | money | **implementado, sem chamador** |
| `multiplyCents` | money | **implementado, sem chamador** |
| `allocateCents` | money | **implementado, sem chamador** |
| `Rate` | money | tipo em uso |
| `rate` | money | implementado, chamado por tela |
| `amountOf` | money | implementado, alcançado por tela (contagem) |
| `rateFromCents` | money | implementado, alcançado por tela |
| `allocateByWeight` | money | implementado, alcançado por tela |
| `packSize` | measure | implementado, chamado por tela e pelo assistente |
| `PackagingTier` | units | tipo em uso |
| `PackagingHierarchy` | units | tipo em uso |
| `Breakdown` | units | tipo em uso interno |
| `isValidHierarchy` | units | **implementado, sem chamador** |
| `toBaseUnits` | units | **implementado, chamador só no `UnitStepper`, que nenhuma tela importa** |
| `breakdown` | units | implementado, alcançado por tela via `formatPacked` |
| `roundUpToFullContainer` | units | implementado, chamado por tela |
| `boxesOf` | units | implementado, chamado por duas telas |
| `parseTyped` | number | implementado, 10 telas + assistente |
| `formatTyped` | number | implementado, 3 telas |
| `formatWeight` | i18n | **implementado, sem chamador** |

Nenhuma dessas quatro exportações sem chamador tem marcador de fronteira registrado
(`ESCRITAS_ADIANTADO` é só para seções de dicionário, `src/dictionary.test.ts:39-48`) —
com a exceção do `UnitStepper`, cuja fronteira está escrita
(`src/dictionary.test.ts:45`).

#### 3.8.3 O que não existe nesses módulos, dito para não ser inventado

- **Conversão entre famílias de unidade** (massa ↔ volume, com ou sem densidade): NÃO
  IMPLEMENTADO, e a recusa é deliberada (`src/domain/measure.test.ts:25`).
- **Unidades imperiais, `oz`, `lb`, copos, colheres**: NÃO ESTÃO NO CÓDIGO, por decisão
  escrita (`src/domain/measure.ts:10-11`).
- **Conversão de moeda** (taxa de câmbio): NÃO IMPLEMENTADO. A moeda é da empresa e só
  muda a escrita (`src/i18n/company.ts:15-17`).
- **Validação em tempo de execução de `Cents`/`Rate`**: NÃO EXISTE. A marca é só de
  compilação e `as Cents` a contorna (3.1.2).
- **Arredondamento bancário / meio-par**: NÃO IMPLEMENTADO — é sempre `Math.round`,
  meio para +∞ (3.1.6).
- **Tradução da unidade base**: NÃO EXISTE chave de dicionário (3.5.6).
- **Máximo/mínimo, overflow, `Number.MAX_SAFE_INTEGER`**: nenhuma checagem em nenhum dos
  quatro módulos. `formatTyped(1e21)` sai como 22 dígitos e volta como `1e+21`
  (verificado) — sem teste.
- **Precisão além de 4 casas em campo**: perdida por padrão em `formatTyped`
  (`src/domain/number.ts:85`). As telas que precisam de menos passam explicitamente:
  1 casa para temperatura (`app/places.tsx:424`), 2 para porcentagem de perda
  (`app/recipes/[id].tsx:180`).
- **Um leitor único de verdade**: existem **dois** leitores de decimal no repositório —
  `parseTyped` (`src/domain/number.ts:32`) e a leitura interna de `packSize`
  (`src/domain/measure.ts:47`), que discordam sobre `'1.500'` (3.2.4). Sem teste e sem
  comentário.
- **Mutação guardando `number.ts`**: NÃO EXISTE (`scripts/mutate.mjs` não tem entrada
  para o arquivo).
