-- Quem LEVOU a carga — que não é quem carregou nem para onde ela foi.
--
-- Levantado pelo dono em 7 de setembro, junto com mais três coisas que ele
-- chamou de porte: *"a pessoa pode ter mais de uma fábrica assim como vários
-- funcionários produzindo e várias 'transportadoras' assim como as várias
-- unidades de loja e clientes"*. Medidas as quatro, esta é a única que
-- simplesmente NÃO EXISTIA: zero ocorrências de transportadora no repositório.
--
-- **Por que não é um lugar.** `location_kind` já tem `vehicle`, e o docblock das
-- espécies decide o caso vizinho com uma frase que vale aqui: *"caminhão é
-- caminho, não é sala nem destino"*. Uma transportadora é menos ainda — é uma
-- empresa com telefone. Carga em cima dela não está numa sala nossa e não chegou
-- a ninguém, então enfiá-la em `locations` faria toda consulta de saldo por lugar
-- ter de excluí-la à mão, que é como uma espécie nova vira defeito em oito
-- consultas.
--
-- **Por que ela não copia o molde de `suppliers`.** Aquela tabela está aqui desde
-- a `0002` com zero escritores e zero leitores: `purchases.supplier_id` nunca foi
-- escrito, e quem vive é o `supplier_name` que alguém digita. Cadastro sem quem
-- leia é a doença que este repositório documentou quatro vezes. Então
-- `carrier_id` entra no mesmo commit que a tela que escolhe a transportadora e a
-- tela que mostra quem levou — e não antes.
--
-- **Nulo é resposta, não ausência.** A fábrica que entrega com o carro dela não
-- tem transportadora, e obrigar um nome ali seria inventar um fato. O que a
-- coluna responde é *"foi alguém de fora, e foi este alguém"*.
create table carriers (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),

  -- O telefone é o motivo de ela atravessar para o servidor: é o número que
  -- alguém liga quando a carga não chegou, e número que mora num aparelho só
  -- some com o aparelho.
  phone      text,
  note       text,

  -- Transportadora não se apaga: ela sai de uso. O que ela levou continua no
  -- livro-razão, e um `delete` levaria a chave estrangeira do movimento com ele.
  active     boolean not null default true,
  created_at timestamptz not null default now(),

  -- O par que a chave estrangeira COMPOSTA do movimento exige. É a mesma forma
  -- que `locations` e `items` ganharam na `0019`: sem ela, uma linha poderia
  -- apontar para a transportadora de outra empresa.
  unique (id, company_id)
);

-- Duas com o mesmo nome na mesma empresa é a mesma transportadora digitada duas
-- vezes, e é assim que um relatório por transportadora passa a somar metade em
-- cada linha.
--
-- Índice e não `unique (...)` na tabela: Postgres não aceita EXPRESSÃO em
-- restrição de tabela, só em índice — e a primeira versão desta migração morreu
-- exatamente aí, no `db:verify`, com "syntax error at or near (". A `0018` já
-- tinha resolvido o mesmo caso do jeito certo (`flavors_name_idx`), e eu não fui
-- olhar como o vizinho fazia antes de escrever.
create unique index carriers_name_idx on carriers (company_id, lower(btrim(name)));

alter table carriers enable row level security;

-- As duas ajudantes moram em `private` desde a `0005`, que revogou o `execute`
-- público delas — e a `0001`, onde a forma sem prefixo ainda valia, é de onde eu
-- copiei sem conferir. Ler quem lê carga é de todo mundo: quem opera precisa saber
-- para quem ligar quando a carga não chegou. Cadastrar é de quem administra, como
-- o lugar.
create policy carriers_read on carriers
  for select using (company_id in (select private.current_companies()));

create policy carriers_manage on carriers
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));

comment on table carriers is
  'Quem levou a carga, quando não foi o carro da fábrica. Não é lugar: carga em '
  'cima de uma transportadora não está numa sala nossa nem chegou a ninguém.';

-- E a coluna no movimento, com a chave COMPOSTA — a mesma rede que a `0029`
-- montou para o lugar: sem `company_id` no par, uma carga poderia apontar para a
-- transportadora de outra empresa e o servidor aceitaria.
alter table movements
  add column carrier_id uuid,
  add constraint movements_carrier_same_company
    foreign key (carrier_id, company_id) references carriers (id, company_id);

comment on column movements.carrier_id is
  'Nulo é resposta: a fábrica que entrega com o carro dela não tem transportadora.';
