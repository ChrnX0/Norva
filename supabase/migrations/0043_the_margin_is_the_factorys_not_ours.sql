-- Quantos dias de folga antes de comprar — e por que isto é dado, não código.
--
-- O `reorderPoint` existe no domínio desde sempre e estava registrado como
-- fronteira sem chamador, com a razão escrita em 6 de setembro: *"o que falta
-- agora é a RÉGUA ('é hora de comprar'), e ela se afere contra uma fábrica:
-- qualquer corte escolhido hoje seria calibrado contra um banco semeado"*.
--
-- A razão está certa sobre o NÚMERO e errada sobre a espera, e quem responde é a
-- doutrina F7 deste projeto: quando a resposta certa é "depende de quem usa",
-- **não se escolhe um dos lados e não se pergunta qual** — constrói-se a escolha
-- como configuração da empresa. Uma fábrica que compra polpa de um fornecedor na
-- mesma cidade quer dois dias de folga; a que importa essência de outro estado
-- quer duas semanas. Não existe o corte certo, existe o corte DELA.
--
-- O que continua esperando uma fábrica é o PADRÃO, e ele é dois porque é o que o
-- domínio já escrevia (`safetyDays = 2`) — não um número novo inventado agora.
--
-- Por que na `companies` e não no insumo: a folga é de como a empresa compra, não
-- de o que ela compra. Por item seria mais fino e é exatamente o tipo de fineza
-- que ninguém mantém — quinze insumos com quinze margens envelhecem juntos e em
-- silêncio. Se um dia um insumo precisar da dele, ele ganha a coluna e cai para
-- ela quando estiver preenchida; a da empresa continua sendo o padrão.
alter table companies
  add column purchase_safety_days smallint not null default 2
  check (purchase_safety_days between 0 and 60);

comment on column companies.purchase_safety_days is
  'Dias de folga somados ao prazo observado do fornecedor antes de o app dizer '
  '"compre". Zero é válido: a fábrica que compra na esquina não quer folga.';
