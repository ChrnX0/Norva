## 35. Índice do repositório: cada arquivo e o que ele era

Mapa mecânico de todo arquivo de código do repositório, agrupado por diretório, com a
primeira linha de comentário de cada um. Não substitui as seções anteriores — serve para
achar depressa onde uma coisa morava, e para conferir se o dossiê deixou algo de fora.
Uma célula vazia significa arquivo sem comentário de abertura.

> A contagem de linhas desta tabela já esteve **uma acima** em todas as 223 entradas:
> `split('\n')` num arquivo terminado em nova linha devolve um elemento vazio no fim.
> O erro era invisível por ser uniforme — só apareceu quando um crítico comparou
> `money.ts` aqui (101) com a mesma contagem na seção 3 (100).

### `(raiz)/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `babel.config.js` | 11 | Reanimated's worklets plugin has to be last in the list. Without it the |
| `eslint.config.js` | 10 | https://docs.expo.dev/guides/using-eslint/ |
| `metro.config.js` | 12 | Metro's defaults, plus the two things this app needs on the web. |

### `.proofgate/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `lib.sh` | 189 | ProofGate shared library — sourced by verify.sh AND by any guard that needs to |
| `verify.sh` | 332 | ProofGate — the MECHANICAL gate. The half of the checklist a machine checks |

### `.proofgate/guards.d/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `10-secrets.sh` | 46 | Guard: secrets added in the diff (API keys, tokens, private keys). |
| `12-merge-markers.sh` | 17 | Guard: unresolved merge-conflict markers committed into the diff. |
| `15-tls-off.sh` | 29 | Guard: TLS/certificate verification disabled in the diff. |
| `20-pii-logging.sh` | 24 | Guard: PII flowing into logs/telemetry in ADDED lines. |
| `25-silent-catch.sh` | 18 | Guard: an error swallowed on the same line it is caught. |
| `30-untested-changes.sh` | 22 | Guard: source changed, zero test files changed. |
| `35-dependency-change.sh` | 80 | Guard: a dependency manifest changed but its lockfile did not. |
| `40-env-drift.sh` | 31 | Guard: env-var drift — code now reads a variable that .env.example doesn't declare. |
| `45-broad-process-kill.sh` | 26 | Guard: killing processes by name pattern instead of by PID. |
| `47-unquoted-globstar.sh` | 35 | Guard: a `**` glob left unquoted inside an npm/yarn script. |
| `48-pipeline-exit-code.sh` | 48 | Guard: reading `$?` after a pipeline, in a script without `set -o pipefail`. |
| `50-coupled-files.sh` | 29 | Guard: coupled files — pairs that must change together (ORM schema ↔ SQL mirror, |
| `55-skipped-tests.sh` | 17 | Guard: a test disabled in the diff. |
| `58-frozen-clock.sh` | 27 | Guard: a test that reads the real wall clock. |
| `60-large-files.sh` | 26 | Guard: large files entering the repo. A 40MB "quick test video" committed by |
| `65-type-suppressions.sh` | 18 | Guard: a type/lint/security check silenced in the diff. |
| `70-debug-leftovers.sh` | 27 | Guard: debug leftovers in the diff. |
| `75-machine-paths.sh` | 24 | Guard: a hard-coded local machine path in the diff. |
| `85-float-money.sh` | 25 | Guard: money handled as a floating-point number. |
| `90-sql-concat.sh` | 43 | Guard: a SQL statement built by string concatenation / interpolation. |
| `92-superuser-verification.sh` | 47 | Guard: a verification script that reaches Postgres as a superuser, in a repo |
| `95-schema-constraint-no-migration.sh` | 50 | Guard: a constraint added to an existing table's CREATE TABLE, with no migration. |
| `96-version-bump-no-release.sh` | 69 | Guard: a version was bumped in a manifest, but nothing in the delivery cuts a release. |
| `97-migration-edited.sh` | 37 | Guard: a migration step that already exists being edited instead of appended. |
| `99-dead-allow.sh` | 36 | Guard: a `proofgate-allow` marker that suppresses nothing. |

### `.proofgate/hooks/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `push-guard.sh` | 78 | ProofGate push-guard — a PreToolUse(Bash) hook that refuses `git push` unless a |

### `app/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `_layout.tsx` | 127 | Expo Router renders this instead of the screen when a render throws. |
| `assistant.tsx` | 326 | Modo Conversa. |
| `catalog.tsx` | 351 | A grade do que você fabrica: linha, tipo e sabor. |
| `losses.tsx` | 218 | Onde o dinheiro que some está indo. |
| `places.tsx` | 719 | Onde está o que você tem. |
| `purchase.tsx` | 495 | Entering an invoice - the most valuable screen in the app per keystroke. |
| `settings.tsx` | 1148 | Ajustes: a cara do aplicativo, as peças da capa, os avisos, e o que apaga. |
| `transfer.tsx` | 622 | O que sai da fábrica e chega na loja. |
| `weather.tsx` | 198 | Onde fica a fábrica — a única pergunta que o clima precisa fazer. |

### `app/(tabs)/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `_layout.tsx` | 148 | The five places the app has. |
| `index.tsx` | 349 | Qual desenho da capa está no ar. |
| `more.tsx` | 179 | As gavetas: o que se abre uma vez por mês, não uma vez por turno. |
| `production.tsx` | 363 | O dia de produção — e o botão que o alimenta. |
| `reports.tsx` | 215 | Os três resumos, e cada um já diz o titular dele. |
| `transport.tsx` | 265 | Where today's load went, and whether anybody opened it. |

### `app/inputs/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `[id].tsx` | 839 | One input, and everything the ledger already knows about it. |
| `index.tsx` | 413 | Everything you buy. |
| `new.tsx` | 518 | Registering an input. |

### `app/lots/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `[id].tsx` | 321 | A etiqueta do lote, na tela, do tamanho em que ela vai para o papel. |

### `app/orders/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `index.tsx` | 222 | O que os clientes pediram e ainda não foi entregue. |
| `new.tsx` | 499 | Anotar o que um cliente pediu. |

### `app/production/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `new.tsx` | 641 | Lançar o que foi produzido. |

### `app/products/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `index.tsx` | 208 | O que sai da fábrica para vender. |
| `new.tsx` | 822 | Registering a product. |

### `app/recipes/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `[id].tsx` | 635 | The recipe editor - the screen the whole product is built to make possible. |
| `index.tsx` | 251 | The recipe book. |

### `docs/esbocos/gerador/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `gerar.py` | 200 | -*- coding: utf-8 -*- |
| `pecas.py` | 110 | -*- coding: utf-8 -*- |

### `e2e/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `flow.mjs` | 2037 | The app, driven the way a person drives it. |

### `scripts/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `device-session.ts` | 383 | Runs a real session on a real device database, then prints its outbox as SQL |
| `dossie.mjs` | 62 | Monta `docs/DOSSIE.md` a partir das seções de `docs/dossie/`. |
| `e2e-parallel.mjs` | 92 | A suíte do navegador em quatro frentes, com um export só. |
| `folha.mjs` | 72 | A folha de contato das telas: muitas fotos numa imagem só, para comparar. |
| `icons.mjs` | 169 | Os ícones do lançador, desenhados a partir da MESMA geometria da marca. |
| `manifesto.mjs` | 100 | Quando o pacote precisa ser exportado com o cache limpo. |
| `mutate.mjs` | 1238 | Asks the only question a green suite cannot answer on its own: would these |
| `shot.mjs` | 316 | Tira foto da tela, para alguém poder OLHAR. |
| `verify-migrations.sh` | 886 | Runs the migrations against a throwaway Postgres and checks that the |

### `src/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `bar.test.ts` | 175 | Todo número que o projeto afirma sobre si mesmo, conferido contra o sistema. |
| `dictionary.test.ts` | 89 | Toda seção do dicionário tem quem a leia — ou um motivo escrito. |
| `language.test.ts` | 145 | A mesma língua visual em todas as telas. |
| `law.test.ts` | 175 | Lei da Inteligência, item 3: nenhum número aparece sozinho. |
| `layers.test.ts` | 542 | Where SQL is allowed to live, pinned. |
| `release.test.ts` | 55 | O que sai no instalador, conferido aqui em vez de na memória de quem publica. |
| `selectors.test.ts` | 153 | O e2e procura a tela pelo texto, e o texto vem do dicionário. |

### `src/assistant/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `assistant.test.ts` | 789 | The assistant is the part of this app most able to destroy trust, because it |
| `index.ts` | 85 | The assistant speaks Portuguese only, and that is a boundary rather than an |
| `skills.ts` | 1100 | What the assistant knows in phase 1. |
| `text.ts` | 107 | The small amount of language handling the offline assistant needs. |
| `types.ts` | 175 | The assistant, as a contract. |

### `src/components/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Alive.tsx` | 87 | O desenho respira, como a cena da fábrica respira. |
| `Bars.tsx` | 109 | O ritmo da semana, em sete colunas. |
| `Button.tsx` | 143 | The primary action. |
| `Card.tsx` | 186 | Transparência em cima de uma cor sólida, escrita como o RN entende. |
| `Chip.tsx` | 96 | A state chip. |
| `CollapsingHeader.tsx` | 144 | The large title that shrinks as you scroll - the most recognizable part of |
| `confirm.test.ts` | 63 | A guard for the bug that cost an evening: `Alert` does nothing on the web. |
| `Confirm.tsx` | 203 | The app's own confirmation, replacing `Alert.alert`. |
| `CountUp.tsx` | 63 | A number that counts up to its value instead of appearing finished. |
| `Crash.tsx` | 96 | What the person sees when something breaks. |
| `Drain.tsx` | 69 | Quanto ainda resta, como uma barra que ENCHE até onde deveria estar. |
| `FactoryScene.tsx` | 236 | A fábrica desenhada — e viva porque a fábrica está viva. |
| `Field.tsx` | 88 | A labelled input. |
| `Glyph.tsx` | 448 | Os desenhos gordos — os que aguentam ser o assunto do cartão. |
| `icons.tsx` | 147 | The icons the design draws, and nothing else. |
| `Landscape.tsx` | 194 | A paisagem do Orgânico — e ela é a previsão, não um desenho bonito. |
| `ListRow.tsx` | 119 | A row in a list of things. |
| `Mark.tsx` | 27 | The mark: a solid disc with a 55-degree notch pointing north. |
| `PulseDot.tsx` | 95 | The "this is live" pulse: a slow halo expanding out of a dot. |
| `QrCode.tsx` | 29 | O QR desenhado, e desenhado do jeito que a câmara fria pede. |
| `Reveal.tsx` | 77 | O cartão entra em cena em vez de já estar lá. |
| `Sky.tsx` | 263 | O dia, desenhado — e por que ele deixou de ser um bloco. |
| `Sparkline.tsx` | 123 | A linha de uma série, desenhada como se alguém tivesse acabado de traçá-la. |
| `Touchable.tsx` | 54 | O cartão que responde ao dedo. |
| `UnitStepper.tsx` | 190 | Quantity entry, in the operator's own words. |
| `WhatsNew.tsx` | 119 | The honest half of a silent update. |
| `WhySheet.tsx` | 153 | The sheet behind every `[por quê?]`. |

### `src/config/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `brand.ts` | 36 | Single source of truth for the product's brand identity. |
| `releases.ts` | 33 | What changed, in the words of someone who runs a factory. |

### `src/data/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `assistantData.ts` | 73 | The assistant, wired to the real database. |
| `db.test.ts` | 157 | The one path every phone takes on first launch, and the one no test touched. |
| `db.ts` | 851 | The on-device database. |
| `erase.test.ts` | 307 | Erasing is the one operation with no undo, so its rules are worth pinning |
| `erase.ts` | 277 | Erasing data, as rules rather than as SQL. |
| `meta.ts` | 53 | O bloco de anotações do aparelho: chave e valor, e nada mais. |
| `outbox.test.ts` | 71 | A lista de tabelas da fila, conferida contra o código e contra o esquema. |
| `outbox.ts` | 216 | The queue that makes a phone with no signal safe to write to. |
| `repository.test.ts` | 3400 | The data layer against a real database. |
| `repository.ts` | 4525 | Every query the app needs, in one place. |
| `schema.test.ts` | 141 | The guard for the one architectural mistake this project has actually made. |
| `seed.ts` | 218 | The company this device belongs to. |
| `simulate.test.ts` | 122 | A quinzena simulada, conferida como fato e não como enfeite. |
| `simulate.ts` | 200 | Two weeks of a factory that exists, written through the real front door. |
| `useQuery.ts` | 92 | Reading from the device database, with the two states a screen actually has |

### `src/domain/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `access.test.ts` | 95 | The role table, pinned - because the absences are the product decision. |
| `access.ts` | 148 | Who may do what. |
| `agreement.test.ts` | 58 | Um domingo qualquer, pedido ao Date: se esta conta e a do JavaScript |
| `agreement.ts` | 64 | O que foi combinado com uma loja, na parte que o sistema consegue usar. |
| `alerts.test.ts` | 275 | Lei 4. Polpa que acaba em dois dias, com três dias de antecedência |
| `alerts.ts` | 352 | Quando o aplicativo avisa, e quando ele cala. |
| `briefing.test.ts` | 70 | A ordem da empresa manda, e o que ela não ordenou entra no fim - na ordem |
| `briefing.ts` | 127 | Quais peças a capa mostra, e em que ordem. |
| `cost.test.ts` | 131 | The three exports the audit found with no caller and no test. |
| `cost.ts` | 240 | Moving weighted average cost. |
| `day.test.ts` | 111 | 03:00 UTC on the 1st is midnight in São Paulo - the very start of the 1st. |
| `day.ts` | 160 | The factory's day, as a window the ledger can be asked about. |
| `ledger.test.ts` | 24 | A única conta deste módulo que o aplicativo roda. |
| `ledger.ts` | 175 | The movement ledger - the foundation everything else sits on. |
| `lot.test.ts` | 42 | Ordenar como texto tem que dar a ordem do tempo: é assim que a lista de |
| `lot.ts` | 72 | O lote: o pedaço de produção que se rastreia junto. |
| `measure.test.ts` | 33 | A bucket has no size printed on it. |
| `measure.ts` | 54 | Reading a quantity out of the way somebody writes a package. |
| `money.test.ts` | 121 | The one place rounding happens, pinned. |
| `money.ts` | 100 | Money is integer cents. Never a float — 0.1 + 0.2 is not 0.3, and a system |
| `number.test.ts` | 62 | The invoice that started this: four buckets of pulp, R$ 118,50 apiece. On |
| `number.ts` | 90 | Reading a number the way a person typed it, and writing one back so that |
| `picking.test.ts` | 66 | As duas fontes DISCORDANDO é o único caso que prova a ordem: com uma delas |
| `picking.ts` | 64 | De onde vem o número que a tela de transferência já traz preenchido. |
| `pipeline.test.ts` | 297 | The chain the whole product rests on: an invoice moves the average, the |
| `qr.test.ts` | 90 | Versão 1: 21 por 21, a menor grade que o padrão define. Numa etiqueta de |
| `qr.ts` | 76 | O quadrado preto e branco que a câmara fria precisa ler. |
| `recipe.test.ts` | 518 | Rates, not amounts: price per purchase unit divided by base units in it. |
| `recipe.ts` | 392 | The recipe engine - where the product's central promise lives. |
| `spark.test.ts` | 67 | O maior valor fica no TOPO: y cresce para baixo em SVG, e trocar isso |
| `spark.ts` | 96 | A linha de uma série, como caminho SVG — geometria pura, sem tela. |
| `units.test.ts` | 87 | The packaging invariant, which was written down and never run. |
| `units.ts` | 109 | Packaging hierarchy. |

### `src/home/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Mosaic.tsx` | 923 | Mosaico: uma manchete grande e peças pequenas embaixo. |
| `Peca.tsx` | 160 | Um widget da capa que abre no lugar. |
| `types.ts` | 68 | O que a capa sabe, separado de como ela desenha. |

### `src/i18n/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `company.ts` | 68 | A moeda que a fábrica cobra, e o jeito de escrever número que vem com ela. |
| `device.ts` | 49 | Which language the phone is asking for. |
| `i18n.test.ts` | 191 | Os três dicionários, conferidos um contra o outro. |
| `index.ts` | 265 | Currency is a property of the company, not of the phone. A Brazilian factory |
| `Locale.tsx` | 115 | O idioma e a moeda da EMPRESA, escolhidos uma vez e obedecidos por toda tela. |
| `useLocale.ts` | 25 | One place that decides which language the interface speaks. |

### `src/i18n/locales/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `en.ts` | 1050 |  |
| `es.ts` | 1056 | Spanish. The largest market available to this positioning: research across |
| `pt-BR.ts` | 1178 | Portuguese (Brazil) - the source language. |

### `src/notify/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Alerts.tsx` | 41 | Quem manda reagendar os avisos: uma vez, quando o aplicativo abre. |
| `facts.test.ts` | 206 | Os fatos que alimentam o alarme, contra um banco de verdade. |
| `facts.ts` | 126 | Os fatos que alimentam o alarme, separados do adaptador de propósito. |
| `index.ts` | 112 | O aviso saindo do aplicativo para o sistema operacional. |
| `phrase.test.ts` | 96 | `{{subject}}` na tela de bloqueio é um defeito que nenhuma outra rede pega: |
| `phrase.ts` | 51 | A frase de um aviso, como função pura. |

### `src/sync/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `agreement.test.ts` | 436 | The two schemas, checked against each other by reading both. |
| `columns.test.ts` | 123 | Toda coluna do aparelho ou atravessa, ou está escrita como sendo só daqui. |
| `engine.ts` | 124 | Sending what the phone wrote while it was alone. |
| `serialize.test.ts` | 159 | The crossing between SQLite and Postgres, checked without either. |
| `serialize.ts` | 407 | The one place a device row becomes something the server accepts. |
| `sync.test.ts` | 241 | The queue and the engine, against a real database and a fake server. |

### `src/theme/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Appearance.tsx` | 136 | Qual das duas caras o aplicativo está usando. |
| `contrast.test.ts` | 132 | O texto pequeno tem de ser legível no corredor da câmara, com luva e |
| `scheme.test.ts` | 47 | A luz da tela: o que a escolha decide e o que o aparelho decide. |
| `scheme.ts` | 57 | Claro, escuro, ou o que o aparelho disser. |
| `ThemeProvider.tsx` | 118 | A paleta inteira, para quem precisa de um tom que não é o da área. |
| `tokens.ts` | 400 | Design tokens. |

### `src/types/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `qrcode-core.d.ts` | 22 | O encoder puro do `qrcode`, sem o resto da biblioteca. |

### `src/weather/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `index.ts` | 251 | O clima — que numa fábrica de sorvete é informação de negócio, não enfeite. |
| `live.ts` | 59 | O clima ligado no aparelho de verdade: rede com prazo, cache no `app_meta`. |
| `weather.test.ts` | 210 | O clima é a primeira coisa neste aplicativo que depende de rede, e é por isso |

### `supabase/migrations/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `0001_foundation.sql` | 339 | ============================================================================= |
| `0002_recipes.sql` | 273 | ============================================================================= |
| `0003_base_unit.sql` | 22 | ============================================================================= |
| `0004_harden.sql` | 61 | ============================================================================= |
| `0005_revoke_public_execute.sql` | 30 | ============================================================================= |
| `0006_private_helpers.sql` | 45 | ============================================================================= |
| `0007_movement_kind_purchase.sql` | 16 | The ledger had no word for the one movement phase 1 actually makes. |
| `0008_ledger_speaks_phase_one.sql` | 92 | Three more things the server would have refused from the phone. |
| `0009_average_asks_the_ledger.sql` | 75 | The server kept the same forbidden column the device did. |
| `0010_what_the_device_actually_sends.sql` | 28 | Two columns the device has been writing with nowhere to put them. |
| `0011_joining_a_company.sql` | 68 | Entrar numa empresa passa a ter dois caminhos, e um deles precisa de espera. |
| `0012_who_or_where.sql` | 25 | O relatório operacional nomeia a pessoa, ou o lugar? |
| `0013_the_device_is_accountable.sql` | 67 | O aparelho vira coisa cadastrada, com um responsável. |
| `0014_who_was_holding_it.sql` | 31 | Quem estava operando naquele momento, anotado no registro. |
| `0015_the_phone_will_send_it_twice.sql` | 35 | O aparelho reenvia a fila, e o servidor precisa aguentar isso. |
| `0016_the_act_and_its_lines.sql` | 35 | O que amarra as linhas de um mesmo ato. |
| `0017_a_check_that_matched_is_a_fact.sql` | 26 | A conferência que bateu também é um fato, e o esquema a recusava. |
| `0018_a_product_has_a_family.sql` | 138 | 0018 - Um produto tem família, tipo e sabor |
| `0019_an_order_is_demand.sql` | 187 | 0019 - Um pedido é demanda, e demanda não é livro-razão |
| `0020_a_lot_and_the_day_it_dies.sql` | 42 | A validade mora no produto, e o lote é quem a carrega. |
| `0021_what_was_agreed_with_the_store.sql` | 22 | A ficha de acordo da loja. |
| `0022_the_stick_leaves_the_storeroom.sql` | 29 | O palito sai do estoque. |
| `0023_the_ruler_that_turns_a_balance_into_a_judgement.sql` | 16 | O nível cheio de um item. |
| `0024_a_reading_is_a_fact_like_any_other.sql` | 75 | A leitura de uma grandeza num lugar. |
| `0025_what_the_kettle_makes_is_worth_something.sql` | 86 | O produto fabricado não tinha custo, dos dois lados, e o dinheiro sumia. |
| `0026_which_sheet_made_this_one.sql` | 30 | O lote passa a dizer QUAL FICHA rodou. |
| `0027_a_resend_is_not_a_decision.sql` | 95 | O pedido precisa poder ser REENVIADO, e reenviar não é decidir. |
| `0028_the_index_under_what_was_reversed.sql` | 31 | O índice que faltava embaixo de "o que foi estornado não aconteceu". |
| `0029_a_movement_cannot_point_at_another_company.sql` | 46 | O livro-razão aceitava item e local de OUTRA empresa. |
| `0030_the_default_room_is_bookkeeping_not_a_privilege.sql` | 65 | Quarta aparição da fila travada, e a forma é nova outra vez. |
| `0031_a_reading_can_be_sent_twice.sql` | 73 | A leitura da câmara precisa poder ser REENVIADA, e reenviar não é anotar de novo. |
| `0032_who_ordered_it_never_changes.sql` | 48 | Quem anotou o pedido nunca muda, nem para quem aprova. |
