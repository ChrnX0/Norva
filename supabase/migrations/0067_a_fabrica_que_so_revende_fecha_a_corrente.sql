-- A fábrica que SÓ REVENDE nunca fechava a corrente, e a capa mandava cadastrar insumo para sempre.
--
-- A corrente do preparo é insumo → ficha → produto, e ela é a resposta certa para quem
-- FABRICA: sem insumo não há custo, sem ficha não há produto, sem produto não há corrida.
-- `primeiroPasso` e `degrausQueFaltam` a percorrem, e a capa diz o degrau que falta.
--
-- Só que existe uma empresa para quem essa corrente não fecha NUNCA: a que compra pronto e
-- revende. Ela não tem insumo (o que ela compra é `resale`), não tem ficha e não tem corrida —
-- então `degrausQueFaltam` devolve os três degraus para sempre, a capa oferece "cadastre um
-- insumo" todo dia, e o aplicativo diz que ela não começou depois de um ano operando. É a
-- queixa que abriu estas rodadas, com todas as letras: *"eu nao consigo fazer absolutamente
-- nada"*, dita por quem estava sendo mandado a um degrau que não é dela.
--
-- ## Por que CONFIGURAÇÃO e não dedução
--
-- A fundação desta casa manda: *"depende vira dado, nunca código — e nunca uma pergunta"*.
-- E aqui a dedução é tentadora e errada: "tem produto de revenda e não tem ficha" descreve
-- tanto a distribuidora quanto a fábrica no primeiro dia, e as duas precisam de respostas
-- OPOSTAS — a primeira quer a corrente calada, a segunda quer ser levada pela mão. Nenhuma
-- leitura do estado separa as duas, porque o que as separa é a INTENÇÃO de quem cadastrou.
--
-- Então a empresa diz, e os dois caminhos existem. O padrão é `false`: quem não disser nada
-- continua vendo a corrente, que é o comportamento de hoje e o que serve à fábrica de picolés
-- em que este produto nasceu.
--
-- ## O que ela NÃO faz
--
-- Não fecha porta nenhuma: quem liga o interruptor e depois cadastrar uma ficha continua
-- podendo produzir — o caminho de produção não é apagado, ele deixa de ser COBRADO. Esconder
-- o que a pessoa pode fazer seria a irmã do defeito que ela conserta.
alter table companies
  add column if not exists only_resells boolean not null default false;

comment on column companies.only_resells is
  'A empresa compra pronto e revende: a corrente insumo -> ficha -> produto para de ser cobrada na capa. Padrao false, que e a fabrica.';
