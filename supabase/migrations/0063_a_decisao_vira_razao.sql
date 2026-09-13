-- A decisão existia e não MEXIA no razão. Aceitar mudava uma coluna e mais nada.
--
-- A `0062` deu à conferência que perde um lugar para esperar, e à arbitragem um dono: a
-- política `using (resolution is null)` faz o PRIMEIRO que aceitar ficar, de verdade. O que
-- ela não fez foi tirar a consequência: depois de aceita a candidata, o razão continuava com
-- a conferência VENCEDORA de pé e a decisão dizendo que quem vale é a outra. O número que
-- alguém usa para decidir onde colocar dinheiro ficava contradizendo a decisão que uma pessoa
-- acabou de tomar na tela.
--
-- ## Por que no SERVIDOR, e não no aparelho
--
-- Esta foi a pergunta da rodada, e a resposta tem uma medida por trás. O desenho natural
-- seria o aparelho tirar a consequência: quem decidiu estorna a perdedora e manda o estorno.
-- Ele quebra, e quebra de um jeito que só aparece com dois celulares:
--
--   1. o celular A aceita a candidata do celular B (`resolution = 'second'`);
--   2. A estorna a conferência de A e sobe o estorno;
--   3. a decisão DESCE para B, que roda a mesma regra, olha o razão dele — onde o estorno de A
--      ainda não chegou — e estorna a mesma linha de novo.
--
-- Dois estornos da mesma conferência subtraem a quantidade dela duas vezes. O saldo fica
-- ERRADO PARA BAIXO, e nada reclama: as duas linhas são legítimas, cada uma aponta para a
-- origem certa, e a `0051` não tem o que dizer porque estorno não é conferência. É o defeito
-- mais caro que este projeto pode produzir — corrupção silenciosa de saldo — e ele nasce de
-- uma ordem de chegada, então nem sempre acontece.
--
-- Nenhuma quantidade de idempotência no aparelho resolve isso, porque a pergunta *"alguém já
-- estornou?"* é respondida por um razão que ainda não desceu. **Exatamente-uma-vez só existe
-- onde a arbitragem já é exatamente uma vez**, e esse lugar é a transação que ganha o
-- `using (resolution is null)`. Escrever o estorno no mesmo `update` que decide dá as duas
-- coisas de graça: a segunda aceitação não alcança linha nenhuma, então ela também não
-- estorna nada.
--
-- ## O gatilho é SECURITY INVOKER de propósito
--
-- Ele escreve em `movements` com os privilégios de quem aceitou, não elevados. Isso não é
-- descuido: significa que o gatilho **não consegue escrever nada que a pessoa não pudesse
-- escrever sozinha**. A política de append de `movements` exige `recorded_by = auth.uid()` e
-- a capacidade da espécie; `reversal` pede `adjust_stock`, que é a mesma que a `0062` exige
-- para decidir. Quem pode decidir pode estornar, e quem não pode não decide — as duas
-- fronteiras são a mesma, e é por isso que nenhum `security definer` é necessário aqui.
--
-- ## E `resolved_by` passa a ser incedível
--
-- A `0062` deixava `resolved_by` livre: a política só cobrava a capacidade. Com o gatilho
-- lendo essa coluna para carimbar `recorded_by`, um cliente poderia gravar no razão em nome
-- de outra conta — a única coisa que a fundação desta casa não permite, desde a `0001`. O
-- gatilho usa `auth.uid()` e a política passa a exigir que a coluna diga a mesma coisa, para
-- que o registro e a decisão nunca discordem sobre quem decidiu.

-- ## UM estorno por linha, e isto vale para o razão inteiro
--
-- Não é sobre conferência: estornar a mesma linha duas vezes dobra a correção em qualquer
-- espécie. O aplicativo já sabia disso e perguntava com `not exists (… reverses_movement_id
-- = m.id)` em cinco lugares — `planReversal`, `undoCheck`, `recordCheck`, a doca e o extrato.
-- Cinco perguntas e nenhuma GARANTIA: duas escritas simultâneas passam as duas, porque cada
-- uma lê antes de a outra gravar. O índice é a garantia que faltava, e ele é barato.
--
-- Nulo não conflita com nulo no Postgres, então as linhas que não estornam nada (a esmagadora
-- maioria) não entram na disputa. E `company_id` acompanha porque a `0029` já decidiu que
-- movimento não aponta para fora da empresa — o par é a chave verdadeira.
create unique index if not exists movements_um_estorno_por_linha
  on movements (company_id, reverses_movement_id)
  where reverses_movement_id is not null;

-- A decisão vira razão, no mesmo instante em que ela é tomada.
create or replace function private.a_decisao_vira_razao()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  perdedora movements;
begin
  -- Só a transição de "ninguém decidiu" para "a candidata vale".
  --
  -- `resolution = 'first'` NÃO tem consequência no razão, e isso é a resposta certa e não uma
  -- lacuna: a conferência que o servidor guardou é a que já está de pé. O trabalho de quem
  -- perdeu é no razão LOCAL daquele celular, onde a linha recusada nunca chegou a subir — e
  -- ali o aparelho estorna sozinho, sem enfileirar, porque o servidor não tem o que desfazer.
  --
  -- **E o INSERT conta, não só o UPDATE.** Um celular offline candidata a conferência E decide
  -- antes de ver sinal: as duas escritas ficam na fila, e se a criação for perdida sem ter
  -- subido (a fila esquece o que já foi enviado, e um caminho que a esquecesse antes disso
  -- bastaria), a linha CHEGA já decidida — um `insert`, e um gatilho só de `update` não veria
  -- nada. A decisão viraria coluna sem consequência, que é o defeito inteiro que esta migração
  -- existe para fechar, voltando pela porta estreita. Quem garante o "uma vez" no caminho do
  -- insert é o índice acima: um estorno por linha, imposto pelo banco.
  if tg_op = 'UPDATE' and old.resolution is not null then
    return new;
  end if;
  if new.resolution is distinct from 'second' then
    return new;
  end if;

  -- A conferência de PÉ da mesma remessa e do mesmo item, que é a que perde a disputa.
  --
  -- `id <> new.id` porque a candidata pode já estar no razão — na retentativa de um celular
  -- que subiu a linha depois de a decisão descer — e estornar a vencedora é o ponto, nunca
  -- estornar a si mesma.
  select m.* into perdedora
    from movements m
   where m.company_id = new.company_id
     and m.movement_group_id = new.movement_group_id
     and m.item_id = new.item_id
     and m.kind = 'discrepancy'
     and m.id <> new.id
     and not exists (
       select 1 from movements rev
        where rev.reverses_movement_id = m.id
          and rev.company_id = m.company_id)
   limit 1;

  -- Nada de pé é resposta, não erro: a vencedora pode ter sido desfeita à mão por quem
  -- administra (`undoCheck`) antes de alguém olhar a disputa. A decisão continua valendo e a
  -- candidata sobe pela fila do celular dela, que é o caminho normal.
  if not found then
    return new;
  end if;

  insert into movements (
    id, company_id, kind, occurred_at, recorded_at, item_id, quantity_base_units,
    location_id, unit_cost_rate, movement_group_id, counterpart_location_id, lot_id,
    reverses_movement_id, recorded_by
  ) values (
    gen_random_uuid(),
    perdedora.company_id,
    'reversal',
    now(),
    now(),
    perdedora.item_id,
    -- A taxa e a quantidade são as da ORIGEM, congeladas: o estorno desfaz o que aconteceu
    -- pelo valor com que aconteceu, a mesma regra de `reverseGroup`.
    -perdedora.quantity_base_units,
    perdedora.location_id,
    perdedora.unit_cost_rate,
    -- Grupo novo, como toda perna de estorno: o grupo da origem é a REMESSA, e pendurar o
    -- estorno nela faria `undoCheck` e `planReversal` lerem o estorno como mais uma perna a
    -- estornar.
    gen_random_uuid(),
    perdedora.counterpart_location_id,
    perdedora.lot_id,
    perdedora.id,
    -- Quem decidiu é quem responde pela correção. `auth.uid()` e não `new.resolved_by`: a
    -- coluna é dado do cliente, e dado do cliente não nomeia conta no razão.
    auth.uid()
  );

  -- **E a média de custo do servidor NÃO é recomposta aqui, de propósito.** Nenhum estorno
  -- recompõe: é uma dívida conhecida e própria, aberta na fila do `docs/roadmap.md`, e o
  -- aparelho recompõe a dele (`recomputeItemCost`). Herdar a lacuna em silêncio seria pior que
  -- herdá-la dita — um estorno escrito por gatilho pareceria diferente dos outros sem ser.
  -- Quando aquela rodada chegar, ela alcança este estorno pelo mesmo caminho dos demais.

  -- Sem `note`. A frase quem escreve é a tela, nos três idiomas — um servidor escrevendo
  -- português deixaria a linha falando o idioma errado no extrato de quem usa o aplicativo em
  -- inglês. O fato está dito pela estrutura: uma `reversal` que aponta para uma `discrepancy`
  -- cuja remessa tem candidata resolvida.
  return new;
end;
$$;

revoke all on function private.a_decisao_vira_razao() from public;

drop trigger if exists check_candidates_decide_writes_ledger on check_candidates;

create trigger check_candidates_decide_writes_ledger
  after insert or update of resolution on check_candidates
  for each row
  execute function private.a_decisao_vira_razao();

-- `resolved_by` diz quem decidiu, e ninguém decide em nome de outro.
--
-- Mesma forma de `recorded_by = auth.uid()` no razão, e pelo mesmo motivo: agora que o
-- gatilho escreve no livro por causa desta linha, uma coluna livre aqui seria uma porta de
-- lado para a regra mais antiga do esquema.
-- E a MESMA regra no append, porque o gatilho agora escuta o insert.
--
-- A `0062` cobrava só a capacidade para inserir, e bastava: a candidata nascia sem decisão.
-- Com o gatilho disparando também no insert, uma linha que chega já decidida escreve no razão —
-- e aí `resolved_by` deixa de ser dado e passa a ser assinatura, exatamente como no `update`.
-- Fechar um lado e deixar o outro aberto seria trancar a porta e esquecer a janela.
drop policy if exists check_candidates_append on check_candidates;

create policy check_candidates_append on check_candidates
  for insert
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and (resolution is null or resolved_by = auth.uid())
  );

drop policy if exists check_candidates_decide on check_candidates;

create policy check_candidates_decide on check_candidates
  for update
  using (resolution is null and private.has_capability(company_id, 'adjust_stock'))
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and (resolution is null or resolved_by = auth.uid())
  );

comment on function private.a_decisao_vira_razao() is
  'Aceita a candidata: estorna a conferência de pé da mesma remessa, dentro da transação que '
  'ganhou a arbitragem. Exatamente-uma-vez porque a política só deixa UM update passar.';
