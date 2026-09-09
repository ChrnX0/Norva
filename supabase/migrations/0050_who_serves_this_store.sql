-- Quem ATENDE esta loja — e sem isso as duas fábricas produzem o mesmo pedido.
--
-- A `0046` deu pai às salas e o saldo passou a ser da unidade. A DEMANDA não passou:
-- `stockAgainstOrders` recortava o estoque por unidade e somava o pedido da EMPRESA
-- inteira. Com duas fábricas, as duas leem *"faltam 300"* para o mesmo pedido, as duas
-- produzem, e a fábrica faz o dobro do que alguém pediu. É a segunda metade de um defeito
-- cuja primeira metade foi consertada em 8 de setembro — e ela sobreviveu porque o
-- conserto de lá olhou UMA consulta, e a pergunta mora em duas.
--
-- **Coluna nova, e reusar `parent_location_id` seria um defeito calado.** O domínio diz,
-- com todas as letras, que loja e cliente NÃO ficam dentro de uma unidade
-- (`UNIT_ROOM_KINDS` em `src/domain/ledger.ts`, e o backfill da `0046` as deixou de fora
-- de propósito). O recorte de saldo soma o lugar E os filhos dele, então pôr uma loja
-- como filha da fábrica jogaria mil picolés de prateleira de loja dentro do saldo da
-- fábrica — e o número que decide produção subiria, calado.
--
-- São duas relações diferentes: **"fica dentro de"** e **"é atendida por"**. Elas
-- desenham igual num diagrama e somam diferente numa consulta, então são duas colunas.
--
-- **O backfill é o que faz o padrão ser invisível.** Quem tem uma unidade só nunca vê a
-- pergunta: toda loja que já existe passa a apontar para a unidade que carrega o id da
-- empresa — a primeira, e a única de hoje. Sem ele a demanda cairia para zero em todo
-- servidor já povoado, calada, que é exatamente o erro que a `0046` evitou fazendo o
-- mesmo. E o aplicativo trata o nulo do mesmo jeito, para a loja que nascer antes de
-- alguém responder a pergunta não sumir da demanda das duas unidades — que é o defeito
-- oposto, e pior, porque é silencioso.

alter table locations
  add column served_by_location_id uuid,
  -- A chave é COMPOSTA pelo mesmo motivo da `0046` e da `0029`: sem a empresa junto, a
  -- loja de uma fábrica poderia apontar para a unidade de um concorrente, e a demanda de
  -- uma empresa passaria a somar o pedido da outra.
  add constraint locations_served_by_fk
    foreign key (served_by_location_id, company_id)
    references locations (id, company_id)
    -- `restrict`, como o pai: apagar uma unidade não pode levar as lojas dela embora.
    on delete restrict;

-- Uma loja não é atendida por si mesma. Cabe num `check` porque não precisa de
-- subconsulta — a mesma volta que a `0046` fechou para o pai.
alter table locations
  add constraint locations_served_by_is_not_self
    check (served_by_location_id is null or served_by_location_id <> id);

-- Quem pergunta "quais lojas esta unidade atende" filtra por aqui, e a pergunta vem
-- sempre com a empresa na frente por causa da RLS.
create index locations_served_by_idx on locations (company_id, served_by_location_id);

-- O backfill. Toda loja e todo cliente que não são a própria unidade passam a ser
-- atendidos pela unidade que tem o id da empresa — a primeira, e a única de quem está
-- usando hoje.
--
-- Sala interna fica de fora: ela não é atendida, ela está DENTRO (`parent_location_id`).
-- `vehicle` idem — caminhão é caminho, não destino que alguém abastece.
update locations loja
   set served_by_location_id = loja.company_id
 where loja.kind in ('own_store', 'customer')
   and loja.served_by_location_id is null
   and loja.id <> loja.company_id
   -- Só onde a unidade padrão existe de verdade. Uma empresa cujo lugar padrão nunca foi
   -- criado (nenhum movimento ainda) não ganha um apontamento para o vazio, que a chave
   -- estrangeira recusaria e derrubaria a migração inteira.
   and exists (
     select 1
       from locations unidade
      where unidade.id = loja.company_id
        and unidade.company_id = loja.company_id
   );

comment on column locations.served_by_location_id is
  'A unidade de fábrica que produz para esta loja ou cliente. Nulo = ainda não se disse, '
  'e o aplicativo o lê como "a unidade que tem o id da empresa" — a primeira. É uma '
  'relação DIFERENTE de parent_location_id: aqui ninguém fica dentro de ninguém. Ver 0050.';
