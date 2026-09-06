-- Por que a carga voltou.
--
-- `movement_kind` tem `return` desde a fundação e `recordReturn` já o escreve,
-- com a razão certa registrada no docblock dele: a devolução merece tipo próprio
-- porque *"sem ele, 'mandei 6.000 e voltaram 1.000' e 'mandei 5.000' ficam
-- idênticos no livro-razão"*. O tipo separou os dois. O que ainda não separava
-- nada era o MOTIVO: "a loja não vendeu" e "a carga chegou derretida" entravam
-- como a mesma linha.
--
-- As duas mandam fazer coisas opostas. A primeira manda produzir menos para
-- aquela loja; a segunda manda olhar o caminhão e a câmara. Um relatório que não
-- distingue as duas dá o conselho errado com convicção — e é justamente o
-- Espelho da Loja que vai lê-las.
--
-- **Por que não reusar `loss_reason`.** Ele é um enum de perda, e devolução não
-- é perda: a mercadoria volta e entra no saldo. Acrescentar `unsold` àquele enum
-- criaria um valor que nenhuma perda pode ter legitimamente — "perdi porque não
-- vendeu" não é um fato — e o `check (kind <> 'loss' or loss_reason is not null)`
-- não impediria ninguém de gravá-lo. Uma coluna respondendo duas perguntas é o
-- erro que `recorded_by`/`operator_id` já custou uma rodada inteira aqui.
--
-- O vocabulário sai do docblock do `moveBetween`, escrito em prosa antes de
-- existir coluna: "não vendeu, veio errado, chegou mole".
create type return_reason as enum ('unsold', 'wrong_item', 'melted', 'expired');

alter table movements add column return_reason return_reason;

-- Obrigatório na devolução, proibido fora dela — a mesma forma que `loss_reason`
-- já usa, e pelo mesmo motivo: razão opcional vira razão ausente, e o relatório
-- passa a ter um buraco que ninguém sabe quando começou.
--
-- A metade "proibido fora dela" não existe no `loss_reason` e existe aqui de
-- propósito: uma transferência entre salas nossas com motivo de devolução é
-- dado errado entrando com cara de dado certo.
alter table movements add constraint movements_return_says_why
  check (
    (kind = 'return' and return_reason is not null)
    or (kind <> 'return' and return_reason is null)
  );

comment on column movements.return_reason is
  'Por que a loja mandou de volta. Obrigatorio quando kind = return e nulo fora '
  'dela. Diferente de loss_reason: devolucao nao e perda, a mercadoria volta ao '
  'saldo, e a pergunta e sobre a loja e nao sobre o que aconteceu com o produto.';
