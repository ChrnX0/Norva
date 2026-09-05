## 6. Regras de operação: separação, acordo, acesso, QR, alertas e briefing

Seis módulos de domínio, cada um com uma regra pequena e um motivo escrito. O
que eles têm em comum é a divisão de trabalho da casa: **eles devolvem fato, a
tela escreve a frase** — e é por isso que quase nenhum deles importa o
dicionário. O sétimo bloco (`number.ts`) está aqui porque é o leitor/escritor
único de número digitado que todas essas telas usam.

Três estados são marcados explicitamente ao longo da seção:

- **[CHAMADO POR TELA]** — existe, tem teste, e uma tela em `app/` o executa.
- **[SEM CHAMADOR]** — existe e é testado, mas nada em produção o executa.
- **[PLANEJADO]** — só existe como texto, coluna, ou chave de dicionário.

---

### 6.1 `src/domain/picking.ts` — a separação

Arquivo de 64 linhas com **duas funções puras** e nada mais. Não importa banco,
não importa i18n, não importa React.

O motivo de a regra morar aqui e não na tela está escrito no topo do arquivo: o
`mutate` roda a suíte rápida, e **regra dentro de componente React não é
alcançada por ela** (`src/domain/picking.ts:1-8`). O `pickSuggestion` viveu
dentro de `app/transfer.tsx` e sobreviveu a três rodadas de mutação por isso; a
zona de silêncio do QR desceu para o domínio pelo mesmo motivo, no mesmo dia.

#### 6.1.1 `pickSuggestion` — a ordem de preferência **[CHAMADO POR TELA]**

Assinatura exata (`src/domain/picking.ts:23-30`):

```ts
export function pickSuggestion(sources: {
  /** Quanto a loja pediu e ainda não recebeu. Nulo quando não há pedido. */
  ordered: number | null;
  /** Quanto foi para aquela loja da última vez. Nulo na primeira remessa. */
  lastSent: number | null;
}): number | null {
  return sources.ordered ?? sources.lastSent ?? null;
}
```

O corpo é uma linha e **a ordem é o conteúdo inteiro da regra**
(`src/domain/picking.ts:10-21`):

| ordem | fonte | por quê |
|---|---|---|
| 1º | `ordered` | **O pedido ganha do hábito.** Quem está com a lista na mão quer atender o que foi combinado, não repetir a semana passada. |
| 2º | `lastSent` | **O hábito ganha do vazio.** Palpite certo para a fábrica que repõe por rotina, e melhor que zero. |
| 3º | `null` | **O vazio é resposta.** Sem os dois, o campo nasce vazio — inventar número aqui seria pedir para alguém conferir uma sugestão que não saiu de lugar nenhum. |

O operador é `??` (nullish) e **não** `||`, e essa escolha tem consequência
testada: **zero pedido é um pedido de zero**, não a ausência de pedido. A loja
que pediu e cancelou não recebe de volta o envio da semana passada
(`src/domain/picking.test.ts:20`: `pickSuggestion({ ordered: 0, lastSent: 40 })`
é `0`).

O teste do arquivo abre com um comentário que é a lição do projeto inteiro sobre
teste que passa por acidente: *"As duas fontes DISCORDANDO é o único caso que
prova a ordem: com uma delas vazia, qualquer ordem dá o mesmo número — e um teste
assim passa por acidente. Foi exatamente assim que este mutante sobreviveu duas
vezes."* (`src/domain/picking.test.ts:6-8`). Por isso o caso canônico é
`{ ordered: 300, lastSent: 40 }` → `300` (`src/domain/picking.test.ts:9`).

#### 6.1.2 `ordersCoveredBy` — que pedidos o dia fechou **[CHAMADO POR TELA]**

Assinatura exata (`src/domain/picking.ts:55-64`):

```ts
export function ordersCoveredBy(
  orders: readonly { id: string; lines: readonly { itemId: string; baseUnits: number }[] }[],
  sent: ReadonlyMap<string, number>,
): string[] {
  return orders
    .filter((order) =>
      order.lines.every((line) => (sent.get(line.itemId) ?? 0) >= line.baseUnits),
    )
    .map((order) => order.id);
}
```

Três regras dentro dessas seis linhas:

1. **`every`, não `some`.** Só entra o pedido **coberto por inteiro**. Carga
   parcial não fecha nada: dizer "entregue" quando faltaram quarenta caixas
   transforma uma falta que a loja vai cobrar num pedido que o sistema diz
   cumprido — e o livro-razão, que é o único que não mente, não tem como
   desmentir, porque **pedido não é livro-razão**
   (`src/domain/picking.ts:47-50`).
2. **`>=`, não `==`.** Mandar a mais fecha: quem mandou 320 entregou os 300
   combinados (`src/domain/picking.test.ts:39-43`).
3. **Item ausente do mapa conta como zero** (`sent.get(...) ?? 0`), então carga
   de item nenhum não fecha pedido nenhum
   (`src/domain/picking.test.ts:46`).

**A cobertura é do DIA, não da viagem.** O parâmetro se chama `sent` e o
docblock antigo dizia "a carga que acabou de sair" — texto de antes de a
semântica mudar. Quem carrega o caminhão faz duas viagens até o freezer, e
comparar só com a última carga fazia um pedido de dois itens **nunca fechar**
(`src/domain/picking.ts:33-40`; teste em `src/domain/picking.test.ts:50-65`:
300 picolés numa viagem e 20 potes noutra, somados, fecham o pedido que nenhuma
sozinha fechava).

**E ela só SUGERE.** Quem fecha é a pessoa, no diálogo que diz o que vai
acontecer (`src/domain/picking.ts:52-53`).

#### 6.1.3 O algoritmo de separação inteiro, do jeito que a tela o executa

A tela é `app/transfer.tsx` (622 linhas). O caminho completo, em ordem:

**1. O sentido do movimento.** `devolucao: boolean`, estado local
(`app/transfer.tsx:110`). Invertendo, `from` e `to` trocam de lado
(`app/transfer.tsx:128-133`) e o que se grava passa de `recordTransfer` para
`recordReturn` (`app/transfer.tsx:226`). A lista de itens vem sempre do saldo de
**quem está mandando**, então não dá para mandar o que não está lá porque nunca
aparece para escolher — Lei 5 como desenho, não como validação
(`app/transfer.tsx:41-45`, `app/transfer.tsx:98-108`).

**2. Origem e destino.** A fábrica é `defaultLocationId(LOCAL_COMPANY_ID)`
(`app/transfer.tsx:111`); os destinos são todos os lugares menos ela
(`app/transfer.tsx:124`).

**3. O que existe na origem.** `stockByPlace` → `here.lines`
(`app/transfer.tsx:135-137`). Cada linha mostra o saldo à direita, que é o que
faz a escolha acontecer sem ninguém digitar para descobrir que não tem
(`app/transfer.tsx:512-522`).

**4. O último envio.** `lastSentBaseUnits(companyId, itemId, toLocationId)`
(`app/transfer.tsx:143`). A consulta lê a perna de **entrada no destino** e não a
saída na origem, porque é a quantidade que aquela loja recebeu que responde
"quanto costuma ir para lá" (`src/data/repository.ts:707-733`). SQL exato:

```sql
SELECT quantity_base_units AS q FROM movements m
 WHERE company_id = ? AND item_id = ? AND location_id = ?
   AND kind = 'transfer' AND quantity_base_units > 0
   AND NOT EXISTS (SELECT 1 FROM movements rev
                    WHERE rev.reverses_movement_id = m.id
                      AND rev.company_id = m.company_id)
 ORDER BY occurred_at DESC, recorded_at DESC LIMIT 1
```

(`src/data/repository.ts:725-730`, com a constante `NAO_ESTORNADO` definida em
`src/data/repository.ts:750-752`.)

**5. A lista de separação.** `pickingFor(companyId, placeId, fromLocationId,
through)` com `through = localDate(agora, fuso, +7)` — uma semana à frente
(`app/transfer.tsx:170-176`). O tipo devolvido é `PickLine`
(`src/data/repository.ts:3164-3181`):

| campo | tipo | o que é |
|---|---|---|
| `itemId` | `string` | o item |
| `name` | `string` | nome do item |
| `ordered` | `number` | soma de `base_units` dos pedidos em aberto daquela loja |
| `orders` | `number` | `COUNT(DISTINCT o.id)` — quantos pedidos entraram na soma |
| `available` | `number` | saldo do item **na sala de onde a carga sai**, não da empresa |
| `dueOn` | `string \| null` | `MIN(o.requested_for)` — para quando é o mais urgente |

SQL exato (`src/data/repository.ts:3213-3232`):

```sql
SELECT ol.item_id, i.name,
       SUM(ol.base_units) AS ordered,
       COUNT(DISTINCT o.id) AS orders,
       MIN(o.requested_for) AS due_on,
       (SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
         WHERE m.company_id = o.company_id
           AND m.item_id = ol.item_id
           AND m.location_id = ?) AS available
  FROM order_lines ol
  JOIN orders o ON o.id = ol.order_id
  JOIN items i ON i.id = ol.item_id
 WHERE o.company_id = ?
   AND o.place_id = ?
   AND o.status IN ('pending', 'open')
   AND (o.requested_for IS NULL OR o.requested_for <= ?)
 GROUP BY ol.item_id, i.name
HAVING ordered > 0
 ORDER BY due_on, i.name COLLATE NOCASE
```

Três decisões dentro dela: **a lista não reserva nada e não escreve no
livro-razão** — lê pedido, que é demanda, e devolve fato
(`src/data/repository.ts:3193-3197`); **`available` sai da sala** de onde a carga
vai sair, porque de nada adianta saber que a fábrica tem trezentos se eles estão
na outra câmara (`src/data/repository.ts:3198-3200`); e a contagem `orders` existe
porque a tela dizia *"pedido para 05/09: 800 un"* — singular, com a data do
primeiro e a quantidade de todos (`src/data/repository.ts:3172-3178`).

**6. O palpite.** `pickSuggestion({ ordered: paraSeparar?.ordered ?? null,
lastSent })` (`app/transfer.tsx:188-191`). O valor efetivo do campo:

```ts
const amount = typed ? Math.max(0, (parseTyped(amountText) ?? 0) || 0) : (suggestion ?? 0);
const over = line != null && amount > line.baseUnits;
const ready = line != null && to != null && amount > 0 && !over && !sending;
```

(`app/transfer.tsx:193-196`.) Passar do saldo não bloqueia com mensagem de erro
solta: o cartão inteiro fica amarelo (`hue={over ? color.warning : palette.lilac}`,
`app/transfer.tsx:475`) e o botão desabilita.

**7. De qual lote sai — deduzido, não perguntado.** `lotsInStock(companyId,
itemId, origem)` e pega o **primeiro** (`app/transfer.tsx:163-168`). Quem
despacha não escolhe lote: despacha o que está na frente, e o que está na frente
é o que vence primeiro. Nulo é caso normal e frequente — açúcar e palito não têm
lote (`app/transfer.tsx:152-161`).

**8. A dica do campo segue a mesma ordem do palpite**: pedido primeiro, último
envio depois, saldo por último — ela diz **de onde veio o número**, que é o que
faz alguém confiar nele ou corrigi-lo (`app/transfer.tsx:539-559`).

**9. A confirmação.** Diz o que vai acontecer, com os números por extenso, e o
lote vai dito ali e não escondido (`app/transfer.tsx:201-221`).

**10. O fechamento do pedido.** Depois de gravar, e só quando não é devolução
(`app/transfer.tsx:247-283`):

- lê `listOrders(companyId, ['pending', 'open'])` e filtra os da loja de destino;
- lê `shipmentsOn(companyId, hoje.from, hoje.to)` — **o dia inteiro**, não a carga
  que acabou de sair;
- soma por item num `Map<string, number>` chamado `enviadoHoje`;
- chama `ordersCoveredBy(daLoja, enviadoHoje)`;
- se houver cobertos, **pergunta** (`words.closeAsk`), e só com o sim escreve
  `setOrderStatus(companyId, id, 'delivered')` para cada um.

O motivo de existir: sem isso, fechar o pedido depende de alguém lembrar de ir na
tela de Pedidos, e quem acabou de carregar o caminhão está com as mãos ocupadas.
O custo de esquecer não é pequeno — a separação continua sugerindo o pedido
inteiro para sempre, e a capa continua pedindo para produzir o que já saiu pela
porta (`app/transfer.tsx:237-246`).

#### 6.1.4 Os textos da separação (pt-BR)

Todos em `src/i18n/locales/pt-BR.ts:747-787`:

| chave | texto |
|---|---|
| `ordered` | `pedido para {{date}}: {{amount}}` |
| `orderedMany` | `{{count}}, o primeiro para {{date}}: {{amount}}` |
| `orderedNone` | `nenhum pedido em aberto para esta loja` |
| `lastTime` | `Da última vez você mandou {{amount}}` |
| `available` | `Tem {{amount}} em {{place}}` |
| `overBalance` | `Isso é mais do que tem em {{place}}.` |
| `fromLot` | `Sai do lote {{code}}, que vence primeiro.` |
| `fromLotNoDate` | `Sai do lote {{code}}.` |
| `closeAsk` | `Fechar o pedido dessa loja?` |
| `closeBody` | `O que saiu hoje para essa loja cobre {{count}} em aberto. Fechar tira da lista de separação e da conta do que falta produzir.` |
| `closeAction` / `closeKeep` | `Fechar` / `Deixar aberto` |
| `closeCount` | `{ one: '1 pedido', other: '{{n}} pedidos' }` |
| `confirmBody` | `Você vai mandar {{amount}} de {{item}} de {{from}} para {{to}}. O saldo sai de um lugar e entra no outro; a empresa continua com a mesma coisa.` |
| `returnBody` | `Você vai trazer {{amount}} de {{item}} de volta de {{place}} para a fábrica.` |
| `notASale` | `Loja própria é transferência, não venda: não há faturamento nem margem aqui. O valor só muda de sala.` |

`fromLot` só é usada quando o lote **tem** validade; sem ela vale
`fromLotNoDate`, porque `lotsInStock` ordena por código e não por data — a frase
não pode prometer uma ordem que não foi usada para escolher
(`app/transfer.tsx:569-573`).

#### 6.1.5 O que protege a separação

- Unidades: `src/domain/picking.test.ts` (3 testes, linhas 5, 24 e 50).
- Mutações: **duas**, e ambas descrevem o dano em português
  (`scripts/mutate.mjs:279-285` troca `every` por `some` — *"carga parcial passa a
  fechar o pedido inteiro"*; `scripts/mutate.mjs:310-316` inverte a ordem do
  palpite). Uma terceira ataca o `pickingFor` removendo `AND o.place_id = ?`
  (`scripts/mutate.mjs:317-324`): *"a carga da loja centro sai com o que era da
  loja norte"*.
- Navegador: a checagem `the picking list beats the habit: the order wins over
  last time` (`e2e/flow.mjs:471-527`) monta as duas fontes **discordando** — envia
  40, depois anota pedido de 300, e exige que a dica diga `pedido para` e o
  número seja `300`.

---

### 6.2 `src/domain/agreement.ts` — a ficha de acordo com a loja

#### 6.2.1 O que é uma ficha de acordo

É o que ficou combinado com uma loja, **na parte que o sistema consegue usar**.
Uma fábrica não entrega em qualquer dia: combina "terça e sexta" com uma loja e
"sábado" com outra, e depois carrega essa tabela na cabeça. Enquanto ela mora na
cabeça de alguém, o pedido nasce com a data errada e a carga sai no dia em que a
loja está fechada (`src/domain/agreement.ts:1-8`).

Os campos moram na tabela `locations`, e a ficha é lida no tipo `Place`
(`src/data/repository.ts:565-585`):

| campo do domínio | coluna | tipo | ausência significa |
|---|---|---|---|
| `id` | `id` | `string` | — |
| `name` | `name` | `string` | vazio é o lugar padrão, cujo nome é palavra da tela |
| `kind` | `kind` | `string` | enum `location_kind`: `factory`, `cold_room`, `store_room`, `own_store`, `customer`, `vehicle` (`supabase/migrations/0001_foundation.sql:110`) |
| `isDefault` | derivado | `boolean` | `id === defaultLocationId(companyId)` |
| `contactPhone` | `contact_phone` | `string` | vazio: ninguém combinou nada |
| `deliveryDays` | `delivery_days` | `number` (bitmask 0–127) | **zero é "não combinamos dia"**, que é diferente de "nenhum dia" |
| `agreementNote` | `agreement_note` | `string` | o combinado em uma frase: onde descarregar, com quem falar |
| `sensorRanges` | `sensor_ranges` | `Record<string, {min, max, unit}>` (JSON) | vazio: o lugar recebe leitura e **não julga nada** |

**Nada aqui é obrigatório, e é de propósito**: uma fábrica combina dia com a loja
grande e entrega "quando dá" na banca da esquina. Campo obrigatório viraria dia
inventado, e dia inventado é pior que dia nenhum — a tela de pedido passaria a
sugerir uma data que ninguém combinou (`app/places.tsx:635-641`).

`savePlace` trata **ausente como "não mexa no que já estava combinado"** e
objeto vazio como "apaga" (para `sensorRanges`)
(`src/data/repository.ts:636-641`, `src/data/repository.ts:669-675`). E recusa um
bitmask fora da semana antes de enfileirar: `if (days < 0 || days > 127) throw new
Error('a semana tem sete dias')` — recusar aqui é o que impede a fila de sair
para morrer do outro lado, com a pessoa achando que gravou
(`src/data/repository.ts:650-654`).

#### 6.2.2 A numeração dos dias

```ts
/** Domingo é o bit 0, como em `Date.getDay()`. */
export const WEEK_BITS = [1, 2, 4, 8, 16, 32, 64] as const;
```

(`src/domain/agreement.ts:17`.) A escolha é deliberada: **a mesma numeração de
`Date.getDay()`, para nunca existir uma segunda convenção competindo com a da
plataforma** (`src/domain/agreement.ts:9-13`). O teste prende isso pedindo o dia
a um `Date` real: `new Date('2026-09-06T12:00:00.000Z').getUTCDay()` tem que ser
0, e `WEEK_BITS[0]` tem que ser 1 — *"se esta conta e a do JavaScript
discordarem, toda entrega sai um dia fora e nada mais no app acusa"*
(`src/domain/agreement.test.ts:5-13`).

| dia | índice | bit |
|---|---|---|
| domingo | 0 | 1 |
| segunda | 1 | 2 |
| terça | 2 | 4 |
| quarta | 3 | 8 |
| quinta | 4 | 16 |
| sexta | 5 | 32 |
| sábado | 6 | 64 |

Semana inteira = 127.

`WEEK_BITS` é exportado mas **nenhuma tela o importa** — as telas usam `agreedOn`
e `toggleDay`. Fora do próprio módulo, só o teste o lê.

#### 6.2.3 As quatro funções

**`noWeek(weekday: number): number`** (privada, `src/domain/agreement.ts:29-34`):

```ts
if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
  throw new RangeError(`a semana tem sete dias, e ${weekday} não é um deles`);
}
```

O docblock explica por que um guarda que só levanta erro não é decoração:
devolver "não combinado" para um oitavo dia seria educado e errado — quem passou
7 achou que perguntou alguma coisa e recebeu um "não" que parece resposta. Pior,
sem impedir nada: indexar fora da tabela devolve `undefined`, que vira zero na
conta de bits e responde "não" sozinho. **Foi o `mutate` que mostrou isso:
apagar a faixa não quebrava teste nenhum** (`src/domain/agreement.ts:19-28`; a
mutação hoje é `scripts/mutate.mjs:407-413`). O teste exige `RangeError` para
`7`, `-1`, `9` e `1.5` (`src/domain/agreement.test.ts:46-57`).

**`agreedOn(days, weekday): boolean`** — `(days & WEEK_BITS[noWeek(weekday)]) !== 0`
(`src/domain/agreement.ts:37-39`). **[CHAMADO POR TELA]** em `app/places.tsx:631`
(a lista curta "ter, sex"), `app/places.tsx:692` (o chip de cada dia) e
`app/settings.tsx:995` (os dias de aviso).

**`toggleDay(days, weekday): number`** — `days ^ WEEK_BITS[noWeek(weekday)]`
(`src/domain/agreement.ts:42-44`). XOR, então tirar a sexta não tira a terça
(`src/domain/agreement.test.ts:15-23`). **[CHAMADO POR TELA]** em
`app/places.tsx:689` e `app/settings.tsx:1000`.

**`daysUntilNextDelivery(days, todayWeekday): number | null`**
(`src/domain/agreement.ts:58-64`):

```ts
if (days === 0) return null;
for (let ahead = 0; ahead < 7; ahead += 1) {
  if (agreedOn(days, (todayWeekday + ahead) % 7)) return ahead;
}
return null;
```

Duas decisões numéricas, ambas com motivo escrito:

- **O laço começa em `0`.** Zero quando hoje é dia de entrega, e isso é de
  propósito: quem faz o pedido de manhã no dia da loja está pedindo para hoje, e
  empurrar para a semana que vem seria o sistema corrigindo a pessoa
  (`src/domain/agreement.ts:48-51`). A mutação que troca `ahead = 0` por
  `ahead = 1` está plantada (`scripts/mutate.mjs:399-405`).
- **O limite é `7`, não `6`.** A semana que fecha é a resposta certa para quem só
  recebe num dia: pedindo na quinta para uma loja de quinta, o próximo é hoje;
  pedindo na sexta, é daqui a seis (`src/domain/agreement.ts:54-56`;
  `src/domain/agreement.test.ts:30-33`).
- **Nulo quando não há acordo**, e aí a tela não oferece o atalho em vez de
  oferecer um atalho inventado (`src/domain/agreement.ts:51-52`).

Com dois dias combinados, o mais próximo vence: de domingo para terça-e-sexta são
2; de quarta são 2; de sábado são 3 (`src/domain/agreement.test.ts:39-44`).

#### 6.2.4 Como o acordo afeta o pedido, a carga e a capa

**O pedido** (`app/orders/new.tsx`). O dia do acordo vem **pré-escolhido**:
`combinado = daysUntilNextDelivery(place.deliveryDays, hoje)`
(`app/orders/new.tsx:155`), e `whenDays = escolhido?.days ?? combinado ?? 1` —
o padrão de fallback é **amanhã** (`app/orders/new.tsx:170-171`). As opções
fixas são hoje/amanhã/depois, mais **uma quarta opção** com o dia da loja quando
ele cai fora dessas três: sem ela, uma loja que só recebe na quinta não teria
como ser pedida para quinta, e o acordo ficaria sem uso
(`app/orders/new.tsx:157-167`). E a linha do cliente explica de onde a data veio
— *"a próxima é sex."* — porque data pré-escolhida sem explicação é mágica, e o
que é mágico ninguém confere (`app/orders/new.tsx:278-290`).

**A capa** (`app/(tabs)/index.tsx:257-263`). A peça `entregaHoje` sai de:

```ts
dueToday: places
  .filter((p) => daysUntilNextDelivery(p.deliveryDays, weekday) === 0)
  .map((p) => ({ id: p.id, name: p.name, sent: sent.some((s) => s.locationId === p.id) })),
```

O `weekday` é calculado no **fuso da fábrica**, não no relógio do aparelho: ler o
dia do relógio dá o dia errado para quem trabalha de madrugada num fuso e o
servidor noutro (`app/(tabs)/index.tsx:131-133`).

**A ficha do lugar** (`app/places.tsx:255-292`). O acordo só aparece para quem
**recebe carga** (`receivesCargo(place.kind)`) — combinar dia de entrega com o
próprio almoxarifado não quer dizer nada (`app/places.tsx:252-254`). E o chip
segue a Lei 4: `proxima === 0` fica âmbar (`signal="warning"`), porque é coisa a
fazer hoje; a próxima da semana fica neutra, porque é só um fato
(`app/places.tsx:281-294`).

#### 6.2.5 O acordo e a devolução

**A ficha de acordo NÃO afeta preço nem devolução.** Ela guarda dias, telefone e
uma frase; não existe tabela de preço por loja, desconto por acordo, nem regra de
devolução ligada a ela em lugar nenhum do repositório. A devolução é o mesmo par
de perguntas da carga, na mesma tela, com o sentido invertido — o que muda é o
`kind` gravado no livro-razão: `return` em vez de `transfer`
(`app/transfer.tsx:98-108`, `app/transfer.tsx:226`). O motivo está escrito: *"uma
loja devolvendo é notícia sobre o produto; a fábrica mandando é a fábrica movendo
o que é dela"* (`app/transfer.tsx:106-108`). A mutação que grava devolução como
carga existe e o dano está nomeado: *"mandei 6.000 e voltaram 1.000 fica idêntico
a mandei 5.000 no livro-razão"* (`scripts/mutate.mjs:287-293`).

E **loja própria é transferência, não venda**: não há faturamento nem margem, o
valor só muda de sala (`src/i18n/locales/pt-BR.ts:770`).

#### 6.2.6 Textos do acordo (pt-BR, `src/i18n/locales/pt-BR.ts:685-710`)

| chave | texto |
|---|---|
| `agreement` | `O que ficou combinado` |
| `agreementHint` | `Nada aqui é obrigatório — sem acordo, a loja recebe quando dá.` |
| `phone` / `phoneHint` | `Telefone de quem recebe` / `Para avisar quando a carga atrasar.` |
| `deliveryDays` | `Dias de entrega` |
| `deliveryDaysHint` | `Sem dia combinado, o pedido não ganha atalho de data.` |
| `agreementNote` | `Combinado` |
| `agreementNoteHint` | `Uma frase: onde descarregar, com quem falar, o que evitar.` |
| `noAgreement` | `sem acordo de dia` |
| `agreedDays` | `entrega {{days}}` |
| `editAgreement` | `Combinar entrega` |
| `deliversToday` | `hoje é dia de entrega` |
| `deliversIn` | `a próxima é {{day}}` |

Os chips de dia usam `Chip` com `signal="ok"` quando ligado, e a linha de baixo
repete por extenso o que ficou marcado: **quem lê por leitor de tela, ou de luva
sob luz ruim, não recebe só a cor** (`app/places.tsx:685-701`).

---

### 6.3 `src/domain/access.ts` — quem pode o quê

Este arquivo é escrito **em inglês** (docblocks e comentários), ao contrário de
picking, agreement, qr, alerts e briefing.

#### 6.3.1 As duas coisas que o módulo deliberadamente NÃO faz

Estão no topo do arquivo (`src/domain/access.ts:9-19`):

1. **Ele não impõe nada.** A imposição mora onde o dado está: *row level
   security* no Postgres, e a checagem que roda **antes** da consulta neste
   aparelho. Esconder um controle é decoração — o número tem que nunca chegar.
2. **Ele não diz QUAIS LINHAS.** Um gerente de loja vê o preço de venda "da loja
   dele", um entregador assina entregas "da rota dele": a capacidade diz que tipo
   de coisa a pessoa pode fazer, o escopo diz em quais linhas. Escopo é a ficha de
   acordo do cliente e a política de inquilino no servidor, não uma lista aqui
   dentro.

#### 6.3.2 O vocabulário completo — 12 capacidades

```ts
export const capabilities = [
  'view_cost',
  'view_sale_price',
  'record_production',
  'dispatch',
  'check_receipt',
  'record_loss',
  'place_order',
  'approve_order',
  'adjust_stock',
  'view_finance',
  'issue_invoice',
  'manage_company',
] as const;

export type Capability = (typeof capabilities)[number];
```

(`src/domain/access.ts:26-41`.) É **valor por valor** o enum `capability` do
servidor (`supabase/migrations/0001_foundation.sql:42-55`), e há um teste que
falha se os dois divergirem em qualquer direção
(`src/sync/agreement.test.ts:253-266`): *"uma capacidade que o código conhece e o
servidor não é uma política que silenciosamente nunca casa; uma que o servidor
conhece e o código não é uma porta que ninguém deste lado consegue abrir."*

**Atenção a um número publicado que engana.** O `docs/roadmap.md` registra
"capacidades | **18**", e 18 é o resultado da derivação usada pela guarda
(`src/bar.test.ts:127`), que conta *strings snake_case distintas em
`access.ts`* — ou seja, as 12 capacidades **mais** os seis nomes de papel escritos
em minúsculas (`owner`, `operator`, `driver`, `buyer`, `customer`,
`salesperson`; `storeManager` é camelCase e escapa da expressão regular). **As
capacidades reais são doze.**

#### 6.3.3 Os sete papéis

```ts
export type Role =
  | 'owner' | 'operator' | 'storeManager' | 'driver'
  | 'buyer' | 'customer' | 'salesperson';
```

(`src/domain/access.ts:51-58`.) São *"um ponto de partida, não uma jaula"*: um
papel é um pacote nomeado, e uma empresa que precisa de outro pacote edita as
capacidades em vez de esperar uma versão. Os cinco primeiros são de dentro da
casa; os dois últimos são voltados para fora e só significam alguma coisa depois
que existirem pedidos (`src/domain/access.ts:43-50`).

#### 6.3.4 A matriz completa

Transcrita de `src/domain/access.ts:70-112`. ● = tem, ○ = não tem.

| capacidade | owner | operator | storeManager | driver | buyer | customer | salesperson |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `view_cost` | ● | ○ | ○ | ○ | ● | ○ | ○ |
| `view_sale_price` | ● | ○ | ● | ○ | ● | ● | ● |
| `record_production` | ● | ● | ○ | ○ | ○ | ○ | ○ |
| `dispatch` | ● | ● | ○ | ● | ○ | ○ | ○ |
| `check_receipt` | ● | ● | ● | ● | ● | ● | ○ |
| `record_loss` | ● | ● | ● | ● | ○ | ○ | ○ |
| `place_order` | ● | ○ | ● | ○ | ● | ● | ● |
| `approve_order` | ● | ○ | ○ | ○ | ● | ○ | ○ |
| `adjust_stock` | ● | ● | ○ | ○ | ● | ○ | ○ |
| `view_finance` | ● | ○ | ○ | ○ | ● | ● | ● |
| `issue_invoice` | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| `manage_company` | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| **total** | **12** | **5** | **4** | **3** | **7** | **4** | **3** |

As listas literais, para reconstrução exata:

- `owner: capabilities` — tudo. *"Sempre existe exatamente uma pessoa que pode
  fazer qualquer coisa"* (`src/domain/access.ts:71-72`).
- `operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss', 'adjust_stock']`
  (`src/domain/access.ts:87`).
- `storeManager: ['view_sale_price', 'check_receipt', 'record_loss', 'place_order']`
  (`src/domain/access.ts:89`).
- `driver: ['dispatch', 'check_receipt', 'record_loss']`
  (`src/domain/access.ts:91`).
- `buyer: ['view_cost', 'view_sale_price', 'check_receipt', 'place_order', 'approve_order', 'adjust_stock', 'view_finance']`
  (`src/domain/access.ts:97-105`).
- `customer: ['view_sale_price', 'check_receipt', 'place_order', 'view_finance']`
  (`src/domain/access.ts:108`).
- `salesperson: ['view_sale_price', 'place_order', 'view_finance']`
  (`src/domain/access.ts:111`).

#### 6.3.5 As ausências, que são a decisão de produto

O docblock manda **ler as ausências com o mesmo cuidado que as presenças**
(`src/domain/access.ts:60-68`):

- **O operador de fábrica não tem `view_cost` nem `view_sale_price`, e isso não é
  desconfiança** — é que o número é irrelevante para o trabalho, e a presença
  dele convida conversas sobre margem no chão de fábrica.
- **O entregador pode registrar perda** porque um palete cai do caminhão de
  verdade, e negar o botão é o que transforma uma perda real em quebra
  inexplicada.
- **O `adjust_stock` do operador é o que parece generoso, e é o mais defendido**
  (`src/domain/access.ts:74-86`): a contagem é o que torna o número do
  almoxarifado verdadeiro, e numa fábrica de seis pessoas quem anda até a
  prateleira é quem trabalha lá, não o dono. Negar não deixa o número mais
  seguro — deixa a contagem sem acontecer, e saldo que ninguém conferiu há meses
  é pior que saldo corrigido hoje de manhã. **O que protege é o piso, não a
  permissão.**
- **O vendedor externo nunca vê custo** e o desenho inteiro depende disso: a
  comissão é paga sobre margem e mostrada em reais, então o desconto dói no
  bolso dele sem o custo aparecer na tela
  (`src/domain/access.test.ts:59-68`).

Os testes pregam a tabela para que **alargar um papel seja ato deliberado com uma
suíte vermelha na frente** (`src/domain/access.test.ts:13-20`), e são seis:

1. nenhum papel tem permissão fora do vocabulário (`:24`);
2. **toda capacidade pertence a alguém** — permissão que nenhum papel carrega é
   porta sem chave (`:33`);
3. o chão de fábrica nunca vê dinheiro: `operator` e `driver` sem `view_cost`,
   `view_sale_price` e `view_finance` (`:41`);
4. só o dono muda quem trabalha aqui — `manage_company` só no `owner` (`:54`);
5. ninguém de fora vê custo (`:59`);
6. o dono pode tudo e é o único: `capabilitiesFor('owner').size ===
   capabilities.length`, e todo outro papel tem estritamente menos — *"um segundo
   dono com outro nome"* (`:70`).

Mutação plantada: acrescentar `view_cost` ao `operator`
(`scripts/mutate.mjs:632-637`) — *"o operador de fábrica passa a ver o custo, e
ninguém pediu isso"*.

#### 6.3.6 `capabilitiesFor` **[CHAMADO POR TELA, mas com um papel fixo]**

```ts
export function capabilitiesFor(role: Role): ReadonlySet<Capability> {
  return new Set(ROLES[role]);
}
```

(`src/domain/access.ts:114-116`.) O único chamador em produção é
`app/assistant.tsx:79`:

```ts
const CAPABILITIES: ReadonlySet<Capability> = capabilitiesFor('owner');
```

E o comentário ao lado diz por que sai da tabela em vez de ser digitado à mão:
*"uma lista escrita à mão ao lado de uma tabela de papéis são duas respostas para
uma pergunta, e a escrita à mão já estava faltando três capacidades que o dono
tem"* (`app/assistant.tsx:74-79`).

**O aparelho não guarda papel nenhum.** Não existe tabela `memberships` no SQLite
local — o esquema do aparelho não tem coluna de papel nem de capacidade
(`src/data/db.ts:161-206` e adiante). O aparelho *"já guarda os dados de
exatamente um usuário"* e por isso não tem RLS (`src/data/db.ts:10`). Então hoje
o papel é **fixo em `owner`**, e toda a matriz de sete papéis é contrato para o
servidor e para o multiusuário que ainda não chegou às telas.

#### 6.3.7 Como a checagem roda ANTES da consulta

O único lugar onde a checagem realmente roda no aparelho é o assistente
(`src/assistant/index.ts:54-73`):

```ts
for (const skill of registry) {
  const match = skill.match(trimmed);
  if (!match) continue;

  if (skill.requires && !context.capabilities.has(skill.requires)) {
    return {
      text: 'Esse número não faz parte do seu acesso. Quem cuida do financeiro consegue ver.',
    };
  }
  return skill.run(match, { ...context, question: trimmed });
}
```

A ordem é o desenho de segurança inteiro em uma linha: **a checagem acontece
antes de `skill.run`, que é quem consulta** — *"um número que a pessoa não pode
ver nunca entra na resposta, então não há o que um modelo vaze depois. Mandar um
modelo guardar segredo não é um controle; o filtro pertence ao caminho do dado"*
(`src/assistant/index.ts:42-52`; o mesmo dito no tipo, `src/assistant/types.ts:167-172`).

E `knownSkills` filtra a **lista de exemplos** pela mesma regra
(`src/assistant/index.ts:38-40`), então nem o nome da habilidade proibida aparece.

Dentro de uma habilidade, o mesmo padrão se repete por campo: o custo só entra na
resposta atrás de `if (ctx.capabilities.has('view_cost'))`
(`src/assistant/skills.ts:494` e `src/assistant/skills.ts:738`).

**No servidor, a checagem é a política.** A função é
`private.has_capability(target_company uuid, needed capability)`
(`supabase/migrations/0001_foundation.sql:92-104`, movida para o schema `private`
em `supabase/migrations/0006_private_helpers.sql:34`, e reescrita para exigir
`state = 'active'` em `supabase/migrations/0011_joining_a_company.sql:33-45`):

```sql
select exists (
  select 1 from memberships
  where user_id = auth.uid()
    and company_id = target_company
    and state = 'active'
    and needed = any (capabilities)
);
```

A mudança de schema tem motivo escrito: em `public`, ela era servida como
endpoint REST em `/rest/v1/rpc/` — *"uma sonda que qualquer pessoa autenticada
pode rodar contra qualquer id de empresa que consiga nomear"*
(`supabase/migrations/0006_private_helpers.sql:5-22`).

**O mapa de escrita do livro-razão por tipo de movimento**
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:29-39`):

| `movement_kind` | capacidade exigida |
|---|---|
| `purchase` | `check_receipt` |
| `production` | `record_production` |
| `consumption` | `record_production` |
| `transfer` | `dispatch` |
| `sale` | `dispatch` |
| `loss` | `record_loss` |
| `return` | `check_receipt` |
| `discrepancy` | `check_receipt` |
| `adjustment` | `adjust_stock` |
| `reversal` | `adjust_stock` |

**E o mascaramento do custo é uma view, não um `if` de tela**
(`supabase/migrations/0008_ledger_speaks_phase_one.sql:83-92`):

```sql
create view movements_visible with (security_invoker = true) as
  select ...,
    case when private.has_capability(m.company_id, 'view_cost')
         then m.unit_cost_rate end as unit_cost_rate,
    case when private.has_capability(m.company_id, 'view_sale_price')
         then m.unit_price_rate end as unit_price_rate
  from movements m;
```

Quem não tem a capacidade recebe `null`, não um número escondido.

Outras políticas notáveis: `product_lines`, `product_types` e `flavors` exigem
`manage_company` (`supabase/migrations/0018_a_product_has_a_family.sql:136-138`);
mudar status de pedido exige `approve_order` **ou** `dispatch` **ou**
`manage_company` (`supabase/migrations/0032_who_ordered_it_never_changes.sql:39-41`);
leituras de ambiente exigem `adjust_stock`
(`supabase/migrations/0024_a_reading_is_a_fact_like_any_other.sql:73`); e a sala
padrão da empresa é legível por quem tem qualquer uma de cinco capacidades
operacionais (`supabase/migrations/0030_the_default_room_is_bookkeeping_not_a_privilege.sql:36-40`).

#### 6.3.8 O piso: cinco atos que nenhuma autonomia executa sozinha **[SEM CHAMADOR]**

```ts
export const ALWAYS_CONFIRMED = [
  'adjustStock',
  'changePrice',
  'reverseMovement',
  'recordFinance',
  'issueInvoice',
] as const;

export type ConfirmedAct = (typeof ALWAYS_CONFIRMED)[number];

export function needsHumanYes(act: ConfirmedAct): boolean {
  return ALWAYS_CONFIRMED.includes(act);
}
```

(`src/domain/access.ts:135-148`.) Note que os nomes são **camelCase** e não
coincidem com as capacidades: são **atos**, não permissões. O docblock explica
por quê: só dois deles têm capacidade própria hoje (`adjust_stock`,
`issue_invoice`); mudança de preço, estorno e lançamento financeiro são coisas
que o aplicativo ainda não sabe fazer, então nomear capacidade para elas agora
seria inventar vocabulário para funcionalidade ausente. **Estão escritos assim
mesmo, porque o piso é uma promessa feita antes de as funcionalidades
existirem**: quem as construir herda a regra em vez de decidi-la de novo
(`src/domain/access.ts:118-134`).

**Ter `adjust_stock` não é ajustar estoque em silêncio.** O comprador tem a
capacidade e continua sendo perguntado toda vez
(`src/domain/access.test.ts:92-94`).

`needsHumanYes` **não tem chamador em produção** — só o teste
(`src/domain/access.test.ts:88-94`). O piso é honrado na prática por confirmação
escrita à mão na tela: a contagem passa por `confirm({...})` antes de
`recordCount` (`app/inputs/[id].tsx:292-310`), e o assistente tem o mesmo limite
nomeado em comentário (`app/assistant.tsx:143`).

#### 6.3.9 Duas perguntas que uma coluna só não responde

Decisão do dono, registrada no servidor
(`supabase/migrations/0014_who_was_holding_it.sql:1-31`):

| coluna | responde | quem impõe |
|---|---|---|
| `movements.recorded_by` | **qual conta escreveu** | o servidor: `recorded_by = auth.uid()`, incedível, desde a fundação |
| `movements.operator_id` | **quem estava com o aparelho** | escolhido na hora, nulo por padrão; FK para `memberships(id)` |

`operator_id` existe no aparelho (`src/data/db.ts:322`:
`ALTER TABLE movements ADD COLUMN operator_id TEXT;`) e está na lista fechada de
colunas que o sincronizador manda (`src/sync/serialize.ts:351`), **mas nenhuma
tela o preenche hoje** — nenhuma escrita em `src/data/repository.ts` o menciona.
**[SEM CHAMADOR]** Nulo é resposta e não ausência: a linha continua respondendo
pelo aparelho e pela conta (`src/sync/serialize.ts:348-350`). Quem quer nomear
liga `companies.names_who_recorded`
(`supabase/migrations/0014_who_was_holding_it.sql:23-26`).

Entrar no chão de fábrica também é dado e não código: `create type floor_sign_in
as enum ('personal', 'shared')`, padrão `personal`
(`supabase/migrations/0011_joining_a_company.sql:68-73`). E associar-se tem dois
caminhos: `membership_state` = `pending` | `active` | `revoked`
(`supabase/migrations/0011_joining_a_company.sql:11-15`) mais
`companies.join_code` único (`supabase/migrations/0011_joining_a_company.sql:53`).
**Nada disso tem tela.** **[PLANEJADO]**

Outras colunas de `memberships` que definem o produto e não têm leitor no
aparelho (`supabase/migrations/0001_foundation.sql:57-72`):
`display_name text not null`; `prefers_conversation boolean not null default
false` — *"deliberadamente não chamado de 'modo simples': ninguém deve abrir uma
configuração que implica que a pessoa simples é ela"*; `assistant_autonomy
smallint not null default 2 check (between 1 and 4)` — 1 informa, 2 prepara
(padrão), 3 rotina, 4 autônomo, e **em qualquer nível o piso continua exigindo um
humano**.

---

### 6.4 `src/domain/qr.ts` — o quadrado que a câmara fria lê

76 linhas. Uma dependência de terceiro: `create` de `qrcode/lib/core/qrcode.js`
(`src/domain/qr.ts:1`), o **núcleo puro** do pacote, sem o `lib/index.js` que
carrega `fs` e derrubaria o bundle nativo (tipo declarado à mão em
`src/types/qrcode-core.d.ts:12-22`; dependência `qrcode: ^1.5.4` em
`package.json`).

#### 6.4.1 O formato: o que vai dentro do código

**O QR carrega o código do lote, não o uuid.** Formato `AAAAMMDD-NN`, **onze
caracteres**: `20260902-01` (`src/domain/lot.ts:33-36`):

```ts
export function lotCode(producedOn: string, sequence: number): string {
  const day = producedOn.replaceAll('-', '');
  return `${day}-${String(sequence).padStart(2, '0')}`;
}
```

É a data em que se produziu mais a ordem da corrida naquele dia. **Ordena
sozinho como texto** — `['20260831-09', '20260902-03', '20260910-01']` é a ordem
do tempo (`src/domain/lot.test.ts:9-12`) — e uma pessoa lê em voz alta pelo
telefone sem soletrar, que é como um recall acontece de verdade
(`src/domain/lot.ts:22-32`).

Nada mais entra no quadrado: **não há JSON, não há URL, não há id de empresa, não
há assinatura**. O texto do QR é literalmente `lote.code`
(`app/lots/[id].tsx:209`).

Duas razões, e as duas estão escritas (`src/domain/qr.ts:6-25`):

1. **Ergonomia, medida.** *"Ler a um braço de distância não é questão de câmera —
   é questão de tamanho do módulo."* O código de onze caracteres cabe na **versão
   1**, grade de **21×21**, a menor que existe. O uuid, com trinta e seis
   caracteres, exigiria a **versão 3, 29×29**: numa etiqueta de quatro
   centímetros o módulo cai de **1,9 mm para 1,4 mm** — perde-se um quarto do
   tamanho justamente na distância em que a leitura já é difícil.
2. **O código do lote é legível por gente**, e vale mais que a primeira.
   Etiqueta que congela, descola ou é arranhada por caixa empilhada acontece toda
   semana numa fábrica; com o código impresso ao lado do quadrado, quem está lá
   digita os onze caracteres e segue. Com o uuid, não segue.

#### 6.4.2 `qrModules` — a grade **[chamado só por `qrPath`]**

```ts
export function qrModules(text: string): boolean[][] {
  const code = create(text, { errorCorrectionLevel: 'H' });
  const { size, data } = code.modules;

  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(data[y * size + x] === 1);
    rows.push(row);
  }
  return rows;
}
```

(`src/domain/qr.ts:37-48`.) Converte o `Uint8Array` linear em matriz de booleanos.

**O nível de correção é `H` — o mais alto, 30% de recuperação — e ele é de graça
aqui**, o que só se soube medindo: com onze caracteres, os quatro níveis (L, M, Q
e H) cabem na mesma grade 21×21. A primeira versão do arquivo escolhia `M` "para
não crescer a grade", e essa frase estava errada; **a mutação que trocava M por H
sobreviveu à suíte inteira justamente porque não era defeito, era melhoria**
(`src/domain/qr.ts:27-35`). Num código que vai congelar, descascar e levar caixa
empilhada em cima, o dobro de tolerância a dano pelo mesmo tamanho não se recusa.

Hoje a mutação plantada é a inversa: trocar `'H'` por `'L'`
(`scripts/mutate.mjs:424-430`).

#### 6.4.3 `QUIET_ZONE` e `qrPath` **[CHAMADO POR TELA]**

```ts
/** Quantos módulos de branco cercam o código. O padrão exige quatro. */
export const QUIET_ZONE = 4;

export function qrPath(text: string): { path: string; span: number } {
  const modules = qrModules(text);
  const span = modules.length + QUIET_ZONE * 2;

  let path = '';
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (modules[y][x]) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { path, span };
}
```

(`src/domain/qr.ts:50-76`.) Para o código de onze caracteres, `span = 21 + 8 =
**29**`.

Duas decisões, ambas de regra e não de desenho:

- **A margem branca de quatro módulos é exigida pelo padrão**, e sem ela o
  papelão da caixa encosta no código e o leitor desiste. *"É a parte que todo
  mundo corta para caber, é a que faz falta, e no componente ela não tinha como
  ser testada"* (`src/domain/qr.ts:53-59`).
- **Um caminho SVG só, não um retângulo por módulo.** A grade tem 441 módulos, e
  441 nós de SVG custam a cada quadro num celular barato — que é o que a fábrica
  compra (`src/domain/qr.ts:60-63`). Cada módulo preto vira o subcaminho
  `M<x> <y>h1v1h-1z`.

#### 6.4.4 Como se lê e valida

**A validação de leitura NÃO EXISTE. NÃO IMPLEMENTADO.** Não há scanner, não há
câmera, não há decodificador em lugar nenhum do repositório — uma varredura por
`scanner`, `barcode`, `camera` em `app/` e `src/` não retorna nada, e nenhuma
dependência de câmera consta do `package.json`. O QR é **só gerado e desenhado**.

O que existe como intenção registrada é uma seção de dicionário nos três idiomas
que nada lê, e ela está declarada como fronteira em vez de código morto
**[PLANEJADO]** (`src/i18n/locales/pt-BR.ts:1162-1166`):

```ts
scan: {
  typeCode: 'Digitar o código',
  progress: '{{done}} de {{total}}',
  duplicate: 'Esse engradado já foi bipado.',
},
```

E a razão da fronteira está escrita no teste que a obriga a existir
(`src/dictionary.test.ts:46-47`): *"a leitura do QR do engradado na doca — o QR já
é impresso na etiqueta do lote; quem lê ainda não existe."*

O que **valida** hoje é o olho e a mão: a etiqueta imprime o código **duas
vezes**, no quadrado e por extenso, no maior corpo da tela
(`app/lots/[id].tsx:211-213`), e o texto explica por quê
(`src/i18n/locales/pt-BR.ts:193`): *"O código aparece duas vezes de propósito:
quando a etiqueta congela ou descasca, alguém digita os onze caracteres e a
conferência segue."*

O determinismo é garantido por teste: o mesmo código sempre desenha o mesmo
quadrado, porque *"a etiqueta impressa hoje e a conferência de amanhã leem o
mesmo lote, e uma máscara escolhida ao acaso a cada chamada faria duas impressões
do mesmo lote não baterem entre si"* (`src/domain/qr.test.ts:41-51`).

#### 6.4.5 O componente **[CHAMADO POR TELA]**

```tsx
export function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const { path, span } = useMemo(() => qrPath(text), [text]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`} accessibilityRole="image">
      <Rect x="0" y="0" width={span} height={span} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
```

(`src/components/QrCode.tsx:20-29`.) **Preto sobre branco, sempre — o QR não
herda o tema**: em modo escuro, um código claro sobre fundo escuro é invertido e
metade dos leitores recusa. O fundo branco é parte do código, não do estilo
(`src/components/QrCode.tsx:16-18`). Único chamador: `app/lots/[id].tsx:209`, com
`size={200}`.

#### 6.4.6 Os cinco testes do QR, e um erro de teste que virou lição

`src/domain/qr.test.ts`:

1. **A grade é 21×21** para `'20260902-01'`, e o uuid pede grade maior (`:5-21`).
2. **Os três olhos** (blocos 7×7 nos cantos superior-esquerdo,
   superior-direito e inferior-esquerdo) estão onde um leitor procura — *"se eles
   não estiverem lá, não é um QR, é um desenho"* (`:23-39`).
3. **Determinismo**, e códigos diferentes desenham quadrados diferentes (`:41-51`).
4. **A margem branca é parte do código.** `QUIET_ZONE === 4`, `span === 29`, e
   nenhum módulo preto com coordenada `< 4` ou `> 24` (`:53-74`). O comentário é a
   lição: a primeira versão escrevia `21 + QUIET_ZONE * 2` e importava a
   constante — *"com isso os dois lados da igualdade mudavam juntos, e o teste não
   tinha como falhar. A mutação que zerava a margem passou por ele sem encostar.
   Teste que usa a própria constante para conferir a constante afirma apenas que a
   aritmética do JavaScript funciona"* (`:56-63`).
5. **O nível H é travado pelo observável**: a grade tem exatamente **224 módulos
   pretos** — *"outro nível pinta outra quantidade"* (`:76-89`).

No navegador, a checagem de etiqueta abre o lote pelo código no formato
`\d{8}-\d\d`, exige `Etiqueta do lote`, o código por extenso, `produzido em`, e
`svg path` count > 0 — *"esta checagem também é a única que prova que o
codificador de QR sobrevive ao empacotamento"* (`e2e/flow.mjs:714-733`).

---

### 6.5 `src/domain/alerts.ts` — quando o aplicativo avisa, e quando ele cala

352 linhas, cinco funções/constantes exportadas, zero português na saída.

O módulo nasce de três leis (`src/domain/alerts.ts:10-27`):

- **Lei 4 — avise na data da DECISÃO, não na do problema.** Insumo que acaba
  quinta com dois dias de compra tem que avisar terça. *"É por isso que o piso é
  em DIAS DE ANTECEDÊNCIA e não em quantidade: quantidade não sabe quanto tempo
  leva para chegar."*
- **Lei 7 — alerta inventado ensina a ignorar alerta.** Sem consumo registrado
  não existe data de acabar, então não existe aviso. Item sem faixa cadastrada
  não alarma. Pedido já coberto não alarma.
- **O sistema sugere, nunca decide calado.** Cada alarme carrega o número que o
  gerou, para a notificação dizer o fato em vez de "confira o estoque".

E o que o módulo **não** faz: falar português e falar com o sistema operacional.

#### 6.5.1 Os cinco tipos de alarme

```ts
export type AlertKind = 'insumo' | 'pedido' | 'volume' | 'validade' | 'ambiente';
```

(`src/domain/alerts.ts:30`.)

#### 6.5.2 `AlertSettings` — o que a empresa combinou

Tipo completo (`src/domain/alerts.ts:33-106`):

| campo | tipo | significado |
|---|---|---|
| `on` | `Record<AlertKind, boolean>` | ligado por alarme; desligado é escolha legítima e frequente |
| `daysAhead` | `Record<'insumo' \| 'pedido' \| 'validade', number>` | dias de antecedência; `volume` e `ambiente` não têm, comparam faixa |
| `bands.red` | `number` (%) | **teto**: até `red` é vermelho |
| `bands.yellow` | `number` (%) | **teto**: até `yellow` é amarelo |
| `bands.blue` | `number` (%) | **piso**: acima dele é azul |
| `bands.notifyFull` | `boolean` | se o azul **interrompe** ou só pinta |
| `minuteOfDay` | `number` 0–1439 | o minuto do dia em que o aviso chega |
| `weekdays` | `number` bitmask | em que dias avisar; **zero é TODOS** |

Os padrões, literais (`src/domain/alerts.ts:108-119`):

```ts
export const DEFAULT_ALERTS: AlertSettings = {
  on: { insumo: true, pedido: true, volume: false, validade: true, ambiente: true },
  daysAhead: { insumo: 3, pedido: 2, validade: 7 },
  bands: { red: 25, yellow: 40, blue: 80, notifyFull: false },
  minuteOfDay: 7 * 60,
  weekdays: 0,
};
```

As decisões por trás de cada número:

- **`volume` nasce desligado e `ambiente` nasce ligado**, e a diferença é o custo
  do erro: *"câmara fora de faixa estraga o estoque inteiro em uma noite, e o
  aviso não depende de nenhuma régua que alguém precise cadastrar antes — a faixa
  vem do lugar, e sem lugar medido não existe aviso nenhum de qualquer forma"*
  (`src/domain/alerts.ts:109-113`).
- **As faixas são porcentagem do nível cheio, e o desenho é do dono**: *"amarelo
  entre 30 e 40, vermelho até 25, azul acima de 80, e zerado"*. Porcentagem se lê
  igual em qualquer item — 20% de polpa e 20% de palito significam a mesma coisa
  para quem passa o olho, e dois números absolutos não
  (`src/domain/alerts.ts:45-52`).
- **Entre `yellow` e `blue` não existe faixa, de propósito**: é o estado normal, e
  estado normal é calado. *"Está tudo bem" é resposta válida*
  (`src/domain/alerts.ts:56-58`).
- **`notifyFull` desligado é a única decisão do módulo que contraria a leitura
  literal do que o dono pediu, e por isso vem escrita** (`src/domain/alerts.ts:64-77`):
  ele desenhou quatro faixas, e faixa é cor; nada nisso dizia que todas as quatro
  devem acordar alguém. *"Almoxarifado cheio depois de uma compra é estado
  DESEJADO, e um aviso diário sobre estado desejado é exatamente o alerta que
  ensina a ignorar alerta."* A câmara que enche até parar a produção é o caso em
  que ele importa, e por isso o caminho existe em vez de se escolher pelos dois.
- **`minuteOfDay` é um campo, não um menu.** Era uma lista de seis horas (5, 6, 7,
  8, 12, 18) e o dono cortou: *"nem toda fábrica funciona igual"*. Oferecer seis
  opções não é configurar, é um menu disfarçado de escolha — e a fábrica que
  começa às **5h30** não estava em nenhuma delas. Minuto do dia e não hora+minuto
  separados porque é **um** fato, e dois campos abrem a porta para um estado
  impossível (hora 5, minuto 90) (`src/domain/alerts.ts:80-96`).
- **O padrão 7h tem motivo**: o aviso serve para quem está começando o turno, e
  notificação de madrugada é despertador — aparelho que acorda a pessoa é
  aparelho silenciado para sempre, junto com o aviso que importava.
- **`weekdays: 0` significa TODOS os dias, não nenhum**: uma configuração vazia
  que silenciasse tudo seria a forma mais fácil de o aplicativo emudecer sem
  ninguém ter pedido (`src/domain/alerts.ts:98-104`).

#### 6.5.3 `volumeBand` — a régua **[CHAMADO POR TELA]**

```ts
export type VolumeBand = 'zerado' | 'vermelho' | 'amarelo' | 'verde' | 'azul';

export function volumeBand(
  onHand: number,
  fullLevel: number | null,
  bands: AlertSettings['bands'],
): VolumeBand | null {
  if (fullLevel === null || !(fullLevel > 0)) return null;
  if (onHand <= 0) return 'zerado';

  const share = (onHand / fullLevel) * 100;
  if (share <= bands.red) return 'vermelho';
  if (share <= bands.yellow) return 'amarelo';
  if (share >= bands.blue) return 'azul';
  return 'verde';
}
```

(`src/domain/alerts.ts:131-146`.) Com os padrões (25/40/80), a tabela verdade:

| saldo (de 100) | share | faixa |
|---|---|---|
| 0 ou negativo | — | `zerado` |
| 20 | 20% | `vermelho` |
| **25** | 25% | `vermelho` (**o limite é do vermelho**, `<=`) |
| 35 | 35% | `amarelo` |
| **40** | 40% | `amarelo` (`<=`) |
| 60 | 60% | `verde` |
| **80** | 80% | `azul` (**o limite é do azul**, `>=`) |
| 90 | 90% | `azul` |
| 120 | 120% | `azul` (mais que cheio continua azul) |
| qualquer | `fullLevel` nulo ou 0 | `null` |

Casos verificados em `src/domain/alerts.test.ts:63-116`. A mutação que troca
`<= bands.red` por `< bands.red` está plantada
(`scripts/mutate.mjs:383-389`): *"o item exatamente no piso vermelho é desenhado
como se estivesse melhor do que está."*

**`zerado` é faixa própria e não "vermelho extremo"**: acabou é outro fato — não
dá para produzir, e a decisão não é comprar mais cedo, é parar de prometer
(`src/domain/alerts.ts:128-130`).

**Nulo quando não há nível cheio**, e isso é o ponto: sem referência o aplicativo
não sabe o que é pouco, e inventar uma régua para poder pintar a linha seria
número que ninguém pode conferir (`src/domain/alerts.ts:123-127`).

A cor sai de `bandSignal` (`src/components/Chip.tsx:83-96`), que fica ao lado do
chip e não no domínio porque nome de cor é fato sobre a interface:

| faixa | `Signal` |
|---|---|
| `zerado` | `danger` |
| `vermelho` | `danger` |
| `amarelo` | `warning` |
| `verde` | `ok` |
| `azul` | `neutral` |
| `null` | `undefined` (**sem cor nenhuma**) |

`zerado` e `vermelho` são a mesma cor de propósito — *"acabar e estar acabando são
o mesmo grau de urgência para o olho, e é a FRASE que os separa"*. E `null` já
devolveu `neutral`, o que pintava uma barra cinza em **toda** linha do
almoxarifado: a régua não cadastrada virava enfeite em cada item, que é o oposto
exato do que a faixa existe para fazer (`src/components/Chip.tsx:78-95`).

Chamador em tela: `app/inputs/index.tsx:332`, com a porcentagem dita por extenso
ao lado do traço, porque *"cor sozinha não é informação para quem não distingue
verde de vermelho"* (`app/inputs/index.tsx:399-410`).

#### 6.5.4 `AlertFacts` — os fatos de onde os avisos saem

Nada aqui fala português (`src/domain/alerts.ts:182-228`):

| campo | forma | de onde vem |
|---|---|---|
| `cover` | `{ itemId, name, daysLeft }[]` | `runningOut(...)` com horizonte infinito |
| `orders` | `{ itemId, name, missing, daysUntil, placeId }[]` | `stockAgainstOrders` × `listOrders` |
| `volumes` | `{ itemId, name, onHand, fullLevel }[]` | `listItems` — **todos os itens**, não só insumo |
| `expiring` | `{ lotId, code, daysLeft }[]` | `expiringSoon(..., +30 dias, 10)` |
| `ambient` | `{ locationId, place, kind, value, unit, min, max, hoursOld }[]` | `lastReadings` × `listPlaces().sensorRanges` |

`daysUntil` negativo é pedido atrasado (`src/domain/alerts.ts:191`).

**`hoursOld` é preenchido e NUNCA LIDO. [SEM CHAMADOR]** O campo existe com
docblock — *"quantas horas desde a medição. É o que separa 'está quente' de
'parou de medir'"* (`src/domain/alerts.ts:225-226`) — é calculado em
`src/notify/facts.ts:121`, e `alertsDue` não o consulta em lugar nenhum. Uma
câmara cujo sensor parou há três dias com a última leitura dentro da faixa
continua calada.

O montador dos fatos é `factsForAlerts(timeZone)`
(`src/notify/facts.ts:28-125`), e ele carrega três decisões:

- **Os pedidos em aberto vêm além da demanda somada, e não é redundância**: a
  demanda agrupa por ITEM e o aviso conta LOJAS. Sem a segunda consulta, o id do
  item era usado como id de loja e o aviso dizia "quatro lojas esperando" para
  quatro sabores pedidos pela mesma loja (`src/notify/facts.ts:39-43`). É um
  defeito que aconteceu, e a mutação que o reintroduz está plantada
  (`scripts/mutate.mjs:370-374`).
- **Uma linha por `(item, loja)` em falta**: `missing = Math.max(0, requested -
  onHand)`, e para cada pedido que contenha aquele item
  (`src/notify/facts.ts:58-78`). Se falta picolé, toda loja que pediu picolé
  espera.
- **Pedido sem dia marcado é HOJE** (`daysUntil: 0`): um pedido sem data é um
  pedido para agora, e empurrá-lo para o fim da fila é o app decidindo calado o
  que o cliente não disse (`src/notify/facts.ts:66-75`).
- **A validade é lida SEM local**: o alarme é sobre o lote, não sobre a
  prateleira. Filtrar pelo almoxarifado emudecia o aviso no dia em que o picolé
  ia para a câmara fria — que é o dia seguinte ao de produzi-lo
  (`src/notify/facts.ts:44-47`).
- **`volumes` inclui produto acabado**, e não só insumo e embalagem: a faixa azul
  do dono é justamente sobre a **câmara cheia** de produto acabado — quem enche a
  câmara para de produzir por falta de espaço, e isso não aparece olhando insumo
  (`src/notify/facts.ts:79-100`).

`daysLeft` da cobertura vem de `daysOfCover(baseUnits, dailyOutflow)` =
`baseUnits / dailyOutflow`, com `null` quando `dailyOutflow <= 0`
(`src/domain/ledger.ts:172-175`), e o `dailyOutflow` é a saída da última semana
dividida por 7 (`src/data/repository.ts:3842-3843`).

`daysLeft` da validade e `daysUntil` do pedido são calculados em dias de
calendário sobre datas UTC à meia-noite, com `Math.round(diferença / 86_400_000)`
(`src/notify/facts.ts:69-75` e `104-108`).

#### 6.5.5 `alertsDue` — a regra de cada alarme

Assinatura: `alertsDue(facts: AlertFacts, settings: AlertSettings): Alert[]`
(`src/domain/alerts.ts:236`).

**Gatilho por tipo, transcrito do código:**

| alarme | gatilho | `amount` | campos extras |
|---|---|---|---|
| `insumo` | `settings.on.insumo` **e** `item.daysLeft <= settings.daysAhead.insumo` | `daysLeft` | — |
| `pedido` | `settings.on.pedido` **e** `o.missing > 0` **e** `o.daysUntil <= settings.daysAhead.pedido` | `missing` | `places` |
| `volume` | `settings.on.volume` **e** faixa ∈ {`zerado`,`vermelho`,`amarelo`,`azul`} **e** (faixa ≠ `azul` **ou** `notifyFull`) | `Math.round((onHand / fullLevel) * 100)` | `band` |
| `validade` | `settings.on.validade` **e** `lote.daysLeft <= settings.daysAhead.validade` | `daysLeft` | — |
| `ambiente` | `settings.on.ambiente` **e** (`min !== null && value < min`) **ou** (`max !== null && value > max`) | `value` | `unit`, `quantity` |

Código dos filtros, literal:

```ts
if (item.daysLeft > settings.daysAhead.insumo) continue;                    // :241
const emFalta = facts.orders.filter(
  (o) => o.missing > 0 && o.daysUntil <= settings.daysAhead.pedido,        // :247-249
);
const lojas = new Set(emFalta.map((o) => o.placeId)).size;                  // :252
if (faixa === null || !FAIXAS_QUE_AVISAM.has(faixa)) continue;             // :269
if (faixa === 'azul' && !settings.bands.notifyFull) continue;              // :271
if (lote.daysLeft > settings.daysAhead.validade) continue;                 // :286
const abaixo = leitura.min !== null && leitura.value < leitura.min;        // :293
const acima = leitura.max !== null && leitura.value > leitura.max;         // :294
if (!abaixo && !acima) continue;                                           // :295
```

`FAIXAS_QUE_AVISAM = new Set(['zerado', 'vermelho', 'amarelo', 'azul'])` — **o
verde pinta e nunca interrompe** (`src/domain/alerts.ts:148-156`). *"Esta é a
linha onde a Lei 7 vive neste módulo: um aviso de que está tudo bem chega uma
vez, e a partir da segunda ele ensina a ignorar o aviso de que não está."*

**As lojas contam UMA VEZ, mesmo esperando três itens cada** — o aviso é sobre
quantos telefonemas o dia vai ter, não sobre quantas linhas de pedido
(`src/domain/alerts.ts:250-252`). E `places` é o **mesmo número em todos** os
avisos de pedido daquela rodada. Pedido do dono, com a razão dada por ele:
*"faltam 300 picolés"* não diz se é uma loja para ligar ou quatro para
reorganizar o dia (`src/domain/alerts.ts:194-198`). Teste:
`src/domain/alerts.test.ts:189-211` — três itens em falta, duas lojas, e todos os
três avisos com `places === 2`.

**A ordem de urgência**, e ela é o custo do erro
(`src/domain/alerts.ts:307-316`):

```ts
const urgencia: Record<AlertKind, number> = {
  ambiente: 0,
  insumo: 1,
  pedido: 2,
  validade: 3,
  volume: 4,
};
return out.sort((a, b) => urgencia[a.kind] - urgencia[b.kind] || a.amount - b.amount);
```

*"O ambiente vem PRIMEIRO: insumo que acaba custa uma compra atrasada; câmara
fora de faixa custa o estoque inteiro numa noite."* O desempate é `amount`
**crescente** — o mais apertado primeiro, o que é o certo para dias, unidades
faltando e porcentagem. Para `ambiente`, porém, `amount` é o **valor da leitura**,
então o desempate coloca a leitura de menor valor numérico primeiro (uma câmara a
−25 °C antes de uma a +10 °C), e não a mais fora da faixa. Isso é o que o código
faz; **não há nota no repositório dizendo se é intencional**.

Comportamento em silêncio, testado em `src/domain/alerts.test.ts:39-61`:
pedido já coberto (`missing: 0`) não alarma; item sem `fullLevel` não alarma nem
com o volume ligado; alarme desligado não alarma; e fatos vazios devolvem `[]`.
Câmara sem faixa cadastrada fica calada, e a razão está escrita: *"o aplicativo
não sabe qual é a temperatura boa da câmara de outra pessoa, e −18 é o número
comum de freezer, não uma verdade"* (`src/domain/alerts.ts:211-216`).

#### 6.5.6 `alertsRunToday` e `nextAlertAt` — quando o aviso chega

```ts
export function alertsRunToday(settings: AlertSettings, weekday: number): boolean {
  if (settings.weekdays === 0) return true;
  if (weekday < 0 || weekday > 6) return false;
  return (settings.weekdays & (1 << weekday)) !== 0;
}
```

(`src/domain/alerts.ts:324-328`.) Zero é todos os dias, e essa é a decisão que
impede o silêncio acidental. A mutação que troca esse `true` por `false` está
plantada (`scripts/mutate.mjs:375-381`): *"a configuração vazia — que é a de todo
mundo no primeiro dia — silencia TODOS os avisos, e o dono descobre no dia em que
faltar polpa."* Note que este módulo usa `1 << weekday` diretamente, e não
`WEEK_BITS` de `agreement.ts`, embora o docblock aponte para lá
(`src/domain/alerts.ts:99`) — os dois dão o mesmo número.

```ts
export function nextAlertAt(settings: AlertSettings, now: Date, horizon = 8): Date | null {
  for (let ahead = 0; ahead < horizon; ahead += 1) {
    const dia = new Date(now);
    dia.setDate(dia.getDate() + ahead);
    dia.setHours(Math.floor(settings.minuteOfDay / 60), settings.minuteOfDay % 60, 0, 0);
    if (dia.getTime() <= now.getTime()) continue;
    if (!alertsRunToday(settings, dia.getDay())) continue;
    return dia;
  }
  return null;
}
```

(`src/domain/alerts.ts:337-352`.) O horizonte padrão é **8 dias** — *"uma semana
cobre qualquer configuração"*. A comparação é `<=` e não `<`, e isso é
deliberado: **exatamente na hora conta como passada**, porque agendar para o
instante presente é uma corrida que o sistema operacional ganha
(`src/domain/alerts.test.ts:175-179`); a mutação inversa está plantada
(`scripts/mutate.mjs:391-397`). Nunca devolve instante no passado: *"notificação
agendada para trás não dispara, e o aviso desaparece sem ninguém saber"*
(`src/domain/alerts.ts:330-335`).

#### 6.5.7 Os textos de alerta, nos três idiomas

`alertPhrase(alert, t): { title, body }` é função pura
(`src/notify/phrase.ts:20-51`). O número é formatado **na unidade que aquele
aviso mede** (`src/notify/phrase.ts:33-41`):

- `insumo` e `validade`: `plural(Math.max(0, Math.floor(amount)), t.app.home.dayCount)`
  → *"2 dias"*;
- `ambiente`: `String(Math.round(amount * 10) / 10)` — **guarda a fração**, porque
  meio grau de freezer é diferença real;
- todo o resto: `String(Math.round(amount))`.

`places` vira `plural(places, t.app.home.placeCount)`; `unit` entra cru; ausente
é string vazia (`src/notify/phrase.ts:43-48`). As chaves de plural em pt-BR:
`dayCount: { one: '1 dia', other: '{{n}} dias' }` e
`placeCount: { one: 'uma loja', other: '{{n}} lojas' }`
(`src/i18n/locales/pt-BR.ts:139-140`).

**As frases, literais** (`src/i18n/locales/pt-BR.ts:1088-1100`):

| tipo | título | corpo |
|---|---|---|
| `insumo` | `Compre {{subject}}` | `Acaba em {{amount}} pelo consumo desta semana.` |
| `pedido` | `{{places}} esperando carga` | `Faltam {{amount}} de {{subject}} para atender.` |
| `volume` | `{{subject}} em {{amount}}%` | `Do cheio que você cadastrou.` |
| `validade` | `Lote {{subject}} vence` | `Em {{amount}} — mande esse primeiro.` |
| `ambiente` | `{{subject}} fora da faixa` | `{{amount}} °{{unit}} agora. Confira a porta e o motor.` |

Inglês (`src/i18n/locales/en.ts:987-996`): `Buy {{subject}}` / `Runs out in
{{amount}} at this week usage.`; `{{places}} waiting for a load` / `{{amount}} of
{{subject}} short.`; `{{subject}} at {{amount}}%` / `Of the full level you set.`;
`Lot {{subject}} expires` / `In {{amount}} — send that one first.`; `{{subject}}
out of range` / `{{amount}} °{{unit}} right now. Check the door and the motor.`

Espanhol (`src/i18n/locales/es.ts:993-1002`): `Compra {{subject}}` / `Se acaba en
{{amount}} según el consumo de la semana.`; `{{places}} esperando carga` /
`Faltan {{amount}} de {{subject}} para atender.`; `{{subject}} en {{amount}}%` /
`De lo lleno que cargaste.`; `Lote {{subject}} vence` / `En {{amount}} — manda ese
primero.`; `{{subject}} fuera del rango` / `{{amount}} °{{unit}} ahora. Revisa la
puerta y el motor.`

Três coisas que o teste de frase confere e que já falharam neste projeto
(`src/notify/phrase.test.ts`): **nenhum buraco `{{...}}` sobra** para a tela de
bloqueio, em três idiomas e cinco tipos (`:34-48`); **a unidade acompanha o
número** — *"12 numa notificação de câmara não diz nada; 12 °C diz que alguém
deixou a porta aberta"* (`:50-71`); e **um `AlertKind` novo sem frase reprova
aqui** em vez de sair silencioso na bandeja (`:73-95`). A mutação que arredonda o
grau da câmara está plantada (`scripts/mutate.mjs:359-368`).

#### 6.5.8 O adaptador: uma notificação, não sete

`rescheduleAlerts(timeZone, phrase)` (`src/notify/index.ts:71-112`) é a única
camada que um teste desta máquina **não** prova. Sequência:

1. carrega `expo-notifications` **preguiçosamente e nunca no web** — no navegador
   ele precisa de push com service worker, que é outro produto, e o e2e roda no
   navegador (`src/notify/index.ts:47-61`);
2. pede permissão; sem ela, para;
3. lê `alertSettings()` e `factsForAlerts(timeZone)`;
4. `alertsDue(facts, settings)`;
5. **cancela tudo o que estava agendado** antes de reagendar, porque o dado mudou
   — *"um aviso de polpa acabando que foi agendado ontem e comprado hoje de manhã
   é exatamente o alerta que ensina a ignorar alerta"* (`src/notify/index.ts:63-70`);
6. `nextAlertAt(settings, new Date())`;
7. agenda **apenas `avisos[0]`** — *"a bandeja com sete linhas do mesmo aplicativo
   é a bandeja que a pessoa limpa sem ler. O mais urgente já vem primeiro do
   domínio, e os outros continuam na capa, que é onde eles se comparam"*
   (`src/notify/index.ts:98-105`). O payload leva `data: { kind, subjectId }` e
   `trigger: { channelId: 'norva-avisos', date: quando }`.

Os motivos de não agendar são **código, não frase** (`src/notify/index.ts:25-40`):
`'sem-suporte' | 'sem-permissao' | 'nada-a-avisar' | 'sem-dia-alcancavel' |
'fora-dos-dias' | 'falhou'`. A primeira versão devolvia português e o guarda de
frase pegou, por um motivo melhor que idioma: isto é diagnóstico, e a camada de
dados devolve fato.

**Nada aqui pode derrubar a tela**: permissão negada, navegador sem suporte,
biblioteca ausente — tudo cai em silêncio e o aplicativo continua inteiro.
*"Falhar aqui é perder um aviso; derrubar a tela é perder a fábrica"*
(`src/notify/index.ts:109`).

O chamador é o componente `<Alerts />`, que **não desenha nada** e existe só para
ser o chamador — *"sem este componente a regra de alarme seria peça sem chamador,
exatamente a doença que o P1 do CLAUDE.md descreve"* (`src/notify/Alerts.tsx:6-22`).
Roda **uma vez, quando o aplicativo abre**, e não num temporizador: o dado muda
quando alguém registra alguma coisa, e quem registra abre o aplicativo.

#### 6.5.9 Onde os ajustes ficam guardados

Chave `alerts.settings`, JSON numa linha de meta
(`src/data/repository.ts:3924-3966`). **A leitura é tolerante de propósito**:
campo faltando cai no padrão, campo estranho é ignorado, JSON quebrado devolve o
padrão inteiro — *"um aviso que deixa de sair porque a configuração não pôde ser
lida é o pior desfecho possível: o dono descobre no dia em que faltar polpa"*
(`src/data/repository.ts:3934-3938`). `minuteOfDay` só é aceito entre 0 e 1439;
`weekdays` só entre 0 e 127; fora disso, o padrão
(`src/data/repository.ts:3949-3959`).

A tela é `app/settings.tsx:832-1021`. A ordem em que os alarmes aparecem é fixa —
`['ambiente', 'insumo', 'pedido', 'validade', 'volume']`
(`app/settings.tsx:844`) — e as opções de antecedência são **1, 2, 3, 5, 7, 14
dias** (`app/settings.tsx:921`). `notifyFull` só aparece quando o volume está
ligado (`app/settings.tsx:885-909`), e a antecedência só aparece para alarme
ligado **que tem dia**: *"oferecer o ajuste de um alarme desligado é pedir decisão
sobre coisa que não vai acontecer"* (`app/settings.tsx:911-915`). Hora e minuto
são dois campos numéricos com validação de faixa (0–23 e 0–59) que **descartam
silenciosamente** o valor fora da faixa (`app/settings.tsx:955-983`).

Textos de configuração (`src/i18n/locales/pt-BR.ts:468-498`):

| chave | texto |
|---|---|
| `label` | `Avisos no celular` |
| `hint` | `Cada aviso liga e desliga aqui. Os que se veem chegando avisam com dias de antecedência; os de faixa comparam com a régua que você cadastrar. O aplicativo avisa na data em que ainda dá para decidir, não na do problema.` |
| `kinds.insumo` | `Insumo acabando` |
| `kinds.pedido` | `Pedido sem estoque` |
| `kinds.volume` | `Volume fora da faixa` |
| `kinds.ambiente` | `Câmara fora da faixa` |
| `kinds.validade` | `Lote perto de vencer` |
| `daysAhead` | `{{days}} de antecedência` |
| `ambienteHint` | `Compara com a faixa que você cadastrar na câmara. Sem faixa, ele não avisa — o app não sabe qual é a temperatura boa da sua câmara.` |
| `volumeHint` | `Compara com a faixa que você cadastrar no item. Sem faixa, ele não avisa.` |
| `notifyFull` | `Avisar quando encher` |
| `hourHint` | `Antes do turno começar. Aviso de madrugada é despertador, e aparelho que acorda a pessoa vira aparelho silenciado.` |
| `everyDay` | `todos os dias` |
| `never` | `Este aparelho não deu permissão de aviso. O aplicativo continua inteiro — a capa mostra as mesmas contas.` |

O próprio `hint` carrega uma cicatriz documentada em comentário
(`src/i18n/locales/pt-BR.ts:470-476`): a frase anterior *"cada aviso liga
sozinho"* era falsa para o volume, que nasce desligado, e *"você escolhe a
antecedência"* era falsa para as duas linhas de faixa — **uma delas a primeira da
lista**.

---

### 6.6 `src/domain/briefing.ts` — a capa

127 linhas. Este módulo **não monta** o resumo: ele decide **quais peças
aparecem e em que ordem**. Quem busca os dados é `app/(tabs)/index.tsx` e quem
desenha é `src/home/Mosaic.tsx`.

#### 6.6.1 A decisão que estrutura o arquivo: a preferência tem dois donos

(`src/domain/briefing.ts:1-22`.)

- **A ORDEM é da EMPRESA.** *"Se o dono monta a capa que quer e o operador vê
  outra, a frase mais comum de uma fábrica — 'olha lá na tela inicial' — deixa de
  funcionar."* Guardada em `briefing.order` (`src/data/repository.ts:3888`).
- **O SILENCIAR é do APARELHO.** Quem está na câmara fria não quer o cartão de
  preço no caminho, e isso não muda o que a casa combinou. Guardado em
  `briefing.hidden` (`src/data/repository.ts:3889`), e é *"preferência de quem
  está segurando o aparelho, que não é fato do negócio e não sobe para o
  servidor"* (`src/data/repository.ts:3908-3913`).
- **Ligar não é forçar.** Peça ligada que não tem o que dizer continua não
  aparecendo. *"Sem isso a capa enche de '0 caixas hoje', que é a definição do
  alerta que ensina a ignorar alerta"* (`src/domain/briefing.ts:18-21`).

Ambas as chaves são strings separadas por vírgula, lidas com
`.split(',').filter(Boolean)` (`src/data/repository.ts:3900` e `:3916`).

#### 6.6.2 O catálogo — 14 peças

```ts
export const BRIEFING_WIDGETS = [
  'producao', 'aoVivo', 'historico', 'insumos', 'cobertura', 'pedidos',
  'entregaHoje', 'expedicao', 'validade', 'perdas', 'custo', 'precos',
  'clima', 'parado',
] as const;
```

(`src/domain/briefing.ts:23-38`.) Nomes exibidos em pt-BR
(`src/i18n/locales/pt-BR.ts:451-466`):

| chave | nome (pt-BR) | o que mostra | estado |
|---|---|---|---|
| `producao` | Produção do dia | manchete: unidades de hoje, barras de 7 dias, ontem e semana passada | **[CHAMADO POR TELA]** |
| `aoVivo` | Produção ao vivo | quantas corridas estão abertas agora | **[CHAMADO POR TELA]** |
| `historico` | Últimas corridas | última corrida, sparkline, média das últimas | **[CHAMADO POR TELA]** |
| `insumos` | Insumo acabando | dias do mais apertado, **ou** "Insumos em dia"; ao lado, caixas de hoje | **[CHAMADO POR TELA]** |
| `cobertura` | Quanto tempo o estoque dura | dias do item mais curto, barra sobre 30 dias | **[CHAMADO POR TELA]** |
| `pedidos` | Pedidos dos clientes | o que falta produzir, **ou** "Os pedidos estão cobertos" | **[CHAMADO POR TELA]** |
| `entregaHoje` | Quem recebe hoje | quantas lojas do acordo ainda esperam carga | **[CHAMADO POR TELA]** |
| `expedicao` | Saiu para as lojas | — | **[SEM CHAMADOR]**: `expedicao: null` em `src/home/Mosaic.tsx:357`. O nome existe nos três idiomas e na tela de Ajustes, e **ligá-lo não desenha nada** |
| `validade` | Vence primeiro | lote que vence primeiro, com barra sobre 30 dias | **[CHAMADO POR TELA]** |
| `perdas` | Perdas do mês | dinheiro perdido em 30 dias, contra os 30 anteriores, e o motivo que mais pesou | **[CHAMADO POR TELA]** |
| `custo` | Custo por unidade | custo congelado da última corrida, sparkline | **[CHAMADO POR TELA]**, fora do padrão |
| `precos` | Preços que mexeram | até 4 insumos, um por item, com ▲/▼ e percentual | **[CHAMADO POR TELA]** |
| `clima` | Tempo | máxima de hoje, mínima, faixa, e a semana ao toque | **[CHAMADO POR TELA]** |
| `parado` | Dinheiro parado | valor em insumo e embalagem ao custo médio | **[CHAMADO POR TELA]**, fora do padrão |

#### 6.6.3 O que NÃO entra na capa de uma fábrica nova

```ts
const DEFAULT_OFF = new Set<BriefingWidget>(['custo', 'parado']);
```

(`src/domain/briefing.ts:58`.) Existe por correção do dono, e vale como regra
geral: **dado disponível não é motivo para ocupar a primeira tela**
(`src/domain/briefing.ts:42-56`). *"Fora do padrão não é fora do produto: quem
quiser liga em Ajustes."*

O mesmo docblock registra uma peça que **saiu do catálogo inteiro**: o "tacho
rodando" — era o mesmo assunto da produção ao vivo, dito com uma palavra de
fábrica de sorvete num aplicativo que vai para qualquer fábrica, e *"duas peças
para um assunto é a capa competindo consigo mesma"*.

#### 6.6.4 `briefingLayout` — a montagem **[CHAMADO POR TELA]**

```ts
export function briefingLayout(
  companyOrder: readonly string[],
  hiddenOnDevice: readonly string[],
): BriefingWidget[] {
  const known = new Set<string>(BRIEFING_WIDGETS);
  const escondidas = new Set(hiddenOnDevice);

  const ordenadas = companyOrder.filter((w): w is BriefingWidget => known.has(w));

  const novas = BRIEFING_WIDGETS.filter(
    (w) => !ordenadas.includes(w) && !DEFAULT_OFF.has(w),
  );

  return [...ordenadas, ...novas].filter((w) => !escondidas.has(w));
}
```

(`src/domain/briefing.ts:68-85`.) Três garantias, todas testadas:

1. **A ordem da casa manda**, e o que ela não ordenou entra **no fim, na ordem do
   catálogo** — é isso que permite acrescentar peça nova numa versão futura sem
   que a fábrica inteira precise reconfigurar a capa
   (`src/domain/briefing.test.ts:5-29`).
2. **Peça nova entra sozinha, menos as que nascem fora da capa.** Sem essa
   distinção, cada widget acrescentado numa versão futura aparece na tela de todo
   mundo sem ninguém ter escolhido (`src/domain/briefing.ts:77-79`).
3. **Peça que saiu do catálogo some sozinha da preferência guardada.** A
   preferência é texto vindo do disco, escrito pela versão anterior; sem o filtro,
   a capa quebra na atualização, no aparelho de quem já usava
   (`src/domain/briefing.test.ts:31-38`). Mutação plantada
   (`scripts/mutate.mjs:302-308`).

Com `briefingLayout([], [])` — o padrão de fábrica nova — o resultado é o
catálogo **menos** `custo` e `parado`: 12 peças, na ordem do catálogo.

O filtro do aparelho tem mutação própria (`scripts/mutate.mjs:295-301`): *"o que
o aparelho escondeu volta a aparecer na capa, e quem tirou o cartão de preço do
caminho na câmara fria o encontra lá de novo."*

#### 6.6.5 As outras três funções **[CHAMADAS PELA TELA DE AJUSTES]**

```ts
export function widgetsOffCover(layout: readonly BriefingWidget[]): BriefingWidget[] {
  return BRIEFING_WIDGETS.filter((w) => !layout.includes(w));
}
```

(`src/domain/briefing.ts:88-90`.) *"O que existe e não está na capa: o que a tela
de Ajustes oferece para ligar."* O teste exige que capa + fora dê exatamente o
catálogo, sem repetição (`src/domain/briefing.test.ts:52-69`) — a tela de Ajustes
não pode inventar nem esquecer peça nenhuma. Chamador: `app/settings.tsx:190`.

```ts
export function addWidget(order, widget): BriefingWidget[] {
  return order.includes(widget) ? [...order] : [...order, widget];
}
```

(`src/domain/briefing.ts:99-104`.) Vai para a ordem da **empresa**, e não para a
preferência do aparelho, *"porque colocar um cartão na primeira tela é decisão de
casa — é o que todo mundo vai ver de manhã"*. Ligar duas vezes não duplica.
Chamador: `app/settings.tsx:218`.

```ts
export function moveWidget(order, widget, direction: 'up' | 'down'): BriefingWidget[] {
  const at = order.indexOf(widget);
  if (at < 0) return [...order];
  const to = direction === 'up' ? at - 1 : at + 1;
  if (to < 0 || to >= order.length) return [...order];
  const moved = [...order];
  [moved[at], moved[to]] = [moved[to], moved[at]];
  return moved;
}
```

(`src/domain/briefing.ts:113-127`.) **Para nas pontas em vez de dar a volta** —
*"dar a volta faria a peça sumir do topo da tela num toque que a pessoa deu
esperando não acontecer nada"* (`src/domain/briefing.test.ts:40-50`). E a
interface é **seta e não arrastar**, e não é preguiça: *"arrastar numa lista
precisa de pressão longa e de precisão, que é o que menos existe numa mão de luva
a −18 °C. Duas setas grandes resolvem o mesmo problema com o polegar"*
(`src/domain/briefing.ts:106-112`). Chamador: `app/settings.tsx:205`.

Textos da tela de Ajustes (`src/i18n/locales/pt-BR.ts:441-450`): `label` = `O que
aparece na tela inicial`; `hint` = `A ordem é da casa: todo mundo vê a mesma
capa. Esconder é só neste aparelho.`; `hidden` = `escondido aqui`; `show`/`hide` =
`Mostrar`/`Esconder`; `up`/`down` = `Subir`/`Descer`; `offCover` = `FORA DA CAPA`;
`putOnCover` = `Colocar na capa`.

#### 6.6.6 Quais fatos entram no resumo do dia

O tipo `Summary` (`src/home/types.ts:13-50`) é o contrato completo. Cada campo,
com a consulta que o produz (`app/(tabs)/index.tsx:142-269`):

| campo | consulta | janela |
|---|---|---|
| `changes` | `recentCostChanges(company, 12)` | últimas 12 mudanças |
| `madeToday` | `productionOn(company, today.from, today.to)` | dia da fábrica |
| `madeThen` | `productionOn(...)` | **mesmo dia da semana, uma semana atrás** |
| `madeYesterday` | `productionOn(...)` | dia anterior |
| `series` | `productionBetween(...)` → `dailySeries(..., 7)` | 7 colunas: seis dias atrás + hoje |
| `everMade` | derivado | `madeToday.length > 0 \|\| madeThen.length > 0` |
| `shortly` | `runningOut(company, lastWeek.from, today.to, 7)` | horizonte **7 dias** |
| `boxes` / `boxesYesterday` | `shipmentsOn(...)` → `boxesOf(...)` | dia e dia anterior |
| `loose` | derivado de `shipmentsOn` | o que não tem camada de caixa |
| `running` | `openProductionRuns(company)` | agora |
| `demand` | `stockAgainstOrders(company, through)` | `through` = hoje + 7 dias |
| `runs` | `recentRuns(company, 6)` | últimas 6 corridas |
| `cover` | `runningOut(..., 7, Number.POSITIVE_INFINITY)` | **sem horizonte** |
| `expiring` | `expiringSoon(company, hoje+30, 5)` | 30 dias, 5 lotes, **sem local** |
| `lossesNow` / `lossesBefore` | `lossesOn(...)` | 30 dias e os 30 anteriores |
| `lossesWorst` | `worstReason(lossesNow)` | motivo que mais pesou, em dinheiro |
| `dueToday` | `listPlaces` + `daysUntilNextDelivery(...) === 0` | hoje |
| `heldCents` | `listItems` filtrado por `kind ∈ {input, packaging}` | agora |

Decisões de janela com motivo escrito:

- **O dia é o da fábrica, não as últimas 24 horas do celular**, e a comparação é o
  **mesmo dia da semana** uma semana atrás, *"porque uma segunda e um sábado são
  negócios diferentes e comparar os dois não ensina nada"*
  (`app/(tabs)/index.tsx:114-118`). Ontem entra **ao lado**, não no lugar: são
  duas perguntas e as duas cabem (`app/(tabs)/index.tsx:119-122`).
- **`cover` roda sem horizonte** porque a pergunta ali não é "o que acaba esta
  semana" (isso é o cartão de insumo) e sim "quanto tempo o estoque dura", que é
  o **normal** contra o qual a semana se compara (`app/(tabs)/index.tsx:172-175`).
- **`expiringSoon` roda SEM local.** Ele filtrava pelo almoxarifado, e o filtro
  silenciava o aviso **exatamente quando o lote saía**: a soma por local de um
  lote que foi para a câmara fria dá zero no almoxarifado e o `HAVING > 0` o
  descarta. *"Uma fábrica de picolés manda picolé para a câmara: dali em diante
  este cartão nunca mais avisava de nada, e o produto vencia dentro dela"*
  (`app/(tabs)/index.tsx:176-183`).
- **Caixa é objeto e pode ser somada entre itens**; o que não tem camada acima da
  base sai da conta e é dito **por nome**, porque fingir que um saco de açúcar é
  caixa arredonda a verdade para o total ficar mais redondo
  (`app/(tabs)/index.tsx:192-228`).
- **O clima vai numa consulta À PARTE**, e essa separação é a coisa importante:
  todo o resto sai do SQLite em milissegundos, e o tempo vem da internet, que numa
  fábrica é a coisa menos confiável do prédio. Pendurar a previsão no mesmo
  `Promise.all` faria a capa inteira esperar pela rede
  (`app/(tabs)/index.tsx:272-283`).
- **`moved` mostra UM por insumo, no máximo quatro.** A capa listava as últimas
  quatro mudanças e com duas semanas de notas virou "Polpa de morango" quatro
  vezes: *"a tela do dono virou um extrato. A pergunta da capa não é 'quais foram
  as últimas notas', é 'o que está diferente agora'"*
  (`app/(tabs)/index.tsx:311-324`).
- **`shortForOrders` subtrai na tela, não na consulta**, porque a camada de dados
  devolve fato — pedido e saldo — e a frase "falta produzir 300" é português
  (`app/(tabs)/index.tsx:297-309`).

#### 6.6.7 A ordem em que a capa aparece, e o "está tudo bem"

A renderização final é literalmente uma linha
(`src/home/Mosaic.tsx:917`):

```tsx
return <>{layout.map((id) => <Fragment key={id}>{pecas[id]}</Fragment>)}</>;
```

`pecas` é um `Record<BriefingWidget, ReactNode>` (`src/home/Mosaic.tsx:94`), e
**cada peça decide sozinha se tem o que dizer** — a preferência decide a ordem e
a presença; o dado decide se aparece (`src/home/Mosaic.tsx:87-93`).

**"Está tudo bem" é estado válido, e aparece em quatro formas diferentes:**

1. **Insumos em dia** (`src/home/Mosaic.tsx:175-184`). Quando `shortly` está
   vazio **e** a fábrica já produziu alguma vez (`data.everMade`), o cartão
   verde-menta diz `Insumos em dia` / `Pelo consumo das últimas semanas, nada
   acaba nos próximos sete dias.` (`src/i18n/locales/pt-BR.ts:76-77`). Sem
   `everMade`, não aparece nada.
2. **Os pedidos estão cobertos** (`src/home/Mosaic.tsx:225-263`). Aparece só se
   `temPedido` — e `temPedido` é `demand.some((d) => d.requested > 0)`, **não** o
   tamanho da lista (`src/home/Mosaic.tsx:61-73`). O comentário registra o
   defeito: `stockAgainstOrders` devolve uma linha por produto para a tela de
   pedido poder dizer o que está livre antes do primeiro pedido existir; medindo
   o tamanho da lista, *"a capa de uma fábrica que nunca vendeu nada passava a
   mostrar 'Pedidos cobertos' — um cartão afirmando que está tudo atendido quando
   não há nada para atender — e o convite do primeiro dia sumia."* O texto:
   `Os pedidos estão cobertos` / `O que foi pedido até {{date}} cabe no que já
   tem na fábrica.` (`src/i18n/locales/pt-BR.ts:71-72`).
3. **Peça que não tem o que dizer não existe.** `aoVivo` devolve `null` quando não
   há corrida aberta (`src/home/Mosaic.tsx:399-400`); `historico`, quando não há
   corrida (`:456-457`); `cobertura`, quando o livro-razão não viu saída
   (`:526-527`); `entregaHoje`, `validade`, `perdas`, `custo` e `parado`, por
   condição própria. O comentário do `aoVivo` é a lição: *"Ela nascia sempre,
   dizendo '0 · Nada saiu ainda hoje' — e ao lado de 'Hoje na fábrica: 0' e
   'Últimas corridas: nenhuma', virava a terceira maneira de dizer o mesmo nada.
   Eu guardei a EXPANSÃO e esqueci a EXISTÊNCIA"* (`src/home/Mosaic.tsx:387-398`).
   E a `cobertura`: *"'sem saída registrada — ninguém sabe quanto dura' é uma
   frase honesta e uma peça inútil: ela ocupa a capa para dizer que não tem
   resposta"* (`:522-525`).
4. **O primeiro dia tem UMA peça, e ela é um convite.**
   (`src/home/Mosaic.tsx:838-915`.) A condição é nomeada `aindaNaoTrabalhou` e é
   uma conjunção de nove testes:

```ts
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

Quando verdadeira, **só a peça `producao` é substituída** pelo convite
(`Primeiro dia` / `A capa se enche sozinha conforme a fábrica trabalha: o que saiu
hoje, o que está acabando, o que os clientes pediram.` / `Lançar a primeira
produção`, `src/i18n/locales/pt-BR.ts:103-105`), e as outras peças continuam
dizendo o que souberem, na ordem que a empresa escolheu.

Duas cicatrizes registradas nesse trecho: a primeira versão substituía **a capa
inteira**, e o CI derrubou por três caminhos no mesmo dia — nota de compra
lançada, produção em curso, preço que mudou. *"Esconder o que existe é pior que
mostrar vazio — vazio é uma tela que não serve, esconder é uma tela que MENTE."*
E a correção óbvia também estava errada: exigir que **nada** exista nunca
fecharia o portão, porque a semeadura já compra insumo. *"Comprar insumo não é
trabalho da fábrica, é o estoque de partida"* (`src/home/Mosaic.tsx:850-868`).

#### 6.6.8 A interação: uma peça aberta por vez

`const [aberta, setAberta] = useState<BriefingWidget | null>(null)` e
`abrir = (id) => setAberta((atual) => (atual === id ? null : id))`
(`src/home/Mosaic.tsx:81-82`). *"Duas abertas empurram o resto para fora da tela e
a capa deixa de ser capa."* O segundo toque fecha.

O componente `Peca` (`src/home/Peca.tsx:31-127`) implementa isso, e carrega uma
regra: **peça sem `mais` não convida** — sem detalhe não há seta e o toque não faz
nada, porque *"botão que não obedece é pior que botão ausente"*
(`src/home/Peca.tsx:28-29`). A animação de entrada começa **visível** e sobe para
o lugar, nunca em opacidade zero: se o caminho da animação falhar, o pior caso é a
peça aparecer sem o gesto, e *"uma capa em branco com o banco cheio é o pior
defeito possível numa fábrica"* (`src/home/Peca.tsx:129-137`).

#### 6.6.9 A Lei 3 como teste executável

`src/law.test.ts` prende a lei *"nenhum número aparece sozinho"* por **registro,
não por heurística** — a heurística alarmaria errado num formulário, e alarme
inventado ensina a ignorar alarme (`src/law.test.ts:14-24`). Cada tela com
`type.figure` declara, por número, **o que ela responde ao lado** ou **por que não
há o que comparar**. E a régua passou a ser por **número**, não por arquivo: *"uma
declaração só aprovava o arquivo inteiro: `Mosaic.tsx` passou verde por comparar a
produção com ontem enquanto as caixas, as corridas abertas e as entregas do dia
apareciam nuas ao lado. Nove figuras nunca foram conferidas por nada"*
(`src/law.test.ts:26-32`). O `Mosaic.tsx` declara **dez** números, na ordem em que
aparecem no arquivo (`src/law.test.ts:45-...`).

---

### 6.7 `src/domain/number.ts` — ler e escrever um número digitado

90 linhas. Não é regra de operação, é a **fundação** sobre a qual todas as telas
desta seção coletam número. Está aqui porque sem ele nenhuma das outras funciona.

#### 6.7.1 O bug que criou o módulo

(`src/domain/number.ts:1-19`.) O aplicativo tinha **três leitores diferentes**:

- quatro telas faziam `s.replace(/\./g, '').replace(',', '.')`, que trata todo
  ponto como separador de milhar: **`118.50` virava `11850`**;
- quatro outras faziam `s.replace(',', '.')`, que trata todo ponto como decimal:
  **`46.000` virava `46`**, e **`1.000,00` virava `NaN`**.

As duas são defensáveis em português e as duas erram metade das vezes, **porque o
telefone decide qual separador a pessoa consegue digitar**: o React Native
substitui o *key listener* do Android por um que *"permite toda entrada de teclado
passar"* (`ReactEditText.kt`), então `.` e `,` chegam os dois, seja qual for o
teclado e seja qual for o locale.

Pior: **o aplicativo alimentava a si mesmo a ambiguidade.** `String(2.5)` é sempre
`"2.5"` em JavaScript, então uma perda de 2,5% escrita na tela de receita voltava
como **25%**, com o botão de salvar aceso e ninguém tendo tocado numa tecla.

#### 6.7.2 `parseTyped(raw: string): number | null`

Algoritmo completo (`src/domain/number.ts:32-75`):

1. **Limpa**: `raw.replace(/[^\d.,-]/g, '')`. Sem dígito nenhum → `null`.
2. **Conta** vírgulas e pontos, e acha a última posição de cada.
3. **Decide qual é o separador decimal**:
   - ambos presentes → **o último é o decimal** (não sobra ambiguidade);
   - só vírgulas → decimal se houver **exatamente uma**; repetida só pode ser
     agrupamento, *"ninguém escreve dois pontos decimais"*;
   - só pontos → decimal se houver **exatamente um**;
   - nenhum → não há decimal.
4. **A regra do milhar**: um ponto sozinho com **exatamente três dígitos atrás** e
   algo diferente de zero na frente é agrupamento, não decimal
   (`src/domain/number.ts:60-63`). **O mesmo teste NÃO é aplicado à vírgula**, e
   isso está escrito: *"uma vírgula digitada aqui é ponto decimal, e tratar '1,500'
   como mil e quinhentos quebraria a língua em que este app é escrito para
   resgatar a que ele não é"* (`src/domain/number.ts:55-59`).
5. **Normaliza** para o formato do `Number()` e devolve, ou `null` se não for
   finito.

**Onde a regra perde, dito em voz alta** no próprio docblock
(`src/domain/number.ts:22-31`): `1.250` é lido como mil duzentos e cinquenta, não
como um e um quarto. *"Essa é a decisão certa neste aplicativo — unidades-base são
gramas, mililitros e unidades inteiras, dinheiro tem duas casas, e nada aqui é
cotado com três — mas uma balança de três casas decimais perderia."* `0.500`
mantém o decimal, porque **parte inteira zero não pode ser agrupamento**.

Tabela de comportamento, dos testes (`src/domain/number.test.ts`):

| entrada | saída | por quê |
|---|---|---|
| `118,50` | `118.5` | vírgula única = decimal |
| `118.50` | `118.5` | ponto único com 2 casas = decimal |
| `1.000,00` | `1000` | ambos: o último (vírgula) é decimal |
| `1000.00` | `1000` | ponto único com 2 casas |
| `46.000` | `46000` | ponto único com **3** casas e inteiro ≠ 0 = milhar |
| `1.500` | `1500` | idem |
| `25.000` | `25000` | idem |
| `1.250.400` | `1250400` | dois pontos = ambos agrupamento |
| `0.500` | `0.5` | inteiro **zero** não pode ser agrupamento |
| `0,500` | `0.5` | vírgula nunca é agrupamento |
| `1.5` / `2,5` | `1.5` / `2.5` | uma casa |
| `''` / `abc` / `kg` | `null` | recusado, não adivinhado |
| `-3` | `-3` | negativo passa |

#### 6.7.3 `formatTyped(value, formatting, maxDecimals = 4): string`

```ts
export function formatTyped(value: number, formatting: string, maxDecimals = 4): string {
  return new Intl.NumberFormat(formatting, {
    useGrouping: false,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}
```

(`src/domain/number.ts:85-90`.) **Nunca um separador de agrupamento**:
agrupamento é exatamente a ambiguidade que o módulo existe para remover, e um
campo não é um relatório. O separador decimal é o do idioma da pessoa, então um
brasileiro vê `2,5` e um americano vê `2.5` — **e os dois voltam como 2.5**
(`src/domain/number.ts:77-84`).

**A propriedade que fecha o laço**, testada para três locales (`pt-BR`, `en-US`,
`es-MX`) e nove valores (`2.5, 0.5, 7.5, 12.4, 1250, 46000, 1.25, 506, 0.075`):
`parseTyped(formatTyped(v, locale)) === v` (`src/domain/number.test.ts:40-53`).

#### 6.7.4 Onde é usado

**[CHAMADO POR TELA]** em nove telas: `app/inputs/[id].tsx:44`,
`app/inputs/new.tsx:18`, `app/orders/new.tsx:27`, `app/places.tsx:38`,
`app/production/new.tsx:38`, `app/products/new.tsx:51`, `app/purchase.tsx:28`,
`app/recipes/[id].tsx:37`, `app/settings.tsx:38`, `app/transfer.tsx:4`. E é
reexportado ao assistente como `parseNumber` (`src/assistant/text.ts:30`), com o
comentário dizendo que é **um leitor para o aplicativo inteiro**.

---

### 6.8 `src/domain/pipeline.test.ts` — a corrente que o produto inteiro sustenta

297 linhas, **só teste** — não exporta nada. O docblock nomeia o que ele prova
(`src/domain/pipeline.test.ts:24-31`): *"a corrente em que o produto inteiro se
apoia: uma nota move a média, a média move a receita, a receita move o preço de um
picolé. Os testes unitários ao lado provam cada elo sozinho. Estes provam que os
elos aguentam JUNTOS, porque a afirmação de ponta a ponta — 'você nunca atualiza um
preço, só lança o que pagou' — é a que o app faz na tela inicial."*

O cenário fixo (`src/domain/pipeline.test.ts:36-63`): receita `base` (3.000 g de
açúcar, rende 20.000 ml, perda 0) e receita `popsicle` (18.000 g de polpa +
10.000 ml de `base`, rende 40.000 ml, **perda 0,05**), com açúcar a
`rate(4.72, 1000)` e polpa a `rate(12.4, 1000)`.

**Os onze testes e o que cada um trava:**

1. **Compra mais cara sobe o custo da unidade acabada** (`:65-97`). 40 kg de polpa
   a R$ 14,88/kg contra a média de R$ 12,40 dá média R$ 13,64/kg, e o custo por
   picolé de 75 ml vai de **45 para 50 centavos**. A conta inteira está escrita à
   mão no teste, para ele falhar se o motor derivar:
   `base: 3.000 × 0,472 = 1.416 centavos / 20.000 ml = 0,0708/ml`;
   `antes: 18.000 × 1,240 + 10.000 × 0,0708 = 23.028 centavos / 38.000 ml (os que
   sobrevivem à perda de 5%) = 0,6060/ml × 75 = 45`;
   `depois: 18.000 × 1,364 + 708 = 25.260 / 38.000 = 0,6647/ml × 75 = 50`.
2. **O comprador vê o movimento contra a última nota, não contra a média**
   (`:99-119`): R$ 118 → R$ 124 é `6/118`, ~5,1%. *"A média diria 2,5%; o que o
   comprador precisa ouvir é 5,1%."*
3. **Embalagem é cobrada por unidade, nunca diluída no lote** (`:121-132`): 5
   centavos de embalagem somam exatamente 5 ao custo unitário, e o lote rende
   `Math.floor(38.000 / 75)` unidades.
4. **A comparação de versão responde "minha mudança ajudou" em centavos por
   unidade** (`:134-155`).
5. **Item sem compra ainda custa zero em vez de derrubar a tela** (`:157-172`).
6. **Estoque vazio toma a primeira nota como a média inteira** (`:174-184`).
7. **Voltar o histórico dá o custo antes das notas recentes** (`:194-216`), e
   **quando um item mexeu duas vezes na janela, a MAIS ANTIGA vence** — *"voltar
   só o último passo relataria uma alta de 9% como se fosse 2%, que é como uma
   sequência de aumentos se esconde à vista"*.
8. **Os movimentos de preço aterrissam na unidade acabada, em reais** (`:218-255`):
   40 centavos hoje contra 33 antes, **sete centavos por unidade, e ninguém digitou
   preço nenhum**.
9. **Nada mexeu quer dizer que a comparação diz nada, não ruído perto de zero**
   (`:257-260`).
10. **O veredito de preço nomeia as faixas e os limites são exatos**
    (`:268-280`). As constantes, literais (`src/domain/cost.ts:233-239`):

```ts
export const PRICE_ALARM = 0.05;
export const PRICE_RELIEF = -0.02;

export function judgePriceChange(change: number): PriceVerdict {
  if (change > PRICE_ALARM) return 'wellAbove';
  if (change < PRICE_RELIEF) return 'cheaper';
  return 'smallChange';
}
```

    **Exatamente no limite não é passar dele**: `judgePriceChange(0.05)` é
    `smallChange`, `judgePriceChange(0.05 + 1e-9)` é `wellAbove`.
11. **A assimetria é deliberada** (`:282-288`): 4% de alta é ruído, 4% de queda
    vale dizer. *"Um alarme falso ensina a ignorar alarmes, e aí o de verdade
    chega e é ignorado também."* Notícia boa que se revela ruído não custa nada.
12. **O ponto de recompra arredonda para cima** (`:290-296`):
    `reorderPoint(d, lead, safety = 2) = Math.ceil(d × (lead + safety))`
    (`src/domain/cost.ts:164-166`). *"3,2 sacos de cobertura são quatro sacos a
    pedir. Arredondar para baixo pede menos que o consumo de que ele foi
    calculado, que é a única direção em que um ponto de recompra jamais pode
    errar — ele existe para impedir uma falta."*

A cor do veredito mora ao lado do chip, não no domínio, *"porque nome de sinal é
fato sobre a interface, não sobre dinheiro"* — e o motivo de não estar escrito
duas vezes é que a tela do almoxarifado e a de compras coloriam a mesma mudança
de forma diferente: *"uma queda de 1% lida como 'mais barato' numa e 'sem mudança
real' na outra — duas respostas para uma pergunta, desenhadas em duas cores"*
(`src/components/Chip.tsx:56-69`).

---

### 6.9 Estado de cada peça — resumo

| módulo | export | estado |
|---|---|---|
| `picking.ts` | `pickSuggestion` | **[CHAMADO POR TELA]** `app/transfer.tsx:188` |
| `picking.ts` | `ordersCoveredBy` | **[CHAMADO POR TELA]** `app/transfer.tsx:266` |
| `agreement.ts` | `WEEK_BITS` | exportado; **só o próprio módulo e o teste o leem** |
| `agreement.ts` | `agreedOn` | **[CHAMADO POR TELA]** `app/places.tsx`, `app/settings.tsx` |
| `agreement.ts` | `toggleDay` | **[CHAMADO POR TELA]** `app/places.tsx`, `app/settings.tsx` |
| `agreement.ts` | `daysUntilNextDelivery` | **[CHAMADO POR TELA]** capa, pedidos, lugares |
| `access.ts` | `capabilities` | usado pelo teste de acordo com o servidor; nenhuma tela |
| `access.ts` | `ROLES` | lido por `capabilitiesFor` e pelas guardas |
| `access.ts` | `capabilitiesFor` | **[CHAMADO POR TELA]** `app/assistant.tsx:79`, **fixo em `'owner'`** |
| `access.ts` | `ALWAYS_CONFIRMED` / `needsHumanYes` | **[SEM CHAMADOR]** — piso escrito antes das funcionalidades |
| `qr.ts` | `qrModules` | chamado só por `qrPath` e pelo teste |
| `qr.ts` | `QUIET_ZONE` | lido por `qrPath` e pelo teste |
| `qr.ts` | `qrPath` | **[CHAMADO POR TELA]** via `QrCode` → `app/lots/[id].tsx:209` |
| leitura de QR | — | **NÃO IMPLEMENTADO**; dicionário `scan` é fronteira registrada **[PLANEJADO]** |
| `alerts.ts` | `DEFAULT_ALERTS` | **[CHAMADO POR TELA]** via `alertSettings()` |
| `alerts.ts` | `volumeBand` | **[CHAMADO POR TELA]** `app/inputs/index.tsx:332` |
| `alerts.ts` | `alertsDue` | **[CHAMADO POR TELA]** via `<Alerts />` na abertura do app |
| `alerts.ts` | `alertsRunToday`, `nextAlertAt` | **[CHAMADO POR TELA]** via `rescheduleAlerts` |
| `alerts.ts` | `AlertFacts.ambient.hoursOld` | **[SEM CHAMADOR]** — preenchido e nunca lido |
| `briefing.ts` | `BRIEFING_WIDGETS` | **[CHAMADO POR TELA]** capa e Ajustes |
| `briefing.ts` | `briefingLayout` | **[CHAMADO POR TELA]** `app/(tabs)/index.tsx:329`, `app/settings.tsx:196` |
| `briefing.ts` | `widgetsOffCover`, `addWidget`, `moveWidget` | **[CHAMADO POR TELA]** `app/settings.tsx` |
| widget `expedicao` | — | **[SEM CHAMADOR]**: `null` em `src/home/Mosaic.tsx:357`, com nome nos três idiomas |
| `number.ts` | `parseTyped`, `formatTyped` | **[CHAMADO POR TELA]** em nove telas |
| `movements.operator_id` | coluna | **[SEM CHAMADOR]** no aparelho: existe, é sincronizada, nenhuma tela grava |
| papéis multiusuário | `memberships`, `join_code`, `floor_sign_in` | **[PLANEJADO]** — existem no servidor, sem tela e sem tabela no aparelho |
