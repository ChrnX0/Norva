-- Apagar os INSUMOS não é apagar o catálogo — e um pedido que falha não trava os outros.
--
-- Dois defeitos da `0045`, achados pela auditoria de 9 de setembro e medidos contra o
-- esquema antes de qualquer linha ser escrita aqui.
--
-- **1. O ramo `inputs` não dizia de que espécie eram os itens.**
--
--     delete from public.items where company_id = pedido.company_id;
--
-- `items` guarda as cinco espécies. O aparelho sempre soube disso — `itemKindsFor` em
-- `src/data/erase.ts` devolve `('input','packaging','store_supply')` para esta área, e o
-- `DELETE` de lá nomeia as espécies. O servidor apagava todas, e o que acontece depois
-- depende do dado, com os dois desfechos ruins:
--
--   * `products.item_id` referencia `items` com **ON DELETE CASCADE** (`0002`, linha 160).
--     Sem nenhum lote no caminho, o Reset de "insumos" leva o catálogo de PRODUTOS junto,
--     em silêncio — e a segunda confirmação, que o dono exigiu que contasse o que se
--     perde, contou outra coisa. *"Apagar de verdade, com o usuário sabendo exatamente o
--     que perde"* deixa de ser verdade na segunda metade.
--   * `lots.item_id` referencia `items` com **ON DELETE RESTRICT** (`0001`, linha 158), e
--     o ramo `inputs` não apaga `lots`. Como toda corrida de produção grava um lote, a
--     partir da primeira corrida o `delete` levanta chave estrangeira e **nada** é
--     apagado.
--
-- Filtrar por espécie conserta os dois de uma vez: lote aponta para item de PRODUTO, que
-- esta área não toca mais.
--
-- **2. O laço não isolava os pedidos, e um erro travava o banco inteiro.**
--
-- `private.run_due_erases()` percorre os pedidos vencidos de TODAS as empresas numa
-- transação só. Uma exceção em qualquer um — a chave estrangeira acima, uma ficha criada
-- entre o pedido e o vencimento, o que for — aborta a função inteira: nenhum pedido é
-- marcado como feito, nenhuma empresa é atendida, e o agendador tenta de novo na noite
-- seguinte com o mesmo pedido na frente da fila. Sem caminho de retirada e sem sinal.
--
-- O que a fila do aparelho ensinou vale igual aqui: **recusa que nenhuma tentativa
-- resolve tem de sair da frente**, e tem de deixar rastro. Cada pedido passa a ter a
-- própria subtransação; quem falha anota por que e a volta continua.
--
-- **O que esta migração NÃO muda, de propósito:** a porta estreita do gatilho, o par
-- bandeira-mais-dono, o prazo calculado pelo servidor e a revogação do `execute`. Aquilo
-- foi medido em 7 de setembro contra quatro caminhos e continua sendo a resposta.

-- 1. O rastro do que falhou — porque erro que ninguém vê é erro que volta amanhã.
--
-- Duas colunas e não uma: `failed_at` responde "quando", `last_error` responde "por quê",
-- e a segunda sem a primeira não diz se ainda vale. Ficam nulas no caminho feliz.
--
-- O pedido continua sendo tentado nas noites seguintes de propósito: a causa mais
-- provável de falha é uma dependência que a própria empresa pode remover — uma ficha que
-- usa o insumo, um pedido de loja em aberto. Desistir na primeira falha transformaria um
-- bloqueio temporário em Reset perdido, e o dono teria de pedir de novo sem saber disso.
alter table erase_requests add column failed_at  timestamptz;
alter table erase_requests add column last_error text;

comment on column erase_requests.failed_at is
  'Quando a última tentativa falhou. Nulo é "nunca falhou" — e o pedido continua na fila: '
  'a causa costuma ser uma dependência que a empresa ainda pode remover.';
comment on column erase_requests.last_error is
  'A mensagem da última falha, para o motivo aparecer sem ninguém abrir o log do banco.';

-- 2. O executor, com a espécie nomeada e cada pedido no próprio bloco.
create or replace function private.run_due_erases()
returns integer
language plpgsql
security definer
set search_path = private, public
as $$
declare
  pedido record;
  quantos integer := 0;
  -- As espécies que cada área possui. São as MESMAS de `itemKindsFor` no aparelho, e
  -- essa igualdade é o que a checagem 25 do `db:verify` prova — duas listas escritas em
  -- duas linguagens divergem em silêncio, e foi exatamente o que aconteceu aqui.
  --
  -- E o tipo é `item_kind[]`, não `text[]`: `items.kind` é um enum, e comparar enum com
  -- texto é *"operator does not exist: item_kind = text"*. A primeira versão desta
  -- migração fez isso, e a exceção foi ENGOLIDA pelo bloco de tratamento logo abaixo —
  -- o Reset simplesmente não acontecia, com `last_error` como única pista. Foi a
  -- checagem 25 que mostrou, e é o preço de isolar falhas: quem engole exceção tem de
  -- gravar o motivo, senão troca um defeito barulhento por um silencioso.
  especies_de_insumo  constant item_kind[] := array['input', 'packaging', 'store_supply']::item_kind[];
  especies_de_produto constant item_kind[] := array['product', 'resale']::item_kind[];
begin
  perform set_config('private.erasing', 'sim', true);

  for pedido in
    select * from public.erase_requests
     where done_at is null and effective_at is not null and effective_at <= now()
     order by requested_at
  loop
    -- O bloco é a subtransação: o que falha aqui volta atrás sozinho e a volta segue.
    begin
      if pedido.area in ('purchases', 'inputs', 'all') then
        delete from public.movements where company_id = pedido.company_id;
      end if;

      if pedido.area = 'all' then
        delete from public.readings           where company_id = pedido.company_id;
        delete from public.order_lines        where company_id = pedido.company_id;
        delete from public.orders             where company_id = pedido.company_id;
        delete from public.lots               where company_id = pedido.company_id;
        delete from public.purchase_lines     where company_id = pedido.company_id;
        delete from public.purchases          where company_id = pedido.company_id;
        delete from public.products           where company_id = pedido.company_id;
        delete from public.product_types      where company_id = pedido.company_id;
        delete from public.product_lines      where company_id = pedido.company_id;
        delete from public.flavors            where company_id = pedido.company_id;
        delete from public.recipe_lines       where company_id = pedido.company_id;
        delete from public.recipe_versions    where company_id = pedido.company_id;
        delete from public.recipes            where company_id = pedido.company_id;
        delete from public.sale_price_history where company_id = pedido.company_id;
        delete from public.location_prices    where company_id = pedido.company_id;
        delete from public.item_cost_history  where company_id = pedido.company_id;
        delete from public.item_costs         where company_id = pedido.company_id;
        delete from public.items              where company_id = pedido.company_id;
        delete from public.carriers           where company_id = pedido.company_id;
        delete from public.locations          where company_id = pedido.company_id;
        delete from public.people             where company_id = pedido.company_id;
        delete from public.profiles           where company_id = pedido.company_id;

      elsif pedido.area = 'purchases' then
        delete from public.purchase_lines     where company_id = pedido.company_id;
        delete from public.purchases          where company_id = pedido.company_id;
        delete from public.item_cost_history  where company_id = pedido.company_id;
        delete from public.item_costs         where company_id = pedido.company_id;

      elsif pedido.area = 'recipes' then
        delete from public.recipe_lines    where company_id = pedido.company_id;
        delete from public.recipe_versions where company_id = pedido.company_id;
        delete from public.recipes         where company_id = pedido.company_id;

      elsif pedido.area = 'products' then
        -- O razão do PRODUTO sai primeiro e sai nominalmente.
        --
        -- No aparelho ele saía por cascata (`movements.item_id` é CASCADE no SQLite);
        -- aqui a mesma coluna é RESTRICT, de propósito, porque uma cascata em `movements`
        -- dispararia o gatilho de imutabilidade linha por linha. Então o que lá é
        -- consequência, aqui é uma instrução — e a lista de espécies é a mesma dos dois
        -- lados para o resultado ser o mesmo.
        delete from public.movements
         where company_id = pedido.company_id
           and item_id in (select id from public.items
                            where company_id = pedido.company_id
                              and kind = any (especies_de_produto));
        delete from public.order_lines     where company_id = pedido.company_id;
        delete from public.lots            where company_id = pedido.company_id;
        delete from public.products        where company_id = pedido.company_id;
        -- E o item do produto vai junto, como no aparelho. Sem isto sobrava um item de
        -- espécie `product` sem linha em `products`: um produto que a tela lista e que
        -- não tem ficha, rendimento nem preço.
        delete from public.items
         where company_id = pedido.company_id and kind = any (especies_de_produto);

      elsif pedido.area = 'inputs' then
        delete from public.item_cost_history where company_id = pedido.company_id;
        delete from public.item_costs        where company_id = pedido.company_id;
        -- A ESPÉCIE, que é o defeito que esta migração existe para consertar.
        delete from public.items
         where company_id = pedido.company_id and kind = any (especies_de_insumo);
      end if;

      update public.erase_requests
         set done_at = now(), failed_at = null, last_error = null
       where id = pedido.id;
      quantos := quantos + 1;

    exception when others then
      -- A subtransação já voltou atrás: este pedido não apagou nada. O que fica é o
      -- motivo, e a volta continua para as outras empresas.
      update public.erase_requests
         set failed_at = now(), last_error = left(sqlerrm, 500)
       where id = pedido.id;
    end;
  end loop;

  perform set_config('private.erasing', 'nao', true);
  return quantos;
end;
$$;

-- Função redefinida é função nova para o `execute`: `create or replace` mantém as
-- permissões, mas a regra desta casa é cada migração revogar a sua em vez de confiar na
-- anterior — foi a lição da `0005` e da `0039`, e ela custou uma fila inteira recusada.
revoke execute on function private.run_due_erases() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function private.run_due_erases() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function private.run_due_erases() from authenticated;
  end if;
end
$$;

comment on function private.run_due_erases() is
  'Executa os pedidos de Reset vencidos, um por subtransação: o que falha anota o motivo '
  'e sai da frente dos outros. Chamada pelo agendador do banco, nunca pelo aplicativo.';
