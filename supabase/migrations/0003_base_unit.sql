-- =============================================================================
-- 0003 - the unit an item is actually used in
-- =============================================================================
--
-- 0001 recorded how an item is *bought* (a 25 kg sack) and how many base units
-- that holds (25,000). What it never recorded was what that base unit is
-- called. The app needed it the moment a screen tried to say a sentence:
--
--   "R$ 118 ÷ 25.000 = R$ 4,72 a cada 1.000 g"
--
-- Without the word, every hint has to guess "g" - which is wrong for syrup in
-- millilitres and absurd for sticks counted one by one. The device schema
-- already carries it, so the server has to as well or the sync loses it.
--
-- Existing rows default to 'un', the only honest answer for data recorded
-- before the question was asked: one of whatever it was.

alter table items
  add column if not exists base_unit text not null default 'un';

comment on column items.base_unit is
  'The smallest unit a recipe works in: g, ml, un. Purchase units convert into it.';
