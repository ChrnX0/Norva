## 19. Telas — insumos, produtos, receitas e catálogo

### 19.0 Mapa: rotas, arquivos, área e o que cada uma escreve

Oito arquivos, oito rotas do `expo-router` (o roteador monta a rota pelo caminho
do arquivo dentro de `app/`; `app/_layout.tsx:112` declara `<Stack
screenOptions={{ headerShown: false }} />`, então todas estas telas são
empilhadas sem cabeçalho nativo).

| Rota | Arquivo | Área (`AreaProvider`) | Escreve no banco | Chamada de onde |
|---|---|---|---|---|
| `/inputs` | `app/inputs/index.tsx` | `mint` (`app/inputs/index.tsx:52`) | nada | `app/(tabs)/more.tsx:74` |
| `/inputs/new` e `/inputs/new?id=<itemId>` | `app/inputs/new.tsx` | `mist` (`app/inputs/new.tsx:65`) | `saveItem` + `recordPurchase` (`app/inputs/new.tsx:312`, `:327`) | `app/inputs/index.tsx:367` (novo) e `app/inputs/[id].tsx:825` (corrigir) |
| `/inputs/<itemId>` e `/inputs/<itemId>?sala=<locationId>` | `app/inputs/[id].tsx` | `mint` (`app/inputs/[id].tsx:83`) | `recordCount`, `recordLoss`, `reverseGroup`, `setItemActive` | `app/inputs/index.tsx:352`, `app/inputs/[id].tsx:586` |
| `/products` | `app/products/index.tsx` | `apricot` (`app/products/index.tsx:54`) | nada | `app/(tabs)/more.tsx:76` |
| `/products/new` | `app/products/new.tsx` | `apricot` (`app/products/new.tsx:98`) | `saveProduct` (`app/products/new.tsx:331`) | `app/products/index.tsx:182`, `app/orders/new.tsx:400` |
| `/recipes` | `app/recipes/index.tsx` | `apricot` (`app/recipes/index.tsx:55`) | nada | `app/(tabs)/more.tsx:75`, `app/(tabs)/reports.tsx:97` e `:146` |
| `/recipes/<recipeId>` | `app/recipes/[id].tsx` | `apricot` (`app/recipes/[id].tsx:83`) | `saveRecipeVersion` (`app/recipes/[id].tsx:306`) | `app/recipes/index.tsx:194` e `:243`, `app/products/index.tsx:173`, `app/inputs/[id].tsx:752`, `src/assistant/skills.ts:81` e `:313` |
| `/catalog` | `app/catalog.tsx` | `sand` (`app/catalog.tsx:56`) | `saveLine`, `saveType`, `saveFlavor` | **só** `app/products/index.tsx:193` |

Três ausências verificadas por listagem de diretório, e todas importam para quem
reconstrói:

- **Não existe tela de detalhe de produto.** `app/products/` tem apenas
  `index.tsx` e `new.tsx`. Tocar a linha de um produto na lista abre a **receita**
  dele (`app/products/index.tsx:172-174`).
- **Não existe tela de criação de receita.** `app/recipes/` tem apenas
  `index.tsx` e `[id].tsx`; `saveRecipeVersion` aceita `recipeId` ausente e cria
  uma receita nova (`src/data/repository.ts:1151`), mas o único chamador de tela
  sempre manda `recipeId` (`app/recipes/[id].tsx:307`). Receita nasce apenas pela
  semeadura (`src/data/seed.ts:162` e `:174`). O próprio dicionário registra a
  lacuna: `empty: 'Nenhuma ficha técnica ainda. Cadastre os insumos primeiro,
  depois a receita que os usa.'` (`src/i18n/locales/pt-BR.ts:890`) — a frase não
  aponta rota nenhuma. **NÃO IMPLEMENTADO.**
- **Não existe correção nem remoção de linha/tipo/sabor.** `saveLine`,
  `saveType` e `saveFlavor` aceitam `id` e `sort` (`src/data/repository.ts:3682`,
  `:3700`, `:3718`), mas `app/catalog.tsx:231`, `:295` e `:337` só passam `name`
  (e `lineId` no tipo) — então `sort` é sempre 0 e nada renomeia nem desativa.
  **Implementado no repositório, sem chamador de tela.**

---

### 19.1 Convenções compartilhadas por estas oito telas

Transcritas aqui uma vez para não repetir em cada subseção.

**Casca.** Toda tela é `CollapsingHeader({ title, overline, children })`
(`src/components/CollapsingHeader.tsx:28-36`): título que encolhe ao rolar e
`overline` que desaparece na primeira metade da rolagem. Cada bloco filho entra
dentro de `Reveal({ index })` (`src/components/Reveal.tsx:36-45`), que escalona a
entrada pelo índice — e o índice **não pula número**: telas com blocos
condicionais recalculam a sequência (`app/products/new.tsx:383-391`,
`app/recipes/[id].tsx:375`, `app/inputs/new.tsx:349`).

**Cartão.** `Card({ children, tone, hue, icon, title, style })`
(`src/components/Card.tsx:43-70`). `tone` é `'plain' | 'area' | 'danger' |
'warning'` (`src/components/Card.tsx:7`); `hue` é a cor do assunto; `icon` recebe
a cor já resolvida e desenha o crachá redondo.

**Botão.** `Button({ label, onPress, variant, weighty, disabled, icon, style })`
(`src/components/Button.tsx:16-41`). `variant: 'primary' | 'ghost'`; `weighty`
vibra.

**Campo.** `Field({ label, value, onChangeText, placeholder, hint, suffix,
keyboardType, autoFocus })` (`src/components/Field.tsx:14-32`). O rótulo é
sempre visível e sai em caixa alta (`label.toUpperCase()`,
`src/components/Field.tsx:37`); é ele que serve de `accessibilityLabel`
(`src/components/Field.tsx:58`) — por isso o `e2e` busca campos por
`getByLabel('Quanto vem dentro')`. O `hint` é renderizado com
`accessibilityLiveRegion="polite"` (`src/components/Field.tsx:72`). Altura
mínima 52 px (`src/components/Field.tsx:86`).

**Etiqueta.** `Chip({ signal, label })` com `signal: 'ok' | 'warning' | 'danger'
| 'neutral'` (`src/components/Chip.tsx:6`, `:19`). Nestas telas, escolha se faz
tocando a etiqueta: acesa é `'ok'`, apagada é `'neutral'`.

**Linha de lista.** `ListRow({ label, detail, trailing, trailingTone, signal,
onPress })`, `trailingTone: 'ink' | 'muted' | 'ok' | 'warning'`
(`src/components/ListRow.tsx:19-41`). Sem `onPress` a linha não afunda e o papel
de acessibilidade cai para `'text'` (`src/components/ListRow.tsx:73-74`).

**Confirmação.** `useConfirm()` devolve `(request) => Promise<boolean>`
(`src/components/Confirm.tsx:81`) e `ConfirmRequest = { title, message,
confirmLabel?, cancelLabel?, destructive?, acknowledge? }`
(`src/components/Confirm.tsx:25-34`). `destructive` desenha diálogo centrado na
cor de perigo; `acknowledge` remove o cancelar (é aviso, não pergunta).

**Consulta.** `useQuery(run, key)` devolve `{ data, loading, error, refresh }`
(`src/data/useQuery.ts:21-25`). `loading` é derivado de a resposta em mão
pertencer à chave pedida (`src/data/useQuery.ts:89`), e a consulta é refeita a
cada foco da tela (`src/data/useQuery.ts:78-84`) — é isso que faz uma tela
empilhada voltar atualizada depois de gravar em outra.

**Empresa.** Toda chamada de dados passa `LOCAL_COMPANY_ID =
'00000000-0000-4000-8000-000000000001'` (`src/data/seed.ts:12`).

**Traço dos desenhos.** `const traco = skin === 'papel' ? 1.7 : 2.2` — repetido
em todas as oito telas (`app/inputs/index.tsx:87`, `app/inputs/new.tsx:98`,
`app/inputs/[id].tsx:113`, `app/products/index.tsx:72`,
`app/products/new.tsx:125`, `app/recipes/index.tsx:82`,
`app/recipes/[id].tsx:121`, `app/catalog.tsx:67`).

**Números.** Leitura e escrita de campo numérico são inversas e moram num lugar
só: `parseTyped(raw): number | null` (`src/domain/number.ts:32-75`) e
`formatTyped(value, formatting, maxDecimals = 4)`
(`src/domain/number.ts:85-90`). Regra do `parseTyped`: o **último** separador é o
decimal; ponto solitário com exatamente três casas e parte inteira diferente de
zero é agrupamento (`1.250` = mil duzentos e cinquenta), e vírgula nunca é
agrupamento (`src/domain/number.ts:60-63`). `formatTyped` nunca agrupa.

**Dinheiro e taxa.** `Cents` é inteiro; `Rate` é centavo fracionário por
unidade-base (`src/domain/money.ts:5`, `:49`). `fromDecimal(v) = Math.round(v *
100)` (`src/domain/money.ts:11-13`); `rate(preço, unidadesBase) = preço * 100 /
unidadesBase` (`src/domain/money.ts:52-55`); `amountOf(rate, qtd) =
Math.round(rate * qtd)` (`src/domain/money.ts:58-60`). Todas estas telas mostram
taxa multiplicada por 1.000 (`Math.round(averageRate * 1_000)`), que é o custo a
cada mil unidades-base.

**Formatação de texto.** `fill(template, values)` troca `{{chave}}`
(`src/i18n/index.ts:40-44`); `plural(n, {one, other}, display?)` escolhe a frase
inteira (`src/i18n/index.ts:55-65`); `formatMoney`, `formatQuantity`
(`maximumFractionDigits: 0`), `formatPercent(fraction, locale, digits = 1)`,
`formatDayMonth`, `formatPacked` (`src/i18n/index.ts:96`, `:103`, `:217`, `:247`,
`:146`).

---

### 19.2 `app/inputs/index.tsx` — Almoxarifado (a lista do que se compra)

413 linhas. Título `t.app.inputs.title = 'Almoxarifado'`, overline `'o que você
compra'` (`src/i18n/locales/pt-BR.ts:508-509`, usados em
`app/inputs/index.tsx:149`).

#### 19.2.1 O que ela consulta

Quatro consultas, todas por `useQuery`:

| Consulta | Chamada | Chave |
|---|---|---|
| lugares cadastrados | `listPlaces(LOCAL_COMPANY_ID)` (`app/inputs/index.tsx:97`) | `''` |
| faixas de cor da casa | `alertSettings()` (`app/inputs/index.tsx:99`) | `''` |
| itens com saldo e custo | `listItems(LOCAL_COMPANY_ID, undefined, false, place ?? undefined)` (`app/inputs/index.tsx:100-103`) | `place ?? ''` |
| cobertura (quanto dura) | `runningOut(...)` (`app/inputs/index.tsx:117-129`) | `` `${kind}:${place ?? ''}` `` |

`listItems` é chamada **sem** `kind` (o filtro por aba é feito em memória,
`app/inputs/index.tsx:131`) e com `includeInactive = false` — item fora de
circulação não aparece (`src/data/repository.ts:146-153`, cláusula `AND (? = 1 OR
i.active = 1)` em `src/data/repository.ts:178`). O saldo de cada item é
subconsulta sobre `movements`, filtrada por local quando há local
(`src/data/repository.ts:171-174`) — não existe coluna de estoque.

A cobertura usa a janela do dia local: `dayWindow(nowIso(), locale.timeZone)` e
`dayWindow(nowIso(), locale.timeZone, -7)` (`app/inputs/index.tsx:118-119`,
`src/domain/day.ts:49-68`), e chama `runningOut(company, lastWeek.from,
today.to, 7, Number.POSITIVE_INFINITY, place ?? undefined, [kind])` — sete dias
de janela, horizonte **infinito** (todos os itens com saída entram, ordenados por
`daysLeft`, `src/data/repository.ts:3844` e `:3854`) e recorte por tipo igual à
aba escolhida.

#### 19.2.2 As três abas

`TABS` é ordem + desenho; a palavra vem do dicionário
(`app/inputs/index.tsx:65-81`):

| `kind` (enum do banco) | chave do dicionário | palavra pt-BR | glifo |
|---|---|---|---|
| `input` | `input` | `Insumos` | `GlyphSack` (saco) |
| `packaging` | `packaging` | `Embalagem` | `GlyphPackaging` |
| `store_supply` | `storeSupply` | `Material de loja` | `GlyphBucket` (balde) |

Os valores do enum `ItemKind` completos são `'input' | 'packaging' | 'product' |
'resale' | 'store_supply'` (`src/data/repository.ts:32`) — esta tela mostra três
dos cinco; `product` e `resale` são a lista de produtos.

Estado inicial: `kind = 'input'` (`app/inputs/index.tsx:88`). Cada aba é
`Pressable` com `accessibilityRole="button"`, `accessibilityState={{ selected }}`
e `accessibilityLabel` igual à palavra (`app/inputs/index.tsx:162-167`), largura
mínima 76 px. O rótulo traz a contagem quando há itens: `` `${palavra} ·
${formatQuantity(count, locale)}` `` (`app/inputs/index.tsx:191-192`). O glifo
aceso usa `palette.mint`, o apagado `color.inkFaint`
(`app/inputs/index.tsx:179`), e a palavra troca de peso (`'600'` contra `'400'`,
`app/inputs/index.tsx:186`) — cor nunca é o único sinal.

#### 19.2.3 O filtro de sala

Só existe quando há mais de um lugar: `salas.length > 1`
(`app/inputs/index.tsx:205`). Nulo é "todos os lugares" e é o padrão
(`app/inputs/index.tsx:95`). A lista de escolhas é `[null, ...salas.map(p =>
p.id)]` (`app/inputs/index.tsx:212`); o rótulo de `null` é
`t.app.inputs.everywhere = 'Todos os lugares'`
(`src/i18n/locales/pt-BR.ts:520`), e o lugar que nasceu com a empresa vem com
`name` vazio do banco, então a tela cai em `t.app.places.factory = 'Fábrica'`
(`app/inputs/index.tsx:216`, `src/i18n/locales/pt-BR.ts:680`; o repositório
grava o padrão sem nome de propósito, `src/data/repository.ts:587-596` e
`:854-857`).

#### 19.2.4 O cartão do dinheiro parado

Só aparece com item no recorte (`shown.length > 0`, `app/inputs/index.tsx:251`) —
"um total de zero é um alerta inventado" (comentário,
`app/inputs/index.tsx:249-250`). Composição:

- **Overline** `t.app.inputs.heldTitle = 'PARADO NO ESTOQUE'`
  (`src/i18n/locales/pt-BR.ts:525`).
- **Figura** `formatMoney(heldCents, locale)` com
  `heldCents = Σ Math.round(item.averageRate * item.onHandBaseUnits)` sobre os
  itens da aba (`app/inputs/index.tsx:137-140`, `:262`).
- **Legenda** `fill(t.app.inputs.heldDetail, { count: plural(shown.length,
  t.app.inputs.itemCount, formatQuantity(shown.length, locale)) })` —
  `heldDetail = '{{count}} · ao custo médio de cada um'` e
  `itemCount = { one: '1 item', other: '{{n}} itens' }`
  (`src/i18n/locales/pt-BR.ts:526-527`). Conta **itens**, não unidades: o
  comentário registra o defeito anterior, em que quatro insumos apareciam como
  "4 unidades" ao lado de um saco com 69.566 g (`app/inputs/index.tsx:265-270`).
  Com sala escolhida, acrescenta `' · ' + t.app.inputs.inRoom` (`'no lugar
  escolhido'`, `src/i18n/locales/pt-BR.ts:521`, uso em
  `app/inputs/index.tsx:274`).
- **A comparação** (Lei 3), três frases mutuamente exclusivas
  (`app/inputs/index.tsx:278-288`):

| Condição | Texto |
|---|---|
| `cover.length === 0` | `coverUnknown = 'sem saída registrada ainda — ninguém sabe quanto tempo isso dura'` (`src/i18n/locales/pt-BR.ts:524`) |
| `cover[0].daysLeft > 30` | `coverComfortable = 'nada aqui acaba antes de um mês'` (`:522`) |
| caso contrário | `fill(shortestCover, { item: cover[0].name, days: plural(Math.floor(cover[0].daysLeft), t.app.home.dayCount) })`, com `shortestCover = 'o mais curto é {{item}}, que acaba em {{days}}'` (`:523`) e `dayCount = { one: '1 dia', other: '{{n}} dias' }` (`:140`) |

- **Aviso de item sem preço**, quando `withoutPrice > 0` (itens com
  `averageRate <= 0`, `app/inputs/index.tsx:142`): `fill(t.app.inputs.withoutPrice,
  { count: `${formatQuantity(n)} ${n === 1 ? t.units.unit.one :
  t.units.unit.other}` })`, com `withoutPrice = '{{count}} sem preço — lance a
  nota de compra e o custo aparece sozinho.'`
  (`src/i18n/locales/pt-BR.ts:528-529`) e `unit = { one: 'unidade', other:
  'unidades' }` (`:28`). Cor `color.warning` (`app/inputs/index.tsx:291`).

#### 19.2.5 A lista, a linha e os estados vazios

Três ramos (`app/inputs/index.tsx:306-362`):

1. `loading` → cartão simples com `t.app.inputs.opening = 'Abrindo…'`
   (`src/i18n/locales/pt-BR.ts:530`).
2. `shown.length === 0` → cartão com o glifo **da aba**, `hue = palette.mint`, e
   a frase vazia da aba (`app/inputs/index.tsx:311-320`):
   - `empty.input = 'Nada cadastrado ainda.'`
   - `empty.packaging = 'Palito, saquinho, rótulo — nada ainda.'`
   - `empty.storeSupply = 'Copo, colher, guardanapo — nada ainda.'`
     (`src/i18n/locales/pt-BR.ts:515-519`)
3. lista → uma `ListRow` por item.

A linha:

| Parte | Valor |
|---|---|
| `label` | `item.name` (`app/inputs/index.tsx:325`) |
| `signal` | `bandSignal(volumeBand(item.onHandBaseUnits, item.fullLevel, faixas.bands))`, só quando `faixas` já carregou (`app/inputs/index.tsx:330-333`) |
| `detail` | `describe(item, t.app.inputs.inStock, locale.formatting, t.app.inputs.ofFull)` (`:335-340`) |
| `trailing` | `formatMoney(Math.round(item.averageRate * 1_000), locale)` ou `'—'` quando `averageRate <= 0` (`:341-345`) |
| `trailingTone` | `'ink'` com preço, `'muted'` sem (`:346`) |
| `onPress` | `router.push(`/inputs/${item.id}${place ? `?sala=${place}` : ''}`)` (`:352`) |

A sala vai na rota de propósito: sem ela a ficha abre no total da empresa e a
contagem gravaria a diferença no almoxarifado — "isso TELEPORTA estoque"
(comentário, `app/inputs/index.tsx:348-351`).

`describe()` (`app/inputs/index.tsx:377-413`) monta até três pedaços unidos por
`'  ·  '`:

1. `` `${item.purchaseUnit} · ${item.purchaseToBase.toLocaleString(formatting)}
   ${item.baseUnit}` `` — só quando os dois existem (`:386-390`).
2. `fill('{{amount}} em estoque', { amount: `${onHand.toLocaleString(formatting)}
   ${baseUnit}` })` — só quando o saldo é positivo (`:391-397`;
   `inStock = '{{amount}} em estoque'`, `src/i18n/locales/pt-BR.ts:534`).
3. `fill('{{percent}} do cheio', { percent: `${Math.round(onHand / fullLevel *
   100)}%` })` — só quando `fullLevel !== null && fullLevel > 0` (`:404-409`;
   `ofFull`, `src/i18n/locales/pt-BR.ts:533`). É esta frase que impede que a cor
   seja a única informação.

Régua da coluna da direita, colada embaixo da lista:
`fill(t.app.inputs.perThousand, { unit: shown[0].baseUnit })` — `'O valor à
direita é o custo a cada 1.000 {{unit}}.'` (`src/i18n/locales/pt-BR.ts:531`, uso
em `app/inputs/index.tsx:357-359`). **Fato:** a unidade citada é a do
**primeiro** item da lista; numa aba que mistura `g` e `un` a régua fala de uma
só.

As faixas de cor (`src/domain/alerts.ts:133-146`), com os limites que a casa
cadastra e cujo padrão é `{ red: 25, yellow: 40, blue: 80, notifyFull: false }`
(`src/domain/alerts.ts:116`):

| Faixa | Regra | Cor via `bandSignal` |
|---|---|---|
| `null` | `fullLevel` nulo ou ≤ 0 → **nenhuma cor** | `undefined` (`src/components/Chip.tsx:95`) |
| `zerado` | `onHand <= 0` | `danger` |
| `vermelho` | `share <= bands.red` | `danger` |
| `amarelo` | `share <= bands.yellow` | `warning` |
| `azul` | `share >= bands.blue` | `neutral` |
| `verde` | resto | `ok` |

`share = (onHand / fullLevel) * 100`.

#### 19.2.6 Ação

Uma só, ao fim: `Button` primário `weighty` com `t.app.inputs.addNew =
'Cadastrar novo'` (`src/i18n/locales/pt-BR.ts:532`), glifo `GlyphPlus`, indo para
`/inputs/new` (`app/inputs/index.tsx:364-371`).

#### 19.2.7 A Lei da Inteligência nesta tela

- **O que é normal:** o dinheiro parado do recorte, com a contagem de itens ao
  lado, e a coluna de custos por mil unidades-base comparável a olho.
- **O que está diferente agora:** a frase de cobertura (`shortestCover`) e a
  faixa de cor de cada linha; o aviso de itens sem preço.
- **Próxima ação provável:** `Cadastrar novo`, e o toque na linha para a ficha
  (com a sala embutida).
- Registro no teste da lei: `'app/inputs/index.tsx': { compara:
  /shortestCover|coverUnknown|coverComfortable/ }` (`src/law.test.ts:88`).

#### 19.2.8 Onde deduz em vez de perguntar

Filtro de sala só onde há mais de uma sala (`:205`, comentário `:89-94`); a
cobertura sai do próprio livro-razão em vez de um consumo cadastrado
(`:117-129`); a cor só existe quando há régua cadastrada (`:330-333`).

---

### 19.3 `app/inputs/new.tsx` — Novo cadastro e correção do cadastro

518 linhas, e **um formulário para dois modos**: `const { id } =
useLocalSearchParams<{ id?: string }>(); const editing = Boolean(id)`
(`app/inputs/new.tsx:107-108`). Motivo registrado no arquivo: apagar é recusado
depois que uma compra aponta para a linha, e duas telas que divergem custam mais
que uma com `id` (`app/inputs/new.tsx:100-106`).

Cabeçalho (`app/inputs/new.tsx:352-355`):

| Modo | `title` | `overline` |
|---|---|---|
| novo | `newTitle = 'Novo cadastro'` | `newOverline = 'cadastro'` |
| corrigindo | o nome digitado, ou `fallbackTitle = 'Insumo'` | `editOverline = 'corrigindo o cadastro'` |

(`src/i18n/locales/pt-BR.ts:539-542`.)

#### 19.3.1 O rascunho e os valores que nascem preenchidos

O formulário é derivado, não copiado: `form` é a fusão de padrões, do item
carregado por `findItem(LOCAL_COMPANY_ID, id)` e do rascunho local
(`app/inputs/new.tsx:110-158`).

| Campo (`Draft`) | Padrão em cadastro novo | Valor ao corrigir |
|---|---|---|
| `kind` | `'input'` (`:118`) | o `kind` do item, se for um dos três; senão `'input'` (`:127-131`) |
| `name` | `''` (`:119`) | `existing.name` (`:132`) |
| `purchaseUnit` | `''` (`:120`) | `existing.purchaseUnit ?? ''` (`:133`) |
| `purchaseToBase` | `''` (`:121`) | `formatTyped(existing.purchaseToBase, locale.formatting)` ou `''` (`:134-136`) |
| `baseUnit` | `'g'` (`:122`) | `existing.baseUnit` (`:137`) |
| `price` | `''` (`:123`) | reconstruído: `formatTyped((existing.averageRate * (existing.purchaseToBase ?? 1)) / 100, locale.formatting)` quando `averageRate > 0` (`:148-154`) |
| `fullLevel` | `''` (`:124`) | `formatTyped(existing.fullLevel, ...)` quando não nulo (`:138-140`) |

Nota transcrita do arquivo: o preço é escrito com o separador do idioma porque
`String(12.4)` é `"12.4"`, e o leitor desta tela transformava isso em 124
(`app/inputs/new.tsx:145-147`).

#### 19.3.2 Os campos, um por um

**Cartão 1 — o que é** (`hue = palette.mint`, ícone `GlyphPlus`, título é a
palavra do tipo escolhido, `app/inputs/new.tsx:359-400`):

| Rótulo | Tipo | Padrão | Validação |
|---|---|---|---|
| `Nome` (`name`, `src/i18n/locales/pt-BR.ts:543`) | texto, `autoFocus`, placeholder `'Açúcar cristal'` (`:544`) | vazio | `name.trim().length > 0` é condição de salvar (`app/inputs/new.tsx:270`) |
| `PARA QUE SERVE` (`whatFor`, `:545`) | três `Chip` tocáveis | `input` | sem validação: sempre um dos três |

As três palavras e as legendas (`src/i18n/locales/pt-BR.ts:546-551`), com a
legenda mudando junto com a escolha (`app/inputs/new.tsx:394-396`):

| `kind` | Palavra | `kindHint` |
|---|---|---|
| `input` | `Insumo` | `'Entra na receita e vira custo do produto.'` |
| `packaging` | `Embalagem` | `'Palito, saquinho, rótulo — custa por unidade produzida.'` |
| `store_supply` | `Material de loja` | `'Copo, colher, guardanapo — custa dinheiro na loja, mas não entra em receita.'` |

**Cartão 2 — como você compra** (`hue = palette.mint`, ícone `GlyphSack`, título
`howYouBuy = 'Como você compra'`, subtítulo `howYouBuyHint = 'Do jeito que vem do
fornecedor, não do jeito que entra na receita.'`;
`src/i18n/locales/pt-BR.ts:552-553`, uso em `app/inputs/new.tsx:405-412`):

| Rótulo | Chave | Tipo / teclado | Placeholder | Sufixo | Dica |
|---|---|---|---|---|---|
| `Embalagem` | `pack` (`:554`) | texto | `saco 25 kg` (`packPlaceholder`, `:555`) | — | — |
| `Quanto vem dentro` | `perPack` (`:556`) | `numeric` | `25000` | `baseUnit` | — |
| `Medida de uso` | `useUnit` (`:557`) | texto | `g` | — | `useUnitHint = 'A menor medida com que a receita trabalha: g, ml, un.'` (`:560`) |
| `Quanto é "cheio"` | `fullLevel` (`:558`) | `numeric` | `50000` | `baseUnit` | `fullLevelHint = 'Só se você quiser a leitura por cor: vermelho, amarelo, verde, azul. Vazio, o item não ganha cor nem aviso de volume.'` (`:559`) |
| `Preço pago` | `price` (`:561`) | `numeric` | `118,00` | `R$` | `conversionHint ?? oQueFalta` (ver abaixo) |

**Corrigindo, o campo de preço não existe.** No lugar dele fica a frase
`priceNotAsked = 'O preço não é perguntado aqui. Ele vem das notas de compra, e
mexer nele por este caminho moveria o custo médio sem uma nota por trás.'`
(`src/i18n/locales/pt-BR.ts:562-563`, ramo em `app/inputs/new.tsx:447-449`).

#### 19.3.3 A dedução que a tela existe para ter

`setPurchaseUnit` (`app/inputs/new.tsx:180-183`):

```
const deduced = factorTyped ? null : packSize(next, baseUnit);
edit(deduced === null ? { purchaseUnit: next }
                      : { purchaseUnit: next, purchaseToBase: String(deduced) });
```

`factorTyped` vira `true` no primeiro toque humano em "Quanto vem dentro"
(`app/inputs/new.tsx:184-187`) — a dedução nunca sobrescreve o que a pessoa
digitou.

`packSize(packageName, baseUnit)` (`src/domain/measure.ts:35-53`), tabela de
escalas transcrita inteira (`src/domain/measure.ts:17-21`):

| Unidade-base | Palavras aceitas → fator |
|---|---|
| `g` | `g`/`grama`/`gramas` = 1; `kg`/`quilo`/`quilos`/`kilo`/`kilos` = 1000 |
| `ml` | `ml`/`mililitro`/`mililitros` = 1; `l`/`litro`/`litros`/`lt` = 1000 |
| `un` | `un`/`und`/`unidade`/`unidades`/`pc`/`peca`/`pecas` = 1 |

Regras de recusa, todas devolvendo `null`: unidade-base desconhecida (`:37`);
número de ocorrências de `número+palavra` diferente de exatamente 1 — "dois
números é ambíguo, não é esperteza" (`:40-41`); palavra fora da escala (`:44-45`);
valor não finito ou ≤ 0 (`:48`); total fracionário (`:53`). Acentos são removidos
e o texto vai para minúsculas antes (`src/domain/measure.ts:23-27`).

Exemplos verificados no navegador: `saco 25 kg` → 25000, e `balde` **não apaga** o
que já estava no campo (`e2e/flow.mjs:343-368`).

#### 19.3.4 A conta enquanto se digita

`parsed` (`app/inputs/new.tsx:196-203`):

```
factor = parseTyped(purchaseToBase) ?? NaN
paid   = parseTyped(price) ?? NaN
valid  = isFinite(factor) && factor > 0 && isFinite(paid) && paid > 0
unitRate = valid ? rate(paid, factor) : null
```

`conversionHint` só existe quando `valid` (`app/inputs/new.tsx:210-220`):
`fill(words.conversion, { paid: formatMoney(fromDecimal(paid)), factor:
factor.toLocaleString(formatting), perThousand: formatMoney(Math.round(unitRate *
1000)), rate: unitRate.toFixed(4), unit: baseUnit })`, sobre o texto
`conversion = '{{paid}} ÷ {{factor}} = {{perThousand}} a cada 1.000 {{unit}} ·
{{rate}} centavos por {{unit}}'` (`src/i18n/locales/pt-BR.ts:564-565`). O
`toFixed(4)` é a prova visível de que a taxa não foi arredondada.

`oQueFalta` — qual campo falta, não "os dois nomes de sempre"
(`app/inputs/new.tsx:261-266`):

| Estado | Texto |
|---|---|
| sem fator e sem preço | `fillFirst = 'Preencha quanto vem dentro e o preço para o app calcular o custo por unidade de uso.'` (`:574-575`) |
| tem fator, falta preço | `fillPrice = 'Falta o preço pago. Com ele o app calcula o custo por unidade de uso.'` (`:578`) |
| tem preço, falta fator | `fillInside = 'Falta quanto vem dentro da embalagem: é por ele que o preço se divide.'` (`:577`) |

#### 19.3.5 O cartão do custo e a conferência da conversão

Só aparece quando `mostraCusto = parsed.valid && !editing`
(`app/inputs/new.tsx:346`) — corrigindo não há conta nova para mostrar. `hue =
palette.sky` (`:472`). Conteúdo:

- Overline pelo tipo: `store_supply` → `costsInStore = 'CUSTA NA LOJA'`; os
  outros → `entersAs = 'ENTRA NA RECEITA COMO'`
  (`src/i18n/locales/pt-BR.ts:566-568`, ramo em `app/inputs/new.tsx:478-480`).
- Figura `formatMoney(Math.round((parsed.unitRate ?? 0) * 1000))` (`:481-483`).
- Legenda `fill(perThousandOf, { unit: baseUnit })` = `'a cada 1.000 {{unit}}'`
  (`:569`, uso `:484-486`).
- `Chip` da conferência (`app/inputs/new.tsx:237-251`, desenhado em `:488`):

| Situação | `signal` | Texto |
|---|---|---|
| `packSize(purchaseUnit, baseUnit)` devolve `null` (não há tamanho legível) | `ok` | `mathCloses = 'A conta fecha'` (`:572`) |
| lido e digitado diferem em menos de 0,5 | `ok` | `conversionOk = 'Conversão confere'` (`:570`) |
| divergem | `warning` | `fill(conversionDiffers, { pack, typed, unit })` = `'A embalagem diz {{pack}} {{unit}}, o campo diz {{typed}}. Confira.'` (`:573`) |

A divergência **não trava** o salvamento — decisão escrita no arquivo: o nome da
embalagem pode estar abreviado, e quem está com o saco na mão é quem sabe
(`app/inputs/new.tsx:233-235`).

#### 19.3.6 Salvar

`canSave = name.trim().length > 0 && (editing ? parsed.factor > 0 :
parsed.valid)` (`app/inputs/new.tsx:270`). O botão fica desabilitado até isso
(`:508`) — Lei 5. Rótulo: `saving ? 'Salvando…' : editing ? 'Salvar correção' :
'Salvar cadastro'` (`src/i18n/locales/pt-BR.ts:579-581`); ícone `GlyphSack` ao
corrigir, `GlyphPlus` ao cadastrar (`app/inputs/new.tsx:500-506`).

Confirmação (`app/inputs/new.tsx:278-288`), `cancelLabel = t.app.confirm.adjust =
'Ajustar'` (`src/i18n/locales/pt-BR.ts:61`):

| Modo | Título | Mensagem |
|---|---|---|
| novo | `confirmTitle = 'Confirma?'` | `confirmNew = 'Você vai cadastrar {{name}}, comprado em {{pack}} com {{factor}} {{unit}} por embalagem, custando {{price}}.'` |
| corrigindo | `saveEdit = 'Salvar correção'` | `confirmEdit = '{{name}} passa a ser comprado em {{pack}}, com {{factor}} {{unit}} por embalagem. O custo médio e o histórico de compras não mudam.'` |

(`src/i18n/locales/pt-BR.ts:582-586`.) `pack` cai para `t.units.unit.one`
(`'unidade'`) quando o campo está vazio (`app/inputs/new.tsx:282`).

A gravação, em duas etapas (`app/inputs/new.tsx:311-333`):

```
const itemId = await saveItem(LOCAL_COMPANY_ID, {
  id,                                    // undefined em cadastro novo
  kind,
  name: name.trim(),
  purchaseUnit: purchaseUnit.trim() || null,
  purchaseToBase: parsed.factor,
  baseUnit: baseUnit.trim() || 'un',
  packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
  fullLevel: (parseTyped(fullLevel) ?? 0) > 0 ? parseTyped(fullLevel) : null,
});
if (editing) return;                     // corrigir NUNCA lança nota
await recordPurchase(LOCAL_COMPANY_ID, {
  itemId,
  purchaseQuantity: 1,
  baseUnits: Math.round(parsed.factor),
  totalCents: fromDecimal(parsed.paid),
});
```

Consequências que precisam ficar escritas:

- **O preço digitado é a primeira nota**, não um campo de preço: entra pelo mesmo
  caminho de qualquer compra (comentário `app/inputs/new.tsx:306-310`), de exatamente
  **uma** embalagem. `recordPurchase` grava cinco linhas numa transação — `purchases`,
  `purchase_lines`, um `movements` de `kind = 'purchase'`, `item_costs` e
  `item_cost_history` — e enfileira três delas para o servidor (`purchases`,
  `purchase_lines`, `movements`), deixando `item_costs` fora de propósito, porque
  média derivada tem um autor só (`src/data/repository.ts:371-459`).
- `packaging` é sempre `[{ id: 'unit', perBaseUnit: 1 }]`: esta tela não
  cadastra hierarquia (quem faz isso é o produto).
- `fullLevel` é **sempre enviado** (número ou `null`), então apagar o campo e
  salvar apaga a régua de cor. O `saveItem` só preserva o valor anterior quando o
  campo vem `undefined` (`src/data/repository.ts:237-244`), o que esta tela nunca
  faz.
- `saveItem` faz `INSERT ... ON CONFLICT(id) DO UPDATE` sobre `items` e enfileira
  a linha (`src/data/repository.ts:246-274`).

Falha: diálogo de reconhecimento com `failedToSave = 'Não deu para salvar'`, a
mensagem do erro cru e `confirmLabel = t.app.confirm.understood = 'Entendi'`
(`app/inputs/new.tsx:296-301`, `src/i18n/locales/pt-BR.ts:587`, `:62`). Sucesso:
`router.back()` (`:294`).

#### 19.3.7 A Lei da Inteligência aqui

- **Normal:** o cartão de custo por mil unidades-base, que é o número que o item
  vai levar para toda receita.
- **Diferente agora:** a conferência da conversão (`conversionDiffers`) e a dica
  que muda a cada tecla.
- **Próxima ação:** o único botão primário da tela.
- Registro no teste da lei: `'app/inputs/new.tsx': { sozinho: 'formulário: o
  número é o custo que acabou de ser digitado, ainda não é história.' }`
  (`src/law.test.ts:101-103`).

---

### 19.4 `app/inputs/[id].tsx` — a ficha de um insumo

839 linhas, a maior das oito. Parâmetros: `{ id, sala }`
(`app/inputs/[id].tsx:112`). `sala` não é filtro de vitrine: decide **contra que
saldo a contagem é comparada e em que lugar a diferença é gravada**
(comentário `:104-111`).

#### 19.4.1 Consulta

Uma `useQuery` com chave `` `${id ?? ''}|${sala ?? ''}` ``
(`app/inputs/[id].tsx:129-150`). Ordem deliberada: `listPlaces` **primeiro**,
porque a sala da rota tem de ser conferida contra os lugares existentes — um id
que não existe mais gravaria movimento apontando para nada e travaria a fila de
sincronização (`:132-136`):

```
const places = await listPlaces(LOCAL_COMPANY_ID);
const room = sala && places.some(p => p.id === sala) ? sala : undefined;
const [item, history, recipes, movements, spread] = await Promise.all([
  findItem(LOCAL_COMPANY_ID, id, room),
  itemHistory(LOCAL_COMPANY_ID, id),
  recipesUsingItem(LOCAL_COMPANY_ID, id),
  itemMovements(LOCAL_COMPANY_ID, id, 20, room),
  balanceByLocation(LOCAL_COMPANY_ID, id),
]);
```

Saldo e movimentos vão pela sala; preço e receitas não têm sala — custo médio é
da empresa (`:140-141`). `findItem` inclui item inativo de propósito, para a tela
que reativa poder abri-lo (`src/data/repository.ts:3591-3594`).

#### 19.4.2 Estados de tela

Enquanto carrega, ou item inexistente: cartão `mint` com `GlyphSack`, dizendo
`opening = 'Abrindo…'` ou `gone = 'Esse item não está mais cadastrado.'`
(`app/inputs/[id].tsx:154-166`, `src/i18n/locales/pt-BR.ts:593-594`). Título de
espera é `t.app.inputForm.fallbackTitle` (`'Insumo'`).

Cabeçalho normal: `title = item.name`; `overline = item.active ? 'almoxarifado' :
'almoxarifado · fora de circulação'` (`app/inputs/[id].tsx:423-426`,
`src/i18n/locales/pt-BR.ts:591-592`).

#### 19.4.3 Os oito cartões, na ordem

**(0) Fora de circulação** — só quando `!item.active`. `hue = color.warning`
(âmbar, não vermelho: "nada está errado, só parado", comentário `:427-429`),
título `retiredTitle = 'Fora de circulação'`, corpo `retiredBody = 'Ele não
aparece mais quando você escolhe um item, e tudo o que já passou por ele continua
como estava.'` (`src/i18n/locales/pt-BR.ts:595-597`).

**(1) Custo** — `hue = palette.sky`, ícone `GlyphPrice`, título
`t.app.reports.rows.cost.label = 'Custo'` (`src/i18n/locales/pt-BR.ts:177`).
Overline `currentCost = 'CUSTO ATUAL'`; figura `formatMoney(perThousand)` com
`perThousand = Math.round(item.averageRate * 1_000)` (`:168`), ou `'—'` sem
preço; legenda `fill(averageOf, { unit })` = `'a cada 1.000 {{unit}} · média das
compras'` ou `noInvoiceYet = 'ainda sem nota lançada'`
(`src/i18n/locales/pt-BR.ts:598-600`, uso `:454-464`).

A comparação (Lei 3), a partir de `moves = history.filter(h => h.previousRate !==
null)` e `latestChange = (latest.newRate - latest.previousRate) /
latest.previousRate` (`:170-177`):

| Condição | O que aparece |
|---|---|
| `latestChange !== null && Math.abs(latestChange) >= 0.001` | `Chip` com `signal = priceSignal(judgePriceChange(latestChange))` e texto `wentUp = 'Subiu {{percent}} na última compra'` ou `wentDown = 'Caiu {{percent}} na última compra'` (`:601-602`), com `formatPercent(Math.abs(...))` |
| `moves.length === 0 && averageRate > 0` | `historyEmpty = 'Só houve uma compra até agora, então ainda não há o que comparar.'` (`:661`) |

Os cortes do juízo: `PRICE_ALARM = 0.05` e `PRICE_RELIEF = -0.02`
(`src/domain/cost.ts:233-234`); `judgePriceChange` devolve `'wellAbove'` acima de
5%, `'cheaper'` abaixo de −2%, `'smallChange'` no meio (`:236-240`), e
`priceSignal` mapeia para `warning` / `ok` / `neutral`
(`src/components/Chip.tsx:65-69`). A assimetria é declarada: alarme falso ensina a
ignorar alarme (`src/domain/cost.ts:219-232`).

**(2) Como você compra** — `hue = palette.mint`, ícone `GlyphSack`, título
`howYouBuy` (`src/i18n/locales/pt-BR.ts:603`). Três `ListRow` sem `onPress`
(`app/inputs/[id].tsx:487-513`):

| Rótulo | `trailing` |
|---|---|
| `Embalagem` (`pack`, `:604`) | `item.purchaseUnit ?? '—'` |
| `Quanto vem dentro` (`perPack`, `:605`) | `` `${formatQuantity(purchaseToBase)} ${baseUnit}` `` ou `'—'` |
| `fill(pricePer, { pack })` = `'Preço por {{pack}}'` (`:606`) | `formatMoney(Math.round(averageRate * purchaseToBase))` ou `'—'` |

**(3) Conferir o estoque** — `hue = palette.mint`, ícone `GlyphCount`, título
`countTitle = 'Conferir o estoque'` (`:620`). A linha de saldo
(`app/inputs/[id].tsx:525-531`):

- `label` = `inStock = 'Em estoque'` (`:607`);
- `trailing` = `` `${formatQuantity(item.onHandBaseUnits)} ${item.baseUnit}` ``,
  **ou `'—'` enquanto a contagem está aberta**;
- `detail` = `countHidden = 'escondido enquanto você conta'` durante a contagem;
  fora dela, `lastCounted` (`fill('conferido em {{date}}', { date:
  formatDayMonth(lastCount.occurredAt) })`, com `lastCount` = primeiro movimento
  de `kind === 'adjustment'`, `:215-218`), e na falta dele `heldWorth`
  (`fill('{{amount}} parados aqui', { amount: formatMoney(held) })`, com
  `held = Math.round(averageRate * onHandBaseUnits)`, `:169`, `:219-220`).

Com sala na rota, uma frase diz de que sala é o número: `fill(countRoom, { room:
nomeSala(salaAberta) })` = `'Este é o saldo da {{room}}. A contagem é dessa
sala.'` (`:647`, uso `:534-538`).

Três estados de contagem (`app/inputs/[id].tsx:548-598`):

1. **Aberta** (`counting`): a frase `countHint = 'Conte o que está na prateleira
   e escreva aqui. O número que o sistema espera fica escondido até você terminar
   — se ele estiver na tela, a conferência vira cópia.'` (`:621-622`), o `Field`
   `countLabel = 'Quanto tem de verdade'` (`numeric`, sufixo `baseUnit`,
   `autoFocus`), o botão `countConfirm = 'Registrar a contagem'` e o fantasma
   `countCancel = 'Deixar para depois'` (`:623-626`). A frase mora **dentro** do
   ramo porque fora dele ela afirmava duas coisas falsas (comentário `:539-547`).
2. **`contarEm === null`**: item em mais de um lugar e nenhum escolhido — a
   contagem **não é oferecida**. Texto `fill(countSpread, { count })` = `'Este
   item está em {{count}} lugares. Conta-se um lugar por vez — toque no lugar para
   conferir ali.'` (`:649-650`), e uma `ListRow` por lugar (nome, saldo, e
   `onPress` para `/inputs/<id>?sala=<locationId>`, `:581-588`).
3. **Fechada com sala definida**: botão fantasma `countStart = 'Conferir
   estoque'` (`:624`).

`contarEm` é a dedução central (`app/inputs/[id].tsx:209-213`):

```
contarEm = salaAberta ?? (spread.length > 1 ? null
                          : spread[0]?.locationId ?? defaultLocationId(LOCAL_COMPANY_ID))
```

`spread` é `balanceByLocation` filtrado por `baseUnits !== 0`, porque um lugar por
onde o item passou e de onde saiu inteiro não tem saldo, tem histórico
(`:180-187`); `defaultLocationId(companyId) === companyId`
(`src/data/repository.ts:843-845`).

`submitCount` (`app/inputs/[id].tsx:274-314`):

- recusa em silêncio `counted` não finito ou negativo (`:275-276`) e recusa sem
  sala (`:277-279`, rede para o botão que já não aparece);
- calcula, **para a frase**, `expected = item.onHandBaseUnits`, `delta =
  Math.round(counted) - expected`, `worth = |Math.round(averageRate * delta)|`;
- confirma com uma de três mensagens (`:292-303`):

| `delta` | Chave | Texto |
|---|---|---|
| `0` | `countConfirmExact` | `'Você contou {{counted}}, exatamente o que o sistema esperava. Fica registrado que você conferiu.'` |
| `< 0` | `countConfirmShort` | `'Você contou {{counted}}. O sistema esperava {{expected}}. Estão faltando {{diff}}, que valem {{money}}. A diferença fica registrada e nada é apagado.'` |
| `> 0` | `countConfirmOver` | idem com `'Estão sobrando {{diff}}'` |

  (`src/i18n/locales/pt-BR.ts:651-657`), título `countConfirmTitle = 'Registrar a
  contagem?'` e `confirmLabel = countConfirmAction = 'Registrar'`;
- grava `recordCount(LOCAL_COMPANY_ID, { locationId: contarEm, itemId,
  countedBaseUnits: Math.round(counted) })` (`:306-310`), fecha a contagem, limpa
  o campo e chama `refresh()`.

**Fato importante para quem reconstrói:** a diferença gravada é recalculada
**dentro** de `recordCount` — ele soma `movements` daquele item **naquele local**
e escreve `delta = counted - expected` como um movimento de `kind =
'adjustment'`, com `movement_group_id` igual ao próprio id da linha para poder ser
desfeito depois (`src/data/repository.ts:923-968`). O `locationId` é obrigatório e
sem padrão, de propósito (`src/data/repository.ts:906-917`). Os números da tela
servem à frase; a escrita tem a sua própria fonte.

**(4) Perdeu alguma coisa?** — `hue = color.danger`, ícone `GlyphLoss`, título
`lossTitle = 'Perdeu alguma coisa?'`, subtítulo `lossHint = 'Registre com o
motivo. É o motivo que faz o relatório servir para decidir.'`
(`src/i18n/locales/pt-BR.ts:609-610`).

Fechado: botão fantasma `lossStart = 'Registrar perda'` (`:611`). Aberto
(`app/inputs/[id].tsx:620-671`): `Field` `lossAmount = 'Quanto se perdeu'`
(`numeric`, sufixo `baseUnit`, `autoFocus`), overline `lossWhy.toUpperCase()` =
`'O QUE ACONTECEU'` (`:613`), os cinco motivos como `Pressable` com
`accessibilityRole="radio"` (`:641`), o botão `weighty` `lossConfirm = 'Registrar
a perda'` e o fantasma `lossCancel = 'Deixa para lá'` (`:614-615`).

Os cinco motivos, na ordem em que a fábrica os usa — `REASONS: LossReason[] =
['expired', 'melted', 'broken', 'courtesy', 'internal_use']`
(`app/inputs/[id].tsx:839`), padrão `'expired'` (`:127`):

| Valor no banco | Palavra (`src/i18n/locales/pt-BR.ts:1102-1108`) |
|---|---|
| `expired` | `Venceu` |
| `melted` | `Derreteu` |
| `broken` | `Quebrou` |
| `courtesy` | `Cortesia` |
| `internal_use` | `Consumo interno` |

O escolhido muda **cor e peso** (`color.danger` + `'600'`,
`app/inputs/[id].tsx:650-651`), porque cor sozinha não informa.

`submitLoss` (`app/inputs/[id].tsx:238-272`): recusa em silêncio valor não finito
ou ≤ 0; calcula `worth = Math.round(averageRate * lost)`; confirma com
`lossAsk = 'Registrar esta perda?'` e `lossBody = 'Você vai baixar {{amount}} de
{{item}}: {{reason}}. Vale {{money}}, e fica no histórico.'`
(`src/i18n/locales/pt-BR.ts:616-617`) — o motivo entra em minúsculas
(`t.loss[reason].toLocaleLowerCase(locale.formatting)`, `:248`). Grava
`recordLoss(LOCAL_COMPANY_ID, { itemId, baseUnits: Math.round(lost), reason })`
(`:256-260`), limpa e atualiza. Falha: diálogo `lossFailed = 'Não deu para
registrar a perda'` (`:619`).

**Fato a registrar sem rodeio:** esta chamada **não passa `locationId`**. O
`recordLoss` então usa `ensureLocation` — o lugar padrão da empresa — tanto para
checar saldo quanto para gravar o movimento (`src/data/repository.ts:2109-2116`).
Numa fábrica com mais de uma sala, uma perda vista na câmara é escrita no lugar
padrão. `recordLoss` recusa perda maior que o saldo daquele local lançando
`NotEnoughStockError` (`src/data/repository.ts:2119-2124`,
`:1302`), e recusa quantidade não positiva com `'uma perda de nada não é uma
perda'` (`:2104`).

**(5) Histórico de preço** — só quando `moves.length > 0`
(`app/inputs/[id].tsx:688`). `hue = palette.sky`, ícone `GlyphChart`, título
`history = 'Histórico de preço'`, subtítulo `historyHint = 'Ninguém escreveu
isto. Cada linha nasceu de uma nota lançada.'`
(`src/i18n/locales/pt-BR.ts:659-660`). Com mais de um ponto, um `Sparkline` com
os valores em ordem cronológica (`[...history].reverse().map(h => h.newRate)`,
`:701-705`). Depois, uma `ListRow` por movimento de preço: `label =
formatDayMonth(observedAt)`; `detail` = `` `${formatMoney(previous*1000)} →
${formatMoney(newRate*1000)}` ``; `trailing` = `` `${change > 0 ? '▲' : '▼'}
${formatPercent(|change|)}` ``, com tom `warning` na alta e `ok` na baixa
(`:710-725`). A seta carrega a direção porque cor não pode ser o único sinal.

`itemHistory` lê `item_cost_history` (limite padrão 24) ordenado por
`observed_at DESC` (`src/data/repository.ts:3527-3551`); as linhas são escritas
por `recordPurchase` de passagem (`src/data/repository.ts:435-439`).

**(6) Quem usa isto** — só quando há receitas (`app/inputs/[id].tsx:734`). `hue =
palette.apricot`, ícone `GlyphRecipe`, título `usedBy = 'Quem usa isto'`. Frase:
`usedByOne = 'Uma receita depende deste item.'` ou `fill(usedByMany, { count })` =
`'{{count}} receitas dependem deste item — um aumento aqui move todas elas.'`
(`src/i18n/locales/pt-BR.ts:662-664`). Uma `ListRow` por receita com a quantidade
na unidade-base do item e `onPress` para `/recipes/<id>` (`:747-754`). A consulta
`recipesUsingItem` casa apenas a **versão mais nova** de cada receita
(`src/data/repository.ts:3564-3574`).

**(7) Últimos lançamentos** — só quando `!counting` e há movimentos
(`app/inputs/[id].tsx:773`). A cegueira da contagem é da **tela**, não de um
cartão: a linha "+50.000 g" de uma compra recente é o número esperado escrito de
outro jeito (comentário `:760-772`). `hue = palette.mint`, ícone `GlyphCount`,
título `entries = 'Últimos lançamentos'`, subtítulo `entriesHint = 'Toque num
lançamento para desfazer. Nada é apagado: a correção entra como linha nova, e as
duas ficam.'` (`src/i18n/locales/pt-BR.ts:630-631`). Mostra `slice(0, 8)` dos 20
carregados (`:784`).

Cada linha (`app/inputs/[id].tsx:784-804`): `label = t.movement[kind] ?? kind`;
`detail = formatDayMonth(occurredAt)`, mais `' · já corrigido'` quando
`move.reversed` (`undone`, `:632`); `trailing` = `` `${baseUnits > 0 ? '+' :
'−'}${formatQuantity(|baseUnits|)} ${baseUnit}` ``; `trailingTone` = `muted` se
estornado, `ok` se entrada, `ink` se saída; `onPress` só quando `podeDesfazer =
groupId !== null && !reversed && !desfazendo`.

O dicionário de `movement` (`src/i18n/locales/pt-BR.ts:1118-1129`): `purchase =
Compra`, `production = Produção`, `consumption = Consumo`, `transfer =
Transferência`, `sale = Venda`, `loss = Perda`, `return = Devolução`,
`adjustment = Contagem`, `discrepancy = Diferença na conferência`, `reversal =
Correção`.

**Desfazer** (`app/inputs/[id].tsx:326-405`) — o caminho de estorno pela tela do
item:

1. Sai fora sem `groupId` ou já desfazendo (`:327`).
2. `planReversal(LOCAL_COMPANY_ID, move.groupId)`; se lançar, **retorna calado** —
   grupo inexistente é linha antiga, não erro da pessoa (`:330-336`).
3. `plano.alreadyReversed` → aviso `undoDone = 'Este lançamento já foi
   corrigido'` / `undoDoneBody = 'A correção dele já está no registro. Não se
   corrige duas vezes.'` (`src/i18n/locales/pt-BR.ts:639-640`).
4. `plano.blocked.length > 0` → aviso `undoBlocked = 'Falta o que devolver'` e
   `undoBlockedBody = 'Desfazer isto tiraria do estoque mais do que tem:
   {{items}}. Traga a mercadoria de volta primeiro, ou registre a contagem do que
   existe.'`, com cada item escrito por `undoBlockedLine = '{{name}} precisa de
   {{needed}} e tem {{held}}'` unidos por `' · '`
   (`src/i18n/locales/pt-BR.ts:641-644`, montagem em `:356-374`).
5. Caso normal: confirmação **destrutiva** (diálogo centrado) com título
   `fill(undoTitle, { what: t.movement[kind] ?? kind })` = `'Desfazer esta
   {{what}}?'` e corpo `undoBody = 'Volta para o estoque: {{back}}. Sai do
   estoque: {{out}}. Fica registrado que houve correção, e nada é apagado.'`; as
   pernas positivas viram `{{back}}` e as negativas `{{out}}`, cada uma escrita
   como `t.common.amountOf = '{{amount}} de {{name}}'`, e a ausência vira
   `undoNothingBack`/`undoNothingOut` = `'nada'`
   (`src/i18n/locales/pt-BR.ts:633-638`, `:15`; montagem em `:338-388`).
6. Confirmado, `reverseGroup(LOCAL_COMPANY_ID, { groupId })` e `refresh()`; falha
   vira aviso `undoFailed = 'Não deu para desfazer'` (`:645`).

`planReversal` devolve `{ groupId, legs, blocked, alreadyReversed }` sem escrever
nada: as pernas são o **contrário** de cada movimento do grupo (`baseUnits =
-quantity_base_units`), e `blocked` lista o que deixaria saldo negativo naquele
local (`src/data/repository.ts:4245-4314`). A separação existe por tom de voz: a
confirmação precisa da conta antes do ato, e a checagem roda de novo dentro da
transação de `reverseGroup` (`src/data/repository.ts:4236-4243`).

**(8) Ações** (`app/inputs/[id].tsx:814-833`), nesta ordem:

| Botão | Variante | Destino |
|---|---|---|
| `recordPurchase = 'Lançar uma compra deste item'` (`:665`), ícone `GlyphPurchase` | primário `weighty` | `/purchase?itemId=<id>` |
| `correct = 'Corrigir o cadastro'` (`:666`) | fantasma | `/inputs/new?id=<id>` |
| `retire = 'Tirar de circulação'` / `bringBack = 'Voltar a usar'` (`:667-668`) | fantasma | `toggleActive()` |

`toggleActive` (`app/inputs/[id].tsx:407-420`) confirma com
`retireTitle = 'Tirar de circulação?'` / `retireBody = '{{name}} some das listas
de escolha, mas continua no histórico: as compras já lançadas e as receitas que o
usam ficam intactas. Dá para voltar atrás quando quiser.'` / `retireConfirm =
'Tirar'`, `destructive: true`; ou `bringBackTitle = 'Voltar a usar?'` /
`bringBackBody = '{{name}} volta a aparecer nas listas de escolha.'`, não
destrutivo (`src/i18n/locales/pt-BR.ts:669-674`). Grava
`setItemActive(company, id, !item.active)`, que só troca `items.active` e
enfileira a linha (`src/data/repository.ts:3608-3622`).

#### 19.4.4 A Lei da Inteligência aqui

- **Normal:** o custo atual por mil unidades-base, com a média das compras
  declarada, e o saldo com a data da última conferência.
- **Diferente agora:** o `Chip` de alta/baixa da última compra, o histórico
  desenhado, a lista de lançamentos, e o aviso de item fora de circulação.
- **Próxima ação:** lançar uma compra (único botão colorido); corrigir e retirar
  ficam fantasmas de propósito — "ninguém deve ser convidado a desfazer"
  (comentário `:810-813`).
- Registro no teste da lei: `'app/inputs/[id].tsx': { compara: /wentUp|wentDown/
  }` (`src/law.test.ts:89`).

#### 19.4.5 Onde deduz em vez de perguntar

Sala da contagem deduzida quando há um lugar só (`:209-213`); número esperado
escondido, e a tela inteira cega durante a contagem (`:528-530`, `:773`); a data
da última conferência sai dos movimentos (`:215-218`); o plano de estorno vem do
razão e não da tela (`:331`); linha sem `groupId` não oferece desfazer (`:785`).

---

### 19.5 `app/products/index.tsx` — Produtos (o que sai para vender)

208 linhas. Título `Produtos`, overline `'o que sai para vender'`
(`src/i18n/locales/pt-BR.ts:942-943`).

#### 19.5.1 Consulta e conta de cada linha

Quatro leituras em paralelo (`app/products/index.tsx:74-80`): `listProducts`,
`loadRecipeGraph`, `itemCosts`, `labels`. Depois, uma `Row` por produto
(`app/products/index.tsx:82-113`):

**Revenda ou produto sem rendimento** (`!product.recipeId ||
!product.yieldPerUnit`): `unitCents = null`, `recipeId = null`, `detail =
t.app.products.resale = 'Revenda — o custo vem da nota de compra.'`
(`src/i18n/locales/pt-BR.ts:947`).

**Fabricado**:

```
cost   = costRecipe(product.recipeId, graph, costs, names)
units  = unitsPerBatch(cost, product.yieldPerUnit)
packed = formatPacked(units, product.packaging, t.units, locale, t.common.and)
unitCents = costPerProductUnit(cost, product.yieldPerUnit, {
  cents: product.unitPackagingCents,
  itemsRate: packagingRatePerUnit(product.packagingItems, costs),
})
detail = fill(t.app.products.batchYields, { units: formatQuantity(units), packed })
```

`batchYields = 'Cada vez rende {{units}} — {{packed}}'`
(`src/i18n/locales/pt-BR.ts:948`). As fórmulas por extenso:

- `costRecipe` soma `taxa × quantidade` de cada linha **sem arredondar**, e
  arredonda o lote uma vez (`batch = cents(Math.round(batchExact))`); as linhas
  exibidas são `allocateByWeight(batch, exatos)`, para o detalhamento fechar com a
  figura; `netYield = yieldAmount * (1 - lossFraction)`; `perYieldUnit =
  rateFromCents(batch, netYield)` (`src/domain/recipe.ts:147-196`).
- `unitsPerBatch = Math.floor(netYield / yieldPerUnit)`, 0 se `yieldPerUnit <= 0`
  (`src/domain/recipe.ts:248-251`).
- `costPerProductUnit = cents(perYieldUnit * yieldPerUnit + itemsRate + cents)`
  — um arredondamento, no fim (`src/domain/recipe.ts:235-245`).
- `packagingRatePerUnit = Σ (taxa[itemId] ?? 0) * quantityPerUnit`, **nunca
  arredondado** (`src/domain/recipe.ts:210-217`).
- `formatPacked` quebra a quantidade pela hierarquia, do maior para o menor,
  descartando níveis zerados, e junta com `e` (`src/i18n/index.ts:146-160`,
  `src/domain/units.ts:46-58`). Exemplo verificado no navegador: `'1 engradado, 4
  caixas e 6 unidades'` (`e2e/flow.mjs:223-230`).

#### 19.5.2 Estados e composição

| Estado | O que aparece |
|---|---|
| `loading` | cartão simples com `opening = 'Abrindo…'` (`src/i18n/locales/pt-BR.ts:944`; `app/products/index.tsx:128-134`) |
| lista vazia | cartão `apricot` com `GlyphProduction`, título `Produtos`, corpo `empty = 'Nenhum produto ainda. Um produto fabricado precisa de uma receita e de quanto vai em cada unidade.'` (`:945-946`; `app/products/index.tsx:139-149`) |
| com produtos | cartão `apricot` com `GlyphProduction` e título `plural(rows.length, t.app.settings.counted.products)` — `{ one: '1 produto', other: '{{n}} produtos' }` (`:402`; `app/products/index.tsx:158-179`) |

A linha: `label = nome`, `detail` como acima, `trailing = unitCents === null ?
'—' : formatMoney(unitCents)`, `trailingTone = 'muted'` na revenda, `onPress` só
quando há receita — e ele abre `/recipes/<recipeId>`
(`app/products/index.tsx:165-176`).

Sem número grande nesta tela, e é declarado: promover um custo a figura repetiria
a estante de receitas, e figura sem comparação é o que a Lei 3 proíbe
(`app/products/index.tsx:47-50`). Por isso ela **não** aparece em
`src/law.test.ts`.

Ações: botão primário `weighty` `addNew = 'Cadastrar novo'` (`:949`) para
`/products/new` (`app/products/index.tsx:181-183`); e a **porta da grade**, um
`Touchable` sobre um `Card` `apricot` com `GlyphCatalog`, título
`t.app.catalog.title = 'Linhas, tipos e sabores'`, corpo `t.app.catalog.overline =
'a grade do que você fabrica'` em duas linhas e o convite `t.app.home.openScreen
= 'Abrir a tela'` com `IconChevron` (`app/products/index.tsx:118-124`,
`:192-205`, `src/i18n/locales/pt-BR.ts:954-955`, `:138`).

#### 19.5.3 A Lei da Inteligência aqui

- **Normal:** a coluna de custos por unidade e quantas unidades cada vez rende,
  ditas na embalagem do operador.
- **O que está diferente agora:** **não respondido** — a tela não traz variação,
  data nem alerta. É a lacuna a registrar nesta subseção.
- **Próxima ação:** `Cadastrar novo`, e a grade abaixo para quem começa do zero.

---

### 19.6 `app/products/new.tsx` — Novo produto

822 linhas. Título `productForm.title = 'Novo produto'`, overline `'cadastro'`
(`src/i18n/locales/pt-BR.ts:984-985`). **Só cadastra**: `saveProduct` é chamado
sem `id` e sem `itemId` (`app/products/new.tsx:331-344`), então o caminho de
atualização de `saveProduct` (`ON CONFLICT(id) DO UPDATE`,
`src/data/repository.ts:1999-2007`) não tem chamador de tela.

#### 19.6.1 Consulta

Nove leituras em paralelo (`app/products/new.tsx:127-142`): `listRecipes`,
`loadRecipeGraph`, `itemCosts`, `labels`, `listLines`, `listTypes`,
`listFlavors`, `listItems`, `listProducts`. As embalagens oferecidas são
`items.filter(i => i.kind === 'packaging')` (`:140`).

#### 19.6.2 Estado inicial — nenhum campo nasce vazio

| Estado | Padrão | Linha |
|---|---|---|
| `kind` | `'product'` | `:144` |
| `name` / `nameTyped` | `''` / `false` | `:145-146` |
| `lineId`, `typeId`, `flavorId` | `null` | `:147-149` |
| `recipeId` | `null` (e `chosenRecipe` cai na primeira receita) | `:150`, `:170` |
| `perUnit` | `'75'` | `:151` |
| `packagingCost` | `'0,05'` | `:152` |
| `wrappings` | `[]` | `:160` |
| `perBox` | `'50'` | `:161` |
| `perCrate` | `'6'` | `:162` |
| `shelfLife` | `''` | `:163` |
| `fullLevel` | `''` | `:165` |

#### 19.6.3 Os campos

**Cartão da grade** (`hue = apricot`, ícone `GlyphCatalog`, título `Linhas, tipos
e sabores`) — só quando existe alguma linha (`temGrade`,
`app/products/new.tsx:372`, `:403`). Três grupos de `Chip` tocáveis:

- **Linhas**: overline `t.app.catalog.lines.toUpperCase()`; tocar de novo
  desmarca, e **trocar de linha zera o tipo** (`setTypeId(null)`,
  `app/products/new.tsx:423-426`).
- **Tipos da linha**: overline `fill(t.app.catalog.types, { line }).toUpperCase()`
  = `'TIPOS DE {{line}}'`; **só aparece quando há mais de um tipo**
  (`tiposDaLinha.length > 1`, `:435`) — "mostrar um tipo único como escolha é
  pedir o que já se sabe" (`:398-399`).
- **Sabores**: só quando existe algum (`:455`).

**Cartão do produto** (`hue = apricot`, ícone `GlyphPlus`, título `made =
'Fabricado'` ou `resale = 'Revenda'`, `:486`):

| Rótulo | Tipo | Valor | Observação |
|---|---|---|---|
| `Nome` (`:986`) | texto, placeholder `'Picolé de morango'` (`:987`) | **`composed`**, não `name` | digitar marca `nameTyped = true` (`:492-495`) |
| `DE ONDE ELE VEM` (`whereFrom`, `:988`) | dois `Chip` | `Fabricado` / `Revenda` | legenda muda: `madeHint = 'O custo vem da receita e se atualiza sozinho quando um insumo muda de preço.'`, `resaleHint = 'O custo vem da nota de compra, pelo custo médio dos fornecedores.'` (`:991-992`) |

O nome composto (`app/products/new.tsx:260-273`), com a **mesma** precedência da
tela do catálogo:

```
if (nameTyped && name.trim()) return name;   // quem digitou manda
if (!linha) return name;
tipo && sabor  → t.app.catalog.composed        = '{{line}} {{type}} de {{flavor}}'
sabor          → t.app.catalog.composedNoType  = '{{line}} de {{flavor}}'
tipo           → t.app.catalog.composedNoFlavor= '{{line}} {{type}}'
nenhum         → linha.name
```

(`src/i18n/locales/pt-BR.ts:976-978`.)

**Cartão da receita** — só se `feito` (`:533`). `hue = apricot`, ícone
`GlyphProduction`, título `whichRecipe = 'Feito com qual receita'` (`:993`). Um
`Chip` por receita, aceso o `chosenRecipe` (`:546-560`); enquanto carrega,
`loading = 'Carregando…'` (`:994`); sem receita nenhuma, `noRecipes = 'Nenhuma
receita cadastrada ainda — cadastre a ficha técnica antes.'` (`:995`) — estado
vazio com a saída na própria frase, porque não há tela de cadastro de receita
para onde mandar (comentário `app/products/new.tsx:562-564`). Abaixo, o campo
`perUnit = 'Quanto vai em cada unidade'` (`:996`), `numeric`, sufixo `ml`, dica
`fill(perUnitHint, { units })` = `'Cada vez rende {{units}} unidades.'` (`:997`)
quando a conta existe.

**Cartão da embalagem por unidade** — só se `feito` (`:594`). `hue = mint`
(verde de insumo), ícone `GlyphPackaging`, título `packagingCost = 'Palito,
embalagem e rótulo'` (`:998`). Duas metades reais:

1. Campo `packagingCost`, `numeric`, sufixo `R$ / un`, dica `packagingHint =
   'Embalagem custa por unidade, não por receita — diluir no lote esconde a
   margem.'` (`:999`).
2. Lista do que sai do estoque — só quando existe embalagem cadastrada (`:614`).
   Frase `fromStock = 'O que sai do estoque por unidade'` (`:1000`) em caixa
   normal de propósito (comentário `:616-619`); um `Chip` por embalagem, e tocar
   inclui a linha com `quantityPerUnit: '1'` ou remove (`:630-636`); depois, um
   `Field` por embalagem escolhida com rótulo `fill(perUnitOf, { item })` =
   `'Quanto de {{item}} por unidade'` (`:1002`), `numeric`, sufixo `item.baseUnit`
   (`:647-664`). Quando a conta existe e é positiva, a frase `fill(fromStockCost,
   { amount })` = `'a embalagem listada custa {{amount}} por unidade, pelas notas
   de compra'` (`:1001`, uso `:666-672`).

Regra de linha válida: `chosenWrappings` descarta linha sem número positivo — "quem
acabou de tocar em 'palito' e não digitou a quantidade não quer consumir zero
palito" (`app/products/new.tsx:203-217`).

**Cartão de como ele é empacotado** — sempre (`:688`). `hue = lilac` (transporte),
ícone `GlyphBox`, título `howPacked = 'Como ele é empacotado'`, subtítulo
`howPackedHint = 'O estoque conta sempre em unidade; as telas falam na sua
embalagem.'` (`:1003-1004`):

| Rótulo | Chave | Teclado | Sufixo | Dica |
|---|---|---|---|---|
| `Unidades por caixa` | `perBox` (`:1005`) | `numeric` | — | — |
| `Caixas por engradado` | `perCrate` (`:1012`) | `numeric` | — | `packagingEcho` |
| `Validade, em dias` | `shelfLife` (`:1006`) | `numeric` | — | `shelfLifeHint = 'Quantos dias o produto dura depois de feito. Deixe vazio se não vence — o lote continua existindo.'` (`:1007-1008`) |
| `Quanto é "cheio"` | `t.app.inputForm.fullLevel` (`:558`) | `numeric` | `un` | `t.app.inputForm.fullLevelHint` (`:559`) |

A hierarquia é montada dos dois primeiros (`app/products/new.tsx:172-181`):

```
tiers = [{ id: 'unit', perBaseUnit: 1 }]
if (box   > 1)                    tiers.push({ id: 'box',   perBaseUnit: box })
if (crate > 1 && tiers.length > 1) tiers.push({ id: 'crate', perBaseUnit: box * crate })
```

`packagingEcho` (`app/products/new.tsx:187-201`): sem nível acima de 1, `looseOnly
= 'Só unidade solta, sem caixa nem engradado.'` (`:1013`); com níveis, um do maior
expresso em cada nível abaixo, unido por `' = '` — "1 engradado = 6 caixas = 300
unidades".

**Cartão do custo** — só quando `costing` existe (`:744`). `hue = sky`, ícone
`GlyphPrice`. Overline `unitCost = 'CUSTO POR UNIDADE'` (`:1014`); figura
`formatMoney(costing.unit)`; legenda que **fecha a conta**:

| Condição | Texto (`src/i18n/locales/pt-BR.ts:1015-1016`) |
|---|---|
| `itemsRate > 0` | `mixPlusBoth = '{{mix}} de massa + {{stock}} de embalagem do estoque + {{packaging}} digitado'` |
| senão | `mixPlusPackaging = '{{mix}} de massa + {{packaging}} de embalagem'` |

`mix` é `costing.mixOnly = costPerProductUnit(cost, portion)` sem embalagem
(`app/products/new.tsx:241`). O `e2e` soma os três números da tela e exige que dêem
o total anunciado (`e2e/flow.mjs:1038-1136`, trecho da asserção da conta).
`Chip` neutro `fill(fullBox, { amount: costing.unit * caixa.perBaseUnit })` =
`'Caixa fechada: {{amount}}'` (`:1017`) — **só quando existe a faixa `box`**
(`app/products/new.tsx:771`), porque com `?? 1` o selo mostrava o custo de uma
unidade batizado de caixa fechada (comentário `:765-770`).

`costing` inteiro (`app/products/new.tsx:219-243`): nulo em revenda, sem dados ou
com `perUnit` não positivo; senão devolve `{ cost, unit, units, packagingCents,
itemsRate, mixOnly }`.

#### 19.6.4 Trava da classificação, e salvar

`ocupada` é lido da lista de produtos **antes de qualquer gesto**
(`app/products/new.tsx:283-288`): mesmo `lineId`, `typeId` e `flavorId`, com
nulo comparado como `''`. Quando existe, um cartão `tone="warning"` com
`GlyphCatalog` **antes** do botão diz `fill(gridTaken, { name: ocupada.name })` =
`'Já existe {{name}} com essa classificação. Dê linha, tipo ou sabor a um dos dois
— o catálogo fica em Ajustes.'` (`src/i18n/locales/pt-BR.ts:1024`, uso `:791-802`).

**Fato:** a frase manda o dono a Ajustes, e não há rota para `/catalog` em
`app/settings.tsx` nem em `app/(tabs)/more.tsx` — o único caminho é o cartão da
lista de produtos (`app/products/index.tsx:193`).

`canSave = composed.trim().length > 0 && ocupada === undefined && (kind ===
'resale' || (chosenRecipe !== null && num(perUnit) > 0))`
(`app/products/new.tsx:296-299`). O comentário registra por que a checagem é do
nome **composto**: olhando `name`, um produto classificado só pela grade mostrava
o nome no campo e deixava o botão morto (`:290-295`).

Confirmação (`app/products/new.tsx:304-326`): título `confirmTitle = 'Cadastrar
este produto?'`, `confirmLabel = confirmAction = 'Cadastrar'`, `cancelLabel =
'Ajustar'`; mensagem `confirmMade = '{{name}}, feito da receita {{recipe}},
{{perUnit}} ml por unidade. {{packaging}}'` ou `confirmResale = '{{name}}, produto
de revenda. {{packaging}}'` (`src/i18n/locales/pt-BR.ts:1020-1023`), onde
`packaging` é o `packagingEcho`.

Gravação (`app/products/new.tsx:331-344`):

```
saveProduct(LOCAL_COMPANY_ID, {
  name: composed.trim(), lineId, typeId, flavorId, kind,
  recipeId:      kind === 'product' ? chosenRecipe : null,
  yieldPerUnit:  kind === 'product' ? num(perUnit) : null,
  unitPackagingCents: fromDecimal(num(packagingCost) || 0),
  packagingItems: chosenWrappings,
  shelfLifeDays: num(shelfLife) || null,
  fullLevel: num(fullLevel) > 0 ? num(fullLevel) : null,
  packaging: hierarchy,
})
```

O que `saveProduct` faz com isso (`src/data/repository.ts:1894-2027`): checa
`assertTypeBelongsToLine` antes de abrir transação (lançando
`TypeIsFromAnotherLineError`, `:3743-3763`); normaliza a lista de embalagem
(`normalizePackagingItems` soma item repetido e recusa quantidade ≤ 0,
`:91-103`); relê a colisão de grade e lança `GridTakenError(nomeDoOutro)`
(`:1961-1977`); dentro da transação, grava o **item** por `writeItem` com
`baseUnit: 'un'`, `purchaseUnit: null`, `purchaseToBase: null` e o `fullLevel`
recebido (`:1980-1991`), e depois a linha de `products` com `active = 1`.

Falha (`app/products/new.tsx:346-359`): diálogo `failed = 'Não deu para
cadastrar'` (`:1025`), com `fill(gridTaken, { name: e.existing })` quando o erro é
`GridTakenError`, e a mensagem crua nos outros casos. Sucesso: `router.back()`.

Índices que estão por trás da recusa: no aparelho, `CREATE UNIQUE INDEX
products_grid_idx ON products (company_id, coalesce(line_id, ''),
coalesce(type_id, ''), coalesce(flavor_id, '')) WHERE active = 1`
(`src/data/db.ts:442-444`); no servidor, o mesmo com `nulls not distinct`, mais a
chave composta `product_type_belongs_to_its_line ... match full`
(`supabase/migrations/0018_a_product_has_a_family.sql:103-118`).

#### 19.6.5 A Lei da Inteligência aqui

- **Normal:** o custo por unidade com a conta aberta em três parcelas, e o eco da
  embalagem.
- **Diferente agora:** o aviso de classificação ocupada, e o selo da caixa
  fechada.
- **Próxima ação:** um botão só, travado enquanto a conta não fecha.
- Registro no teste da lei: `'app/products/new.tsx': { sozinho: 'formulário: o
  número é o rendimento que a pessoa está definindo agora.' }`
  (`src/law.test.ts:104-106`).

#### 19.6.6 Onde deduz em vez de perguntar

Nome escrito pela grade (`:260-273`); receita padrão é a primeira (`:170`);
porção, caixa, engradado e custo de embalagem já vêm preenchidos (`:151-162`);
tipo só é perguntado quando há mais de um (`:435`); lista de embalagem só aparece
onde existe embalagem cadastrada (`:614`); quantidade por unidade nasce em `1`
(`:634`); trava da grade lida antes do gesto (`:283-288`).

---

### 19.7 `app/recipes/index.tsx` — a estante de receitas

251 linhas. Título `Receitas`, overline `'o que entra em cada vez'`
(`src/i18n/locales/pt-BR.ts:887-888`). Área `apricot` para o cabeçalho não trocar
de cor no caminho até a ficha, mas o **tom dos cartões é `sky`**, porque o que
esta tela entrega é custo (`app/recipes/index.tsx:49-51`).

#### 19.7.1 Como cada linha é custeada

Cinco leituras (`app/recipes/index.tsx:85-91`) e, por receita, um `try/catch`
(`:93-138`):

| Caso | `figure` | `detail` | `batchCents` | `problema` |
|---|---|---|---|---|
| a receita virou produto com `yieldPerUnit` | `formatMoney(costPerProductUnit(cost, yieldPerUnit, { cents: unitPackagingCents, itemsRate: packagingRatePerUnit(packagingItems, costs) }))` (`:101-108`) | `fill(perUnitOf, { product, batch })` = `'por unidade de {{product}} · lote de {{batch}}'` (`:891`) | `cost.batchCents` | `false` |
| receita usada só dentro de outras | `formatMoney(Math.round(cost.perYieldUnit * 1_000))` (`:109`) | `perLitre = 'por litro de massa · usada dentro de outras receitas'` (`:892`) | `cost.batchCents` | `false` |
| `RecipeCycleError` | `'—'` | `cycle = 'Esta receita contém a si mesma — abra para corrigir.'` (`:893`) | `0` | `true` |
| qualquer outro erro | `'—'` | `missingPrice = 'Falta preço em algum insumo.'` (`:894`) | `0` | `true` |

Ordenação: `[...rows].sort((a, b) => b.batchCents - a.batchCents)` — a mais cara
primeiro (`app/recipes/index.tsx:141`).

#### 19.7.2 Cabeça da estante, e o resto

`primeira = rows[0] && !rows[0].problema && rows[0].batchCents > 0 ? rows[0] :
null` (`app/recipes/index.tsx:150`) — sem valor não há destaque, e as linhas
explicam o que falta uma por uma (comentário `:143-149`). `restante = primeira ?
rows.slice(1) : rows` (`:151`).

O cartão de cabeça é um `Touchable` sobre `Card` `sky` com `GlyphRecipe`, título
igual ao nome da receita (`app/recipes/index.tsx:191-218`): figura, `detail` em
duas linhas, a régua da ordem quando há mais de uma receita
(`orderedByBatch = 'Em ordem de quanto custa o lote — a mais cara primeiro, que é
onde mexer rende mais.'`, `src/i18n/locales/pt-BR.ts:895`) e o convite `Abrir a
tela` com o `IconChevron` (`:154-159`, `:214`).

A lista restante é um `Card` simples com overline `plural(restante.length,
t.app.settings.counted.recipes)` — `{ one: '1 receita', other: '{{n}} receitas'
}` (`src/i18n/locales/pt-BR.ts:401`). Conta o que está **nesta** lista, não a
estante inteira: o comentário registra o defeito de contar `rows.length` sobre uma
lista de um (`app/recipes/index.tsx:227-231`). Cada linha: `label`, `detail`,
`trailing = figure`, `trailingTone = problema ? 'muted' : 'ink'`, `signal =
problema ? 'warning' : undefined`, `onPress` para `/recipes/<id>` (`:235-245`).

Estados: `loading` → `costing = 'Calculando os custos…'`
(`src/i18n/locales/pt-BR.ts:889`, `app/recipes/index.tsx:163-169`); vazio →
cartão `sky` com `GlyphRecipe` e `empty` (a frase que manda cadastrar insumos
primeiro, `:890`), sem botão nenhum, porque não há tela de cadastro de receita
(comentário `app/recipes/index.tsx:171-173`).

#### 19.7.3 A Lei da Inteligência aqui

- **Normal:** a coluna de custos comparáveis, ordenada.
- **Diferente agora:** quem é a mais cara (promovida a figura) e quais fichas não
  fecham o custo (faixa `warning` + frase).
- **Próxima ação:** abrir a ficha. **Não há ação de criar** — lacuna registrada.
- Registro no teste da lei: `'app/recipes/index.tsx': { compara: /orderedByBatch/
  }` (`src/law.test.ts:87`).

---

### 19.8 `app/recipes/[id].tsx` — a ficha técnica (o editor)

635 linhas. Cabeçalho: `title` é o nome da receita vindo de `labels`, com
`fallbackTitle = 'Receita'`; `overline = fill(overlineVersion, { version:
stored.version })` = `'ficha técnica · versão {{version}}'`
(`app/recipes/[id].tsx:339-340`, `:378-381`, `src/i18n/locales/pt-BR.ts:899-901`).

#### 19.8.1 O que carrega, e o que faz sem parâmetro

Cinco leituras (`app/recipes/[id].tsx:123-147`), chave `params.id ?? ''`. **Sem
`id` na rota, abre a primeira receita do grafo**: `const recipeId = params.id ??
Object.keys(recipes)[0]` (`:132`, e de novo em `:149`). Os itens oferecidos são
só `input` e `packaging` (`:139-141`), reduzidos a `{ id, name, baseUnit }`. Do
produto que aponta para esta receita vêm `yieldPerUnit`, `unitPackagingCents`,
`packagingItems` e `packaging.tiers` (`:142-145`), com `[{ id: 'unit',
perBaseUnit: 1 }]` como padrão.

#### 19.8.2 O formulário é derivado, não copiado

`form` é o rascunho quando ele pertence à receita aberta; senão é montado do que
está gravado (`app/recipes/[id].tsx:166-184`):

| Campo | Origem |
|---|---|
| `lines` | `stored.lines` |
| `lossPercent` | `formatTyped(Number((stored.lossFraction * 100).toFixed(2)), locale.formatting)` (`:180`) |
| `yieldAmount` | `formatTyped(stored.yieldAmount, locale.formatting)` (`:181`) |
| `perUnit` | `formatTyped(data.yieldPerUnit, ...)` ou `''` (`:182`) |

O comentário registra a corrupção que isso conserta: `String(2.5)` é sempre
`"2.5"`, o leitor antigo apagava o ponto, e uma perda de 2,5% voltava como 25%
com o botão de salvar aceso e ninguém tendo tocado numa tecla
(`app/recipes/[id].tsx:173-179`). Há uma marca `proofgate-allow` na linha 173,
porque é porcentagem em campo de texto e não dinheiro. O `e2e` dirige exatamente
esse caminho (`e2e/flow.mjs:1158-1188`).

#### 19.8.3 A conta, refeita a cada tecla

`computed` (`app/recipes/[id].tsx:198-269`). Primeiro as duas recusas, que
**impedem** em vez de reclamar:

| Condição | Erro exibido |
|---|---|
| `yieldValue` não finito ou ≤ 0 | `needYield = 'Informe quanto a receita rende de cada vez.'` (`src/i18n/locales/pt-BR.ts:905`) |
| `loss` não finito, < 0 ou ≥ 1 | `lossRange = 'A perda tem de ficar entre 0% e 100%.'` (`:906`) |

Depois, o rascunho é custeado **dentro do grafo real**, sob a chave `DRAFT =
'__draft__'` (`:104`, `:214-230`), com `version: stored.version + 1` e
`versionId: DRAFT` — um rascunho não tem identidade que uma produção pudesse
gravar (comentário `:218-221`). Saídas:

- `cost = costRecipe(DRAFT, graph, costs, labels)` e `before =
  costRecipe(recipeId, data.recipes, ...)` (`:233-234`);
- `unitCents = costPerProductUnit(cost, portion, { cents: unitPackagingCents,
  itemsRate: packagingRatePerUnit(packagingItems, costs) })`, ou `null` sem porção
  (`:237-242`);
- `units = unitsPerBatch(cost, portion)` (`:243`);
- `boxTier = data.packaging.find(t => t.perBaseUnit > 1)` e `rounding =
  roundUpToFullContainer(units, { tiers: data.packaging }, boxTier.id)`
  (`:244-248`) — `{ rounded, addedUnits, tier }`, com
  `addedUnits = tier.perBaseUnit - (baseUnits % tier.perBaseUnit)`
  (`src/domain/units.ts:67-85`);
- `delta = compareVersions(before, cost, portion)` = `{ deltaCents, cheaper,
  percent }`, com `percent = delta / beforeUnit`
  (`src/domain/recipe.ts:258-271`).

Erros de grafo viram frase (`app/recipes/[id].tsx:256-264`):
`fill(containsItself, { path: e.path.join(' → ') })` = `'Essa receita contém a si
mesma: {{path}}'` e `fill(subRecipeMissing, { id })` = `'Sub-receita não
encontrada: {{id}}'` (`src/i18n/locales/pt-BR.ts:907-908`). Qualquer outro erro é
relançado (`:265`).

`changed` compara `JSON.stringify(lines)` com o gravado, `num(yieldAmount)` com
`stored.yieldAmount`, e a perda com tolerância `1e-9`
(`app/recipes/[id].tsx:271-278`) — **`perUnit` não entra**.

#### 19.8.4 Os blocos da tela

`cabeca = computed?.error || computed?.cost ? 1 : 0`
(`app/recipes/[id].tsx:375`) — o topo é um cartão só, ou o custo ou o dado que
falta.

**Falta um dado** (`hue = color.danger`, `GlyphRecipe`, título `missingData =
'Falta um dado'`, `src/i18n/locales/pt-BR.ts:904`): mostra `computed.error`
(`:385-395`).

**Quanto custa** (`hue = sky`, `GlyphPrice`, título `unitCost = 'CUSTO POR
UNIDADE'`, `:909`), em `app/recipes/[id].tsx:402-468`:

- figura `formatMoney(unitCents)` ou `'—'`, e ao lado, na mesma linha,
  `needPortion = 'Informe quantos ml vão em cada unidade.'` (`:910`) ou
  `fill(unitsPerBatch, { units, batch })` = `'{{units}} unidades de cada vez ·
  lote de {{batch}}'` (`:911`);
- a diferença contra a versão salva, só quando `delta && changed &&
  deltaCents !== 0`: seta `▼`/`▲` mais `fill(cheaperThan, { amount, version,
  percent })` = `'{{amount}} por unidade contra a versão {{version}}
  ({{percent}})'` (`:912`), em `color.ok` ou `color.warning` e peso `'600'`
  (`:425-443`);
- o arredondamento, quando `rounding.addedUnits > 0`: `fill(roundUp, { rounded,
  loose, units })` = `'Produza {{rounded}} para fechar caixa cheia — sobram
  {{loose}} soltas em {{units}}.'` (`:913`), com `loose = units %
  (boxTier?.perBaseUnit ?? 1)` (`:445-456`);
- o `[por quê?]`: botão fantasma `why = 'POR QUÊ?'` (`:914`) que abre a
  `WhySheet` (`:460-465`, `:624-632`).

A `WhySheet` (`src/components/WhySheet.tsx:21-122`) lista as linhas ordenadas por
participação, cada uma com o dinheiro e uma barra de `share`, e fecha com três
resumos: `batchCost = 'Custo do lote'`, `fill(expectedLoss, { percent })` =
`'Perda prevista ({{percent}})'` com `fill(remains, { amount })` = `'sobram
{{amount}}'`, e `perMassUnit = 'Custo por unidade de massa'` com
`fill(perAmount, { money: formatMoney(Math.round(perYieldUnit * 1000)), amount:
formatQuantity(1000) })` = `'{{money}} / {{amount}}'`; abaixo, `lossNote = 'A
perda encarece o que sobra: o lote é pago inteiro, mas só parte dele chega ao
cliente.'` (`src/i18n/locales/pt-BR.ts:1068-1079`).

**O que entra** (`hue = mint`, `GlyphSack`, título `whatGoesIn = 'O que entra de
cada vez'`, `:915`), em `app/recipes/[id].tsx:475-560`. Por linha:

- `label` = nome via `labels`, e sub-receita ganha `` ` · sub-receita` ``
  (`subRecipe`, `:916`; uso `:498`);
- `detail` = `fill(shareOfBatch, { quantity, percent })` = `'{{quantity}} ·
  {{percent}} do lote'` (`:917`), com `percent = formatPercent(share, locale, 0)`
  e `quantity` **com unidade**: unidade-base do item, ou `stored.yieldUnit` na
  sub-receita (`:490-502`). O comentário registra que a unidade faltava, e que
  "dezoito mil gramas e dezoito mil unidades são coisas diferentes na mesma
  ficha" (`:486-489`);
- `trailing` = `formatMoney(lineCost)`;
- três botões fantasmas em fila, cada um com `flex: 1` (`:505-524`):
  `lessTen = '−10%'` → `setQuantity(index, quantity * 0.9)`;
  `moreTen = '+10%'` → `* 1.1`; `remove = 'tirar'` → `removeLine(index)`
  (`src/i18n/locales/pt-BR.ts:918-920`). `setQuantity` faz `Math.max(0,
  Math.round(next))` (`:327-332`).

Abaixo, o que ainda não está na ficha: overline `add = 'ACRESCENTAR'` (`:921`) e
um `Pressable` de texto por item disponível (`available = items` menos os já
presentes, `:364-365`), com `accessibilityLabel = `${t.app.recipe.add}
${item.name}`` e `addItem(itemId)` inserindo `{ kind: 'item', itemId, quantity:
1_000 }` (`:336-337`, `:539-554`). O bloco só aparece se `available.length > 0`.

**A ficha em si** (`hue = sky`, `GlyphRecipe`, **sem título** de propósito —
o cabeçalho já diz "ficha técnica · versão N", `:562-566`), em `:567-608`:

| Rótulo | Chave | Sufixo | Dica |
|---|---|---|---|
| `Quanto rende de cada vez` | `batchYield` (`:922`) | `ml` | — |
| `Perda esperada` | `expectedLoss` (`:923`) | `%` | `fill(lossHint, { net: formatQuantity(cost.netYield), gross: formatQuantity(num(yieldAmount)) })` = `'Sobram {{net}} ml de {{gross}}. O lote é pago inteiro, então a perda encarece o que sobra.'` (`:924-925`) |
| `Vai em cada unidade` | `perUnit` (`:926`) | `ml` | `fill(packagingHint, { amount: formatMoney(unitPackagingCents) })` = `'Mais {{amount}} de palito e embalagem por unidade.'` (`:927`), só quando `unitPackagingCents > 0` |

Todos `keyboardType="numeric"`.

#### 19.8.5 Salvar como versão nova

Botão único, `weighty`, rotulado `fill(saveAs, { version: stored.version + 1 })` =
`'Salvar como versão {{version}}'`, ou `saving = 'Salvando…'`
(`src/i18n/locales/pt-BR.ts:928-929`). `disabled = !changed || saving ||
Boolean(computed?.error)` (`app/recipes/[id].tsx:619`).

Confirmação (`app/recipes/[id].tsx:296-301`): título `fill(saveTitle, { version:
stored.version + 1 })` = `'Salvar versão {{version}}?'`; corpo `fill(saveBody, {
previous: stored.version, summary })` = `'A versão {{previous}} continua guardada
— as produções antigas mantêm o custo delas. {{summary}}'`; `confirmLabel = save =
'Salvar'`; `cancelLabel = keepEditing = 'Continuar editando'`
(`src/i18n/locales/pt-BR.ts:930-937`). O `summary` (`:283-293`):

| Condição | Texto |
|---|---|
| `deltaCents === 0` | `summarySame = 'O custo por unidade não muda.'` |
| `cheaper` | `fill(summaryCheaper, { amount, version })` = `'Fica {{amount}} por unidade em relação à versão {{version}}.'` |
| senão | `fill(summaryDearer, ...)` = `'Sobe {{amount}} ...'` |
| sem porção (`delta` nulo) | `''` |

Gravação (`app/recipes/[id].tsx:306-313`):

```
saveRecipeVersion(LOCAL_COMPANY_ID, {
  recipeId,
  name: data?.labels[recipeId] ?? 'Receita',
  yieldAmount: num(yieldAmount),
  yieldUnit: 'ml',
  lossFraction: num(lossPercent) / 100,
  lines,
})
```

Três fatos que precisam sobreviver:

- **`'Receita'` é literal no código** (`app/recipes/[id].tsx:308`) — é a única
  string de texto fora de `src/i18n/` nestas oito telas, e só é usada se o nome não
  estiver no `labels`.
- **`yieldUnit` é fixo em `'ml'`** (`:310`): salvar uma ficha cujo rendimento
  estava em `g` reescreve a unidade para `ml`, porque `saveRecipeVersion` faz
  `ON CONFLICT(id) DO UPDATE SET ... yield_unit = excluded.yield_unit`
  (`src/data/repository.ts:1162-1165`).
- **O campo "Vai em cada unidade" não é gravado por esta tela.** Ele mora no
  produto (`products.yield_per_unit`) e só é escrito por `saveProduct`. Aqui ele
  entra na conta e na confirmação, e nada mais — o que também é por que `changed`
  o ignora (`:271-278`).

`saveRecipeVersion` cria **versão nova**, nunca sobrescreve: lê `MAX(version)`,
soma 1, grava `recipe_versions` com `effective_from = at.slice(0, 10)` e as linhas
em ordem por `position`, tudo em uma transação, e enfileira receita, versão e
linhas nessa ordem (`src/data/repository.ts:1137-1222`).

Falha: `failedToSave = 'Não deu para salvar'` em diálogo de reconhecimento
(`src/i18n/locales/pt-BR.ts:938`, `app/recipes/[id].tsx:316-321`). Sucesso:
`router.back()`.

Estado de abertura/vazio (`app/recipes/[id].tsx:350-362`): cartão `sky` com
`GlyphRecipe` dizendo `opening = 'Abrindo a ficha…'` ou `none = 'Nenhuma receita
cadastrada ainda.'` (`src/i18n/locales/pt-BR.ts:902-903`), com título
`fallbackTitle` e overline `overline = 'ficha técnica'`.

#### 19.8.6 A Lei da Inteligência aqui

- **Normal:** o custo por unidade, quantas unidades saem de cada vez e o lote
  inteiro.
- **Diferente agora:** a diferença contra a versão salva, calculada enquanto o
  ajuste está aberto, e o aviso de caixa incompleta.
- **Próxima ação:** salvar como versão N+1, travado até algo mudar.
- **Lei 6:** o `[por quê?]` abre a `WhySheet` com a conta inteira.
- Registro no teste da lei: `'app/recipes/[id].tsx': { compara:
  /summaryCheaper|summaryDearer|delta/ }` (`src/law.test.ts:91`).

---

### 19.9 `app/catalog.tsx` — Linhas, tipos e sabores

351 linhas. Título `Linhas, tipos e sabores`, overline `'a grade do que você
fabrica'`, área `sand` (`src/i18n/locales/pt-BR.ts:954-955`,
`app/catalog.tsx:56`, `:153`).

#### 19.9.1 Consulta e estado

Uma `useQuery` com `listLines`, `listTypes` (sem filtro de linha) e `listFlavors`
(`app/catalog.tsx:75-82`); as três leem só `active = 1` e ordenam por `sort,
name COLLATE NOCASE` (`src/data/repository.ts:3641-3677`). Estado local:
`lineId`, `novaLinha`, `novoTipo`, `novoSabor`, `erro` (`app/catalog.tsx:69-73`).

`linhaAtiva = data?.lines.find(l => l.id === lineId) ?? data?.lines[0] ?? null`
(`app/catalog.tsx:87`) — a primeira linha já vem escolhida, porque "uma fábrica
que tem uma linha só nunca deveria ter de escolhê-la" (`:84-86`). `tiposDaLinha`
filtra por `lineId === linhaAtiva?.id` (`:88`).

#### 19.9.2 O cartão que ensina com o exemplo de quem lê

`hue = palette.sand`, ícone `GlyphPrice` (`app/catalog.tsx:169-181`). Quando há
linha, mostra em `type.section` o **nome que a grade monta**, pela mesma
precedência do cadastro de produto (`:113-133`):

| Estado | Chave usada |
|---|---|
| tipo **e** sabor | `composed = '{{line}} {{type}} de {{flavor}}'` |
| só sabor | `composedNoType = '{{line}} de {{flavor}}'` |
| só tipo | `composedNoFlavor = '{{line}} {{type}}'` |
| nenhum | `linhaAtiva.name` |
| sem linha | `null` — só a frase de ensino |

Abaixo, sempre, `intro = 'Cadastre uma vez e combine à vontade. Picolé
tradicional de morango é uma linha, um tipo e um sabor — não um nome digitado
inteiro.'` (`src/i18n/locales/pt-BR.ts:956-957`), em `type.caption` quando há
exemplo e `type.body` quando não há (`app/catalog.tsx:172-179`).

#### 19.9.3 Os três cartões de cadastro

| Cartão | Título | Dica | Vazio | Campo/Botão |
|---|---|---|---|---|
| Linhas (`:185-236`) | `lines = 'Linhas'` (`:958`) | `linesHint = 'o que você fabrica: Picolé, Pote de sorvete'` (`:959`) | `noLines = 'Nenhuma linha ainda. Comece pela mais óbvia: o que você fabrica todo dia?'` (`:972`) | `addLine = 'Nova linha'` (`:966`), placeholder `namePlaceholder = 'Nome'` (`:969`) |
| Tipos (`:243-304`) | `fill(types, { line })` = `'Tipos de {{line}}'` (`:960`), ou `typesTitle = 'Tipos'` sem linha (`:962`) | `typesHint = 'o que divide a linha: Tradicional, Skimó, Top — ou 240 ml, 500 ml, 1 litro'` (`:963`), ou `noLineYet = 'Cadastre uma linha primeiro — o tipo é dela.'` (`:971`) | `noTypes = 'Nenhum tipo nesta linha. Sem tipo também funciona — o produto fica só linha e sabor.'` (`:973`) | `addType = 'Novo tipo'` (`:967`) |
| Sabores (`:308-344`) | `flavors = 'Sabores'` (`:964`) | `flavorsHint = 'valem para todas as linhas: morango, chocolate, coco branco'` (`:965`) | `noFlavors = 'Nenhum sabor ainda.'` (`:974`) | `addFlavor = 'Novo sabor'` (`:968`) |

Detalhes que são decisão, não acidente:

- **As linhas são escolha; tipos e sabores são só etiquetas.** As linhas são
  `Pressable` com `accessibilityRole="radio"` e `Chip` `'ok'` na escolhida
  (`app/catalog.tsx:200-215`); tipos e sabores saem por `etiquetas(...)`, todos em
  `Chip signal="neutral"` — cinza é "isto está cadastrado", e verde neste
  aplicativo quer dizer conferido (`:135-150`).
- **O cartão de tipo fica de pé mesmo sem linha**, sem formulário dentro, porque
  sumir com ele esconderia o caminho (`:238-242`); o título então nomeia o assunto
  em vez de prometer a ação ausente (`:247-259`).
- **O sabor não depende de escolha nenhuma acima**: ele atravessa as linhas
  (`:306-307`; e no repositório, sabor é da empresa e não do tipo,
  `src/data/repository.ts:3633-3635`).
- Cada botão é `variant="ghost"` e `disabled` enquanto `trim().length === 0`
  (`:229`, `:292`, `:334`).

#### 19.9.4 Gravação e o único erro que acontece

```
const gravar = async (fn, limpar) => {
  setErro(null);
  try { await fn(); limpar(); refresh(); }
  catch (e) {
    setErro(e instanceof Error && /unique/i.test(e.message)
      ? t.app.catalog.duplicate : String(e));
  }
};
```

(`app/catalog.tsx:90-102`.) `duplicate = 'Esse nome já está cadastrado. Caixa e
espaço não contam como diferença.'` (`src/i18n/locales/pt-BR.ts:953`) — a frase
existe porque o índice ignora caixa e espaço: `CREATE UNIQUE INDEX
product_lines_name_idx ON product_lines (company_id, lower(trim(name)))`,
`product_types_name_idx ON product_types (company_id, line_id, lower(trim(name)))`
e `flavors_name_idx ON flavors (company_id, lower(trim(name)))`
(`src/data/db.ts:431-436`; no servidor, `lower(btrim(name))`,
`supabase/migrations/0018_a_product_has_a_family.sql:47-79`).

As três escritas (`app/catalog.tsx:231`, `:295`, `:337`) chamam `saveLine({ name
})`, `saveType({ lineId: linhaAtiva.id, name })` e `saveFlavor({ name })`; o
repositório aplica `name.trim()` e `sort ?? 0`, faz `INSERT ... ON CONFLICT(id)
DO UPDATE` e enfileira a linha para o servidor
(`src/data/repository.ts:3680-3732`).

O cartão de erro fica **antes de tudo, com índice fixo 0**
(`app/catalog.tsx:154-164`): índice corrido renumeraria os cartões de baixo e a
tela inteira reentraria no instante em que um nome repetido aparece. `Card
tone="warning"`.

#### 19.9.5 A Lei da Inteligência aqui

- **Normal:** o nome que a grade monta, escrito com as palavras da própria
  fábrica, e as etiquetas já cadastradas.
- **Diferente agora:** o cartão de erro de nome repetido — e nada mais; não há
  contagem nem histórico aqui.
- **Próxima ação:** cadastrar o nível que ainda está vazio, dito no estado vazio
  de cada cartão.

---

### 19.10 O que estas oito telas **não** fazem (lacunas verificadas)

| Lacuna | Prova |
|---|---|
| Criar receita pela interface | `saveRecipeVersion` sem `recipeId` só é chamado pela semeadura (`src/data/seed.ts:162`, `:174`); `app/recipes/[id].tsx:307` sempre manda `recipeId` |
| Editar produto (nome, receita, porção, embalagem, validade, régua) | `app/products/` só tem `index.tsx` e `new.tsx`; `saveProduct` nunca recebe `id` de tela |
| Renomear ou remover linha/tipo/sabor | `app/catalog.tsx` só envia `name`; `active` nunca vai a 0 fora de `src/data/erase.ts:155-157` |
| Escolher a **sala** de uma perda | `app/inputs/[id].tsx:256-260` não passa `locationId`; `recordLoss` cai no lugar padrão (`src/data/repository.ts:2109`) |
| Escolher a unidade de rendimento da receita | `app/recipes/[id].tsx:310` fixa `yieldUnit: 'ml'` |
| Cadastrar hierarquia de embalagem para insumo | `app/inputs/new.tsx:319` grava sempre `[{ id: 'unit', perBaseUnit: 1 }]` |
| Preservar a régua de cor ao corrigir um insumo com o campo vazio | `app/inputs/new.tsx:320` sempre envia número ou `null` |
| Abrir o catálogo a partir de Ajustes, como a frase de erro promete | única rota para `/catalog` é `app/products/index.tsx:193` |
| Ordenar linhas/tipos/sabores | `sort` nunca é enviado; fica 0 e a ordenação cai no nome |

---

### 19.11 Como estas telas são verificadas

**Teste da Lei 3** (`src/law.test.ts`): conta as ocorrências de `type.figure` no
código sem comentários (`:113-120`) e exige uma declaração por número grande.
Registros das telas desta seção: `app/recipes/index.tsx` (`:87`),
`app/inputs/index.tsx` (`:88`), `app/inputs/[id].tsx` (`:89`),
`app/recipes/[id].tsx` (`:91`), `app/inputs/new.tsx` (`:101-103`, declarado
`sozinho`), `app/products/new.tsx` (`:104-106`, declarado `sozinho`).
`app/products/index.tsx` e `app/catalog.tsx` não constam porque não usam
`type.figure` — o de `app/catalog.tsx:171` é `type.section`.

**Navegador** (`e2e/flow.mjs`), checagens que dirigem estas telas:

| Linha | O que prova |
|---|---|
| `:205-231` | `/inputs` e `/products` abrem por link direto, com o exemplo semeado (`R$ 1.552,50` parados; `1 engradado, 4 caixas e 6 unidades`) |
| `:232-245` | `/recipes` abre por link direto e mostra as duas fichas semeadas |
| `:343-368` | `saco 25 kg` preenche 25000, e `balde` não apaga o que estava lá |
| `:867-894` | segundo produto sem classificação é recusado com frase, sem `finalizing statement` |
| `:1008-1037` | faixa de cor só existe com régua; depois de cadastrar `500000`, a linha diz `10% do cheio` |
| `:1038-1132` | `/catalog` cadastra linha e sabor; `/products/new` lista o palito, a conta dos três números fecha, e a corrida gasta um palito por unidade |
| `:1158-1188` | abrir a ficha e não tocar em nada não altera a perda (2,5% continua 2,5%) |
| `:1189-1226` | a contagem é cega, a confirmação diz tudo por extenso, e o saldo passa a bater |
| `:1402-1427` | nome corrigido sem mover o custo médio (`R$ 9,80` intacto) |
| `:1428-1448` | item sai de circulação e desaparece do seletor, mantendo custo e histórico |
| `:1449-1495` | perda com motivo: confirmação diz quantidade, motivo e dinheiro; saldo cai |
| `:1620-1667` | desfazer um lançamento pela ficha do insumo: saldo volta, linha fica marcada `já corrigido`, e a `Correção` aparece como lançamento novo |

**Semeadura que estas telas encontram no primeiro dia**
(`src/data/seed.ts:137-195`): quatro insumos (`Polpa de morango` balde 10 kg,
`Açúcar cristal` saco 25 kg, `Leite em pó` saco 25 kg, `Glucose 38DE` balde 5 kg,
todos em `g`), duas embalagens (`Palito de picolé` caixa 5.000, `Embalagem
plástica` fardo 2.000, em `un`), seis compras reais que formam as médias, duas
receitas (`Base de creme` 20.000 ml com 2% de perda; `Picolé de morango` 40.000 ml
com 5% de perda, usando a base como sub-receita de 10.000) e um produto (`Picolé
de morango`, 75 ml por unidade, `unitPackagingCents = 5`, hierarquia
`unit=1 / box=50 / crate=300`, `src/data/seed.ts:17-21`). Nenhuma linha, tipo ou
sabor é semeado — a grade nasce vazia, e é por isso que o produto semeado ocupa a
classificação `(null, null, null)`.
