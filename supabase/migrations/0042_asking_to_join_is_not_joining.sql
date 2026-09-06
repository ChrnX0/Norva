-- Pedir para entrar não é entrar.
--
-- A `0011` desenhou os dois caminhos que o dono decidiu: ele cadastra a pessoa
-- diretamente, **ou** aprova quem pediu associação por um código da empresa. O
-- estado `pending` existe desde lá e a `0041` fez o código existir de verdade.
-- O que nunca existiu foi o caminho de QUEM PEDE.
--
-- E ele não podia existir como `insert` do aplicativo, por desenho da permissão
-- e não por falta de política: quem ainda não é membro **não enxerga a empresa**
-- (`companies_read` filtra por associação ativa) e portanto não tem como
-- descobrir o `company_id` a partir do código. Também não pode escrever em
-- `memberships`, porque `memberships_manage` exige `manage_company`, que exige
-- já ser membro ativo. As duas portas estão trancadas por dentro — a mesma forma
-- do problema que a `0040` resolveu para o dono, agora do lado de fora.
--
-- Então a chave é uma função `security definer`, e ela é estreita de propósito:
-- recebe um código, devolve o nome da empresa, e a única coisa que escreve é uma
-- linha PENDENTE sem capacidade nenhuma. Aprovar continua sendo ato de quem tem
-- `manage_company`, pela política que já existe.

create or replace function public.request_to_join(code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  who      uuid := auth.uid();
  alvo     uuid;
  nome     text;
  atual    membership_state;
begin
  if who is null then
    raise exception 'Só uma conta autenticada pede associação.';
  end if;

  -- Em caixa alta e sem espaço: o código é DITADO em voz alta e digitado por
  -- alguém de luva. Recusar por causa de um espaço colado ou de uma minúscula
  -- seria transformar um acerto em erro.
  select id, name into alvo, nome
    from companies
   where join_code = upper(btrim(code));

  if alvo is null then
    raise exception 'Código não confere.';
  end if;

  -- Já pediu, ou já entrou: a resposta é a mesma e nada é reescrito. Pedir duas
  -- vezes é o caso normal — a pessoa não vê nada acontecer e tenta de novo —, e
  -- um segundo pedido que apagasse o primeiro devolveria ao fim da fila quem já
  -- estava nela. Pior: se ela já FOR membro ativo, reescrever a linha a
  -- rebaixaria para pendente e a tiraria do sistema.
  select state into atual from memberships where company_id = alvo and user_id = who;
  if atual is not null then
    return nome;
  end if;

  insert into memberships (company_id, user_id, display_name, capabilities, state)
  values (
    alvo,
    who,
    coalesce(nullif(btrim((auth.jwt() ->> 'email')), ''), 'Sem nome'),
    '{}',                                     -- nenhuma capacidade até alguém dizer sim
    'pending'
  );

  return nome;
end;
$$;

-- A lição da 0038/0039 aplicada de novo em vez de assumida: revogar de `public`
-- NÃO é revogar de `anon`. E aqui a diferença importa mais que nas outras — uma
-- conta anônima com esta função na mão poderia varrer códigos.
revoke execute on function public.request_to_join(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.request_to_join(text) from anon';
    execute 'grant execute on function public.request_to_join(text) to authenticated';
  end if;
end;
$$;
