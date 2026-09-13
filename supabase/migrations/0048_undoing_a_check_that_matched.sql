-- Desfazer uma conferência que BATEU escrevia uma linha que o Postgres recusa.
--
-- `movement_moved_something` (0008, ampliada pela 0017) exige que toda linha do
-- razão mova alguma coisa, com duas exceções: `adjustment`, que é contagem de
-- prateleira e pode dar zero de diferença, e `discrepancy` COM posto, que é a
-- prova de que alguém abriu a caixa e contou. As duas estão certas.
--
-- O que ficou de fora é o espelho delas. `reverseGroup` grava o contrário de
-- cada linha do ato, com `kind = 'reversal'` e a quantidade trocada de sinal: o
-- contrário de zero é zero, e o estorno não copia `post`. Então desfazer uma
-- conferência que bateu — ou uma contagem que bateu — produz uma linha
-- `reversal` de quantidade zero sem posto, que esta restrição recusa.
--
-- **E o preço disso é o pior que este projeto tem.** O SQLite do aparelho não
-- tem a restrição: a linha entra, a tela diz que desfez, e a fila leva a linha
-- ao servidor, que a recusa. Recusa por restrição não é recuperável — nenhuma
-- tentativa seguinte resolve — e a fila daquele celular para atrás dela, calada,
-- com tudo o que a fábrica gravar depois preso. Foi a auditoria de 9 de setembro
-- que achou, reproduzindo contra um Postgres de verdade.
--
-- A exceção nova é a mais estreita que resolve: quantidade zero passa quando a
-- linha DESFAZ outra. `reverses_movement_id` é chave estrangeira para
-- `movements`, então isto não abre espaço para ruído — só para o espelho de uma
-- linha que já era legítima. Linha de zero que não desfaz nada continua
-- recusada, que é a regra que a 0008 escreveu e continua valendo.
alter table movements drop constraint movement_moved_something;

alter table movements add constraint movement_moved_something
  check (
    quantity_base_units <> 0
    or kind = 'adjustment'
    or (kind = 'discrepancy' and post is not null)
    or reverses_movement_id is not null
  );
