-- A embalagem digitada vira TAXA, porque preço por unidade sempre foi taxa.
--
-- `products.unit_packaging_cents` é `bigint` e guarda o valor que a fábrica
-- digita para o que NÃO lista no estoque — rótulo, fita, o que ninguém quer
-- contar (migração 0022). O aparelho fazia `Math.round(valor * 100)` antes de
-- gravar, então um rótulo a R$ 0,004 por unidade virava ZERO — e esse zero
-- entrava no `unit_cost_rate` congelado de cada corrida, que não se corrige:
-- se estorna.
--
-- É a fundação da casa na letra: `Cents` é inteiro, `Rate` é fracionário, e
-- preço por unidade é taxa. Mesmo defeito da polpa a R$ 12,40/kg — 1,24 centavo
-- por grama —, num canto onde ninguém tinha olhado.
--
-- A coluna antiga FICA e para de ser lida. Migração é append-only nos dois
-- lados: apagá-la faria o banco divergir de qualquer aparelho que já rodou a
-- 0022. A nova nasce preenchida a partir dela, preservando o que cada fábrica
-- já tinha digitado.
--
-- `numeric` e não `double precision`: dinheiro não é float em lugar nenhum
-- deste sistema, e uma taxa é dinheiro por unidade.

alter table products
  add column if not exists unit_packaging_rate numeric not null default 0;

update products set unit_packaging_rate = unit_packaging_cents;
