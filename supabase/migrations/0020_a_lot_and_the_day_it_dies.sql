-- A validade mora no produto, e o lote é quem a carrega.
--
-- `lots` existe desde a primeira migração, com `code`, `produced_on`,
-- `expires_on` e um índice dedicado em `movements (company_id, lot_id)`. Nunca
-- teve um escritor: é a mesma peça pronta e sem chamador que o
-- `assistant_phrase` era, e a Fase 2 vem justamente buscá-la.
--
-- O que faltava para a produção conseguir preencher `expires_on` sozinha era o
-- prazo — e ele é do PRODUTO, não da corrida. Quem está de luva no tacho não
-- sabe de cabeça que o picolé dura seis meses e o pote três; o cadastro sabe,
-- respondeu uma vez, e a partir daí toda corrida nasce com a data pronta.
-- Perguntar a validade a cada tacho é pedir o que o sistema já pode deduzir.
--
-- Nulo é resposta válida e significa "não vence": sorvete a granel para uso
-- interno, embalagem, insumo de prateleira. O lote continua existindo e
-- continua rastreando — o que ele não carrega é uma data inventada, que seria
-- pior que nenhuma nos dois sentidos (descartar mercadoria boa, vender
-- mercadoria vencida).

alter table products
  add column shelf_life_days integer
  check (shelf_life_days is null or shelf_life_days > 0);

comment on column products.shelf_life_days is
  'Quantos dias o produto dura depois de feito. Nulo: não vence.';

-- E o lote precisa poder ser REENVIADO, não só enviado.
--
-- `lots_write` existe desde a primeira migração e cobre `insert`. A fila do
-- aparelho sobe com `on conflict (id) do update`, porque reenviar não é caso
-- raro: é o caso normal de um celular que perdeu sinal no meio do envio, ou que
-- foi fechado antes de terminar. Sem política de update, a segunda tentativa é
-- recusada e a fila trava atrás dela.
--
-- É exatamente o defeito que a migração 0015 consertou para `purchases` e
-- `purchase_lines` — e ele estava aqui esperando desde o dia em que a tabela
-- foi criada, porque nada escrevia lote até agora. Peça sem escritor não é peça
-- pronta: é peça não exercitada.

create policy lots_resend on lots
  for update using (private.has_capability(company_id, 'record_production'))
  with check (private.has_capability(company_id, 'record_production'));
