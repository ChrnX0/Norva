-- Quarta aparição da fila travada, e a forma é nova outra vez.
--
-- `ensureLocation` cria o lugar padrão da empresa no PRIMEIRO movimento de
-- qualquer aparelho — com `id = company_id`, nome vazio, `kind = 'store_room'` —
-- e o enfileira, porque ele tem que chegar ao servidor antes do movimento que se
-- apoia nele. A política que recebe essa linha é `locations_manage`, que exige
-- `manage_company`.
--
-- Só o dono tem `manage_company`. Os outros seis papéis do produto não — e o
-- `operator` é o do celular emprestado, que é decisão escrita: *"aparelho
-- emprestado entra como produção e nada mais"*. A operadora da câmara fria faz a
-- primeira produção do dia sem sinal, o aparelho grava tudo e enfileira o lugar,
-- e quando acha rede o Postgres recusa a linha. O engine para no primeiro
-- buraco de propósito, e a partir dali nada mais sobe daquele aparelho.
--
-- É a mesma família da 0015 (purchases), da 0020 (lots) e da 0027 (orders), com
-- a quarta cara: não é ausência de política nem capacidade errada no update —
-- é a linha de ESCRITURAÇÃO DO PRÓPRIO SISTEMA exigindo a capacidade de
-- administrar a empresa.
--
-- O conserto é estreito de propósito e NÃO é permissão nova. `id = company_id`
-- não é um lugar que alguém escolheu: é o único id que a empresa pode ter, e
-- `ensureLocation` é a única coisa que o escreve. Cadastrar um lugar de verdade
-- — com nome, câmara fria, loja — continua sendo de quem administra, pela
-- `locations_manage` que fica exatamente como está.
--
-- Insert e update, e não `for all`: a fila sobe com `on conflict do update`,
-- então o reenvio precisa do update — mas apagar lugar continua sendo de quem
-- administra.

create policy locations_default_room on locations
  for insert
  with check (
    id = company_id
    and (
      private.has_capability(company_id, 'record_production')
      or private.has_capability(company_id, 'adjust_stock')
      or private.has_capability(company_id, 'record_loss')
      or private.has_capability(company_id, 'dispatch')
      or private.has_capability(company_id, 'check_receipt')
    )
  );

create policy locations_default_room_resend on locations
  for update
  using (
    id = company_id
    and (
      private.has_capability(company_id, 'record_production')
      or private.has_capability(company_id, 'adjust_stock')
      or private.has_capability(company_id, 'record_loss')
      or private.has_capability(company_id, 'dispatch')
      or private.has_capability(company_id, 'check_receipt')
    )
  )
  with check (
    id = company_id
    and (
      private.has_capability(company_id, 'record_production')
      or private.has_capability(company_id, 'adjust_stock')
      or private.has_capability(company_id, 'record_loss')
      or private.has_capability(company_id, 'dispatch')
      or private.has_capability(company_id, 'check_receipt')
    )
  );
