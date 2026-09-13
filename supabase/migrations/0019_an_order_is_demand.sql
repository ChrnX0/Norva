-- -----------------------------------------------------------------------------
-- 0019 - Um pedido é demanda, e demanda não é livro-razão
--
-- O dono pediu um cartão na capa com "pedidos novos dos consumidores", e a
-- primeira decisão de desenho é a que não aparece na tela: pedido NÃO é
-- movimento.
--
-- A tentação existe e é forte, porque `movements` já tem item, quantidade,
-- lugar e data - caberia. Mas o saldo é a soma dos movimentos, e um pedido não
-- move nada: as caixas continuam na câmara fria, e alguém que confere a
-- prateleira encontra tudo o que o sistema diz que tem. Gravar demanda como
-- movimento faria o saldo mentir no dia em que o cliente ligou.
--
-- E há a segunda razão, que é a fundação: o livro-razão é append-only. Um
-- pedido MUDA - o cliente corrige a quantidade, adia a data, cancela. Corrigir
-- isso por estorno seria escrever no livro que trezentos picolés saíram e
-- voltaram, quando nenhum saiu do freezer. Estorno é para o que aconteceu.
--
-- Então: tabela própria, com `status` que se atualiza como qualquer cadastro. O
-- livro-razão só entra quando a carga sai de verdade - e isso já é a
-- transferência, que existe desde a 0001.
--
-- APROVAÇÃO É CONFIGURAÇÃO DA EMPRESA, NÃO ESCOLHA NOSSA. Uma fábrica quer que
-- todo pedido passe pelo dono; outra tem três clientes e a burocracia só atrasa
-- a entrega. Os dois caminhos existem, e quem escolhe é a empresa em
-- `orders_need_approval`. O padrão é sem aprovação, porque a fábrica de seis
-- pessoas é o caso que este produto tem na mão.
--
-- O que decide o estado inicial é o GATILHO, não a tela: um cliente que manda
-- o pedido pelo próprio aparelho não pode escolher nascer aprovado.
-- -----------------------------------------------------------------------------

-- Alvo das chaves compostas abaixo: o pedido só aponta para um lugar da própria
-- empresa, e a linha só aponta para um item dela. Sem isto a chave diz que o
-- lugar existe, não que ele é desta fábrica - e quem administra duas lê as duas.
alter table locations add constraint locations_id_company_key unique (id, company_id);
alter table items     add constraint items_id_company_key     unique (id, company_id);

alter table companies
  add column orders_need_approval boolean not null default false;

comment on column companies.orders_need_approval is
  'Se todo pedido nasce pendente à espera de quem tem approve_order. Desligado '
  'por padrão: a fábrica pequena entrega antes de a aprovação chegar.';

create table orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  -- Para quem: loja própria, cliente, distribuidor - tudo é `locations`, que é
  -- onde este sistema já guarda "lugar que recebe caixa".
  place_id      uuid not null,
  -- 'pending' só existe quando a empresa liga a aprovação. Depois dele o pedido
  -- é 'open' até virar 'delivered' ou 'cancelled'.
  status        text not null default 'open',
  -- O dia em que o cliente quer receber. A data da DECISÃO é outra e é mais
  -- cedo - quem precisa na sexta produz na quinta - e essa conta é da tela,
  -- porque ela depende do que a fábrica leva para produzir.
  requested_for date,
  note          text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  -- Qual CONTA escreveu, imposto pelo servidor como em `movements`. Quem estava
  -- com o aparelho é outra pergunta e mora no livro-razão, não aqui: um pedido
  -- é do cliente, não de quem digitou.
  recorded_by   uuid not null references auth.users(id),
  constraint orders_status_known
    check (status in ('pending', 'open', 'delivered', 'cancelled')),
  constraint order_place_same_company
    foreign key (place_id, company_id) references locations (id, company_id)
    on delete restrict,
  unique (id, company_id)
);

create table order_lines (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id   uuid not null,
  item_id    uuid not null,
  -- Na unidade base do item, como todo o resto do sistema. Zero não é pedido, e
  -- negativo é devolução - que tem caminho próprio e não é este.
  base_units integer not null check (base_units > 0),
  constraint order_line_belongs_to_its_order
    foreign key (order_id, company_id) references orders (id, company_id)
    on delete cascade,
  constraint order_line_item_same_company
    foreign key (item_id, company_id) references items (id, company_id)
    on delete restrict,
  -- O mesmo item duas vezes no mesmo pedido é erro de digitação, não pedido
  -- duplo: quem quer mais soma na linha que já existe.
  unique (order_id, item_id)
);

create index orders_open_idx on orders (company_id, requested_for)
  where status in ('pending', 'open');
create index order_lines_order_idx on order_lines (order_id);
create index order_lines_item_idx  on order_lines (company_id, item_id);

-- O estado inicial é do BANCO, não da tela.
--
-- Uma empresa que exige aprovação e um cliente que manda o pedido pelo próprio
-- aparelho é exatamente o caso em que a regra não pode morar no aplicativo: o
-- payload vem de fora, e "status" é um campo como outro qualquer no JSON.
create or replace function private.order_starts_where_the_company_says()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'cancelled' then
    select case when c.orders_need_approval then 'pending' else 'open' end
      into new.status
      from companies c
     where c.id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger orders_start_where_the_company_says
  before insert on orders
  for each row execute function private.order_starts_where_the_company_says();

-- E sair do pendente é de quem tem a permissão de aprovar - de mais ninguém.
--
-- A política de UPDATE deixa passar quem despacha, porque marcar entregue é
-- trabalho de quem carrega o caminhão. Sem este gatilho, essa mesma pessoa
-- tiraria um pedido do pendente sem nunca ter tido `approve_order`, e a
-- aprovação que a empresa ligou seria decoração.
create or replace function private.only_approval_leaves_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' and new.status <> 'cancelled' then
    if not private.has_capability(new.company_id, 'approve_order') then
      raise exception
        'Este pedido espera aprovação, e aprovar não faz parte do seu acesso.';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_leave_pending_only_by_approval
  before update on orders
  for each row execute function private.only_approval_leaves_pending();

alter table orders      enable row level security;
alter table order_lines enable row level security;

-- Ler é de quem está na empresa: o operador precisa enxergar o que foi pedido
-- para saber o que produzir, e isso não tem preço nem custo dentro.
create policy orders_read on orders for select
  using (company_id in (select private.current_companies()));
create policy order_lines_read on order_lines for select
  using (company_id in (select private.current_companies()));

-- Registrar pedido é `place_order`, que é a capacidade que existia desde a
-- fundação esperando exatamente por esta tabela.
create policy orders_place on orders for insert
  with check (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  );
create policy order_lines_place on order_lines for insert
  with check (private.has_capability(company_id, 'place_order'));

-- Mexer no que já foi pedido: quem aprova, quem despacha ou quem administra. O
-- gatilho acima é o que separa aprovar de entregar dentro dessa porta.
create policy orders_decide on orders for update
  using (
    private.has_capability(company_id, 'approve_order')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'manage_company')
  )
  with check (
    private.has_capability(company_id, 'approve_order')
    or private.has_capability(company_id, 'dispatch')
    or private.has_capability(company_id, 'manage_company')
  );

create policy order_lines_correct on order_lines for all
  using (private.has_capability(company_id, 'place_order'))
  with check (private.has_capability(company_id, 'place_order'));
