-- O relatório operacional nomeia a pessoa, ou o lugar?
--
-- A pergunta parecia ser sobre o que gravar, e não era: `movements.recorded_by`
-- já é `not null` desde a primeira migração. O livro-razão sempre soube quem
-- fez. Auditoria precisa disso e continua tendo.
--
-- O que estava em aberto é outra coisa: se a **interface** atribui um movimento
-- de chão de fábrica a um nome. E isso é preferência de empresa - uma fábrica
-- de três pessoas não quer nome nenhum, uma de quarenta com problema de furo
-- quer - então vira dado, não código, e não vira pergunta ao dono.
--
-- O padrão é `false`, e o motivo está no tom de voz deste produto: ele orienta e
-- não fiscaliza, e nunca culpa pessoa. A cadeia de custódia existe para
-- LOCALIZAR a perda - a diferença entre dois postos diz se foi separação, rota
-- ou recebimento - e "faltaram 3 caixas na conferência" resolve isso sem que
-- ninguém precise ser nomeado. Equipe que vê o app como inimigo sabota o dado,
-- e aí não há relatório nenhum.
--
-- Quem quiser nomear liga. O dado está lá desde sempre.
alter table companies
  add column names_who_recorded boolean not null default false;

comment on column companies.names_who_recorded is
  'Se os relatórios operacionais mostram quem registrou. O ledger sempre grava; '
  'isto decide se a tela conta. Padrão falso: localizar a perda, não acusar.';
