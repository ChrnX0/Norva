-- A leitura de uma grandeza num lugar.
--
-- O dono pediu alarme de temperatura da câmara fria, disse que vai arrumar um
-- ESP32 para vendermos o módulo, lembrou que muita fábrica tem mais de uma
-- câmara, e depois somou umidade, pressão e ruído. As quatro coisas juntas
-- desenham esta tabela — e o desenho existe para que nenhuma delas peça migração
-- depois:
--
--  * `kind` e `unit` são TEXTO ABERTO. Grandeza nova e protocolo novo entram como
--    dado. Fechar num enum seria transformar "quero medir umidade também" numa
--    migração, e o custo apareceria justamente quando ele estivesse com o
--    hardware na mão.
--  * `source` também é texto: `typed`, `ble`, `wifi`, `zigbee`, `lora`. O que
--    importa para a integridade não é o rádio, é o lugar e quem gravou.
--  * `device_id` é NULO quando alguém digitou na conferência. Leitura digitada é
--    fato tanto quanto leitura de sensor, e é o único caminho que funciona hoje:
--    a fábrica passa a ter histórico antes de existir módulo, em vez de esperar
--    seis meses e começar do zero.
--  * Mais de uma câmara já estava resolvido: cada câmara é um `location`, e N
--    sensores são N `devices` apontando para lugares diferentes.
--
-- `recorded_by` é obrigatório e incedível, como em `movements`: leitura sem autor
-- é leitura que ninguém pode contestar, e o livro-razão deste app não tem linha
-- assim.
create table readings (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete restrict,
  -- O aparelho que mediu. Nulo é a leitura digitada por uma pessoa.
  device_id   uuid references devices(id) on delete set null,

  kind        text not null,
  value       numeric(14,4) not null,
  unit        text not null,

  -- Quando a medição aconteceu no mundo, não quando chegou ao servidor: um
  -- sensor sem sinal guarda a leitura e envia depois, e a hora que interessa é a
  -- da câmara.
  taken_at    timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  source      text not null default 'typed',

  -- Uma grandeza sem unidade é um número solto: 4 é geladeira boa em Celsius e
  -- freezer quebrado em Fahrenheit.
  constraint reading_has_a_unit check (length(trim(unit)) > 0),
  constraint reading_has_a_kind check (length(trim(kind)) > 0)
);

create index readings_where_idx on readings (company_id, location_id, kind, taken_at desc);

-- A faixa aceitável de cada grandeza, no próprio lugar.
--
-- Mora na linha do lugar pelo mesmo motivo que a lista de embalagem mora na do
-- produto: é curta, é reescrita inteira e não tem histórico próprio. O histórico
-- é a série de leituras, que ninguém reescreve.
alter table locations add column sensor_ranges jsonb not null default '{}'::jsonb;

alter table locations add constraint locations_sensor_ranges_is_an_object
  check (jsonb_typeof(sensor_ranges) = 'object');

alter table readings enable row level security;

-- Ler leitura é de quem lê o lugar: a temperatura da câmara não é dinheiro, e
-- quem está no chão de fábrica precisa dela mais que o escritório.
create policy readings_read on readings for select
  using (company_id in (select private.current_companies()));

-- Escrever é de quem registra estoque — a mesma capacidade da contagem, porque é
-- o mesmo gesto: alguém foi até a câmara e anotou o que viu.
create policy readings_write on readings for insert
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  );
