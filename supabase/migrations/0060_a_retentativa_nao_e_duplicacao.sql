-- A RETENTATIVA da própria conferência não é duplicação — e a `0051` a recusava.
--
-- Medido em 12 de setembro contra um Postgres de verdade, com a forma exata com que o
-- aparelho escreve:
--
--     insert into movements (...) values (...) on conflict (id) do nothing;
--     ERROR:  esta remessa já foi conferida
--
-- Um celular sozinho. Nenhuma segunda pessoa, nenhuma segunda doca.
--
-- **Por que acontece.** A fila sobe por `upsert(linha, { onConflict: 'id' })`, que em SQL é
-- `on conflict (id) do nothing` (`src/sync/transporte.ts`). Gatilho `before insert` dispara
-- ANTES de o conflito de chave primária ser detectado, então a mesma linha reenviada entra no
-- gatilho como se fosse nova — e o `exists` encontra **ela mesma** de pé.
--
-- **E o caminho é o comum, não o raro.** O servidor grava, a resposta se perde — a zona morta
-- da doca, que é a razão de a fila existir. `markSent` não roda, `sent_at` fica nulo, e o
-- `drain` seguinte reenvia a MESMA entrada. A recusa volta como `23505`, `classeDaRecusa` a
-- chama de permanente com razão (é o código que NÓS escolhemos aqui), e `markRejected` põe a
-- linha de lado **para sempre** — `src/data/outbox.ts` diz em prosa que o que sai de lado não
-- volta. A conferência de quem estava sozinho na doca desaparece.
--
-- Isso contradiz duas coisas escritas, e uma delas é desta migração:
--
--   * a fundação da fila — *"mandar a mesma entrada duas vezes é inofensivo: o servidor
--     resolve por id"* (`src/data/outbox.ts`, `src/sync/engine.ts`);
--   * o docblock da `0051` — *"A fila de um celular subindo sozinha, que é o caso comum,
--     nunca disputa nada."*
--
-- **Por que as garantias não pegaram.** A 28 e a 32 exercitam a regra com `insert` cru e id
-- NOVO, que é a forma de quem escreve o teste — não a de quem escreve o aparelho. O quinto
-- caso da 28 passa a reenviar a mesma linha com o mesmo id e `on conflict do nothing`, que é
-- a forma real, e ele fica vermelho sem esta migração.
--
-- O conserto é uma linha: a regra deixa de contar a própria linha que está entrando. Duas
-- conferências diferentes continuam colidindo, porque têm ids diferentes — `newId()` por
-- aparelho —, e é essa colisão que impede o saldo de dobrar.

create or replace function private.one_standing_check_per_shipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind <> 'discrepancy' or new.movement_group_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      new.company_id::text || ':' || new.movement_group_id::text || ':' || new.item_id::text,
      0
    )
  );

  if exists (
    select 1
      from movements m
     where m.company_id = new.company_id
       and m.movement_group_id = new.movement_group_id
       and m.item_id = new.item_id
       and m.kind = 'discrepancy'
       -- A LINHA DESTA MIGRAÇÃO. Sem ela, a retentativa da própria conferência aceita se
       -- encontra de pé e é recusada como se fosse a de outra pessoa.
       and m.id <> new.id
       and not exists (
         select 1
           from movements rev
          where rev.reverses_movement_id = m.id
            and rev.company_id = m.company_id
       )
  ) then
    raise exception using
      errcode = 'unique_violation',
      message = 'esta remessa já foi conferida',
      detail = format(
        'grupo %s, item %s, empresa %s',
        new.movement_group_id, new.item_id, new.company_id
      ),
      hint = 'desfaça a conferência anterior antes de conferir de novo';
  end if;

  return new;
end;
$$;

-- Corpo novo não herda a revogação do antigo: `create or replace` mantém o dono e as
-- permissões da função ANTERIOR só quando elas existem, e a cicatriz da `0045` manda
-- re-emitir sempre.
revoke all on function private.one_standing_check_per_shipment() from public;

-- O gatilho continua o mesmo: `create or replace function` não desliga o que já aponta para
-- ela, então nada precisa ser recriado — e recriar o gatilho abriria uma janela sem regra.

comment on function private.one_standing_check_per_shipment() is
  'Uma conferência de pé por remessa e item, ignorando a própria linha que está entrando. '
  'A retentativa da fila (on conflict do nothing) não é duplicação: gatilho before insert '
  'dispara antes do conflito de id. Ver 0060.';
