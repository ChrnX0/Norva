-- O produto fabricado não tinha custo, dos dois lados, e o dinheiro sumia.
--
-- `apply_purchase_to_cost` (0009) é o único autor de `item_costs` neste
-- servidor, e ele dispara em `purchase_lines`. Picolé nunca é comprado — ele
-- sai do tacho —, então nunca teve linha em `item_costs`, então valia zero.
--
-- O efeito somado é pior que um número feio numa tela. O consumo tira o insumo
-- do saldo com o valor dele junto, e a produção põe o produto de volta valendo
-- nada: **o dinheiro evapora do balanço a cada corrida**. Na `stock_balances`
-- de uma loja com 1.466 picolés, "vale R$ 0,00".
--
-- O aparelho passou a ser autor da média do produto na mesma rodada, e este é
-- o espelho: a mesma média móvel, sobre a mesma pergunta, para os dois lados
-- concluírem o mesmo número. `item_costs` continua fora da fila de sincronia —
-- valor derivado tem um autor por lado, e mandar o número pronto foi o que já
-- pôs servidor e aparelho discordando uma vez (0.5605 contra 0.5310).
--
-- A fonte aqui é `movements.unit_cost_rate`: a taxa que a corrida congelou,
-- com a embalagem por unidade já dentro. Não se recalcula a receita no
-- servidor — recalcular é convidar os dois lados a divergirem por
-- arredondamento, e a taxa congelada é o fato que o razão guarda.
--
-- Como em 0009, o "antes" exclui a própria linha por id: a ordem em que a fila
-- chega não muda o resultado, e um reenvio não dobra a média.

create or replace function apply_production_to_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  held_units bigint;
  held_rate  numeric(18,8);
  new_rate   numeric(18,8);
begin
  -- Só a perna que CRIA produto. O consumo é negativo e não move a média do
  -- insumo, que é o que o aparelho já dizia em comentário desde o começo.
  if new.kind <> 'production'
     or new.quantity_base_units <= 0
     or new.unit_cost_rate is null then
    return new;
  end if;

  select coalesce(sum(quantity_base_units), 0)
    into held_units
    from movements
   where company_id = new.company_id
     and item_id = new.item_id
     and id <> new.id;

  select average_rate
    into held_rate
    from item_costs
   where company_id = new.company_id and item_id = new.item_id;

  if held_rate is null then
    held_rate := 0;
  end if;

  held_units := greatest(held_units, 0);
  new_rate := ((held_rate * held_units) + (new.unit_cost_rate * new.quantity_base_units))
              / (held_units + new.quantity_base_units);

  insert into item_costs (company_id, item_id, average_rate, last_rate, updated_at)
  values (new.company_id, new.item_id, new_rate, new.unit_cost_rate, now())
  on conflict (company_id, item_id) do update
    set average_rate = excluded.average_rate,
        last_rate = excluded.last_rate,
        updated_at = now();

  -- A história do custo do produto, sem nota: `purchase_line_id` é nulo porque
  -- não houve compra. A coluna sempre aceitou nulo, e é por isso que este
  -- passo não precisa mexer na tabela.
  insert into item_cost_history (company_id, item_id, purchase_line_id, previous_rate, new_rate)
  values (new.company_id, new.item_id, null, nullif(held_rate, 0), new_rate);

  return new;
end;
$$;

drop trigger if exists production_updates_cost on movements;
create trigger production_updates_cost
  after insert on movements
  for each row
  execute function apply_production_to_cost();
