# Plano de desenvolvimento — NORVA

Da fábrica que usa papel hoje até o aplicativo publicado nas lojas.

**Por que este arquivo existe.** Em 3 de setembro uma sessão terminou o escopo
escrito e ficou sem lista — não por falta de trabalho, mas porque a lista morava
espalhada entre as fases do `CLAUDE.md`, as dívidas do `docs/insights.md` e a
cabeça de quem estava trabalhando. A regra de "nunca ocioso" diz que a próxima
coisa vem da **lista escrita**; sem uma, ela vira convite a inventar tarefa, que é
pior que parar.

E em 4 de setembro o dono leu a primeira versão dele e disse a coisa certa: *"nunca
vi roadmap pela metade"*. Estava mesmo — era uma lista de seis itens fechados com
um bilhete dizendo que a lista estava vazia. Lista vazia não é plano. Plano é o
arco inteiro, com o que já existe, o que falta, em que ordem, e o que trava cada
coisa.

---

## Onde o produto está hoje — medido, não afirmado

Os números abaixo saem de comando, não de memória. Cada um tem como conferir — e
`src/bar.test.ts` **roda essa coluna**: cada linha é derivada do sistema e comparada
com o que está escrito aqui, então a tabela não envelhece em silêncio.

*Ela já envelheceu, no dia em que foi escrita: quatro linhas ficaram para trás antes
do fim da tarde. Comando escrito ao lado do número é convite, não garantia — ninguém
roda quinze comandos antes de acreditar numa tabela. Por isso a guarda.*

| | | como conferir |
|---|---|---|
| telas | **24** | `find app -name '*.tsx' \| grep -v _layout \| wc -l` |
| tabelas no aparelho (SQLite) | **21** | `grep -c 'CREATE TABLE IF NOT EXISTS' src/data/db.ts` |
| tabelas no servidor (Postgres) | **22** | `grep -h '^create table' supabase/migrations/*.sql \| wc -l` |
| migrações do servidor | **32** | `ls supabase/migrations \| wc -l` |
| migrações do aparelho | **V17** | último `const V` em `src/data/db.ts` |
| papéis | **7** | `src/domain/access.ts` |
| capacidades | **18** | `src/domain/access.ts` |
| linhas de código | **~45.000** | `find src app e2e scripts supabase -type f \( -name '*.ts*' -o -name '*.sql' -o -name '*.mjs' \) \| xargs wc -l` |

E a barra de verificação, que é o que separa "compila" de "funciona":

| | |
|---|---|
| `npm test` | **338** testes |
| `npm run mutate` | **106** defeitos plantados, 104 pegos e 2 equivalentes |
| `npm run e2e:fast` | **36** checagens num navegador de verdade |
| `npm run db:verify` | **13** garantias contra um Postgres descartável, sob RLS |
| `.proofgate/verify.sh` | **24** guardas de entrega |

**Nível de evidência: E3** — exercitado contra Postgres e navegador de verdade,
com as telas fotografadas nos dois temas e nas duas identidades. **Nada visto numa
fábrica.** Essa é a lacuna que nenhum teste fecha, e ela decide o que pode ser
construído agora e o que precisa esperar (veja o portão P2, adiante).

### Os sete papéis, que são o desenho do produto e não detalhe

`owner` · `operator` · `storeManager` · `driver` · `buyer` · `customer` ·
`salesperson`

Um deles é a decisão do dono que mais restringe desenho futuro: **o aparelho
emprestado entra como `operator`** — produz, despacha, confere, registra perda e
conta a prateleira, e não vê preço, custo nem dinheiro em lugar nenhum.

---

## O arco inteiro

Sete etapas, e a ordem não é gosto: cada uma destrava a seguinte por um motivo
escrito na coluna da direita.

| | etapa | o que a fábrica ganha | o que ela precisa antes |
|---|---|---|---|
| **F1** | fundação — livro-razão, custo, estoque | o número de estoque para de ser chute | — |
| **F2** | produção, lote, validade, câmara | a corrida do tacho vira registro | F1 |
| **F3** | o papel sai do chão de fábrica | romaneio, conferência e etiqueta no celular | F2 |
| **F4** | a fábrica se explica sozinha | o Espelho da Loja e a compra na hora certa | **meses de movimento real** |
| **F5** | o fiscal | nota fiscal eletrônica | certificado A1 e homologação SEFAZ |
| **F6** | publicar nas lojas | qualquer fábrica instala | F3 + privacidade + licenças |
| **F7** | os trunfos | roteirização, clima aplicado, PAC/POD | F4 |

**F1 e F2 estão feitas.** F1 por decisão do dono em 1 de setembro (a auditoria
mediu 6 prontos, 9 parciais e 1 ausente, e ele decidiu com o número na mão). F2
fechou com o lote dizendo de que ficha saiu, a câmara dizendo o que estava dentro
na hora da leitura, e a lista de compras por simulação.

**O que domina o calendário não é código.** A F4 precisa de meses de movimento
real — nenhuma quantidade de trabalho encurta isso. A F5 é um microserviço .NET
com certificado e homologação, que é ato administrativo. Por isso o alvo de um mês
decidido pelo dono é **F2 + F3**, e o resto tem data de começo, não de entrega.

---

## Agora — o que está aberto

**Nada dos quatro. Os quatro foram fechados em `1fcbadc`**, e a lista de trabalho
está aberta esperando a auditoria.

> **E este arquivo quebrou a própria regra 1 por um commit.** Ela diz: *item
> fechado sai daqui no mesmo commit que o fecha*. Os quatro foram consertados num
> commit e riscados no seguinte. Fica registrado em vez de apagado — a regra existe
> porque plano que lista o que já existe manda alguém construir duas vezes, e a
> primeira pessoa a esbarrar nisso fui eu, uma hora depois de escrever a regra.

Vieram de uma varredura de sete eixos com refutação adversarial: **19 achados
julgados, 4 de pé, 15 derrubados.** A refutação foi dura de propósito — item errado
manda a próxima sessão construir o que já existe.

### 1. ~~A fila travava para sempre atrás de um pedido reenviado~~ — crítica, fechada

`supabase/migrations/0027_a_resend_is_not_a_decision.sql`

Terceira aparição da mesma família, e a primeira com cara nova. A 0015 consertou
`purchases`/`purchase_lines`, a 0020 consertou `lots`, e nas duas o defeito era
tabela com política de insert e **nenhuma** de update. Aqui `orders` **tem**
política de update — com a capacidade errada. Entra com `place_order`; só mexe quem
tem `approve_order`, `dispatch` ou `manage_company`. Três dos sete papéis
(`storeManager`, `customer`, `salesperson`) têm o primeiro e nenhum dos três.

Na fábrica: a gerente da loja anota o pedido sem sinal. A primeira subida entra. A
segunda é recusada, e o engine para a fila no primeiro buraco de propósito — então
produção, contagem e leitura de câmara gravadas **depois** ficam presas atrás
daquele pedido para sempre, sem nada na tela dizendo o quê.

**O que ele deixou atrás de si vale mais que ele.** A frase escrita no `insights.md`
depois da 0015 — *"todas as outras têm um `_manage FOR ALL`, que cobre update"* — é
o que fez a busca falhar: procurava-se tabela **sem** política de update, e esta
tinha uma. E a barra não pegava porque a checagem 6 sobe a fila com **todas** as
capacidades e a checagem 8 dá `dispatch` junto com `place_order`. A **checagem 9**
sobe a fila duas vezes pela capacidade **mínima** de um papel real, e ela morde:
sem a migração, reprova com `new row violates row-level security policy`.

### 2. ~~"Apagar tudo" não apagava nada depois da primeira produção~~ — alta, fechada

`src/data/erase.ts`

O conjunto fechado conhecia **12** das **21** tabelas do aparelho. Cinco das nove que
faltavam apontam para `items` ou `locations` com `ON DELETE RESTRICT` — e é
justamente `items` e `locations` que o apagar-tudo apaga. Toda corrida de produção
grava um `lots`, então a partir da **primeira corrida** o SQLite levantava `FOREIGN
KEY constraint failed`, a transação voltava atrás, nada era apagado, e a tela
mostrava texto cru de SQLite em inglês — depois do toque.

### 3. ~~Apagar "compras" apagava o livro-razão inteiro~~ — alta, fechada

`src/data/erase.ts`

`tablesFor('purchases')` começa com `movements`, e o `DELETE` é por empresa: levava
produção, contagem, perda, transferência e saída. A confirmação dizia *"isso apaga
as compras, e zera o custo médio"*. Não dizia que um movimento ia. Irreversível pelo
texto da própria tela, e sem cópia no servidor.

A regra da casa já era essa — a confirmação diz o que vai acontecer, com os números
por extenso. **Faltava o número.**

### 4. ~~A guarda comparava uma lista escrita à mão consigo mesma~~ — média, fechada

`src/data/erase.test.ts`

Ela percorria um `Record` com as mesmas doze entradas do union e perguntava se cada
uma estava na lista — *"todo membro do conjunto fechado está na lista do conjunto
fechado"*. Uma tabela fora do union era invisível **por construção**: o autor do
mapa e o autor da lista eram a mesma pessoa lembrando das mesmas doze tabelas.

Agora ela **lê** `db.ts` — as tabelas e as arestas de RESTRICT, inclusive as que
entram por `ALTER` em migrações posteriores. É o mesmo conserto que o `db:verify`
fez quando parou de rodar como superusuário: perguntar ao sistema em vez de à
lembrança.

E ela achou mais na primeira execução — **um deles alarme inventado**, cobrando de
"apagar produtos" a regra do "apagar tudo". Não vale: `blockerFor` recusa aquelas
áreas **antes** do toque, com o número junto, que é a Lei 5. Só o `all` não tem
rede, e a premissa está presa no teste com contagens que bloqueariam qualquer outra
área.

## O que a auditoria abriu — a fila de agora

**A auditoria está entregue**: dez frentes, trinta achados, em `docs/auditoria.md`
com severidade, cenário e o que ela **não** conseguiu olhar. Ali está o texto para o
dono; aqui está a ordem de trabalho, que é o que a próxima sessão precisa. A regra da
casa vale igual: *item fechado sai daqui no mesmo commit que o fecha*, e o número do
achado nunca muda — quem já leu o documento leu aquela lista.

Fechados, na ordem em que caíram: **1** (item e local de outra empresa, migração
`0029`), **3** (custo médio depois do estorno), **6** (a contagem que prometia um
número e gravava outro), **4** (o aviso de validade segue o lote, e a conta de
prometer passou a somar todas as nossas salas) e **5** (a produção com insumo na
câmara: a tela lê o piso da sala do tacho, impede em vez de reclamar, diz onde o
insumo está, e o erro do livro-razão virou frase de tela nos três idiomas) e **8** (a
órfã que a fila guardava depois de apagar uma área) e **9** (o backup do Android, que
levava o livro-razão para a conta Google de quem estivesse no aparelho) — este último
junto com o `versionCode` que colidia, que era um dos médios e o mais barato deles. E
**2**: a compra, a contagem e a perda passam a ter grupo, logo estorno, logo a porta
para desfazer na tela do insumo. E **10**: as seis paletas passaram a respeitar a
régua de contraste da WCAG, com guarda que lê as cores do arquivo de tokens. E **11**:
idioma e moeda viraram escolha da empresa, com o aparelho como palpite do primeiro dia
— o que fechou de passagem o fuso chumbado em São Paulo, que fazia Manaus imprimir a
data errada na etiqueta.

**Com isso a lista de severidade ALTA da auditoria está vazia.** O que sobra são os
médios, e o que ela declarou não ter conseguido olhar: a segunda lente adversarial, o
teste de carga real, as duas vulnerabilidades que o `npm audit` não alcança deste
ambiente, e **nada visto numa fábrica** — que é a lacuna que nenhum teste fecha.

**O 5 deixou uma pergunta, e ela é do dono** — está escrita em "A sala do tacho",
adiante. A tela parou de mentir, mas **registrar o trajeto câmara → almoxarifado
ainda não existe**: enquanto não existir, uma fábrica que guarda a polpa no freezer
teria de lançar transferência antes de cada tacho, e nenhuma fábrica de seis pessoas
faz isso.

De pé, nesta ordem e por este motivo:

1. **Os médios que sobraram** — nove, agora que o `versionCode`, o `recorded_by`
   cedível, o percentual com ponto e o ícone de picolé caíram. Entre eles: a embalagem
   abaixo de meio centavo virando de graça, a aprovação de pedido que nunca atravessa,
   a tela de abertura ainda ser o andaime da Expo, e `forgetSentBefore` sem chamador
   fora de teste.

### A sala do tacho — a decisão que a F2 precisa, e ela é do dono

O piso da produção conta a sala em que o tacho roda, e isso está certo: somar todos
os lugares autorizaria um tacho com o açúcar que está a dez quilômetros, numa loja.
Mas polpa mora no freezer. Então uma fábrica que guarda insumo na câmara fria vive um
de dois mundos, e os dois são legítimos:

- **Sala estrita** (hoje): o insumo entra no almoxarifado, e tirar da câmara é uma
  transferência lançada. Saldo por sala sempre exato; um lançamento a mais por tacho.
- **Salas nossas somadas**: o tacho consome de qualquer sala da fábrica, e o sistema
  decide de qual debitar (a mais velha primeiro, como o lote já faz). Nada a lançar;
  o saldo de uma sala isolada passa a ser deduzido, não declarado.

Pela regra da casa isto **não é pergunta de qual, é pergunta de qual é o padrão** — os
dois caminhos existem como configuração da empresa. O que trava é o portão P3: a
segunda opção muda **onde o consumo é gravado**, que é o caminho de escrita de
`movements`, e forma de livro-razão não se corrige com um commit. Fica aqui escrito,
com as duas formas, para entrar junto com a câmara fria da F2 — e o que falta antes de
qualquer uma é o trajeto interno: **transferência entre salas nossas**, que a tela de
transferir não faz (ela sai sempre da fábrica, e o caminho de volta grava
`return`, que é notícia sobre a loja, não sobre a nossa câmara).

## F3 — o mês que tira o papel do chão de fábrica

O alvo decidido pelo dono. No fim disto, a fábrica para de usar papel para
romaneio, conferência e etiqueta.

**1. Etiqueta e QR do lote.** O QR já é impresso; falta quem o leia. A seção `scan`
do dicionário existe nos três idiomas esperando a tela — está registrada como
fronteira em `src/dictionary.test.ts`, com o motivo.

**2. Lojas e clientes com ficha de acordo.** O que foi combinado com cada loja:
preço, prazo, dia de entrega. A migração `0021_what_was_agreed_with_the_store.sql`
já criou a forma; falta a tela.

**3. Pedido com reserva.** Hoje pedido é demanda e nada sai do freezer porque
alguém ligou — decisão escrita, e ela fica. A reserva é a camada por cima: separar
do saldo o que já tem dono.

**4. Separação.** `pickingFor` já responde a conta. Falta a tela de quem anda com o
carrinho.

**5. Os quatro postos de controle.** Separado, carregado, entregue, conferido. A
seção `posts` do dicionário existe nos três idiomas — fronteira registrada.

**6. App do entregador.** O papel `driver` existe com `dispatch`, `check_receipt` e
`record_loss`. Falta a tela dele.

**7. Devolução.** O caminho de volta: o que a loja não recebeu, com motivo, virando
movimento.

**8. O `UnitStepper`.** Componente construído e sem chamador, decisão registrada no
`CLAUDE.md` — é peça da F2/F3 e apontá-lo como defeito já custou uma rodada. Entra
quando a tela de separação existir: é ali que se conta caixa com luva.

**O risco nomeado, e ele não se resolve escrevendo código:** a F3 tem ergonomia que
não se verifica sem aparelho na mão. Tela capacitiva a −18 °C, luva, QR a um braço
de distância. Isso pede rodadas **depois** de alguém usar, e elas só cabem no mês se
o teste acontecer junto, não no fim.

---

## F4 — a fábrica que se explica sozinha

**Trava por dado, não por código.** Tudo aqui precisa de meses de movimento real, e
trabalhar mais rápido não encurta um dia.

**O Espelho da Loja — a captura entra, o relatório espera.** Contagem cega e perdas
com motivo já existem e já gravam. O relatório fica fora por decisão escrita: ele
**mente com duas semanas de dado**. Entra quando houver estação inteira.

**Compras inteligentes.** Precisam do **prazo observado** de cada fornecedor — o
tempo real entre pedir e chegar, que só existe depois de meses de nota. Sem ele, é
adivinhação com cara de matemática.

**A previsão aplicada.** O clima já entra na tela. Cruzar clima com venda observada
para prever demanda é F4 pelo mesmo motivo.

---

## F5 — o fiscal

Projeto à parte, e o plano inteiro é desenhado para que **nada dependa dele**.
Microserviço .NET, certificado digital A1, homologação na SEFAZ. O que trava é
administrativo: o layout quem decide é a SEFAZ, e a homologação tem fila.

Começa quando o dono decidir começar. Não bloqueia F3, F4 nem F6.

---

## F6 — publicar nas lojas

O que falta não é código de produto; é a papelada e as decisões que só o dono toma.

- **A licença do clima.** O Open-Meteo é gratuito para uso **não comercial**. Para
  publicar: ou troca de provedor, ou entra plano pago. **Decisão de gasto, é do
  dono.**
- **Política de privacidade e declaração de dados.** O que o app coleta e para onde
  manda — Supabase, Open-Meteo, atualizações da Expo. Exigência das duas lojas.
- **LGPD.** Dado pessoal identificável: o que é, onde mora, e como se apaga a
  pedido.
- **Permissões do Android.** Pedir só o que se usa. Permissão a mais é recusa na
  revisão.
- **O que fazer quando quebra.** Hoje o app tem tela de erro e nenhum relato. Sem
  isso, uma falha na fábrica de um cliente é invisível daqui.
- **Ícone, splash e nome.** Feito em 4 de setembro: as seis superfícies saem do
  mesmo `markPath` do `brand.ts`, por `scripts/icons.mjs`.
- **Busca de marca.** `NORVA` ainda não passou por busca de anterioridade no INPI
  (classes 9 e 42). Precisa de login gov.br — não é automatizável. Nada mais no
  código chumba o nome: trocar de marca é editar `src/config/brand.ts` e o
  `app.json`.

---

## F7 — os trunfos

Diferencial de mercado, não a dor de hoje. Roteirização de entrega, PAC/POD, clima
aplicado à produção. Entram depois da F4 porque todos precisam do dado que ela
acumula.

---

## Fora do escopo, por decisão escrita

Não se re-litiga o que já foi decidido. A razão é o que impede a decisão de voltar
como "boa ideia" numa sessão futura.

| fora | razão escrita |
|---|---|
| **Relatório do Espelho da Loja** | a captura entra; o relatório **mente com duas semanas de dado** |
| **Microserviço fiscal** | projeto à parte — certificado A1, homologação SEFAZ; nada depende dele |
| **Compras inteligentes** | precisam do **prazo observado**, que só existe depois de meses de nota |
| **Trunfos** (PAC/POD, clima, roteirização) | diferencial de mercado, não a dor de hoje |

E as decisões do dono que **restringem desenho futuro** — leia antes de "consertar"
qualquer uma delas:

- **Entrada no chão de fábrica é configuração da empresa**, não escolha nossa: PIN
  numa grade de nomes (compartilhado) e conta pessoal, os dois existem.
- **Quem cria a empresa é o dono**, e daí ele cadastra pessoas **ou** aprova quem
  pediu associação por código. Os dois caminhos.
- **O relatório fala de onde, não de quem.** O livro-razão sempre grava quem
  (`recorded_by`); nomear na tela é opt-in (`names_who_recorded`).
- **`recorded_by` e `operator_id` são duas perguntas** — qual conta escreveu
  (imposto pelo servidor, incedível) e quem estava com o aparelho. Uma coluna só
  para as duas já custou uma rodada.
- **Aparelho emprestado entra como produção e nada mais** — papel `operator`, sem
  custo, sem preço, sem dinheiro.
- **O operador confere a prateleira.** O que protege o número é o piso — contagem
  perguntada toda vez, gravada como diferença —, não a permissão.
- **A luz da tela é do aparelho, e o padrão é o claro.** Decisão do dono, 4 de
  setembro. Claro, escuro e seguir o aparelho: os três caminhos existem.

---

## Como a ordem é decidida

Não por fase — o portão é **por item**, nesta ordem, e a primeira pergunta que
reprovar decide.

**P1 — quem chama isto no mesmo commit?** Sem chamador, não entra. É a doença
provada deste repositório: coluna, função, chave de dicionário e tabela que
existiram sem escritor. Quando nada chama uma peça há **três** respostas honestas —
trazer o chamador, apagar a peça, ou registrar a fronteira com quem vai chamá-la.
Escrever teste não é uma delas: já foi tentado, e só tornou a morte mais difícil de
ver.

**P2 — complete: "eu mudaria isto se eu visse ___".** Se a frase sai, o item
depende de observar alguém usando. **Mas antes de travar:** se o que muda com a
observação é *preferência de quem usa*, não é espera nem pergunta — é configuração,
e os dois caminhos existem.

**P3 — entrando errado, conserta com um commit ou com migração e estorno?** O que
toca `supabase/migrations/`, o caminho de escrita de `movements` ou a semântica de
`movement_kind`/`location_kind` é caro e permanente. Forma de esquema se adivinha de
graça enquanto há zero linhas; conteúdo de livro-razão não se corrige, se estorna.

Consequência prática: **o que é P3 e está barato agora sobe na lista**, e o que é P2
puro espera uso real em vez de virar código adivinhado.

---

## Como este plano se mantém vivo

Três regras, e as três existem porque a alternativa apodrece:

1. **Item fechado sai daqui no mesmo commit que o fecha.** Plano que lista o que já
   existe manda alguém construir duas vezes — e o custo não é o tempo, é a
   confiança: depois do segundo item errado, ninguém lê mais o arquivo.
2. **Item novo entra com evidência de arquivo.** `arquivo:linha` que sustenta o
   estado. Sem isso é palpite, e palpite em plano tem a mesma cara de fato.
3. **Item parado carrega o que o destrava**, não uma promessa de data. "Precisa de
   aparelho na mão" é informação; "semana que vem" é ficção.

E uma quarta, que nasceu de o próprio topo deste arquivo já ter mentido uma vez: **o
resumo do estado é conferido contra o corpo antes de fechar a sessão.** Ele chegou a
dizer "os cinco estão fechados e a procura trouxe o item 6" depois de o item 6 ter
sido fechado — a cabeça do arquivo contradizendo o corpo dele doze linhas abaixo,
no arquivo que existe justamente para a próxima sessão confiar.
