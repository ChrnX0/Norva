-- O Reset apaga o APARELHO antes do lugar — e a categoria, que ninguém nomeava.
--
-- Duas correções na mesma função, as duas achadas ao dar escritor à matrícula de aparelho.
--
-- **A primeira era latente e virou real hoje.** `devices.location_id` é RESTRICT desde a
-- `0013`, e o Reset `all` apaga `locations`. Enquanto nada escrevia em `devices` a tabela
-- estava vazia e a ordem não importava; com a matrícula existindo, o primeiro Reset de uma
-- empresa com um celular cadastrado levanta chave estrangeira — e o bloco de subtransação da
-- `0045` ENGOLE a exceção: o Reset que o dono pediu, com duas confirmações, simplesmente não
-- acontece, e a única pista é `last_error` numa tabela que ninguém lê.
--
-- É a lição escrita na própria `0049`: *"quem engole exceção tem de gravar o motivo, senão
-- troca um defeito barulhento por um silencioso"*. Aqui o conserto é a ORDEM, que é de graça.
--
-- **A segunda NÃO é defeito, e vale escrever por que ela entra mesmo assim.** Eu li que
-- `product_categories` (`0057`) não estava na lista do `all` e escrevi aqui que as categorias
-- sobreviviam a um Reset completo. **Está errado:** `line_id` referencia `product_lines` com
-- `on delete cascade`, e o `all` apaga `product_lines` — elas caem junto desde sempre.
--
-- Ela entra nominalmente por uma razão que a própria `0049` escreveu para `movements`: *"o que
-- lá é consequência, aqui é uma instrução"*. Esta função escolheu DIZER em vez de depender de
-- cascata, porque é ela que alguém relê ao perguntar o que o Reset apaga — e porque no dia em
-- que `line_id` virar RESTRICT a cascata deixa de existir sem esta lista mudar.
--
-- **A regra de método que sai do meu erro:** antes de chamar de buraco a ausência de uma
-- tabela numa lista de `delete`, olhe as AÇÕES das chaves estrangeiras dela. Foi o segundo
-- engano do mesmo tipo nesta rodada — o primeiro foi ler o `create table` da `0013` e concluir
-- sobre uma coluna que a `0035` já tinha repontado. Nas duas vezes eu li UMA migração e
-- conclui sobre o esquema de hoje, que é a soma de todas.
--
-- A função é redefinida INTEIRA (`create or replace`) porque plpgsql não tem emenda: é o
-- corpo da `0049` com duas linhas a mais, e as duas estão comentadas dentro.

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
        -- A CATEGORIA, nominalmente. Ela já caía por cascata de `product_lines`, logo
        -- abaixo (`0057`: `line_id ... on delete cascade`), e entra escrita pela razão
        -- que esta função tem para tudo: aqui o que é consequência vira instrução, porque
        -- é esta lista que alguém relê para saber o que o Reset apaga.
        delete from public.product_categories where company_id = pedido.company_id;
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
        -- O APARELHO sai antes do lugar, e a ordem é a única coisa que impede o Reset
        -- de falhar: `devices.location_id` é RESTRICT (0013), então apagar `locations`
        -- com um aparelho matriculado levanta chave estrangeira — e a exceção é engolida
        -- pelo bloco de subtransação, deixando o Reset do dono sem acontecer com
        -- `last_error` como única pista. Latente até 13 de setembro, quando o aparelho
        -- passou a ter escritor.
        delete from public.devices            where company_id = pedido.company_id;
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
-- Função redefinida é função nova para o `execute`: `create or replace` mantém as permissões,
-- e a regra desta casa é cada migração revogar a sua em vez de confiar na anterior — foi a
-- lição da `0005` e da `0039`.
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
  'Executa os Resets vencidos, uma empresa por subtransacao. Ordem importa: o razao sai '
  'antes de tudo, o aparelho antes do lugar (devices.location_id e RESTRICT), e toda tabela '
  'com company_id tem de estar aqui - a lista nao se deduz, e por isso ela e conferida pelo '
  'db:verify.';
