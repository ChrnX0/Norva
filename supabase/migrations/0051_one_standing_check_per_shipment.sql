-- ⚠ ESTA MIGRAÇÃO NÃO PODIA SER APLICADA SOZINHA. **HOJE PODE** — 11 de setembro.
--
-- O aviso abaixo ficou de pé por dois dias depois de a razão dele deixar de valer, e ele é a
-- primeira coisa que alguém lê antes de rodar isto. Fica registrado inteiro, porque metade
-- dele continua verdadeira e a outra metade explica o que foi construído.
--
-- **O que CAIU.** A fila do aparelho não sabia o que fazer com uma recusa permanente:
-- `pushOnce` não marcava a linha, tentava de novo, e tudo o que vinha atrás ficava preso,
-- calado. Isso foi construído: `src/sync/recusa.ts` classifica (só `23505` promovido, o resto
-- passageiro por padrão), `Casa.escrever` devolve o SQLSTATE em vez de só a frase, `V34` dá à
-- fila o terceiro estado (`recusada_em` + `recusa_codigo`), e `app/settings.tsx` conta o que
-- ficou de lado com palavras diferentes das de "esperando para subir".
--
-- E o elo que sustenta tudo isso deixou de ser suposição: a **garantia 32** do `db:verify`
-- dispara esta recusa contra um Postgres de verdade, lê `sqlstate` de dentro dele, e confere
-- contra a lista que o aparelho usa. Antes dela, "o Postgres traduz `unique_violation` em
-- `23505`" era uma constante escrita à mão no próprio teste que deveria guardá-la.
--
-- **O que FICA, e não trava a aplicação.** O segundo celular continua com uma conferência no
-- razão local que o servidor recusou, então os dois saldos divergem por aquela correção até o
-- estorno existir — que é o degrau 3, tela, com decisão do dono já tomada (os dois celulares
-- veem a duplicação com data, hora, local e operador; o primeiro que aceitar fica).
--
-- Isso não é motivo para esperar, e a comparação é o que decide: **sem** esta migração o
-- servidor aplica a correção DUAS VEZES — o número autoritativo fica errado, em silêncio, e o
-- razão é append-only, então o erro vira histórico. **Com** ela o número autoritativo está
-- certo e a divergência é local, visível e explicada na tela. Trocar a segunda pela primeira
-- para esperar uma tela seria preferir o pior erro que este sistema conhece.
--
-- ---
--
-- Duas pessoas conferindo a mesma remessa dobravam a correção NO SERVIDOR.
--
-- O aparelho passou a recusar a segunda conferência em 9 de setembro
-- (`JaConferidaError`), e o servidor não tinha a regra. Dois celulares na mesma doca, os
-- dois offline, conferem a mesma carga: os dois aceitam localmente, os dois sobem, e a
-- diferença é aplicada duas vezes. O saldo da loja fica errado sem nada acusar — a forma
-- pior de erro neste sistema, porque o razão é append-only e o número errado vira
-- histórico.
--
-- **Por que não basta um índice único, e por que ele quase bastava.** A chave certa é
-- `(company_id, movement_group_id, item_id)` para `kind = 'discrepancy'`: a conferência
-- grava UMA linha por item da remessa, todas com o grupo da carga, então duas
-- conferências do mesmo ato colidem item a item e as pernas irmãs de uma mesma
-- conferência não colidem entre si.
--
-- O que o índice não sabe é a segunda metade: **desfazer a conferência e conferir de
-- novo é caminho legítimo**, e um índice único o fecharia junto. A distinção é uma
-- NÃO-EXISTÊNCIA — "não há estorno apontando para esta linha" —, que é subconsulta e não
-- cabe em índice nem em `check`. Daí o gatilho.
--
-- **O predicado é o mesmo do aparelho.** `recordCheck` conta `kind = 'discrepancy'` no
-- grupo com `naoEstornado`; aqui é a mesma frase noutra linguagem, com o item junto. Duas
-- regras que deveriam concordar e são escritas por mãos diferentes divergem — a garantia
-- 28 do `db:verify` exercita esta contra os mesmos casos que a suíte do aparelho.
--
-- E ela funciona porque **o estorno tem espécie própria**: `reverseGroup` grava
-- `kind = 'reversal'`, nunca uma segunda `discrepancy`. Depois de desfazer, a original
-- está apontada (sai pelo `not exists`) e a linha que a desfez não é `discrepancy` (não
-- entra na contagem). Zero, e a segunda conferência passa. Se algum dia o estorno copiar
-- a espécie da linha original, isto passa a recusar o caminho legítimo — e o `db:verify`
-- fica vermelho antes de qualquer aparelho ver.
--
-- **A tranca é por transação e pela mesma chave da regra.** Sem ela, duas transações
-- simultâneas leem "não existe" ao mesmo tempo e as duas gravam: a corrida que todo
-- `select` seguido de `insert` tem. `pg_advisory_xact_lock` serializa só as escritas da
-- MESMA remessa e do MESMO item — duas docas não esperam uma pela outra, e o cadeado
-- solta no fim da transação sem ninguém precisar lembrar. A fila de um celular subindo
-- sozinha, que é o caso comum, nunca disputa nada.

create or replace function private.one_standing_check_per_shipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só a conferência entra aqui. Contagem de prateleira (`adjustment`) é idempotente por
  -- desenho e pode acontecer todo dia; carga, produção e transferência não têm nada a
  -- ver com esta regra.
  if new.kind <> 'discrepancy' or new.movement_group_id is null then
    return new;
  end if;

  -- A tranca vem ANTES da leitura, senão a leitura não vale nada.
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

revoke all on function private.one_standing_check_per_shipment() from public;

-- Por LINHA e antes de gravar: a fila do aparelho empurra um movimento por vez, então
-- cada perna chega na sua própria transação e cada uma faz a própria pergunta.
create trigger movements_one_standing_check
  before insert on movements
  for each row
  execute function private.one_standing_check_per_shipment();

comment on function private.one_standing_check_per_shipment() is
  'Uma conferência de pé por remessa e item. Recusa a segunda `discrepancy` de um par '
  '(grupo, item) cuja primeira não foi estornada — o mesmo predicado que `recordCheck` '
  'usa no aparelho. Ver 0051.';
