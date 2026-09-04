## 35. Índice do repositório: cada arquivo e o que ele era

Mapa mecânico de todo arquivo de código do repositório, agrupado por diretório, com a
primeira linha de comentário de cada um. Não substitui as seções anteriores — serve para
achar depressa onde uma coisa morava, e para conferir se o dossiê deixou algo de fora.
Uma célula vazia significa arquivo sem comentário de abertura.

### `(raiz)/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `babel.config.js` | 12 | Reanimated's worklets plugin has to be last in the list. Without it the |
| `eslint.config.js` | 11 | https://docs.expo.dev/guides/using-eslint/ |
| `metro.config.js` | 13 | Metro's defaults, plus the two things this app needs on the web. |

### `.proofgate/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `lib.sh` | 190 | ProofGate shared library — sourced by verify.sh AND by any guard that needs to |
| `verify.sh` | 333 | ProofGate — the MECHANICAL gate. The half of the checklist a machine checks |

### `.proofgate/guards.d/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `10-secrets.sh` | 47 | Guard: secrets added in the diff (API keys, tokens, private keys). |
| `12-merge-markers.sh` | 18 | Guard: unresolved merge-conflict markers committed into the diff. |
| `15-tls-off.sh` | 30 | Guard: TLS/certificate verification disabled in the diff. |
| `20-pii-logging.sh` | 25 | Guard: PII flowing into logs/telemetry in ADDED lines. |
| `25-silent-catch.sh` | 19 | Guard: an error swallowed on the same line it is caught. |
| `30-untested-changes.sh` | 23 | Guard: source changed, zero test files changed. |
| `35-dependency-change.sh` | 81 | Guard: a dependency manifest changed but its lockfile did not. |
| `40-env-drift.sh` | 32 | Guard: env-var drift — code now reads a variable that .env.example doesn't declare. |
| `45-broad-process-kill.sh` | 27 | Guard: killing processes by name pattern instead of by PID. |
| `47-unquoted-globstar.sh` | 36 | Guard: a `**` glob left unquoted inside an npm/yarn script. |
| `48-pipeline-exit-code.sh` | 49 | Guard: reading `$?` after a pipeline, in a script without `set -o pipefail`. |
| `50-coupled-files.sh` | 30 | Guard: coupled files — pairs that must change together (ORM schema ↔ SQL mirror, |
| `55-skipped-tests.sh` | 18 | Guard: a test disabled in the diff. |
| `58-frozen-clock.sh` | 28 | Guard: a test that reads the real wall clock. |
| `60-large-files.sh` | 27 | Guard: large files entering the repo. A 40MB "quick test video" committed by |
| `65-type-suppressions.sh` | 19 | Guard: a type/lint/security check silenced in the diff. |
| `70-debug-leftovers.sh` | 28 | Guard: debug leftovers in the diff. |
| `75-machine-paths.sh` | 25 | Guard: a hard-coded local machine path in the diff. |
| `85-float-money.sh` | 26 | Guard: money handled as a floating-point number. |
| `90-sql-concat.sh` | 44 | Guard: a SQL statement built by string concatenation / interpolation. |
| `92-superuser-verification.sh` | 48 | Guard: a verification script that reaches Postgres as a superuser, in a repo |
| `95-schema-constraint-no-migration.sh` | 51 | Guard: a constraint added to an existing table's CREATE TABLE, with no migration. |
| `96-version-bump-no-release.sh` | 70 | Guard: a version was bumped in a manifest, but nothing in the delivery cuts a release. |
| `97-migration-edited.sh` | 38 | Guard: a migration step that already exists being edited instead of appended. |
| `99-dead-allow.sh` | 37 | Guard: a `proofgate-allow` marker that suppresses nothing. |

### `.proofgate/hooks/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `push-guard.sh` | 79 | ProofGate push-guard — a PreToolUse(Bash) hook that refuses `git push` unless a |

### `app/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `_layout.tsx` | 128 | Expo Router renders this instead of the screen when a render throws. |
| `assistant.tsx` | 327 | Modo Conversa. |
| `catalog.tsx` | 352 | A grade do que você fabrica: linha, tipo e sabor. |
| `losses.tsx` | 219 | Onde o dinheiro que some está indo. |
| `places.tsx` | 720 | Onde está o que você tem. |
| `purchase.tsx` | 496 | Entering an invoice - the most valuable screen in the app per keystroke. |
| `settings.tsx` | 1149 | Ajustes: a cara do aplicativo, as peças da capa, os avisos, e o que apaga. |
| `transfer.tsx` | 623 | O que sai da fábrica e chega na loja. |
| `weather.tsx` | 199 | Onde fica a fábrica — a única pergunta que o clima precisa fazer. |

### `app/(tabs)/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `_layout.tsx` | 149 | The five places the app has. |
| `index.tsx` | 350 | Qual desenho da capa está no ar. |
| `more.tsx` | 180 | As gavetas: o que se abre uma vez por mês, não uma vez por turno. |
| `production.tsx` | 364 | O dia de produção — e o botão que o alimenta. |
| `reports.tsx` | 216 | Os três resumos, e cada um já diz o titular dele. |
| `transport.tsx` | 266 | Where today's load went, and whether anybody opened it. |

### `app/inputs/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `[id].tsx` | 840 | One input, and everything the ledger already knows about it. |
| `index.tsx` | 414 | Everything you buy. |
| `new.tsx` | 519 | Registering an input. |

### `app/lots/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `[id].tsx` | 322 | A etiqueta do lote, na tela, do tamanho em que ela vai para o papel. |

### `app/orders/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `index.tsx` | 223 | O que os clientes pediram e ainda não foi entregue. |
| `new.tsx` | 500 | Anotar o que um cliente pediu. |

### `app/production/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `new.tsx` | 642 | Lançar o que foi produzido. |

### `app/products/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `index.tsx` | 209 | O que sai da fábrica para vender. |
| `new.tsx` | 823 | Registering a product. |

### `app/recipes/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `[id].tsx` | 636 | The recipe editor - the screen the whole product is built to make possible. |
| `index.tsx` | 252 | The recipe book. |

### `docs/esbocos/gerador/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `gerar.py` | 201 | -*- coding: utf-8 -*- |
| `pecas.py` | 111 | -*- coding: utf-8 -*- |

### `e2e/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `flow.mjs` | 2038 | The app, driven the way a person drives it. |

### `scripts/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `device-session.ts` | 384 | Runs a real session on a real device database, then prints its outbox as SQL |
| `e2e-parallel.mjs` | 93 | A suíte do navegador em quatro frentes, com um export só. |
| `folha.mjs` | 73 | A folha de contato das telas: muitas fotos numa imagem só, para comparar. |
| `icons.mjs` | 170 | Os ícones do lançador, desenhados a partir da MESMA geometria da marca. |
| `manifesto.mjs` | 101 | Quando o pacote precisa ser exportado com o cache limpo. |
| `mutate.mjs` | 1239 | Asks the only question a green suite cannot answer on its own: would these |
| `shot.mjs` | 317 | Tira foto da tela, para alguém poder OLHAR. |
| `verify-migrations.sh` | 887 | Runs the migrations against a throwaway Postgres and checks that the |

### `src/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `bar.test.ts` | 176 | Todo número que o projeto afirma sobre si mesmo, conferido contra o sistema. |
| `dictionary.test.ts` | 90 | Toda seção do dicionário tem quem a leia — ou um motivo escrito. |
| `language.test.ts` | 146 | A mesma língua visual em todas as telas. |
| `law.test.ts` | 176 | Lei da Inteligência, item 3: nenhum número aparece sozinho. |
| `layers.test.ts` | 543 | Where SQL is allowed to live, pinned. |
| `release.test.ts` | 56 | O que sai no instalador, conferido aqui em vez de na memória de quem publica. |
| `selectors.test.ts` | 154 | O e2e procura a tela pelo texto, e o texto vem do dicionário. |

### `src/assistant/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `assistant.test.ts` | 790 | The assistant is the part of this app most able to destroy trust, because it |
| `index.ts` | 86 | The assistant speaks Portuguese only, and that is a boundary rather than an |
| `skills.ts` | 1101 | What the assistant knows in phase 1. |
| `text.ts` | 108 | The small amount of language handling the offline assistant needs. |
| `types.ts` | 176 | The assistant, as a contract. |

### `src/components/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Alive.tsx` | 88 | O desenho respira, como a cena da fábrica respira. |
| `Bars.tsx` | 110 | O ritmo da semana, em sete colunas. |
| `Button.tsx` | 144 | The primary action. |
| `Card.tsx` | 187 | Transparência em cima de uma cor sólida, escrita como o RN entende. |
| `Chip.tsx` | 97 | A state chip. |
| `CollapsingHeader.tsx` | 145 | The large title that shrinks as you scroll - the most recognizable part of |
| `confirm.test.ts` | 64 | A guard for the bug that cost an evening: `Alert` does nothing on the web. |
| `Confirm.tsx` | 204 | The app's own confirmation, replacing `Alert.alert`. |
| `CountUp.tsx` | 64 | A number that counts up to its value instead of appearing finished. |
| `Crash.tsx` | 97 | What the person sees when something breaks. |
| `Drain.tsx` | 70 | Quanto ainda resta, como uma barra que ENCHE até onde deveria estar. |
| `FactoryScene.tsx` | 237 | A fábrica desenhada — e viva porque a fábrica está viva. |
| `Field.tsx` | 89 | A labelled input. |
| `Glyph.tsx` | 449 | Os desenhos gordos — os que aguentam ser o assunto do cartão. |
| `icons.tsx` | 148 | The icons the design draws, and nothing else. |
| `Landscape.tsx` | 195 | A paisagem do Orgânico — e ela é a previsão, não um desenho bonito. |
| `ListRow.tsx` | 120 | A row in a list of things. |
| `Mark.tsx` | 28 | The mark: a solid disc with a 55-degree notch pointing north. |
| `PulseDot.tsx` | 96 | The "this is live" pulse: a slow halo expanding out of a dot. |
| `QrCode.tsx` | 30 | O QR desenhado, e desenhado do jeito que a câmara fria pede. |
| `Reveal.tsx` | 78 | O cartão entra em cena em vez de já estar lá. |
| `Sky.tsx` | 264 | O dia, desenhado — e por que ele deixou de ser um bloco. |
| `Sparkline.tsx` | 124 | A linha de uma série, desenhada como se alguém tivesse acabado de traçá-la. |
| `Touchable.tsx` | 55 | O cartão que responde ao dedo. |
| `UnitStepper.tsx` | 191 | Quantity entry, in the operator's own words. |
| `WhatsNew.tsx` | 120 | The honest half of a silent update. |
| `WhySheet.tsx` | 154 | The sheet behind every `[por quê?]`. |

### `src/config/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `brand.ts` | 37 | Single source of truth for the product's brand identity. |
| `releases.ts` | 34 | What changed, in the words of someone who runs a factory. |

### `src/data/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `assistantData.ts` | 74 | The assistant, wired to the real database. |
| `db.test.ts` | 158 | The one path every phone takes on first launch, and the one no test touched. |
| `db.ts` | 852 | The on-device database. |
| `erase.test.ts` | 308 | Erasing is the one operation with no undo, so its rules are worth pinning |
| `erase.ts` | 278 | Erasing data, as rules rather than as SQL. |
| `meta.ts` | 54 | O bloco de anotações do aparelho: chave e valor, e nada mais. |
| `outbox.test.ts` | 72 | A lista de tabelas da fila, conferida contra o código e contra o esquema. |
| `outbox.ts` | 217 | The queue that makes a phone with no signal safe to write to. |
| `repository.test.ts` | 3389 | The data layer against a real database. |
| `repository.ts` | 4526 | Every query the app needs, in one place. |
| `schema.test.ts` | 142 | The guard for the one architectural mistake this project has actually made. |
| `seed.ts` | 219 | The company this device belongs to. |
| `simulate.test.ts` | 123 | A quinzena simulada, conferida como fato e não como enfeite. |
| `simulate.ts` | 201 | Two weeks of a factory that exists, written through the real front door. |
| `useQuery.ts` | 93 | Reading from the device database, with the two states a screen actually has |

### `src/domain/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `access.test.ts` | 96 | The role table, pinned - because the absences are the product decision. |
| `access.ts` | 149 | Who may do what. |
| `agreement.test.ts` | 59 | Um domingo qualquer, pedido ao Date: se esta conta e a do JavaScript |
| `agreement.ts` | 65 | O que foi combinado com uma loja, na parte que o sistema consegue usar. |
| `alerts.test.ts` | 276 | Lei 4. Polpa que acaba em dois dias, com três dias de antecedência |
| `alerts.ts` | 353 | Quando o aplicativo avisa, e quando ele cala. |
| `briefing.test.ts` | 71 | A ordem da empresa manda, e o que ela não ordenou entra no fim - na ordem |
| `briefing.ts` | 128 | Quais peças a capa mostra, e em que ordem. |
| `cost.test.ts` | 132 | The three exports the audit found with no caller and no test. |
| `cost.ts` | 241 | Moving weighted average cost. |
| `day.test.ts` | 112 | 03:00 UTC on the 1st is midnight in São Paulo - the very start of the 1st. |
| `day.ts` | 161 | The factory's day, as a window the ledger can be asked about. |
| `ledger.test.ts` | 25 | A única conta deste módulo que o aplicativo roda. |
| `ledger.ts` | 176 | The movement ledger - the foundation everything else sits on. |
| `lot.test.ts` | 43 | Ordenar como texto tem que dar a ordem do tempo: é assim que a lista de |
| `lot.ts` | 73 | O lote: o pedaço de produção que se rastreia junto. |
| `measure.test.ts` | 34 | A bucket has no size printed on it. |
| `measure.ts` | 55 | Reading a quantity out of the way somebody writes a package. |
| `money.test.ts` | 122 | The one place rounding happens, pinned. |
| `money.ts` | 101 | Money is integer cents. Never a float — 0.1 + 0.2 is not 0.3, and a system |
| `number.test.ts` | 63 | The invoice that started this: four buckets of pulp, R$ 118,50 apiece. On |
| `number.ts` | 91 | Reading a number the way a person typed it, and writing one back so that |
| `picking.test.ts` | 67 | As duas fontes DISCORDANDO é o único caso que prova a ordem: com uma delas |
| `picking.ts` | 65 | De onde vem o número que a tela de transferência já traz preenchido. |
| `pipeline.test.ts` | 298 | The chain the whole product rests on: an invoice moves the average, the |
| `qr.test.ts` | 91 | Versão 1: 21 por 21, a menor grade que o padrão define. Numa etiqueta de |
| `qr.ts` | 77 | O quadrado preto e branco que a câmara fria precisa ler. |
| `recipe.test.ts` | 519 | Rates, not amounts: price per purchase unit divided by base units in it. |
| `recipe.ts` | 393 | The recipe engine - where the product's central promise lives. |
| `spark.test.ts` | 68 | O maior valor fica no TOPO: y cresce para baixo em SVG, e trocar isso |
| `spark.ts` | 97 | A linha de uma série, como caminho SVG — geometria pura, sem tela. |
| `units.test.ts` | 88 | The packaging invariant, which was written down and never run. |
| `units.ts` | 110 | Packaging hierarchy. |

### `src/home/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Mosaic.tsx` | 924 | Mosaico: uma manchete grande e peças pequenas embaixo. |
| `Peca.tsx` | 161 | Um widget da capa que abre no lugar. |
| `types.ts` | 69 | O que a capa sabe, separado de como ela desenha. |

### `src/i18n/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `company.ts` | 69 | A moeda que a fábrica cobra, e o jeito de escrever número que vem com ela. |
| `device.ts` | 50 | Which language the phone is asking for. |
| `i18n.test.ts` | 192 | Os três dicionários, conferidos um contra o outro. |
| `index.ts` | 266 | Currency is a property of the company, not of the phone. A Brazilian factory |
| `Locale.tsx` | 116 | O idioma e a moeda da EMPRESA, escolhidos uma vez e obedecidos por toda tela. |
| `useLocale.ts` | 26 | One place that decides which language the interface speaks. |

### `src/i18n/locales/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `en.ts` | 1051 |  |
| `es.ts` | 1057 | Spanish. The largest market available to this positioning: research across |
| `pt-BR.ts` | 1179 | Portuguese (Brazil) - the source language. |

### `src/notify/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Alerts.tsx` | 42 | Quem manda reagendar os avisos: uma vez, quando o aplicativo abre. |
| `facts.test.ts` | 207 | Os fatos que alimentam o alarme, contra um banco de verdade. |
| `facts.ts` | 127 | Os fatos que alimentam o alarme, separados do adaptador de propósito. |
| `index.ts` | 113 | O aviso saindo do aplicativo para o sistema operacional. |
| `phrase.test.ts` | 97 | `{{subject}}` na tela de bloqueio é um defeito que nenhuma outra rede pega: |
| `phrase.ts` | 52 | A frase de um aviso, como função pura. |

### `src/sync/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `agreement.test.ts` | 437 | The two schemas, checked against each other by reading both. |
| `columns.test.ts` | 124 | Toda coluna do aparelho ou atravessa, ou está escrita como sendo só daqui. |
| `engine.ts` | 125 | Sending what the phone wrote while it was alone. |
| `serialize.test.ts` | 160 | The crossing between SQLite and Postgres, checked without either. |
| `serialize.ts` | 408 | The one place a device row becomes something the server accepts. |
| `sync.test.ts` | 242 | The queue and the engine, against a real database and a fake server. |

### `src/theme/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `Appearance.tsx` | 137 | Qual das duas caras o aplicativo está usando. |
| `contrast.test.ts` | 133 | O texto pequeno tem de ser legível no corredor da câmara, com luva e |
| `scheme.test.ts` | 48 | A luz da tela: o que a escolha decide e o que o aparelho decide. |
| `scheme.ts` | 58 | Claro, escuro, ou o que o aparelho disser. |
| `ThemeProvider.tsx` | 119 | A paleta inteira, para quem precisa de um tom que não é o da área. |
| `tokens.ts` | 401 | Design tokens. |

### `src/types/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `qrcode-core.d.ts` | 23 | O encoder puro do `qrcode`, sem o resto da biblioteca. |

### `src/weather/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `index.ts` | 252 | O clima — que numa fábrica de sorvete é informação de negócio, não enfeite. |
| `live.ts` | 60 | O clima ligado no aparelho de verdade: rede com prazo, cache no `app_meta`. |
| `weather.test.ts` | 211 | O clima é a primeira coisa neste aplicativo que depende de rede, e é por isso |

### `supabase/migrations/`

| Arquivo | Linhas | Primeira linha de comentário |
|---|---:|---|
| `0001_foundation.sql` | 340 | ============================================================================= |
| `0002_recipes.sql` | 274 | ============================================================================= |
| `0003_base_unit.sql` | 23 | ============================================================================= |
| `0004_harden.sql` | 62 | ============================================================================= |
| `0005_revoke_public_execute.sql` | 31 | ============================================================================= |
| `0006_private_helpers.sql` | 46 | ============================================================================= |
| `0007_movement_kind_purchase.sql` | 17 | The ledger had no word for the one movement phase 1 actually makes. |
| `0008_ledger_speaks_phase_one.sql` | 93 | Three more things the server would have refused from the phone. |
| `0009_average_asks_the_ledger.sql` | 76 | The server kept the same forbidden column the device did. |
| `0010_what_the_device_actually_sends.sql` | 29 | Two columns the device has been writing with nowhere to put them. |
| `0011_joining_a_company.sql` | 69 | Entrar numa empresa passa a ter dois caminhos, e um deles precisa de espera. |
| `0012_who_or_where.sql` | 26 | O relatório operacional nomeia a pessoa, ou o lugar? |
| `0013_the_device_is_accountable.sql` | 68 | O aparelho vira coisa cadastrada, com um responsável. |
| `0014_who_was_holding_it.sql` | 32 | Quem estava operando naquele momento, anotado no registro. |
| `0015_the_phone_will_send_it_twice.sql` | 36 | O aparelho reenvia a fila, e o servidor precisa aguentar isso. |
| `0016_the_act_and_its_lines.sql` | 36 | O que amarra as linhas de um mesmo ato. |
| `0017_a_check_that_matched_is_a_fact.sql` | 27 | A conferência que bateu também é um fato, e o esquema a recusava. |
| `0018_a_product_has_a_family.sql` | 139 | 0018 - Um produto tem família, tipo e sabor |
| `0019_an_order_is_demand.sql` | 188 | 0019 - Um pedido é demanda, e demanda não é livro-razão |
| `0020_a_lot_and_the_day_it_dies.sql` | 43 | A validade mora no produto, e o lote é quem a carrega. |
| `0021_what_was_agreed_with_the_store.sql` | 23 | A ficha de acordo da loja. |
| `0022_the_stick_leaves_the_storeroom.sql` | 30 | O palito sai do estoque. |
| `0023_the_ruler_that_turns_a_balance_into_a_judgement.sql` | 17 | O nível cheio de um item. |
| `0024_a_reading_is_a_fact_like_any_other.sql` | 76 | A leitura de uma grandeza num lugar. |
| `0025_what_the_kettle_makes_is_worth_something.sql` | 87 | O produto fabricado não tinha custo, dos dois lados, e o dinheiro sumia. |
| `0026_which_sheet_made_this_one.sql` | 31 | O lote passa a dizer QUAL FICHA rodou. |
| `0027_a_resend_is_not_a_decision.sql` | 96 | O pedido precisa poder ser REENVIADO, e reenviar não é decidir. |
| `0028_the_index_under_what_was_reversed.sql` | 32 | O índice que faltava embaixo de "o que foi estornado não aconteceu". |
| `0029_a_movement_cannot_point_at_another_company.sql` | 47 | O livro-razão aceitava item e local de OUTRA empresa. |
| `0030_the_default_room_is_bookkeeping_not_a_privilege.sql` | 66 | Quarta aparição da fila travada, e a forma é nova outra vez. |
| `0031_a_reading_can_be_sent_twice.sql` | 74 | A leitura da câmara precisa poder ser REENVIADA, e reenviar não é anotar de novo. |
| `0032_who_ordered_it_never_changes.sql` | 49 | Quem anotou o pedido nunca muda, nem para quem aprova. |
