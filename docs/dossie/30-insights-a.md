## 30. Registro de aprendizados — parte A

Catálogo da primeira metade de `docs/insights.md` — linhas 1 a 1805, que vão do
primeiro achado registrado (1 de setembro de 2026) até o achado de método sobre
design da madrugada de 2 de setembro. O item seguinte do arquivo começa em
`docs/insights.md:1806` e pertence à parte B.

A regra de admissão do próprio registro, transcrita: *"achado sem consequência não
entra aqui. Cada linha existe porque um arquivo foi editado. E 'não achei nada' é
entrada válida — não se inventa achado para parecer diligente, pelo mesmo motivo
que não se inventa alerta."* (`docs/insights.md:5-8`)

Duas convenções de leitura deste catálogo:

- Cada item traz **o que se viu**, **por que importa** e **o que mudou**, na ordem
  em que o registro os apresenta. Quando o registro não traz um dos três, está
  escrito "NÃO ESTÁ NO REGISTRO".
- O estado de cada peça (implementada e chamada por tela · implementada sem
  chamador · planejada) é o estado **no momento do achado**. Vários itens da
  primeira metade existem justamente para consertar peças sem chamador; quando o
  próprio registro diz que o chamador chegou, está marcado.

---

### 30.1 Livro-razão, saldo e locais

#### A1 — 1/9: o livro-razão existia em todo lugar menos onde os dados moram (`docs/insights.md:12-31`)

**O que se viu.** A fundação nº 1 diz que não existe campo `estoque_atual` e que
saldo é a soma dos movimentos. O banco do aparelho tinha **onze tabelas e nenhuma
delas era `movements`**. O estoque morava em `item_costs.on_hand_base_units`, um
inteiro alterado por `UPDATE` a cada compra — "exatamente a coluna que a fundação
proíbe, com um nome mais comprido" (`docs/insights.md:14-18`).

**Por que passou despercebido.** A aritmética estava certa, as telas mostravam
números plausíveis, todos os testes passavam. O defeito só aparecia perguntando
**de onde o número vem**. `src/domain/ledger.ts` estava construído, testado e
importado por **um arquivo só**: `app/foundation.tsx`, a tela de vitrine — "a
fundação tinha virado demonstração" (`docs/insights.md:20-24`). Estado na época:
**implementado sem chamador de produção**.

**O que mudou.** Migração **V3** do aparelho: tabela `movements`, saldo derivado
da soma, a coluna mutável apagada, e um backfill que transforma cada linha de nota
no movimento que ela sempre foi — **mantendo o id da linha**, para que repetir a
migração não dobre saldo nenhum. Quatro testes novos, incluindo um que sobe um
banco na versão anterior de propósito e prova que um celular que já tem notas
atravessa a atualização com o mesmo saldo (`docs/insights.md:26-31`).

#### A2 — 1/9: o estoque só sabia subir (`docs/insights.md:35-48`)

**O que se viu.** Aquela coluna era escrita por **um caminho só**: a compra. Nada
consumia, nada ajustava, nada conferia. O "quanto eu tenho" estava certo
exatamente uma vez, na manhã em que o saco chegou (`docs/insights.md:37-39`).

**Por que importa.** *"Número de almoxarifado que só cresce é pior do que nenhum,
porque as pessoas acreditam nele."* (`docs/insights.md:41-42`)

**O que mudou.** `recordCount()`, a contagem física, que **não sobrescreve saldo**
— grava a diferença como movimento próprio, "de modo que a prateleira e o livro
passam a concordar sem que a discordância suma do registro". E **uma contagem que
bate é gravada também, com diferença zero**: uma prateleira que ninguém olha há
meses não pode ficar igual a uma conferida hoje de manhã (`docs/insights.md:44-48`).

#### A3 — 1/9: a contagem estava sendo pedida com a resposta na tela (`docs/insights.md:52-60`)

**O que se viu.** A tela do insumo mostrava `"Em estoque: 50.000 g"` logo acima de
onde o campo de contagem ia entrar. A regra da contagem cega já estava resolvida
no plano para o Espelho da Loja: com o número esperado à vista, a pessoa confirma
a tela em vez da prateleira (`docs/insights.md:54-57`).

**O que mudou.** Abrir a contagem **esconde o saldo e diz por quê**. E a checagem
de navegador **afirma a ausência do número**, não só a presença do campo
(`docs/insights.md:59-60`).

#### A4 — 1/9: o guarda achou a mesma violação do outro lado, na primeira execução (`docs/insights.md:142-172`)

**O que se viu.** Um relatório de `/insights` apontou que a violação do livro-razão
tinha sido consertada uma vez e nada impedia seu retorno — "um total guardado é
sempre a opção mais barata **no instante** em que alguém a escreve — uma coluna,
um `UPDATE`, nenhum `JOIN`" (`docs/insights.md:144-149`). Foi escrito o guarda: um
teste que varre o esquema do aparelho **e** um comando no `db:verify` que varre o
do servidor, procurando nome de coluna que signifique "quantidade que alguém
mantém atualizada" (`docs/insights.md:151-153`).

**E ele mordeu na primeira execução.** O servidor tinha a coluna idêntica —
`item_costs.on_hand_base_units` — mantida por gatilho **só a partir das notas**,
contando chegadas e mais nada. Bastaria uma contagem, uma perda ou uma produção
para a coluna e o livro-razão responderem "quanto tem" com números diferentes, e o
custo médio ser calculado contra o errado (`docs/insights.md:154-160`).

**O que mudou.** Migração **0009**: o gatilho pergunta aos movimentos e a coluna
some. O que torna isso seguro é uma decisão já tomada no aparelho — a linha da nota
e o movimento dela **dividem um id**, porque são um fato visto duas vezes. O
gatilho **exclui o próprio movimento da soma por id**, então acerta se o movimento
chegou antes da linha, depois dela, ou ainda não chegou: sem ordem para depender, e
uma reentrega não dobra nada (`docs/insights.md:162-167`). Lição registrada:
*"Achado não vira garantia enquanto não vira teste."* (`docs/insights.md:169-172`)

#### A5 — 1/9: a contagem somava a empresa e escrevia num lugar só (`docs/insights.md:1158-1179`)

**O que se viu.** `recordCount` calculava o esperado com
`WHERE company_id = ? AND item_id = ?` — a **empresa inteira** — e gravava a
diferença **num local**. Correto enquanto existe um lugar só; "vira teletransporte
de estoque no dia em que existir o segundo": contar a prateleira da Loja Centro
compararia com o saldo da fábrica mais o da câmara mais o da loja, e escreveria a
diferença de tudo isso dentro da loja (`docs/insights.md:1159-1164`).

**O que mudou, e por que sem padrão.** `locationId` passou a ser **exigido**. "Um
padrão seria pior que o bug: contar a câmara sem dizer qual escreveria no
almoxarifado, calado." O chamador diz onde, ou não compila; o compilador achou os
**cinco chamadores** (`docs/insights.md:1166-1171`). Teste com dois lugares de
verdade, visto falhando sem o filtro, e mutação nova (**27**) com o dano escrito:
*"contar a prateleira de um lugar compara com o saldo da empresa inteira"*
(`docs/insights.md:1173-1174`).

**O que NÃO mudou, deliberadamente.** A média móvel **continua somando a empresa
inteira**: custo não é por lugar — "o mesmo grama de açúcar não custa uma coisa na
câmara e outra no almoxarifado". Generalizar as três consultas do mesmo jeito
teria quebrado o custo para consertar a contagem (`docs/insights.md:1176-1179`).

#### A6 — 1/9: a sabotagem equivalente não prova nada (`docs/insights.md:1180-1196`)

**O que se viu.** Ao provar que o teste de `balanceByLocation` morde, a sabotagem
usada foi trocar `GROUP BY m.location_id` por `GROUP BY l.name, l.kind`. **Passou**
— e por um motivo correto: no teste cada lugar tem nome distinto, então as duas
formas dão o mesmo número (`docs/insights.md:1181-1184`).

**Por que importa.** É a versão sutil do teste que passa pelo motivo errado; no
mesmo dia isso ocorreu três vezes na mesma família (mutação sobrevivente porque o
exemplo de ambiguidade caía em nulo por outro caminho; guarda que pareceu não
morder porque o `grep` procurava a palavra errada) (`docs/insights.md:1186-1190`).

**O que mudou.** A sabotagem certa é a que **muda a resposta**: fazer cada lugar
reportar o total da empresa em vez do seu próprio. Aí o teste cai com a mensagem
certa — *"the six kilos are in the cold room"*. O teste ficou como estava; quem
estava errado era a prova dele. Regra: **a sabotagem precisa alterar o resultado,
não só o texto** (`docs/insights.md:1192-1196`).

#### A7 — 1/9: a produção existe, e ela é sete linhas (`docs/insights.md:1198-1223`)

**O que mudou.** `recordProduction` escreve **um movimento de `production` e um de
`consumption` por insumo**, todos com o mesmo `movement_group_id`. Sete linhas para
uma corrida com seis insumos, e não uma: `movements` tem **um** `item_id` e uma
quantidade assinada, e o saldo é `sum(...) group by empresa, item, local`. Sete
itens numa linha só exigiriam um leitor que abre payload, e o saldo deixaria de ser
uma soma (`docs/insights.md:1199-1204`).

**A decisão que mais importa.** O custo do produto congela como
**`Σ(consumo) ÷ unidades que saíram de verdade`** — **não** pelo rendimento da
ficha técnica. "Se o tacho prometia 500 e rendeu 400, o picolé custou 25% mais, e é
isso que fica gravado." Congelar o teórico esconderia a perda no instante em que
ela aconteceu. Teste com as duas corridas lado a lado, e **a razão dos custos tem
de ser 500/400** (`docs/insights.md:1206-1211`).

**E nada é escrito em `item_costs`:** valor derivado tem um autor só, e "consumo à
taxa média não move a média", então valor do razão dividido por quantidade do razão
continua sendo ela (`docs/insights.md:1213-1215`).

**Primeiro chamador de `explodeRequirements`.** A função existia, era testada e
nunca tinha sido chamada por linha de produção nenhuma — estava na lista dos doze
exports órfãos. "A P1 do portão novo diz 'sem chamador, não entra'; este é o commit
em que ela ganha um." (`docs/insights.md:1217-1220`) Duas mutações novas: congelar
pelo prometido, e o consumo entrando com sinal trocado — que faria o almoxarifado
**encher sozinho** a cada tacho (`docs/insights.md:1222-1223`).

#### A8 — 1/9: a transferência é duas linhas, e o motivo é aritmético (`docs/insights.md:1225-1247`)

**O que mudou.** `recordTransfer` escreve **saída negativa na origem e entrada
positiva no destino**, as duas com o mesmo grupo e cada uma apontando para o outro
lado em `counterpart_location_id` (`docs/insights.md:1226-1229`).

**Por que duas e não uma.** O saldo agrupa por `location_id`. Com uma linha só, o
destino **não existiria em consulta nenhuma**: fechar exigiria um `UNION` trocando
`location_id` por `counterpart_location_id` e invertendo o sinal, em cada um dos
lugares que somam — "precisamente o caso especial que a fundação existe para não
ter" (`docs/insights.md:1231-1235`). A contraparte fica como **explicação, nunca
como aritmética**: ela responde "para onde foi", e quem responde "quanto tem" é a
soma, sozinha. Sabotado para uma perna só, o teste cai — "a carga sai da fábrica e
evapora no caminho" (`docs/insights.md:1236-1238`).

**As duas recusas.** Transferir para o mesmo lugar, ou transferir nada, "seriam
linhas apendadas num livro que não se edita depois, descrevendo coisa nenhuma".
Recusadas na entrada — o erro se impede, não se reclama (`docs/insights.md:1240-1243`).

**Loja própria é transferência, não venda:** não há faturamento nem margem, o valor
apenas muda de sala (`docs/insights.md:1245-1247`).

#### A9 — 2/9: pedido não é movimento, e a fundação decide isso sozinha (`docs/insights.md:1609-1624`)

**O que se viu.** A demanda cabia em `movements`: item, quantidade, lugar e data já
existem lá (`docs/insights.md:1610-1611`).

**Por que não.** Duas fundações respondem antes da conveniência: (1) saldo é a soma
dos movimentos — um pedido não move nada, as caixas continuam no freezer, e gravar
demanda como movimento faz **o saldo mentir no dia da ligação**; (2) o livro-razão
é append-only, e um pedido muda o tempo todo (o cliente corrige a quantidade, adia,
cancela) — corrigir por estorno "seria escrever no livro que trezentos picolés
saíram e voltaram, quando nenhum saiu" (`docs/insights.md:1613-1620`).

**O que isso ensina para a Fase 3 inteira.** **Compromisso e fato são tabelas
diferentes**, e o elo entre eles é um evento só — a carga que sai, que já é a
transferência de `0001`. Reserva, separação e devolução caem no mesmo desenho
(`docs/insights.md:1622-1624`).

---

### 30.2 Dinheiro: `Cents`, `Rate` e o ponto de arredondamento

#### A10 — 1/9: a regra da capa não estava presa em lugar nenhum (`docs/insights.md:323-363`)

**O que se viu.** Auditoria por mutação no domínio do dinheiro: seis defeitos,
cinco pegos na hora, e **um passou por noventa e dois testes** —
`amountOf` trocando `Math.round` por `Math.floor`, isto é, *o* ponto de
arredondamento do sistema inteiro (`docs/insights.md:325-332`). Passou porque
**todo fixture caía em centavo exato**, então piso e arredondamento davam o mesmo
número: "a regra da capa do projeto estava sustentada por coincidência aritmética"
(`docs/insights.md:334-336`).

**Por que a direção importa.** "Piso derruba uma fração de centavo em toda linha,
sempre para o mesmo lado, e o erro se acumula numa direção só ao longo de uma
receita: custo sai baixo, margem sai alta, e alguém precifica abaixo do custo sem
que um único número pareça errado." (`docs/insights.md:338-341`)

**O que mudou.** `src/domain/money.test.ts`, prendendo a direção **nos dois
sentidos** (piso e teto derrubam a suíte), com o caso que faltava: **meio centavo**.
Mais o que nunca some nem inventa centavo na repartição, e que taxa continua
fracionária (`docs/insights.md:343-346`).

**Segunda rodada, no resto do domínio: mais dois passaram.** O ponto de pedido
arredondando para baixo — "que pede menos do que o consumo, e é a única direção em
que ele nunca pode errar" — e, pior, **sub-receita ausente virando custo zero em
silêncio**: `MissingRecipeError` existia e nada provava que ela disparava; "um
semi-acabado que sumisse deixaria todos os sabores em cima dele mais baratos, sem
um número parecer errado" (`docs/insights.md:348-353`).

**O que mudou de vez.** A auditoria virou portão: `npm run mutate`, na barra e no
CI, com **treze defeitos curados** — cada um uma frase sobre o que quebraria na
fábrica. Lista curada e não aleatória de propósito: "mutação cega gasta o tempo em
mudanças que ninguém faria" (`docs/insights.md:355-358`). Lição: *"Suíte verde não
diz que a regra está protegida; diz que os exemplos escolhidos não a exercitam."*
(`docs/insights.md:360-363`)

#### A11 — 1/9: o custo do tacho arredondava cada linha antes de somar (`docs/insights.md:267-274`)

**O que se viu.** Dentro do lote de seis defeitos apontados pela revisão do Codex
(item A19), este é o da fundação do dinheiro: o custo do tacho **arredondava cada
linha** antes de somar. "Dez ingredientes de quatro décimos de centavo somavam zero
num tacho que custa quatro." É o mesmo defeito do bug da polpa
(`docs/insights.md:267-270`).

**O que mudou.** As linhas acumulam **fracionário**, o tacho arredonda **uma vez**,
e a **repartição por maior resto** faz o detalhamento somar exatamente o número que
ele explica — "um `[por quê?]` que não bate com a conta acima dele é pior que
nenhum" (`docs/insights.md:271-274`).

#### A12 — 1/9: o tipo que define um movimento descrevia um esquema morto (`docs/insights.md:1076-1109`)

**O que se viu.** `src/domain/ledger.ts` ainda declarava **`unitCostCents?: Cents`**
enquanto a migração `0008` derrubou `unit_cost_cents` no servidor e pôs
**`unit_cost_rate double precision`**, e o aparelho seguiu com
**`unit_cost_rate REAL`** (`docs/insights.md:1078-1081`).

**Por que importa.** É a fundação da capa invertida no tipo que define o que um
movimento **é**: polpa a R$ 12,40/kg é **1,24 centavo por grama** — como inteiro
vira 1, e um quinto do custo some antes da primeira multiplicação
(`docs/insights.md:1084-1086`). Sobreviveu porque **nenhuma linha de produção
importa esse módulo**: sem chamador não há erro de compilação, sem teste não há
vermelho. "Tipo que ninguém usa não é inofensivo — é mentira esperando o primeiro
chamador, e o primeiro chamador aqui seria a tela de produção"
(`docs/insights.md:1088-1091`).

**Segundo achado, do mesmo desenho.** `loadRecipeGraph` devolve `id: v.recipe_id` —
o id da **receita**, nunca o da **versão** (`repository.ts:594-606`) — e o tipo
`Recipe` não tem campo para ele: gravar qual versão a produção usou era
**impossível hoje**, e esse era o único item "ausente" da Fase 1 na auditoria
(`docs/insights.md:1093-1097`).

**O que mudou.** O tipo passou a dizer **`unitCostRate?: Rate`**. E dois guardas
novos: (1) todo campo do `Movement` nomeia uma coluna que **o servidor tem** —
visto falhando com `unit_cost_cents`; (2) o que o aparelho **não** guarda virou
lista escrita — `recorded_by` (o serializador carimba), `post` (Fase 3) e
`counterpart_location_id` (a transferência vai precisar) — "para a falta ser
deliberada em vez de descoberta por uma chave estrangeira falhando às quatro da
manhã" (`docs/insights.md:1099-1105`).

**Erro de verificação registrado:** o primeiro guarda pareceu não morder porque o
`grep` procurava "names no column" onde a mensagem diz "name no column" — "o teste
estava certo; a checagem da checagem é que estava errada"
(`docs/insights.md:1107-1109`).

#### A13 — 1/9: a regra que avisa antes de gastar dinheiro morava no JSX (`docs/insights.md:208-238`)

**O que se viu.** Varredura mecânica por funções do domínio sem chamador devolveu
**quinze nomes**. Conferidos um por um: `priceMove` **não** é duplicata da tela de
compra — ela compara as duas últimas notas do passado, a tela compara a nota que
está sendo digitada; perguntas diferentes (`docs/insights.md:210-215`).

O problema real era o outro lado: a tela decidia sozinha o que é aumento digno de
aviso, com **`0.05` e `-0.02` escritos quatro vezes dentro do JSX**, a mesma regra
expressa de três jeitos — cor do cartão, sinal da etiqueta, texto da etiqueta —
**sem nenhum teste**. "É a regra que decide o que o dono é avisado antes de gastar
dinheiro, e ela morava na marcação" (`docs/insights.md:216-221`).

**O que mudou.** `judgePriceChange()` devolve um veredito — **`wellAbove`,
`smallChange`, `cheaper`** — e os dois limiares passam a ser constantes com o
motivo escrito ao lado. O veredito **nomeia a chave do dicionário**, então a tela
continua dona das palavras nos três idiomas enquanto a regra fica num lugar só, com
teste que fixa as fronteiras exatas (`docs/insights.md:223-227`).

**A assimetria virou decisão:** *"precisa de mais de 5% para alarmar e só 2% para
dizer que está mais barato"* — "alarme falso ensina a ignorar alarme, e aí o
verdadeiro chega e é ignorado junto. Boa notícia que vira ruído não custa nada"
(`docs/insights.md:229-232`).

**Sobre as outras catorze:** não são achado. `explodeRequirements`, `reorderPoint`,
`daysOfCover` e as de lote existem para fases não construídas, e a fundação F8 do
plano manda coletar o sinal antes de ativar a inteligência
(`docs/insights.md:234-237`).

#### A14 — 1/9: o custo que sete telas prometiam e o livro-razão não guardava (`docs/insights.md:1250-1284`)

**O que se viu.** `costPerProductUnit(cost, yieldPerUnit, unitPackagingCents)` é
chamado em **sete lugares** — briefing, receitas, produtos, compras, assistente — e
**todos os sete somam a embalagem**. `recordProduction` congelava
`consumedValue / unitsProduced`, e só: "o palito e o saquinho ficavam de fora do
número que o livro-razão guarda para sempre" (`docs/insights.md:1252-1257`).

**Por que importa.** O custo congelado é o denominador de toda margem futura
(Fundação 2). Sem a embalagem, toda venda sairia com a margem inflada em
**exatamente R$ 0,05 por unidade — R$ 25 numa corrida de 500** — e nenhum relatório
teria como explicar a diferença, "porque a tela e o banco diriam números diferentes
com a mesma cara" (`docs/insights.md:1259-1264`).

**O que mudou.** `recordProduction` soma `product.unitPackagingCents` na taxa
congelada. Dois testes que afirmavam a aritmética antiga foram reescritos, e o
segundo ficou mais forte: o custo do tacho **se espalha** pelas unidades que saíram
(500/400 quando rende menos), mas **o palito não se espalha** — um palito custa o
mesmo tenha o tacho rendido 400 ou 500. O e2e fecha a volta no navegador: a mesma
unidade lê **R$ 0,64 na produção e R$ 0,64 no briefing**
(`docs/insights.md:1265-1272`).

**O que ficou aberto.** A embalagem é um valor **digitado à mão** no produto,
enquanto palito e saquinho são **itens comprados por nota**. O custo sai certo, mas
nenhum movimento tira palito do estoque: **o saldo de palito só sobe** — o cheiro
que o `CLAUDE.md` manda procurar. A cura é ligar produto → itens de embalagem com
quantidade por unidade, mudança de esquema, "que vem separada desta e sem a pressa
de vir junto" (`docs/insights.md:1274-1279`).

---

### 30.3 Custo, receita, versão e lote

#### A15 — 1/9: a promessa estava no comentário e o campo não existia (`docs/insights.md:1131-1156`)

**O que se viu.** O tipo `Recipe` dizia, desde o começo: *"Versions are numbered and
kept. **Production records which one it used**, so historical cost stays correct
after the formula changes."* Era **impossível**: `loadRecipeGraph` **seleciona**
`v.id` — o id da versão — e depois mapeia `id: v.recipe_id`. A identidade da versão
nunca saía da camada de dados, e o tipo não tinha onde guardá-la
(`docs/insights.md:1132-1136`).

**Por que ninguém viu.** Compilava; todos os testes passavam; "o comentário
descrevia a intenção e nada afirmava o fato". A auditoria de fases marcou "a
produção grava a versão de receita que usou" como **ausente** e não achou o motivo
— porque o motivo não era funcionalidade faltando, era **um campo que sumia no
meio do caminho** (`docs/insights.md:1138-1142`).

**O que mudou.** `Recipe.versionId`, mapeado de `v.id`. O compilador achou os
**cinco lugares** que constroem uma receita, incluindo o rascunho da tela de edição
— que agora diz **`versionId: DRAFT`** em vez de emprestar o id da versão anterior,
"porque apontar uma corrida para uma fórmula que não é a que ela usou é pior que
não apontar" (`docs/insights.md:1144-1147`). O teste foi visto falhando com
exatamente o bug original (`versionId: v.recipe_id`): *"versionId is the recipe id
again"* (`docs/insights.md:1149-1151`).

**O padrão:** *"comentário promete, código não entrega, nada exercita"* — já
aparecido no `assistant_phrase` com índice e sem escrita e no tipo do movimento
descrevendo colunas mortas. "Onde o docblock afirma um fato, ou existe teste
afirmando o mesmo, ou é ficção" (`docs/insights.md:1153-1156`).

#### A16 — 2/9 (noite): o lote estava pronto no servidor e sem escritor (`docs/insights.md:1723-1764`)

**O que se viu.** A tabela `lots` existe no servidor **desde a primeira migração** —
código, data de produção, validade, **`unique (company_id, code)`** — e
`movements.lot_id` tem **índice parcial dedicado**. **Nada nunca escreveu nela.** O
aparelho tinha o `lot_id` e nem a tabela; o próprio `docs/insights.md` já havia
nomeado a dívida: *"a fila não trava hoje porque nulo passa na chave estrangeira;
trava no dia em que a Fase 2 gravar o primeiro lote"* (`docs/insights.md:1725-1731`).

**E a política repetiu o defeito.** `lots_write` cobre `insert` e **não existe
política de `update`** — enquanto a fila do aparelho sobe com
`on conflict (id) do update`, porque reenviar é o caso normal de um celular que
perde sinal. É **exatamente** o que a migração `0015` consertou para `purchases` e
`purchase_lines`, "esperando aqui desde o dia em que a tabela nasceu. Peça sem
escritor não é peça pronta: é peça não exercitada"
(`docs/insights.md:1733-1739`).

**O que a barra pegou sozinha** (`docs/insights.md:1741-1757`):

| Ferramenta | O que ela cobrou |
|---|---|
| Guard da sessão do aparelho | parou o script: *"a sessão não exercita `lots` — a checagem 6 cobriria menos do que promete"* |
| Guard de ambiguidade do `mutate` | mudar a assinatura de `write` deixou **obsoleta** a mutação que inverte o sinal do consumo (a que garante que produzir não *enche* o almoxarifado) — sem o guard ela sumiria em silêncio com a lista reportando verde |
| e2e | derrubou um diálogo recém-inventado: o código do lote num alerta depois de gravar impedia a checagem de alcançar a barra de abas — "um toque a mais na ação mais frequente do dia" |

O lote virou **cartão na aba de produção** — "e ficou melhor, porque quem procura
de que lote é uma caixa procura **horas depois**, não no segundo seguinte"
(`docs/insights.md:1754-1757`).

**As decisões que o código carrega** (`docs/insights.md:1759-1764`): **um lote por
corrida**, não por dia nem por produto — "se o tacho da manhã derreteu e o da tarde
não, o recall é do tacho da manhã". A **validade é do produto**, perguntada uma vez
no cadastro, porque "quem está de luva não sabe de cabeça que picolé dura seis
meses". **Produto sem prazo gera lote sem validade**, e isso é resposta, não falha:
"data inventada descarta mercadoria boa ou vende mercadoria vencida".

---

### 30.4 Esquema do servidor, RLS e sincronização

#### A17 — 1/9: o servidor recusaria a primeira coisa que o aplicativo grava (`docs/insights.md:64-93`)

Três defeitos no esquema do Postgres, achados escrevendo o livro-razão do aparelho
contra ele "e perguntando, comando por comando, o que o servidor faria com o que o
celular manda. Nenhum deles é visível lendo um lado só"
(`docs/insights.md:66-69`).

| # | Defeito | Consequência |
|---|---|---|
| 1 | **Não havia palavra para "compra"** — o enum `movement_kind` foi escrito da fábrica para fora: produção, transferência, venda, perda | nada descrevia estoque chegando de fornecedor contra uma nota, "que é o primeiro movimento que qualquer instalação real registra, porque uma fábrica compra açúcar antes de fazer qualquer coisa" (`docs/insights.md:71-75`) |
| 2 | **`check (quantity_base_units <> 0)`** | "parece obviamente certo e é certo para todos os tipos menos um" — uma contagem que confere era recusada (`docs/insights.md:76-77`) |
| 3 | **`unit_cost_cents bigint`** — uma taxa guardada como dinheiro, a disciplina `Cents`/`Rate` quebrada dentro do próprio esquema que a defende | saco de **R$ 118 por 25 kg = 0,472 centavo por grama**, que como inteiro é **0**: "todo insumo barato congelaria custo nenhum, e o relatório de margem em cima disso pareceria plausível" (`docs/insights.md:78-83`) |

**Achado de brinde.** A política de escrita é um **`CASE` por tipo sem `ELSE`**,
então um tipo novo no enum entra travado — ninguém pode gravá-lo. "Falha fechada,
que é o lado certo, mas significa que acrescentar `'purchase'` sem mexer na política
daria ao aplicativo uma palavra que o banco ignora em silêncio"
(`docs/insights.md:85-88`).

**O que mudou.** Migrações **`0007`** e **`0008`**, e uma **quinta garantia** no
`db:verify`: uma compra é gravada, uma contagem vazia é guardada, uma produção
vazia continua recusada, e **quem não tem `check_receipt` não assina recebimento**.
A checagem foi vista falhando antes de ser aceita (`docs/insights.md:90-93`).

#### A18 — 1/9: a média móvel tinha dois autores, e eles discordavam (`docs/insights.md:284-320`)

**O que se viu.** Foi construído o terceiro nível da barra: uma sessão real roda no
celular, a fila que ela produz passa pelo mesmo `serialize` que a sincronização vai
usar, e o SQL entra no servidor com `ON_ERROR_STOP`
(`docs/insights.md:286-290`).

**Antes de rodar, comparar os dois esquemas coluna a coluna achou seis
divergências** (`docs/insights.md:291-301`):

| Divergência | Efeito |
|---|---|
| `recipe_lines` sem `position` no servidor | **defeito de produto**: a ordem em que a pessoa escreveu os ingredientes se perderia no sync — "ficha técnica é lida de cima para baixo, com alguém trabalhando" |
| `supplier_name` sem destino | dado sem para onde ir |
| `created_by` e `recorded_by` obrigatórios sem equivalente no aparelho | insert impossível |
| `active` inteiro contra booleano | "o insert simplesmente falha" |
| `packaging` texto contra `jsonb` | **não falha** — "grava uma string entre aspas onde deveria haver estrutura, e nada reclama" |
| `freight_cents not null default 0` anulado | `select *` manda NULL para campo ausente e **derruba o default do servidor** |

**E a primeira execução real achou o que nenhuma leitura acharia.** Aparelho
**0,5310**, servidor **0,5605**. A causa: **`item_costs` é valor derivado com dois
autores** — o aparelho calcula a média para sobreviver offline, o servidor recalcula
no gatilho, e os dois se sobrescrevem. Pior: a fila guarda **id de linha, não o
valor da época**, então a reprodução reenvia sempre o estado atual, "e o gatilho
misturou uma nota nova contra uma média que só passou a existir depois dela"
(`docs/insights.md:303-309`).

**O que mudou.** **`item_costs` deixou de viajar.** "Valor derivado tem um dono só:
o que atravessa é a nota, e a média é o que cada lado conclui dela, pela mesma
regra." O serializador devolve **`derived`** em vez de silêncio, "porque escrita que
nunca chega é idêntica a escrita que chegou" (`docs/insights.md:311-314`).

**A garantia que sobra é a mais forte do projeto:** a **checagem 6** compara **duas
implementações independentes da média móvel** — a de TypeScript no celular e a de
plpgsql no Postgres — e exige que fechem o mesmo número. "Hoje fecham: saldo
**92.000**, média **0,5310**" (`docs/insights.md:316-320`).

#### A19 — 1/9: seis defeitos que a barra inteira não podia ver (`docs/insights.md:241-280`)

**O que se viu.** Uma revisão automática do Codex apontou seis coisas no PR; todas
as seis eram reais, em código que passou por **typecheck, 78 testes, lint,
`db:verify` e nove checagens de navegador** (`docs/insights.md:243-246`).

O padrão: **cinco delas só existem no caminho que nada exercita** — "a fila de
sincronização tem teste de ordem e de idempotência, e nunca ninguém a reproduziu
contra o esquema real do servidor" (`docs/insights.md:248-250`):

| Defeito de sync | Detalhe |
|---|---|
| compra saía **sem a linha da nota** | "e é a linha que dispara o gatilho de custo no Postgres" (`docs/insights.md:251-252`) |
| receita saía **sem as linhas dela** | (`docs/insights.md:252`) |
| local ia com `'storeroom'` | o enum do servidor diz **`store_room`** (`docs/insights.md:252-253`) |
| "apagar tudo" **se apagava** | o `outbox` está na lista de tabelas que a limpeza esvazia: "o aparelho ficava vazio, o servidor nunca ficava sabendo, e a próxima sincronização traria de volta exatamente o que a pessoa mandou destruir" (`docs/insights.md:253-256`) |

**Um jeito de inutilizar o celular.** `PRAGMA user_version` era escrito **depois**
da transação da migração. "Um processo morto naquela fresta volta acreditando que o
passo não rodou e roda de novo — e um passo como `ALTER TABLE ... ADD COLUMN` falha
na coluna que já existe. Não uma vez: em toda abertura, para sempre, sem porta de
entrada." O pragma é transacional (provado), então agora o esquema e o registro
dele "caem juntos ou não caem" (`docs/insights.md:260-266`).

O sexto defeito é o arredondamento por linha (item A11).

**A conclusão desconfortável.** "A barra de verificação deste projeto é boa e não
tinha como pegar nada disso. Ela exercita módulos e exercita o aplicativo, e o que
faltou é o terceiro: **reproduzir a fila contra um Postgres de verdade.**" Dívida
registrada, não conserto (`docs/insights.md:276-280`).

#### A20 — 1/9: o contrato entre os dois esquemas cabia em milissegundos (`docs/insights.md:388-409`)

**O que se viu.** A checagem 6 prova o acordo de forma honesta, mas custa meio
minuto e um banco, então roda uma vez no fim; e o portão de mutação, que roda a
suíte unitária, **não alcança nada disso** — a divergência `storeroom` contra
`store_room` era invisível para ele (`docs/insights.md:390-394`).

**O que mudou.** Um teste que lê os dois lados: as migrações do servidor, tal como
ele é construído, contra o que o `serialize` promete mandar. "Não prova
comportamento — prova **acordo**, que é exatamente onde moraram todas as
divergências de hoje" (`docs/insights.md:396-399`).

**E achou uma na primeira execução — no próprio parser.** A migração usa
`add column if not exists`, e o regex leu **`if` como nome da coluna**, reportando
`items.base_unit` ausente numa coluna que existe desde a `0003`. O parser foi
consertado e ganhou **canários**: uma coluna do CREATE, uma acrescentada por ALTER,
uma removida. "Sem esses três, o teste mediria o parser em vez do esquema, e é
assim que um guarda passa a sempre passar" (`docs/insights.md:400-405`).

**O ganho real:** as três divergências que só o Postgres pegava agora morrem na
suíte unitária, o que as coloca ao alcance do `npm run mutate`. **O portão foi de
treze para quinze defeitos**, e os quinze são pegos (`docs/insights.md:407-409`).

#### A21 — 1/9: o guarda de acordo só olhava para um lado (`docs/insights.md:525-539`)

**O que se viu.** O teste de acordo checava as colunas que o aparelho **manda**. A
direção inversa — coluna que o servidor **exige** e o aparelho nunca manda —
continuava só ao alcance do Postgres: "é a classe do `freight_cents`, que custou
uma corrida de CI para aparecer" (`docs/insights.md:527-530`).

**O que mudou.** O parser passou a ler **`not null` e `default`** de cada coluna, e
o teste exige que **toda coluna obrigatória sem padrão venha do aparelho** — "não há
outro lugar de onde ela possa vir". Com canários de novo: "sem eles, uma regra que
lesse tudo como 'tem padrão' reportaria nada faltando para sempre"
(`docs/insights.md:532-535`).

**Visto mordendo:** tirando o carimbo de `recorded_by`, dois testes ficam vermelhos
e o primeiro nomeia `movements.recorded_by`. **O portão de mutação foi a
dezessete** (`docs/insights.md:537-539`).

#### A22 — 1/9: o aparelho não conseguia reenviar a fila (`docs/insights.md:652-691`)

**O que se viu.** Assim que a checagem 6 parou de rodar como superusuário e passou
a subir a fila como a conta da empresa, sob RLS, a **segunda** passagem da mesma
fila foi recusada com:

```
new row violates row-level security policy (USING expression)
for table "purchases"
```

`purchases` e `purchase_lines` tinham política de leitura e de INSERT e **nenhuma de
UPDATE** — e a fila sobe com `ON CONFLICT DO UPDATE`. "Todas as outras tabelas que
ela escreve têm um `_manage FOR ALL`, que cobre update; essas duas ficaram de fora
quando foram escritas, e nada apontava para isso porque nenhuma política era
avaliada" (`docs/insights.md:654-664`).

**Por que importa.** "Reenviar não é caso raro, é o caso normal: sinal que cai no
meio da subida, aplicativo fechado antes do fim, bateria acabando na câmara fria."
Sem UPDATE o aparelho reenviaria **para sempre**, com a fila travada atrás da
primeira nota e nada na tela explicando o quê (`docs/insights.md:666-671`).

**O que mudou.** Migração **`0015`** com política de UPDATE para as duas, na mesma
capacidade que já podia inseri-las. **Não foi `DO NOTHING`**: "com ele, uma nota
corrigida no aparelho seria descartada em silêncio, e silêncio é a única coisa pior
que a recusa". `movements` **continua sem política de UPDATE** e subindo com
`DO NOTHING` — "a nota é documento, o movimento é fato, e só o fato é imutável"
(`docs/insights.md:673-678`).

**A checagem 6 virou quatro afirmações em vez de uma** (`docs/insights.md:680-684`):
(1) a fila entra **sob a política** como a conta da empresa; (2) a **mesma fila** por
quem não é da empresa **para na primeira linha** — "que é o que prova que a política
está sendo avaliada, e não apenas presente"; (3) reenviada inteira, não estraga
nada; (4) o saldo aferido **depois das duas passagens** continua **92000**, "que é o
livro-razão provando que não dobrou".

**Três coisas menores** (`docs/insights.md:686-691`): `ON CONFLICT DO UPDATE` exige
privilégio de UPDATE, e o Postgres responde só `permission denied` sem dizer qual
dos dois falta — "meia hora nisso". Um backtick dentro de string com aspas duplas
fez o bash executar um comentário SQL (segunda vez no dia dessa família, a primeira
em template literal). E **`has_capability` mudou para o schema `private` na
`0004`**, "o que só aparece quando se escreve uma política nova".

#### A23 — 1/9: a checagem nova mudou o que o job precisava, e não avisou (`docs/insights.md:367-384`)

**O que se viu.** O `db:verify` ficou vermelho no CI e verde local, em três pushes
seguidos: `Cannot find module '@/data/db'`, depois de o `npx` anunciar que ia
**baixar** o `tsx`. O job do banco **nunca rodou `npm ci`** — por meses não precisou,
era bash e `psql`. A checagem 6 mudou isso em silêncio: ela roda uma sessão de
aparelho em TypeScript para produzir a fila (`docs/insights.md:369-376`).

**Por que passou local.** "Porque local tem `node_modules`." Reproduzido copiando o
script para uma pasta sem dependências: mesma mensagem, na mesma linha
(`docs/insights.md:378-379`).

**A lição.** "Um passo novo pode mudar os pré-requisitos do job que o hospeda, e
nada no repositório checa isso" — duas fontes de verdade sobre o que o job precisa:
a lista de passos e a realidade (`docs/insights.md:381-384`).

---

### 30.5 Identidade, permissão e atribuição

#### A24 — 1/9: a permissão existe em três lugares e vale em dois (`docs/insights.md:414-460`)

**O que se viu.** A fundação F6 — *permissão por capacidade, nunca por tela* —
estava aplicada em **dois** dos três lugares (`docs/insights.md:416-422`):

| Onde | Estado na época |
|---|---|
| Servidor (RLS no Postgres) | aplicado, provado pela **checagem 4** |
| Assistente | aplicado **antes** da consulta, com teste |
| Telas | **nada** |

"Nenhuma tela verifica nada. `listItems` devolve custo médio para quem chamar, e o
conjunto inteiro de capacidades estava escrito à mão em `app/assistant.tsx`, sob um
comentário dizendo *'até o login chegar, o usuário local é o dono'* — e aquela lista
à mão já estava **faltando três capacidades** que o dono tem. Hoje não vaza porque
só existe uma pessoa. Vaza no dia do segundo celular"
(`docs/insights.md:423-429`).

**A pergunta que isso reformula.** "Login não é acrescentar uma tela de entrar. É o
que faz o sistema de permissão que **já existe** significar alguma coisa no
aparelho" (`docs/insights.md:431-433`).

**O que mudou.** `src/domain/access.ts`: o vocabulário sai do módulo do assistente e
vira domínio, com **uma fonte só** — e um teste que compara a lista do código com o
enum do servidor, **valor por valor**. Mais o mapa papel→capacidades, com as
**ausências presas por teste**: o operador de fábrica e o entregador **não veem
custo, preço nem dinheiro**; **só o dono administra a empresa**; **ninguém de fora
vê custo**. "Ampliar um papel passa a ser ato deliberado com suíte vermelha na
frente" (`docs/insights.md:435-442`).

**Um desalinho honesto.** O piso de autonomia do plano tem **cinco atos**, e só
**dois** têm capacidade própria: mudança de preço, estorno e lançamento financeiro
são coisas que o aplicativo ainda não faz. "Nomear capacidade para elas agora seria
inventar vocabulário para recurso ausente, então ficaram escritas como **atos**, não
permissões. O piso é uma promessa feita antes do recurso existir: quem construir
herda a regra em vez de decidir de novo" (`docs/insights.md:444-450`).

**Em aberto na época, decisão do dono:** celular compartilhado ou pessoal no chão de
fábrica; se o movimento operacional grava **quem** ou **onde**; e se o operador pode
conferir a prateleira. O argumento registrado: "o tom de voz do projeto diz nunca
culpar pessoa, e a cadeia de custódia existe para localizar a perda sem acusar
ninguém — o que argumenta por aparelho e posto, não por pessoa"
(`docs/insights.md:452-460`).

#### A25 — 1/9: a identidade carimbada na hora errada (`docs/insights.md:577-597`)

**O que se viu.** O serializador escrevia **`recorded_by: actor.userId`** — o usuário
**da sincronização**. Num celular compartilhado, "quem sobe os dados à noite não é
quem registrou de manhã. O livro-razão responderia 'quem' com o nome errado"
(`docs/insights.md:578-582`).

**Por que importa.** "Errar o 'quem' é pior do que não saber: um nome errado no
histórico é usado para cobrar a pessoa errada, e a equipe que se sente acusada
sabota o dado" (`docs/insights.md:584-586`).

**O que mudou.** `movements` ganhou **`recorded_by` no aparelho (migração V4)**,
preenchido **no instante da escrita**; o serializador passou a mandar o valor gravado
e **só carimba o ator quando o aparelho não sabia**. "Nulo virou resposta honesta:
'o aparelho não sabia', não 'ninguém fez'." Teste novo e mutação nova — a suíte fica
vermelha se o carimbo do sync voltar a mandar (`docs/insights.md:588-592`).

**Nota de correção no mesmo dia** (`docs/insights.md:594-597`): "a conclusão acima
estava pela metade: mandar o valor gravado é necessário, mas o servidor recusa
quando ele difere de quem está sincronizando" — fechado no item A26.

#### A26 — 1/9: duas perguntas, e eu tentei responder com uma coluna (`docs/insights.md:618-650`)

**O que se viu.** A política de INSERT da fundação é **`recorded_by = auth.uid()`**:
o servidor só aceita movimento atribuído à própria conta que insere. Isso foi lido
como contradição com o aparelho compartilhado, e foi construído em cima — "recusa no
serializador, sessão por pessoa, PIN destrancando token guardado. **Era premissa
inventada.** A contradição não existia: eram duas perguntas diferentes que eu estava
empilhando numa coluna só" (`docs/insights.md:619-624`).

O dono desfez em duas frases: **o login autentica o sistema** — a conta é da
empresa, que distribui acesso por e-mail ou código de convite por perfil — e **quem
estava operando é anotação do registro**, não identidade da sessão
(`docs/insights.md:626-629`).

**Por que importa, e o que quase aconteceu.** "O código errado estava bonito: teste
verde, erro claro, comentário explicando. Verde protegendo uma regra que ninguém
pediu é pior que vermelho — não avisa. Custou uma rodada inteira"
(`docs/insights.md:631-635`).

**O que mudou.** **`movements.operator_id`** no servidor (**`0014`**) e no aparelho
(**V5**), referenciando a pessoa cadastrada; **`recorded_by` volta a ser
simplesmente a conta que sincroniza**. `AttributionMismatchError` e a
sessão-por-pessoa foram **deletadas**. O `db:verify` guarda os dois lados: **nomear
outro em `recorded_by` é recusado, nomear outro em `operator_id` é aceito** — e a
recusa foi isolada trocando só a atribuição, "para provar que é ela e não outra
coisa". No `CLAUDE.md` entrou a regra de método: *contradição achada é suspeita de
leitura errada até virar prova* (`docs/insights.md:637-644`).

**E um buraco de verdade, que sobreviveu à correção.** "Os **45 writes** da fila são
reproduzidos como **superusuário**, que ignora RLS por completo. A 'fila reproduzida
contra um servidor de verdade' prova que as colunas batem — nunca provou que a
escrita seria aceita" (`docs/insights.md:646-650`). Fechado no item A22.

#### A27 — 1/9: a pergunta que eu repeti três vezes já estava respondida no esquema (`docs/insights.md:496-523`)

**O que se viu.** A pergunta repetida — se movimento de chão de fábrica grava *quem*
fez ou *onde* aconteceu — se desmontou em duas. Primeiro: **é preferência de
empresa** ("uma fábrica de três pessoas não quer nome nenhum; uma de quarenta com
furo de estoque quer"), então pela F7 vira dado. Segundo:
**`movements.recorded_by` já é `not null` desde a primeira migração** — "o
livro-razão sempre soube quem fez. A pergunta nunca foi sobre armazenamento — era
sobre a **interface** nomear a pessoa" (`docs/insights.md:498-510`).

**O que mudou.** **`companies.names_who_recorded`, padrão `false`**. O padrão vem do
tom de voz: a cadeia de custódia existe para **localizar** a perda — "a diferença
entre dois postos diz se foi separação, rota ou recebimento" — e *"faltaram 3 caixas
na conferência"* resolve sem nomear ninguém (`docs/insights.md:513-518`).

**A lição.** "Antes de levar uma pergunta ao dono, ler o esquema. Metade das
perguntas que parecem de produto já foram respondidas por quem escreveu a tabela"
(`docs/insights.md:520-523`).

---

### 30.6 i18n, formatação e texto

#### A28 — 2/9: o número sumiu da frase, e o compilador achou ótimo (`docs/insights.md:1567-1591`)

**O que se viu.** O cartão novo da capa saiu do navegador dizendo **"Picolé de
morango · unidades"** — sem a quantidade, "num aviso cujo assunto inteiro é a
quantidade" (`docs/insights.md:1568-1570`).

**A causa, de uma linha.** `plural(n, t.units.unit, formatQuantity(n))`. Metade das
entradas do dicionário carrega `{{n}}` (por exemplo `'{{n}} caixas'`) e metade é só
a palavra (`units.unit` é `'unidades'`, "porque as telas escrevem o número ao lado").
Chamada com um número para mostrar, a segunda metade **jogava o número fora**:
`fill` não acha onde pôr, devolve a palavra, e ninguém reclama. "Compilou, passou nos
**218 testes**, e só o e2e viu" (`docs/insights.md:1572-1578`).

**O que mudou — duas coisas.** (1) **`plural` não perde mais o número**: "quem passou
um número quis mostrá-lo, e se a frase não tem onde recebê-lo, ele vai na frente.
Perder dado em silêncio é sempre pior que uma frase um pouco torta"
(`docs/insights.md:1582-1584`). (2) **`Widen<T>` obriga a chave, não o buraco** — "a
fundação de i18n garante que uma chave nova em português quebra a compilação das
outras duas línguas até serem escritas, e **não olha para dentro da frase**.
`'Ontem foram {{amount}}.'` traduzido como `'Yesterday.'` compila limpo, e a Lei 3
fica desligada em silêncio no idioma que ninguém desta sala lê para conferir." Agora
existe **`src/i18n/i18n.test.ts`**: os três dicionários, **folha por folha, com os
mesmos buracos nas mesmas frases** (`docs/insights.md:1586-1591`).

#### A29 — 2/9: o `[por quê?]` fala um idioma só (`docs/insights.md:1706-1721`)

**O que se viu.** `src/components/WhySheet.tsx` com o texto cravado em português:
**"Custo do lote", "Perda prevista", "% do lote", "sobram", "Custo por unidade de
massa", "Fechar"** (`docs/insights.md:1707-1710`).

**Por que importa mais que uma tela qualquer.** "Esta é a folha que abre a conta de
toda conclusão do aplicativo — a Lei 6 em pessoa. Uma fábrica que rodar o app em
espanhol vê a interface inteira traduzida e, no momento em que pede a prova do
número, recebe português. O `Widen<T>` não pega isto: ele obriga a chave a existir
nos três dicionários, e não obriga a tela a usá-los"
(`docs/insights.md:1712-1716`).

**E o vizinho, da mesma família.** **`(x * 100).toFixed(1)`** aparecia em **três
lugares** — a capa, a receita e esta folha. "É o ponto decimal do JavaScript num
aplicativo que fala português e espanhol: a alta da polpa saía como **'9.0%'**."
Virou **`formatPercent`**, "no único lugar que sabe o idioma"
(`docs/insights.md:1718-1721`).

#### A30 — 1/9: a regra de plural que virou função na terceira chamada (`docs/insights.md:1281-1284`)

**O que se viu.** `n === 1 ? one : fill(other)` estava **copiada em dois pontos de
`app/settings.tsx`** e ia virar o terceiro na produção.

**O que mudou.** Virou **`plural()` em `src/i18n`**, "com um detalhe que só aparece
na terceira chamada: o número que **escolhe o ramo** não é a string que **entra na
frase** — 1200 escolhe o plural, mas quem vai na frase é '1.200'"
(`docs/insights.md:1281-1284`).

#### A31 — 2/9: ida e volta é obrigação de quem escreve no próprio campo (`docs/insights.md:1478-1502`)

**O que se viu.** A tela de receita pré-preenchia o campo de perda com
**`String(Number((loss*100).toFixed(2)))`** — e `String(2.5)` em JavaScript é sempre
`"2.5"`, com **ponto**. A linha logo abaixo relia esse campo com
**`Number(s.replace(/\./g,'').replace(',','.'))`**, que **apaga pontos**. "Uma perda
de 2,5% voltava **25%**. O `changed` usava o mesmo leitor quebrado, então o botão de
salvar acendia sozinho, sem ninguém digitar: **abrir a ficha bastava para
corrompê-la**, e o custo de todo produto que a usa ia junto. O guard existente só
barra perda acima de 10%; a faixa real de uma fábrica, **0,5% a 9,9%**, passava muda"
(`docs/insights.md:1478-1487`).

**E a suíte estava verde por coincidência aritmética — de novo.** O `seed.ts` semeia
perdas de **0.02, 0.04, 0.05 e 0.08**: todos percentuais inteiros, todos com ida e
volta limpa. "As **catorze** verificações e2e nunca digitaram um separador em campo
nenhum — só `4`, `700`, `480`, `46000`" (`docs/insights.md:1489-1494`).

**O que mudou.** Regra: **se uma tela pré-preenche um campo que ela mesma vai reler,
o escritor e o leitor têm de ser inversos comprovados** — "não duas funções que por
acaso combinam nos números do exemplo". Virou **teste de propriedade
(`parseTyped ∘ formatTyped = identidade`, nos três idiomas)** e virou **guarda no
e2e**: abrir a ficha, não tocar em nada, e exigir que ela continue dizendo o que foi
salvo (`docs/insights.md:1496-1502`).

#### A32 — 2/9: o dia combinado não é um instante (`docs/insights.md:1593-1607`)

**O que se viu.** "Um pedido 'para quinta' não tem hora." O livro-razão é feito de
instantes, e a tentação era reaproveitar **`dayWindow(...).from.slice(0, 10)`**
(`docs/insights.md:1594-1598`).

**Por que está errado, e por que é invisível de dentro do Brasil.** "A meia-noite
local de 3 de setembro em **Madri** é **2 de setembro às 22h em UTC**: o corte
devolve o dia anterior, e um pedido combinado para quinta aparece como quarta para
metade dos fusos do mundo. Do lado negativo o atalho acerta por acaso, que é
exatamente como esse tipo de defeito atravessa uma revisão"
(`docs/insights.md:1599-1603`).

**O que mudou.** **`localDate()`** faz a conta sobre a data local e
**`formatCalendarDate()`** a mostra sem passar por fuso nenhum. "O par tem teste com
Madri, com São Paulo, antes e depois da meia-noite, e virando o mês"
(`docs/insights.md:1605-1607`).

---

### 30.7 Telas, Lei da Inteligência, movimento e design

#### A33 — 1/9: a tela inicial respondia uma das três perguntas (`docs/insights.md:176-204`)

**O que se viu.** Medida contra a Lei da Inteligência, a tela inicial respondia
**uma** das três perguntas. E violava a Lei 3 no primeiro cartão que o dono vê: o
custo por unidade aparecia sozinho, **R$ 0,55**, sem nada ao lado. "Cinquenta e cinco
centavos não é caro nem barato — é um número pedindo para ser acreditado, que é
exatamente o que este aplicativo diz não fazer" (`docs/insights.md:178-186`).

**O que mudou.** "A comparação já estava escrita no banco e ninguém tinha ido
buscá-la: toda nota lançada grava a taxa anterior do insumo." **`ratesBefore()`**
dobra o histórico de volta e a tela precifica os mesmos produtos duas vezes — com o
custo de hoje e com o de antes das últimas notas. O cartão passa a dizer
**"▲ R$ 0,09 · custava R$ 0,64 antes das últimas compras"**, verificado no navegador
contra uma nota lançada de verdade (`docs/insights.md:188-193`).

**O detalhe que decide se o número é honesto.** Quando um insumo subiu **mais de uma
vez** na janela, vale a taxa anterior à **primeira** delas. "Desfazer só o último
passo reportaria uma alta de 9% como se fosse 2% — é assim que uma sequência de
aumentos se esconde à vista" (`docs/insights.md:195-198`).

**E a terceira pergunta continua sem resposta, de propósito.** "'Qual é a próxima
ação provável' precisa de preço de venda (para sugerir repreço) ou de consumo (para
sugerir compra), e a Fase 1 não tem nenhum dos dois. Encher a tela de 'confira alguma
coisa' seria o alerta inventado contra o qual a própria Lei avisa"
(`docs/insights.md:200-204`).

#### A34 — 1/9: o pulso mentia, e a regra estava escrita no próprio arquivo (`docs/insights.md:718-757`)

**O que se viu.** O `<PulseDot />` da tela inicial estava dentro do `map` de produtos
**sem condição**: "todo produto pulsava, sempre, inclusive os de custo parado há
semanas". E o docblock do próprio componente já dizia por que isso é errado —
*"pulso ao lado de valor congelado é mentira visual, e as pessoas percebem"*
(`docs/insights.md:719-723`).

**Por que aconteceu.** "O componente **não tinha como dizer que não estava vivo**.
Ele só pulsava. Respeitar a regra dependia de lembrar de não renderizar — e lembrar
não é mecanismo" (`docs/insights.md:725-728`). Onde dói: "este mora na tela, onde
quem olha é o operador de luva na câmara fria, que aprende em uma semana que a
bolinha não quer dizer nada" (`docs/insights.md:730-732`).

**O que mudou.** **`live` virou obrigatório** — "o compilador apontou o único ponto
que mentia". Parar de pulsar agora também **desfaz** a animação em vez de só não
começar; "deixar o halo onde o último quadro parou é a mesma mentira com outra
forma". E o docblock ainda guardava o "no máximo dois por tela" que o dono já tinha
derrubado; virou princípio: "quantos pulsam depende de quantas coisas estão
acontecendo, e o limite real é a bateria de um celular ligado o turno inteiro"
(`docs/insights.md:734-740`).

**Dois achados menores da mesma varredura.** `app/foundation.tsx` — **168 linhas** —
não era alcançável por nenhum caminho do aplicativo: **apagada**, "porque a tela de
estoque de verdade é Fase 2 e demo parado apodrece". E o e2e **nunca abria
`/recipes` nem `/settings`**, as duas ligadas na home. As duas checagens novas foram
vistas **falhando** antes de aceitas, cada uma pela sua causa: renomear a receita
semeada derruba a de receitas; trocar `hasSeeded()` por `false` derruba a de ajustes
(`docs/insights.md:742-750`).

**O que ficou por responder.** "A terceira — **qual é a próxima ação provável** — não
existe em nenhuma tela ainda. Nada diz 'produza até segunda' nem 'a polpa subiu 9%,
reveja o preço'. Não é esquecimento: é a Fase 4"
(`docs/insights.md:752-757`).

#### A35 — 2/9: o dono abriu o aplicativo e a capa estava respondendo a pergunta errada (`docs/insights.md:1662-1704`)

**O que se viu.** Foto da tela publicada: clima, um cartão grande com **R$ 0,64 cada
um** para o picolé de morango, **"Nada mudou de preço"**, e o botão. O dono:
*"esse valor do morango aí não interessa; o que interessa é produção do dia, do dia
anterior, alerta de ingredientes"* (`docs/insights.md:1663-1668`).

**A parte que dói: os números pedidos já estavam calculados.** A consulta da capa
devolve **`madeToday`, `madeYesterday`, `madeThen`, `shortly`** (o que acaba em sete
dias), **`demand`, `boxes`** e **`running`** — "tudo isso já existia, com teste". O
que decidia se apareciam era uma guarda: **`data.everMade`**. "Numa fábrica que ainda
não produziu, o cartão de produção não existe — e some junto com ele o único assunto
da tela. Sobrou o custo, que era o cartão sem guarda nenhuma"
(`docs/insights.md:1670-1675`). Diagnóstico: "não era falta de dado nem falta de
query. Era **hierarquia**" (`docs/insights.md:1677-1680`).

**A segunda coisa, que ele viu e o repositório não.** *"Eu quero VIDA; o app todo
estático, sem animação e nem graça nenhuma."* O `tokens.ts` tem **`motion.settle`,
`motion.press`, `motion.pressScale` e `motion.staggerMs`** desde o começo, com cinco
regras escritas em cima — e **nada os usava fora do `PulseDot`**. "O sistema de
movimento existia inteiro no papel e não tinha um chamador. É a mesma doença do
`assistant_phrase` com índice dedicado e nenhuma escrita, e **o portão P1 não pega
este caso** porque o que falta não é o chamador de uma função: é o uso de um *token*"
(`docs/insights.md:1682-1687`).

**O que mudou** (`docs/insights.md:1689-1697`): a produção do dia virou a manchete e
**não some mais no zero**; ganhou uma **régua de sete dias (`dailySeries` + `Bars`)**
que responde *o que é normal aqui*; o alerta de insumo ganhou o lado calmo que
faltava; o clima virou cena desenhada, "com a cor saindo da máxima e o sol virando
nuvem quando chove"; o custo por unidade **saiu da capa** e continua inteiro na
receita; o cartão "Nada mudou de preço" **saiu de vez**, "porque ocupar a tela todo
dia para dizer que não há notícia é o alerta que ensina a ignorar alerta"; e
**`Reveal`/`Touchable`** deram ao sistema de movimento os primeiros chamadores.

**O que a limpeza revelou.** Tirar o cartão de custo deixou órfã **metade da consulta
da capa**: `listProducts`, `loadRecipeGraph`, `itemCosts`, `labels`, `ratesBefore`,
`costPerProductUnit`, `costRecipe` e um **`lastCostMove` por produto** "rodavam a
cada abertura do aplicativo para alimentar um cartão que o dono não olhava. Saíram
todos" (`docs/insights.md:1699-1704`).

#### A36 — 2/9: a primeira dependência de rede não pode entrar pela porta do briefing (`docs/insights.md:1551-1566`)

**O que se viu.** O dono pediu clima na tela inicial, e a tentação era somar
**`forecastForScreen()`** ao `Promise.all` que a capa já faz. "Seria a primeira vez
que uma tela deste aplicativo espera pela internet — e o `Promise.all` é
**solidário**, então o briefing inteiro (que sai do SQLite em milissegundos) passaria
a demorar o que a rede da fábrica demorar. **Oito segundos de tela vazia para mostrar
um número que o banco já tinha respondido**" (`docs/insights.md:1552-1558`).

**O que mudou.** São **duas consultas**, e a que depende de rede **chega sozinha,
depois**. O mesmo raciocínio decidiu o resto do desenho: **cache primeiro e rede só
para melhorar**; **previsão guardada com a data conferida contra hoje**, "porque
desenhar a máxima de anteontem é a doença do saldo congelado com outra roupa"; e a
**cidade deduzida do fuso do aparelho** em vez de perguntada, "com o nome visível no
cartão para que o palpite errado seja corrigível num toque"
(`docs/insights.md:1560-1566`).

#### A37 — 2/9: três defeitos de juntas que nenhuma suíte podia ver (`docs/insights.md:1504-1515`)

**O que se viu.** Além do bug de ida e volta (item A31), a mesma caçada achou três
defeitos "todos invisíveis de dentro de um módulo": (1) tela alcançada pelo botão
**Voltar** mostrando o dado de quando montou — "ninguém escutava foco, e a home é a
raiz da pilha, que num celular vive dias"; (2) **produção gravando além do estoque** e
levando o livro-razão a **`-140.000 g`** "enquanto a própria tela avisava da falta";
(3) consumo gravando **`7530,612244897959` g numa coluna `INTEGER`**, "que o SQLite
aceita calado e o Postgres arredondaria — aparelho e servidor discordando do mesmo
saco de açúcar" (`docs/insights.md:1504-1509`).

**O que isso diz sobre a barra.** "Ela media o que um módulo faz, e os quatro
defeitos moram **nas juntas** — entre a tela e ela mesma, entre duas telas, entre o
aparelho e o servidor. O e2e navegava com `page.goto`, que remonta tudo; pessoa não
recarrega, pessoa toca em Voltar. **Um `goBack()` no lugar de um `goto` era a
diferença entre uma suíte verde e o defeito que o dono viu**"
(`docs/insights.md:1511-1515`).

#### A38 — 2/9 (madrugada): o que destravou o design não foi gosto, foi método (`docs/insights.md:1765-1805`)

**O que se viu.** O dono recusou a capa três vezes seguidas — *"está feio ainda"*,
*"você não acerta a mão"* — e na quarta rodada disse o contrário: *"passei meses
brigando com você por causa de design e finalmente me mostrou algo que preste"*.
"Entre a terceira e a quarta eu não melhorei de gosto. Mudei **quem decide** e
**quanto custa cada tentativa**" (`docs/insights.md:1766-1772`).

**A forma das três primeiras rodadas.** "Eu escolhia uma direção, construía em React
Native, mostrava, ele recusava. Cada tentativa custava horas e voltava uma frase —
*'melhorou, mas sei lá'*. Isso não é iteração, é adivinha cara"
(`docs/insights.md:1774-1776`).

**O que funcionou** (`docs/insights.md:1778-1794`):

| Prática | Razão registrada |
|---|---|
| **Esboço em HTML, não no aplicativo** | a pergunta era de linguagem visual — raio, densidade, escala tipográfica, onde a cor entra: "vinte minutos por lote em HTML contra horas por tentativa em React Native. **Dez esboços custaram menos que a segunda tentativa em código**" |
| **Dez opções em vez de uma defesa** | "com uma, ele só podia aprovar ou recusar a minha. Com dez, ele escolheu cinco, depois três, depois duas — e cada corte dele me disse mais do que qualquer explicação minha teria dito" |
| **A correção dele vale mais que a minha leitura dela** | ao dizer *"quero mais contraste, está apagado"*, a leitura foi "cor em mais lugares" e a entrega foram três degraus de mais cor. "Errado: era **saturação**, não quantidade" |
| **Parte do que ele recusou era acerto meu que não era acerto** | "o selo de ícone cheio parecia melhoria e brigava com a ilustração monoline do topo. Eu não teria visto sozinho" |

**A regra que isso vira.** "Quando a decisão é de gosto do dono — marca, cara, tom —
o meu trabalho não é escolher bem: é **fazer a escolha dele ser barata**. Muitas
opções, rápidas, comparáveis, com o mesmo dado. É o mesmo princípio do 'depende vira
dado' das fundações, aplicado à conversa em vez de ao código"
(`docs/insights.md:1796-1800`).

**O desdobramento veio dele:** *"a gente poderia dar várias opções desses elementos
para a pessoa configurar a tela inicial dela"* — "a capa configurável é a mesma ideia
descendo para o produto — cada fábrica olha uma coisa diferente de manhã, e escolher
por elas é errar para duas em cada três" (`docs/insights.md:1802-1805`).

---

### 30.8 Assistente

#### A39 — 1/9: a dívida que eu criei vinte minutos antes (`docs/insights.md:112-138`)

**O que se viu.** A cláusula de pronto do projeto: "um módulo só está concluído
quando o assistente **sabe responder** sobre ele e **sabe preencher** os registros
dele. Ela existe para impedir exatamente um cenário: o assistente que nasce ótimo e
vai ficando para trás a cada módulo novo até virar mentira"
(`docs/insights.md:114-117`). O estoque real e a contagem tinham acabado de entrar e
o assistente não foi tocado: **sete habilidades, e nenhuma sabia dizer *quanto tem*
nem registrar uma conferência** (`docs/insights.md:119-121`).

**Por que importa mais do que parece.** "O achado não é 'faltou uma função'. É que a
regra não estava sendo aplicada a quem a escreveu. Auditar o código antigo é fácil;
auditar o próprio diff contra a regra do projeto é o que ela pede de verdade"
(`docs/insights.md:123-126`).

**O que mudou.** Duas habilidades: **`quanto tem de açúcar`** responde a quantidade
**com a data da última conferência** (Lei 3) "e diz na cara quando ninguém nunca
conferiu, porque um saldo que só veio de nota é outro tipo de número"; e
**`contei 2 sacos de açúcar`** preenche uma ficha e **para** — "ajuste de inventário
está no piso que nenhum nível de autonomia atravessa sozinho"
(`docs/insights.md:128-133`).

**O detalhe que valeu por si.** "**A quantidade não é segredo, o valor dela é.** A
linha 'valor parado' só é montada para quem tem **`view_cost`** — não é omitida do
texto, é **nunca construída**. Quem não pode ver dinheiro recebe uma resposta que
nunca teve dinheiro dentro" (`docs/insights.md:135-138`).

#### A40 — 1/9: o assistente aprendeu a cadastrar, e o teste achou dois bugs (`docs/insights.md:902-932`)

**O que se viu.** Ele tinha **sete habilidades que respondem e duas que preenchem**
(compra e contagem) — **nenhuma que cadastra**. "E cadastrar é justamente onde as
pessoas desistem: ninguém digita sessenta insumos num formulário antes de ver o
aplicativo fazer alguma coisa" (`docs/insights.md:904-909`).

**Os dois bugs, os dois achados pelo teste** (`docs/insights.md:914-926`):

1. **"Polpa de açaí" era recusada porque já existe "polpa de morango".** Foi usado o
   `findByName`, "que por último cai em 'compartilha uma palavra significativa'. Isso
   está certo para **achar** o que a pessoa mencionou e errado para decidir que um
   nome **já existe** — e uma fábrica tem polpa de morango, de açaí e de maracujá.
   Agora a comparação é exata."
2. **O nome entrava sem acento.** "O `match` de todas as outras habilidades roda
   sobre o texto normalizado, porque elas *procuram* algo que existe e 'acai' precisa
   achar 'açaí'. Esta **guarda** o que captura: normalizado, ela poria 'polpa de
   acai' no catálogo da pessoa para sempre. Casa no texto cru, e os verbos não têm
   acento, então não custou nada."

**O que mudou.** **`register_input`** no assistente, com **`saveItem` atravessando o
mesmo caminho que a tela usa** — "o assistente continua sem consulta própria".
Embalagem ilegível **não impede** o cadastro: cria o insumo sem fator e diz isso, "em
vez de chutar um número que ficaria embaixo de todo custo daquele item". Quatro
testes (**cria, ilegível, duplicado, sem permissão**) e duas mutações novas — **25 no
total** (`docs/insights.md:928-932`).

#### A41 — 1/9: a coluna com índice próprio que ninguém preenchia (`docs/insights.md:933-958`)

**O que se viu.** `movements.assistant_phrase` existe na fundação do servidor **com
índice dedicado** (`where assistant_phrase is not null`) para responder "o que o
assistente lançou este mês?", existe no aparelho, atravessa no serializador — "e
**nenhuma linha de código jamais escreveu nela**"
(`docs/insights.md:935-939`).

**Por que importa.** "É a condição que o plano impôs para deixar o assistente
escrever: todo movimento criado por conversa fica marcado, com a frase original
guardada, porque *autonomia sem rastro quebra a confiança no dado*. Sem a escrita, um
lançamento feito por conversa é indistinguível de um digitado — a auditoria prometida
não existia, e o índice construído para ela apontava para zero linhas, para sempre"
(`docs/insights.md:941-945`).

**O que mudou.** "A frase viaja do `ask` para a habilidade e daí para o livro-razão,
nos dois lugares em que o assistente escreve (**compra e contagem**). Provado no
banco de verdade, com o controle junto: um lançamento por conversa guarda a frase, um
lançamento pela tela guarda **nulo** — e é o segundo que torna o primeiro uma
informação em vez de uma coluna sempre preenchida." Mutação nova (**26 no total**)
(`docs/insights.md:947-952`).

**E o `Draft.kind` continua sem leitor** — "um campo carregado e nunca usado. Não
apaguei: quando a marcação de origem virar tela ('mostre o que o assistente lançou'),
é ele que diz de que tipo era o rascunho" (`docs/insights.md:954-958`). Estado:
**implementado sem leitor**.

#### A42 — 1/9: a ordem do registro era regra, e nenhum teste a exercitava (`docs/insights.md:1285-1318`)

**O que se viu.** As habilidades novas (o saldo de um lugar, onde está um item,
produzir e mandar carga) entraram no **`phase1Skills`** com um comentário afirmando
que a ordem é semântica: **`stockAtPlace` antes de `stockOfInput`**, "porque 'quanto
tem na loja centro' casa com as duas e quem pergunta por um lugar não está
perguntando por um insumo chamado 'na loja centro'". O comentário estava certo. "O
teste ao lado dele perguntava **'o que** tem na loja centro' — frase que o
`stockOfInput` nem casa, porque o regex dele exige a palavra 'quanto'. A regra estava
escrita, e a suíte passava sem tocar nela" (`docs/insights.md:1286-1295`).

**Por que importa.** "Trocar a ordem das duas linhas no registro não quebraria nada —
e o efeito no aparelho é o assistente responder 'não encontrei "na loja centro" no
almoxarifado' com o saldo daquela loja na tela ao lado"
(`docs/insights.md:1297-1303`).

**O que mudou.** O teste passou a perguntar a frase ambígua — **"quanto tem na loja
centro"** —, "que é a única que distingue as duas ordens". E **quatro mutações novas
(30 no total)**, uma por regra que só existia em prosa: a ordem do registro, a recusa
da carga **antes** de preparar o rascunho, a suposição de um tacho dita em voz alta,
e a permissão de produzir **não** sendo a de despachar
(`docs/insights.md:1305-1310`).

**Uma segunda coisa, menor e cara.** O `mutate` se recusa a rodar com a árvore suja
nos arquivos que ele altera, "e a sessão anterior morreu no limite de uso com quatro
arquivos por commitar. A recusa está certa, mas o efeito prático é que **a barra
inteira fica inacessível até o commit acontecer**". A ordem correta ficou registrada:
**rodar `typecheck`, `lint` e `test` na árvore suja, commitar, e só então `mutate`,
`e2e`, `db:verify` e a proofgate** — "que leem `base..HEAD`, não o que está aberto no
editor" (`docs/insights.md:1312-1318`).

#### A43 — 2/9: a suíte segurava a frase e deixava o número passar (`docs/insights.md:1516-1539`)

**O que se viu.** O `mutate` acusou **dois sobreviventes**, os dois do commit da
véspera, "e os dois no mesmo formato: **a regra nova tinha teste, e o teste checava a
parte errada**" (`docs/insights.md:1517-1518`).

1. **O consumo do assistente.** "Produzi 480 picolés" passou a debitar insumo
   proporcional ao que saiu em vez de um tacho suposto, e o teste **exigia a frase
   "pelo que saiu" no texto**. "Trocar `units / porTacho` por `1` mantém a frase
   intacta: o texto continua dizendo que contou pelo que saiu, enquanto o rascunho
   debita um tacho inteiro. **Duzentos e três testes verdes, e o que eles seguravam
   era o aviso, não a conta.**" O teste agora **aplica o rascunho e confere o número
   gravado** (`docs/insights.md:1520-1525`).
2. **O empate de nomes.** "Com a grade linha × tipo × sabor, 'morango' alcança **doze
   produtos**, e `findByName` passou a devolver **nulo** em vez do nome mais curto —
   que era sorteio disfarçado de esperteza. Nenhum teste tinha dois candidatos: os do
   arquivo têm um 'morango' só, então o empate nunca acontecia e a volta ao
   comportamento antigo passou muda" (`docs/insights.md:1527-1531`).

**O padrão.** "Quando uma regra muda de comportamento, o teste que sobrevive à
mudança costuma ser o que olha para o **texto** — porque texto é o que o autor acabou
de escrever e tem fresco na cabeça. O número fica para depois, e depois não vem. Vale
a pergunta na revisão: *este teste falharia se a conta estivesse errada e a frase
certa?*" (`docs/insights.md:1533-1539`)

#### A44 — 1/9: o app pedia 25000 para quem comprou "saco 25 kg" (`docs/insights.md:845-879`)

**O que se viu.** O campo "Quanto vem dentro" tinha **`placeholder="25000"`**. "O
dono da fábrica sabe que comprou um **saco de 25 kg** — o app pedia que ele
convertesse para gramas." Lei 1 quebrada no lugar mais visível, "e o dado já estava
na tela — a pessoa acabou de escrever 'saco 25 kg' no campo de cima"
(`docs/insights.md:847-856`).

**O que mudou.** **`src/domain/measure.ts`**, "deliberadamente minúsculo: massa e
volume nas duas escalas que uma fábrica escreve, e mais nada. Digitar a embalagem
preenche o fator, **e só um campo que a pessoa não tocou**". O que não dá para ler com
certeza fica **em branco** em vez de virar chute (`docs/insights.md:858-865`):

| Caso ambíguo | Por que fica em branco |
|---|---|
| "balde" | sem tamanho |
| "caixa 6 x 500 ml" | dois números |
| unidade desconhecida | não há como converter |
| fração de unidade base | "0,0025 kg são 2,5 g, e arredondar isso caladamente põe um fator errado embaixo de todo custo daquele insumo para sempre" |

Provado no navegador (**12/12 no e2e**) e com duas mutações novas (**23 no total**) —
"e a segunda **sobreviveu na primeira tentativa**, o que é o portão fazendo o trabalho
dele. Meu exemplo de ambiguidade era 'caixa 6 x 500 ml', e ali o primeiro número vem
com 'x', que não é unidade conhecida: a função caía em nulo por outro caminho, não
pela regra que eu queria provar. O caso perigoso é aquele em que os **dois** números
são legíveis — **'pacote 500 g 12 unidades'** — e é esse que o teste afirma agora"
(`docs/insights.md:867-873`).

**Achado de lambuja não consertado sozinho:** dois controles na mesma tela atendem
por **"Embalagem"** — o tipo do insumo (palito, saquinho) e o campo da embalagem de
compra (saco 25 kg). "Foi o Playwright que reclamou, e ele estava certo: se a
ferramenta não distingue, uma pessoa de luva também não. Renomear é tom de voz, e tom
de voz é decisão do dono" (`docs/insights.md:875-879`).

---

### 30.9 Ferramenta: barra de verificação, guardas e mutação

#### A45 — 1/9: a suíte de navegador estava testando o build de ontem (`docs/insights.md:97-108`)

**O que se viu.** `e2e/flow.mjs` **só exportava a versão web se `dist` não
existisse**. "Com a pasta em cache, uma tela nova nunca entrava no pacote — e a suíte
passou **8/8** contra um build que não continha a mudança"
(`docs/insights.md:99-102`).

**Por que é o pior tipo de defeito.** "Um teste que falha avisa. Um teste que passa
pelo motivo errado é indistinguível de sucesso" (`docs/insights.md:104-105`).

**O que mudou.** "Exporta sempre, a não ser que alguém peça reúso em voz alta com
**`E2E_REUSE_BUILD`** — que é o caso para o qual o atalho existia de verdade: iterar
nas próprias checagens" (`docs/insights.md:106-108`).

#### A46 — 1/9: doze funções exportadas que ninguém chamava, e nenhuma tinha teste (`docs/insights.md:759-798`)

**O que se viu.** Varrendo o que o domínio exporta contra o que as telas chamam,
**doze exports** não tinham **nenhum** chamador — "nem em tela, nem em script, nem em
teste". Entre eles **`balanceAt`** (o saldo num instante, que a excursão de
temperatura vai precisar), **`daysOfCover`** (a frase que manda produzir) e
**`observedLeadTimeDays`** (o "promete três dias e entrega em seis")
(`docs/insights.md:760-765`).

"Um deles quase me assustou: **`connectionPragmas`**. Se os PRAGMAs nunca fossem
aplicados, o aparelho rodaria **sem chave estrangeira**, e a ordem de exclusão da tela
de ajustes depende disso. Conferido: **os PRAGMAs rodam na linha 358**. O export é que
não servia para nada" (`docs/insights.md:766-770`).

**Por que importa.** "Não eram descuido — cada uma carrega uma decisão já tomada, com
docblock explicando o porquê. O defeito é outro: **nunca foram executadas.** Uma
função exportada e documentada lê como capacidade, e quem for ligá-la a uma tela herda
uma resposta que ninguém viu sair" (`docs/insights.md:772-777`).

**O que mudou** (`docs/insights.md:779-793`):

| Destino | Funções | Razão |
|---|---|---|
| **Apagadas (3)** | `addCents` (é `a+b` com tipo), `baseUnitTier` (constante disfarçada de função), `connectionPragmas` | triviais ou vazias |
| **Tinha chamador afinal (1)** | `purchaseToBaseUnits` | estava **duplicada dentro da tela de compra, digitada à mão** (`Math.round(packs * factor)`): "duas implementações da mesma regra concordam até alguém corrigir uma delas, e aí não há como dizer qual número está certo". A tela passou a chamar a função |
| **Ganharam teste (8)** | as restantes | arquivos dedicados para `cost.ts`, `ledger.ts` e `units.ts`, "que **não existiam**: fundação exercitada só de esguelha por `pipeline.test.ts`" |

"**De 118 para 131 testes**, e quatro mutações novas (**21 no total**) para provar que
os testes novos mordem: cobertura infinita quando nada sai, o saldo 'às 3h' perdendo o
movimento das 3h em ponto, hierarquia que começa na caixa, e multiplicação de dinheiro
cortando em vez de arredondar" (`docs/insights.md:795-798`).

#### A47 — 1/9: um arquivo de teste inteiro que nunca rodava (`docs/insights.md:799-822`)

**O que se viu.** "Escrevi `src/layers.test.ts`, rodei a suíte, e o total **não se
moveu**: **131 antes, 131 depois**. O script era `tsx --test src/**/*.test.ts`, **sem
aspas**. O shell expande antes do runner ver, e sem `globstar` ele lê `**` como **um
nível só**. Todo arquivo de teste em `src/algo/x.test.ts` rodava; um em
`src/x.test.ts` não existia para a suíte" (`docs/insights.md:801-805`).

**Por que importa.** "Teste que não roda é indistinguível de teste que passa. Não há
vermelho, não há aviso, e o número no fim da execução parece uma promessa cumprida.
Foi só porque eu contei que apareceu — e contar não é hábito, é sorte"
(`docs/insights.md:807-810`).

**O que mudou.** O glob entrou **entre aspas** e passou a ser expandido pelo node, que
entende `**` em qualquer profundidade: **131 → 134 testes**, "com os dois que eu tinha
acabado de escrever mais o pino que fixa as aspas, porque as aspas **são** o defeito".
E virou guard na proofgate — **`47-unquoted-globstar`** — "já que isso vale para
qualquer repositório JS" (`docs/insights.md:811-815`).

**E o que a busca que gerou tudo isso encontrou:** "que **só `src/data` fala SQL** —
domínio, telas, assistente e sincronização estão limpos. A promessa da fundação ('o
assistente nunca escreve consulta própria; chama as mesmas funções que as telas') se
sustenta hoje, e agora tem teste, com um controle junto: se as consultas saírem de
`src/data`, o teste que as proíbe em outro lugar deixaria de provar coisa alguma, e é
o controle que avisa" (`docs/insights.md:817-822`).

#### A48 — 2/9: a lista escrita à mão protege só o que já existia (`docs/insights.md:1541-1550`)

**O que se viu.** `src/layers.test.ts` varria
**`['app', 'src/domain', 'src/assistant', 'src/components', 'src/sync']`** — uma lista
digitada. "Criei `src/weather/`, e a checagem continuou verde sem nunca ter aberto um
arquivo dela. **Uma regra que enumera o que fiscaliza protege o código velho, que não
é o que quebra**" (`docs/insights.md:1543-1547`).

**O que mudou.** "Agora as pastas saem de **`readdirSync`**: tudo em `src` menos a
camada de dados, mais `app`. Pasta nova nasce dentro da regra sem ninguém lembrar de
escrevê-la" (`docs/insights.md:1547-1550`).

#### A49 — 1/9: a forma comum dos três defeitos silenciosos (`docs/insights.md:824-843`)

**O que se viu.** Três achados do dia têm a mesma forma — o marcador
`proofgate-allow` que não suprimia, a fila reproduzida como superusuário que não
exercitava política nenhuma, e o `**` sem aspas que pulava um arquivo de teste
inteiro: "nenhum é um erro de cálculo. Todos são **um mecanismo reportando sucesso sem
ter feito o trabalho**" (`docs/insights.md:825-831`).

**Com essa lente, o resto da barra** (`docs/insights.md:832-837`): a `db:verify` está
disciplinada (**`set -euo pipefail`** mais **`fail()`** explícito: comando que falha
aborta). O `mutate` "conta como sobrevivente a mutação cujo trecho sumiu, o que é o
comportamento certo". **O e2e tinha o buraco:** "se nenhuma checagem se registrasse —
um deslize de sintaxe, um merge ruim — ele imprimia **`0/0 passaram`** e saía com
sucesso".

**O que mudou.** "Suíte vazia agora é falha, com a razão escrita na tela. Provado
esvaziando o registro de checagens: código de saída **1**, não zero. Medi errado na
primeira tentativa (peguei o **`$?` do `tail`** em vez do `npm`) — e 'imprime a
mensagem mas sai zero' seria exatamente o defeito que eu estava consertando, o que
torna a medição errada pior que não medir" (`docs/insights.md:839-843`).

#### A50 — 1/9: o marcador que não suprime nada (`docs/insights.md:598-616`)

**O que se viu.** `proofgate-allow` tinha sido escrito **três vezes em linhas de
comentário**, acima do código apontado. "O portão filtra
**`if (l !~ /proofgate-allow/)`** sobre a própria linha adicionada: marcador em
comentário vizinho não suprime coisa alguma. Os três liam como 'já justificado' e o
portão continuava contando ⚠️ — ninguém percebeu porque o resumo só mostra o número"
(`docs/insights.md:600-604`).

**Por que importa.** "É a mesma família do teste que passa pelo motivo errado: um
sinal de 'resolvido' que não está ligado a nada. Pior que o alerta ignorado, é o
alerta que alguém acredita ter tratado" (`docs/insights.md:606-609`).

**O que mudou.** "Onde o marcador era prosa, virou verificação: **`ident()`** em
`scripts/device-session.ts` recusa qualquer nome de tabela ou coluna que não seja
identificador simples, antes de entrar no SQL — provado quebrando
(**`refusing to build SQL around an identifier like "x; drop table movements"`**).
Onde o risco era mesmo inexistente (uma `Rate` impressa com `toFixed`, fracionária por
fundação), o marcador foi para a linha certa. Nenhuma justificativa ficou em
comentário fingindo suprimir" (`docs/insights.md:611-616`).

#### A51 — 1/9: o aviso que errava sempre (`docs/insights.md:693-717`)

**O que se viu.** Toda execução do portão trazia a mesma ⚠️: **"manifesto mudou sem o
lockfile"**. "Eu justificava em prosa toda vez — rodei `npm install
--package-lock-only`, o lockfile não muda, segue o jogo. **Justificar duas vezes é
sinal; justificar cinco é dívida.**" A causa: "o guard testava se a linha adicionada
**parecia** uma dependência: aspas, circunflexo, til. **Em JSON toda linha parece.**
Acrescentar o script `mutate` ao `package.json` exigia lockfile novo, e nenhum
lockfile poderia mudar" (`docs/insights.md:694-701`).

**Por que importa.** "É a Lei 7 aplicada à minha própria ferramenta: alerta inventado
ensina a ignorar alerta. Um aviso que erra sempre não custa só o tempo de conferir —
ele treina a passar os olhos por cima da lista, e é lá que o aviso verdadeiro vai
estar um dia" (`docs/insights.md:703-707`).

**O que mudou.** "O guard passou a ler os blocos que de fato decidem resolução —
**`dependencies`, `devDependencies`, `peer`, `optional`, `overrides`, `resolutions`,
`require`** — nas duas revisões e comparar; iguais, acabou. Onde não há parser de JSON,
cai no heurístico antigo em vez de chutar. Com teste dos dois lados: script trocado
passa, versão bumpada com lock velho continua avisando"
(`docs/insights.md:709-713`).

**E o portão ficou limpo pela primeira vez neste projeto** — "zero ⚠️, zero ❌. Que é o
estado em que ele volta a significar alguma coisa" (`docs/insights.md:715-717`).

#### A52 — 1/9: o script que quebra o código de propósito deixou um pedaço quebrado no disco (`docs/insights.md:998-1021`)

**O que se viu.** O hook de fim de turno acusou `src/domain/recipe.ts` modificado. "O
diff era uma **mutação do próprio `mutate`**: o guarda de ciclo de receita trocado por
**`if (false)`**. Alguma execução foi interrompida, o `finally` não rodou, e a mutação
ficou no disco" (`docs/insights.md:999-1002`).

**Por que é o pior lugar possível.** "No momento em que apareceu, um build de APK
estava começando a empacotar **exatamente esse diretório**. Se tivesse chegado na
tarefa de bundle, o aplicativo sairia com o guarda de ciclo desativado — a receita que
se referencia trava o app em vez de recusar, que é literalmente o dano descrito na
própria lista de mutações" (`docs/insights.md:1004-1010`).

**O que mudou.** "`finally` cobre exceção e **não cobre SIGINT/SIGTERM**, que é como
um processo de fundo morre. Agora há tratador para os três sinais mais
**`process.on('exit')`**, com a restauração idempotente. E, antes de começar, o script
**recusa rodar** se a árvore já estiver suja num arquivo que ele mexe — porque seguir
em frente sobrescreveria a evidência de que a execução anterior morreu no meio.
Provado: sujei um arquivo de propósito e ele parou na hora, sem tocar em nada"
(`docs/insights.md:1012-1018`).

**A disciplina que faltou:** "disparei um build a partir de uma árvore suja sem
conferir. O `git status` custa um segundo e teria mostrado"
(`docs/insights.md:1020-1021`).

#### A53 — 1/9: o parser do meu próprio guarda lia só metade do esquema (`docs/insights.md:1110-1130`)

**O que se viu.** Foram acrescentados **`movement_group_id`** e
**`counterpart_location_id`** ao aparelho por uma migração nova (**V6**) e "o guarda
que eu tinha escrito uma hora antes falhou dizendo que `counterpart_location_id`
**continuava ausente**. Estava lá". Causa: "o parser lia só o `CREATE TABLE` e
ignorava os `ALTER TABLE` dos passos seguintes — a mesma cegueira que o lado do
servidor, no mesmo arquivo, trata desde o começo (**'creates, then adds, then
drops'**). Escrevi o guarda novo sem copiar a lição que já estava dez linhas acima"
(`docs/insights.md:1112-1118`).

**Por que quase passou.** "Se eu tivesse escrito a migração **antes** do guarda, ele
teria nascido **verde e cego**: reportando lacunas fechadas para sempre, ou pior,
deixando de reportar as reais. Foi a ordem — guarda primeiro, migração depois — que o
denunciou. Não foi cuidado meu" (`docs/insights.md:1120-1124`).

**O que mudou.** "O parser aplica os `ADD COLUMN` e `DROP COLUMN` sobre o resultado do
`CREATE`. E a lista de lacunas conhecidas passou a **apodrecer em voz alta**: entrada
que afirma uma falta já fechada agora quebra o teste, porque uma lista mentindo sobre
uma ausência deliberada é a mesma família do marcador que não suprime nada"
(`docs/insights.md:1126-1130`).

---

### 30.10 CI, APK e entrega

#### A54 — 1/9: afirmei que o link funcionava depois de testá-lo por dentro (`docs/insights.md:1046-1074`)

**O que se viu.** O APK foi publicado como release, verificado pela API com o sha256
certo, e o dono foi avisado de que podia baixar. "Ele tentou: **404**"
(`docs/insights.md:1047-1050`).

**A causa.** "O repositório é privado, e artefato de release privado exige sessão
logada. Meu `curl` respondia 200 porque **o proxy deste ambiente injeta credencial** —
eu testei por um caminho autenticado e concluí sobre um caminho anônimo. É exatamente
o superusuário que ignora a política, com outra roupa: verificar por dentro e afirmar
sobre fora" (`docs/insights.md:1051-1056`).

**O que mudou — e nenhuma das duas coisas é "prometer conferir melhor".**

O APK carregava **quatro arquiteturas**: **23,8 MB de `x86` e 23,2 de `x86_64`**, que
só existem em emulador — "**47 dos 110 MB** eram peso morto para qualquer telefone".
Agora compila só **`arm64-v8a`**: **47 MB, em 3 min 29 s**, contra 110 MB e vinte
minutos (`docs/insights.md:1058-1063`).

E a compilação **saiu da Expo e foi para o CI do GitHub**, com **três conferências
antes de publicar** (`docs/insights.md:1064-1069`):

| Conferência | Motivo |
|---|---|
| assinatura pelo **`apksigner`** | "APK sem assinatura não instala, e o erro no celular não explica nada" |
| **bundle JS** tem de estar dentro | "sem ele o app abre em tela branca" |
| contagem de arquiteturas tem de ser **um** | "senão o ganho de tamanho se perdeu no caminho" |

**Armadilha anotada:** "o APK local é assinado com **chave de debug** e o da Expo com a
**chave do EAS**. Assinaturas diferentes fazem o Android **recusar instalar um por cima
do outro** — é preciso desinstalar antes, e isso apaga os dados locais"
(`docs/insights.md:1071-1074`).

#### A55 — 1/9: o caché que só existiria se a compilação já tivesse cabido (`docs/insights.md:1320-1362`)

**O que se viu.** Duas execuções do APK morreram dizendo **`cancelled`** — "a palavra
que o GitHub usa quando o `timeout-minutes` mata o job, e que não distingue 'travou'
de 'demorou'". Lendo o log até o fim: "aos **26 minutos** começa
**`java.lang.OutOfMemoryError: Metaspace`**, repetido por **treze minutos**, e depois
**vinte minutos sem uma linha nova** até o relógio matar. Não era lentidão. Era o
Gradle sem memória, batendo a cabeça em silêncio"
(`docs/insights.md:1321-1326`).

**De onde vinha o teto.** Do `android/gradle.properties` que o `expo prebuild` gera:
**`-Xmx2048m -XX:MaxMetaspaceSize=512m`**. "O runner tem 16 GB. **O limite era do
arquivo gerado, não da máquina** — e como `android/` é ignorado pelo git, ele não
aparece em nenhum diff: se regenera do zero a cada execução, sempre igual, sempre
pequeno" (`docs/insights.md:1328-1332`). *(A afirmação "16 GB" era leitura errada de um
comentário — desmentida no item A57.)*

**E embaixo disso, um nó.** "O passo de caché era o **`actions/cache@v4`** inteiro, que
só grava no *post* de um job que terminou. **Job morto por timeout não grava.** Então a
execução seguinte também começava fria, também não cabia na hora, também era morta —
**o caché que faria a compilação caber só existiria se ela já tivesse cabido**. O
comentário no arquivo prometia 'a segunda execução passa a levar minutos', e não havia
segunda execução possível. **Duas horas de runner queimadas** provando isso"
(`docs/insights.md:1334-1341`).

**Por que importa além do APK.** "É a Fundação da capa aplicada a CI: o número que o
dono ia usar ('não dá para gerar o instalador') estava errado, e a causa não estava no
lugar onde a mensagem apontava. **Um limite de tempo é teto, nunca explicação**"
(`docs/insights.md:1343-1348`).

**O que mudou — três coisas no `build-apk.yml`** (`docs/insights.md:1350-1358`):
memória de verdade para o Gradle (**`-Xmx6g -XX:MaxMetaspaceSize=2g`**), com **`grep`
conferindo que o `sed` casou** — "se o Expo renomear a chave numa versão futura, o
passo falha na hora em vez de a compilação morrer igual daqui a meses";
**`cache/restore` e `cache/save` separados**, com o save em **`if: always()`** e a
chave carregando o **`run_id`**, "para que cada tentativa deixe para a próxima o que já
compilou"; e o comentário do `timeout-minutes` dizendo o que ele é.

**O que ficou para a proofgate:** "'Job com `timeout-minutes` usando `actions/cache@`
inteiro' é padrão que um script pega: o caché nunca grava quando o relógio mata"
(`docs/insights.md:1360-1362`).

#### A56 — 2/9: corrigi a fome do APK e matei a máquina de indigestão (`docs/insights.md:1363-1399`)

**O que se viu.** "A dose veio de um comentário, não de uma medição." O diagnóstico do
Metaspace estava certo — "a compilação foi de **26 minutos para 35** e passou por
bundle, Kotlin, dex, tudo o que nunca tinha alcançado, sem um único
`OutOfMemoryError`". Mas: "eu escrevi `-Xmx6g` porque li 'o runner tem 16 GB', e **eu
nunca conferi isso**. Às 00:05 o log diz outra coisa — **`The runner has received a
shutdown signal`**, depois de nove minutos sem uma linha. Não é o Gradle morrendo: é a
máquina inteira. **O Gradle não é a única JVM ali**; o compilador do Kotlin, o R8 e o
aapt2 sobem as suas, e o que precisa caber é a soma"
(`docs/insights.md:1365-1374`).

**O que mudou.** "Trocar uma adivinhação por outra maior não é conserto. Agora o passo
**lê a RAM** (**`free -m`**), tira **metade com piso e teto**, imprime **`nproc`** e
**`free -h`** no log, e **limita também a JVM do Kotlin**. O número deixou de ser
opinião" (`docs/insights.md:1375-1378`).

**E o `if: always()` tem borda.** "Cobre passo que falha e job cancelado — **não cobre
a máquina sumir**. Nesta execução o passo apareceu como **`skipped`**, junto com todos
os post-steps: nada roda num runner que morreu"
(`docs/insights.md:1380-1385`).

**O terceiro erro, pego antes de subir.** "Eu ia acrescentar `kotlin.daemon.jvmargs`
com `echo >>`, e o `gradle.properties` que o prebuild gera **termina sem quebra de
linha**: o resultado seria
**`expo.inlineModules.watchedDirectories=[]kotlin.daemon.jvmargs=-Xmx1g`**, uma linha
que estraga as duas propriedades e não reclama de nada. Rodar o passo contra o arquivo
real, com **`bash -eo pipefail`** como o GitHub roda, mostrou isso em dois segundos.
Ler o YAML não teria mostrado nunca" (`docs/insights.md:1387-1393`).

**A regra.** "Quando a correção é um número que descreve a máquina — memória,
paralelismo, timeout — o certo é **a máquina responder, não eu**. E quando o passo é
shell, ele **se roda antes de subir**: três defeitos nesta sessão vieram de texto que
parecia certo lido" (`docs/insights.md:1395-1399`).

#### A57 — 2/9: 7938 MB, e o passo que sai verde falhando (`docs/insights.md:1401-1432`)

**O resultado.** "O APK saiu: **`norva-arm64.apk`, 46,5 MiB**, no release
**`apk-0.2.0`**, compilado de **`4634c48`** em **27 minutos**"
(`docs/insights.md:1402-1404`).

**O número era 7938 MB, não 16 GB.** "O passo que mede imprimiu **`nproc` = 2** e
**`Mem: 7.8Gi`**. Ou seja: o `-Xmx6g` que eu tinha escrito pedia **76% da RAM da
máquina inteira** para uma JVM só, com o Kotlin, o R8 e o aapt2 ainda por vir. O
comentário que eu li dizia 16 GB e **estava errado desde antes de mim** — runner de
repositório privado é **2 núcleos e 7,75 GB**. Medir custou uma linha de shell;
acreditar custou uma execução de 35 minutos e um runner morto"
(`docs/insights.md:1406-1411`).

**E o caché continuou não gravando — por outro motivo.** "O log diz
**`zstd: error 70 : Write error : cannot write block : No space left on device`**. O
**`actions/cache/save` não falha quando não consegue gravar**: ele emite
**`##[warning]`** e sai verde. O job inteiro aparece bem-sucedido, o passo do caché
aparece bem-sucedido, e o caché não existe. Se eu tivesse olhado só a bolinha verde
teria dito ao dono que a próxima compilação seria rápida — **pela terceira vez a mesma
promessa, e pela terceira vez falsa**" (`docs/insights.md:1413-1420`).

"É a Lei da Inteligência do lado de dentro: **erro se impede, não se reclama** — e um
passo que 'reclama e passa' é pior que um que falha, porque ensina a confiar na cor. O
conserto é **abrir espaço antes** (o runner traz .NET, Swift, GHC e CodeQL que não
compilam APK nenhum), mas a lição que fica é de leitura: **em CI, verde é convite para
ler o log, não substituto**" (`docs/insights.md:1422-1426`).

**O padrão nas três execuções.** "Toda vez a causa real estava a uma linha de distância
no log, e toda vez o resumo do GitHub dizia outra coisa: **`cancelled`** para falta de
Metaspace, **`failure`** para a máquina morrendo, **`success`** para um caché que não
gravou. O que o painel mostra é o **desfecho**, e desfecho não é causa"
(`docs/insights.md:1428-1432`).

#### A58 — 2/9: o caché quente, medido — sete minutos, não "minutos" (`docs/insights.md:1434-1469`)

**O que se viu.** "A execução 6 é a primeira que podia restaurar o que a 5 gravou, e no
mesmo commit (**`1b4b749`**), então o número finalmente é comparável"
(`docs/insights.md:1436-1439`).

O que o log diz: **`Cache restored from key: gradle-Linux-27906c7d…-33576896419`** —
**1 767 734 217 B**, "os **1,65 GiB** que a execução 5 escreveu, achados pelo
**`restore-keys`** e não pela chave exata". O passo "Abrir espaço em disco" repetiu o de
sempre: **13 GB livres antes, 25 GB depois** (`docs/insights.md:1441-1444`).

**O número prometido, medido** (`docs/insights.md:1446-1451`):

| Medida | Frio | Quente |
|---|---|---|
| passo "Compilar, só arm64" | **24 min 13 s** | **16 min 53 s** (−440 s, −30%) |
| job inteiro | **25 min 52 s** | **18 min 59 s** |
| configuração do Gradle | 79 s | 21 s |
| até a primeira tarefa de CMake | 254 s | 109 s |

**E a linha que desmente a leitura fácil.** "As duas execuções terminaram com
**`871 actionable tasks: 871 executed`**, **zero `FROM-CACHE`** e as mesmas **39
`UP-TO-DATE`**. Ou seja: **nenhuma tarefa foi reaproveitada.** O que `~/.gradle/caches`
guarda é artefato baixado e transformado, não saída de tarefa — **caché de dependência
não é caché de compilação**. Reaproveitar compilação exigiria **`org.gradle.caching=true`**
e guardar **`build-cache-1`**, o que **não foi feito nem medido**; escrever aqui que
'daria' seria a quarta promessa da série" (`docs/insights.md:1453-1460`).

**A regra.** "Um caché que restaura 1,65 GiB e um job 27% mais rápido parecem, juntos,
a prova de que o caché funcionou — e escondem que ele **não tocou na parte cara**. A
prova não é o tempo total nem a cor do job: **é a linha de contagem de tarefas**"
(`docs/insights.md:1462-1469`).

---

### 30.11 Método, portões e processo

#### A59 — 1/9: a fundação que eu violo é exatamente a que não está no `CLAUDE.md` (`docs/insights.md:462-494`)

**O que se viu.** Foi perguntado ao dono se o celular do chão de fábrica é
compartilhado ou pessoal, pedindo que ele escolhesse um. "Ele respondeu que isso é o
que ele repete desde o começo: **depende de quem usa, então vira opção.** É a fundação
F7 do plano — *'Depende' vira DADO, não código*" (`docs/insights.md:464-468`).

**O padrão, limpo demais para ser coincidência.** "**`grep -i depende CLAUDE.md`
devolve uma ocorrência, e é sobre outro assunto. F7 nunca entrou no `CLAUDE.md`** —
mora só no documento de plano, que é lido uma vez e não a cada sessão. E as **seis**
fundações que **estão** no `CLAUDE.md` são exatamente as que eu respeitei o dia inteiro
[…] **Seis por seis.** A que ficou de fora é a única que eu violei — e violei
perguntando" (`docs/insights.md:470-480`).

**O que mudou.** "F7 entrou nas fundações, com um acréscimo que o plano não tinha:
**vale também para as perguntas feitas ao dono.** Pedir que ele escolha entre A e B,
quando A e B são preferências de cliente, é empurrar para ele uma decisão que o produto
deveria absorver. **A pergunta certa é qual é o padrão — não qual é o único.**" E as
decisões dele foram escritas no `CLAUDE.md`, "porque decisão esquecida vira pergunta
repetida" (`docs/insights.md:482-490`).

**A lição sobre o próprio arquivo.** "**Regra que não está no `CLAUDE.md` não está em
lugar nenhum**, por mais bem escrita que esteja num plano. O teste é brutal e já foi
feito: seis das sete fundações estavam lá e valeram; a sétima não estava e não valeu"
(`docs/insights.md:492-494`).

#### A60 — 1/9: o portão de fase pegava a fase errada (`docs/insights.md:960-996`)

**O que se viu.** Um painel adversarial de quatro lentes contra a regra "nenhuma fase
começa antes da anterior estar em uso real": as quatro concordaram que **o portão não
tem predicado de saída nem prazo**. "Num projeto onde a `db:verify` tem seis garantias
nomeadas e a proofgate tem vinte e duas guardas numeradas, esse era o único portão sem
número e sem comando — e regra assim vira álibi, não disciplina"
(`docs/insights.md:961-966`).

"Pior: ele travava a coisa errada. Travava **o fiscal**, cujo layout quem decide é a
SEFAZ. E **não** travava o defeito que este repositório de fato tem — **coisa
construída sem chamador, quatro vezes**, nenhuma pega pelo número da fase"
(`docs/insights.md:967-970`).

**Duas afirmações do painel que se verificaram falsas** — registradas "porque relatório
é leitura de fora, não autoridade": que `main` teria um commit só (**tem 49**, com a
Fase 1 mesclada) e que o caminho de publicação do APK só existiria na branch
(**`.github/apk-release.txt` e `release-apk.yml` estão em `main`**)
(`docs/insights.md:971-975`).

**O achado que sobreviveu, e é arquitetural.** "**O saldo não filtra por local.**
`ensureLocation` cria uma única `location` cujo id é o próprio `company_id`, e as três
consultas de saldo somam **`WHERE company_id = ? AND item_id = ?`** — **zero
ocorrências de `location_id = ?` no repositório inteiro**. Está correto enquanto existe
um lugar só. A câmara fria é o segundo, e 'é saldo separado ou o mesmo saldo noutra
sala?' é pergunta de fábrica, não de código" (`docs/insights.md:977-983`).

**Segundo achado, latente.** "O servidor tem **`create table lots` desde a `0001`**, o
aparelho tem **`lot_id TEXT`** e **nenhuma tabela `lots`**, e o `serialize` manda
`lot_id`. Hoje é sempre nulo e nulo passa na chave estrangeira, então a fila não trava.
**Trava no dia em que a Fase 2 gravar o primeiro lote.** Pela regra nova, P1 decide:
ninguém chama, não entra agora — mas fica escrito, porque é barato fechar junto com a
produção e caríssimo descobrir depois" (`docs/insights.md:984-989`). *(Fechado no item
A16.)*

**O que mudou.** "O portão passou a ser **por item**, com três perguntas objetivas
(**quem chama · o que eu precisaria ver · custa um commit ou uma migração**), e passou
a **nomear o que o bloqueia, com data** — porque o bloqueio de hoje é um ato
administrativo, não falta de aprendizado" (`docs/insights.md:991-996`).

#### A61 — 1/9: três vezes acusei fronteira registrada de ser defeito (`docs/insights.md:1023-1044`)

**O que se viu.** Num mesmo dia foram apontadas como "violação de fundação" três
coisas que eram **decisão escrita** (`docs/insights.md:1024-1031`):

| Acusação | A decisão que existia |
|---|---|
| `UnitStepper` sem chamador | é componente **da Fase 2**, "e a tela de compra já dá a conversão por extenso" |
| `[por quê?]` ausente na home | "a conta abre em um toque, na receita" |
| assistente guardar **39 frases em português** | tem o raciocínio inteiro no topo de `src/assistant/index.ts`, inclusive a condição de quando deixa de valer: *"as respostas vão para o dicionário quando um modelo de linguagem fizer o casamento, nessa mesma mudança"* |

**Por que importa mais que o tempo perdido.** "No terceiro caso eu já tinha disparado
um workflow para preparar a correção, e já tinha dito ao dono que era defeito. Quase
'consertei' uma decisão que alguém tomou por um motivo que eu não tinha lido — e a
correção teria deixado o assistente respondendo em espanhol **sem entender espanhol**,
que é exatamente o resultado pior que a decisão evitava"
(`docs/insights.md:1033-1039`).

**O que mudou.** Regra nova no `CLAUDE.md`: "antes de chamar algo de defeito, procurar
a decisão — no docblock do próprio arquivo, no `docs/insights.md`, nas decisões do
dono. Havendo decisão escrita, o achado não é defeito: ou vira pedido de mudança para o
dono, ou não é nada. **O docblock do `index.ts` estava a um `grep` de distância nas
três vezes**" (`docs/insights.md:1041-1044`).

#### A62 — 1/9: empurrei duas vezes sem ler o portão (`docs/insights.md:880-900`)

**O que se viu.** "Não no código: em mim. Duas vezes hoje encadeei o commit numa linha
separada da verificação e empurrei sem olhar a saída — a primeira com o shellcheck
reclamando de um padrão redundante, a segunda com uma mutação **sobrevivente** que o
meu próprio `mutate` tinha acabado de imprimir. O CI pegou a segunda **três minutos
depois**, o que prova que o portão funciona e que o elo fraco é o operador dele"
(`docs/insights.md:881-886`).

**Por que importa.** "A barra deste projeto existe escrita há semanas, e escrita não
bastou: eu a li, concordei com ela, e furei duas vezes no mesmo dia. **Regra que
depende de atenção é regra que falha no dia cansado** — e o dia cansado é exatamente
quando o erro custa caro" (`docs/insights.md:888-892`).

**O que mudou.** "O **`push-guard`** da proofgate está instalado como hook
**`PreToolUse(Bash)`**: ele lê o comando **antes** do git, e recusa `git push` enquanto
não houver **veredito fresco e passante para o HEAD atual**. Também bloqueia
**`--no-verify`** e **`core.hooksPath`**, e explica que a tentativa foi vista — porque
um hook de git seria contornável por quem está com pressa, e quem está com pressa aqui
sou eu. Provado nos dois sentidos: veredito no HEAD libera, HEAD adiantado recusa com
**saída 2**" (`docs/insights.md:894-900`).

#### A63 — 2/9: o `/insights` ficou cego justamente onde o trabalho acontece (`docs/insights.md:1626-1660`)

**O que se viu.** O relatório veio vazio: **"0 messages across 0 sessions (1 total)"**,
com todas as seções dizendo "No data". Não é o normal: "em **1 de setembro às 15h48** o
relatório contou **27 mensagens e 14 commits**, e o de **2 de setembro à 1h35** contou
**16 mensagens**. O de hoje é o primeiro zerado" (`docs/insights.md:1627-1633`).

**E o dado existe.** "`usage-data/session-meta/` tem o arquivo desta sessão, gravado no
mesmo minuto do relatório: **68 minutos, 275 mensagens do assistente, 164 chamadas de
Bash, 2 commits**. A coleta funcionou; o que não aconteceu foi a análise —
**`usage-data/facets/` tem um arquivo, de 1 de setembro às 12h53**, e todo número do
topo do relatório é somado sobre as sessões analisadas"
(`docs/insights.md:1634-1638`).

**A causa provável.** "É uma sessão só, longa, retomada — o id **`3cd30dd5…`** é o
mesmo desde 1 de setembro e o transcrito já tem **37 MB**. O relatório chaveia por id
de sessão, e uma sessão que ele já analisou (ou grande demais para reanalisar) é
pulada" (`docs/insights.md:1640-1644`).

**Duas consequências práticas.** (1) "Enquanto o trabalho continuar dentro desta
sessão, `/insights` vai devolver nada — não é uma sessão sem atrito, é uma sessão
invisível. Para ter leitura de fora, o comando precisa ser rodado a partir de uma
sessão nova" (`docs/insights.md:1646-1649`). (2) "E mesmo funcionando, **ele nunca mediu
código**: os relatórios de 1 e 2 de setembro, os com dado, dizem **`+0/-0 Lines, 0
Files`**. O que ele mede aqui é conversa, atrito e ferramenta, não trabalho entregue"
(`docs/insights.md:1651-1654`).

**O que mudou.** Virou aviso escrito no `CLAUDE.md`, "porque a diretriz manda agir sobre
o que o relatório mostra — e um relatório que não vê o trabalho não é 'está tudo bem',
é **instrumento quebrado**. A regra do alerta inventado vale para as ferramentas
também: número que não mede nada ensina a ignorar o painel"
(`docs/insights.md:1656-1660`).

---

### 30.12 "Em aberto" ao fim da primeira metade (`docs/insights.md:542-576`)

Seção do próprio registro para "achados desta rodada que ainda não viraram mudança.
Ficam aqui até virarem" (`docs/insights.md:555`). Estado tal como escrito; vários foram
fechados por itens posteriores desta mesma metade, e isso está marcado.

| Item em aberto | Conteúdo transcrito | Estado |
|---|---|---|
| **O servidor está três migrações à frente do aparelho** | "As decisões do dono sobre identidade viraram esquema — estado de associação, código da empresa, modo de entrada no chão de fábrica, atribuição do relatório, e o aparelho como coisa cadastrada com responsável. Nada disso existe no SQLite do celular, e o guarda de acordo **não vê essa divergência**: ele compara o que o aparelho manda, e o aparelho não manda nenhuma dessas tabelas. É dívida consciente […] o **`movements.device_id`** já está escrito no serializador, **nulo**, para que o lugar onde o valor entra não dependa de alguém lembrar" (`docs/insights.md:544-553`) | **planejado**; `device_id` **implementado sem valor** |
| **Seis inteligências construídas e nunca chamadas** | **`daysOfCover`, `reorderPoint`, `observedLeadTimeDays`, `explodeRequirements`, `lotsPresentDuring`, `balanceAt`** "têm teste e não têm chamador" (`docs/insights.md:557-561`) | **implementado sem chamador**; `explodeRequirements` ganhou o primeiro chamador no item A7 |
| **A lista de compras não precisa da Fase 5** | "O plano a colocou lá porque a versão *automática* depende de plano de produção e histórico. Mas `explodeRequirements` sobre o estoque atual já responde hoje, com dados só da Fase 1: *'se eu fizer 3 tachos de cada sabor, o que falta comprar?'* Isso é simulação, não previsão" (`docs/insights.md:562-566`) | **planejado** |
| **"Apagar tudo" não tem lado servidor** | "O comando sobrevive à limpeza e o `serialize` o emite, mas o servidor não o recebe — então hoje um sync futuro traria de volta o que a pessoa mandou destruir. Construir isso exige decidir o que 'apagar' significa num servidor multiempresa: destruir o histórico daquela empresa, ou só marcar que aquele aparelho não quer mais o dado. A primeira é irreversível e o livro-razão recusa DELETE por desenho. **Não construo sem você escolher**" (`docs/insights.md:567-573`) | **decisão do dono pendente** |
| **O aparelho ainda não tem consumo nem perda** | "A contagem faz o saldo descer, mas a perda com motivo obrigatório continua sem existir, e sem ela toda diferença legítima vira 'inexplicada'" (`docs/insights.md:574-576`) | **NÃO IMPLEMENTADO** na data do registro; o consumo chegou com `recordProduction` (item A7) |

### 30.13 Inventário de peças sem chamador citadas na primeira metade

Consolidado dos itens acima, com o estado que o registro atribui a cada peça no ponto em
que a cita. Serve como lista do que **existia e não estava ligado a nada** — o defeito
que o registro chama repetidamente de "mecanismo que afirma e não está ligado a nada".

| Peça | Onde | Estado registrado |
|---|---|---|
| `src/domain/ledger.ts` | importado só por `app/foundation.tsx` (tela de vitrine) | sem chamador de produção; a tela foi apagada (A1, A34) |
| `movements.assistant_phrase` (+ índice `where assistant_phrase is not null`) | servidor, aparelho, serializador | **coluna com índice e sem nenhuma escrita**; ganhou escritor em A41 |
| `Draft.kind` | rascunho do assistente | **sem leitor**, mantido de propósito (A41) |
| `lots` (servidor, desde a `0001`) + `movements.lot_id` com índice parcial | servidor | **sem escritor** até A16 |
| `daysOfCover`, `reorderPoint`, `observedLeadTimeDays`, `lotsPresentDuring`, `balanceAt` | domínio | testadas, **sem chamador** (A46, 30.12) |
| `explodeRequirements` | domínio | sem chamador até `recordProduction` (A7) |
| `priceMove` | domínio | sem chamador, **não é duplicata** da tela de compra (A13) |
| `addCents`, `baseUnitTier`, `connectionPragmas` | domínio/dados | **apagadas** (A46) |
| `purchaseToBaseUnits` | domínio | tinha chamador **duplicado à mão** na tela de compra; a tela passou a chamar a função (A46) |
| `motion.settle`, `motion.press`, `motion.pressScale`, `motion.staggerMs` (`tokens.ts`) | tema | tokens **sem uso** fora do `PulseDot`; ganharam chamador com `Reveal`/`Touchable` (A35) |
| `UnitStepper` | componentes | sem chamador **por decisão** (componente da Fase 2) (A61) |
| `MissingRecipeError` | domínio | existia e **nada provava que disparava** (A10) |
| `Recipe.versionId` | domínio | **campo inexistente** apesar do docblock prometer; criado em A15 |

### 30.14 Contadores que a primeira metade registra

Números citados no próprio registro, úteis como marcos de crescimento da barra.

| Marco | Valor | Fonte |
|---|---|---|
| testes na revisão do Codex | 78 | `docs/insights.md:245-246` |
| testes quando `Math.floor` passou | 92 | `docs/insights.md:327` |
| testes antes/depois dos doze exports | 118 → 131 | `docs/insights.md:795` |
| testes antes/depois do glob sem aspas | 131 → 134 | `docs/insights.md:801, 811-813` |
| testes quando a frase segurava e o número passava | 203 | `docs/insights.md:1523-1525` |
| testes quando o `plural` perdeu o número | 218 | `docs/insights.md:1577-1578` |
| mutações no portão (primeira versão curada) | 13 | `docs/insights.md:355-358` |
| mutações após o teste de acordo entre esquemas | 15 | `docs/insights.md:407-409` |
| mutações após o guarda de coluna obrigatória | 17 | `docs/insights.md:537-539` |
| mutações após os testes dos oito exports | 21 | `docs/insights.md:795-798` |
| mutações após `measure.ts` | 23 | `docs/insights.md:867` |
| mutações após `register_input` | 25 | `docs/insights.md:931-932` |
| mutações após `assistant_phrase` | 26 | `docs/insights.md:950-952` |
| mutações após `recordCount(locationId)` | 27 | `docs/insights.md:1173-1174` |
| mutações após a ordem do registro do assistente | 30 | `docs/insights.md:1305-1310` |
| garantias do `db:verify` citadas | 5ª (compra/contagem/produção/recebimento), 4ª (RLS), 6ª (fila sob política, 4 afirmações) | `docs/insights.md:90-93, 418, 680-684` |
| saldo de referência da checagem 6 | **92.000** unidades base, média **0,5310** | `docs/insights.md:316-320, 683` |
| checagens de navegador (e2e) ao longo da metade | 8 → 9 → 12 → 14 | `docs/insights.md:100-101, 245-246, 867, 1491-1492` |
