-- Corrigir o rendimento reescrevia o que a versão de janeiro dizia.
--
-- Decisão do dono, 9 de setembro, sobre uma recomendação minha — e a medida mudou a
-- forma dela no caminho, então vale dizer o que se achou.
--
-- **O que JÁ estava certo.** As linhas da ficha são versionadas (`recipe_lines` aponta
-- para `recipe_version_id`), o lote carimba de que versão saiu (`lots.recipe_version_id`,
-- com o motivo escrito na `0002`: *"sem este carimbo, corrigir a fórmula em março
-- reescreve o que janeiro custou"*), e o custo unitário congela no próprio movimento. Três
-- camadas, e todas contra o mesmo defeito.
--
-- **O que escapou das três: os RENDIMENTOS, e são dois.** `recipes.yield_amount` diz
-- quanto uma batelada rende de massa; `products.yield_per_unit` diz quantas unidades saem
-- de uma batelada. Nenhum dos dois é versionado, e `saveRecipeVersion` grava a receita com
-- `on conflict do update set yield_amount = excluded.yield_amount` — ou seja, salvar a
-- versão 3 com um rendimento novo faz as versões 1 e 2 passarem a afirmar o número de
-- hoje. A ficha de janeiro mente, e ela mente em silêncio.
--
-- **Por que entra agora, e é o único caso em que a janela ganha do portão P1.** Nenhuma
-- tela lê hoje uma versão antiga: o editor de ficha mostra a atual, e a tela de histórico
-- de fichas não existe. Pelo P1 — *"quem chama isto no mesmo commit? sem chamador, não
-- entra"* — a coluna esperaria por ela.
--
-- O que inverte é o P3: **forma de esquema se adivinha de graça enquanto há zero linhas**,
-- e aqui não há uma linha em servidor nenhum. Depois de a primeira fábrica produzir, o
-- rendimento de cada versão passada é informação que ninguém tem como reconstruir — não é
-- migração cara, é migração impossível. A fronteira fica dita: **quem vai ler é a tela de
-- histórico da ficha**, e enquanto ela não existir estas colunas guardam sem serem lidas.
--
-- O backfill copia o que vale hoje para as versões que já existem. Ele mente um pouco por
-- construção — se alguém já corrigiu um rendimento, a versão antiga recebe o número novo,
-- que é exatamente o defeito. Mas é o melhor disponível: o número de antes não está em
-- lugar nenhum. E ele acerta em todo servidor de hoje, porque todos têm zero linhas.

alter table recipe_versions
  add column yield_amount numeric(12,4),
  add column yield_unit text,
  -- Nulo é estado legítimo: sub-receita (base de creme) não vira unidade de venda, e
  -- inventar 1 ali faria a conta de custo por unidade responder para quem não pergunta.
  add column yield_per_unit numeric(12,4);

update recipe_versions v
   set yield_amount = r.yield_amount,
       yield_unit   = r.yield_unit
  from recipes r
 where r.id = v.recipe_id
   and r.company_id = v.company_id
   and v.yield_amount is null;

update recipe_versions v
   set yield_per_unit = p.yield_per_unit
  from products p
 where p.recipe_id = v.recipe_id
   and p.company_id = v.company_id
   and p.active
   and v.yield_per_unit is null;

comment on column recipe_versions.yield_amount is
  'Quanto uma batelada rendia NESTA versão. Fica aqui e não em `recipes` porque lá ela é '
  'sobrescrita a cada salvamento, e a versão passada passa a afirmar o número de hoje. '
  'Ver 0052.';

comment on column recipe_versions.yield_per_unit is
  'Quantas unidades de produto uma batelada rendia NESTA versão. Nulo para ficha que não '
  'vira unidade de venda. Ver 0052.';
