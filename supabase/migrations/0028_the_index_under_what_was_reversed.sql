-- O índice que faltava embaixo de "o que foi estornado não aconteceu".
--
-- A cláusula `NAO_ESTORNADO` do aplicativo é uma subconsulta correlacionada:
-- para CADA linha candidata ela pergunta se existe um movimento que a estorna.
-- Sem índice em `reverses_movement_id`, essa pergunta é uma varredura completa
-- de `movements`, e ela roda uma vez por linha. Oito consultas usam a cláusula,
-- e a capa dispara cinco delas de uma vez.
--
-- Medido contra um SQLite de 60 mil movimentos — cinco meses de uma fábrica de
-- seis lojas —, janela de sete dias, 2.779 linhas candidatas: 9.906 ms com a
-- cláusula e sem índice, 3 ms sem a cláusula, 4 ms com a cláusula e o índice.
-- O aparelho é mais lento que a máquina onde isso foi medido, então esses
-- números são o piso.
--
-- Aqui no servidor a mesma coisa vale, e por um motivo a mais: a vista
-- `movements_visible` — que é por onde o dado sai — carrega a coluna, e o dia
-- em que um relatório do lado de cá filtrar por estorno ele encontra o mesmo
-- abismo com um Postgres muito maior embaixo.
--
-- PARCIAL de propósito: só as linhas de estorno entram. Estorno é raro por
-- natureza — uma corrida corrigida por semana numa fábrica — então o índice
-- ocupa praticamente nada e continua ocupando pouco daqui a dois anos.
--
-- E `concurrently` NÃO é usado aqui de propósito: a migração roda em transação
-- pelo `supabase db push`, e `create index concurrently` é recusado dentro de
-- uma. Numa tabela de estornos — que hoje tem zero linhas em qualquer empresa —
-- o bloqueio é instantâneo.

create index if not exists movements_reversal_idx
  on movements (reverses_movement_id, company_id)
  where reverses_movement_id is not null;
