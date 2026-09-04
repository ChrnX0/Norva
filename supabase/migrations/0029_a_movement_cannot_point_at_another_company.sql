-- O livro-razão aceitava item e local de OUTRA empresa.
--
-- A política de escrita pergunta se a pessoa pode gravar NAQUELA empresa —
-- `has_capability(company_id, 'record_production')` — e ninguém perguntava se o
-- item é DAQUELA empresa. As chaves estrangeiras de `movements` eram simples:
-- `item_id references items(id)`, `location_id references locations(id)`.
--
-- Um operador cuja única associação é a empresa A conseguia inserir no razão de
-- A um movimento apontando para o item e o almoxarifado da empresa B. A linha
-- entra, o saldo de A passa a falar de um item que não é de A, e o livro-razão é
-- append-only: a linha não sai nunca mais.
--
-- E não é preciso adivinhar id nenhum. `ensureLocation` cria o lugar padrão com
-- `id = company_id`, então o id do almoxarifado de B **é** o id de B — e o id de
-- uma empresa é legível para quem esteve nela.
--
-- O padrão certo já existia nesta base, na mesma família de tabelas: a 0019 pôs
-- `unique (id, company_id)` em `items` e `locations` exatamente para o pedido
-- poder dizer `foreign key (place_id, company_id) references locations (id,
-- company_id)`. A tabela mais importante do sistema era a que não usava.
--
-- `lots` fica de fora desta migração de propósito: ele não tem `unique (id,
-- company_id)`, então a chave composta pediria um índice novo. O risco lá é
-- menor — o lote não entra em nenhuma soma de saldo, ele é identidade — e
-- misturar as duas coisas numa migração faria a parte cara atrasar a barata.
-- Fica escrito aqui para não ser redescoberto: `movements.lot_id` ainda é chave
-- simples.

alter table movements
  add constraint movement_item_same_company
  foreign key (item_id, company_id) references items (id, company_id)
  on delete restrict;

alter table movements
  add constraint movement_location_same_company
  foreign key (location_id, company_id) references locations (id, company_id)
  on delete restrict;

-- A contraparte é anulável — nem todo movimento tem outro lado —, e a chave
-- composta respeita isso: em Postgres, uma chave estrangeira multicoluna com
-- qualquer coluna nula não é verificada (MATCH SIMPLE, que é o padrão). O que
-- ela impede é o caso que importa: contraparte preenchida apontando para fora.
alter table movements
  add constraint movement_counterpart_same_company
  foreign key (counterpart_location_id, company_id) references locations (id, company_id)
  on delete restrict;
