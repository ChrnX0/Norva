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

## 1 de setembro — empurrei duas vezes sem ler o portão

**O que apareceu.** Não no código: em mim. Duas vezes hoje encadeei o commit
numa linha separada da verificação e empurrei sem olhar a saída — a primeira com
o shellcheck reclamando de um padrão redundante, a segunda com uma mutação
**sobrevivente** que o meu próprio `mutate` tinha acabado de imprimir. O CI pegou
a segunda três minutos depois, o que prova que o portão funciona e que o elo
fraco é o operador dele.

**Por que importa.** A barra deste projeto existe escrita há semanas, e escrita
não bastou: eu a li, concordei com ela, e furei duas vezes no mesmo dia. Regra
que depende de atenção é regra que falha no dia cansado — e o dia cansado é
exatamente quando o erro custa caro.

**O que mudou.** O `push-guard` da proofgate está instalado como hook
`PreToolUse(Bash)`: ele lê o comando **antes** do git, e recusa `git push`
enquanto não houver veredito fresco e passante para o HEAD atual. Também bloqueia
`--no-verify` e `core.hooksPath`, e explica que a tentativa foi vista — porque um
hook de git seria contornável por quem está com pressa, e quem está com pressa
aqui sou eu. Provado nos dois sentidos: veredito no HEAD libera, HEAD adiantado
recusa com saída 2.

## 1 de setembro — o assistente aprendeu a cadastrar, e o teste achou dois bugs meus

**O que apareceu.** A cláusula de pronto do projeto diz que um módulo só está
concluído quando o assistente sabe **responder** sobre ele *e* **preencher** os
registros dele. Ele tinha sete habilidades que respondem e duas que preenchem
(compra e contagem) — nenhuma que cadastra. E cadastrar é justamente onde as
pessoas desistem: ninguém digita sessenta insumos num formulário antes de ver o
aplicativo fazer alguma coisa, muito menos o usuário para quem este produto
existe. A peça que faltava era ler a embalagem, e o `measure.ts` de hoje resolveu
isso.

**Os dois bugs, os dois achados pelo teste antes de qualquer pessoa ver:**

1. **"Polpa de açaí" era recusada porque já existe "polpa de morango".** Eu usei
   o `findByName`, que por último cai em "compartilha uma palavra significativa".
   Isso está certo para **achar** o que a pessoa mencionou e errado para decidir
   que um nome **já existe** — e uma fábrica tem polpa de morango, de açaí e de
   maracujá. Agora a comparação é exata.
2. **O nome entrava sem acento.** O `match` de todas as outras habilidades roda
   sobre o texto normalizado, porque elas *procuram* algo que existe e "acai"
   precisa achar "açaí". Esta **guarda** o que captura: normalizado, ela poria
   "polpa de acai" no catálogo da pessoa para sempre. Casa no texto cru, e os
   verbos não têm acento, então não custou nada.

**O que mudou.** `register_input` no assistente, com `saveItem` atravessando o
mesmo caminho que a tela usa — o assistente continua sem consulta própria.
Embalagem ilegível não impede o cadastro: cria o insumo sem fator e diz isso, em
vez de chutar um número que ficaria embaixo de todo custo daquele item. Quatro
testes (cria, ilegível, duplicado, sem permissão) e duas mutações novas — 25 no
total —, cada uma sendo exatamente um dos dois bugs acima.

## 1 de setembro — a coluna com índice próprio que ninguém preenchia

**O que apareceu.** Puxando o fio de um campo `kind` do rascunho que nunca é
lido, cheguei em `movements.assistant_phrase`: existe na fundação do servidor,
**com índice dedicado** (`where assistant_phrase is not null`) para responder "o
que o assistente lançou este mês?", existe no aparelho, atravessa no
serializador — e **nenhuma linha de código jamais escreveu nela**.

**Por que importa.** É a condição que o plano impôs para deixar o assistente
escrever: todo movimento criado por conversa fica marcado, com a frase original
guardada, porque *autonomia sem rastro quebra a confiança no dado*. Sem a
escrita, um lançamento feito por conversa é indistinguível de um digitado — a
auditoria prometida não existia, e o índice construído para ela apontava para
zero linhas, para sempre.

**O que mudou.** A frase viaja do `ask` para a habilidade e daí para o
livro-razão, nos dois lugares em que o assistente escreve (compra e contagem).
Provado no banco de verdade, com o controle junto: um lançamento por conversa
guarda a frase, um lançamento pela tela guarda nulo — e é o segundo que torna o
primeiro uma informação em vez de uma coluna sempre preenchida. Mutação nova
(26 no total).

**E o `Draft.kind` continua sem leitor** — é um campo carregado e nunca usado.
Não apaguei: quando a marcação de origem virar tela ("mostre o que o assistente
lançou"), é ele que diz de que tipo era o rascunho. Fica anotado aqui para não
virar mais um achado repetido daqui a um mês.

## 1 de setembro — o portão de fase pegava a fase errada

**O que apareceu.** Um painel adversarial de quatro lentes contra a regra
"nenhuma fase começa antes da anterior estar em uso real", e as quatro
concordaram no mesmo ponto sem se verem: o portão **não tem predicado de saída
nem prazo**. Num projeto onde a `db:verify` tem seis garantias nomeadas e a
proofgate tem vinte e duas guardas numeradas, esse era o único portão sem número
e sem comando — e regra assim vira álibi, não disciplina.

Pior: ele travava a coisa errada. Travava o fiscal, cujo layout quem decide é a
SEFAZ. E **não** travava o defeito que este repositório de fato tem — coisa
construída sem chamador, quatro vezes, nenhuma pega pelo número da fase.

**Duas coisas que o painel afirmou e que eu verifiquei serem falsas**, e registro
porque relatório é leitura de fora, não autoridade: que `main` teria um commit só
(tem 49, com a Fase 1 mesclada) e que o caminho de publicação do APK só existiria
na branch (`.github/apk-release.txt` e `release-apk.yml` estão em `main`).

**O achado que sobreviveu, e é arquitetural.** A lente que *defendia* a regra
achou o motivo certo, que não era o escrito: **o saldo não filtra por local.**
`ensureLocation` cria uma única `location` cujo id é o próprio `company_id`, e as
três consultas de saldo somam `WHERE company_id = ? AND item_id = ?` — zero
ocorrências de `location_id = ?` no repositório inteiro. Está correto enquanto
existe um lugar só. A câmara fria é o segundo, e "é saldo separado ou o mesmo
saldo noutra sala?" é pergunta de fábrica, não de código.

**Segundo achado, latente:** o servidor tem `create table lots` desde a 0001, o
aparelho tem `lot_id TEXT` e **nenhuma tabela `lots`**, e o `serialize` manda
`lot_id`. Hoje é sempre nulo e nulo passa na chave estrangeira, então a fila não
trava. Trava no dia em que a Fase 2 gravar o primeiro lote. Pela regra nova, P1
decide: ninguém chama, não entra agora — mas fica escrito, porque é barato
fechar junto com a produção e caríssimo descobrir depois.

**O que mudou.** O portão passou a ser por item, com três perguntas objetivas
(quem chama · o que eu precisaria ver · custa um commit ou uma migração), e
passou a **nomear o que o bloqueia, com data** — porque o bloqueio de hoje é um
ato administrativo, não falta de aprendizado.

## 1 de setembro — o script que quebra o código de propósito deixou um pedaço quebrado no disco

**O que apareceu.** O hook de fim de turno acusou `src/domain/recipe.ts` modificado, e eu
não tinha mexido nele. O diff era uma **mutação do próprio `mutate`**: o guarda de ciclo de
receita trocado por `if (false)`. Alguma execução foi interrompida, o `finally` não rodou,
e a mutação ficou no disco.

**Por que é o pior lugar possível para isso acontecer.** No momento em que apareceu, um
build de APK estava começando a empacotar **exatamente esse diretório**. Se tivesse chegado
na tarefa de bundle, o aplicativo sairia com o guarda de ciclo desativado — a receita que se
referencia trava o app em vez de recusar, que é literalmente o dano descrito na própria
lista de mutações. O script cujo trabalho é quebrar o código de propósito precisa ser o mais
paranóico do repositório sobre desfazer, porque a falha dele não é um teste vermelho: é
código quebrado viajando dentro de um aplicativo.

**O que mudou.** `finally` cobre exceção e não cobre SIGINT/SIGTERM, que é como um processo
de fundo morre. Agora há tratador para os três sinais mais `process.on('exit')`, com a
restauração idempotente. E, antes de começar, o script **recusa rodar** se a árvore já
estiver suja num arquivo que ele mexe — porque seguir em frente sobrescreveria a evidência
de que a execução anterior morreu no meio. Provado: sujei um arquivo de propósito e ele
parou na hora, sem tocar em nada.

**E a disciplina que faltou foi minha:** disparei um build a partir de uma árvore suja sem
conferir. O `git status` custa um segundo e teria mostrado.

## 1 de setembro — três vezes acusei fronteira registrada de ser defeito

**O que apareceu.** Num mesmo dia apontei "violação de fundação" em três coisas
que eram decisão escrita: o `UnitStepper` sem chamador (é componente da Fase 2,
e a tela de compra já dá a conversão por extenso), o `[por quê?]` ausente na
home (a conta abre em um toque, na receita), e o assistente guardar 39 frases em
português — que tem o raciocínio inteiro no topo do `src/assistant/index.ts`,
inclusive a condição de quando deixa de valer: *"as respostas vão para o
dicionário quando um modelo de linguagem fizer o casamento, nessa mesma
mudança"*.

**Por que importa mais que o tempo perdido.** No terceiro caso eu já tinha
disparado um workflow para preparar a correção, e já tinha dito ao dono que era
defeito. Quase "consertei" uma decisão que alguém tomou por um motivo que eu não
tinha lido — e a correção teria deixado o assistente respondendo em espanhol
sem entender espanhol, que é exatamente o resultado pior que a decisão evitava.

**O que mudou.** Regra nova no `CLAUDE.md`: antes de chamar algo de defeito,
procurar a decisão — no docblock do próprio arquivo, no `docs/insights.md`, nas
decisões do dono. Havendo decisão escrita, o achado não é defeito: ou vira
pedido de mudança para o dono, ou não é nada. O docblock do `index.ts` estava a
um `grep` de distância nas três vezes.

## 1 de setembro — afirmei que o link funcionava depois de testá-lo por dentro

**O que apareceu.** Publiquei o APK como release, verifiquei pela API que o
artefato estava lá com o sha256 certo, e disse ao dono que ele podia baixar. Ele
tentou: **404**.

**A causa, e ela é a mesma família do dia inteiro.** O repositório é privado, e
artefato de release privado exige sessão logada. Meu `curl` respondia 200 porque
**o proxy deste ambiente injeta credencial** — eu testei por um caminho
autenticado e concluí sobre um caminho anônimo. É exatamente o superusuário que
ignora a política, com outra roupa: verificar por dentro e afirmar sobre fora.

**O que mudou.** Duas coisas, e nenhuma delas é "prometer conferir melhor".

O APK carregava **quatro arquiteturas**: 23,8 MB de `x86` e 23,2 de `x86_64`, que
só existem em emulador — 47 dos 110 MB eram peso morto para qualquer telefone.
Agora compila só `arm64-v8a`: **47 MB, em 3 min 29 s**, contra 110 MB e vinte
minutos.

E a compilação saiu da Expo e foi para o CI do GitHub, com três conferências
antes de publicar: a assinatura passa pelo `apksigner` (APK sem assinatura não
instala, e o erro no celular não explica nada), o bundle JS tem de estar dentro
(sem ele o app abre em tela branca), e a contagem de arquiteturas tem de ser um
(senão o ganho de tamanho se perdeu no caminho).

**E uma armadilha anotada porque surpreenderia qualquer pessoa:** o APK local é
assinado com chave de debug e o da Expo com a chave do EAS. Assinaturas
diferentes fazem o Android **recusar instalar um por cima do outro** — é preciso
desinstalar antes, e isso apaga os dados locais.

## 1 de setembro — o tipo que define um movimento descrevia um esquema morto

**O que apareceu.** Antes de escrever a produção, pus o modelo de movimento sob três
lentes independentes. A síntese derrubou as três em pontos concretos — e achou o que
nenhuma delas viu: **`src/domain/ledger.ts` ainda declarava `unitCostCents?: Cents`**,
enquanto a migração `0008` derrubou `unit_cost_cents` no servidor e pôs
`unit_cost_rate double precision`, e o aparelho seguiu com `unit_cost_rate REAL`.

**Por que importa.** É a fundação da capa deste projeto invertida, no tipo que define o
que um movimento **é**: `Cents` é inteiro, `Rate` é fracionário, e polpa a R$ 12,40/kg é
1,24 centavo por grama — como inteiro vira 1, e um quinto do custo some antes da
primeira multiplicação. O bug que originou a regra, de volta na definição.

Sobreviveu por um motivo só, e a auditoria de hoje já tinha apontado: **nenhuma linha de
produção importa esse módulo.** Sem chamador não há erro de compilação, sem teste não há
vermelho. Tipo que ninguém usa não é inofensivo — é mentira esperando o primeiro
chamador, e o primeiro chamador aqui seria a tela de produção.

**Segundo achado, do mesmo desenho:** `loadRecipeGraph` devolve `id: v.recipe_id` — o id
da *receita*, nunca o da *versão* (`repository.ts:594-606`), e o tipo `Recipe` não tem
campo para ele. Ou seja, gravar qual versão a produção usou era **impossível hoje**, e
esse era o único item "ausente" da Fase 1 na auditoria. Ninguém tinha achado o motivo.

**O que mudou.** O tipo passou a dizer `unitCostRate?: Rate`. E dois guardas novos: um
afirma que todo campo do `Movement` nomeia uma coluna que **o servidor tem** — visto
falhando com `unit_cost_cents`, que é a deriva real; o outro transforma o que o aparelho
**não** guarda numa lista escrita (`recorded_by`, que o serializador carimba; `post`, que
é Fase 3; e `counterpart_location_id`, que a transferência vai precisar), para a falta ser
deliberada em vez de descoberta por uma chave estrangeira falhando às quatro da manhã.

**E um erro meu na verificação, que registro porque quase me enganou:** o primeiro guarda
pareceu não morder. Era o meu `grep` — procurei "names no column" onde a mensagem diz
"name no column". O teste estava certo; a checagem da checagem é que estava errada.

## 1 de setembro — o parser do meu próprio guarda lia só metade do esquema

**O que apareceu.** Acrescentei `movement_group_id` e `counterpart_location_id` ao
aparelho por uma migração nova (V6) e o guarda que eu tinha escrito uma hora antes
falhou dizendo que `counterpart_location_id` **continuava ausente**. Estava lá.

O parser lia só o `CREATE TABLE` e ignorava os `ALTER TABLE` dos passos seguintes — a
mesma cegueira que o lado do servidor, no mesmo arquivo, trata desde o começo
("creates, then adds, then drops"). Escrevi o guarda novo sem copiar a lição que já
estava dez linhas acima.

**Por que importa, e por que quase passou.** Se eu tivesse escrito a migração antes do
guarda, ele teria nascido verde e cego: reportando lacunas fechadas para sempre, ou pior,
deixando de reportar as reais. Foi a ordem — guarda primeiro, migração depois — que o
denunciou. Não foi cuidado meu.

**O que mudou.** O parser aplica os `ADD COLUMN` e `DROP COLUMN` sobre o resultado do
`CREATE`. E a lista de lacunas conhecidas passou a **apodrecer em voz alta**: entrada que
afirma uma falta já fechada agora quebra o teste, porque uma lista mentindo sobre uma
ausência deliberada é a mesma família do marcador que não suprime nada.

## 1 de setembro — a promessa estava no comentário e o campo não existia

**O que apareceu.** O tipo `Recipe` diz, desde o começo: *"Versions are numbered and kept.
**Production records which one it used**, so historical cost stays correct after the
formula changes."* Era impossível. A consulta `loadRecipeGraph` **seleciona** `v.id` —
o id da versão — e depois mapeia `id: v.recipe_id`. A identidade da versão nunca saía da
camada de dados, e o tipo não tinha onde guardá-la.

**Por que ninguém viu.** Compilava. Todos os testes passavam. O comentário descrevia a
intenção e nada afirmava o fato. A auditoria das fases marcou "a produção grava a versão
de receita que usou" como **ausente** e não achou o motivo — porque o motivo não era uma
funcionalidade faltando, era um campo que sumia no meio do caminho.

**O que mudou.** `Recipe.versionId`, mapeado de `v.id`. O compilador achou os cinco
lugares que constroem uma receita, incluindo o rascunho da tela de edição — que agora diz
`versionId: DRAFT` em vez de emprestar o id da versão anterior, porque apontar uma corrida
para uma fórmula que não é a que ela usou é pior que não apontar.

O teste afirma o que o comentário prometia, e foi visto falhando com exatamente o bug
original (`versionId: v.recipe_id`): *"versionId is the recipe id again"*. E confere no
banco que aquele id é a linha que de fato guarda esta versão e suas linhas.

**O padrão, que é o mesmo do dia:** comentário promete, código não entrega, nada exercita.
Já apareceu no `assistant_phrase` com índice e sem escrita, no tipo do movimento
descrevendo colunas mortas, e agora aqui. Onde o docblock afirma um fato, ou existe teste
afirmando o mesmo, ou é ficção.

## 1 de setembro — a contagem somava a empresa e escrevia num lugar só

**O que apareceu.** `recordCount` calculava o esperado com
`WHERE company_id = ? AND item_id = ?` — a empresa inteira — e gravava a diferença
**num local**. Está correto enquanto existe um lugar só, e vira teletransporte de estoque
no dia em que existir o segundo: contar a prateleira da Loja Centro compararia com o saldo
da fábrica mais o da câmara mais o da loja, e escreveria a diferença de tudo isso dentro
da loja. Com o operador tendo feito o trabalho certo.

**O que mudou, e por que sem padrão.** `locationId` passou a ser **exigido**. Um padrão
seria pior que o bug: contar a câmara sem dizer qual escreveria no almoxarifado,
calado. A regra deste projeto é que o erro se impede — o chamador diz onde, ou não
compila. O compilador achou os cinco chamadores; nenhum foi descoberto por leitura.

Teste com dois lugares de verdade, visto falhando sem o filtro, e mutação nova (27) com o
dano escrito: *"contar a prateleira de um lugar compara com o saldo da empresa inteira"*.

**O que NÃO mudou, e é a parte que eu ia errar:** a média móvel continua somando a empresa
inteira. Custo não é por lugar — o mesmo grama de açúcar não custa uma coisa na câmara e
outra no almoxarifado. Generalizar as três consultas do mesmo jeito teria quebrado o custo
para consertar a contagem.

## 1 de setembro — a sabotagem equivalente não prova nada

**O que apareceu.** Escrevi `balanceByLocation` e fui provar que o teste morde, trocando
o `GROUP BY m.location_id` por `GROUP BY l.name, l.kind`. **Passou.** E passou por um
motivo correto: no teste cada lugar tem nome distinto, então as duas formas dão o mesmo
número. Sabotagem que não muda o comportamento não mede nada — só me daria a sensação de
ter verificado.

**Por que registro.** É a versão sutil do teste que passa pelo motivo errado. Hoje já
aconteceu duas vezes na mesma família: uma mutação sobreviveu porque meu exemplo de
ambiguidade caía em nulo por outro caminho, e um guarda pareceu não morder porque meu
`grep` procurava a palavra errada. Agora a sabotagem em si era equivalente ao original.

**O que mudou.** A sabotagem certa é a que muda a resposta: fazer cada lugar reportar o
total da empresa em vez do seu próprio. Aí o teste cai com a mensagem certa — *"the six
kilos are in the cold room"*. O teste ficou como estava; quem estava errado era a prova
dele, e a lição é que **a sabotagem precisa alterar o resultado, não só o texto**.

## 1 de setembro — a produção existe, e ela é sete linhas

**O que mudou.** `recordProduction` escreve um movimento de `production` e um de
`consumption` por insumo, todos com o mesmo `movement_group_id`. Sete linhas para uma
corrida com seis insumos, e não uma: `movements` tem UM `item_id` e uma quantidade
assinada, e o saldo é `sum(...) group by empresa, item, local`. Sete itens numa linha só
exigiriam um leitor que abre payload, e o saldo deixaria de ser uma soma.

**A decisão que mais importa, e ela não era óbvia.** O custo do produto congela como
`Σ(consumo) ÷ unidades que saíram de verdade` — **não** pelo rendimento da ficha técnica.
Se o tacho prometia 500 e rendeu 400, o picolé custou 25% mais, e é isso que fica gravado.
Congelar o teórico esconderia a perda **no instante em que ela aconteceu**, que é
exatamente o número que o dono precisa ver. Teste com as duas corridas lado a lado, e a
razão dos custos tem de ser 500/400.

E nada é escrito em `item_costs`: valor derivado tem um autor só, e a média já responde
sozinha — consumo à taxa média não move a média, então valor do razão dividido por
quantidade do razão continua sendo ela.

**Primeiro chamador de `explodeRequirements`.** A função existia, era testada e nunca
tinha sido chamada por linha de produção nenhuma — estava na lista dos doze exports órfãos
da auditoria de hoje. A P1 do portão novo diz "sem chamador, não entra"; este é o commit
em que ela ganha um.

Duas mutações novas, com o dano por extenso: congelar pelo prometido, e o consumo entrando
com sinal trocado — que faria o almoxarifado **encher sozinho** a cada tacho.

## 1 de setembro — a transferência é duas linhas, e o motivo é aritmético

**O que mudou.** `recordTransfer` escreve saída negativa na origem e entrada positiva no
destino, as duas com o mesmo grupo e cada uma apontando para o outro lado em
`counterpart_location_id`.

**Por que duas e não uma, que era a escolha tentadora.** O saldo agrupa por
`location_id`. Com uma linha só, o destino **não existiria em consulta nenhuma** — fechar
exigiria um UNION trocando `location_id` por `counterpart_location_id` e invertendo o
sinal, em cada um dos lugares que somam. Esse é precisamente o caso especial que a
fundação existe para não ter.

A contraparte fica como **explicação, nunca como aritmética**: ela responde "para onde
foi", e quem responde "quanto tem" é a soma, sozinha. Sabotado para uma perna só, o teste
cai — a carga sai da fábrica e evapora no caminho.

**E as duas recusas.** Transferir para o mesmo lugar, ou transferir nada, seriam linhas
apendadas num livro que não se edita depois, descrevendo coisa nenhuma. Recusadas na
entrada — o erro se impede, não se reclama.

**Loja própria é transferência, não venda:** não há faturamento nem margem aqui, o valor
apenas muda de sala. É a distinção que o plano faz desde o começo e agora está no código.

---

## O custo que sete telas prometiam e o livro-razão não guardava

**O que se viu.** Antes de escrever a tela de produção, procurei o que o código existente
estava contradizendo. `costPerProductUnit(cost, yieldPerUnit, unitPackagingCents)` é
chamado em **sete lugares** — briefing, receitas, produtos, compras, assistente — e todos
os sete somam a embalagem. `recordProduction` congelava
`consumedValue / unitsProduced`, e só. O palito e o saquinho ficavam de fora do número
que o livro-razão guarda para sempre.

**Por que importa.** O custo congelado é o denominador de toda margem futura (Fundação 2).
Sem a embalagem, toda venda sairia com a margem inflada em exatamente R$ 0,05 por
unidade — R$ 25 numa corrida de 500, e nenhum relatório teria como explicar a diferença,
porque a tela e o banco diriam números diferentes com a mesma cara. A tela de produção ia
ser construída em cima disso.

**O que mudou.** `recordProduction` soma `product.unitPackagingCents` na taxa congelada.
Dois testes que afirmavam a aritmética antiga foram reescritos, e o segundo ficou mais
forte: o custo do tacho se espalha pelas unidades que saíram (500/400 quando rende
menos), mas **o palito não se espalha** — um palito custa o mesmo tenha o tacho rendido
400 ou 500. O e2e fecha a volta no navegador: a mesma unidade lê R$ 0,64 na produção e
R$ 0,64 no briefing.

**O que ficou aberto, escrito para não se perder.** A embalagem é um valor **digitado à
mão** no produto, enquanto palito e saquinho são **itens comprados por nota**. O custo
agora sai certo, mas nenhum movimento tira palito do estoque: o saldo de palito **só
sobe**. É exatamente o cheiro que o `CLAUDE.md` manda procurar ("um número que só sobe"),
e a cura é ligar produto → itens de embalagem com quantidade por unidade — mudança de
esquema, que vem separada desta e sem a pressa de vir junto.

**E uma regra de plural subiu de nível no caminho.** `n === 1 ? one : fill(other)` estava
copiada em dois pontos de `app/settings.tsx` e ia virar o terceiro na produção. Virou
`plural()` em `src/i18n`, com um detalhe que só aparece na terceira chamada: o número que
**escolhe o ramo** não é a string que **entra na frase** — 1200 escolhe o plural, mas quem
vai na frase é "1.200".

## 1 de setembro — a ordem do registro era regra, e nenhum teste a exercitava

**O que se viu.** As habilidades novas do assistente (o saldo de um lugar, onde
está um item, produzir e mandar carga) entraram no `phase1Skills` com um
comentário afirmando que a ordem é semântica: `stockAtPlace` **antes** de
`stockOfInput`, porque "quanto tem na loja centro" casa com as duas e quem
pergunta por um lugar não está perguntando por um insumo chamado "na loja
centro". O comentário estava certo. O teste ao lado dele perguntava **"o que**
tem na loja centro" — frase que o `stockOfInput` nem casa, porque o regex dele
exige a palavra "quanto". A regra estava escrita, e a suíte passava sem tocar
nela.

**Por que importa.** É a mesma doença que o `mutate` existe para achar, num
lugar onde ele não olhava: teste verde que protege outra coisa. Trocar a ordem
das duas linhas no registro não quebraria nada — e o efeito no aparelho é o
assistente responder "não encontrei 'na loja centro' no almoxarifado" com o
saldo daquela loja na tela ao lado. Regra sustentada por coincidência de
vocabulário é exatamente o que a barra de verificação deste projeto foi feita
para não deixar passar.

**O que mudou.** O teste passou a perguntar a frase ambígua — "quanto tem na
loja centro" —, que é a única que distingue as duas ordens. E quatro mutações
novas (30 no total), uma por regra que só existia em prosa: a ordem do registro,
a recusa da carga **antes** de preparar o rascunho, a suposição de um tacho dita
em voz alta, e a permissão de produzir não sendo a de despachar.

**Uma segunda coisa, menor e cara.** O `mutate` se recusa a rodar com a árvore
suja nos arquivos que ele altera — e a sessão anterior morreu no limite de uso
com quatro arquivos por commitar. A recusa está certa (mutação esquecida dentro
de código compilado é pior que suíte vermelha), mas o efeito prático é que **a
barra inteira fica inacessível até o commit acontecer**. A ordem correta ficou
registrada: rodar `typecheck`, `lint` e `test` na árvore suja, commitar, e só
então `mutate`, `e2e`, `db:verify` e a proofgate — que leem `base..HEAD`, não o
que está aberto no editor.

## 1 de setembro — o caché que só existiria se a compilação já tivesse cabido

**O que apareceu.** Duas execuções do APK morreram, e as duas disseram
`cancelled` — a palavra que o GitHub usa quando o `timeout-minutes` mata o job,
e que não distingue "travou" de "demorou". Lendo o log até o fim: aos 26 minutos
começa `java.lang.OutOfMemoryError: Metaspace`, repetido por treze minutos, e
depois **vinte minutos sem uma linha nova** até o relógio matar. Não era
lentidão. Era o Gradle sem memória, batendo a cabeça em silêncio.

O teto vinha do `android/gradle.properties` que o `expo prebuild` gera:
`-Xmx2048m -XX:MaxMetaspaceSize=512m`. O runner tem 16 GB. **O limite era do
arquivo gerado, não da máquina** — e como `android/` é ignorado pelo git, ele
não aparece em nenhum diff: se regenera do zero a cada execução, sempre igual,
sempre pequeno.

**E embaixo disso, um nó.** O passo de caché era o `actions/cache@v4` inteiro,
que só grava no *post* de um job que terminou. Job morto por timeout não grava.
Então a execução seguinte também começava fria, também não cabia na hora, também
era morta — **o caché que faria a compilação caber só existiria se ela já
tivesse cabido**. O comentário no arquivo prometia "a segunda execução passa a
levar minutos", e não havia segunda execução possível. Duas horas de runner
queimadas provando isso.

**Por que importa além do APK.** É a Fundação da capa aplicada a CI: o número
que o dono ia usar ("não dá para gerar o instalador") estava errado, e a causa
não estava no lugar onde a mensagem apontava. Um limite de tempo é teto, nunca
explicação — e falha de memória usando o relógio como disfarce é a mais cara que
existe, porque cada tentativa custa uma hora antes de dizer nada.

**O que mudou.** Três coisas no `build-apk.yml`: memória de verdade para o
Gradle (`-Xmx6g -XX:MaxMetaspaceSize=2g`), com `grep` conferindo que o `sed`
casou — se o Expo renomear a chave numa versão futura, o passo falha na hora em
vez de a compilação morrer igual daqui a meses; `cache/restore` e `cache/save`
separados, com o save em `if: always()` e a chave carregando o `run_id`, para
que **cada tentativa deixe para a próxima o que já compilou**; e o comentário do
`timeout-minutes` dizendo o que ele é, para o próximo que ler não repetir a
leitura errada.

**O que ficou para a proofgate.** "Job com `timeout-minutes` usando
`actions/cache@` inteiro" é padrão que um script pega: o caché nunca grava
quando o relógio mata, e o sintoma é o mesmo sempre. Vai como guard, com teste
positivo e negativo, no repositório dela.

## 2 de setembro — corrigi a fome do APK e matei a máquina de indigestão

Continuação direta do achado acima, e ele custou uma execução inteira.

**A dose veio de um comentário, não de uma medição.** O diagnóstico do Metaspace
estava certo — a compilação foi de 26 minutos para 35 e passou por bundle,
Kotlin, dex, tudo o que nunca tinha alcançado, sem um único `OutOfMemoryError`.
Mas eu escrevi `-Xmx6g` porque li "o runner tem 16 GB", e **eu nunca conferi
isso**: era leitura minha de um comentário. Às 00:05 o log diz outra coisa —
`The runner has received a shutdown signal`, depois de nove minutos sem uma
linha. Não é o Gradle morrendo: é a máquina inteira. O Gradle não é a única JVM
ali; o compilador do Kotlin, o R8 e o aapt2 sobem as suas, e o que precisa caber
é a soma.

Trocar uma adivinhação por outra maior não é conserto. Agora o passo **lê a
RAM** (`free -m`), tira metade com piso e teto, imprime `nproc` e `free -h` no
log, e limita também a JVM do Kotlin. O número deixou de ser opinião.

**E o `if: always()` tem borda, que eu não conhecia.** Escrevi o passo de gravar
caché acreditando que `always()` cobria tudo. Cobre passo que falha e job
cancelado — **não cobre a máquina sumir**. Nesta execução o passo apareceu como
`skipped`, junto com todos os post-steps: nada roda num runner que morreu. O
caché continua certo para timeout e falha comum; contra máquina morta o que vale
é não estourar a memória dela.

**O terceiro erro foi pego antes de subir, e só porque o passo foi rodado de
verdade.** Eu ia acrescentar `kotlin.daemon.jvmargs` com `echo >>`, e o
`gradle.properties` que o prebuild gera **termina sem quebra de linha**: o
resultado seria `expo.inlineModules.watchedDirectories=[]kotlin.daemon.jvmargs=-Xmx1g`,
uma linha que estraga as duas propriedades e não reclama de nada. Rodar o passo
contra o arquivo real, com `bash -eo pipefail` como o GitHub roda, mostrou isso
em dois segundos. Ler o YAML não teria mostrado nunca.

**A regra que sai daqui, e vale além de CI:** quando a correção é um número que
descreve a máquina — memória, paralelismo, timeout — o certo é a máquina
responder, não eu. E quando o passo é shell, ele se roda antes de subir: três
defeitos nesta sessão vieram de texto que parecia certo lido.

## 2 de setembro — 7938 MB, e o passo que sai verde falhando

O APK saiu: `norva-arm64.apk`, 46,5 MiB, no release `apk-0.2.0`, compilado de
`4634c48` em 27 minutos. Três coisas que o log dessa execução ensinou.

**O número era 7938 MB, não 16 GB.** O passo que mede imprimiu `nproc` = 2 e
`Mem: 7.8Gi`. Ou seja: o `-Xmx6g` que eu tinha escrito pedia **76% da RAM da
máquina inteira** para uma JVM só, com o Kotlin, o R8 e o aapt2 ainda por vir. O
comentário que eu li dizia 16 GB e estava errado desde antes de mim — runner de
repositório privado é 2 núcleos e 7,75 GB. Medir custou uma linha de shell;
acreditar custou uma execução de 35 minutos e um runner morto.

**E o caché continuou não gravando — por outro motivo, com outro disfarce.**
Desta vez o passo rodou, e o log diz `zstd: error 70 : Write error : cannot
write block : No space left on device`. O `actions/cache/save` **não falha
quando não consegue gravar**: ele emite `##[warning]` e sai verde. O job inteiro
aparece bem-sucedido, o passo do caché aparece bem-sucedido, e o caché não
existe. Se eu tivesse olhado só a bolinha verde teria dito ao dono que a próxima
compilação seria rápida — pela terceira vez a mesma promessa, e pela terceira
vez falsa.

É a Lei da Inteligência do lado de dentro: **erro se impede, não se reclama** —
e um passo que "reclama e passa" é pior que um que falha, porque ensina a
confiar na cor. O conserto é abrir espaço antes (o runner traz .NET, Swift, GHC
e CodeQL que não compilam APK nenhum), mas a lição que fica é de leitura: em CI,
verde é convite para ler o log, não substituto.

**O padrão que aparece nas três execuções.** Toda vez a causa real estava a uma
linha de distância no log, e toda vez o resumo do GitHub dizia outra coisa:
`cancelled` para falta de Metaspace, `failure` para a máquina morrendo,
`success` para um caché que não gravou. O que o painel mostra é o desfecho, e
desfecho não é causa.

## 2 de setembro — o caché quente, medido: sete minutos, não "minutos"

A promessa aparecia no comentário do workflow desde a primeira execução — "a
segunda execução passa a levar minutos" — e foi repetida três vezes sem que
nenhuma segunda execução existisse. A execução 6 é a primeira que podia
restaurar o que a 5 gravou, e no mesmo commit (`1b4b749`), então o número
finalmente é comparável.

**O que o log diz, e o painel do GitHub não.** `Cache restored from key:
gradle-Linux-27906c7d…-33576896419` — 1 767 734 217 B, os 1,65 GiB que a
execução 5 escreveu, achados pelo `restore-keys` e não pela chave exata. O passo
"Abrir espaço em disco" repetiu o de sempre: 13 GB livres antes, 25 GB depois.

**O número prometido, enfim medido.** O passo "Compilar, só arm64" levou
**16 min 53 s** contra **24 min 13 s** da execução fria. São 440 segundos, 30% —
e o job inteiro caiu de 25m52s para 18m59s. Isso é o ganho real, e é menor do
que "minutos" dá a entender. Onde ele apareceu: a configuração do Gradle caiu de
79 s para 21 s, e o trecho até a primeira tarefa de CMake caiu de 254 s para
109 s; o resto veio diluído no miolo.

**E a linha que desmente a leitura fácil:** as duas execuções terminaram com
`871 actionable tasks: 871 executed`, zero `FROM-CACHE` e as mesmas 39
`UP-TO-DATE`. Ou seja: **nenhuma tarefa foi reaproveitada**. O que
`~/.gradle/caches` guarda é artefato baixado e transformado, não saída de
tarefa — caché de dependência não é caché de compilação. Reaproveitar
compilação exigiria `org.gradle.caching=true` e guardar `build-cache-1`, o que
**não foi feito nem medido**; escrever aqui que "daria" seria a quarta promessa
da série.

**A regra que sai daqui.** Um caché que restaura 1,65 GiB e um job 27% mais
rápido parecem, juntos, a prova de que o caché funcionou — e escondem que ele
não tocou na parte cara. A prova não é o tempo total nem a cor do job: é a linha
de contagem de tarefas. Vale o mesmo que a lição da execução 4, com o sinal
trocado: lá um passo verde escondia um caché vazio; aqui um caché cheio esconde
uma compilação inteira refeita. Nos dois casos o desfecho parecia responder pela
causa, e não respondia.

## 2 de setembro — o aplicativo se corrompia ao abrir uma tela, e a suíte estava verde por causa do dado semeado

O dono instalou o APK, mandou um print da home e disse: identifique por que estão
acontecendo esses erros. A home do print está certa — é o build novo, e o
`R$ 0,64` é exatamente o que o e2e exige do exemplo. **O print não tinha o
defeito; o defeito estava a um toque dali.** Quatro coisas saíram dessa caçada, e
três delas nenhuma suíte podia ver.

**A pior não precisa de celular nenhum.** A tela de receita pré-preenchia o campo
de perda com `String(Number((loss*100).toFixed(2)))` — e `String(2.5)` em
JavaScript é sempre `"2.5"`, com ponto. A linha logo abaixo relia esse campo com
`Number(s.replace(/\./g,'').replace(',','.'))`, que apaga pontos. Uma perda de
2,5% voltava **25%**. O `changed` usava o mesmo leitor quebrado, então o botão de
salvar acendia sozinho, sem ninguém digitar: **abrir a ficha bastava para
corrompê-la**, e o custo de todo produto que a usa ia junto. O guard existente só
barra perda acima de 10%; a faixa real de uma fábrica, 0,5% a 9,9%, passava muda.

**E a suíte estava verde por coincidência aritmética — de novo.** O `seed.ts`
semeia perdas de 0.02, 0.04, 0.05 e 0.08: todos percentuais inteiros, todos com
ida e volta limpa. As catorze verificações e2e nunca digitaram um separador em
campo nenhum — só `4`, `700`, `480`, `46000`. É o mesmo padrão que o `mutate`
documentou na capa deste projeto, agora do lado do dado: **o exemplo escolhido
não exercitava a regra, e verde não queria dizer protegida.**

**A regra que sai daqui: ida e volta é obrigação de quem escreve no próprio
campo.** Se uma tela pré-preenche um campo que ela mesma vai reler, o escritor e
o leitor têm de ser inversos comprovados — não duas funções que por acaso
combinam nos números do exemplo. Virou teste de propriedade (`parseTyped` ∘
`formatTyped` = identidade, nos três idiomas) e virou guarda no e2e: abrir a
ficha, não tocar em nada, e exigir que ela continue dizendo o que foi salvo.

**As outras três, todas invisíveis de dentro de um módulo:** tela alcançada pelo
botão Voltar mostrando o dado de quando montou — ninguém escutava foco, e a home
é a raiz da pilha, que num celular vive dias; produção gravando além do estoque e
levando o livro-razão a `-140.000 g` enquanto a própria tela avisava da falta; e
consumo gravando `7530,612244897959` g numa coluna `INTEGER`, que o SQLite aceita
calado e o Postgres arredondaria — aparelho e servidor discordando do mesmo saco
de açúcar.

**O que isso diz sobre a barra:** ela media o que um módulo faz, e os quatro
defeitos moram nas juntas — entre a tela e ela mesma, entre duas telas, entre o
aparelho e o servidor. O e2e navegava com `page.goto`, que remonta tudo; pessoa
não recarrega, pessoa toca em Voltar. Um `goBack()` no lugar de um `goto` era a
diferença entre uma suíte verde e o defeito que o dono viu.

## 2 de setembro — a suíte segurava a frase e deixava o número passar

O `mutate` acusou dois sobreviventes, os dois do commit da véspera, e os dois no
mesmo formato: **a regra nova tinha teste, e o teste checava a parte errada.**

O primeiro é o consumo do assistente. "Produzi 480 picolés" passou a debitar
insumo proporcional ao que saiu em vez de um tacho suposto, e o teste existia —
ele exigia a frase "pelo que saiu" no texto. Trocar `units / porTacho` por `1`
mantém a frase intacta: o texto continua dizendo que contou pelo que saiu,
enquanto o rascunho debita um tacho inteiro. **Duzentos e três testes verdes, e o
que eles seguravam era o aviso, não a conta.** O teste agora aplica o rascunho e
confere o número gravado.

O segundo é o empate de nomes. Com a grade linha × tipo × sabor, "morango"
alcança doze produtos, e `findByName` passou a devolver nulo em vez do nome mais
curto — que era sorteio disfarçado de esperteza. Nenhum teste tinha dois
candidatos: os do arquivo têm um "morango" só, então o empate nunca acontecia e a
volta ao comportamento antigo passou muda.

**O padrão, que é o que interessa:** quando uma regra muda de comportamento, o
teste que sobrevive à mudança costuma ser o que olha para o texto — porque texto
é o que o autor acabou de escrever e tem fresco na cabeça. O número fica para
depois, e depois não vem. Vale a pergunta na revisão: *este teste falharia se a
conta estivesse errada e a frase certa?*

## 2 de setembro — a lista escrita à mão protege só o que já existia

`src/layers.test.ts` é o guarda que impede SQL fora da camada de dados, e ele
varria `['app', 'src/domain', 'src/assistant', 'src/components', 'src/sync']` —
uma lista digitada. Criei `src/weather/`, e a checagem continuou verde sem nunca
ter aberto um arquivo dela. **Uma regra que enumera o que fiscaliza protege o
código velho, que não é o que quebra.** Agora as pastas saem de `readdirSync`:
tudo em `src` menos a camada de dados, mais `app`. Pasta nova nasce dentro da
regra sem ninguém lembrar de escrevê-la.

## 2 de setembro — a primeira dependência de rede não pode entrar pela porta do briefing

O dono pediu clima na tela inicial, e a tentação era óbvia: somar
`forecastForScreen()` ao `Promise.all` que a capa já faz. Seria a primeira vez
que uma tela deste aplicativo espera pela internet — e o `Promise.all` é
solidário, então o briefing inteiro (que sai do SQLite em milissegundos) passaria
a demorar o que a rede da fábrica demorar. **Oito segundos de tela vazia para
mostrar um número que o banco já tinha respondido.**

São duas consultas, e a que depende de rede chega sozinha, depois. O mesmo
raciocínio decidiu o resto do desenho: cache primeiro e rede só para melhorar;
previsão guardada com a data conferida contra hoje, porque desenhar a máxima de
anteontem é a doença do saldo congelado com outra roupa; e a cidade deduzida do
fuso do aparelho em vez de perguntada, com o nome visível no cartão para que o
palpite errado seja corrigível num toque.

## 2 de setembro — o número sumiu da frase, e o compilador achou ótimo

O cartão novo da capa saiu do navegador dizendo **"Picolé de morango · unidades"**
— sem a quantidade, num aviso cujo assunto inteiro é a quantidade.

A causa é de uma linha: `plural(n, t.units.unit, formatQuantity(n))`. Metade das
entradas do dicionário carrega `{{n}}` (`'{{n}} caixas'`), e metade é só a
palavra (`units.unit` é `'unidades'`, porque as telas escrevem o número ao lado).
Chamada com um número para mostrar, a segunda metade **jogava o número fora**:
`fill` não acha onde pôr, devolve a palavra, e ninguém reclama. Compilou, passou
nos 218 testes, e só o e2e viu.

Duas mudanças saíram daí, e a segunda é a que vale.

**`plural` não perde mais o número:** quem passou um número quis mostrá-lo, e se
a frase não tem onde recebê-lo, ele vai na frente. Perder dado em silêncio é
sempre pior que uma frase um pouco torta.

**E o `Widen<T>` obriga a chave, não o buraco.** Essa é a descoberta maior: a
fundação de i18n deste projeto garante que uma chave nova em português quebra a
compilação das outras duas línguas até serem escritas — e não olha para dentro da
frase. `'Ontem foram {{amount}}.'` traduzido como `'Yesterday.'` compila limpo, e
a Lei 3 fica desligada em silêncio no idioma que ninguém desta sala lê para
conferir. Agora existe `src/i18n/i18n.test.ts`: os três dicionários, folha por
folha, com os mesmos buracos nas mesmas frases.

## 2 de setembro — o dia combinado não é um instante

Um pedido "para quinta" não tem hora. O livro-razão inteiro deste app é feito de
instantes — "às 14h32 saíram 40 caixas" — e a tentação era reaproveitar o que já
existe: `dayWindow(...).from.slice(0, 10)`.

Está errado, e o erro é invisível de dentro do Brasil. A meia-noite local de 3 de
setembro em Madri é **2 de setembro às 22h em UTC**: o corte devolve o dia
anterior, e um pedido combinado para quinta aparece como quarta para metade dos
fusos do mundo. Do lado negativo o atalho acerta por acaso, que é exatamente como
esse tipo de defeito atravessa uma revisão.

Então `localDate()` faz a conta sobre a data local, e `formatCalendarDate()` a
mostra sem passar por fuso nenhum. O par tem teste com Madri, com São Paulo,
antes e depois da meia-noite, e virando o mês.

## 2 de setembro — pedido não é movimento, e a fundação decide isso sozinha

A demanda cabia em `movements`: item, quantidade, lugar e data já existem lá. Mas
duas fundações respondem antes de qualquer conveniência.

Saldo é a soma dos movimentos: um pedido não move nada, as caixas continuam no
freezer, e quem conferir a prateleira acha tudo o que o sistema diz que tem.
Gravar demanda como movimento faz o saldo **mentir no dia da ligação**.

E o livro-razão é append-only, enquanto um pedido muda o tempo todo — o cliente
corrige a quantidade, adia, cancela. Corrigir isso por estorno seria escrever no
livro que trezentos picolés saíram e voltaram, quando nenhum saiu.

O que isso ensina para a Fase 3 inteira: **compromisso e fato são tabelas
diferentes**, e o elo entre eles é um evento só — a carga que sai, que já é a
transferência de 0001. Reserva, separação e devolução vão cair no mesmo desenho.

## 2 de setembro — o `/insights` ficou cego justamente onde o trabalho acontece

O dono rodou `/insights` e o relatório veio vazio: **"0 messages across 0
sessions (1 total)"**, com todas as seções dizendo "No data". A pergunta dele foi
a certa — *isso sempre volta assim?* Não: em 1 de setembro às 15h48 o relatório
contou 27 mensagens e 14 commits, e o de 2 de setembro à 1h35 contou 16
mensagens. O de hoje é o primeiro zerado.

E o dado existe. `usage-data/session-meta/` tem o arquivo desta sessão, gravado
no mesmo minuto do relatório: **68 minutos, 275 mensagens do assistente, 164
chamadas de Bash, 2 commits**. A coleta funcionou; o que não aconteceu foi a
análise — `usage-data/facets/` tem **um** arquivo, de 1 de setembro às 12h53, e
todo número do topo do relatório é somado sobre as sessões analisadas.

A causa provável está no jeito como este projeto trabalha: **é uma sessão só,
longa, retomada** — o id `3cd30dd5…` é o mesmo desde 1 de setembro e o transcrito
já tem 37 MB. O relatório chaveia por id de sessão, e uma sessão que ele já
analisou (ou grande demais para reanalisar) é pulada. Some com ela e não sobra
sessão nenhuma para somar.

Duas consequências, e as duas são práticas:

**Enquanto o trabalho continuar dentro desta sessão, `/insights` vai devolver
nada** — não é uma sessão sem atrito, é uma sessão invisível. Para ter leitura de
fora, o comando precisa ser rodado a partir de uma sessão nova.

**E mesmo funcionando, ele nunca mediu código**: os relatórios de 1 e 2 de
setembro, os com dado, dizem `+0/-0 Lines, 0 Files` — a parte que contaria o que
mudou no repositório está zerada em todos. O que ele mede aqui é conversa, atrito
e ferramenta, não trabalho entregue.

Isso vale como aviso escrito no `CLAUDE.md`, porque a diretriz manda agir sobre o
que o relatório mostra — e um relatório que não vê o trabalho não é "está tudo
bem", é instrumento quebrado. A regra do alerta inventado vale para as
ferramentas também: número que não mede nada ensina a ignorar o painel.

## 2 de setembro — o dono abriu o aplicativo e a capa estava respondendo a pergunta errada

**O que apareceu.** Ele mandou a foto da tela publicada: clima, um cartão grande
com **R$ 0,64 cada um** para o picolé de morango, "Nada mudou de preço", e o
botão. E disse o que faltava — *"esse valor do morango aí não interessa; o que
interessa é produção do dia, do dia anterior, alerta de ingredientes"*.

**A parte que dói: os números que ele pediu já estavam calculados.** A consulta
da capa devolve `madeToday`, `madeYesterday`, `madeThen`, `shortly` (o que acaba
em sete dias), `demand`, `boxes` e `running` — tudo isso já existia, com teste. O
que decidia se apareciam era uma guarda: `data.everMade`. Numa fábrica que ainda
não produziu, **o cartão de produção não existe** — e some junto com ele o único
assunto da tela. Sobrou o custo, que era o cartão sem guarda nenhuma.

Ou seja: não era falta de dado nem falta de query. Era **hierarquia** — a tela
respondia "quanto custa fazer" (pergunta boa, hora errada: de manhã, de pé, o
que se decide é o que produzir hoje) e escondia "o que aconteceu hoje" justamente
quando a resposta era zero.

**A segunda coisa, que ele viu e o repositório não.** *"Eu quero VIDA; o app todo
estático, sem animação e nem graça nenhuma."* O `tokens.ts` tem `motion.settle`,
`motion.press`, `motion.pressScale` e `motion.staggerMs` desde o começo, com
cinco regras escritas em cima — e **nada os usava** fora do `PulseDot`. O sistema
de movimento existia inteiro no papel e não tinha um chamador. É a mesma doença
do `assistant_phrase` com índice dedicado e nenhuma escrita, e o portão P1 não
pega este caso porque o que falta não é o chamador de uma função: é o uso de um
*token*.

**O que mudou.** A produção do dia virou a manchete e não some mais no zero;
ganhou uma régua de sete dias (`dailySeries` + `Bars`) que responde a pergunta que
nenhuma tela respondia — *o que é normal aqui*. O alerta de insumo ganhou o lado
calmo que faltava. O clima virou cena desenhada, com a cor saindo da máxima e o
sol virando nuvem quando chove. O custo por unidade saiu da capa e continua
inteiro na receita; o cartão "Nada mudou de preço" saiu de vez, porque ocupar a
tela todo dia para dizer que não há notícia é o alerta que ensina a ignorar
alerta. E `Reveal`/`Touchable` deram ao sistema de movimento os primeiros
chamadores.

**O que a limpeza revelou.** Tirar o cartão de custo deixou órfã a metade da
consulta da capa: `listProducts`, `loadRecipeGraph`, `itemCosts`, `labels`,
`ratesBefore`, `costPerProductUnit`, `costRecipe` e um `lastCostMove` **por
produto** rodavam a cada abertura do aplicativo para alimentar um cartão que o
dono não olhava. Saíram todos.

## 2 de setembro — o `[por quê?]` fala um idioma só

**O que apareceu.** Procurando onde o percentual era formatado à mão, achei
`src/components/WhySheet.tsx` com o texto cravado em português: "Custo do lote",
"Perda prevista", "% do lote", "sobram", "Custo por unidade de massa", "Fechar".

**Por que importa mais que uma tela qualquer.** Esta é a folha que abre a conta
de toda conclusão do aplicativo — a Lei 6 em pessoa. Uma fábrica que rodar o app
em espanhol vê a interface inteira traduzida e, no momento em que pede a prova do
número, recebe português. O `Widen<T>` não pega isto: ele obriga a chave a
existir nos três dicionários, e não obriga a tela a usá-los.

**E o vizinho, da mesma família.** `(x * 100).toFixed(1)` aparecia em três
lugares — a capa, a receita e esta folha. É o ponto decimal do JavaScript num
aplicativo que fala português e espanhol: a alta da polpa saía como "9.0%".
Virou `formatPercent`, no único lugar que sabe o idioma.

## 2 de setembro, noite — o lote estava pronto no servidor e sem escritor, e a política dele tinha o mesmo buraco de sempre

**O que apareceu.** A Fase 2 pede lote e validade. A tabela `lots` existe no
servidor **desde a primeira migração** — código, data de produção, validade,
`unique (company_id, code)` — e `movements.lot_id` tem índice parcial dedicado.
Nada nunca escreveu nela. O aparelho tinha o `lot_id` e nem a tabela: o próprio
`docs/insights.md` já havia nomeado a dívida e previsto onde ela quebraria — *"a
fila não trava hoje porque nulo passa na chave estrangeira; trava no dia em que a
Fase 2 gravar o primeiro lote"*.

**E a política repetiu o defeito de julho.** `lots_write` cobre `insert` e não
existe política de `update` — enquanto a fila do aparelho sobe com
`on conflict (id) do update`, porque reenviar é o caso normal de um celular que
perde sinal. É **exatamente** o que a migração `0015` consertou para `purchases`
e `purchase_lines`, esperando aqui desde o dia em que a tabela nasceu. Peça sem
escritor não é peça pronta: é peça não exercitada, e o que não é exercitado não é
protegido por nada.

**O que a barra pegou sozinha, sem eu procurar:**

- **O guard da sessão do aparelho parou o script**: *"a sessão não exercita
  `lots` — a checagem 6 cobriria menos do que promete"*. Uma tabela nova que
  `serialize` diz saber mandar e que nenhuma sessão exercita é promessa que
  ninguém cobrou.
- **O guard de ambiguidade do `mutate`, escrito hoje de manhã, cobrou a primeira
  fatura**: mudar a assinatura de `write` deixou obsoleta a mutação que inverte o
  sinal do consumo — a que garante que produzir não *enche* o almoxarifado. Sem o
  guard ela teria sumido em silêncio, com a lista inteira reportando verde.
- **O e2e derrubou um diálogo que eu tinha acabado de inventar.** Eu fiz o código
  do lote aparecer num alerta depois de gravar; a checagem não conseguiu mais
  alcançar a barra de abas. Traduzido: um toque a mais na ação mais frequente do
  dia, todo dia, para informar o que a tela seguinte mostra sozinha. O lote virou
  cartão na aba de produção — e ficou melhor, porque quem procura de que lote é
  uma caixa procura **horas depois**, não no segundo seguinte.

**A decisão que o código carrega, para não virar pergunta de novo:** um lote por
**corrida**, não por dia nem por produto — se o tacho da manhã derreteu e o da
tarde não, o recall é do tacho da manhã. E a validade é do **produto**,
perguntada uma vez no cadastro: quem está de luva não sabe de cabeça que picolé
dura seis meses. Produto sem prazo gera lote **sem validade**, e isso é resposta,
não falha: data inventada descarta mercadoria boa ou vende mercadoria vencida.

## 2 de setembro, madrugada — o que destravou o design não foi gosto, foi método

**O que apareceu.** O dono recusou a capa três vezes seguidas — *"está feio
ainda"*, *"você não acerta a mão"* — e na quarta rodada disse o contrário:
*"passei meses brigando com você por causa de design e finalmente me mostrou
algo que preste"*. Entre a terceira e a quarta eu não melhorei de gosto. Mudei
**quem decide** e **quanto custa cada tentativa**.

**As três primeiras rodadas tinham a mesma forma:** eu escolhia uma direção,
construía em React Native, mostrava, ele recusava. Cada tentativa custava horas
e voltava uma frase — *"melhorou, mas sei lá"*. Isso não é iteração, é adivinha
cara.

**O que funcionou, e é o que fica escrito:**

- **Esboço em HTML, não no aplicativo.** A pergunta era de linguagem visual —
  raio, densidade, escala tipográfica, onde a cor entra. Ela se responde em
  vinte minutos por lote em HTML contra horas por tentativa em React Native. Dez
  esboços custaram menos que a segunda tentativa em código.
- **Dez opções em vez de uma defesa.** Com uma, ele só podia aprovar ou recusar
  a minha. Com dez, ele escolheu cinco, depois três, depois duas — e cada corte
  dele me disse mais do que qualquer explicação minha teria dito.
- **A correção dele vale mais que a minha leitura dela.** Quando disse *"quero
  mais contraste, está apagado"*, eu li "cor em mais lugares" e entreguei três
  degraus de mais cor. Errado: era **saturação**, não quantidade. Ele corrigiu
  em uma linha e a rodada seguinte acertou.
- **E parte do que ele recusou era acerto meu que não era acerto.** O selo de
  ícone cheio parecia melhoria e brigava com a ilustração monoline do topo. Eu
  não teria visto sozinho.

**A regra que isso vira.** Quando a decisão é de gosto do dono — marca, cara,
tom — o meu trabalho não é escolher bem: é **fazer a escolha dele ser barata**.
Muitas opções, rápidas, comparáveis, com o mesmo dado. É o mesmo princípio do
"depende vira dado" das fundações, aplicado à conversa em vez de ao código: se a
resposta certa depende de quem usa, não se adivinha — se instrumenta a escolha.

E o desdobramento veio dele: *"a gente poderia dar várias opções desses elementos
para a pessoa configurar a tela inicial dela"*. A capa configurável é a mesma
ideia descendo para o produto — cada fábrica olha uma coisa diferente de manhã, e
escolher por elas é errar para duas em cada três.

## 3 de setembro — o `mutate` roda a suíte rápida, e isso decide onde a regra mora

**O que apareceu.** Um mutante sobreviveu **três vezes** à barra inteira: o que
inverte a ordem do palpite da separação (pedido ganha do hábito). As três
tentativas de matá-lo ensinaram três coisas diferentes, e a terceira é a que
muda o desenho do projeto.

**Primeira tentativa — faltava teste.** Escrevi uma asserção de e2e: com pedido
em aberto, a tela sugere o número do pedido. Não matou.

**Segunda — o defeito era outro, e era real.** Investigando, achei que a sugestão
estava calculada em **dois lugares**: o número mostrado no campo e o número usado
para gravar. Inverter a ordem mudava um e deixava o outro — *"o app gravou
diferente do que estava escrito"*, que é a pior coisa que este aplicativo pode
fazer com quem ainda decide se confia nele. Unifiquei. Não matou.

**Terceira — o motivo estrutural.** `scripts/mutate.mjs` roda `npm test`, a
suíte rápida. **Regra que mora dentro de um componente de React nunca é
alcançada por ele**, por mais e2e que se escreva. E o mesmo já tinha acontecido
horas antes com a zona de silêncio do QR, que sobreviveu a dois mutantes até
descer para `src/domain/qr.ts`.

**A regra que sai daí, e ela é de arquitetura, não de teste:** *toda decisão que
merece um mutante mora no domínio.* Se está numa tela, ou não merece o mutante,
ou está no lugar errado. `pickSuggestion` e `qrPath` nasceram desse critério.

**E um caso de negócio apareceu no caminho.** Escrevendo o teste da ordem de
preferência, apareceu o que eu não tinha pensado: **pedido de zero é um pedido**,
não a ausência de um. A loja que pediu e cancelou não pode receber de volta o
envio da semana passada — `ordered ?? lastSent` acerta isso e
`ordered || lastSent` erraria.

**Uma quarta lição, de método.** O teste da primeira tentativa passava com a
mutação aplicada porque, naquele fluxo, a loja **nunca tinha recebido carga**:
com uma das duas fontes vazia, qualquer ordem dá o mesmo número. Teste de regra
de precedência só prova alguma coisa com as duas fontes **discordando** — e essa
é a mesma família do teste da margem do QR, que usava a própria constante nos
dois lados da igualdade e não podia falhar.

## 3 de setembro — o guard media tabela, e a política é por TIPO

**O que apareceu.** A sessão do aparelho (`scripts/device-session.ts`) tem um
guard que recusa rodar se alguma tabela que o `serialize` sabe mandar não for
exercitada — *"a checagem 6 cobriria menos do que promete"*. Ele estava certo e
media a coisa errada.

No servidor, `movements_append` decide por **kind**, não por tabela:

```sql
case kind
  when 'production'  then has_capability(company_id, 'record_production')
  when 'transfer'    then has_capability(company_id, 'dispatch')
  when 'loss'        then has_capability(company_id, 'record_loss')
  when 'return'      then has_capability(company_id, 'check_receipt')
  ...
```

Uma sessão que grava movimento de três tipos e replica só dois passa no guard de
tabela com a política do terceiro **nunca exercitada**.

**O tamanho do buraco.** Fui atrás porque a devolução que entrou hoje nunca tinha
sido replicada. Com o guard passando a medir tipo, apareceu que **transferência e
perda também não eram**: de sete tipos que este aplicativo sabe escrever, **três**
nunca tinham encostado nas políticas do servidor. Não é hipótese — as três só
falhariam na primeira loja que devolvesse mercadoria, ou na primeira perda
registrada, em produção, com a fila inteira parada atrás.

**A regra que sai daí.** Um guard de cobertura tem que medir a dimensão em que a
REGRA varia, não a dimensão em que o dado é organizado. Aqui a regra varia por
`kind`; a tabela é só onde ele mora. É a mesma forma do erro que o `mutate`
cometia até hoje de manhã: contar mutações aplicadas em vez de conferir que cada
uma casa num sítio só.

**E a lista cobrada é a do que o app SABE escrever**, não o enum inteiro do
servidor: `sale` e `reversal` não têm escritor, e cobrar por eles seria pedir que
a sessão finja um caminho que não existe — que é a mesma mentira, do outro lado.

## 3 de setembro — a lei mais citada do projeto não era conferida por nada

**O que se viu.** A varredura tela a tela pela Lei da Inteligência achou o mesmo
defeito três vezes seguidas, e nenhuma suíte tinha reclamado de nenhuma delas: o
transporte dizia "3 destinos hoje", o almoxarifado dizia "R$ 1.552,50 parado" e o
relatório de perdas dizia "R$ 148,00 em 4 perdas" — os três números sozinhos, sem
nada ao lado que dissesse se aquilo é muito ou pouco. O item 3 da lei ("nenhum
número aparece sozinho — sempre com a comparação") está escrito no `CLAUDE.md`
desde o começo do projeto.

**Por que importa.** Três não é coincidência, é a taxa. A capa foi auditada
quando foi redesenhada, e por isso compara; toda tela que não passou por uma
auditoria dessas nasceu com o número nu, porque a lei mora num arquivo de texto e
texto não roda. O efeito no aparelho é pior que a ausência: R$ 1.552,50 parado no
estoque é um mês tranquilo numa fábrica e dinheiro morto noutra, e quem abre a
tela não tem como saber qual das duas é a dele — então o número grande vira
decoração, e a tela ensina que os números daqui não servem para decidir.

**O que mudou.** Os três ganharam a comparação que faltava, e cada uma teve que
ser a comparação honesta daquela tela, não a mais fácil: o transporte compara com
ontem; as perdas comparam com os trinta dias anteriores (mesma duração, mesmos
motivos); e o almoxarifado **não** compara com o mês passado — valorizar o saldo
de agosto ao preço de setembro seria inventar dinheiro —, compara com quanto
tempo aquilo dura na saída que a própria fábrica registrou. Para essa frase falar
do mesmo conjunto que o número, `runningOut` passou a recortar por sala e por
tipo, com o mutante que prova o recorte.

**E a lei virou teste, que é o ponto.** `src/law.test.ts` mantém um registro: toda
tela com número grande declara qual é a comparação dela, ou escreve por que não
há o que comparar. O registro existe em vez de uma heurística porque exigir
comparação de todo número grande alarmaria errado — num formulário o número é o
que a pessoa está digitando agora, e a comparação dele é o próprio formulário. O
teste pega o caso real: uma tela nova com número nu quebra a suíte até alguém
responder a pergunta, e "é um formulário" é resposta válida desde que escrita.
Foi provado nos dois sentidos — uma tela falsa com `type.figure` reprova, e apagar
a comparação de uma tela declarada reprova.

## 3 de setembro — a loja que o sistema só via depois da primeira carga

**O que se viu.** Construindo a ficha de acordo, a tela de lugares mostrou uma
coisa que não tinha nada a ver com o acordo: ela lista `stockByPlace`, e essa
consulta começa em `movements`. Um lugar sem movimento não existe para ela. Uma
loja cadastrada hoje de manhã só aparece na lista depois que alguém manda a
primeira carga para lá.

**Por que importa.** A ordem real do trabalho é a inversa: cadastra a loja,
combina o dia de entrega e o telefone, e **só então** manda a primeira carga.
Durante toda essa janela a loja está invisível na única tela que a lista — e o
menu chama essa tela de "Lojas e clientes". O efeito previsível não é o usuário
reclamar: é ele cadastrar a mesma loja de novo, e a fábrica passar a ter duas
"Loja Centro" com saldo dividido entre elas. Nenhum alerta acusaria isso, porque
duas lojas com nomes parecidos são um cadastro perfeitamente válido.

**O que mudou.** A tela passou a listar **lugares**, com o saldo encaixado
quando existe: quem não tem nada mostra "nada aqui ainda" em vez de sumir. É a
mesma distinção que o projeto já fez em outro canto — a consulta que responde
"quanto tem" não é a que responde "quem existe", e usar uma no lugar da outra
some com o que ainda não se moveu.

**E o `mutate` pegou um guarda que era decoração.** `agreedOn(days, weekday)`
tinha `if (weekday < 0 || weekday > 6) return false` e apagar essa linha não
quebrava teste nenhum. O motivo não era teste fraco: indexar fora da tabela de
bits devolve `undefined`, que vira zero na conta e responde "não combinado"
sozinho — o guarda não mudava comportamento nenhum. Virou `RangeError`, porque um
oitavo dia é bug de quem chamou e um "não" educado esconde o bug atrás de uma
frase plausível na tela. Foi o segundo achado do dia em que a ferramenta mostrou
que uma regra estava sustentada por coincidência da linguagem, não por decisão.

## 3 de setembro — o vocabulário estava chumbado, e ninguém tinha visto

**O que se viu.** O dono perguntou de onde saiu o "tacho" e por que ele tinha um
cartão na capa. A resposta honesta é que saiu de mim: a receita declara quanto
rende de cada vez, a produção precisa de um multiplicador para descontar insumo, e
esse multiplicador ganhou o nome do recipiente de uma sorveteria. Vinte e uma
ocorrências, nos três idiomas.

**Por que importa.** A capa deste projeto diz "nada de regra chumbada de sorvete,
nada de nome de empresa" — e eu chumbei o **vocabulário**, que é a versão mais
difícil de enxergar. Uma fábrica de pão de queijo não tem tacho, e ia ler "Quantos
tachos" no cadastro dela. Pior: o número já era dedutível (a tela deduz o
multiplicador do que saiu), então a palavra existia sem precisar existir.

**A causa de fundo era de TIPO, não de texto.** `Recipe` carregava `yieldAmount` e
**não** `yieldUnit` — a unidade que o dono escolhe no cadastro morria no banco. Sem
ela, nenhuma tela tinha como dizer "cada vez rende 40 L", e a palavra inventada
preencheu o buraco. Toda vez que uma tela inventa vocabulário, vale procurar o
campo que não chegou até ela.

**O que mudou.** A unidade viaja com a receita; a tela fala "quantas vezes a
receita rodou" com a dica na unidade do cadastro; o widget do tacho saiu do
catálogo (era o mesmo assunto da produção ao vivo, e duas peças para um assunto é
a capa competindo consigo mesma); o pulso mudou de casa em vez de morrer.

**E uma regra geral saiu daqui, que vale mais que a correção:** *dado disponível
não é motivo para existir palavra na tela.* O cartão do tacho existia porque
`openProductionRun` existia. A capa é o que a casa olha de manhã, e cada peça a
mais empurra o resto para baixo.

## 3 de setembro — seis opções não são configuração

**O que se viu.** Construí a hora do aviso como seis chips que eu escolhi: 5, 6,
7, 8, 12, 18. O dono cortou em uma frase — "nem toda fábrica funciona igual" — e
tinha razão de um jeito que eu não tinha visto: **eu chamei de configuração um
menu**. A fábrica que começa às 5h30 não estava em nenhuma das seis.

**Por que importa.** A F7 do projeto diz que "depende de quem usa" vira dado, não
pergunta — e eu obedeci pela metade. Oferecer um conjunto fechado de valores é
escolher pelo cliente com uma aparência de escolha, que é pior que escolher
abertamente: o dono não percebe que a decisão foi tomada por ele.

**O que mudou.** `hour` virou `minuteOfDay`, com hora e minuto livres. Um número
só, e não dois campos no tipo, porque dois abrem a porta para um estado impossível
(hora 5, minuto 90) — a tela junta antes de gravar.

**A pergunta que ficou para as próximas telas:** onde mais eu ofereci um conjunto
fechado achando que era configuração? Os chips de antecedência (1, 2, 3, 5, 7, 14)
são o próximo suspeito, e a diferença é que ali o conjunto é uma sugestão sobre um
número de dias — não uma restrição do que existe. Vale rever quando alguém pedir
quatro dias.

## 3 de setembro — a fração morreu na tela, não no banco

**O que se viu.** A primeira leitura de temperatura gravou -18,4 e a tela mostrou
-18. O banco estava certo; `formatQuantity` arredonda, porque foi escrito para
quantidade — unidade, grama, caixa — onde inteiro é o certo.

**Por que importa.** É o mesmo defeito de arredondar dinheiro cedo, do outro lado
da parede: o número dito deixou de ser o número guardado. Meio grau de freezer é a
diferença entre uma câmara boa e uma que está começando a falhar, e é justamente o
que uma série histórica existe para mostrar.

**O que mudou.** A leitura usa `formatTyped` com uma decimal, e o e2e cobra
`-18,4` na tela. O achado maior é a categoria: **todo formatador carrega uma
suposição sobre o que é precisão suficiente**, e ela é invisível até um dado novo
passar por ele. Grandeza física é o primeiro dado deste app que não é contagem.

## 3 de setembro — dois ids do mesmo tipo, e o compilador de acordo

**O que se viu.** Relendo o código que eu tinha acabado de empurrar, achei
`placeId: d.itemId` nos fatos do alarme. A demanda vem agrupada por **item** e o
aviso conta **lojas** — com o id do item no lugar do id da loja, quatro sabores
pedidos pela mesma loja viravam "quatro lojas esperando".

**Por que importa.** O TypeScript não reclamou porque os dois são `string`, e
nenhuma tela mostrava esse número: ele só existe dentro de uma notificação, que
nenhuma suíte desta máquina consegue ler. O defeito estava no ponto exato onde as
três redes deste projeto não alcançam — tipo, tela e teste.

**O que mudou.** Os fatos passaram a ler os pedidos em aberto (que sabem de qual
loja são) em vez de derivar loja da demanda. E o teste que prova isso é contra
**banco de verdade**, não contra um objeto montado à mão: um dublê teria
concordado com o defeito, porque eu mesmo o teria montado com o id errado.

**E a separação que o teste forçou é o achado maior.** Os fatos moravam no mesmo
arquivo do agendador, que importa `react-native` para saber a plataforma — e um
teste de Node não transforma esse pacote. Ou seja: **a função não era testável, e
era exatamente ali que o defeito estava.** Fato é trabalho da camada de dados;
plataforma é o que fica no adaptador. A regra prática que sai daqui: quando um
teste não consegue importar uma função, isso não é limitação da ferramenta — é
sinal de que a função está na camada errada.

A mutação que guarda o caso está na lista (68 agora), e ela reprova se alguém
trocar a loja pelo item de novo.

## 3 de setembro — a régua que o dono digitava não saía do aparelho

**O que se viu.** Auditando o eixo que o `CLAUDE.md` nomeia — *o que o aparelho
grava contra o que o servidor aceitaria* — achei `items.full_level` fora do
serializador. A coluna existia no aparelho, a tela escrevia nela, o teste do
repositório provava que ela persistia, e ela **nunca chegaria ao servidor**.

**Por que importa.** É a forma mais silenciosa de perda de dado que este projeto
tem: nada falha. Um celular novo da mesma fábrica abriria sem faixa de cor
nenhuma, o dono cadastraria a régua de novo, e ninguém saberia por quê. E o guard
que já existe — o da sessão do aparelho — cobra **tabela** sem escritor, um andar
acima de onde o defeito estava.

**O que mudou.** A coluna atravessa, e nasceu um guard de **coluna**:
`src/sync/columns.test.ts` compara cada coluna das tabelas do aparelho com o que o
serializador manda, e exige que a diferença esteja **escrita** — ou vai no `take`,
ou tem uma linha dizendo por que fica aqui. Registro em vez de heurística, como no
`law.test.ts`: existem colunas que legitimamente não sobem, e a diferença entre
"não sobe porque é do aparelho" e "não sobe porque alguém esqueceu" não está no
nome dela.

**E ele achou uma segunda no primeiro uso:** `purchase_lines.created_at`. Essa é
legítima — o servidor não tem a coluna, a linha de compra herda a hora da nota — e
agora está declarada com o motivo, em vez de ser uma ausência que ninguém sabia
explicar.

**A lista de colunas que o `build` acrescenta é obtida CHAMANDO o build**, não
escrita ao lado dele. Uma lista à mão ao lado do código é a mesma lista à mão que
já deixou `src/weather` fora da checagem de camadas por meses.

## 3 de setembro — o guard que eu escrevi passaria verde na cicatriz que ele cita

**O que se viu.** Escrevi um guard para "frase de tela cravada em vez de no
dicionário", e o docblock dizia que ele teria pegado o `WhySheet` — a folha do
`[por quê?]`, que tinha "Custo do lote" e "Perda prevista" em português. A régua
era **acento**. *"Custo do lote" não tem acento nenhum.*

**Por que importa mais que o bug.** Um guard que passa verde no próprio caso que
cita é pior que guard ausente: ele **anuncia** uma proteção que não existe, e
alguém para de procurar aquele defeito à mão. O caso de controle que eu escrevi em
seguida — "a cicatriz tem que reprovar" — foi o que expôs isso em cinco minutos.
A lição é a forma do caso, não o guard: **todo guard precisa de um teste que
reprove com a cicatriz original**, não com um exemplo inventado depois.

**O que mudou.** A régua passou a ser palavra funcional ("do", "da", "de", "para",
"que"…) com espaço, e não caminho. Ela saiu de três alarmes falsos, cada um com
motivo diferente e cada um agora fixado como caso: `as` é palavra-chave do
TypeScript (acusava `as Draft['kind']`), literal de uma palavra não é frase
(`'input'`), e caminho de importação casa com "do" (`@/domain/day`).

**E na primeira execução de verdade ele achou um defeito.** A confirmação da
produção montava `` `${quantidade} ${unidade} de ${nome}` `` — com o **"de"
cravado**. Em inglês a frase sai "18.000 g **de** Polpa" no meio de uma interface
traduzida. Foi para `common.amountOf`, que em inglês é "of".

**Um detalhe de arrumação que também é regra:** a chave nasceu em `units` e não
podia ficar lá — `units` é dicionário de PLURAIS, e `formatPacked` recebe o objeto
inteiro esperando que toda entrada tenha `one`/`other`. O compilador pegou. Chave
no lugar errado quebra quem consome o grupo, não quem a escreveu.

## 3 de setembro — o teste passou aqui e reprovou no CI, e a diferença era a internet

**O que se viu.** Uma checagem minha afirmava que, numa instalação virgem,
**nenhuma peça da capa convida** para abrir. Passou na máquina de
desenvolvimento e reprovou no runner. A diferença não era o código: era a **rede**.
Aqui a previsão do tempo não é alcançada, então o cartão do tempo não existe; no
runner ela é alcançada, o cartão aparece — e ele **convida com razão**, porque tem
a semana para mostrar.

**Por que importa.** A afirmação estava larga: eu cobrei da CAPA INTEIRA uma
propriedade que era da PEÇA. Uma afirmação larga é a que primeiro mente quando o
ambiente muda, e ela mente para o lado pior — verde onde deveria reprovar, ou
vermelho onde não há defeito. Neste caso as duas coisas ao mesmo tempo, em máquinas
diferentes.

**O que mudou.** A afirmação passou a olhar a sequência da própria peça:
`Últimas corridas | Nenhuma corrida registrada ainda`. Isso prova exatamente o que
eu queria — não há convite entre o título e a frase de vazio — e não depende de
haver internet.

**A regra que sai, e ela vale para toda a suíte:** neste projeto o tempo é a única
coisa que vem da rede, e a suíte cobre de propósito os dois casos ("responde com ou
sem internet"). Então **nenhuma afirmação pode cobrar a AUSÊNCIA de algo que o
tempo possa acrescentar**. Ausência é a forma de afirmação mais frágil que existe
num ambiente que varia, e a alternativa é sempre a mesma: afirmar a presença do que
se espera, no lugar exato onde se espera.

## 3 de setembro — a Lei 3 era medida por arquivo, e a capa tem dez números

**O que se viu.** `src/law.test.ts` existe para impedir número grande sem
comparação. Ele funcionava: cada tela com `type.figure` declarava com o que
compara, ou por que não há o que comparar. Só que a chave do registro é o
**caminho do arquivo**, e a capa não é uma tela — é dez. `src/home/Mosaic.tsx`
tinha uma declaração (`/noYesterday|madeYesterday/`) e passava verde por causa da
produção, enquanto as caixas enviadas, os tachos abertos e as entregas do dia
apareciam nus ao lado.

**Como apareceu.** Não foi lendo o teste. Foi um refutador tentando derrubar um
item de roadmap que dizia "o cartão de caixas mostra o número sem o ontem": ele
confirmou o item e, ao explicar por que a suíte não pegava, descreveu o buraco —
*"o registro aprova o arquivo pela comparação da produção e não vê esta figura"*.

**Por que importa mais que o cartão.** Uma guarda com granularidade errada é pior
que guarda nenhuma, porque **compra silêncio**: a suíte verde afirmava que a Lei 3
estava conferida na capa, e nove dos dez números nunca tinham sido olhados por
ninguém. É o mesmo defeito do `mutate` na primeira execução — verde por
coincidência, não por proteção.

**O que mudou.** A régua passou a ser por número: a contagem de `type.figure` do
arquivo tem que bater com a quantidade de declarações. Um número grande novo
quebra a suíte até ganhar a sua linha. As dez declarações da capa foram escritas
uma a uma, e três delas são "sozinho" com o motivo por extenso — contagem
regressiva compara com o próprio limite, estado ao vivo responde a segunda
pergunta da lei, lista de afazeres do dia se compara com o acordo, não com ontem.
Provado quebrando: retirada uma declaração, o teste acusa `mostra 10 e declara 9`.

**E o cartão foi consertado junto**, com o que já estava calculado e ninguém lia:
`loose` (o que saiu sem caber em caixa) e as chaves `alsoSent`/`alsoSentItem`, que
existiam nos três idiomas sem um único leitor.

## 3 de setembro — o estorno acertava o saldo e deixava oito telas mentindo

**O que se viu.** A fundação diz que se corrige por estorno, nunca por exclusão,
e o estorno não tinha escritor — esquema, restrição, política e o construtor de
`ledger.ts` existiam sem ninguém que gravasse. Escrito o escritor, os três testes
unitários passaram de primeira: o ato inteiro volta pelo grupo, saldo negativo é
recusado, e estornar duas vezes é recusado.

**E o navegador reprovou.** O e2e dirigiu o caminho inteiro — produção, lote,
corrigir, confirmar — e o saldo do almoxarifado voltou certinho enquanto
*"Produzido hoje: 500"* continuava lá. A razão é estrutural e vale para qualquer
livro-razão: **saldo é soma pura e não olha `kind`**, então ele se corrige
sozinho; mas toda tela de "o que aconteceu" filtra por `kind`, e um movimento de
`kind = 'reversal'` não é `'production'`. Oito consultas — produção do dia, série
da semana, lotes do dia, últimas corridas, remessas, perdas, o palpite da
separação e a fila de conferência — continuariam contando um ato que foi
cancelado.

**Por que importa além deste commit.** O defeito não estava no escritor: estava
na suposição de que escrever a correção *é* corrigir. Num sistema append-only,
todo leitor que pergunta "o que aconteceu" é um lugar onde a correção precisa
chegar, e nenhum deles reclama — eles simplesmente respondem o número velho. Foi
o que teria ido para a mão do dono: o almoxarifado certo e a produção mentindo,
no mesmo aplicativo, na mesma hora.

**O que mudou.** Um `naoEstornado(alias)` só, usado nas oito consultas, porque a
mesma frase SQL escrita oito vezes é onde a nona esquece. E a checagem e2e ficou
como registro do caminho completo: o lote sai da lista do dia (uma corrida
corrigida não foi produzida hoje) mas continua existindo pelo endereço, dizendo
"esta corrida já foi corrigida" — porque a etiqueta pode já estar colada numa
caixa e quem lê o QR precisa achar a verdade.

**A regra que sai:** teste unitário prova a escrita; só o aplicativo dirigido
prova a LEITURA. As duas metades de uma correção moram em arquivos diferentes, e
a suíte que só exercita a primeira passa verde numa correção pela metade.

## 3 de setembro — o dinheiro evaporava do balanço a cada corrida de produção

**O que se viu.** A tela de lugares dizia, embaixo de "Loja Centro": *"um item ·
vale R$ 0,00"* — com 1.466 picolés listados logo abaixo. Não era formatação.
`item_costs` só tem um autor, `recordPurchase`, e picolé nunca é comprado: ele
sai do tacho. Sem linha em `item_costs`, o produto acabado vale zero em toda
consulta que valora estoque.

**Por que é maior que uma tela.** O consumo tira o insumo do saldo **com o valor
junto**, e a produção põe o produto de volta valendo nada. O balanço da empresa
encolhe a cada corrida, em silêncio, exatamente pelo custo do que foi produzido.
E o zero se espalhava por caminhos que ninguém ligaria a esse: `moveBetween` e
`recordLoss` leem a taxa de `item_costs`, então uma transferência de produto
gravava `unit_cost_rate` NULO nas duas pernas, e uma perda de produto acabado
era avaliada em zero — perda que a tela de perdas soma em dinheiro.

**A decisão que parecia cobrir isso, e não cobria.** Havia docblock escrito:
*"Nada é escrito em `item_costs`. Valor derivado tem um autor só, e a média já
responde sozinha."* A frase é verdadeira sobre o INSUMO consumido — consumo à
taxa média não move a média dele. E é sobre outro `item_id`. Para o produto não
havia autor nenhum, nem no aparelho nem no servidor. **"Um autor só" não estava
sendo cumprido; estava sendo dispensado** — e esse é o formato mais perigoso de
justificativa: verdadeira, escrita, e sobre outra coisa.

**Como apareceu.** Olhando uma foto de tela. A varredura de defeitos leu
`/places` e viu "vale R$ 0,00" ao lado de mil e quatrocentos picolés; três
refutadores independentes tentaram derrubar a leitura e os três a confirmaram, um
deles reproduzindo com teste descartável. O primeiro conserto proposto — trocar a
fonte da consulta para `movements.unit_cost_rate` — foi medido e **estava
errado**: a perna de transferência tinha taxa nula, então o valor não sumia, ele
ficava preso na fábrica que já não tinha o produto.

**O que mudou.** `recordProduction` passa a ser o autor da média do produto, e a
migração 0025 põe o espelho no servidor pelo mesmo cálculo, com `item_costs`
continuando fora da fila — cada lado conclui, ninguém manda o número pronto. A
`db:verify` ganhou a garantia que faltava: as duas implementações, independentes,
chegam a 68,4224 para o mesmo picolé. Provado quebrando: com o gatilho apontando
para outro `kind`, a checagem falha com "o servidor não sabe quanto vale o que o
tacho fez".

**E um detalhe que a capa do projeto previa.** Reaproveitar o evento de compra
para a corrida custou visivelmente: ele fala de nota, e nota tem centavo inteiro.
A primeira corrida de 500 unidades saía com média 64,996 contra um custo
congelado de 64,99686 — dois números para o mesmo picolé no dia em que ele
nasceu. Taxa não é valor final e não se arredonda: nasceu o `blendRate`.

## 4 de setembro — a forma de um tema não pode morar na tela

**O que se viu.** O dono abriu o Papel e circulou o que sobrava do outro tema:
*"como é que essas caixas continuam aí?"*. Eram cinco de uma vez — o retângulo
de canto arredondado, o fundo lavado de cor, o crachá preenchido atrás do ícone,
a pílula do botão e a da etiqueta. Todas do Orgânico, que é um tema de blocos e
curvas; o Papel é serifa, traço fino e canto reto.

**Por que aconteceu, e é o achado.** A identidade do Papel estava escrita em
`tokens.ts` — fonte, raio, paleta — e **a forma não.** Forma é caixa ou régua,
massa ou traço, selo ou desenho na página, e isso vivia espalhado em cada
componente com um valor só. `borderRadius: radius.xl` e `backgroundColor:
tint(cor, 0.13)` não são neutros: eles *são* o Orgânico, escritos onde o tema
não alcança. Trocar a fonte e a paleta produziu o Orgânico de fonte diferente,
que foi exatamente o que ele viu.

**O que mudou.** A forma desceu para o componente: `Card`, `Button` e `Chip`
passam a perguntar `skin` e a desenhar duas coisas diferentes — bloco de cor com
canto redondo no Orgânico, régua sem fundo e sem crachá com canto reto no Papel.
A consequência prática é maior que as telas de hoje: **quem escrever uma tela
nova acerta nas duas caras sem pensar**, e a incoerência não volta quando
ninguém estiver olhando.

**E as cores também não eram dele.** Eram as do Orgânico com outra saturação —
verde `#15803D` e violeta `#5B4BA8` são cores de interface, frias, e brigam com
creme quente do mesmo jeito que marcador fluorescente briga com papel de carta.
A família virou tinta: verde-garrafa, azul-tinta, ameixa, ocre.

**A pergunta seguinte dele fechou o raciocínio:** *"esse é o tema dark?"*. Ao
tirar as caixas eu tirei junto a única coisa que separava a página do chão, e o
Papel escuro virou um buraco preto com réguas invisíveis. Papel escuro é papel
escuro — carvão quente, tinta creme, régua que se enxerga —, não tela apagada.

## 4 de setembro — "peça sem dado não aparece" apagou a porta de duas telas

**O que se viu.** O CI reprovou uma checagem que parecia frase: a aba de
relatórios não dizia mais "o que cada unidade custa". Não era a frase. Ao virar
briefing, a tela passou a mostrar cartão só para o assunto que TEM número — e
com isso Receitas e Perdas ficaram **sem caminho nenhum** numa instalação nova.
Perdas não aparece em nenhum outro lugar do aplicativo.

**Por que importa.** A regra é boa e é do dono: cartão dizendo zero é alerta
inventado. Mas eu apliquei larga demais, num lugar onde o cartão fazia dois
trabalhos — dizer o número **e** ser a porta. Regra certa, fronteira errada, e o
resultado é pior que o defeito que ela evita: um alerta inventado se ignora, uma
tela inalcançável não existe.

**O que mudou.** Cartão para o que tem o que dizer, `ListRow` para o resto. E a
fronteira ficou escrita no briefing das telas que ainda vão ser reescritas, para
o mesmo erro não se multiplicar por vinte.

**A regra que sai:** antes de esconder alguma coisa por não ter dado, pergunte se
ela também é caminho. Esconder o que não informa é higiene; esconder o que
navega é amputação.

## 4 de setembro — o rótulo e o que está embaixo dele discordando, três vezes

**O que se viu.** Em três telas diferentes, no mesmo dia, o mesmo defeito com
três caras:

- o almoxarifado dizia **"4 unidades"** contando quatro *itens*, ao lado de um
  saco com 69.566 g dentro;
- a estante de receitas dizia **"2 receitas"** encabeçando uma lista de *uma* — a
  outra estava no cartão acima;
- a ficha dizia **"18.000 · 77% do lote"**, sem unidade: dezoito mil gramas e
  dezoito mil unidades são coisas diferentes na mesma página.

Nenhum dos três é erro de cálculo. Os três números estão certos; o que está
errado é **o que a palavra ao lado afirma sobre eles**. É a família de defeito
mais fácil de escrever e a mais difícil de ver relendo código, porque o código
está certo — `shown.length`, `rows.length`, `line.quantity` são exatamente o que
o autor quis.

**Por que os três apareceram hoje.** Não foi a reescrita que os criou — os três
já estavam lá, e dois são anteriores a ela. O que mudou foi o instrumento:
`npm run shot` põe a tela na frente do olho, e uma frase que discorda do que está
abaixo dela **só se vê olhando**. Nenhum teste unitário reclama de "4 unidades",
porque o número é quatro mesmo.

**O que isso diz sobre guardas.** A tentação é escrever um script. Não há
script: "o rótulo concorda com a lista embaixo dele?" não é uma propriedade do
código, é uma propriedade do *significado*. A defesa que existe é a que já está
funcionando — olhar cada tela antes de dizer que está pronta —, e o registro
aqui serve para o próximo leitor saber **onde** olhar: todo lugar em que um
número é contado numa variável e nomeado noutra.

**Regra prática que sai:** ao ler uma tela pronta, leia o rótulo em voz alta como
uma frase completa e pergunte se ela é verdade sobre o que está logo abaixo. "4
unidades ao custo médio de cada um" era falso, e ficou seis meses no aplicativo.

## 4 de setembro — a mesma família, trinta e uma vezes: o rótulo que conta uma variável e nomeia outra

**O que se viu.** O registro de cima disse que "não há script" para este defeito e
que a defesa é olhar. Metade estava certa. Uma varredura dirigida — uma leitura por
tela, com uma pergunta só (*o rótulo é verdade sobre o que está imediatamente
abaixo dele?*) e a exigência de provar cada achado no código antes de chamá-lo de
defeito — devolveu **trinta achados em treze telas**. Conferi os trinta um por um
contra o código: **os trinta se sustentaram**, e procurando o mesmo defeito onde a
varredura não olhou apareceu **o trigésimo primeiro, na capa**, que é a tela mais
vista do aplicativo:

- `formatPacked` era chamado justamente para o item **sem** camada de caixa, e para
  esse item a única faixa é `unit` — então seis quilos de açúcar saíam na capa como
  **"6.000 unidades de Açúcar cristal"**. A embalagem já vinha na consulta; o que
  faltava era a unidade de uso, uma coluna ao lado.

Os que mais ensinam, porque nenhum é erro de conta:

- **"0% acima de ontem"** com 480 e 480 na tela: o selo tinha dois estados e o
  empate caía em "acima". A capa já reconhecia o terceiro estado; a aba não. E o
  arredondamento ampliava — 4.802 contra 4.800 também imprimia 0%.
- **"Primeira carga registrada."** decidida por `ontem === 0`: numa fábrica que
  entrega há dois anos e não entregou no domingo, o cartão de segunda dizia isso.
- **"Cancelar"** em cima de **"Cancelar"**, com efeitos opostos, num diálogo cujo
  assunto é cancelar — e o pedido cancelado sai da lista, sem volta pela tela.
- **"Conversão confere"** acendendo sempre que os dois números eram positivos, sem
  comparar nada: dava para ver "saco 25 kg", "250 g" e o selo verde juntos —
  errado por cem vezes, que é o erro que aquela tela existe para impedir.
- **"Inclui os dados de exemplo"** aceso pela marca `seeded`, que nunca é apagada:
  verdadeiro em todo aparelho para sempre.
- **"livre hoje: … menos o que já foi prometido para esta data"** com horizonte fixo
  de sete dias e consulta sem chave: trocar a data não movia o número.
- **"POR QUÊ?"** como único rótulo de um campo que carregava quatro conteúdos
  diferentes — a conta de um número, as opções de uma pergunta, uma instrução e os
  campos de um rascunho. Só o primeiro é a conta que a Lei 6 manda abrir.

**A correção do registro de ontem.** "Não há script" era verdade sobre *scripts*,
e falso sobre *método*. O que pega este defeito é uma leitura com a pergunta certa
e a obrigação de provar — e isso escala: uma tela por leitor, em paralelo, com
verificação adversarial minha depois. O que **não** escala é reler o próprio
código esperando notar; foi assim que os trinta e um ficaram lá.

**E dois deles quebraram teste que passava pelo motivo errado.** Ao mover os
exemplos do assistente de `detail` para `list`, uma asserção continuou verde
porque `(answer.detail ?? []).map(...)` virou string vazia e `doesNotMatch` passa
vacuamente. O e2e tinha o mesmo buraco: `assert.match(tela, /6\.000/)` com a
mensagem "na unidade do item" passava **sem a unidade existir**. As duas foram
consertadas com a contagem primeiro — asserção de ausência sem asserção de
presença ao lado é asserção que não morde.

**A regra que sai:** número contado numa variável e nomeado noutra é uma família
inteira, não um deslize. Ela mora em seis lugares previsíveis — o cabeçalho de um
grupo de linhas, o selo de dois estados sobre um fato de três, a frase de estado
vazio decidida por uma contagem parcial, a chave de dicionário reusada de outra
tela, o rótulo fixo sobre um cartão que muda de assunto, e a promessa dita fora do
estado em que ela é verdade.

## 4 de setembro — o pacote fresco com o manifesto velho

**O que se viu.** A tela de Ajustes escreve a versão no cabeçalho. Numa revisão
de rotina ela dizia **`0.2.0`** — cinco versões atrás do `app.json`, que diz
`0.7.0`. `npx expo config` resolvia `0.7.0` corretamente: quem estava velho era o
**pacote**, exportado dois minutos antes.

O manifesto inteiro é embutido no `expo-constants` na hora de transformar o
módulo, e a chave do cache do Metro é o conteúdo *daquele módulo* — que não muda
quando o `app.json` muda. Então a exportação sai fresca, com o manifesto velho, e
continua assim para sempre. `--clear` conserta na hora.

**Por que isso é pior do que parece.** O campo visível é só a versão, mas o que
está congelado é o manifesto inteiro: ícone, esquema, plugins, permissões. E as
duas ferramentas de olhar deste repositório — `npm run shot` e o `e2e` — leem
exatamente esse pacote. **Toda foto que mandei nesta sessão e toda execução da
suíte leram um manifesto de cinco versões atrás.**

**A crença que escondeu.** O comentário no `e2e` dizia, com todas as letras:
*"No `--clear`: that empties the bundler cache, which buys nothing here"*. Foi
escrito quando a espera do portão estava sendo medida e encolhida, e é verdade
para o caso que ele tinha na mão — `expo export` reescreve `dist` de qualquer
jeito. É falso para o manifesto, e o comentário fez a pergunta parar de ser feita.
É a mesma família do `dist` reusado "porque ele existia", um nível abaixo e mais
difícil de ver: aqui a exportação **é** da execução.

**O que mudou.** `scripts/manifesto.mjs` guarda o hash do `app.json` ao lado da
marca da última exportação, e `shot` e `e2e` passam `--clear` **só quando ele
mudou** — os dois ou três minutos que o comentário defendia continuam
economizados nas outras execuções. E o `e2e` passou a afirmar, na tela de
Ajustes, que a versão exibida é a do `app.json`: a versão é o único campo visível
do manifesto, então é por ela que se percebe. Sem essa asserção, o próximo campo
a envelhecer envelhece calado.

**A regra que sai:** cache invisível é cache que mente. Quando um dado nasce
*fora* dos arquivos que o cache tem como chave — um manifesto, uma variável de
ambiente, um relógio —, alguma coisa no produto final tem que dizer esse dado em
voz alta, para uma asserção poder compará-lo com a fonte.

## 4 de setembro — o mesmo defeito reapareceu dentro do conserto de outro

**O que se viu.** `orderedDemand` passou a partir do produto em vez da linha de
pedido, para a tela de anotar pedido poder dizer quanto está livre **antes** do
primeiro pedido existir. O roadmap trazia o cuidado escrito: *"a capa lê a mesma
função, então o commit que mudar o conjunto de linhas tem de conferir que 'produza
para os pedidos' não passa a listar produto com demanda zero."*

O cuidado estava certo e olhava para o lugar errado. Aquela leitura já filtrava
por `requested - onHand > 0` e ficou protegida de graça. Quebraram **duas outras**,
e as duas pela mesma razão: perguntavam pelo **tamanho da lista**.

- o cartão de pedidos da capa aparecia com `demand.length > 0` — e passou a dizer
  *"Pedidos cobertos"* numa fábrica que nunca vendeu nada;
- o convite do primeiro dia exigia `demand.length === 0` — e sumiu.

**Por que isto merece registro.** É a mesma família da varredura do mesmo dia —
contar uma variável e nomear outra — e ela reapareceu **dentro do conserto de
outra coisa**, escrita por quem tinha acabado de caçá-la trinta e uma vezes.
Não foi desatenção: `demand.length > 0` era uma leitura *correta* enquanto a
consulta partia da linha de pedido. O defeito nasceu no momento em que o
significado da lista mudou, e nada no tipo mudou junto — `Demand[]` continua
`Demand[]`.

**O que pegou:** o e2e, em três checagens da capa, na primeira execução depois da
mudança. Nenhum teste unitário reclamou, porque nenhum deles pergunta o que a
capa mostra.

**A regra que sai:** quando uma consulta muda o **conjunto** que devolve — e não
o formato —, o compilador não ajuda e a revisão do diff também não: os chamadores
continuam compilando e lendo a mesma propriedade. O que se procura são as
leituras que perguntam `length`, `some` ou `[0]` sobre o resultado, porque são
exatamente as que dependem do conjunto e não do formato. E o teste que pega isso
é o que abre a tela.

## 4 de setembro — a promessa estava no docblock, e o chamador não existia

**O que se viu.** `explodeRequirements` carrega esta frase desde que foi escrita:
*"This is the query behind the shopping list that writes itself"*. A lista de
compras não existia. O que existia era a mesma função respondendo *"posso fazer
esta corrida?"* para um produto — e o docblock prometia a pergunta invertida, para
vários produtos, que ninguém tinha escrito.

Somar vários produtos custou **zero linha nova de aritmética**: a função já
acumula no mapa que recebe, então um plano é chamá-la de novo com o mesmo mapa. O
delta real era o outro: devolver `missing` em vez de `needed`. *"Precisa de
54.000 g de polpa"* não decide nada para quem tem 40.000 na prateleira; *"faltam
14.000"* decide.

**O que quase ficou de fora, e é o mais instrutivo.** A receita não conhece o
palito — ele é consumo por unidade produzida, não por tacho. Uma lista de compras
que só explode a receita esquece exatamente o item que a fábrica mais gasta, e é o
mesmo defeito que o custo congelado já teve neste repositório. A diferença é que
aqui prever a unidade é **legítimo**: isto é simulação, e simulação pode prever. O
custo congelado é que não pode, porque ele grava o que aconteceu. Duas contas
parecidas com permissões opostas sobre o mesmo verbo.

**A regra que sai:** docblock que promete um chamador é dívida com juros — ele
descreve o que a função *poderia* responder, e quem lê acredita que alguém já
pergunta. Procurar promessa sem chamador é a busca mais barata deste repositório:
`grep` no docblock, e a pergunta "quem chama isto?".

## 4 de setembro — o CI vermelho por uma palavra trocada num arquivo de tradução

**O que aconteceu.** Renomeei um rótulo — `howMany` deixou de ser "Quantas
{{pack}}", que saía na tela como **"QUANTAS SACO 25 KG"**, e virou "Quantidade,
em {{pack}}". Três checagens do e2e continuaram procurando `getByLabel(/Quantas/)`.
Empurrei; o CI ficou vermelho vinte minutos depois, no navegador.

**Por que a barra não pegou.** Ela pegou — só tarde. A ordem foi: rodei a barra
inteira, depois olhei as fotos, fiz quatro correções do que só se vê olhando (e uma
delas era o rótulo), e empurrei sem rodar o e2e de novo. O `push-guard` exige
veredito fresco para o HEAD e **o veredito não inclui o e2e**: o portão mecânico
roda tipo, lint e unidade. Então o portão estava verde e a suíte do navegador,
não.

**O que dói não é o erro, é a distância.** Renomear um rótulo é uma linha num
arquivo de tradução. Descobrir por que o navegador não achou o campo é uma
execução inteira da suíte, três esperas de trinta segundos, e um log que diz
`locator.fill: Timeout` sem dizer que a culpa está no dicionário.

**O que mudou.** `src/selectors.test.ts` lê os seletores do `e2e/flow.mjs` e exige
que cada um ainda case com alguma frase do dicionário pt-BR — em milissegundos, no
`npm test`. Ele não prova que a tela mostra aquele texto: prova que o texto que o
e2e procura **existe no aplicativo**, que é exatamente o que deixa de ser verdade
quando alguém renomeia uma chave. O que a tela compõe (nome semeado, código de
lote, rótulo de acessibilidade montado) entra numa lista de renúncias com motivo
escrito, e um terceiro teste recusa renúncia que ninguém usa mais.

**E ela quase nasceu com o defeito que caça.** O import começou como `default`, o
dicionário chegou indefinido, a lista de frases ficou vazia — e aí *toda*
comparação é falsa, então o primeiro seletor da lista levava a culpa por um erro
que não era dele. Uma guarda que reprova pelo motivo errado é pior que guarda
nenhuma: manda consertar o lugar errado. A contagem antes da comparação virou a
primeira linha do arquivo. É a terceira vez no mesmo dia que a asserção de
presença faltou ao lado da de ausência.

**A regra que sai:** um teste que dirige o aplicativo por texto tem uma dependência
que o compilador não vê — o dicionário. Onde existe essa costura invisível, cabe
uma guarda barata que a torne visível **na velocidade da unidade**, em vez de
deixá-la reprovar na velocidade do navegador.

**E a terceira repetição virou guard, como a diretriz manda.** "Afirmar ausência
sobre um sujeito que pode estar vazio" apareceu três vezes num dia — no teste do
assistente, na asserção do e2e e na guarda nova — e é padrão que um script pega.
Virou `56-vacuous-negative` na proofgate
([PR #16](https://github.com/ChrnX0/proofgate/pull/16)): dispara quando uma linha
afirma ausência sobre um sujeito que o mesmo diff defaultou para vazio e nada
naquele arquivo afirma um comprimento. Estreito de propósito — só arquivo de
teste, WARN, e medido contra um diff real de 31 mil linhas com zero disparos.
Conselho eu esqueço na próxima sessão; guard roda sozinho.

## 4 de setembro — sete seções de dicionário sem leitor, e o número está escrito no CLAUDE.md

**O que se viu.** O `CLAUDE.md` cita, ao explicar por que o portão virou por item e
não por fase: *"quatro seções de dicionário nos três idiomas sem uma tela"*. Varri
o dicionário para conferir e eram **sete** — 870 chaves no total, e sete blocos de
topo que nada lê.

**Antes de chamar de defeito, a decisão.** Três têm escopo escrito e não são
esquecimento: `posts` são os quatro postos de controle da F3, `stepper` é o
`UnitStepper` (decisão registrada, e apontá-lo como defeito já custou uma rodada
antes), `scan` é a leitura do QR na doca — o QR já é impresso, quem lê ainda não
existe. Essas ficam.

As outras quatro eram **rascunho anterior, já substituído pela tela viva**:

- `areas` nomeava um menu de oito áreas que não existe, com duas delas cortadas
  por decisão escrita (Espelho da Loja e Financeiro);
- `production` dizia "Rende {{units}}", "Vai baixar do almoxarifado", "Custo desta
  produção" — e `app.production` já diz as mesmas três coisas com outras palavras;
- `confirmation.shipment` foi superado por `app.transfer.confirmBody`;
- `assistant.title: 'Modo Conversa'` foi superado por `app.assistant`, onde
  "modo conversa" virou a sobrelinha e o título virou "Pergunte".

**Por que isso é defeito e não sobra inofensiva.** Seção morta **parece viva**.
Quem for renomear "Custo desta produção" acha primeiro a cópia que ninguém lê,
muda ali, e a tela continua dizendo o que dizia — com o commit verde, o teste
verde, e o dono apontando o texto velho na semana seguinte. É a mesma família do
rótulo que discorda: o código está certo, e o que está errado é a coisa parecer
o que não é.

**O que mudou.** As quatro saíram dos três idiomas (98 linhas), e
`src/dictionary.test.ts` passou a exigir que toda seção tenha leitor **ou** uma
linha na lista de fronteiras dizendo QUEM vai lê-la. Um segundo teste recusa
fronteira que já ganhou leitor, para a lista não virar cemitério. A mutação nova
prova que morde.

**A regra que sai:** o portão P1 diz o que *entra* sem chamador. Faltava a outra
metade — o que **fica** sem chamador depois que o chamador some. Peça sem chamador
não é um evento de entrada, é um estado, e estado se mede continuamente.

## 4 de setembro — a resposta anterior a "nada chama isto" foi escrever teste

**O que se viu.** O `CLAUDE.md` nomeia, entre as peças sem chamador, "`balanceAt` e
`daysOfCover` chamados só por teste". Fui conferir os três exemplos que ele lista.
Dois se fecharam sozinhos com o uso — `assistant_phrase` ganhou escritor, e
`Draft.kind` ganhou leitor **hoje**, no conserto do "Lançado." que não lançava
nada. `balanceAt` continuava lá. E puxando o fio, não era uma: eram **quatro**
funções exportadas em `src/domain/ledger.ts` sem nenhum chamador fora de teste —
`balanceOf`, `balanceAt`, `lotsPresentDuring` e `buildReversal`.

**Por que elas nunca teriam chamador.** Não é esquecimento, é *forma*: as quatro
dobram sobre `Movement[]` em memória, e o aplicativo **nunca tem os movimentos em
memória** — ele tem SQLite. Cada pergunta já é respondida em SQL, onde os dados
estão: `stockByPlace`, `balanceByLocation` e `lotsInStock` somam
`quantity_base_units`, e `reverseGroup` escreve o estorno negando a quantidade na
própria instrução. Carregar anos de movimento num celular para dobrar em memória
seria a forma errada mesmo se alguém quisesse.

`buildReversal` era o caso caro: **dois autores para o que é um estorno**, um em
TypeScript que ninguém roda e um em SQL que roda. Mudar a regra na cópia bonita
não faria nada.

**E o que a sessão anterior fez com o mesmo achado.** O docblock do teste diz, com
todas as letras: *"The two ledger queries nothing was calling and nothing was
checking… both were exported with a docblock and never run."* Alguém viu, e
respondeu **escrevendo teste**. Os testes eram bons e corretos — e não tornaram
nada alcançável: tornaram a morte mais difícil de ver. Depois disso, uma mutação
curada foi acrescentada por cima, prometendo que quebrar o limite faria *"a
excursão de temperatura acusar o lote errado"* — numa tela que não existe. O
portão que diz "a suíte morde onde promete morder" estava mordendo uma regra sem
efeito em produção.

**O que mudou.** As quatro saíram, com o motivo escrito no lugar delas. O
vocabulário fica, e fica ganho: `src/sync/agreement.test.ts` confere o tipo
`Movement` nos dois sentidos contra o esquema do servidor e o do aparelho — esse é
um teste que compara *duas fontes de verdade*, não um que exercita código parado.
A pergunta que o docblock da fundação promete — "o que estava dentro da câmara às
03:12?" — virou item 6 do roadmap, com a consulta que ela pede: SQL com corte no
tempo, e não a dobra que morreu.

**A regra que sai:** quando nada chama uma peça, há três respostas honestas —
trazer o chamador, apagar a peça, ou registrar a fronteira com quem vai chamá-la.
**Escrever teste não é uma delas.** Teste sobre peça inalcançável não prova
capacidade: prova que a peça faz o que ela faz, e passa a proteger uma promessa
que ninguém pode cobrar.

## 4 de setembro — o alerta que dizia o que mudou e não dizia o que fazer

**O que se viu.** A câmara fria mostrava o selo *"fora da faixa de −22 a −16"* e
parava aí. Das três perguntas que a Lei da Inteligência exige de toda tela, ela
respondia duas — o que é normal (a faixa) e o que está diferente agora (a leitura)
— e deixava a terceira em branco: **qual é a próxima ação provável**. Quem lê
−8 °C precisa saber *quais lotes estavam lá* para ir olhar, e o livro-razão já
sabia.

**A parte que quase saiu errada.** A resposta óbvia é listar o que está na câmara
**agora**, e ela é sutilmente falsa. A medição foi às 07:20 e a pessoa abre a tela
às 15:00; no meio pode ter saído carga. O que ficou exposto é o que estava lá
*naquela hora* — e é justamente o lote que já viajou que um recall mais precisa
achar. `occurred_at <= ?` é a diferença inteira entre as duas perguntas, e o teste
que prova isso é o que separa uma feature de uma decoração: dois lotes na câmara
às 07:20, um sai ao meio-dia, e a resposta das 07:20 continua sendo dois.

**E ela não precisou de sensor.** O docblock da fundação promete isso desde a
primeira linha — *"a habilidade de responder 'o que estava dentro do freezer às
03:12?'"* — e eu tinha lido essa promessa como dependente do ESP32 que não existe.
Não é: a leitura digitada na conferência já carrega a hora. A pergunta esperava um
sensor por hábito de leitura, não por necessidade.

**A ligação com o achado anterior.** Este item nasceu na mesma varredura que matou
`balanceAt` e `lotsPresentDuring` — as duas dobras do domínio que prometiam esta
resposta e não podiam entregá-la, porque dobram sobre `Movement[]` em memória e o
aplicativo tem SQLite. Matar a peça e construir a resposta foram o mesmo trabalho,
e é essa a forma correta do "trazer o chamador": o chamador não usa o que estava
morto, ele usa a forma que funciona.

**A regra que sai:** quando um alerta dá conta de "o que está diferente agora" mas
não de "qual é a próxima ação", o dado que falta quase sempre já está no
livro-razão — e a pergunta certa costuma ter um **instante** dentro dela. "O que
está lá" e "o que estava lá quando aconteceu" parecem a mesma consulta e não são.

## 4 de setembro — o caminho de publicação que ninguém usa continua armado, e o conserto foi só do gatilho

**O que se viu.** Fui conferir de que commit saiu o `apk-0.8.0` — nove commits
atrás, `c32f96f`, e desde então entraram quatro coisas que aparecem na tela.
Conferindo, dei com dois caminhos de publicação vivos ao mesmo tempo:

- `build-apk.yml`, que compila **neste repositório** (`expo prebuild` + gradle,
  arm64, 49 MB) e é quem publicou de `apk-0.2.0` a `apk-0.8.0`, sete vezes;
- `release-apk.yml`, que **baixa um artefato pronto da Expo** e anexa ao release.
  Última publicação legítima: `apk-0.1.0`, em 1 de setembro.

O segundo não tem chamador desde então. Mas ele não é código morto — é código
**armado**, e o docblock dele descreve com todas as letras a falha que ele
próprio ainda produz.

**O que aconteceria hoje, e conferi passo a passo.** `.github/apk-release.txt` não
é tocado desde `f4ca1ce`: ele aponta para um artefato da Expo compilado de
`5703790` — **177 commits atrás** — e traz `# commit: 5703790`. O workflow calcula
a tag a partir do `app.json`, que nesta branch diz 0.9.0 mas dizia 0.8.0 até agora.
Disparar "Publicar o APK" com esta branch escolhida fazia: `gh release create
apk-0.8.0` falhar (a tag existe), cair no `|| gh release upload --clobber`, e
**anexar um APK de 110 MiB de 177 commits atrás dentro do release `apk-0.8.0`** —
ao lado do bom, sob uma nota que diz "Compilado de `c32f96f`".

É exatamente o defeito que o docblock dele diz ter consertado: *"o pior tipo de
defeito de entrega: dois arquivos sob a mesma tag, com códigos diferentes"*. O
conserto de 1 de setembro trocou o gatilho de `pull_request` para
`workflow_dispatch` e resolveu a **republicação automática**. Não resolveu o
ponteiro velho: no dia em que alguém dispara à mão, o resultado é o mesmo. E é
pior que dois arquivos — as duas assinaturas são chaves diferentes, então quem
baixar o maior não consegue instalar por cima e perde os dados ao desinstalar.

**Por que passou.** O `main` falha seguro por acidente, não por desenho: lá o
pedido não tem a linha `# commit:`, e a checagem que exige essa linha mata o
passo. Quem for conferir "isso é perigoso?" olhando o `main` vê um workflow que
recusa rodar, e conclui que está protegido. A branch é que tem a linha.

**A resposta certa era uma das três, e não foi teste.** O `CLAUDE.md` diz que
quando nada chama uma peça há três respostas honestas — trazer o chamador, apagar
a peça, ou registrar a fronteira com quem vai chamá-la. Aqui é apagar: o caminho
da Expo foi superado pelo que compila no repositório, o artefato dele está
velho, e ressuscitá-lo exigiria uma build nova da Expo, que exige o token — que é
o que precisa ser revogado.

**E isso fechou uma pendência que estava parada.** O `EXPO_TOKEN` vazado precisa
ser revogado desde 3 de setembro, e a pergunta implícita era o que quebra quando
ele morrer. A resposta, medida: **nada.** Depois desta remoção não sobra uma
ocorrência de `EXPO_TOKEN`, `eas build` ou `expo.dev/artifacts` no repositório —
o `build-apk.yml` não tem conta na Expo, só `npx expo prebuild` e gradle. Revogar
o token passou a custar zero, e isso muda o recado ao dono: não é um chore, é uma
ação de graça.

**O que mudou.** `.github/workflows/release-apk.yml` e `.github/apk-release.txt`
apagados; `app.json` em 0.9.0, e o instalador novo sai do HEAD com as quatro
coisas de hoje que aparecem na tela — a ficha na etiqueta do lote, a dica de
quanto dá para prometer no primeiro pedido, a lista de compras no assistente, e
os lotes expostos na câmara fora da faixa.

**A família, para nomear:** *consertar o gatilho e deixar o alvo.* O erro tinha
duas metades — quando roda, e o que roda — e o conserto tratou a primeira como se
fosse a coisa toda, com um docblock longo por cima afirmando o conserto. É a mesma
forma dos rótulos de hoje: o texto ao lado descreve um estado que o código não
tem mais.

## 4 de setembro — a política de update existia, e era isso que escondia o defeito

**O que se viu.** Uma varredura de sete eixos com refutação adversarial (19 achados
julgados, 4 de pé, 15 derrubados) encontrou a **terceira** aparição da mesma
família: a fila do aparelho sobe com `on conflict do update`, e a tabela não deixa
reenviar.

A 0015 consertou isso para `purchases` e `purchase_lines`. A 0020 consertou para
`lots`. Nas duas, o defeito tinha a mesma forma — política de insert e **nenhuma**
de update. E foi essa forma que virou a frase escrita aqui no dia 1º: *"todas as
outras tabelas que ela escreve têm um `_manage FOR ALL`, que cobre update"*.

`orders` **tem** política de update. Ela pede `approve_order`, `dispatch` ou
`manage_company`, e a de insert pede `place_order` — e três dos sete papéis do
produto (`storeManager`, `customer`, `salesperson`) têm o segundo e nenhum dos
primeiros. A busca por "tabela sem política de update" nunca a encontraria.

**Por que passou pela barra.** Duas coisas, e as duas são a mesma: a verificação
usava contas mais poderosas do que as reais. A checagem 6 sobe a fila inteira com
`enum_range(null::capability)` — todas as capacidades que existem. A checagem 8, que
é a do pedido, dá à "Vendedora" `place_order` **mais** `dispatch`, e é o `dispatch`
que faz o update passar. **Nenhuma conta com a capacidade mínima de um papel real
jamais rodou a segunda passagem da fila.**

É a mesma doença que o `db:verify` já teve e já consertou uma vez, quando rodava
como superusuário: a verificação com mais poder do que a realidade prova o que não
está em questão.

**O que mudou.** Migração `0027`, e ela é de duas peças porque RLS não consegue
dizer "contanto que não mude" — a expressão não enxerga o antes e o depois ao mesmo
tempo. A política deixa o **autor** reenviar o próprio pedido; um gatilho devolve
`status` e `decided_at` quando quem escreve não decide. É exatamente o que a 0019 já
faz no insert, com a razão escrita lá: o payload vem de fora.

E o nome do gatilho é estrutural: o Postgres roda os `before` em ordem alfabética, e
`orders_decision_fields_stay_put` precisa vir antes de
`orders_leave_pending_only_by_approval`. Renomear qualquer um sem saber devolve o
defeito **sem nada ficar vermelho**.

A **checagem 9** do `db:verify` sobe a fila duas vezes pela capacidade mínima de um
papel real. Provei que ela morde tirando a migração: reprova com `new row violates
row-level security policy (USING expression) for table "orders"`.

**A regra que fica:** *quando uma família reaparece, procure a forma nova, não a
forma velha.* A frase que registra um conserto vira o gabarito da próxima busca — e
um gabarito é tão bom quanto o caso que o gerou. Aqui ele descrevia "ausência de
política" e o caso novo era "política com a capacidade errada".

## 4 de setembro — a guarda comparava a lista com ela mesma, e nove tabelas ficavam

**O que se viu.** `src/data/erase.test.ts` tinha um teste chamado *"erasing
everything reaches every table that holds business data"*. Ele percorria um `Record`
escrito à mão logo acima e conferia se cada chave estava em `tablesFor('all')`. O
`Record` tinha exatamente as doze entradas do union `ErasableTable`, e
`tablesFor('all')` devolvia essas mesmas doze.

A asserção era **"todo membro do conjunto fechado está na lista do conjunto
fechado"**. Uma tabela que não estivesse no union era invisível para o teste **por
construção** — não por esquecimento, por forma. O autor do mapa e o autor da lista
eram a mesma pessoa lembrando das mesmas doze tabelas, e o teste perguntava se ela
lembrava do que tinha acabado de escrever.

**O que isso escondia.** O aparelho tem 21 tabelas. Nove nunca eram apagadas, e
cinco delas apontam para `items` ou `locations` com `ON DELETE RESTRICT` — que são
justamente as duas que o "apagar tudo" apaga. Toda corrida de produção grava um
`lots`. Então **a partir da primeira corrida**, "Apagar tudo" levantava `FOREIGN KEY
constraint failed`, a transação voltava atrás, **nada** era apagado, e a tela
mostrava o texto cru do SQLite em inglês — num aplicativo que promete três idiomas,
e depois do toque em vez de o botão nascer desabilitado com o motivo.

E o vizinho: `tablesFor('purchases')` começa com `movements`, e o `DELETE` é por
empresa. Apagar "compras" apagava **todo movimento da fábrica** — produção,
contagem, perda, transferência — com a confirmação dizendo que zerava o custo médio.
Irreversível pelo texto da própria tela, e sem cópia no servidor.

**O que mudou.** A guarda passou a **ler** `src/data/db.ts`: as tabelas criadas e as
arestas de `RESTRICT`, inclusive as que entram por `ALTER` em migrações posteriores
(a grade do produto). É o mesmo conserto que o `db:verify` fez quando parou de rodar
como superusuário — perguntar ao sistema em vez de perguntar à lembrança de quem
escreveu o teste. E a lista de renúncias (`app_meta`, a gaveta do aparelho) pede
motivo escrito, com um segundo teste recusando renúncia de tabela que não existe
mais.

**E ela achou um alarme inventado logo na primeira execução**, o que vale registrar
porque é o outro lado da mesma moeda: cobrou de "apagar produtos" a regra do "apagar
tudo". Não vale — `blockerFor` recusa as áreas menores **antes** do toque, com o
número junto, que é a Lei 5. Só o `all` não tem rede (`erase.ts:176` devolve `null`),
e a premissa está presa no teste com contagens que bloqueariam qualquer outra área.

**A regra que fica:** *uma guarda que compara duas coisas escritas pela mesma mão não
guarda nada.* A pergunta certa para toda guarda é: **de onde vem o outro lado da
comparação?** Se a resposta é "do mesmo arquivo", o teste mede memória, não sistema.

## 4 de setembro — eu tomei uma decisão do dono e escrevi ela como se fosse regra do sistema

**O que se viu.** O dono abriu o aplicativo no celular e disse duas coisas: *"a
logo do apk tb está diferente"* e *"nao consigo mudar o tema papel de dark para o
light. o light tem q ser o padrão"*. As duas eram defeito, e as duas estavam na
fundação, não no código.

**O ícone era o andaime.** `assets/icon.png` nunca foi trocado desde 31 de agosto,
o dia em que o projeto nasceu: a seta azul da Expo, com as linhas-guia de
construção ainda desenhadas por cima. Todos os seis arquivos de `assets/` têm a
mesma data.

E o `src/config/brand.ts` promete, com todas as letras, que a marca é *"rendered
from this path on a 100x100 viewBox so every surface — splash, icon, header, print
— draws the exact same geometry"*. Era verdade em três superfícies e mentira na
quarta — e a quarta é **o quadradinho pelo qual o aplicativo é aberto**. A promessa
não estava errada por descuido de escrita: ela descrevia uma intenção que nunca
teve mecanismo. Sem um script que desenhe, "todas as superfícies saem do mesmo
caminho" é uma frase, não um fato.

**O tema é o achado grave, e ele é sobre mim.** O `ThemeProvider` lia
`useColorScheme()` e ponto: a luz da tela era do aparelho e de mais ninguém, sem
controle em tela nenhuma. Isso sozinho seria uma lacuna. O que torna outra coisa é
o que estava escrito ao lado, num comentário meu na tela de Ajustes:

> *"Claro e escuro continuam seguindo o aparelho, **como o sistema manda** — o que
> se escolhe aqui é a IDENTIDADE, que é outra pergunta."*

Não era o sistema mandando. **Era eu escolhendo**, e vestindo a escolha de regra
externa. O `CLAUDE.md` tem uma fundação inteira sobre isto: *"'Depende' vira dado,
nunca código — e nunca uma pergunta"*, e a explicação diz literalmente que quando a
resposta certa é "depende de quem usa", não se escolhe um dos lados. Claro contra
escuro é o caso central disso — o dono no escritório e o operador na câmara fria
podem querer coisas diferentes no mesmo dia, e nenhum dos dois está errado.

**Por que isso é pior que um bug.** Um bug alguém encontra. Uma decisão minha
escrita como regra do sistema **desencoraja a próxima pessoa de procurar**: quem
lesse aquele comentário concluiria que a plataforma impõe, e não voltaria a olhar.
O comentário não descrevia o código — ele defendia o código de ser questionado.

E a regra do projeto que eu invoco o tempo todo, "antes de chamar algo de defeito,
procure a decisão", tem um lado que eu não tinha visto: ela só funciona se as
decisões registradas forem **do dono**. Uma decisão minha no meio delas envenena a
busca inteira, porque tem exatamente a mesma cara.

**O que mudou.** Três caminhos — claro, escuro, seguir o aparelho — com o claro de
padrão, que é a única pergunta legítima e foi ele quem respondeu. A regra saiu do
componente para `src/theme/scheme.ts`, e isso não é arrumação: dentro do provider
só o navegador a alcançava, e o `mutate` roda a unidade — as duas mutações que a
protegem **teriam sobrevivido**, com o e2e verde dizendo que estava tudo bem. E
`scripts/icons.mjs` desenha as seis superfícies a partir do `markPath`, recusando o
que não entende.

**Duas coisas que quase entraram caladas no conserto**, e as duas são a mesma
doença do dia:

A medida de luminância do e2e **passava pelo motivo errado**. O React Native Web
põe uma chapa cinza fixa do tamanho exato da janela, e o `>` da busca pelo maior
elemento ficava com a primeira em ordem de documento — a fixa. A medida dava 0,95
nos dois temas: a asserção de "abre claro" media uma coisa que nunca muda. Empate
de área se resolve por quem pinta **por cima**.

E a checagem antiga da identidade, que existe desde a reescrita visual, só afirma
que o fundo *"existe"* — verdade de graça pelo mesmo motivo.

**A regra que fica:** *decisão de dono escrita por mim é a pior linha de comentário
que existe neste repositório.* Quando eu escolher um lado de um "depende", o
comentário tem que dizer **quem escolheu e que a outra opção não foi construída** —
nunca "como o sistema manda". Se a frase que eu ia escrever atribui a escolha a uma
força externa, ela é o sinal de que eu decidi sozinho.

## 4 de setembro — a tabela chamada "medido, não afirmado" envelheceu no dia em que foi escrita

**O que se viu.** O dono pediu um plano completo, e o `docs/roadmap.md` passou a
abrir com uma tabela sob o título *"onde o produto está hoje — **medido, não
afirmado**"*, com uma coluna **como conferir** trazendo o comando ao lado de cada
número. Escrita de manhã.

Antes do fim da tarde estava errada em quatro linhas: 26 migrações contra 27, 303
testes contra 309, 88 mutações contra 90, 8 garantias contra 9.

E a mesma coisa, pior, no `CLAUDE.md`: o bloco de comandos dizia *"Postgres
descartável, **oito** garantias"* depois de o `db:verify` ter passado a ter nove. Não
é seção histórica com data — é referência, no arquivo que **toda sessão lê
primeiro**. Quem começasse a próxima sessão acharia que a nona está sobrando.

**Por que passou, e é o ponto.** As duas tinham o antídoto escrito ao lado e ele não
funcionou. A tabela traz o comando de conferência linha a linha; o plano tem uma
regra dizendo que *"item novo entra com evidência de arquivo — sem isso é palpite, e
palpite em plano tem a mesma cara de fato"*. Nada disso impede o envelhecimento,
porque **comando escrito é convite, não garantia**: ninguém roda quinze comandos
antes de acreditar numa tabela. E o segundo lado da mesma frase é o que dói —
**tabela velha tem exatamente a mesma cara de tabela certa.**

O número do `db:verify` mora em três lugares e só **um** é fato: quantos blocos
`==> check N:` o script tem. A frase que ele imprime no fim e o comentário do
`CLAUDE.md` são alguém lembrando — e foi por lembrança que um ficou certo e o outro
não. Eu atualizei os dois no mesmo dia e errei um.

**O que mudou.** `src/bar.test.ts` passa a **ser aquela coluna, executada**: dez
linhas derivadas do sistema e comparadas com o que os documentos afirmam, com o
sistema mandando sempre. Inclusive a contagem de testes, que se deriva estaticamente
(toda chamada é `test(` no topo do arquivo) e bate exata com a runtime.

Provei que morde antes de acreditar nela — que é a regra que a própria suíte de
mutação existe para impor: com o número velho no `CLAUDE.md` ela reprova nomeando o
certo e o escrito; com uma décima checagem acrescentada ao script ela reprova em
**duas** asserções ao mesmo tempo, a frase final e o `CLAUDE.md`.

**A fronteira, escrita no arquivo:** ela confere o que foi **registrado**, não
descobre o que não foi. Uma linha nova na tabela sem entrada na guarda não quebra
nada. O que ela impede é o número registrado envelhecer — que é o que aconteceu duas
vezes num dia.

**A regra que fica:** *documentar a forma de conferir não é conferir.* Todo número
que um documento afirma sobre o sistema é um segundo autor da mesma verdade, e o
segundo autor sempre atrasa. Ou o número sai de uma derivação, ou ele tem uma guarda
— a terceira opção, que é confiar em quem escreveu, é a que produziu as duas
cicatrizes de hoje com o antídoto escrito ao lado.

## 4 de setembro — o portão de mutação estava verde por construção, e ninguém tinha como notar

**O que se viu.** Uma auditoria de dez frentes achou isto, e é o achado mais grave
do dia: **`npm run mutate` declarava toda mutação "pega" sem nunca ter consultado a
suíte.** Desde 3 de setembro. Sessenta e seis commits.

O mecanismo é de uma linha. O `mutate` copia o projeto para uma oficina e roda a
suíte lá; `suitePasses(dir)` devolve verdadeiro se a saída contém `# fail 0`, e
`pego = !suitePasses(dir)`. A lista do que copiar era de **inclusão**:

```js
const COPIAR = ['src', 'scripts', 'package.json', 'tsconfig.json'];
```

Escrita em 3 de setembro, quando os testes só liam `src/`. Depois disso a suíte
ganhou guardas que leem o repositório: o dicionário varre `app/`, os seletores leem
`e2e/flow.mjs`, o acordo lê `supabase/migrations`, e hoje a tabela passou a ler
`CLAUDE.md` e `docs/roadmap.md`. Na oficina esses arquivos não existiam, então esses
testes morriam no carregamento com `ENOENT`.

Medi: **a suíte da oficina saía com `# fail 19` sem mutação nenhuma.** Logo
`suitePasses` era falso sempre, `pego` era verdadeiro sempre, e o relatório dizia
"os 90 defeitos foram pegos" sem que um único deles tivesse sido julgado.

**Por que era invisível.** Não é um teste vermelho que alguém ignorou — é um portão
que só sabe dizer sim. O CI roda `npm run mutate`, o `push-guard` exige veredito
fresco, e os dois concordavam. Cada vez que a suíte ganhava um guard novo que lia o
repositório, o portão ficava um pouco mais cego, e a única evidência disso era um
relatório cada vez mais bonito.

E é o inverso exato do que o `mutate` existe para dizer. Ele nasceu porque *"suíte
verde não quer dizer regra protegida"*. Ele virou a coisa que ele denuncia.

**O que estava escondido.** Com a oficina consertada, **seis mutações sobreviveram**
— quatro buracos reais e dois mutantes equivalentes:

1. `blendRate` (`src/domain/cost.ts`) trocada por `return arriving.rate` passava: a
   média móvel do produto fabricado não tinha um único teste com estoque em mãos. Os
   que a citavam passavam pelo caso em que ela é a identidade. Na fábrica: o estoque
   antigo passa a valer o preço da corrida de hoje.
2. A contagem de movimentos na confirmação de apagar compras — **escrita por mim
   hoje de manhã**, com a fixação do teste trazendo `movements: 0`. Zero faz a
   asserção passar com ou sem o campo. Vazia, de novo.
3. A corrida aberta gravando `product.recipeId` na coluna da versão. O teste existia
   e conferia o **objeto devolvido**, não a linha gravada — e a mutação trocava só o
   parâmetro do `INSERT`. Afirmar o que a função diz ter feito, não o que ela
   escreveu.
4. O `NAO_ESTORNADO` sumindo da consulta de "produzido no período": o almoxarifado
   fica certo e a capa continua dizendo que a fábrica produziu o que foi desfeito. É
   textualmente a cicatriz de 3 de setembro — *"teste unitário prova a escrita, só o
   aplicativo dirigido prova a leitura"* — e ela reapareceu porque o portão que
   deveria pegá-la estava cego.

**O que mudou.** A lista virou de **exclusão** (`node_modules`, `.git`, `dist`,
`.expo`, `.shots`, `android`, `.mutate`), então um teste novo que leia um arquivo
novo continua funcionando sem ninguém lembrar de nada. E a oficina **prova que serve
antes de julgar**: roda a suíte sem mutação e aborta com a lista de falhas se ela
não passar. Sem isso, oficina quebrada e suíte perfeita são indistinguíveis — as
duas fazem `suitePasses` devolver falso.

Os quatro buracos ganharam teste. Os dois equivalentes ganharam marcador com motivo
escrito: o estorno tem duas checagens em camadas, tirar uma deixa a outra pegando, e
só concorrência real as separaria. O marcador não é escapatória — se a mutação
**for** pega, ele vira erro, senão a lista apodrece guardando desculpa para buraco já
fechado.

**A regra que fica:** *toda ferramenta de verificação precisa de uma verificação de
si mesma, e ela tem que rodar antes do veredito, não depois.* A pergunta é sempre a
mesma: **como este instrumento se pareceria se estivesse quebrado?** Aqui a resposta
era "exatamente como um instrumento perfeito" — e essa resposta é o próprio defeito.

É também a terceira forma da mesma doença num dia: lista escrita à mão que envelhece
longe de quem a usa. `erase.ts` conhecia 12 de 21 tabelas; a tabela do plano
envelheceu no dia em que nasceu; e aqui uma lista de quatro pastas decidia, sem
saber, se o portão inteiro perguntava alguma coisa.

## 4 de setembro — `import()` não é checagem de sintaxe, e o que eu deixei rodando por oito horas

**O que se viu.** Investigando por que a auditoria estava tão lenta, listei os
processos da máquina e achei restos meus com **oito e nove horas de idade**: um
`node -e "import('./scripts/mutate.mjs')"` órfão (`ppid 1`), o trabalhador de
mutação que ele tinha aberto, o trabalhador de uma execução anterior, e um laço
`until grep` de espera.

Eu tinha escrito aquele `node -e import(...)` como **checagem de sintaxe**, depois de
editar o `mutate.mjs` com um script. `import()` de um módulo com efeito de topo
**executa o módulo** — então a checagem de sintaxe disparou a suíte de mutação
inteira. E o `&` no fim do comando a órfãou: `ppid 1`, fora de qualquer árvore de
processo que eu fosse olhar depois.

**O custo, medido.** Quatro núcleos nesta máquina. O limite de concorrência de um
workflow é `min(16, núcleos − 2)` = **2**, e esses restos disputavam os mesmos
núcleos. A auditoria de dez frentes levou duas horas para a primeira fase; o `e2e`
saiu `17/17 com 2 fatias vermelhas` numa execução, que eu diagnostiquei como disputa
com o `mutate` que eu mesmo tinha acabado de rodar — verdade parcial, e não a causa.
A causa estava rodando desde a manhã.

**Provado nos dois sentidos**, porque a diferença é a coisa toda:

```
$ node -e "import('./efeito.mjs')"
EU RODEI — e isto devia ser só uma checagem de sintaxe

$ node --check efeito.mjs
(silêncio — sintaxe boa, e nada rodou)
```

**O que mudou.** Regra nova na seção de operação do `CLAUDE.md`, ao lado da que
proíbe matar processo por padrão — que é a irmã dela, e foi a que me deu o caminho
seguro para limpar: parar **pelo PID que eu mesmo anotei**, conferindo antes a
paternidade de cada um para não derrubar a execução em vôo.

**A regra que fica:** *a maneira de verificar uma coisa não pode ser fazer a coisa.*
`import()` para checar sintaxe é a mesma forma do erro que dominou o dia — a oficina
do `mutate` que declarava "pego" sem consultar a suíte, a tabela que se conferia
contra a própria memória, a guarda que comparava uma lista com ela mesma. Aqui a
verificação **era** a execução, então ela não podia falhar em dizer "está bom": ela
simplesmente ia.

E a segunda metade: **o que roda em segundo plano tem que ficar numa árvore que eu
consiga olhar.** `&` num comando de sessão entrega o processo ao init, e a partir daí
ele não aparece em nenhum lugar que eu vá procurar por hábito.

## 4 de setembro — o docblock descrevia o defeito, e a tela o cometeu de qualquer jeito

`recordCount` exige `locationId` sem padrão, e a razão está escrita na assinatura
dela desde que ela nasceu:

> *"With a default, counting the cold room without saying so would compare against
> the company's whole balance and write the difference into the cold room — stock
> teleported between rooms by an operator who did everything right."*

`app/inputs/[id].tsx` mostrava `findItem(LOCAL_COMPANY_ID, id)` — sem sala, portanto
o total da empresa — e gravava `locationId: defaultLocationId(LOCAL_COMPANY_ID)`. As
duas linhas ficavam a 130 linhas de distância uma da outra, cada uma correta sozinha.
Juntas eram exatamente o parágrafo acima, com o sinal trocado: com 44.000 g na
fábrica e 6.000 na câmara, quem abrisse o item pelo filtro da câmara, contasse a
prateleira e digitasse 6.000 gravava **−38.000 contra a fábrica**. Trinta e oito
quilos apagados de uma prateleira que ninguém tinha olhado — e contagem não se
apaga, se estorna.

**A regra que fica: docblock não é guarda.** A prevenção morava na prosa ao lado do
parâmetro, e o parâmetro aceitava `defaultLocationId(...)` com um sorriso. É a mesma
lição da capa deste projeto — *conselho eu esqueço na próxima sessão; guard roda
sozinho* — aplicada a um lugar onde eu tinha achado que a exigência do tipo bastava.
Exigir o campo garante que alguém responda *onde*; não garante que a resposta seja o
lugar cujo número está na tela.

**O que mudou.** A tela passa a sala pela rota (`app/inputs/index.tsx`), `findItem` e
`itemMovements` aceitam a sala, e a contagem grava onde ela leu. Com o item em mais de
um lugar e nenhum escolhido, a contagem **não é oferecida**: a tela lista os lugares
com o saldo de cada um e cada linha leva à contagem daquele lugar — erro que impede,
com a saída à vista. A guarda nova em `src/layers.test.ts` reprova qualquer tela que
ponha chamada de função no local de uma contagem, porque o defeito não está em função
nenhuma: está na combinação de duas linhas distantes dentro de uma tela, que é
justamente o que teste de unidade não vê.

## 4 de setembro — o mundo do dublê não fechava, e era isso que deixava a mentira passar

Ao consertar a contagem falada, o teste do assistente ficou vermelho — e por um
motivo melhor que o meu conserto. O dublê dizia que a empresa tem **50.000 g** de
açúcar (`ITEMS`) e, ao mesmo tempo, que ele está **50.000 na fábrica mais 6.000 na
loja** (`PLACE_STOCK`). Os dois números saem da mesma soma no sistema de verdade:
`listItems` sem local é `stockByPlace` somado. O dublê descrevia um mundo impossível.

E não era detalhe de arrumação. **Num mundo em que a soma dos lugares não é o total, a
diferença entre "o total da empresa" e "a prateleira desta sala" não tem como ser
observada** — é ruído do fixture, não sintoma. Foi por isso que a contagem falada
comparava o total com uma prateleira e trinta e quatro testes ficaram verdes: o teste
não tinha como notar a diferença entre as duas coisas porque no mundo dele elas já
eram inconsistentes por construção.

**A regra que fica: o dublê tem que satisfazer as invariantes que o sistema impõe.**
Não é purismo — é o que decide se o teste pode enxergar a violação. Um fixture que
quebra uma invariante é um lugar onde essa invariante não pode ser testada, e um
teste verde ali afirma menos do que parece.

**O que mudou.** `PLACE_STOCK` passou a fechar (44.000 + 6.000 = 50.000), e duas
asserções mudaram junto — as duas para números mais certos: "o que tem na fábrica"
agora diz 44.000, e o recusão de carga diz "tem só 44.000 na fábrica". Elas afirmavam
o total da empresa achando que afirmavam o da sala. E um teste novo cobre o caso que
não existia: item em duas salas não é contado por voz, é localizado.

## 4 de setembro — a decisão estava certa e o número estava errado: era o plural

A conta de quanto dá para prometer (`stockAgainstOrders`) tinha uma decisão escrita
no docblock, e ela é boa: *"o saldo lido é o do LUGAR de onde a carga sai, não o da
empresa — mil picolés espalhados em quatro lojas não atendem o cliente que pediu mil
na fábrica"*. Achei a decisão antes de chamar aquilo de defeito, como a capa manda.
A decisão está certa. **O defeito era o singular**: a consulta lia
`defaultLocationId`, um lugar só.

Numa fábrica de picolés o produto vai para a câmara fria no dia seguinte ao de
produzir. Então a conta dizia "não há nada para prometer" **com o freezer cheio** — e
a tela de anotar pedido, que usa essa conta para avisar excesso, ficava muda
justamente quando a conta decide se um pedido pode ser aceito.

**A regra que fica: procurar a decisão não é o fim da busca, é o começo.** Achar a
decisão escrita responde *"isto é intencional?"* e não responde *"isto continua
verdade?"*. Aquela frase foi escrita quando existia um lugar só, e naquele mundo
"o lugar de onde a carga sai" e "o lugar padrão" eram sinônimos. A câmara fria
desfez o sinônimo e a frase continuou lendo igual — decisão certa, implementação
envelhecida, e nada no texto avisando.

O que dá para procurar por isso, e é o que eu vou procurar de agora em diante:
**decisão escrita no singular sobre coisa que passou a existir no plural.**
`ensureLocation` cria um lugar cujo id é o `company_id` — todo lugar do código que
usa esse id como se fosse "a fábrica" é candidato. Foram três hoje: o aviso de
validade, a contagem, e esta.

**O que mudou.** A consulta soma todas as salas nossas, e a régua de quais são
nossas saiu de três grafias para uma: `INTERNAL_PLACE_KINDS` e `receivesCargo` em
`src/domain/ledger.ts`, lidas pelas duas telas que separavam sala de destino à mão.
O SQL não importa constante, então uma guarda em `src/layers.test.ts` lê os dois
lados e compara — divergir ali é prometer mercadoria que está numa loja.

## 4 de setembro — três telas liam a empresa e escreviam numa sala, e o padrão tem nome

Terceiro achado do dia com a mesma forma, e o terceiro foi encontrado **procurando
pela forma**, não esbarrando nela. A frase que a busca usou está escrita no insight
anterior: *decisão escrita no singular sobre coisa que passou a existir no plural*.

As três, na ordem em que caíram:

| tela | mostrava | escrevia | o que acontecia |
|---|---|---|---|
| contagem do insumo | total da empresa | almoxarifado | −38.000 g na fábrica por contar a câmara |
| conta de prometer | — | — | "nada para prometer" com o freezer cheio |
| produção | total da empresa | almoxarifado | toda corrida recusada, em inglês |

**O que elas têm em comum não é o bug, é a origem.** `ensureLocation` cria um lugar
cujo id É o `company_id` — decisão boa e documentada, porque foi assim que todo
movimento já gravado foi carimbado. O efeito colateral é que, enquanto houve um lugar
só, "o total da empresa" e "a sala padrão" foram **o mesmo número**, e nenhum teste
podia distinguir uma leitura da outra. Os dois sentidos moram no mesmo id, então o
código que confundiu os dois não tinha como se delatar.

**A regra que fica: id que significa duas coisas é dívida com data de vencimento.** O
vencimento chega no dia em que o segundo lugar é cadastrado — e ele chega em silêncio,
porque o dia em que o dono cria a câmara fria não é um dia de commit. A busca por
"quem usa `company_id` como se fosse o lugar" achou três em uma tarde e é para ser
repetida a cada vez que uma coluna dessas ganhar um segundo valor possível.

**O que mudou.** As três consertadas, cada uma com o guarda da sua forma: duas de
fonte em `src/layers.test.ts` (a contagem, e o piso da produção) e uma comparação de
listas (o SQL contra `INTERNAL_PLACE_KINDS`). Guarda de fonte porque nas três o
defeito não estava em função nenhuma: estava em duas leituras diferentes da mesma
pergunta dentro de uma tela, que é o único lugar onde teste de unidade é cego por
construção.

E uma coisa que **não** consertei, dita em vez de omitida: a produção agora impede e
diz onde o insumo está, mas trazer a polpa da câmara para o almoxarifado não tem como
ser registrado — a tela de transferir sai sempre da fábrica, e o caminho de volta
grava `return`, que é notícia sobre a loja. Isso é decisão de dono sobre a F2, com as
duas formas escritas em `docs/roadmap.md`.

## 4 de setembro — o serializador que ninguém chama, e a severidade que caiu com isso

O achado 8 da auditoria dizia que apagar uma área menor **trava a fila para sempre**.
Fui consertar e, antes de escrever a varredura, procurei quem levanta a exceção:
`serialize` (`src/sync/serialize.ts:398`) é o único lugar que diz *"the row is gone
from the device"*. **`serialize` não tem chamador de produção** — só testes. O motor
recebe o transporte injetado (`engine.ts:76`) e nenhum transporte existe ainda.

Então a frase "trava a fila para sempre" é futuro, não presente. O que existe hoje é
a fila crescendo com entradas que nunca poderão subir, e a tela de Ajustes contando
essas entradas como "esperando" — um número que não vai baixar nunca. A mina fica
armada para o dia em que o transporte existir, e é aí que ela explode: no dia do
primeiro cliente de verdade.

**A regra que fica: severidade se confere no chamador, não no arquivo do defeito.**
Eu ia escrever "crítica, trava a fila" no commit. A verificação levou um `grep` e
mudou a frase — e mudar a frase é o trabalho: a auditoria é lida pelo dono, que decide
o que entra em produção com base nessa palavra. Achado real com severidade inflada
gasta a confiança dele do mesmo jeito que alerta inventado.

**E é o quarto P1 do dia**: `balanceByLocation` sem chamador (agora tem), `serialize`
sem chamador (segue sem), `item_costs`/`item_cost_history` com ramo dedicado no
serializador e nenhum `enqueue` que os produza, e `forgetSentBefore` só chamada por
teste — este último já estava listado nos médios da auditoria. O portão P1 do
`CLAUDE.md` existe justamente para isso, e ele só vale para código NOVO: quatro casos
antigos seguem de pé, e nenhum número de fase os pegou.

**O que mudou.** `forgetOrphans` em `src/data/outbox.ts`, chamada dentro da transação
de apagar, com a lista de tabelas da fila conferida contra todo `enqueue` do
repositório **e** contra o esquema — as duas formas de errar que não aparecem em tempo
de compilação. E a auditoria ganhou a correção, escrita nela: o que era "trava" é
"vai travar".

## 4 de setembro — a terceira vez que "não terminou" virou "pegou", e o que isso diz do instrumento

**O que se viu.** A bateria de mutação acusou `MARCADOR ERRADO` num marcador de
equivalência que está certo. Antes de tirar o marcador — que é o que a mensagem
manda fazer — apliquei as duas mutações marcadas à mão e rodei a suíte inteira: as
328 passam nas duas. O marcador estava certo; o relatório estava errado.

A causa, uma linha: `suitePasses` era `return stdout.includes('# fail 0')`. Toda
execução que **não imprime resumo** cai no lado do "falhou", e "falhou" quer dizer
"pegou". Eu estava rodando `npm test` em paralelo com a bateria numa máquina de
quatro núcleos com quatro frentes de mutação; uma execução não terminou; virou
proteção.

**É a terceira aparição da mesma forma neste mesmo arquivo.** A primeira: a oficina
não copiava as pastas que os testes leem, a suíte morria lá com 19 falhas antes de
qualquer mutação, e o portão ficou verde por construção durante 66 commits. A
segunda: a oficina declarando "pego" sem consultar a suíte. Esta é a terceira, e a
mais estreita — mas a forma é idêntica, e a forma é o achado:

**A regra que fica: instrumento que só distingue dois estados chama ausência de
medida de resultado favorável.** "Passou" e "não passou" parecem exaustivos e não
são: falta "não mediu". E o default silencioso cai sempre para o lado que agrada —
num portão de mutação, "pegou"; num de permissão, "autorizado"; numa checagem de
saldo, "tem". Onde há três estados e o código lê dois, o terceiro vira o que quem
escreveu esperava ver.

**A segunda metade, que é minha.** Eu criei a contenção que produziu o falso alarme
rodando a suíte enquanto a bateria rodava — e a regra do `CLAUDE.md` sobre não ficar
ocioso diz para tocar o que **não depende** do que está rodando. Rodar a suíte
enquanto a bateria roda a suíte 98 vezes não é trabalhar em paralelo: é disputar a
própria medida. O que dá para fazer enquanto a barra roda é documento e leitura, e
nada que peça CPU.

**O que mudou.** Três resultados em vez de dois (`lerSuite`), segunda chance só para
o que não terminou — medida que não houve é barata de repetir, resultado que houve
não se repete até gostar dele —, reprovação como `NÃO MEDIDO` se persistir, e a
régua conferida com quatro casos sintéticos antes de qualquer medida, para não se
perder de novo em silêncio.

## 4 de setembro — a tela lia vinte lançamentos para usar a data de um

Ao dar grupo à compra, à contagem e à perda, precisei da lista de lançamentos na
tela do insumo — e ela **já estava lá**. `app/inputs/[id].tsx` chamava
`itemMovements(...)` (vinte linhas, com tipo, quantidade, custo congelado e data) e
usava exatamente uma coisa: a data do último ajuste, para escrever "conferido em
3/9". As outras dezenove linhas eram lidas do banco, montadas em objeto, guardadas
no estado, e descartadas na renderização.

**É o P1 pelo avesso.** O portão deste projeto pergunta *"quem chama isto no mesmo
commit?"* e pega o export sem chamador — `balanceAt`, `daysOfCover`,
`assistant_phrase` com índice e nenhuma escrita. Este é o outro lado da mesma
doença: **o chamador sem uso**. Ninguém o pega, porque o código *parece*
justificado — tem chamador, roda, e o dado até aparece na tela (uma data). O que
não existe é a razão de ler vinte.

E o custo não é a consulta: é que a informação estava a um `map` de distância da
tela e ninguém a via. A fundação mais forte do projeto — corrige-se por estorno,
nunca por exclusão — estava sem porta para três dos sete caminhos de escrita
justamente na tela que já tinha a lista dos três na mão.

**A regra que fica: dado lido e não mostrado é pergunta, não sobra.** Ou a tela
devia mostrar (e é uma dívida de interface), ou não devia ler (e é uma consulta a
menos). As duas saídas são baratas; ficar no meio é o único jeito de pagar as duas.
Onde procurar mais deles: `useQuery` que devolve lista e `.find(...)` uma vez só.

**O que mudou.** O cartão "Últimos lançamentos" mostra os oito últimos, cada um
com o que é em uma palavra (`t.movement`, dicionário novo nos três idiomas), e
desfazer no toque — com a conta aberta antes de escrever, o que volta e o que sai,
e a recusa explicando o caminho quando não cabe. A compra passa a carregar a NOTA
como grupo (não a linha: no dia em que uma nota tiver duas linhas, o grupo por
linha desfaria metade dela), e a contagem e a perda carregam a própria linha.

## 4 de setembro — a cegueira era do cartão, e tinha de ser da tela

A contagem deste aplicativo é cega de propósito: enquanto ela está aberta, o saldo
esperado sai da tela, porque quem vê o número confere a tela em vez da prateleira — e
uma cópia não se distingue de uma contagem de verdade um mês depois. Isso estava
implementado, testado, e escrito no comentário do cartão.

Acrescentei o cartão "Últimos lançamentos" logo abaixo, e o `e2e` reprovou na
primeira execução: *"the expected quantity was still visible while counting"*. A
linha `Compra +50.000 g` de uma compra recente **é** o número esperado, escrito de
outro jeito. Nenhum teste de unidade podia ver isso: cada cartão está correto
sozinho, e a regra é sobre a soma dos dois.

**A regra que fica: invariante de tela não se guarda dentro de um componente.** O
cartão da contagem escondia o próprio número e não tinha como saber do vizinho que
nasceu depois — e o vizinho não tinha como saber que existe uma regra a respeitar. O
que protege é a checagem que olha a TELA INTEIRA, e é por isso que o `e2e` deste
projeto lê `document.body.innerText` em vez de consultar componentes.

E vale como aviso sobre o custo de crescer telas: **todo cartão novo numa tela com
regra de visibilidade é uma chance de quebrá-la em silêncio**. Aqui não foi
silencioso porque a checagem existia desde antes — ela foi escrita quando a contagem
cega foi construída, e cobrou a conta hoje, de uma mudança que nem existia então.

**O que mudou.** O cartão de lançamentos desaparece enquanto a contagem está aberta,
pela mesma razão que o saldo desaparece, e o comentário diz isso onde a próxima
pessoa vai ler.

## 4 de setembro — o número da auditoria era o do extremo, e a régua não existia

O achado 10 dizia: *"o tom `inkFaint` dá 2,55:1 nas quatro combinações de tema"*.
Fui medir antes de mexer, e as duas metades da frase estavam erradas de um jeito que
importa: são **seis** paletas (duas do tema base, duas do Papel, duas do Orgânico), e
2,55 é o **pior caso** — a faixa real era 2,35 a 4,43. O achado está certo (nenhuma
das seis passa a régua da WCAG); o número era o do extremo apresentado como o de
todas.

**O que fez a diferença não foi olhar melhor: foi escrever a régua primeiro.** Eu
escrevi `src/theme/contrast.test.ts` antes de trocar uma cor, deixei falhar, e a
falha imprimiu as dezoito combinações com o valor de cada uma. Aí a correção deixou
de ser gosto — para cada paleta, escureça (ou clareie) mantendo o matiz até o pior
fundo passar de 4,6.

**A regra que fica: número em achado é medida ou é lembrança, e as duas se parecem no
texto.** Um relatório escrito por dez auditores em paralelo tem números que ninguém
recontou, e o meu papel ao consertar é medir de novo — não porque o achado seja
suspeito, mas porque **a régua que mede é a mesma coisa que a guarda que protege**.
Escrever a medição como teste dá as duas de uma vez, e é mais barato que conferir à
mão uma vez.

Duas coisas que a régua pegou de graça, e que eu não tinha pensado:

- **`const palettes = { light, dark }` entrou na varredura** como se fosse uma paleta,
  e o corpo dela engoliu a paleta escrita abaixo — o teste media a mesma coisa duas
  vezes com o nome errado. Bloco que contém outra declaração não fechou onde eu
  pensei: passou a ser recusado.
- **Legível pode virar "tudo igual".** Subir `inkFaint` até encostar em `inkMuted`
  apagaria a hierarquia de três camadas de tinta, e a tela ficaria plana. A guarda
  afirma as duas coisas: a régua e a ordem.

**O que mudou.** As seis paletas em `src/theme/tokens.ts`, o docblock que diz por quê,
a guarda que lê as cores do próprio arquivo, e uma mutação que devolve a tinta velha.

## 4 de setembro — o fuso chumbado que a auditoria não viu, achado por consertar outra coisa

O achado 11 era sobre idioma: três dicionários completos e nenhum caminho até dois
deles. Ao construir o caminho, `LocaleSettings` cobrou as outras duas peças que moram
no mesmo objeto — moeda e **fuso**. E o fuso estava chumbado em `America/Sao_Paulo`.

Isso não é enfeite: `localDate(nowIso(), locale.timeZone)` é o que decide a que **dia**
pertence um tacho fechado às 22h, e essa data vai **impressa na etiqueta do lote**. Uma
fábrica em Manaus (uma hora atrás de São Paulo) lançava o tacho das 23h como produção
do dia seguinte, todos os dias, com o papel na caixa dizendo o dia errado. Dez
auditores não viram, eu não vi ao ler o achado, e ele apareceu porque **o conserto de
um pediu o objeto inteiro**.

**A regra que fica: o tipo é uma lista de perguntas, e consertar um campo dele obriga a
olhar os vizinhos.** `LocaleSettings` tem quatro campos; o achado falava de um; dois
estavam errados. Um objeto de configuração com um campo chumbado costuma ter mais de
um — quem chumbou o primeiro estava com pressa, e a pressa não escolhe um campo só.

E a segunda metade, que é sobre a auditoria: **ela olhou o que o dicionário promete e
não olhou o que o `defaultLocale` entrega.** As duas coisas estão a uma linha de
distância no mesmo arquivo. Auditoria por eixo (idioma, dinheiro, sincronização) corta
o código em fatias que não são as fatias do defeito.

## 4 de setembro — o `pkill` matou meu próprio comando, de novo

O `CLAUDE.md` diz: *nunca mate processo por padrão; se precisar parar algo, pare pelo
PID que você mesmo anotou*. Eu escrevi `pkill -f "serve -s dist -l 4179"` para derrubar
um servidor de teste — e o padrão casou com **o próprio comando do shell**, que continha
aquela string. O shell morreu no meio, e o `node` que vinha depois (a reescrita de uma
checagem do e2e) nunca rodou. Eu só descobri porque conferi o arquivo depois e ele
estava intacto: o comando "terminou" com um código de saída estranho e nenhuma mensagem.

Segunda aparição na história deste projeto, com a regra já escrita. A primeira matou uma
verificação em vôo; esta matou a mão que a escrevia.

**A regra que fica: `pkill -f` procura no que EU acabei de escrever.** A linha de comando
do próprio shell é um processo com aquele texto dentro, então todo padrão amplo se
inclui. Se for para parar por padrão, o padrão tem de excluir o próprio PID (`pgrep -f
… | grep -v $$`) — e a saída barata continua sendo a da regra: anotar o PID quando
inicio, e parar por ele.

## 4 de setembro — a quinta aparição, e a primeira achada procurando a família

Quatro migrações deste repositório consertam o mesmo defeito: tabela que a fila do
aparelho envia com `on conflict (id) do update` e que não tem política de update no
servidor. A 0015 (compras), a 0020 (lotes), a 0027 (pedidos — política existia, com a
capacidade errada), a 0030 (o lugar padrão). Cada uma foi encontrada por esbarrão: um
CI vermelho, uma auditoria, uma queixa.

Hoje, indo consertar o `recorded_by` do pedido, listei **todas** as tabelas com
`recorded_by` e **todas** as políticas de update do esquema, em duas linhas de `grep`.
`readings` apareceu com política de leitura, política de insert, e nada mais.

**E é a pior das cinco.** A leitura da câmara é a escrita com maior chance de subir
duas vezes em todo o aplicativo: ela é anotada dentro da câmara fria, a −18 °C, onde o
sinal não chega — o app foi desenhado inteiro em volta disso. A escrita mais propensa a
reenvio era a única sem direito a reenviar, e o motor para a fila no primeiro buraco de
propósito: tudo o que a fábrica gravasse depois ficava preso atrás de uma leitura de
temperatura.

**Por que a barra não pegou:** a checagem 9 — a que sobe a fila duas vezes pela
capacidade mínima de cada papel — replica **um `orders`, e só**. A checagem existia, a
forma do defeito era conhecida, e a cobertura era de uma tabela.

**A regra que fica: erro que apareceu quatro vezes não se conserta na quinta — se
varre.** O custo de listar a família inteira foi de dois `grep`; o de esperar a quinta
aparição foi quatro migrações e uma auditoria. Quando um defeito volta com cara nova,
a pergunta deixa de ser "onde está este?" e passa a ser **"qual é a lista completa de
lugares onde ele caberia, e o que prova que cada um está coberto?"**

**O que mudou.** A 0031 dá a `readings` política de reenvio e um gatilho que congela o
que foi visto; a 0032 congela `recorded_by` do pedido para todos, inclusive quem
aprova. Duas checagens novas no `db:verify` (12 e 13), as duas escritas **antes** das
migrações e vistas reprovando: a 12 com `new row violates row-level security policy`, a
13 com o autor do pedido trocado por outro id.
