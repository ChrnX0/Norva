-- O frete entrava no custo e a DIVISAO era jogada fora — e o preco disso e um alarme falso.
--
-- A tela de compra soma o frete ao total da linha antes de gravar, e isso esta certo: o
-- livro-razao guarda o que aquele item custou para estar aqui, e frete nao e outro movimento.
-- O defeito estava no que vinha depois — ela calculava a divisao, mostrava na confirmacao, e
-- nao gravava nenhuma das duas metades. `purchases.freight_cents` esta na `0002` e nunca foi
-- escrito.
--
-- ## O alarme que culpa quem nao fez nada
--
-- A comparacao "quanto voce pagou da ultima vez" existe para a negociacao, e esta escrito no
-- comentario de `item_costs` desde a `0002`: *"Last price stays visible for negotiation
-- ('R$ 118 here; R$ 112 last month at supplier B')"*. Essa frase e dita ao FORNECEDOR, e por
-- isso ela tem de falar do que o fornecedor cobra.
--
-- Com o frete dentro de um numero so, ela fala de outra coisa. O campo de frete da tela diz de
-- si mesmo que o valor varia por ENTREGA — uma semana o fornecedor traz, na outra voce busca —,
-- entao buscar o saco voce mesmo na semana passada e pagar entrega nesta faz o aplicativo
-- anunciar "subiu bem acima do normal" sobre um preco que nao mudou. Alerta inventado ensina a
-- ignorar alerta, e este tem causa real e recorrente.
--
-- ## Por que na LINHA, e nao apenas na nota
--
-- Hoje uma nota tem uma linha, e o frete da nota e o frete da linha. No dia em que ela tiver
-- duas, recuperar a parte de cada uma a partir do total da nota obriga todo leitor a repetir o
-- rateio — e a repetir com o mesmo arredondamento que a media de custo usou, senao os dois
-- numeros discordam em centavos. Guardar a parte JA RATEADA na linha faz a divisao sobreviver:
-- quem le soma dois inteiros.
--
-- ## Por que `apply_purchase_to_cost` NAO muda
--
-- O gatilho calcula a taxa de `total_cents / base_units`, e `total_cents` continua sendo o
-- pouso — frete incluido. As duas medias continuam concordando sem ninguem refazer rateio
-- nenhum deste lado, e a garantia 6 continua comparando o aparelho com o servidor.
--
-- Um rateio aqui seria pior que redundante: o gatilho dispara POR LINHA, e a fila pode entregar
-- a primeira linha de uma nota antes de a segunda existir. O denominador sairia errado, o custo
-- sairia errado, e nada denunciaria — e o rateio de centavo com maior resto teria de ser
-- reescrito em plpgsql identico ao do aparelho para os dois chegarem no mesmo centavo. O rateio
-- acontece UMA vez, na origem, e viaja pronto.
alter table purchase_lines
  add column if not exists freight_cents bigint not null default 0
    check (freight_cents >= 0);

comment on column purchase_lines.freight_cents is
  'Quanto do frete da nota pousou NESTA linha, ja rateado na origem. `total_cents` continua '
  'sendo o pouso (com frete), entao o que o fornecedor cobrou pela mercadoria e '
  '`total_cents - freight_cents`. Rateado uma vez, no aparelho, porque o gatilho de custo '
  'dispara por linha e a fila pode entregar a primeira antes de a segunda existir.';
