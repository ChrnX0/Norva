-- Gente da empresa, que não é conta de autenticação.
--
-- **A contradição, dita antes do conserto.** A `0014` criou
-- `movements.operator_id` referenciando `memberships(id)`, e `memberships.user_id`
-- é `not null references auth.users(id)`. Lido junto: toda pessoa que o sistema
-- consegue NOMEAR precisa de uma conta de login.
--
-- Isso contraria a decisão do dono que a própria `0014` cita no topo — *"o login
-- autentica o sistema, não a pessoa"*. Quem entra pela grade de nomes com PIN, na
-- câmara fria, de luva, no celular compartilhado da empresa, não tem conta
-- nenhuma e nunca vai ter: o aparelho está logado com a conta DA EMPRESA, e quem
-- está com ele na mão é uma anotação do registro, escolhida na hora.
--
-- `devices.responsible_id` (0013) tem o mesmo defeito pelo mesmo motivo, e a
-- decisão escrita é explícita: *"o movimento aponta para o aparelho, o aparelho
-- aponta para uma pessoa"*. Pessoa, não conta.
--
-- **Por que agora, e por que é de graça.** Nada escreve `operator_id`: a coluna
-- viaja pela sincronia e nenhum caminho do aparelho a preenche — `more.tsx` já
-- registrava a lacuna com todas as letras, *"coluna sem tabela de gente atrás"*.
-- E não há um único movimento gravado em servidor nenhum, porque não há servidor
-- provisionado. Vocabulário de livro-razão só é livre para mudar enquanto não há
-- linha gravada com ele, e essa janela está aberta exatamente hoje.
--
-- **O que cada tabela passa a ser, sem sobreposição:**
--
--   `memberships` - uma CONTA que alcança a empresa. Continua exigindo
--                   `auth.users`, continua sendo o que o RLS consulta, continua
--                   sendo quem `recorded_by` aponta. Não muda nada.
--   `people`      - uma PESSOA que trabalha ali. Tem nome e perfil, e não tem
--                   login. É ela que a grade mostra e que `operator_id` aponta.
--
-- Uma pessoa PODE ter conta (o dono tem), e a ligação entre as duas entra no
-- commit que precisar dela — coluna sem escritor é a doença que este repositório
-- documentou em quatro lugares.

-- O perfil: um pacote de permissões com nome, que a empresa monta.
--
-- Os sete papéis do produto (`src/domain/access.ts`) entram como MODELOS, não
-- como lista fechada — decisão do dono. Cada empresa tem um organograma
-- diferente: uma tem comprador que também aprova, outra separa os dois. Com
-- perfil como dado isso é configuração; com papel chumbado é release.
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,

  -- NULO enquanto ninguém renomeou, e isso é o mesmo desenho do lugar padrão:
  -- "Entregador" é uma palavra em três idiomas, e essa palavra é da tela. Quem
  -- guarda o fato é `template_role`; quem fala português é quem desenha.
  --
  -- Nulo e não string vazia por uma razão mecânica: os sete semeados nascem sem
  -- nome, e sete strings vazias colidiriam no par único abaixo. Nulo não colide
  -- com nulo, que é exatamente a semântica que se quer aqui — "ainda não tem
  -- nome próprio" não é um nome repetido.
  name         text,
  template_role text,

  capabilities capability[] not null default '{}',
  created_at   timestamptz not null default now(),

  -- Dois perfis com o mesmo nome é a lista de escolha mentindo para quem
  -- escolhe: a tela mostra "Entregador" duas vezes e ninguém sabe qual marcar.
  -- E um perfil ou tem nome próprio ou é um dos sete modelos: nunca os dois,
  -- nunca nenhum, senão a tela não sabe o que escrever na linha.
  unique (company_id, name),
  unique (company_id, template_role),
  constraint profiles_named_once check ((name is null) <> (template_role is null))
);

alter table profiles enable row level security;

create policy profiles_read on profiles
  for select using (company_id in (select private.current_companies()));

create policy profiles_manage on profiles
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));

-- A pessoa.
create table people (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,

  -- `restrict`: apagar um perfil que alguém veste deixaria a pessoa sem
  -- permissão nenhuma em silêncio. Tira-se a pessoa do perfil primeiro.
  profile_id  uuid not null references profiles(id) on delete restrict,

  -- Gente não se apaga, pelo mesmo motivo que aparelho não se apaga: some da
  -- grade e o histórico continua apontando para ela. Movimento cujo operador
  -- sumiu é movimento que não se pode explicar.
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  -- A grade mostra NOMES, e dois nomes iguais numa grade são inúteis: quem está
  -- de luva toca em um dos dois sem ter como saber qual.
  unique (company_id, name)
);

alter table people enable row level security;

create policy people_read on people
  for select using (company_id in (select private.current_companies()));

create policy people_manage on people
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));

create index people_company_idx on people (company_id) where active;

-- E as duas colunas passam a apontar para gente.
--
-- `restrict` nas duas, como estava: o razão recusa UPDATE por gatilho, então
-- qualquer cascata que zerasse a coluna seria recusada de qualquer jeito.
alter table movements drop constraint movements_operator_id_fkey;
alter table movements add constraint movements_operator_is_a_person
  foreign key (operator_id) references people(id) on delete restrict;

alter table devices drop constraint devices_responsible_id_fkey;
alter table devices add constraint devices_responsible_is_a_person
  foreign key (responsible_id) references people(id) on delete set null;

comment on column movements.operator_id is
  'Quem estava com o aparelho quando a linha foi escrita - uma PESSOA, que pode '
  'não ter conta. Diferente de recorded_by, que é a conta que escreveu.';
