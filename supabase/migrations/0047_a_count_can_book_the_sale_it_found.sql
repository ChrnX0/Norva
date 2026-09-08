-- Quem CONTA pode gravar a venda que a contagem dele descobriu.
--
-- Em 8 de setembro `sale` ganhou escritor, e o escritor é a contagem: numa loja
-- própria, o que a conferência encontra de FALTA foi comprado por alguém. Isso põe
-- uma pergunta nova para esta política, e ela não é sobre a coluna nova — é sobre
-- QUEM.
--
-- **A `0001` respondeu `dispatch`, e respondeu certo para o mundo dela.** A única
-- venda imaginável ali era carregar mercadoria para um cliente, e quem carrega
-- despacha. A `0008` reescreveu a política por outro motivo (a compra) e manteve a
-- linha, corretamente: nada tinha mudado sobre a venda.
--
-- Mudou agora. A mesma linha do razão passa a ter duas origens, e a segunda é
-- autorizada por outra capacidade: quem conta a prateleira tem `adjust_stock`.
-- O caso concreto é o Conferente — `check_receipt` e `adjust_stock`, sem `dispatch`,
-- que é exatamente o perfil de quem fica no balcão de uma loja própria.
--
-- **E o defeito que isto fecha é do pior tipo que este repositório conhece.** Sem
-- esta migração a contagem é aceita no celular (o SQLite não tem política, não tem
-- papel e não tem capacidade), a linha entra na fila, o servidor a recusa por
-- permissão, e **tudo o que a fábrica gravar depois fica preso atrás dela**. Nenhum
-- teste do aparelho vê isso, e quem descobre é o `db:verify` — que é por que a regra
-- desta casa manda rodá-lo em toda migração. Aqui ele foi escrito ANTES do conserto
-- e falhou, com a frase certa, contra um Postgres de verdade.
--
-- **A relaxação é estreita de propósito, e a garantia 23 prova as duas metades.**
-- `dispatch` OU `adjust_stock` — não "qualquer um". Quem só faz pedido continua sem
-- vender: uma porta que se abre para fechar um buraco vira o buraco seguinte, e a
-- assimetria entre "provou que passa" e "provou que ainda recusa" é a diferença
-- entre uma garantia e uma esperança.
--
-- O portão da LEITURA não muda e continua sendo `view_sale_price` na
-- `movements_visible`: o Conferente congela um preço que ele não pode ver. Isso não é
-- descuido, é a fundação — permissão mora na consulta, e o FATO não depende de quem
-- estava com o celular. Com o portão no caminho da escrita, a contagem do operador
-- gravaria venda sem preço, e a receita do mês sairia menor para quem conta e maior
-- para quem administra, as duas passando sem uma reclamação.
--
-- A política é recriada inteira e não emendada porque `create policy` não tem
-- `alter ... using`: a forma da casa para isto é derrubar e reescrever no mesmo
-- arquivo, como a `0008` fez. As outras nove linhas do `case` são idênticas às dela,
-- copiadas para que este arquivo diga a verdade completa sobre quem escreve o quê —
-- e para que a próxima pessoa não precise abrir três migrações para saber.

drop policy movements_append on movements;

create policy movements_append on movements
  for insert with check (
    recorded_by = auth.uid()
    and case kind
      when 'purchase'    then private.has_capability(company_id, 'check_receipt')
      when 'production'  then private.has_capability(company_id, 'record_production')
      when 'consumption' then private.has_capability(company_id, 'record_production')
      when 'transfer'    then private.has_capability(company_id, 'dispatch')
      -- As duas origens de uma venda: despachar para um cliente, e contar a
      -- prateleira de uma loja própria.
      when 'sale'        then private.has_capability(company_id, 'dispatch')
                           or private.has_capability(company_id, 'adjust_stock')
      when 'loss'        then private.has_capability(company_id, 'record_loss')
      when 'return'      then private.has_capability(company_id, 'check_receipt')
      when 'discrepancy' then private.has_capability(company_id, 'check_receipt')
      when 'adjustment'  then private.has_capability(company_id, 'adjust_stock')
      when 'reversal'    then private.has_capability(company_id, 'adjust_stock')
    end
  );

comment on column movements.unit_price_rate is
  'Por quanto saiu, congelado no instante da venda. Taxa por unidade-base, nunca dinheiro arredondado. Nulo em tudo que não é venda — e nulo numa venda significa "ninguém combinou preço", nunca "de graça". Escritor desde 8 de setembro: a contagem de uma loja própria. Ver 0047.';
