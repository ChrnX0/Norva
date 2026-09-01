# Achados

Registro de coisas que ninguém tinha visto, e do que mudou por causa delas.

A regra está no `CLAUDE.md`: achado sem consequência não entra aqui. Cada linha
existe porque um arquivo foi editado. E "não achei nada" é entrada válida — não
se inventa achado para parecer diligente, pelo mesmo motivo que não se inventa
alerta.

---

## 2026-09-01 — o livro-razão existia em todo lugar menos onde os dados moram

**O que se viu.** A fundação nº 1 do projeto diz, em letra maiúscula, que não
existe campo `estoque_atual` e que saldo é a soma dos movimentos. O banco do
aparelho tinha onze tabelas e nenhuma delas era `movements`. O estoque morava em
`item_costs.on_hand_base_units`, um inteiro alterado por `UPDATE` a cada compra
— exatamente a coluna que a fundação proíbe, com um nome mais comprido.

**Por que passou despercebido.** A aritmética estava certa, as telas mostravam
números plausíveis e todos os testes passavam. O defeito não era visível olhando
o resultado; só aparecia perguntando **de onde o número vem**. O
`src/domain/ledger.ts` estava construído, testado e importado por um arquivo só:
`app/foundation.tsx`, a tela de vitrine. A fundação tinha virado demonstração.

**O que mudou.** Migração V3 do aparelho: tabela `movements`, saldo derivado da
soma, a coluna mutável apagada, e um backfill que transforma cada linha de nota
no movimento que ela sempre foi — mantendo o id da linha, para que repetir a
migração não dobre saldo nenhum. Quatro testes novos, incluindo um que sobe um
banco na versão anterior de propósito e prova que um celular que já tem notas
atravessa a atualização com o mesmo saldo.

---

## 2026-09-01 — o estoque só sabia subir

**O que se viu.** Aquela coluna era escrita por um caminho só: a compra. Nada
consumia, nada ajustava, nada conferia. O "quanto eu tenho" estava certo
exatamente uma vez, na manhã em que o saco chegou.

**Por que importa.** Número de almoxarifado que só cresce é pior do que nenhum,
porque as pessoas acreditam nele.

**O que mudou.** `recordCount()`, a contagem física, que não sobrescreve saldo —
grava a diferença como movimento próprio, de modo que a prateleira e o livro
passam a concordar sem que a discordância suma do registro. E uma contagem que
bate é gravada também, com diferença zero: uma prateleira que ninguém olha há
meses não pode ficar igual a uma conferida hoje de manhã.

---

## 2026-09-01 — a contagem estava sendo pedida com a resposta na tela

**O que se viu.** A tela do insumo mostra "Em estoque: 50.000 g" logo acima de
onde o campo de contagem ia entrar. O plano do projeto já tinha resolvido isso
para o Espelho da Loja — *a contagem é cega* — e a regra vale igual aqui: com o
número esperado à vista, a pessoa confirma a tela em vez da prateleira.

**O que mudou.** Abrir a contagem esconde o saldo e diz por quê. A checagem de
navegador afirma a ausência do número, não só a presença do campo.

---

## 2026-09-01 — o servidor recusaria a primeira coisa que o aplicativo grava

Três defeitos no esquema do Postgres, achados do mesmo jeito: escrevendo o
livro-razão do aparelho contra ele e perguntando, comando por comando, o que o
servidor faria com o que o celular manda. Nenhum deles é visível lendo um lado
só.

1. **Não havia palavra para "compra".** O enum `movement_kind` foi escrito da
   fábrica para fora — produção, transferência, venda, perda. Tudo estoque que a
   empresa já tem, se mexendo. Nada descrevia estoque chegando de fornecedor
   contra uma nota, que é o primeiro movimento que qualquer instalação real
   registra, porque uma fábrica compra açúcar antes de fazer qualquer coisa.
2. **Uma contagem que confere era recusada.** `check (quantity_base_units <> 0)`
   parece obviamente certo e é certo para todos os tipos menos um.
3. **O custo congelado de um grama de açúcar arredondava para zero.**
   `unit_cost_cents bigint` é uma taxa guardada como dinheiro — a disciplina
   `Cents`/`Rate` quebrada dentro do próprio esquema que a defende. Um saco de
   R$ 118 por 25 kg dá 0,472 centavo por grama, que como inteiro é 0. Todo
   insumo barato congelaria custo nenhum, e o relatório de margem em cima disso
   pareceria plausível.

**Achado de brinde:** a política de escrita é um `CASE` por tipo **sem `ELSE`**,
então um tipo novo no enum entra travado — ninguém pode gravá-lo. Falha fechada,
que é o lado certo, mas significa que acrescentar `'purchase'` sem mexer na
política daria ao aplicativo uma palavra que o banco ignora em silêncio.

**O que mudou.** Migrações `0007` e `0008`, e uma quinta garantia no
`db:verify`: uma compra é gravada, uma contagem vazia é guardada, uma produção
vazia continua recusada, e quem não tem `check_receipt` não assina recebimento.
A checagem foi vista falhando antes de ser aceita.

---

## 2026-09-01 — a suíte de navegador estava testando o build de ontem

**O que se viu.** `e2e/flow.mjs` só exportava a versão web se `dist` não
existisse. Com a pasta em cache, uma tela nova nunca entrava no pacote — e a
suíte passou 8/8 contra um build que não continha a mudança.

**Por que é o pior tipo de defeito.** Um teste que falha avisa. Um teste que
passa pelo motivo errado é indistinguível de sucesso.

**O que mudou.** Exporta sempre, a não ser que alguém peça reúso em voz alta com
`E2E_REUSE_BUILD` — que é o caso para o qual o atalho existia de verdade:
iterar nas próprias checagens.

---

## 2026-09-01 — a dívida que eu criei vinte minutos antes

**O que se viu.** A cláusula de pronto deste projeto diz que um módulo só está
concluído quando o assistente **sabe responder** sobre ele e **sabe preencher**
os registros dele. Ela existe para impedir exatamente um cenário: o assistente
que nasce ótimo e vai ficando para trás a cada módulo novo até virar mentira.

Eu tinha acabado de acrescentar o estoque real e a contagem, e não toquei no
assistente. Sete habilidades, e nenhuma sabia dizer *quanto tem* nem registrar
uma conferência. A dívida não veio de trás — veio de mim, na mesma rodada.

**Por que importa mais do que parece.** O achado não é "faltou uma função". É
que a regra não estava sendo aplicada a quem a escreveu. Auditar o código
antigo é fácil; auditar o próprio diff contra a regra do projeto é o que ela
pede de verdade.

**O que mudou.** Duas habilidades. `quanto tem de açúcar` responde a quantidade
**com a data da última conferência** — Lei 3, número nenhum aparece sozinho — e
diz na cara quando ninguém nunca conferiu, porque um saldo que só veio de nota
é outro tipo de número. E `contei 2 sacos de açúcar` preenche uma ficha e
**para**: ajuste de inventário está no piso que nenhum nível de autonomia
atravessa sozinho.

Um detalhe que valeu por si: **a quantidade não é segredo, o valor dela é.** A
linha "valor parado" só é montada para quem tem `view_cost` — não é omitida do
texto, é nunca construída. Quem não pode ver dinheiro recebe uma resposta que
nunca teve dinheiro dentro.

---

## 2026-09-01 — o guarda achou a mesma violação do outro lado, na primeira execução

**O que se viu.** Um relatório de `/insights` apontou que eu tinha consertado a
violação do livro-razão e não deixado nada impedindo ela de voltar. Estava
certo, e é metade do trabalho pela régua deste projeto: consertar uma vez vale
menos do que tornar difícil desfazer, porque um total guardado é sempre a opção
mais barata **no instante** em que alguém a escreve — uma coluna, um `UPDATE`,
nenhum `JOIN`.

Escrevi o guarda: um teste que varre o esquema do aparelho e um comando no
`db:verify` que varre o do servidor, procurando nome de coluna que signifique
"quantidade que alguém mantém atualizada".

**E ele mordeu na primeira execução.** O servidor tinha a coluna idêntica —
`item_costs.on_hand_base_units` — que eu tirei do celular e não olhei do outro
lado, na mesma rodada. Pior que duplicata: o gatilho a mantinha **só a partir
das notas**, contando chegadas e mais nada. Bastaria existir uma contagem, uma
perda ou uma produção para a coluna e o livro-razão responderem "quanto tem" com
números diferentes — e o custo médio ser calculado contra o errado.

**O que mudou.** Migração `0009`: o gatilho pergunta aos movimentos e a coluna
some. O que torna isso seguro é uma decisão já tomada no aparelho — a linha da
nota e o movimento dela dividem um id, porque são um fato visto duas vezes. O
gatilho exclui o próprio movimento da soma por id, então acerta se o movimento
chegou antes da linha, depois dela, ou ainda não chegou. Sem ordem para
depender, e uma reentrega não dobra nada.

**A lição que fica é sobre o guarda, não sobre a coluna.** Eu tinha acabado de
escrever quatro parágrafos sobre essa fundação e ainda assim deixei a violação
viva a um `SELECT` de distância. Achado não vira garantia enquanto não vira
teste.

---

## 2026-09-01 — a tela inicial respondia uma das três perguntas

**O que se viu.** A Lei da Inteligência é uma régua, não um lema: *toda tela
responde o que é normal ali, o que está diferente agora e qual é a próxima ação
provável — tela que não responde as três não está pronta.* Medindo a tela
inicial contra ela, ela respondia **uma**.

Pior, violava a Lei 3 no primeiro cartão que o dono vê. O custo por unidade
aparecia sozinho: **R$ 0,55**, sem nada ao lado. Cinquenta e cinco centavos não
é caro nem barato — é um número pedindo para ser acreditado, que é exatamente o
que este aplicativo diz não fazer.

**O que mudou.** A comparação já estava escrita no banco e ninguém tinha ido
buscá-la: toda nota lançada grava a taxa anterior do insumo. `ratesBefore()`
dobra o histórico de volta e a tela precifica os mesmos produtos duas vezes —
com o custo de hoje e com o de antes das últimas notas. O cartão passa a dizer
"▲ R$ 0,09 · custava R$ 0,64 antes das últimas compras", verificado no navegador
contra uma nota lançada de verdade.

Um detalhe que decide se o número é honesto: quando um insumo subiu **mais de
uma vez** na janela, vale a taxa anterior à **primeira** delas. Desfazer só o
último passo reportaria uma alta de 9% como se fosse 2% — é assim que uma
sequência de aumentos se esconde à vista.

**E a terceira pergunta continua sem resposta, de propósito.** "Qual é a próxima
ação provável" precisa de preço de venda (para sugerir repreço) ou de consumo
(para sugerir compra), e a Fase 1 não tem nenhum dos dois. Encher a tela de
"confira alguma coisa" seria o alerta inventado contra o qual a própria Lei
avisa. Fica em aberto até existir dado que sustente a sugestão.

---

## 2026-09-01 — a regra que avisa antes de gastar dinheiro morava no JSX

**O que se viu.** Uma varredura mecânica por funções do domínio sem chamador —
o mesmo padrão que já tinha entregado o livro-razão inutilizado — devolveu
quinze nomes. Antes de chamar isso de achado eu conferi um por um, e é aí que
estava a parte útil: `priceMove` **não** é duplicata da tela de compra. Ela
compara as duas últimas notas do passado; a tela compara a nota que está sendo
digitada. Perguntas diferentes.

O problema real era o outro lado. A tela decidia sozinha o que é um aumento
digno de aviso, com `0.05` e `-0.02` escritos **quatro vezes** dentro do JSX, a
mesma regra expressa de três jeitos — cor do cartão, sinal da etiqueta, texto da
etiqueta. Nenhum teste em lugar nenhum. É a regra que decide o que o dono é
avisado **antes de gastar dinheiro**, e ela morava na marcação.

**O que mudou.** `judgePriceChange()` devolve um veredito — `wellAbove`,
`smallChange`, `cheaper` — e os dois limiares passam a ser constantes com o
motivo escrito ao lado. O veredito **nomeia a chave do dicionário**, então a
tela continua dona das palavras nos três idiomas enquanto a regra fica num lugar
só, com teste que fixa as fronteiras exatas.

O teste também prende a assimetria, que era acidente e virou decisão: **precisa
de mais de 5% para alarmar e só 2% para dizer que está mais barato.** Os custos
de errar não são simétricos — alarme falso ensina a ignorar alarme, e aí o
verdadeiro chega e é ignorado junto. Boa notícia que vira ruído não custa nada.

**Sobre as outras catorze:** não são achado. `explodeRequirements`,
`reorderPoint`, `daysOfCover` e as de lote existem para fases que ainda não
foram construídas, e a fundação F8 do plano manda coletar o sinal antes de
ativar a inteligência. Construir adiantado ali é a regra, não a exceção.

---

## 2026-09-01 — seis defeitos que a minha barra inteira não podia ver

**O que se viu.** Uma revisão automática do Codex apontou seis coisas no PR.
Conferi uma a uma antes de aceitar qualquer uma, e **as seis eram reais** —
em código que passou por typecheck, 78 testes, lint, `db:verify` e nove
checagens de navegador.

O que importa não é a contagem, é o padrão: **cinco delas só existem no caminho
que nada exercita.** A fila de sincronização tem teste de ordem e de
idempotência, e nunca ninguém a reproduziu contra o esquema real do servidor.
Então a compra saía sem a linha da nota (e é a linha que dispara o gatilho de
custo no Postgres), a receita saía sem as linhas dela, o local ia com
`'storeroom'` onde o enum do servidor diz `store_room`, e o comando de "apagar
tudo" **se apagava**, porque o `outbox` está na lista de tabelas que a limpeza
esvazia — o aparelho ficava vazio, o servidor nunca ficava sabendo, e a próxima
sincronização traria de volta exatamente o que a pessoa mandou destruir.

Duas não eram de sync, e são as piores:

**Um jeito de inutilizar o celular.** `PRAGMA user_version` era escrito **depois**
da transação da migração. Um processo morto naquela fresta volta acreditando que
o passo não rodou e roda de novo — e um passo como `ALTER TABLE ... ADD COLUMN`
falha na coluna que já existe. Não uma vez: em toda abertura, para sempre, sem
porta de entrada. O pragma é transacional (provado), então agora o esquema e o
registro dele caem juntos ou não caem.

**A fundação do dinheiro, quebrada onde ela foi escrita.** O custo do tacho
arredondava **cada linha** antes de somar. Dez ingredientes de quatro décimos de
centavo somavam zero num tacho que custa quatro. É o mesmo defeito do bug da
polpa, de terno novo — e o `CLAUDE.md` diz, em letra maiúscula, *"só o valor
final arredonda, uma vez"*. Agora as linhas acumulam fracionário, o tacho
arredonda uma vez, e a repartição por maior resto faz o detalhamento somar
exatamente o número que ele explica. Um `[por quê?]` que não bate com a conta
acima dele é pior que nenhum.

**A conclusão desconfortável.** A barra de verificação deste projeto é boa e não
tinha como pegar nada disso. Ela exercita módulos e exercita o aplicativo, e o
que faltou é o terceiro: **reproduzir a fila contra um Postgres de verdade.**
Isso é dívida registrada, não conserto — e é a próxima coisa a construir antes
de ligar sincronização.

---

## 2026-09-01 — a média móvel tinha dois autores, e eles discordavam

**O que se viu.** A dívida escrita de manhã era construir o terceiro nível da
barra: reproduzir a fila do aparelho contra um Postgres de verdade. Foi
construída — uma sessão real roda no celular, a fila que ela produz passa pelo
mesmo `serialize` que a sincronização vai usar, e o SQL entra no servidor com
`ON_ERROR_STOP`.

**Antes de rodar, comparar os dois esquemas coluna a coluna já achou seis
divergências**, e uma delas é defeito de produto: `recipe_lines` não tinha
`position` no servidor, então a ordem em que a pessoa escreveu os ingredientes
se perderia no sync — e ficha técnica é lida de cima para baixo, com alguém
trabalhando. As outras cinco: `supplier_name` sem destino, `created_by` e
`recorded_by` obrigatórios sem equivalente no aparelho, `active` inteiro contra
booleano (o insert simplesmente falha), `packaging` texto contra `jsonb` (esse
não falha — grava uma string entre aspas onde deveria haver estrutura, e nada
reclama), e `freight_cents not null default 0` anulado porque `select *` manda
NULL para campo ausente e derruba o default do servidor.

**E a primeira execução real achou o que nenhuma leitura acharia.** Aparelho
0,5310, servidor 0,5605. A causa: **`item_costs` é valor derivado com dois
autores.** O aparelho calcula a média para sobreviver offline, o servidor
recalcula sozinho no gatilho, e os dois se sobrescrevem. Pior: a fila guarda
**id de linha, não o valor** da época, então a reprodução reenvia sempre o
estado atual — e o gatilho misturou uma nota nova contra uma média que só
passou a existir depois dela.

**O que mudou.** `item_costs` deixou de viajar. Valor derivado tem um dono só: o
que atravessa é a nota, e a média é o que cada lado conclui dela, pela mesma
regra. O serializador devolve `derived` em vez de silêncio, porque escrita que
nunca chega é idêntica a escrita que chegou.

**A garantia que sobra é a mais forte do projeto:** a checagem 6 compara **duas
implementações independentes da média móvel** — a de TypeScript no celular e a
de plpgsql no Postgres — e exige que fechem o mesmo número. Hoje fecham: saldo
92.000, média 0,5310.

---

## 2026-09-01 — a regra da capa não estava presa em lugar nenhum

**O que se viu.** Auditoria por mutação: introduzir defeitos plausíveis no
domínio do dinheiro e ver se a suíte morde. Seis defeitos, cinco pegos na hora
— e **um passou por noventa e dois testes sem que ninguém percebesse.**

`amountOf` trocando `Math.round` por `Math.floor`. Ou seja: *o* ponto de
arredondamento do sistema inteiro, aquele que o `CLAUDE.md` anuncia em letra
maiúscula — *"só o valor final arredonda, uma vez"* — não tinha nada segurando a
**direção** desse arredondamento.

Passou porque todo fixture caía em centavo exato, então piso e arredondamento
davam o mesmo número. A regra da capa do projeto estava sustentada por
coincidência aritmética.

**Por que a direção importa.** Piso derruba uma fração de centavo em toda linha,
sempre para o mesmo lado, e o erro se acumula numa direção só ao longo de uma
receita: custo sai baixo, margem sai alta, e alguém precifica abaixo do custo
sem que um único número pareça errado. É a mesma família do bug da polpa.

**O que mudou.** `src/domain/money.test.ts`, prendendo a direção nos dois
sentidos — piso e teto agora derrubam a suíte — com o caso que faltava: meio
centavo. E de quebra o que nunca some nem inventa centavo na repartição, e que
taxa continua fracionária.

**Segunda rodada, no resto do domínio:** mais dois passaram. O ponto de pedido
arredondando para baixo — que pede menos do que o consumo, e é a única direção
em que ele nunca pode errar — e, pior, **sub-receita ausente virando custo zero
em silêncio**. `MissingRecipeError` existia e nada provava que ela disparava:
um semi-acabado que sumisse deixaria todos os sabores em cima dele mais
baratos, sem um número parecer errado.

**O que mudou de vez.** A auditoria virou portão: `npm run mutate`, na barra e
no CI, com treze defeitos curados — cada um uma frase sobre o que quebraria na
fábrica. Lista curada e não aleatória de propósito: mutação cega gasta o tempo
em mudanças que ninguém faria. Hoje os treze são pegos.

**A lição sobre a barra, não sobre o centavo.** Suíte verde não diz que a regra
está protegida; diz que os exemplos escolhidos não a exercitam. Mutação é barata
e é a única coisa que responde a pergunta certa: *este teste passaria se o
código estivesse errado?*

---

## 2026-09-01 — a checagem nova mudou o que o job precisava, e não avisou

**O que se viu.** O `db:verify` ficou vermelho no CI e verde local, nos três
pushes seguidos. O log não deixa dúvida: `Cannot find module '@/data/db'`,
depois de o `npx` anunciar que ia **baixar** o `tsx`.

O job do banco nunca rodou `npm ci`. Durante meses ele não precisou — era bash e
`psql`, e mais nada. A checagem 6 mudou isso em silêncio: ela roda uma sessão de
aparelho em TypeScript para produzir a fila que reproduz, então o job passou a
depender das dependências do projeto como qualquer outro.

**Por que passou local.** Porque local tem `node_modules`. Reproduzido copiando
o script para uma pasta sem dependências: mesma mensagem, na mesma linha.

**A lição.** Um passo novo pode mudar os pré-requisitos do job que o hospeda, e
nada no repositório checa isso. É a mesma família dos outros achados do dia —
duas fontes de verdade sobre o que o job precisa: a lista de passos e a
realidade. Aqui elas divergiram no dia em que a checagem entrou.

---

## 2026-09-01 — o contrato entre os dois esquemas cabia em milissegundos

**O que se viu.** A checagem 6 prova o acordo entre aparelho e servidor de forma
honesta — sessão real, fila real, Postgres real. E custa meio minuto e um banco,
então roda uma vez no fim, longe de quem está digitando. Pior: o portão de
mutação, que roda a suíte unitária, **não alcança nada disso**. A divergência
`storeroom` contra `store_room` era invisível para ele.

**O que mudou.** Um teste que lê os dois lados e compara: as migrações do
servidor, tal como ele é construído, contra o que o `serialize` promete mandar.
Não prova comportamento — prova **acordo**, que é exatamente onde moraram todas
as divergências de hoje.

Ele achou uma na primeira execução, e a divergência era **minha, no parser**: a
migração usa `add column if not exists`, e o regex leu `if` como nome da coluna,
reportando `items.base_unit` ausente numa coluna que existe desde a 0003.
Consertei o parser e pus canários nele — uma coluna do CREATE, uma acrescentada
por ALTER, uma removida. Sem esses três, o teste mediria o parser em vez do
esquema, e é assim que um guarda passa a sempre passar.

**O ganho real:** as três divergências que só o Postgres pegava agora morrem na
suíte unitária, o que as coloca ao alcance do `npm run mutate`. O portão foi de
treze para quinze defeitos, e os quinze são pegos.

---

## 2026-09-01 — a permissão existe em três lugares e vale em dois

**O que se viu.** Perguntado sobre login e perfis, olhei o estado real antes de
opinar. A fundação F6 — *permissão por capacidade, nunca por tela* — está
construída e aplicada em **dois** dos três lugares onde precisa valer:

| | |
|---|---|
| Servidor (RLS no Postgres) | aplicado, provado pela checagem 4 |
| Assistente | aplicado **antes** da consulta, com teste |
| Telas | **nada** |

Nenhuma tela verifica nada. `listItems` devolve custo médio para quem chamar, e
o conjunto inteiro de capacidades estava escrito à mão em `app/assistant.tsx`,
sob um comentário dizendo *"até o login chegar, o usuário local é o dono"* — e
aquela lista à mão já estava **faltando três capacidades** que o dono tem.

Hoje não vaza porque só existe uma pessoa. Vaza no dia do segundo celular.

**A pergunta que isso reformula.** Login não é acrescentar uma tela de entrar. É
o que faz o sistema de permissão que **já existe** significar alguma coisa no
aparelho.

**O que mudou.** `src/domain/access.ts`: o vocabulário sai de dentro do módulo
do assistente e vira domínio, com uma fonte só — e um teste que compara a lista
do código com o enum do servidor, valor por valor. Mais o mapa papel→capacidades
da tabela do plano, com as **ausências** presas por teste: o operador de fábrica
e o entregador não veem custo, preço nem dinheiro; só o dono administra a
empresa; ninguém de fora vê custo. Ampliar um papel passa a ser ato deliberado
com suíte vermelha na frente.

**Um desalinho honesto que apareceu escrevendo.** O piso de autonomia do plano
tem cinco atos, e só dois têm capacidade própria hoje — mudança de preço,
estorno e lançamento financeiro são coisas que o aplicativo ainda não faz.
Nomear capacidade para elas agora seria inventar vocabulário para recurso
ausente, então ficaram escritas como **atos**, não permissões. O piso é uma
promessa feita antes do recurso existir: quem construir herda a regra em vez de
decidir de novo.

**Em aberto, e é decisão do dono:** celular compartilhado ou pessoal no chão de
fábrica; e se o movimento operacional grava **quem** ou grava **onde**. O tom de
voz do projeto diz nunca culpar pessoa, e a cadeia de custódia existe para
localizar a perda sem acusar ninguém — o que argumenta por aparelho e posto, não
por pessoa. E o operador poder ou não conferir a prateleira, já que contagem
está no piso de autonomia.

---

## 2026-09-01 — a fundação que eu violo é exatamente a que não está no CLAUDE.md

**O que se viu.** Perguntei ao dono se o celular do chão de fábrica é
compartilhado ou pessoal, pedindo que ele escolhesse um. Ele respondeu que isso
é o que ele repete desde o começo: **depende de quem usa, então vira opção.** É a
fundação F7 do plano — *"Depende" vira DADO, não código.*

Fui procurar por que continuo escorregando nisso, e o padrão é limpo demais para
ser coincidência. `grep -i depende CLAUDE.md` devolve **uma** ocorrência, e é
sobre outro assunto. **F7 nunca entrou no `CLAUDE.md`** — mora só no documento
de plano, que é lido uma vez e não a cada sessão.

E as seis fundações que **estão** no `CLAUDE.md` são exatamente as que eu
respeitei o dia inteiro: achei e consertei violação do livro-razão append-only,
do `Cents`/`Rate`, da permissão na consulta, do i18n, do "camada de dados devolve
fato" e do multi-empresa. Seis por seis. A que ficou de fora é a única que eu
violei — e violei perguntando.

**O que mudou.** F7 entrou nas fundações, com um acréscimo que o plano não
tinha: **vale também para as perguntas feitas ao dono.** Pedir que ele escolha
entre A e B, quando A e B são preferências de cliente, é empurrar para ele uma
decisão que o produto deveria absorver. A pergunta certa é qual é o **padrão** —
não qual é o único.

E as decisões dele foram escritas no `CLAUDE.md` também, porque decisão
esquecida vira pergunta repetida, que é como isto começou.

**A lição sobre o próprio arquivo.** Regra que não está no `CLAUDE.md` não está
em lugar nenhum, por mais bem escrita que esteja num plano. O teste é brutal e
já foi feito: seis das sete fundações estavam lá e valeram; a sétima não estava
e não valeu.

---

## 2026-09-01 — a pergunta que eu repeti três vezes já estava respondida no esquema

**O que se viu.** O dono pôs uma diretriz permanente: **não fazer pergunta
óbvia.** Se tem que ser feito, faz. Fui aplicar na única pergunta que eu vinha
repetindo — se movimento de chão de fábrica grava *quem* fez ou *onde*
aconteceu — e ela se desmontou em duas.

Primeiro: **é preferência de empresa.** Uma fábrica de três pessoas não quer
nome nenhum; uma de quarenta com furo de estoque quer. Pela F7 isso vira dado, e
pela regra nova nem chega a ser pergunta.

Segundo, e eu não tinha percebido: **`movements.recorded_by` já é `not null`
desde a primeira migração.** O livro-razão sempre soube quem fez. A pergunta
nunca foi sobre armazenamento — era sobre a **interface** nomear a pessoa. Eu
levei três mensagens perguntando algo que o esquema já tinha decidido, e bastava
ter lido.

**O que mudou.** `companies.names_who_recorded`, padrão `false`. O padrão vem do
tom de voz: a cadeia de custódia existe para **localizar** a perda — a diferença
entre dois postos diz se foi separação, rota ou recebimento — e *"faltaram 3
caixas na conferência"* resolve sem nomear ninguém. Equipe que vê o app como
inimigo sabota o dado, e aí não há relatório nenhum.

**A lição.** Antes de levar uma pergunta ao dono, ler o esquema. Metade das
perguntas que parecem de produto já foram respondidas por quem escreveu a
tabela.

---

## 2026-09-01 — o guarda de acordo só olhava para um lado

**O que se viu.** O teste de acordo entre esquemas checava as colunas que o
aparelho **manda**. A direção inversa — coluna que o servidor **exige** e o
aparelho nunca manda — continuava só ao alcance do Postgres. É a classe do
`freight_cents`, que custou uma corrida de CI para aparecer.

**O que mudou.** O parser passou a ler `not null` e `default` de cada coluna, e
o teste exige que toda coluna obrigatória sem padrão venha do aparelho — não há
outro lugar de onde ela possa vir. Com canários no parser de novo: sem eles, uma
regra que lesse tudo como "tem padrão" reportaria nada faltando para sempre.

Visto mordendo: tirando o carimbo de `recorded_by`, dois testes ficam vermelhos e
o primeiro nomeia `movements.recorded_by`. O portão de mutação foi a dezessete.

---

## Em aberto

- **O servidor está três migrações à frente do aparelho.** As decisões do dono
  sobre identidade viraram esquema — estado de associação, código da empresa,
  modo de entrada no chão de fábrica, atribuição do relatório, e o aparelho como
  coisa cadastrada com responsável. Nada disso existe no SQLite do celular, e o
  guarda de acordo **não vê essa divergência**: ele compara o que o aparelho
  manda, e o aparelho não manda nenhuma dessas tabelas. É dívida consciente, não
  esquecimento — ela se paga quando a identidade chegar ao aparelho, e até lá o
  `movements.device_id` já está escrito no serializador, nulo, para que o lugar
  onde o valor entra não dependa de alguém lembrar.

Achados desta rodada que ainda não viraram mudança. Ficam aqui até virarem.

- **Seis inteligências construídas e nunca chamadas:** `daysOfCover`,
  `reorderPoint`, `observedLeadTimeDays`, `explodeRequirements`,
  `lotsPresentDuring` e `balanceAt` têm teste e não têm chamador. A Lei da
  Inteligência exige que toda tela responda o que é normal, o que está diferente
  e qual a próxima ação; hoje a tela inicial responde só a segunda.
- **A lista de compras não precisa da Fase 5.** O plano a colocou lá porque a
  versão *automática* depende de plano de produção e histórico. Mas
  `explodeRequirements` sobre o estoque atual já responde hoje, com dados só da
  Fase 1: *"se eu fizer 3 tachos de cada sabor, o que falta comprar?"* Isso é
  simulação, não previsão — não precisa de histórico nenhum.
- **"Apagar tudo" não tem lado servidor, e a decisão é sua.** O comando
  sobrevive à limpeza e o `serialize` o emite, mas o servidor não o recebe —
  então hoje um sync futuro traria de volta o que a pessoa mandou destruir.
  Construir isso exige decidir o que "apagar" significa num servidor
  multiempresa: destruir o histórico daquela empresa, ou só marcar que aquele
  aparelho não quer mais o dado. A primeira é irreversível e o livro-razão recusa
  DELETE por desenho. Não construo sem você escolher.
- **O aparelho ainda não tem consumo nem perda.** A contagem faz o saldo descer,
  mas a perda com motivo obrigatório continua sem existir, e sem ela toda
  diferença legítima vira "inexplicada".

## 1 de setembro — a identidade carimbada na hora errada

**O que apareceu.** O serializador escrevia `recorded_by: actor.userId` — o usuário
**da sincronização**. Num celular compartilhado (o caso que o dono descreveu: o
aparelho é da empresa e passa de mão), quem sobe os dados à noite não é quem
registrou de manhã. O livro-razão responderia "quem" com o nome errado.

**Por que importa.** Errar o "quem" é pior do que não saber: um nome errado no
histórico é usado para cobrar a pessoa errada, e a equipe que se sente acusada
sabota o dado — que é exatamente o que o tom de voz do projeto existe para evitar.

**O que mudou.** `movements` ganhou `recorded_by` no aparelho (migração V4),
preenchido no instante da escrita; o serializador passou a mandar o valor gravado
e só carimba o ator quando o aparelho não sabia. Nulo virou resposta honesta:
"o aparelho não sabia", não "ninguém fez". Teste novo e mutação nova — a suíte
fica vermelha se o carimbo do sync voltar a mandar.

> **Corrigido no mesmo dia, mais abaixo.** A conclusão acima estava pela metade:
> mandar o valor gravado é necessário, mas o servidor recusa quando ele difere
> de quem está sincronizando. O achado seguinte fecha isso.

## 1 de setembro — o marcador que não suprime nada

**O que apareceu.** Eu tinha escrito `proofgate-allow` três vezes em linhas de
**comentário**, acima do código apontado. O portão filtra `if (l !~
/proofgate-allow/)` sobre a própria linha adicionada: marcador em comentário
vizinho não suprime coisa alguma. Os três liam como "já justificado" e o portão
continuava contando ⚠️ — ninguém percebeu porque o resumo só mostra o número.

**Por que importa.** É a mesma família do teste que passa pelo motivo errado: um
sinal de "resolvido" que não está ligado a nada. Pior que o alerta ignorado, é o
alerta que alguém acredita ter tratado.

**O que mudou.** Onde o marcador era prosa, virou verificação: `ident()` em
`scripts/device-session.ts` recusa qualquer nome de tabela ou coluna que não seja
identificador simples, antes de entrar no SQL — provado quebrando (`refusing to
build SQL around an identifier like "x; drop table movements"`). Onde o risco era
mesmo inexistente (uma `Rate` impressa com `toFixed`, fracionária por fundação),
o marcador foi para a linha certa. Nenhuma justificativa ficou em comentário
fingindo suprimir.

## 1 de setembro — duas perguntas, e eu tentei responder com uma coluna

**O que apareceu.** A política de INSERT da fundação é `recorded_by = auth.uid()`:
o servidor só aceita movimento atribuído à própria conta que insere. Eu li isso
como uma contradição com o aparelho compartilhado e comecei a construir em cima
— recusa no serializador, sessão por pessoa, PIN destrancando token guardado.
Era premissa inventada. **A contradição não existia: eram duas perguntas
diferentes que eu estava empilhando numa coluna só.**

O dono desfez em duas frases: o login autentica **o sistema** — a conta é da
empresa, que distribui acesso por e-mail ou código de convite por perfil — e
**quem estava operando é anotação do registro**, não identidade da sessão.

**Por que importa, e o que quase aconteceu.** O código errado estava bonito:
teste verde, erro claro, comentário explicando. Verde protegendo uma regra que
ninguém pediu é pior que vermelho — não avisa. Custou uma rodada inteira, e o
que a evitaria era barato: conferir a lista de decisões antes de aceitar que a
fundação está furada.

**O que mudou.** `movements.operator_id` no servidor (0014) e no aparelho (V5),
referenciando a pessoa cadastrada; `recorded_by` volta a ser simplesmente a
conta que sincroniza. A `AttributionMismatchError` e a sessão-por-pessoa foram
deletadas. A `db:verify` guarda os dois lados agora: nomear outro em
`recorded_by` é **recusado**, nomear outro em `operator_id` é **aceito** — e a
recusa foi isolada trocando só a atribuição, para provar que é ela e não outra
coisa. No `CLAUDE.md`, a decisão do dono ficou escrita e ganhou uma regra de
método: contradição achada é suspeita de leitura errada até virar prova.

**E um buraco de verdade, que sobreviveu à correção.** Os 45 writes da fila são
reproduzidos como **superusuário**, que ignora RLS por completo. A "fila
reproduzida contra um servidor de verdade" prova que as colunas batem — nunca
provou que a escrita seria aceita. É o próximo item, e é o que teria contrariado
minha premissa antes de eu construir sobre ela.

## 1 de setembro — o aparelho não conseguia reenviar a fila

**O que apareceu.** Assim que a checagem 6 parou de rodar como superusuário e
passou a subir a fila como a conta da empresa, sob RLS, a **segunda** passagem da
mesma fila foi recusada:

    new row violates row-level security policy (USING expression)
    for table "purchases"

`purchases` e `purchase_lines` tinham política de leitura e de INSERT e **nenhuma
de UPDATE** — e a fila sobe com `ON CONFLICT DO UPDATE`. Todas as outras tabelas
que ela escreve têm um `_manage FOR ALL`, que cobre update; essas duas ficaram de
fora quando foram escritas, e nada apontava para isso porque nenhuma política era
avaliada.

**Por que importa.** Reenviar não é caso raro, é o caso normal: sinal que cai no
meio da subida, aplicativo fechado antes do fim, bateria acabando na câmara fria.
O aparelho reenvia até ter certeza. Sem isso ele reenviaria **para sempre**, com a
fila travada atrás da primeira nota e nada na tela explicando o quê — o pior tipo
de defeito, porque some do lado de quem programa e mora do lado de quem usa.

**O que mudou.** Migração 0015 com política de UPDATE para as duas, na mesma
capacidade que já podia inseri-las. Não foi `DO NOTHING`: com ele, uma nota
corrigida no aparelho seria descartada em silêncio, e silêncio é a única coisa
pior que a recusa. `movements` continua sem política de UPDATE e subindo com
`DO NOTHING` — a nota é documento, o movimento é fato, e só o fato é imutável.

E a checagem 6 virou quatro afirmações em vez de uma: a fila entra **sob a
política** como a conta da empresa; a **mesma fila** por quem não é da empresa
para na primeira linha (que é o que prova que a política está sendo avaliada, e
não apenas presente); reenviada inteira, não estraga nada; e o saldo aferido
**depois das duas passagens** continua 92000, que é o livro-razão provando que não
dobrou.

**De quebra, três coisas menores.** `ON CONFLICT DO UPDATE` exige privilégio de
UPDATE, e o Postgres responde só `permission denied` sem dizer qual dos dois
falta — meia hora nisso. Um backtick dentro de string com aspas duplas fez o bash
executar um comentário SQL (segunda vez hoje que essa família me pega, a primeira
em template literal). E `has_capability` mudou para o schema `private` na 0004, o
que só aparece quando se escreve uma política nova.

## 1 de setembro — o aviso que errava sempre

**O que apareceu.** Toda execução do portão trazia a mesma ⚠️: "manifesto mudou
sem o lockfile". Eu justificava em prosa toda vez — rodei `npm install
--package-lock-only`, o lockfile não muda, segue o jogo. Justificar duas vezes é
sinal; justificar cinco é dívida.

O guard testava se a linha adicionada **parecia** uma dependência: aspas,
circunflexo, til. Em JSON toda linha parece. Acrescentar o script `mutate` ao
`package.json` exigia lockfile novo, e nenhum lockfile poderia mudar.

**Por que importa.** É a Lei 7 aplicada à minha própria ferramenta: alerta
inventado ensina a ignorar alerta. Um aviso que erra sempre não custa só o tempo
de conferir — ele treina a passar os olhos por cima da lista, e é lá que o aviso
verdadeiro vai estar um dia.

**O que mudou.** O guard passou a ler os blocos que de fato decidem resolução
(`dependencies`, `devDependencies`, `peer`, `optional`, `overrides`,
`resolutions`, `require`) nas duas revisões e comparar; iguais, acabou. Onde não
há parser de JSON, cai no heurístico antigo em vez de chutar. Com teste dos dois
lados: script trocado passa, versão bumpada com lock velho continua avisando.

**E o portão ficou limpo pela primeira vez neste projeto** — zero ⚠️, zero ❌.
Que é o estado em que ele volta a significar alguma coisa.

## 1 de setembro — o pulso mentia, e a regra estava escrita no próprio arquivo

**O que apareceu.** Auditando as telas da Fase 1 contra a Lei da Inteligência,
o `<PulseDot />` da tela inicial estava dentro do `map` de produtos **sem
condição**: todo produto pulsava, sempre, inclusive os de custo parado há
semanas. E o docblock do próprio componente já dizia por que isso é errado —
*"pulso ao lado de valor congelado é mentira visual, e as pessoas percebem"*.

A regra foi escrita e quebrada pelo primeiro chamador. O motivo não foi
desatenção: o componente **não tinha como dizer que não estava vivo**. Ele só
pulsava. Respeitar a regra dependia de lembrar de não renderizar — e lembrar não
é mecanismo.

**Por que importa.** É a mesma família do marcador que não suprime e do teste
verde pelo motivo errado: um sinal que afirma uma coisa e está ligado a nada. Só
que este mora na tela, onde quem olha é o operador de luva na câmara fria, que
aprende em uma semana que a bolinha não quer dizer nada.

**O que mudou.** `live` virou obrigatório — o compilador apontou o único ponto
que mentia. Parar de pulsar agora também **desfaz** a animação em vez de só não
começar; deixar o halo onde o último quadro parou é a mesma mentira com outra
forma. E o docblock ainda guardava o "no máximo dois por tela" que o dono já
tinha derrubado; virou o princípio: quantos pulsam depende de quantas coisas
estão acontecendo, e o limite real é a bateria de um celular ligado o turno
inteiro.

**Dois achados menores, da mesma varredura.** `app/foundation.tsx` — 168 linhas —
não era alcançável por nenhum caminho do aplicativo; apagada, porque a tela de
estoque de verdade é Fase 2 e demo parado apodrece. E o e2e nunca abria
`/recipes` nem `/settings`, as duas ligadas na home: mesma família da cicatriz
que criou o e2e. Agora abre — e as duas checagens foram vistas **falhando** antes
de aceitas, cada uma pela sua causa: renomear a receita semeada derruba a de
receitas; trocar `hasSeeded()` por `false` derruba a de ajustes.

**O que ficou por responder.** A Lei pede três coisas de toda tela, e a inicial
responde duas: o que mudou (o custo se moveu, com a comparação) e onde ir. A
terceira — **qual é a próxima ação provável** — não existe em nenhuma tela ainda.
Nada diz "produza até segunda" nem "a polpa subiu 9%, reveja o preço". Não é
esquecimento: é a Fase 4, e construir antes de a Fase 1 ser usada seria adivinhar
qual ação é provável. Fica registrado para não passar por pronto.

## 1 de setembro — doze funções exportadas que ninguém chamava, e nenhuma tinha teste

**O que apareceu.** Varrendo o que o domínio exporta contra o que as telas
chamam, doze exports não tinham **nenhum** chamador — nem em tela, nem em script,
nem em teste. Entre eles `balanceAt` (o saldo num instante, que a excursão de
temperatura vai precisar), `daysOfCover` (a frase que manda produzir) e
`observedLeadTimeDays` (o "promete três dias e entrega em seis").

Um deles quase me assustou: `connectionPragmas`. Se os PRAGMAs nunca fossem
aplicados, o aparelho rodaria **sem chave estrangeira**, e a ordem de exclusão da
tela de ajustes depende disso. Conferido: os PRAGMAs rodam na linha 358. O export
é que não servia para nada.

**Por que importa.** Não eram descuido — cada uma carrega uma decisão já tomada,
com docblock explicando o porquê. O defeito é outro: **nunca foram executadas.**
Uma função exportada e documentada lê como capacidade, e quem for ligá-la a uma
tela herda uma resposta que ninguém viu sair. É a mesma família do marcador que
não suprime e do pulso ao lado de número parado — sinal que afirma e não está
ligado a nada.

**O que mudou, e a decisão que quase saiu errada.** Meu primeiro impulso foi
apagar as doze. Lendo, mudei: apagar `observedLeadTimeDays` jogaria fora um bom
raciocínio já correto. Então:

- **Três apagadas** por serem triviais ou vazias — `addCents` (é `a+b` com tipo),
  `baseUnitTier` (constante disfarçada de função), `connectionPragmas`.
- **Uma tinha chamador afinal**, e esse é o achado real: `purchaseToBaseUnits`
  estava duplicada **dentro da tela de compra**, digitada à mão
  (`Math.round(packs * factor)`). Duas implementações da mesma regra concordam
  até alguém corrigir uma delas, e aí não há como dizer qual número está certo.
  A tela passou a chamar a função.
- **As oito restantes ganharam teste** — arquivos dedicados para `cost.ts`,
  `ledger.ts` e `units.ts`, que **não existiam**: fundação exercitada só de
  esguelha por `pipeline.test.ts`.

De 118 para 131 testes, e quatro mutações novas (21 no total) para provar que os
testes novos mordem: cobertura infinita quando nada sai, o saldo "às 3h" perdendo
o movimento das 3h em ponto, hierarquia que começa na caixa, e multiplicação de
dinheiro cortando em vez de arredondar.

## 1 de setembro — um arquivo de teste inteiro que nunca rodava

**O que apareceu.** Escrevi `src/layers.test.ts`, rodei a suíte, e o total
**não se moveu**: 131 antes, 131 depois. O script era
`tsx --test src/**/*.test.ts` — **sem aspas**. O shell expande antes do runner
ver, e sem `globstar` ele lê `**` como **um nível só**. Todo arquivo de teste em
`src/algo/x.test.ts` rodava; um em `src/x.test.ts` não existia para a suíte.

**Por que importa.** Teste que não roda é indistinguível de teste que passa. Não
há vermelho, não há aviso, e o número no fim da execução parece uma promessa
cumprida. Foi só porque eu contei que apareceu — e contar não é hábito, é sorte.

**O que mudou.** O glob entrou entre aspas e passou a ser expandido pelo node,
que entende `**` em qualquer profundidade: 131 → 134 testes, com os dois que eu
tinha acabado de escrever mais o pino que fixa as aspas, porque as aspas **são** o
defeito. E virou guard na proofgate (`47-unquoted-globstar`), já que isso vale
para qualquer repositório JS.

**E o que a busca que gerou tudo isso encontrou:** que só `src/data` fala SQL —
domínio, telas, assistente e sincronização estão limpos. A promessa da fundação
("o assistente nunca escreve consulta própria; chama as mesmas funções que as
telas") se sustenta hoje, e agora tem teste, com um controle junto: se as
consultas saírem de `src/data`, o teste que as proíbe em outro lugar deixaria de
provar coisa alguma, e é o controle que avisa.

## 1 de setembro — a forma comum dos três defeitos silenciosos

**O que apareceu.** Olhando os achados do dia juntos, três têm a mesma forma:
o marcador `proofgate-allow` que não suprimia, a fila reproduzida como
superusuário que não exercitava política nenhuma, e o `**` sem aspas que pulava
um arquivo de teste inteiro. Nenhum é um erro de cálculo. Todos são **um
mecanismo reportando sucesso sem ter feito o trabalho**.

Com essa lente, varri o resto da barra. A `db:verify` está disciplinada
(`set -euo pipefail` mais `fail()` explícito: comando que falha aborta). O
`mutate` conta como sobrevivente a mutação cujo trecho sumiu, o que é o
comportamento certo. **O e2e tinha o buraco:** se nenhuma checagem se
registrasse — um deslize de sintaxe, um merge ruim — ele imprimia
`0/0 passaram` e saía com sucesso.

**O que mudou.** Suíte vazia agora é falha, com a razão escrita na tela. Provado
esvaziando o registro de checagens: código de saída **1**, não zero. Medi errado
na primeira tentativa (peguei o `$?` do `tail` em vez do `npm`) — e "imprime a
mensagem mas sai zero" seria exatamente o defeito que eu estava consertando, o
que torna a medição errada pior que não medir.

## 1 de setembro — o app pedia 25000 para quem comprou "saco 25 kg"

**O que apareceu.** Procurando por que o assistente não sabe cadastrar insumo
(a cláusula de pronto do projeto exige responder **e** preencher, e ele só
responde), esbarrei no cadastro em si: o campo "Quanto vem dentro" tem
`placeholder="25000"`. O dono da fábrica sabe que comprou um **saco de 25 kg** —
o app pedia que ele convertesse para gramas.

**Por que importa.** É a Lei 1 quebrada no lugar mais visível: nunca peça o que
o sistema pode deduzir. E o dado já estava na tela — a pessoa acabou de escrever
"saco 25 kg" no campo de cima. Pior: a fricção cai justamente sobre o usuário de
baixa habilidade técnica, que é a restrição dominante deste projeto inteiro.

**O que mudou.** `src/domain/measure.ts`, deliberadamente minúsculo: massa e
volume nas duas escalas que uma fábrica escreve, e mais nada. Digitar a
embalagem preenche o fator, **e só um campo que a pessoa não tocou**. O que não
dá para ler com certeza fica em branco em vez de virar chute: "balde" (sem
tamanho), "caixa 6 x 500 ml" (dois números), unidade desconhecida, e fração de
unidade base — 0,0025 kg são 2,5 g, e arredondar isso caladamente põe um fator
errado embaixo de todo custo daquele insumo para sempre.

Provado no navegador (12/12 no e2e) e com duas mutações novas (23 no total) — e a
segunda **sobreviveu na primeira tentativa**, o que é o portão fazendo o trabalho
dele. Meu exemplo de ambiguidade era "caixa 6 x 500 ml", e ali o primeiro número
vem com "x", que não é unidade conhecida: a função caía em nulo por outro
caminho, não pela regra que eu queria provar. O caso perigoso é aquele em que os
**dois** números são legíveis — "pacote 500 g 12 unidades" — e é esse que o teste
afirma agora.

**E um achado de lambuja que eu não conserto sozinho:** dois controles na mesma
tela atendem por **"Embalagem"** — o tipo do insumo (palito, saquinho) e o campo
da embalagem de compra (saco 25 kg). Foi o Playwright que reclamou, e ele estava
certo: se a ferramenta não distingue, uma pessoa de luva também não. Renomear é
tom de voz, e tom de voz é decisão do dono.
