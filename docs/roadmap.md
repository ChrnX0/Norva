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
| telas | **31** | `find app -name '*.tsx' \| grep -v _layout \| wc -l` |
| tabelas no aparelho (SQLite) | **25** | `grep -c 'CREATE TABLE IF NOT EXISTS' src/data/db.ts` |
| tabelas no servidor (Postgres) | **26** | `grep -h '^create table' supabase/migrations/*.sql \| wc -l` |
| migrações do servidor | **43** | `ls supabase/migrations \| wc -l` |
| migrações do aparelho | **V22** | último `const V` em `src/data/db.ts` |
| papéis | **7** | `src/domain/access.ts` |
| capacidades | **18** | `src/domain/access.ts` |
| linhas de código | **~45.000** | `find src app e2e scripts supabase -type f \( -name '*.ts*' -o -name '*.sql' -o -name '*.mjs' \) \| xargs wc -l` |

E a barra de verificação, que é o que separa "compila" de "funciona":

| | |
|---|---|
| `npm test` | **445** testes |
| `npm run mutate` | **110** defeitos plantados, 108 pegos e 2 equivalentes |
| `npm run e2e:fast` | **49** checagens num navegador de verdade |
| `npm run db:verify` | **19** garantias contra um Postgres descartável, sob RLS |
| `.proofgate/verify.sh` | **24** guardas de entrega |

**Nível de evidência: E3** — exercitado contra Postgres e navegador de verdade, com
as 21 telas fotografadas nas **quatro caras de verdade** (Papel e Orgânico × claro e
escuro, 84 fotos, `npm run shot -- --tudo`). Até 5 de setembro toda foto chamada
`organico` era Papel, porque a ferramenta herdava a cara em vez de escolhê-la
(`docs/insights.md`, "padrão não é escolha"); ela passou a escolher sempre e a
**recusar duas fotos idênticas com nomes diferentes**, então a afirmação acima é
conferível. E **nada visto numa fábrica.** Essa é a lacuna que nenhum teste fecha, e ela decide o que pode ser
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

### O que a revisão das quatro caras fechou — e o que ela deixou de pé

Fechados em 5 de setembro, com a foto ao lado de cada um: o `Field` desenhava a caixa
do Orgânico nas duas caras (39 campos); a espessura do traço estava copiada em 26
lugares em vez de morar no tema; o símbolo da moeda estava escrito na tela em três
campos, com oito moedas existindo; a `Landscape` prendia sol, nuvem, chuva e fumaça
por pixel na borda enquanto o céu esticava; o degradê sob a `Sparkline` punha massa
no Papel; a palavra do botão saía ilegível sobre a cor do Papel escuro; e a linha do
transporte cortava o nome do produto para caber o número.

**De pé, e o primeiro item está TRAVADO pelo portão P2 — o que eu escrevi antes
aqui estava errado:**

1. **Refluir em colunas a 840 dp — DESTRAVADO, decisão do dono, 6 de setembro.**
   Eu tinha travado isto no portão P2 completando a frase *"eu mudaria isto se eu
   visse alguém usando um tablet"* e concluindo que ninguém usava. Errado: **o dono
   tem um.** *"eu tenho um tablet, depois a gente compila o apk e eu testo, bora pro
   seguinte."* O P2 não é uma regra sobre o mundo, é uma pergunta — e quando existe
   quem observe, ele deixa de travar.
   **Primeiro corte feito em 6 de setembro**, e o dono viu o primeiro corte antes de
   mim: *"só pode ser brincadeira que você ainda tem esse layout fora de padrão"*.
   Dois defeitos na foto, os dois consertados no mesmo dia: a grade deixava um buraco
   de três portas debaixo de "Pergunte" (cada linha tinha a altura do cartão mais
   alto), e as cinco abas se espalhavam em 900 dp com 150 dp de nada entre elas.
   Agora: quem pareia é escolha da tela (`pares` no casco), as peças **empacotam** em
   duas pilhas em vez de uma grade com linhas, um filho marcado `Inteiro` sai na
   largura toda, e as abas se juntam na mesma medida do conteúdo. Abaixo de 840 dp
   nada muda, com guarda.
   ~~**O que fica de pé:** o pé das duas colunas é desigual~~ — **FECHADO em 6 de
   setembro.** As peças passaram a ser medidas (`onLayout`) e a distribuição é
   escolhida por `src/components/colunas.ts`. Na gaveta do "Mais" o desnível caiu de
   uns 800 dp para uns 20: alternar punha "Cadastros" (cinco portas) e "Ajustes" do
   mesmo lado; medindo, "Lançamentos" e "Ajustes" se acomodam juntos à direita. Em
   "Relatórios" nada muda, e a foto explica: com três cartões, `[0,1,0]` já é o melhor
   corte que duas colunas permitem.
   **E o guloso sozinho não era melhor que alternar** — o teste desmentiu o docblock
   que eu tinha escrito: com as alturas `290,229,119,384,236` ele fecha com 90 e
   alternar fecha com 32, porque decide olhando só o presente. Por isso `distribuir`
   calcula as duas e fica com o pé menor: é o que faz "nunca pior que antes" ser
   verdade em vez de plausível.
   A prova final continua sendo o APK no tablet dele — o que é "padrão" de tablet se
   decide com o aparelho na mão.
2. **O cartão com desenho e sem título** deixa o glifo sozinho numa linha, em três
   telas (etiqueta do lote, clima, catálogo). No Papel lê como dingbat de seção e
   funciona; no Orgânico é um crachá flutuando. Decisão de desenho, não defeito.
3. **A pele virou ponto de extensão — 6 de setembro.** O dono olhou a foto do
   Orgânico e disse *"o q estava NEM ORGANICO ERA"*, e depois foi explícito sobre o
   porquê de isso importar: *"qq tema futuro ou o q vc chama de skin tem q poder ser
   aplicado sem problemas… futuramente a gente vai criar mais skins"*.
   O defeito era estrutural: o Orgânico era o Papel com a cena trocada, e mais oito
   componentes decidiam sozinhos com `skin === 'papel' ?`. Agora a pele **declara os
   traços** (`genero`, `tintaCheia`, `marcaVemDoTom`, `titulo`, `radius.controle`) e
   **veste a capa** (`src/home/capas/`: casco de página, casco de peça, e as peças
   que ela desenha à sua maneira). Uma pele nova escreve isso e ganha as quinze
   peças funcionando; `registro.test.ts` recusa quem voltar a decidir pelo nome.
   **O que fica de pé:** a foto no emulador desta sessão. A máquina não tem
   virtualização e o app leva minutos para assentar; a prova final continua sendo o
   APK no aparelho do dono.

## A FILA DE AGORA — 6 de setembro, noite

O dono perguntou duas coisas: *"alguma coisa mais q vc acharia bom acrescentar? e
vou inverter a pergunta, vc removeria ou alteraria alguma coisa?"* — e depois de
ouvir: *"faz tudo então, coloca em ordem no roadmap"*. Está aqui, em ordem, com o
motivo de cada posição. A ordem não é por tamanho nem por gosto: **é por quanto
custa o erro se a coisa nunca for feita.**

Três dela são achado de varredura desta noite e vêm com a medida ao lado; cinco
são coisas que eu **removeria ou mudaria**, e essas são as que ninguém pede.

### FEITO em 7 de setembro — o Orgânico deixou de ser o Papel fora da capa

Duas correções do dono, no mesmo dia, com a mesma forma: **a capa estava certa e o
resto tinha ficado para trás.**

| o que ele viu | o que era | o que ficou |
|---|---|---|
| *"o cabeçalho animado pegou as animações do tema do Papel"* | a cena lia cor e espessura da pele e desenhava UMA geometria — traço fino, canto duro | traço `cabecalho: 'vinheta' \| 'paisagem'`, despacho por `Record` (pele nova quebra a compilação em vez de cair no Papel calada) |
| *"tem elemento aí do tema legado q está atrapalhando tudo"*, circulando a quina de um cartão | `Card` desenhava a própria caixa: canto arredondado com borda esquerda grossa, que na curva vira uma cunha torta | `Card` pergunta a roupa da pele (`Bloco`); o ramo legado foi apagado, não remendado |

Três defeitos que **só a foto pegava**, achados no mesmo passe:

- a engrenagem sumia depois de começar a girar — `transform` de `animatedProps`
  substitui o eixo de `origin`, e a peça gira em torno de (0,0);
- o botão de um controle saía da prancheta pela esquerda — `Cursor` recebia centro e
  curso, e 0,18 com curso 0,55 dá −0,095; passou a receber começo e fim;
- o bosque estava no mesmo pixel nas dezoito telas — o desvio agora sai do nome da
  cena, determinístico.

**Nível de evidência — E3, e com uma correção de método junto.** A prova é
`.shots/ajustes-393.png` — a MESMA tela que o dono circulou, depois: cunha ausente,
engrenagens girando, faixa sangrando, cartão branco sobre chão verde. Dois guardas
novos em `src/home/capas/registro.test.ts` (a cunha da quina e a tinta declarada),
os dois provados contra os arquivos reais de antes do conserto.

**A correção de método:** as primeiras horas de foto saíram todas em **720 dp** —
tablets — porque o emulador tinha `wm density 240` preso de um teste antigo, e eu
li margem e composição na largura errada. A foto não avisa: sai 1080 px de qualquer
jeito. Agora avisa — a legenda de toda foto traz a conta e marca ⚠ TABLET acima de
600 dp (`scripts/aparelho.mjs`), provado nos dois sentidos.

Depois das duas correções, três coisas que saíram da MESMA regra ("conserto de pele
não termina no arquivo que o mostrou") aplicada de propósito, procurando:

- **A paisagem sangra** quando a pele desenha paisagem. Na capa ia de borda a borda;
  nas outras vinte era um retângulo com margem — janela virou foto colada.
- **O chão do Orgânico ganhou verde de verdade** (`#F3F7F3` → `#E4EFE7`). Eram três
  por cento de diferença para o cartão branco: o cartão só existia pela sombra. E ao
  medir apareceu o que ninguém sabia — a paleta estava **presa**, com `apricot` sobre
  `sunken` em exatos 4,50:1. Os onze acentos desceram junto, matiz e saturação
  intactas.
- **A barra de abas é do material da pele.** Era `paper` nas duas; com o chão novo ela
  virou a cor da página com uma linha invisível. Numa pele de superfícies a barra é
  superfície.
- **O `CountUp` existia só na capa** — e o dono tinha pedido *"quero em todas as
  telas"*. Passou a valer para o número de que a tela fala: estoque parado, custo
  unitário, perdas, produção de hoje, destinos do dia, insumos guardados.

**O ESCURO foi olhado, e passou.** Ele é onde este projeto já se queimou uma vez — uma
caixa preta com um sol dentro chegou na tela do dono —, então não podia ficar em
"deve estar certo". A fábrica sai âmbar acesa sobre a noite verde, as engrenagens
ganham miolo âmbar, e o chão continua sendo a matiz escolhida escurecida, que é o que
uma colina faz à noite. Foi a melhor das quatro caras.

**Com uma ressalva de nível, dita porque ela importa:** a prova é do NAVEGADOR
(`npm run shot -- --rota /settings,/production --escuro --com-dado`), não do aparelho.
Isso prova os tokens e a composição — que é o que estava em dúvida —, e não prova
densidade nem toque. O emulador atrapalhou três tentativas seguidas (System UI
travando sob carga, e o `system_server` subindo quebrado uma vez), e a foto de
aparelho no escuro fica para quando ele estiver recém-subido e sozinho na máquina.

**O que NÃO foi feito e por quê:** a paleta do Orgânico continua clara. O dono pediu
*"dá mais cor para o tema papel"* — o Papel já ganhou os oito acentos escurecidos; o
Orgânico ainda não foi olhado sob essa régua, e a hierarquia escrita manda o Papel
primeiro.

### 0. O backup — 0a e 0b FEITOS em 6 de setembro; falta o 0c (Drive)

Hoje o razão inteiro mora em `norva.db` no aparelho. **Aparelho quebrado, roubado
ou formatado = a fábrica sem histórico**, e não existe estorno para isso. Todas as
outras coisas desta fila atrasam funcionalidade; esta perde dado.

O dono levantou o Google Drive, e a ideia é boa — **com uma correção de ordem que
vale mais que a escolha do destino: o risco fecha antes do Drive.**

| passo | o que fecha | conta ou crédito que gasta |
|---|---|---|
| **0a. O arquivo** — `VACUUM INTO` num `.db` novo, e a restauração de volta | a prova de que existe cópia fiel e que ela volta | nenhum |
| **0b. A partilha** — `expo-sharing`, o dono manda o arquivo para onde quiser | **o risco de perder tudo, inteiro** | nenhum |
| **0c. O Drive automático** — entrar com Google, `appDataFolder`, sobe sozinho | o dono não precisa lembrar | OAuth do Google, de graça |

**`VACUUM INTO` é o achado que torna o 0a pequeno.** O banco do aparelho é um
arquivo de verdade (`src/data/db.ts:890`), e o SQLite tem uma instrução que escreve
uma cópia **consistente** dele num arquivo novo — sem parar o app, sem WAL pela
metade, sem serializador para escrever e manter. Provado nos dois lados: a cópia
leva os dados e leva o `PRAGMA user_version`, que é justamente o marcador que o
`migrate` já usa (`:954`). Então **um backup antigo se restaura sozinho**: o
aparelho abre a cópia, vê a versão, e roda as migrações que faltam. É a mesma
escada que já existe para um celular que ficou dois meses desligado.

**Nível de evidência, medido em 6 de setembro às 19h41 no emulador — E3.**

| a afirmação | nível | o que provou |
|---|---|---|
| a regra (grava, volta, recusa cópia nova, não esquece tabela, desfaz em órfão) | **E3** | `npx tsx --test src/data/backup.test.ts` — 7 provas contra SQLite de verdade |
| `VACUUM INTO` e `ATTACH` funcionarem **no aparelho** | **E3** | o toque no botão, e a tela respondendo *"Ela guarda 6 movimentos e pesa 320 kB"* |
| a cópia chegar num app que a receba | **E1** | a folha abriu vazia no emulador nu; em aparelho real depende do mimetype, que foi corrigido para `octet-stream` e **não foi visto funcionando** |

A terceira linha é o que falta, e ela é do dono: o APK no tablet dele, tocar em
*"Guardar uma cópia agora"*, e ver o WhatsApp aparecer na lista.

**E o emulador achou o que teste nenhum acharia**, que é a razão de a foto ser regra
aqui: o mimetype `application/vnd.sqlite3` faz o Android oferecer **nenhum**
aplicativo, porque quase nenhum declara aceitá-lo. A chamada é idêntica, a promessa
resolve igual, e o que muda é a lista montada do outro lado.

**E o 0b é o passo que fecha o risco, não o 0c.** Uma vez que o arquivo existe e
volta, mandá-lo para o WhatsApp do dono, para o e-mail ou para o Drive na mão é uma
folha de partilha do sistema — zero conta, zero crédito, funciona esta semana. O
Drive automático é conveniência em cima disso, e conveniência não é o que separa
uma fábrica com histórico de uma sem.

**Três coisas decididas aqui, para não virarem pergunta:**

1. **Backup não é sincronia, e confundir os dois é caro.** O Drive resolve *"o
   celular morreu"*. Ele **não** resolve *"dois celulares escrevendo na mesma
   fábrica"* — isso é o servidor, com `recorded_by` imposto por política e regra de
   conflito. Então o Drive **não adianta o servidor: ele torna seguro o servidor
   demorar**, que é exatamente a decisão escrita do dono (*"o servidor sobe o mais
   tarde possível"*).
2. **O destino é configuração da empresa (F7), e o primeiro construído é o Drive.**
   Nem todo dono tem ou quer conta Google, e o aplicativo vai para as duas lojas —
   quem está no iPhone espera iCloud. Chumbar Drive seria escolher por ele.
3. **O que vai no arquivo é o razão inteiro, com custo e fornecedor dentro.** No
   `appDataFolder` do Drive ele é privado ao aplicativo, e ainda assim: quem entra
   na conta Google do dono lê a margem da fábrica. A tela diz isso em uma linha
   antes do primeiro backup, e não depois.

### 1. O extrato — uma tela que faz três trabalhos

Medido esta noite: **nove funções escrevem no livro-razão a partir de tela**
(`recordPurchase`, `recordCount`, `recordProduction`, `recordTransfer`,
`recordReturn`, `recordLoss`, `recordCheck`, `recordReading`, e o próprio estorno) e
**o caminho de volta é alcançável de duas** — `app/lots/[id].tsx:133` e
`app/inputs/[id].tsx:505`. A carga (`app/picking.tsx:141`) e a transferência
(`app/transfer.tsx:317`) gravam sem botão de volta.

A fundação diz *"corrige-se por estorno, nunca por exclusão"*, e ela está honrada no
banco e **inalcançável na mão de quem erra**. O que uma pessoa faz numa fábrica
quando não dá para consertar: para de registrar. Perde-se o dado, não o conserto.

E a tela que resolve isso é a que o dono já aprovou como **extrato fiscal** (§ *As
seis*, item 6): uma lista de grupos de movimento, cada linha com `[estornar]`. Ela é
também o `[por quê?]` de qualquer saldo. Uma tela, três trabalhos.

**A régua dela, decidida e não perguntada** — é correção, não preferência: o extrato
soma **taxa congelada linha por linha** (`amountOf(unit_cost_rate, base_units)`), e
por isso **não fecha** com `stockByPlace`, que valoriza o saldo com o custo médio de
hoje. Os dois estão certos e respondem perguntas diferentes; a diferença **aparece
na tela**, com o `[por quê?]` ao lado. Esconder com arredondamento conveniente seria
produzir o documento bonito, verde e falso que este repositório mais teme.

**E o nome dele é conferência, não prova.** No aparelho o razão não é append-only:
zero `TRIGGER` em `src/data/db.ts` contra três na `0001`, `erase.ts` apaga em bloco,
`recorded_by` foi removida na V5 e `device_id` nunca existiu. Um documento gerado no
celular **não tem signatário** — então ele assina *este aparelho, este operador,
esta data*. Documento para terceiro é do servidor, onde a política impõe quem
escreveu e o `UPDATE` levanta exceção.

### 2. O caminho de escrita para o servidor

A camada de conta existe (`src/sync/conta.ts`, `app/account.tsx`) e a fila existe
(`src/data/outbox.ts`, `src/sync/serialize.ts`) — **o que não existe é o transporte
entre as duas.** Com o 0 feito, isto para de ser urgência de sobrevivência e volta a
ser o que sempre foi: a diferença entre um caderno e um sistema, e a única peça que
não funciona offline (o prazo do entregador, em `docs/estudo-entrada.md`).

Continua travado no que o item 2b já diz: **E1**. Nada foi exercitado contra o
servidor porque entrar de verdade cria uma conta de autenticação no projeto do dono,
e essa é decisão dele.

### 3. Ouvir o aplicativo — cinco minutos dele, zero meus

`src/acessivel.test.ts` prova que todo alvo de toque se anuncia. **Ninguém nunca
ouviu o aplicativo.** O dono levantou o cego por conta própria (*"até para quem eh
cego, imagina…"*), e o TalkBack é uma chave nos ajustes do tablet onde o APK já
está. É um E3 que eu não alcanço daqui e ele alcança hoje.

---

## O que eu removeria ou mudaria — e o dono mandou fazer

### 4. ~~Papel é o produto; Orgânico é opção~~ — FEITO em 6 de setembro

Duas peles se pagam duas vezes em tudo: quinze cenas × 2, quatro paletas, e uma
guarda para mantê-las honestas. O preço já apareceu — **seis acentos do Orgânico
estão abaixo da régua de legibilidade** e vivem registrados como exceção em
`src/theme/contrast.test.ts` (o item 3c). **Seis exceções não é exceção, é padrão.**

Não remover: **hierarquizar.** Cena nova sai no Papel e o Orgânico segue depois, em
vez de um travar o outro — está escrito no `CLAUDE.md`, na decisão das peles.

**E os acentos foram consertados, não registrados: a lista de exceções da guarda
ficou VAZIA.** Eram oito e não seis — o `warning` do Papel também estava lá, e o
comentário do registro dizia "o PAPEL não está aqui" com ele na segunda linha do
conjunto. Os oito desceram pelo remédio que a própria guarda prescreve: matiz e
saturação intactos, só a luminosidade, e o cálculo achou o primeiro ponto em que
cada um passa. `apricot` de `#E29B52` a `#9D5C1A` — matiz 30 nos dois, saturação
71% e 72%, luminosidade de 60% para 36%. **É a mesma cor mais escura, e não outra
cor**, que era a dúvida que travava a decisão.

### 5. ~~O padrão da capa cai para ~5 peças~~ — FEITO, e são SETE

O catálogo de quinze está certo e fica. Errada era a **porta de entrada**: empresa
nova recebia muita coisa, e quinze peças com posição e tamanho é uma tela de ajuste
que um dono de baixa habilidade técnica não abre.

**Feito, e são sete — não os ~5 que eu propus.** Ao aplicar, o número arredondado
brigou com a Lei da Inteligência e a Lei ganhou: o padrão leva o que **avisa** e o
que **decide**, e o que só **conta** espera alguém pedir. Ficam `producao`,
`semana`, `aoVivo`, `cobertura`, `validade`, `entregaHoje` e `clima`. Saem oito, e
todas por serem relatório.

**`cobertura` e `validade` não desceram, e é aí que os ~5 morreram:** peça que avisa
e que ninguém ligou é aviso que não existe — uma fábrica que nunca abre Ajustes
nunca descobriria que tem lote vencendo. Cortar um aviso para chegar num número
redondo seria servir a minha frase em vez de servir a tela.

### 6. ~~O assistente congela até o áudio existir~~ — CONGELADO em 6 de setembro

1142 linhas em `src/assistant/skills.ts`, monolíngue por decisão escrita no topo do
`index.ts`, 791 de teste. Com o modo conversa e o áudio aprovados (§ *As seis*, item
4), a forma muda: a entrada deixa de ser caixa de texto e a resposta deixa de ser
parágrafo. Investir ali este mês é construir para jogar fora, e jogar fora custa
duas vezes — a construção e a coragem de apagar.

**Congelado, e está escrito no topo do `src/assistant/index.ts`**, ao lado do
raciocínio que já explicava o monolinguismo. Nada foi removido: o que congela é
habilidade nova e tradução das respostas. Conserto de defeito e o `[por quê?]`
continuam valendo sem prazo, porque essa parte não é do casador — é da doutrina.

### 7. ~~O que é espera sai da lista de serviço~~ — FEITO, veja *Espera aparelho* acima

Alguns itens abertos estão travados em observação — a frase do portão P2, *"eu
mudaria isto se eu visse ___"*. Isso não é trabalho, é espera, e carregar espera
junto com serviço **faz a lista mentir sobre quanto dela é acionável**. Vão para uma
seção própria, **"espera aparelho"**, e o que ficar na fila é tudo fazível hoje.

### A pergunta que mais decide o que o app consegue afirmar — `sale` sem escritor

**Achada em 7 de setembro construindo o "produza até".** O tipo `sale` existe no
razão desde a fundação e **nenhuma tela o escreve**. O aplicativo sabe o que saiu da
FÁBRICA e não sabe o que saiu para o CONSUMIDOR — a carga sai, chega na loja, e ali o
razão para.

Três coisas dependem disso: o Espelho da Loja não tem como calibrar (sem venda, o que
ficou na prateleira e o que vendeu são a mesma coisa para ele), a cobertura da empresa
é infinita para produto, e **margem não existe** — o custo congelado o razão tem, o
preço combinado também, e o que falta entre os dois é o fato da venda.

**E a pergunta é de produto, não de código, por isso está aqui e não na fila.** Duas
respostas possíveis, e elas são produtos diferentes:

| caminho | o que custa | o que dá |
|---|---|---|
| **A loja registra cada venda** | um PDV — aparelho, tela de venda, pessoa treinada | a venda no instante em que acontece |
| **A contagem periódica deduz** | quase nada: a contagem cega **já existe** e já vira movimento | a venda do período, com a diferença explicada |

O segundo cabe no que já foi construído e é o que uma fábrica de seis pessoas
aguenta. O primeiro é outro produto. **A escolha é sua**, e ela decide se o Espelho
da Loja tem como existir de verdade.

### Espera aparelho — o que NÃO é serviço, e por isso sai da fila

Estes não estão pendentes: estão **esperando alguém usar**. Carregar espera junto
com serviço faz a lista mentir sobre quanto dela é acionável, e a lista existe para
responder *"qual é a próxima"* — não para parecer cheia.

Cada linha diz **o que a tira daqui**. Espera sem condição de saída é espera para
sempre, com outro nome.

| o que espera | por que não se decide de dentro | o que a tira daqui |
|---|---|---|
| **A régua do "devolve demais"** do Espelho da Loja | não existe em lugar nenhum do código, e qualquer número que eu escolhesse seria invenção: 10% de devolução é ótimo numa loja de bairro e alarme num supermercado | um mês de movimento real numa loja, e a comparação de duas |
| **A calibração das compras inteligentes** | o prazo do fornecedor é observado, não declarado — e a média de zero entregas não é média | o `ordered_at` sendo escrito (isso **é** serviço, e está na fila) e depois algumas semanas de compra |
| **A ergonomia a -18 °C** | tela capacitiva com luva, QR a um braço de distância, dedo molhado. Nada disso é visível de dentro de um módulo nem de uma foto de emulador | o aparelho dentro da câmara fria, com alguém de luva |
| **A conta em E3** | entrar de verdade cria uma conta de autenticação no projeto do dono, e isso é decisão dele — não minha e não do código | uma decisão de uma linha: posso criar uma conta de teste |
| **Ouvir o aplicativo** | `src/acessivel.test.ts` prova que todo alvo se anuncia; ninguém nunca **ouviu**. Eu não alcanço o TalkBack daqui | cinco minutos dele no tablet, com o TalkBack ligado |
| **A conferência cega NA DOCA** | duas posições escritas discordam, e as duas têm razão: um formulário por item ninguém preenche de luva, e o esperado na tela faz a pessoa confirmar sem contar. A contagem do item já é cega; a chegada da carga não | ele ver uma conferência de carga acontecendo — ou dizer que o padrão passa a ser perguntar quantas caixas chegaram |

E a lição que essa separação carrega, porque ela já custou uma rodada: **o P2 não é
uma afirmação sobre o mundo, é uma pergunta.** Eu travei o refluxo em tablet
respondendo sozinho *"ninguém usa tablet"*, e o dono tinha um. Antes de pôr um item
aqui, a checagem é se quem observa não está do outro lado da conversa.

### 8. Feito nesta noite — as duas que eram conserto e não escolha

- **Um ponto de arredondamento, não dois.** `amountOf` diz de si *"the one place
  rounding happens"*, e `repository.ts` — que o importa na primeira linha — chamava
  `cents(rate * qty)` em dois lugares, cada um com o comentário *"arredondada aqui e
  só aqui"*. Três declarações de unicidade, dois autores de fato, e verdes porque
  hoje dão o mesmo número. Os dois passaram por `amountOf`.
- **A data do estorno virou regra escrita.** `reverseGroup` já datava em hoje, então
  estornar em outubro um erro de março não mexia no março que alguém já leu — o
  fechamento de período estável **de graça e por acidente**, sem comentário e sem
  teste. Agora o docblock diz por quê e o teste prende as duas pontas: o padrão cai
  em hoje, e a data explícita continua obedecida, que é como a sincronia reproduz um
  estorno de outro aparelho.

## A ORDEM — revista em 6 de setembro, com as decisões do dono

A pergunta dele foi direta: *"o roadmap completo já foi feito, confere? sem ele nao faz
sentido a gente sair fazendo as coisas pq vira bagunça."* Confere agora, e a ordem
abaixo respeita duas decisões escritas dele — *"termina o layout, nada pela metade"* e
*"depois do layout, o login/conta é o próximo, e ele pede estudo antes de código"*.

| | o quê | por que nesta posição |
|---|---|---|
| **1** | ~~**Refluir em colunas no tablet**~~ **— fechado, e o APK JÁ FOI ABERTO no tablet dele em 6 de setembro.** | as peças pareiam, o `Inteiro` interrompe, as abas se juntam e o pé das colunas ficou nivelado (`src/components/colunas.ts`). O que ele viu ao abrir não foi o layout: foi a cena parada e a cor apagada — que viraram o 3b. |
| **2** | **TRAVADO — decisão de faseamento, e ela é do dono.** A camada 1 do login **não** é independente do servidor | Medido em 6 de setembro antes da primeira linha de código, e **contra o que o próprio estudo tinha dito de manhã**: `movements.operator_id` referencia `memberships(id)` (`supabase/migrations/0014_who_was_holding_it.sql:21`), e `memberships.user_id` é `not null references auth.users` (`0001_foundation.sql:60`). O aparelho não pode criar `auth.users`, logo não pode inventar o id de um operador — e o id inventado **viaja** (`src/sync/serialize.ts:351`) e trava a fila por chave estrangeira no dia em que a sincronia subir, que é o defeito crítico que esta branch já consertou uma vez. As três saídas estão no fim de `docs/estudo-conta.md`; eu faria a (c) e depois a (a). |
| **2b** | **A conta da empresa — a camada 2.** ~~O servidor não subiu~~ **— SUBIU**, e ~~falta o cliente, sessão, cadastro do dono~~ **— FEITO em 6 de setembro** (`src/sync/conta.ts`, `app/account.tsx`, porta em *Mais*). A porta fica nos Ajustes e não na frente do aplicativo: a fábrica offline é o caso normal. **Falta o convite por código**, e falta o que só um login de verdade prova. | **Nível de evidência: E1.** Compila, passa as 410 do `npm test` e as guardas de tom e de camada — e **nada disso foi exercitado contra o servidor**, porque entrar de verdade cria uma conta de autenticação no projeto do dono e essa é decisão dele. O que falta para E3 é um `entrar` real: sessão guardada, `create_company_for_me` chamada, e a `companies_read` filtrando por associação. |
| **2c** | **O que não esbarra nisso** | ~~o motivo da devolução~~ **FEITO em 6 de setembro** (`return_reason`, aparelho `V19` e servidor `0034`, com a catorzena garantia do `db:verify` cobrando as duas metades da regra). ~~A **tela de conferir item a item**~~ fechou com a separação (`app/picking.tsx`, engradado a engradado, com a lista guardada por loja). ~~E o **preço combinado**~~ entrou em 6 de setembro (`0037` / `V22`), com histórico append-only ao lado — e o que ele destravou não é um campo: é a descoberta de que o aplicativo não tinha a quem vender. **O 2c está vazio.** |
| **3** | ~~**Espelho da Loja — construir**~~ **— FEITO em 6 de setembro** | `storeMirror` (`src/data/repository.ts`) e `app/mirror.tsx`, com a porta em Relatórios. A fração é por ITEM e não por loja, e isso é conserto de uma aritmética inválida que a primeira versão tinha: o razão conta em grama para o açúcar e em unidade para o picolé, e somar as duas afogava o item leve. Falta a calibração, que é o que precisa de fábrica — não há régua de "devolve demais" em lugar nenhum do código. |
| **3b** | ~~**A vida do aplicativo**~~ **— FEITO em 6 de setembro, e cobrado pelo dono** | *"o app tem q ser uma obra de arte… vc já viu organismo vivo MORTO?"*. A amplitude central subiu (`src/theme/tokens.ts`), as quinze cenas de cabeçalho existem (`src/components/cenas/`) e as 27 telas que usam o casco estão vestidas, a semana e o pote respiram, o bloco do tempo veste a pele, e a capa aceita meia coluna (`briefingFilas`, com teste). O estilo tem nome gravado: `docs/design/estilo.md`. |
| **3c** | **Os seis acentos do Orgânico abaixo da régua — decisão do dono** | `src/theme/contrast.test.ts` os registra com a razão escrita. Consertá-los muda uma pele que ele aprovou olhando: `apricot` sairia de `#E29B52` para `#9A5B1A`, que não é retoque de luminosidade, é outra cor. Os pequenos já foram. |
| **3d** | ~~**As quatro peças da capa que NAVEGAM em vez de abrir**~~ **— FEITO em 6 de setembro** | virou a `Porta` (`src/home/Capa.tsx`): o toque e o aviso do toque são a mesma peça, então não dá para acrescentar uma quinta porta sem o rótulo. |
| **4** | **Os sete médios** | pequenos e independentes; cabem entre as coisas grandes. O maior é a aprovação de pedido, que é F7 — vira configuração da empresa, não escolha nossa. |
| **5** | **A sala do tacho** | pergunta de PADRÃO para o dono, não de qual; e trava no P3 porque muda onde o consumo é gravado. Fica para a câmara fria da F2. |
| **6** | **Compras inteligentes** | mesma classe do 3 — construir agora, calibrar depois. ~~O primeiro passo era a data do pedido, porque `ordered_at` não tinha escritor~~ — **ele tem, desde 6 de setembro** (`app/purchase.tsx:578`), e com um desenho honesto: sem resposta nada é gravado, porque lacuna vazia é mais honesta que palpite. O que falta agora não é código, é **tempo**: `observedLeadTimeDays` precisa de entregas observadas, e isso é a linha *"calibração das compras"* da espera. |
| — | **O fiscal** | fora, e o único que trava por algo que nenhum dado resolve: certificado A1 e homologação na SEFAZ. |

De pé, nesta ordem e por este motivo:

1. **Os médios que sobraram** — e onde eles estão escritos, que era a parte que
   faltava. O roadmap mandava nos *"sete médios"* e só um estava nomeado; os outros
   moram na **tabela 11.5 do `docs/DOSSIE.md`** ("Mapa completo das leituras"), com
   `X` = sem chamador de tela e `Z` = sem chamador nenhum. Uma varredura de 6 de
   setembro sobre as 95 exportações de `src/data/repository.ts` reproduziu a tabela e
   fechou as duas que restavam ali:
   ~~`unchecked`~~ **removida** — duplicata exata de `shipmentsOn`, que já responde a
   mesma pergunta com a mesma regra e tem tela; e ~~`lastCostMove`~~ **ganhou tela**,
   que era o conserto certo: ela responde *"estável há N dias"*, o dicionário já tinha
   `stableFor`/`stableAlways`/`allSteady` nos três idiomas sem escritor, e a capa
   mostrava o cartão de preço só quando algo mexia — a fábrica com o custo firme via a
   mesma capa de quem instalou ontem.
   Caíram antes: o `versionCode`, o `recorded_by` cedível, o percentual com ponto, o
   ícone de picolé, **a tela de abertura** e **a fila que nunca era varrida**.
   Fica de pé: a aprovação de pedido, que **não é trabalho, é bloqueio** — ver abaixo.

   *E a varredura virou GUARDA, para não precisar acontecer de novo.* A de "toda função
   exportada tem chamador ou razão escrita" (`src/layers.test.ts`) olhava só
   `src/domain`; passou a ler o `src` inteiro, e no mesmo dia isso tirou sete
   exportações mortas fora do domínio — um ponto de extensão do assistente que nada
   estende, três ícones substituídos pelos glifos (com o docblock do arquivo afirmando
   o contrário) e dois formatadores. Ficaram registradas `__setOpener` (gancho de
   teste) e `drain`/`serialize` (o motor de sincronia, sem chamador porque o servidor
   não subiu). **Daqui em diante a próxima morta reprova sozinha.**

   *E ela está MEDIDA, em 6 de setembro — não é "falta escrever", é bloqueada.*
   A aprovação existe inteira no aparelho: `setOrdersNeedApproval`
   (`src/data/repository.ts:4771`) grava a bandeira no `meta`, `saveOrder` (`:4789`)
   nasce `pending` por causa dela, e `setOrderStatus` (`:4882`) enfileira a decisão.
   O que não existe é a bandeira ATRAVESSAR: `meta` não é tabela de sincronia — não
   há uma entrada `companies` em `src/sync/serialize.ts` —, e o gatilho
   `order_starts_where_the_company_says` (`supabase/migrations/0019_an_order_is_demand.sql:103`)
   lê `companies.orders_need_approval` **no servidor**, que ninguém nunca escreveu.
   Resultado no dia em que a sincronia subir: a empresa liga a aprovação, o aparelho
   grava `pending`, e o servidor reescreve para `open` na inserção. A aprovação vira
   decoração — e o gatilho está certo, porque a regra não pode morar no aplicativo
   quando o pedido vem de fora.
   ~~**Ela é do item 2b**~~ **— DESTRAVOU e FECHOU em 6 de setembro.** O 2b subiu, a
   linha de `companies` passou a existir, e `src/data/configuracao.ts` faz as três
   configurações da empresa atravessarem: quem muda empurra, quem entra puxa. Não é a
   fila de propósito — a fila carrega fato e é append-only; configuração é preferência,
   e a última palavra vale.

   *E `forgetSentBefore` fechou junto, em 6 de setembro.* A auditoria dizia "sem
   chamador fora de teste" e estava certa — mas o conserto não era apagar: o motor
   de sincronia mandava e **nunca varria**, então no dia em que a sincronia existir
   o celular de uma fábrica movimentada carregaria um ano de linhas já entregues,
   que é exatamente o que o docblock da função diz que não pode acontecer. Agora o
   `drain` faz a faxina no fim, com janela de sete dias — e o `now` do `SyncOptions`,
   que também estava declarado e sem uso, ganhou o primeiro chamador nela.
   O teste ficou VERMELHO com a faxina comentada antes de virar verde: a primeira
   versão dele media `pendingCount()`, que conta o marcar e não o varrer, e passava
   com o defeito na frente.

   *A abertura fechou em 6 de setembro, e o achado não era o que parecia:* a marca
   dela **já era gerada** pelo `scripts/icons.mjs` e o `app.json` nunca a citou —
   arquivo desenhado com cuidado e jogado fora, que é o P1 numa forma que o P1 não
   pega, porque o citador é um JSON. Agora está configurada nas duas luzes (o
   `expo-splash-screen` não recolore: o escuro pede o próprio arquivo) e só sai
   quando a cara escolhida já foi lida do disco, para não haver um flash branco entre
   uma abertura carvão e uma página carvão. `src/marca.test.ts` cobra a ponte.
   **Evidência E2:** as imagens foram olhadas, o contrato foi lido, a barra está
   verde — a abertura em si só se julga num build de release, e a própria Expo diz
   isso desde a SDK 52.

2. ~~**A embalagem digitada é um `Rate`, e está guardada como `Cents`.**~~ **FEITO em
   6 de setembro.** `products.unit_packaging_rate` (aparelho `V18`, servidor `0033`),
   a coluna antiga dormente e declarada em `src/sync/columns.test.ts`, as duas metades
   do cálculo agora são taxas com a procedência preservada, e a tela mostra
   **R$ 0,004** de volta em vez de R$ 0,00 (`formatUnitRate`). Provado nos dois
   sentidos: o guarda do custo congelado fica vermelho quando o arredondamento volta,
   e as 33 migrações aplicam contra Postgres com as treze garantias de pé.

   *De quebra, a metade LISTADA da embalagem já tinha o mesmo defeito na tela*:
   `formatMoney(Math.round(itemsRate))` — um palito de meio centavo aparecia como
   R$ 0,00 desde que a lista existe. Só apareceu porque a mudança de tipo obrigou a
   olhar as duas.

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

## A entrada — estudada em 6 de setembro, com o desenho decidido

O estudo está em **`docs/estudo-entrada.md`**, escrito depois de medir e não antes. O que
ele conclui, curto:

- **A fábrica já pode ser sempre offline** — a grade de nomes com PIN não depende de nada
  que não exista. O PIN é **atribuição**, não senha, e a tela deve dizer isso.
- **O servidor confere a CONTA, não o perfil da pessoa.** `movements_append` exige
  `recorded_by = auth.uid()` e `has_capability` da conta
  (`supabase/migrations/0008_ledger_speaks_phase_one.sql:26-41`). `profiles.capabilities`
  é camada do aparelho. Logo o teto do entregador tem que estar numa **conta por perfil**
  — que é o que a `0014` já dizia e eu tinha lido errado.
- **"Sempre offline" de verdade exige chave no aparelho e assinatura**, e portanto
  `expo-crypto`, `expo-secure-store` e uma biblioteca de assinatura — nenhuma existe. E
  exige alguém que confira, que hoje não existe: a política olha `auth.uid()`. Não se
  constrói antes do canal.
- **Revogar não tem solução offline.** O que dá é diminuir o estrago e fazer
  `devices.active` valer — hoje o servidor **não confere `device_id` em nada**.

**A ordem que saiu do estudo:** grade com PIN → `operator_id` ganha escritor → servidor
confere aparelho → conta por perfil e código de convite (quando o servidor subir) → chave
e assinatura (só se alguém pedir).

### O portão do dinheiro no aparelho — FEITO em 6 de setembro

Havia uma decisão escrita do dono sem código atrás dela: *"aparelho emprestado entra
como produção e nada mais. Celular da empresa passa de mão; quem está com ele usa o
papel `operator` — sem custo, sem preço, sem dinheiro."* O aparelho não tinha como
obedecer, e `app/assistant.tsx` dizia por escrito por quê: *"until sign-in lands,
whoever holds this phone is the owner"*. **A fronteira era verdadeira quando foi
escrita e deixou de ser** — a grade de nomes existe desde ontem, `people.profile_id`
aponta para um perfil, e o perfil carrega as capacidades. Ela esperava a CONTA, e o
que faltava era a PESSOA.

Agora `currentCapabilities` responde, e **oito leituras de dinheiro perguntam antes
de consultar**: `listItems`, `itemCosts`, `stockByPlace`, `lossesOn`, `recentRuns`,
`recentCostChanges`, `itemHistory`, `itemMovements` e a embalagem digitada de
`listProducts`. O portão fechado não apaga o número depois de lê-lo — ele não junta a
tabela de custo, que é a mesma forma da view do servidor (`0008`).

**Treze telas distinguem três estados** onde antes havia dois: tem número · ainda não
tem custo (lance a nota) · não é seu para ver. Zero respondia os dois últimos com o
primeiro, e a tela de insumos escrevia em âmbar *"12 itens sem preço — lance a nota"*
para um almoxarifado inteiramente precificado (`null <= 0` é TRUE em JavaScript).

**O que a verificação adversarial achou, e ela salvou a mudança.** Duas refutações
independentes mediram, rodando o código, que o portão que eu tinha acabado de
escrever ENVENENAVA O LIVRO-RAZÃO: `recordProduction` e `recordLoss` leem as taxas
por `itemCosts`, e com o portão fechado a corrida congelava `unit_cost_rate` nulo em
cada consumo e **5 onde o dono congelava 304,98** — sobrando só a embalagem. Pior, a
contaminação não ficava nas duas: `item_costs` é reescrito a partir do que elas
gravam, então transferência e contagem, que estão certas, passavam a congelar
fielmente o número errado; e o servidor recalcula pela mesma coluna (`0025`),
concorda, e a checagem de divergência do `db:verify` PASSA. Conteúdo de livro-razão
não se corrige: se estorna.

O conserto é a convenção `ForLedger` — `averageRatesForLedger` e
`listProductsForLedger`, sem portão, para quem GRAVA. Congelar custo e ver custo são
perguntas diferentes, e só a segunda tem portão. `src/layers.test.ts` recusa qualquer
arquivo fora de `src/data/` e `scripts/` que as mencione, porque os docblocks já
afirmavam esse guarda antes de ele existir — e docblock que promete uma rede que não
está lá é pior que docblock nenhum.

**Três testes novos, e a ordem entre eles é o achado:** o *gêmeo* grava produção,
compra, perda, contagem e transferência duas vezes — dono e operador — e afirma que
`unit_cost_rate` de cada linha é IGUAL, número por número; o *de mão única* prova que
nenhuma das oito leituras devolve dinheiro para quem não pode ver; e o do *piso*
prova as duas bandeiras do aparelho compartilhado. O de mão única sozinho passaria
com o razão apodrecido — foi exatamente o que faltou.

**O que fica de pé, dito por extenso:**

- **O portão está DORMENTE no padrão.** Ele só acorda quando a empresa marca
  `shared` **e** liga "Nomear quem gravou": sem isso ninguém é escolhido e o
  aparelho é do dono, como sempre foi. A fábrica que mais precisa dele é a que o
  liga.
- **Não é autenticação, e nada aqui finge que é.** A grade não pede senha, o PIN tem
  quatro dígitos e é opcional, e qualquer um pode tocar no nome do dono. O que o
  portão compra é o que o `access.ts` diz querer comprar: tirar a margem da vista de
  quem está embalando. Quem impõe de verdade é o servidor, e ele já impõe.
- **A aba Relatórios fica com um cartão só** para quem não vê dinheiro — os três
  cartões dela são dinheiro. As portas continuam lá (`/losses` só é alcançável por
  ali), mas responder as três perguntas da Lei da Inteligência em FATO — perdas por
  contagem, conferências da semana, corridas por unidade — é superfície nova e é
  decisão de faseamento do dono.
- **"O que falta para 3 tachos" continua recusado ao operador**, e é decisão
  escrita: a lista de compras tem rota `/purchase`, e comprar é ato de quem cuida do
  dinheiro. O atrito é real — também é pergunta de quem produz — e a saída, se o
  dono quiser, é a mesma conta sem a lista de compras.
- **A tela de gente ganhou portão de verdade** (`manage_company` conferido em
  `savePerson`, antes da escrita): sem ele, trocar o próprio crachá para "Dono" era
  a porta dos fundos de todo o resto.

### O preço de venda não é um campo que falta: é uma peça inteira que nunca existiu

Medido em 6 de setembro, ao ir construir *"o preço combinado na ficha da loja"* que
esta lista pedia. Três coisas que pareciam separadas são a MESMA falta:

| o que existe | desde | quem escreve |
|---|---|---|
| `movement_kind` tem `sale` — *"sold to a customer (revenue + margin)"* | `0001` | **ninguém** |
| `movements.unit_price_rate`, gateada por `view_sale_price` na view | `0008` | **ninguém** |
| `location_kind` tem `customer`, e a tela desenha o glifo e o rótulo dele | `0001` | **só a simulação** |

E a terceira linha é a pior das três, porque só a FOTO a mostrou. `app/places.tsx`
oferece três espécies no cadastro — `own_store`, `cold_room`, `store_room` —, todas
NOSSAS. Mas a fábrica de exemplo cria um cliente (`src/data/simulate.ts:130`, "Mercado
do Zé"), e a tela o desenha certinho, com o glifo e a sobrelinha "CLIENTE". **A
simulação mostra ao dono uma coisa que o aplicativo dele não sabe fazer** — é a mesma
família da ferramenta de olhar que mente sobre o que está olhando, e nenhum teste vê:
o dado semeado e o formulário são dois autores diferentes da mesma lista.

E o docblock do `moveBetween` decide por escrito o que isso significa: *"loja própria
é transferência e não venda: não há faturamento nem margem aqui, e o valor apenas muda
de sala."* Ou seja: para quem instala o aplicativo hoje, **não há a quem vender**, e é
por isso que a coluna de preço nunca teve escritor.

Então "o preço combinado" não é um campo na ficha da loja. É esta ordem:

1. ~~**As duas tabelas de preço**~~ — **FEITO em 6 de setembro.** São três, e a
   terceira é a que a refutação salvou: `items.sale_price_rate` (tabela),
   `location_prices` (o combinado, com `id` próprio para atravessar a fila) e
   `sale_price_history` (append-only, `location_id` nulo para a série do preço de
   tabela). Servidor `0037`, aparelho `V22`. **Nada toca o razão**:
   `movements.unit_price_rate` continua sem escritor.

   O portão da leitura é `manage_company` e **não** `view_sale_price`, contra o que
   eu ia escrever: a capacidade diz o QUE se pode ver, nunca QUAIS LINHAS, e cinco
   dos sete papéis a têm — com ela como portão, o gerente de uma loja leria quanto a
   outra paga. Sem coluna que amarre a conta a um lugar, quem administra vê o acordo
   de todos e mais ninguém vê o de ninguém; é mais estreito do que o produto quer, e
   estreito é o lado seguro de errar.

   A tela é a ficha da loja: um campo por produto, com a tabela ao lado (Lei 3) e
   *"era R$ 2,20 até 10/mar"* quando houve renegociação. Três guardas morderam ao
   longo do caminho — o conjunto de apagar, a travessia de colunas e a varredura de
   órfãs da fila —, e um teste achou um defeito de verdade: dois acordos combinados
   no mesmo segundo empatavam em `observed_at` e "de quanto veio" saía pela ordem
   que o SQLite quisesse.
   ~~**E a metade de TABELA ficou sem tela**~~ — **FEITA em 6 de setembro**, e ela é o
   portão P1 aplicado ao meu próprio commit: `saveSalePrice` com `placeId: null` tinha dois
   chamadores, `repository.test.ts` e `device-session.ts`, e `view_sale_price` não tinha um
   único leitor em `app/`. Construir o combinado primeiro — que é o que o dono pediu, e o
   que *vence* a tabela — deu à peça de baixo cara de existente. Agora o campo mora no
   cadastro do produto (`app/products/new.tsx`, gateado por `manage_company`: quem DEFINE) e
   o número na lista (`app/products/index.tsx`, gateado por `view_sale_price`: quem VÊ), com
   o `e2e` de ponta a ponta como chamador de produção. O campo mora em cartão próprio
   logo depois do custo por unidade, e esse lugar é correção de uma FOTO: ele nasceu
   dentro de "Palito, embalagem e rótulo", onde o número vizinho eram os cinco centavos
   da embalagem, sob um título que não é o assunto.

2. **O cliente e a venda** — `customer` criável na tela, embarque como `kind='sale'`,
   e só então o preço congelado no movimento. **Isto é P3 puro** e é decisão de
   faseamento do dono.

**O que a refutação adversarial derrubou da minha primeira forma**, e vale registrar
porque cada um custaria uma migração para desfazer:

- **A regra "preço só quando a contraparte é externa" trava a fila.** As duas pernas
  de uma carga são espelhadas: a perna que entra na loja tem contraparte FÁBRICA, que
  é interna. Um gatilho escrito sobre a contraparte aprova metade do ato e recusa a
  outra — e o motor para no primeiro buraco de propósito. A regra é *"alguma das duas
  pontas é externa"*.
- **O preço combinado tem HISTÓRIA, e sobrescrever perde o que não volta.** O custo
  pode ser sobrescrito porque `purchase_lines` é append-only e `item_cost_history`
  reconstrói; preço digitado à mão não tem fonte nenhuma atrás. "Por quanto vendíamos
  em março" some para sempre.
- **`view_sale_price` não diz QUAIS LINHAS**, e o `access.ts` já avisa isso em voz
  alta. Cinco dos sete papéis têm a capacidade: o gerente da Loja Norte leria quanto a
  Loja Centro paga. Custo não tem esse problema — há um custo. Preço precisa de
  ESCOPO, e escopo é a camada de conta, que ainda não existe.
- **Chave tripla sem `id` não atravessa a fila**, que endereça linha por id único.
- **`price_rate >= 0` mais o idioma `taxa || null`** faria um brinde combinado a zero
  congelar como "não havia preço". Zero não é preço.
- **Devolução relê o preço de hoje** — contra o que `reverseGroup` e `recordCheck` já
  decidiram duas vezes: o ato que volta se avalia pelo valor com que aconteceu.

E uma fronteira herdada, que não é defeito desta forma e vale escrever antes de existir
linha: **`locations` é o LUGAR e a PARTE CONTRATANTE ao mesmo tempo** (a `0019` diz
isso em voz alta — *"loja própria, cliente, distribuidor - tudo é `locations`"*). Uma
rede com cinco filiais negocia uma vez e teria o mesmo preço digitado cinco vezes, e
renegociar exigiria acertar as cinco ou as filiais discordam entre si. O preço congelado
no razão não é afetado; o que herda a conflação é a chave do acordo. O dia em que
aparecer rede, a parte contratante sai de `locations` — e é mais barato saber disso
agora, com zero linhas, do que descobrir com o acordo já digitado.

**O primeiro passo dos dois já entrou**, em 6 de setembro: `customer` é criável na tela
(`app/places.tsx`), com guarda que compara o formulário ao enum do servidor e exige
motivo escrito para cada espécie de fora. Sem isso, o preço combinado só teria como
assunto uma loja nossa — onde o próprio razão decidiu que não há faturamento.

### A configuração da empresa não atravessa — dívida estrutural

Achado ao construir a entrada, 6 de setembro. O servidor tem as três configurações em
`companies`: `floor_sign_in` (0011), `names_who_recorded` (0012) e `orders_need_approval`
(0019). O aparelho guarda a terceira em `app_meta` e agora as outras duas também — porque
**não existe tabela `companies` no banco do aparelho**, e portanto não existe coluna de
empresa que a sincronia saiba levar.

**E as duas frases que eu escrevi aqui em seguida estavam erradas — corrigidas em 6 de
setembro, antes de construir em cima delas.**

Eu tinha escrito que *"configuração da empresa é a única coisa que dois celulares da mesma
empresa não conseguem combinar"*, e que o conserto era *"uma tabela `companies` no aparelho
entrando na travessia como qualquer outra"*. Fui construir e conferi a premissa primeiro:
**`Transport` só tem `push`** (`src/sync/engine.ts:35`). O docblock do motor diz isso na
primeira linha, sem rodeio — *"sending what the phone wrote while it was alone"*.

Então:

- **Não é a única coisa: hoje dois celulares não combinam NADA.** A produção que o celular
  da fábrica grava não desce para o celular da expedição, porque não existe caminho de
  descida. A frase anterior fazia parecer que tudo mais já concorda e só a configuração
  ficou de fora.
- **E a tabela não consertaria.** Com travessia só de subida, cada aparelho empurraria a
  própria configuração para o servidor — o último a subir vence — e nenhum dos dois
  aprenderia o valor do outro. Seria meio conserto com cara de conserto inteiro, que é o
  que este projeto mais paga caro.

**A dívida verdadeira é: a sincronia é de mão única.** Não é uma tabela que falta, é o
caminho de leitura — e ele não é um `ALTER TABLE`, é uma decisão de desenho (o que o
servidor manda de volta, quando, e quem vence quando os dois lados mexeram na mesma linha).

E o preço dela subiu em 6 de setembro, por minha causa: `floorSignIn` e `namesWhoRecorded`
passaram a decidir **quem vê dinheiro**. Numa fábrica com dois aparelhos, um esconderia
custo e o outro não, sem que ninguém tivesse escolhido isso. Enquanto não houver descida, a
resposta honesta é que **o portão do dinheiro é por aparelho**, e está escrito assim no
`currentCapabilities`.

### Dois defeitos que a medição achou

**`movements.device_id` atravessa a sincronia e não existe no aparelho** — e agora existe
guarda para isso. Ela está na lista de colunas que viajam e nenhum `ALTER TABLE` de
`src/data/db.ts` a cria: viaja como `null`, sempre, e nada falha. O `columns.test.ts` cobrava
só a direção contrária (coluna do aparelho que não sobe); passou a cobrar as duas, com o
`device_id` registrado como fronteira até haver matrícula de aparelho — que é a peça que
precisa do servidor.

**Três configurações de empresa sem leitor:** `floor_sign_in` (pessoal ou compartilhado),
`join_code` e `names_who_recorded`. A escolha entre os dois caminhos de entrada **já está
modelada no servidor**; o app é que não pergunta.

---

## ~~Dívida das dez funções do domínio sem chamador~~ — PAGA em 6 de setembro

O portão P1 pergunta *quem chama isto no mesmo commit*, e a doença que ele existe para
pegar já tinha aparecido quatro vezes. A medição achou dez funções do domínio que nenhum
código de produção chamava. Verdito uma a uma:

**Quatro saíram**, porque o servidor passou a fazer o que elas faziam: `foldCostEvents`
(um `reduce` de uma linha), `purchaseUnitCost` e `priceMove` — a comparação entre as duas
últimas compras, que `item_cost_history` mais `recentCostChanges` respondem em SQL — e o
tipo `PriceMove` junto.

**Uma ganhou chamador, e fechou um buraco de verdade:** `isValidHierarchy` estava no
domínio desde o começo, exercitada só por teste, e **nada validava hierarquia de
embalagem**. Agora `saveItem` confere antes de gravar — degrau fora de ordem faz o
`UnitStepper` oferecer conversão errada e a conta de caixa sair torta, em silêncio.

**Sete ficaram registradas**, cada uma com a razão em `src/layers.test.ts`. Duas são
promessa escrita antes da funcionalidade (`needsHumanYes`), duas são a F4 que o dono
cortou do mês (`observedLeadTimeDays`, `reorderPoint`), uma implementa regra que o SQL
não faz (`ratesBefore` — o custo de hoje contra o de antes de uma SEQUÊNCIA, que é o que
impede uma alta de 9% em dois passos parecer 2%), uma espera tela (`daysUntilExpiry`) e
duas são primitivas da fundação do dinheiro, presentes para ninguém escrever o
arredondamento na mão.

**E o guarda entrou**, que era o trabalho de verdade: função nova do domínio sem chamador
reprova, a menos que a fronteira seja registrada com o motivo — e registro que ganhou
chamador e ficou na lista também reprova, porque registro que virou mentira é pior que
registro nenhum.

---

## O pacote sai com o dobro do tamanho — medido em 6 de setembro

Compilando o APK aqui (a CI não pode: cota), o arquivo saiu com **48 MB**. Abrindo:

| dentro do APK | tamanho |
|---|---|
| `classes.dex` … `classes5.dex` (cinco arquivos) | **~50 MB descompactados** |
| `lib/arm64-v8a/libreactnative.so` | 7 MB |
| `assets/index.android.bundle` (o JavaScript) | 4 MB |

O bytecode Java/Kotlin domina, e o motivo é uma linha:
`android/app/build.gradle:69` lê `android.enableMinifyInReleaseBuilds` com **`false`** como
padrão, e nada no projeto define a propriedade. Ou seja: **todo APK que este projeto já
publicou saiu sem minificação.**

**E o ganho foi medido, não estimado** — eu tinha escrito "costuma cortar metade", que é
palpite, e aqui se mede:

| | sem R8 | com R8 |
|---|---|---|
| APK | 48 MB | **37 MB** |
| `dex` somados (descompactados) | ~50 MB | **15 MB** |

O R8 corta **70% do bytecode** e só **23% do pacote**, porque o que sobra é biblioteca
nativa e recurso, que ele não toca. A compilação com minificação levou 2m16 e passou — ou
seja, R8 não quebra o BUILD; o que continua sem prova é o tempo de execução.

**Por que não liguei junto:** minificação quebra em tempo de execução, não de compilação —
reflexão, nomes de classe que uma biblioteca resolve por string, `keep` que falta. O jeito
de saber é abrir no aparelho, e eu não tenho aparelho aqui. Ligar às cegas e mandar o APK
seria entregar configuração de release não testada, que é o oposto do que esta casa faz.

**O que isso muda quando for feito:** onze megabytes a menos numa conexão de interior. É
menos do que eu tinha prometido, e é real. Item de véspera de loja, com o número já medido
para ninguém precisar descobri-lo na semana do lançamento.

---

## F3 — o mês que tira o papel do chão de fábrica

O alvo decidido pelo dono. No fim disto, a fábrica para de usar papel para
romaneio, conferência e etiqueta.

**1. Etiqueta e QR do lote — metade entrou em 6 de setembro.** O que faltava era
"quem o leia", e isso eram duas coisas diferentes.

**A que entrou:** o código impresso virou **endereço de verdade**. O QR carrega o
código (`app/lots/[id].tsx:208` imprime `lote.code`) e o `findLot` só conhecia o id —
então bipar a caixa, ou digitar os onze caracteres como a própria etiqueta promete por
escrito, não levava a lugar nenhum. Agora `findLot` aceita os dois (uuid e `AAAAMMDD-NN`
não se confundem), e a aba de produção ganhou onde digitar: o cartão de cima lista os
lotes do DIA, e o comentário dele já dizia a verdade que faltava — *quem procura o lote
de uma caixa procura HORAS depois*. Três dias depois, não havia caminho.

Sem exigir formato: o `lotCode` diz por escrito que `AAAAMMDD-NN` é o padrão e não a
única forma, e a fábrica que já tem código próprio vai poder usá-lo.

**O que falta:** a **câmera** (dependência nativa, e esta sessão não tem como fotografar
uma leitura de câmera para provar), e a **leitura engradado a engradado na doca** — que é
o que a seção `scan` do dicionário descreve (`{{done}} de {{total}}`, "esse engradado já
foi bipado") e que pertence ao mesmo bloco dos itens 4 e 5: ela é a conferência da carga
saindo, e depende da mesma decisão.

**2.** ~~**Lojas e clientes com ficha de acordo.**~~ **JÁ EXISTE — conferido em 6 de
setembro, e o roadmap estava errado.** A linha dizia "falta a tela" e a tela está
inteira: `app/places.tsx:641` edita e **grava** telefone, dias combinados (a grade dos
sete, com o rótulo por extenso embaixo para quem lê de luva) e a observação do acordo.
E o acordo já é USADO em três lugares — `app/orders/new.tsx:154` nasce o pedido na data
combinada, `app/places.tsx:189` mostra a próxima entrega, e `app/(tabs)/index.tsx:272`
monta "quem recebe hoje" na capa. A fila também o carrega (`src/sync/serialize.ts:159`).
~~O que falta desta ficha é **preço combinado**~~ — **FEITO em 6 de setembro**, e ele veio com três peças em vez de uma: o preço de tabela no item, o combinado por lugar, e a história append-only que é a única fonte dele. A tela é esta mesma ficha. O que ficou de fora, por ser P3 e decisão de faseamento do dono, é congelar o preço no movimento — ver "O preço de venda não é um campo que falta", acima.

**3.** ~~**Pedido com reserva.**~~ **FEITA em 6 de setembro.** A metade que existia era
a que não protege: `livreDe` (`app/orders/new.tsx:207`) já recusava PROMETER além de
`onHand − requested`, e `app/transfer.tsx` limitava a CARGA pelo saldo físico da sala —
que não sabe de promessa. A Loja A pedia 500 para sexta, o freezer tinha 600, e a carga
de hoje para a Loja B levava as 600.

A regra entrou como `freeToShip` (`src/domain/picking.ts`), no domínio e com teste, pelo
motivo que este projeto já pagou duas vezes: o `mutate` roda a suíte rápida, e regra
dentro de componente de React não é alcançada por ela. Ela devolve fato — quanto tem
dono, quem espera (o mais cedo primeiro), e quanto faltaria depois desta carga — e a
tela escreve a frase.

Três decisões dentro dela, cada uma um jeito de errar que foi evitado:

- **O pedido do DESTINO não conta.** Mandar para a Loja A é o que a promessa da Loja A
  pede; contá-la faria a tela avisar contra a própria separação, em toda carga legítima.
- **O saldo comparado é o de TODAS as nossas salas**, não o da sala de origem — a mesma
  base do `stockAgainstOrders`, pela régua compartilhada `INTERNAL_PLACE_KINDS`. Uma sala
  só avisaria contra carga que não quebra promessa nenhuma: 500 reservadas que estão na
  câmara fria continuam existindo quando o caminhão carrega no freezer da frente.
- **Tem horizonte: sete dias, o mesmo do palpite.** Pedido para daqui a cinco semanas
  não disputa o caminhão de hoje — a fábrica produz de novo antes disso. Sem o corte, a
  MESMA tela contava dois conjuntos de pedidos: um para sugerir o número e outro para
  avisar sobre ele. Pedido sem dia marcado conta sempre, que é a letra miúda do SQL que
  a tela de pedido já usava.
- **Não bloqueia.** Às vezes a loja está na porta. A frase de fato aparece sempre que
  alguém espera; o aviso, só quando esta carga passa da folga; o botão obedece nos dois
  casos. E a conta é repetida na confirmação, porque o botão fica embaixo do cartão:
  num telefone a frase de cima pode ter saído da tela quando o dedo chega nele, e o
  toque seguinte já é livro-razão.

**4.** ~~**Separação.**~~ **FEITA em 6 de setembro**, destravada pela decisão de que a carga
é um evento só. Com ela, a pergunta que segurava o item — *o que a separação grava?* — tem
resposta: **nada**. Ela conta; quem move estoque continua sendo a carga.

`app/picking.tsx`, com a porta na aba de transporte. O que ela faz:

- **guarda no aparelho, por loja** (`pickingCart`), e isso é o ponto: a conferência é a
  −18 °C, item a item, e o celular bloqueia. Lista que zera no meio é pior que não existir;
- **conta em engradado**, não em picolé — o `UnitStepper` ganhou chamador depois de meses
  construído, e o eco fecha a conta na unidade que o resto do app fala;
- **termina em carga**: uma transferência por item, e o pedido coberto oferece fechar, pela
  mesma regra que a transferência usa (`ordersCoveredToday`, um lugar só).

**E o eco do stepper terminava a conta pela metade.** Ele dizia "1 engradado" quando o
valor era um engradado exato — a mesma informação do número acima —, enquanto o pedido diz
"faltam 600 un". A pessoa precisava saber de cabeça que um engradado são 300, que é
exatamente a conta mental que o componente existe para remover, e que o exemplo escrito no
dicionário já prometia. Agora ele diz `= 1 engradado = 300 unidades`.

**O que continua fora:** a leitura de QR engradado a engradado na doca (a seção `scan`).
Precisa de câmera — módulo nativo sem implementação web —, e esta sessão não tem como
provar câmera.

**5.** ~~**Os quatro postos de controle.**~~ **RESOLVIDO POR DECISÃO, 6 de setembro.**
A carga é **um evento só** — decisão do dono. Carregar e entregar continuam sendo o mesmo
toque na fábrica, e `conferido` continua sendo o único posto que grava, como já grava hoje
(`recordCheck`, com tela, linha no razão e migração 0017). Não há quatro postos a
construir: há um que existe e três que são rótulo até haver viagem com linha do tempo.
A seção `posts` do dicionário segue registrada como fronteira, agora com prazo indefinido
e motivo novo.

**6. O app do entregador — e ele NÃO é sobre entrega.** *"Depois já desenvolve o app
(seria o login e perfil) do entregador pq isso é necessário para algum outro usuário q vai
comprar o aplicativo."* Decisão do dono, 6 de setembro. Com a carga atômica, o entregador
não tem o que gravar que a fábrica já não grave — então o que este item pede é a **camada
de gente e permissão**, não a tela de entrega:

1. ~~**Gente e perfil no aparelho.**~~ **FEITO em 6 de setembro.** `people` e `profiles`
   entraram nos dois lados (aparelho `V20`, servidor `0035`), a porta "Pessoas" abriu na
   aba Mais, e os sete papéis chegam como MODELOS com nome vazio — a palavra é da tela, em
   três idiomas. A décima quinta garantia do `db:verify` cobra as duas metades contra
   Postgres: pessoa existe **sem conta**, e `operator_id` **só aceita gente** (um id de
   membership passa a ser recusado, que era o único que passava antes).
2. **Perfil é dado.** Os sete papéis de `src/domain/access.ts` viram modelos prontos, e o
   dono marca permissão por permissão. Decisão já registrada no `CLAUDE.md`.
3. **A entrada.** Grade de nomes com PIN no aparelho compartilhado; pessoal entra uma vez e
   fica. Os dois caminhos, escolha da empresa — decisão de 1 de setembro.
4. **O operador no movimento.** `operator_id` passa a ter escritor, e a tela só pergunta
   quando a empresa liga `names_who_recorded`.

**O nó de esquema, e ele se desfaz de graça hoje:** a `0014` aponta `operator_id` para
`memberships(id)`, e `memberships.user_id` é `not null references auth.users` — cada pessoa
nomeável precisaria de uma CONTA. Isso contraria a decisão escrita de que *"o login
autentica o sistema, não a pessoa"*. Como **nada escreve a coluna** e não há um movimento
gravado em servidor nenhum, a correção custa uma migração nova: gente vira tabela própria,
sem conta, e `membership` volta a ser só o que sempre foi.

**7.** ~~**Devolução.**~~ **FEITA em 6 de setembro.** O movimento já tinha tipo próprio
e tela; o que faltava era o **motivo**, e ele entrou inteiro: `ReturnReason` no domínio
(não vendeu · derreteu no caminho · passou da validade · veio errado), `return_reason` no
aparelho (`V19`) e no servidor (`0034`), obrigatório na devolução **e proibido fora
dela** — a segunda metade é a que costuma faltar, e sem ela uma transferência entre salas
nossas carregaria motivo de devolução, fazendo o Espelho da Loja contar devolução que não
houve. A tela pergunta ao lado da loja, sem opção marcada por padrão (é a única resposta
que o sistema não pode deduzir), e o botão não obedece enquanto ela não for respondida.
A catorzena garantia do `db:verify` cobra as duas metades contra Postgres.

**8. O `UnitStepper`.** Componente construído e sem chamador, decisão registrada no
`CLAUDE.md` — é peça da F2/F3 e apontá-lo como defeito já custou uma rodada. Entra
quando a tela de separação existir: é ali que se conta caixa com luva.

**O risco nomeado, e ele não se resolve escrevendo código:** a F3 tem ergonomia que
não se verifica sem aparelho na mão. Tela capacitiva a −18 °C, luva, QR a um braço
de distância. Isso pede rodadas **depois** de alguém usar, e elas só cabem no mês se
o teste acontecer junto, não no fim.

---

## As seis que o dono aprovou — 6 de setembro

Nasceram de uma pergunta dele: *"eu queria saber o q vc tem de ideias que podemos
implementar aqui para elevar o nível do app"*. Ele aprovou as seis e destacou duas —
o extrato (*"essa última sobre a questão fiscal achei excelente, podendo até
extrapolar um pouco"*) e o modo conversa com áudio, com um argumento que o roadmap
já tinha sem enxergar a saída.

Estão aqui e não numa fase porque **atravessam as fases**: nenhuma delas é uma tela
nova, todas são uma propriedade que o produto passa a ter.

---

### 1. O `[por quê?]` em qualquer número

A Lei 6 manda toda conclusão abrir a conta, e hoje **algumas** abrem. A ideia é que
qualquer número responda a um toque longo com a aritmética que o produziu: os
movimentos somados, as datas, a conta por extenso.

O que sustenta: o livro-razão append-only guarda tudo, e `src/law.test.ts` já mantém
a lista de qual comparação cada tela mostra. O que falta é o mecanismo compartilhado
— hoje cada tela abre a sua conta à mão.

**Por que eleva:** é o que faz um dono parar de conferir por fora no caderno. Não é
uma funcionalidade, é a diferença entre um sistema que pede confiança e um que a
prova.

### 2. ~~A conferência cega~~ — JÁ EXISTE na contagem, e o que sobra é a DOCA

**Achado em 7 de setembro seguindo o caminho no emulador, e é correção de registro:**
a conferência cega **está construída** em `app/inputs/[id].tsx:699`, com o raciocínio
escrito ao lado — *"o número desaparece enquanto a contagem está aberta: com ele na
tela a conferência vira cópia, e uma cópia não se distingue de uma contagem"*. Este
item pedia o que já havia. Registro que virou mentira é pior que registro nenhum,
porque manda alguém reconstruir o que existe.

**O que sobra é outro caso, e ele NÃO é o mesmo.** Ao conferir a chegada de uma carga,
a tela de transporte mostra *"4 caixas picolé de morango"* e oferece um toque em
*"Conferir chegada"*. Aí o esperado está na tela, e quem está cansado confirma sem
contar.

**E isso é escolha deliberada, com razão escrita** em `app/(tabs)/transport.tsx:100`:
*"o padrão é 'chegou tudo', porque é o que acontece na maioria das vezes e porque um
formulário de contagem por item, no celular, na doca, ninguém preenche. Quem achou
diferença corrige na tela do lugar, que já sabe registrar contagem cega."*

**Os dois lados estão certos sobre coisas diferentes** — ergonomia da doca contra
qualidade do dado — e por isso a decisão **não é minha**. Ela cai no portão P2 com a
frase saindo inteira: *eu mudaria isto se eu visse alguém conferindo uma carga na doca,
com luva, com o caminhão esperando.* Uma síntese possível existe e cabe em um campo —
perguntar **quantas caixas chegaram**, sem mostrar o número, e só então dizer a
diferença — mas trocar um padrão que alguém escolheu por observação é decisão de quem
observou.

Foi para a espera, com o que a tira de lá.

### 3. O aviso na data da decisão, para tudo

A Lei 4 manda avisar na data da decisão e não na do problema. Isso ficou pronto para
**compras** em 6 de setembro (o ponto de recompra em `app/inputs/[id].tsx`, com a
folga como configuração da empresa). A mesma forma serve para três coisas que o app
já sabe: o lote que vence (mande para a loja que gira mais rápido — o Espelho da
Loja sabe qual é), a produção (*"produza até segunda para não faltar"*) e o dinheiro
parado.

**Por que eleva:** um app que avisa no dia em que dá para agir é outro produto que
um que avisa no dia do problema.

### 4. O modo conversa — e o áudio, que é o que o dono viu

**"Hey, Norva" — pedido do dono em 7 de setembro**, e ele acertou o motivo antes da
ideia: *"tipo qdo a gente aciona o assistente do google"*. O caso é o que ele mesmo
já tinha dado — *"o padeiro com a mão suja"* — e um botão que precisa ser tocado com
luva **anula o mãos-livres**. A palavra de acionamento não é enfeite: é o que separa
o modo voz de "um jeito diferente de digitar".

**O que joga a favor:** motor de palavra-chave roda **no aparelho e offline**
(Porcupine, openWakeWord), o que combina com a câmara fria; e *"Norva"* é um bom
nome justamente por ser inventado — palavra que não aparece em conversa normal é o
que segura o falso positivo. Com o "Hey" na frente são três sílabas, o mínimo que
funciona.

**O que custa:** um modelo treinado para a frase (pequeno, mas é dependência — pago
no Porcupine para uso comercial, livre no openWakeWord), e bateria, que só pesa em
aparelho fora da tomada.

**E a consequência de desenho, que a ideia CRIA e vale mais que o custo:** este
projeto grava **quem estava com o aparelho**, e um celular que escuta sem ser tocado
quebra essa corrente — quem falou não é necessariamente quem destravou. Num aparelho
compartilhado, **um comando de voz precisa dizer de quem ele é**, ou o movimento é
atribuído à pessoa errada. Some isso ao fato de a escuta contínua ouvir todo mundo o
tempo todo, e a conclusão é a F7: **ligar a palavra de acionamento é configuração da
empresa**, como a entrada por PIN.

**A ordem, e ela não é negociável pela natureza da coisa:** o aplicativo ouvir e
entender vem primeiro, responder por voz vem depois, e acordar sem ser tocado vem por
último. Palavra de acionamento sem assistente que escute é campainha de casa vazia.


`memberships.prefers_conversation` existe desde a fundação (`0001_foundation.sql`)
**sem tela nenhuma**. A ideia é escrever — ou falar — *"chegaram 20 caixas de
morango"* em vez de navegar por quatro telas.

O dono acrescentou o argumento que decide: *"imagina o padeiro com a mão suja…
até para quem eh cego"*. E o roadmap já listava a ergonomia da câmara fria como
risco não resolvido — tela capacitiva a −18°C, luva. **Voz não é atalho ali: é a
única entrada que funciona com a mão ocupada, suja ou dentro de uma luva.**

Três medidas que mudam o desenho:

- **O vocabulário é fechado e minúsculo.** O app já sabe os insumos, produtos,
  unidades, lugares e clientes daquela empresa. Reconhecer trinta palavras e números
  é outro problema que ditado livre — é o que torna modelo pequeno no aparelho
  viável offline, que é o que o dono quer.
- **A rede contra alucinação já é regra da casa.** A confirmação diz o que vai
  acontecer com os números por extenso. Então: voz → interpretação → **o app repete
  o que entendeu** → confirma. Áudio é palpite; a leitura de volta é o que impede
  palpite de virar movimento.
- **As duas metades têm preços muito diferentes.** A voz de SAÍDA é módulo de
  primeira linha da Expo, offline, sem modelo embarcado — barata, e sozinha já
  resolve conferir sem olhar. A de ENTRADA precisa do reconhecedor nativo ou de um
  modelo tipo whisper; nenhum dos dois está no projeto.

**E as três coisas que o dono acrescentou em 6 de setembro, que mudam o desenho:**

- **A confirmação é REDUNDANTE entre sentidos, e o motivo é a fábrica.** Ele pediu
  *"uma piscada… cor de confirmação e cor de erro… ou até um aviso sonoro"*. Cada
  canal falha num ambiente diferente: o galpão barulhento mata o som, a luva mata a
  precisão do toque, e quem está com a mão na massa não olha a tela. Então a
  confirmação não escolhe um canal — acende **cor, vibração e voz ao mesmo tempo**, e
  quem estiver disponível entrega a mensagem. É a forma da F7 aplicada a feedback:
  não se escolhe pelo usuário, os caminhos coexistem.

  E a vibração **já está paga**: `expo-haptics` está no `package.json`. Padrão
  diferente para "gravei" e para "não entendi" sai hoje, sem dependência nova, e é o
  canal que funciona de luva grossa e no escuro.

- **Microfone Bluetooth, e não só a tecla de volume.** Ideia dele, e ela é melhor do
  que conforto: a −18°C a bateria despenca, então com fone **o telefone fica no bolso
  quente ou no carregador** e a pessoa usa só o microfone. O botão do fone é tecla de
  mídia — o mesmo mecanismo de captura da tecla de volume, uma implementação para as
  duas. *A ressalva honesta:* capturar a tecla de volume vale com o app em primeiro
  plano, que é o caso real; com a tela apagada o Android restringe, e aí quem resolve
  é o fone.

- **Não reconheceu: pergunta de novo, com sugestão.** Aqui o vocabulário fechado paga
  outra vez. Genérico seria "não entendi"; com a lista da empresa na mão é *"não achei
  'morango' — você quis dizer Polpa de morango ou Picolé de morango?"*. É a Lei 5
  aplicada à voz: **erro se impede, não se reclama.**

- **E voz nunca é o único caminho** — confirmado por ele: *"com ctz"*. Galpão
  barulhento, pessoa muda, modelo que erra. A entrada por toque continua existindo
  para tudo; voz é outra porta da frente, não a substituição da que existe.

E sobre cegueira, medido antes de prometer: **o trabalho é auditoria, não
construção.** Quem fala é o leitor de tela do sistema, e o app já tem 51 rótulos e
78 papéis de acessibilidade — com `src/acessivel.test.ts` trancando isso desde 6 de
setembro. O que ninguém nunca fez foi **ouvir** o app com o TalkBack ligado.

### 5. A etiqueta que vira canal

O QR da caixa hoje abre o lote dentro do app. Se abrisse uma página que a **loja** lê
sem instalar nada — o que chegou, quando, validade —, a etiqueta deixa de ser
controle interno e vira o começo do pedido seguinte.

### 6. O extrato — a PRIMEIRA CAMADA FEITA em 6 de setembro; o resto continua de pé

**A tela existe** (`app/extrato.tsx`, `ledgerExtract` em `src/data/repository.ts`),
por ATO e não por linha, com o valor pela taxa congelada e o `[Desfazer]` ao lado de
qualquer um. Ela nasceu resolvendo um defeito que não era de apresentação: o caminho
de volta existia em **duas** das nove telas que escrevem no razão, e fundação que não
se alcança é fundação que faz a pessoa parar de registrar.

Exercitada no aparelho até o fim — a corrida de sete pernas aparece como um ato, o
desfazer devolve os insumos e marca o ato, e a correção entra como ato próprio
dizendo o que corrige.

**O que dos cinco marcadores abaixo já está de pé:** a exportação fiscal tem a
consulta e o corte por período (`from`/`to`, com o fim exclusivo e teste nas duas
pontas). **O que continua de pé:** o retrato de fechamento guardado, o inventário
assinado, o extrato do cliente, e a regra de fundamentação da IA. Os quatro pedem
coisas que o razão já tem — nenhum pede esquema novo.

O que o livro-razão append-only torna possível e quase nenhum sistema de fábrica
pequena consegue: **prova, não relatório**. Todo número aqui é derivado de
movimentos que ninguém pode editar, cada um com quem gravou, de qual aparelho e
quando aconteceu no mundo.

- **O extrato é a exportação fiscal antes de existir nota fiscal.** O contador quer
  estoque no fechamento e custo do que saiu; os dois são derivados do razão. Nada
  disso depende de SEFAZ, certificado A1 ou do microserviço .NET que está fora do
  escopo — é a parte fiscal entregável agora.
- **O fechamento de período**, e é aqui que a fundação paga: congelar um retrato e
  guardá-lo, para o número que o contador viu em março continuar recuperável em
  outubro. Como correção aqui é **estorno** e não edição, o histórico continua
  honesto *e* o fechamento continua estável. Num sistema que deixa editar, essas
  duas coisas brigam.
- **O inventário assinado.** A contagem cega, fechada, vira o documento que o fisco
  pede uma vez por ano e que quase toda fábrica pequena inventa em dezembro.
- **O extrato do cliente**, que é a mesma peça virada para fora: tudo o que a loja
  recebeu e devolveu num período. Resolve disputa e é a semente do contas a receber.
- **E é isto que torna a IA segura.** O dono colocou a exigência quando falou do LLM:
  um jeito de impedir alucinação. O extrato **é** esse jeito, e vira regra de
  arquitetura em vez de ajuste de prompt: **a IA não lê o banco, ela lê o extrato.**
  Um assistente que só responde a partir de fato derivado e que abre a conta junto
  não consegue inventar saldo — sem os movimentos, ele não tem resposta.

### Duas que eu acrescentei, e o dono mandou falar

**A régua que a fábrica ensina.** A folga de compra é configuração com padrão dois.
O passo seguinte é o app observar e **propor**: *"nos últimos três meses você sempre
comprou com quatro dias de sobra — quer mudar de 2 para 4?"*. Estende a F7 num
sentido novo: a configuração deixa de esperar calibração nossa e aprende com a
fábrica, sem nunca decidir calada.

**A caixa-preta do aparelho.** Cada escrita já grava aparelho, operador e hora. Uma
linha do tempo por aparelho permite diagnosticar remoto sem perguntar nada a quem
está de luva na câmara — e é quase de graça, porque o dado já está lá.

---

## F4 — a fábrica que se explica sozinha

**Trava por CALIBRAÇÃO, não por construção — corrigido em 6 de setembro.**

Eu tinha escrito "trava por dado", e o dono cobrou a frase: *"vc nao pode alimentar
mais dados no banco de dados??????"*. Ele está certo, e a confusão era minha: eu tinha
misturado três coisas que travam por motivos diferentes.

| | trava? | por quê |
|---|---|---|
| **Fiscal (NF-e)** | **sim** | certificado A1 e homologação na SEFAZ. Externo, e não encurta com dado nenhum. |
| **Espelho da Loja** | **não** | o relatório se constrói e se exercita hoje. |
| **Compras inteligentes** | **não, e o motivo mudou em 6 de setembro** | esta linha dizia *"o prazo observado a simulação gera"*, e é falso: `purchases.ordered_at` existe desde a fundação, `recordPurchase` o grava e a travessia o leva — mas **ninguém escreve nele**, nem a tela de compra nem a simulação. O que trava não é mês de nota, é a **pergunta na tela**: quando você pediu. É a pergunta rara que a Lei 1 permite, porque a data de um telefonema para o fornecedor não está no razão. |

O que é verdade dos dois últimos não é "não dá para construir", é **não dá para
calibrar**: qualquer padrão que o relatório descubra num banco semeado é um padrão que
a semeadura plantou, e a régua — *isto é perda demais*, *compre agora* — só se afere
contra uma fábrica. Então eles entram como **construir agora, calibrar depois**, com a
régua marcada no código como suposição até alguém usá-la.

E semear mais **compra coisa real**: consulta exercitada com o razão crescido,
desempenho medido em vez de estimado, telas com o que dizer. Hoje são noventa dias
(`HORIZONTE_DE_TESTE`); um ano é trocar uma constante.

**O Espelho da Loja — a captura já grava, e o relatório passou a ser dos de agora.**
Contagem cega e perdas com motivo já existem. O parágrafo que estava aqui dizia que o
relatório *"fica fora por decisão escrita: ele mente com duas semanas de dado"* — e ele
contradizia a tabela logo acima, revista em 6 de setembro depois de o dono cobrar a
frase. A correção separou duas coisas que eu tinha misturado: **não dá para calibrar**
não é **não dá para construir**. Então o relatório entra, com a régua marcada no código
como suposição até alguém usá-la contra uma fábrica.
*(O `CLAUDE.md` ainda traz o corte de 1 de setembro com a razão antiga. Fica anotado
aqui em vez de eu reescrever sozinho a lista de cortes do dono.)*

*Anotado em 5 de setembro, para não virar acusação depois:* `sale` está em
`MovementKind` (`src/domain/ledger.ts:24`) e **não tem caminho de escrita** — é o
único tipo do razão nessa situação. Pelo portão P1 isso seria dívida; aqui é o
contrário, e por uma razão escrita no próprio arquivo: o vocabulário de um razão só
é livre para mudar enquanto não há linha nenhuma gravada com ele, então ele nasce
inteiro e os escritores chegam por fase. A semeadura de três meses **não** inventou
um `recordSale` por causa disso: ela usa a contagem cega, que é o que a fábrica de
verdade sabe hoje sobre a prateleira do cliente.

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
| ~~**Relatório do Espelho da Loja**~~ **— voltou, e a razão escrita estava confusa** | o corte dizia *"mente com duas semanas de dado"*, e isso misturava **não dá para calibrar** com **não dá para construir**. O dono cobrou a frase (*"vc nao pode alimentar mais dados no banco de dados??????"*) e a tabela da F4 foi corrigida em 6 de setembro; o relatório entrou junto, **sem régua de "devolve demais" em lugar nenhum** — essa parte continua precisando de fábrica. |
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
