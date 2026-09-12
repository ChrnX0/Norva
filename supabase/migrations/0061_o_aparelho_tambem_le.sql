-- A sincronia era de MÃO ÚNICA, e é isso que impede dois celulares da mesma fábrica
-- terem o mesmo saldo.
--
-- Tudo o que existe hoje sobe: `src/sync/engine.ts` drena a fila, `transporte.ts` escreve
-- linha por linha, e nada nunca desce. O efeito não é sutil — é a fundação deste projeto
-- valendo pela metade. O saldo é a soma dos movimentos, e cada aparelho soma só os que ele
-- mesmo gravou: a gerente da loja conta a câmara pelo celular dela e o dono, no dele, vê o
-- estoque de antes da contagem. Os dois estão "certos" sobre um livro-razão diferente.
--
-- E ela bloqueia uma decisão do dono, escrita em 11 de setembro: *"assim que sincronizarem,
-- uma mensagem aparece dizendo que tem duplicação, mostra os dados para os DOIS celulares, e
-- o primeiro que aceitar fica"*. Sem descida, o segundo celular não tem como ver o que o
-- primeiro gravou — a promessa não tem chão.
--
-- ## O que esta migração acrescenta, e por que ela é necessária
--
-- Descer pede um CURSOR: "me dê o que chegou depois do que eu já tenho". E o servidor não
-- tem hoje uma hora própria para ordenar por ela.
--
--   * `occurred_at` é quando o fato aconteceu no mundo, e chega fora de ordem de propósito —
--     a nota de terça digitada na quinta;
--   * `recorded_at` é quando o APARELHO soube, e vem do aparelho (`src/sync/serialize.ts`):
--     dois celulares com relógios diferentes embaralham a ordem, e um relógio atrasado faz
--     linhas nascerem ANTES do cursor de quem já sincronizou — invisíveis para sempre.
--
-- `received_at default now()` é a hora do SERVIDOR, carimbada na entrada. Ela é monótona por
-- construção dentro de um servidor só, que é a única propriedade que um cursor precisa.
--
-- **Só nas três tabelas append-only que descem.** Cadastro (`items`, `people`, `locations`,
-- `recipes`…) desce por outro caminho — upsert, última palavra vence — e para isso
-- `updated_at` já serve. Aqui o que importa é nunca perder uma linha do razão, e por isso a
-- ordem tem de vir de um relógio só.
--
-- **O desempate é o `id`.** Duas linhas podem receber o mesmo `now()` dentro da mesma
-- transação — é o caso normal de uma fila subindo em lote. O índice é `(company_id,
-- received_at, id)` e o cursor do aparelho guarda o par, senão a segunda linha do lote fica
-- do lado errado do "maior que" e some.
--
-- **Por que `not null default now()` e não `default now()` apenas.** Linha do razão sem hora
-- de chegada é linha que nenhum cursor alcança: ela não é maior que nada. O padrão preenche
-- as que já existem, e o `not null` impede a próxima nascer órfã.
--
-- Não há `update` aqui, e é de propósito: `received_at` é fato do servidor sobre a chegada, e
-- corrigi-lo seria mentir sobre quando ele soube. As três tabelas já são `APENAS_INSERE` no
-- serializador do aparelho.

alter table movements add column if not exists received_at timestamptz not null default now();
alter table readings add column if not exists received_at timestamptz not null default now();
alter table sale_price_history
  add column if not exists received_at timestamptz not null default now();

comment on column movements.received_at is
  'Hora do SERVIDOR na chegada. É o cursor da descida: occurred_at chega fora de ordem e '
  'recorded_at vem do aparelho, então nenhum dos dois ordena o que dois celulares mandaram.';
comment on column readings.received_at is
  'Hora do servidor na chegada — o cursor da descida. Ver movements.received_at.';
comment on column sale_price_history.received_at is
  'Hora do servidor na chegada — o cursor da descida. Ver movements.received_at.';

create index if not exists movements_received_idx
  on movements (company_id, received_at, id);
create index if not exists readings_received_idx
  on readings (company_id, received_at, id);
create index if not exists sale_price_history_received_idx
  on sale_price_history (company_id, received_at, id);

-- ## E a view por onde o razão desce estava incompleta para descer
--
-- `movements_visible` existe desde a `0001` e é o portão do dinheiro: `security_invoker` mais
-- `has_capability` fazem o custo e o preço virarem **nulo** para quem não pode vê-los, do lado
-- de dentro da consulta. É exatamente por ela que a descida tem de ler — esconder na tela
-- seria decoração, e a fundação desta casa manda a permissão morar na consulta.
--
-- Só que ela foi escrita para LER, não para replicar, e deixa de fora seis colunas que o
-- aparelho guarda: `movement_group_id` (sem ele o estorno de um ato inteiro não tem como
-- achar as pernas), `operator_id` (quem estava com o aparelho — a decisão de 6 de setembro),
-- `device_id`, `return_reason`, `carrier_id`, e agora `received_at`, que é o cursor.
--
-- Descer sem elas escreveria um razão MUTILADO no segundo aparelho: mesmo saldo, atos sem
-- grupo, devoluções sem motivo. Pior que não descer, porque parece completo.
--
-- A view é recriada inteira — `create or replace view` não aceita acrescentar coluna no meio,
-- e emendar uma view é como emendar uma política: o que não está escrito aqui deixa de
-- existir. As duas linhas de dinheiro continuam idênticas, com o mesmo portão.
--
-- *`unit_cost_cents` e `unit_price_cents` ficam de fora de propósito: são as colunas
-- inteiras que a `0001` criou e que a fundação do `Rate` aposentou — o aparelho não as tem.*

drop view if exists movements_visible;

create view movements_visible with (security_invoker = true) as
  select
    m.id, m.company_id, m.kind, m.occurred_at, m.recorded_at, m.recorded_by,
    m.item_id, m.quantity_base_units, m.location_id, m.counterpart_location_id,
    m.lot_id, m.post, m.loss_reason, m.reverses_movement_id,
    m.assistant_phrase, m.note,
    m.movement_group_id, m.operator_id, m.device_id,
    m.return_reason, m.carrier_id,
    m.received_at,
    case when private.has_capability(m.company_id, 'view_cost')
         then m.unit_cost_rate end as unit_cost_rate,
    case when private.has_capability(m.company_id, 'view_sale_price')
         then m.unit_price_rate end as unit_price_rate
  from movements m;

comment on view movements_visible is
  'O razão como este usuário pode vê-lo: custo e preço viram nulo sem a capacidade, do lado '
  'de dentro da consulta. É por aqui que a descida lê — e por isso ela carrega TODAS as '
  'colunas que o aparelho guarda, não só as que uma tela mostra.';
