-- Quem estava operando naquele momento, anotado no registro.
--
-- Decisão do dono, e ela desfaz um nó que eu tinha dado sozinho. O login
-- autentica **o sistema**: a conta é da empresa, e a empresa distribui acesso
-- criando outros e-mails ou mandando código de convite por perfil. Não é o
-- e-mail pessoal do operador que entra no app.
--
-- Então "quem gravou" e "quem estava operando" são duas perguntas diferentes, e
-- eu estava tentando fazer uma coluna responder as duas:
--
--   `recorded_by`  - qual CONTA escreveu. O servidor impõe
--                    `recorded_by = auth.uid()` desde a fundação: ninguém
--                    assina no nome de ninguém, nem o dono. Fica como está.
--   `operator_id`  - quem estava com o aparelho na hora. Anotado no momento do
--                    registro, escolhido na lista de gente da empresa.
--
-- Com as duas separadas, o celular compartilhado deixa de ser um problema de
-- autenticação e vira o que sempre foi: uma pergunta a mais na tela de
-- registro, para a empresa que quiser fazê-la.
alter table movements
  add column operator_id uuid references memberships(id) on delete restrict;

-- Nulo é o padrão e é honesto: a empresa que não quer nomear ninguém não
-- nomeia, e a linha continua respondendo pelo aparelho e pela conta. Quem quer
-- nomear liga `companies.names_who_recorded`, que já existe desde a 0012.
create index movements_operator_idx on movements (company_id, operator_id)
  where operator_id is not null;

comment on column movements.operator_id is
  'Quem estava operando quando a linha foi escrita. Diferente de recorded_by, '
  'que é a conta que escreveu e não pode ser cedida a ninguém.';
