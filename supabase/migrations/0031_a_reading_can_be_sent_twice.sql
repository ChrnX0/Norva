-- A leitura da câmara precisa poder ser REENVIADA, e reenviar não é anotar de novo.
--
-- QUINTA aparição da mesma família, e a primeira encontrada procurando a família
-- em vez de esbarrando nela. A 0015 consertou `purchases` e `purchase_lines`, a
-- 0020 consertou `lots`, a 0027 consertou `orders` (política de update com a
-- capacidade errada), a 0030 consertou o lugar padrão — e `readings` nasceu na
-- 0024 com `readings_read` e `readings_write` e mais nada. Nenhuma política de
-- update.
--
-- A fila do aparelho sobe com `on conflict (id) do update`, sempre: é o que faz o
-- reenvio ser inofensivo, e reenviar é o caso NORMAL de um celular que perdeu
-- sinal no meio do envio. Sem política de update, o Postgres recusa a linha
-- inteira — mesmo idêntica — e o `src/sync/engine.ts` para a fila no primeiro
-- buraco de propósito. Tudo o que a fábrica gravar depois daquela leitura fica
-- preso atrás dela, sem nada na tela dizendo o quê.
--
-- E o gesto é justamente o de quem está com o aparelho na mão dentro da câmara,
-- a -18 °C, onde o sinal não chega: a leitura é a escrita com MAIOR chance de
-- subir duas vezes em todo o aplicativo.
--
-- POR QUE A BARRA NÃO PEGOU. A checagem 9 do `db:verify` — a que sobe a fila duas
-- vezes pela capacidade mínima de cada papel — replica um `orders`, e só. Nenhuma
-- leitura jamais foi reenviada contra o servidor de verdade. A checagem 12 desta
-- entrega é exatamente isso, e ela reprova sem esta política.

-- O autor reenvia a própria leitura, e não pode passá-la para outra pessoa.
--
-- `adjust_stock` é a mesma capacidade do insert (`readings_write`), pelo mesmo
-- motivo escrito ali: é o mesmo gesto de quem foi até a câmara e anotou o que
-- viu. E `recorded_by = auth.uid()` nos dois lados espelha o insert — a
-- assinatura é incedível, como em `movements`.
create policy readings_resend on readings
  for update using (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  )
  with check (
    private.has_capability(company_id, 'adjust_stock')
    and recorded_by = auth.uid()
  );

-- E o reenvio não reescreve o passado.
--
-- Uma política de RLS não consegue dizer "contanto que não mude": a expressão não
-- enxerga o antes e o depois ao mesmo tempo. Quem sabe as duas coisas é o
-- gatilho, e é a mesma forma que a 0027 usou para `orders`.
--
-- O que fica congelado é O QUE FOI VISTO, inteiro: a grandeza, o valor, a
-- unidade, o instante, o lugar, o aparelho e a origem. Reenviar é dizer de novo a mesma coisa; qualquer diferença ali é outra
-- leitura, e outra leitura é outra linha — o livro de leituras é append-only pela
-- mesma razão que o de movimentos.
create or replace function private.a_resend_reads_nothing_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.kind        := old.kind;
  new.value       := old.value;
  new.unit        := old.unit;
  new.taken_at    := old.taken_at;
  new.location_id := old.location_id;
  new.device_id   := old.device_id;
  new.source      := old.source;
  new.recorded_by := old.recorded_by;
  return new;
end;
$$;

create trigger a_reading_resent_stays_the_same
  before update on readings
  for each row execute function private.a_resend_reads_nothing_new();
