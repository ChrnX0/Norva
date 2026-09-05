## 21. Telas — ajustes, assistente e clima

Três telas fora das abas, todas alcançadas pela gaveta "Mais": `/settings`
(`app/settings.tsx`, 1148 linhas), `/assistant` (`app/assistant.tsx`, 326
linhas) e `/weather` (`app/weather.tsx`, 198 linhas).

As portas de entrada, todas em `app/(tabs)/more.tsx`:

| tela | rota | quem abre | rótulo da porta |
|---|---|---|---|
| Ajustes | `/settings` | `app/(tabs)/more.tsx:103` | `t.app.more.rows.settings` = "Ajustes", detalhe `t.app.settings.stored` = "O que está guardado" |
| Clima | `/weather` | `app/(tabs)/more.tsx:102` | `t.app.more.rows.weather` = "Clima", detalhe `t.app.weather.change` = "trocar a cidade" |
| Pergunte | `/assistant` | `app/(tabs)/more.tsx:129` (`router.push('/assistant')`) | `t.app.more.ask.label` = "Pergunte", dica `t.app.more.ask.hint` = "escreva o que quer saber" |

O cartão do clima na capa **não navega para `/weather`**: `src/home/Mosaic.tsx`
não importa `useRouter` nem chama `router.push` em lugar nenhum
(`src/home/Mosaic.tsx`, verificado por busca — nenhuma ocorrência de `router`).
O toque no cartão do clima só abre a semana dentro do próprio cartão
(`src/home/Mosaic.tsx:273-274`, `abrir('clima')`). Logo, a única porta para a
tela de Clima é o menu "Mais". O comentário de `src/home/Mosaic.tsx:271-272`
("A tela cheia continua a um toque de dentro da peça aberta") **não corresponde
a nenhum código**: NÃO IMPLEMENTADO.

---

### 21.1 `app/settings.tsx` — a tela de Ajustes

#### 21.1.1 Casca, tom e cabeçalho

`SettingsScreen` é só o invólucro de tom: envolve `<Settings />` num
`AreaProvider area="mist"` (`app/settings.tsx:97-103`). `mist` é a cor ambiente
da área "settings" (`src/theme/tokens.ts:43`, `ambientArea.mist = 'settings'`).

O corpo é um `CollapsingHeader` (`app/settings.tsx:412-415`):

- `title` = `t.app.settings.title` → "Ajustes" (pt-BR), "Settings" (en),
  "Ajustes" (es) (`src/i18n/locales/pt-BR.ts:328`, `en.ts:285`, `es.ts:290`)
- `overline` = `` `${brand.name} · ${Constants.expoConfig?.version ?? '—'}` ``
  (`app/settings.tsx:414`) → hoje "NORVA · 0.10.0", porque
  `brand.name = 'NORVA'` (`src/config/brand.ts:12`) e `app.json` traz
  `"version": "0.10.0"` (`app.json:6`). O `overline` é escrito em caixa alta
  pelo componente (`src/components/CollapsingHeader.tsx:96`).

A espessura de traço dos ícones é derivada da pele: `const traco = skin ===
'papel' ? 1.7 : 2.2` (`app/settings.tsx:178`).

Cada cartão entra com `Reveal` numerado, e o número é a ordem de aparição:

| `Reveal index` | cartão | condição de existir |
|---|---|---|
| 0 | O que está guardado | `loading \|\| total > 0` (`app/settings.tsx:421`) |
| 1 | A cara do aplicativo | sempre (`app/settings.tsx:533`) |
| 2 | Idioma e moeda | sempre (`app/settings.tsx:668`) |
| 3 | O que aparece na tela inicial | sempre (`app/settings.tsx:732`) |
| 4 | Avisos no celular | `alerts` já carregado (`app/settings.tsx:832-833`) |
| 5 | Pedido precisa de aprovação | sempre (`app/settings.tsx:1027`) |
| 6 | Começar do zero | `!loading && total > 0` (`app/settings.tsx:1059`) |
| 7 | Dados de exemplo (estado vazio) | `total === 0 && !loading` (`app/settings.tsx:1083`) |
| 8 | Plantar duas semanas de movimento | `total > 0 && !loading` (`app/settings.tsx:1110`) |
| 9 | Voltar (`Button variant="ghost"`) | sempre (`app/settings.tsx:1131-1133`) |

`total` é a soma das cinco contagens de cadastro:
`inputs + recipes + products + purchases + places`
(`app/settings.tsx:404-409`). `places` entra nessa soma por correção escrita: com
três lojas cadastradas e nenhum item, a tela afirmava "Está vazio" e escondia o
cartão do que está guardado, enquanto "apagar tudo" contava os três lugares na
confirmação — duas verdades sobre a mesma pergunta
(`app/settings.tsx:395-403`).

#### 21.1.2 Onde cada ajuste é gravado — a tabela mestra

Toda persistência de ajuste passa por `app_meta`, a tabela chave/valor do
aparelho, cujo DDL é exatamente:

```sql
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
(`src/data/db.ts:136-139`)

As duas funções de acesso, `readMeta` / `writeMeta`, com upsert
`ON CONFLICT(key) DO UPDATE SET value = excluded.value`
(`src/data/meta.ts:15-31`), mais um par JSON tolerante, `readJson` / `writeJson`,
que devolve `null` em JSON quebrado (`src/data/meta.ts:41-53`).

**`app_meta` não tem `company_id` e não entra na fila de sincronização.** Nenhum
`writeMeta` chama `enqueue` (`src/data/meta.ts` inteiro). Portanto a distinção
"da empresa" vs "do aparelho" que a tela declara é hoje **semântica e de
intenção**, não mecânica: todos os ajustes são, na prática, por instalação.

| chave `app_meta` | ajuste | valor gravado | padrão quando ausente | declarado como | onde |
|---|---|---|---|---|---|
| `appearance.skin` | pele/identidade | `'organico'` \| `'papel'` | `'organico'` | aparelho | `src/theme/Appearance.tsx:8,66,93-98` |
| `appearance.hue` | paleta da paisagem | `'verde'`\|`'azul'`\|`'ambar'`\|`'terracota'`\|`'lavanda'` | `'verde'` | aparelho | `src/theme/Appearance.tsx:9,67,100-103` |
| `appearance.scheme` | luz da tela | `'claro'`\|`'escuro'`\|`'sistema'` | `'claro'` (`SCHEME_PADRAO`) | aparelho | `src/theme/Appearance.tsx:10,68,105-108`; `src/theme/scheme.ts:25,28,38` |
| `locale.language` | idioma | `'pt-BR'`\|`'es'`\|`'en'` | idioma detectado do aparelho | **empresa** | `src/i18n/Locale.tsx:7,78-83` |
| `locale.currency` | moeda | um dos 8 códigos | moeda detectada do aparelho, `'BRL'` se fora da lista | **empresa** | `src/i18n/Locale.tsx:8,85-88`; `src/i18n/device.ts:30-36` |
| `briefing.order` | ordem das peças da capa | palavras separadas por vírgula, ex. `producao,clima,insumos` | vazio = "ordem de fábrica" | **empresa** | `src/data/repository.ts:3888,3899-3906` |
| `briefing.hidden` | peças escondidas | palavras separadas por vírgula | vazio | aparelho | `src/data/repository.ts:3889,3915-3922` |
| `alerts.settings` | avisos | JSON de `AlertSettings` | `DEFAULT_ALERTS` | **empresa** | `src/data/repository.ts:3924,3939-3966` |
| `orders.needApproval` | pedido precisa de aprovação | `'1'` \| `'0'` | `false` (qualquer coisa ≠ `'1'`) | **empresa** | `src/data/repository.ts:3968,3978-3984` |
| `weather.place` | cidade da fábrica | JSON de `WeatherPlace` | nulo → deduz do fuso | aparelho | `src/weather/live.ts:12,38-44` |
| `weather.forecast` | cache de previsão | JSON de `Forecast` | nulo | aparelho | `src/weather/live.ts:13,56-57` |
| `seeded` | o exemplo já foi escrito alguma vez | `'1'` | ausente | aparelho | `src/data/seed.ts:88-94,215` |
| `seeded_items` | os ids que a semeadura criou | JSON de array de ids | ausente | aparelho | `src/data/seed.ts:65,206` |

Duas notas de precisão:

- **O fuso não é gravado e nunca é pergunta.** Ele vem do relógio do aparelho a
  cada abertura: `detectTimeZone()` lê `getCalendars()[0]?.timeZone` e cai em
  `'America/Sao_Paulo'` se a string não tiver `/` (`src/i18n/device.ts:46-49`).
  A dica da tela diz isso ("O fuso vem do celular, que está na fábrica",
  `src/i18n/locales/pt-BR.ts:415`).
- **Apagar tudo não apaga os ajustes.** `app_meta` não está na lista de tabelas
  apagáveis: `tablesFor('all')` enumera 20 tabelas e nenhuma delas é `app_meta`
  (`src/data/erase.ts:143-169`). Idioma, moeda, pele, luz, capa, avisos,
  aprovação e cidade do clima sobrevivem a "Começar do zero".

Fora de `app_meta` existe **uma** preferência de aparelho, em `AsyncStorage`, e
ela não aparece nos Ajustes: `norva:release-seen`
(`` `${brand.slug}:release-seen` ``), a versão de release cujo aviso "o que
mudou" já foi visto (`src/components/WhatsNew.tsx:10,34,43,58`).

#### 21.1.3 Cartão 0 — "O que está guardado" e a limpeza por área

`Card hue={palette.mist}`, ícone `GlyphCatalog size={26}`, título
`t.app.settings.stored` (`app/settings.tsx:423-427`).

Fonte de dado: um `useQuery` que devolve dois fatos de uma vez
(`app/settings.tsx:260-269`):

```ts
counts:  await countForErase(LOCAL_COMPANY_ID),
example: await exampleStillHere(LOCAL_COMPANY_ID),
```

`LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001'`
(`src/data/seed.ts:12`).

Enquanto carrega, o corpo é a frase `t.app.settings.checking` = "Conferindo…"
(`app/settings.tsx:428-431`; `src/i18n/locales/pt-BR.ts:330`).

Com dado, o cartão desenha, nesta ordem:

1. **Selo do exemplo**, só se `data.example`: `Chip signal="neutral"` com
   `t.app.settings.hasExample` = "Inclui os dados de exemplo"
   (`app/settings.tsx:434`). É a **presença** do exemplo, não o histórico:
   `exampleStillHere` lê a chave `seeded_items`, faz `JSON.parse`, filtra os ids
   que são string e conta quantos ainda existem em `items` daquela empresa —
   verdadeiro se ≥ 1 (`src/data/seed.ts:62-86`). A cicatriz está escrita: a marca
   `seeded` nunca é apagada, então o selo antigo era verdadeiro para sempre, em
   todo aparelho, inclusive depois de apagar tudo (`src/data/seed.ts:48-61`).
2. **Sobrelinha** `t.app.settings.clearByArea.toUpperCase()` → "LIMPAR POR ÁREA",
   e dica `t.app.settings.clearByAreaHint` = "Uma área de cada vez, quando você
   quiser refazer só uma parte." (`app/settings.tsx:436-441`;
   `src/i18n/locales/pt-BR.ts:339-340`).
3. **Quatro linhas tocáveis**, na ordem literal da constante
   `AREAS = [{purchases}, {recipes}, {products}, {inputs}]`
   (`app/settings.tsx:118-123`).
4. **Uma linha não tocável** para os lugares.

Cada linha de área (`app/settings.tsx:443-488`):

| campo | conteúdo |
|---|---|
| nome | `purchases` → `t.app.settings.purchases` = "Compras lançadas"; senão `t.app.settings[area]` = "Receitas" / "Produtos" / "Insumos" (`app/settings.tsx:444-447`) |
| segunda linha | o bloqueio, se houver; senão `t.app.settings.areas[area]` (`app/settings.tsx:471-473`) |
| número à direita | `formatQuantity(counts[area], locale)`, com `fontVariant: ['tabular-nums']` e peso 600 (`app/settings.tsx:475-483`, `1144`) |
| chevron | `IconChevron size={18}` (`app/settings.tsx:484`) |
| `accessibilityLabel` | `` `${t.app.settings.erase} ${nome}` `` → "Apagar Produtos", "Apagar Compras lançadas" (`app/settings.tsx:462`) |
| tinta | tudo em `color.inkFaint` quando a área está bloqueada (`app/settings.tsx:467,479`) |

Os quatro textos de `areas` (`src/i18n/locales/pt-BR.ts:341-346`):

| chave | texto pt-BR |
|---|---|
| `purchases` | "notas lançadas, custo médio e histórico de preço" |
| `recipes` | "fichas técnicas e todas as versões" |
| `products` | "o que sai para vender" |
| `inputs` | "almoxarifado, embalagem e material de loja" |

A linha dos lugares (`app/settings.tsx:495-511`): rótulo
`t.app.settings.placesRow` = "Lojas e clientes", dica
`t.app.settings.placesHint` = 'saem só com "começar do zero"', número
`formatQuantity(counts.places, locale)`, **sem toque e sem chevron** de
propósito — nenhuma área menor é dona dos lugares —, e um `<View style={{ width:
18 }} />` no lugar do chevron para a coluna de números continuar alinhada
(`app/settings.tsx:490-494,507-510`).

##### `countForErase` — a consulta única

Uma `SELECT` com dez subconsultas, todas com `?1 = companyId`
(`src/data/repository.ts:3421-3447`):

| campo de `EraseCounts` | consulta |
|---|---|
| `inputs` | `COUNT(*) FROM items WHERE company_id=?1 AND kind IN ('input','packaging','store_supply')` |
| `movements` | `COUNT(*) FROM movements WHERE company_id=?1` |
| `recipes` | `COUNT(*) FROM recipes WHERE company_id=?1` |
| `products` | `COUNT(*) FROM products WHERE company_id=?1` |
| `places` | `COUNT(*) FROM locations WHERE company_id=?1 AND id <> ?1` — o lugar padrão, cujo id **é** o `company_id`, não conta |
| `purchases` | `COUNT(*) FROM purchases WHERE company_id=?1` |
| `recipeLinesUsingInputs` | `COUNT(*) FROM recipe_lines WHERE company_id=?1 AND item_id IS NOT NULL` |
| `purchaseLinesUsingItems` | `purchase_lines JOIN items` com `i.kind IN ('input','packaging','store_supply')` |
| `productsUsingRecipes` | `COUNT(*) FROM products WHERE company_id=?1 AND recipe_id IS NOT NULL` |
| `purchaseLinesUsingProducts` | `purchase_lines JOIN items` com `i.kind IN ('product','resale')` |

O resultado é mesclado sobre `emptyCounts` (todos zero), então uma linha ausente
não vira `undefined` na tela (`src/data/repository.ts:3446`;
`src/data/erase.ts:90-101`).

##### Os quatro bloqueios

`blockerFor(area, counts)` devolve `null` para `'all'` e, para as outras
(`src/data/erase.ts:194-215`):

| área | condição | `reason` | `count` reportado |
|---|---|---|---|
| `inputs` | `recipeLinesUsingInputs > 0` | `recipesUseInputs` | `counts.recipes` |
| `inputs` | senão, `purchaseLinesUsingItems > 0` | `purchasesUseInputs` | `counts.purchases` |
| `recipes` | `productsUsingRecipes > 0` | `productsUseRecipes` | `counts.productsUsingRecipes` |
| `products` | `purchaseLinesUsingProducts > 0` | `purchasesUseProducts` | `counts.purchaseLinesUsingProducts` |

O bloqueio é **fato, não frase**: o tipo `EraseBlocker` carrega só `reason` e
`count`, e a tela é que fala português (`src/data/erase.ts:180-192`). Quem
traduz é `sayBlocker(blocker, t)`, um `switch` de quatro ramos que chama
`plural(count, words.blocked[reason])` — exceto `purchasesUseProducts`, que é
frase única sem contagem (`app/settings.tsx:126-141`).

As quatro frases (`src/i18n/locales/pt-BR.ts:374-389`):

| `reason` | singular / plural |
|---|---|
| `recipesUseInputs` | "Não dá para apagar os insumos enquanto 1 receita usa eles. Apague as receitas primeiro." / "…enquanto {{n}} receitas usam eles. Apague as receitas primeiro." |
| `purchasesUseInputs` | "Não dá para apagar os insumos enquanto 1 compra lançada aponta para eles. Apague as compras primeiro." / "…{{n}} compras lançadas apontam para eles…" |
| `productsUseRecipes` | "Não dá para apagar as receitas enquanto 1 produto é feito delas. Apague os produtos primeiro." / "…{{n}} produtos são feitos delas…" |
| `purchasesUseProducts` | "Não dá para apagar os produtos enquanto há compras de revenda lançadas neles. Apague as compras primeiro." (sem plural) |

##### `run(area, label)` — o caminho de apagar

Sequência exata (`app/settings.tsx:273-319`):

1. Sai calado se `!counts || busy`.
2. `blockerFor`: se houver bloqueio, abre um `confirm` de reconhecimento
   (`acknowledge: true`, botão `t.app.confirm.understood` = "Entendi") com
   título `t.app.settings.cannotYet` = "Ainda não dá" e mensagem
   `sayBlocker(...)`, e **retorna**. Lei 5 duas vezes: a linha já estava apagada,
   e o toque explica a ordem certa em vez de não responder
   (`app/settings.tsx:276-287`).
3. `confirm` destrutivo:
   - título: `'all'` → `t.app.settings.eraseAllTitle` = "Apagar tudo?"; senão
     `fill(t.app.settings.eraseTitle, { area: label.toLowerCase() })` →
     "Apagar produtos?" (`app/settings.tsx:290-293`).
   - mensagem: `` `${sayTally(...)}\n\n${t.app.settings.noUndo}` `` — o inventário
     por extenso, linha em branco, e "Isso não tem volta."
     (`app/settings.tsx:294`).
   - `confirmLabel: t.app.settings.erase` = "Apagar"; `destructive: true`, que no
     `Confirm` troca o diálogo de subir-de-baixo para centralizado com
     `animationType="fade"` e pinta o botão em `color.danger`
     (`app/settings.tsx:295-296`; `src/components/Confirm.tsx:97-98,155-158`).
4. `setBusy(true)`, `await eraseArea(LOCAL_COMPANY_ID, area)`, `refresh()`.
5. No `catch`: se for `EraseBlockedError`, título "Ainda não dá" e a frase do
   bloqueio; senão título `t.app.settings.failedToErase` = "Não deu para apagar"
   e a mensagem crua do erro (`app/settings.tsx:304-315`).
6. `finally { setBusy(false) }`.

##### `sayTally` — a confirmação contada

`sayTally(area, tally, t)` (`app/settings.tsx:144-174`):

- Se `isEmpty(tally)`: `'all'` → `t.app.settings.alreadyEmpty` = "Já está tudo
  vazio."; qualquer outra → `t.app.settings.nothingToErase` = "Não há nada para
  apagar aqui." (`app/settings.tsx:146`).
- Senão monta as partes **nesta ordem**: `inputs`, `movements`, `recipes`,
  `products`, `places`, `purchases` (`app/settings.tsx:152-159`). `movements` vem
  antes dos cadastros de propósito, "porque é o que dói"
  (`app/settings.tsx:153-155`).
- Junta com `joinList(parts, t.common.and)` → "6 insumos, 2 receitas e 1
  produto" (`app/settings.tsx:161`; `src/i18n/index.ts:261-265`).
- Escolhe a moldura da frase por área (`app/settings.tsx:162-171`) e interpola
  `{{what}}`.

As formas contadas (`src/i18n/locales/pt-BR.ts:398-405`):

| chave | singular | plural |
|---|---|---|
| `inputs` | "1 insumo" | "{{n}} insumos" |
| `movements` | "1 movimento do livro-razão" | "{{n}} movimentos do livro-razão" |
| `recipes` | "1 receita" | "{{n}} receitas" |
| `products` | "1 produto" | "{{n}} produtos" |
| `places` | "1 lugar" | "{{n}} lugares" |
| `purchases` | "1 compra" | "{{n}} compras" |

As cinco molduras (`src/i18n/locales/pt-BR.ts:391-397`):

| área | frase |
|---|---|
| `purchases` | "Isso apaga {{what}}, e zera o custo médio de todos os insumos — eles ficam sem preço até a próxima nota. O movimento é o registro de tudo o que entrou e saiu: produção, contagem, perda e transferência vão junto." |
| `recipes` | "Isso apaga {{what}}, com todas as versões e linhas delas. O histórico de versões vai junto." |
| `inputs` | "Isso apaga {{what}}, junto com o custo médio e o histórico de preço deles." |
| `all` | "Isso apaga {{what}}. O aplicativo volta a abrir vazio, e os dados de exemplo não voltam sozinhos." |
| `products` (e o resto) | "Isso apaga {{what}}." (`erases`) |

O que cada área leva, segundo `tallyFor` (`src/data/erase.ts:246-268`):

| área | leva |
|---|---|
| `purchases` | `purchases` + **`movements`** (todo o livro-razão da empresa) |
| `recipes` | `recipes` |
| `products` | `products` |
| `inputs` | `inputs` + **`movements`** |
| `all` | os seis: `inputs`, `movements`, `recipes`, `products`, `purchases`, `places` |

A razão de `movements` viajar com `purchases` e com `inputs` está escrita:
"Uma contagem diz 'a prateleira tinha 300 g menos do que o livro-razão
esperava' — ela guarda a diferença, não a quantidade. Apague as entradas contra
as quais essa diferença foi medida e o que sobra é aritmética sobre nada"
(`src/data/erase.ts:110-117`, tradução do original em inglês). Essa é uma
cicatriz nomeada: a confirmação antiga dizia só que "zerava o custo médio" e não
dizia que um movimento ia (`src/data/erase.ts:57-73`).

##### `eraseArea` — a ordem das tabelas

`eraseArea(companyId, area)` (`src/data/repository.ts:3456-3509`):

1. Recalcula `countForErase` e lança `EraseBlockedError` se houver bloqueio —
   **recusa em vez de meio-apagar** (`src/data/repository.ts:3457-3458`).
2. Uma transação só, percorrendo `tablesFor(area)` na ordem literal.
3. `items` é a única tabela dividida entre duas áreas, então recebe
   `DELETE FROM items WHERE company_id = ? AND kind IN (?,?,…)` com
   `itemKindsFor(area)` — `['input','packaging','store_supply']` para `inputs`,
   `['product','resale']` para `products`, `null` para as outras
   (`src/data/erase.ts:174-178`; `src/data/repository.ts:3467-3473`).
4. Na área `products`, depois de apagar `products`, apaga também
   `items … kind IN ('product','resale')` (`src/data/repository.ts:3474-3479`).
5. `outbox` é apagada **sem** filtro de empresa (`DELETE FROM outbox`)
   (`src/data/repository.ts:3480-3481`).
6. `forgetOrphans(conn)` antes de enfileirar: sem isso, apagar as compras de
   exemplo deixava a fila apontando para movimentos que não existem mais, e o
   serializador travaria a fila para sempre (`src/data/repository.ts:3489-3496`).
7. `enqueue(conn, [{ table: 'erase', rowId: area, op: 'delete', payload: { area } }])`
   — enfileirado **depois** dos deletes, porque apagar tudo limpa a `outbox`; a
   unidade é a ÁREA, não a linha (`src/data/repository.ts:3498-3507`).

As listas de tabelas (`src/data/erase.ts:118-171`):

| área | tabelas, na ordem |
|---|---|
| `purchases` | `movements`, `purchase_lines`, `purchases`, `item_cost_history`, `item_costs` |
| `recipes` | `recipe_lines`, `recipe_versions`, `recipes` |
| `products` | `production_runs`, `order_lines`, `lots`, `products` |
| `inputs` | `movements`, `item_cost_history`, `item_costs`, `items` |
| `all` | `movements`, `readings`, `production_runs`, `order_lines`, `orders`, `lots`, `purchase_lines`, `purchases`, `products`, `product_types`, `product_lines`, `flavors`, `recipe_lines`, `recipe_versions`, `recipes`, `item_cost_history`, `item_costs`, `items`, `locations`, `outbox` |

O tipo `ErasableTable` é uma união fechada de 20 nomes exatamente para que
`DELETE FROM ${table}` seja provavelmente seguro pelo compilador e não por
revisão (`src/data/erase.ts:22-52`). Oito tabelas entraram na lista `all` em 4 de
setembro; a ausência não era cosmética — cinco apontam para `items` ou
`locations` com `ON DELETE RESTRICT`, e a partir da primeira corrida de produção
o SQLite levantava "FOREIGN KEY constraint failed", a transação voltava atrás, e
a tela mostrava o texto cru do SQLite em inglês
(`src/data/erase.ts:133-142`).

#### 21.1.4 Cartão 1 — "A cara do aplicativo": luz, identidade e paleta

`Card hue={palette.mist}`, ícone `GlyphSettings size={26}`, título
`t.app.settings.appearance.label` (`app/settings.tsx:533-541`).

Textos, nos três idiomas:

| chave | pt-BR | en | es |
|---|---|---|---|
| `appearance.label` | "A cara do aplicativo" | "How the app looks" | "La cara de la aplicación" |
| `appearance.hint` | "Duas identidades e três luzes. É escolha deste aparelho — não muda nada para mais ninguém." | "Two identities and three lights. This phone chooses — nothing changes for anyone else." | "Dos identidades y tres luces. Es la elección de este teléfono — no cambia nada para nadie más." |

(`src/i18n/locales/pt-BR.ts:419-421`, `en.ts:370-372`, `es.ts:375-377`)

##### A luz da tela (`scheme`) — três caminhos

Bloco em `app/settings.tsx:543-567`: rótulo
`t.app.settings.appearance.lightLabel` = "A luz da tela", dica
`lightHint` = "O padrão é o claro. Escolha o escuro para a câmara fria, ou deixe
o aparelho decidir." (`src/i18n/locales/pt-BR.ts:425-426`), e **três `Button`
lado a lado**, cada um em `flex: 1`, com `variant={scheme === qual ? 'primary' :
'ghost'}` (`app/settings.tsx:551-565`):

| valor gravado | rótulo pt-BR | rótulo en | rótulo es |
|---|---|---|---|
| `'claro'` | "Claro" | "Light" | "Claro" |
| `'escuro'` | "Escuro" | "Dark" | "Oscuro" |
| `'sistema'` | "Seguir o aparelho" | "Follow the phone" | "Seguir el teléfono" |

(`src/i18n/locales/pt-BR.ts:422-424`, `en.ts:373-375`, `es.ts:378-380`)

**Padrão: `'claro'`.** `SCHEME_PADRAO: SchemeChoice = 'claro'`, decisão do dono
de 4 de setembro, e a razão está escrita: "um aplicativo de fábrica é aberto na
mão de quem está trabalhando, e a luz da fábrica é acesa"
(`src/theme/scheme.ts:30-38`).

A resolução é uma função pura fora do componente, de propósito, para a suíte de
mutação alcançá-la (`src/theme/scheme.ts:19-23`):

```ts
export function resolveScheme(escolha: SchemeChoice, doAparelho: string | null | undefined): ColorScheme {
  if (escolha === 'claro') return 'light';
  if (escolha === 'escuro') return 'dark';
  return doAparelho === 'dark' ? 'dark' : 'light';
}
```
(`src/theme/scheme.ts:50-57`)

A regra em uma frase: **só `'dark'` escurece; qualquer outra resposta do aparelho
é claro** — inclusive `'unspecified'` e `null` (`src/theme/scheme.ts:40-48`).

Cicatriz registrada: isto não existia. O `ThemeProvider` lia `useColorScheme()`
e ponto, e o dono abriu o Papel num celular em modo escuro sem ter como trocar —
*"nao consigo mudar o tema papel de dark para o light"*
(`src/theme/scheme.ts:6-9`; `src/theme/Appearance.tsx:29-32`). O erro nomeado
não foi de código: era escolha do Claude disfarçada de regra do sistema, escrita
num comentário da própria tela de Ajustes (`app/settings.tsx:523-528`).

##### A identidade (`skin`) — duas peles

Bloco em `app/settings.tsx:569-596`: **dois `Button`** em `flex: 1`, com
`variant={skin === qual ? 'primary' : 'ghost'}`, e uma legenda por baixo em
`inkMuted` quando escolhida, `inkFaint` quando não:

| valor gravado | rótulo | dica pt-BR |
|---|---|---|
| `'organico'` | "Orgânico" / "Organic" / "Orgánico" | "paisagem, curva, cantos macios" |
| `'papel'` | "Papel" / "Paper" / "Papel" | "serifa, traço fino, cantos retos" |

(`src/i18n/locales/pt-BR.ts:427-430`; en: "serif, thin line, sharp corners" /
"landscape, curve, soft corners", `en.ts:379-381`)

**Padrão: `'organico'`** (`src/theme/Appearance.tsx:66`), "a identidade que ele
apontou primeiro entre as duas" (`src/theme/Appearance.tsx:26-27`). As duas peles
diferem em raio de canto e família de título:
`papel` → `radius {sm:4, md:6, lg:8, xl:10, pill:999}` e `titleFamily: 'serif'`;
`organico` → `radius {sm:12, md:18, lg:22, xl:28, pill:999}` e `titleFamily:
undefined` (`src/theme/tokens.ts:386-400`).

##### A paleta da paisagem (`hue`) — cinco cores, só no Orgânico

Bloco condicional: `{skin === 'organico' ? … : null}` (`app/settings.tsx:606`).
O Papel não tem paleta, e a razão está escrita: "revista impressa não vem em
cinco cores de capa" (`app/settings.tsx:598-600`;
`src/theme/Appearance.tsx:49-51`).

Rótulo `t.app.settings.appearance.palette` = "A cor da paisagem"; dica
`paletteHint` = "Muda o céu e a colina. Os sinais de alta e de queda não mudam —
eles são leitura, não enfeite." (`src/i18n/locales/pt-BR.ts:431-432`).

Cinco `Pressable` com `accessibilityRole="radio"`, cada um um disco de
`borderRadius: 22` pintado com `hues[qual].brand`, e o **tamanho** é o que marca
a escolha: 44×44 quando escolhida, 30×30 quando não (`app/settings.tsx:615-642`).
O disco é declaradamente a única cor escrita fora do tema em toda a tela, porque
ele não representa a paleta — ele **é** a amostra dela
(`app/settings.tsx:601-605`).

| `hue` | rótulo pt-BR / en / es | `brand` |
|---|---|---|
| `verde` | Verde / Green / Verde | `#2F7D5C` |
| `azul` | Azul / Blue / Azul | `#2E6DA4` |
| `ambar` | Âmbar / Amber / Ámbar | `#C2751F` |
| `terracota` | Terracota / Terracotta / Terracota | `#B4552D` |
| `lavanda` | Lavanda / Lavender / Lavanda | `#6B5FA8` |

(`src/i18n/locales/pt-BR.ts:433-439`, `en.ts:384-390`, `es.ts:389-395`;
`src/theme/tokens.ts:378-384`)

##### Como a escrita acontece

Os três `set*` do `AppearanceProvider` seguem o mesmo padrão: **estado primeiro,
disco depois, falha engolida** (`src/theme/Appearance.tsx:93-108`):

```ts
const setSkin = useCallback((next: Skin) => {
  setState(next);
  void writeMeta(KEY, next).catch(() => undefined);
}, []);
```

Motivo escrito: "esperar o disco para mudar uma cor faria o toque parecer
travado" (`src/theme/Appearance.tsx:94-95`). A leitura inicial é um
`Promise.all([readMeta(KEY), readMeta(HUE_KEY), readMeta(SCHEME_KEY)])` com
validação por lista — `savedSkin === 'papel' || 'organico'`, `HUES.includes`,
`SCHEMES.includes` — e `.catch(() => undefined)`, porque "a cara é enfeite;
falhar a leitura não pode impedir o aplicativo de abrir"
(`src/theme/Appearance.tsx:71-91`).

`useAppearance()` fora do provedor devolve os padrões em vez de lançar, para a
tela de erro poder se desenhar (`src/theme/Appearance.tsx:117-136`).

#### 21.1.5 Cartão 2 — "Idioma e moeda" (declarado da EMPRESA)

`Card hue={palette.mist}`, ícone `GlyphSettings`, título
`t.app.settings.language.label` (`app/settings.tsx:668-673`).

| chave | pt-BR | en | es |
|---|---|---|---|
| `language.label` | "Idioma e moeda" | "Language and currency" | "Idioma y moneda" |
| `language.hint` | "Escolha da empresa: vale para todo mundo que usa este sistema, não só para este aparelho. O fuso vem do celular, que está na fábrica." | "A company choice: it applies to everyone using this system, not just this phone. The time zone comes from the handset, which is at the factory." | "Elección de la empresa: vale para todos los que usan este sistema, no solo para este teléfono. La zona horaria viene del celular, que está en la fábrica." |
| `language.currency` | "Moeda" | "Currency" | "Moneda" |
| `language.currencyHint` | "Ela decide o símbolo E o jeito de escrever o número. O exemplo ao lado é a mesma quantia em cada uma." | "It decides the symbol AND how the number is written. The example beside each one is the same amount." | "Decide el símbolo Y cómo se escribe el número. El ejemplo al lado es la misma cantidad en cada una." |

(`src/i18n/locales/pt-BR.ts:413-418`, `en.ts:364-369`, `es.ts:369-374`)

##### Idioma — três botões

`LANGUAGES` é uma constante da tela, e **o nome de cada idioma está NA língua
dele**, porque quem procura o próprio idioma numa lista o reconhece escrito como
ele se escreve (`app/settings.tsx:105-116`):

```ts
const LANGUAGES: readonly (readonly [LanguageTag, string])[] = [
  ['pt-BR', 'Português'],
  ['es', 'Español'],
  ['en', 'English'],
];
```

Três `Button` em `flex: 1`, `variant={locale.language === qual ? 'primary' :
'ghost'}`, `onPress={() => setLanguage(qual)}` (`app/settings.tsx:678-688`).

##### Moeda — oito linhas com exemplo

Uma `ListRow` por moeda, na ordem literal de `CURRENCIES`
(`app/settings.tsx:700-715`):

- `label` = `` `${code} · ${t.currency[code]}` `` → "BRL · Real"
- `detail` = `formatMoney(123456, { ...locale, currency: code, formatting:
  formattingFor(locale.language, code) })` — **a mesma quantia, R$ 1.234,56,
  escrita como aquela moeda escreve**, com o separador e as casas dela
- `trailing` = `'✓'` na escolhida, `trailingTone` `'ok'` / `'muted'`
- `onPress` = `setCurrency(code)`

| código | região | nome pt-BR | nome en | nome es |
|---|---|---|---|---|
| `BRL` | `BR` | Real | Brazilian real | Real brasileño |
| `USD` | `US` | Dólar | US dollar | Dólar |
| `EUR` | `ES` | Euro | Euro | Euro |
| `MXN` | `MX` | Peso mexicano | Mexican peso | Peso mexicano |
| `ARS` | `AR` | Peso argentino | Argentine peso | Peso argentino |
| `CLP` | `CL` | Peso chileno | Chilean peso | Peso chileno |
| `COP` | `CO` | Peso colombiano | Colombian peso | Peso colombiano |
| `PYG` | `PY` | Guarani | Guarani | Guaraní |

(`src/i18n/company.ts:19-28`; `src/i18n/locales/pt-BR.ts:1137-1146`,
`en.ts:1020-1029`, `es.ts:1026-1035`)

##### Por que moeda e idioma são duas perguntas

A regra literal: **a moeda decide o FORMATO do número, não o idioma.** Espanhol
escreve `1.234,56` na Espanha e `1,234.56` no México — o mesmo idioma, ponto e
vírgula trocados (`src/i18n/company.ts:3-17`). Então:

```ts
export function formattingFor(language: LanguageTag, currency: string): string {
  if (language === 'pt-BR') return 'pt-BR';
  const region = CURRENCIES.find((c) => c.code === currency)?.region;
  return region ? `${language}-${region}` : language;
}
```
(`src/i18n/company.ts:43-47`)

E `formatMoney` é só `Intl.NumberFormat(locale.formatting, { style: 'currency',
currency: locale.currency }).format(cents / 100)` (`src/i18n/index.ts:96-101`).

##### Como o idioma e a moeda são montados

`localeFrom(stored, padrao)` valida cada peça isoladamente — idioma inválido na
gaveta não derruba a moeda (`src/i18n/company.ts:56-68`):

- `language`: só `'pt-BR'`, `'es'` ou `'en'`; senão o padrão
- `currency`: só se `isCurrency(stored.currency)`; senão o padrão
- `timeZone`: só se contiver `'/'`; senão o padrão
- `formatting`: sempre recalculado por `formattingFor(language, currency)`

O `LocaleProvider` lê as duas chaves em paralelo e usa o aparelho como **padrão,
não como escolha** (`src/i18n/Locale.tsx:53-76`):

```ts
const doAparelho: LocaleSettings = {
  language: detectLanguage(),
  currency: detectCurrency(),
  timeZone: detectTimeZone(),
  formatting: defaultLocale.formatting,
};
setLocale(localeFrom({ language, currency, timeZone: doAparelho.timeZone }, doAparelho));
```

Detecção (`src/i18n/device.ts`): `detectLanguage()` percorre
`getLocales()` e devolve `'pt-BR'` para qualquer tag começando com `pt`, `'es'`
para `es`, senão `'en'` (linhas 13-18). `detectCurrency()` devolve o primeiro
`currencyCode` que estiver na lista de oito, senão `'BRL'` (linhas 30-36).

`defaultLocale` (o padrão do produto, usado até a gaveta responder e na tela de
quebra) é `{ language: 'pt-BR', formatting: 'pt-BR', currency: 'BRL', timeZone:
'America/Sao_Paulo' }` (`src/i18n/index.ts:25-30`).

Cicatriz registrada: até 4 de setembro **nada levava ninguém aos outros dois
idiomas** — `useLocale()` devolvia uma constante, e `detectLanguage()` existia
sem chamador desde que foi escrita (`src/i18n/Locale.tsx:13-19`). E o fuso
chumbado em `America/Sao_Paulo` fazia uma fábrica em Manaus lançar o tacho das
22h no dia seguinte, na data que vai impressa na etiqueta do lote
(`src/i18n/Locale.tsx:32-34`; `src/i18n/device.ts:38-44`).

#### 21.1.6 Cartão 3 — "O que aparece na tela inicial"

`Card hue={palette.mist}`, ícone `GlyphCount size={26}`, título
`t.app.settings.briefing.label` (`app/settings.tsx:732-740`).

| chave | pt-BR | en | es |
|---|---|---|---|
| `briefing.label` | "O que aparece na tela inicial" | "What shows on the home screen" | "Qué aparece en la pantalla de inicio" |
| `briefing.hint` | "A ordem é da casa: todo mundo vê a mesma capa. Esconder é só neste aparelho." | "The order belongs to the house: everyone sees the same home. Hiding is only on this phone." | "El orden es de la casa: todos ven la misma portada. Ocultar es sólo en este teléfono." |
| `briefing.hidden` | "escondido aqui" | "hidden here" | "oculto aquí" |
| `briefing.show` / `hide` | "Mostrar" / "Esconder" | — | — |
| `briefing.up` / `down` | "Subir" / "Descer" | — | — |
| `briefing.offCover` | "FORA DA CAPA" | — | — |
| `briefing.putOnCover` | "Colocar na capa" | — | — |

(`src/i18n/locales/pt-BR.ts:441-450`)

**Duas listas, dois donos** (`app/settings.tsx:181-189`): `ordem` (empresa) e
`escondidos` (aparelho). Guardar as duas juntas faria a preferência de um virar
decisão do outro na primeira sincronização.

Carregamento: `Promise.all([briefingOrder(), briefingHidden()])`, e a ordem é
passada por `briefingLayout(salva, [])` — **com a lista de escondidos vazia**, de
propósito, para que a peça escondida continue aparecendo aqui, marcada
(`app/settings.tsx:192-202`).

##### O catálogo de peças

`BRIEFING_WIDGETS`, na ordem literal do catálogo
(`src/domain/briefing.ts:23-38`):

| # | id | rótulo pt-BR |
|---|---|---|
| 1 | `producao` | "Produção do dia" |
| 2 | `aoVivo` | "Produção ao vivo" |
| 3 | `historico` | "Últimas corridas" |
| 4 | `insumos` | "Insumo acabando" |
| 5 | `cobertura` | "Quanto tempo o estoque dura" |
| 6 | `pedidos` | "Pedidos dos clientes" |
| 7 | `entregaHoje` | "Quem recebe hoje" |
| 8 | `expedicao` | "Saiu para as lojas" |
| 9 | `validade` | "Vence primeiro" |
| 10 | `perdas` | "Perdas do mês" |
| 11 | `custo` | "Custo por unidade" |
| 12 | `precos` | "Preços que mexeram" |
| 13 | `clima` | "Tempo" |
| 14 | `parado` | "Dinheiro parado" |

(`src/i18n/locales/pt-BR.ts:451-466`)

**Duas nascem fora da capa:** `DEFAULT_OFF = new Set(['custo', 'parado'])`
(`src/domain/briefing.ts:58`). A razão é uma correção do dono que vale como regra
geral: dado disponível não é motivo para ocupar a primeira tela
(`src/domain/briefing.ts:42-56`).

`briefingLayout(companyOrder, hiddenOnDevice)` (`src/domain/briefing.ts:68-85`):

1. filtra da ordem da empresa só os ids que ainda existem no catálogo;
2. acrescenta no fim, na ordem do catálogo, as peças que a empresa nunca ordenou
   **e que não estão em `DEFAULT_OFF`** — é isso que permite acrescentar widget
   novo numa versão futura sem que todo mundo reconfigure;
3. remove as escondidas.

`widgetsOffCover(layout)` devolve o que existe e não está na capa
(`src/domain/briefing.ts:88-90`).

##### As quatro ações da linha

Cada linha de `ordem` (`app/settings.tsx:743-793`):

| controle | efeito | acessibilidade |
|---|---|---|
| nome | mostra `t.app.settings.briefing.widgets[widget]`, e ` · escondido aqui` concatenado quando escondido; tinta `inkFaint` se escondido (`app/settings.tsx:747-753`) | — |
| `Chip` Mostrar/Esconder | `trocarVisibilidade` — inclui/remove da lista `escondidos` e grava `setBriefingHidden` (`app/settings.tsx:223-229`) | `accessibilityRole="switch"`, `accessibilityState={{checked: !escondido}}`, label `` `${nome}: ${Mostrar|Esconder}` `` |
| chevron girado −90° | `mover(widget, 'up')`, `disabled` no índice 0, `opacity: 0.3` quando desabilitado (`app/settings.tsx:769-779`, `1146`) | `accessibilityRole="button"`, label `` `Subir: ${nome}` `` |
| chevron girado +90° | `mover(widget, 'down')`, `disabled` no último índice (`app/settings.tsx:780-790`, `1147`) | label `` `Descer: ${nome}` `` |

`mover` chama `moveWidget(ordem, widget, direcao)`, que troca a peça com a
vizinha e devolve a ordem intocada quando o destino sai da faixa
(`src/domain/briefing.ts:113-127`), e grava com `setBriefingOrder(nova)`
(`app/settings.tsx:204-208`).

**Seta em vez de arrastar, e não é preguiça:** arrastar pede pressão longa e
precisão, "que é o que menos existe numa mão de luva a −18 °C"
(`src/domain/briefing.ts:106-112`; `app/settings.tsx:728-731`).

##### A seção "FORA DA CAPA"

Só existe se `fora.length > 0` (`app/settings.tsx:800`). Uma linha por peça, com
um `Chip signal="neutral"` rotulado "Colocar na capa" e
`accessibilityRole="button"` (`app/settings.tsx:805-818`). O toque chama `ligar`,
que faz `addWidget(ordem, widget)` — **vai para a ordem da EMPRESA**, porque
acrescentar um cartão na primeira tela é decisão de casa; esconder continua sendo
do aparelho (`app/settings.tsx:210-221`; `src/domain/briefing.ts:92-104`).

Sem esta lista, "quem quiser liga" seria frase sem botão
(`app/settings.tsx:796-799`).

Uma regra do domínio que a tela não controla: **ligar não é forçar.** Peça ligada
que não tem o que dizer continua não aparecendo na capa; sem isso a capa enche de
"0 caixas hoje", que é a definição do alerta que ensina a ignorar alerta
(`src/domain/briefing.ts:18-21`).

#### 21.1.7 Cartão 4 — "Avisos no celular"

Existe só depois de `alertSettings()` responder (`app/settings.tsx:832-833`).
`Card hue={palette.mist}`, ícone `GlyphThermometer size={26}`, título
`t.app.settings.alerts.label` (`app/settings.tsx:834-838`).

| chave | pt-BR | en | es |
|---|---|---|---|
| `alerts.label` | "Avisos no celular" | "Alerts on the phone" | "Avisos en el celular" |
| `alerts.hint` | "Cada aviso liga e desliga aqui. Os que se veem chegando avisam com dias de antecedência; os de faixa comparam com a régua que você cadastrar. O aplicativo avisa na data em que ainda dá para decidir, não na do problema." | idem (en, `en.ts:421`) | idem (es, `es.ts:426`) |

(`src/i18n/locales/pt-BR.ts:468-477`)

A dica tem cicatriz escrita: a versão anterior dizia "Cada aviso liga sozinho" e
"você escolhe a antecedência", e as duas eram falsas — o volume nasce desligado,
e as duas linhas de faixa não têm antecedência nenhuma
(`src/i18n/locales/pt-BR.ts:470-476`).

##### Os cinco alarmes

A tela itera literalmente `['ambiente', 'insumo', 'pedido', 'validade',
'volume']` (`app/settings.tsx:844`), que é ordem de tela e **não** a ordem do
tipo `AlertKind = 'insumo' | 'pedido' | 'volume' | 'validade' | 'ambiente'`
(`src/domain/alerts.ts:30`).

| `AlertKind` | rótulo pt-BR | padrão `on` | antecedência padrão | dica de segunda linha |
|---|---|---|---|---|
| `ambiente` | "Câmara fora da faixa" | **`true`** | não tem | `ambienteHint` |
| `insumo` | "Insumo acabando" | `true` | 3 dias | `daysAhead` interpolado |
| `pedido` | "Pedido sem estoque" | `true` | 2 dias | `daysAhead` interpolado |
| `validade` | "Lote perto de vencer" | `true` | 7 dias | `daysAhead` interpolado |
| `volume` | "Volume fora da faixa" | **`false`** | não tem | `volumeHint` |

(`src/i18n/locales/pt-BR.ts:478-484`; `src/domain/alerts.ts:108-119`)

`DEFAULT_ALERTS` por extenso (`src/domain/alerts.ts:108-119`):

```ts
export const DEFAULT_ALERTS: AlertSettings = {
  on: { insumo: true, pedido: true, volume: false, validade: true, ambiente: true },
  daysAhead: { insumo: 3, pedido: 2, validade: 7 },
  bands: { red: 25, yellow: 40, blue: 80, notifyFull: false },
  minuteOfDay: 7 * 60,
  weekdays: 0,
};
```

Por que `ambiente` nasce ligado e `volume` não: "o custo do erro — câmara fora de
faixa estraga o estoque inteiro em uma noite, e o aviso não depende de nenhuma
régua que alguém precise cadastrar antes" (`src/domain/alerts.ts:109-113`).
Almoxarifado cheio depois de uma compra é estado **desejado**, e aviso diário
sobre estado desejado é o alerta que ensina a ignorar alerta
(`src/domain/alerts.ts:66-77`).

Para cada linha, a tela decide se há antecedência:

```ts
const dias = kind === 'volume' || kind === 'ambiente' ? null : alerts.daysAhead[kind];
```
(`app/settings.tsx:849-850`) — "antecedência é para o que se vê chegando; faixa é
para o que já aconteceu" (`app/settings.tsx:846-848`).

O interruptor é um `Chip` dentro de `Pressable` com
`accessibilityRole="switch"`; o rótulo é `t.app.settings.alerts.on` = "Ligado" ou
`off` = "Desligado", e o `signal` é `'ok'` / `'neutral'`
(`app/settings.tsx:868-882`). Toda mudança passa por `mexerAlerta(proximo)`, que
grava o objeto inteiro e chama `refreshAlerts()`
(`app/settings.tsx:255-258`).

##### Os sub-controles condicionais

**"Avisar quando encher"** aparece só quando `kind === 'volume' && ligado`
(`app/settings.tsx:889`). Alterna `alerts.bands.notifyFull`, é um `Chip` com
rótulo `t.app.settings.alerts.notifyFull` = "Avisar quando encher",
`accessibilityRole="switch"`, alinhado à esquerda (`styles.left`)
(`app/settings.tsx:890-910`). Padrão desligado.

**A antecedência** aparece só quando `ligado && dias !== null`
(`app/settings.tsx:916`). São **seis `Chip` fixos: 1, 2, 3, 5, 7 e 14**, cada um
`accessibilityRole="radio"` com `accessibilityState={{ selected: d === dias }}`,
rótulo `formatQuantity(d, locale)` (`app/settings.tsx:918-936`). Oferecer o
ajuste de um alarme desligado é pedir decisão sobre coisa que não vai acontecer
(`app/settings.tsx:913-915`).

##### A hora e os dias, que valem para todos os avisos

Sobrelinha `t.app.settings.alerts.hour.toUpperCase()` → "HORA DO AVISO"
(`app/settings.tsx:950-952`). Dois `Field` numéricos lado a lado
(`app/settings.tsx:953-984`):

| campo | rótulo | valor exibido | validação |
|---|---|---|---|
| hora | `alerts.hourField` = "Hora" | `String(Math.floor(alerts.minuteOfDay / 60))` | `parseTyped`; rejeita `null`, `< 0`, `> 23`; grava `Math.trunc(h) * 60 + (minuteOfDay % 60)` |
| minuto | `alerts.minuteField` = "Minuto" | `String(alerts.minuteOfDay % 60).padStart(2, '0')` | `parseTyped`; rejeita `null`, `< 0`, `> 59`; grava `Math.floor(minuteOfDay / 60) * 60 + Math.trunc(m)` |

Dica: `alerts.hourHint` = "Antes do turno começar. Aviso de madrugada é
despertador, e aparelho que acorda a pessoa vira aparelho silenciado."
(`src/i18n/locales/pt-BR.ts:492`).

`minuteOfDay` é **um** número de 0 a 1439, e não hora+minuto separados, porque é
UM fato ("às 5h30") e dois campos no tipo abrem a porta para um estado impossível
como hora 5, minuto 90 (`src/domain/alerts.ts:80-97`). Padrão `7 * 60` = 420 (sete
da manhã).

Cicatriz escrita: era uma lista de seis horas escolhidas pelo Claude (5, 6, 7, 8,
12, 18) e o dono cortou — "nem toda fábrica funciona igual"; seis opções não são
configuração, são um menu disfarçado, e a fábrica que começa às 5h30 não estava
em nenhuma delas (`app/settings.tsx:944-948`; `src/domain/alerts.ts:82-87`).

Sobrelinha `alerts.weekdays.toUpperCase()` → "EM QUE DIAS", e **sete `Chip`**,
índices 0 a 6, rótulo `formatWeekdayShort(dia, locale)`
(`app/settings.tsx:989-1013`). O aceso é
`alerts.weekdays !== 0 && agreedOn(alerts.weekdays, dia)` — **zero é TODOS os
dias, então nenhum chip aceso significa todos** (`app/settings.tsx:993-995`).
Quando `weekdays === 0`, aparece a legenda `alerts.everyDay` = "todos os dias"
(`app/settings.tsx:1014-1018`).

O campo de bits é o mesmo de `src/domain/agreement.ts`:
`WEEK_BITS = [1, 2, 4, 8, 16, 32, 64]`, **bit 0 no domingo**, a mesma numeração
de `Date.getDay()` (`src/domain/agreement.ts:16-17`). `toggleDay(days, weekday) =
days ^ WEEK_BITS[weekday]` (`src/domain/agreement.ts:42-44`), e `agreedOn` é
`(days & WEEK_BITS[weekday]) !== 0` (linhas 37-39). Um dia fora de 0..6 lança
`RangeError('a semana tem sete dias, e N não é um deles')`
(`src/domain/agreement.ts:29-34`).

`formatWeekdayShort` monta a data de um domingo conhecido —
`Date.UTC(2026, 8, 6)` — e soma `weekday * 86_400_000`, formatando em
`weekday: 'short'`, `timeZone: 'UTC'` (`src/i18n/index.ts:239-245`).

##### Leitura e escrita tolerantes

`alertSettings()` faz `readMeta('alerts.settings')` e, se houver texto, um
`JSON.parse` dentro de `try`. A reconstrução é campo a campo
(`src/data/repository.ts:3939-3962`):

- `on`, `daysAhead`, `bands`: espalhados **sobre** os padrões, então campo
  faltando cai no padrão e campo estranho é ignorado
- `minuteOfDay`: aceito só se for `number` entre 0 e 1439, e então `Math.trunc`
- `weekdays`: aceito só se for `number` entre 0 e 127, e então `Math.trunc`
- `catch` devolve `DEFAULT_ALERTS` inteiro

A razão está escrita: "um aviso que deixa de sair porque a configuração não pôde
ser lida é o pior desfecho possível — o dono descobre no dia em que faltar polpa"
(`src/data/repository.ts:3933-3937`).

`setAlertSettings` grava `JSON.stringify(settings)` na mesma chave
(`src/data/repository.ts:3964-3966`).

##### Quem consome esses ajustes

`src/notify/Alerts.tsx` é um componente que não desenha nada e existe para a
regra de alarme ter chamador; ele monta acima de toda tela
(`app/_layout.tsx:119`) e chama `rescheduleAlerts(locale.timeZone, alert =>
alertPhrase(alert, t))` a cada abertura (`src/notify/Alerts.tsx:23-41`).

`rescheduleAlerts` (`src/notify/index.ts:71-112`):

1. sem biblioteca de notificação → `{ scheduled: false, reason: 'sem-suporte' }`
2. sem permissão → `reason: 'sem-permissao'`
3. `alertSettings()` + `factsForAlerts(timeZone)` → `alertsDue(facts, settings)`
4. `cancelAllScheduledNotificationsAsync()` sempre, antes de agendar
5. nada a avisar → `reason: 'nada-a-avisar'`
6. `nextAlertAt(settings, new Date())` → sem dia alcançável em 8 dias →
   `reason: 'sem-dia-alcancavel'`
7. `alertsRunToday(settings, quando.getDay())` falso → `reason: 'fora-dos-dias'`
8. **agenda UM aviso, não sete** — o mais urgente, porque "a bandeja com sete
   linhas do mesmo aplicativo é a bandeja que a pessoa limpa sem ler"
   (`src/notify/index.ts:98-105`)

`alertsRunToday`: `weekdays === 0` → sempre verdadeiro; fora de 0..6 → falso;
senão `(weekdays & (1 << weekday)) !== 0` (`src/domain/alerts.ts:324-328`).
`nextAlertAt` procura até 8 dias à frente, ajusta a hora com
`setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0)`, e nunca devolve
instante no passado (`src/domain/alerts.ts:337-352`).

##### Uma chave de dicionário sem chamador

`t.app.settings.alerts.never` = "Este aparelho não deu permissão de aviso. O
aplicativo continua inteiro — a capa mostra as mesmas contas."
(`src/i18n/locales/pt-BR.ts:497`). Busca em `src/` e `app/` não encontra nenhum
uso de `alerts.never` fora dos três arquivos de dicionário: **implementado (nos
três idiomas) mas sem chamador**. A tela nunca mostra o estado
`sem-permissao` que `rescheduleAlerts` sabe devolver.

#### 21.1.8 Cartão 5 — "Pedido precisa de aprovação"

O cartão inteiro é o interruptor: um `Pressable` envolvendo o `Card`, com
`accessibilityRole="switch"` e `accessibilityState={{ checked: Boolean(approval)
}}` (`app/settings.tsx:1027-1052`).

`Card hue={palette.sage}` — e o tom é do **assunto**, não da tela: pedido é
`sage` em todo o aplicativo, e `sage` é a área "purchasing"
(`app/settings.tsx:1024-1026,1038`; `src/theme/tokens.ts:41`). Ícone
`GlyphOrder size={26}`.

| chave | pt-BR | en | es |
|---|---|---|---|
| `approval.label` | "Pedido precisa de aprovação" | "Orders need approval" | "El pedido necesita aprobación" |
| `approval.hint` | 'Ligado, todo pedido novo aparece como "espera aprovação" até alguém aprovar. Ele já entra na conta do que falta produzir: quem espera a aprovação para começar descobre tarde.' | (`en.ts:445`) | (`es.ts:450`) |
| `approval.on` / `off` | "Ligado" / "Desligado" | "On" / "Off" | "Activado" / "Desactivado" |

(`src/i18n/locales/pt-BR.ts:499-504`, `en.ts:443-448`, `es.ts:448-453`)

O toque faz `await setOrdersNeedApproval(!approval)` e depois
`refreshApproval()` (`app/settings.tsx:1029-1032`).

Persistência: chave `orders.needApproval`, valor `'1'` ou `'0'`, e a leitura é
`(await readMeta(APPROVAL_KEY)) === '1'` — qualquer outra coisa é falso
(`src/data/repository.ts:3968-3984`). **Padrão desligado**, "porque a fábrica de
seis pessoas é o caso que este produto tem na mão"
(`src/data/repository.ts:3970-3977`).

Consumidor: `saveOrder` decide o estado inicial do pedido com
`const status: OrderStatus = (await ordersNeedApproval()) ? 'pending' : 'open'`
(`src/data/repository.ts:4000`), sobre `OrderStatus = 'pending' | 'open' |
'delivered' | 'cancelled'` (`src/data/repository.ts:3871`).

No servidor o mesmo fato tem coluna própria:
`companies.orders_need_approval boolean not null default false`
(`supabase/migrations/0019_an_order_is_demand.sql:39-44`). **As duas casas
existem e nada as liga**: o aparelho grava em `app_meta`, o Postgres tem a
coluna, e nenhum código lê uma a partir da outra.

#### 21.1.9 Cartão 6 — "Começar do zero"

Só existe quando `!loading && total > 0` (`app/settings.tsx:1059`), porque "um
botão desabilitado é a reclamação que a Lei 5 proíbe"
(`app/settings.tsx:1055-1058`).

`Card hue={color.danger}`, ícone `GlyphLoss size={26}`, título
`t.app.settings.startOver` = "Começar do zero" / "Start over" / "Empezar de cero"
(`app/settings.tsx:1061-1065`; `src/i18n/locales/pt-BR.ts:347`, `en.ts:304`,
`es.ts:309`).

Corpo: `t.app.settings.startOverHint` = "Apaga tudo de uma vez, na ordem certa.
Depois disso o aplicativo abre vazio e o exemplo não volta sozinho."
(`src/i18n/locales/pt-BR.ts:348-349`).

Botão: `variant="ghost"` — **fantasma, sempre**, porque "botão grande e colorido
convida, e ninguém deve ser convidado a apagar tudo"
(`app/settings.tsx:1055-1057,1069-1075`). Rótulo alterna entre
`t.app.settings.eraseAll` = "Apagar tudo" e `t.app.settings.erasing` =
"Apagando…" enquanto `busy`. `disabled={busy || !counts}`. `onPress` chama
`run('all', t.app.settings.eraseAll)`.

#### 21.1.10 Cartão 7 — "Dados de exemplo" (o estado vazio)

Só existe quando `total === 0 && !loading` (`app/settings.tsx:1083`).

`Card hue={palette.mist}`, ícone `GlyphCatalog`, título
`t.app.settings.exampleTitle` = "Dados de exemplo" / "Example data" / "Datos de
ejemplo" (`app/settings.tsx:1085-1088`).

- Se **não** há exemplo (`!data?.example`): `Chip signal="neutral"` com
  `t.app.settings.emptyNoExample` = "Vazio, sem exemplo"
  (`app/settings.tsx:1090-1092`).
- Texto: `t.app.settings.exampleEmpty` = "Está vazio. Se quiser ver o aplicativo
  funcionando antes de cadastrar o seu, dá para trazer o exemplo de volta."
  (`src/i18n/locales/pt-BR.ts:359-360`).
- Botão `variant="ghost"`, rótulo `t.app.settings.restore` = "Restaurar dados de
  exemplo", `disabled={busy}` (`app/settings.tsx:1096-1102`).

`restore()` (`app/settings.tsx:321-345`): confirma com título
`restoreTitle` = "Trazer o exemplo de volta?", mensagem `restoreBody` =
"Recoloca os insumos, a receita e o produto de demonstração, com as compras que
dão o custo a eles. Só funciona se estiver vazio.", botão `restoreConfirm` =
"Restaurar" (`src/i18n/locales/pt-BR.ts:369-372`). Depois chama
`restoreStarterData()` e `refresh()`. No erro, `failedToRestore` = "Não deu para
restaurar" com `acknowledge: true`.

`restoreStarterData(companyId = LOCAL_COMPANY_ID)` é `writeStarterData` sem a
checagem de marca (`src/data/seed.ts:43-46`), e `writeStarterData` **nunca
escreve sobre dado que já existe**: se `COUNT(*) FROM items WHERE company_id = ?`
for maior que zero, ele só marca `seeded` e retorna
(`src/data/seed.ts:96-107`). Todo número do exemplo entra por `recordPurchase`, o
mesmo evento que move o custo médio, "então nada no aplicativo está olhando para
cifras que não poderiam ter vindo de uma nota" (`src/data/seed.ts:24-37`).

#### 21.1.11 Cartão 8 — "Plantar duas semanas de movimento"

Só existe quando `total > 0 && !loading` (`app/settings.tsx:1110`). Fica embaixo
do que apaga e do que restaura porque é da mesma família: mexe no que está
guardado e diz antes o que vai fazer (`app/settings.tsx:1107-1109`).

`Card hue={palette.mist}`, ícone `GlyphCalendar size={26}`, título
`t.app.settings.simulate` = "Plantar duas semanas de movimento" / "Plant two
weeks of movement" / "Sembrar dos semanas de movimiento"
(`app/settings.tsx:1112-1115`; `src/i18n/locales/pt-BR.ts:362`, `en.ts:319`,
`es.ts:324`).

Corpo e mensagem de confirmação são o **mesmo** texto, `simulateBody`
(`app/settings.tsx:1118`, `364`):

> "Escreve catorze dias de fábrica em cima do que já existe: produção quase todo
> dia, entregas para a loja, e notas de compra com o preço variando. Serve para
> ver as telas com movimento — o livro-razão fica com esses lançamentos, e apagar
> tudo continua sendo em Ajustes."
> (`src/i18n/locales/pt-BR.ts:364-365`)

`onSimulate()` (`app/settings.tsx:359-393`):

1. confirma com título `simulateTitle` = "Encher o app com duas semanas?",
   mensagem `simulateBody`, botão `simulateConfirm` = "Plantar";
2. `const feito = await simulateFortnight(LOCAL_COMPANY_ID, { timeZone:
   locale.timeZone })`;
3. `refresh()`;
4. abre um segundo diálogo de reconhecimento com título "Plantar" e mensagem
   `fill(simulateDone, { runs, deliveries, invoices })` — "Pronto: {{runs}}
   corridas, {{deliveries}} entregas e {{invoices}} notas."
   (`src/i18n/locales/pt-BR.ts:367`);
5. no erro, `failedToSimulate` = "Não deu para plantar o movimento".

`simulateFortnight(companyId = LOCAL_COMPANY_ID, options)` aceita
`{ days?, seed?, timeZone?, at? }` com padrões `days = 14`, `seed = 20260901`,
`timeZone = 'America/Sao_Paulo'`, `at = nowIso()`
(`src/data/simulate.ts:72-86`), e devolve
`Simulation = { days, runs, deliveries, invoices }`
(`src/data/simulate.ts:46-51`). Lança
`Error('não há produto com receita para simular')` quando nenhum produto tem
receita (`src/data/simulate.ts:88-89`), cria "Loja Centro" (`kind:
'own_store'`) se não houver um segundo lugar (`src/data/simulate.ts:93-96`), e
escreve **do mais antigo para o mais novo** para que cada custo congelado seja o
custo verdadeiro daquele dia (`src/data/simulate.ts:103-105`). Domingo é dia
quieto (`src/data/simulate.ts:110-112`).

A razão de existir está escrita: "o exemplo que vem de fábrica tem um dia de
idade e nunca se moveu: prova que a tela desenha, não que ela diz alguma coisa"
(`app/settings.tsx:347-358`).

#### 21.1.12 Estilos locais da tela

Sete entradas, e nenhuma delas desenha caixa (`app/settings.tsx:1138-1148`):

```ts
row:    { flexDirection: 'row', alignItems: 'center' },
top:    { flexDirection: 'row', alignItems: 'flex-start' },
bottom: { flexDirection: 'row', alignItems: 'flex-end' },
left:   { alignSelf: 'flex-start' },
wrap:   { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
up:     { transform: [{ rotate: '-90deg' }] },
down:   { transform: [{ rotate: '90deg' }] },
```

O docblock da tela registra o que **saiu**: sete retângulos de parágrafo cinza,
cada um com `borderWidth`, `borderRadius` e `backgroundColor` próprios, incluindo
uma família de pílulas desenhadas à mão para os dias de antecedência e para os
dias da semana — nada disso sabia que o aplicativo tem duas caras, e no Papel as
caixas continuavam aparecendo (`app/settings.tsx:68-96`). E registra a mudança
estrutural: a contagem e a exclusão **viraram a mesma lista**, porque duas listas
com os mesmos quatro nomes obrigaram o e2e a ter um comentário explicando qual
"Produtos" clicar (`app/settings.tsx:79-84`).

#### 21.1.13 O que a tela de Ajustes NÃO tem

Itens que o mandato deste dossiê pergunta e que **não existem na tela**:

| item | estado | evidência |
|---|---|---|
| `names_who_recorded` — o relatório nomear quem registrou | **planejado / só no servidor.** A coluna existe: `alter table companies add column names_who_recorded boolean not null default false` (`supabase/migrations/0012_who_or_where.sql:20-21`), com `comment on column` dizendo "Se os relatórios operacionais mostram quem registrou. O ledger sempre grava; isto decide se a tela conta. Padrão falso: localizar a perda, não acusar." (linhas 23-25). **Nenhum arquivo em `src/` ou `app/` lê ou escreve esse nome** — a busca só o encontra em migrações, num comentário de `src/sync/serialize.test.ts:88`, no `CLAUDE.md:330` e em `docs/`. NÃO IMPLEMENTADO no aplicativo. |
| modo de entrada no chão de fábrica (PIN compartilhado vs pessoal) | **planejado / só no servidor.** `create type floor_sign_in as enum ('personal', 'shared')` e `alter table companies add column floor_sign_in floor_sign_in not null default 'personal'` (`supabase/migrations/0011_joining_a_company.sql:65-68`), com o motivo escrito: "uma fábrica dá um celular por pessoa, outra tem um aparelho pendurado na câmara fria que passa de mão em mão. Os dois caminhos existem no produto e a empresa escolhe. O padrão é `personal` porque é o que não exige preparo nenhum" (linhas 57-64). Não há tela, não há grade de nomes, não há PIN em código: busca por `pin`, `shared_device`, `entry_mode`, `floorEntry`, `sharedPin` em `src/`, `app/` e `supabase/` não encontra nada além de `useSharedValue` (`src/components/Sky.tsx:107`) e comentários não relacionados. NÃO IMPLEMENTADO. |
| código de convite da empresa (`join_code`) | **só no servidor**: `alter table companies add column join_code text unique` (`supabase/migrations/0011_joining_a_company.sql:55`). Sem tela. NÃO IMPLEMENTADO no aplicativo. |
| escolher pessoas / operadores | NÃO IMPLEMENTADO, e a razão está escrita na tela vizinha: `"Pessoas" falta pelo mesmo motivo: operator_id é coluna sem tabela de gente atrás` (`app/(tabs)/more.tsx:38`). A coluna existe no aparelho: `ALTER TABLE movements ADD COLUMN operator_id TEXT` (`src/data/db.ts:322`). |
| login, conta, empresa | NÃO IMPLEMENTADO. Há uma empresa local só, `LOCAL_COMPANY_ID` (`src/data/seed.ts:7-12`), e o assistente assume que quem segura o aparelho é o dono (`app/assistant.tsx:71-79`). |
| ajustes de sincronização / servidor | NÃO ESTÁ NO CÓDIGO desta tela. |
| faixas de volume (`bands.red/yellow/blue`) editáveis | **não editáveis aqui.** Os três números existem no tipo e no padrão (25 / 40 / 80, `src/domain/alerts.ts:60-63,116`), mas a tela só oferece `notifyFull`. As faixas são cadastradas por item ("Compara com a faixa que você cadastrar no item", `src/i18n/locales/pt-BR.ts:488`). |
| escolher a permissão de notificação | NÃO IMPLEMENTADO na tela; a permissão é pedida por `rescheduleAlerts` na abertura (`src/notify/index.ts:80-83`), e a frase que explicaria a negativa (`alerts.never`) não tem chamador. |

#### 21.1.14 O que o e2e afirma sobre esta tela

Seis checagens em `e2e/flow.mjs` dirigem `/settings` num navegador de verdade:

| linha | checagem | o que afirma |
|---|---|---|
| 301 | "settings counts what erasing would take, in Portuguese" | a versão do `app.json` aparece na sobrelinha; "O que está guardado", "Insumos", "Inclui os dados de exemplo", "Lojas e clientes"; e `doesNotMatch(/\bDelete\b\|\bSettings\b\|\bErase\b/)` (`e2e/flow.mjs:301-341`) |
| 1496 | "two weeks can be planted from Ajustes…" | "Plantar duas semanas de movimento" e "o livro-razão fica com esses lançamentos" na tela; depois de plantar, a capa passa a dizer "Mudou desde a última vez" (`e2e/flow.mjs:1496-1538`) |
| 1668 | "the app speaks the three languages…" | "Idioma e moeda", "Escolha da empresa", "BRL · Real", "Peso mexicano"; clicar em "English" troca a tela **inteira** ("Language and currency", "What is stored", e nada de "O que está guardado"); a escolha sobrevive a sair para `/inputs` (`e2e/flow.mjs:1668-1711`) |
| 1713 | "the app has two faces…" | "A cara do aplicativo", "Orgânico", "Papel"; no Papel **não** aparece "A cor da paisagem"; no Orgânico aparece, com "Terracota" (`e2e/flow.mjs:1713-1752`) |
| 1754 | "the app opens light even on a phone set to dark…" | com `emulateMedia({ colorScheme: 'dark' })`, a luminância do maior elemento opaco abre > 0.6; "A luz da tela", "Claro", "Escuro", "Seguir o aparelho"; "Escuro" leva a < 0.3 e sobrevive a sair e voltar; "Seguir o aparelho" com o celular escuro dá < 0.3 (`e2e/flow.mjs:1754-1838`) |
| 1840 | "the home is assembled from pieces the house chose" | "O que aparece na tela inicial", "Produção do dia", "Tempo", "Produção ao vivo"; esconder "Tempo" por `getByLabel(/^Tempo: (Esconder\|Mostrar)$/)` marca "escondido aqui" e tira o cartão da capa; "FORA DA CAPA" traz "Custo por unidade" ou "Dinheiro parado" (`e2e/flow.mjs:1840-1907`) |
| 1909 | "erasing refuses in an order, and explains the way out" | as duas frases de bloqueio na tela; `getByLabel('Apagar Produtos')` abre "Apagar produtos?" com "Isso apaga 1 produto" e "Isso não tem volta" (`e2e/flow.mjs:1909-1926`) |

---

### 21.2 `app/assistant.tsx` — Modo Conversa

`AssistantScreen` envolve `<Conversation />` num `AreaProvider area="sky"`
(`app/assistant.tsx:63-69`); `sky` é a área "home" (`src/theme/tokens.ts:36`).

O que a tela é, pelo próprio docblock: "não é uma versão reduzida do
aplicativo — é outra porta para a mesma casa, com o mesmo dado, as mesmas
permissões e as mesmas ações. Existe porque quem é dono da fábrica não deveria
ter de aprender a navegar: ele pergunta" (`app/assistant.tsx:21-27`, tradução do
original em inglês).

Três regras visíveis na tela (`app/assistant.tsx:28-33`):

1. toda cifra mostrada foi calculada pelo motor, e `[por quê?]` abre a
   aritmética;
2. uma frase que gravaria algo enche um cartão e **espera** — nada chega ao
   livro-razão sem um sim humano;
3. o que a pessoa não pode ver nunca é buscado, então não há o que vazar.

#### 21.2.1 Cabeçalho e estado

`CollapsingHeader title={t.app.assistant.title} overline={t.app.assistant.overline}`
(`app/assistant.tsx:166`) → "Pergunte" / "modo conversa"
(`src/i18n/locales/pt-BR.ts:1029-1030`).

Estado local (`app/assistant.tsx:81,92-94`):

```ts
type Turn = { question: string; answer: Answer; open: boolean; applied: boolean };

const [question, setQuestion] = useState('');
const [turns, setTurns] = useState<Turn[]>([]);
const [thinking, setThinking] = useState(false);
```

Permissões: uma constante de módulo, `CAPABILITIES = capabilitiesFor('owner')`
(`app/assistant.tsx:79`). O comentário nomeia a fronteira: "até o login existir,
quem segura este telefone é o dono", e o conjunto vem da tabela de papéis em vez
de ser digitado ali, porque "uma lista escrita à mão ao lado de uma tabela de
papéis são duas respostas para uma pergunta, e a escrita à mão já estava
esquecendo três capacidades que o dono tem" (`app/assistant.tsx:71-78`).

`capabilitiesFor('owner')` devolve **todas as doze**: `view_cost`,
`view_sale_price`, `record_production`, `dispatch`, `check_receipt`,
`record_loss`, `place_order`, `approve_order`, `adjust_stock`, `view_finance`,
`issue_invoice`, `manage_company` (`src/domain/access.ts:26-39,70-72,114-116`).

Contexto passado ao motor (`app/assistant.tsx:96-103`):

```ts
const context = useMemo(() => ({
  data: liveData(LOCAL_COMPANY_ID, locale.timeZone),
  capabilities: CAPABILITIES,
  locale: defaultLocale,
}), [locale.timeZone]);
```

Nota de precisão: `locale` do contexto é `defaultLocale` (pt-BR / BRL /
America/Sao_Paulo, `src/i18n/index.ts:25-30`) e **não** o locale escolhido pela
empresa. Isso é coerente com a fronteira registrada no topo do módulo: o
assistente fala português só, e traduzir as respostas seria meio trabalho — as
perguntas continuariam chegando num idioma só, e "um assistente que responde em
espanhol mas só entende português é pior do que um honestamente monolíngue"
(`src/assistant/index.ts:7-22`). O `timeZone`, porém, é o de verdade, e ele entra
por `liveData` porque o lote nasce com a data de calendário da fábrica
(`src/data/assistantData.ts:55-67`).

#### 21.2.2 Cartão "perguntar"

`Reveal index={0}`, `Card hue={palette.sky}` com ícone `GlyphAssistant size={26}`
e **sem título** — o cabeçalho já diz "Pergunte", e repetir a palavra num crachá
é rótulo inventado (`app/assistant.tsx:167-172`).

- `Field label={t.app.assistant.inputLabel}` = "Sua pergunta", com
  `placeholder={t.app.assistant.placeholder}` = "quanto custa o picolé de
  morango" (`app/assistant.tsx:173-178`; `src/i18n/locales/pt-BR.ts:1031-1032`)
- `Button` rotulado `t.app.assistant.ask` = "Perguntar", ou
  `t.app.assistant.thinking` = "Vendo…" enquanto pensa;
  `disabled={thinking || question.trim().length === 0}`
  (`app/assistant.tsx:179-184`; `src/i18n/locales/pt-BR.ts:1033-1034`)

`send(text)` (`app/assistant.tsx:107-134`): faz `trim`, sai calado se vazio ou se
`thinking`, limpa o campo, liga `thinking`, chama `ask(asked, context)`, e
**empilha o turno na frente da lista** (`[novo, ...prev]`). No `catch`, o turno é
empilhado igual, com o texto
`fill(t.app.assistant.trouble, { error })` = "Deu problema aqui: {{error}}"
(`src/i18n/locales/pt-BR.ts:1047`). `finally` desliga `thinking`.

#### 21.2.3 Cartão "o que se pode perguntar" — o estado vazio

Só existe quando `turns.length === 0` (`app/assistant.tsx:194`), e é
declaradamente a primeira coisa que todo mundo vê
(`app/assistant.tsx:188-193`).

`Card` sem tom e sem crachá; sobrelinha
`t.app.assistant.examplesTitle.toLocaleUpperCase(locale.formatting)` → "EU SEI
RESPONDER, POR EXEMPLO" (`app/assistant.tsx:196-199`;
`src/i18n/locales/pt-BR.ts:1035`).

Depois, **uma `ListRow` por exemplo**, e cada linha **manda a própria frase**:
`onPress={() => send(example)}` (`app/assistant.tsx:200-202`). Então a lista não
ensina — ela responde, e ninguém precisa digitar para descobrir.

Os exemplos vêm de `knownSkills(CAPABILITIES).map(s => s.example)`
(`app/assistant.tsx:105`), que filtra o registro por capacidade:
`registry.filter(s => !s.requires || capabilities.has(s.requires))`
(`src/assistant/index.ts:38-40`). Com o papel `owner`, **todas as 17 passam.**

O registro é `[...phase1Skills]` (`src/assistant/index.ts:30`), e a ordem do
array **é** a ordem de tentativa e a ordem da lista
(`src/assistant/skills.ts:1073-1100`):

| # | `id` | `example` (o que a linha mostra e envia) | `requires` | `route` da resposta |
|---|---|---|---|---|
| 1 | `register_purchase` | "comprei 4 sacos de açúcar por 236" | `place_order` | `/purchase` |
| 2 | `register_input` | "cadastrar polpa de morango, balde 10 kg" | `manage_company` | `/inputs/{id}` ou `/inputs` |
| 3 | `register_count` | "contei 2 sacos de açúcar" | `adjust_stock` | `/inputs/{id}` |
| 4 | `register_production` | "produzi 480 picolés de morango" | `record_production` | `/production` |
| 5 | `register_transfer` | "mandei 6000 de açúcar para a loja centro" | `dispatch` | `/transfer` ou `/places` |
| 6 | `stock_at_place` | "o que tem na loja centro" | — | `/places` |
| 7 | `where_is_item` | "onde está o açúcar" | — | `/places` |
| 8 | `stock_of_input` | "quanto tem de açúcar" | — | `/inputs/{id}` |
| 9 | `erase_help` | "como apago os dados de exemplo" | `manage_company` | `/settings` |
| 10 | `what_to_buy` | "o que falta para 3 tachos de cada" | `view_cost` | `/purchase`, `/inputs` ou `/products` |
| 11 | `list_inputs` | "quais insumos eu tenho" | `view_cost` | `/inputs` |
| 12 | `produced_today` | "quanto saiu hoje" | — | `/production` |
| 13 | `what_was_lost` | "o que a gente perdeu esse mês" | `view_cost` | `/losses` |
| 14 | `what_dominates` | "o que mais pesa no picolé de morango" | `view_cost` | `/recipes/{id}` |
| 15 | `what_moved` | "o que mudou de preço" | `view_cost` | (ver `skills.ts`) |
| 16 | `cost_of_product` | "quanto custa o picolé de morango" | `view_cost` | `/recipes/{id}` |
| 17 | `price_of_input` | "quanto está o açúcar" | `view_cost` | `/purchase` |

(ids, exemplos e `requires`: `src/assistant/skills.ts:45-48, 100-103, 145-148,
183-185, 244-247, 282-285, 326-329, 388-391, 436-440, 470-472, 530-533,
623-636, 702-704, 761-763, 807-810, 903-906, 989-992`; rotas: linhas 81, 175,
203, 220, 257, 276, 313, 381, 400, 423, 451, 513, 562, 603, 651, 688, 728, 749,
781, 791, 890, 926, 940, 967, 1004, 1050, 1068)

A ordem tem comentários que a justificam como semântica, não arrumação
(`src/assistant/skills.ts:1073-1100`): `registerInput` antes das perguntas
porque "cadastrar X, Y" é alguém criando; `registerCount` antes de
`stockOfInput` porque "uma frase carregando um número é alguém contando, não
alguém perguntando"; `stockAtPlace` antes de `stockOfInput` porque "quanto tem na
loja centro" casa com as duas e quem pergunta por um lugar não pergunta por um
item chamado "na loja"; `whatToBuy` antes de `listInputs` porque quem pergunta o
que FALTA não está pedindo a lista do almoxarifado.

#### 21.2.4 A porta única: `ask`

`ask(question, context)` (`src/assistant/index.ts:54-85`):

1. `trim`; vazio → `{ text: 'Pode perguntar.' }`
2. percorre `registry` **na ordem**, chamando `skill.match(trimmed)`
3. no primeiro casamento, **a permissão é checada ANTES da consulta**: se
   `skill.requires` e a capacidade não estiver no conjunto, devolve
   `{ text: 'Esse número não faz parte do seu acesso. Quem cuida do financeiro
   consegue ver.' }` — dito sem constrangimento, porque é fronteira do papel e
   não falha da pessoa (`src/assistant/index.ts:62-68`)
4. senão `skill.run(match, { ...context, question: trimmed })` — a pergunta
   viaja com o contexto para que uma habilidade que escreve possa estampar o
   movimento com a frase que o criou (`src/assistant/index.ts:70-72`)
5. sem casamento: texto `'Ainda não sei responder isso. Por enquanto eu sei, por
   exemplo:'` (ou sem o "por exemplo" quando nada está disponível) **mais uma
   `list`** com os exemplos disponíveis — lista, não conta, porque é o que a
   frase acabou de prometer com o dois-pontos
   (`src/assistant/index.ts:75-84`)

Nota de segurança escrita: "dizer a um modelo para guardar um segredo não é um
controle — o filtro mora no caminho do dado"
(`src/assistant/index.ts:42-53`).

`registerSkills(skills)` existe para módulos futuros se registrarem, ignorando id
duplicado (`src/assistant/index.ts:32-36`) — **implementado, sem chamador em
`src/` ou `app/`**.

#### 21.2.5 Os cartões de resposta

`turns.map((turn, index) => <Reveal index={1 + index}>…)`
(`app/assistant.tsx:212-213`), do mais novo para o mais velho.

`Card hue={turn.answer.draft ? color.warning : palette.sky}` — âmbar quando a
frase virou rascunho, porque é o único cartão da tela que espera uma decisão;
azul quando é só resposta (`app/assistant.tsx:214-217`). Ícone `GlyphAssistant`.

Conteúdo, em ordem:

1. **a pergunta**, pequena e apagada, em `type.caption` / `color.inkFaint`: ela é
   o contexto, não o conteúdo (`app/assistant.tsx:207-210,218`)
2. **a frase**, em `type.cardTitle` / `color.ink` (`app/assistant.tsx:219-221`)
3. **`turn.answer.list`**, se houver: uma `ListRow` por linha, com
   `trailing={line.value}` e `trailingTone="muted"`, **sempre aberta**
   (`app/assistant.tsx:228-239`)
4. **`turn.answer.detail`**, só se `turn.open`: as mesmas `ListRow`
   (`app/assistant.tsx:243-254`)
5. **as duas ações fantasma**, numa linha, só se houver `detail` ou `route`
   (`app/assistant.tsx:260-280`):
   - `[por quê?]`: rótulo `t.app.assistant.why` = "POR QUÊ?" ou
     `t.app.assistant.close` = "FECHAR"; `onPress={() => toggleWhy(index)}`
   - abrir a tela: rótulo `t.app.assistant.openScreen` = "ABRIR A TELA";
     `onPress={() => router.push(turn.answer.route as never)}`
6. **o rascunho**, se houver (`app/assistant.tsx:286-320`)

`toggleWhy(index)` inverte só o `open` daquele turno
(`app/assistant.tsx:136-137`).

A separação `list` × `detail` é cicatriz nomeada: `detail` carregava quatro
coisas diferentes e a tela tinha um rótulo só para todas — "POR QUÊ?". A resposta
terminava em dois-pontos prometendo a lista, e embaixo aparecia um botão
afirmando que ali estava a conta de um número que não existia. Lei 6 é sobre
abrir a conta de uma conclusão; o que não é conta não pode se esconder atrás dela
(`src/assistant/types.ts:127-141`; `app/assistant.tsx:223-227`).

#### 21.2.6 O rascunho e o sim humano

`Draft` (`src/assistant/types.ts:110-120`):

```ts
export type Draft = {
  kind: 'purchase' | 'count' | 'item' | 'production' | 'transfer';
  summary: string;
  apply: () => Promise<void>;
};
```

`summary` é "o que a pessoa lê antes de confirmar, escrito do jeito que ela
diria em voz alta — com os números por extenso, nunca como rótulos de campo"
(`src/assistant/types.ts:110-115`).

Na tela (`app/assistant.tsx:286-320`):

- **já aplicado** (`turn.applied`): um `Chip signal="ok"` e nada mais — o botão
  desaparece junto, porque confirmar duas vezes a mesma coisa é o que se está
  evitando (`app/assistant.tsx:282-285,288-296`). O rótulo depende do tipo:
  `kind === 'item'` → `t.app.assistant.registered` = "Cadastrado."; qualquer
  outro → `t.app.assistant.recorded` = "Lançado."
- **ainda não aplicado**: o `summary` em `type.body`, e um `Button weighty` —
  a única massa de cor do cartão. Rótulo `kind === 'item'` →
  `confirmAndRegister` = "Confirmar e cadastrar"; senão `confirmAndRecord` =
  "Confirmar e lançar" (`app/assistant.tsx:297-317`)

A distinção entre as duas palavras é decisão de dicionário registrada: "lançar é
o que se faz com o que aconteceu, e o cadastro de um insumo não aconteceu em
lugar nenhum: `saveItem` escreve a linha do item e nenhum movimento"
(`app/assistant.tsx:302-307`; `src/i18n/locales/pt-BR.ts:1041`).

`confirmDraft(index)` (`app/assistant.tsx:139-163`):

1. sai se não houver rascunho ou se já aplicado
2. `askConfirm({ title: t.app.assistant.confirmTitle, message:
   turn.answer.draft.summary, cancelLabel: t.app.assistant.no })` → "Confirma?"
   / o resumo / "Não"
3. **este é o piso que nenhum nível de autonomia atravessa**: um preço, um ajuste
   ou um lançamento financeiro é confirmado por uma pessoa, em palavras, toda vez
   (`app/assistant.tsx:143-144`)
4. `await turn.answer.draft.apply()`, e então `applied: true`
5. no erro: `askConfirm({ title: t.app.assistant.failed, message, acknowledge:
   true, confirmLabel: t.app.confirm.understood })` → "Não deu para gravar" /
   "Entendi"

O piso está escrito também no domínio: `ALWAYS_CONFIRMED = ['adjustStock',
'changePrice', 'reverseMovement', 'recordFinance', 'issueInvoice']`, com
`needsHumanYes(act)` devolvendo sempre verdadeiro
(`src/domain/access.ts:135-148`).

#### 21.2.7 O que o assistente pode alcançar

`AssistantData` é o contrato inteiro: dezenove métodos, todos funções que as
telas já chamam (`src/assistant/types.ts:49-108`). `liveData(companyId,
timeZone)` é a ligação, e é declaradamente **uma amarração, não uma consulta**:
"o assistente é fisicamente incapaz de perguntar ao banco qualquer coisa que as
telas não possam perguntar, e é isso que impede os dois de nunca reportarem
números diferentes para a mesma coisa" (`src/data/assistantData.ts:24-32`).

Três decisões de lugar e dia moram nessa amarração
(`src/data/assistantData.ts:45-69`):

- `recordCount` recebe `locationId: defaultLocationId(companyId)` — e o local é
  exigido aqui, não com padrão dentro do repositório, porque "a decisão de onde
  gravar mora em quem sabe fazer a pergunta"
- `recordProduction` recebe `locationId` e `producedOn: localDate(nowIso(),
  timeZone)` — o dia não se adivinha
- `recordTransfer` recebe `fromLocationId: defaultLocationId(companyId)`
- `saveItem` recebe `packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] }`

#### 21.2.8 O reconhecimento, em uma frase

`normalize(text)` minúscula, decompõe em NFD, remove os diacríticos
(`.replace(/[\u0300-\u036f]/g, '')`), colapsa espaços e faz `trim` — então "açúcar" e "acucar" são
uma palavra só (`src/assistant/text.ts:12-20`).

`findByName(candidates, term)` tenta, em ordem: nome idêntico normalizado; um
único candidato que **contém** o termo; **nulo quando mais de um contém**; e por
último qualquer candidato que compartilhe uma palavra de mais de 3 letras
(`src/assistant/text.ts:39-72`). O nulo no empate é cicatriz: devolver o nome
mais curto era sorteio — com a grade linha × tipo × sabor, "morango" casa com
doze, e o assistente gravaria a produção contra a receita errada sem dizer nada a
ninguém. Era a única linha do assistente que decidia calada
(`src/assistant/text.ts:51-65`). `namesakes` devolve os candidatos do empate para
a tela poder perguntar (`src/assistant/text.ts:90-107`).

#### 21.2.9 O e2e do assistente

Uma checagem, em `e2e/flow.mjs:528-537`: abre `/assistant`, preenche o campo "Sua
pergunta" com "quanto custa o picolé de morango", clica "Perguntar", e afirma que
a tela passa a conter `Picolé de morango custa R$ 0,64 por unidade`. E a porta
existe: `e2e/flow.mjs:282` afirma que a tela "Mais" contém "Pergunte".

---

### 21.3 `app/weather.tsx` — Clima

`WeatherPlaceScreen` envolve `<PickCity />` num `AreaProvider area="sky"`
(`app/weather.tsx:49-55`).

A tela responde **uma** pergunta: onde fica a fábrica. E ela nasce respondida —
o fuso do aparelho já diz a cidade, então a tela abre mostrando a que está
valendo e existe para o caso em que o palpite está errado: "a fábrica no interior
com o fuso da capital, que é o caso comum" (`app/weather.tsx:18-23`).

**A busca é a única coisa no aplicativo inteiro que exige internet, e ela diz
isso com todas as letras em vez de girar para sempre** (`app/weather.tsx:25-27`).

#### 21.3.1 Cabeçalho, estado e ações

`CollapsingHeader title={words.title} overline={words.overline}`
(`app/weather.tsx:97`), com `const words = t.app.weatherPlace`
(`app/weather.tsx:61`).

Estado (`app/weather.tsx:64-69`):

```ts
const { data: current, refresh } = useQuery<WeatherPlace | null>(() => readPlace());
const [term, setTerm]           = useState('');
const [found, setFound]         = useState<WeatherPlace[] | null>(null);
const [searching, setSearching] = useState(false);
const [saved, setSaved]         = useState<string | null>(null);
```

`search()` (`app/weather.tsx:71-80`): sai se já buscando ou se
`term.trim().length < 2`; liga `searching`, limpa `saved`, e faz
`setFound(await searchPlaces(term, fetchJson))` dentro de um `try/finally` que
sempre desliga `searching`.

`choose(place)` (`app/weather.tsx:82-88`): `await writePlace(place)`, limpa
`found`, limpa `term`, `setSaved(place.name)`, `refresh()`.

Dois auxiliares (`app/weather.tsx:90-94`):

- `label(place)` = `` `${place.name} · ${place.region}` `` quando há região,
  senão só o nome
- `curta(place)` = `` `${place.latitude},${place.longitude}` `` — a chave de
  React, porque "duas 'Santa Maria' existem: o que separa uma da outra é o
  estado"

#### 21.3.2 Cartão 0 — a cidade que está valendo

`Reveal index={0}`, `Card hue={palette.sky}`, ícone `GlyphThermometer size={26}`,
e `title={current ? label(current) : undefined}` — **a cidade é o TÍTULO do
cartão**, não um parágrafo dentro dele, porque é a resposta e resposta não se lê
no meio do texto (`app/weather.tsx:102-107,38-41`).

Conteúdo (`app/weather.tsx:108-131`):

| ordem | conteúdo | condição |
|---|---|---|
| 1 | sobrelinha `words.current.toUpperCase()` → "CIDADE DE AGORA" | sempre |
| 2 | `words.none` = "Nenhuma cidade escolhida ainda." em `inkMuted` | `!current` |
| 3 | `fill(words.saved, { city: saved })` = "Pronto. A tela inicial já mostra o tempo de {{city}}." em `color.ok` | depois de escolher |
| 4 | `words.why` em `type.caption` / `inkMuted` | sempre |

`words.why` = "Calor muda o que sai e o que estraga, então o tempo entra na tela
inicial. A cidade veio do fuso do aparelho — troque se a fábrica é em outra."
(`src/i18n/locales/pt-BR.ts:294`). O e2e afirma essa frase **e** afirma que a
tela não contém a palavra "sorvete", porque a capa do projeto proíbe regra
chumbada de sorvete (`e2e/flow.mjs:386-387`).

#### 21.3.3 Cartão 1 — trocar a cidade

`Reveal index={1}`, `Card hue={palette.sky}`, ícone `GlyphFactory size={26}`, e
**sem título escrito**: a etiqueta do campo já é o cabeçalho dele, e repetir
"Procurar cidade" três vezes na mesma altura da tela seria o parágrafo cinza
voltando por outra porta (`app/weather.tsx:134-140`).

Conteúdo (`app/weather.tsx:141-187`), tudo dentro de um `View` com `gap:
space.lg`:

1. **`Field`** `label={words.search}` = "Procurar cidade",
   `hint={words.searchHint}` = "Escreva o nome e escolha na lista.". O
   `onChangeText` **limpa a lista de achados** junto: `setTerm(next);
   setFound(null)` (`app/weather.tsx:142-150`).
2. **`Button`** rotulado `words.search` ou `words.searching` = "Procurando…",
   com `disabled={searching || term.trim().length < 2}`. Lei 5: com menos de duas
   letras a busca não sai — antes o botão aceitava o toque e não fazia nada, "que
   num celular de fábrica se lê como 'o aplicativo travou'"
   (`app/weather.tsx:152-160`).
3. **duas frases de "sem resultado"**, quando `found && found.length === 0 &&
   !searching`, porque a causa é uma de duas e as duas têm conserto diferente
   (`app/weather.tsx:162-170`):
   - `words.noResults` = "Nenhuma cidade com esse nome. Confira a escrita." em
     `color.ink`
   - `words.offline` = "Sem internet agora. Procurar cidade precisa dela; o resto
     do aplicativo não." em `inkMuted`
4. **uma `ListRow` por cidade** achada, quando `found && found.length > 0`, com
   `key={curta(place)}`, `label={place.name}`, `detail={place.region ??
   undefined}`, `onPress={() => choose(place)}`. Sem ícone em cada linha: "ícone
   em toda linha de lista vira papel de parede" (`app/weather.tsx:172-186`).

#### 21.3.4 Cartão 2 — voltar

`Reveal index={2}`, `Button label={words.back}` = "Voltar",
`variant="ghost"`, `onPress={() => router.back()}`. Fantasma e último da pilha:
"ninguém deve ser convidado a sair antes de responder"
(`app/weather.tsx:191-195`).

#### 21.3.5 O dicionário desta tela

`t.app.weatherPlace`, dez chaves (`src/i18n/locales/pt-BR.ts:291-304`):

| chave | pt-BR |
|---|---|
| `title` | "Clima" |
| `overline` | "onde fica a fábrica" |
| `why` | "Calor muda o que sai e o que estraga, então o tempo entra na tela inicial. A cidade veio do fuso do aparelho — troque se a fábrica é em outra." |
| `current` | "Cidade de agora" |
| `none` | "Nenhuma cidade escolhida ainda." |
| `search` | "Procurar cidade" |
| `searchHint` | "Escreva o nome e escolha na lista." |
| `searching` | "Procurando…" |
| `noResults` | "Nenhuma cidade com esse nome. Confira a escrita." |
| `offline` | "Sem internet agora. Procurar cidade precisa dela; o resto do aplicativo não." |
| `saved` | "Pronto. A tela inicial já mostra o tempo de {{city}}." |
| `back` | "Voltar" |

#### 21.3.6 A busca de cidade, por dentro

`WeatherPlace` (`src/weather/index.ts:34-40`):

```ts
export type WeatherPlace = {
  name: string;
  region: string | null;   // estado/província, quando a fonte diz
  latitude: number;
  longitude: number;
};
```

`searchPlaces(term, fetchJson)` (`src/weather/index.ts:172-184`):

- `trim`; menos de 2 caracteres → `[]`
- URL: `` `${GEOCODE_URL}?name=${encodeURIComponent(wanted)}&count=6&format=json` ``,
  com `GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'`
  (`src/weather/index.ts:76`) — **no máximo 6 resultados**
- `try { return parsePlaces(await fetchJson(url)) } catch { return [] }` —
  **lista vazia quando não há rede ou não há resposta**, nunca exceção

`parsePlaces(json)` (`src/weather/index.ts:99-115`): lê `json.results`, exige que
seja array, e por linha exige `name` string e `latitude`/`longitude` numéricos;
`region` vem de `admin1` quando for string, senão `null`. O que não tem
coordenada é ignorado.

`fetchJson(url)` (`src/weather/live.ts:26-36`): `AbortController` com
`TIMEOUT_MS = 8_000`, `throw new Error(HTTP ${status})` quando `!response.ok`, e
`clearTimeout` no `finally`. Motivo escrito: "sem prazo, um celular na área ruim
da fábrica fica com a promessa pendurada até o sistema operacional desistir — e a
tela, que espera por ela, some com o cartão que já tinha"
(`src/weather/live.ts:18-25`).

`readPlace()` / `writePlace(place)` são `readJson` / `writeJson` sobre
`PLACE_KEY = 'weather.place'` (`src/weather/live.ts:12,38-44`).

#### 21.3.7 A dedução da cidade — Lei 1

`cityFromTimeZone(timeZone)` (`src/weather/index.ts:89-96`):

```ts
if (!timeZone.includes('/')) return null;
const parts = timeZone.split('/');
if (parts[0] === 'Etc') return null;
const last = parts[parts.length - 1];
if (!last || /[0-9+]/.test(last)) return null;
return last.replace(/_/g, ' ');
```

`America/Sao_Paulo` → "Sao Paulo"; `America/Argentina/Buenos_Aires` → "Buenos
Aires"; `UTC`, `GMT`, `Etc/GMT-3` → `null`. **Nulo significa "pergunte", e é a
única situação em que se pergunta** (`src/weather/index.ts:81-88`).

`currentForecast(deps)` (`src/weather/index.ts:228-251`), na ordem exata:

1. lê o cache e a cidade guardada
2. **sem cidade**: deduz do fuso; sem palpite → devolve o cache; busca; nada
   achado → devolve o cache; senão pega `found[0]` e **grava** a cidade
3. `usable = cached && samePlace(cached.place, place) ? cached : null` — cidade
   trocada invalida o cache sozinha; `samePlace` compara latitude e longitude com
   tolerância de `0.01` (`src/weather/index.ts:206-208`)
4. se `usable` e não vencido → devolve
5. busca fresco; falhou → devolve `usable`; conseguiu → grava o cache e devolve

`isStale(forecast, nowIso, freshForMinutes = FRESH_FOR_MINUTES)`:
`age = Date.parse(nowIso) - Date.parse(forecast.fetchedAt)` e devolve verdadeiro
se `!(age >= 0)` **ou** `age > freshForMinutes * 60_000`
(`src/weather/index.ts:145-148`). `FRESH_FOR_MINUTES = 180` — três horas
(`src/weather/index.ts:79`).

#### 21.3.8 O que a tela de Clima NÃO desenha, e por quê

O docblock diz explicitamente: **a cena do céu e a régua de temperatura
(`src/components/Sky`) não aparecem aqui.** Elas precisam de máxima, mínima e
chance de chuva, e a única consulta desta tela é a cidade guardada. "Cena que não
sai do dado é enfeite, e enfeite ensina a ignorar — a semana desenhada mora na
capa, onde a previsão de verdade existe" (`app/weather.tsx:43-47`).

Também não há: escolha de unidade (°C é fixo — `maxC`/`minC`,
`src/weather/index.ts:43-50`), escolha de fonte de dado, nem botão de "atualizar
agora". NÃO ESTÁ NO CÓDIGO.

O que a capa desenha com o mesmo dado, para referência: máxima de hoje em
`type.figure`, mínima abaixo, `SkyMark`, `TemperatureRange`, a diferença com
amanhã (`warmerBy`, calculado **sobre os graus já arredondados**, porque "o
número dito tem que ser a subtração dos números mostrados, ou a tela mente por um
grau" — `src/weather/index.ts:59-73,167`), a semana de até 7 dias quando a peça
está aberta, e a hora da medição (`src/home/Mosaic.tsx:285-350`).

`fetchForecast` pede `daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max`
com `timezone=auto&forecast_days=2` a
`FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'`
(`src/weather/index.ts:75,187-203`). Ou seja: **a API é chamada com
`forecast_days=2`**, então a "semana" de até sete linhas da capa só se preenche
com um cache que tenha mais dias — hoje ela mostra dois.

`parseDays` descarta o dia inteiro quando falta máxima ou mínima, em vez de
entrar com zero: "0° num dia de setembro em São Paulo não é um dado faltando, é
um dado errado, e o cartão o desenharia com a mesma confiança dos outros"
(`src/weather/index.ts:117-142`).

`reading(forecast, today)` **procura** o dia de hoje na lista
(`findIndex(d => d.date >= today)`) e devolve `null` quando a previsão inteira
venceu, "porque é melhor não ter cartão que ter um cartão errado"
(`src/weather/index.ts:150-169`).

#### 21.3.9 O e2e do clima

`e2e/flow.mjs:370-405`, "the weather screen answers with or without internet":

- abre `/weather`, afirma "onde fica a fábrica" e a frase `words.why`, e afirma
  que a palavra "sorvete" **não** aparece
- preenche o `textbox` "Procurar cidade" com "Recife" e clica no botão
- espera até **20 000 ms** por "Recife" ou "Nenhuma cidade com esse nome" — e a
  espera é do tamanho do prazo da chamada, "não de um palpite: a busca desiste
  sozinha em oito segundos, e uma verificação que espera três reprovaria a tela
  por ela estar fazendo exatamente o que prometeu" (`e2e/flow.mjs:392-394`)
- **as duas saídas são aceitas** — a máquina de teste pode ter internet ou não; o
  que não é aceito é a tela ficar sem resposta ou o console sujar
- por fim abre `/more` e afirma que "Clima" está lá, porque "sem previsão
  guardada não há cartão na capa, então trocar a cidade tem que caber no menu"
  (`e2e/flow.mjs:400-404`)

---

### 21.4 Resumo de estados

| item | estado |
|---|---|
| pele (`organico`/`papel`) | **implementado e chamado por tela** (`app/settings.tsx:569-596`) |
| paleta (`hue`, 5 cores) | **implementado e chamado por tela**, só no Orgânico (`app/settings.tsx:606-645`) |
| luz (`claro`/`escuro`/`sistema`) | **implementado e chamado por tela** (`app/settings.tsx:550-566`) |
| idioma (3) | **implementado e chamado por tela** (`app/settings.tsx:678-688`) |
| moeda (8) | **implementado e chamado por tela** (`app/settings.tsx:700-715`) |
| fuso | **implementado, sem controle de tela** — vem do relógio (`src/i18n/device.ts:46-49`) |
| ordem da capa (14 peças) | **implementado e chamado por tela** (`app/settings.tsx:743-793`) |
| esconder peça no aparelho | **implementado e chamado por tela** (`app/settings.tsx:755-767`) |
| ligar peça fora da capa | **implementado e chamado por tela** (`app/settings.tsx:800-820`) |
| ligar/desligar 5 alarmes | **implementado e chamado por tela** (`app/settings.tsx:844-882`) |
| antecedência (1,2,3,5,7,14) | **implementado e chamado por tela** (`app/settings.tsx:918-936`) |
| `bands.notifyFull` | **implementado e chamado por tela** (`app/settings.tsx:889-911`) |
| `bands.red/yellow/blue` | **implementado no domínio, sem controle de tela** (`src/domain/alerts.ts:60-63`) |
| hora e minuto do aviso | **implementado e chamado por tela** (`app/settings.tsx:953-984`) |
| dias da semana do aviso | **implementado e chamado por tela** (`app/settings.tsx:992-1013`) |
| `alerts.never` (frase de permissão negada) | **implementado no dicionário (3 idiomas), SEM CHAMADOR** |
| aprovação de pedido | **implementado e chamado por tela** (`app/settings.tsx:1027-1052`) |
| apagar por área (4) | **implementado e chamado por tela** (`app/settings.tsx:443-488`) |
| apagar tudo | **implementado e chamado por tela** (`app/settings.tsx:1059-1078`) |
| restaurar exemplo | **implementado e chamado por tela** (`app/settings.tsx:1083-1105`) |
| plantar 14 dias | **implementado e chamado por tela** (`app/settings.tsx:1110-1129`) |
| `names_who_recorded` | **planejado — coluna no Postgres, nenhum código de app** |
| `floor_sign_in` (PIN vs pessoal) | **planejado — enum e coluna no Postgres, nenhum código de app** |
| `join_code` | **planejado — coluna no Postgres, nenhum código de app** |
| tela de pessoas / operadores | **NÃO IMPLEMENTADO**, razão escrita em `app/(tabs)/more.tsx:38` |
| assistente: 17 habilidades | **implementado e chamado por tela** (`src/assistant/skills.ts:1073-1100`) |
| assistente: `registerSkills` | **implementado, SEM CHAMADOR** (`src/assistant/index.ts:32-36`) |
| assistente: multi-idioma | **fronteira registrada, não defeito** (`src/assistant/index.ts:7-22`) |
| clima: busca de cidade | **implementado e chamado por tela** (`app/weather.tsx:142-186`) |
| clima: cena do céu na tela `/weather` | **deliberadamente ausente**, razão escrita (`app/weather.tsx:43-47`) |
| clima: navegar da capa para `/weather` | **NÃO IMPLEMENTADO** — `src/home/Mosaic.tsx` não tem router |
