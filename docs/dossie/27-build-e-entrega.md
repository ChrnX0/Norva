## 27. Stack, build, CI e publicação

### 27.1 Identidade do pacote e ponto de entrada

| Campo | Valor | Fonte |
|---|---|---|
| `name` | `norva` | `package.json:2` |
| `version` | `0.1.0` | `package.json:3` |
| `main` | `expo-router/entry` | `package.json:4` |
| `private` | `true` | `package.json:5` |
| `lockfileVersion` | `3` | `package-lock.json` |

**A versão do `package.json` não é a versão do produto.** Ela está parada em
`0.1.0` (`package.json:3`) enquanto a versão que sai no instalador e na tela é
`0.10.0`, declarada em `app.json:6`. Quem lê a versão em tempo de execução lê o
manifesto do Expo, não o `package.json`: `app/settings.tsx:414` monta o cabeçalho
com `` `${brand.name} · ${Constants.expoConfig?.version ?? '—'}` `` — ou seja,
`expo-constants` lendo `app.json`.

**Não existe arquivo de entrada próprio.** `main` aponta para
`expo-router/entry` (`package.json:4`), o que faz o roteamento por sistema de
arquivos da pasta `app/` ser o ponto de partida. Não há `index.js` nem
`App.tsx` na raiz.

---

### 27.2 Versões exatas da stack

#### 27.2.1 O núcleo

| Peça | Faixa declarada | Versão resolvida no lockfile |
|---|---|---|
| Expo SDK | `~57.0.18` (`package.json:24`) | `57.0.18` |
| React Native | `0.86.3` (`package.json:37`) | `0.86.3` |
| React | `19.2.3` (`package.json:35`) | `19.2.3` |
| React DOM | `19.2.3` (`package.json:36`) | `19.2.3` |
| TypeScript | `~6.0.3` (`package.json:55`) | `6.0.3` |
| Node no CI | `22` | `.github/workflows/ci.yml:23`, `:62`, `:111`; `.github/workflows/build-apk.yml:60` |
| Java no build Android | Temurin 17 | `.github/workflows/build-apk.yml:63-66` |

#### 27.2.2 Dependências de produção — versão, papel e chamador

Coluna "chamador" tem três estados, medidos por `grep` de import sobre `app/`,
`src/`, `e2e/` e `scripts/`:

| Pacote | Declarado | Resolvido | Para que serve | Chamador |
|---|---|---|---|---|
| `@expo/metro-runtime` | `~57.0.14` (`package.json:22`) | `57.0.14` | Runtime do Metro para o alvo web (fast refresh, `import.meta` do bundle web) | **Sem import direto** no código do projeto; entra pela cadeia do `expo-router`/Expo web |
| `@react-native-async-storage/async-storage` | `2.2.0` (`package.json:23`) | `2.2.0` | Preferência local por aparelho | **Chamado por tela**: `src/components/WhatsNew.tsx:1` (chave `norva:release-seen`, `WhatsNew.tsx:10`) |
| `expo` | `~57.0.18` (`package.json:24`) | `57.0.18` | O SDK; traz CLI (`@expo/cli`), `expo/metro-config`, `expo/tsconfig.base` | Usado por configuração (`metro.config.js:2`, `tsconfig.json:2`), não por import de tela |
| `expo-constants` | `~57.0.16` (`package.json:25`) | **`57.0.17`** | Ler o manifesto embutido (versão do app) | **Chamado por tela**: `app/settings.tsx:1` e `:414` |
| `expo-haptics` | `~57.0.2` (`package.json:26`) | `57.0.2` | Vibração de resposta ao toque | **Chamado**: 2 ocorrências de import em `src/`/`app/` |
| `expo-linking` | `~57.0.8` (`package.json:27`) | `57.0.8` | Deep links (`norva://`) | **Sem import direto**; o esquema é declarado em `app.json:5` e no manifesto gerado (`android/app/src/main/AndroidManifest.xml:30`) |
| `expo-localization` | `~57.0.1` (`package.json:28`) | `57.0.1` | Idioma e região do aparelho | **Chamado**: 1 import |
| `expo-notifications` | `~57.0.16` (`package.json:29`) | `57.0.16` | Agendar o aviso no sistema operacional | **Chamado por import dinâmico**: `src/notify/index.ts:57` (`await import('expo-notifications')`), com o tipo em `src/notify/index.ts:45` |
| `expo-router` | `~57.0.17` (`package.json:30`) | `57.0.17` | Rotas por sistema de arquivos | **Chamado por tela**: 26 imports |
| `expo-sqlite` | `~57.0.2` (`package.json:31`) | `57.0.2` | Banco local; no navegador roda por WebAssembly | **Chamado por import dinâmico**: `src/data/db.ts:721` (`await import('expo-sqlite')`), justificado em `src/data/db.ts:705` |
| `expo-status-bar` | `~57.0.1` (`package.json:32`) | `57.0.1` | Barra de status | **Chamado**: 1 import |
| `expo-updates` | `~57.0.19` (`package.json:33`) | `57.0.19` | Atualização OTA | **Sem import no código**: a biblioteca é ligada pela configuração `updates` (`app.json:44-47`) e pelas `meta-data` do manifesto (`AndroidManifest.xml:15-20`) |
| `qrcode` | `^1.5.4` (`package.json:34`) | `1.5.4` | Gerar o QR do lote | **Chamado**: 1 import |
| `react` | `19.2.3` (`package.json:35`) | `19.2.3` | — | 40 imports |
| `react-dom` | `19.2.3` (`package.json:36`) | `19.2.3` | Alvo web | **Sem import direto**; usado pelo `react-native-web` |
| `react-native` | `0.86.3` (`package.json:37`) | `0.86.3` | — | 51 imports |
| `react-native-gesture-handler` | `~2.32.0` (`package.json:38`) | `2.32.0` | Gestos | **Chamado**: 1 import |
| `react-native-reanimated` | `4.5.1` (`package.json:39`) | `4.5.1` | Animação por mola; exige o plugin de Babel | **Chamado**: 15 imports |
| `react-native-safe-area-context` | `~5.7.0` (`package.json:40`) | `5.7.0` | Margens seguras | **Chamado**: 6 imports (ex.: `src/components/WhatsNew.tsx:4`) |
| `react-native-screens` | `~4.26.0` (`package.json:41`) | **`4.26.2`** | Telas nativas para a navegação | **Sem import direto**; dependência do `expo-router` |
| `react-native-svg` | `^15.15.4` (`package.json:42`) | `15.15.4` | Desenhar a marca e os gráficos | **Chamado**: 8 imports (ex.: `src/components/Mark.tsx:24`, `<Path d={brand.markPath} />`) |
| `react-native-web` | `^0.21.2` (`package.json:43`) | `0.21.2` | Alvo navegador | **Sem import direto**; resolvido pelo Metro no alvo web |

Duas divergências entre faixa declarada e árvore instalada, ambas dentro do
`~`: `expo-constants` está em `57.0.17` com `~57.0.16` declarado, e
`react-native-screens` em `4.26.2` com `~4.26.0` declarado.

#### 27.2.3 Dependências de desenvolvimento

| Pacote | Declarado | Resolvido | Para que serve |
|---|---|---|---|
| `@types/node` | `^26.4.0` (`package.json:46`) | `26.4.0` | Tipos de Node; ligado por `tsconfig.json:10-12` (`"types": ["node"]`) |
| `@types/qrcode` | `^1.5.6` (`package.json:47`) | `1.5.6` | Tipos do `qrcode` |
| `@types/react` | `~19.2.2` (`package.json:48`) | `19.2.18` | Tipos de React |
| `babel-preset-expo` | `^57.0.9` (`package.json:49`) | `57.0.9` | Preset de Babel (`babel.config.js:8`) |
| `eslint` | `^9.0.0` (`package.json:50`) | `9.39.5` | Lint |
| `eslint-config-expo` | `~57.0.2` (`package.json:51`) | `57.0.2` | Regras do Expo (`eslint.config.js:3`) |
| `playwright` | `^1.56.0` (`package.json:52`) | `1.62.1` | Instalar o Chromium no CI (`ci.yml:87`) |
| `playwright-core` | `^1.56.0` (`package.json:53`) | `1.62.1` | Dirigir o navegador; é o que os scripts importam (`e2e/flow.mjs:6`, `scripts/shot.mjs:23`, `scripts/folha.mjs`) |
| `tsx` | `^4.23.13` (`package.json:54`) | `4.23.13` | Rodar TypeScript direto, inclusive a suíte (`package.json:13`) |
| `typescript` | `~6.0.3` (`package.json:55`) | `6.0.3` | — |

**Não há framework de teste externo.** A suíte usa o executor nativo do Node
(`node:test`) através do `tsx` (`package.json:13`). Não existe Jest, Vitest nem
`jest.config.js` no repositório.

**`expo-splash-screen` NÃO é dependência declarada.** Não aparece em
`dependencies` nem em `devDependencies` (`package.json:21-56`) e não está
instalado no lockfile.

---

### 27.3 Os scripts do `package.json`, um a um

| Script | Comando | O que faz |
|---|---|---|
| `start` | `expo start` (`package.json:7`) | Servidor de desenvolvimento |
| `android` | `expo start --android` (`package.json:8`) | Idem, abrindo no Android |
| `ios` | `expo start --ios` (`package.json:9`) | Idem, abrindo no iOS |
| `web` | `expo start --web` (`package.json:10`) | Idem, no navegador |
| `typecheck` | `tsc --noEmit` (`package.json:11`) | Só tipos; nada é emitido (`noEmit` também vem do preset em `expo/tsconfig.base.json`) |
| `lint` | `expo lint` (`package.json:12`) | ESLint pela CLI do Expo, lendo `eslint.config.js` |
| `test` | `tsx --test 'src/**/*.test.ts'` (`package.json:13`) | Executor nativo do Node sobre **42** arquivos `*.test.ts` dentro de `src/` |
| `db:verify` | `bash scripts/verify-migrations.sh` (`package.json:14`) | Sobe um Postgres descartável e roda **13** verificações |
| `e2e` | `node e2e/flow.mjs` (`package.json:15`) | Exporta a web e dirige **36** checagens no Chromium, em série |
| `mutate` | `node scripts/mutate.mjs` (`package.json:16`) | Aplica **106** defeitos catalogados, um por vez, e falha em qualquer um que a suíte não note |
| `e2e:fast` | `node scripts/e2e-parallel.mjs` (`package.json:17`) | Um export só, checagens fatiadas em até 4 processos |
| `shot` | `node scripts/shot.mjs` (`package.json:18`) | Tira foto de tela em `.shots/` |
| `folha` | `node scripts/folha.mjs` (`package.json:19`) | Junta as fotos numa folha de contato |
| `dossie` | `node scripts/dossie.mjs` (`package.json:20`) | Monta `docs/DOSSIE.md` a partir de `docs/dossie/*.md`: capa `00-` primeiro, sumário com âncora no formato do GitHub, seções `01-` a `35-`, apêndices de `90-` para cima. Recusa seção sem título de nível 2 e seção com número ímpar de cercas ``` — *"cerca desbalanceada engole o resto do documento inteiro, e já engoliu"*. O arquivo montado passa de 3 MB e **não** entra no git (`.gitignore:55-56`), porque o GitHub não renderiza markdown desse tamanho |

#### 27.3.1 `npm test` — cobertura e borda

O glob é `'src/**/*.test.ts'` (`package.json:13`). Consequências textuais:

- **Nada em `app/` é testado por `npm test`.** Não existe `*.test.tsx` em lugar
  nenhum do repositório (busca por `*.test.tsx` fora de `node_modules` retorna
  zero). O que exercita as telas é o `e2e`.
- Os 42 arquivos ficam espalhados por `src/`: `src/domain/` (money, ledger,
  cost, recipe, units, measure, lot, qr, picking, pipeline, alerts, briefing,
  day, spark, access, agreement, number), `src/data/` (db, schema, repository,
  outbox, erase, simulate), `src/sync/` (sync, serialize, columns, agreement),
  `src/i18n/`, `src/notify/` (facts, phrase), `src/theme/contrast`, mais
  `src/bar.test.ts`, `src/law.test.ts`, `src/layers.test.ts`,
  `src/language.test.ts`, `src/dictionary.test.ts`, `src/selectors.test.ts`,
  `src/release.test.ts`, `src/components/confirm.test.ts`,
  `src/assistant/assistant.test.ts`.

#### 27.3.2 `src/release.test.ts` — o guarda do que sai no instalador

É o único teste que abre o `app.json` (`src/release.test.ts:15-17`). Duas
afirmações, ambas rodando em todo commit:

1. **`the ledger does not leave the phone through the Android backup`**
   (`src/release.test.ts:19-33`): exige `expo.android.allowBackup === false`. A
   mensagem de falha, textual: `'o backup do Android está ligado: o banco do
   aplicativo vai para a conta Google de quem estiver no aparelho'`
   (`src/release.test.ts:31`).
2. **`the version can always produce a build number that grows`**
   (`src/release.test.ts:35-55`): quebra a versão em `[a, b, c]`, exige que os
   três sejam inteiros, que `b < 100` e `c < 100`, e — literalmente —
   `assert.equal(a * 1_000_000 + b * 10_000 + c * 100, 100_000)`
   (`src/release.test.ts:54`), fixando que `0.10.0` continua valendo `100000`.
   Mensagens: `` `menor ${b} não cabe: a faixa do menor vai até 99` `` e
   `` `correção ${c} não cabe: a faixa da correção vai até 99` ``
   (`src/release.test.ts:48-49`).

**Efeito colateral a saber ao reconstruir:** esse `assert.equal` fixo em
`100_000` (`src/release.test.ts:54`) faz o teste **falhar em qualquer versão que
não seja `0.10.0`**. Subir o `app.json` para `0.11.0` exige editar esta linha no
mesmo commit.

#### 27.3.3 Scripts que existem e **não têm entrada no `package.json`**

| Arquivo | Como se roda | O que faz |
|---|---|---|
| `scripts/icons.mjs` | `node scripts/icons.mjs` (`scripts/icons.mjs:25`) | Desenha os seis PNGs de ícone a partir do `markPath` do `brand.ts` |
| `scripts/manifesto.mjs` | módulo importado | Decide quando reexportar e quando reusar `dist` |
| `scripts/device-session.ts` | invocado por `scripts/verify-migrations.sh` (check 6) | Roda uma sessão de aparelho de verdade e imprime a fila como SQL |

`scripts/device-session.ts:14` diz que a saída vai "para `scripts/verify-sync.sh`
consumir" — **esse arquivo não existe no repositório**; quem consome é
`scripts/verify-migrations.sh`. É comentário desatualizado, não um arquivo
faltando.

#### 27.3.4 `mutate` — o que ele garante e como não suja a árvore

`scripts/mutate.mjs` carrega uma lista curada de defeitos
(`const DEFECTS = [...]`, `scripts/mutate.mjs:30`), hoje com **106 entradas**,
cada uma com quatro campos: `file`, `from`, `to` e `hurts` — este último uma
frase sobre o que quebraria na fábrica. Exemplo textual
(`scripts/mutate.mjs:35-44`):

```
{
  file: 'app/(tabs)/index.tsx',
  from: '      expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5),',
  to:   '      expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5, LOCAL_COMPANY_ID),',
  hurts: 'o cartao de validade da capa volta a olhar so o almoxarifado, e emudece
          no dia em que o lote vai para a camara fria ou para a loja ...'
}
```

O script **copia o código para `.mutate/` e muta a cópia** — a árvore de
trabalho nunca é tocada (`scripts/mutate.mjs:25-27` importa `cpSync`, `rmSync`,
`symlinkSync`; `.mutate/` está no `.gitignore`).

#### 27.3.5 `e2e` e `e2e:fast` — a diferença que importa

- `npm run e2e` roda `e2e/flow.mjs` (`package.json:15`), que **exporta e serve
  ele mesmo**. Porta padrão `4178` (`e2e/flow.mjs:25`), configurável por
  `E2E_PORT`. Aceita `--only <pedaço do nome>` (`e2e/flow.mjs:39`) e
  `--shard i/N` (`e2e/flow.mjs:57`). O fatiamento é **por resto da divisão**, não
  por bloco contíguo, porque as checagens têm durações muito diferentes
  (`e2e/flow.mjs:51-54`).
- `npm run e2e:fast` roda `scripts/e2e-parallel.mjs`: exporta **uma vez**
  (`npx expo export --platform web`, com `--clear` só quando o `app.json` mudou)
  e dispara `Math.max(1, Math.min(cpus().length, 4))` fatias
  (`scripts/e2e-parallel.mjs:27`), cada uma com `E2E_REUSE_BUILD=1` e porta
  `E2E_PORT + n` a partir de `4300` (`scripts/e2e-parallel.mjs:28`, `:59`).
- O servidor local das duas ferramentas manda os cabeçalhos de isolamento de
  origem: `Cross-Origin-Opener-Policy: same-origin` e
  `Cross-Origin-Embedder-Policy: require-corp` (`e2e/flow.mjs:114-115`,
  `scripts/shot.mjs:123-124`) — sem isso o SQLite WebAssembly não abre.

#### 27.3.6 `scripts/manifesto.mjs` — as duas somas de verificação

Duas marcas em `.expo/`, ambas gravadas **só depois de um export bem-sucedido**:

| Função | Marca | Regra |
|---|---|---|
| `precisaLimpar(raiz)` | `.expo/manifesto.sha` (`scripts/manifesto.mjs:33`) | SHA-256 do `app.json`; se mudou, exporta com `--clear`. Existe porque o manifesto do `expo-constants` é embutido na transformação e o cache do Metro não invalida quando o `app.json` muda — a tela de Ajustes chegou a mostrar `0.2.0` com o `app.json` em `0.7.0` (`scripts/manifesto.mjs:8-16`) |
| `pacoteServe(raiz)` | `.expo/fonte.sha` (`scripts/manifesto.mjs:90`) | SHA-256 de tudo em `app/`, `src/`, `assets/` mais `app.json`, `package.json`, `babel.config.js` e `metro.config.js` (`scripts/manifesto.mjs:80-84`); ignora `node_modules` e tudo que começa com ponto (`scripts/manifesto.mjs:73`). Só reusa `dist` quando a soma bate |

#### 27.3.7 `db:verify` — as treze verificações

`scripts/verify-migrations.sh` sobe um Postgres descartável em
`PGDATA=/tmp/norva-verify-db`, porta `55432`, banco `norva_verify`
(`scripts/verify-migrations.sh:21-25`), com `initdb --auth=trust`
(`:47`), e derruba tudo no `trap cleanup EXIT` (`:36-41`). Se rodar como root,
cria um usuário `pgverify` e roda o servidor por ele (`:29-34`).

| # | Título no script | Linha |
|---|---|---|
| 1 | the ledger refuses UPDATE and DELETE | `:99` |
| 2 | a purchase moves the moving average, keeping precision | `:124` |
| 3 | a product cannot be half-manufactured | `:176` |
| 4 | one company cannot see another, and an operator cannot see money | `:202` |
| 5 | the ledger accepts what phase 1 actually records | `:318` |
| 6 | a fila do aparelho chega inteira, e os dois lados fecham o mesmo número | `:417` |
| 7 | a grade do produto recusa o cadastro impossível | `:560` |
| 8 | o pedido nasce onde a empresa mandou, e sair do pendente é de quem aprova | `:637` |
| 9 | o reenvio da fila passa pela capacidade MÍNIMA de quem escreveu | `:688` |
| 10 | o razão recusa item e local de outra empresa | `:732` |
| 11 | o aparelho emprestado cria o lugar padrão, e nada além dele | `:773` |
| 12 | a leitura da câmara sobe duas vezes, e a segunda não reescreve nada | `:812` |
| 13 | quem aprova um pedido não reescreve quem o anotou | `:849` |

---

### 27.4 Configuração do app (`app.json`)

#### 27.4.1 Campos de topo

| Chave | Valor | Linha |
|---|---|---|
| `name` | `NORVA` | `app.json:3` |
| `slug` | `norva` | `app.json:4` |
| `scheme` | `norva` | `app.json:5` |
| `version` | `0.10.0` | `app.json:6` |
| `orientation` | `portrait` | `app.json:7` |
| `icon` | `./assets/icon.png` | `app.json:8` |
| `userInterfaceStyle` | `automatic` | `app.json:9` |
| `newArchEnabled` | `true` | `app.json:10` |
| `owner` | `chrnx0` | `app.json:40` |
| `runtimeVersion.policy` | `fingerprint` | `app.json:41-43` |
| `updates.url` | `https://u.expo.dev/384e9ec9-b731-4691-a622-d1edc89259a1` | `app.json:45` |
| `updates.fallbackToCacheTimeout` | `0` | `app.json:46` |
| `extra.eas.projectId` | `384e9ec9-b731-4691-a622-d1edc89259a1` | `app.json:50` |
| `experiments.typedRoutes` | `true` | `app.json:37-39` |

**Não existe chave `splash` no `app.json`.** Também não existe
`androidStatusBar`, `notification`, `backgroundColor`, `primaryColor`, `locales`
nem `assetBundlePatterns`.

#### 27.4.2 iOS

| Chave | Valor | Linha |
|---|---|---|
| `ios.supportsTablet` | `true` | `app.json:12` |
| `ios.bundleIdentifier` | `app.norva.mobile` | `app.json:13` |

Não há build de iOS em nenhum workflow. `npm run ios` existe
(`package.json:9`) e nada mais.

#### 27.4.3 Android

| Chave | Valor | Linha |
|---|---|---|
| `android.package` | `app.norva.mobile` | `app.json:16` |
| `android.allowBackup` | `false` | `app.json:17` |
| `android.adaptiveIcon.backgroundColor` | `#FAF7F2` | `app.json:19` |
| `android.adaptiveIcon.foregroundImage` | `./assets/android-icon-foreground.png` | `app.json:20` |
| `android.adaptiveIcon.backgroundImage` | `./assets/android-icon-background.png` | `app.json:21` |
| `android.adaptiveIcon.monochromeImage` | `./assets/android-icon-monochrome.png` | `app.json:22` |
| `android.predictiveBackGestureEnabled` | `false` | `app.json:24` |

**`android.versionCode` NÃO está declarado** (`app.json:15-25`). Ver §27.8.5.

#### 27.4.4 Web

| Chave | Valor | Linha |
|---|---|---|
| `web.bundler` | `metro` | `app.json:27` |
| `web.output` | `single` | `app.json:28` |
| `web.favicon` | `./assets/favicon.png` | `app.json:29` |

`output: "single"` significa uma única página (SPA), não exportação estática por
rota. A saída observada em `dist/` confirma: `index.html`, `metadata.json`
(`{"version":0,"bundler":"metro","fileMetadata":{}}`), `favicon.ico`, `_expo/` e
`assets/`. O `<title>` do HTML gerado é `NORVA`.

#### 27.4.5 Plugins

Quatro, todos sem configuração (só o nome como string):

| Plugin | Linha |
|---|---|
| `expo-router` | `app.json:32` |
| `expo-localization` | `app.json:33` |
| `expo-sqlite` | `app.json:34` |
| `expo-notifications` | `app.json:35` |

`expo-updates` **não** aparece na lista de plugins; ele é ligado pela presença
da chave `updates` (`app.json:44-47`) e pela dependência (`package.json:33`).

#### 27.4.6 Permissões Android — o que o manifesto gerado declara

O `android/` é **gerado por `expo prebuild` e ignorado pelo git**
(`.gitignore`: `/android`, `/ios`, sob "generated native folders"). `git ls-files
android` retorna zero arquivos. O que segue é o manifesto que o prebuild produz
com este `app.json`:

| Permissão | Detalhe | Linha |
|---|---|---|
| `android.permission.INTERNET` | — | `android/app/src/main/AndroidManifest.xml:2` |
| `android.permission.READ_EXTERNAL_STORAGE` | `maxSdkVersion="32"`, com `tools:replace` | `:3` |
| `android.permission.SYSTEM_ALERT_WINDOW` | — | `:4` |
| `android.permission.VIBRATE` | — | `:5` |
| `android.permission.WRITE_EXTERNAL_STORAGE` | `maxSdkVersion="32"`, com `tools:replace` | `:6` |

`POST_NOTIFICATIONS` e `RECEIVE_BOOT_COMPLETED` **não** estão no manifesto do
aplicativo; eles vêm do manifesto da própria biblioteca
(`node_modules/expo-notifications/android/src/main/AndroidManifest.xml:2-3`) e
entram pelo *manifest merger* do Gradle, junto com o serviço
`ExpoFirebaseMessagingService` e o receptor `NotificationsService`.

Outros elementos do manifesto gerado:

- `<queries>` com intenção `VIEW` + `BROWSABLE` sobre esquema `https`
  (`AndroidManifest.xml:7-13`).
- `<application android:allowBackup="false" ...>` (`:14`) — é esse atributo que
  o passo de CI confere.
- Cinco `meta-data` de `expo.modules.updates` (`:15-20`): `ENABLED=true`,
  `ENABLE_BSDIFF_PATCH_SUPPORT=true`,
  `EXPO_RUNTIME_VERSION=@string/expo_runtime_version`,
  `EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS`, `EXPO_UPDATES_LAUNCH_WAIT_MS=0`,
  `EXPO_UPDATE_URL=https://u.expo.dev/384e9ec9-b731-4691-a622-d1edc89259a1`.
- `MainActivity` com `launchMode="singleTask"`,
  `windowSoftInputMode="adjustResize"`, `screenOrientation="portrait"` e
  `theme="@style/Theme.App.SplashScreen"` (`:21`).
- Dois `intent-filter`: `MAIN`/`LAUNCHER` (`:22-25`) e `VIEW`/`DEFAULT`/
  `BROWSABLE` com `android:scheme="norva"` (`:26-31`) — o deep link.

`android/app/src/main/res/values/strings.xml`:
`app_name = NORVA`, `expo_runtime_version = file:fingerprint` (a política
`fingerprint` de `app.json:42` materializada).

---

### 27.5 Os ícones — uma geometria só, gerada por script

`scripts/icons.mjs` **lê o `markPath` e o `markColorLight` direto do
`src/config/brand.ts` por expressão regular** (`scripts/icons.mjs:29-36`) e
rasteriza os PNGs sem nenhuma dependência: o PNG é montado à mão com `zlib`
(`scripts/icons.mjs:84-110`) e o antialiasing é 4×4 amostras por pixel
(`scripts/icons.mjs:118-138`).

**Ele recusa o que não entende.** A única forma aceita é
`M cx,cy L x1,y1 A rx,ry 0 1,1 x2,y2 Z` (`scripts/icons.mjs:42`); as duas pontas
precisam estar à distância do raio declarado, com tolerância de `0.5`
(`scripts/icons.mjs:53-57`), e o arco precisa ser circular (`|rx-ry| ≤ 0.001`,
`scripts/icons.mjs:58`). Fora disso ele lança, porque "desenhar assim mesmo daria
um ícone errado com exit zero, que é pior que não desenhar"
(`scripts/icons.mjs:48`).

Os seis alvos, com a fração do lado que o disco ocupa
(`scripts/icons.mjs:154-159`):

| Arquivo | Lado | `fracao` | Fundo | Tinta |
|---|---|---|---|---|
| `assets/icon.png` | 1024 | `0.62` | `#FAF7F2` | `markColorLight` |
| `assets/android-icon-foreground.png` | 1024 | `0.44` | transparente | `markColorLight` |
| `assets/android-icon-background.png` | 1024 | `0` | `#FAF7F2` | — |
| `assets/android-icon-monochrome.png` | 1024 | `0.44` | transparente | `#000000` |
| `assets/splash-icon.png` | 1024 | `0.50` | transparente | `markColorLight` |
| `assets/favicon.png` | 96 | `0.72` | `#FAF7F2` | `markColorLight` |

A razão das frações está escrita: o ícone do lançador é recortado em círculo pelo
sistema, e no primeiro plano adaptativo do Android "só o miolo de 66% é
garantido" (`scripts/icons.mjs:146-151`).

Os seis arquivos existem em `assets/` com essas dimensões exatas
(1024×1024 RGBA, exceto `favicon.png` em 96×96).

**`assets/splash-icon.png` é gerado e não é referenciado por ninguém.** Uma busca
por "splash" fora de `node_modules`/`android` devolve três ocorrências: o
comentário do `brand.ts` (`src/config/brand.ts:22`) e duas linhas do gerador
(`scripts/icons.mjs:6`, `:154`). O `app.json` não o cita. **Estado: implementado
e sem chamador.**

---

### 27.6 Ferramentas de build

#### 27.6.1 `metro.config.js`

```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
module.exports = config;
```

Uma única alteração sobre o padrão: `wasm` vira extensão de asset
(`metro.config.js:10`). Sem isso o `expo-sqlite` não resolve o binário
WebAssembly do SQLite no navegador e "não consegue resolver o banco de jeito
nenhum" (`metro.config.js:6-9`).

#### 27.6.2 `babel.config.js`

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
```

Um preset (`babel.config.js:8`) e um plugin (`babel.config.js:9`). O plugin de
worklets **tem que ser o último da lista**, senão "a física de mola que carrega o
movimento deste app cai silenciosamente para nada" (`babel.config.js:2-4`). Nota:
o plugin declarado é `react-native-worklets/plugin` — o pacote
`react-native-worklets` **não está em `package.json`**; ele chega como dependência
transitiva do `react-native-reanimated@4.5.1`.

#### 27.6.3 `tsconfig.json`

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] },
    "types": ["node"]
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

O que vem do preset (`node_modules/expo/tsconfig.base.json`), e que o
reconstrutor precisa reproduzir: `allowJs: true`, `esModuleInterop: true`,
`jsx: "react-jsx"`, `lib: ["DOM","ESNext"]`, `module: "preserve"`,
`moduleDetection: "force"`, `moduleResolution: "bundler"`,
`customConditions: ["react-native"]`, `noEmit: true`, `resolveJsonModule: true`,
`skipLibCheck: true`, `target: "ESNext"`, e `exclude` de `node_modules`,
`babel.config.js`, `metro.config.js`, `jest.config.js`, `android`, `ios`.

O alias `@/*` → `./src/*` (`tsconfig.json:5-9`) é o que faz todo import de
domínio ser `@/domain/...`, `@/data/...`, `@/config/brand`.

`.expo/types/**/*.ts` no `include` (`tsconfig.json:17`) existe por causa de
`experiments.typedRoutes: true` (`app.json:38`): o Expo Router gera os tipos das
rotas ali. `expo-env.d.ts` é gerado e está no `.gitignore`.

#### 27.6.4 `eslint.config.js`

```js
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
module.exports = defineConfig([ expoConfig, { ignores: ["dist/*"] } ]);
```

Flat config, só o preset do Expo e a exclusão do `dist/` (`eslint.config.js:8`).
Nenhuma regra própria do projeto.

---

### 27.7 O alvo web

#### 27.7.1 `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npx expo export --platform web",
  "outputDirectory": "dist",
  "framework": null,
  "headers": [{ "source": "/(.*)", "headers": [
    { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
    { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
  ]}]
}
```

- `framework: null` (`vercel.json:5`) — nenhuma detecção automática; o build é o
  comando literal.
- Os dois cabeçalhos (`vercel.json:11-17`) valem para **todas** as rotas
  (`source: "/(.*)"`). Sem isolamento de origem cruzada o navegador recusa
  `SharedArrayBuffer` e o SQLite WebAssembly não abre — está escrito no README
  (`README.md:215-221`) e é a mesma regra que os servidores locais do `e2e` e do
  `shot` reproduzem (`e2e/flow.mjs:114-115`, `scripts/shot.mjs:123-124`).
- **Não há nome de projeto, domínio, região ou variável de ambiente** no
  `vercel.json`. NÃO ESTÁ NO CÓDIGO qual projeto/domínio Vercel recebe este
  deploy; o README lista "Domínio" como pendência humana (`README.md:172`).

#### 27.7.2 Onde os dados ficam na web

Os dados ficam no navegador de quem abre, não num servidor — "o mesmo desenho
offline-first do aplicativo" (`README.md:222-223`).

---

### 27.8 CI — `.github/workflows/ci.yml`

#### 27.8.1 Gatilho

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

(`ci.yml:9-12`). A escolha é explicada no cabeçalho: push em `main` **e** todo
pull request, mas não os dois para o mesmo commit — uma branch com PR aberto
rodaria a barra inteira duas vezes, "o que custa minutos e deixa um check
vermelho ambíguo sobre a qual execução ele pertence" (`ci.yml:6-8`).

O princípio declarado: a barra do CI é deliberadamente **a mesma** que uma pessoa
roda na máquina, porque "um check que só existe no CI se afasta do que os
contribuidores realmente fazem, e aí ninguém confia em nenhum dos dois"
(`ci.yml:3-5`).

#### 27.8.2 Job `app` — "types, tests, bundle" (`ci.yml:15-49`)

Roda em `ubuntu-latest`. Passos, em ordem:

| # | Passo | Comando |
|---|---|---|
| 1 | checkout | `actions/checkout@v4` (`:19`) |
| 2 | node | `actions/setup-node@v4`, `node-version: 22`, `cache: npm` (`:21-24`) |
| 3 | instalar | `npm ci` (`:26`) |
| 4 | **Types** | `npm run typecheck` (`:28-29`) |
| 5 | **Lint** | `npm run lint` (`:31-32`) |
| 6 | **The cost engine** | `npm test` (`:34-35`) |
| 7 | **Does the suite bite?** | `npm run mutate` (`:41-42`) |
| 8 | **Android bundle** | `npx expo export --platform android`, com `EXPO_NO_TELEMETRY: '1'` (`:46-49`) |

Duas justificativas escritas no arquivo:
- o `mutate` existe porque "uma suíte verde diz que os exemplos escolhidos
  passaram, não que as regras estão protegidas" (`ci.yml:37-40`);
- o bundle Android existe porque "checar tipos prova que o código é consistente;
  só empacotar prova que ele consegue chegar a um telefone" (`ci.yml:44-45`).

#### 27.8.3 Job `gate` — "proofgate" (`ci.yml:51-71`)

| # | Passo | Comando |
|---|---|---|
| 1 | checkout **com histórico** | `actions/checkout@v4` com `fetch-depth: 0` (`:56-58`) — o portão lê o diff contra a base |
| 2 | node 22 + cache npm | `:60-63` |
| 3 | instalar | `npm ci` (`:65`) |
| 4 | **Delivery gate** | `bash .proofgate/verify.sh` (`:70-71`) |

O comentário do arquivo diz "Nineteen guards" (`ci.yml:67`). **A contagem está
desatualizada**: `.proofgate/guards.d/` tem **25** guards executáveis mais um
`TEMPLATE.sh.example`:

`10-secrets.sh`, `12-merge-markers.sh`, `15-tls-off.sh`, `20-pii-logging.sh`,
`25-silent-catch.sh`, `30-untested-changes.sh`, `35-dependency-change.sh`,
`40-env-drift.sh`, `45-broad-process-kill.sh`, `47-unquoted-globstar.sh`,
`48-pipeline-exit-code.sh`, `50-coupled-files.sh`, `55-skipped-tests.sh`,
`58-frozen-clock.sh`, `60-large-files.sh`, `65-type-suppressions.sh`,
`70-debug-leftovers.sh`, `75-machine-paths.sh`, `85-float-money.sh`,
`90-sql-concat.sh`, `92-superuser-verification.sh`,
`95-schema-constraint-no-migration.sh`, `96-version-bump-no-release.sh`,
`97-migration-edited.sh`, `99-dead-allow.sh`.

Flags do `verify.sh` (`.proofgate/verify.sh:5-16`): `--build`, `--strict`,
`--smoke`, `--json`, `--only <guard>`, `--dry-run`, `--base <ref>`,
`--report <file>`. Códigos de saída: `0` passou (avisos permitidos, a menos que
`--strict`), `1` reprovou. Toda execução completa grava o veredito em
`$(git rev-parse --git-dir)/proofgate-verdict.json` — dentro de `.git`, para
nunca ser commitado (`.proofgate/verify.sh:18-20`). Timeout padrão: `900`
segundos (`.proofgate/verify.sh:57`). Configuração opcional em `proofgate.json`
na raiz — **esse arquivo não existe neste repositório**.

Dois guards diretamente ligados a esta seção:

- **`35-dependency-change.sh`**: avisa quando um manifesto de dependência muda e
  o lockfile não, porque "o CI resolve uma versão DIFERENTE da que você testou —
  'funciona na minha máquina' entregue como diff"
  (`.proofgate/guards.d/35-dependency-change.sh:2-7`). Compara os blocos
  `dependencies`, `devDependencies`, `peerDependencies`,
  `optionalDependencies`, `overrides`, `resolutions`, `require`, `require-dev`
  normalizados por `python3` ou `jq` (`:23-35`).
- **`96-version-bump-no-release.sh`**: avisa (WARN, nunca FAIL — `:16`) quando
  uma versão sobe num manifesto e nada na entrega corta um release. A lista de
  manifestos que ele reconhece inclui `app.json` e `build.gradle`
  (`:31`). Ele se cala se o diff já trouxer automação de release
  (`release-please`, `changesets`, `semantic-release`, `goreleaser` — `:53`) ou
  um workflow que dispare por tag / crie release (`tags:`, `refs/tags`,
  `create release`, `softprops/action-gh-release`, `gh release` — `:59`).
  Mensagem, textual: `"⚠️  version bumped, no release in sight:"` seguida de
  "A manifest bump is not a release — nobody outside the diff can see it."
  (`:64-65`).

#### 27.8.4 Job `browser` — "the app, driven the way a person drives it" (`ci.yml:73-95`)

| # | Passo | Comando |
|---|---|---|
| 1 | checkout | `actions/checkout@v4` (`:75`) |
| 2 | node 22 + cache npm | `:77-80` |
| 3 | instalar | `npm ci` (`:84`) |
| 4 | **Chromium** | `npx playwright install --with-deps chromium` (`:86-87`) |
| 5 | **End to end** | `npm run e2e`, com `EXPO_NO_TELEMETRY: '1'` (`:92-95`) |

**O CI roda `npm run e2e` (serial), não `npm run e2e:fast`** (`ci.yml:93`). O
fatiamento em quatro é ferramenta de máquina local.

Motivo escrito: as checagens acham o que teste unitário estruturalmente não
alcança — "um diálogo de plataforma que não faz nada, uma rota que abre num banco
vazio, uma tela falando dois idiomas" (`ci.yml:89-91`).

#### 27.8.5 Job `schema` — "the database keeps its promises" (`ci.yml:97-122`)

| # | Passo | Comando |
|---|---|---|
| 1 | checkout | `actions/checkout@v4` (`:101`) |
| 2 | node 22 + cache npm | `:109-112` |
| 3 | instalar | `npm ci` (`:114`) |
| 4 | localizar Postgres | `echo "PGBIN=$(ls -d /usr/lib/postgresql/*/bin \| tail -1)" >> "$GITHUB_ENV"` (`:118-119`) |
| 5 | **rodar** | `npm run db:verify` (`:121-122`) |

Duas cicatrizes registradas no arquivo:
- o job **precisa das dependências do projeto** desde que o check 6 passou a
  rodar uma sessão de aparelho em TypeScript; sem `npm ci`, o `npx` baixava um
  `tsx` avulso que não resolvia um único import do projeto — "verde localmente,
  vermelho aqui" (`ci.yml:103-108`);
- o script sobe o **próprio** Postgres, então precisa dos binários e não de um
  serviço rodando (`ci.yml:116-117`).

O nome do passo diz "Six guarantees" (`ci.yml:121`); **são treze** hoje (§27.3.7).

#### 27.8.6 Segredos

**Nenhum job do GitHub Actions usa `secrets.*`** — uma busca por `secrets.` em
`.github/` e `.eas/` retorna zero ocorrências. O único credencial usado é
`GH_TOKEN: ${{ github.token }}`, o token efêmero do próprio job
(`build-apk.yml:254`, `:273`). Não há `EXPO_TOKEN` em lugar nenhum do
repositório.

---

### 27.9 O workflow de APK — `.github/workflows/build-apk.yml`

#### 27.9.1 Por que compilar aqui e não na Expo

Dois motivos escritos (`build-apk.yml:5-8`): a cota da Expo é limitada e o dono
pediu para guardá-la para versão madura e OTA; e o APK da Expo sai com quatro
arquiteturas — **110 MB, dos quais 47 são x86 e x86_64**, que só existem em
emulador. Aqui sai só `arm64-v8a`: **47 MB**.

#### 27.9.2 Gatilho e permissões

```yaml
on:
  workflow_dispatch:
    inputs:
      limpar_tags:
        description: 'Tags de release das quais remover APKs antigos (ex: apk-0.1.0,apk-0.2.0)'
        required: false
        default: ''
permissions:
  contents: write
```

(`build-apk.yml:12-21`). Só manual. `timeout-minutes: 60` (`:34`), com a razão
escrita: uma hora é folga para uma compilação fria de NDK, mas "o relógio não
diagnostica nada" — as duas primeiras execuções morreram ali e a causa era falta
de Metaspace (`build-apk.yml:26-33`).

#### 27.9.3 Passos, em ordem

| # | Passo | O que faz | Linha |
|---|---|---|---|
| 1 | `actions/checkout@v4` | — | `:36` |
| 2 | **Abrir espaço em disco** | `df -h /`, remove `/usr/share/dotnet`, `/usr/share/swift`, `/opt/ghc`, `/usr/local/share/powershell`, `/usr/local/share/boost`, `/opt/hostedtoolcache/CodeQL`, `df -h /` de novo | `:49-55` |
| 3 | `actions/setup-node@v4` | node 22, cache npm | `:58-61` |
| 4 | `actions/setup-java@v4` | distribuição `temurin`, Java 17 | `:63-66` |
| 5 | `android-actions/setup-android@v3` | SDK do Android | `:68` |
| 6 | `actions/cache/restore@v4` | restaura `~/.gradle/caches`, `~/.gradle/wrapper`, `android/.cxx` | `:86-95` |
| 7 | **Instalar as dependências** | `npm ci` | `:97-98` |
| 8 | **Gerar o projeto nativo** | `npx expo prebuild --platform android --no-install` | `:100-101` |
| 9 | **Conferir que o backup do Android está desligado** | lê `android/app/src/main/AndroidManifest.xml` e exige `android:allowBackup="false"` | `:111-115` |
| 10 | **Dar memória ao Gradle, na medida da máquina** | lê a RAM, calcula o heap, reescreve `gradle.properties` | `:133-164` |
| 11 | **Dar ao Android um número de build que cresce** | calcula e escreve o `versionCode` | `:188-204` |
| 12 | **Compilar, só arm64** | `./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a` | `:206-209` |
| 13 | **Conferir que o que saiu instala** | assinatura, bundle, ABIs, nome do arquivo | `:211-239` |
| 14 | **Limpar APKs antigos das tags pedidas** (condicional) | `if: inputs.limpar_tags != ''` | `:251-269` |
| 15 | **Anexar ao release** | cria ou atualiza o release, e reescreve as notas | `:271-328` |
| 16 | **Guardar o caché, tenha dado certo ou não** | `if: always()`, `actions/cache/save@v4` | `:346-355` |

#### 27.9.4 O caché do Gradle

Chave: `gradle-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ github.run_id }}`
(`build-apk.yml:92`), com `restore-keys` em dois níveis:
`gradle-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-` e
`gradle-${{ runner.os }}-` (`:93-95`).

O ganho é **medido, não prometido** (`build-apk.yml:74-82`): execução 5 fria
contra a 6 quente, mesmo commit `1b4b749`, a compilação caiu de **24m13s para
16m53s** — sete minutos. As duas execuções imprimiram
`871 actionable tasks: 871 executed` e nenhum `FROM-CACHE`: o que se reaproveita
é download e transformação de artefato, **nunca saída de tarefa**. "Caché de
dependência não é caché de compilação"; para o segundo seria preciso
`org.gradle.caching=true` e guardar `build-cache-1`, e isso ainda não foi medido.

Restaurar e gravar são passos **separados de propósito** (`:84-85`): o
`actions/cache` inteiro só grava no fim de um job que terminou, e um job morto
por timeout nunca grava — então a execução seguinte também começava fria e também
morria no relógio, "o caché que faria a compilação caber na hora só existiria se
ela já tivesse cabido" (`build-apk.yml:332-336`). A borda conhecida: `always()`
cobre passo que falha e job cancelado, **não** cobre a máquina sumir
(`:338-342`). E o `run_id` está na chave porque entrada de caché não se
sobrescreve (`:344-345`).

O passo de abrir espaço em disco existe porque a execução 4 compilou, publicou o
APK e falhou ao gravar o caché com `zstd: No space left on device` — e **o passo
de caché não falha quando isso acontece**: avisa e sai verde
(`build-apk.yml:40-48`).

#### 27.9.5 Memória do Gradle — a fórmula literal

```bash
TOTAL_MB=$(free -m | awk '/^Mem:/ {print $2}')
HEAP_MB=$(( TOTAL_MB / 2 ))
if [ "$HEAP_MB" -gt 4096 ]; then HEAP_MB=4096; fi
if [ "$HEAP_MB" -lt 2048 ]; then HEAP_MB=2048; fi
JVMARGS="-Xmx${HEAP_MB}m -XX:MaxMetaspaceSize=1g"
sed -i "s/^org\.gradle\.jvmargs=.*/org.gradle.jvmargs=$JVMARGS/" gradle.properties
grep -q "^org.gradle.jvmargs=$JVMARGS$" gradle.properties
printf '\n%s\n' "kotlin.daemon.jvmargs=-Xmx1g" >> gradle.properties
grep -q '^kotlin.daemon.jvmargs=-Xmx1g$' gradle.properties
```

(`build-apk.yml:138-162`). Metade da RAM, com piso de 2048 MB e teto de 4096 MB;
Metaspace fixo em 1 GB; daemon do Kotlin em 1 GB.

Três cicatrizes registradas:
- O template do React Native pede 512 MB de Metaspace e a arquitetura nova não
  cabe: a execução das 21h encheu o Metaspace aos 26 minutos, ficou vinte minutos
  sem escrever uma linha e morreu no relógio — "falha de memória usando o
  cronômetro como disfarce" (`build-apk.yml:119-123`).
- A primeira correção deu 6 GB de heap lendo "16 GB" de um comentário não
  conferido; às 00:05 **o runner inteiro** recebeu sinal de desligamento, porque
  as JVMs somadas (Gradle, compilador do Kotlin, R8, aapt2) passaram do que a
  máquina tem (`build-apk.yml:124-129`).
- O `printf` começa com quebra de linha porque o `gradle.properties` gerado
  **termina sem uma**: um `echo >>` produziria
  `...watchedDirectories=[]kotlin.daemon.jvmargs=-Xmx1g`, estragando as duas
  propriedades sem reclamar (`build-apk.yml:153-160`).

Os dois `grep -q` de verificação existem porque, se o Expo renomear a chave, o
`sed` não casa e a compilação voltaria a morrer igual daqui a meses, sem pista
(`build-apk.yml:148-151`).

#### 27.9.6 O `versionCode` — a fórmula e a colisão que ela conserta

```bash
VERSION="$(node -p "require('./app.json').expo.version")"
CODE="$(node -p "
  const [a,b,c] = require('./app.json').expo.version.split('.').map(Number);
  if (b > 99 || c > 99) throw new Error('menor ou correção acima de 99: a faixa colide');
  a * 1000000 + b * 10000 + c * 100
")"
cd android/app
sed -i "s/^\( *\)versionCode .*/\1versionCode $CODE/" build.gradle
grep -qE "^ *versionCode $CODE$" build.gradle
```

(`build-apk.yml:190-204`).

**Fórmula atual: `a × 1.000.000 + b × 10.000 + c × 100`.**

O problema que ela resolve, escrito por extenso (`build-apk.yml:166-187`):
`expo prebuild` regenera o `build.gradle` com `versionCode 1` toda vez, porque o
`app.json` não declara um — resultado: todo APK que já saiu deste repositório se
anunciava como **a mesma build** para o sistema. "Instalar por cima não é
atualizar, é substituir, e o aparelho não sabe qual é mais novo."

A fórmula anterior era `a × 100.000 + b × 10.000 + c` e **colidia dentro do
alcance de hoje**: `0.10.0` e `1.0.0` davam `100000` os dois, e o `0.10.0` já
está publicado. A nova concorda com a antiga em **toda versão 0.x.0**, então
nada do que já saiu muda de número: `0.10.0` continua `100000`, `0.11.0` vira
`110000`, `1.0.0` vira `1.000.000`.

O número sai da versão e não de um contador, para a build ser reproduzível
(`build-apk.yml:174-176`).

Estado observado na cópia local prebuildada:
`android/app/build.gradle:95` traz `versionCode 100000` e
`android/app/build.gradle:96` traz `versionName "0.10.0"` — exatamente o que a
fórmula produz para `0.10.0`.

#### 27.9.7 As quatro conferências do artefato

```bash
APK=android/app/build/outputs/apk/release/app-release.apk
ls -lh "$APK"
SIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner | tail -1)
"$SIGNER" verify --verbose "$APK" | tee /tmp/sig.txt
grep -q "^Verifies" /tmp/sig.txt
unzip -l "$APK" | grep -q assets/index.android.bundle
test "$(unzip -l "$APK" | grep -oE 'lib/[a-z0-9_-]+/' | sort -u | wc -l)" -eq 1
VERSION="$(node -p "require('./app.json').expo.version")"
NAME="norva-$VERSION-arm64.apk"
cp "$APK" "$NAME"
echo "APK_NAME=$NAME" >> "$GITHUB_ENV"
```

(`build-apk.yml:212-239`). Em ordem: **assinatura** (um APK sem ela não instala e
o erro no celular não explica nada — `:216-217`); **o bundle JS está dentro**
(um APK sem JS abre numa tela branca — `:222`); **uma arquitetura só** (senão o
ganho de tamanho se perdeu no caminho — `:225`); **o nome carrega a versão**.

O nome não é enfeite: todo build saía como `norva-arm64.apk`, e na pasta de
downloads do celular o segundo vira `norva-arm64 (1).apk` — "a pergunta 'eu estou
com o novo?' passa a não ter resposta olhando o arquivo"
(`build-apk.yml:228-234`).

#### 27.9.8 Publicação no release

```bash
VERSION="$(node -p "require('./app.json').expo.version")"
TAG="apk-$VERSION"
gh release create "$TAG" "$APK_NAME" \
  --target "$(git rev-parse HEAD)" \
  --title "NORVA $TAG" \
  --prerelease \
  --notes "Publicando..." \
|| gh release upload "$TAG" "$APK_NAME" --clobber
```

(`build-apk.yml:280-296`). A tag sai do `app.json` e nunca de texto escrito à mão
— era fixa em `apk-0.1.0`, "então o release seguia dizendo 0.1.0 enquanto o
conteúdo mudava" (`:275-279`). O `create ... || upload --clobber` existe porque o
passo era `upload` puro, e **uma versão nova quebrava a publicação**: sem release
com aquela tag o `gh` saía com erro depois de vinte minutos de compilação
(`:284-290`).

As notas são reescritas a cada publicação (`build-apk.yml:301-327`), com este
texto exato:

```
Instalador de teste do NORVA para Android.

**Baixe `<APK_NAME>`** - <tamanho>, compilado
neste repositorio para arm64, que e o que qualquer celular dos
ultimos dez anos usa.

**Como instalar:** baixe pelo proprio celular. O Android pede
permissao para instalar fora da Play Store - e normal em
aplicativo de teste, e e uma vez so.

**Se ja tiver a versao da Expo instalada:** desinstale antes.
As duas sao assinadas com chaves diferentes e o Android recusa
instalar uma por cima da outra - e desinstalar apaga os dados.

---
Compilado de `<sha curto>` - <dd/mm/aaaa HH:MM UTC>
```

O passo `limpar_tags` (`build-apk.yml:251-269`) percorre as tags passadas na
entrada, separadas por vírgula, e apaga **só os assets terminados em `.apk`** de
cada uma, com `gh release delete-asset "$TAG" "$NAME" -y`. Ele é manual de
propósito: "apagar arquivo publicado é ato do dono, não efeito colateral de uma
compilação" (`:249-250`). A razão de existir: o release `apk-0.2.0` chegou a
carregar dois APKs de códigos diferentes, e quem baixasse o errado instalava um
app sem metade das telas (`:242-247`).

#### 27.9.9 O caminho de publicação que foi apagado

Existiam **dois** caminhos vivos ao mesmo tempo até 4 de setembro. O commit
`380658f` ("O caminho de publicação que ninguém usa continuava armado") removeu
`.github/workflows/release-apk.yml` e `.github/apk-release.txt`. Este segundo
baixava um artefato pronto da Expo por URL e o anexava ao release — e apontava
para um build de `5703790`, **177 commits atrás**. Como a tag sai do `app.json`,
disparar aquele workflow anexava um APK de 110 MiB de 177 commits atrás **dentro**
do release `apk-0.8.0`, ao lado do bom, sob uma nota dizendo "Compilado de
c32f96f". Pior que dois arquivos sob a mesma tag: as assinaturas eram de chaves
diferentes, então quem baixasse o maior não instalaria por cima e perderia os
dados ao desinstalar.

O mesmo commit fechou a pendência do `EXPO_TOKEN`: depois da remoção "não sobra
uma ocorrência de `EXPO_TOKEN`, `eas build` ou `expo.dev/artifacts` no
repositório" — verificado hoje e ainda verdade fora dos documentos
(`docs/insights.md:2712-2715`).

---

### 27.10 EAS

#### 27.10.1 `eas.json`

| Bloco | Chave | Valor | Linha |
|---|---|---|---|
| `cli` | `version` | `>= 16.0.0` | `eas.json:3` |
| `cli` | `appVersionSource` | `remote` | `eas.json:4` |
| `build.development` | `developmentClient` | `true` | `eas.json:8` |
| `build.development` | `distribution` | `internal` | `eas.json:9` |
| `build.development` | `channel` | `development` | `eas.json:10` |
| `build.preview` | `distribution` | `internal` | `eas.json:13` |
| `build.preview` | `channel` | `preview` | `eas.json:14` |
| `build.preview` | `android.buildType` | `apk` | `eas.json:15-17` |
| `build.production` | `autoIncrement` | `true` | `eas.json:20` |
| `build.production` | `channel` | `production` | `eas.json:21` |
| `submit.production` | — | `{}` (vazio) | `eas.json:24-26` |

**Estado: configuração sem chamador automatizado.** Nenhum workflow do
repositório executa `eas build` ou `eas submit`; esses perfis só valem se alguém
rodar a CLI à mão. `submit.production` é um objeto vazio — nenhuma credencial de
loja, nenhum `track`, nenhum `serviceAccountKeyPath`.

#### 27.10.2 `.eas/workflows/publish-update.yml`

```yaml
name: Publicar atualização
on:
  push:
    branches: [main]
    paths:
      - app/**
      - src/**
      - assets/**
      - package.json
      - app.json
jobs:
  publish_update:
    name: Enviar para o canal preview
    type: update
    params:
      branch: preview
      platform: android
```

(`.eas/workflows/publish-update.yml:12-29`). É um workflow **da EAS**, não do
GitHub Actions — roda nos servidores da Expo, e por isso não pede segredo no
repositório.

O raciocínio escrito (`:3-11`): o binário instalado no celular escuta o canal
`preview` (declarado no `eas.json`); um push no `main` que mexa em código ou
imagem publica um update nesse canal, e o aparelho o pega na próxima abertura.
Só o que muda em JavaScript e asset viaja por aqui — mudança nativa exige binário
novo, e é para isso que o `app.json` usa `runtimeVersion: fingerprint`
(`app.json:41-43`), que "reconhece isso sozinho e impede que um update caia num
binário incompatível".

#### 27.10.3 A contradição entre o OTA e o APK que o repositório publica

O manifesto Android gerado por `expo prebuild` **não declara canal nenhum**. A
chave que o Expo usa para isso é
`expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`
(`node_modules/@expo/config-plugins/build/android/Updates.js:72`, escrita em
`:153`), e ela está **ausente** de `android/app/src/main/AndroidManifest.xml` —
as únicas `meta-data` de updates ali são as seis listadas em §27.4.6.

O canal é gravado por `eas build --profile <perfil>`, que lê `channel` do
`eas.json`. O `build-apk.yml` **não usa EAS**: ele faz `npx expo prebuild` e
`./gradlew assembleRelease` (`build-apk.yml:101`, `:209`).

Portanto: o workflow da EAS publica no *branch* `preview`
(`.eas/workflows/publish-update.yml:28`), e o docblock afirma que o binário
instalado escuta esse canal (`:5-6`), mas **NÃO ESTÁ NO CÓDIGO** nada que grave o
canal `preview` dentro do APK produzido pelo `build-apk.yml`. Se o aparelho do
dono tem o APK deste repositório, a ligação entre os dois caminhos não está
demonstrada no repositório.

---

### 27.11 O projeto nativo gerado (`android/`)

**Não é versionado.** `.gitignore` traz `/ios` e `/android` sob "generated native
folders", e `git ls-files android` retorna zero. Tudo abaixo é o que
`npx expo prebuild --platform android --no-install` produz e o que o
`build-apk.yml` patcha em cima.

#### 27.11.1 `android/build.gradle` (raiz)

```gradle
buildscript {
  repositories { google(); mavenCentral() }
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('com.facebook.react:react-native-gradle-plugin')
    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
  }
}
allprojects {
  repositories { google(); mavenCentral(); maven { url 'https://www.jitpack.io' } }
}
apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
```

(`android/build.gradle:1-24`). Nenhuma versão fixada nos `classpath` — quem as
resolve são os plugins `expo-root-project` e o catálogo `expoLibs`.

#### 27.11.2 `android/app/build.gradle`

Plugins aplicados: `com.android.application`,
`org.jetbrains.kotlin.android`, `com.facebook.react`
(`android/app/build.gradle:1-3`).

O bloco `react { }` (`:11-64`) resolve tudo por `node --print require.resolve`:
o `entryFile` vem de `expo/scripts/resolveAppEntry`, o `hermesCommand` de
`hermes-compiler`, o `codegenDir` de `@react-native/codegen`. O empacotamento é
feito pela **CLI do Expo**, não pela do React Native:

```gradle
cliFile = new File([...require.resolve('@expo/cli')...])
bundleCommand = "export:embed"
```

(`android/app/build.gradle:20-21`), "para o config do Metro funcionar corretamente
com projetos Expo" (`:18-19`). `autolinkLibrariesWithApp()` fecha o bloco (`:63`).

`android { }` (`:84-133`):

| Campo | Valor | Linha |
|---|---|---|
| `namespace` | `app.norva.mobile` | `:90` |
| `applicationId` | `app.norva.mobile` | `:92` |
| `ndkVersion`, `buildToolsVersion`, `compileSdk`, `minSdkVersion`, `targetSdkVersion` | vêm de `rootProject.ext.*` | `:85-94` |
| `versionCode` | `100000` (patchado pelo CI) | `:95` |
| `versionName` | `"0.10.0"` | `:96` |
| `buildConfigField` | `REACT_NATIVE_RELEASE_LEVEL` = `reactNativeReleaseLevel` ou `stable` | `:98` |
| `enableMinifyInReleaseBuilds` | `android.enableMinifyInReleaseBuilds` ou `false` | `:69` |
| `jscFlavor` (usado só se Hermes desligado) | `io.github.react-native-community:jsc-android:2026004.+` | `:82` |

Dependências (`:155-181`): `com.facebook.react:react-android` sempre; `fresco`
para GIF e WebP conforme as propriedades `expo.gif.enabled`,
`expo.webp.enabled`, `expo.webp.animated`; e
`com.facebook.react:hermes-android` quando `hermesEnabled` é verdadeiro
(`:177-181`) — que é o caso.

#### 27.11.3 Assinatura — o ponto pendente

```gradle
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
}
buildTypes {
    debug   { signingConfig signingConfigs.debug }
    release {
        // Caution! In production, you need to generate your own keystore file.
        // see https://reactnative.dev/docs/signed-apk-android.
        signingConfig signingConfigs.debug
        ...
    }
}
```

(`android/app/build.gradle:100-123`). **O APK de release é assinado com a chave de
depuração**, com senha `android` e alias `androiddebugkey` — o padrão do
scaffold, inclusive o comentário de advertência do próprio template (`:113-114`).

Consequência já sentida e escrita nas notas do release: "As duas sao assinadas
com chaves diferentes e o Android recusa instalar uma por cima da outra - e
desinstalar apaga os dados" (`build-apk.yml:319-321`). E o `apksigner verify` do
passo 13 passa mesmo assim, porque a chave de debug **é** uma assinatura válida —
a conferência prova que o APK está assinado, não que está assinado com a chave
certa.

**Não existe keystore de release no repositório.** O `.gitignore` bloqueia
`*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision` e `*.pem`, e nenhum
workflow injeta um. **NÃO IMPLEMENTADO.**

#### 27.11.4 `android/gradle.properties` gerado

| Propriedade | Valor gerado | Linha |
|---|---|---|
| `org.gradle.jvmargs` | `-Xmx2048m -XX:MaxMetaspaceSize=512m` | `:13` |
| `org.gradle.parallel` | `true` | `:18` |
| `android.useAndroidX` | `true` | `:23` |
| `android.enablePngCrunchInReleaseBuilds` | `true` | `:26` |
| `reactNativeArchitectures` | `armeabi-v7a,arm64-v8a,x86,x86_64` | `:31` |
| `newArchEnabled` | `true` | `:38` |
| `hermesEnabled` | `true` | `:42` |
| `edgeToEdgeEnabled` | `true` | `:47` |
| `expo.gif.enabled` | `true` | `:50` |
| `expo.webp.enabled` | `true` | `:52` |
| `expo.webp.animated` | `false` | `:55` |
| `EX_DEV_CLIENT_NETWORK_INSPECTOR` | `true` | `:58` |
| `expo.useLegacyPackaging` | `false` | `:61` |
| `expo.inlineModules.watchedDirectories` | `[]` | `:63` |

`reactNativeArchitectures` fica com as quatro ABIs no arquivo; a redução para
`arm64-v8a` é feita na linha de comando, com
`-PreactNativeArchitectures=arm64-v8a` (`build-apk.yml:209`).

Nesta cópia local o arquivo tem **duas** linhas `org.gradle.jvmargs` — a gerada
(`:13`) e uma acrescentada no fim, `org.gradle.jvmargs=-Xmx3g
-XX:MaxMetaspaceSize=1g` (`:64`), mais `kotlin.daemon.jvmargs=-Xmx1g` (`:65`).
Isso é resíduo de alguém ter rodado o passo de memória localmente; no CI o `sed`
substitui a linha existente em vez de acrescentar (`build-apk.yml:146`).

#### 27.11.5 Recursos gerados

`android/app/src/main/res/values/colors.xml`:

| Cor | Valor |
|---|---|
| `splashscreen_background` | `#FFFFFF` |
| `iconBackground` | `#FAF7F2` |
| `colorPrimary` | `#023c69` |

`android/app/src/main/res/values/styles.xml`:

```xml
<style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
  <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>
  <item name="colorPrimary">@color/colorPrimary</item>
  <item name="android:statusBarColor">@android:color/transparent</item>
  <item name="android:navigationBarColor">@android:color/transparent</item>
</style>
<style name="Theme.App.SplashScreen" parent="AppTheme">
  <item name="android:windowBackground">@drawable/splashscreen_logo</item>
</style>
```

Os ícones do lançador saem em `mipmap-{m,h,x,xx,xxx}dpi` como `.webp`
(`ic_launcher`, `ic_launcher_round`, `ic_launcher_foreground`,
`ic_launcher_background`, `ic_launcher_monochrome`), com os XML adaptativos em
`mipmap-anydpi-v26/`.

---

### 27.12 `src/config/releases.ts` — como uma versão anuncia o que mudou

#### 27.12.1 O tipo e a regra

```ts
export type Release = {
  /** Not the app version - the version of *this notice*. */
  version: string;
  date: string;
  lines: string[];
};
```

(`src/config/releases.ts:13-18`). O comentário é a coisa mais importante do
arquivo: **`version` aqui não é a versão do aplicativo, é a versão do aviso.**

A regra do briefing, escrita no docblock (`src/config/releases.ts:1-12`): no
máximo três linhas, nunca mostradas duas vezes. "Uma atualização que chega
silenciosa é boa engenharia; uma atualização que chega silenciosa e muda o que um
botão faz é uma traição. Três linhas é o orçamento porque a quarta nunca é lida."

Subir `version` quando um release merece menção; deixar como está significa que a
atualização sobe sem aviso — "que é a resposta certa para uma correção de bug que
ninguém estava esperando" (`:9-11`).

#### 27.12.2 O conteúdo atual, textual

```ts
export const latestRelease: Release = {
  version: '2026.09.01',
  date: '2026-09-01',
  lines: [
    'O custo de cada produto agora se recalcula sozinho quando você lança uma nota de compra.',
    'Você pode perguntar em português: toque em "Pergunte" e escreva o que quer saber.',
    'Em Ajustes dá para apagar os dados de exemplo, por área ou de uma vez.',
  ],
};
```

(`src/config/releases.ts:20-28`). Três linhas em português, em segunda pessoa,
sem jargão.

#### 27.12.3 A regra é imposta em código, não confiada ao editor

```ts
export function releaseLines(release: Release = latestRelease): string[] {
  return release.lines.slice(0, 3);
}
```

(`src/config/releases.ts:31-33`). Comentário: "A regra é imposta aqui, não deixada
para quem editar a lista depois" (`:30`).

#### 27.12.4 `WhatsNew` — a metade honesta de uma atualização silenciosa

**Estado: implementado e chamado por tela.** `app/_layout.tsx:9` importa e
`app/_layout.tsx:114` renderiza `<WhatsNew />`.

A chave de armazenamento é `` `${brand.slug}:release-seen` `` — literalmente
`norva:release-seen` (`src/components/WhatsNew.tsx:10`).

Comportamento, linha a linha (`src/components/WhatsNew.tsx:31-59`):

| Leitura de `norva:release-seen` | O que acontece |
|---|---|
| igual a `latestRelease.version` | não abre nada (`:36`) |
| `null` (primeira instalação) | **grava a versão atual como já vista, em silêncio, e não mostra nada** (`:42-45`) |
| qualquer outro valor | abre a folha (`setVisible(true)`, `:47`) |

A razão do caso `null` está escrita: "Nada foi atualizado numa primeira
instalação, e dizer isso seria a primeira frase do app para alguém que ainda não
decidiu confiar nele" (`:38-41`).

Falhas de armazenamento são engolidas de propósito (`.catch(() => undefined)` em
`:43`, `:49`, `:58`): "se a chave não puder ser lida, o pior caso é mostrar o
aviso duas vezes; recusar abrir o app por causa de uma preferência faltando seria
muito pior" (`:21-23`).

A folha é um `Modal` `transparent` com `animationType="slide"`, fechável pelo
fundo (`Pressable` com `accessibilityLabel="Fechar"`, `:63`), pelo botão, ou pelo
gesto de voltar (`onRequestClose={dismiss}`, `:62`). Cada linha ganha um marcador
de 6×6 na cor de acento (`:85`, `styles.bullet` em `:117`).

Os textos vêm do dicionário, nos três idiomas:

| Chave | pt-BR | es | en |
|---|---|---|---|
| `app.whatsNew.title` | `Novidades` | `Novedades` | `What's new` |
| `app.whatsNew.subtitle` | `O aplicativo se atualizou sozinho. Isto é o que mudou.` | `La aplicación se actualizó sola. Esto es lo que cambió.` | `The app updated itself. Here is what changed.` |
| `app.whatsNew.dismiss` | `Entendi` | `Entendido` | `Got it` |

(`src/i18n/locales/pt-BR.ts:52-56`, `src/i18n/locales/es.ts:38-42`,
`src/i18n/locales/en.ts:33-37`).

**As três linhas do release, porém, moram em português dentro de
`releases.ts:24-26` — não passam pelo dicionário.** Um usuário com o app em
espanhol vê o título e o botão traduzidos e as três linhas em português.

---

### 27.13 `src/config/brand.ts`

Fonte única da identidade. O docblock diz por que ela existe assim
(`src/config/brand.ts:1-9`): a marca ainda espera busca de anterioridade no INPI
(classes 9 e 42), que não é automatizável — o INPI exige login gov.br e a base
Global Brand da WIPO tem CAPTCHA. Para essa incerteza não travar a engenharia,
**nada mais no código chumba o nome**: trocar de marca é editar este arquivo mais
o `app.json`.

| Campo | Valor | Papel | Linha |
|---|---|---|---|
| `name` | `'NORVA'` | Nome de exibição. Mostrado ao usuário, **nunca traduzido** | `:12` |
| `slug` | `'norva'` | Identificador minúsculo para chaves de armazenamento, deep links e analytics | `:15` |
| `scheme` | `'norva'` | Esquema de deep link. **Tem que casar com `expo.scheme` no `app.json`** | `:18` |
| `markPath` | `'M50,50 L70.3,11 A44,44 0 1,1 29.7,11 Z'` | A marca: um disco sólido com uma cunha de 55° apontando para o norte, num viewBox de 100×100 | `:25` |
| `markColorLight` | `'#2E2B27'` | Grafite, no tema claro | `:32` |
| `markColorDark` | `'#EDEBE7'` | No tema escuro | `:33` |

O objeto é `as const` (`:34`) e o tipo derivado é `export type Brand = typeof
brand` (`:36`).

A razão do grafite está escrita (`:27-31`): a interface carrega oito cores de
ambiente, uma por área, e uma marca colorida brigaria com todas; grafite senta em
qualquer uma delas **e imprime numa etiqueta térmica monocromática — a impressora
do chão de fábrica**.

Chamadores (**todos implementados e chamados por tela**):

| Onde | O quê | Linha |
|---|---|---|
| `src/components/Mark.tsx` | `<Path d={brand.markPath} fill={fill} />`, com a tinta escolhida por esquema | `:20`, `:24` |
| `src/components/WhatsNew.tsx` | a chave `norva:release-seen` | `:10` |
| `src/components/Crash.tsx` | `{brand.name} · {error.name}: {error.message}` | `:83` |
| `app/settings.tsx` | `` overline={`${brand.name} · ${Constants.expoConfig?.version ?? '—'}`} `` | `:414` |
| `app/(tabs)/index.tsx` | `<CollapsingHeader title={brand.name} ...>` | `:344` |
| `scripts/icons.mjs` | lê `markPath` e `markColorLight` do arquivo por regex | `:29-36` |

---

### 27.14 `.claude/settings.json`

Configuração do ambiente de trabalho, não do produto. Fica no repositório;
`.claude/settings.local.json` está no `.gitignore` ("Claude Code personal
overrides (never commit)").

| Bloco | Conteúdo |
|---|---|
| `permissions.defaultMode` | `bypassPermissions` (`.claude/settings.json:3`) |
| `permissions.allow` | 41 entradas, incluindo `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `Task`, `Skill`, e os servidores MCP `mcp__github`, `mcp__Vercel`, `mcp__Expo`, `mcp__Supabase`, `mcp__Claude_Code_Remote`, `mcp__Figma` (`:4-45`) |
| `permissions.deny` | 34 entradas de servidores MCP (`:46-80`) |
| `deniedMcpServers` | 45 entradas por nome de servidor, com as variantes de grafia (`Booking.com` e `Booking_com`, `Mermaid Chart` e `Mermaid_Chart`) (`:133-269`) |
| `skillOverrides` | 27 skills desligadas (`docx`, `pptx`, `xlsx`, `pdf`, `canvas-design`, `dataviz`, `design`, `artifact-*`, `init`, …) (`:105-132`) |

Nota: `mcp__GoDaddy` aparece **nas duas listas** — em `allow` (`:44`) e em `deny`
(`:57`). `mcp__GitHub` (com G maiúsculo) está em `deny` (`:79`) enquanto
`mcp__github` (minúsculo) está em `allow` (`:37`).

Dois hooks:

1. **`SessionEnd`** (`:83-92`):
   ```
   [ -n "$NORVA_INSIGHTS_CHILD" ] || NORVA_INSIGHTS_CHILD=1 claude -p '/insights' >> "$HOME/.claude/insights-auto.log" 2>&1 &
   ```
   Dispara o relatório de insights ao fim da sessão, com uma variável de guarda
   para não recursar.

2. **`PreToolUse` com `matcher: "Bash"`** (`:93-103`):
   ```
   bash .proofgate/hooks/push-guard.sh
   ```

#### 27.14.1 O `push-guard`

`.proofgate/hooks/push-guard.sh` recusa `git push` enquanto não houver veredito
**fresco e passante** para o HEAD atual (`:2-3`).

Por que é hook de `PreToolUse` e não hook do git: "o adversário aqui é o AGENTE,
e um hook `pre-push` do git é trivialmente pulado com `git push --no-verify`" —
falha real e reportada, `anthropics/claude-code#40117` (`:5-8`). O hook vê o
comando cru antes do git, então `--no-verify` não passa, e a tentativa de burla é
sinalizada explicitamente.

Contrato: lê o JSON do evento em stdin; `exit 0` permite, `exit 2` bloqueia e
devolve o stderr ao agente. **É fail-open por construção**: qualquer erro de
parse, ferramenta ausente ou estado inesperado termina em `exit 0` — "um guard
quebrado nunca pode travar o agente" (`:11-14`).

Saídas de emergência: `PROOFGATE_HOOK_OFF=1` (variável de ambiente) ou
`"pushGuard": false` no `proofgate.json` (`:16`).

Pré-filtro barato: o hook dispara em **toda** chamada de Bash, então ele sai
imediatamente se o payload não contém a palavra `push` (`:22`). O parser de JSON
tem três candidatos em cascata: `jq`, depois `python3`, depois `node`; sem
nenhum, fail-open (`:29-39`). A detecção de `git push` aceita flags globais entre
`git` e `push` (`:44`).

---

### 27.15 O que está pendente no empacotamento

#### 27.15.1 Splash — ainda é o andaime do Expo

Três fatos, verificados:

1. **`app.json` não tem chave `splash`** e não lista `expo-splash-screen` em
   `plugins` (`app.json:31-36`). O pacote também não está em `package.json` nem
   no lockfile.
2. **`android/app/src/main/res/values/colors.xml` traz
   `splashscreen_background = #FFFFFF`** — branco puro, não o `#FAF7F2` que é o
   papel do produto (`app.json:19`, `scripts/icons.mjs:154-159`).
3. **Os `splashscreen_logo.png` gerados são o placeholder do scaffold do Expo**:
   um desenho de círculos concêntricos sobre uma grade de linhas-guia de
   construção, em cinza claro. Verificado abrindo
   `android/app/src/main/res/drawable-mdpi/splashscreen_logo.png` (288×288; há
   também 432, 576, 864 e 1152 nas outras densidades). Não é a marca do NORVA.

`assets/splash-icon.png` — o disco com a cunha, 1024×1024, `fracao: 0.50` — é
**gerado por `scripts/icons.mjs:158` e nunca referenciado**. O ícone do lançador
já foi consertado (o `assets/icon.png` de hoje é a marca sobre `#FAF7F2`,
confirmado visualmente); a tela de abertura não.

Isto é exatamente a falha que o docblock do `icons.mjs` descreve tendo consertado
para o ícone: o `brand.ts` promete que "toda superfície — splash, ícone,
cabeçalho, impressão — desenha a mesmíssima geometria"
(`src/config/brand.ts:22-23`), e a promessa segue **falsa para o splash**.

**Estado: NÃO IMPLEMENTADO.**

#### 27.15.2 `versionCode` — resolvido, mas fora do `app.json`

O `app.json` continua sem `android.versionCode` (`app.json:15-25`). O número é
produzido por `sed` dentro do workflow (`build-apk.yml:188-204`), o que significa:

- quem compilar localmente com `./gradlew assembleRelease` sem passar por esse
  passo produz um APK com **`versionCode 1`**, porque é isso que o
  `expo prebuild` escreve quando o `app.json` não declara nada
  (`build-apk.yml:167-170`);
- a única rede é o `src/release.test.ts:35-55`, que garante que a **fórmula**
  continua monótona, não que ela foi aplicada.

#### 27.15.3 Assinatura — pendente

`android/app/build.gradle:112-115`: o `buildTypes.release` usa
`signingConfigs.debug`. Não existe keystore de produção, nem no repositório
(bloqueado por `.gitignore`) nem injetado por workflow. O `apksigner verify`
confere que **há** assinatura, não **qual** (`build-apk.yml:216-220`).

Consequência prática já documentada nas notas de release: um APK assinado com
outra chave não instala por cima, e desinstalar apaga os dados
(`build-apk.yml:319-321`). Uma vez publicado na Play Store com uma chave, trocar
de chave é irreversível sem Play App Signing.

**Estado: NÃO IMPLEMENTADO.**

#### 27.15.4 O que o README lista como pendência humana

Quatro itens (`README.md:167-172`):

- **Registro formal da marca no INPI** — a busca prévia foi feita e voltou verde
  para o Brasil; o depósito é ato do titular, e a consulta não é automatizável
  (login gov.br, CAPTCHA da WIPO).
- **Projeto Supabase** — "as migrações estão prontas; aplicá-las exige uma conta".
  O README também diz, na árvore do projeto, que `supabase/migrations/` é
  "esquema versionado (não aplicado a nenhum projeto)" (`README.md:154`).
- **Conta Expo/EAS** para build e atualização OTA.
- **Domínio.**

#### 27.15.5 Contagens desatualizadas nos comentários da barra

Os números escritos nos arquivos e os números medidos hoje não batem. Nada disso
quebra nada — mas quem reconstruir precisa saber que os comentários envelhecem:

| Onde | Diz | É |
|---|---|---|
| `ci.yml:67` | "Nineteen guards" | 25 guards em `.proofgate/guards.d/` |
| `ci.yml:121` | "Six guarantees" | 13 checks em `scripts/verify-migrations.sh` |
| `CLAUDE.md` (tabela de tempos) | "`mutate` (64 mutações)" | 106 defeitos em `scripts/mutate.mjs` |
| `CLAUDE.md` (tabela de tempos) | "`e2e` (30 checagens)" | 36 `check(...)` em `e2e/flow.mjs` |
| `e2e/flow.mjs:1978` | "trinta e cinco checagens afirmam texto em português" | 36 checagens no total |
| `scripts/device-session.ts:14` | saída vai "para `scripts/verify-sync.sh`" | esse arquivo não existe; quem consome é `scripts/verify-migrations.sh` |

#### 27.15.6 Histórico de versões publicadas

O `app.json` já passou por dez versões, cada uma num commit próprio:

| Versão | Commit | Assunto do commit |
|---|---|---|
| `0.3.0` | `50e7ebe` | "Versão 0.3.0, e um release que carrega um instalador só" |
| `0.4.0` | `de44357` | "Versão 0.4.0: o app passa a ser o desenho" |
| `0.5.0` | `f1f9237` | "Versão 0.5.0: as três ausências da prancha estão preenchidas" |
| `0.6.0` | `fbdf4b1` | "Versão 0.6.0: o APK que dá para avaliar" |
| `0.7.0` | `7bf3082` | "Versão 0.7.0, para o APK novo não colidir com o release de ontem" |
| `0.8.0` | `c32f96f` | "Versão 0.8.0: o instalador da reescrita visual e da varredura de rótulos" |
| `0.9.0` | `380658f` | "O caminho de publicação que ninguém usa continuava armado" |
| `0.10.0` | `8dd3303` | "Versão 0.10.0, e a espera fixa do navegador virou detector de assentamento" |

O `build-apk.yml` publicou de `0.2.0` a `0.8.0`, sete vezes, segundo a mensagem
de `380658f`. As tags têm o formato `apk-<versão>` (`build-apk.yml:281`), sempre
marcadas como `--prerelease` (`:294`).
