-- O fornecedor deixa de ser texto digitado e passa a ser uma COISA — e o que isso conserta
-- é um número que decide dinheiro.
--
-- `suppliers` está aqui desde a `0002` com zero escritores e zero leitores. Quem vive é
-- `purchases.supplier_name`, acrescentado pela `0010` justamente para receber o que o
-- aparelho manda: um texto que alguém digita em cada nota. A `0044` já escreveu esse
-- diagnóstico ao recusar copiar este molde, com a frase que vale aqui: *cadastro sem quem
-- leia é a doença que este repositório documentou quatro vezes*.
--
-- **O que mudou é que agora existe quem leia, e o que ele lê decide compra.** Desde 13 de
-- setembro a capa, o aviso e a ficha do insumo usam o PRAZO OBSERVADO do fornecedor —
-- `deliveriesOf` + `observedLeadTimeDays` — para dizer o dia de comprar. Esse prazo é
-- agrupado pelo fornecedor, e enquanto o fornecedor é texto livre, "Atacado São Jorge",
-- "atacado sao jorge" e "Atacado São Jorge " são TRÊS fornecedores: três históricos pela
-- metade, três prazos, e o dia de comprar calculado sobre um terço das notas. Não é um
-- relatório feio — é o número do aviso errado, calado.
--
-- Então o nome vira chave, e as duas colunas ficam com papéis diferentes:
--
--   `supplier_name` é O QUE ESTAVA ESCRITO NA NOTA. História, e história não se recarimba —
--                   a mesma regra do `location_id` de um movimento.
--   `supplier_id`   é o CADASTRO, resolvido a partir do nome na hora de gravar.
--
-- Índice e não `unique (...)` na tabela: Postgres não aceita EXPRESSÃO em restrição de
-- tabela, só em índice. A `0044` morreu exatamente aí, no `db:verify`, com "syntax error at
-- or near (" — e ela deixou a lição escrita. Esta migração é o vizinho olhando como o
-- vizinho fez.
--
-- **A borda que esta migração NÃO cruza:** ela não deduz fornecedor nenhum das notas que já
-- existem. Um `insert ... select distinct supplier_name` pareceria gentil e criaria cadastro
-- a partir de texto que ninguém conferiu — inclusive dos erros de digitação que o índice
-- passa a impedir. Nota antiga fica com `supplier_id` nulo, que é a resposta honesta: ela foi
-- gravada antes de existir cadastro.
alter table suppliers
  add constraint suppliers_name_not_blank check (length(btrim(name)) > 0);

create unique index suppliers_name_idx on suppliers (company_id, lower(btrim(name)));

comment on column purchases.supplier_name is
  'O nome como estava escrito NA NOTA - historia, nao cadastro. Fica junto de supplier_id: '
  'o texto nao se recarimba quando alguem corrige o cadastro depois.';

comment on column purchases.supplier_id is
  'O cadastro do fornecedor, resolvido do nome na hora de gravar. E por ele que o prazo '
  'observado agrupa - nome livre daria tres prazos para tres jeitos de escrever o mesmo '
  'fornecedor, e o prazo e o que decide o dia de comprar.';


-- E o Reset passa a apagar o FORNECEDOR, na posicao que as chaves permitem.
--
-- Mesma familia do aparelho na 0068, e mesma categoria de defeito: latente enquanto a tabela
-- nao tem escritor, real no instante em que ela ganha um. A funcao e redefinida INTEIRA porque
-- plpgsql nao tem emenda: e o corpo da 0068 com uma linha a mais, comentada dentro.
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
        -- O FORNECEDOR depois da nota, que aponta para ele com RESTRICT (0002:35). Ele
        -- nunca esteve nesta lista, e ate hoje isso era inofensivo: a tabela estava vazia
        -- porque nada escrevia nela. Com o escritor existindo, um Reset completo deixaria
        -- os fornecedores vivos numa empresa sem uma nota - e eles nao caem por cascata,
        -- porque o Reset nao apaga a empresa, ele a esvazia.
        --
        -- So no ramo `all`: quem apaga as compras continua com os fornecedores dele.
        delete from public.suppliers         where company_id = pedido.company_id;
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
