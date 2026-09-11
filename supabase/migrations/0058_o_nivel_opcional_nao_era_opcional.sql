-- -----------------------------------------------------------------------------
-- 0058 - O nível opcional não era opcional
--
-- Achado em 11 de setembro pela garantia 30 do `db:verify`, escrita para provar a
-- decisão do dono de que *"o produto nao necessariamente requeira todas as
-- subclasses"*. A primeira tentativa de inserir um produto com PRODUTO preenchido
-- e TIPO vazio devolveu:
--
--   ERROR: insert or update on table "products" violates foreign key constraint
--          "product_type_belongs_to_its_line"
--   DETAIL: MATCH FULL does not allow mixing of null and nonnull key values.
--
-- A `0018` afirma, no mesmo arquivo que cria essa restrição:
--
--   *"Os três níveis são OPCIONAIS, e isso é a fundação do 'depende vira dado':
--   uma fábrica que faz um doce só não deve ser obrigada a inventar uma linha e
--   um tipo para cadastrá-lo. Quem tem um nível só preenche um nível só."*
--
-- E a restrição torna isso impossível. `match full` exige o par inteiro ou
-- inteiramente nulo, então `(linha = X, tipo = nulo)` é recusado — que é
-- exatamente "quem tem um nível só preenche um nível só".
--
-- **O arquivo se contradiz, e nada pegou por três semanas porque nenhum teste
-- jamais inseriu um produto classificado só pelo nível de cima.** Verde não quer
-- dizer protegido: quer dizer que os exemplos escolhidos não exercitam a regra.
--
-- E o raciocínio da `0018` estava meio certo, o que é o que o torna difícil de
-- ver. Ela queria impedir `(linha = nulo, tipo = Y)` — um tipo pendurado em nada,
-- que `match simple` deixa passar porque desliga a checagem quando QUALQUER coluna
-- é nula. Isso é um perigo real. O que ela não viu é que `match full` paga esse
-- preço proibindo junto o caso comum.
--
-- Os dois se resolvem separados, e cada um com a ferramenta certa:
--
--   * a CHAVE, em `match simple`, prova que o par existe quando os dois estão
--     preenchidos — que é a única hora em que há o que provar;
--   * o CHECK diz a direção: tipo exige produto, produto não exige tipo.
--
-- Isso é o que "opcional para baixo" quer dizer numa cadeia, e é o que a decisão
-- do dono pede para os quatro níveis.

alter table products
  drop constraint product_type_belongs_to_its_line;

alter table products
  add constraint product_type_belongs_to_its_line
    foreign key (type_id, line_id) references product_types (id, line_id)
    on delete restrict;

-- A direção da cadeia, dita uma vez por nível. Sem isto, `match simple` aceitaria
-- um tipo sem produto — o "tipo pendurado em nada" que a `0018` tinha razão em
-- temer, e que sozinha ela não conseguia separar do caso comum.
alter table products
  add constraint product_levels_fill_top_down
    check (
      (type_id     is null or line_id     is not null) and
      (category_id is null or line_id     is not null) and
      (flavor_id   is null or line_id     is not null)
    );

-- E o mesmo para o tipo: categoria sem produto não existe. Aqui a coluna de cima
-- já é NOT NULL, então a regra é sobre a categoria apontar para o produto certo —
-- e essa continua sendo da escrita, pelo motivo escrito na `0057`.
