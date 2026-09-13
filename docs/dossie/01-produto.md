## 1. O produto: o que é, para quem, e o que deliberadamente não é

### 1.1 A frase de uma linha, transcrita nos três idiomas

O produto se descreve com a mesma frase em três lugares, e ela é o teto de escopo de
tudo o que vem depois.

| idioma | o que a primeira linha promete | fonte |
|---|---|---|
| pt-BR | "Sistema de gestão para quem **fabrica e distribui**: da receita ao custo real, da produção ao lote, da câmara fria à loja, e do que saiu ao lucro que deveria ter saído." | `README.md:5-7` |
| en | "Management software for people who **make and distribute**: from recipe to real cost, from production to lot, from the cold room to the store, and from what shipped to the profit that should have come back." | `docs/README.en.md:5-7` |
| es | "Sistema de gestión para quien **fabrica y distribuye**: de la receta al costo real, de la producción al lote, de la cámara fría a la tienda, y de lo que salió a la ganancia que debería haber vuelto." | `docs/README.es.md:5-7` |

O `CLAUDE.md` abre com a versão curta da mesma coisa: "Sistema de gestão para quem
**fabrica e distribui**. Nasce numa fábrica de picolés, mas será publicado nas lojas:
**nada de regra chumbada de sorvete, nada de nome de empresa**." (`CLAUDE.md:3-5`).

O segundo parágrafo do README é o que separa a origem do escopo, e as três versões
dizem a mesma coisa com os substantivos locais:

- pt-BR: "Nasce para uma fábrica de picolés e sorvetes, mas sem nenhuma regra chumbada
  de sorvete — a hierarquia de embalagem, os módulos e os papéis são todos
  configuráveis, porque o produto será publicado nas lojas Android e Apple."
  (`README.md:9-11`)
- en: "It starts life at a popsicle and ice cream factory, but nothing about ice cream
  is hardcoded — the packaging hierarchy, the modules and the roles are all
  configurable, because the product is meant to ship on the Android and Apple stores."
  (`docs/README.en.md:9-12`)
- es: "Nace en una fábrica de paletas y helados, pero nada del helado está fijo en el
  código — la jerarquía de empaque, los módulos y los roles son configurables, porque
  el producto se publicará en las tiendas de Android y Apple." (`docs/README.es.md:9-11`)

### 1.2 O estado declarado nos READMEs, e por que ele está velho

Os três READMEs carregam um bloco de citação de estado, idêntico em conteúdo:

> **Estado: Fase 1 — o que você produz e quanto custa.** Sobre o alicerce da Fase 0
> (livro-razão, multi-empresa, permissão por capacidade, design system, i18n) já rodam
> as telas de insumo, receita, produto e nota de compra, com o custo recalculando
> enquanto se digita. Produção, lote e distribuição são as fases seguintes.
> (`README.md:13-17`; en em `docs/README.en.md:14-17`; es em `docs/README.es.md:13-17`)

**Esse bloco está desatualizado nos três idiomas.** O `docs/roadmap.md:82-85` afirma
"**F1 e F2 estão feitas**", e o `CLAUDE.md:380-381` registra "Fase 1 dada como feita —
decisão do dono, 1 de setembro. A Fase 2 está destravada". O README diz "as telas de
insumo, receita, produto e nota de compra" (quatro); o repositório tem **24 telas**
(`find app -name '*.tsx' | grep -v _layout | wc -l` = 24, a mesma conta que
`src/bar.test.ts:135-145` deriva e compara contra `docs/roadmap.md:32`). O README foi
alterado por último em 1 de setembro; o último commit do repositório é de 4 de setembro.

### 1.3 O problema que resolve: a tabela de mercado, transcrita

Os três READMEs trazem a mesma pesquisa de cinco mercados. Transcrição da versão
portuguesa (`README.md:23-37`), com as variações dos outros dois idiomas anotadas:

| Região | Resolve bem | Ignora |
|---|---|---|
| 🇧🇷 Brasil | PDV de loja **ou** ERP industrial pesado | O fabricante pequeno que distribui |
| 🇦🇷🇨🇱🇲🇽🇨🇴 LATAM | PDV de gastronomia | Produção como indústria |
| 🇺🇸🇬🇧 Anglófono | Custo de receita, rastreabilidade | Mobile, preço acessível |
| 🇮🇹 Itália | Balanceamento técnico (PAC/POD) | Estoque, distribuição, dinheiro |
| 🇮🇳 Índia | Distribuição, cadeia fria | Porte pequeno, simplicidade |

As três versões da conclusão:

- pt-BR: "Cada região resolve um pedaço. **Ninguém junta.** E a reclamação nº 1 do
  setor não é falta de recurso — é **implantação e suporte**. Por isso o assistente de
  início, que a pessoa conclui sozinha sem consultor, é tratado aqui como
  funcionalidade principal, não como detalhe." (`README.md:34-37`)
- en: "Each region solves one piece. **Nobody joins them.** And the sector's number one
  complaint is not a missing feature — it is **onboarding and support**. That is why
  the setup assistant, which a person completes alone without a consultant, is treated
  here as a headline capability rather than a detail." (`docs/README.en.md:34-37`)
- es: "Cada región resuelve una parte. **Nadie las junta.** Y la queja número uno del
  sector no es una función faltante: es la **implantación y el soporte**." (`docs/README.es.md:34-37`)

**O assistente de início não existe.** É a divergência mais grave entre o que o README
promete e o que o código faz: os três textos chamam o setup guiado de "funcionalidade
principal", e não há tela de onboarding em `app/` (nenhuma rota; busca por
`onboarding`/`wizard` em `src` e `app` não retorna nada). O próprio código admite a
ausência: `src/data/seed.ts:27` diz "It exists because the guided setup is a later
phase, and an app that opens onto nothing gives no one a reason to type the first sixty
inputs" — a semente de exemplo é o substituto declarado. **NÃO IMPLEMENTADO.**

Nenhum concorrente é nomeado em nenhum lugar do repositório. A única referência é
anônima, num comentário de coluna do banco: "a locked field reads as a money grab,
which is exactly the review the market leader earns"
(`supabase/migrations/0001_foundation.sql:35-38`).

### 1.4 Para quem: o usuário final e sua habilidade técnica

"O usuário final é o dono da fábrica, de baixa habilidade técnica. Quando simplicidade
e sofisticação brigarem, **simplicidade ganha**." (`CLAUDE.md:7-8`)

"O dono da fábrica não deveria precisar aprender a navegar — ele pergunta."
(`README.md:80`)

O porte assumido é **fábrica de seis pessoas**, e o número aparece como premissa de
decisão em dois lugares independentes:

- "Numa fábrica de seis pessoas quem anda até a prateleira é quem trabalha lá, não o
  dono." (`CLAUDE.md:343-344`)
- "in a factory of six the person who walks to the shelf is the person who works
  there - not the owner" (`src/domain/access.ts:78-79`)
- "a fábrica pequena entrega antes de a aprovação chegar" — justificativa do padrão
  desligado da aprovação de pedido (`supabase/migrations/0019_an_order_is_demand.sql:43-44`)

Os **sete papéis** que o produto entrega de fábrica, com as capacidades exatas de cada
um, transcritos de `src/domain/access.ts:70-112`:

| papel | capacidades | linha |
|---|---|---|
| `owner` | todas as 12 | `access.ts:72` |
| `operator` | `record_production`, `dispatch`, `check_receipt`, `record_loss`, `adjust_stock` | `access.ts:87` |
| `storeManager` | `view_sale_price`, `check_receipt`, `record_loss`, `place_order` | `access.ts:89` |
| `driver` | `dispatch`, `check_receipt`, `record_loss` | `access.ts:91` |
| `buyer` | `view_cost`, `view_sale_price`, `check_receipt`, `place_order`, `approve_order`, `adjust_stock`, `view_finance` | `access.ts:97-105` |
| `customer` | `view_sale_price`, `check_receipt`, `place_order`, `view_finance` | `access.ts:108` |
| `salesperson` | `view_sale_price`, `place_order`, `view_finance` | `access.ts:111` |

A ausência que define o produto está escrita como comentário: "The factory operator has
no `view_cost` and no `view_sale_price`, and that is not distrust - it is that the
number is irrelevant to the job and its presence invites conversations about margin on
the factory floor." (`src/domain/access.ts:63-66`). E: "The driver may record a loss
because a pallet does fall off a truck, and refusing them the button is what turns a
real loss into unexplained shrinkage." (`src/domain/access.ts:66-68`)

Decisão do dono correspondente: "**Aparelho emprestado entra como produção e nada
mais.** Celular da empresa passa de mão; quem está com ele usa o papel `operator` — sem
custo, sem preço, sem dinheiro." (`CLAUDE.md:339-341`)

### 1.5 O contexto físico que o produto assume

Cada suposição física aparece escrita como justificativa de uma decisão de engenharia.
A lista completa do que o repositório assume sobre o mundo em que o app roda:

| lugar / condição | o que o produto assume | onde está escrito |
|---|---|---|
| Câmara fria a −18 °C / −20 °C | não tem sinal de celular; é "caixa de metal" | `README.md:54-55`; `docs/roadmap.md:274-277` |
| Câmara fria | tela capacitiva com luva; QR lido a um braço de distância | `CLAUDE.md:407-408`; `src/domain/qr.ts:6-11` |
| Etiqueta de lote | congela, descasca, é arranhada por caixa empilhada; o código de 11 caracteres é impresso ao lado do QR para ser digitado à mão | `src/domain/qr.ts:21-25`; `src/i18n/locales/pt-BR.ts:193` |
| Galpão | luz ruim; corpo de texto em 17 pt, "um passo acima do padrão de mercado" | `README.md:113-117` |
| Rota de entrega | não tem sinal; id gerado no aparelho para reenvio ser inofensivo | `README.md:54-56` |
| Celular do chão de fábrica | passa de mão, e costuma estar logado na conta Google de alguém — por isso `allowBackup: false` | `src/release.test.ts:20-27`; `app.json:17` |
| Celular comum de fábrica | 360 px de largura (não 412) — o rótulo da aba perdia letras | `app/(tabs)/_layout.tsx:38-59` |
| Impressora do chão de fábrica | térmica monocromática — por isso a marca é grafite e não uma cor | `src/config/brand.ts:27-31` |
| Loja / cliente | quem confere a chegada pode ser outra pessoa, em outro lugar | `src/i18n/locales/pt-BR.ts:741-745` |
| Capacidade de câmara | declarada em engradados, nunca em metros cúbicos: "Asking someone for a volume is hostile" | `supabase/migrations/0001_foundation.sql:116-119` |

### 1.6 Identidade do aplicativo: nomes, ids, versões

Tudo o que identifica o app, transcrito de `app.json`:

| campo | valor | linha |
|---|---|---|
| `expo.name` | `NORVA` | `app.json:3` |
| `expo.slug` | `norva` | `app.json:4` |
| `expo.scheme` (deep link) | `norva` | `app.json:5` |
| `expo.version` | `0.10.0` | `app.json:6` |
| `expo.orientation` | `portrait` | `app.json:7` |
| `expo.icon` | `./assets/icon.png` | `app.json:8` |
| `expo.userInterfaceStyle` | `automatic` | `app.json:9` |
| `expo.newArchEnabled` | `true` | `app.json:10` |
| `expo.ios.supportsTablet` | `true` | `app.json:12` |
| `expo.ios.bundleIdentifier` | `app.norva.mobile` | `app.json:13` |
| `expo.android.package` | `app.norva.mobile` | `app.json:16` |
| `expo.android.allowBackup` | `false` | `app.json:17` |
| `expo.android.adaptiveIcon.backgroundColor` | `#FAF7F2` | `app.json:19` |
| `expo.android.adaptiveIcon.foregroundImage` | `./assets/android-icon-foreground.png` | `app.json:20` |
| `expo.android.adaptiveIcon.backgroundImage` | `./assets/android-icon-background.png` | `app.json:21` |
| `expo.android.adaptiveIcon.monochromeImage` | `./assets/android-icon-monochrome.png` | `app.json:22` |
| `expo.android.predictiveBackGestureEnabled` | `false` | `app.json:24` |
| `expo.web.bundler` | `metro` | `app.json:27` |
| `expo.web.output` | `single` | `app.json:28` |
| `expo.web.favicon` | `./assets/favicon.png` | `app.json:29` |
| `expo.plugins` | `expo-router`, `expo-localization`, `expo-sqlite`, `expo-notifications` | `app.json:31-36` |
| `expo.experiments.typedRoutes` | `true` | `app.json:38` |
| `expo.owner` | `chrnx0` | `app.json:40` |
| `expo.runtimeVersion.policy` | `fingerprint` | `app.json:41-43` |
| `expo.updates.url` | `https://u.expo.dev/384e9ec9-b731-4691-a622-d1edc89259a1` | `app.json:45` |
| `expo.updates.fallbackToCacheTimeout` | `0` | `app.json:46` |
| `expo.extra.eas.projectId` | `384e9ec9-b731-4691-a622-d1edc89259a1` | `app.json:50` |

**Não existe chave `splash` em `app.json`.** O arquivo `assets/splash-icon.png` é
gerado por `scripts/icons.mjs:154`, e nada em `app.json` o referencia. Um dos treze
achados médios da auditoria é exatamente "a tela de abertura ainda ser o andaime da
Expo" (`docs/auditoria.md:225-226`). **NÃO IMPLEMENTADO** como configuração de produto.

**O `versionCode` não está no repositório.** `app.json` não declara `versionCode`; ele é
calculado no fluxo de build a partir da versão, pela fórmula
`a * 1.000.000 + b * 10.000 + c * 100` (`.github/workflows/build-apk.yml:191-195`).
Para `0.10.0` isso dá **100000**; `0.11.0` dá 110000 e `1.0.0` dá 1.000.000. A fórmula
anterior era `a * 100.000 + b * 10.000 + c` e **colidia dentro do alcance de hoje**:
0.10.0 e 1.0.0 davam 100000 os dois, com o 0.10.0 já publicado
(`.github/workflows/build-apk.yml:178-187`; guarda em `src/release.test.ts:35-55`).

O que existe em disco na árvore de trabalho é o prebuild local: `android/app/build.gradle`
traz `namespace 'app.norva.mobile'` (linha 90), `applicationId 'app.norva.mobile'`
(linha 92), `versionCode 100000` (linha 95) e `versionName "0.10.0"` (linha 96) — mas
`/android` e `/ios` estão no `.gitignore:40-41`, então **nada disso é do repositório**:
é saída de `npx expo prebuild` mais o `sed` do workflow. Não há diretório `ios/` nesta
árvore: **o alvo iOS está declarado e nunca foi compilado**.

**Divergência de versão dentro do próprio repositório.** `package.json:3` diz
`"version": "0.1.0"` e nunca foi alterado; `app.json:6` diz `0.10.0`. A versão de
`app.json` é a de verdade — é ela que `src/release.test.ts:15-16` lê, que
`.github/workflows/build-apk.yml:190` usa para nomear o APK e a tag, e que aparece na
tela (`app/settings.tsx:414`, sobrelinha `NORVA · 0.10.0` via
`Constants.expoConfig?.version`). Nada no repositório lê `package.json.version`.

Histórico de versões, todas em quatro dias (31 de agosto a 4 de setembro de 2026):
`0.1.0`, `0.2.0`, `0.3.0`, `0.4.0`, `0.5.0`, `0.6.0`, `0.7.0`, `0.8.0`, `0.9.0`,
`0.10.0` (`git log -p app.json`). A única tag local é `apk-0.1.0`.

### 1.7 A marca: o arquivo único, transcrito

`src/config/brand.ts` é o ponto único da identidade, e o docblock diz por quê:

> "Single source of truth for the product's brand identity. The brand name is still
> pending a trademark clearance search (INPI classes 9 and 42), which cannot be
> automated: INPI requires a gov.br login and WIPO's Global Brand Database is behind a
> CAPTCHA. To keep that uncertainty from blocking engineering, nothing else in the
> codebase hardcodes the name. Changing brands is an edit to this file plus `app.json`."
> (`src/config/brand.ts:1-9`)

| chave | valor | comentário no código |
|---|---|---|
| `name` | `'NORVA'` | "Display name. Shown to users, never translated." (`brand.ts:11-12`) |
| `slug` | `'norva'` | "Lowercase identifier used for storage keys, deep links and analytics." (`brand.ts:14-15`) |
| `scheme` | `'norva'` | "Deep link scheme. Must match `expo.scheme` in app.json." (`brand.ts:17-18`) |
| `markPath` | `'M50,50 L70.3,11 A44,44 0 1,1 29.7,11 Z'` | "a solid disc with a 55-degree notch pointing north… on a 100x100 viewBox so every surface — splash, icon, header, print — draws the exact same geometry" (`brand.ts:20-25`) |
| `markColorLight` | `'#2E2B27'` | "Graphite, not a hue… a colored mark would fight all of them… prints on a monochrome thermal label" (`brand.ts:27-32`) |
| `markColorDark` | `'#EDEBE7'` | idem (`brand.ts:33`) |

O tipo exportado é `export type Brand = typeof brand` (`brand.ts:36`).

Onde a marca aparece de fato, e é só nestes lugares:

- título da tela inicial: `<CollapsingHeader title={brand.name} …>` (`app/(tabs)/index.tsx:344`)
- sobrelinha dos Ajustes: `${brand.name} · ${Constants.expoConfig?.version}` (`app/settings.tsx:414`)
- detalhe técnico da tela de erro: `{brand.name} · {error.name}: {error.message}` (`src/components/Crash.tsx:83`)
- o símbolo desenhado no cabeçalho, a 18 px e a 15 px (`src/components/Mark.tsx:24`, chamado em `src/components/CollapsingHeader.tsx:76,79`)
- chave de armazenamento do aviso de novidades: `` `${brand.slug}:release-seen` `` (`src/components/WhatsNew.tsx:10`)

**O `scheme` (`norva://`) não tem consumidor.** `expo-linking` é dependência
(`package.json:27`) e nenhum arquivo de `src/` ou `app/` o importa; o QR do lote carrega
o **código do lote** (11 caracteres, ex. `20260902-01`), não uma URL
(`src/domain/qr.ts:13-19`). **IMPLEMENTADO SEM CHAMADOR.**

As seis superfícies de ícone saem do mesmo `markPath`, por `scripts/icons.mjs:143-152`:

| arquivo | lado | fração do lado que o disco ocupa | fundo |
|---|---|---|---|
| `assets/icon.png` | 1024 | 0,62 | `#FAF7F2` |
| `assets/android-icon-foreground.png` | 1024 | 0,44 | transparente |
| `assets/android-icon-background.png` | 1024 | 0 (só o fundo) | `#FAF7F2` |
| `assets/android-icon-monochrome.png` | 1024 | 0,44 | transparente, tinta `#000000` |
| `assets/splash-icon.png` | 1024 | 0,50 | transparente |
| `assets/favicon.png` | 96 | 0,72 | `#FAF7F2` |

O gerador **recusa** um `markPath` que ele não saiba desenhar, e confere que as duas
pontas do caminho estão à distância do raio declarado, porque "a falha silenciosa aqui é
desenhar um ícone errado com exit zero, e ninguém confere um ícone que o script disse ter
escrito" (`scripts/icons.mjs:19-24, 42-58`).

Cicatriz registrada: até 4 de setembro `assets/icon.png` era **o andaime da Expo** — a
seta azul com as linhas-guia de construção — e o `brand.ts` já prometia por escrito que
todas as superfícies saíam do mesmo caminho. "Era verdade em três superfícies e mentira
na quarta — e a quarta é o quadradinho pelo qual o aplicativo é aberto. A promessa não
estava errada por descuido de escrita: ela descrevia uma intenção que nunca teve
mecanismo." (`docs/insights.md:2831-2843`)

### 1.8 Plataformas alvo

**Android.** Alvo primário. Pacote `app.norva.mobile`, backup do sistema desligado,
ícone adaptativo com as três camadas (frente, fundo, monocromático), gesto de voltar
preditivo desligado (`app.json:15-25`). O instalador é compilado **no runner do
GitHub**, não na Expo, por dois motivos escritos: "A cota da Expo é limitada e o dono
pediu para guardar para versão madura e OTA. E o APK da Expo sai com quatro
arquiteturas — 110 MB, dos quais 47 são x86 e x86_64, que só existem em emulador. Aqui
sai só arm64-v8a: 47 MB." (`.github/workflows/build-apk.yml:3-8`). O artefato é anexado
a um release do GitHub com tag `apk-<versão>` e nome `norva-<versão>-arm64.apk`
(`.github/workflows/build-apk.yml:235-237, 280-281`). Quatro verificações antes de
publicar: assinatura pelo `apksigner`, presença de `assets/index.android.bundle` dentro
do APK, exatamente uma arquitetura, e o nome carregando a versão
(`.github/workflows/build-apk.yml:211-239`).

**iOS.** Declarado (`bundleIdentifier: app.norva.mobile`, `supportsTablet: true`) e
nunca compilado: não existe `ios/` na árvore, e `/ios` está ignorado
(`.gitignore:40`). O README lista "Conta Expo/EAS para build e atualização OTA" entre o
que falta e depende de decisão humana (`README.md:169`).

**Web.** O mesmo código roda no navegador, e isso não é só conveniência — é o único
jeito de dirigir o aplicativo automaticamente neste ambiente. Duas configurações não
opcionais, transcritas de `README.md:209-216`:

- "`metro.config.js` trata `.wasm` como asset. O `expo-sqlite` roda no navegador através
  de uma compilação WebAssembly do SQLite, e sem isso o banco não existe."
- "O servidor precisa mandar `Cross-Origin-Opener-Policy: same-origin` e
  `Cross-Origin-Embedder-Policy: require-corp`. Sem isolamento de origem o navegador
  recusa `SharedArrayBuffer` e o banco não abre."

Os dois cabeçalhos estão em `vercel.json:6-19`, com `buildCommand: npx expo export
--platform web` e `outputDirectory: dist` (`vercel.json:3-4`). E: "Os dados ficam **no
navegador de quem abre**, não num servidor — é o mesmo desenho offline-first do
aplicativo." (`README.md:218-219`)

Perfis de build EAS declarados em `eas.json`: `development` (cliente de
desenvolvimento, distribuição interna, canal `development`), `preview` (interna, APK,
canal `preview`), `production` (`autoIncrement: true`, canal `production`), e
`submit.production` vazio. `cli.appVersionSource: "remote"` (`eas.json:1-27`).

### 1.9 Idiomas, moeda e fuso

Três idiomas, obrigatórios por tipo: `export type LanguageTag = 'pt-BR' | 'es' | 'en'`
(`src/i18n/index.ts:8`), com os dicionários em `src/i18n/locales/pt-BR.ts` (1178
linhas), `es.ts` (1056) e `en.ts` (1050).

O mecanismo que obriga os três é uma linha de tipo:

```ts
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Dictionary = Widen<typeof ptBR>;
```
(`src/i18n/locales/pt-BR.ts:1176-1178`)

"O tipo `Widen<T>` faz a estrutura ser verificada e a redação ser livre: acrescentar uma
chave em português quebra a compilação das outras duas até serem escritas. Não existe
caminho em que uma tela chegue ao aparelho com tradução faltando." (`README.md:182-186`).
A auditoria confirma o resultado: "Os três idiomas têm exatamente as mesmas chaves, e a
compilação quebra se alguém escrever texto em um só. Melhor que a média."
(`docs/auditoria.md:33-34`)

**O idioma é propriedade da empresa, não do aparelho.** "uma fábrica brasileira cujo
dono lê em inglês continua rodando em português no chão de fábrica" (`README.md:188-190`);
o mesmo está no banco, como comentário da coluna: "Locale travels with the company, not
the phone: a Brazilian factory whose owner reads the app in English still bills in BRL."
(`supabase/migrations/0001_foundation.sql:24-25`). Colunas:
`companies.language text not null default 'pt-BR'`, `companies.currency text not null
default 'BRL'`, `companies.time_zone text not null default 'America/Sao_Paulo'`
(`supabase/migrations/0001_foundation.sql:26-28`).

As oito moedas oferecidas, e a região que cada uma implica
(`src/i18n/company.ts:19-28`):

| código | região de formatação |
|---|---|
| `BRL` | `BR` |
| `USD` | `US` |
| `EUR` | `ES` |
| `MXN` | `MX` |
| `ARS` | `AR` |
| `CLP` | `CL` |
| `COP` | `CO` |
| `PYG` | `PY` |

**Por que a moeda decide o formato e não o idioma**, transcrito: "Espanhol escreve
`1.234,56` na Espanha e `1,234.56` no México — o mesmo idioma, o ponto e a vírgula
trocados de lugar. Um número de dinheiro lido ao contrário é a pior classe de erro que
este aplicativo pode cometer, então quem manda no formato é a REGIÃO, e a região vem da
moeda: quem cobra em peso mexicano está no México." (`src/i18n/company.ts:6-11`)

A regra de composição: `formattingFor(language, currency)` devolve `'pt-BR'` direto para
português; para `es` e `en` cola a região da moeda (`es-MX`, `en-US`); moeda fora da
lista cai no idioma sozinho — "pior formato, nunca erro" (`src/i18n/company.ts:39-47`).

O aparelho é palpite do primeiro dia e nada mais: `detectLanguage()` devolve `pt-BR` se
alguma tag do aparelho começa com `pt`, `es` se começa com `es`, senão `en`
(`src/i18n/device.ts:13-18`); `detectCurrency()` devolve a primeira moeda do aparelho que
esteja na lista das oito, senão `BRL` (`src/i18n/device.ts:30-36`); `detectTimeZone()`
devolve o fuso do calendário do aparelho, com `America/Sao_Paulo` como último recurso
(`src/i18n/device.ts:46-49`). O padrão do produto:
`defaultLocale = { language: 'pt-BR', formatting: 'pt-BR', currency: 'BRL', timeZone:
'America/Sao_Paulo' }` (`src/i18n/index.ts:25-30`).

O fuso **não é preferência e não vira pergunta**: "o celular está no galpão. Isto decide
qual DIA um tacho fechado às 22h pertence, e o padrão chumbado em `America/Sao_Paulo`
fazia uma fábrica em Manaus lançar produção no dia errado — uma hora de diferença, todos
os dias, no número que vai na etiqueta." (`src/i18n/device.ts:40-45`)

**O assistente é só português, e isso é fronteira registrada.** "o que ele reconhece são
frases em português. Traduzir as respostas seria meio trabalho — as perguntas
continuariam chegando num idioma só. Quando o modelo de linguagem fizer o
reconhecimento, o idioma da pergunta deixa de ser problema do casador, e as respostas
vão para o dicionário na mesma mudança." (`README.md:192-196`; a mesma decisão está
citada em `CLAUDE.md:363-366` como exemplo de fronteira que já custou uma rodada quando
foi confundida com defeito.)

### 1.10 "Nada de regra chumbada de sorvete": o que isso significa em concreto

Quatro mecanismos fazem a promessa ser mais que uma frase:

1. **A hierarquia de embalagem é dado, não código.** `items.packaging jsonb not null
   default '[{"id":"unit","perBaseUnit":1}]'::jsonb`, com o comentário "The next customer
   may stack Unit -> Pack -> Bale instead."
   (`supabase/migrations/0001_foundation.sql:140-144`). O exemplo semeado usa
   `unit`/`box`(50)/`crate`(300) (`src/data/seed.ts:16-22`).
2. **Os tipos de item são genéricos:** `create type item_kind as enum ('input',
   'packaging', 'product', 'resale', 'store_supply')`
   (`supabase/migrations/0001_foundation.sql:133`).
3. **Os módulos são chave em JSON, e desligar não apaga:** `companies.modules jsonb not
   null default '{}'::jsonb`, com o comentário "Feature switches (lots, qr, fiscal,
   finance, sanitary, balancing, ...). Disabled means invisible, never greyed out"
   (`supabase/migrations/0001_foundation.sql:31-38`). **Nenhuma tela lê `modules` hoje** —
   nenhuma ocorrência em `src/` ou `app/`. **IMPLEMENTADO SEM CHAMADOR** (existe a
   coluna, não existe o interruptor).
4. **O papel é pacote de capacidades, não tela:** "A role is a named bundle, and a
   company that needs a different bundle edits the capabilities rather than waiting for a
   release." (`src/domain/access.ts:44-49`)

A grade do produto é a forma explícita disso na interface: "Cadastre uma vez e combine à
vontade. Picolé tradicional de morango é uma linha, um tipo e um sabor — não um nome
digitado inteiro." (`src/i18n/locales/pt-BR.ts:956-957`), com as tabelas
`product_lines`, `product_types` e `flavors` no aparelho (`src/data/db.ts:406,414,423`).

**Onde o sorvete ainda aparece, e por quê é aceitável.** Exatamente quatro pontos por
dicionário, e todos são exemplo ou placeholder — nunca regra:

| chave | pt-BR | en | es |
|---|---|---|---|
| `catalog.intro` | "Picolé tradicional de morango…" (`pt-BR.ts:957`) | "A traditional strawberry popsicle…" (`en.ts:876`) | "Paleta tradicional de frutilla…" (`es.ts:882`) |
| `catalog.linesHint` | "o que você fabrica: Picolé, Pote de sorvete" (`pt-BR.ts:959`) | "what you make: Popsicle, Ice cream tub" (`en.ts:878`) | "lo que fabricas: Paleta, Pote de helado" (`es.ts:884`) |
| `productForm.namePlaceholder` | "Picolé de morango" (`pt-BR.ts:987`) | "Strawberry popsicle" (`en.ts:903`) | "Paleta de frutilla" (`es.ts:909`) |
| `assistant` placeholder | "quanto custa o picolé de morango" (`pt-BR.ts:1031`) | "what does the strawberry popsicle cost" (`en.ts:947`) | "cuánto cuesta la paleta de frutilla" (`es.ts:953`) |

Os dados de exemplo semeados também são de sorveteria, e por decisão: quatro insumos
(`Polpa de morango` em balde de 10 kg, `Açúcar cristal` em saco de 25 kg, `Leite em pó`
em saco de 25 kg, `Glucose 38DE` em balde de 5 kg), duas embalagens (`Palito de picolé`
caixa de 5.000, `Embalagem plástica` fardo de 2.000), seis notas de compra do
`Fornecedor inicial`, duas receitas (`Base de creme` com rendimento 20.000 ml e perda de
2%; `Picolé de morango` com 40.000 ml e perda de 5%) e um produto (`Picolé de morango`,
75 ml por unidade, R$ 0,05 de embalagem por unidade) — `src/data/seed.ts:142-200`. Cada
número entra "the way a real one would - through `recordPurchase`, the same event that
moves the moving average" (`src/data/seed.ts:28-31`).

**Um caso em que a promessa foi violada e consertado.** A auditoria achou que o ícone da
aba "Produção" era um picolé, "num aplicativo cuja primeira linha diz 'nada de regra
chumbada de sorvete'. Ele estava nos dois lugares mais visíveis que existem: a aba de
baixo e o crachá do primeiro cartão da capa. Virou a unidade saindo pela esteira — a
única coisa que picolé, queijo, tinta e cosmético têm em comum. Levou três desenhos,
cada um reprovado por uma FOTO da barra de abas: ícone não se julga sozinho, se julga na
fileira em que vai viver." (`docs/auditoria.md:86-91`)

### 1.11 Modelo de negócio pretendido

**Publicar nas duas lojas.** É a razão declarada da configurabilidade
(`README.md:9-11`) e a etapa **F6** do plano (`docs/roadmap.md:79, 309-329`). O que
falta ali não é código de produto, e cada item é decisão de dono:

| pendência de publicação | o que trava | fonte |
|---|---|---|
| Licença do clima | Open-Meteo é gratuito para uso **não comercial**; publicar exige trocar de provedor ou pagar plano — "Decisão de gasto, é do dono" | `docs/roadmap.md:313-316` |
| Política de privacidade e declaração de dados | o que o app coleta e para onde manda (Supabase, Open-Meteo, atualizações da Expo) — exigência das duas lojas | `docs/roadmap.md:317-318` |
| LGPD | dado pessoal identificável: o que é, onde mora, como se apaga a pedido | `docs/roadmap.md:319-320` |
| Permissões do Android | "Pedir só o que se usa. Permissão a mais é recusa na revisão." | `docs/roadmap.md:321-322` |
| Relato de falha | "Hoje o app tem tela de erro e nenhum relato. Sem isso, uma falha na fábrica de um cliente é invisível daqui." | `docs/roadmap.md:322-323` |
| Ícone, splash e nome | feito em 4 de setembro pelas seis superfícies do `markPath` | `docs/roadmap.md:324-325` |
| Busca de marca no INPI (classes 9 e 42) | exige login gov.br, não é automatizável; a base da WIPO tem CAPTCHA | `docs/roadmap.md:326-329`; `README.md:164-167`; `src/config/brand.ts:3-8` |

O README pt-BR e o `src/config/brand.ts` **divergem sobre o resultado da busca de
marca**: o README diz "A busca prévia foi feita e voltou verde para o Brasil; o depósito
continua sendo ato do titular" (`README.md:165-166`, e igual em
`docs/README.en.md:164-166` e `docs/README.es.md:167-169`), enquanto
`docs/roadmap.md:326-327` diz "`NORVA` ainda **não** passou por busca de anterioridade
no INPI (classes 9 e 42)". O roadmap é o documento mais recente dos dois.

**Multi-empresa.** É fundação, não recurso: "`company_id` em toda tabela, RLS no
servidor" (`CLAUDE.md:38-39`); "Every row carries company_id from the very first
migration. Adding tenancy after real customers are inside is what kills products."
(`supabase/migrations/0001_foundation.sql:6-7`). O isolamento é por RLS com duas funções
de apoio: `current_companies()` devolve as empresas do `auth.uid()` corrente, e
`has_capability(target_company, needed)` responde se aquela pessoa tem aquela capacidade
naquela empresa (`supabase/migrations/0001_foundation.sql:80-103`).

**No aparelho, porém, existe uma empresa só, e ela é constante:**
`export const LOCAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001'`, com o motivo
escrito: "One local company until sign-in lands; every row is already stamped with it,
so multi-company stops being a migration later and becomes a login."
(`src/data/seed.ts:6-12`). Não há cliente Supabase, não há autenticação e não há
transporte de sincronização em produção: o `Transport` é injetado
(`src/sync/engine.ts:35-37`) e "The engine knows nothing about Supabase, or HTTP, or
authentication" (`src/sync/engine.ts:6-7`). A auditoria confirma: "`serialize` não tem
chamador de produção, porque o transporte é injetado e nenhum existe ainda"
(`docs/auditoria.md:154-156`). As tabelas `companies` e `memberships` **não existem no
banco do aparelho** (as 21 tabelas de `src/data/db.ts` não as incluem).

**Monetização: NÃO ESTÁ NO CÓDIGO.** Não há assinatura, plano, período de teste,
cobrança, limite por porte ou qualquer artefato de faturamento em nenhum arquivo
(`src`, `app`, `supabase`, `docs`, `CLAUDE.md`, `README.md`). A única menção a dinheiro
saindo é a licença comercial do provedor de clima (`docs/roadmap.md:313-316`). A licença
do produto é proprietária: "Proprietário. Todos os direitos reservados."
(`README.md:176`), "Proprietary. All rights reserved." (`docs/README.en.md:175`),
"Propietario. Todos los derechos reservados." (`docs/README.es.md:179`).

### 1.12 Como uma empresa se organiza: as escolhas que são dado, não código

O produto não escolhe entre dois jeitos de trabalhar quando a resposta certa é "depende
de quem usa" — ele guarda a escolha. As colunas de configuração de empresa que existem
hoje, com valor padrão e o motivo do padrão:

| coluna | tipo / padrão | o que decide | fonte |
|---|---|---|---|
| `companies.language` | `text`, `'pt-BR'` | idioma de todas as telas, para todo mundo | `0001_foundation.sql:26` |
| `companies.currency` | `text`, `'BRL'` | moeda **e** formato do número | `0001_foundation.sql:27` |
| `companies.time_zone` | `text`, `'America/Sao_Paulo'` | a que dia um lançamento pertence | `0001_foundation.sql:28` |
| `companies.modules` | `jsonb`, `'{}'` | quais módulos ficam visíveis | `0001_foundation.sql:31` |
| `companies.join_code` | `text unique`, nulo | o código por onde alguém pede associação | `0011_joining_a_company.sql:55` |
| `companies.floor_sign_in` | enum `floor_sign_in` (`'personal'` \| `'shared'`), padrão `'personal'` | como se entra no aparelho do chão de fábrica | `0011_joining_a_company.sql:65-68` |
| `companies.names_who_recorded` | `boolean`, `false` | se o relatório nomeia quem registrou | `0012_who_or_where.sql:20-25` |
| `companies.orders_need_approval` | `boolean`, `false` | se todo pedido nasce pendente | `0019_an_order_is_demand.sql:39-44` |

Os motivos dos padrões, transcritos:

- `floor_sign_in`: "uma fábrica dá um celular por pessoa, outra tem um aparelho pendurado
  na câmara fria que passa de mão em mão. Os dois caminhos existem no produto e a empresa
  escolhe. O padrão é `personal` porque é o que não exige preparo nenhum: o dono instala,
  entra, e está funcionando." (`supabase/migrations/0011_joining_a_company.sql:59-64`)
- `names_who_recorded`: "Se os relatórios operacionais mostram quem registrou. O ledger
  sempre grava; isto decide se a tela conta. Padrão falso: localizar a perda, não
  acusar." (`supabase/migrations/0012_who_or_where.sql:23-25`)
- `orders_need_approval`: "Se todo pedido nasce pendente à espera de quem tem
  `approve_order`. Desligado por padrão: a fábrica pequena entrega antes de a aprovação
  chegar." (`supabase/migrations/0019_an_order_is_demand.sql:42-44`)

Do lado do aparelho, o que é escolha **do aparelho** e não da empresa está separado por
decisão, e a tela diz isso na primeira linha de cada cartão de Ajustes:

| escolha | escopo | texto de tela |
|---|---|---|
| Idioma e moeda | **empresa** | "Escolha da empresa: vale para todo mundo que usa este sistema, não só para este aparelho. O fuso vem do celular, que está na fábrica." (`pt-BR.ts:415`, chave `settings.language.hint`) |
| A cara do aplicativo (identidade + luz + paleta) | **aparelho** | "Duas identidades e três luzes. É escolha deste aparelho — não muda nada para mais ninguém." (`pt-BR.ts:421`, chave `settings.appearance.hint`) |
| O que aparece na tela inicial | ordem da casa, esconder é local | "A ordem é da casa: todo mundo vê a mesma capa. Esconder é só neste aparelho." (`pt-BR.ts:443`) |
| Avisos no celular | **aparelho** | "Cada aviso liga e desliga aqui… O aplicativo avisa na data em que ainda dá para decidir, não na do problema." (`pt-BR.ts:477`) |
| Pedido precisa de aprovação | **empresa** | "Ligado, todo pedido novo aparece como 'espera aprovação' até alguém aprovar." (`pt-BR.ts:501`) |

As duas identidades visuais são `papel` ("serifa, traço fino, cantos retos") e `organico`
("paisagem, curva, cantos macios") — `export type Skin = 'papel' | 'organico'`
(`src/theme/tokens.ts:206`; textos em `pt-BR.ts:427-430`). As cinco paletas de paisagem
são `verde`, `azul`, `ambar`, `terracota`, `lavanda`
(`export type Hue` em `src/theme/tokens.ts:376`; nomes em `pt-BR.ts:434-438`). As três
luzes são claro, escuro e seguir o aparelho, com **o claro como padrão** — decisão do
dono de 4 de setembro (`pt-BR.ts:422-426`; `docs/roadmap.md:369-370`).

### 1.13 As decisões do dono que definem o produto

Registradas porque "decisão esquecida vira pergunta repetida" (`CLAUDE.md:314`).
Transcritas de `CLAUDE.md:316-347` e `docs/roadmap.md:353-370`:

1. **Entrada no chão de fábrica é configuração da empresa, não escolha nossa.**
   "Compartilhado usa PIN numa grade de nomes — dois segundos, de luva, offline. Pessoal
   entra uma vez e fica. Os dois existem; a empresa escolhe." (`CLAUDE.md:318-320`)
   *A grade de PIN e a tela de entrada: **NÃO IMPLEMENTADAS** — só a coluna
   `floor_sign_in` existe.*
2. **Quem cria a empresa é o dono**, cadastrando-se sozinho; daí ele cadastra as outras
   pessoas diretamente **ou** aprova quem pediu associação por um código da empresa. Os
   dois caminhos. (`CLAUDE.md:321-323`) *Coluna `join_code` existe; tela **NÃO
   IMPLEMENTADA**.*
3. **O relatório fala de onde, não de quem — e o aparelho tem responsável.** "O
   livro-razão sempre grava quem (`recorded_by` é obrigatório desde a primeira
   migração); o que a tela conta é outra coisa, e o padrão é não nomear. A
   responsabilidade vem do aparelho ser cadastrado com um responsável: o movimento aponta
   para o aparelho, o aparelho aponta para uma pessoa." (`CLAUDE.md:325-331`)
4. **O login autentica o sistema, não a pessoa.** "A conta é da empresa. Ela distribui
   acesso criando outros e-mails ou mandando código de convite por perfil — não é o
   e-mail pessoal do operador que entra no app. **Quem estava operando é anotação do
   registro**, escolhida na hora, não identidade da sessão. São duas perguntas
   (`recorded_by` = qual conta escreveu, imposto pelo servidor e incedível; `operator_id`
   = quem estava com o aparelho), e uma coluna só respondendo as duas é erro — já custou
   uma rodada inteira." (`CLAUDE.md:331-338`) *`operator_id` é coluna sem tabela de gente
   atrás — `app/(tabs)/more.tsx:38`.*
5. **Aparelho emprestado entra como produção e nada mais** — papel `operator`, sem custo,
   sem preço, sem dinheiro. (`CLAUDE.md:339-341`)
6. **O operador confere a prateleira.** "Negar a permissão não deixa o número mais
   seguro — deixa a contagem sem acontecer, e saldo que ninguém conferiu há meses é pior
   que saldo corrigido hoje de manhã. O que protege é o piso, não a permissão: contagem
   é perguntada toda vez, e é gravada como diferença que o livro-razão guarda, nunca como
   valor que sobrescreve." (`CLAUDE.md:343-347`)
7. **A luz da tela é do aparelho, e o padrão é o claro** — três caminhos, todos existem.
   (`docs/roadmap.md:369-370`)
8. **Fase 1 dada como feita**, 1 de setembro, com a auditoria medindo "6 prontos, 9
   parciais e 1 ausente" na mão do dono. "Não se reabre." (`CLAUDE.md:380-387`)
9. **Alvo de um mês = F2 + F3**, 1 de setembro. (`CLAUDE.md:389-398`)

### 1.14 A lista completa de capacidades anunciadas, com o estado de cada uma

O produto se organiza em **oito áreas**, declaradas no tema como o mapa do app:
`sky → home`, `apricot → production`, `mint → inventory`, `lilac → distribution`,
`rose → storeMirror`, `sage → purchasing`, `sand → finance`, `mist → settings`
(`src/theme/tokens.ts:22-45`). Duas dessas áreas não têm tela: `finance` e a parte de
notas fiscais, por decisão escrita — "a tela desenhava três grupos, e o terceiro —
'Financeiro' e 'Notas fiscais' — não tem nada atrás. Não existe preço de venda neste
aplicativo, nem conta, e o fiscal é um projeto .NET à parte… Gaveta que abre no vazio é
pior que gaveta não desenhada. 'Pessoas' falta pelo mesmo motivo: `operator_id` é coluna
sem tabela de gente atrás." (`app/(tabs)/more.tsx:33-38`)

A navegação tem **cinco destinos fixos**, e a ordem é a do dia: "o que está acontecendo
agora, o que você fez, o que saiu, o que tudo somou, e as gavetas que se abrem uma vez
por mês" (`app/(tabs)/_layout.tsx:14-21`).

| aba | rótulo pt-BR | cor da área | fonte |
|---|---|---|---|
| `index` | Início | `sky` | `_layout.tsx:111-117`; `pt-BR.ts:164` |
| `production` | Produção | `apricot` | `_layout.tsx:118-124`; `pt-BR.ts:165` |
| `transport` | Transporte | `lilac` | `_layout.tsx:125-131`; `pt-BR.ts:166` |
| `reports` | Relatórios | `sand` | `_layout.tsx:132-138`; `pt-BR.ts:167` |
| `more` | Mais | `mist` | `_layout.tsx:139-145`; `pt-BR.ts:168` |

As 24 telas, com o título que cada uma mostra:

| rota | título na tela | estado |
|---|---|---|
| `app/(tabs)/index.tsx` | `NORVA` (nome da marca) | implementada e chamada |
| `app/(tabs)/production.tsx` | Produção | implementada e chamada |
| `app/(tabs)/transport.tsx` | Para onde foi | implementada e chamada |
| `app/(tabs)/reports.tsx` | Relatórios | implementada e chamada |
| `app/(tabs)/more.tsx` | Mais | implementada e chamada |
| `app/assistant.tsx` | Pergunte (sobrelinha "modo conversa") | implementada e chamada |
| `app/inputs/index.tsx` | Almoxarifado ("o que você compra") | implementada e chamada |
| `app/inputs/[id].tsx` | nome do insumo | implementada e chamada |
| `app/inputs/new.tsx` | Novo cadastro | implementada e chamada |
| `app/recipes/index.tsx` | Receitas ("o que entra em cada vez") | implementada e chamada |
| `app/recipes/[id].tsx` | nome da receita ("ficha técnica") | implementada e chamada |
| `app/products/index.tsx` | Produtos ("o que sai para vender") | implementada e chamada |
| `app/products/new.tsx` | Novo produto | implementada e chamada |
| `app/catalog.tsx` | Linhas, tipos e sabores ("a grade do que você fabrica") | implementada e chamada |
| `app/purchase.tsx` | Nova compra ("a nota move o custo") | implementada e chamada |
| `app/production/new.tsx` | Lançar produção | implementada e chamada |
| `app/lots/[id].tsx` | Etiqueta do lote ("para colar na caixa") | implementada e chamada |
| `app/places.tsx` | Estoque por lugar ("onde está o que você tem") | implementada e chamada |
| `app/transfer.tsx` | Transferir | implementada e chamada |
| `app/orders/index.tsx` | Pedidos ("o que os clientes pediram") | implementada e chamada |
| `app/orders/new.tsx` | Anotar pedido | implementada e chamada |
| `app/losses.tsx` | Perdas | implementada e chamada |
| `app/weather.tsx` | Clima | implementada e chamada |
| `app/settings.tsx` | Ajustes | implementada e chamada |

As capacidades anunciadas, com o estado marcado. Os três estados são **[TELA]**
(implementado e chamado por tela), **[SEM CHAMADOR]** (existe o código, nenhuma tela o
usa) e **[PLANEJADO]** (só escrito).

| capacidade anunciada | estado | evidência |
|---|---|---|
| Cadastro de insumos, embalagem e material de loja | **[TELA]** | `app/inputs/*`; abas `input`/`packaging`/`storeSupply` em `pt-BR.ts:510-514` |
| Ficha técnica (receita) com versões | **[TELA]** | `app/recipes/*`; tabelas `recipes`/`recipe_versions`/`recipe_lines` em `src/data/db.ts:65,75,87` |
| Custo real recalculando enquanto se digita | **[TELA]** | `README.md:15-16`; `app/purchase.tsx` |
| Nota de compra que move o custo médio | **[TELA]** | `app/purchase.tsx`; sobrelinha "a nota move o custo" (`pt-BR.ts:849`) |
| Grade de produto (linha × tipo × sabor) | **[TELA]** | `app/catalog.tsx`; `src/data/db.ts:406,414,423` |
| Produção com lote e validade | **[TELA]** | `app/production/new.tsx`, `app/lots/[id].tsx`; `src/data/db.ts:500` |
| Etiqueta do lote com QR impresso | **[TELA]** | `src/domain/qr.ts`, `src/components/QrCode.tsx`, `app/lots/[id].tsx` |
| Leitura do QR (quem escaneia) | **[PLANEJADO]** | fronteira registrada: seção `scan` do dicionário nos três idiomas, com motivo, em `src/dictionary.test.ts:46-47`; `docs/roadmap.md:245-248` |
| Câmara fria como lugar, com saldo | **[TELA]** | `location_kind` inclui `cold_room` (`0001_foundation.sql:109`); `app/places.tsx` |
| Leitura de temperatura da câmara | **[TELA]** | `recordReading` em `src/data/repository.ts:2769`, chamado por `app/places.tsx:26`; tabela `readings` em `src/data/db.ts:603` |
| Estoque por lugar e contagem de prateleira | **[TELA]** | `app/places.tsx`; capacidade `adjust_stock` |
| Perdas com motivo | **[TELA]** | `app/losses.tsx`; enum `loss_reason` = `melted`, `broken`, `expired`, `courtesy`, `internal_use` (`0001_foundation.sql:177`) |
| Transferência / saída para loja | **[TELA]** | `app/transfer.tsx` |
| Transferência entre salas nossas (câmara → almoxarifado) | **[PLANEJADO]** | "a tela de transferir não faz (ela sai sempre da fábrica…)" — `docs/roadmap.md:236-239` |
| Conferência da chegada na loja | **[TELA]** | `pt-BR.ts:741-745`; `app/(tabs)/transport.tsx` |
| Pedidos do cliente, com aprovação opcional | **[TELA]** | `app/orders/*`; `orders_need_approval` |
| Reserva de pedido (separar do saldo o que tem dono) | **[PLANEJADO]** | `docs/roadmap.md:254-256` |
| Lista de separação | **parcial: cálculo [TELA], tela dedicada [PLANEJADO]** | `pickingFor` em `src/data/repository.ts:3200` é chamado por `app/transfer.tsx:173`; a tela de quem anda com o carrinho falta (`docs/roadmap.md:258-259`) |
| Os quatro postos de controle (separado, carregado, entregue, conferido) | **[PLANEJADO]** | enum `control_post` em `0001_foundation.sql:179`; seção `posts` do dicionário registrada como fronteira em `src/dictionary.test.ts:42-43` |
| App do entregador | **[PLANEJADO]** | papel `driver` existe com `dispatch`, `check_receipt`, `record_loss`; falta a tela (`docs/roadmap.md:265-266`) |
| Devolução com motivo | **[PLANEJADO]** | `movement_kind` inclui `return`; a tela é item 7 da F3 (`docs/roadmap.md:267-268`) |
| Ficha de acordo por loja/cliente (preço, prazo, dia de entrega) | **forma [SEM CHAMADOR]**, tela **[PLANEJADO]** | migração `0021_what_was_agreed_with_the_store.sql` criou a forma; falta a tela (`docs/roadmap.md:250-252`) |
| Relatórios: estoque, perdas, custo | **[TELA]** | `app/(tabs)/reports.tsx`; rótulos em `pt-BR.ts:174-178` |
| Clima como informação de negócio | **[TELA]** | `app/weather.tsx`, `src/weather/index.ts`; Open-Meteo (`src/weather/index.ts:75-76`) |
| Avisos locais (insumo, pedido, volume, câmara, validade) | **[TELA]** | `src/notify/*`, `<Alerts />` em `app/_layout.tsx:119`; cinco tipos em `pt-BR.ts:479-483` |
| Assistente / Modo Conversa | **[TELA]** | `app/assistant.tsx`; **17** habilidades em `src/assistant/skills.ts` (`cost_of_product`, `price_of_input`, `what_moved`, `produced_today`, `what_was_lost`, `what_dominates`, `register_purchase`, `list_inputs`, `erase_help`, `stock_of_input`, `register_count`, `register_input`, `stock_at_place`, `where_is_item`, `register_production`, `register_transfer`, `what_to_buy`) |
| Aviso de novidades ao atualizar | **[TELA]** | `<WhatsNew />` em `app/_layout.tsx:114`; texto em `src/config/releases.ts:20-28` |
| Apagar dados por área ou tudo | **[TELA]** | `app/settings.tsx`; `src/data/erase.ts` |
| Plantar duas semanas de movimento (demonstração) | **[TELA]** | `src/data/simulate.ts`; texto em `pt-BR.ts:362-367` |
| Sincronização com o servidor | **[SEM CHAMADOR]** | `src/sync/engine.ts` com `Transport` injetado e nenhum transporte de produção (`docs/auditoria.md:154-156`) |
| Login / multi-empresa de verdade | **NÃO IMPLEMENTADO** | `LOCAL_COMPANY_ID` em `src/data/seed.ts:12` |
| Assistente de início (setup guiado) | **NÃO IMPLEMENTADO** | `src/data/seed.ts:27` |
| Interruptores de módulo | **[SEM CHAMADOR]** | coluna `companies.modules` sem leitor em `src`/`app` |
| Preço de venda | **NÃO IMPLEMENTADO** | capacidade `view_sale_price` existe; "Não existe preço de venda neste aplicativo" (`app/(tabs)/more.tsx:36`) |
| Financeiro | **NÃO IMPLEMENTADO** | capacidade `view_finance` e área `sand → finance` existem; nenhuma tela |
| Nota fiscal eletrônica | **fora de escopo** | capacidade `issue_invoice` existe; ver 1.15 |
| `UnitStepper` (contador de caixas com luva) | **implementado e chamado** | a tela de separação chegou (`app/picking.tsx:358`), e em 11 de setembro a produção e a compra passaram a usá-lo também. Era "[SEM CHAMADOR]" com fronteira registrada, e a fronteira foi paga |

O vocabulário completo de capacidades tem **12 valores**, idênticos no cliente e no
servidor: `view_cost`, `view_sale_price`, `record_production`, `dispatch`,
`check_receipt`, `record_loss`, `place_order`, `approve_order`, `adjust_stock`,
`view_finance`, `issue_invoice`, `manage_company`
(`src/domain/access.ts:26-39` e `supabase/migrations/0001_foundation.sql:42-55`; o
`src/sync/agreement.test.ts` reprova se os dois divergirem).

*Correção a um número que o próprio repositório publica:* `docs/roadmap.md:38` diz
"capacidades | **18** | `src/domain/access.ts`". São 12. O 18 vem da forma como
`src/bar.test.ts:127` deriva o número — `new Set([...ACESSO.matchAll(/'([a-z_]+)'/g)])`
conta **toda** string minúscula com sublinhado no arquivo, o que inclui seis dos sete
nomes de papel (`'owner'`, `'operator'`, `'driver'`, `'buyer'`, `'customer'`,
`'salesperson'`; `'storeManager'` escapa por ter maiúscula). 12 + 6 = 18, e a guarda
passa porque compara o número errado com ele mesmo.

Cinco atos nunca acontecem sem alguém dizer sim, em nenhum nível de autonomia do
assistente: `adjustStock`, `changePrice`, `reverseMovement`, `recordFinance`,
`issueInvoice` (`src/domain/access.ts:135-141`). Três deles são atos de recursos que o
app ainda não tem, e estão escritos assim de propósito: "the floor is a promise made
before the features exist: whoever builds them inherits the rule rather than deciding it
again" (`src/domain/access.ts:128-131`).

### 1.15 O que está deliberadamente fora de escopo, e por quê

O corte de um mês, decidido pelo dono em 1 de setembro. Transcrição literal da tabela de
`docs/roadmap.md:346-351`:

| fora | razão escrita |
|---|---|
| **Relatório do Espelho da Loja** | a captura entra; o relatório **mente com duas semanas de dado** |
| **Microserviço fiscal** | projeto à parte — certificado A1, homologação SEFAZ; nada depende dele |
| **Compras inteligentes** | precisam do **prazo observado**, que só existe depois de meses de nota |
| **Trunfos** (PAC/POD, clima, roteirização) | diferencial de mercado, não a dor de hoje |

A versão do `CLAUDE.md:400-405`, com as mesmas quatro razões: "Fica fora, e cada corte
tem razão escrita: **o relatório** do Espelho (a captura entra — contagem cega e perdas
com motivo; o relatório mente com duas semanas de dado), **o fiscal** (projeto à parte, e
o plano já diz que nada depende dele), **as compras inteligentes** (precisam do prazo
observado, que só existe depois) e **os trunfos** (PAC/POD, clima, roteirização —
diferencial de mercado, não a dor de hoje)."

Detalhamento de cada corte:

**Espelho da Loja — a captura entra, o relatório espera.** "Contagem cega e perdas com
motivo já existem e já gravam. O relatório fica fora por decisão escrita: ele **mente
com duas semanas de dado**. Entra quando houver estação inteira."
(`docs/roadmap.md:286-288`)

**Fiscal (NFe).** "Projeto à parte, e o plano inteiro é desenhado para que **nada
dependa dele**. Microserviço .NET, certificado digital A1, homologação na SEFAZ. O que
trava é administrativo: o layout quem decide é a SEFAZ, e a homologação tem fila.
Começa quando o dono decidir começar. Não bloqueia F3, F4 nem F6."
(`docs/roadmap.md:301-305`)

**Compras inteligentes.** "Precisam do **prazo observado** de cada fornecedor — o tempo
real entre pedir e chegar, que só existe depois de meses de nota. Sem ele, é adivinhação
com cara de matemática." (`docs/roadmap.md:290-293`)

**Trunfos (PAC/POD, clima aplicado, roteirização).** "Diferencial de mercado, não a dor
de hoje. Roteirização de entrega, PAC/POD, clima aplicado à produção. Entram depois da F4
porque todos precisam do dado que ela acumula." (`docs/roadmap.md:335-337`) A restrição
sobre o clima está escrita no próprio módulo: "este arquivo só devolve FATO medido. Ele
não diz 'produza mais amanhã' e não estima demanda a partir de temperatura, porque a
relação entre calor e venda desta fábrica não está no livro-razão ainda"
(`src/weather/index.ts:5-11`).

O arco completo de sete etapas, com o que cada uma destrava
(`docs/roadmap.md:72-80`):

| | etapa | o que a fábrica ganha | o que precisa antes |
|---|---|---|---|
| **F1** | fundação — livro-razão, custo, estoque | o número de estoque para de ser chute | — |
| **F2** | produção, lote, validade, câmara | a corrida do tacho vira registro | F1 |
| **F3** | o papel sai do chão de fábrica | romaneio, conferência e etiqueta no celular | F2 |
| **F4** | a fábrica se explica sozinha | o Espelho da Loja e a compra na hora certa | **meses de movimento real** |
| **F5** | o fiscal | nota fiscal eletrônica | certificado A1 e homologação SEFAZ |
| **F6** | publicar nas lojas | qualquer fábrica instala | F3 + privacidade + licenças |
| **F7** | os trunfos | roteirização, clima aplicado, PAC/POD | F4 |

"**O que domina o calendário não é código.** A F4 precisa de meses de movimento real —
nenhuma quantidade de trabalho encurta isso. A F5 é um microserviço .NET com certificado
e homologação, que é ato administrativo." (`docs/roadmap.md:87-90`)

O portão que decide o que entra é **por item, não por fase** — três perguntas, e a
primeira que reprovar decide (`CLAUDE.md:412-431`; `docs/roadmap.md:376-397`):

- **P1 — quem chama isto no mesmo commit?** Sem chamador, não entra. "É a doença provada
  deste repositório: coluna, função, chave de dicionário e tabela que existiram sem
  escritor." As três respostas honestas quando nada chama uma peça: trazer o chamador,
  apagar a peça, ou registrar a fronteira com quem vai chamá-la. "Escrever teste não é
  uma delas."
- **P2 — complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item depende de
  observar alguém usando. Mas se o que muda é *preferência de quem usa*, não é espera nem
  pergunta — é configuração, e os dois caminhos existem.
- **P3 — entrando errado, conserta com um commit ou com migração e estorno?** O que toca
  `supabase/migrations/`, o caminho de escrita de `movements` ou a semântica de
  `movement_kind`/`location_kind` é caro e permanente.

Uma decisão de produto ainda **aberta e reservada ao dono**, porque é P3: se o tacho
consome só da sala em que roda ("sala estrita", como é hoje) ou de qualquer sala nossa,
com o sistema decidindo de qual debitar. "Pela regra da casa isto não é pergunta de qual,
é pergunta de qual é o padrão — os dois caminhos existem como configuração da empresa. O
que trava é o portão P3: a segunda opção muda **onde o consumo é gravado**."
(`docs/roadmap.md:219-239`)

### 1.16 Divergências entre os três READMEs

Comparação integral. Os três têm a mesma espinha; as diferenças são de volume, não de
promessa — com uma exceção, marcada.

| aspecto | pt-BR (`README.md`, 237 linhas) | en (`docs/README.en.md`, 175 linhas) | es (`docs/README.es.md`, 179 linhas) |
|---|---|---|---|
| Seções | 11 | 8 | 8 |
| Seção "Idiomas" | **existe** (`README.md:180-196`), incluindo a fronteira do assistente monolíngue | **ausente** | **ausente** |
| Seção "Rodando na web" + subseção "Testes" | **existe** (`README.md:200-236`), com `metro.config.js`, os dois cabeçalhos COOP/COEP, e o motivo do `e2e` (três bugs que só apareceram com o app aberto) | **ausente** | **ausente** |
| Comandos de verificação listados | 3 na seção "Rodando" (`typecheck`, `test`, `db:verify`) + 5 em "Testes" (`typecheck`, `lint`, `test`, `e2e`, `db:verify`, `proofgate`) | **só os 3** (`docs/README.en.md:134-138`) | **só os 3** (`docs/README.es.md:137-141`) |
| Nome da coluna que não existe (F1) | `estoque_atual` (`README.md:45`) | `current_stock` (`docs/README.en.md:45`) | `stock_actual` (`docs/README.es.md:45`) |
| Título da seção de mercado | "O vazio que este produto ocupa" | "The gap this fills" | "El vacío que ocupa" |
| Bloco de estado | Fase 1 (velho) | Phase 1 (velho) | Fase 1 (velho) |
| Licença | "Proprietário. Todos os direitos reservados." | "Proprietary. All rights reserved." | "Propietario. Todos los derechos reservados." |
| Nove fundações | idênticas em conteúdo e ordem | idem | idem |
| Seção do assistente (três regras) | idêntica | idêntica (com hífens em vez de travessões) | idêntica |
| Seção de design | idêntica | idêntica | idêntica |
| Estrutura de pastas | idêntica, e as três citam `UnitStepper` entre os componentes | idem | idem |
| "O que falta e depende de decisão humana" | 4 itens: marca no INPI, projeto Supabase, conta Expo/EAS, domínio | idem | idem |

**Nenhum dos três READMEs menciona:** `npm run mutate`, `npm run e2e:fast`,
`npm run shot`, `npm run folha`, a barra de verificação completa do `CLAUDE.md:222-231`,
as 32 migrações de servidor, os sete papéis, as oito moedas, as duas identidades visuais,
o assistente com 17 habilidades, o clima, os avisos no celular, nem que o instalador é
compilado no GitHub e distribuído por release. **O README é a apresentação da Fase 1 e
não acompanhou a Fase 2.**

**Nenhum dos três READMEs contém o nome de uma empresa real**, cumprindo o "nada de nome
de empresa" do `CLAUDE.md:4-5`. Uma varredura por marca de fábrica nos três arquivos não
retorna nada além de `NORVA`.

### 1.17 Os números do produto, medidos no último commit (`77b4f30`)

Todos derivados por comando, não de memória — e `src/bar.test.ts` executa essa coluna
e reprova quando um documento envelhece (`src/bar.test.ts:121-175`).

| | valor | como conferir |
|---|---|---|
| Telas (rotas do Expo Router) | **24** | `find app -name '*.tsx' \| grep -v _layout \| wc -l` |
| Tabelas no aparelho (SQLite) | **21** | `grep -c 'CREATE TABLE IF NOT EXISTS' src/data/db.ts` |
| Migrações do aparelho | **V17** | último `const V` em `src/data/db.ts` |
| Migrações do servidor (Postgres) | **32** | `ls supabase/migrations \| wc -l` |
| Papéis | **7** | `src/domain/access.ts:51-58` |
| Capacidades | **12** | `src/domain/access.ts:26-39` |
| Idiomas | **3** | `ls src/i18n/locales/` |
| Moedas | **8** | `src/i18n/company.ts:19-28` |
| Testes | **338** | `grep -rc '^test(' src --include=*.test.ts` somado |
| Habilidades do assistente | **17** | `grep -c "^  id: '" src/assistant/skills.ts` |
| Versão do app | **0.10.0** | `app.json:6` |
| `versionCode` correspondente | **100000** | `.github/workflows/build-apk.yml:191-195` |
| Nível de evidência | **E3** — exercitado contra Postgres e navegador de verdade; **nada visto numa fábrica** | `docs/roadmap.md:51-54`; `docs/auditoria.md:252-254` |

O veredito de prontidão, escrito para o dono: "**Uma fábrica pode começar a usar isto
amanhã, com uma condição: uma fábrica só, e com o estoque num lugar só.**"
(`docs/auditoria.md:9-10`)

### 1.18 O que não está no código

Itens levantados por este capítulo e que não têm resposta no repositório:

- **Preço do produto, plano, assinatura ou qualquer forma de cobrança.** NÃO ESTÁ NO
  CÓDIGO.
- **Domínio na internet.** Listado como pendência de uma linha, sem valor
  (`README.md:170`).
- **Resultado definitivo da busca de marca.** Os documentos se contradizem (ver 1.11); o
  depósito no INPI não foi feito.
- **Projeto Supabase aplicado.** "As migrações estão prontas; aplicá-las exige uma conta"
  (`README.md:168`); o comentário da estrutura diz "esquema versionado (não aplicado a
  nenhum projeto)" (`README.md:154`).
- **Número de usuários, clientes-piloto ou nome da fábrica de origem.** NÃO ESTÁ NO
  CÓDIGO — e a ausência é deliberada (`CLAUDE.md:4-5`).
- **Qual mercado é o primeiro alvo comercial** entre os cinco pesquisados. Os três
  READMEs descrevem a lacuna nos cinco e não elegem um; o padrão de idioma, moeda e fuso
  é brasileiro (`src/i18n/index.ts:25-30`), e o único instalador publicado é Android.
- **Política de privacidade, declaração de dados e mapeamento LGPD.** Listados como
  pendência de F6 (`docs/roadmap.md:317-320`); nenhum arquivo existe.
- **Relato de falha em produção.** "Hoje o app tem tela de erro e nenhum relato"
  (`docs/roadmap.md:322-323`).
- **Configuração de splash screen.** Sem chave `splash` em `app.json`; o achado médio
  "a tela de abertura ainda ser o andaime da Expo" segue aberto
  (`docs/auditoria.md:225-226`).
