## 4. O livro-razão: movimentos, saldos, estorno e cobertura

### 4.1 A regra central, e como ela é imposta

Não existe coluna de saldo em nenhuma tabela dos dois bancos. Saldo é
`SUM(quantity_base_units)` sobre a tabela `movements`, agrupado por empresa, item
e local (`supabase/migrations/0001_foundation.sql:253-260`).

O docblock do módulo enumera o que essa decisão compra de graça
(`src/domain/ledger.ts:1-15`), e vale transcrever porque é a justificativa
inteira:

- histórico e auditoria — o log **é** o banco;
- correção por estorno em vez de exclusão, então nada é falsificado;
- relatórios que não podem discordar do histórico, porque vêm dele;
- sincronização offline sem conflito: acréscimos são comutativos e o id é gerado
  no aparelho, então repetir a fila duas vezes é inofensivo;
- a capacidade de responder "o que estava dentro do freezer às 03:12?" — que é
  como uma excursão de temperatura lista os lotes expostos sem ninguém ter
  anotado nada.

**A imutabilidade é do banco, não da convenção.** No servidor existe uma função
que só sabe levantar exceção e um gatilho que a chama antes de todo UPDATE e
todo DELETE (`supabase/migrations/0001_foundation.sql:234-247`). A mensagem
exata, em inglês no código:

```
The ledger is append-only. Correct a movement by inserting a reversal,
which keeps the original visible and the history honest.
```

O gatilho é `movements_are_immutable`, declarado
`before update or delete on movements for each row`
(`supabase/migrations/0001_foundation.sql:245-247`).

**O que acontece se alguém tentar corrigir por exclusão.** O `DELETE` levanta a
exceção acima e a transação inteira aborta — não sobra linha pela metade. Isso é
verificado contra um Postgres descartável na checagem 1 da `db:verify`, que
tenta um `update movements set quantity_base_units = 99999` e um
`delete from movements`, exige que os dois falhem, e depois confere que o saldo
da view continua em 4800 (`scripts/verify-migrations.sh:99-107`). Além do
gatilho, a fila do aparelho sobe `movements` com `ON CONFLICT DO NOTHING` e a
tabela **não tem política de UPDATE** — um movimento que chega duas vezes não faz
nada na segunda (`supabase/migrations/0015_the_phone_will_send_it_twice.sql:25-28`,
`scripts/verify-migrations.sh:448-452` e `505-513`).

**A tentação tem nome, e existe um guarda contra o nome.** O projeto já enviou
uma coluna proibida: `item_costs.on_hand_base_units`, um inteiro atualizado no
lugar por cada compra, que existiu por meses com toda a suíte verde porque *a
aritmética estava certa* (`src/data/db.ts:186-203`,
`src/data/schema.test.ts:6-22`). O guarda é uma checagem de **nome de coluna**,
deliberadamente burra:

```ts
function looksLikeStoredStock(column: string): boolean {
  return /(^|_)(on_hand|current_stock|stock_level|estoque_atual|quantity_on_hand|saldo_atual)/i.test(
    column,
  );
}
```

(`src/data/schema.test.ts:31-35`). Ele roda contra o esquema migrado do aparelho
inteiro (`src/data/schema.test.ts:76-99`) e tem teste positivo e negativo:
reconhece `on_hand_base_units`, `estoque_atual` e `current_stock`, e deixa
`quantity_base_units`, `purchase_to_base` e `total_cents` em paz
(`src/data/schema.test.ts:62-74`). O mesmo predicado roda no servidor, por
`information_schema.columns` (`scripts/verify-migrations.sh:107-120`). A razão de
ser um teste de nome está escrita: *"o erro se anuncia no nome toda vez, porque
quem escreve a coluna está descrevendo exatamente o que ela é"*
(`src/data/schema.test.ts:19-21`).

O `app_meta` (chave/valor do aparelho) carrega o aviso irmão: cabe preferência e
cache, não cabe nada que alguém vá somar, porque chave/valor é exatamente o
formato em que um `estoque_atual` renasceria sem gatilho, sem histórico e sem
ninguém notando (`src/data/meta.ts:3-14`).

---

### 4.2 A tabela `movements` no servidor — todos os campos

Definição original em `supabase/migrations/0001_foundation.sql:181-224`, alterada
depois pelas migrações 0008, 0013, 0014, 0016 e 0029. Estado final:

| coluna | tipo | nulo? | origem | o que é |
|---|---|---|---|---|
| `id` | `uuid` | PK | 0001:183 | Gerado **no aparelho**, para que repetir a fila offline seja inofensivo (`0001:182`) |
| `company_id` | `uuid not null` | não | 0001:184 | Referencia `companies(id) on delete cascade` |
| `kind` | `movement_kind not null` | não | 0001:186 | Um dos dez valores do enum (§4.5) |
| `occurred_at` | `timestamptz not null` | não | 0001:189 | **Quando aconteceu no mundo**, não quando chegou ao servidor (`0001:187-188`) |
| `recorded_at` | `timestamptz not null default now()` | não | 0001:190 | Quando foi gravado |
| `recorded_by` | `uuid not null references auth.users(id)` | não | 0001:191 | Qual CONTA escreveu. Imposto pela política: `recorded_by = auth.uid()` (`0001:314`) |
| `item_id` | `uuid not null` | não | 0001:193 | `references items(id) on delete restrict` |
| `quantity_base_units` | `bigint not null` | não | 0001:195 | **Sempre a menor unidade, assinada: negativo sai, positivo entra** (`0001:194`) |
| `location_id` | `uuid not null` | não | 0001:197 | `references locations(id) on delete restrict` |
| `counterpart_location_id` | `uuid` | sim | 0001:198 | O outro lado de uma transferência. **Explicação, nunca aritmética** |
| `lot_id` | `uuid` | sim | 0001:200 | `references lots(id) on delete restrict` |
| `post` | `control_post` | sim | 0001:201 | Em qual dos quatro postos de controle a linha foi escrita |
| `loss_reason` | `loss_reason` | sim | 0001:202 | Obrigatório quando `kind = 'loss'` |
| `unit_cost_rate` | `double precision` | sim | 0008:79 | Custo congelado, **taxa fracionária** por unidade-base |
| `unit_price_rate` | `double precision` | sim | 0008:80 | Preço de venda congelado, taxa fracionária |
| `reverses_movement_id` | `uuid references movements(id)` | sim | 0001:209 | Preenchido quando esta linha cancela outra |
| `assistant_phrase` | `text` | sim | 0001:214 | A frase que a pessoa digitou, quando o assistente redigiu o movimento |
| `note` | `text` | sim | 0001:216 | Observação livre |
| `device_id` | `uuid references devices(id) on delete restrict` | sim | 0013:63-64 | De qual aparelho cadastrado o movimento veio |
| `operator_id` | `uuid references memberships(id) on delete restrict` | sim | 0014:20-21 | **Quem estava com o aparelho na hora** — pergunta diferente de `recorded_by` |

**As colunas que foram REMOVIDAS, e por quê.** `unit_cost_cents bigint` e
`unit_price_cents bigint` existiram na 0001 (`0001:206-207`) e foram derrubadas
na 0008 (`0008:76-77`). O motivo está escrito na própria migração: um saco de
açúcar a R$ 118 por 25 kg é **0,472 centavo por grama**, que como `bigint` é
zero — todo insumo barato congelaria custo nenhum, e o relatório de margem em
cima disso pareceria plausível (`0008:57-70`). A tabela estava vazia em todo
ambiente, então as colunas foram substituídas em vez de sombreadas: *"uma coluna
errada deixada ao lado de uma certa é a armadilha que pôs um total mutável de
estoque no aparelho, para começar"* (`0008:67-69`).

**`recorded_by` e `operator_id` são duas perguntas.** A decisão está escrita na
0014: `recorded_by` é **qual conta escreveu** e o servidor impõe
`recorded_by = auth.uid()` desde a fundação — ninguém assina no nome de ninguém,
nem o dono; `operator_id` é **quem estava com o aparelho na hora**, escolhido na
lista de gente da empresa no momento do registro
(`supabase/migrations/0014_who_was_holding_it.sql:8-19`). Uma coluna respondendo
as duas foi um erro que custou uma rodada, e a V4 do aparelho o cometeu antes de
a V5 desfazer (`src/data/db.ts:306-324`). O comentário oficial da coluna:

> `Quem estava operando quando a linha foi escrita. Diferente de recorded_by, que é a conta que escreveu e não pode ser cedida a ninguém.`

(`supabase/migrations/0014_who_was_holding_it.sql:29-31`)

**O aparelho responde por "onde"; a pessoa é opcional.** `devices` é tabela com
`responsible_id` apontando para `memberships` (`on delete set null`, para o
aparelho continuar existindo sem dono quando a pessoa sai) e `location_id` para
pré-preencher o movimento (`supabase/migrations/0013_the_device_is_accountable.sql:18-40`).
Se os relatórios nomeiam quem gravou é configuração da empresa:
`companies.names_who_recorded boolean not null default false`
(`supabase/migrations/0012_who_or_where.sql:20-21`), com o comentário:
`'Se os relatórios operacionais mostram quem registrou. O ledger sempre grava; isto decide se a tela conta. Padrão falso: localizar a perda, não acusar.'`
(`0012:23-25`).

---

### 4.3 A tabela `movements` no aparelho (SQLite)

O aparelho espelha o servidor em vez de inventar um segundo formato, porque a
sincronização é o replay append-only das mesmas linhas
(`src/data/db.ts:1-14`). Duas diferenças deliberadas: **sem RLS** (o aparelho
guarda os dados de um usuário só) e **taxas em `REAL`, valores em `INTEGER`**
(`src/data/db.ts:9-13`).

Criada na V3 (`src/data/db.ts:216-280`):

```sql
CREATE TABLE IF NOT EXISTS movements (
  id                   TEXT PRIMARY KEY,
  company_id           TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  occurred_at          TEXT NOT NULL,
  recorded_at          TEXT NOT NULL,
  item_id              TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity_base_units  INTEGER NOT NULL,
  location_id          TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  lot_id               TEXT,
  loss_reason          TEXT,
  unit_cost_rate       REAL,
  reverses_movement_id TEXT REFERENCES movements(id) DEFERRABLE INITIALLY DEFERRED,
  assistant_phrase     TEXT,
  note                 TEXT
);
```

(`src/data/db.ts:225-249`)

O `DEFERRABLE INITIALLY DEFERRED` de `reverses_movement_id` é deliberado:
`RESTRICT` dispara linha por linha, então limpar a tabela tropeçaria nas próprias
linhas — o estorno ainda está lá quando o movimento que ele cancela sai. Checado
no commit, o par sai junto ou o apagamento todo rola para trás
(`src/data/db.ts:242-246`).

Colunas acrescentadas depois, cada uma numa migração própria e sempre aditiva:

| coluna | passo | arquivo:linha |
|---|---|---|
| `recorded_by TEXT` | V4 | `src/data/db.ts:302-304` |
| `operator_id TEXT` (+ `DROP COLUMN recorded_by`) | V5 | `src/data/db.ts:321-324` |
| `movement_group_id TEXT` | V6 | `src/data/db.ts:344` |
| `counterpart_location_id TEXT REFERENCES locations(id)` | V6 | `src/data/db.ts:345` |
| `post TEXT` | V7 | `src/data/db.ts:366` |

`recorded_by` saiu do aparelho porque lá ele nunca teve valor próprio: é sempre a
conta que sincroniza, e o serializador já sabe qual é
(`src/data/db.ts:318-320`). A lista de migrações é
`[V1..V17]` (`src/data/db.ts:676-678`) e a regra é imutável: **nunca editar um
passo que já subiu**, porque um celular que já rodou não roda de novo e os dois
divergem em silêncio (`src/data/db.ts:160-172`).

**O backfill da V3.** Um celular que já tinha notas tinha de sair da migração com
o mesmo saldo com que entrou. Cada `purchase_line` virou o movimento que sempre
foi, **mantendo o próprio id**, então rodar o passo duas vezes não dobra saldo
(`src/data/db.ts:197-200`, `266-277`). A taxa é a mesma aritmética de
`rateFromCents` — centavos sobre unidades-base, sem conversão e sem
arredondamento (`src/data/db.ts:271-276`).

**Pragmas.** `journal_mode = WAL` e `foreign_keys = ON`, aplicados na abertura e
nunca dentro de transação — o SQLite ignora o pragma com transação aberta, e toda
migração roda numa (`src/data/db.ts:24-27`, `18-23`).

`newId()` gera UUID v4 no cliente, hex a hex, exatamente para que a escrita
offline seja idempotente no replay (`src/data/db.ts:842-847`). `nowIso()` é
`new Date().toISOString()` (`src/data/db.ts:849-851`).

---

### 4.4 O tipo `Movement` em TypeScript

Declarado em `src/domain/ledger.ts:75-127`. Campos, na ordem do arquivo:

| campo | tipo | obrigatório | linha |
|---|---|---|---|
| `id` | `string` | sim | 77 |
| `companyId` | `string` | sim | 79 |
| `kind` | `MovementKind` | sim | 81 |
| `occurredAt` | `string` | sim | 83 |
| `recordedAt` | `string` | sim | 84 |
| `recordedBy` | `string` | sim | 85 |
| `itemId` | `string` | sim | 87 |
| `quantityBaseUnits` | `number` | sim | 89 |
| `locationId` | `string` | sim | 91 |
| `counterpartLocationId` | `string?` | não | 92 |
| `lotId` | `string?` | não | 94 |
| `post` | `ControlPost?` | não | 95 |
| `lossReason` | `LossReason?` | não | 96 |
| `unitCostRate` | `Rate?` | não | 114 |
| `reversesMovementId` | `string?` | não | 117 |
| `assistantPhrase` | `string?` | não | 124 |
| `note` | `string?` | não | 126 |

**Estado deste tipo: implementado, SEM chamador de produção.** O próprio arquivo
registra que nenhuma linha de código de produção importa o módulo, e que foi por
isso que o tipo ficou dias descrevendo um esquema que nenhum dos dois bancos
tinha — `unit_cost_cents` já tinha virado `unit_cost_rate` nos dois lados e o
tipo não seguiu (`src/domain/ledger.ts:110-113`). Ele **não tem** os campos
`deviceId`, `operatorId`, `movementGroupId` nem `unitPriceRate`, que existem nos
dois bancos: NÃO ESTÁ NO CÓDIGO.

O que é importado de `ledger.ts` por código de produção é só: o tipo `LossReason`
(`src/data/repository.ts:6`, `app/inputs/[id].tsx:43`), a função `daysOfCover`
(`src/data/repository.ts:4`), a constante `INTERNAL_PLACE_KINDS`
(`app/production/new.tsx:36`) e a função `receivesCargo`
(`app/places.tsx:34`, `app/orders/new.tsx:26`).

---

### 4.5 `movement_kind` — os dez valores, e o que cada um significa

Enum do servidor com nove valores na fundação
(`supabase/migrations/0001_foundation.sql:172-175`) e o décimo,
`purchase`, acrescentado na 0007 em migração própria — o Postgres acrescenta um
valor a um enum dentro de uma transação mas recusa **usá-lo** na mesma, e a
política do passo seguinte precisa nomeá-lo
(`supabase/migrations/0007_movement_kind_purchase.sql:13-16`). A união
TypeScript espelha os dez (`src/domain/ledger.ts:19-29`).

| valor | glosa do código | capacidade exigida no servidor | escritor no aparelho | palavra da tela (pt-BR) |
|---|---|---|---|---|
| `purchase` | *arrived from a supplier against an invoice* (`ledger.ts:20`) | `check_receipt` (`0008:30`) | `recordPurchase` (`repository.ts:402-423`) | "Compra" (`pt-BR.ts:1119`) |
| `production` | *finished goods created* (`ledger.ts:21`) | `record_production` (`0008:31`) | `recordProduction`, via `write(...)` (`repository.ts:1524-1554`, `1606`) | "Produção" (`pt-BR.ts:1120`) |
| `consumption` | *inputs drawn by a production run* (`ledger.ts:22`) | `record_production` (`0008:32`) | `recordProduction`, uma linha por insumo (`repository.ts:1607-1609`) | "Consumo" (`pt-BR.ts:1121`) |
| `transfer` | *moved between locations (own store: not revenue)* (`ledger.ts:23`) | `dispatch` (`0008:33`) | `recordTransfer` → `moveBetween(..., 'transfer')` (`repository.ts:1749-1754`) | "Transferência" (`pt-BR.ts:1122`) |
| `sale` | *sold to a customer (revenue + margin)* (`ledger.ts:24`) | `dispatch` (`0008:34`) | **NENHUM** — nada escreve `sale` | "Venda" (`pt-BR.ts:1123`) |
| `loss` | *melted, broken, expired, courtesy, internal use* (`ledger.ts:25`) | `record_loss` (`0008:35`) | `recordLoss` (`repository.ts:2133-2160`) | "Perda" (`pt-BR.ts:1124`) |
| `return` | *came back from a route or a store* (`ledger.ts:26`) | `check_receipt` (`0008:36`) | `recordReturn` → `moveBetween(..., 'return')` (`repository.ts:1767-1772`) | "Devolução" (`pt-BR.ts:1125`) |
| `adjustment` | *physical count correction* (`ledger.ts:27`) | `adjust_stock` (`0008:38`) | `recordCount` (`repository.ts:945-968`) | "Contagem" (`pt-BR.ts:1126`) |
| `discrepancy` | *difference found at a control post* (`ledger.ts:28`) | `check_receipt` (`0008:37`) | `recordCheck` (`repository.ts:2492-2511`) | "Diferença na conferência" (`pt-BR.ts:1127`) |
| `reversal` | *cancels an earlier movement, never deletes it* (`ledger.ts:29`) | `adjust_stock` (`0008:39`) | `reverseGroup` (`repository.ts:4479-4503`) | "Correção" (`pt-BR.ts:1128`) |

**`sale` é o único tipo sem escritor.** Uma busca por `'sale'` em
`src/data/repository.ts`, nas telas de `app/` e no domínio não encontra nenhuma
escrita — só a declaração do enum e a palavra do dicionário. Loja própria é
`transfer`, não venda: *"não há faturamento nem margem aqui, e o valor apenas
muda de sala"* (`src/data/repository.ts:1641-1643`). Faturamento para cliente:
NÃO IMPLEMENTADO.

**A política de escrita é um CASE sem ELSE, e isso é deliberado.** Um tipo que
não está listado avalia para `NULL` e a escrita é recusada — *"um movimento em que
ninguém pensou não pode ser gravável"*
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:8-14`, política em
`0008:26-41`). O efeito colateral é que acrescentar um valor ao enum sem
acrescentar a linha na política dá ao aplicativo uma palavra que o banco ignora
em silêncio.

**Como isso é conferido nos dois sentidos.** Um teste extrai os tipos que o
aparelho realmente escreve, por regex sobre
`INSERT INTO movements ... VALUES (?, ?, '<kind>'`, e exige que cada um exista no
enum do servidor — lido do arquivo, não listado no teste, para que um tipo novo
seja conferido sem ninguém lembrar
(`src/sync/agreement.test.ts:146-165`). Os literais que o regex encontra hoje
são exatamente cinco: `adjustment`, `discrepancy`, `loss`, `purchase`,
`reversal`; `production`, `consumption`, `transfer` e `return` entram por
parâmetro `kind` (`repository.ts:1536`, `1717`), fora do alcance do regex.

---

### 4.6 `location_kind` — os seis valores

`create type location_kind as enum ('factory', 'cold_room', 'store_room', 'own_store', 'customer', 'vehicle');`
(`supabase/migrations/0001_foundation.sql:109`)

| valor | palavra da tela (pt-BR) | sala nossa? | recebe carga? |
|---|---|---|---|
| `factory` | "Fábrica" (`pt-BR.ts:723`) | sim | não |
| `cold_room` | "Câmara fria" (`pt-BR.ts:721`) | sim | não |
| `store_room` | "Almoxarifado" (`pt-BR.ts:720`) | sim | não |
| `own_store` | "Loja própria" (`pt-BR.ts:722`) | não | sim |
| `customer` | "Cliente" (`pt-BR.ts:724`) | não | sim |
| `vehicle` | "Veículo" (`pt-BR.ts:725`) | não | não |

As duas réguas moram no domínio, e o docblock explica por que uma só:

```ts
export const INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room'] as const;

/** Quem RECEBE carga: loja própria e cliente. O resto é sala interna ou caminho. */
export function receivesCargo(kind: string): boolean {
  return kind === 'own_store' || kind === 'customer';
}
```

(`src/domain/ledger.ts:68-73`)

O predicado estava escrito **três vezes** — o tom e o ícone da linha em
`app/places.tsx`, quem pode ser destino de um pedido em `app/orders/new.tsx`, e a
conta de quanto dá para prometer, em SQL. Três grafias de uma regra é a forma que
produz divergência, e esta em particular decide se um pedido pode ser aceito:
divergir é prometer o que não existe (`src/domain/ledger.ts:56-67`).

**`vehicle` está deliberadamente fora dos dois lados:** caminhão é caminho, não é
sala nem destino; mercadoria em cima dele não está para carregar nem chegou a
ninguém (`src/domain/ledger.ts:63-66`).

O SQL não pode importar a constante — interpolar valor em SQL é padrão marcado
pela proofgate — então a régua é lida dos dois lados e comparada por um teste que
casa `l.kind IN (...)` no repositório contra `INTERNAL_PLACE_KINDS`
(`src/layers.test.ts:370-399`). A ocorrência hoje é uma:
`AND l.kind IN ('factory', 'cold_room', 'store_room')`
(`src/data/repository.ts:4167`).

O lugar padrão da empresa nasce como `store_room`, com nome vazio
(`src/data/repository.ts:854-857`; a mesma semente na V3,
`src/data/db.ts:262-264`). O nome fica vazio de propósito: o aplicativo põe toda
palavra que alguém lê no dicionário, e um padrão que sai em um idioma seria a
única string escapada — lugar sem nome quer dizer "o único lugar", e a interface é
que o nomeia (`src/data/db.ts:258-261`).

Um teste do aparelho confere que o `kind` que ele cria existe no enum do
servidor, e nomeia o defeito exato que o replay pegou: `storeroom` contra
`store_room` — a fila para num buraco de chave estrangeira, e aquela linha
travaria toda escrita atrás dela (`src/sync/agreement.test.ts:219-236`).

---

### 4.7 `loss_reason` e `control_post`

```sql
create type loss_reason  as enum ('melted', 'broken', 'expired', 'courtesy', 'internal_use');
create type control_post as enum ('picked', 'loaded', 'delivered', 'checked');
```

(`supabase/migrations/0001_foundation.sql:177` e `179`)

```ts
export type LossReason = 'melted' | 'broken' | 'expired' | 'courtesy' | 'internal_use';
export type ControlPost = 'picked' | 'loaded' | 'delivered' | 'checked';
```

(`src/domain/ledger.ts:46` e `53`)

| `loss_reason` | palavra da tela (pt-BR) |
|---|---|
| `melted` | "Derreteu" (`pt-BR.ts:1103`) |
| `broken` | "Quebrou" (`pt-BR.ts:1104`) |
| `expired` | "Venceu" (`pt-BR.ts:1105`) |
| `courtesy` | "Cortesia" (`pt-BR.ts:1106`) |
| `internal_use` | "Consumo interno" (`pt-BR.ts:1107`) |

A tela de insumo oferece as cinco nesta ordem, com `expired` como padrão:
`const REASONS: LossReason[] = ['expired', 'melted', 'broken', 'courtesy', 'internal_use'];`
(`app/inputs/[id].tsx:839`, estado inicial em `app/inputs/[id].tsx:127`). O texto
de produto quando falta motivo:
`'Diga o que aconteceu — isso protege o relatório de todo mundo.'`
(`src/i18n/locales/pt-BR.ts:1108`).

**A cicatriz da grafia.** O aparelho escreveu `internalUse` em camelCase por
meses. O SQLite teria aceitado (a coluna é `TEXT`), a fila teria enfileirado, e o
Postgres recusaria a linha sem ninguém olhando. Consertar custou nada porque
nenhuma perda jamais foi gravada — *que é a única janela em que o vocabulário de
um livro-razão é livre para mudar* (`src/domain/ledger.ts:35-45`). O guarda que
nasceu disso lê a união do `ledger.ts` por regex e a compara com o enum do
servidor (`src/sync/agreement.test.ts:193-217`).

**Motivo é obrigatório, por restrição:**
`constraint loss_needs_reason check (kind <> 'loss' or loss_reason is not null)`
(`supabase/migrations/0001_foundation.sql:220-221`). A justificativa escrita: uma
perda sem motivo vira "quebra inexplicada", e o relatório perde credibilidade com
a equipe — *"o banco recusa deixar isso acontecer"* (`0001:218-219`).

**Dos quatro postos, só `checked` tem escritor.** `recordCheck` grava
`post = 'checked'` (`src/data/repository.ts:2496`), e `unchecked` e
`shipmentsOn` leem por `c.post = 'checked'`
(`src/data/repository.ts:2540`, `3326`). `picked`, `loaded` e `delivered`:
NÃO IMPLEMENTADOS — o enum tem a palavra, ninguém escreve. A coluna `post` chegou
ao aparelho só na V7, e a migração diz por que só então: *"coluna sem escritor é a
doença que este repositório já documentou"* (`src/data/db.ts:348-354`).

---

### 4.8 Restrições e índices

**Restrições de conteúdo, na ordem em que a história delas aconteceu:**

1. `check (quantity_base_units <> 0)`, nomeada
   `movements_quantity_base_units_check` pelo Postgres
   (`supabase/migrations/0001_foundation.sql:195`). Derrubada na 0008
   (`0008:52`) porque **recusava a contagem que bateu**: uma contagem física é
   gravada como a diferença entre a prateleira e o razão, e o resultado mais
   valioso é diferença zero — alguém andou até o almoxarifado e os livros
   estavam certos. Recusar isso deixa uma prateleira que ninguém conferiu há
   meses indistinguível de uma verificada hoje de manhã (`0008:43-51`).
2. `constraint movement_moved_something check (quantity_base_units <> 0 or kind = 'adjustment')`
   (`supabase/migrations/0008_ledger_speaks_phase_one.sql:54-55`). Derrubada na
   0017 (`0017:19`).
3. Versão final, e a que vale:

```sql
alter table movements add constraint movement_moved_something
  check (
    quantity_base_units <> 0
    or kind = 'adjustment'
    or (kind = 'discrepancy' and post is not null)
  );
```

(`supabase/migrations/0017_a_check_that_matched_is_a_fact.sql:21-26`)

A terceira cláusula existe para a conferência que bateu, e é mais estreita que a
do `adjustment` de propósito: **só quando a linha diz em que posto aconteceu**.
Diferença de zero sem posto continua sendo ruído e continua recusada
(`0017:15-18`). Sem ela, "a Loja Norte ainda não conferiu" seria impossível de
distinguir de "a Loja Norte conferiu e estava tudo certo" (`0017:8-13`). Um teste
lê a **última** definição do arquivo (a 0017 derruba e recria) e exige a cláusula
`kind = 'discrepancy' and post is not null`, e no outro sentido exige que o
aparelho escreva o par (`src/sync/agreement.test.ts:167-191`).

4. `constraint reversal_points_somewhere check (kind <> 'reversal' or reverses_movement_id is not null)`
   (`supabase/migrations/0001_foundation.sql:222-223`).
5. Três chaves estrangeiras **compostas**, acrescentadas na 0029:

```sql
foreign key (item_id, company_id)                references items     (id, company_id)
foreign key (location_id, company_id)            references locations (id, company_id)
foreign key (counterpart_location_id, company_id) references locations (id, company_id)
```

(`supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql:29-46`)

O defeito que elas fecham: a política perguntava se a pessoa pode gravar **naquela
empresa** e ninguém perguntava se o item é **daquela empresa**. Um operador cuja
única associação era a empresa A conseguia inserir no razão de A um movimento
apontando para o item e o almoxarifado da empresa B — e o razão é append-only, a
linha não sai nunca mais (`0029:1-11`). Não era preciso adivinhar id nenhum:
`ensureLocation` cria o lugar padrão com `id = company_id`, então o id do
almoxarifado de B **é** o id de B (`0029:13-15`). A contraparte é anulável e a
chave composta respeita isso — em Postgres, `MATCH SIMPLE` (o padrão) não verifica
chave multicoluna com qualquer coluna nula (`0029:39-42`).

**`lots` fica de fora, e está escrito para não ser redescoberto:** ele não tem
`unique (id, company_id)`, então a chave composta pediria índice novo; o risco lá
é menor porque o lote não entra em soma de saldo nenhuma, é identidade.
`movements.lot_id` **ainda é chave simples** (`0029:22-27`).

**Índices no servidor:**

| índice | definição | origem |
|---|---|---|
| `movements_balance_idx` | `(company_id, item_id, location_id, occurred_at)` | `0001:226-227` |
| `movements_lot_idx` | `(company_id, lot_id) where lot_id is not null` | `0001:228-229` |
| `movements_assistant_idx` | `(company_id, recorded_at) where assistant_phrase is not null` | `0001:230-231` |
| `movements_device_idx` | `(company_id, device_id) where device_id is not null` | `0013:66-67` |
| `movements_operator_idx` | `(company_id, operator_id) where operator_id is not null` | `0014:26-27` |
| `movements_group_idx` | `(company_id, movement_group_id) where movement_group_id is not null` | `0016:30-31` |
| `movements_reversal_idx` | `(reverses_movement_id, company_id) where reverses_movement_id is not null` | `0028:29-31` |

**Índices no aparelho:** `movements_balance_idx`
(`(company_id, item_id, location_id, occurred_at)`, `src/data/db.ts:251-252`),
`movements_group_idx` (V7, `src/data/db.ts:368-370`) e `movements_reversal_idx`
(V17, `src/data/db.ts:670-674`).

**O índice de estorno é uma medição, não um palpite.** A cláusula `NAO_ESTORNADO`
(§4.11) é subconsulta correlacionada: para **cada** linha candidata ela pergunta
se existe um movimento que a estorna. Sem índice em `reverses_movement_id` o
plano do SQLite diz `SCAN rev` — varredura completa de `movements` — uma vez por
linha. Contra um SQLite real de **60 mil movimentos** (cinco meses de uma fábrica
de seis lojas), janela de sete dias, **2.779 linhas candidatas**:

| cenário | tempo |
|---|---|
| com a cláusula, sem índice | **9.906 ms** |
| sem a cláusula | 3 ms |
| com a cláusula e o índice | 4 ms |

(`src/data/db.ts:645-668`, mesmos números em
`supabase/migrations/0028_the_index_under_what_was_reversed.sql:9-13` e
`src/data/db.test.ts:104-125`). Oito consultas do aplicativo usam a cláusula, e a
capa dispara cinco de uma vez, numa conexão só, que serializa
(`src/data/db.ts:651-653`). O índice é **parcial** porque estorno é raro por
natureza (`src/data/db.ts:662-664`). O teste que protege isso **não mede tempo** —
tempo varia com a máquina e viraria teste instável: ele lê o **plano de execução**
com `EXPLAIN QUERY PLAN` e reprova em `SCAN rev`
(`src/data/db.test.ts:118-140`). Nada mais no projeto olha plano de consulta, e é
por isso que isso passou dois meses invisível: a barra inteira exercita 96
movimentos (`src/data/db.test.ts:122-124`). No servidor, `concurrently` **não** é
usado de propósito: a migração roda em transação pelo `supabase db push`, e
`create index concurrently` é recusado dentro de uma
(`supabase/migrations/0028_the_index_under_what_was_reversed.sql:24-27`).

**RLS e vistas.** `alter table movements enable row level security`
(`0001:271`); leitura por `company_id in (select current_companies())`
(`0001:306-307`); escrita pela política `movements_append` do §4.5. A view
`movements_visible` (`security_invoker = true`) é por onde o dado sai, e ela
**filtra custo na consulta**:

```sql
case when private.has_capability(m.company_id, 'view_cost')
     then m.unit_cost_rate end as unit_cost_rate,
case when private.has_capability(m.company_id, 'view_sale_price')
     then m.unit_price_rate end as unit_price_rate
```

(`supabase/migrations/0008_ledger_speaks_phase_one.sql:82-92`; versão original com
as colunas em centavos em `0001:329-339`). A `db:verify` prova o efeito: o dono lê
`unit_cost_rate`, o operador lê `null` na mesma linha, e continua vendo as quatro
linhas dele (`scripts/verify-migrations.sh:275-284`).

---

### 4.9 `movement_group_id` — o ato e suas linhas

```sql
alter table movements add column movement_group_id uuid;
create index movements_group_idx on movements (company_id, movement_group_id)
  where movement_group_id is not null;
comment on column movements.movement_group_id is
  'As linhas de um mesmo ato: as sete de uma corrida de produção, as duas de '
  'uma transferência. Nulo quando o ato tem uma linha só.';
```

(`supabase/migrations/0016_the_act_and_its_lines.sql:27-34`)

**Por que um ato tem várias linhas.** Uma corrida de produção não é um movimento:
é sete. Uma que faz 500 picolés consumindo seis insumos escreve um `production`
positivo e seis `consumption` negativos, porque `movements` tem **um** `item_id` e
uma quantidade assinada, e `stock_balances` é
`sum(...) group by company_id, item_id, location_id`. Sete itens numa linha só
exigiriam um leitor que abre um payload, e o saldo deixaria de ser uma soma
(`supabase/migrations/0016_the_act_and_its_lines.sql:3-8`).

Uma transferência é duas: saída negativa na origem, entrada positiva no destino.
Com uma linha só o destino não existiria em consulta nenhuma — fechar o saldo
exigiria um UNION trocando `location_id` por `counterpart_location_id` e
invertendo o sinal, **em cada lugar que soma**, que é o caso especial que esta
fundação existe para não ter (`0016:10-14`,
`src/data/repository.ts:1634-1639`).

**Sem o elo,** "explique este número" seis meses depois vira arqueologia por
horário, e o estorno de uma corrida inteira não tem como se dizer atômico. Com
ele, `where movement_group_id = ?` devolve o ato completo (`0016:16-18`).

**Uma coluna genérica e não uma por tipo de evento**, porque o truque que o
projeto já usa — a linha de nota e o movimento dela compartilhando o mesmo id,
porque são um fato visto duas vezes — é 1:1 e não estica para sete linhas
(`0016:20-22`). Nula nas linhas antigas, aditiva, sem backfill — que seria
impossível de qualquer jeito, porque o gatilho recusa UPDATE (`0016:24-26`).

**Qual id vira o grupo, ato por ato:**

| ato | linhas | `movement_group_id` | fonte |
|---|---|---|---|
| Compra | 1 `purchase` | **o id da NOTA** (`purchases.id`), não o da linha | `repository.ts:420`, justificado em `416-419` |
| Contagem | 1 `adjustment` | **o id da própria linha** | `repository.ts:964`, justificado em `959-963` |
| Perda | 1 `loss` | **o id da própria linha** | `repository.ts:2152`, justificado em `2148-2151` |
| Produção | 1 `production` + N `consumption` | `newId()` novo, ou o `runId` quando fecha um tacho | `repository.ts:1384`, `2360-2361` |
| Transferência / devolução | 2 pernas | `newId()` novo, o mesmo nas duas | `repository.ts:1705`, `1729` |
| Conferência | 1 `discrepancy` por item | **o grupo da remessa conferida** | `repository.ts:2507` |
| Estorno | 1 por linha original | `newGroup = newId()`, **novo**, comum às pernas do estorno | `repository.ts:4452`, `4497` |

O grupo da compra é a nota e não a linha porque *"desfazer uma nota desfaz as
linhas dela"*: hoje entra uma linha por chamada e os dois dariam no mesmo, mas no
dia em que a nota tiver duas, o grupo por linha desfaria metade de uma nota — que
é a coisa que o estorno por ato existe para não deixar acontecer
(`src/data/repository.ts:416-419`). Um teste afirma exatamente isso:
`assert.notEqual(nota.groupId, nota.id, 'o grupo da compra é a nota, não a linha')`
(`src/data/repository.test.ts:193-195`).

Contagem e perda têm o grupo igual à própria linha porque **sem grupo elas não
têm como ser desfeitas**: `planReversal` procura pelo grupo, e o que não tem grupo
não existe para ele. A fundação diz que se corrige por estorno, nunca por
exclusão — sem isso não havia nem uma coisa nem outra, e um zero digitado com o
dedo torto ficava no razão para sempre
(`src/data/repository.ts:959-963`, e para a perda `2148-2151`). O teste afirma
`contagem.groupId === contagem.id` com o comentário *"ato de uma perna: o grupo é
a própria linha"* (`src/data/repository.test.ts:242`).

Fechar um tacho usa o **id da corrida** como grupo: a linha de
`production_runs` some da tabela, mas o nome dela fica no livro-razão, e é por ele
que se volta (`src/data/repository.ts:2357-2362`).

`MovementRow.groupId` é `string | null`, e nulo tem significado de tela definido:
*"esta linha não tem como ser desfeita, e é melhor não oferecer do que oferecer e
falhar"* (`src/data/repository.ts:489-497`).

O grupo viaja na sincronização: `movement_group_id` e
`counterpart_location_id` estão explicitamente na lista fechada de colunas de
`movements` que o serializador envia, e a lista é fechada de propósito **para que
coluna nova não vire falha silenciosa** (`src/sync/serialize.ts:342-347`, lista
completa em `317-355`).

---

### 4.10 Como se calcula saldo

A aritmética é uma só, aplicada por eixos diferentes. No servidor, uma view:

```sql
create view stock_balances as
  select company_id, item_id, location_id, sum(quantity_base_units) as base_units
  from movements
  group by company_id, item_id, location_id;
```

(`supabase/migrations/0001_foundation.sql:253-260`). O comentário diz por que uma
view e não duas consultas: *"esta view é a única fonte que as telas e o assistente
leem — dois consumidores, uma verdade. Um assistente com o próprio SQL acabaria
relatando um número diferente do da tela, e o aplicativo perderia a credibilidade
num único dia"* (`0001:249-252`).

No aparelho, o saldo não é view: é a mesma soma escrita em SQL em cada consulta
que precisa dela. As oito somas:

| função | eixo | SQL | linha |
|---|---|---|---|
| `listItems` | total por item, sala opcional | `(SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m WHERE m.company_id = i.company_id AND m.item_id = i.id AND (? IS NULL OR m.location_id = ?))` | `repository.ts:171-174` |
| `balanceByLocation` | um item, por lugar | `SUM(m.quantity_base_units) ... GROUP BY m.location_id, l.name, l.kind` | `repository.ts:548-553` |
| `stockByPlace` | todo item, por lugar, com valor | `SUM(m.quantity_base_units) ... HAVING SUM(m.quantity_base_units) <> 0` | `repository.ts:793-805` |
| `recordPurchase` | um item, empresa toda (para a média) | `SELECT COALESCE(SUM(quantity_base_units), 0) ... WHERE company_id = ? AND item_id = ?` | `repository.ts:344-348` |
| `recordCount` | um item, **uma sala** | idem `+ AND location_id = ?` | `repository.ts:923-927` |
| `recordProduction` (piso) | todos os itens de **uma sala** | `COALESCE(SUM(m.quantity_base_units), 0) AS on_hand ... GROUP BY m.item_id, i.name` | `repository.ts:1437-1444` |
| `recordLoss` (piso) | um item, **uma sala** | `COALESCE(SUM(quantity_base_units), 0) AS on_hand` | `repository.ts:2111-2116` |
| `runningOut` | saldo e saída por item, sala opcional | duas subconsultas correlacionadas | `repository.ts:3815-3823` |
| `planReversal` | item × lugar, para todas as pernas | `SUM(quantity_base_units) AS held ... GROUP BY item_id, location_id` | `repository.ts:4288-4296` |
| `stockAgainstOrders` | um item, **só as salas nossas** | `... AND l.kind IN ('factory', 'cold_room', 'store_room')` | `repository.ts:4163-4167` |

**`balanceByLocation`** é declarada como a mesma aritmética da view do servidor,
de propósito, *"as duas pontas respondem 'quanto tem aqui' pela mesma soma, que é
o que a checagem 6 da `db:verify` compara"*
(`src/data/repository.ts:521-536`). Local vira `GROUP BY`, **nunca um `WHERE`
obrigatório**: a tela que quer o total não passa a precisar saber de lugar nenhum
(`repository.ts:530-531`). E ela devolve os lugares que **têm movimento**, não
todos os cadastrados: um lugar onde nunca entrou nada *"não tem saldo zero, não
tem saldo"* — e a diferença importa numa tela, porque "0 kg" convida a conferir e
uma ausência não (`repository.ts:533-535`). Tipo devolvido:
`LocationBalance = { locationId, locationName, kind, baseUnits }`
(`repository.ts:513-519`).

**`stockByPlace`** é a mesma soma sem o `WHERE` do item — *"ter duas aritméticas
seria ter duas verdades"* (`repository.ts:769-775`) — e descarta linha de saldo
zero com `HAVING`, porque um item que entrou e saiu inteiro não está ali
(`repository.ts:777-779`, `803`). O valor é `cents((rate ?? 0) * base_units)`,
**arredondado aqui e só aqui** (`repository.ts:821-822`), e o total do lugar soma
os valores já arredondados (`repository.ts:830`).

**O lugar padrão.** `defaultLocationId(companyId)` devolve o próprio
`companyId` (`repository.ts:843-845`) — determinístico, então dois celulares que
criam o padrão no mesmo minuto criam uma linha, não duas
(`repository.ts:508-511`, `src/data/db.ts:255-257`). `ensureLocation` insere a
linha se ela não existe e **a enfileira na hora**, porque ela tem de chegar ao
servidor antes do movimento que se apoia nela, senão a primeira sincronização
falha numa chave estrangeira que ninguém sabia que faltava
(`repository.ts:847-865`, comentário em `859-861`).

**Renomear lugar é seguro sem cerimônia**, e o motivo é a fundação: nenhum
movimento carrega o nome do lugar, carrega o id — trocar "Loja Centro" por "Loja
da Praça" não move um centavo (`repository.ts:622-628`; teste
`src/data/repository.test.ts:2156`).

**A `db:verify` compara as duas implementações.** O saldo do servidor é a soma do
livro-razão calculada por ele, não enviada, e é conferida contra o número do
aparelho: `select coalesce(sum(quantity_base_units), 0) from movements where item_id = '$SUGAR'`
contra `DEVICE_SUGAR_BALANCE` (`scripts/verify-migrations.sh:515-521`). A média
móvel também, e é *"a única checagem do projeto que compara duas implementações
independentes da mesma regra"* (`scripts/verify-migrations.sh:523-530`).

**Reenviar a fila não pode mover saldo.** A `db:verify` sobe a mesma fila duas
vezes: *"o livro-razão tem de se comportar diferente do resto: `movements` sobe
com DO NOTHING, então a segunda passagem não pode mexer em nenhum movimento. Se o
saldo mudar aqui, o ledger virou mutável sem ninguém notar"*
(`scripts/verify-migrations.sh:505-513`).

---

### 4.11 `NAO_ESTORNADO` — "o que foi estornado não aconteceu"

```ts
const NAO_ESTORNADO = `NOT EXISTS (SELECT 1 FROM movements rev
                                    WHERE rev.reverses_movement_id = m.id
                                      AND rev.company_id = m.company_id)`;
```

(`src/data/repository.ts:750-752`)

O docblock é a explicação inteira: as duas linhas continuam no livro-razão, e é
isso que a fundação exige — nada é apagado, o histórico responde por si. Mas
"quanto saiu do tacho hoje" é outra pergunta, e uma corrida corrigida responde
zero a ela. **Sem este pedaço, o estorno acerta o SALDO (que é soma pura e não
olha `kind`) e deixa todas as telas de "o que aconteceu" dizendo o número velho:
o almoxarifado certo e a produção mentindo, no mesmo aplicativo**
(`src/data/repository.ts:735-743`).

É **constante e não função de apelido** porque as oito consultas chamam a tabela
de `m`, e montar SQL por interpolação — mesmo com um apelido que nunca veio de
fora — é o padrão que a proofgate marca, com razão; consulta que precisar de outro
apelido escreve a sua, à vista (`src/data/repository.ts:745-748`).

As consultas que usam a cláusula:

| consulta | linha |
|---|---|
| `lastSentBaseUnits` | `repository.ts:728` |
| `lossesOn` | `repository.ts:2213` |
| `unchecked` | `repository.ts:2535` |
| `productionOn` | `repository.ts:2588` |
| `productionBetween` | `repository.ts:2623` |
| `lotsOn` | `repository.ts:2694` |
| `recentRuns` | `repository.ts:2922` |
| `shipmentsOn` | `repository.ts:3336` |
| `recomputeItemCost` | `repository.ts:4375` |

Duas consultas fazem a pergunta inversa — "esta linha já foi estornada?" — como
`EXISTS` correlacionado em vez da constante, porque o resultado é uma coluna e não
um filtro: `itemMovements` (`repository.ts:1017-1018`, devolvido como
`reversed: r.reversed === 1`, `repository.ts:1035`) e `planReversal`
(`repository.ts:4257-4258`).

O teste que fecha o buraco está escrito com a cicatriz inteira: estornar uma
corrida e depois exigir que `productionOn` devolva zero para aquele item, *"senão
o almoxarifado fica certo e a capa mente"* — e a mutação que tira o filtro
atravessou a suíte inteira até a oficina do `mutate` voltar a rodar de verdade
(`src/data/repository.test.ts:3095-3112`). Para a perda, o mesmo:
`assert.deepEqual(perdas, [], 'perda desfeita não aparece no relatório')`
(`src/data/repository.test.ts:264-267`).

---

### 4.12 O mecanismo de estorno

Três funções, nesta ordem: `planReversal` (diz o que faria), `reverseGroup`
(escreve), `recomputeItemCost` (recompõe o dinheiro).

#### `planReversal(companyId, groupId): Promise<ReversalPlan>`

`src/data/repository.ts:4245-4314`. Existe **separada da escrita por razão de tom
de voz, não de arquitetura**: a confirmação do aplicativo diz o que vai acontecer
com os números por extenso, e para dizer isso a tela precisa da conta antes do
ato. A checagem roda de novo dentro da transação de `reverseGroup` — *"esta aqui é
para falar, aquela é para valer"* (`repository.ts:4236-4243`).

Tipos:

```ts
export type ReversalLeg = {
  itemId: string;
  name: string;
  /** Assinada, na unidade-base: o CONTRÁRIO do que o movimento original fez. */
  baseUnits: number;
  baseUnit: string;
  locationId: string;
};

export type ReversalPlan = {
  groupId: string;
  legs: ReversalLeg[];
  blocked: { itemId: string; name: string; held: number; needed: number; baseUnit: string }[];
  alreadyReversed: boolean;
};
```

(`repository.ts:4193-4216`)

Passos:

1. Lê as pernas do grupo com `kind <> 'reversal'`, ordenadas por
   `quantity_base_units DESC`, cada uma já carregando o `EXISTS` de "foi
   estornada?" (`repository.ts:4256-4264`). Grupo inexistente levanta
   `Error(\`grupo ${groupId} não existe\`)` (`repository.ts:4266`).
2. Monta as pernas com o **sinal invertido**: `baseUnits: -l.quantity_base_units`
   (`repository.ts:4273`).
3. `alreadyReversed = legs.some((l) => l.reversed === 1)`
   (`repository.ts:4278`).
4. Uma consulta só devolve o saldo `item × lugar` de todos os itens do grupo, com
   a mesma soma de `balanceByLocation` — *"duas aritméticas para 'quanto tem aqui'
   seriam duas verdades"* (`repository.ts:4285-4296`).
5. Para cada perna **negativa**, se `tem + leg.baseUnits < 0`, entra em `blocked`
   com `held` e `needed` (`repository.ts:4299-4311`). O motivo: *"o que o estorno
   TIRA precisa estar lá. Uma corrida cujos picolés já viajaram para a loja não
   volta atrás sozinha: o conserto passa a ser trazer a carga de volta primeiro, e
   é isso que a tela vai dizer"* (`repository.ts:4281-4283`). E o comentário do
   tipo: *"saldo negativo é uma mentira que o livro-razão não desfaz depois"*
   (`repository.ts:4206-4212`).

`CannotReverseError` carrega o **plano inteiro** porque a Lei 5 pede que o erro
impeça e mostre a saída no mesmo gesto: a tela precisa dizer QUAL item já saiu e
quanto, não "não foi possível" (`repository.ts:4218-4234`). As duas mensagens:

- `` `grupo ${plan.groupId} já foi estornado` ``
- `` `estorno de ${plan.groupId} deixaria saldo negativo` ``

(`repository.ts:4228-4230`)

#### `reverseGroup(companyId, { groupId, occurredAt?, note? })`

`src/data/repository.ts:4442-4525`. Devolve
`{ groupId: string; legs: ReversalLeg[] }`, onde `groupId` é o **grupo novo**.

O docblock diz o que a função é: *"é a primeira fundação deste projeto virando
código. O livro-razão é append-only por gatilho no banco, e a promessa que vem
junto é que existe conserto: uma corrida lançada com 500 onde eram 50 se corrige
por estorno, nunca por exclusão. Até aqui a promessa era só metade — esquema,
restrição, política de capacidade e o construtor de `src/domain/ledger.ts`
existiam sem um único escritor, e o operador que não consegue consertar aprende a
não registrar"* (`repository.ts:4420-4429`).

Comportamento:

1. `planReversal` fora da transação; se `alreadyReversed` ou `blocked.length > 0`,
   levanta `CannotReverseError` (`repository.ts:4447-4448`).
2. `newGroup = newId()` (`repository.ts:4452`).
3. Dentro da transação, **`planReversal` de novo**: *"entre planejar e gravar cabe
   uma remessa de outro aparelho, e é exatamente o intervalo em que um saldo deixa
   de existir"* (`repository.ts:4455-4459`).
4. Lê as originais do grupo (`kind <> 'reversal'`) com id, item, quantidade,
   local, taxa, lote e contraparte (`repository.ts:4461-4475`).
5. Para **cada** original escreve uma linha `'reversal'`, com:
   `quantity_base_units = -o.quantity_base_units`;
   `unit_cost_rate = o.unit_cost_rate` (a taxa do original, congelada);
   `movement_group_id = newGroup`; `counterpart_location_id`, `lot_id` e
   `location_id` copiados; `reverses_movement_id = o.id`; e a nota do chamador
   (`repository.ts:4479-4503`). A taxa é a do original *"porque o estorno desfaz o
   que aconteceu pelo valor com que aconteceu. Ler a média de hoje avaliaria o
   erro de setembro ao preço de outubro"* (`repository.ts:4491-4493`).
6. Cada linha é enfileirada para o servidor (`repository.ts:4504`).
7. **Fora da transação**, chama `recomputeItemCost` uma vez por item distinto do
   plano (`repository.ts:4520-4522`). Fora de propósito: a recomposição lê o razão
   inteiro do item e precisa **enxergar as pernas do estorno que acabaram de ser
   escritas**; se falhar ali, o razão já está certo — que é o que a fundação
   protege — e a média é cache, recomposta pela próxima entrada daquele item
   (`repository.ts:4516-4519`).

**Estorna o ATO, pelo grupo, e não uma linha.** Uma corrida são sete movimentos
amarrados por `movement_group_id`; desfazer só a linha da produção deixaria
picolés que não consumiram nada — *"pior que o erro original porque parece certo"*
(`repository.ts:4431-4435`).

**O lote continua existindo.** Ele é identidade, não quantidade: o saldo dele vai
a zero pelo movimento, e apagar a linha seria a exclusão que a fundação proíbe —
além de quebrar o rastro de uma etiqueta que talvez já esteja colada numa caixa
(`repository.ts:4437-4440`; teste em `src/data/repository.test.ts:3090-3093`).

#### `recomputeItemCost(companyId, itemId): Promise<Rate>`

`src/data/repository.ts:4344-4418`. Chamador único: `reverseGroup`
(`repository.ts:4521`). Sem chamador de tela.

A cicatriz que a criou: `reverseGroup` devolvia a quantidade e **deixava o
dinheiro**. Quem digitasse 50 onde saíram 500 corrigia o estoque e ficava com o
custo dez vezes alto embaixo de todo número de dinheiro do aplicativo — "dinheiro
parado" na capa, o valor de cada lugar, o valor da carga que chega na loja. E a
confirmação do estorno diz *"os dois lançamentos ficam no histórico — nada é
apagado"*, então a pessoa entende, com razão, que o erro foi desfeito
(`repository.ts:4316-4324`).

**Não dá para "desmisturar" uma média móvel**: ela é dependente do caminho — a
ordem das entradas decide o resultado, e não existe operação inversa. O que dá é
**replicar o caminho inteiro do zero**, que é a mesma coisa que a primeira
fundação já diz do saldo: saldo é a soma dos movimentos, média é a dobra deles.
`item_costs` passa a ser **cache de uma conta que sempre pode ser refeita**, em
vez de um número que só sabe andar para a frente
(`repository.ts:4326-4332`).

A regra da dobra, lida dos dois escritores existentes e não inventada: **entrada
com taxa mistura; qualquer outra coisa só move a quantidade.** Uma saída não mexe
na média (ela leva unidades ao preço médio do momento), e uma perna de estorno é
uma saída — quantidade negativa — então ela desfaz o efeito da entrada que
corrigiu sem precisar de aritmética inversa (`repository.ts:4334-4338`).

A consulta:

```sql
SELECT m.quantity_base_units, m.unit_cost_rate
  FROM movements m
 WHERE m.company_id = ? AND m.item_id = ?
   AND m.kind <> 'reversal'
   AND <NAO_ESTORNADO>
 ORDER BY m.occurred_at, m.recorded_at, m.id
```

(`repository.ts:4370-4378`)

Três coisas na cláusula, e cada uma tem razão escrita:

- `kind <> 'reversal'` e `NAO_ESTORNADO` juntos: *"o que foi estornado NÃO
  ACONTECEU — e a média é uma pergunta sobre o que aconteceu"*. Tratar a perna de
  estorno como saída comum é o que um sistema contábil faz com devolução, e é
  consistente com média móvel — **mas deixa o erro dentro para sempre**: 500
  picolés a 64,99 mais 50 a 614 dá 114,08, e tirar os 50 depois devolve a
  quantidade e mantém os 114,08 (`repository.ts:4352-4365`).
- A ordem desempata **pelo instante em que o aparelho soube** (`recorded_at`) e
  depois pelo `id`, senão duas entradas no mesmo momento fariam a média depender
  de qual linha o SQLite devolveu primeiro (`repository.ts:4367-4369`).

A dobra em si: linha com `quantity_base_units > 0` **e** `unit_cost_rate` não
nulo chama `blendRate` e atualiza `ultima`; qualquer outra só soma quantidade
(`repository.ts:4380-4395`). Depois grava `item_costs` por
`INSERT ... ON CONFLICT(item_id) DO UPDATE` (`repository.ts:4398-4406`) e, **se o
número mudou** (`Math.abs(anterior - novo) > 1e-12`), escreve uma linha em
`item_cost_history` — porque *"mudança calada de custo é a pior: ela reaparece
semanas depois como margem errada, sem nada que a explique"*
(`repository.ts:4340-4342`, `4409-4415`).

#### O que os testes provam sobre estorno

| teste | o que afirma | linha |
|---|---|---|
| `an invoice typed wrong can be undone, and takes the average back with it` | quantidade volta a 100.000 g **e** a média volta ao valor anterior; grupo da compra ≠ id da linha; segunda tentativa rejeitada | `repository.test.ts:165-214` |
| `a count and a loss can each be undone, and the balance comes back` | contagem e perda são atos de uma perna, grupo = id da linha; `lossesOn` para de contar a perda desfeita | `repository.test.ts:223-268` |
| `reversing a run puts back every leg of it, and leaves both records standing` | produto volta ao saldo anterior, insumo volta inteiro, lote sobrevive, `productionOn` passa a devolver 0 | `repository.test.ts:3041-3113` |
| `a run whose product already shipped cannot be reversed, and the refusal names what left` | `blocked.length === 1`, `held = 100`, `needed = 500`, erro carrega o plano, nada escrito pela metade | `repository.test.ts:3115-3159` |
| `reversing twice would double the correction, so the second time is refused` | `alreadyReversed === true`, saldo não se move na segunda | `repository.test.ts:3161-3191` |
| `reversing a run gives the money back, not only the quantity` | segunda corrida com um décimo das unidades envenena a média; estorno devolve a média a menos de 1e-9 do valor anterior; histórico ganha ≥ 3 linhas | `repository.test.ts:3248-3300` |

---

### 4.13 `daysOfCover` — a única conta que sobrou no módulo

```ts
export function daysOfCover(baseUnits: number, dailyOutflow: number): number | null {
  if (dailyOutflow <= 0) return null;
  return baseUnits / dailyOutflow;
}
```

(`src/domain/ledger.ts:172-175`)

Existe porque *"'Morango: 4 dias' diz ao dono para produzir; 'Morango: 70.000 g'
não diz, e essa diferença é o ponto inteiro do briefing"*
(`src/domain/ledger.ts:168-171`, e o mesmo argumento no teste,
`src/domain/ledger.test.ts:16-17`). Saída zero ou negativa **não é "dias
infinitos" e não é zero: é insondável**, e dizer isso vale mais que imprimir um
número sem significado (`src/domain/ledger.test.ts:20-21`).

O teste inteiro são três asserções: `daysOfCover(70_000, 10_000) === 7`,
`daysOfCover(70_000, 0) === null`, `daysOfCover(70_000, -5) === null`
(`src/domain/ledger.test.ts:15-24`).

**Chamador único, e é de dado, não de tela:** `runningOut`
(`src/data/repository.ts:3843`, importado em `repository.ts:4`).

`runningOut(companyId, fromIso, toIso, days, horizon = 7, locationId?, kinds = ['input','packaging'])`
(`src/data/repository.ts:3790-3855`) devolve
`Running = { itemId, name, baseUnit, onHandBaseUnits, dailyOutflow, daysLeft }`
(`repository.ts:3766-3773`). A conta:

- `on_hand` = soma de todos os movimentos daquele item, filtrada por sala quando
  há sala (`repository.ts:3816-3818`);
- `out_units` = `-SUM(quantity_base_units)` **só das linhas negativas** dentro da
  janela `occurred_at >= ? AND occurred_at < ?` (`repository.ts:3819-3823`);
- `dailyOutflow = out_units / days` (`repository.ts:3842`);
- `daysLeft = daysOfCover(on_hand, dailyOutflow)`, e a linha é **descartada** se
  `daysLeft === null` ou `daysLeft > horizon` (`repository.ts:3843-3844`);
- resultado ordenado por `daysLeft` crescente (`repository.ts:3854`).

Por que o consumo sai do razão e não de uma estimativa cadastrada: *"é a diferença
entre um alerta que a fábrica reconhece e um que ela aprende a ignorar: o número
vem do que ela fez, e por isso o `[por quê?]` é possível"*
(`repository.ts:3777-3781`). Insumo parado não aparece — sem saída não há data de
acabar, e inventar uma seria o alerta inventado que o briefing proíbe
(`repository.ts:3783-3784`). Embalagem entra junto com insumo porque *"uma fábrica
parada por falta de palito está tão parada quanto uma sem morango"*
(`repository.ts:3786-3788`).

Chamadores de tela de `runningOut`: `app/(tabs)/index.tsx:168` (horizonte
padrão) e `app/(tabs)/index.tsx:175` (com `Number.POSITIVE_INFINITY`, para
listar tudo), `app/(tabs)/reports.tsx:80`, `app/inputs/index.tsx:120`.

---

### 4.14 As quatro dobras que existiram e morreram — inclusive `balanceAt`

**`balanceAt` NÃO ESTÁ NO CÓDIGO ATUAL.** O módulo exportava quatro dobras sobre
`Movement[]` — `balanceOf`, `balanceAt`, `lotsPresentDuring` e `buildReversal` — e
todas foram removidas. O motivo está escrito em
`src/domain/ledger.ts:129-166` e não é esquecimento: **o aplicativo nunca tem os
movimentos em memória.** Ele tem SQLite, e cada uma dessas perguntas já é
respondida em SQL, onde os dados estão. Carregar anos de movimento num celular
para dobrar em memória seria a forma errada mesmo se alguém quisesse
(`ledger.ts:132-139`).

O código histórico, recuperado do commit `66ad137` ("Phase 0: foundation for the
production and distribution system") para que o dossiê não deixe a lacuna:

```ts
export type Balance = { itemId: string; locationId: string; baseUnits: number };

const key = (itemId: string, locationId: string) => `${itemId} ${locationId}`;

/** Balance is a fold over movements. Reversals are applied as ordinary
 *  negations so a reversed movement stays visible in the history while
 *  dropping out of the total. */
export function balanceOf(movements: readonly Movement[]): Balance[] { /* soma por itemId+locationId */ }

/** Balance as it stood at a moment in time - the query behind cold-chain
 *  forensics and any "as of" report. */
export function balanceAt(movements: readonly Movement[], instant: Date): Balance[] {
  const cutoff = instant.getTime();
  return balanceOf(movements.filter((m) => new Date(m.occurredAt).getTime() <= cutoff));
}

/** Which lots sat in a location during a window. */
export function lotsPresentDuring(
  movements: readonly Movement[], locationId: string, from: Date, to: Date,
): string[] { /* entra se positivo e at <= to; sai se negativo e at < from */ }

/** Builds the movement that cancels another one. */
export function buildReversal(
  original: Movement, by: { id: string; movementId: string; at: string },
): Movement {
  return { ...original, id: by.movementId, kind: 'reversal',
           quantityBaseUnits: -original.quantityBaseUnits,
           reversesMovementId: original.id,
           recordedBy: by.id, recordedAt: by.at, occurredAt: by.at };
}
```

(commit `66ad137`, `src/domain/ledger.ts:86-166` naquela revisão)

**Onde cada uma vive hoje** (`src/domain/ledger.ts:134-139`):

| dobra morta | quem responde a pergunta agora |
|---|---|
| `balanceOf` | `stockByPlace`, `balanceByLocation`, `listItems` (§4.10) |
| `balanceAt` | `lotsInRoomAt`, com `occurred_at <= ?` (`repository.ts:3077-3111`) |
| `lotsPresentDuring` | `lotsInStock` e `lotsInRoomAt` (`repository.ts:3017-3111`) |
| `buildReversal` | `reverseGroup`, que nega a quantidade na própria instrução (`repository.ts:4479-4503`) |

**`buildReversal` era o caso mais caro: dois autores para o que é um estorno**, um
em TypeScript que ninguém roda e um em SQL que roda — a mesma doença que a média
derivada já teve aqui, e a mutação da suíte protege o que roda
(`src/domain/ledger.ts:141-144`).

**A resposta anterior ao mesmo achado foi escrever teste para elas**, e os testes
eram bons e não tornaram nada alcançável: *"tornaram a morte mais difícil de ver —
e uma mutação curada chegou a prometer que quebrá-las faria 'a excursão de
temperatura acusar o lote errado', numa tela que não existe"*
(`src/domain/ledger.ts:145-148`). O `ledger.test.ts` registra a mesma coisa no
próprio corpo (`src/domain/ledger.test.ts:5-13`), e o gerador de mutações tem a
nota `// A mutação do balanceAt saiu com a função.` (`scripts/mutate.mjs:656`).

**A pergunta "o que estava dentro da câmara às 03:12?" passou a ter resposta no
commit seguinte** — e não pela dobra que morreu. `lotsInRoomAt` é SQL com
`occurred_at <= ?`, ao lado das outras somas de saldo, e a tela do lugar lista os
lotes que estavam lá no instante DAQUELA leitura quando ela sai da faixa
(`src/domain/ledger.ts:154-158`; a consulta em `repository.ts:3090-3102`; o
chamador em `app/places.tsx:485`).

O último parágrafo do docblock é uma retratação deliberadamente preservada: ele
dizia "continua sem tela" e mandava ler o `docs/roadmap.md` **um commit depois de
a coisa existir**, e fica registrado em vez de apagado porque é a família de erro
que dominou o dia — texto ao lado do código descrevendo um estado que o código não
tem mais (`src/domain/ledger.ts:160-165`).

O que fica no módulo é o que trabalha: o **vocabulário** (que
`src/sync/agreement.test.ts` confere nos dois sentidos contra o esquema do
servidor e o do aparelho) e a aritmética pura que não toca dado, `daysOfCover`
(`src/domain/ledger.ts:150-152`).

---

### 4.15 Série temporal: `src/domain/spark.ts`

Geometria pura, sem tela. Existe separada do componente pelo mesmo motivo que
`qrPath`: **desenho se confere com aritmética, animação não.** Um caminho que sai
da caixa, uma curva que estoura para cima num pico, uma série de um ponto só que
virava `NaN` no `d` e apagava o cartão inteiro — tudo isso é teste de unidade, e
nenhum apareceria numa suíte que só checa se o componente renderiza
(`src/domain/spark.ts:1-8`).

```ts
export type Point = { x: number; y: number };
```

(`src/domain/spark.ts:16`)

#### `sparkPoints(values, width, height, padding = 2): Point[]`

`src/domain/spark.ts:29-57`.

- `values.length === 0` → `[]` (`spark.ts:35`).
- `top = padding`; `bottom = Math.max(padding, height - padding)`;
  `usable = Math.max(0, bottom - top)` (`spark.ts:37-39`).
- Um ponto só → `[{ x: width / 2, y: top + usable / 2 }]` (`spark.ts:41-43`).
- Escala vertical: `low = min(values)`, `high = max(values)`, `span = high - low`
  (`spark.ts:45-47`).
- Para cada valor: `share = span === 0 ? 0.5 : (value - low) / span`;
  `x = (i / (values.length - 1)) * width`; `y = bottom - share * usable`
  (`spark.ts:49-55`). O comentário: *"Y cresce para baixo em SVG, então o maior
  valor fica no topo"* (`spark.ts:53`).

Duas decisões de produto, escritas: **a escala é a da PRÓPRIA série, não uma
meta** — fábrica nenhuma tem meta cadastrada aqui, e inventar uma régua para o
desenho ficar bonito é número que ninguém pode conferir
(`spark.ts:20-23`). E **série constante desenha no meio**, não no chão nem no
teto: uma fábrica que faz 400 todo dia tem uma linha reta no meio da caixa, que é
a leitura certa — grudada embaixo, pareceria uma semana de fracasso
(`spark.ts:25-27`; teste exige `[15, 15, 15]` para `sparkPoints([400,400,400], 90, 30)`,
`src/domain/spark.test.ts:23-33`).

#### `sparkPath(points): string`

`src/domain/spark.ts:66-82`. Catmull-Rom convertido para Bézier cúbica — **a curva
que passa POR todos os pontos**. Uma Bézier de controle solto passa perto, e
"perto" numa linha de produção é um número que a tela mostra diferente do que o
banco guarda: o mesmo defeito de arredondar dinheiro cedo, agora em pixel
(`spark.ts:10-13`).

- Zero pontos → `''`; um ponto → `M x y` (`spark.ts:67-68`).
- Para cada segmento, com `p0 = points[i-1] ?? points[i]` e
  `p3 = points[i+2] ?? p2`:
  `c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }`,
  `c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }`
  (`spark.ts:71-79`).
- **A tensão de 1/6 é o Catmull-Rom uniforme**; mais que isso e a curva passa a
  inventar picos entre dois dias — *"a linha ficaria mais bonita e mentiria sobre
  um dia que não existiu"* (`spark.ts:61-64`).

#### `sparkArea(points, height): string`

`src/domain/spark.ts:85-91`. Menos de dois pontos → `''`. Com dois ou mais:
`${line} L ${last.x} ${height} L ${first.x} ${height} Z`.

#### `round(n)` (privada)

`Math.round(n * 100) / 100` — duas casas, porque *"mais que isso engorda o caminho
sem mudar um pixel na tela"* (`spark.ts:93-96`).

#### Chamador

**Um só, e é de tela:** `src/components/Sparkline.tsx:52-54` chama as três em
sequência (`sparkPoints(values, width, height, strokeWidth + 1)`, `sparkPath`,
`sparkArea`). O componente é explícito sobre a divisão: *"o caminho em si vem do
domínio, já conferido: aqui dentro não há aritmética de dado nenhuma"*
(`src/components/Sparkline.tsx:26-28`). A animação é `stroke-dasharray` com o
traço escondido e revelado por `dashoffset`, e respeita
`AccessibilityInfo.isReduceMotionEnabled()` — *"movimento que a pessoa pediu para
não existir não é charme, é desrespeito"*
(`src/components/Sparkline.tsx:30-31`, `65-80`).

O que os testes de `spark` afirmam: a linha fica dentro da caixa com as pontas
incluídas e o pico desenha acima do vale (`spark.test.ts:5-21`); semana plana no
meio (`spark.test.ts:23-33`); um ponto e nenhum não produzem `NaN` no `d` — *"um
`d` com NaN apaga o desenho inteiro sem erro nenhum no console"*
(`spark.test.ts:35-46`); e a curva passa por **todos** os pontos, cada um sendo
destino de um segmento, com a área fechando no chão (`spark.test.ts:48-67`).

---

### 4.16 O dia da fábrica: `src/domain/day.ts`

Um dia **não** são 24 horas a partir de agora: é meia-noite a meia-noite onde a
fábrica está. O relógio do aparelho está no fuso do operador e o razão guarda
instantes UTC, então a conversão tem de acontecer em algum lugar — e fazê-la na
tela, à mão, é como uma tela acaba discordando da seguinte sobre o que é "hoje"
(`src/domain/day.ts:1-9`).

```ts
export type DayWindow = { from: string; to: string };
```

(`src/domain/day.ts:14`)

**Semiaberta de propósito — `[from, to)`.** Dois dias consecutivos pedidos um
atrás do outro cobrem todo movimento **exatamente uma vez**, e uma corrida
exatamente à meia-noite cai em um deles, nunca nos dois
(`src/domain/day.ts:10-13`; a mesma regra repetida na consulta,
`src/data/repository.ts:2569-2572`; teste `a run exactly at midnight is counted once, not twice`,
`src/data/repository.test.ts:1944`).

#### `localDate(atIso, timeZone, days = 0): string`

`src/domain/day.ts:37-47`. Devolve a data de calendário local, `YYYY-MM-DD`.
Formata com `Intl.DateTimeFormat('en-CA', { timeZone, year, month, day })`,
divide, e reconstrói por `Date.UTC(y, m - 1, d + days)`.

Existe porque **o dia que um cliente combina NÃO é um instante**: o razão grava
instantes ("às 14h32 saíram 40 caixas") e um pedido "para quinta" não tem hora
nenhuma — é data de calendário, e tratá-la como instante desloca o dia inteiro em
metade dos fusos do mundo (`src/domain/day.ts:24-31`). **O atalho tentador é
`dayWindow(...).from.slice(0, 10)`, e ele está errado onde o fuso é positivo:** a
meia-noite local de 3 de setembro em Madri é 2 de setembro às 22h em UTC, e o corte
devolve o dia anterior (`src/domain/day.ts:32-35`). O teste prova os dois lados:
`dayWindow('2026-09-03T05:00:00Z', 'Europe/Madrid').from.slice(0,10) === '2026-09-02'`
contra `localDate(...) === '2026-09-03'` (`src/domain/day.test.ts:62-79`).

#### `dayWindow(atIso, timeZone, days = 0): DayWindow`

`src/domain/day.ts:49-68`. Pergunta ao `Intl` em que dia de calendário aquele
instante cai **lá**, em vez de fazer aritmética — *"que é o que torna isto correto
numa mudança de horário de verão, onde um 'dia' tem 23 ou 25 horas"*
(`src/domain/day.ts:52-54`). Devolve
`{ from: localMidnight(y, m-1, d+days, tz), to: localMidnight(y, m-1, d+days+1, tz) }`
(`src/domain/day.ts:64-67`). `dayWindow(now, tz, 0)` é hoje; `-7` é o mesmo dia da
semana uma semana atrás, *"que é a comparação que uma fábrica realmente faz:
segunda contra segunda, porque uma segunda e um sábado são negócios diferentes"*
(`src/domain/day.ts:16-22`).

#### `localMidnight(year, month, day, timeZone): string` (privada)

`src/domain/day.ts:83-90`. **Duas passagens**, e cada ponta mede o próprio
deslocamento. Não é preciosismo: no dia em que um fuso muda o relógio o dia tem
23 ou 25 horas, e um deslocamento aplicado às duas pontas põe a fronteira uma hora
dentro do dia vizinho — uma corrida gravada nessa hora seria contada duas vezes,
ou nenhuma (`src/domain/day.ts:70-81`). A segunda passagem lê o deslocamento na
resposta que a primeira deu, que é o lado certo de uma transição:
`new Date(second === first ? once : guess + second * 60_000).toISOString()`
(`src/domain/day.ts:89`).

#### `offsetMinutes(at, timeZone): number` (privada)

`src/domain/day.ts:93-109`. Quanto o fuso está longe de UTC naquele instante, em
minutos **a somar** a UTC. Formata com `en-US` `hour12: false` e reescreve por
regex `/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/` → `'$3-$1-$2T$4:$5:$6Z'`
(`src/domain/day.ts:94-107`).

#### `daysBetween(fromIso, toIso, timeZone): number`

`src/domain/day.ts:119-123`. Reduz **as duas pontas** à respectiva meia-noite
local e só então divide: `Math.round((to - from) / 86_400_000)`. **Não é
`(a - b) / 86_400_000`**: no dia em que um fuso muda o relógio essa divisão dá
0,96 de dia e arredonda para o número errado; assim "ontem" está a um dia de
distância tenha ontem tido 23, 24 ou 25 horas (`src/domain/day.ts:111-118`).
Testes: 12 dias em São Paulo, 8 dias atravessando a virada de Lisboa, e 0 para
horas diferentes do mesmo dia (`src/domain/day.test.ts:51-60`).

Chamador de tela: `src/home/Mosaic.tsx:664` (importado em `Mosaic.tsx:29`).

#### `dailySeries(events, timeZone, atIso, days): { date, total }[]`

`src/domain/day.ts:142-159`. Assinatura de entrada:
`readonly { occurredAt: string; baseUnits: number }[]`.

- Acumula por dia local: `localDate(event.occurredAt, timeZone)` como chave
  (`day.ts:148-152`).
- Emite os `days` dias do mais antigo ao mais novo, com
  `localDate(atIso, timeZone, -back)` e `totals.get(date) ?? 0`
  (`day.ts:154-158`).

Três decisões escritas: a capa precisa responder *"o que é normal aqui"* e não só
*"quanto foi hoje"* — sete colunas dizem isso sem uma frase, e quem produz de
segunda a sexta vê duas falhas no fim de semana e entende o próprio ritmo num
relance (`day.ts:127-132`). **O agrupamento é por dia LOCAL e por isso mora aqui,
não no SQL:** o SQLite do aparelho não sabe fuso — `substr(occurred_at, 1, 10)`
corta o dia em UTC, e um tacho fechado às 22h de Manaus entraria no dia seguinte
(`day.ts:133-137`). E **dias sem nada entram com zero em vez de sumirem**: uma
série que pula o dia parado desenha uma fábrica que trabalha todo dia, que é
justamente a mentira que a coluna vazia desmente (`day.ts:139-140`).

O par que alimenta isso: `productionBetween` devolve os fatos soltos com o
instante — irmã de `productionOn`, que devolve o total já somado —, porque sete
chamadas de `productionOn` responderiam a mesma pergunta com sete varreduras do
razão; e ela devolve **o instante, não o dia**, porque o dia depende do fuso e
*"quem fala em segunda-feira é a tela, com `dailySeries` no meio"*
(`src/data/repository.ts:2598-2608`). A ligação está em
`app/(tabs)/index.tsx:170` (`productionBetween`) e
`app/(tabs)/index.tsx:239` (`series: dailySeries(week, locale.timeZone, nowIso(), 7)`).

O teste de `dailySeries` monta uma segunda-feira em São Paulo com três produções —
10h, 17h e **22h**, esta última já terça em UTC — e afirma: sete colunas, a última
sendo hoje; as três de segunda somam 600 **inclusive a das 22h**; terça não herda
nada (com corte em UTC ela teria 100); e cinco dias com zero, porque *"o domingo
vazio é um fato sobre ela"* (`src/domain/day.test.ts:82-111`).

Outros testes de `day`: o dia começa à meia-noite onde a fábrica está, não em
Londres (`day.test.ts:8-13`); uma corrida às 23h50 local pertence ao dia em que
aconteceu (`day.test.ts:15-23`); ontem e hoje se encontram sem se sobrepor
(`day.test.ts:25-34`); a mesma segunda uma semana atrás está sete dias atrás, não
cinco (`day.test.ts:36-40`); e um fuso que muda o relógio ainda recebe dias
inteiros — Lisboa em 29/03/2026 tem janela de 23 horas
(`day.test.ts:42-49`).

---

### 4.17 As escritas de movimento, uma por uma

Todas em `src/data/repository.ts`. Todas dentro de
`conn.withTransactionAsync(...)`, e todas enfileiram a linha por
`enqueue(conn, [{ table: 'movements', rowId: id }])`.

| função | linhas | tipos escritos | piso de estoque | chamador de tela |
|---|---|---|---|---|
| `recordPurchase` | 296-466 | 1 × `purchase` | nenhum | `app/purchase.tsx:482`, `app/inputs/new.tsx:327` |
| `recordCount` | 886-978 | 1 × `adjustment` | nenhum (a diferença pode ser negativa) | `app/inputs/[id].tsx:306` |
| `recordProduction` | 1311-1619 | 1 × `production` + N × `consumption` | **sim, por SALA** | `app/production/new.tsx:324` |
| `recordTransfer` | 1749-1754 | 2 × `transfer` | nenhum | `app/transfer.tsx:226` |
| `recordReturn` | 1767-1772 | 2 × `return` | nenhum | `app/transfer.tsx:226` |
| `recordLoss` | 2089-2165 | 1 × `loss` | **sim, por SALA** | `app/inputs/[id].tsx:256` |
| `recordCheck` | 2436-2517 | 1 × `discrepancy` por item da remessa | nenhum | `app/(tabs)/transport.tsx:127` |
| `closeProductionRun` | 2365-2407 | delega a `recordProduction` | herdado | `app/production/new.tsx:321` (via `producedOn`) |
| `reverseGroup` | 4442-4525 | 1 × `reversal` por linha original | **sim, via `planReversal`** | `app/inputs/[id].tsx:393`, `app/lots/[id].tsx:134` |

**`recordCount`** aponta a decisão mais importante da contagem: ela **não
sobrescreve o saldo — nada aqui sobrescreve um saldo.** Ela acrescenta a diferença
como movimento próprio, então a prateleira e o razão passam a concordar deste
momento em diante **enquanto a discordância fica registrada** — *"é o que
transforma 'a gente vive perdendo açúcar' de sensação em pergunta que o dado pode
responder"* (`repository.ts:867-879`). `locationId` é **obrigatório e sem valor
padrão de propósito**: com um padrão, contar a câmara fria sem dizer compararia
contra o saldo inteiro da empresa e escreveria a diferença na câmara — estoque
teleportado entre salas por um operador que fez tudo certo. *"A regra deste
projeto é que o erro é impedido, não reclamado: o chamador diz onde, ou não
compila"* (`repository.ts:906-916`). `countedBaseUnits` é arredondado uma vez
(`Math.round`, `repository.ts:934`) e `delta = counted - expected`
(`repository.ts:936`). Devolve
`CountResult = { expectedBaseUnits, countedBaseUnits, deltaBaseUnits, deltaCents }`,
com `deltaCents = amountOf(averageRate, delta)`
(`repository.ts:470-478`, `972-977`).

**`recordProduction`** congela custo linha por linha, e é a razão de a corrida
existir como evento: no consumo, a média móvel do insumo **naquele instante**; na
produção, a soma exata dos consumos dividida pelas unidades que **de fato**
saíram, não pelo rendimento teórico. *"Se o tacho rendeu 480 onde a ficha prometia
500, congelar o teórico esconderia a perda que acabou de acontecer, e ela é
exatamente o número que o dono precisa ver"* (`repository.ts:1267-1272`). A
quantidade **arredonda uma vez** (`const quantity = Math.round(baseUnits)`,
`repository.ts:1406`) e antes do valor, porque *"o custo congelado é a aritmética
do que o livro-razão guarda, não de um consumo que ninguém gravou"*
(`repository.ts:1394-1405`). A taxa final é
`consumedValue / input.unitsProduced + product.unitPackagingCents`
(`repository.ts:1481`). **Só a linha de produção aponta para o lote novo** — o
lote do insumo é outro, o da nota em que ele entrou, e carimbar o lote do picolé
na saída da polpa faria o recall recolher o saco de açúcar
(`repository.ts:1600-1606`). O piso de estoque é da **sala** e não da empresa, e a
correção está documentada: somar todos os lugares e escrever o consumo em
`input.locationId` autorizava um tacho com o açúcar que está a dez quilômetros
dali (`repository.ts:1423-1436`). A guarda roda **antes** da escrita, *"então não
existe linha errada para alguém corrigir depois"*, e foi a simulação que encontrou
o buraco: catorze dias de fábrica levaram a polpa a **menos 192.000 g** sem uma
reclamação (`repository.ts:1412-1421`). Erro: `NotEnoughStockError`, com os itens
dentro para a tela poder dizer QUAIS faltaram (`repository.ts:1295-1309`).

**`moveBetween`** é a mecânica comum de transferência e devolução, e a separação
está justificada: a aritmética é a mesma — sai negativo de um lado, entra positivo
do outro, mesmo grupo, cada perna apontando para a outra — mas **o fato não pode
ser um só**. Gravar devolução como `transfer` deixava as duas iguais no razão, e
nenhum relatório conseguiria dizer *"a loja centro devolve 8% do que recebe"*
(`repository.ts:1665-1681`). Recusas: origem igual ao destino
(`'origem e destino são o mesmo lugar'`) e quantidade não positiva
(`'uma transferência move alguma coisa; para o sentido inverso, troque os lugares'`)
(`repository.ts:1688-1693`). **As duas pernas levam o lote** — só na de saída, o
lote sumiria do destino e *"o recall pararia na porta da fábrica"*
(`repository.ts:1730-1733`).

**`recordLoss`** escreve `-Math.round(input.baseUnits)` — o sinal é da função, o
chamador passa positivo (`repository.ts:2093`, `2144`) — e recusa perda de nada
(`'uma perda de nada não é uma perda'`, `repository.ts:2104`). A taxa é a média de
hoje, porque *"o relatório de perdas conta dinheiro, não só quantidade"*
(`repository.ts:2126-2129`).

**`recordCheck`** escreve **uma linha nova por item, nunca um carimbo na
remessa**, e o motivo não é preferência de desenho: o gatilho
`movements_are_immutable` recusa qualquer UPDATE em `movements`, sem exceção e sem
olhar coluna (`repository.ts:2417-2423`). Lê a remessa pelas **pernas de entrada**
(`quantity_base_units > 0`), que dizem destino, origem, o que foi mandado e a que
custo (`repository.ts:2462-2474`); remessa inexistente levanta
`` Error(`remessa ${groupId} não existe`) `` (`repository.ts:2476`). Sem a lista
`counted`, tudo bateu e cada perna vira diferença zero; **com** lista, item não
mencionado é item que a pessoa não conferiu — e não item que chegou zerado:
*"a ausência não vira acusação"* (`repository.ts:2441-2449`, `2483-2486`). A
diferença é `Math.round(said.baseUnits) - leg.quantity` (`repository.ts:2488`). A
taxa gravada é a **da perna de entrada da remessa**, não a média de hoje — *"ler o
custo atual avaliaria a falta de setembro ao preço de outubro"*
(`repository.ts:2432-2434`, `2506`).

**`closeProductionRun`** apaga a linha de `production_runs` **só depois** de o
razão aceitar: se a produção falhar por falta de insumo, a corrida continua aberta
e a pessoa pode lançar a compra e fechar de novo, em vez de perder o registro do
tacho que rodou (`repository.ts:2397-2404`). Fechar duas vezes por toque repetido
é impossível: a segunda não acha a corrida e levanta `RunGoneError` antes de
escrever qualquer coisa (`repository.ts:2362-2363`, `2384`).

**Uma corrida aberta não é fato do razão.** `production_runs` é a **primeira
tabela do aparelho que não espelha o servidor**, e a razão está escrita: uma
corrida aberta é a INTENÇÃO de um ato em curso, não um fato do negócio. O servidor
recebe o ato quando ele acontece — as N+1 linhas que o fechamento escreve, com o
id da corrida como `movement_group_id`. E é **por ser estado** que ela pode
existir: nenhum `movement_kind` novo, nenhuma coluna em `movements`, nenhuma linha
de razão antes do fechamento; se a forma estiver errada, apagar a tabela custa um
`DROP TABLE` e zero estorno (`src/data/db.ts:373-391`).

**Pedido também não é movimento**, e essa é a decisão que segura o resto: quando
um cliente liga, nada sai do freezer, e quem conferir a prateleira encontra tudo o
que o sistema disse que tem. Gravar demanda como movimento faria o saldo mentir no
dia da ligação — e como o razão é append-only, corrigir um pedido que mudou
exigiria estornar uma saída que nunca aconteceu. A ligação acontece uma vez só e
mais tarde: quando a carga sai, pela transferência
(`src/data/repository.ts:3857-3869`).

**`eraseArea` apaga movimentos, e isso não contradiz o append-only.** É o
apagamento de área pedido pelo dono, não correção de lançamento: a ordem das
tabelas começa por `movements` porque tudo aponta para lá
(`src/data/erase.ts:60`, `121`, `131`, `144`), a fila é limpa de órfãos antes
(`forgetOrphans`, `repository.ts:3496`) e o comando de apagar é enfileirado
**depois** dos deletes, porque apagar tudo limpa o `outbox` também — um comando
enfileirado antes se apagava a si mesmo, o aparelho saía vazio, o servidor nunca
soube, e o próximo pull restaurava exatamente o que a pessoa pediu para destruir
(`repository.ts:3498-3507`).

---

### 4.18 Estado de cada função: chamada por tela, só por teste, ou sem chamador

**Implementadas e chamadas por tela** (a tela citada é uma; várias têm mais):

| função | arquivo:linha da definição | chamador de tela |
|---|---|---|
| `daysOfCover` | `src/domain/ledger.ts:172` | indireto, via `runningOut` → `app/(tabs)/index.tsx:168` |
| `receivesCargo` | `src/domain/ledger.ts:71` | `app/places.tsx:146` e `189`, `app/orders/new.tsx:123` |
| `INTERNAL_PLACE_KINDS` | `src/domain/ledger.ts:68` | `app/production/new.tsx:217` |
| `sparkPoints` / `sparkPath` / `sparkArea` | `src/domain/spark.ts:29`, `66`, `85` | `src/components/Sparkline.tsx:52-54` |
| `dayWindow` | `src/domain/day.ts:49` | `app/(tabs)/index.tsx:117`, `production.tsx:82`, `reports.tsx:70`, `transport.tsx:62`, `app/inputs/index.tsx:118`, `app/losses.tsx:75`, `app/places.tsx:416`, `app/transfer.tsx:257`, `src/assistant/skills.ts:190`, `src/notify/facts.ts:29` |
| `localDate` | `src/domain/day.ts:37` | `app/(tabs)/index.tsx:130`, `app/orders/new.tsx:175`, `app/places.tsx:128`, `app/production/new.tsx:321`, `app/transfer.tsx:173`, `src/notify/facts.ts:31` |
| `daysBetween` | `src/domain/day.ts:119` | `src/home/Mosaic.tsx:664` |
| `dailySeries` | `src/domain/day.ts:142` | `app/(tabs)/index.tsx:239` |
| `balanceByLocation` | `repository.ts:537` | `app/inputs/[id].tsx:147` |
| `stockByPlace` | `repository.ts:781` | `app/places.tsx:109`, `app/(tabs)/reports.tsx:79`, `app/production/new.tsx:137`, `app/transfer.tsx:93` |
| `itemMovements` | `repository.ts:987` | `app/inputs/[id].tsx:146` |
| `lastSentBaseUnits` | `repository.ts:718` | `app/transfer.tsx:143` |
| `defaultLocationId` | `repository.ts:843` | usado por telas e testes; exposto para não obrigar cada tela a saber do detalhe (`repository.ts:836-842`) |
| `recordPurchase` | `repository.ts:296` | `app/purchase.tsx:482`, `app/inputs/new.tsx:327` |
| `recordCount` | `repository.ts:886` | `app/inputs/[id].tsx:306` |
| `recordProduction` | `repository.ts:1311` | `app/production/new.tsx:324` |
| `recordTransfer` / `recordReturn` | `repository.ts:1749`, `1767` | `app/transfer.tsx:226` |
| `recordLoss` | `repository.ts:2089` | `app/inputs/[id].tsx:256` |
| `recordCheck` | `repository.ts:2436` | `app/(tabs)/transport.tsx:127` |
| `closeProductionRun` | `repository.ts:2365` | `app/production/new.tsx:321` |
| `productionOn` | `repository.ts:2574` | `app/(tabs)/index.tsx:162`, `app/(tabs)/production.tsx:85` |
| `productionBetween` | `repository.ts:2610` | `app/(tabs)/index.tsx:170` |
| `lossesOn` | `repository.ts:2187` | `app/losses.tsx:80`, `app/(tabs)/index.tsx:184`, `app/(tabs)/reports.tsx:82` |
| `lotsOn` | `repository.ts:2673` | `app/(tabs)/production.tsx:88` |
| `recentRuns` | `repository.ts:2907` | `app/(tabs)/index.tsx:171`, `app/(tabs)/reports.tsx:81` |
| `expiringSoon` | `repository.ts:2967` | `app/(tabs)/index.tsx:183` |
| `lotsInStock` | `repository.ts:3017` | `app/transfer.tsx:166` |
| `lotsInRoomAt` | `repository.ts:3077` | `app/places.tsx:485` |
| `findLot` | `repository.ts:3120` | `app/lots/[id].tsx:95` |
| `shipmentsOn` | `repository.ts:3301` | `app/(tabs)/transport.tsx:65`, `app/(tabs)/index.tsx:165`, `app/transfer.tsx:258` |
| `runningOut` | `repository.ts:3790` | `app/(tabs)/index.tsx:168`, `app/(tabs)/reports.tsx:80`, `app/inputs/index.tsx:120` |
| `stockAgainstOrders` | `repository.ts:4147` | `app/(tabs)/index.tsx:169`, `app/orders/new.tsx:193`, `src/notify/facts.ts:38` |
| `planReversal` | `repository.ts:4245` | `app/inputs/[id].tsx:331`, `app/lots/[id].tsx:97` |
| `reverseGroup` | `repository.ts:4442` | `app/inputs/[id].tsx:393`, `app/lots/[id].tsx:134` |
| `itemHistory` | `repository.ts:3527` | `app/inputs/[id].tsx:144` |
| `eraseArea` | `repository.ts:3456` | tela de ajustes (via `EraseArea`) |

**Implementadas, chamadas só de dentro do próprio módulo:**

- `recomputeItemCost` (`repository.ts:4344`) — chamador único `reverseGroup`
  (`repository.ts:4521`). Nenhuma tela.
- `ensureLocation` (`repository.ts:847`) — privada; chamada por `recordPurchase`,
  `recordCount`, `recordProduction`, `moveBetween`, `recordLoss` e `listPlaces`.
- `moveBetween` (`repository.ts:1683`) — privada; só `recordTransfer` e
  `recordReturn`.

**Implementadas, com teste e SEM chamador de tela:**

- `unchecked(companyId, fromIso, toIso): Promise<string[]>`
  (`repository.ts:2520-2545`). Devolve os grupos de remessas do dia que ninguém
  conferiu. Chamadores: apenas `src/data/repository.test.ts:1227` e `1238`. A
  informação equivalente chega às telas por outro caminho —
  `Shipment.checked`, calculado dentro de `shipmentsOn`
  (`repository.ts:3322-3327`).

**Implementadas, SEM chamador nenhum (nem teste):**

- `lastCostMove(companyId, itemIds): Promise<string | null>`
  (`repository.ts:3389-3410`). Uma busca no repositório inteiro encontra apenas a
  própria declaração (e o bundle compilado em `dist/`). O docblock descreve a
  frase que ela existe para sustentar — *"Estável há doze dias" é uma conclusão, e
  este é o fato debaixo dela* — e a regra fina: só conta linha em que a taxa
  **mudou**, porque `item_cost_history` também registra o primeiro preço que um
  item já teve, e tratar isso como mudança diria que o custo se moveu no dia em
  que o item foi cadastrado (`repository.ts:3377-3387`).

**Implementadas, sem chamador, no domínio:**

- O tipo `Movement` (`src/domain/ledger.ts:75-127`) — nenhuma linha de produção
  importa; ver §4.4.

**Removidas do código (documentadas aqui a partir do commit `66ad137`):**
`balanceOf`, `balanceAt`, `lotsPresentDuring`, `buildReversal` e o tipo
`Balance` — ver §4.14.

**Planejado / não implementado:**

- `movement_kind = 'sale'`: valor do enum com política de capacidade
  (`dispatch`), palavra no dicionário e **nenhum escritor**.
- `control_post` em `'picked'`, `'loaded'`, `'delivered'`: valores do enum sem
  escritor. Só `'checked'` é gravado.
- `movements.unit_price_rate`: coluna no servidor
  (`supabase/migrations/0008_ledger_speaks_phase_one.sql:80`) e na vista com
  filtro por `view_sale_price` (`0008:90-91`). Não existe no SQLite do aparelho e
  não está na lista de colunas que o serializador envia
  (`src/sync/serialize.ts:317-355`): NÃO IMPLEMENTADO no aparelho.
- `movements.device_id`: coluna no servidor e **na lista do serializador**, mas
  nula até o aparelho saber qual aparelho ele é — a coluna está listada em vez de
  esperar alguém lembrar (`src/sync/serialize.ts:335-341`). Não existe no SQLite
  do aparelho.
- Consumo por lote (PEPS de insumo): explicitamente **trabalho da Fase 3**
  (`src/data/repository.ts:1605`).

---

### 4.19 Os textos de produto do estorno e da contagem

O estorno é dito **sem a palavra "estorno"** — vocabulário de contador, e quem
lança a corrida é quem estava no tacho
(`src/i18n/locales/pt-BR.ts:194-195`). Textos exatos da tela do lote:

| chave | texto |
|---|---|
| `reverse` | `Corrigir esta corrida` (`pt-BR.ts:196`) |
| `reverseTitle` | `Corrigir a corrida {{code}}?` (`pt-BR.ts:197`) |
| `reverseBody` | `Sai do estoque {{out}}. Volta para o almoxarifado {{back}}. Os dois lançamentos ficam no histórico — nada é apagado.` (`pt-BR.ts:198`) |
| `reverseConfirm` | `Corrigir` (`pt-BR.ts:199`) |
| `reverseBlocked` | `Não dá para corrigir: {{items}} já saiu daqui.` (`pt-BR.ts:200`) |
| `reverseBlockedItem` | `{{name}} — tem {{held}}, precisaria de {{needed}}` (`pt-BR.ts:201`) |
| `reverseBlockedHint` | `Traga a carga de volta primeiro, aí a correção passa a valer.` (`pt-BR.ts:202`) |
| `reverseAlready` | `Esta corrida já foi corrigida.` (`pt-BR.ts:203`) |

Textos da tela de insumo (`src/i18n/locales/pt-BR.ts:629-645`):

| chave | texto |
|---|---|
| `entriesHint` | `Toque num lançamento para desfazer. Nada é apagado: a correção entra como linha nova, e as duas ficam.` (`:631`) |
| `undone` | `já corrigido` (`:632`) |
| `undoTitle` | `Desfazer esta {{what}}?` (`:633`) |
| `undoBody` | `Volta para o estoque: {{back}}. Sai do estoque: {{out}}. Fica registrado que houve correção, e nada é apagado.` (`:634-635`) |
| `undoNothingBack` / `undoNothingOut` | `nada` / `nada` (`:636-637`) |
| `undoConfirm` | `Desfazer` (`:638`) |
| `undoDone` | `Este lançamento já foi corrigido` (`:639`) |
| `undoDoneBody` | `A correção dele já está no registro. Não se corrige duas vezes.` (`:640`) |
| `undoBlocked` | `Falta o que devolver` (`:641`) |
| `undoBlockedBody` | `Desfazer isto tiraria do estoque mais do que tem: {{items}}. Traga a mercadoria de volta primeiro, ou registre a contagem do que existe.` (`:642-643`) |
| `undoBlockedLine` | `{{name}} precisa de {{needed}} e tem {{held}}` (`:644`) |
| `undoFailed` | `Não deu para desfazer` (`:645`) |

Da contagem: `Você contou {{counted}}. O sistema esperava {{expected}}. Estão faltando {{diff}}, que valem {{money}}. A diferença fica registrada e nada é apagado.`
(`src/i18n/locales/pt-BR.ts:653`); e a régua de sala:
`Este é o saldo da {{room}}. A contagem é dessa sala.` (`:647`) e
`Este item está em {{count}} lugares. Conta-se um lugar por vez — toque no lugar para conferir ali.`
(`:649-650`). Da perda:
`Diga o que aconteceu — isso protege o relatório de todo mundo.` (`:1108`).

**`MovementRow.reversed` chega à tela e decide três coisas** em
`app/inputs/[id].tsx`:

```tsx
const podeDesfazer = move.groupId !== null && !move.reversed && !desfazendo;
```

(`app/inputs/[id].tsx:785`) — o toque só existe se a linha **tem grupo**, **não
foi estornada** e nenhum estorno está em curso; o detalhe da linha passa a exibir
`t.app.inputDetail.undone` (`app/inputs/[id].tsx:795-798`); e o tom do número vira
`'muted'` (`app/inputs/[id].tsx:800`). O comentário do bloco repete a regra:
*"linha sem grupo não oferece desfazer: movimento antigo, gravado antes de o ato
carregar grupo. Melhor não oferecer do que oferecer e falhar"*
(`app/inputs/[id].tsx:772-773`). O rótulo do tipo vem do dicionário por
`t.movement[move.kind]` com o `kind` cru como reserva
(`app/inputs/[id].tsx:791`).

O histórico de lançamentos **desaparece enquanto a contagem está aberta**, e a
razão é a contagem cega: a linha "+50.000 g" de uma compra recente é o número
esperado escrito de outro jeito, e com ele à vista a conferência vira cópia — *"que
é indistinguível de uma contagem de verdade no dia seguinte"*. O e2e pegou isso na
primeira execução depois do cartão novo; nenhum teste de unidade podia
(`app/inputs/[id].tsx:760-767`, condição em `774`).

---

### 4.20 O que não foi possível determinar a partir do código

- **Se `movements_visible` é lida pelo aplicativo.** A vista existe no servidor
  (`supabase/migrations/0008_ledger_speaks_phase_one.sql:82-92`) e é exercitada
  pela `db:verify` (`scripts/verify-migrations.sh:275-284`), mas o aplicativo lê o
  SQLite local; **nenhuma leitura de `movements_visible` a partir do aparelho
  aparece no código.**
- **O `revoke` de UPDATE/DELETE em `movements` NÃO ESTÁ NO CÓDIGO.** O cabeçalho
  da 0001 afirma que "UPDATE e DELETE são revogados e bloqueados por gatilho"
  (`supabase/migrations/0001_foundation.sql:10-12`), mas uma busca por `revoke`
  em `supabase/migrations/*.sql` encontra apenas `revoke execute on function`
  (`0004:47-56`, `0005:20-21`) — nada sobre a tabela. O que efetivamente bloqueia
  é (a) o gatilho `movements_are_immutable` (`0001:245-247`), (b) a ausência de
  política de UPDATE/DELETE com RLS ligada (`0001:271`, e a afirmação em
  `0015:25-28`), e (c) a `db:verify` só conceder `insert` em `movements` à conta
  do aplicativo (`scripts/verify-migrations.sh:458`). A frase do cabeçalho, sobre
  "revogados", descreve a intenção, não uma instrução `revoke` que exista no
  repositório.
