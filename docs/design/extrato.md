# O extrato — estudo, 6 de setembro

Levantado por varredura adversarial contra a árvore de trabalho, e **as três coisas
da PARTE 0 mudaram o desenho inteiro** — elas vêm antes dos seis caminhos porque
decidem o que cada um deles significa.

Duas delas já foram consertadas no mesmo dia (o ponto único de arredondamento e a
data do estorno virando regra escrita, com teste). A terceira — o razão do aparelho
não ser append-only — não trava nada: ela decide o **nome** do documento. Extrato do
aparelho é *conferência*; documento para terceiro é do servidor.

Este arquivo é estudo, não plano. O plano é o `docs/roadmap.md`, item 1 da fila.

---

# O EXTRATO — desenho a fundo

Medi tudo contra a árvore de trabalho antes de desenhar. Três coisas que eu não esperava mudaram o desenho inteiro, e elas vêm **antes** dos seis caminhos porque decidem o que cada um deles significa. Depois delas, cada caminho com o que existe, o que falta, P1/P2/P3 e risco. No fim, a ordem e o que eu não faria.

---

## PARTE 0 — Três achados que precedem os seis caminhos

### 0.1 O aplicativo tem DUAS avaliações do mesmo estoque, e só uma é prova

Este é o achado que mais importa, e ele é aritmético, não de opinião.

- **`stockByPlace`** (`src/data/repository.ts:1073`) valoriza o saldo com o custo médio de **hoje**: o SQL faz `LEFT JOIN item_costs c ON c.item_id = m.item_id` (`:1096`) e a tela multiplica `cents((r.rate ?? 0) * r.base_units)` (`:1120`). `item_costs.average_rate` é **sobrescrito no lugar** (`:502-509`, `ON CONFLICT ... DO UPDATE SET average_rate = excluded.average_rate`), e `reverseGroup` o recompõe depois de todo estorno (`:5638`, `recomputeItemCost`).
- **`itemMovements`** (`src/data/repository.ts:1288`) devolve `unit_cost_rate` **congelado por linha** (`:1327`), que é o que a `0008_ledger_speaks_phase_one.sql:76-80` criou de propósito ao largar `unit_cost_cents`.

Consequência: **um extrato que soma taxas congeladas não fecha com o valor que a tela do lugar mostra.** Não é bug de arredondamento — é outra pergunta respondida com o mesmo rótulo. Compre polpa a 1,24 ¢/g em março, a 1,60 ¢/g em outubro: o saldo de março re-lido hoje vale 1,60; a linha de março continua valendo 1,24.

E há um segundo autor de arredondamento junto: `:1120` usa `cents(rate * qty)` em vez de `amountOf(rate, qty)` (`src/domain/money.ts:58`). Dão o mesmo `Math.round` hoje, e é exatamente a coincidência aritmética que o `mutate` já pegou uma vez neste projeto (`CLAUDE.md`, o `Math.round`→`Math.floor` que 92 testes não viram).

**A decisão que isto força, e ela é minha, não do dono:** um extrato é o razão, e o razão é a taxa congelada. Então a régua do extrato é `amountOf(unitCostRate, baseUnits)` linha por linha, e o valor do saldo no extrato é a **soma das linhas** — nunca `saldo × média de hoje`. O custo médio continua servindo para o que ele foi feito: precificar receita e decidir compra. Mas ele não pode assinar documento, porque ele muda.

Isso não é detalhe de implementação: é o que separa os seis caminhos de "relatório" e os põe em "prova". E é a única coisa aqui que, feita errada, produz um documento **bonito, verde e falso** — o pior caso que este repositório já registrou.

### 0.2 O estorno já nasce na data de hoje — e isso é o fechamento de período, de graça, sem ninguém ter escrito

`reverseGroup` (`src/data/repository.ts:5560`) faz `const occurred = input.occurredAt ?? at` (`:5569`) e grava esse `occurred` na perna do estorno (`:5605`). Os **dois** chamadores de produção omitem o parâmetro:

- `app/inputs/[id].tsx:505` → `reverseGroup(LOCAL_COMPANY_ID, { groupId: move.groupId })`
- `app/lots/[id].tsx:133` → idem

Ou seja: **estornar em outubro um erro de março escreve uma linha em outubro.** O saldo de março, cortado por `occurred_at <= '2026-03-31'`, não se move. O fechamento de período **já está estável** e ninguém sabe — não há docblock dizendo isso, não há teste protegendo isso, e o parâmetro `occurredAt` está aberto para o próximo que achar "mais correto" datar o estorno no dia do erro. No dia em que alguém fizer isso, o número que o contador viu em março muda em outubro, em silêncio, e o fechamento vira ficção.

Isto reordena o caminho 2 inteiro: **o fechamento de período não precisa de tabela de retrato para ser correto. Precisa de uma regra escrita e um teste.** A tabela de retrato serve a outra coisa (§2.3), e é bem menos urgente do que parece.

### 0.3 No aparelho, o razão NÃO é append-only — e é isto que impede prometer prova

- Não existe um único `TRIGGER` em `src/data/db.ts` (grep vazio). O `movements_are_immutable` (`supabase/migrations/0001_foundation.sql:245-247`) é **só do servidor**.
- `src/data/erase.ts:125, 135, 148` apaga `movements` em bloco, por área, com o raciocínio escrito e correto para o que ele faz (`:115-121`: *"um ajuste não pode sobreviver ao saldo que ele ajustou"*).
- E há uma assimetria fina que o extrato expõe: `movements.recorded_by` **foi removida do aparelho** (`src/data/db.ts:323`, V5 — `ALTER TABLE movements DROP COLUMN recorded_by`), com o motivo certo (`:307-321`: a conta que escreve é sempre a que sincroniza, e o serializador a preenche em `src/sync/serialize.ts`, `build: (_row, actor) => ({ recorded_by: actor.userId })`). E `device_id` **nunca existiu** no aparelho, registrado em `src/sync/columns.test.ts:140-160` como promessa que viaja nula para sempre.

Somando: hoje um documento gerado no celular não tem **signatário**. Tem `operator_id` (quem estava com o aparelho — `people`, `src/data/db.ts:754`), não tem qual conta assinou, não tem qual aparelho, e a tabela de onde ele sai pode ser apagada por um botão de Ajustes.

**A regra que sai disso, e ela é a diferença entre honesto e vendedor:** documento que se chama prova diz de onde ele vem. Extrato do aparelho é **conferência** — verdadeiro, útil, assinado por "este aparelho, este operador, esta data". Documento para terceiro (contador, fisco, cliente em disputa) é **do servidor**, porque é lá que `recorded_by` é imposto por política e o `UPDATE`/`DELETE` levanta exceção. Isso não trava nada hoje: trava só o adjetivo.

---

## CAMINHO 1 — O extrato como exportação fiscal antes de existir nota fiscal

O contador quer duas coisas: **estoque no fechamento** e **custo do que saiu (CMV)**. Os dois são derivados do razão, e nenhum depende de SEFAZ, certificado A1 ou do microserviço .NET que o `CLAUDE.md` põe fora do escopo.

### O que já existe

- **A consulta, com a permissão no lugar certo.** `itemMovements` (`src/data/repository.ts:1288`) roda `const dinheiro = (await canSeeMoney(companyId)) ? 1 : 0` **antes** do SELECT (`:1311`) e o SQL faz `CASE WHEN ? = 1 THEN m.unit_cost_rate END` (`:1327`). Para quem não vê custo o número **não existe na resposta** — a fundação cumprida na forma mais forte que ela tem. O docblock em `:1291-1298` já antecipou este caminho por escrito: *"no dia em que alguém desenhar o `[por quê?]` do saldo, o vazamento nasceria pronto"*. Nasceria **fechado**, e é por isso que este é o caminho mais barato dos seis.
- **Filtro de sala já no parâmetro** (`:1297-1301`, `locationId?`), com o motivo escrito: um saldo de sala dizendo "conferido em 3/9" com a conferência de outra sala é afirmação falsa.
- **Chamador vivo, desenhando 8 linhas**: `app/inputs/[id].tsx:954-989`, com `.slice(0, 8)` (`:964`), rótulo por `t.movement[kind]`, data e quantidade assinada.
- **Vocabulário completo nos três idiomas, dez espécies**: `src/i18n/locales/pt-BR.ts:1597-1608`, `en.ts:1276-1287`, `es.ts:1282-1293`.
- **O recorte de dia no fuso do galpão**: `dayWindow` (`src/domain/day.ts:49`), que pergunta ao `Intl` em vez de fazer aritmética — correto num dia de 23 ou 25 horas.
- **O corte por data já tem precedente vivo em SQL**: `lotsInRoomAt` (`src/data/repository.ts:3708`, SQL em `:3728` com `AND m.occurred_at <= ?`) é o **único** `occurred_at <= ?` do repositório, e `src/domain/ledger.ts:196-200` já registra por escrito que essa é a forma certa (a dobra em memória `balanceAt` morreu, com razão: *"o aplicativo nunca tem os movimentos em memória, tem SQLite"*).
- **`amountOf`** (`src/domain/money.ts:58`) — o único ponto de arredondamento do sistema.

### O que falta

1. **`occurred_at <= ?` nas somas de saldo.** `balanceByLocation` (`:625-632`), `stockByPlace` (`:1091-1101`) e o total de `listItems` somam o razão inteiro, sem teto de tempo. É um `AND` por consulta — e a decisão de §0.1 diz que a versão do extrato soma `amountOf` por linha, não `saldo × média`.
2. **Saldo corrente por linha.** Nenhum `SUM() OVER` existe no projeto (conferido em `src/data/*.ts`). Sem "saldo anterior → movimentos → saldo final" é lista, não extrato — e é a coluna que faz um contador conferir sem calculadora.
3. **Período com as duas bordas.** Nada consulta `>= from AND < to` para um item. `dayWindow` já dá as bordas.
4. **Valor por linha.** O número chega ao componente e nenhuma tela o desenha. Como o portão é da consulta, desenhar é a metade segura — mas com `amountOf(unitCostRate, baseUnits)`, nunca `rate * qty / 100` inline. `multiplyCents` está registrado como sem chamador em `src/layers.test.ts:625` justamente para a primitiva certa existir antes de a errada nascer.
5. **A linha é curta.** `MovementRow` (`:557-577`) não leva `recordedAt`, `locationId`, `counterpartLocationId`, `lotId`, `post`, `lossReason`, `returnReason`, `operatorId` nem `reversesMovementId` — **todos existem na tabela local** (`src/data/db.ts:225-253` mais V5 `:322`, V7 `:344-345`, V9 `:366`, V19 `:721`). Nenhuma migração; oito colunas de SELECT.
6. **O CMV não existe como consulta.** Custo do que saiu = `Σ amountOf(unit_cost_rate, |quantity|)` sobre as espécies de **saída** dentro da janela. E aqui está o desenho fino que ninguém fez: **quais espécies contam.** `movement_kind` tem dez valores (`src/i18n/locales/pt-BR.ts:1597-1608`); uma transferência entre duas salas nossas é **duas pernas espelhadas** e não é saída de nada; uma `discrepancy` de zero (`0017_a_check_that_matched_is_a_fact.sql:24-25`) é prova de conferência e não é custo; um `adjustment` de contagem é quebra e **é** custo. Errar essa lista é o jeito mais fácil de entregar um CMV bonito e errado — e é `movement_kind`, então é P3.
7. **Não existe arquivo.** `expo-file-system`, `expo-sharing`, `expo-print` e clipboard não estão em `package.json` (conferido: as 27 dependências, `expo-sqlite` e `qrcode` inclusive, nenhuma delas). O `Share` do React Native é core e é o caminho de custo zero para CSV — e o pacote já é item de véspera de loja.
8. **Identidade de documento** — §0.3. Sem "emitido por, deste aparelho, nesta data", o mesmo pedido em outubro não devolve o papel de março.

### Extrapolando — o que o dono pediu

**O extrato tem três eixos, não um, e é a mesma aritmética lida por três lados** — exatamente o argumento que `stockByPlace` já usa contra ter duas verdades (`:1063-1067`):

- **por item** — é o que existe (`app/inputs/[id].tsx`), e é a conferência de prateleira.
- **por lugar** — não existe. `app/places.tsx` mostra saldo por sala e só abre lote (`:602`); não há `locationMovements` em lugar nenhum (97 funções exportadas em `repository.ts`, nenhuma delas). É este eixo que vira o **extrato do cliente** (caminho 5) sem uma linha nova de esquema.
- **por ato** — também não existe, e é o mais barato dos três porque a chave já está gravada: `movement_group_id` amarra as sete linhas de uma corrida e as duas pernas de uma carga (`src/data/db.ts:344`). "O que esta nota fez no razão" é um `WHERE movement_group_id = ?`.

**E a assimetria a nomear:** `app/products/` tem `index` e `new` e **não tem `[id]`**. Saldo de produto acabado não tem página de razão nenhuma. O extrato de produto nasce com tela nova ou entra por `places` — e é o picolé que some.

### Veredito

**P1 — passa, e é o único dos seis que passa hoje sem inventar chamador.** `app/inputs/[id].tsx:185` já chama `itemMovements` e desenha oito linhas em `:964`. Crescer aquele cartão em extrato (saldo anterior, valor por linha, total, período) é mudança com leitor nas duas pontas no mesmo commit. O segundo chamador entra junto em `app/places.tsx`, que já mostra saldo por sala.

**P2 — não trava, e a F7 parte a frase em duas.** A frase sai: *"eu mudaria isto se eu visse um contador recusar o formato"*. Mas o que muda com a observação é **forma**: quais colunas, se nomeia gente (`namesWhoRecorded`, `src/data/repository.ts:4989`, que já é a configuração pronta e já atravessa por `src/data/configuracao.ts:52-58`), qual cabeçalho, se o CSV separa por vírgula ou ponto-e-vírgula. Preferência de quem usa → configuração, os dois caminhos. O que **não** depende de observar ninguém é a aritmética: saldo anterior, movimentos, saldo final, estorno visível ao lado do que ele cancela. **P2 trava o layout da exportação, não o extrato.**

**P3 — a leitura é de graça; a lista de espécies do CMV não é.** Corte por data, saldo corrente, período, valor por linha e as oito colunas que faltam na `MovementRow` são SELECT e tela: conserta com um commit. **Mas decidir que `transfer` não é saída e que `adjustment` é quebra é semântica de `movement_kind`**, e é isso que o portão marca como caro. Não pede migração — pede que a decisão nasça escrita, num só lugar, com teste, e não espalhada por três telas que discordem.

### Risco

1. **A régua dupla de §0.1.** É o risco número um do caminho inteiro. Se o extrato somar `saldo × média de hoje`, ele é relatório com cara de prova.
2. **`LIMIT ?` com padrão 20** (`:1291`, `:1336`) e o chamador cortando em oito (`app/inputs/[id].tsx:964`). **Extrato que trunca em silêncio é pior que extrato nenhum**: o saldo final não fecha com a soma das linhas, e quem confere conclui que o sistema erra. Paginação ou total explícito de linhas entra junto, não depois.
3. **`erase.ts` (§0.3).** Enquanto ele apaga `movements` e não há gatilho local, o extrato do aparelho não é documento. É a única coisa da lista que precisa ser **decidida antes**, e a decisão é de adjetivo: chame de conferência.
4. **Faturamento não é respondível e a tela tem de dizer isso.** `unit_price_rate` existe no servidor desde `0008_ledger_speaks_phase_one.sql:80` e **não existe na tabela local** (`src/data/db.ts:801` diz isso em voz alta), e `'sale'` está em `MovementKind` (`src/domain/ledger.ts:24`) com **zero caminho de escrita** (grep: uma única ocorrência, a própria declaração). Custo do que saiu: hoje. Receita: não. Um extrato que promete os dois mente.

---

## CAMINHO 2 — O fechamento de período

### O que já existe

- **A imutabilidade no servidor**: `reject_ledger_mutation` + `movements_are_immutable` (`supabase/migrations/0001_foundation.sql:234-247`), `before update or delete`, para cada linha.
- **O estorno com rastro**: `reverses_movement_id` (`0001:210`), a restrição `reversal_points_somewhere` (`:223`), o índice parcial dedicado (`0028_the_index_under_what_was_reversed.sql`) que `itemMovements` usa no `EXISTS` de `reversed` (`:1324-1330`).
- **A taxa do estorno é a do original, congelada** (`:5611-5615`): *"ler a média de hoje avaliaria o erro de setembro ao preço de outubro"*. Isso é meia batalha do fechamento já ganha.
- **E §0.2: o estorno já ocorre hoje.** O fechamento já é estável.
- `dayWindow` (`src/domain/day.ts:49`) para a borda no fuso do galpão.

### O que falta

Nada de tabela, para começar. **O que falta é a regra virar regra:**

1. **Um teste que trave `occurredAt` no estorno.** Hoje `reverseGroup` aceita `occurredAt?` e nada impede um chamador futuro de passar a data original. O teste é curto e mordente: estorna em outubro uma compra de março, corta o saldo em `2026-03-31`, e afirma que ele não mudou. Isso é `npm test`, não migração — e é o item de melhor razão custo/benefício de todo este documento.
2. **O docblock que falta.** `src/domain/ledger.ts:172-209` explica por que `balanceAt` morreu; nada explica por que o estorno nasce hoje. Comentário ausente ao lado de código que carrega uma regra é a família de defeito que o `CLAUDE.md` chama de a que dominou um dia inteiro.
3. **`item_costs` é a exceção, e ela é real.** `recomputeItemCost` sobrescreve `average_rate` (`:502-509`, chamado por `reverseGroup` em `:5638`), então **o custo médio de março não é recuperável em outubro pela tabela corrente**. `item_cost_history` (`:513`) guarda a série com `observed_at`, e `recordPurchase` grava a data do **fato** ali (`:515`, `occurred`, não `at` — corrigido de propósito). Então a série é reconstruível. O que não existe é a consulta que a lê para um instante passado.
4. **Só então: a tabela de retrato.** E o desenho dela não é o obvio.

### Extrapolando — o desenho do fechamento, e como ele convive com o estorno

Aqui está o ponto que a pergunta faz e que merece resposta exata: **num sistema que deixa editar, "histórico honesto" e "fechamento estável" brigam. Aqui não brigam, e o motivo é uma coisa só: a correção tem data própria.**

O estorno não muda o passado — ele **acrescenta ao presente**. Então:

- **saldo em 31/mar** = `Σ quantity WHERE occurred_at <= '2026-03-31'` — imóvel para sempre, porque nada com `occurred_at` em março será jamais inserido depois de março, e o estorno de um erro de março ocorre em outubro.
- **o número que o contador viu em março** = o mesmo, calculável a qualquer hora, sem tabela nenhuma.
- **o que mudou desde então** = as linhas de estorno entre abril e outubro que apontam (`reverses_movement_id`) para linhas de março. **Isso é o extrato do fechamento**, e é o documento que nenhum sistema pequeno consegue emitir: *"o março que você viu continua valendo; e aqui estão as quatro correções que fizemos depois, com data, motivo e quem."*

Então **o fechamento não é um congelamento — é um marco.** Um `period_closes` com `(company_id, closed_through, closed_at, closed_by, note)` e nada mais. Não guarda saldo. O saldo é derivado, e derivar é o que sustenta o `[por quê?]`. Guardar o saldo criaria **dois autores para o mesmo número** — a mesma doença que matou `buildReversal` (`src/domain/ledger.ts:186-190`) e que o `serialize.ts:49-56` recusa para o custo médio, com o caso medido: *"replaying the queue put the server at 0.5605 where the phone said 0.5310"*.

O que o marco compra, e é bastante:

- **`occurred_at` retroativo passa a ser recusável.** Hoje nenhuma tela lança movimento no passado — só `src/data/simulate.ts:366+` passa `occurredAt`, e toda escrita real faz `input.occurredAt ?? nowIso()` (`:400`, `:1218`, `:2044`). Mas `recordPurchase` **já aceita** `occurredAt` com o motivo certo escrito (`:374-385`: a nota chega às sete e alguém digita ao meio-dia). No dia em que essa tela existir — e ela deve existir —, o marco é o que impede lançar dentro de um período fechado. **Erro se impede, não se reclama** (Lei 5): o seletor de data para de oferecer o dia, em vez de o app reclamar depois.
- **A pergunta muda de "posso confiar?" para "até onde está fechado?"**, que é uma pergunta com resposta.

E se alguém precisar lançar em período fechado? **Não se reabre.** Lança-se hoje, com nota dizendo a que mês pertence — que é a mesma escolha do estorno, e é o que um contador espera.

### Veredito

**P1 — o marco reprova hoje; a regra passa.** Sem tela que lance no passado, `period_closes` não tem quem o consulte para impedir nada: é coluna esperando leitor, exatamente a doença que o P1 existe para pegar (`assistant_phrase` com índice e sem escrita, `Draft.kind` sem leitor). **O que passa P1 agora é o teste + docblock de §0.2 e o extrato do fechamento** (as linhas de estorno apontando para o período), cujo chamador é a tela de extrato do caminho 1.

**P2 — não trava.** *"eu mudaria isto se eu visse o contador da fábrica fechar por mês ou por trimestre"* — é preferência de quem usa, e vira dado no próprio marco (a data que se fecha), não configuração nem pergunta.

**P3 — a regra é de graça; o marco é caro.** O teste e o docblock não tocam migração nenhuma. `period_closes` toca `supabase/migrations/` e o `MIGRATIONS` de `src/data/db.ts` (hoje V1–V22, `:843-846`), os dois append-only. E há um P3 pior escondido: se o marco guardar saldo em vez de data, ele cria a segunda verdade e **isso não volta por migração** — o número errado já foi mostrado a alguém.

### Risco

1. **A tentação de congelar o número.** É o risco central e ele é sedutor, porque "guardar o retrato" é literalmente como a ideia se chama. Guardar data; derivar número.
2. **`occurredAt` no estorno, sem guarda.** Um chamador futuro bem-intencionado move março.
3. **Fuso.** `closed_through` é um **dia**, e dia só existe num fuso. `dayWindow` (`src/domain/day.ts:49`) já resolve; usar `new Date().toISOString().slice(0,10)` em vez dele erra em duas horas do dia, todos os dias, e o erro só aparece no galpão.

---

## CAMINHO 3 — A conciliação com a nota de compra

### O que já existe — e é muito mais do que a ideia supõe

**A amarra movimento→documento JÁ ESTÁ GRAVADA, em duas chaves, e nenhuma consulta a lê.** `recordPurchase` (`src/data/repository.ts:363`):

- `movements.id` **é** `purchase_lines.id` — o mesmo `lineId` nos dois inserts (`:457-471` e `:477-499`), com o motivo escrito em `:434-436`: *"a linha e o movimento que ela causa dividem um id, porque são um fato visto duas vezes. Replaying the queue cannot post the arrival again."*
- `movements.movement_group_id` **é** `purchases.id` (`:497`), com o motivo escrito em `:493-496`: *"o grupo é a NOTA, não a linha: desfazer uma nota desfaz as linhas dela."*

Ou seja, a conciliação é um `JOIN` que já compila:

```
movements m
  JOIN purchase_lines l ON l.id = m.id
  JOIN purchases     p ON p.id = m.movement_group_id
```

Sem migração, sem coluna nova, sem `purchase_line_id`. **Isso foi construído por dois motivos que não eram este, e serve a este de graça.**

- `purchases.received_at` guarda o instante do **fato**, não da digitação (`:451-453`, com o motivo em `:443-450`: senão `deliveriesOf` mediria a fábrica em vez do fornecedor).
- `item_cost_history` guarda a série com `observed_at = occurred` (`:515`).
- `deliveriesOf` (`:4226`) e `observedLeadTimeDays` (`src/domain/cost.ts:109`) já leem a nota.

### O que falta — e é aqui que o esquema divergiu em silêncio

**O aparelho não tem as três colunas que fazem uma nota ser um documento, e o servidor tem todas as três desde a `0002`:**

| coluna | servidor | aparelho |
|---|---|---|
| `purchases.invoice_number` | `supabase/migrations/0002_recipes.sql:38` | **ausente** (`src/data/db.ts:108-116`) |
| `purchases.freight_cents` | `0002_recipes.sql:39` | **ausente** |
| `purchase_lines.expected_base_units` | `0002_recipes.sql:57` | **ausente** (`src/data/db.ts:117-126`) |
| `purchases.supplier_id` | `0002_recipes.sql:36` (FK) | `supplier_name TEXT` |

E `purchase_lines.expected_base_units` tem `comment on column` no servidor (`0002_recipes.sql:60-62`) dizendo exatamente o que a conciliação é: *"o que o pedido pediu. Comparado com `base_units` no recebimento; a divergência trava antes do pagamento em vez de aparecer num relatório depois."* **A regra está escrita no banco e não há uma linha de código que a exercite.** Nem no aparelho, que não tem a coluna; nem no serializador, que não a lista (`src/sync/serialize.ts:356-365`).

Falta também:
1. **O campo do número da nota na tela.** `app/purchase.tsx` pergunta fornecedor, quantidade, total e `ordered_at` (`:576`) — não pergunta o número. Sem o número, "amarrar ao documento" amarra a um registro sem nome, e o contador pede o nome.
2. **O frete não entra no custo.** `freight_cents` é a diferença entre custo de aquisição e preço da mercadoria — e o `applyCostEvent` (`src/domain/cost.ts`) recebe só `totalCents`. Um CMV que ignora frete subestima, e subestimar custo é o bug de capa deste projeto noutra escala.
3. **A tela de conciliação**: nota → linhas → movimentos que elas produziram, com `expected` ao lado de `received`, e o que não bateu abrindo a conta.

### Extrapolando

A conciliação não é uma tela nova: é **o eixo "por ato" do extrato** (§1) apontado para `purchases`. Uma nota é um `movement_group_id`; abrir a conta de uma nota é a mesma peça que abre a conta de uma corrida de produção ou de uma carga. Uma peça, três assuntos.

E o que ela destrava depois é maior que ela: **`expected_base_units` é a mesma aritmética de `recordCheck`** (`:3096-3159`) — pedido contra recebido, gravado como `discrepancy` com a taxa congelada da perna de entrada. Faltou 1 saco de 25 kg numa nota de 10 sacos: hoje o app grava a chegada de 9 e o custo médio de 9, e a nota que cobra 10 nunca é confrontada. **Essa é a única divergência do sistema que vale dinheiro para fora** — as outras corrigem estoque; esta impede pagamento a mais.

### Veredito

**P1 — passa, e passa melhor que o esperado.** Nenhum chamador precisa ser inventado: `app/purchase.tsx` é o chamador do número da nota, `app/inputs/[id].tsx` é o chamador da conciliação (é a tela onde a compra já vive), e o `JOIN` já tem as duas chaves. É construção de tela sobre estrutura viva.

**P2 — não trava, com uma nota honesta.** *"eu mudaria isto se eu visse alguém digitar o número da nota na doca"* — é preferência de quem usa: a fábrica que confere nota liga, a que compra no mercado com cupom não. Configuração, padrão desligado, na forma que `namesWhoRecorded` (`:4989`) e as cinco chaves de `src/data/configuracao.ts:52-58` já têm. **Mas cuidado com o excesso de F7**: o número da nota ser *opcional* é configuração; o campo *existir* não é.

**P3 — caro, e é o mais caro dos seis pelo lado do esquema.** Três colunas novas no aparelho (`MIGRATIONS`, `src/data/db.ts:843`, append-only) e três entradas novas na travessia (`src/sync/serialize.ts:351-365`). E há um P3 de conteúdo, não de forma: **frete entrando no custo médio muda `item_costs.average_rate`** e portanto muda todo número de dinheiro do aplicativo daqui para frente — sem reescrever o passado, porque a taxa nas linhas antigas está congelada. Isso é bom e é permanente: a série de custo passa a ter um degrau no dia em que o frete entrou, e alguém vai perguntar por quê. **Então entra com a resposta pronta em `item_cost_history`, não depois.**

### Risco

1. **A divergência de esquema já existe e é silenciosa.** `src/sync/columns.test.ts` guarda "coluna que o serializador promete e o aparelho não tem". Ele **não** guarda a direção que interessa aqui: coluna que o servidor tem, com `comment on column` explicando a regra, e que o aparelho nunca criou. Três colunas passaram por essa fresta. **Esse é um guard novo, e ele é da proofgate** — o `CLAUDE.md` manda transformar erro repetido em guard com teste positivo e negativo, e este é exatamente o padrão.
2. **Frete alocado errado.** Rateio por valor, por peso ou por linha dá três custos diferentes. `allocateCents` (`src/domain/money.ts:66`) e `allocateWeighted` (`:73`+) existem e somam exatamente o total — usar um `for` com divisão é o defeito que o docblock de `allocateWeighted` descreve como já tendo acontecido (*"dez ingredientes a quatro décimos de centavo cada somavam nada"*).
3. **Um `invoice_number` sem unicidade convida a nota duplicada.** Único por `(company_id, supplier, invoice_number)`, ou o app aceita lançar a mesma nota duas vezes e o custo médio come a duplicata em silêncio. Isso é constraint, e constraint é migração — de graça hoje, caro depois.

---

## CAMINHO 4 — O inventário assinado

### O que já existe

O núcleo está construído, provado e com a permissão certa — não é ideia, é alcance.

- **A diferença é movimento, nunca sobrescrita.** `recordCount` (`:1185`) grava `adjustment` com o delta assinado (`:1247`), e **o grupo é a própria linha** (`:1257`) com o motivo escrito em `:1262-1268`: sem grupo, `planReversal` não acha o ato e *"um zero digitado com o dedo torto ficava no razão para sempre"*.
- **A sala é obrigatória e sem padrão**, com o raciocínio inteiro em `:1206-1216`: com padrão, contar a câmara fria escreveria a diferença no almoxarifado — *"estoque teleportado por um operador que fez tudo certo"*.
- **Contagem que bate é gravada com delta zero, de propósito** — e o esquema abre exceção para isso: `movement_moved_something` em `0008_ledger_speaks_phase_one.sql:53-55` (com o motivo em `:43-52`: *"deixa uma prateleira que ninguém confere há meses indistinguível de uma verificada hoje de manhã"*) e `0017_a_check_that_matched_is_a_fact.sql:21-27` estendendo a `discrepancy` com posto.
- **A cegueira existe e está provada no navegador**: `app/inputs/[id].tsx:145-149` e `:709-711`; `e2e/flow.mjs:1249` reprova se "50.000 g" continuar visível.
- **A permissão está cumprida na decisão do dono**: `operator` tem `adjust_stock` (`src/domain/access.ts:87`), com o piso `ALWAYS_CONFIRMED` (`:135-141`).
- **Guard de fonte contra o defeito vizinho**: `contagemCega` (`src/layers.test.ts:308-318`) recusa tela que grave contagem em lugar fixo, com teste positivo e negativo.
- **`CountResult`** (`:547-556`) devolve esperado, contado, delta e `deltaCents` — via `amountOf`, `:1274`.

### O que falta

1. **A CONTAGEM NÃO É UM ATO.** Este é o achado que muda o caminho. `recordCount` grava **uma linha por item**, e o grupo é a própria linha (`:1257`). Não existe `count_sessions`, nem coluna que amarre "estas 40 contagens são o inventário de 31 de dezembro". Então **hoje o inventário anual não é recuperável como documento** — é 40 linhas soltas que só um `WHERE occurred_at BETWEEN` de sorte reagrupa, e duas contagens do mesmo item no mesmo dia (que acontecem: conta, erra, reconta) tornam o reagrupamento por data **errado**.
2. **Só se conta insumo.** O único chamador de tela é `app/inputs/[id].tsx:418`, e a lista tem três abas — `input`, `packaging`, `store_supply` (`app/inputs/index.tsx:66-82`, filtro em `:166`). **`product` não tem aba.** O picolé na câmara fria e o picolé no freezer da loja não têm caminho de contagem. Agrava: `listPlaces` (`:671-685`) devolve todas as espécies sem filtro, então a loja já aparece nas fichas de sala (`app/inputs/index.tsx:231`) — dá para escolher a loja e nunca ver o produto que está nela. **E é o picolé que some.**
3. **Não há signatário** (§0.3).
4. **O docblock afirma o que não existe**: `app/(tabs)/transport.tsx:100-108` diz *"quem achou diferença corrige na tela do lugar, que já sabe registrar contagem cega"*. `app/places.tsx` **não chama `recordCount` em linha nenhuma** (seus únicos `router.push` são `:394` para `/transfer` e `:602` para `/lots/`). A frase é o conserto descrito no lugar do conserto.

### Extrapolando — o inventário É o fechamento, visto do chão

Aqui os caminhos 2 e 4 se encontram, e é a coisa mais bonita deste desenho.

O contador quer **estoque no fechamento**. O caminho 1 dá esse número derivado do razão. O caminho 4 dá **o mesmo número medido com a mão**. E a diferença entre os dois é a quebra do ano — que hoje quase toda fábrica pequena **inventa**, porque não tem os dois números.

Então o inventário assinado não é um relatório a mais: é **a linha do fechamento que fecha a conta**. Ele diz três coisas na mesma folha:

| | |
|---|---|
| o razão dizia | `Σ quantity WHERE occurred_at <= fim` |
| a mão contou | `Σ counted` da sessão |
| a diferença virou movimento | as N linhas de `adjustment`, cada uma estornável |

E é exatamente por isso que ele funciona: em qualquer outro sistema, "ajustar o inventário" sobrescreve o saldo e a diferença **desaparece** — o que o fisco pede é justamente a diferença. Aqui ela é um movimento, com valor (`amountOf`), com sala, com quem estava com o aparelho, e com estorno possível. **Nenhum sistema de fábrica pequena consegue emitir esse papel, e este consegue com uma tabela de duas colunas úteis.**

O desenho do ato, então: `count_sessions (id, company_id, location_id, opened_at, closed_at, closed_by, note)`, e `recordCount` ganha `sessionId?`. **Cega por sessão, não por item** — hoje a cegueira é por item aberto (`app/inputs/[id].tsx:145-149`); numa sessão a pessoa percorre a prateleira e o app não mostra nenhum esperado até ela fechar. Fechada, a sessão vira as N linhas de `adjustment` numa transação, e **aí** os esperados aparecem, lado a lado. Isso é melhor ergonomia *e* melhor cegueira: hoje dá para contar um item, ver o esperado, e "recontar" convenientemente.

E fechar a sessão é o único momento em que faz sentido oferecer o fechamento de período (§2) — que é como duas peças que pareciam separadas viram um gesto.

### Veredito

**P1 — passa com folga.** `recordCount` já existe inteira; a sessão entra com a tela que a percorre e o documento que a fecha, no mesmo commit, e o segundo chamador é a aba de produto que hoje não existe. Nada de função esperando tela.

**P2 — não trava, e a F7 já respondeu.** *"eu mudaria isto se eu visse ninguém preencher contagem item a item"* — a resposta está escrita em `app/(tabs)/transport.tsx:103-106`: *"um formulário de contagem por item, no celular, na doca, ninguém preenche"*. Preferência de quem usa: a fábrica que conta item a item liga, a que conta uma prateleira por semana segue com o que existe. Os dois caminhos.

**P3 — o mais caro dos seis, e não é a migração.** `count_sessions` é tabela nova nos dois lados (append-only, nunca editar a `0001`); isso é o barato. O caro é o resto do portão: **toca o caminho de escrita de `movements`, e uma contagem gravada contra a sala errada não se conserta com commit — se estorna.** `contagemCega` (`src/layers.test.ts:308`) cobre "lugar fixo" e **declara em `:307` o que não cobre**: que a tela escolheu a sala certa. Então a tela de produto herda inteira a regra de `app/inputs/[id].tsx:299-318`: com o item em mais de um lugar e nenhum escolhido, **a contagem não é oferecida**.

### Risco

1. **A sala errada, e ela é irreversível por definição.** Primeira `adjustment` fora do almoxarifado = primeira chance de gravar quebra na loja errada.
2. **`src/data/assistantData.ts:50-51` passa `defaultLocationId(companyId)` fixo para `recordCount`** — o assistente conta sempre o almoxarifado. Com produto contável em loja, uma frase falada vira diferença gravada na sala errada, e a guarda de fonte não olha `src/data/`. Isto é um defeito de hoje que o caminho 4 promove de latente a ativo, e ele entra no mesmo commit ou não entra.
3. **Sessão aberta e nunca fechada.** Contagem pela metade que ninguém fecha é pior que nenhuma: parece que a prateleira foi conferida. A sessão precisa aparecer aberta na capa (a `Peca` da corrida do tacho, `src/home/Mosaic.tsx`, já é o precedente exato dessa forma).
4. **`src/theme/assinatura.test.ts:354`** cobra que todo desenho declare o que faz ou por que fica parado — peça nova entra com movimento declarado.

---

## CAMINHO 5 — O extrato do cliente

### O que já existe

- **`storeMirror`** (`:2715`) devolve, por (loja, item), `received` / `returned` / `returnShare`, os motivos ordenados do mais pesado ao mais leve, **e a mesma janela imediatamente anterior** (`:2662-2676`) — Lei 3 respondida na camada de dados. E ele tem duas lições já pagas escritas no tipo: `MirrorItem.baseUnit` existe porque *"mil gramas de açúcar mais trezentos picolés davam 1.300 de recebido, um número que não é de nada"* (`:2652-2662`), e ele é **fato, nunca veredito** (`:2686-2691`) — quem decide se 8% é muito é uma fábrica de verdade.
- **A devolução tem tipo próprio no razão**, com motivo obrigatório **no tipo** (`recordReturn`, `:2122-2134`, `input: MoveInput & { returnReason: ReturnReason }`), e `return_reason` atravessa a sincronia (`src/sync/serialize.ts`, entrada `'return_reason'`) porque o servidor a exige na devolução e a proíbe fora dela.
- **A loja é `locations`** (`0001_foundation.sql:109`: `location_kind` = factory, cold_room, store_room, own_store, customer, vehicle), e as duas pernas da carga gravam `counterpart_location_id` (`src/data/db.ts:345`) — então "o que a Loja Centro recebeu" já é um `WHERE location_id = ?`.
- **`shipmentsOn`** (`:3983`) agrupa por remessa com `EXISTS ... post = 'checked'`, ou seja **já sabe dizer se a loja conferiu**.
- **`storeMirror` não tem portão de dinheiro, e é escolha declarada** (`:2692-2697`): unidade que chegou e unidade que voltou é o que quem confere a doca já vê com os olhos.
- **O preço combinado por loja existe**: `location_prices` e `sale_price_history` (`0037_what_it_goes_out_for.sql`, `src/data/db.ts:799-812`), `salePricesFor` / `saveSalePrice`, com histórico porque *"preço digitado à mão não tem nota atrás dele"* (`src/data/db.ts:804-808`).

### O que falta

1. **Não existe `locationMovements`.** `itemMovements` filtra por sala mas exige um item (`:1288-1301`). O extrato do cliente é o eixo **por lugar** de §1, e ele não existe em nenhuma das 97 funções exportadas de `repository.ts`.
2. **`storeMirror` soma a janela; não lista os atos.** Ele responde *"a Loja Centro devolve 8%"*; a disputa pede *"em 14/mar chegaram 240, em 19/mar voltaram 12 por derretimento"*. São a conclusão e a conta — Lei 6, e a conta não existe.
3. **Não há contas a receber, e a raiz é uma: `sale` não tem caminho de escrita.** `'sale'` aparece uma única vez no código (`src/domain/ledger.ts:24`), `unit_price_rate` não existe na tabela local (`src/data/db.ts:801` diz isso), e o `docs/roadmap.md:559-561` marca **P3 puro, decisão de faseamento do dono**: *"o cliente e a venda — `customer` criável na tela, embarque como `kind='sale'`, e só então o preço congelado no movimento."*
4. **`view_sale_price` não diz QUAIS LINHAS**, e o `docs/roadmap.md:571-575` já refutou isso adversarialmente: cinco dos sete papéis têm a capacidade, e **o gerente da Loja Norte leria quanto a Loja Centro paga.** Custo não tem esse problema — há um custo. Preço precisa de **escopo**, e escopo é a camada de conta, que ainda não existe (`src/domain/access.ts:15-19` diz isso em voz alta: *"the capability says what kind of thing they may do, the scope says which rows"*).
5. **`locations` é o LUGAR e a PARTE CONTRATANTE ao mesmo tempo** — a `0019` diz isso em voz alta, e o `docs/roadmap.md:577-582` já registrou a herança: uma rede com cinco filiais negocia uma vez e teria o preço digitado cinco vezes. Um extrato "do cliente" endereçado a `location` é o extrato de **uma filial**, não do cliente.

### Extrapolando

O extrato do cliente é a **mesma peça de §1, terceiro eixo, virada para fora** — e virar para fora troca três coisas, todas de verdade:

- **A régua deixa de ser custo e passa a ser preço.** Custo é nosso; a loja não tem o que fazer com ele, e mostrá-lo é entregar margem ao cliente. Então o extrato do cliente é o **único** consumidor de `unit_price_rate`, que existe no servidor desde a `0008` e não tem escritor. Ou seja: **este caminho não é uma tela nova, é o chamador que o caminho da venda estava esperando** — e ele está travado em decisão de dono.
- **Sem preço, ele ainda vale, e vale bastante.** Quantidade recebida, quantidade devolvida, motivo e "conferido / não conferido" (`shipmentsOn`, `:3983`) já **resolvem a disputa**, que é o problema real: a loja diz que chegaram 18 caixas, o romaneio diz 20. Contas a receber é a semente; a disputa é a colheita de hoje. **E disputa se resolve com unidade, não com dinheiro.**
- **Ele é o primeiro artefato que sai da fábrica**, e por isso é o primeiro que o tom de voz atinge de verdade: *"Faltaram 3 caixas na conferência"*, nunca *"a loja errou"*. Um extrato que acusa transforma o cliente em adversário, e um cliente adversário para de conferir — que é o mesmo mecanismo pelo qual equipe que vê o app como inimigo sabota o dado.

### Veredito

**P1 — a metade sem dinheiro passa; a metade com dinheiro reprova.** O eixo por lugar tem chamador imediato: `app/places.tsx` mostra saldo por sala e não abre nada além de lote (`:602`), e `app/mirror.tsx` já é a tela da loja. Com preço, reprova: `unit_price_rate` sem escritor mais `view_sale_price` sem escopo é peça sem chamador com nome bonito.

**P2 — não trava para a metade de unidade; trava para a de dinheiro, e não por preferência.** *"eu mudaria isto se eu visse a loja recusar o papel"* → forma, configuração. Mas *"quem pode ver o preço de qual loja"* não é preferência de quem usa: é privacidade entre clientes do mesmo cliente, e nenhuma configuração conserta um vazamento.

**P3 — a metade de unidade é de graça; a de dinheiro é P3 puro e é decisão de dono** (`docs/roadmap.md:559-561`). Congelar preço no movimento toca a semântica da linha do razão, e o roadmap já o marcou.

### Risco

1. **Preço vazando entre lojas** — `view_sale_price` sem escopo, refutado por escrito.
2. **Extrato que acusa.**
3. **O extrato do cliente promete mais do que sabe se falar de "vendeu".** `storeMirror` mede **absorção líquida** (recebeu menos devolveu), nunca venda observada, porque `sale` não tem escrita. A frase tem de dizer isso, ou ela promete um dado que não existe.

---

## CAMINHO 6 — A ligação com a IA

### O que já existe — e a arquitetura anti-alucinação está pronta

O dono pôs a exigência quando falou do LLM local: *"um jeito de impedir alucinação"*. Ele já existe, e não é filtro nem prompt:

- `src/assistant/types.ts:22-31` — o assistente nunca produz número; nunca escreve no razão.
- `src/assistant/index.ts:41-49` — a permissão roda **antes** da consulta, então não existe número para vazar.
- `src/data/assistantData.ts:24-32` — **sem SQL próprio**: chama as mesmas funções que a tela chama, e `src/layers.test.ts:1-19` impõe isso.
- Rascunho + sim humano em `app/assistant.tsx:152-176`; piso de atos que sempre pedem humano em `src/domain/access.ts:135-146`.
- **O rastro**: `assistant_phrase` gravada nas quatro escritas de movimento (`src/assistant/skills.ts:385, 625, 912, 989`), com índice dedicado no servidor (`0001_foundation.sql:230`) e o motivo escrito: *"autonomy without a trail is what breaks trust in data"*.
- `Answer.detail: { label, value }[]` (`src/assistant/types.ts:129`) renderizado em `app/assistant.tsx:266-291` — **a conta já abre**, atrás de um botão "POR QUÊ?".

### O que falta

1. **`Answer.detail` é `{label, value}` de STRING.** É frase, não fato — a camada de dados devolvendo português. É o ponto exato onde a fundação vaza, e é ele que impede o extrato de ser a resposta do assistente.
2. **A interface é regex, não slots.** `Skill.match(question): RegExpMatchArray | null` e `run(match: RegExpMatchArray, …)` (`src/assistant/types.ts:178-179`), com dezessete `run` lendo `m[1]`/`m[2]` por posição. Um modelo devolve slots nomeados e teria de fabricar um `RegExpMatchArray` falso.
3. **~100 literais em português dentro de `skills.ts`** — a casca fala três idiomas (`src/i18n/locales/pt-BR.ts:1507-1527`), o miolo não, e `src/assistant/index.ts:8-22` diz isso e diz quando deixa de valer.
4. **Nenhum runtime de modelo** — nem `llama.rn`, nem `executorch`, nem `onnxruntime` nas 27 dependências.

### Extrapolando — o extrato é a interface do modelo, não uma tela que ele lê

Aqui é onde o dono está mais certo do que a ideia original dizia, e vale ser preciso: *"a IA não lê o banco, ela lê o extrato"* está quase certo. **A forma exata é uma inversão a mais: a IA não LÊ o extrato — ela o PEDE, e não escreve o número.**

O contrato de três camadas:

1. **O modelo escolhe a pergunta e preenche os slots.** `{ intenção: 'extrato', item: 'polpa de morango', sala: 'câmara fria', de: '2026-03-01', até: '2026-03-31' }`. Ele não calcula nada.
2. **O motor determinístico responde com o extrato** — saldo anterior, linhas com taxa congelada, saldo final, total por `amountOf`, tudo passando pelo `canSeeMoney` que já roda antes da consulta (`:1311`).
3. **A frase se monta em volta do que o motor devolveu**, com o extrato **anexado** — o `[por quê?]` da resposta é literalmente a folha.

E a consequência dura, que é a razão de o extrato tornar o LLM seguro: **sem movimentos, não há resposta.** Não há saldo para inventar porque o modelo nunca viu um número — ele viu um pedido e recebeu uma tabela. "Não sei" deixa de ser um comportamento que se treina e passa a ser o que acontece quando a lista volta vazia. Isso é a Lei 7 aplicada à IA: *está tudo bem é um estado*, e **não sei é um fato**.

E o inverso é o risco que mata: **no dia em que o modelo escrever o TEXTO da resposta, o `[por quê?]` deixa de ser a conta e passa a ser alegação, e a Lei 6 morre em silêncio sem nenhum teste ficar vermelho.** É por isso que o `Answer.detail` de string (falta 1) não é detalhe de tipagem: é a porta por onde a alucinação entra, e ela já está aberta, hoje, sem modelo nenhum.

### Veredito

**P1 — a ligação passa se e somente se o extrato existir primeiro.** O chamador de "o extrato como fato tipado" é o assistente, e o chamador do assistente é `app/assistant.tsx:266-291`, que já desenha `detail`. Trocar `{label, value}` de string por `{ rótulo, baseUnits, unitCostRate, valueCents: Cents | null }` tem leitor no mesmo commit. **O modelo local reprova P1 hoje** — sem slots nomeados e sem as frases no dicionário, mapearia para uma interface que não consegue preencher.

**P2 — não trava a ligação; trava o modelo, e não por preferência.** *"eu mudaria isto se eu visse alguém digitando de luva a -18 °C"* é F7 puro: configuração, e o padrão continua sendo tela. O que trava é se vale dobrar um APK de 37 MB numa conexão de interior — **isso é medida, e não se mede sem aparelho com o modelo dentro.** E o dono tem tablet (decisão de 6 de setembro), o que torna isso uma medição agendável em vez de um bloqueio.

**P3 — de graça.** Trocar a forma de `Answer.detail` não toca `supabase/migrations/`, não toca o caminho de escrita de `movements` (as cinco habilidades que escrevem já passam por `recordPurchase`/`recordCount`/`recordProduction`/`recordTransfer`), não toca `movement_kind`/`location_kind`.

### Risco

1. **O modelo escrevendo o texto.** A proteção é a forma, não o prompt.
2. **O assistente conhece a Fase 1 e o app vive a Fase 3.** `AssistantData` (`src/assistant/types.ts:49-113`) tem dezessete membros numa lista chamada `phase1Skills`. Invisíveis ao assistente: pedido, lote, Espelho, preço de venda, separação, conferência, devolução, corrida do tacho, sensor, gente, estorno. **Um extrato que o assistente sabe abrir para insumo e não para produto é a tela que ensina que o assistente não serve** — e ensinar isso uma vez custa a adoção inteira.
3. **`src/data/assistantData.ts:50-51`** (§4, risco 2): sala fixa. Com extrato por sala, o assistente responde pela sala errada com a confiança de sempre.

---

## ORDEM RECOMENDADA

**0. A régua e a regra — meio dia, e é o que impede tudo o resto de nascer torto.**
O teste que trava `occurredAt` no estorno (§0.2) + o docblock que diz por que ele nasce hoje + a decisão escrita de que o extrato soma `amountOf(taxa congelada)` e nunca `saldo × média de hoje` (§0.1). **Primeiro porque é a única coisa aqui que, feita depois, exige refazer o que veio antes** — e porque protege uma regra que hoje está sustentada por dois chamadores que por acaso omitem um parâmetro. É `typecheck` + `npm test`, nada mais.

**1. O extrato na tela, eixo por item (caminho 1, parte de leitura).**
Primeiro dos seis porque é o único que passa P1 hoje com chamador vivo nas duas pontas, porque o portão do dinheiro já mora na consulta (`:1311`) e desenhar é a metade segura, e porque **todos os outros cinco são este eixo virado para outro lado.** Entra com: `occurred_at <= ?`, `occurred_at >= ?`, saldo anterior/corrente/final, valor por linha via `amountOf`, as oito colunas que faltam na `MovementRow`, e paginação — nunca `.slice(0, 8)` silencioso (`app/inputs/[id].tsx:964`). Sem arquivo: o extrato na tela já resolve a conferência, e "exportável" é a palavra que puxa dependência nova e adia a peça que vale.

**2. O eixo por ato, e com ele a conciliação (caminho 3, parte de leitura).**
Segundo porque **o `JOIN` já existe** (`movements.id = purchase_lines.id`, `movement_group_id = purchases.id`) e ninguém sabe: é o melhor retorno por linha escrita de toda a lista. Fica **sem** as três colunas ausentes e sem frete — só a leitura, que é um commit. As três colunas e o frete vão para depois de §5, porque são migração e mudam todo número de dinheiro.

**3. O extrato do fechamento (caminho 2, parte de leitura).**
Terceiro porque ele **é** o extrato de §1 com um filtro (`reverses_movement_id` apontando para dentro do período) e é o que transforma "relatório" em "prova" na frase que o dono vai dizer a um contador: *o março que você viu continua valendo, e aqui estão as quatro correções de depois.* Sem `period_closes`, que reprova P1 até existir tela que lance no passado.

**4. O eixo por lugar, sem dinheiro (caminho 5, primeira metade).**
Quarto porque `storeMirror` já dá a conclusão e falta a conta (Lei 6), porque resolve disputa **hoje** com unidade em vez de esperar `sale`, e porque é o mesmo `locationMovements` que a contagem de produto vai precisar. Fica **sem preço**: `view_sale_price` sem escopo vaza entre lojas, e isso é privacidade, não configuração.

**5. `Answer.detail` como fato tipado (caminho 6, parte que não é modelo).**
Quinto porque agora existe extrato para ele devolver, e porque **hoje o assistente já devolve frase onde deveria devolver fato** — a porta da alucinação está aberta sem modelo nenhum. Junto vêm as habilidades dos módulos que ele não conhece, porque um extrato que abre para insumo e não para produto ensina que o assistente não serve.

**6. A sessão de contagem e o inventário assinado (caminho 4).**
Sexto, e não por ser menos valioso — é provavelmente o mais valioso dos seis para quem vende o produto. É sexto porque é o único que escreve no razão, porque sala errada se estorna e não se conserta, porque exige a aba de produto que não existe e o conserto de `src/data/assistantData.ts:50-51` no mesmo commit, e porque **ele fecha a conta que §1 e §3 abrem** — o inventário só é documento se o "o razão dizia" ao lado dele já for confiável. Fazê-lo antes é medir com uma régua que ainda está sendo calibrada.

**Depois (migração, e só então):** as três colunas de nota + frete (caminho 3, segunda metade), `period_closes` quando existir tela de lançamento retroativo, `count_sessions`, e a venda com preço congelado — que é P3 puro e decisão do dono.

---

## O QUE EU NÃO FARIA

**A exportação em arquivo — PDF, planilha, e-mail para o contador.** É a palavra que o dono destacou ("exportável") e é a que eu deixaria de fora, e digo por quê com franqueza:

Ela puxa dependência nova (`expo-print`, `expo-file-system`, `expo-sharing`) num pacote que já é item de véspera de loja, para resolver uma pergunta que o **extrato na tela já responde**: o contador precisa conferir a conta, não receber um anexo. E o formato é a única parte de todo este desenho que **reprova P2 de verdade** — *"eu mudaria isto se eu visse um contador recusar o formato"* é uma frase que sai inteira, e as colunas, o cabeçalho e o separador decimal de que ele precisa não se adivinham daqui. Construir um PDF antes de um contador olhar é escolher um dos lados de um "depende" que nem é preferência de cliente: é exigência de um profissional que ninguém consultou. E se o pedido apertar, o `Share` de texto do React Native é core, é uma linha, e entrega CSV de graça — sem nenhuma dependência nova.

**E a segunda coisa que eu não faria, essa por convicção: o fechamento que guarda o saldo.** É como a ideia se chama ("congelar um retrato e guardá-lo") e é o desenho errado. Guardar o número cria dois autores para ele — a mesma doença que matou `buildReversal` (`src/domain/ledger.ts:186-190`) e que `src/sync/serialize.ts:49-56` recusa para o custo médio com o caso medido (*"o servidor em 0,5605 onde o telefone dizia 0,5310"*). O retrato guardado e o razão vão divergir, e no dia em que divergirem **ninguém saberá qual dos dois está certo** — que é exatamente o oposto de prova. O fechamento guarda uma **data**; o número se deriva. E ele já é estável hoje, por um motivo que ninguém escreveu (§0.2) — o que faz do teste que o protege a coisa mais barata e mais importante desta lista inteira.

---

## O INSIGHT DA RODADA

Quatro achados que não estavam no levantamento e que mudam o que se constrói:

1. **A régua dupla de valorização** (`stockByPlace:1096,1120` com média de hoje vs. `itemMovements:1327` com taxa congelada, mais `cents()` como segundo autor de arredondamento ao lado de `amountOf`) — o extrato não fecha com a tela até isto ser decidido, e a decisão é: o razão manda.
2. **O fechamento de período já funciona e ninguém sabe** — `reverseGroup:5569` faz `occurredAt ?? at` e os dois chamadores de produção omitem. Regra viva, sem docblock e sem teste, com o parâmetro aberto para quem achar mais correto datar no dia do erro.
3. **A amarra nota→razão já está gravada em duas chaves** — `movements.id = purchase_lines.id` (`:436`, `:461`, `:483`) e `movement_group_id = purchases.id` (`:497`) — construídas por dois motivos que não eram conciliação, e nenhuma consulta as junta.
4. **Três colunas do servidor nunca chegaram ao aparelho, uma delas com a regra escrita em `comment on column`**: `purchases.invoice_number`, `purchases.freight_cents`, `purchase_lines.expected_base_units` (`0002_recipes.sql:38,39,57`; ausentes em `src/data/db.ts:108-126`). `src/sync/columns.test.ts` guarda a direção contrária (coluna prometida que o aparelho não tem) e **não guarda esta** — coluna que o servidor tem, com regra documentada, que o aparelho nunca criou. **Esse guard é da proofgate**, com teste positivo e negativo, pelo mesmo critério que o `CLAUDE.md` já fixou.

E um quinto, menor e mais nítido: **a contagem não é um ato.** `recordCount:1257` faz o grupo ser a própria linha, então o inventário anual não é recuperável como documento — e reagrupar por data está errado no caso que acontece de verdade (conta, erra, reconta o mesmo item no mesmo dia).