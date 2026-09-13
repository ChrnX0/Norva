## 7. Banco do servidor — parte A (migrações 0001 a 0011)

### 7.0 Como esta parte se lê, e o que ela é

O banco do servidor é Postgres (Supabase). Ele existe inteiro em
`supabase/migrations/`, em arquivos numerados que **só crescem** — a regra é a
mesma do livro-razão, e está escrita na própria 0005: "This is a separate
migration rather than an edit to 0004 because 0004 has already run. Migrations
are append-only for the same reason the ledger is: a file that says something
different from what the database actually did is worse than no file at all"
(`supabase/migrations/0005_revoke_public_execute.sql:15-18`).

O nome de cada arquivo é a justificativa dele, e as migrações a partir da 0007
são escritas como prosa antes do DDL. Esta parte cobre da 0001 à 0011; a parte B
cobre 0012 a 0032.

**Ordem de aplicação.** As migrações são aplicadas em ordem alfabética de
arquivo, uma por uma, com `ON_ERROR_STOP=1`:

```bash
for file in supabase/migrations/*.sql; do
  echo "    $file"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$file"
done
```
(`scripts/verify-migrations.sh:74-77`)

**Dois objetos que o Supabase fornece e as migrações usam sem criar:**
`auth.users` (referenciada por `memberships.user_id`, `movements.recorded_by` e
`purchases.created_by`) e `auth.uid()` (usada por toda política). Na verificação
local elas são dubladas para que as migrações rodem "byte-for-byte as they will
in production, without editing them for the test"
(`scripts/verify-migrations.sh:56-57`):

```sql
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
```
(`scripts/verify-migrations.sh:59-66`)

**Estado geral de chamada — vale para tudo o que está nesta parte.** Não existe
cliente Supabase no aplicativo: `package.json` não tem nenhuma dependência
`@supabase/*` (`package.json:21-44`), e não há nenhuma ocorrência de
`SUPABASE`, `supabaseUrl` ou `createClient` em `src/`, `app/`, `scripts/` ou
`e2e/`. O motor de sincronização é agnóstico de transporte por decisão escrita —
"The engine knows nothing about Supabase, or HTTP, or authentication. It knows
the queue and it knows a `Transport`" (`src/sync/engine.ts:5-8`) — e o único
`Transport` que existe é o falso dos testes. Portanto:

| Estado | O que significa aqui |
|---|---|
| **Implementado e exercido contra Postgres de verdade** | `npm run db:verify` (`scripts/verify-migrations.sh`) sobe um Postgres descartável, aplica as 32 migrações e prova comportamento em 13 checagens |
| **Implementado e alvo declarado da fila do aparelho** | a tabela/coluna está no registro de travessia `CROSSINGS` de `src/sync/serialize.ts:124-368`, e a fila serializada é reproduzida contra o servidor na checagem 6 |
| **Implementado sem nenhum chamador** | existe no esquema, nada escreve nem lê — nem tela, nem fila, nem checagem |

Nenhum objeto desta parte é chamado por tela em produção, porque **nenhuma tela
fala com o servidor ainda**. Onde eu disser "sem chamador" abaixo, é o sentido
mais forte: nem a fila do aparelho, nem a `db:verify`.

**Um terceiro consumidor, que lê o texto das migrações.**
`src/sync/agreement.test.ts` abre `supabase/migrations/` e extrai colunas e
valores de enum do SQL, para falhar quando o aparelho e o servidor divergirem de
forma (`src/sync/agreement.test.ts:31-38`, `:92-104`). Ele não prova
comportamento — "It cannot prove behaviour" (`src/sync/agreement.test.ts:18`) —
mas torna o arquivo de migração a fonte da verdade para o aparelho.

---

### 7.1 `0001_foundation.sql` — locação, capacidades e o livro-razão

339 linhas. É a migração que não pode ser refeita depois, e o cabeçalho diz por
quê, em três itens (`supabase/migrations/0001_foundation.sql:1-13`):

1. "Every row carries company_id from the very first migration. Adding tenancy
   after real customers are inside is what kills products."
2. "Permission is enforced by capability in the database, not by hiding a
   button. Hiding a button is decoration, not security."
3. "The ledger is append-only at the database level. UPDATE and DELETE are
   revoked and blocked by trigger, so 'correct by reversal' is a property of the
   system rather than a habit people can drift away from."

#### 7.1.1 Extensão

```sql
create extension if not exists "pgcrypto";
```
(`0001_foundation.sql:15`) — é o que dá `gen_random_uuid()`, usado como default
de chave primária em quase toda tabela.

#### 7.1.2 Tabela `companies`

```sql
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  language      text not null default 'pt-BR',
  currency      text not null default 'BRL',
  time_zone     text not null default 'America/Sao_Paulo',
  modules       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
```
(`0001_foundation.sql:21-33`)

| Coluna | Tipo | Nulo? | Default | Nota |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `name` | text | não | — | |
| `language` | text | não | `'pt-BR'` | "Locale travels with the company, not the phone: a Brazilian factory whose owner reads the app in English still bills in BRL" (`:24-25`) |
| `currency` | text | não | `'BRL'` | |
| `time_zone` | text | não | `'America/Sao_Paulo'` | |
| `modules` | jsonb | não | `'{}'::jsonb` | "Module switches. A small customer must see four buttons, not thirty. Turning one off never deletes data; it only leaves the screen" (`:29-31`) |
| `created_at` | timestamptz | não | `now()` | |

Comentário de coluna, literal (`0001_foundation.sql:35-38`):

> `Feature switches (lots, qr, fiscal, finance, sanitary, balancing, ...). Disabled means invisible, never greyed out - a locked field reads as a money grab, which is exactly the review the market leader earns.`

Chaves estrangeiras: nenhuma. Índices: só a PK.

#### 7.1.3 Enum `capability` — o vocabulário inteiro da permissão

```sql
create type capability as enum (
  'view_cost',
  'view_sale_price',
  'record_production',
  'dispatch',
  'check_receipt',
  'record_loss',
  'place_order',
  'approve_order',
  'adjust_stock',
  'view_finance',
  'issue_invoice',
  'manage_company'
);
```
(`0001_foundation.sql:42-55`) — doze valores, nesta ordem. O comentário acima
explica a escolha: "Capabilities, not roles. A role is a bundle of these; every
company that buys this app has a different org chart, so the bundle is
configuration" (`:40-41`).

Estes doze valores são copiados palavra por palavra em
`src/domain/access.ts:26-39`, com a nota de que "`agreement.test.ts` fails if the
two ever drift" (`src/domain/access.ts:23-25`). Os pacotes (papéis) vivem só no
aparelho, em `ROLES` (`src/domain/access.ts:70-108`) — o servidor **não** tem
tabela de papéis; guarda o array de capacidades por pessoa.

| Capacidade | Onde o servidor a exige (nesta parte) |
|---|---|
| `view_cost` | leitura de `item_costs`, `item_cost_history`, `purchases`, `purchase_lines`; coluna de custo em `movements_visible` |
| `view_sale_price` | coluna de preço em `movements_visible` |
| `record_production` | inserir movimento `production` e `consumption`; inserir em `lots` |
| `dispatch` | inserir movimento `transfer` e `sale` |
| `check_receipt` | inserir movimento `return`, `discrepancy` e (a partir da 0008) `purchase` |
| `record_loss` | inserir movimento `loss` |
| `adjust_stock` | inserir movimento `adjustment` e `reversal` |
| `view_finance` | inserir em `purchases` e `purchase_lines` |
| `manage_company` | atualizar `companies`; gerir `memberships`, `locations`, `items`, `suppliers`, `recipes`, `recipe_versions`, `recipe_lines`, `products` |
| `place_order` | **nada nesta parte** — só passa a valer na 0019 (parte B) |
| `approve_order` | **nada nesta parte** — só passa a valer na 0019 (parte B) |
| `issue_invoice` | **nada em nenhuma migração** — vocabulário reservado para o fiscal, que não existe |

#### 7.1.4 Tabela `memberships`

```sql
create table memberships (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null,
  capabilities  capability[] not null default '{}',
  prefers_conversation boolean not null default false,
  assistant_autonomy   smallint not null default 2
                       check (assistant_autonomy between 1 and 4),
  created_at    timestamptz not null default now(),
  unique (company_id, user_id)
);

create index memberships_user_idx on memberships (user_id);
```
(`0001_foundation.sql:57-74`)

| Coluna | Tipo | Nulo? | Default | Restrição |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `company_id` | uuid | não | — | FK → `companies(id)` `on delete cascade` |
| `user_id` | uuid | não | — | FK → `auth.users(id)` `on delete cascade` |
| `display_name` | text | não | — | |
| `capabilities` | `capability[]` | não | `'{}'` | array, não tabela de junção |
| `prefers_conversation` | boolean | não | `false` | |
| `assistant_autonomy` | smallint | não | `2` | `check (assistant_autonomy between 1 and 4)` |
| `created_at` | timestamptz | não | `now()` | |
| — | — | — | — | `unique (company_id, user_id)` |

Duas decisões escritas em comentário:

- `prefers_conversation`: "Screens Mode or Conversation Mode. Deliberately not
  called 'simple mode': nobody should open a setting that implies they are the
  simple one" (`0001_foundation.sql:63-64`).
- `assistant_autonomy`: "1 informs, 2 prepares (default), 3 routine, 4
  autonomous. Regardless of level, the floor in `check_assistant_floor()` always
  demands a human" (`0001_foundation.sql:66-67`). **`check_assistant_floor()`
  não existe em nenhuma migração nem em nenhum arquivo do repositório** — a única
  ocorrência do nome é esse comentário. O piso do assistente existe, mas no
  aparelho: `ALWAYS_CONFIRMED` / `needsHumanYes()` em
  `src/domain/access.ts:135-146`. O comentário do esquema aponta para uma função
  que **NÃO ESTÁ NO CÓDIGO**.

Estado: `memberships` **não é enviada pelo aparelho** (não está em `ServerTable`,
`src/sync/serialize.ts:61-78`). É escrita à mão pela `db:verify`
(`scripts/verify-migrations.sh:232-236`, `:294-296`, `:323-325`, `:443-445`).

#### 7.1.5 As duas funções que são a permissão inteira

```sql
create or replace function current_companies()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from memberships where user_id = auth.uid();
$$;
```
(`0001_foundation.sql:80-88`)

```sql
create or replace function has_capability(target_company uuid, needed capability)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = target_company
      and needed = any (capabilities)
  );
$$;
```
(`0001_foundation.sql:90-103`)

Ambas nascem no schema `public`, `SECURITY DEFINER`, `STABLE`, com
`search_path = public` fixado. As duas mudam de casa na 0006 (para o schema
`private`) e de corpo na 0011 (passam a exigir `state = 'active'`).

#### 7.1.6 Enum `location_kind` e tabela `locations`

```sql
create type location_kind as enum ('factory', 'cold_room', 'store_room', 'own_store', 'customer', 'vehicle');
```
(`0001_foundation.sql:109`) — seis valores.

```sql
create table locations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  kind          location_kind not null,
  name          text not null,
  capacity_crates integer,
  address_code  text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  created_at    timestamptz not null default now()
);

create index locations_company_idx on locations (company_id);
```
(`0001_foundation.sql:111-131`)

Três comentários que são decisão de produto, não implementação:

- `capacity_crates`: "Capacity is declared in crates, never in cubic metres.
  Asking someone for a volume is hostile; asking how many crates fit is the same
  question in the language they already use" (`:116-118`).
- `address_code`: "A simple aisle/shelf address, so a picking list can come out
  in walking order instead of alphabetically. This saves more time in a -20C
  room than any other optimisation on the screen" (`:120-122`).
- `latitude`/`longitude`: "Collected from day one even though routing ships much
  later: history cannot be created retroactively" (`:124-125`).

Estado: **alvo da fila do aparelho.** A travessia manda `id, company_id, name,
kind, created_at` mais três colunas que só existem a partir da 0021
(`src/sync/serialize.ts:149-167`). `capacity_crates`, `address_code`,
`latitude` e `longitude` **não atravessam** e nada no aparelho as escreve.

#### 7.1.7 Enum `item_kind` e tabela `items`

```sql
create type item_kind as enum ('input', 'packaging', 'product', 'resale', 'store_supply');
```
(`0001_foundation.sql:133`) — cinco valores.

```sql
create table items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  kind          item_kind not null,
  name          text not null,
  packaging     jsonb not null default '[{"id":"unit","perBaseUnit":1}]'::jsonb,
  purchase_unit text,
  purchase_to_base numeric(14,4),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index items_company_idx on items (company_id, kind) where active;
```
(`0001_foundation.sql:135-153`)

O índice é **parcial**: `where active`.

O default de `packaging` é a hierarquia mínima. O comentário dá o exemplo
completo da forma esperada (`0001_foundation.sql:140-143`):

```json
[{"id":"unit","perBaseUnit":1},{"id":"box","perBaseUnit":50},{"id":"crate","perBaseUnit":300}]
```

com a razão de ser genérica: "The next customer may stack Unit -> Pack -> Bale
instead" (`:143`).

`purchase_unit`/`purchase_to_base`: "Purchase unit differs from usage unit: sugar
is bought in 25kg sacks and used in 350g doses. Without the factor the cost is
quietly wrong" (`:145-146`).

Estado: **alvo da fila.** Travessia em `src/sync/serialize.ts:169-182`; `packaging`
é convertida de texto para estrutura na saída (`build: (row) => ({ active:
flag(row.active), packaging: structure(row.packaging) })`, `:181`) porque
"mandada crua, o Postgres guarda uma string entre aspas onde deveria haver
objeto" (`src/sync/serialize.ts:163-166`, dito de `sensor_ranges`, mesmo motivo).

#### 7.1.8 Tabela `lots`

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
(`0001_foundation.sql:155-166`)

Índice parcial em `expires_on is not null`. `unique (company_id, code)` — o
código do lote é único por empresa.

Estado nesta parte: **peça pronta e sem escritor por muito tempo.** O registro do
insight é explícito: "o servidor tem `create table lots` desde a 0001, o aparelho
tem `lot_id TEXT` e **nenhuma tabela `lots`**, e o `serialize` manda `lot_id`.
Hoje é sempre nulo e nulo passa na chave estrangeira, então a fila não trava"
(`docs/insights.md:986-991`). Hoje ela é alvo da fila
(`src/sync/serialize.ts:260-274`) e a 0020 teve de acrescentar a política de
reenvio que faltava desde o primeiro dia (`0020_a_lot_and_the_day_it_dies.sql:30-42`).

#### 7.1.9 Os três enums do livro-razão

```sql
create type movement_kind as enum (
  'production', 'consumption', 'transfer', 'sale',
  'loss', 'return', 'adjustment', 'discrepancy', 'reversal'
);

create type loss_reason as enum ('melted', 'broken', 'expired', 'courtesy', 'internal_use');

create type control_post as enum ('picked', 'loaded', 'delivered', 'checked');
```
(`0001_foundation.sql:172-179`)

`movement_kind` nasce com **nove** valores; `'purchase'` só entra na 0007,
virando dez. `loss_reason` tem cinco; `control_post` tem quatro, e são os quatro
postos de controle do plano.

#### 7.1.10 Tabela `movements` — o livro-razão

```sql
create table movements (
  id            uuid primary key,
  company_id    uuid not null references companies(id) on delete cascade,

  kind          movement_kind not null,
  occurred_at   timestamptz not null,
  recorded_at   timestamptz not null default now(),
  recorded_by   uuid not null references auth.users(id),

  item_id       uuid not null references items(id) on delete restrict,
  quantity_base_units bigint not null check (quantity_base_units <> 0),

  location_id   uuid not null references locations(id) on delete restrict,
  counterpart_location_id uuid references locations(id) on delete restrict,

  lot_id        uuid references lots(id) on delete restrict,
  post          control_post,
  loss_reason   loss_reason,

  unit_cost_cents  bigint,
  unit_price_cents bigint,

  reverses_movement_id uuid references movements(id),

  assistant_phrase text,

  note          text,

  constraint loss_needs_reason
    check (kind <> 'loss' or loss_reason is not null),
  constraint reversal_points_somewhere
    check (kind <> 'reversal' or reverses_movement_id is not null)
);
```
(`0001_foundation.sql:181-224`)

| Coluna | Tipo | Nulo? | Default | Restrição / nota |
|---|---|---|---|---|
| `id` | uuid | não | **sem default** | PK. "Generated on the device so replaying an offline queue twice is harmless" (`:182`) |
| `company_id` | uuid | não | — | FK → `companies(id)` cascade |
| `kind` | `movement_kind` | não | — | |
| `occurred_at` | timestamptz | não | — | "When it happened in the world, not when it reached the server. An entry made in a freezer with no signal keeps its real time" (`:187-188`) |
| `recorded_at` | timestamptz | não | `now()` | |
| `recorded_by` | uuid | não | — | FK → `auth.users(id)` (sem ação de delete declarada) |
| `item_id` | uuid | não | — | FK → `items(id)` `on delete restrict` |
| `quantity_base_units` | bigint | não | — | `check (quantity_base_units <> 0)`, nome gerado `movements_quantity_base_units_check`; "Always the smallest unit. Signed: negative leaves, positive arrives" (`:194`) |
| `location_id` | uuid | não | — | FK → `locations(id)` restrict |
| `counterpart_location_id` | uuid | sim | — | FK → `locations(id)` restrict |
| `lot_id` | uuid | sim | — | FK → `lots(id)` restrict |
| `post` | `control_post` | sim | — | |
| `loss_reason` | `loss_reason` | sim | — | |
| `unit_cost_cents` | bigint | sim | — | **derrubada na 0008** |
| `unit_price_cents` | bigint | sim | — | **derrubada na 0008** |
| `reverses_movement_id` | uuid | sim | — | FK → `movements(id)`, auto-referência |
| `assistant_phrase` | text | sim | — | "Set when the assistant drafted this movement, storing the phrase the person actually typed. Makes 'what did the assistant post this month?' answerable. Autonomy without a trail is what breaks trust in the data" (`:211-213`) |
| `note` | text | sim | — | |

Restrições nomeadas, com a expressão literal:

```sql
constraint loss_needs_reason
  check (kind <> 'loss' or loss_reason is not null)
```
Razão escrita: "A loss with no reason becomes 'unexplained shrinkage', and the
report loses credibility with the team. The database refuses to let that happen"
(`0001_foundation.sql:218-219`).

```sql
constraint reversal_points_somewhere
  check (kind <> 'reversal' or reverses_movement_id is not null)
```

Congelamento de custo: "Cost frozen at this instant. A sugar price change in
March must not rewrite January's margin" (`0001_foundation.sql:204-205`).

Índices:

```sql
create index movements_balance_idx
  on movements (company_id, item_id, location_id, occurred_at);
create index movements_lot_idx
  on movements (company_id, lot_id) where lot_id is not null;
create index movements_assistant_idx
  on movements (company_id, recorded_at) where assistant_phrase is not null;
```
(`0001_foundation.sql:226-231`) — o primeiro é o índice do saldo; os outros dois
são parciais.

#### 7.1.11 Imutabilidade: `reject_ledger_mutation()` + `movements_are_immutable`

```sql
create or replace function reject_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'The ledger is append-only. Correct a movement by inserting a reversal, '
    'which keeps the original visible and the history honest.';
end;
$$;

create trigger movements_are_immutable
  before update or delete on movements
  for each row execute function reject_ledger_mutation();
```
(`0001_foundation.sql:234-247`)

- Assinatura: sem argumentos, `returns trigger`, `language plpgsql`. **Não** é
  `SECURITY DEFINER`. Sem `search_path` fixado — corrigido na 0004.
- Corpo: uma única instrução, `raise exception` com a mensagem literal acima (as
  duas linhas são concatenadas pelo Postgres numa frase só: "The ledger is
  append-only. Correct a movement by inserting a reversal, which keeps the
  original visible and the history honest.").
- Gatilho: `before update or delete`, `for each row`. Não cobre `insert` nem
  `truncate`.

Provado: a checagem 1 da `db:verify` roda `update movements set
quantity_base_units = 99999;` e `delete from movements;`, exige que os dois
falhem, e depois confere que o saldo continua 4800
(`scripts/verify-migrations.sh:99-108`).

#### 7.1.12 View `stock_balances`

```sql
create view stock_balances as
  select
    company_id,
    item_id,
    location_id,
    sum(quantity_base_units) as base_units
  from movements
  group by company_id, item_id, location_id;
```
(`0001_foundation.sql:253-260`)

Comentário acima: "Balance is derived, never stored. This view is the single
source both the screens and the assistant read from - two consumers, one truth.
An assistant with its own SQL would eventually report a different number than the
screen, and the app would lose its credibility in a single day" (`:249-252`).

**Nasce sem `security_invoker` — é o furo que a 0004 fecha.** O aparelho refaz a
mesma aritmética localmente e diz isso no docblock: "A mesma aritmética da view
`stock_balances` do servidor, de propósito" (`src/data/repository.ts:524`).

#### 7.1.13 RLS: quais tabelas, e as políticas literais

```sql
alter table companies   enable row level security;
alter table memberships enable row level security;
alter table locations   enable row level security;
alter table items       enable row level security;
alter table lots        enable row level security;
alter table movements   enable row level security;
```
(`0001_foundation.sql:266-271`) — as seis tabelas da migração.

| Política | Tabela | Comando | USING | WITH CHECK | Fonte |
|---|---|---|---|---|---|
| `companies_read` | companies | select | `id in (select current_companies())` | — | `:273-274` |
| `companies_write` | companies | update | `has_capability(id, 'manage_company')` | — | `:276-277` |
| `memberships_read` | memberships | select | `company_id in (select current_companies())` | — | `:279-280` |
| `memberships_manage` | memberships | all | `has_capability(company_id, 'manage_company')` | `has_capability(company_id, 'manage_company')` | `:282-284` |
| `locations_read` | locations | select | `company_id in (select current_companies())` | — | `:286-287` |
| `locations_manage` | locations | all | `has_capability(company_id, 'manage_company')` | idem | `:289-291` |
| `items_read` | items | select | `company_id in (select current_companies())` | — | `:293-294` |
| `items_manage` | items | all | `has_capability(company_id, 'manage_company')` | idem | `:296-298` |
| `lots_read` | lots | select | `company_id in (select current_companies())` | — | `:300-301` |
| `lots_write` | lots | insert | — | `has_capability(company_id, 'record_production')` | `:303-304` |
| `movements_read` | movements | select | `company_id in (select current_companies())` | — | `:306-307` |
| `movements_append` | movements | insert | — | ver 7.1.14 | `:312-326` |

Três ausências que são fato, e importam para quem for reconstruir:

1. **`companies` não tem política de INSERT** — nem aqui nem em nenhuma das 32
   migrações (verificado: `grep "on companies\|companies_" supabase/migrations/*.sql`
   só devolve linhas da 0001). Sob RLS, uma conta autenticada **não pode criar
   empresa**. A decisão do dono diz "Quem cria a empresa é o dono, cadastrando-se
   sozinho" (`CLAUDE.md`, decisões; `docs/roadmap.md:358`) — o caminho de servidor
   para isso **NÃO ESTÁ IMPLEMENTADO**: não há política, não há RPC, não há
   função de cadastro. Na `db:verify` a empresa é inserida como superusuário
   (`scripts/verify-migrations.sh:81-82`, `:440-445`).
2. **`memberships_manage` exige `manage_company` na própria empresa** — o que
   torna a *primeira* associação impossível de criar pelo cliente (não há linha
   ativa que dê a capacidade). Mesma lacuna do item 1, e pela mesma via: na
   verificação as associações entram como superusuário.
3. **Nenhum `GRANT` de tabela aparece nas migrações.** Nem `select`, nem
   `insert`. A `db:verify` precisa concedê-los à mão para que exista um papel que
   não é dono da tabela e portanto sofre RLS (`scripts/verify-migrations.sh:247-251`,
   `:327`, `:451-458`). Como os privilégios de tabela chegam a `authenticated` em
   produção **NÃO ESTÁ NO CÓDIGO**.

#### 7.1.14 `movements_append` — capacidade por tipo de movimento

```sql
create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'production'  then has_capability(company_id, 'record_production')
      when 'consumption' then has_capability(company_id, 'record_production')
      when 'transfer'    then has_capability(company_id, 'dispatch')
      when 'sale'        then has_capability(company_id, 'dispatch')
      when 'loss'        then has_capability(company_id, 'record_loss')
      when 'return'      then has_capability(company_id, 'check_receipt')
      when 'discrepancy' then has_capability(company_id, 'check_receipt')
      when 'adjustment'  then has_capability(company_id, 'adjust_stock')
      when 'reversal'    then has_capability(company_id, 'adjust_stock')
    end
  );
```
(`0001_foundation.sql:312-326`)

Duas propriedades desta política, e as duas são load-bearing:

- **`recorded_by = auth.uid()`** — ninguém grava movimento em nome de outra
  pessoa. É o que decide se um celular compartilhado pode existir, e a
  `db:verify` prova nas duas direções: o dono, que tem todas as capacidades, é
  recusado ao gravar com `recorded_by` do operador
  (`scripts/verify-migrations.sh:394-398`), e a mesma linha passa quando o dono
  assina por si e nomeia o operador em `operator_id`, coluna que só existe a
  partir da 0014 (`scripts/verify-migrations.sh:405-412`).
- **`CASE` sem `ELSE`** — um tipo fora da lista avalia para `NULL` e a escrita é
  recusada. Falha fechada, de propósito: "a movement nobody thought about must
  not be writable" (`0008_ledger_speaks_phase_one.sql:12-13`). O preço é que
  acrescentar valor ao enum sem mexer aqui dá ao aplicativo "a word the database
  silently ignores" (`0008:13-14`).

O comentário acima da política responde por que o assistente não precisa de
regra própria: "The assistant inherits these automatically because it calls the
same queries the screens do - the filter lives in the query, never in an
instruction asking a model to keep a secret" (`0001_foundation.sql:309-311`).

#### 7.1.15 View `movements_visible` — o custo filtrado na consulta

```sql
create view movements_visible with (security_invoker = true) as
  select
    m.id, m.company_id, m.kind, m.occurred_at, m.recorded_at, m.recorded_by,
    m.item_id, m.quantity_base_units, m.location_id, m.counterpart_location_id,
    m.lot_id, m.post, m.loss_reason, m.reverses_movement_id,
    m.assistant_phrase, m.note,
    case when has_capability(m.company_id, 'view_cost')
         then m.unit_cost_cents end as unit_cost_cents,
    case when has_capability(m.company_id, 'view_sale_price')
         then m.unit_price_cents end as unit_price_cents
  from movements m;
```
(`0001_foundation.sql:329-339`)

Já nasce com `security_invoker = true` — ao contrário de `stock_balances`, e a
0004 registra que é "exactly how these slip through"
(`0004_harden.sql:13-14`). Substituída na 0008 (colunas renomeadas para
`unit_cost_rate`/`unit_price_rate`).

---

### 7.2 `0002_recipes.sql` — receitas, custo e compras

273 linhas. A regra em torno da qual o esquema é construído, literal
(`0002_recipes.sql:4-7`):

> "registering a purchase is the same event that moves the cost. Nobody ever
> 'updates the price of sugar' as a chore - they enter the invoice, every recipe
> that uses sugar recalculates, and the price history writes itself."

E a nota de precisão, que é a fundação `Cents`/`Rate` dita dentro do esquema
(`0002_recipes.sql:9-12`):

> "unit costs are numeric, not bigint. Money paid is integer cents, but a *rate*
> is not money - strawberry pulp at R$ 12.40/kg is 1.24 cents per gram, and
> forcing that into a whole cent loses a fifth of it before the first
> multiplication. A millilitre of mix rounds straight to zero."

#### 7.2.1 `suppliers`

```sql
create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  tax_id        text,
  promised_lead_days smallint,
  created_at    timestamptz not null default now()
);

create index suppliers_company_idx on suppliers (company_id);
```
(`0002_recipes.sql:19-30`)

`promised_lead_days`: "What they promise. The system trusts the observed value
instead, computed from deliveries: suppliers say three days and deliver in six"
(`:24-25`). O valor observado **NÃO ESTÁ IMPLEMENTADO** em nenhuma migração.

Estado: **sem chamador.** `suppliers` não está em `ServerTable`
(`src/sync/serialize.ts:61-78`) e nenhuma checagem da `db:verify` a escreve. É a
tabela que a 0010 contorna acrescentando `purchases.supplier_name`.

#### 7.2.2 `purchases`

```sql
create table purchases (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  supplier_id   uuid references suppliers(id) on delete restrict,
  ordered_at    timestamptz,
  received_at   timestamptz,
  invoice_number text,
  freight_cents bigint not null default 0,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);
```
(`0002_recipes.sql:32-42`)

| Coluna | Tipo | Nulo? | Default |
|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` |
| `company_id` | uuid | não | — (FK cascade) |
| `supplier_id` | uuid | sim | — (FK restrict) |
| `ordered_at` | timestamptz | sim | — |
| `received_at` | timestamptz | sim | — |
| `invoice_number` | text | sim | — |
| `freight_cents` | bigint | não | `0` |
| `created_by` | uuid | não | — (FK `auth.users`) |
| `created_at` | timestamptz | não | `now()` |

Sem índice além da PK — nem por `company_id`. Isso é fato, não recomendação.

Estado: **alvo da fila.** A travessia manda `id, company_id, supplier_name,
ordered_at, received_at, created_at` e estampa `created_by` a partir do ator
(`src/sync/serialize.ts:276-279`). `supplier_id`, `invoice_number` e
`freight_cents` **não atravessam** e nada os escreve.

#### 7.2.3 `purchase_lines`

```sql
create table purchase_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  purchase_id   uuid not null references purchases(id) on delete cascade,
  item_id       uuid not null references items(id) on delete restrict,
  purchase_quantity numeric(14,4) not null check (purchase_quantity > 0),
  base_units    bigint not null check (base_units > 0),
  total_cents   bigint not null check (total_cents >= 0),
  expected_base_units bigint
);

create index purchase_lines_item_idx on purchase_lines (company_id, item_id);
```
(`0002_recipes.sql:44-59`)

Três CHECK inline, com a expressão literal: `purchase_quantity > 0`,
`base_units > 0`, `total_cents >= 0`. `purchase_quantity` é "What the buyer
typed: 8 sacks. Converted to base units on the way in, so the ledger only ever
sees the smallest unit" (`:49-50`).

Comentário de coluna, literal (`0002_recipes.sql:61-63`):

> `What the order asked for. Compared against base_units at receiving; a mismatch blocks before payment rather than surfacing in a report later.`

Estado: **alvo da fila** (`src/sync/serialize.ts:281-293`), com uma diferença
registrada: `created_at` **fica no aparelho de propósito**, porque "o servidor
não tem a coluna; a hora que interessa é a da nota"
(`src/sync/columns.test.ts:46-49`). `expected_base_units` não atravessa e **não
tem escritor em lugar nenhum**.

#### 7.2.4 `item_costs` — a média móvel

```sql
create table item_costs (
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  average_rate  numeric(18,8) not null default 0,
  last_rate     numeric(18,8),
  on_hand_base_units bigint not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (company_id, item_id)
);
```
(`0002_recipes.sql:73-82`)

PK composta `(company_id, item_id)`; sem `id`. `average_rate` e `last_rate` são
`numeric(18,8)` — "Fractional cents per base unit" (`:76`).
`on_hand_base_units` **é derrubada na 0009**, e a razão está em 7.9.

Por que a média e não o último preço: "Last price stays visible for negotiation
('R$ 118 here; R$ 112 last month at supplier B'), but the average is what a batch
is costed against - a single unlucky invoice should not make margin jump"
(`0002_recipes.sql:69-72`).

Estado: **escrita só por gatilho, e deliberadamente não sincronizada.** O
aparelho tem a média local dele e **não a manda**, com a razão escrita e o número
que provou o custo de mandar (`src/sync/serialize.ts:44-58`):

> "`item_costs` is a derived value, and derived values get exactly one owner. The
> device computes an average locally because it must show a cost with no signal;
> the server computes its own from the purchase lines, by the same rule, in a
> trigger. Sending the device's copy gives the number two authors, and the replay
> proved what that costs: the queue carries row *ids*, so it resends whatever the
> row says now, and the server's trigger then blended a new invoice against an
> average that only existed after it - arriving at 0.5605 where the device said
> 0.5310."

#### 7.2.5 `item_cost_history`

```sql
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
(`0002_recipes.sql:86-96`)

`purchase_line_id` é a única FK com `on delete set null` em todo o esquema desta
parte. O índice tem `observed_at desc` explícito.

Razão de existir: "Every change is kept. The price history the user asked for is
not a separate feature anyone has to remember to fill in - it is a by-product of
buying" (`0002_recipes.sql:84-85`).

#### 7.2.6 `recipes`, `recipe_versions`, `recipe_lines`

```sql
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  name          text not null,
  yield_amount  numeric(14,4) not null check (yield_amount > 0),
  yield_unit    text not null default 'ml',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index recipes_company_idx on recipes (company_id) where active;
```
(`0002_recipes.sql:102-115`)

`yield_amount`: "What one batch yields, in the recipe's own measure (millilitres
of mix, grams of dough). Deliberately separate from the product conversion so the
same batch can become a popsicle, a 2L tub and a small cup" (`:106-108`).

```sql
create table recipe_versions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  recipe_id     uuid not null references recipes(id) on delete cascade,
  version       integer not null,
  effective_from date not null default current_date,
  loss_fraction numeric(5,4) not null default 0 check (loss_fraction >= 0 and loss_fraction < 1),
  note          text,
  created_at    timestamptz not null default now(),
  unique (recipe_id, version)
);
```
(`0002_recipes.sql:119-132`)

- `unique (recipe_id, version)` — **sem `company_id`**, e é suficiente porque
  `recipe_id` já pertence a uma empresa.
- `loss_fraction` com CHECK literal `loss_fraction >= 0 and loss_fraction < 1`.
  Razão: "Expected loss as a fraction: 0.05 is 5%. Real ice cream operations lose
  3-8% between leftover mix, breakage and freezer burn. Without this the
  theoretical cost is always optimistic, and the owner never learns why"
  (`:125-127`).
- Sem índice além da PK e do unique.
- Versões nunca são sobrescritas: "Production records which version it used, so
  changing the formula does not rewrite last year's cost" (`:117-118`).

```sql
create table recipe_lines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  recipe_version_id uuid not null references recipe_versions(id) on delete cascade,
  item_id       uuid references items(id) on delete restrict,
  sub_recipe_id uuid references recipes(id) on delete restrict,
  quantity      numeric(14,4) not null check (quantity > 0),
  constraint one_source check (num_nonnulls(item_id, sub_recipe_id) = 1)
);

create index recipe_lines_version_idx on recipe_lines (recipe_version_id);
```
(`0002_recipes.sql:134-146`)

`one_source` usa `num_nonnulls(...) = 1` — exatamente um dos dois. Razão: "A cream
base used by eight flavours is a sub-recipe, so a milk price rise moves all eight"
(`:138-139`).

**Ciclo de receita não é impedido no banco**, e isso está escrito
(`0002_recipes.sql:148-151`):

> "Cycle prevention lives in the application (see costRecipe / explodeRequirements
> in src/domain/recipe.ts, which raise RecipeCycleError). Enforcing it here would
> need a recursive trigger on every insert; the app catches it earlier and can
> tell the user which recipes form the loop."

#### 7.2.7 `products`

```sql
create table products (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null references items(id) on delete cascade,
  recipe_id     uuid references recipes(id) on delete restrict,
  yield_per_unit numeric(14,4),
  unit_packaging_cents bigint not null default 0,
  active        boolean not null default true,
  unique (company_id, item_id),
  constraint manufactured_needs_recipe
    check ((recipe_id is null) = (yield_per_unit is null))
);

create index products_company_idx on products (company_id) where active;
```
(`0002_recipes.sql:157-175`)

- **Não tem `created_at`** — é a única tabela desta parte sem essa coluna.
- `yield_per_unit`: "How much of the batch one finished unit takes: 75 ml per
  popsicle" (`:162`).
- `unit_packaging_cents`: "Packaging that belongs to the unit rather than the
  batch: the stick, the wrapper. Kept apart so it can be stated instead of
  smeared into the mix" (`:164-165`).
- `manufactured_needs_recipe` com a expressão literal
  `((recipe_id is null) = (yield_per_unit is null))`: "A manufactured product
  needs a recipe and a conversion; a resale product needs neither, and its cost
  comes from the purchase invoice" (`:169-170`).

Provado: a checagem 3 da `db:verify` insere um produto com receita e sem
`yield_per_unit`, exige recusa, e depois insere o completo (75 ml, 5 centavos de
embalagem) exigindo aceitação (`scripts/verify-migrations.sh:176-200`).

#### 7.2.8 RLS da 0002 — nove tabelas, e a assimetria de custo

```sql
alter table suppliers         enable row level security;
alter table purchases         enable row level security;
alter table purchase_lines    enable row level security;
alter table item_costs        enable row level security;
alter table item_cost_history enable row level security;
alter table recipes           enable row level security;
alter table recipe_versions   enable row level security;
alter table recipe_lines      enable row level security;
alter table products          enable row level security;
```
(`0002_recipes.sql:181-189`)

| Política | Tabela | Comando | USING | WITH CHECK | Fonte |
|---|---|---|---|---|---|
| `suppliers_read` | suppliers | select | `company_id in (select current_companies())` | — | `:192` |
| `recipes_read` | recipes | select | idem | — | `:193` |
| `recipe_versions_read` | recipe_versions | select | idem | — | `:194` |
| `recipe_lines_read` | recipe_lines | select | idem | — | `:195` |
| `products_read` | products | select | idem | — | `:196` |
| `item_costs_read` | item_costs | select | `has_capability(company_id, 'view_cost')` | — | `:200-201` |
| `item_cost_history_read` | item_cost_history | select | `has_capability(company_id, 'view_cost')` | — | `:202-203` |
| `purchases_read` | purchases | select | `has_capability(company_id, 'view_cost')` | — | `:204-205` |
| `purchase_lines_read` | purchase_lines | select | `has_capability(company_id, 'view_cost')` | — | `:206-207` |
| `suppliers_manage` | suppliers | all | `has_capability(company_id, 'manage_company')` | idem | `:209` |
| `recipes_manage` | recipes | all | idem | idem | `:210` |
| `recipe_versions_manage` | recipe_versions | all | idem | idem | `:211` |
| `recipe_lines_manage` | recipe_lines | all | idem | idem | `:212` |
| `products_manage` | products | all | idem | idem | `:213` |
| `purchases_write` | purchases | insert | — | `has_capability(company_id, 'view_finance')` | `:215-216` |
| `purchase_lines_write` | purchase_lines | insert | — | `has_capability(company_id, 'view_finance')` | `:217-218` |

O comentário que explica a separação: "Cost is different: the operator records
production without ever seeing what anything costs. The filter lives in the
policy, not in a hidden button" (`0002_recipes.sql:198-199`).

Duas assimetrias que são fato do esquema:

- **Compra: ler exige `view_cost`, escrever exige `view_finance`.** São
  capacidades diferentes, e não há política que ligue as duas.
- **`item_costs` e `item_cost_history` não têm política de escrita nenhuma.** Só
  `select`, gated por `view_cost`. Quem escreve é o gatilho
  `apply_purchase_to_cost()`, que é `SECURITY DEFINER` (`0002_recipes.sql:227`) —
  no Postgres, o dono de tabela não sofre RLS por padrão, e é assim que a escrita
  acontece sem política. Consequência prática: **nenhum cliente pode escrever
  custo diretamente**, por construção.

#### 7.2.9 `apply_purchase_to_cost()` v1 + gatilho `purchase_moves_cost`

Assinatura: sem argumentos, `returns trigger`, `language plpgsql`,
`security definer`, `set search_path = public`
(`0002_recipes.sql:224-229`).

Variáveis declaradas: `held_units bigint`, `held_rate numeric(18,8)`,
`new_rate numeric(18,8)`, `line_rate numeric(18,8)` (`:230-234`).

Corpo, fiel:

1. `line_rate := new.total_cents::numeric / new.base_units;` — o preço desta nota
   por unidade base (`:236`).
2. Lê `on_hand_base_units` e `average_rate` de `item_costs` para
   `(company_id, item_id)` (`:238-241`).
3. Se não havia linha (`held_units is null`), assume `held_units := 0` e
   `held_rate := 0` (`:243-246`).
4. `held_units := greatest(held_units, 0);` — estoque negativo conta como zero.
   Razão: "Negative stock (a count that is behind reality) is treated as zero
   rather than rejected - refusing it would push people to type something false"
   (`:249-251`).
5. **A fórmula da média móvel ponderada:**
   ```sql
   new_rate := ((held_rate * held_units) + new.total_cents) / (held_units + new.base_units);
   ```
   (`:253`)
6. `insert ... on conflict (company_id, item_id) do update` em `item_costs`,
   gravando `average_rate = excluded.average_rate`,
   `last_rate = excluded.last_rate`,
   `on_hand_base_units = item_costs.on_hand_base_units + new.base_units`,
   `updated_at = now()` (`:255-261`).
7. `insert into item_cost_history (company_id, item_id, purchase_line_id,
   previous_rate, new_rate) values (new.company_id, new.item_id, new.id,
   nullif(held_rate, 0), new_rate);` — o histórico como subproduto, com
   `previous_rate` nulo na primeira compra (`:264-265`).
8. `return new;`

```sql
create trigger purchase_moves_cost
  after insert on purchase_lines
  for each row execute function apply_purchase_to_cost();
```
(`0002_recipes.sql:271-273`) — `after insert`, `for each row`. Não dispara em
update nem em delete.

Provado (com a versão da 0009): checagem 2 da `db:verify` compra 100 kg a
R$ 4,72/kg e depois 100 kg a R$ 5,90/kg do mesmo item, e exige
`round(average_rate,3) = 0.531`, `round(last_rate,3) = 0.590` e **2** linhas de
histórico (`scripts/verify-migrations.sh:124-174`).

---

### 7.3 `0003_base_unit.sql` — a unidade em que o item é usado

22 linhas, uma coluna. O problema, literal: "0001 recorded how an item is
*bought* (a 25 kg sack) and how many base units that holds (25,000). What it
never recorded was what that base unit is called. The app needed it the moment a
screen tried to say a sentence: `R$ 118 ÷ 25.000 = R$ 4,72 a cada 1.000 g`"
(`0003_base_unit.sql:5-10`).

```sql
alter table items
  add column if not exists base_unit text not null default 'un';

comment on column items.base_unit is
  'The smallest unit a recipe works in: g, ml, un. Purchase units convert into it.';
```
(`0003_base_unit.sql:18-22`)

Duas coisas registradas na justificativa:

- Sem a palavra, "every hint has to guess 'g' - which is wrong for syrup in
  millilitres and absurd for sticks counted one by one" (`:11-12`).
- O default `'un'` é escolha explícita para as linhas existentes: "the only honest
  answer for data recorded before the question was asked: one of whatever it was"
  (`:15-16`).

E a razão de o servidor ter de acompanhar: "The device schema already carries it,
so the server has to as well or the sync loses it" (`:12-13`).

Estado: **alvo da fila** (`src/sync/serialize.ts:177`). Verificado na checagem 3
da `db:verify`, que confere que `base_unit` sobrevive ao insert
(`scripts/verify-migrations.sh:198-199`).

---

### 7.4 `0004_harden.sql` — três buracos que o linter do banco achou no primeiro deploy

61 linhas. Os três, com a razão de cada um transcrita
(`0004_harden.sql:8-20`):

1. **`stock_balances` sem `security_invoker`.** "A view defaults to running with
   its creator's rights, which means it reads straight past row level security:
   any signed-in user could have read the balances of every company on the
   server. The whole point of stamping company_id on the first migration was to
   make that impossible, and one missing option on one view undid it.
   `movements_visible` had the option; this one did not, which is exactly how
   these slip through."
2. **Gatilho com `search_path` mutável.** "A trigger function with a mutable
   search_path can be pointed at objects the author did not mean, by anyone able
   to set a schema ahead of public."
3. **O gatilho da média era alcançável como endpoint REST.** "It is a trigger, so
   nothing should ever call it directly."

DDL:

```sql
alter view stock_balances set (security_invoker = true);
```
(`0004_harden.sql:28`)

```sql
create or replace function reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'The ledger is append-only. Correct a movement by inserting a reversal, '
    'which keeps the original visible and the history honest.';
end;
$$;
```
(`0004_harden.sql:31-41`) — "Recreated only to pin the search path; the body is
unchanged" (`:30`). Note `search_path = ''` (vazio), não `public`.

```sql
do $$
begin
  revoke execute on function apply_purchase_to_cost() from public;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function apply_purchase_to_cost() from anon;
    revoke execute on function current_companies() from anon;
    revoke execute on function has_capability(uuid, capability) from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function apply_purchase_to_cost() from authenticated;
    grant execute on function current_companies() to authenticated;
    grant execute on function has_capability(uuid, capability) to authenticated;
  end if;
end
$$;
```
(`0004_harden.sql:45-61`)

O bloco `do` com teste de `pg_roles` existe porque "The API roles exist on
Supabase and not in a bare Postgres, so the local verification run skips this
block instead of failing on an unknown role" (`:43-44`). Sem isso, `db:verify`
não rodaria.

O que a 0004 **deliberadamente não fez**, e a justificativa que a 0006 depois
revisa (`0004_harden.sql:22-26`):

> "What is deliberately left as it is: `current_companies()` and
> `has_capability()` stay callable by signed-in users, because every policy in
> 0001 and 0002 calls them and Postgres checks that permission as the querying
> user. Neither takes an identity as input - both answer only about `auth.uid()`
> - so a caller learns nothing about anyone but themselves."

---

### 7.5 `0005_revoke_public_execute.sql` — o revoke que a 0004 não conseguiu

30 linhas. O defeito é um default do Postgres, e está escrito
(`0005_revoke_public_execute.sql:5-9`):

> "0004 revoked EXECUTE on the policy helpers from `anon` and the linter still
> reported them as callable without signing in. The reason is a Postgres default
> that is easy to forget: a new function grants EXECUTE to PUBLIC, and every role
> inherits that. Revoking from one role changes nothing while the grant to PUBLIC
> is still standing."

```sql
revoke execute on function current_companies() from public;
revoke execute on function has_capability(uuid, capability) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function current_companies() to authenticated;
    grant execute on function has_capability(uuid, capability) to authenticated;
  end if;
end
$$;
```
(`0005_revoke_public_execute.sql:20-30`)

A ordem importa: tira de `PUBLIC` e devolve a `authenticated` sozinho, "The
policies in 0001 and 0002 call these functions, and Postgres checks that
permission as the querying user, so signed-in users must keep it" (`:12-13`).

E o parágrafo que fixa a regra de migração append-only está aqui, citado em 7.0
(`:15-18`).

---

### 7.6 `0006_private_helpers.sql` — tirar os ajudantes da API pública

45 linhas. Revisa a decisão da 0004 com um argumento novo
(`0006_private_helpers.sql:5-17`):

> "The reasoning holds. What it misses is that being *callable* is not the same
> as being *published*: sitting in `public`, both are reachable as REST endpoints
> at /rest/v1/rpc/, which turns an internal detail of the policies into part of
> the product's public surface. […] exposed as an endpoint it is a probe anyone
> signed in can run against any company id they can name, and it is the kind of
> surface that becomes a real problem the day somebody adds a helper that does
> take an identity."

```sql
create schema if not exists private;

comment on schema private is
  'Helpers the RLS policies call. Deliberately outside the API schema: these '
  'are how the walls are built, not something a client should be able to ask.';

alter function public.current_companies() set schema private;
alter function public.has_capability(uuid, capability) set schema private;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema private to authenticated;
  end if;
end
$$;
```
(`0006_private_helpers.sql:27-45`)

Duas propriedades que a migração registra por escrito:

- **As quarenta políticas não precisam ser reescritas.** "The policies survive
  because Postgres stores the function's identity, not its name, so they follow
  the move on their own - which is also why this is an ALTER and not a rewrite of
  forty policies" (`:20-22`). Mas política **nova** tem de qualificar: a 0008 diz
  "anything written from here on has to say where the function lives"
  (`0008:18-19`), e o insight de sessão registra o custo de descobrir isso na
  hora ("`has_capability` mudou para o schema `private` na 0004, o que só aparece
  quando se escreve uma política nova", `docs/insights.md:690`).
- **Os grants de EXECUTE seguem a função**; o que falta é `usage` no schema novo
  (`:36-38`).

O `search_path = public` fixado na 0001 continua valendo, "so the bodies still
find `memberships` from their new home" (`:24-25`).

---

### 7.7 `0007_movement_kind_purchase.sql` — a palavra que faltava

16 linhas, uma instrução:

```sql
alter type movement_kind add value if not exists 'purchase';
```
(`0007_movement_kind_purchase.sql:16`)

`movement_kind` passa a ter **dez** valores.

O diagnóstico, literal (`0007:3-11`):

> "`movement_kind` was written from the factory outwards: production, transfer,
> sale, loss. Every one of them is stock the company already owns, moving.
> Nothing in the list describes stock arriving from a supplier against an invoice
> - which is the first movement any real installation will record, because a
> factory buys sugar before it makes anything. The gap was invisible while the
> ledger lived only on the server. It surfaced the moment the device grew one and
> had to name what a purchase does to a balance."

**Por que é migração sozinha** — e é a razão pela qual a próxima é separada
(`0007:13-15`):

> "Postgres will add a value to an enum inside a transaction, but refuses to let
> the same transaction *use* it, and the policy in the next step has to name it."

---

### 7.8 `0008_ledger_speaks_phase_one.sql` — três coisas que o servidor recusaria do celular

92 linhas, três consertos independentes. Como foram achados: "by building the
device's ledger against this schema and asking, statement by statement, what
Postgres would do with what the phone is about to send. None of them could be
seen by reading either side alone" (`0008:3-6`).

#### 7.8.1 A política reescrita, com `purchase` e com `private.`

```sql
drop policy movements_append on movements;

create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'purchase'    then private.has_capability(company_id, 'check_receipt')
      when 'production'  then private.has_capability(company_id, 'record_production')
      when 'consumption' then private.has_capability(company_id, 'record_production')
      when 'transfer'    then private.has_capability(company_id, 'dispatch')
      when 'sale'        then private.has_capability(company_id, 'dispatch')
      when 'loss'        then private.has_capability(company_id, 'record_loss')
      when 'return'      then private.has_capability(company_id, 'check_receipt')
      when 'discrepancy' then private.has_capability(company_id, 'check_receipt')
      when 'adjustment'  then private.has_capability(company_id, 'adjust_stock')
      when 'reversal'    then private.has_capability(company_id, 'adjust_stock')
    end
  );
```
(`0008:24-41`)

Dez ramos, ainda sem `ELSE`. `purchase` responde a `check_receipt` por decisão
escrita: "Receiving a purchase is checking a receipt, so it answers to the
capability that already governs receiving: the buyer and the person at the door
can record what arrived, and neither of them needs to see a cost to do it"
(`0008:21-23`).

Esta é a política de insert de `movements` **em vigor** — nenhuma migração
posterior a substitui.

#### 7.8.2 A contagem que confere deixa de ser recusada

```sql
alter table movements drop constraint movements_quantity_base_units_check;

alter table movements add constraint movement_moved_something
  check (quantity_base_units <> 0 or kind = 'adjustment');
```
(`0008:52-55`)

A razão, inteira (`0008:45-51`):

> "`quantity_base_units <> 0` reads as obviously right: a movement that moves
> nothing is noise. It is right for every kind but one. A physical count is
> recorded as the difference between the shelf and the ledger, and the most
> valuable count result is a difference of zero - somebody walked to the storeroom
> and the books were correct. Refusing to store that leaves a shelf nobody has
> checked in months indistinguishable from one verified this morning, which is
> precisely the confusion counting exists to end."

Note o nome antigo, gerado pelo Postgres:
`movements_quantity_base_units_check`. A 0017 troca esta restrição outra vez
(parte B).

Provado: checagem 5 grava `adjustment` com quantidade 0 e exige que fique
(`scripts/verify-migrations.sh:359-363`), e grava `production` com 0 exigindo que
**não** fique (`:367-371`).

#### 7.8.3 `Cents`/`Rate`: as colunas de custo trocam de tipo

```sql
drop view movements_visible;

alter table movements drop column unit_cost_cents;
alter table movements drop column unit_price_cents;

alter table movements add column unit_cost_rate  double precision;
alter table movements add column unit_price_rate double precision;

create view movements_visible with (security_invoker = true) as
  select
    m.id, m.company_id, m.kind, m.occurred_at, m.recorded_at, m.recorded_by,
    m.item_id, m.quantity_base_units, m.location_id, m.counterpart_location_id,
    m.lot_id, m.post, m.loss_reason, m.reverses_movement_id,
    m.assistant_phrase, m.note,
    case when private.has_capability(m.company_id, 'view_cost')
         then m.unit_cost_rate end as unit_cost_rate,
    case when private.has_capability(m.company_id, 'view_sale_price')
         then m.unit_price_rate end as unit_price_rate
  from movements m;
```
(`0008:74-92`)

O diagnóstico, com o número (`0008:57-65`):

> "`Cents` is money that was paid and is a whole number; `Rate` is a price per
> unit and is fractional. Only the final amount rounds, once. The ledger's own
> columns broke that rule - `unit_cost_cents bigint` is a rate stored as money,
> and a sack of sugar at R$ 118 for 25 kg is 0.472 cents per gram, which as a
> bigint is 0. Every cheap input would have frozen its cost as nothing, and margin
> reports built on it would have looked plausible."

Por que **substituir** e não acrescentar ao lado: "The table is empty in every
environment, so the columns are replaced rather than shadowed. A wrong column
left beside a right one is the trap that put a mutable stock total on the device
in the first place" (`0008:67-69`).

Provado: checagem 4 lê `unit_cost_rate` do dono e exige exatamente `0.472`
(`scripts/verify-migrations.sh:275-276`), e do operador sem `view_cost` exige
`null` (`:278-279`).

Sequela: o tipo do domínio ficou atrás por uma sessão — "`src/domain/ledger.ts`
ainda declarava `unitCostCents?: Cents`, enquanto a migração `0008` derrubou
`unit_cost_cents` no servidor" — e sobreviveu porque nenhuma tela importava o
módulo (`docs/insights.md:1078-1090`).

---

### 7.9 `0009_average_asks_the_ledger.sql` — o gatilho passa a perguntar aos movimentos

75 linhas. O que a migração corrige, com a origem: um guard recém-escrito achou no
servidor a mesma coluna proibida que tinha sido tirada do aparelho
(`0009:1-7`; `docs/insights.md:142-172`). E era pior que duplicata
(`0009:9-13`):

> "The trigger maintained the total from purchase lines alone, so it counted
> arrivals and nothing else. The moment a count, a loss or a production run
> existed, the column and the ledger would answer 'how much is there' with two
> different numbers, and the average cost would be computed against the wrong
> one."

Nova versão da função — mesma assinatura (`returns trigger`, `plpgsql`,
`security definer`, `set search_path = public`), mesmas quatro variáveis
(`0009:22-32`):

1. `line_rate := new.total_cents::numeric / new.base_units;` (`:34`)
2. **O que mudou:** o que havia antes desta chegada vem do livro-razão, não de
   coluna (`:37-42`):
   ```sql
   select coalesce(sum(quantity_base_units), 0)
     into held_units
     from movements
    where company_id = new.company_id
      and item_id = new.item_id
      and id <> new.id;
   ```
3. `held_rate` continua vindo de `item_costs` (`:44-47`), com `if held_rate is
   null then held_rate := 0; end if;` (`:49-51`).
4. `held_units := greatest(held_units, 0);` (`:57`) — mesma razão da v1.
5. Mesma fórmula:
   ```sql
   new_rate := ((held_rate * held_units) + new.total_cents) / (held_units + new.base_units);
   ```
   (`:58`)
6. Upsert em `item_costs` **sem** `on_hand_base_units` (`:60-65`).
7. Mesmo insert em `item_cost_history` (`:68-69`).

```sql
alter table item_costs drop column on_hand_base_units;
```
(`0009:75`)

**Por que excluir por id funciona, e é a parte que não se adivinha** (`0009:15-20`):

> "What makes it safe is a decision already taken there - a purchase line and the
> movement it causes share one id, because they are one fact seen twice. So the
> trigger can exclude this line's own movement by id and get 'what was held
> before this arrival' whether the movement reached the server before the line,
> after it, or not yet at all. No ordering to depend on, and a replay cannot
> double it."

O guard que achou isso continua rodando dentro da `db:verify`, e é uma varredura
de **nome de coluna**:

```sql
select count(*) from information_schema.columns
 where table_schema = 'public'
   and column_name ~* '(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)';
```
(`scripts/verify-migrations.sh:118-121`) — exige zero. A razão de ser por nome:
"whoever adds one is describing exactly what it is"
(`scripts/verify-migrations.sh:116-117`).

Prova independente das duas médias: a checagem 6 compara a média que o gatilho do
Postgres calculou com a que o aparelho calculou sozinho, e falha se divergirem —
"é a única checagem do projeto que compara duas implementações independentes da
mesma regra" (`scripts/verify-migrations.sh:523-529`).

---

### 7.10 `0010_what_the_device_actually_sends.sql` — duas colunas que o aparelho já escrevia

28 linhas. Como foram achadas: "by taking the device's outbox and asking, row by
row, what Postgres would do with it. Neither is exotic; both were invisible
because nothing had ever tried to replay a queue against this schema"
(`0010:4-5`).

#### 7.10.1 `recipe_lines.position`

```sql
alter table recipe_lines add column position integer not null default 0;

create index recipe_lines_order_idx on recipe_lines (recipe_version_id, position);
```
(`0010:14-16`)

Razão: "a recipe that synced would come back on another phone with its
ingredients in whatever order Postgres felt like. That is not a cosmetic loss: a
technical sheet is read top to bottom while somebody is working, and the person
who wrote it put the base first and the colouring last on purpose"
(`0010:9-13`). O aparelho já tinha a coluna; a travessia a manda
(`src/sync/serialize.ts:213`), com o registro de que ela "only became a server
column once this file existed to notice it was missing"
(`src/sync/serialize.ts:203-205`).

#### 7.10.2 `purchases.supplier_name`

```sql
alter table purchases add column supplier_name text;
```
(`0010:28`)

Razão: "Today the buyer types 'Fornecedor Silva' into a field, and that text had
nowhere to land - the invoice would arrive on the server having forgotten who
sold it" (`0010:21-23`). E a decisão de manter as duas colunas: "the name is what
was typed, the id is what it resolves to when suppliers become real. Neither is
required, and a purchase carrying only a name is a complete record of what
actually happened" (`0010:25-27`).

---

### 7.11 `0011_joining_a_company.sql` — entrar numa empresa passa a ter dois caminhos

68 linhas, a primeira migração escrita em português. O buraco de segurança que ela
fecha, literal (`0011:6-9`):

> "O segundo caminho não existia no esquema, e a ausência era um buraco de
> segurança: `memberships` não tem estado, então qualquer linha ali já vale como
> membro. Quem descobrisse o código entraria com permissão antes de alguém dizer
> sim."

#### 7.11.1 Enum `membership_state` e coluna `memberships.state`

```sql
create type membership_state as enum ('pending', 'active', 'revoked');

alter table memberships
  add column state membership_state not null default 'active';
```
(`0011:11-14`)

Três valores. O default é `'active'` — o que significa que **pedir para entrar
exige dizer `state = 'pending'` explicitamente**; qualquer insert que omita a
coluna cria um membro ativo.

#### 7.11.2 As duas funções de permissão, terceira e atual versão

```sql
create or replace function private.current_companies()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from memberships
   where user_id = auth.uid() and state = 'active';
$$;
```
(`0011:22-31`)

```sql
create or replace function private.has_capability(target_company uuid, needed capability)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = target_company
      and state = 'active'
      and needed = any (capabilities)
  );
$$;
```
(`0011:33-47`)

A justificativa de por que o filtro mora aqui e em nenhum outro lugar
(`0011:16-21`):

> "Existir na tabela deixa de ser suficiente. As duas funções abaixo são a
> permissão inteira deste sistema: uma diz de que empresas você é, a outra diz o
> que você pode nela. Elas eram consultas sobre *existir uma linha*. Agora são
> sobre existir uma linha **ativa** - e é aqui, e só aqui, que 'pendente' vira
> inofensivo. Filtrar na tela seria decoração."

Provado, nas duas direções: quem está `pending` vê **zero** itens e **zero**
movimentos, e depois de `update memberships set state = 'active'` vê os 3 itens da
empresa (`scripts/verify-migrations.sh:292-314`). A segunda metade existe para a
checagem não passar "com um usuário simplesmente quebrado"
(`scripts/verify-migrations.sh:307-308`).

#### 7.11.3 `companies.join_code`

```sql
alter table companies add column join_code text unique;
```
(`0011:55`)

Nulo permitido; `unique` global (não por empresa — é a chave que identifica a
empresa). Decisão escrita (`0011:49-54`):

> "Curto o bastante para ser dito em voz alta no chão de fábrica e trocável a
> qualquer momento: quem sai da empresa não leva a porta junto. Ele não dá acesso
> a nada sozinho - só cria um pedido, que continua `pending` até o dono aprovar."

**Estado: implementado sem nenhum chamador.** `join_code` aparece só nesta linha
em todo o repositório — não há gerador de código, não há função de resgate, não há
política que crie a associação pendente a partir dele, e nenhuma tela o menciona.
O caminho "pedir entrada por código" existe no esquema como coluna e como estado;
o **mecanismo** que liga os dois **NÃO ESTÁ IMPLEMENTADO**.

#### 7.11.4 Enum `floor_sign_in` e `companies.floor_sign_in`

```sql
create type floor_sign_in as enum ('personal', 'shared');

alter table companies
  add column floor_sign_in floor_sign_in not null default 'personal';
```
(`0011:65-68`)

O tipo e a coluna têm o mesmo nome. Razão da configuração, e do padrão
(`0011:57-64`):

> "'Depende de quem usa' vira dado, não código: uma fábrica dá um celular por
> pessoa, outra tem um aparelho pendurado na câmara fria que passa de mão em mão.
> Os dois caminhos existem no produto e a empresa escolhe. O padrão é `personal`
> porque é o que não exige preparo nenhum: o dono instala, entra, e está
> funcionando. Quem compartilha aparelho liga a outra opção."

**Estado: implementado sem nenhum chamador.** `floor_sign_in` só aparece nestas
duas linhas em todo o repositório. Nenhuma tela lê a configuração, e o caminho
`shared` (PIN numa grade de nomes) **NÃO ESTÁ IMPLEMENTADO** em nenhum lugar do
servidor. O que o servidor já **impede** é a versão errada dele: como
`movements_append` exige `recorded_by = auth.uid()`, um aparelho compartilhado não
pode sincronizar o trabalho de todos sob uma conta rotulando cada linha com quem
estava segurando (`scripts/verify-migrations.sh:389-393`). A resposta que o
servidor **permite** é a coluna `operator_id`, que só chega na 0014
(`scripts/verify-migrations.sh:400-412`).

---

### 7.12 Como esta parte é provada — o que a `db:verify` exercita das migrações 0001 a 0011

`npm run db:verify` → `bash scripts/verify-migrations.sh` (`package.json:14`).
Sobe um Postgres descartável na porta 55432 com `PGDATA=/tmp/norva-verify-db`,
aplica as 32 migrações e roda 13 checagens; "Nothing is left running"
(`scripts/verify-migrations.sh:17-25`, `:37-41`).

| Checagem | Afirmação, e o número exato exigido | Migrações que ela exercita | Fonte |
|---|---|---|---|
| 1 | `UPDATE` e `DELETE` em `movements` são recusados, e o saldo continua **4800** | 0001 (gatilho), 0004 (`security_invoker` da view) | `:99-108` |
| 1b | Nenhuma coluna no schema `public` casa `(^\|_)(on_hand\|current_stock\|stock_level\|estoque_atual\|quantity_on_hand\|saldo_atual)` — exige **0** | 0009 | `:118-121` |
| 2 | 100 kg a R$ 4,72 depois 100 kg a R$ 5,90 ⇒ `average_rate` **0.531**, `last_rate` **0.590**, **2** linhas de histórico | 0002, 0009 | `:124-174` |
| 3 | Produto com receita e sem `yield_per_unit` é recusado; com 75 e 5 é aceito; `base_unit` sobrevive como `un` | 0002 (`manufactured_needs_recipe`), 0003 | `:176-200` |
| 4 | Empresa 1 vê **0** itens da empresa 2 e **3** próprios; estranho sem associação vê **0**; dono lê custo **0.472**, operador lê **null**; operador vê **4** movimentos | 0001, 0002, 0006, 0008 | `:202-284` |
| 4b | Associação `pending` vê **0** itens e **0** movimentos; depois de `state='active'`, vê **3** | 0011 | `:292-314` |
| 5 | Compra é gravada por quem tem `check_receipt`; contagem com quantidade **0** fica; produção com **0** é recusada; quem só tem `record_production` **não** grava compra; ninguém grava em nome de outro | 0007, 0008, 0001 | `:318-415` |
| 6 | A fila real do aparelho (gerada por `scripts/device-session.ts`) sobe **sob a política**, como a conta da empresa, sem uma recusa; a mesma fila por quem não é da empresa **para na primeira linha**; reenviada inteira não estraga nada; saldo e média fecham iguais nos dois lados | 0001–0011 inteiras, na forma | `:417-558` |

Duas cicatrizes de método registradas na própria checagem 6, e valem para quem
reconstruir:

- **Rodar a fila como superusuário provava nada.** "Um superusuário ignora row
  level security por completo, então as 45 escritas passavam sem que uma única
  política fosse avaliada: provava que as colunas batiam e absolutamente nada
  sobre o servidor aceitar a escrita" (`scripts/verify-migrations.sh:464-469`).
- **O papel que sobe a fila precisa de INSERT e UPDATE, e a mensagem do Postgres
  não diz qual falta.** `grant insert, update on items, locations, products,
  lots, purchases, purchase_lines, recipes, recipe_versions, recipe_lines, ... to
  app_user;` e, separado, `grant insert on movements, readings to app_user;` —
  "A exceção é movements, que sobe com DO NOTHING - o livro-razão não se corrige,
  se estorna. Faltando o UPDATE, o Postgres responde apenas 'permission denied',
  sem dizer qual dos dois falta" (`scripts/verify-migrations.sh:446-458`).

---

### 7.13 O que as migrações seguintes fazem com o que esta parte criou

Só o que toca objetos de 0001–0011, para o leitor não concluir que o esquema
desta parte é o esquema final. Detalhe completo na parte B.

| Migração | O que muda em objeto desta parte | Fonte |
|---|---|---|
| 0012 | `companies` ganha `names_who_recorded boolean not null default false` | `0012_who_or_where.sql:20-21` |
| 0013 | `movements` ganha `device_id uuid references devices(id) on delete restrict` + índice parcial `movements_device_idx` | `0013:63-67` |
| 0014 | `movements` ganha `operator_id uuid references memberships(id) on delete restrict` + índice parcial `movements_operator_idx` | `0014:20-26` |
| 0015 | `purchases` e `purchase_lines` ganham política de UPDATE (`view_finance`), para o reenvio da fila; `movements` **continua sem** política de UPDATE | `0015:29-35` |
| 0016 | `movements` ganha `movement_group_id uuid` + índice parcial `movements_group_idx` | `0016:27-30` |
| 0017 | `movement_moved_something` é trocada por `check (quantity_base_units <> 0 or kind = 'adjustment' or (kind = 'discrepancy' and post is not null))` | `0017:19-26` |
| 0018 | `products` ganha `line_id`, `type_id`, `flavor_id` (três novas tabelas de grade) | `0018:81-103` |
| 0019 | `locations` e `items` ganham `unique (id, company_id)`; `companies` ganha configuração de aprovação de pedido | `0019:36-39` |
| 0020 | `products` ganha `shelf_life_days`; `lots` ganha `lots_resend` (política de UPDATE que faltava desde a 0001) | `0020:20`, `:40-42` |
| 0021 | `locations` ganha `contact_phone`, `delivery_days smallint not null default 0`, `agreement_note`, e CHECK de dias da semana | `0021:15-21` |
| 0022 | `products` ganha `packaging_items jsonb not null default '[]'::jsonb` + CHECK de lista | `0022:23-28` |
| 0023 | `items` ganha `full_level numeric(14,4)` | `0023:15` |
| 0024 | `locations` ganha `sensor_ranges jsonb not null default '{}'::jsonb` + CHECK de objeto | `0024:57-59` |
| 0025 | novo gatilho `production_updates_cost` sobre `movements`, escrevendo `item_costs` para o que a produção faz — a metade que `apply_purchase_to_cost` não cobria | `0025:26-83` |
| 0026 | `lots` ganha `recipe_version_id uuid references recipe_versions(id)` + índice parcial | `0026:27-29` |
| 0028 | índice `movements_reversal_idx` (o que estava estornado) | `0028:29` |
| 0029 | `movements` ganha três FKs compostas contra a empresa: `movement_item_same_company (item_id, company_id)`, `movement_location_same_company (location_id, company_id)`, `movement_counterpart_same_company (counterpart_location_id, company_id)` — `lot_id` **continua chave simples** | `0029:29-46` |
| 0030 | `locations` ganha `locations_default_room` (insert) e `locations_default_room_resend` (update), restritas a `id = company_id` e a cinco capacidades de chão de fábrica | `0030:31-55` |

---

### 7.14 Tabela-resumo — todas as tabelas existentes ao fim da 0011

Quinze tabelas, nesta ordem de criação. "Colunas" conta o estado **ao fim da
0011**, já com as colunas que a 0003/0009/0010/0011 acrescentaram ou tiraram.

| # | Tabela | Migração | PK | Colunas | Unique | FKs de saída | Índices próprios | RLS |
|---|---|---|---|---|---|---|---|---|
| 1 | `companies` | 0001 | `id` | 9 (`id`, `name`, `language`, `currency`, `time_zone`, `modules`, `created_at`, `join_code`, `floor_sign_in`) | `join_code` | — | — | read por associação; update por `manage_company`; **sem insert** |
| 2 | `memberships` | 0001 | `id` | 9 (`id`, `company_id`, `user_id`, `display_name`, `capabilities`, `prefers_conversation`, `assistant_autonomy`, `created_at`, `state`) | `(company_id, user_id)` | `companies` cascade, `auth.users` cascade | `memberships_user_idx (user_id)` | read por associação; `for all` por `manage_company` |
| 3 | `locations` | 0001 | `id` | 9 | — | `companies` cascade | `locations_company_idx (company_id)` | read por associação; `for all` por `manage_company` |
| 4 | `items` | 0001 | `id` | 10 (com `base_unit` da 0003) | — | `companies` cascade | `items_company_idx (company_id, kind) where active` | read por associação; `for all` por `manage_company` |
| 5 | `lots` | 0001 | `id` | 7 | `(company_id, code)` | `companies` cascade, `items` restrict | `lots_expiry_idx (company_id, expires_on) where expires_on is not null` | read por associação; insert por `record_production` |
| 6 | `movements` | 0001 | `id` (sem default) | 18 (com `unit_cost_rate`/`unit_price_rate` da 0008) | — | `companies` cascade, `auth.users`, `items` restrict, `locations` restrict ×2, `lots` restrict, `movements` (auto) | `movements_balance_idx`, `movements_lot_idx` (parcial), `movements_assistant_idx` (parcial) | read por associação; insert por capacidade-por-tipo; **UPDATE/DELETE bloqueados por gatilho** |
| 7 | `suppliers` | 0002 | `id` | 6 | — | `companies` cascade | `suppliers_company_idx (company_id)` | read por associação; `for all` por `manage_company` |
| 8 | `purchases` | 0002 | `id` | 10 (com `supplier_name` da 0010) | — | `companies` cascade, `suppliers` restrict, `auth.users` | — | read por `view_cost`; insert por `view_finance` |
| 9 | `purchase_lines` | 0002 | `id` | 8 | — | `companies` cascade, `purchases` cascade, `items` restrict | `purchase_lines_item_idx (company_id, item_id)` | read por `view_cost`; insert por `view_finance` |
| 10 | `item_costs` | 0002 | `(company_id, item_id)` | 5 (`on_hand_base_units` removida na 0009) | PK | `companies` cascade, `items` cascade | — | read por `view_cost`; **sem política de escrita** (só gatilho `SECURITY DEFINER`) |
| 11 | `item_cost_history` | 0002 | `id` | 7 | — | `companies` cascade, `items` cascade, `purchase_lines` set null | `item_cost_history_idx (company_id, item_id, observed_at desc)` | read por `view_cost`; **sem política de escrita** |
| 12 | `recipes` | 0002 | `id` | 7 | — | `companies` cascade | `recipes_company_idx (company_id) where active` | read por associação; `for all` por `manage_company` |
| 13 | `recipe_versions` | 0002 | `id` | 8 | `(recipe_id, version)` | `companies` cascade, `recipes` cascade | — | read por associação; `for all` por `manage_company` |
| 14 | `recipe_lines` | 0002 | `id` | 7 (com `position` da 0010) | — | `companies` cascade, `recipe_versions` cascade, `items` restrict, `recipes` restrict | `recipe_lines_version_idx`, `recipe_lines_order_idx (recipe_version_id, position)` | read por associação; `for all` por `manage_company` |
| 15 | `products` | 0002 | `id` | 7 | `(company_id, item_id)` | `companies` cascade, `items` cascade, `recipes` restrict | `products_company_idx (company_id) where active` | read por associação; `for all` por `manage_company` |

Views: **2** — `stock_balances` e `movements_visible`, ambas com
`security_invoker = true` ao fim da 0011.

Schemas criados: **1** — `private` (0006).

---

### 7.15 Resumo dos enums ao fim da 0011

| Enum | Migração | Valores (na ordem) | Usado em |
|---|---|---|---|
| `capability` | 0001:42-55 | `view_cost`, `view_sale_price`, `record_production`, `dispatch`, `check_receipt`, `record_loss`, `place_order`, `approve_order`, `adjust_stock`, `view_finance`, `issue_invoice`, `manage_company` | `memberships.capabilities`, `private.has_capability` |
| `location_kind` | 0001:109 | `factory`, `cold_room`, `store_room`, `own_store`, `customer`, `vehicle` | `locations.kind` |
| `item_kind` | 0001:133 | `input`, `packaging`, `product`, `resale`, `store_supply` | `items.kind` |
| `movement_kind` | 0001:172-175 + 0007:16 | `production`, `consumption`, `transfer`, `sale`, `loss`, `return`, `adjustment`, `discrepancy`, `reversal`, `purchase` | `movements.kind` |
| `loss_reason` | 0001:177 | `melted`, `broken`, `expired`, `courtesy`, `internal_use` | `movements.loss_reason` |
| `control_post` | 0001:179 | `picked`, `loaded`, `delivered`, `checked` | `movements.post` |
| `membership_state` | 0011:11 | `pending`, `active`, `revoked` | `memberships.state` |
| `floor_sign_in` | 0011:65 | `personal`, `shared` | `companies.floor_sign_in` |

Nota de grafia que já custou uma rodada e ficou registrada no teste de acordo: o
aparelho dizia `internalUse` e o servidor diz `internal_use`; nenhuma perda tinha
sido escrita até então, então nada quebrava (`src/sync/agreement.test.ts:207-214`).

---

### 7.16 Resumo de funções, gatilhos e views ao fim da 0011

| Objeto | Tipo | Schema final | Assinatura | `SECURITY DEFINER`? | `search_path` | O que faz | Fonte |
|---|---|---|---|---|---|---|---|
| `current_companies()` | função | `private` (movida na 0006) | `() returns setof uuid`, `language sql`, `stable` | sim | `public` | devolve `company_id` das associações **ativas** de `auth.uid()` | 0001:80-88 → 0006:33 → 0011:22-31 |
| `has_capability(uuid, capability)` | função | `private` | `(target_company uuid, needed capability) returns boolean`, `sql`, `stable` | sim | `public` | `exists` de associação ativa daquela empresa com a capacidade no array | 0001:90-103 → 0006:34 → 0011:33-47 |
| `reject_ledger_mutation()` | função de gatilho | `public` | `() returns trigger`, `plpgsql` | não | `''` (0004) | `raise exception` com a frase do livro-razão append-only | 0001:234-243 → 0004:31-41 |
| `movements_are_immutable` | gatilho | — | `before update or delete on movements for each row` | — | — | chama `reject_ledger_mutation()` | 0001:245-247 |
| `apply_purchase_to_cost()` | função de gatilho | `public` | `() returns trigger`, `plpgsql` | sim | `public` | média móvel ponderada + histórico, lendo o saldo do livro-razão | 0002:224-269 → 0009:22-73 |
| `purchase_moves_cost` | gatilho | — | `after insert on purchase_lines for each row` | — | — | chama `apply_purchase_to_cost()` | 0002:271-273 |
| `stock_balances` | view | `public` | — | `security_invoker = true` (0004) | — | `sum(quantity_base_units) group by company_id, item_id, location_id` | 0001:253-260 → 0004:28 |
| `movements_visible` | view | `public` | — | `security_invoker = true` | — | todas as colunas de `movements` + custo e preço embrulhados em `case has_capability(...)` | 0001:329-339 → 0008:82-92 |

Grants e revokes acumulados ao fim da 0011:

| Objeto | `public` | `anon` | `authenticated` | Fonte |
|---|---|---|---|---|
| `apply_purchase_to_cost()` | revoke execute | revoke execute | revoke execute | 0004:47-56 |
| `current_companies()` | revoke execute (0005) | revoke execute | grant execute | 0004:51,57 · 0005:20,26 |
| `has_capability(uuid, capability)` | revoke execute (0005) | revoke execute | grant execute | 0004:52,58 · 0005:21,27 |
| schema `private` | — | — | `grant usage` | 0006:42 |

Nenhum `GRANT` de **tabela** aparece em nenhuma das onze migrações.

---

### 7.17 Estado de chamada, objeto por objeto (ao fim da 0011)

| Objeto | Estado |
|---|---|
| `movements` (insert, política, gatilho de imutabilidade) | **Exercido contra Postgres** (checagens 1, 4, 5, 6) e **alvo da fila** (`src/sync/serialize.ts:317-367`) |
| `stock_balances` | **Exercido** (checagem 1, `:106`); nenhuma tela a consulta — o aparelho refaz a soma localmente (`src/data/repository.ts:524`) |
| `movements_visible` | **Exercido** (checagem 4, `:275-284`, `:304`); sem chamador de tela |
| `items`, `locations`, `lots`, `recipes`, `recipe_versions`, `recipe_lines`, `products`, `purchases`, `purchase_lines` | **Alvo da fila** e exercidos na checagem 6 |
| `item_costs`, `item_cost_history` | **Escritos só por gatilho.** Deliberadamente **não** sincronizados (`src/sync/serialize.ts:44-58`); a média do servidor é comparada com a do aparelho na checagem 6 |
| `memberships`, `companies` | **Sem travessia.** Escritos à mão pela `db:verify`; sem caminho de criação pelo cliente (sem política de insert em `companies`) |
| `suppliers` | **Sem chamador nenhum.** Nem fila, nem checagem |
| `purchase_lines.expected_base_units` | **Sem escritor.** Coluna e comentário existem; nada a preenche |
| `suppliers.promised_lead_days` | **Sem escritor.** O "valor observado" que o comentário promete **NÃO ESTÁ IMPLEMENTADO** |
| `movements.assistant_phrase` + `movements_assistant_idx` | Coluna **escrita** no aparelho pelas habilidades do assistente (`src/assistant/skills.ts:377`, `:599`, `:886`, `:963`) e **atravessa** (`src/sync/serialize.ts:353`). Nenhuma consulta lê o índice |
| `movements.post` | **Atravessa** (`src/sync/serialize.ts:332`); os quatro postos de controle são trabalho da F3 |
| `movements.counterpart_location_id` | **Atravessa** (`:347`) |
| `companies.modules` | **Sem leitor.** Nenhum arquivo do aplicativo consulta o jsonb de módulos |
| `companies.join_code` | **Sem chamador.** Única ocorrência no repositório é a linha que a cria |
| `companies.floor_sign_in` + enum | **Sem chamador.** Únicas ocorrências são as duas linhas da 0011 |
| `memberships.state` + enum `membership_state` | **Exercido** na checagem 4b (`scripts/verify-migrations.sh:292-314`); nenhuma tela ou fila o escreve |
| `memberships.prefers_conversation` | **Sem leitor no servidor**; o modo conversa vive no aparelho |
| `memberships.assistant_autonomy` | **Sem leitor.** E `check_assistant_floor()`, citada no comentário, **NÃO EXISTE** |
| `capability.issue_invoice` | **Valor de enum sem uso.** Nenhuma política o nomeia |
| `capability.place_order` / `approve_order` | Sem uso **nesta parte**; passam a valer na 0019 |
| `locations.capacity_crates`, `address_code`, `latitude`, `longitude` | **Sem escritor.** Não atravessam a fila |
| `products.unit_packaging_cents` | **Atravessa** (`src/sync/serialize.ts:242`) |
| `recipe_versions.loss_fraction` | **Atravessa** (`:196`) |

---

### 7.18 O que esta parte deixa em aberto, dito como lacuna e não como plano

1. **Como uma empresa nasce.** Não há política de INSERT em `companies` nem RPC
   de cadastro em nenhuma das 32 migrações. A decisão de produto existe
   (`docs/roadmap.md:358`); o caminho no servidor **NÃO ESTÁ IMPLEMENTADO**.
2. **Como a primeira associação nasce.** `memberships_manage` exige
   `manage_company` na empresa que ainda não tem membro. Mesma lacuna.
3. **Como o código de entrada é resgatado.** `join_code` + `state = 'pending'`
   são as duas peças; **falta a que as liga** — nenhuma função, política ou tela.
4. **Como privilégios de tabela chegam a `authenticated`.** Nenhum `GRANT` de
   tabela nas migrações; a `db:verify` os concede à mão para poder testar. Em
   produção, **NÃO ESTÁ NO CÓDIGO**.
5. **`check_assistant_floor()`**, prometida no comentário de
   `memberships.assistant_autonomy`, não existe. O piso está no aparelho
   (`src/domain/access.ts:135-146`).
6. **O saldo não filtra por local em nenhuma consulta do produto.** A view
   `stock_balances` agrupa por `location_id` desde a 0001, mas o aparelho soma
   `WHERE company_id = ? AND item_id = ?` e cria uma única `location` cujo id é o
   `company_id` (`docs/insights.md:980-985`; `CLAUDE.md`, seção da F7). A 0030 é a
   migração que reconhece esse "quarto padrão" como escrituração e não privilégio
   (`0030:20-30`).
7. **Ciclo de receita** não é impedido pelo banco, por decisão escrita
   (`0002_recipes.sql:148-151`) — quem impede é `src/domain/recipe.ts`, com
   `RecipeCycleError`.
8. **`movements.lot_id` continua chave estrangeira simples**, sem a composta com
   `company_id` que a 0029 deu às outras três — e isso está escrito lá para não
   ser redescoberto (`0029:26-27`).
