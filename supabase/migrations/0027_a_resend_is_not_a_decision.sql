-- O pedido precisa poder ser REENVIADO, e reenviar não é decidir.
--
-- Terceira aparição da mesma família, e a primeira com cara nova. A 0015
-- consertou `purchases` e `purchase_lines`, a 0020 consertou `lots`, e as duas
-- vezes o defeito era o mesmo: a tabela tinha política de insert e NENHUMA de
-- update, e a fila do aparelho sobe com `on conflict (id) do update`. Reenviar
-- não é caso raro — é o caso normal de um celular que perdeu sinal no meio do
-- envio, ou que foi fechado antes de terminar.
--
-- Aqui não é ausência de política de update: é política de update com a
-- capacidade ERRADA. `orders_place` deixa entrar quem tem `place_order`, e
-- `orders_decide` só deixa mexer quem tem `approve_order`, `dispatch` ou
-- `manage_company`. Três dos sete papéis do produto — `storeManager`,
-- `customer` e `salesperson` — têm o primeiro e nenhum dos três.
--
-- O que isso faz na fábrica: a gerente da loja anota o pedido sem sinal. A
-- primeira subida entra. A segunda é recusada, e o `src/sync/engine.ts` para a
-- fila no primeiro buraco de propósito — então produção, contagem e leitura de
-- câmara gravadas DEPOIS daquele pedido ficam presas atrás dele para sempre,
-- sem nada na tela dizendo o quê.
--
-- A frase que ficou escrita no `docs/insights.md` depois da 0015 é a que não
-- cobriu este caso: *"todas as outras tabelas que ela escreve têm um
-- `_manage FOR ALL`, que cobre update"*. `orders` tem política de update, e é
-- por isso que a busca por "tabela sem update" não a encontrou. A tabela filha
-- acertou na mesma migração — `order_lines_correct` é `for all` com
-- `place_order`.
--
-- POR QUE A BARRA NÃO PEGOU. A conta que sobe a fila na checagem 6 do
-- `db:verify` recebe `enum_range(null::capability)` — todas as capacidades. E a
-- checagem 8, que é a do pedido, dá à "Vendedora" `place_order` MAIS `dispatch`,
-- e é o `dispatch` que faz o update passar. Nenhuma conta com `place_order`
-- sozinho jamais rodou a segunda passagem. A checagem 9 desta entrega é
-- exatamente isso: a fila subida duas vezes pela capacidade MÍNIMA de cada
-- papel que escreve.

-- 1. O autor pode reenviar o próprio pedido.
--
-- `recorded_by = auth.uid()` nos dois lados espelha o que `orders_place` já
-- exige: só a conta que escreveu alcança a linha, e ela não pode passá-la para
-- outra pessoa no meio do reenvio.
create policy orders_resend on orders
  for update using (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  )
  with check (
    private.has_capability(company_id, 'place_order')
    and recorded_by = auth.uid()
  );

-- 2. E o reenvio não decide nada.
--
-- Uma política de RLS não consegue dizer "contanto que não mude": a expressão
-- não enxerga o antes e o depois ao mesmo tempo. Quem sabe as duas coisas é o
-- gatilho — e é assim que esta migração já resolve a mesma pergunta no insert:
-- `order_starts_where_the_company_says` SOBRESCREVE o status que veio do
-- aparelho, com a razão escrita ali ("o payload vem de fora, e status é um campo
-- como outro qualquer no JSON"). No update vale o mesmo, pelo mesmo motivo.
--
-- Devolver em vez de recusar, e isto é escolha: recusar deixaria a fila travada
-- outra vez, que é o defeito que esta migração existe para matar. O aparelho de
-- quem não decide não tem tela para decidir — ele não está tentando aprovar,
-- está reenviando o que já mandou.
create or replace function private.a_resend_decides_nothing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

-- O NOME DESTE GATILHO É LOAD-BEARING, e mudá-lo quebra a regra em silêncio.
--
-- O Postgres roda os gatilhos `before` da mesma tabela em ordem ALFABÉTICA de
-- nome. Este precisa vir antes de `orders_leave_pending_only_by_approval`:
-- se aquele rodar primeiro, ele vê um status novo diferente do velho, levanta
-- exceção, e a fila trava — que é exatamente o que se está consertando.
-- `orders_decision_fields_stay_put` < `orders_leave_pending_only_by_approval`
-- porque 'd' vem antes de 'l'. Renomear qualquer um dos dois sem conferir isto
-- devolve o defeito sem nenhum teste ficar vermelho por outro motivo.
create trigger orders_decision_fields_stay_put
  before update on orders
  for each row execute function private.a_resend_decides_nothing();
