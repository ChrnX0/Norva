## 8. Banco do servidor — parte B (migrações 0012 a 0022)

### 8.0 O que este bloco contém, e em que estado ele está

Onze migrações, todas append-only sobre o esquema da parte A. Nenhuma edita passo
já rodado; três delas derrubam e recriam objeto (`0017` a restrição
`movement_moved_something`, `0008` — fora deste bloco — a view `movements_visible`)
e o resto só acrescenta.

| arquivo | linhas | o que cria |
|---|---|---|
| `0012_who_or_where.sql` | 25 | `companies.names_who_recorded` |
| `0013_the_device_is_accountable.sql` | 67 | tabela `devices`, 2 policies, `movements.device_id`, 2 índices |
| `0014_who_was_holding_it.sql` | 31 | `movements.operator_id`, índice parcial, comment |
| `0015_the_phone_will_send_it_twice.sql` | 35 | `purchases_update`, `purchase_lines_update` |
| `0016_the_act_and_its_lines.sql` | 35 | `movements.movement_group_id`, índice parcial, comment |
| `0017_a_check_that_matched_is_a_fact.sql` | 26 | reescreve `movement_moved_something` |
| `0018_a_product_has_a_family.sql` | 138 | `product_lines`, `product_types`, `flavors`, 3 colunas em `products`, 3 chaves compostas, 7 índices, 6 policies |
| `0019_an_order_is_demand.sql` | 187 | `orders`, `order_lines`, `companies.orders_need_approval`, 2 unique compostas, 3 índices, 2 gatilhos, 6 policies |
| `0020_a_lot_and_the_day_it_dies.sql` | 42 | `products.shelf_life_days`, `lots_resend` |
| `0021_what_was_agreed_with_the_store.sql` | 22 | 3 colunas em `locations`, 1 check |
| `0022_the_stick_leaves_the_storeroom.sql` | 29 | `products.packaging_items`, 1 check |

**Fato que enquadra todo o bloco: não existe cliente Supabase no aplicativo.** Uma
busca por `supabase`, `createClient` ou `SUPABASE` em `src/` e `app/` só encontra
dois comentários (`src/data/db.ts:9`, `src/domain/ledger.ts:39`). O motor de
sincronia é abstrato — recebe um `Transport` com um método `push` e nada mais
(`src/sync/engine.ts:34-37`) — e nenhuma implementação desse transporte contra
Postgres existe. Portanto, para todo objeto descrito aqui, "chamado" significa uma
de duas coisas, e elas são diferentes:

- **exercitado contra o Postgres de verdade** pela `db:verify`
  (`scripts/verify-migrations.sh`), que sobe um Postgres descartável, roda as
  migrações byte a byte e replica a fila real do aparelho gerada por
  `scripts/device-session.ts`;
- **espelhado no aparelho e escrito por tela**, isto é: existe coluna equivalente
  no SQLite (`src/data/db.ts`), existe travessia declarada em
  `src/sync/serialize.ts`, e existe tela em `app/` que grava.

Os três estados que este documento marca em cada item:

- **[SERVIDOR+APARELHO+TELA]** — coluna existe nos dois bancos, atravessa a fila e
  uma tela grava/lê.
- **[SERVIDOR SEM ESCRITOR]** — o objeto existe no Postgres e nada no aplicativo
  escreve ou lê. Não é o mesmo que morto: parte disso é exercitado pela
  `db:verify`.
- **[SÓ NO SERVIDOR, SEM EXERCÍCIO]** — nem aplicativo, nem checagem.

**A regra de conflito que decide o desenho de metade destas migrações.** A fila do
aparelho sobe cada linha com `insert ... on conflict (id)`, e o que vem depois do
`on conflict` depende da tabela: `do nothing` para `movements` e `readings`,
`do update set` de **todas as colunas menos `id`** para todas as outras
(`scripts/device-session.ts:288-300` e `:318`). Isso é o contrato: qualquer tabela
que a fila escreve e que não tenha política de UPDATE trava a fila para sempre na
segunda passagem. A 0015 e a 0020 são exatamente esse conserto.

---

### 8.1 `0012_who_or_where.sql` — o relatório nomeia a pessoa, ou o lugar?

#### 8.1.1 O DDL, literal

```sql
alter table companies
  add column names_who_recorded boolean not null default false;

comment on column companies.names_who_recorded is
  'Se os relatórios operacionais mostram quem registrou. O ledger sempre grava; '
  'isto decide se a tela conta. Padrão falso: localizar a perda, não acusar.';
```

(`supabase/migrations/0012_who_or_where.sql:20-25`. Os dois literais adjacentes do
`comment` concatenam-se em uma frase só, como manda o SQL.)

#### 8.1.2 A decisão que o arquivo carrega

O cabeçalho da migração registra que a pergunta parecia ser sobre **o que gravar** e
não era: `movements.recorded_by` já é `not null` desde a primeira migração, então o
livro-razão sempre soube quem fez, e auditoria continua tendo isso
(`supabase/migrations/0012_who_or_where.sql:3-5`). O que estava em aberto é se a
**interface** atribui um movimento de chão de fábrica a um nome — e isso é
preferência de empresa: "uma fábrica de três pessoas não quer nome nenhum, uma de
quarenta com problema de furo quer" (`:7-10`).

O padrão `false` tem razão escrita: a cadeia de custódia existe para **localizar** a
perda — a diferença entre dois postos diz se foi separação, rota ou recebimento — e
"faltaram 3 caixas na conferência" resolve isso sem nomear ninguém; equipe que vê o
app como inimigo sabota o dado (`:12-17`).

#### 8.1.3 Estado

**[SERVIDOR SEM ESCRITOR].** A coluna não tem leitor nem escritor em nenhum lugar
do aplicativo. As únicas ocorrências do nome fora das migrações estão num
comentário de teste (`src/sync/serialize.test.ts:88`) e na 0032, que a cita como
justificativa (`supabase/migrations/0032_who_ordered_it_never_changes.sql:16`).
`companies` não está na lista de tabelas que a fila sabe mandar
(`src/sync/serialize.ts:61-77`), então **nenhuma configuração de empresa viaja do
aparelho para o servidor** — vale para `names_who_recorded`, `orders_need_approval`
(0019), `floor_sign_in` e `join_code` (0011). NÃO EXISTE NO CÓDIGO tela de
administração que escreva na tabela `companies` do servidor.

---

### 8.2 `0013_the_device_is_accountable.sql` — o aparelho vira coisa cadastrada

#### 8.2.1 A tensão que esta migração resolve

O tom de voz manda nunca culpar pessoa e o relatório fala de onde, não de quem —
mas "onde" sozinho não responde por nada: *"uma câmara fria não assina"*
(`supabase/migrations/0013_the_device_is_accountable.sql:3-6`). A decisão do dono:
**o aparelho tem responsável cadastrado**; o movimento aponta para o aparelho, o
aparelho aponta para uma pessoa, e a responsabilidade existe sem o relatório nomear
ninguém a cada caixa (`:8-11`). Junto, resolve o aparelho emprestado: se o celular
é da empresa e passa de mão, quem está com ele entra numa conta de produção — o
papel `operator`, que não vê custo, nem preço, nem dinheiro (`:13-16`).

#### 8.2.2 Tabela `devices`

| coluna | tipo | nulo? | default | referência / regra |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | primary key |
| `company_id` | uuid | não | — | `references companies(id) on delete cascade` |
| `name` | text | não | — | como as pessoas o chamam: "o celular da câmara", "o tablet da expedição" |
| `responsible_id` | uuid | sim | — | `references memberships(id) on delete set null` |
| `location_id` | uuid | sim | — | `references locations(id) on delete restrict` |
| `active` | boolean | não | `true` | aparelho não se apaga |
| `created_at` | timestamptz | não | `now()` | — |

Restrição de tabela: `unique (company_id, name)`
(`supabase/migrations/0013_the_device_is_accountable.sql:18-40`).

As três escolhas de `on delete`, com o motivo transcrito do arquivo:

- **`responsible_id` → `set null`, e não `restrict`:** "quando a pessoa sai da
  empresa o aparelho continua existindo, agora sem dono — o que é exatamente a
  pergunta que o dono precisa ver na tela" (`:25-28`).
- **`location_id` → `restrict`:** "onde ele costuma ficar, para pré-preencher o
  movimento em vez de perguntar" (`:30-31`).
- **`active` em vez de exclusão:** "some da lista e o histórico continua apontando
  para ele. Um movimento cuja origem sumiu é um movimento que não se pode
  explicar" (`:33-36`).

Índice: `create index devices_company_idx on devices (company_id) where active;`
(`:42`) — parcial, só aparelhos ativos.

#### 8.2.3 RLS de `devices`, literal

```sql
alter table devices enable row level security;

create policy devices_read on devices
  for select using (company_id in (select private.current_companies()));

create policy devices_manage on devices
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));
```

(`supabase/migrations/0013_the_device_is_accountable.sql:44-51`.) Ler é de quem
está na empresa; cadastrar e mexer é de `manage_company`. Note que `devices_manage`
é `for all`, portanto **cobre UPDATE** — a tabela não tem o defeito que a 0015 e a
0020 consertam noutras.

#### 8.2.4 `movements.device_id`

```sql
alter table movements
  add column device_id uuid references devices(id) on delete restrict;

create index movements_device_idx on movements (company_id, device_id)
  where device_id is not null;
```

(`:63-67`.) O `restrict` é deliberado e o motivo é aritmético-operacional: "o
livro-razão recusa UPDATE por gatilho, então uma exclusão em cascata que zerasse
esta coluna seria recusada de qualquer jeito — e apagar a origem de um movimento é
perder a única coisa que torna 'onde' responsável por alguma coisa" (`:55-58`).
Nulo nas linhas antigas é declarado honesto: "elas foram gravadas antes de existir
aparelho cadastrado, e inventar um agora seria escrever história que não aconteceu"
(`:60-62`).

#### 8.2.5 Estado

- Tabela `devices`: **[SÓ NO SERVIDOR, SEM EXERCÍCIO]**. Não existe tabela
  `devices` no SQLite do aparelho (`src/data/db.ts` só menciona `devices` num
  comentário, `:599`), `devices` não está na lista de tabelas envidáveis
  (`src/sync/serialize.ts:61-77`), nenhuma tela cadastra aparelho, e a
  `db:verify` não insere nenhuma linha em `devices`.
- `movements.device_id`: **[SERVIDOR SEM ESCRITOR, MAS NA TRAVESSIA]**. A coluna
  está listada explicitamente no `take` de `movements`
  (`src/sync/serialize.ts:341`) com o comentário dizendo por quê: "Nulo até o
  aparelho saber qual aparelho ele é… o lugar onde ele entra já está escrito"
  (`:335-340`). A tabela `movements` do SQLite **não tem** a coluna
  (`src/data/db.ts:225-249`), então `serialize` lê `row['device_id']` como
  `undefined`, `nullable()` o converte para `null` (`src/sync/serialize.ts:92-94`,
  `:403`), e o servidor recebe sempre nulo.
- Quem realmente usa `devices` como alvo de chave é `readings.device_id`, criada
  depois: `device_id uuid references devices(id) on delete set null`
  (`supabase/migrations/0024_a_reading_is_a_fact_like_any_other.sql:30`) — e essa
  coluna **é** escrita pelo aparelho (`src/data/repository.ts:2793-2799`), sempre
  com `null` na prática porque a tela de leitura é digitada.

#### 8.2.6 Ponta solta verificável

`devices` **não tem** `unique (id, company_id)` — a busca por essa restrição nas 32
migrações devolve só `product_lines`, `flavors`, `orders`
(`supabase/migrations/0018_a_product_has_a_family.sql:40` e `:75`,
`0019_an_order_is_demand.sql:71`) e as duas nomeadas em
`0019_an_order_is_demand.sql:36-37`. Logo, `movements.device_id` e
`readings.device_id` são chaves de **uma coluna só**, e NÃO EXISTE NO CÓDIGO
restrição que impeça um movimento da empresa A de apontar para um aparelho da
empresa B. O padrão oposto foi aplicado a `item_id`, `location_id` e
`counterpart_location_id` pela 0029
(`supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql:29-46`),
que também deixa registrado que `lot_id` segue simples (`:22-27`) — e não menciona
`device_id`.

---

### 8.3 `0014_who_was_holding_it.sql` — `operator_id` ≠ `recorded_by`

#### 8.3.1 As duas perguntas, transcritas

O cabeçalho da migração é a decisão do dono e o desfazimento de um nó que o próprio
código havia dado: o login autentica **o sistema** — a conta é da empresa, que
distribui acesso criando e-mails ou mandando código de convite por perfil — e não é
o e-mail pessoal do operador que entra no app
(`supabase/migrations/0014_who_was_holding_it.sql:3-6`). As duas colunas, com a
definição literal do arquivo (`:11-15`):

| coluna | o que responde | quem impõe |
|---|---|---|
| `recorded_by` | qual **conta** escreveu | servidor: `recorded_by = auth.uid()` na policy de append desde a fundação; "ninguém assina no nome de ninguém, nem o dono" |
| `operator_id` | quem estava com o **aparelho** na hora | anotado no momento do registro, escolhido na lista de gente da empresa |

Consequência escrita: "com as duas separadas, o celular compartilhado deixa de ser
um problema de autenticação e vira o que sempre foi: uma pergunta a mais na tela de
registro, para a empresa que quiser fazê-la" (`:17-19`).

#### 8.3.2 O DDL, literal

```sql
alter table movements
  add column operator_id uuid references memberships(id) on delete restrict;

create index movements_operator_idx on movements (company_id, operator_id)
  where operator_id is not null;

comment on column movements.operator_id is
  'Quem estava operando quando a linha foi escrita. Diferente de recorded_by, '
  'que é a conta que escreveu e não pode ser cedida a ninguém.';
```

(`supabase/migrations/0014_who_was_holding_it.sql:20-31`.) Aponta para
`memberships(id)`, não para `auth.users(id)`: quem é nomeado é a pessoa cadastrada
naquela empresa. `on delete restrict`, pelo mesmo motivo do `device_id`: o razão
recusa UPDATE, então cascata que zerasse a coluna seria recusada.

Nulo é o padrão e é declarado resposta, não ausência: "a empresa que não quer
nomear ninguém não nomeia, e a linha continua respondendo pelo aparelho e pela
conta" (`:23-25`).

#### 8.3.3 Estado

**[SERVIDOR + APARELHO + TRAVESSIA, SEM ESCRITOR DE TELA].**

- Servidor: coluna existe (0014).
- Aparelho: `ALTER TABLE movements ADD COLUMN operator_id TEXT;` mais
  `ALTER TABLE movements DROP COLUMN recorded_by;` na V5 (`src/data/db.ts:321-324`).
  O docblock da V5 diz por que `recorded_by` saiu do aparelho: "no aparelho ele
  nunca teve valor próprio: é sempre a conta que sincroniza, e o serializador já
  sabe qual é" (`src/data/db.ts:306-320`).
- Travessia: `operator_id` está no `take` de `movements`
  (`src/sync/serialize.ts:351`), e `recorded_by` é **carimbado na saída** pelo
  `build` com o `actor.userId` (`:366`).
- Escrita: NÃO EXISTE NO CÓDIGO nenhuma função de repositório ou tela que preencha
  `operator_id`. A busca pelo nome em `src/` devolve apenas `src/data/db.ts`,
  `src/sync/serialize.ts`, `src/sync/serialize.test.ts` e `scripts/mutate.mjs`.
  O teste que fixa o comportamento atual é explícito: "a company that names nobody
  still records the movement", e afirma `write.row.operator_id === null` **como
  nulo explícito, não como coluna ausente** (`src/sync/serialize.test.ts:86-96`).
- Prova de servidor: a `db:verify` demonstra a assimetria — nomear outra pessoa em
  `recorded_by` é **recusado**, nomear outra em `operator_id` é **aceito**, e a
  recusa foi isolada trocando só a atribuição (`docs/insights.md:640-646`;
  a checagem está em `scripts/verify-migrations.sh:381-393`).

---

### 8.4 `0015_the_phone_will_send_it_twice.sql` — o reenvio da fila

#### 8.4.1 O defeito, com a mensagem de erro literal

O defeito apareceu no dia em que a checagem 6 parou de rodar como superusuário:
enquanto rodava assim, RLS ficava desligada e as 45 escritas passavam sem uma
política ser avaliada; sob política, a **segunda** passagem da mesma fila é
recusada com

```
new row violates row-level security policy (USING expression)
for table "purchases"
```

(`supabase/migrations/0015_the_phone_will_send_it_twice.sql:3-9`). A causa:
`purchases` e `purchase_lines` tinham política de leitura e de INSERT e **nenhuma
de UPDATE** — e a fila sobe com `ON CONFLICT DO UPDATE`. Todas as outras tabelas
que ela escrevia tinham um `_manage FOR ALL`, que cobre update; essas duas ficaram
de fora quando foram escritas (`:11-14`).

#### 8.4.2 O DDL, literal

```sql
create policy purchases_update on purchases
  for update using (private.has_capability(company_id, 'view_finance'))
  with check (private.has_capability(company_id, 'view_finance'));

create policy purchase_lines_update on purchase_lines
  for update using (private.has_capability(company_id, 'view_finance'))
  with check (private.has_capability(company_id, 'view_finance'));
```

(`:29-35`.) A capacidade é a **mesma** que já podia inserir nas duas tabelas
(`purchases_write` / `purchase_lines_write` com `view_finance`,
`supabase/migrations/0002_recipes.sql:215-218`) — o conserto não amplia o acesso de
ninguém.

#### 8.4.3 As três decisões que o arquivo fixa

1. **Reenviar é o caso normal, não o raro:** "sinal que cai no meio da subida,
   aplicativo fechado antes do fim, bateria acabando na câmara fria. O aparelho
   reenvia até ter certeza, e sem isto ele reenviaria para sempre — a fila travada
   atrás da primeira nota, sem nada na tela explicando o quê" (`:16-19`).
2. **UPDATE e não `DO NOTHING` nessas duas:** "uma nota corrigida no aparelho
   precisa alcançar o servidor. Com `DO NOTHING` a correção seria descartada em
   silêncio, e silêncio é a única coisa pior que a recusa" (`:21-23`).
3. **Isto não afrouxa o livro-razão:** "`movements` sobe com `DO NOTHING` e
   continua sem política de UPDATE. Um movimento que chega duas vezes não faz nada
   na segunda; um movimento errado se estorna, nunca se edita. A nota é documento,
   o movimento é fato — e só o fato é imutável" (`:25-28`).

#### 8.4.4 A família, para não redescobrir

O mesmo defeito reapareceu quatro vezes, e as migrações que o consertaram são a
linhagem completa do problema:

| tabela | consertada por | forma do defeito |
|---|---|---|
| `purchases`, `purchase_lines` | 0015 | política de insert e **nenhuma** de update |
| `lots` | 0020 (`lots_resend`) | idem, esperando desde a 0001 |
| `orders` | 0027 (`orders_resend`) | política de update **existia**, com a capacidade errada |
| `readings` | 0031 | idem 0015, para a série de sensor |

(`supabase/migrations/0027_a_resend_is_not_a_decision.sql:3-8`,
`docs/insights.md:3410-3439`.) A frase que ficou escrita depois da 0015 — "todas as
outras tabelas que ela escreve têm um `_manage FOR ALL`, que cobre update" — é
justamente a que não cobriu o caso de `orders`, porque a busca por "tabela sem
update" não encontra tabela com update errado
(`supabase/migrations/0027_a_resend_is_not_a_decision.sql:22-27`).

#### 8.4.5 Estado

**[EXERCITADO CONTRA POSTGRES].** A checagem 6 da `db:verify` concede
`insert, update` a `app_user` em `items, locations, products, lots, purchases,
purchase_lines, recipes, recipe_versions, recipe_lines, product_lines,
product_types, flavors, orders, order_lines` e apenas `insert` em
`movements, readings` (`scripts/verify-migrations.sh:451-458`), replica a fila
inteira **como a conta da empresa** e depois **reenvia a fila inteira** exigindo que
nada estrague (`:508-512`). A checagem 9 fecha o buraco de capacidade: reenvio pela
capacidade **mínima** de um papel real (`:688-730`).

---

### 8.5 `0016_the_act_and_its_lines.sql` — `movement_group_id`

#### 8.5.1 Por que existe: o ato é N linhas, e a razão é aritmética

Uma corrida de produção não é um movimento: é sete. Uma que faz 500 picolés
consumindo seis insumos escreve um `production` positivo e seis `consumption`
negativos — porque `movements` tem **um** `item_id` e uma quantidade assinada, e
`stock_balances` é `sum(...) group by company_id, item_id, location_id`. Sete itens
numa linha só exigiriam um leitor que abre payload, e o saldo deixaria de ser uma
soma (`supabase/migrations/0016_the_act_and_its_lines.sql:3-8`).

Uma transferência é duas: saída negativa na origem, entrada positiva no destino.
Com uma linha só o destino não existe em consulta nenhuma — fechar o saldo exigiria
um UNION trocando `location_id` por `counterpart_location_id` e invertendo o sinal,
"que é o caso especial que esta fundação existe para não ter" (`:10-14`).

Sem o elo, "explique este número" seis meses depois vira arqueologia por horário, e
o estorno de uma corrida inteira não tem como se dizer atômico; com ele,
`where movement_group_id = ?` devolve o ato completo (`:16-18`).

Por que **uma coluna genérica** e não uma por tipo de evento: o truque que o projeto
já usa — a linha de nota e o movimento dela compartilhando o mesmo id, porque são um
fato visto duas vezes — é 1:1 e não estica para sete linhas (`:20-22`).

#### 8.5.2 O DDL, literal

```sql
alter table movements
  add column movement_group_id uuid;

create index movements_group_idx on movements (company_id, movement_group_id)
  where movement_group_id is not null;

comment on column movements.movement_group_id is
  'As linhas de um mesmo ato: as sete de uma corrida de produção, as duas de '
  'uma transferência. Nulo quando o ato tem uma linha só.';
```

(`:27-35`.) Sem chave estrangeira: o grupo é um id gerado no aparelho, não aponta
para tabela nenhuma. Nula nas linhas antigas, "aditiva, sem backfill — que seria
impossível de qualquer jeito, porque o gatilho recusa UPDATE" (`:24-26`).

#### 8.5.3 Estado

**[SERVIDOR + APARELHO + TELA]**, e é a coluna mais usada do bloco.

- Aparelho: V6 acrescenta `movement_group_id TEXT` e
  `counterpart_location_id TEXT REFERENCES locations(id)` juntos
  (`src/data/db.ts:343-346`); V7 acrescenta o índice de grupo, que o servidor tinha
  e o aparelho não (`src/data/db.ts:365-371`).
- Travessia: listado explicitamente no `take` de `movements` ao lado de
  `counterpart_location_id`, com o comentário "a lista é fechada para que coluna
  nova não vire falha silenciosa" (`src/sync/serialize.ts:343-347`).
- Escritores (todos com um `groupId` novo por ato): `recordProduction`
  (`src/data/repository.ts:1384`, gravando as N+1 linhas em `:1535-1547`),
  `recordTransfer` (`:1705`, duas pernas em `:1716-1729`), `recordCheck`
  (`:2495-2507`, uma linha `discrepancy` por perna), `recordLoss` (`:2136`),
  `recordCount` (`:948`) e `recordPurchase` (`:405`).
- Leitores: `itemMovements` (`:1008-1034`), `unchecked` — remessas que ninguém
  conferiu, por `DISTINCT movement_group_id` (`:2526-2544`), `findLot` (`:3138`),
  `shipmentsOn` (`:3319-3358`), `planReversal` (`:4261-4295`) e `reverseGroup`
  (`:4442`).

---

### 8.6 `0017_a_check_that_matched_is_a_fact.sql` — a conferência que bateu

#### 8.6.1 O que o esquema recusava

`movement_moved_something`, criada na 0008, exigia que toda linha mova alguma
coisa, com uma exceção só: `adjustment`, que é contagem de prateleira e pode dar
zero de diferença (`supabase/migrations/0008_ledger_speaks_phase_one.sql:52-55`).
A regra está certa — linha que não move nada é ruído num livro-razão — mas deixa de
fora o caso da tela de transporte: a loja conferiu o que chegou e **bateu**. "Essa
linha não move mercadoria nenhuma, e é justamente por não mover que ela vale — é a
prova de que alguém abriu a caixa e contou. Sem poder gravá-la, o app só saberia
registrar conferência quando deu diferença, e 'a Loja Norte ainda não conferiu'
ficaria impossível de distinguir de 'a Loja Norte conferiu e estava tudo certo'"
(`supabase/migrations/0017_a_check_that_matched_is_a_fact.sql:8-13`).

#### 8.6.2 O DDL, literal

```sql
alter table movements drop constraint movement_moved_something;

alter table movements add constraint movement_moved_something
  check (
    quantity_base_units <> 0
    or kind = 'adjustment'
    or (kind = 'discrepancy' and post is not null)
  );
```

(`:19-26`.) A exceção de `discrepancy` é **mais estreita** que a de `adjustment`:
só vale quando a linha diz em que posto de controle aconteceu. "Diferença de zero
sem posto continua sendo ruído e continua recusada" (`:15-18`).

Valores possíveis de `post` (enum `control_post` da fundação): `picked`, `loaded`,
`delivered`, `checked` (`supabase/migrations/0001_foundation.sql:179`).

#### 8.6.3 Estado

**[SERVIDOR + APARELHO + TELA].** `recordCheck` grava exatamente a linha que esta
migração liberou: `kind` fixo `'discrepancy'`, `post` fixo `'checked'`, e
`difference` valendo `0` quando a lista de contagem é omitida — "sem lista, tudo
bateu" (`src/data/repository.ts:2486-2507`). A coluna `post` chegou ao aparelho na
V7, junto com o primeiro ato que a escreve (`src/data/db.ts:349-371`), e atravessa
a fila listada em `src/sync/serialize.ts:332`. A `db:verify` prova as duas metades
na checagem 5: contagem de diferença zero é aceita, produção de zero continua
recusada (`scripts/verify-migrations.sh:357-366`).

---

### 8.7 `0018_a_product_has_a_family.sql` — linha, tipo e sabor

#### 8.7.1 O desenho, e por que três níveis

Até aqui um produto era um nome plano: "Picolé tradicional de morango" era uma
string, e o sistema não sabia que ela tinha três partes. Isso custava três coisas ao
mesmo tempo: cadastrar sessenta produtos era digitar sessenta nomes inteiros, nenhum
relatório podia somar por sabor ou por linha, e a tela de produção não tinha o que
perguntar antes do tacho — por isso pedia tacho primeiro, "que é a conta do meio e
não a coisa que a pessoa acabou de fazer"
(`supabase/migrations/0018_a_product_has_a_family.sql:5-9`).

Os dois casos que a fábrica tem hoje, com o mesmo desenho nos dois (`:11-15`):

```
Picolé          -> Tradicional / Skimó / Top     -> Morango / Chocolate
Pote de sorvete -> 240 ml / 500 ml / 1 litro     -> Morango / Chocolate
```

O tamanho do pote **é** o tipo dele: "o segundo nível é o que divide a linha antes
do sabor, e para o pote isso é o volume. Inventar um quarto nível 'tamanho' que só
o pote usa deixaria o picolé com uma coluna sempre vazia e a tela com uma pergunta
que não se aplica" (`:17-20`).

Duas regras de produto que o esquema impõe:

- **Os três níveis são opcionais** — "uma fábrica que faz um doce só não deve ser
  obrigada a inventar uma linha e um tipo para cadastrá-lo. Quem tem um nível só
  preenche um nível só" (`:22-24`).
- **O sabor é da empresa, não do tipo** — "Morango é o mesmo morango no picolé e no
  pote; amarrá-lo ao tipo faria o dono cadastrar 'morango' uma vez por tipo, e na
  primeira mudança de nome ele teria seis morangos diferentes no relatório"
  (`:26-28`).

#### 8.7.2 As três tabelas

**`product_lines`** (`:31-41`):

| coluna | tipo | nulo? | default | regra |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | primary key |
| `company_id` | uuid | não | — | `references companies(id) on delete cascade` |
| `name` | text | não | — | — |
| `sort` | integer | não | `0` | ordem de exibição |
| `active` | boolean | não | `true` | — |

Mais `unique (id, company_id)`, e o comentário diz para que serve: "alvo das chaves
compostas: o tipo e o produto só apontam para uma linha da própria empresa. Sem
isto a chave só diz que a linha existe, não que ela é desta fábrica — e o dono que
administra duas fábricas lê as duas" (`:37-40`).

**`product_types`** (`:50-64`): as mesmas cinco colunas mais
`line_id uuid not null references product_lines(id) on delete cascade`, e duas
restrições de tabela:

```sql
unique (id, line_id),
constraint product_type_line_same_company
  foreign key (line_id, company_id) references product_lines (id, company_id)
  on delete cascade
```

O `unique (id, line_id)` é o alvo da chave composta de `products`: "é o que faz o
banco recusar um produto cuja linha não é a linha do tipo dele. Sem isto a checagem
viveria na tela, e a tela é decoração — o dado errado entraria por qualquer outro
caminho" (`:57-59`).

**`flavors`** (`:69-76`): `id`, `company_id`, `name`, `sort`, `active` e
`unique (id, company_id)`. Sem `line_id`, por decisão de produto.

#### 8.7.3 Os índices de nome — caixa e espaço não são identidade

```sql
create unique index product_lines_name_idx
  on product_lines (company_id, lower(btrim(name)));

create unique index product_types_name_idx
  on product_types (company_id, line_id, lower(btrim(name)));

create unique index flavors_name_idx
  on flavors (company_id, lower(btrim(name)));
```

(`:47-48`, `:66-67`, `:78-79`.) O motivo: "'Morango', 'morango' e 'Morango ' são a
mesma coisa para quem digita, e a unique de texto cru deixaria as três entrarem —
que é exatamente o 'seis morangos no relatório' que este desenho existe para
impedir" (`:43-46`). Note o escopo do tipo: único por **empresa + linha**, não por
empresa — "500 ml" pode existir em duas linhas diferentes.

#### 8.7.4 As três colunas em `products` e as chaves compostas

```sql
alter table products
  add column line_id   uuid,
  add column type_id   uuid,
  add column flavor_id uuid;

alter table products
  add constraint product_line_same_company
    foreign key (line_id, company_id) references product_lines (id, company_id)
    on delete restrict,
  add constraint product_flavor_same_company
    foreign key (flavor_id, company_id) references flavors (id, company_id)
    on delete restrict;

alter table products
  add constraint product_type_belongs_to_its_line
    foreign key (type_id, line_id) references product_types (id, line_id)
    match full
    on delete restrict;
```

(`:81-107`.) **`match full` é o desenho inteiro**, e o arquivo explica por quê:
"MATCH SIMPLE desliga a checagem quando QUALQUER coluna do par é nula, e nulo é o
estado normal aqui — os três níveis são opcionais. Com o padrão, um produto com
linha nula aceitaria qualquer `type_id`, inclusive um que não existe em lugar
nenhum. `match full` exige que o par esteja inteiro ou inteiramente nulo, que é
exatamente a regra: ou você não classificou, ou classificou os dois" (`:97-102`).

#### 8.7.5 A grade única — `nulls not distinct`

```sql
create unique index products_grid_idx
  on products (company_id, line_id, type_id, flavor_id)
  nulls not distinct
  where active;
```

(`:115-118`.) "No padrão do Postgres dois nulos não colidem, então (nulo, nulo,
nulo) entraria infinitas vezes — justamente a fábrica que não preencheu nível
nenhum ficaria sem a proteção. Aqui nulo é um valor como outro qualquer" (`:111-114`).
`nulls not distinct` é cláusula de Postgres 15 ou mais novo; o script de verificação
diz apenas "needs a local postgres (any recent version)"
(`scripts/verify-migrations.sh:17`), e não checa versão.

#### 8.7.6 Índices auxiliares e RLS

```sql
create index product_lines_company_idx on product_lines (company_id) where active;
create index product_types_line_idx    on product_types (company_id, line_id) where active;
create index flavors_company_idx       on flavors (company_id) where active;
create index products_flavor_idx       on products (company_id, flavor_id) where active;
```

(`:120-123`.)

```sql
alter table product_lines enable row level security;
alter table product_types enable row level security;
alter table flavors       enable row level security;

create policy product_lines_read on product_lines for select using (company_id in (select private.current_companies()));
create policy product_types_read on product_types for select using (company_id in (select private.current_companies()));
create policy flavors_read       on flavors       for select using (company_id in (select private.current_companies()));

create policy product_lines_manage on product_lines for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
create policy product_types_manage on product_types for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
create policy flavors_manage       on flavors       for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
```

(`:125-138`.) A divisão é a mesma dos produtos e a razão está escrita: "o operador
precisa enxergar a grade para escolher o que produziu, e não precisa poder criar
sabor nenhum" (`:129-131`). As três `_manage` são `for all`, portanto cobrem UPDATE
— é por isso que estas três tabelas não precisaram de uma migração de reenvio.

#### 8.7.7 O ataque adversarial que derrubou a primeira versão

A checagem 7 da `db:verify` nasceu de um ataque que derrubou a primeira versão da
0018 inteira, e **três dos achados eram invisíveis de fora**: a migração nem
aplicava (chamava as funções sem o schema `private`), a chave composta era MATCH
SIMPLE, e a unique de nome era texto cru
(`scripts/verify-migrations.sh:562-570`). "Nenhuma das três aparece num teste de
unidade: são garantias do Postgres, e só um Postgres de verdade responde por elas."

O que a checagem 7 prova, uma linha por tentativa
(`scripts/verify-migrations.sh:560-635`):

| tentativa | resultado esperado |
|---|---|
| inserir sabor `'  morango '` com `'Morango'` existente | recusado |
| produto com `line_id` = Picolé e `type_id` = 500 ml (de outra linha) | recusado |
| produto com `line_id` nulo e `type_id` preenchido | recusado (é o buraco do MATCH SIMPLE) |
| produto com linha + tipo + sabor coerentes | aceito |
| segundo produto com a mesma trinca | recusado |
| primeiro produto sem classificação nenhuma | aceito |
| segundo produto sem classificação nenhuma | recusado (`nulls not distinct`) |

#### 8.7.8 Estado

**[SERVIDOR + APARELHO + TELA].**

- Aparelho: V9 cria as três tabelas com `INTEGER NOT NULL DEFAULT 1` em `active`,
  os três índices de nome com `lower(trim(name))` (SQLite não tem `btrim`), as três
  colunas em `products` como chaves **simples**, e a grade como
  `products_grid_idx ON products (company_id, coalesce(line_id, ''), coalesce(type_id, ''), coalesce(flavor_id, '')) WHERE active = 1` — o `coalesce` é o
  equivalente local do `nulls not distinct` (`src/data/db.ts:405-455`).
- A garantia "tipo é da linha" não pode ser chave composta no SQLite (não se
  acrescenta FK a coluna existente), então ela mora na **escrita**, não na tela:
  `assertTypeBelongsToLine` levanta `TypeIsFromAnotherLineError` com a mensagem
  `type ${typeId} belongs to another line`, e é chamada por `saveProduct`
  (`src/data/repository.ts:1936`, `:3737-3760`). O docblock diz por que no
  repositório e não na tela: "a tela é decoração, e o assistente grava pelo mesmo
  caminho sem passar por ela" (`:3743-3749`).
- Travessia: `product_lines`, `product_types` e `flavors` são tabelas envidáveis
  (`src/sync/serialize.ts:68-70`), com `take: ['id','company_id','name','sort']`
  (mais `line_id` no tipo) e `active` convertido de 0/1 para booleano pelo `flag()`
  (`:220-233`, `:86-90`). A ordem de chegada é a ordem da fila — "linha antes do
  tipo, tipo antes do produto. A fila é enviada da mais velha para a mais nova
  exatamente por isso" (`:217-219`).
- `products` atravessa com `line_id`, `type_id`, `flavor_id` no `take`
  (`:235-247`).
- Telas: `app/products/new.tsx:28-30` e `:134-136` chamam `listLines`, `listTypes`,
  `listFlavors`; as funções de gravação `saveLine`, `saveType`, `saveFlavor` fazem
  `INSERT ... ON CONFLICT(id) DO UPDATE SET name, sort` e enfileiram
  (`src/data/repository.ts:3679-3733`).

---

### 8.8 `0019_an_order_is_demand.sql` — pedido é demanda, e demanda não é livro-razão

#### 8.8.1 A decisão de fundação, transcrita

"A primeira decisão de desenho é a que não aparece na tela: pedido **não** é
movimento" (`supabase/migrations/0019_an_order_is_demand.sql:5-6`). Duas razões,
ambas de fundação:

1. **O saldo mentiria.** "O saldo é a soma dos movimentos, e um pedido não move
   nada: as caixas continuam na câmara fria, e alguém que confere a prateleira
   encontra tudo o que o sistema diz que tem. Gravar demanda como movimento faria o
   saldo mentir no dia em que o cliente ligou" (`:8-12`).
2. **O livro-razão é append-only e pedido muda.** "O cliente corrige a quantidade,
   adia a data, cancela. Corrigir isso por estorno seria escrever no livro que
   trezentos picolés saíram e voltaram, quando nenhum saiu do freezer. Estorno é
   para o que aconteceu" (`:14-17`).

O elo com o razão é um evento só: "o livro-razão só entra quando a carga sai de
verdade — e isso já é a transferência, que existe desde a 0001" (`:19-21`). A lição
generalizada ficou escrita: compromisso e fato são tabelas diferentes, e reserva,
separação e devolução caem no mesmo desenho (`docs/insights.md:1609-1624`).

**Aprovação é configuração da empresa, não escolha nossa:** "uma fábrica quer que
todo pedido passe pelo dono; outra tem três clientes e a burocracia só atrasa a
entrega. Os dois caminhos existem, e quem escolhe é a empresa em
`orders_need_approval`. O padrão é sem aprovação, porque a fábrica de seis pessoas é
o caso que este produto tem na mão" (`:23-27`). E: "o que decide o estado inicial é
o GATILHO, não a tela: um cliente que manda o pedido pelo próprio aparelho não pode
escolher nascer aprovado" (`:29-30`).

#### 8.8.2 As duas unique compostas que esta migração introduz no esquema antigo

```sql
alter table locations add constraint locations_id_company_key unique (id, company_id);
alter table items     add constraint items_id_company_key     unique (id, company_id);
```

(`:36-37`.) Criadas para o pedido poder dizer `foreign key (place_id, company_id)`.
Este é o padrão que a 0029 depois aplicou à tabela mais importante do sistema,
notando que "a tabela mais importante do sistema era a que não usava"
(`supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql:17-20`).

#### 8.8.3 A chave de configuração

```sql
alter table companies
  add column orders_need_approval boolean not null default false;

comment on column companies.orders_need_approval is
  'Se todo pedido nasce pendente à espera de quem tem approve_order. Desligado '
  'por padrão: a fábrica pequena entrega antes de a aprovação chegar.';
```

(`:39-44`.)

#### 8.8.4 Tabela `orders`

| coluna | tipo | nulo? | default | regra / comentário do arquivo |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | primary key |
| `company_id` | uuid | não | — | `references companies(id) on delete cascade` |
| `place_id` | uuid | não | — | "loja própria, cliente, distribuidor — tudo é `locations`, que é onde este sistema já guarda 'lugar que recebe caixa'" |
| `status` | text | não | `'open'` | "'pending' só existe quando a empresa liga a aprovação. Depois dele o pedido é 'open' até virar 'delivered' ou 'cancelled'" |
| `requested_for` | date | sim | — | "o dia em que o cliente quer receber. A data da DECISÃO é outra e é mais cedo — quem precisa na sexta produz na quinta — e essa conta é da tela" |
| `note` | text | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `decided_at` | timestamptz | sim | — | — |
| `recorded_by` | uuid | não | — | `references auth.users(id)`; "qual CONTA escreveu, imposto pelo servidor como em `movements`… um pedido é do cliente, não de quem digitou" |

Restrições de tabela (`:66-71`):

```sql
constraint orders_status_known
  check (status in ('pending', 'open', 'delivered', 'cancelled')),
constraint order_place_same_company
  foreign key (place_id, company_id) references locations (id, company_id)
  on delete restrict,
unique (id, company_id)
```

#### 8.8.5 Tabela `order_lines`

| coluna | tipo | nulo? | regra |
|---|---|---|---|
| `id` | uuid | não | primary key, `gen_random_uuid()` |
| `company_id` | uuid | não | `references companies(id) on delete cascade` |
| `order_id` | uuid | não | chave composta abaixo |
| `item_id` | uuid | não | chave composta abaixo |
| `base_units` | integer | não | `check (base_units > 0)` |

```sql
constraint order_line_belongs_to_its_order
  foreign key (order_id, company_id) references orders (id, company_id)
  on delete cascade,
constraint order_line_item_same_company
  foreign key (item_id, company_id) references items (id, company_id)
  on delete restrict,
unique (order_id, item_id)
```

(`:74-91`.) `base_units` é `integer` (não `bigint` como em `movements`), "na unidade
base do item, como todo o resto do sistema. Zero não é pedido, e negativo é
devolução — que tem caminho próprio e não é este" (`:79-81`). A unique de item por
pedido: "o mesmo item duas vezes no mesmo pedido é erro de digitação, não pedido
duplo: quem quer mais soma na linha que já existe" (`:88-90`).

Índices (`:93-96`):

```sql
create index orders_open_idx on orders (company_id, requested_for)
  where status in ('pending', 'open');
create index order_lines_order_idx on order_lines (order_id);
create index order_lines_item_idx  on order_lines (company_id, item_id);
```

#### 8.8.6 Gatilho 1 — o estado inicial é do banco

```sql
create or replace function private.order_starts_where_the_company_says()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'cancelled' then
    select case when c.orders_need_approval then 'pending' else 'open' end
      into new.status
      from companies c
     where c.id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger orders_start_where_the_company_says
  before insert on orders
  for each row execute function private.order_starts_where_the_company_says();
```

(`:103-122`.) O status que o aparelho mandou é **sobrescrito**, exceto quando é
`'cancelled'`. A razão: "uma empresa que exige aprovação e um cliente que manda o
pedido pelo próprio aparelho é exatamente o caso em que a regra não pode morar no
aplicativo: o payload vem de fora, e 'status' é um campo como outro qualquer no
JSON" (`:100-102`).

#### 8.8.7 Gatilho 2 — sair do pendente é de quem aprova

```sql
create or replace function private.only_approval_leaves_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' and new.status <> 'cancelled' then
    if not private.has_capability(new.company_id, 'approve_order') then
      raise exception
        'Este pedido espera aprovação, e aprovar não faz parte do seu acesso.';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_leave_pending_only_by_approval
  before update on orders
  for each row execute function private.only_approval_leaves_pending();
```

(`:130-149`.) A mensagem em português é decisão de produto e chega ao usuário como
está. Cancelar um pedido pendente **não** exige `approve_order`. O motivo do gatilho:
"a política de UPDATE deixa passar quem despacha, porque marcar entregue é trabalho
de quem carrega o caminhão. Sem este gatilho, essa mesma pessoa tiraria um pedido do
pendente sem nunca ter tido `approve_order`, e a aprovação que a empresa ligou seria
decoração" (`:126-129`).

#### 8.8.8 RLS de `orders` e `order_lines`, literal

```sql
alter table orders      enable row level security;
alter table order_lines enable row level security;

create policy orders_read on orders for select
  using (company_id in (select private.current_companies()));
create policy order_lines_read on order_lines for select
  using (company_id in (select private.current_companies()));

create policy orders_place on orders for insert
  with check (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  );
create policy order_lines_place on order_lines for insert
  with check (private.has_capability(company_id, 'place_order'));

create policy orders_decide on orders for update
  using (
    private.has_capability(company_id, 'approve_order')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'manage_company')
  )
  with check (
    private.has_capability(company_id, 'approve_order')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'manage_company')
  );

create policy order_lines_correct on order_lines for all
  using (private.has_capability(company_id, 'place_order'))
  with check (private.has_capability(company_id, 'place_order'));
```

(`:151-187`.) Ler é de quem está na empresa: "o operador precisa enxergar o que foi
pedido para saber o que produzir, e isso não tem preço nem custo dentro" (`:154-155`).
`place_order` é a capacidade que "existia desde a fundação esperando exatamente por
esta tabela" (`:161-162`).

#### 8.8.9 O buraco que ficou, e as duas migrações que o fecharam

`orders_decide` não inclui `place_order`. Três dos sete papéis do produto —
`storeManager`, `customer`, `salesperson` — têm `place_order` e nenhuma das três
capacidades da porta de update (`src/domain/access.ts:89`, `:108`, `:111`). Como a
fila sobe com `on conflict (id) do update`, a **segunda** subida do pedido dessas
pessoas era recusada e o motor para a fila no primeiro buraco de propósito, prendendo
tudo o que foi gravado depois
(`supabase/migrations/0027_a_resend_is_not_a_decision.sql:10-20`). Consertos:

- **0027** cria `orders_resend` (`for update` com `place_order` **e**
  `recorded_by = auth.uid()` nos dois lados) e o gatilho
  `orders_decision_fields_stay_put`, que devolve `status` e `decided_at` ao valor
  antigo para quem não decide, em vez de recusar
  (`supabase/migrations/0027_a_resend_is_not_a_decision.sql:42-95`). O nome do
  gatilho é **load-bearing**: Postgres roda gatilhos `before` da mesma tabela em
  ordem alfabética, e `orders_decision_fields_stay_put` tem de vir antes de
  `orders_leave_pending_only_by_approval` ('d' antes de 'l'), senão o segundo vê um
  status diferente, levanta exceção e a fila trava de novo (`:84-92`).
- **0032** acrescenta `new.recorded_by := old.recorded_by;` ao mesmo gatilho, para
  todos, antes de qualquer pergunta sobre capacidade: `orders_decide` só perguntava
  pela capacidade, então o mesmo update que aprovava um pedido podia trocar **quem o
  anotou** (`supabase/migrations/0032_who_ordered_it_never_changes.sql:8-11`,
  `:26-48`).

#### 8.8.10 O que a `db:verify` prova sobre pedidos

Checagem 8 (`scripts/verify-migrations.sh:637-686`), numa empresa com
`orders_need_approval = true`, uma "Vendedora" com `place_order` + `dispatch` e uma
"Dona" com `place_order` + `approve_order`:

| ação | resultado exigido |
|---|---|
| Vendedora insere pedido dizendo `status = 'open'` | aceito, e o `status` gravado é `pending` |
| Vendedora faz `update orders set status = 'open'` | recusado |
| Dona faz o mesmo update | aceito |
| linha de pedido apontando para item de outra empresa | recusada |
| linha de pedido com `base_units = 0` | recusada |

Checagem 9 (`:688-730`), com uma "Gerente da loja" que tem exatamente
`place_order, view_sale_price, check_receipt, record_loss`: a primeira subida entra,
a segunda (com `on conflict (id) do update set place_id, status, recorded_by`)
também entra, o status continua `pending` depois das duas — "o reenvio não decidiu
nada" — e quem tem `approve_order` continua conseguindo aprovar.

#### 8.8.11 Estado

**[SERVIDOR + APARELHO + TELA]**, com uma divergência de configuração que precisa
ficar registrada.

- Aparelho: V10 cria `orders` e `order_lines` com as mesmas colunas **menos
  `recorded_by`**, o mesmo `CHECK (status IN (...))`, `orders_open_idx` (aqui com
  `status` dentro do índice, não como cláusula `WHERE`), `order_lines_once_idx`
  único por `(order_id, item_id)` e `order_lines_item_idx`
  (`src/data/db.ts:457-497`).
- Travessia: `orders` viaja com
  `['id','company_id','place_id','status','requested_for','note','created_at','decided_at']`
  e `recorded_by` carimbado na saída pelo ator; `order_lines` viaja com
  `['id','company_id','order_id','item_id','base_units']`
  (`src/sync/serialize.ts:297-315`). A ordem pedido→linhas é garantida pela fila
  ser enviada da escrita mais velha para a mais nova (`:295-296`).
- Telas: `app/orders/new.tsx` (grava com `saveOrder`, `:267`), `app/orders/index.tsx`
  (lista e muda status, `:11`, `:68`, `:88`), `app/transfer.tsx` (lê pedidos abertos
  e marca `delivered` ao despachar, `:248`, `:279`), `app/settings.tsx` (liga e
  desliga a aprovação, `:1030`).
- **A divergência:** no aparelho, "todo pedido nasce pendente?" é uma preferência
  local guardada em `meta` sob a chave `'orders.needApproval'`
  (`src/data/repository.ts:3968-3984`), e `saveOrder` escolhe
  `status = (await ordersNeedApproval()) ? 'pending' : 'open'`
  (`src/data/repository.ts:4000`). O servidor decide pelo **seu** próprio
  `companies.orders_need_approval`, que nada no aplicativo escreve (`companies` não
  é tabela envidável). Consequência mecânica, direta do gatilho: numa empresa cuja
  linha no servidor está com o default `false`, um pedido gravado como `pending` no
  aparelho chega ao servidor e sai do gatilho como `'open'`. NÃO EXISTE NO CÓDIGO
  caminho que sincronize essa preferência.

---

### 8.9 `0020_a_lot_and_the_day_it_dies.sql` — o prazo mora no produto

#### 8.9.1 O diagnóstico que abre o arquivo

"`lots` existe desde a primeira migração, com `code`, `produced_on`, `expires_on` e
um índice dedicado em `movements (company_id, lot_id)`. Nunca teve um escritor: é a
mesma peça pronta e sem chamador que o `assistant_phrase` era, e a Fase 2 vem
justamente buscá-la" (`supabase/migrations/0020_a_lot_and_the_day_it_dies.sql:3-6`).

O que faltava para a produção preencher `expires_on` sozinha era o prazo — "e ele é
do PRODUTO, não da corrida. Quem está de luva no tacho não sabe de cabeça que o
picolé dura seis meses e o pote três; o cadastro sabe, respondeu uma vez, e a partir
daí toda corrida nasce com a data pronta. Perguntar a validade a cada tacho é pedir
o que o sistema já pode deduzir" (`:8-12`).

Nulo é resposta válida e significa **não vence**: "sorvete a granel para uso
interno, embalagem, insumo de prateleira. O lote continua existindo e continua
rastreando — o que ele não carrega é uma data inventada, que seria pior que nenhuma
nos dois sentidos (descartar mercadoria boa, vender mercadoria vencida)" (`:14-18`).

#### 8.9.2 O DDL, literal

```sql
alter table products
  add column shelf_life_days integer
  check (shelf_life_days is null or shelf_life_days > 0);

comment on column products.shelf_life_days is
  'Quantos dias o produto dura depois de feito. Nulo: não vence.';

create policy lots_resend on lots
  for update using (private.has_capability(company_id, 'record_production'))
  with check (private.has_capability(company_id, 'record_production'));
```

(`:20-42`.) A política de reenvio usa a **mesma** capacidade de `lots_write`, que
cobria só `insert` desde a 0001
(`supabase/migrations/0001_foundation.sql:303-304`). A frase que fecha o arquivo:
"peça sem escritor não é peça pronta: é peça não exercitada" (`:38`).

#### 8.9.3 A aritmética da validade, que mora no aparelho

O servidor guarda o prazo; quem calcula a data é o domínio
(`src/domain/lot.ts`), e a regra é transcrita porque o servidor não a repete:

- **Código do lote:** `AAAAMMDD-NN` — a data em que se produziu e a ordem da corrida
  naquele dia. `lotCode(producedOn, sequence)` remove os hifens da data e concatena
  com a sequência preenchida a dois dígitos (`src/domain/lot.ts:33-36`). Ordena
  sozinho, cabe num código de barras curto, e "uma pessoa lê em voz alta pelo
  telefone sem soletrar — que é como um recall acontece de verdade" (`:23-27`).
- **Validade:** `expiresOn(producedOn, shelfLifeDays)` devolve `null` quando o prazo
  é nulo, não finito ou ≤ 0; senão soma dias de calendário em UTC sobre a data local
  de produção e corta os dez primeiros caracteres do ISO
  (`src/domain/lot.ts:49-55`). "`2026-09-02` mais 180 dias é `2027-03-01`, seja onde
  for que o celular esteja" (`:41-44`).
- **Dias até vencer:** `daysUntilExpiry(expires, today)` devolve
  `Math.round((at(expires) - at(today)) / 86_400_000)`, negativo quando já venceu —
  "'venceu ontem' e 'vence em três dias' pedem tratamentos diferentes na tela, e
  quem decide isso é a tela" (`:64-72`).
- **Um lote por corrida**, não por dia nem por produto: "se o tacho da manhã
  derreteu e o da tarde não, o recall é do tacho da manhã" (`:10-13`).

#### 8.9.4 Estado

**[SERVIDOR + APARELHO + TELA].**

- Aparelho: V11 cria a tabela `lots` local (que não existia) com
  `lots_code_idx` único por `(company_id, code)`, `lots_expiry_idx` parcial e
  `lots_item_idx`, e acrescenta `products.shelf_life_days INTEGER`
  (`src/data/db.ts:499-524`). O docblock registra que `movements.lot_id` continua
  **sem** chave estrangeira no aparelho porque o SQLite não acrescenta FK a coluna
  existente, e que quem recusa lote fantasma é o servidor (`:490-497`).
- Escritor: `recordProduction` calcula
  `const expires = expiresOn(input.producedOn, product.shelfLifeDays)`
  (`src/data/repository.ts:1485`), conta os lotes **do dia** para a sequência
  (`:1503-1507`) e insere o lote **antes** das linhas que o citam, porque a fila
  sobe na ordem em que foi escrita e o servidor tem a FK que o SQLite não tem
  (`:1488-1520`).
- Leitores: `lotsOn` (`:2673`), `expiringSoon` (`:2967`), `lotsInStock` (`:3017`),
  `lotsInRoomAt` (`:3077`), `findLot` (`:3120`), e a tela `app/lots/[id].tsx`.
- Travessia: `lots` viaja com
  `['id','company_id','item_id','code','produced_on','expires_on','recipe_version_id','created_at']`
  (`src/sync/serialize.ts:260-274`); `products` leva `shelf_life_days` (`:243`).
- Exercício de servidor: a checagem 6 concede `insert, update` em `lots`
  (`scripts/verify-migrations.sh:451-456`), reenvia a fila inteira e ainda confere
  que o lote chegou apontando para uma `recipe_versions` que subiu antes dele, na
  mesma fila (`:551-555`). O guard do gerador de sessão recusa rodar se alguma
  tabela declarada em `serialize` não for exercitada — foi ele que cobrou `lots`
  ("a sessão não exercita `lots` — a checagem 6 cobriria menos do que promete",
  `scripts/device-session.ts:328-333`, `docs/insights.md:1743-1746`).

---

### 8.10 `0021_what_was_agreed_with_the_store.sql` — a ficha de acordo da loja

#### 8.10.1 O DDL, literal

```sql
alter table locations add column contact_phone text;
alter table locations add column delivery_days smallint not null default 0;
alter table locations add column agreement_note text;

alter table locations add constraint locations_delivery_days_is_a_week
  check (delivery_days between 0 and 127);
```

(`supabase/migrations/0021_what_was_agreed_with_the_store.sql:15-22`.)

#### 8.10.2 As três decisões

1. **Por que existe:** "uma fábrica combina 'terça e sexta' com uma loja e 'sábado'
   com outra, e até aqui essa tabela morava na cabeça de alguém. Enquanto ela mora
   lá, o pedido nasce com a data errada e a carga sai no dia em que a loja está
   fechada" (`:3-5`).
2. **Bitmask, não lista de texto:** "os dias são um bitmask com o bit 0 no domingo,
   a mesma numeração de `Date.getDay()` no aparelho (`src/domain/agreement.ts`). Um
   inteiro atravessa a fila do aparelho sem conversão nenhuma, e é isso que garante
   que os dois lados leiam o mesmo acordo — uma lista de texto tem duas gramáticas
   possíveis e a divergência aparece só no dia da entrega" (`:7-11`).
3. **Zero não é "nenhum dia":** "zero é 'não combinamos dia', que NÃO é 'nenhum
   dia': a loja sem acordo recebe quando dá, e nenhuma tela deve inventar um dia
   para ela" (`:13-14`).

O `check` de 0 a 127: "um acordo impossível é erro de digitação, não combinação
exótica: sete bits é a semana inteira, e o banco recusa em vez de guardar um dia que
não existe" (`:19-20`).

#### 8.10.3 A aritmética do bitmask, transcrita do domínio

`src/domain/agreement.ts`, que é a definição normativa dos bits:

| símbolo | valor / comportamento |
|---|---|
| `WEEK_BITS` | `[1, 2, 4, 8, 16, 32, 64]`, domingo no índice 0 (`:17`) |
| `agreedOn(days, weekday)` | `(days & WEEK_BITS[noWeek(weekday)]) !== 0` (`:37-39`) |
| `toggleDay(days, weekday)` | `days ^ WEEK_BITS[noWeek(weekday)]` (`:42-44`) |
| `daysUntilNextDelivery(days, todayWeekday)` | `null` se `days === 0`; senão o menor `ahead` de 0 a 6 com `agreedOn(days, (todayWeekday + ahead) % 7)`; `null` se nenhum (`:58-64`) |
| `noWeek(weekday)` | lança `RangeError` com a mensagem `` `a semana tem sete dias, e ${weekday} não é um deles` `` para não-inteiro ou fora de 0..6 (`:29-34`) |

Duas decisões de produto dentro dessas funções: **zero dias é resposta válida** —
"quem faz o pedido de manhã no dia da loja está pedindo para hoje, e empurrar para a
semana que vem seria o sistema corrigindo a pessoa" (`:49-52`); e **o laço vai até
sete e não seis** — "a semana que fecha é a resposta certa para quem só recebe num
dia: pedindo na quinta para uma loja de quinta, o próximo é hoje; pedindo na sexta,
é daqui a seis" (`:54-56`).

O guarda contra "guarda decorativo" também está registrado: `noWeek` existe porque
indexar fora de `WEEK_BITS` devolve `undefined`, que vira zero na conta de bits e
responde "não" sozinho — e foi o `mutate` que mostrou que apagar a faixa não quebrava
teste nenhum (`:19-27`).

#### 8.10.4 Estado

**[SERVIDOR + APARELHO + TELA].**

- Aparelho: V12 acrescenta as três colunas com os mesmos nomes, `delivery_days` como
  `INTEGER NOT NULL DEFAULT 0` (`src/data/db.ts:526-536`). O SQLite **não** tem o
  `check` de 0..127 — quem responde por isso é o servidor.
- Travessia: as três estão no `take` de `locations`, com o comentário explicando por
  que o telefone viaja: "um telefone que fica só no aparelho some quando o aparelho
  some, e é o número que alguém liga para avisar que a carga atrasou"
  (`src/sync/serialize.ts:149-162`).
- Telas: `app/places.tsx` mostra o acordo na lista (`:190`, `:271-280`) e edita os
  três campos (`:649-709`), salvando por `savePlace`; `app/orders/new.tsx` usa
  `daysUntilNextDelivery(place.deliveryDays, hoje)` para sugerir a data (`:155`,
  `:286`).
- Exercício de servidor: a checagem 7 termina provando o `check` —
  `delivery_days = 200` é recusado e `delivery_days = 36` (terça, bit 2 = 4, mais
  sexta, bit 5 = 32) é aceito (`scripts/verify-migrations.sh:627-632`). O motivo
  escrito lá: "o banco é o único lugar que responde por isso quando a fila vem de um
  app que não é este. Sem a restrição, a loja 'recebe no dia 300' e nada acusa"
  (`:623-626`).

---

### 8.11 `0022_the_stick_leaves_the_storeroom.sql` — o palito sai do estoque

#### 8.11.1 O defeito que ela fecha

"Até aqui a embalagem era um valor DIGITADO no produto
(`products.unit_packaging_cents`), enquanto palito e saquinho são itens comprados por
nota. O custo congelado saía certo — a correção está em `docs/insights.md` —, mas
nenhum movimento tirava palito do almoxarifado: o saldo dele só subia, que é
exatamente o cheiro que o `CLAUDE.md` manda procurar"
(`supabase/migrations/0022_the_stick_leaves_the_storeroom.sql:3-8`). A dívida estava
nomeada desde o dia da correção do custo congelado
(`docs/insights.md:1272-1276`).

#### 8.11.2 O DDL, literal

```sql
alter table products add column packaging_items jsonb not null default '[]'::jsonb;

alter table products add constraint products_packaging_items_is_a_list
  check (jsonb_typeof(packaging_items) = 'array');
```

(`:23-29`.) O `check` existe por um motivo específico: "um objeto onde deveria haver
lista atravessa o `jsonb` sem reclamar e só aparece na hora de somar o consumo.
Mesma razão do `structure()` no aparelho: a falha que ainda parece sucesso é a que
merece uma restrição" (`:25-27`).

#### 8.11.3 As três decisões de desenho

1. **A quantidade é por unidade produzida, não por tacho** — e é isso que separa
   `packaging_items` de uma linha de receita: "receita se espalha pelo que o tacho
   rendeu: meio tacho consome metade do açúcar. Palito não se espalha — uma unidade
   leva um palito tenha a corrida rendido 400 ou 500" (`:10-13`).
2. **Lista em `jsonb` na própria linha, não tabela à parte** — "pelo mesmo motivo
   que `items.packaging` já é: curta, reescrita inteira, sem histórico próprio. O
   histórico é o consumo que cada corrida gravou com a taxa congelada, e esse está
   em `movements`, que ninguém reescreve" (`:15-18`). O docblock do aparelho
   acrescenta a razão de engenharia: tabela à parte exigiria enfileirar exclusão, "e
   o motor de sincronia deste app só sabe enviar linha (`upsert`)"
   (`src/data/db.ts:550-556`).
3. **`unit_packaging_cents` continua e não é duplicidade** — "passa a ser o que NÃO
   está listado aqui. Quem não quer contar palito digita o valor; quem quer, lista os
   itens. Os dois caminhos existem, como manda o projeto" (`:20-22`). O tipo do
   repositório repete a divisão: quem lista os itens usa o campo digitado "só para o
   que sobrou de fora — rótulo, fita, o que nunca virou item"
   (`src/data/repository.ts:1783-1789`).

#### 8.11.4 A forma do JSON, que o esquema não declara

O `check` só garante que é um array. A forma de cada elemento é imposta pelo
aparelho e é `{ itemId: string, quantityPerUnit: number }`:

- **Na escrita**, `normalizePackagingItems` ignora linha sem `itemId`, **lança**
  `Error('embalagem por unidade tem que ser mais que zero')` para quantidade não
  finita ou ≤ 0, e **soma** as quantidades quando o mesmo item aparece duas vezes —
  "o mesmo item duas vezes é erro de digitação e não receita exótica… ninguém pediu
  dois palitos por picolé, alguém tocou duas vezes"
  (`src/data/repository.ts:91-103`).
- **Na leitura**, `parsePackagingItems` devolve `[]` para JSON inválido ou para
  qualquer coisa que não seja array, e descarta silenciosamente elemento que não seja
  objeto, `itemId` não string, `quantityPerUnit` não numérico, não finito ou ≤ 0
  (`:105-126`). O nome do item **não** é guardado no JSON: vem do catálogo a cada
  leitura, "senão o JSON passa a ser um segundo lugar onde o item se chama alguma
  coisa — e o dia em que alguém corrigir 'Palito de picolé' para 'Palito', a tela de
  produção continuaria dizendo o nome antigo" (`:73-78`). Linha quebrada é ignorada
  em vez de derrubar a tela: "uma corrida que não consome o palito é um erro de
  inventário; uma tela de produção que não abre é a fábrica parada" (`:80-83`).
- **Na travessia**, `products.packaging_items` passa por `structure()`, que faz
  `JSON.parse` do texto do SQLite e devolve `null` quando falha — sem isso "o
  Postgres guarda uma string entre aspas onde deveria haver lista, aceita sem
  reclamar, e o consumo do outro lado passa a somar nada"
  (`src/sync/serialize.ts:96-112`, `:248-252`).

#### 8.11.5 Como a lista se torna consumo no razão

Em `recordProduction`, cada linha de embalagem é **somada ao mapa de necessidades**
que a receita produziu, multiplicada pelas unidades produzidas:

```ts
for (const linha of product.packagingItems) {
  const gasto = linha.quantityPerUnit * input.unitsProduced;
  needed.set(linha.itemId, (needed.get(linha.itemId) ?? 0) + gasto);
}
```

(`src/data/repository.ts:1379-1382`.) O comentário acima explica por que somar em
vez de abrir um caminho paralelo: "atravessa tudo o que já existe: a trava de estoque
da sala recusa a corrida sem palito, o valor consumido entra na taxa congelada, e o
movimento sai com a mesma taxa dos outros insumos. Um caminho paralelo aqui seria um
segundo lugar de onde o consumo pode divergir" (`:1370-1374`).

#### 8.11.6 Estado

**[SERVIDOR + APARELHO + TELA].** Aparelho: V13,
`ALTER TABLE products ADD COLUMN packaging_items TEXT NOT NULL DEFAULT '[]'`
(`src/data/db.ts:559-561`). Escritor: `saveProduct` grava
`JSON.stringify(normalizePackagingItems(input.packagingItems))`
(`src/data/repository.ts:1954-1955`, upsert em `:1996-2016`). Leitores: `listProducts`
(`:1861`), `app/production/new.tsx:203` (a lista que vira consumo na tela de
produção), `app/recipes/[id].tsx:240` e `app/recipes/index.tsx:105`
(`packagingRatePerUnit` no custo por unidade).

---

### 8.12 O que estas migrações fizeram com `movements`, consolidado

Depois deste bloco, as colunas de `movements` acrescentadas por ele são quatro (uma
delas indiretamente, via restrição):

| coluna | migração | tipo | FK | índice |
|---|---|---|---|---|
| `device_id` | 0013 | uuid | `devices(id) on delete restrict` | `movements_device_idx (company_id, device_id) where device_id is not null` |
| `operator_id` | 0014 | uuid | `memberships(id) on delete restrict` | `movements_operator_idx (company_id, operator_id) where operator_id is not null` |
| `movement_group_id` | 0016 | uuid | nenhuma | `movements_group_idx (company_id, movement_group_id) where movement_group_id is not null` |
| — (`movement_moved_something` reescrita) | 0017 | — | — | — |

**Consequência que precisa ficar escrita: nenhuma das três colunas novas aparece em
`movements_visible`.** A view foi definida na 0001 e recriada uma única vez, na 0008
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:82-92`); uma busca por
`movements_visible` em todas as 32 migrações não encontra nenhuma recriação
posterior. As colunas que a view expõe são exatamente: `id, company_id, kind,
occurred_at, recorded_at, recorded_by, item_id, quantity_base_units, location_id,
counterpart_location_id, lot_id, post, loss_reason, reverses_movement_id,
assistant_phrase, note`, mais `unit_cost_rate` e `unit_price_rate` filtrados por
`view_cost` / `view_sale_price`. Portanto, um cliente que leia pela view — o caminho
que a fundação desenhou para o custo não escapar — **não vê** `device_id`,
`operator_id` nem `movement_group_id`. Não há no código nada que diga se isso é
deliberado: NÃO ESTÁ NO CÓDIGO nenhuma nota sobre a view depois da 0008.

---

### 8.13 O que a barra prova, migração por migração

| migração | provada por | como |
|---|---|---|
| 0012 | nada | coluna sem escritor e sem leitor |
| 0013 (`devices`) | nada | nenhuma linha é inserida em `devices` em nenhum lugar |
| 0013 (`movements.device_id`) | checagem 6, indiretamente | a coluna atravessa a fila sempre nula (`src/sync/serialize.ts:341`) |
| 0014 | checagem 6 / prova de atribuição | `recorded_by` de outro é recusado, `operator_id` de outro é aceito (`scripts/verify-migrations.sh:381-393`) |
| 0015 | checagem 6 | fila subida duas vezes sob RLS, sem estrago (`:508-512`) |
| 0016 | checagem 6 | a corrida de produção da sessão sobe com as N+1 linhas do mesmo grupo (`scripts/device-session.ts:206-215`) |
| 0017 | checagem 5 | contagem de zero aceita, produção de zero recusada (`scripts/verify-migrations.sh:357-366`) |
| 0018 | checagem 7 | sete tentativas, listadas em 8.7.7 |
| 0019 | checagens 8, 9 e 13 | estado inicial do banco, aprovação, reenvio pela capacidade mínima, autoria congelada |
| 0020 (`shelf_life_days`) | checagem 6, indiretamente | `products` atravessa com a coluna |
| 0020 (`lots_resend`) | checagem 6 | `lots` recebe `insert, update` e a fila sobe duas vezes (`:451-456`, `:508-512`) |
| 0021 | checagem 7 | 200 recusado, 36 aceito (`:627-632`) |
| 0022 | checagem 6, indiretamente | `packaging_items` atravessa como `jsonb` de verdade via `structure()` |

Há ainda um segundo guarda, em milissegundos, que **lê as duas migrações e compara
os dois esquemas**: `src/sync/agreement.test.ts` faz o parse de todos os `.sql` de
`supabase/migrations`, monta as colunas de cada tabela depois de todos os
`create`/`add`/`drop`, e verifica contra o SQLite do aparelho e contra o vocabulário
de capacidades de `src/domain/access.ts:26-38`
(`src/sync/agreement.test.ts:9-80`). Ele "não prova comportamento; prova acordo, que
é onde cada um dos desencontros de hoje morava: uma coluna que existe só de um lado,
um enum escrito `storeroom` contra o `store_room` do servidor, um kind que o
aparelho escreve e o servidor nunca ouviu" (`:16-22`).

---

### 8.14 Lacunas, pontas soltas e o que NÃO está no código

1. **Nenhum cliente de servidor.** Não existe implementação de `Transport` contra
   Supabase/PostgREST. Tudo neste bloco é exercitado por `db:verify` e pelo parser de
   acordo, nunca por um aparelho falando com um servidor real
   (`src/sync/engine.ts:34-37`; busca por `supabase`/`createClient` em `src` e `app`
   devolve dois comentários).
2. **A configuração da empresa não viaja.** `names_who_recorded` (0012),
   `orders_need_approval` (0019), e também `floor_sign_in`/`join_code` (0011) não têm
   escritor nem leitor no aplicativo, porque `companies` não é tabela envidável
   (`src/sync/serialize.ts:61-77`). A preferência de aprovação existe **duas vezes**,
   uma de cada lado, sem ligação (8.8.11).
3. **`devices` é tabela vazia por construção.** Sem escritor em nenhum dos dois
   lados; `movements.device_id` e `readings.device_id` sempre chegam nulos.
   `responsible_id` e `location_id` nunca são preenchidos, então a promessa "o
   movimento aponta para o aparelho, o aparelho aponta para uma pessoa"
   (`supabase/migrations/0013_the_device_is_accountable.sql:8-10`) está **inteira no
   esquema e ausente no comportamento**.
4. **`operator_id` não tem tela.** A coluna existe nos dois bancos e atravessa a
   fila; nenhuma tela pergunta quem estava com o aparelho (8.3.3).
5. **`devices` sem `unique (id, company_id)`**, logo sem chave composta protegendo
   `movements.device_id` e `readings.device_id` contra apontar para outra empresa
   (8.2.6). O mesmo vale para `lots`, e nesse caso está escrito e é deliberado
   (`supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql:22-27`);
   para `devices`, NÃO ESTÁ NO CÓDIGO nota nenhuma.
6. **`movements_visible` não expõe as colunas novas** (8.12).
7. **`orders.status` não tem gatilho de transição.** O `check` aceita as quatro
   palavras e os gatilhos governam só *sair de `pending`* e *quem pode mexer em
   `status`/`decided_at`/`recorded_by`*. NÃO EXISTE NO CÓDIGO restrição que impeça
   `delivered → open` ou `cancelled → open`.
8. **`order_lines` não tem `unique (id, company_id)`**, então nenhuma tabela pode
   referenciá-la por chave composta; hoje nada referencia.
9. **Nada liga `orders` a `movements`.** A migração declara que o elo é a
   transferência (`supabase/migrations/0019_an_order_is_demand.sql:19-21`), e de fato
   não há coluna, tabela de junção ou reserva: `app/transfer.tsx` marca o pedido
   `delivered` (`:279`) e escreve a transferência, mas o movimento não guarda de que
   pedido veio. NÃO IMPLEMENTADO.
10. **Comentário desatualizado dentro de `recordProduction`.** O bloco em
    `src/data/repository.ts:1476-1483` ainda diz que "a embalagem é um valor digitado
    no produto… o estoque de palito só sobe. Ligar os dois é mudança de esquema…
    vem separada desta" — mudança que a 0022 e a soma em
    `src/data/repository.ts:1379-1382` já fizeram. O texto descreve o estado
    anterior à migração e sobreviveu a ela.
11. **`products` não ganhou `unique (id, company_id)`** nem chave composta ligando
    `products.item_id` a `items (id, company_id)`; a unique que existe é
    `unique (company_id, item_id)` da 0002
    (`supabase/migrations/0002_recipes.sql:168`).
12. **`nulls not distinct` fixa um piso de versão de Postgres** (15+) que o script de
    verificação não checa (`scripts/verify-migrations.sh:17`).
