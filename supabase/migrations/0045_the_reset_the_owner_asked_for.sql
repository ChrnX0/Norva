-- O Reset que o dono pediu, do lado do servidor.
--
-- > *"coloca uma opção de Reset q passa por duas etapas de confirmações do usuário
-- > explicando isso do registro aí antes de apagar. aí fica a critério do usuário.
-- > obviamente q apenas o adm pode fazer isso."* — 7 de setembro
--
-- E o prazo: *"podem ser 10 dias corridos."* No aparelho o apagamento é imediato nos
-- três casos; o prazo é do servidor.
--
-- **Por que isto precisa de uma porta no gatilho, e por que ela é a única.** O razão é
-- append-only por gatilho de LINHA (`movements_are_immutable`, na `0001`), e a checagem
-- 1 do `db:verify` prova que `update` e `delete` são recusados até para o dono do banco.
-- Quatro caminhos foram medidos antes de abrir qualquer coisa:
--
--   `truncate`                — passa no gatilho, e é por TABELA: levaria as outras
--                               empresas junto. Serve para zerar o banco antes do
--                               lançamento, não para o Reset de uma empresa.
--   `delete from companies`   — o `on delete cascade` de `movements` dispara gatilho de
--                               linha em cascata. Recusado igual.
--   bandeira de sessão só     — `set_config` NÃO é privilegiado: qualquer conta
--                               autenticada ligaria a bandeira e o razão ficaria aberto
--                               para todo mundo. Seria trocar a tranca por um bilhete.
--   dono do banco só          — abriria o razão para toda migração distraída.
--
-- O que sobra é o PAR: a bandeira posta **e** quem executa sendo o dono da tabela. Uma
-- conta de aplicativo é `authenticated` e nunca é dona de nada, então ela não passa nem
-- pondo a bandeira; e uma migração que rode como dono sem pôr a bandeira também não
-- passa. Quem tem as duas coisas é uma função `security definer` em `private`, com o
-- `execute` revogado — ou seja, exatamente um caminho, escrito num lugar.
--
-- O gatilho continua recusando tudo o mais, com a mesma frase.

-- 1. O prazo, como configuração da empresa — os três casos que o dono nomeou.
--
-- Nulo é "nunca destrói no servidor": o livro fica fechado para sempre, que é o extremo
-- oposto do zero. Não é ausência de resposta, é uma das três.
alter table companies
  add column erase_grace_days smallint default 10
  check (erase_grace_days is null or erase_grace_days between 0 and 365);

comment on column companies.erase_grace_days is
  'Dias corridos entre o pedido de Reset e a destruição no servidor. 10 é o padrão do '
  'dono; 0 destrói no ato; NULO é "nunca destrói aqui".';

-- 2. O pedido, que é FATO e não comando.
--
-- Só `insert` para o cliente, como `sale_price_history` e como o próprio razão: pedido
-- não se reescreve nem se apaga. Desistir é outro pedido, e os dois ficam visíveis —
-- que é a mesma razão pela qual o razão se corrige por estorno.
create table erase_requests (
  -- Gerado no aparelho, para a fila poder subir duas vezes sem apagar duas vezes.
  id           uuid primary key,
  company_id   uuid not null references companies(id) on delete cascade,

  -- As cinco áreas que a tela oferece. `all` é a empresa inteira: o alcance continua
  -- sendo por área porque é o que a segunda confirmação conta, com os números.
  area         text not null check (area in ('purchases', 'recipes', 'products', 'inputs', 'all')),

  -- Quem pediu, imposto pelo servidor como em `movements.recorded_by`: uma conta não
  -- pede em nome de outra.
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),

  -- Quando vence. Calculado pelo servidor a partir do prazo da empresa, e NULO quando
  -- a empresa escolheu "nunca" — aí o pedido fica registrado e nunca executa.
  effective_at timestamptz,

  -- Quando foi executado. Nulo é "ainda não".
  done_at      timestamptz,

  -- E o alcance por área é ÚNICO enquanto está pendente: pedir duas vezes a mesma coisa
  -- não é dois Resets, é o mesmo. A fila reenviando o mesmo pedido cai no id.
  unique (id, company_id)
);

create index erase_requests_due_idx
  on erase_requests (effective_at)
  where done_at is null and effective_at is not null;

alter table erase_requests enable row level security;

create policy erase_requests_read on erase_requests
  for select using (private.has_capability(company_id, 'manage_company'));

-- Só INSERT, e com as duas amarras: a capacidade e o próprio nome. É a forma de
-- `movements`, e pelo mesmo motivo.
create policy erase_requests_ask on erase_requests
  for insert with check (
    private.has_capability(company_id, 'manage_company')
    and requested_by = auth.uid()
  );

comment on table erase_requests is
  'O pedido de Reset. Fato, não comando: sem update e sem delete — desistir é outro '
  'pedido, e os dois ficam visíveis.';

-- 3. O prazo é do SERVIDOR e não de quem pede.
--
-- `effective_at` chega do aparelho? Não. Um aparelho com a data adiantada destruiria no
-- ato o que a empresa combinou guardar por dez dias — então o servidor calcula, e
-- sobrescreve o que vier.
create or replace function private.stamp_erase_deadline()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
declare
  folga smallint;
begin
  select erase_grace_days into folga from public.companies where id = new.company_id;
  new.effective_at := case when folga is null then null else now() + (folga || ' days')::interval end;
  new.done_at := null;
  return new;
end;
$$;

drop trigger if exists erase_requests_deadline on erase_requests;
create trigger erase_requests_deadline
  before insert on erase_requests
  for each row execute function private.stamp_erase_deadline();

-- 4. A porta estreita no gatilho do razão.
--
-- O par: a bandeira posta E quem executa sendo o dono da tabela. A ordem importa por
-- desempenho — a bandeira é leitura de variável de sessão, barata, e é falsa em toda
-- operação normal; a consulta ao catálogo só acontece dentro de um Reset autorizado.
create or replace function reject_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('private.erasing', true) = 'sim'
     and current_user = (
       select tableowner from pg_tables where schemaname = 'public' and tablename = 'movements'
     )
  then
    return old;
  end if;

  raise exception
    'The ledger is append-only. Correct a movement by inserting a reversal, '
    'which keeps the original visible and the history honest.';
end;
$$;

-- 5. Quem executa o pedido vencido — e é o único lugar que abre a porta.
--
-- A ordem das tabelas é filho antes de pai, a mesma do aparelho (`src/data/erase.ts`), e
-- pelo mesmo motivo: `lots` e `order_lines` apontam para `items` com RESTRICT.
--
-- **E a lista NÃO é a mesma do aparelho.** `production_runs` existe só no SQLite —
-- copiar a lista de lá levou a primeira execução a morrer em "relation does not
-- exist". O que os dois lados têm de comum é a ordem, não o conteúdo.
create or replace function private.run_due_erases()
returns integer
language plpgsql
security definer
set search_path = private, public
as $$
declare
  pedido record;
  quantos integer := 0;
begin
  perform set_config('private.erasing', 'sim', true);

  for pedido in
    select * from public.erase_requests
     where done_at is null and effective_at is not null and effective_at <= now()
     order by requested_at
  loop
    if pedido.area in ('purchases', 'inputs', 'all') then
      delete from public.movements where company_id = pedido.company_id;
    end if;

    if pedido.area = 'all' then
      delete from public.readings           where company_id = pedido.company_id;
      delete from public.order_lines        where company_id = pedido.company_id;
      delete from public.orders             where company_id = pedido.company_id;
      delete from public.lots               where company_id = pedido.company_id;
      delete from public.purchase_lines     where company_id = pedido.company_id;
      delete from public.purchases          where company_id = pedido.company_id;
      delete from public.products           where company_id = pedido.company_id;
      delete from public.product_types      where company_id = pedido.company_id;
      delete from public.product_lines      where company_id = pedido.company_id;
      delete from public.flavors            where company_id = pedido.company_id;
      delete from public.recipe_lines       where company_id = pedido.company_id;
      delete from public.recipe_versions    where company_id = pedido.company_id;
      delete from public.recipes            where company_id = pedido.company_id;
      delete from public.sale_price_history where company_id = pedido.company_id;
      delete from public.location_prices    where company_id = pedido.company_id;
      -- O custo derivado vai com o item, e não depois dele: as duas tabelas
      -- apontam para `items`, e deixar o custo de um item que não existe mais é
      -- deixar um número sem sujeito.
      delete from public.item_cost_history  where company_id = pedido.company_id;
      delete from public.item_costs         where company_id = pedido.company_id;
      delete from public.items              where company_id = pedido.company_id;
      delete from public.carriers           where company_id = pedido.company_id;
      delete from public.locations          where company_id = pedido.company_id;
      delete from public.people             where company_id = pedido.company_id;
      delete from public.profiles           where company_id = pedido.company_id;
    elsif pedido.area = 'purchases' then
      delete from public.purchase_lines     where company_id = pedido.company_id;
      delete from public.purchases          where company_id = pedido.company_id;
      delete from public.item_cost_history  where company_id = pedido.company_id;
      delete from public.item_costs         where company_id = pedido.company_id;
    elsif pedido.area = 'recipes' then
      delete from public.recipe_lines    where company_id = pedido.company_id;
      delete from public.recipe_versions where company_id = pedido.company_id;
      delete from public.recipes         where company_id = pedido.company_id;
    elsif pedido.area = 'products' then
      delete from public.order_lines     where company_id = pedido.company_id;
      delete from public.lots            where company_id = pedido.company_id;
      delete from public.products        where company_id = pedido.company_id;
    elsif pedido.area = 'inputs' then
      delete from public.item_cost_history where company_id = pedido.company_id;
      delete from public.item_costs        where company_id = pedido.company_id;
      delete from public.items            where company_id = pedido.company_id;
    end if;

    update public.erase_requests set done_at = now() where id = pedido.id;
    quantos := quantos + 1;
  end loop;

  perform set_config('private.erasing', 'nao', true);
  return quantos;
end;
$$;

-- O `execute` sai de quem fala pela rede. É a mesma regra da `0005` e da `0039`: função
-- nova não herda revogação, então cada uma revoga a sua.
--
-- E a guarda de papel existente é a mesma da `0039`, com a razão dela: o `db:verify`
-- sobe um Postgres descartável que NÃO tem `anon` nem `authenticated`, e revogar de
-- papel que não existe é erro, não silêncio.
revoke execute on function private.run_due_erases() from public;
revoke execute on function private.stamp_erase_deadline() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function private.run_due_erases() from anon;
    revoke execute on function private.stamp_erase_deadline() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function private.run_due_erases() from authenticated;
    revoke execute on function private.stamp_erase_deadline() from authenticated;
  end if;
end
$$;

-- 6. O gatilho de TEMPO — o único passo desta migração que precisa da mão do dono.
--
-- **Sem ele o Reset nunca executa.** A função existe, o pedido vence, e nada
-- acontece: é o portão P1 deste projeto do lado do servidor, e eu só vi o buraco
-- relendo o que tinha escrito. `execute` está revogado de `anon` e `authenticated`
-- de propósito — o aplicativo NÃO pode disparar a destruição, senão o prazo de dez
-- dias seria uma sugestão —, então quem chama tem de ser o próprio banco.
--
-- `pg_cron` está disponível no projeto e **não instalado** (medido em 8 de setembro
-- pelo painel). Instalar é ato do dono num projeto que ele paga, não meu. Então o
-- agendamento entra guardado: no dia em que ele ligar a extensão, esta migração já
-- deixou o trabalho pronto; enquanto não ligar, os pedidos acumulam e **nada é
-- destruído** — que é o lado seguro de errar.
--
-- A hora não é meia-noite de propósito: todo agendador do mundo roda à meia-noite,
-- e um minuto que não é `00` também evita a fila de todos os outros.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- `cron.schedule` com nome substitui o trabalho de mesmo nome desde a 1.4, então
    -- rodar a migração duas vezes não cria dois agendamentos.
    perform cron.schedule('norva-reset-vencido', '17 3 * * *', 'select private.run_due_erases();');
  end if;
end
$$;

comment on function private.run_due_erases() is
  'Executa os pedidos de Reset vencidos. Chamada pelo agendador do banco, nunca pelo '
  'aplicativo: o prazo que a empresa escolheu não pode ser encurtado por um toque.';
