-- A DESCIDA morria na primeira nota com fornecedor e no primeiro movimento de um aparelho.
--
-- `src/sync/descida.ts` traz uma lista escrita a mao — `DESCEM` — que promete estar "na ordem
-- das chaves estrangeiras". Em 13 de setembro ela tinha QUATRO precedencias erradas, medidas
-- contra o esquema do aparelho:
--
--   products.recipe_id        -> recipes            (todo produto fabricado tem ficha)
--   flavors.line_id/type_id   -> a grade do produto (0055, 0056, 0059)
--   purchases.supplier_id     -> suppliers          (a tabela nao descia)
--   movements.device_id       -> devices            (idem)
--
-- ## Por que isto nao e "perder uma linha"
--
-- O aparelho tem `foreign_keys` ligado, e `gravarPagina` grava a pagina inteira dentro de UMA
-- transacao, sem apanhar excecao. Uma referencia que ainda nao chegou derruba a pagina, o cursor
-- NAO anda, e a rodada seguinte comeca no mesmo ponto e morre igual. Nao e degradacao: e a
-- replica parada, calada, na fabrica do cliente — e `descer()` para a rodada INTEIRA no primeiro
-- erro de proposito (para nao gravar movimento antes do item que ele cita), entao nem o cadastro
-- nem o razao descem.
--
-- Os dois primeiros consertam-se na ordem da lista, e a lista agora e CONFERIDA: uma guarda nova
-- (`src/sync/agreement.test.ts`) le as arestas do `db.ts` e reprova pai que nao desce ou que
-- desce depois do filho. Lista escrita a mao contra esquema que cresce e divida com juros.
--
-- ## O que precisa de MIGRACAO sao os dois ultimos
--
-- Acrescentar uma tabela a `DESCEM` nao e escrever o nome dela: a descida pede `received_at` —
-- o cursor —, ordena por `(received_at, id)` e exige que o servidor CARIMBE a coluna no insert e
-- no update. A 0065 fez isso para as dezenove tabelas que desciam; `devices` e `suppliers`
-- entraram depois dela, nas rodadas 15 e 16, e ficaram sem as tres coisas.
--
-- O carimbo no UPDATE e o que faz a correcao descer: cadastro desce por upsert, e uma correcao
-- que nao move `received_at` fica para sempre ANTES do cursor de quem ja sincronizou — trocar o
-- nome do fornecedor num celular nunca chegaria ao outro. E `default now()` nao basta: ele vale
-- so quando o cliente omite a coluna, e um cliente que mandasse `received_at` de ontem poria a
-- propria linha antes do cursor de todos os outros aparelhos, invisivel e sem erro. Cursor e
-- fato do servidor, como `recorded_by`.
alter table devices   add column if not exists received_at timestamptz not null default now();
alter table suppliers add column if not exists received_at timestamptz not null default now();

comment on column devices.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';
comment on column suppliers.received_at is
  'Hora do SERVIDOR na chegada desta versao da linha — o cursor da descida. Move no upsert. '
  'Ver movements.received_at.';

drop trigger if exists devices_carimba_a_chegada on devices;
create trigger devices_carimba_a_chegada before insert or update on devices
  for each row execute function private.carimba_a_chegada();

drop trigger if exists suppliers_carimba_a_chegada on suppliers;
create trigger suppliers_carimba_a_chegada before insert or update on suppliers
  for each row execute function private.carimba_a_chegada();

-- O par do cursor, na mesma forma das outras dezenove: a pagina pede
-- `(company_id, received_at, id)` porque o cursor do aparelho guarda o PAR — sem o id no fim,
-- duas linhas carimbadas no mesmo instante fazem a segunda ficar para tras para sempre.
create index if not exists devices_received_idx   on devices (company_id, received_at, id);
create index if not exists suppliers_received_idx on suppliers (company_id, received_at, id);
