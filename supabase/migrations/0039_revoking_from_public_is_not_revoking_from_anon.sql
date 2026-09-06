-- A 0038 revogou do papel errado, e o servidor disse isso na cara.
--
-- Ela escreveu `revoke execute ... from public`, que é o que a 0005 fez e
-- funcionou. Rodou sem erro, e o linter continuou acusando. A medida, em vez do
-- palpite:
--
--   apply_production_to_cost  postgres=X  anon=X  authenticated=X  service_role=X
--   apply_purchase_to_cost    postgres=X                          service_role=X
--
-- `anon` e `authenticated` não estão ali por herança de `PUBLIC`: são
-- concessões EXPLÍCITAS, que a Supabase dá por privilégio padrão a toda função
-- nova em `public`. Revogar de `PUBLIC` não remove uma concessão nominal — são
-- linhas diferentes na mesma ACL, e a que estava aberta era a nominal.
--
-- A 0005 funcionou por um motivo que não vale aqui: a 0006 mudou aquelas duas
-- funções para o esquema `private`, e `private` não está exposto pelo PostgREST.
-- Quem estava protegido estava por MUDANÇA DE CASA, não pela revogação.
--
-- Esta migração existe em vez de a 0038 ser corrigida porque migração é
-- append-only: um passo que já rodou no servidor não se edita, e o arquivo que
-- diverge do banco em silêncio é o defeito que essa regra existe para impedir.
-- A 0038 fica como está, com a razão dela errada e esta linha ao lado.
-- E o `do $$ ... $$` não é enfeite: é o mesmo idioma da 0005, e existe porque o
-- `db:verify` sobe um Postgres descartável que **não tem** `anon` nem
-- `authenticated` — lá o papel sem dono de tabela chama-se `app_user`. Sem a
-- guarda, esta migração passaria no servidor e derrubaria a verificação local,
-- que é o pior dos dois mundos: verde onde ninguém olha e vermelho onde todo
-- mundo olha.
--
-- *Nota honesta:* o que rodou no servidor foi a linha crua, sem esta guarda,
-- antes de eu ver que ela quebraria o `db:verify`. O efeito é idêntico onde os
-- papéis existem — a guarda só decide se a instrução é tentada —, e por isso o
-- arquivo pode carregá-la sem divergir do banco. Fica dito em vez de descoberto.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.apply_production_to_cost() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.apply_production_to_cost() from authenticated;
  end if;
end
$$;
