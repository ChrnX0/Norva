-- O dono não conseguia criar a própria empresa, e isso só apareceu ao ir usar.
--
-- Medido em 6 de setembro, com o servidor no ar e as 39 aplicadas. A decisão do
-- dono é escrita e antiga: *"quem cria a empresa é o dono, cadastrando-se
-- sozinho"*. O esquema não permitia:
--
--   * `companies` tem `companies_read` (select) e `companies_write` (update).
--     **Não tem política de INSERT.** Com RLS ligada e sem política, insert é
--     recusado — sempre, para todo mundo.
--   * `memberships_manage` exige `has_capability(company_id, 'manage_company')`,
--     que por sua vez exige uma linha ATIVA em `memberships`. Para criar a
--     primeira associação é preciso já tê-la.
--
-- Duas portas trancadas por dentro, e a chave de cada uma do outro lado. Nenhuma
-- tela consertaria isso: a recusa é do banco, e é ele que tem de saber abrir.
--
-- **Por que uma função e não uma política de INSERT.** Uma política em
-- `companies` abriria a criação de empresa para qualquer conta autenticada, o
-- que está certo — mas deixaria a associação do dono como um segundo passo
-- separado, e entre os dois existe o instante em que a empresa não tem dono.
-- Uma conta que caísse ali criaria uma empresa órfã, invisível para ela mesma
-- (porque `companies_read` filtra por associação ativa) e impossível de apagar.
-- A função faz as duas numa transação: ou nasce empresa com dono, ou não nasce.
--
-- **`security definer` com `search_path` fixo**, como as duas da fundação: ela
-- precisa escrever onde o chamador não pode, e por isso não pode aceitar nada
-- que o chamador escolha além do nome. O `user_id` sai de `auth.uid()` e não de
-- um argumento — quem chama não diz de quem é a empresa.
--
-- **E ela recusa quem não está logado.** `auth.uid()` nulo levanta, em vez de
-- criar empresa sem dono: o defeito que a transação existe para impedir não pode
-- voltar pela porta da frente.
-- **E o linter vai acusar esta função, de propósito.** Ele avisa que uma função
-- `security definer` é chamável por `authenticated` — que é exatamente o que
-- esta precisa ser: ela É a porta por onde o dono entra, e uma porta que ninguém
-- pode abrir não é porta. O aviso fica, com esta razão ao lado, para a próxima
-- leitura não "consertar" a única coisa que faz o cadastro existir. O que NÃO
-- pode aparecer nessa lista é `anon`, e o bloco de permissões abaixo garante.
create or replace function public.create_company_for_me(company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  who    uuid := auth.uid();
  fresh  uuid;
begin
  if who is null then
    raise exception 'Só uma conta autenticada cria uma empresa.';
  end if;

  if company_name is null or length(btrim(company_name)) = 0 then
    raise exception 'A empresa precisa de um nome.';
  end if;

  insert into companies (name) values (btrim(company_name)) returning id into fresh;

  -- O dono nasce com tudo, e isso é a decisão escrita: ele é quem distribui
  -- acesso depois, criando outras contas ou aprovando quem pediu por código.
  -- `state` é `active` pelo padrão da 0011 — quem cria não espera aprovação de
  -- ninguém.
  insert into memberships (company_id, user_id, display_name, capabilities)
  values (
    fresh,
    who,
    coalesce(nullif(btrim((auth.jwt() ->> 'email')), ''), 'Dono'),
    enum_range(null::capability)
  );

  return fresh;
end;
$$;

-- A mesma dobradinha da 0005, e desta vez com a lição da 0039 aplicada de
-- primeira: revogar de `public` NÃO revoga de `anon`, que é concessão nominal da
-- Supabase. As duas linhas, e a guarda porque o Postgres do `db:verify` não tem
-- esses papéis.
revoke execute on function public.create_company_for_me(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.create_company_for_me(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.create_company_for_me(text) to authenticated;
  end if;
end
$$;

comment on function public.create_company_for_me(text) is
  'Cria a empresa e a associação do dono na mesma transação. Existe porque companies não tem política de INSERT e memberships exige uma associação que ainda não há: duas portas trancadas por dentro.';
