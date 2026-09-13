-- O estorno devolvia a quantidade e deixava o erro DENTRO da média, no servidor.
--
-- O aparelho já faz certo: `reverseGroup` chama `recomputeItemCost`, que recompõe a média do
-- razão inteiro ignorando o que foi estornado. O servidor não tem nada equivalente — `item_costs`
-- lá tem dois autores, a `0009` na linha de compra e a `0025` na perna de produção, e nenhum dos
-- dois olha para estorno. Uma perna de `reversal` chega, o saldo volta ao certo, e a média fica
-- com o número envenenado para sempre.
--
-- **O número, medido no aparelho quando este defeito foi consertado lá:** 500 picolés a 64,99
-- mais 50 a 614 dá 114,08. Tirar os 50 por estorno devolve a quantidade e mantém os 114,08. O
-- dono corrige o estoque e continua com o custo errado embaixo de todo número de dinheiro do
-- aplicativo — que é exatamente a queixa que abriu aquela rodada.
--
-- E a divergência entre os dois lados é pior que o erro sozinho: o aparelho mostra o custo certo,
-- o servidor guarda o errado, e quem olhar de outro celular depois da descida vê o errado. Dois
-- números para a mesma pergunta é o que este projeto chama de duas verdades.
--
-- ## O que "estornado não aconteceu" quer dizer aqui
--
-- Tratar a perna de estorno como saída comum é o que um sistema contábil faz com uma devolução, e
-- é consistente com média móvel — e deixa o erro dentro. A regra é a do aparelho: as duas linhas
-- ficam no razão porque a fundação exige, e quem pergunta *"o que aconteceu"* não vê nenhuma das
-- duas. A média é essa pergunta.
--
-- ## Quem AUTORA a média são dois, não qualquer entrada
--
-- Só `purchase` e a perna positiva de `production` misturam taxa — é a lei que a `0009` e a `0025`
-- já escreveram em gatilho. As outras entradas positivas movem quantidade sem dizer quanto
-- custou: a entrada de uma transferência ou de uma devolução (a taxa vem do `item_costs` cru), a
-- sobra de uma contagem, a diferença de um posto de controle. Misturar a taxa delas dobra o mesmo
-- dinheiro — medido no aparelho: 64,3% de erro quando havia transferência no meio.
--
-- ## A ORDEM, e a única diferença honesta entre os dois lados
--
-- O aparelho ordena por `occurred_at, recorded_at, rowid`, e `rowid` é a ordem em que as linhas
-- entraram NELE. O servidor não tem `rowid`; o equivalente é `received_at, id` — o par que a
-- `0061` criou para o cursor da descida, e que é a ordem de chegada.
--
-- Para um celular só as duas ordens coincidem: a fila sobe em ordem de `rowid`
-- (`pendingEntries ORDER BY rowid`) e o servidor carimba `received_at` na chegada. Com dois
-- celulares elas podem divergir — e só quando `occurred_at` E `recorded_at` empatam exatamente,
-- porque os dois vêm antes no critério. É estreito e é real, e está escrito aqui em vez de o
-- comentário prometer igualdade perfeita: promessa maior que a régua é o defeito que esta casa
-- persegue.

create or replace function private.recompoe_media_do_item(
  a_empresa uuid,
  o_item uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  linha        record;
  unidades     numeric := 0;
  media        numeric(18,8) := 0;
  ultima       numeric(18,8);
  anterior     numeric(18,8);
  total        numeric;
begin
  select average_rate into anterior
    from item_costs
   where company_id = a_empresa and item_id = o_item;

  for linha in
    select m.kind, m.quantity_base_units, m.unit_cost_rate
      from movements m
     where m.company_id = a_empresa
       and m.item_id = o_item
       and m.kind <> 'reversal'
       -- O que tem estorno de pé não aconteceu. Mesmo predicado de `naoEstornado` no aparelho.
       and not exists (
         select 1 from movements rev
          where rev.reverses_movement_id = m.id
            and rev.company_id = m.company_id)
     order by m.occurred_at, m.recorded_at, m.received_at, m.id
  loop
    if (linha.kind = 'purchase' or (linha.kind = 'production' and linha.quantity_base_units > 0))
       and linha.quantity_base_units > 0
       and linha.unit_cost_rate is not null
    then
      -- A mesma mistura de `blendRate`: o piso em zero das unidades guardadas existe porque saldo
      -- negativo (uma perda lançada antes da compra chegar) não pode pesar a favor do que já
      -- estava lá.
      total := greatest(unidades, 0) + linha.quantity_base_units;
      if total <= 0 then
        media := linha.unit_cost_rate;
      else
        media := (media * greatest(unidades, 0) + linha.unit_cost_rate * linha.quantity_base_units)
                 / total;
      end if;
      ultima := linha.unit_cost_rate;
    end if;
    unidades := unidades + linha.quantity_base_units;
  end loop;

  insert into item_costs (company_id, item_id, average_rate, last_rate, updated_at)
  values (a_empresa, o_item, media, ultima, now())
  on conflict (company_id, item_id) do update
    set average_rate = excluded.average_rate,
        last_rate = excluded.last_rate,
        updated_at = excluded.updated_at;

  -- O histórico só ganha linha quando a média MUDOU. Ele alimenta o aviso de preço da capa, e
  -- uma linha por recomposição sem mudança encheria a tela de "mexeu 0,00%" — o alerta inventado.
  if anterior is null or abs(anterior - media) > 1e-12 then
    insert into item_cost_history (company_id, item_id, previous_rate, new_rate, observed_at)
    values (a_empresa, o_item, nullif(anterior, 0), media, now());
  end if;
end;
$$;

revoke all on function private.recompoe_media_do_item(uuid, uuid) from public;

-- O gatilho: toda perna de estorno recompõe a média do item que ela desfez.
create or replace function private.estorno_recompoe_media()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.kind <> 'reversal' then
    return new;
  end if;
  perform private.recompoe_media_do_item(new.company_id, new.item_id);
  return new;
end;
$$;

revoke all on function private.estorno_recompoe_media() from public;

drop trigger if exists reversal_recomputes_cost on movements;

-- `after`, e não `before`: a recomposição LÊ o razão, e a perna de estorno precisa estar lá para
-- que o `not exists` acima veja o que ela desfez. Num `before` ela ainda não existe, e a média
-- sairia idêntica à de antes — o gatilho rodaria e não faria nada, que é o pior resultado
-- possível: a aparência do conserto sem o conserto.
create trigger reversal_recomputes_cost
  after insert on movements
  for each row
  execute function private.estorno_recompoe_media();

comment on function private.recompoe_media_do_item(uuid, uuid) is
  'Espelha recomputeItemCost do aparelho (src/data/repository.ts): recompõe a média do razão '
  'inteiro ignorando o que tem estorno de pé, misturando só purchase e a perna positiva de '
  'production. Chamada pelo gatilho reversal_recomputes_cost.';
