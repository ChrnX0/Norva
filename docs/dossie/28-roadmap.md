## 28. Roadmap: o que está feito, o que falta, e em que ordem

O plano deste produto mora em dois arquivos que se referenciam: `docs/roadmap.md`
(o arco inteiro, 417 linhas) e a seção **Faseamento** do `CLAUDE.md`
(`CLAUDE.md:378-438`, que registra as decisões do dono sobre fase e o portão por
item). Um terceiro arquivo, `docs/auditoria.md` (4 de setembro de 2026, dez
frentes e trinta achados), é a medição de onde o produto estava — e é dele que a
fila de trabalho atual sai.

Esta seção transcreve os três, item por item, e marca ao lado de cada item o que
foi possível conferir no código em 5 de setembro de 2026.

---

### 28.1 Por que o arquivo de plano existe

Duas datas, e as duas são cicatriz.

**3 de setembro.** Uma sessão terminou o escopo escrito e ficou sem lista — não
por falta de trabalho, mas porque a lista morava espalhada entre as fases do
`CLAUDE.md`, as dívidas do `docs/insights.md` e a cabeça de quem estava
trabalhando (`docs/roadmap.md:5-10`). A regra de "nunca ocioso" diz que a próxima
coisa vem da **lista escrita**; sem uma, ela vira convite a inventar tarefa, que
é pior que parar (`docs/roadmap.md:8-10`, `CLAUDE.md:257-264`).

**4 de setembro.** O dono leu a primeira versão e disse: *"nunca vi roadmap pela
metade"*. Estava mesmo — era uma lista de seis itens fechados com um bilhete
dizendo que a lista estava vazia. *"Lista vazia não é plano. Plano é o arco
inteiro, com o que já existe, o que falta, em que ordem, e o que trava cada
coisa"* (`docs/roadmap.md:12-16`).

#### As três regras que mantêm o plano vivo

Transcritas de `docs/roadmap.md:401-417`:

1. **Item fechado sai daqui no mesmo commit que o fecha.** *"Plano que lista o
   que já existe manda alguém construir duas vezes — e o custo não é o tempo, é a
   confiança: depois do segundo item errado, ninguém lê mais o arquivo."*
   (`docs/roadmap.md:405-407`)
2. **Item novo entra com evidência de arquivo.** `arquivo:linha` que sustenta o
   estado. *"Sem isso é palpite, e palpite em plano tem a mesma cara de fato."*
   (`docs/roadmap.md:408-409`)
3. **Item parado carrega o que o destrava**, não uma promessa de data. *"Precisa
   de aparelho na mão" é informação; "semana que vem" é ficção."*
   (`docs/roadmap.md:410-411`)

E uma quarta, que nasceu de o próprio topo do arquivo já ter mentido uma vez: **o
resumo do estado é conferido contra o corpo antes de fechar a sessão.** Ele
chegou a dizer "os cinco estão fechados e a procura trouxe o item 6" depois de o
item 6 ter sido fechado — a cabeça do arquivo contradizendo o corpo dele doze
linhas abaixo (`docs/roadmap.md:413-417`).

**A regra 1 foi quebrada por um commit, e o registro fica em vez de ser apagado.**
Os quatro achados da varredura de sete eixos foram consertados num commit
(`1fcbadc`) e riscados no seguinte (`docs/roadmap.md:99-103`).

---

### 28.2 Onde o produto está hoje — a tabela medida, e o que ela erra

`docs/roadmap.md:30-49` traz duas tabelas com a coluna **como conferir** ao lado
de cada número. `src/bar.test.ts` executa essa coluna: cada linha é derivada do
sistema e comparada com o que está escrito, *"então a tabela não envelhece em
silêncio"* (`docs/roadmap.md:22-24`).

O motivo da guarda está escrito: *"Ela já envelheceu, no dia em que foi escrita:
quatro linhas ficaram para trás antes do fim da tarde. Comando escrito ao lado do
número é convite, não garantia — ninguém roda quinze comandos antes de acreditar
numa tabela."* (`docs/roadmap.md:26-28`)

#### O inventário do produto

| linha do plano | valor escrito | comando de conferência | medido em 5/9/2026 | guardado por `bar.test.ts`? |
|---|---|---|---|---|
| telas | **24** | `find app -name '*.tsx' \| grep -v _layout \| wc -l` | 24 ✔ | sim (`src/bar.test.ts:122`) |
| tabelas no aparelho (SQLite) | **21** | `grep -c 'CREATE TABLE IF NOT EXISTS' src/data/db.ts` | 21 ✔ | sim (`src/bar.test.ts:123`) |
| tabelas no servidor (Postgres) | **22** | `grep -h '^create table' supabase/migrations/*.sql \| wc -l` | 22 ✔ | sim (`src/bar.test.ts:124`) |
| migrações do servidor | **32** | `ls supabase/migrations \| wc -l` | 32 ✔ | sim (`src/bar.test.ts:125`) |
| migrações do aparelho | **V17** | último `const V` em `src/data/db.ts` | V17 ✔ (`src/data/db.ts:670`, `MIGRATIONS` em `src/data/db.ts:676-678`) | **não** |
| papéis | **7** | `src/domain/access.ts` | 7 ✔ | sim (`src/bar.test.ts:126`) |
| capacidades | **18** | `src/domain/access.ts` | **12** — ver abaixo | sim, mas pela régua errada (`src/bar.test.ts:127`) |
| linhas de código | **~45.000** | `find src app e2e scripts supabase … \| xargs wc -l` | **48.889** | **não** |

**O "18 capacidades" está errado, e a guarda concorda com o erro.** A régua, em
`src/bar.test.ts:127`, é
`new Set([...ACESSO.matchAll(/'([a-z_]+)'/g)]).size` — ela conta toda string entre
aspas simples em minúsculas e sublinhados dentro de `src/domain/access.ts`. Isso
pega as **12** capacidades reais (`src/domain/access.ts:26-39`) mais **6** nomes
de papel que por acaso são minúsculas — `owner`, `operator`, `driver`, `buyer`,
`customer`, `salesperson`. `storeManager` escapa porque é camelCase. 12 + 6 = 18.
O número de capacidades do sistema é **12**, não 18; a guarda que existe para
impedir a tabela de envelhecer está reproduzindo um número que nunca foi certo.

#### A barra de verificação

| linha do plano | valor escrito | medido em 5/9/2026 | guardado? |
|---|---|---|---|
| `npm test` | **338** testes | 338 ✔ | sim (`src/bar.test.ts:128`) |
| `npm run mutate` | **106** defeitos plantados, 104 pegos e 2 equivalentes | 106 entradas `file:` em `scripts/mutate.mjs` ✔ | sim (`src/bar.test.ts:129`) |
| `npm run e2e:fast` | **36** checagens num navegador de verdade | 36 chamadas `check(` em `e2e/flow.mjs` ✔ | sim (`src/bar.test.ts:130`) |
| `npm run db:verify` | **13** garantias contra Postgres descartável, sob RLS | 13 linhas `echo "==> check ` em `scripts/verify-migrations.sh` ✔ | sim (`src/bar.test.ts:131`) |
| `.proofgate/verify.sh` | **24** guardas de entrega | **25** arquivos `.sh` em `.proofgate/guards.d/` | **não** |

O `.proofgate/guards.d/` tem 25 guardas ao lado de um `TEMPLATE.sh.example`, e
não há `proofgate.json` no repositório para pular nenhum deles (`verify.sh` lê
`.skip` e `.severity` de um `proofgate.json` que não existe —
`.proofgate/verify.sh:234`, `:246-248`). Os 25: `10-secrets`, `12-merge-markers`,
`15-tls-off`, `20-pii-logging`, `25-silent-catch`, `30-untested-changes`,
`35-dependency-change`, `40-env-drift`, `45-broad-process-kill`,
`47-unquoted-globstar`, `48-pipeline-exit-code`, `50-coupled-files`,
`55-skipped-tests`, `58-frozen-clock`, `60-large-files`, `65-type-suppressions`,
`70-debug-leftovers`, `75-machine-paths`, `85-float-money`, `90-sql-concat`,
`92-superuser-verification`, `95-schema-constraint-no-migration`,
`96-version-bump-no-release`, `97-migration-edited`, `99-dead-allow`. Mais o gancho
`.proofgate/hooks/push-guard.sh`.

**Três linhas do plano não são guardadas por `bar.test.ts`** — migrações do
aparelho, linhas de código e guardas da proofgate. Duas das três já estão velhas.
A fronteira está declarada no próprio teste: *"Acrescentar uma linha à tabela sem
acrescentar uma entrada aqui não quebra nada — e essa é a fronteira honesta desta
guarda: ela confere o que foi registrado, não descobre o que não foi."*
(`src/bar.test.ts`, docblock de `TABELA`)

#### Nível de evidência declarado

**E3** — exercitado contra Postgres e navegador de verdade, com as telas
fotografadas nos dois temas e nas duas identidades. **Nada visto numa fábrica.**
*"Essa é a lacuna que nenhum teste fecha, e ela decide o que pode ser construído
agora e o que precisa esperar."* (`docs/roadmap.md:51-54`)

#### Os sete papéis, que são o desenho do produto

`owner` · `operator` · `storeManager` · `driver` · `buyer` · `customer` ·
`salesperson` (`docs/roadmap.md:58-59`, `src/domain/access.ts:51-58`).

*"Um deles é a decisão do dono que mais restringe desenho futuro: o aparelho
emprestado entra como `operator` — produz, despacha, confere, registra perda e
conta a prateleira, e não vê preço, custo nem dinheiro em lugar nenhum."*
(`docs/roadmap.md:61-63`). Confirmado no código: `operator` recebe exatamente
`['record_production', 'dispatch', 'check_receipt', 'record_loss', 'adjust_stock']`
(`src/domain/access.ts:87`) — sem `view_cost`, sem `view_sale_price`, sem
`view_finance`.

---

### 28.3 O arco inteiro — sete etapas, e por que a ordem não é gosto

Transcrito de `docs/roadmap.md:72-80`. Cada etapa destrava a seguinte por um
motivo escrito na coluna da direita.

| | etapa | o que a fábrica ganha | o que ela precisa antes |
|---|---|---|---|
| **F1** | fundação — livro-razão, custo, estoque | o número de estoque para de ser chute | — |
| **F2** | produção, lote, validade, câmara | a corrida do tacho vira registro | F1 |
| **F3** | o papel sai do chão de fábrica | romaneio, conferência e etiqueta no celular | F2 |
| **F4** | a fábrica se explica sozinha | o Espelho da Loja e a compra na hora certa | **meses de movimento real** |
| **F5** | o fiscal | nota fiscal eletrônica | certificado A1 e homologação SEFAZ |
| **F6** | publicar nas lojas | qualquer fábrica instala | F3 + privacidade + licenças |
| **F7** | os trunfos | roteirização, clima aplicado, PAC/POD | F4 |

**Estado declarado: F1 e F2 estão feitas** (`docs/roadmap.md:82`).

*"O que domina o calendário não é código. A F4 precisa de meses de movimento real
— nenhuma quantidade de trabalho encurta isso. A F5 é um microserviço .NET com
certificado e homologação, que é ato administrativo. Por isso o alvo de um mês
decidido pelo dono é F2 + F3, e o resto tem data de começo, não de entrega."*
(`docs/roadmap.md:87-90`)

---

### 28.4 F1 — a fundação, dada como feita por decisão do dono

**Decisão do dono, 1 de setembro de 2026** (`CLAUDE.md:380-381`): *"Fase 1 dada
como feita. A Fase 2 está destravada: produção, lote, QR e câmara fria podem
começar. **Não se reabre.**"*

O número na mão do dono quando ele decidiu (`CLAUDE.md:383-387`,
`docs/roadmap.md:82-85`):

| medição da auditoria da Fase 1 | quantos |
|---|---|
| prontos | **6** |
| parciais | **9** |
| ausentes | **1** |

**O que "parcial" significava**, transcrito: *"Os parciais são 'funciona para o
exemplo semeado' e 'existe o cálculo, falta a escrita' — o tipo de coisa que uso
real corrige melhor que auditoria."* (`CLAUDE.md:385-387`)

**O único ausente**, transcrito: *"a produção gravar a versão de receita usada,
que é trabalho da Fase 2 de qualquer jeito."* (`CLAUDE.md:386-387`)

**Estado real do único ausente: FECHADO.** A migração
`supabase/migrations/0026_which_sheet_made_this_one.sql` acrescenta
`lots.recipe_version_id uuid references recipe_versions(id)` mais o índice
`lots_recipe_version_idx on lots (company_id, recipe_version_id) where
recipe_version_id is not null`. O docblock dela registra que o item *"voltou pela
metade"* na primeira tentativa: `production_runs.recipe_version_id` recebia o id
da RECEITA na coluna da VERSÃO, e a linha da corrida é apagada ao fechar ou
cancelar — *"Nada durável, dos dois lados, dizia de que ficha aquele picolé
saiu."* A marca ficou no **lote** e não na corrida *"porque o lote é o que
sobrevive: ele não é apagado, é o que a etiqueta nomeia, e é por ele que um recall
começa."* Anulável de propósito: *"Lote de importação não tem ficha, e lote
gravado antes desta migração também não."* O escritor existe:
`src/data/repository.ts:1516-1517` grava
`INSERT INTO lots (id, company_id, item_id, code, produced_on, expires_on,
recipe_version_id, created_at)`.

**A lista dos 6 prontos e dos 9 parciais NÃO ESTÁ NO CÓDIGO nem em nenhum
documento do repositório** — só as contagens sobrevivem
(`CLAUDE.md:383-384`, `docs/roadmap.md:82-84`). O relatório da auditoria da Fase 1
não está em `docs/`; o que existe lá é a auditoria de 4 de setembro
(`docs/auditoria.md`), que é outra e mede o produto inteiro.

---

### 28.5 F2 — produção, lote, validade, câmara fria

**Estado declarado: FECHADA.** *"F2 fechou com o lote dizendo de que ficha saiu, a
câmara dizendo o que estava dentro na hora da leitura, e a lista de compras por
simulação."* (`docs/roadmap.md:84-85`)

Os três fechamentos, conferidos:

| o que a F2 declarou fechado | onde está | estado real |
|---|---|---|
| o lote dizendo de que ficha saiu | `supabase/migrations/0026_which_sheet_made_this_one.sql`; escrita em `src/data/repository.ts:1516-1517` | **implementado e chamado por tela** (`app/production/new.tsx` fecha a corrida; a etiqueta lê em `app/lots/[id].tsx`) |
| a câmara dizendo o que estava dentro na hora da leitura | `supabase/migrations/0024_a_reading_is_a_fact_like_any_other.sql`; `recordReading` em `src/data/repository.ts:2769` | **implementado e chamado por tela** — a checagem 18 do e2e (`e2e/flow.mjs:895`) dirige *"a cold room reading becomes history today, sensor or no sensor"* |
| a lista de compras por simulação | `shoppingList` em `src/domain/recipe.ts:360` | **implementado e chamado** — pelo assistente, na habilidade `what_to_buy` (`src/assistant/skills.ts:1025`), não por uma tela dedicada |

#### A forma da tabela `readings`, transcrita

`supabase/migrations/0024_a_reading_is_a_fact_like_any_other.sql`. O desenho
existe para que grandeza nova, protocolo novo e câmara nova **não** peçam
migração:

| coluna | tipo | nota do docblock |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `company_id` | `uuid not null references companies(id) on delete cascade` | |
| `location_id` | `uuid not null references locations(id) on delete restrict` | mais de uma câmara já estava resolvido: cada câmara é um `location` |
| `device_id` | `uuid references devices(id) on delete set null` | **nulo é a leitura digitada por uma pessoa** — *"é o único caminho que funciona hoje: a fábrica passa a ter histórico antes de existir módulo, em vez de esperar seis meses e começar do zero"* |
| `kind` | `text not null` | **TEXTO ABERTO** de propósito: *"Fechar num enum seria transformar 'quero medir umidade também' numa migração"* |
| `value` | `numeric(14,4) not null` | |
| `unit` | `text not null` | texto aberto pelo mesmo motivo |
| `taken_at` | `timestamptz not null` | *"quando a medição aconteceu no mundo, não quando chegou ao servidor"* |
| `recorded_at` | `timestamptz not null default now()` | |
| `source` | `text` | `typed`, `ble`, `wifi`, `zigbee`, `lora` — *"O que importa para a integridade não é o rádio, é o lugar e quem gravou"* |
| `recorded_by` | obrigatório e incedível, como em `movements` | *"leitura sem autor é leitura que ninguém pode contestar"* |

A origem do pedido, registrada: *"O dono pediu alarme de temperatura da câmara
fria, disse que vai arrumar um ESP32 para vendermos o módulo, lembrou que muita
fábrica tem mais de uma câmara, e depois somou umidade, pressão e ruído."*

#### O lote e a validade

`supabase/migrations/0020_a_lot_and_the_day_it_dies.sql`:

- `alter table products add column shelf_life_days integer check (shelf_life_days
  is null or shelf_life_days > 0)`, com comentário no banco: *"Quantos dias o
  produto dura depois de feito. Nulo: não vence."*
- A razão de o prazo ser do **produto** e não da corrida: *"Quem está de luva no
  tacho não sabe de cabeça que o picolé dura seis meses e o pote três; o cadastro
  sabe, respondeu uma vez, e a partir daí toda corrida nasce com a data pronta.
  Perguntar a validade a cada tacho é pedir o que o sistema já pode deduzir."*
- Nulo é resposta válida: *"sorvete a granel para uso interno, embalagem, insumo
  de prateleira. O lote continua existindo e continua rastreando — o que ele não
  carrega é uma data inventada, que seria pior que nenhuma nos dois sentidos
  (descartar mercadoria boa, vender mercadoria vencida)."*
- E a política que faltava: `create policy lots_resend on lots for update using
  (private.has_capability(company_id, 'record_production')) with check (…)` —
  *"Peça sem escritor não é peça pronta: é peça não exercitada."*

Confirmado no aparelho: `shelf_life_days` viaja em `src/data/repository.ts:1827`,
`:1856`, `:1996`, `:2004`.

#### A generalização de saldo por local que a F2 pedia primeiro

`CLAUDE.md:432-438` registra a primeira coisa que a F7 (a doutrina do "depende
vira dado") já resolveu: *"Perguntavam se a câmara fria é saldo separado ou o
mesmo saldo noutra sala. Depende da fábrica — então vira dado: o saldo passa a
filtrar por local, e quem tem um lugar só tem um local só."*

O estado descrito ali — *"Hoje `ensureLocation` cria uma `location` única cujo id
é o `company_id`, e as três consultas de saldo somam `WHERE company_id = ? AND
item_id = ?`, sem `location_id`"* — **já não é o estado real.** Medido:

- `ensureLocation` continua criando o lugar único com id igual ao `company_id`,
  `kind` = `'store_room'`, nome vazio (`src/data/repository.ts:847-866`), e
  `defaultLocationId(companyId)` devolve literalmente `companyId`
  (`src/data/repository.ts:843-845`).
- Mas o saldo **já filtra por local em vários caminhos**: `balanceByLocation`
  (`src/data/repository.ts:537`), `stockByPlace`
  (`src/data/repository.ts:781`), `lotsInStock` (`src/data/repository.ts:3017`),
  e as consultas com `AND (? IS NULL OR m.location_id = ?)`
  (`src/data/repository.ts:173`, `:1020-1021`, `:2989`, `:3818`, `:3822`).
- E `stockAgainstOrders` (`src/data/repository.ts:4147`) soma **todas as salas
  nossas** com `l.kind IN ('factory', 'cold_room', 'store_room')`, que é a régua
  `INTERNAL_PLACE_KINDS` (`src/domain/ledger.ts:68`) escrita em SQL. O docblock
  conta por que: *"A conta lia o `defaultLocationId` — um lugar só, o que era
  certo enquanto havia um só. O dono cadastra a câmara fria, manda o picolé para
  lá (que é o que uma fábrica de picolés faz no dia seguinte ao de produzir), e a
  conta passa a dizer que não há nada para prometer com o freezer cheio."*

**Marcação de estado:** o parágrafo do `CLAUDE.md:432-438` é **história datada,
não estado atual** — quem reconstruir deve ler a régua `INTERNAL_PLACE_KINDS` e
`receivesCargo` (`src/domain/ledger.ts:56-73`) como a forma vigente.

#### A decisão do dono que a F2 ainda espera: "A sala do tacho"

`docs/roadmap.md:219-239`. É a única pergunta aberta de dono no plano, e ela está
escrita com as duas formas porque **nenhuma podia ser escolhida por Claude**.

O fato de partida: *"O piso da produção conta a sala em que o tacho roda, e isso
está certo: somar todos os lugares autorizaria um tacho com o açúcar que está a
dez quilômetros, numa loja. Mas polpa mora no freezer."*

Os dois mundos, ambos legítimos:

| forma | como funciona | custo |
|---|---|---|
| **Sala estrita** (o comportamento de hoje) | o insumo entra no almoxarifado, e tirar da câmara é uma transferência lançada | saldo por sala sempre exato; **um lançamento a mais por tacho** |
| **Salas nossas somadas** | o tacho consome de qualquer sala da fábrica, e o sistema decide de qual debitar (a mais velha primeiro, como o lote já faz) | nada a lançar; **o saldo de uma sala isolada passa a ser deduzido, não declarado** |

*"Pela regra da casa isto não é pergunta de qual, é pergunta de qual é o padrão —
os dois caminhos existem como configuração da empresa."*
(`docs/roadmap.md:232-233`)

**O que trava é o portão P3:** *"a segunda opção muda onde o consumo é gravado,
que é o caminho de escrita de `movements`, e forma de livro-razão não se corrige
com um commit."* (`docs/roadmap.md:234-236`)

**E o que falta antes de qualquer uma das duas: o trajeto interno — transferência
entre salas nossas.** *"a tela de transferir não faz (ela sai sempre da fábrica, e
o caminho de volta grava `return`, que é notícia sobre a loja, não sobre a nossa
câmara)."* (`docs/roadmap.md:237-239`)

**Confirmado no código.** Em `app/transfer.tsx:128`:
`const from = devolucao ? (outra?.id ?? fabrica) : fabrica;` — a origem de uma
carga é sempre `fabrica = defaultLocationId(LOCAL_COMPANY_ID)`
(`app/transfer.tsx:111`). Os destinos são todos os lugares menos o padrão
(`app/transfer.tsx:124`: `destinations = places.filter((p) => p.id !== fabrica)`),
então **almoxarifado → câmara fria funciona e grava `transfer`**; o caminho de
volta só existe pelo interruptor `devolucao`, que troca
`recordTransfer` por `recordReturn` (`app/transfer.tsx:226`) e grava
`kind = 'return'` (`src/data/repository.ts:1767-1771`, via
`moveBetween(companyId, input, 'return')`, `src/data/repository.ts:1686`).

A consequência prática, escrita em `docs/roadmap.md:205-209` e repetida em
`docs/auditoria.md`: *"enquanto não existir, uma fábrica que guarda a polpa no
freezer teria de lançar transferência antes de cada tacho, e nenhuma fábrica de
seis pessoas faz isso."*

---

### 28.6 F3 — o mês que tira o papel do chão de fábrica

**É o alvo decidido pelo dono.** *"No fim disto, a fábrica para de usar papel para
romaneio, conferência e etiqueta."* (`docs/roadmap.md:241-244`)

Os oito itens, com o estado declarado no plano e o estado real medido:

#### 1. Etiqueta e QR do lote

**Declarado** (`docs/roadmap.md:246-248`): *"O QR já é impresso; falta quem o leia.
A seção `scan` do dicionário existe nos três idiomas esperando a tela — está
registrada como fronteira em `src/dictionary.test.ts`, com o motivo."*

**Real:**
- O QR é **desenhado na tela**, não impresso: `app/lots/[id].tsx:209` renderiza
  `<QrCode text={lote.code} size={200} />`. O docblock da tela diz o porquê:
  *"Esta tela é a prova visual da etiqueta antes de existir impressora. A escolha
  de qual impressora a fábrica compra é do dono, e ela muda o formato do papel,
  não o conteúdo."* — **implementado e chamado por tela**, com a impressão fora de
  escopo por decisão de dono pendente.
- O leitor **não existe**: não há `expo-camera`, `expo-barcode-scanner` nem
  qualquer dependência de câmera no `package.json`. **NÃO IMPLEMENTADO.**
- A seção `scan` do dicionário existe nos três idiomas
  (`src/i18n/locales/pt-BR.ts:1162-1166`, `src/i18n/locales/en.ts:1044`,
  `src/i18n/locales/es.ts:1050`) e é **planejada/sem leitor**, registrada como
  fronteira em `src/dictionary.test.ts` com o motivo *"a leitura do QR do
  engradado na doca — o QR já é impresso na etiqueta do lote; quem lê ainda não
  existe"*.

As três chaves de `scan`, em português: `typeCode: 'Digitar o código'`,
`progress: '{{done}} de {{total}}'`, `duplicate: 'Esse engradado já foi bipado.'`
(`src/i18n/locales/pt-BR.ts:1163-1165`).

**O que vai dentro do QR é decisão ergonômica registrada** em
`src/domain/qr.ts`: o código carrega o **código do lote** (`20260902-01`, onze
caracteres) e **não** o uuid. *"o código cabe na versão 1, que é uma grade de 21
por 21 — a menor que existe. O uuid, com trinta e seis caracteres, exigiria a
versão 3, 29 por 29: numa etiqueta de quatro centímetros, o módulo cai de 1,9mm
para 1,4mm, e perde-se um quarto do tamanho justamente na distância em que a
leitura já é difícil."* Segundo motivo, que vale mais: *"o código do lote é
legível por gente"*. Nível de correção **H** (recupera 30% do código danificado),
e ele é de graça: com onze caracteres, L, M, Q e H cabem na mesma grade de 21 por
21. `QUIET_ZONE = 4` módulos, exigidos pelo padrão.

#### 2. Lojas e clientes com ficha de acordo

**Declarado** (`docs/roadmap.md:250-253`): *"O que foi combinado com cada loja:
preço, prazo, dia de entrega. A migração
`0021_what_was_agreed_with_the_store.sql` já criou a forma; falta a tela."*

**Real: o plano está velho neste item. A tela EXISTE.**
`app/places.tsx:645-712` é um editor de ficha de acordo completo — telefone, grade
de sete dias e nota — e escreve por `savePlace` (`app/places.tsx:658-665`) com
`contactPhone`, `deliveryDays`, `agreementNote`. A leitura acontece no cartão do
lugar (`app/places.tsx:254-281`) e em `app/orders/new.tsx:155` e `:286`, e a capa
usa o acordo para dizer quem recebe hoje (`app/(tabs)/index.tsx:258`:
`.filter((p) => daysUntilNextDelivery(p.deliveryDays, weekday) === 0)`).
**Implementado e chamado por tela.**

**A parte que de fato falta é o PREÇO.** A migração 0021 acrescenta três colunas e
nenhuma é preço:

```sql
alter table locations add column contact_phone text;
alter table locations add column delivery_days smallint not null default 0;
alter table locations add column agreement_note text;
alter table locations add constraint locations_delivery_days_is_a_week
  check (delivery_days between 0 and 127);
```

Não existe tabela nem coluna de preço por loja ou tabela de preço por cliente em
`supabase/migrations/`: `unit_price_rate` é do movimento
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:80`), congelado no
instante. **Preço acordado por loja: NÃO IMPLEMENTADO.** *"prazo"* também não
existe como coluna — o que existe é o dia de entrega. **NÃO ESTÁ NO CÓDIGO.**

**A forma dos dias, transcrita** (`supabase/migrations/0021…`,
`src/domain/agreement.ts`): bitmask com o **bit 0 no domingo**, a mesma numeração
de `Date.getDay()`. `export const WEEK_BITS = [1, 2, 4, 8, 16, 32, 64] as const`
(`src/domain/agreement.ts:17`). *"Um inteiro atravessa a fila do aparelho sem
conversão nenhuma… uma lista de texto tem duas gramáticas possíveis e a
divergência aparece só no dia da entrega."* **Zero é "não combinamos dia", que NÃO
é "nenhum dia"**: a loja sem acordo recebe quando dá, e nenhuma tela deve inventar
um dia para ela.

As três funções do domínio, com assinatura:

| função | assinatura | regra |
|---|---|---|
| `agreedOn` | `(days: number, weekday: number) => boolean` | `(days & WEEK_BITS[weekday]) !== 0` (`src/domain/agreement.ts:37-39`) |
| `toggleDay` | `(days: number, weekday: number) => number` | `days ^ WEEK_BITS[weekday]` (`src/domain/agreement.ts:42-44`) |
| `daysUntilNextDelivery` | `(days: number, todayWeekday: number) => number \| null` | zero quando hoje é dia de entrega, de propósito; nulo quando não há acordo (`src/domain/agreement.ts:58-64`) |

E um guarda que existe por causa do `mutate`: `noWeek(weekday)` lança
`RangeError('a semana tem sete dias, e N não é um deles')` para inteiro fora de
0..6 (`src/domain/agreement.ts:29-34`). *"Devolver 'não combinado' para um oitavo
dia seria educado e errado… Um guarda que não muda comportamento nenhum é
decoração, e foi o `mutate` que mostrou isso: apagar a faixa não quebrava teste
nenhum."*

#### 3. Pedido com reserva

**Declarado** (`docs/roadmap.md:255-256`): *"Hoje pedido é demanda e nada sai do
freezer porque alguém ligou — decisão escrita, e ela fica. A reserva é a camada
por cima: separar do saldo o que já tem dono."*

**Real: existe a subtração, não existe a reserva.** `app/orders/new.tsx:207-218`
calcula `livreDe(itemId) = linha.onHand - linha.requested - noRascunho` sobre o
que `stockAgainstOrders` devolve — *"Saldo menos o que outros pedidos já
reservaram, menos o que já foi digitado nesta tela"*. É **cálculo de tela sobre
demanda**, não linha de reserva no livro-razão nem coluna de estado. Não há
tabela, coluna ou `movement_kind` de reserva em nenhuma das 32 migrações.
**Reserva como registro: NÃO IMPLEMENTADO.** A conta que a substitui:
**implementada e chamada por tela.**

A decisão escrita que fica está em
`supabase/migrations/0019_an_order_is_demand.sql`, e é a mais longa justificativa
do repositório. Transcrita no essencial: *"pedido NÃO é movimento. A tentação
existe e é forte, porque `movements` já tem item, quantidade, lugar e data —
caberia. Mas o saldo é a soma dos movimentos, e um pedido não move nada: as caixas
continuam na câmara fria… Gravar demanda como movimento faria o saldo mentir no
dia em que o cliente ligou."* E a segunda razão: *"o livro-razão é append-only. Um
pedido MUDA — o cliente corrige a quantidade, adia a data, cancela. Corrigir isso
por estorno seria escrever no livro que trezentos picolés saíram e voltaram,
quando nenhum saiu do freezer. Estorno é para o que aconteceu."*

Forma de `orders`, transcrita (`supabase/migrations/0019…`):

| coluna | tipo | nota |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `company_id` | `uuid not null references companies(id) on delete cascade` | |
| `place_id` | `uuid not null` | *"loja própria, cliente, distribuidor — tudo é `locations`"* |
| `status` | `text not null default 'open'` | `check (status in ('pending','open','delivered','cancelled'))` |
| `requested_for` | `date` | *"O dia em que o cliente quer receber. A data da DECISÃO é outra e é mais cedo"* |
| `note` | `text` | |
| `created_at` | `timestamptz not null default now()` | |
| `decided_at` | `timestamptz` | |
| `recorded_by` | `uuid not null references auth.users(id)` | *"Qual CONTA escreveu, imposto pelo servidor como em `movements`"* |

Restrições: `order_place_same_company foreign key (place_id, company_id)
references locations (id, company_id) on delete restrict` e `unique (id,
company_id)`. `order_lines`: `base_units integer not null check (base_units > 0)`
— *"Zero não é pedido, e negativo é devolução — que tem caminho próprio e não é
este"* — e `unique (order_id, item_id)`, porque *"O mesmo item duas vezes no mesmo
pedido é erro de digitação, não pedido duplo."*

Índices: `orders_open_idx on orders (company_id, requested_for) where status in
('pending','open')`, `order_lines_order_idx on order_lines (order_id)`,
`order_lines_item_idx on order_lines (company_id, item_id)`.

**Aprovação é configuração da empresa**: `companies.orders_need_approval boolean
not null default false`, com comentário no banco: *"Se todo pedido nasce pendente
à espera de quem tem `approve_order`. Desligado por padrão: a fábrica pequena
entrega antes de a aprovação chegar."* O estado inicial é do **gatilho**, não da
tela: `private.order_starts_where_the_company_says()`, `before insert`, porque
*"um cliente que manda o pedido pelo próprio aparelho não pode escolher nascer
aprovado."* E `private.only_approval_leaves_pending()`, `before update`, levanta
`'Este pedido espera aprovação, e aprovar não faz parte do seu acesso.'` quando
alguém sem `approve_order` tenta tirar do pendente.

#### 4. Separação

**Declarado** (`docs/roadmap.md:258-259`): *"`pickingFor` já responde a conta.
Falta a tela de quem anda com o carrinho."*

**Real: `pickingFor` TEM chamador de tela — não é peça morta.**
`app/transfer.tsx:173` chama
`pickingFor(LOCAL_COMPANY_ID, to.id, from, localDate(nowIso(), locale.timeZone, 7))`,
e o resultado é o palpite de quantidade da carga (`app/transfer.tsx:187-190`, via
`pickSuggestion`). O e2e dirige isso: checagem *"the picking list beats the habit:
the order wins over last time"* (`e2e/flow.mjs:471`). O que falta é uma **tela
dedicada de separação**, não o chamador. **Implementado e chamado por tela, em
função de palpite; tela própria NÃO IMPLEMENTADA.**

`pickingFor(companyId, placeId, fromLocationId, through)` devolve `PickLine[]`
(`src/data/repository.ts:3200-3244`), com os campos:

| campo | o que é |
|---|---|
| `itemId` | |
| `name` | |
| `ordered` | *"Quanto foi pedido, somando os pedidos em aberto daquela loja"* |
| `orders` | *"Quantos pedidos entraram nessa soma"* — existe por um defeito real: *"A tela dizia 'pedido para 05/09: 800 un' — singular, com a data do primeiro e a quantidade de todos… Somar e rotular no singular é a única combinação que mente"* |
| `available` | *"Quanto disso a fábrica tem hoje, no lugar de onde a carga sai"* |
| `dueOn` | *"Para quando é o mais urgente dos pedidos"* — `string \| null` |

Regras escritas no docblock: *"A lista NÃO reserva nada e não escreve no
livro-razão. Ela lê pedido, que é demanda, e devolve fato: pedido, disponível e
para quando. A carga continua sendo o único evento que move estoque."* E:
*"`available` sai da sala de onde a carga vai sair, não do total da empresa: de
nada adianta saber que a fábrica tem trezentos se eles estão na outra câmara."*
O SQL filtra `o.status IN ('pending','open')` e
`(o.requested_for IS NULL OR o.requested_for <= ?)`, agrupa por item e ordena por
`due_on, i.name COLLATE NOCASE`.

#### 5. Os quatro postos de controle

**Declarado** (`docs/roadmap.md:261-262`): *"Separado, carregado, entregue,
conferido. A seção `posts` do dicionário existe nos três idiomas — fronteira
registrada."*

**Real: um dos quatro tem escritor; três não têm.**

| posto | enum no servidor | tem escritor? |
|---|---|---|
| `picked` | `control_post` (`supabase/migrations/0001_foundation.sql:179`) | **NÃO** |
| `loaded` | idem | **NÃO** |
| `delivered` | idem | **NÃO** em `movements.post` — `'delivered'` só aparece como `orders.status` (`app/orders/index.tsx:191`, `app/transfer.tsx:279`, `src/data/repository.ts:3871`) |
| `checked` | idem | **SIM** — `src/data/repository.ts:2496` grava `VALUES (?, ?, 'discrepancy', …, 'checked', ?, ?)` em `recordCheck` (`src/data/repository.ts:2436`), chamado por `app/(tabs)/transport.tsx:13` |

O enum: `create type control_post as enum ('picked', 'loaded', 'delivered',
'checked')` e `movements.post control_post` (nulável,
`supabase/migrations/0001_foundation.sql:201`). No aparelho a coluna entrou na
**V7** com o primeiro escritor, e o docblock diz por quê:
*"`control_post` existe no servidor desde a primeira migração e o aparelho nunca
teve a coluna. Ela entra agora porque a conferência de chegada é o primeiro dos
quatro postos a ganhar tela — e não antes, porque coluna sem escritor é a doença
que este repositório já documentou."* (`src/data/db.ts:349-366`)

A seção `posts` do dicionário, transcrita
(`src/i18n/locales/pt-BR.ts:1148-1153`), é **planejada/sem leitor**:

| chave | pt-BR |
|---|---|
| `picked` | `'Separado'` |
| `loaded` | `'Carregado'` |
| `delivered` | `'Entregue'` |
| `checked` | `'Conferido'` |

Existe nos três idiomas (`en.ts:1031`, `es.ts:1037`) e está registrada como
fronteira em `src/dictionary.test.ts` com o motivo *"os quatro postos de controle
(separado, carregado, entregue, conferido) — escopo da F3 escrito no plano do mês,
no CLAUDE.md"*.

A razão de os quatro existirem, do domínio: *"Comparing two posts localizes a
loss — picking error, route loss, or receiving error — without accusing anyone."*
(`src/domain/ledger.ts:48-53`)

#### 6. App do entregador

**Declarado** (`docs/roadmap.md:264-265`): *"O papel `driver` existe com
`dispatch`, `check_receipt` e `record_loss`. Falta a tela dele."*

**Real: confirmado nos dois lados.** `driver: ['dispatch', 'check_receipt',
'record_loss']` (`src/domain/access.ts:89`). Nenhuma das 24 telas de `app/` é do
entregador — a única ocorrência da palavra `driver` em `app/` é um comentário
sobre jargão de driver de banco (`app/products/new.tsx:279`). **NÃO
IMPLEMENTADO.**

A justificativa de `record_loss` estar ali está escrita: *"The driver may record a
loss because a pallet does fall off a truck, and refusing them the button is what
turns a real loss into unexplained shrinkage."* (`src/domain/access.ts:66-68`)

#### 7. Devolução

**Declarado** (`docs/roadmap.md:267-268`): *"O caminho de volta: o que a loja não
recebeu, com motivo, virando movimento."*

**Real: o caminho de volta EXISTE; o motivo, não.** `recordReturn(companyId,
input)` (`src/data/repository.ts:1767-1771`) chama
`moveBetween(companyId, input, 'return')` e é chamada por `app/transfer.tsx:226`
pelo interruptor `devolucao`. O `movement_kind` `'return'` está no enum desde a
primeira migração (`supabase/migrations/0001_foundation.sql:172-174`) e no domínio
(`src/domain/ledger.ts:26`, comentado *"came back from a route or a store"*).
**Implementado e chamado por tela.**

O que **não** existe é o **motivo** da devolução: `loss_reason` (`'melted'`,
`'broken'`, `'expired'`, `'courtesy'`, `'internal_use'` —
`supabase/migrations/0001_foundation.sql:177`, `src/domain/ledger.ts:46`) é do
movimento de **perda**, e nenhuma coluna liga motivo a `return`. **Motivo da
devolução: NÃO IMPLEMENTADO.**

O desenho de a mesma tela dar conta das duas direções está registrado em
`app/transfer.tsx:98-107`: *"A carga e a devolução têm a mesma mecânica — duas
pernas, um grupo — e a mesma tela dá conta das duas: invertendo a origem, a lista
de itens já vem do estoque de QUEM está mandando, que é a Lei 5 como desenho. Não
dá para devolver o que não está na loja porque nunca aparece para escolher. O que
muda de verdade é o tipo gravado no livro-razão, e ele muda porque o FATO é outro:
uma loja devolvendo é notícia sobre o produto; a fábrica mandando é a fábrica
movendo o que é dela."*

#### 8. O `UnitStepper`

**Declarado** (`docs/roadmap.md:270-272`): *"Componente construído e sem chamador,
decisão registrada no `CLAUDE.md` — é peça da F2/F3 e apontá-lo como defeito já
custou uma rodada. Entra quando a tela de separação existir: é ali que se conta
caixa com luva."*

**Real: confirmado. Implementado, sem chamador.**
`src/components/UnitStepper.tsx:22` exporta `UnitStepper`, 190 linhas, e a única
outra menção no repositório é a linha de fronteira em `src/dictionary.test.ts:45`.
Nenhuma tela o importa. A decisão que protege está em `CLAUDE.md:352-356`.

O propósito, do docblock: *"Nobody in a cold room thinks in '3,600 popsicles' -
they think in '12 crates'. So the tier is picked first, the amount is stepped with
large targets rather than typed on a keyboard, and the arithmetic is echoed back
in full underneath. The echo is the whole point: it removes mental math, which is
where miscounts come from, and it lets the person catch a wrong tier before
committing."* (`src/components/UnitStepper.tsx:11-21`)

A seção `stepper` do dicionário, **planejada/sem leitor**
(`src/i18n/locales/pt-BR.ts:1155-1160`): `echo: '{{parts}}'` (com o comentário
*"The echo that removes mental math: '12 engradados = 72 caixas = 3.600
picolés'"*), `decrease: 'Diminuir'`, `increase: 'Aumentar'`.

Assinatura das props: `{ hierarchy, locale, tierLabel, value, onChange, labels,
initialTierId }` (`src/components/UnitStepper.tsx:22-30`), sobre
`PackagingHierarchy`/`PackagingTier` de `@/domain/units`.

#### O risco nomeado da F3 — a ergonomia a −18 °C

Escrito nos dois arquivos, com a mesma força.

`docs/roadmap.md:274-277`: *"**O risco nomeado, e ele não se resolve escrevendo
código:** a F3 tem ergonomia que não se verifica sem aparelho na mão. Tela
capacitiva a −18 °C, luva, QR a um braço de distância. Isso pede rodadas **depois**
de alguém usar, e elas só cabem no mês se o teste acontecer junto, não no fim."*

`CLAUDE.md:407-409`: *"O risco nomeado: a F3 tem ergonomia que não se verifica sem
aparelho — tela capacitiva a -18°C, luva, QR a um braço de distância. Isso pede
rodadas depois de alguém usar, e elas cabem no mês só se o teste acontecer junto,
não no fim."*

**Três consequências já registradas no código por causa desse risco**, e vale
transcrevê-las porque são o que sobra dele:

1. **O QR carrega o código do lote, não o uuid** — decisão de tamanho de módulo,
   `src/domain/qr.ts`, transcrita em 28.6/1 acima. *"Ler a um braço de distância
   não é questão de câmera — é questão de tamanho do módulo."*
2. **O QR não herda o tema: preto sobre branco, sempre.**
   *"em modo escuro, um QR invertido é um QR que não lê"* — `src/components/QrCode.tsx:6-19`.
3. **A tinta pequena passou a respeitar a WCAG** por causa do corredor da câmara:
   *"O rótulo que diz o que o número é fica ilegível no corredor da câmara, com
   luva e condensação"* (`docs/auditoria.md`, achado 10). As seis paletas subiram
   de 2,35–4,43 para **4,6:1 ou mais**, com guarda em `src/theme/contrast.test.ts`.

E o limite honesto, do próprio relatório de auditoria: *"O contraste, o alvo de
toque com luva e o QR a um braço de distância só se resolvem com aparelho na
mão."* (`docs/auditoria.md`, seção "O que esta auditoria NÃO conseguiu olhar")

---

### 28.7 O alvo de um mês e os quatro cortes que o tornam verdade

**Decisão do dono, 1 de setembro de 2026** (`CLAUDE.md:389-409`).

O ponto de partida: *"O plano inteiro dava **4 a 8 meses**, e o que dominava esse
número não era código: o Espelho da Loja precisa de meses de movimento real, e o
fiscal é um microserviço .NET com certificado A1 e homologação na SEFAZ.
**Trabalhar mais rápido não encurta nenhum dos dois.**"* (`CLAUDE.md:389-393`)

**O que cabe em um mês é F2 + F3**, enumerado literalmente
(`CLAUDE.md:395-398`): *"produção com lote e validade, etiqueta e QR, câmara fria
com saldo, lojas e clientes com ficha de acordo, pedido com reserva, separação, os
quatro postos de controle, app do entregador, devolução. No fim disso a fábrica
para de usar papel para romaneio, conferência e etiqueta."*

Os quatro cortes, cada um com a razão escrita (`CLAUDE.md:400-405`,
`docs/roadmap.md:347-351`):

| o que ficou fora | razão escrita | o que fica DENTRO |
|---|---|---|
| **O relatório do Espelho da Loja** | *"ele **mente com duas semanas de dado**"* — entra quando houver estação inteira | **a captura entra**: contagem cega e perdas com motivo já existem e já gravam (`docs/roadmap.md:286-288`) |
| **O microserviço fiscal** | *"projeto à parte, e o plano já diz que nada depende dele"* — certificado A1, homologação SEFAZ | nada |
| **As compras inteligentes** | *"precisam do **prazo observado**, que só existe depois de meses de nota"* — *"Sem ele, é adivinhação com cara de matemática"* (`docs/roadmap.md:290-293`) | nada |
| **Os trunfos** (PAC/POD, clima, roteirização) | *"diferencial de mercado, não a dor de hoje"* | o clima já entra na tela (`app/weather.tsx`); cruzar clima com venda observada é F4 (`docs/roadmap.md:294-296`) |

**Confirmação das duas metades do primeiro corte.** A captura existe: a contagem
cega é exercitada pelo e2e — *"counting is blind, and it is the only way stock
goes down"* (`e2e/flow.mjs:1189`) — e a perda com motivo também — *"a loss is
recorded with its reason, and the report says where the money went"*
(`e2e/flow.mjs:1449`). Não existe relatório de Espelho da Loja em nenhuma das 24
telas. **Relatório: NÃO IMPLEMENTADO, por decisão escrita.**

---

### 28.8 F4 — a fábrica que se explica sozinha

**Trava por dado, não por código.** *"Tudo aqui precisa de meses de movimento real,
e trabalhar mais rápido não encurta um dia."* (`docs/roadmap.md:281-284`)

| item | estado declarado | o que destrava |
|---|---|---|
| **O Espelho da Loja** | a captura entra, o relatório espera | *"Entra quando houver estação inteira"* (`docs/roadmap.md:286-288`) |
| **Compras inteligentes** | fora | o **prazo observado** de cada fornecedor — *"o tempo real entre pedir e chegar, que só existe depois de meses de nota"* (`docs/roadmap.md:290-293`) |
| **A previsão aplicada** | o clima já entra na tela | cruzar clima com venda observada (`docs/roadmap.md:294-296`) |

---

### 28.9 F5 — o fiscal

*"Projeto à parte, e o plano inteiro é desenhado para que **nada dependa dele**.
Microserviço .NET, certificado digital A1, homologação na SEFAZ. O que trava é
administrativo: o layout quem decide é a SEFAZ, e a homologação tem fila."*
(`docs/roadmap.md:299-304`)

*"Começa quando o dono decidir começar. Não bloqueia F3, F4 nem F6."*
(`docs/roadmap.md:306`)

Existe a capacidade `issue_invoice` (`src/domain/access.ts:37`) e o ato
`issueInvoice` na lista dos cinco que nunca acontecem sem uma pessoa dizer sim
(`ALWAYS_CONFIRMED`, `src/domain/access.ts:135-141`). Nenhum microserviço, nenhum código .NET no
repositório. **NÃO IMPLEMENTADO.**

---

### 28.10 F6 — publicar nas lojas

*"O que falta não é código de produto; é a papelada e as decisões que só o dono
toma."* (`docs/roadmap.md:311`)

| item | o que é | estado |
|---|---|---|
| **A licença do clima** | *"O Open-Meteo é gratuito para uso **não comercial**. Para publicar: ou troca de provedor, ou entra plano pago. **Decisão de gasto, é do dono.**"* (`docs/roadmap.md:313-315`) | **aberto — decisão de dono** |
| **Política de privacidade e declaração de dados** | *"O que o app coleta e para onde manda — Supabase, Open-Meteo, atualizações da Expo. Exigência das duas lojas."* (`docs/roadmap.md:316-318`) | **aberto** |
| **LGPD** | *"Dado pessoal identificável: o que é, onde mora, e como se apaga a pedido."* (`docs/roadmap.md:318-319`) | **aberto** |
| **Permissões do Android** | *"Pedir só o que se usa. Permissão a mais é recusa na revisão."* (`docs/roadmap.md:319-320`) | **aberto** — `app.json` declara os plugins `expo-router`, `expo-localization`, `expo-sqlite`, `expo-notifications` e nenhuma permissão explícita |
| **O que fazer quando quebra** | *"Hoje o app tem tela de erro e nenhum relato. Sem isso, uma falha na fábrica de um cliente é invisível daqui."* (`docs/roadmap.md:321-323`) | **aberto** |
| **Ícone, splash e nome** | *"Feito em 4 de setembro: as seis superfícies saem do mesmo `markPath` do `brand.ts`, por `scripts/icons.mjs`."* (`docs/roadmap.md:324-325`) | **parcialmente real** — ver abaixo |
| **Busca de marca** | *"`NORVA` ainda não passou por busca de anterioridade no INPI (classes 9 e 42). Precisa de login gov.br — não é automatizável. Nada mais no código chumba o nome: trocar de marca é editar `src/config/brand.ts` e o `app.json`."* (`docs/roadmap.md:326-329`) | **aberto — não automatizável** |

**A ressalva sobre "ícone, splash e nome".** Os seis arquivos existem em
`assets/` (`icon.png`, `favicon.png`, `android-icon-foreground.png`,
`android-icon-background.png`, `android-icon-monochrome.png`,
`splash-icon.png`) e são gerados por `scripts/icons.mjs` — a linha 154 é
`{ arquivo: 'assets/splash-icon.png', lado: 1024, fracao: 0.50, fundo: null }`.
**Mas `app.json` não tem chave `splash` nem o plugin `expo-splash-screen`**: o
arquivo é gerado e não é ligado. É exatamente o médio que a auditoria nomeou como
*"a tela de abertura ainda ser o andaime da Expo"* (`docs/auditoria.md`), e ele
**segue aberto**.

Referências do `app.json` que a F6 governa: `name: "NORVA"`, `slug: "norva"`,
`scheme: "norva"`, `version: "0.10.0"`, `ios.bundleIdentifier:
"app.norva.mobile"`, `android.package: "app.norva.mobile"`,
`android.allowBackup: false` (fechado pelo achado 9 da auditoria),
`android.adaptiveIcon.backgroundColor: "#FAF7F2"`,
`android.predictiveBackGestureEnabled: false`,
`runtimeVersion.policy: "fingerprint"`.

---

### 28.11 F7 — os trunfos

*"Diferencial de mercado, não a dor de hoje. Roteirização de entrega, PAC/POD,
clima aplicado à produção. Entram depois da F4 porque todos precisam do dado que
ela acumula."* (`docs/roadmap.md:334-338`)

**NÃO IMPLEMENTADO**, e por decisão escrita.

---

### 28.12 A fila de trabalho de agora — o que a auditoria abriu

`docs/roadmap.md:176-218`. A auditoria está entregue: **dez frentes, trinta
achados**, em `docs/auditoria.md` com severidade, cenário e o que ela **não**
conseguiu olhar. *"Ali está o texto para o dono; aqui está a ordem de trabalho,
que é o que a próxima sessão precisa."*

**Uma regra própria da fila:** *"o número do achado nunca muda — quem já leu o
documento leu aquela lista."* (`docs/roadmap.md:181-182`, e a mesma regra escrita
em `docs/auditoria.md`: *"renumerar uma lista que alguém já leu é trocar o assunto
de baixo do dedo dele"*.)

#### Os achados de severidade ALTA — todos fechados

Transcritos de `docs/roadmap.md:184-198` e cruzados com `docs/auditoria.md`:

| nº | achado | como fechou |
|---|---|---|
| **1** | o livro-razão aceitava **item e local de outra empresa** (`movements.item_id` e `location_id` eram chaves simples) | três chaves compostas em `movements`, migração `0029_a_movement_cannot_point_at_another_company.sql`, pelo mesmo padrão que `orders` já usava; guarda: **checagem 10** do `db:verify` |
| **2** | **compra, perda e contagem sem estorno** — *"a nota de açúcar digitada com dez sacos onde era um não tem como ser desfeita"* | os três atos passam a gravar `movement_group_id` (a compra pela **NOTA**, não pela linha) e ganham a porta: o cartão "Últimos lançamentos" na tela do insumo desfaz no toque |
| **3** | **estornar uma corrida deixava o custo médio errado para sempre** | `recomputeItemCost` refaz a média dobrando o livro-razão sem a corrida errada e sem a perna do estorno; guarda: duas mutações curadas |
| **4** | **a câmara fria meio invisível** — três leituras fixavam o almoxarifado: o cartão de validade da capa, o alarme do celular, e a conta de quanto dá para prometer | as três consertadas; o aviso de validade passou a seguir o **lote**, e a conta de prometer a somar **todas as nossas salas** |
| **5** | **com insumo na câmara, a produção ficava impossível**, com diálogo em inglês | a tela lê o piso da sala em que o tacho roda, impede em vez de reclamar, diz **onde** o insumo está sala por sala, e o erro do livro-razão virou frase de tela nos três idiomas |
| **6** | **a contagem prometia um número e gravava outro** (diálogo comparava com a empresa inteira, razão escrevia contra o almoxarifado) | a sala viaja pela rota; `findItem` e `itemMovements` respondem pela sala; item em mais de um lugar e nenhum escolhido **não** oferece contagem |
| **7** | **quarta aparição da fila travada** — o lugar padrão era recusado para seis dos sete papéis, inclusive `operator` | `supabase/migrations/0030_the_default_room_is_bookkeeping_not_a_privilege.sql` |
| **8** | **apagar uma área menor travava a fila para sempre** (órfãs na fila) | a varredura esquece, na mesma transação, o que a fila ia mandar de linha apagada — e só o que nunca subiu (`sent_at` nulo) |
| **9** | **o livro-razão saía do celular pelo backup do Android** | `allowBackup: false` no `app.json`, com guarda em `src/release.test.ts` — junto com o `versionCode` que colidia (0.10.0 e 1.0.0 davam 100000 os dois) |
| **10** | **o texto pequeno reprovava contraste** | as seis paletas subiram para **4,6:1 ou mais**; guarda em `src/theme/contrast.test.ts` lendo as cores do arquivo de tokens |
| **11** | **não havia caminho para os outros dois idiomas nem para outra moeda** | idioma e moeda viraram **escolha da empresa**, com o aparelho como palpite do primeiro dia; fechou de passagem o **fuso chumbado em `America/Sao_Paulo`**, que fazia Manaus imprimir a data errada na etiqueta |

**"Com isso a lista de severidade ALTA da auditoria está vazia."**
(`docs/roadmap.md:200`)

#### O que sobra

`docs/roadmap.md:200-203`: *"O que sobra são os médios, e o que ela declarou não
ter conseguido olhar: a segunda lente adversarial, o teste de carga real, as duas
vulnerabilidades que o `npm audit` não alcança deste ambiente, e **nada visto numa
fábrica** — que é a lacuna que nenhum teste fecha."*

**A fila de pé tem exatamente um item numerado** (`docs/roadmap.md:211-218`):

> **1. Os médios que sobraram** — nove, agora que o `versionCode`, o `recorded_by`
> cedível, o percentual com ponto e o ícone de picolé caíram. Entre eles: a
> embalagem abaixo de meio centavo virando de graça, a aprovação de pedido que
> nunca atravessa, a tela de abertura ainda ser o andaime da Expo, e
> `forgetSentBefore` sem chamador fora de teste.

A aritmética confere: a auditoria contou **treze** médios (`docs/auditoria.md`),
quatro caíram, sobram nove.

**Mas a lista completa dos treze médios NÃO ESTÁ NO CÓDIGO nem em nenhum
documento.** `docs/auditoria.md` nomeia sete deles (`recorded_by` cedível no
pedido, a embalagem abaixo de meio centavo, a aprovação de pedido que nunca
atravessa, o percentual com ponto, o ícone de "Produção" ser um picolé, a tela de
abertura ser o andaime da Expo, o `versionCode` que para de crescer em 1.0.0), dos
quais quatro já caíram; o roadmap acrescenta `forgetSentBefore`. Somando: **4 dos
9 médios remanescentes têm nome escrito; 5 não têm.** Quem reconstruir não recupera
esses cinco de nenhum arquivo deste repositório.

Os quatro médios nomeados, conferidos no código:

| médio | estado real medido |
|---|---|
| **a embalagem abaixo de meio centavo virando de graça** | **CONFIRMADO.** `unitPackagingCents` é tipado `Cents` — inteiro (`src/data/repository.ts:1790`, `:1903`), a tela escreve `fromDecimal(num(packagingCost) || 0)` (`app/products/new.tsx:339`), e o custo unitário soma `consumedValue / input.unitsProduced + product.unitPackagingCents` como `Rate` (`src/data/repository.ts:1481`). Embalagem a R$ 0,004 por unidade arredonda para **zero** antes de qualquer multiplicação — é a fundação `Cents`/`Rate` violada num campo só |
| **a aprovação de pedido que nunca atravessa** | **CONFIRMADO.** O servidor tem gatilho e política (`0019`, transcritos em 28.6/3), mas o aparelho não: `setOrderStatus` (`src/data/repository.ts:4093-4106`) faz `UPDATE orders SET status = ?, decided_at = ? WHERE id = ? AND company_id = ?` **sem checar capacidade nenhuma**, e `app/orders/index.tsx:70-89` chama isso direto. Localmente, aprovar é um toque de qualquer um |
| **a tela de abertura ainda ser o andaime da Expo** | **CONFIRMADO.** `assets/splash-icon.png` é gerado (`scripts/icons.mjs:154`) e `app.json` não tem chave `splash` nem plugin de splash |
| **`forgetSentBefore` sem chamador fora de teste** | **CONFIRMADO.** Definido em `src/data/outbox.ts:139`, importado só por `src/data/repository.test.ts:69` e chamado só em `src/data/repository.test.ts:774`. **Implementado, sem chamador de produção** |

#### Os quatro achados da varredura de sete eixos, já fechados

`docs/roadmap.md:96-174`. Vieram de *"uma varredura de sete eixos com refutação
adversarial: **19 achados julgados, 4 de pé, 15 derrubados.** A refutação foi dura
de propósito — item errado manda a próxima sessão construir o que já existe."*
Fechados no commit `1fcbadc`. Ficam transcritos porque cada um deixou uma lição
sobre como procurar:

**1. A fila travava para sempre atrás de um pedido reenviado** — crítica.
`supabase/migrations/0027_a_resend_is_not_a_decision.sql`. *"Terceira aparição da
mesma família, e a primeira com cara nova. A 0015 consertou
`purchases`/`purchase_lines`, a 0020 consertou `lots`, e nas duas o defeito era
tabela com política de insert e **nenhuma** de update. Aqui `orders` **tem**
política de update — com a capacidade errada. Entra com `place_order`; só mexe
quem tem `approve_order`, `dispatch` ou `manage_company`. Três dos sete papéis
(`storeManager`, `customer`, `salesperson`) têm o primeiro e nenhum dos três."*
Na fábrica: *"a gerente da loja anota o pedido sem sinal. A primeira subida entra.
A segunda é recusada, e o engine para a fila no primeiro buraco de propósito —
então produção, contagem e leitura de câmara gravadas **depois** ficam presas
atrás daquele pedido para sempre, sem nada na tela dizendo o quê."*
**O que ele deixou atrás de si vale mais que ele:** a frase escrita no
`insights.md` depois da 0015 — *"todas as outras têm um `_manage FOR ALL`, que
cobre update"* — é o que fez a busca falhar. E a barra não pegava porque a
checagem 6 sobe a fila com **todas** as capacidades e a checagem 8 dá `dispatch`
junto com `place_order`. A **checagem 9** sobe a fila duas vezes pela capacidade
**mínima** de um papel real, e ela morde: sem a migração, reprova com `new row
violates row-level security policy`.

**2. "Apagar tudo" não apagava nada depois da primeira produção** — alta.
`src/data/erase.ts`. *"O conjunto fechado conhecia **12** das **21** tabelas do
aparelho. Cinco das nove que faltavam apontam para `items` ou `locations` com `ON
DELETE RESTRICT` — e é justamente `items` e `locations` que o apagar-tudo apaga.
Toda corrida de produção grava um `lots`, então a partir da **primeira corrida** o
SQLite levantava `FOREIGN KEY constraint failed`, a transação voltava atrás, nada
era apagado, e a tela mostrava texto cru de SQLite em inglês — depois do toque."*

**3. Apagar "compras" apagava o livro-razão inteiro** — alta.
`src/data/erase.ts`. *"`tablesFor('purchases')` começa com `movements`, e o
`DELETE` é por empresa: levava produção, contagem, perda, transferência e saída. A
confirmação dizia 'isso apaga as compras, e zera o custo médio'. Não dizia que um
movimento ia. Irreversível pelo texto da própria tela, e sem cópia no servidor."*
*"A regra da casa já era essa — a confirmação diz o que vai acontecer, com os
números por extenso. **Faltava o número.**"*

**4. A guarda comparava uma lista escrita à mão consigo mesma** — média.
`src/data/erase.test.ts`. *"Ela percorria um `Record` com as mesmas doze entradas
do union e perguntava se cada uma estava na lista — 'todo membro do conjunto
fechado está na lista do conjunto fechado'. Uma tabela fora do union era invisível
**por construção**: o autor do mapa e o autor da lista eram a mesma pessoa
lembrando das mesmas doze tabelas."* Agora ela **lê** `db.ts` — as tabelas e as
arestas de RESTRICT, inclusive as que entram por `ALTER` em migrações posteriores.
*"É o mesmo conserto que o `db:verify` fez quando parou de rodar como
superusuário: perguntar ao sistema em vez de à lembrança."*
E o registro de um alarme inventado que ela produziu na primeira execução:
*"cobrando de 'apagar produtos' a regra do 'apagar tudo'. Não vale: `blockerFor`
recusa aquelas áreas **antes** do toque, com o número junto, que é a Lei 5."*

---

### 28.13 O portão que decide a ordem — por item, não por fase

Escrito nos dois arquivos com a mesma estrutura (`CLAUDE.md:411-430`,
`docs/roadmap.md:374-397`). Três perguntas, nesta ordem, e **a primeira que
reprovar decide.**

#### P1 — Quem chama isto no mesmo commit?

*"Sem chamador, não entra. Fim."* (`CLAUDE.md:414`)

*"É a doença provada deste repositório: `assistant_phrase` com índice dedicado e
nenhuma escrita, `Draft.kind` sem leitor, `balanceAt` e `daysOfCover` chamados só
por teste, quatro seções de dicionário nos três idiomas sem uma tela. **O número
da fase não pegou nenhuma delas.**"* (`CLAUDE.md:414-418`)

A versão do roadmap acrescenta as três saídas honestas
(`docs/roadmap.md:379-384`): *"Quando nada chama uma peça há **três** respostas
honestas — trazer o chamador, apagar a peça, ou registrar a fronteira com quem vai
chamá-la. **Escrever teste não é uma delas:** já foi tentado, e só tornou a morte
mais difícil de ver."*

Esse portão tem uma guarda executável: `src/dictionary.test.ts` mede **seção** de
dicionário sem leitor e exige uma fronteira escrita em `ESCRITAS_ADIANTADO` com
**quem** vai ler (`motivo.length > 40`), mais um segundo teste que reprova quando
uma fronteira ganhou leitor e a linha não saiu. O docblock conta que a doença era
maior do que o `CLAUDE.md` dizia: *"O `CLAUDE.md` cita… 'quatro seções de
dicionário nos três idiomas sem uma tela'… e quando eu varri o dicionário hoje
eram **sete**."* Quatro saíram porque eram rascunho anterior já substituído —
`areas` (um menu de oito áreas que não existe), `production`, `confirmation` e
`assistant` (que diziam em outras palavras o que `app.production`,
`app.transfer.confirmBody` e `app.assistant` já dizem). **Três ficaram, e são
exatamente as três da F3: `posts`, `stepper`, `scan`.**

E a fronteira do próprio teste, declarada: *"ele mede SEÇÃO, não chave. Uma
varredura por chave acusou 44 folhas sem leitor aparente, e boa parte é falso
positivo do detector (leitura por índice dinâmico, chave montada)."*

#### P2 — Complete: "eu mudaria isto se eu visse ___"

*"Se a frase sai, o item depende de observar alguém."* (`CLAUDE.md:420-421`)

**Mas antes de travar, cheque a F7:** *"se o que muda com a observação é
*preferência de quem usa*, não é pergunta nem espera — é configuração, e os dois
caminhos existem. **Só trava o que nenhuma configuração resolve.**"*
(`CLAUDE.md:421-424`, `docs/roadmap.md:386-389`)

#### P3 — Entrando errado, conserta com um commit ou com migração e estorno?

*"Se toca `supabase/migrations/`, o caminho de escrita de `movements`, ou a
semântica de `movement_kind`/`location_kind`, é caro e permanente. Forma de
esquema se adivinha de graça enquanto há zero linhas; conteúdo de livro-razão não
se corrige, se estorna."* (`CLAUDE.md:426-430`)

**A consequência prática, que é o que ordena a lista**
(`docs/roadmap.md:396-397`): *"o que é P3 e está barato agora sobe na lista, e o
que é P2 puro espera uso real em vez de virar código adivinhado."*

Os dois enums que P3 protege, transcritos por inteiro:

`movement_kind` (`supabase/migrations/0001_foundation.sql:172-174` + `'purchase'`
por `0007_movement_kind_purchase.sql:16`), dez valores, com o comentário do
domínio (`src/domain/ledger.ts:19-29`):

| valor | o que significa |
|---|---|
| `purchase` | chegou de um fornecedor contra uma nota |
| `production` | produto acabado criado |
| `consumption` | insumos puxados por uma corrida de produção |
| `transfer` | movido entre locais (loja própria: não é receita) |
| `sale` | vendido a um cliente (receita + margem) |
| `loss` | derretido, quebrado, vencido, cortesia, uso interno |
| `return` | voltou de uma rota ou de uma loja |
| `adjustment` | correção de contagem física |
| `discrepancy` | diferença encontrada num posto de controle |
| `reversal` | cancela um movimento anterior, nunca apaga |

`location_kind` (`supabase/migrations/0001_foundation.sql:109`), seis valores:
`'factory'`, `'cold_room'`, `'store_room'`, `'own_store'`, `'customer'`,
`'vehicle'`.

E as duas réguas que o domínio derivou deles (`src/domain/ledger.ts:56-73`):

- `INTERNAL_PLACE_KINDS = ['factory', 'cold_room', 'store_room']` — *"As salas da
  própria fábrica — os lugares de onde a carga SAI."* O docblock registra por que
  ela existe: *"O predicado estava escrito três vezes: em `app/places.tsx` (o tom e
  o ícone da linha), em `app/orders/new.tsx` (quem pode ser destino de um pedido)
  e, a partir da conta de quanto dá para prometer, também em SQL. Três grafias de
  uma regra é a forma que produz divergência — e esta em particular decide se um
  pedido pode ser aceito, então divergir aqui é prometer o que não existe."* E a
  ausência deliberada: *"`vehicle` não está em nenhum dos dois lados de propósito:
  caminhão é caminho, não é sala nem destino."*
- `receivesCargo(kind) => kind === 'own_store' || kind === 'customer'` — *"Quem
  RECEBE carga: loja própria e cliente. O resto é sala interna ou caminho."*

`loss_reason` (`supabase/migrations/0001_foundation.sql:177`): `'melted'`,
`'broken'`, `'expired'`, `'courtesy'`, `'internal_use'`. O domínio registra uma
cicatriz de vocabulário: *"The device wrote camelCase here for months; SQLite would
have taken it (the column is TEXT), the outbox would have queued it, and Postgres
would have refused the row with nobody watching. It cost nothing to fix because no
loss has ever been recorded — **which is the only window where a ledger's
vocabulary is free to change.**"* (`src/domain/ledger.ts:36-46`)

---

### 28.14 Fora do escopo por decisão escrita, e as decisões que restringem desenho futuro

*"Não se re-litiga o que já foi decidido. A razão é o que impede a decisão de
voltar como 'boa ideia' numa sessão futura."* (`docs/roadmap.md:341-344`)

A tabela dos quatro cortes está transcrita em 28.7. As **decisões do dono que
restringem desenho futuro** (`docs/roadmap.md:353-370`, com as versões longas em
`CLAUDE.md:314-348`):

| decisão | forma exata |
|---|---|
| **Entrada no chão de fábrica é configuração da empresa** | PIN numa grade de nomes (compartilhado, *"dois segundos, de luva, offline"*) **e** conta pessoal (*"entra uma vez e fica"*). Os dois existem; a empresa escolhe |
| **Quem cria a empresa é o dono** | cadastrando-se sozinho; daí ele cadastra pessoas **ou** aprova quem pediu associação por um código da empresa. Os dois caminhos |
| **O relatório fala de onde, não de quem** | o livro-razão sempre grava quem (`recorded_by`, obrigatório desde a primeira migração); nomear na tela é opt-in por `names_who_recorded`. A responsabilidade vem do **aparelho** ser cadastrado com um responsável: *"o movimento aponta para o aparelho, o aparelho aponta para uma pessoa"* |
| **`recorded_by` e `operator_id` são duas perguntas** | `recorded_by` = qual conta escreveu, **imposto pelo servidor e incedível**; `operator_id` = quem estava com o aparelho. *"uma coluna só respondendo as duas é erro — já custou uma rodada inteira"* |
| **O login autentica o sistema, não a pessoa** | *"A conta é da empresa… não é o e-mail pessoal do operador que entra no app. Quem estava operando é anotação do registro, escolhida na hora, não identidade da sessão."* (`CLAUDE.md:331-337`) |
| **Aparelho emprestado entra como produção e nada mais** | papel `operator`, sem custo, sem preço, sem dinheiro. *"O aparelho continua respondendo."* |
| **O operador confere a prateleira** | *"O que protege o número é o piso — contagem perguntada toda vez, gravada como diferença —, não a permissão."* A versão longa (`CLAUDE.md:343-348`) e a justificativa dentro do próprio código (`src/domain/access.ts:75-86`): *"a balance nobody has checked in months is worse than one an operator corrected this morning"* |
| **A luz da tela é do aparelho, e o padrão é o claro** | decisão do dono, 4 de setembro. Claro, escuro e seguir o aparelho: **os três caminhos existem** (`docs/roadmap.md:369-370`) |

**E a advertência que precede qualquer conserto** (`CLAUDE.md:352-362`): *"Antes de
chamar algo de defeito, procure a decisão."* Três vezes numa sessão foi apontada
"violação de fundação" no que era fronteira registrada: o `UnitStepper` sem uso, o
`[por quê?]` ausente na home (a conta abre num toque, na receita) e o assistente
monolíngue (*"que tem o raciocínio inteiro escrito no topo do
`src/assistant/index.ts`, inclusive quando deixa de valer"*). *"O custo não é o
tempo perdido, é pior: eu quase 'consertei' uma decisão que alguém tomou por um
motivo que eu não tinha lido."*

---

### 28.15 Resumo do estado real, por item do mês

Consolidando as medições acima, com os três estados que o dossiê exige.

#### Implementado e chamado por tela

| item | onde |
|---|---|
| produção com lote, validade e versão de receita | `src/data/repository.ts:1311` (`recordProduction`), `:1516-1517`; `app/production/new.tsx`; `supabase/migrations/0020`, `0026` |
| etiqueta com QR na tela | `app/lots/[id].tsx:209`; `src/domain/qr.ts`; `src/components/QrCode.tsx` |
| câmara fria como local, com saldo próprio | `balanceByLocation` (`src/data/repository.ts:537`), `stockByPlace` (`:781`), `lotsInStock` (`:3017`) |
| leitura de câmara (temperatura etc.), digitada ou de sensor | `recordReading` (`src/data/repository.ts:2769`); `supabase/migrations/0024`, `0031` |
| ficha de acordo da loja: telefone, dias de entrega, nota | `app/places.tsx:645-712`; `src/domain/agreement.ts`; `supabase/migrations/0021` |
| pedido como demanda, com status e aprovação configurável | `saveOrder` (`src/data/repository.ts:3986`), `app/orders/new.tsx`, `app/orders/index.tsx`; `supabase/migrations/0019` |
| a conta de "quanto ainda dá para prometer" | `stockAgainstOrders` (`src/data/repository.ts:4147`), lida em `app/orders/new.tsx:207-218` |
| lista de separação como palpite de carga | `pickingFor` (`src/data/repository.ts:3200`) ← `app/transfer.tsx:173` |
| devolução como movimento `return` | `recordReturn` (`src/data/repository.ts:1767`) ← `app/transfer.tsx:226` |
| o quarto posto de controle (`checked`) | `recordCheck` (`src/data/repository.ts:2436`) ← `app/(tabs)/transport.tsx:13` |
| lista de compras por plano de tachos | `shoppingList` (`src/domain/recipe.ts:360`) ← `src/assistant/skills.ts:1025` |
| estorno de compra, contagem e perda pela tela do insumo | `planReversal` (`src/data/repository.ts:4245`), `reverseGroup` (`:4442`) |

#### Implementado, sem chamador

| peça | onde | fronteira registrada? |
|---|---|---|
| `UnitStepper` | `src/components/UnitStepper.tsx:22` (190 linhas) | sim — `src/dictionary.test.ts:45` e `CLAUDE.md:353` |
| seção `posts` do dicionário (3 idiomas) | `pt-BR.ts:1148`, `en.ts:1031`, `es.ts:1037` | sim — `src/dictionary.test.ts:42-43` |
| seção `stepper` do dicionário (3 idiomas) | `pt-BR.ts:1155`, `en.ts:1038`, `es.ts:1044` | sim |
| seção `scan` do dicionário (3 idiomas) | `pt-BR.ts:1162`, `en.ts:1044`, `es.ts:1050` | sim |
| `forgetSentBefore` | `src/data/outbox.ts:139` | **não** — é um dos nove médios abertos |
| `serialize` do sync | citado em `docs/auditoria.md`: *"`serialize` não tem chamador de produção, porque o transporte é injetado e nenhum existe ainda"* | registrado na auditoria |
| `movements.post` para `picked`, `loaded`, `delivered` | `supabase/migrations/0001_foundation.sql:179`, `src/data/db.ts:366` | sim, por implicação da seção `posts` |

#### Planejado / NÃO IMPLEMENTADO

| item | por quê |
|---|---|
| leitor de QR (câmera) | nenhuma dependência de câmera no `package.json`; a seção `scan` espera a tela |
| impressão da etiqueta | *"A escolha de qual impressora a fábrica compra é do dono, e ela muda o formato do papel, não o conteúdo"* (`app/lots/[id].tsx`) |
| **preço** e **prazo** na ficha de acordo | a 0021 só criou telefone, dias e nota |
| reserva como registro (não como subtração de tela) | nenhuma tabela, coluna ou `movement_kind` |
| tela dedicada de separação | o `pickingFor` já é lido pela transferência; a tela de carrinho não existe |
| os postos `picked`, `loaded`, `delivered` como escrita | coluna existe, escritor não |
| app do entregador | `driver` tem as três capacidades; nenhuma tela |
| motivo da devolução | `loss_reason` é da perda; `return` não tem motivo |
| transferência entre salas nossas | a origem é sempre o lugar padrão (`app/transfer.tsx:128`) |
| "salas nossas somadas" como configuração da empresa | trava no P3 — decisão de dono pendente |
| relatório do Espelho da Loja | corte escrito: *"mente com duas semanas de dado"* |
| compras inteligentes | corte escrito: precisa do prazo observado |
| previsão de demanda com clima | corte escrito: F4 |
| microserviço fiscal (F5) | corte escrito: projeto à parte |
| roteirização, PAC/POD (F7) | corte escrito: depois da F4 |
| splash configurada no `app.json` | médio aberto |
| relato de falha em produção | item aberto da F6 |
| política de privacidade, LGPD, revisão de permissões Android | itens abertos da F6 — papelada, não código |
| busca de anterioridade de `NORVA` no INPI (classes 9 e 42) | *"Precisa de login gov.br — não é automatizável"* |

---

### 28.16 O que a auditoria declarou não ter conseguido olhar

Transcrito de `docs/auditoria.md`, porque é a fronteira do que se sabe sobre o
estado do produto:

- **A segunda lente adversarial foi cortada.** *"O desenho previa dois
  verificadores independentes por achado — sessenta agentes. Nesta máquina, com
  dois núcleos livres, isso levaria cerca de nove horas. Os trinta achados vêm da
  leitura dos dez auditores, muitos com reprodução executável própria; eu
  verifiquei pessoalmente **seis**… Os outros carregam a evidência de quem os
  achou, e ainda precisam da segunda leitura antes de virar conserto."*
- **Nada foi visto numa fábrica.** Nível E3. *"O contraste, o alvo de toque com
  luva e o QR a um braço de distância só se resolvem com aparelho na mão."*
- **Não houve teste de carga real**, só medição de consulta. *"A conclusão sobre a
  capa vem de um SQLite com dois anos de movimento sintético."*
- **As duas vulnerabilidades moderadas** que o GitHub aponta não puderam ser
  lidas: *"o `npm audit` não alcança o registro deste ambiente."*

E o veredito de três frases, que é o resumo mais honesto do estado do produto
(`docs/auditoria.md`, escrito antes dos onze fechamentos): *"**Uma fábrica pode
começar a usar isto amanhã, com uma condição: uma fábrica só, e com o estoque num
lugar só.** O que quebra primeiro não é o cálculo — a aritmética do dinheiro e do
livro-razão está sólida e foi provada — é a **câmara fria**."* Depois dos onze
fechamentos, a condição da segunda metade caiu; a primeira — uma fábrica só —
permanece como **NÃO VERIFICADO** neste repositório: o multi-empresa tem `company_id`
e RLS em toda tabela e o **isolamento de leitura** foi exercitado tabela por
tabela, mas nenhuma fábrica real usou o produto.
