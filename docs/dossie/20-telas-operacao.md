## 20. Telas — produção, lote, pedido, transferência, compra, perda e locais

### 20.0 Mapa: rotas, arquivos, área, e o que cada tela escreve

Oito arquivos, oito rotas do `expo-router`. O roteador monta a rota pelo caminho
do arquivo dentro de `app/`, e todas estas telas são empilhadas sem cabeçalho
nativo — a pilha declara `headerShown: false` (`app/_layout.tsx:112`), então
nenhuma delas tem seta de voltar do sistema e cada uma precisa carregar a
própria porta de saída.

| Rota | Arquivo | Área (`AreaProvider`) | Escreve no banco | Chamada de onde |
|---|---|---|---|---|
| `/production/new` | `app/production/new.tsx` | `apricot` (`app/production/new.tsx:93`) | `openProductionRun`, `cancelProductionRun`, `closeProductionRun`, `recordProduction` | `app/(tabs)/production.tsx:231` e `:349` |
| `/lots/<lotId>` | `app/lots/[id].tsx` | `apricot` (`app/lots/[id].tsx:73`) | `reverseGroup` (`app/lots/[id].tsx:134`) | `app/(tabs)/production.tsx:287`, `app/places.tsx:566` |
| `/orders` | `app/orders/index.tsx` | `sage` (`app/orders/index.tsx:55`) | `setOrderStatus` (`app/orders/index.tsx:88`) | `app/(tabs)/more.tsx:93` |
| `/orders/new` | `app/orders/new.tsx` | `sage` (`app/orders/new.tsx:94`) | `saveOrder` (`app/orders/new.tsx:267`) | `app/orders/index.tsx:212` |
| `/transfer` | `app/transfer.tsx` | `lilac` (`app/transfer.tsx:71`) | `recordTransfer` ou `recordReturn` (`app/transfer.tsx:226-233`), `setOrderStatus` (`:279`) | `app/(tabs)/transport.tsx:254`, `app/places.tsx:356`, `app/transfer.tsx:319` (estado vazio manda para `/places`) |
| `/purchase` e `/purchase?itemId=<itemId>` | `app/purchase.tsx` | `sage` (`app/purchase.tsx:69`) | `recordPurchase` (`app/purchase.tsx:482`) | `app/(tabs)/more.tsx:94`, `app/inputs/[id].tsx:818` |
| `/losses` | `app/losses.tsx` | `apricot` (`app/losses.tsx:53`) | **nada** — é relatório | `app/(tabs)/reports.tsx:176` |
| `/places` | `app/places.tsx` | `mint` (`app/places.tsx:73`) | `savePlace` (`:154`, `:444`, `:658`), `recordReading` (`:494`) | `app/(tabs)/more.tsx:77`, `app/(tabs)/transport.tsx:186`, `app/orders/new.tsx:346`, `app/transfer.tsx:319` |

Duas ausências verificadas por listagem de diretório:

- **Não existe tela de detalhe nem de listagem de pedido individual.**
  `app/orders/` tem só `index.tsx` e `new.tsx`; não há `[id].tsx`. Pedido
  gravado não se edita — só muda de estado. **NÃO IMPLEMENTADO.**
- **Não existe tela de lançar perda.** `app/losses.tsx` é leitura. O único
  escritor de `recordLoss` em toda a árvore de telas é `app/inputs/[id].tsx:256`.

---

### 20.1 Convenções que estas oito telas repetem

Transcritas uma vez, sem repetir em cada subseção.

**Empresa.** Toda chamada passa `LOCAL_COMPANY_ID =
'00000000-0000-4000-8000-000000000001'` (`src/data/seed.ts:12`).

**Traço dos desenhos.** `const traco = skin === 'papel' ? 1.7 : 2.2`, repetido em
todas as oito (`app/production/new.tsx:123`, `app/lots/[id].tsx:87`,
`app/orders/index.tsx:66`, `app/orders/new.tsx:108`, `app/transfer.tsx:88`,
`app/purchase.tsx:83`, `app/losses.tsx:64`, `app/places.tsx:104`).

**Consulta.** `useQuery(run, key)` devolve `{ data, loading, error, refresh }` e
refaz a consulta a cada foco da tela — é isso que faz uma tela empilhada voltar
atualizada depois de outra ter gravado.

**Confirmação.** `useConfirm()` devolve `(request) => Promise<boolean>`;
`acknowledge: true` remove o botão de cancelar (é aviso, não pergunta) e
`destructive: true` desenha o diálogo na cor de perigo.

**A cascata não pula número.** `Reveal({ index })` escalona a entrada dos blocos
pelo índice, e blocos condicionais obrigam a **contar** o índice em vez de
escrevê-lo: `app/production/new.tsx:395` (`indiceAcao = draft ? 2 : 1`),
`app/lots/[id].tsx:152` (`iCorrecao = lote?.recipeName ? 2 : 1`),
`app/orders/index.tsx:97` (`antesDaLista = loading || pedidos.length === 0 ? 1 :
0`), `app/orders/new.tsx:312-314`, `app/purchase.tsx:211-214`,
`app/losses.tsx:108-109`, `app/places.tsx:169-170`. A razão escrita é sempre a
mesma: índice fixo com bloco ausente abre um vão de quarenta milissegundos no
meio da entrada.

**Números digitados.** `parseTyped(raw): number | null` na leitura e
`formatTyped(value, formatting, maxDecimals = 4)` na escrita
(`src/domain/number.ts:32`, `:85`). Nas telas de operação o padrão é
`Math.max(0, (parseTyped(texto) ?? 0) || 0)` — o `|| 0` existe para matar `NaN`.

**Dinheiro e taxa.** `fromDecimal(v) = Math.round(v * 100)`
(`src/domain/money.ts:11-13`); `rate(preço, unidadesBase) = preço * 100 /
unidadesBase` (`:52-55`); `amountOf(rate, qtd) = Math.round(rate * qtd)`
(`:58-60`). Taxa é centavo fracionário por unidade-base e nunca arredonda no
caminho; `Math.round(rate * 1_000)` é o custo a cada mil unidades-base, que é o
formato em que a compra mostra média.

**Frases.** `fill(template, values)` troca `{{chave}}`; `plural(n, {one, other},
display?)`; `joinList(itens, conjunção)`. O `de` de "18.000 g **de** polpa" vem
do dicionário (`t.common.amountOf = '{{amount}} de {{name}}'`,
`src/i18n/locales/pt-BR.ts:15`) e a conjunção também (`t.common.and = 'e'`,
`:17`) — cravar no template deixaria a frase em português dentro da interface
inglesa.

---

### 20.2 `/production/new` — Lançar produção

O arquivo tem 641 linhas e é a tela mais densa do aplicativo.

#### 20.2.1 A decisão de desenho que inverteu a ordem dos campos

Registrada no docblock (`app/production/new.tsx:51-90`), e é decisão do dono:
*"Produzi 480 picolés" é o fato; "rodei um tacho" é a conta que leva até ele.
Perguntar a conta antes do fato obriga quem está de luva a responder uma pergunta
que só o sistema deveria fazer a si mesmo.* Consequência concreta: **a unidade
vem primeiro** e o número de vezes que a receita rodou fica atrás de um toque.
Quem trabalha por tacho abre o detalhe uma vez e ganha o pré-preenchido da ficha;
quem só conta caixa nunca abre.

#### 20.2.2 A consulta de abertura — seis em paralelo

`app/production/new.tsx:125-140`:

| Chamada | Para quê |
|---|---|
| `listProducts(LOCAL_COMPANY_ID)` | os produtos; **filtrados por `p.recipeId`** na linha 139 — revenda não se produz |
| `loadRecipeGraph(LOCAL_COMPANY_ID)` | `Record<string, Recipe>`, para explodir a receita |
| `listItems(LOCAL_COMPANY_ID, undefined, false, defaultLocationId(LOCAL_COMPANY_ID))` | o saldo **da sala em que o tacho roda** |
| `labels(LOCAL_COMPANY_ID)` | `Record<id, nome>` de itens e receitas |
| `openProductionRuns(LOCAL_COMPANY_ID)` | os tachos abertos |
| `stockByPlace(LOCAL_COMPANY_ID)` | onde mais está o insumo que falta aqui |

O quarto argumento do `listItems` é cicatriz escrita no próprio comentário
(`:126-130`): ler o total da empresa aqui era **a Lei 5 ao contrário** — a tela
dizia que havia polpa, liberava o botão, e o piso do livro-razão (que conta a
sala) recusava a corrida com erro em inglês. Com a polpa na câmara fria, *toda*
corrida batia nessa parede.

#### 20.2.3 Estado local

`productId`, `batchText`, `showBatches`, `unitsText`, `unitsTyped`, `saving`
(`:142-147`). O `unitsTyped` existe porque o campo de unidades nasce preenchido
com o previsto: enquanto ninguém digitou, o valor mostrado é derivado; a partir do
primeiro toque, é o que a pessoa escreveu (`:437-441`).

Produto escolhido com queda para o primeiro da lista:
`data?.products.find(p => p.id === productId) ?? data?.products[0] ?? null`
(`:149`).

#### 20.2.4 As quatro contas da tela, transcritas

```ts
function plannedUnits(recipe: Recipe, product: Product, batches: number): number {
  const net = recipe.yieldAmount * (1 - recipe.lossFraction);
  const perUnit = product.yieldPerUnit ?? 0;
  if (perUnit <= 0) return 0;
  return Math.floor((net / perUnit) * batches);
}
```
(`app/production/new.tsx:111-116`.) `Math.floor`, não `round`: meia unidade não
sai do tacho.

- `batches = Math.max(0, (parseTyped(batchText) ?? 0) || 0)` (`:151`).
- `planned = plannedUnits(recipe, selected, batches > 0 ? batches : 1)` (`:165`)
  — **um** tacho enquanto ninguém declarou outro, para o campo não nascer vazio.
- `units = unitsTyped ? Math.max(0, (parseTyped(unitsText) ?? 0) || 0) : planned`
  (`:168`).
- `perBatch = plannedUnits(recipe, selected, 1)` (`:171`) — o que um tacho cheio
  renderia deste produto.
- `consumedBatches = batches > 0 ? batches : perBatch > 0 ? units / perBatch : 0`
  (`:189`).

A última é a regra de negócio da tela, e o comentário (`:173-188`) dá as duas
razões: **com tacho declarado, o consumo é do tacho** (quem rodou um tacho e tirou
400 em vez de 480 gastou a polpa inteira, e a diferença é rendimento perdido);
**sem tacho declarado, o consumo é proporcional ao que saiu** (quem só conta caixa
não afirmou ter gasto um tacho inteiro). Antes disso o rascunho simplesmente não
existia sem tacho, e nada baixava do almoxarifado.

#### 20.2.5 O rascunho (`draft`) — a prévia do que vai ser gravado

`app/production/new.tsx:191-245`. Devolve `null` quando falta qualquer coisa:
`!selected?.recipeId || !data || !recipe || consumedBatches <= 0 || units <= 0`.

1. `needed = explodeRequirements(selected.recipeId, consumedBatches, data.graph)`
   (`:194`). A explosão é recursiva sobre sub-receitas e converte pelo rendimento
   **líquido** da sub-receita: `netYield = sub.yieldAmount * (1 -
   sub.lossFraction)`, `subBatches = (line.quantity * batches) / netYield`
   (`src/domain/recipe.ts:300-302`). Ciclo levanta `RecipeCycleError`, receita
   ausente levanta `MissingRecipeError` (`:285-288`).
2. **A embalagem entra por unidade, não por tacho** (`:203-205`):
   `needed[itemId] += linha.quantityPerUnit * units`. Sem isso a tela mentiria
   duas vezes na mesma corrida — "vai baixar do estoque" esconderia o palito, e o
   custo previsto sairia menor que o congelado.
3. `salaDoTacho = defaultLocationId(LOCAL_COMPANY_ID)`; `nossasSalas` são os
   lugares do `stockByPlace` que **não** são a sala do tacho e cujo `kind` está em
   `INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room']`
   (`src/domain/ledger.ts:68`) — `:213-218`. O que já foi entregue numa loja não
   volta para o tacho.
4. Cada linha do rascunho: `{ itemId, name: data.names[itemId] ?? itemId,
   baseUnits, unit: item?.baseUnit ?? '', rate: item?.averageRate ?? 0, held:
   item?.onHandBaseUnits ?? 0, elsewhere }`, onde `elsewhere` lista
   `{ room, baseUnits }` só das salas com saldo positivo daquele item (`:220-236`).
   O nome da sala em branco cai para `t.app.places.factory` (`:231`).
5. `value = Σ (rate × baseUnits)`; `short = lines.filter(l => l.held <
   l.baseUnits)` (`:238-239`).
6. `unitCostRate = value / units + selected.unitPackagingCents` (`:243-244`) — a
   mesma conta que o livro-razão vai congelar.

#### 20.2.6 Os campos, um por um

| Bloco | Rótulo (pt-BR) | Tipo | Valor inicial | Dica |
|---|---|---|---|---|
| escolha do produto | — | fileira de `Chip` tocáveis, `signal: 'ok'` no escolhido e `'neutral'` nos outros (`:428`) | primeiro produto com receita | — |
| unidades | `Quantas unidades saíram` | `Field` numérico (`:435-448`) | `planned` quando > 0, senão vazio | `A ficha prevê {{units}}` quando `planned > 0`; senão `O que saiu de verdade. Se rendeu menos que o previsto, é aqui que a perda aparece.` |
| vezes que a receita rodou | `Quantas vezes a receita rodou` | `Field` numérico, só depois de tocar `Informar pela receita` (`:454-486`) | `'1'` no primeiro toque (`:478`) | `Cada vez rende {{yield}}. É isto que decide quanto de insumo sai do almoxarifado.` com `yield = "{quantidade} {recipe.yieldUnit}"` |

O alvo de cada `Chip` de sabor cresce com `paddingVertical: space.xs` sem virar
caixa — *"de luva, quatro pixels de folga em volta da etiqueta são a diferença
entre pegar o sabor de primeira e pegar o de baixo"* (`:423-426`).

A dica do campo de tacho fala **na unidade que o dono escolheu na receita**
(`recipe.yieldUnit`, `:466`). Antes ela dizia "quantos tachos", que é palavra de
fábrica de sorvete — e `yieldUnit` só chegou ao domínio por isso
(`src/domain/recipe.ts:49-58`).

#### 20.2.7 Os três fatos derivados que a tela imprime

- **Embalado**: `packed = formatPacked(units, selected.packaging, t.units,
  locale)` (`:366-369`), impresso como `dá {{packed}}` (`words.packedAs`). O
  comentário fixa a regra: *250 é "5 caixas de 50", e 263 é "5 caixas de 50 e 13
  unidades" — dizer só as caixas esconderia treze picolés que existem*
  (`:363-365`).
- **Tacho em curso**: `Chip signal="neutral"` com `Em curso desde {{time}}`
  (`words.running`), `time = formatTime(aberta.openedAt, locale)` (`:490-495`).
- **A quebra de rendimento**: `missed = batches > 0 && planned > 0 && units > 0 &&
  units !== planned` (`:392`). Só existe contra tacho **declarado** — comparar o
  que saiu contra a própria sugestão inventaria uma diferença que ninguém
  prometeu. O `Chip` é `'warning'` quando saiu menos e `'ok'` quando saiu mais
  (`:508`), com os textos:
  - `shortfall: '▼ {{units}} a menos que o previsto · {{percent}}%'`
  - `over: '▲ {{units}} a mais que o previsto'`
  e `percent = Math.round((Math.abs(planned - units) / planned) * 100)` (`:515`).

#### 20.2.8 O cartão "Vai baixar do estoque"

`:530-592`. Só existe quando há rascunho — *"um cartão dizendo zero baixaria
nada"*. O `hue` é `color.warning` quando `draft.short.length > 0` e
`palette.mint` (assunto insumo) quando não (`:533`): **o cartão inteiro muda de
cor**, porque a falta não é detalhe de uma linha, é o motivo de a corrida não
passar.

- Uma `ListRow` por insumo, `trailing = "{quantidade} {unidade}"`,
  `trailingTone="muted"`, `signal="warning"` na linha que não tem saldo (`:541-549`).
- Falta: `Falta insumo para esta corrida: {{items}}. Confira o estoque deles, ou
  lance a compra que chegou.` (`words.missingStock`), com `items` = nomes unidos
  por `, ` (`:551-557`).
- Onde está o que falta: `Tem {{item}}: {{where}}. Traga para o almoxarifado antes
  de rodar.` (`words.missingElsewhere`), com cada `where` escrito
  `"{quantidade} {unidade} na {sala}"` — a preposição é a chave
  `words.missingIn = 'na'` (`:562-579`). Razão escrita: *uma parede que diz "falta
  polpa" com dezoito quilos de polpa na câmara a três metros é a Lei 5 pela
  metade: impede, e não orienta.*
- Fecho do cartão: sobrelinha `CUSTO POR UNIDADE` e figura
  `formatMoney(Math.round(draft.unitCostRate), locale)` (`:584-589`).

#### 20.2.9 Os três atos

**`onOpen` — começar agora** (`:250-265`). `quantos = batches > 0 ? batches : 1`;
se o campo de tacho estava fechado, ele abre e recebe `String(quantos)`; chama
`openProductionRun(company, { productId, batches: quantos })` e faz
`router.back()`. Sem confirmação: nada foi lançado. O comentário justifica o
`router.back()` — *quem marca o tacho marca e sai andando; ficar no formulário
depois de abrir é ficar parado numa tela que só terá o que dizer quando a corrida
acabar.*

**`onCancel` — cancelar o tacho** (`:267-277`). Confirma com
`cancelTitle: 'Cancelar esta produção?'` e `cancelBody: 'Nada foi lançado ainda,
então não há o que estornar.'`, `confirmLabel: words.cancel`; chama
`cancelProductionRun` e `refresh()`.

**`onRecord` — gravar** (`:279-361`). Confirma, e só então escreve. Com tacho
aberto chama `closeProductionRun`; sem tacho aberto, `recordProduction`
(`:314-334`).

#### 20.2.10 A confirmação, com os números por extenso

Dois templates, e a escolha é `batches > 0` (`app/production/new.tsx:287`):

```
confirmTitle:       'Confirmar a produção'
confirmAction:      'Registrar'
confirmBody:        'Você produziu {{units}} de {{product}}, rodando a receita
                     {{batches}}. Isso baixa {{lines}} do estoque e congela o
                     custo em {{cost}} por unidade.'
confirmBodyNoBatch: 'Você produziu {{units}} de {{product}}. Isso baixa {{lines}}
                     do estoque e congela o custo em {{cost}} por unidade.'
```
(`src/i18n/locales/pt-BR.ts:827-831`.)

Preenchimento (`app/production/new.tsx:287-304`):

- `units` = `plural(units, {one: 'uma unidade', other: '{{n}} unidades'},
  formatQuantity(units, locale))`
- `batches` = `plural(batches, {one: 'uma vez', other: '{{n}} vezes'}, …)`
- `lines` = `joinList(draft.lines.map(l => fill(t.common.amountOf, { amount:
  "{qtd} {unidade}", name: l.name })), t.common.and)`
- `cost` = `formatMoney(Math.round(draft.unitCostRate), locale)`

O comentário da linha 285 registra por que existem dois: *sem tacho declarado a
frase não fala em tacho: dizer "em 0 tachos" seria confirmar uma coisa que a
pessoa não disse.*

#### 20.2.11 O botão, e a Lei 5 escrita como cicatriz

`:601-609`. Rótulo: `saving ? 'Registrando…' : aberta ? 'Fechar a produção' :
'Registrar produção'`. `weighty` (vibra). **`disabled = !draft || saving ||
draft.short.length > 0`**.

O comentário acima do botão (`:594-600`, escrito em inglês no arquivo) é o
registro do defeito que essa terceira condição conserta: a tela calculava a
falta, imprimia em laranja e **deixava o botão vivo** — uma corrida de dez tachos
contra quatro quilos de polpa entrou, e o almoxarifado foi a **menos 140.000 g**
com a manchete dizendo `PARADO NO ESTOQUE -R$ 1.447,44`.

#### 20.2.12 Estados de erro

`:340-357`. Duas frases, escolhidas pelo tipo do erro:

| Erro | Título | Corpo |
|---|---|---|
| `NotEnoughStockError` | `Falta insumo para esta produção` (`words.missingTitle`) | `Falta insumo para esta corrida: {{items}}. Confira o estoque deles, ou lance a compra que chegou.` com `items = e.missing.map(m => m.name).join(', ')` |
| qualquer outro `Error` | `Não deu para registrar` (`words.failed`) | `e.message` cru |
| não-`Error` | `Não deu para registrar` | `String(e)` |

Sempre com `acknowledge: true`. O comentário (`:341-346`) diz por que a tradução
mora aqui: `NotEnoughStockError.message` é `Not enough stock: Polpa de morango` —
inglês de programador chegando cru num diálogo, num aplicativo que não guarda uma
palavra em tela nenhuma. **O erro carrega fato** (`missing: { itemId, name,
needed, held }[]`, `src/data/repository.ts:1302-1309`) e quem escreve português é a
tela.

#### 20.2.13 Estado vazio

`:371-387`. Quando `!loading && (!data || data.products.length === 0)`: um cartão
só, `hue = palette.apricot`, com `noRecipes: 'Nenhum produto tem ficha técnica
ainda. Cadastre a receita primeiro.'` **E sem botão de saída** — o comentário
assume: *a saída aqui é a receita, que se cadastra noutra tela e não se navega
daqui.*

#### 20.2.14 O que `recordProduction` grava — o ato completo

`src/data/repository.ts:1311-1619`. Assinatura:

```ts
recordProduction(companyId, {
  productId, locationId, batches, unitsProduced, producedOn,
  lotCode?, occurredAt?, note?, assistantPhrase?
}): Promise<ProductionResult>
```

`producedOn` é **obrigatório e sem valor padrão de propósito** (`:1327-1339`): o
livro-razão guarda um instante (`occurred_at`), e a data do lote é outra coisa —
o dia local. Derivar aqui repetiria o defeito que já custou uma rodada: *meia-noite
de 3 de setembro em Madri é 2 de setembro em UTC, e o lote nasceria com a data de
ontem em metade do mundo.*

**Validações, na ordem** (`:1351-1359`):

| Condição | Mensagem lançada |
|---|---|
| produto não existe | `produto ${productId} não existe` |
| `!product.recipeId` | `${product.name} é revenda: não se produz` |
| `batches <= 0` | `uma corrida tem pelo menos um tacho` |
| `unitsProduced <= 0` | `uma corrida que não rendeu nada é um erro, não um fato` |
| receita fora do grafo | `a receita de ${product.name} não está no aparelho` |

**Consumo.** `needed = explodeRequirements(recipeId, batches, graph)`, mais a
embalagem por unidade produzida: `needed[itemId] += linha.quantityPerUnit *
unitsProduced` (`:1379-1382`). O comentário diz o que essa linha conserta: antes
dela o custo saía certo e **o estoque mentia** — o palito só subia, corrida após
corrida.

**Arredondamento.** Uma vez, na quantidade: `const quantity =
Math.round(baseUnits)` (`:1406`), e `consumedValue += rate * quantity`. A razão
está escrita (`:1394-1405`): `quantity_base_units` é `INTEGER` no aparelho e
`bigint` no servidor, e uma sub-receita divide — meio tacho de base de creme pede
`7530,612244897959 g` de açúcar. A afinidade de tipo do SQLite aceitava o `REAL`
calado e o Postgres arredondaria, então os dois lados passariam a discordar. A
tela de insumos mostrava `34.938,776 g` e a de lugares `34.939 g`: **dois números
para o mesmo saco.**

**O piso, antes da escrita** (`:1437-1465`):

```sql
SELECT m.item_id, i.name, COALESCE(SUM(m.quantity_base_units), 0) AS on_hand
  FROM movements m JOIN items i ON i.id = m.item_id
 WHERE m.company_id = ? AND m.location_id = ?
 GROUP BY m.item_id, i.name
```

`missing` são as linhas com `held < needed`; havendo qualquer uma, lança
`NotEnoughStockError` com os nomes vindos de `labels(companyId)` — porque o insumo
que falta pode ter **zero linha** em `movements` naquela sala e sumir da consulta,
e a tela mostraria o uuid. Duas cicatrizes escritas aqui: a guarda existe no
caminho de escrita e não no botão porque o razão recebe escrita de mais de um
lugar (a simulação levou a polpa a **menos 192.000 g** sem uma reclamação), e o
piso é o **da sala**, não o da empresa — bastava mandar um saco de açúcar para a
loja para a conta autorizar um tacho com açúcar a dez quilômetros.

**A taxa congelada.** `unitCostRate = (consumedValue / unitsProduced +
product.unitPackagingCents) as Rate` (`:1481`).

**O lote.** `expires = expiresOn(input.producedOn, product.shelfLifeDays)`
(`:1485`).

**Dentro da transação** (`:1488-1610`), nesta ordem:

1. `ensureLocation(conn, companyId)`.
2. Conta os lotes **do dia**: `SELECT COUNT(*) AS n FROM lots WHERE company_id = ?
   AND produced_on = ?`; `code = input.lotCode ?? lotCode(producedOn, n + 1)`
   (`:1502-1506`). O comentário: *a sequência conta os lotes do dia, não do banco
   inteiro: o código diz "segunda corrida de 2 de setembro", que é o que alguém lê
   em voz alta no telefone durante um recall.*
3. `INSERT INTO lots (id, company_id, item_id, code, produced_on, expires_on,
   recipe_version_id, created_at)` + `enqueue`. **O lote nasce antes das linhas
   que o citam**, e não é estética: a fila do aparelho sobe na ordem em que foi
   escrita, e o servidor tem chave estrangeira de `movements.lot_id` para `lots`,
   que o SQLite daqui não tem — invertida, a fila seria aceita aqui e recusada lá,
   e o defeito só apareceria no primeiro celular sem sinal (`:1491-1498`).
4. Lê `item_costs.average_rate` do **produto** e o saldo dele
   (`SELECT SUM(quantity_base_units) … WHERE company_id = ? AND item_id = ?` — sem
   filtro de sala, `:1566-1570`), monta `antes: StockCostState` e calcula
   `mediaNova = blendRate(antes, { baseUnits: unitsProduced, rate: unitCostRate })`
   (`:1580-1583`). O que entra na média é a **taxa congelada**, não a soma dos
   consumos: ela já carrega `unitPackagingCents`, que é dinheiro do produto e não
   sai de movimento nenhum.
5. `INSERT INTO item_costs … ON CONFLICT(item_id) DO UPDATE` e `INSERT INTO
   item_cost_history (id, company_id, item_id, previous_rate, new_rate,
   observed_at)` (`:1585-1598`).
6. As linhas do razão, todas com o mesmo `movement_group_id = groupId`, o mesmo
   `occurred_at` e o mesmo `location_id = input.locationId`:

| Linha | `kind` | `quantity_base_units` | `unit_cost_rate` | `lot_id` |
|---|---|---|---|---|
| o produto que saiu | `production` | `+unitsProduced` | `unitCostRate` | **o lote novo** |
| cada insumo, um por linha | `consumption` | `-baseUnits` | a taxa média daquele item | `null` |

   (`:1606-1609`.) A decisão de o consumo **não** levar o lote está escrita
   (`:1600-1605`): o lote do insumo é o da nota em que ele entrou, e carimbar o
   lote do picolé na saída da polpa faria o recall recolher o saco de açúcar.
   *Consumo por lote é PEPS de insumo, que é trabalho da Fase 3.* **NÃO
   IMPLEMENTADO.**

Devolve `{ groupId, unitsProduced, unitCostRate, consumed, lot: { id, code,
expiresOn } }` (`:1612-1618`).

#### 20.2.15 A corrida aberta: estado, não movimento

Tabela (`src/data/db.ts:394-402`):

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

- **`openProductionRun`** (`src/data/repository.ts:2260-2305`). Recusa
  `batches <= 0` ou não finito com `um tacho tem de ser mais que zero`; recusa
  produto inexistente e revenda com as mesmas frases do `recordProduction`.
  **Não valida saldo, e isso é decisão e não esquecimento** (`:2252-2258`): na
  abertura a falta é uma previsão, e recusar a abertura não impede o tacho de estar
  rodando — só deixa a corrida sem registro. Grava `recipe.versionId` na coluna
  `recipe_version_id`, e a cicatriz está escrita: ali entrava `product.recipeId`, e
  nada quebrava porque ninguém lia de volta (`:2281-2287`). **A linha não entra na
  fila de sincronização** — não há `enqueue` nesta função.
- **`openProductionRuns`** (`:2308-2340`) devolve `OpenRun[]` = `{ id, productId,
  productName, recipeId, recipeVersionId, batches, locationId, openedAt }`,
  ordenado por `opened_at`. *Vazio é o estado normal de uma fábrica parada.*
- **`cancelProductionRun`** (`:2349-2355`): `DELETE FROM production_runs WHERE id =
  ? AND company_id = ?`. Não escreve nada no razão — *é aqui que "estado, não
  movimento" se paga: não existe estorno porque não existe lançamento. E não
  pergunta motivo: o app não fiscaliza.*
- **`closeProductionRun`** (`:2365-2407`): acha a corrida (senão lança
  `RunGoneError`, `:2245-2250`), chama `recordProduction` com
  `occurredAt: run.openedAt`, `batches: run.batches`, `locationId:
  run.locationId`, e **só depois** apaga a linha. Se a produção falhar por falta de
  insumo, a corrida continua aberta e a pessoa lança a compra e fecha de novo, em
  vez de perder o registro do tacho que rodou. Fechar duas vezes por toque repetido
  é impossível: a segunda não acha a corrida.

A tela traduz `openedAt` em dia local antes de passar:
`producedOn: localDate(aberta.openedAt, locale.timeZone)`
(`app/production/new.tsx:321`) — *uma corrida que começou às 23h de segunda e
fechou à 1h de terça é produção de segunda, e é essa data que vai na etiqueta.*
Sem corrida aberta, `producedOn: localDate(nowIso(), locale.timeZone)` (`:332`).

---

### 20.3 `/lots/<lotId>` — A etiqueta do lote

`app/lots/[id].tsx`, 321 linhas. É a **prova visual da etiqueta antes de existir
impressora** (`:26-29`): a escolha de qual impressora a fábrica compra é do dono e
muda o formato do papel, não o conteúdo, então o conteúdo entra primeiro.
**Impressão: NÃO IMPLEMENTADA** — não há chamada de impressão em nenhum lugar do
arquivo.

#### 20.3.1 A consulta

`:94-98`. `findLot(company, id)`; se o lote existe e tem `runGroupId`, também
`planReversal(company, lot.runGroupId)`. O plano vem **junto com o lote, e não no
toque do botão**: a Lei 5 pede que o erro impeça em vez de reclamar, então a tela
diz antes que a carga já saiu, com o item pelo nome.

`findLot` (`src/data/repository.ts:3120-3161`) — devolve `null` quando o lote não
existe, e **não lança**: *etiqueta se abre por link, e link envelhece.* A consulta
usa três `LEFT JOIN` de propósito (`:3133-3143`), porque lote de importação não
tem ficha e ainda assim tem de abrir a tela inteira:

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

#### 20.3.2 A folha — a única caixa desenhada à mão no aplicativo

Três constantes locais, e não tokens de tema (`:66-69`):

```ts
const PAPEL = '#FFFFFF';
const TINTA = '#111111';
const TINTA_FRACA = '#333333';
```

Papel branco com tinta preta **em qualquer tema**, porque é o que sai da
impressora. É exceção registrada em `src/language.test.ts` (citada em `:59-63`). O
único token que a folha pega do tema é o **canto** (`radius.sm`), que no Papel é
quase reto, como etiqueta de verdade. Contorno em `tint(TINTA, 0.12)` e régua em
`tint(TINTA, 0.22)`, ambas de espessura `StyleSheet.hairlineWidth` (`:316-319`).

Conteúdo da folha, na ordem (`:193-240`):

1. o nome do produto, `type.cardTitle`, centrado;
2. `<QrCode text={lote.code} size={200} />`;
3. o código **por extenso**, `type.figure`, `letterSpacing: 1.5`,
   `fontVariant: ['tabular-nums']`;
4. a régua horizontal;
5. `produzido em {{date}}` com `formatCalendarDate(lote.producedOn, locale)` — só
   quando `producedOn` existe;
6. `válido até {{date}}`, ou `não vence` quando `expiresOn` é nulo;
7. quanto rendeu: `plural(lote.baseUnits, t.units.unit, formatQuantity(…))`.

Fora da folha, ainda dentro do cartão, a frase que abre a conta do código
duplicado (`words.why`): `O código aparece duas vezes de propósito: quando a
etiqueta congela ou descasca, alguém digita os onze caracteres e a conferência
segue.`

O docblock lista o que **fica fora** da etiqueta e por quê (`:31-34`): só entra
*o que é, de que lote, quando foi feito, até quando vale e quanto rendeu* —
*etiqueta cheia é etiqueta que ninguém lê.*

#### 20.3.3 O QR: o que vai dentro dele

`src/components/QrCode.tsx:20-29` desenha um `<Svg>` com um `<Rect>` branco e um
`<Path>` preto. Três decisões, todas no domínio (`src/domain/qr.ts`):

- **O QR carrega o código do lote (`20260902-01`, onze caracteres), não o uuid.**
  A conta está escrita (`:13-19`): o código cabe na versão 1 do padrão, grade de
  21 × 21, a menor que existe; o uuid de trinta e seis caracteres exigiria a versão
  3, 29 × 29 — numa etiqueta de quatro centímetros o módulo cai de 1,9 mm para
  1,4 mm, e perde-se um quarto do tamanho justamente na distância em que a leitura
  já é difícil. O segundo motivo vale mais: **o código do lote é legível por
  gente.**
- **Correção de erro `H`**, a mais alta, que recupera 30% do código danificado
  (`src/domain/qr.ts:38`). Foi escolhida medindo: com onze caracteres os quatro
  níveis cabem na mesma grade de 21 × 21, e a mutação que trocava `M` por `H`
  sobreviveu à suíte porque não era defeito, era melhoria (`:27-35`).
- **`QUIET_ZONE = 4`** módulos de branco em volta (`:51`), exigidos pelo padrão:
  sem eles o papelão da caixa encosta no código e o leitor desiste. `span =
  modules.length + QUIET_ZONE * 2`, e o caminho é **um** `path` com 441 nós
  concatenados em vez de 441 retângulos, porque nó de SVG custa quadro em celular
  barato (`:61-73`).
- Preto sobre branco fixo: em modo escuro um código claro sobre fundo escuro é
  invertido e metade dos leitores recusa (`src/components/QrCode.tsx:16-18`).

#### 20.3.4 O código e a validade, como se calculam

`src/domain/lot.ts`:

```ts
export function lotCode(producedOn: string, sequence: number): string {
  const day = producedOn.replaceAll('-', '');
  return `${day}-${String(sequence).padStart(2, '0')}`;
}
```
(`:33-36`) — `AAAAMMDD-NN`. Ordena sozinho, cabe num código de barras curto, e uma
pessoa lê em voz alta pelo telefone sem soletrar.

```ts
export function expiresOn(producedOn: string, shelfLifeDays: number | null): string | null {
  if (shelfLifeDays === null || !Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0) return null;
  const [y, m, d] = producedOn.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d + Math.floor(shelfLifeDays)));
  return at.toISOString().slice(0, 10);
}
```
(`:49-55`) — soma dias de **calendário** sem passar por fuso: `2026-09-02` mais
180 dias é `2027-03-01` seja onde for que o celular esteja. Nulo quando o produto
não tem prazo, *e a ausência é dado, não falha*.

Também existe `daysUntilExpiry(expires, today): number | null` (`:64-72`),
negativo quando vencido — devolve número e não booleano porque "venceu ontem" e
"vence em três dias" pedem tratamentos diferentes na tela. **Não é chamado por
esta tela.**

As duas decisões de negócio do lote estão no topo do arquivo (`:8-19`): **um lote
por corrida**, não por dia nem por produto (*se o tacho da manhã derreteu e o da
tarde não, o recall é do tacho da manhã*), e **a validade sai da produção, não da
digitação** (o produto sabe; o aparelho pergunta uma vez, no cadastro).

#### 20.3.5 "A corrida" — a ficha que rodou

`:259-273`. Só aparece quando `lote.recipeName` existe **e** `lote.recipeVersion
!== null`. Cartão `apricot` com o tacho no crachá, título `A corrida`:

- `Saiu da ficha {{recipe}}, versão {{version}}.`
- `Corrigir a ficha depois não muda este lote: ele guarda a versão que estava
  valendo no dia.`

O comentário diz por que essa linha existe (`:250-258`): `production_runs`
guardava a versão e é apagada ao fechar; o movimento congela a **taxa**, que é o
resultado da ficha, não a identidade dela. Sem o carimbo, corrigir a fórmula em
março reescreve o que janeiro custou — o número continua certo e a pergunta *"de
que ficha veio?"* passa a responder a receita de hoje. E fica **fora do papel
branco**: a etiqueta só leva o que serve para achar e recolher o produto.

#### 20.3.6 A correção da corrida — o estorno

`:275-310`, e é o único ato que esta tela grava. Três estados, mutuamente
exclusivos:

| Estado | O que a tela mostra |
|---|---|
| `plano.alreadyReversed` | cartão âmbar: `Esta corrida já foi corrigida.` |
| `plano.blocked.length > 0` | cartão âmbar: `Não dá para corrigir: {{items}} já saiu daqui.` com cada item escrito `{{name}} — tem {{held}}, precisaria de {{needed}}`, unidos por ` · `; abaixo, `Traga a carga de volta primeiro, aí a correção passa a valer.` |
| nenhum dos dois | um `Button variant="ghost"` solto, sem cartão: `Corrigir esta corrida` |

O comentário explica a ausência de cartão em volta do botão (`:304-307`):
*corrigir é o caminho raro. Botão grande e colorido convida, e ninguém deve ser
convidado a estornar — e uma caixa em volta de um botão só é caixa vazia.*

A confirmação (`:116-137`) é `destructive: true` e diz os dois lados por extenso:

```
reverseTitle:   'Corrigir a corrida {{code}}?'
reverseBody:    'Sai do estoque {{out}}. Volta para o almoxarifado {{back}}.
                 Os dois lançamentos ficam no histórico — nada é apagado.'
reverseConfirm: 'Corrigir'
```

`out` são as pernas do plano com `baseUnits < 0` e `back` as com `baseUnits > 0`,
cada uma escrita `fill(t.common.amountOf, { amount: "{qtd} {unidade}", name })` e
unidas por ` · ` (`:118-128`). Depois do sim: `reverseGroup(company, { groupId:
lote.runGroupId })`, `refresh()` e `router.back()`.

A palavra "estorno" **não aparece na tela** — decisão registrada no dicionário
(`src/i18n/locales/pt-BR.ts:194-196`): *vocabulário de contador, e quem lança a
corrida é quem estava no tacho.*

#### 20.3.7 `planReversal` e `reverseGroup`

`planReversal(companyId, groupId): Promise<ReversalPlan>`
(`src/data/repository.ts:4245-4314`). Existe separado da escrita **por razão de
tom de voz**: a confirmação diz o que vai acontecer com os números por extenso, e
para isso a tela precisa da conta antes do ato. A checagem roda de novo dentro da
transação — *esta aqui é para falar, aquela é para valer* (`:4236-4243`).

- Lê as pernas do grupo com `kind <> 'reversal'`, ordenadas por
  `quantity_base_units DESC`, e marca `reversed` por
  `EXISTS (SELECT 1 FROM movements r WHERE r.reverses_movement_id = m.id AND
  r.company_id = m.company_id)`.
- Grupo inexistente lança `grupo ${groupId} não existe`.
- `legs[].baseUnits = -quantity_base_units` — o contrário do que o movimento
  original fez.
- `alreadyReversed = legs.some(l => l.reversed === 1)`.
- `blocked`: para cada perna **negativa** do plano (ou seja, o que o estorno
  *tira*), lê o saldo em `item@location` e inclui a perna quando
  `tem + leg.baseUnits < 0`, com `{ itemId, name, held, needed: -leg.baseUnits,
  baseUnit }`. Uma consulta só para todas as pernas, e a soma é a mesma de
  `balanceByLocation` — *duas aritméticas para "quanto tem aqui" seriam duas
  verdades.*

`reverseGroup(companyId, { groupId, occurredAt?, note? })`
(`:4442-4525`):

1. Planeja; se `alreadyReversed` ou `blocked.length > 0`, lança
   `CannotReverseError`, que **carrega o plano inteiro** (`:4225-4234`).
2. Dentro da transação, **planeja de novo** — *entre planejar e gravar cabe uma
   remessa de outro aparelho.*
3. Para cada movimento original, insere um `kind = 'reversal'` com
   `quantity_base_units = -o.quantity_base_units`, o **mesmo** `unit_cost_rate`,
   `location_id`, `counterpart_location_id` e `lot_id` do original,
   `reverses_movement_id = o.id`, e um `movement_group_id` **novo**, compartilhado
   entre as pernas do estorno. A taxa é a do original porque *ler a média de hoje
   avaliaria o erro de setembro ao preço de outubro.*
4. **Fora da transação**, chama `recomputeItemCost(companyId, itemId)` para cada
   item tocado (`:4520-4522`). Fora de propósito: a recomposição lê o razão inteiro
   do item e precisa enxergar as pernas que acabaram de ser escritas; se falhar, o
   razão já está certo e a média é cache.

A cicatriz está escrita (`:4319-4332`): `reverseGroup` devolvia a quantidade e
**deixava o dinheiro**. Quem digitasse 50 onde saíram 500 corrigia o estoque e
ficava com o custo dez vezes alto embaixo de todo número de dinheiro do aplicativo
— enquanto a confirmação que ele leu dizia que nada é apagado. Não dá para
"desmisturar" uma média móvel (ela é dependente do caminho); o que dá é replicar
o caminho inteiro do zero.

**O lote continua existindo depois do estorno** (`:4437-4440`): ele é identidade,
não quantidade — o saldo dele vai a zero pelo movimento, e apagar a linha seria a
exclusão que a fundação proíbe, além de quebrar o rastro de uma etiqueta que talvez
já esteja colada numa caixa.

#### 20.3.8 Lote que não existe

`:162-178`. `!loading && !lote` desenha o cartão com `Esse lote não está mais
aqui.` e um `Button variant="ghost"` rotulado `t.app.tabs.production` que faz
`router.push('/production')`. O comentário nomeia a razão: a pilha não tem
cabeçalho com seta, então uma tela que só diz "não está mais aqui" deixa a pessoa
**sem porta**.

---

### 20.4 `/orders` — Pedidos

`app/orders/index.tsx`, 222 linhas.

**A frase que governa a tela inteira** (`:25-26`): *nenhum botão aqui move
estoque. Aprovar, entregar e cancelar mexem no estado do pedido; o que tira caixa
do freezer é a carga, na transferência.*

#### 20.4.1 Consulta e ordem

`useQuery(() => listOrders(LOCAL_COMPANY_ID))` (`:68`) — sem argumentos de
status, então vale o padrão `['pending', 'open']`
(`src/data/repository.ts:4036`). A ordem é do **compromisso**, não da digitação:

```sql
ORDER BY o.requested_for IS NULL, o.requested_for, o.created_at
```
(`:4054`) — quem pediu para amanhã aparece antes de quem pediu para sexta, e quem
não marcou dia vai para o fim.

`listOrders` faz **duas** consultas e não uma por pedido (`:4027-4033`): *uma
fábrica com quarenta pedidos abertos faria quarenta e uma idas ao banco na abertura
da tela, e a lista é o primeiro lugar em que alguém toca de manhã.* As linhas vêm
ordenadas por `i.name COLLATE NOCASE`.

#### 20.4.2 O cartão de cada pedido

`:125-204`:

| Elemento | Regra |
|---|---|
| `hue` | `color.warning` quando `status === 'pending'`, senão `palette.sage` |
| título | `order.placeName.trim() || t.app.places.factory` — o lugar padrão é gravado **sem nome** pela camada de dados, e quem escreve português é a tela |
| dia | `para {{date}}` com `formatCalendarDate`, em `color.ink`; sem dia combinado, `sem dia combinado` em `color.inkFaint` |
| espera | `Chip signal="warning"` com `Espera aprovação`, só quando pendente |
| itens | uma `ListRow` por linha, `trailing = plural(line.baseUnits, t.units.unit, formatQuantity(…))`, sem ícone |
| ações | `Button variant="ghost" style={{flex:1}}` com `Aprovar` quando pendente e `Marcar entregue` quando aberto; ao lado, menor, `Cancelar` |

A escolha de cor tem razão escrita (`:131-133`): pedido esperando aprovação é
coisa a fazer hoje, e é assim que a capa já pinta o mesmo assunto
(`src/home/Mosaic.tsx`). E o estado está dito **por extenso** e não só em cor
(`:157-159`): *de luva, sob luz de galpão, a cor do cartão se perde antes do
texto.*

#### 20.4.3 Cancelar — o defeito dos dois botões escritos "Cancelar"

`:70-90`. Só o cancelamento confirma:

```
cancelTitle: 'Cancelar este pedido?'
cancelBody:  'O pedido de {{place}} sai da lista. Nada muda no estoque: pedido
              não move caixa.'
confirmLabel: words.cancel  // 'Cancelar'
cancelLabel:  words.keep    // 'Manter o pedido'
```

O comentário (`:72-79`) registra o defeito que o `cancelLabel` conserta: sem ele
o diálogo caía no padrão "Cancelar", e como o assunto **dele** é cancelar um
pedido, saíam dois botões empilhados escritos "Cancelar" — o de cima cancelava o
pedido, o de baixo desistia. E o pedido cancelado sai da lista, então não havia
como desfazer.

Aprovar e entregar **não** confirmam — chamam `setOrderStatus` direto (`:88`).

#### 20.4.4 Estado vazio e a porta

`:113-123`: `Nenhum pedido aberto` como título do cartão e `Anote o que o cliente
pedir. A capa passa a dizer o que falta produzir até o dia combinado.` no corpo,
tom `palette.sage`, sem cor de alerta. O botão `Anotar pedido` fica **sempre** no
pé da tela, com lista ou sem ela (`:206-215`) — *esconder caminho já custou duas
telas sem porta na primeira instalação.*

#### 20.4.5 `setOrderStatus`

`src/data/repository.ts:4093-4106`:

```sql
UPDATE orders SET status = ?, decided_at = ? WHERE id = ? AND company_id = ?
```
mais `enqueue(conn, [{ table: 'orders', rowId: orderId }])`. **Não é o
livro-razão**: pedido muda de estado, e mudar de estado aqui não move um grama de
nada.

---

### 20.5 `/orders/new` — Anotar pedido

`app/orders/new.tsx`, 499 linhas.

#### 20.5.1 A decisão central: pedido é demanda, e a reserva NÃO EXISTE

Está escrita em três lugares e é a mesma:

- na tela (`:46-48`): *O pedido NÃO mexe em estoque, e é por isso que ele não
  PERGUNTA nada sobre saldo: nada saiu do freezer porque alguém ligou. Quem
  transforma pedido em movimento é a carga que sai, mais tarde, na transferência.*
- no dicionário (`src/i18n/locales/pt-BR.ts:217-221`): *A palavra "anotar" no
  lugar de "lançar" é deliberada — lançar é o que se faz com o que aconteceu, e um
  pedido é o que ainda vai acontecer.*
- no bloco de pedidos do repositório (`src/data/repository.ts:3857-3869`): gravar
  demanda como movimento faria o saldo mentir no dia da ligação, e como o
  livro-razão é append-only, corrigir um pedido que mudou exigiria **estornar uma
  saída que nunca aconteceu**.

**Portanto: não existe reserva de estoque em nenhum ponto do sistema.** Não há
coluna, tabela nem movimento de reserva. O que existe é uma **subtração de
leitura** — o "livre" da subseção 20.5.4 — que nada grava.

#### 20.5.2 A lista de destinatários

`:110-125`. Carrega `listPlaces` e `listProducts` em paralelo, e filtra:

```ts
const recebe = places.filter((p) => !p.isDefault && receivesCargo(p.kind));
```

`receivesCargo(kind) = kind === 'own_store' || kind === 'customer'`
(`src/domain/ledger.ts:71-73`). O comentário (`:115-122`) registra o defeito que
esse predicado conserta: a lista era de todo lugar não padrão, então uma fábrica
que cadastrou a câmara fria lia "Câmara fria" e "Almoxarifado" debaixo do rótulo
"Cliente", com o ícone de pessoa e a coluna de acordo dizendo "sem acordo de dia"
— e **conseguia gravar um pedido para a própria câmara**.

#### 20.5.3 O dia — quatro opções, e a quarta vem do acordo

`WHEN` é fixo (`:495-499`):

```ts
const WHEN = [
  { days: 0, key: 'today' as const },      // 'hoje'
  { days: 1, key: 'tomorrow' as const },   // 'amanhã'
  { days: 2, key: 'dayAfter' as const },   // 'depois de amanhã'
];
```

`hoje` é o dia da semana **no fuso da fábrica**:
`new Date(`${localDate(nowIso(), locale.timeZone)}T00:00:00Z`).getUTCDay()`
(`:154`). `combinado = daysUntilNextDelivery(place.deliveryDays, hoje)` (`:155`).

`opcoes` (`:163-167`) acrescenta uma quarta linha quando `combinado` não é nulo e
não coincide com 0, 1 ou 2, rotulada com `formatWeekdayShort((hoje + combinado) %
7, locale)`. Sem essa quarta opção *uma loja que só recebe na quinta não tem como
ser pedida para quinta.*

O dia efetivo (`:170-171`):

```ts
const whenDays =
  escolhido && escolhido.placeId === (place?.id ?? null) ? escolhido.days : (combinado ?? 1);
```

O estado `escolhido` guarda **a loja junto com o dia** (`:128-135`): *guardar a
loja junto é o que faz a escolha valer só enquanto ela vale — trocar de cliente
volta a sugerir o dia combinado com o novo, sem nenhum efeito corrigindo estado
depois do fato.* Sem acordo e sem escolha, o padrão é **amanhã**.

`requestedFor = localDate(nowIso(), locale.timeZone, whenDays)` (`:174-177`).

Cada linha da lista de dias mostra a palavra **e** a data por extenso:
`dataDe(days) = formatCalendarDate(localDate(nowIso(), tz, days), locale)`
(`:293-294`) — *"Amanhã" é bonito ao telefone e ambíguo no papel: a data vai
embaixo.*

#### 20.5.4 Quanto ainda dá para prometer — a Lei 4 em forma de subtração

Segunda consulta, **com chave** (`:192-195`):

```ts
useQuery<Demand[]>(() => stockAgainstOrders(LOCAL_COMPANY_ID, requestedFor), requestedFor)
```

O comentário (`:179-191`) registra o defeito que a chave conserta: o horizonte era
fixo em sete dias e a consulta não tinha chave, então trocar de "hoje" para o dia
do acordo **não movia o número em nada** — a dica dizia "menos o que já foi
prometido para esta data" e media outra coisa. *Erra nos dois sentidos —
escolhendo hoje, subtrai promessa da semana que vem; escolhendo um dia daqui a
dez, ignora o que foi prometido para ele.*

`livreDe(itemId)` (`:208-218`):

```
livre = demanda.onHand − demanda.requested − (soma das linhas do rascunho deste item)
```

As linhas do rascunho contam, *senão a segunda linha do mesmo pedido promete as
caixas da primeira.* Devolve `null` quando o produto não está na demanda.

`stockAgainstOrders(companyId, throughDate)`
(`src/data/repository.ts:4147-4188`) devolve `Demand = { itemId, name, requested,
onHand }`. Duas coisas transcritas do SQL:

- `onHand` soma **só as salas nossas**: `l.kind IN ('factory', 'cold_room',
  'store_room')` (`:4167`). O comentário (`:4120-4129`) diz que isso custou um
  achado de auditoria: a conta lia `defaultLocationId`, o dono cadastra a câmara
  fria, manda o picolé para lá — *que é o que uma fábrica de picolés faz no dia
  seguinte ao de produzir* — e a conta passava a dizer que não havia nada para
  prometer com o freezer cheio.
- `requested` soma `order_lines` de pedidos `('pending','open')` com
  `(o.requested_for IS NULL OR o.requested_for <= ?)`, e **o filtro vive no `ON` do
  `LEFT JOIN`, não no `WHERE`** (`:4158-4175`) — no `WHERE` o `LEFT JOIN` viraria
  `INNER` e eliminaria justamente a linha sem pedido que a consulta passou a
  existir para trazer. A função se chamava `orderedDemand` e montava as linhas a
  partir de `order_lines`, então respondia só sobre o que alguém já tinha pedido —
  e quem pergunta "quanto ainda dá para prometer" está quase sempre no caso
  oposto: o primeiro pedido do dia.

#### 20.5.5 Os quatro cartões, com crachá e rótulo concordando

| Índice | Crachá | Título | Conteúdo |
|---|---|---|---|
| 0 | `GlyphCustomer` | `Loja ou cliente` | uma `ListRow` por destinatário, `detail = acordo(p)`, `signal: 'ok'` no escolhido (`:321-351`) |
| 1 | `GlyphCalendar` | `Para quando` | uma `ListRow` por opção, `label` a palavra, `detail` a data (`:356-372`) |
| 2 | `GlyphPlus` | `Produto` | uma `ListRow` por produto, `trailing = sobraDe(p.itemId)` e `trailingTone="muted"`; depois o `Field` de quantidade (`:377-448`) |
| `iRascunho = 3` | `GlyphOrder` | `No pedido` | uma `ListRow` por linha do rascunho, `detail = 'tirar'`, e o toque na linha inteira remove (`:453-471`) |

`acordo(loja)` (`:285-290`) escreve, com as chaves de `t.app.places`:
`sem acordo de dia` quando `daysUntilNextDelivery` é nulo, `hoje é dia de entrega`
quando é 0, e `a próxima é {{day}}` com o nome curto do dia no resto. *Sem isso a
data pré-escolhida é mágica, e o que é mágico ninguém confere.*

`sobraDe(itemId)` (`:297-302`) devolve `undefined` quando `livreDe` é nulo, e
`plural(Math.max(0, sobra), t.units.unit, formatQuantity(…))` quando não — o
negativo é **achatado em zero na exibição**.

Campo de quantidade (`:406-422`): `label: 'Quantidade'`, `placeholder: '0'`,
`keyboardType="numeric"`, e a dica é a concatenação de duas chaves:

```
'livre para esta data: {{amount}}' — 'o que tem no freezer menos o que já foi prometido até esse dia'
```
(`words.free` e `words.freeHint`, `src/i18n/locales/pt-BR.ts:241-242`), com
`amount` também achatado por `Math.max(0, livre)`.

#### 20.5.6 O excesso avisa e não impede

`:426-435`. Quando `livre !== null && units > livre`, imprime em `color.warning`:

```
over: 'Isso promete {{amount}} a mais do que está livre. Dá para produzir até lá?'
```

com `amount = units - Math.max(0, livre)`. **Nada é desabilitado.** Razão escrita
duas vezes (`:56-58`, `:424-425`): *prometer mais do que existe é decisão legítima
de quem sabe que vai produzir até lá. O app orienta, não fiscaliza.*

#### 20.5.7 Acrescentar linha, e a soma do item repetido

`addLine` (`:225-239`): não faz nada se `!product || units <= 0`; limpa o erro;
se o item já está no rascunho, **soma** em vez de criar segunda linha — *o mesmo
produto duas vezes é erro de digitação, não pedido duplo*; limpa o campo de
quantidade. O botão é `variant="ghost"` porque *a tela tem uma ação primária só, e
ela é anotar o pedido* (`:438-446`).

#### 20.5.8 Gravar

`save` (`:241-276`). Duas validações, e a mensagem aparece num cartão
`tone="warning"` colado na ação, não no topo da tela (`:474-480`):

| Condição | Mensagem |
|---|---|
| `!place` | `Escolha para quem é o pedido.` |
| `lines.length === 0` | `Adicione pelo menos um produto ao pedido.` |

Confirmação:

```
confirmTitle:  'Confirma o pedido?'
confirmAction: 'Anotar'
confirmBody:   'Você vai anotar {{items}} para {{place}}, {{when}}. Nada sai do
                estoque agora.'
confirmItem:   '{{amount}} de {{name}}'
```

`items = joinList(lines.map(l => fill(confirmItem, { amount: plural(l.baseUnits,
t.units.unit, formatQuantity(…)), name: l.name })), t.common.and)`; `when` é o
rótulo da opção escolhida (`hoje`, `amanhã`, `depois de amanhã` ou o nome curto do
dia) (`:249-261`).

Depois do sim: `saveOrder(company, { placeId, requestedFor, lines: [{ itemId,
baseUnits }] })` e `router.back()` (`:267-272`).

#### 20.5.9 `saveOrder`

`src/data/repository.ts:3986-4025`:

1. Filtra `baseUnits > 0`; lista vazia lança `um pedido sem item não é pedido`.
2. `status = (await ordersNeedApproval()) ? 'pending' : 'open'` — **configuração
   da empresa**, guardada na chave de meta `orders.needApproval`
   (`:3968-3984`), padrão **sem aprovação**. A razão escrita: *uma fábrica quer que
   o dono veja cada pedido antes de a produção começar, outra tem três clientes e a
   aprovação só atrasa a entrega. Os dois caminhos existem, e o padrão é sem
   aprovação — a fábrica de seis pessoas é o caso que este produto tem na mão.*
3. `INSERT INTO orders (id, company_id, place_id, status, requested_for, note,
   created_at)` e um `INSERT INTO order_lines (id, company_id, order_id, item_id,
   base_units)` por linha, com `Math.round(line.baseUnits)`.
4. `enqueue` de `orders` e de cada `order_lines`.

Esquema (`src/data/db.ts:458-481`):

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
CREATE INDEX  orders_open_idx        ON orders (company_id, status, requested_for);
CREATE UNIQUE INDEX order_lines_once_idx ON order_lines (order_id, item_id);
CREATE INDEX  order_lines_item_idx   ON order_lines (company_id, item_id);
```

O índice único `order_lines_once_idx` é o que faz a soma do item repetido em
`addLine` ser obrigatória e não cortesia.

**Campo `note` do pedido: existe no esquema, é aceito por `saveOrder`, e nenhuma
tela o preenche.** `app/orders/new.tsx:267-271` não passa `note`. **Implementado
sem chamador de tela.**

#### 20.5.10 As duas portas de estado vazio

- Sem destinatário (`:340-349`): `Nenhuma loja ou cliente cadastrado ainda. Toque
  para cadastrar.` mais um botão `Cadastrar um lugar` → `/places`.
- Sem produto (`:394-403`): `Nenhum produto cadastrado ainda. Toque para
  cadastrar.` mais um botão → `/products/new`.

E o `Voltar` é `variant="ghost"` e a **última** coisa da pilha (`:486-490`):
*ninguém deve ser convidado a sair antes de responder.*

---

### 20.6 `/transfer` — Mandar para a loja, e a devolução

`app/transfer.tsx`, 622 linhas. Uma tela para **dois** atos, porque a mecânica é a
mesma e o fato é outro.

#### 20.6.1 A regra de desenho que substitui validação

`:42-45`: *A tela só oferece o que existe onde a carga sai: a lista de itens vem
do saldo da origem, não do catálogo. Isso é a Lei 5 escrita como desenho e não como
validação — não dá para mandar o que não está lá porque nunca aparece para
escolher.*

#### 20.6.2 Os lugares, e quem troca de lado

`:110-137`:

```ts
const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
const destinations = (data?.places ?? []).filter((p) => p.id !== fabrica);
const outra = destinations.find((p) => p.id === toId) ?? destinations[0] ?? null;
const from  = devolucao ? (outra?.id ?? fabrica) : fabrica;
const toId2 = devolucao ? fabrica : (outra?.id ?? null);
const to    = toId2 ? { id: toId2 } : null;
```

`destinations` **não** filtra por `receivesCargo` — ao contrário de
`app/orders/new.tsx:123`. Câmara fria e almoxarifado cadastrados aparecem na lista
de destino desta tela. Não há decisão registrada sobre a diferença; **o que o
código faz é isto**.

`to` é `{ id }` e não o objeto do lugar por razão escrita (`:129-131`): *comparar
string em dependência de efeito é estável, comparar objeto recriado a cada render
não é. Foi o que o compilador reclamou quando isto era `{ id: fabrica }`.*

O saldo da origem: `here = data.stock.find(p => p.locationId === from)`; `lines =
here?.lines ?? []`; `line = lines.find(l => l.itemId === itemId) ?? lines[0] ??
null`.

#### 20.6.3 O palpite, e sua ordem de preferência

Duas fontes e uma regra, e a regra mora no domínio:

```ts
export function pickSuggestion(sources: {
  ordered: number | null;
  lastSent: number | null;
}): number | null {
  return sources.ordered ?? sources.lastSent ?? null;
}
```
(`src/domain/picking.ts:23-30`.) Três frases do docblock, que são o conteúdo da
regra (`:10-21`): **o pedido ganha do hábito** (quem está com a lista na mão quer
atender o combinado, não repetir a semana passada); **o hábito ganha do vazio**;
**e o vazio é resposta** — sem os dois o campo nasce vazio, porque inventar um
número aqui seria pedir para alguém conferir uma sugestão que não saiu de lugar
nenhum.

Ela mora no domínio e não na tela por uma razão explícita (`:4-8`): **o `mutate`
roda a suíte rápida, e regra dentro de componente de React não é alcançada por
ela.** O palpite já esteve em dois lugares na tela — o número mostrado e o número
usado para gravar — e as duas cópias divergiam sem ninguém notar
(`app/transfer.tsx:179-187`).

As fontes:

- `ordered` vem de `pickingFor` (subseção 20.6.4).
- `lastSent` vem de `lastSentBaseUnits(company, itemId, toLocationId)`
  (`src/data/repository.ts:718-733`), carregado num `useEffect` com bandeira
  `alive` (`app/transfer.tsx:140-149`). O SQL lê a perna de **entrada** no destino
  e não a saída na origem, *porque é a quantidade que aquela loja recebeu que
  responde "quanto costuma ir para lá"*:

```sql
SELECT quantity_base_units AS q FROM movements m
 WHERE company_id = ? AND item_id = ? AND location_id = ?
   AND kind = 'transfer' AND quantity_base_units > 0
   AND NOT EXISTS (SELECT 1 FROM movements rev
                    WHERE rev.reverses_movement_id = m.id
                      AND rev.company_id = m.company_id)
 ORDER BY occurred_at DESC, recorded_at DESC LIMIT 1
```

Aquele `NOT EXISTS` é a constante `NAO_ESTORNADO` (`:750-752`), compartilhada por
oito consultas. Ela existe porque *"o que foi estornado não aconteceu — para quem
pergunta o que aconteceu"*: as duas linhas continuam no razão, mas "quanto saiu do
tacho hoje" é outra pergunta, e uma corrida corrigida responde zero a ela. É
constante e não função de apelido porque **montar SQL por interpolação é o padrão
que a proofgate marca**.

#### 20.6.4 A separação — `pickingFor`

`useQuery` chaveada por `to?.id` (`app/transfer.tsx:170-176`):

```ts
pickingFor(LOCAL_COMPANY_ID, to.id, from, localDate(nowIso(), locale.timeZone, 7))
```

O horizonte é **sete dias à frente**, e a sala de onde a carga sai entra como
`fromLocationId`.

`pickingFor(companyId, placeId, fromLocationId, through): Promise<PickLine[]>`
(`src/data/repository.ts:3200-3244`) devolve, por item:

| Campo | SQL |
|---|---|
| `ordered` | `SUM(ol.base_units)` dos pedidos `('pending','open')` daquela loja com `requested_for IS NULL OR <= through` |
| `orders` | `COUNT(DISTINCT o.id)` |
| `dueOn` | `MIN(o.requested_for)` |
| `available` | subconsulta: `SUM(m.quantity_base_units)` do item **na sala de origem** |

`HAVING ordered > 0`, `ORDER BY due_on, i.name COLLATE NOCASE`.

**A lista não reserva nada e não escreve no livro-razão** (`:3192-3195`). E
`available` sai da sala de onde a carga vai sair, não do total da empresa: *de nada
adianta saber que a fábrica tem trezentos se eles estão na outra câmara.*

O campo `orders` existe por um defeito de frase (`:3169-3177`): a tela dizia
`pedido para 05/09: 800 un` — singular, com a data do primeiro e a quantidade de
todos. *Somar e rotular no singular é a única combinação que mente.* Daí as duas
chaves:

```
ordered:     'pedido para {{date}}: {{amount}}'
orderedMany: '{{count}}, o primeiro para {{date}}: {{amount}}'
orderedNone: 'nenhum pedido em aberto para esta loja'
```
(`src/i18n/locales/pt-BR.ts:763-766`), escolhidas por `paraSeparar.orders > 1`
(`app/transfer.tsx:544`).

#### 20.6.5 De qual lote sai — deduzido, não perguntado

`useQuery<Frente>` (`app/transfer.tsx:163-168`), chaveada por
`${itemId}:${devolucao ? 'v' : 'i'}:${toId}`:

```ts
const origem = devolucao ? (toId ?? fabrica) : fabrica;
const lotes = await lotsInStock(LOCAL_COMPANY_ID, itemId, origem);
return lotes[0] ?? null;
```

Nota factual: `origem` aqui usa `toId` (o estado cru) e `from` na linha 128 usa
`outra?.id` (o estado com queda para `destinations[0]`). Com o sentido de devolução
e **nenhuma loja tocada ainda**, `from` é a primeira loja da lista e `origem` é a
fábrica — as duas expressões não são a mesma. Não há decisão registrada sobre isso
em nenhum docblock do arquivo.

`lotsInStock(companyId, itemId, locationId)`
(`src/data/repository.ts:3017-3045`):

```sql
SELECT l.id, l.code, l.expires_on, COALESCE(SUM(m.quantity_base_units), 0) AS total
  FROM lots l JOIN movements m ON m.lot_id = l.id
 WHERE l.company_id = ? AND l.item_id = ? AND m.location_id = ?
 GROUP BY l.id, l.code, l.expires_on
HAVING SUM(m.quantity_base_units) > 0
 ORDER BY l.expires_on IS NULL, l.expires_on ASC, l.code ASC
```

**Lote sem validade vai para o fim, não para o começo** (`:3014-3015`): sem data
não há pressa, e mandar primeiro o que não vence deixaria o que vence envelhecendo
na câmara. A Lei 1 na forma mais direta — *quem despacha não escolhe lote,
despacha o que está na frente.* Nulo é caso normal e frequente: açúcar e palito não
têm lote.

Daí as duas frases (`src/i18n/locales/pt-BR.ts:748-750`):

```
fromLot:       'Sai do lote {{code}}, que vence primeiro.'
fromLotNoDate: 'Sai do lote {{code}}.'
```

A segunda existe porque *lote sem validade é caso normal e decidido, e nesse caso
`lotsInStock` ordena por código, não por data: a frase afirmava uma ordem que não
foi usada para escolher e uma data que não existe* (`app/transfer.tsx:569-573`). A
mesma escolha é feita duas vezes — na tela (`:574-580`) e dentro da confirmação
(`:218-220`).

#### 20.6.6 Quantidade, excesso e liberação do botão

```ts
const amount = typed ? Math.max(0, (parseTyped(amountText) ?? 0) || 0) : (suggestion ?? 0);
const over   = line != null && amount > line.baseUnits;
const ready  = line != null && to != null && amount > 0 && !over && !sending;
```
(`:193-196`.)

Aqui o excesso **impede** — ao contrário do pedido, onde ele só avisa. Quando
`over`, o `hue` do cartão inteiro vira `color.warning` (`:475`) e sai um `Chip
signal="warning"` com `Isso é mais do que tem em {{place}}.` (`:562-564`).

A dica do campo segue **a mesma ordem do palpite** — pedido, último envio, saldo
(`:539-559`):

| Situação | Chave | Texto |
|---|---|---|
| há pedido, um só | `ordered` | `pedido para {{date}}: {{amount}}` |
| há pedido, vários | `orderedMany` | `{{count}}, o primeiro para {{date}}: {{amount}}` |
| sem pedido, com histórico | `lastTime` | `Da última vez você mandou {{amount}}` |
| sem os dois | `available` | `Tem {{amount}} em {{place}}` |

*Ela diz DE ONDE veio o número, que é o que faz alguém confiar nele ou corrigi-lo.*

#### 20.6.7 O que a tela desenha, cartão por cartão

| Índice | Crachá | Título | Conteúdo |
|---|---|---|---|
| 0 | `GlyphVehicle` | o sentido escolhido: `A loja devolveu` ou `Mandar para a loja` | dois `Pressable` com `accessibilityRole="radio"`, cada um com desenho (`GlyphVehicle` para carga, `GlyphStore` para devolução) e a palavra; abaixo, o caminho `"{origem} → {destino}"` em uma linha (`:362-417`) |
| 1 | `GlyphStore` | `De onde sai` na devolução, `Para onde vai` na carga | um `Pressable` por loja; a marca da escolha é **tinta e peso da palavra** (`fontWeight '600'`), não caixa desenhada; abaixo, `nenhum pedido em aberto para esta loja` quando é carga e `pedido` veio vazio (`:423-467`) |
| 2 | `GlyphBox` | `O que vai` | um `Pressable` por item do saldo da origem, com o nome à esquerda e `"{saldo} {unidade}"` à direita em `fontVariant: ['tabular-nums']`; depois o `Field` `Quanto vai` com `suffix = line.baseUnit`; o `Chip` de excesso; a frase do lote; e a nota de rodapé (`:473-593`) |
| 3 | `GlyphVehicle` | — | o botão: `Registrando…` / `Registrar a devolução` / `Registrar a transferência`, `weighty`, `disabled={!ready}` (`:599-611`) |

A sobrelinha do cabeçalho **acompanha o sentido**: `o que sai da fábrica` na carga
e `o que volta para a fábrica` na devolução (`:356`). O comentário registra o
defeito (`:350-355`): fixa em "o que sai da fábrica", ela ficava desenhada logo
acima de "A loja devolveu" e de "Loja Centro → Fábrica" — *nada sai da fábrica, a
mercadoria entra nela, e o livro-razão grava `return`.*

A escolha da loja compara com `outra?.id` e não com o destino do movimento
(`:430-433`): *na devolução o destino é a fábrica, e comparar com ele deixava a
lista inteira apagada, sem nenhuma linha marcada.*

A nota de rodapé só aparece quando há o que mandar (`:588-592`):

```
notASale: 'Loja própria é transferência, não venda: não há faturamento nem margem
           aqui. O valor só muda de sala.'
```

Trocar de sentido ou de item zera o campo (`setTyped(false)`,
`setAmountText('')`) — `:374-378`, `:489-493`.

#### 20.6.8 A confirmação, e o ato

`onSend` (`:198-295`). A confirmação escolhe por `devolucao`:

```
confirmTitle:  'Confirmar a transferência'
confirmAction: 'Mandar'
confirmBody:   'Você vai mandar {{amount}} de {{item}} de {{from}} para {{to}}. O
                saldo sai de um lugar e entra no outro; a empresa continua com a
                mesma coisa.'

returnAsk:     'Registrar esta devolução?'
returnAction:  'Trazer de volta'
returnBody:    'Você vai trazer {{amount}} de {{item}} de volta de {{place}} para
                a fábrica.'
```

`amount = "{formatQuantity(amount)} {line.baseUnit}"`. **Só no caminho da carga** a
frase do lote é concatenada no fim da mensagem (`:216-220`) — *quem carrega o
caminhão é quem vai ler o código na caixa se alguém ligar depois.*

Depois do sim (`:224-233`): `const registrar = devolucao ? recordReturn :
recordTransfer`, chamado com `{ itemId, fromLocationId: from, toLocationId: to.id,
baseUnits: amount, lotId: frente?.lotId ?? null }`. Erro qualquer cai em
`askConfirm({ title: 'Não deu para transferir', message: e.message, acknowledge:
true })` (`:286-291`) — **sem tradução por tipo de erro aqui**, ao contrário da
produção.

#### 20.6.9 O que `recordTransfer` e `recordReturn` gravam

Os dois são a mesma função com um argumento de tipo
(`src/data/repository.ts:1748-1772`):

```ts
recordTransfer(companyId, input) => moveBetween(companyId, input, 'transfer')
recordReturn(companyId, input)   => moveBetween(companyId, input, 'return')
```

`MoveInput = { itemId, fromLocationId, toLocationId, baseUnits, lotId?,
occurredAt?, note?, assistantPhrase? }` (`:1645-1663`).

`moveBetween` (`:1683-1746`):

- Validações, e são só duas: `fromLocationId === toLocationId` lança `origem e
  destino são o mesmo lugar`; `baseUnits <= 0` lança `uma transferência move alguma
  coisa; para o sentido inverso, troque os lugares`.
- **Não confere o saldo da origem.** Entre a linha 1688 e a 1743 não existe
  consulta de saldo — ao contrário de `recordProduction` e `recordLoss`, que têm
  piso. Quem impede a origem de ficar negativa é a tela, por `ready` (`:196`).
- `unitCostRate` é lido de `item_costs.average_rate` do item, congelado no instante
  (`:1699-1703`).
- Escreve **duas** pernas com o mesmo `movement_group_id`:

| Perna | `quantity_base_units` | `location_id` | `counterpart_location_id` | `lot_id` |
|---|---|---|---|---|
| saída | `-baseUnits` | origem | destino | o lote |
| entrada | `+baseUnits` | destino | origem | **o mesmo lote** |

A razão de serem duas e não uma é aritmética, e está escrita (`:1634-1639`): o
saldo agrupa por `location_id`; com uma linha só o destino não existiria em consulta
nenhuma, e fechar exigiria um `UNION` trocando `location_id` por
`counterpart_location_id` e invertendo o sinal, em cada lugar que soma. **A
contraparte fica como explicação, nunca como aritmética.**

As duas pernas levam o lote (`:1730-1733`): só na de saída, o lote sumiria do
destino — *a loja receberia caixas sem lote e o recall pararia na porta da
fábrica.*

E a razão de `return` ser um `kind` próprio (`:1665-1682`): a aritmética é a mesma,
o **fato** não. *Gravar as duas como `transfer` deixava as duas iguais no
livro-razão, e nenhum relatório conseguiria dizer "a loja centro devolve 8% do que
recebe" — que é exatamente a pergunta que o Espelho da Loja existe para
responder.* O `movement_kind` tem `return` desde a primeira migração e ninguém
escrevia nele.

Devolve `TransferResult = { groupId, baseUnits, unitCostRate }` (`:1621-1625`).

#### 20.6.10 O pedido que fecha junto com a carga

`app/transfer.tsx:237-283`, e só no caminho da carga (`!devolucao && to`):

1. `listOrders(company, ['pending','open'])`, filtrado por `o.placeId === to.id`.
2. **A cobertura é do dia, não desta carga** (`:251-256`): `dayWindow(nowIso(),
   locale.timeZone)`, depois `shipmentsOn(company, hoje.from, hoje.to)`, e soma num
   `Map<itemId, baseUnits>` tudo o que caiu naquele destino hoje. O comentário
   registra o defeito: comparar só com o que acabou de sair fazia um pedido de dois
   itens nunca fechar — *quem carrega o caminhão faz duas viagens até o freezer, não
   um ato só.*
3. `cobertos = ordersCoveredBy(daLoja, enviadoHoje)`
   (`src/domain/picking.ts:55-64`):

```ts
orders.filter((order) =>
  order.lines.every((line) => (sent.get(line.itemId) ?? 0) >= line.baseUnits),
).map((order) => order.id)
```

   **Só entra o pedido coberto por inteiro.** Carga parcial não fecha nada:
   *dizer "entregue" quando faltaram quarenta caixas transforma uma falta que a loja
   vai cobrar num pedido que o sistema diz cumprido — e o livro-razão, que é o único
   que não mente, não tem como desmentir porque pedido não é livro-razão.*

4. Havendo cobertos, pergunta — **e é pergunta, não decisão calada**:

```
closeAsk:   'Fechar o pedido dessa loja?'
closeBody:  'O que saiu hoje para essa loja cobre {{count}} em aberto. Fechar tira
             da lista de separação e da conta do que falta produzir.'
closeAction:'Fechar'
closeKeep:  'Deixar aberto'
closeCount: { one: '1 pedido', other: '{{n}} pedidos' }
```

5. No sim, `setOrderStatus(company, id, 'delivered')` para cada um.

`shipmentsOn(companyId, fromIso, toIso)`
(`src/data/repository.ts:3301-…`) lê as pernas **positivas** de `kind =
'transfer'`, não estornadas, agrupadas por `movement_group_id` e destino, e traz
`checked` por `EXISTS (… AND c.post = 'checked')`. `Shipment.groupIds` é uma lista
porque *uma loja pode receber duas cargas no mesmo dia, e quem abre a segunda caixa
não está conferindo a primeira* (`:3248-3255`).

#### 20.6.11 Estado vazio

`:304-325`. `destinations.length === 0` desenha um cartão com `Você ainda não
cadastrou para onde mandar.` e um botão primário `Cadastrar a primeira loja` →
`/places`. Nesse estado a sobrelinha fixa `o que sai da fábrica` está correta,
porque **ali não existe o seletor de sentido** (nota em `:354-355`).

---

### 20.7 `/purchase` — Lançar a compra

`app/purchase.tsx`, 495 linhas. O docblock a chama de *the most valuable screen in
the app per keystroke* (`:34`), e diz por quê: *"Update the price of sugar" never
becomes a task here. The buyer records what they paid, and the same event moves the
moving average, writes the price history and recalculates every recipe that uses
the item. One entry, five consequences, none of them typed by anybody.*

A comparação contra a nota anterior aparece **enquanto a decisão está aberta** — de
pé na frente do fornecedor — e não num relatório no mês seguinte. Lei 4.

#### 20.7.1 Consulta, e as duas perguntas que ela separa

`:95-100`:

```ts
listItems(LOCAL_COMPANY_ID).then((all) => ({
  compraveis: all.filter((i) => i.purchaseToBase !== null),
  cadastrados: all.length,
}))
```

O comentário (`:85-94`) diz por que são duas: a consulta devolvia só a lista
filtrada e o estado vazio dizia "Nada cadastrado ainda" — com um insumo cadastrado
sem `purchaseToBase`, **a frase era falsa**.

`itemId` chega por `useLocalSearchParams` e vira o item pré-escolhido (`:104-105`),
porque *arriving from an item opens on that item, so the buyer does not hunt for
what they were already looking at.*

#### 20.7.2 O rascunho e as cinco contas

`:118-157`. `num(s) = parseTyped(s) ?? NaN` (`:116`). Devolve `null` quando
`packs` ou `paid` não são finitos ou são `<= 0`.

| Nome | Fórmula | Fonte |
|---|---|---|
| `baseUnits` | `purchaseToBaseUnits(selected, packs)` = `Math.round(packs * (item.purchaseToBase ?? 1))` | `src/data/repository.ts:1237-1240` |
| `totalCents` | `fromDecimal(paid)` = `Math.round(paid * 100)` | `src/domain/money.ts:11-13` |
| `thisRate` | `rate(paid, baseUnits)` = `paid * 100 / baseUnits` | `src/domain/money.ts:52-55` |
| `after` | `applyCostEvent({ baseUnits: item.onHandBaseUnits, averageRate: item.averageRate }, { kind:'purchase', baseUnits, totalCents, at })` | `app/purchase.tsx:136-139` |
| `change` | `previous && previous > 0 ? (thisRate - previous) / previous : null`, com `previous = selected.lastRate` | `:141-142` |

A conversão mora **num lugar só**, e o comentário diz por que (`:126-129`): a tela
fazia o próprio `Math.round(packs * factor)` enquanto o repositório exportava a
mesma regra para ninguém — *two implementations that agree today and diverge the
first time one of them is corrected, with nothing to say which is right.*

Mais duas contas fora do rascunho (`:163-167`):

```ts
const perPackNow = draft.paid / draft.packs;
const perPackBefore = (selected.lastRate * selected.purchaseToBase) / 100;
```

#### 20.7.3 O juízo do preço, e por que os limiares são assimétricos

```ts
export const PRICE_ALARM = 0.05;
export const PRICE_RELIEF = -0.02;

export function judgePriceChange(change: number): PriceVerdict {
  if (change > PRICE_ALARM) return 'wellAbove';
  if (change < PRICE_RELIEF) return 'cheaper';
  return 'smallChange';
}
```
(`src/domain/cost.ts:233-240`.) A assimetria é deliberada (`:219-232`): *it takes
more than 5% to raise an alarm and only 2% to call something cheaper, because the
costs of being wrong are not symmetric either: a false alarm teaches the person to
ignore alarms, and then the real one arrives and is ignored too. Good news that
turns out to be noise costs nothing.* Antes disso eram *four magic numbers inside
JSX, deciding what a person is warned about before they spend money, with no test
anywhere.*

A cor vem de `priceSignal` (`src/components/Chip.tsx:65-69`): `wellAbove` →
`'warning'`, `cheaper` → `'ok'`, resto → `'neutral'`. O `hue` do cartão inteiro
vira `color.warning` só em `wellAbove` (`app/purchase.tsx:358`).

#### 20.7.4 Os três cartões

**Cartão 0 — `O que você comprou`** (`:238-348`), crachá `GlyphSack`, tom
`palette.sky`. Uma fita horizontal de nomes de insumo em `ScrollView horizontal`,
onde o escolhido fica em `palette.sky` e `fontWeight: '600'` — *a fita de escolha é
palavra, não pastilha.* Depois três campos:

| Rótulo | Valor | Dica |
|---|---|---|
| `Fornecedor` (placeholder `quem vendeu`) | livre | — |
| `Quantidade, em {{pack}}` com `pack = selected.purchaseUnit ?? t.units.unit.other` | inicia em `'1'` | `{{packs}} × {{factor}} = {{baseUnits}} {{unit}} entrando no estoque.` |
| `Total da nota`, `suffix="R$"`, placeholder `118,00` | vazio | `{{price}} por {{pack}}` com `price = formatMoney(fromDecimal(perPackNow))` |

A vírgula do rótulo de quantidade é decisão registrada
(`src/i18n/locales/pt-BR.ts:859-865`): *"Quantas {{pack}}" saía como "QUANTAS SACO
25 KG": a embalagem é texto livre, então gênero e número não se calculam daqui. A
vírgula resolve.*

**Cartão 1 — `ANTES DE FECHAR`** (`:355-401`), crachá `GlyphPurchase`, **sem
título de cartão**: a sobrelinha faz esse papel. Só existe com rascunho.

- Sem nota anterior (`change === null` ou `perPackBefore === null`): `Primeira
  compra deste item. A próxima já vem com a comparação.`
- Com anterior: a figura `▲/▼ {percent}` via
  `formatPercent(Math.abs(draft.change), locale)`; abaixo, `{{now}} agora ·
  {{before}} na compra anterior`; abaixo, o `Chip` com o veredito —
  `Subiu bem acima do normal` / `Está mais barato que da última vez` /
  `Variação pequena`.
- Sempre, no pé: `O custo médio de {{name}} passa de {{from}} para {{to}} a cada
  1.000 {{unit}}.`, com `from = Math.round(selected.averageRate * 1_000)` e
  `to = Math.round(draft.after.averageRate * 1_000)` (`:391-398`).

**Cartão 2 — `O que essa nota mexeu`** (`:409-429`), crachá `GlyphPrice`. Só
existe **depois de gravar**, e é a Lei 6 aberta: a legenda `Ninguém precisou
atualizar preço nenhum.` e uma `ListRow` por produto cujo custo mudou, com
`trailing = "{antes} → {depois}"` e `trailingTone` `'warning'` quando subiu,
`'ok'` quando desceu.

**Botão** (`:433-441`): `Lançar compra` / `Lançando…`, `weighty`,
`disabled={!draft || saving}`.

#### 20.7.5 Confirmação e erro

`:172-200`:

```
confirmTitle:  'Lançar esta compra?'
confirmBody:   '{{packs}} × {{pack}} de {{name}}, por {{total}}.'
confirmAction: 'Lançar'
cancelLabel:   t.app.confirm.adjust      // 'Ajustar'
```

`pack = selected.purchaseUnit ?? t.units.unit.one`; `total =
formatMoney(draft.totalCents, locale)`.

Erro: `Não deu para lançar` com `e.message`, `acknowledge: true` e `confirmLabel:
t.app.confirm.understood` (`'Entendi'`). Depois do sucesso, `setTotal('')` e
`setQuantity('1')` — a tela fica pronta para a linha seguinte da mesma nota.

#### 20.7.6 `recordAndMeasure` — a medição pelo mesmo motor

`:453-495`. Mede **antes e depois** com o mesmo motor que a tela de receita usa,
*not by a second formula written here, which would eventually disagree with the
first one* (`:446-452`).

1. Carrega em paralelo `loadRecipeGraph`, `itemCosts`, `listProducts`, `labels`.
2. `unitCost(costs)` mapeia os produtos: sem `recipeId` ou sem `yieldPerUnit`, o
   valor é `0`; senão `costRecipe(recipeId, graph, costs, names)` e
   `costPerProductUnit(cost, yieldPerUnit, { cents: unitPackagingCents, itemsRate:
   packagingRatePerUnit(packagingItems, costs) })`.
3. `before = unitCost(costsBefore)`.
4. `recordPurchase(company, { itemId, supplierName: supplier.trim() || undefined,
   purchaseQuantity: packs, baseUnits, totalCents })`.
5. `after = unitCost(await itemCosts(company))`.
6. Devolve só as linhas com `before !== after`.

#### 20.7.7 O que `recordPurchase` grava — cinco linhas, um evento

`src/data/repository.ts:296-466`. O comentário fixa a razão da transação
(`:363-365`): *five rows describe one event, so they land together or not at all. A
purchase that recorded its invoice and not its cost would leave a price history with
a hole in it that nothing could reconstruct.*

Antes da transação: lê `item_costs.average_rate` e o saldo do item
(`SUM(quantity_base_units) WHERE company_id AND item_id` — sem sala), monta
`before` e calcula `after = applyCostEvent(before, { kind:'purchase', baseUnits,
totalCents, at })`. *How much is on hand is a question for the ledger, never for a
stored total* (`:340-343`).

Dentro:

| # | Escrita | Detalhe |
|---|---|---|
| 1 | `INSERT INTO purchases (id, company_id, supplier_name, ordered_at, received_at, created_at)` | `received_at = at` |
| 2 | `INSERT INTO purchase_lines (id, company_id, purchase_id, item_id, purchase_quantity, base_units, total_cents, created_at)` | `id = lineId` |
| 3 | `INSERT INTO movements (…, 'purchase', occurred_at, recorded_at, item_id, quantity_base_units, location_id, unit_cost_rate, movement_group_id, assistant_phrase)` | **`id = lineId`, o mesmo da linha da nota**; `quantity = +baseUnits`; `location_id = ensureLocation(...)`; `unit_cost_rate = lineRate = rate(totalCents/100, baseUnits)`; `movement_group_id = purchaseId` |
| 4 | `INSERT INTO item_costs … ON CONFLICT(item_id) DO UPDATE` | `average_rate = after.averageRate`, `last_rate = lineRate` |
| 5 | `INSERT INTO item_cost_history (id, company_id, item_id, previous_rate, new_rate, observed_at)` | `observed_at = occurred`, não `at` |

Três decisões transcritas:

- **A linha da nota e o movimento compartilham um id** porque *they are one fact
  seen twice. Replaying the queue cannot post the arrival again* (`:367-369`).
- **O grupo é a nota, não a linha** (`:416-419`): hoje entra uma linha por chamada
  e os dois dariam no mesmo; no dia em que a nota tiver duas, o grupo por linha
  desfaria metade de uma nota — *que é a coisa que o estorno por ato existe para não
  deixar acontecer.*
- **`item_costs` não entra na fila, e a omissão é o desenho** (`:441-454`): a média
  é derivada, e número derivado tem **um** autor. O aparelho calcula a própria para
  mostrar custo sem sinal; o servidor calcula a dele das mesmas linhas, pela mesma
  regra. Mandar as duas dá dois autores e eles discordam — *replaying the queue put
  the server at 0.5605 where the phone said 0.5310, because the queue carries row
  ids and resends whatever the row says now.* A fila leva `purchases`,
  `purchase_lines` e `movements`, e o gatilho `apply_purchase_to_cost` do servidor
  dispara no insert de `purchase_lines`.

`occurredAt` é opcional e separado de `recorded_at` (`:307-318`): *nota de compra
chega atrasada: o caminhão descarrega às sete e alguém digita ao meio-dia, ou no dia
seguinte.* **A tela `/purchase` não passa `occurredAt`** (`app/purchase.tsx:482-488`
manda só `itemId`, `supplierName`, `purchaseQuantity`, `baseUnits`, `totalCents`),
então toda compra lançada por ela tem `occurred_at = recorded_at`.
**Implementado sem chamador de tela.**

#### 20.7.8 Estados vazio e de carregamento

- Carregando (`:216-228`): um cartão só com `Abrindo o almoxarifado…`.
- Sem item comprável (`:323-347`): `Nenhum insumo tem embalagem e quanto vem dentro
  ainda. Complete o cadastro para a nota virar estoque.` quando existem itens
  cadastrados; `t.app.inputs.empty.input` quando não existe nenhum. Nos dois casos,
  um botão `variant="ghost"` para `/inputs`. Sem cor de alerta — *um cartão vermelho
  no primeiro dia de uso é alerta inventado.*

---

### 20.8 `/losses` — Perdas

`app/losses.tsx`, 218 linhas. **Tela de leitura: não escreve nada.**

#### 20.8.1 As três decisões da tela

Do docblock (`:18-49`):

- **Ordenada por dinheiro, não por data**: *a pergunta não é "o que aconteceu
  ontem" — é "o que está pesando", e uma caixa que derreteu pesa mais que trinta
  picolés de cortesia.*
- **Trinta dias**: *menos que isso é ruído de uma semana ruim, mais que isso já é
  história.*
- **O motivo é o que faz a tela existir**: *"sumiram quatro quilos" não muda decisão
  nenhuma; "quatro quilos venceram" muda a compra, e "derreteram" muda a manutenção
  do freezer.*

#### 20.8.2 As duas janelas

`:74-84`. Quatro chamadas a `dayWindow(nowIso(), locale.timeZone, offset)`:

| Janela | Início | Fim |
|---|---|---|
| agora | `dayWindow(…, -29).from` | `dayWindow(…).to` (hoje) |
| antes | `dayWindow(…, -59).from` | `dayWindow(…, -30).to` |

Duas `lossesOn` em paralelo. A razão da janela anterior (`:66-73`): *R$ 148 em
perdas não diz nada sozinho: numa fábrica é um mês ruim, noutra é terça-feira.*

#### 20.8.3 As contas da tela

`:86-99`:

- `total = Σ r.valueCents` das perdas da janela atual;
- `antes = Σ r.valueCents` da anterior;
- `byReason: Map<LossReason, { money, count }>` — a contagem vem junto *porque uma
  caixa de R$ 80 e oito caixinhas de R$ 10 são o mesmo dinheiro e problemas
  diferentes: uma é acidente, outra é rotina*;
- `porMotivo` ordenado por `money` desc; `worst = porMotivo[0]`.

#### 20.8.4 Os três cartões

| Índice | `hue` | Crachá | Conteúdo |
|---|---|---|---|
| 0 (só com perdas) | `color.danger` | `GlyphLoss` | figura `formatMoney(total)` ao lado de `plural(rows.length, {one:'1 perda', other:'{{n}} perdas'})`; `O que mais pesou: {{reason}}, {{money}}.` com o motivo em minúscula por `toLocaleLowerCase(locale.formatting)`; e a comparação |
| 1 (só com **mais de um** motivo) | `color.warning` | `GlyphChart` | uma `ListRow` por motivo: `label = t.loss[motivo]`, `detail = plural(count, lossCount)`, `trailing = formatMoney(money)` |
| `indiceLista` (`mostraMotivos ? 2 : 1`) | — (cartão neutro) | — | sobrelinha `{{money}} EM {{count}}` em caixa alta, e uma `ListRow` por perda: `label = nome`, `detail = "{qtd} {unidade} · {motivo} · {lugar} · {dia}"`, `trailing = formatMoney(valueCents)` |

A comparação (`:135-141`) tem duas frases, e a escolha é `antes > 0`:

```
vsPrevious:   'nos 30 dias anteriores foram {{money}}'
firstWindow:  'primeira janela com perda registrada — não há antes para comparar'
```

*Zero lá atrás não é "R$ 0,00" — é não ter com o que comparar, e dizer isso é mais
honesto que fingir queda total.*

O cartão de motivos só aparece com mais de um (`:101-108`): um motivo sozinho já
está dito por extenso na linha de cima, e *um cartão de barras com uma barra só é o
mesmo defeito do alerta inventado.*

A chave da `ListRow` de cada perda é `${row.itemId}-${row.occurredAt}` (`:183`).

#### 20.8.5 Estado vazio, com porta

`:200-215`. Cartão **sem `hue`** — sem tom de alerta, porque *um cartão vermelho
dizendo que está tudo bem é alerta inventado*:

```
empty:     'Nenhuma perda registrada nos últimos 30 dias.'
emptyHint: 'Quando alguma coisa vencer, derreter ou quebrar, registre no item — é o
            motivo que faz esta tela servir.'
```

E o botão `variant="ghost"` rotulado `t.app.inputs.title` → `/inputs`, porque *a
frase diz que a perda se registra no item; sem um caminho, ela era instrução sem
porta.*

#### 20.8.6 `lossesOn` e `recordLoss`

`lossesOn(companyId, fromIso, toIso): Promise<LossRow[]>`
(`src/data/repository.ts:2187-2229`):

```sql
SELECT m.item_id, i.name, i.base_unit, m.quantity_base_units AS quantity,
       m.loss_reason AS reason, l.name AS location_name,
       m.unit_cost_rate AS rate, m.occurred_at
  FROM movements m
  JOIN items i     ON i.id = m.item_id
  JOIN locations l ON l.id = m.location_id
 WHERE m.company_id = ? AND m.kind = 'loss'
   AND m.occurred_at >= ? AND m.occurred_at < ?
   AND <NAO_ESTORNADO>
 ORDER BY ABS(m.quantity_base_units * COALESCE(m.unit_cost_rate, 0)) DESC
```

`LossRow = { itemId, name, baseUnits, baseUnit, reason, locationName, valueCents,
occurredAt }`, com `baseUnits = Math.abs(quantity)` e `valueCents = cents(|quantity|
× (rate ?? 0))` — *taxa fracionária vezes quantidade, arredondada aqui e só aqui.*

`recordLoss` (`:2089-2165`) — **não é chamado por esta tela**; o único chamador de
tela é `app/inputs/[id].tsx:256`. Transcrito porque é o escritor do que esta tela
lê:

- `baseUnits <= 0` lança `uma perda de nada não é uma perda`.
- O piso é o **da sala**, igual ao da produção: soma `quantity_base_units` do item
  naquele `location_id` e, se `onHand < baseUnits`, lança `NotEnoughStockError` com
  o nome vindo de `labels`.
- `rate` é a média **de hoje** do item (`itemCosts`): *o que se perdeu foi
  mercadoria comprada, e o relatório de perdas conta dinheiro, não só quantidade.*
- Escreve **uma** linha: `kind = 'loss'`, `quantity_base_units =
  -Math.round(baseUnits)`, `loss_reason` obrigatório, `movement_group_id = id` (o
  próprio id — *sem ele a perda não tem como ser desfeita, e "digitei 40 onde era 4"
  fica no razão para sempre*), e `lot_id` quando informado, porque *"quatro caixas
  venceram" só muda a compra se alguém souber QUAL lote venceu.*

Os motivos são o enum do servidor, escritos exatamente como lá:

```ts
export type LossReason = 'melted' | 'broken' | 'expired' | 'courtesy' | 'internal_use';
```
(`src/domain/ledger.ts:46`.) A grafia é decisão registrada (`:35-45`): o aparelho
escreveu `camelCase` por meses, o SQLite aceitaria (a coluna é `TEXT`), a fila
enfileiraria, e **o Postgres recusaria a linha sem ninguém olhando**. Custou nada
consertar porque nenhuma perda tinha sido registrada — *the only window where a
ledger's vocabulary is free to change.*

As palavras na tela (`src/i18n/locales/pt-BR.ts:1102-1108`):

| Chave | pt-BR |
|---|---|
| `melted` | `Derreteu` |
| `broken` | `Quebrou` |
| `expired` | `Venceu` |
| `courtesy` | `Cortesia` |
| `internal_use` | `Consumo interno` |
| `reasonRequired` | `Diga o que aconteceu — isso protege o relatório de todo mundo.` |

---

### 20.9 `/places` — Estoque por lugar, acordo de entrega e câmara fria

`app/places.tsx`, 719 linhas, com três componentes no mesmo arquivo: `Places`,
`Ambiente` e `Agreement`.

#### 20.9.1 Por que a tela existe

`:50-60`: *o saldo da empresa e o saldo de um lugar são perguntas diferentes com a
mesma resposta somada por eixos diferentes, e até aqui só a primeira tinha tela. Uma
fábrica que manda caixa para quatro lojas não decide nada com o total — decide com
"o que ainda tem na Loja Centro".*

E: *o lugar padrão é gravado sem nome de propósito, e é aqui que ele ganha um: a
camada de dados devolve string vazia, quem fala português é a tela* — `nameOf`
(`:131-134`) devolve `words.factory` (`'Fábrica'`) quando o nome está em branco.

#### 20.9.2 Consulta e estado

`:106-119`. Três em paralelo: `listPlaces`, `stockByPlace`, `lastReadings`.
Estado: `adding`, `name`, `kind` (inicial `'own_store'`), `saving`, `editing`.

`hoje` é o dia da semana no fuso da fábrica (`:121-128`): *ler o dia da semana do
relógio do aparelho daria o dia errado para quem trabalha de madrugada num fuso e o
servidor está noutro.*

#### 20.9.3 A lista é de lugares, não de saldos

`:182-186`. Cicatriz escrita: `stockByPlace` começa em movimento, então **uma loja
recém-cadastrada não aparecia** até alguém mandar a primeira carga — *e é exatamente
antes dessa carga que se combina o dia de entrega. Uma loja invisível é cadastrada
duas vezes.*

`semNada = (data?.stock.length ?? 0) === 0` (`:166`) — o cartão vazio é sobre o
**estoque**, não sobre os lugares: `Nada entrou em lugar nenhum ainda. Lance uma
compra ou registre uma produção.`

#### 20.9.4 O tom e o desenho de cada tipo de lugar

`desenhoDoLugar(kind, color, weight)` (`:91-97`):

| `kind` | Desenho |
|---|---|
| `own_store` | `GlyphStore` (fachada) |
| `customer` | `GlyphCustomer` (pessoa) |
| `vehicle` | `GlyphVehicle` (carroceria) |
| `cold_room` | `GlyphThermometer` |
| qualquer outro (`factory`, `store_room`) | `GlyphFactory` (o prédio: são as salas de dentro) |

Devolve o **elemento** e não uma função que devolve elemento, porque a segunda forma
tem cara de componente de ordem superior e o lint cobraria nome de exibição de cada
uma das cinco (`:88-90`).

`tomDoLugar(kind)` (`:143-148`): `vehicle` → `palette.lilac` (transporte);
`receivesCargo(kind)` → `palette.sage` (acordo, o mesmo tom de pedido e cliente);
resto → `palette.mint` (estoque). *De longe a lista já separa depósito de destino
sem ninguém ler o rótulo.*

#### 20.9.5 O cartão de um lugar

`:187-313`:

1. sobrelinha com o tipo em caixa alta, traduzido por
   `words.kinds[place.kind]` e caindo para o `kind` cru quando não há chave
   (`:199-201`);
2. com saldo: figura `formatMoney(saldo.valueCents)` ao lado de
   `plural(saldo.lines.length, {one:'um item', other:'{{n}} itens'})` — Lei 3, *é o
   que transforma "R$ 1.240" em "R$ 1.240 espalhados em três coisas"*; sem saldo:
   `nada aqui ainda` em `color.inkFaint`, **e o cartão continua na tela**;
3. uma `ListRow` por item, `detail = 'vale {{amount}}'`, `trailing = "{qtd}
   {unidade}"`, `trailingTone="muted"`;
4. `<Ambiente>` quando `place.kind === 'cold_room'`;
5. a ficha de acordo quando `receivesCargo(place.kind)` — *combinar dia de entrega
   com o próprio almoxarifado não quer dizer nada.*

`stockByPlace` (`src/data/repository.ts:781-834`) agrupa
`SUM(quantity_base_units)` por lugar e item com `HAVING SUM(...) <> 0` — **linha de
saldo zero não aparece**, porque *um item que entrou e saiu inteiro não está ali, e
listá-lo como "0 g" enche a tela de coisa que não está lá.* O valor de cada linha é
`cents((rate ?? 0) * base_units)`, arredondado uma vez, e o valor do lugar é a soma
desses.

#### 20.9.6 A ficha de acordo — leitura e edição

**Leitura** (`:266-308`): sobrelinha `O QUE FICOU COMBINADO`; a frase
`sem acordo de dia` quando `deliveryDays === 0`, senão `entrega {{days}}` com
`diasDoAcordo` (`:627-634`), que percorre os sete dias e junta os nomes curtos com
`, `; o telefone concatenado com ` · ` quando existe; a nota livre em
`color.inkFaint`; e um `Chip`:

- `proxima === 0` → `signal="warning"`, texto `hoje é dia de entrega`;
- `proxima > 0` → `signal="neutral"`, texto `a próxima é {{day}}` com
  `formatWeekdayShort((hoje + proxima) % 7, locale)`.

Lei 4 explícita (`:283-285`): *"Hoje é dia de entrega" é uma coisa a fazer hoje,
então ele fica âmbar; a próxima da semana é só um fato, e fica neutro.*

**Edição** — o componente `Agreement` (`:644-714`). Três campos e nenhum
obrigatório, e o docblock diz por que (`:636-643`): *uma fábrica combina dia com a
loja grande e entrega "quando dá" na banca da esquina. Campo obrigatório aqui viraria
dia inventado, e dia inventado é pior que dia nenhum — a tela de pedido passaria a
sugerir uma data que ninguém combinou.*

| Campo | Rótulo | Dica |
|---|---|---|
| dias | `Dias de entrega` (sete `Chip` tocáveis) | `Sem dia combinado, o pedido não ganha atalho de data.` |
| telefone | `Telefone de quem recebe` | `Para avisar quando a carga atrasar.` |
| nota | `Combinado` | `Uma frase: onde descarregar, com quem falar, o que evitar.` |

Abaixo dos chips, a linha que **repete por extenso** o que ficou marcado (`:698-700`)
— *quem lê por leitor de tela, ou de luva sob luz ruim, não recebe só a cor.*

Os dias moram num inteiro, **um bit por dia, bit 0 no domingo**, mesma numeração de
`Date.getDay()` (`src/domain/agreement.ts:9-17`):

```ts
export const WEEK_BITS = [1, 2, 4, 8, 16, 32, 64] as const;
export function agreedOn(days: number, weekday: number): boolean   { return (days & WEEK_BITS[noWeek(weekday)]) !== 0; }
export function toggleDay(days: number, weekday: number): number   { return days ^ WEEK_BITS[noWeek(weekday)]; }
export function daysUntilNextDelivery(days: number, todayWeekday: number): number | null {
  if (days === 0) return null;
  for (let ahead = 0; ahead < 7; ahead += 1) {
    if (agreedOn(days, (todayWeekday + ahead) % 7)) return ahead;
  }
  return null;
}
```

`noWeek(weekday)` lança `RangeError('a semana tem sete dias, e ${weekday} não é um
deles')` fora de 0..6 (`:29-34`), e a guarda existe por achado do `mutate`:
*devolver "não combinado" para um oitavo dia seria educado e errado […] apagar a
faixa não quebrava teste nenhum.*

Duas decisões de semântica: **zero é "não combinamos dia", que é diferente de
"nenhum dia"** (`:9-13`), e `daysUntilNextDelivery` devolve **zero** quando hoje é
dia de entrega — *quem faz o pedido de manhã no dia da loja está pedindo para hoje,
e empurrar para a semana que vem seria o sistema corrigindo a pessoa.* O laço vai
até sete e não seis porque *pedindo na quinta para uma loja de quinta, o próximo é
hoje; pedindo na sexta, é daqui a seis* (`:53-57`).

#### 20.9.7 A câmara fria — `Ambiente`

`:382-625`. `const TEMPERATURA = 'temperature'` (`:369`) — constante e não literal
espalhada, *para quando umidade entrar.*

**A série da semana** (`:414-421`): `readingsBetween(company, place.id,
TEMPERATURA, dayWindow(now, tz, -6).from, dayWindow(now, tz).to)`, chaveada por
`${place.id}:${last?.id ?? ''}`. Razão escrita: *"-18,4 agora" não diz se o freezer
está piorando; sete dias de leitura dizem.* E a consulta **existia sem leitor** —
*peça sem chamador é a doença que o P1 descreve, e este repositório já a teve em
quatro lugares.*

**O `Sparkline` só com mais de um ponto** (`:525-532`): *dois pontos é o mínimo
para existir tendência, e desenhar um ponto sozinho sugeriria uma que ninguém
mediu.* `hue = fora ? color.danger : palette.sky`, altura 36.

**O juízo** (`:460-464`):

```ts
const fora = last && faixa
  ? (faixa.min !== null && last.value < faixa.min) ||
    (faixa.max !== null && last.value > faixa.max)
  : false;
```

`Chip signal={fora ? 'danger' : 'ok'}`, com `fora da faixa de {{min}} a {{max}}` ou
`dentro da faixa` (`:536-548`). Sem faixa **não há chip nenhum**: *o aplicativo não
sabe qual é a temperatura boa da câmara de outra pessoa, e -18 é o número comum de
freezer, não uma verdade* (`:378-381`).

**A última leitura** (`:509-520`): `última: {{value}} às {{time}}` ou `nenhuma
leitura anotada ainda`. O valor usa `formatTyped(last.value, locale.formatting, 1)`
e **não** `formatQuantity`, e a razão está escrita (`:512-515`): *`formatQuantity`
arredonda, e aqui isso perde meio grau de freezer: -18,4 aparecia como -18 na tela
enquanto o banco guardava a fração. Número dito diferente do número guardado é o
mesmo defeito de arredondar dinheiro cedo.*

**Os lotes expostos** — a ação que o selo vermelho pede (`:484-487`, `:553-570`):

```ts
useQuery(async () => (fora && last ? lotsInRoomAt(LOCAL_COMPANY_ID, place.id, last.takenAt) : []),
         `${place.id}:${fora ? (last?.id ?? '') : ''}`)
```

O instante é o da **própria leitura ruim**, não o de agora (`:474-479`): *a medição
foi às 07:20 e alguém abre a tela às 15:00; no meio pode ter saído carga, e o que
ficou exposto é o que estava lá naquela hora.* É a pergunta que o docblock da
fundação promete desde a primeira linha — *"o que estava dentro do freezer às
03:12?"*. E só consulta quando está fora: *listar lote em câmara saudável seria a
lista pela lista.*

Cada lote sai numa `ListRow` com `label = lote.code`, `detail = lote.name`,
`trailing = formatQuantity(lote.baseUnits)`, e o toque abre `/lots/{lotId}`
(`:560-568`), sob a sobrelinha `ESTAVA NA CÂMARA ÀS {{time}}`.

`lotsInRoomAt(companyId, locationId, instantIso)`
(`src/data/repository.ts:3077-3111`):

```sql
SELECT l.id, l.code, i.name, l.expires_on,
       COALESCE(SUM(m.quantity_base_units), 0) AS total
  FROM lots l JOIN items i ON i.id = l.item_id
  JOIN movements m ON m.lot_id = l.id
 WHERE l.company_id = ? AND m.location_id = ? AND m.occurred_at <= ?
 GROUP BY l.id, l.code, i.name, l.expires_on
HAVING SUM(m.quantity_base_units) > 0
 ORDER BY total DESC, l.code ASC
```

*`occurred_at <= ?` é a diferença inteira entre as duas perguntas.*

**Anotar a leitura** (`:489-505`, `:572-585`): `Field` `Temperatura agora`,
numérico, `suffix = "°{faixa?.unit ?? 'C'}"`, dica `Anote quando passar pela câmara.
Vira histórico — e quando o sensor chegar, ele escreve no mesmo lugar.`; botão
`Anotar leitura`, `variant="ghost"`, `disabled` enquanto `parseTyped(valor) ===
null`. Chama `recordReading(company, { locationId, kind: TEMPERATURA, value, unit })`
— **sem confirmação**, porque não é livro-razão.

**Editar a faixa** (`:438-458`, `:590-622`): fechada por padrão — *quem passa aqui
todo dia vem anotar, não vem reconfigurar.* Dois campos, `mínima` e `máxima`, com
dica `Sem faixa o app registra e não julga — ele não sabe qual é a temperatura boa da
sua câmara.`. Grava por `savePlace` com

```ts
sensorRanges: min === null && max === null
  ? {}
  : { ...place.sensorRanges, [TEMPERATURA]: { min, max, unit: faixa?.unit ?? 'C' } }
```

**A faixa mora no lugar, não na leitura** (`:430-437`): *guardar na leitura faria
cada medição carregar a sua própria régua, e duas medições da mesma câmara poderiam
discordar sobre o que é frio.*

`recordReading` (`src/data/repository.ts:2769-2820`) recusa valor não finito (`uma
leitura que não é número não é leitura`) e unidade vazia (`uma grandeza sem unidade
é um número solto`); insere em `readings` com `source` padrão `'typed'` e
enfileira. `source` é texto aberto de propósito: *quando o ESP32 do dono existir,
ele grava com `source: 'wifi'` e nada mais muda aqui* (`:2761-2767`). **Nenhum
escritor de `source` diferente de `'typed'` existe hoje.**

`lastReadings` (`:2828-2864`) traz a última leitura de cada `(location_id, kind)`
por auto-junção com `MAX(taken_at)` — uma consulta para todos os lugares em vez de
uma por lugar.

Esquema (`src/data/db.ts:603-620`):

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

#### 20.9.8 Cadastrar um lugar

`:316-351`. Fechado, é um `Button variant="ghost"` com `Cadastrar um lugar`.
Aberto, um cartão com:

- `Field` `Como se chama`, dica `O nome que a equipe usa. Dá para trocar depois sem
  mexer em saldo.`;
- sobrelinha `QUE TIPO DE LUGAR` e três `Chip` tocáveis, `signal: 'ok'` no
  escolhido — *o tipo se escolhe tocando o que ele é, não marcando um círculo […]
  cor sozinha não é informação de luva e má luz*;
- `Button` `Salvar lugar`, `disabled={!name.trim() || saving}`.

```ts
const KINDS = ['own_store', 'cold_room', 'store_room'] as const;
```
(`:163`.) **`customer`, `vehicle` e `factory` têm palavra no dicionário
(`src/i18n/locales/pt-BR.ts:719-726`) e não podem ser criados por esta tela.** Um
lugar `customer` só entra pela semeadura ou por outra origem. **Implementado sem
chamador de tela** para esses três tipos.

Não há confirmação e não há remoção: `onSave` (`:150-161`) chama
`savePlace(company, { name, kind })`, limpa o campo, fecha o formulário e
`refresh()`. **Não existe caminho de desativar ou apagar lugar. NÃO IMPLEMENTADO.**

A próxima ação provável fica no pé, e só faz sentido com mais de um lugar
(`:354-358`): `Mandar para uma loja` → `/transfer`.

#### 20.9.9 `savePlace` e `listPlaces`

`savePlace(companyId, { id?, name, kind, contactPhone?, deliveryDays?,
agreementNote?, sensorRanges? })`
(`src/data/repository.ts:630-705`):

- nome vazio lança `um lugar sem nome não se distingue de outro`;
- `days = Math.trunc(deliveryDays ?? 0)`; fora de `0..127` lança `a semana tem sete
  dias` — *recusar aqui também é o que impede a fila de sair para morrer do outro
  lado, com a pessoa achando que gravou*;
- **campo ausente é "não mexa"**: cada um dos quatro campos de ficha cai para o
  valor anterior lido do banco quando não vem no `input`; `sensorRanges: {}`
  **apaga**;
- `INSERT … ON CONFLICT(id) DO UPDATE SET name, kind, contact_phone,
  delivery_days, agreement_note, sensor_ranges`, mais `enqueue` de `locations`.

**Renomear é seguro sem cerimônia nenhuma, e é por causa da fundação** (`:622-628`):
o saldo é a soma dos movimentos, e nenhum movimento carrega o nome do lugar —
carrega o id.

`listPlaces` (`:594-620`) chama `ensureLocation` antes de consultar (então o lugar
padrão existe sempre), ordena por `kind, name`, e devolve `isDefault = (r.id ===
defaultLocationId(companyId))`. `defaultLocationId(companyId) = companyId`
(`:843-845`) — *enquanto há um lugar só, o id dele é o da própria empresa.*
`ensureLocation` cria a linha faltante com `name = ''` e `kind = 'store_room'`
(`:854-857`).

`parseSensorRanges` (`:2727-…`) é **tolerante de propósito**: JSON inválido devolve
`{}`, chave estranha é ignorada, faixa sem `unit` string não entra. *Faixa que não
pôde ser lida vira "não julgo" em vez de virar alarme aleatório.*

---

### 20.10 Os quatro postos de controle — o que existe e o que não existe

O tipo existe desde o domínio (`src/domain/ledger.ts:48-53`):

```ts
/**
 * Where a movement was recorded in the chain of custody. Comparing two posts
 * localizes a loss - picking error, route loss, or receiving error - without
 * accusing anyone.
 */
export type ControlPost = 'picked' | 'loaded' | 'delivered' | 'checked';
```

A coluna existe no aparelho (`ALTER TABLE movements ADD COLUMN post TEXT`,
`src/data/db.ts:366`) e o `kind` `'discrepancy'` está no enum desde o começo, com o
comentário `difference found at a control post`
(`src/domain/ledger.ts:28`).

**Escrita: um de quatro.** A busca por `'picked'`, `'loaded'`, `'delivered'` e
`'checked'` em toda a árvore de código de produção devolve:

| Posto | Escrito por | Estado |
|---|---|---|
| `picked` (separado) | ninguém | **NÃO IMPLEMENTADO** |
| `loaded` (carregado) | ninguém | **NÃO IMPLEMENTADO** |
| `delivered` (entregue) | ninguém — o `'delivered'` de `app/orders/index.tsx:191` e `app/transfer.tsx:279` é `OrderStatus`, não `ControlPost` | **NÃO IMPLEMENTADO** |
| `checked` (conferido) | `recordCheck`, literal na instrução (`src/data/repository.ts:2496`) | **implementado e chamado** por `app/(tabs)/transport.tsx:127` |

Duas consultas leem o posto, e as duas só leem `'checked'`:
`shipmentsOn` para marcar `Shipment.checked` (`:3326`) e `unchecked` para listar as
remessas do dia que ninguém conferiu (`:2540`).

**Nenhuma das oito telas desta seção escreve posto de controle.** A conferência mora
na aba de transporte, e `app/transfer.tsx` — que grava a carga — não escreve `post`
em nenhum ponto: as duas pernas de `moveBetween` não passam a coluna
(`src/data/repository.ts:1714-1737`).

`recordCheck(companyId, { groupId, counted?, occurredAt?, note?, assistantPhrase? })`
(`:2436-2517`), transcrito porque é o único posto que existe:

- Lê as pernas **positivas** do grupo (`quantity_base_units > 0`); grupo vazio
  lança `remessa ${groupId} não existe`.
- `counted` omitido significa **"chegou tudo"**: cada perna vira uma diferença de
  zero. *É o caso comum e o único que alguém preenche na doca.* Com lista, item não
  mencionado é **pulado** — *a ausência não vira acusação.*
- `difference = Math.round(said.baseUnits) - leg.quantity`.
- Escreve **uma linha nova por item**, nunca um carimbo na remessa: `kind =
  'discrepancy'`, `post = 'checked'`, `quantity_base_units = difference`,
  `movement_group_id = input.groupId` (o **mesmo** grupo da remessa),
  `counterpart_location_id` e `unit_cost_rate` copiados da perna de entrada.
- **A linha que bateu tem quantidade zero**, e isso precisou de migração no servidor
  (0017): a restrição `movement_moved_something` recusava linha que não move nada.
  Mas *"conferi e bateu" é justamente a conferência que mais vale — é a prova de que
  alguém abriu a caixa —, e sem poder gravá-la o app não saberia distinguir "ainda
  não conferiu" de "conferiu e estava tudo certo"* (`:2425-2431`).
- **A taxa gravada é a da perna de entrada da remessa, não a média de hoje**: *o que
  faltou foi a mercadoria que embarcou, ao custo com que embarcou. Ler o custo atual
  avaliaria a falta de setembro ao preço de outubro.*

O motivo de ser linha nova e não `UPDATE` é o esquema, não o desenho: *o gatilho
`movements_are_immutable` do servidor recusa qualquer UPDATE em `movements`, sem
exceção e sem olhar coluna* (`:2420-2423`).

**Formulário de contagem por item na conferência: NÃO IMPLEMENTADO.** A tela chama
`recordCheck` sem `counted` (`app/(tabs)/transport.tsx:127`), e o comentário diz por
que: *um formulário de contagem por item, no celular, na doca, ninguém preenche.
Quem achou diferença corrige na tela do lugar, que já sabe registrar contagem cega.*
O parâmetro `counted` é, portanto, **implementado sem chamador de tela**.

---

### 20.11 Cada ato desta seção → o que fica no livro-razão

| Tela | Ato | Função | Linhas em `movements` | `kind` | Sinal | `movement_group_id` | `lot_id` |
|---|---|---|---|---|---|---|---|
| `/production/new` | registrar produção | `recordProduction` | 1 + uma por insumo (receita explodida + embalagem) | `production` / `consumption` | `+unitsProduced` / `-baseUnits` | um `newId()` para todas | só na de produção |
| `/production/new` | começar agora | `openProductionRun` | **nenhuma** — grava em `production_runs` | — | — | — | — |
| `/production/new` | cancelar | `cancelProductionRun` | **nenhuma** — `DELETE` da linha de estado | — | — | — | — |
| `/production/new` | fechar produção | `closeProductionRun` | as mesmas do `recordProduction`, com `occurred_at = run.opened_at` | idem | idem | `newId()` (o `runId` **não** vira grupo — quem grava é `recordProduction`) | idem |
| `/lots/<id>` | corrigir a corrida | `reverseGroup` | uma por movimento original | `reversal` | invertido | grupo **novo**, comum às pernas do estorno | copiado do original |
| `/orders` | aprovar / entregar / cancelar | `setOrderStatus` | **nenhuma** | — | — | — | — |
| `/orders/new` | anotar pedido | `saveOrder` | **nenhuma** — `orders` + `order_lines` | — | — | — | — |
| `/transfer` | mandar para a loja | `recordTransfer` | **duas** | `transfer` | `-` na origem, `+` no destino | um, comum às duas | nas duas |
| `/transfer` | a loja devolveu | `recordReturn` | **duas** | `return` | `-` na loja, `+` na fábrica | um, comum às duas | nas duas |
| `/transfer` | fechar o pedido coberto | `setOrderStatus` | **nenhuma** | — | — | — | — |
| `/purchase` | lançar compra | `recordPurchase` | **uma** (+ `purchases`, `purchase_lines`, `item_costs`, `item_cost_history`) | `purchase` | `+baseUnits` | o id da **nota** | — |
| `/losses` | — | — | **nenhuma** (relatório) | — | — | — | — |
| `/places` | salvar lugar / acordo / faixa | `savePlace` | **nenhuma** — `locations` | — | — | — | — |
| `/places` | anotar leitura | `recordReading` | **nenhuma** — `readings` | — | — | — | — |

Duas colunas que **nenhuma** destas telas preenche em nenhum ato:
`assistant_phrase` (aceita por `recordProduction`, `recordPurchase`,
`recordLoss`, `moveBetween` e `recordCheck`, e passada só pelo assistente) e `note`
(aceita pelas mesmas cinco). **Implementadas sem chamador nestas oito telas.**

---

### 20.12 Classificação explícita: o que está pronto, o que não tem chamador, o que é planejado

**Implementado e chamado por tela nesta seção**

- `recordProduction`, `openProductionRun`, `openProductionRuns`,
  `cancelProductionRun`, `closeProductionRun` — `app/production/new.tsx`.
- `findLot`, `planReversal`, `reverseGroup` — `app/lots/[id].tsx`.
- `lotCode` e `expiresOn` — via `recordProduction`.
- `qrPath` / `qrModules` / `QUIET_ZONE` — via `QrCode` em `app/lots/[id].tsx:209`.
- `listOrders`, `setOrderStatus`, `saveOrder`, `stockAgainstOrders`,
  `ordersNeedApproval` (lida dentro de `saveOrder`) — telas de pedido.
- `recordTransfer`, `recordReturn`, `pickingFor`, `lastSentBaseUnits`,
  `lotsInStock`, `shipmentsOn`, `pickSuggestion`, `ordersCoveredBy` —
  `app/transfer.tsx`.
- `recordPurchase`, `purchaseToBaseUnits`, `judgePriceChange`, `priceSignal`,
  `applyCostEvent`, `costRecipe`, `costPerProductUnit`, `packagingRatePerUnit` —
  `app/purchase.tsx`.
- `lossesOn` — `app/losses.tsx`.
- `listPlaces`, `savePlace`, `stockByPlace`, `lastReadings`, `readingsBetween`,
  `recordReading`, `lotsInRoomAt`, `agreedOn`, `toggleDay`,
  `daysUntilNextDelivery` — `app/places.tsx`.
- `explodeRequirements`, `defaultLocationId`, `INTERNAL_PLACE_KINDS`,
  `receivesCargo` — várias.

**Implementado sem chamador de tela (nesta seção)**

- `recordProduction.lotCode` (código de lote próprio da fábrica): o parâmetro
  existe (`src/data/repository.ts:1341-1342`) e diz *"a tela deixa editar"*
  (`src/domain/lot.ts:30-31`) — **nenhuma tela deixa editar**.
- `recordProduction.occurredAt`, `recordProduction.note`,
  `recordProduction.assistantPhrase`: só o `closeProductionRun` passa
  `occurredAt`; `note` e `assistantPhrase` não são passados por tela nenhuma.
- `recordPurchase.occurredAt` e `recordPurchase.orderedAt`: existem, e
  `app/purchase.tsx` não passa nenhum dos dois.
- `saveOrder.note` e `Order.note`: coluna, tipo e parâmetro existem;
  `app/orders/new.tsx` não passa.
- `recordCheck.counted`: a contagem por item na doca não é oferecida.
- `daysUntilExpiry` (`src/domain/lot.ts:64-72`): nenhuma das oito telas chama.
- `recordLoss`: escritor existe e é completo, mas o chamador está fora desta seção
  (`app/inputs/[id].tsx:256`) — `app/losses.tsx` só lê.
- `unchecked` (`src/data/repository.ts:2520-2545`): nenhuma das oito telas chama.
- Tipos de lugar `customer`, `vehicle` e `factory`: têm palavra no dicionário e não
  estão em `KINDS` de `app/places.tsx:163`.
- `readings.device_id`: coluna e parâmetro existem; `app/places.tsx:494-499` não
  passa `deviceId`.
- `Reading.source` diferente de `'typed'`: previsto no docblock, sem escritor.

**Planejado, comentado, ou explicitamente fora**

- **Impressão da etiqueta**: a tela é a prova visual; a escolha de impressora é do
  dono (`app/lots/[id].tsx:26-29`). **NÃO IMPLEMENTADO.**
- **Consumo de insumo por lote (PEPS)**: nomeado como *trabalho da Fase 3*
  (`src/data/repository.ts:1605`). **NÃO IMPLEMENTADO.**
- **Postos `picked`, `loaded`, `delivered`**: tipo pronto, sem escritor
  (subseção 20.10).
- **Ligar a embalagem digitada (`unitPackagingCents`) aos itens comprados por
  nota**: o comentário diz que o custo sai certo e *o estoque de palito só sobe*, e
  que ligar os dois é mudança de esquema que *vem separada desta*
  (`src/data/repository.ts:1476-1480`). Parcialmente resolvido por
  `packagingItems`, que **existe e é consumido** (`:1379-1382`); o campo em centavos
  continua para *o que sobrou de fora — rótulo, fita, o que nunca virou item*
  (`:1783-1789`).
- **Reserva de estoque no pedido**: decidida como **não existente**, com razão
  escrita em três lugares (subseção 20.5.1). Não é lacuna: é decisão.
- **Sensor de temperatura por hardware**: `recordReading` já aceita `source` e
  `device_id` para quando o ESP32 existir (`:2761-2767`). **NÃO IMPLEMENTADO.**
- **Editar ou apagar pedido gravado**: não existe tela nem função. **NÃO
  IMPLEMENTADO.**
- **Desativar ou apagar lugar**: não existe. **NÃO IMPLEMENTADO.**
