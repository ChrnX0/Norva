## 11. A camada de dados — parte A (leitura: consultas e seletores)

### 11.1 O arquivo, seu contrato e sua superfície

`src/data/repository.ts` tem **4.525 linhas** e é o único lugar do aplicativo onde
existe SQL de negócio. O docblock de abertura declara o motivo (`src/data/repository.ts:23-30`):

> *"Every query the app needs, in one place. The screens call these functions, and
> when the assistant lands it will call **these same functions** rather than writing
> SQL of its own. An assistant with a second query path eventually reports a
> different number than the screen showing the same thing, and the app loses its
> credibility in a single day."*

Essa promessa é cumprida por um arquivo separado, `src/data/assistantData.ts`, cujo
docblock diz explicitamente que ele é *"a binding, not a query"* e que *"the assistant
is physically unable to ask the database anything the screens cannot ask"*
(`src/data/assistantData.ts:24-32`). Cada entrada de `liveData()` é uma das funções
deste arquivo com o `companyId` preenchido (`src/data/assistantData.ts:33-72`).

#### O contrato de conexão

Toda função de leitura começa com `const conn = await db();`. O tipo `Db` é uma
interface nomeada de cinco métodos (`src/data/db.ts:690-696`):

```ts
export type Db = {
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, params?: SqlParam[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};
```

A existência dessa interface é o que permite que a suíte rode o SQL de verdade: o
`src/data/repository.test.ts` monta um adaptador para o SQLite síncrono do Node
(`src/data/repository.test.ts:88-116`) e o injeta com `__setDb(conn)`
(`src/data/repository.test.ts:123-130`). O docblock do teste explica por que isso
importa: *"arithmetic that is correct and then stored wrong is indistinguishable from
arithmetic that is wrong, and the SQL had no test at all: `expo-sqlite` only exists on
a device"* (`src/data/repository.test.ts:73-85`).

#### Convenções que valem para todas as leituras

| Convenção | Onde se vê | Consequência |
|---|---|---|
| `companyId` é sempre o **primeiro** parâmetro | todas as funções exportadas, ex. `src/data/repository.ts:146`, `:537`, `:2574` | multi-empresa desde a primeira linha; nenhuma consulta lê sem `WHERE company_id = ?` |
| Toda leitura mapeia `snake_case` do banco para `camelCase` do domínio | `src/data/repository.ts:191-204`, `:557-562`, `:1027-1036` | o esquema não vaza para as telas |
| Nenhum SQL é montado por interpolação de valor | `src/data/repository.ts:745-748` (justificativa escrita) | exceções são só listas de `?` (`marks`) — `:3396`, `:3469`, `:3826`, `:4040`, `:4068` |
| Retorno é sempre lista, objeto ou `null` — nunca frase | ver 11.2 | a tela escreve português |
| Janela de tempo é sempre **meio-aberta**: `>= from` e `< to` | `src/data/repository.ts:2211-2212`, `:2586-2587`, `:2621-2622`, `:2692-2693`, `:2878`, `:3334-3335` | dois dias consecutivos cobrem cada movimento exatamente uma vez (`src/data/repository.ts:2569-2572`) |
| Janela filtra `occurred_at`, **nunca** `recorded_at` | `src/data/repository.ts:2562-2567` | corrida das 23h50 sincronizada à 01h pertence ao dia em que aconteceu |

O parágrafo que fixa a última regra vale transcrever inteiro, porque é decisão de
produto e não detalhe de SQL (`src/data/repository.ts:2562-2567`):

> *"The window is filtered on `occurred_at` and NEVER on `recorded_at`, and the two
> are different facts on purpose. A run entered offline at 23h50 and synced at 01h
> belongs to the day it happened, not to the day the phone found signal. Sorting the
> ledger by when the server heard about it is how a factory ends up with a Monday that
> produced nothing and a Tuesday that produced double."*

#### Como as telas consomem

As telas não chamam as funções direto no corpo do componente: usam `useQuery`
(`src/data/useQuery.ts:21-92`), um gancho de 92 linhas sem biblioteca externa. O
docblock diz por quê: *"a data-fetching library here would be weight for nothing,
since every query is a local SQLite call that answers in milliseconds and never needs
a network retry policy"* (`src/data/useQuery.ts:4-20`). Ele devolve
`{ data, loading, error, refresh }`, é chaveado por string (não por array de
dependências) e re-consulta quando a tela volta ao foco (`src/data/useQuery.ts:66-84`).

---

### 11.2 "A camada de dados devolve fato, não frase" — as provas dentro do próprio arquivo

Esta é a fundação mais visível na leitura, e o arquivo a defende em pelo menos oito
lugares distintos, cada um com a cicatriz que a motivou.

**1. O lugar padrão volta com nome vazio.** `listPlaces` devolve `name: ''` e
`isDefault: true` para o lugar que nasceu com a empresa, em vez de chamá-lo de
"Almoxarifado" (`src/data/repository.ts:587-593`):

> *"O padrão é gravado com `name` vazio de propósito, e continua assim: o nome dele é
> uma palavra em três idiomas, e essa palavra é da tela. Aqui devolve-se o fato —
> string vazia e `isDefault` — e quem fala português é quem desenha."*

O banco reforça: o `INSERT` do lugar padrão grava `''` literalmente
(`src/data/db.ts:262-264`), e o comentário na migração diz *"An unnamed location means
'the one place', and the interface is what names it"* (`src/data/db.ts:252-261`). Em
tempo de execução o mesmo `INSERT` é feito por `ensureLocation`
(`src/data/repository.ts:863-866`).

**2. Remessa volta em unidade-base, nunca em "caixas".** `shipmentsOn` recusa
converter (`src/data/repository.ts:3295-3299`):

> *"The result stays in base units on purpose. Turning grams and popsicles into
> 'caixas' is a sentence, not a fact, and it cannot be done here: `breakdown()` works
> per item, and an item with no box layer - sugar, pulp - has no box to be counted in.
> A repository that returned '18 cx' would have invented a unit for half the rows."*

Para a tela conseguir escrever a frase, a consulta devolve **os insumos da frase** —
`baseUnit` e `packaging` — e não a frase (`src/data/repository.ts:3266-3281`). O campo
`baseUnit` foi acrescentado depois, por causa de um defeito concreto: *"a capa dizia
'6.000 unidades de Açúcar cristal' para seis quilos, e a aba de transporte imprimia
'6.000' sem unidade nenhuma"* (`src/data/repository.ts:3270-3278`). O teste prende:
`assert.equal(acucarNoCentro?.baseUnit, 'g', 'seis mil GRAMAS, e não seis mil açúcares')`
(`src/data/repository.test.ts:999`).

**3. A subtração é da tela.** `stockAgainstOrders` devolve `requested` e `onHand`
separados e não a diferença (`src/data/repository.ts:4143-4145`):

> *"Devolve fato — saldo e pedido, produto por produto. Quem faz a subtração e escreve
> 'falta produzir 300' é a tela, porque a frase é português e esta camada não fala
> português."*

**4. O instante, não o dia.** `productionBetween` devolve `occurredAt` cru
(`src/data/repository.ts:2606-2608`):

> *"E ela devolve o instante, não o dia. O dia é uma conta que depende do fuso da
> fábrica, e esta camada devolve fato — quem fala em segunda-feira é a tela, com
> `dailySeries` no meio."*

**5. Número de versão, não "versão 3".** `LotOfDay.recipeName` e `recipeVersion` vêm
como nome e inteiro (`src/data/repository.ts:2647-2657`):

> *"Fato, nunca frase - 'Picolé de morango, versão 3' é a tela quem escreve."*

**6. Lotes numa sala, não "três lotes estavam na câmara".** `lotsInRoomAt`
(`src/data/repository.ts:3074-3075`): *"Devolve fato: lote, produto, quantidade e
validade. Quem escreve 'três lotes estavam na câmara' é a tela."*

**7. Os erros carregam fato, não texto.** Três classes de erro deste arquivo existem
porque a tela precisa dos números para escrever a frase:

| Classe | Carga | Linha | Motivo escrito |
|---|---|---|---|
| `NotEnoughStockError` | `missing: { itemId, name, needed, held }[]` | `src/data/repository.ts:1302-1309` | *"a tela precisa dizer QUAIS faltaram - 'faltou insumo' manda a pessoa procurar, e a Lei 5 quer que o erro impeça e mostre a saída no mesmo gesto"* (`:1296-1300`) |
| `GridTakenError` | `existing: string` (nome do outro produto) | `src/data/repository.ts:1887-1892` | a recusa do índice único chegava como *"Error finalizing statement"*, jargão de driver num diálogo que o dono lê (`:1872-1885`) |
| `CannotReverseError` | `plan: ReversalPlan` inteiro | `src/data/repository.ts:4225-4234` | *"a tela precisa dizer QUAL item já saiu e quanto, não 'não foi possível'"* (`:4218-4224`) |
| `RunGoneError` | `runId: string` | `src/data/repository.ts:2245-2250` | corrida que o razão não conhece |
| `TypeIsFromAnotherLineError` | `typeId: string` | `src/data/repository.ts:3743-3748` | no servidor é chave estrangeira composta; o SQLite do aparelho não aceita, então a garantia vira escrita no repositório |

O mesmo vale para o erro de apagar: o teste verifica que a recusa carrega
`e.blocker.reason === 'recipesUseInputs'` e comenta *"The refusal carries the reason,
not a sentence - the screen writes the sentence, which is what lets the same rule speak
three languages"* (`src/data/repository.test.ts:426-433`).

**8. A contagem é fato porque o rótulo mentia.** `PickLine.orders` existe só para a
frase não mentir (`src/data/repository.ts:3169-3176`):

> *"A tela dizia 'pedido para 05/09: 800 un' — singular, com a data do primeiro e a
> quantidade de todos. Uma loja com 500 para sexta e 300 para segunda lia uma frase que
> afirmava um pedido só. Somar e rotular no singular é a única combinação que mente, e
> a contagem é fato: a soma já estava aqui."*

**9. O nome vem do catálogo, nunca do JSON.** `parsePackagingItems` recebe um catálogo
e resolve o nome a cada leitura (`src/data/repository.ts:105-126`, chamada em `:1847`):

> *"Guarda só id e quantidade: o nome vem do catálogo a cada leitura, senão o JSON
> passa a ser um segundo lugar onde o item se chama alguma coisa - e o dia em que
> alguém corrigir 'Palito de picolé' para 'Palito', a tela de produção continuaria
> dizendo o nome antigo."* (`src/data/repository.ts:72-83`)

**Uma exceção honesta**, que precisa ser dita: as mensagens de `throw new Error(...)` de
validação **estão em português dentro do repositório**. Exemplos exatos:
`'um lugar sem nome não se distingue de outro'` (`:645`), `'a semana tem sete dias'`
(`:654`), `'origem e destino são o mesmo lugar'` (`:1689`), `'uma transferência move
alguma coisa; para o sentido inverso, troque os lugares'` (`:1692`), `'uma perda de nada
não é uma perda'` (`:2104`), `'uma leitura que não é número não é leitura'` (`:2781`),
`'uma grandeza sem unidade é um número solto'` (`:2782`), `'um pedido sem item não é
pedido'` (`:3996`), `'uma corrida que não rendeu nada é um erro, não um fato'` (`:1355`),
`'embalagem por unidade tem que ser mais que zero'` (`:98`). São mensagens de programador
para caminho que a tela já impede, não texto de interface — mas são português dentro da
camada que declara não falar português.

---

### 11.3 Permissão: o que este arquivo **não** faz

**NÃO IMPLEMENTADO.** Nenhuma função de leitura de `src/data/repository.ts` faz
checagem de permissão ou capacidade. O arquivo não importa nada de
`src/domain/access.ts`; a busca por `access`, `Capability`, `can(`, `allows(` ou
`permission` em `src/data/repository.ts` não retorna nada.

O vocabulário de capacidades existe e está completo em `src/domain/access.ts:26-38`:

```
view_cost · view_sale_price · record_production · dispatch · check_receipt ·
record_loss · place_order · approve_order · adjust_stock · view_finance ·
issue_invoice · manage_company
```

e os sete papéis são `owner`, `operator`, `storeManager`, `driver`, `buyer`,
`customer`, `salesperson` (`src/domain/access.ts:51-59`). O próprio módulo declara que
não impõe nada (`src/domain/access.ts:9-14`):

> *"It does not enforce anything. Enforcement lives where the data is: row level
> security in Postgres, and the check that runs *before* the query on this device.
> Hiding a control is decoration - the figure has to never arrive."*

O único consumidor de `capabilitiesFor` no aplicativo é `app/assistant.tsx:16` — a tela
do assistente, que restringe as habilidades dele. **A metade "o check que roda antes da
consulta neste aparelho" não existe no código de leitura.** Hoje o que protege é o
servidor: RLS e as políticas por `capability` nas migrações (ex.
`supabase/migrations/0008_ledger_speaks_phase_one.sql:30`, que exige `check_receipt`
para escrever um movimento de `purchase`).

---

### 11.4 `NAO_ESTORNADO`: a constante que decide o que "aconteceu"

Nove consultas de leitura compartilham um único predicado, declarado como constante de
string em `src/data/repository.ts:750-752`:

```sql
NOT EXISTS (SELECT 1 FROM movements rev
             WHERE rev.reverses_movement_id = m.id
               AND rev.company_id = m.company_id)
```

O docblock explica a diferença entre saldo e história (`src/data/repository.ts:736-748`):

> *"O que foi estornado não aconteceu — para quem pergunta o que aconteceu. As duas
> linhas continuam no livro-razão, e é isso que a fundação exige: nada é apagado, o
> histórico responde por si. Mas 'quanto saiu do tacho hoje' é outra pergunta, e uma
> corrida corrigida responde zero a ela. Sem este pedaço, o estorno acerta o SALDO (que
> é soma pura e não olha `kind`) e deixa todas as telas de 'o que aconteceu' dizendo o
> número velho: o almoxarifado certo e a produção mentindo, no mesmo aplicativo."*

E explica por que é constante e não função de apelido: *"as oito consultas chamam a
tabela de `m`, e montar SQL por interpolação — mesmo com um apelido que nunca veio de
fora — é o padrão que a proofgate marca, com razão"* (`src/data/repository.ts:745-748`).

**Correção factual:** o comentário diz "oito consultas" em dois lugares
(`src/data/repository.ts:746` e `:4363`), mas a interpolação `${NAO_ESTORNADO}` aparece
**nove** vezes: linhas 728, 2213, 2535, 2588, 2623, 2694, 2922, 3336 e 4375. A nona
(`recomputeItemCost`, `:4375`) entrou depois de o texto ser escrito.

| Consulta | Linha do uso | Efeito de excluir o estornado |
|---|---|---|
| `lastSentBaseUnits` | `:728` | remessa desfeita não vira palpite do próximo carregamento |
| `lossesOn` | `:2213` | *"perda desfeita não aparece no relatório"* (`src/data/repository.test.ts:266-267`) |
| `unchecked` | `:2535` | remessa estornada não fica pendindo conferência |
| `productionOn` | `:2588` | total do dia não conta corrida corrigida |
| `productionBetween` | `:2623` | a semana da capa não desenha a corrida corrigida |
| `lotsOn` | `:2694` | lote de corrida estornada sai da lista do dia |
| `recentRuns` | `:2922` | o histórico curto não mostra a corrida desfeita |
| `shipmentsOn` | `:3336` | destino não aparece por causa de carga estornada |
| `recomputeItemCost` | `:4375` | a média móvel é recomposta **como se o estorno nunca tivesse existido** |

O último caso é o mais delicado e tem cicatriz escrita (`src/data/repository.ts:4352-4365`):

> *"Tratar a perna de estorno como uma saída comum é o que um sistema contábil faz com
> uma devolução, e é consistente com média móvel — mas deixa o erro dentro para sempre:
> 500 picolés a 64,99 mais 50 a 614 dá 114,08, e tirar os 50 depois devolve a quantidade
> e mantém os 114,08. O dono corrigiu o estoque e continua com o custo errado, que é
> exatamente a queixa."*

**Onde `NAO_ESTORNADO` deliberadamente NÃO entra:** todas as somas de saldo —
`listItems` (`:171-173`), `balanceByLocation` (`:548-553`), `stockByPlace` (`:793-803`),
`expiringSoon` (`:2981-2991`), `lotsInStock` (`:3029-3034`), `lotsInRoomAt` (`:3090-3099`),
`pickingFor` (`:3219-3222`), `stockAgainstOrders` (`:4163-4167`), `planReversal`
(`:4289-4294`). O motivo é aritmético: a perna de estorno é um movimento real de sinal
oposto, então a soma já a absorve. O índice que sustenta o `EXISTS` foi criado
especificamente para ele (`src/data/db.ts:670-674`):

```sql
CREATE INDEX IF NOT EXISTS movements_reversal_idx
  ON movements (reverses_movement_id, company_id)
  WHERE reverses_movement_id IS NOT NULL;
```

e o comentário no `itemMovements` diz o que acontecia sem ele: *"sem índice, perguntar
'isto foi estornado?' por linha é uma varredura do razão inteiro por linha, e a capa
abria em dez segundos com dois anos de fábrica"* (`src/data/repository.ts:1011-1014`).

---

### 11.5 Mapa completo das leituras, por área e por chamador

Estado: **T** = implementada e chamada por tela · **A** = também chamada pelo assistente
via `assistantData.ts` · **N** = chamada por camada não-tela (`src/notify/facts.ts`,
`src/data/simulate.ts`) · **X** = implementada **sem chamador de tela** · **Z** =
implementada **sem chamador nenhum**.

| Área | Função | Linha | Estado | Telas que chamam |
|---|---|---|---|---|
| Itens | `listItems` | 146 | T A N | `app/(tabs)/index.tsx:187`, `app/inputs/index.tsx:101`, `app/purchase.tsx:96`, `app/recipes/[id].tsx:128`, `app/products/new.tsx:137`, `app/production/new.tsx:134` |
| Itens | `findItem` | 3577 | T | `app/inputs/[id].tsx:143`, `app/inputs/new.tsx:111` |
| Itens | `itemCosts` | 278 | T A | `app/recipes/[id].tsx:126`, `app/recipes/index.tsx:88`, `app/products/new.tsx:132`, `app/products/index.tsx:78`, `app/purchase.tsx:462`, `:490` |
| Itens | `itemHistory` | 3527 | T | `app/inputs/[id].tsx:144` |
| Itens | `recentCostChanges` | 2046 | T A | `app/(tabs)/index.tsx:161` |
| Itens | `lastCostMove` | 3389 | **Z** | **nenhuma — nem teste** |
| Itens | `labels` | 1225 | T A | `app/recipes/[id].tsx:124`, `app/recipes/index.tsx`, `app/production/new.tsx`, `app/products/new.tsx:128`, `app/products/index.tsx`, `app/purchase.tsx` |
| Itens | `purchaseToBaseUnits` (pura) | 1237 | T A | `app/purchase.tsx:130`; `src/assistant/skills.ts:349` |
| Itens | `runningOut` | 3790 | T N | `app/(tabs)/index.tsx:168`, `:175`, `app/(tabs)/reports.tsx:80`, `app/inputs/index.tsx:120` |
| Locais | `listPlaces` | 594 | T A N | `app/places.tsx:108`, `app/transfer.tsx:92`, `app/orders/new.tsx:112`, `app/inputs/[id].tsx:137`, `app/inputs/index.tsx:97`, `app/(tabs)/index.tsx:186` |
| Locais | `defaultLocationId` (pura) | 843 | T A | `app/transfer.tsx:111`, `app/production/new.tsx:134`, `:213`, `:326`, `app/inputs/[id].tsx:213` |
| Estoque | `balanceByLocation` | 537 | T | `app/inputs/[id].tsx:147` |
| Estoque | `stockByPlace` | 781 | T A | `app/places.tsx:109`, `app/transfer.tsx:93`, `app/production/new.tsx:137`, `app/(tabs)/reports.tsx:79` |
| Estoque | `itemMovements` | 987 | T A | `app/inputs/[id].tsx:146` |
| Estoque | `lastSentBaseUnits` | 718 | T | `app/transfer.tsx:143` |
| Receitas | `listRecipes` | 1043 | T | `app/recipes/index.tsx:86`, `app/products/new.tsx:130` |
| Receitas | `loadRecipeGraph` | 1068 | T A | `app/recipes/[id].tsx:125`, `app/recipes/index.tsx:87`, `app/production/new.tsx:133`, `app/products/new.tsx:131`, `app/products/index.tsx:77`, `app/purchase.tsx:461` |
| Receitas | `recipesUsingItem` | 3559 | T | `app/inputs/[id].tsx:145` |
| Produtos | `listProducts` | 1818 | T A N | `app/recipes/[id].tsx:129`, `app/recipes/index.tsx:90`, `app/orders/new.tsx:113`, `app/production/new.tsx:132`, `app/products/new.tsx:138`, `app/products/index.tsx:76`, `app/purchase.tsx:463` |
| Grade | `listLines` | 3641 | T | `app/products/new.tsx:134`, `app/catalog.tsx:77` |
| Grade | `listTypes` | 3652 | T | `app/products/new.tsx:135`, `app/catalog.tsx:78` |
| Grade | `listFlavors` | 3668 | T | `app/products/new.tsx:136`, `app/catalog.tsx:79` |
| Grade | `assertTypeBelongsToLine` | 3751 | **X** | só chamador interno: `saveProduct` (`:1936`) |
| Produção | `openProductionRuns` | 2308 | T | `app/(tabs)/production.tsx:87`, `app/production/new.tsx:136`, `app/(tabs)/index.tsx:167` |
| Produção | `productionOn` | 2574 | T A | `app/(tabs)/production.tsx:85`, `:86`, `app/(tabs)/index.tsx:162`, `:163`, `:164` |
| Produção | `productionBetween` | 2610 | T | `app/(tabs)/index.tsx:170` |
| Produção | `recentRuns` | 2907 | T | `app/(tabs)/reports.tsx:81`, `app/(tabs)/index.tsx:171` |
| Lotes | `lotsOn` | 2673 | T | `app/(tabs)/production.tsx:88` |
| Lotes | `findLot` | 3120 | T | `app/lots/[id].tsx:95` |
| Lotes | `expiringSoon` | 2967 | T N | `app/(tabs)/index.tsx:183`; `src/notify/facts.ts:47` |
| Lotes | `lotsInStock` | 3017 | T | `app/transfer.tsx:166` |
| Lotes | `lotsInRoomAt` | 3077 | T | `app/places.tsx:485` |
| Transporte | `shipmentsOn` | 3301 | T | `app/(tabs)/transport.tsx:65`, `:68`, `app/transfer.tsx:258`, `app/(tabs)/index.tsx:165`, `:166` |
| Transporte | `unchecked` | 2520 | **X** | só teste (`src/data/repository.test.ts:1227`, `:1238`) |
| Perdas | `lossesOn` | 2187 | T A | `app/losses.tsx:80`, `:81`, `app/(tabs)/reports.tsx:82`, `:83`, `app/(tabs)/index.tsx:184`, `:185` |
| Pedidos | `listOrders` | 4034 | T N | `app/orders/index.tsx:68`, `app/transfer.tsx:248`; `src/notify/facts.ts:43` |
| Pedidos | `stockAgainstOrders` | 4147 | T N | `app/orders/new.tsx:193`, `app/(tabs)/index.tsx:169`; `src/notify/facts.ts:38` |
| Pedidos | `pickingFor` | 3200 | T | `app/transfer.tsx:173` |
| Leituras | `lastReadings` | 2828 | T N | `app/places.tsx:110`; `src/notify/facts.ts:50` |
| Leituras | `readingsBetween` | 2867 | T | `app/places.tsx:418` |
| Preferências | `briefingOrder` | 3899 | T | `app/settings.tsx:194`, `app/(tabs)/index.tsx:328` |
| Preferências | `briefingHidden` | 3915 | T | `app/settings.tsx:194`, `app/(tabs)/index.tsx:328` |
| Preferências | `alertSettings` | 3939 | T N | `app/settings.tsx:253`, `app/inputs/index.tsx:99`; `src/notify/index.ts:85` |
| Preferências | `ordersNeedApproval` | 3978 | T | `app/settings.tsx:243` |
| Apagar | `countForErase` | 3421 | T | `app/settings.tsx:262` |
| Estorno | `planReversal` | 4245 | T | `app/lots/[id].tsx:97`, `app/inputs/[id].tsx:331` |

**Pessoas e aparelhos: NÃO IMPLEMENTADO nesta camada.** Não existe função de leitura de
pessoas, papéis, PIN, aparelhos ou vínculos em `src/data/repository.ts` — a busca por
`devices`, `people`, `memberships` e `operator_id` no arquivo só encontra ocorrências
dentro de comentários. A coluna `movements.operator_id` existe no aparelho
(`src/data/db.ts:322`) e **nenhuma função deste arquivo escreve ou lê nela**. A tabela
`devices` é mencionada num comentário sobre sensores (`src/data/db.ts:599`) e não existe
no esquema do aparelho. Papéis e capacidades vivem só como tabelas de constantes em
`src/domain/access.ts`, sem tabela, sem consulta e sem tela.

**Acordos: implementado, mas dentro de `locations`.** Não há tabela de acordo. A ficha
mora em quatro colunas de `locations` acrescentadas em migrações posteriores —
`contact_phone`, `delivery_days`, `agreement_note` (`src/data/db.ts:527-529`) e
`sensor_ranges` (`src/data/db.ts:619`) — e é lida pela única consulta de `listPlaces`
(`src/data/repository.ts:606-609`).

---

### 11.6 Itens e custo

#### `listItems` — o catálogo com saldo, opcionalmente de uma sala

```ts
export async function listItems(
  companyId: string,
  kind?: ItemKind,
  includeInactive = false,
  locationId?: string,
): Promise<ItemWithCost[]>
```
(`src/data/repository.ts:146-153`)

`ItemKind` é uma união fechada de cinco valores exatos
(`src/data/repository.ts:32`):

```ts
export type ItemKind = 'input' | 'packaging' | 'product' | 'resale' | 'store_supply';
```

`ItemWithCost` é `Item` mais quatro campos (`src/data/repository.ts:34-59`):

| Campo | Tipo | Coluna | Nota |
|---|---|---|---|
| `id` | `string` | `items.id` | uuid v4 gerado no cliente (`src/data/db.ts:842-847`) |
| `kind` | `ItemKind` | `items.kind` | |
| `name` | `string` | `items.name` | |
| `purchaseUnit` | `string \| null` | `items.purchase_unit` | *"What the buyer holds: '25kg sack'"* (`:38`) |
| `purchaseToBase` | `number \| null` | `items.purchase_to_base` | *"Base units inside one purchase unit. 25000 g in a 25 kg sack"* (`:40`) |
| `baseUnit` | `string` | `items.base_unit` | padrão `'g'` no esquema (`src/data/db.ts:40`) |
| `packaging` | `PackagingHierarchy` | `items.packaging` (JSON) | via `parsePackaging` |
| `fullLevel` | `number \| null` | `items.full_level` | *"O que este item tem quando está cheio, em unidade-base. Nulo: não me pergunte."* (`:45-50`) |
| `averageRate` | `Rate` | `item_costs.average_rate` | `?? 0` quando não há linha (`:201`) |
| `lastRate` | `Rate \| null` | `item_costs.last_rate` | `null` preservado (`:202`) |
| `onHandBaseUnits` | `number` | **soma de `movements`** | `?? 0` (`:203`) |
| `active` | `boolean` | `items.active` | `r.active === 1` (`:200`) |

**SQL exato** (`src/data/repository.ts:169-189`):

```sql
SELECT i.id, i.kind, i.name, i.purchase_unit, i.purchase_to_base, i.base_unit, i.packaging,
       i.active, i.full_level, c.average_rate, c.last_rate,
       (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
         WHERE m.company_id = i.company_id AND m.item_id = i.id
           AND (? IS NULL OR m.location_id = ?))
         AS on_hand_base_units
  FROM items i
  LEFT JOIN item_costs c ON c.item_id = i.id
 WHERE i.company_id = ?
   AND (? = 1 OR i.active = 1)
   AND (? IS NULL OR i.kind = ?)
 ORDER BY i.name COLLATE NOCASE
```

Parâmetros na ordem: `locationId ?? null`, `locationId ?? null`, `companyId`,
`includeInactive ? 1 : 0`, `kind ?? null`, `kind ?? null` (`:181-188`).

Três decisões dentro dessa consulta:

1. **Não existe coluna de estoque.** O saldo é subconsulta de `SUM`. O teste confirma
   pelo `PRAGMA table_info(item_costs)` que `on_hand_base_units` não existe mais
   (`src/data/repository.test.ts:600-604`): *"a mutable stock column is exactly what
   foundation 1 forbids"*. A coluna existiu (`src/data/db.ts:52`) e foi derrubada por
   migração (`src/data/db.ts:279`).
2. **`locationId` é opcional e o padrão é a empresa inteira** (`src/data/repository.ts:130-145`):
   *"O padrão continua sendo a empresa toda, e não é preguiça: quem tem um lugar só
   nunca deve ver um filtro de lugar. A pergunta 'qual sala?' só existe onde existe mais
   de uma."* O defeito que ela fechou: *"com a polpa dividida entre a fábrica e a câmara
   fria, o almoxarifado dizia '34 kg' enquanto quem estava no tacho tinha 20 na mão."*
3. **`LEFT JOIN item_costs`**: item sem nota tem `averageRate` 0, não desaparece.

O teste `'the storeroom answers for one room when asked, and for the company when not'`
prende as três respostas e a soma (`src/data/repository.test.ts:1621-1660`): a empresa
não muda com a transferência, cada sala responde por si, e
`naFabrica + naFria === total`.

#### `findItem` — um item, incluindo inativo

```ts
export async function findItem(
  companyId: string,
  itemId: string,
  locationId?: string,
): Promise<ItemWithCost | null>
```
(`src/data/repository.ts:3577-3595`)

Não tem SQL próprio: chama `listItems(companyId, undefined, true, locationId)` e filtra
em memória (`:3593-3594`). O `true` é decisão escrita: *"Includes the inactive: the
screen that offers to reactivate an item has to be able to open it"* (`:3591-3592`).

O parâmetro `locationId` tem a cicatriz mais cara do arquivo
(`src/data/repository.ts:3580-3588`):

> *"Sem ela o saldo é o da empresa — e era esse o defeito: a tela de detalhe mostrava o
> total da empresa e a contagem escrevia a diferença contra o almoxarifado. Com a polpa
> dividida entre a fábrica e a câmara fria, contar a prateleira TELEPORTAVA estoque: a
> diferença saía de um número maior e era gravada num lugar menor, com o operador tendo
> feito tudo certo."*

O teste `'the shelf a screen shows is the shelf a count is compared against'`
(`src/data/repository.test.ts:1266-1315`) fixa os três números com 50.000 g de açúcar e
6.000 na câmara: sem sala → 50.000; com a fábrica → 44.000; com a câmara → 6.000
(`:1283-1286`). E `src/layers.test.ts:283-368` é uma guarda de **fonte** que exige que a
tela passe a sala, porque *"um teste de `recordCount` passa nos dois mundos"*
(`src/layers.test.ts:295-299`).

#### `itemCosts` — o custo de todo item, na forma que o motor de receita espera

```ts
export async function itemCosts(companyId: string): Promise<ItemCosts>
```
(`src/data/repository.ts:278-285`) — *"Cost of every item, in the shape the recipe engine
expects"* (`:277`).

```sql
SELECT item_id, average_rate FROM item_costs WHERE company_id = ?
```

Devolve `Object.fromEntries` de `[item_id, average_rate as Rate]` (`:284`). O tipo
`ItemCosts` vem de `src/domain/recipe.ts` e é consumido por `costRecipe`
(`src/domain/recipe.ts:128`, `:152`).

O teste `'the rate survives storage at full precision, not rounded to a cent'`
(`src/data/repository.test.ts:305-318`) confirma que 10.000 g por R$ 124 volta como
`rate(12.4, 1_000)` = 1,24 centavo por grama — *"Stored as an integer this is the bug
that once cost the engine 19% of the pulp and all of the mix"* (`:315-316`).

#### `itemHistory` — tudo o que um insumo já passou de preço

```ts
export async function itemHistory(
  companyId: string,
  itemId: string,
  limit = 24,
): Promise<PriceMoveRow[]>
```
(`src/data/repository.ts:3527-3551`)

`PriceMoveRow = { previousRate: Rate | null; newRate: Rate; observedAt: string }`
(`:3513-3517`).

```sql
SELECT previous_rate, new_rate, observed_at
  FROM item_cost_history
 WHERE company_id = ? AND item_id = ?
 ORDER BY observed_at DESC
 LIMIT ?
```

Docblock (`:3519-3526`): *"The price history is not a feature anybody maintains - it is
the by-product of buying, written by `recordPurchase` on the way past. This is the query
that finally shows it, which is what turns 'trust me, it went up' into something the
person can look at."*

Diferente de `recentCostChanges`, esta **não** filtra `previous_rate IS NOT NULL`: a
primeira linha (o preço que o item ganhou ao ser comprado pela primeira vez) aparece.

#### `recentCostChanges` — o que mudou de preço, para a capa

```ts
export async function recentCostChanges(companyId: string, limit = 5): Promise<CostChange[]>
```
(`src/data/repository.ts:2046-2071`)

`CostChange = { itemId; name; previousRate: Rate | null; newRate: Rate; observedAt }`
(`:2031-2037`).

```sql
SELECT h.item_id, i.name, h.previous_rate, h.new_rate, h.observed_at
  FROM item_cost_history h
  JOIN items i ON i.id = h.item_id
 WHERE h.company_id = ? AND h.previous_rate IS NOT NULL
 ORDER BY h.observed_at DESC
 LIMIT ?
```

O `previous_rate IS NOT NULL` é o filtro que separa "mudou" de "nasceu". O docblock diz
por que a peça existe (`:2039-2045`): *"a home screen that only shows totals says
nothing, because the owner already knows roughly what they are. What they do not know is
what moved since they last looked."*

O teste (`src/data/repository.test.ts:299-302`) faz duas compras e verifica
`history.length === 1` — *"only the move that had something to move from"*. A capa pede
12 (`app/(tabs)/index.tsx:161`); o assistente pede 5 (`src/assistant/skills.ts:150`).

#### `lastCostMove` — **implementada, ZERO chamadores**

```ts
export async function lastCostMove(
  companyId: string,
  itemIds: readonly string[],
): Promise<string | null>
```
(`src/data/repository.ts:3389-3410`)

```sql
SELECT observed_at
  FROM item_cost_history
 WHERE company_id = ?
   AND item_id IN (?, ?, ...)
   AND previous_rate IS NOT NULL
   AND previous_rate <> new_rate
 ORDER BY observed_at DESC
 LIMIT 1
```

Curto-circuita em `itemIds.length === 0 → null` (`:3393`). Monta os `?` com
`itemIds.map(() => '?').join(', ')` (`:3396`) — a única interpolação, e só de
interrogações.

Docblock (`:3377-3387`): *"'Estável há doze dias' is a conclusion, and this is the fact
under it. Only a row where the rate MOVED counts: `item_cost_history` also records the
first price an item ever had... Returns null when no item in the list has ever moved.
The screen says that in words; a repository does not invent a date to fill a sentence."*

**Marcação de estado: implementada, sem chamador nenhum** — não há tela, não há
assistente, não há teste. É o exemplo mais puro da doença que o `CLAUDE.md` nomeia no
portão P1 ("Quem chama isto no mesmo commit?"). O predicado
`previous_rate <> new_rate` é único no arquivo e não é exercido por nada.

#### `labels` — nomes de itens e receitas, num só dicionário

```ts
export async function labels(companyId: string): Promise<Record<string, string>>
```
(`src/data/repository.ts:1225-1234`) — *"Names for every item and recipe, so a cost
breakdown reads in words"* (`:1224`).

```sql
SELECT id, name FROM items WHERE company_id = ?
UNION ALL
SELECT id, name FROM recipes WHERE company_id = ?
```

`UNION ALL` e não `UNION`: id de item e id de receita nunca colidem, e `ALL` evita o
`DISTINCT`. É usada em três papéis distintos:

1. pelas telas de custo, como dicionário para `costRecipe` (`src/domain/recipe.ts:129`);
2. por `listProducts` para resolver nomes de embalagem (`src/data/repository.ts:1847`);
3. como consulta de **caminho de falha**: `recordProduction` só a chama quando a corrida
   já vai ser recusada, para o erro poder dizer "Polpa de morango" em vez de um uuid
   (`src/data/repository.ts:1457-1463`), e `recordLoss` faz o mesmo (`:2120`).

#### `purchaseToBaseUnits` — função pura, sem SQL

```ts
export function purchaseToBaseUnits(item: Item, purchaseQuantity: number): number {
  const factor = item.purchaseToBase ?? 1;
  return Math.round(purchaseQuantity * factor);
}
```
(`src/data/repository.ts:1237-1240`)

*"Converts what the buyer typed into base units, using the item's own factor"* (`:1236`).
Fator ausente vale 1. O `Math.round` está aqui porque `quantity_base_units` é `INTEGER`.
O teste `'what the buyer typed becomes base units through one rule, not two'`
(`src/data/repository.test.ts:749`) existe justamente para não haver uma segunda regra
na tela.

#### `runningOut` — o que vai acabar, com a conta aberta

```ts
export async function runningOut(
  companyId: string,
  fromIso: string,
  toIso: string,
  days: number,
  horizon = 7,
  locationId?: string,
  kinds: readonly ItemKind[] = ['input', 'packaging'],
): Promise<Running[]>
```
(`src/data/repository.ts:3790-3806`)

`Running = { itemId; name; baseUnit; onHandBaseUnits; dailyOutflow; daysLeft }`
(`:3766-3773`).

**SQL** (`:3815-3826`):

```sql
SELECT i.id AS item_id, i.name, i.base_unit,
       COALESCE((SELECT SUM(m.quantity_base_units) FROM movements m
                  WHERE m.company_id = i.company_id AND m.item_id = i.id
                    AND (? IS NULL OR m.location_id = ?)), 0) AS on_hand,
       COALESCE((SELECT -SUM(m.quantity_base_units) FROM movements m
                  WHERE m.company_id = i.company_id AND m.item_id = i.id
                    AND m.quantity_base_units < 0
                    AND (? IS NULL OR m.location_id = ?)
                    AND m.occurred_at >= ? AND m.occurred_at < ?), 0) AS out_units
  FROM items i
 WHERE i.company_id = ? AND i.active = 1
   AND i.kind IN (?, ?, ...)
```

Dois pares de `locationId` — *"um para o saldo, outro para a saída"* (`:3828`) — e a
lista de `?` de `kinds` interpolada só como interrogações (`:3826`).

**A aritmética, em TypeScript e não em SQL** (`:3840-3854`):

```
dailyOutflow = out_units / days
daysLeft     = daysOfCover(on_hand, dailyOutflow)
descarta se daysLeft === null || daysLeft > horizon
ordena por daysLeft crescente
```

`daysOfCover` é aritmética pura (`src/domain/ledger.ts:172-175`):

```ts
export function daysOfCover(baseUnits: number, dailyOutflow: number): number | null {
  if (dailyOutflow <= 0) return null;
  return baseUnits / dailyOutflow;
}
```

`null` quando não há saída, e é isso que faz insumo parado nunca alarmar
(`src/data/repository.ts:3783-3785`): *"Insumo parado não aparece. Sem saída não há data
de acabar, e inventar uma seria exatamente o alerta inventado que o briefing proíbe."*

O teste prova que a conta é abrível — `|daysLeft − onHand/dailyOutflow| < 1e-9`,
*"os dias são o saldo sobre a saída diária, e a tela pode abrir essa conta"*
(`src/data/repository.test.ts:2366-2371`) — e que sem saída na janela a lista é vazia
(`:2328`). O segundo teste (`:2752-2845`) prova os dois recortes: açúcar parado numa loja
não acaba naquela loja (`:2799-2803`), e `kinds: ['packaging']` devolve só palito
(`:2833-2838`).

Chamadores usam `horizon` de duas formas: a capa passa o padrão implícito de 7 dias
(`app/(tabs)/index.tsx:168`) e também `Number.POSITIVE_INFINITY` para a lista completa
(`:175`, `app/(tabs)/reports.tsx:80`, `src/notify/facts.ts:37`).

---

### 11.7 Locais, saldo por lugar e o lugar padrão

#### `defaultLocationId` — função pura de uma linha

```ts
export function defaultLocationId(companyId: string): string {
  return companyId;
}
```
(`src/data/repository.ts:843-845`)

O id do lugar padrão **é** o id da empresa. Docblock (`:836-842`): *"Enquanto há um lugar
só, o id dele é o da própria empresa - foi assim que todo movimento já gravado foi
carimbado. Expor isto é o que permite exigir `locationId` de quem conta sem obrigar cada
tela a saber desse detalhe."*

O determinismo é decisão de sincronização (`src/data/repository.ts:508-511`): *"the
default carries the company's own id - deterministic, so two phones that create it in the
same minute create one row rather than two."* A migração do aparelho cria a linha com o
mesmo id (`src/data/db.ts:264-268`).

#### `ensureLocation` — privada, garante a linha antes de qualquer movimento

```ts
async function ensureLocation(conn: Db, companyId: string): Promise<string>
```
(`src/data/repository.ts:847-865`)

Lê `SELECT id FROM locations WHERE id = ?` e, se não achar, insere
`(companyId, companyId, '', 'store_room', nowIso())` e enfileira (`:854-862`). É chamada
por `listPlaces` (`:596`) — a única **leitura** que também escreve —, e pelos escritores
`recordPurchase` (`:374`), `recordCount` (`:942`), `recordProduction` (`:1489`),
`moveBetween` (`:1710`), `recordLoss` (`:2109`), `openProductionRun` (`:2279`) e
`recordReading` (`:2790`).

O comentário explica a ordem de enfileiramento (`:859-862`): *"It has to reach the server
before the movement that stands on it does, or the first sync fails a foreign key on a
row nobody knew was missing."*

#### `listPlaces` — os lugares, com a ficha de acordo dentro

```ts
export async function listPlaces(companyId: string): Promise<Place[]>
```
(`src/data/repository.ts:594-620`)

`Place` (`:565-585`):

| Campo | Tipo | Coluna | Nota |
|---|---|---|---|
| `id` | `string` | `locations.id` | |
| `name` | `string` | `locations.name` | vazio no padrão, de propósito |
| `kind` | `string` | `locations.kind` | texto no aparelho; `location_kind` no servidor |
| `isDefault` | `boolean` | derivado | `r.id === defaultLocationId(companyId)` (`:614`) |
| `contactPhone` | `string` | `contact_phone` | `?? ''` (`:615`) |
| `deliveryDays` | `number` | `delivery_days` | bitmask, bit 0 no domingo; zero = sem acordo (`:573`) |
| `agreementNote` | `string` | `agreement_note` | `?? ''` (`:617`) |
| `sensorRanges` | `Record<string, SensorRange>` | `sensor_ranges` (JSON) | via `parseSensorRanges` |

```sql
SELECT id, name, kind, contact_phone, delivery_days, agreement_note, sensor_ranges
  FROM locations WHERE company_id = ? ORDER BY kind, name
```

Os valores de `kind` que o servidor aceita são um enum de seis
(`supabase/migrations/0001_foundation.sql:109`):

```
'factory' | 'cold_room' | 'store_room' | 'own_store' | 'customer' | 'vehicle'
```

Destes, três são "nossos" e estão em `INTERNAL_PLACE_KINDS = ['factory', 'cold_room',
'store_room']` (`src/domain/ledger.ts:68`). A guarda `src/layers.test.ts:382-399` extrai
todo `l.kind IN (...)` de `src/data/repository.ts` e compara com essa constante, porque
*"dentro de uma string de SQL a constante não entra"* (`src/layers.test.ts:375-377`).

`SensorRange = { min: number | null; max: number | null; unit: string }`
(`src/data/repository.ts:2717`). O docblock defende o vazio como resposta
(`:2709-2715`): *"Sem faixa, a leitura é registrada e não julga nada — que é a resposta
certa: o aplicativo não sabe qual é a temperatura boa da câmara de outra pessoa, e chutar
-18 porque é o número comum de freezer seria inventar o que ele não mediu."*

`parseSensorRanges` (`:2727-2748`) é leitura tolerante: JSON inválido → `{}`; array →
`{}`; entrada sem `unit` string não vazia → ignorada; `min`/`max` não finitos → `null`.
*"Faixa que não pôde ser lida vira 'não julgo' em vez de vira alarme aleatório"*
(`:2723-2725`).

O teste `'the agreement sheet is kept, corrected and queued for the server'`
(`src/data/repository.test.ts:2701-2750`) fixa a semântica do bitmask com número
literal: `deliveryDays: 4 | 32` (terça e sexta) volta como **36** (`:2706-2709`), e
sobrevive a um `savePlace` que só manda o nome (`:2718-2722`).

#### `balanceByLocation` — quanto tem de um item em cada lugar

```ts
export async function balanceByLocation(
  companyId: string,
  itemId: string,
): Promise<LocationBalance[]>
```
(`src/data/repository.ts:537-563`)

`LocationBalance = { locationId; locationName; kind; baseUnits }` (`:513-519`).

```sql
SELECT m.location_id, l.name, l.kind, SUM(m.quantity_base_units) AS base_units
  FROM movements m
  JOIN locations l ON l.id = m.location_id
 WHERE m.company_id = ? AND m.item_id = ?
 GROUP BY m.location_id, l.name, l.kind
 ORDER BY l.kind, l.name
```

Três decisões escritas (`src/data/repository.ts:521-536`):

1. **É a mesma aritmética da view do servidor**, de propósito: *"A mesma aritmética da
   view `stock_balances` do servidor, de propósito (`0001_foundation.sql:253-260`): as
   duas pontas respondem 'quanto tem aqui' pela mesma soma, que é o que a checagem 6 da
   `db:verify` compara."*
2. **Local vira `GROUP BY`, nunca `WHERE` obrigatório**: *"a tela que quer o total não
   passa a precisar saber de lugar nenhum."*
3. **Devolve só os lugares com movimento**, e a diferença importa: *"um lugar onde nunca
   entrou nada não tem saldo zero, não tem saldo... '0 kg' convida a conferir, uma
   ausência não."*

**Não descarta soma zero** — só ausência de movimento. A tela sabe disso e comenta
(`app/inputs/[id].tsx:182`).

O teste `'the balance splits by place, and the company total does not move'`
(`src/data/repository.test.ts:897-939`) faz duas pernas de 6.000 g e prova o invariante
central: `inCold + inStoreroom === after.onHandBaseUnits`, com o comentário *"the places
add up to the company - that is what makes both queries one arithmetic"* (`:934-938`).

**Chamador único: `app/inputs/[id].tsx:147`.**

#### `stockByPlace` — o saldo de cada lugar, item por item, com dinheiro

```ts
export async function stockByPlace(companyId: string): Promise<PlaceStock[]>
```
(`src/data/repository.ts:781-834`)

`PlaceStock` (`:754-767`):

```ts
{
  locationId: string;
  locationName: string;
  kind: string;
  valueCents: Cents;           // "Quanto vale tudo o que está ali, somado uma vez só, no fim"
  lines: { itemId; name; baseUnits; baseUnit; valueCents }[];
}
```

```sql
SELECT m.location_id, l.name AS location_name, l.kind,
       m.item_id, i.name AS item_name, i.base_unit,
       SUM(m.quantity_base_units) AS base_units,
       c.average_rate AS rate
  FROM movements m
  JOIN locations l ON l.id = m.location_id
  JOIN items i ON i.id = m.item_id
  LEFT JOIN item_costs c ON c.item_id = m.item_id
 WHERE m.company_id = ?
 GROUP BY m.location_id, l.name, l.kind, m.item_id, i.name, i.packaging, i.base_unit, c.average_rate
HAVING SUM(m.quantity_base_units) <> 0
 ORDER BY l.kind, l.name, i.name
```

Note o `HAVING ... <> 0` (e não `> 0`): saldo negativo aparece. Docblock (`:776-779`):
*"Linha de saldo zero não aparece. Um item que entrou e saiu inteiro não está ali, e
listá-lo como '0 g' enche a tela de coisa que não está lá - o que é pior que inútil numa
tela cujo trabalho é dizer o que tem."*

**Onde o dinheiro arredonda:** a agregação em memória (`:808-833`) faz
`const value = cents((r.rate ?? 0) * r.base_units)` com o comentário *"Taxa fracionária
vezes quantidade, arredondada aqui e só aqui"* (`:821-822`), e depois
`place.valueCents = cents(place.valueCents + value)` (`:830`). `cents()` é
`Math.round` (`src/domain/money.ts:7-9`).

O docblock diz que é a mesma soma de `balanceByLocation` sem o `WHERE` do item
(`:772-775`): *"uma tela que pergunta 'o que tem na Loja Centro' e uma que pergunta 'onde
está o açúcar' são a mesma aritmética lida por dois eixos, e ter duas aritméticas seria
ter duas verdades."*

Dois testes fixam isso. `'the places add up to the company, in quantity and in money'`
(`src/data/repository.test.ts:2183-2213`) percorre todo item com saldo e exige que a soma
dos lugares seja igual ao total da empresa. `'a place that was emptied is absent, not
zero'` (`:2215-2240`) manda 6.000 g e traz de volta, verifica que a loja **não aparece**
na lista, e que os quatro movimentos continuam no razão.

Um terceiro teste é o que fecha o buraco de dinheiro: `'a manufactured product is worth
what it cost to make, everywhere it is'` (`:3205-3246`) produz 500 unidades, transfere
para a loja e exige `naLoja.valueCents === Math.round(corrida.unitCostRate * 500)` — o
comentário diz *"a loja vale o que a carga custou para fazer, não R$ 0,00"* (`:3243`).

#### `lastSentBaseUnits` — o palpite do próximo carregamento

```ts
export async function lastSentBaseUnits(
  companyId: string,
  itemId: string,
  toLocationId: string,
): Promise<number | null>
```
(`src/data/repository.ts:718-733`)

```sql
SELECT quantity_base_units AS q FROM movements m
 WHERE company_id = ? AND item_id = ? AND location_id = ?
   AND kind = 'transfer' AND quantity_base_units > 0
   AND NOT EXISTS (SELECT 1 FROM movements rev
                    WHERE rev.reverses_movement_id = m.id
                      AND rev.company_id = m.company_id)
 ORDER BY occurred_at DESC, recorded_at DESC LIMIT 1
```

Docblock (`:707-717`): *"Lei 1: não se pergunta o que o sistema pode deduzir, e Lei 2:
nenhum campo nasce vazio. A primeira remessa de um produto para uma loja não tem palpite
nenhum, e é honesto que não tenha - mas da segunda em diante o livro-razão já sabe, e quem
carrega a caixa confirma em vez de digitar. Lê a perna de **entrada** no destino, e não a
saída na origem, porque é a quantidade que aquela loja recebeu que responde 'quanto costuma
ir para lá'."*

O teste (`src/data/repository.test.ts:2242-2276`) prova as três coisas: `null` antes de
qualquer envio — *"A field pre-filled with zero would be a lie dressed as helpfulness"*
(`:2248-2250`) —, a mais recente (4.000, não 6.000) e por lugar (outra loja → `null`).
O comentário explica por que a perna positiva: *"reading the leaving leg instead would
hand the screen a negative number that the button then refuses in silence"* (`:2267-2269`).

---

### 11.8 Movimentos: o `[por quê?]` de um saldo

#### `itemMovements`

```ts
export async function itemMovements(
  companyId: string,
  itemId: string,
  limit = 20,
  locationId?: string,
): Promise<MovementRow[]>
```
(`src/data/repository.ts:987-1037`)

`MovementRow` (`:480-500`):

| Campo | Tipo | Origem | Nota |
|---|---|---|---|
| `id` | `string` | `m.id` | |
| `kind` | `string` | `m.kind` | tipo aberto aqui; no servidor é enum (ver abaixo) |
| `baseUnits` | `number` | `m.quantity_base_units` | *"Signed, in base units: positive arrived, negative left"* |
| `unitCostRate` | `Rate \| null` | `m.unit_cost_rate` | *"What one base unit was worth when it moved, frozen"* |
| `note` | `string \| null` | `m.note` | |
| `occurredAt` | `string` | `m.occurred_at` | |
| `groupId` | `string \| null` | `m.movement_group_id` | *"Nulo aqui quer dizer exatamente uma coisa na tela: esta linha não tem como ser desfeita, e é melhor não oferecer do que oferecer e falhar"* (`:489-496`) |
| `reversed` | `boolean` | `EXISTS(...)` | *"Estorno não se faz duas vezes"* (`:498`) |

```sql
SELECT m.id, m.kind, m.quantity_base_units, m.unit_cost_rate, m.note, m.occurred_at,
       m.movement_group_id,
       EXISTS (SELECT 1 FROM movements r
                WHERE r.reverses_movement_id = m.id AND r.company_id = m.company_id) AS reversed
  FROM movements m
 WHERE m.company_id = ? AND m.item_id = ?
   AND (? IS NULL OR m.location_id = ?)
 ORDER BY m.occurred_at DESC, m.rowid DESC
 LIMIT ?
```

Aqui o `EXISTS` é **coluna** e não filtro: a linha estornada aparece, marcada. O desempate
é `m.rowid DESC` — o único uso de `rowid` no arquivo — porque dois movimentos no mesmo
instante precisam de ordem estável.

Docblock (`:980-986`): *"This is the `[por quê?]` of a stock figure. A number the person
cannot open is a number they have to take on faith, and faith is exactly what an app
asking someone to change how they run their factory has not earned yet."*

O `locationId` tem a mesma cicatriz de `findItem` (`:991-997`): *"uma tela que mostra o
saldo de uma sala dizendo 'conferido em 3/9' com a conferência de OUTRA sala está afirmando
que a prateleira daqui foi olhada quando ninguém a olhou."* O teste prova as duas metades:
a conferência da câmara aparece na câmara e **não** aparece na fábrica
(`src/data/repository.test.ts:1303-1314`).

#### Os valores de `kind` que a leitura pode devolver

O aparelho grava `movements.kind` como `TEXT NOT NULL` sem `CHECK`
(`src/data/db.ts:228`). O servidor tem enum, e a lista completa é
`'production' | 'consumption' | 'transfer' | 'sale' | 'loss' | 'return' | 'adjustment' |
'discrepancy' | 'reversal'` (`supabase/migrations/0001_foundation.sql:172-175`) mais
`'purchase'`, acrescentado depois (`supabase/migrations/0007_movement_kind_purchase.sql:16`).

Quem escreve cada um, neste arquivo:

| `kind` | Escritor | Linha | Sinal |
|---|---|---|---|
| `purchase` | `recordPurchase` | `:406` | positivo |
| `adjustment` | `recordCount` | `:949` | assinado (diferença) — pode ser zero |
| `production` | `recordProduction` | `:1606` | positivo |
| `consumption` | `recordProduction` | `:1608` | negativo |
| `transfer` | `recordTransfer` → `moveBetween` | `:1741-1742` | duas pernas |
| `return` | `recordReturn` → `moveBetween` | `:1741-1742` | duas pernas |
| `loss` | `recordLoss` | `:2137` | negativo |
| `discrepancy` | `recordCheck` | `:2496` | assinado — pode ser zero |
| `reversal` | `reverseGroup` | `:4484` | oposto do original |
| `sale` | **NENHUM ESCRITOR** | — | existe no enum e nada grava |

`loss_reason` é enum de cinco no servidor
(`supabase/migrations/0001_foundation.sql:177`) e tipo no domínio
(`src/domain/ledger.ts:46`): `'melted' | 'broken' | 'expired' | 'courtesy' |
'internal_use'`.

`post` é enum de quatro (`supabase/migrations/0001_foundation.sql:179`):
`'picked' | 'loaded' | 'delivered' | 'checked'`. **Só `'checked'` é escrito** — por
`recordCheck` (`src/data/repository.ts:2496`) — e só ele é lido, por `unchecked`
(`:2540`) e `shipmentsOn` (`:3326`). Os outros três postos de controle:
**NÃO IMPLEMENTADO** na camada de dados.

---

### 11.9 Receitas

#### `listRecipes`

```ts
export async function listRecipes(companyId: string): Promise<RecipeSummary[]>
```
(`src/data/repository.ts:1043-1061`)

`RecipeSummary = { id; name; yieldAmount: number; yieldUnit: string }` (`:1041`).

```sql
SELECT id, name, yield_amount, yield_unit FROM recipes
 WHERE company_id = ? AND active = 1 ORDER BY name COLLATE NOCASE
```

Filtra `active = 1`. Duas versões da mesma receita continuam sendo **uma** linha aqui —
o teste fixa: `assert.equal((await listRecipes(CO)).length, 1, 'two versions are still one
recipe')` (`src/data/repository.test.ts:349`).

#### `loadRecipeGraph` — todas as receitas na versão mais nova, em duas consultas

```ts
export async function loadRecipeGraph(companyId: string): Promise<Record<string, Recipe>>
```
(`src/data/repository.ts:1068-1128`)

Docblock (`:1063-1067`): *"Loads every recipe at its newest version, keyed by id - the
shape `costRecipe` walks. Loading them all at once is what lets a sub-recipe resolve
without a second round trip mid-calculation."*

**Consulta 1 — as versões** (`:1080-1086`):

```sql
SELECT v.id, v.recipe_id, v.version, v.effective_from, v.loss_fraction, r.yield_amount,
       r.yield_unit
  FROM recipe_versions v
  JOIN recipes r ON r.id = v.recipe_id
 WHERE v.company_id = ?
   AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2 WHERE v2.recipe_id = v.recipe_id)
```

Curto-circuito: `if (versions.length === 0) return {};` (`:1089`) — sem isso a segunda
consulta rodaria para nada.

**Consulta 2 — as linhas, todas de uma vez** (`:1097-1098`):

```sql
SELECT recipe_version_id, item_id, sub_recipe_id, quantity
  FROM recipe_lines WHERE company_id = ? ORDER BY position
```

Note que a consulta 2 **não filtra por versão**: traz as linhas de todas as versões,
inclusive as antigas, e o agrupamento em memória por `recipe_version_id` (`:1102-1111`)
só usa as que interessam. O `ORDER BY position` preserva a ordem que a tela mostra.

**A montagem** decide o tipo de cada linha pela presença de `item_id` (`:1105-1109`):

```ts
line.item_id
  ? { kind: 'item', itemId: line.item_id, quantity: line.quantity }
  : { kind: 'recipe', recipeId: line.sub_recipe_id!, quantity: line.quantity }
```

O esquema garante que exatamente um dos dois está preenchido, por `CHECK ((item_id IS
NULL) <> (sub_recipe_id IS NULL))` (`src/data/db.ts:95`) — é por isso que o `!` é
seguro.

O objeto final (`:1113-1127`) satisfaz `Recipe` de `src/domain/recipe.ts` e carrega
`versionId`, `version`, `effectiveFrom`, `yieldAmount`, `yieldUnit`, `lossFraction` e
`lines`. O `versionId` é o que `recordProduction` grava no lote (`:1519`) e
`openProductionRun` grava na corrida (`:2292`).

O teste `'saving a recipe twice keeps both versions and reads back the newest'`
(`src/data/repository.test.ts:320-350`) verifica `recipe.version === 2`,
`lossFraction === 0.04` e `quantity === 3_500` — a versão 1 tinha 3.000 e
`lossFraction` 0,02. E `'a sub-recipe survives the round trip through the database'`
(`:352-388`) monta uma sub-receita, custa pelo `costRecipe` real e exige
`cost.lines[0].label === 'Base'` — provando que o grafo e o dicionário de `labels` se
encaixam.

#### `recipesUsingItem` — quem depende deste insumo, na versão mais nova

```ts
export async function recipesUsingItem(
  companyId: string,
  itemId: string,
): Promise<{ id: string; name: string; quantity: number }[]>
```
(`src/data/repository.ts:3559-3575`)

É a única função de leitura que **devolve o resultado do driver direto**, sem mapear:
`return conn.getAllAsync<...>(...)` (`:3564`). Como as colunas já se chamam `id`, `name`
e `quantity`, não há `snake_case` para traduzir.

```sql
SELECT r.id, r.name, l.quantity
  FROM recipe_lines l
  JOIN recipe_versions v ON v.id = l.recipe_version_id
  JOIN recipes r ON r.id = v.recipe_id
 WHERE l.company_id = ? AND l.item_id = ?
   AND v.version = (SELECT MAX(v2.version) FROM recipe_versions v2
                     WHERE v2.recipe_id = v.recipe_id)
 ORDER BY r.name COLLATE NOCASE
```

Docblock (`:3553-3558`): *"It answers the question that decides whether a price move
matters: sugar going up 9% is a headline only if eight flavours use it."*

Não filtra `recipes.active` — receita desativada que use o insumo ainda aparece.

---

### 11.10 Produtos e a grade de cadastro

#### `listProducts`

```ts
export async function listProducts(companyId: string): Promise<Product[]>
```
(`src/data/repository.ts:1818-1863`)

`Product` (`:1774-1816`):

| Campo | Tipo | Coluna | Nota |
|---|---|---|---|
| `id` | `string` | `products.id` | |
| `itemId` | `string` | `products.item_id` | um produto **é** um item |
| `name` | `string` | `items.name` (via JOIN) | o nome mora no item, não no produto |
| `recipeId` | `string \| null` | `products.recipe_id` | *"`null` for resale: a resale product has no recipe, only a purchase cost"* (`:1778`) |
| `yieldPerUnit` | `number \| null` | `yield_per_unit` | *"How much of the batch becomes one unit. 75 ml per popsicle"* (`:1780`) |
| `unitPackagingCents` | `Cents` | `unit_packaging_cents` | o que a embalagem custa e **não** está em `packagingItems` (`:1782-1789`) |
| `packagingItems` | `{ itemId; name; quantityPerUnit }[]` | `packaging_items` (JSON) | nome resolvido pelo catálogo |
| `shelfLifeDays` | `number \| null` | `shelf_life_days` | *"Nulo: não vence"* (`:1800`) |
| `packaging` | `PackagingHierarchy` | `items.packaging` | |
| `lineId` / `typeId` / `flavorId` | `string \| null` | `line_id` / `type_id` / `flavor_id` | *"Nulo é caso legítimo, e não migração pendente"* (`:1808-1812`) |

```sql
SELECT p.id, p.item_id, i.name, p.recipe_id, p.yield_per_unit,
       p.unit_packaging_cents, p.shelf_life_days, i.packaging,
       p.packaging_items, p.line_id, p.type_id, p.flavor_id
  FROM products p
  JOIN items i ON i.id = p.item_id
 WHERE p.company_id = ? AND p.active = 1
 ORDER BY i.name COLLATE NOCASE
```

**Faz uma segunda consulta**: `const catalogo = await labels(companyId)` (`:1847`), para
`parsePackagingItems` resolver os nomes (`:1861`). O comentário explica (`:1844-1846`):
*"O nome de cada embalagem vem do catálogo, não da lista: a lista guarda id e quantidade,
e quem fala português é a tela. Um nome copiado para dentro do JSON viraria um segundo
nome do mesmo item, desatualizado no dia seguinte."*

`parsePackagingItems` (`:105-126`) é tolerante: JSON inválido → `[]`; não-array → `[]`;
entrada não-objeto → ignorada; `itemId` não-string ou `quantityPerUnit` não-número →
ignorada; quantidade não finita ou ≤ 0 → ignorada; nome ausente no catálogo → cai para o
próprio `itemId` (`:123`). O motivo da tolerância (`:80-82`): *"Linha quebrada é ignorada
em vez de derrubar a tela. Uma corrida que não consome o palito é um erro de inventário;
uma tela de produção que não abre é a fábrica parada."*

`normalizePackagingItems` (`:91-103`) é a metade de **escrita** desse par, exportada mas
com **um só chamador interno** (`saveProduct`, `:1955`). Soma linhas repetidas do mesmo
item num `Map` e lança em quantidade ≤ 0 ou não finita (`:97-99`). O motivo escrito
(`:84-90`): *"O mesmo item duas vezes é erro de digitação e não receita exótica - somar as
duas linhas é o que a tela de receita já faz com o mesmo insumo repetido, pelo mesmo
motivo: ninguém pediu dois palitos por picolé, alguém tocou duas vezes."*

`listProducts` é usada como leitura de apoio por dois escritores:
`recordProduction` (`:1351`) e `openProductionRun` (`:2268`) buscam o produto nela e
lançam se não acharem — `'produto X não existe'` (`:1352`, `:2269`) ou
`'X é revenda: não se produz'` (`:1353`, `:2270`).

#### `listLines`, `listCategories`, `listTypes`, `listFlavors` — a grade em QUATRO níveis opcionais

> **Eram três até 11 de setembro.** A categoria entrou entre o produto e o tipo por
> decisão do dono (*"Produto - Categoria… Tipo… Variação… e tb o produto nao
> necessariamente requeira todas as subclasses"*), porque "tipo" carregava duas
> naturezas: Leite/Água/Skimo têm receita própria, 250 e 500 ml são só tamanho. Ver
> `0057`, e a `0058` ao lado — a opcionalidade que este título afirma era falsa no
> banco desde a `0018`.

```ts
export type ProductLine = { id: string; name: string; sort: number };
export type ProductType = { id: string; lineId: string; name: string; sort: number };
export type Flavor      = { id: string; name: string; sort: number };
```
(`src/data/repository.ts:3637-3639`)

O docblock explica a forma (`:3625-3636`):

> *"Os três níveis são opcionais de propósito. Uma fábrica que faz um doce só não deve ser
> obrigada a inventar uma linha e um tipo para cadastrá-lo... O sabor é da empresa e não
> do tipo. Morango é o mesmo morango no picolé e no pote; amarrá-lo ao tipo faria o dono
> cadastrar morango uma vez por tipo, e na primeira correção de nome ele teria seis
> morangos diferentes no relatório."*

| Função | Linha | SQL |
|---|---|---|
| `listLines(companyId)` | 3641-3650 | `SELECT id, name, sort FROM product_lines WHERE company_id = ? AND active = 1 ORDER BY sort, name COLLATE NOCASE` |
| `listTypes(companyId, lineId?)` | 3652-3666 | `SELECT id, line_id, name, sort FROM product_types WHERE company_id = ? AND active = 1` + `' AND line_id = ?'` quando `lineId` vem + `ORDER BY sort, name COLLATE NOCASE` |
| `listFlavors(companyId)` | 3668-3677 | `SELECT id, name, sort FROM flavors WHERE company_id = ? AND active = 1 ORDER BY sort, name COLLATE NOCASE` |

`listTypes` é a **única** leitura do arquivo que concatena um pedaço de cláusula
condicionalmente: `${lineId ? ' AND line_id = ?' : ''}` (`:3661`), com o array de
parâmetros trocado junto (`:3663`). Nenhum valor é interpolado.

`ORDER BY sort, name` em todas as três: a ordem que o dono definiu vem antes da
alfabética.

#### `assertTypeBelongsToLine` — leitura de validação, sem tela

```ts
export async function assertTypeBelongsToLine(
  companyId: string,
  lineId: string | null,
  typeId: string | null,
): Promise<void>
```
(`src/data/repository.ts:3751-3763`)

```sql
SELECT line_id FROM product_types WHERE id = ? AND company_id = ?
```

`if (!typeId) return;` (`:3756`) e depois `if (!row || row.line_id !== lineId) throw new
TypeIsFromAnotherLineError(typeId)` (`:3762`).

**Estado: implementada, sem chamador de tela** — só `saveProduct` (`:1936`). O docblock
diz por que mora aqui e não na tela (`:3734-3742`): *"No servidor isto é chave estrangeira
composta - o Postgres recusa sozinho. O SQLite do aparelho não aceita chave composta em
`ALTER TABLE ADD COLUMN`, então aqui a mesma garantia é imposta na escrita, e é por isso
que ela mora no repositório e não na tela: a tela é decoração, e o assistente grava pelo
mesmo caminho sem passar por ela."*

#### A leitura de colisão de grade, dentro de `saveProduct`

Não é função exportada, mas é uma consulta de leitura com semântica de produto
(`src/data/repository.ts:1961-1977`):

```sql
SELECT i.name FROM products p
  JOIN items i ON i.id = p.item_id
 WHERE p.company_id = ? AND p.active = 1 AND p.id <> ?
   AND COALESCE(p.line_id, '') = COALESCE(?, '')
   AND COALESCE(p.type_id, '') = COALESCE(?, '')
   AND COALESCE(p.flavor_id, '') = COALESCE(?, '')
 LIMIT 1
```

Reproduz em SQL exatamente o índice único do aparelho
(`src/data/db.ts:442-444`) — `coalesce(line_id,''), coalesce(type_id,''),
coalesce(flavor_id,'')` com `WHERE active = 1` —, e o faz **antes** de abrir a transação
para que a mensagem seja uma frase e não `"Error finalizing statement"` (`:1958-1960`).
`p.id <> ?` com `input.id ?? ''` (`:1972`) é o que deixa o produto se salvar sobre si
mesmo.

---

### 11.11 Produção e corridas abertas

#### `openProductionRuns` — os tachos rodando agora

```ts
export async function openProductionRuns(companyId: string): Promise<OpenRun[]>
```
(`src/data/repository.ts:2308-2340`) — *"Os tachos rodando agora. Vazio é o estado normal
de uma fábrica parada"* (`:2307`).

`OpenRun` (`:2232-2242`): `{ id; productId; productName; recipeId; recipeVersionId;
batches; locationId; openedAt }`, com `recipeVersionId` documentado como *"A ficha que
estava valendo quando o tacho foi carregado"* (`:2237`).

```sql
SELECT r.id, r.product_id, i.name, p.recipe_id, r.recipe_version_id,
       r.batches, r.location_id, r.opened_at
  FROM production_runs r
  JOIN products p ON p.id = r.product_id
  JOIN items i ON i.id = p.item_id
 WHERE r.company_id = ?
 ORDER BY r.opened_at
```

`production_runs` é **estado, não movimento** — a tabela guarda só o que está aberto, e
fechar ou cancelar apaga a linha (`src/data/db.ts:389-392`): *"corrida fechada guardada
aqui seria uma cópia de um fato que o razão já tem, e 'quanto saiu' precisa de uma resposta
só."* O DDL está em `src/data/db.ts:394-402`.

Esta leitura é a guarda contra fechar duas vezes: `closeProductionRun` a chama e lança
`RunGoneError` se não achar (`src/data/repository.ts:2383-2384`) — *"a segunda não acha a
corrida e levanta `RunGoneError` antes de escrever qualquer coisa"* (`:2362-2363`). O teste
`'two taps on close do not produce twice'` (`src/data/repository.test.ts:1175`) fixa.

A cicatriz de coluna vale registrar (`src/data/repository.ts:2281-2287`): a escrita gravava
`product.recipeId` na coluna `recipe_version_id`, e *"não quebrava nada visível porque
ninguém lia de volta"*. É esta leitura que passou a ler.

#### `productionOn` — o total do que saiu do tacho numa janela

```ts
export async function productionOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<ProducedInWindow[]>
```
(`src/data/repository.ts:2574-2596`)

`ProducedInWindow = { itemId; name; baseUnits }` (`:2548-2552`).

```sql
SELECT m.item_id, i.name, SUM(m.quantity_base_units) AS total
  FROM movements m
  JOIN items i ON i.id = m.item_id
 WHERE m.company_id = ?
   AND m.kind = 'production'
   AND m.occurred_at >= ?
   AND m.occurred_at < ?
   AND <NAO_ESTORNADO>
 GROUP BY m.item_id, i.name
HAVING total > 0
 ORDER BY total DESC
```

Docblock (`:2554-2560`): *"The first query in this repository with a date window, and the
reason it arrives so late is worth writing down: `occurred_at` appears nine times in this
file and, until now, never once in a WHERE. The briefing could say what a unit costs but
not what today made."*

O teste `'a run exactly at midnight is counted once, not twice'`
(`src/data/repository.test.ts:1944-1974`) grava uma corrida exatamente em
`2026-09-01T00:00:00.000Z` e verifica que ela aparece em hoje e **não** em ontem —
*"com as duas pontas fechadas, este movimento apareceria nos dois dias, e quem comparasse
hoje com ontem veria um número que ninguém produziu"* (`:1969-1972`).

#### `productionBetween` — os fatos soltos, para distribuir por dia

```ts
export async function productionBetween(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<{ occurredAt: string; baseUnits: number }[]>
```
(`src/data/repository.ts:2610-2629`)

```sql
SELECT occurred_at, quantity_base_units
  FROM movements m
 WHERE company_id = ?
   AND kind = 'production'
   AND occurred_at >= ?
   AND occurred_at < ?
   AND <NAO_ESTORNADO>
 ORDER BY occurred_at
```

Por que ela existe ao lado de `productionOn` (`:2598-2608`): *"aquela devolve o total já
somado da janela, esta devolve os fatos soltos para quem precisa distribuí-los por dia.
Sete chamadas de `productionOn` responderiam a mesma pergunta com sete varreduras do
livro-razão."*

O `kind = 'production'` é a linha que o teste protege explicitamente
(`src/data/repository.test.ts:1917-1922`): *"Se a régua de sete dias somasse o movimento
inteiro em vez de filtrar por `kind = 'production'`, a coluna do dia mostraria a produção
menos os insumos que ela comeu: um número que não é nem uma coisa nem outra, e que fica
NEGATIVO em qualquer receita que pese mais que rende."*

Note a assimetria de estilo: esta consulta usa `company_id` sem apelido no `WHERE` mas
declara `FROM movements m` porque `NAO_ESTORNADO` fala de `m.id` (`:2618-2623`).

#### `recentRuns` — o histórico curto

```ts
export async function recentRuns(companyId: string, limit = 6): Promise<Run[]>
```
(`src/data/repository.ts:2907-2936`)

`Run = { lotId: string | null; code: string | null; name: string; baseUnits: number;
occurredAt: string; unitCostRate: number | null }` (`:2886-2894`), com `unitCostRate`
documentado como *"A taxa congelada daquela corrida, em centavos fracionários por
unidade"* (`:2892`).

```sql
SELECT m.lot_id, l.code, i.name, m.quantity_base_units, m.occurred_at, m.unit_cost_rate
  FROM movements m
  JOIN items i ON i.id = m.item_id
  LEFT JOIN lots l ON l.id = m.lot_id
 WHERE m.company_id = ? AND m.kind = 'production' AND m.quantity_base_units > 0
   AND <NAO_ESTORNADO>
 ORDER BY m.occurred_at DESC
 LIMIT ?
```

`LEFT JOIN lots` de propósito: corrida antiga sem lote continua aparecendo, com
`code: null`.

Docblock (`:2896-2905`): *"A capa mostrava só o total do dia, e total do dia não responde
'como estamos indo': três corridas de 100 e uma de 300 dão o mesmo número e são semanas
diferentes... Uma linha por movimento de produção, e não por lote: o lote é a identidade, o
movimento é o fato — e é o fato que tem hora e taxa congelada."*

O teste (`src/data/repository.test.ts:2419-2431`) faz três corridas no mesmo dia
(80, 100, 120) e exige `[120, 100, 80]` — *"uma linha por corrida, não por dia"*,
*"mais recente primeiro"* — e que `limit: 2` corte pelo fim.

---

### 11.12 Lotes

#### `lotsOn` — os lotes que nasceram numa janela

```ts
export async function lotsOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<LotOfDay[]>
```
(`src/data/repository.ts:2673-2707`)

`LotOfDay` (`:2632-2658`) tem cinco campos obrigatórios e quatro opcionais:

| Campo | Tipo | Preenchido por |
|---|---|---|
| `id` | `string` | `lotsOn`, `findLot` |
| `code` | `string` | `lotsOn`, `findLot` |
| `name` | `string` | `lotsOn`, `findLot` |
| `baseUnits` | `number` | `lotsOn`, `findLot` |
| `expiresOn` | `string \| null` | `lotsOn`, `findLot` |
| `producedOn?` | `string \| null` | **só `findLot`** |
| `runGroupId?` | `string \| null` | **só `findLot`** |
| `recipeName?` | `string \| null` | **só `findLot`** |
| `recipeVersion?` | `number \| null` | **só `findLot`** |

```sql
SELECT l.id, l.code, i.name, l.expires_on,
       COALESCE(SUM(m.quantity_base_units), 0) AS total
  FROM lots l
  JOIN items i ON i.id = l.item_id
  JOIN movements m ON m.lot_id = l.id AND m.kind = 'production'
 WHERE l.company_id = ?
   AND m.occurred_at >= ?
   AND m.occurred_at < ?
   AND <NAO_ESTORNADO>
 GROUP BY l.id, l.code, i.name, l.expires_on
 ORDER BY l.code DESC
```

O `JOIN` (não `LEFT JOIN`) com `m.kind = 'production'` na cláusula `ON` é o que faz "lote
que nasceu nesta janela": lote de importação, sem movimento de produção, não aparece.

Docblock (`:2660-2672`): *"Existe porque o código do lote é o número que alguém escreve de
caneta na caixa antes de ela ir para a câmara fria — e a primeira versão disto era um
diálogo depois de gravar, que o e2e derrubou com razão: um toque a mais na ação mais
frequente do dia, todo dia... A quantidade vem do movimento e não do lote, porque é o
livro-razão que sabe quanto saiu: o lote é a identidade, o movimento é o fato."*

O teste (`src/data/repository.test.ts:1527-1564`) fixa três coisas: janela sem produção
devolve `[]` — *"lista vazia, não uma linha zerada"* (`:1533`) —, `baseUnits` vem do
movimento (400), e lote de outro dia não entra na janela de hoje.

#### `findLot` — um lote, com tudo o que a etiqueta precisa

```ts
export async function findLot(companyId: string, lotId: string): Promise<LotOfDay | null>
```
(`src/data/repository.ts:3120-3161`)

```sql
SELECT l.id, l.code, i.name, l.expires_on, l.produced_on,
       r.name AS recipe_name, v.version AS recipe_version,
       COALESCE(SUM(m.quantity_base_units), 0) AS total,
       MAX(m.movement_group_id) AS group_id
  FROM lots l
  JOIN items i ON i.id = l.item_id
  LEFT JOIN recipe_versions v ON v.id = l.recipe_version_id
  LEFT JOIN recipes r ON r.id = v.recipe_id
  LEFT JOIN movements m ON m.lot_id = l.id AND m.kind = 'production'
 WHERE l.company_id = ? AND l.id = ?
 GROUP BY l.id, l.code, i.name, l.expires_on, l.produced_on, r.name, v.version
```

Três `LEFT JOIN` deliberados, comentados (`:3133-3134`): *"As duas juntas à esquerda de
propósito: lote de importação não tem ficha, e ele continua abrindo a tela inteira em vez
de sumir da consulta."*

**Devolve `null` e não lança** (`:3113-3118`): *"Etiqueta se abre por link, e link
envelhece: alguém guarda o endereço, o dado é apagado, e a tela tem que saber dizer 'esse
lote não está mais aqui' em vez de quebrar."*

`MAX(m.movement_group_id) AS group_id` é o gancho do estorno: `app/lots/[id].tsx:97` usa
`lot.runGroupId` para chamar `planReversal`. `runGroupId` nulo é resposta
(`:2640-2646`): *"nulo é resposta: não há ato para estornar, então a tela não oferece o
conserto."*

O teste (`src/data/repository.test.ts:1566-1590`) verifica os quatro campos, o `null` para
id inexistente e — importante — que **lote de outra empresa não vaza por id adivinhado**:
`assert.equal(await findLot('outra-empresa', corrida.lot.id), null)` (`:1589`).

#### `expiringSoon` — o que vence primeiro, do que ainda existe

```ts
export async function expiringSoon(
  companyId: string,
  throughDate: string,
  limit = 5,
  locationId?: string,
): Promise<Expiring[]>
```
(`src/data/repository.ts:2967-2972`)

`Expiring = { lotId; code; name; expiresOn: string; baseUnits }` (`:2939-2945`) —
`expiresOn` não é nulável aqui porque a consulta filtra `IS NOT NULL`.

```sql
SELECT l.id, l.code, i.name, l.expires_on,
       COALESCE(SUM(m.quantity_base_units), 0) AS total
  FROM lots l
  JOIN items i ON i.id = l.item_id
  JOIN movements m ON m.lot_id = l.id
 WHERE l.company_id = ?
   AND l.expires_on IS NOT NULL
   AND l.expires_on <= ?
   AND (? IS NULL OR m.location_id = ?)
 GROUP BY l.id, l.code, i.name, l.expires_on
HAVING SUM(m.quantity_base_units) > 0
 ORDER BY l.expires_on ASC
 LIMIT ?
```

O `JOIN movements` sem filtro de `kind` é o que faz a soma ser "o que ainda existe": entra
produção, entram as duas pernas de transferência, entra perda, entra estorno. É por isso
que ela não precisa de `NAO_ESTORNADO` — a perna de estorno carrega o `lot_id` do original
(`reverseGroup`, `:4499`), então a soma cai a zero e o `HAVING > 0` descarta.

Docblock (`:2947-2965`), que contém a decisão mais delicada do arquivo:

> *"`lotsOn` responde 'o que nasceu nesta janela', que é outra pergunta. Esta responde a
> que decide: o que sai primeiro do freezer, e quanto disso ainda existe. Lote já esgotado
> não aparece — avisar sobre a validade de uma caixa que já foi embora é o alerta inventado
> que a fábrica aprende a ignorar. A soma é POR LUGAR, e essa é a decisão que faz a peça
> servir... Sem `locationId`, a soma é da empresa."*

E há uma **guarda de fonte** que impede as telas de passar sala:
`src/layers.test.ts:256-281` varre `app/` e `src/` procurando chamadas de `expiringSoon`
com quatro ou mais argumentos e reprova. A cicatriz (`src/layers.test.ts:233-242`):

> *"`expiringSoon` estava certa: ela aceita a sala como parâmetro opcional e, sem ele,
> responde pela empresa inteira. Quem errava eram os dois pontos de chamada — a capa e o
> alarme do celular — que passavam o almoxarifado. A soma por local de um lote que saiu do
> almoxarifado dá zero ali, e o `HAVING SUM(...) > 0` o descarta. Então o filtro
> silenciava o aviso EXATAMENTE no dia em que o picolé ia para a câmara fria."*

O teste de unidade complementar é `'a lot warns about expiry from wherever it is, not only
from the storeroom'` (`src/data/repository.test.ts:3329-3400`), que produz com prazo de 18
dias, transfere para a câmara com `lotId` nomeado e exige que o aviso continue
(`:3380-3384`) — e que, perguntando pelo almoxarifado, o lote que saiu **não** esteja lá,
*"o filtro continua servindo"* (`:3395-3399`).

O segundo teste (`:2434-2484`) fixa `expiringSoon(CO, '2026-03-08')` como `[]` com produto
de 180 dias — *"nada vencendo é resposta, não lista vazia por erro"* — e a ordem por
`expiresOn` crescente.

**Nota factual:** o teste em `:3388-3394` contém dois `console.log("    [dbg] ...")` de
depuração deixados no arquivo.

#### `lotsInStock` — a fila PEPS de uma sala

```ts
export async function lotsInStock(
  companyId: string,
  itemId: string,
  locationId: string,
): Promise<{ lotId: string; code: string; expiresOn: string | null; baseUnits: number }[]>
```
(`src/data/repository.ts:3017-3045`)

```sql
SELECT l.id, l.code, l.expires_on, COALESCE(SUM(m.quantity_base_units), 0) AS total
  FROM lots l
  JOIN movements m ON m.lot_id = l.id
 WHERE l.company_id = ? AND l.item_id = ? AND m.location_id = ?
 GROUP BY l.id, l.code, l.expires_on
HAVING SUM(m.quantity_base_units) > 0
 ORDER BY l.expires_on IS NULL, l.expires_on ASC, l.code ASC
```

`locationId` é **obrigatório** aqui — a pergunta é sempre de uma sala.

A ordenação é a regra de produto inteira (`:3014-3015`): *"Lote sem validade vai para o
fim, não para o começo: sem data não há pressa, e mandar primeiro o que não vence deixaria
o que vence envelhecendo na câmara."* Em SQLite, `l.expires_on IS NULL` avalia para 0/1, e
`ORDER BY` crescente põe os nulos depois. Desempate final por `code ASC`.

Docblock (`:3006-3013`): *"É o que permite a carga sair sem perguntar de qual lote: quem
despacha não escolhe lote, despacha o que está na frente — e o que está na frente é o que
vence primeiro. A Lei 1 na forma mais direta: o sistema sabe, então não pergunta."*

Chamador único: `app/transfer.tsx:166`, que manda a frente da fila para `recordTransfer`.

#### `lotsInRoomAt` — o que estava dentro de uma sala num instante

```ts
export async function lotsInRoomAt(
  companyId: string,
  locationId: string,
  instantIso: string,
): Promise<LotInRoom[]>
```
(`src/data/repository.ts:3077-3111`)

`LotInRoom = { lotId; code; name; baseUnits; expiresOn }` (`:3048-3055`), com o `name`
justificado: *"O nome do produto, porque '20260902-01' sozinho não manda ninguém a lugar
nenhum"* (`:3051`).

```sql
SELECT l.id, l.code, i.name, l.expires_on,
       COALESCE(SUM(m.quantity_base_units), 0) AS total
  FROM lots l
  JOIN items i ON i.id = l.item_id
  JOIN movements m ON m.lot_id = l.id
 WHERE l.company_id = ?
   AND m.location_id = ?
   AND m.occurred_at <= ?
 GROUP BY l.id, l.code, i.name, l.expires_on
HAVING SUM(m.quantity_base_units) > 0
 ORDER BY total DESC, l.code ASC
```

`occurred_at <= ?` — **inclusivo**, ao contrário das janelas meio-abertas: aqui não há
janela, há um corte.

O docblock é a resposta a uma promessa antiga da fundação (`:3057-3076`):

> *"O docblock do livro-razão diz, entre o que o modelo append-only compra de graça: 'a
> habilidade de responder "o que estava dentro do freezer às 03:12?" — que é como uma
> excursão de temperatura lista os lotes expostos sem ninguém ter anotado nada'. O domínio
> chegou a ter a dobra em memória para isso, e ela morreu por forma: o aplicativo não tem
> os movimentos em memória, tem SQLite. A consulta é esta, e o corte no tempo é o que a
> torna a resposta certa. ... A leitura ruim foi às 07:20 e alguém abre a tela às 15:00;
> entre as duas horas uma carga pode ter saído. O que ficou exposto é o que estava lá
> NAQUELA hora, e é isso que um recall precisa. `occurred_at <= ?` é a diferença inteira
> entre as duas perguntas."*

`src/domain/ledger.ts:154-158` confirma do outro lado que a dobra em memória foi
substituída por esta consulta.

O teste `'the room says what was inside it AT THE READING, not what is inside now'`
(`src/data/repository.test.ts:1662-1737`) é o mais preciso do arquivo: duas corridas de
manhã, dois lotes para a câmara, um deles sai ao meio-dia. Às 07:20 → **2 lotes**; às
15:00 → **1 lote**; e a resposta das 07:20 pedida de novo depois continua sendo 2
(`:1735-1736`).

Chamador único: `app/places.tsx:485`, que só chama quando a leitura está fora de faixa:
`fora && last ? lotsInRoomAt(..., last.takenAt) : []`.

---

### 11.13 Transporte: remessas e conferência

#### `shipmentsOn` — o que saiu da fábrica, agrupado por onde caiu

```ts
export async function shipmentsOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<Shipment[]>
```
(`src/data/repository.ts:3301-3375`)

`Shipment` (`:3247-3284`):

```ts
{
  groupIds: string[];     // os grupos das remessas que caíram neste destino
  locationId: string;
  locationName: string;
  kind: string;
  items: { itemId; name; baseUnits; baseUnit; packaging }[];
  checked: boolean;
}
```

`groupIds` é plural por decisão (`:3248-3254`): *"A tela fala por destino, como o desenho
manda, mas a conferência é por REMESSA - uma loja pode receber duas cargas no mesmo dia, e
quem abre a segunda caixa não está conferindo a primeira."*

```sql
SELECT m.movement_group_id AS group_id, m.location_id, l.name AS location_name, l.kind,
       m.item_id, i.name AS item_name, i.base_unit, i.packaging,
       SUM(m.quantity_base_units) AS total,
       EXISTS (
         SELECT 1 FROM movements c
          WHERE c.company_id = m.company_id
            AND c.movement_group_id = m.movement_group_id
            AND c.post = 'checked'
       ) AS checked
  FROM movements m
  JOIN locations l ON l.id = m.location_id
  JOIN items i ON i.id = m.item_id
 WHERE m.company_id = ?
   AND m.kind = 'transfer'
   AND m.quantity_base_units > 0
   AND m.occurred_at >= ?
   AND m.occurred_at < ?
   AND <NAO_ESTORNADO>
 GROUP BY m.movement_group_id, m.location_id, l.name, l.kind, m.item_id, i.name, i.base_unit,
          i.packaging
HAVING total > 0
 ORDER BY l.name, total DESC
```

**`quantity_base_units > 0` é a linha que define a semântica** (`:3286-3293`): *"A transfer
writes two legs - one negative where it left, one positive where it arrived - so 'where did
it go' reads the POSITIVE legs and groups by `location_id`, which on that leg is the
destination. `counterpart_location_id` says where it came from; the V6 migration added it
and, until this function, no query in this repository had ever read it back."*

**Agregação em memória** (`:3344-3374`), com uma regra que o SQL não daria:

```ts
if (!place.groupIds.includes(r.group_id)) {
  place.groupIds.push(r.group_id);
  if (r.checked !== 1) place.checked = false;
}
```

Comentário (`:3355-3356`): *"Conferido só quando TODAS as remessas do dia para lá foram
conferidas: um 'conferido' que ignora a carga da tarde é pior que nenhum."* O `checked`
começa em `true` (`:3352`) e só desce.

Itens repetidos entre remessas do mesmo destino somam (`:3361-3362`).

Dois testes fixam a semântica. `'what went out is grouped by where it landed, in the units
each item has'` (`src/data/repository.test.ts:941-1008`): três transferências para dois
destinos, `dia.length === 2`, e *"a origem não é destino"* (`:985`) — porque se a consulta
lesse as duas pernas *"a fábrica apareceria como destino de si mesma e o total do dia
dobraria"* (`:981-983`). E `'a return on the same day does not quietly shrink what the store
received'` (`:1348-1390`): 6.000 g para a loja de manhã, 1.000 de volta à tarde; a loja
aparece com **6.000**, não 5.000 — *"São dois fatos, não um saldo"* (`:1381-1383`) — e a
devolução aparece como 1.000 chegando na fábrica.

#### `unchecked` — remessas de um dia que ninguém conferiu

```ts
export async function unchecked(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<string[]>
```
(`src/data/repository.ts:2520-2545`) — *"Remessas de um dia que ninguém conferiu ainda"*
(`:2519`).

```sql
SELECT DISTINCT m.movement_group_id
  FROM movements m
 WHERE m.company_id = ?
   AND m.kind = 'transfer'
   AND m.quantity_base_units > 0
   AND m.occurred_at >= ?
   AND m.occurred_at < ?
   AND m.movement_group_id IS NOT NULL
   AND <NAO_ESTORNADO>
   AND NOT EXISTS (
     SELECT 1 FROM movements c
      WHERE c.company_id = m.company_id
        AND c.movement_group_id = m.movement_group_id
        AND c.post = 'checked'
   )
```

Devolve uma lista crua de ids de grupo (`:2544`) — o retorno mais magro do arquivo.

**Estado: implementada, sem chamador de tela.** Só o teste a exercita
(`src/data/repository.test.ts:1227`, `:1238`): duas remessas, nenhuma conferida →
`length === 2`; depois de `recordCheck` na primeira → `[paraNorte.groupId]`. Na prática a
tela de transporte usa `shipmentsOn(...).checked` (`app/(tabs)/transport.tsx:65`), que
responde a mesma pergunta por destino em vez de por remessa. É informação duplicada em duas
consultas, com só uma chamada.

---

### 11.14 Perdas

#### `lossesOn` — o que se perdeu numa janela, do mais caro para o mais barato

```ts
export async function lossesOn(
  companyId: string,
  fromIso: string,
  toIso: string,
): Promise<LossRow[]>
```
(`src/data/repository.ts:2187-2229`)

`LossRow` (`:2168-2177`): `{ itemId; name; baseUnits; baseUnit; reason: LossReason;
locationName; valueCents: Cents; occurredAt }` — *"Uma perda, como o relatório precisa
dela: quanto, onde, por quê e quanto vale"* (`:2167`).

```sql
SELECT m.item_id, i.name, i.base_unit, m.quantity_base_units AS quantity,
       m.loss_reason AS reason, l.name AS location_name,
       m.unit_cost_rate AS rate, m.occurred_at
  FROM movements m
  JOIN items i ON i.id = m.item_id
  JOIN locations l ON l.id = m.location_id
 WHERE m.company_id = ?
   AND m.kind = 'loss'
   AND m.occurred_at >= ?
   AND m.occurred_at < ?
   AND <NAO_ESTORNADO>
 ORDER BY ABS(m.quantity_base_units * COALESCE(m.unit_cost_rate, 0)) DESC
```

**A ordenação é decisão de produto, não conveniência** (`:2179-2186`): *"Ordenado por
dinheiro e não por data porque a pergunta que o relatório responde não é 'o que aconteceu
ontem', é 'onde está indo o dinheiro que some'. Uma caixa que derreteu vale mais que trinta
picolés de cortesia, e é ela que muda a manutenção do freezer."*

O `ABS` existe porque a quantidade de perda é negativa no razão (`recordLoss` grava
`-Math.round(input.baseUnits)`, `:2144`). A mesma inversão acontece no mapeamento:
`baseUnits: Math.abs(r.quantity)` (`:2221`).

**Arredondamento**: `valueCents: cents(Math.abs(r.quantity) * (r.rate ?? 0))` (`:2226`),
com o comentário *"Taxa fracionária vezes quantidade, arredondada aqui e só aqui"*
(`:2225`).

`reason` vem tipado como `LossReason` no genérico (`:2198`) sem validação em tempo de
execução — a garantia é o `check` do servidor
(`supabase/migrations/0001_foundation.sql:177`) e o `check (kind <> 'loss' or loss_reason
is not null)` citado no docblock de `recordLoss` (`:2076-2078`).

O teste do estorno de perda prende a interação com `NAO_ESTORNADO`
(`src/data/repository.test.ts:266-267`): depois de estornar, `lossesOn` de uma janela de
cem anos devolve `[]` — *"perda desfeita não aparece no relatório"*.

Quatro telas chamam, sempre em pares para a comparação da Lei 3: `app/losses.tsx:80-81`
(período atual e anterior), `app/(tabs)/reports.tsx:82-83` (30 dias e os 30 anteriores),
`app/(tabs)/index.tsx:184-185` (mês e mês anterior).

---

### 11.15 Pedidos e separação

O bloco tem um comentário de abertura de 12 linhas que é a decisão de arquitetura inteira
(`src/data/repository.ts:3857-3869`):

> *"Pedido não é movimento, e essa é a decisão que segura o resto. Quando um cliente liga,
> nada sai do freezer: as caixas continuam lá, e quem conferir a prateleira encontra tudo
> o que o sistema disse que tem. Gravar demanda como movimento faria o saldo mentir no dia
> da ligação — e como o livro-razão é append-only, corrigir um pedido que mudou exigiria
> estornar uma saída que nunca aconteceu. A ligação com o livro-razão acontece uma vez só,
> e mais tarde: quando a carga sai de verdade, pela transferência."*

`OrderStatus = 'pending' | 'open' | 'delivered' | 'cancelled'` (`:3871`), com o mesmo
`CHECK` no esquema (`src/data/db.ts:461-462`).

#### `listOrders` — os pedidos com as linhas dentro, em duas consultas

```ts
export async function listOrders(
  companyId: string,
  statuses: readonly OrderStatus[] = ['pending', 'open'],
  onlyId?: string,
): Promise<Order[]>
```
(`src/data/repository.ts:4034-4038`)

`Order` (`:3875-3886`): `{ id; placeId; placeName; status; requestedFor: string | null;
note; createdAt; lines: OrderLine[] }`, com `placeName` documentado como *"Vazio quando é
o lugar padrão: a palavra dele é da tela, não do banco"* (`:3878`) e `requestedFor` como
*"`YYYY-MM-DD`, ou nulo quando o cliente não marcou dia"* (`:3881`).
`OrderLine = { itemId; name; baseUnits }` (`:3873`).

**Consulta 1 — cabeçalhos** (`:4050-4055`):

```sql
SELECT o.id, o.place_id, l.name AS place_name, o.status, o.requested_for, o.note, o.created_at
  FROM orders o
  JOIN locations l ON l.id = o.place_id
 WHERE o.company_id = ? AND o.status IN (?, ?, ...) AND (? IS NULL OR o.id = ?)
 ORDER BY o.requested_for IS NULL, o.requested_for, o.created_at
```

`ORDER BY o.requested_for IS NULL` primeiro: pedido com data vem antes de pedido sem data.

Curto-circuito `if (rows.length === 0) return [];` (`:4057`).

**Consulta 2 — todas as linhas de todos os pedidos** (`:4065-4069`):

```sql
SELECT ol.order_id, ol.item_id, i.name, ol.base_units
  FROM order_lines ol
  JOIN items i ON i.id = ol.item_id
 WHERE ol.company_id = ? AND ol.order_id IN (?, ?, ...)
 ORDER BY i.name COLLATE NOCASE
```

O motivo das duas e não N+1 (`:4027-4033`): *"Duas consultas e não uma por pedido: uma
fábrica com quarenta pedidos abertos faria quarenta e uma idas ao banco na abertura da
tela, e a lista é o primeiro lugar em que alguém toca de manhã."* O casamento é
`lines.filter(l => l.order_id === r.id)` em memória (`:4081-4083`).

`saveOrder` a reusa para devolver o pedido gravado: `const [saved] = await
listOrders(companyId, [status], id)` (`:4023`) — o único uso do parâmetro `onlyId`.

#### `pickingFor` — a lista de separação

```ts
export async function pickingFor(
  companyId: string,
  placeId: string,
  fromLocationId: string,
  through: string,
): Promise<PickLine[]>
```
(`src/data/repository.ts:3200-3205`)

`PickLine = { itemId; name; ordered; orders; available; dueOn: string | null }`
(`:3164-3182`).

```sql
SELECT ol.item_id, i.name,
       SUM(ol.base_units) AS ordered,
       COUNT(DISTINCT o.id) AS orders,
       MIN(o.requested_for) AS due_on,
       (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
         WHERE m.company_id = o.company_id
           AND m.item_id = ol.item_id
           AND m.location_id = ?) AS available
  FROM order_lines ol
  JOIN orders o ON o.id = ol.order_id
  JOIN items i ON i.id = ol.item_id
 WHERE o.company_id = ?
   AND o.place_id = ?
   AND o.status IN ('pending', 'open')
   AND (o.requested_for IS NULL OR o.requested_for <= ?)
 GROUP BY ol.item_id, i.name
HAVING ordered > 0
 ORDER BY due_on, i.name COLLATE NOCASE
```

Parâmetros na ordem: `fromLocationId`, `companyId`, `placeId`, `through` (`:3233`) — note
que o primeiro `?` do texto é o da subconsulta, que aparece antes do `WHERE` externo.

`'pending', 'open'` estão **literais no SQL** aqui, ao contrário de `listOrders` que
recebe a lista. Pedido sem data entra sempre (`o.requested_for IS NULL OR ... <= ?`).

Docblock (`:3184-3199`):

> *"A tela de transferência já sabia sugerir uma quantidade — a do último envio para
> aquela loja. É um bom palpite quando a fábrica repõe por hábito, e é o palpite errado
> quando existe um pedido: quem separa não quer repetir a semana passada, quer atender o
> que foi combinado. A lista NÃO reserva nada e não escreve no livro-razão. Ela lê pedido,
> que é demanda, e devolve fato: pedido, disponível e para quando... `available` sai da
> sala de onde a carga vai sair, não do total da empresa: de nada adianta saber que a
> fábrica tem trezentos se eles estão na outra câmara."*

O teste (`src/data/repository.test.ts:1739-1785`) fixa os quatro números com dois pedidos
(300 para 04/09 e 120 para 05/09) e 400 produzidos: `ordered === 420`,
`available === 400`, `dueOn === '2026-09-04'`, `orders === 2`. Mais duas negativas:
pedido de outra loja não entra (`:1780`), e `through: '2026-09-03'` devolve `[]` —
*"separar é para hoje, não para o mês"* (`:1782-1784`).

**A reserva NÃO EXISTE.** O `docs/roadmap.md` e o `CLAUDE.md` falam de "pedido com
reserva" como entrega da F3; nesta camada `pickingFor` é leitura pura e nada em
`src/data/repository.ts` escreve reserva.

#### `stockAgainstOrders` — quanto ainda dá para prometer

```ts
export async function stockAgainstOrders(
  companyId: string,
  throughDate: string,
): Promise<Demand[]>
```
(`src/data/repository.ts:4147-4150`)

`Demand = { itemId; name; requested; onHand }` (`:4108-4115`), com `requested` como
*"Quanto foi pedido e ainda não foi entregue, na unidade base do item"* (`:4111`) e
`onHand` como *"Quanto existe na fábrica agora. O que já está numa loja não conta"*
(`:4113`).

```sql
SELECT p.item_id, i.name,
       COALESCE(SUM(ol.base_units), 0) AS requested,
       (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
          JOIN locations l ON l.id = m.location_id
         WHERE m.company_id = p.company_id
           AND m.item_id = p.item_id
           AND l.kind IN ('factory', 'cold_room', 'store_room')) AS on_hand
  FROM products p
  JOIN items i ON i.id = p.item_id
  LEFT JOIN order_lines ol ON ol.item_id = p.item_id
   AND ol.company_id = p.company_id
   AND EXISTS (SELECT 1 FROM orders o
                WHERE o.id = ol.order_id
                  AND o.status IN ('pending', 'open')
                  AND (o.requested_for IS NULL OR o.requested_for <= ?))
 WHERE p.company_id = ?
 GROUP BY p.item_id, i.name
 ORDER BY i.name COLLATE NOCASE
```

Três coisas dentro desta consulta, cada uma com cicatriz escrita:

1. **O filtro do pedido vive no `ON`, não no `WHERE`** (comentário em `:4158-4160`): *"senão
   o `LEFT JOIN` vira `INNER`: a condição eliminaria justamente a linha sem pedido que esta
   consulta passou a existir para trazer."*
2. **`l.kind IN ('factory', 'cold_room', 'store_room')` — no plural.** O docblock
   (`:4124-4130`): *"'As salas', no plural, e isso custou um achado de auditoria. A conta
   lia o `defaultLocationId` — um lugar só, o que era certo enquanto havia um só. O dono
   cadastra a câmara fria, manda o picolé para lá (que é o que uma fábrica de picolés faz
   no dia seguinte ao de produzir), e a conta passa a dizer que não há nada para prometer
   com o freezer cheio."* Esta é a lista que `src/layers.test.ts:382-399` compara com
   `INTERNAL_PLACE_KINDS`.
3. **Parte do PRODUTO, não da linha de pedido** (`:4131-4141`): *"Ela se chamava
   `orderedDemand` e montava as linhas a partir de `order_lines`, então respondia só sobre
   o que alguém já tinha pedido — e quem pergunta 'quanto ainda dá para prometer' está
   quase sempre no caso oposto: o primeiro pedido do dia, de um produto que ninguém pediu
   ainda. A tela de anotar pedido ficava sem dica nenhuma no campo de quantidade... Produto
   sem pedido volta com `requested` zero, que é fato e não lacuna. As duas telas que leem
   isto para achar FALTA continuam certas de graça: as duas filtram por `requested - onHand
   > 0`."*

Note que `WHERE p.company_id = ?` **não** filtra `p.active = 1`, ao contrário de
`listProducts`: produto desativado com saldo continua aparecendo aqui.

Dois testes cobrem os dois lados. `'what can be promised counts every room of ours, and no
store'` (`src/data/repository.test.ts:2901-2935`): 200 produzidos, 150 para a câmara, 30
para a loja → `onHand === 170`, *"a câmara é nossa e conta; a loja já foi entregue e não
conta"*. E `'what was ordered is measured against the factory shelf, not the company
total'` (`:2937-3001`): 200 na fábrica, 150 para a loja, pedido de 300 → `requested === 300`
e `onHand === 50`; pedido de outubro fora da janela não entra (`:2979-2980`); pedido
entregue sai da conta e a linha do produto **continua** com `requested: 0` (`:2989-2993`);
e o filtro `requested - onHand > 0` devolve zero linhas (`:2997-3000`).

Um terceiro teste prova que pendente conta como compromisso: com aprovação ligada, um
pedido `pending` de 40 já aparece em `requested` (`:3024-3027`) — *"quem espera aprovação
para começar a produzir descobre na sexta que devia ter começado na quarta"*.

`src/notify/facts.ts:38-43` usa esta consulta junto com `listOrders`, e o comentário
explica que não é redundância: *"a demanda agrupa por ITEM e o aviso conta LOJAS. Sem esta
consulta eu estava usando o id do item como id de loja — o aviso diria 'quatro lojas
esperando' para quatro sabores pedidos pela mesma loja"* (`src/notify/facts.ts:39-42`).

---

### 11.16 Leituras de sensor e de conferência

#### `lastReadings` — a última leitura de cada grandeza, por lugar

```ts
export async function lastReadings(companyId: string): Promise<Reading[]>
```
(`src/data/repository.ts:2828-2864`)

`Reading = { id; locationId; kind: string; value: number; unit: string; takenAt: string;
source: string }` (`:2751-2759`).

```sql
SELECT r.id, r.location_id, r.kind, r.value, r.unit, r.taken_at, r.source
  FROM readings r
  JOIN (
    SELECT location_id, kind, MAX(taken_at) AS quando
      FROM readings
     WHERE company_id = ?
     GROUP BY location_id, kind
  ) ultima
    ON ultima.location_id = r.location_id
   AND ultima.kind = r.kind
   AND ultima.quando = r.taken_at
 WHERE r.company_id = ?
 ORDER BY r.location_id, r.kind
```

`companyId` entra **duas vezes** (`:2852`): uma na subconsulta, uma na externa. Por que uma
consulta e não N (`:2822-2827`): *"Uma consulta para todos os lugares em vez de uma por
lugar: a tela mostra a lista inteira, e é a mesma razão pela qual a lista de embalagem vem
junta."*

`kind` e `source` são **texto aberto** de propósito (`:2761-2768`): *"`source` é o que
diferencia, e é texto aberto de propósito: quando o ESP32 do dono existir, ele grava com
`source: 'wifi'` e nada mais muda aqui."* O padrão de escrita é `'typed'`
(`:2805`, `:2818`).

O teste (`src/data/repository.test.ts:2605-2699`) grava quatro leituras em duas câmaras e
duas grandezas e exige `ultimas.length === 3` — *"uma última por lugar e por grandeza"*
(`:2649`) — com a mais recente da câmara 1 sendo `-12.1` e não `-18.4` (`:2652`), e
`source: 'zigbee'` viajando com a leitura de umidade (`:2656`).

**Nota:** se duas leituras do mesmo lugar e grandeza tiverem o mesmo `taken_at` ao
milissegundo, as duas voltam — o `JOIN` casa por igualdade de instante, não por id.

#### `readingsBetween` — a série de uma grandeza num lugar

```ts
export async function readingsBetween(
  companyId: string,
  locationId: string,
  kind: string,
  fromIso: string,
  toIso: string,
): Promise<{ takenAt: string; value: number }[]>
```
(`src/data/repository.ts:2867-2883`) — *"A série de uma grandeza num lugar, do mais antigo
para o mais novo"* (`:2866`).

```sql
SELECT taken_at, value FROM readings
 WHERE company_id = ? AND location_id = ? AND kind = ?
   AND taken_at >= ? AND taken_at < ?
 ORDER BY taken_at ASC
```

Cinco parâmetros — a leitura com mais parâmetros do arquivo. Filtra `taken_at`, nunca
`recorded_at`, pela mesma razão de `occurred_at` no razão.

O teste (`src/data/repository.test.ts:2660-2671`) exige `[-18.4, -12.1]` — *"a série vem em
ordem de quando foi medida, com a fração inteira"*. O comentário explica por que a fração
importa (`:2658-2659`): *"-18,4 arredondado para -18 é meio grau de freezer, e é exatamente
o tipo de perda que o projeto proíbe em dinheiro e vale aqui."*

Chamador único: `app/places.tsx:418`, com `kind` fixo em `TEMPERATURA`.

---

### 11.17 Preferências: as quatro leituras de `app_meta`

Estas quatro não fazem SQL próprio: usam `readMeta(key)` de `src/data/meta.ts:15-22`:

```sql
SELECT value FROM app_meta WHERE key = ?
```

**`app_meta` não tem `company_id`** — é preferência do aparelho, não dado do negócio. O
docblock do módulo é explícito sobre a fronteira (`src/data/meta.ts:10-13`): *"O que cabe
aqui é preferência e cache... O que NÃO cabe é qualquer coisa que alguém vá somar. Saldo é
a soma dos movimentos, e uma chave/valor é exatamente o formato em que um `estoque_atual`
renasceria — sem trigger, sem histórico e sem ninguém notando."*

| Chave literal | Constante | Leitura | Escrita |
|---|---|---|---|
| `'briefing.order'` | `BRIEFING_ORDER_KEY` (`:3888`) | `briefingOrder()` (`:3899-3902`) | `setBriefingOrder` (`:3904-3906`) |
| `'briefing.hidden'` | `BRIEFING_HIDDEN_KEY` (`:3889`) | `briefingHidden()` (`:3915-3918`) | `setBriefingHidden` (`:3920-3922`) |
| `'alerts.settings'` | `ALERTS_KEY` (`:3924`) | `alertSettings()` (`:3939-3962`) | `setAlertSettings` (`:3964-3966`) |
| `'orders.needApproval'` | `APPROVAL_KEY` (`:3968`) | `ordersNeedApproval()` (`:3978-3980`) | `setOrdersNeedApproval` (`:3982-3984`) |

#### `briefingOrder` e `briefingHidden`

```ts
export async function briefingOrder(): Promise<string[]> {
  const saved = await readMeta(BRIEFING_ORDER_KEY);
  return saved ? saved.split(',').filter(Boolean) : [];
}
```
(`src/data/repository.ts:3899-3902`; `briefingHidden` é idêntica com a outra chave,
`:3915-3918`)

Formato de texto separado por vírgula, e o motivo é escrito (`:3891-3898`): *"Guardada como
texto separado por vírgula, e não como JSON, por um motivo prático: é uma lista de palavras
curtas que alguém pode precisar ler no banco durante um suporte, e `producao,clima,insumos`
se lê. Vazio quer dizer 'a ordem que veio de fábrica' — e não uma capa vazia."*

A diferença entre as duas é de escopo, não de forma (`:3908-3913`): *"O que ESTE aparelho
não quer ver, sem mexer no que a casa combinou. Some da capa deste celular e continua na do
escritório. É a mesma família da escolha de identidade: preferência de quem está segurando
o aparelho, que não é fato do negócio e não sobe para o servidor."*

#### `alertSettings` — JSON lido com desconfiança

```ts
export async function alertSettings(): Promise<AlertSettings>
```
(`src/data/repository.ts:3939-3962`)

A leitura é tolerante campo por campo (`:3942-3961`):

```ts
if (!raw) return DEFAULT_ALERTS;
try {
  const lido = JSON.parse(raw) as Partial<AlertSettings>;
  return {
    on:        { ...DEFAULT_ALERTS.on,        ...(lido.on ?? {}) },
    daysAhead: { ...DEFAULT_ALERTS.daysAhead, ...(lido.daysAhead ?? {}) },
    bands:     { ...DEFAULT_ALERTS.bands,     ...(lido.bands ?? {}) },
    minuteOfDay:
      typeof lido.minuteOfDay === 'number' && lido.minuteOfDay >= 0 && lido.minuteOfDay <= 1439
        ? Math.trunc(lido.minuteOfDay) : DEFAULT_ALERTS.minuteOfDay,
    weekdays:
      typeof lido.weekdays === 'number' && lido.weekdays >= 0 && lido.weekdays <= 127
        ? Math.trunc(lido.weekdays) : DEFAULT_ALERTS.weekdays,
  };
} catch { return DEFAULT_ALERTS; }
```

Os limites exatos: `minuteOfDay` entre 0 e **1439**; `weekdays` entre 0 e **127** (bitmask
de sete dias). O motivo da tolerância (`:3933-3937`): *"Um aviso que deixa de sair porque a
configuração não pôde ser lida é o pior desfecho possível — o dono descobre no dia em que
faltar polpa."*

Os padrões que ela cai de volta (`src/domain/alerts.ts:108-119`):

```ts
export const DEFAULT_ALERTS: AlertSettings = {
  on: { insumo: true, pedido: true, volume: false, validade: true, ambiente: true },
  daysAhead: { insumo: 3, pedido: 2, validade: 7 },
  bands: { red: 25, yellow: 40, blue: 80, notifyFull: false },
  minuteOfDay: 7 * 60,
  weekdays: 0,
};
```

`ambiente: true` tem justificativa escrita (`src/domain/alerts.ts:109-113`): *"câmara fora
de faixa estraga o estoque inteiro em uma noite, e o aviso não depende de nenhuma régua que
alguém precise cadastrar antes."*

#### `ordersNeedApproval` — "depende" virou dado

```ts
export async function ordersNeedApproval(): Promise<boolean> {
  return (await readMeta(APPROVAL_KEY)) === '1';
}
```
(`src/data/repository.ts:3978-3980`)

Comparação estrita com `'1'`: qualquer outro valor, inclusive ausência, é `false`.
Docblock (`:3970-3977`): *"'Depende de quem usa' vira dado: uma fábrica quer que o dono veja
cada pedido antes de a produção começar, outra tem três clientes e a aprovação só atrasa a
entrega. Os dois caminhos existem, e o padrão é sem aprovação — a fábrica de seis pessoas é
o caso que este produto tem na mão."*

É lida pela escrita: `saveOrder` decide o status inicial com ela (`:4000`):
`const status: OrderStatus = (await ordersNeedApproval()) ? 'pending' : 'open';`

O teste (`src/data/repository.test.ts:3003-3032`) fixa o padrão `false` — *"a fábrica de
seis pessoas entrega antes"* (`:3014`) — e que, ligada, o pedido nasce `pending`.

---

### 11.18 A leitura que serve para apagar

#### `countForErase` — uma consulta, dez números

```ts
export async function countForErase(companyId: string): Promise<EraseCounts>
```
(`src/data/repository.ts:3421-3447`)

**SQL completo** (`:3424-3442`), com parâmetro numerado `?1` usado dez vezes e ligado uma
só (`:3443`):

```sql
SELECT
  (SELECT COUNT(*) FROM items WHERE company_id = ?1
     AND kind IN ('input','packaging','store_supply')) AS inputs,
  (SELECT COUNT(*) FROM movements WHERE company_id = ?1) AS movements,
  (SELECT COUNT(*) FROM recipes   WHERE company_id = ?1) AS recipes,
  (SELECT COUNT(*) FROM products  WHERE company_id = ?1) AS products,
  (SELECT COUNT(*) FROM locations WHERE company_id = ?1
     AND id <> ?1) AS places,
  (SELECT COUNT(*) FROM purchases WHERE company_id = ?1) AS purchases,
  (SELECT COUNT(*) FROM recipe_lines WHERE company_id = ?1
     AND item_id IS NOT NULL) AS recipeLinesUsingInputs,
  (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
     WHERE pl.company_id = ?1
       AND i.kind IN ('input','packaging','store_supply')) AS purchaseLinesUsingItems,
  (SELECT COUNT(*) FROM products WHERE company_id = ?1
     AND recipe_id IS NOT NULL) AS productsUsingRecipes,
  (SELECT COUNT(*) FROM purchase_lines pl JOIN items i ON i.id = pl.item_id
     WHERE pl.company_id = ?1
       AND i.kind IN ('product','resale')) AS purchaseLinesUsingProducts
```

É a **única** consulta do arquivo que usa parâmetro numerado (`?1`) em vez de posicional, e
a única que devolve dez escalares numa linha. O `AND id <> ?1` em `places` é o que exclui o
lugar padrão da contagem, porque o id dele é o da empresa.

Devolve `{ ...emptyCounts, ...(row ?? {}) }` (`:3446`) — o espalhamento sobre
`emptyCounts` (`src/data/erase.ts:90-95`) garante os dez campos mesmo se a linha vier
nula.

Docblock (`:3414-3420`): *"Counts everything the confirmation dialog needs to speak in real
numbers, including the references that block an area from being cleared. One round trip per
fact would be simpler to read and slower to run on a cold phone; one query that returns
them together keeps the settings screen instant."*

`EraseCounts` está em `src/data/erase.ts:55-88`. O campo `movements` tem a cicatriz mais
séria do conjunto (`src/data/erase.ts:57-73`):

> *"`tablesFor('purchases')` começa com `movements`, e o `DELETE` é por empresa — então
> apagar 'compras' apagava TODO movimento da fábrica: produção, contagem, perda,
> transferência, saída. A confirmação dizia 'isso apaga as compras, e zera o custo médio'.
> Não dizia que um movimento ia. O dono que apaga as compras de exemplo para começar a
> escrituração de verdade perdia tudo o que já tinha registrado, com a tela lhe dizendo
> outra coisa."*

Os quatro campos `...Using...` são os bloqueadores lidos por `blockerFor`
(`src/data/repository.ts:3457`). O teste `'the starter data lands, and does not come back
after it is wiped'` fixa os números do exemplo semeado (`src/data/repository.test.ts:394-398`):
`inputs: 6`, `recipes: 2`, `products: 1`, `purchases: 6`.

Chamador de tela: `app/settings.tsx:262`. Chamador interno: `eraseArea` (`:3457`).

---

### 11.19 A leitura que planeja o estorno

#### `planReversal` — o que o estorno faria, sem fazer

```ts
export async function planReversal(companyId: string, groupId: string): Promise<ReversalPlan>
```
(`src/data/repository.ts:4245`)

`ReversalLeg = { itemId; name; baseUnits; baseUnit; locationId }` (`:4193-4200`), com
`baseUnits` como *"Assinada, na unidade-base: o CONTRÁRIO do que o movimento original
fez"* (`:4196`).

`ReversalPlan` (`:4203-4216`):

```ts
{
  groupId: string;
  legs: ReversalLeg[];
  blocked: { itemId; name; held; needed; baseUnit }[];
  alreadyReversed: boolean;
}
```

`blocked` é *"O que já saiu e por isso não pode voltar. Vazio é o caso normal. Cheio
significa que o estorno deixaria saldo negativo em algum lugar, e saldo negativo é uma
mentira que o livro-razão não desfaz depois"* (`:4206-4212`).

**Consulta 1 — as pernas do ato** (`:4256-4262`):

```sql
SELECT m.id, m.item_id, i.name, i.base_unit, m.quantity_base_units, m.location_id,
       EXISTS (SELECT 1 FROM movements r
                WHERE r.reverses_movement_id = m.id AND r.company_id = m.company_id) AS reversed
  FROM movements m
  JOIN items i ON i.id = m.item_id
 WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind <> 'reversal'
 ORDER BY m.quantity_base_units DESC
```

`kind <> 'reversal'` para não estornar um estorno. `ORDER BY quantity DESC` põe as entradas
antes das saídas. Lança `Error('grupo X não existe')` se vier vazio (`:4266`).

**Consulta 2 — os saldos de todos os itens envolvidos, de uma vez** (`:4289-4294`):

```sql
SELECT item_id, location_id, SUM(quantity_base_units) AS held
  FROM movements
 WHERE company_id = ?
   AND item_id IN (SELECT item_id FROM movements
                    WHERE company_id = ? AND movement_group_id = ?)
 GROUP BY item_id, location_id
```

Comentário (`:4285-4287`): *"Uma consulta só para todas as pernas, e a soma é a mesma de
`balanceByLocation` - duas aritméticas para 'quanto tem aqui' seriam duas verdades."*

**A verificação, em memória** (`:4297-4311`): monta um `Map` chaveado por
`` `${item_id}@${location_id}` `` e, para cada perna **negativa** do plano, testa
`if (tem + leg.baseUnits < 0)` e empurra para `blocked` com `held: tem` e
`needed: -leg.baseUnits`.

Por que a função existe separada da escrita (`:4236-4243`): *"Existe separado da escrita por
uma razão de tom de voz, não de arquitetura: a confirmação deste aplicativo diz o que vai
acontecer com os números por extenso, e para dizer isso a tela precisa da conta antes do
ato. A checagem roda de novo dentro da transação de `reverseGroup` — esta aqui é para
falar, aquela é para valer."*

`reverseGroup` a chama duas vezes: antes da transação (`:4447`) e **dentro** dela
(`:4458`), com o comentário *"Entre planejar e gravar cabe uma remessa de outro aparelho, e
é exatamente o intervalo em que um saldo deixa de existir"* (`:4455-4457`).

Chamadores de tela: `app/lots/[id].tsx:97` (pelo `runGroupId` do lote) e
`app/inputs/[id].tsx:331` (pelo `groupId` de um movimento da lista). O comentário da tela
diz o papel dela (`app/inputs/[id].tsx:319`): *"O plano vem do razão, não da tela:
`planReversal` diz quanto volta, de onde..."*

O teste `'reversing twice would double the correction, so the second time is refused'`
(`src/data/repository.test.ts:3173-3203`) usa o plano dentro do erro:
`e instanceof CannotReverseError && e.plan.alreadyReversed` (`:3196`), e verifica que o
saldo não se moveu no segundo estorno.

#### `recomputeItemCost` — leitura do razão inteiro, escrita de cache

É função de escrita (documentada na parte B), mas sua **leitura** pertence a esta seção
porque define o que "aconteceu" para o dinheiro (`src/data/repository.ts:4370-4378`):

```sql
SELECT m.quantity_base_units, m.unit_cost_rate
  FROM movements m
 WHERE m.company_id = ? AND m.item_id = ?
   AND m.kind <> 'reversal'
   AND <NAO_ESTORNADO>
 ORDER BY m.occurred_at, m.recorded_at, m.id
```

A ordenação de três chaves é deliberada (`:4367-4369`): *"A ordem desempata pelo instante em
que o aparelho soube: duas entradas no mesmo momento têm que dobrar sempre igual, senão a
média depende de qual linha o SQLite devolveu primeiro."* Média móvel é dependente do
caminho, então a ordem **é** o resultado.

A dobra em memória (`:4380-4395`) segue a regra lida dos dois escritores existentes e não
inventada (`:4334-4338`): *"entrada com taxa mistura; qualquer outra coisa só move a
quantidade."*

```ts
let estado: StockCostState = { baseUnits: 0, averageRate: 0 as Rate };
let ultima: Rate | null = null;
for (const l of linhas) {
  if (l.quantity_base_units > 0 && l.unit_cost_rate !== null) {
    estado = {
      baseUnits: estado.baseUnits + l.quantity_base_units,
      averageRate: blendRate(estado, { baseUnits: l.quantity_base_units, rate: l.unit_cost_rate }),
    };
    ultima = l.unit_cost_rate as Rate;
  } else {
    estado = { ...estado, baseUnits: estado.baseUnits + l.quantity_base_units };
  }
}
```

E só escreve no histórico de preço se o número mudou de verdade: `if (Math.abs(anterior -
estado.averageRate) > 1e-12)` (`:4409`) — o `1e-12` é a tolerância literal.

---

### 11.20 Quais leituras aceitam `locationId`, e o que o padrão significa

Esta é a generalização que o `CLAUDE.md` chama de "o primeiro pedido da Fase 2", e ela não é
uniforme — cada função escolheu por um motivo.

| Função | `locationId` | Padrão sem ele | Linha |
|---|---|---|---|
| `listItems` | opcional, 4º | empresa inteira | `:152` |
| `findItem` | opcional, 3º | empresa inteira | `:3589` |
| `itemMovements` | opcional, 4º | empresa inteira | `:998` |
| `runningOut` | opcional, 6º | empresa inteira | `:3797` |
| `expiringSoon` | opcional, 4º | empresa inteira — **e as telas não podem passar** (`src/layers.test.ts:256-281`) | `:2971` |
| `balanceByLocation` | não tem — **`GROUP BY`** | devolve todos os lugares | `:537-540` |
| `stockByPlace` | não tem — **`GROUP BY`** | devolve todos os lugares | `:781` |
| `lotsInStock` | **obrigatório**, 3º | — | `:3020` |
| `lotsInRoomAt` | **obrigatório**, 2º | — | `:3079` |
| `pickingFor` | **obrigatório** como `fromLocationId`, 3º | — | `:3203` |
| `stockAgainstOrders` | não tem — filtra por `l.kind` | as três salas nossas | `:4167` |
| `lastSentBaseUnits` | **obrigatório** como `toLocationId`, 3º | — | `:721` |
| `lossesOn` | não tem | empresa inteira | `:2187-2191` |
| `productionOn` / `productionBetween` / `recentRuns` | não têm | empresa inteira | — |
| `shipmentsOn` / `unchecked` | não têm — agrupam por destino | — | — |
| `lastReadings` | não tem — devolve todos | — | `:2828` |
| `readingsBetween` | **obrigatório**, 2º | — | `:2869` |

O padrão de implementação do opcional é sempre o mesmo par de `?`:
`AND (? IS NULL OR m.location_id = ?)` com `locationId ?? null` duas vezes — visto em
`:173`, `:1021`, `:2989`, `:3818` e `:3822`. `runningOut` é o único que precisa de **dois
pares**, porque tem duas subconsultas (`:3828-3832`).

O escritor equivalente, `recordCount`, exige `locationId` **sem padrão**, e a justificativa
é a peça mais didática do arquivo sobre esse eixo (`src/data/repository.ts:906-917`):

> *"A count is the one figure that comes from somebody standing in front of the goods, so it
> belongs to a place. With a default, counting the cold room without saying so would compare
> against the company's whole balance and write the difference into the cold room - stock
> teleported between rooms by an operator who did everything right. The rule of this project
> is that the error is prevented, not complained about: the caller says where, or it does
> not compile."*

O teste correspondente é `'counting a shelf compares against that shelf, not the whole
company'` (`src/data/repository.test.ts:852-895`).

---

### 11.21 Onde o dinheiro arredonda, nas leituras

Regra da capa do projeto: `Rate` é fracionário, `Cents` é inteiro, e só o valor final
arredonda, uma vez. As leituras respeitam isso em quatro pontos, e em nenhum outro:

| Leitura | Linha | Expressão | Comentário no código |
|---|---|---|---|
| `stockByPlace` (linha) | `:822` | `cents((r.rate ?? 0) * r.base_units)` | *"Taxa fracionária vezes quantidade, arredondada aqui e só aqui"* (`:821`) |
| `stockByPlace` (total do lugar) | `:830` | `cents(place.valueCents + value)` | soma de inteiros |
| `lossesOn` | `:2226` | `cents(Math.abs(r.quantity) * (r.rate ?? 0))` | *"Taxa fracionária vezes quantidade, arredondada aqui e só aqui"* (`:2225`) |
| `recordCount` (retorno) | `:976` | `amountOf(averageRate, delta)` | `amountOf` é *"the one place rounding happens"* (`src/domain/money.ts:57`) |

`cents(v)` é `Math.round(v) as Cents` (`src/domain/money.ts:7-9`); `amountOf(rate, qty)` é
`Math.round(rate * qty) as Cents` (`src/domain/money.ts:58-60`).

**Onde as leituras NÃO arredondam, de propósito:** `itemCosts`, `listItems.averageRate`,
`listItems.lastRate`, `itemHistory`, `recentCostChanges`, `recentRuns.unitCostRate`,
`itemMovements.unitCostRate` — todos devolvem `Rate` cru, com a asserção de tipo
`as Rate` e nada mais (`:201-202`, `:284`, `:1031`, `:2067-2068`, `:2934`, `:3547-3548`).
O `Math.abs(...) < 1e-9` que os testes usam para comparar (`src/data/repository.test.ts:281`,
`:292`, `:295`, `:317`, `:3223`) é a prova de que o número é fracionário.

E `runningOut` devolve `dailyOutflow` e `daysLeft` como frações puras (`:3842-3843`), sem
arredondar nenhuma: é o que permite o teste abrir a conta com tolerância `1e-9`
(`src/data/repository.test.ts:2369`).

---

### 11.22 `src/selectors.test.ts` — o que este arquivo é, e o que ele não é

**Aviso necessário:** apesar do nome, `src/selectors.test.ts` (153 linhas) **não tem
nenhuma relação com seletores de dados, consultas ou `repository.ts`**. Ele não importa
`src/data/repository.ts`. "Seletor" aqui é seletor de **navegador**: o texto que a suíte
e2e procura na tela.

O que ele faz, em três testes:

1. Achata todo o dicionário pt-BR numa lista de frases, recursivamente
   (`src/selectors.test.ts:31-39`).
2. Lê `e2e/flow.mjs` como texto (`:64`) e extrai dele dois conjuntos:
   - **literais**: `getByText('...', { exact: true })` e `getByLabel('...')`
     (`:91-94`);
   - **expressões**: `getByLabel(/.../)` e `getByText(/.../)` (`:97-99`).
3. Exige que cada literal exista numa frase do dicionário e que cada expressão case com
   alguma (`:108-140`).

O motivo escrito (`src/selectors.test.ts:6-28`):

> *"**A cicatriz.** Um rótulo foi renomeado — `howMany` deixou de ser 'Quantas {{pack}}',
> que saía como 'QUANTAS SACO 25 KG', e virou 'Quantidade, em {{pack}}' — e três checagens
> do e2e continuaram procurando `/Quantas/`. Elas não falham na hora: esperam trinta
> segundos por um campo que não existe mais e o CI fica vermelho vinte minutos depois...
> Esta guarda fecha a distância... em milissegundos, no `npm test`."*

Três detalhes de implementação que valem transcrever porque são cicatrizes próprias:

- **A contagem antes da comparação** (`:41-52`): se o dicionário chegar com menos de 100
  frases, o arquivo lança na carga. *"O import começou como `default`, o dicionário chegou
  indefinido, e a lista de frases ficou vazia — então toda comparação era falsa e o primeiro
  seletor da lista levava a culpa por um erro que não era dele. Uma guarda que reprova pelo
  motivo errado é pior que guarda nenhuma."*
- **Marcadores trocados por vazio** (`:62`): `f.replace(/\{\{\w+\}\}/g, '')`, para
  `"Quantidade, em {{pack}}"` casar com um seletor que procura a parte fixa.
- **A lista de renúncias com motivo obrigatório**, `NAO_E_DICIONARIO` (`:74-88`), com dez
  entradas exatas: `'Picolé de morango'`, `'Açúcar cristal'`, `'Polpa de morango'`,
  `'Apagar Produtos'`, `Uva`, `'Picolé de Uva'`, `máxima`, `mínima`,
  `'^\\d{8}-\\d{2}$'`, `'^Tempo: (Esconder|Mostrar)$'` e `English`. O terceiro teste
  (`:142-153`) exige que cada renúncia **ainda seja usada** pelo e2e e que o motivo tenha
  mais de 20 caracteres — *"a renúncia precisa de um motivo escrito, não de um lugar na
  lista"* (`:150`).

A entrada `English` tem a justificativa mais longa (`:86-87`): *"nome de idioma escrito NA
língua dele, de propósito: quem procura o próprio idioma numa lista o reconhece escrito como
ele se escreve... traduzir 'English' para 'Inglês' esconderia a palavra de quem só lê
inglês."*

O que ele declara **não** provar (`:23-25`): *"Não prova que a tela mostra aquele texto
(isso é trabalho do navegador); prova que o texto que o e2e procura existe no aplicativo."*

**Conclusão para quem vai reconstruir:** se a intenção do nome era "seletores de dados",
esse arquivo **NÃO EXISTE** neste repositório. Não há camada de seletores derivados entre o
repositório e as telas: as telas chamam as funções de `src/data/repository.ts` direto via
`useQuery`, e a derivação (subtração, formatação, agrupamento por dia) acontece dentro do
componente ou em módulos de `src/domain/`.

---

### 11.23 Resumo das marcações de estado

**Implementadas e chamadas por tela (37):** `listItems`, `findItem`, `itemCosts`,
`itemHistory`, `recentCostChanges`, `labels`, `purchaseToBaseUnits`, `runningOut`,
`listPlaces`, `defaultLocationId`, `balanceByLocation`, `stockByPlace`, `itemMovements`,
`lastSentBaseUnits`, `listRecipes`, `loadRecipeGraph`, `recipesUsingItem`, `listProducts`,
`listLines`, `listTypes`, `listFlavors`, `openProductionRuns`, `productionOn`,
`productionBetween`, `recentRuns`, `lotsOn`, `findLot`, `expiringSoon`, `lotsInStock`,
`lotsInRoomAt`, `shipmentsOn`, `lossesOn`, `listOrders`, `stockAgainstOrders`, `pickingFor`,
`lastReadings`, `readingsBetween`, `briefingOrder`, `briefingHidden`, `alertSettings`,
`ordersNeedApproval`, `countForErase`, `planReversal`.

**Implementadas sem chamador de tela (3):**
- `unchecked` (`:2520`) — só teste; a tela usa `shipmentsOn(...).checked`;
- `assertTypeBelongsToLine` (`:3751`) — só `saveProduct`;
- `normalizePackagingItems` (`:91`) — só `saveProduct`.

**Implementada sem chamador nenhum (1):**
- `lastCostMove` (`:3389`) — nenhuma tela, nenhum assistente, **nenhum teste**.

**Não implementado nesta camada:**
- qualquer checagem de permissão ou capacidade antes de uma consulta;
- qualquer leitura de pessoas, papéis, PIN, aparelhos ou vínculos;
- leitura ou escrita de `movements.operator_id`, coluna que existe (`src/data/db.ts:322`);
- escrita ou leitura de `movement_kind` `'sale'`;
- escrita ou leitura dos postos de controle `'picked'`, `'loaded'`, `'delivered'`;
- reserva de estoque a partir de pedido;
- qualquer camada de seletores derivados entre repositório e tela.

**Discrepâncias factuais encontradas entre comentário e código:**
- `src/data/repository.ts:746` e `:4363` dizem "oito consultas" usando `NAO_ESTORNADO`;
  são **nove**;
- `src/data/repository.ts:2557-2560` diz que `occurred_at` aparece "nine times in this
  file"; hoje o arquivo tem muito mais ocorrências (o texto é de quando `productionOn`
  foi a primeira janela);
- `src/data/repository.ts:1476-1480` diz que a embalagem "sai certo, mas o estoque de
  palito só sobe" e que ligar os dois "é mudança de esquema... e vem separada desta" — mas
  a mudança **já aconteceu** e está no mesmo arquivo, em `packagingItems` (`:1379-1382`);
  o parágrafo descreve um estado que o código não tem mais;
- `src/data/repository.test.ts:3388-3394` deixou dois `console.log("    [dbg] ...")` de
  depuração no teste de validade.
