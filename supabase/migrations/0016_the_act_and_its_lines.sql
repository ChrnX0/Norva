-- O que amarra as linhas de um mesmo ato.
--
-- Uma corrida de produção não é um movimento: é sete. Uma que faz 500 picolés
-- consumindo seis insumos escreve um `production` positivo e seis `consumption`
-- negativos — porque `movements` tem UM `item_id` e uma quantidade assinada, e
-- `stock_balances` é `sum(...) group by company_id, item_id, location_id`. Sete
-- itens numa linha só exigiriam um leitor que abre um payload, e o saldo
-- deixaria de ser uma soma.
--
-- Uma transferência é duas: saída negativa na origem, entrada positiva no
-- destino. Com uma linha só o destino não existe em consulta nenhuma —
-- fechar o saldo exigiria um UNION trocando `location_id` por
-- `counterpart_location_id` e invertendo o sinal, que é o caso especial que
-- esta fundação existe para não ter.
--
-- Sem um elo, "explique este número" seis meses depois vira arqueologia por
-- horário, e o estorno de uma corrida inteira não tem como se dizer atômico.
-- Com ele, `where movement_group_id = ?` devolve o ato completo.
--
-- Uma coluna genérica, e não uma por tipo de evento: o truque que este projeto
-- já usa — a linha de nota e o movimento dela compartilhando o mesmo id, porque
-- são um fato visto duas vezes — é 1:1 e não estica para sete linhas.
--
-- Nula nas linhas antigas, e isso é honesto: compra e contagem são atos de uma
-- linha só, e não havia grupo a que pertencer. Aditiva, sem backfill — que
-- seria impossível de qualquer jeito, porque o gatilho recusa UPDATE.
alter table movements
  add column movement_group_id uuid;

create index movements_group_idx on movements (company_id, movement_group_id)
  where movement_group_id is not null;

comment on column movements.movement_group_id is
  'As linhas de um mesmo ato: as sete de uma corrida de produção, as duas de '
  'uma transferência. Nulo quando o ato tem uma linha só.';
