-- Entrar numa empresa passa a ter dois caminhos, e um deles precisa de espera.
--
-- Decisão do dono: ele cria a empresa, e a partir daí ou cadastra as pessoas
-- diretamente, ou aprova quem pediu associação por um código da empresa.
--
-- O segundo caminho não existia no esquema, e a ausência era um buraco de
-- segurança: `memberships` não tem estado, então qualquer linha ali já vale
-- como membro. Quem descobrisse o código entraria com permissão antes de
-- alguém dizer sim.

create type membership_state as enum ('pending', 'active', 'revoked');

alter table memberships
  add column state membership_state not null default 'active';

-- Existir na tabela deixa de ser suficiente.
--
-- As duas funções abaixo são a permissão inteira deste sistema: uma diz de que
-- empresas você é, a outra diz o que você pode nela. Elas eram consultas sobre
-- *existir uma linha*. Agora são sobre existir uma linha **ativa** - e é aqui,
-- e só aqui, que "pendente" vira inofensivo. Filtrar na tela seria decoração.
create or replace function private.current_companies()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from memberships
   where user_id = auth.uid() and state = 'active';
$$;

create or replace function private.has_capability(target_company uuid, needed capability)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = target_company
      and state = 'active'
      and needed = any (capabilities)
  );
$$;

-- O código que alguém digita para pedir entrada.
--
-- Curto o bastante para ser dito em voz alta no chão de fábrica e trocável a
-- qualquer momento: quem sai da empresa não leva a porta junto. Ele não dá
-- acesso a nada sozinho - só cria um pedido, que continua `pending` até o dono
-- aprovar.
alter table companies add column join_code text unique;

-- Como se entra no aparelho do chão de fábrica.
--
-- "Depende de quem usa" vira dado, não código: uma fábrica dá um celular por
-- pessoa, outra tem um aparelho pendurado na câmara fria que passa de mão em
-- mão. Os dois caminhos existem no produto e a empresa escolhe.
--
-- O padrão é `personal` porque é o que não exige preparo nenhum: o dono instala,
-- entra, e está funcionando. Quem compartilha aparelho liga a outra opção.
create type floor_sign_in as enum ('personal', 'shared');

alter table companies
  add column floor_sign_in floor_sign_in not null default 'personal';
