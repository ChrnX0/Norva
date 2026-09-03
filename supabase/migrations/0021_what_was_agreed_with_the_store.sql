-- A ficha de acordo da loja.
--
-- Uma fábrica combina "terça e sexta" com uma loja e "sábado" com outra, e até
-- aqui essa tabela morava na cabeça de alguém. Enquanto ela mora lá, o pedido
-- nasce com a data errada e a carga sai no dia em que a loja está fechada.
--
-- Os dias são um bitmask com o bit 0 no domingo, a mesma numeração de
-- `Date.getDay()` no aparelho (`src/domain/agreement.ts`). Um inteiro atravessa
-- a fila do aparelho sem conversão nenhuma, e é isso que garante que os dois
-- lados leiam o mesmo acordo — uma lista de texto tem duas gramáticas
-- possíveis e a divergência aparece só no dia da entrega.
--
-- Zero é "não combinamos dia", que NÃO é "nenhum dia": a loja sem acordo recebe
-- quando dá, e nenhuma tela deve inventar um dia para ela.
alter table locations add column contact_phone text;
alter table locations add column delivery_days smallint not null default 0;
alter table locations add column agreement_note text;

-- Um acordo impossível é erro de digitação, não combinação exótica: sete bits
-- é a semana inteira, e o banco recusa em vez de guardar um dia que não existe.
alter table locations add constraint locations_delivery_days_is_a_week
  check (delivery_days between 0 and 127);
