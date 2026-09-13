-- A descida MORRIA na primeira tabela, e nenhuma linha chegava a aparelho nenhum.
--
-- `src/sync/descida.ts` monta o pedido de toda tabela como `[...colunasQueSobem(tabela),
-- 'received_at']` e `transporte.ts` ordena por `received_at, id`. O servidor tem essa coluna
-- em QUATRO tabelas — `movements`, `readings`, `sale_price_history` (`0061`) e
-- `check_candidates` (`0062`) — e `DESCEM` tem vinte e três.
--
-- A primeira delas é `carriers`. `descer()` para a RODADA INTEIRA no primeiro erro, de
-- propósito (descer movimento antes do item que ele cita gravaria referência quebrada, e o
-- SQLite recusaria a linha calado). Então o que o dono via era a sincronia devolvendo
-- `column carriers.received_at does not exist` — e nem o cadastro, nem o razão, nem a
-- disputa de conferência descia. A mão de volta não funcionava para nada.
--
-- ## A fronteira estava DITA, e nada a impunha
--
-- A `0061` escreveu de si mesma, com estas palavras: *"só nas três tabelas append-only que
-- descem. Cadastro (`items`, `people`, `locations`, `recipes`…) desce por outro caminho —
-- upsert, última palavra vence — e para isso `updated_at` já serve."*
--
-- As duas metades são falsas, e a segunda é a pior: **`updated_at` não existe em tabela
-- nenhuma deste servidor.** O "outro caminho" não era um caminho mais fraco — ele não existia.
-- E `pedido()` nunca teve exceção: ele pede `received_at` de todas, inclusive das que a
-- migração declarou fora. Fronteira dita em voz alta continua sendo fronteira; o que fecha
-- buraco é guarda, e agora existe uma (`src/sync/agreement.test.ts`).
--
-- ## O carimbo é na ATUALIZAÇÃO também, e é aí que estava o defeito que dói
--
-- `default now()` só carimba no insert. Cadastro desce por upsert — o item muda de nome, o
-- perfil ganha capacidade — e uma correção que não move `received_at` fica para sempre ANTES
-- do cursor de quem já desceu: ela nunca é relida. O celular da gerente continuaria chamando
-- o item pelo nome velho, sem nada reclamar.
--
-- O caso que quebra uma decisão do dono é `check_candidates`. *"O primeiro que aceitar fica"*
-- (11 de setembro) é um `update` da coluna `resolution` numa linha que o outro celular JÁ
-- desceu. Sem o carimbo na atualização, a decisão não chega ao outro aparelho: a `0063`
-- escreve o estorno aqui e o celular que perdeu segue com a conferência de pé no razão dele,
-- para sempre. A rodada 14 inteira dependia de uma coluna que não se movia.
--
-- ## E carimbar no INSERT não é redundância com o `default`
--
-- O padrão vale quando o cliente não manda a coluna; mandando, ele escolhe o valor. Um
-- cliente que mandasse `received_at` de ontem poria a própria linha ANTES do cursor de todos
-- os outros aparelhos — invisível para sempre, sem erro nenhum. O cursor é fato do servidor
-- sobre a chegada, e fato do servidor não se aceita do cliente. É a mesma regra de
-- `recorded_by = auth.uid()`, aplicada ao relógio em vez de à conta.

-- ## Primeiro a COLISÃO, porque ela é pior que a ausência
--
-- `purchases.received_at` existe desde a `0002` e significa **quando a mercadoria chegou** —
-- é o lado direito da conta de prazo do fornecedor (`observedLeadTime`), e o aparelho a
-- escreve. A descida a usava como cursor.
--
-- Isso não é "cursor impreciso": é cursor que anda para trás. A nota de terça digitada na
-- quinta tem `received_at` de terça, que já está antes do cursor de quem sincronizou na
-- quarta — **a nota nunca desce**. E nota sem data de chegada (a coluna é nula) fica fora de
-- `received_at > cursor` para sempre, porque nulo não é maior que nada.
--
-- Então a coluna de negócio recebe o nome que ela sempre significou, e `received_at` passa a
-- ser o que é em todas as outras: hora do servidor. Duas perguntas, duas colunas — a mesma
-- lição de `recorded_by` contra `operator_id`, que já custou uma rodada inteira aqui.
alter table purchases rename column received_at to arrived_at;

comment on column purchases.arrived_at is
  'Quando a mercadoria CHEGOU no mundo — o lado direito do prazo observado do fornecedor. '
  'Chamava-se received_at até a 0065, e colidia com o cursor da descida: uma nota digitada '
  'dias depois nascia atras do cursor de quem ja havia sincronizado e nunca descia.';

-- A coluna do cursor, nas dezenove que descem e não a tinham.
alter table carriers           add column if not exists received_at timestamptz not null default now();
alter table locations          add column if not exists received_at timestamptz not null default now();
alter table profiles           add column if not exists received_at timestamptz not null default now();
alter table people             add column if not exists received_at timestamptz not null default now();
alter table items              add column if not exists received_at timestamptz not null default now();
alter table flavors            add column if not exists received_at timestamptz not null default now();
alter table product_lines      add column if not exists received_at timestamptz not null default now();
alter table product_categories add column if not exists received_at timestamptz not null default now();
alter table product_types      add column if not exists received_at timestamptz not null default now();
alter table products           add column if not exists received_at timestamptz not null default now();
alter table recipes            add column if not exists received_at timestamptz not null default now();
alter table recipe_versions    add column if not exists received_at timestamptz not null default now();
alter table recipe_lines       add column if not exists received_at timestamptz not null default now();
alter table lots               add column if not exists received_at timestamptz not null default now();
alter table location_prices    add column if not exists received_at timestamptz not null default now();
alter table purchases          add column if not exists received_at timestamptz not null default now();
alter table purchase_lines     add column if not exists received_at timestamptz not null default now();
alter table orders             add column if not exists received_at timestamptz not null default now();
alter table order_lines        add column if not exists received_at timestamptz not null default now();


-- O que a coluna significa, uma vez por tabela, porque `\d items` nao le este arquivo.
-- Hora do SERVIDOR sobre a chegada DESTA VERSAO da linha: o upsert de uma correcao a move,
-- e e isso que faz a correcao descer para quem ja havia sincronizado.

comment on column carriers.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column locations.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column profiles.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column people.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column items.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column flavors.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column product_lines.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column product_categories.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column product_types.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column products.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column recipes.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column recipe_versions.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column recipe_lines.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column lots.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column location_prices.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column purchases.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column purchase_lines.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column orders.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column order_lines.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
-- O carimbo. Ele não lê tabela nenhuma — escreve dentro do `new` e devolve —, então
-- `security invoker` aqui não é escolha de cautela: é a ausência de qualquer poder a delegar.
create or replace function private.carimba_a_chegada()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  new.received_at := now();
  return new;
end;
$$;

revoke all on function private.carimba_a_chegada() from public;

comment on function private.carimba_a_chegada() is
  'Hora do servidor em received_at, no insert e na atualizacao. Na atualizacao porque cadastro '
  'desce por upsert e correcao que nao move o cursor nunca e relida; no insert porque cursor '
  'aceito do cliente deixaria a linha dele atras do cursor de todos os outros aparelhos.';

drop trigger if exists carriers_carimba_a_chegada on carriers;
create trigger carriers_carimba_a_chegada before insert or update on carriers
  for each row execute function private.carimba_a_chegada();
drop trigger if exists locations_carimba_a_chegada on locations;
create trigger locations_carimba_a_chegada before insert or update on locations
  for each row execute function private.carimba_a_chegada();
drop trigger if exists profiles_carimba_a_chegada on profiles;
create trigger profiles_carimba_a_chegada before insert or update on profiles
  for each row execute function private.carimba_a_chegada();
drop trigger if exists people_carimba_a_chegada on people;
create trigger people_carimba_a_chegada before insert or update on people
  for each row execute function private.carimba_a_chegada();
drop trigger if exists items_carimba_a_chegada on items;
create trigger items_carimba_a_chegada before insert or update on items
  for each row execute function private.carimba_a_chegada();
drop trigger if exists flavors_carimba_a_chegada on flavors;
create trigger flavors_carimba_a_chegada before insert or update on flavors
  for each row execute function private.carimba_a_chegada();
drop trigger if exists product_lines_carimba_a_chegada on product_lines;
create trigger product_lines_carimba_a_chegada before insert or update on product_lines
  for each row execute function private.carimba_a_chegada();
drop trigger if exists product_categories_carimba_a_chegada on product_categories;
create trigger product_categories_carimba_a_chegada before insert or update on product_categories
  for each row execute function private.carimba_a_chegada();
drop trigger if exists product_types_carimba_a_chegada on product_types;
create trigger product_types_carimba_a_chegada before insert or update on product_types
  for each row execute function private.carimba_a_chegada();
drop trigger if exists products_carimba_a_chegada on products;
create trigger products_carimba_a_chegada before insert or update on products
  for each row execute function private.carimba_a_chegada();
drop trigger if exists recipes_carimba_a_chegada on recipes;
create trigger recipes_carimba_a_chegada before insert or update on recipes
  for each row execute function private.carimba_a_chegada();
drop trigger if exists recipe_versions_carimba_a_chegada on recipe_versions;
create trigger recipe_versions_carimba_a_chegada before insert or update on recipe_versions
  for each row execute function private.carimba_a_chegada();
drop trigger if exists recipe_lines_carimba_a_chegada on recipe_lines;
create trigger recipe_lines_carimba_a_chegada before insert or update on recipe_lines
  for each row execute function private.carimba_a_chegada();
drop trigger if exists lots_carimba_a_chegada on lots;
create trigger lots_carimba_a_chegada before insert or update on lots
  for each row execute function private.carimba_a_chegada();
drop trigger if exists location_prices_carimba_a_chegada on location_prices;
create trigger location_prices_carimba_a_chegada before insert or update on location_prices
  for each row execute function private.carimba_a_chegada();
drop trigger if exists purchases_carimba_a_chegada on purchases;
create trigger purchases_carimba_a_chegada before insert or update on purchases
  for each row execute function private.carimba_a_chegada();
drop trigger if exists purchase_lines_carimba_a_chegada on purchase_lines;
create trigger purchase_lines_carimba_a_chegada before insert or update on purchase_lines
  for each row execute function private.carimba_a_chegada();
drop trigger if exists orders_carimba_a_chegada on orders;
create trigger orders_carimba_a_chegada before insert or update on orders
  for each row execute function private.carimba_a_chegada();
drop trigger if exists order_lines_carimba_a_chegada on order_lines;
create trigger order_lines_carimba_a_chegada before insert or update on order_lines
  for each row execute function private.carimba_a_chegada();
drop trigger if exists readings_carimba_a_chegada on readings;
create trigger readings_carimba_a_chegada before insert or update on readings
  for each row execute function private.carimba_a_chegada();
drop trigger if exists sale_price_history_carimba_a_chegada on sale_price_history;
create trigger sale_price_history_carimba_a_chegada before insert or update on sale_price_history
  for each row execute function private.carimba_a_chegada();
drop trigger if exists movements_carimba_a_chegada on movements;
create trigger movements_carimba_a_chegada before insert or update on movements
  for each row execute function private.carimba_a_chegada();
drop trigger if exists check_candidates_carimba_a_chegada on check_candidates;
create trigger check_candidates_carimba_a_chegada before insert or update on check_candidates
  for each row execute function private.carimba_a_chegada();

-- O índice que a consulta do cursor usa: `(company_id, received_at, id)`, a mesma forma da
-- `0061`. Sem ele a descida de um aparelho novo varre a tabela inteira uma vez por página.
create index if not exists carriers_received_idx           on carriers (company_id, received_at, id);
create index if not exists locations_received_idx          on locations (company_id, received_at, id);
create index if not exists profiles_received_idx           on profiles (company_id, received_at, id);
create index if not exists people_received_idx             on people (company_id, received_at, id);
create index if not exists items_received_idx              on items (company_id, received_at, id);
create index if not exists flavors_received_idx            on flavors (company_id, received_at, id);
create index if not exists product_lines_received_idx      on product_lines (company_id, received_at, id);
create index if not exists product_categories_received_idx on product_categories (company_id, received_at, id);
create index if not exists product_types_received_idx      on product_types (company_id, received_at, id);
create index if not exists products_received_idx           on products (company_id, received_at, id);
create index if not exists recipes_received_idx            on recipes (company_id, received_at, id);
create index if not exists recipe_versions_received_idx    on recipe_versions (company_id, received_at, id);
create index if not exists recipe_lines_received_idx       on recipe_lines (company_id, received_at, id);
create index if not exists lots_received_idx               on lots (company_id, received_at, id);
create index if not exists location_prices_received_idx    on location_prices (company_id, received_at, id);
create index if not exists purchases_received_idx          on purchases (company_id, received_at, id);
create index if not exists purchase_lines_received_idx     on purchase_lines (company_id, received_at, id);
create index if not exists orders_received_idx             on orders (company_id, received_at, id);
create index if not exists order_lines_received_idx        on order_lines (company_id, received_at, id);
