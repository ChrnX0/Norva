## 9. Banco do servidor — parte C (migrações 0023 a 0032) e as garantias verificadas

### 9.0 Inventário do bloco

Dez arquivos, todos em `supabase/migrations/`, aplicados em ordem alfabética do
nome — que é ordem numérica porque o prefixo é de quatro dígitos com zeros à
esquerda (`scripts/verify-migrations.sh:74`).

| Arquivo | Linhas | O que introduz |
|---|---|---|
| `0023_the_ruler_that_turns_a_balance_into_a_judgement.sql` | 16 | `items.full_level` |
| `0024_a_reading_is_a_fact_like_any_other.sql` | 75 | tabela `readings`, `locations.sensor_ranges`, duas políticas |
| `0025_what_the_kettle_makes_is_worth_something.sql` | 86 | função `apply_production_to_cost()` + gatilho `production_updates_cost` |
| `0026_which_sheet_made_this_one.sql` | 30 | `lots.recipe_version_id` + índice parcial |
| `0027_a_resend_is_not_a_decision.sql` | 95 | política `orders_resend`, função `private.a_resend_decides_nothing()`, gatilho `orders_decision_fields_stay_put` |
| `0028_the_index_under_what_was_reversed.sql` | 31 | índice parcial `movements_reversal_idx` |
| `0029_a_movement_cannot_point_at_another_company.sql` | 46 | três chaves estrangeiras compostas em `movements` |
| `0030_the_default_room_is_bookkeeping_not_a_privilege.sql` | 65 | políticas `locations_default_room` e `locations_default_room_resend` |
| `0031_a_reading_can_be_sent_twice.sql` | 73 | política `readings_resend`, função `private.a_resend_reads_nothing_new()`, gatilho `a_reading_resent_stays_the_same` |
| `0032_who_ordered_it_never_changes.sql` | 48 | reescreve `private.a_resend_decides_nothing()` para congelar `recorded_by` |

Nenhuma dessas dez migrações foi jamais modificada depois de ter entrado: o
histórico do git não registra um único commit com status `M` ou `D` sob
`supabase/migrations/` (`git log --diff-filter=MD -- supabase/migrations/`
devolve vazio para as 32 migrações do repositório).

---

### 9.1 Migração 0023 — `items.full_level`, a régua que transforma saldo em juízo

#### 9.1.1 O DDL, por inteiro

```sql
alter table items add column full_level numeric(14,4)
  check (full_level is null or full_level > 0);
```

(`supabase/migrations/0023_the_ruler_that_turns_a_balance_into_a_judgement.sql:15-16`)

Não há `not null`, não há `default`, não há índice, não há comentário de coluna.
A restrição de checagem aceita nulo explicitamente e recusa zero e negativo
(`0023:16`).

#### 9.1.2 A razão escrita no arquivo

As faixas de volume foram desenhadas pelo dono em porcentagem — "vermelho até
25, amarelo até 40, verde no meio, azul acima de 80, e zerado à parte" — e
porcentagem é sempre de alguma coisa; sem referência cadastrada, "20%" é número
que ninguém pode conferir, e pintar a linha de vermelho por conta própria seria
o alerta inventado que ensina a ignorar alerta (`0023:3-7`).

Nulo é declarado o caso normal: o item não entra na leitura por faixa e nenhuma
tela pinta cor nele — a mesma forma de `products.shelf_life_days`, campo
opcional cujo vazio significa "não me pergunte isso" (`0023:9-11`).

A unidade é a unidade-base do estoque, como todo o resto, para que a porcentagem
se calcule sem conversão no caminho: um saco de 50 kg de açúcar é 50000 g
(`0023:13-14`).

#### 9.1.3 O espelho no aparelho

No SQLite do aparelho a mesma coluna entra como `V14`, sem restrição de
checagem e com tipo `REAL`:

```sql
ALTER TABLE items ADD COLUMN full_level REAL;
```

(`src/data/db.ts:576-578`; a lista `MIGRATIONS` que a inclui está em
`src/data/db.ts:676-678`)

A diferença de tipo é real: `numeric(14,4)` no servidor, `REAL` (ponto flutuante)
no aparelho. O arquivo não explica a escolha. NÃO ESTÁ NO CÓDIGO nenhuma
justificativa para essa divergência de precisão.

#### 9.1.4 A régua que consome a coluna, com os números exatos

```ts
export function volumeBand(
  onHand: number,
  fullLevel: number | null,
  bands: AlertSettings['bands'],
): VolumeBand | null {
  if (fullLevel === null || !(fullLevel > 0)) return null;
  if (onHand <= 0) return 'zerado';

  const share = (onHand / fullLevel) * 100;
  if (share <= bands.red) return 'vermelho';
  if (share <= bands.yellow) return 'amarelo';
  if (share >= bands.blue) return 'azul';
  return 'verde';
}
```

(`src/domain/alerts.ts:133-146`)

O tipo é `type VolumeBand = 'zerado' | 'vermelho' | 'amarelo' | 'verde' | 'azul'`
(`src/domain/alerts.ts:131`). Os limiares padrão são
`bands: { red: 25, yellow: 40, blue: 80, notifyFull: false }`
(`src/domain/alerts.ts:116`). As faixas que podem notificar são
`['zerado', 'vermelho', 'amarelo', 'azul']` — o verde pinta e nunca interrompe
(`src/domain/alerts.ts:156`).

#### 9.1.5 Estado: **implementado e chamado por tela**

- Escrita: `app/inputs/new.tsx:320` (`fullLevel: (parseTyped(fullLevel) ?? 0) > 0 ? ... : null`) e `app/products/new.tsx:342`.
- Leitura com cor: `app/inputs/index.tsx:332` e `app/inputs/index.tsx:404-407` (o texto `${Math.round((item.onHandBaseUnits / item.fullLevel) * 100)}%`).
- Alimenta os avisos: `src/notify/facts.ts:94-100` monta `volumes` com `fullLevel: i.fullLevel`; item sem régua "continua fora por si mesmo, sem filtro nenhum" (`src/notify/facts.ts:92-93`).
- Atravessa a fila de sincronia: `'full_level'` está na lista `take` de `items` em `src/sync/serialize.ts:179`.
- Preservação em edição parcial: `saveItem` relê o valor anterior quando `fullLevel` vem `undefined`, porque um `excluded.full_level` nulo apagaria a régua (`src/data/repository.ts:235-244`, `src/data/repository.ts:257`).

---

### 9.2 Migração 0024 — `readings`: a leitura de uma grandeza num lugar

#### 9.2.1 A tabela, coluna por coluna

```sql
create table readings (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete restrict,
  device_id   uuid references devices(id) on delete set null,

  kind        text not null,
  value       numeric(14,4) not null,
  unit        text not null,

  taken_at    timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  source      text not null default 'typed',

  constraint reading_has_a_unit check (length(trim(unit)) > 0),
  constraint reading_has_a_kind check (length(trim(kind)) > 0)
);
```

(`0024:25-48`)

| Coluna | Tipo | Nulo? | Regra escrita |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | `0024:26` |
| `company_id` | `uuid` | not null, FK `companies(id) on delete cascade` | `0024:27` |
| `location_id` | `uuid` | not null, FK `locations(id) on delete restrict` | `0024:28` |
| `device_id` | `uuid` | **anulável**, FK `devices(id) on delete set null` | nulo é a leitura digitada por uma pessoa (`0024:29-30`) |
| `kind` | `text` | not null | TEXTO ABERTO de propósito (`0024:9-12`) |
| `value` | `numeric(14,4)` | not null | `0024:33` |
| `unit` | `text` | not null | `0024:34` |
| `taken_at` | `timestamptz` | not null | quando a medição aconteceu no mundo, não quando chegou ao servidor (`0024:36-39`) |
| `recorded_at` | `timestamptz` | not null default `now()` | `0024:40` |
| `recorded_by` | `uuid` | not null, FK `auth.users(id)` | obrigatório e incedível, como em `movements` (`0024:22-24`, `0024:41`) |
| `source` | `text` | not null default `'typed'` | `0024:42` |

Índice: `create index readings_where_idx on readings (company_id, location_id, kind, taken_at desc);` (`0024:50`).

#### 9.2.2 As quatro decisões de desenho, transcritas

1. **`kind` e `unit` são TEXTO ABERTO.** Grandeza nova e protocolo novo entram como dado. "Fechar num enum seria transformar 'quero medir umidade também' numa migração, e o custo apareceria justamente quando ele estivesse com o hardware na mão." (`0024:9-12`)
2. **`source` também é texto.** Os valores nomeados no arquivo são `typed`, `ble`, `wifi`, `zigbee`, `lora` — nomeados em comentário, **não** em restrição: qualquer texto entra (`0024:13-14`). "O que importa para a integridade não é o rádio, é o lugar e quem gravou."
3. **`device_id` é NULO quando alguém digitou na conferência.** "Leitura digitada é fato tanto quanto leitura de sensor, e é o único caminho que funciona hoje" (`0024:15-18`).
4. **Mais de uma câmara já estava resolvido:** cada câmara é um `location`, e N sensores são N `devices` apontando para lugares diferentes (`0024:19-20`).

A origem do pedido está registrada: o dono pediu alarme de temperatura da câmara
fria, disse que vai arrumar um ESP32 para vender o módulo, lembrou que muita
fábrica tem mais de uma câmara, e depois somou umidade, pressão e ruído
(`0024:3-7`).

Justificativa da restrição de unidade: "Uma grandeza sem unidade é um número
solto: 4 é geladeira boa em Celsius e freezer quebrado em Fahrenheit."
(`0024:44-45`)

#### 9.2.3 `locations.sensor_ranges` — a faixa aceitável

```sql
alter table locations add column sensor_ranges jsonb not null default '{}'::jsonb;

alter table locations add constraint locations_sensor_ranges_is_an_object
  check (jsonb_typeof(sensor_ranges) = 'object');
```

(`0024:57-60`)

A razão do lugar escolhido: "Mora na linha do lugar pelo mesmo motivo que a lista
de embalagem mora na do produto: é curta, é reescrita inteira e não tem histórico
próprio. O histórico é a série de leituras, que ninguém reescreve." (`0024:52-56`)

#### 9.2.4 As duas políticas de RLS nascidas aqui

```sql
alter table readings enable row level security;

create policy readings_read on readings for select
  using (company_id in (select private.current_companies()));

create policy readings_write on readings for insert
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  );
```

(`0024:62-75`)

Razão da leitura: "Ler leitura é de quem lê o lugar: a temperatura da câmara não
é dinheiro, e quem está no chão de fábrica precisa dela mais que o escritório."
(`0024:64-65`)

Razão da escrita: "Escrever é de quem registra estoque — a mesma capacidade da
contagem, porque é o mesmo gesto: alguém foi até a câmara e anotou o que viu."
(`0024:69-70`)

**Nenhuma política de `update` nasceu aqui.** É esse buraco que a 0031 conserta
(§9.9).

#### 9.2.5 O espelho no aparelho (`V15`)

```sql
CREATE TABLE IF NOT EXISTS readings (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  device_id   TEXT,
  kind        TEXT NOT NULL,
  value       REAL NOT NULL,
  unit        TEXT NOT NULL,
  taken_at    TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'typed'
);

CREATE INDEX IF NOT EXISTS readings_where_idx
  ON readings (company_id, location_id, kind, taken_at);

ALTER TABLE locations ADD COLUMN sensor_ranges TEXT NOT NULL DEFAULT '{}';
```

(`src/data/db.ts:602-620`)

Diferenças materiais entre os dois lados, todas verificadas:

| Aspecto | Servidor | Aparelho |
|---|---|---|
| `recorded_by` | coluna obrigatória (`0024:41`) | **não existe** (`src/data/db.ts:603-614`) |
| `device_id` FK | `references devices(id)` (`0024:30`) | `TEXT` solto — **não existe tabela `devices` no aparelho** (nenhum `CREATE TABLE devices` em `src/data/db.ts`) |
| `value` | `numeric(14,4)` | `REAL` |
| Índice | `taken_at desc` | `taken_at` (ascendente) |
| `sensor_ranges` | `jsonb` com checagem de tipo | `TEXT` |
| Restrições `reading_has_a_unit` / `_a_kind` | presentes | ausentes (validadas em código: `src/data/repository.ts:2781-2782`) |

A costura é feita pelo serializador: `recorded_by` é estampado a partir do ator,
e o resto atravessa cru.

```ts
readings: {
  take: [
    'id', 'company_id', 'location_id', 'device_id',
    'kind', 'value', 'unit', 'taken_at', 'recorded_at', 'source',
  ],
  build: (_row, actor) => ({ recorded_by: actor.userId }),
},
```

(`src/sync/serialize.ts:131-147`; o comentário em `:132-133` diz que `device_id`
nulo atravessa como nulo mesmo, "porque pessoa não é aparelho")

E `sensor_ranges` é convertido de texto para estrutura antes de subir:
`build: (row) => ({ sensor_ranges: structure(row.sensor_ranges) })`
(`src/sync/serialize.ts:166`) — sem isso o Postgres guardaria "uma string entre
aspas onde deveria haver objeto" (`scripts/device-session.ts:182-186`).

#### 9.2.6 O que a camada de dados expõe

```ts
export type SensorRange = { min: number | null; max: number | null; unit: string };
```

(`src/data/repository.ts:2717`)

```ts
export type Reading = {
  id: string;
  locationId: string;
  kind: string;
  value: number;
  unit: string;
  takenAt: string;
  source: string;
};
```

(`src/data/repository.ts:2751-2759`)

Três funções:

- `recordReading(companyId, { locationId, kind, value, unit, takenAt?, deviceId?, source? })` — recusa valor não finito ("uma leitura que não é número não é leitura") e unidade vazia ("uma grandeza sem unidade é um número solto"), chama `ensureLocation`, insere e enfileira `{ table: 'readings', rowId: id }` numa transação (`src/data/repository.ts:2769-2820`). `source` padrão `'typed'` (`:2805`), `taken_at` padrão = agora (`:2787`).
- `lastReadings(companyId)` — a última leitura de cada `(location_id, kind)`, por `MAX(taken_at)` (`src/data/repository.ts:2828-2864`).
- `readingsBetween(companyId, locationId, kind, fromIso, toIso)` — a série, `taken_at >= from AND taken_at < to`, ordem crescente (`src/data/repository.ts:2867-2883`).

`parseSensorRanges` é tolerante por decisão escrita: JSON inválido devolve `{}`,
chave estranha é ignorada, faixa sem `unit` string não vazia é ignorada, e
`min`/`max` não numéricos viram `null` — "faixa que não pôde ser lida vira 'não
julgo' em vez de vira alarme aleatório" (`src/data/repository.ts:2719-2748`).

#### 9.2.7 Estado: **implementado e chamado por tela**

`app/places.tsx` é a tela. Ela importa `lastReadings`, `readingsBetween`,
`recordReading` e o tipo `Reading` (`app/places.tsx:22-31`), carrega as três
coisas em paralelo (`app/places.tsx:107-112`), usa `TEMPERATURA = 'temperature'`
como a única grandeza que existe hoje (`app/places.tsx:369`), grava com
`recordReading` sem `deviceId` (`app/places.tsx:494-499` — logo `device_id` é
sempre nulo na prática), edita a faixa por `savePlace(..., { sensorRanges: ... })`
(`app/places.tsx:444-452`), decide "fora da faixa" com
`(faixa.min !== null && last.value < faixa.min) || (faixa.max !== null && last.value > faixa.max)`
(`app/places.tsx:460-464`), e só quando está fora consulta
`lotsInRoomAt(LOCAL_COMPANY_ID, place.id, last.takenAt)` para dizer o que estava
exposto — no instante da própria leitura ruim, não no de agora
(`app/places.tsx:466-487`).

Um detalhe de produto registrado ali: a leitura é impressa com uma casa decimal
por `formatTyped(last.value, locale.formatting, 1)` porque `formatQuantity`
arredondava e "-18,4 aparecia como -18 na tela enquanto o banco guardava a
fração" (`app/places.tsx:512-516`).

Os avisos também leem: `src/notify/facts.ts:110-123` monta `ambient` cruzando
cada leitura com `lugar?.sensorRanges[r.kind]`, expondo `min`, `max` e
`hoursOld`.

`readings` também está na lista de tabelas que o apagamento de dados cobre
(`src/data/erase.ts:34`, `src/data/erase.ts:145`).

---

### 9.3 Migração 0025 — o que sai do tacho passa a valer o que custou fazer

#### 9.3.1 O defeito, com o número que o denunciou

`apply_purchase_to_cost` (0009) é o único autor de `item_costs` no servidor, e
dispara em `purchase_lines`. Picolé nunca é comprado — sai do tacho — então
nunca teve linha em `item_costs`, então valia zero (`0025:3-5`).

O efeito somado: "O consumo tira o insumo do saldo com o valor dele junto, e a
produção põe o produto de volta valendo nada: **o dinheiro evapora do balanço a
cada corrida**. Na `stock_balances` de uma loja com 1.466 picolés, 'vale R$
0,00'." (`0025:7-10`)

E a divergência já observada entre os dois lados quando se tentou mandar o número
pronto: **0.5605 contra 0.5310** (`0025:16`). A decisão que saiu disso:
`item_costs` continua fora da fila de sincronia — "valor derivado tem um autor
por lado" (`0025:12-16`).

#### 9.3.2 A função, por inteiro

```sql
create or replace function apply_production_to_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  held_units bigint;
  held_rate  numeric(18,8);
  new_rate   numeric(18,8);
begin
  if new.kind <> 'production'
     or new.quantity_base_units <= 0
     or new.unit_cost_rate is null then
    return new;
  end if;

  select coalesce(sum(quantity_base_units), 0)
    into held_units
    from movements
   where company_id = new.company_id
     and item_id = new.item_id
     and id <> new.id;

  select average_rate
    into held_rate
    from item_costs
   where company_id = new.company_id and item_id = new.item_id;

  if held_rate is null then
    held_rate := 0;
  end if;

  held_units := greatest(held_units, 0);
  new_rate := ((held_rate * held_units) + (new.unit_cost_rate * new.quantity_base_units))
              / (held_units + new.quantity_base_units);

  insert into item_costs (company_id, item_id, average_rate, last_rate, updated_at)
  values (new.company_id, new.item_id, new_rate, new.unit_cost_rate, now())
  on conflict (company_id, item_id) do update
    set average_rate = excluded.average_rate,
        last_rate = excluded.last_rate,
        updated_at = now();

  insert into item_cost_history (company_id, item_id, purchase_line_id, previous_rate, new_rate)
  values (new.company_id, new.item_id, null, nullif(held_rate, 0), new_rate);

  return new;
end;
$$;

drop trigger if exists production_updates_cost on movements;
create trigger production_updates_cost
  after insert on movements
  for each row
  execute function apply_production_to_cost();
```

(`0025:26-86`)

#### 9.3.3 As três guardas de saída e por que existem

`if new.kind <> 'production' or new.quantity_base_units <= 0 or new.unit_cost_rate is null then return new; end if;`
(`0025:39-43`). O comentário: "Só a perna que CRIA produto. O consumo é negativo
e não move a média do insumo, que é o que o aparelho já dizia em comentário desde
o começo." (`0025:37-38`)

#### 9.3.4 A fórmula, e a fonte do número

Média móvel ponderada, com o saldo de antes excluindo a própria linha por id:

```
held_units = Σ quantity_base_units WHERE company_id = X AND item_id = Y AND id <> esta_linha
held_units = max(held_units, 0)
new_rate   = (held_rate × held_units + unit_cost_rate × quantity_base_units)
             ÷ (held_units + quantity_base_units)
```

(`0025:45-63`)

A fonte é `movements.unit_cost_rate`: "a taxa que a corrida congelou, com a
embalagem por unidade já dentro. Não se recalcula a receita no servidor —
recalcular é convidar os dois lados a divergirem por arredondamento, e a taxa
congelada é o fato que o razão guarda." (`0025:18-21`)

O motivo de excluir por id: "Como em 0009, o 'antes' exclui a própria linha por
id: a ordem em que a fila chega não muda o resultado, e um reenvio não dobra a
média." (`0025:23-24`)

#### 9.3.5 A escrita em `item_cost_history` sem nota

`purchase_line_id` entra **nulo** porque não houve compra; "a coluna sempre
aceitou nulo, e é por isso que este passo não precisa mexer na tabela"
(`0025:72-74`). Confere: `purchase_line_id uuid references purchase_lines(id) on delete set null`
em `supabase/migrations/0002_recipes.sql:90`.

`previous_rate` é `nullif(held_rate, 0)` — zero vira nulo, ou seja "não havia
média antes" (`0025:76`).

#### 9.3.6 Estruturas das tabelas que a função escreve

```sql
create table item_costs (
  company_id   uuid not null references companies(id) on delete cascade,
  item_id      uuid not null references items(id) on delete cascade,
  average_rate numeric(18,8) not null default 0,
  last_rate    numeric(18,8),
  updated_at   timestamptz not null default now(),
  primary key (company_id, item_id)
);
```

(`supabase/migrations/0002_recipes.sql:73-82` — sem a coluna
`on_hand_base_units`, removida em `supabase/migrations/0009_average_asks_the_ledger.sql:75`)

```sql
create table item_cost_history (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  item_id          uuid not null references items(id) on delete cascade,
  purchase_line_id uuid references purchase_lines(id) on delete set null,
  previous_rate    numeric(18,8),
  new_rate         numeric(18,8) not null,
  observed_at      timestamptz not null default now()
);

create index item_cost_history_idx on item_cost_history (company_id, item_id, observed_at desc);
```

(`supabase/migrations/0002_recipes.sql:86-96`)

#### 9.3.7 O espelho: a função gêmea de 0009 e a do aparelho

A gêmea da compra (`apply_purchase_to_cost`, gatilho `purchase_moves_cost` em
`supabase/migrations/0002_recipes.sql:271`) difere em três pontos, todos
verificáveis lado a lado:

| | compra (0009) | produção (0025) |
|---|---|---|
| dispara em | `purchase_lines` | `movements` (`0025:84`) |
| numerador | `held_rate × held_units + new.total_cents` (`0009:58`) | `held_rate × held_units + new.unit_cost_rate × new.quantity_base_units` (`0025:62-63`) |
| `last_rate` | `line_rate = new.total_cents::numeric / new.base_units` (`0009:34`) | `new.unit_cost_rate` (`0025:66`) |
| `purchase_line_id` no histórico | `new.id` (`0009:69`) | `null` (`0025:76`) |

No aparelho a autoria da média do produto é de `recordProduction`, com a mesma
regra escrita em TypeScript:

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

Chamada com o saldo lido **antes** da entrada existir, "senão a corrida entraria
na média de si mesma" (`src/data/repository.ts:1556-1583`), e a taxa congelada é
que entra, não a soma dos consumos, porque ela já carrega
`unitPackagingCents` (`src/data/repository.ts:1575-1579`).

Uma diferença de tipo que o código não comenta: `movements.unit_cost_rate` é
`double precision` (`supabase/migrations/0008_ledger_speaks_phase_one.sql:79`),
enquanto `held_rate` e `new_rate` são `numeric(18,8)` (`0025:33-35`). O produto
`new.unit_cost_rate * new.quantity_base_units` portanto passa por ponto flutuante
antes de virar `numeric`. NÃO ESTÁ NO CÓDIGO nenhuma nota sobre isso.

#### 9.3.8 Estado: **implementado, e exercitado pela checagem 6 do `db:verify`**

Não existe tela do servidor. O gatilho é exercitado pela garantia 6
(`scripts/verify-migrations.sh:531-542`), que compara a média do produto
calculada pelo Postgres com a calculada pelo aparelho.

---

### 9.4 Migração 0026 — qual ficha fez este lote

#### 9.4.1 O DDL

```sql
alter table lots add column recipe_version_id uuid references recipe_versions(id);

create index lots_recipe_version_idx on lots (company_id, recipe_version_id)
  where recipe_version_id is not null;
```

(`0026:27-30`)

#### 9.4.2 O defeito e a razão da forma

A auditoria da Fase 1 marcou isto como o único item ausente, "e ele voltou pela
metade: `production_runs.recipe_version_id` recebia o id da RECEITA na coluna da
VERSÃO, e a linha da corrida é apagada ao fechar ou cancelar. Nada durável, dos
dois lados, dizia de que ficha aquele picolé saiu." (`0026:3-6`)

O custo: "sem o carimbo, custo histórico e recall passam a apontar para a receita
de HOJE, e uma correção feita em março reescreve o que janeiro custou. O
livro-razão é imutável exatamente para isso não acontecer — a taxa congelada
continuava certa, mas a pergunta 'de que ficha veio?' não tinha resposta em lugar
nenhum." (`0026:8-12`)

Por que no lote e não na corrida: "porque o lote é o que sobrevive: ele não é
apagado, é o que a etiqueta nomeia, e é por ele que um recall começa."
(`0026:14-15`)

Por que anulável: "Lote de importação não tem ficha, e lote gravado antes desta
migração também não — pôr `not null` aqui obrigaria a inventar uma ficha para
linhas que não têm, que é o oposto do que esta coluna existe para fazer. A chave
estrangeira, essa é de verdade: um lote que aponta para uma versão que não existe
é pior que um lote calado." (`0026:17-21`)

Por que não há ordenação explícita na fila: "a versão da receita é gravada quando
a ficha é salva, muito antes da corrida que a usa, e a fila sobe da escrita mais
velha para a mais nova." (`0026:23-25`)

#### 9.4.3 O espelho no aparelho (`V16`)

`ALTER TABLE lots ADD COLUMN recipe_version_id TEXT;` (`src/data/db.ts:641-643`),
sem chave estrangeira — no aparelho é só um `TEXT`.

#### 9.4.4 Estado: **implementado e chamado**

- Escrita: `src/data/repository.ts:1517` insere `lots` com a coluna na lista `(id, company_id, item_id, code, produced_on, expires_on, recipe_version_id, created_at)`.
- Sincroniza: `'recipe_version_id'` na lista `take` de `lots` (`src/sync/serialize.ts:264-273`), com o comentário de dependência resolvida pela ordem da fila (`src/sync/serialize.ts:261-263`).
- Leitura: duas consultas juntam a versão — `LEFT JOIN recipe_versions v ON v.id = l.recipe_version_id` (`src/data/repository.ts:3141`) e `JOIN recipe_versions v ON v.id = l.recipe_version_id` (`src/data/repository.ts:3567`).
- Coberto por teste que distingue versão de receita: `src/data/repository.test.ts:1107-1125`, com a asserção "a coluna recipe_version_id guarda a VERSÃO; o id da receita ali é a fórmula de hoje respondendo pela de ontem".
- Exercitado ponta a ponta pela garantia 6 (`scripts/verify-migrations.sh:551-554`).

---

### 9.5 Migração 0027 — um reenvio não é uma decisão

#### 9.5.1 O defeito, com a aritmética de papéis

"Aqui não é ausência de política de update: é política de update com a capacidade
ERRADA. `orders_place` deixa entrar quem tem `place_order`, e `orders_decide` só
deixa mexer quem tem `approve_order`, `dispatch` ou `manage_company`. Três dos
sete papéis do produto — `storeManager`, `customer` e `salesperson` — têm o
primeiro e nenhum dos três." (`0027:10-14`)

As políticas de 0019 que criam o problema:

```sql
create policy orders_place on orders for insert
  with check (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  );

create policy orders_decide on orders for update
  using (
    private.has_capability(company_id, 'approve_order')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'manage_company')
  )
  with check ( ...as mesmas três... );
```

(`supabase/migrations/0019_an_order_is_demand.sql:163-183`)

O efeito na fábrica: "a gerente da loja anota o pedido sem sinal. A primeira
subida entra. A segunda é recusada, e o `src/sync/engine.ts` para a fila no
primeiro buraco de propósito — então produção, contagem e leitura de câmara
gravadas DEPOIS daquele pedido ficam presas atrás dele para sempre, sem nada na
tela dizendo o quê." (`0027:16-20`)

E a frase do `docs/insights.md` que não cobriu o caso: *"todas as outras tabelas
que ela escreve têm um `_manage FOR ALL`, que cobre update"* — `orders` **tem**
política de update, "e é por isso que a busca por 'tabela sem update' não a
encontrou" (`0027:22-25`). A tabela filha acertou na mesma migração:
`order_lines_correct` é `for all` com `place_order`
(`0027:26-27`; `supabase/migrations/0019_an_order_is_demand.sql:185-187`).

#### 9.5.2 Por que a barra não pegou — a lacuna nomeada

"A conta que sobe a fila na checagem 6 do `db:verify` recebe
`enum_range(null::capability)` — todas as capacidades. E a checagem 8, que é a do
pedido, dá à 'Vendedora' `place_order` MAIS `dispatch`, e é o `dispatch` que faz o
update passar. Nenhuma conta com `place_order` sozinho jamais rodou a segunda
passagem. A checagem 9 desta entrega é exatamente isso: a fila subida duas vezes
pela capacidade MÍNIMA de cada papel que escreve." (`0027:29-35`)

#### 9.5.3 A política de reenvio

```sql
create policy orders_resend on orders
  for update using (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  )
  with check (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  );
```

(`0027:42-50`)

"`recorded_by = auth.uid()` nos dois lados espelha o que `orders_place` já exige:
só a conta que escreveu alcança a linha, e ela não pode passá-la para outra pessoa
no meio do reenvio." (`0027:39-41`)

#### 9.5.4 O gatilho que devolve o status em vez de recusar

```sql
create or replace function private.a_resend_decides_nothing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    private.has_capability(new.company_id, 'approve_order')
    or private.has_capability(new.company_id, 'dispatch')
    or private.has_capability(new.company_id, 'manage_company')
  ) then
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;

create trigger orders_decision_fields_stay_put
  before update on orders
  for each row execute function private.a_resend_decides_nothing();
```

(`0027:65-95`)

Por que gatilho e não política: "Uma política de RLS não consegue dizer 'contanto
que não mude': a expressão não enxerga o antes e o depois ao mesmo tempo. Quem
sabe as duas coisas é o gatilho" (`0027:54-56`).

Por que devolver e não recusar, e isto é declarado como escolha: "recusar
deixaria a fila travada outra vez, que é o defeito que esta migração existe para
matar. O aparelho de quem não decide não tem tela para decidir — ele não está
tentando aprovar, está reenviando o que já mandou." (`0027:61-64`)

#### 9.5.5 O NOME DO GATILHO É LOAD-BEARING — transcrito por inteiro

"O Postgres roda os gatilhos `before` da mesma tabela em ordem ALFABÉTICA de
nome. Este precisa vir antes de `orders_leave_pending_only_by_approval`: se
aquele rodar primeiro, ele vê um status novo diferente do velho, levanta exceção,
e a fila trava — que é exatamente o que se está consertando.
`orders_decision_fields_stay_put` < `orders_leave_pending_only_by_approval`
porque 'd' vem antes de 'l'. Renomear qualquer um dos dois sem conferir isto
devolve o defeito sem nenhum teste ficar vermelho por outro motivo."
(`0027:84-92`)

O gatilho que precisa vir depois é o de 0019, cuja mensagem de erro é decisão de
produto: `'Este pedido espera aprovação, e aprovar não faz parte do seu acesso.'`
(`supabase/migrations/0019_an_order_is_demand.sql:139-140`).

#### 9.5.6 Estado: **implementado; exercitado pela checagem 9, sem tela**

Não há transporte real de sincronia no repositório (§9.11), então o único
exercício é `scripts/verify-migrations.sh:688-730`.

---

### 9.6 Migração 0028 — o índice embaixo de "o que foi estornado não aconteceu"

#### 9.6.1 O DDL

```sql
create index if not exists movements_reversal_idx
  on movements (reverses_movement_id, company_id)
  where reverses_movement_id is not null;
```

(`0028:29-31`)

#### 9.6.2 A cláusula que ele existe para servir

```ts
const NAO_ESTORNADO = `NOT EXISTS (SELECT 1 FROM movements rev
                                    WHERE rev.reverses_movement_id = m.id
                                      AND rev.company_id = m.company_id)`;
```

(`src/data/repository.ts:750-752`)

É constante e não função de apelido de propósito: "as oito consultas chamam a
tabela de `m`, e montar SQL por interpolação — mesmo com um apelido que nunca veio
de fora — é o padrão que a proofgate marca, com razão" (`src/data/repository.ts:745-748`).

Correção factual sobre a própria documentação: o docblock e a 0028 dizem "oito
consultas" (`0028:6`, `src/data/repository.ts:745`), mas hoje a interpolação
`${NAO_ESTORNADO}` aparece em **nove** consultas — `src/data/repository.ts` nas
linhas 728, 2213, 2535, 2588, 2623, 2694, 2922, 3336 e 4375. A contagem escrita
ficou uma atrás.

#### 9.6.3 Os números medidos, transcritos

Contra um SQLite de 60 mil movimentos — cinco meses de uma fábrica de seis lojas
—, janela de sete dias, 2.779 linhas candidatas (`0028:9-11`, e a mesma tabela em
`src/data/db.ts:655-660`):

| Cenário | Tempo |
|---|---|
| com a cláusula, sem índice | **9.906 ms** |
| sem a cláusula | 3 ms |
| com a cláusula e o índice | 4 ms |

"O aparelho é mais lento que a máquina onde isso foi medido, então esses números
são o piso." (`0028:12-13`) O plano do SQLite sem índice era `SCAN rev`
(`src/data/db.ts:651`).

#### 9.6.4 As duas decisões de forma

**Parcial de propósito:** "só as linhas de estorno entram. Estorno é raro por
natureza — uma corrida corrigida por semana numa fábrica — então o índice ocupa
praticamente nada e continua ocupando pouco daqui a dois anos." (`0028:20-22`)

**`concurrently` NÃO é usado, e a razão é operacional:** "a migração roda em
transação pelo `supabase db push`, e `create index concurrently` é recusado dentro
de uma. Numa tabela de estornos — que hoje tem zero linhas em qualquer empresa —
o bloqueio é instantâneo." (`0028:24-27`)

#### 9.6.5 A razão do lado do servidor

"a vista `movements_visible` — que é por onde o dado sai — carrega a coluna, e o
dia em que um relatório do lado de cá filtrar por estorno ele encontra o mesmo
abismo com um Postgres muito maior embaixo." (`0028:15-18`) Confere: a vista
projeta `m.reverses_movement_id`
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:86`).

#### 9.6.6 Estado: **implementado no servidor SEM CHAMADOR; implementado e chamado no aparelho**

Do lado do servidor, nenhuma consulta filtra por `reverses_movement_id`: as
únicas aparições em `supabase/migrations/` são a definição da coluna
(`supabase/migrations/0001_foundation.sql:209`), a restrição
`reversal_points_somewhere` (`0001_foundation.sql:223`) e a projeção nas duas
versões da vista (`0001_foundation.sql:333`,
`0008_ledger_speaks_phase_one.sql:86`). O índice é preventivo, e o próprio arquivo
o diz ("o dia em que um relatório do lado de cá filtrar", `0028:16-17`).

No aparelho o espelho é `V17` (`src/data/db.ts:670-674`), e lá as nove consultas
citadas acima o usam.

---

### 9.7 Migração 0029 — um movimento não pode apontar para outra empresa

#### 9.7.1 O defeito

"A política de escrita pergunta se a pessoa pode gravar NAQUELA empresa —
`has_capability(company_id, 'record_production')` — e ninguém perguntava se o item
é DAQUELA empresa. As chaves estrangeiras de `movements` eram simples:
`item_id references items(id)`, `location_id references locations(id)`."
(`0029:3-6`; confere com `supabase/migrations/0001_foundation.sql:193` e `:197`)

O ataque: "Um operador cuja única associação é a empresa A conseguia inserir no
razão de A um movimento apontando para o item e o almoxarifado da empresa B. A
linha entra, o saldo de A passa a falar de um item que não é de A, e o
livro-razão é append-only: a linha não sai nunca mais." (`0029:8-11`)

E não precisa adivinhar id: "`ensureLocation` cria o lugar padrão com
`id = company_id`, então o id do almoxarifado de B **é** o id de B — e o id de uma
empresa é legível para quem esteve nela." (`0029:13-15`)

O padrão certo já existia: "a 0019 pôs `unique (id, company_id)` em `items` e
`locations` exatamente para o pedido poder dizer
`foreign key (place_id, company_id) references locations (id, company_id)`. A
tabela mais importante do sistema era a que não usava." (`0029:17-20`; confere
com `supabase/migrations/0019_an_order_is_demand.sql:36-37`)

#### 9.7.2 As três restrições, por inteiro

```sql
alter table movements
  add constraint movement_item_same_company
  foreign key (item_id, company_id) references items (id, company_id)
  on delete restrict;

alter table movements
  add constraint movement_location_same_company
  foreign key (location_id, company_id) references locations (id, company_id)
  on delete restrict;

alter table movements
  add constraint movement_counterpart_same_company
  foreign key (counterpart_location_id, company_id) references locations (id, company_id)
  on delete restrict;
```

(`0029:29-46`)

#### 9.7.3 O MATCH SIMPLE aqui é aliado, e isso é declarado

"A contraparte é anulável — nem todo movimento tem outro lado —, e a chave
composta respeita isso: em Postgres, uma chave estrangeira multicoluna com
qualquer coluna nula não é verificada (MATCH SIMPLE, que é o padrão). O que ela
impede é o caso que importa: contraparte preenchida apontando para fora."
(`0029:39-42`)

Contraste registrado no repositório: em 0018 o mesmo MATCH SIMPLE era o defeito,
e a solução foi `match full`
(`supabase/migrations/0018_a_product_has_a_family.sql:97-107`).

#### 9.7.4 A fronteira deixada de fora, escrita para não ser redescoberta

"`lots` fica de fora desta migração de propósito: ele não tem
`unique (id, company_id)`, então a chave composta pediria um índice novo. O risco
lá é menor — o lote não entra em nenhuma soma de saldo, ele é identidade — e
misturar as duas coisas numa migração faria a parte cara atrasar a barata. Fica
escrito aqui para não ser redescoberto: `movements.lot_id` ainda é chave simples."
(`0029:22-27`; confere: `lot_id uuid references lots(id) on delete restrict` em
`supabase/migrations/0001_foundation.sql:200`)

#### 9.7.5 Estado: **implementado; exercitado pela checagem 10**

`scripts/verify-migrations.sh:732-771`.

---

### 9.8 Migração 0030 — o lugar padrão é escrituração, não privilégio

#### 9.8.1 A quarta aparição da fila travada

"`ensureLocation` cria o lugar padrão da empresa no PRIMEIRO movimento de
qualquer aparelho — com `id = company_id`, nome vazio, `kind = 'store_room'` — e o
enfileira, porque ele tem que chegar ao servidor antes do movimento que se apoia
nele. A política que recebe essa linha é `locations_manage`, que exige
`manage_company`." (`0030:3-7`)

A política em questão:

```sql
create policy locations_manage on locations
  for all using (has_capability(company_id, 'manage_company'))
  with check (has_capability(company_id, 'manage_company'));
```

(`supabase/migrations/0001_foundation.sql:289-291`)

"Só o dono tem `manage_company`. Os outros seis papéis do produto não — e o
`operator` é o do celular emprestado, que é decisão escrita: *'aparelho emprestado
entra como produção e nada mais'*. A operadora da câmara fria faz a primeira
produção do dia sem sinal, o aparelho grava tudo e enfileira o lugar, e quando
acha rede o Postgres recusa a linha. O engine para no primeiro buraco de
propósito, e a partir dali nada mais sobe daquele aparelho." (`0030:9-14`)

A forma nova, nomeada: "não é ausência de política nem capacidade errada no
update — é a linha de ESCRITURAÇÃO DO PRÓPRIO SISTEMA exigindo a capacidade de
administrar a empresa." (`0030:16-19`)

#### 9.8.2 As duas políticas, por inteiro

```sql
create policy locations_default_room on locations
  for insert
  with check (
    id = company_id
    and (
      private.has_capability(company_id, 'record_production')
      or private.has_capability(company_id, 'adjust_stock')
      or private.has_capability(company_id, 'record_loss')
      or private.has_capability(company_id, 'dispatch')
      or private.has_capability(company_id, 'check_receipt')
    )
  );

create policy locations_default_room_resend on locations
  for update
  using (   ... a mesma expressão ... )
  with check ( ... a mesma expressão ... );
```

(`0030:31-65`; a expressão de cinco capacidades aparece três vezes idêntica —
`0030:36-40`, `0030:49-53`, `0030:59-63`)

As cinco capacidades aceitas, exatamente: `record_production`, `adjust_stock`,
`record_loss`, `dispatch`, `check_receipt`. **Não** entram: `view_cost`,
`view_sale_price`, `place_order`, `approve_order`, `view_finance`,
`issue_invoice`, `manage_company` (o enum completo está em
`supabase/migrations/0001_foundation.sql:42-55`).

#### 9.8.3 A trava que mantém o conserto estreito

`id = company_id` está nas três expressões. "O conserto é estreito de propósito e
NÃO é permissão nova. `id = company_id` não é um lugar que alguém escolheu: é o
único id que a empresa pode ter, e `ensureLocation` é a única coisa que o escreve.
Cadastrar um lugar de verdade — com nome, câmara fria, loja — continua sendo de
quem administra, pela `locations_manage` que fica exatamente como está."
(`0030:21-25`)

Por que `insert` e `update` em vez de `for all`: "a fila sobe com `on conflict do
update`, então o reenvio precisa do update — mas apagar lugar continua sendo de
quem administra." (`0030:27-29`)

#### 9.8.4 Estado: **implementado; exercitado pela checagem 11**

`scripts/verify-migrations.sh:773-810`, que também prova o lado negativo (um
lugar de verdade continua recusado).

---

### 9.9 Migração 0031 — uma leitura pode ser enviada duas vezes

#### 9.9.1 A quinta aparição, e a primeira achada procurando

"QUINTA aparição da mesma família, e a primeira encontrada procurando a família em
vez de esbarrando nela. A 0015 consertou `purchases` e `purchase_lines`, a 0020
consertou `lots`, a 0027 consertou `orders` (política de update com a capacidade
errada), a 0030 consertou o lugar padrão — e `readings` nasceu na 0024 com
`readings_read` e `readings_write` e mais nada. Nenhuma política de update."
(`0031:3-8`)

"E o gesto é justamente o de quem está com o aparelho na mão dentro da câmara, a
-18 °C, onde o sinal não chega: a leitura é a escrita com MAIOR chance de subir
duas vezes em todo o aplicativo." (`0031:17-19`)

Por que a barra não pegou: "A checagem 9 do `db:verify` — a que sobe a fila duas
vezes pela capacidade mínima de cada papel — replica um `orders`, e só. Nenhuma
leitura jamais foi reenviada contra o servidor de verdade. A checagem 12 desta
entrega é exatamente isso, e ela reprova sem esta política." (`0031:21-24`)

#### 9.9.2 A política

```sql
create policy readings_resend on readings
  for update using (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  )
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  );
```

(`0031:32-40`)

"`adjust_stock` é a mesma capacidade do insert (`readings_write`), pelo mesmo
motivo escrito ali: é o mesmo gesto de quem foi até a câmara e anotou o que viu. E
`recorded_by = auth.uid()` nos dois lados espelha o insert — a assinatura é
incedível, como em `movements`." (`0031:28-31`)

#### 9.9.3 O gatilho que congela oito campos

```sql
create or replace function private.a_resend_reads_nothing_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.kind        := old.kind;
  new.value       := old.value;
  new.unit        := old.unit;
  new.taken_at    := old.taken_at;
  new.location_id := old.location_id;
  new.device_id   := old.device_id;
  new.source      := old.source;
  new.recorded_by := old.recorded_by;
  return new;
end;
$$;

create trigger a_reading_resent_stays_the_same
  before update on readings
  for each row execute function private.a_resend_reads_nothing_new();
```

(`0031:52-73`)

Os oito campos congelados são `kind`, `value`, `unit`, `taken_at`, `location_id`,
`device_id`, `source` e `recorded_by`. Fora do congelamento sobra apenas
`recorded_at` (e `id`/`company_id`, que a política já tranca por outra via).

"O que fica congelado é O QUE FOI VISTO, inteiro: a grandeza, o valor, a unidade,
o instante, o lugar, o aparelho e a origem. Reenviar é dizer de novo a mesma
coisa; qualquer diferença ali é outra leitura, e outra leitura é outra linha — o
livro de leituras é append-only pela mesma razão que o de movimentos."
(`0031:48-51`)

Congelar em vez de recusar é a mesma forma da 0027 e pela mesma razão declarada:
"Uma política de RLS não consegue dizer 'contanto que não mude'" (`0031:44-46`).

#### 9.9.4 Uma contradição que o código carrega, e que não é invenção

A 0031 afirma: "A fila do aparelho sobe com `on conflict (id) do update`,
sempre" (`0031:10-11`). O único gerador de SQL de fila que existe no repositório
diz o contrário para exatamente esta tabela:

```ts
const appendOnly = write.table === 'movements' || write.table === 'readings';

const onConflict = appendOnly
  ? 'do nothing'
  : `do update set ${settled.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;
```

(`scripts/device-session.ts:295-299`, com a razão escrita em `:291-294`: "a
temperatura de ontem às três da manhã não se corrige, se mede de novo")

Essa linha entrou no mesmo commit que criou a 0024 (`ce6f8fc`, "A leitura de
sensor entra como fato, e o ESP32 é só outro escritor"), antes da 0031 (`f684e6b`).
Consequência verificada: a garantia 12 não pode reusar a fila gerada — ela
**escreve à mão** um `on conflict (id) do update` para `readings`
(`scripts/verify-migrations.sh:832` e `:838`). Fora da checagem 12, nada no
repositório emite um `update` em `readings`.

#### 9.9.5 Estado: **implementado, exercitado apenas pela checagem 12, sem chamador de produção**

O caminho de sincronia real (`src/sync/engine.ts`) fala com um `Transport`
abstrato (`src/sync/engine.ts:35-37`) e **não existe implementação de `Transport`
no repositório** — `grep -rn "Transport" src/ --include=*.ts` fora dos testes
devolve só a declaração do tipo e o parâmetro de `drain`. Logo `readings_resend`
e o gatilho `a_reading_resent_stays_the_same` estão implementados e provados, mas
nenhum cliente de produção os aciona hoje.

---

### 9.10 Migração 0032 — quem anotou o pedido nunca muda

#### 9.10.1 O buraco que sobrou depois da 0027

"`orders_decide` não exigia. A porta de quem aprova, despacha ou administra só
pergunta pela capacidade — então o mesmo `update` que aprova um pedido podia
trocar QUEM o anotou. A gerente da loja sai do registro e outra pessoa entra no
lugar dela, com o pedido inteiro parecendo dela desde sempre." (`0032:8-11`)

"Numa fábrica de seis pessoas isso não é invasão de fora: é reescrever o passado
de dentro, no único campo que o livro de pedidos tem para dizer quem pediu o
quê. E é exatamente o que o relatório de conferência precisa não poder fazer — a
decisão do dono sobre nomear quem registrou (`names_who_recorded`) só é honesta se
o nome guardado for o de quem estava lá." (`0032:13-17`)

"`movements` não tem este buraco porque não tem política de update nenhuma: a
imutabilidade dele é gatilho, e é a mesma ferramenta usada aqui." (`0032:19-20`)

#### 9.10.2 A reescrita da função, por inteiro

```sql
create or replace function private.a_resend_decides_nothing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.recorded_by := old.recorded_by;

  if not (
    private.has_capability(new.company_id, 'approve_order')
    or private.has_capability(new.company_id, 'dispatch')
    or private.has_capability(new.company_id, 'manage_company')
  ) then
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;
```

(`0032:26-48`)

A migração **não** cria gatilho novo: `orders_decision_fields_stay_put` (0027)
continua sendo o gatilho, e só o corpo da função muda — por isso a ordem
alfabética explicada em §9.5.5 segue valendo intacta.

A única linha nova, e a razão dela: "Quem anotou é fato do passado, e não é
decisão de ninguém: congela para TODOS, antes de qualquer pergunta sobre
capacidade. Quem aprova decide o estado do pedido, não a autoria dele."
(`0032:33-36`)

#### 9.10.3 A cadeia de fatos sobre a assinatura incedível

- `recorded_by` é estampado pelo servidor a partir da sessão, e `src/sync/serialize.ts` nem manda o campo que o aparelho tem (`0032:4-5`). Confere: `build: (_row, actor) => ({ recorded_by: actor.userId })` para `readings` (`src/sync/serialize.ts:146`).
- `orders_place` exige `recorded_by = auth.uid()` desde a 0019 (`0032:5-6`; `supabase/migrations/0019_an_order_is_demand.sql:163-167`).
- A 0027 exigiu nos dois lados do reenvio (`0032:6`; `0027:42-50`).

#### 9.10.4 A checagem que viu o defeito antes do conserto

"A checagem 13 do `db:verify` reprova sem isto, com a mensagem que nomeia o autor
trocado. Ela foi escrita antes desta migração e viu o campo virar outro id."
(`0032:24-25`)

#### 9.10.5 Estado: **implementado; exercitado pela checagem 13**

`scripts/verify-migrations.sh:849-882`.

---

### 9.11 A família "fila travada" — as cinco aparições, em ordem

Este bloco de migrações é dominado por uma única classe de defeito, e o
repositório a rastreia com número:

| # | Migração | Tabela | A forma do defeito | O conserto |
|---|---|---|---|---|
| 1ª | 0015 | `purchases`, `purchase_lines` | política de insert e nenhuma de update | `purchases_update` / `purchase_lines_update` com `view_finance` (`supabase/migrations/0015_the_phone_will_send_it_twice.sql:29-35`) |
| 2ª | 0020 | `lots` | idem (a tabela existia desde 0001 sem escritor) | `lots_resend` com `record_production` (`supabase/migrations/0020_a_lot_and_the_day_it_dies.sql:40-42`) |
| 3ª | 0027 | `orders` | política de update **com a capacidade errada** | `orders_resend` + gatilho que devolve `status`/`decided_at` (`0027:42-95`) |
| 4ª | 0030 | `locations` | linha de **escrituração do próprio sistema** exigindo `manage_company` | duas políticas travadas em `id = company_id` (`0030:31-65`) |
| 5ª | 0031 | `readings` | nenhuma política de update (nasceu assim na 0024) | `readings_resend` + gatilho que congela oito campos (`0031:32-73`) |

A mecânica comum, escrita e reescrita: a fila sobe com `on conflict (id) do
update` para tudo que não é livro-razão, e "o `src/sync/engine.ts` para a fila no
primeiro buraco de propósito" (`0031:13-14`) — confere com
`src/sync/engine.ts:111-117`: "A gap. Stopping here is deliberate: continuing
would send rows whose parents the server does not have, and turn one rejection
into many."

A exceção declarada: `movements` sobe com `do nothing` e continua **sem política de
update nenhuma** — "Um movimento que chega duas vezes não faz nada na segunda; um
movimento errado se estorna, nunca se edita. A nota é documento, o movimento é
fato - e só o fato é imutável."
(`supabase/migrations/0015_the_phone_will_send_it_twice.sql:25-28`)

---

### 9.12 `scripts/verify-migrations.sh` — o Postgres descartável

886 linhas. Ligado ao produto por `"db:verify": "bash scripts/verify-migrations.sh"`
(`package.json:14`) e rodado no CI (`.github/workflows/ci.yml:122`).

#### 9.12.1 O que ele declara no topo

O cabeçalho lista **cinco** motivos (`scripts/verify-migrations.sh:6-15`), a
mensagem final diz **treze** garantias (`:885`), e o passo do CI se chama "Six
guarantees, including the device's queue replayed here"
(`.github/workflows/ci.yml:121`). Os rótulos ficaram para trás; o que roda são
treze checagens numeradas no próprio script.

"Needs a local postgres (any recent version) and psql. Nothing is left running."
(`:17`)

#### 9.12.2 Configuração e variáveis

```bash
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/tmp/norva-verify-db}"
PGPORT="${PGPORT:-55432}"
SOCKET_DIR=/tmp
DB=norva_verify
```

(`:19-25`)

No CI o `PGBIN` é descoberto por `echo "PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)"`
(`.github/workflows/ci.yml:118-119`).

#### 9.12.3 A queda de privilégio

Postgres se recusa a rodar como root, "which is common in containers and CI"
(`:27-28`). Então, quando `id -u` é `0`, o script cria (se preciso) o usuário
`pgverify` e envolve os comandos do servidor em `su`:

```bash
if [ "$(id -u)" = "0" ]; then
  PG_USER="${PG_USER:-pgverify}"
  id -u "$PG_USER" >/dev/null 2>&1 || useradd -m "$PG_USER"
  as_pg() { su "$PG_USER" -c "$*"; }
else
  as_pg() { bash -c "$*"; }
fi
```

(`:29-35`)

#### 9.12.4 O levantamento e a limpeza

```bash
cleanup() {
  as_pg "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT
```

(`:37-41`)

```bash
rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chmod 700 "$PGDATA"
[ "$(id -u)" = "0" ] && chown -R "$PG_USER" "$PGDATA"
as_pg "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
as_pg "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k $SOCKET_DIR' -l /tmp/norva-verify.log start" >/dev/null
sleep 3

psql() { command psql -h "$SOCKET_DIR" -p "$PGPORT" -U postgres "$@"; }

psql -q -c "create database $DB;"
```

(`:44-54`)

Nada sobrevive à execução: `PGDATA` é apagado antes e depois, o servidor é
parado com `-m immediate` no `trap EXIT`, e o log fica em
`/tmp/norva-verify.log`.

#### 9.12.5 Os stubs do Supabase — e o truque que permite "rodar como alguém"

```sql
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

insert into auth.users (id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
```

(`:58-71`)

"Supabase supplies auth.users and auth.uid(). Stub them so the migrations run
byte-for-byte as they will in production, without editing them for the test."
(`:56-57`) E `auth.uid()` lê um GUC ajustável em vez do JWT, "which is what lets
check 4 below run a query *as a given user* and watch row level security decide
what they may see" (`:61-63`).

Daí sai o utilitário que sustenta metade das treze garantias:

```bash
as_user() {
  psql -d "$DB" -Atqc "set role app_user; set test.uid = '$1'; $2"
}
```

(`:256-258`)

#### 9.12.6 A aplicação e a semente

```bash
for file in supabase/migrations/*.sql; do
  echo "    $file"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$file"
done
```

(`:74-77`) — glob alfabético, `ON_ERROR_STOP=1`, uma migração por invocação.

A semente é uma empresa, um lugar, um item e um movimento (`:80-95`), com ids
fixos e legíveis:

| Id | Objeto |
|---|---|
| `…c1` | empresa "Verify Co" |
| `…c2` | empresa "Rival Co" (criada na checagem 4) |
| `…a1` | `locations` "Cold room", `kind = 'cold_room'`, `capacity_crates = 120` |
| `…b1` | `items` "Sugar", `purchase_unit = '25kg sack'`, `purchase_to_base = 25000` |
| `…d1` | `movements` `kind = 'production'`, 4800 unidades-base |
| `…0001` a `…0005` | contas em `auth.users` |

E o auxiliar de reprovação: `fail() { echo "FAIL: $1"; exit 1; }` (`:97`).

Prefixos usados nas checagens posteriores: `M=00000000-0000-4000-8000-0000000000`
(`:331`), `G=00000000-0000-4ddd-8000-0000000000` (`:571`),
`P=00000000-0000-4eee-8000-0000000000` (`:642`).

---

### 9.13 As treze garantias, uma por uma

#### Garantia 1 — "the ledger refuses UPDATE and DELETE" (`:99-122`)

**O SQL que testa.** Duas tentativas cujo sucesso é a reprovação:

```sql
update movements set quantity_base_units = 99999;
delete from movements;
```

(`:100`, `:103`)

Depois, `select base_units from stock_balances;` tem de devolver `4800` (`:106-107`).

**O que falharia.** Mensagens exatas: `"the ledger accepted an UPDATE - it is not
append-only"` (`:101`), `"the ledger accepted a DELETE - it is not append-only"`
(`:104`), `"balance changed after the refused mutations (got $balance)"` (`:107`).

Quem recusa é o gatilho `movements_are_immutable`
(`supabase/migrations/0001_foundation.sql:245-247`), cuja exceção é `'The ledger is
append-only. Correct a movement by inserting a reversal, which keeps the original
visible and the history honest.'` (`0001_foundation.sql:240-241`).

**A segunda metade, que é uma varredura de esquema:**

```sql
select count(*) from information_schema.columns
 where table_schema = 'public'
   and column_name ~* '(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)';
```

(`:118-120`) — tem de devolver `0`, senão
`"$stored column(s) store a stock total the ledger would disagree with"` (`:121`).

A cicatriz que a justifica: "This project shipped a `on_hand_base_units` column on
the device for months, next to a ledger that was never written to, and every test
passed the whole time - the arithmetic was right, so nothing looked wrong. The
name is what gives it away, every time, because whoever adds one is describing
exactly what it is." (`:112-117`)

#### Garantia 2 — "a purchase moves the moving average, keeping precision" (`:124-174`)

**O cenário.** Um item novo `…b4` ("Cane sugar", `purchase_to_base = 25000`),
sobre o qual não há saldo de abertura — de propósito, porque "Sugar carries a
production movement from the seed, and blending against it would make this check
about two things at once - which is how a test ends up asserting a number nobody
can derive" (`:125-127`).

Duas compras de 100 kg cada, uma a R$ 4,72/kg e outra a R$ 5,90/kg, cada linha
seguida do movimento que ela causa **com o mesmo id** — `…f1` e `…f2` (`:141-161`).
O comentário explica que é isso "which is what lets the trigger ask the ledger
what was held *before* this arrival without depending on which of the two rows
reaches the server first" (`:137-140`).

**As três asserções:**

| Consulta | Esperado | Mensagem de falha |
|---|---|---|
| `select round(average_rate, 3) from item_costs where item_id = '…b4'` | `0.531` | `"expected the average to land at 0.531 cents/g, got $average"` (`:165-166`) |
| `select round(last_rate, 3) from item_costs where item_id = '…b4'` | `0.590` | `"expected the last price to be 0.590 cents/g, got $last"` (`:168-169`) |
| `select count(*) from item_cost_history` | `2` | `"price history should have written itself twice, got $history"` (`:171-172`) |

A aritmética que sustenta `0.531`: 47200 centavos ÷ 100000 g = 0,472 c/g; depois
(0,472 × 100000 + 59000) ÷ 200000 = 0,531 c/g — a média das duas com pesos iguais.
O ponto é a fração: guardado como `bigint` de centavos, 0,472 seria zero
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:57-65`).

**O que falharia.** Se `apply_purchase_to_cost` (0009) perdesse a exclusão por id,
ou se o tipo voltasse a inteiro, ou se o histórico deixasse de escrever sozinho.

#### Garantia 3 — "a product cannot be half-manufactured" (`:176-200`)

**O SQL.** Cria um item `…b2` (`kind = 'product'`, `base_unit = 'un'`) e uma
receita `…f1` ("Strawberry mix", `yield_amount = 40000`, `yield_unit = 'ml'`)
(`:177-184`). Depois:

```sql
insert into products (company_id, item_id, recipe_id) values ('…c1','…b2','…f1');
```

(`:188-190`) — **tem de ser recusado**: `"a product was accepted with a recipe but
no portion size"` (`:191`). "A recipe with no portion size cannot say what one unit
costs, and a portion size with no recipe has nothing to take a portion of. Either
both or neither." (`:186-187`)

E o completo tem de entrar:

```sql
insert into products (company_id, item_id, recipe_id, yield_per_unit, unit_packaging_cents)
  values ('…c1','…b2','…f1', 75, 5);
```

(`:194-196`)

Fecha conferindo que `base_unit` sobreviveu ao insert e continua `'un'` (`:198-199`),
senão `"expected the base unit to survive the insert, got $unit"`.

#### Garantia 4 — "one company cannot see another, and an operator cannot see money" (`:202-316`)

**A montagem.** Uma segunda empresa `…c2` ("Rival Co") com lugar `…a2`, item `…b3`
("Their secret input") e movimento `…d2` a `unit_cost_rate = 9.99` (`:206-219`) —
"This is the shape of the real risk: the app is sold to many factories and they
share a database." (`:204-205`)

Um movimento custeado na empresa 1: `…d3`, 100 unidades a `0.472`, com o
comentário "Sub-cent on purpose: a gram of sugar out of a R$ 118 sack of 25 kg.
Stored as bigint cents, as it was until 0008, this is zero." (`:222-229`)

Duas associações: `…0002` "Dona" com `['view_cost','manage_company','record_production']`
e `…0003` "Operador" com `['record_production']` (`:232-236`).

E o papel que faz o RLS valer, porque o dono da tabela o ignora:

```sql
create role app_user;  -- se não existir
grant usage on schema public, private, auth to app_user;
grant select on all tables in schema public to app_user;
grant execute on function private.current_companies() to app_user;
grant execute on function private.has_capability(uuid, capability) to app_user;
grant execute on function auth.uid() to app_user;
```

(`:240-251`) — "On Supabase this is `authenticated`; the grants below mirror what it
holds." (`:238-239`)

**As sete asserções, com os números exatos:**

| Consulta (via `as_user`) | Quem | Esperado | Mensagem de falha |
|---|---|---|---|
| `select count(*) from items where name = 'Their secret input'` | dono `…0002` | `0` | `"company 1 could see company 2's items (got $theirs)"` (`:263-264`) |
| `select count(*) from items` | dono | `3` | `"the owner should see exactly their own 3 items, got $mine"` (`:266-267`) |
| `select count(*) from items` | `…0001`, sem associação | `0` | `"a user with no membership saw $stranger items"` (`:270-271`) |
| `select unit_cost_rate from movements_visible where id = '…d3'` | dono (tem `view_cost`) | `0.472` | `"the frozen cost lost its precision, got '$owner_cost'"` (`:275-276`) |
| `select coalesce(unit_cost_rate::text, 'null') from movements_visible where id = '…d3'` | operador (sem `view_cost`) | `null` | `"an operator without view_cost saw the cost: '$operator_cost'"` (`:278-279`) |
| `select count(*) from movements_visible` | operador | `4` | `"the operator should still see their movements, got $operator_rows"` (`:283-284`) |

O que faz o custo desaparecer é a vista, não a tela:
`case when private.has_capability(m.company_id, 'view_cost') then m.unit_cost_rate end`
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:88-89`) — "Cost is filtered
by the policy, not by hiding a button: same row, same view, and the operator gets
a null where the owner gets a number." (`:273-274`)

**A segunda metade: pedir para entrar não é entrar** (`:286-314`). Uma conta `…0005`
entra em `memberships` com `state = 'pending'` e capacidades generosas
(`['view_cost','manage_company']`) (`:292-297`). Asserções:

| Consulta | Esperado | Mensagem |
|---|---|---|
| `select count(*) from items` como `…0005` pendente | `0` | `"quem está esperando aprovação viu $pending_items itens"` (`:301-302`) |
| `select count(*) from movements_visible` como pendente | `0` | `"quem está esperando aprovação viu movimento"` (`:304-305`) |
| depois de `update memberships set state = 'active'` | `3` itens | `"aprovado deveria ver os 3 itens da empresa, viu $approved_items"` (`:309-314`) |

A razão da última: "E aprovar é o que abre a porta - senão esta checagem passaria
com um usuário simplesmente quebrado." (`:307-308`) O defeito original: "a permissão
inteira deste sistema perguntava se existe uma linha, não se ela está ativa. Quem
descobrisse o código entrava antes de alguém dizer sim." (`:288-291`)

#### Garantia 5 — "the ledger accepts what phase 1 actually records" (`:318-415`)

Uma conta nova `…0004` "Conferente" com `['check_receipt','adjust_stock']`
(`:322-325`) e `grant insert on movements to app_user;` (`:327`).

Nota de segurança transcrita, porque explica os marcadores `# proofgate-allow`:
"`$M` is a fixed UUID prefix set on the line above, `$CHECKER` and `$OPERATOR` are
literals from this file, and nothing on these lines comes from outside it. Binding
them through psql variables would hide which row each statement is about, which is
the only thing these checks are for. The marker goes on each line so the exemption
is per statement and a new one has to justify itself." (`:334-341`)

E: "Some of the inserts below are meant to be refused, so a non-zero exit is a
result rather than a crash. What is asserted is what ended up in the table."
(`:343-344`)

**As seis sondas:**

| # | Ação | Quem | Asserção | Mensagem de falha |
|---|---|---|---|---|
| 1 | `movements …d4`, `kind='purchase'`, 25000, `unit_cost_rate=0.472` | Conferente | `count(*) where id='…d4'` = `1` | `"a purchase could not be recorded"` (`:349-355`) |
| 2 | `movements …d5`, `kind='adjustment'`, **quantidade 0** | Conferente | `count(*) where kind='adjustment' and quantity_base_units = 0` = `1` | `"a count that found nothing wrong was refused"` (`:359-363`) |
| 3 | `movements …d6`, `kind='production'`, quantidade 0 | dono | `count(*) where kind='production' and quantity_base_units = 0` = `0` | `"a production that made nothing was accepted"` (`:367-371`) |
| 4 | `movements …d7`, `kind='purchase'`, 1000 | operador (sem `check_receipt`) | `count(*) where id='…d7'` = `0` | `"someone without check_receipt signed for a delivery"` (`:375-379`) |
| 5 | `movements …d8`, `kind='production'`, 500, **`recorded_by = $OPERATOR`** | dono (tem tudo) | `count(*) where id='…d8'` = `0` | `"somebody signed a movement in another person's name"` (`:394-398`) |
| 6 | `movements …d9` com `operator_id = (select id from memberships where user_id = '$OPERATOR')` | dono | `join memberships` = `1` | `"a linha não pôde dizer quem estava operando"` (`:405-412`) |

A sonda 1 pergunta por id e não por `kind` de propósito: "check 2 posts purchases
of its own, and an assertion that counts everything breaks whenever a neighbouring
check grows" (`:352-353`).

A sonda 2 existe porque `quantity_base_units <> 0` era certo para todos os `kind`
menos um; a restrição virou
`check (quantity_base_units <> 0 or kind = 'adjustment')`
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:52-55`). A sonda 3 prova que
o afrouxamento ficou estreito.

A sonda 5 é a que decide a arquitetura do aparelho compartilhado, e o script diz
por quê: "A phone that passes from hand to hand cannot sync everybody's work under
one account and label each movement with whoever was holding it - the server
refuses. The person operating has to BE the session, and the device carries one per
person." (`:389-393`)

A sonda 6 é a resposta que a 5 **não** bloqueia: "The account stays the session's
own - incedível - while `operator_id` says who was operating, chosen at the moment
of the record. Two questions, two columns" (`:400-404`).

#### Garantia 6 — "a fila do aparelho chega inteira, e os dois lados fecham o mesmo número" (`:417-558`)

A garantia mais longa. "Tudo o mais exercita um módulo ou dirige o aplicativo, e
nenhum dos dois enxerga a costura entre o SQLite do celular e o Postgres do
servidor. Seis defeitos moraram exatamente ali - coluna que não existe do outro
lado, enum escrito diferente, inteiro onde o servidor quer booleano - porque não
havia código para estar errado." (`:421-425`)

**Passo 1 — gerar a fila.**

```bash
QUEUE="$PGDATA/queue.sql"
if ! npx tsx scripts/device-session.ts > "$QUEUE" 2>"$PGDATA/queue.err"; then
  cat "$PGDATA/queue.err"
  fail "a sessão do aparelho não rodou"
fi
```

(`:431-435`)

`scripts/device-session.ts` roda uma sessão de verdade contra SQLite em memória e
imprime SQL. Ele tem dois guardas próprios que **abortam** em vez de deixar a
garantia cobrir menos do que promete:

- Toda tabela que `serialize` sabe mandar tem de aparecer na sessão: `"a sessão não exercita ${untouched.join(', ')} — a checagem 6 cobriria menos do que promete"` (`scripts/device-session.ts:328-333`).
- E cobra **tipo** de movimento, não só tabela: a lista exigida é `['purchase', 'production', 'consumption', 'transfer', 'return', 'adjustment', 'loss']`; `sale` e `reversal` ficam fora porque "não têm escritor ainda" (`scripts/device-session.ts:343-353`).

**Passo 2 — a conta da empresa e os grants.**

```sql
insert into companies (id, name) values ('$DEVICE_ACCOUNT', 'Fábrica local');
insert into memberships (company_id, user_id, display_name, capabilities)
  values ('$DEVICE_ACCOUNT', '$DEVICE_ACCOUNT', 'Conta da empresa',
          enum_range(null::capability));

grant insert, update on items, locations, products, lots, purchases, purchase_lines,
      recipes, recipe_versions, recipe_lines,
      product_lines, product_types, flavors,
      orders, order_lines to app_user;

grant insert on movements, readings to app_user;
```

(`:440-458`, com `DEVICE_ACCOUNT=00000000-0000-4000-8000-000000000001` em `:439`)

A assimetria dos grants é explicada: `movements` e `readings` recebem só `insert`
— "Leitura de sensor entra só com INSERT, como o livro-razão: a temperatura de
ontem às três da manhã não se corrige, se mede de novo. Uma série que aceita
UPDATE deixa de ser prova de nada." (`:455-457`) E sobre o resto: "Faltando o
UPDATE, o Postgres responde apenas 'permission denied', sem dizer qual dos dois
falta." (`:449-450`)

**Passo 3 — subir a fila COMO A CONTA, não como superusuário.** A cicatriz é
declarada: "Rodar isto com `-U postgres` foi o buraco desta checagem por semanas.
Um superusuário ignora row level security por completo, então as 45 escritas
passavam sem que uma única política fosse avaliada: provava que as colunas batiam e
absolutamente nada sobre o servidor aceitar a escrita." (`:463-469`)

```bash
printf 'set role app_user;\nset test.uid = %s;\n' "'$DEVICE_ACCOUNT'" > "$PGDATA/queue-rls.sql"
cat "$QUEUE" >> "$PGDATA/queue-rls.sql"
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$PGDATA/queue-rls.sql" ... ||
  fail "a fila do aparelho foi recusada pelo servidor sob a política"
```

(`:472-477`) e depois `writes=$(grep -c '^insert into' "$QUEUE")` para relatar
quantas escritas passaram (`:479-480`).

**Passo 4 — a mesma fila, por quem não é da empresa.** Conta `…000f`, e a
primeira escrita tem de ser recusada: `"uma conta de fora da empresa conseguiu
subir a fila inteira"` (`:487-495`). "Se passar, a checagem acima não provou nada
- foi o que aconteceu por semanas com o superusuário." (`:484-486`)

**Passo 5 — a segunda passagem, onde o `ON CONFLICT` sai do papel.** "Num banco
vazio nenhuma linha conflita, então o DO UPDATE nunca dispara e a política de
UPDATE nunca é avaliada" (`:500-502`). Falha: `"reenviar a fila foi recusado - a
sincronização não é idempotente"` (`:508-511`). E: "movements sobe com DO NOTHING,
então a segunda passagem não pode mexer em nenhum movimento. Se o saldo mudar
aqui, o ledger virou mutável sem ninguém notar." (`:505-507`)

**Passo 6 — os quatro números comparados entre os dois lados.** Extraídos por
`grep -oE` dos comentários que a sessão imprime (`:514-516`, `:535-536`;
produzidos em `scripts/device-session.ts:361-375`):

| Marcador | O que o servidor calcula | Asserção |
|---|---|---|
| `DEVICE_SUGAR_BALANCE` | `select coalesce(sum(quantity_base_units),0) from movements where item_id = '$SUGAR'` | igualdade; falha: `"saldo divergente: aparelho $DEV_BALANCE, servidor $srv_balance"` (`:519-521`) |
| `DEVICE_SUGAR_AVERAGE` | `select round(new_rate, 4) from item_cost_history where item_id = '$SUGAR' order by observed_at desc, ctid desc limit 1` | igualdade; falha: `"média divergente: aparelho $DEV_AVERAGE, servidor $srv_average"` (`:527-529`) |
| `DEVICE_PRODUCT_AVERAGE` | `select round(average_rate, 4) from item_costs where item_id = '$PRODUCT'` | não vazio (`"o servidor não sabe quanto vale o que o tacho fez"`) **e** igual (`"média do produto divergente: …"`) (`:538-542`) |
| — | `select count(*) from lots l join recipe_versions v on v.id = l.recipe_version_id` | `>= 1`; falha: `"o lote chegou sem dizer qual ficha rodou - a coluna não atravessou a fila"` (`:551-554`) |

A média do açúcar é declarada "a única checagem do projeto que compara duas
implementações independentes da mesma regra" (`:525-526`). A média do produto é a
prova da migração 0025: "até a 0025 não olhava para ele — `item_costs` do produto
vinha vazio e o estoque da loja valia R$ 0,00 com mil e quatrocentos picolés
dentro." (`:531-534`)

A asserção do lote (que prova a 0026) tem uma razão metodológica escrita: "'Sem
uma recusa' não prova que a coluna atravessou: uma coluna que o serializador
esquecesse de mandar entraria como nula e a fila passaria verde - é o mesmo defeito
de uma asserção de ausência sem a de presença ao lado. Aqui a chave estrangeira do
servidor também é exercitada de verdade: o lote aponta para uma `recipe_versions`
que subiu antes dele, na mesma fila." (`:546-550`)

#### Garantia 7 — "a grade do produto recusa o cadastro impossível" (`:560-635`)

Prova a migração 0018 e a 0021. Nasceu de um ataque adversarial que derrubou a
primeira versão da 0018 inteira, com três achados invisíveis de fora: "a migração
nem aplicava (chamava as funções sem o schema `private`), a chave composta era
MATCH SIMPLE — que DESLIGA a checagem quando qualquer coluna do par é nula, e nulo é
o estado normal deste desenho —, e a unique de nome era texto cru, que deixa
'Morango' e 'morango' entrarem como sabores diferentes." (`:562-567`) E: "Nenhuma
das três aparece num teste de unidade: são garantias do Postgres, e só um Postgres
de verdade responde por elas." (`:569-570`)

Montagem sob `G=00000000-0000-4ddd-8000-0000000000`: empresa `G01`, linhas `G11`
("Picolé") e `G12` ("Pote de sorvete"), tipos `G21` ("Tradicional", da linha G11) e
`G22` ("500 ml", da linha G12), sabor `G31` ("Morango"), itens `G41`, `G42`, `G43`
(`:572-589`).

| # | Tentativa | Resultado exigido | Mensagem de falha |
|---|---|---|---|
| 1 | `flavors` `G32` com nome `'  morango '` | recusado | `"'morango' entrou como sabor diferente de 'Morango'"` (`:582-585`) |
| 2 | `products` `G51` com `line_id=G11`, `type_id=G22` | recusado | `"um Picolé de 500 ml entrou: a linha e o tipo não batem"` (`:592-595`) |
| 3 | `products` `G52` com `line_id=null`, `type_id=G22` | recusado | `"tipo sem linha entrou: a chave composta está em MATCH SIMPLE"` (`:599-602`) |
| 4 | `products` `G53` com `G11/G21/G31` | **aceito** | (o caminho certo, `:605-606`) |
| 5 | `products` `G54` com o mesmo `G11/G21/G31` em outro item | recusado | `"o mesmo picolé tradicional de morango entrou duas vezes"` (`:609-612`) |
| 6 | `products` `G55` sem classificação; depois `G56` idem | o segundo recusado | `"dois produtos sem classificação nenhuma entraram: falta nulls not distinct"` (`:616-621`) |
| 7 | `locations` `G61` com `delivery_days = 200` | recusado | `"um acordo de entrega fora da semana entrou"` (`:627-630`) |
| 8 | `locations` `G62` com `delivery_days = 36` | **aceito** | ("Loja de terça e sexta", `:631-632`) |

As garantias do esquema que respondem: o índice
`product_lines_name_idx on product_lines (company_id, lower(btrim(name)))` e os
gêmeos para tipos e sabores
(`supabase/migrations/0018_a_product_has_a_family.sql:47-48`, `:66-67`, `:78-79`);
`product_type_belongs_to_its_line ... match full`
(`0018:103-107`); `products_grid_idx on products (company_id, line_id, type_id, flavor_id) nulls not distinct where active`
(`0018:115-118`); e
`locations_delivery_days_is_a_week check (delivery_days between 0 and 127)`
(`supabase/migrations/0021_what_was_agreed_with_the_store.sql:21-22`).

Sobre o bitmask, decisão de produto registrada: bit 0 no domingo, a mesma numeração
de `Date.getDay()` no aparelho; zero é "não combinamos dia", que **não** é "nenhum
dia" (`0021:7-14`). Logo `36` = bits 2 e 5 = terça e sexta. E a razão de a
restrição existir no banco: "o banco é o único lugar que responde por isso quando a
fila vem de um app que não é este. Sem a restrição, a loja 'recebe no dia 300' e
nada acusa." (`:625-626`)

#### Garantia 8 — "o pedido nasce onde a empresa mandou, e sair do pendente é de quem aprova" (`:637-686`)

Montagem sob `P=00000000-0000-4eee-8000-0000000000`: contas `P91` e `P92`, empresa
`P01` ("Fábrica que aprova") com **`orders_need_approval = true`**, associações
"Vendedora" `P91` = `['place_order','dispatch']` e "Dona" `P92` =
`['place_order','approve_order']`, lugar `P11` (`kind='customer'`), item `P21`
(`:642-654`).

| # | Ação | Asserção | Mensagem de falha |
|---|---|---|---|
| 1 | `P91` insere `orders P31` com `status='open'` | insert passa | `"quem tem place_order não conseguiu anotar um pedido"` (`:659-660`) |
| 2 | `select status from orders where id='P31'` | `pending` | `"o pedido nasceu '$nasceu': a tela escolheu o estado que era do banco"` (`:662-664`) |
| 3 | `P91` faz `update orders set status='open'` | **recusado** | `"quem despacha aprovou um pedido sem ter approve_order"` (`:667-670`) |
| 4 | `P92` faz o mesmo update | passa | `"quem tem approve_order não conseguiu aprovar"` (`:673-674`) |
| 5 | `order_lines P41` apontando para `…a1` (item da outra empresa) | recusado | `"uma linha apontou para o item de outra empresa"` (`:677-680`) |
| 6 | `order_lines P42` com `base_units = 0` | recusado | `"um pedido de zero unidade entrou"` (`:681-684`) |

Quem responde: o gatilho `orders_start_where_the_company_says`
(`supabase/migrations/0019_an_order_is_demand.sql:120-122`) para a asserção 2; o
gatilho `orders_leave_pending_only_by_approval` (`0019:147-149`) para a 3; a
restrição `order_line_item_same_company` (`0019:85-87`) para a 5; e
`base_units integer not null check (base_units > 0)` (`0019:81`) para a 6.

A razão de a regra não morar na tela: "um cliente que manda o pedido pelo próprio
aparelho escolheria nascer aprovado, porque 'status' é um campo como outro qualquer
no JSON." (`:639-641`)

#### Garantia 9 — "o reenvio da fila passa pela capacidade MÍNIMA de quem escreveu" (`:688-730`)

Prova a migração 0027. A lacuna que ela fecha é declarada: "A checagem 6 sobe a
fila com uma conta que tem `enum_range(null::capability)` — TODAS as capacidades. A
checagem 8 dá à vendedora `place_order` MAIS `dispatch`. Nenhuma conta com a
capacidade mínima de um papel real jamais rodou a SEGUNDA passagem, e é na segunda
que o defeito mora." (`:692-697`)

A conta é a gerente de loja `P93`, com exatamente o que
`src/domain/access.ts` dá a esse papel:
`['place_order','view_sale_price','check_receipt','record_loss']` — "Nada de
approve_order, nada de dispatch, nada de manage_company" (`:699-705`).

| # | Ação | Asserção | Mensagem de falha |
|---|---|---|---|
| 1 | `P93` insere `orders P51` com `status='open'` | passa | `"a gerente da loja não conseguiu anotar o pedido dela"` (`:708-710`) |
| 2 | `P93` reenvia: `... on conflict (id) do update set place_id = excluded.place_id, status = excluded.status, recorded_by = excluded.recorded_by` | passa | `"o reenvio do pedido foi recusado: a fila do aparelho trava aqui, e tudo o que veio depois fica preso atrás dela"` (`:714-716`) |
| 3 | `select status from orders where id='P51'` | `pending` | `"o reenvio deixou o pedido em '$depois': reenviar decidiu, e aprovar não é de quem só anota"` (`:722-724`) |
| 4 | `P92` (`approve_order`) faz `update ... status='open'` | passa | `"quem tem approve_order deixou de conseguir aprovar depois do conserto"` (`:727-728`) |

A asserção 4 existe para provar que o conserto não quebrou a garantia 8: "senão o
conserto teria quebrado a checagem 8" (`:726`).

#### Garantia 10 — "o razão recusa item e local de outra empresa" (`:732-771`)

Prova a migração 0029. "A checagem 4 prova o ISOLAMENTO DE LEITURA: uma empresa não
vê a outra. A escrita tinha um buraco de outra forma — a política pergunta se a
pessoa pode gravar naquela empresa, e ninguém perguntava se o ITEM é daquela
empresa." (`:734-739`)

Montagem: conta `P94`, empresa vizinha `P02`, associação de `P94` **na empresa
P01** com `['record_production']`, lugares `P12` ("Almoxarifado de casa", em P01) e
`P13` ("Almoxarifado da vizinha", em P02), item `P22` ("Polpa da vizinha", em P02)
(`:743-751`).

| # | Movimento inserido por `P94` na empresa `P01` | Asserção | Mensagem de falha |
|---|---|---|---|
| 1 | `…P61` com `item_id = P22` (item da vizinha) e `location_id = P12` | **recusado** | `"o razão aceitou um item de OUTRA empresa — o saldo de casa passa a falar de coisa que não é de casa, e append-only quer dizer que a linha não sai nunca"` (`:754-757`) |
| 2 | `…P62` com `item_id = P21` e `location_id = P13` (lugar da vizinha) | **recusado** | `"o razão aceitou um LOCAL de outra empresa"` (`:760-763`) |
| 3 | `…P63` com `item_id = P21` e `location_id = P12` (tudo de casa) | **aceito** | `"o movimento legítimo da própria empresa passou a ser recusado"` (`:767-769`) |

A asserção 3: "senão o conserto teria trancado a porta com a fábrica do lado de
fora" (`:765-766`).

#### Garantia 11 — "o aparelho emprestado cria o lugar padrão, e nada além dele" (`:773-810`)

Prova a migração 0030. Conta `P95`, empresa `P03` ("Fábrica do aparelho"),
associação "Operadora do turno" com
`['record_production','dispatch','check_receipt','record_loss','adjust_stock']` —
"exatamente o que a decisão do dono dá ao celular emprestado: produção e nada de
dinheiro" (`:783-789`). Mais `grant insert, update on locations to app_user;`
(`:791`).

| # | Ação de `P95` | Asserção | Mensagem de falha |
|---|---|---|---|
| 1 | `insert into locations values ('P03','P03','','store_room')` — **id igual ao da empresa** | passa | `"o aparelho emprestado não conseguiu criar o lugar padrão: a fila trava na primeira produção do dia e nada mais sobe daquele celular"` (`:794-796`) |
| 2 | o mesmo com `on conflict (id) do update set name = excluded.name, kind = excluded.kind` | passa | `"o reenvio do lugar padrão foi recusado, e a fila trava atrás dele"` (`:799-801`) |
| 3 | `insert into locations values ('P14','P03','Câmara fria','cold_room')` | **recusado** | `"quem só produz cadastrou um lugar novo — o conserto abriu permissão em vez de deixar passar a escrituração"` (`:805-807`) |

A asserção 3 é a que impede o conserto de virar permissão: "Se esta linha passar, o
conserto virou permissão nova em vez de escrituração." (`:803-804`)

#### Garantia 12 — "a leitura da câmara sobe duas vezes, e a segunda não reescreve nada" (`:812-847`)

Prova a migração 0031. `grant insert, update on readings to app_user;` (`:824`), e a
mesma operadora `P95`, "que tem `adjust_stock`, que é a capacidade da contagem — a
mesma do gesto de ir até a câmara e anotar o que viu" (`:826-827`).

| # | Ação de `P95` | Asserção | Mensagem de falha |
|---|---|---|---|
| 1 | `insert into readings ('P71','P03','P03','temperature',-18.4,'C', now(), 'P95')` | passa | `"a operadora não conseguiu anotar a temperatura da câmara"` (`:828-830`) |
| 2 | o mesmo com `on conflict (id) do update set kind=…, value=…, unit=…, taken_at=…, location_id=…, recorded_by=…` | passa | `"o reenvio da leitura foi recusado: a fila do aparelho trava aqui, e é a escrita que mais reenvia porque acontece onde não há sinal"` (`:832-834`) |
| 3 | o mesmo com `value = -2.0` e `on conflict (id) do update set value = excluded.value` | passa (não é recusado) | `"o reenvio com valor diferente foi recusado em vez de ser devolvido ao valor original"` (`:838-840`) |
| 4 | `select value from readings where id='P71'` | casa com `-18.4*` | `"o reenvio reescreveu a leitura para '$valor': a câmara passou a dizer que estava a -2 °C quando estava a -18,4"` (`:841-845`) |

A comparação é por `case "$valor" in -18.4*) : ;; *) fail … esac` (`:842-845`) — um
prefixo, não igualdade, porque o `numeric(14,4)` volta como `-18.4000`.

A distinção entre 3 e 4 é o ponto todo: o reenvio **não é recusado** (o que travaria
a fila), ele é **devolvido** pelo gatilho `a_reading_resent_stays_the_same`.

#### Garantia 13 — "quem aprova um pedido não reescreve quem o anotou" (`:849-882`)

Prova a migração 0032. "`orders_place` exige `recorded_by = auth.uid()`;
`orders_resend` (0027) exige nos dois lados. Mas `orders_decide` — a porta de quem
aprova, despacha ou administra — só pergunta pela capacidade." (`:854-857`)

| # | Ação | Asserção | Mensagem de falha |
|---|---|---|---|
| 1 | `P93` (gerente) insere `orders P52` com `recorded_by = P93` | passa | `"a gerente da loja não conseguiu anotar o segundo pedido"` (`:864-866`) |
| 2 | `P92` (aprova) faz `update orders set status='open', recorded_by='P92' where id='P52'` | passa | `"quem tem approve_order deixou de conseguir aprovar"` (`:869-871`) |
| 3 | `select recorded_by from orders where id='P52'` | `P93` | `"o autor do pedido virou '$autor': quem aprova reescreveu quem anotou, e o registro deixou de dizer quem pediu"` (`:873-875`) |
| 4 | `select status from orders where id='P52'` | `open` | `"o pedido ficou em '$estado': o conserto do autor travou a aprovação"` (`:878-880`) |

O mesmo `update` faz as duas coisas de propósito — "é a mesma linha que tenta trocar
o autor" (`:868`) — e a asserção 4 garante que congelar `recorded_by` não travou a
decisão.

#### Encerramento

```
echo "OK - migrations apply and all thirteen guarantees hold."
```

(`:885`)

---

### 9.14 Quadro de estado, por peça deste bloco

| Peça | Migração | Estado |
|---|---|---|
| `items.full_level` | 0023 | **implementado e chamado por tela** (`app/inputs/new.tsx:320`, `app/products/new.tsx:342`, `app/inputs/index.tsx:332`) |
| tabela `readings` | 0024 | **implementado e chamado por tela** (`app/places.tsx:494`) |
| `readings.device_id` | 0024 | **implementado sem chamador**: nenhuma chamada de `recordReading` passa `deviceId`; e não existe tabela `devices` no aparelho nem `devices` na lista de tabelas sincronizáveis (`src/sync/serialize.ts:63-77`) |
| `locations.sensor_ranges` | 0024 | **implementado e chamado por tela** (`app/places.tsx:444-452`) |
| `readings_read` / `readings_write` | 0024 | **implementado**, exercitado por `db:verify` (checagens 6 e 12) |
| `apply_production_to_cost` + `production_updates_cost` | 0025 | **implementado**, exercitado pela checagem 6 (`scripts/verify-migrations.sh:538-542`) |
| `lots.recipe_version_id` | 0026 | **implementado e chamado** (escrita `src/data/repository.ts:1517`; leitura `:3141`, `:3567`) |
| `orders_resend` + `orders_decision_fields_stay_put` | 0027 / 0032 | **implementado**, exercitado pelas checagens 9 e 13; sem cliente de produção (não há `Transport`) |
| `movements_reversal_idx` (servidor) | 0028 | **implementado sem chamador no servidor**: nenhuma consulta do servidor filtra `reverses_movement_id` |
| três chaves compostas de `movements` | 0029 | **implementado**, exercitado pela checagem 10 |
| `locations_default_room` + `_resend` | 0030 | **implementado**, exercitado pela checagem 11 |
| `readings_resend` + `a_reading_resent_stays_the_same` | 0031 | **implementado**, exercitado **apenas** pela checagem 12; o gerador de fila emite `do nothing` para `readings` (`scripts/device-session.ts:295`) |
| congelamento de `orders.recorded_by` | 0032 | **implementado**, exercitado pela checagem 13 |
| **Transporte de sincronia real (Supabase)** | — | **NÃO IMPLEMENTADO**: `Transport` é só um tipo (`src/sync/engine.ts:35-37`) e nada no repositório o implementa fora dos testes |

---

### 9.15 A regra de append-only das migrações, e o guard que a impõe

#### 9.15.1 Por que editar um passo já rodado faz banco e arquivo divergirem em silêncio

O mecanismo, transcrito do guard: "migrations are append-only for a reason that has
no workaround. A step that has already run somewhere leaves that database in the
shape the OLD text produced. Editing the file changes what a FRESH database gets
and nothing else - so the two diverge, in silence, and every checkout is fine. It
surfaces months later as a column that exists on one machine and not another."
(`.proofgate/guards.d/97-migration-edited.sh:3-8`)

Detalhando o silêncio, com o que este repositório tem em mãos:

1. Um banco que já aplicou `0024` guardou a tabela `readings` **na forma do texto de então**. O Postgres não guarda o texto — guarda o resultado.
2. Editar `0024` hoje não reexecuta nada em lugar nenhum. Nenhum banco existente muda.
3. Um banco novo — o `norva_verify` que a barra levanta a cada execução (`scripts/verify-migrations.sh:74-77`) — recebe o texto **novo**.
4. Portanto: a barra fica verde contra a forma nova, e a produção continua na forma velha. Os dois estados são internamente consistentes; a divergência não tem sintoma até uma consulta pedir a coluna que só existe num deles.

A mesma regra vale para o espelho no aparelho, e o `CLAUDE.md` do projeto a
estende explicitamente: "`supabase/migrations/` e o `MIGRATIONS` de
`src/data/db.ts` só crescem — **editar um passo que já rodou faz o banco e o
arquivo divergirem em silêncio**". No aparelho o vetor é o mesmo: `MIGRATIONS` é
um array indexado por posição (`src/data/db.ts:676-678`) e o SQLite guarda um
número de versão já aplicado; mudar o texto de `V15` não reexecuta `V15` num
celular que já passou por ele.

Corolário operacional que este bloco de migrações exemplifica: **um conserto é
sempre um passo novo.** A 0032 não editou a 0027 — ela reescreveu o corpo da função
com `create or replace function` e deixou o gatilho de 0027 intacto (`0032:26-48`).
A 0025 não editou a 0009 — criou uma função irmã (`0025:26`). E a 0031 não editou a
0024 — acrescentou a política que faltava (`0031:32`).

#### 9.15.2 O guard `97-migration-edited`, por inteiro

```bash
#!/usr/bin/env bash
set -uo pipefail
. "${PROOFGATE_LIB:-$(dirname "$0")/../lib.sh}" 2>/dev/null || true

BASE="${PROOFGATE_BASE:?PROOFGATE_BASE unset}"
touched=""; n=0
while IFS=$'\t' read -r status file; do
  case "$status" in M*|D*|R*) ;; *) continue ;; esac
  case "$file" in
    migrations/*|*/migrations/*|db/migrate/*|*/db/migrate/*|*/alembic/versions/*|db/schema.rb|*/db/schema.rb) ;;
    *) continue ;;
  esac
  case "$file" in *.md|*.txt|*README*) continue ;; esac
  pg_ignored "$(pg_fingerprint migration-edited "$file" "$status")" && continue
  n=$((n + 1)); touched="$touched $file"
done < <(git diff --name-status "$BASE"..HEAD -- . "${PG_SELF_EXCLUDE[@]}" 2>/dev/null)

if [ "$n" -gt 0 ]; then
  echo "⚠️  migration-edited: $n existing migration file(s) modified or removed —$touched. A step that already ran leaves that database in the OLD shape while a fresh one gets the new: they diverge silently. Append a new step instead."
  exit 2
fi
echo "✅ migration-edited: migrations only grew"
exit 0
```

(`.proofgate/guards.d/97-migration-edited.sh:1-37`)

#### 9.15.3 As cinco decisões dentro do guard

**1. Só `M`, `D` e `R` disparam.** `case "$status" in M*|D*|R*) ;; *) continue ;; esac`
(`:19`) — arquivo **adicionado** (`A`) nunca é sinalizado, e o cabeçalho o diz:
"Adding files here is normal and is not flagged. Only modification of a file that
already existed in the base is, and deletion of one." (`:10-11`) `R` (renomeado)
entra porque renomear uma migração é o mesmo problema com outro nome.

**2. O filtro é o DIRETÓRIO, não a palavra.** Os padrões aceitos são
`migrations/*`, `*/migrations/*`, `db/migrate/*`, `*/db/migrate/*`,
`*/alembic/versions/*`, `db/schema.rb`, `*/db/schema.rb` (`:24`). A razão está
escrita e é sobre este próprio repositório: "`scripts/verify-migrations.sh`
verifies migrations, it is not one, and a guard that cannot tell the two apart gets
switched off by the first person it annoys." (`:20-22`)

**3. Documentação é isenta.** `case "$file" in *.md|*.txt|*README*) continue ;; esac`
(`:27`).

**4. Escape hatch por impressão digital.**
`pg_ignored "$(pg_fingerprint migration-edited "$file" "$status")" && continue`
(`:28`). A impressão digital é `guard:file:hash12` — `pg_fingerprint` monta
`printf '%s:%s:%s' "$guard" "$file" "$h"` com os 12 primeiros caracteres de um
`sha1sum`/`shasum`/`cksum` do conteúdo passado (`.proofgate/lib.sh:96-102`), e
`pg_ignored` procura a linha exata em `.proofgateignore` com `grep -Fxq`
(`.proofgate/lib.sh:110-114`). **Não existe `.proofgateignore` neste repositório**
— nada está suprimido.

**5. A fonte é `base..HEAD`, nunca a árvore de trabalho.**
`git diff --name-status "$BASE"..HEAD -- . "${PG_SELF_EXCLUDE[@]}"` (`:30`), onde
`PG_SELF_EXCLUDE` é a lista de pathspecs que impede a proofgate de sinalizar o
próprio código-fonte (`.proofgate/lib.sh:121`). Consequência prática, que o
`CLAUDE.md` do projeto registra como cicatriz: "A proofgate lê `base..HEAD`, não a
árvore de trabalho. Marcador de justificativa em arquivo sem commit não existe para
ela. Commit primeiro, depois confira."

#### 9.15.4 A severidade: `exit 2` é ⚠️, não ❌

O corredor de guards mapeia os códigos assim:
`2) WARNS=$((WARNS + 1)); FIRED="$FIRED $gname"; record "$gname" warn "$OUT"; gh_annot warning "$OUT"`
(`.proofgate/verify.sh:261`), e a semântica geral é "Exit codes: 0 = gate passed
(warnings allowed unless --strict) · 1 = gate FAILED"
(`.proofgate/verify.sh:16`). Com `--strict`, "warnings become failures"
(`.proofgate/verify.sh:8`, `:288-290`).

Logo: editar uma migração **não bloqueia** a entrega por si — produz um ⚠️ que,
pela regra do projeto, exige justificativa escrita ("todo ⚠️ pede justificativa
escrita — nunca dispensa em silêncio", `CLAUDE.md`). É a diferença entre um guard
que impede e um que obriga a explicar; este obriga a explicar, porque existe o caso
legítimo raro (uma migração adicionada e corrigida **antes** de rodar em qualquer
lugar).

Os guards são descobertos em ordem alfabética a partir de
`GUARDS_DIR="$SCRIPT_DIR/guards.d"` (`.proofgate/verify.sh:48`, `:224`) — daí o
prefixo `97`, que o coloca perto do fim da bateria.

#### 9.15.5 O registro histórico: a regra nunca foi quebrada

`git log --diff-filter=MD -- supabase/migrations/` não devolve um único commit, e
`git log --oneline --name-status -- supabase/migrations/0001_foundation.sql`
devolve apenas `66ad137 … A supabase/migrations/0001_foundation.sql`. As 32
migrações do repositório entraram e nunca foram tocadas. (As datas de modificação
no sistema de arquivos são enganosas — refletem a ordem do checkout, não edições.)

---

### 9.16 O que este bloco ensina sobre o desenho, em quatro linhas verificáveis

1. **Política de RLS não sabe o antes.** Três migrações deste bloco (0027, 0031, 0032) tiveram que virar gatilho `before update` pela mesma razão, escrita quase palavra por palavra nas três: "Uma política de RLS não consegue dizer 'contanto que não mude': a expressão não enxerga o antes e o depois ao mesmo tempo" (`0027:54-56`, `0031:44-46`, `0032:21-22`).
2. **Congelar em vez de recusar, quando o autor não está pedindo o que se recusa.** 0027 devolve `status`/`decided_at`; 0031 devolve oito campos; 0032 devolve `recorded_by`. Nenhuma levanta exceção, porque exceção travaria a fila — que é o defeito original (`0027:61-64`).
3. **Nome de gatilho é contrato.** A ordem alfabética dos gatilhos `before` do Postgres é a única coisa que separa "reenvio funciona" de "fila travada" em `orders` (`0027:84-92`).
4. **Uma garantia sem o lado positivo prova metade.** Seis das treze checagens fecham com uma asserção de que o caminho legítimo continua passando — 3 (`:194-199`), 4 (`:309-314`), 9 (`:727-728`), 10 (`:767-769`), 11 (`:794-796`) e 13 (`:878-880`) — e o script escreve o motivo em cada uma ("senão o conserto teria trancado a porta com a fábrica do lado de fora", `:765-766`).
