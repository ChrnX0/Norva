-- A grade existia para escrever o NOME, e mais nada.
--
-- Decisão do dono, 10 de setembro, e ela veio de uma leitura do sistema anterior
-- dele. A tentativa passada tinha um catálogo de categorias (picolé de água,
-- picolé de leite, skimó, sorvete de 500 e de 1 L) que parecia regra chumbada de
-- sorvete — e não era. Ele disse por que existia: *"foi para ele entender o q vc
-- tb está tendo dificuldade de entender"*.
--
-- O que a categoria fazia lá não era nomear: era dizer **como aquela família é
-- contada e embalada**. Picolé próprio vem em caixa de 44 e engradado de 6;
-- picolé comprado para revenda vem na caixa do fornecedor, com 24; sorvete não
-- tem caixa nenhuma, a unidade é o pote. Três réguas diferentes, uma por família,
-- decididas uma vez — não a cada produto cadastrado.
--
-- Aqui a peça já existia e estava pela metade. `product_lines` e `product_types`
-- entraram na `0018` e carregam `name`, `sort` e `active`; as duas telas que as
-- leem (`app/products/new.tsx`, `app/catalog.tsx`) usam a grade para COMPOR O
-- NOME do produto e nada além disso. A embalagem continuava sendo perguntada
-- produto a produto, com um padrão que eu inventei — cinquenta por caixa, seis
-- caixas por engradado — e que nenhuma fábrica confirmou.
--
-- Isso é a fundação "depende vira dado" aplicada onde ela ainda não estava: a
-- resposta certa para "quantos cabem numa caixa" depende da família, então a
-- família guarda a resposta, e o cadastro do produto nasce preenchido em vez de
-- perguntar de novo.
--
-- **A forma é a hierarquia que já existe, não uma segunda.** Poderiam ser duas
-- colunas — `units_per_box`, `boxes_per_crate` —, e seria mais simples de ler
-- nesta linha e pior em tudo o mais: `items.packaging` já guarda faixas
-- (`[{"id":"unit","perBaseUnit":1},…]`), quem tem três níveis não cabe em duas
-- colunas, e duas formas para a mesma coisa envelhecem uma contra a outra. A
-- linha guarda o MESMO formato que o produto guarda.
--
-- **Nulo é um estado legítimo e é o padrão.** Linha sem embalagem definida não
-- afirma nada, e o cadastro do produto continua perguntando como pergunta hoje.
-- Quem define uma vez para de ser perguntado.

alter table product_lines add column packaging jsonb;

-- A mesma guarda que a `0022` pôs na embalagem do produto: o que entra aqui é
-- lista de faixas, e um objeto solto ou um número quebrariam a leitura sem dizer
-- por quê.
alter table product_lines
  add constraint product_lines_packaging_is_array
  check (packaging is null or jsonb_typeof(packaging) = 'array');
