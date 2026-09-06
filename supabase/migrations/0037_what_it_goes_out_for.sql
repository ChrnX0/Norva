-- Por quanto a mercadoria SAI — o preço de tabela e o combinado com cada um.
--
-- **O que esta migração NÃO faz, dito primeiro.** Ela não escreve nada no
-- livro-razão. `movements.unit_price_rate` existe desde a `0008` e continua sem
-- escritor, porque congelar preço no razão é P3 puro — linha gravada não se
-- corrige, se estorna — e depende de duas peças que ainda não existem: a venda
-- para um cliente como `kind = 'sale'`, e o ESCOPO da leitura (adiante). Aqui
-- entram só as tabelas do acordo, que são baratas e reversíveis enquanto não há
-- linha.
--
-- **Três tabelas e não duas, e a terceira é a que a refutação salvou.** A
-- primeira forma tinha só a linha corrente do acordo, sobrescrita a cada
-- renegociação. A assimetria com o custo é o ponto: `item_costs` pode ser
-- sobrescrito porque `purchase_lines` é append-only e `item_cost_history`
-- reconstrói a série a partir das notas. **Preço digitado à mão não tem fonte
-- nenhuma atrás.** Combinado a 14,50 em janeiro e renegociado a 15,80 em março,
-- janeiro deixaria de existir em qualquer tabela — e quando a loja contestar uma
-- nota de janeiro, a resposta seria o preço de março, dita com convicção. O
-- esquema se re-chaveia por migração; os meses perdidos não voltam por nenhuma.

-- 1. O preço de TABELA, no item.
--
-- Nulo é "não vendemos isto", que é o caso comum de um insumo — e é o nulo que
-- define o vendável, não a tabela em que a coluna mora. Fica em `items` e não em
-- `products` de propósito: `products` tem apagão suave e a grade de fabricação,
-- então um produto aposentado e recadastrado ganha id novo e orfanaria a história
-- de preço, enquanto `items.id` é o que `movements` segura sob `on delete
-- restrict` (0029) e não desaparece. E quem fabrica e distribui às vezes vende
-- insumo a granel para outra fábrica — caso que a chave de produto não cobre.
--
-- É `double precision` e não inteiro pela fundação da `0008`: preço por unidade é
-- TAXA. Um picolé a R$ 2,50 é 250 centavos por unidade e cabe em inteiro; polpa a
-- R$ 12,40/kg é 1,24 centavo por grama e não cabe. Só o valor final arredonda.
alter table items add column sale_price_rate double precision;

-- Zero não é preço, e o motivo é mecânico além de semântico: o aparelho congela
-- taxa com o idioma `taxa || null`, então um brinde combinado a zero entraria no
-- razão como NULL — indistinguível de "não havia preço combinado". Mercadoria dada
-- é movimento SEM preço, e é assim que ela se diz.
alter table items add constraint items_sale_price_is_a_price
  check (sale_price_rate is null or sale_price_rate > 0);

comment on column items.sale_price_rate is
  'Preco de tabela por unidade-base, como TAXA fracionaria. Nulo e "nao vendemos '
  'isto". O acordo de uma loja vence este valor (location_prices).';

-- 2. O preço COMBINADO com um lugar, que vence o de tabela.
--
-- **Tem `id` próprio, e isso não é decoração.** A fila do aparelho endereça linha
-- por um id único e o servidor confirma por `acceptedIds`; toda tabela que
-- atravessa tem `id` primário, e a única de chave composta — `item_costs` — é
-- precisamente a que o serializador se recusa a mandar, por ser derivada. Um
-- acordo digitado no escritório sem id ficaria no celular para sempre. A forma é a
-- mesma que a `0019` usou em `orders`: id primário e o par único ao lado.
create table location_prices (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  location_id uuid not null,
  item_id     uuid not null,

  -- A mesma régua do preço de tabela, pelo mesmo motivo.
  price_rate  double precision not null check (price_rate > 0),

  created_at  timestamptz not null default now(),

  -- Item e lugar de OUTRA empresa é o defeito que a `0029` fechou em `movements`,
  -- e ele reaparece em toda tabela nova que aponta para os dois. A chave composta
  -- é o que impede, e não a boa intenção de quem escreve a tela.
  constraint location_prices_place_same_company
    foreign key (location_id, company_id) references locations (id, company_id)
    on delete cascade,
  constraint location_prices_item_same_company
    foreign key (item_id, company_id) references items (id, company_id)
    on delete cascade,

  -- Um acordo por par. Dois seria a tela escolhendo um deles em silêncio.
  unique (company_id, location_id, item_id),
  unique (id, company_id)
);

create index location_prices_place_idx on location_prices (company_id, location_id);

-- 3. A história do que foi combinado — append-only, e cobre as duas.
--
-- `location_id` NULO quer dizer "o preço de tabela mudou", que é a série que a
-- primeira forma também deixava sem história. Uma tabela para as duas porque a
-- pergunta é uma só: *por quanto isto saía naquele dia*.
--
-- Sem `purchase_line_id` equivalente: não existe documento atrás de um preço
-- combinado. É por isso mesmo que a série é a única fonte — e por isso ela não
-- pode ser sobrescrita.
create table sale_price_history (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  item_id       uuid not null,
  location_id   uuid,
  previous_rate double precision,
  new_rate      double precision not null check (new_rate > 0),
  observed_at   timestamptz not null default now(),

  -- Qual CONTA registrou, imposto pelo servidor como em `movements` e `orders`.
  -- Quem estava com o aparelho é outra pergunta e não pertence a um acordo
  -- comercial: preço se combina no escritório, não na doca.
  recorded_by   uuid not null references auth.users(id),

  constraint sale_price_history_item_same_company
    foreign key (item_id, company_id) references items (id, company_id)
    on delete cascade,
  constraint sale_price_history_place_same_company
    foreign key (location_id, company_id) references locations (id, company_id)
    on delete cascade,

  -- Uma linha que não move preço nenhum é ruído, do mesmo jeito que um movimento
  -- que não move nada. Salvar sem trocar o número não vira história.
  constraint sale_price_history_moved check (previous_rate is null or previous_rate <> new_rate)
);

create index sale_price_history_idx
  on sale_price_history (company_id, item_id, observed_at desc);

alter table location_prices enable row level security;
alter table sale_price_history enable row level security;

-- **O portão da LEITURA é `manage_company`, e não `view_sale_price`.**
--
-- Isto contraria o que eu ia escrever, e a refutação estava certa: a capacidade
-- diz O QUE se pode ver, nunca QUAIS LINHAS. `src/domain/access.ts` já avisa com
-- todas as letras — *"a store manager sees the sale price of THEIR store… Scope is
-- the customer's own agreement record and the tenant policy on the server"*. Cinco
-- dos sete papéis têm `view_sale_price`: com ela como portão, o gerente da Loja
-- Norte — ou um CLIENTE — leria exatamente quanto a Loja Centro paga.
--
-- Custo não tem esse problema, porque há um custo e ninguém de fora tem outro. Por
-- isso "do mesmo jeito que o custo" era o precedente errado.
--
-- O escopo de verdade precisa de uma coluna que amarre a conta a um lugar, e
-- `memberships` (0001) não tem nenhuma. Enquanto ela não existir, quem administra a
-- empresa vê o acordo de todo mundo e mais ninguém vê o de ninguém — mais estreito
-- que o produto quer, e estreito é o lado seguro de errar. O dia em que o escopo
-- existir, esta política afrouxa numa linha.
create policy location_prices_read on location_prices
  for select using (private.has_capability(company_id, 'manage_company'));

create policy location_prices_manage on location_prices
  for all using (private.has_capability(company_id, 'manage_company'))
  with check (private.has_capability(company_id, 'manage_company'));

create policy sale_price_history_read on sale_price_history
  for select using (private.has_capability(company_id, 'manage_company'));

-- Só INSERT, e é isso que faz a história ser história.
--
-- Sem `for all`: `update` e `delete` não têm política nenhuma, e sob RLS o que não
-- tem política é negado. É a mesma forma de `movements`, e pelo mesmo motivo — o
-- que corrige uma linha errada é outra linha, nunca a borracha.
create policy sale_price_history_append on sale_price_history
  for insert with check (
    private.has_capability(company_id, 'manage_company')
    and recorded_by = auth.uid()
  );

comment on table location_prices is
  'O preco combinado com uma loja ou cliente, por item. Vence o preco de tabela '
  'do item. A historia de como ele mudou esta em sale_price_history.';

comment on table sale_price_history is
  'Append-only: por quanto cada coisa saia em cada dia. location_id nulo e o preco '
  'de tabela. E a UNICA fonte da serie - preco combinado nao tem nota atras dele.';
