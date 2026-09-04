## 2. Fundações inegociáveis, Lei da Inteligência, tom de voz e portão de escopo

O `CLAUDE.md` abre a lista com a frase que explica por que ela não é lista de preferências:
*"Estas não são preferências. Cada uma existe porque a alternativa corrompe um número que
alguém vai usar para decidir onde colocar dinheiro."* (`CLAUDE.md:14-15`).

São sete fundações, mais a Lei da Inteligência (sete leis), o tom de voz, o portão de escopo
por item (P1/P2/P3) e seis decisões do dono já tomadas. Cada uma abaixo aparece **transcrita**
e depois **rastreada até o código que a executa** — com o estado marcado: implementado e
chamado por tela, implementado sem chamador, ou planejado.

---

### 2.1 As sete fundações, transcritas

Texto literal de `CLAUDE.md:17-50`:

> **Livro-razão append-only.** Não existe coluna `estoque_atual`. Saldo é a soma dos
> movimentos, e a imutabilidade é imposta por *trigger no banco*, não por convenção.
> Corrige-se por estorno, nunca por exclusão.
>
> **`Cents` é inteiro, `Rate` é fracionário.** Valor que alguém paga e preço por unidade não
> são o mesmo tipo de número. Polpa a R$ 12,40/kg é 1,24 centavo por grama; arredondar isso
> para inteiro perde um quinto antes da primeira multiplicação — foi um bug real. Só o valor
> final arredonda, uma vez. Dinheiro nunca é float, em lugar nenhum.
>
> **Permissão mora na consulta, nunca numa instrução.** Quem não pode ver custo não recebe o
> número: a checagem roda *antes* da consulta, então não existe número para vazar. Esconder
> botão é decoração.
>
> **i18n desde o primeiro texto.** Nenhuma tela guarda uma palavra. Tudo vem de
> `src/i18n/locales/`, nos três idiomas. `Widen<T>` faz chave nova em português quebrar a
> compilação das outras duas até serem escritas.
>
> **A camada de dados devolve fato, não frase.** Quem escreve português é a tela. Um módulo
> que sabe o que depende do quê não deve saber falar.
>
> **Multi-empresa desde a primeira linha.** `company_id` em toda tabela, RLS no servidor.
>
> **"Depende" vira dado, nunca código — e nunca uma pergunta.** Cada fábrica é um caso: uma
> usa celular compartilhado na câmara fria, outra dá um aparelho por pessoa; uma quer
> aprovação de pedido, outra não. Quando a resposta certa é "depende de quem usa", **não se
> escolhe um dos lados e não se pergunta qual** — constrói-se a escolha como configuração da
> empresa, e os dois caminhos existem.
>
> Isto vale inclusive para as perguntas feitas ao dono: pedir que ele escolha entre A e B
> quando A e B são preferências de cliente é empurrar para ele uma decisão que o produto
> deveria absorver. A pergunta certa nesse caso é qual é o **padrão** — não qual é o único.

A numeração usada no código não é a da lista acima: `src/domain/access.ts:4` chama a permissão
por capacidade de **"Foundation 6"**, e `src/data/db.ts:188` e `src/data/schema.test.ts:9`
chamam o livro-razão de **"Foundation 1"**. Só essas duas têm número escrito no código.

---

### 2.2 Fundação 1 — livro-razão append-only

#### 2.2.1 A regra e a razão longa

O docblock de `src/domain/ledger.ts:1-15` lista o que a decisão compra de graça, e é a
formulação mais completa da fundação em todo o repositório:

> There is no `current_stock` column anywhere in this system. Stock is the sum of an
> append-only list of movements. That single decision buys, for free:
> - history and audit (the log IS the database)
> - correction by reversal instead of deletion, so nothing is ever falsified
> - reports that cannot disagree with the history, because they come from it
> - offline sync without conflicts: appends are commutative, and the id is generated on the
>   device, so replaying a queue twice is harmless
> - the ability to answer "what was inside the freezer at 03:12?" — which is how a temperature
>   excursion lists the exposed lots with nobody having written anything down

#### 2.2.2 Como o servidor impõe (Postgres)

A tabela `movements` é criada em `supabase/migrations/0001_foundation.sql:181-224`. Colunas,
com os nomes exatos:

| coluna | tipo | regra |
|---|---|---|
| `id` | `uuid primary key` | **sem default** — gerado no aparelho, para replay ser idempotente (`0001:182-183`) |
| `company_id` | `uuid not null references companies(id) on delete cascade` | carimbo de inquilino |
| `kind` | `movement_kind not null` | enum, ver abaixo |
| `occurred_at` | `timestamptz not null` | quando aconteceu no mundo, não quando chegou ao servidor (`0001:187-189`) |
| `recorded_at` | `timestamptz not null default now()` | |
| `recorded_by` | `uuid not null references auth.users(id)` | qual **conta** escreveu |
| `item_id` | `uuid not null references items(id) on delete restrict` | |
| `quantity_base_units` | `bigint not null` | sempre na menor unidade; **com sinal**: negativo sai, positivo entra (`0001:194-195`) |
| `location_id` | `uuid not null references locations(id) on delete restrict` | |
| `counterpart_location_id` | `uuid references locations(id) on delete restrict` | o outro lado de uma transferência |
| `lot_id` | `uuid references lots(id) on delete restrict` | |
| `post` | `control_post` | posto de controle |
| `loss_reason` | `loss_reason` | |
| `unit_cost_cents` | `bigint` | **removida** pela `0008` (ver 2.3.4) |
| `unit_price_cents` | `bigint` | **removida** pela `0008` |
| `reverses_movement_id` | `uuid references movements(id)` | preenchida quando esta linha cancela outra |
| `assistant_phrase` | `text` | a frase que a pessoa digitou, quando o assistente redigiu o movimento (`0001:211-213`) |
| `note` | `text` | |

Acrescentadas depois: `device_id uuid references devices(id) on delete restrict`
(`0013_the_device_is_accountable.sql:63-64`), `operator_id uuid references memberships(id) on
delete restrict` (`0014_who_was_holding_it.sql:20-21`), `unit_cost_rate double precision` e
`unit_price_rate double precision` (`0008_ledger_speaks_phase_one.sql:79-80`).

Enums, com os valores exatos:

| enum | valores | onde |
|---|---|---|
| `movement_kind` | `production`, `consumption`, `transfer`, `sale`, `loss`, `return`, `adjustment`, `discrepancy`, `reversal` | `0001:172-175` |
| `movement_kind` (acréscimo) | `purchase` | `0007_movement_kind_purchase.sql:16` — migração própria, porque o Postgres adiciona valor ao enum numa transação mas **recusa usá-lo na mesma** (`0007:13-15`) |
| `loss_reason` | `melted`, `broken`, `expired`, `courtesy`, `internal_use` | `0001:177` |
| `control_post` | `picked`, `loaded`, `delivered`, `checked` | `0001:179` |
| `location_kind` | `factory`, `cold_room`, `store_room`, `own_store`, `customer`, `vehicle` | `0001:109` |
| `item_kind` | `input`, `packaging`, `product`, `resale`, `store_supply` | `0001:133` |
| `capability` | 12 valores, ver 2.4 | `0001:42-55` |
| `membership_state` | `pending`, `active`, `revoked` | `0011_joining_a_company.sql:11` |
| `floor_sign_in` | `personal`, `shared` | `0011:65` |

**O gatilho, transcrito na íntegra** (`0001_foundation.sql:233-247`):

```sql
-- Append-only, enforced by the database.
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

A função é recriada em `0004_harden.sql:31-41` **somente** para fixar `set search_path = ''` —
o corpo é idêntico, e a razão está escrita: *"A trigger function with a mutable search_path can
be pointed at objects the author did not mean"* (`0004:16-17`).

O saldo é uma view, nunca uma coluna (`0001:249-260`):

```sql
create view stock_balances as
  select company_id, item_id, location_id, sum(quantity_base_units) as base_units
  from movements
  group by company_id, item_id, location_id;
```

E a `0004:28` corrige o buraco que a view abria: `alter view stock_balances set
(security_invoker = true)`. A razão, escrita em `0004:8-14`: sem a opção, a view roda com os
direitos de quem a criou e **lê passando por cima do RLS** — qualquer usuário autenticado teria
lido o saldo de todas as empresas do servidor. `movements_visible` já tinha a opção; esta não.

Restrições que impedem linha sem sentido:

| restrição | expressão | onde |
|---|---|---|
| `loss_needs_reason` | `check (kind <> 'loss' or loss_reason is not null)` | `0001:220-221` |
| `reversal_points_somewhere` | `check (kind <> 'reversal' or reverses_movement_id is not null)` | `0001:222-223` |
| `movements_quantity_base_units_check` | `check (quantity_base_units <> 0)` — **derrubada** pela `0008:52` | `0001:195` |
| `movement_moved_something` | `check (quantity_base_units <> 0 or kind = 'adjustment')` | `0008:54-55`; redefinida pela `0017` para admitir `kind = 'discrepancy' and post is not null` (`src/sync/agreement.test.ts:178-182`) |
| `movement_item_same_company` | `foreign key (item_id, company_id) references items (id, company_id) on delete restrict` | `0029:29-32` |
| `movement_location_same_company` | idem para `location_id` | `0029:34-37` |
| `movement_counterpart_same_company` | idem para `counterpart_location_id` | `0029:43-45` |

Índices do razão no servidor (`0001:226-231`, mais os acrescentados depois):
`movements_balance_idx on movements (company_id, item_id, location_id, occurred_at)`;
`movements_lot_idx on movements (company_id, lot_id) where lot_id is not null`;
`movements_assistant_idx on movements (company_id, recorded_at) where assistant_phrase is not
null`; `movements_device_idx (company_id, device_id) where device_id is not null` (`0013:66-67`);
`movements_operator_idx (company_id, operator_id) where operator_id is not null` (`0014:26-27`);
e `movements_reversal_idx`, o índice sob "o que foi estornado"
(`0028_the_index_under_what_was_reversed.sql:29`). No aparelho: `movements_balance_idx` idêntico
(`db.ts:251-252`), `movements_group_idx (company_id, movement_group_id)` (`db.ts:368-370`) e
`movements_reversal_idx (reverses_movement_id, company_id)` parcial (`db.ts:671-673`).

A razão da `0008` para admitir contagem de diferença zero está escrita e é regra de produto,
não detalhe técnico: *"A physical count is recorded as the difference between the shelf and the
ledger, and the most valuable count result is a difference of zero — somebody walked to the
storeroom and the books were correct. Refusing to store that leaves a shelf nobody has checked
in months indistinguishable from one verified this morning"* (`0008:43-51`).

#### 2.2.3 Como o aparelho faz (SQLite) — e o que ele NÃO faz

A `movements` do aparelho nasce no passo **V3** de `src/data/db.ts:216-280`, com os nomes de
coluna do servidor de propósito: *"The column names are the server's, down to
`quantity_base_units`, because this file's first promise is that the device mirrors the server
rather than inventing a second shape"* (`db.ts:205-210`).

**NÃO EXISTE gatilho de imutabilidade no aparelho.** O SQLite local não tem nenhum
`CREATE TRIGGER` — a lista completa de passos é `V1..V17` em `src/data/db.ts:676-678` e nenhum
deles cria gatilho. A imutabilidade no aparelho é sustentada por **ausência de escrita**:
nenhum `UPDATE movements` nem `DELETE FROM movements` existe em `src/data/*.ts` (varredura
vazia). A única exclusão de linha de razão que o produto faz é o comando de apagar área, cuja
tabela `movements` aparece no conjunto fechado `ErasableTable` de `src/data/erase.ts:32-52` — e
esse comando é irreversível e não tem lado servidor (`src/data/erase.ts:66-69`).

**A cicatriz que deu nome à fundação.** O aparelho carregou por meses
`item_costs.on_hand_base_units`, um inteiro atualizado em cada compra —
*"precisely the column the foundation forbids, wearing a longer name"* (`db.ts:188-195`). A V3
faz três coisas em ordem: cria `movements`, transforma cada `purchase_lines` no movimento que
ela sempre foi (mantendo o **mesmo id**, para replay não dobrar saldo — `db.ts:266-277`), e só
então `ALTER TABLE item_costs DROP COLUMN on_hand_base_units` (`db.ts:279`).

O lugar padrão nasce no mesmo passo, com id determinístico e **nome vazio** (`db.ts:254-264`):

```sql
INSERT OR IGNORE INTO locations (id, company_id, name, kind, created_at)
SELECT company_id, company_id, '', 'store_room', MIN(created_at)
  FROM items GROUP BY company_id;
```

A razão do nome vazio é a fundação de i18n: *"a default that ships as one language would be the
single string that escaped. An unnamed location means 'the one place', and the interface is
what names it"* (`db.ts:258-261`).

#### 2.2.4 Corrige-se por estorno: o código que faz isso

`reverseGroup` (`src/data/repository.ts:4442-4525`) é, nas palavras do próprio docblock,
*"a primeira fundação deste projeto virando código"* (`repository.ts:4423`). Regras exatas:

- Estorna o **ato**, pelo grupo (`movement_group_id`), nunca uma linha: uma corrida são sete
  movimentos, e desfazer só a linha da produção deixaria picolés que não consumiram nada —
  *"pior que o erro original porque parece certo"* (`repository.ts:4431-4435`).
- As pernas do estorno compartilham um `movement_group_id` **novo** entre si, e cada uma aponta
  para a origem por `reverses_movement_id` (`repository.ts:4434-4435`, escrita em `4480-4503`).
- `kind = 'reversal'`, quantidade negada (`-o.quantity_base_units`), e a **taxa é a do movimento
  original**, congelada: *"Ler a média de hoje avaliaria o erro de setembro ao preço de
  outubro"* (`repository.ts:4491-4496`).
- O lote **não** é apagado: *"Ele é identidade, não quantidade"* (`repository.ts:4437-4440`).
- Recusa em dois casos, por `CannotReverseError`: já estornado, ou bloqueado porque o que o
  estorno tira já não está lá (`repository.ts:4448`), e a checagem é refeita **dentro** da
  transação porque *"Entre planejar e gravar cabe uma remessa de outro aparelho"*
  (`repository.ts:4455-4459`).
- Depois da transação, e de propósito fora dela, `recomputeItemCost` por item
  (`repository.ts:4508-4522`). A cicatriz: sem isso o estorno consertava a quantidade e deixava
  o custo médio errado embaixo de todo número de dinheiro do app (`repository.ts:4319-4324`).

`planReversal` (`repository.ts:4245-4314`) devolve `{ groupId, legs, blocked, alreadyReversed }`
e existe porque a Lei 5 pede que o erro **impeça e mostre a saída**.

`recomputeItemCost` (`repository.ts:4344+`) aplica a fundação ao custo médio: *"Não dá para
'desmisturar' uma média móvel... O que dá é replicar o caminho inteiro do zero — que é a mesma
coisa que a primeira fundação já diz do saldo. Saldo é a soma dos movimentos; média é a dobra
deles. `item_costs` passa a ser cache de uma conta que sempre pode ser refeita"*
(`repository.ts:4326-4332`). A regra da dobra, lida dos escritores existentes: **entrada com
taxa mistura; qualquer outra coisa só move a quantidade** (`repository.ts:4334-4338`).

`recordCount` (`repository.ts:886-978`) é a contagem como diferença: lê o saldo daquela sala,
calcula `delta = counted - expected`, e grava **uma** linha `kind = 'adjustment'` com
`quantity_base_units = delta` (`repository.ts:923-968`). O grupo é a própria linha
(`movement_group_id = id`), *"e sem grupo ela não tem como ser DESFEITA"* (`repository.ts:959-964`).
`locationId` é obrigatório e **sem default** de propósito (`repository.ts:906-917`).

#### 2.2.5 "O que foi estornado não aconteceu" — a cláusula

`NAO_ESTORNADO` (`src/data/repository.ts:750-752`), constante e não função de apelido porque
montar SQL por interpolação é o padrão que a proofgate marca:

```sql
NOT EXISTS (SELECT 1 FROM movements rev
             WHERE rev.reverses_movement_id = m.id
               AND rev.company_id = m.company_id)
```

Oito consultas do app usam essa cláusula (`repository.ts:745-746`). O saldo **não** a usa — é
soma pura e não olha `kind` —, e é essa diferença que o docblock explica: sem a cláusula nas
telas de "o que aconteceu", o estorno acertaria o saldo e deixaria a produção mentindo no mesmo
aplicativo (`repository.ts:736-743`). O índice parcial que sustenta a cláusula é o passo V17
(`db.ts:670-674`), com medição escrita: 9.906 ms sem índice, 4 ms com, num SQLite de 60 mil
movimentos (`db.ts:656-660`).

#### 2.2.6 Verificação por máquina desta fundação

| prova | onde | o que garante |
|---|---|---|
| `db:verify` check 1 | `scripts/verify-migrations.sh:99-108` | `update movements set quantity_base_units = 99999` e `delete from movements` são **recusados** por um Postgres de verdade, e o saldo continua em `4800` |
| `db:verify` check 1, segunda metade | `scripts/verify-migrations.sh:118-122` | zero colunas em `information_schema.columns` casam `(^\|_)(on_hand\|current_stock\|stock_level\|estoque_atual\|quantity_on_hand\|saldo_atual)` |
| `schema.test.ts` | `src/data/schema.test.ts:31-35, 76-104` | nenhuma tabela do aparelho tem coluna com esses nomes, medido por `PRAGMA table_info` num SQLite migrado de verdade |
| `schema.test.ts` (canário) | `src/data/schema.test.ts:62-74` | a régua reprova `on_hand_base_units`, `estoque_atual`, `current_stock` e **aprova** `quantity_base_units`, `purchase_to_base`, `total_cents` |
| `agreement.test.ts` | `src/sync/agreement.test.ts:238-251` | nem o servidor nem o aparelho podem "crescer de volta" a coluna: exige a presença literal de `ALTER TABLE item_costs DROP COLUMN on_hand_base_units` em `db.ts` |
| `agreement.test.ts` | `src/sync/agreement.test.ts:146-165` | todo `kind` que o aparelho escreve existe no enum do servidor, lido do próprio `repository.ts` |
| proofgate `97-migration-edited` | `.proofgate/guards.d/97-migration-edited.sh` | ⚠️ quando um arquivo de migração existente é modificado ou removido em vez de acrescentado |

O que **não** é verificado por máquina: que o aparelho recuse `UPDATE`/`DELETE` em `movements`.
Isso hoje é convenção sustentada por ausência de código.

---

### 2.3 Fundação 2 — `Cents` é inteiro, `Rate` é fracionário

#### 2.3.1 Os dois tipos, transcritos

`src/domain/money.ts:1-9` e `:37-55`:

```ts
/**
 * Money is integer cents. Never a float — 0.1 + 0.2 is not 0.3, and a system
 * whose whole point is that the numbers are trustworthy cannot afford that.
 */
export type Cents = number & { readonly __brand: 'Cents' };

export function cents(value: number): Cents {
  return Math.round(value) as Cents;
}

export type Rate = number & { readonly __brand: 'Rate' };

/** R$ 12.40 per kilo, with 1000 g per kilo, is `rate(12.40, 1000)`. */
export function rate(pricePerPurchaseUnit: number, baseUnitsPerPurchaseUnit: number): Rate {
  if (baseUnitsPerPurchaseUnit <= 0) return 0 as Rate;
  return ((pricePerPurchaseUnit * 100) / baseUnitsPerPurchaseUnit) as Rate;
}
```

O docblock de `Rate` (`money.ts:37-48`) é a declaração canônica da regra, com o bug real:

> A unit rate: fractional cents per base unit. This is NOT money and must never be rounded to
> an integer. Strawberry pulp at R$ 12.40/kg is 1.24 cents per gram; forcing that into a whole
> cent loses 19% of it, and the error then multiplies through every recipe in the system. Cost
> per millilitre of mix is smaller still and rounds straight to zero.
> The rule: `Cents` is an amount somebody pays. `Rate` is a price per unit. Rates stay
> fractional all the way through the calculation, and only the final amount is rounded - once.

Nota de precisão para quem reconstruir: o `CLAUDE.md:22-24` diz "perde um quinto" e o
`money.ts:41` diz "loses 19%" — os dois descrevem o mesmo número (0,24 / 1,24 = 19,35%).

#### 2.3.2 A API completa de dinheiro

| assinatura | o que faz | arquivo:linha |
|---|---|---|
| `cents(value: number): Cents` | `Math.round(value)` — o construtor força inteiro | `money.ts:7-9` |
| `fromDecimal(value: number): Cents` | `Math.round(value * 100)` | `money.ts:11-13` |
| `toDecimal(value: Cents): number` | `value / 100` | `money.ts:15-17` |
| `multiplyCents(value: Cents, factor: number): Cents` | `Math.round(value * factor)` | `money.ts:19-21` |
| `allocateCents(total: Cents, parts: number): Cents[]` | divide sem perder nem inventar centavo; o resto se espalha um centavo por vez nas primeiras partes | `money.ts:28-35` |
| `rate(pricePerPurchaseUnit, baseUnitsPerPurchaseUnit): Rate` | `(preço * 100) / unidades-base`; pacote vazio devolve `0` | `money.ts:52-55` |
| `amountOf(unitRate: Rate, quantity: number): Cents` | `Math.round(unitRate * quantity)` — **o** ponto de arredondamento do sistema | `money.ts:58-60` |
| `rateFromCents(total: Cents, quantity: number): Rate` | `total / quantity`; quantidade ≤ 0 devolve `0` | `money.ts:62-65` |
| `allocateByWeight(total: Cents, weights: readonly number[]): Cents[]` | maior resto: o que falta depois do piso vai para quem perdeu mais no piso; a soma é exatamente `total` | `money.ts:82-99` |

`allocateByWeight` existe por um defeito real: *"a recipe's batch cost was the sum of its lines
after each line had been rounded, so ten ingredients at four tenths of a cent each summed to
nothing while the batch really cost four cents. Every product built on that recipe was
understated, and the arithmetic looked perfectly reasonable at every step"* (`money.ts:71-76`).

#### 2.3.3 O que a suíte pinou, e por quê

`src/domain/money.test.ts` existe por causa de uma mutação: `Math.round` em `amountOf` trocado
por `Math.floor` deixou **noventa e dois testes verdes** (`money.test.ts:20-24`). Asserções
exatas que agora seguram a regra:

| asserção | valor | linha |
|---|---|---|
| `amountOf(0.5, 1)` | `1` — meio centavo era o caso que faltava | `money.test.ts:35` |
| `amountOf(0.125, 5)` | `1` | `money.test.ts:36` |
| `amountOf(0.4, 1)` | `0` — e não arredonda para cima | `money.test.ts:37` |
| `amountOf(0.472, 1233)` | `582` | `money.test.ts:40` |
| dez linhas de `amountOf(0.51, 1)` | somam `10` (com `floor`, somariam `0`) | `money.test.ts:48-52` |
| `rate(12.4, 1000)` | `1.24` (± 1e-12), e `Math.round(pulp) !== pulp` | `money.test.ts:57-62` |
| `fromDecimal(118.35)` | `11835`, e `amountOf(rateFromCents(11835, 25000), 25000) === 11835` | `money.test.ts:66-72` |
| `allocateCents(100, 3)` | `[34, 33, 33]` | `money.test.ts:82` |
| `allocateByWeight(7, [90,5,5])` | soma `7` | `money.test.ts:91-96` |
| `multiplyCents(1000, 1/3)` = `333` e `multiplyCents(5, 0.5)` = `3` | arredonda uma vez, no fim | `money.test.ts:117-119` |
| `cents(10.6)` | `11` | `money.test.ts:108-109` |

#### 2.3.4 O esquema seguiu — e a migração que consertou

`0008_ledger_speaks_phase_one.sql:57-81` é a correção no servidor, com o número escrito:
*"a sack of sugar at R$ 118 for 25 kg is 0.472 cents per gram, which as a bigint is 0. Every
cheap input would have frozen its cost as nothing, and margin reports built on it would have
looked plausible"* (`0008:61-65`). As colunas foram **substituídas**, não sombreadas, porque
*"A wrong column left beside a right one is the trap that put a mutable stock total on the
device in the first place"* (`0008:67-69`):

```sql
alter table movements drop column unit_cost_cents;
alter table movements drop column unit_price_cents;
alter table movements add column unit_cost_rate  double precision;
alter table movements add column unit_price_rate double precision;
```

No aparelho: `unit_cost_rate REAL` em `movements` (`db.ts:238-241`), `average_rate REAL NOT NULL
DEFAULT 0` e `last_rate REAL` em `item_costs` (`db.ts:49-51`), contra `total_cents INTEGER` em
`purchase_lines` (`db.ts:124`) e `unit_packaging_cents INTEGER` em `products` (`db.ts:104`). A
promessa está no topo do arquivo: *"rates are REAL, amounts are INTEGER cents, matching the same
split the domain enforces — a price per gram is not money and must not be rounded"*
(`db.ts:11-13`).

O tipo do domínio ficou atrás por dias e ninguém viu, porque **nenhuma linha de produção
importava o módulo**: `src/domain/ledger.ts:98-114` registra que `Movement.unitCostCents?: Cents`
sobreviveu à migração — *"A type nobody uses is not harmless — it is a lie waiting for its first
caller"* (`src/sync/agreement.test.ts:314-327`). Hoje o campo é `unitCostRate?: Rate`
(`ledger.ts:114`) e existe teste que compara o tipo com o esquema em ambos os sentidos
(`agreement.test.ts:328-350` e `:361-397`).

#### 2.3.5 Onde a taxa vira valor, uma vez

- `stockByPlace` arredonda no fim, por linha: `const value = cents((r.rate ?? 0) * r.base_units)`
  com o comentário *"Taxa fracionária vezes quantidade, arredondada aqui e só aqui"*
  (`repository.ts:821-822`).
- `recordProduction` arredonda a **quantidade** antes do valor, porque o custo congelado é a
  aritmética do que o razão guarda (`repository.ts:1404-1409`); a cicatriz citada ali é uma tela
  mostrando `34.938,776 g` e outra `34.939 g` para o mesmo saco (`repository.ts:1400-1402`).
- `recordCount` devolve `deltaCents: amountOf(averageRate, delta)` (`repository.ts:976`).
- Na tela, quem escreve dinheiro é `formatMoney` (`src/i18n/index.ts:96-101`) — `Intl.NumberFormat`
  com `style: 'currency'` e a moeda **da empresa**, não do aparelho (`i18n/index.ts:12-15`).

#### 2.3.6 Verificação por máquina

| prova | onde |
|---|---|
| `db:verify` check 2 | `scripts/verify-migrations.sh:124-174` — uma compra move a média móvel **mantendo precisão**; check 4 confere que o custo congelado é exatamente `0.472` (`:275-276`) |
| `money.test.ts` | as onze asserções de 2.3.3 |
| `npm run mutate` | a mutação `Math.round → Math.floor` em `amountOf` é uma das 64 mutações registradas (`CLAUDE.md:142-145`) |
| proofgate `85-float-money` | ⚠️ em linha adicionada que passa dinheiro por `parseFloat`/`.toFixed`/`float`/`double` perto de palavra de dinheiro; **sempre WARN, nunca FAIL**, por ser o guard mais barulhento por desenho (`.proofgate/guards.d/85-float-money.sh:1-24`) |
| `layers.test.ts` porcentagem | `porCentoNaMao` — ver 2.11.7 |

---

### 2.4 Fundação 3 — permissão mora na consulta, nunca numa instrução

#### 2.4.1 A formulação do código

`src/domain/access.ts:1-20` diz o que o arquivo faz **e** o que ele deliberadamente não faz:

> Foundation 6 of this project: permission is a CAPABILITY, never a screen. (...)
> It does not enforce anything. Enforcement lives where the data is: row level security in
> Postgres, and the check that runs *before* the query on this device. Hiding a control is
> decoration - the figure has to never arrive.
> And it does not say WHICH ROWS. (...) the capability says what kind of thing they may do, the
> scope says which rows they may do it to.

#### 2.4.2 As doze capacidades

`src/domain/access.ts:26-39` e o enum `capability` de `0001_foundation.sql:42-55` — **os dois
lados, valor por valor**: `view_cost`, `view_sale_price`, `record_production`, `dispatch`,
`check_receipt`, `record_loss`, `place_order`, `approve_order`, `adjust_stock`, `view_finance`,
`issue_invoice`, `manage_company`.

#### 2.4.3 Os sete papéis, transcritos

`ROLES: Record<Role, readonly Capability[]>` em `src/domain/access.ts:70-112`:

| papel | capacidades | nota escrita no código |
|---|---|---|
| `owner` | `capabilities` (todas as 12) | *"There is always exactly one person who can do anything"* (`access.ts:71`) |
| `operator` | `record_production`, `dispatch`, `check_receipt`, `record_loss`, `adjust_stock` | sem `view_cost` e sem `view_sale_price` de propósito: *"the number is irrelevant to the job and its presence invites conversations about margin on the factory floor"* (`access.ts:60-68`) |
| `storeManager` | `view_sale_price`, `check_receipt`, `record_loss`, `place_order` | `access.ts:89` |
| `driver` | `dispatch`, `check_receipt`, `record_loss` | pode lançar perda porque *"a pallet does fall off a truck, and refusing them the button is what turns a real loss into unexplained shrinkage"* (`access.ts:66-68`) |
| `buyer` | `view_cost`, `view_sale_price`, `check_receipt`, `place_order`, `approve_order`, `adjust_stock`, `view_finance` | `access.ts:97-105` |
| `customer` | `view_sale_price`, `check_receipt`, `place_order`, `view_finance` | *"seeing only their own side of the deal"* (`access.ts:107`) |
| `salesperson` | `view_sale_price`, `place_order`, `view_finance` | *"never sees what it cost to make"* (`access.ts:110`) |

`capabilitiesFor(role: Role): ReadonlySet<Capability>` = `new Set(ROLES[role])`
(`access.ts:114-116`).

#### 2.4.4 O piso que nenhuma autonomia atravessa

`ALWAYS_CONFIRMED` (`access.ts:135-141`): `adjustStock`, `changePrice`, `reverseMovement`,
`recordFinance`, `issueInvoice`. `needsHumanYes(act)` devolve `ALWAYS_CONFIRMED.includes(act)`
(`access.ts:146-148`). O docblock registra que só dois desses cinco têm capacidade própria hoje,
e que os outros três são promessa feita antes de a feature existir: *"whoever builds them
inherits the rule rather than deciding it again"* (`access.ts:118-134`).

#### 2.4.5 Como o servidor impõe

- `movements_append`, a política de escrita: `recorded_by = auth.uid()` **e** um `case kind`
  que mapeia cada tipo à sua capacidade. Versão vigente em `0008:26-41`:
  `purchase → check_receipt`, `production → record_production`, `consumption → record_production`,
  `transfer → dispatch`, `sale → dispatch`, `loss → record_loss`, `return → check_receipt`,
  `discrepancy → check_receipt`, `adjustment → adjust_stock`, `reversal → adjust_stock`.
  O `case` **sem `else`** é a decisão de desenho: tipo não listado avalia `NULL` e a escrita é
  recusada — *"That is the right way round - a movement nobody thought about must not be
  writable"* (`0008:8-14`).
- `movements_visible`, a view que filtra dinheiro **na consulta** (`0008:82-92`):
  `case when private.has_capability(m.company_id, 'view_cost') then m.unit_cost_rate end as
  unit_cost_rate`, e o mesmo para `unit_price_rate` com `view_sale_price`.
- As duas funções que são "a permissão inteira deste sistema" (`0011:17-21`), reescritas na
  `0011:22-47` para exigir linha **ativa**:

```sql
create or replace function private.current_companies() returns setof uuid ... as $$
  select company_id from memberships where user_id = auth.uid() and state = 'active';
$$;

create or replace function private.has_capability(target_company uuid, needed capability)
returns boolean ... as $$
  select exists (select 1 from memberships
    where user_id = auth.uid() and company_id = target_company
      and state = 'active' and needed = any (capabilities));
$$;
```

- Políticas por tabela em `0001:266-326`: `for select using (company_id in (select
  current_companies()))` para leitura; `for all using (has_capability(company_id,
  'manage_company'))` para cadastro; `lots_write for insert with check
  (has_capability(company_id, 'record_production'))`.
- `0004:45-59` revoga `execute` de `apply_purchase_to_cost()` de `public`/`anon`/`authenticated`
  e mantém `current_companies()`/`has_capability()` executáveis pelo `authenticated`, com razão
  escrita: nenhuma das duas recebe identidade como entrada, só respondem sobre `auth.uid()`
  (`0004:22-26`).
- `0030` acrescenta duas políticas estreitas para a linha de escrituração do próprio sistema
  (`locations_default_room`, `locations_default_room_resend`): só `id = company_id` e só para
  quem tem alguma das cinco capacidades de chão de fábrica (`0030:31-60`). A razão é a quarta
  aparição da fila travada: o `operator` do celular emprestado não tem `manage_company`, e
  `ensureLocation` enfileirava um `location` que o Postgres recusava — travando **tudo** atrás
  dele (`0030:1-25`).

#### 2.4.6 Como o aparelho impõe (hoje)

A checagem antes da consulta existe no assistente. `ask()` em `src/assistant/index.ts:54-73`:

```ts
if (skill.requires && !context.capabilities.has(skill.requires)) {
  return {
    text: 'Esse número não faz parte do seu acesso. Quem cuida do financeiro consegue ver.',
  };
}
```

O docblock explica o desenho inteiro em uma linha: *"The permission check runs *before* the
query, which is the whole security design in one line: a figure the person may not see never
enters the answer, so there is nothing for a model to leak later. Telling a model to keep a
secret is not a control"* (`assistant/index.ts:42-53`). `knownSkills(capabilities)` filtra o
registro pelo mesmo critério (`assistant/index.ts:38-40`). Sete habilidades declaram
`requires: 'view_cost'` (`src/assistant/skills.ts:47, 102, 147, 246, 284, 390, 991`) e duas
ramificam por capacidade dentro da resposta (`skills.ts:494, 738`).

**Estado, dito sem enfeite:** o aplicativo local não tem login, então
`app/assistant.tsx:79` fixa `const CAPABILITIES: ReadonlySet<Capability> =
capabilitiesFor('owner')`, com a razão escrita: *"Until sign-in lands, whoever holds this phone
is the owner. (...) the day this reads a real membership, only this line changes"*
(`app/assistant.tsx:71-79`). Nenhuma tela consulta capacidade hoje — **implementado, chamado só
pelo assistente**.

#### 2.4.7 Verificação por máquina

| prova | onde | número exato |
|---|---|---|
| `db:verify` check 4 | `scripts/verify-migrations.sh:202-316` | dono vê `0.472` no custo congelado; `operator` vê `null` na **mesma linha da mesma view**; empresa 1 vê `0` itens da empresa 2; usuário sem associação vê `0` itens; quem está `pending` vê `0` itens e `0` movimentos, e passa a ver `3` itens quando vira `active` |
| `db:verify` check 5 | `scripts/verify-migrations.sh:318-415` | *"nobody can record a movement in somebody else's name"* — `recorded_by = auth.uid()` provado |
| `db:verify` check 9 | `scripts/verify-migrations.sh:688+` | o reenvio da fila passa pela capacidade **mínima** de quem escreveu |
| `agreement.test.ts` | `src/sync/agreement.test.ts:253-266` | `[...capabilities].sort()` do TypeScript é **deepEqual** ao enum `capability` do Postgres |
| `assistant.test.ts` | `src/assistant/assistant.test.ts:280, 425` | *"a role without view_cost cannot get a figure out of it"* e *"someone without view_cost was handed the money"* |

---

### 2.5 Fundação 4 — i18n desde o primeiro texto

#### 2.5.1 `Widen<T>`, transcrito

`src/i18n/locales/pt-BR.ts:1170-1178`:

```ts
/**
 * Widens every leaf string to `string` while keeping the shape intact.
 * Without this, `as const` would freeze the Portuguese wording into the type
 * and no translation could ever satisfy it - while a missing key must still be
 * a compile error. Structure is checked, wording is free.
 */
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof ptBR>;
```

O português é a língua-fonte (`pt-BR.ts:2`), declarado `as const` (`pt-BR.ts:1168`); `en.ts` e
`es.ts` são tipados como `Dictionary`, então **chave nova em português quebra a compilação das
outras duas até serem escritas** — que é exatamente o que o `CLAUDE.md:32-33` promete.

O mecanismo de runtime é minúsculo de propósito (`src/i18n/index.ts:36-39`): `fill(template,
values)` interpola `{{name}}` e **deixa o buraco visível** quando ninguém o preencheu
(`i18n/index.ts:40-44`, provado em `i18n.test.ts:81-84`) — *"Some com o valor e a frase vira
'Ontem foram .' - um erro que parece texto"*.

#### 2.5.2 O que `Widen<T>` **não** pega — e os quatro guards que fecham os buracos

| buraco | guard | onde |
|---|---|---|
| chave existe nos três, mas a tradução perdeu o `{{buraco}}` | `i18n.test.ts` compara os buracos folha por folha nos três dicionários; exige `base.size > 300` para o teste não passar à toa | `src/i18n/i18n.test.ts:38-57` |
| a tela escreve a frase em vez de ler o dicionário | `layers.test.ts` → `pareceFrase` (ver 2.11.3) | `src/layers.test.ts:184-208` |
| plural que devolve a palavra sem o número | `plural()` prefixa quando **nenhuma** das variantes tem `{{n}}` | `src/i18n/index.ts:86-88`, testes em `i18n.test.ts:59-79` |
| seção de dicionário sem leitor | `dictionary.test.ts` (ver 2.13.2) | `src/dictionary.test.ts:62-78` |

A cicatriz do `Widen`: `WhySheet` — *"a folha que abre a conta de toda conclusão do aplicativo,
a Lei 6 em pessoa"* — tinha "Custo do lote", "Perda prevista" e "Fechar" cravados em português.
*"Uma fábrica em espanhol via a interface traduzida e, no instante em que pedia a prova do
número, recebia português. O `Widen<T>` não pega isso: ele obriga a CHAVE a existir nos três
dicionários e não obriga a tela a usá-la"* (`src/layers.test.ts:131-152`;
`src/i18n/locales/pt-BR.ts:1059-1067`). As chaves hoje existem em `whySheet`
(`pt-BR.ts:1068-1079`): `close`, `where`, `shareOfBatch`, `batchCost`, `expectedLoss`,
`remains`, `perMassUnit`, `perAmount`, `lossNote`.

#### 2.5.3 Internacionalização de verdade: não é só a palavra

`src/i18n/index.ts:91-95`: *"Real internationalisation: money, dates and the decimal separator
move with the language. Translating the words and still showing 'R$' to a Mexican customer is
not internationalisation."*

| função | assinatura | regra registrada | linha |
|---|---|---|---|
| `formatMoney` | `(cents: number, locale) => string` | `Intl` com `style:'currency'`, moeda da empresa | `i18n/index.ts:96-101` |
| `formatQuantity` | `(value, locale)` | `maximumFractionDigits: 0` | `:103-107` |
| `formatWeight` | `(grams, locale)` | kg com 0 casas se ≥ 10, senão 1 | `:109-115` |
| `formatDate` | `(iso, locale)` | dia/mês/ano no fuso da fábrica | `:117-124` |
| `formatPacked` | `(baseUnits, hierarchy, words, locale, and?)` | camadas maiores primeiro, resto em unidades: 263 é "5 caixas · 13 unidades", nunca só "5 caixas" | `:133-160` |
| `formatTime` | `(iso, locale)` | *"'05:20', nunca '5:20 AM' num turno de -18°C"* | `:162-169` |
| `formatWeekday` | `(iso, locale)` | dia da semana + dia + mês curto | `:171-178` |
| `formatCalendarDate` | `(date: 'YYYY-MM-DD', locale)` | `timeZone: 'UTC'` de propósito — data combinada não tem hora, e passá-la pelo fuso da fábrica mostrava 02/09 para "2026-09-03" | `:180-194` |
| `formatPercent` | `(fraction, locale, digits = 1)` | `style:'percent'` — existia em três lugares como `(x*100).toFixed(1)`, e a capa anunciava "9.0%" para fábrica brasileira | `:208-223` |
| `formatWeekdayInitial` | `(date, locale)` | `weekday:'narrow'`, porque em português "seg." não cabe num sétimo de tela | `:196-230` |
| `formatWeekdayShort` | `(weekday: number, locale)` | ancorado em `Date.UTC(2026, 8, 6)`, que é domingo | `:232-245` |
| `plural` | `(n, {one, other}, display?)` | frases inteiras, nunca número colado em substantivo | `:46-89` |
| `joinList` | `(parts, and)` | *"6 insumos, 2 receitas e 1 produto"* | `:255-265` |

A moeda decide a **região**, e é por isso que é pergunta separada do idioma: espanhol escreve
`1.234,56` na Espanha e `1,234.56` no México (`i18n.test.ts:105-146`), com asserções em cinco
dígitos de propósito — com quatro, as duas escritas coincidiriam e o teste diria o contrário do
que existe para provar (`i18n.test.ts:126-131`).

Os três idiomas suportados: `LanguageTag = 'pt-BR' | 'es' | 'en'` (`i18n/index.ts:8`), padrão
`{ language: 'pt-BR', formatting: 'pt-BR', currency: 'BRL', timeZone: 'America/Sao_Paulo' }`
(`i18n/index.ts:25-30`). Oito moedas, cada uma com a região que decide o formato —
`CURRENCIES = [{BRL,BR}, {USD,US}, {EUR,ES}, {MXN,MX}, {ARS,AR}, {CLP,CL}, {COP,CO}, {PYG,PY}]`
(`src/i18n/company.ts:19-28`) — e as oito nomeadas nos três dicionários (`pt-BR.ts:1137-1146`:
`Real`, `Dólar`, `Euro`, `Peso mexicano`, `Peso argentino`, `Peso chileno`, `Peso colombiano`,
`Guarani`), conferidas uma a uma em `i18n.test.ts:171-191`. `formattingFor(idioma, moeda)`
devolve a tag de formatação: `('es','MXN') → 'es-MX'`, `('es','EUR') → 'es-ES'`,
`('pt-BR','USD') → 'pt-BR'` (português não muda de formato com a moeda), e moeda fora da lista
cai no idioma sozinho — *"pior formato, nunca erro"* (`i18n.test.ts:114-123`).

#### 2.5.4 Estado de chaves sem leitor

`common.allClear` (`'Hoje está tudo em ordem.'`, `pt-BR.ts:24`) existe nos três dicionários
(`en.ts:15`, `es.ts:20`) e **nenhuma tela a lê** — a varredura de `t.common.X` acha apenas
`amountOf` e `and` (`app/inputs/[id].tsx:339`, `app/lots/[id].tsx:114`,
`app/production/new.tsx:296,301`, `app/orders/new.tsx:257`, `app/products/index.tsx:98`,
`app/settings.tsx:161`). **Implementado sem chamador.** O `dictionary.test.ts` não pega isso por
desenho declarado: ele mede **seção**, não chave, porque a varredura por chave acusou 44 folhas
e boa parte era falso positivo do detector (`src/dictionary.test.ts:27-31`).

---

### 2.6 Fundação 5 — a camada de dados devolve fato, não frase

#### 2.6.1 A regra e as duas fundações que se encontram nela

`src/layers.test.ts:7-19` diz as duas ao mesmo tempo:

> Two foundations meet here. The data layer returns facts, not sentences - a module that knows
> what depends on what has no business speaking Portuguese. And the assistant never writes a
> query of its own: it calls the same functions the screens call, because an assistant with its
> own SQL produces a second number for the same question and destroys the app's credibility in
> a single afternoon.
> Both were true when this was written and neither was enforced by anything. Convention
> survives until somebody is in a hurry.

O servidor diz a mesma coisa sobre a view de saldo: *"This view is the single source both the
screens and the assistant read from - two consumers, one truth"* (`0001:249-252`).

#### 2.6.2 A separação, no código

| camada | fala português? | escreve SQL? | exemplo |
|---|---|---|---|
| `src/data/` | não | **sim, e só ela** | `repository.ts` (4.525 linhas), `db.ts`, `seed.ts`, `outbox.ts` |
| `src/domain/` | não | não | `alerts.ts` devolve `Alert`/`AlertFacts`, e o docblock diz: *"E o que este módulo NÃO faz: falar português e falar com o sistema operacional. Ele devolve fato"* (`alerts.ts:24-27`) |
| `src/notify/facts.ts` | não | não (chama a camada de dados) | *"Fato é trabalho da camada de dados e se prova aqui; plataforma é a única coisa que fica lá"* (`facts.ts:20-21`) |
| `src/notify/phrase.ts` | **sim** | não | `alertPhrase(alert, t)` devolve `{title, body}` lidos de `t.alertText[alert.kind]` (`phrase.ts:20-51`) |
| `app/` (telas) | **sim** | não | leem `t` do dicionário |

`AlertFacts` (`src/domain/alerts.ts:182-225`) é o exemplo canônico de "fato": campos `cover`,
`orders`, `volumes`, `expiring`, `ambient`, todos numéricos ou de id, com o comentário *"Os
fatos de onde os avisos saem. Nada aqui fala português"* (`alerts.ts:182`).

A separação de `phrase.ts` do componente que agenda foi feita por uma razão escrita: *"regra que
mora em componente é regra que o `mutate` não alcança e que nenhum teste importa"*
(`phrase.ts:7-9`).

#### 2.6.3 Verificação por máquina

`src/layers.test.ts:73-97` — duas metades que só valem juntas:

1. `only the data layer speaks SQL`: varre `app` mais **toda** pasta de `src` que não seja
   `data`, e reprova qualquer arquivo cujo código (sem comentários) casa o padrão `SQL`.
2. `the data layer is where SQL actually is`: exige `withSql.length >= 3` em `src/data` —
   *"A rule that would pass on an empty repository proves nothing"* (`layers.test.ts:92-94`).

---

### 2.7 Fundação 6 — multi-empresa desde a primeira linha

`0001_foundation.sql:4-12` lista as três coisas que *"cannot be retrofitted later"*, e a
primeira é esta: *"Every row carries company_id from the very first migration. Adding tenancy
after real customers are inside is what kills products."*

- `companies` (`0001:21-33`): `id`, `name`, `language default 'pt-BR'`, `currency default
  'BRL'`, `time_zone default 'America/Sao_Paulo'`, `modules jsonb default '{}'`, `created_at`.
  O comentário de `modules` é decisão de produto: *"Disabled means invisible, never greyed out -
  a locked field reads as a money grab"* (`0001:35-38`).
- `memberships` (`0001:57-72`): `company_id`, `user_id → auth.users`, `display_name`,
  `capabilities capability[] default '{}'`, `prefers_conversation boolean default false`
  (*"Deliberately not called 'simple mode': nobody should open a setting that implies they are
  the simple one"*, `0001:63-64`), `assistant_autonomy smallint default 2 check (between 1 and
  4)`, `unique (company_id, user_id)`.
- RLS ligado em `companies`, `memberships`, `locations`, `items`, `lots`, `movements`
  (`0001:266-271`) e em `devices` (`0013:44`).
- Chaves compostas para que "existe" não seja confundido com "é desta fábrica":
  `unique (id, company_id)` em `locations` e `items` (`0019:36-37`), usadas pelas FKs de
  `orders`/`order_lines` (`0019:68-87`) e de `movements` (`0029:29-45`).
- No aparelho **não há RLS**, e a razão está escrita: *"the device already holds exactly one
  user's data, and the server is the boundary that matters"* (`db.ts:10-11`). Toda tabela do
  SQLite tem `company_id TEXT NOT NULL` mesmo assim (`db.ts:32, 48, 58, 67, 77, 89, 100, 110,
  119, 219, 227, ...`).
- `LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001'` (`src/data/seed.ts:12`), com a
  frase que fecha a fundação: *"One local company until sign-in lands; every row is already
  stamped with it, so multi-company stops being a migration later and becomes a login"*
  (`seed.ts:7-11`).

Verificação: `db:verify` check 4 (isolamento entre inquilinos, números em 2.4.7) e check 10 —
*"o razão recusa item e local de outra empresa"* (`scripts/verify-migrations.sh:732`).

---

### 2.8 Fundação 7 — "depende" vira dado, nunca código, e nunca pergunta

#### 2.8.1 A borda das perguntas, transcrita

`CLAUDE.md:52-65`:

> **E quando não há escolha, não há pergunta.** Se a coisa tem que ser feita, faça — pedir
> permissão para o óbvio ("achei o bug; quer que eu conserte?") não é cautela, é devolver
> trabalho embrulhado como consulta. Perguntar custa uma rodada dele e não compra informação
> nenhuma.
>
> A borda, para a regra não virar desculpa. Pergunta-se em três casos, e só:
> 1. **A resposta muda o que é construído** — e não é preferência de cliente, que vira
>    configuração em vez de pergunta.
> 2. **É irreversível** — destruir dado, publicar para fora, gastar dinheiro dele.
> 3. **É decisão de dono** — faseamento, preço, marca, o que entra em produção.
>
> Fora desses três: decida, faça, e **diga o que foi feito e por quê**. Assumir e avisar é
> melhor que perguntar e esperar; assumir e calar é pior que as duas.

#### 2.8.2 Toda configuração que existe hoje, com o padrão e o estado

| configuração | onde mora | padrão | estado |
|---|---|---|---|
| `companies.language` / `currency` / `time_zone` | `0001:26-28`; no aparelho via `localeFrom` (`src/i18n/company.ts`) | `pt-BR` / `BRL` / `America/Sao_Paulo` | lido por tela (Ajustes) |
| `companies.modules jsonb` | `0001:31` | `{}` | **planejado** — nenhum leitor no aparelho |
| `companies.join_code text unique` | `0011:55` | nulo | **planejado** — não há tela de convite |
| `companies.floor_sign_in` (`personal` \| `shared`) | `0011:65-68` | `personal`, *"porque é o que não exige preparo nenhum"* (`0011:62-64`) | **NÃO IMPLEMENTADO no aparelho** — nenhuma referência a `floor_sign_in` nem grade de PIN em `src/` ou `app/` |
| `companies.names_who_recorded boolean` | `0012:20-25` | `false`, *"localizar a perda, não acusar"* | **planejado** — sem leitor no aparelho |
| `companies.orders_need_approval boolean` | `0019:39-44` | `false`, *"a fábrica pequena entrega antes de a aprovação chegar"* | espelhado no aparelho como `app_meta['orders.needApproval']` (`repository.ts:3968-3984`), **lido e escrito por `app/settings.tsx:243, 1030`** |
| `memberships.prefers_conversation` | `0001:63-65` | `false` | **planejado** |
| `memberships.assistant_autonomy` (1-4) | `0001:66-69` | `2` (*"1 informs, 2 prepares, 3 routine, 4 autonomous"*) | **planejado**; o piso de `ALWAYS_CONFIRMED` vale em qualquer nível |
| `locations.sensor_ranges` (JSON) | `db.ts:619` | `{}` | lido pelas leituras de câmara |
| `AlertSettings` completo | `app_meta['alerts.settings']` (`repository.ts:3924-3966`) | ver abaixo | **lido por `app/settings.tsx:253`** |
| ordem das peças da capa (**da empresa**) | `app_meta['briefing.order']`, texto separado por vírgula (`repository.ts:3888-3906`) | vazio = ordem de fábrica | **lido por `app/settings.tsx:194`** |
| peças silenciadas (**do aparelho**) | `app_meta['briefing.hidden']` (`repository.ts:3915-3922`) | vazio | **lido por `app/settings.tsx:194`** |
| `products.packaging_items` vs `unit_packaging_cents` | `db.ts:559-561` | lista vazia | os dois caminhos existem: *"Quem não quer contar palito no estoque digita o valor e segue; quem quer, lista os itens"* (`db.ts:555-557`) |

`DEFAULT_ALERTS` (`src/domain/alerts.ts:108-119`), transcrito:

```ts
on: { insumo: true, pedido: true, volume: false, validade: true, ambiente: true },
daysAhead: { insumo: 3, pedido: 2, validade: 7 },
bands: { red: 25, yellow: 40, blue: 80, notifyFull: false },
minuteOfDay: 7 * 60,
weekdays: 0,
```

Cada default carrega a razão escrita: `ambiente` nasce **ligado** porque *"câmara fora de faixa
estraga o estoque inteiro em uma noite"* (`alerts.ts:109-113`); `notifyFull` nasce **desligado**
porque *"Almoxarifado cheio depois de uma compra é estado DESEJADO, e um aviso diário sobre
estado desejado é exatamente o alerta que ensina a ignorar alerta"* (`alerts.ts:64-77`);
`minuteOfDay` é **minuto do dia**, 0 a 1439, e não uma lista de horas, porque *"Oferecer seis
opções não é configurar, é um menu disfarçado de escolha — e a fábrica que começa às 5h30 não
estava em nenhuma delas"* (`alerts.ts:80-96`); `weekdays: 0` significa **todos** os dias, não
nenhum (`alerts.ts:98-105`).

O exemplo mais completo da F7 em um arquivo é `src/domain/briefing.ts:1-22`: a **ordem** da capa
é da empresa (*"Se o dono monta a capa que quer e o operador vê outra, a frase mais comum de uma
fábrica — 'olha lá na tela inicial' — deixa de funcionar"*), o **silenciar** é do aparelho, e
`ligar não é forçar` — peça ligada sem nada a dizer continua não aparecendo, senão a capa enche
de "0 caixas hoje" (`briefing.ts:18-21`). Catálogo de 14 peças em `briefing.ts:23-38`, com
`DEFAULT_OFF = {'custo', 'parado'}` (`briefing.ts:58`).

E a F7 no banco, não na tela: o estado inicial de um pedido é decidido por **gatilho**
(`private.order_starts_where_the_company_says`, `0019:103-122`), porque *"Uma empresa que exige
aprovação e um cliente que manda o pedido pelo próprio aparelho é exatamente o caso em que a
regra não pode morar no aplicativo: o payload vem de fora, e 'status' é um campo como outro
qualquer no JSON"* (`0019:98-102`). Sair do pendente é só de quem tem `approve_order`, por um
segundo gatilho (`private.only_approval_leaves_pending`, `0019:130-141`), *"Sem este gatilho,
essa mesma pessoa tiraria um pedido do pendente sem nunca ter tido `approve_order`, e a
aprovação que a empresa ligou seria decoração"* (`0019:124-129`). Provado no `db:verify` check 8
(`scripts/verify-migrations.sh:637`).

#### 2.8.3 A primeira coisa que a F7 já resolveu (transcrito)

`CLAUDE.md:432-438`:

> Perguntavam se a câmara fria é saldo separado ou o mesmo saldo noutra sala. Depende da
> fábrica — então vira dado: o saldo passa a filtrar por local, e quem tem um lugar só tem um
> local só. Hoje `ensureLocation` cria uma `location` única cujo id é o `company_id`, e as três
> consultas de saldo somam `WHERE company_id = ? AND item_id = ?`, sem `location_id` — correto
> para um lugar, e é essa generalização que a Fase 2 pede primeiro.

**Estado atual, medido:** a generalização foi feita. `ensureLocation` continua criando o lugar
padrão com `id = company_id` (`repository.ts:847-865`), e `defaultLocationId(companyId)`
devolve `companyId` (`repository.ts:843-845`) — mas as consultas de saldo já filtram por sala:
`recordCount` soma `WHERE company_id = ? AND item_id = ? AND location_id = ?`
(`repository.ts:923-927`), `recordProduction` confere o piso `WHERE m.company_id = ? AND
m.location_id = ?` (`repository.ts:1437-1444`), e `stockByPlace` agrupa por `location_id`
(`repository.ts:793-805`). Três guards de fonte em `layers.test.ts` existem exatamente para
impedir a volta atrás (2.11.4, 2.11.5, 2.11.6).

---

### 2.9 A Lei da Inteligência — texto literal

`CLAUDE.md:69-86`:

> Toda tela responde três coisas: **o que é normal ali, o que está diferente agora, e qual é a
> próxima ação provável.** Tela que não responde as três não está pronta.
>
> 1. Nunca peça o que o sistema pode deduzir.
> 2. Nenhum campo nasce vazio.
> 3. Nenhum número aparece sozinho — sempre com a comparação.
> 4. Avise na **data da decisão**, não na data do problema.
> 5. Erro se **impede**, não se reclama.
> 6. Toda conclusão abre a conta (`[por quê?]`).
> 7. "Está tudo bem" é estado válido e bonito. Alerta inventado ensina a ignorar alerta.
>
> O sistema **sugere, nunca decide calado**. E a inteligência é matemática determinística sobre
> o livro-razão — por isso funciona offline, e por isso o `[por quê?]` é possível.

#### Lei 1 — nunca peça o que o sistema pode deduzir

| onde aparece | o que deduz | estado |
|---|---|---|
| `src/data/repository.ts:707-733` (`lastSentBaseUnits`) | quanto foi da última vez para **aquela loja**; lê a perna de **entrada no destino**, não a saída na origem | chamado por tela (transferência) |
| `src/data/repository.ts:1905-1912` (`shelfLifeDays`) | validade perguntada uma vez no cadastro, *"para nunca mais ser perguntada no tacho: cada corrida nasce com a validade calculada"* | chamado por tela |
| `src/data/repository.ts:3006-3016` (`lotsInStock`) | qual lote despachar: o mais velho primeiro — *"quem despacha não escolhe lote, despacha o que está na frente"* | chamado por tela |
| `src/weather/index.ts:23-27` | a cidade sai do fuso do aparelho (`America/Sao_Paulo`), e o palpite é visível e trocável num toque | chamado por tela |

#### Lei 2 — nenhum campo nasce vazio

`repository.ts:708-717` cita as duas leis juntas e nomeia o limite honesto: *"A primeira remessa
de um produto para uma loja não tem palpite nenhum, e é honesto que não tenha — mas da segunda
em diante o livro-razão já sabe, e quem carrega a caixa confirma em vez de digitar."*
`app/orders/new.tsx:44` registra o mesmo para a data do pedido: o padrão é *"o que a fábrica
combina na maioria das ligações"*.

#### Lei 3 — nenhum número aparece sozinho

É a única lei com **registro executável**: `src/law.test.ts` (seção 2.10). Onde ela aparece
desenhada em vez de escrita: `src/components/Sky.tsx:210` (*"21° sozinho não diz nada"*),
`src/home/Mosaic.tsx:199` e `:505`, `app/places.tsx:203` e `:407`,
`src/theme/contrast.test.ts:13`, e `docs/linguagem.md:126-131` — *"Contagem regressiva compara
com o próprio limite; estado ao vivo responde 'o que está diferente agora'; e quando não há o
que comparar, o motivo fica escrito."*

#### Lei 4 — avise na data da decisão

`src/domain/alerts.ts:12-15`: *"Insumo que acaba quinta com dois dias de compra tem que avisar
terça. É por isso que o piso é em DIAS DE ANTECEDÊNCIA e não em quantidade: quantidade não sabe
quanto tempo leva para chegar."* No servidor, o mesmo raciocínio aparece em `0019:55-57`: a data
pedida pelo cliente é uma coisa, e *"A data da DECISÃO é outra e é mais cedo — quem precisa na
sexta produz na quinta — e essa conta é da tela"*. Nas telas: `app/places.tsx:283`,
`app/orders/new.tsx:51`.

#### Lei 5 — erro se impede, não se reclama

| implementação | onde |
|---|---|
| `NotEnoughStockError`, com a lista de **quais** insumos faltaram (`missing: {itemId, name, needed, held}[]`) — *"'faltou insumo' manda a pessoa procurar"* | `repository.ts:1295-1309` |
| o piso do razão roda **antes** da escrita, e é o piso **da sala** — a simulação levou a polpa a `-192.000 g` sem uma reclamação porque nada no caminho de escrita conferia | `repository.ts:1412-1465` |
| `recordCount` exige `locationId` **sem default**: *"o chamador diz onde, ou não compila"* | `repository.ts:906-917` |
| `planReversal` carrega o plano inteiro, com `blocked`, para a tela dizer o caminho | `repository.ts:4245-4314`, `:4221` |
| `erase.ts` recusa antes de a pessoa apertar, com o motivo e o número junto | `src/data/erase.ts:12-14`, `src/data/erase.test.ts:150` |
| `GridTakenError`, `TypeIsFromAnotherLineError`, `RunGoneError`, `CannotReverseError` | `repository.ts:1977, 3762, 2384, 4448` |
| no banco: `loss_needs_reason`, `reversal_points_somewhere`, `movement_moved_something` | `0001:220-223`, `0008:54-55` |
| `Card` com `title` e sem `icon` **não compila** | `docs/linguagem.md:44-46` |

#### Lei 6 — toda conclusão abre a conta (`[por quê?]`)

- `WhySheet` (`src/components/WhySheet.tsx`) — **chamada por uma tela só**:
  `app/recipes/[id].tsx:12` e `:625`, com o botão marcado *"Lei 6: toda conclusão abre a conta.
  Fantasma, porque a ação desta tela é outra"* (`app/recipes/[id].tsx:458`).
- `itemMovements` (`repository.ts:980-986`): *"This is the `[por quê?]` of a stock figure. A
  number the person cannot open is a number they have to take on faith, and faith is exactly
  what an app asking someone to change how they run their factory has not earned yet."*
- No assistente, `Answer.detail` é *"What `[por quê?]` opens: the arithmetic behind the
  sentence"* (`src/assistant/types.ts:125-126`), e `Answer.list` foi separado dele porque o que
  **não é conta** não pode se esconder atrás do rótulo "POR QUÊ?" (`types.ts:127-141`).
- Outros pontos com a conta aberta: `app/lots/[id].tsx:245`, `app/weather.tsx:129`,
  `app/assistant.tsx:241,264`.
- Fronteira registrada: o `[por quê?]` **não** existe na capa, e isso é decisão, não defeito —
  *"a conta abre num toque, na receita"* (`CLAUDE.md:352-356`).

#### Lei 7 — "está tudo bem" é estado válido e bonito

| implementação | onde |
|---|---|
| `FAIXAS_QUE_AVISAM = {'zerado','vermelho','amarelo','azul'}` — o **verde nunca interrompe**; *"um aviso de que está tudo bem chega uma vez, e a partir da segunda ele ensina a ignorar o aviso de que não está"* | `src/domain/alerts.ts:148-156` |
| sem consumo registrado não há data de acabar, então não há aviso; item sem faixa cadastrada não alarma; pedido já coberto não alarma | `src/domain/alerts.ts:17-19`, provado em `src/domain/alerts.test.ts:40` |
| `volumeBand` devolve `null` sem `fullLevel` — *"inventar uma régua para poder pintar a linha seria número que ninguém pode conferir"* | `alerts.ts:121-146` |
| o clima devolve só fato medido, e não estima demanda: *"Prometer a conclusão antes do dado seria o alerta inventado da Lei 7, com um número em cima"* | `src/weather/index.ts:1-15` |
| `ligar não é forçar` na capa | `src/domain/briefing.ts:18-21` |
| o **empate como terceiro estado**: `delta >= 0` imprimia "0% acima de ontem" com 480 e 480 na tela; hoje há `sameAsYesterday` e `nearYesterday` | `docs/linguagem.md:158-160`; `pt-BR.ts:793-796`; `app/(tabs)/production.tsx:121-140` |
| estado vazio é **desenho + frase + próxima ação**, nunca frase cinza no meio da tela | `docs/linguagem.md:133-137` |
| frases de "tudo bem" no dicionário: `inputsFine`/`inputsFineDetail`, `ordersCovered`/`ordersCoveredDetail`, `steadyDetail` | `pt-BR.ts:71-77`, `:147` |

Onde a Lei 7 aparece como regra de **guard**, e não de tela: `src/layers.test.ts:56-70` recusa
alargar a exceção de prosa porque *"Alarme falso num guard é pior que guard ausente: ensina a
ignorar a saída dele"*, e `src/law.test.ts:16-20` explica por que a Lei 3 é registro e não
heurística — *"Alarme inventado ensina a ignorar alarme - é a mesma doença que o item 7 da lei
proíbe."*

---

### 2.10 `src/law.test.ts` — a Lei 3 virando teste executável

#### 2.10.1 Por que existe

`law.test.ts:6-13`: *"Ela estava escrita no `CLAUDE.md` desde o começo e não era conferida por
nada. Numa auditoria só, três telas foram achadas anunciando um número nu: '3 destinos hoje' no
transporte, 'R$ 1.552,50 parado' no almoxarifado, 'R$ 148 em 4 perdas' no relatório. Nenhuma
suíte reclamou, porque a lei mora num arquivo de texto e o texto não roda."*

E por que é **registro** e não heurística (`law.test.ts:15-24`): exigir que todo `type.figure`
venha acompanhado de algo alarma errado — num formulário o número grande é o que a pessoa está
digitando, e a comparação dele é o próprio formulário. Então cada tela declara o que responde ao
lado do número, **ou por que não há o que comparar**.

#### 2.10.2 O mecanismo, transcrito

```ts
/** O estilo do número que a tela existe para dizer. */
const NUMERO_GRANDE = 'type.figure';                                    // law.test.ts:36

type Declaracao =
  | { compara: RegExp }   // o `com` é o rastro no arquivo de quem faz a comparação
  | { sozinho: string };  // não compara, e o motivo fica escrito                // :38-42

function codigo(fonte: string): string {                                 // :113-116
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function quantidadeDeNumeros(fonte: string): number {                    // :118-121
  return codigo(fonte).split(NUMERO_GRANDE).length - 1;
}

const COM_NUMERO = [...telasEm('app'), ...telasEm('src/home')].filter((caminho) =>
  codigo(readFileSync(caminho, 'utf8')).includes(NUMERO_GRANDE),
);                                                                       // :133-135
```

`telasEm(dir)` desce recursivamente e pega todo `.tsx` que não seja `.test.tsx`
(`law.test.ts:123-131`).

**A régua era por arquivo e virou por número.** O docblock registra a cicatriz:
*"`Mosaic.tsx` passou verde por comparar a produção com ontem enquanto as caixas, as corridas
abertas e as entregas do dia apareciam nuas ao lado. Nove figuras nunca foram conferidas por
nada"* (`law.test.ts:26-32`). Hoje a **contagem tem que bater**: `assert.equal(lista.length,
quantos)` (`law.test.ts:149-155`).

#### 2.10.3 O registro inteiro — 15 telas, 26 declarações

| arquivo | nº | declaração |
|---|---|---|
| `src/home/Mosaic.tsx` | 10 | 1 `compara: /noYesterday\|madeYesterday/`; 2 `sozinho` (contagem regressiva: *"'3 dias · Polpa' já é a distância até o fim"*); 3 `compara: /noBoxesYesterday\|boxesYesterday/`; 4 `compara: /warmerBy\|weather\.same/`; 5 `sozinho` (tachos abertos AGORA: *"Estado ao vivo responde a segunda pergunta da lei"*); 6 `compara: /coverDays\|coverTightest/`; 7 `sozinho` (entregas do dia que não saíram: *"se compara com o próprio acordo de dia, e não com ontem"*); 8 `compara: /lossVsBefore\|lossFirst/`; 9 `compara: /Sparkline/`; 10 `compara: /heldDetail\|coverDays/` |
| `app/(tabs)/production.tsx` | 1 | `compara: /vsYesterday\|noYesterday/` |
| `app/(tabs)/reports.tsx` | 3 | `/coverDays\|placeCount/`, `/Sparkline/`, `/lossVsBefore\|lossFirst/` |
| `app/(tabs)/transport.tsx` | 1 | `compara: /vsYesterday\|firstDay/` |
| `app/places.tsx` | 1 | `compara: /worth/` — *"É a Lei 6 respondendo a Lei 3 — a conclusão abre a conta"* |
| `app/recipes/index.tsx` | 1 | `compara: /orderedByBatch/` |
| `app/inputs/index.tsx` | 1 | `compara: /shortestCover\|coverUnknown\|coverComfortable/` |
| `app/inputs/[id].tsx` | 1 | `compara: /wentUp\|wentDown/` |
| `app/losses.tsx` | 1 | `compara: /vsPrevious\|firstWindow/` |
| `app/recipes/[id].tsx` | 1 | `compara: /summaryCheaper\|summaryDearer\|delta/` |
| `app/lots/[id].tsx` | 1 | `sozinho`: *"o número grande é o CÓDIGO do lote, não uma medida. Código não tem mais nem menos, e comparar dois códigos não decide nada."* |
| `app/purchase.tsx` | 1 | `sozinho`: *"formulário: o número é o total da nota que a pessoa está digitando agora. A comparação dele é a própria nota na mão dela."* |
| `app/inputs/new.tsx` | 1 | `sozinho`: *"formulário: o número é o custo que acabou de ser digitado, ainda não é história."* |
| `app/products/new.tsx` | 1 | `sozinho`: *"formulário: o número é o rendimento que a pessoa está definindo agora."* |
| `app/production/new.tsx` | 1 | `sozinho`: *"formulário: o número é o que a corrida vai gravar. O que ela vai custar aparece na confirmação, antes de virar história."* |

Totais: **18 `compara`** e **8 `sozinho`**.

#### 2.10.4 Os dois testes e o que cada um garante

1. `every headline number says what it is being compared against` (`law.test.ts:137-164`):
   - tela com número grande e **fora** do registro → falha, com a mensagem *"A Lei da
     Inteligência (3) pede a comparação ao lado do número: declare qual é, ou escreva por que
     essa tela não tem o que comparar."*
   - contagem declarada ≠ contagem real de `type.figure` → falha.
   - `compara` cuja regex não casa mais o arquivo → falha (*"declarou que compara, e a
     comparação sumiu do arquivo"*).
   - `sozinho` com menos de 40 caracteres → falha (*"o motivo tem que ser um motivo"*).
2. `the registry does not outlive the screens` (`law.test.ts:166-175`): tela declarada que não
   mostra mais número grande → falha, *"senão o registro vira lista de telas que não existem
   mais."*

**O que este teste NÃO prova**, e o próprio arquivo diz: que a comparação declarada seja a
comparação **certa** para aquele número. Ele prova que existe uma resposta escrita e que o
rastro dela ainda está no arquivo.

---

### 2.11 `src/layers.test.ts` — quatorze testes, oito réguas

`src/layers.test.ts` é o arquivo que transforma fronteira em teste. Ele tem **14 testes** e
exporta três funções (`contagemCega`, `pisoDeOutraSala`, `porCentoNaMao`) exatamente para que a
régua possa ser exercitada com a cicatriz **e** com o conserto.

Duas mecânicas comuns a quase todas:

```ts
function code(source: string): string {                                  // layers.test.ts:23-26
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
// "Comments talk about SQL all the time; only code counts."
```

e a **sentinela**: `assert.ok(fontes.length > 20, 'a varredura de fontes veio vazia — a
comparação seria de graça')` (`:258`, `:324`, `:433`, `:504`). Sem ela, um erro de caminho faria
o teste passar sem ter olhado nada.

#### 2.11.1 Só a camada de dados fala SQL

```ts
const SQL = /\b(SELECT\s+[\s\S]*?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+[\s\S]*?\bSET\b|DELETE\s+FROM\b)/i;
```
(`layers.test.ts:21`)

As pastas são **descobertas, não listadas** (`layersOutsideData()`, `:49-54`): `['app', ...toda
pasta de src que não é 'data']`. A razão é uma cicatriz: *"uma lista escrita à mão significa que
a pasta NOVA nasce fora da regra: `src/weather` foi criada e a checagem continuou verde sem
nunca ter olhado para ela"* (`:43-47`).

A única exceção é `PROSA = /^src\/i18n\/locales\//` (`:71`), e ela tem quatro parágrafos de
justificativa (`:56-70`): o padrão de `UPDATE ... SET` atravessa linhas de propósito, e a palavra
"update" numa frase de dicionário casou com um "set" vinte linhas depois. Estreitar o padrão
enfraqueceria o guard onde ele importa; tirar a prosa não enfraquece nada.

O teste de controle (`:91-97`) exige `>= 3` arquivos com SQL em `src/data`, e o teste de exceção
(`:115-129`) prova que `PROSA` é do tamanho exato do problema: casa
`src/i18n/locales/pt-BR.ts`, **não** casa `src/i18n/index.ts` nem `src/home/Mosaic.tsx`, e o
padrão `SQL` continua achando SQL de verdade em duas linhas e ignorando a frase
`'a frase diz que o app se atualiza sozinho e o campo fica set'`.

#### 2.11.2 A suíte roda todo arquivo de teste

`:99-113` fixa as **aspas** no glob de `package.json`: `src/**/*.test.ts` sem aspas é expandido
pelo shell, que sem `globstar` lê `**` como um nível só — e este arquivo, na raiz de `src/`,
nunca era executado. *"a test that never runs is indistinguishable from a test that passes."*

#### 2.11.3 Nenhuma tela escreve frase própria

A régua é a **palavra funcional**, não o acento, e a correção tem história de cinco minutos
escrita no docblock: a primeira versão procurava acento e se dizia capaz de ter pegado o
`WhySheet` — mas *"Custo do lote" não tem acento nenhum. O guard passaria verde na própria
cicatriz que ele cita, o que é pior que não existir"* (`:141-146`).

```ts
const PALAVRAS = ['do', 'da', 'de', 'no', 'na', 'em', 'para', 'por', 'com', 'que'];  // :153

function pareceFrase(linha: string): boolean {                            // :166-174
  const literais = linha.match(/(['"`])[^'"`]{4,}\1/g) ?? [];
  return literais.some((bruto) => {
    const texto = bruto.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ');
    if (!texto.includes(' ')) return false;
    if (texto.includes('/') || texto.includes('=')) return false;
    return new RegExp(`\\b(${PALAVRAS.join('|')})\\b`, 'i').test(texto);
  });
}
```

As três condições saíram de três alarmes falsos, cada um citado (`:155-165`): `'as'` na lista
acusava `as Draft['kind']` (palavra-chave do TypeScript); sem exigir espaço, `'input'` casava;
sem excluir caminho, `'@/domain/day'` casava com "do". A interpolação sai antes da conta porque
`${formatQuantity(...)}` é composição de pedaço já traduzido.

As pastas que desenham são três mais `app`: `screenLayers()` = `['app', 'src/components',
'src/home', 'src/notify']` (`:176-182`) — *"`src/data` semeia exemplo, e exemplo é dado"*. Linhas
de `import`, `from '@…'`, `router.push/replace`, `getByLabel` e `goto(` são puladas (`:195`).

O teste-espelho (`:210-228`) reprova a cicatriz literal (`<Text>{'Custo do lote'}</Text>`,
`const titulo = "Perda prevista no lote";`) e aprova os quatro inocentes.

#### 2.11.4 O aviso de validade nunca é preso a uma sala

`:230-281`. A cicatriz é sobre **onde o defeito mora**: `expiringSoon` estava certa — aceita a
sala como parâmetro opcional e, sem ele, responde pela empresa inteira. Quem errava eram os dois
chamadores (a capa e o alarme do celular), que passavam o almoxarifado. *"A soma por local de um
lote que saiu do almoxarifado dá zero ali, e o `HAVING SUM(...) > 0` o descarta. Então o filtro
silenciava o aviso EXATAMENTE no dia em que o picolé ia para a câmara fria — que, numa fábrica de
picolés, é o dia seguinte ao de produzi-lo"* (`:234-241`).

A régua: casar `(?<!function )expiringSoon\(([^)]*)\)` e reprovar toda chamada com **4 ou mais**
argumentos, porque o quarto é a sala (`:266-269`). O `(?<!function )` existe para a guarda não
acusar a própria declaração em `repository.ts`.

Por que guard de fonte e não teste de unidade, escrito no arquivo: *"Um teste de unidade
chamando `expiringSoon` diretamente passa nos dois mundos — foi o que aconteceu: escrevi o teste
da regra, ele passou, e a mutação que devolvia o filtro à capa ATRAVESSOU a suíte inteira"*
(`:243-251`). E o que ele **não** prova: que a capa **desenhe** o aviso; prova que ela não o
restringe a uma sala (`:253-254`).

#### 2.11.5 A sala que a contagem grava é a sala que a tela mostrou

`:283-368`. A cicatriz, com os dois lados: `app/inputs/[id].tsx` mostrava
`item.onHandBaseUnits` (o total da **empresa**, porque `findItem` era chamada sem sala) e gravava
a diferença com `locationId: defaultLocationId(...)` (o almoxarifado). *"Com a polpa dividida
entre a fábrica e a câmara fria, contar a prateleira da fábrica 'encontrava' uma falta do tamanho
exato do que estava na câmara... estoque teleportado, com o operador tendo feito tudo certo e o
livro-razão guardando a mentira para sempre — contagem não se apaga, se estorna"* (`:285-293`).

```ts
export function contagemCega(texto: string): string[] {                   // :309-320
  const achados: string[] = [];
  for (const m of texto.matchAll(/recordCount\(([\s\S]{0,400}?)\)\s*;/g)) {
    const local = m[1].match(/locationId:\s*([^,\n]+)/);
    if (!local) continue;
    const valor = local[1].trim();
    if (/\w\(|LOCAL_COMPANY_ID|companyId/.test(valor)) achados.push(valor);
  }
  return achados;
}
```

A régua em uma frase (`:301-305`): numa tela, o local de uma contagem tem de ser um **valor que a
tela calculou**; chamada de função no lugar do local é o padrão do defeito. Os quatro casos do
teste-espelho (`:341-368`): reprova `defaultLocationId(LOCAL_COMPANY_ID)`, reprova
`locationId: LOCAL_COMPANY_ID`, aprova `locationId: contarEm`, e ignora chamada sem local —
porque quem exige o campo é o tipo, e ele já reprova na compilação.

#### 2.11.6 A tela que produz lê o piso da sala do tacho

`:401-468`. A cicatriz: `recordProduction` confere o piso da sala (com a razão escrita), mas a
tela continuou lendo `listItems(LOCAL_COMPANY_ID)` — o total da empresa — para decidir se libera
o botão. *"Com a polpa na câmara fria, que é onde polpa mora numa fábrica de picolés, a tela
dizia que havia polpa, liberava o botão, e **toda** corrida batia no piso do livro-razão com um
erro de programador em inglês"* (`:405-412`).

```ts
export function pisoDeOutraSala(texto: string): string[] {                // :417-429
  if (!/recordProduction\(/.test(texto)) return [];
  const achados: string[] = [];
  for (const m of texto.matchAll(/listItems\(([^)]*)\)/g)) {
    const args = m[1].split(',').map((a) => a.trim()).filter(Boolean);
    // companyId, tipo, inativos, sala — sem o quarto, o saldo é o da empresa.
    if (args.length < 4) achados.push(`listItems(${args.join(', ')})`);
  }
  return achados;
}
```

A mensagem de falha amarra a Lei 5: *"Ler o total aqui libera um botão que a escrita vai
recusar — e a Lei 5 diz que o erro impede, não reclama"* (`:445-446`). O teste-espelho garante
que a régua **não fala com quem não produz**: a lista do almoxarifado lê a empresa inteira de
propósito e está certa (`:465-467`).

#### 2.11.7 Nenhum por cento montado à mão

`:470-542`. A cicatriz é de conserto pela metade: `formatPercent` foi escrita e três chamadores
não foram trocados — a tela do insumo (duas vezes), a tela da compra, e o assistente, este com
`.replace('.', ',')`, *"que acerta em português e erra no espanhol do México, onde o separador
decimal É o ponto"* (`:472-479`). *"O repositório PARECE consertado, porque a função certa existe
e tem chamadores — só não todos"* (`:481-483`).

```ts
export function porCentoNaMao(texto: string): string[] {                  // :489-500
  return texto
    .split('\n')
    .filter((linha) => /\*\s*100\s*\)?\s*\.toFixed\(/.test(linha) && linha.includes('%'))
    .map((linha) => linha.trim().slice(0, 80));
}
```

A exigência do `%` na mesma linha existe para não acusar dois inocentes: o próprio docblock de
`formatPercent`, que **cita** o padrão em prosa, e a tela da receita, que arredonda e entrega o
número ao `formatTyped` — *"O que faz do trecho um defeito não é a multiplicação: é a porcentagem
SAINDO como texto ali mesmo"* (`:491-495`). O teste-espelho (`:521-542`) aprova
`toFixed(4)` para taxa, `toFixed(2)` para tacho, e o valor de campo entregue a um formatador que
sabe o idioma.

#### 2.11.8 As salas que o SQL chama de nossas são as que o domínio chama de nossas

`:370-399`. `INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room'] as const`
(`src/domain/ledger.ts:68`) não entra dentro de uma string de SQL — *"interpolar valor em SQL é o
padrão que a proofgate marca, com razão"* (`:377-378`). Então a régua **lê os dois lados e
compara**: extrai toda ocorrência de `l.kind IN (...)` de `src/data/repository.ts`, ordena, e
exige `deepEqual` com `[...INTERNAL_PLACE_KINDS].sort()`. Falha com *"o SQL e
`INTERNAL_PLACE_KINDS` discordam sobre quais salas são nossas"*, e o custo do desacordo está
escrito: *"prometer mercadoria que está numa loja, ou esconder a que está na câmara"*
(`:379-380`).

Estado medido hoje: existe **uma** ocorrência de `l.kind IN ('factory', 'cold_room',
'store_room')`, em `src/data/repository.ts:4167` (dentro de `stockAgainstOrders`). O predicado
irmão, `receivesCargo(kind)` — `kind === 'own_store' || kind === 'customer'`
(`ledger.ts:70-73`) — é lido por `app/places.tsx:34,146,189` e `app/orders/new.tsx:26,123`. A
constante em si é importada por `app/production/new.tsx:36` e por `src/layers.test.ts:5`. O
docblock do teste (`:373-375`) nomeia `app/places.tsx` e `app/orders/new.tsx` como as duas telas
que a leem "pelo `receivesCargo`" — a leitura direta da constante hoje está em
`app/production/new.tsx`.

`vehicle` está fora dos dois lados de propósito: *"caminhão é caminho, não é sala nem destino.
Mercadoria em cima dele não está para carregar nem chegou a ninguém"* (`ledger.ts:64-66`).

---

### 2.12 Tom de voz

#### 2.12.1 O texto literal

`CLAUDE.md:92-98`:

> Frase curta, verbo na frente, segunda pessoa. **Orienta, não fiscaliza** ("Produza até
> segunda", não "Estoque insuficiente"). **Nunca culpa pessoa** ("Faltaram 3 caixas na
> conferência", não "a loja errou"). Zero jargão: a confirmação diz o que vai acontecer, com os
> números por extenso.
>
> Sistema que acusa vira inimigo da equipe, e equipe que vê o app como inimigo sabota o dado.

A mesma regra abre o dicionário-fonte (`src/i18n/locales/pt-BR.ts:1-12`), em inglês e em quatro
marcadores:

> Voice rules, which matter more here than anywhere else in the codebase:
> - short sentence, verb first, second person
> - guide, never police: "Produza ate segunda", not "Estoque insuficiente"
> - never blame a person: "Faltaram 3 caixas na conferencia", not "a loja errou"
> - no system jargon: say what will happen, spelled out
>
> A system that accuses gets hidden data. A system that guides gets honest data. The tone of
> voice is what protects the quality of the information.

#### 2.12.2 O tom, em frases reais do produto

| chave | texto | regra que ela cumpre |
|---|---|---|
| `app.home.runningOut` | `'Compre esta semana'` (`pt-BR.ts:69`) | verbo na frente, orienta |
| `app.home.ordersShort` | `'Produza para os pedidos'` (`pt-BR.ts:70`) | orienta, não reclama |
| `app.home.inputsFine` / `inputsFineDetail` | `'Insumos em dia'` / `'Pelo consumo das últimas semanas, nada acaba nos próximos sete dias.'` (`pt-BR.ts:76-77`) | Lei 7 + a conta ao lado |
| `signals.missing` | `'Faltaram {{count}} caixas'` (`pt-BR.ts:1055`) | fato sem culpado |
| `alertText.insumo` | título `'Compre {{subject}}'`, corpo `'Acaba em {{amount}} pelo consumo desta semana.'` (`pt-BR.ts:1089`) | decide e mostra o número |
| `alertText.validade` | `'Lote {{subject}} vence'` / `'Em {{amount}} — mande esse primeiro.'` (`pt-BR.ts:1095`) | próxima ação provável |
| `alertText.ambiente` | `'{{subject}} fora da faixa'` / `'{{amount}} °{{unit}} agora. Confira a porta e o motor.'` (`pt-BR.ts:1096-1099`) | número com unidade + o que fazer |
| `loss.reasonRequired` | `'Diga o que aconteceu — isso protege o relatório de todo mundo.'` (`pt-BR.ts:1108`) | pede o dado sem acusar |
| `app.production.sameAsYesterday` | `'Mesmo que ontem'` (`pt-BR.ts:796`) | empate é estado |
| `app.crash.reassurance` | `'Nada do que você registrou se perdeu. O aplicativo guarda cada lançamento no aparelho no momento em que você confirma...'` (`pt-BR.ts:47`) | zero jargão numa tela de erro |
| `movement.*` | `purchase: 'Compra'`, `adjustment: 'Contagem'`, `discrepancy: 'Diferença na conferência'`, `reversal: 'Correção'` (`pt-BR.ts:1118-1129`) | a palavra da equipe, não a do esquema |
| `posts.*` | `picked: 'Separado'`, `loaded: 'Carregado'`, `delivered: 'Entregue'`, `checked: 'Conferido'` (`pt-BR.ts:1148-1153`) | idem |
| `alertText` (por que curto) | *"Notificação é lida de relance na tela de bloqueio, com o polegar no caminho. Título é o que decide; corpo é o número que sustenta. Nada de 'confira o estoque' — o dono já sabe conferir, o que ele não sabe é o quê."* (`pt-BR.ts:1081-1087`) | |

#### 2.12.3 A confirmação, como componente

`src/components/Confirm.tsx:7-23` transforma a última frase do tom de voz em desenho:

> The confirmations here are not "are you sure" - they spell out what is about to happen, in
> words, with the numbers written out, which is the one thing standing between a tired person
> and a wrong entry. (...) It rises from the bottom, except when it is destructive: a centred
> dialog is reserved for the actions that cannot be undone, so the shape itself carries a
> warning before the words are read.

`ConfirmRequest` = `{ title, message, confirmLabel?, cancelLabel?, destructive?, acknowledge? }`
(`Confirm.tsx:25-34`); `destructive` **não tem default** (`:30`), e `acknowledge` tira o botão de
cancelar — *"for telling, not asking"* (`:32`). Ele existe porque `Alert.alert` é no-op na web:
*"every save in this app was asking a question nobody was shown"* (`Confirm.tsx:10-12`).

A confirmação com número por extenso também é regra de **conteúdo**: a contagem de movimentos
que um "apagar área" leva junto foi acrescentada por causa de uma cicatriz — a confirmação dizia
*"isso apaga as compras, e zera o custo médio"* e não dizia que **todo** movimento da fábrica ia
(`src/data/erase.ts:57-73`).

#### 2.12.4 O tom como decisão de banco

`0012_who_or_where.sql:11-19` é o tom de voz virando coluna: o padrão de `names_who_recorded` é
`false` *"e o motivo está no tom de voz deste produto: ele orienta e não fiscaliza, e nunca
culpa pessoa. A cadeia de custódia existe para LOCALIZAR a perda — a diferença entre dois postos
diz se foi separação, rota ou recebimento — e 'faltaram 3 caixas na conferência' resolve isso sem
que ninguém precise ser nomeado. Equipe que vê o app como inimigo sabota o dado, e aí não há
relatório nenhum."*

E o mesmo raciocínio no motivo de perda ser obrigatório: *"Required - an easy, blame-free button
for this is what keeps legitimate losses from silently becoming 'unexplained shrinkage'"*
(`src/domain/ledger.ts:31-33`).

#### 2.12.5 O que é verificado e o que não é

**Não existe guard de tom de voz.** Nenhum teste mede "verbo na frente" ou "não culpa pessoa" —
isso é convenção escrita, sustentada pelo dicionário ser o único lugar onde há frase e por
revisão humana. O que a máquina garante é o **entorno**: que a frase esteja no dicionário
(`layers.test.ts:184-208`), que exista nos três idiomas com os mesmos buracos
(`i18n.test.ts:38-57`), que o número dito não desapareça da frase (`i18n/index.ts:86-88`,
`i18n.test.ts:59-79`), e que o texto que o e2e procura exista no dicionário
(`src/selectors.test.ts:21-27`).

---

### 2.13 O portão de escopo por item — P1, P2, P3

#### 2.13.1 Texto literal

`CLAUDE.md:411-430`:

> **O portão que sobrou é por item, não por fase.** Três perguntas, nesta ordem, e a primeira
> que reprovar decide:
>
> **P1 — Quem chama isto no mesmo commit?** Sem chamador, não entra. Fim. É a doença provada
> deste repositório: `assistant_phrase` com índice dedicado e nenhuma escrita, `Draft.kind` sem
> leitor, `balanceAt` e `daysOfCover` chamados só por teste, quatro seções de dicionário nos
> três idiomas sem uma tela. O número da fase não pegou nenhuma delas.
>
> **P2 — Complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item depende de
> observar alguém. **Mas antes de travar, cheque a F7:** se o que muda com a observação é
> *preferência de quem usa*, não é pergunta nem espera — é configuração, e os dois caminhos
> existem. Só trava o que nenhuma configuração resolve.
>
> **P3 — Entrando errado, conserta com um commit ou com migração e estorno?** Se toca
> `supabase/migrations/`, o caminho de escrita de `movements`, ou a semântica de
> `movement_kind`/`location_kind`, é caro e permanente. Forma de esquema se adivinha de graça
> enquanto há zero linhas; conteúdo de livro-razão não se corrige, se estorna.

#### 2.13.2 P1 — estado dos cinco exemplos citados, medido

| exemplo do `CLAUDE.md` | estado hoje | prova |
|---|---|---|
| `assistant_phrase` sem escrita | **fechado** — quatro habilidades do assistente gravam a frase | `src/assistant/skills.ts:377, 599, 886, 963`; a coluna é escrita por `recordCount` (`repository.ts:948, 966`) |
| `Draft.kind` sem leitor | **fechado** | `app/assistant.tsx:292, 310` |
| `balanceAt` chamado só por teste | **removido**, junto com `balanceOf`, `lotsPresentDuring` e `buildReversal` | `src/domain/ledger.ts:129-166` registra a remoção e o motivo |
| `daysOfCover` chamado só por teste | **fechado** — tem chamador de produção | `src/data/repository.ts:4` (import) e `:3843` |
| quatro seções de dicionário sem tela | **três fronteiras registradas**, com a tela que vai ler cada uma | `src/dictionary.test.ts:41-48` |

A justificativa da remoção das quatro dobras é a leitura mais importante deste portão
(`src/domain/ledger.ts:130-149`): *"Nenhuma tinha chamador, e a razão não é esquecimento: **o
aplicativo nunca tem os movimentos em memória.** Ele tem SQLite, e cada uma dessas perguntas já é
respondida em SQL... `buildReversal` era o caso mais caro: **dois autores para o que é um
estorno**, um em TypeScript que ninguém roda e um em SQL que roda. (...) A resposta anterior a
esse mesmo achado foi escrever teste para elas. Os testes eram bons e não tornaram nada
alcançável: tornaram a morte mais difícil de ver."*

**P1 como teste executável** existe para o dicionário: `src/dictionary.test.ts:62-78` reprova
qualquer seção de `ptBR` sem `t.<seção>` no código, a não ser que ela esteja em
`ESCRITAS_ADIANTADO` com um motivo de mais de 40 caracteres nomeando **quem vai ler**
(`:81-88`). As três fronteiras registradas hoje, transcritas de `src/dictionary.test.ts:41-48`:

| seção | motivo registrado |
|---|---|
| `posts` | *"os quatro postos de controle (separado, carregado, entregue, conferido) — escopo da F3 escrito no plano do mês, no CLAUDE.md"* |
| `stepper` | *"o UnitStepper, componente da Fase 2 — decisão registrada no CLAUDE.md, e apontá-lo como defeito já custou uma rodada"* |
| `scan` | *"a leitura do QR do engradado na doca — o QR já é impresso na etiqueta do lote; quem lê ainda não existe"* |

O custo de uma seção morta, escrito: *"uma seção morta parece viva: quem for renomear 'Custo
desta produção' acha primeiro a cópia que ninguém lê, muda ali, e a tela continua dizendo o que
dizia — com o commit verde, o teste verde e o dono apontando o texto velho na semana seguinte"*
(`src/dictionary.test.ts:16-18`). O segundo teste faz a lista **apodrecer alto**: seção que
ganhou leitor tem de sair da lista (`:80-88`).

Outros itens que hoje falham o P1, medidos e marcados:

| item | estado |
|---|---|
| `src/components/UnitStepper.tsx` | **implementado sem chamador** — nenhuma tela importa; fronteira registrada como componente da Fase 2 (`CLAUDE.md:352-356`) |
| `common.allClear`, `common.why`, `common.confirm`, `common.adjust`, `common.cancel`, `common.seeScreens`, `common.ask` | **implementadas sem chamador** (chaves, não seções — fora do alcance declarado do `dictionary.test.ts`) |
| `movements.operator_id` (aparelho e servidor) | coluna existe (`db.ts:322`, `0014:20-21`) e o serializador **sabe enviá-la** (`src/sync/serialize.ts:351`), mas **nenhuma escrita do repositório a preenche** — implementado sem escritor |
| `companies.floor_sign_in`, `names_who_recorded`, `modules`, `join_code`, `prefers_conversation`, `assistant_autonomy` | colunas no servidor **sem leitor no aparelho** |

#### 2.13.3 P2 — o que trava e o que não

Não há verificação automática do P2: é pergunta de julgamento. O que o `CLAUDE.md:420-424`
acrescenta é a ordem — **checar a F7 antes de travar**. Os cortes do mês são a aplicação escrita
dela (`CLAUDE.md:400-409`): o relatório do Espelho da Loja fica fora porque *"o relatório mente
com duas semanas de dado"*; as compras inteligentes ficam fora porque *"precisam do prazo
observado, que só existe depois"*. E o risco nomeado do P2 no faseamento: *"a F3 tem ergonomia
que não se verifica sem aparelho — tela capacitiva a -18°C, luva, QR a um braço de distância"*
(`CLAUDE.md:407-409`).

#### 2.13.4 P3 — os caminhos caros, e os guards que os vigiam

Os três caminhos que o `CLAUDE.md:426-430` marca como caros e permanentes:
`supabase/migrations/`, o caminho de escrita de `movements`, e a semântica de
`movement_kind`/`location_kind`.

| guard | o que faz |
|---|---|
| `.proofgate/guards.d/97-migration-edited.sh` | ⚠️ quando arquivo de migração existente é modificado/removido; acrescentar arquivo novo **não** é sinalizado; sabe distinguir a pasta do nome (*"`scripts/verify-migrations.sh` verifies migrations, it is not one"*) |
| `.proofgate/guards.d/95-schema-constraint-no-migration.sh` | restrição de esquema mexida sem migração |
| `src/sync/agreement.test.ts` | 12 testes de acordo entre os dois esquemas (colunas, enums, capacidades, o que o aparelho não guarda) |
| `scripts/verify-migrations.sh` | 13 garantias contra um Postgres descartável de verdade |
| `CLAUDE.md:442-449` (regra de Git) | `supabase/migrations/` e o `MIGRATIONS` de `src/data/db.ts` **só crescem** — *"editar um passo que já rodou faz o banco e o arquivo divergirem em silêncio"* |
| `src/data/db.ts:160-172` | a mesma regra dita do lado do aparelho: *"Never edit a step that has shipped. A phone that already ran it will not run it again, so the edit reaches new installations only, and the two diverge silently"* |

E o corolário do P3 sobre vocabulário, escrito em `src/domain/ledger.ts:35-45`: o aparelho
escreveu `internalUse` em camelCase por meses; o SQLite teria aceitado (a coluna é `TEXT`), a
fila teria enfileirado, e *"Postgres would have refused the row with nobody watching. It cost
nothing to fix because no loss has ever been recorded - which is the only window where a
ledger's vocabulary is free to change."*

---

### 2.14 Decisões do dono, já tomadas — transcritas e com estado

`CLAUDE.md:314-348`, na íntegra, seguidas do estado medido:

> **Entrada no chão de fábrica: configuração da empresa, não escolha nossa.** Compartilhado usa
> PIN numa grade de nomes — dois segundos, de luva, offline. Pessoal entra uma vez e fica. Os
> dois existem; a empresa escolhe.

Estado: `companies.floor_sign_in` (`personal` \| `shared`, padrão `personal`) existe no servidor
(`0011:65-68`). **NÃO IMPLEMENTADO no aplicativo** — não há grade de PIN nem leitura dessa coluna
em `src/` ou `app/`.

> **Quem cria a empresa é o dono**, cadastrando-se sozinho. A partir daí ele cadastra as outras
> pessoas diretamente **ou** aprova quem pediu associação por um código da empresa. Os dois
> caminhos.

Estado: no servidor, completo — `membership_state` (`pending`/`active`/`revoked`),
`companies.join_code text unique`, e as duas funções de permissão reescritas para exigir
`state = 'active'` (`0011:11-55`). O buraco que a migração fechou está escrito: *"`memberships`
não tem estado, então qualquer linha ali já vale como membro. Quem descobrisse o código entraria
com permissão antes de alguém dizer sim"* (`0011:6-9`). Provado no `db:verify` check 4
(`scripts/verify-migrations.sh:286-314`). No aparelho: **NÃO IMPLEMENTADO** (não há login).

> **O relatório fala de onde, não de quem — e o aparelho tem responsável.** O livro-razão sempre
> grava quem (`recorded_by` é obrigatório desde a primeira migração); o que a tela conta é outra
> coisa, e o padrão é não nomear. A responsabilidade vem do aparelho ser cadastrado com um
> responsável: o movimento aponta para o aparelho, o aparelho aponta para uma pessoa. Quem
> quiser nomear a cada caixa liga `names_who_recorded`.

Estado: `movements.recorded_by uuid not null` desde `0001:191`; tabela `devices` com
`responsible_id uuid references memberships(id) on delete set null` e `location_id`
(`0013:18-40`); `movements.device_id ... on delete restrict` (`0013:63-64`);
`companies.names_who_recorded boolean default false` (`0012:20-21`). As escolhas de `on delete`
têm razão escrita: `set null` no responsável porque *"quando a pessoa sai da empresa o aparelho
continua existindo, agora sem dono - o que é exatamente a pergunta que o dono precisa ver na
tela"* (`0013:25-27`), e `restrict` no `device_id` porque *"apagar a origem de um movimento é
perder a única coisa que torna 'onde' responsável por alguma coisa"* (`0013:55-58`). Aparelho não
se apaga: `active boolean not null default true` (`0013:36`). No aparelho: **NÃO IMPLEMENTADO**
— não há tabela `devices` no SQLite (`db.ts:676-678`).

> **O login autentica o sistema, não a pessoa.** A conta é da empresa. Ela distribui acesso
> criando outros e-mails ou mandando código de convite por perfil — não é o e-mail pessoal do
> operador que entra no app. **Quem estava operando é anotação do registro**, escolhida na hora,
> não identidade da sessão. São duas perguntas (`recorded_by` = qual conta escreveu, imposto
> pelo servidor e incedível; `operator_id` = quem estava com o aparelho), e uma coluna só
> respondendo as duas é erro — já custou uma rodada inteira.

Estado: `movements.operator_id uuid references memberships(id) on delete restrict` no servidor
(`0014:20-21`, com `comment on column` transcrito em `0014:29-31`), e no aparelho o par de passos
que documenta o erro e o conserto: **V4** acrescenta `recorded_by TEXT` (`db.ts:302-304`) e **V5**
acrescenta `operator_id TEXT` e **remove** `recorded_by` (`db.ts:321-324`), porque no aparelho
`recorded_by` *"nunca teve valor próprio: é sempre a conta que sincroniza, e o serializador já
sabe qual é"* (`db.ts:317-319`). O serializador carimba `recorded_by` a partir do ator da
sincronia (`src/sync/serialize.ts`, provado em `agreement.test.ts:361-397`). `operator_id`
atravessa a fila (`serialize.ts:351`) e **nenhuma tela o preenche hoje**.

> **Aparelho emprestado entra como produção e nada mais.** Celular da empresa passa de mão; quem
> está com ele usa o papel `operator` — sem custo, sem preço, sem dinheiro. O aparelho continua
> respondendo.

Estado: `ROLES.operator` não tem `view_cost` nem `view_sale_price`
(`src/domain/access.ts:87`); a `0030` existe exatamente para o `operator` conseguir criar o lugar
padrão sem `manage_company` (`0030:1-42`); `db:verify` check 11 — *"o aparelho emprestado cria o
lugar padrão, e nada além dele"* (`scripts/verify-migrations.sh:773`).

> **O operador confere a prateleira.** Numa fábrica de seis pessoas quem anda até a prateleira é
> quem trabalha lá, não o dono. Negar a permissão não deixa o número mais seguro — deixa a
> contagem sem acontecer, e saldo que ninguém conferiu há meses é pior que saldo corrigido hoje
> de manhã. O que protege é o piso, não a permissão: contagem é perguntada toda vez, e é gravada
> como diferença que o livro-razão guarda, nunca como valor que sobrescreve.

Estado: implementado nas três pontas. `adjust_stock` está em `ROLES.operator`
(`access.ts:87`), com o parágrafo inteiro da decisão repetido no docblock
(`access.ts:74-86`); `adjustStock` está em `ALWAYS_CONFIRMED` (`access.ts:136`); e `recordCount`
grava **a diferença**, nunca o valor contado (`repository.ts:875-885`), inclusive quando a
diferença é zero — *"Somebody looked, and the storeroom was right: that is information"*
(`repository.ts:881-885`), e o servidor teve de ser corrigido para aceitar essa linha
(`0008:43-55`).

---

### 2.15 Antes de chamar algo de defeito, procure a decisão

`CLAUDE.md:352-370`, transcrito porque é a regra que evita "consertar" uma decisão:

> **Antes de chamar algo de defeito, procure a decisão.** Três vezes numa sessão eu apontei
> "violação de fundação" no que era fronteira registrada: o `UnitStepper` sem uso (é componente
> da Fase 2), o `[por quê?]` ausente na home (a conta abre num toque, na receita), e o
> assistente monolíngue — que tem o raciocínio inteiro escrito no topo do
> `src/assistant/index.ts`, inclusive quando deixa de valer.
>
> O custo não é o tempo perdido, é pior: eu quase "consertei" uma decisão que alguém tomou por
> um motivo que eu não tinha lido. Então a busca vem antes da acusação — `grep` no docblock do
> arquivo, no `docs/insights.md` e nas decisões deste arquivo. Se houver decisão escrita, o
> achado não é defeito: ou é pedido de mudança para o dono, ou não é nada.
>
> **Contradição achada é suspeita de leitura errada, até virar prova.** Quando o esquema parece
> contrariar uma fundação, a primeira hipótese é que eu li errado — não que a fundação esteja
> furada. (...) Construir sobre uma premissa inventada custa a rodada inteira, e o pior é que o
> código fica bonito: testes verdes protegendo uma regra que ninguém pediu.

A fronteira do assistente monolíngue, transcrita de `src/assistant/index.ts:7-22` — inclui
**quando deixa de valer**, que é o que faz dela fronteira e não desculpa:

> The assistant speaks Portuguese only, and that is a boundary rather than an oversight. The
> screens read every word from the dictionary and run in three languages. The assistant cannot
> follow yet, because what it matches on is Portuguese phrasing: "quanto custa", "comprei 4
> sacos de". Translating the answers would be half a job - the questions would still only
> arrive in one language, and an assistant that answers in Spanish but only understands
> Portuguese is worse than one that is honestly monolingual.
> The design already says how this ends: when a language model does the matching, it maps any
> phrasing to a skill and its slots, and the language of the question stops being the matcher's
> problem. The answers move to the dictionary then, in the same change.

---

### 2.16 Mapa final: o que a máquina verifica e o que é convenção escrita

| regra | verificador | arquivo:linha | o que ele **não** prova |
|---|---|---|---|
| razão append-only (servidor) | `db:verify` check 1 | `scripts/verify-migrations.sh:99-108` | nada sobre o aparelho |
| razão append-only (aparelho) | **nenhum** | — | é convenção: não existe `UPDATE`/`DELETE` em `movements` no código, e não há gatilho no SQLite |
| nenhum total de estoque armazenado | `schema.test.ts` + `db:verify` check 1 + `agreement.test.ts:238-251` | `src/data/schema.test.ts:31-35, 76-104` | nomes fora da régua de seis padrões |
| `Cents` inteiro / `Rate` fracionário | tipos com marca + `money.test.ts` + `mutate` | `src/domain/money.ts:5,49`; `src/domain/money.test.ts` | uso errado do tipo certo (ex.: taxa arredondada antes de multiplicar em código novo) |
| dinheiro nunca é float | proofgate `85-float-money` (⚠️, nunca ❌) | `.proofgate/guards.d/85-float-money.sh` | dinheiro em float sem palavra de dinheiro por perto |
| permissão na consulta (servidor) | `db:verify` check 4, 5, 9 | `scripts/verify-migrations.sh:202-316, 318-415, 688+` | permissão nas telas do aparelho, que hoje não existe |
| vocabulário de capacidade igual nos dois lados | `agreement.test.ts` | `src/sync/agreement.test.ts:253-266` | que alguma tela use a capacidade |
| permissão antes da consulta (assistente) | `assistant.test.ts` | `src/assistant/assistant.test.ts:280, 425` | que o app leia a associação real (fixo em `owner`) |
| chave existe nos três idiomas | `Widen<T>` na compilação | `src/i18n/locales/pt-BR.ts:1176-1178` | que a tela **use** a chave; que a tradução esteja completa |
| tradução mantém os buracos da frase | `i18n.test.ts` | `src/i18n/i18n.test.ts:38-57` | qualidade da tradução |
| nenhuma tela escreve frase | `layers.test.ts` → `pareceFrase` | `src/layers.test.ts:153-208` | frase de uma palavra, ou sem palavra funcional |
| toda seção de dicionário tem leitor | `dictionary.test.ts` | `src/dictionary.test.ts:62-88` | **chave** sem leitor (mede seção, por decisão declarada) |
| só a camada de dados fala SQL | `layers.test.ts` + controle | `src/layers.test.ts:73-97` | que o SQL da camada de dados esteja certo |
| Lei 3 (número com comparação) | `law.test.ts` | `src/law.test.ts:137-175` | que a comparação declarada seja a certa |
| Lei 5 no piso de produção | `layers.test.ts` → `pisoDeOutraSala` | `src/layers.test.ts:417-468` | que a tela escolha a sala **certa** |
| contagem na sala mostrada | `layers.test.ts` → `contagemCega` | `src/layers.test.ts:309-368` | que a sala seja a certa; prova que a tela escolheu |
| aviso de validade não preso a sala | `layers.test.ts` | `src/layers.test.ts:256-281` | que a capa **desenhe** o aviso |
| porcentagem pelo formatador do idioma | `layers.test.ts` → `porCentoNaMao` | `src/layers.test.ts:489-542` | outras formas de montar número à mão |
| salas internas iguais no SQL e no domínio | `layers.test.ts` | `src/layers.test.ts:382-399` | consultas que filtrem sala por outro caminho |
| toda tela desenha, entra animada e não inventa cor | `language.test.ts` | `src/language.test.ts:88-131` | se o desenho é bom (*"gosto não se testa, mas 'esta tela não tem desenho nenhum' se conta"*, `:23-24`) |
| texto que o e2e procura existe no app | `selectors.test.ts` | `src/selectors.test.ts:21-27` | que a tela mostre aquele texto |
| migração nunca editada | proofgate `97-migration-edited` + regra de Git | `.proofgate/guards.d/97-migration-edited.sh`; `CLAUDE.md:442-449` | — |
| **tom de voz** | **nenhum** | — | convenção escrita: `CLAUDE.md:92-98` e `src/i18n/locales/pt-BR.ts:1-12` |
| **Leis 1, 2, 4, 6, 7** | **nenhum guard direto** | — | convenção escrita, ancorada em docblocks citando a lei por número (lista em 2.9) |
| **P2 do portão** | **nenhum** | — | pergunta de julgamento |
