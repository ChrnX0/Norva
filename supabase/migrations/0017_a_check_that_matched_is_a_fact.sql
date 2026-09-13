-- A conferência que bateu também é um fato, e o esquema a recusava.
--
-- `movement_moved_something` (0008) exige que toda linha mova alguma coisa,
-- com uma exceção só: `adjustment`, que é contagem de prateleira e pode dar
-- zero de diferença. A regra está certa - linha que não move nada é ruído num
-- livro-razão, e foi escrita para impedir exatamente isso.
--
-- Mas ela deixa de fora o caso que a tela de transporte precisa: a loja
-- conferiu o que chegou e bateu. Essa linha não move mercadoria nenhuma, e é
-- justamente por não mover que ela vale - é a prova de que alguém abriu a caixa
-- e contou. Sem poder gravá-la, o app só saberia registrar conferência quando
-- deu diferença, e "a Loja Norte ainda não conferiu" ficaria impossível de
-- distinguir de "a Loja Norte conferiu e estava tudo certo".
--
-- Então `discrepancy` entra na mesma exceção, e por um motivo mais estreito que
-- o de `adjustment`: só quando a linha diz em que posto de controle ela
-- aconteceu. Diferença de zero sem posto continua sendo ruído e continua
-- recusada.
alter table movements drop constraint movement_moved_something;

alter table movements add constraint movement_moved_something
  check (
    quantity_base_units <> 0
    or kind = 'adjustment'
    or (kind = 'discrepancy' and post is not null)
  );
