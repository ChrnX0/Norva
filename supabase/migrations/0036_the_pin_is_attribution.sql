-- O PIN da grade de nomes, e o que ele NÃO é.
--
-- A decisão do dono é de 1 de setembro: no chão de fábrica com aparelho
-- compartilhado, entra-se por uma grade de nomes com PIN — *"dois segundos, de
-- luva, offline"*. O estudo de 6 de setembro (`docs/estudo-entrada.md`) mediu o
-- que isso pode significar, e a conclusão fica aqui porque coluna sem a razão ao
-- lado é lida como a razão que o leitor imaginar.
--
-- **Isto é ATRIBUIÇÃO, não autenticação.** Quem autentica contra este servidor é
-- a CONTA: `movements_append` exige `recorded_by = auth.uid()` e confere
-- `has_capability` da conta (0008). O PIN não aparece em política nenhuma e não
-- vai aparecer: ele responde *"quem estava com o aparelho"*, que é a pergunta que
-- `operator_id` carrega desde a 0014 — e a resposta dela sempre foi uma
-- declaração de quem estava lá, não uma prova.
--
-- **Texto puro, e é escolha.** Quatro dígitos são dez mil possibilidades: sem
-- derivação lenta, hash não compra quase nada contra quem já tem o banco. E
-- contra quem tem o banco da empresa, nada aqui protegeria — quem manda nesse
-- caso é o RLS, que não deixa outra empresa ler a linha.
--
-- A restrição de forma existe para o erro IMPEDIR em vez de reclamar: PIN com
-- letra ou com três dígitos não entra, e a tela não precisa validar duas vezes.
alter table people
  add column pin text
  constraint people_pin_is_digits check (pin is null or pin ~ '^[0-9]{4,8}$');

comment on column people.pin is
  'Atribuição, não autenticação: diz quem tocou no nome, não prova identidade. '
  'Nulo é o caso normal — pessoa sem PIN é escolhida com um toque só.';
