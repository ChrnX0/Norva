-- O aparelho vira coisa cadastrada, com um responsável.
--
-- Decisão do dono, e ela resolve uma tensão que parecia insolúvel. O tom de voz
-- manda nunca culpar pessoa, e a cadeia de custódia existe para LOCALIZAR a
-- perda - então o relatório fala de onde, não de quem. Mas "onde" sozinho não
-- responde por nada: uma câmara fria não assina.
--
-- A resposta dele: **o aparelho tem responsável cadastrado.** O movimento
-- aponta para o aparelho, o aparelho aponta para uma pessoa, e a
-- responsabilidade existe sem que o relatório precise nomear ninguém a cada
-- caixa. Quem quiser nomear liga `companies.names_who_recorded`.
--
-- E resolve o caso que ele levantou junto: aparelho emprestado. Se o celular é
-- da empresa e passa de mão, quem está com ele entra numa conta de produção -
-- o papel `operator`, que não vê custo, nem preço, nem dinheiro. O aparelho
-- continua respondendo; o emprestado não ganha acesso que não é dele.

create table devices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,

  -- Como as pessoas o chamam: "o celular da câmara", "o tablet da expedição".
  name           text not null,

  -- Quem responde por ele. `set null` e não `restrict`: quando a pessoa sai da
  -- empresa o aparelho continua existindo, agora sem dono - o que é exatamente
  -- a pergunta que o dono precisa ver na tela.
  responsible_id uuid references memberships(id) on delete set null,

  -- Onde ele costuma ficar, para pré-preencher o movimento em vez de perguntar.
  location_id    uuid references locations(id) on delete restrict,

  -- Aparelho não se apaga: some da lista e o histórico continua apontando para
  -- ele. Um movimento cuja origem sumiu é um movimento que não se pode
  -- explicar.
  active         boolean not null default true,
  created_at     timestamptz not null default now(),

  unique (company_id, name)
);

create index devices_company_idx on devices (company_id) where active;

alter table devices enable row level security;

create policy devices_read on devices
  for select using (company_id in (select private.current_companies()));

create policy devices_manage on devices
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));

-- De qual aparelho o movimento veio.
--
-- `restrict` de propósito, e não `set null`: o livro-razão recusa UPDATE por
-- gatilho, então uma exclusão em cascata que zerasse esta coluna seria recusada
-- de qualquer jeito - e apagar a origem de um movimento é perder a única coisa
-- que torna "onde" responsável por alguma coisa.
--
-- Nulo nas linhas antigas, e isso é honesto: elas foram gravadas antes de
-- existir aparelho cadastrado, e inventar um agora seria escrever história que
-- não aconteceu.
alter table movements
  add column device_id uuid references devices(id) on delete restrict;

create index movements_device_idx on movements (company_id, device_id)
  where device_id is not null;
