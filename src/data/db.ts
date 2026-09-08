/**
 * The on-device database.
 *
 * It mirrors the server schema rather than inventing a second shape, because
 * the sync is an append-only replay of the same rows: a movement written in a
 * freezer with no signal has to be the same record the server will accept when
 * the phone finds a tower again.
 *
 * Two deliberate differences from `supabase/migrations`:
 *   - no RLS: the device already holds exactly one user's data, and the server
 *     is the boundary that matters
 *   - rates are REAL, amounts are INTEGER cents, matching the same split the
 *     domain enforces - a price per gram is not money and must not be rounded
 */

/**
 * Connection settings, applied on open and never inside a transaction.
 *
 * `foreign_keys` has to live here rather than in a migration: SQLite ignores
 * the pragma while a transaction is open, and every migration step runs in
 * one. A silently ignored pragma would leave the references unenforced, which
 * is precisely the protection the erase order depends on.
 */
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
SELECT company_id, company_id, '', 'factory', MIN(created_at)
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
 * o servidor recebe metade da explicação. Um guarda em `src/sync/agreement.test.ts`
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

/**
 * A embalagem digitada vira TAXA, porque preço por unidade sempre foi taxa.
 *
 * `unit_packaging_cents` guarda em centavo INTEIRO o valor que a fábrica digita
 * para o que não lista no estoque — rótulo, fita, o que ninguém quer contar
 * (migração V13). A tela fazia `fromDecimal(0,004)`, que é `Math.round(0,4)` =
 * **zero**: rótulo abaixo de meio centavo entrava de graça. E entrava no
 * `unit_cost_rate` **congelado** de toda corrida daquele produto — que, pela
 * fundação desta casa, não se corrige: se estorna.
 *
 * É a fundação da capa na letra — *"`Cents` é inteiro, `Rate` é fracionário;
 * valor que alguém paga e preço por unidade não são o mesmo tipo de número"* —
 * e é o mesmo defeito da polpa a R$ 12,40/kg, num canto onde ninguém olhou.
 *
 * **A coluna velha fica e para de ser lida.** Migração não se edita: apagar a
 * antiga faria banco e arquivo divergirem em silêncio em qualquer aparelho que
 * já rodou a V13. Ela fica dormente, com este motivo escrito, e a nova nasce
 * preenchida a partir dela — o que preserva exatamente o que cada fábrica já
 * tinha digitado, com a precisão que ela tinha na hora.
 *
 * **Por que agora.** O `LossReason` deixou a regra: o vocabulário de um razão só
 * é livre para mudar enquanto nenhuma linha foi gravada com ele. O servidor não
 * está no ar por decisão do dono, então a janela está aberta. Ela fecha no dia
 * do primeiro cliente.
 */
const V18 = `
ALTER TABLE products ADD COLUMN unit_packaging_rate REAL NOT NULL DEFAULT 0;
UPDATE products SET unit_packaging_rate = unit_packaging_cents;
`;

/**
 * Por que a carga voltou.
 *
 * O tipo `return` separou a devolução da transferência; o MOTIVO ainda não
 * separava nada — "a loja não vendeu" e "a carga chegou derretida" entravam como
 * a mesma linha, e as duas mandam fazer coisas opostas. Ver
 * `supabase/migrations/0034_why_it_came_back.sql`, que é quem impõe a regra: o
 * servidor recusa devolução sem motivo E motivo fora de devolução.
 *
 * Aqui a coluna é solta, como todas as outras do aparelho: quem valida é o
 * domínio na entrada e o Postgres na saída. O aparelho grava rápido e offline;
 * fazer o SQLite julgar vocabulário seria uma segunda regra para divergir da
 * primeira.
 */
const V19 = `
ALTER TABLE movements ADD COLUMN return_reason TEXT;
`;

/**
 * Gente e perfil — a tabela que faltava atrás de `operator_id`.
 *
 * O servidor tinha o nó, e a `0035` o desfaz com o raciocínio inteiro escrito:
 * `memberships` é CONTA (exige `auth.users`), e a pessoa que entra pela grade de
 * nomes com PIN não tem conta nenhuma. Aqui as duas tabelas nascem já certas,
 * porque no aparelho não havia nem uma nem outra.
 *
 * `capabilities` é texto separado por vírgula, e não JSON, pelo mesmo motivo que
 * a ordem da capa: é uma lista de palavras curtas que alguém pode precisar ler no
 * banco durante um suporte, e `dispatch,check_receipt,record_loss` se lê. Quem
 * julga o vocabulário é o domínio na entrada e o Postgres na saída — o SQLite
 * guardando um segundo julgamento seria uma segunda regra para divergir.
 *
 * `template_role` guarda qual dos sete papéis do produto originou o perfil, e o
 * `name` dele nasce VAZIO — o mesmo desenho do lugar padrão, pela mesma razão:
 * "Entregador" é uma palavra em três idiomas, e essa palavra é da tela. No dia em
 * que o dono renomear, o `name` ganha valor e vence; enquanto ele não renomeia, a
 * tela traduz. Perfil criado pela empresa nasce com nome e sem papel.
 */
const V20 = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT,
  template_role TEXT,
  capabilities TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS people_company_idx ON people (company_id, active);
`;

/**
 * O PIN da grade de nomes — e ele é ATRIBUIÇÃO, não senha.
 *
 * A decisão do dono é de 1 de setembro: no aparelho compartilhado, entra-se por
 * uma grade de nomes com PIN, *"dois segundos, de luva, offline"*. O estudo de 6
 * de setembro (`docs/estudo-entrada.md`) mediu o que isso pode e não pode ser, e
 * a conclusão precisa ficar colada na coluna, senão alguém a lê como senha:
 *
 * **Quatro dígitos num celular que seis pessoas dividem não protegem nada contra
 * quem tem o aparelho.** O trabalho do PIN é impedir o toque errado e a troca
 * casual de nome — que alguém assine uma conferência no lugar do colega sem
 * querer, ou de propósito e sem esforço. Quem protege o número é o livro-razão
 * ser append-only e a contagem ser cega; nunca foi o PIN.
 *
 * **Guardado em texto puro, e isto é escolha, não esquecimento.** Não existe
 * criptografia neste projeto — nem `expo-crypto`, nem armazenamento seguro
 * (medido em 6 de setembro). E mesmo com hash: quatro dígitos são dez mil
 * possibilidades, então sem derivação lenta o hash não compra quase nada contra
 * quem já tem o arquivo do banco. Contra quem tem o banco, nada aqui protege — a
 * defesa desse caso é `allowBackup: false` e o aparelho ser da empresa.
 *
 * No dia em que `expo-crypto` entrar por outro motivo, isto vira hash com
 * derivação, e a migração é de uma linha.
 *
 * Nulo é o caso normal: pessoa sem PIN é escolhida com um toque só, que é o que
 * uma fábrica de seis pessoas quer.
 */
const V21 = `
ALTER TABLE people ADD COLUMN pin TEXT;
`;

/**
 * Por quanto a mercadoria sai — o preço de tabela e o combinado com cada um.
 *
 * As três peças da `0037` do servidor, e nenhuma delas toca o livro-razão:
 * `movements.unit_price_rate` continua sem escritor, porque congelar preço é P3 e
 * depende da venda para cliente, que ainda não existe.
 *
 * **O histórico não é enfeite.** Preço combinado é digitado à mão e não tem nota
 * atrás dele: sobrescrever a linha corrente apaga "por quanto vendíamos em março"
 * de toda tabela, e isso não volta por migração nenhuma. É a assimetria com o
 * custo, que pode ser sobrescrito porque as notas reconstroem a série.
 *
 * `location_id` NULO no histórico é a mudança do preço de TABELA — uma tabela para
 * as duas séries, porque a pergunta é uma só: por quanto isto saía naquele dia.
 *
 * O `id` próprio em `location_prices` é o que faz a linha atravessar: a fila
 * endereça por id único, e a única tabela de chave composta do aparelho é
 * justamente a que não sobe.
 */
const V22 = `
ALTER TABLE items ADD COLUMN sale_price_rate REAL;

CREATE TABLE IF NOT EXISTS location_prices (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price_rate  REAL NOT NULL CHECK (price_rate > 0),
  created_at  TEXT NOT NULL,
  UNIQUE (company_id, location_id, item_id)
);

CREATE TABLE IF NOT EXISTS sale_price_history (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  location_id   TEXT REFERENCES locations(id) ON DELETE CASCADE,
  previous_rate REAL,
  new_rate      REAL NOT NULL CHECK (new_rate > 0),
  observed_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sale_price_history_idx
  ON sale_price_history (company_id, item_id, observed_at DESC);
`;

/**
 * A sala padrão passa a ser FÁBRICA, que é o que a tela sempre disse que ela é.
 *
 * `ensureLocation` gravava `store_room` e a tela titula a sala sem nome como
 * "Fábrica" (`nomeDoLugar`), lendo a espécie para a sobrelinha. Resultado no
 * aparelho: um cartão escrito **Fábrica** com a sobrelinha **ALMOXARIFADO** — a
 * mesma linha dizendo duas coisas.
 *
 * E o defeito tem a outra metade, que é a que importa: `factory` é a PRIMEIRA
 * espécie de `location_kind` desde a fundação do servidor e **não tinha um único
 * escritor no sistema inteiro**. Peça pronta que ninguém chama é o defeito que o
 * portão P1 desta casa existe para pegar, e ela estava no esquema desde o
 * primeiro dia.
 *
 * A troca é segura porque `factory` e `store_room` são as duas salas INTERNAS
 * (`INTERNAL_PLACE_KINDS`): nenhuma regra de carga, de separação ou de espelho
 * muda de resposta. E a fila carrega o ID da linha, não uma cópia dela — então o
 * que ainda não subiu sobe já com a espécie certa.
 */
const V23 = `
UPDATE locations SET kind = 'factory'
 WHERE id = company_id AND kind = 'store_room';
`;

/**
 * A transportadora: quem LEVOU, que não é quem carregou nem para onde foi.
 *
 * **Ela não é um lugar, e é por isso que não entra em `locations`.** O docblock
 * das espécies de lugar já decide o caso vizinho — *"caminhão é caminho, não é
 * sala nem destino"* —, e uma transportadora é menos ainda: é uma empresa com
 * telefone. Carga em cima dela não está numa sala nem chegou a ninguém.
 *
 * **E ela não copia o molde de `suppliers`.** Aquela tabela existe desde a
 * fundação com zero escritores e zero leitores: `purchases.supplier_id` nunca foi
 * escrito, e quem vive é o `supplier_name` digitado. Cadastro sem quem leia é a
 * doença que este repositório documentou quatro vezes — então `carrier_id` nasce
 * com a tela que escolhe e a tela que mostra, no mesmo commit.
 *
 * `carrier_id` é NULO por padrão e continua sendo: a fábrica que entrega com o
 * carro dela não tem transportadora, e obrigar um nome ali seria inventar um fato.
 */
const V24 = `
CREATE TABLE IF NOT EXISTS carriers (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  phone      TEXT,
  note       TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS carriers_name_idx
  ON carriers (company_id, lower(trim(name)));

ALTER TABLE movements ADD COLUMN carrier_id TEXT REFERENCES carriers(id);
`;

/**
 * Uma sala fica DENTRO de uma unidade — e o backfill é a metade que protege quem já usa.
 *
 * `locations` não tinha pai: uma câmara fria pertencia à empresa, não à fábrica. Com uma
 * unidade isso nunca custou nada, porque toda sala interna era da única. Com duas, a
 * pergunta *"dá para prometer este pedido?"* passa a contar o freezer da outra cidade.
 *
 * **E o conserto ingênuo é pior que o defeito:** recortar por `location_id = <a unidade>`
 * excluiria a câmara fria de quem já tem o aplicativo instalado, porque hoje ela não
 * aponta para unidade nenhuma. O saldo cairia, calado, para todo mundo. Então a sala
 * interna existente passa a apontar para a unidade que tem o id da empresa — a primeira,
 * e a única de hoje. É verdade sobre o mundo: quem tem uma fábrica tem a câmara dentro
 * dela.
 *
 * Loja própria e cliente ficam de fora: não ficam dentro de uma fábrica, ficam no mundo.
 *
 * O SQLite não tem chave composta, então a integridade que o servidor impõe pela
 * `(parent_location_id, company_id)` da migração 0046 mora aqui na forma que o aparelho
 * consegue — uma referência simples — e o resto é o `db:verify`, que roda contra Postgres.
 */
const V25 = `
ALTER TABLE locations ADD COLUMN parent_location_id TEXT REFERENCES locations(id);

CREATE INDEX IF NOT EXISTS locations_parent_idx
  ON locations (company_id, parent_location_id);

UPDATE locations
   SET parent_location_id = company_id
 WHERE kind IN ('cold_room', 'store_room')
   AND parent_location_id IS NULL
   AND id <> company_id
   AND EXISTS (SELECT 1 FROM locations u WHERE u.id = locations.company_id);
`;

/**
 * O preço por que uma coisa saiu — a coluna que faltava para a margem existir.
 *
 * `movements.unit_price_rate` existe no servidor desde a `0008`, gateada por
 * `view_sale_price` na view, e ficou **quarenta e seis migrações sem escritor**. O
 * aparelho nunca teve a coluna, então até hoje ele não tinha onde guardar o número
 * mesmo que quisesse: o custo congelado ele tem (`unit_cost_rate`), o preço
 * combinado ele tem (`location_prices`), e o que fica entre os dois — a margem — não
 * existia porque o fato da venda não era gravado em lugar nenhum.
 *
 * `REAL` e não inteiro, pelo mesmo motivo que `unit_cost_rate`: é uma TAXA por
 * unidade-base, não dinheiro. Picolé a R$ 2,20 é 220 centavos por unidade e a conta
 * fecha, mas a régua da casa é que taxa não arredonda nunca e só o valor final
 * arredonda, uma vez — e o dia em que um item for vendido a granel ("R$ 12,40 o
 * quilo" é 1,24 centavo por grama) a coluna inteira perderia um quinto antes da
 * primeira multiplicação. Foi um bug real deste projeto, com nome e data.
 *
 * O nome é o do servidor, letra por letra: a fila manda a linha com os nomes que ela
 * tem, e um `unitPriceRate` aqui seria recusado lá — em silêncio, porque a coluna
 * é opcional dos dois lados.
 */
const V26 = `
ALTER TABLE movements ADD COLUMN unit_price_rate REAL;
`;

const MIGRATIONS: readonly string[] = [
  V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16, V17, V18,
  V19, V20, V21, V22, V23, V24, V25, V26,
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
 * Opening the file. A seam, because this is the one line of this module that
 * cannot run outside a phone - and the tests need to arrive at everything
 * behind it.
 *
 * Imported inside the function rather than at the top of the file: `expo-sqlite`
 * reaches into React Native, which only exists on a device. Loading it lazily
 * is what lets the tests point `__setDb` at Node's own SQLite and run the real
 * queries, instead of mocking them and proving nothing.
 */
type NativeDb = {
  getAllAsync<T>(sql: string, params: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlParam[]): Promise<T | null>;
  runAsync(sql: string, params: SqlParam[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

type Opener = () => Promise<NativeDb>;

let openNative: Opener = async () => {
  const SQLite = await import('expo-sqlite');
  return SQLite.openDatabaseAsync('norva.db');
};

/**
 * The opening in flight, so two callers arriving together share one.
 *
 * `handle` was only assigned after `migrate` resolved, and the home screen asks
 * five questions in a single `Promise.all`. Each one that arrived before the
 * first finished opened **another** connection to `norva.db` and started
 * **another** migration on it - and V2, V4, V5 and V6 are `ALTER TABLE ... ADD
 * COLUMN`, which throws `duplicate column name` when it runs twice. It stayed
 * invisible only because the seed in `_layout` happened to finish first, and
 * that await was wrapped in a `catch` that said nothing.
 */
let opening: Promise<Db> | null = null;

export async function db(): Promise<Db> {
  if (handle) return handle;

  // Cleared when it settles: on success `handle` answers from here on, and on
  // failure the next caller is allowed to try again instead of being handed
  // the same rejection forever.
  opening ??= openAndMigrate().finally(() => {
    opening = null;
  });

  return opening;
}

async function openAndMigrate(): Promise<Db> {
  const native = await openNative();
  await native.execAsync(PRAGMAS);
  await migrate({
    getAllAsync: <T,>(sql: string, params: SqlParam[] = []) => native.getAllAsync<T>(sql, params),
    getFirstAsync: <T,>(sql: string, params: SqlParam[] = []) =>
      native.getFirstAsync<T>(sql, params),
    runAsync: (sql: string, params: SqlParam[] = []) => native.runAsync(sql, params),
    execAsync: (sql: string) => native.execAsync(sql),
    withTransactionAsync: (task: () => Promise<void>) => native.withTransactionAsync(task),
  });

  // A thin wrapper rather than the driver itself, so "no parameters" means the
  // same thing here as it does in Node's SQLite.
  handle = {
    getAllAsync: <T,>(sql: string, params: SqlParam[] = []) => native.getAllAsync<T>(sql, params),
    getFirstAsync: <T,>(sql: string, params: SqlParam[] = []) =>
      native.getFirstAsync<T>(sql, params),
    runAsync: (sql: string, params: SqlParam[] = []) => native.runAsync(sql, params),
    execAsync: (sql: string) => native.execAsync(sql),
    withTransactionAsync: (task: () => Promise<void>) => native.withTransactionAsync(task),
  };

  return handle;
}

/**
 * Brings a database up to the current schema, and says nothing if it is
 * already there. Safe to call on every launch - that is when it runs.
 *
 * Each step is applied inside its own transaction, so a phone that dies
 * mid-upgrade comes back on the last version that completed rather than on
 * half of the next one.
 */
export async function migrate(conn: Db): Promise<number> {
  const row = await conn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const applied = row?.user_version ?? 0;

  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    const step = MIGRATIONS[version];
    await conn.withTransactionAsync(async () => {
      await conn.execAsync(step);
      // Inside the transaction, and that is the whole point.
      //
      // Written after the commit, this line was a way to brick a phone. A
      // process killed in the gap between the two would come back believing
      // the step had not run, and re-run it - and a step like V2's
      // `ALTER TABLE ... ADD COLUMN` fails on a column that already exists.
      // Not once: on every launch, for ever, with no way in.
      //
      // `PRAGMA user_version` participates in the transaction like any other
      // write, so the schema change and the record of it now land together or
      // not at all. PRAGMA takes no bound parameter, and the value is an index
      // into a constant list rather than anything a caller can reach.
      // proofgate-allow
      await conn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }

  return MIGRATIONS.length;
}

/**
 * Test seam: lets a test stand a database up at an older version deliberately,
 * so the upgrade path is exercised rather than assumed. A migration is only
 * ever run once on a real phone, which makes it the one piece of code where a
 * mistake is unreachable by every other test.
 */
export const migrationSteps: readonly string[] = MIGRATIONS;

/** How many steps exist, so a test can assert it moved. */
export const schemaVersion = MIGRATIONS.length;

/** The pragmas a connection needs before anything else touches it. */
/** Test seam: lets a test point at a fresh in-memory database. */
export function __setDb(next: Db | null) {
  handle = next;
  opening = null;
}

/**
 * Points the opening at something a test can run. Only the tests call this -
 * and the reason it exists is that the path behind it, the one every phone
 * takes on first launch, had no way of being exercised at all.
 */
export function __setOpener(next: Opener) {
  openNative = next;
  handle = null;
  opening = null;
}

export function newId(): string {
  // Client-generated so an offline write is idempotent on replay.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
