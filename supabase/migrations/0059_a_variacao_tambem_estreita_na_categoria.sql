-- A variação estreita na CATEGORIA também, senão a regra aprovada apaga uma trava.
--
-- A decisão do dono de 11 de setembro fixou a cadeia (Produto → Categoria → Tipo →
-- Variação) e, no mesmo dia, ele aprovou o que cada nível SIGNIFICA: categoria muda a
-- RECEITA, tipo muda tamanho ou formato, variação muda o sabor.
--
-- **E é a segunda aprovação que abre um buraco na primeira.** Pela regra nova,
-- Leite/Água/Skimo saem de "tipo" e passam a ser CATEGORIA — é o nível que muda a
-- receita. Só que a `0056` deu à variação dois alcances: a linha inteira, ou um TIPO.
-- Com Leite virando categoria e o tipo ficando vazio no picolé, "Morango só no leite"
-- passa a ser inexpressável: morango vira variação da linha e volta a ser oferecido no
-- de água — exatamente o que o dono mandou travar quando a `0055` nasceu.
--
-- Medido antes de escrever: `flavors` tem `line_id` e `type_id`, e mais nada
-- (`0056`, e `listFlavors` em `src/data/repository.ts`). Não havia por onde dizer
-- "desta categoria".
--
-- O desenho é o mesmo da `0057`, um nível acima:
--
--   * variação com `category_id` NULO       -> vale onde a linha e o tipo dela valem;
--   * variação com `category_id` preenchido -> vale só dentro daquela categoria.
--
-- A regra de aplicação, dita uma vez para não divergir: **uma variação vale num produto
-- quando todos os níveis que ela NOMEIA batem com os do produto.** O que ela deixa nulo
-- ela não exige.

alter table flavors
  add column category_id uuid;

-- `match simple` (o padrão) e não `match full`, pela cicatriz da `0058`: com
-- `match full` a chave só valida quando TODAS as colunas estão preenchidas ou todas
-- nulas, e aqui `company_id` nunca é nulo — então ela proibiria justamente o caso
-- comum, a variação sem categoria.
alter table flavors
  add constraint flavor_category_same_company
    foreign key (category_id, company_id) references product_categories (id, company_id)
    on delete cascade;

-- O nível de baixo não existe sem o de cima, e a checagem alcança SÓ a coluna nova.
--
-- `line_id` é anulável desde a `0056` e há variações órfãs legítimas da regra da `0055`
-- (sem linha, com tipo) que a tela mostra de propósito. Uma checagem que exigisse
-- `type_id is null or line_id is not null` recusaria dado que já existe — é a mesma
-- armadilha do `match full`, virada para o CHECK.
alter table flavors
  add constraint flavor_category_needs_a_line
    check (category_id is null or line_id is not null);

-- O nome é único dentro do lugar onde ele vale, e o lugar ganhou uma coordenada.
-- Sem isto, "Morango" da categoria Leite e "Morango" da linha inteira seriam a mesma
-- linha do índice e o segundo seria recusado — quando são dois alcances diferentes.
drop index if exists flavors_name_idx;

create unique index flavors_name_idx
  on flavors (
    company_id,
    coalesce(line_id::text, ''),
    coalesce(category_id::text, ''),
    coalesce(type_id::text, ''),
    lower(btrim(name))
  );

create index if not exists flavors_category_idx on flavors (company_id, category_id);
