# Auditoria do NORVA — 4 de setembro de 2026

Dez frentes, trinta achados. Escrito para o dono ler, não para um engenheiro.

---

## O veredito, em três frases

**Uma fábrica pode começar a usar isto amanhã, com uma condição: uma fábrica só, e
com o estoque num lugar só.** O que quebra primeiro não é o cálculo — a aritmética
do dinheiro e do livro-razão está sólida e foi provada — é a **câmara fria**, que a
Fase 2 entregou como lugar e que metade do aplicativo ainda não enxerga: o alerta de
validade emudece, a produção fica impossível com um erro em inglês, e a contagem da
prateleira compara com a empresa inteira. **E duas coisas precisam de conserto antes
de qualquer cliente real: o livro-razão aceita item de outra empresa, e três dos sete
tipos de lançamento não podem ser corrigidos por estorno.**

---

## O que está sólido

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

## O que precisa de conserto antes de uso real

### Já consertado nesta rodada

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

### Consertado depois que isto foi escrito

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

### Aberto, e é o que decide se um cliente entra

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

## O que é risco, e não defeito

- **A câmara fria como lugar é decisão escrita** e está certa. O que falta é as
  telas a enxergarem — o item 4 acima é dívida da entrega, não erro de desenho.
- **Seis das oito perguntas de prontidão de loja** já estão registradas como
  fronteira no plano, com o que as destrava. Não são surpresa.
- **Dois mutantes são equivalentes**: o estorno tem duas checagens em camadas, e
  nenhum teste de uma linha de execução as distingue. Ficam marcados.

---

## O que esta auditoria NÃO conseguiu olhar

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
