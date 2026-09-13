## 18. Telas — a capa, as abas e o mosaico

### 18.1 A convenção de rotas

O aplicativo é Expo Router: **arquivo é rota**. O plugin está declarado em
`app.json` (`"plugins": ["expo-router", "expo-localization", "expo-sqlite",
"expo-notifications"]`, `app.json`), com `experiments.typedRoutes: true`
(`app.json`) — é isso que faz `router.push('/inputs')` ser conferido pelo
compilador e obriga os `as never` que aparecem nas telas que montam a rota a
partir de uma variável (`app/(tabs)/more.tsx:119`, `app/(tabs)/reports.tsx:207`).

O esquema de link profundo é `norva` (`app.json`; espelhado em
`src/config/brand.ts:18`), e a web é exportada como `output: "single"`
(`app.json`), ou seja: uma única página que resolve todas as rotas no cliente.

Existem **26 arquivos de rota**, nesta árvore exata:

| Caminho na URL | Arquivo | Título da tela (`CollapsingHeader title`) | Sobrelinha (`overline`) | Área (`AreaProvider`) |
|---|---|---|---|---|
| `/` | `app/(tabs)/index.tsx` | `brand.name` → `NORVA` (`app/(tabs)/index.tsx:344`) | `formatWeekday(nowIso(), locale)` — dia da semana + dia + mês abreviado (`app/(tabs)/index.tsx:344`) | `sky` (`app/(tabs)/index.tsx:89`) |
| `/production` | `app/(tabs)/production.tsx` | `t.app.production.title` → "Produção" (`app/(tabs)/production.tsx:155`) | `t.app.production.overline` → "o que saiu hoje" | `apricot` (`app/(tabs)/production.tsx:62`) |
| `/transport` | `app/(tabs)/transport.tsx` | `t.app.transport.title` → "Para onde foi" (`app/(tabs)/transport.tsx:149`) | `t.app.transport.today` → "Hoje · {{summary}}", **só quando houve destino** (`app/(tabs)/transport.tsx:150`) | `lilac` (`app/(tabs)/transport.tsx:47`) |
| `/reports` | `app/(tabs)/reports.tsx` | `t.app.reports.title` → "Relatórios" (`app/(tabs)/reports.tsx:111`) | `t.app.reports.subtitle` → "Cada um abre num resumo de uma tela" | `sand` (`app/(tabs)/reports.tsx:49`) |
| `/more` | `app/(tabs)/more.tsx` | `t.app.more.title` → "Mais" (`app/(tabs)/more.tsx:124`) | nenhuma — `CollapsingHeader` sem `overline` (`app/(tabs)/more.tsx:124`) | `mist` (`app/(tabs)/more.tsx:48`) |
| `/assistant` | `app/assistant.tsx` | "Pergunte" (`app/assistant.tsx:166`; texto em `src/i18n/locales/pt-BR.ts:1029`) | "modo conversa" (`src/i18n/locales/pt-BR.ts:1030`) | `sky` (`app/assistant.tsx:65`) |
| `/catalog` | `app/catalog.tsx` | "Linhas, tipos e sabores" (`app/catalog.tsx:153`; `src/i18n/locales/pt-BR.ts:954`) | "a grade do que você fabrica" (`src/i18n/locales/pt-BR.ts:955`) | `sand` (`app/catalog.tsx:56`) |
| `/losses` | `app/losses.tsx` | "Perdas" (`app/losses.tsx:112`; `src/i18n/locales/pt-BR.ts:207`) | "Últimos 30 dias" (`src/i18n/locales/pt-BR.ts:208`) | `apricot` (`app/losses.tsx:53`) |
| `/places` | `app/places.tsx` | "Estoque por lugar" (`app/places.tsx:173`; `src/i18n/locales/pt-BR.ts:678`) | "onde está o que você tem" (`src/i18n/locales/pt-BR.ts:679`) | `mint` (`app/places.tsx:73`) |
| `/purchase` | `app/purchase.tsx` | "Nova compra" (`app/purchase.tsx:231`; `src/i18n/locales/pt-BR.ts:849`) | "a nota move o custo" (`src/i18n/locales/pt-BR.ts:851`) | `sage` (`app/purchase.tsx:69`) |
| `/settings` | `app/settings.tsx` | "Ajustes" (`app/settings.tsx:413`) | `` `${brand.name} · ${Constants.expoConfig?.version ?? '—'}` `` → "NORVA · 0.10.0" (`app/settings.tsx:414`, `app.json`) | `mist` (`app/settings.tsx:99`) |
| `/transfer` | `app/transfer.tsx` | "Transferir" (`app/transfer.tsx:349`; `src/i18n/locales/pt-BR.ts:767`) | "o que sai da fábrica" ou "o que volta para a fábrica" quando é devolução (`app/transfer.tsx:356`, `src/i18n/locales/pt-BR.ts:768-769`) | `lilac` (`app/transfer.tsx:71`) |
| `/weather` | `app/weather.tsx` | "Clima" (`app/weather.tsx:97`; `src/i18n/locales/pt-BR.ts:292`) | "onde fica a fábrica" (`src/i18n/locales/pt-BR.ts:293`) | `sky` (`app/weather.tsx:51`) |
| `/inputs` | `app/inputs/index.tsx` | "Almoxarifado" (`app/inputs/index.tsx:149`; `src/i18n/locales/pt-BR.ts:508`) | "o que você compra" (`src/i18n/locales/pt-BR.ts:509`) | `mint` (`app/inputs/index.tsx:52`) |
| `/inputs/new` | `app/inputs/new.tsx` | "Novo cadastro" ou o nome do item quando está editando (`app/inputs/new.tsx:353`) | "cadastro" / "corrigindo o cadastro" (`app/inputs/new.tsx:354`, `src/i18n/locales/pt-BR.ts:540-541`) | `mist` (`app/inputs/new.tsx:65`) |
| `/inputs/[id]` | `app/inputs/[id].tsx` | o nome do item; "Insumo" enquanto carrega (`app/inputs/[id].tsx:156,424`) | "almoxarifado" / "almoxarifado · fora de circulação" (`app/inputs/[id].tsx:425`, `src/i18n/locales/pt-BR.ts:591-592`) | `mint` (`app/inputs/[id].tsx:83`) |
| `/lots/[id]` | `app/lots/[id].tsx` | "Etiqueta do lote" (`app/lots/[id].tsx:181`; `src/i18n/locales/pt-BR.ts:182`) | "para colar na caixa" (`src/i18n/locales/pt-BR.ts:183`) | `apricot` (`app/lots/[id].tsx:73`) |
| `/orders` | `app/orders/index.tsx` | "Pedidos" (`app/orders/index.tsx:100`; `src/i18n/locales/pt-BR.ts:223`) | "o que os clientes pediram" (`src/i18n/locales/pt-BR.ts:224`) | `sage` (`app/orders/index.tsx:55`) |
| `/orders/new` | `app/orders/new.tsx` | "Anotar pedido" (`app/orders/new.tsx:317`; `src/i18n/locales/pt-BR.ts:245`) | "para quem, para quando, o quê" (`src/i18n/locales/pt-BR.ts:246`) | `sage` (`app/orders/new.tsx:94`) |
| `/production/new` | `app/production/new.tsx` | "Lançar produção" (`app/production/new.tsx:402`; `src/i18n/locales/pt-BR.ts:811`) | "o que saiu do tacho agora" (`src/i18n/locales/pt-BR.ts:812`) | `apricot` (`app/production/new.tsx:93`) |
| `/products` | `app/products/index.tsx` | "Produtos" (`app/products/index.tsx:127`; `src/i18n/locales/pt-BR.ts:942`) | "o que sai para vender" (`src/i18n/locales/pt-BR.ts:943`) | `apricot` (`app/products/index.tsx:54`) |
| `/products/new` | `app/products/new.tsx` | "Novo produto" (`app/products/new.tsx:394`; `src/i18n/locales/pt-BR.ts:984`) | "cadastro" (`src/i18n/locales/pt-BR.ts:985`) | `apricot` (`app/products/new.tsx:98`) |
| `/recipes` | `app/recipes/index.tsx` | "Receitas" (`app/recipes/index.tsx:162`; `src/i18n/locales/pt-BR.ts:887`) | "o que entra em cada vez" (`src/i18n/locales/pt-BR.ts:888`) | `apricot` (`app/recipes/index.tsx:55`) |
| `/recipes/[id]` | `app/recipes/[id].tsx` | o nome da ficha; "Receita" enquanto carrega (`app/recipes/[id].tsx:352,379`) | "ficha técnica · versão {{version}}" (`app/recipes/[id].tsx:380`, `src/i18n/locales/pt-BR.ts:899`) | `apricot` (`app/recipes/[id].tsx:83`) |
| — | `app/(tabs)/_layout.tsx` | layout de grupo, não é tela | — | — |
| — | `app/_layout.tsx` | layout raiz, não é tela | — | — |

Cinco fatos estruturais, e todos têm consequência:

1. **O grupo `(tabs)` não aparece na URL.** O parêntese é a convenção do
   Expo Router para agrupar sem criar segmento — por isso a capa é `/` e não
   `/tabs`. Isso é conferido no navegador: a checagem "the five tabs are there,
   and the old addresses still answer" bate em `/`, `/production`, `/transfer`,
   `/transport`, `/reports`, `/more` e `/production/new`
   (`e2e/flow.mjs:246-299`).
2. **Nenhuma tela tem cabeçalho de navegação.** `Stack` roda com
   `screenOptions={{ headerShown: false }}` (`app/_layout.tsx:112`) e `Tabs` com
   o mesmo (`app/(tabs)/_layout.tsx:98`). Cada tela desenha o próprio
   `CollapsingHeader`, que é o título grande que encolhe ao rolar
   (`src/components/CollapsingHeader.tsx:28-100`).
3. **As telas de detalhe moram FORA do grupo de abas, de propósito** — empurradas
   por cima da barra, que fica coberta (`app/(tabs)/_layout.tsx:29-31`). O
   `CollapsingHeader` lê a altura da barra por contexto
   (`BottomTabBarHeightContext`) em vez de pelo hook `useBottomTabBarHeight()`,
   porque o hook lança fora de uma tela de aba e derrubaria as nove telas
   empilhadas (`src/components/CollapsingHeader.tsx:46`).
4. **Não existe rota `+not-found`, nem `+html`, nem `_layout` intermediário
   dentro de `inputs/`, `lots/`, `orders/`, `production/`, `products/` ou
   `recipes/`.** O tratamento de endereço inexistente é o padrão do Expo Router:
   NÃO ESTÁ NO CÓDIGO.
5. **`/catalog` não tem porta na aba Mais.** Só se chega a ele pela tela de
   produtos (`app/products/index.tsx:197`). É a única rota fora das abas cujo
   único caminho é outra tela de detalhe.

#### O grafo de navegação, aresta por aresta

Toda navegação do aplicativo é `router.push` (não há `replace` em nenhuma tela):

| De | Para |
|---|---|
| capa (mosaico) | `/inputs` (três cartões), `/transport`, `/orders`, `/production/new` (`src/home/Mosaic.tsx:164,176,187,230,362,886`) |
| `/production` | `/production/new` (duas vezes: botão e convite vazio), `/lots/{id}` (`app/(tabs)/production.tsx:231,287,349`) |
| `/transport` | `/places` (destino já conferido), `/transfer` (`app/(tabs)/transport.tsx:186,254`) |
| `/reports` | `/places`, `/recipes`, `/losses` (`app/(tabs)/reports.tsx:117,146,176,207`) |
| `/more` | `/assistant`, `/inputs`, `/recipes`, `/products`, `/places`, `/orders`, `/purchase`, `/weather`, `/settings` (`app/(tabs)/more.tsx:74-104,129`) |
| `/places` | `/transfer`, `/lots/{lotId}` (`app/places.tsx`) |
| `/inputs` | `/inputs/{id}`, `/inputs/new` (`app/inputs/index.tsx`) |
| `/inputs/[id]` | `/inputs/{id}?sala=`, `/recipes/{id}`, `/purchase?itemId=`, `/inputs/new?id=` (`app/inputs/[id].tsx`) |
| `/products` | `/recipes/{recipeId}`, `/products/new`, `/catalog` (`app/products/index.tsx`) |
| `/orders` | `/orders/new` (`app/orders/index.tsx`) |
| `/orders/new` | `/places`, `/products/new` (`app/orders/new.tsx`) |
| `/purchase` | `/inputs` (`app/purchase.tsx`) |
| `/losses` | `/inputs` (`app/losses.tsx`) |
| `/lots/[id]` | `/production` (`app/lots/[id].tsx`) |
| `/transfer` | `/places` (`app/transfer.tsx`) |
| `/assistant` | qualquer rota que a resposta do motor carregar (`app/assistant.tsx`, `push(turn.answer.route as never)`) |

---

### 18.2 O layout raiz: `app/_layout.tsx`

Este arquivo tem duas responsabilidades e nada mais: **abrir o banco antes de
qualquer tela** e **desenhar a árvore de providers**. Tem 127 linhas.

#### 18.2.1 O que acontece antes da primeira tela

`RootLayout` mantém um estado de duas casas e um contador de tentativa
(`app/_layout.tsx:50-54`):

```
const [state, setState] = useState<{ ready: boolean; error: Error | null }>({
  ready: false,
  error: null,
});
const [attempt, setAttempt] = useState(0);
```

Um `useEffect` com dependência `[attempt]` chama `ensureStarterData()` e trata
os dois lados da promessa separadamente, com guarda de vida (`alive`) para não
escrever estado depois de desmontar (`app/_layout.tsx:56-71`).

`ensureStarterData()` (`src/data/seed.ts:38-41`) é a porta de tudo:

1. `hasSeeded()` lê `SELECT value FROM app_meta WHERE key = 'seeded'` e responde
   verdadeiro quando o valor é `'1'` (`src/data/seed.ts:88-94`). **Ler o banco é
   o que abre o banco**: `db()` é chamado ali dentro.
2. `db()` (`src/data/db.ts:738-749`) devolve a conexão já aberta, ou memoiza uma
   única promessa de abertura em `opening` — com `finally` que a limpa, para
   que uma falha não fique sendo devolvida para sempre.
3. `openAndMigrate()` (`src/data/db.ts:751-775`) abre o SQLite nativo, aplica os
   `PRAGMAS` e roda `migrate()`.
4. `migrate()` (`src/data/db.ts:785-811`) lê `PRAGMA user_version`, e para cada
   passo pendente de `MIGRATIONS` executa o passo **e** o
   `PRAGMA user_version = n+1` **dentro da mesma transação** — porque escrever a
   versão depois do commit permite que um processo morto no meio re-execute um
   `ALTER TABLE ... ADD COLUMN` e trave o aparelho para sempre.
5. Se `hasSeeded()` é falso, `writeStarterData()` roda
   (`src/data/seed.ts:96-201`): confere se `items` já tem linha para a empresa
   (e nesse caso só marca `seeded` e sai, `src/data/seed.ts:100-107`), e senão
   escreve quatro insumos, duas embalagens, seis compras, duas receitas e um
   produto, **um por vez, nunca com `Promise.all`**, porque há uma só conexão
   SQLite e cada escrita abre transação (`src/data/seed.ts:134-136`).

A empresa é uma constante:
`LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001'`
(`src/data/seed.ts:12`), e toda consulta de toda tela a recebe como primeiro
argumento.

**O exemplo semeado, por extenso** (é o que a capa mostra numa instalação nova,
e por isso pertence a esta seção): Polpa de morango (balde 10 kg → 10.000 g),
Açúcar cristal (saco 25 kg → 25.000 g), Leite em pó (saco 25 kg), Glucose 38DE
(balde 5 kg); embalagens Palito de picolé (caixa 5.000) e Embalagem plástica
(fardo 2.000) (`src/data/seed.ts:137-143`). As compras são
`4×10.000 = R$ 496`, `2×25.000 = R$ 236`, `1×25.000 = R$ 722,50`,
`2×5.000 = R$ 98`, `2×5.000 = R$ 200`, `3×2.000 = R$ 180`
(`src/data/seed.ts:155-160`) — o total de R$ 1.552,50 dos quatro insumos é
exatamente o número que o e2e cobra na tela de almoxarifado
(`e2e/flow.mjs:210`). As receitas são "Base de creme" (rende 20.000 ml, perda
2%) e "Picolé de morango" (rende 40.000 ml, perda 5%, com 10.000 ml da base
como linha de sub-receita) (`src/data/seed.ts:162-185`), e o produto "Picolé de
morango" rende 75 ml por unidade, com R$ 0,05 de embalagem por unidade e
hierarquia `unit(1) / box(50) / crate(300)` (`src/data/seed.ts:16-22,187-195`).

Os ids criados ficam anotados em `app_meta.seeded_items`
(`src/data/seed.ts:199,203-210`), porque "a marca `seeded` já foi posta" e "o
exemplo AINDA está aqui" são duas perguntas diferentes — a segunda é
`exampleStillHere()` (`src/data/seed.ts:62-86`).

#### 18.2.2 Os três estados do arranque

| Estado | Condição | O que desenha |
|---|---|---|
| carregando | `!state.ready` | `<View style={{ flex: 1 }} />` — nada, sem indicador (`app/_layout.tsx:97`) |
| falhou | `state.error !== null` | a tela `Crash`, envolvida em `SafeAreaProvider → LocaleProvider → AppearanceProvider → ThemeProvider` (`app/_layout.tsx:83-95`) |
| pronto | `state.ready && !state.error` | a árvore completa (`app/_layout.tsx:99-126`) |

**O `catch` que engolia a falha foi removido de propósito**, e o comentário
explica o porquê com todas as letras: sem banco, cada tela responde "nada
cadastrado ainda" e o briefing escreve "tudo estável" — o aplicativo mentindo
com calma, que é o pior estado possível para quem ainda está decidindo se
confia dinheiro nele (`app/_layout.tsx:43-49`).

`retry` zera o estado e incrementa `attempt`, o que **reexecuta o efeito** — ou
seja, tentar de novo é abrir o banco de novo, não redesenhar a tela: o disco
pode ter espaço agora, o arquivo pode ter sido liberado (`app/_layout.tsx:73-78`).

#### 18.2.3 A ordem dos providers

Na árvore normal, de fora para dentro (`app/_layout.tsx:99-126`):

| # | Provider | Por que está nessa altura |
|---|---|---|
| 1 | `GestureHandlerRootView style={{flex:1}}` | raiz de gesto (`app/_layout.tsx:100`) |
| 2 | `SafeAreaProvider` | `app/_layout.tsx:101` |
| 3 | `LocaleProvider` | idioma, moeda e fuso são **fato da EMPRESA** e ficam FORA da cara: a escolha da empresa não muda porque alguém trocou a identidade visual. O comentário afirma que trinta e três telas o leem por `useLocale` (`app/_layout.tsx:102-105`) |
| 4 | `AppearanceProvider` | a cara escolhida (Papel/Orgânico), a paleta e o claro/escuro — **preferência do APARELHO** (`app/_layout.tsx:106-108`, `src/theme/Appearance.tsx:12-44`) |
| 5 | `ThemeProvider` | resolve paleta, tipografia e raio a partir da cara + esquema (`app/_layout.tsx:109`, `src/theme/ThemeProvider.tsx:50-104`) |
| 6 | `ConfirmProvider` | a folha de confirmação, com fila de uma pergunta por vez (`app/_layout.tsx:110`, `src/components/Confirm.tsx:40-63`) |
| 7 | `StatusBar style="auto"` | `app/_layout.tsx:111` |
| 8 | `Stack screenOptions={{headerShown:false}}` | as telas (`app/_layout.tsx:112`) |
| 9 | `WhatsNew` | fica ACIMA de toda tela porque a atualização pode chegar em qualquer uma (`app/_layout.tsx:113-114`) |
| 10 | `Alerts` | não desenha nada; reagenda os avisos a cada abertura. Existe **para a regra de alarme ter chamador** — peça sem chamador é a doença que o P1 do `CLAUDE.md` descreve, e o comentário registra que este repositório já a teve quatro vezes (`app/_layout.tsx:115-119`, `src/notify/Alerts.tsx:23-41`) |

`ConfirmProvider` **não** envolve a tela de erro: a árvore do `Crash` tem quatro
providers e para no `ThemeProvider` (`app/_layout.tsx:85-93`).

`LocaleProvider` desenha com `defaultLocale` no primeiro quadro e só depois
substitui pelo que estava guardado, porque "o primeiro quadro do aplicativo não
pode esperar disco para escolher uma palavra"; falha de leitura cai no padrão
sem erro (`src/i18n/Locale.tsx:47-69`). O fuso **nunca** é pergunta: vem de
`detectTimeZone()` (`src/i18n/Locale.tsx:63`), e o comentário registra a
cicatriz — chumbado em `America/Sao_Paulo`, ele fazia uma fábrica em Manaus
lançar o tacho das 22h no dia seguinte, na data impressa na etiqueta do lote
(`src/i18n/Locale.tsx:32-34`).

#### 18.2.4 `ErrorBoundary` e `Crash`

O Expo Router usa um export nomeado `ErrorBoundary` no layout para substituir a
tela quando a renderização lança (`app/_layout.tsx:16-23`). A assinatura é
imposta pelo router:

```
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> })
```

Ela desenha **a mesma tela** que a falha de banco desenha, e isso é decisão
escrita: para quem está com o celular na mão é o mesmo evento — parou, nada foi
perdido, dá para tentar de novo (`app/_layout.tsx:80-82`). O `retry` da
`ErrorBoundary` é uma promessa e é chamado com `void retry()`
(`app/_layout.tsx:29`).

`Crash` (`src/components/Crash.tsx:26-90`) desenha, nesta ordem:

| Elemento | Texto (pt-BR) | Fonte |
|---|---|---|
| título | "Alguma coisa travou aqui" | `src/i18n/locales/pt-BR.ts:45` |
| tranquilização | "Nada do que você registrou se perdeu. O aplicativo guarda cada lançamento no aparelho no momento em que você confirma, então é só voltar e continuar de onde parou." | `src/i18n/locales/pt-BR.ts:46-47` |
| botão | "Tentar de novo" — `Pressable` com fundo `color.ink`, `borderRadius: radius.pill` | `src/i18n/locales/pt-BR.ts:48`, `src/components/Crash.tsx:49-65` |
| dobra técnica | rótulo "DETALHE TÉCNICO" e um `ScrollView` de `maxHeight: 180` com `` `${brand.name} · ${error.name}: ${error.message}` `` mais a pilha | `src/i18n/locales/pt-BR.ts:49`, `src/components/Crash.tsx:67-87` |

As três regras estão escritas no docblock: dizer primeiro que nada foi perdido
(é a única pergunta que a pessoa tem, e é verdade por construção — toda escrita
é confirmada localmente em transação antes de qualquer tela desenhá-la); dar um
botão que funciona; e guardar o detalhe técnico dobrado, porque é a única
descrição da falha que vai existir — ninguém vai reproduzir aquilo num celular
dentro de uma câmara fria (`src/components/Crash.tsx:15-24`).

#### 18.2.5 `WhatsNew`

Folha modal que abre uma vez por versão. A chave é
`` `${brand.slug}:release-seen` `` → `norva:release-seen`, no `AsyncStorage`
(`src/components/WhatsNew.tsx:10`). A regra que importa: quando a chave volta
`null` (primeira instalação), a versão atual é **arquivada como já vista, em
silêncio**, e a folha não aparece — porque nada foi atualizado numa primeira
instalação e dizer que foi seria a primeira frase do aplicativo para alguém que
ainda não decidiu confiar nele (`src/components/WhatsNew.tsx:38-47`). Falha de
armazenamento é engolida de propósito: o pior caso é mostrar o aviso duas vezes,
e recusar abrir o aplicativo por causa de uma preferência ausente seria muito
pior (`src/components/WhatsNew.tsx:20-23,49,58`). O e2e cobra o silêncio na
instalação virgem: `assert.doesNotMatch(text, /se atualizou sozinho/)`
(`e2e/flow.mjs:201-202`).

---

### 18.3 As cinco abas: `app/(tabs)/_layout.tsx`

O componente importa `Tabs` de **`expo-router/js-tabs`** (não de `expo-router`)
(`app/(tabs)/_layout.tsx:1`).

A ordem é a ordem do dia, e está escrita: *o que está acontecendo agora, o que
você fez, o que saiu, quanto tudo somou, e as gavetas que você abre uma vez por
mês* (`app/(tabs)/_layout.tsx:20-22`). Ela substituiu uma lista de nove linhas na
capa — um menu que o dono tinha que ler antes de fazer qualquer coisa
(`app/(tabs)/_layout.tsx:18-19`).

| # | `name` | Rota | Ícone | Cor ambiente | Rótulo (chave) | Texto pt-BR |
|---|---|---|---|---|---|---|
| 1 | `index` | `/` | `IconHome` | `sky` | `t.app.tabs.home` | "Início" |
| 2 | `production` | `/production` | `IconProduction` | `apricot` | `t.app.tabs.production` | "Produção" |
| 3 | `transport` | `/transport` | `IconTransport` | `lilac` | `t.app.tabs.transport` | "Transporte" |
| 4 | `reports` | `/reports` | `IconReports` | `sand` | `t.app.tabs.reports` | "Relatórios" |
| 5 | `more` | `/more` | `IconMore` | `mist` | `t.app.tabs.more` | "Mais" |

(`app/(tabs)/_layout.tsx:111-145`; textos em `src/i18n/locales/pt-BR.ts:163-169`.)

**Duas regras de contenção, as duas do desenho** (`app/(tabs)/_layout.tsx:24-27`):

- a cor vive **só no traço do ícone** — sem superfície colorida, sem pílula
  preenchida atrás da aba ativa;
- o **único** sinal de seleção é a cor do rótulo indo de `color.inkFaint` para
  `color.ink`; o ícone mantém a cor da área dele esteja a aba ativa ou não, para
  a barra ler como cinco portas acesas em vez de uma gritando
  (`app/(tabs)/_layout.tsx:68`).

`screenOptions` (`app/(tabs)/_layout.tsx:96-110`):

| Propriedade | Valor |
|---|---|
| `headerShown` | `false` |
| `tabBarStyle.backgroundColor` | `color.paper` |
| `tabBarStyle.borderTopColor` | `color.line` |
| `tabBarStyle.borderTopWidth` | `1` |
| `tabBarStyle.height` | `58 + space.lg` = `58 + 16` = **74** (`src/theme/tokens.ts:163`) |
| `tabBarStyle.paddingTop` | `space.sm` = `8` |
| `tabBarShowLabel` | `true` |

**O rótulo é desenhado à mão** (`app/(tabs)/_layout.tsx:61-80`), e o docblock
registra a cicatriz inteira: a foto do celular do dono mostrava "Transpo…" e
"Relatóri…". A ferramenta de captura fotografava 412 px, onde a palavra cabe; a
360 px — o Android comum, o celular que uma fábrica de seis pessoas compra — ela
não cabe. Rótulo cortado é pior que rótulo pequeno, porque quem lê de luva com a
tela suja reconhece a **palavra**, não o prefixo dela. Três correções, nenhuma
delas encolhendo o texto do resto do aplicativo:

| Propriedade | Valor | Motivo escrito |
|---|---|---|
| `fontSize` | `12` (o corpo do app é 17) | a barra é a única tipografia que divide a largura da tela por cinco (`app/(tabs)/_layout.tsx:66,55-57`) |
| `lineHeight` | `16` | — |
| `marginTop` | `2` | — |
| `textAlign` | `'center'` | — |
| `numberOfLines` | `1` | — |
| `adjustsFontSizeToFit` | `true` | no aparelho a palavra encolhe até caber em vez de perder letras; é ignorado na web, e por isso o 12 já cabe a 360 sem ele (`app/(tabs)/_layout.tsx:52-54`) |
| `minimumFontScale` | `0.8` | piso do encolhimento |
| `maxFontSizeMultiplier` | `1.15` | teto para a fonte grande do Android não estourar a palavra (`app/(tabs)/_layout.tsx:58-59`) |

O ícone é uma **função que devolve um componente nomeado**
(`app/(tabs)/_layout.tsx:84-93`): uma arrow anônima ali seria um componente que
a ferramenta do React não consegue rotular, e uma barra de abas que quebra
reportaria cinco quadros idênticos (`app/(tabs)/_layout.tsx:82-83`). O ícone é
desenhado dentro de `View` com `height: 26, justifyContent: 'center'`, com
`size={24}` e `color={palette[area]}`.

A barra é alcançável por papel de acessibilidade: o e2e espera por
`page.getByRole('tab', { name: tab })` para os cinco nomes, porque "uma barra de
abas que o leitor de tela não enxerga é uma barra que não existe para quem usa
luva e voz" (`e2e/flow.mjs:254-258`).

---

### 18.4 A capa: `app/(tabs)/index.tsx`

`Home` é só o invólucro: `AreaProvider area="sky"` envolvendo `<Briefing />`
(`app/(tabs)/index.tsx:87-93`). O nome do arquivo é a tela; o desenho é
`src/home/Mosaic.tsx`, e essa delegação está registrada como exceção na guarda
de linguagem visual: `DELEGAM = { 'app/(tabs)/index.tsx': 'src/home/Mosaic.tsx' }`
(`src/language.test.ts:39-41`).

O docblock declara o que a capa é: *um painel mostra totais; um briefing diz o
que mexeu e o que fazer a respeito*. O dono já sabe quanto estoque tem na câmara
— o que ele não pode saber sem o aplicativo é que a polpa subiu 9% na terça e
levou três centavos por unidade com ela (`app/(tabs)/index.tsx:60-66`).

**Por que o dado da capa mora fora do desenho** — e esta é a metade da história que
explica a arquitetura que sobrou (`src/home/types.ts:5-12`, e o docblock anterior de
`app/(tabs)/index.tsx:41-48`): *"O dono pediu para ver as opções em vez de escolher no
escuro ('faz tudo, eu quero exemplos'), e três desenhos da mesma tela só são
comparáveis se os três receberem exatamente o mesmo dado. A consulta fica em
`index.tsx`, uma só; cada layout é uma função pura daqui para baixo."*

A escolha do Mosaico apagou os outros dois layouts, mas **não** apagou a separação:
`Summary` continua sendo o contrato entre o que a capa sabe e como ela desenha. Sem
essa razão escrita, a divisão `types.ts` / `Mosaic.tsx` parece cerimônia, e a próxima
pessoa embute a consulta dentro do desenho — o que faria qualquer comparação futura
medir consultas diferentes em vez de desenhos diferentes.

Duas versões alternativas da capa (`Editorial` e `Blocks`) **foram removidas**
quando o dono escolheu o Mosaico, e o motivo está escrito: a partir da escolha,
`LAYOUT` era uma constante com um valor só, e as outras duas eram código sem
chamador — o P1 do `CLAUDE.md`. O custo delas não era o arquivo parado, era o
próximo widget, que teria de ser escrito três vezes
(`app/(tabs)/index.tsx:49-58`).

#### 18.4.1 As janelas de tempo que a consulta monta

Todas saem de `dayWindow`/`localDate` no **fuso da fábrica**
(`locale.timeZone`), nunca do relógio do aparelho
(`app/(tabs)/index.tsx:117-140`):

| Nome | Expressão | O que é |
|---|---|---|
| `today` | `dayWindow(nowIso(), tz)` | o dia da fábrica, meia-noite local a meia-noite local |
| `then` | `dayWindow(nowIso(), tz, -7)` | o **mesmo dia da semana** uma semana atrás — "segunda e sábado são negócios diferentes e comparar os dois não ensina nada" (`app/(tabs)/index.tsx:114-116`) |
| `yesterday` | `dayWindow(nowIso(), tz, -1)` | o dia anterior; entra **ao lado** de `then`, não no lugar (pedido do dono) (`app/(tabs)/index.tsx:119-122`) |
| `lastWeek` | `dayWindow(nowIso(), tz, -7)` | início da janela de consumo para `runningOut` |
| `weekAgo` | `dayWindow(nowIso(), tz, -6)` | seis dias atrás mais hoje = sete colunas; a janela começa na meia-noite local do primeiro dia para a primeira coluna não nascer cortada (`app/(tabs)/index.tsx:124-126`) |
| `through` | `localDate(nowIso(), tz, 7)` | uma semana à frente: a pergunta do pedido é "dá tempo?", e ela só tem resposta enquanto ainda dá — Lei 4 (`app/(tabs)/index.tsx:127-130`) |
| `weekday` | `new Date(localDate(...)+'T00:00:00Z').getUTCDay()` | o dia da semana no fuso da FÁBRICA: ler do relógio do aparelho dá o dia errado para quem trabalha de madrugada num fuso e o servidor noutro (`app/(tabs)/index.tsx:131-133`) |
| `mes` | `dayWindow(nowIso(), tz, -29)` | 30 dias: a janela em que uma fábrica decide (`app/(tabs)/index.tsx:135-138`) |
| `mesAnterior` | `{ de: dayWindow(..., -59), ate: dayWindow(..., -30) }` | o mês anterior, para a comparação da peça de perdas |
| `trintaDias` | `localDate(nowIso(), tz, 30)` | horizonte de validade: o que vence depois disso não é decisão de hoje — Lei 4 |

`dayWindow` é semiaberto (`from` incluído, `to` excluído) e pergunta ao `Intl`
qual é o dia local em vez de fazer aritmética, o que o mantém correto num dia de
horário de verão de 23 ou 25 horas (`src/domain/day.ts:49-68`).

#### 18.4.2 As dezessete consultas paralelas

Um `Promise.all` só (`app/(tabs)/index.tsx:142-188`):

| Destino | Chamada | Devolve |
|---|---|---|
| `changes` | `recentCostChanges(LOCAL_COMPANY_ID, 12)` | `CostChange[]`: `itemId, name, previousRate, newRate, observedAt` — de `item_cost_history`, só com `previous_rate IS NOT NULL`, `ORDER BY observed_at DESC LIMIT 12` (`src/data/repository.ts:2031-2061`) |
| `madeToday` | `productionOn(companyId, today.from, today.to)` | `ProducedInWindow[]`: `itemId, name, baseUnits` — `SUM(quantity_base_units)` de `movements` com `kind='production'`, filtrado por `occurred_at` e **nunca** por `recorded_at` (`src/data/repository.ts:2548-2586`) |
| `madeThen` | `productionOn(..., then.*)` | idem, uma semana atrás |
| `madeYesterday` | `productionOn(..., yesterday.*)` | idem, ontem |
| `sent` | `shipmentsOn(companyId, today.from, today.to)` | `Shipment[]`: `groupIds[], locationId, locationName, kind, items[{itemId,name,baseUnits,baseUnit,packaging}], checked` — lê as pernas POSITIVAS das transferências (`src/data/repository.ts:3247-3305`) |
| `sentYesterday` | `shipmentsOn(..., yesterday.*)` | idem, ontem |
| `running` | `openProductionRuns(companyId)` | `OpenRun[]`: `id, productId, productName, recipeId, recipeVersionId, batches, locationId, openedAt` (`src/data/repository.ts:2232-2320`) |
| `shortly` | `runningOut(companyId, lastWeek.from, today.to, 7)` | `Running[]`: `itemId, name, baseUnit, onHandBaseUnits, dailyOutflow, daysLeft`, com horizonte padrão de 7 dias e tipos `['input','packaging']` (`src/data/repository.ts:3766-3806`) |
| `demand` | `stockAgainstOrders(companyId, through)` | `Demand[]`: `itemId, name, requested, onHand` — uma linha **por produto**, não por linha de pedido (`src/data/repository.ts:4108-4150`) |
| `week` | `productionBetween(companyId, weekAgo.from, today.to)` | `{occurredAt, baseUnits}[]`, movimento por movimento (`src/data/repository.ts:2610-2622`) |
| `runs` | `recentRuns(companyId, 6)` | `Run[]`: `lotId, code, name, baseUnits, occurredAt, unitCostRate` — uma linha por **movimento** de produção, não por lote (`src/data/repository.ts:2886-2917`) |
| `cover` | `runningOut(companyId, lastWeek.from, today.to, 7, Number.POSITIVE_INFINITY)` | o mesmo cálculo **sem horizonte**: aqui a pergunta não é "o que acaba esta semana" (isso é o cartão de insumo) e sim "quanto tempo o estoque dura", que é o normal contra o qual a semana se compara (`app/(tabs)/index.tsx:172-175`) |
| `expiring` | `expiringSoon(companyId, trintaDias, 5)` | `Expiring[]`: `lotId, code, name, expiresOn, baseUnits` |
| `lossesNow` | `lossesOn(companyId, mes.from, today.to)` | `LossRow[]`: `itemId, name, baseUnits, baseUnit, reason, locationName, valueCents, occurredAt`, ordenado por dinheiro (`src/data/repository.ts:2168-2191`) |
| `lossesBefore` | `lossesOn(companyId, mesAnterior.de.from, mesAnterior.ate.to)` | idem, mês anterior |
| `places` | `listPlaces(companyId)` | `Place[]`: `id, name, kind, isDefault, contactPhone, deliveryDays, agreementNote, sensorRanges` (`src/data/repository.ts:565-594`) |
| `stockItems` | `listItems(companyId)` | `ItemWithCost[]`: `Item & { averageRate, lastRate, onHandBaseUnits, active }` (`src/data/repository.ts:53-59`) |

**Uma decisão de escopo digna de nota:** `expiringSoon` é chamado **sem
`locationId`** (`app/(tabs)/index.tsx:176-183`). O comentário registra o bug que
isso conserta: filtrando pelo almoxarifado, o filtro silenciava o aviso
exatamente quando o lote saía — a soma por local de um lote que foi para a
câmara fria dá zero no almoxarifado, e o `HAVING > 0` o descartava. Uma fábrica
de picolés manda picolé para a câmara; dali em diante o cartão nunca mais
avisava de nada, e o produto vencia dentro dela.

#### 18.4.3 O que a tela deriva antes de desenhar

O objeto devolvido tem o tipo `Summary` (`src/home/types.ts:13-50`):

| Campo | Fórmula exata | Fonte |
|---|---|---|
| `changes` | passa direto | `app/(tabs)/index.tsx:233` |
| `demand`, `demandThrough` | passam direto (`demandThrough = through`) | `:234-235` |
| `madeToday`/`madeThen`/`madeYesterday` | `rows.reduce((n,r) => n + r.baseUnits, 0)` | `:190,236-238` |
| `series` | `dailySeries(week, tz, nowIso(), 7)` — sete dias, do mais antigo para hoje, com **zero** nos dias parados (`src/domain/day.ts:142-159`) | `:239` |
| `shortly` | passa direto | `:240` |
| `everMade` | `madeToday.length > 0 \|\| madeThen.length > 0` | `:241` |
| `boxes` | `contarVolumes(sent, loose)` | `:225` |
| `boxesYesterday` | `contarVolumes(sentYesterday, null)` — ontem entra só como número; a Lei 3 pede a comparação, não a lista de ontem inteira | `:226-228` |
| `loose` | preenchido por `contarVolumes` | `:224` |
| `running` | `running.map(r => ({ id, productName, openedAt }))` | `:245-249` |
| `runs`, `cover`, `expiring` | passam direto | `:250-252` |
| `lossesNow` | `lossesNow.reduce((n,l) => n + l.valueCents, 0)` | `:253` |
| `lossesBefore` | idem, mês anterior | `:254` |
| `lossesWorst` | `worstReason(lossesNow)` | `:255` |
| `dueToday` | `places.filter(p => daysUntilNextDelivery(p.deliveryDays, weekday) === 0).map(p => ({ id, name, sent: sent.some(s => s.locationId === p.id) }))` | `:256-263` |
| `heldCents` | `stockItems.filter(i => i.kind === 'input' \|\| i.kind === 'packaging').reduce((n,i) => n + Math.round(i.averageRate * i.onHandBaseUnits), 0)` | `:264-268` |

**`contarVolumes`** (`app/(tabs)/index.tsx:197-222`) é a regra de "caixa é
objeto": dezoito caixas são dezoito coisas que alguém empilha no caminhão,
tenham elas cinquenta picolés ou vinte e quatro, e somar isso entre itens é
honesto. O que **não** é honesto é fingir que um saco de açúcar é caixa porque o
total fica mais redondo — então o item sem camada acima da base sai da conta e é
dito por nome. Para cada item de cada destino: `boxesOf(item.baseUnits,
item.packaging)`; havendo volume, soma `volume.boxes`; não havendo, empurra
`{ name, said: `${formatQuantity(item.baseUnits, locale)} ${item.baseUnit}` }`
para `loose`. A unidade sai de `item.baseUnit` e **não** de `formatPacked`,
porque para item solto a única faixa é `unit` e `formatPacked` traduziria
"unidade" para seis quilos de açúcar: a capa dizia "6.000 unidades de Açúcar
cristal" (`app/(tabs)/index.tsx:209-217`). `boxesOf` acha a maior camada com
`perBaseUnit > 1` e devolve `null` quando não há nenhuma
(`src/domain/units.ts:100-109`).

**`heldCents` é dinheiro parado só de insumo e embalagem** — que é o que se
compra. Produto acabado é outra conta, e somar os dois esconde as duas
(`app/(tabs)/index.tsx:264-266`). O arredondamento acontece **uma vez por item**,
sobre `averageRate * onHandBaseUnits` — `Rate` é fracionário, `Cents` é inteiro.

**`worstReason`** (`app/(tabs)/index.tsx:102-107`) agrupa as perdas por
`reason`, soma `valueCents` por motivo e devolve o maior. Existe porque "sumiram
quatro quilos" não muda decisão nenhuma; "quatro quilos venceram" muda a compra,
e "derreteram" muda a manutenção do freezer (`app/(tabs)/index.tsx:96-100`).

`daysUntilNextDelivery(days, todayWeekday)` devolve **0 quando hoje é dia de
entrega** (de propósito: quem faz o pedido de manhã no dia da loja está pedindo
para hoje) e `null` quando não há acordo (`src/domain/agreement.ts:46-64`).

#### 18.4.4 As duas consultas separadas

**O clima é uma consulta À PARTE, e essa separação é a coisa importante**
(`app/(tabs)/index.tsx:272-283`):

```
const { data: weather } = useQuery<Forecast | null>(() => forecastForScreen(locale.timeZone));
const sky = weather ? reading(weather, dayWindow(nowIso(), locale.timeZone).from.slice(0, 10)) : null;
```

Todo o resto da tela sai do SQLite e responde em milissegundos; o tempo vem da
internet, que numa fábrica é a coisa menos confiável do prédio. Pendurar a
previsão no mesmo `Promise.all` faria a capa inteira esperar pela rede: oito
segundos de tela vazia para mostrar o que o banco já tinha respondido
(`app/(tabs)/index.tsx:273-281`).

**A preferência de peças é a terceira consulta** (`app/(tabs)/index.tsx:326-330`):

```
const { data: preferencia } = useQuery(async () => {
  const [order, hidden] = await Promise.all([briefingOrder(), briefingHidden()]);
  return briefingLayout(order, hidden);
});
```

`useQuery` (`src/data/useQuery.ts:21-92`) é deliberadamente pequeno — nenhuma
biblioteca de fetch, porque toda consulta é SQLite local. Duas propriedades
importam para a capa: a chave é uma string (não um array de dependências), e
`loading` é derivado de a resposta em mão pertencer à pergunta feita, o que faz
o `refresh` continuar mostrando a resposta anterior em vez de piscar vazio
(`src/data/useQuery.ts:14-19`). E há um `useFocusEffect` que reconsulta ao voltar
o foco — sem ele, a capa, que é a raiz da pilha e monta uma vez por abertura,
**nunca** recarregava: lançava-se uma nota, tocava-se Voltar, e o aplicativo
continuava dizendo "nada mudou de preço" com o custo velho ao lado
(`src/data/useQuery.ts:66-84`). É exatamente o que a checagem "the briefing is up
to date when you tap Back into it" prova no navegador (`e2e/flow.mjs:605-660`).

#### 18.4.5 As frases que a tela escreve (e a camada de dados não)

**`comparison(today, then)`** (`app/(tabs)/index.tsx:285-295`), com `day =
t.app.home.lastWeekday` = "na semana passada":

| Caso | Resultado |
|---|---|
| `then === 0` | "primeira produção registrada" (`producedFirst`) |
| `today === then` | "mesmo que na semana passada" (`producedSame`) |
| `today > then` | "{{amount}} a mais que na semana passada" (`producedMore`) |
| `today < then` | "{{amount}} a menos que na semana passada" (`producedLess`) |

`amount` é `` `${formatQuantity(Math.abs(today-then), locale)} ${plural(Math.abs(today-then), t.units.unit)}` ``.

**`shortForOrders`** (`app/(tabs)/index.tsx:297-309`):
`demand.map(d => ({...d, missing: d.requested - d.onHand})).filter(d => d.missing > 0).sort((a,b) => b.missing - a.missing)`.
A subtração está na tela e não na consulta porque a camada de dados devolve
fato — pedido e saldo — e "falta produzir 300" é português. E o cartão só grita
quando falta de verdade: pedido coberto vira um cartão calmo, porque "está tudo
bem" é estado válido e alerta inventado ensina a ignorar alerta.

**`moved`** (`app/(tabs)/index.tsx:311-324`): filtra mudanças reais
(`previousRate !== null && previousRate !== newRate`), **desduplica por item**
mantendo a primeira ocorrência (que é a mais recente, pela ordem da consulta) e
corta em 4. O docblock registra o defeito: com duas semanas de notas a capa
mostrava "Polpa de morango" quatro vezes seguidas com quatro percentuais
diferentes — a tela do dono virou extrato. A pergunta da capa não é "quais foram
as últimas notas", é "o que está diferente agora", e para isso cada insumo tem
uma resposta só.

#### 18.4.6 O objeto que a capa entrega ao desenho

`BriefingView` (`src/home/types.ts:52-68`), montado em
`app/(tabs)/index.tsx:332-341`:

```
layout: preferencia ?? briefingLayout([], []),
data: data ?? null,
sky, weather: weather ?? null,
shortForOrders, moved, comparison,
go: (route) => router.push(route as Parameters<typeof router.push>[0]),
```

Enquanto a consulta de preferência não respondeu, vale `briefingLayout([], [])`
— a ordem de fábrica, não uma capa vazia. E o render é uma linha:

```
<CollapsingHeader title={brand.name} overline={formatWeekday(nowIso(), locale)}>
  <Mosaic {...view} />
</CollapsingHeader>
```
(`app/(tabs)/index.tsx:343-347`)

#### 18.4.7 O que a prancha desenha e esta tela deliberadamente não mostra

Registrado no docblock (`app/(tabs)/index.tsx:74-85`), como fronteira e não como
falta: "estável há 12 dias" não existe porque `item_cost_history` tem o dado e a
consulta que o lê **não existe** — NÃO IMPLEMENTADO. As outras duas ("1.200
picolés hoje" e "18 caixas enviadas") **passaram a existir** com
`productionOn()` e `shipmentsOn()`, cada uma com a comparação que a Lei 3 exige.

---

### 18.5 O catálogo de peças, a ordem e o silenciar

`src/domain/briefing.ts` é o dono da lista. São **catorze** ids, nesta ordem
exata (`src/domain/briefing.ts:23-38`):

```
producao, aoVivo, historico, insumos, cobertura, pedidos, entregaHoje,
expedicao, validade, perdas, custo, precos, clima, parado
```

`type BriefingWidget = (typeof BRIEFING_WIDGETS)[number]`
(`src/domain/briefing.ts:40`).

**A preferência tem dois donos, e essa é a decisão mais importante do arquivo**
(`src/domain/briefing.ts:9-16`):

- **A ordem é da EMPRESA.** Se o dono monta a capa que quer e o operador vê
  outra, a frase mais comum de uma fábrica — *"olha lá na tela inicial"* — deixa
  de funcionar.
- **O silenciar é do APARELHO.** Quem está na câmara fria não quer o cartão de
  preço no caminho, e isso não muda o que a casa combinou.

E a regra que impede o painel bonito e inútil: **ligar não é forçar.** Peça
ligada que não tem o que dizer continua não aparecendo — sem isso a capa enche
de "0 caixas hoje", que é a definição do alerta que ensina a ignorar alerta
(`src/domain/briefing.ts:18-21`).

**Nascem desligadas:** `DEFAULT_OFF = new Set(['custo', 'parado'])`
(`src/domain/briefing.ts:58`). O motivo geral está escrito: dado disponível não
é motivo para ocupar a primeira tela (`src/domain/briefing.ts:42-56`). O
primeiro caso foi o widget "tacho rodando", que acabou saindo do catálogo
inteiro — era o mesmo assunto da produção ao vivo, dito com uma palavra de
fábrica de sorvete num aplicativo que vai para qualquer fábrica.

**`briefingLayout(companyOrder, hiddenOnDevice)`**
(`src/domain/briefing.ts:68-85`), o algoritmo por extenso:

1. `ordenadas` = `companyOrder` filtrado pelo que é id conhecido (id que saiu do
   catálogo simplesmente desaparece da preferência, sem quebrar nada);
2. `novas` = os ids do catálogo que **não** estão em `ordenadas` **e não** estão
   em `DEFAULT_OFF` — peça nova entra sozinha no fim, menos as que nascem fora
   da capa, que esperam alguém pedir;
3. resultado = `[...ordenadas, ...novas]` menos tudo que está em
   `hiddenOnDevice`.

Portanto **a ordem de fábrica** (`briefingLayout([], [])`) é:

```
producao, aoVivo, historico, insumos, cobertura, pedidos,
entregaHoje, expedicao, validade, perdas, precos, clima
```

Três funções auxiliares completam a edição:
`widgetsOffCover(layout)` devolve o que existe e não está na capa
(`src/domain/briefing.ts:88-90`); `addWidget(order, widget)` acrescenta no fim da
ordem **da empresa** — porque pôr um cartão na primeira tela é decisão de casa
(`src/domain/briefing.ts:92-104`); `moveWidget(order, widget, 'up'|'down')` troca
com o vizinho, e a escolha por seta em vez de arrastar é escrita: arrastar pede
pressão longa e precisão, que é o que menos existe numa mão de luva a -18 °C
(`src/domain/briefing.ts:106-127`).

**Onde isso é guardado:** `briefing.order` e `briefing.hidden` no `app_meta`,
como texto separado por vírgula e não JSON, porque é uma lista de palavras curtas
que alguém pode precisar ler no banco durante um suporte —
`producao,clima,insumos` se lê (`src/data/repository.ts:3888-3922`). Vazio quer
dizer "a ordem que veio de fábrica", nunca "capa vazia".

**A tela que edita** é Ajustes (`app/settings.tsx:732-822`): uma linha por peça
com o nome traduzido (`t.app.settings.briefing.widgets.*`,
`src/i18n/locales/pt-BR.ts:451-466`), um `Chip` de
"Mostrar"/"Esconder" com `accessibilityRole="switch"`, duas setas
(`IconChevron` girado) desabilitadas nas pontas, e a seção **"FORA DA CAPA"**
com "Colocar na capa" para o que `widgetsOffCover` devolveu. O rótulo de acesso é
`` `${nome}: ${Mostrar|Esconder}` ``, que é como o e2e alcança a linha
(`e2e/flow.mjs:1856`). O texto de ajuda diz a divisão de donos por extenso: "A
ordem é da casa: todo mundo vê a mesma capa. Esconder é só neste aparelho."
(`src/i18n/locales/pt-BR.ts:443`).

O e2e prova o ciclo inteiro: esconder "Tempo" faz o cartão do clima sair da capa
daquele aparelho (`assert.doesNotMatch(..., /medido às|trocar a cidade/`), e
mostrar de novo o traz de volta — esconder não é apagar
(`e2e/flow.mjs:1854-1874`). Prova também que `custo` e `parado` aparecem na
lista "FORA DA CAPA" (`e2e/flow.mjs:1879-1884`).

---

### 18.6 A mecânica de abrir: `Peca` e `Card`

`Peca` (`src/home/Peca.tsx:31-127`) é o widget que **abre no lugar**. O docblock
registra o pedido e a correção: o dono pediu widgets "dinâmicos e clicáveis", e
a primeira versão respondia com navegação — tocar levava para outra tela. Não é
a mesma coisa, e ele estava certo: sair da capa custa a capa. "Quanto saiu hoje?"
tem uma resposta curta que cabe no cartão e uma longa que cabe embaixo dela;
navegar para a segunda joga a primeira fora (`src/home/Peca.tsx:14-30`).

Duas consequências, ambas de propósito:

- **Uma peça aberta por vez.** Duas abertas empurram o resto para fora da tela e
  a capa deixa de ser capa; abrir uma fecha a outra sozinha. Quem guarda isso é
  o Mosaico: `const [aberta, setAberta] = useState<BriefingWidget | null>(null)`
  e `abrir = (id) => setAberta(atual => (atual === id ? null : id))` — o segundo
  toque fecha (`src/home/Mosaic.tsx:75-82`).
- **Peça sem mais nada a dizer não convida.** Sem a prop `mais`, não há seta,
  não há `Touchable`, e o toque não faz nada — botão que não obedece é pior que
  botão ausente (`src/home/Peca.tsx:27-29,118`).

Props (`src/home/Peca.tsx:31-60`):

| Prop | Tipo | Papel |
|---|---|---|
| `index` | `number?` | posição na cascata de entrada |
| `hue` | `string?` | a cor do assunto |
| `tone` | `'plain' \| 'area' \| 'warning'` | tom quando não há `hue` |
| `icon` | `(color: string) => ReactNode` | **obrigatório**, ao contrário do `Card`: peça é sempre um assunto da capa, e assunto sem desenho vira mais um parágrafo cinza (`src/home/Peca.tsx:45-52`) |
| `title` | `string?` | — |
| `aberta` | `boolean` | — |
| `onToggle` | `() => void` | — |
| `children` | `ReactNode` | o **resumo**, que é o que a capa mostra fechada |
| `mais` | `ReactNode?` | o **detalhe**, que só existe depois do toque; ausente, a peça não abre |

A animação: um único `useSharedValue` `aberto` (0 fechado, 1 aberto) alimenta as
duas coisas na mesma mola `withSpring(..., { damping: 18, stiffness: 180 })` — o
detalhe entra com `opacity: aberto` e `translateY: (1-aberto) * -10`, e a seta
`▾` gira `aberto * 180deg`. É o mesmo gesto dito duas vezes, e é o que faz a
peça parecer uma coisa em vez de duas (`src/home/Peca.tsx:64-97,107-109`). Com
"reduzir movimento" ligado, o valor é atribuído direto, sem mola
(`src/home/Peca.tsx:76-89`).

O rodapé do convite é `▾` mais `t.app.home.less`/`t.app.home.more` →
"toque para fechar" / "toque para ver mais"
(`src/home/Peca.tsx:110-112`; `src/i18n/locales/pt-BR.ts:101-102`).

`Entrada` (`src/home/Peca.tsx:129-159`) é a entrada escalonada, e o detalhe de
segurança está escrito: ela **começa visível** (`useSharedValue(1)`) e sobe para
o lugar, nunca em opacidade zero — se o caminho da animação falhar (plugin de
worklets fora do babel, biblioteca não carregando no navegador), o pior caso é a
peça aparecer sem o gesto. Uma capa em branco com o banco cheio é o pior defeito
possível numa fábrica. A duração é `320 + index * motion.staggerMs` ms, com
`staggerMs = 40` (`src/theme/tokens.ts:181`), e o estilo é
`opacity: 0.2 + chegou * 0.8`, `translateY: (1 - chegou) * 14`.

`Reveal` (`src/components/Reveal.tsx:36-76`) faz o mesmo para os cartões que não
são `Peca`: mola `motion.settle` (`{damping:18, stiffness:140, mass:1}`),
atraso `index * 40ms`, `translateY` de 14 px, e também começa visível pelo mesmo
motivo.

`Card` (`src/components/Card.tsx:43-178`) é o casco de todo cartão. Duas formas,
por identidade:

| | Orgânico | Papel |
|---|---|---|
| fundo | `tint(toneColor, 0.08)` no claro, `0.13` no escuro | transparente |
| borda | inteira em `tint(toneColor, 0.24/0.34)`, mais o trilho esquerdo de `RAIL_WIDTH = 3` na cor cheia | **nenhuma**, só uma régua no topo: `1.5` na cor do assunto, ou `hairlineWidth` em `color.line` |
| cantos | `radius.xl` = 24 | `0` |
| crachá do ícone | quadrado 40×40 com fundo `tint(cor, 0.14/0.22)` e `radius.lg` | sem crachá: o desenho fica na página |

(`src/components/Card.tsx:92-95,114-174`; `src/theme/tokens.ts:166,188`.)

O `tone` resolve para `hue ?? (area → accent | danger → color.danger | warning →
color.warning | plain → null)` (`src/components/Card.tsx:82-90`). E há uma
restrição de tipo deliberada: `title` só existe junto com `icon`, porque o
cabeçalho inteiro só existe quando há ícone e um `title` sozinho sumia em
silêncio (`src/components/Card.tsx:63-79`).

`Touchable` (`src/components/Touchable.tsx:20-53`) é o que faz o cartão afundar:
escala `motion.pressScale = 0.97` com a mola `motion.press`
(`{damping:20, stiffness:400, mass:0.6}`), `accessibilityRole="button"` e
`accessibilityLabel` **obrigatório**. Fica sobre `Pressable` e não sobre o
`Card`, porque nem todo cartão é tocável.

---

### 18.7 O mosaico, peça por peça

`Mosaic` (`src/home/Mosaic.tsx:42-918`) monta um
`Record<BriefingWidget, ReactNode>` chamado `pecas`
(`src/home/Mosaic.tsx:94-836`) e no fim renderiza **só o que o layout pediu, na
ordem que ele deu**:

```
return <>{layout.map((id) => <Fragment key={id}>{pecas[id]}</Fragment>)}</>;
```
(`src/home/Mosaic.tsx:917`)

A ideia do desenho: uma manchete grande e peças pequenas embaixo — nem todo
assunto merece a largura da tela. O que saiu do tacho merece; uma caixa que foi
para a loja não. Peças de meia largura lado a lado fazem o olho entender a
hierarquia sem ler uma palavra, e quebram a pilha de retângulos iguais que o
dono recusou (`src/home/Mosaic.tsx:34-41`).

Três variáveis de topo governam o arquivo:

- `traco = skin === 'papel' ? 1.7 : 2.2` — a espessura do traço é da identidade:
  fino no Papel, cheio no Orgânico (`src/home/Mosaic.tsx:55-56`);
- `corDoDia = sky ? skyInk(sky.today.maxC, {palette, brand, skin}) : palette.sky`
  — uma cor só para o cartão do clima inteiro (`src/home/Mosaic.tsx:58-59`);
- `temPedido = (data?.demand ?? []).some(d => d.requested > 0)`
  (`src/home/Mosaic.tsx:61-73`). Isto é uma correção com motivo longo escrito:
  `stockAgainstOrders` devolve uma linha por **produto** para a tela de anotar
  pedido poder dizer quanto está livre antes do primeiro pedido existir. Medindo
  o **tamanho da lista**, a capa de uma fábrica que nunca vendeu nada mostrava
  "Pedidos cobertos" — um cartão afirmando que está tudo atendido quando não há
  nada para atender — e o convite do primeiro dia sumia.

E `comCusto = (data?.runs ?? []).filter(r => r.unitCostRate !== null)` — as
corridas que têm taxa congelada, que é o que a peça de custo compara
(`src/home/Mosaic.tsx:84-85`).

#### Tabela-resumo das catorze peças

| id | Condição de existir | Toque | `Reveal index` | Tom |
|---|---|---|---|---|
| `producao` | sempre (troca de conteúdo no primeiro dia) | nenhum (ou `/production/new` no convite) | 0 | `palette.apricot` |
| `insumos` | um dos dois cartões internos tem dado | `/inputs` e `/transport` | 1 | `warning`/`palette.mint` e `palette.lilac` |
| `pedidos` | `temPedido` | `/orders` | 2 | `color.warning` ou `palette.sage` |
| `clima` | `sky !== null` | abre a semana no lugar | 3 | `palette.sky` |
| `expedicao` | **nunca**: o valor é `null` | — | — | — |
| `precos` | `moved.length > 0` | `/inputs` | 6 | `palette.sand` |
| `aoVivo` | `data.running.length > 0` | abre no lugar | 1 | `palette.apricot` |
| `historico` | `data.runs.length > 0` | abre no lugar | 2 | `palette.sand` |
| `cobertura` | `data.cover.length > 0` | abre no lugar | 3 | `palette.mint` |
| `entregaHoje` | `data.dueToday.length > 0` | abre no lugar | 4 | `palette.lilac` |
| `validade` | `data.expiring.length > 0` | abre no lugar | 5 | `tone="warning"` |
| `perdas` | `lossesNow > 0 \|\| lossesBefore > 0` | abre no lugar | 6 | `palette.apricot` |
| `custo` | alguma corrida com `unitCostRate !== null` | abre no lugar | 7 | `palette.sky` |
| `parado` | `heldCents > 0` | abre no lugar | 8 | `palette.mint` |

**Nota factual sobre os índices:** eles são constantes escritas em cada peça, não
derivados da posição no `layout`. Reordenar a capa em Ajustes **não** reordena o
escalonamento da entrada, e dois índices repetem (1, 2, 3 e 6 aparecem duas
vezes). Isso é o que o código faz.

#### 18.7.1 `producao` — a manchete

`Card` com `hue={palette.apricot}`, ícone `GlyphProduction` e título
`t.app.home.today` → **"Hoje na fábrica"** (`src/home/Mosaic.tsx:95-157`).

Conteúdo, de cima para baixo:

1. **A cena viva, uma por identidade** (`src/home/Mosaic.tsx:103-126`). No Papel,
   `FactoryScene`; no Orgânico, `Landscape` com `height={150}`. As duas obedecem
   a mesma regra: nada se move por decoração.
   - `FactoryScene` recebe `running={(data?.running.length ?? 0) > 0}`,
     `shipped={(data?.boxes ?? 0) > 0}` e
     `dayShare = data && data.madeYesterday > 0 ? Math.min(1, data.madeToday / data.madeYesterday) : data && data.madeToday > 0 ? 1 : null`.
     A fumaça sobe quando há produção aberta; o pote do meio enche na proporção
     do dia contra ontem; a caixa entra pela direita quando saiu carga; sol e
     floco são os únicos decorativos (`src/components/FactoryScene.tsx:18-71`).
   - `Landscape` recebe `maxC`, `rainChance`, `running`. Sem previsão, a paisagem
     existe **sem tempo** — colina, fábrica e sol, e nenhuma nuvem
     (`src/components/Landscape.tsx:30-33,54-67`).
2. **O número grande**: `CountUp` com `value={data?.madeToday ?? 0}` e formato
   `formatQuantity(Math.round(v), locale)`, em `type.figure` (28 px, peso 600)
   (`src/home/Mosaic.tsx:127-131`; `src/theme/tokens.ts:148`). `CountUp` conta de
   0 até o valor em `motion.countMs = 1250` ms com curva cúbica de saída, e vai
   direto ao valor final com "reduzir movimento"
   (`src/components/CountUp.tsx:15-45`; `src/theme/tokens.ts:184`).
3. **A legenda**: `plural(madeToday, t.units.unit)` + `plural(madeToday,
   t.app.home.producedToday)` → "unidades saíram hoje" / "unidade saiu hoje"
   (`src/home/Mosaic.tsx:132-135`; `src/i18n/locales/pt-BR.ts:28,80`). O verbo
   concorda com a contagem porque as duas metades são plurais de verdade — meia
   concordância é pior que nenhuma, e "1 caixa saíram hoje" foi o que apareceu na
   tela do dono (`src/i18n/locales/pt-BR.ts:85-89`).
4. **A régua da semana**: `Bars` com `series={data.series}`,
   `hue={palette.apricot}` e rótulos `formatWeekdayInitial(d.date, locale)`
   (`src/home/Mosaic.tsx:136-142`). A altura é relativa ao **maior dia da própria
   semana**, nunca a uma meta cadastrada — inventar régua para o desenho ficar
   bonito seria número que ninguém pode conferir. O dia de hoje leva a cor cheia;
   os outros ficam em `tint(hue, 0.28)`. Coluna de dia parado é um risco, não um
   vazio (`src/components/Bars.tsx:13-73`).
5. **As duas comparações, na mesma linha** (`src/home/Mosaic.tsx:143-153`):
   `madeYesterday === 0 ? "Ontem não houve produção." : fill("Ontem foram
   {{amount}}.", ...)`, depois `' · '`, depois `comparison(madeToday, madeThen)`.

**As três perguntas da Lei da Inteligência, nesta peça:** *o que é normal* → as
sete colunas de `Bars`; *o que está diferente agora* → o número grande com ontem
e a mesma segunda-feira da semana passada ao lado; *a próxima ação provável* →
NÃO ESTÁ NESTA PEÇA quando a fábrica já trabalhou (o cartão não é tocável); ela
existe só na variante de primeiro dia, e a ação do dia mora no botão da aba
Produção.

#### 18.7.2 `insumos` — a fileira de meia largura

Uma `View` em linha com `gap: space.md` e dois cartões `flex: 1`
(`src/home/Mosaic.tsx:158-224`). O comentário nomeia a intenção: o que não é
manchete divide a linha.

**Cartão A — o insumo que acaba primeiro** (`src/home/Mosaic.tsx:163-184`), com
três estados:

| Estado | Condição | Desenho |
|---|---|---|
| alerta | `data.shortly.length > 0` | `Card tone="warning"`, ícone `GlyphStock`, número `formatQuantity(Math.floor(shortly[0].daysLeft))` em `type.figure`, legenda `plural(dias, t.app.home.dayCount)` + " · " + `shortly[0].name` → "3 dias · Polpa de morango". Toque → `/inputs`, rótulo de acesso `t.app.home.runningOut` = "Compre esta semana" |
| calmo | `data.everMade` | `Card hue={palette.mint}`, título "Insumos em dia" (`inputsFine`) e detalhe "Pelo consumo das últimas semanas, nada acaba nos próximos sete dias." (`inputsFineDetail`). Toque → `/inputs` |
| ausente | nenhum dos dois | `null` |

(Textos em `src/i18n/locales/pt-BR.ts:69,76-77,140`.)

**Cartão B — as caixas que saíram** (`src/home/Mosaic.tsx:186-220`), só quando
`data.boxes > 0`: `Card hue={palette.lilac}`, ícone `GlyphBox`, `CountUp` com
`data.boxes`, legenda `plural(boxes, t.app.home.boxCount)` + `plural(boxes,
t.app.home.boxesSent)` → "18 caixas saíram hoje". Embaixo, a Lei 3 e a
honestidade da unidade:

- `boxesYesterday === 0 ? "Ontem não saiu carga." : fill("Ontem foram
  {{amount}}.", { amount: plural(boxesYesterday, boxCount) })`;
- e, havendo `loose`, `` ` · ${fill("e mais {{items}}", { items: loose.map(l =>
  fill("{{amount}} de {{name}}", {amount: l.said, name: l.name})).join(', ') })}` ``
  → "· e mais 6.000 g de Açúcar cristal".

O comentário fecha o raciocínio: dezoito caixas é dia bom numa fábrica e fraco
noutra, e o que saiu sem caber em caixa sai por nome, porque somá-lo em "caixas"
seria arredondar a verdade para o total ficar mais bonito
(`src/home/Mosaic.tsx:197-203`). Toque → `/transport`, rótulo
`t.app.home.boxesTitle` = "Saiu para as lojas".

#### 18.7.3 `pedidos` — o que produzir por causa de quem pediu

Só existe se `temPedido` (`src/home/Mosaic.tsx:225-263`). `Touchable` inteiro →
`/orders`. O cartão tem dois rostos:

| Falta | `hue` | Título | Corpo |
|---|---|---|---|
| `shortForOrders.length > 0` | `color.warning` | "Produza para os pedidos" (`ordersShort`) | até **três** linhas `nome … plural(missing, t.units.unit, formatQuantity(missing))` (`src/home/Mosaic.tsx:238-250`) |
| coberto | `palette.sage` | "Os pedidos estão cobertos" (`ordersCovered`) | "O que foi pedido até {{date}} cabe no que já tem na fábrica." com `formatCalendarDate(data.demandThrough, locale)` (`src/home/Mosaic.tsx:251-257`) |

(Textos em `src/i18n/locales/pt-BR.ts:70-72`.) O ícone é `GlyphOrder`. O e2e
prova o caminho completo — cadastrar loja, anotar pedido de 300, voltar à capa e
achar "Produza para os pedidos" e "300" (`e2e/flow.mjs:452-459`).

#### 18.7.4 `clima` — ver 18.8

#### 18.7.5 `expedicao` — registrado e vazio

```
expedicao: null,
```
(`src/home/Mosaic.tsx:357`)

O id existe no catálogo (`src/domain/briefing.ts:31`), tem nome traduzido nos
três idiomas ("Saiu para as lojas", `src/i18n/locales/pt-BR.ts:464`) e aparece na
lista de Ajustes — e **não desenha nada**. O assunto dele é desenhado dentro de
`insumos` (o cartão B acima). Consequência factual: mover ou esconder
"Saiu para as lojas" em Ajustes não muda a capa; quem controla aquele cartão é a
linha "Insumo acabando". Classificação: **implementado no catálogo e na tradução,
sem desenho** — o único id do mosaico nessa condição.

#### 18.7.6 `precos` — o que mexeu

Só quando `moved.length > 0` (`src/home/Mosaic.tsx:358-385`).
`Card hue={palette.sand}`, ícone `GlyphPrice`, título `t.app.home.changed` =
**"Mudou desde a última vez"**. Uma linha por insumo, com o percentual calculado
na tela:

```
const previous = change.previousRate ?? change.newRate;
const delta = previous > 0 ? (change.newRate - previous) / previous : 0;
```
(`src/home/Mosaic.tsx:366-367`)

A seta é `'▲'` quando `delta > 0` e `'▼'` senão, e a cor é `color.warning` para
alta e `color.ok` para baixa — subir preço de insumo é a notícia ruim
(`src/home/Mosaic.tsx:373-374`). O número sai de `formatPercent(Math.abs(delta),
locale)`, que usa uma casa decimal por padrão
(`src/i18n/index.ts:217-223`) — é o `▲ 25,0%` que o e2e cobra com a vírgula do
idioma (`e2e/flow.mjs:654`). Toque → `/inputs`.

O que **saiu** desta peça está afirmado por negação no e2e: os cartões "Nada
mudou de preço" e "estável há N dias" não existem mais, porque ocupavam a capa
todo dia para dizer que não havia notícia (`e2e/flow.mjs:655-659`). As chaves
`steady`, `steadyDetail`, `stableFor` e `stableAlways` continuam no dicionário
(`src/i18n/locales/pt-BR.ts:100,141,146-147`) — **texto sem chamador na capa**.

#### 18.7.7 `aoVivo` — produção ao vivo

`Peca index={1} hue={palette.apricot}` com ícone `GlyphProduction` e título
`t.app.home.liveTitle` = **"Produção ao vivo"**
(`src/home/Mosaic.tsx:399-453`).

**A condição de existir mudou duas vezes, e as duas estão escritas**
(`src/home/Mosaic.tsx:387-398`): ela nascia sempre, dizendo "0 · Nada saiu ainda
hoje" — e ao lado de "Hoje na fábrica: 0" e "Últimas corridas: nenhuma" virava a
terceira maneira de dizer o mesmo nada; e ela mostrava o **total do dia**, que é
o mesmo número da manchete, então com 500 unidades a capa dizia "500" duas vezes
em cartões seguidos. Hoje:
`(data?.running ?? []).length === 0 ? null : (...)`.

O resumo (fechado): `CountUp` com **quantas corridas estão abertas** — não
quanto saiu hoje —, um `PulseDot live` na cor `palette.apricot` quando há
corrida, e a frase `fill(t.app.home.liveRuns, { count: plural(n,
t.app.home.runCount) })` → "uma produção em curso" / "3 produções em curso"
(`src/home/Mosaic.tsx:431-451`; `src/i18n/locales/pt-BR.ts:108-109`). O pulso
mora aqui e não num cartão próprio, e a regra do `PulseDot` é que só pulsa o que
está vivo: pulso ao lado de número parado é mentira visual
(`src/home/Mosaic.tsx:439-444`; `src/components/PulseDot.tsx:38-46`).

O detalhe (`mais`): uma linha por corrida com `PulseDot live`, o nome do produto
e `fill(t.app.home.liveOpened, { time: formatTime(r.openedAt, locale) })` →
"aberto às 07:12"; e no fim o texto `t.app.home.openScreen` = "Abrir a tela"
(`src/home/Mosaic.tsx:414-427`). O `mais` é `undefined` quando
`running.length === 0 && madeToday === 0` — convite que não entrega nada é a
mesma doença do alerta inventado (`src/home/Mosaic.tsx:409-413`).

O e2e prova o ciclo: a capa não fala de produção em curso numa fábrica parada,
passa a dizer "uma produção em curso" depois de "Começar agora", e volta a
calar quando a corrida fecha (`e2e/flow.mjs:772-812`).

#### 18.7.8 `historico` — últimas corridas

`Peca index={2} hue={palette.sand}`, ícone `GlyphProduction`, título
`t.app.home.historyTitle` = **"Últimas corridas"**. Existe só quando
`data.runs.length > 0` — "histórico só existe quando há história"
(`src/home/Mosaic.tsx:455-520`).

Resumo: a última corrida em `fill(t.app.home.historyRun, { amount, code })` →
`"480 unidades · 20260905-01"`, com `code ?? '—'`; um `Sparkline` das corridas na
ordem cronológica (`[...runs].reverse().map(r => r.baseUnits)`) quando há mais de
uma, `hue={palette.sand}` e `strokeWidth={traco}`; e a Lei 3 escrita:
`fill(t.app.home.historyAverage, { amount: ... })` → "média das últimas: 420
unidades", com

```
Math.round(runs.reduce((n,r) => n + r.baseUnits, 0) / runs.length)
```
(`src/home/Mosaic.tsx:489-516`; textos em `src/i18n/locales/pt-BR.ts:111-114`).

Detalhe: uma linha por corrida com `formatTime(occurredAt)`, nome e
`formatQuantity(baseUnits)` (`src/home/Mosaic.tsx:468-480`). A `key` é
`` `${r.occurredAt}-${r.code ?? ''}` ``.

O ramo `runs.length === 0` dentro da peça (que imprimiria
`t.app.home.historyEmpty` = "Nenhuma corrida registrada ainda.") é **inalcançável
hoje**, porque a peça inteira devolve `null` nesse caso
(`src/home/Mosaic.tsx:457,485-486`) — o e2e chega a afirmar por negação que a
frase não aparece na capa virgem (`e2e/flow.mjs:190-194,1902-1906`).

O e2e também prova o abrir-no-lugar: tocar "Últimas corridas" mostra
"toque para fechar" e o código do lote por dentro; tocar de novo fecha
(`e2e/flow.mjs:752-762`).

#### 18.7.9 `cobertura` — quanto tempo o estoque dura

`Peca index={3} hue={palette.mint}`, ícone `GlyphStock`, título
`t.app.home.coverTitle` = **"O estoque dura"**. Só existe quando
`data.cover.length > 0`, e o motivo está escrito: "sem saída registrada —
ninguém sabe quanto dura" é uma frase honesta e uma peça inútil, porque ocupa a
capa para dizer que não tem resposta (`src/home/Mosaic.tsx:522-527`).

Resumo: `formatQuantity(Math.floor(cover[0].daysLeft))` em `type.figure`, depois
`fill(t.app.home.coverDays, { days: plural(dias, dayCount) })` → "12 dias pelo
consumo da semana", `' · '`, e `fill(t.app.home.coverTightest, { item })` → "o
mais curto é Polpa de morango" (`src/home/Mosaic.tsx:556-565`;
`src/i18n/locales/pt-BR.ts:115-117`).

O desenho: `Drain share={Math.min(1, cover[0].daysLeft / 30)} hue={palette.mint}`
— o horizonte é um mês, que é a janela em que uma fábrica compra
(`src/home/Mosaic.tsx:566-571`). `Drain` vira `color.warning` sozinho quando
`share <= 0.2`, ou seja **abaixo de seis dias** nesse horizonte, e continua
existindo cheio no estado bom para o cartão não pular de forma quando a fábrica
está bem (`src/components/Drain.tsx:12-38`).

Detalhe: até **seis** itens, nome e `plural(Math.floor(daysLeft), dayCount)`
(`src/home/Mosaic.tsx:535-550`). O ramo de `cover.length === 0` com
`t.app.home.coverUnknown` é inalcançável pelo mesmo motivo do `historico`
(`src/home/Mosaic.tsx:552-553`).

#### 18.7.10 `entregaHoje` — quem recebe hoje

`Peca index={4} hue={palette.lilac}`, ícone `GlyphBox`, título
`t.app.home.dueTitle` = **"Quem recebe hoje"**, só quando
`data.dueToday.length > 0` (`src/home/Mosaic.tsx:577-618`).

Resumo: o número é **quantos ainda não receberam** —
`formatQuantity(dueToday.filter(p => !p.sent).length)` — e a legenda é
`fill(t.app.home.duePending, { name })` = "{{name}} espera carga", com o nome do
primeiro pendente, ou do primeiro da lista, ou `t.app.places.factory` =
"Fábrica" quando o lugar não tem nome (`src/home/Mosaic.tsx:604-614`;
`src/i18n/locales/pt-BR.ts:119-122,680`).

Detalhe: uma linha por lugar, com `dueDone` ("{{name}} já recebeu") em
`color.inkMuted` para quem já recebeu e `duePending` em `color.ink` para quem
não; e "Abrir a tela" no fim (`src/home/Mosaic.tsx:588-601`).

#### 18.7.11 `validade` — vence primeiro

`Peca index={5} tone="warning"` (sem `hue`), ícone `GlyphBox`, título
`t.app.home.expiryTitle` = **"Vence primeiro"**, só quando
`data.expiring.length > 0` (`src/home/Mosaic.tsx:620-676`).

Resumo: o nome do item em `type.cardTitle` e
`fill(t.app.home.expiryLot, { code, date: formatCalendarDate(expiresOn) })` →
"20260905-01 vence 12/10". Embaixo, um `Drain` cujo `share` é

```
Math.max(0, daysBetween(nowIso(), `${expiresOn}T00:00:00.000Z`, locale.timeZone)) / 30
```
(`src/home/Mosaic.tsx:659-672`)

— quanto falta dos trinta dias que a peça olha, porque sem o desenho "12 de
setembro" pede que a pessoa faça a conta de cabeça. `daysBetween` compara duas
meia-noites locais e arredonda (`src/domain/day.ts:119-123`). Note que aqui o
`Drain` vai **sem `hue`**, então usa o `accent` da área (`sky`) até virar
`warning` abaixo de um quinto — isto é, a menos de seis dias do vencimento.

Detalhe: **todos** os lotes devolvidos (o `limit` de `expiringSoon` é 5), nome à
esquerda e `expiryLot` à direita (`src/home/Mosaic.tsx:632-644`).

#### 18.7.12 `perdas` — perdas do mês

`Peca index={6} hue={palette.apricot}`, ícone `GlyphPrice`, título
`t.app.home.lossTitle` = **"Perdas do mês"**. Existe quando
`lossesNow > 0 || lossesBefore > 0` — ou seja, também quando o mês atual está
limpo e o anterior não (`src/home/Mosaic.tsx:678-680`).

Resumo: `formatMoney(lossesNow as Cents, locale)` em `type.figure`; a comparação
é `fill(t.app.home.lossVsBefore, { amount: formatMoney(lossesBefore) })` → "no
mês anterior foram R$ 148,00", ou `t.app.home.lossFirst` = "primeiro mês com
perda registrada" quando não há anterior (`src/home/Mosaic.tsx:703-712`).

E duas barras na mesma régua, só quando `lossesBefore > 0`
(`src/home/Mosaic.tsx:713-734`):

```
Drain share={(data?.lossesNow ?? 0)    / Math.max(data?.lossesNow ?? 0, data?.lossesBefore ?? 1)} hue={color.warning}
Drain share={(data?.lossesBefore ?? 0) / Math.max(data?.lossesNow ?? 0, data?.lossesBefore ?? 1)} hue={color.inkFaint}
```

A de baixo é o mês passado, e a de cima só passa dela se a fábrica piorou — duas
barras dizem num relance o que dois números pedem para comparar de cabeça.

Detalhe: `fill(t.app.home.lossWorst, { reason })` → "o que mais pesou: venceu",
com o motivo traduzido e minusculizado pelo idioma:
`t.loss[reason].toLocaleLowerCase(locale.formatting)`
(`src/home/Mosaic.tsx:690-698`). Os motivos possíveis são `melted` ("Derreteu"),
`broken` ("Quebrou"), `expired` ("Venceu"), `courtesy` ("Cortesia") e
`internal_use` ("Consumo interno") (`src/i18n/locales/pt-BR.ts:1102-1108`).
Depois, "Abrir a tela".

#### 18.7.13 `custo` — custo por unidade

`Peca index={7} hue={palette.sky}`, ícone `GlyphPrice`, título
`t.app.home.costTitle` = **"Custo por unidade"**. Nasce **fora da capa**
(`DEFAULT_OFF`) e só aparece quando alguma corrida tem `unitCostRate !== null`
(`src/home/Mosaic.tsx:740-742`).

Resumo: `formatMoney(Math.round(comCusto[0].unitCostRate) as Cents, locale)`, o
`Sparkline` das taxas em ordem cronológica quando há mais de uma, e a comparação
`fill(t.app.home.costBefore, { amount })` → "na anterior foi R$ 0,62", ou
`t.app.home.costOnlyOne` = "primeira corrida registrada"
(`src/home/Mosaic.tsx:769-789`).

**A única peça em que a linha subindo é notícia ruim, e por isso ela não muda de
cor:** a cor diria o que só o dono sabe — polpa mais cara por safra é normal, por
desperdício não é (`src/home/Mosaic.tsx:772-775`).

Detalhe: até **cinco** corridas com taxa, `r.code ?? r.name` à esquerda e o
dinheiro à direita, mais "Abrir a tela" (`src/home/Mosaic.tsx:752-766`).

O custo por unidade **saiu da capa a pedido do dono**, e o e2e guarda isso por
negação: `assert.doesNotMatch(text, /R\$ 0,64/)` e
`assert.doesNotMatch(text, /cada um/)` (`e2e/flow.mjs:196-199`). Ele volta só se
alguém ligar a peça em Ajustes.

#### 18.7.14 `parado` — dinheiro parado

`Peca index={8} hue={palette.mint}`, ícone `GlyphStock`, título
`t.app.home.heldTitle` = **"Dinheiro parado"**. Também nasce fora da capa, e só
aparece quando `heldCents > 0` (`src/home/Mosaic.tsx:795-797`).

Resumo: `formatMoney(heldCents as Cents, locale)`, e a legenda
`t.app.home.heldDetail` = "em insumo e embalagem" mais, quando há cobertura,
`` ` · ${fill(t.app.home.coverDays, { days: plural(Math.floor(cover[0].daysLeft), dayCount) })}` ``
(`src/home/Mosaic.tsx:821-831`).

Detalhe: até cinco itens de `data.cover`, com os dias de cada um, e "Abrir a
tela". A `key` é `` `${item.itemId}-p` `` para não colidir com a peça de
cobertura (`src/home/Mosaic.tsx:807-817`).

#### 18.7.15 "Abrir a tela" sem tela

Fato verificável: `t.app.home.openScreen` = "Abrir a tela" aparece dentro do
detalhe de cinco peças — `aoVivo` (`src/home/Mosaic.tsx:426`), `entregaHoje`
(`:600`), `perdas` (`:699`), `custo` (`:765`) e `parado` (`:817`) — e nenhuma
dessas peças chama `go()`. O único `onPress` de uma `Peca` é `onToggle`
(`src/home/Peca.tsx:122`). As seis chamadas de `go()` do arquivo estão todas em
cartões que **não** são `Peca` (`src/home/Mosaic.tsx:164,176,187,230,362,886`).
Classificação: **texto implementado, navegação sem chamador**.

---

### 18.8 O cartão do clima, e a decisão de desenho

#### 18.8.1 De onde vem o dado

`forecastForScreen(timeZone)` (`src/weather/live.ts:49-59`) injeta as
dependências em `currentForecast` (`src/weather/index.ts:228-251`), cuja ordem é
**cache primeiro, rede depois, nunca exceção**:

1. lê o cache de `app_meta` na chave `weather.forecast`
   (`src/weather/live.ts:13,56`);
2. lê a cidade escolhida em `weather.place` (`src/weather/live.ts:12,38-40`);
3. **sem cidade, o fuso é o palpite**: `cityFromTimeZone(timeZone)` transforma
   `America/Sao_Paulo` em "Sao Paulo" e devolve `null` para fusos sem cidade
   (`UTC`, `GMT`, `Etc/GMT-3`, qualquer coisa com dígito ou `+`)
   (`src/weather/index.ts:89-96`). Nulo significa "pergunte", e é a única
   situação em que se pergunta. Achando, grava o primeiro resultado e segue;
4. o cache só vale se for do **mesmo lugar** (`samePlace`: diferença de latitude
   e longitude abaixo de `0.01`, `src/weather/index.ts:206-208`) e se não estiver
   velho — `FRESH_FOR_MINUTES = 180` (`src/weather/index.ts:79,145-148`);
5. estando velho, busca; falhando a busca, devolve o cache velho; dando certo,
   grava e devolve.

A rede tem prazo: `TIMEOUT_MS = 8_000` com `AbortController`, porque sem prazo um
celular na área ruim da fábrica fica com a promessa pendurada e a tela, que
espera por ela, some com o cartão que já tinha (`src/weather/live.ts:15-36`).

As URLs são as da Open-Meteo:
`https://api.open-meteo.com/v1/forecast` e
`https://geocoding-api.open-meteo.com/v1/search`
(`src/weather/index.ts:75-76`). A previsão pede
`daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max`,
`timezone=auto` e **`forecast_days=2`** (`src/weather/index.ts:192-195`); a busca
de cidade pede `count=6&format=json` (`src/weather/index.ts:178`).

Um dia sem máxima **ou** sem mínima é descartado inteiro em vez de entrar com
zero: 0 °C num setembro paulistano não é dado faltando, é dado errado, e o
cartão o desenharia com a mesma confiança dos outros
(`src/weather/index.ts:117-142`).

#### 18.8.2 `reading()` — o que ainda vale

```
export function reading(forecast: Forecast, today: string): Reading | null
```
(`src/weather/index.ts:159-169`)

Procura o **primeiro dia cuja data é `>= today`** e devolve
`{ today, tomorrow, warmerBy }`; uma previsão inteiramente vencida devolve
`null`, e aí o cartão não existe — é melhor não ter cartão que ter um cartão
errado (`src/weather/index.ts:150-158`). A capa chama
`reading(weather, dayWindow(nowIso(), locale.timeZone).from.slice(0, 10))`
(`app/(tabs)/index.tsx:283`).

`warmerBy` é calculado **sobre os graus já arredondados**:
`Math.round(amanha.maxC) - Math.round(hoje.maxC)`. Parece detalhe e não é: 30,4 e
32,4 aparecem como 30 e 32 na tela, e uma diferença calculada antes do
arredondamento diria "2°" para números que o olho lê como 2, mas 30,6 e 32,4
dariam 1,8 → "2°" ao lado de 31 e 32. O número dito tem que ser a subtração dos
números mostrados, ou a tela mente por um grau
(`src/weather/index.ts:59-66,167`).

#### 18.8.3 O cartão, elemento por elemento

Condição de existir: `sky !== null`. `Reveal index={3}` e um `Touchable` cujo
`onPress` é `abrir('clima')` — **o toque abre a semana aqui, não leva para outra
tela** (`src/home/Mosaic.tsx:264-276`). Isso é pedido do dono com todas as
letras, e o motivo é bom: a pergunta "vou vender mais sexta?" se responde
olhando sete dias de uma vez, e a capa é onde ela nasce
(`src/home/Mosaic.tsx:268-272`). O rótulo de acesso é
`fill(t.app.weather.overline, { city: weather?.place.name ?? '' })` → "clima em
Recife".

`Card hue={palette.sky}` — e **o filete fica no AZUL do clima**, não na cor do
dia (`src/home/Mosaic.tsx:277-285`). Isso é uma reversão registrada: ele já foi
pintado com a cor do dia por uma hora, e isso quebra a regra da casa — a cor da
**área** é significado (produção é laranja, clima é azul) e não muda com o gosto
nem com a temperatura. Variando, o filete deixava de dizer "clima" e passava a
dizer "calor", e a capa inteira ficava monocromática num dia quente: dois cartões
cor de creme, um embaixo do outro, sem nada separando um assunto do outro.

| Elemento | Conteúdo | Fonte |
|---|---|---|
| sobrelinha | `fill(t.app.weather.overline, { city }).toUpperCase()` → "CLIMA EM RECIFE" | `src/home/Mosaic.tsx:286-288`; `src/i18n/locales/pt-BR.ts:279` |
| número | `` `${Math.round(sky.today.maxC)}°` `` em `type.figure` | `:298` |
| legenda | `t.app.weather.today` → "máxima de hoje" | `:300`; `pt-BR.ts:280` |
| mínima | `fill(t.app.weather.low, { degrees: plural(Math.round(sky.today.minC), t.app.weather.degrees) })` → "mínima de 21°" | `:301-303`; `pt-BR.ts:281,288` |
| selo | `SkyMark maxC rainChance` — na MESMA linha do número | `:305` |
| régua do dia | `TemperatureRange minC maxC ink={corDoDia}` | `:308` |
| comparação | `warmerBy === 0` → "Amanhã, temperatura parecida."; `> 0` → "Amanhã esquenta {{degrees}}."; `< 0` → "Amanhã esfria {{degrees}}."; `null` → nada | `:309-317`; `pt-BR.ts:283-285` |
| a semana | só quando `aberta === 'clima' && weather` | `:321-344` |
| rodapé | `` `${fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })} · ${aberta === 'clima' ? less : more}` `` → "medido às 06:12 · toque para ver mais" | `:345-349`; `pt-BR.ts:286` |

**A semana aberta** (`src/home/Mosaic.tsx:321-344`): `weather.days.slice(0, 7)`,
uma linha por dia com a inicial do dia (`formatWeekdayInitial`, largura fixa de
28 px), um `TemperatureRange` **sem `ink`** — então na cor da casa, não na do dia
—, a máxima arredondada em `styles.number`, e a chance de chuva em
`palette.sky` **só quando `rainChance >= 30`**. Sete números soltos não se
comparam de olho; sete barras se comparam.

**Fato importante e verificável:** `fetchForecast` pede `forecast_days=2`
(`src/weather/index.ts:195`), então `weather.days` tem no máximo dois dias e o
`slice(0, 7)` rende **duas linhas**, não sete. O desenho está preparado para
sete; a fonte entrega dois. Isso é o que o código faz.

#### 18.8.4 A decisão de desenho: a faixa de céu que deixou de existir

O docblock de `src/components/Sky.tsx:14-50` é o registro mais explícito de
projeto visual do repositório, e vale transcrever a lógica:

O dono olhou a capa publicada e disse que o clima podia ficar muito mais bonito.
A primeira resposta foi uma **faixa de céu**: um retângulo de 140 px com degradê
entre duas cores da paleta, o sol por cima, texto embaixo. Ela nasceu do
argumento certo — numa fábrica de sorvete o calor **é** o negócio — e resolveu o
problema errado. As fotos mostraram, nas três combinações:

- **Orgânico claro, 33°:** o degradê ia do verde da marca ao rosa; duas cores de
  matiz distante interpoladas em sRGB passam por **lama** no meio, e o cartão
  ficou um hematoma de 140 px no alto da capa;
- **Orgânico escuro:** o mesmo bloco pastel aceso numa tela preta, com o sol em
  `onAccent`, que no escuro é quase preto — um adesivo de outro aplicativo
  colado na tela;
- **Papel:** sem degradê (a identidade dele é traço), sobrava um **vazio de
  92 px** com um sol no canto.

**O defeito comum não é a cor escolhida: é a área.** As cores desta paleta são
tinta e traço, feitas para desenhar sobre um fundo, não para PREENCHER um terço
da tela. Ampliar uma cor de acento até virar fundo é o mesmo erro que ampliar
`inkFaint` até virar texto de corpo: ela não foi medida para isso.

**O que ficou:** o desenho do tamanho de um desenho, ao lado do número que ele
explica — como a ilustração da fábrica no cartão de primeiro dia, a única peça
que ficou bonita nas três fotos. A temperatura continua mandando na cena, que era
a promessa boa da versão anterior: ela decide a cor do traço e o halo atrás dele.
O mesmo raciocínio está repetido no ponto de uso (`src/home/Mosaic.tsx:289-296`).

#### 18.8.5 A escala de temperatura

`temperatureBand(maxC)` (`src/components/Sky.tsx:53-58`):

| Faixa | Condição |
|---|---|
| `cold` | `maxC < 18` |
| `mild` | `18 <= maxC < 26` |
| `warm` | `26 <= maxC < 32` |
| `hot` | `maxC >= 32` |

`skyInk(maxC, { palette, brand, skin })` (`src/components/Sky.tsx:73-83`):

| Faixa | Cor |
|---|---|
| `cold` | `palette.sky` |
| `mild` | `brand` no Orgânico, `palette.mint` no Papel |
| `warm` | `palette.sand` |
| `hot` | `palette.apricot` |

A rampa **para no terracota**: `rose` era o topo e saiu rosa na foto — nesta
paleta a cor do Espelho da Loja e vizinha do vermelho de perigo. Trinta e três
graus numa fábrica de sorvete não é perigo, é o melhor dia do mês; pintá-lo de
alerta ensina a ler alerta como enfeite (`src/components/Sky.tsx:60-72`). É
exportada porque o cartão inteiro usa a mesma cor: um cartão com borda azul e um
sol rosa dentro é duas coisas na mesma peça.

`SkyMark` (`src/components/Sky.tsx:93-205`), tamanho padrão 76:
- `raining = rainChance !== null && rainChance >= 30`;
- o **halo** é um `RadialGradient` da mesma tinta (0,30 → 0,10 → 0 de opacidade)
  e **não existe no Papel**, cuja identidade é traço sobre papel;
- **sol** quando não chove: círculo de raio 13 e oito raios entre 20 e 27, girando
  uma volta a cada **40 s** — movimento que se percebe se você olhar e não se
  percebe se você estiver trabalhando;
- **nuvem** quando chove, vagando `sin(t)*4` px num ciclo de **9 s**, com três
  gotas em `palette.sky` (a chuva é azul mesmo no dia quente: quem olha quer
  saber se molha, e a temperatura já está dita no número ao lado);
- desenhar sol num dia de chuva é a mesma mentira do alerta inventado
  (`src/components/Sky.tsx:150-151`).

`TemperatureRange` (`src/components/Sky.tsx:213-262`): barra de 6 px de altura,
fundo `color.sunken`, com a faixa entre mínima e máxima. **A escala é fixa de 0
a 40 °C** (`clamp(c) = max(0, min(1, c/40))`) de propósito: uma régua que se
estica para caber no dado faria 18° e 34° desenharem a mesma barra, e a
comparação entre dois dias morreria. Cresce em 900 ms; sem `ink`, pinta em
`palette.apricot`.

#### 18.8.6 A porta que não depende de rede

A linha "Clima" na aba Mais existe por um motivo escrito: o cartão do clima na
capa só existe quando há previsão guardada, e quem abre o aplicativo pela
primeira vez dentro da câmara fria não tem nenhuma. Sem essa linha, trocar a
cidade dependeria de ter internet — que é a única coisa que aquela tela existe
para consertar (`app/(tabs)/more.tsx:98-102`). O detalhe da linha é
`t.app.weather.change` = "trocar a cidade"
(`src/i18n/locales/pt-BR.ts:287`).

---

### 18.9 O convite de primeiro dia

Depois de montar as catorze peças, o Mosaico calcula
(`src/home/Mosaic.tsx:869-878`):

```
const aindaNaoTrabalhou =
  (data?.madeToday ?? 0) === 0 &&
  (data?.runs ?? []).length === 0 &&
  (data?.cover ?? []).length === 0 &&
  (data?.boxes ?? 0) === 0 &&
  !temPedido &&
  (data?.running ?? []).length === 0 &&
  (data?.expiring ?? []).length === 0 &&
  (data?.dueToday ?? []).length === 0 &&
  (data?.lossesNow ?? 0) === 0;
```

Nove cláusulas, e **nenhuma delas é sobre compra**. O raciocínio está escrito em
dois docblocks (`src/home/Mosaic.tsx:838-868`):

- **O problema:** o dono abriu o aplicativo instalado e viu "0 unidades", "0 ·
  nada saiu ainda", "nenhuma corrida registrada", "sem saída registrada" —
  quatro cartões dizendo que não há nada, e nenhuma próxima ação em lugar
  nenhum, quando a Lei da Inteligência exige justamente a próxima ação provável.
  Estado vazio bonito é estado válido; quatro estados vazios empilhados são uma
  tela que ensina que a capa não serve para nada.
- **A primeira correção estava errada:** ela substituía a capa **inteira**, e o
  CI derrubou por três caminhos no mesmo dia — nota de compra lançada, produção
  marcada em curso, preço que mudou. Nos três a fábrica tinha notícia e a capa
  respondia "primeiro dia". Esconder o que existe é pior que mostrar vazio:
  vazio é uma tela que não serve, esconder é uma tela que **mente**.
- **A correção óbvia também estava errada:** exigir que NADA exista nunca
  fecharia o portão, porque a semeadura já compra insumo — a capa voltaria aos
  quatro cartões vazios.
- **A pergunta certa é a do trabalho:** saiu alguma coisa do tacho, foi para
  alguma loja, alguém pediu, tem tacho aberto, venceu ou perdeu? Comprar insumo
  não é trabalho da fábrica, é o estoque de partida.

Quando é verdade, **só `pecas.producao` é substituído**
(`src/home/Mosaic.tsx:880-915`) — "no lugar da peça do dia, não no lugar da
capa": o preço, o dinheiro parado e o tempo continuam dizendo o que sabem, na
ordem que a empresa escolheu. As demais peças de trabalho já devolvem `null`
sozinhas por falta de dado.

O cartão do convite: `Touchable` → `/production/new`, `Card hue={palette.apricot}`
com `GlyphProduction`, a mesma cena por identidade
(`FactoryScene running={false} shipped={false} dayShare={null}` no Papel,
`Landscape` no Orgânico), e três textos:

| Chave | Texto pt-BR |
|---|---|
| `t.app.home.firstDayTitle` | "Primeiro dia" |
| `t.app.home.firstDayBody` | "A capa se enche sozinha conforme a fábrica trabalha: o que saiu hoje, o que está acabando, o que os clientes pediram." |
| `t.app.home.firstDayAction` | "Lançar a primeira produção" — em `accent`, `marginTop: space.sm` |

(`src/home/Mosaic.tsx:886-908`; `src/i18n/locales/pt-BR.ts:103-105`.)

O e2e cobra as duas metades numa instalação virgem — a presença do convite e da
ação, e a **ausência** dos quatro vazios (`e2e/flow.mjs:183-194,678-682`,
`e2e/flow.mjs:1888-1906`).

---

### 18.10 A guarda da Lei 3 sobre a capa

`src/law.test.ts` existe porque a Lei da Inteligência morava num arquivo de
texto, e texto não roda: numa auditoria só, três telas foram achadas anunciando
número nu (`src/law.test.ts:6-13`). A régua era **por arquivo**, e isso deixou
`Mosaic.tsx` passar verde por comparar a produção com ontem enquanto as caixas,
as corridas abertas e as entregas do dia apareciam nuas ao lado — **nove figuras
nunca conferidas por nada** (`src/law.test.ts:26-32`).

Hoje a contagem tem que bater: um `type.figure` novo quebra a suíte até ganhar a
sua linha. A capa declara **dez**, na ordem em que aparecem no arquivo
(`src/law.test.ts:47-67`):

| # | Número | Declaração |
|---|---|---|
| 1 | produção do dia | compara: `/noYesterday\|madeYesterday/` |
| 2 | dias do insumo | **sozinho**: "o número é uma contagem regressiva — '3 dias · Polpa' já é a distância até o fim. Contagem regressiva compara com o limite dela, e um 'ontem' ao lado só atrapalharia." |
| 3 | caixas | compara: `/noBoxesYesterday\|boxesYesterday/` |
| 4 | máxima de hoje | compara: `/warmerBy\|weather\.same/` |
| 5 | corridas abertas | **sozinho**: "o número é quantos tachos estão abertos AGORA. Estado ao vivo responde a segunda pergunta da lei, e zero é o normal — o pulso ao lado diz se anda." |
| 6 | cobertura | compara: `/coverDays\|coverTightest/` |
| 7 | entregas de hoje | **sozinho**: "o número é quantas entregas do dia ainda não saíram: uma lista de afazeres de hoje, que se compara com o próprio acordo de dia, e não com ontem." |
| 8 | perdas do mês | compara: `/lossVsBefore\|lossFirst/` |
| 9 | custo por unidade | compara: `/Sparkline/` |
| 10 | dinheiro parado | compara: `/heldDetail\|coverDays/` |

As abas declaram junto: `production.tsx` compara `/vsYesterday|noYesterday/`;
`reports.tsx` declara três (`/coverDays|placeCount/`, `/Sparkline/`,
`/lossVsBefore|lossFirst/`); `transport.tsx` compara
`/vsYesterday|firstDay/` (`src/law.test.ts:68-79`).

A segunda guarda, `src/language.test.ts`, exige que **toda** tela `.tsx` importe
desenho (`@/components/Glyph|icons|Sky|Landscape|FactoryScene`) e use `Reveal`, e
proíbe hexadecimal cru — com uma única exceção registrada, a etiqueta do lote,
que é papel branco com tinta preta em qualquer tema
(`src/language.test.ts:27-69`). A lista `FALTAM` de telas não convertidas está
**vazia desde 4 de setembro**, e continua no arquivo justamente por isso:
acrescentar um nome ali é declarar que uma tela está fora da língua da casa
(`src/language.test.ts:43-55`).

---

### 18.11 Aba Produção: `app/(tabs)/production.tsx`

**O que ela era e por que mudou** (`app/(tabs)/production.tsx:29-59`): esta aba
**era o formulário**, e o formulário abria pedindo tachos. Duas coisas erradas de
uma vez — a primeira pergunta era a conta do meio, não o fato ("produzi 480
picolés" é o que aconteceu; "rodei um tacho" é como se chega nele) —, e uma aba
que é só formulário não responde nenhuma das três perguntas da Lei da
Inteligência. O formulário mudou de endereço (`/production/new`), não de dono.

Consulta única, quatro chamadas em paralelo
(`app/(tabs)/production.tsx:81-91`):

| Destino | Chamada |
|---|---|
| `today` | `productionOn(companyId, hoje.from, hoje.to)` |
| `yesterday` | `productionOn(companyId, ontem.from, ontem.to)` |
| `runs` | `openProductionRuns(companyId)` |
| `lots` | `lotsOn(companyId, hoje.from, hoje.to)` → `LotOfDay[]`: `id, code, name, baseUnits, expiresOn` (`src/data/repository.ts:2632-2685`) |

Derivados: `totals = { hoje, ontem, delta: hoje - ontem }` por soma de
`baseUnits` (`app/(tabs)/production.tsx:93-98`).

**`veredito` tem três estados, não dois** (`app/(tabs)/production.tsx:104-140`), e
a cicatriz está escrita: `delta >= 0` fazia o empate cair em "acima" — uma
fábrica que roda a mesma carga todo dia lia "480", "Ontem foram 480." e, embaixo
dos dois, um selo verde afirmando estar ACIMA de ontem. Quem decide é o
**percentual já arredondado**, senão 4.802 contra 4.800 volta a imprimir "0%
acima de ontem":

```
if (totals.ontem <= 0 || totals.hoje <= 0) return null;
const pct = Math.round((Math.abs(totals.delta) / totals.ontem) * 100);
if (pct === 0) return { signal: 'neutral',
  label: totals.delta === 0 ? t.app.production.sameAsYesterday
                            : t.app.production.nearYesterday };
return { signal: totals.delta > 0 ? 'ok' : 'warning',
  label: fill(delta > 0 ? aboveYesterday : belowYesterday, { percent: String(pct) }) };
```

Textos: "Mesmo que ontem", "Praticamente o mesmo de ontem",
"{{percent}}% acima de ontem", "{{percent}}% abaixo de ontem"
(`src/i18n/locales/pt-BR.ts:793-798`). As duas frases do empate são separadas de
propósito — dizer "mesmo que ontem" para 4.802 seria trocar uma mentira por
outra. E a frase é desta aba, não da capa: lá a comparação é com o último dia
útil, aqui é com ontem, e a mesma chave diria o dia errado.

`vazio = !loading && hoje === 0 && ontem === 0 && abertas.length === 0 &&
lotes.length === 0` (`app/(tabs)/production.tsx:142-144`).

Os quatro blocos, na ordem em que a tela os desenha:

| # | Bloco | Condição | Conteúdo |
|---|---|---|---|
| 0 | **Produzido hoje** | `loading \|\| hoje > 0 \|\| ontem > 0` | número em `type.figure` (ou `'—'` carregando); "Ontem foram {{units}}." ou "Ontem não houve produção."; o `Chip` do veredito; e, atrás de um fio de `hairlineWidth`, a conta aberta — "O que saiu hoje" com uma linha por item (`app/(tabs)/production.tsx:164-220`) |
| 1 | **Botão "Adicionar produção"** | `!vazio` | `router.push('/production/new')`, ícone `GlyphPlus`. Vem **antes** das listas porque quem abre a aba no meio do turno vem para lançar, não para ler (`:222-235`) |
| 2 | **Produção em curso** | `abertas.length > 0` | `Card hue={palette.apricot}` com `GlyphKettle`; uma linha por corrida com `PulseDot live`, nome e "aberto às {{time}}". **Não** é `tone="warning"`: panela rodando é o dia normal, e pintar o normal de amarelo é o alerta inventado que a Lei 7 proíbe (`:237-262`, `:47-50`) |
| 3 | **Lotes de hoje** | `lotes.length > 0` | uma linha tocável por lote → `/lots/{id}`, com o **código** em `tabular-nums`, `nome · vence {{date}}` ou "sem validade", a quantidade em `plural(baseUnits, unitCount)` e um `IconChevron`. Separadores de `hairlineWidth` a partir da segunda linha (`:264-330`) |
| 0 | **Convite vazio** | `vazio` | `Card` com título "Produção", a frase "Nada lançado hoje ainda. Toque em adicionar quando a primeira caixa fechar." e o botão dentro dele (`:332-355`) |

O código do lote **aparece na própria aba, sem pedir toque**: a primeira versão
disso era um diálogo depois de gravar — um toque a mais na ação mais frequente do
dia, todo dia — e o e2e derrubou por travar a barra de abas. E continua aqui
depois, porque quem procura o lote de uma caixa procura **horas** depois, não no
segundo seguinte (`app/(tabs)/production.tsx:264-273`). O formato do código é
`AAAAMMDD-NN`, conferido no navegador (`e2e/flow.mjs:711-712`).

Três decisões de desenho registradas (`app/(tabs)/production.tsx:42-58`): cada
assunto é um cartão com crachá e tom `apricot`; o total e a quebra dele moram no
**mesmo** cartão, porque a quebra é o `[por quê?]` do número; e peça sem dado não
aparece — o cartão de lista vazia virou o estado vazio inteiro.

Enquanto carrega, o cartão do dia **fica**: sumir e voltar pisca a tela, e o
convite de fábrica nova apareceria por meio segundo em cima de uma fábrica que
produziu (`app/(tabs)/production.tsx:160-163`).

---

### 18.12 Aba Transporte: `app/(tabs)/transport.tsx`

Lê **as pernas positivas** das transferências de hoje; nada aqui é digitado, e
nada é somado entre itens que não compartilham unidade
(`app/(tabs)/transport.tsx:22-27`).

Consulta (`app/(tabs)/transport.tsx:61-71`): `shipmentsOn` para hoje e para
ontem. `ontem` é contado como **destinos distintos**:
`new Set((data?.ontem ?? []).map(p => p.locationId)).size`
(`app/(tabs)/transport.tsx:74`).

**O resumo conta DESTINOS, não caixas** (`app/(tabs)/transport.tsx:76-81`): a
prancha escreve "18 caixas em 3 destinos", e a metade das caixas é o que este
app não pode dizer — açúcar e polpa não têm camada de caixa, então somar tudo
numa unidade só inventaria um número que ninguém consegue contar na doca.
Destino é contável sempre.

`summary = plural(places.length, t.app.transport.destinations,
formatQuantity(places.length, locale))` → "3 destinos"
(`app/(tabs)/transport.tsx:132`; `src/i18n/locales/pt-BR.ts:738`).

**`naUnidade(item)`** (`app/(tabs)/transport.tsx:82-99`) é a regra de unidade, e
a escolha é pela **camada de embalagem**, não pelo tipo do item: quem tem caixa
fala em caixas, quem não tem fala na unidade de uso.

```
boxesOf(item.baseUnits, item.packaging)
  ? formatPacked(item.baseUnits, item.packaging, t.units, locale)
  : `${formatQuantity(item.baseUnits, locale)} ${item.baseUnit}`
```

`formatPacked` sozinho chamaria grama de "unidade", porque a faixa `unit` é a
única que o item solto tem — o mesmo defeito que a capa cometia, que imprimia
"6.000" sem unidade nenhuma.

**A conferência** (`app/(tabs)/transport.tsx:101-130`): `ask(place)` monta a
frase `items.map(i => `${naUnidade(i)} ${nome minusculizado}`).join(' · ')`,
pergunta com `useConfirm` — título
`fill(t.app.transport.checkTitle, { place })` = "O que chegou em {{place}}?",
mensagem = a frase, botão `t.app.transport.check` = "Conferir chegada" — e,
confirmado, chama `recordCheck(companyId, { groupId })` **uma vez por
`groupId`**, depois `refresh()`. O comentário explica: sem lista de contagem,
"chegou tudo" é a resposta; mandar a soma do destino para cada remessa contaria a
mesma mercadoria duas vezes quando a loja recebeu duas cargas no mesmo dia.
Quem achou diferença corrige na tela do lugar, que já sabe registrar contagem
cega.

O `Reveal index` do botão final é calculado para a cascata não abrir buraco:
`passos = places.length > 0 ? places.length + 1 : loading ? 0 : 1`
(`app/(tabs)/transport.tsx:142-145`).

Os blocos:

| # | Bloco | Condição | Conteúdo |
|---|---|---|---|
| 0 | **Saiu hoje** | `places.length > 0` | `Card hue={palette.lilac}` com `GlyphVehicle`; número = quantidade de destinos; `summary` embaixo; e a Lei 3: "Ontem foram {{count}}." ou "Ontem não saiu carga.". A comparação **não** cabe na sobrelinha, que é maiúscula e truncada em uma linha (`:152-178`) |
| 1..n | **Um cartão por destino** | para cada `place` | `hue = place.checked ? palette.lilac : color.warning`, ícone `GlyphStore`, título = nome do destino; um `Chip` `ok`/`warning` com `t.signals.checked` = "Conferido" ou `fill(notChecked, {place})` = "{{place}} ainda não conferiu o que chegou."; uma linha por item com `naUnidade`; e o rodapé "Abrir a tela" + chevron **só no destino conferido** (`:180-232`) |
| — | **Nada saiu hoje** | `!loading && places.length === 0` | `Card` com `GlyphBox`, título "Nada saiu hoje ainda." e a frase "O que sair para uma loja ou cliente aparece aqui, por destino." — **não é tocável**, porque a próxima ação é o botão logo abaixo e um mesmo caminho não se oferece duas vezes (`:234-249`) |
| `passos` | **Botão "Registrar uma saída"** | sempre | → `/transfer`, ícone `GlyphVehicle` (`:251-257`) |

**Duas regras de significado:**

- **Um destino lê como conferido só quando TODA remessa que caiu ali hoje foi
  conferida.** Uma loja que recebeu a carga da manhã e a da tarde abriu uma
  caixa; dizer "conferido" seria contar ao dono algo que ninguém verificou
  (`app/(tabs)/transport.tsx:40-44`).
- **O toque tem dois significados, e o cartão promete só um por vez:** conferido
  → `/places`; não conferido → a conferência. Prometer duas coisas no mesmo
  cartão é prometer a errada (`app/(tabs)/transport.tsx:186,225-228`).

O tom é o que separa os dois estados sem leitura: lilás é o transporte em todo o
aplicativo, âmbar é a caixa que ninguém abriu. E a frase continua sendo a
ausência de um fato, nunca uma acusação — ninguém está atrasado, ninguém errou, a
caixa simplesmente não foi aberta (`app/(tabs)/transport.tsx:34-38,194-196`).

---

### 18.13 Aba Relatórios: `app/(tabs)/reports.tsx`

**Isto era um índice** — três linhas de texto com chevron, uma tela inteira que
não respondia nenhuma das três perguntas da Lei. Abrir para descobrir é
exatamente o que a lei chama de pedir o que o sistema já sabe
(`app/(tabs)/reports.tsx:30-41`).

Consulta, cinco chamadas (`app/(tabs)/reports.tsx:69-86`):

| Destino | Chamada |
|---|---|
| `lugares` | `stockByPlace(companyId)` → `PlaceStock[]`: `locationId, locationName, kind, valueCents, lines[]` (`src/data/repository.ts:754-781`) |
| `cobertura` | `runningOut(companyId, semanaAtras.from, hoje.to, 7, Number.POSITIVE_INFINITY)` |
| `corridas` | `recentRuns(companyId, 8)` |
| `mes` | `lossesOn(companyId, trintaDias.from, hoje.to)` |
| `mesAnterior` | `lossesOn(companyId, anterior.de.from, anterior.ate.to)` |

Derivados (`app/(tabs)/reports.tsx:88-91`): `parado` = soma de `valueCents` dos
lugares; `comCusto` = corridas com taxa; `perdido` e `perdidoAntes` = somas de
`valueCents`.

| # | Cartão | Condição | Número | Comparação | Toque |
|---|---|---|---|---|---|
| 0 | **Estoque** (`hue={palette.mint}`, `GlyphStock`) | `parado > 0` | `formatMoney(parado)` | `plural(lugares.length, t.app.places.placeCount)` + " · " + `fill(coverDays, {days})` | `/places` |
| 1 | **Custo** (`hue={palette.sky}`, `GlyphPrice`) | `comCusto.length > 0` | `formatMoney(Math.round(comCusto[0].unitCostRate))` | o nome da corrida, e um `Sparkline` das taxas quando há mais de uma | `/recipes` |
| 2 | **Perdas** (`hue={color.danger}`, `GlyphLoss`) | `perdido > 0` | `formatMoney(perdido)` | `fill(lossVsBefore, {amount})` ou `lossFirst` | `/losses` |
| 3 | **As portas do que ainda não tem número** | `faltando.length > 0` | — | — | a rota de cada linha |

(`app/(tabs)/reports.tsx:110-212`; rótulos em
`src/i18n/locales/pt-BR.ts:174-178`: "Estoque · o que tem e onde",
"Custo · o que cada unidade custa", "Perdas · quanto, onde e por quê".)

**`faltando`** (`app/(tabs)/reports.tsx:93-100`) é o registro do que **não** tem
cartão hoje, cada um com a rota e o desenho, filtrado por `!temDado`:

```
{ chave: 'stock',  rota: '/places',  temDado: parado > 0 }
{ chave: 'cost',   rota: '/recipes', temDado: comCusto.length > 0 }
{ chave: 'losses', rota: '/losses',  temDado: perdido > 0 }
```

O motivo está escrito: peça sem dado não vira cartão — mas sumir não é a
resposta, porque este índice também é o **caminho** para o custo e para as
perdas, e esconder a linha deixou as duas telas sem porta na primeira instalação.
Cartão para o que tem o que dizer, linha para o resto
(`app/(tabs)/reports.tsx:194-198`). O `desenho` declarado em cada entrada de
`faltando` (`GlyphStock`, `GlyphPrice`, `GlyphLoss` em `size={22}`) **não é usado
no render**, que desenha `ListRow` sem ícone (`app/(tabs)/reports.tsx:96-98`
contra `:202-209`): **campo implementado sem leitor**.

O rodapé "Abrir a tela" + chevron é o mesmo em todos os três cartões, definido
uma vez (`app/(tabs)/reports.tsx:102-108`).

**O que continua fora, com motivo escrito** (`app/(tabs)/reports.tsx:42-45`):
margem não existe porque **não há preço de venda em lugar nenhum deste
aplicativo**; o Espelho da Loja é corte do dono de 1 de setembro, porque o
relatório mente com duas semanas de dado. O e2e afirma a ausência:
`assert.doesNotMatch(reports, /margem|Espelho da loja/i)` (`e2e/flow.mjs:271`).

---

### 18.14 Aba Mais: `app/(tabs)/more.tsx`

**As gavetas: o que se abre uma vez por mês, não uma vez por turno.** Só três
assuntos moram aqui — perguntar, cadastrar, ajustar — e cada um é um cartão com o
desenho dele (`app/(tabs)/more.tsx:14-17`).

A tela **não consulta nada**: nenhuma linha tem número para mostrar, e cartão
que diz zero é alerta inventado (`app/(tabs)/more.tsx:143-146`).

O tipo de uma porta (`app/(tabs)/more.tsx:54-65`):

```
type Porta = { key: keyof Dictionary['app']['more']['rows']; detail: string; route: string };
```

O `detail` **não é enfeite**: é o que faz a pessoa não precisar abrir para saber
se era ali, e vem da **sobrelinha da própria tela de destino** — a frase que
aquela tela já usa para se apresentar, e que já existe nos três idiomas.

| Cartão | Título | Linhas (`label` · `detail` → rota) |
|---|---|---|
| **Pergunte** (`GlyphAssistant`) | `t.app.more.ask.label` = "Pergunte" | corpo = `t.app.more.ask.hint` = "escreva o que quer saber"; rodapé "Abrir a tela" + chevron; o cartão inteiro → `/assistant` (`app/(tabs)/more.tsx:125-141`) |
| **CADASTROS** (`GlyphCatalog`) | `t.app.more.groups.registers` | "Insumos" · "o que você compra" → `/inputs`; "Receitas" · "o que entra em cada vez" → `/recipes`; "Produtos" · "o que sai para vender" → `/products`; "Lojas e clientes" · "onde está o que você tem" → `/places` (`app/(tabs)/more.tsx:73-78`) |
| **LANÇAMENTOS** (`GlyphPurchase`) | `t.app.more.groups.entries` | "Pedidos" · "o que os clientes pediram" → `/orders`; "Compras" · "a nota move o custo" → `/purchase` (`app/(tabs)/more.tsx:92-95`) |
| **CONFIGURAÇÕES** (`GlyphSettings`) | `t.app.more.groups.settings` | "Clima" · "trocar a cidade" → `/weather`; "Ajustes" · "O que está guardado" → `/settings` (`app/(tabs)/more.tsx:97-104`) |

(Rótulos em `src/i18n/locales/pt-BR.ts:306-325`.)

**Por que "LANÇAMENTOS" existe** (`app/(tabs)/more.tsx:80-91`): as duas linhas
estavam sob "CADASTROS", e o cabeçalho era falso justamente sobre a porta mais
consequente das seis — compra escreve no livro-razão append-only (o próprio
detalhe da linha diz "a nota move o custo", que é movimento) e pedido é o livro
de pedidos, com aprovar, entregar e cancelar. A palavra não é neutra para quem
lê: **cadastro se corrige editando, escrita no livro-razão só se corrige por
estorno**. Prometer a classe de risco errada é o mesmo defeito de um rótulo que
discorda do número embaixo dele.

**O que ficou fora, com motivo escrito** (`app/(tabs)/more.tsx:33-38`): a tela
desenhada tinha três grupos, e o terceiro — "Financeiro" e "Notas fiscais" — não
tem nada atrás. Não existe preço de venda neste aplicativo, nem conta, e o fiscal
é um projeto .NET à parte com certificado A1 e homologação na SEFAZ, do qual o
plano diz que nada depende. Gaveta que abre no vazio é pior que gaveta não
desenhada. **"Pessoas" falta pelo mesmo motivo: `operator_id` é coluna sem tabela
de gente atrás.** O e2e afirma a ausência das três:
`assert.doesNotMatch(more, /Financeiro|Notas fiscais|Pessoas/)`
(`e2e/flow.mjs:283`).

**E um cartão aqui NÃO está na tela desenhada: "Pergunte".** O assistente existe,
responde catorze perguntas offline, e as cinco pranchas nunca o desenharam —
deixá-lo inalcançável apagaria em silêncio uma coisa pronta, então ele fica em
cima, inteiro. Essa colocação está declarada como a única coisa daquela tela que
o dono não desenhou (`app/(tabs)/more.tsx:40-44`).

**O defeito que esta tela consertou** (`app/(tabs)/more.tsx:18-31`): havia um
crachá de cor desenhado à mão em cada linha (dez pixels de `backgroundColor` com
`borderRadius`), um título de grupo em caixa alta como parágrafo, e `Pressable`
cru no lugar do toque que afunda. Os pontinhos coloridos são o defeito que a
língua da casa nomeia: ícone em toda linha de lista vira papel de parede e some —
e sem legenda nenhuma, um ponto laranja não ensina que laranja é produção. O tom
agora é do **cartão**, que é o assunto, e a linha volta a ser um nome e o que se
acha lá dentro.

---

### 18.15 O casco de toda tela: `CollapsingHeader`

Todas as vinte e quatro telas passam por ele (`src/components/CollapsingHeader.tsx:28-139`).

| Constante | Valor | Papel |
|---|---|---|
| `EXPANDED` | `34` | tamanho do título no topo |
| `COLLAPSED` | `22` | tamanho depois de rolar |
| `RANGE` | `72` | quantos pixels de rolagem fazem a transição |

(`src/components/CollapsingHeader.tsx:16-18`.)

O título interpola `fontSize` de 34 a 22 em 72 px de rolagem, com
`Extrapolation.CLAMP`; a sobrelinha desaparece na metade disso, perdendo opacidade
**e altura** (de 18 a 0), o que evita o buraco
(`src/components/CollapsingHeader.tsx:53-60`). A marca vem antes do título:
`Mark size={18}` solto no Papel — porque o dono circulou justamente as
"caixinhas" e esta era uma delas — e `Mark size={15}` dentro de um quadrado de
28×28 com fundo `${accent}22` e `borderRadius: 9` no Orgânico
(`src/components/CollapsingHeader.tsx:72-81`). A sobrelinha é sempre
`.toUpperCase()` e `numberOfLines={1}`
(`src/components/CollapsingHeader.tsx:93-99`).

Três detalhes do `ScrollView` que valem reconstruir:

- `keyboardShouldPersistTaps="handled"`: com o teclado aberto, o padrão do React
  Native (`never`) gasta o primeiro toque fechando o teclado, e o botão de
  confirmar só responde no segundo. No chão de fábrica isso lê como "o app não
  salvou" — e a pessoa toca de novo, ou desiste. É invisível na web e para o e2e:
  um navegador não tem teclado que sobe
  (`src/components/CollapsingHeader.tsx:105-110`).
- `paddingBottom: insets.bottom + space.xxl + tabBar` — a barra de abas medida
  por contexto (`src/components/CollapsingHeader.tsx:113`).
- **A entrada escalonada é dada a toda tela de uma vez**:
  `Children.toArray(children).map((filho, i) => <Reveal index={i}>)`. O
  `toArray` é o que dá o índice **e descarta os nulos** que as telas devolvem
  quando um cartão não se aplica — sem isso, um cartão ausente contaria como
  posição e abriria um buraco de quarenta milissegundos no meio da sequência
  (`src/components/CollapsingHeader.tsx:117-131`). A capa é a exceção conhecida:
  os cartões dela moram dentro de um componente de layout, então o casco vê um
  filho só e o escalonamento de verdade continua dentro do Mosaico
  (`src/components/CollapsingHeader.tsx:132-135`).

---

### 18.16 Lacunas e classificações, em resumo

**Implementado e chamado por tela:** todas as cinco abas; treze das catorze peças
do mosaico; o convite de primeiro dia; o cartão do clima com semana aberta; a
edição de ordem e de silenciar em Ajustes; `Crash` (por dois caminhos: falha de
banco e `ErrorBoundary`); `WhatsNew`; `Alerts`.

**Implementado sem chamador (ou com chamador que não faz o que o texto promete):**

| Coisa | Estado |
|---|---|
| `pecas.expedicao` | `null` no mosaico, mas presente no catálogo (`src/domain/briefing.ts:31`) e na tradução (`src/i18n/locales/pt-BR.ts:464`); mover ou esconder não muda a capa |
| "Abrir a tela" em `aoVivo`, `entregaHoje`, `perdas`, `custo`, `parado` | texto presente, nenhuma navegação atrelada (`src/home/Mosaic.tsx:426,600,699,765,817`) |
| ramos vazios de `historico` e `cobertura` (`historyEmpty`, `coverUnknown`) | inalcançáveis, porque a peça devolve `null` antes (`src/home/Mosaic.tsx:457,527`) |
| `t.app.home.steady`, `steadyDetail`, `stableFor`, `stableAlways`, `liveNothing`, `dueNobody`, `expiryNone`, `expiryDays`, `lossNone`, `costFrozen`, `running`, `runningSince`, `each`, `why`, `overline`, `checking`, `allSteady`, `whereTo`, `record`, `unitCost`, `costWas`, `nav.*` | chaves em `src/i18n/locales/pt-BR.ts:66-161` que a capa atual não referencia; `nav.*` é o menu de nove linhas que a barra de abas substituiu |
| `desenho` nas entradas de `faltando` em Relatórios | declarado e não renderizado (`app/(tabs)/reports.tsx:96-98`) |
| `weather.days.slice(0, 7)` | o desenho aceita sete dias; `fetchForecast` pede `forecast_days=2` (`src/weather/index.ts:195`) |

**Planejado/comentado apenas:** "estável há N dias" na capa (a consulta que leria
`item_cost_history` para isso não existe — `app/(tabs)/index.tsx:81-83`);
"Financeiro", "Notas fiscais" e "Pessoas" na aba Mais
(`app/(tabs)/more.tsx:33-38`); margem e Espelho da Loja em Relatórios
(`app/(tabs)/reports.tsx:42-45`).

**NÃO ESTÁ NO CÓDIGO:** rota de erro 404 (`+not-found`); qualquer `_layout.tsx`
dentro das pastas de detalhe; `initialRouteName` declarado em qualquer layout;
indicador de carregamento no arranque (é uma `View` vazia,
`app/_layout.tsx:97`); qualquer navegação a partir das peças que imprimem "Abrir
a tela".
