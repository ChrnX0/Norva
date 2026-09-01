-- Two columns the device has been writing with nowhere to put them.
--
-- Found by taking the device's outbox and asking, row by row, what Postgres
-- would do with it. Neither is exotic; both were invisible because nothing had
-- ever tried to replay a queue against this schema.

-- 1. The order somebody wrote the ingredients in.
--
-- `recipe_lines.position` exists on the device and does not exist here, so a
-- recipe that synced would come back on another phone with its ingredients in
-- whatever order Postgres felt like. That is not a cosmetic loss: a technical
-- sheet is read top to bottom while somebody is working, and the person who
-- wrote it put the base first and the colouring last on purpose.
alter table recipe_lines add column position integer not null default 0;

create index recipe_lines_order_idx on recipe_lines (recipe_version_id, position);

-- 2. The supplier as a name, because that is what people type.
--
-- `supplier_id` points at the `suppliers` table, which is the right shape once
-- suppliers are a thing somebody manages. Today the buyer types "Fornecedor
-- Silva" into a field, and that text had nowhere to land - the invoice would
-- arrive on the server having forgotten who sold it.
--
-- Both columns stay: the name is what was typed, the id is what it resolves to
-- when suppliers become real. Neither is required, and a purchase carrying only
-- a name is a complete record of what actually happened.
alter table purchases add column supplier_name text;
