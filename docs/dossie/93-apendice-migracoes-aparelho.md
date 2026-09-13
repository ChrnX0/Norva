## Apêndice D — Banco do aparelho (SQLite), esquema verbatim

Extraído de `src/data/db.ts` (linhas 24–680). Dezessete passos, append-only: editar um
passo já executado faz o banco no aparelho e o arquivo divergirem em silêncio, e o
aparelho de quem já abriu o app nunca recebe a correção.

```typescript
const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`;

const V1 = `
CREATE TABLE IF NOT EXISTS items (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  kind              TEXT NOT NULL,
  name              TEXT NOT NULL,
  -- What the buyer holds in their hands: a 25kg sack, a 10kg bucket.
  purchase_unit     TEXT,
  -- How many base units are inside one purchase unit. Without this the cost is
  -- quietly wrong and nobody notices.
  purchase_to_base  REAL,
  base_unit         TEXT NOT NULL DEFAULT 'g',
  packaging         TEXT NOT NULL DEFAULT '[{"id":"unit","perBaseUnit":1}]',
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_costs (
  item_id            TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  company_id         TEXT NOT NULL,
  -- Fractional cents per base unit. Never rounded.
  average_rate       REAL NOT NULL DEFAULT 0,
  last_rate          REAL,
  on_hand_base_units INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_cost_history (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  previous_rate REAL,
  new_rate      REAL NOT NULL,
  observed_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  yield_amount REAL NOT NULL,
  yield_unit   TEXT NOT NULL DEFAULT 'ml',
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL,
  recipe_id      TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  effective_from TEXT NOT NULL,
  loss_fraction  REAL NOT NULL DEFAULT 0,
  note           TEXT,
  created_at     TEXT NOT NULL,
  UNIQUE (recipe_id, version)
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE CASCADE,
  item_id           TEXT REFERENCES items(id) ON DELETE RESTRICT,
  sub_recipe_id     TEXT REFERENCES recipes(id) ON DELETE RESTRICT,
  quantity          REAL NOT NULL,
  position          INTEGER NOT NULL DEFAULT 0,
  CHECK ((item_id IS NULL) <> (sub_recipe_id IS NULL))
);

CREATE TABLE IF NOT EXISTS products (
  id                   TEXT PRIMARY KEY,
  company_id           TEXT NOT NULL,
  item_id              TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  recipe_id            TEXT REFERENCES recipes(id) ON DELETE RESTRICT,
  yield_per_unit       REAL,
  unit_packaging_cents INTEGER NOT NULL DEFAULT 0,
  active               INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  supplier_name TEXT,
  ordered_at    TEXT,
  received_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  purchase_id       TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_id           TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  purchase_quantity REAL NOT NULL,
  base_units        INTEGER NOT NULL,
  total_cents       INTEGER NOT NULL,
  created_at        TEXT NOT NULL
);

/**
 * Small facts about this installation that are not business data.
 *
 * It exists for one specific reason: the starter data must know it has already
 * run. Seeding on "the items table is empty" would put the demo back the next
 * morning after somebody deliberately wiped it, and an app that undoes your
 * deletions is one nobody trusts with anything else.
 */
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

/**
 * Everything written offline queues here until the server accepts it. The row
 * carries its own id, so replaying the queue twice changes nothing - which is
 * what makes a flaky connection harmless instead of dangerous.
 */
CREATE TABLE IF NOT EXISTS outbox (
  id         TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  payload    TEXT NOT NULL,
  queued_at  TEXT NOT NULL,
  sent_at    TEXT
);

CREATE INDEX IF NOT EXISTS items_kind_idx ON items (company_id, kind) WHERE active = 1;
CREATE INDEX IF NOT EXISTS recipe_lines_version_idx ON recipe_lines (recipe_version_id);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (queued_at) WHERE sent_at IS NULL;
`;

/**
 * Every change to the on-device schema, in order, forever.
 *
 * The device holds the only copy of anything written in a cold room with no
 * signal, so a schema change here can never be "drop it and recreate". Adding
 * a step to this list is the only way the tables change, and SQLite's own
 * `user_version` records how far a given phone has got.
 *
 * Never edit a step that has shipped. A phone that already ran it will not run
 * it again, so the edit reaches new installations only, and the two diverge
 * silently - which is the same reason the SQL migrations on the server are
 * append-only.
 */
/**
 * Adds the operation to a queued write.
 *
 * The first version of the outbox could only say "this row changed", which is
 * enough for a create or an update and useless for a delete: there is nothing
 * left on the device to send. Carrying the verb makes the queue able to
 * describe everything the app actually does.
 */
const V2 = `
ALTER TABLE outbox ADD COLUMN op TEXT NOT NULL DEFAULT 'upsert';
`;

/**
 * The ledger arrives on the device, where it should have been from the start.
 *
 * Foundation 1 of this project says there is no `estoque_atual` column and that
 * a balance is the sum of its movements. The server schema honoured that; this
 * database did not. It carried `item_costs.on_hand_base_units`, an integer
 * updated in place by every purchase - which is precisely the column the
 * foundation forbids, wearing a longer name. Nothing was wrong with the
 * arithmetic. What was wrong is that the number had no history, so it could
 * never be audited, corrected by reversal, or replayed after a sync - and those
 * three properties are the entire reason the rule exists.
 *
 * The backfill matters as much as the table. A phone already holding invoices
 * must come out of this migration with the same balance it went in with, so
 * every purchase line becomes the movement that line always was, keeping its
 * own id: replaying the step twice cannot double a balance.
 *
 * Only then does the column go. Leaving it would leave the trap - a tempting,
 * cheap-looking number sitting one autocomplete away from the correct one.
 *
 * The column names are the server's, down to `quantity_base_units`, because
 * this file's first promise is that the device mirrors the server rather than
 * inventing a second shape. The first draft of this table did invent one -
 * shorter names, an extra column - which reads as tidier and would have meant
 * a translation layer between two schemas that must stay identical for an
 * offline queue to replay at all.
 *
 * A purchase movement keeps its purchase line's id. They are one fact seen
 * twice, so sharing the id makes the link free and makes a replay idempotent
 * without a column to hold it.
 */
const V3 = `
CREATE TABLE IF NOT EXISTS locations (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'store_room',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
  id                   TEXT PRIMARY KEY,
  company_id           TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  -- When it happened in the world, not when it reached the server.
  occurred_at          TEXT NOT NULL,
  recorded_at          TEXT NOT NULL,
  item_id              TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  -- Signed, always the smallest unit: positive arrives, negative leaves.
  quantity_base_units  INTEGER NOT NULL,
  location_id          TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  lot_id               TEXT,
  loss_reason          TEXT,
  -- Fractional cents per base unit, frozen at this instant. A sugar price
  -- change in March must not rewrite what January cost. A rate, never money,
  -- so it is never rounded.
  unit_cost_rate       REAL,
  -- Deferred on purpose. RESTRICT fires row by row, so wiping the table would
  -- trip over its own rows: the reversal is still there when the movement it
  -- cancels goes. Checked at commit instead, the pair leaves together or the
  -- whole erase rolls back.
  reverses_movement_id TEXT REFERENCES movements(id) DEFERRABLE INITIALLY DEFERRED,
  assistant_phrase     TEXT,
  note                 TEXT
);

CREATE INDEX IF NOT EXISTS movements_balance_idx
  ON movements (company_id, item_id, location_id, occurred_at);

-- One place to keep things, for a company that has not been asked to name any.
-- Its id is the company's own: deterministic, so two phones creating the
-- default at the same moment create the same row instead of two.
--
-- The name is left empty on purpose rather than written here in Portuguese.
-- This app puts every word a person reads in the dictionary, and a default
-- that ships as one language would be the single string that escaped. An
-- unnamed location means "the one place", and the interface is what names it.
INSERT OR IGNORE INTO locations (id, company_id, name, kind, created_at)
SELECT company_id, company_id, '', 'store_room', MIN(created_at)
  FROM items GROUP BY company_id;

INSERT OR IGNORE INTO movements
  (id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units,
   location_id, unit_cost_rate)
SELECT l.id, l.company_id, 'purchase', l.created_at, l.created_at, l.item_id, l.base_units,
       l.company_id,
       -- The same arithmetic rateFromCents does: cents over base units. Both
       -- sides are already in their smallest unit, so nothing is converted and
       -- nothing is rounded - a rate is not money.
       CASE WHEN l.base_units > 0
            THEN CAST(l.total_cents AS REAL) / l.base_units
       END
  FROM purchase_lines l;

ALTER TABLE item_costs DROP COLUMN on_hand_base_units;
`;

/**
 * Quem estava operando, gravado na hora — não na hora de sincronizar.
 *
 * O `recorded_by` do servidor era carimbado pelo serializador com o usuário da
 * sincronização, e isso é uma mentira num aparelho compartilhado: o celular da
 * câmara fria passa de mão, e quem sincroniza à noite pode não ser quem
 * registrou de manhã. O livro-razão responderia "quem" com o nome errado, que é
 * pior do que não responder.
 *
 * Então a pessoa entra na linha no instante em que o movimento é escrito. Nulo
 * enquanto não existe sessão com dono — e nulo é honesto: significa que o
 * aparelho não sabia, não que ninguém fez.
 *
 * E a coluna diz mais do que quem gravou: diz **por qual sessão esta linha pode
 * subir**. A política do servidor é `recorded_by = auth.uid()`, provada contra
 * o Postgres na `db:verify` — a mesma escrita é aceita nomeando o próprio
 * usuário da sessão e recusada nomeando qualquer outro. Ninguém assina no nome
 * de ninguém, nem o dono. É por isso que um celular que passa de mão carrega
 * uma sessão por pessoa, em vez de uma conta só carimbando todo mundo.
 */
const V4 = `
ALTER TABLE movements ADD COLUMN recorded_by TEXT;
`;

/**
 * Quem gravou e quem estava operando são duas perguntas, não uma.
 *
 * A V4 tentou fazer uma coluna responder as duas e estava errada. O login
 * autentica **o sistema**: a conta é da empresa, e ela distribui acesso criando
 * outros e-mails ou mandando código de convite por perfil — não é o e-mail
 * pessoal do operador que entra no app. Então a conta que escreve é uma coisa
 * (e o servidor impõe `recorded_by = auth.uid()`, provado na `db:verify`), e
 * quem estava com o aparelho na hora é outra: anotada no momento do registro.
 *
 * Com as duas separadas, o celular compartilhado para de ser um problema de
 * autenticação e vira uma pergunta a mais na tela — para a empresa que quiser
 * fazê-la. `recorded_by` sai daqui porque no aparelho ele nunca teve valor
 * próprio: é sempre a conta que sincroniza, e o serializador já sabe qual é.
 */
const V5 = `
ALTER TABLE movements ADD COLUMN operator_id TEXT;
ALTER TABLE movements DROP COLUMN recorded_by;
`;

/**
 * As colunas que um ato de mais de uma linha precisa.
 *
 * `movement_group_id` amarra as sete linhas de uma corrida de produção e as
 * duas pernas de uma transferência. Sem ela, o estorno de uma corrida inteira
 * não se diz atômico e "explique este número" vira arqueologia por horário.
 *
 * `counterpart_location_id` existe no servidor desde a 0001 e nunca existiu
 * aqui. A transferência escreve duas linhas — saída e entrada — e cada uma
 * precisa dizer para onde foi a outra metade; sem a coluna, a perna sobe muda e
 * o servidor recebe metade da explicação. Um guarda em `agreement.test.ts`
 * listava esta ausência de propósito, para ela ser deliberada em vez de
 * descoberta por uma chave estrangeira falhando de madrugada.
 *
 * As duas são nulas nas linhas antigas: compra e contagem são atos de uma linha
 * só, sem grupo e sem contraparte.
 */
const V6 = `
ALTER TABLE movements ADD COLUMN movement_group_id TEXT;
ALTER TABLE movements ADD COLUMN counterpart_location_id TEXT REFERENCES locations(id);
`;

/**
 * O posto de controle chega ao aparelho, com o primeiro ato que o escreve.
 *
 * `control_post` existe no servidor desde a primeira migração e o aparelho
 * nunca teve a coluna. Ela entra agora porque a conferência de chegada é o
 * primeiro dos quatro postos a ganhar tela - e não antes, porque coluna sem
 * escritor é a doença que este repositório já documentou.
 *
 * Nula nas linhas antigas, e nulo é a resposta certa: compra, produção e
 * contagem não acontecem em posto de controle nenhum. `ADD COLUMN` sem
 * `NOT NULL` e sem `DEFAULT` não reescreve uma linha sequer.
 *
 * O índice de grupo vem junto e não é enfeite. O servidor o tem; o aparelho
 * recebeu `movement_group_id` na V6 e ficou sem ele, e é por essa coluna que a
 * conferência acha a remessa e que a tela pergunta "quais ainda não
 * conferiram". Sem índice, as duas varrem a tabela inteira.
 */
const V7 = `
ALTER TABLE movements ADD COLUMN post TEXT;

CREATE INDEX IF NOT EXISTS movements_group_idx
  ON movements (company_id, movement_group_id)
  WHERE movement_group_id IS NOT NULL;
`;

/**
 * O tacho que está rodando agora — e que o livro-razão não conhece.
 *
 * Esta é a primeira tabela do aparelho que NÃO espelha o servidor, e a razão
 * precisa ficar escrita porque a promessa deste arquivo é a contrária: uma
 * corrida aberta não é fato do negócio, é a INTENÇÃO de um ato em curso. O
 * servidor recebe o ato quando ele acontece — as N+1 linhas que o fechamento
 * escreve, com o id da corrida como `movement_group_id`. Se um dia o dono
 * quiser ver o tacho de casa, isso vira uma entrada em `CROSSINGS`; hoje seria
 * sincronizar rascunho.
 *
 * E é por ser estado que ela pode existir: nenhum `movement_kind` novo, nenhuma
 * coluna em `movements`, nenhuma linha de razão antes do fechamento. Se a forma
 * estiver errada — e ela só se prova com a fábrica usando —, apagar esta tabela
 * custa um `DROP TABLE` e zero estorno.
 *
 * Ela guarda apenas o que está ABERTO. Fechar e cancelar apagam a linha:
 * corrida fechada guardada aqui seria uma cópia de um fato que o razão já tem,
 * e "quanto saiu" precisa de uma resposta só.
 */
const V8 = `
CREATE TABLE IF NOT EXISTS production_runs (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL,
  product_id        TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  recipe_version_id TEXT NOT NULL,
  batches           REAL NOT NULL,
  location_id       TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  opened_at         TEXT NOT NULL
);
`;

const V9 = `
CREATE TABLE IF NOT EXISTS product_lines (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_types (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  line_id    TEXT NOT NULL REFERENCES product_lines(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS flavors (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS product_lines_name_idx
  ON product_lines (company_id, lower(trim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS product_types_name_idx
  ON product_types (company_id, line_id, lower(trim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS flavors_name_idx
  ON flavors (company_id, lower(trim(name)));

ALTER TABLE products ADD COLUMN line_id TEXT REFERENCES product_lines(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN type_id TEXT REFERENCES product_types(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN flavor_id TEXT REFERENCES flavors(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS products_grid_idx
  ON products (company_id, coalesce(line_id, ''), coalesce(type_id, ''), coalesce(flavor_id, ''))
  WHERE active = 1;
CREATE INDEX IF NOT EXISTS products_flavor_idx ON products (company_id, flavor_id);
`;

/**
 * Pedido é demanda, e demanda não é livro-razão.
 *
 * Nada se move quando um cliente liga: as caixas continuam no freezer, e quem
 * conferir a prateleira acha tudo o que o sistema diz que tem. Gravar pedido
 * como movimento faria o saldo mentir no dia da ligação - e como o livro-razão
 * é append-only, corrigir um pedido que mudou pediria estornar uma saída que
 * nunca houve. O elo com o livro-razão é a carga que sai, mais tarde.
 */
const V10 = `
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  place_id      TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('pending', 'open', 'delivered', 'cancelled')),
  requested_for TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL,
  decided_at    TEXT
);

CREATE TABLE IF NOT EXISTS order_lines (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  base_units INTEGER NOT NULL CHECK (base_units > 0)
);

CREATE INDEX IF NOT EXISTS orders_open_idx ON orders (company_id, status, requested_for);
CREATE UNIQUE INDEX IF NOT EXISTS order_lines_once_idx ON order_lines (order_id, item_id);
CREATE INDEX IF NOT EXISTS order_lines_item_idx ON order_lines (company_id, item_id);
`;

/**
 * O lote chega ao aparelho, e com ele a validade.
 *
 * `movements.lot_id` existe aqui desde a V3, e a tabela para onde ele aponta
 * NÃO existia — o `docs/insights.md` já tinha nomeado essa dívida: "hoje é
 * sempre nulo e nulo passa na chave estrangeira, então a fila não trava; trava
 * no dia em que a Fase 2 gravar o primeiro lote". É este o dia.
 *
 * O código é único dentro da empresa, como no servidor, e o índice de validade
 * é parcial pelo mesmo motivo de lá: produto que não vence não ocupa índice.
 *
 * `movements.lot_id` continua sem chave estrangeira aqui, e não por descuido —
 * o SQLite não acrescenta FK a coluna que já existe. Quem recusa lote fantasma
 * é o servidor, e a `db:verify` reproduz a fila contra ele justamente para que
 * essa diferença não passe despercebida.
 */
const V11 = `
CREATE TABLE IF NOT EXISTS lots (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  code        TEXT NOT NULL,
  produced_on TEXT,
  expires_on  TEXT,
  created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS lots_code_idx ON lots (company_id, code);
CREATE INDEX IF NOT EXISTS lots_expiry_idx ON lots (company_id, expires_on)
  WHERE expires_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS lots_item_idx ON lots (company_id, item_id);

ALTER TABLE products ADD COLUMN shelf_life_days INTEGER;
`;

/**
 * A ficha de acordo da loja.
 *
 * `delivery_days` é um bitmask com o bit 0 no domingo (`src/domain/agreement`),
 * e não uma lista de texto: um inteiro atravessa a fila do aparelho e o Postgres
 * sem nenhuma conversão que possa divergir entre os dois lados. Zero significa
 * "não combinamos dia" — diferente de "nenhum dia".
 */
const V12 = `
ALTER TABLE locations ADD COLUMN contact_phone TEXT;
ALTER TABLE locations ADD COLUMN delivery_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE locations ADD COLUMN agreement_note TEXT;
`;

/**
 * O palito sai do estoque.
 *
 * Até aqui a embalagem era um valor DIGITADO no produto (`unit_packaging_cents`),
 * e palito e saquinho eram itens comprados por nota: o custo saía certo e o
 * saldo de palito só subia. A cura está escrita em `docs/insights.md` desde o
 * dia em que o custo congelado foi corrigido — "ligar produto → itens de
 * embalagem, com quantidade por unidade" —, e é isto.
 *
 * A quantidade é POR UNIDADE PRODUZIDA, e é essa a diferença que a torna uma
 * coisa nova em vez de mais uma linha de receita: o tacho se espalha pelas
 * unidades que saíram (meio tacho rende metade), mas um palito é um palito tenha
 * a corrida rendido 400 ou 500. Como linha de receita, o consumo de palito
 * encolheria junto com o rendimento — e um palito e meio não existe.
 *
 * Lista na própria linha, e não tabela à parte, pelo mesmo motivo que
 * `items.packaging` já é: a lista é curta, é reescrita inteira, e não tem
 * histórico próprio — o histórico é o consumo que cada corrida gravou, com a
 * taxa congelada. Tabela à parte exigiria enfileirar exclusão, e o motor de
 * sincronia deste app só sabe enviar linha (`upsert`); inventar o verbo para
 * guardar cadastro seria pagar caro no caminho de escrita por uma vantagem que
 * não existe.
 *
 * `unit_packaging_cents` continua e não é duplicidade: passa a ser o que NÃO
 * está listado. Quem não quer contar palito no estoque digita o valor e segue;
 * quem quer, lista os itens. Os dois caminhos existem.
 */
const V13 = `
ALTER TABLE products ADD COLUMN packaging_items TEXT NOT NULL DEFAULT '[]';
`;

/**
 * O nível cheio de um item — a régua que transforma saldo em juízo.
 *
 * As faixas de volume que o dono desenhou (vermelho, amarelo, verde, azul) são
 * porcentagem DE ALGUMA COISA, e essa coisa não pode ser inventada: sem uma
 * referência cadastrada, "20%" seria um número que ninguém pode conferir. Nulo é
 * o caso normal e legítimo — o item simplesmente não entra na leitura por faixa,
 * e nenhuma tela pinta cor nele.
 *
 * Em unidade-base, como todo o resto do estoque: um saco de 50 kg de açúcar é
 * 50000, e a conta de porcentagem fica em número inteiro sem conversão nenhuma
 * no caminho.
 */
const V14 = `
ALTER TABLE items ADD COLUMN full_level REAL;
`;

/**
 * A leitura de uma grandeza num lugar — temperatura hoje, o que vier depois.
 *
 * O dono perguntou por alarme de temperatura da câmara fria e disse que vai
 * arrumar um ESP32 para vender o módulo dele. Depois lembrou que existe mais de
 * uma câmara, e que umidade, pressão e ruído também interessam. As três coisas
 * juntas decidem a forma desta tabela, e nenhuma delas exige tabela nova depois:
 *
 * `kind` e `unit` são TEXTO ABERTO, não enum. Zigbee, LoRa, umidade, pressão,
 * decibel — protocolo e grandeza novos não podem pedir migração. O que a
 * integridade exige aqui é outra coisa: que a leitura saiba ONDE foi tomada e
 * POR QUEM, e isso é chave estrangeira de verdade.
 *
 * `device_id` é nulo quando a pessoa digitou. Não é lacuna: leitura digitada na
 * conferência é fato tanto quanto leitura de sensor, e é o único caminho que
 * funciona hoje — a fábrica começa a ter histórico antes de existir hardware, o
 * que é o contrário de esperar o módulo e ficar seis meses sem série nenhuma.
 *
 * Mais de uma câmara já estava resolvido antes de existir: cada câmara é um
 * `location`, e N sensores em N câmaras são N `devices` apontando para lugares
 * diferentes.
 */
const V15 = `
CREATE TABLE IF NOT EXISTS readings (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  device_id   TEXT,
  kind        TEXT NOT NULL,
  value       REAL NOT NULL,
  unit        TEXT NOT NULL,
  taken_at    TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'typed'
);

CREATE INDEX IF NOT EXISTS readings_where_idx
  ON readings (company_id, location_id, kind, taken_at);

ALTER TABLE locations ADD COLUMN sensor_ranges TEXT NOT NULL DEFAULT '{}';
`;

/**
 * O lote passa a dizer QUAL FICHA rodou, e não qual receita.
 *
 * A auditoria da Fase 1 marcou isto como o único item ausente, e ele voltou pela
 * metade: `production_runs.recipe_version_id` recebia `product.recipeId` — o id
 * da RECEITA na coluna da VERSÃO —, e a linha da corrida é apagada ao fechar ou
 * cancelar. Ou seja, nada durável dizia qual ficha fez aquele picolé.
 *
 * O custo disso aparece quando alguém corrige a fórmula: sem o carimbo, o custo
 * histórico e o recall passam a apontar para a receita de HOJE, e uma correção
 * feita em março reescreve o que janeiro custou. O livro-razão é imutável
 * justamente para isso não acontecer, e aqui a imutabilidade estava furada por
 * fora — o número congelado continuava certo, mas a pergunta "de que ficha ele
 * saiu?" não tinha resposta.
 *
 * A marca fica no LOTE porque o lote é o que sobrevive: ele não é apagado, é o
 * que a etiqueta nomeia e é por onde um recall começa. Coluna anulável porque
 * lote de importação não tem ficha nenhuma — e nulo aqui é resposta, não lacuna.
 */
const V16 = `
ALTER TABLE lots ADD COLUMN recipe_version_id TEXT;
`;

/**
 * O índice que faltava embaixo de "o que foi estornado não aconteceu".
 *
 * `NAO_ESTORNADO` (src/data/repository.ts) é uma subconsulta correlacionada:
 * para CADA linha candidata ela pergunta se existe um movimento que a estorna.
 * Sem índice em `reverses_movement_id`, essa pergunta é uma varredura completa
 * de `movements` — o plano do SQLite diz `SCAN rev` — e ela roda uma vez por
 * linha. Oito consultas do aplicativo usam essa cláusula, e a capa dispara cinco
 * delas de uma vez.
 *
 * Medido, não estimado, contra um SQLite real de 60 mil movimentos (cinco meses
 * de uma fábrica de seis lojas), janela de sete dias, 2.779 linhas candidatas:
 *
 *   com a cláusula, sem índice ....... 9.906 ms
 *   sem a cláusula ....................... 3 ms
 *   com a cláusula e este índice ......... 4 ms
 *
 * O índice é PARCIAL — só as linhas de estorno entram — porque estorno é raro
 * por natureza: num banco sem nenhum ele ocupa praticamente nada, e continua
 * ocupando pouco numa fábrica que corrige uma corrida por semana.
 *
 * E ele custa quase nada para criar num banco que já existe: a coluna já está
 * lá desde a V3, e a construção é sobre as linhas de estorno, não sobre a
 * tabela inteira.
 */
const V17 = `
CREATE INDEX IF NOT EXISTS movements_reversal_idx
  ON movements (reverses_movement_id, company_id)
  WHERE reverses_movement_id IS NOT NULL;
`;

const MIGRATIONS: readonly string[] = [
  V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16, V17,
];

export type SqlParam = string | number | null;

/**
 * The slice of the database the app actually uses.
 *
 * Naming it is what makes the data layer testable: `expo-sqlite` only exists on
 * a device, but any object with these five methods will do, so the tests drive
 * the real SQL against Node's own SQLite instead of mocking the queries and
 * proving nothing.
 */
export type Db = {
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, params?: SqlParam[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

let handle: Db | null = null;

/**
```
