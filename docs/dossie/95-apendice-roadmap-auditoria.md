## Apêndice F — Roadmap e auditoria, verbatim

### `docs/roadmap.md`

#### Plano de desenvolvimento — NORVA

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

##### Onde o produto está hoje — medido, não afirmado

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

###### Os sete papéis, que são o desenho do produto e não detalhe

`owner` · `operator` · `storeManager` · `driver` · `buyer` · `customer` ·
`salesperson`

Um deles é a decisão do dono que mais restringe desenho futuro: **o aparelho
emprestado entra como `operator`** — produz, despacha, confere, registra perda e
conta a prateleira, e não vê preço, custo nem dinheiro em lugar nenhum.

---

##### O arco inteiro

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

##### Agora — o que está aberto

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

###### 1. ~~A fila travava para sempre atrás de um pedido reenviado~~ — crítica, fechada

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

###### 2. ~~"Apagar tudo" não apagava nada depois da primeira produção~~ — alta, fechada

`src/data/erase.ts`

O conjunto fechado conhecia **12** das **21** tabelas do aparelho. Cinco das nove que
faltavam apontam para `items` ou `locations` com `ON DELETE RESTRICT` — e é
justamente `items` e `locations` que o apagar-tudo apaga. Toda corrida de produção
grava um `lots`, então a partir da **primeira corrida** o SQLite levantava `FOREIGN
KEY constraint failed`, a transação voltava atrás, nada era apagado, e a tela
mostrava texto cru de SQLite em inglês — depois do toque.

###### 3. ~~Apagar "compras" apagava o livro-razão inteiro~~ — alta, fechada

`src/data/erase.ts`

`tablesFor('purchases')` começa com `movements`, e o `DELETE` é por empresa: levava
produção, contagem, perda, transferência e saída. A confirmação dizia *"isso apaga
as compras, e zera o custo médio"*. Não dizia que um movimento ia. Irreversível pelo
texto da própria tela, e sem cópia no servidor.

A regra da casa já era essa — a confirmação diz o que vai acontecer, com os números
por extenso. **Faltava o número.**

###### 4. ~~A guarda comparava uma lista escrita à mão consigo mesma~~ — média, fechada

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

##### O que a auditoria abriu — a fila de agora

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

###### A sala do tacho — a decisão que a F2 precisa, e ela é do dono

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

##### F3 — o mês que tira o papel do chão de fábrica

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

##### F4 — a fábrica que se explica sozinha

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

##### F5 — o fiscal

Projeto à parte, e o plano inteiro é desenhado para que **nada dependa dele**.
Microserviço .NET, certificado digital A1, homologação na SEFAZ. O que trava é
administrativo: o layout quem decide é a SEFAZ, e a homologação tem fila.

Começa quando o dono decidir começar. Não bloqueia F3, F4 nem F6.

---

##### F6 — publicar nas lojas

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

##### F7 — os trunfos

Diferencial de mercado, não a dor de hoje. Roteirização de entrega, PAC/POD, clima
aplicado à produção. Entram depois da F4 porque todos precisam do dado que ela
acumula.

---

##### Fora do escopo, por decisão escrita

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

##### Como a ordem é decidida

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

##### Como este plano se mantém vivo

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

### `docs/auditoria.md`

#### Auditoria do NORVA — 4 de setembro de 2026

Dez frentes, trinta achados. Escrito para o dono ler, não para um engenheiro.

---

##### O veredito, em três frases

**Uma fábrica pode começar a usar isto amanhã, com uma condição: uma fábrica só, e
com o estoque num lugar só.** O que quebra primeiro não é o cálculo — a aritmética
do dinheiro e do livro-razão está sólida e foi provada — é a **câmara fria**, que a
Fase 2 entregou como lugar e que metade do aplicativo ainda não enxerga: o alerta de
validade emudece, a produção fica impossível com um erro em inglês, e a contagem da
prateleira compara com a empresa inteira. **E duas coisas precisam de conserto antes
de qualquer cliente real: o livro-razão aceita item de outra empresa, e três dos sete
tipos de lançamento não podem ser corrigidos por estorno.**

---

##### O que está sólido

Isto não é cortesia. Uma auditoria que só lista problema não diz onde não mexer.

- **O dinheiro.** A separação entre `Cents` inteiro e `Rate` fracionário está
  genuinamente de pé: a taxa é congelada por movimento, o arredondamento acontece
  uma vez só, e não há dinheiro em float em lugar nenhum. É a capa do projeto e ela
  se sustenta.
- **O isolamento de leitura entre empresas.** Exercitado tabela por tabela: uma
  empresa não lê a outra. (A **escrita** tem o buraco descrito abaixo.)
- **A costura entre o celular e o servidor.** É a parte mais bem defendida do
  repositório — o `agreement.test.ts` compara os dois esquemas nos dois sentidos, e
  o `db:verify` reproduz a fila inteira contra um Postgres de verdade, sob RLS.
- **O dicionário.** Os três idiomas têm exatamente as mesmas chaves, e a compilação
  quebra se alguém escrever texto em um só. Melhor que a média.
- **O índice de saldo** está certo, e as consultas de saldo o usam.
- **A grade do produto** recusa o cadastro impossível, e o pedido nasce onde a
  empresa mandou — os dois provados contra o Postgres.

---

##### O que precisa de conserto antes de uso real

###### Já consertado nesta rodada

**O portão de mutação estava verde por construção.** `npm run mutate` declarava toda
mutação "pega" sem nunca ter consultado a suíte — desde 3 de setembro, 66 commits.
A oficina que ele monta não copiava as pastas que os testes leem, então a suíte
morria lá com 19 falhas antes de qualquer mutação, e "falhou" quer dizer "pegou".
Consertado, e ele expôs **seis mutações que sobreviviam**: quatro buracos reais
(entre eles a média móvel do produto e o filtro de estorno em "produzido hoje"), que
ganharam teste, e dois equivalentes, que ganharam marcador com motivo.

**A capa não abriria com dois anos de fábrica.** A cláusula "o que foi estornado não
aconteceu" perguntava, para cada linha, se existia um estorno — sem índice, isso é
uma varredura do livro-razão inteiro por linha. Medido em 60 mil movimentos (cinco
meses de uma fábrica de seis lojas): **9,9 segundos numa consulta que leva 4 ms com o
índice**. Oito consultas usam a cláusula e a capa dispara cinco de uma vez. Índice
criado nos dois lados, com guarda que lê o plano de execução.

###### Consertado depois que isto foi escrito

Os números dos achados **não mudam** — este documento é lido por quem o recebeu, e
renumerar uma lista que alguém já leu é trocar o assunto de baixo do dedo dele. O que
foi fechado fica marcado aqui, com o que impede a volta.

- **1 — item e local de outra empresa.** Três chaves compostas em `movements`
  (`0029`), pelo mesmo padrão que `orders` já usava. Guarda: checagem 10 do
  `db:verify`, que tenta a escrita cruzada contra um Postgres de verdade e espera a
  recusa.
- **3 — o custo médio depois do estorno.** `recomputeItemCost` refaz a média dobrando
  o livro-razão sem a corrida errada e sem a perna do estorno. Guarda: duas mutações
  curadas, uma delas na cláusula do estorno.
- **4 — a câmara fria meio invisível.** As três leituras consertadas. As duas
  primeiras (o cartão de validade da capa e o alarme do celular) com guarda de fonte
  que reprova qualquer tela que prenda o aviso a uma sala; a terceira, a conta de
  quanto dá para prometer, passou a somar todas as salas nossas — e a régua de quais
  são nossas saiu de três grafias para uma, com guarda que compara o SQL com ela.
- **5 — a produção impossível com insumo na câmara.** Os três defeitos: a tela lê o
  piso da sala em que o tacho roda (a mesma que a corrida grava), então impede em vez
  de liberar um botão que a escrita vai recusar; o erro do livro-razão virou frase de
  tela nos três idiomas, em vez de `Not enough stock:` cru; e a parede virou
  instrução — a tela diz **onde** o insumo está, sala por sala.
  **O que ficou:** registrar o trajeto câmara → almoxarifado não existe, e isso é
  decisão de dono sobre a F2. Está escrita em `docs/roadmap.md` ("A sala do tacho"),
  com as duas formas e o motivo de nenhuma poder ser escolhida por mim.
- **O ícone de "Produção" ser um picolé** (um dos médios), num aplicativo cuja primeira
  linha diz *"nada de regra chumbada de sorvete"*. Ele estava nos dois lugares mais
  visíveis que existem: a aba de baixo e o crachá do primeiro cartão da capa. Virou a
  unidade saindo pela esteira — a única coisa que picolé, queijo, tinta e cosmético
  têm em comum. Levou três desenhos, cada um reprovado por uma FOTO da barra de abas:
  ícone não se julga sozinho, se julga na fileira em que vai viver.
- **O percentual com ponto em vez de vírgula** (um dos médios), e ele era pior do que
  parecia: `formatPercent` já existia — com um docblock dizendo, no passado, *"existia
  em três lugares como `(x * 100).toFixed(1)`"* — e **três lugares continuavam
  assim**. Conserto pela metade é a forma de defeito mais barata de produzir e a mais
  difícil de notar: o repositório parece consertado porque a função certa existe e tem
  chamadores, só não todos. Agora é guarda de fonte, e ela recusa a multiplicação por
  cem com `toFixed` na mesma linha de um `%`.
- **`recorded_by` cedível no pedido** (um dos médios): a porta de quem aprova só
  perguntava pela capacidade, então o mesmo `update` que aprovava podia trocar QUEM
  anotou o pedido. Congelado por gatilho para todos, como a imutabilidade de
  `movements` já é. Guarda: checagem 13 do `db:verify`, escrita ANTES da migração e
  vista reprovando com o autor trocado.
- **E um achado que a auditoria não fez, na mesma família:** `readings` nasceu sem
  política de update, então **reenviar uma leitura da câmara travava a fila para
  sempre** — e a leitura é a escrita com maior chance de subir duas vezes em todo o
  aplicativo, porque é anotada a −18 °C, onde não há sinal. Quinta aparição da mesma
  família (0015, 0020, 0027, 0030 e agora), e a primeira encontrada **procurando a
  família** em vez de esbarrando nela. A checagem 9 replicava um `orders` e só; a 12
  replica a leitura, e reprova sem a migração.
- **11 — sem caminho para os outros dois idiomas nem para outra moeda.** O idioma e a
  moeda passam a ser escolha da EMPRESA, guardada e obedecida pelas 33 telas: um
  cartão nos Ajustes, com os três idiomas escritos cada um na própria língua e oito
  moedas, cada uma mostrando a mesma quantia como ela escreve. O aparelho entra como
  palpite do primeiro dia — idioma, moeda e fuso — e nada mais depois disso.
  **E fechou um defeito que a auditoria não viu:** o fuso vinha chumbado em
  `America/Sao_Paulo`, então uma fábrica em Manaus lançava o tacho das 22h no dia
  seguinte — na data que vai impressa na etiqueta do lote. Agora vem do relógio do
  aparelho, que está no galpão.
  Provado no navegador: a suíte declara um aparelho brasileiro, o aplicativo abre em
  português sem ninguém escolher nada, e trocar para inglês troca a tela inteira e
  sobrevive a sair dela.
- **10 — o texto pequeno reprovando contraste.** As seis paletas subiram de 2,55–4,43
  para **4,6:1 ou mais** contra o fundo mais claro em que cada uma pinta, que é a
  régua da WCAG para texto normal. Guarda em `src/theme/contrast.test.ts`, lendo as
  cores do próprio arquivo de tokens: cor nova entra na medição sem ninguém
  acrescentar nada, e a hierarquia das três tintas é conferida junto — legível não
  pode virar "tudo igual".
  **Uma correção à auditoria:** ela disse "2,55:1 nas quatro combinações". O 2,55 é o
  pior caso (Orgânico claro sobre `paper`), não o número de todas; a faixa medida era
  2,35 a 4,43, e são **seis** paletas, não quatro. O achado está certo; o número era
  o do extremo.
- **2 — compra, perda e contagem sem estorno.** Os três atos passam a gravar
  `movement_group_id` (a compra pela NOTA, não pela linha), e ganham a porta que
  faltava: o cartão "Últimos lançamentos" na tela do insumo desfaz no toque, com a
  conta aberta antes de escrever e a recusa explicando o caminho quando não cabe.
  Dar grupo sem porta não seria conserto — o portão P1 do projeto pede o chamador no
  mesmo commit. Provado no navegador, não só na unidade.
- **9 — o livro-razão saindo pelo backup do Android.** `allowBackup` desligado no
  `app.json`, com guarda em `src/release.test.ts` — a intenção conferida em todo commit e
  o manifesto **gerado** conferido no fluxo de build, que é o arquivo que instala.
- **O `versionCode` que colidia** (um dos treze médios, e o mais barato deles): 0.10.0
  e 1.0.0 davam 100000 os dois, com o 0.10.0 já publicado. A fórmula nova dá faixa
  própria a cada parte e concorda com a antiga em toda versão 0.x.0, então nada do que
  já saiu muda de número.
- **8 — a órfã que travava a fila.** Apagar uma área menor deixava a fila apontando
  para linhas que acabaram de ser apagadas. Agora a varredura esquece, dentro da mesma
  transação, o que a fila ia mandar de uma linha que não existe mais — e só o que nunca
  subiu (`sent_at` nulo); para o que subiu quem fala é o comando `erase`, que viaja
  depois. Guardas: a lista de tabelas da fila é conferida contra todo `enqueue` do
  repositório E contra o esquema, um teste contra banco de verdade prova as duas
  metades (a órfã vai, a escrita viva fica), e uma mutação apaga a varredura.
  **Uma correção à auditoria:** ela disse "trava a fila para sempre", e hoje isso é
  futuro, não presente — `serialize` não tem chamador de produção, porque o transporte
  é injetado e nenhum existe ainda. O que existe hoje é a fila crescendo com entradas
  que nunca poderão subir, e a mina armada para o dia do transporte.
- **6 — a contagem que prometia um número e gravava outro.** A sala viaja pela rota,
  `findItem` e `itemMovements` respondem pela sala, e a contagem grava onde leu. Com o
  item em mais de um lugar e nenhum escolhido a contagem não é oferecida: a tela lista
  os lugares e cada linha leva à contagem daquele. O assistente segue a mesma regra —
  item espalhado ele localiza, não conta. Guardas: uma de fonte contra local fixo numa
  tela, três mutações curadas, e um teste que prende o número da tela ao número que o
  `recordCount` daquela sala espera.

###### Aberto, e é o que decide se um cliente entra

**1. O livro-razão aceita item e local de outra empresa.** *(alta — uma migração)*
`movements.item_id` e `location_id` são chaves simples. A permissão confere que a
pessoa pode gravar **naquela empresa**, e ninguém confere que o item é **daquela
empresa**. A tabela `orders` já faz certo, na mesma base: `(place_id, company_id)`
apontando para `(id, company_id)`. Basta `movements` fazer igual.

**2. Compra, perda e contagem não podem ser corrigidas.** *(alta — um commit)*
A primeira fundação do projeto diz que se corrige por estorno, nunca por exclusão. O
estorno acha o lançamento pelo grupo — e três dos sete caminhos de escrita não
gravam grupo nenhum. Na prática: **a nota de açúcar digitada com dez sacos onde era
um não tem como ser desfeita.** A contagem conserta a quantidade e não conserta o
dinheiro; a média móvel já foi misturada.

**3. Estornar uma corrida deixa o custo médio errado para sempre.** *(alta)*
O saldo volta certinho — isso está testado. O custo não volta. Quem digitou 50 onde
saíram 500 corrige a quantidade e fica com o preço dez vezes alto embaixo de todo
número de dinheiro do aplicativo.

**4. A câmara fria é meio invisível.** *(alta — três telas)*
Três leituras fixam o almoxarifado em vez de aceitar a sala: o cartão de validade da
capa, o alarme do celular, e a conta de quanto dá para prometer. O dono cadastra a
câmara, manda o picolé para lá — que é o que uma fábrica de picolés faz — e **o aviso
de validade nunca mais toca**.

**5. Com insumo na câmara, a produção fica impossível.** *(alta)*
A tela mostra o insumo disponível e libera o botão, mas o piso conta só o
almoxarifado. Cada toque devolve um diálogo com o corpo **em inglês**, e a tela não
oferece saída.

**6. A contagem promete um número e grava outro.** *(alta)*
O operador filtra pela sala no almoxarifado, toca no item e conta a prateleira. A
tela de detalhe não recebe a sala: o diálogo compara com o saldo da **empresa
inteira** e o razão escreve contra o almoxarifado.

**7. Quarta aparição da fila travada.** *(alta — uma migração)*
O lugar padrão que o aplicativo enfileira é recusado para seis dos sete papéis —
inclusive o `operator`, que é o papel do celular emprestado. A fila trava atrás dele.

**8. Apagar uma área menor trava a fila para sempre.** *(alta)*
Apagar as compras de exemplo — o caso normal, descrito no próprio código — deixa
linhas órfãs na fila, e órfã não é recusa: é exceção que repete.

**9. O livro-razão sai do celular pelo backup do Android.** *(alta)*
`allowBackup` está ligado por padrão. O celular da fábrica é compartilhado por
decisão escrita, e costuma estar logado na conta Google de alguém.

**10. O texto pequeno reprova contraste.** *(alta)*
O tom `inkFaint` dá 2,55:1 nas quatro combinações de tema — 124 corridas de texto de
11 e 13 px, no tema que sai da caixa. O rótulo que diz **o que** o número é fica
ilegível no corredor da câmara, com luva e condensação.

**11. Não há caminho para os outros dois idiomas nem para outra moeda.** *(alta)*
O dicionário tem os três, e nada leva ninguém até eles. Não afeta o Brasil de hoje;
afeta o dia em que o aplicativo for publicado.

**E treze achados médios**, entre eles: `recorded_by` cedível no pedido, a embalagem
abaixo de meio centavo virando de graça, a aprovação de pedido que nunca atravessa,
o percentual com ponto em vez de vírgula, o ícone de "Produção" ser um picolé num
aplicativo que promete servir qualquer fábrica, a tela de abertura ainda ser o
andaime da Expo, e o `versionCode` que para de crescer em 1.0.0.

---

##### O que é risco, e não defeito

- **A câmara fria como lugar é decisão escrita** e está certa. O que falta é as
  telas a enxergarem — o item 4 acima é dívida da entrega, não erro de desenho.
- **Seis das oito perguntas de prontidão de loja** já estão registradas como
  fronteira no plano, com o que as destrava. Não são surpresa.
- **Dois mutantes são equivalentes**: o estorno tem duas checagens em camadas, e
  nenhum teste de uma linha de execução as distingue. Ficam marcados.

---

##### O que esta auditoria NÃO conseguiu olhar

Auditoria que não declara o limite do próprio escopo não é profissional.

- **A segunda lente adversarial foi cortada.** O desenho previa dois verificadores
  independentes por achado — sessenta agentes. Nesta máquina, com dois núcleos
  livres, isso levaria cerca de nove horas. Os trinta achados vêm da leitura dos dez
  auditores, muitos com reprodução executável própria; **eu verifiquei pessoalmente
  seis**, entre eles os dois já consertados e os dois de fundação. Os outros
  carregam a evidência de quem os achou, e ainda precisam da segunda leitura antes
  de virar conserto.
- **Nada foi visto numa fábrica.** Nível de evidência E3: exercitado contra Postgres
  e navegador de verdade. O contraste, o alvo de toque com luva e o QR a um braço de
  distância só se resolvem com aparelho na mão.
- **Não houve teste de carga real**, só medição de consulta. A conclusão sobre a
  capa vem de um SQLite com dois anos de movimento sintético.
- **As duas vulnerabilidades moderadas** que o GitHub aponta não puderam ser lidas:
  o `npm audit` não alcança o registro deste ambiente.
