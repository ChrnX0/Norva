-- O sabor pertence ao TIPO, e não à empresa inteira.
--
-- Dito pelo dono em 10 de setembro, descrevendo a fábrica do pai dele: a ordem é
-- Produto (picolé) → Tipo (leite, água, skimo) → Sabor. E o motivo de travar veio
-- junto, com o exemplo: *"mesmo q tenham sabores iguais, como morango leite e morango
-- agua, mas q usam receitas diferentes"*.
--
-- Até aqui `flavors` era da empresa, com nome único por empresa. Isso torna morango uma
-- coisa só, e aí o cadastro oferece morango de água para o de leite — que é o "confunde
-- na hora de registrar" que ele nomeou. Pior: como o nome era único na empresa, cadastrar
-- os dois morangos era IMPOSSÍVEL, não só confuso.
--
-- `type_id` entra anulável, seguindo a forma da `0018` quando ela acrescentou `line_id`
-- a `products`. Anulável aqui não é frouxidão: é que NOT NULL numa tabela que já tem
-- linhas exige um valor de origem que não existe — não há tipo certo para um sabor que
-- foi cadastrado quando tipo não era pergunta. Quem impede o sabor sem tipo é a escrita
-- (`saveFlavor`), com guarda, e a fronteira está escrita ali.

-- Alvo da chave composta abaixo. Sem ele o Postgres não aceita a referência por
-- (id, company_id), e sem ela um sabor de uma empresa poderia apontar para o tipo de
-- outra — que é a fundação multi-empresa deste projeto furada no lugar mais silencioso.
alter table product_types
  add constraint product_types_id_company_key unique (id, company_id);

alter table flavors
  add column type_id uuid;

alter table flavors
  add constraint flavor_type_same_company
    foreign key (type_id, company_id) references product_types (id, company_id)
    on delete cascade;

-- O nome deixa de ser único na empresa e passa a ser único DENTRO do tipo.
-- `coalesce` mantém o sabor sem tipo com a regra antiga, para a linha velha continuar
-- válida em vez de a migração recusar o banco de quem já usava.
drop index if exists flavors_name_idx;

create unique index flavors_name_idx
  on flavors (company_id, coalesce(type_id::text, ''), lower(btrim(name)));

create index if not exists flavors_type_idx on flavors (company_id, type_id);
