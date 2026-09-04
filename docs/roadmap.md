# Roadmap

**Por que este arquivo existe.** Em 3 de setembro, uma sessão terminou o escopo
escrito e ficou sem lista — não por falta de trabalho, mas porque a lista morava
espalhada: as fases do `CLAUDE.md`, as dívidas do `docs/insights.md` e a cabeça de
quem estava trabalhando. A regra de "nunca ocioso" diz que a próxima coisa vem da
**lista escrita**; sem uma, ela vira convite a inventar tarefa, que é pior que
parar.

Então: **este arquivo é a lista escrita.** Se algo não está aqui e não está numa
das decisões do `CLAUDE.md`, não é a próxima coisa.

---

## Como este arquivo se mantém vivo

Três regras, e as três existem porque a alternativa apodrece:

1. **Item fechado sai daqui no mesmo commit que o fecha.** Roadmap que lista o que
   já existe manda alguém construir duas vezes — e o custo não é o tempo, é a
   confiança: depois do segundo item errado, ninguém lê mais o arquivo.
2. **Item novo entra com evidência de arquivo.** `arquivo:linha` que sustenta o
   estado. Sem isso é palpite, e palpite em roadmap tem a mesma cara de fato.
3. **Item parado carrega o que o destrava**, não uma promessa de data. "Precisa de
   aparelho na mão" é informação; "semana que vem" é ficção.

## Como a ordem é decidida

Não por fase — o portão é **por item**, e é o do `CLAUDE.md`, nesta ordem:

- **P1 — quem chama isto no mesmo commit?** Sem chamador, não entra. É a doença
  provada deste repositório: coluna, função, chave de dicionário e tabela que
  existiram sem escritor.
- **P2 — complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item
  depende de observar alguém usando. **Mas antes de travar:** se o que muda com a
  observação é *preferência de quem usa*, não é espera nem pergunta — é
  configuração, e os dois caminhos existem.
- **P3 — entrando errado, conserta com um commit ou com migração e estorno?** O que
  toca `supabase/migrations/`, o caminho de escrita de `movements` ou a semântica de
  `movement_kind`/`location_kind` é caro e permanente. Forma de esquema se adivinha
  de graça enquanto há zero linhas; conteúdo de livro-razão não se corrige, se
  estorna.

Consequência prática da ordem: **o que é P3 e está barato agora sobe na lista**, e o
que é P2 puro espera uso real em vez de virar código adivinhado.

---

## A lista

Como ela foi levantada, porque isso decide o quanto se pode confiar nela: sete
leitores varreram o repositório em eixos diferentes (escopo do mês, dívidas do
`insights.md`, servidor sem escritor, aparelho sem chamador, Lei da Inteligência
tela a tela, o que depende de aparelho ou servidor, e os cortes já decididos) e
levantaram 68 candidatos. Cada um foi para um refutador com a instrução de
**derrubá-lo** — na dúvida, refute, porque item errado manda a próxima sessão
construir o que já existe. **Cinquenta foram julgados e quarenta e cinco caíram.**
Sobraram estes, e dois deles são o mesmo item achado por dois leitores
independentes.

O que isso significa para quem lê: a lista é curta **porque a refutação foi dura**,
não porque falta trabalho. Os dezoito candidatos ainda não julgados quando a
varredura parou não entram até passarem pela mesma peneira.

### 1. ~~O estorno não tem escritor~~ — fechado em 3 de setembro

A primeira fundação do projeto passou a existir em código: `reverseGroup` estorna
o **ato inteiro** pelo `movement_group_id`, recusa o que deixaria saldo negativo
nomeando o item que já saiu, e recusa o segundo estorno. A tela é a etiqueta do
lote, que é onde alguém chega com a caixa na mão.

O que ele deixou atrás de si vale mais que o item: **escrever a correção não é
corrigir.** Saldo é soma pura e não olha `kind`, então ele se conserta sozinho —
mas as oito consultas de "o que aconteceu" filtram por `kind`, e `reversal` não é
`production`. Os três testes unitários passaram de primeira e o navegador
reprovou: o almoxarifado certo e a produção dizendo 500 depois de corrigida.

**A regra que fica:** teste unitário prova a escrita, só o aplicativo dirigido
prova a leitura.

### 2. ~~A corrida grava o id da receita onde vai o id da **versão**~~ — fechado em 4 de setembro

O único item que a auditoria da Fase 1 marcou como ausente. A correção não foi
escrever o id certo na coluna da corrida — foi **mudar de lugar**: `production_runs`
é apagada ao fechar ou cancelar, então guardar a ficha ali é guardá-la no que não
sobrevive. O carimbo passou a ficar no **lote**, que não é apagado, é o que a
etiqueta nomeia e é por onde um recall começa (`lots.recipe_version_id`, V16 e
`0026`).

O leitor veio junto, como o portão P1 exige: a tela do lote diz *"Saiu da ficha
Picolé de morango, versão 1"* — fora do papel branco, porque a etiqueta só leva o
que serve para achar e recolher o produto.

E a prova de que o carimbo vale é o teste que corrige a fórmula DEPOIS: nasce a
versão 2, e o lote de ontem continua dizendo 1. Sem ele, uma receita corrigida em
março reescreveria de que fórmula saiu o que janeiro produziu — a taxa congelada
continuava certa, e a pergunta "de que ficha veio?" passava a responder a receita
de hoje.

**O que ele deixou atrás de si:** a checagem 6 do `db:verify` dizia "66 escritas
replicadas, sem uma recusa" — e ausência de recusa não prova que a coluna
atravessou. Uma coluna esquecida no serializador entraria como nula e a fila
passaria verde. Agora ela conta os lotes que chegaram **ligados à versão** do
lado do servidor, que é a asserção de presença que faltava.

### 3. Lista de compras por simulação: *"se eu fizer 3 tachos de cada, o que falta?"*

**Estado:** parcial (o refutador encolheu o escopo — a parte de um produto só já
roda em `app/production/new.tsx`).

- **Evidência:** `src/domain/recipe.ts:278` (`explodeRequirements`) chamado só para
  corrida única — `app/production/new.tsx:155` e `src/data/repository.ts:1282`.
- **Por que importa:** hoje o app avisa o que acaba pela cobertura observada
  (`runningOut`, `src/data/repository.ts:3543`) e **não responde o que comprar para
  o plano da semana**. É simulação sobre o estoque de agora — não depende de
  histórico nenhum — e é a pergunta que o dono faz antes de ligar para o
  fornecedor.
- **Os dois deltas que faltam:** (a) somar vários produtos num plano só; (b) virar
  a conta do avesso — de "posso fazer?" para "quanto falta comprar?".
- **Correção de uma evidência:** o leitor citou `grep "comprar"` vazio no
  dicionário como prova de que não existe. Não é prova: o tom de voz do projeto
  **proíbe o infinitivo** ("verbo na frente, segunda pessoa"), então o app diz
  *"Compre"*. Fica registrado para o próximo leitor não repetir.

### 4. ~~Capa: o número de caixas sem o ontem~~ — fechado em 3 de setembro

Era o quarto sobrevivente: `src/home/Mosaic.tsx` mostrava a figura de caixas
enviadas sem comparação nenhuma, contra a promessa escrita no docblock da própria
tela. Fechado no mesmo dia — o cartão passou a dizer o ontem e a listar o que saiu
**sem caber em caixa** (`loose`, que era calculado e nunca lido, com as chaves
`alsoSent`/`alsoSentItem`, que existiam nos três idiomas sem leitor).

O que o item deixou atrás de si é maior que ele: `src/law.test.ts` media a Lei 3
**por arquivo**, e a capa tem dez números grandes. Uma declaração aprovava os dez.
A régua agora é por número, e a contagem tem que bater.

### 5. ~~A dica de "livre" só existe para produto que já tem pedido~~ — fechado em 4 de setembro

`orderedDemand` montava as linhas a partir de `order_lines`, então respondia só
sobre o que alguém já tinha pedido — e quem pergunta "quanto ainda dá para
prometer" está quase sempre no caso oposto: o primeiro pedido do dia. O campo de
quantidade ficava sem dica nenhuma, e o aviso de excesso não tinha como aparecer,
exatamente quando a conta mais decide.

Passou a partir do **produto** e a se chamar `stockAgainstOrders`, que é o que ela
devolve: saldo contra pedido, produto por produto, com `requested` zero quando não
há pedido.

**E o cuidado escrito aqui pegou o defeito, mas não onde ele estava.** A previsão
era "produza para os pedidos" passar a listar produto com demanda zero — e essa
parte estava protegida de graça, porque as duas telas filtram por
`requested - onHand > 0`. O que quebrou foram duas leituras que perguntavam pelo
**tamanho da lista**: o cartão de pedidos da capa passou a dizer "Pedidos
cobertos" numa fábrica que nunca vendeu nada, e o convite do primeiro dia sumiu.
O e2e reprovou nas três checagens da capa, e as duas leituras passaram a medir o
fato (`demand.some(d => d.requested > 0)`) em vez do tamanho.

Contar linha e nomear pedido é a mesma família que a varredura de rótulos do
mesmo dia caçou trinta e uma vezes — e ela reapareceu **dentro do conserto de
outra coisa**, o que diz o quanto ela é fácil de escrever.

---

## Fora do escopo, por decisão escrita

Não se re-litiga o que já foi decidido. Cada corte tem razão, e a razão é o que
impede a decisão de voltar como "boa ideia" numa sessão futura:

| fora | razão escrita |
|---|---|
| **Relatório do Espelho da Loja** | a captura entra (contagem cega, perdas com motivo); o relatório **mente com duas semanas de dado** |
| **Microserviço fiscal** | projeto à parte — certificado A1, homologação SEFAZ; e o plano já diz que nada depende dele |
| **Compras inteligentes** | precisam do **prazo observado** do fornecedor, que só existe depois de meses de nota |
| **Trunfos** (PAC/POD, clima, roteirização) | diferencial de mercado, não a dor de hoje |

E as decisões do dono que **restringem desenho futuro** — quem for construir por
cima delas, leia antes de "consertar":

- **Entrada no chão de fábrica é configuração da empresa**, não escolha nossa: PIN
  numa grade de nomes (compartilhado) e conta pessoal existem os dois.
- **Quem cria a empresa é o dono**, e daí ele cadastra pessoas **ou** aprova quem
  pediu associação por código. Os dois caminhos.
- **O relatório fala de onde, não de quem.** O livro-razão sempre grava quem
  (`recorded_by`); nomear na tela é opt-in (`names_who_recorded`).
- **`recorded_by` e `operator_id` são duas perguntas** — qual conta escreveu (imposto
  pelo servidor, incedível) e quem estava com o aparelho. Uma coluna só para as duas
  já custou uma rodada.
- **Aparelho emprestado entra como produção e nada mais** — papel `operator`, sem
  custo, sem preço, sem dinheiro.
- **O operador confere a prateleira.** O que protege o número é o piso (contagem
  perguntada toda vez, gravada como diferença), não a permissão.
