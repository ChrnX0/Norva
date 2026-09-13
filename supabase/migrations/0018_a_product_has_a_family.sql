-- -----------------------------------------------------------------------------
-- 0018 - Um produto tem família, tipo e sabor
--
-- Até aqui um produto era um nome plano: "Picolé tradicional de morango" era uma
-- string, e o sistema não sabia que ela tinha três partes. Isso custava três
-- coisas ao mesmo tempo: cadastrar sessenta produtos era digitar sessenta nomes
-- inteiros, nenhum relatório podia somar por sabor ou por linha, e a tela de
-- produção não tinha o que perguntar antes do tacho - por isso ela pedia tacho
-- primeiro, que é a conta do meio e não a coisa que a pessoa acabou de fazer.
--
-- Três níveis cobrem os dois casos que a fábrica tem hoje, e é o mesmo desenho
-- nos dois:
--
--   Picolé          -> Tradicional / Skimó / Top     -> Morango / Chocolate
--   Pote de sorvete -> 240 ml / 500 ml / 1 litro     -> Morango / Chocolate
--
-- O tamanho do pote é o tipo dele. Não é coincidência: o segundo nível é o que
-- divide a linha antes do sabor, e para o pote isso é o volume. Inventar um
-- quarto nível "tamanho" que só o pote usa deixaria o picolé com uma coluna
-- sempre vazia e a tela com uma pergunta que não se aplica.
--
-- Os três níveis são OPCIONAIS, e isso é a fundação do "depende vira dado": uma
-- fábrica que faz um doce só não deve ser obrigada a inventar uma linha e um
-- tipo para cadastrá-lo. Quem tem um nível só preenche um nível só.
--
-- O sabor é da empresa, não do tipo. Morango é o mesmo morango no picolé e no
-- pote; amarrá-lo ao tipo faria o dono cadastrar "morango" uma vez por tipo, e
-- na primeira mudança de nome ele teria seis morangos diferentes no relatório.
-- -----------------------------------------------------------------------------

create table product_lines (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  active     boolean not null default true,
  -- Alvo das chaves compostas: o tipo e o produto só apontam para uma linha da
  -- própria empresa. Sem isto a chave só diz que a linha existe, não que ela é
  -- desta fábrica - e o dono que administra duas fábricas lê as duas.
  unique (id, company_id)
);

-- Caixa e espaço não são identidade. "Morango", "morango" e "Morango " são a
-- mesma coisa para quem digita, e a unique de texto cru deixaria as três
-- entrarem - que é exatamente o "seis morangos no relatório" que este desenho
-- existe para impedir.
create unique index product_lines_name_idx
  on product_lines (company_id, lower(btrim(name)));

create table product_types (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  line_id    uuid not null references product_lines(id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  active     boolean not null default true,
  -- Alvo da chave composta lá embaixo: é o que faz o banco recusar um produto
  -- cuja linha não é a linha do tipo dele. Sem isto a checagem viveria na tela,
  -- e a tela é decoração - o dado errado entraria por qualquer outro caminho.
  unique (id, line_id),
  constraint product_type_line_same_company
    foreign key (line_id, company_id) references product_lines (id, company_id)
    on delete cascade
);

create unique index product_types_name_idx
  on product_types (company_id, line_id, lower(btrim(name)));

create table flavors (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  active     boolean not null default true,
  unique (id, company_id)
);

create unique index flavors_name_idx
  on flavors (company_id, lower(btrim(name)));

alter table products
  add column line_id   uuid,
  add column type_id   uuid,
  add column flavor_id uuid;

alter table products
  add constraint product_line_same_company
    foreign key (line_id, company_id) references product_lines (id, company_id)
    on delete restrict,
  add constraint product_flavor_same_company
    foreign key (flavor_id, company_id) references flavors (id, company_id)
    on delete restrict;

-- Tipo sem linha não existe, e tipo de outra linha muito menos: "Picolé 500 ml"
-- é um erro de cadastro que o banco tem que recusar, não a tela.
--
-- `match full` e não o padrão, e a diferença é o desenho inteiro: MATCH SIMPLE
-- desliga a checagem quando QUALQUER coluna do par é nula, e nulo é o estado
-- normal aqui - os três níveis são opcionais. Com o padrão, um produto com
-- linha nula aceitaria qualquer type_id, inclusive um que não existe em lugar
-- nenhum. `match full` exige que o par esteja inteiro ou inteiramente nulo, que
-- é exatamente a regra: ou você não classificou, ou classificou os dois.
alter table products
  add constraint product_type_belongs_to_its_line
    foreign key (type_id, line_id) references product_types (id, line_id)
    match full
    on delete restrict;

-- E o mesmo produto não se cadastra duas vezes.
--
-- `nulls not distinct` é o que faz isto valer para a fábrica de um doce só: no
-- padrão do Postgres dois nulos não colidem, então (nulo, nulo, nulo) entraria
-- infinitas vezes - justamente a fábrica que não preencheu nível nenhum ficaria
-- sem a proteção. Aqui nulo é um valor como outro qualquer.
create unique index products_grid_idx
  on products (company_id, line_id, type_id, flavor_id)
  nulls not distinct
  where active;

create index product_lines_company_idx on product_lines (company_id) where active;
create index product_types_line_idx    on product_types (company_id, line_id) where active;
create index flavors_company_idx       on flavors (company_id) where active;
create index products_flavor_idx       on products (company_id, flavor_id) where active;

alter table product_lines enable row level security;
alter table product_types enable row level security;
alter table flavors       enable row level security;

-- Ler é de quem está na empresa; mexer é de quem administra. Mesma divisão dos
-- produtos, porque isto é cadastro de produto: o operador precisa enxergar a
-- grade para escolher o que produziu, e não precisa poder criar sabor nenhum.
create policy product_lines_read on product_lines for select using (company_id in (select private.current_companies()));
create policy product_types_read on product_types for select using (company_id in (select private.current_companies()));
create policy flavors_read       on flavors       for select using (company_id in (select private.current_companies()));

create policy product_lines_manage on product_lines for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
create policy product_types_manage on product_types for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
create policy flavors_manage       on flavors       for all using (private.has_capability(company_id, 'manage_company')) with check (private.has_capability(company_id, 'manage_company'));
