## 10. O banco do aparelho: SQLite, migrações V1..V17, fila de saída

### 10.1 O que este banco é, e as duas diferenças deliberadas em relação ao servidor

O banco local é um espelho do esquema do servidor, não uma segunda forma inventada, porque a sincronização é uma repetição append-only das mesmas linhas: um movimento escrito numa câmara fria sem sinal tem de ser o mesmo registro que o servidor vai aceitar quando o celular achar uma torre (`src/data/db.ts:2-8`).

Duas diferenças em relação a `supabase/migrations/` são deliberadas e estão escritas no topo do arquivo (`src/data/db.ts:9-14`):

1. **Não há RLS.** O aparelho já guarda os dados de exatamente um usuário, e o servidor é a fronteira que importa.
2. **Taxas são `REAL`, valores são `INTEGER` de centavos**, mantendo a mesma separação que o domínio impõe — preço por grama não é dinheiro e não pode ser arredondado.

O arquivo aberto no aparelho é `norva.db`, via `expo-sqlite` (`src/data/db.ts:722`).

#### PRAGMAS — aplicados na abertura, nunca dentro de transação

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```

(`src/data/db.ts:24-27`.) O motivo de `foreign_keys` morar aqui e não numa migração está escrito: o SQLite **ignora** o pragma enquanto uma transação está aberta, e toda migração roda dentro de uma. Um pragma ignorado em silêncio deixaria as referências sem imposição, que é exatamente a proteção de que a ordem de apagar depende (`src/data/db.ts:16-23`).

Os PRAGMAS são executados em `openAndMigrate`, antes de `migrate` (`src/data/db.ts:752-753`). Eles **não** são aplicados por `migrate` em si — logo, um teste que injeta uma conexão pronta via `__setDb` não passa por eles; nos testes a imposição de chave estrangeira vem do padrão do `node:sqlite` (`src/data/db.test.ts:19`, `src/data/schema.test.ts:37`, `src/sync/sync.test.ts:20`).

---

### 10.2 A lista `MIGRATIONS` — V1 a V17, transcrita

`MIGRATIONS` é a lista literal, na ordem, e é a única forma de as tabelas mudarem; o próprio `PRAGMA user_version` do SQLite registra até onde um determinado celular chegou (`src/data/db.ts:676-678`, com a razão
escrita em `:160-172`).

```ts
const MIGRATIONS: readonly string[] = [
  V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16, V17,
];
```

(`src/data/db.ts:676-678`.) São **17 passos**; `schemaVersion = MIGRATIONS.length` (`src/data/db.ts:822`).

A regra escrita no arquivo: **nunca editar um passo que já subiu.** Um celular que já rodou aquele passo não o roda de novo, então a edição alcança apenas instalações novas, e as duas divergem em silêncio — o mesmo motivo pelo qual as migrações SQL do servidor são append-only (`src/data/db.ts:168-171`).

#### V1 — o cadastro, o meta e a fila (`src/data/db.ts:29-158`)

Cria onze tabelas e três índices.

**`items`** (`src/data/db.ts:30-44`)

| coluna | tipo | restrições / padrão | nota do código |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | |
| `company_id` | TEXT | NOT NULL | multi-empresa desde a primeira linha |
| `kind` | TEXT | NOT NULL | valores do app: `input`, `packaging`, `product`, `resale`, `store_supply` (`src/data/repository.ts:32`) |
| `name` | TEXT | NOT NULL | |
| `purchase_unit` | TEXT | nulo | "o que o comprador tem na mão: um saco de 25kg, um balde de 10kg" (`src/data/db.ts:35`) |
| `purchase_to_base` | REAL | nulo | quantas unidades-base cabem em uma unidade de compra; "sem isto o custo fica calado e errado" (`src/data/db.ts:36-38`) |
| `base_unit` | TEXT | NOT NULL DEFAULT `'g'` | |
| `packaging` | TEXT | NOT NULL DEFAULT `'[{"id":"unit","perBaseUnit":1}]'` | JSON como texto — o SQLite não tem coluna JSON |
| `active` | INTEGER | NOT NULL DEFAULT 1 | 0/1; o servidor é booleano |
| `created_at` | TEXT | NOT NULL | ISO-8601 |

**`item_costs`** (`src/data/db.ts:46-54`)

| coluna | tipo | restrições |
|---|---|---|
| `item_id` | TEXT | PRIMARY KEY REFERENCES `items(id)` ON DELETE CASCADE |
| `company_id` | TEXT | NOT NULL |
| `average_rate` | REAL | NOT NULL DEFAULT 0 — "centavos fracionários por unidade-base. Nunca arredondado" (`src/data/db.ts:49-50`) |
| `last_rate` | REAL | nulo |
| `on_hand_base_units` | INTEGER | NOT NULL DEFAULT 0 — **removida na V3** |
| `updated_at` | TEXT | NOT NULL |

**`item_cost_history`** (`src/data/db.ts:56-63`): `id` TEXT PK · `company_id` TEXT NOT NULL · `item_id` TEXT NOT NULL REFERENCES `items(id)` ON DELETE CASCADE · `previous_rate` REAL nulo · `new_rate` REAL NOT NULL · `observed_at` TEXT NOT NULL.

**`recipes`** (`src/data/db.ts:65-73`): `id` TEXT PK · `company_id` TEXT NOT NULL · `name` TEXT NOT NULL · `yield_amount` REAL NOT NULL · `yield_unit` TEXT NOT NULL DEFAULT `'ml'` · `active` INTEGER NOT NULL DEFAULT 1 · `created_at` TEXT NOT NULL.

**`recipe_versions`** (`src/data/db.ts:75-85`): `id` TEXT PK · `company_id` TEXT NOT NULL · `recipe_id` TEXT NOT NULL REFERENCES `recipes(id)` ON DELETE CASCADE · `version` INTEGER NOT NULL · `effective_from` TEXT NOT NULL · `loss_fraction` REAL NOT NULL DEFAULT 0 · `note` TEXT · `created_at` TEXT NOT NULL · **UNIQUE (`recipe_id`, `version`)**.

**`recipe_lines`** (`src/data/db.ts:87-96`): `id` TEXT PK · `company_id` TEXT NOT NULL · `recipe_version_id` TEXT NOT NULL REFERENCES `recipe_versions(id)` ON DELETE CASCADE · `item_id` TEXT REFERENCES `items(id)` ON DELETE RESTRICT · `sub_recipe_id` TEXT REFERENCES `recipes(id)` ON DELETE RESTRICT · `quantity` REAL NOT NULL · `position` INTEGER NOT NULL DEFAULT 0 · **CHECK ((`item_id` IS NULL) <> (`sub_recipe_id` IS NULL))** — exatamente um dos dois.

**`products`** (`src/data/db.ts:98-106`): `id` TEXT PK · `company_id` TEXT NOT NULL · `item_id` TEXT NOT NULL REFERENCES `items(id)` ON DELETE CASCADE · `recipe_id` TEXT REFERENCES `recipes(id)` ON DELETE RESTRICT · `yield_per_unit` REAL nulo · `unit_packaging_cents` INTEGER NOT NULL DEFAULT 0 · `active` INTEGER NOT NULL DEFAULT 1.

**`purchases`** (`src/data/db.ts:108-115`): `id` TEXT PK · `company_id` TEXT NOT NULL · `supplier_name` TEXT nulo · `ordered_at` TEXT nulo · `received_at` TEXT nulo · `created_at` TEXT NOT NULL.

**`purchase_lines`** (`src/data/db.ts:117-126`): `id` TEXT PK · `company_id` TEXT NOT NULL · `purchase_id` TEXT NOT NULL REFERENCES `purchases(id)` ON DELETE CASCADE · `item_id` TEXT NOT NULL REFERENCES `items(id)` ON DELETE RESTRICT · `purchase_quantity` REAL NOT NULL · `base_units` INTEGER NOT NULL · `total_cents` INTEGER NOT NULL · `created_at` TEXT NOT NULL.

**`app_meta`** (`src/data/db.ts:136-139`): `key` TEXT PRIMARY KEY · `value` TEXT NOT NULL. O motivo declarado de existir é específico: **os dados de exemplo precisam saber que já rodaram.** Semear com base em "a tabela de itens está vazia" devolveria a demonstração na manhã seguinte a alguém ter apagado de propósito, "e um aplicativo que desfaz suas exclusões é um em que ninguém confia para mais nada" (`src/data/db.ts:128-135`).

**`outbox`** (`src/data/db.ts:146-153`): `id` TEXT PK · `table_name` TEXT NOT NULL · `row_id` TEXT NOT NULL · `payload` TEXT NOT NULL · `queued_at` TEXT NOT NULL · `sent_at` TEXT nulo. "A linha carrega o próprio id, então repetir a fila duas vezes não muda nada — que é o que torna uma conexão instável inofensiva em vez de perigosa" (`src/data/db.ts:141-145`).

**Índices da V1** (`src/data/db.ts:155-157`):

```sql
CREATE INDEX IF NOT EXISTS items_kind_idx ON items (company_id, kind) WHERE active = 1;
CREATE INDEX IF NOT EXISTS recipe_lines_version_idx ON recipe_lines (recipe_version_id);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (queued_at) WHERE sent_at IS NULL;
```

#### V2 — o verbo na fila (`src/data/db.ts:181-183`)

```sql
ALTER TABLE outbox ADD COLUMN op TEXT NOT NULL DEFAULT 'upsert';
```

Motivo escrito: a primeira versão da fila só sabia dizer "esta linha mudou", o que basta para criar e atualizar e é inútil para excluir — não sobra nada no aparelho para enviar. Carregar o verbo faz a fila descrever tudo o que o app realmente faz (`src/data/db.ts:173-180`).

#### V3 — o livro-razão chega ao aparelho (`src/data/db.ts:216-280`)

Este é o passo com a cicatriz mais longa documentada no arquivo (`src/data/db.ts:185-215`): o esquema do servidor honrava a fundação "não existe coluna `estoque_atual`"; **este banco não**. Ele carregava `item_costs.on_hand_base_units`, um inteiro atualizado no lugar por cada compra — "precisamente a coluna que a fundação proíbe, vestindo um nome mais comprido". A aritmética estava certa; o errado era o número não ter histórico, então nunca poderia ser auditado, corrigido por estorno, ou repetido depois de uma sincronização.

Cria:

**`locations`** (`src/data/db.ts:217-223`): `id` TEXT PK · `company_id` TEXT NOT NULL · `name` TEXT NOT NULL · `kind` TEXT NOT NULL DEFAULT `'store_room'` · `created_at` TEXT NOT NULL.

**`movements`** (`src/data/db.ts:225-249`):

| coluna | tipo | restrições | nota transcrita |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | |
| `company_id` | TEXT | NOT NULL | |
| `kind` | TEXT | NOT NULL | valores que o domínio conhece: `purchase`, `production`, `consumption`, `transfer`, `sale`, `loss`, `return`, `adjustment`, `discrepancy`, `reversal` (`src/domain/ledger.ts:19-29`) |
| `occurred_at` | TEXT | NOT NULL | "quando aconteceu no mundo, não quando chegou ao servidor" (`src/data/db.ts:229`) |
| `recorded_at` | TEXT | NOT NULL | |
| `item_id` | TEXT | NOT NULL REFERENCES `items(id)` ON DELETE CASCADE | |
| `quantity_base_units` | INTEGER | NOT NULL | "com sinal, sempre na menor unidade: positivo chega, negativo sai" (`src/data/db.ts:233`) |
| `location_id` | TEXT | NOT NULL REFERENCES `locations(id)` ON DELETE RESTRICT | |
| `lot_id` | TEXT | nulo, **sem chave estrangeira** | ver V11 |
| `loss_reason` | TEXT | nulo | valores: `melted`, `broken`, `expired`, `courtesy`, `internal_use` (`src/domain/ledger.ts:46`) |
| `unit_cost_rate` | REAL | nulo | "centavos fracionários por unidade-base, congelados neste instante. Uma mudança de preço do açúcar em março não pode reescrever o que janeiro custou. Uma taxa, nunca dinheiro, então nunca é arredondada" (`src/data/db.ts:238-240`) |
| `reverses_movement_id` | TEXT | REFERENCES `movements(id)` **DEFERRABLE INITIALLY DEFERRED** | "adiada de propósito. RESTRICT dispara linha por linha, então limpar a tabela tropeçaria nas próprias linhas: o estorno ainda está lá quando o movimento que ele cancela vai. Conferida no commit, o par sai junto ou o apagar inteiro volta atrás" (`src/data/db.ts:242-245`) |
| `assistant_phrase` | TEXT | nulo | |
| `note` | TEXT | nulo | |

Índice: `movements_balance_idx ON movements (company_id, item_id, location_id, occurred_at)` (`src/data/db.ts:251-252`).

**Semeadura do lugar padrão** (`src/data/db.ts:262-264`):

```sql
INSERT OR IGNORE INTO locations (id, company_id, name, kind, created_at)
SELECT company_id, company_id, '', 'store_room', MIN(created_at)
  FROM items GROUP BY company_id;
```

O id do lugar padrão **é o próprio `company_id`**: determinístico, para que dois celulares criando o padrão no mesmo instante criem a mesma linha em vez de duas (`src/data/db.ts:255-257`). E o nome fica **vazio de propósito** em vez de escrito em português: o app põe toda palavra que uma pessoa lê no dicionário, e um padrão que sobe num idioma seria a única string que escapou. "Um lugar sem nome quer dizer 'o único lugar', e é a interface que o nomeia" (`src/data/db.ts:258-261`).

**Backfill do razão a partir das notas** (`src/data/db.ts:266-277`):

```sql
INSERT OR IGNORE INTO movements
  (id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units,
   location_id, unit_cost_rate)
SELECT l.id, l.company_id, 'purchase', l.created_at, l.created_at, l.item_id, l.base_units,
       l.company_id,
       CASE WHEN l.base_units > 0
            THEN CAST(l.total_cents AS REAL) / l.base_units
       END
  FROM purchase_lines l;
```

Três decisões dentro desse SELECT:

- **O movimento de compra herda o id da linha de nota.** "São um fato visto duas vezes, então compartilhar o id torna o elo gratuito e torna uma repetição idempotente sem uma coluna para guardá-lo" (`src/data/db.ts:212-215`). É isso que faz `INSERT OR IGNORE` ser suficiente: rodar o passo duas vezes não dobra saldo (`src/data/db.ts:198-200`).
- **A taxa é `total_cents / base_units` em REAL**, a mesma aritmética de `rateFromCents`: os dois lados já estão na menor unidade, então nada é convertido e nada é arredondado (`src/data/db.ts:271-273`).
- **Os nomes de coluna são os do servidor**, até `quantity_base_units`, porque a primeira promessa do arquivo é espelhar em vez de inventar. O primeiro rascunho inventou nomes mais curtos e uma coluna extra, o que "se lê como mais arrumado e teria significado uma camada de tradução entre dois esquemas que precisam ficar idênticos para uma fila offline poder ser repetida" (`src/data/db.ts:205-211`).

**E só então a coluna sai** (`src/data/db.ts:279`):

```sql
ALTER TABLE item_costs DROP COLUMN on_hand_base_units;
```

"Deixá-la deixaria a armadilha — um número tentador, de aparência barata, sentado a um autocompletar de distância do correto" (`src/data/db.ts:202-204`).

#### V4 — `recorded_by` no aparelho (`src/data/db.ts:302-304`)

```sql
ALTER TABLE movements ADD COLUMN recorded_by TEXT;
```

Razão da época: o `recorded_by` do servidor era carimbado pelo serializador com o usuário da sincronização, "e isso é uma mentira num aparelho compartilhado: o celular da câmara fria passa de mão, e quem sincroniza à noite pode não ser quem registrou de manhã. O livro-razão responderia 'quem' com o nome errado, que é pior do que não responder" (`src/data/db.ts:283-300`).

#### V5 — a correção: são duas perguntas, não uma (`src/data/db.ts:321-324`)

```sql
ALTER TABLE movements ADD COLUMN operator_id TEXT;
ALTER TABLE movements DROP COLUMN recorded_by;
```

"A V4 tentou fazer uma coluna responder as duas e estava errada." O login autentica **o sistema**: a conta é da empresa. Então a conta que escreve é uma coisa — e o servidor impõe `recorded_by = auth.uid()` — e quem estava com o aparelho na hora é outra, anotada no momento do registro. `recorded_by` sai do aparelho porque ali ele nunca teve valor próprio: é sempre a conta que sincroniza, e o serializador já sabe qual é (`src/data/db.ts:306-320`).

#### V6 — as colunas de um ato de mais de uma linha (`src/data/db.ts:343-346`)

```sql
ALTER TABLE movements ADD COLUMN movement_group_id TEXT;
ALTER TABLE movements ADD COLUMN counterpart_location_id TEXT REFERENCES locations(id);
```

`movement_group_id` amarra as sete linhas de uma corrida de produção e as duas pernas de uma transferência; sem ela, o estorno de uma corrida inteira não se diz atômico e "explique este número" vira arqueologia por horário. `counterpart_location_id` existe no servidor desde a `0001` e nunca existiu aqui: a transferência escreve duas linhas — saída e entrada — e cada uma precisa dizer para onde foi a outra metade. Ambas são nulas nas linhas antigas, porque compra e contagem são atos de uma linha só (`src/data/db.ts:326-342`).

#### V7 — o posto de controle e o índice de grupo (`src/data/db.ts:365-371`)

```sql
ALTER TABLE movements ADD COLUMN post TEXT;

CREATE INDEX IF NOT EXISTS movements_group_idx
  ON movements (company_id, movement_group_id)
  WHERE movement_group_id IS NOT NULL;
```

Valores de `post`: `picked`, `loaded`, `delivered`, `checked` (`src/domain/ledger.ts:53`). A coluna entra **agora** e não antes porque a conferência de chegada é o primeiro dos quatro postos a ganhar tela — "coluna sem escritor é a doença que este repositório já documentou". Nula nas linhas antigas, e `ADD COLUMN` sem `NOT NULL` e sem `DEFAULT` não reescreve uma linha sequer. O índice de grupo vem junto porque a V6 acrescentou `movement_group_id` e ficou sem índice, e é por essa coluna que a conferência acha a remessa (`src/data/db.ts:348-364`).

#### V8 — `production_runs`, a primeira tabela que NÃO espelha o servidor (`src/data/db.ts:393-403`)

```sql
CREATE TABLE IF NOT EXISTS production_runs (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  product_id        TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recipe_version_id TEXT NOT NULL,
  batches           REAL NOT NULL,
  location_id       TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  opened_at         TEXT NOT NULL
);
```

A razão está escrita porque a promessa do arquivo é a contrária: "uma corrida aberta não é fato do negócio, é a INTENÇÃO de um ato em curso". O servidor recebe o ato quando ele acontece — as N+1 linhas que o fechamento escreve, com o id da corrida como `movement_group_id`. Se um dia o dono quiser ver o tacho de casa, isso vira uma entrada em `CROSSINGS`; hoje seria sincronizar rascunho. Ela guarda apenas o que está **aberto**: fechar e cancelar apagam a linha (`src/data/db.ts:373-392`, e as exclusões em `src/data/repository.ts:2351` e `src/data/repository.ts:2401`).

Estado: **implementada e chamada por tela** — `openProductionRun` e `openProductionRuns` (`src/data/repository.ts:2260`, `src/data/repository.ts:2308`) são importados por `app/production/new.tsx:16-17`. **Deliberadamente fora da fila**: não está em `QUEUED_TABLES` nem em `CROSSINGS`, e `src/sync/serialize.test.ts:134-139` usa justamente `production_runs` como o exemplo de tabela que `serialize` recusa com `UnknownTableError`.

#### V9 — a grade: linha, tipo, sabor (`src/data/db.ts:405-446`)

Três tabelas, todas com a mesma forma:

**`product_lines`**: `id` TEXT PK · `company_id` TEXT NOT NULL · `name` TEXT NOT NULL · `sort` INTEGER NOT NULL DEFAULT 0 · `active` INTEGER NOT NULL DEFAULT 1.
**`product_types`**: idem, mais `line_id` TEXT NOT NULL REFERENCES `product_lines(id)` ON DELETE CASCADE.
**`flavors`**: `id`, `company_id`, `name`, `sort`, `active`.

Índices únicos por nome normalizado (`lower(trim(name))`):

```sql
CREATE UNIQUE INDEX product_lines_name_idx ON product_lines (company_id, lower(trim(name)));
CREATE UNIQUE INDEX product_types_name_idx ON product_types (company_id, line_id, lower(trim(name)));
CREATE UNIQUE INDEX flavors_name_idx      ON flavors      (company_id, lower(trim(name)));
```

E três colunas novas em `products`, todas RESTRICT:

```sql
ALTER TABLE products ADD COLUMN line_id   TEXT REFERENCES product_lines(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN type_id   TEXT REFERENCES product_types(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN flavor_id TEXT REFERENCES flavors(id)       ON DELETE RESTRICT;
```

Mais dois índices (`src/data/db.ts:442-445`):

```sql
CREATE UNIQUE INDEX products_grid_idx
  ON products (company_id, coalesce(line_id, ''), coalesce(type_id, ''), coalesce(flavor_id, ''))
  WHERE active = 1;
CREATE INDEX products_flavor_idx ON products (company_id, flavor_id);
```

O `coalesce(..., '')` é o que faz a unicidade valer também quando uma das três dimensões é nula — sem ele, `NULL` distinto de `NULL` deixaria duplicatas passarem.

#### V10 — pedido é demanda, e demanda não é livro-razão (`src/data/db.ts:457-481`)

```sql
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  place_id      TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('pending', 'open', 'delivered', 'cancelled')),
  requested_for TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL,
  decided_at    TEXT
);

CREATE TABLE IF NOT EXISTS order_lines (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  base_units INTEGER NOT NULL CHECK (base_units > 0)
);

CREATE INDEX orders_open_idx ON orders (company_id, status, requested_for);
CREATE UNIQUE INDEX order_lines_once_idx ON order_lines (order_id, item_id);
CREATE INDEX order_lines_item_idx ON order_lines (company_id, item_id);
```

Os quatro estados de um pedido são exatamente `pending`, `open`, `delivered`, `cancelled`, impostos por CHECK, com padrão `'open'`. A razão de pedido não ser movimento: "nada se move quando um cliente liga… Gravar pedido como movimento faria o saldo mentir no dia da ligação — e como o livro-razão é append-only, corrigir um pedido que mudou pediria estornar uma saída que nunca houve. O elo com o livro-razão é a carga que sai, mais tarde" (`src/data/db.ts:448-456`).

#### V11 — o lote e a validade (`src/data/db.ts:499-516`)

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

CREATE UNIQUE INDEX lots_code_idx  ON lots (company_id, code);
CREATE INDEX        lots_expiry_idx ON lots (company_id, expires_on) WHERE expires_on IS NOT NULL;
CREATE INDEX        lots_item_idx   ON lots (company_id, item_id);

ALTER TABLE products ADD COLUMN shelf_life_days INTEGER;
```

`movements.lot_id` existe desde a V3 e a tabela para onde ele aponta **não existia**; a dívida estava nomeada em `docs/insights.md` como "hoje é sempre nulo e nulo passa na chave estrangeira, então a fila não trava; trava no dia em que a Fase 2 gravar o primeiro lote". E fica registrado que **`movements.lot_id` continua sem chave estrangeira no aparelho, e não por descuido — o SQLite não acrescenta FK a coluna que já existe.** Quem recusa lote fantasma é o servidor, e a `db:verify` reproduz a fila contra ele para que essa diferença não passe despercebida (`src/data/db.ts:483-498`).

#### V12 — a ficha de acordo da loja (`src/data/db.ts:526-530`)

```sql
ALTER TABLE locations ADD COLUMN contact_phone  TEXT;
ALTER TABLE locations ADD COLUMN delivery_days  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN agreement_note TEXT;
```

`delivery_days` é **bitmask com o bit 0 no domingo**, e não uma lista de texto: "um inteiro atravessa a fila do aparelho e o Postgres sem nenhuma conversão que possa divergir entre os dois lados. Zero significa 'não combinamos dia' — diferente de 'nenhum dia'" (`src/data/db.ts:518-525`). A faixa válida é 0..127, recusada no repositório antes de enfileirar (`src/data/repository.ts:653-654`).

#### V13 — o palito sai do estoque (`src/data/db.ts:559-561`)

```sql
ALTER TABLE products ADD COLUMN packaging_items TEXT NOT NULL DEFAULT '[]';
```

Quatro decisões registradas no docblock (`src/data/db.ts:532-558`):

- **A quantidade é por unidade produzida**, e é isso que a torna coisa nova em vez de mais uma linha de receita: "o tacho se espalha pelas unidades que saíram (meio tacho rende metade), mas um palito é um palito tenha a corrida rendido 400 ou 500. Como linha de receita, o consumo de palito encolheria junto com o rendimento — e um palito e meio não existe."
- **Lista na própria linha, não tabela à parte**, pelo mesmo motivo de `items.packaging`: curta, reescrita inteira, sem histórico próprio. "Tabela à parte exigiria enfileirar exclusão, e o motor de sincronia deste app só sabe enviar linha (`upsert`)."
- **`unit_packaging_cents` continua e não é duplicidade**: passa a ser o que NÃO está listado. Quem não quer contar palito no estoque digita o valor; quem quer, lista os itens. Os dois caminhos existem.

#### V14 — o nível cheio (`src/data/db.ts:576-578`)

```sql
ALTER TABLE items ADD COLUMN full_level REAL;
```

As faixas de volume (vermelho, amarelo, verde, azul) são porcentagem **de alguma coisa**, e essa coisa não pode ser inventada: "sem uma referência cadastrada, '20%' seria um número que ninguém pode conferir. Nulo é o caso normal e legítimo — o item simplesmente não entra na leitura por faixa, e nenhuma tela pinta cor nele." Em unidade-base, como todo o resto: um saco de 50 kg de açúcar é 50000 (`src/data/db.ts:563-575`).

#### V15 — leituras de grandeza num lugar (`src/data/db.ts:602-620`)

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

CREATE INDEX readings_where_idx ON readings (company_id, location_id, kind, taken_at);

ALTER TABLE locations ADD COLUMN sensor_ranges TEXT NOT NULL DEFAULT '{}';
```

Decisões (`src/data/db.ts:580-601`):

- **`kind` e `unit` são texto aberto, não enum.** "Zigbee, LoRa, umidade, pressão, decibel — protocolo e grandeza novos não podem pedir migração."
- **O que a integridade exige é outra coisa**: que a leitura saiba ONDE foi tomada e POR QUEM, "e isso é chave estrangeira de verdade".
- **`device_id` nulo é a leitura digitada.** "Não é lacuna: leitura digitada na conferência é fato tanto quanto leitura de sensor, e é o único caminho que funciona hoje — a fábrica começa a ter histórico antes de existir hardware."
- **Mais de uma câmara já estava resolvido antes de existir**: cada câmara é um `location`, e N sensores em N câmaras são N `devices` apontando para lugares diferentes.
- `source` tem padrão `'typed'`.

#### V16 — o lote diz qual ficha rodou (`src/data/db.ts:641-643`)

```sql
ALTER TABLE lots ADD COLUMN recipe_version_id TEXT;
```

A auditoria da Fase 1 marcou isto como o único item ausente, "e ele voltou pela metade: `production_runs.recipe_version_id` recebia `product.recipeId` — o id da RECEITA na coluna da VERSÃO —, e a linha da corrida é apagada ao fechar ou cancelar. Ou seja, nada durável dizia qual ficha fez aquele picolé." A marca fica no lote porque o lote é o que sobrevive: não é apagado, é o que a etiqueta nomeia e é por onde um recall começa. Anulável porque lote de importação não tem ficha nenhuma — "e nulo aqui é resposta, não lacuna" (`src/data/db.ts:622-640`).

#### V17 — o índice embaixo de "o que foi estornado não aconteceu" (`src/data/db.ts:670-674`)

```sql
CREATE INDEX IF NOT EXISTS movements_reversal_idx
  ON movements (reverses_movement_id, company_id)
  WHERE reverses_movement_id IS NOT NULL;
```

Medição transcrita do arquivo, contra um SQLite real de 60 mil movimentos (cinco meses de uma fábrica de seis lojas), janela de sete dias, 2.779 linhas candidatas (`src/data/db.ts:658-666`):

| cenário | tempo |
|---|---|
| com a cláusula `NAO_ESTORNADO`, sem índice | 9.906 ms |
| sem a cláusula | 3 ms |
| com a cláusula e este índice | 4 ms |

`NAO_ESTORNADO` (`src/data/repository.ts`) é subconsulta correlacionada: para cada linha candidata pergunta se existe um movimento que a estorna; sem índice o plano do SQLite diz `SCAN rev`. **Oito consultas do aplicativo usam essa cláusula, e a capa dispara cinco delas de uma vez** (`src/data/db.ts:650-656`). O índice é **parcial** porque estorno é raro por natureza (`src/data/db.ts:667-669`).

---

### 10.3 Esquema final consolidado: 21 tabelas, 18 índices

Estado depois dos 17 passos. Colunas na ordem em que passaram a existir.

| tabela | criada em | colunas finais |
|---|---|---|
| `items` | V1 | id, company_id, kind, name, purchase_unit, purchase_to_base, base_unit, packaging, active, created_at, **full_level** (V14) |
| `item_costs` | V1 | item_id, company_id, average_rate, last_rate, updated_at (`on_hand_base_units` removida na V3) |
| `item_cost_history` | V1 | id, company_id, item_id, previous_rate, new_rate, observed_at |
| `recipes` | V1 | id, company_id, name, yield_amount, yield_unit, active, created_at |
| `recipe_versions` | V1 | id, company_id, recipe_id, version, effective_from, loss_fraction, note, created_at |
| `recipe_lines` | V1 | id, company_id, recipe_version_id, item_id, sub_recipe_id, quantity, position |
| `products` | V1 | id, company_id, item_id, recipe_id, yield_per_unit, unit_packaging_cents, active, **line_id, type_id, flavor_id** (V9), **shelf_life_days** (V11), **packaging_items** (V13) |
| `purchases` | V1 | id, company_id, supplier_name, ordered_at, received_at, created_at |
| `purchase_lines` | V1 | id, company_id, purchase_id, item_id, purchase_quantity, base_units, total_cents, created_at |
| `app_meta` | V1 | key, value |
| `outbox` | V1 | id, table_name, row_id, payload, queued_at, sent_at, **op** (V2) |
| `locations` | V3 | id, company_id, name, kind, created_at, **contact_phone, delivery_days, agreement_note** (V12), **sensor_ranges** (V15) |
| `movements` | V3 | id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units, location_id, lot_id, loss_reason, unit_cost_rate, reverses_movement_id, assistant_phrase, note, **operator_id** (V5), **movement_group_id, counterpart_location_id** (V6), **post** (V7) — e `recorded_by`, acrescentada na V4 e removida na V5 |
| `production_runs` | V8 | id, company_id, product_id, recipe_version_id, batches, location_id, opened_at |
| `product_lines` | V9 | id, company_id, name, sort, active |
| `product_types` | V9 | id, company_id, line_id, name, sort, active |
| `flavors` | V9 | id, company_id, name, sort, active |
| `orders` | V10 | id, company_id, place_id, status, requested_for, note, created_at, decided_at |
| `order_lines` | V10 | id, company_id, order_id, item_id, base_units |
| `lots` | V11 | id, company_id, item_id, code, produced_on, expires_on, created_at, **recipe_version_id** (V16) |
| `readings` | V15 | id, company_id, location_id, device_id, kind, value, unit, taken_at, recorded_at, source |

Índices, na ordem de criação:

| índice | tabela | colunas | parcial |
|---|---|---|---|
| `items_kind_idx` | items | company_id, kind | `WHERE active = 1` |
| `recipe_lines_version_idx` | recipe_lines | recipe_version_id | — |
| `outbox_pending_idx` | outbox | queued_at | `WHERE sent_at IS NULL` |
| `movements_balance_idx` | movements | company_id, item_id, location_id, occurred_at | — |
| `movements_group_idx` | movements | company_id, movement_group_id | `WHERE movement_group_id IS NOT NULL` |
| `product_lines_name_idx` (UNIQUE) | product_lines | company_id, lower(trim(name)) | — |
| `product_types_name_idx` (UNIQUE) | product_types | company_id, line_id, lower(trim(name)) | — |
| `flavors_name_idx` (UNIQUE) | flavors | company_id, lower(trim(name)) | — |
| `products_grid_idx` (UNIQUE) | products | company_id, coalesce(line_id,''), coalesce(type_id,''), coalesce(flavor_id,'') | `WHERE active = 1` |
| `products_flavor_idx` | products | company_id, flavor_id | — |
| `orders_open_idx` | orders | company_id, status, requested_for | — |
| `order_lines_once_idx` (UNIQUE) | order_lines | order_id, item_id | — |
| `order_lines_item_idx` | order_lines | company_id, item_id | — |
| `lots_code_idx` (UNIQUE) | lots | company_id, code | — |
| `lots_expiry_idx` | lots | company_id, expires_on | `WHERE expires_on IS NOT NULL` |
| `lots_item_idx` | lots | company_id, item_id | — |
| `readings_where_idx` | readings | company_id, location_id, kind, taken_at | — |
| `movements_reversal_idx` | movements | reverses_movement_id, company_id | `WHERE reverses_movement_id IS NOT NULL` |

Nenhuma tabela do aparelho tem `company_id` como chave estrangeira para uma tabela de empresas — não existe tabela `companies` local. **NÃO ESTÁ NO CÓDIGO** nenhum equivalente local de `memberships` ou de RLS.

---

### 10.4 Como a migração é aplicada

O tipo mínimo que o app usa do banco, e que é o que torna a camada testável (`src/data/db.ts:690-696`):

```ts
export type Db = {
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, params?: SqlParam[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export type SqlParam = string | number | null;
```

"`expo-sqlite` só existe num aparelho, mas qualquer objeto com estes cinco métodos serve, então os testes dirigem o SQL de verdade contra o próprio SQLite do Node em vez de simular as consultas e não provar nada" (`src/data/db.ts:682-688`).

#### A função `migrate`

```ts
export async function migrate(conn: Db): Promise<number> {
  const row = await conn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    const step = MIGRATIONS[version];
    await conn.withTransactionAsync(async () => {
      await conn.execAsync(step);
      await conn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }

  return MIGRATIONS.length;
}
```

(`src/data/db.ts:785-811`.) Propriedades exatas:

- **`PRAGMA user_version` é o marcador.** `applied` é a versão que o celular já tem; o passo de índice `applied` é o próximo a rodar (índice 0 = V1).
- **Um passo, uma transação.** "Um celular que morre no meio de uma atualização volta na última versão que completou, em vez de em metade da seguinte" (`src/data/db.ts:781-783`).
- **A gravação de `user_version` é DENTRO da transação, e esse é o ponto todo.** Escrita depois do commit, essa linha era uma forma de brickar um celular: um processo morto na fresta entre as duas voltaria acreditando que o passo não rodou, e o rodaria de novo — e um passo como o `ALTER TABLE ... ADD COLUMN` da V2 falha numa coluna que já existe. "Não uma vez: a cada abertura, para sempre, sem jeito de entrar" (`src/data/db.ts:792-805`).
- **A interpolação de `${version + 1}`** está marcada com `// proofgate-allow` e justificada: PRAGMA não aceita parâmetro ligado, e o valor é um índice numa lista constante, não algo que um chamador alcance (`src/data/db.ts:801-806`).
- **`migrate` devolve sempre `MIGRATIONS.length`**, não a quantidade de passos aplicados nesta chamada (`src/data/db.ts:810`).
- **Regressão de versão não é tratada.** Se `user_version` for maior que `MIGRATIONS.length` — um celular que instalou uma versão nova e voltou para uma antiga —, o laço simplesmente não roda e a função devolve `MIGRATIONS.length` sem erro nem aviso. **NÃO IMPLEMENTADO**: qualquer detecção ou recusa de banco de versão futura.

#### A abertura, e a corrida que ela conserta

```ts
let handle: Db | null = null;
let opening: Promise<Db> | null = null;

export async function db(): Promise<Db> {
  if (handle) return handle;
  opening ??= openAndMigrate().finally(() => { opening = null; });
  return opening;
}
```

(`src/data/db.ts:698`, `src/data/db.ts:736-749`.) O defeito que isso conserta está transcrito: `handle` só era atribuído depois de `migrate` resolver, e a tela inicial faz cinco perguntas num único `Promise.all`. Cada uma que chegasse antes da primeira terminar abria **outra** conexão com `norva.db` e começava **outra** migração nela — e V2, V4, V5 e V6 são `ALTER TABLE ... ADD COLUMN`, que lança `duplicate column name` quando roda duas vezes. "Ficou invisível apenas porque a semeadura em `_layout` acabava por terminar primeiro, e aquele await estava embrulhado num `catch` que não dizia nada" (`src/data/db.ts:725-735`).

`opening` é limpo quando assenta: em caso de sucesso, `handle` responde daí em diante; em caso de falha, o próximo chamador tem permissão de tentar de novo em vez de receber a mesma rejeição para sempre (`src/data/db.ts:741-744`).

`openAndMigrate` (`src/data/db.ts:751-775`): abre o nativo, executa os PRAGMAS, roda `migrate` sobre um adaptador, e só então monta `handle` — um invólucro fino em vez do próprio driver, "para que 'sem parâmetros' signifique aqui o mesmo que significa no SQLite do Node" (`src/data/db.ts:763-764`).

`openNative` é importado dentro da função e não no topo, porque `expo-sqlite` alcança o React Native, que só existe num aparelho; carregar tarde é o que deixa os testes apontarem `__setDb` para o SQLite do Node (`src/data/db.ts:700-723`).

#### Costuras de teste exportadas

| símbolo | assinatura | para que serve |
|---|---|---|
| `migrationSteps` | `readonly string[]` | deixa um teste levantar um banco numa versão antiga de propósito, "para o caminho de atualização ser exercitado em vez de assumido" (`src/data/db.ts:813-819`) |
| `schemaVersion` | `number` = `MIGRATIONS.length` | "quantos passos existem, para um teste poder afirmar que andou" (`src/data/db.ts:821-822`) |
| `__setDb(next: Db \| null)` | zera `handle` e `opening` | aponta para um banco novo em memória (`src/data/db.ts:826-829`) |
| `__setOpener(next: Opener)` | zera `handle` e `opening` | aponta a abertura para algo que um teste possa rodar — "o caminho atrás dela, o que todo celular toma na primeira abertura, não tinha como ser exercitado" (`src/data/db.ts:831-840`) |

#### Utilitários no mesmo arquivo

```ts
export function newId(): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
```

(`src/data/db.ts:842-851`.) O id é gerado no cliente "para que uma escrita offline seja idempotente na repetição" (`src/data/db.ts:843`). É formato UUID v4 com variante `8`, construído sobre `Math.random()` — **não** é aleatoriedade criptográfica, e o código não afirma que seja.

---

### 10.5 Como se garante que não regride

Quatro mecanismos, todos existentes e verificáveis, mais uma ausência.

**1. A gravação de versão participa da transação.** Já descrito: esquema e registro do esquema chegam juntos ou não chegam (`src/data/db.ts:791-807`).

**2. Teste do corte de energia no ponto exato do perigo** (`src/data/schema.test.ts:106-141`). Um `Db` embrulhado falha justamente no `execAsync` que começa com `PRAGMA user_version`, e o teste afirma três coisas: `user_version` continua 0 ("um passo que não terminou não fica registrado como feito"), `sqlite_master` volta **vazio** ("e não deixou meio esquema atrás"), e a abertura seguinte, com energia, chega até `schemaVersion`.

**3. Teste de que a primeira abertura de verdade migra** (`src/data/db.test.ts:85-102`): depois de `db()`, `PRAGMA user_version` é maior que zero e `sqlite_master` contém `movements`. E dois testes de concorrência: cinco `db()` simultâneos abrem o arquivo **uma** vez e devolvem o mesmo handle (`src/data/db.test.ts:44-64`); uma abertura que falha ("disco cheio") permite que a próxima tentativa funcione, porque "uma falha lembrada para sempre transformaria uma abertura ruim num app que nunca abre de novo até ser reinstalado" (`src/data/db.test.ts:66-83`).

**4. Idempotência do backfill da V3, provada** (`src/data/repository.test.ts:658-716`). O teste levanta o banco em `user_version = 2` com item, compra, linha de nota e `item_costs` **incluindo** `on_hand_base_units`, roda `migrate`, e afirma: o saldo somado de `movements` é 100.000 (o mesmo que entrou), o movimento **mantém o id `l1` da linha de nota** ("a linha mantém a identidade, então uma repetição não pode dobrá-la"), o `kind` é `purchase`, a taxa é 0,472 com tolerância 1e-9 — e, rodando `migrate` **outra vez**, o total continua 100.000: "o backfill não rodou duas vezes".

**5. Guarda contra o retorno do saldo guardado** (`src/data/schema.test.ts:31-104`). Um predicado de nome:

```ts
/(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)/i
```

O teste primeiro prova que a guarda reconhece o nome **real** que este projeto de fato embarcou (`on_hand_base_units`, `estoque_atual`, `current_stock`) e que ela deixa em paz `quantity_base_units`, `purchase_to_base` e `total_cents` — "que é o que impede a guarda de ser desligada na primeira vez que grita à toa". Depois roda `migrate` num banco em memória e varre `PRAGMA table_info` de toda tabela não-`sqlite_%`, exigindo lista vazia de ofensores. Fica escrito que a guarda é de nome de propósito, porque "o erro se anuncia no nome toda vez"; e que uma guarda que disparasse em qualquer coisa com "total" seria desligada em uma semana.

**6. O aparelho e o servidor conferidos um contra o outro, lendo os dois** (`src/sync/agreement.test.ts`). Onze testes que fazem parse das migrações SQL do servidor e do `db.ts`. Os que tocam diretamente este esquema:

- `the device schema does not carry a column the server dropped` (`src/sync/agreement.test.ts:238-251`) exige que `item_costs.on_hand_base_units` não exista no servidor **e** que a string literal `ALTER TABLE item_costs DROP COLUMN on_hand_base_units` continue presente em `src/data/db.ts` — se a V3 for editada, o teste cai.
- `what the device does not keep is a list somebody wrote, not a surprise` (`src/sync/agreement.test.ts:361-397`) lê as colunas de `movements` no aparelho **aplicando creates, ADDs e DROPs na ordem**, compara com os campos do tipo `Movement`, e mantém uma lista fechada do que falta de propósito — hoje só `recorded_by`. E a lista tem de apodrecer alto: se a coluna voltar ao aparelho, o teste manda tirá-la da lista.
- `the location this device creates is a kind the server knows` (`src/sync/agreement.test.ts:219-236`) — o defeito real que a repetição pegou foi `storeroom` contra o `store_room` do servidor.

**7. `db:verify` — treze garantias contra um Postgres descartável** (`scripts/verify-migrations.sh`, `package.json:14`). A **checagem 6** é a que envolve este banco: `scripts/device-session.ts` roda uma sessão de verdade num SQLite em memória migrado, produz a fila real, serializa com o mesmo `serialize` da sincronização, e o SQL entra no Postgres com `ON_ERROR_STOP` **como a conta da empresa, não como superusuário** — "um superusuário ignora row level security por completo, então as 45 escritas passavam sem que uma única política fosse avaliada" (`scripts/verify-migrations.sh:417-470`). A **checagem 9** sobe a mesma linha **duas vezes** com a capacidade mínima de um papel real, porque a fila reenvia com `on conflict do update` e uma política de update mais exigente que a de insert travaria a fila para sempre (`scripts/verify-migrations.sh:688-731`).

**8. A ausência, dita como ausência.** O guard `97-migration-edited.sh` da proofgate só olha caminhos de **diretório** de migração — `migrations/*`, `*/migrations/*`, `db/migrate/*`, `*/alembic/versions/*`, `db/schema.rb` (`.proofgate/guards.d/97-migration-edited.sh:24-26`). **`src/data/db.ts` não casa com nenhum desses padrões**, então editar um passo V1..V17 já embarcado **não é pego por guard nenhum**. O guard `50-coupled-files.sh` poderia cobrir o par, mas depende de `proofgate.json → coupledFiles`, e **não existe `proofgate.json` neste repositório** — o guard se declara "skipped" (`.proofgate/guards.d/50-coupled-files.sh:13`). Portanto: a append-only da lista `MIGRATIONS` do aparelho é sustentada por convenção escrita (`src/data/db.ts:168-171` e `CLAUDE.md`), pelos dois testes de literal do `agreement.test.ts`, e por nada mais automático. **NÃO IMPLEMENTADO**: guard automático contra edição de passo do aparelho.

---

### 10.6 A fila de saída (`outbox`)

#### Por que ela existe, e as duas propriedades que a sustentam

"Uma câmara fria é uma caixa de metal e uma rota de entrega não tem torre, então toda escrita tem de ter êxito localmente e chegar ao servidor depois" (`src/data/outbox.ts:4-7`). Duas condições, e ambas são o motivo de existir este arquivo em vez de um `fetch` ao lado de cada gravação (`src/data/outbox.ts:11-18`):

1. **Nada é escrito sem ser enfileirado.** O `enqueue` acontece **dentro da mesma transação** da linha que ele descreve, então não existe instante em que o dado existe e a intenção de sincronizá-lo não. "Uma queda cai de um lado da linha ou do outro, nunca entre."
2. **Repetir é inofensivo.** Ids são gerados no aparelho e o servidor faz upsert por id, então mandar a mesma entrada duas vezes não muda nada. "É isso que transforma uma conexão instável de perigo em atraso."

E: "as entradas são guardadas depois de enviadas, brevemente, para que 'aquilo subiu?' seja uma pergunta com resposta" (`src/data/outbox.ts:20-21`).

#### Estrutura e tipos

```ts
export type OutboxOp = 'upsert' | 'delete';

export type OutboxEntry = {
  id: string;
  table: string;
  rowId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  queuedAt: string;
};

export type PendingWrite = {
  table: string;
  rowId: string;
  op?: OutboxOp;
  payload?: Record<string, unknown>;
};
```

(`src/data/outbox.ts:24-40`.) Só existem **dois** verbos: `upsert` e `delete`. O padrão da coluna e do `enqueue` é `upsert` (`src/data/db.ts:182`, `src/data/outbox.ts:57`).

#### Estados de uma entrada

Não há coluna de estado. O estado é a nulidade de `sent_at`, e por isso são exatamente **dois** estados mais um desaparecimento:

| estado | como se lê | quem o produz |
|---|---|---|
| **pendente** | `sent_at IS NULL` | `enqueue` (`src/data/outbox.ts:50-61`) |
| **enviada** | `sent_at` = ISO do momento da confirmação | `markSent` (`src/data/outbox.ts:128-131`) |
| **esquecida** | a linha deixa de existir | `forgetSentBefore` (só enviadas antigas) ou `forgetOrphans` (só pendentes órfãs) ou o `DELETE FROM outbox` do apagar (`src/data/repository.ts:3480-3481`) |

**NÃO ESTÁ NO CÓDIGO**: coluna de tentativas, de último erro, de `attempted_at`, ou de estado "falhou". A contagem de tentativas vive só na memória de uma execução de `drain` (`src/sync/engine.ts:85`), então fechar o app zera a contagem.

#### `enqueue` — junta-se à transação de quem chamou

```ts
export async function enqueue(conn: Db, writes: readonly PendingWrite[]): Promise<void> {
  const at = nowIso();
  for (const write of writes) {
    await conn.runAsync(
      `INSERT INTO outbox (id, table_name, row_id, op, payload, queued_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), write.table, write.rowId, write.op ?? 'upsert',
       JSON.stringify(write.payload ?? {}), at],
    );
  }
}
```

(`src/data/outbox.ts:46-63`.) Recebe a conexão em vez de abrir uma, "porque o chamador está dentro de uma transação e isto tem de se juntar a ela" (`src/data/outbox.ts:43-45`). Todas as escritas de uma chamada compartilham o mesmo `queued_at`. O `payload` padrão é `'{}'` — e na prática **só o comando `erase` carrega payload de verdade** (`src/data/repository.ts:3507`).

Prova de que a transação segura os dois lados: `a failed write leaves nothing behind, in the data or in the queue` — uma linha de receita apontando para item inexistente derruba a chave estrangeira depois da receita já ter sido inserida, e `pendingCount()` volta 0 (`src/sync/sync.test.ts:121-135`).

#### Ordem de envio

```sql
SELECT id, table_name, row_id, op, payload, queued_at
  FROM outbox WHERE sent_at IS NULL
 ORDER BY queued_at, rowid
 LIMIT ?
```

(`src/data/outbox.ts:82-86`, limite padrão **100** em `src/data/outbox.ts:72`.) "A ordem é o ponto. Uma linha de receita que chega antes da receita é um erro de chave estrangeira no servidor, e a única coisa que confiavelmente impede isso é enviar na ordem em que o aparelho escreveu" (`src/data/outbox.ts:65-70`). O desempate por `rowid` é o que faz duas escritas do mesmo milissegundo manterem a ordem de inserção.

A ordem é **a única coisa** que garante várias dependências do lado do servidor, e isso está registrado em três lugares de `serialize.ts`: a grade sobe linha antes do tipo, tipo antes do produto (`src/sync/serialize.ts:217-219`); o lote atravessa antes do movimento que o cita, porque "o aparelho não tem essa FK, então é aqui que a ordem tem que estar certa" (`src/sync/serialize.ts:255-259`); o pedido antes das linhas dele (`src/sync/serialize.ts:295-296`).

O teste que fixa isso: `the queue goes up in the order it was written` afirma `items` antes de `purchases` e `recipes` antes de `recipe_versions` no primeiro lote entregue ao transporte (`src/sync/sync.test.ts:149-162`). E `every write queues itself` fixa a sequência exata que uma sessão produz: `items`, `locations`, `purchases`, `purchase_lines`, `movements`, `recipes`, `recipe_versions`, `recipe_lines` — com `item_costs` **deliberadamente ausente** (`src/sync/sync.test.ts:92-118`).

#### `pendingCount` e `parsePayload`

```ts
SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NULL
```

(`src/data/outbox.ts:111-117`.) `parsePayload` devolve `{}` para JSON quebrado: "um payload que não parseia é um bug, não um motivo para travar a fila atrás dele para sempre. O id da linha ainda está lá, então o servidor pode ser pedido a buscar o estado atual em vez disso" (`src/data/outbox.ts:99-109`).

#### `markSent` — marca exatamente o que o servidor aceitou

```ts
export async function markSent(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const conn = await db();
  const at = nowIso();
  const marks = ids.map(() => '?').join(', ');  // proofgate-allow
  await conn.runAsync(
    `UPDATE outbox SET sent_at = ? WHERE id IN (${marks}) AND sent_at IS NULL`,
    [at, ...ids],
  );
}
```

(`src/data/outbox.ts:120-132`.) Dois detalhes carregam regra: só interrogações são interpoladas, todo id é ligado (`src/data/outbox.ts:125-126`); e `AND sent_at IS NULL` impede que uma segunda marcação reescreva o horário da primeira.

#### Tentativa, reenvio e o que acontece quando falha — `drain`

O motor não conhece Supabase, HTTP nem autenticação: conhece a fila e um `Transport` (`src/sync/engine.ts:6-11`).

```ts
export type Transport = { push(entries: readonly OutboxEntry[]): Promise<PushResult> };
export type PushResult = { acceptedIds: string[] };
export type SyncReport = {
  sent: number; remaining: number; batches: number; attempts: number; error?: string;
};
export type SyncOptions = {
  batchSize?: number; maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>; now?: () => number;
};
```

(`src/sync/engine.ts:30-55`.) Padrões: `batchSize = 100`, `maxAttempts = 3` (`src/sync/engine.ts:79-80`).

Recuo exponencial com teto:

```ts
export function backoffMs(attempt: number, base = 1_000, cap = 60_000): number {
  if (attempt <= 0) return 0;
  return Math.min(cap, base * 2 ** (attempt - 1));
}
```

(`src/sync/engine.ts:64-67`.) Valores fixados por teste: `backoffMs(0) = 0`, `(1) = 1.000`, `(2) = 2.000`, `(3) = 4.000`, `(99) = 60.000` (`src/sync/sync.test.ts:234-241`). "O teto importa mais que o crescimento: um celular que passou a noite num freezer deve tentar de novo algumas vezes por hora, não uma vez por semana, e também não deve martelar um servidor que já está tendo um dia ruim" (`src/sync/engine.ts:58-63`).

O laço de `drain` (`src/sync/engine.ts:88-121`), passo a passo:

1. Lê um lote com `pendingEntries(batchSize)`. Lote vazio → `break`.
2. `attempts += 1`.
3. `transport.push(batch)`. **Se lançar**: guarda a mensagem em `error`, **nada é marcado** — "o lote inteiro continua exatamente onde estava" —, dorme `backoffMs(attempts)` se ainda houver tentativa, e `continue` (`src/sync/engine.ts:95-102`).
4. Marca como enviado **apenas o que está em `acceptedIds`** (`src/sync/engine.ts:104-108`).
5. **Se confirmou menos do que o lote**: `error = "O servidor aceitou ${confirmed.length} de ${batch.length} registros."`, dorme o recuo, e `continue`. Parar aqui é deliberado: "continuar mandaria linhas cujos pais o servidor não tem, e transformaria uma recusa em muitas" (`src/sync/engine.ts:111-117`).
6. Lote inteiro aceito: limpa `error`; se o lote veio menor que `batchSize`, `break` (fila esvaziou).
7. Devolve `{ sent, remaining: await pendingCount(), batches, attempts, error }`.

A mensagem `O servidor aceitou N de M registros.` é o único texto em português dentro do motor, e é um relatório interno — **não** passa pelo dicionário `src/i18n/locales/`.

As três regras que o motor declara e que os testes fixam (`src/sync/engine.ts:12-27`):

| regra | teste |
|---|---|
| ordem preservada e nunca pulada; lote parcialmente aceito **para** a execução | `only what the server confirmed is marked sent` — `report.remaining === before - report.sent`, "o resto continua na fila, até a linha" (`src/sync/sync.test.ts:164-181`) |
| só o que o servidor confirmou é marcado; marcar por "a chamada não lançou" é como dado desaparece em silêncio | idem |
| falha é atraso, não perda | `a server that throws loses nothing and retries with backoff` — `sent = 0`, `remaining = before`, `attempts = 3`, esperas `[1000, 2000]` — "espera mais a cada vez, e não depois da última" (`src/sync/sync.test.ts:183-206`) |
| repetir a fila é inofensivo | `sending the same queue twice is harmless` — segunda execução: `sent = 0`, `batches = 0`, `remaining = 0` (`src/sync/sync.test.ts:208-219`) |
| fila maior que um lote sobe em vários lotes sem repetir entrada | `batchSize: 3, maxAttempts: 50` → mais de um lote, e o conjunto de ids entregues não tem duplicata (`src/sync/sync.test.ts:221-232`) |

**Estado do motor: implementado, sem chamador de produção.** `drain` é chamado apenas em `src/sync/sync.test.ts` (linhas 153, 175, 194, 212, 213, 225). Não existe nenhuma implementação de `Transport` fora dos falsos dos testes (`src/sync/sync.test.ts:53`, `:168`, `:188`), não existe cliente Supabase em `src/` ou `app/`, e não existe uma única palavra sobre fila ou sincronização no dicionário `src/i18n/locales/pt-BR.ts`. A fila é hoje **invisível ao usuário**: nada na interface mostra quantas escritas estão pendentes.

#### `forgetSentBefore` — sem chamador fora de teste

```ts
export async function forgetSentBefore(iso: string): Promise<void> {
  const conn = await db();
  await conn.runAsync(`DELETE FROM outbox WHERE sent_at IS NOT NULL AND sent_at < ?`, [iso]);
}
```

(`src/data/outbox.ts:139-142`.) Motivo declarado: as entradas valem a pena por alguns dias, para uma pessoa poder ser informada do que sincronizou e do que não, "e valem a pena ser jogadas fora depois disso para o celular de uma fábrica movimentada não carregar um ano delas" (`src/data/outbox.ts:134-138`).

**Marcação explícita: `forgetSentBefore` NÃO tem chamador de produção.** A única referência fora da própria definição é `src/data/repository.test.ts:69` (import), `:774` (chamada). Nada agenda essa limpeza — **NÃO IMPLEMENTADO**: qualquer rotina periódica, gancho de abertura, ou janela de retenção em dias. O número de dias de que o docblock fala não existe como constante em lugar nenhum do código.

O teste que a mantém honesta (`src/data/repository.test.ts:766-780`): semeia, marca duas entradas como enviadas, chama `forgetSentBefore('2099-01-01T00:00:00Z')` — data no futuro, portanto apagaria tudo o que tem `sent_at` — e afirma que `pendingCount()` **não mudou** e que `COUNT(*) WHERE sent_at IS NOT NULL` virou 0. "Uma escrita jogada fora antes de chegar é uma escrita que a pessoa se viu fazer e a fábrica nunca vai ver" (`src/data/repository.test.ts:743-747`).

#### `QUEUED_TABLES` — as 16 tabelas que a fila envia

```ts
export const QUEUED_TABLES = [
  'items', 'locations', 'movements', 'lots', 'products',
  'purchases', 'purchase_lines', 'recipes', 'recipe_versions', 'recipe_lines',
  'readings', 'orders', 'order_lines', 'product_lines', 'product_types', 'flavors',
] as const;
```

(`src/data/outbox.ts:156-173`.) Escrita à mão e **conferida contra o código**, não contra si mesma: a guarda lê todo `enqueue` de `repository.ts` e reprova se alguém enfileirar uma tabela que não está nesta lista. "Lista escrita à mão que se confere consigo mesma não guarda nada — foi a cicatriz do `erase.test.ts`, em 4 de setembro" (`src/data/outbox.ts:145-151`).

**`erase` não está aqui de propósito: é comando, não linha.** Não tem linha nenhuma atrás dele, e é justamente o que a varredura de órfãs não pode confundir com órfã (`src/data/outbox.ts:152-155`).

Este conjunto é **idêntico** ao das travessias que `serialize` conhece (`sendableTables`, 16 nomes, `src/sync/serialize.ts:61-77` e `:371`). Ficam fora, cada um com razão escrita: `production_runs` (estado, não fato — V8), `app_meta` (gaveta local), `item_costs` e `item_cost_history` (valor derivado, dono único é o servidor — `src/sync/serialize.ts:44-59` e `:386-388`).

Duas guardas de teste (`src/data/outbox.test.ts`):

- `every table the code queues is a table the orphan sweep knows` (`:34-54`): extrai `table: '...'` de `repository.ts`, exige mais de 10 achados ("a leitura do repositório veio vazia — a comparação seria de graça"), e o único nome permitido fora de `QUEUED_TABLES` é `erase`.
- `every table the sweep visits exists, with the id column it asks for` (`:56-71`): extrai `CREATE TABLE IF NOT EXISTS (\w+)` de `db.ts`, exige mais de 15 tabelas, e para cada nome de `QUEUED_TABLES` exige que a tabela exista **e** que o corpo dela comece com uma coluna `id` — porque a varredura compara `t.id = o.row_id`, e uma tabela sem `id` levantaria erro de SQLite dentro da transação de apagar.

#### `forgetOrphans` — a cicatriz do apagar

```ts
export async function forgetOrphans(conn: Db): Promise<number> {
  let esquecidas = 0;
  for (const table of QUEUED_TABLES) {
    const órfãs = await conn.getAllAsync<{ id: string }>(
      `SELECT o.id FROM outbox o
        WHERE o.sent_at IS NULL AND o.table_name = ?
          AND NOT EXISTS (SELECT 1 FROM ${table} t WHERE t.id = o.row_id)`,
      [table],
    );
    if (órfãs.length === 0) continue;
    for (const linha of órfãs) {
      await conn.runAsync(`DELETE FROM outbox WHERE id = ?`, [linha.id]);
    }
    esquecidas += órfãs.length;
  }
  return esquecidas;
}
```

(`src/data/outbox.ts:193-216`.) O defeito que ela conserta: apagar uma área — as compras de exemplo, que é o caso normal — deixava na fila entradas apontando para linhas recém-apagadas. "Órfã não é recusa do servidor: o serializador levanta *'Queued movements X but the row is gone from the device'*, e o motor para a fila no primeiro buraco de propósito. Uma exceção que repete, e tudo o que a fábrica gravar depois fica preso atrás dela" (`src/data/outbox.ts:176-186`). A mensagem citada é literal em `src/sync/serialize.ts:399`.

Por que apagar é a resposta certa e não é perda: a entrada nunca subiu (`sent_at` nulo), então o servidor nunca soube da linha. O que subiu tem `sent_at` e **não é tocado aqui** — para aquele lado quem fala é o comando `erase`, que viaja depois dos deletes (`src/data/outbox.ts:184-188`).

Roda **dentro da transação de quem apagou**, pelo mesmo motivo do `enqueue` (`src/data/outbox.ts:190-192`), e é chamada em exatamente um lugar de produção: `src/data/repository.ts:3496`, dentro de `eraseArea`, **antes** do `enqueue` do comando `erase` (`src/data/repository.ts:3507`).

A ordem dentro de `eraseArea` carrega duas regras (`src/data/repository.ts:3462-3509`):

- `DELETE FROM outbox` sem `WHERE company_id` quando a área é `all` (`src/data/repository.ts:3480-3481`) — a fila não tem coluna de empresa.
- O comando `erase` é enfileirado **depois** dos deletes, "e essa ordem é o ponto todo: apagar tudo limpa o `outbox` também, então um comando enfileirado antes do laço se apagava de passagem: o aparelho saía vazio e o servidor nunca soube, então a próxima busca restaurava precisamente o que a pessoa tinha pedido para destruir" (`src/data/repository.ts:3499-3506`). E a **área** é a unidade, não a linha: "um apagar é uma decisão, e repeti-lo linha por linha descreveria algo que a pessoa nunca fez."

Testes: `erasing everything leaves the order to erase, and nothing else` — depois de `eraseArea(CO, 'all')`, a fila contém exatamente `['erase']`, com `op = 'delete'` e `rowId = 'all'` (`src/data/repository.test.ts:718-733`); e `erasing queues the decision, so the server does not send it all back` para a área `products` (`src/sync/sync.test.ts:137-147`).

#### O que uma entrada se torna ao sair (resumo, para o leitor não precisar do outro capítulo)

`serialize(entry, row, actor)` (`src/sync/serialize.ts:381-407`) resolve três casos antes de olhar as travessias: `item_costs` e `item_cost_history` devolvem `{kind:'derived'}` e não sobem; `erase` devolve `{kind:'erase', area}` lendo `payload.area` e caindo em `rowId` se não for string; tabela desconhecida lança `UnknownTableError` — "uma escrita que silenciosamente nunca chega é o pior desfecho disponível" (`src/sync/serialize.ts:373-380`). Linha ausente lança `Queued ${table} ${rowId} but the row is gone from the device` (`src/sync/serialize.ts:398-400`) — que é exatamente o buraco que `forgetOrphans` fecha.

No replay de `db:verify`, `movements` e `readings` sobem com `on conflict (id) do nothing`, e todas as outras com `do update set` de cada coluna: "o razão é append-only e o banco recusa um UPDATE de saída, então um movimento chegando duas vezes tem de ser um nada. É isso que o id compartilhado entre uma linha de nota e o movimento dela sempre foi" (`scripts/device-session.ts:286-300`).

---

### 10.7 `meta.ts` — a gaveta chave/valor do aparelho

Quatro funções, todas sobre `app_meta` (`src/data/meta.ts`).

```ts
export async function readMeta(key: string): Promise<string | null>
export async function writeMeta(key: string, value: string): Promise<void>
export async function readJson<T>(key: string): Promise<T | null>
export async function writeJson(key: string, value: unknown): Promise<void>
```

SQL exato:

```sql
-- readMeta (src/data/meta.ts:17-20)
SELECT value FROM app_meta WHERE key = ?

-- writeMeta (src/data/meta.ts:26-30)
INSERT INTO app_meta (key, value) VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
```

`readMeta` devolve `row?.value ?? null` (`src/data/meta.ts:21`). `writeJson` é `writeMeta(key, JSON.stringify(value))` (`src/data/meta.ts:52`). `readJson` lê com desconfiança: JSON quebrado ou de outro formato devolve **nulo** em vez de derrubar a tela, "porque o que está aqui foi escrito por uma versão anterior do app, e a versão de hoje não tem como saber por qual — um cache é, por definição, algo de que se pode abrir mão" (`src/data/meta.ts:33-49`).

**A regra de escopo, escrita e categórica** (`src/data/meta.ts:10-13`): "O que cabe aqui é preferência e cache… O que **NÃO** cabe é qualquer coisa que alguém vá somar. Saldo é a soma dos movimentos, e uma chave/valor é exatamente o formato em que um `estoque_atual` renasceria — sem trigger, sem histórico e sem ninguém notando."

E a razão de existirem funções em vez de SQL solto: "a semente escrevia a dela na mão, e a segunda a copiaria" (`src/data/meta.ts:6-8`).

#### Todas as chaves em uso hoje

| chave | escrita por | formato | quem usa |
|---|---|---|---|
| `seeded` | `markSeeded` (`src/data/seed.ts:212-218`) | `'1'` | `hasSeeded()` (`src/data/seed.ts:88-94`) — SQL direto, **não** passa por `meta.ts` |
| `seeded_items` | `markSeededItems` (`src/data/seed.ts:203-211`) | JSON array de ids | `exampleStillHere()` (`src/data/seed.ts:62-87`) — SQL direto |
| `appearance.skin` | `src/theme/Appearance.tsx:8`, `:97` | texto | tema |
| `appearance.hue` | `src/theme/Appearance.tsx:9`, `:102` | texto | tema |
| `appearance.scheme` | `src/theme/Appearance.tsx:10`, `:107` | texto | tema |
| `locale.language` | `src/i18n/Locale.tsx:7`, `:82` | texto | idioma |
| `locale.currency` | `src/i18n/Locale.tsx:8`, `:87` | texto | moeda |
| `briefing.order` | `setBriefingOrder` (`src/data/repository.ts:3904-3906`) | **texto separado por vírgula** | `briefingOrder()` (`:3899-3902`) |
| `briefing.hidden` | `setBriefingHidden` (`src/data/repository.ts:3920-3922`) | texto separado por vírgula | `briefingHidden()` (`:3915-3918`) |
| `alerts.settings` | `setAlertSettings` (`src/data/repository.ts:3964-3966`) | JSON | `alertSettings()` (`:3939-3963`) |
| `orders.needApproval` | `setOrdersNeedApproval` (`src/data/repository.ts:3982-3984`) | `'1'` / `'0'` | `ordersNeedApproval()` (`:3978-3980`) |
| `weather.place` | `writeJson` (`src/weather/live.ts:13`, `:43`) | JSON | `readPlace()` |
| `weather.forecast` | `writeJson` (`src/weather/live.ts:13`, `:57`) | JSON (cache) | `forecastForScreen` |

Três decisões de formato registradas:

- **`briefing.order` é texto com vírgulas e não JSON**, por motivo prático: "é uma lista de palavras curtas que alguém pode precisar ler no banco durante um suporte, e `producao,clima,insumos` se lê. Vazio quer dizer 'a ordem que veio de fábrica' — e não uma capa vazia" (`src/data/repository.ts:3891-3898`).
- **`briefing.hidden` é preferência DO APARELHO**, não da casa: "some da capa deste celular e continua na do escritório… não é fato do negócio e não sobe para o servidor" (`src/data/repository.ts:3908-3914`).
- **`alerts.settings` é lido com tolerância deliberada**: campo faltando cai no padrão, campo estranho é ignorado, JSON quebrado devolve o padrão inteiro, `minuteOfDay` só é aceito entre 0 e 1439 e `weekdays` entre 0 e 127. "Um aviso que deixa de sair porque a configuração não pôde ser lida é o pior desfecho possível — o dono descobre no dia em que faltar polpa" (`src/data/repository.ts:3926-3963`).

#### `app_meta` sobrevive ao "apagar tudo", de propósito

`app_meta` não está em `ErasableTable` (`src/data/erase.ts:23-51`), e a guarda que exige que "apagar tudo" alcance toda tabela do aparelho lista `app_meta` como renúncia consciente, com a razão escrita: "a gaveta local do aparelho: a cara escolhida, a luz da tela, a cidade do tempo, o que a capa esconde. Não é dado do negócio, e apagá-la faria o aplicativo reabrir estranho para quem só queria limpar o exemplo" (`src/data/erase.test.ts:87-90`).

Isso teve uma consequência real e conhecida: a marca `seeded` **nunca** é apagada, então a tela de Ajustes acendia "Inclui os dados de exemplo" para sempre em todo aparelho. A cura foi `seeded_items` — ela anota os ids criados, e `exampleStillHere` pergunta se **ainda** existe algum deles em `items`; sem a anotação a resposta é não (`src/data/seed.ts:48-87`).

#### O que **não** mora em `app_meta`

`src/components/WhatsNew.tsx` guarda a marca de release lida (`${brand.slug}:release-seen`) em **`AsyncStorage`**, não em `app_meta` (`src/components/WhatsNew.tsx:1`, `:10`, `:34`). Falhas de leitura são engolidas de propósito: "no pior caso a nota aparece duas vezes; recusar abrir o app por uma preferência ausente seria muito pior" (`src/components/WhatsNew.tsx:21-23`).

---

### 10.8 `useQuery.ts` — como as telas leem e reagem a mudança

Assinatura completa (`src/data/useQuery.ts:21-25`):

```ts
export function useQuery<T>(
  run: () => Promise<T>,
  /** Muda quando a pergunta muda: um id, um filtro, ou '' para nenhum. */
  key = '',
): { data: T | null; loading: boolean; error: Error | null; refresh: () => void }
```

**Deliberadamente pequeno**: "uma biblioteca de busca de dados aqui seria peso por nada, já que toda consulta é uma chamada local ao SQLite que responde em milissegundos e nunca precisa de política de nova tentativa de rede" (`src/data/useQuery.ts:8-11`). Não há cache entre componentes, nem deduplicação, nem invalidação por chave — **NÃO ESTÁ NO CÓDIGO**.

#### Estado interno e por que ele é assim

```ts
const [tick, setTick] = useState(0);
const [settled, setSettled] = useState<{ key: string; data: T | null; error: Error | null }>({
  key: ' never', data: null, error: null,
});
const asked = `${key}:${tick}`;
```

(`src/data/useQuery.ts:26-33`.) O valor inicial da chave assentada é a string `' never'` — com espaço à frente, para não poder colidir com nenhum `asked` real, já que `asked` sempre contém `:`.

Duas escolhas são por causa do compilador do React, "e ambas acabaram sendo melhorias" (`src/data/useQuery.ts:12-19`):

1. **A consulta é chaveada por uma string, não por um array de dependências**, "então as dependências do efeito são algo que um compilador consegue de fato ler".
2. **`loading` é derivado** de a resposta em mão pertencer ou não à chave que está sendo perguntada — `loading: settled.key !== asked` (`src/data/useQuery.ts:89`) — em vez de ser ligado dentro do efeito. Consequência: nenhum estado é definido sincronamente durante a renderização, e **uma atualização continua mostrando a resposta anterior até a nova chegar, em vez de piscar por uma tela vazia**.

#### A função `run` fica num ref

```ts
const latest = useRef(run);
useEffect(() => { latest.current = run; });
```

(`src/data/useQuery.ts:35-41`.) "O chamador reconstrói `run` a cada renderização; a chave decide quando isso importa." O ref é atualizado no próprio efeito dele, para nada ser escrito durante uma renderização, e é declarado **primeiro** para aterrissar antes de a consulta abaixo lê-lo (`src/data/useQuery.ts:35-38`).

#### O efeito da consulta, com guarda de corrida

```ts
useEffect(() => {
  let alive = true;
  latest.current()
    .then((data) => { if (alive) setSettled({ key: asked, data, error: null }); })
    .catch((e: unknown) => {
      if (alive) setSettled({ key: asked, data: null,
        error: e instanceof Error ? e : new Error(String(e)) });
    });
  return () => { alive = false; };
}, [asked]);
```

(`src/data/useQuery.ts:43-64`.) A única dependência é `asked`. O `alive` descarta a resposta de uma pergunta antiga. Um erro **substitui** os dados por `null` — não há "mostrar o último bom valor com um aviso". Qualquer coisa lançada que não seja `Error` é embrulhada em `new Error(String(e))`.

#### Reconsulta ao voltar para a tela

```ts
const focused = useRef(false);
useFocusEffect(
  useCallback(() => {
    if (focused.current) setTick((t) => t + 1);
    else focused.current = true;
  }, []),
);
```

(`src/data/useQuery.ts:77-84`.) O primeiro foco é a montagem, e a consulta acima já rodou para ele; por isso o `focused` ref.

O defeito que isso conserta está transcrito (`src/data/useQuery.ts:66-76`): "sem isto, uma tela alcançada tocando Voltar mostra o que leu quando montou pela primeira vez — e a capa, que é a raiz da pilha e monta uma vez por abertura, nunca atualizava. Lance uma nota, toque Voltar, e o app continua dizendo 'nada mudou no preço' com o custo velho ao lado. Num celular essa pilha vive por dias. Só recarregar consertava, e ninguém recarrega um app em que tocou." E a divisão de trabalho: "a tela que escreveu já chama `refresh()`; isto é para as telas que não escreveram e estão velhas de qualquer jeito, que são a maioria delas."

#### O que a tela recebe

```ts
return {
  data: settled.data,
  error: settled.error,
  loading: settled.key !== asked,
  refresh: () => setTick((t) => t + 1),
};
```

(`src/data/useQuery.ts:86-91`.) `refresh` incrementa `tick`, o que muda `asked`, o que dispara o efeito — o mesmo caminho do foco.

#### Uso real

**34 chamadas** de `useQuery` nas telas de `app/` (contagem por `grep -o "useQuery[<(]"` em `app/`). Três padrões observados:

- **Sem chave** — a pergunta não varia: `useQuery(() => listOrders(LOCAL_COMPANY_ID))` (`app/orders/index.tsx:68`), `useQuery(() => alertSettings())` (`app/inputs/index.tsx:99`), `useQuery<boolean>(() => ordersNeedApproval())` (`app/settings.tsx:243`).
- **Com chave derivada de um filtro** — `useQuery(() => listItems(LOCAL_COMPANY_ID, undefined, false, place ?? undefined), place ?? '')` (`app/inputs/index.tsx:100-103`): trocar o lugar refaz a pergunta.
- **Várias por tela, cada uma com o seu pedaço** — a capa tem quatro (`app/(tabs)/index.tsx:113`, `:282`, `:327`), e `app/inputs/index.tsx` tem quatro (`:97`, `:99`, `:100`, `:117`). Como o SQLite é uma conexão única, essas consultas **serializam** — o que é exatamente o custo que o índice da V17 mede: "a capa dispara cinco delas de uma vez — numa conexão só, que serializa" (`src/data/db.test.ts:116-117`).

Um agregado por tela costuma ser um único `useQuery<Loaded>(async () => { ... })` que faz vários `await` e devolve um objeto — por exemplo `app/production/new.tsx:125`, `app/catalog.tsx:75`, `app/lots/[id].tsx:94`.

**Estado: implementado e chamado por tela**, em 34 pontos. Não há teste unitário dedicado a `useQuery.ts` — nenhum arquivo `useQuery.test.ts` existe em `src/data/`.

---

### 10.9 Lacunas e estados, explicitados

| coisa | estado |
|---|---|
| `migrate` / `db()` / PRAGMAS | implementado, caminho de produção, exercitado por `db.test.ts` e `schema.test.ts` |
| tabelas V1..V17 | implementadas; todas alcançadas por `enqueue` ou por leitura de tela, exceto `app_meta` (gaveta) e `item_cost_history` (derivado) |
| `production_runs` | implementada e chamada por `app/production/new.tsx`; **deliberadamente nunca enfileirada** |
| `outbox` + `enqueue` + `pendingEntries` + `markSent` + `pendingCount` | implementados; `enqueue` chamado em 21 pontos de `repository.ts` |
| `forgetOrphans` | implementado, chamador de produção único: `eraseArea` (`src/data/repository.ts:3496`) |
| `forgetSentBefore` | implementado, **sem chamador fora de teste**; nada agenda a limpeza; nenhuma janela de retenção existe como constante |
| `drain` / `Transport` / `backoffMs` (`src/sync/engine.ts`) | implementados, **sem chamador de produção**; nenhum `Transport` real existe |
| `serialize` (`src/sync/serialize.ts`) | implementado, usado em produção por **nada**; usado por `scripts/device-session.ts` (verificação) e pelos testes |
| interface de fila / indicador "N pendentes" | **NÃO IMPLEMENTADO** — nenhuma chave de i18n sobre fila ou sincronização existe |
| coluna de tentativas / último erro na `outbox` | **NÃO ESTÁ NO CÓDIGO** |
| detecção de banco de versão futura (downgrade) | **NÃO IMPLEMENTADO** |
| guard automático contra editar passo V1..V17 já embarcado | **NÃO IMPLEMENTADO** (`97-migration-edited.sh` só olha diretórios de migração; `50-coupled-files.sh` está sem configuração) |
| FK de `movements.lot_id` → `lots(id)` no aparelho | **ausente por limitação do SQLite**, dito no código (`src/data/db.ts:494-498`); quem recusa lote fantasma é o servidor |
| `company_id` como FK local | **NÃO EXISTE** tabela de empresas no aparelho |
| teste dedicado a `useQuery.ts` | **NÃO EXISTE** |
