-- O palito sai do estoque.
--
-- Até aqui a embalagem era um valor DIGITADO no produto
-- (`products.unit_packaging_cents`), enquanto palito e saquinho são itens
-- comprados por nota. O custo congelado saía certo — a correção está em
-- `docs/insights.md` —, mas nenhum movimento tirava palito do almoxarifado: o
-- saldo dele só subia, que é exatamente o cheiro que o CLAUDE.md manda procurar.
-- A cura ficou escrita naquele registro, e é esta.
--
-- A quantidade é POR UNIDADE PRODUZIDA, e é isso que a separa de uma linha de
-- receita. Receita se espalha pelo que o tacho rendeu: meio tacho consome
-- metade do açúcar. Palito não se espalha — uma unidade leva um palito tenha a
-- corrida rendido 400 ou 500.
--
-- Lista em `jsonb` na própria linha do produto, pelo mesmo motivo que
-- `items.packaging` já é: curta, reescrita inteira, sem histórico próprio. O
-- histórico é o consumo que cada corrida gravou com a taxa congelada, e esse
-- está em `movements`, que ninguém reescreve.
--
-- `unit_packaging_cents` continua e não vira duplicidade: passa a ser o que NÃO
-- está listado aqui. Quem não quer contar palito digita o valor; quem quer,
-- lista os itens. Os dois caminhos existem, como manda o projeto.
alter table products add column packaging_items jsonb not null default '[]'::jsonb;

-- Um objeto onde deveria haver lista atravessa o `jsonb` sem reclamar e só
-- aparece na hora de somar o consumo. Mesma razão do `structure()` no
-- aparelho: a falha que ainda parece sucesso é a que merece uma restrição.
alter table products add constraint products_packaging_items_is_a_list
  check (jsonb_typeof(packaging_items) = 'array');
