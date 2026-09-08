-- Uma sala fica DENTRO de uma unidade, e sem isso a segunda unidade não conta saldo.
--
-- O dono levantou em 7 de setembro que podem existir mais de uma unidade da fábrica. A
-- porta abriu em 8 de setembro (`app/places.tsx` passou a oferecer a espécie `factory`),
-- e ao ir recortar as consultas de saldo por unidade apareceu o que faltava: **`locations`
-- não tem pai**. Uma câmara fria pertence à EMPRESA, não à fábrica.
--
-- Com uma unidade isso nunca custou nada: `stockAgainstOrders` soma
-- `kind in ('factory','cold_room','store_room')` e acerta, porque todas as salas internas
-- são da única unidade. Com duas, a mesma soma responde *"dá para prometer este pedido?"*
-- contando o freezer da outra cidade — e o pedido é aceito contra estoque que não pode
-- ser carregado.
--
-- E o conserto ingênuo é pior que o defeito: recortar por `location_id = <a unidade>`
-- passaria a EXCLUIR a câmara fria de quem já usa o aplicativo, porque hoje ela não
-- aponta para unidade nenhuma. O número cairia, calado, para todo mundo.
--
-- Daí as duas metades desta migração, e a segunda é a que protege quem já está usando:
--
--   1. `parent_location_id` — auto-referência com chave composta, para uma sala dizer em
--      que unidade ela fica. Nulo é estado legítimo e significa "no nível da empresa":
--      é o que uma loja, um cliente e a própria unidade são.
--   2. O **backfill**: toda sala interna existente passa a apontar para a unidade que tem
--      o id da empresa — que é a primeira, e hoje a única. Isso é verdade sobre o mundo,
--      não conveniência: quem tem uma fábrica tem a câmara dela dentro dela.
--
-- **Por que auto-referência e não uma tabela `units`.** A espécie já responde o que a
-- coisa é (`kind = 'factory'`), e uma tabela nova duplicaria isso com duas fontes para a
-- mesma pergunta. E a auto-referência generaliza de graça no dia em que uma unidade tiver
-- subáreas — que é exatamente o que uma câmara fria é.
--
-- **Por que a chave é COMPOSTA.** `(parent_location_id, company_id)` contra
-- `locations (id, company_id)` — o único `unique` que a `0019` criou, e criou para isto.
-- Sem ela uma sala de uma empresa poderia apontar para a unidade de outra, e o saldo de
-- uma fábrica passaria a somar a sala de um concorrente. A `0029` já escreveu que este é
-- o molde da casa para toda referência entre linhas com empresa.
--
-- **O que NÃO é imposto no banco, e por quê.** Que o pai seja da espécie `factory` não
-- cabe num `check` (subconsulta é proibida ali) e um gatilho para isso custaria uma
-- escrita a cada cadastro de sala para proteger contra um caso que só o próprio
-- aplicativo produz. Fica no aplicativo, com o teste ao lado, e a fronteira está dita
-- aqui em vez de subentendida.

alter table locations
  add column parent_location_id uuid,
  add constraint locations_parent_fk
    foreign key (parent_location_id, company_id)
    references locations (id, company_id)
    -- `restrict` e não `cascade`: apagar uma unidade não pode levar as salas dela
    -- embora. Sala apagada em cascata levaria o `location_id` de movimento com ela,
    -- e o `on delete restrict` de `movements` viraria a última rede de um acidente
    -- que não devia chegar perto dela.
    on delete restrict;

-- Uma sala não é a própria unidade. Isto cabe num `check` porque não precisa de
-- subconsulta, e é a única volta que a auto-referência permite fechar sozinha.
alter table locations
  add constraint locations_parent_is_not_self
    check (parent_location_id is null or parent_location_id <> id);

-- Quem pergunta "o que tem nesta unidade" filtra por aqui, e a pergunta vem sempre
-- com a empresa na frente por causa da RLS.
create index locations_parent_idx on locations (company_id, parent_location_id);

-- O backfill. Toda sala INTERNA que não é a unidade passa a ficar dentro da unidade
-- que tem o id da empresa — a primeira, e a única de quem está usando hoje.
--
-- `own_store` e `customer` ficam de fora de propósito: loja própria e cliente não
-- ficam dentro de uma fábrica, ficam no mundo. `vehicle` idem — caminhão é caminho.
update locations sala
   set parent_location_id = sala.company_id
 where sala.kind in ('cold_room', 'store_room')
   and sala.parent_location_id is null
   and sala.id <> sala.company_id
   -- Só onde a unidade padrão existe de verdade. Uma empresa cujo lugar padrão nunca
   -- foi criado (nenhum movimento ainda) não ganha pai apontando para o vazio, que a
   -- chave estrangeira recusaria e derrubaria a migração inteira.
   and exists (
     select 1
       from locations unidade
      where unidade.id = sala.company_id
        and unidade.company_id = sala.company_id
   );

comment on column locations.parent_location_id is
  'A unidade de fábrica em que esta sala fica. Nulo = no nível da empresa, que é o que uma unidade, uma loja e um cliente são. Ver 0046.';
