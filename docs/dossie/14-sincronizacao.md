## 14. Sincronização aparelho↔servidor

### 14.1 Estado de implementação, antes de qualquer detalhe

O caminho de sincronização deste aplicativo está construído em três peças
separadas, e **nenhuma das três é chamada por tela**. A tabela abaixo diz
exatamente em que estado cada peça está, porque reconstruir isto sem saber disso
é reconstruir uma promessa em vez de um produto.

| Peça | Arquivo | Estado |
|---|---|---|
| A fila local (outbox) | `src/data/outbox.ts` | **Implementado e chamado por tela** — indiretamente: toda escrita do `src/data/repository.ts` chama `enqueue` dentro da própria transação (`src/data/repository.ts:12`, `src/data/repository.ts:272` e outras 19 chamadas) |
| O motor de envio | `src/sync/engine.ts` | **Implementado, sem chamador** — `drain` só é chamado por `src/sync/sync.test.ts:153,175,194,212,213,225`. Nenhum arquivo em `app/` ou `src/components/` importa `@/sync/engine` |
| O serializador | `src/sync/serialize.ts` | **Implementado, sem chamador de produção** — `serialize` é chamado por `scripts/device-session.ts:269`, `src/data/repository.test.ts:70` e `src/sync/agreement.test.ts:131,284` |
| O `Transport` concreto (HTTP/Supabase) | — | **NÃO IMPLEMENTADO.** Não existe nenhum arquivo que implemente o tipo `Transport` fora dos falsos de teste (`src/sync/sync.test.ts:53,168,188`). Não existe cliente Supabase no repositório: a busca por `supabase` em `src/` e `app/` só encontra comentários e o caminho `supabase/migrations` |
| A ligação entre `drain` e `serialize` | — | **NÃO IMPLEMENTADO.** `drain` entrega `readonly OutboxEntry[]` ao `Transport` (`src/sync/engine.ts:36`) e nunca chama `serialize`. Quem serializa hoje é o script de verificação, não o motor |
| Tela que mostra o estado da fila | — | **NÃO IMPLEMENTADO.** `pendingCount` só é chamado pelo motor e por testes |
| Recepção no servidor do comando `erase` | — | **NÃO IMPLEMENTADO.** `serialize` emite `{ kind: 'erase', area }` (`src/sync/serialize.ts:390-393`) e nenhuma migração cria destino para ele; registrado como decisão pendente do dono em `docs/insights.md:565-571` |
| Descida (servidor → aparelho) | — | **NÃO IMPLEMENTADO.** Todo o código descrito nesta seção é de subida. Não há `pull`, não há cursor de última sincronização, não há resolução de conflito de duas escritas concorrentes |

O que **é** provado hoje, e provado contra Postgres de verdade, é a costura: a
fila que uma sessão real produz é serializada pelo mesmo `serialize` e entra num
servidor construído pelas migrações reais, sob RLS, duas vezes
(`scripts/verify-migrations.sh:417-558`).

---

### 14.2 A fila local: o que é enfileirado, quando, e em que ordem

#### 14.2.1 A tabela no aparelho

```sql
CREATE TABLE IF NOT EXISTS outbox (
  id         TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  payload    TEXT NOT NULL,
  queued_at  TEXT NOT NULL,
  sent_at    TEXT
);

CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (queued_at) WHERE sent_at IS NULL;
```

(`src/data/db.ts:146-153` e `src/data/db.ts:157`.) A coluna `op` **não** nasce
aqui: ela entra na migração V2 do aparelho, com
`ALTER TABLE outbox ADD COLUMN op TEXT NOT NULL DEFAULT 'upsert'`
(`src/data/db.ts:182`). A razão escrita: a primeira versão da fila só sabia dizer
"esta linha mudou", o que serve para criar e alterar e é inútil para apagar —
não sobra nada no aparelho para enviar (`src/data/db.ts:173-180`).

O índice é **parcial** (`WHERE sent_at IS NULL`): só o que ainda não subiu é
indexado.

#### 14.2.2 O tipo que atravessa o código

```ts
export type OutboxOp = 'upsert' | 'delete';

export type OutboxEntry = {
  id: string;
  table: string;
  rowId: string;
  op: OutboxOp;
  payload: Record<string, unknown>;
  queuedAt: string;
};

export type PendingWrite = {
  table: string;
  rowId: string;
  op?: OutboxOp;
  payload?: Record<string, unknown>;
};
```

(`src/data/outbox.ts:24-40`.) Note que `OutboxEntry.table` é `string`, não uma
união fechada: a validação de "esta tabela sabe ser enviada?" acontece no
serializador, em tempo de execução, e é onde `UnknownTableError` nasce.

#### 14.2.3 `enqueue` — recebe a conexão, não abre uma

```ts
export async function enqueue(conn: Db, writes: readonly PendingWrite[]): Promise<void> {
  const at = nowIso();
  for (const write of writes) {
    await conn.runAsync(
      `INSERT INTO outbox (id, table_name, row_id, op, payload, queued_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [newId(), write.table, write.rowId, write.op ?? 'upsert',
       JSON.stringify(write.payload ?? {}), at],
    );
  }
}
```

(`src/data/outbox.ts:46-63`.) A assinatura recebe `conn` **de propósito**: o
chamador já está dentro de uma transação e o enqueue tem que entrar nela, para
que não exista instante em que o dado existe e a intenção de sincronizá-lo não
(`src/data/outbox.ts:42-45` e `src/data/outbox.ts:10-14`). Um `queuedAt` único é
calculado uma vez por chamada e compartilhado por todas as escritas do mesmo ato.

Consequência provada: `src/sync/sync.test.ts:121-135` grava uma versão de receita
com uma linha apontando para item inexistente, a transação estoura na chave
estrangeira no meio, e `pendingCount()` volta **zero** — "a rolled back write
must not leave a queued one".

#### 14.2.4 `pendingEntries` — a ordem é a regra

```sql
SELECT id, table_name, row_id, op, payload, queued_at
  FROM outbox WHERE sent_at IS NULL
 ORDER BY queued_at, rowid
 LIMIT ?
```

(`src/data/outbox.ts:82-86`; assinatura `pendingEntries(limit = 100)` em
`src/data/outbox.ts:72`.) O desempate é `rowid` — o contador interno do SQLite —
porque `queued_at` tem resolução de milissegundo e um mesmo ato enfileira várias
linhas com o mesmo carimbo. Sem o desempate, a linha de receita poderia sair
antes da receita.

`parsePayload` (`src/data/outbox.ts:99-109`) devolve `{}` para JSON inválido em
vez de lançar: "um payload que não parseia é bug, não motivo para travar a fila
atrás dele para sempre. O id da linha continua ali."

#### 14.2.5 `markSent`, `forgetSentBefore`, `pendingCount`

```sql
UPDATE outbox SET sent_at = ? WHERE id IN (?, ?, …) AND sent_at IS NULL
```

(`src/data/outbox.ts:129`.) A cláusula `AND sent_at IS NULL` garante que
remarcar não reescreve o carimbo original. A lista de `?` é montada por
interpolação de **marcadores**, nunca de valores
(`src/data/outbox.ts:126`, com `proofgate-allow` explicando isso na linha).

`pendingCount()` é `SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NULL`
(`src/data/outbox.ts:114`).

`forgetSentBefore(iso)` é
`DELETE FROM outbox WHERE sent_at IS NOT NULL AND sent_at < ?`
(`src/data/outbox.ts:141`). Motivo escrito: entradas enviadas valem alguns dias
para poder responder "isso subiu?", e valem ser apagadas depois para o celular de
uma fábrica movimentada não carregar um ano delas
(`src/data/outbox.ts:134-138`). **Sem chamador de produção** — só
`src/data/repository.test.ts:774`.

#### 14.2.6 `QUEUED_TABLES` e `forgetOrphans` — a órfã que travava a fila

```ts
export const QUEUED_TABLES = [
  'items', 'locations', 'movements', 'lots', 'products',
  'purchases', 'purchase_lines', 'recipes', 'recipe_versions', 'recipe_lines',
  'readings', 'orders', 'order_lines', 'product_lines', 'product_types', 'flavors',
] as const;
```

(`src/data/outbox.ts:156-173`.) São 16 nomes. `erase` **não** está na lista de
propósito: é comando, não linha, e não tem linha atrás dele
(`src/data/outbox.ts:152-155`).

`forgetOrphans(conn)` (`src/data/outbox.ts:193-216`) percorre `QUEUED_TABLES` e,
para cada uma, roda:

```sql
SELECT o.id FROM outbox o
 WHERE o.sent_at IS NULL AND o.table_name = ?
   AND NOT EXISTS (SELECT 1 FROM <tabela> t WHERE t.id = o.row_id)
```

e apaga cada órfã uma por uma, com o id ligado. A cicatriz escrita: apagar uma
área deixa na fila entradas apontando para linhas que acabaram de ser apagadas;
órfã não é recusa do servidor, é o serializador levantando
*"Queued movements X but the row is gone from the device"* — e o motor para a
fila no primeiro buraco de propósito, então tudo o que a fábrica gravar depois
fica preso atrás dela (`src/data/outbox.ts:177-192`). Apagar é correto e não é
perda: a entrada nunca subiu (`sent_at` nulo), então o servidor nunca soube da
linha. É chamado de dentro da transação de `eraseArea`
(`src/data/repository.ts:3496`).

O guard que protege essa lista está em `src/data/outbox.test.ts`: um teste lê
todo `table: '...'` de `repository.ts` e reprova se aparecer tabela que a
varredura não conhece (`src/data/outbox.test.ts:34-54`); outro lê os
`CREATE TABLE IF NOT EXISTS` de `db.ts` e exige que cada tabela da lista exista e
tenha coluna `id` (`src/data/outbox.test.ts:56-71`).

#### 14.2.7 Todos os pontos de enfileiramento, e o que cada um enfileira

| Ato (função do repositório) | Linha | O que entra na fila, nesta ordem |
|---|---|---|
| `saveItem` | `src/data/repository.ts:272` | `items` |
| `recordPurchase` | `src/data/repository.ts:455-459` | `purchases`, `purchase_lines`, `movements` — **os dois últimos com o MESMO `rowId` (`lineId`)** |
| `savePlace` | `src/data/repository.ts:692` | `locations` |
| `ensureLocation` | `src/data/repository.ts:862` | `locations` com `rowId = companyId` |
| `recordCount` | `src/data/repository.ts:969` | `movements` (kind `adjustment`) |
| `saveRecipeVersion` | `src/data/repository.ts:1214-1218` | `recipes`, `recipe_versions`, depois uma entrada `recipe_lines` por linha |
| `recordProduction` | `src/data/repository.ts:1521` e `:1553` | `lots` primeiro, depois um `movements` por linha da corrida (1 `production` + N `consumption`) |
| `recordTransfer` | `src/data/repository.ts:1738` | dois `movements` (perna de saída e perna de entrada) |
| `saveProduct` | `src/data/repository.ts:2023` | `products` |
| `recordLoss` | `src/data/repository.ts:2161` | `movements` (kind `loss`) |
| conferência de posto | `src/data/repository.ts:2512` | um `movements` por diferença (kind `discrepancy`) |
| `recordReading` | `src/data/repository.ts:2808` | `readings` |
| `eraseArea` | `src/data/repository.ts:3507` | `{ table: 'erase', rowId: area, op: 'delete', payload: { area } }` |
| ajuste de item | `src/data/repository.ts:3620` | `items` |
| `saveLine` | `src/data/repository.ts:3693` | `product_lines` |
| `saveType` | `src/data/repository.ts:3711` | `product_types` |
| `saveFlavor` | `src/data/repository.ts:3729` | `flavors` |
| `setOrderStatus` | `src/data/repository.ts:4104` | `orders` |
| `reverseGroup` | `src/data/repository.ts:4504` | um `movements` (kind `reversal`) por movimento original |

`saveOrder` monta a lista antes de enfileirar: `const writes = [{ table: 'orders', rowId: id }]`
(`src/data/repository.ts:4010`), depois um `writes.push({ table: 'order_lines', rowId: lineId })`
por linha (`src/data/repository.ts:4018`), e um `enqueue(conn, writes)` só
(`src/data/repository.ts:4020`) — pedido antes das linhas dele, na mesma
transação.

O `item_costs` **não é enfileirado por lugar nenhum** hoje: ele não está em
`QUEUED_TABLES` e nenhum `enqueue` o nomeia. A razão está transcrita em 14.6.

---

### 14.3 O motor de envio (`drain`)

#### 14.3.1 Os tipos

```ts
export type PushResult = {
  /** The ids the server actually stored. Anything absent stays queued. */
  acceptedIds: string[];
};

export type Transport = {
  push(entries: readonly OutboxEntry[]): Promise<PushResult>;
};

export type SyncReport = {
  sent: number;
  remaining: number;   // ainda na fila quando a execução parou; zero = tudo subiu
  batches: number;
  attempts: number;
  error?: string;      // presente quando parou cedo; a fila fica intacta de todo jeito
};

export type SyncOptions = {
  batchSize?: number;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;   // injetado para o teste não esperar
  now?: () => number;
};
```

(`src/sync/engine.ts:30-55`.) `SyncOptions.now` está declarado e **não é lido em
lugar nenhum** de `drain` — é campo sem uso.

O motor não conhece Supabase, HTTP nem autenticação: conhece a fila e um
`Transport`. É isso que torna as regras que importam — ordem, aceitação parcial,
retentativa, o que pode ser marcado como enviado — testáveis contra um falso,
antes de alguém ter se autenticado (`src/sync/engine.ts:5-11`).

#### 14.3.2 As três regras, transcritas

1. **A ordem é preservada e nunca pulada.** Uma linha de receita que chega antes
   da receita é erro de chave estrangeira. Então um lote que não é aceito
   inteiro **para a execução**; a tentativa seguinte começa outra vez pela coisa
   mais velha ainda pendente, em vez de seguir por cima de um buraco
   (`src/sync/engine.ts:14-18`).
2. **Só o que o servidor confirmou é marcado como enviado.** Marcar em "a
   chamada não estourou" é como dado desaparece em silêncio: o telefone esquece,
   o servidor nunca teve, e ninguém descobre até uma contagem vir curta meses
   depois (`src/sync/engine.ts:19-23`).
3. **Falha é atraso, não perda.** O que não foi confirmado fica na fila
   exatamente como estava. Enviar duas vezes é inofensivo — os ids vêm do
   aparelho e o servidor faz upsert sobre eles — então a jogada segura é sempre
   tentar de novo (`src/sync/engine.ts:24-27`).

#### 14.3.3 `backoffMs` — a fórmula exata

```ts
export function backoffMs(attempt: number, base = 1_000, cap = 60_000): number {
  if (attempt <= 0) return 0;
  return Math.min(cap, base * 2 ** (attempt - 1));
}
```

(`src/sync/engine.ts:64-67`.) Valores provados em
`src/sync/sync.test.ts:234-241`: `backoffMs(0) = 0`, `backoffMs(1) = 1000`,
`backoffMs(2) = 2000`, `backoffMs(3) = 4000`, `backoffMs(99) = 60000`.

O teto importa mais que o crescimento: "um telefone que passou a noite num
freezer deve tentar de novo algumas vezes por hora, não uma vez por semana, e
também não deve martelar um servidor que já está tendo um dia ruim"
(`src/sync/engine.ts:58-62`).

O `sleep` padrão é `(ms) => new Promise(resolve => setTimeout(resolve, ms))`
(`src/sync/engine.ts:69`).

#### 14.3.4 O algoritmo de `drain`, passo a passo

Padrões: `batchSize = 100`, `maxAttempts = 3`, `sleep = defaultSleep`
(`src/sync/engine.ts:79-81`).

```
sent = 0; batches = 0; attempts = 0; error = undefined

enquanto attempts < maxAttempts:
    batch = await pendingEntries(batchSize)          # engine.ts:89
    se batch estiver vazio: PARA                     # engine.ts:90
    attempts += 1                                    # engine.ts:92

    tenta:  result = await transport.push(batch)      # engine.ts:96
    se lançou:
        error = mensagem do erro                     # engine.ts:98
        # nada é marcado: o lote inteiro segue exatamente onde estava
        se attempts < maxAttempts: await sleep(backoffMs(attempts))
        continua                                     # engine.ts:100-101

    accepted  = Set(result.acceptedIds)               # engine.ts:104
    confirmed = batch.filter(e => accepted.has(e.id)) # engine.ts:105
    await markSent(confirmed.map(e => e.id))          # engine.ts:107
    sent    += confirmed.length                       # engine.ts:108
    batches += 1                                      # engine.ts:109

    se confirmed.length < batch.length:               # engine.ts:111
        error = `O servidor aceitou ${confirmed.length} de ${batch.length} registros.`
        se attempts < maxAttempts: await sleep(backoffMs(attempts))
        continua                                      # engine.ts:114-116

    error = undefined                                 # engine.ts:119
    se batch.length < batchSize: PARA                 # engine.ts:120

devolve { sent, remaining: await pendingCount(), batches, attempts, error }
```

Cinco detalhes que só se leem no código e mudam o comportamento:

- **`attempts` conta lotes, não falhas.** Ele é incrementado antes do `push`
  (`src/sync/engine.ts:92`), então uma fila de 300 entradas com `batchSize` 100 e
  `maxAttempts` 3 gasta as três tentativas nos três lotes felizes e nunca sobra
  tentativa para uma retentativa. É por isso que
  `src/sync/sync.test.ts:225` passa `maxAttempts: 50` quando quer vários lotes.
- **A aceitação parcial marca o que foi aceito.** `markSent` roda *antes* da
  checagem de buraco (`src/sync/engine.ts:107` contra `:111`), então a metade
  aceita não é reenviada — só o resto fica.
- **Não há espera depois da última tentativa.** As duas esperas são guardadas por
  `if (attempts < maxAttempts)` (`src/sync/engine.ts:100` e `:115`), e
  `src/sync/sync.test.ts:205` prova exatamente isso: com `maxAttempts: 3` os
  tempos observados são `[1000, 2000]`, dois e não três.
- **`error` é limpo no sucesso** (`src/sync/engine.ts:119`), então um relatório
  com `error` presente significa que a *última* passagem falhou.
- **Um lote curto encerra a execução** (`src/sync/engine.ts:120`): menos linhas
  que o tamanho do lote é a prova de que a fila acabou, sem gastar uma consulta a
  mais.

#### 14.3.5 A única frase de produto do motor

```
O servidor aceitou {confirmados} de {total} registros.
```

(`src/sync/engine.ts:114`.) É a única string em português do motor, e ela **não
passa por `src/i18n/locales/`** — está literal no código. Nenhuma tela a exibe
hoje.

---

### 14.4 O serializador: as três diferenças que ele existe para cruzar

O arquivo abre dizendo por que existe: por muito tempo nada fazia isso. A fila
enfileirava `{table, rowId}` e o motor entregava entradas a um transporte
abstrato, então **o passo onde as formas do SQLite encontram as do Postgres não
tinha código nenhum** — e foi exatamente por isso que seis incompatibilidades
ficaram ali sem ser vistas: não havia nada para estar errado
(`src/sync/serialize.ts:5-11`).

As três diferenças, transcritas (`src/sync/serialize.ts:13-28`):

- **TIPO.** SQLite não tem booleano. `active` é 0 ou 1 no telefone e `true`/`false`
  no servidor, e o Postgres não converte um no outro em silêncio — o insert falha
  de vez.
- **FORMA.** Algumas colunas existem de um lado só. `purchase_lines.created_at` é
  escrituração do próprio aparelho e o servidor não a quer; uma coluna enviada que
  não existe é erro, não campo ignorado.
- **IDENTIDADE.** `movements.recorded_by` e `purchases.created_by` são NOT NULL e
  referenciam usuário real. O aparelho não tem usuário — é o telefone de uma
  pessoa, trabalhando offline, e quem ela é só se sabe no momento de enviar. Então
  o ator é estampado aqui, na saída, e não guardado em cada linha desde o início.

E o princípio que fecha o arquivo: **tudo é explícito. Não existe "manda as
colunas que a linha tiver"**, porque é assim que uma coluna nova de aparelho
chega ao servidor como falha silenciosa em vez de erro de compilação
(`src/sync/serialize.ts:29-31`).

#### 14.4.1 O ator

```ts
/** Who is sending. Known at sync time, never at write time. */
export type SyncActor = {
  userId: string;
};
```

(`src/sync/serialize.ts:34-38`.)

#### 14.4.2 O resultado: três formas de escrita

```ts
export type ServerWrite =
  | { kind: 'upsert'; table: ServerTable; row: Record<string, unknown> }
  | { kind: 'erase'; area: string }
  | { kind: 'derived'; table: string };
```

(`src/sync/serialize.ts:40-59`.) `erase` não é linha: é comando dizendo que uma
área foi limpa no aparelho. `derived` é a recusa deliberada de enviar, explicada
em 14.6.

#### 14.4.3 As dezesseis tabelas que o aparelho sabe enviar

```ts
export type ServerTable =
  | 'locations' | 'readings' | 'items' | 'recipes' | 'recipe_versions'
  | 'recipe_lines' | 'product_lines' | 'product_types' | 'flavors'
  | 'products' | 'lots' | 'purchases' | 'purchase_lines'
  | 'orders' | 'order_lines' | 'movements';
```

(`src/sync/serialize.ts:61-77`.) `export const sendableTables = Object.keys(CROSSINGS) as ServerTable[]`
(`src/sync/serialize.ts:371`) — a lista vem das chaves do mapa, não de uma
segunda lista escrita à mão.

**A ordem das chaves do objeto `CROSSINGS` é a ordem de `sendableTables`**, e é
`readings, locations, items, recipes, recipe_versions, recipe_lines,
product_lines, product_types, flavors, products, lots, purchases,
purchase_lines, orders, order_lines, movements` (`src/sync/serialize.ts:131-367`).
Essa ordem **não** é a ordem de envio — a de envio é a da fila. Ela só importa
para os guards que iteram `sendableTables`.

#### 14.4.4 O erro de tabela desconhecida

```ts
export class UnknownTableError extends Error {
  constructor(public readonly table: string) {
    super(`Nothing knows how to send rows of "${table}"`);
    this.name = 'UnknownTableError';
  }
}
```

(`src/sync/serialize.ts:79-84`.) Tabela ausente do mapa **não pode ser enviada, e
isso é deliberado**: uma tabela nova de aparelho é uma decisão sobre o que o
servidor deve receber, não algo a inferir em tempo de execução
(`src/sync/serialize.ts:118-120`).

#### 14.4.5 Os três conversores, transcritos

```ts
/** SQLite's 0/1 as the server's boolean. Anything missing counts as true. */
function flag(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return value === 1 || value === '1' || value === true;
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value;
}

function structure(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
```

(`src/sync/serialize.ts:87-112`.) Três consequências exatas:

- `flag` trata **ausente e nulo como `true`**. Não é acidente: `active` do lado
  do aparelho é `NOT NULL DEFAULT 1`, e uma linha sem a coluna é linha de
  esquema antigo, que deve subir ativa.
- `nullable` converte só `undefined` em `null`. `null` continua `null`, `0`
  continua `0`, `''` continua `''`. É o que faz uma coluna **prometida e ausente**
  virar `null` explícito no payload em vez de desaparecer dele — e a diferença
  importa: `src/sync/serialize.test.ts:91-95` afirma
  `write.row.operator_id === null` justamente porque "uma coluna que sumisse do
  payload seria indistinguível de uma que ninguém ensinou a mandar".
- `structure` existe porque **o SQLite não tem coluna JSON e o servidor tem
  `jsonb`**. Enviado como está, "o Postgres aceita felizmente e guarda uma
  *string* entre aspas onde deveria haver um array — a escrita passa, nada
  reclama, e a embalagem fica inutilizável do outro lado. As falhas que ainda
  parecem sucesso são as que valem uma função" (`src/sync/serialize.ts:96-103`).
  JSON inválido vira `null`, nunca exceção.

#### 14.4.6 A função `serialize`

```ts
export function serialize(
  entry: OutboxEntry,
  row: Record<string, unknown> | null,
  actor: SyncActor,
): ServerWrite {
  if (entry.table === 'item_costs' || entry.table === 'item_cost_history') {
    return { kind: 'derived', table: entry.table };
  }

  if (entry.table === 'erase') {
    const area = entry.payload?.area;
    return { kind: 'erase', area: typeof area === 'string' ? area : entry.rowId };
  }

  const crossing = CROSSINGS[entry.table as ServerTable];
  if (!crossing) throw new UnknownTableError(entry.table);

  if (!row) {
    throw new Error(`Queued ${entry.table} ${entry.rowId} but the row is gone from the device`);
  }

  const out: Record<string, unknown> = {};
  for (const column of crossing.take) out[column] = nullable(row[column]);
  Object.assign(out, crossing.build?.(row, actor) ?? {});

  return { kind: 'upsert', table: entry.table as ServerTable, row: out };
}
```

(`src/sync/serialize.ts:381-407`.) Ordem de resolução, que é o contrato:
**derivados → comando `erase` → travessia → linha ausente → payload**. O `build`
roda *depois* do `take` e sobrescreve o que colidir (`Object.assign`), que é como
`active` sai booleano e `packaging` sai estrutura mesmo estando também no `take`
de outras tabelas.

A mensagem de linha ausente é exatamente
`Queued <tabela> <rowId> but the row is gone from the device`
(`src/sync/serialize.ts:399`) — é a exceção que `forgetOrphans` existe para
evitar.

---

### 14.5 O mapeamento campo-a-campo, tabela por tabela

A convenção das tabelas abaixo: **`take`** = atravessa sem conversão;
**`build`** = convertido, renomeado ou estampado; a coluna "no aparelho" é o tipo
SQLite de `src/data/db.ts`, a coluna "no servidor" é o tipo Postgres das
migrações.

#### `readings` (`src/sync/serialize.ts:131-147`)

`take`: `id`, `company_id`, `location_id`, `device_id`, `kind`, `value`, `unit`,
`taken_at`, `recorded_at`, `source`
`build`: `{ recorded_by: actor.userId }`

| Coluna | Aparelho | Servidor | Nota |
|---|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `uuid primary key default gen_random_uuid()` | id vem do aparelho, sempre |
| `company_id` | `TEXT NOT NULL` | `uuid not null` FK `companies` | |
| `location_id` | `TEXT NOT NULL` FK `locations` | `uuid not null` FK `locations` restrict | |
| `device_id` | `TEXT` (nulo) | `uuid references devices(id) on delete set null` | **Nulo atravessa como nulo de propósito**: no servidor a coluna aceita nulo porque "pessoa não é aparelho" (`src/sync/serialize.ts:132-133`); leitura digitada é fato como leitura de sensor (`supabase/migrations/0024:29-30`) |
| `kind` | `TEXT NOT NULL` | `text not null` + `check (length(trim(kind)) > 0)` | **Texto aberto, não enum** — grandeza nova entra como dado (`supabase/migrations/0024:9-12`) |
| `value` | `REAL NOT NULL` | `numeric(14,4) not null` | |
| `unit` | `TEXT NOT NULL` | `text not null` + `check (length(trim(unit)) > 0)` | "4 é geladeira boa em Celsius e freezer quebrado em Fahrenheit" (`supabase/migrations/0024:44-45`) |
| `taken_at` | `TEXT NOT NULL` | `timestamptz not null` | quando mediu no mundo |
| `recorded_at` | `TEXT NOT NULL` | `timestamptz not null default now()` | |
| `source` | `TEXT NOT NULL DEFAULT 'typed'` | `text not null default 'typed'` | valores citados: `typed`, `ble`, `wifi`, `zigbee`, `lora` (`supabase/migrations/0024:13-14`) |
| `recorded_by` | **não existe no aparelho** | `uuid not null` FK `auth.users` | estampado do ator |

#### `locations` (`src/sync/serialize.ts:149-167`)

`take`: `id`, `company_id`, `name`, `kind`, `created_at`, `contact_phone`,
`delivery_days`, `agreement_note`
`build`: `{ sensor_ranges: structure(row.sensor_ranges) }`

| Coluna | Aparelho | Servidor | Nota |
|---|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `uuid primary key` | o lugar padrão tem `id = company_id` (`src/data/repository.ts:862`) |
| `name` | `TEXT NOT NULL` | `text not null` | o lugar padrão nasce com nome vazio, porque a interface é que nomeia (`src/data/db.ts:258-261`) |
| `kind` | `TEXT NOT NULL DEFAULT 'store_room'` | `location_kind not null` | enum do servidor: `factory`, `cold_room`, `store_room`, `own_store`, `customer`, `vehicle` (`supabase/migrations/0001:109`) |
| `created_at` | `TEXT NOT NULL` | `timestamptz` | |
| `contact_phone` | `TEXT` (V12, `src/data/db.ts:527`) | `text` (0021) | "um telefone que fica só no aparelho some quando o aparelho some, e é o número que alguém liga para avisar que a carga atrasou" (`src/sync/serialize.ts:150-152`) |
| `delivery_days` | `INTEGER NOT NULL DEFAULT 0` | `smallint not null default 0` + `check between 0 and 127` | **bitmask com bit 0 no domingo**, a mesma numeração de `Date.getDay()`; inteiro atravessa sem conversão, e é isso que garante os dois lados lendo o mesmo acordo (`supabase/migrations/0021:7-11`). Zero é "não combinamos dia", que não é "nenhum dia" (`supabase/migrations/0021:13-14`) |
| `agreement_note` | `TEXT` | `text` | |
| `sensor_ranges` | `TEXT NOT NULL DEFAULT '{}'` (V15, `src/data/db.ts:619`) | `jsonb not null default '{}'` + `check (jsonb_typeof(sensor_ranges) = 'object')` | **passa por `structure`**: cru, o Postgres guardaria string entre aspas e a restrição recusaria a fila inteira (`src/sync/serialize.ts:163-166`) |

#### `items` (`src/sync/serialize.ts:169-182`)

`take`: `id`, `company_id`, `kind`, `name`, `purchase_unit`, `purchase_to_base`,
`base_unit`, `created_at`, `full_level`
`build`: `{ active: flag(row.active), packaging: structure(row.packaging) }`

| Coluna | Aparelho | Servidor | Nota |
|---|---|---|---|
| `kind` | `TEXT NOT NULL` | `item_kind not null` | enum: `input`, `packaging`, `product`, `resale`, `store_supply` (`supabase/migrations/0001:133`) |
| `purchase_unit` | `TEXT` | `text` | "um saco de 25 kg, um balde de 10 kg" |
| `purchase_to_base` | `REAL` | `numeric(14,4)` | quantas unidades-base cabem numa unidade de compra |
| `base_unit` | `TEXT NOT NULL DEFAULT 'g'` | `text not null default 'un'` (0003) | o servidor só ganhou a coluna na 0003, e a migração diz por quê: "o esquema do aparelho já carrega, então o servidor tem que ter também ou o sync perde" (`supabase/migrations/0003:12-13`) |
| `full_level` | `REAL` (V14, `src/data/db.ts:577`) | `numeric(14,4)` + `check (full_level is null or full_level > 0)` (0023) | a régua das faixas de cor; **é a cicatriz que criou `columns.test.ts`** — ficou fora do serializador e nunca chegaria ao servidor (`src/sync/columns.test.ts:9-14`) |
| `active` | `INTEGER NOT NULL DEFAULT 1` | `boolean not null default true` | via `flag` |
| `packaging` | `TEXT NOT NULL DEFAULT '[{"id":"unit","perBaseUnit":1}]'` | `jsonb not null default '[{"id":"unit","perBaseUnit":1}]'` | via `structure` |

#### `recipes` (`src/sync/serialize.ts:184-187`)

`take`: `id`, `company_id`, `name`, `yield_amount`, `yield_unit`, `created_at`
`build`: `{ active: flag(row.active) }`

Servidor: `yield_amount numeric(14,4) not null check (> 0)`,
`yield_unit text not null default 'ml'` (`supabase/migrations/0002:102-113`).

#### `recipe_versions` (`src/sync/serialize.ts:189-200`)

`take`: `id`, `company_id`, `recipe_id`, `version`, `effective_from`,
`loss_fraction`, `note`, `created_at` — **sem `build`**.

Servidor: `loss_fraction numeric(5,4) not null default 0 check (>= 0 and < 1)`,
`effective_from date not null default current_date`, `unique (recipe_id, version)`
(`supabase/migrations/0002:119-132`).

#### `recipe_lines` (`src/sync/serialize.ts:202-215`)

`take`: `id`, `company_id`, `recipe_version_id`, `item_id`, `sub_recipe_id`,
`quantity`, `position` — **sem `build`**.

`position` **só se tornou coluna do servidor depois que este arquivo existiu para
notar que faltava**: sem ela, uma receita sincronizada volta com os ingredientes
numa ordem que ninguém escolheu (`src/sync/serialize.ts:203-205`). A migração que
a acrescentou é
`alter table recipe_lines add column position integer not null default 0`
mais `create index recipe_lines_order_idx on recipe_lines (recipe_version_id, position)`
(`supabase/migrations/0010:14-16`), e a razão escrita ali: "uma ficha técnica é
lida de cima para baixo enquanto alguém trabalha, e quem a escreveu colocou a
base primeiro e o corante por último de propósito".

Restrição de exatamente uma fonte: no aparelho
`CHECK ((item_id IS NULL) <> (sub_recipe_id IS NULL))` (`src/data/db.ts:470`), no
servidor `constraint one_source check (num_nonnulls(item_id, sub_recipe_id) = 1)`
(`supabase/migrations/0002:142`).

#### `product_lines` (`src/sync/serialize.ts:220-223`)

`take`: `id`, `company_id`, `name`, `sort` · `build`: `{ active: flag(row.active) }`

#### `product_types` (`src/sync/serialize.ts:225-228`)

`take`: `id`, `company_id`, `line_id`, `name`, `sort` · `build`: `{ active: flag(row.active) }`

#### `flavors` (`src/sync/serialize.ts:230-233`)

`take`: `id`, `company_id`, `name`, `sort` · `build`: `{ active: flag(row.active) }`

Comentário que rege as três: "a grade tem que atravessar junto, e a ordem em que
ela é enfileirada é a ordem em que ela chega: linha antes do tipo, tipo antes do
produto. A fila é enviada da mais velha para a mais nova exatamente por isso"
(`src/sync/serialize.ts:217-219`). No servidor, `product_types` tem
`unique (id, line_id)` e FK composta para a linha da mesma empresa
(`supabase/migrations/0018:50-63`), e `products` liga tipo à linha com
`match full` (`supabase/migrations/0018:103-110`).

#### `products` (`src/sync/serialize.ts:235-253`)

`take`: `id`, `company_id`, `item_id`, `recipe_id`, `yield_per_unit`,
`unit_packaging_cents`, `shelf_life_days`, `line_id`, `type_id`, `flavor_id`
`build`: `{ active: flag(row.active), packaging_items: structure(row.packaging_items) }`

| Coluna | Aparelho | Servidor | Nota |
|---|---|---|---|
| `yield_per_unit` | `REAL` | `numeric(14,4)` | quanto do tacho uma unidade leva |
| `unit_packaging_cents` | `INTEGER NOT NULL DEFAULT 0` | `bigint not null default 0` | `Cents` — inteiro |
| `shelf_life_days` | `INTEGER` (V11, `src/data/db.ts:515`) | `integer check (is null or > 0)` (0020) | nulo = "não vence", e isso é resposta válida (`supabase/migrations/0020:14-18`) |
| `line_id`/`type_id`/`flavor_id` | `TEXT` FK (V9, `src/data/db.ts:438-440`) | `uuid` FK composta (0018) | |
| `packaging_items` | `TEXT NOT NULL DEFAULT '[]'` (V13, `src/data/db.ts:560`) | `jsonb not null default '[]'` + `products_packaging_items_is_a_list` (0022) | via `structure`; cru, "o consumo do outro lado passa a somar nada" (`src/sync/serialize.ts:248-252`) |
| `active` | `INTEGER` | `boolean` | via `flag` |

Restrição do servidor que a fila tem que respeitar:
`constraint manufactured_needs_recipe check ((recipe_id is null) = (yield_per_unit is null))`
(`supabase/migrations/0002:171-173`).

#### `lots` (`src/sync/serialize.ts:260-274`)

`take`: `id`, `company_id`, `item_id`, `code`, `produced_on`, `expires_on`,
`recipe_version_id`, `created_at` — **sem `build`**.

O comentário é a regra de ordem escrita por extenso: "o lote atravessa antes do
movimento que o cita, e a fila cuida disso sozinha: ela é enviada da escrita mais
velha para a mais nova, e `recordProduction` grava o lote antes das linhas. Fosse
ao contrário, o servidor recusaria o movimento por chave estrangeira — **o
aparelho não tem essa FK**, então é aqui que a ordem tem que estar certa"
(`src/sync/serialize.ts:255-259`). Confirmado no esquema: no aparelho
`movements.lot_id` é `TEXT` sem referência (`src/data/db.ts:236`); no servidor é
`uuid references lots(id) on delete restrict`.

`recipe_version_id` no servidor é `uuid references recipe_versions(id)`
(`supabase/migrations/0026:27`); no aparelho é `TEXT` sem FK, acrescentado pela V16
(`src/data/db.ts:642`). Nulo é resposta: lote de
importação não tem ficha (`src/data/db.ts` V16, docblock).

`unique (company_id, code)` no servidor (`supabase/migrations/0001:163`) e
`CREATE UNIQUE INDEX lots_code_idx ON lots (company_id, code)` no aparelho
(`src/data/db.ts:510`).

#### `purchases` (`src/sync/serialize.ts:276-279`)

`take`: `id`, `company_id`, `supplier_name`, `ordered_at`, `received_at`,
`created_at`
`build`: `{ created_by: actor.userId }`

`supplier_name` só existe no servidor por causa desta fila:
`alter table purchases add column supplier_name text` — "hoje o comprador digita
'Fornecedor Silva' num campo, e esse texto não tinha onde cair: a nota chegaria
ao servidor tendo esquecido quem vendeu" (`supabase/migrations/0010:18-28`). Os
dois ficam: o nome é o que foi digitado, o `supplier_id` é o que ele resolve
quando fornecedores virarem coisa que alguém gerencia.

**Colunas do servidor que a fila deliberadamente não envia e que existem:**
`supplier_id`, `invoice_number`, `freight_cents bigint not null default 0`
(`supabase/migrations/0002:32-42`). O `freight_cents` é o caso que decidiu a forma
do SQL emitido — ver 14.8.2.

#### `purchase_lines` (`src/sync/serialize.ts:281-293`)

`take`: `id`, `company_id`, `purchase_id`, `item_id`, `purchase_quantity`,
`base_units`, `total_cents` — **sem `build`**.

`created_at` **fica no aparelho**: "é escrituração do próprio aparelho, e o
servidor não tem coluna para ela" (`src/sync/serialize.ts:282-283`). Está
declarado no registro de `columns.test.ts` com o motivo:
`'o servidor não tem a coluna; a hora que interessa é a da nota'`
(`src/sync/columns.test.ts:48`).

Servidor: `purchase_quantity numeric(14,4) not null check (> 0)`,
`base_units bigint not null check (> 0)`, `total_cents bigint not null check (>= 0)`,
mais `expected_base_units bigint` que o aparelho não tem
(`supabase/migrations/0002:44-58`).

#### `orders` (`src/sync/serialize.ts:297-311`)

`take`: `id`, `company_id`, `place_id`, `status`, `requested_for`, `note`,
`created_at`, `decided_at`
`build`: `{ recorded_by: actor.userId }` — "qual CONTA anotou o pedido. Como em
`purchases`, o aparelho não sabe quem é enquanto está offline: o ator é carimbado
na saída" (`src/sync/serialize.ts:308-310`).

| Coluna | Aparelho | Servidor |
|---|---|---|
| `status` | `TEXT NOT NULL DEFAULT 'open'` + `CHECK IN ('pending','open','delivered','cancelled')` | `text not null default 'open'` + `constraint orders_status_known check (status in ('pending','open','delivered','cancelled'))` |
| `requested_for` | `TEXT` | `date` |
| `decided_at` | `TEXT` | `timestamptz` |
| `place_id` | `TEXT NOT NULL` FK `locations` | `uuid not null` + FK composta `(place_id, company_id) references locations (id, company_id)` |
| `recorded_by` | **não existe no aparelho** | `uuid not null references auth.users(id)` |

**O `status` enviado pelo aparelho é sobrescrito pelo servidor.** O gatilho
`private.order_starts_where_the_company_says()` decide o estado inicial, porque
"o payload vem de fora, e `status` é um campo como outro qualquer no JSON"
(`supabase/migrations/0019:104-114`), e o estado depende de
`companies.orders_need_approval boolean not null default false`
(`supabase/migrations/0019:39-44`).

#### `order_lines` (`src/sync/serialize.ts:313-315`)

`take`: `id`, `company_id`, `order_id`, `item_id`, `base_units` — **sem `build`**.

Servidor: `base_units integer not null check (base_units > 0)`,
`unique (order_id, item_id)`, e FKs compostas para o pedido e para o item da
mesma empresa (`supabase/migrations/0019:74-91`).

#### `movements` — a travessia mais longa (`src/sync/serialize.ts:317-367`)

`take`, na ordem exata do array: `id`, `company_id`, `kind`, `occurred_at`,
`recorded_at`, `item_id`, `quantity_base_units`, `location_id`, `lot_id`, `post`,
`loss_reason`, `unit_cost_rate`, `device_id`, `movement_group_id`,
`counterpart_location_id`, `operator_id`, `reverses_movement_id`,
`assistant_phrase`, `note`
`build`: `{ recorded_by: actor.userId }`

| Coluna | Aparelho | Servidor | Nota transcrita |
|---|---|---|---|
| `kind` | `TEXT NOT NULL` | `movement_kind not null` | enum: `production`, `consumption`, `transfer`, `sale`, `loss`, `return`, `adjustment`, `discrepancy`, `reversal` (`supabase/migrations/0001:172-175`) mais `purchase`, acrescentado por `alter type movement_kind add value if not exists 'purchase'` (`supabase/migrations/0007:16`) — **dez valores** |
| `occurred_at` | `TEXT NOT NULL` | `timestamptz not null` | quando aconteceu no mundo, não quando chegou ao servidor |
| `recorded_at` | `TEXT NOT NULL` | `timestamptz not null default now()` | |
| `quantity_base_units` | `INTEGER NOT NULL` | `bigint not null` | assinado: positivo entra, negativo sai |
| `lot_id` | `TEXT` (sem FK) | `uuid references lots(id) on delete restrict` | a FK só existe do lado do servidor; a 0029 deixou escrito que `movements.lot_id` continua chave simples porque `lots` não tem `unique (id, company_id)` (`supabase/migrations/0029:20-27`) |
| `post` | `TEXT` (V7, `src/data/db.ts:366`) | `control_post` | enum: `picked`, `loaded`, `delivered`, `checked` (`supabase/migrations/0001:178`). "Em qual dos quatro postos de controle a linha foi escrita. Nulo em compra, produção e contagem: elas não acontecem num posto. Sem esta linha o fato existiria só no celular — a lista é fechada de propósito, e o que fica fora dela some em silêncio" (`src/sync/serialize.ts:328-332`) |
| `loss_reason` | `TEXT` | `loss_reason` | enum: `melted`, `broken`, `expired`, `courtesy`, `internal_use` (`supabase/migrations/0001:177`) + `constraint loss_needs_reason check (kind <> 'loss' or loss_reason is not null)` |
| `unit_cost_rate` | `REAL` | `double precision` (0008) | **`Rate`, não `Cents`** — fracionário, congelado no instante, nunca arredondado |
| `device_id` | **não existe no aparelho** | `uuid references devices(id) on delete restrict` (0013) | Sempre `null` hoje. "Nulo até o aparelho saber qual aparelho ele é. A coluna existe no servidor e é opcional, então nada quebra e nada reclama — que é exatamente por que ela está listada aqui em vez de esperar alguém lembrar. Quando a identidade chegar, o valor entra; o lugar onde ele entra já está escrito" (`src/sync/serialize.ts:335-341`) |
| `movement_group_id` | `TEXT` | `uuid` (0016) | o elo das sete linhas de uma corrida e das duas de uma transferência; nulo quando o ato tem uma linha só |
| `counterpart_location_id` | `TEXT` FK `locations` | `uuid references locations(id)` + FK composta por empresa (0029) | para onde foi a outra metade |
| `operator_id` | `TEXT` (V5, `src/data/db.ts:322`) | `uuid references memberships(id) on delete restrict` (0014) | "quem estava operando na hora, anotado no registro. Nulo quando a empresa não quer nomear ninguém — e nulo é resposta, não ausência: a linha continua respondendo pelo aparelho e pela conta" (`src/sync/serialize.ts:348-351`) |
| `reverses_movement_id` | `TEXT REFERENCES movements(id) DEFERRABLE INITIALLY DEFERRED` | `uuid` + `constraint reversal_points_somewhere check (kind <> 'reversal' or reverses_movement_id is not null)` | |
| `assistant_phrase` | `TEXT` | `text` | |
| `note` | `TEXT` | `text` | |
| `recorded_by` | **existiu e foi removida**: V4 é `ALTER TABLE movements ADD COLUMN recorded_by TEXT` (`src/data/db.ts:303`) e V5 é `ALTER TABLE movements ADD COLUMN operator_id TEXT` seguido de `ALTER TABLE movements DROP COLUMN recorded_by` (`src/data/db.ts:322-323`) | `uuid not null references auth.users(id)` | Estampado do ator |

O docblock do `build` de `movements` é a decisão de fundação escrita:

> **A conta que escreveu, e ela não se cede.** O servidor impõe
> `recorded_by = auth.uid()` na política de append, provado contra o Postgres na
> `db:verify`: a mesma escrita é aceita nomeando o próprio usuário da sessão e
> recusada nomeando qualquer outro. Como o login é da empresa, essa conta É quem
> sincroniza — não há o que decidir aqui. Quem estava operando é outra pergunta, e
> viaja em `operator_id`.

(`src/sync/serialize.ts:356-365`.)

**A política que cobra isso**, com uma capacidade por tipo de movimento
(`supabase/migrations/0008:26-41`, que derruba e recria a de
`supabase/migrations/0001:312-328`):

```sql
create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'purchase'    then private.has_capability(company_id, 'check_receipt')
      when 'production'  then private.has_capability(company_id, 'record_production')
      when 'consumption' then private.has_capability(company_id, 'record_production')
      when 'transfer'    then private.has_capability(company_id, 'dispatch')
      when 'sale'        then private.has_capability(company_id, 'dispatch')
      when 'loss'        then private.has_capability(company_id, 'record_loss')
      when 'return'      then private.has_capability(company_id, 'check_receipt')
      when 'discrepancy' then private.has_capability(company_id, 'check_receipt')
      when 'adjustment'  then private.has_capability(company_id, 'adjust_stock')
      when 'reversal'    then private.has_capability(company_id, 'adjust_stock')
    end
  );
```

O `case` **sem `else`** é deliberado: um tipo não listado avalia para NULL e a
escrita é recusada. "Um movimento que ninguém pensou não deve poder ser escrito"
(`supabase/migrations/0008:8-14`).

E a restrição que quase impediu a conferência de existir, na forma atual
(`supabase/migrations/0017:21-26`):

```sql
alter table movements add constraint movement_moved_something
  check (
    quantity_base_units <> 0
    or kind = 'adjustment'
    or (kind = 'discrepancy' and post is not null)
  );
```

---

### 14.6 O que deliberadamente não atravessa

#### 14.6.1 Os derivados: `item_costs` e `item_cost_history`

`serialize` devolve `{ kind: 'derived', table }` para as duas
(`src/sync/serialize.ts:386-388`). O docblock é a lição inteira, e ela é
numérica:

> `item_costs` é valor derivado, e valor derivado tem exatamente um dono. O
> aparelho calcula uma média local porque precisa mostrar custo sem sinal; o
> servidor calcula a dele a partir das linhas de nota, pela mesma regra, num
> gatilho. Mandar a cópia do aparelho dá dois autores ao número, e **a
> reprodução provou o que isso custa: a fila carrega *ids* de linha, então
> reenvia o que a linha diz agora, e o gatilho do servidor misturou uma nota
> nova contra uma média que só existia depois dela — chegando a 0,5605 onde o
> aparelho dizia 0,5310.**

(`src/sync/serialize.ts:44-58`.) Então a média local fica local. O que viaja é a
nota; a média é o que os dois lados concluem dela, e a checagem 6 os faz
concordar.

Estado hoje: **`item_costs` não é enfileirado por nada** — não está em
`QUEUED_TABLES` (`src/data/outbox.ts:156-173`) e nenhum `enqueue` o nomeia. O
ramo `derived` de `serialize` é, portanto, defensivo: exercitado por
`src/sync/serialize.test.ts:122-129`, e **nunca alcançado** pela sessão real (a
saída de `scripts/device-session.ts` não contém nenhuma linha
`-- item_costs não viaja`).

#### 14.6.2 O comando `erase`

```ts
if (entry.table === 'erase') {
  const area = entry.payload?.area;
  return { kind: 'erase', area: typeof area === 'string' ? area : entry.rowId };
}
```

(`src/sync/serialize.ts:390-393`.) As áreas possíveis são
`'purchases' | 'recipes' | 'products' | 'inputs' | 'all'`
(`src/data/erase.ts:20`). O enfileiramento é
`{ table: 'erase', rowId: area, op: 'delete', payload: { area } }`
(`src/data/repository.ts:3507`), e o comentário ali diz por que a área é a
unidade e não a linha: "apagar é uma decisão só, e reproduzir linha por linha
descreveria algo que a pessoa nunca fez" (`src/data/repository.ts:3505-3506`).

`scripts/device-session.ts:257-259` imprime, para essa entrada,
`-- erase <área>: comando, não linha; o servidor ainda não o recebe`.

**Lado servidor: NÃO IMPLEMENTADO**, e é decisão pendente do dono, registrada:
construir isso exige decidir o que "apagar" significa num servidor
multiempresa — destruir o histórico daquela empresa, ou só marcar que aquele
aparelho não quer mais o dado; a primeira é irreversível e o livro-razão recusa
DELETE por desenho (`docs/insights.md:565-571`).

#### 14.6.3 O registro de colunas que ficam no aparelho

Está em `src/sync/columns.test.ts:26-53`, transcrito integralmente:

| Tabela | Coluna | Motivo escrito |
|---|---|---|
| `items` | *(nenhuma hoje)* | "a lista existe para o dia em que houver" |
| `movements` | `recorded_by` | `'o servidor estampa a partir da sessão; vindo do aparelho seria cedível'` |
| `readings` | `recorded_by` | `'o servidor estampa a partir da sessão; vindo do aparelho seria cedível'` |
| `purchases` | `created_by` | `'o servidor estampa a partir da sessão'` |
| `purchase_lines` | `created_at` | `'o servidor não tem a coluna; a hora que interessa é a da nota'` |
| `orders` | `recorded_by` | `'o servidor estampa a partir da sessão'` |

Note que nenhuma dessas colunas de `recorded_by` existe hoje no aparelho: a de
`movements` foi criada pela V4 (`src/data/db.ts:303`) e derrubada pela V5
(`src/data/db.ts:323`), a de `readings` nunca existiu (a criação da tabela na V15
não a tem, `src/data/db.ts:603-614`), e `orders` no aparelho não a tem
(`src/data/db.ts:458-468`). O registro cobre os três casos com a mesma frase, sem
distinguir "existiu e saiu" de "nunca existiu" — e o `PRAGMA table_info` só
enxerga o que existe, então uma entrada obsoleta aqui **não** reprova. Isso é a
diferença de `src/sync/agreement.test.ts:394-396`, que exige que a lista dele
apodreça alto.

---

### 14.7 A ordem de envio, e as dependências que ela protege

Não existe topologia calculada em lugar nenhum. **A ordem de envio é a ordem de
escrita**, e ela é suficiente porque cada ato do repositório enfileira pai antes
de filho na mesma transação. As dependências que isso protege, todas escritas
como comentário no serializador ou no repositório:

| Dependência | Onde a ordem é garantida | Cita |
|---|---|---|
| `locations` antes do `movements` que se apoia nele | `ensureLocation` enfileira o lugar padrão no primeiro movimento de qualquer aparelho | `src/data/repository.ts:859-862` |
| `items` antes de `purchases`/`purchase_lines` | ordem do `saveItem` contra `recordPurchase` | provado em `src/sync/sync.test.ts:160` |
| `recipes` antes de `recipe_versions` antes de `recipe_lines` | um único `enqueue` com os três na ordem | `src/data/repository.ts:1214-1218`; provado em `src/sync/sync.test.ts:161` |
| `product_lines` antes de `product_types` antes de `products` | ordem de cadastro do dono | `src/sync/serialize.ts:217-219`; exercitado em `scripts/device-session.ts:113-138` |
| `lots` antes do `movements` que o cita | `recordProduction` grava o lote antes das linhas | `src/data/repository.ts:1521` antes de `:1553`; `src/sync/serialize.ts:255-259` |
| `recipe_versions` antes do `lots` que a cita | a versão é gravada quando a ficha é salva, muito antes da corrida | `src/sync/serialize.ts:261-263` |
| `orders` antes de `order_lines` | um pedido atravessa antes das linhas dele | `src/sync/serialize.ts:295-296` |

Provado de ponta a ponta em `src/sync/sync.test.ts:149-162`: com
`ensureStarterData` semeado e um servidor que aceita tudo,
`order.indexOf('items') < order.indexOf('purchases')` e
`order.indexOf('recipes') < order.indexOf('recipe_versions')`.

E a ordem exata que a semente produz, afirmada linha por linha em
`src/sync/sync.test.ts:92-116`:

```
items, locations, purchases, purchase_lines, movements,
recipes, recipe_versions, recipe_lines
```

com `item_costs` **deliberadamente ausente** da lista e o motivo escrito ali
(`src/sync/sync.test.ts:107-111`).

---

### 14.8 O reenvio idempotente: `on conflict (id) do update`

#### 14.8.1 Onde o SQL é construído

**Não é no serializador nem no motor.** `serialize` devolve
`{ kind, table, row }`; quem transforma isso em `INSERT` é
`scripts/device-session.ts:287-319`. Como não existe `Transport` de produção
(14.1), **este script é hoje a única definição executável de como a fila fala com
o Postgres**.

```ts
const keys = Object.keys(write.row);
const conflict = ['id'];
const settled = keys.filter((k) => !conflict.includes(k));

const appendOnly = write.table === 'movements' || write.table === 'readings';

const onConflict = appendOnly
  ? 'do nothing'
  : `do update set ${settled.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;

const columns = keys.map(ident).join(', ');
out.push(
  `insert into ${ident(write.table)} (${columns}) select ${columns} from ` +
    `jsonb_populate_record(null::${write.table}, $sync$${json}$sync$::jsonb) ` +
    `on conflict (${conflict.join(', ')}) ${onConflict};`,
);
```

(`scripts/device-session.ts:287-319`.) A chave de conflito é **sempre e só `id`**.

O comentário que decide a diferença entre as duas famílias
(`scripts/device-session.ts:279-286`):

> Como um repetido é tratado não é detalhe — é o contrato. A fila reproduz a mesma
> linha muitas vezes: `item_costs` é reescrito por toda nota, então o servidor tem
> que pegar o mais novo e sobrescrever. O livro-razão é o oposto exato:
> `movements` é append-only e o banco recusa um UPDATE de vez, então um movimento
> que chega duas vezes tem que ser um nada. Foi para isso que o id compartilhado
> entre uma linha de nota e o movimento dela sempre serviu.

E a razão de `readings` entrar na mesma família (`scripts/device-session.ts:291-294`):

> Leitura de sensor é da mesma família do livro-razão: a temperatura de ontem às
> três da manhã não se corrige, se mede de novo. Uma série que aceita UPDATE deixa
> de ser prova de nada — e o servidor recusa a coluna sem UPDATE dizendo apenas
> "permission denied", sem contar qual privilégio falta.

#### 14.8.2 Por que as colunas são nomeadas em vez de `select *`

O comentário é uma decisão de forma que vale transcrever inteira
(`scripts/device-session.ts:301-310`):

> `select *` de `jsonb_populate_record` entrega ao insert **toda** coluna que a
> tabela tem, com NULL onde o JSON ficou calado — o que silenciosamente derrota os
> próprios padrões do servidor e transforma `freight_cents not null default 0`
> numa escrita recusada. Um cliente de verdade manda os campos que tem e deixa o
> servidor preencher o resto, e é isso que este script faz. Também faz um campo
> que a tabela não tem falhar na lista de colunas, alto, que é o ponto inteiro de
> rodar isto. Todo nome aqui vem da própria lista fechada do `serialize`, nunca de
> fora, e `ident` impõe isso em vez de afirmar.

`ident` (`scripts/device-session.ts:59-64`):

```ts
function ident(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`refusing to build SQL around an identifier like "${name}"`);
  }
  return name;
}
```

O motivo escrito: nome de tabela e de coluna não podem ser parâmetro ligado, "e
prosa não é defesa: um comentário dizendo 'estes vêm de uma lista fechada' fica
na página depois de alguém alargar a lista. Isto faz o mesmo argumento como
checagem" (`scripts/device-session.ts:49-58`).

A tag de citação é `$sync$`, e há uma guarda contra colisão: se o JSON contiver
`$sync$`, o script lança `a value collided with the quoting tag`
(`scripts/device-session.ts:276-277`).

#### 14.8.3 A família das cinco migrações

O padrão sempre tem a mesma consequência: **a tabela tem política de INSERT e o
reenvio precisa de UPDATE; sem ela o Postgres recusa a linha inteira mesmo
idêntica, e `src/sync/engine.ts` para a fila no primeiro buraco de propósito —
então tudo o que a fábrica gravar depois daquela linha fica preso atrás dela,
sem nada na tela dizendo o quê.**

| # | Migração | Tabela(s) | Forma do defeito | O que foi criado |
|---|---|---|---|---|
| 1 | `0015_the_phone_will_send_it_twice.sql` | `purchases`, `purchase_lines` | **Ausência de política de UPDATE.** As duas tinham leitura e insert e mais nada; todas as outras tabelas que a fila escreve tinham um `_manage FOR ALL`, que cobre update, e estas ficaram de fora quando foram escritas | `purchases_update` e `purchase_lines_update`, `for update using/with check (private.has_capability(company_id, 'view_finance'))` (`supabase/migrations/0015:29-35`) |
| 2 | `0020_a_lot_and_the_day_it_dies.sql` | `lots` | **Ausência de política de UPDATE**, e ela estava esperando desde o dia em que a tabela foi criada, porque nada escrevia lote até a Fase 2. "Peça sem escritor não é peça pronta: é peça não exercitada" | `lots_resend`, `for update` com `record_production` nos dois lados (`supabase/migrations/0020:40-42`) |
| 3 | `0027_a_resend_is_not_a_decision.sql` | `orders` | **Política de UPDATE com a capacidade ERRADA.** `orders_place` deixa entrar quem tem `place_order`; `orders_decide` só deixa mexer quem tem `approve_order`, `dispatch` ou `manage_company`. Três dos sete papéis — `storeManager`, `customer`, `salesperson` — têm o primeiro e nenhum dos três. Por isso a busca por "tabela sem update" não a encontrou | `orders_resend` com `place_order` **e** `recorded_by = auth.uid()` nos dois lados, mais o gatilho `orders_decision_fields_stay_put` (`supabase/migrations/0027:42-95`) |
| 4 | `0030_the_default_room_is_bookkeeping_not_a_privilege.sql` | `locations` (só o lugar padrão) | **A linha de escrituração do próprio sistema exigindo `manage_company`.** `ensureLocation` cria o lugar padrão no primeiro movimento de qualquer aparelho com `id = company_id`, nome vazio, `kind = 'store_room'`, e a `locations_manage` exige `manage_company`, que só o dono tem. A operadora da câmara fria faz a primeira produção do dia sem sinal e o Postgres recusa a linha | `locations_default_room` (insert) e `locations_default_room_resend` (update), ambas exigindo `id = company_id` **e** uma de `record_production`, `adjust_stock`, `record_loss`, `dispatch`, `check_receipt` (`supabase/migrations/0030:31-65`) |
| 5 | `0031_a_reading_can_be_sent_twice.sql` | `readings` | **Ausência de política de UPDATE**, e a primeira aparição *encontrada procurando a família* em vez de esbarrando nela. `readings` nasceu na 0024 com `readings_read` e `readings_write` e mais nada. É a pior das cinco: a leitura é a escrita com maior chance de subir duas vezes em todo o aplicativo, porque é anotada dentro da câmara, a −18 °C, onde o sinal não chega | `readings_resend` com `adjust_stock` **e** `recorded_by = auth.uid()`, mais o gatilho `a_reading_resent_stays_the_same` (`supabase/migrations/0031:32-73`) |

O conserto estreito da 0030 merece a nota que ela mesma escreve: **não é permissão
nova.** `id = company_id` não é um lugar que alguém escolheu — é o único id que a
empresa pode ter, e `ensureLocation` é a única coisa que o escreve. Cadastrar um
lugar de verdade continua sendo de quem administra, pela `locations_manage` que
fica exatamente como está (`supabase/migrations/0030:21-29`).

E o motivo de ser `insert, update` e não `for all`: a fila sobe com
`on conflict do update`, então o reenvio precisa do update — mas **apagar lugar
continua sendo de quem administra** (`supabase/migrations/0030:27-29`).

#### 14.8.4 Por que UPDATE e não `do nothing` fora do livro-razão

`supabase/migrations/0015:21-23`: "uma nota corrigida no aparelho precisa
alcançar o servidor. Com DO NOTHING a correção seria descartada em silêncio, e
silêncio é a única coisa pior que a recusa."

E por que isso não afrouxa o livro-razão (`supabase/migrations/0015:25-28`):
"`movements` sobe com DO NOTHING e continua sem política de UPDATE. Um movimento
que chega duas vezes não faz nada na segunda; um movimento errado se estorna,
nunca se edita. A nota é documento, o movimento é fato — e só o fato é
imutável."

A imutabilidade do razão é gatilho, não política (`supabase/migrations/0001:233-247`):

```sql
create or replace function reject_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception
    'The ledger is append-only. Correct a movement by inserting a reversal, '
    'which keeps the original visible and the history honest.';
end;
$$;

create trigger movements_are_immutable
  before update or delete on movements
  for each row execute function reject_ledger_mutation();
```

#### 14.8.5 Duas formas que RLS não consegue, e o gatilho consegue

"Uma política de RLS não consegue dizer 'contanto que não mude': a expressão não
enxerga o antes e o depois ao mesmo tempo. Quem sabe as duas coisas é o gatilho"
(`supabase/migrations/0027:54-56` e `supabase/migrations/0031:44-46`).

**Pedido — `private.a_resend_decides_nothing()`**, na versão final da 0032
(`supabase/migrations/0032:26-48`):

```sql
begin
  -- Quem anotou é fato do passado: congela para TODOS, antes de qualquer
  -- pergunta sobre capacidade.
  new.recorded_by := old.recorded_by;

  if not (
    private.has_capability(new.company_id, 'approve_order')
    or private.has_capability(new.company_id, 'dispatch')
    or private.has_capability(new.company_id, 'manage_company')
  ) then
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
```

**O nome do gatilho é load-bearing**, e a 0027 escreve por quê
(`supabase/migrations/0027:84-92`): o Postgres roda os gatilhos `before` da mesma
tabela em **ordem alfabética de nome**. `orders_decision_fields_stay_put` precisa
vir antes de `orders_leave_pending_only_by_approval` — 'd' antes de 'l' — porque
se aquele rodar primeiro ele vê um status novo diferente do velho, levanta
exceção, e a fila trava, que é exatamente o que se está consertando. Renomear
qualquer um dos dois sem conferir isto devolve o defeito sem nenhum teste ficar
vermelho por outro motivo.

E devolver em vez de recusar **é escolha**: recusar deixaria a fila travada outra
vez. "O aparelho de quem não decide não tem tela para decidir — ele não está
tentando aprovar, está reenviando o que já mandou"
(`supabase/migrations/0027:61-64`).

**Leitura — `private.a_resend_reads_nothing_new()`**
(`supabase/migrations/0031:52-73`) congela **oito** campos:

```sql
new.kind        := old.kind;
new.value       := old.value;
new.unit        := old.unit;
new.taken_at    := old.taken_at;
new.location_id := old.location_id;
new.device_id   := old.device_id;
new.source      := old.source;
new.recorded_by := old.recorded_by;
```

"O que fica congelado é O QUE FOI VISTO, inteiro. Reenviar é dizer de novo a
mesma coisa; qualquer diferença ali é outra leitura, e outra leitura é outra
linha — o livro de leituras é append-only pela mesma razão que o de movimentos"
(`supabase/migrations/0031:48-51`).

#### 14.8.6 A tensão entre a 0031 e o SQL que o aparelho emite

Fato documentado, sem interpretação: `supabase/migrations/0031:10` afirma "a fila
do aparelho sobe com `on conflict (id) do update`, **sempre**". Isso **não é
verdade para `readings`** no código atual: `scripts/device-session.ts:295` marca
`readings` como `appendOnly` junto com `movements`, e a saída real do script
contém `insert into readings (...) on conflict (id) do nothing`.

Consequências verificáveis:

- A política `readings_resend` (0031) **não é exercitada pela fila real** da
  checagem 6 — na checagem 6 o `grant` para `readings` é só `insert`
  (`scripts/verify-migrations.sh:455-458`), coerente com o `do nothing`.
- Ela é exercitada pela checagem 12, que escreve o SQL à mão com
  `on conflict (id) do update` depois de fazer
  `grant insert, update on readings to app_user`
  (`scripts/verify-migrations.sh:812-847`).
- Sob `do nothing`, uma leitura corrigida no aparelho nunca alcançaria o
  servidor — o que é o mesmo efeito prático do gatilho da 0031, que congela tudo.

O `git log` dá a cronologia: `appendOnly` para `readings` entrou no commit
`ce6f8fc` ("A leitura de sensor entra como fato"), junto com a 0024; a 0031 e a
checagem 12 entraram depois, em `f684e6b`.

---

### 14.9 `src/sync/columns.test.ts` — como prova que as colunas não divergiram

**O que ele cobra, e o andar em que ele cobra.** "O guard da sessão do aparelho
cobra TABELA sem escritor. Este cobra COLUNA sem travessia, que é um andar abaixo
e foi o andar onde o defeito estava" (`src/sync/columns.test.ts:16-17`).

A cicatriz que o criou: `items.full_level` — a régua das faixas de cor que o dono
digita — ficou fora do serializador. A coluna existia no aparelho, a tela escrevia
nela, o teste do repositório provava que ela persistia, e ela simplesmente nunca
chegaria ao servidor. Um celular novo da mesma fábrica abriria sem faixa nenhuma,
e ninguém saberia por quê (`src/sync/columns.test.ts:11-14`).

**Como ele monta a comparação:**

1. Abre um SQLite em memória via `node:sqlite` (`DatabaseSync(':memory:')`),
   roda `migrate(conn)` — as migrações reais do aparelho — e injeta a conexão com
   `__setDb` (`src/sync/columns.test.ts:57-87`).
2. Itera as entradas de `CROSSINGS_FOR_TESTS_ONLY()` — o mapa real do
   serializador, exposto por uma função só para teste
   (`src/sync/serialize.ts:122`).
3. Para cada tabela, lê `PRAGMA table_info(<tabela>)` **do banco de verdade**, não
   de uma lista escrita à mão (`src/sync/columns.test.ts:95`). Se o
   `PRAGMA` volta vazio, a tabela não é do aparelho e a entrada é pulada — é assim
   que comandos e derivados ficam de fora (`src/sync/columns.test.ts:96`).
4. Monta o conjunto **enviadas** = `crossing.take` mais **as chaves que o `build`
   produz**, obtidas **chamando o `build`** com linha vazia e ator falso:
   `crossing.build?.({}, { userId: 'x' })` (`src/sync/columns.test.ts:102-104`).
   A razão escrita: "o jeito honesto de saber QUAIS é chamá-lo; uma lista escrita
   à mão ao lado dele seria a mesma lista à mão que já deixou uma pasta fora da
   checagem de camadas".
5. Toda coluna do aparelho que não está em **enviadas** e não está declarada em
   `SO_DO_APARELHO` entra em `faltando`, e a asserção é
   `assert.deepEqual(faltando, [])`.

**A mensagem de falha é instrução, não lamento**
(`src/sync/columns.test.ts:118-121`):

> estas colunas não atravessam e não estão declaradas como só do aparelho: … Ou
> acrescente a coluna ao `take`/`build` do serializador, ou escreva em
> SO_DO_APARELHO por que ela fica aqui. O defeito que este caso existe para pegar
> é silencioso: a tela escreve, o teste do repositório passa, e o dado nunca chega
> ao servidor.

**Por que registro e não heurística** (`src/sync/columns.test.ts:19-22`): existem
colunas que legitimamente não sobem, e a diferença entre "não sobe porque é do
aparelho" e "não sobe porque alguém esqueceu" não está no nome dela — está numa
decisão, que aqui fica escrita.

**O que ele NÃO cobre**, e é preciso saber ao reconstruir: ele itera as chaves de
`CROSSINGS`, então uma tabela do aparelho que o serializador não conhece
(`production_runs`, `item_costs`, `item_cost_history`, `app_meta`, `outbox`) não é
visitada. Esse lado é coberto por outros dois guards: o de tabela órfã em
`src/data/outbox.test.ts:34-54` e o de "tabela enfileirada sem travessia" em
`src/sync/agreement.test.ts:399-436`.

---

### 14.10 `src/sync/agreement.test.ts` — os dois esquemas lidos um contra o outro

O que ele é e o que não é (`src/sync/agreement.test.ts:9-29`): a `db:verify`
prova isto de ponta a ponta e é a prova honesta, mas precisa de um banco e de
meio minuto, então roda uma vez no fim em vez de enquanto alguém digita — e **o
portão de mutação não a alcança**. Este arquivo confere o mesmo contrato em
milissegundos, parseando as migrações de que o servidor é construído. "Não
consegue provar comportamento. Consegue provar **acordo**, que é onde morava cada
uma das incompatibilidades de hoje: uma coluna que existe de um lado só, um valor
de enum escrito `storeroom` contra o `store_room` do servidor, um `kind` que o
aparelho escreve e o servidor nunca ouviu falar."

E a honestidade sobre a ferramenta: ler SQL com expressão regular é grosseiro e
seria errado para entrada arbitrária. "Estas são as migrações deste repositório,
append-only e escritas à mão, e o parse **afirma que achou algo** antes de
confiar em si mesmo — um parser que casasse nada em silêncio transformaria este
arquivo inteiro num teste que sempre passa."

#### 14.10.1 O parser

`serverSql()` (`src/sync/agreement.test.ts:34-40`) lê todos os `.sql` de
`supabase/migrations`, ordenados por nome, e junta com `\n`. Antes disso:
`assert.ok(files.length >= 8, 'the migrations went missing, and this file would pass anyway')`.

`serverColumns(sql)` (`src/sync/agreement.test.ts:49-90`) devolve
`Map<tabela, Map<coluna, { notNull, hasDefault }>>`, aplicando **creates, depois
adds, depois drops** — "porque uma coluna removida num passo posterior não está
mais lá, e a 0009 remove uma que este aparelho enviava".

- `notNull` = `/\bnot null\b/i` na linha.
- `hasDefault` = `/\bdefault\b/i` **ou** `/\bprimary key\b/i` — "uma chave
  primária com id gerado também não precisa de nada do aparelho".
- Creates: `/create table (\w+) \(([\s\S]*?)\n\);/g`, pulando linha vazia,
  comentário e linhas que começam com `constraint|check|unique|primary|foreign`.
- Alters: **statement por statement**, partindo o SQL em `;`, com
  `/add column (?:if not exists )?(\w+)([^,]*)/g` e
  `/drop column (?:if exists )?(\w+)/g`. A razão está escrita: "um ALTER embrulha
  por várias linhas e carrega um `if not exists` opcional — a primeira versão
  deste parser leu esse `if` como nome de coluna e reportou `items.base_unit`
  ausente quando o servidor a tem desde a 0003. Um parser errado nesta direção é
  alto; errado na outra transforma o arquivo num teste que sempre passa"
  (`src/sync/agreement.test.ts:71-76`).

`enumValues(sql, name)` (`src/sync/agreement.test.ts:93-103`) casa
`create type <name> as enum (...)`, afirma que achou, extrai `'([\w]+)'`, e
**soma os `alter type <name> add value ... '<valor>'`** — é assim que `purchase`
entra em `movement_kind`.

#### 14.10.2 Os doze testes, um por um

| Teste (linha) | O que afirma | Canários / detalhes |
|---|---|---|
| `every column this device sends exists on the server` (`:111`) | Para cada tabela de `sendableTables`, `serialize(entry(table), {}, ACTOR)` produz **toda chave** que a travessia manda, e cada uma tem que existir no `Map` do servidor | Três canários do próprio parser: `items.name` (coluna de create simples), `items.base_unit` (coluna acrescentada por ALTER com `if not exists`), e `!movements.unit_cost_cents` (coluna derrubada). "Erre qualquer um destes e o teste abaixo está medindo o parser, não o esquema" (`:114-121`). Mais `assert.ok(tables.size >= 10)` |
| `every movement kind the device writes is a kind the server knows` (`:146`) | Lê `repository.ts` com `/INSERT INTO movements[\s\S]*?VALUES \(\?, \?, '(\w+)'/g` e exige que cada `kind` esteja no enum `movement_kind` | Lido do repositório em vez de listado no teste, "para que um kind acrescentado amanhã seja conferido sem ninguém lembrar de atualizar este teste". `assert.ok(written.length >= 2)`. **Limitação medida:** o regex só casa `kind` como literal na terceira posição do `VALUES`, e o repositório o passa como literal em cinco lugares — `purchase` (`:406`), `adjustment` (`:949`), `loss` (`:2137`), `discrepancy` (`:2496`), `reversal` (`:4484`). Em `recordProduction` (`:1536`) e em `recordTransfer`/`recordReturn` (`:1717`) o `kind` é **parâmetro ligado**, então `production`, `consumption`, `transfer` e `return` **não são conferidos por este teste** |
| `a check that matched is a row the server would accept` (`:167`) | A **última** definição de `movement_moved_something` (a 0017 derruba e recria) contém `kind = 'discrepancy' and post is not null`; e o repositório escreve exatamente esse par, casando `/VALUES \(\?, \?, 'discrepancy'[^)]*'checked'/` | "A regra que quase impediu a conferência de existir: o servidor recusa linha que não move nada. 'Conferi e bateu' é diferença zero — e é a conferência que mais vale, porque é a prova de que alguém abriu a caixa" (`:170-172`) |
| `the words the device has for a loss are words the server accepts` (`:193`) | Lê `export type LossReason = …` de `src/domain/ledger.ts`, extrai os literais, e exige que cada um esteja no enum `loss_reason` | **A incompatibilidade pela qual este arquivo foi escrito, e que escapou de todo jeito porque ninguém checou ESTE enum:** o aparelho dizia `internalUse` e o enum do servidor diz `internal_use`. Nenhuma perda tinha sido escrita ainda, então foi de graça consertar — a primeira teria sido aceita pelo SQLite, enfileirada, e recusada pelo Postgres sem ninguém olhando (`:205-210`). `assert.ok(device.length >= 4)` |
| `the location this device creates is a kind the server knows` (`:219`) | Lê `/INSERT INTO locations[\s\S]*?VALUES \(\?, \?, '', '(\w+)'/g` e exige `location_kind` | **O defeito exato que a reprodução pegou: `storeroom` contra o `store_room` do servidor. A fila para num buraco de chave estrangeira, então aquela única linha teria bloqueado toda escrita atrás dela** (`:231-234`) |
| `the device schema does not carry a column the server dropped` (`:238`) | `!item_costs.on_hand_base_units` no servidor **e** `db.ts` contém `ALTER TABLE item_costs DROP COLUMN on_hand_base_units` | "A 0009 removeu pelo mesmo motivo que a V3 removeu aqui: um total de estoque armazenado é uma segunda resposta a uma pergunta que o razão já responde. Nenhum dos dois lados pode fazê-la crescer de volta em silêncio" |
| `the capability vocabulary is the same word list on both sides` (`:253`) | `[...capabilities].sort()` de `src/domain/access.ts` é **deepEqual** ao enum `capability` ordenado | Doze palavras nos dois lados: `view_cost`, `view_sale_price`, `record_production`, `dispatch`, `check_receipt`, `record_loss`, `place_order`, `approve_order`, `adjust_stock`, `view_finance`, `issue_invoice`, `manage_company` (`src/domain/access.ts:26-39` e `supabase/migrations/0001:42-55`). "Uma capacidade que o código conhece e o servidor não é política que nunca casa em silêncio; uma que o servidor conhece e o código não é porta que ninguém deste lado consegue abrir" |
| `nothing the server insists on is left for the device to forget` (`:268`) | A direção inversa: para cada tabela enviável, toda coluna do servidor `notNull && !hasDefault` tem que estar no payload | "A que a reprodução achou do jeito difícil: `purchases.freight_cents` é `not null default 0`, e um insert que nomeia suas colunas deixa o default fazer o trabalho — enquanto um que manda toda coluna com NULL nas caladas o derrota e é recusado" (`:270-277`) |
| `the parser can tell a required column from a defaulted one` (`:302`) | Quatro canários: `movements.recorded_by` é `notNull=true, hasDefault=false`; `purchases.freight_cents` é `hasDefault=true`; `movements.note` é `notNull=false` | "Sem estes, o teste acima está medindo o parser: uma regra que lesse tudo como 'tem default' reportaria nada faltando para sempre" |
| `the movement type names only columns the ledger actually has` (`:328`) | Extrai os campos de `export type Movement = {` em `src/domain/ledger.ts`, converte camelCase para snake_case, e exige que cada um seja coluna real de `movements` | Existe porque a deriva sobreviveu dias em plena vista: a 0008 derrubou `unit_cost_cents` e acrescentou `unit_cost_rate`, o aparelho seguiu, e `ledger.ts` continuou declarando `unitCostCents?: Cents` — a inversão exata da regra de capa deste projeto, dentro do tipo que define o que um movimento É. "Nada pegou, e a razão é o achado: nenhuma linha de código de produção importa aquele módulo, então nenhum teste o exercitou e nenhum erro de compilação podia surgir. Um tipo que ninguém usa não é inofensivo — é uma mentira esperando o primeiro chamador" (`:314-327`). `assert.ok(fields.length > 8)` |
| `what the device does not keep is a list somebody wrote, not a surprise` (`:361`) | A direção oposta: campos do tipo `Movement` que **não** existem no aparelho têm que estar numa lista escrita — hoje só `recorded_by` — **e a lista tem que apodrecer alto**: um item que reivindica uma lacuna já fechada reprova | Lê o `CREATE TABLE` **e** os `ALTER TABLE movements ADD/DROP COLUMN` de `db.ts`, porque ler só o create foi o ponto cego deste próprio teste, e ele se anunciou na primeira migração que acrescentou coluna: o teste reportou uma lacuna que tinha acabado de ser fechada (`:366-373`) |
| `every table the device queues is a table something knows how to send` (`:399`) | Lê todo `table: '<nome>'` de `repository.ts` e exige que cada um esteja em `sendableTables` **ou** seja um comando que `serialize` trata | A exceção de comando é descoberta lendo `serialize.ts` com `/entry\.table === '([a-z_]+)'/g`, "porque é exatamente isso que o serializador faz — se um dia ele parar de tratar comando, este teste tem que voltar a acusar" (`:420-426`). Aconteceu de novo com `product_lines`, `product_types` e `flavors`: três tabelas novas, três `enqueue`, nenhuma travessia. Mensagem: `o repositório enfileira <…> e nada sabe enviar — a fila trava na primeira` |

O comentário do último teste é a explicação canônica do custo
(`src/sync/agreement.test.ts:400-406`): uma tabela que o repositório enfileira e
ninguém sabe enviar **não é erro de compilação nem teste vermelho: é
`UnknownTableError` no meio da fila**, e a fila é enviada em ordem. A linha
recusada nunca sai da frente, e TUDO que foi escrito depois dela fica preso
atrás — inclusive movimento.

---

### 14.11 `src/sync/serialize.test.ts` — as mesmas regras na velocidade de teste unitário

Motivo declarado (`src/sync/serialize.test.ts:6-13`): "a `db:verify` reproduz uma
sessão inteira contra um servidor de verdade e é o fim honesto disto — mas leva
meio minuto e roda um banco. Estas são as mesmas regras na velocidade de um teste
unitário, para o erro ser pego enquanto está sendo digitado."

Ator: `{ userId: '00000000-0000-4000-8000-000000000009' }`
(`src/sync/serialize.test.ts:15`). Fábrica de entrada:
`{ id: 'q1', table, rowId, op: 'upsert', payload: {}, queuedAt: '2026-09-01T10:00:00Z' }`
(`src/sync/serialize.test.ts:17-19`).

| Teste (linha) | Afirma |
|---|---|
| `SQLite has no boolean…` (`:21`) | `active: 1` → `true`; `active: 0` → `false`. "Enviado como 1, o Postgres recusa o insert de vez — ele não converte" |
| `the packaging travels as a structure…` (`:34`) | `'[{"id":"unit","perBaseUnit":1},{"id":"box","perBaseUnit":50}]'` → array com dois objetos. "A falha que isto evita ainda parece um sucesso" |
| `a column the server does not have stays behind` (`:51`) | `!('created_at' in write.row)` para `purchase_lines`, e `purchase_id` intacto |
| `who wrote it and who was holding it are two answers` (`:65`) | `recorded_by === ACTOR.userId` **e** `operator_id === 'the-one-holding-the-phone'`. "Uma coluna respondendo as duas foi o erro que isto substituiu. Separadas, o celular compartilhado deixa de ser problema de autenticação e vira uma pergunta a mais na tela, para a empresa que quiser fazê-la" |
| `a company that names nobody still records the movement` (`:86`) | `operator_id === null` — **nulo explícito, não coluna ausente** — e `recorded_by` estampado. Nomear é `companies.names_who_recorded`, desligado por padrão |
| `who did it is stamped on the way out…` (`:98`) | `movements.recorded_by` e `purchases.created_by`, os dois do ator |
| `the order somebody put the ingredients in goes with them` (`:109`) | `recipe_lines.position === 2` |
| `a derived number does not travel, and says so instead of being dropped` (`:122`) | `serialize(queued('item_costs','i1'), …).kind === 'derived'` e `item_costs` fora de `sendableTables`. "Não silêncio: silêncio é como uma escrita que nunca chega fica exatamente igual a uma que chegou" |
| `a table nobody taught this file about is a refusal, never a skip` (`:131`) | `UnknownTableError` com `table === 'production_runs'`. O exemplo mudou porque **virou verdade**: `lots` era a tabela desconhecida deste teste até a Fase 2 ensinar o serializador a mandá-la. `production_runs` é exemplo melhor porque nunca vai ser conhecida — corrida aberta é ESTADO do aparelho, não lançamento: o servidor não tem onde guardá-la e não deve ter (`:132-136`) |
| `a queued row that has gone missing is loud` (`:143`) | `serialize(queued('items'), null, ACTOR)` lança `/gone from the device/` |
| `the erase command carries its area, not a row` (`:147`) | Uma entrada `{ table: 'erase', rowId: 'all', op: 'delete', payload: { area: 'all' } }` vira exatamente `{ kind: 'erase', area: 'all' }` |

---

### 14.12 `src/sync/sync.test.ts` — a fila e o motor contra banco real e servidor falso

Motivo (`src/sync/sync.test.ts:11-18`): "as falhas que valem pegar aqui são as
caladas: uma escrita que nunca foi enfileirada e por isso nunca sincroniza, e uma
entrada marcada como enviada que o servidor nunca guardou de verdade. Nenhuma das
duas aparece como erro — as duas aparecem meses depois como um número que não
bate."

O banco é SQLite real em memória com `migrate` de verdade
(`src/sync/sync.test.ts:20-50`); a empresa é `LOCAL_COMPANY_ID`. Os transportes
falsos: `acceptingServer()` aceita tudo e guarda os lotes recebidos
(`:53-62`), `half` aceita a primeira metade de cada lote (`:168-172`), `broken`
lança `new Error('sem rede')` (`:188-192`).

| Teste (linha) | Afirma |
|---|---|
| `every write queues itself, and nothing writes without queueing` (`:64`) | A lista de tabelas enfileiradas, na ordem exata, para item + compra + versão de receita: `items, locations, purchases, purchase_lines, movements, recipes, recipe_versions, recipe_lines`; todas `op === 'upsert'`; `queued[0].rowId === sugar`. Os comentários dizem por que cada uma está lá: o lugar entra **antes** do movimento que se apoia nele; a **linha** de compra, não só o cabeçalho, porque o gatilho de custeio do servidor dispara no insert de `purchase_lines`; o movimento entra ao lado da nota em vez de ser recalculado no servidor; e `item_costs` está deliberadamente ausente |
| `a failed write leaves nothing behind, in the data or in the queue` (`:121`) | Depois de uma versão de receita que estoura FK no meio, `pendingCount() === 0` |
| `erasing queues the decision, so the server does not send it all back` (`:137`) | Uma entrada só, com `op === 'delete'` e `rowId === 'products'` |
| `the queue goes up in the order it was written` (`:149`) | `remaining === 0`, `sent > 0`, itens antes de compras, receitas antes de versões |
| `only what the server confirmed is marked sent` (`:164`) | Com aceitação pela metade e `maxAttempts: 1`: `report.error` existe e casa `/aceitou/`; `remaining === before - sent` **até a linha**; `remaining > 0` |
| `a server that throws loses nothing and retries with backoff` (`:183`) | `sent === 0`, `remaining === before`, `attempts === 3`, erro casa `/sem rede/`, e os tempos são exatamente `[1000, 2000]` — "espera mais a cada vez, e não depois da última" |
| `sending the same queue twice is harmless` (`:208`) | Segunda passagem: `sent === 0`, `batches === 0`, `remaining === 0` |
| `a queue longer than one batch goes up in order, batch after batch` (`:221`) | Com `batchSize: 3, maxAttempts: 50`: vários lotes, `remaining === 0`, e **nenhuma entrada enviada duas vezes** (`new Set(flat).size === flat.length`) |
| `backoff grows and then stops growing` (`:234`) | Os cinco valores de `backoffMs` transcritos em 14.3.3 |

---

### 14.13 `scripts/device-session.ts` — o que ele reproduz contra o servidor de verdade

#### 14.13.1 O que ele é

"Roda uma sessão de verdade num banco de aparelho de verdade, e depois imprime a
outbox dela como o SQL que o servidor receberia. **Esta é a metade da barra de
verificação que faltava, e a razão de seis defeitos viverem em plena vista:**
tudo o mais exercita um módulo ou dirige o aplicativo, e nenhum dos dois enxerga
a costura onde as formas do SQLite encontram as do Postgres. Aquela costura só
existe quando uma fila é de fato reproduzida. Nada aqui é simulado. A sessão
chama as mesmas funções de repositório que as telas chamam, a fila é a que o app
realmente constrói, e o SQL sai do `serialize` — o código que vai rodar quando a
sincronização for ligada" (`scripts/device-session.ts:1-17`).

Não é um teste: é um **gerador de SQL** que escreve em `stdout`, para o shell
alimentar um Postgres descartável (`scripts/device-session.ts:377`), e falha com
`process.exit(1)` imprimindo o stack em `stderr`
(`scripts/device-session.ts:380-383`).

Ator: `{ userId: '00000000-0000-4000-8000-000000000001' }`
(`scripts/device-session.ts:47`) — "faz o papel de quem estiver autenticado
quando o telefone finalmente achar uma torre".

#### 14.13.2 A sessão, ato por ato, na ordem em que roda

| # | Chamada | Linha | Por que está na sessão (transcrito ou resumido do comentário) |
|---|---|---|---|
| 1 | `ensureStarterData(LOCAL_COMPANY_ID)` | `:102` | "Um dia na fábrica, na ordem em que realmente acontece" |
| 2 | `listItems` + busca de `Açúcar`, `Polpa`, `Palito` | `:104-120` | Falha alto se a semente não chegou |
| 3 | `saveLine({ name: 'Picolé' })` | `:113` | "A grade do que a fábrica faz, cadastrada como o dono cadastra: a linha primeiro, o tipo dentro dela, o sabor solto. A ordem importa e é a mesma que vai para o servidor — tipo antes da linha seria chave estrangeira quebrada do outro lado" |
| 4 | `saveType({ lineId, name: 'Tradicional' })` | `:114` | idem |
| 5 | `saveFlavor({ name: 'Morango' })` | `:115` | idem |
| 6 | `saveProduct(… 'Picolé Tradicional de Morango' …)` com `packagingItems: [{ itemId: palito.id, quantityPerUnit: 1 }]` e `unitPackagingCents: fromDecimal(0.05)` | `:122-138` | "Uma grade que não chega presa a um produto atravessa sem provar que as três colunas novas atravessam." E a lista de embalagem é `jsonb` do outro lado: crua, o Postgres guardaria string entre aspas e o consumo passaria a somar nada, sem uma reclamação |
| 7 | `recordPurchase(açúcar, 2 sacos, 50 000 g, R$ 295)` | `:141-147` | "Uma segunda nota, para a média móvel ter algo para mover" |
| 8 | `recordCount(lugar padrão, açúcar, 92 000 g)` | `:150-154` | "Alguém anda até a prateleira e acha menos do que os livros esperavam" |
| 9 | `saveRecipeVersion('Base de creme', 10 000 ml, perda 0,04, [polpa 3 000, açúcar 1 500])` | `:157-166` | "E uma receita, cujas linhas carregam uma ordem que alguém escolheu" |
| 10 | `savePlace('Loja Centro', 'own_store')` + `saveOrder(requestedFor '2026-09-10', [polpa 300])` | `:173-178` | "A única escrita deste app que não toca no livro-razão. Uma tabela que `serialize` diz saber mandar e que nenhuma sessão exercita é uma promessa que ninguém cobrou — o servidor recusaria na primeira vez, em produção, com a fila inteira parada atrás dela" |
| 11 | `savePlace('Câmara fria', 'cold_room', sensorRanges: { temperature: { min: -22, max: -16, unit: 'C' } })` | `:187-191` | Dois motivos, os dois cicatriz: a faixa é `jsonb` do outro lado e texto aqui; e `readings` exige `recorded_by` na política, que é a coluna que o aparelho não conhece e o serializador estampa |
| 12 | `recordReading(câmara, 'temperature', -18.4, 'C')` | `:192-197` | idem |
| 13 | `recordProduction(produto com receita, lugar padrão, 1 tacho, 480 unidades, produzido em 2026-09-02)` | `:206-214` | "E uma corrida de verdade, que é o que faz nascer um LOTE. O lote atravessa a fila antes do movimento que o cita, e o servidor tem a chave estrangeira que o SQLite do aparelho não tem — `movements.lot_id` aponta para `lots` lá, e aqui é só um TEXT. Se a ordem estivesse errada, o aparelho aceitaria e o servidor recusaria" |
| 14 | `recordTransfer(polpa, padrão → loja, 2 000)` | `:217-222` | "A carga que sai da fábrica para a loja" |
| 15 | `recordLoss(polpa, 300, 'melted')` | `:225-229` | "Uma perda com motivo, que é o tipo com a capacidade mais restrita" |
| 16 | `recordReturn(polpa, loja → padrão, 500)` | `:238-243` | "Não é enfeite da sessão: no servidor, cada TIPO de movimento tem a sua própria capacidade — transferência pede `dispatch`, devolução pede `check_receipt`. Uma devolução que nunca foi replicada é uma política que nunca foi cobrada" |

#### 14.13.3 O que sai, medido

Execução real desta árvore, com `npx tsx scripts/device-session.ts`:

- Cabeçalho: `-- Gerado por scripts/device-session.ts. Não editar à mão.` e
  `-- 66 escritas na fila, na ordem em que o aparelho gravou.`
- **66 entradas na fila, 66 `insert into`** — nenhuma linha `derived`, nenhuma
  `erase` (a sessão não chama `eraseArea`).
- Distribuição por tabela: `movements` 18, `recipe_lines` 8, `items` 8,
  `purchases` 7, `purchase_lines` 7, `recipes` 3, `recipe_versions` 3,
  `locations` 3, `products` 2, `readings` 1, `product_types` 1, `product_lines` 1,
  `orders` 1, `order_lines` 1, `lots` 1, `flavors` 1.
- Rodapé, os cinco carimbos que o shell consome
  (`scripts/device-session.ts:360-375`):
  `-- DEVICE_SUGAR_ID=<uuid>`, `-- DEVICE_SUGAR_BALANCE=84469`,
  `-- DEVICE_SUGAR_AVERAGE=0.5310`, `-- DEVICE_PRODUCT_ID=<uuid>`,
  `-- DEVICE_PRODUCT_AVERAGE=68.4224`, `-- DEVICE_QUEUE_LENGTH=66`.

A média é impressa com `.toFixed(4)` porque é **`Rate`, não dinheiro**:
fracionária por fundação, e impressa aqui só para a média do servidor ser
comparada contra ela (`scripts/device-session.ts:363-365`).

Amostra literal de uma linha emitida, para `movements` (recortada):

```sql
insert into movements (id, company_id, kind, occurred_at, recorded_at, item_id,
  quantity_base_units, location_id, lot_id, post, loss_reason, unit_cost_rate,
  device_id, movement_group_id, counterpart_location_id, operator_id,
  reverses_movement_id, assistant_phrase, note, recorded_by)
select … from jsonb_populate_record(null::movements, $sync${…}$sync$::jsonb)
on conflict (id) do nothing;
```

Note a ordem: **as colunas do `take` primeiro, `recorded_by` por último** — é a
ordem de `Object.keys` depois do `Object.assign` do `build`.

#### 14.13.4 Os dois guards que o script impõe sobre si mesmo

**Guard de tabela** (`scripts/device-session.ts:322-333`):

```ts
const untouched = sendableTables.filter((table) => !exercised.has(table));
if (untouched.length > 0) {
  throw new Error(
    `a sessão não exercita ${untouched.join(', ')} — a checagem 6 cobriria menos do que promete`,
  );
}
```

Razão: "toda tabela que `serialize` diz saber mandar tem que de fato aparecer
nesta sessão, ou a sexta garantia cobre nove tabelas de dez em silêncio e lê
exatamente igual. Uma tabela acrescentada amanhã que nada aqui exercita **para a
execução** em vez de passar."

**Guard de tipo de movimento** (`scripts/device-session.ts:335-353`):

```ts
const kindsQueTemEscritor = ['purchase', 'production', 'consumption',
  'transfer', 'return', 'adjustment', 'loss'];
const kindsDeFora = kindsQueTemEscritor.filter((kind) => !kindsNaFila.has(kind));
if (kindsDeFora.length > 0) {
  throw new Error(
    `a sessão não grava movimento de tipo ${kindsDeFora.join(', ')} — a política desses tipos ` +
      `nunca é exercitada, e cada tipo tem a sua própria capacidade no servidor`,
  );
}
```

Razão: "no servidor, cada `kind` tem a sua própria capacidade: transferência pede
`dispatch`, devolução pede `check_receipt`, produção pede `record_production`.
Uma sessão que grava movimento de três tipos e replica só dois passa na checagem
de tabelas com a política do terceiro nunca exercitada — que foi exatamente o
buraco por onde a devolução entrou hoje."

E a fronteira dessa lista, escrita: "é do que este aplicativo SABE escrever, não
do enum inteiro do servidor: `sale` e `reversal` não têm escritor ainda, e cobrar
por eles seria pedir que a sessão finja um caminho que o app não tem"
(`scripts/device-session.ts:344-345`).

**Aqui há uma divergência entre o comentário e o repositório atual, e ela é
factual.** `reversal` **tem** escritor: `reverseGroup`
(`src/data/repository.ts:4442`) escreve `INSERT INTO movements … VALUES (?, ?, 'reversal', …)`
e enfileira a linha (`src/data/repository.ts:4504`); duas telas o chamam —
`app/lots/[id].tsx:134` e `app/inputs/[id].tsx:393`. `discrepancy` também tem
escritor (`src/data/repository.ts:2512`). Nenhum dos dois está em
`kindsQueTemEscritor`, e a sessão não grava nenhum dos dois — então a política
`when 'reversal' then private.has_capability(company_id, 'adjust_stock')` e a
`when 'discrepancy' then … 'check_receipt'` **nunca são exercitadas pela fila
reproduzida**. `sale` de fato não tem escritor: `movement_kind` tem `sale` e
nenhum `INSERT INTO movements … 'sale'` existe no repositório.

#### 14.13.5 Como `db:verify` consome essa saída — checagem 6, passo a passo

`npm run db:verify` é `bash scripts/verify-migrations.sh`
(`package.json`), e a checagem 6 é
`a fila do aparelho chega inteira, e os dois lados fecham o mesmo número`
(`scripts/verify-migrations.sh:417`).

1. **Gera a fila.**
   `npx tsx scripts/device-session.ts > "$QUEUE"`; se falhar, imprime o `stderr`
   e reprova com `a sessão do aparelho não rodou`
   (`scripts/verify-migrations.sh:431-435`).
2. **Cria a empresa e a conta dela.** `DEVICE_ACCOUNT=00000000-0000-4000-8000-000000000001`,
   uma `companies` e uma `memberships` com `capabilities = enum_range(null::capability)`
   — todas as capacidades (`scripts/verify-migrations.sh:439-445`).
3. **Concede os privilégios de tabela, e a divisão é a regra em SQL**
   (`scripts/verify-migrations.sh:446-458`):
   ```sql
   grant insert, update on items, locations, products, lots, purchases, purchase_lines,
         recipes, recipe_versions, recipe_lines,
         product_lines, product_types, flavors,
         orders, order_lines to app_user;
   grant insert on movements, readings to app_user;
   ```
   O comentário: "INSERT e UPDATE, e o UPDATE não é excesso: a fila sobe com
   `ON CONFLICT DO UPDATE`, porque uma linha corrigida no aparelho offline tem de
   alcançar o servidor. A exceção é `movements`, que sobe com DO NOTHING — o
   livro-razão não se corrige, se estorna. Faltando o UPDATE, o Postgres responde
   apenas 'permission denied', sem dizer qual dos dois falta."
4. **Sobe a fila COMO A CONTA, sob RLS.** Prefixa
   `set role app_user; set test.uid = '<conta>';` ao arquivo e roda com
   `ON_ERROR_STOP=1` (`scripts/verify-migrations.sh:472-477`). `auth.uid()` é um
   stub que lê `current_setting('test.uid', true)`
   (`scripts/verify-migrations.sh:61-66`), e `app_user` é papel que **não é dono
   da tabela**, para RLS de fato se aplicar
   (`scripts/verify-migrations.sh:238-251`).
   O comentário que registra a cicatriz: "rodar isto com `-U postgres` foi o
   buraco desta checagem por semanas. Um superusuário ignora row level security
   por completo, então as 45 escritas passavam sem que uma única política fosse
   avaliada: provava que as colunas batiam e absolutamente nada sobre o servidor
   aceitar a escrita. A regra que decide se a sincronização funciona —
   `recorded_by = auth.uid()`, capacidade por tipo de movimento, isolamento por
   empresa — nunca era executada. Uma premissa errada minha atravessou a barra
   verde inteira por causa disso" (`scripts/verify-migrations.sh:460-470`).
5. **Conta as escritas replicadas** com `grep -c '^insert into' "$QUEUE"`
   (`scripts/verify-migrations.sh:479`).
6. **A mesma fila, byte por byte, por quem não é da empresa, tem que parar na
   primeira linha** (`scripts/verify-migrations.sh:483-495`). "Se passar, a
   checagem acima não provou nada."
7. **A mesma fila outra vez, e é aqui que o ON CONFLICT sai do papel**
   (`scripts/verify-migrations.sh:497-511`): "num banco vazio nenhuma linha
   conflita, então o DO UPDATE nunca dispara e a política de UPDATE nunca é
   avaliada — a passagem anterior não diz nada sobre ela. Um aparelho reenvia a
   fila o tempo todo: sinal que caiu no meio, tela fechada antes do fim, bateria
   acabando. Reenviar tem de ser inofensivo. E o livro-razão tem de se comportar
   diferente do resto: `movements` sobe com DO NOTHING, então a segunda passagem
   não pode mexer em nenhum movimento. **Se o saldo mudar aqui, o ledger virou
   mutável sem ninguém notar.**" Falha com
   `reenviar a fila foi recusado - a sincronização não é idempotente`.
8. **Os dois lados fecham o mesmo saldo.** O servidor calcula o dele:
   `select coalesce(sum(quantity_base_units), 0) from movements where item_id = '$SUGAR'`
   comparado contra `DEVICE_SUGAR_BALANCE`
   (`scripts/verify-migrations.sh:518-522`).
9. **Os dois lados fecham a mesma média da compra.**
   `select round(new_rate, 4) from item_cost_history where item_id = '$SUGAR' order by observed_at desc, ctid desc limit 1`
   contra `DEVICE_SUGAR_AVERAGE` (`scripts/verify-migrations.sh:524-531`). "O
   gatilho do Postgres calculou a dele sozinho, a partir das linhas de nota que
   chegaram. Se as duas implementações da média móvel discordarem, é aqui que
   aparece — e é **a única checagem do projeto que compara duas implementações
   independentes da mesma regra**."
10. **E a média do PRODUTO, que é a metade que não existia.**
    `select round(average_rate, 4) from item_costs where item_id = '$PRODUCT'`
    contra `DEVICE_PRODUCT_AVERAGE`, com uma asserção de presença antes
    (`scripts/verify-migrations.sh:533-543`): "nenhuma nota compra picolé: o
    servidor só o conhece pelo movimento de produção, e até a 0025 não olhava
    para ele — `item_costs` do produto vinha vazio e o estoque da loja valia
    R$ 0,00 com mil e quatrocentos picolés dentro."
11. **E o lote chegou dizendo de que ficha ele saiu.**
    `select count(*) from lots l join recipe_versions v on v.id = l.recipe_version_id`
    tem que ser `>= 1` (`scripts/verify-migrations.sh:545-556`). A razão é
    metodológica: "'sem uma recusa' não prova que a coluna atravessou: uma coluna
    que o serializador esquecesse de mandar entraria como nula e a fila passaria
    verde. Aqui a chave estrangeira do servidor também é exercitada de verdade: o
    lote aponta para uma `recipe_versions` que subiu antes dele, na mesma fila."

#### 14.13.6 As outras quatro checagens que existem por causa da fila

| Checagem | Linha | O que exercita |
|---|---|---|
| **9** — `o reenvio da fila passa pela capacidade MÍNIMA de quem escreveu` | `:688-717` | A checagem 6 sobe a fila com **todas** as capacidades e a checagem 8 dá à vendedora `place_order` **mais** `dispatch`. "Nenhuma conta com a capacidade mínima de um papel real jamais rodou a SEGUNDA passagem, e é na segunda que o defeito mora." Aqui a gerente de loja tem exatamente `place_order, view_sale_price, check_receipt, record_loss`; o pedido entra, o reenvio com `on conflict (id) do update set place_id = …, status = …, recorded_by = …` entra, o status continua `pending`, e quem tem `approve_order` continua conseguindo aprovar |
| **11** — `o aparelho emprestado cria o lugar padrão, e nada além dele` | `:773-810` | A operadora com `record_production, dispatch, check_receipt, record_loss, adjust_stock` cria `('id','id','','store_room')` com `id = company_id`, reenvia com `on conflict (id) do update set name = …, kind = …`, **e é recusada** ao tentar cadastrar `('…14','…03','Câmara fria','cold_room')`. "Se esta linha passar, o conserto virou permissão nova em vez de escrituração" |
| **12** — `a leitura da câmara sobe duas vezes, e a segunda não reescreve nada` | `:812-847` | `grant insert, update on readings`; insere `-18.4 C`, reenvia igual, e depois reenvia com `-2.0` — que tem de ser **aceito e devolvido ao valor original**, não recusado. `select value` tem de casar `-18.4*`, senão: "o reenvio reescreveu a leitura: a câmara passou a dizer que estava a -2 °C quando estava a -18,4" |
| **13** — `quem aprova um pedido não reescreve quem o anotou` | `:849-878` | `update orders set status = 'open', recorded_by = <outro>` por quem tem `approve_order`: a aprovação funciona **e** `recorded_by` continua o da gerente. A migração 0032 é o conserto, e a checagem foi escrita antes dela e viu o campo virar outro id (`supabase/migrations/0032:24-25`) |

O script termina com
`OK - migrations apply and all thirteen guarantees hold.`
(`scripts/verify-migrations.sh:880`).

---

### 14.14 O que acontece em conflito

Há **três** noções distintas de conflito neste desenho, e confundi-las é o erro
mais fácil de cometer ao reconstruir.

**1. Conflito de chave no servidor (`on conflict (id)`).** É o único que o código
resolve, e ele resolve por família:

| Família | Tabelas | Cláusula | Efeito |
|---|---|---|---|
| Append-only | `movements`, `readings` | `do nothing` | A segunda chegada não faz nada. Corrigir é estornar (`movements`) ou medir de novo (`readings`) |
| Documento | as outras 14 | `do update set <toda coluna enviada> = excluded.<coluna>` | O mais novo do aparelho sobrescreve o do servidor |

(`scripts/device-session.ts:288-299`.) Sobre a família documento incide o
**gatilho** onde RLS não alcança: `orders` congela `recorded_by` para todos e
congela `status`/`decided_at` para quem não decide; `readings` congela os oito
campos do que foi visto.

**2. Aceitação parcial do lote (lado cliente).** O `Transport` devolve
`acceptedIds`; tudo que não estiver ali continua na fila, e a execução **para**
em vez de seguir por cima do buraco — porque continuar mandaria linhas cujos pais
o servidor não tem, transformando uma recusa em muitas
(`src/sync/engine.ts:111-117`).

**3. Escrita concorrente de dois aparelhos na mesma linha.** **NÃO
IMPLEMENTADO** e não modelado: não há versão de linha, não há `updated_at`
comparado, não há vetor de relógio. O `do update` é last-write-wins pela ordem em
que os pacotes chegam ao Postgres. Isso é registrado aqui como lacuna, não como
decisão — não há comentário no código que a escolha explicitamente.

---

### 14.15 Lacunas conhecidas, em uma lista

1. **Nenhum `Transport`.** Ninguém fala HTTP. **NÃO IMPLEMENTADO.**
2. **`drain` não chama `serialize`.** As duas metades do caminho de subida nunca
   foram costuradas em código de produção; a costura existe só no script de
   verificação. **NÃO IMPLEMENTADO.**
3. **Nenhuma tela de sincronização.** `pendingCount` existe e nada o exibe;
   `SyncReport` existe e nada o mostra. **Implementado sem chamador.**
4. **`SyncOptions.now` nunca é lido** (`src/sync/engine.ts:54`). Campo morto.
5. **A frase `O servidor aceitou X de Y registros.` está fora do i18n**
   (`src/sync/engine.ts:114`).
6. **`erase` não tem lado servidor**, e a decisão é do dono
   (`docs/insights.md:565-571`).
7. **Nenhuma descida.** Sem `pull`, sem cursor, sem resolução de conflito
   concorrente. **NÃO IMPLEMENTADO.**
8. **`movements.device_id` é sempre nulo** porque a coluna não existe no aparelho
   (`src/sync/serialize.ts:335-341`).
9. **Os tipos `reversal` e `discrepancy` de `movements` nunca sobem na fila
   reproduzida**, apesar de terem escritor e telas, porque
   `kindsQueTemEscritor` não os inclui (`scripts/device-session.ts:346`).
10. **A premissa da 0031 ("`do update`, sempre") contradiz o `appendOnly` de
    `readings`** (`supabase/migrations/0031:10` contra
    `scripts/device-session.ts:295`); a política `readings_resend` só é
    exercitada por SQL escrito à mão na checagem 12.
11. **`forgetSentBefore` não tem chamador de produção**, então a fila de um
    aparelho cresce indefinidamente depois que a sincronização for ligada
    (`src/data/outbox.ts:139`).
12. **`attempts` conta lotes**, então uma fila grande consome as tentativas sem
    nenhuma falha ter acontecido (`src/sync/engine.ts:92`). Nenhum comentário no
    código reconhece isso.
13. **`lots` não tem `unique (id, company_id)` no servidor**, então
    `movements.lot_id` continua chave estrangeira simples — registrado para não
    ser redescoberto (`supabase/migrations/0029:20-27`).
14. **O guard de `movement_kind` do `agreement.test.ts` cobre cinco dos dez
    valores**, porque só reconhece `kind` escrito como literal no `VALUES`:
    `production`, `consumption`, `transfer` e `return` passam como parâmetro
    ligado (`src/data/repository.ts:1536` e `:1717`) e escapam da comparação com o
    enum. Eles são cobertos indiretamente pela sessão reproduzida, que os grava e
    replica — mas não pelo teste de acordo, que roda em milissegundos e é o que o
    portão de mutação alcança.
