-- O aparelho reenvia a fila, e o servidor precisa aguentar isso.
--
-- Defeito encontrado no dia em que a checagem 6 parou de rodar como
-- superusuário. Enquanto ela rodava assim, RLS ficava desligada e as 45
-- escritas passavam sem que uma política fosse avaliada; sob a política, a
-- SEGUNDA passagem da mesma fila é recusada:
--
--   new row violates row-level security policy (USING expression)
--   for table "purchases"
--
-- Porque `purchases` e `purchase_lines` têm política de leitura e de INSERT, e
-- nenhuma de UPDATE - e a fila sobe com ON CONFLICT DO UPDATE. Todas as outras
-- tabelas que ela escreve têm um `_manage FOR ALL`, que cobre update; estas
-- duas ficaram de fora quando foram escritas.
--
-- E reenviar não é caso raro: é o caso normal. Sinal que cai no meio da subida,
-- aplicativo fechado antes do fim, bateria acabando na câmara fria. O aparelho
-- reenvia até ter certeza, e sem isto ele reenviaria para sempre - a fila
-- travada atrás da primeira nota, sem nada na tela explicando o quê.
--
-- Por que UPDATE e não DO NOTHING nessas duas: uma nota corrigida no aparelho
-- precisa alcançar o servidor. Com DO NOTHING a correção seria descartada em
-- silêncio, e silêncio é a única coisa pior que a recusa.
--
-- E por que isto NÃO afrouxa o livro-razão: `movements` sobe com DO NOTHING e
-- continua sem política de UPDATE. Um movimento que chega duas vezes não faz
-- nada na segunda; um movimento errado se estorna, nunca se edita. A nota é
-- documento, o movimento é fato - e só o fato é imutável.
create policy purchases_update on purchases
  for update using (private.has_capability(company_id, 'view_finance'))
  with check (private.has_capability(company_id, 'view_finance'));

create policy purchase_lines_update on purchase_lines
  for update using (private.has_capability(company_id, 'view_finance'))
  with check (private.has_capability(company_id, 'view_finance'));
