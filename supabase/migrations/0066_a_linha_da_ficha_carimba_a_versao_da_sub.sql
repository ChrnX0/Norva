-- A sub-receita editada no meio da corrida mudava o custo CONGELADO.
--
-- `recipe_lines` diz que uma linha pode ser outra receita — a base de creme que oito sabores
-- usam — e guarda só `sub_recipe_id`. Quem resolve o grafo pega sempre a versão MAIS NOVA da
-- sub. Então editar a base entre abrir e fechar o tacho muda o que aquela corrida custou, e
-- custo congelado é conteúdo de livro-razão: não se corrige, se estorna.
--
-- O tamanho disso não é hipótese. Uma base de creme usada por oito sabores entra em oito fichas;
-- mexer nela porque o leite em pó mudou de marca reescreve o custo de toda corrida aberta e de
-- todo lote que ainda não fechou. O dono corrige a receita de manhã e o relatório da semana passa
-- a discordar do que ele viu ontem, sem uma linha de aviso.
--
-- ## A forma, e por que a chave composta
--
-- A linha passa a NOMEAR a versão: `sub_recipe_version_id`. Sem a chave composta ela poderia
-- nomear uma versão de OUTRA receita — `sub_recipe_id` aponta para a calda e
-- `sub_recipe_version_id` para uma versão do picolé de morango —, e o custo sairia de uma ficha
-- que ninguém pediu, com as duas colunas válidas cada uma por si. Duas chaves estrangeiras
-- separadas não conseguem dizer *"a versão nomeada é DESTA receita"*; uma composta diz, e por
-- isso `recipe_versions` ganha `unique (recipe_id, id)` — o par que ela referencia.
--
-- `MATCH SIMPLE` é o padrão do Postgres e é o que se quer aqui: com uma das duas colunas nula, a
-- chave não é verificada. É isso que deixa a linha ANTIGA (sem carimbo) passar sem a migração
-- precisar inventar um valor para ela.
--
-- E o `check` fecha a combinação sem sentido: carimbo sem sub-receita. Uma linha de ITEM não tem
-- versão de receita a nomear, e uma coluna preenchida ali seria dado que ninguém lê — o começo
-- de uma divergência silenciosa.
--
-- ## NULO lê como "a mais nova", e é fronteira e não regra
--
-- Um carimbo nulo existe para a linha escrita por um aparelho anterior ao passo `V` do SQLite, e
-- o resolvedor cai na versão atual da sub. Isso preserva o comportamento de hoje para o dado de
-- ontem, em vez de recusá-lo — mas é fronteira, não desenho: quem escreve carimbo nulo NOVO está
-- gravando uma linha cujo custo muda sozinho depois.
--
-- ## `on delete restrict`, e por que ele não tranca o Reset
--
-- Apagar uma versão que uma linha carimba apagaria a explicação de um custo que já está no razão.
-- O Reset não bate nisso porque ele apaga na ordem certa: `private.wipe_company` derruba
-- `recipe_lines` antes de `recipe_versions` (`0049`), e `src/data/erase.ts` faz o mesmo no
-- aparelho. A ordem já estava certa por outro motivo, e continua sendo conferida lá.
--
-- ## A ORDEM DE IMPLANTAÇÃO, que é a parte perigosa
--
-- **Esta migração é aplicada ANTES de qualquer APK que mande a coluna.** O aparelho manda
-- `sub_recipe_version_id` no `upsert` de `recipe_lines`; contra um servidor sem a coluna, o
-- PostgREST responde `PGRST204` ("column not found"), que não é um `SQLSTATE` de recusa
-- permanente — `classeDaRecusa` o trata como PASSAGEIRO, e a fila inteira fica presa atrás
-- daquela linha, com espera exponencial, para sempre. É o defeito mais caro desta fila, e aqui
-- ele é evitado por ORDEM e não por código.

alter table recipe_versions
  add constraint recipe_versions_recipe_and_id_key unique (recipe_id, id);

alter table recipe_lines
  add column if not exists sub_recipe_version_id uuid;

alter table recipe_lines
  add constraint recipe_lines_sub_version_is_of_sub
  foreign key (sub_recipe_id, sub_recipe_version_id)
  references recipe_versions (recipe_id, id)
  on delete restrict;

alter table recipe_lines
  add constraint recipe_lines_sub_version_needs_sub
  check (sub_recipe_version_id is null or sub_recipe_id is not null);

-- O carimbo das linhas que já existem: a versão mais nova da sub, que é exatamente o que o
-- resolvedor lia antes desta migração. Hoje é no-op — nenhuma linha de sub-receita foi gravada em
-- servidor nenhum —, e ele existe para o dia em que alguém aplicar isto num banco com histórico.
--
-- `order by version desc` e não `created_at`: a versão é o número que a fábrica enxerga, e duas
-- versões podem nascer no mesmo instante quando a fila sobe em lote.
update recipe_lines l
   set sub_recipe_version_id = (
     select v.id from recipe_versions v
      where v.recipe_id = l.sub_recipe_id
      order by v.version desc
      limit 1)
 where l.sub_recipe_id is not null
   and l.sub_recipe_version_id is null;

create index if not exists recipe_lines_sub_version_idx
  on recipe_lines (sub_recipe_version_id)
  where sub_recipe_version_id is not null;

comment on column recipe_lines.sub_recipe_version_id is
  'Qual VERSAO da sub-receita esta linha compos. Nulo le como "a mais nova" e existe so para '
  'linha escrita por aparelho anterior ao passo V: sem o carimbo, editar a sub muda o custo '
  'congelado de uma corrida aberta, e custo congelado nao se corrige.';
