-- O código de convite não tinha escritor.
--
-- A `0011` criou `companies.join_code` com um propósito escrito ao lado: é o
-- segundo caminho de entrada, o que o dono dita em voz alta para alguém pedir
-- associação. A `0040`, escrita hoje, criou a empresa e o dono numa transação —
-- e não gerou o código. Empresa nascida hoje tem `join_code` nulo, e o caminho
-- documentado simplesmente não existe.
--
-- É a mesma doença que o portão P1 deste projeto persegue no código: uma coluna
-- com índice único, com razão escrita, e nenhuma escrita. Um nível abaixo, e
-- pior — no código o compilador acaba reclamando; num esquema, ninguém reclama
-- nunca.
--
-- Migração NOVA e não edição da `0040`: editar um passo que já rodou faz o banco
-- e o arquivo divergirem em silêncio.

-- O alfabeto exclui o que se confunde ao ser DITO ou LIDO: 0/O, 1/I/L, 5/S, 2/Z.
-- Este código é falado no chão de fábrica, com barulho, para alguém digitar num
-- celular — e um código que precisa ser soletrado duas vezes é um código que a
-- pessoa desiste de usar.
create or replace function private.fresh_join_code()
returns text
language plpgsql
set search_path = private, public
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRTUVWXY346789';
  tentativa text;
  n int;
begin
  -- Vinte tentativas e desiste: com 27^6 combinações a colisão é remota, e um
  -- laço sem teto num gatilho de escrita é como se trava um banco.
  for n in 1..20 loop
    tentativa := '';
    for n in 1..6 loop
      tentativa := tentativa || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    if not exists (select 1 from public.companies where join_code = tentativa) then
      return tentativa;
    end if;
  end loop;
  raise exception 'Não foi possível gerar um código de convite.';
end;
$$;

revoke execute on function private.fresh_join_code() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function private.fresh_join_code() from anon, authenticated';
  end if;
end;
$$;

-- Quem garante é um GATILHO, e não a função de criar empresa.
--
-- A primeira versão desta migração punha a geração dentro de
-- `create_company_for_me`, e a garantia nova do `db:verify` reprovou na primeira
-- execução: sete empresas sem código. Elas entram por `insert` direto, como o
-- servidor faria numa importação ou como a verificação faz ao semear — e a
-- coluna ficava nula por qualquer caminho que não fosse aquela função.
--
-- É a doutrina da casa aplicada onde ela vale: o livro-razão é imutável por
-- gatilho e não por convenção, e o código de convite existe pelo mesmo motivo.
-- Função é um caminho; gatilho é a porta por onde todos passam.
--
-- `security definer` porque quem insere não precisa — e não tem — permissão de
-- executar a geradora: ela é revogada de `public` logo acima.
create or replace function private.stamp_join_code()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if new.join_code is null then
    new.join_code := private.fresh_join_code();
  end if;
  return new;
end;
$$;

drop trigger if exists companies_join_code on public.companies;
create trigger companies_join_code
  before insert on public.companies
  for each row execute function private.stamp_join_code();

-- A função de criar empresa continua igual à `0040` no que importa; ela não
-- precisa mais saber do código, porque o gatilho sabe.
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

-- `create or replace` guarda o ACL da função que já existia, mas a lição da
-- `0038`/`0039` custou duas migrações e fica aplicada de novo em vez de
-- assumida: revogar de `public` NÃO é revogar de `anon`.
revoke execute on function public.create_company_for_me(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.create_company_for_me(text) from anon';
    execute 'grant execute on function public.create_company_for_me(text) to authenticated';
  end if;
end;
$$;

-- E as que já nasceram sem código ganham o delas.
update companies set join_code = private.fresh_join_code() where join_code is null;
