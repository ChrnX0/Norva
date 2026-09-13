-- A variação é da LINHA, e o tipo a estreita quando faz sentido.
--
-- A `0055` prendeu a variação ao tipo, e o dono achou o que aquilo custava em duas
-- frases. Sobre a linha sem tipo: *"nao tem para mim, mas pode ter para outras
-- fabricas"* — que é a regra desta casa inteira, escrita no `CLAUDE.md`: quando a
-- resposta é "depende de quem usa", não se escolhe um lado, os dois caminhos existem.
-- E sobre o pote: *"aqui deveria ser: produto (pote de sorvete) - tipo (volume) -
-- sabor"*, com a ficha técnica sendo a mesma para 250 e 500 ml. Preso ao tipo, isso
-- obrigava a cadastrar ameixa duas vezes.
--
-- As duas se resolvem com o mesmo desenho, e ele é mais simples que o anterior:
--
--   * variação com `type_id` NULO  -> vale para a LINHA inteira (a ameixa do pote, e a
--     fábrica que não usa tipo nenhum);
--   * variação com `type_id` preenchido -> vale só naquele tipo (o morango do picolé de
--     leite, que não é o morango do de água).
--
-- `line_id` entra anulável pela mesma razão da `0055`: NOT NULL numa tabela com linhas
-- exige um valor de origem que não existe. Quem exige linha é a escrita.

alter table flavors
  add column line_id uuid;

alter table flavors
  add constraint flavor_line_same_company
    foreign key (line_id, company_id) references product_lines (id, company_id)
    on delete cascade;

-- O nome passa a ser único DENTRO da linha, e dentro do tipo quando há tipo. É o que
-- deixa "Morango" existir em Leite e em Água, e ao mesmo tempo recusa "Morango" duas
-- vezes no mesmo lugar.
drop index if exists flavors_name_idx;

create unique index flavors_name_idx
  on flavors (
    company_id,
    coalesce(line_id::text, ''),
    coalesce(type_id::text, ''),
    lower(btrim(name))
  );

create index if not exists flavors_line_idx on flavors (company_id, line_id);
