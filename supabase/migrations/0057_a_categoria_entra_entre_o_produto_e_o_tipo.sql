-- -----------------------------------------------------------------------------
-- 0057 - A categoria entra entre o produto e o tipo
--
-- Decisão do dono, 11 de setembro: *"Produto - Categoria 'a', categoria 'b',
-- categoria 'n'... Tipo 'a', tipo 'b', tipo 'n'... - Variação 'a', Variação 'b',
-- Variação 'n'... e tb o produto nao necessariamente requeira todas as
-- 'subclasses'."*
--
-- O que isso resolve, e é o que o estudo das palavras tinha travado: **"tipo"
-- carregava duas naturezas**. Leite/Água/Skimo são tipos que têm RECEITA própria;
-- 250 ml/500 ml são tipos que são só TAMANHO, com a mesma ficha. Uma palavra só
-- para as duas coisas é o que fazia a tela parecer arbitrária. Dois níveis
-- separados resolvem sem obrigar ninguém a usar os dois.
--
-- -----------------------------------------------------------------------------
-- E a `0018` RECUSOU um quarto nível, por escrito. A razão dela fica aqui:
--
--   *"Inventar um quarto nível 'tamanho' que só o pote usa deixaria o picolé com
--   uma coluna sempre vazia e a tela com uma pergunta que não se aplica."*
--
-- A objeção era certa e hoje tem resposta, construída em 11 de setembro:
-- `degraus()` (`src/components/grade.ts`) devolve lista VAZIA para um nível com
-- uma opção ou nenhuma — ele não vira pergunta na tela, ele desaparece. O que a
-- `0018` temia era a coluna vazia virar toque; sem o toque, a coluna vazia custa
-- zero a quem não a usa.
--
-- Isto não é a `0018` estar errada: é a condição dela ter passado a existir.
-- -----------------------------------------------------------------------------
--
-- Na fábrica do dono a Categoria nasce VAZIA nas duas famílias:
--
--   Picolé          -> (sem categoria) -> Leite / Água / Skimo -> Morango...
--   Pote de sorvete -> (sem categoria) -> 250 ml / 500 ml      -> Morango...
--
-- Isso é deliberado e a janela é agora: forma de esquema se adivinha de graça
-- enquanto há zero linhas, e não há uma linha gravada em servidor nenhum.
-- Acrescentar o nível depois seria migração sobre dado vivo.

create table product_categories (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- A categoria é DO produto (o que esta casa chamava de linha). Não existe
  -- categoria solta: "Sem lactose" só quer dizer alguma coisa dentro de "Picolé".
  line_id    uuid not null references product_lines(id) on delete cascade,
  name       text not null,
  sort       integer not null default 0,
  active     boolean not null default true,
  -- Alvos das chaves compostas, pelos mesmos dois motivos da `0018`: uma para
  -- provar que a categoria é desta empresa, outra para provar que o tipo e o
  -- produto apontam para uma categoria do MESMO produto.
  unique (id, company_id),
  unique (id, line_id),
  constraint product_category_line_same_company
    foreign key (line_id, company_id) references product_lines (id, company_id)
    on delete cascade
);

-- O nome é único dentro do produto, não da empresa: "Tradicional" pode existir
-- no picolé e no pote sem ser a mesma coisa. Caixa e espaço não são identidade —
-- a cicatriz dos "seis morangos no relatório" vale igual aqui.
create unique index product_categories_name_idx
  on product_categories (company_id, line_id, lower(btrim(name)));

create index product_categories_line_idx
  on product_categories (company_id, line_id) where active;

-- O TIPO passa a poder estreitar numa categoria, e continua sendo do produto.
--
-- `line_id` continua NOT NULL: tipo sem produto não existe, e isso não mudou.
-- `category_id` entra ANULÁVEL porque a categoria é opcional — é a mesma forma
-- que a `0056` deu à variação, e pelo mesmo motivo.
--
-- **E a chave é (category_id, company_id), NÃO (category_id, line_id) com `match
-- full`.** A tentação é a segunda, para o banco provar que a categoria é do mesmo
-- produto do tipo. Mas `match full` exige o par inteiro ou inteiramente nulo, e
-- aqui `line_id` NUNCA é nulo — então todo tipo sem categoria violaria a chave,
-- que é o caso comum e o que o dono pediu. Quem prova "a categoria é deste
-- produto" é a escrita (`saveType`), como já faz para a variação.
alter table product_types
  add column category_id uuid;

alter table product_types
  add constraint product_type_category_same_company
    foreign key (category_id, company_id) references product_categories (id, company_id)
    on delete cascade;

-- O nome do tipo passa a ser único dentro da categoria quando há categoria, e
-- dentro do produto quando não há. É o que deixa "500 ml" existir em duas
-- categorias do mesmo produto, e recusa "500 ml" duas vezes no mesmo lugar.
drop index if exists product_types_name_idx;

create unique index product_types_name_idx
  on product_types (
    company_id,
    line_id,
    coalesce(category_id::text, ''),
    lower(btrim(name))
  );

create index product_types_category_idx
  on product_types (company_id, category_id) where active;

-- E o produto vendido carrega o nível novo, como carrega os outros três.
alter table products
  add column category_id uuid;

alter table products
  add constraint product_category_same_company
    foreign key (category_id, company_id) references product_categories (id, company_id)
    on delete restrict;

-- A grade que impede cadastrar o mesmo produto duas vezes passa a ter quatro
-- colunas. `nulls not distinct` continua sendo o que protege a fábrica que não
-- preenche nível nenhum — sem ele, (nulo, nulo, nulo, nulo) entraria infinitas
-- vezes, e é justamente quem tem um doce só que ficaria sem guarda.
drop index if exists products_grid_idx;

create unique index products_grid_idx
  on products (company_id, line_id, category_id, type_id, flavor_id)
  nulls not distinct
  where active;

alter table product_categories enable row level security;

-- Ler é de quem está na empresa; mexer é de quem administra. Mesma divisão dos
-- outros três níveis, e pelo mesmo motivo: o operador precisa enxergar a grade
-- para escolher o que produziu, e não precisa poder criar categoria nenhuma.
create policy product_categories_read on product_categories
  for select using (company_id in (select private.current_companies()));

create policy product_categories_manage on product_categories
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));

-- **Sem `grant` aqui, e isso é medido — não esquecimento.** A primeira escrita desta
-- migração terminava com `grant … to app_user`, lembrando a cicatriz de 7 de setembro
-- ("a fila inteira é recusada por permissão"). O `db:verify` recusou em dez segundos:
-- `role "app_user" does not exist`.
--
-- O papel `app_user` é criado pelo PRÓPRIO `scripts/verify-migrations.sh`, **depois** de
-- as migrações rodarem — ele existe para que a RLS valha de verdade (dono de tabela a
-- ignora), e não é papel do servidor. `grep` por `grant` nas 57 migrações devolve zero:
-- nenhuma concede, porque no Supabase a permissão de tabela vem do papel `authenticated`,
-- e no verificador o script concede `select on all tables` depois. Tabela nova entra
-- coberta pelos dois lados sem uma linha aqui.
