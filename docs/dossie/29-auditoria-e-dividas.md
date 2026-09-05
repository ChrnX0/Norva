## 29. Auditoria, dívidas conhecidas e decisões pendentes do dono

### 29.1 A auditoria: quando, como e o que ela afirma sobre si mesma

O documento é `docs/auditoria.md`, datado **4 de setembro de 2026** (`docs/auditoria.md:1`).
A linha de abertura declara o escopo: *"Dez frentes, trinta achados. Escrito para o dono
ler, não para um engenheiro."* (`docs/auditoria.md:3`).

As dez frentes estão nomeadas não no documento, mas na descrição de PR #2 do repositório:
**segurança, livro-razão, dinheiro, sincronização, correção funcional, qualidade da suíte,
ergonomia de fábrica, idioma, desempenho e prontidão de loja** (corpo da PR
`https://github.com/ChrnX0/Norva/pull/2`). O desenho previa **dois verificadores adversariais
independentes por achado — sessenta agentes** (`docs/auditoria.md:245-251`).

**Contabilidade dos trinta achados — não fecha.** O documento enumera:

| grupo | quantidade enumerada | onde |
|---|---|---|
| consertados durante a própria rodada | **2** | `docs/auditoria.md:45-58` |
| severidade **alta**, numerados 1 a 11 | **11** | `docs/auditoria.md:165-228` |
| severidade **média** | **13 afirmados, 7 nomeados** | `docs/auditoria.md:222-227` |
| achado que a auditoria não fez, encontrado depois | 1 (`readings` sem política de update) | `docs/auditoria.md:104-110` |
| total enumerável | **26** (2 + 11 + 13) | — |

**Os outros quatro achados não estão no documento.** Não existe lista de severidade baixa,
nem apêndice com os trinta. **NÃO ESTÁ NO CÓDIGO** quais são os quatro que faltam para
fechar em trinta, nem quais são os seis médios não nomeados (13 afirmados menos 7
nomeados). Quem reconstruir o produto não tem como recuperá-los: eles existiram apenas na
saída dos dez auditores, que não foi guardada.

**Uma regra editorial explícita do documento:** *"Os números dos achados **não mudam** —
este documento é lido por quem o recebeu, e renumerar uma lista que alguém já leu é trocar
o assunto de baixo do dedo dele. O que foi fechado fica marcado aqui, com o que impede a
volta."* (`docs/auditoria.md:61-64`).

#### 29.1.1 O veredito, transcrito

*"**Uma fábrica pode começar a usar isto amanhã, com uma condição: uma fábrica só, e com o
estoque num lugar só.** O que quebra primeiro não é o cálculo — a aritmética do dinheiro e
do livro-razão está sólida e foi provada — é a **câmara fria**, que a Fase 2 entregou como
lugar e que metade do aplicativo ainda não enxerga: o alerta de validade emudece, a
produção fica impossível com um erro em inglês, e a contagem da prateleira compara com a
empresa inteira. **E duas coisas precisam de conserto antes de qualquer cliente real: o
livro-razão aceita item de outra empresa, e três dos sete tipos de lançamento não podem ser
corrigidos por estorno.**"* (`docs/auditoria.md:9-16`).

#### 29.1.2 O que a auditoria declarou sólido — onde não mexer

Seis pontos, transcritos de `docs/auditoria.md:24-37`:

| ponto | o que foi verificado |
|---|---|
| **O dinheiro** | separação `Cents` inteiro / `Rate` fracionário "genuinamente de pé": taxa congelada por movimento, arredondamento uma vez só, zero dinheiro em float |
| **O isolamento de leitura entre empresas** | exercitado tabela por tabela; uma empresa não lê a outra. A **escrita** tinha o buraco do achado 1 |
| **A costura celular ↔ servidor** | "a parte mais bem defendida do repositório" — `src/sync/agreement.test.ts` compara os dois esquemas nos dois sentidos; `npm run db:verify` reproduz a fila inteira contra Postgres real, sob RLS |
| **O dicionário** | os três idiomas têm exatamente as mesmas chaves; a compilação quebra se alguém escrever texto em um só |
| **O índice de saldo** | está certo, e as consultas de saldo o usam |
| **A grade do produto** | recusa o cadastro impossível; o pedido nasce onde a empresa mandou — os dois provados contra Postgres |

---

### 29.2 Os dois achados consertados durante a própria rodada de auditoria

**A. O portão de mutação estava verde por construção.** `npm run mutate` declarava toda
mutação "pega" sem nunca ter consultado a suíte — **desde 3 de setembro, 66 commits**. A
oficina que ele monta não copiava as pastas que os testes leem, então a suíte morria lá com
**19 falhas** antes de qualquer mutação, e "falhou" quer dizer "pegou". Consertado, expôs
**seis mutações que sobreviviam**: quatro buracos reais (entre eles a média móvel do produto
e o filtro de estorno em "produzido hoje"), que ganharam teste, e **dois equivalentes**, que
ganharam marcador com motivo (`docs/auditoria.md:45-51`; relato longo em
`docs/insights.md:2945`). Commit `f605622`.

**B. A capa não abriria com dois anos de fábrica.** A cláusula "o que foi estornado não
aconteceu" (`NAO_ESTORNADO`, em `src/data/repository.ts`) é subconsulta correlacionada: para
CADA linha candidata pergunta se existe um movimento que a estorna. Sem índice em
`reverses_movement_id` isso é varredura completa de `movements`, uma vez por linha. **Oito
consultas usam a cláusula e a capa dispara cinco de uma vez.**

Medição, contra SQLite real de 60 mil movimentos (cinco meses de fábrica de seis lojas),
janela de sete dias, 2.779 linhas candidatas (`src/data/db.ts:655-661`):

| cenário | tempo |
|---|---|
| com a cláusula, sem índice | **9.906 ms** |
| sem a cláusula | 3 ms |
| com a cláusula e o índice | **4 ms** |

Conserto nos dois lados, com o mesmo DDL: passo `V17` do aparelho
(`src/data/db.ts:670-674`) e migração `0028_the_index_under_what_was_reversed.sql`. Índice
**parcial** de propósito — só linhas de estorno entram:

```sql
create index if not exists movements_reversal_idx
  on movements (reverses_movement_id, company_id)
  where reverses_movement_id is not null;
```

O `concurrently` **não** é usado, e a razão está escrita: a migração roda em transação pelo
`supabase db push`, e `create index concurrently` é recusado dentro de uma
(`supabase/migrations/0028_the_index_under_what_was_reversed.sql:24-27`). Commit `236b1a4`.

---

### 29.3 Os onze achados de severidade ALTA — texto original, estado e conserto

Todos os onze estão **FECHADOS**. `docs/roadmap.md:200` afirma: *"Com isso a lista de
severidade ALTA da auditoria está vazia."* A verificação abaixo confirma cada um contra o
código, com uma exceção de registro documental apontada no item 7.

| nº | título do achado | severidade e custo estimado | estado | onde foi fechado |
|---|---|---|---|---|
| 1 | O livro-razão aceita item e local de outra empresa | alta — uma migração | **fechado** | `supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql`; guarda: checagem 10 do `db:verify` |
| 2 | Compra, perda e contagem não podem ser corrigidas | alta — um commit | **fechado** | `movement_group_id` nos três atos + cartão "Últimos lançamentos" na tela do insumo (commit `256d27f`) |
| 3 | Estornar uma corrida deixa o custo médio errado para sempre | alta | **fechado** | `recomputeItemCost` (commit `8528364`); guarda: duas mutações curadas |
| 4 | A câmara fria é meio invisível | alta — três telas | **fechado** | commits `b1ea4db` e `c68798d`; guarda de fonte contra tela que prenda o aviso a uma sala |
| 5 | Com insumo na câmara, a produção fica impossível | alta | **fechado** (com pergunta de dono aberta) | commit `a08ee0e`; resta a decisão "A sala do tacho" (§29.13.1) |
| 6 | A contagem promete um número e grava outro | alta | **fechado** | commit `b62bc57`; guarda de fonte + três mutações curadas |
| 7 | Quarta aparição da fila travada | alta — uma migração | **fechado, e nunca riscado em documento nenhum** | `supabase/migrations/0030_the_default_room_is_bookkeeping_not_a_privilege.sql` (commit `6266733`); guarda: checagem 11 do `db:verify` |
| 8 | Apagar uma área menor trava a fila para sempre | alta | **fechado, com a severidade corrigida** | `forgetOrphans` em `src/data/outbox.ts:193` (commit `f5277fc`) |
| 9 | O livro-razão sai do celular pelo backup do Android | alta | **fechado** | `"allowBackup": false` em `app.json`; guarda em `src/release.test.ts:19-33` + conferência do manifesto gerado em `.github/workflows/build-apk.yml:111-115` |
| 10 | O texto pequeno reprova contraste | alta | **fechado, com o número corrigido** | `src/theme/tokens.ts`; guarda em `src/theme/contrast.test.ts` |
| 11 | Não há caminho para os outros dois idiomas nem para outra moeda | alta | **fechado** | cartão de idioma e moeda nos Ajustes (commit `24eea42`) |

#### 29.3.1 Achado 1 — item e local de outra empresa

Texto original: *"`movements.item_id` e `location_id` são chaves simples. A permissão confere
que a pessoa pode gravar **naquela empresa**, e ninguém confere que o item é **daquela
empresa**. A tabela `orders` já faz certo, na mesma base: `(place_id, company_id)` apontando
para `(id, company_id)`. Basta `movements` fazer igual."* (`docs/auditoria.md:167-172`).

O cenário de exploração, escrito na migração: *"Um operador cuja única associação é a
empresa A conseguia inserir no razão de A um movimento apontando para o item e o
almoxarifado da empresa B. A linha entra, o saldo de A passa a falar de um item que não é de
A, e o livro-razão é append-only: a linha não sai nunca mais. E não é preciso adivinhar id
nenhum. `ensureLocation` cria o lugar padrão com `id = company_id`, então o id do
almoxarifado de B **é** o id de B — e o id de uma empresa é legível para quem esteve nela."*
(`supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql:7-16`).

Três chaves compostas foram adicionadas:

```sql
alter table movements add constraint movement_item_same_company
  foreign key (item_id, company_id) references items (id, company_id) on delete restrict;
alter table movements add constraint movement_location_same_company
  foreign key (location_id, company_id) references locations (id, company_id) on delete restrict;
alter table movements add constraint movement_counterpart_same_company
  foreign key (counterpart_location_id, company_id) references locations (id, company_id) …
```

A contraparte é anulável e a chave composta respeita isso: **em Postgres, chave estrangeira
multicoluna com qualquer coluna nula não é verificada (MATCH SIMPLE, o padrão)**
(`supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql:40-43`).

**A dívida que este conserto deixou escrita, e ela segue aberta:** *"`lots` fica de fora
desta migração de propósito: ele não tem `unique (id, company_id)`, então a chave composta
pediria um índice novo. O risco lá é menor — o lote não entra em nenhuma soma de saldo, ele é
identidade — e misturar as duas coisas numa migração faria a parte cara atrasar a barata.
Fica escrito aqui para não ser redescoberto: **`movements.lot_id` ainda é chave simples**."*
(`supabase/migrations/0029_a_movement_cannot_point_at_another_company.sql:22-27`).

Verificado: `movements.lot_id uuid references lots(id) on delete restrict`
(`supabase/migrations/0001_foundation.sql:200`), e nenhuma migração adiciona
`unique (id, company_id)` a `lots` — as únicas tabelas com essa chave são `items` e
`locations` (`supabase/migrations/0019_an_order_is_demand.sql:36-37`), `orders`
(`:71`), `product_lines` e `product_types` (`supabase/migrations/0018_a_product_has_a_family.sql:40,75`).

#### 29.3.2 Achado 2 — compra, perda e contagem sem estorno

Texto original: *"A primeira fundação do projeto diz que se corrige por estorno, nunca por
exclusão. O estorno acha o lançamento pelo grupo — e três dos sete caminhos de escrita não
gravam grupo nenhum. Na prática: **a nota de açúcar digitada com dez sacos onde era um não
tem como ser desfeita.** A contagem conserta a quantidade e não conserta o dinheiro; a média
móvel já foi misturada."* (`docs/auditoria.md:173-179`).

Fechado com uma nota de método que vale por si: *"a compra pela NOTA, não pela linha"*, e
*"Dar grupo sem porta não seria conserto — o portão P1 do projeto pede o chamador no mesmo
commit"* (`docs/auditoria.md:133-138`).

#### 29.3.3 Achado 5 — a produção impossível com insumo na câmara

Três defeitos num só achado (`docs/auditoria.md:78-85`): a tela lia o piso do almoxarifado
em vez da sala em que o tacho roda; o erro do livro-razão chegava ao usuário como
`Not enough stock:` **cru, em inglês**; e a tela era parede em vez de instrução.

Conserto: a tela passou a ler o piso da sala do tacho — `salaDoTacho = defaultLocationId(LOCAL_COMPANY_ID)`
(`app/production/new.tsx:213`) — e a listar onde mais o insumo está, sala por sala, filtrando
por `INTERNAL_PLACE_KINDS` (`app/production/new.tsx:214-218`).

**O que ficou, e é decisão de dono:** *"registrar o trajeto câmara → almoxarifado não existe,
e isso é decisão de dono sobre a F2"* (`docs/auditoria.md:84-85`). Ver §29.13.1.

#### 29.3.4 Achado 7 — o único fechado sem sair de lista nenhuma

`docs/auditoria.md:201-204`: *"O lugar padrão que o aplicativo enfileira é recusado para seis
dos sete papéis — inclusive o `operator`, que é o papel do celular emprestado. A fila trava
atrás dele."*

Foi fechado pela migração `0030`, cujo próprio cabeçalho diz *"Quarta aparição da fila
travada, e a forma é nova outra vez"*
(`supabase/migrations/0030_the_default_room_is_bookkeeping_not_a_privilege.sql:1`). Mas:

- a lista "Consertado depois que isto foi escrito" de `docs/auditoria.md:60-164` **não traz o
  item 7** (traz 1, 3, 4, 5, ícone, percentual, `recorded_by`, `readings`, 11, 10, 2, 9,
  `versionCode`, 8, 6);
- a lista de fechados de `docs/roadmap.md:184-198` **também não** (traz 1, 3, 6, 4, 5, 8, 9,
  `versionCode`, 2, 10, 11).

`docs/roadmap.md:200` conclui que a lista alta está vazia, o que é verdade, mas por onze
itens dos quais só dez estão riscados. É a **terceira** violação da regra 1 do plano — *"item
fechado sai daqui no mesmo commit que o fecha"* (`docs/roadmap.md:405-407`) — depois da
registrada em `docs/roadmap.md:99-103`.

O conserto de 0030 é estreito por desenho e **não é permissão nova**: a política nova só
aceita a linha cujo `id = company_id`, que é *"o único id que a empresa pode ter, e
`ensureLocation` é a única coisa que o escreve"*
(`supabase/migrations/0030_the_default_room_is_bookkeeping_not_a_privilege.sql:23-26`). As
cinco capacidades que a destravam:

```sql
create policy locations_default_room on locations for insert with check (
  id = company_id and (
       private.has_capability(company_id, 'record_production')
    or private.has_capability(company_id, 'adjust_stock')
    or private.has_capability(company_id, 'record_loss')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'check_receipt')));
```

#### 29.3.5 Achado 8 — a severidade que caiu na verificação

Texto original afirmava "trava a fila **para sempre**" (`docs/auditoria.md:205-208`). A
correção escrita na própria auditoria: *"ela disse 'trava a fila para sempre', e hoje isso é
futuro, não presente — `serialize` não tem chamador de produção, porque o transporte é
injetado e nenhum existe ainda. O que existe hoje é a fila crescendo com entradas que nunca
poderão subir, e a mina armada para o dia do transporte."* (`docs/auditoria.md:153-156`).

A regra que saiu disso: **"severidade se confere no chamador, não no arquivo do defeito"**
(`docs/insights.md:3215`).

---

### 29.4 Os treze achados médios — quais são nomeados, quais caíram, quais seguem abertos

O parágrafo inteiro, transcrito (`docs/auditoria.md:222-227`):

*"**E treze achados médios**, entre eles: `recorded_by` cedível no pedido, a embalagem abaixo
de meio centavo virando de graça, a aprovação de pedido que nunca atravessa, o percentual com
ponto em vez de vírgula, o ícone de "Produção" ser um picolé num aplicativo que promete servir
qualquer fábrica, a tela de abertura ainda ser o andaime da Expo, e o `versionCode` que para de
crescer em 1.0.0."*

`docs/roadmap.md:213-217` acrescenta um oitavo nome e conta o saldo: *"**Os médios que
sobraram** — nove, agora que o `versionCode`, o `recorded_by` cedível, o percentual com ponto e
o ícone de picolé caíram. Entre eles: a embalagem abaixo de meio centavo virando de graça, a
aprovação de pedido que nunca atravessa, a tela de abertura ainda ser o andaime da Expo, e
`forgetSentBefore` sem chamador fora de teste."*

| médio | estado | evidência |
|---|---|---|
| `recorded_by` cedível no pedido | **fechado** | gatilho `orders_decision_fields_stay_put` reescrito em `supabase/migrations/0032_who_ordered_it_never_changes.sql`; guarda: checagem 13 do `db:verify` (`scripts/verify-migrations.sh:849`) |
| o percentual com ponto em vez de vírgula | **fechado** | `formatPercent` (`src/i18n/index.ts:217`) + guarda de fonte `porCentoNaMao` (`src/layers.test.ts:489-499`) |
| o ícone de "Produção" ser um picolé | **fechado** | `GlyphProduction` (`src/components/Glyph.tsx:101`) — "a SAÍDA, a única coisa que toda fábrica deste produto tem em comum, seja picolé, queijo, tinta ou cosmético" (`src/components/Glyph.tsx:96-99`) |
| o `versionCode` que para de crescer em 1.0.0 | **fechado** | fórmula `a·1.000.000 + b·10.000 + c·100` em `.github/workflows/build-apk.yml:191-195`; guarda em `src/release.test.ts:35-55` |
| **a embalagem abaixo de meio centavo virando de graça** | **ABERTO** | §29.5 |
| **a aprovação de pedido que nunca atravessa** | **ABERTO** | §29.6.1 |
| **a tela de abertura ainda ser o andaime da Expo** | **ABERTO** | §29.7.1 |
| **`forgetSentBefore` sem chamador fora de teste** | **ABERTO** | §29.6.4 |
| os outros cinco | **NÃO ESTÁ NO CÓDIGO** | nenhum documento os nomeia |

---

### 29.5 Dívida aberta: `unit_packaging_cents` deveria ser `Rate`

**O que é.** A embalagem por unidade produzida existe em **duas metades**, e só uma respeita
a fundação `Cents`/`Rate`.

| metade | tipo | como entra | arredonda? |
|---|---|---|---|
| `products.packaging_items` — palito e saquinho que SAEM do estoque, cotados pelas notas | `Rate` (fracionário) via `packagingRatePerUnit` | lista `{itemId, quantityPerUnit}` gravada em coluna JSON | **não** |
| `products.unit_packaging_cents` — o que ninguém quis transformar em item (rótulo, fita) | `Cents` (inteiro) | campo digitado na tela | **sim, na entrada** |

Nomes e tipos exatos:

| lado | declaração |
|---|---|
| aparelho (SQLite) | `unit_packaging_cents INTEGER NOT NULL DEFAULT 0` (`src/data/db.ts:104`) |
| servidor (Postgres) | `unit_packaging_cents bigint not null default 0` (`supabase/migrations/0002_recipes.sql:166`) |
| domínio | `unitPackagingCents: Cents` (`src/data/repository.ts:1790`) |
| serializador | coluna `'unit_packaging_cents'` na lista `take` de `products` (`src/sync/serialize.ts:242`) |

**Onde está o defeito, exatamente.** A tela de cadastro de produto converte o texto digitado
com `fromDecimal`, e `fromDecimal` é `Math.round(value * 100)`
(`src/domain/money.ts:11-13`). Duas chamadas, na prévia e na gravação:

- `const packagingCents = fromDecimal(num(packagingCost) || 0);` (`app/products/new.tsx:225`)
- `unitPackagingCents: fromDecimal(num(packagingCost) || 0),` (`app/products/new.tsx:339`)

O campo nasce com `'0,05'` (`app/products/new.tsx:152`), lido por
`num = (s) => parseTyped(s) ?? NaN` (`app/products/new.tsx:168`). Digitar `0,004` →
`Math.round(0.4)` → **0**. A embalagem fica de graça, em silêncio, e o número entra em tudo:

- na prévia do custo unitário, via `costPerProductUnit(cost, portion, { cents: packagingCents, itemsRate })` (`app/products/new.tsx:232`);
- no custo **congelado** de cada corrida: `const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingCents) as Rate;` (`src/data/repository.ts:1481`);
- na conta da tela de produção: `return { lines, unitCostRate: value / units + packaging, short };` (`app/production/new.tsx:243-245`).

**A ironia documentada.** A metade que funciona traz o aviso escrito contra a metade que não
funciona: *"Nunca arredonda: um palito a R$ 0,012 arredondado para inteiro é um palito de
graça ou um palito pela metade, e a corrida de quinhentas unidades erra por R$ 6 — o mesmo
defeito que a polpa a R$ 12,40/kg já custou aqui. Quem arredonda é `costPerProductUnit`, uma
vez, no fim."* (`src/domain/recipe.ts:202-208`, docblock de `packagingRatePerUnit`).

**O que quebra se ficar assim.** Rótulo, fita e etiqueta térmica custam frações de centavo
por unidade. Numa corrida de 500 unidades, R$ 0,004/unidade são R$ 2,00 que desaparecem do
custo congelado — e custo congelado não se recalcula: é o número que a margem, o preço
sugerido e o "quanto rendeu este tacho" usam para sempre. O erro é sempre **para baixo**
(margem otimista), porque zero é o único destino de qualquer valor abaixo de meio centavo.

**Quanto custa consertar.** `docs/dossie/34-recomecar.md:120-124` diz o que já foi medido:
*"Consertar depois custa migração no servidor **e** passo novo no aparelho — é exatamente o
tipo de erro que o portão P3 existe para pegar (forma de esquema se adivinha de graça
enquanto há zero linhas; conteúdo de livro-razão não se corrige, se estorna)."* Concretamente:
mudar `INTEGER`/`bigint` para `REAL`/`numeric`, um passo `V18` em `src/data/db.ts`, uma
migração nova em `supabase/migrations/`, o tipo `Cents` → `Rate` em `src/data/repository.ts:1790`
e `:1855`, e as três somas acima. **Recomeçando do zero custa uma palavra na primeira
migração.**

---

### 29.6 Dívidas abertas na sincronização

#### 29.6.1 A aprovação de pedido que nunca atravessa

**O que é.** "Pedido precisa de aprovação" é configuração da empresa por decisão escrita
(*"APROVAÇÃO É CONFIGURAÇÃO DA EMPRESA, NÃO ESCOLHA NOSSA"*,
`supabase/migrations/0019_an_order_is_demand.sql:23-27`). Ela existe **duas vezes, em dois
lugares que não se falam**:

| lado | onde mora | padrão |
|---|---|---|
| aparelho | chave `orders.needApproval` na tabela `app_meta` (`src/data/repository.ts:3968`), lida por `ordersNeedApproval()` (`:3978-3980`), escrita por `setOrdersNeedApproval()` (`:3982-3984`) | desligado (`readMeta` diferente de `'1'`) |
| servidor | coluna `companies.orders_need_approval boolean not null default false` (`supabase/migrations/0019_an_order_is_demand.sql:39-40`) | `false` |

**Implementado e chamado por tela:** o interruptor está em `app/settings.tsx:1029-1031`
(`await setOrdersNeedApproval(!approval)`), com o texto *"Pedido precisa de aprovação"* /
*"Ligado, todo pedido novo aparece como 'espera aprovação' até alguém aprovar. Ele já entra
na conta do que falta produzir: quem espera a aprovação para começar descobre tarde."*
(`src/i18n/locales/pt-BR.ts:499-504`). A tela de pedidos mostra o chip âmbar e o botão
"Aprovar" (`app/orders/index.tsx:126,162,185-189`), e `setOrderStatus` grava e enfileira
(`src/data/repository.ts:4093-4106`).

**Por que não atravessa.** Três fatos que se somam:

1. `app_meta` **não está** em `QUEUED_TABLES` (`src/data/outbox.ts:154-171`) — nada dela é
   enfileirado;
2. `companies` **não está** em `ServerTable` (`src/sync/serialize.ts:61-77`) — o aparelho não
   sabe mandar essa tabela, e mandar uma tabela desconhecida é exceção, não pulo
   (`src/sync/serialize.ts:396`);
3. o servidor **sobrescreve** o status que veio do aparelho, num gatilho `before insert`:

```sql
create or replace function private.order_starts_where_the_company_says() … as $$
begin
  if new.status <> 'cancelled' then
    select case when c.orders_need_approval then 'pending' else 'open' end
      into new.status from companies c where c.id = new.company_id;
  end if;
  return new;
end; $$;
```
(`supabase/migrations/0019_an_order_is_demand.sql:103-122`). A razão escrita é boa e não é o
defeito: *"Uma empresa que exige aprovação e um cliente que manda o pedido pelo próprio
aparelho é exatamente o caso em que a regra não pode morar no aplicativo: o payload vem de
fora, e 'status' é um campo como outro qualquer no JSON."* (`:99-102`).

**O que quebra.** A fábrica que liga aprovação nos Ajustes vê a cerimônia inteira
funcionando no celular — pedido nasce `pending`, chip âmbar, botão "Aprovar" — e **todo
pedido chega ao servidor como `open`**, porque `companies.orders_need_approval` continua
`false` e ninguém tem como mudá-la. O contrário também: uma empresa cuja coluna esteja `true`
(por qualquer caminho administrativo) tem pedidos `pending` no servidor e `open` no aparelho,
e o aparelho não tem tela que explique a divergência. A aprovação é hoje **teatro local**.

O reenvio dessa mesma linha não trava mais a fila (`supabase/migrations/0027`), mas também não
resolve: o gatilho `a_resend_decides_nothing` devolve `status` e `decided_at` ao valor antigo
para quem não tem `approve_order`, `dispatch` ou `manage_company`
(`supabase/migrations/0027_a_resend_is_not_a_decision.sql:65-82`, reescrito em
`supabase/migrations/0032_who_ordered_it_never_changes.sql:29-45`).

**Quanto custa consertar.** Uma migração de aparelho que traga a configuração da empresa para
uma tabela sincronizável (ou uma entrada em `CROSSINGS` para `companies`), mais uma checagem
no `db:verify` que suba a fila com aprovação ligada e confira o `pending` do outro lado. É
trabalho de esquema (portão P3), e hoje há zero pedidos em produção — hora barata.

#### 29.6.2 Nada no aplicativo fala com o servidor: `Transport` não tem implementação

Esta não está listada em auditoria nem roadmap, e é a maior dívida estrutural do
repositório. Medida:

| peça | estado |
|---|---|
| `export type Transport = { push(entries): Promise<PushResult> }` (`src/sync/engine.ts:35-37`) | **interface, sem implementação de produção** |
| `export async function drain(transport, options)` (`src/sync/engine.ts:75`) | **sem chamador** — as sete ocorrências estão em `src/sync/sync.test.ts` |
| `export function serialize(entry, row, actor)` (`src/sync/serialize.ts:381`) | **sem chamador de produção** — 27 em teste, 1 em `scripts/device-session.ts:269` |
| `pendingCount()` (`src/data/outbox.ts:111`) e `pendingEntries()` (`:72`) | chamados **só** por `src/sync/engine.ts:89,123` |
| cliente Supabase, autenticação, HTTP | **NÃO IMPLEMENTADO** — nenhuma ocorrência de `createClient` em `src/` ou `app/` |

Consequências verificáveis hoje:

- as 32 migrações do servidor, as políticas RLS, os gatilhos de imutabilidade e as 13
  garantias do `db:verify` protegem um servidor que **nenhum aparelho alcança**;
- a fila (`outbox`) cresce e nunca esvazia, e **nenhuma tela mostra o tamanho dela**:
  `pendingCount` não é chamado por `app/settings.tsx` nem por tela alguma. A frase de
  `docs/insights.md:3209-3210` — *"a tela de Ajustes contando essas entradas como 'esperando'"*
  — **está errada hoje**; não existe essa contagem na tela;
- `recorded_by` de `movements` é carimbado no serializador (`build: (_row, actor) => ({ recorded_by: actor.userId })`,
  `src/sync/serialize.ts:366`) por um ator que nunca existe.

Custo: é a próxima grande frente. Recomeçando, a ordem escrita em
`docs/dossie/34-recomecar.md` põe "fila de saída e sincronia" no passo 5, com o servidor
aceitando o mesmo registro duas vezes desde o começo.

#### 29.6.3 `serialize` emite `erase`, e o servidor não tem o outro lado

`ServerWrite` tem três formas: `upsert`, `erase` (*"Not a row: a command saying an area was
cleared on the device"*, `src/sync/serialize.ts:42`) e `derived`
(`src/sync/serialize.ts:40-59`). O comando `erase` sobrevive à limpeza local
(`src/data/repository.ts:3500`) e é emitido pelo serializador
(`src/sync/serialize.ts:392-395`), **e nenhuma migração o recebe**: `grep erase
supabase/migrations/*.sql` volta vazio.

O que isso significa hoje, escrito por quem construiu (`docs/insights.md:566-572`): *"o
servidor não o recebe — então hoje um sync futuro traria de volta o que a pessoa mandou
destruir. Construir isso exige decidir o que 'apagar' significa num servidor multiempresa:
destruir o histórico daquela empresa, ou só marcar que aquele aparelho não quer mais o dado.
A primeira é irreversível e o livro-razão recusa DELETE por desenho. **Não construo sem você
escolher.**"* → decisão de dono, §29.13.2.

As cinco áreas apagáveis: `EraseArea = 'purchases' | 'recipes' | 'products' | 'inputs' | 'all'`
(`src/data/erase.ts:20`).

#### 29.6.4 `forgetSentBefore` sem chamador

```ts
export async function forgetSentBefore(iso: string): Promise<void> {
  const conn = await db();
  await conn.runAsync(`DELETE FROM outbox WHERE sent_at IS NOT NULL AND sent_at < ?`, [iso]);
}
```
(`src/data/outbox.ts:139-142`)

Docblock: *"Drops entries that went up a while ago. They are worth keeping for a few days so
a person can be told what has and has not synced, and worth dropping after that so a busy
factory's phone does not carry a year of them."* (`src/data/outbox.ts:133-137`).

**Estado: implementado, sem chamador de produção.** As três ocorrências estão em
`src/data/repository.test.ts:69,744,774`. Listado como médio da auditoria
(`docs/roadmap.md:216`) e como o quarto P1 de 4 de setembro
(`docs/insights.md:3221-3223`).

**O que quebra.** Nada hoje, porque nada é marcado como enviado — sem transporte, `sent_at` é
sempre nulo. No dia em que o transporte existir, a `outbox` passa a acumular uma linha
permanente por escrita aceita, para sempre, no celular da fábrica. O docblock promete a
faxina; a faxina não roda. **Custo:** uma chamada, e a decisão de quantos dias guardar — a
prosa diz "a few days" e não fixa número, então **NÃO ESTÁ NO CÓDIGO** qual é a janela.

#### 29.6.5 `item_costs` / `item_cost_history`: ramo no serializador que nada alcança

`serialize` tem um ramo dedicado:

```ts
if (entry.table === 'item_costs' || entry.table === 'item_cost_history') {
  return { kind: 'derived', table: entry.table };
}
```
(`src/sync/serialize.ts:386-388`)

E nenhum `enqueue` do repositório produz essas tabelas — elas não estão em `QUEUED_TABLES`
(`src/data/outbox.ts:154-171`). Isso está registrado como **fronteira deliberada**, não
esquecimento: *"`item_costs` is not queued, and that omission is the design. The average is
derived, and a derived number gets one author."* (`src/data/repository.ts:445-448`), com o
número que provou o custo de duplicar autoria: *"replaying the queue put the server at 0.5605
where the phone said 0.5310, because the queue carries row ids and resends whatever the row
says now."* (`src/data/repository.ts:450-453`).

Contado como o terceiro P1 do dia em `docs/insights.md:3222-3223`. **Estado: implementado sem
chamador, com razão escrita — fronteira, não dívida.** O ramo existe para que enfileirar por
engano seja um `derived` silencioso em vez de um `UnknownTableError`.

#### 29.6.6 O servidor tem quatro tabelas que o aparelho não conhece

Medido, comparando `grep '^create table' supabase/migrations/*.sql` com
`grep 'CREATE TABLE IF NOT EXISTS' src/data/db.ts`:

| só no servidor | onde nasce | tem escritor no aplicativo? |
|---|---|---|
| `companies` | `supabase/migrations/0001_foundation.sql` | **não** |
| `memberships` | `supabase/migrations/0001_foundation.sql` | **não** |
| `devices` | `supabase/migrations/0013_the_device_is_accountable.sql:18` | **não** |
| `suppliers` | `supabase/migrations/0002_recipes.sql` | **não** |

| só no aparelho | por quê |
|---|---|
| `app_meta` | *"Small facts about this installation that are not business data"* (`src/data/db.ts:128-135`) |
| `outbox` | a fila (`src/data/db.ts:146`) |
| `production_runs` | **fronteira registrada**: *"corrida aberta é ESTADO do aparelho, não lançamento — o servidor não tem onde guardá-la e não deve ter"* (`src/sync/serialize.test.ts:131-135`; razão longa em `src/data/db.ts:373-392`) |

As colunas de identidade que o servidor ganhou e o aparelho não tem:

| coluna | migração | estado no aparelho |
|---|---|---|
| `memberships.state membership_state not null default 'active'` (enum `'pending','active','revoked'`) | `0011:11-14` | ausente |
| `companies.join_code text unique` | `0011:55` | ausente |
| `companies.floor_sign_in floor_sign_in not null default 'personal'` (enum `'personal','shared'`) | `0011:65-68` | ausente |
| `companies.names_who_recorded boolean not null default false` | `0012:20-21` | ausente |
| `movements.device_id uuid references devices(id) on delete restrict` | `0013:63-64` | **ausente na tabela, presente na lista `take` do serializador** (`src/sync/serialize.ts:341`) → atravessa sempre nulo, de propósito: *"Nulo até o aparelho saber qual aparelho ele é… Quando a identidade chegar, o valor entra; o lugar onde ele entra já está escrito"* (`src/sync/serialize.ts:335-341`) |
| `movements.operator_id uuid references memberships(id) on delete restrict` | `0014:20-21` | presente como `operator_id TEXT` (`src/data/db.ts:322`, passo `V5`) |

A dívida está declarada: *"O servidor está três migrações à frente do aparelho… É dívida
consciente, não esquecimento — ela se paga quando a identidade chegar ao aparelho"*
(`docs/insights.md:544-552`). **Correção ao texto: são quatro tabelas e cinco colunas, não
três migrações** — 0011, 0012, 0013 e 0014 são quatro, e `suppliers` vem de 0002.

E o guarda de acordo **não vê essa divergência**, por construção: *"ele compara o que o
aparelho manda, e o aparelho não manda nenhuma dessas tabelas"* (`docs/insights.md:548-550`).

---

### 29.7 Dívidas abertas de entrega, marca e credenciais

#### 29.7.1 A tela de abertura ainda é o andaime da Expo

**O que é.** `assets/splash-icon.png` **existe e é a marca**: 1024×1024, gerado a partir do
`markPath` do `src/config/brand.ts:25` por `scripts/icons.mjs:154`
(`{ arquivo: 'assets/splash-icon.png', lado: 1024, fracao: 0.50, fundo: null }`). Verificado
por decodificação do PNG: o disco com a cunha, em grafite, sobre transparente.

**E nada aponta para ele.** `app.json` **não tem chave `splash`** e **não declara o plugin
`expo-splash-screen`** — a lista de plugins é `["expo-router", "expo-localization",
"expo-sqlite", "expo-notifications"]` (`app.json`). Resultado no projeto nativo gerado por
`npx expo prebuild` (`.github/workflows/build-apk.yml:101`), medido no `android/` desta
árvore (que é gitignorado, `.gitignore:41`):

| arquivo gerado | conteúdo medido |
|---|---|
| `android/app/src/main/res/values/colors.xml` | `<color name="splashscreen_background">#FFFFFF</color>` — branco, **não** o `#FAF7F2` da marca; e `<color name="colorPrimary">#023c69</color>`, o azul do andaime |
| `android/app/src/main/res/values/styles.xml` | `Theme.App.SplashScreen` → `android:windowBackground = @drawable/splashscreen_logo` |
| `android/app/src/main/res/drawable-mdpi/splashscreen_logo.png` | 288×288, **fundo branco opaco com um borrão cinza-claro (205,205,208) no centro** — decodificado pixel a pixel; não é a marca em grafite |

**O que quebra.** É a primeira coisa que qualquer pessoa vê ao abrir o aplicativo, e ela
mostra o placeholder do template do Expo sobre branco, enquanto as outras cinco superfícies
(ícone do lançador, primeiro plano adaptativo, fundo adaptativo, monocromático, favicon) saem
todas do `markPath`. O `src/config/brand.ts:20-23` promete o contrário com todas as letras:
*"Rendered from this path on a 100x100 viewBox so every surface — **splash**, icon, header,
print — draws the exact same geometry."*

`docs/roadmap.md:324-325` afirma, na lista da F6: *"**Ícone, splash e nome.** Feito em 4 de
setembro: as seis superfícies saem do mesmo `markPath` do `brand.ts`, por
`scripts/icons.mjs`."* **Isso está errado para o splash**: o arquivo é gerado, o `app.json`
não o consome. `docs/dossie/34-recomecar.md:139-140` está certo: *"Ficou o splash do scaffold
do Expo. É pequeno e é a primeira coisa que o dono vê."*

**Quanto custa consertar.** Uma entrada de plugin no `app.json` apontando para
`./assets/splash-icon.png` com `backgroundColor: "#FAF7F2"`, e um `grep` no
`build-apk.yml` sobre o `colors.xml` gerado — do mesmo tipo que já confere `allowBackup`
(`.github/workflows/build-apk.yml:111-115`). Minutos, e nenhuma migração.

#### 29.7.2 O `EXPO_TOKEN` vazado, que o dono precisa revogar

**O que é.** Um token de acesso pessoal da Expo vazou. A pendência está aberta **desde 3 de
setembro** (`docs/insights.md:2712-2713`) e figura na seção "Em aberto, e é decisão sua" da
descrição de PR #2: *"O `EXPO_TOKEN` vazado precisa ser revogado em expo.dev → Access
Tokens."*

**Onde ele estava.** No workflow `.github/workflows/release-apk.yml`, que baixava um artefato
pronto da Expo e o anexava a um release do GitHub. O workflow e o arquivo de pedido
`.github/apk-release.txt` foram **apagados** no commit `380658f` (4 de setembro), por serem
"código armado" e não código morto: `.github/apk-release.txt` apontava para um artefato
compilado de `5703790` — **177 commits atrás** — e disparar "Publicar o APK" naquela branch
anexava **um APK de 110 MiB de 177 commits atrás dentro do release `apk-0.8.0`**, ao lado do
bom, sob uma nota dizendo "Compilado de `c32f96f`". Pior que dois arquivos sob a mesma tag:
as duas assinaturas são chaves diferentes, então quem baixasse o maior não instalaria por
cima e **perderia os dados ao desinstalar** (`docs/insights.md:2686-2700`).

**Por que revogar passou a custar zero.** Verificado nesta árvore: não existe nenhuma
ocorrência de `EXPO_TOKEN`, `eas build` ou `expo.dev/artifacts` nos workflows do GitHub. Os
dois que restam são `.github/workflows/build-apk.yml` (que usa apenas `npx expo prebuild
--platform android --no-install` e gradle, com `GH_TOKEN: ${{ github.token }}`) e
`.github/workflows/ci.yml`. *"Revogar o token passou a custar zero, e isso muda o recado ao
dono: não é um chore, é uma ação de graça."* (`docs/insights.md:2716-2717`).

**A ressalva que a auditoria não escreveu, e ela importa.** O repositório **continua
dependendo do projeto Expo**, por outro caminho:

| peça | evidência |
|---|---|
| `.eas/workflows/publish-update.yml` | EAS Workflow do tipo `update`, gatilho `push` em `main` nos caminhos `app/**`, `src/**`, `assets/**`, `package.json`, `app.json`; publica no canal `preview` para Android |
| `app.json` → `updates.url` | `https://u.expo.dev/384e9ec9-b731-4691-a622-d1edc89259a1` |
| `app.json` → `extra.eas.projectId` | `384e9ec9-b731-4691-a622-d1edc89259a1` |
| `app.json` → `runtimeVersion.policy` | `fingerprint` |
| `app.json` → `owner` | `chrnx0` |
| `eas.json` | três perfis de build (`development`, `preview`, `production`) com `appVersionSource: "remote"` |
| `expo-updates` em `package.json:33` | `~57.0.19` — **dependência sem uma linha de código que a chame**: nenhuma ocorrência de `expo-updates` ou `Updates.` em `src/` ou `app/`. Ela age pela configuração, no arranque nativo |

Ou seja: revogar um *token pessoal* não quebra os workflows do GitHub, mas o binário
instalado no celular **continua consultando a Expo a cada abertura** pelo canal declarado, e
o EAS Workflow continua publicando OTA a cada push no `main`. Quem reconstruir precisa decidir
isso de propósito, não por herança.

#### 29.7.3 As vulnerabilidades que a auditoria não conseguiu ler — agora lidas

`docs/auditoria.md:257-258` declarou o limite: *"As duas vulnerabilidades moderadas que o
GitHub aponta não puderam ser lidas: o `npm audit` não alcança o registro deste ambiente."*

**Isso mudou.** `npm audit` roda nesta árvore e devolve **13 vulnerabilidades de severidade
moderada**, todas transitivas, com **duas raízes** — que são exatamente as "duas" do GitHub:

| aviso raiz | faixa vulnerável | como chega | conserto oferecido |
|---|---|---|---|
| `decode-uri-component` — DoS por decodificação exponencial de percent-encoding malformado (GHSA-vcc3-ghjq-m6fr) | `<=0.4.2` | `decode-uri-component` → `query-string` → `expo-router` | `npm audit fix --force` instalaria `expo-router@5.1.11` — **quebra** (o projeto usa `~57.0.17`) |
| `uuid` — falta de checagem de limites de buffer em v3/v5/v6 quando `buf` é fornecido (GHSA-w5hq-g745-h8pq) | `<11.1.1` | `uuid` → `xcode` → `@expo/config-plugins` → `@expo/cli` → `expo` | `npm audit fix --force` instalaria `expo@46.0.21` — **quebra maior** (o projeto usa `~57.0.18`) |

Os onze pacotes restantes são efeitos: `@expo/config`, `@expo/config-plugins`, `@expo/cli`,
`@expo/inline-modules`, `@expo/metro-config`, `@expo/prebuild-config`,
`@expo/local-build-cache-provider`, `xcode`, `query-string`, `expo`, `expo-router`.

**O que quebra se ficar assim.** Nada em produção pelo caminho do `uuid`: `xcode` só é usado
por `expo prebuild` para gerar projeto iOS, em máquina de build. O `decode-uri-component`
chega pelo `expo-router`, que roda no aplicativo — o vetor exige uma URL malformada entrando
no roteador, que num app sem deep link recebido de terceiros é remoto mas não impossível
(`scheme: "norva"` está declarado no `app.json`). **Custo de consertar: não há caminho sem
esperar a Expo publicar versões com as dependências atualizadas.** Nenhum override foi
declarado no `package.json`.

---

### 29.8 Inventário completo de peças sem chamador de produção — medido

Varredura de todo `export function` / `export const` sob `src/` e `app/`, contando referências
em arquivos que não são `*.test.ts*` e confirmando com `grep` em `src app e2e scripts`. As 29
linhas abaixo têm **uma única ocorrência no código de produção: a própria declaração**.

| arquivo:linha | peça | ocorrências em teste | leitura |
|---|---|---|---|
| `src/domain/cost.ts:164` | `reorderPoint(dailyConsumption, leadTimeDays, safetyDays = 2)` → `Math.ceil(dailyConsumption * (leadTimeDays + safetyDays))` | 8 | **sem chamador.** Compras inteligentes são fora de escopo por decisão escrita (`docs/roadmap.md:350`) |
| `src/domain/cost.ts:146` | `observedLeadTimeDays(deliveries)` → média de `(receivedAt − orderedAt) / 86.400.000` | 3 | **sem chamador.** É o dado que a F4 espera: *"o tempo real entre pedir e chegar, que só existe depois de meses de nota"* (`docs/roadmap.md:290-292`) |
| `src/domain/cost.ts:128` | `priceMove(purchases)` | 4 | **sem chamador** |
| `src/domain/cost.ts:104` | `foldCostEvents(...)` | 2 | **sem chamador** |
| `src/domain/cost.ts:193` | `ratesBefore(...)` | 4 | **sem chamador** |
| `src/domain/lot.ts:64` | `daysUntilExpiry(expires, today)` | 6 | **sem chamador** |
| `src/domain/money.ts:15` | `toDecimal(value: Cents)` → `value / 100` | 2 | **sem chamador** |
| `src/domain/money.ts:19` | `multiplyCents(value, factor)` → `Math.round(value * factor)` | 5 | **sem chamador** |
| `src/domain/units.ts:26` | `isValidHierarchy(h)` | 6 | **sem chamador** |
| `src/domain/access.ts:146` | `needsHumanYes(act)` | 3 | **sem chamador** |
| `src/data/repository.ts:3389` | `lastCostMove(...)` — *"When one of these items last actually changed price. 'Estável há doze dias' is a conclusion, and this is the fact under it"* (`:3377-3388`) | 0 | **sem chamador e sem teste** |
| `src/data/repository.ts:2520` | `unchecked(...)` — *"Remessas de um dia que ninguém conferiu ainda"* (`:2519`) | 3 | **sem chamador.** É a conta dos quatro postos de controle, item 5 da F3 (`docs/roadmap.md:261-263`) |
| `src/data/simulate.ts:65` | `simulateHistory(companyId, options)` — delega a `simulateFortnight` com outro horizonte | 0 | **sem chamador e sem teste.** Só `simulateFortnight` é chamado, por `app/settings.tsx:371` |
| `src/data/outbox.ts:139` | `forgetSentBefore` | 3 | §29.6.4 |
| `src/sync/engine.ts:75` | `drain` | 7 | §29.6.2 |
| `src/sync/serialize.ts:381` | `serialize` | 27 | §29.6.2 |
| `src/sync/serialize.ts:371` | `sendableTables` (const) | 6 | usada por guardas |
| `src/sync/serialize.ts:122` | `CROSSINGS_FOR_TESTS_ONLY` (const) | 2 | o nome declara a fronteira |
| `src/assistant/index.ts:32` | `registerSkills(skills)` | 0 | ponto de extensão: *"Modules register what they can answer and what they can fill, so turning a module on extends the assistant automatically"* (`src/assistant/index.ts:25-28`). **Sem chamador e sem teste** |
| `src/components/UnitStepper.tsx:22` | `UnitStepper` | 1 | **fronteira registrada** — peça da F2/F3, entra com a tela de separação (`docs/roadmap.md:270-272`; `src/dictionary.test.ts:44-45`) |
| `src/components/Glyph.tsx:277` | `GlyphStick` — *"Palitos: três hastes de ponta arredondada"* | 0 | **sem chamador** |
| `src/components/icons.tsx:109,120,139` | `IconStock`, `IconCost`, `IconLoss` | 0 | **sem chamador.** `icons.tsx` foi superado por `Glyph.tsx`; dali só `IconChevron` e os ícones da barra de abas ainda são importados |
| `src/i18n/index.ts:109` | `formatWeight(grams, locale)` | 0 | **sem chamador e sem teste** |
| `src/theme/tokens.ts:35` | `ambientArea: Record<Ambient, string>` — *"Which area of the app each ambient hue belongs to"* | 0 | **sem chamador e sem teste** |
| `src/data/db.ts` | `__setOpener`, `migrationSteps`, `schemaVersion` | 4 / 5 / 2 | pontos de teste e de guarda, pelo nome |

Três peças que a auditoria e o `CLAUDE.md` citam como mortas **e que hoje têm chamador** —
correção documental, não dívida:

| peça | citada como morta em | estado medido |
|---|---|---|
| `daysOfCover` | `CLAUDE.md:416`, `docs/insights.md:556` | **chamada** em `src/data/repository.ts:3843` |
| `explodeRequirements` | `docs/insights.md:557` | **chamada** em `src/data/repository.ts:1362` e `app/production/new.tsx:37` |
| `balanceByLocation` | `docs/insights.md:3221` | **chamada** em `app/inputs/[id].tsx:147` |
| `assistant_phrase` (coluna) | `CLAUDE.md:415` | **escrita** em seis caminhos: `src/data/repository.ts:405,948,1535,1716,2136,2495` |
| `Draft.kind` | `CLAUDE.md:416` | **lida** em `app/assistant.tsx:292,310`; os cinco valores (`purchase`, `count`, `item`, `production`, `transfer`) são todos produzidos por `src/assistant/skills.ts:366,591,673,876,954` |
| `balanceAt`, `lotsPresentDuring` | `CLAUDE.md:416`, `docs/insights.md:558` | **apagadas** — só sobrevivem citadas no docblock de `src/domain/ledger.ts:132-133` |

Ou seja: as quatro doenças que o portão P1 do `CLAUDE.md:414-418` usa como exemplo canônico
**já foram curadas**, e o arquivo que toda sessão lê primeiro continua citando as quatro no
presente. E o número mudou: *"quatro seções de dicionário nos três idiomas sem uma tela"*
(`CLAUDE.md:417`) são hoje **três**, listadas em §29.9.

---

### 29.9 Fronteiras registradas — o que parece dívida e não é

Estas peças existem sem chamador **com razão escrita e guarda que impede a lista de crescer
calada**. O portão P1 do projeto admite três respostas para uma peça sem chamador — trazer o
chamador, apagar a peça, ou **registrar a fronteira com quem vai chamá-la** — e explicitamente
recusa uma quarta: *"Escrever teste não é uma delas: já foi tentado, e só tornou a morte mais
difícil de ver."* (`docs/roadmap.md:379-384`).

| fronteira | razão registrada, transcrita | guarda |
|---|---|---|
| seção `posts` do dicionário | *"os quatro postos de controle (separado, carregado, entregue, conferido) — escopo da F3 escrito no plano do mês, no CLAUDE.md"* | `src/dictionary.test.ts:42-43` |
| seção `stepper` do dicionário | *"o UnitStepper, componente da Fase 2 — decisão registrada no CLAUDE.md, e apontá-lo como defeito já custou uma rodada"* | `src/dictionary.test.ts:44-45` |
| seção `scan` do dicionário | *"a leitura do QR do engradado na doca — o QR já é impresso na etiqueta do lote; quem lê ainda não existe"* | `src/dictionary.test.ts:46-47` |
| `production_runs` fora do serializador | *"corrida aberta é ESTADO do aparelho, não lançamento — o servidor não tem onde guardá-la e não deve ter"* | `src/sync/serialize.test.ts:130-140` (espera `UnknownTableError`) |
| `item_costs`/`item_cost_history` não enfileirados | *"a derived number gets one author"* | `src/data/repository.ts:445-455`, ramo `derived` em `src/sync/serialize.ts:386-388` |
| `movements.device_id` sempre nulo | *"Nulo até o aparelho saber qual aparelho ele é… o lugar onde ele entra já está escrito"* | `src/sync/serialize.ts:335-341` |
| duas mutações equivalentes | *"o estorno tem DUAS checagens em camadas — a de fora evita abrir transação, a de dentro fecha a corrida entre dois aparelhos… Só concorrência real separaria as duas, e a suíte não tem duas conexões."* | `scripts/mutate.mjs:235-247`, campo `equivalente` |

O mecanismo das duas primeiras guardas é o que as torna confiáveis: `src/dictionary.test.ts`
tem **duas** asserções em espelho — uma reprova seção sem leitor e sem linha na lista
(`:62-79`), a outra reprova **linha na lista para seção que já ganhou leitor** (`:80-88`),
exigindo que o motivo tenha mais de 40 caracteres e diga *quem* vai ler.

---

### 29.10 Números que o projeto afirma sobre si mesmo: o que a guarda cobre e o que envelheceu

`src/bar.test.ts` executa a coluna "como conferir" da tabela de `docs/roadmap.md:30-39`:
cada linha é derivada do sistema e comparada com o que está escrito. A fronteira honesta
dessa guarda está escrita nela: *"Acrescentar uma linha à tabela sem acrescentar uma entrada
aqui não quebra nada — e essa é a fronteira honesta desta guarda: ela confere o que foi
registrado, não descobre o que não foi."* (`src/bar.test.ts:113-119`).

Derivadas e conferidas — dez linhas em `TABELA` (`src/bar.test.ts:121-132`). Medidas nesta
árvore, todas concordando:

| linha | escrito | medido |
|---|---|---|
| telas | 24 | 24 |
| tabelas no aparelho (SQLite) | 21 | 21 |
| tabelas no servidor (Postgres) | 22 | 22 |
| migrações do servidor | 32 | 32 |
| papéis | 7 | 7 |
| capacidades | 18 | 18 |
| `npm test` | 338 | 338 |
| `npm run mutate` | 106 | 106 |
| `npm run e2e:fast` | 36 | 36 |
| `npm run db:verify` | 13 | 13 |

**Três linhas da mesma tabela NÃO estão na guarda, e duas já envelheceram:**

| linha | escrito em `docs/roadmap.md` | medido agora | estado |
|---|---|---|---|
| migrações do aparelho | **V17** (`:36`) | `const V17` | certo |
| linhas de código | **~45.000** (`:39`) | **48.889** | **velho em ~4.000 linhas** |
| `.proofgate/verify.sh` | **24** guardas (`:49`) | **25** arquivos `.sh` em `.proofgate/guards.d/` | **velho em uma** |

A tabela leva o título *"Onde o produto está hoje — medido, não afirmado"*
(`docs/roadmap.md:20`) e a própria página registra que ela já mentiu: *"Ela já envelheceu, no
dia em que foi escrita: quatro linhas ficaram para trás antes do fim da tarde."*
(`docs/roadmap.md:26-28`). **Custo de consertar: três entradas novas em `TABELA`.**

`CLAUDE.md` é conferido em um ponto só — o número de garantias do `db:verify`, por
`src/bar.test.ts:96-109`, que exige a palavra por extenso (`POR_EXTENSO[13]` = "treze").
Nenhuma guarda confere os exemplos de código morto de `CLAUDE.md:414-418`, que é por isso que
eles envelheceram (§29.8).

---

### 29.11 Invariantes frágeis: documentados, pouco guardados

**A ordem alfabética de dois gatilhos, que é load-bearing.** Transcrito de
`supabase/migrations/0027_a_resend_is_not_a_decision.sql:84-92`:

*"O NOME DESTE GATILHO É LOAD-BEARING, e mudá-lo quebra a regra em silêncio. O Postgres roda
os gatilhos `before` da mesma tabela em ordem ALFABÉTICA de nome. Este precisa vir antes de
`orders_leave_pending_only_by_approval`: se aquele rodar primeiro, ele vê um status novo
diferente do velho, levanta exceção, e a fila trava — que é exatamente o que se está
consertando. `orders_decision_fields_stay_put` < `orders_leave_pending_only_by_approval`
porque 'd' vem antes de 'l'. Renomear qualquer um dos dois sem conferir isto devolve o defeito
sem nenhum teste ficar vermelho por outro motivo."*

Não existe guarda que compare os dois nomes. A checagem 8 do `db:verify`
(`scripts/verify-migrations.sh:637`) exercita o comportamento, o que pega a regressão *se* ela
mudar o resultado observável — mas o próprio docblock diz que o defeito volta "sem nenhum
teste ficar vermelho por outro motivo". **NÃO ESTÁ NO CÓDIGO** uma asserção sobre a ordenação
dos nomes.

**Migração é append-only, e editar um passo já rodado divide banco e arquivo em silêncio.**
`CLAUDE.md` (seção Git): *"`supabase/migrations/` e o `MIGRATIONS` de `src/data/db.ts` só
crescem — **editar um passo que já rodou faz o banco e o arquivo divergirem em silêncio**"*.
Guarda existente: `.proofgate/guards.d/97-migration-edited.sh`.

**A proofgate lê `base..HEAD`, não a árvore de trabalho.** Marcador de justificativa em
arquivo sem commit não existe para ela (`CLAUDE.md`, barra de verificação). E o marcador
`proofgate-allow` só funciona **na própria linha ofensora** — escrito na linha de comentário
acima, ele "reads exactly like a handled finding" e não suprime nada; foi o que originou o
guarda `.proofgate/guards.d/99-dead-allow.sh:1-14`.

---

### 29.12 O que a auditoria declarou não ter conseguido olhar

Quatro limites, transcritos de `docs/auditoria.md:241-258`, com o estado de hoje:

| limite | texto original | estado |
|---|---|---|
| **A segunda lente adversarial foi cortada** | *"O desenho previa dois verificadores independentes por achado — sessenta agentes. Nesta máquina, com dois núcleos livres, isso levaria cerca de nove horas. Os trinta achados vêm da leitura dos dez auditores, muitos com reprodução executável própria; **eu verifiquei pessoalmente seis**, entre eles os dois já consertados e os dois de fundação. Os outros carregam a evidência de quem os achou, e ainda precisam da segunda leitura antes de virar conserto."* | **segue aberto.** Não há registro de segunda leitura. Onze altas foram consertadas com a evidência de uma lente só |
| **Nada foi visto numa fábrica** | *"Nível de evidência E3: exercitado contra Postgres e navegador de verdade. O contraste, o alvo de toque com luva e o QR a um braço de distância só se resolvem com aparelho na mão."* | **segue aberto.** `docs/roadmap.md:51-54` repete: *"Nada visto numa fábrica. Essa é a lacuna que nenhum teste fecha"* |
| **Não houve teste de carga real** | *"só medição de consulta. A conclusão sobre a capa vem de um SQLite com dois anos de movimento sintético."* | **segue aberto.** A ferramenta que produziria o horizonte longo é `simulateHistory` (`src/data/simulate.ts:65`) — **e ela não tem chamador** (§29.8) |
| **As duas vulnerabilidades moderadas** | *"que o GitHub aponta não puderam ser lidas: o `npm audit` não alcança o registro deste ambiente."* | **resolvido**: 13 moderadas, 2 raízes, medidas em §29.7.3 |

E três correções que a própria auditoria recebeu depois de escrita, registradas nela em vez de
apagadas:

1. **Achado 10, o número era o do extremo.** *"ela disse '2,55:1 nas quatro combinações'. O
   2,55 é o pior caso (Orgânico claro sobre `paper`), não o número de todas; a faixa medida era
   2,35 a 4,43, e são **seis** paletas, não quatro. O achado está certo; o número era o do
   extremo."* (`docs/auditoria.md:130-132`).
2. **Achado 8, a severidade era futura.** §29.3.5.
3. **Um achado que a auditoria não fez:** `readings` nasceu sem política de update, então
   *"reenviar uma leitura da câmara travava a fila para sempre"* — quinta aparição da mesma
   família (0015, 0020, 0027, 0030 e esta), *"e a primeira encontrada procurando a família em
   vez de esbarrando nela"* (`docs/auditoria.md:104-110`). Fechado por
   `supabase/migrations/0031_a_reading_can_be_sent_twice.sql`, com a checagem 12 do `db:verify`
   escrita antes da migração.

E uma quarta correção que **este dossiê acrescenta**: o achado 10 subiu as seis paletas para
4,6:1 ou mais, e no mesmo dia o dono viu o que a régua nova não pegava — *"cadê o tema papel
light? você fez o dark, ficou ok. falta o light."* No Papel claro, depois do conserto, `ink`
dava 15,35, `inkMuted` **5,34** e `inkFaint` **5,07**: cinco por cento entre a tinta do corpo
e a da legenda, **três camadas viradas duas**. A guarda passava porque pedia `média > fraca`,
e 5,34 é maior que 5,07. A regra que saiu: **"guarda de grandeza contínua precisa de PASSO
MÍNIMO, não de ordem"**, com piso de **1,35×** (`docs/insights.md:3535-3569`).

---

### 29.13 Decisões pendentes do dono

Estas não são dívidas técnicas: são as três situações em que o projeto para e pergunta —
*"a resposta muda o que é construído"*, *"é irreversível"*, ou *"é decisão de dono"*
(`CLAUDE.md`, borda das perguntas).

#### 29.13.1 A sala do tacho — sala estrita ou salas nossas somadas

**A pergunta**, transcrita de `docs/roadmap.md:219-239`: o piso da produção conta a sala em
que o tacho roda, e isso está certo — *"somar todos os lugares autorizaria um tacho com o
açúcar que está a dez quilômetros, numa loja"*. Mas polpa mora no freezer. Então:

| caminho | como funciona | preço |
|---|---|---|
| **Sala estrita** (é o que existe hoje) | o insumo entra no almoxarifado, e tirar da câmara é **uma transferência lançada** | saldo por sala sempre exato; **um lançamento a mais por tacho** |
| **Salas nossas somadas** | o tacho consome de qualquer sala da fábrica, e o sistema decide de qual debitar (a mais velha primeiro, como o lote já faz) | nada a lançar; **o saldo de uma sala isolada passa a ser deduzido, não declarado** |

**Por que não é escolha de quem constrói.** Pela regra da casa *"isto não é pergunta de qual,
é pergunta de qual é o **padrão** — os dois caminhos existem como configuração da empresa"*
(`docs/roadmap.md:232-234`). O que trava é o portão **P3**: a segunda opção muda **onde o
consumo é gravado**, que é o caminho de escrita de `movements`, e forma de livro-razão não se
corrige com um commit — se corrige com migração e estorno (`docs/roadmap.md:234-236`;
`CLAUDE.md`, portão P3).

**O que falta antes de qualquer uma das duas, e é código:** *"o trajeto interno:
**transferência entre salas nossas**, que a tela de transferir não faz (ela sai sempre da
fábrica, e o caminho de volta grava `return`, que é notícia sobre a loja, não sobre a nossa
câmara)"* (`docs/roadmap.md:236-239`). Verificado:

- a tela fixa uma das pernas na fábrica: `const fabrica = defaultLocationId(LOCAL_COMPANY_ID);`
  (`app/transfer.tsx:111`); os destinos são *tudo menos a fábrica*
  (`const destinations = (data?.places ?? []).filter((p) => p.id !== fabrica);`, `:124`);
- o sentido inverte as pernas e **troca o tipo gravado**: `const registrar = devolucao ? recordReturn : recordTransfer;`
  (`app/transfer.tsx:226`);
- os dez tipos de lançamento são `'purchase' | 'production' | 'consumption' | 'transfer' | 'sale' | 'loss' | 'return' | 'adjustment' | 'discrepancy' | 'reversal'`
  (`src/domain/ledger.ts:19-29`), e `'return'` está comentado como *"came back from a route or
  a store"* (`:26`);
- as seis espécies de lugar são `'factory' | 'cold_room' | 'store_room' | 'own_store' | 'customer' | 'vehicle'`
  (`supabase/migrations/0001_foundation.sql:109`), e as nossas são
  `INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room']` (`src/domain/ledger.ts:68`).

**O que quebra enquanto não decidir.** *"uma fábrica que guarda a polpa no freezer teria de
lançar transferência antes de cada tacho, e nenhuma fábrica de seis pessoas faz isso"*
(`docs/roadmap.md:207-209`) — e a transferência câmara → almoxarifado que ela teria de lançar
**não existe na tela**, ou grava `return`, que mente sobre uma loja. O achado 5 foi fechado:
a tela parou de mentir. O trajeto não existe.

#### 29.13.2 O que "apagar tudo" significa num servidor multiempresa

Duas formas, e a primeira é irreversível: *"destruir o histórico daquela empresa, ou só marcar
que aquele aparelho não quer mais o dado. A primeira é irreversível e o livro-razão recusa
DELETE por desenho. **Não construo sem você escolher.**"* (`docs/insights.md:566-572`).
Estado técnico em §29.6.3.

#### 29.13.3 A licença do clima — decisão de gasto

*"O Open-Meteo é gratuito para uso **não comercial**. Para publicar: ou troca de provedor, ou
entra plano pago. **Decisão de gasto, é do dono.**"* (`docs/roadmap.md:313-315`), repetida na
PR #2: *"Não vou decidir gasto seu."*

#### 29.13.4 A busca de marca — não é automatizável

*"`NORVA` ainda não passou por busca de anterioridade no INPI (classes 9 e 42). Precisa de
login gov.br — não é automatizável. Nada mais no código chumba o nome: trocar de marca é
editar `src/config/brand.ts` e o `app.json`."* (`docs/roadmap.md:327-330`). A mesma promessa
está no docblock da fonte: *"To keep that uncertainty from blocking engineering, nothing else
in the codebase hardcodes the name. Changing brands is an edit to this file plus `app.json`."*
(`src/config/brand.ts:4-8`). O `brand` exporta `name: 'NORVA'`, `slug: 'norva'`,
`scheme: 'norva'`, `markPath: 'M50,50 L70.3,11 A44,44 0 1,1 29.7,11 Z'`,
`markColorLight: '#2E2B27'`, `markColorDark: '#EDEBE7'` (`src/config/brand.ts:10-34`).

#### 29.13.5 O resto da papelada da F6, que é do dono e não é código

De `docs/roadmap.md:311-330`:

| item | o que falta |
|---|---|
| **Política de privacidade e declaração de dados** | o que o app coleta e para onde manda — Supabase, Open-Meteo, atualizações da Expo. Exigência das duas lojas |
| **LGPD** | dado pessoal identificável: o que é, onde mora, e como se apaga a pedido |
| **Permissões do Android** | pedir só o que se usa; permissão a mais é recusa na revisão |
| **O que fazer quando quebra** | *"Hoje o app tem tela de erro e nenhum relato. Sem isso, uma falha na fábrica de um cliente é invisível daqui."* — **NÃO IMPLEMENTADO** |

A auditoria conta essa frente assim: *"**Seis das oito perguntas de prontidão de loja** já
estão registradas como fronteira no plano, com o que as destrava. Não são surpresa."*
(`docs/auditoria.md:234-235`). **Quais são as oito NÃO ESTÁ NO CÓDIGO** — o plano lista sete
itens na F6, dos quais um (ícone/splash/nome) está marcado como feito e está pela metade
(§29.7.1).

#### 29.13.6 Quando a F5 começa

*"Começa quando o dono decidir começar. Não bloqueia F3, F4 nem F6."*
(`docs/roadmap.md:305`). Microserviço .NET, certificado digital A1, homologação na SEFAZ;
*"o layout quem decide é a SEFAZ, e a homologação tem fila"* (`:301-304`).

#### 29.13.7 Os PRs abertos — estado medido

O repositório remoto é `https://github.com/ChrnX0/SZG-app` (`git remote -v`), servido pela
API como `ChrnX0/Norva`.

| PR | título | estado |
|---|---|---|
| **#2** | *"Fase 2: a grade do produto, a produção pelo fato, o clima, o pedido — e a capa refeita pelo que o dono viu"* | **aberto, em rascunho (`draft: true`)**; `claude/recipes-production-app-vbwrde` → `main`; criado 2026-09-01, atualizado 2026-09-05; **251 commits, 276 arquivos, +89.983/−2.653**; `mergeable_state: "unstable"`; 1 comentário |
| #1 | *"Fase 1: o que você produz e quanto custa — motor, telas, assistente e entrega"* | **fechado e integrado** em 2026-09-01T15:27:27Z |

Estado dos checks do HEAD de #2 (`9f20c777`), medido: quatro checagens — `proofgate`
**success**, `the database keeps its promises` **success**, `types, tests, bundle`
**in_progress**, `the app, driven the way a person drives it` **in_progress**.

**A decisão que espera o dono:** integrar `main` é ato dele por regra escrita — *"`main` só por
merge de PR, que é ato do dono"* (`CLAUDE.md`, seção Git). O PR está em rascunho desde 1 de
setembro e carrega a Fase 1 inteira **mais** a Fase 2 mais a auditoria: `main` está no commit
`0b7f63d` de 2026-09-01, e o trabalho de quatro dias inteiros vive só na branch.

O próprio corpo do PR registra que ele já mentiu duas vezes: *"Este corpo já ficou velho duas
vezes num dia. É o mesmo defeito que a varredura de 4 de setembro caçou trinta e uma vezes —
um rótulo que discorda do que está embaixo dele — reaparecendo na capa da própria PR que o
conserta."* E a tabela de verificação dele traz `.proofgate/verify.sh | ❌ zero`, `npm test` **305**
e `mutate` **90** — números de 4 de setembro, hoje 338 e 106.

Também no corpo do PR, na seção *"Em aberto, e é decisão sua"*: o `EXPO_TOKEN` (§29.7.2), o
Open-Meteo (§29.13.3) e o INPI (§29.13.4). São as três coisas que ele foi explicitamente
proibido de decidir.

---

### 29.14 Fora de escopo por decisão escrita — não se re-litiga

`docs/roadmap.md:341-351`. A razão importa mais que o item: ela é o que impede a decisão de
voltar como "boa ideia" numa sessão futura.

| fora | razão escrita |
|---|---|
| **Relatório do Espelho da Loja** | a captura entra; o relatório **mente com duas semanas de dado** |
| **Microserviço fiscal** | projeto à parte — certificado A1, homologação SEFAZ; nada depende dele |
| **Compras inteligentes** | precisam do **prazo observado**, que só existe depois de meses de nota |
| **Trunfos** (PAC/POD, clima aplicado, roteirização) | diferencial de mercado, não a dor de hoje |

E as decisões do dono que **restringem desenho futuro**, a serem lidas antes de "consertar"
qualquer uma (`docs/roadmap.md:353-370`): entrada no chão de fábrica é configuração (PIN em
grade de nomes **ou** conta pessoal, os dois existem); quem cria a empresa é o dono, e daí
cadastra pessoas **ou** aprova quem pediu associação por código; o relatório fala de onde, não
de quem (`recorded_by` sempre gravado, nomear na tela é opt-in via `names_who_recorded`);
`recorded_by` e `operator_id` são **duas perguntas** e uma coluna só para as duas já custou uma
rodada; aparelho emprestado entra como papel `operator`, sem custo, preço nem dinheiro; o
operador confere a prateleira, e o que protege o número é o **piso** (contagem perguntada toda
vez, gravada como diferença), não a permissão; a luz da tela é do aparelho e o padrão é o claro
— claro, escuro e seguir o aparelho, os três existem.

---

### 29.15 Recomeçando do zero: as dez coisas a não repetir

`docs/dossie/34-recomecar.md:95-140`, resumidas com a razão medida de cada uma. Cinco delas
são as dívidas desta seção vistas de outro ângulo:

1. **Um olho de verdade desde o começo** — Expo Go no telefone do dono, ou EAS Build com
   distribuição interna, ou emulador Android real. *"O que **não** funciona é o que foi feito:
   web em Playwright como único olho."*
2. **Capturas de tela por commit, nos dois esquemas.** A ferramenta existiu (`npm run shot`),
   achou os defeitos em minutos, e chegou tarde — com três cegueiras a evitar: navegador em
   inglês, pacote compilado reusado só porque existia, e esquema trocado no navegador em vez de
   na opção do app.
3. **Tokens de tema com métrica, não com asserção de ordem.** Passo mínimo definido antes dos
   hexadecimais (§29.12, a cicatriz de 1,35×).
4. **Dividir a camada de dados.** `src/data/repository.ts` chegou a **4.525 linhas** com
   leitura e escrita no mesmo arquivo.
5. **`unit_packaging_cents` deve ser `Rate` desde a primeira migração** (§29.5).
6. **Resolver "a sala do tacho" antes de escrever consumo de produção** (§29.13.1).
7. **Generalizar `location_id` no saldo desde o começo.** O código criava um local único cujo
   id era o próprio `company_id`, e as três consultas de saldo somavam por empresa e item, sem
   filtrar local.
8. **Nenhuma peça sem chamador no mesmo commit** (§29.8).
9. **Um fluxo inteiro antes de qualquer largura.** *"O repositório tinha 17 telas e nenhuma
   tinha sido usada por uma pessoa de verdade numa fábrica."*
10. **Splash e ícone de verdade antes do primeiro APK que alguém instala** (§29.7.1).
