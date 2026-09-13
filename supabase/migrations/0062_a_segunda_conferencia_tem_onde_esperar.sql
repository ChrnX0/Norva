-- A conferência que PERDE precisa de um lugar, senão a decisão do dono não tem onde acontecer.
--
-- Decisão de 11 de setembro, com todas as letras: *"assim q sincronizarem uma mensagem aparece
-- dizendo q tem duplicação de dados, mostra os dados (com a data, horário e local e nome do
-- operador, por exemplo) para os dois celulares e o primeiro q aceitar fica como permanente."*
--
-- O código fazia a metade. A `0051` recusa a segunda conferência da mesma remessa — e é ela
-- que impede o saldo dobrar, então ela fica. Só que a recusada morria ali: `classeDaRecusa`
-- trata `23505` como permanente (com razão), `markRejected` põe a linha de lado, e o que sai
-- de lado não volta. O aparelho que perdeu via a própria conferência sumir; o que ganhou não
-- via nada. Nenhum dos dois tinha como aceitar coisa alguma.
--
-- ## Por que uma tabela nova, e não `movements`
--
-- A alternativa óbvia — deixar as duas entrarem no razão e marcar uma como pendente — foi
-- recusada por medida, não por gosto: o razão é a soma dos movimentos, e uma linha que "ainda
-- não conta" é um estado que o livro-razão não tem vocabulário para dizer. Todo saldo do
-- aplicativo passaria a precisar saber sobre pendência. `movements` continua com UMA
-- conferência de pé por remessa, sempre, e o saldo nunca dobra nem por um instante.
--
-- **Só a PERDEDORA mora aqui.** A vencedora já está em `movements` e desce sozinha pela
-- descida da `0061` — guardá-la de novo seria duas fontes para o mesmo fato, e elas divergem
-- no primeiro conserto de uma delas. A tela pareia a candidata com o movimento de pé do mesmo
-- grupo e item.
--
-- ## E o "PRIMEIRO que aceitar" mora na POLÍTICA, não no aplicativo
--
-- Esta é a parte que o desenho inicial errava, e o erro é do tipo que só aparece com duas
-- pessoas ao mesmo tempo. Aceitar era `update check_candidates set resolution = ...`, e sem
-- condição **dois celulares aceitando no mesmo minuto gravam os dois**: o último vence, que é
-- o contrário exato do que foi pedido. Não fica o primeiro — fica o mais lento.
--
-- A política de `update` tem `using (resolution is null)`. Decidida a linha, ela deixa de ser
-- visível para escrita, para todo mundo: a segunda aceitação não erra, ela simplesmente não
-- alcança linha nenhuma, e o aparelho lê zero linhas afetadas como *"alguém já decidiu"* — que
-- é uma frase honesta e não um erro. Pôr isso no cliente seria confiar em quem está do lado de
-- fora da fronteira; a fundação desta casa manda a permissão morar na consulta, e arbitragem é
-- permissão sobre o tempo.

create table if not exists check_candidates (
  -- O MESMO id do movimento que o servidor recusou. Reenviar a candidata é inofensivo (a fila
  -- sobe por `on conflict (id) do nothing`), e o aparelho consegue casar a candidata com a
  -- linha que ele tem posta de lado.
  id uuid primary key,
  company_id uuid not null references companies(id) on delete cascade,

  -- Os quatro fatos que a decisão do dono nomeia, mais o que identifica a remessa.
  movement_group_id uuid not null,
  item_id uuid not null references items(id) on delete cascade,
  location_id uuid references locations(id),
  operator_id uuid references people(id),
  occurred_at timestamptz not null,
  quantity_base_units numeric not null,

  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null,

  -- O cursor da descida, igual ao das três da `0061`: a candidata tem de chegar aos DOIS
  -- celulares, senão só quem perdeu sabe que houve disputa.
  received_at timestamptz not null default now(),

  -- Nulo enquanto ninguém decidiu. `first` mantém a que está de pé no razão; `second` estorna
  -- a de pé e deixa esta entrar.
  resolution text check (resolution in ('first', 'second')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),

  -- As três andam juntas ou nenhuma anda. Uma resolução sem quem e sem quando é uma decisão
  -- sem dono, e este projeto acabou de gastar uma rodada porque `operator_id` tinha sete
  -- escritores e nenhum leitor: campo que não é cobrado não é preenchido.
  constraint check_candidates_resolution_complete check (
    (resolution is null and resolved_at is null and resolved_by is null)
    or (resolution is not null and resolved_at is not null and resolved_by is not null)
  )
);

comment on table check_candidates is
  'A conferência que a 0051 recusou, esperando uma pessoa decidir. Só a PERDEDORA mora aqui: '
  'a vencedora está em movements e desce sozinha. O "primeiro que aceitar fica" é imposto pela '
  'política de update (using resolution is null), não pelo aplicativo — dois celulares '
  'aceitando ao mesmo tempo gravariam os dois, e o último venceria.';

comment on column check_candidates.resolution is
  'first mantém a conferência de pé no razão; second estorna a de pé e deixa esta entrar. '
  'Nulo é "ninguém decidiu ainda", e é o único estado em que a linha aceita escrita.';

create index if not exists check_candidates_received_idx
  on check_candidates (company_id, received_at, id);

create index if not exists check_candidates_pendentes_idx
  on check_candidates (company_id, movement_group_id, item_id)
  where resolution is null;

alter table check_candidates enable row level security;

-- Ler: qualquer membro da empresa. A duplicação aparece para os DOIS celulares, e é isso que
-- a decisão pede — quem não vê não tem como aceitar.
create policy check_candidates_read on check_candidates
  for select
  using (company_id in (select private.current_companies()));

-- Escrever a candidata: quem pode conferir. É a mesma capacidade que escreve a `discrepancy`
-- no razão, porque é o mesmo ato — o servidor é que decidiu qual das duas entra.
create policy check_candidates_append on check_candidates
  for insert
  with check (private.has_capability(company_id, 'adjust_stock'));

-- Decidir: quem pode conferir, e SÓ enquanto ninguém decidiu.
--
-- `using` é o filtro de quem PODE ser escrito e `with check` é o que a linha pode virar. Os
-- dois juntos dizem a regra inteira: só linha sem decisão aceita escrita, e a escrita não pode
-- desfazer uma decisão. Sem o `with check`, um segundo `update` mudaria `first` para `second`
-- dentro da mesma requisição em que a linha ainda parecia livre.
create policy check_candidates_decide on check_candidates
  for update
  using (resolution is null and private.has_capability(company_id, 'adjust_stock'))
  with check (private.has_capability(company_id, 'adjust_stock'));

-- **Sem `grant`, e isto é medido — a `0057` já pagou por ele.** A primeira escrita desta
-- migração terminava com `grant … to authenticated`, e o `db:verify` recusou em segundos:
-- `role "authenticated" does not exist`. Nenhuma das sessenta e uma migrações anteriores
-- concede permissão de tabela: no Supabase ela vem do papel `authenticated`, que o servidor
-- cria, e no verificador o `app_user` recebe `select on all tables` depois que as migrações
-- rodam — ele existe justamente para a RLS valer de verdade, já que dono de tabela a ignora.
-- Tabela nova entra coberta pelos dois lados sem uma linha aqui.
