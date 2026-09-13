-- O nível cheio de um item.
--
-- O dono desenhou as faixas de volume em porcentagem — vermelho até 25, amarelo
-- até 40, verde no meio, azul acima de 80, e zerado à parte — e porcentagem é
-- sempre de alguma coisa. Sem uma referência cadastrada, "20%" é um número que
-- ninguém pode conferir, e pintar a linha de vermelho por conta própria seria
-- exatamente o alerta inventado que ensina a ignorar alerta.
--
-- Nulo é o caso normal: o item não entra na leitura por faixa e nenhuma tela
-- pinta cor nele. É a mesma forma da validade em `products.shelf_life_days` —
-- campo opcional cujo vazio significa "não me pergunte isso".
--
-- Em unidade-base como todo o resto do estoque, então a porcentagem se calcula
-- sem conversão no caminho: um saco de 50 kg de açúcar é 50000 g.
alter table items add column full_level numeric(14,4)
  check (full_level is null or full_level > 0);
