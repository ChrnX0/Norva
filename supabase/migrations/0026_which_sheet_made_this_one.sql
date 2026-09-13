-- O lote passa a dizer QUAL FICHA rodou.
--
-- A auditoria da Fase 1 marcou isto como o único item ausente, e ele voltou pela
-- metade: `production_runs.recipe_version_id` recebia o id da RECEITA na coluna
-- da VERSÃO, e a linha da corrida é apagada ao fechar ou cancelar. Nada durável,
-- dos dois lados, dizia de que ficha aquele picolé saiu.
--
-- O custo disso aparece no dia em que alguém corrige a fórmula: sem o carimbo,
-- custo histórico e recall passam a apontar para a receita de HOJE, e uma
-- correção feita em março reescreve o que janeiro custou. O livro-razão é
-- imutável exatamente para isso não acontecer — a taxa congelada continuava
-- certa, mas a pergunta "de que ficha veio?" não tinha resposta em lugar nenhum.
--
-- A marca fica no LOTE, e não na corrida, porque o lote é o que sobrevive: ele
-- não é apagado, é o que a etiqueta nomeia, e é por ele que um recall começa.
--
-- Anulável de propósito. Lote de importação não tem ficha, e lote gravado antes
-- desta migração também não — pôr `not null` aqui obrigaria a inventar uma ficha
-- para linhas que não têm, que é o oposto do que esta coluna existe para fazer.
-- A chave estrangeira, essa é de verdade: um lote que aponta para uma versão que
-- não existe é pior que um lote calado.
--
-- A ordem da fila do aparelho já resolve a dependência sem ninguém ordenar nada:
-- a versão da receita é gravada quando a ficha é salva, muito antes da corrida
-- que a usa, e a fila sobe da escrita mais velha para a mais nova.

alter table lots add column recipe_version_id uuid references recipe_versions(id);

create index lots_recipe_version_idx on lots (company_id, recipe_version_id)
  where recipe_version_id is not null;
