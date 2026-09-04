-- Quem anotou o pedido nunca muda, nem para quem aprova.
--
-- A assinatura deste sistema é incedível por decisão de fundação — `recorded_by` é
-- estampado pelo servidor a partir da sessão, e o `src/sync/serialize.ts` nem manda
-- o campo que o aparelho tem. `orders_place` exige `recorded_by = auth.uid()` desde
-- a 0019, e a 0027 exigiu nos dois lados do reenvio.
--
-- `orders_decide` não exigia. A porta de quem aprova, despacha ou administra só
-- pergunta pela capacidade — então o mesmo `update` que aprova um pedido podia
-- trocar QUEM o anotou. A gerente da loja sai do registro e outra pessoa entra no
-- lugar dela, com o pedido inteiro parecendo dela desde sempre.
--
-- Numa fábrica de seis pessoas isso não é invasão de fora: é reescrever o passado
-- de dentro, no único campo que o livro de pedidos tem para dizer quem pediu o quê.
-- E é exatamente o que o relatório de conferência precisa não poder fazer — a
-- decisão do dono sobre nomear quem registrou (`names_who_recorded`) só é honesta se
-- o nome guardado for o de quem estava lá.
--
-- `movements` não tem este buraco porque não tem política de update nenhuma: a
-- imutabilidade dele é gatilho, e é a mesma ferramenta usada aqui. Política de RLS
-- não consegue dizer "contanto que não mude" — a expressão não vê o antes e o
-- depois ao mesmo tempo.
--
-- A checagem 13 do `db:verify` reprova sem isto, com a mensagem que nomeia o autor
-- trocado. Ela foi escrita antes desta migração e viu o campo virar outro id.
create or replace function private.a_resend_decides_nothing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Quem anotou é fato do passado, e não é decisão de ninguém: congela para
  -- TODOS, antes de qualquer pergunta sobre capacidade. Quem aprova decide o
  -- estado do pedido, não a autoria dele.
  new.recorded_by := old.recorded_by;

  if not (
    private.has_capability(new.company_id, 'approve_order')
    or private.has_capability(new.company_id, 'dispatch')
    or private.has_capability(new.company_id, 'manage_company')
  ) then
    new.status     := old.status;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;
